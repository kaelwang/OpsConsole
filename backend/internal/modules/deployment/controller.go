package deployment

import (
	"errors"

	"github.com/gin-gonic/gin"
	"github.com/opsconsole/backend/internal/pkg/response"
	"github.com/opsconsole/backend/internal/platform/tenant"
)

// ListHandler returns pipelines from the CI/CD provider.
func (s *Service) ListHandler(c *gin.Context) {
	list, err := s.ListPipelines(c.Request.Context(), c.Query("project_id"))
	if err != nil {
		if errors.Is(err, ErrUpstreamUnavailable) {
			response.Upstream(c, "cicd provider not configured")
			return
		}
		response.Internal(c, "failed to list pipelines")
		return
	}
	response.OK(c, list)
}

// ListDeploymentsHandler returns the tenant's deployment history from the database.
func (s *Service) ListDeploymentsHandler(c *gin.Context) {
	list, err := s.ListDeployments(c.Request.Context(), tenant.TenantID(c.Request.Context()))
	if err != nil {
		response.Internal(c, "failed to list deployments")
		return
	}
	response.OK(c, list)
}

// TriggerHandler triggers a deployment.
func (s *Service) TriggerHandler(c *gin.Context) {
	var body struct {
		ProjectID string `json:"project_id"`
		Ref       string `json:"ref"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.BadRequest(c, "invalid request body")
		return
	}
	if body.ProjectID == "" || body.Ref == "" {
		response.BadRequest(c, "project_id and ref are required")
		return
	}
	d, err := s.Trigger(c.Request.Context(), tenant.TenantID(c.Request.Context()), body.ProjectID, body.Ref)
	if err != nil {
		if errors.Is(err, ErrUpstreamUnavailable) {
			response.Upstream(c, "cicd provider not configured")
			return
		}
		response.Internal(c, "failed to trigger deployment")
		return
	}
	response.Accepted(c, d)
}

// RollbackHandler records a rollback.
func (s *Service) RollbackHandler(c *gin.Context) {
	var body struct {
		DeploymentID string `json:"deployment_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		response.BadRequest(c, "invalid request body")
		return
	}
	if body.DeploymentID == "" {
		response.BadRequest(c, "deployment_id is required")
		return
	}
	d, err := s.Rollback(c.Request.Context(), tenant.TenantID(c.Request.Context()), body.DeploymentID)
	if err != nil {
		response.Internal(c, "failed to rollback")
		return
	}
	response.Created(c, d)
}
