package infrastructure

import (
	"errors"

	"github.com/gin-gonic/gin"
	"github.com/opsconsole/backend/internal/pkg/response"
	"github.com/opsconsole/backend/internal/platform/tenant"
)

// ListClustersHandler returns clusters for the tenant.
func (s *Service) ListClustersHandler(c *gin.Context) {
	list, err := s.ListClusters(c.Request.Context(), tenant.TenantID(c.Request.Context()))
	if err != nil {
		response.Internal(c, "failed to list clusters")
		return
	}
	response.OK(c, list)
}

// GetClusterHandler returns a single cluster.
func (s *Service) GetClusterHandler(c *gin.Context) {
	cl, err := s.GetCluster(c.Request.Context(), tenant.TenantID(c.Request.Context()), c.Param("id"))
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			response.NotFound(c, "cluster not found")
			return
		}
		response.Internal(c, "failed to get cluster")
		return
	}
	response.OK(c, cl)
}

// CreateClusterHandler registers a cluster.
func (s *Service) CreateClusterHandler(c *gin.Context) {
	var body struct {
		Name       string `json:"name"`
		Provider   string `json:"provider"`
		Kubeconfig string `json:"kubeconfig"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.BadRequest(c, "invalid request body")
		return
	}
	if body.Name == "" {
		response.BadRequest(c, "name is required")
		return
	}
	cl, err := s.CreateCluster(c.Request.Context(), tenant.TenantID(c.Request.Context()), body.Name, body.Provider, body.Kubeconfig)
	if err != nil {
		response.Internal(c, "failed to create cluster")
		return
	}
	response.Created(c, cl)
}

// ListHostsHandler returns hosts for the tenant.
func (s *Service) ListHostsHandler(c *gin.Context) {
	list, err := s.ListHosts(c.Request.Context(), tenant.TenantID(c.Request.Context()))
	if err != nil {
		response.Internal(c, "failed to list hosts")
		return
	}
	response.OK(c, list)
}

// PodsHandler returns pods for a cluster.
func (s *Service) PodsHandler(c *gin.Context) {
	pods, err := s.ListPods(c.Request.Context(), tenant.TenantID(c.Request.Context()), c.Param("id"), c.Query("namespace"))
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			response.NotFound(c, "cluster not found")
			return
		}
		if errors.Is(err, ErrK8sUnavailable) {
			response.Upstream(c, "kubernetes client not available in this mode")
			return
		}
		response.Upstream(c, "failed to list pods")
		return
	}
	response.OK(c, pods)
}

// NodesHandler returns node resource pressure for a cluster.
func (s *Service) NodesHandler(c *gin.Context) {
	nodes, err := s.ListNodes(c.Request.Context(), tenant.TenantID(c.Request.Context()), c.Param("id"))
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			response.NotFound(c, "cluster not found")
			return
		}
		if errors.Is(err, ErrK8sUnavailable) {
			response.Upstream(c, "kubernetes client not available in this mode")
			return
		}
		response.Upstream(c, "failed to list nodes")
		return
	}
	response.OK(c, nodes)
}
