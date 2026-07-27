package infrastructure

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/opsconsole/backend/internal/model"
	"github.com/opsconsole/backend/internal/platform/pg"
)

// ErrNotFound is returned when an entity is missing.
var ErrNotFound = errors.New("not found")

// ClusterRepository manages clusters.
type ClusterRepository interface {
	List(ctx context.Context, tenantID string) ([]model.Cluster, error)
	Get(ctx context.Context, tenantID, id string) (*model.Cluster, error)
	Create(ctx context.Context, c model.Cluster) error
}

// HostRepository manages hosts.
type HostRepository interface {
	List(ctx context.Context, tenantID string) ([]model.Host, error)
}

// ---- postgres ----

type pgClusterRepo struct{ pool *pgxpool.Pool }

// NewPGClusterRepository builds the PostgreSQL cluster repository.
func NewPGClusterRepository(pool *pgxpool.Pool) ClusterRepository { return &pgClusterRepo{pool: pool} }

func (r *pgClusterRepo) List(ctx context.Context, tenantID string) ([]model.Cluster, error) {
	out := make([]model.Cluster, 0)
	err := pg.WithTenant(ctx, r.pool, tenantID, "member", func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT id, tenant_id, name, provider, kubeconfig_ref, created_at FROM clusters WHERE tenant_id=$1`, tenantID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var c model.Cluster
			if err := rows.Scan(&c.ID, &c.TenantID, &c.Name, &c.Provider, &c.Kubeconfig, &c.CreatedAt); err != nil {
				return err
			}
			out = append(out, c)
		}
		return rows.Err()
	})
	return out, err
}

func (r *pgClusterRepo) Get(ctx context.Context, tenantID, id string) (*model.Cluster, error) {
	var c model.Cluster
	err := pg.WithTenant(ctx, r.pool, tenantID, "member", func(tx pgx.Tx) error {
		return tx.QueryRow(ctx,
			`SELECT id, tenant_id, name, provider, kubeconfig_ref, created_at FROM clusters WHERE tenant_id=$1 AND id=$2`,
			tenantID, id).Scan(&c.ID, &c.TenantID, &c.Name, &c.Provider, &c.Kubeconfig, &c.CreatedAt)
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &c, nil
}

func (r *pgClusterRepo) Create(ctx context.Context, c model.Cluster) error {
	return pg.WithTenant(ctx, r.pool, c.TenantID, "member", func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx,
			`INSERT INTO clusters (id, tenant_id, name, provider, kubeconfig_ref, sa_name, created_at)
			 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
			c.ID, c.TenantID, c.Name, c.Provider, c.Kubeconfig, "opsconsole-sa", c.CreatedAt)
		return err
	})
}

type pgHostRepo struct{ pool *pgxpool.Pool }

// NewPGHostRepository builds the PostgreSQL host repository.
func NewPGHostRepository(pool *pgxpool.Pool) HostRepository { return &pgHostRepo{pool: pool} }

func (r *pgHostRepo) List(ctx context.Context, tenantID string) ([]model.Host, error) {
	out := make([]model.Host, 0)
	err := pg.WithTenant(ctx, r.pool, tenantID, "member", func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT id, tenant_id, cluster_id, name, ip, COALESCE(os,''), status, created_at
			 FROM hosts WHERE tenant_id=$1`, tenantID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var h model.Host
			if err := rows.Scan(&h.ID, &h.TenantID, &h.ClusterID, &h.Name, &h.IP, &h.OS, &h.Status, &h.CreatedAt); err != nil {
				return err
			}
			out = append(out, h)
		}
		return rows.Err()
	})
	return out, err
}
