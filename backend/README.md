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
| CI/CD | GitLab REST v4 adapter (+ dev mock) |
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
      store/             # in-memory seeded database
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

In memory mode the `store.MemDB` filters every read by the principal's
`tenant_id`.

## Dual repository (memory / PostgreSQL)

Every repository defines a Go interface (`UserRepository`, `AlertRuleRepository`,
`ClusterRepository`, etc.). Two implementations are provided:

- **In-memory** (`*memXxxRepo`, backed by `store.MemDB`) — selected by default,
  no external services required.
- **PostgreSQL** (`*pgXxxRepo`, backed by `pgxpool`) — selected when
  `OPS_REPOSITORY_MODE=pg`.

The server boots and serves the full core flow (login, RBAC, audit, proxy
endpoints) with **no PostgreSQL** by using memory mode.

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

### Memory mode (default, no external services)

```bash
cd backend
go run ./cmd/api-server
```

Environment defaults:

- `OPS_PORT=8080`
- `OPS_REPOSITORY_MODE=memory`
- `OPS_JWT_SECRET=dev-insecure-secret-change-me`

Seeded credentials (memory mode):

- admin:  `admin@corp.com`  / `opsconsole123`  (role: owner)
- viewer: `viewer@corp.com` / `opsconsole123`  (role: viewer)

Example:

```bash
curl -s -X POST localhost:8080/api/v1/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@corp.com","password":"opsconsole123"}'
# => {"code":0,"data":{"access_token":"...","refresh_token":"...","expires_in":900}}
```

Then call a protected endpoint with the access token.

### PostgreSQL mode

```bash
export OPS_REPOSITORY_MODE=pg
export OPS_DATABASE_URL="postgres://user:pass@localhost:5432/opsconsole?sslmode=disable"
export OPS_REDIS_URL="redis://localhost:6379/0"
go run ./cmd/api-server
```

The schema (tables, RLS policies, `app.tenant_id`/`app.role` GUCs) is defined in
`schema.sql` at the repository root. Apply it before starting in PG mode.

### Optional integrations

- `OPS_VICTORIAMETRICS_URL` — enables `/monitoring/query` (otherwise returns 502).
- `OPS_OPENSEARCH_URL` — enables `/logging/search` and `/logging/tail`.
- `OPS_GITLAB_BASE_URL` + `OPS_GITLAB_TOKEN` — real GitLab CI/CD; otherwise a dev mock is used.
- `OPS_KUBECONFIG` — enables live pod listing / exec via client-go service-account impersonation.

## Known limitations

- In memory mode, metrics/logs/CI-CD return upstream errors unless the
  corresponding `OPS_*` URL is supplied; the server never fabricates data.
- Active alert events (`/monitoring/alerts`) return an empty page in memory mode.
- Pod exec and pod listing require a real kubeconfig (`OPS_KUBECONFIG`); without it
  they return a 502 explaining the client is unavailable in this mode.
- PostgreSQL repositories are implemented and selected by `OPS_REPOSITORY_MODE=pg`
  but are exercised only against a live database; the default CI/build path
  validates the memory-mode code paths.
- No automated test suite is included in this MVP scaffold; correctness is verified
  by `gofmt`, `go vet`, and `go build`.
