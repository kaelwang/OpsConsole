package auth

import (
	"context"
	"errors"

	"github.com/opsconsole/backend/internal/model"
	"golang.org/x/crypto/bcrypt"
)

// ErrInvalidCredentials is returned for any authentication failure.
var ErrInvalidCredentials = errors.New("invalid credentials")

// Service authenticates users and issues tokens.
type Service struct {
	users    UserRepository
	sessions SessionStore
	secret   string
}

// NewService builds an authentication service.
func NewService(users UserRepository, sessions SessionStore, secret string) *Service {
	return &Service{users: users, sessions: sessions, secret: secret}
}

// Login validates credentials, resolves the tenant membership and issues tokens.
func (s *Service) Login(ctx context.Context, email, password string) (*model.TokenResponse, error) {
	u, err := s.users.GetByEmail(ctx, email)
	if err != nil {
		return nil, ErrInvalidCredentials
	}
	if bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)) != nil {
		return nil, ErrInvalidCredentials
	}
	mem, err := s.users.GetMembership(ctx, u.ID)
	if err != nil {
		return nil, ErrInvalidCredentials
	}
	access, refresh, exp, err := GenerateTokens(s.secret, u.ID, mem.TenantID, string(mem.Role))
	if err != nil {
		return nil, err
	}
	if err := s.sessions.Save(ctx, refresh, u.ID, mem.TenantID); err != nil {
		return nil, err
	}
	return &model.TokenResponse{AccessToken: access, RefreshToken: refresh, ExpiresIn: exp}, nil
}
