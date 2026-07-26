package tenant

import (
	"context"
	"testing"

	"github.com/opsconsole/backend/internal/model"
)

func TestContextInjection(t *testing.T) {
	ctx := WithPrincipal(context.Background(), Principal{UserID: "u", TenantID: "t", Role: model.RoleOwner})
	if UserID(ctx) != "u" {
		t.Fatalf("UserID want u got %q", UserID(ctx))
	}
	if TenantID(ctx) != "t" {
		t.Fatalf("TenantID want t got %q", TenantID(ctx))
	}
	if Role(ctx) != model.RoleOwner {
		t.Fatalf("Role want owner got %q", Role(ctx))
	}
	if IsPlatformAdmin(ctx) {
		t.Fatal("owner must not be platform admin")
	}

	// no principal -> empty strings
	empty := context.Background()
	if UserID(empty) != "" || TenantID(empty) != "" || Role(empty) != "" {
		t.Fatal("missing principal must yield empty values")
	}

	// platform admin flag
	pa := WithPrincipal(context.Background(), Principal{Role: model.RolePlatformAdmin})
	if !IsPlatformAdmin(pa) {
		t.Fatal("platform admin flag expected")
	}
}
