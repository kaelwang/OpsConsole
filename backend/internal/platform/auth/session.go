package auth

import (
	"context"
	"sync"
)

// SessionStore persists refresh tokens. PG mode should use Redis; dev mode uses memory.
type SessionStore interface {
	Save(ctx context.Context, refreshToken, userID, tenantID string) error
	Delete(ctx context.Context, refreshToken string) error
}

// MemStore is an in-memory session store for development.
type MemStore struct {
	mu sync.Map
}

// NewMemStore builds an in-memory session store.
func NewMemStore() *MemStore { return &MemStore{} }

// Save records the refresh token mapping.
func (m *MemStore) Save(ctx context.Context, refreshToken, userID, tenantID string) error {
	m.mu.Store(refreshToken, userID)
	return nil
}

// Delete removes a refresh token.
func (m *MemStore) Delete(ctx context.Context, refreshToken string) error {
	m.mu.Delete(refreshToken)
	return nil
}
