package auth

import (
	"context"
	"testing"
	"time"

	"github.com/opsconsole/backend/internal/model"
	"github.com/opsconsole/backend/internal/platform/store"
	"golang.org/x/crypto/bcrypt"
)

func TestBcryptHashVerify(t *testing.T) {
	pw := "super-secret-123"
	hash, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if err := bcrypt.CompareHashAndPassword(hash, []byte(pw)); err != nil {
		t.Fatalf("correct password should verify: %v", err)
	}
	if err := bcrypt.CompareHashAndPassword(hash, []byte("wrong")); err == nil {
		t.Fatal("wrong password must NOT verify")
	}
}

func TestJWTSignAndVerify(t *testing.T) {
	secret := "test-secret"
	access, refresh, expiresIn, err := GenerateTokens(secret, "u-1", "t-1", string(model.RoleOwner))
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if expiresIn != 900 {
		t.Fatalf("expiresIn want 900 (15m) got %d", expiresIn)
	}

	ac, err := ParseToken(secret, access)
	if err != nil {
		t.Fatalf("parse access: %v", err)
	}
	if ac.UserID != "u-1" || ac.TenantID != "t-1" || ac.Role != string(model.RoleOwner) {
		t.Fatalf("access claims mismatch: %+v", ac)
	}
	if d := time.Until(ac.RegisteredClaims.ExpiresAt.Time); d < 14*time.Minute || d > 16*time.Minute {
		t.Fatalf("access exp not ~15m: %v", d)
	}

	rc, err := ParseToken(secret, refresh)
	if err != nil {
		t.Fatalf("parse refresh: %v", err)
	}
	if d := time.Until(rc.RegisteredClaims.ExpiresAt.Time); d < 6*24*time.Hour || d > 8*24*time.Hour {
		t.Fatalf("refresh exp not ~7d: %v", d)
	}

	// wrong secret must fail verification
	if _, err := ParseToken("other-secret", access); err == nil {
		t.Fatal("wrong secret should fail verification")
	}
	// tampered token must fail
	if _, err := ParseToken(secret, access+"x"); err == nil {
		t.Fatal("tampered token should fail verification")
	}
}

func TestLoginHappyAndReject(t *testing.T) {
	db := store.NewMemDB()
	svc := NewService(NewMemUserRepo(db), NewMemStore(), "secret")
	ctx := context.Background()

	tok, err := svc.Login(ctx, "admin@corp.com", store.SeedPassword)
	if err != nil {
		t.Fatalf("login should succeed: %v", err)
	}
	if tok.AccessToken == "" || tok.RefreshToken == "" || tok.ExpiresIn != 900 {
		t.Fatalf("bad token response: %+v", tok)
	}

	if _, err := svc.Login(ctx, "admin@corp.com", "nope"); err != ErrInvalidCredentials {
		t.Fatalf("wrong password want ErrInvalidCredentials got %v", err)
	}
	if _, err := svc.Login(ctx, "ghost@corp.com", "x"); err != ErrInvalidCredentials {
		t.Fatalf("unknown user want ErrInvalidCredentials got %v", err)
	}
}
