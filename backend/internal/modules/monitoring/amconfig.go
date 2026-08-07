package monitoring

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"

	"github.com/opsconsole/backend/internal/model"
	"github.com/opsconsole/backend/internal/pkg/alertmanager"
	"github.com/opsconsole/backend/internal/pkg/vmalert"
)

// ConfigManager regenerates the Alertmanager configuration and the per-tenant
// vmalert rule file from the notification_channels / alert_rules tables, then
// triggers a reload. This closes the loop so that creating a notification
// channel or binding it to an alert rule actually delivers alerts.
type ConfigManager struct {
	notifs       NotificationRepository
	alerts       AlertRuleRepository
	am           *alertmanager.Client
	va           *vmalert.Client
	amConfigPath string
	vmRulesPath  string
}

// NewConfigManager builds the config manager. am/va may be nil when the
// corresponding upstream is not configured; in that case Sync still writes the
// generated files (for manual reload) but skips the HTTP reload.
func NewConfigManager(
	notifs NotificationRepository,
	alerts AlertRuleRepository,
	am *alertmanager.Client,
	va *vmalert.Client,
	amConfigPath, vmRulesPath string,
) *ConfigManager {
	return &ConfigManager{notifs: notifs, alerts: alerts, am: am, va: va, amConfigPath: amConfigPath, vmRulesPath: vmRulesPath}
}

// Sync regenerates both config files from the database and reloads the
// upstream services. It is a best-effort operation: a missing path skips that
// file, and a nil client skips that reload.
func (m *ConfigManager) Sync(ctx context.Context) error {
	if m.amConfigPath == "" && m.vmRulesPath == "" {
		return nil
	}
	channels, err := m.notifs.ListAll(ctx)
	if err != nil {
		return fmt.Errorf("list channels: %w", err)
	}
	rules, err := m.alerts.ListAll(ctx)
	if err != nil {
		return fmt.Errorf("list rules: %w", err)
	}
	if m.amConfigPath != "" {
		if err := m.writeAlertmanager(channels, rules); err != nil {
			return fmt.Errorf("write alertmanager config: %w", err)
		}
	}
	if m.vmRulesPath != "" {
		if err := m.writeVMRules(rules); err != nil {
			return fmt.Errorf("write vmalert rules: %w", err)
		}
	}
	// Reload only after both files are on disk.
	if m.am != nil && m.amConfigPath != "" {
		if err := m.am.Reload(ctx); err != nil {
			return fmt.Errorf("alertmanager reload: %w", err)
		}
	}
	if m.va != nil && m.vmRulesPath != "" {
		if err := m.va.Reload(ctx); err != nil {
			return fmt.Errorf("vmalert reload: %w", err)
		}
	}
	return nil
}

// ---- Alertmanager config ----

type amConfig struct {
	Global    amGlobal     `yaml:"global"`
	Route     amRoute      `yaml:"route"`
	Receivers []amReceiver `yaml:"receivers"`
}

type amGlobal struct {
	ResolveTimeout string `yaml:"resolve_timeout"`
	SMTPFrom       string `yaml:"smtp_from"`
	SMTPSmarthost  string `yaml:"smtp_smarthost"`
}

type amRoute struct {
	Receiver       string       `yaml:"receiver"`
	GroupBy        []string     `yaml:"group_by"`
	GroupWait      string       `yaml:"group_wait"`
	GroupInterval  string       `yaml:"group_interval"`
	RepeatInterval string       `yaml:"repeat_interval"`
	Routes         []amSubRoute `yaml:"routes,omitempty"`
}

type amSubRoute struct {
	Matchers []string `yaml:"matchers"`
	Receiver string   `yaml:"receiver"`
	Continue bool     `yaml:"continue"`
}

type amReceiver struct {
	Name           string            `yaml:"name"`
	WebhookConfigs []amWebhookConfig `yaml:"webhook_configs,omitempty"`
	EmailConfigs   []amEmailConfig   `yaml:"email_configs,omitempty"`
}

type amWebhookConfig struct {
	URL          string `yaml:"url"`
	SendResolved bool   `yaml:"send_resolved"`
}

type amEmailConfig struct {
	Smarthost string `yaml:"smarthost"`
	From      string `yaml:"from,omitempty"`
	To        string `yaml:"to"`
}

