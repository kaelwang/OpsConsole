package pg

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/opsconsole/backend/internal/model"
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

	// PostgreSQL does NOT accept bind parameters in SET/SET LOCAL, so the GUC
	// values are inlined. tenantID/role are system-controlled (JWT claims /
	// known enum); escape single quotes to avoid SQL injection.
	esc := func(s string) string { return strings.ReplaceAll(s, "'", "''") }
	if _, err := tx.Exec(ctx, "SET LOCAL app.tenant_id = '"+esc(tenantID)+"'"); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, "SET LOCAL app.role = '"+esc(role)+"'"); err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// systemTenantID is a placeholder UUID used only to satisfy the RLS policy's
// uuid cast when running in the system (platform_admin) context.
const systemTenantID = "00000000-0000-0000-0000-000000000000"

// WithSystem runs fn as the platform superuser context, bypassing tenant RLS.
// It must be used ONLY for system-level operations that need to resolve records
// before the caller's tenant is known — e.g. login resolving a user's tenant
// membership. Queries remain scoped by their own WHERE clauses (user_id, etc.),
// so no cross-tenant data is exposed.
func WithSystem(ctx context.Context, pool *pgxpool.Pool, fn func(tx pgx.Tx) error) error {
	return WithTenant(ctx, pool, systemTenantID, string(model.RolePlatformAdmin), fn)
}
