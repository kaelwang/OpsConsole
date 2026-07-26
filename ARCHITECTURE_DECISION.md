# 企业多团队统一运维控制台 — 架构决策报告（MVP）

> 约束基线：知识库 `spec-as-contract`、`generated-code-failure-modes`、`multi-tenant-saas`、`mvp-stack`、`code-organization` 已读取并落实。
> P0 红线（违反即退回）：①锁定一套 SVG 图标库且全项目统一不混用；②架构/API 文档禁用 emoji；③技术栈依赖项包含锁定图标库；④禁止硬编码颜色值（仅 `#fff`/`#000` 例外）；⑤禁止紫色→粉色渐变。

---

## 0. 产品形态与范围（自包含契约摘要）

- **目标**：面向企业多团队的统一 Web 运维控制台，提供账号体系、分级权限（RBAC）、审计日志，并具备"多租户意识"。
- **MVP 四大能力域（薄而全的纵向切片）**：
  1. 监控告警（metrics + alerting）
  2. 日志分析（log search / tail）
  3. 部署 / CI-CD（pipeline 视图与触发）
  4. 主机与 K8s 管理（host + cluster / node / pod 管控）
- **共享底座（platform）**：账号(auth)、RBAC、审计(audit)、租户(tenant) 上下文。
- **明确不做（out-of-scope，防止镀金）**：自研指标采集器 / 日志 shipper（集成现有 Prometheus remote-write 与 OTel Collector）；多集群联邦（MVP 支持 1–3 集群）；多 CI 厂商适配（MVP 仅 GitLab CI）；SIEM 审计导出与长期归档（MVP 仅基础保留 + 异步写）；日志中文分词深度优化（仅装 IK 分析器，不做自定义词典）。

---

## 1. 后端语言选型：Go（明确推荐）

### 1.1 对比矩阵（评分 1–5，5 最优）

| 维度 | Go | Rust | 对本项目权重 | 结论依据 |
|------|----|------|------|------|
| 并发模型 | 5 | 4 | 高 | 本产品是 I/O 密集的"聚合/代理"型服务（查 VM、查 OS、调 K8s API）。goroutine+channel 心智负担低，99% 场景 QPS<100k 绰绰有余；Rust async/tokio 更强但复杂，收益在极端 CPU 场景才显现。 |
| 云原生生态成熟度 | 5 | 3 | 高 | Kubernetes、client-go、Prometheus、VictoriaMetrics、Terraform 均 Go 原生。CNCF 70%+ 基础设施项目用 Go。**K8s 用 Go 写 → client-go 是权威、最佳维护的 SDK**，Rust 的 kube-rs 是跟随者。 |
| 开发速度 | 5 | 3 | 高 | Go 语法少、编译秒级、易读易维护；Rust 借用检查学习曲线陡，初版交付慢 30–50%。MVP 要的是"先做成"。 |
| 人才供给 | 5 | 2 | 高 | 云原生/后端 Go 工程师充足且招聘成本低；Rust 人才稀缺、薪资高。 |
| 运维工具链契合 | 5 | 4 | 高 | Go 编译为单一静态二进制，无运行时依赖，天然容器/K8s 友好（与本项目自托管 K8s 高度契合）；Rust 同样静态二进制但生态体量小。 |
| 原始性能(CPU) | 4 | 5 | 低 | Rust 无 GC 极致性能；Go GC 停顿已 <1ms，对本场景无感知瓶颈。本产品非数据平面，性能非决策因子。 |
| 内存安全 | 3 | 5 | 中 | Rust 编译期保证；Go 靠 GC。企业后台正确性靠测试与 RBAC 校验保障，非语言层。 |
| **综合** | **推荐** | 备选 | — | **Go 在全部高权重维度占优，Rust 仅在低权重的原始性能占优。** |

### 1.2 决策

**后端语言锁定 Go 1.22.x。** Web/API 服务层用 Go（Gin 或 Echo 路由）；与 K8s 交互统一走 `client-go` + 服务账号模拟（impersonation）。Rust 不在 MVP 范围；若未来自研高性能数据面组件（如自研 TSDB/采集器）再局部引入，属"混合架构"后续决策。

---

## 2. 前端框架选型：React 18 + TypeScript + Vite + Ant Design 5

### 2.1 对比矩阵（评分 1–5）

| 维度 | React 18 | Vue 3 | Svelte |
|------|----------|-------|--------|
| 高密度数据网格(AG Grid/TanStack Table) | 5 | 4 | 3 |
| 监控图表生态(ECharts/visx) | 5 | 4 | 3 |
| 终端/代码编辑器(xterm.js/Monaco) | 5 | 3 | 2 |
| 企业后台组件库(Ant Design) | 5 | 4(Element/Naive) | 2 |
| 运维控制台先例(Grafana/KubeSphere/Rancher 均 React) | 5 | 2 | 1 |
| 实时/WebSocket 生态 | 5 | 4 | 3 |
| **综合** | **推荐** | 备选 | — |

