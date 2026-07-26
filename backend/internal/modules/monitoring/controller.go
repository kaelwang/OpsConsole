package monitoring

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/opsconsole/backend/internal/pkg/response"
	"github.com/opsconsole/backend/internal/platform/tenant"
)

// QueryHandler proxies a PromQL query with an 8s timeout.
func (s *Service) QueryHandler(c *gin.Context) {
	expr := c.Query("expr")
	step := c.Query("step")
	if expr == "" {
		response.BadRequest(c, "expr is required")
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 8*time.Second)
	defer cancel()
	data, err := s.Query(ctx, expr, step)
	if err != nil {
		if errors.Is(err, ErrUpstreamUnavailable) {
			response.Upstream(c, "metrics service not configured")
			return
		}
		response.Timeout(c, "metrics query failed")
		return
	}
	response.OK(c, json.RawMessage(data))
}

// ListRulesHandler returns alert rules for the tenant.
func (s *Service) ListRulesHandler(c *gin.Context) {
	list, err := s.ListAlertRules(c.Request.Context(), tenant.TenantID(c.Request.Context()))
	if err != nil {
		response.Internal(c, "failed to list alert rules")
		return
	}
	response.OK(c, list)
}

// CreateRuleHandler creates an alert rule.
func (s *Service) CreateRuleHandler(c *gin.Context) {
	var body struct {
		Name       string `json:"name"`
		Expr       string `json:"expr"`
		Severity   string `json:"severity"`
		ForSeconds int    `json:"for_seconds"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.BadRequest(c, "invalid request body")
		return
	}
	if body.Name == "" || body.Expr == "" {
		response.BadRequest(c, "name and expr are required")
		return
	}
	r, err := s.CreateAlertRule(c.Request.Context(), tenant.TenantID(c.Request.Context()), body.Name, body.Expr, body.Severity, body.ForSeconds)
	if err != nil {
		response.Internal(c, "failed to create alert rule")
		return
	}
	response.Created(c, r)
}

// ListNotifsHandler returns notification channels for the tenant.
func (s *Service) ListNotifsHandler(c *gin.Context) {
	list, err := s.ListNotifications(c.Request.Context(), tenant.TenantID(c.Request.Context()))
	if err != nil {
		response.Internal(c, "failed to list notifications")
		return
	}
	response.OK(c, list)
}

// CreateNotifHandler creates a notification channel.
func (s *Service) CreateNotifHandler(c *gin.Context) {
	var body struct {
		Type   string `json:"type"`
		Target string `json:"target"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.BadRequest(c, "invalid request body")
		return
	}
	if body.Type == "" || body.Target == "" {
		response.BadRequest(c, "type and target are required")
		return
	}
	n, err := s.CreateNotification(c.Request.Context(), tenant.TenantID(c.Request.Context()), body.Type, body.Target)
	if err != nil {
		response.Internal(c, "failed to create notification")
		return
	}
	response.Created(c, n)
}

// ListAlertsHandler returns active alert events. In memory mode this is an empty page.
func (s *Service) ListAlertsHandler(c *gin.Context) {
	response.OK(c, gin.H{"items": []interface{}{}, "total": 0})
}
