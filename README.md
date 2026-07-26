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
| 底座 | 统一登录 / RBAC / 审计 | 本地账号（内存或 PG）+ JWT；审计落 PG 或内存 |
| 监控告警 | 指标查询 / 告警规则 / 通知 | VictoriaMetrics（PromQL 代理）|
| 日志分析 | 全文检索 / 实时流 | OpenSearch（_search 代理 + WebSocket tail）|
| 部署 CI/CD | 流水线列表 / 触发 / 回滚 | GitLab REST v4（含开发 mock 适配器）|
| 主机 / K8s | 集群纳管 / Pod 查看 / exec | client-go v0.31（SA impersonation 透传 RBAC）|

### 组件形态
- **后端**：Go 编译为单一静态二进制 `opsconsole-server`，监听 `:OPS_PORT`（默认 8080，绑定所有网卡）。
  健康检查端点 `GET /healthz`。统一 API 前缀 `/api/v1`，Bearer JWT 鉴权。
- **前端**：Vite 构建产物 `dist/`，由 `nginx:alpine` 托管，SPA（history 模式）fallback 到 `index.html`，
  并把 `/api` 反向代理到后端服务 `opsconsole-backend:8080`（WebSocket 升级头一并转发）。
- **四件套依赖（PG / Redis / VM / OS）**：生产环境视为**外部依赖**，由运维在集群内或托管服务中独立供给；
  开发环境由仓库根 `docker-compose.yml` 一键拉起单节点。

### 双仓储模式（Dual Repository）
后端每个仓储层定义 Go 接口，两套实现：
- **内存模式**（默认，无需外部服务）：`OPS_REPOSITORY_MODE=memory`，种子数据内置，可完整跑通登录/RBAC/审计/代理端点。
- **PG 模式**：`OPS_REPOSITORY_MODE=pg`，使用 `pgxpool` + RLS 多租户；审计、集群、部署等落 PG。

---

## 2. 本地启动（开发 / 演示）

### 2.1 一键拉起依赖（单节点）
```bash
docker compose up -d            # 启动 pg / redis / victoriametrics / opensearch
docker compose down             # 停止（保留数据卷）
docker compose down -v          # 重置（清空数据）
```
PG 首次启动自动执行挂载的 `schema.sql`（建表 / RLS / 角色预置）。

### 2.2 后端（两种启动方式）
```bash
# 方式 A：直接运行已编译二进制（仓库已含 backend/opsconsole-server）
cd backend
OPS_JWT_SECRET=dev-insecure-secret-change-me \
OPS_REPOSITORY_MODE=memory \
./opsconsole-server
# 监听 :8080，GET /healthz 返回 200

# 方式 B：源码运行（开发）
cd backend
go run ./cmd/api-server
```

### 2.3 前端（mock 默认开，无需后端即可演示）
```bash
cd frontend
npm install
npm run dev                    # Vite dev server，默认 http://localhost:5173
# .env 中 VITE_USE_MOCK=true，UI 走内置 mock 数据
```
要连真实后端：将 `frontend/.env` 改为 `VITE_USE_MOCK=false`，`VITE_API_BASE=/api/v1`，
并让前端通过 nginx 或 vite proxy 将 `/api` 转发到后端 `:8080`。

### 2.4 端到端冒烟（内存模式即可）
```bash
# 登录拿 token
TOKEN=$(curl -s -X POST localhost:8080/api/v1/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@corp.com","password":"opsconsole123"}' \
  | sed -E 's/.*"access_token":"([^"]+)".*/\1/')

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
- Redis 7.2（会话 / 限流 / WebSocket PubSub）
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
| `OPS_REPOSITORY_MODE` | `memory` | ConfigMap | `memory` / `pg`。 |
| `OPS_DATABASE_URL` | 空 | **Secret** | PG 连接串；`pg` 模式必填（含凭据，故入 Secret）。 |
| `OPS_REDIS_URL` | `redis://localhost:6379/0` | ConfigMap | 会话/限流/PubSub。 |
| `OPS_JWT_SECRET` | `dev-insecure-secret-change-me` | **Secret** | JWT 签名密钥，生产必须改为强随机。 |
| `OPS_VICTORIAMETRICS_URL` | 空 | ConfigMap | 填后启用 `/monitoring/query`，否则返回 502。 |
| `OPS_OPENSEARCH_URL` | 空 | ConfigMap | 填后启用 `/logging/search`、`/logging/tail`。 |
| `OPS_GITLAB_BASE_URL` | 空 | ConfigMap | 与 Token 同填启用真实 GitLab CI/CD，否则用 dev mock。 |
| `OPS_GITLAB_TOKEN` | 空 | **Secret** | GitLab 访问令牌。 |
| `OPS_KUBECONFIG` | 空 | **Secret** | 填后启用真实 K8s Pod 列表 / exec（client-go impersonation）。 |

