package audit

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/opsconsole/backend/internal/model"
	"github.com/opsconsole/backend/internal/platform/pg"
	"github.com/opsconsole/backend/internal/platform/store"
	"github.com/opsconsole/backend/internal/platform/tenant"
)

// ErrNotFound is returned when an audit record cannot be located.
var ErrNotFound = errors.New("not found")

// Repository persists and lists audit logs.
type Repository interface {
	Write(ctx context.Context, entry model.AuditLog) error
	List(ctx context.Context, page, limit int) ([]model.AuditLog, int, error)
}

type memRepo struct {
	db *store.MemDB
}

// NewMemRepository builds the in-memory audit repository.
func NewMemRepository(db *store.MemDB) Repository { return &memRepo{db: db} }

func (r *memRepo) Write(ctx context.Context, entry model.AuditLog) error {
	r.db.Mu.Lock()
	defer r.db.Mu.Unlock()
	r.db.Audit = append(r.db.Audit, entry)
	return nil
}

func (r *memRepo) List(ctx context.Context, page, limit int) ([]model.AuditLog, int, error) {
	r.db.Mu.RLock()
	defer r.db.Mu.RUnlock()
	total := len(r.db.Audit)
	start := (page - 1) * limit
	if start >= total {
		return []model.AuditLog{}, total, nil
	}
	end := start + limit
	if end > total {
		end = total
	}
	out := make([]model.AuditLog, 0, end-start)
	// newest first
	for i := start; i < end; i++ {
		out = append(out, r.db.Audit[total-1-i])
	}
	return out, total, nil
}

type pgRepo struct {
	pool *pgxpool.Pool
}

// NewPGRepository builds the PostgreSQL audit repository.
func NewPGRepository(pool *pgxpool.Pool) Repository { return &pgRepo{pool: pool} }

func (r *pgRepo) Write(ctx context.Context, entry model.AuditLog) error {
	return pg.WithTenant(ctx, r.pool, entry.TenantID, "member", func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx,
			`INSERT INTO audit_logs (id, tenant_id, user_id, action, resource, detail, ok, created_at)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
			entry.ID, entry.TenantID, entry.UserID, entry.Action, entry.Resource, entry.Detail, entry.OK, entry.CreatedAt)
		return err
	})
}

func (r *pgRepo) List(ctx context.Context, page, limit int) ([]model.AuditLog, int, error) {
	var total int
	out := make([]model.AuditLog, 0)
	err := pg.WithTenant(ctx, r.pool, tenant.TenantID(ctx), string(tenant.Role(ctx)), func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM audit_logs`).Scan(&total); err != nil {
			return err
		}
		rows, err := tx.Query(ctx,
			`SELECT id, tenant_id, user_id, action, resource, detail, ok, created_at
			 FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
			limit, (page-1)*limit)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var a model.AuditLog
			if err := rows.Scan(&a.ID, &a.TenantID, &a.UserID, &a.Action, &a.Resource, &a.Detail, &a.OK, &a.CreatedAt); err != nil {
				return err
			}
			out = append(out, a)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, 0, err
	}
	return out, total, nil
}
