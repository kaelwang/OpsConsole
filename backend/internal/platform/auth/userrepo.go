package auth

import (
	"context"
	"errors"

	"github.com/opsconsole/backend/internal/model"
	"github.com/opsconsole/backend/internal/platform/store"
)

// ErrUserNotFound is returned when a user or membership cannot be located.
var ErrUserNotFound = errors.New("user not found")

// UserRepository resolves users and their tenant memberships.
type UserRepository interface {
	GetByEmail(ctx context.Context, email string) (*model.User, error)
	GetMembership(ctx context.Context, userID string) (*model.Membership, error)
}

type memUserRepo struct {
	db *store.MemDB
}

// NewMemUserRepo builds the in-memory user repository.
func NewMemUserRepo(db *store.MemDB) UserRepository {
	return &memUserRepo{db: db}
}

func (r *memUserRepo) GetByEmail(ctx context.Context, email string) (*model.User, error) {
	r.db.Mu.RLock()
	defer r.db.Mu.RUnlock()
	for _, u := range r.db.Users {
		if u.Email == email {
			cp := u
			return &cp, nil
		}
	}
	return nil, ErrUserNotFound
}

func (r *memUserRepo) GetMembership(ctx context.Context, userID string) (*model.Membership, error) {
	r.db.Mu.RLock()
	defer r.db.Mu.RUnlock()
	for _, m := range r.db.Members {
		if m.UserID == userID {
			cp := m
			return &cp, nil
		}
	}
	return nil, ErrUserNotFound
}
