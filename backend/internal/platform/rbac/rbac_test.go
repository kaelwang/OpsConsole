package rbac

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/opsconsole/backend/internal/audit"
	"github.com/opsconsole/backend/internal/model"
	"github.com/opsconsole/backend/internal/platform/tenant"
)

func TestHasPermissionMatrix(t *testing.T) {
	cases := []struct {
		role                        model.Role
		resource, action           string
		want                        bool
	}{
		{model.RoleViewer, "monitoring", "read", true},
		{model.RoleViewer, "infrastructure", "write", false},
		{model.RoleViewer, "deployment", "write", false},
		{model.RoleViewer, "audit", "read", true},
		{model.RoleMember, "monitoring", "read", true},
		{model.RoleMember, "monitoring", "write", false},
		{model.RoleMember, "infrastructure", "write", false},
		{model.RoleAdmin, "monitoring", "write", true},
		{model.RoleAdmin, "infrastructure", "write", true},
		{model.RoleAdmin, "rbac", "write", false},
		{model.RoleAdmin, "tenant", "write", false},
		{model.RoleOwner, "infrastructure", "write", true},
		{model.RoleOwner, "rbac", "write", true},
		{model.RoleOwner, "tenant", "write", true},
		{model.RoleOwner, "audit", "write", false},
		{model.RolePlatformAdmin, "audit", "write", true},
		{model.RolePlatformAdmin, "tenant", "write", true},
		{model.RolePlatformAdmin, "rbac", "write", true},
	}
	for _, c := range cases {
		if got := HasPermission(c.role, c.resource, c.action); got != c.want {
			t.Errorf("HasPermission(%s,%s,%s)=%v want %v", c.role, c.resource, c.action, got, c.want)
		}
	}
}

func TestPlatformAdminCrossTenantReach(t *testing.T) {
	// platform_admin must hold EVERY resource:action permission (cross-tenant reach)
	resources := []string{"monitoring", "logging", "deployment", "infrastructure", "audit", "rbac", "tenant"}
	for _, r := range resources {
		for _, a := range []string{"read", "write"} {
			if !HasPermission(model.RolePlatformAdmin, r, a) {
				t.Errorf("platform_admin should permit %s:%s (cross-tenant reach)", r, a)
			}
		}
	}
}

type fakeSink struct{ denied int }

func (f *fakeSink) Record(_ context.Context, _ model.AuditLog) error { return nil }
func (f *fakeSink) Denied(_ context.Context, _, _, _, _, _ string) error {
	f.denied++
	return nil
}

// serve builds a gin engine that injects the given role into the request context,
// then gates POST /x on infrastructure:write.
func serve(role model.Role, sink audit.Sink) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Request = c.Request.WithContext(tenant.WithPrincipal(c.Request.Context(), tenant.Principal{
			UserID: "u", TenantID: "t", Role: role,
		}))
		c.Next()
	})
	r.POST("/x", RequirePermission("infrastructure", "write", sink), func(c *gin.Context) {
		c.Status(http.StatusOK)
	})
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/x", nil))
	return rec
}

func TestRequirePermissionDeniesViewerWriteButAllowsOwner(t *testing.T) {
	sink := &fakeSink{}

	// viewer attempting a write -> 403 + denial audited
	recV := serve(model.RoleViewer, sink)
	if recV.Code != http.StatusForbidden {
		t.Fatalf("viewer write want 403 got %d", recV.Code)
	}
	if sink.denied != 1 {
		t.Fatalf("denial should be audited exactly once, got %d", sink.denied)
	}

	// owner attempting a write -> 200 (allowed), no new denial
	recO := serve(model.RoleOwner, sink)
	if recO.Code != http.StatusOK {
		t.Fatalf("owner write want 200 got %d", recO.Code)
	}
	if sink.denied != 1 {
		t.Fatalf("owner write must not be audited as denial, got %d", sink.denied)
	}
}
