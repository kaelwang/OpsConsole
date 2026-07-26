package auth

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/opsconsole/backend/internal/model"
	"github.com/opsconsole/backend/internal/platform/pg"
	"github.com/opsconsole/backend/internal/platform/tenant"
)

type pgUserRepo struct {
	pool *pgxpool.Pool
}

// NewPGUserRepo builds the PostgreSQL user repository.
func NewPGUserRepo(pool *pgxpool.Pool) UserRepository {
	return &pgUserRepo{pool: pool}
}

func (r *pgUserRepo) GetByEmail(ctx context.Context, email string) (*model.User, error) {
	var u model.User
	err := pg.WithTenant(ctx, r.pool, tenant.TenantID(ctx), string(tenant.Role(ctx)), func(tx pgx.Tx) error {
		return tx.QueryRow(ctx,
			`SELECT id, email, password_hash, display_name, created_at FROM users WHERE email=$1`, email).
			Scan(&u.ID, &u.Email, &u.PasswordHash, &u.DisplayName, &u.CreatedAt)
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return &u, nil
}

func (r *pgUserRepo) GetMembership(ctx context.Context, userID string) (*model.Membership, error) {
	var m model.Membership
	err := pg.WithTenant(ctx, r.pool, tenant.TenantID(ctx), string(tenant.Role(ctx)), func(tx pgx.Tx) error {
		return tx.QueryRow(ctx,
			`SELECT tenant_id, user_id, role FROM tenant_memberships WHERE user_id=$1`, userID).
			Scan(&m.TenantID, &m.UserID, &m.Role)
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return &m, nil
}
