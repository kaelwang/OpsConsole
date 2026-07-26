# Spec - 企业多团队统一运维控制台（OpsConsole）v1.0.0

> 生成日期：2026-07-22
> 基于：PRD v1 + 架构决策报告 v1 + 设计方向 v1 + openapi.yaml v1
> 状态：**已确认（用户于 Phase 1 三文档确认后自动生成）**
> 总监：大湾区靓仔 | PM：许清楚 | 架构：高见远 | 设计：颜好看

---

## 1. 产品定义
- **一句话描述**：面向企业多团队的**自托管、统一权限（RBAC）、薄而全** Web 运维控制台，在监控告警 / 日志分析 / 部署-CI-CD / 主机与 K8s 四大域各提供最小可用闭环，并以一套账号 + RBAC + 审计贯穿全局。
- **目标用户**：50–2000 人技术组织的平台工程 / SRE / 运维负责人；次要为研发（自助排障）与管理者/合规（可追溯）。
- **核心问题**：工具与数据孤岛、部署维护成本高、权限与合规缺口、SaaS 锁定与成本不可控、学习成本高。

## 2. MVP 范围（锁定——不在此列表的功能一律不做）

| 优先级 | 功能 | 域 | 验收标准摘要 |
|--------|------|----|---------------|
| P0 | F0 统一账号体系与登录 | 底座 | 本地账号 + 外部目录（LDAP/AD/OIDC 可选）|
| P0 | F1 RBAC 权限分级 | 底座 | 角色：超管/运维/SRE/开发/只读；按域+资源+团队授权 |
| P0 | F2 审计日志 | 底座 | 关键操作留痕：谁/何时/对什么/做了什么，普通用户不可删 |
| P0 | M1 主机/服务基础指标采集与仪表盘 | 监控告警 | CPU/内存/磁盘/网络/进程，预置看板，延迟≤30s |
| P0 | M2 可视化告警规则配置 | 监控告警 | UI 配阈值规则，免写 YAML/Alertmanager 路由 |
| P0 | M3 告警通知 | 监控告警 | 邮件+Webhook+企微/钉钉/飞书其一 |
| P0 | L1 日志集中采集与检索 | 日志分析 | 全文检索、按时间/级别/服务过滤 |
| P0 | L2 日志上下文与高亮 | 日志分析 | 单条上下文展开、关键字高亮 |
| P0 | D1 应用部署管理与状态总览 | 部署/CI-CD | 经 Git 仓库或镜像部署，查看进度与状态 |
| P0 | D2 部署历史与一键回滚 | 部署/CI-CD | 版本列表、回滚到上一稳定版本 |
| P0 | H1 主机/集群纳管与总览 | 主机/K8s | 节点/集群接入、健康、资源水位总览 |
| P0 | H2 工作负载查看与基本操作 | 主机/K8s | Pod/容器查看、重启、日志直达 |

## 3. 明确不做（Out-of-Scope — 锁定）

| 不做的功能 | 原因 | 何时考虑 |
|------------|------|----------|
| 单域深度（APM 全链路、AI 根因、容量预测）| MVP 求薄而全 | v2.0+ |
| 自研指标采集/日志 shipper | 复用 Prometheus remote-write / OTel Collector | 永不（MVP 禁自研 agent 集群）|
| 多集群联邦 | MVP 仅 1–3 集群 | 后续迭代 |
| 多 CI 厂商（仅 GitLab 适配器）| 适配成本高 | 后续适配器 |
| SIEM 审计导出/长期归档 | MVP 仅 PG 审计表 + 90 天保留 + 异步写 | 后续 |
| 工作流引擎/ITSM 工单 | 范围外 | 后续集成 |
| 多云账单/FinOps、移动端原生 App | 范围外 | 后续 |
| 对外 SaaS 多租户售卖 | MVP 面向单企业内多团队 | 后续 |

## 4. 技术架构（锁定 — 含版本锚定）

> 版本锚定：框架写实际版本号，防止幻觉 API。技术栈由架构师选型，下表为锁定值。

