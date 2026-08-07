package monitoring

import (
	"context"
	"encoding/json"
	"errors"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/opsconsole/backend/internal/audit"
	"github.com/opsconsole/backend/internal/model"
	"github.com/opsconsole/backend/internal/pkg/victoriametrics"
	"github.com/opsconsole/backend/internal/pkg/vmalert"
)

// ErrUpstreamUnavailable indicates the metrics backend is not configured.
var ErrUpstreamUnavailable = errors.New("upstream metrics service unavailable")

// Service implements monitoring business logic.
type Service struct {
	alerts AlertRuleRepository
	notifs NotificationRepository
	vm     *victoriametrics.Client
	va     *vmalert.Client
	audit  audit.Sink
	cm     *ConfigManager
}

// NewService builds a monitoring service. cm may be nil when the alerting
// notification pipeline is not configured; in that case channel/rule changes
// simply skip the config regeneration step.
func NewService(alerts AlertRuleRepository, notifs NotificationRepository, vm *victoriametrics.Client, va *vmalert.Client, audit audit.Sink, cm *ConfigManager) *Service {
	return &Service{alerts: alerts, notifs: notifs, vm: vm, va: va, audit: audit, cm: cm}
}

// syncConfig regenerates alertmanager/vmalert config after a change. Failures
// are returned to the caller so the operation surfaces them, but a nil cm (no
// alerting pipeline) is a no-op.
func (s *Service) syncConfig(ctx context.Context) error {
	if s.cm == nil {
		return nil
	}
	return s.cm.Sync(ctx)
}

// ListActiveAlerts returns the active alert events evaluated by vmalert.
func (s *Service) ListActiveAlerts(ctx context.Context) ([]model.AlertEvent, error) {
	if s.va == nil {
		return nil, ErrUpstreamUnavailable
	}
	raw, err := s.va.ListAlerts(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]model.AlertEvent, 0, len(raw))
	for _, a := range raw {
		severity := a.Labels["severity"]
		if severity == "" {
			severity = "warning"
		}
		summary := a.Annotations["summary"]
		if summary == "" {
			summary = a.Name
		}
		out = append(out, model.AlertEvent{
			ID:       a.ID,
			RuleID:   a.RuleID,
			GroupID:  a.GroupID,
			Severity: severity,
			Status:   "firing",
			FiredAt:  a.ActiveAt.Format(time.RFC3339),
			Summary:  summary,
			Labels:   a.Labels,
		})
	}
	return out, nil
}

// Query runs a PromQL query. When step is provided it performs a range query
// over [start, end]; otherwise it returns the instant vector. filters is an
// optional label_filters expression forwarded to VictoriaMetrics.
func (s *Service) Query(ctx context.Context, expr, step, start, end, filters string) (json.RawMessage, error) {
	if s.vm == nil {
		return nil, ErrUpstreamUnavailable
	}
	if step == "" {
		return s.vm.Query(ctx, expr, filters)
	}
	return s.vm.QueryRange(ctx, expr, step, start, end, filters)
}

// ListNodes returns the distinct node identifiers currently scraped by the
// node_exporter job, taken from the "node" label (falling back to "instance").
func (s *Service) ListNodes(ctx context.Context) ([]string, error) {
	if s.vm == nil {
		return nil, ErrUpstreamUnavailable
	}
	// 注意：节点名取自 node-exporter 抓取任务的 "node" 标签（node-exporter job 通过
	// Pod SD 给每个目标打了 node 标签）。第一个监控版本写成了 job="node"，但 vmagent 里
	// 没有这个 job 名，导致 ListNodes 返回空 → 前端"节点在线率 · 0 节点"。
	raw, err := s.vm.Query(ctx, `up{job="node-exporter"}`, "")
	if err != nil {
		return nil, err
	}
	var resp struct {
		Data struct {
			Result []struct {
				Metric map[string]string `json:"metric"`
			} `json:"result"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, err
	}
	seen := make(map[string]struct{}, len(resp.Data.Result))
	out := make([]string, 0, len(resp.Data.Result))
	for _, r := range resp.Data.Result {
		name := r.Metric["node"]
		if name == "" {
			name = r.Metric["instance"]
		}
		if name == "" {
			continue
		}
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}
		out = append(out, name)
	}
	sort.Strings(out)
	return out, nil
}

// ListAlertRules returns the tenant alert rules.
func (s *Service) ListAlertRules(ctx context.Context, tenantID string) ([]model.AlertRule, error) {
	return s.alerts.List(ctx, tenantID)
}

// CreateAlertRule persists a new alert rule and records the action. channelIDs
// binds the rule to notification channels so alerts are routed to them.
func (s *Service) CreateAlertRule(ctx context.Context, tenantID, name, expr, severity string, forSeconds int, channelIDs []string) (*model.AlertRule, error) {
	r := &model.AlertRule{
		ID:         uuid.NewString(),
		TenantID:   tenantID,
		Name:       name,
		Expr:       expr,
		ForSeconds: forSeconds,
		Severity:   severity,
		ChannelIDs: channelIDs,
		CreatedAt:  time.Now(),
	}
	if err := s.alerts.Create(ctx, *r); err != nil {
		return nil, err
	}
	if s.audit != nil {
		_ = s.audit.Record(ctx, model.AuditLog{
			TenantID: tenantID, Action: "write", Resource: "monitoring", Detail: "create alert rule " + name,
		})
	}
	// Regenerate alerting config so the new rule's channels take effect.
	if err := s.syncConfig(ctx); err != nil {
		return r, err
	}
	return r, nil
}

// ListNotifications returns the tenant notification channels.
func (s *Service) ListNotifications(ctx context.Context, tenantID string) ([]model.NotificationChannel, error) {
	return s.notifs.List(ctx, tenantID)
}

// CreateNotification persists a new notification channel and records the action.
func (s *Service) CreateNotification(ctx context.Context, tenantID, kind, target string) (*model.NotificationChannel, error) {
	n := &model.NotificationChannel{
		ID:        uuid.NewString(),
		TenantID:  tenantID,
		Type:      kind,
		Target:    target,
		CreatedAt: time.Now(),
	}
	if err := s.notifs.Create(ctx, *n); err != nil {
		return nil, err
	}
	if s.audit != nil {
		_ = s.audit.Record(ctx, model.AuditLog{
			TenantID: tenantID, Action: "write", Resource: "monitoring", Detail: "create notification " + target,
		})
	}
	// Regenerate alerting config so the new channel is wired into routing.
	if err := s.syncConfig(ctx); err != nil {
		return n, err
	}
	return n, nil
}

// DeleteNotification removes a notification channel and records the action.
func (s *Service) DeleteNotification(ctx context.Context, tenantID, id string) error {
	if err := s.notifs.Delete(ctx, tenantID, id); err != nil {
		return err
	}
	if s.audit != nil {
		_ = s.audit.Record(ctx, model.AuditLog{
			TenantID: tenantID, Action: "delete", Resource: "monitoring", Detail: "delete notification " + id,
		})
	}
	// Regenerate alerting config so the removed channel drops out of routing.
	if err := s.syncConfig(ctx); err != nil {
		return err
	}
	return nil
}
