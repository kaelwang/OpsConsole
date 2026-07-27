package deployment

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/opsconsole/backend/internal/audit"
	"github.com/opsconsole/backend/internal/model"
	"github.com/opsconsole/backend/internal/pkg/gitlab"
)

// ErrUpstreamUnavailable indicates the CI/CD provider is not configured.
var ErrUpstreamUnavailable = errors.New("upstream cicd provider unavailable")

// Service implements deployment business logic.
type Service struct {
	repo  DeploymentRepository
	cicd  gitlab.CICDProvider
	audit audit.Sink
}

// NewService builds a deployment service.
func NewService(repo DeploymentRepository, cicd gitlab.CICDProvider, audit audit.Sink) *Service {
	return &Service{repo: repo, cicd: cicd, audit: audit}
}

// ListPipelines returns pipelines from the CI/CD provider.
func (s *Service) ListPipelines(ctx context.Context, projectID string) ([]gitlab.Pipeline, error) {
	if s.cicd == nil {
		return nil, ErrUpstreamUnavailable
	}
	return s.cicd.ListPipelines(ctx, projectID)
}

// ListDeployments returns persisted deployment records for the tenant.
func (s *Service) ListDeployments(ctx context.Context, tenantID string) ([]model.Deployment, error) {
	return s.repo.List(ctx, tenantID)
}

// Trigger starts a deployment and records a deployment record.
func (s *Service) Trigger(ctx context.Context, tenantID, projectID, ref string) (*model.Deployment, error) {
	if s.cicd == nil {
		return nil, ErrUpstreamUnavailable
	}
	p, err := s.cicd.Trigger(ctx, projectID, ref)
	if err != nil {
		return nil, err
	}
	d := &model.Deployment{
		ID:        uuid.NewString(),
		TenantID:  tenantID,
		ProjectID: projectID,
		Name:      "",
		Ref:       ref,
		Status:    p.Status,
		CreatedAt: time.Now(),
	}
	if err := s.repo.Create(ctx, *d); err != nil {
		return nil, err
	}
	if s.audit != nil {
		_ = s.audit.Record(ctx, model.AuditLog{
			TenantID: tenantID, Action: "write", Resource: "deployment", Detail: "trigger " + ref,
		})
	}
	return d, nil
}

// Rollback records a rollback action.
func (s *Service) Rollback(ctx context.Context, tenantID, deploymentID string) (*model.Deployment, error) {
	d := &model.Deployment{
		ID:        uuid.NewString(),
		TenantID:  tenantID,
		ProjectID: deploymentID,
		Name:      "",
		Ref:       "rollback",
		Status:    "pending",
		CreatedAt: time.Now(),
	}
	if err := s.repo.Create(ctx, *d); err != nil {
		return nil, err
	}
	if s.audit != nil {
		_ = s.audit.Record(ctx, model.AuditLog{
			TenantID: tenantID, Action: "write", Resource: "deployment", Detail: "rollback " + deploymentID,
		})
	}
	return d, nil
}
