package tenant

import (
	"context"

	"github.com/opsconsole/backend/internal/model"
)

type principalKey struct{}

// Principal is the authenticated caller carried in the request context.
type Principal struct {
	UserID   string
	TenantID string
	Role     model.Role
}

// WithPrincipal returns a context with the principal attached.
func WithPrincipal(ctx context.Context, p Principal) context.Context {
	return context.WithValue(ctx, principalKey{}, p)
}

// PrincipalFromContext extracts the principal, if present.
func PrincipalFromContext(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(principalKey{}).(Principal)
	return p, ok
}

// UserID returns the principal user id or empty string.
func UserID(ctx context.Context) string {
	if p, ok := PrincipalFromContext(ctx); ok {
		return p.UserID
	}
	return ""
}

// TenantID returns the principal tenant id or empty string.
func TenantID(ctx context.Context) string {
	if p, ok := PrincipalFromContext(ctx); ok {
		return p.TenantID
	}
	return ""
}

// Role returns the principal role or empty string.
func Role(ctx context.Context) model.Role {
	if p, ok := PrincipalFromContext(ctx); ok {
		return p.Role
	}
	return ""
}

// IsPlatformAdmin reports whether the principal is the platform admin.
func IsPlatformAdmin(ctx context.Context) bool {
	return Role(ctx) == model.RolePlatformAdmin
}
