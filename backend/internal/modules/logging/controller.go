package logging

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/opsconsole/backend/internal/pkg/response"
	"github.com/opsconsole/backend/internal/platform/tenant"
)

var upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}

// SearchHandler runs a log search with an 8s timeout.
func (s *Service) SearchHandler(c *gin.Context) {
	tenantID := tenant.TenantID(c.Request.Context())
	page, limit := 1, 50
	if p, err := strconv.Atoi(c.Query("page")); err == nil && p > 0 {
		page = p
	}
	if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 {
		limit = l
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 8*time.Second)
	defer cancel()
	data, err := s.Search(ctx, tenantID, c.Query("q"), c.Query("level"), c.Query("service"), c.Query("from"), c.Query("to"), page, limit)
	if err != nil {
		if errors.Is(err, ErrUpstreamUnavailable) {
			response.Upstream(c, "log service not configured")
			return
		}
		response.Timeout(c, "log query failed")
		return
	}
	response.OK(c, data)
}

// TailHandler streams new log lines over a WebSocket, polling every 2s.
func (s *Service) TailHandler(c *gin.Context) {
	if s.os == nil {
		response.Upstream(c, "log service not configured")
		return
	}
	tenantID := tenant.TenantID(c.Request.Context())
	ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer ws.Close()
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-c.Request.Context().Done():
			return
		case <-ticker.C:
			data, err := s.Search(c.Request.Context(), tenantID, c.Query("q"), c.Query("level"), c.Query("service"), "", "", 1, 20)
			if err != nil {
				continue
			}
			b, err := json.Marshal(data)
			if err != nil {
				continue
			}
			_ = ws.WriteMessage(websocket.TextMessage, b)
		}
	}
}
