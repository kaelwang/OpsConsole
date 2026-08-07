# OpsConsole

企业多团队统一运维控制台（OpsConsole）v1.0.0 — 说明。
本文档面向部署与运维人员，说明架构回顾、本地启动、生产部署、环境变量全表、种子账号与已知限制。

> 版本锚定（Spec 锁定）：Go 1.22 / React 18.3.1 / Vite 5 / AntD 5.21 / lucide-react 0.439.0 /
> PostgreSQL 16 / Redis 7.2 / VictoriaMetrics 1.101 / OpenSearch 2.17 / K8s 1.31 /
> Helm 3.15+ / GitLab CI / ArgoCD 2.12+。

---

## 1. 架构回顾

OpsConsole 是一个**自托管、统一 RBAC、薄而全**的运维控制台，在四个能力域各提供最小可用闭环，
并以一套账号 + RBAC + 审计贯穿全局：

| 能力域 | 功能 | 后端代理/数据来源 |
|--------|------|-------------------|
| 底座 | 统一登录 / RBAC / 审计 | 本地账号（PostgreSQL）+ JWT；审计落 PG |
| 监控告警 | 指标查询 / 告警规则 / 通知 / 活跃告警 | VictoriaMetrics（PromQL 代理）+ vmalert + alertmanager（活跃告警经 vmalert `/api/v1/alerts` 透传）|
| 日志分析 | 全文检索 / 实时流 | OpenSearch（_search 代理 + WebSocket tail）|
| 部署 CI/CD | 流水线列表 / 触发 / 回滚 | GitLab REST v4 适配器 |
| 主机 / K8s | 集群纳管 / Pod 查看 / exec | client-go v0.31（SA impersonation 透传 RBAC）|

### 组件形态
- **单一二进制（默认 / 本地 / VM 部署）**：Go 编译为静态二进制 `opsconsole-server`，监听 `:OPS_PORT`（默认 8080，绑定所有网卡）。
  它通过 `go:embed` 内嵌前端 `dist/`，由同一进程托管 SPA（history 模式 fallback 到 `index.html`）与 `GET /healthz`、
  统一 API 前缀 `/api/v1`（Bearer JWT 鉴权）。前后端同源，无需反向代理。
- **Kubernetes / Helm 部署**：前端由独立 `nginx:alpine` 镜像托管 `dist/`（SPA fallback），并把 `/api` 反向代理到
  后端 Service `opsconsole-backend:8080`（WebSocket 升级头一并转发，见 `frontend/nginx.conf`）。
- **四件套依赖（PG / Redis / VM / OS）**：生产环境视为**外部依赖**，由运维在集群内或托管服务中独立供给；
  开发环境由仓库根 `docker-compose.yml` 一键拉起单节点。

### 仓储层（PostgreSQL only）
后端每个仓储层定义 Go 接口，仅有一套 PostgreSQL 实现（`*pgXxxRepo`，基于 `pgxpool` + RLS 多租户）。
`OPS_DATABASE_URL` 为启动必填项，缺失即退出；不存在内存 / 演示模式。

---

## 2. 本地启动（开发 / 演示）

### 2.1 一键拉起依赖（单节点）
```bash
docker compose up -d            # 启动 pg / redis / victoriametrics / opensearch / node-exporter / vmagent / vmalert / alertmanager
docker compose down             # 停止（保留数据卷）
docker compose down -v          # 重置（清空数据）
```
PG 首次启动自动执行挂载的 `schema.sql`（建表 / RLS / 角色预置）与 `seed.sql`（幂等种子数据：默认账号、集群、告警规则等）。

### 2.2 后端（需 PostgreSQL + Redis）
```bash
cd backend
export OPS_DATABASE_URL="postgres://postgres:postgres_dev@localhost:5432/opsconsole?sslmode=disable"
export OPS_REDIS_URL="redis://localhost:6379/0"
export OPS_JWT_SECRET="dev-insecure-secret-change-me"
go run ./cmd/api-server
# 监听 :8080，GET /healthz 返回 200
```
> 也可直接运行已编译二进制（环境变量同上）。`OPS_DATABASE_URL` 必填，缺失即退出。

