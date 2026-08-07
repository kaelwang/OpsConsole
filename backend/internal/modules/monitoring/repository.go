package monitoring

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/opsconsole/backend/internal/model"
	"github.com/opsconsole/backend/internal/platform/pg"
)

// ErrNotFound is returned when a monitoring entity is missing.
var ErrNotFound = errors.New("not found")

// AlertRuleRepository manages alert rules.
type AlertRuleRepository interface {
	List(ctx context.Context, tenantID string) ([]model.AlertRule, error)
	ListAll(ctx context.Context) ([]model.AlertRule, error)
	Create(ctx context.Context, r model.AlertRule) error
}

// NotificationRepository manages notification channels.
type NotificationRepository interface {
	List(ctx context.Context, tenantID string) ([]model.NotificationChannel, error)
	ListAll(ctx context.Context) ([]model.NotificationChannel, error)
	Create(ctx context.Context, n model.NotificationChannel) error
	Delete(ctx context.Context, tenantID, id string) error
}

// ---- postgres ----

type pgAlertRepo struct{ pool *pgxpool.Pool }

// NewPGAlertRepository builds the PostgreSQL alert rule repository.
func NewPGAlertRepository(pool *pgxpool.Pool) AlertRuleRepository { return &pgAlertRepo{pool: pool} }

func (r *pgAlertRepo) List(ctx context.Context, tenantID string) ([]model.AlertRule, error) {
	out := make([]model.AlertRule, 0)
	err := pg.WithTenant(ctx, r.pool, tenantID, "member", func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT id, tenant_id, name, expr, for_seconds, severity,
			        (SELECT COALESCE(array_agg(x), ARRAY[]::text[])
			           FROM jsonb_array_elements_text(channel_ids) x) AS channel_ids,
			        COALESCE(created_by::text, '') AS created_by, created_at
			 FROM alert_rules WHERE tenant_id=$1`, tenantID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var a model.AlertRule
			if err := rows.Scan(&a.ID, &a.TenantID, &a.Name, &a.Expr, &a.ForSeconds, &a.Severity, &a.ChannelIDs, &a.CreatedBy, &a.CreatedAt); err != nil {
				return err
			}
			out = append(out, a)
		}
		return rows.Err()
	})
	return out, err
}

func (r *pgAlertRepo) Create(ctx context.Context, a model.AlertRule) error {
	return pg.WithTenant(ctx, r.pool, a.TenantID, "member", func(tx pgx.Tx) error {
		// channel_ids is stored as a jsonb array of notification channel IDs.
		_, err := tx.Exec(ctx,
			`INSERT INTO alert_rules (id, tenant_id, name, expr, for_seconds, severity, channel_ids, created_at)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
			a.ID, a.TenantID, a.Name, a.Expr, a.ForSeconds, a.Severity, a.ChannelIDs, a.CreatedAt)
		return err
	})
}

// ListAll returns every alert rule across all tenants. Used to regenerate the
// global vmalert rule file so each rule's bound notification channels are
// carried as labels into Alertmanager routing.
func (r *pgAlertRepo) ListAll(ctx context.Context) ([]model.AlertRule, error) {
	out := make([]model.AlertRule, 0)
	rows, err := r.pool.Query(ctx,
		`SELECT id, tenant_id, name, expr, for_seconds, severity,
		        COALESCE(channel_ids, '[]'::jsonb), COALESCE(created_by::text, ''), created_at
		 FROM alert_rules`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var a model.AlertRule
		if err := rows.Scan(&a.ID, &a.TenantID, &a.Name, &a.Expr, &a.ForSeconds, &a.Severity, &a.ChannelIDs, &a.CreatedBy, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

type pgNotifRepo struct{ pool *pgxpool.Pool }

// NewPGNotificationRepository builds the PostgreSQL notification repository.
func NewPGNotificationRepository(pool *pgxpool.Pool) NotificationRepository {
	return &pgNotifRepo{pool: pool}
}

func (r *pgNotifRepo) List(ctx context.Context, tenantID string) ([]model.NotificationChannel, error) {
	out := make([]model.NotificationChannel, 0)
	err := pg.WithTenant(ctx, r.pool, tenantID, "member", func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT id, tenant_id, type, target, created_at FROM notification_channels WHERE tenant_id=$1`, tenantID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var n model.NotificationChannel
			if err := rows.Scan(&n.ID, &n.TenantID, &n.Type, &n.Target, &n.CreatedAt); err != nil {
				return err
			}
			out = append(out, n)
		}
		return rows.Err()
	})
	return out, err
}

func (r *pgNotifRepo) Create(ctx context.Context, n model.NotificationChannel) error {
	return pg.WithTenant(ctx, r.pool, n.TenantID, "member", func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx,
			`INSERT INTO notification_channels (id, tenant_id, type, target, created_at) VALUES ($1,$2,$3,$4,$5)`,
			n.ID, n.TenantID, n.Type, n.Target, n.CreatedAt)
		return err
	})
}

func (r *pgNotifRepo) Delete(ctx context.Context, tenantID, id string) error {
	return pg.WithTenant(ctx, r.pool, tenantID, "member", func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx,
			`DELETE FROM notification_channels WHERE tenant_id=$1 AND id=$2`, tenantID, id)
		return err
	})
}

// ListAll returns every notification channel across all tenants. Used to rebuild
// the global Alertmanager configuration.
func (r *pgNotifRepo) ListAll(ctx context.Context) ([]model.NotificationChannel, error) {
	out := make([]model.NotificationChannel, 0)
	rows, err := r.pool.Query(ctx,
		`SELECT id, tenant_id, type, target, created_at FROM notification_channels`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var n model.NotificationChannel
		if err := rows.Scan(&n.ID, &n.TenantID, &n.Type, &n.Target, &n.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}
