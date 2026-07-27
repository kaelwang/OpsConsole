package auth

import (
	"context"
)

// SessionStore persists refresh tokens (Redis-backed in production).
type SessionStore interface {
	Save(ctx context.Context, refreshToken, userID, tenantID string) error
	Delete(ctx context.Context, refreshToken string) error
}