### 2.3 前端（始终连接真实后端）
```bash
cd frontend
npm install
npm run dev                    # Vite dev server，默认 http://localhost:5173
```
前端始终调用真实后端（`VITE_API_BASE=/api/v1`）。生产构建时由 `Makefile` 固化
`VITE_API_BASE=/api/v1`，产物经 `go:embed` 嵌入后端二进制，单一进程同时托管前后端。

### 2.4 端到端冒烟
```bash
# 登录拿 token（响应为 camelCase：accessToken / refreshToken / expiresIn / tenantId / role）
TOKEN=$(curl -s -X POST localhost:8080/api/v1/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@corp.com","password":"opsconsole123"}' \
  | sed -E 's/.*"accessToken":"([^"]+)".*/\1/')

# 健康检查
curl -i localhost:8080/healthz

# 受保护端点
curl -H "Authorization: Bearer $TOKEN" localhost:8080/api/v1/rbac/memberships
```

---

## 3. 生产部署

### 3.1 构建镜像
```bash
# 后端（多阶段，CGO_ENABLED=0 静态，alpine 运行，非 root，<30MB 目标）
docker build -f backend/Dockerfile -t opsconsole/backend:1.0.0 ./backend

# 前端（node 构建 -> nginx:alpine 托管，SPA fallback + /api 代理）
docker build -f frontend/Dockerfile -t opsconsole/frontend:1.0.0 ./frontend
```

### 3.2 部署四件套依赖（外部供给）
生产环境请独立供给以下服务，并把连接串通过 Secret 注入后端（见 §4、§5）：
- PostgreSQL 16（主数据 + RLS 多租户）
- Redis 7.2（会话：refresh token 存储）
- VictoriaMetrics 1.101（时序指标，PromQL 兼容）
- OpenSearch 2.17（日志全文检索 + analysis-ik 中文分词）

> 开发单节点可直接复用根目录 `docker-compose.yml`；生产请勿将其用于线上。

### 3.3 Helm 部署（Helm 3.15+）
```bash
# 1) 创建生产 Secret（推荐，不要提交明文到 values.yaml）
kubectl create secret generic opsconsole-backend-prod \
  --namespace opsconsole \
  --from-literal=OPS_JWT_SECRET='<强随机>' \
  --from-literal=OPS_DATABASE_URL='postgres://user:pass@<pg-host>:5432/opsconsole?sslmode=disable' \
  --from-literal=OPS_GITLAB_TOKEN='<token>' \
  --from-literal=OPS_KUBECONFIG='<kubeconfig 内容或留空>'

# 2) 安装 / 升级
helm upgrade --install opsconsole ./chart \
  --namespace opsconsole --create-namespace \
  --set backend.image.tag=1.0.0 \
  --set frontend.image.tag=1.0.0 \
  --set backend.existingSecret=opsconsole-backend-prod \
  --set backend.env.OPS_GITLAB_BASE_URL='https://gitlab.example.com' \
  --set frontend.ingress.host='opsconsole.example.com' \
  --wait --timeout 300s

# 3) 校验
kubectl -n opsconsole get pods
kubectl -n opsconsole get ingress
curl -i http://<ingress-host>/healthz        # 经 ingress 的 200
```
Chart 产出：
- `opsconsole-backend` Deployment/Service（ClusterIP，固定名，供前端 nginx 代理）
- `opsconsole-frontend` Deployment/Service
- `opsconsole-<release>-frontend` Ingress（`/` -> 前端）
- 可选 `opsconsole-<release>-backend` Ingress（`/api` -> 后端，默认关闭）
- `opsconsole-<release>-backend-env` ConfigMap（非密环境变量）
- `opsconsole-<release>-backend` Secret（仅当未指定 `existingSecret` 时创建，含占位值）

