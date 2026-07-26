package model

import "time"

// Role identifies a tenant-scoped or platform-scoped role.
type Role string

const (
	RolePlatformAdmin Role = "platform_admin"
	RoleOwner         Role = "owner"
	RoleAdmin         Role = "admin"
	RoleMember        Role = "member"
	RoleViewer        Role = "viewer"
)

type User struct {
	ID           string
	Email        string
	PasswordHash string
	DisplayName  string
	CreatedAt    time.Time
}

type Membership struct {
	TenantID string
	UserID   string
	Role     Role
}

type Tenant struct {
	ID   string
	Name string
	Plan string
}

type Cluster struct {
	ID         string
	TenantID   string
	Name       string
	Provider   string
	Kubeconfig string
	CreatedAt  time.Time
}

type Host struct {
	ID        string
	TenantID  string
	ClusterID string
	Name      string
	IP        string
	Status    string
}

type AlertRule struct {
	ID         string
	TenantID   string
	Name       string
	Expr       string
	ForSeconds int
	Severity   string
	CreatedAt  time.Time
}

type NotificationChannel struct {
	ID        string
	TenantID  string
	Type      string
	Target    string
	CreatedAt time.Time
}

type Deployment struct {
	ID        string
	TenantID  string
	ProjectID string
	Name      string
	Ref       string
	Status    string
	CreatedAt time.Time
}

type AuditLog struct {
	ID        string
	TenantID  string
	UserID    string
	Action    string
	Resource  string
	Detail    string
	OK        bool
	CreatedAt time.Time
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
}

type Pod struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Node      string `json:"node"`
	Status    string `json:"status"`
	Age       string `json:"age"`
}

type Pipeline struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Ref    string `json:"ref"`
	Status string `json:"status"`
	WebURL string `json:"web_url"`
}

type LogEntry struct {
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"`
	Service   string `json:"service"`
	Message   string `json:"message"`
}

type AlertEvent struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Severity  string `json:"severity"`
	Status    string `json:"status"`
	StartedAt string `json:"started_at"`
}
