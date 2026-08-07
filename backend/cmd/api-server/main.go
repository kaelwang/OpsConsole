package main

import (
	"context"
	"log"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

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
	"github.com/opsconsole/backend/internal/pkg/vmalert"
	"github.com/opsconsole/backend/internal/pkg/alertmanager"
	"github.com/opsconsole/backend/internal/platform/auth"
	"github.com/opsconsole/backend/internal/platform/rbac"
)

func main() {
	cfg := config.Load()

	// PostgreSQL is the only supported repository backend.
	if cfg.DatabaseURL == "" {
		log.Fatal("OPS_DATABASE_URL is required")
	}
	pool, err := pgxpool.New(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("postgres connect: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(context.Background()); err != nil {
		log.Fatalf("postgres ping: %v", err)
	}

	// Redis-backed session store.
	redisOpts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Fatalf("redis url: %v", err)
	}
	session := auth.NewRedisStore(redis.NewClient(redisOpts))

	// Repositories (PostgreSQL only).
	auditSvc := audit.NewService(audit.NewPGRepository(pool))
	authSvc := auth.NewService(auth.NewPGUserRepo(pool), session, cfg.JWTSecret)
	assignRepo := rbac.NewPGAssignRepository(pool)
	alertRepo := monitoring.NewPGAlertRepository(pool)
	notifRepo := monitoring.NewPGNotificationRepository(pool)
	deployRepo := deployment.NewPGRepository(pool)
	clusterRepo := infrastructure.NewPGClusterRepository(pool)
	hostRepo := infrastructure.NewPGHostRepository(pool)

	// External service clients. Unset URLs surface explicit 502 upstream
	// errors instead of fabricated data.
	vm := victoriametrics.New(cfg.VictoriaMetricsURL)
	va := vmalert.New(cfg.VMAlertURL)
	am := alertmanager.New(cfg.AlertmanagerURL)
	osClient := opensearch.New(cfg.OpenSearchURL)
	var cicd gitlab.CICDProvider
	if cfg.GitLabBaseURL != "" && cfg.GitLabToken != "" {
		cicd = gitlab.NewGitLabAdapter(cfg.GitLabBaseURL, cfg.GitLabToken)
	}

	// Alerting config manager: regenerates alertmanager.yml + vmalert rules
	// from the DB so notification channels actually deliver. Nil am/va clients
	// (unset env) make Sync a no-op for file writing + skip reloads.
	amCfg := monitoring.NewConfigManager(notifRepo, alertRepo, am, va, cfg.AlertmanagerConfigPath, cfg.VMAlertRulesPath)

	// Domain services.
	monSvc := monitoring.NewService(alertRepo, notifRepo, vm, va, auditSvc, amCfg)
	logSvc := logging.NewService(osClient, auditSvc)
	depSvc := deployment.NewService(deployRepo, cicd, auditSvc)

	// Kubernetes client factory: prefers a per-cluster kubeconfig (pasted by
	// the user) and falls back to the global OPS_KUBECONFIG_PATH when the
	// cluster has none. When no global kubeconfig is configured either, only
	// clusters that carry their own kubeconfig are usable.
	var k8sFactory infrastructure.K8sFactory
	globalKp := cfg.KubeconfigPath
	k8sFactory = func(cl model.Cluster) (*k8sclient.Client, error) {
		if kc := strings.TrimSpace(cl.Kubeconfig); kc != "" {
			return k8sclient.NewClientFromKubeconfigContent(kc)
		}
		if globalKp == "" {
			return nil, infrastructure.ErrK8sUnavailable
		}
		return k8sclient.NewClient(k8sclient.Config{KubeconfigPath: globalKp})
	}
	infraSvc := infrastructure.NewService(clusterRepo, hostRepo, k8sFactory, auditSvc)

	r := buildRouter(cfg, authSvc, auditSvc, assignRepo, monSvc, logSvc, depSvc, infraSvc)

	// Best-effort initial generation of alerting config so the shared volumes
	// are populated before Alertmanager/vmalert read them. Failures are logged
	// but do not block startup; the config can be regenerated via the API.
	if err := amCfg.Sync(context.Background()); err != nil {
		log.Printf("warn: initial alerting config sync failed: %v", err)
	}

	addr := ":" + cfg.Port
	log.Printf("opsconsole api listening on %s (repository=postgres)", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
