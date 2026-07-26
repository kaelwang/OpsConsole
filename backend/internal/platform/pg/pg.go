package pg

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// WithTenant runs fn inside a transaction with PostgreSQL RLS session
// variables set via SET LOCAL. The variables only live for the transaction,
// preventing cross-tenant leakage when connections are reused from the pool.
func WithTenant(ctx context.Context, pool *pgxpool.Pool, tenantID, role string, fn func(tx pgx.Tx) error) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL app.tenant_id = $1", tenantID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, "SET LOCAL app.role = $1", role); err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
