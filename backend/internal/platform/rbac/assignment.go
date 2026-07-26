package rbac

import (
	"context"
	"errors"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/opsconsole/backend/internal/model"
	"github.com/opsconsole/backend/internal/pkg/response"
	"github.com/opsconsole/backend/internal/platform/pg"
	"github.com/opsconsole/backend/internal/platform/store"
	"github.com/opsconsole/backend/internal/platform/tenant"
)

// ErrAssignmentNotFound is returned when an assignment does not exist.
var ErrAssignmentNotFound = errors.New("assignment not found")

// AssignRepository manages tenant memberships.
type AssignRepository interface {
	Assign(ctx context.Context, tenantID, userID string, role model.Role) error
	List(ctx context.Context, tenantID string) ([]model.Membership, error)
}

type memAssignRepo struct {
	db *store.MemDB
}

// NewMemAssignRepository builds the in-memory assignment repository.
func NewMemAssignRepository(db *store.MemDB) AssignRepository {
	return &memAssignRepo{db: db}
}

func (r *memAssignRepo) Assign(ctx context.Context, tenantID, userID string, role model.Role) error {
	r.db.Mu.Lock()
	defer r.db.Mu.Unlock()
	r.db.Members[tenantID+"|"+userID] = model.Membership{TenantID: tenantID, UserID: userID, Role: role}
	return nil
}

func (r *memAssignRepo) List(ctx context.Context, tenantID string) ([]model.Membership, error) {
	r.db.Mu.RLock()
	defer r.db.Mu.RUnlock()
	out := make([]model.Membership, 0)
	for _, m := range r.db.Members {
		if m.TenantID == tenantID {
			out = append(out, m)
		}
	}
	return out, nil
}

type pgAssignRepo struct {
	pool *pgxpool.Pool
}

// NewPGAssignRepository builds the PostgreSQL assignment repository.
func NewPGAssignRepository(pool *pgxpool.Pool) AssignRepository {
	return &pgAssignRepo{pool: pool}
}

func (r *pgAssignRepo) Assign(ctx context.Context, tenantID, userID string, role model.Role) error {
	return pg.WithTenant(ctx, r.pool, tenantID, string(tenant.Role(ctx)), func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx,
			`INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES ($1,$2,$3)
			 ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
			tenantID, userID, role)
		return err
	})
}

func (r *pgAssignRepo) List(ctx context.Context, tenantID string) ([]model.Membership, error) {
	out := make([]model.Membership, 0)
	err := pg.WithTenant(ctx, r.pool, tenantID, string(tenant.Role(ctx)), func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `SELECT tenant_id, user_id, role FROM tenant_memberships WHERE tenant_id=$1`, tenantID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var m model.Membership
			if err := rows.Scan(&m.TenantID, &m.UserID, &m.Role); err != nil {
				return err
			}
			out = append(out, m)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// ListMembershipsHandler returns the memberships of the principal tenant.
func ListMembershipsHandler(repo AssignRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		list, err := repo.List(c.Request.Context(), tenant.TenantID(c.Request.Context()))
		if err != nil {
			response.Internal(c, "failed to list memberships")
			return
		}
		response.OK(c, list)
	}
}

// AssignHandler grants a role to a user within the principal tenant.
func AssignHandler(repo AssignRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			UserID string `json:"user_id"`
			Role   string `json:"role"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			response.BadRequest(c, "invalid request body")
			return
		}
		switch model.Role(body.Role) {
		case model.RoleOwner, model.RoleAdmin, model.RoleMember, model.RoleViewer:
		default:
			response.BadRequest(c, "invalid role")
			return
		}
		if err := repo.Assign(c.Request.Context(), tenant.TenantID(c.Request.Context()), body.UserID, model.Role(body.Role)); err != nil {
			response.Internal(c, "failed to assign role")
			return
		}
		response.OK(c, gin.H{"user_id": body.UserID, "role": body.Role})
	}
}