| 层 | 技术 | 实际版本 | 锁定原因 |
|----|------|----------|----------|
| 后端 | Go | 1.22.x | I/O 密集聚合代理型服务，云原生生态（K8s/client-go/Prometheus 原生）|
| 后端 Web | Gin | v1.10.x | 路由轻量；或 Echo v4.12.x |
| K8s SDK | client-go | v0.31.x | 须与 K8s 1.31 同版本对齐 |
| 数据库驱动 | pgx/v5 | latest | PostgreSQL 16 驱动 |
| 缓存 | go-redis/v9 | latest | Redis 7.2 会话/限流/PubSub |
| 认证 | golang-jwt/jwt/v5 | latest | JWT 15min access + 7d refresh |
| 前端 | React + TS + Vite | 18.3.1 / 5.x | 高密度 Dashboard + 终端 + 企业组件生态最契合 |
| 前端 UI | Ant Design 5 | 5.21.x | 企业后台组件 |
| 图表 | ECharts 5 | 5.5.x | 监控可视化 |
| 数据获取 | TanStack Query/Table | 5 / 8 | 服务端状态 + 表格 |
| 终端/编辑器 | xterm 5 / monaco 0.5x | — | 容器终端 / YAML 查看 |
| 图标 | **lucide-react** | **0.439.0（精确锁定）** | 唯一图标源，禁 emoji/其他库 |
| 关系库 | PostgreSQL | 16 | 主数据 + RLS 多租户 |
| 缓存 | Redis | 7.2 | 会话/限流/实时 |
| 时序 | VictoriaMetrics | v1.101.x | PromQL 兼容、压缩省、原生多租户 |
| 日志 | OpenSearch | 2.17.x | 全文检索 + 字段级 RBAC |
| 部署 | Docker + K8s 1.31 + Helm 3.15+ + GitLab CI + ArgoCD 2.12+ | — | 自托管、自举 dogfood |

## 5. API 端点清单（锁定——开发唯一依据）

统一响应体：`{ code: int, data: any, message: string }`。前缀 `/api/v1`。Bearer JWT。租户上下文由网关中间件注入。

| Method | Path | 功能 | 认证 | 对应功能 |
|--------|------|------|------|----------|
| POST | /auth/login | 登录 | 否 | F0 |
| GET | /rbac/roles | 列出角色与权限 | 是 | F1 |
| POST | /rbac/assign | 分配租户角色（admin+）| 是 | F1 |
| GET | /audit/logs | 查询审计日志（分页+过滤）| 是 | F2 |
| GET | /monitoring/query | PromQL 查询（代理 VM）| 是 | M1 |
| GET/POST | /monitoring/alert-rules | 告警规则列表/创建（admin+）| 是 | M2 |
| GET | /monitoring/alerts | 告警事件列表 | 是 | M3 |
| GET/POST | /monitoring/notifications | 通知渠道配置（admin+）| 是 | M3 |
| GET | /logging/search | 日志全文检索（代理 OS）| 是 | L1 |
| GET | /logging/tail | 实时日志流（WebSocket）| 是 | L2 |
| GET | /deployment/pipelines | 流水线列表（GitLab）| 是 | D1 |
| POST | /deployment/pipelines/{id}/trigger | 触发流水线（member+）| 是 | D1 |
| POST | /deployment/pipelines/{id}/rollback | 回滚到上一版本（member+）| 是 | D2 |
| GET | /infrastructure/clusters | 已注册集群列表 | 是 | H1 |
| POST | /infrastructure/clusters | 注册集群（绑定 SA+impersonation，admin+）| 是 | H1 |
| GET | /infrastructure/clusters/{id}/pods | Pod 列表（SA impersonation 透传 K8s RBAC）| 是 | H2 |
| GET | /infrastructure/clusters/{id}/exec | 容器终端（WebSocket，impersonation）| 是 | H2 |
| GET | /infrastructure/hosts | 主机列表（SSH/agent 纳管）| 是 | H1 |

> 完整契约见 `openapi.yaml`（Phase 2 由架构师补全上述 2 个新增端点的 request/response schema）。

## 6. 数据库表清单（锁定 — PostgreSQL 16，RLS 多租户）

> 所有业务表含 `tenant_id uuid NOT NULL`，启用 Row-Level Security 强制隔离。

| 表名 | 核心字段 | 索引 | 关联 |
|------|----------|------|------|
| tenants | id, name, created_at | PK(id) | — |
| users | id, email UNIQUE, password_hash, display_name, created_at | PK(id), UNIQUE(email) | — |
| tenant_memberships | tenant_id, user_id, role(enum), created_at | PK(tenant_id,user_id) | users, tenants |
| roles | name, permissions jsonb | PK(name) | — |
| clusters | id, tenant_id, name, kubeconfig_ref, sa_name, created_at | PK(id), IDX(tenant_id) | audit |
| alert_rules | id, tenant_id, expr, for, severity, channel_ids, created_by | PK(id), IDX(tenant_id) | notification_channels |
| notification_channels | id, tenant_id, type(enum), config jsonb | PK(id), IDX(tenant_id) | — |
| hosts | id, tenant_id, ip, ssh_ref, os, status | PK(id), IDX(tenant_id) | — |
| deployments | id, tenant_id, pipeline_id, version, status, created_by, created_at | PK(id), IDX(tenant_id) | — |
| audit_logs | id, tenant_id, actor_id, impersonated_as, action, object, result, created_at | PK(id), IDX(tenant_id,actor_id,created_at) | — |