### 3.4 ArgoCD 2.12+ 部署（GitOps）
将本仓库作为 ArgoCD Application 源，ArgoCD 持续把集群 reconcile 到 Chart 声明状态：
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: opsconsole
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://gitlab.example.com/opsconsole/opsconsole.git
    path: chart
    targetRevision: HEAD
    helm:
      parameters:
        - name: backend.image.tag
          value: "1.0.0"
        - name: frontend.image.tag
          value: "1.0.0"
        - name: backend.existingSecret
          value: opsconsole-backend-prod
  destination:
    server: https://kubernetes.default.svc
    namespace: opsconsole
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```
GitLab CI 的 `argocd-sync` 任务仅触发一次 `argocd app sync`；常态由 ArgoCD 自动同步。

---

## 4. 环境变量全表

### 4.1 后端（运行时，由 ConfigMap / Secret 注入）
| 变量 | 默认值 | 来源 | 说明 |
|------|--------|------|------|
| `OPS_PORT` | `8080` | ConfigMap | 监听端口（绑定 `:PORT`，即所有网卡）。 |
| `OPS_DATABASE_URL` | 空 | **Secret** | PG 连接串；**必填**，缺失即退出（含凭据，故入 Secret）。 |
| `OPS_REDIS_URL` | `redis://localhost:6379/0` | ConfigMap | 会话（refresh token 存储）。 |
| `OPS_JWT_SECRET` | `dev-insecure-secret-change-me` | **Secret** | JWT 签名密钥，生产必须改为强随机。 |
| `OPS_VICTORIAMETRICS_URL` | 空 | ConfigMap | 填后启用 `/monitoring/query`，否则返回 502。 |
| `OPS_VMALERT_URL` | 空 | ConfigMap | 填后启用 `/monitoring/alerts`（vmalert 评估的活跃告警），否则返回 502。开发 compose 中 vmalert 容器映射宿主机 `8081`（容器内 `8080`），且必须配置真实 notifier（`alertmanager`），否则 vmalert `/api/v1/alerts` 返回 503。 |
| `OPS_OPENSEARCH_URL` | 空 | ConfigMap | 填后启用 `/logging/search`、`/logging/tail`。 |
| `OPS_GITLAB_BASE_URL` | 空 | ConfigMap | 与 Token 同填启用真实 GitLab CI/CD，否则 `/deployment/pipelines` 返回 502（cicd provider not configured）。 |
| `OPS_GITLAB_TOKEN` | 空 | **Secret** | GitLab 访问令牌。 |
| `OPS_KUBECONFIG` | 空 | **Secret** | 填后启用真实 K8s Pod 列表 / exec（client-go impersonation）。 |

> 命名说明：任务简报中写作 `OPS_SERVER_PORT`；编译后的后端实际读取 **`OPS_PORT`**
> （`backend/internal/config/config.go:22`）。本交付物统一采用与运行二进制一致的 `OPS_PORT`。

### 4.2 前端（构建期，由 Vite 在 `npm run build` 时固化进产物）
| 变量 | 默认值（生产构建） | 说明 |
|------|--------------------|------|
| `VITE_API_BASE` | `/api/v1` | 后端 API 前缀；经前端 nginx / ingress 的 `/api` 代理同源访问。前端已移除 mock 模式，始终请求真实后端。 |

> 前端 VITE_* 是**构建期**变量，运行时改环境变量无效；改了需重新 `npm run build` 打镜像。

---

## 5. 种子账号（由 `seed.sql` 初始化）

| 邮箱 | 密码 | 角色 | 权限 |
|------|------|------|------|
| `admin@corp.com` | `opsconsole123` | `owner` | 超管，全量读写 |
| `viewer@corp.com` | `opsconsole123` | `viewer` | 只读，越权操作返回 403 并记审计 |

> `seed.sql` 以幂等方式创建上述默认账号、租户与成员关系（所有 `INSERT` 均 `ON CONFLICT DO NOTHING`）。
> 开发环境由 `docker-compose.yml` 自动挂载执行；独立 PostgreSQL 需先执行 `schema.sql` 再执行 `seed.sql`。
> 也可接入外部目录（LDAP/AD/OIDC）替代本地账号。

---

## 6. 已知限制

- **PG 为唯一数据存储**：所有数据（账号/审计/集群/部署/告警/通知）持久化于 PostgreSQL 16 + `schema.sql`
  （RLS 多租户），无内存 / 演示模式，服务重启不丢数据。
- **四件套需在线才联调**：VictoriaMetrics / OpenSearch / GitLab / K8s 未配置对应 `OPS_*` 时，
  相关端点返回 502/空数据，后端**不会伪造**指标/日志/流水线数据。