### 2.2 决策

**前端锁定 React 18.3 + TypeScript + Vite 5 + Ant Design 5 + ECharts 5。**
- 高密度 Dashboard：AG Grid / TanStack Table + ECharts（Grafana 同款图表能力）。
- K8s 终端：`xterm.js`；日志/CI YAML 查看：`monaco-editor`。
- 数据获取与缓存：`@tanstack/react-query` v5；状态：`zustand`。
- **图标唯一来源：lucide-react（见第 6 节）。严禁引入 `@ant-design/icons`，避免图标库混用（P0 红线）。**

---

## 3. 存储分层选型

| 数据类 | 锁定选型 | 备选 | 理由 |
|--------|----------|------|------|
| 关系型（用户/角色/权限/租户/审计/部署元数据/K8s 集群注册） | PostgreSQL 16 | — | 主数据源；用 Row-Level Security 实现多租户隔离（见知识库 multi-tenant-saas）。 |
| 缓存/会话/限流/实时 PubSub | Redis 7.2 | — | JWT 会话、API 限流、WebSocket 广播。 |
| 时序（监控指标） | VictoriaMetrics (单节点 MVP) | Prometheus + Mimir | PromQL 完全兼容、压缩率高（省 40–70% 存储）、原生多租户（tenant header）、单二进制易运维。控制台经 HTTP API（`/api/v1/query`、`/query_range`）查询，不直连 TSDB。 |
| 日志（全文检索） | OpenSearch 2.17 | Loki / VictoriaLogs | 需"日志分析"全文检索能力；OpenSearch Security 插件提供**索引级 + 字段级 RBAC**，与多租户隔离天然契合；Loki 更轻但全文弱且无内建 RBAC（需外部代理层补全）。MVP 可单节点，生产扩集群。 |
| 向量（未来 AI 辅助） | pgvector（PostgreSQL 扩展） | 独立向量库 | 预留，本期不启用。 |

> 多租户隔离策略：PostgreSQL 用 `tenant_id` 字段 + RLS；VictoriaMetrics 用 `tenant` header 隔离；OpenSearch 用索引命名空间 `logs-{tenant_id}` + Security 插件文档级权限；前端/网关层统一注入租户上下文。

---

## 4. 部署架构（K8s 友好）

| 层 | 方案 |
|----|------|
| 后端镜像 | 多阶段 Dockerfile → Go 静态二进制 → `gcr.io/distroless/static` 或 `alpine`（镜像 <30MB） |
| 前端产物 | `vite build` → Nginx 静态托管 + CDN |
| 编排 | 自托管 Kubernetes（产品即管理 K8s，自举 dogfood）；Helm Chart 部署全部组件 |
| CI/CD | GitLab CI：代码 → 单测/ lint → 构建镜像 → 推送 registry → ArgoCD/Helm 同步部署 |
| 可观测底座 | Prometheus `remote_write` → VictoriaMetrics；OTel Collector → OpenSearch；Grafana（可选，复用 VM/OS 数据源） |
| 网关 | 单入口 Ingress + JWT 校验中间件；WebSocket 走独立路由（实时指标推送 / 日志 tail / K8s exec） |

---

## 5. 模块化架构（分层 + 按域分包）

### 5.1 分层铁律（依赖只能向下，技术栈无关）

```
Routes/Controllers  →  Services  →  Repositories  →  Infra(DB/Cache/第三方)
        │                │              │
   仅参数校验+      业务规则+事务   数据读写，无业务
   调 service+      编排，不碰     逻辑
   组装响应         req/res
```

- Controller 禁直连 DB；Service 禁 import `req/res`、禁返回 HTTP 响应；Repository 禁含业务逻辑。
- 单文件 ≤ 300 行；入口文件只装配。

### 5.2 后端目录（Go，单仓多模块）

```
cmd/api-server/main.go            # 入口：装配路由/中间件/启动，无业务
internal/
  platform/                       # 共享底座
    auth/        rbac/   audit/   tenant/   middleware/   config/
  modules/                       # 四大能力域，各自 routes/controller/service/repository
    monitoring/                  # 监控告警：VM 查询 + 告警规则
    logging/                     # 日志分析：OS 查询 + tail 桥接
    deployment/                  # CI/CD：GitLab 适配器
    infrastructure/              # 主机 + K8s：client-go 封装
  pkg/
    k8sclient/                   # client-go + impersonation 封装
    victoriametrics/  opensearch/  response/   # 第三方客户端 + 统一响应体
go.mod
```

### 5.3 前端目录（React）

