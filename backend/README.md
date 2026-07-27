# OpsConsole Backend

Enterprise multi-tenant unified operations console — API server (Go).

## Stack

| Concern | Technology |
|---------|------------|
| Language | Go 1.22 (built with 1.26 toolchain) |
| HTTP | Gin |
| Auth | golang-jwt/jwt v5 (HS256), bcrypt |
| Database (PG mode) | PostgreSQL 16 + pgx/v5, RLS multi-tenancy |
| Cache / sessions (PG mode) | Redis (go-redis/v9) |
| Kubernetes | client-go v0.31 (K8s 1.31) |
| Metrics | VictoriaMetrics PromQL proxy |
| Logs | OpenSearch `_search` proxy |
| CI/CD | GitLab REST v4 adapter |
| Real-time | gorilla/websocket (log tail, pod exec) |

## Directory layout

```
backend/
  cmd/api-server/        # entry point (assembly only, zero business logic)
    main.go              # wires config, repositories, services, clients, router
    router.go            # endpoint registration + RBAC gates
  internal/
    config/              # environment configuration
    model/               # shared domain entities (no internal imports)
    pkg/
      response/          # unified {code,data,message} envelope + helpers
      query/             # pagination normalization
      victoriametrics/   # PromQL proxy client
      opensearch/        # log search proxy client
      gitlab/            # CICDProvider adapter (dev + GitLab)
      k8sclient/         # client-go wrapper (pods list + exec)
    platform/
      tenant/            # principal in request context
      rbac/              # role->permission model + RequirePermission gate
      middleware/        # JWT auth, recovery, rate limit
      auth/              # login service, JWT, session + user repository
      audit/             # audit log repository + service (Sink interface)
      pg/                # WithTenant RLS transaction helper
    modules/
      monitoring/        # metrics query, alert rules, notifications
      logging/           # log search + tail
      deployment/        # CI/CD pipeline proxy
      infrastructure/    # clusters, hosts, pods, exec
```

## Layering (iron law)

```
routes/controllers  ->  services  ->  repositories  ->  infrastructure
        (only downward dependencies)
```

- Controllers never touch the database directly.
- Services contain business logic; they never import `gin` request/response types and never write HTTP.
- Repositories contain no business logic.
- The entry point (`main.go`) only assembles and wires; it holds no business rules.
- Every source file is kept under 300 lines.

## Multi-tenant isolation

PostgreSQL uses Row-Level Security. Every PG repository call wraps the query in
`pg.WithTenant`, which opens a transaction and sets the session variables
`app.tenant_id` and `app.role` via `SET LOCAL` (transaction-scoped, so no leak
across pooled connections). Cross-tenant access is rejected by the RLS policy.

## Repositories (PostgreSQL only)

Every repository defines a Go interface (`UserRepository`, `AlertRuleRepository`,
`ClusterRepository`, etc.). A single PostgreSQL implementation (`*pgXxxRepo`,
backed by `pgxpool`) is provided and is always used — there is no in-memory mode.
`OPS_DATABASE_URL` is required at startup; the server exits if it is missing.

## Authentication & authorization

- `POST /api/v1/login` issues a 15-minute access token and a 7-day refresh token (HS256).
- All other endpoints require `Authorization: Bearer <access_token>`.
- RBAC: roles `platform_admin | owner | admin | member | viewer` map to
  `resource:action` permissions. `rbac.RequirePermission(resource, action, sink)`
  gates each route and writes a denial record to the audit log.

