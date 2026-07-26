package monitoring

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/opsconsole/backend/internal/model"
	"github.com/opsconsole/backend/internal/platform/pg"
	"github.com/opsconsole/backend/internal/platform/store"
)

// ErrNotFound is returned when a monitoring entity is missing.
var ErrNotFound = errors.New("not found")

// AlertRuleRepository manages alert rules.
type AlertRuleRepository interface {
	List(ctx context.Context, tenantID string) ([]model.AlertRule, error)
	Create(ctx context.Context, r model.AlertRule) error
}

// NotificationRepository manages notification channels.
type NotificationRepository interface {
	List(ctx context.Context, tenantID string) ([]model.NotificationChannel, error)
	Create(ctx context.Context, n model.NotificationChannel) error
}

// ---- in-memory ----

type memAlertRepo struct{ db *store.MemDB }

// NewMemAlertRepository builds the in-memory alert rule repository.
func NewMemAlertRepository(db *store.MemDB) AlertRuleRepository { return &memAlertRepo{db: db} }

func (r *memAlertRepo) List(ctx context.Context, tenantID string) ([]model.AlertRule, error) {
	r.db.Mu.RLock()
	defer r.db.Mu.RUnlock()
	out := make([]model.AlertRule, 0)
	for _, a := range r.db.AlertRules {
		if a.TenantID == tenantID {
			out = append(out, a)
		}
	}
	return out, nil
}

func (r *memAlertRepo) Create(ctx context.Context, a model.AlertRule) error {
	r.db.Mu.Lock()
	defer r.db.Mu.Unlock()
	r.db.AlertRules[a.ID] = a
	return nil
}

type memNotifRepo struct{ db *store.MemDB }

// NewMemNotificationRepository builds the in-memory notification repository.
func NewMemNotificationRepository(db *store.MemDB) NotificationRepository {
	return &memNotifRepo{db: db}
}

func (r *memNotifRepo) List(ctx context.Context, tenantID string) ([]model.NotificationChannel, error) {
	r.db.Mu.RLock()
	defer r.db.Mu.RUnlock()
	out := make([]model.NotificationChannel, 0)
	for _, n := range r.db.Notifs {
		if n.TenantID == tenantID {
			out = append(out, n)
		}
	}
	return out, nil
}

func (r *memNotifRepo) Create(ctx context.Context, n model.NotificationChannel) error {
	r.db.Mu.Lock()
	defer r.db.Mu.Unlock()
	r.db.Notifs[n.ID] = n
	return nil
}

// ---- postgres ----

type pgAlertRepo struct{ pool *pgxpool.Pool }

// NewPGAlertRepository builds the PostgreSQL alert rule repository.
func NewPGAlertRepository(pool *pgxpool.Pool) AlertRuleRepository { return &pgAlertRepo{pool: pool} }

func (r *pgAlertRepo) List(ctx context.Context, tenantID string) ([]model.AlertRule, error) {
	out := make([]model.AlertRule, 0)
	err := pg.WithTenant(ctx, r.pool, tenantID, "member", func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT id, tenant_id, name, expr, for_seconds, severity, created_at FROM alert_rules WHERE tenant_id=$1`, tenantID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var a model.AlertRule
			if err := rows.Scan(&a.ID, &a.TenantID, &a.Name, &a.Expr, &a.ForSeconds, &a.Severity, &a.CreatedAt); err != nil {
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
		_, err := tx.Exec(ctx,
			`INSERT INTO alert_rules (id, tenant_id, name, expr, for_seconds, severity, created_at)
			 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
			a.ID, a.TenantID, a.Name, a.Expr, a.ForSeconds, a.Severity, a.CreatedAt)
		return err
	})
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