```
src/
  components/        # AntD 包装 + Lucide 图标注册表（全项目唯一图标源）
  features/          # 按域：monitoring / logging / deployment / infrastructure
  layouts/           # 应用外壳、侧边导航（Lucide 图标）
  services/          # 按资源的 API 客户端（axios/fetch 封装）
  stores/            # zustand 状态
  styles/tokens.css  # 设计令牌（CSS 变量，禁止硬编码颜色）
  types/             # 由 openapi.yaml 生成的 TS 类型
  App.tsx  main.tsx
```

### 5.4 四大能力域可行性 + 风险点

| 域 | 可行性 | 关键风险 | 缓解 |
|----|--------|----------|------|
| 监控告警 | 可行：VM HTTP API 查 PromQL；`vmalert` 管规则 | 高基数查询慢、超时 | 查询超时 + 每租户 QPS/点数上限 + 预聚合 recording rules |
| 日志分析 | 可行：OS `_search` DSL；tail 经 WebSocket 桥接 | 高吞吐采集压垮存储 | OTel Collector + 背压 + 采样 + 保留期分层（热 7 天 / 冷 30 天） |
| 部署/CI-CD | 可行：GitLab REST API（pipeline/job） | 多厂商差异大 | 适配器接口 `CICDProvider`，MVP 仅 GitLab 实现 |
| 主机与 K8s | 可行：client-go + impersonation；主机经 SSH/agent | K8s API 复杂、watch 连接膨胀、凭证管理 | **服务账号模拟透传 RBAC**（见 ADR-004）；共享 informer 缓存；不存用户凭证，用 SA + impersonation；并发 watch 上限 |

---

## 6. 锁定的 SVG 图标库（P0 红线①+③）

- **库：Lucide（`lucide-react`，ISC 许可，等同 MIT，免署名）**
- **前端依赖必须包含**：`lucide-react`（锁定精确版本，避免图标改名导致构建断裂）。
- **尺寸约定**：全局仅使用 **16 / 20 / 24 px** 三档（`size` prop），禁止其他尺寸；默认 `strokeWidth=2`、24px 网格，视觉一致。
- **颜色**：图标用 `currentColor` 继承设计令牌（CSS 变量），**不传硬编码 hex**（满足 P0 红线④）。
- **禁用**：emoji 图标、字体图标（icon font）、`@ant-design/icons`、`heroicons`、`tabler` 等任何其他图标源——全项目唯一 Lucide。
- **理由**：1500+ 一致描边图标、tree-shaking（按需 ~1KB/图标）、React/Vue/Svelte 一等支持、currentColor 契合令牌化主题、是 shadcn/AntD 生态事实标准，运维场景图标覆盖全（server/cpu/database/container/activity/bell/alert 等）。

---

## 7. ADR 候选（MADR 要点）

### ADR-001：后端语言采用 Go
- **Status**：Proposed（待评审）
- **Context**：需企业级 RBAC + 可扩展 + 深度对接 K8s/云原生；MVP 要快交付。
- **Decision**：Go 1.22.x，Web 层 Gin/Echo，K8s 交互走 client-go。
- **Consequences**：+ 生态/人才/交付速度占优，K8s 对接零摩擦；− 极致 CPU 性能不及 Rust（本场景无感）。
- **Alternatives**：Rust（仅数据面场景更优，MVP 不取）。

### ADR-002：前端采用 React 18 + TS + Vite + Ant Design 5
- **Status**：Proposed
- **Context**：运维大屏高密度数据 + 终端/编辑器 + 企业后台组件。
- **Decision**：React 18.3 + Vite 5 + AntD 5 + ECharts 5 + TanStack Query/Table + xterm + Monaco；图标仅 lucide-react。
- **Consequences**：+ 生态/先例最契合运维控制台；− 包体需靠 tree-shaking 与按需引入控制。
- **Alternatives**：Vue 3（备选，生态略弱于本场景）。

### ADR-003：存储分层（PG + Redis + VictoriaMetrics + OpenSearch）
- **Status**：Proposed
- **Context**：关系/缓存/时序/全文四类数据形态各异。
- **Decision**：PG16 主数据+RLS 多租户；Redis7.2 缓存/会话/限流；VM 时序；OS 全文日志。
- **Consequences**：+ 每类用最合适存储，OS 内建 RBAC 利于租户隔离；− 运维 4 个有状态组件（MVP 单节点，生产扩集群）。
- **Alternatives**：Loki（更轻但全文弱、无内建 RBAC）；Prometheus+Mimir（扩展复杂）。