> 命名说明：任务简报中写作 `OPS_SERVER_PORT`；编译后的后端实际读取 **`OPS_PORT`**
> （`backend/internal/config/config.go:22`）。本交付物统一采用与运行二进制一致的 `OPS_PORT`。

### 4.2 前端（构建期，由 Vite 在 `npm run build` 时固化进产物）
| 变量 | 默认值（生产构建） | 说明 |
|------|--------------------|------|
| `VITE_USE_MOCK` | `false`（生产）/ `true`（开发）| 是否使用内置 mock 数据。 |
| `VITE_API_BASE` | `/api/v1` | 后端 API 前缀；经前端 nginx / ingress 的 `/api` 代理同源访问。 |

> 前端 VITE_* 是**构建期**变量，运行时改环境变量无效；改了需重新 `npm run build` 打镜像。

---

## 5. 种子账号（内存模式内置；PG 模式需自行初始化）

| 邮箱 | 密码 | 角色 | 权限 |
|------|------|------|------|
| `admin@corp.com` | `opsconsole123` | `owner` | 超管，全量读写 |
| `viewer@corp.com` | `opsconsole123` | `viewer` | 只读，越权操作返回 403 并记审计 |

> PG 模式不会自动建种子账号；请参照 `schema.sql` 与后端 `store` 种子逻辑在 PG 侧初始化，
> 或使用外部目录（LDAP/AD/OIDC）接入。

---

## 6. 已知限制

- **内存模式不持久**：`OPS_REPOSITORY_MODE=memory` 下所有数据（账号/审计/集群/部署）重启即丢失，
  仅供演示与联调；生产须用 `pg` 模式 + PostgreSQL 16 + `schema.sql`。
- **四件套需在线才联调**：VictoriaMetrics / OpenSearch / GitLab / K8s 未配置对应 `OPS_*` 时，
  相关端点返回 502/空数据，后端**不会伪造**指标/日志/流水线数据。
- **K8s 真实对接需 `OPS_KUBECONFIG`**：Pod 列表与容器 exec 依赖真实 kubeconfig，否则返回 502 并说明不可用。
- **GitLab 真实对接需 `OPS_GITLAB_BASE_URL` + `OPS_GITLAB_TOKEN`**：否则使用内置 dev mock 适配器。
- **VM 高基数查询**：全量扫描可能超时；生产应配置查询超时 + recording rules + 每租户 QPS 上限（见 SPEC §11）。
- **OpenSearch 中文分词**：需预装 analysis-ik 插件（开发 compose 已用 `medcl/opensearch-ik:2.17.0`）。
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
| `DELIVERY.md` | 文档 | 本文档 |

---

## 8. 校验状态（如实声明）

- 本环境**未执行** `docker build` / `helm install` / `kubectl apply` / `gitlab-ci` 实跑；
  helm/kubectl/docker 在本沙箱均不可用。
- 已进行的校验（详见 `OPS_SELFCHECK.md`）：
  - 所有纯 YAML（`chart/values.yaml`、`chart/Chart.yaml`、`docker-compose.yml`、`.gitlab-ci.yml`）
    经受管 Python `yaml.safe_load` 校验语法通过。
  - Helm 模板（含 `{{ }}` 指令）经「剥离 Go template 指令后」结构校验，12 个文件全部通过。
  - Helm 模板中 45 处 `.Values.*` 引用经脚本核对，全部可在 `values.yaml` 解析。
  - 后端 Go 构建阶段以本机 `go vet ./...`（退出码 0）+ `go build` 验证可编译（Go 1.26 工具链），
    与 `backend/Dockerfile` 构建指令一致。
- Dockerfile / Helm 模板的最终镜像构建与集群部署需在具备 Docker/K8s 的环境执行。
