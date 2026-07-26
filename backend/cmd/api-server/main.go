package main

import (
	"context"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/opsconsole/backend/internal/audit"
	"github.com/opsconsole/backend/internal/config"
	"github.com/opsconsole/backend/internal/model"
	"github.com/opsconsole/backend/internal/modules/deployment"
	"github.com/opsconsole/backend/internal/modules/infrastructure"
	"github.com/opsconsole/backend/internal/modules/logging"
	"github.com/opsconsole/backend/internal/modules/monitoring"
	"github.com/opsconsole/backend/internal/pkg/gitlab"
	"github.com/opsconsole/backend/internal/pkg/k8sclient"
	"github.com/opsconsole/backend/internal/pkg/opensearch"
	"github.com/opsconsole/backend/internal/pkg/victoriametrics"
	"github.com/opsconsole/backend/internal/platform/auth"
	"github.com/opsconsole/backend/internal/platform/rbac"
	"github.com/opsconsole/backend/internal/platform/store"
)

func main() {
	cfg := config.Load()
	mem := store.NewMemDB()

	// Optional PostgreSQL pool (only when PG mode is enabled).
	var pool *pgxpool.Pool
	if cfg.IsPG() {
		p, err := pgxpool.New(context.Background(), cfg.DatabaseURL)
		if err != nil {
			log.Fatalf("postgres connect: %v", err)
		}
		pool = p
		defer pool.Close()
	}

	// Audit (dual repository).
	var auditRepo audit.Repository
	if pool != nil {
		auditRepo = audit.NewPGRepository(pool)
	} else {
		auditRepo = audit.NewMemRepository(mem)
	}
	auditSvc := audit.NewService(auditRepo)

	// Auth (dual repository).
	var userRepo auth.UserRepository
	if pool != nil {
		userRepo = auth.NewPGUserRepo(pool)
	} else {
		userRepo = auth.NewMemUserRepo(mem)
	}
	var session auth.SessionStore = auth.NewMemStore()
	authSvc := auth.NewService(userRepo, session, cfg.JWTSecret)

	// RBAC assignment (dual repository).
	var assignRepo rbac.AssignRepository
	if pool != nil {
		assignRepo = rbac.NewPGAssignRepository(pool)
	} else {
		assignRepo = rbac.NewMemAssignRepository(mem)
	}

	// Monitoring (dual repository).
	var alertRepo monitoring.AlertRuleRepository
	var notifRepo monitoring.NotificationRepository
	if pool != nil {
		alertRepo = monitoring.NewPGAlertRepository(pool)
		notifRepo = monitoring.NewPGNotificationRepository(pool)
	} else {
		alertRepo = monitoring.NewMemAlertRepository(mem)
		notifRepo = monitoring.NewMemNotificationRepository(mem)
	}

	// Deployment (dual repository).
	var deployRepo deployment.DeploymentRepository
	if pool != nil {
		deployRepo = deployment.NewPGRepository(pool)
	} else {
		deployRepo = deployment.NewMemRepository(mem)
	}

	// Infrastructure (dual repository).
	var clusterRepo infrastructure.ClusterRepository
	var hostRepo infrastructure.HostRepository
	if pool != nil {
		clusterRepo = infrastructure.NewPGClusterRepository(pool)
		hostRepo = infrastructure.NewPGHostRepository(pool)
	} else {
		clusterRepo = infrastructure.NewMemClusterRepository(mem)
		hostRepo = infrastructure.NewMemHostRepository(mem)
	}

	// External service clients.
	vm := victoriametrics.New(cfg.VictoriaMetricsURL)
	osClient := opensearch.New(cfg.OpenSearchURL)
	var cicd gitlab.CICDProvider = gitlab.NewDevAdapter()
	if cfg.GitLabBaseURL != "" && cfg.GitLabToken != "" {
		cicd = gitlab.NewGitLabAdapter(cfg.GitLabBaseURL, cfg.GitLabToken)
	}

	// Domain services.
	monSvc := monitoring.NewService(alertRepo, notifRepo, vm, auditSvc)
	logSvc := logging.NewService(osClient, auditSvc)
	depSvc := deployment.NewService(deployRepo, cicd, auditSvc)

	// Kubernetes client factory: only available when a kubeconfig is supplied.
	var k8sFactory infrastructure.K8sFactory
	if cfg.KubeconfigPath != "" {
		kp := cfg.KubeconfigPath
		k8sFactory = func(cl model.Cluster) (*k8sclient.Client, error) {
			return k8sclient.NewClient(k8sclient.Config{KubeconfigPath: kp})
		}
	} else {
		k8sFactory = func(cl model.Cluster) (*k8sclient.Client, error) {
			return nil, infrastructure.ErrK8sUnavailable
		}
	}
	infraSvc := infrastructure.NewService(clusterRepo, hostRepo, k8sFactory, auditSvc)

	r := buildRouter(cfg, authSvc, auditSvc, assignRepo, monSvc, logSvc, depSvc, infraSvc)
	addr := ":" + cfg.Port
	log.Printf("opsconsole api listening on %s (repository=%s)", addr, cfg.RepositoryMode)
	if err := r.Run(addr); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
