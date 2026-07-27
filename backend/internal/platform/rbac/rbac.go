package rbac

import (
	"github.com/gin-gonic/gin"
	"github.com/opsconsole/backend/internal/audit"
	"github.com/opsconsole/backend/internal/model"
	"github.com/opsconsole/backend/internal/pkg/response"
	"github.com/opsconsole/backend/internal/platform/tenant"
)

type permission struct {
	resource string
	action   string
}

var rolePermissions = map[model.Role][]permission{
	model.RolePlatformAdmin: allPermissions(),
	model.RoleOwner:         ownerPermissions(),
	model.RoleAdmin:         adminPermissions(),
	model.RoleMember:        memberPermissions(),
	model.RoleViewer:        viewerPermissions(),
}

func allPermissions() []permission {
	resources := []string{"monitoring", "logging", "deployment", "infrastructure", "audit", "rbac", "tenant"}
	actions := []string{"read", "write"}
	out := make([]permission, 0, len(resources)*len(actions))
	for _, r := range resources {
		for _, a := range actions {
			out = append(out, permission{r, a})
		}
	}
	return out
}

func ownerPermissions() []permission {
	return append(adminPermissions(),
		permission{"infrastructure", "write"},
		permission{"rbac", "write"},
		permission{"tenant", "write"},
	)
}

func adminPermissions() []permission {
	return []permission{
		{"monitoring", "read"}, {"monitoring", "write"},
		{"logging", "read"},
		{"deployment", "read"}, {"deployment", "write"},
		{"infrastructure", "read"}, {"infrastructure", "write"},
		{"audit", "read"},
		{"rbac", "read"},
	}
}

func memberPermissions() []permission {
	return []permission{
		{"monitoring", "read"},
		{"logging", "read"},
		{"deployment", "read"},
		{"infrastructure", "read"},
	}
}

func viewerPermissions() []permission {
	return []permission{
		{"monitoring", "read"},
		{"logging", "read"},
		{"deployment", "read"},
		{"infrastructure", "read"},
		{"audit", "read"},
	}
}

// HasPermission reports whether a role permits resource:action.
func HasPermission(role model.Role, resource, action string) bool {
	for _, p := range rolePermissions[role] {
		if p.resource == resource && p.action == action {
			return true
		}
	}
	return false
}

// RequirePermission gates a handler by resource:action, recording denials via sink.
func RequirePermission(resource, action string, sink audit.Sink) gin.HandlerFunc {
	return func(c *gin.Context) {
		role := tenant.Role(c.Request.Context())
		if HasPermission(role, resource, action) {
			c.Next()
			return
		}
		detail := "missing permission " + resource + ":" + action
		if sink != nil {
			_ = sink.Denied(c.Request.Context(), tenant.TenantID(c.Request.Context()), tenant.UserID(c.Request.Context()), action, resource, detail)
		}
		response.Forbidden(c, detail)
		c.Abort()
	}
}

// AssignableRoles lists roles that may be granted through the assignment API.
func AssignableRoles() []model.Role {
	return []model.Role{model.RoleOwner, model.RoleAdmin, model.RoleMember, model.RoleViewer}
}

// RoleView is the API view of a role's permission set (consumed by the frontend
// RBAC role picker).
type RoleView struct {
	Role        string   `json:"role"`
	RoleLabel   string   `json:"roleLabel"`
	Permissions []string `json:"permissions"`
}

var roleLabels = map[model.Role]string{
	model.RolePlatformAdmin: "平台管理员",
	model.RoleOwner:         "租户所有者",
	model.RoleAdmin:         "管理员",
	model.RoleMember:        "成员",
	model.RoleViewer:        "访客",
}

// ListRolesHandler returns the assignable roles together with their permission
// sets. It backs GET /api/v1/rbac/roles.
func ListRolesHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		out := make([]RoleView, 0, len(AssignableRoles()))
		for _, r := range AssignableRoles() {
			perms := make([]string, 0, len(rolePermissions[r]))
			for _, p := range rolePermissions[r] {
				perms = append(perms, p.resource+":"+p.action)
			}
			out = append(out, RoleView{Role: string(r), RoleLabel: roleLabels[r], Permissions: perms})
		}
		response.OK(c, out)
	}
}
