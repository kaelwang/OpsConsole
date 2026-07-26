package infrastructure

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/opsconsole/backend/internal/pkg/response"
	"github.com/opsconsole/backend/internal/platform/tenant"
)

var execUpgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}

// wsWriter adapts a websocket connection to io.Writer for exec output streaming.
type wsWriter struct {
	c *websocket.Conn
}

func (w *wsWriter) Write(p []byte) (int, error) {
	if err := w.c.WriteMessage(websocket.TextMessage, p); err != nil {
		return 0, err
	}
	return len(p), nil
}

type execRequest struct {
	Namespace string   `json:"namespace"`
	Pod       string   `json:"pod"`
	Container string   `json:"container"`
	Command   []string `json:"command"`
	TTY       bool     `json:"tty"`
}

// ExecHandler bridges a WebSocket to a pod exec session via SPDy.
func (s *Service) ExecHandler(c *gin.Context) {
	tenantID := tenant.TenantID(c.Request.Context())
	clusterID := c.Param("id")
	cluster, err := s.GetCluster(c.Request.Context(), tenantID, clusterID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			response.NotFound(c, "cluster not found")
			return
		}
		response.Internal(c, "failed to get cluster")
		return
	}
	if s.factory == nil {
		response.Upstream(c, "kubernetes client not available in this mode")
		return
	}
	client, err := s.factory(*cluster)
	if err != nil {
		response.Upstream(c, "failed to build kubernetes client")
		return
	}
	ws, err := execUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer ws.Close()
	w := &wsWriter{c: ws}

	for {
		_, msg, err := ws.ReadMessage()
		if err != nil {
			return
		}
		var req execRequest
		if err := json.Unmarshal(msg, &req); err != nil {
			_ = ws.WriteMessage(websocket.TextMessage, []byte("invalid request"))
			continue
		}
		if err := client.StreamExec(c.Request.Context(), req.Namespace, req.Pod, req.Container, req.Command, nil, w, w, req.TTY); err != nil {
			_ = ws.WriteMessage(websocket.TextMessage, []byte("exec error: "+err.Error()))
			return
		}
		_ = ws.WriteMessage(websocket.TextMessage, []byte("exec completed"))
	}
}
