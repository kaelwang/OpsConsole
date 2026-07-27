package auth

import (
	"context"
	"errors"

	"github.com/opsconsole/backend/internal/model"
)

// ErrUserNotFound is returned when a user or membership cannot be located.
var ErrUserNotFound = errors.New("user not found")

// UserRepository resolves users and their tenant memberships.
type UserRepository interface {
	GetByEmail(ctx context.Context, email string) (*model.User, error)
	GetMembership(ctx context.Context, userID string) (*model.Membership, error)
}
