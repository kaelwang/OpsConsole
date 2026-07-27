package monitoring

import (
	"context"
	"encoding/json"
	"errors"
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
}

// NewService builds a monitoring service.
func NewService(alerts AlertRuleRepository, notifs NotificationRepository, vm *victoriametrics.Client, va *vmalert.Client, audit audit.Sink) *Service {
	return &Service{alerts: alerts, notifs: notifs, vm: vm, va: va, audit: audit}
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
// over [start, end]; otherwise it returns the instant vector.
func (s *Service) Query(ctx context.Context, expr, step, start, end string) (json.RawMessage, error) {
	if s.vm == nil {
		return nil, ErrUpstreamUnavailable
	}
	if step == "" {
		return s.vm.Query(ctx, expr)
	}
	return s.vm.QueryRange(ctx, expr, step, start, end)
}

// ListAlertRules returns the tenant alert rules.
func (s *Service) ListAlertRules(ctx context.Context, tenantID string) ([]model.AlertRule, error) {
	return s.alerts.List(ctx, tenantID)
}

// CreateAlertRule persists a new alert rule and records the action.
func (s *Service) CreateAlertRule(ctx context.Context, tenantID, name, expr, severity string, forSeconds int) (*model.AlertRule, error) {
	r := &model.AlertRule{
		ID:         uuid.NewString(),
		TenantID:   tenantID,
		Name:       name,
		Expr:       expr,
		ForSeconds: forSeconds,
		Severity:   severity,
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
	return nil
}