- **K8s 真实对接需 `OPS_KUBECONFIG`**：Pod 列表与容器 exec 依赖真实 kubeconfig，否则返回 502 并说明不可用。
- **GitLab 真实对接需 `OPS_GITLAB_BASE_URL` + `OPS_GITLAB_TOKEN`**：否则 `/deployment/pipelines` 返回 502（cicd provider not configured），后端不伪造流水线。
- **VM 高基数查询**：全量扫描可能超时；生产应配置查询超时 + recording rules + 每租户 QPS 上限（见 SPEC §11）。
- **OpenSearch 镜像**：开发 compose 现使用官方 `opensearchproject/opensearch:2.17.0`（标准 analyzer，未预装 IK 中文分词插件）；若需中文 IK 分词，启动后执行
  `docker exec opsconsole-os bin/opensearch-plugin install --batch https://github.com/infinilabs/analysis-ik/releases/download/v2.17.0/analysis-ik-2.17.0.zip`。
- **client-go 版本对齐**：必须 v0.31.x 对应 K8s 1.31，否则 informer/impersonation 报错。
- **ArgoCD / Helm / K8s 版本**：请使用 Helm 3.15+、ArgoCD 2.12+、K8s 1.31，避免 API 不兼容。
- **前端镜像耦合后端 Service 名**：前端 nginx 将 `/api` 代理到固定服务名 `opsconsole-backend`；
  多 release 同命名空间并发部署时需改名或改用 ConfigMap 挂载 nginx 配置。

---

## 7. 交付物清单

| 路径 | 类型 | 说明 |
|------|------|------|
| `backend/Dockerfile` | Dockerfile | 多阶段 Go 1.22 构建 -> alpine 运行，非 root，<30MB 目标 |
| `frontend/Dockerfile` | Dockerfile | node 20 构建 -> nginx:alpine 托管 dist |
| `frontend/nginx.conf` | nginx 配置 | SPA fallback + `/api` 反向代理（含 WebSocket）|
| `chart/Chart.yaml` | Helm | Chart 元信息（apiVersion v2）|
| `chart/values.yaml` | Helm | 默认值与外部依赖端点 |
| `chart/templates/_helpers.tpl` | Helm | name/labels/secret 名辅助模板 |
| `chart/templates/configmap.yaml` | Helm | 后端非密环境变量 |
| `chart/templates/secret.yaml` | Helm | 后端密文（可改走 existingSecret）|
| `chart/templates/backend-deployment.yaml` | Helm | 后端 Deployment（探针 + 安全上下文）|
| `chart/templates/backend-service.yaml` | Helm | 后端 Service（固定名 `opsconsole-backend`）|
| `chart/templates/backend-ingress.yaml` | Helm | 后端 Ingress（可选）|
| `chart/templates/frontend-deployment.yaml` | Helm | 前端 Deployment |
| `chart/templates/frontend-service.yaml` | Helm | 前端 Service |
| `chart/templates/frontend-ingress.yaml` | Helm | 前端 Ingress（`/` -> 前端）|
| `.gitlab-ci.yml` | CI | stages: test/build/deploy；Helm + ArgoCD 2.12+ 两条部署路径 |
| `frontend/.dockerignore` | 构建 | 排除 node_modules/dist，避免污染镜像构建上下文 |
| `backend/.dockerignore` | 构建 | 排除预编译二进制/标记，避免带入构建上下文 |
| `OPS_SELFCHECK.md` | 文档 | 运维自检报告（YAML/模板/引用/go vet 校验结果）|
| `README.md` | 文档 | 本文档（部署与运维说明） |

---

## 8. 校验状态（如实声明）

- 本环境已通过 Docker 实际部署并验证：依赖容器（pg / redis / victoriametrics / opensearch / alertmanager / vmagent / vmalert / node-exporter）
  经 `docker compose up -d` 拉起，后端编译为 Linux 二进制本地运行；核心链路（登录 / RBAC / 监控查询 / 实时告警 / 日志检索）已冒烟通过。
- `helm install` / `kubectl apply` / `gitlab-ci` 实跑仍需在具备 K8s/CI 的环境执行。
- 已进行的校验（详见 `OPS_SELFCHECK.md`）：
  - 所有纯 YAML（`chart/values.yaml`、`chart/Chart.yaml`、`docker-compose.yml`、`.gitlab-ci.yml`）
    经受管 Python `yaml.safe_load` 校验语法通过。
  - Helm 模板（含 `{{ }}` 指令）经「剥离 Go template 指令后」结构校验，12 个文件全部通过。
  - Helm 模板中 45 处 `.Values.*` 引用经脚本核对，全部可在 `values.yaml` 解析。
  - 后端 Go 构建阶段以本机 `go vet ./...`（退出码 0）+ `go build` 验证可编译（Go 1.26 工具链），
    与 `backend/Dockerfile` 构建指令一致。