### ADR-004：RBAC 模型（经典 RBAC + 租户作用域 + K8s 模拟透传）
- **Status**：Proposed
- **Context**：多团队、多租户、需分级权限与审计；且要安全代理 K8s 操作。
- **Decision**：
  - 模型：用户 → 角色 → 权限（resource:action）；全局角色（platform_admin）+ 租户角色（owner/admin/member/viewer）。
  - 多租户：所有查询/写入自动注入 `tenant_id`，RLS 强制隔离。
  - K8s 透传：控制台用平台 SA 调用 K8s，经 `rest.ImpersonationConfig` 以"目标租户 SA"身份发起请求 → **不绕过集群 RBAC**，审计日志同时记录原始操作者与模拟身份。
- **Consequences**：+ 最小权限、可审计、租户隔离强；− impersonation 需精细 ClusterRole 授权（运维成本）。
- **Alternatives**：直接给控制台 cluster-admin（拒绝，违反最小权限）。

---

## 8. 技术约束清单（版本锚定 + 不可行警告）

### 8.1 版本锚定（写进 go.mod / package.json，按此版本 API 编码）
- 后端：Go 1.22.x；`github.com/gin-gonic/gin` v1.10.x（或 `echo` v4.12.x）；`k8s.io/client-go` v0.31.x（对应 K8s 1.31，必须同版本对齐）；`github.com/jackc/pgx/v5`；`redis/go-redis/v9`；`github.com/golang-jwt/jwt/v5`。
- 前端：Node 20.x(LTS)；React 18.3.1；Vite 5.x；antd 5.21.x；echarts 5.5.x；`@tanstack/react-query` 5.x；`@tanstack/react-table` 8.x；xterm 5.x；monaco-editor 0.5x；**lucide-react 0.439.0（精确锁定）**。
- 存储/中间件：PostgreSQL 16；Redis 7.2；VictoriaMetrics v1.101.x（单节点 MVP）；OpenSearch 2.17.x；OTel Collector 0.10x。
- 部署：Docker；Kubernetes 1.31；Helm 3.15+；GitLab CI；ArgoCD 2.12+。

### 8.2 不可行 / MVP 范围外警告（写进 Spec 作为硬约束）
1. **自研采集链路不可行**：指标采集（Prometheus remote-write）、日志采集（OTel Collector）必须复用现有组件，禁止 MVP 自研 agent 集群。
2. **多集群联邦不可行（MVP）**：仅支持 1–3 集群，经 SA + impersonation 接入；跨集群全局视图/联邦为后续迭代。
3. **日志实时 tail 高吞吐风险**：WebSocket 每租户并发上限 + 背压；超阈值降级为轮询最近 N 条。
4. **CI/CD 多厂商不可行（MVP）**：仅 GitLab CI 适配器；GitHub Actions/Jenkins 为后续适配器。
5. **审计 SIEM 导出不可行（MVP）**：仅 PG 内审计表 + 基础保留期（如 90 天）+ 异步写；无 SIEM/长期归档。
6. **K8s watch 规模风险**：每集群共享 informer 缓存，并发 watch 设上限；禁止为每次请求新建 ClientSet（用共享 rest.Config + impersonation 复用连接）。
7. **OpenSearch 中文分词**：仅安装 IK 分析器插件，不做自定义词典训练。

### 8.3 P0 红线落地产物（ MUST 进 Spec）
- 图标：全项目仅 `lucide-react`，尺寸 16/20/24，禁用 emoji 与其他图标库；前端依赖项锁定 `lucide-react`。
- 颜色：仅 `#fff`/`#000` 可硬编码，其余一律走 `styles/tokens.css` 设计令牌（CSS 变量）；Lucide 用 `currentColor`。
- 渐变：禁止紫色→粉色渐变（及任何高饱和装饰性渐变），主题以中性色 + 单品牌色构建。
- 文档：架构/API 文档零 emoji。

---

## 9. 端到端验证步骤（收尾即验收，覆盖成功流 + 错误流）
1. 启动依赖：`docker compose up` 拉起 PG/Redis/VM/OS（单节点）。
2. 后端：`go run cmd/api-server/main.go`；`/api/v1/auth/login` 成功返回 JWT。
3. 成功流：用 JWT 调 `/api/v1/monitoring/query`（PromQL）→ 返回 VM 数据；调 `/api/v1/infrastructure/clusters/{id}/pods` → 经 impersonation 返回 pod 列表。
4. 权限错误流：用 `viewer` 角色调 `POST /api/v1/deployment/pipelines/{id}/trigger` → 返回 403 + 统一错误体；越租户查他人数据 → RLS/租户过滤拦截，返回空或 403。
5. 审计：上述操作在 `audit_logs` 表留痕（操作者 + 模拟身份 + 动作 + 时间）。
6. 前端：`vite build` 通过；页面仅出现 Lucide 图标（grep 确认无 emoji、无 `@ant-design/icons` 引入）；颜色全部来自令牌（grep 确认无硬编码 hex 除 #fff/#000）。
