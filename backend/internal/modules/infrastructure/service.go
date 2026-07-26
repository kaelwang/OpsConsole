package infrastructure

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/opsconsole/backend/internal/audit"
	"github.com/opsconsole/backend/internal/model"
	"github.com/opsconsole/backend/internal/pkg/k8sclient"
)

// ErrK8sUnavailable indicates no Kubernetes client can be built in this mode.
var ErrK8sUnavailable = errors.New("kubernetes client unavailable")

// K8sFactory builds a Kubernetes client for a cluster.
type K8sFactory func(cluster model.Cluster) (*k8sclient.Client, error)

// Service implements infrastructure business logic.
type Service struct {
	clusters ClusterRepository
	hosts    HostRepository
	factory  K8sFactory
	audit    audit.Sink
}

// NewService builds an infrastructure service.
func NewService(clusters ClusterRepository, hosts HostRepository, factory K8sFactory, audit audit.Sink) *Service {
	return &Service{clusters: clusters, hosts: hosts, factory: factory, audit: audit}
}

// ListClusters returns clusters for the tenant.
func (s *Service) ListClusters(ctx context.Context, tenantID string) ([]model.Cluster, error) {
	return s.clusters.List(ctx, tenantID)
}

// GetCluster returns a single cluster.
func (s *Service) GetCluster(ctx context.Context, tenantID, id string) (*model.Cluster, error) {
	return s.clusters.Get(ctx, tenantID, id)
}

// CreateCluster registers a cluster and records the action.
func (s *Service) CreateCluster(ctx context.Context, tenantID, name, provider, kubeconfig string) (*model.Cluster, error) {
	c := &model.Cluster{
		ID:         uuid.NewString(),
		TenantID:   tenantID,
		Name:       name,
		Provider:   provider,
		Kubeconfig: kubeconfig,
		CreatedAt:  time.Now(),
	}
	if err := s.clusters.Create(ctx, *c); err != nil {
		return nil, err
	}
	if s.audit != nil {
		_ = s.audit.Record(ctx, model.AuditLog{
			TenantID: tenantID, Action: "write", Resource: "infrastructure", Detail: "register cluster " + name,
		})
	}
	return c, nil
}

// ListHosts returns hosts for the tenant.
func (s *Service) ListHosts(ctx context.Context, tenantID string) ([]model.Host, error) {
	return s.hosts.List(ctx, tenantID)
}

// ListPods returns pods for a cluster via the Kubernetes client.
func (s *Service) ListPods(ctx context.Context, tenantID, clusterID, namespace string) ([]model.Pod, error) {
	cluster, err := s.clusters.Get(ctx, tenantID, clusterID)
	if err != nil {
		return nil, err
	}
	if s.factory == nil {
		return nil, ErrK8sUnavailable
	}
	client, err := s.factory(*cluster)
	if err != nil {
		return nil, err
	}
	return client.ListPods(ctx, namespace)
}