- Dockerfile / Helm 模板的最终镜像构建与集群部署需在具备 Docker/K8s 的环境执行。

---

## 9. 近期变更记录（前端 ↔ 后端契约对齐）

此前存在的 mock 开关（`VITE_USE_MOCK`）掩盖了**前端类型与后端序列化从未对齐**的问题。
移除该开关、统一为真实后端模式后访问登录即 404，并已顺带修复一组契约错配。
以下变更均已重建前端（真实模式）并重新打包 Linux 二进制部署至 `http://192.129.221.208:8080` 验证通过。

### 9.1 登录 404 根因与修复
- **根因**：前端真实模式请求 `POST /api/v1/auth/login`，而后端路由为 `POST /api/v1/login`（无 `/auth` 前缀）→ 404。
- **修复**：`frontend/src/services/api/auth.ts` 登录路径由 `/auth/login` 改为 `/login`。

### 9.2 序列化字段对齐（camelCase）
后端 `model` 之前大多无 json tag，Go 默认输出 `TenantID` / `UserID` 等 PascalCase，与前端 camelCase 类型不符。
- `backend/internal/model/model.go`：所有对外结构统一加 camelCase json tag。
- `backend/internal/platform/auth/auth.go`：`TokenResponse` 补全 `tenantId` / `role` 字段，登录响应现返回
  `{ accessToken, expiresIn, tenantId, role }`。

### 9.3 RBAC 端点与字段对齐
- **新增** `GET /api/v1/rbac/roles`（`rbac.go` + `router.go`），返回角色及其权限集合，对齐前端 `RolePermission`。
- `frontend/src/services/api/rbac.ts`：
  - `listMembers` 由 `/rbac/roles` 改为 `/rbac/memberships`（对齐后端已有端点）。
  - `assignRole` 由 `/rbac/assign` 改为 `/rbac/memberships`，请求体字段由 `userId` 改为 `user_id`（对齐后端 `AssignHandler`）。

### 9.4 构建与部署
- 前端以真实后端模式 `npm run build` 重新构建（无 mock 开关），产物嵌入 `backend/cmd/api-server/web/dist`。
- 重新编译 Linux 二进制：`CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build ... -o bin/opsconsole-server-linux-amd64`。
- 已部署并验证：登录、`/rbac/memberships`、`/rbac/roles`、`/infrastructure/clusters`、`/monitoring/alert-rules`
  均返回正确 camelCase 真实数据，服务 `active`、`/healthz` 正常、SPA 200。

### 9.5 仍待打磨（真实模式已知差异）
- `/rbac/memberships` 目前仅返回 `userId` / `role`，缺 `displayName` / `email`（需后端 join users 表才能显示成员名）。
- 通知 / 审计等个别「创建类」接口字段仍可能存在语义差异，属后续真实模式打磨项；登录与主列表链路已打通。

### 9.6 本次部署修复（本地环境）
- **`schema.sql` 初始化失败**：`audit_logs` 索引误引用不存在的 `actor_id` 列（表定义列名为 `user_id`），导致 PG 容器初始化退出；已修正为 `user_id`。
- **OpenSearch 补全**：开发 compose 镜像由 `medcl/opensearch-ik:2.17.0` 改为官方 `opensearchproject/opensearch:2.17.0`（更易获取、标准 analyzer）；
  后端配置 `OPS_OPENSEARCH_URL=http://localhost:9200` 后 `/logging/search`、`/logging/tail` 正常可用（需预先创建 `logs-<tenantId>` 索引）。
- **实时告警修复**：vmalert 原用 `-notifier.blackhole`，导致其 `/api/v1/alerts` 永远返回 503；新增 `alertmanager` 容器作为 notifier，
  vmalert 指向 `http://opsconsole-alertmanager:9093`；后端 `OPS_VMALERT_URL` 修正为宿主机映射端口 `8081`。`/monitoring/alerts` 现可返回 firing 告警。
