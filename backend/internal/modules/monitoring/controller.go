package monitoring

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/opsconsole/backend/internal/pkg/response"
	"github.com/opsconsole/backend/internal/platform/tenant"
)

// labelValueRe 校验 node/cluster/instance 标签过滤值，在包初始化时编译一次，
// 避免每次请求都重新编译正则。
var labelValueRe = regexp.MustCompile(`^[A-Za-z0-9_.\-]+$`)

// QueryHandler proxies a PromQL query with an 8s timeout. Optional node/cluster/
// instance query params restrict the result via VictoriaMetrics label_filters.
func (s *Service) QueryHandler(c *gin.Context) {
	expr := c.Query("expr")
	step := c.Query("step")
	start := c.Query("start")
	end := c.Query("end")
	if expr == "" {
		response.BadRequest(c, "expr is required")
		return
	}
	filters, err := buildLabelFilters(c)
	if err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 8*time.Second)
	defer cancel()
	data, err := s.Query(ctx, expr, step, start, end, filters)
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
		Name       string   `json:"name"`
		Expr       string   `json:"expr"`
		Severity   string   `json:"severity"`
		ForSeconds int      `json:"for_seconds"`
		ChannelIDs []string `json:"channelIds"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.BadRequest(c, "invalid request body")
		return
	}
	if body.Name == "" || body.Expr == "" {
		response.BadRequest(c, "name and expr are required")
		return
	}
	r, err := s.CreateAlertRule(c.Request.Context(), tenant.TenantID(c.Request.Context()), body.Name, body.Expr, body.Severity, body.ForSeconds, body.ChannelIDs)
	if err != nil {
		response.Internal(c, "failed to create alert rule: "+err.Error())
		return
	}
	response.Created(c, r)
}

// SyncAlertingHandler forces a regeneration of the Alertmanager/vmalert config
// from the database and a reload of both services.
func (s *Service) SyncAlertingHandler(c *gin.Context) {
	if s.cm == nil {
		response.Upstream(c, "alerting pipeline not configured (set OPS_ALERTMANAGER_URL)")
		return
	}
	if err := s.syncConfig(c.Request.Context()); err != nil {
		response.Internal(c, "alerting sync failed: "+err.Error())
		return
	}
	response.OK(c, gin.H{"status": "synced"})
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

// DeleteNotifHandler removes a notification channel.
func (s *Service) DeleteNotifHandler(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		response.BadRequest(c, "id is required")
		return
	}
	if err := s.DeleteNotification(c.Request.Context(), tenant.TenantID(c.Request.Context()), id); err != nil {
		response.Internal(c, "failed to delete notification")
		return
	}
	response.NoContent(c)
}

// ListAlertsHandler returns active alert events evaluated by vmalert.
func (s *Service) ListAlertsHandler(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 8*time.Second)
	defer cancel()
	list, err := s.ListActiveAlerts(ctx)
	if err != nil {
		if errors.Is(err, ErrUpstreamUnavailable) {
			response.Upstream(c, "alerting service not configured")
			return
		}
		response.Timeout(c, "alert query failed")
		return
	}
	if sev := c.Query("severity"); sev != "" {
		filtered := list[:0]
		for _, a := range list {
			if a.Severity == sev {
				filtered = append(filtered, a)
			}
		}
		list = filtered
	}
	response.OK(c, gin.H{
		"items":   list,
		"total":   len(list),
		"page":    1,
		"limit":   len(list),
		"hasMore": false,
	})
}

// NodesHandler returns the list of node identifiers scraped by node_exporter.
func (s *Service) NodesHandler(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 8*time.Second)
	defer cancel()
	nodes, err := s.ListNodes(ctx)
	if err != nil {
		if errors.Is(err, ErrUpstreamUnavailable) {
			response.Upstream(c, "metrics service not configured")
			return
		}
		response.Timeout(c, "node query failed")
		return
	}
	response.OK(c, nodes)
}

// buildLabelFilters assembles a VictoriaMetrics label_filters expression from
// the allowed node/cluster/instance params. Values are restricted to a safe
// character set to prevent injection into the PromQL label filter syntax.
func buildLabelFilters(c *gin.Context) (string, error) {
	allowed := map[string]string{
		"instance":  c.Query("instance"),
		"node":      c.Query("node"),
		"cluster":   c.Query("cluster"),
		"namespace": c.Query("namespace"),
	}
	parts := make([]string, 0, len(allowed))
	for key, val := range allowed {
		if val == "" {
			continue
		}
		if !labelValueRe.MatchString(val) {
			return "", fmt.Errorf("invalid label value for %s", key)
		}
		parts = append(parts, key+":"+val)
	}
	if len(parts) == 0 {
		return "", nil
	}
	sort.Strings(parts)
	return strings.Join(parts, ","), nil
}
