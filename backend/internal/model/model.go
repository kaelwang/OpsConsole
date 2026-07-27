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
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	DisplayName  string    `json:"displayName"`
	CreatedAt    time.Time `json:"createdAt"`
}

type Membership struct {
	TenantID    string `json:"tenantId"`
	UserID      string `json:"userId"`
	Role        Role   `json:"role"`
	DisplayName string `json:"displayName,omitempty"`
	Email       string `json:"email,omitempty"`
}

type Tenant struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Plan string `json:"plan"`
}

type Cluster struct {
	ID         string    `json:"id"`
	TenantID   string    `json:"tenantId"`
	Name       string    `json:"name"`
	Provider   string    `json:"provider"`
	Kubeconfig string    `json:"kubeconfigRef"`
	CreatedAt  time.Time `json:"createdAt"`
}

type Host struct {
	ID        string    `json:"id"`
	TenantID  string    `json:"tenantId"`
	ClusterID string    `json:"clusterId"`
	Name      string    `json:"name"`
	IP        string    `json:"ip"`
	OS        string    `json:"os"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
}

type AlertRule struct {
	ID         string    `json:"id"`
	TenantID   string    `json:"tenantId"`
	Name       string    `json:"name"`
	Expr       string    `json:"expr"`
	ForSeconds int       `json:"forSeconds"`
	Severity   string    `json:"severity"`
	ChannelIDs []string  `json:"channelIds"`
	CreatedBy  string    `json:"createdBy"`
	CreatedAt  time.Time `json:"createdAt"`
}

type NotificationChannel struct {
	ID        string    `json:"id"`
	TenantID  string    `json:"tenantId"`
	Type      string    `json:"type"`
	Target    string    `json:"target"`
	CreatedAt time.Time `json:"createdAt"`
}

type Deployment struct {
	ID        string    `json:"id"`
	TenantID  string    `json:"tenantId"`
	ProjectID string    `json:"projectId"`
	Name      string    `json:"name"`
	Ref       string    `json:"ref"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
}

type AuditLog struct {
	ID        string    `json:"id"`
	TenantID  string    `json:"tenantId"`
	UserID    string    `json:"userId"`
	Action    string    `json:"action"`
	Resource  string    `json:"resource"`
	Detail    string    `json:"detail"`
	OK        bool      `json:"ok"`
	CreatedAt time.Time `json:"createdAt"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type TokenResponse struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	ExpiresIn    int    `json:"expiresIn"`
	TenantID     string `json:"tenantId"`
	Role         string `json:"role"`
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
	ID       string            `json:"id"`
	RuleID   string            `json:"ruleId"`
	Severity string            `json:"severity"`
	Status   string            `json:"status"`
	FiredAt  string            `json:"firedAt"`
	Summary  string            `json:"summary"`
	Labels   map[string]string `json:"labels"`
}
