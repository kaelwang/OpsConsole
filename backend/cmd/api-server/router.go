package main

import (
	"time"

	"github.com/gin-gonic/gin"

	"github.com/opsconsole/backend/internal/audit"
	"github.com/opsconsole/backend/internal/config"
	"github.com/opsconsole/backend/internal/modules/deployment"
	"github.com/opsconsole/backend/internal/modules/infrastructure"
	"github.com/opsconsole/backend/internal/modules/logging"
	"github.com/opsconsole/backend/internal/modules/monitoring"
	"github.com/opsconsole/backend/internal/platform/auth"
	"github.com/opsconsole/backend/internal/platform/middleware"
	"github.com/opsconsole/backend/internal/platform/rbac"
)

// buildRouter wires every endpoint. The entry point only assembles; no business logic here.
func buildRouter(
	cfg *config.Config,
	authSvc *auth.Service,
	auditSvc *audit.Service,
	assignRepo rbac.AssignRepository,
	monSvc *monitoring.Service,
	logSvc *logging.Service,
	depSvc *deployment.Service,
	infraSvc *infrastructure.Service,
) *gin.Engine {
	r := gin.New()
	r.Use(gin.Logger(), middleware.Recovery())

	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	api := r.Group("/api/v1")
	api.Use(middleware.NewRateLimit(50, time.Minute).Middleware())

	// Public endpoint.
	api.POST("/login", authSvc.LoginHandler)

	// Authenticated endpoints.
	secured := api.Group("")
	secured.Use(middleware.JWTAuth(cfg.JWTSecret))

	// RBAC assignment.
	g := secured.Group("/rbac")
	g.GET("/memberships", rbac.RequirePermission("rbac", "read", auditSvc), rbac.ListMembershipsHandler(assignRepo))
	g.POST("/memberships", rbac.RequirePermission("rbac", "write", auditSvc), rbac.AssignHandler(assignRepo))
	g.GET("/roles", rbac.RequirePermission("rbac", "read", auditSvc), rbac.ListRolesHandler())

	// Audit logs.
	secured.GET("/audit/logs", rbac.RequirePermission("audit", "read", auditSvc), auditSvc.ListHandler)

	// Monitoring.
	m := secured.Group("/monitoring")
	m.GET("/query", rbac.RequirePermission("monitoring", "read", auditSvc), monSvc.QueryHandler)
	m.GET("/alert-rules", rbac.RequirePermission("monitoring", "read", auditSvc), monSvc.ListRulesHandler)
	m.POST("/alert-rules", rbac.RequirePermission("monitoring", "write", auditSvc), monSvc.CreateRuleHandler)
	m.GET("/notifications", rbac.RequirePermission("monitoring", "read", auditSvc), monSvc.ListNotifsHandler)
	m.POST("/notifications", rbac.RequirePermission("monitoring", "write", auditSvc), monSvc.CreateNotifHandler)
	m.DELETE("/notifications/:id", rbac.RequirePermission("monitoring", "write", auditSvc), monSvc.DeleteNotifHandler)
	m.GET("/alerts", rbac.RequirePermission("monitoring", "read", auditSvc), monSvc.ListAlertsHandler)

	// Logging.
	l := secured.Group("/logging")
	l.GET("/search", rbac.RequirePermission("logging", "read", auditSvc), logSvc.SearchHandler)
	l.GET("/tail", rbac.RequirePermission("logging", "read", auditSvc), logSvc.TailHandler)

	// Deployment.
	d := secured.Group("/deployment")
	d.GET("/pipelines", rbac.RequirePermission("deployment", "read", auditSvc), depSvc.ListHandler)
	d.GET("/deployments", rbac.RequirePermission("deployment", "read", auditSvc), depSvc.ListDeploymentsHandler)
	d.POST("/trigger", rbac.RequirePermission("deployment", "write", auditSvc), depSvc.TriggerHandler)
	d.POST("/rollback", rbac.RequirePermission("deployment", "write", auditSvc), depSvc.RollbackHandler)

	// Infrastructure.
	i := secured.Group("/infrastructure")
	i.GET("/clusters", rbac.RequirePermission("infrastructure", "read", auditSvc), infraSvc.ListClustersHandler)
	i.GET("/clusters/:id", rbac.RequirePermission("infrastructure", "read", auditSvc), infraSvc.GetClusterHandler)
	i.POST("/clusters", rbac.RequirePermission("infrastructure", "write", auditSvc), infraSvc.CreateClusterHandler)
	i.GET("/hosts", rbac.RequirePermission("infrastructure", "read", auditSvc), infraSvc.ListHostsHandler)
	i.GET("/clusters/:id/pods", rbac.RequirePermission("infrastructure", "read", auditSvc), infraSvc.PodsHandler)
	i.GET("/clusters/:id/exec", rbac.RequirePermission("infrastructure", "write", auditSvc), infraSvc.ExecHandler)

	// Serve the embedded frontend SPA (history-API fallback) for all routes
	// not matched by the API above.
	r.NoRoute(spaHandler())

	return r
}
