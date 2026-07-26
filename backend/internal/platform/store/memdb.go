package store

import (
	"sync"
	"time"

	"github.com/opsconsole/backend/internal/model"
	"golang.org/x/crypto/bcrypt"
)

// MemDB is an in-memory data store used in development / memory repository mode.
// It is safe for concurrent use via the embedded mutex.
type MemDB struct {
	Mu         sync.RWMutex
	Tenants    map[string]model.Tenant
	Users      map[string]model.User
	Members    map[string]model.Membership
	Clusters   map[string]model.Cluster
	Hosts      map[string]model.Host
	AlertRules map[string]model.AlertRule
	Notifs     map[string]model.NotificationChannel
	Deploys    map[string]model.Deployment
	Audit      []model.AuditLog
}

// NewMemDB builds a seeded in-memory database.
func NewMemDB() *MemDB {
	db := &MemDB{
		Tenants:    map[string]model.Tenant{},
		Users:      map[string]model.User{},
		Members:    map[string]model.Membership{},
		Clusters:   map[string]model.Cluster{},
		Hosts:      map[string]model.Host{},
		AlertRules: map[string]model.AlertRule{},
		Notifs:     map[string]model.NotificationChannel{},
		Deploys:    map[string]model.Deployment{},
	}
	db.seed()
	return db
}

const (
	SeedTenantID = "t-0001"
	SeedAdminID  = "u-admin"
	SeedViewerID = "u-viewer"
	SeedPassword = "opsconsole123"
)

func hash(pw string) string {
	h, _ := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.MinCost)
	return string(h)
}

func (db *MemDB) seed() {
	now := time.Now()
	db.Tenants[SeedTenantID] = model.Tenant{ID: SeedTenantID, Name: "Acme Corp", Plan: "enterprise"}
	pw := hash(SeedPassword)
	db.Users[SeedAdminID] = model.User{ID: SeedAdminID, Email: "admin@corp.com", PasswordHash: pw, DisplayName: "Admin", CreatedAt: now}
	db.Users[SeedViewerID] = model.User{ID: SeedViewerID, Email: "viewer@corp.com", PasswordHash: pw, DisplayName: "Viewer", CreatedAt: now}
	db.Members[SeedTenantID+"|"+SeedAdminID] = model.Membership{TenantID: SeedTenantID, UserID: SeedAdminID, Role: model.RoleOwner}
	db.Members[SeedTenantID+"|"+SeedViewerID] = model.Membership{TenantID: SeedTenantID, UserID: SeedViewerID, Role: model.RoleViewer}
	db.Clusters["c-0001"] = model.Cluster{ID: "c-0001", TenantID: SeedTenantID, Name: "prod-cluster", Provider: "eks", CreatedAt: now}
	db.Hosts["h-0001"] = model.Host{ID: "h-0001", TenantID: SeedTenantID, ClusterID: "c-0001", Name: "node-1", IP: "10.0.0.1", Status: "ready"}
	db.AlertRules["ar-0001"] = model.AlertRule{ID: "ar-0001", TenantID: SeedTenantID, Name: "HighCPU", Expr: "cpu > 80", ForSeconds: 300, Severity: "warning", CreatedAt: now}
	db.Notifs["nc-0001"] = model.NotificationChannel{ID: "nc-0001", TenantID: SeedTenantID, Type: "email", Target: "oncall@corp.com", CreatedAt: now}
	db.Deploys["d-0001"] = model.Deployment{ID: "d-0001", TenantID: SeedTenantID, ProjectID: "p-1", Name: "web", Ref: "main", Status: "success", CreatedAt: now}
}
