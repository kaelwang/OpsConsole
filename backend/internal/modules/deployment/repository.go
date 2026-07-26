package deployment

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/opsconsole/backend/internal/model"
	"github.com/opsconsole/backend/internal/platform/pg"
	"github.com/opsconsole/backend/internal/platform/store"
)

// DeploymentRepository persists deployment records.
type DeploymentRepository interface {
	List(ctx context.Context, tenantID string) ([]model.Deployment, error)
	Create(ctx context.Context, d model.Deployment) error
}

type memRepo struct{ db *store.MemDB }

// NewMemRepository builds the in-memory deployment repository.
func NewMemRepository(db *store.MemDB) DeploymentRepository { return &memRepo{db: db} }

func (r *memRepo) List(ctx context.Context, tenantID string) ([]model.Deployment, error) {
	r.db.Mu.RLock()
	defer r.db.Mu.RUnlock()
	out := make([]model.Deployment, 0)
	for _, d := range r.db.Deploys {
		if d.TenantID == tenantID {
			out = append(out, d)
		}
	}
	return out, nil
}

func (r *memRepo) Create(ctx context.Context, d model.Deployment) error {
	r.db.Mu.Lock()
	defer r.db.Mu.Unlock()
	r.db.Deploys[d.ID] = d
	return nil
}

type pgRepo struct{ pool *pgxpool.Pool }

// NewPGRepository builds the PostgreSQL deployment repository.
func NewPGRepository(pool *pgxpool.Pool) DeploymentRepository { return &pgRepo{pool: pool} }

func (r *pgRepo) List(ctx context.Context, tenantID string) ([]model.Deployment, error) {
	out := make([]model.Deployment, 0)
	err := pg.WithTenant(ctx, r.pool, tenantID, "member", func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT id, tenant_id, project_id, name, ref, status, created_at FROM deployments WHERE tenant_id=$1`, tenantID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var d model.Deployment
			if err := rows.Scan(&d.ID, &d.TenantID, &d.ProjectID, &d.Name, &d.Ref, &d.Status, &d.CreatedAt); err != nil {
				return err
			}
			out = append(out, d)
		}
		return rows.Err()
	})
	return out, err
}

func (r *pgRepo) Create(ctx context.Context, d model.Deployment) error {
	return pg.WithTenant(ctx, r.pool, d.TenantID, "member", func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx,
			`INSERT INTO deployments (id, tenant_id, project_id, name, ref, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
			d.ID, d.TenantID, d.ProjectID, d.Name, d.Ref, d.Status, d.CreatedAt)
		return err
	})
}