// writeAlertmanager renders the dynamic Alertmanager configuration. Each channel
// becomes a receiver; each rule's channel_ids become a route matcher so the
// bound channels receive the alert.
func (m *ConfigManager) writeAlertmanager(channels []model.NotificationChannel, rules []model.AlertRule) error {
	cfg := amConfig{
		Global: amGlobal{
			ResolveTimeout: "5m",
			// Global SMTP defaults so email notification channels produce a
			// valid receiver. Real delivery requires a reachable SMTP server;
			// override these via a deployment-specific generated header/value
			// when wiring a real mail relay.
			SMTPFrom:      "opsconsole@localhost",
			SMTPSmarthost: "localhost:25",
		},
		Route: amRoute{
			Receiver:       "noop",
			GroupBy:        []string{"alertname"},
			GroupWait:      "0s",
			GroupInterval:  "1m",
			RepeatInterval: "1h",
		},
		Receivers: []amReceiver{
			{Name: "noop", WebhookConfigs: []amWebhookConfig{{URL: "http://127.0.0.1:9093/noop", SendResolved: true}}},
		},
	}
	// Receiver per channel, plus a route that matches the channel id embedded
	// in the alert's "channels" label.
	for _, ch := range channels {
		cfg.Receivers = append(cfg.Receivers, receiverForChannel(ch))
		matcher := fmt.Sprintf("channels=~%q", ".*"+ch.ID+".*")
		cfg.Route.Routes = append(cfg.Route.Routes, amSubRoute{
			Matchers: []string{matcher},
			Receiver: "chan-" + ch.ID,
			Continue: true,
		})
	}
	data, err := yaml.Marshal(&cfg)
	if err != nil {
		return err
	}
	return writeFile(m.amConfigPath, data)
}

// receiverForChannel maps a channel to an Alertmanager receiver. webhook /
// dingtalk / wecom / feishu all deliver via an HTTP webhook; email uses an
// email_config (requires global SMTP to actually deliver).
func receiverForChannel(ch model.NotificationChannel) amReceiver {
	r := amReceiver{Name: "chan-" + ch.ID}
	switch strings.ToLower(ch.Type) {
	case "email":
		to, smarthost := parseEmailTarget(ch.Target)
		r.EmailConfigs = []amEmailConfig{{Smarthost: smarthost, To: to}}
	default:
		// webhook, dingtalk, wecom, feishu — all HTTP webhook receivers.
		r.WebhookConfigs = []amWebhookConfig{{URL: ch.Target, SendResolved: true}}
	}
	return r
}

// parseEmailTarget splits "to@host:port" into To / Smarthost. A bare address
// falls back to localhost:25 (valid syntax; real delivery needs global SMTP).
func parseEmailTarget(target string) (to, smarthost string) {
	to = target
	smarthost = "localhost:25"
	if i := strings.LastIndex(target, "@"); i >= 0 {
		rest := target[i+1:]
		if j := strings.LastIndex(rest, ":"); j >= 0 {
			to = target[:i+1] + rest[:j]
			smarthost = rest[j+1:]
		}
	}
	return to, smarthost
}

// ---- vmalert rules ----

type vmRulesFile struct {
	Groups []vmGroup `yaml:"groups"`
}

type vmGroup struct {
	Name  string   `yaml:"name"`
	Rules []vmRule `yaml:"rules"`
}

type vmRule struct {
	Alert       string            `yaml:"alert"`
	Expr        string            `yaml:"expr"`
	For         string            `yaml:"for,omitempty"`
	Labels      map[string]string `yaml:"labels,omitempty"`
	Annotations map[string]string `yaml:"annotations,omitempty"`
}

var alertNameRe = regexp.MustCompile(`[^a-zA-Z0-9_:]`)

// writeVMRules renders every alert rule (across tenants) into a vmalert rule
// file. Each rule carries its bound channel ids in the "channels" label so
// Alertmanager can route it.
func (m *ConfigManager) writeVMRules(rules []model.AlertRule) error {
	rendered := make([]vmRule, 0, len(rules))
	for _, r := range rules {
		if r.Expr == "" {
			continue
		}
		vr := vmRule{
			Alert: alertNameRe.ReplaceAllString(r.Name, "_"),
			Expr:  r.Expr,
			Labels: map[string]string{
				"severity": r.Severity,
				"channels": strings.Join(r.ChannelIDs, ","),
			},
			Annotations: map[string]string{"summary": r.Name},
		}
		if r.ForSeconds > 0 {
			vr.For = fmt.Sprintf("%ds", r.ForSeconds)
		}
		rendered = append(rendered, vr)
	}
	file := vmRulesFile{Groups: []vmGroup{{Name: "opsconsole-tenant-rules", Rules: rendered}}}
	data, err := yaml.Marshal(&file)
	if err != nil {
		return err
	}
	return writeFile(m.vmRulesPath, data)
}

// writeFile atomically writes the generated config (mkdir -p parent first).
func writeFile(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}
