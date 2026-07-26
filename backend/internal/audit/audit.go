package audit

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/opsconsole/backend/internal/model"
	"github.com/opsconsole/backend/internal/platform/tenant"
)

// Sink records access decisions and denials. Satisfied by *Service and used by
// the rbac gate to log forbidden attempts.
type Sink interface {
	Record(ctx context.Context, entry model.AuditLog) error
	Denied(ctx context.Context, tenantID, userID, action, resource, detail string) error
}

// Service persists audit entries.
type Service struct {
	repo Repository
}

// NewService builds an audit service over the given repository.
func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// Record writes a successful audit entry. Missing TenantID/UserID are filled
// from the authenticated principal in the context when available.
func (s *Service) Record(ctx context.Context, entry model.AuditLog) error {
	if p, ok := tenant.PrincipalFromContext(ctx); ok {
		if entry.TenantID == "" {
			entry.TenantID = p.TenantID
		}
		if entry.UserID == "" {
			entry.UserID = p.UserID
		}
	}
	if entry.ID == "" {
		entry.ID = uuid.NewString()
	}
	if entry.CreatedAt.IsZero() {
		entry.CreatedAt = time.Now()
	}
	entry.OK = true
	return s.repo.Write(ctx, entry)
}

// Denied writes a denied-access audit entry.
func (s *Service) Denied(ctx context.Context, tenantID, userID, action, resource, detail string) error {
	return s.repo.Write(ctx, model.AuditLog{
		ID:        uuid.NewString(),
		TenantID:  tenantID,
		UserID:    userID,
		Action:    action,
		Resource:  resource,
		Detail:    detail,
		OK:        false,
		CreatedAt: time.Now(),
	})
}