## API surface

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| GET | `/healthz` | public | liveness |
| POST | `/api/v1/login` | public | email + password |
| GET | `/api/v1/rbac/memberships` | rbac:read | list tenant members |
| POST | `/api/v1/rbac/memberships` | rbac:write | assign role |
| GET | `/api/v1/audit/logs` | audit:read | paginated audit log |
| GET | `/api/v1/monitoring/query` | monitoring:read | PromQL proxy |
| GET | `/api/v1/monitoring/alert-rules` | monitoring:read | list rules |
| POST | `/api/v1/monitoring/alert-rules` | monitoring:write | create rule |
| GET | `/api/v1/monitoring/notifications` | monitoring:read | list channels |
| POST | `/api/v1/monitoring/notifications` | monitoring:write | create channel |
| DELETE | `/api/v1/monitoring/notifications/:id` | monitoring:write | delete channel |
| GET | `/api/v1/monitoring/alerts` | monitoring:read | active alerts (empty page in dev) |
| GET | `/api/v1/logging/search` | logging:read | OpenSearch proxy |
| GET | `/api/v1/logging/tail` | logging:read | WebSocket tail |
| GET | `/api/v1/deployment/pipelines` | deployment:read | CI/CD pipelines |
| POST | `/api/v1/deployment/trigger` | deployment:write | trigger deploy |
| POST | `/api/v1/deployment/rollback` | deployment:write | rollback |
| GET | `/api/v1/infrastructure/clusters` | infrastructure:read | list clusters |
| GET | `/api/v1/infrastructure/clusters/:id` | infrastructure:read | get cluster |
| POST | `/api/v1/infrastructure/clusters` | infrastructure:write | register cluster |
| GET | `/api/v1/infrastructure/hosts` | infrastructure:read | list hosts |
| GET | `/api/v1/infrastructure/clusters/:id/pods` | infrastructure:read | pod list (needs kube) |
| GET | `/api/v1/infrastructure/clusters/:id/exec` | infrastructure:write | WebSocket pod exec |

## How to run

### How to run (PostgreSQL required)

```bash
cd backend
export OPS_DATABASE_URL="postgres://user:pass@localhost:5432/opsconsole?sslmode=disable"
export OPS_REDIS_URL="redis://localhost:6379/0"
export OPS_JWT_SECRET="dev-insecure-secret-change-me"
go run ./cmd/api-server
```

The server exits at startup if `OPS_DATABASE_URL` is unset. Seeded credentials
(from `seed.sql`, idempotent):

- admin:  `admin@corp.com`  / `opsconsole123`  (role: owner)
- viewer: `viewer@corp.com` / `opsconsole123`  (role: viewer)

Example:

```bash
curl -s -X POST localhost:8080/api/v1/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@corp.com","password":"opsconsole123"}'
# => {"code":0,"data":{"accessToken":"...","refreshToken":"...","expiresIn":900,"tenantId":"...","role":"owner"}}
```

PostgreSQL is mandatory; the server exits at startup if `OPS_DATABASE_URL` is
unset. The schema (tables, RLS policies, `app.tenant_id`/`app.role` GUCs) is
defined in `schema.sql` at the repository root; `seed.sql` seeds the default
accounts and is mounted automatically by `docker-compose.yml`.

### Optional integrations

- `OPS_VICTORIAMETRICS_URL` — enables `/monitoring/query` (otherwise returns 502).
- `OPS_OPENSEARCH_URL` — enables `/logging/search` and `/logging/tail`.
- `OPS_GITLAB_BASE_URL` + `OPS_GITLAB_TOKEN` — real GitLab CI/CD; otherwise
  `/deployment/pipelines` returns 502 (`cicd provider not configured`).
- `OPS_VMALERT_URL` — enables `/monitoring/alerts` (active alerts evaluated by
  vmalert against VictoriaMetrics); otherwise returns 502.
- `OPS_KUBECONFIG` — enables live pod listing / exec via client-go service-account impersonation.

## Known limitations

- Metrics/logs/CI-CD/alerts return upstream errors (502) unless the corresponding
  `OPS_*` URL is supplied; the server never fabricates data.
- Active alert events (`/monitoring/alerts`) are sourced from vmalert; with no
  alert rules firing, the page shows an empty list.
- Pod exec and pod listing require a real kubeconfig (`OPS_KUBECONFIG`); without it
  they return a 502 explaining the client is unavailable.
- Only the PostgreSQL repository is implemented; `OPS_DATABASE_URL` is mandatory.
- Unit tests exist for `auth`, `audit`, `rbac`, `response`, and `tenant`; they use
  in-process stubs and do not require a live database. Correctness is also verified
  by `gofmt`, `go vet`, and `go build`.
