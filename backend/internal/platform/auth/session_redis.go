package auth

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

// RedisStore persists refresh tokens in Redis (used in PG / production mode).
type RedisStore struct {
	client *redis.Client
	ttl    time.Duration
}

// NewRedisStore builds a Redis-backed session store.
func NewRedisStore(client *redis.Client) *RedisStore {
	return &RedisStore{client: client, ttl: 7 * 24 * time.Hour}
}

// Save stores the refresh token with a 7-day expiry.
func (r *RedisStore) Save(ctx context.Context, refreshToken, userID, tenantID string) error {
	return r.client.Set(ctx, "session:"+refreshToken, userID, r.ttl).Err()
}

// Delete removes the refresh token.
func (r *RedisStore) Delete(ctx context.Context, refreshToken string) error {
	return r.client.Del(ctx, "session:"+refreshToken).Err()
}