> 时序（VM）/ 日志（OS）不入库，经 HTTP API 查询；审计保留 90 天。

## 7. 页面清单（锁定）

| 页面 | 路由 | 核心组件 | 对应 API | 设计 Token 主题 |
|------|------|----------|----------|-----------------|
| 登录 | /login | LoginForm（Lucide user 图标）| /auth/login | 深色规范面 |
| 运维首页 | / | 状态磁贴 + 关键指标网格 + 活跃告警流 + 近期部署 + 集群利用率 + 近期审计 | 多端点聚合 | 双主题 |
| 监控 | /observability/metrics | ECharts 看板 + 告警规则表 | /monitoring/* | 双主题 |
| 日志 | /observability/logs | 终端流检索（等宽高亮）+ 上下文抽屉 | /logging/* | 深色优先 |
| 交付 | /delivery/pipelines | 流水线状态时间线 + 触发/回滚按钮 | /deployment/* | 双主题 |
| 基础设施 | /infrastructure/clusters | 集群/节点总览 + Pod 表 + 终端弹窗 | /infrastructure/* | 双主题 |
| 审计 | /management/audit | 可搜索/筛选/导出审计表 | /audit/logs | 双主题 |
| 权限 | /management/access | 角色与成员分配 | /rbac/* | 双主题 |
| 设置 | /settings | 主题/通知渠道/集群注册 | 多端点 | 双主题 |

## 8. 设计 Token（锁定）

> 详见 `design-tokens.json` + 生成的 `styles/tokens.css`，前端 import 引用，禁止硬编码颜色（仅 `#fff`/`#000` 例外）。

- **主色/强调色**：Signal Cerulean `#1C8FE6`（深色）/ `#1577C2`（浅色）；hover `#3AA0F0`；每屏 ≤2 处可见使用。
- **中性阶梯（深色）**：`--bg #0B0E14` → `#121620` → `#1A1F2B` → `#232A38`；文字 `#E6E9EF→#565E6E`。
- **语义色**：success `#2EA043` / warn `#E8A33D` / danger `#F85149`（浅色相应加深保 AA）。
- **字体**：UI/标题 `Geist, Inter, Noto Sans SC`；等宽 `Geist Mono, JetBrains Mono`（表格/指标/日志/timestamp，tabular 数字）。
- **图标库**：**Lucide（lucide-react 0.439.0）**，尺寸 16/20/24px，strokeWidth 2，currentColor。
- **主题**：双主题一等公民，单语义 Token 集 + `data-theme` 切换；初始跟随系统、可持久化。
- **风格**：紧凑型专业控制台（Compact Mission-Control Console）；表面阶梯 + 发丝边框表达层级（拒绝阴影/毛玻璃滥用）；动效 150/200ms `cubic-bezier(0.2,0,0,1)`，禁弹跳缓动，支持 reduced-motion。
- **对标品牌**：Grafana（工程感）+ Linear（克制）。
- 注意：**图表调色板含紫色 `#A371F7`，仅作数据序列色（多曲线区分），非主视觉渐变**——符合 P0 红线。

## 9. 验收标准（锁定 — EARS 格式）

| 编号 | 功能 | EARS 格式验收标准 | 优先级 |
|------|------|-------------------|--------|
| AC-01 | F0 登录 | While 用户输入正确凭证，系统**必须**创建会话并返回 JWT（15min access + 7d refresh）| P0 |
| AC-02 | F0 登录 | If 邮箱不存在或密码错误，系统**必须**返回 401 + 错误信息 | P0 |
| AC-03 | F1 RBAC | If 角色为 viewer 尝试修改告警规则，系统**必须**拒绝（403）并记审计 | P0 |
| AC-04 | F2 审计 | When 任意关键操作完成，系统**必须**在 audit_logs 写入操作人/模拟身份/动作/对象/时间，且普通用户**不能**删除 | P0 |
| AC-05 | M1 指标 | While 主机已纳管且采集器在线，When 用户打开看板，系统**必须**展示延迟≤30s 的 CPU/内存/磁盘/网络指标 | P0 |
| AC-06 | M2 告警 | Given UI 设"CPU>85% 持续5分钟"，When 触发，系统**必须**生成告警事件并进入通知 | P0 |
| AC-07 | M3 通知 | Given 配置企微渠道，When 告警触发，系统**必须**在 1 分钟内投递结构化消息 | P0 |
| AC-08 | L1 检索 | Given 日志已采集，When 用户输入关键字+时间范围，系统**必须**返回匹配且可按级别过滤 | P0 |
| AC-09 | D1 部署 | Given 已关联 Git/镜像，When 触发部署，系统**必须**显示进度与最终状态 | P0 |
| AC-10 | D2 回滚 | Given 有历史版本，When 用户点击回滚，系统**必须**将服务恢复至上一版本且状态可见 | P0 |
| AC-11 | H1 总览 | Given 集群已接入，When 用户打开总览，系统**必须**展示节点健康/资源水位/异常标记 | P0 |
| AC-12 | H2 操作 | Given 选中 Pod，When 用户点重启并经权限校验，系统**必须**重启该 Pod 且记审计 | P0 |
| AC-13 | 越租户 | If 用户查询非本人租户数据，系统**必须**经 RLS/租户过滤拦截，返回空或 403 | P0 |

## 10. 边界与约束
- 不支持 IE；现代浏览器最新 2 版。
- 响应式断点：≥1280 桌面优先，≥768 平板可用，移动端仅保证可读。
- 性能目标：首屏 <3s；指标/日志查询 p95 <1s（百万级日志）；告警评估延迟 ≤30s。
- 安全：HTTPS + JWT + 输入校验 + 速率限制；RBAC 默认最小权限；审计防篡改；凭据加密；K8s 经 SA impersonation 透传 RBAC，不绕过集群权限。
- MVP 仅 1–3 集群；仅 GitLab CI 适配器；日志中文分词仅 IK 插件。
- WebSocket 每租户并发上限 + 背压，超阈值降级轮询。

## 11. 内嵌已知坑（从项目记忆拉取）
> 当前为全新项目，`.workbuddy/memory/pitfalls.jsonl` 暂无记录。开发阶段遇到报错由对应 agent 实时沉淀。

| 坑 | 技术栈指纹 | 根因 | 修法 |
|----|------------|------|------|
| client-go 版本须与 K8s 同版本 | client-go v0.31.x ↔ K8s 1.31 | API 不兼容导致 informer 报错 | 锁定对齐；CI 校验 |
| OpenSearch IK 分词需预装插件 | opensearch 2.17 + analysis-ik | 中文检索失效 | docker-compose 预装插件镜像 |
| VM 高基数查询超时 | victoriametrics | 全量扫描 | 查询超时 + 预聚合 recording rules + 每租户 QPS 上限 |

## 12. 端到端验证步骤（Spec 锁定）

```bash
# 1. 启动依赖（单节点）
docker compose up -d pg redis victoriametrics opensearch

# 2. 后端构建与启动
cd backend && go build ./... && go run cmd/api-server/main.go
# 断言：监听 :8080，/api/v1/auth/login 返回 JWT

# 3. 核心成功流
curl -X POST localhost:8080/api/v1/auth/login -d '{"email":"admin@corp","password":"xxxxxxxx"}'
# 断言：200 + accessToken
curl -H "Authorization: Bearer $TOKEN" localhost:8080/api/v1/monitoring/query?expr=up
# 断言：200 + VM 数据
curl -H "Authorization: Bearer $TOKEN" localhost:8080/api/v1/infrastructure/clusters/{id}/pods
# 断言：200 + 经 impersonation 的 Pod 列表

# 4. 关键错误流
curl -H "Authorization: Bearer $VIEWER_TOKEN" -X POST localhost:8080/api/v1/deployment/pipelines/{id}/trigger
# 断言：403 + 统一错误体
curl -H "Authorization: Bearer $TOKEN" localhost:8080/api/v1/infrastructure/clusters/{other}/pods
# 断言：空或 403（越租户拦截）

# 5. 审计
psql -c "SELECT actor_id,action,object FROM audit_logs ORDER BY created_at DESC LIMIT 5;"
# 断言：上述操作已留痕

# 6. 前端构建 + P0 扫描
cd frontend && npm run build
grep -rP '[\x{1F300}-\x{1FAFF}]' src/ && echo "EMOJI FOUND" || echo "OK no emoji"
grep -rn '@ant-design/icons' src/ && echo "ICON LIB MIX" || echo "OK single icon lib"
```

## 13. 变更记录
| 日期 | 变更内容 | 原因 | 影响范围 |
|------|----------|------|----------|
| 2026-07-22 | 初始 Spec v1.0.0 生成 | 三文档确认后自动生成 | 全项目 |

---

## ADR 索引（详见架构决策报告）
- ADR-001 后端采用 Go 1.22 + client-go
- ADR-002 前端 React 18 + TS + Vite + AntD5 + Lucide
- ADR-003 存储分层 PG + Redis + VictoriaMetrics + OpenSearch
- ADR-004 RBAC（经典 RBAC + 租户作用域 + K8s impersonation 透传）
