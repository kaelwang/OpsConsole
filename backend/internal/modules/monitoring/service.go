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
)

// ErrUpstreamUnavailable indicates the metrics backend is not configured.
var ErrUpstreamUnavailable = errors.New("upstream metrics service unavailable")

// Service implements monitoring business logic.
type Service struct {
	alerts AlertRuleRepository
	notifs NotificationRepository
	vm     *victoriametrics.Client
	audit  audit.Sink
}

// NewService builds a monitoring service.
func NewService(alerts AlertRuleRepository, notifs NotificationRepository, vm *victoriametrics.Client, audit audit.Sink) *Service {
	return &Service{alerts: alerts, notifs: notifs, vm: vm, audit: audit}
}

// Query runs a PromQL query (range if step is provided).
func (s *Service) Query(ctx context.Context, expr, step string) (json.RawMessage, error) {
	if s.vm == nil {
		return nil, ErrUpstreamUnavailable
	}
	if step == "" {
		return s.vm.Query(ctx, expr)
	}
	return s.vm.QueryRange(ctx, expr, step)
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
