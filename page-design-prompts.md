# 页面级设计提示词（Page Design Prompts）— OpsConsole MVP

> 依据：`SPEC.md` §7 页面清单 / §8 设计 Token、`design-tokens.json`、`design-direction.md`
> 受众：**前端工程师**（Ant Design 5 + React 18 + TS + Vite + lucide-react 0.439.0 + ECharts 5 + xterm）
> 状态：**锁定可照做**。颜色一律走 Token，图标一律走 Lucide，禁止 emoji / 硬编码色 / 紫粉渐变 / 弹跳缓动 / 占位文案。

---

## 0. 全局约定（所有页面共享 — 必读）

### 0.1 设计寄存器与三轴刻度
- **Register = Product（设计服务产品）**：工具型控制台，数据即主角，无营销腔。
- `DESIGN_VARIANCE = 4`（干净网格 + 轻微偏移，无居中 Hero）、`MOTION_INTENSITY = 4`（仅 hover/active/focus/状态过渡）、`VISUAL_DENSITY = 7`（驾驶舱紧凑：4px 网格 + 1px 分隔线 + 等宽数字，但分组清晰）。

### 0.2 Design Token 引用铁律（P0）
- 颜色**只**用 `design-tokens.json` 里的变量，经 `import tokens from './design-tokens.json'` 注入 CSS 变量（见 `styles/tokens.css` 的 `--bg/--surface/--fg/...`）。**禁止**任何裸 hex（唯一例外 `#fff`/`#000`，且本产品刻意不用纯黑白）。
- 图表序列色只从 `tokens.chart.series` 取（含紫 `#A371F7`——仅作数据序列，非主视觉）。
- 字号/间距/圆角/动效一律引用 `--font-size-*`、`--space-*`、`--radius-*`、`--motion-*`，不要手写像素。

### 0.3 双主题应用机制
- 单一语义 Token 集 + `data-theme="dark|light"` 切换；深色为规范面（canonical）。
- 初始跟随 `prefers-color-scheme`；用户可在「设置 → 外观」持久化覆盖（写 localStorage，刷新不丢）。
- 深色：层级用**表面阶梯 + 发丝边框**表达，禁用大阴影/毛玻璃；浅色：发丝边框 + 极轻阴影 `0 1px 2px rgba(0,0,0,0.06)`。
- 所有组件状态（default/hover/focus/active/disabled）双主题均须达 WCAG AA（正文 ≥4.5:1）。

### 0.4 强调色使用纪律（每屏 ≤2 处可见使用）
- 强调色 `--accent`（深 `#1C8FE6` / 浅 `#1577C2`）**仅**用于：主 CTA、激活态导航项、焦点环、关键链接。
- 每屏可见的 `--accent` 着色 ≤2 处（例如：1 个主按钮 + 1 个激活导航）。其余一律中性色或语义色。
- 语义色（success/warn/danger）只表达**状态**，不作装饰；阈值/健康度用冷→暖映射，不唯一依赖颜色（配图标 + 文字双编码，满足无障碍）。

### 0.5 字体与排版
- UI/标题：`var(--font-display)` = `"Geist","Inter","Noto Sans SC",system-ui,sans-serif`
- 数据/日志/时间戳/资源名：`var(--font-mono)` = `"Geist Mono","JetBrains Mono",ui-monospace,...` + `font-variant-numeric: tabular-nums`
- 字号：12/13/14/16/18/20/24/32（基准 14）；字重 400/500/600；行高正文 1.5、标题 1.2。
- 字距：正文 `0`；ALL-CAPS 小标签 `0.06em`；大标题(≥24px) `-0.02em`。

### 0.6 圆角与间距
- 圆角上限 **12px**（`--radius-lg`）；卡片用 1px `--border` + 轻圆角，**禁止"幽灵卡片"**（1px 边框 + ≥16px 模糊阴影同现）。
- 间距全部 4px 网格：`4/8/12/16/20/24/32/40/48/64`。

### 0.7 动效
- 时长 `150ms`(fast) / `200ms`(base)，缓动 `cubic-bezier(0.2,0,0,1)`（对应 `--motion-ease`）。
- **禁用弹跳缓动** `cubic-bezier(0.68,-0.55,0.265,1.55)`。
- 必须 `@media (prefers-reduced-motion: reduce)` 降级为瞬时。

### 0.8 Lucide 全局规范
- 唯一图标源 `lucide-react@0.439.0`；`strokeWidth={1.75}`（深色面更清晰）、`color="currentColor"`、尺寸 16(行内)/20(按钮内)/24(独立)。
- **禁止** `@ant-design/icons`、禁止任何 emoji 作图标（P0：CI 会 grep 拦截）。
- 导入示例：`import { LayoutDashboard, Activity, Rocket, Server, ShieldCheck } from 'lucide-react'`

---

## 1. App Shell 线框（可折叠侧栏 + 顶栏 + 主内容 + Inspector 抽屉）

> 所有已登录页面复用同一 Shell。登录页（`/login`）**不**使用此 Shell，独立 full-screen 规范面。

```
┌──────────────┬───────────────────────────────────────────────────────────┐
│              │  顶栏 Header（h=56px, 1px --border-soft 底分隔）            │
│  Sider       │  [⌘K 命令面板入口] [作用域选择器: 团队▾ 集群▾ 环境▾]        │
│  可折叠      │  ───── 弹性空白 ───── [告警铃+未读计数 Badge] [主题Sun/Moon] │
│  64px↔240px  │  [用户菜单 User▾]                                          │
│              ├───────────────────────────────────────────────────────────┤
│  一级≤5：    │  面包屑 / 页标题 + 上下文筛选 & 操作栏（右对齐主操作）      │
│  · 运维首页   ├───────────────────────────────────────────────────────────┤
│    LayoutDash│                                                            │
│  · 可观测     │   主内容 Content（真实数据；无 Hero/占位）                 │
│    Activity  │   - 桌面 ≥1280：内容 max-width 不限，留 24px gutter        │
│    ├ 监控     │   - 平板 ≥768：单列或双列，Sidebar 自动收 64px 图标态     │
│    └ 日志     │                                                            │
│  · 交付       │                          （可选右侧 Inspector 抽屉 Drawer）│
│    Rocket     │                           Linear 式下钻面板：详情/日志/    │
│  · 基础设施    │                           执行操作，不整页跳转             │
│    Server     │                                                            │
│  · 管理       │                                                            │
│    ShieldCheck└───────────────────────────────────────────────────────────┘
│    ├ 审计      （底部可选 StatusBar：当前集群/作用域/WebSocket 连接状态）   │
│    ├ 权限      │  EnvironmentBadge + 连接指示灯（success/warn/danger）     │
│    └ 设置      └───────────────────────────────────────────────────────────┘
└──────────────┘
```

**App Shell 实现要点**
- 组件：`Layout` + `Layout.Sider`(collapsible, `collapsedWidth=64`, `width=240`) + `Layout.Header` + `Layout.Content` + 可选 `Drawer`(Inspector, `placement="right"`, width 360–420)。
- Sider 折叠：64px 时只显图标（居中），240px 时图标+文字；折叠触发按钮用 `PanelLeftClose`/`PanelLeft`（24px, 顶栏左或 Sider 底）。
- 顶栏作用域选择器：三个 `Select`/`Dropdown`（`Building2` 团队、`Boxes` 集群、`MapPin` 环境），当前作用域写进全局 store，所有页面查询带 scope 参数。
- ⌘K 命令面板：`Command` 图标按钮（带 `⌘K` 提示文字，浅色 `--meta`），点击或 `Ctrl/Cmd+K` 唤起 `Modal`/自定义面板——搜资源、跳页面、执行操作（触发/重启/搜日志）。
- 告警铃：`Bell`（20px），右上角 `Badge` 显示未读严重告警数（danger 点数）；点击展开最近告警 `Popover`/`Drawer`。
- 主题切换：`Sun`/`Moon`（`ThemeToggle`，切换 `data-theme` + 持久化）。
- 用户菜单：`User`（20px）+ `Dropdown`：个人资料/外观/退出登录。
- 强调色纪律：Shell 内 `--accent` 仅用于「激活态导航项」+「⌘K/主操作按钮」之一，合计 ≤2 处。

**Lucide Shell 图标映射**
| 位置 | 图标 | 尺寸 | 状态着色 |
|---|---|---|---|
| 侧栏·运维首页 | `LayoutDashboard` | 20 | 激活态 `--accent` |
| 侧栏·可观测 | `Activity` | 20 | 激活态 `--accent` |
| 侧栏·交付 | `Rocket` | 20 | 激活态 `--accent` |
| 侧栏·基础设施 | `Server` | 20 | 激活态 `--accent` |
| 侧栏·管理 | `ShieldCheck` | 20 | 激活态 `--accent` |
| 折叠开关 | `PanelLeftClose`/`PanelLeft` | 20 | `--muted` |
| 命令面板 | `Command` | 20 | `--muted` |
| 作用域·团队 | `Building2` | 16 | `--muted` |
| 作用域·集群 | `Boxes` | 16 | `--muted` |
| 作用域·环境 | `MapPin` | 16 | `--muted` |
| 告警铃 | `Bell` | 20 | `--muted`，未读 `Badge` danger |
| 主题切换 | `Sun`(light)/`Moon`(dark) | 20 | `--muted` |
| 用户菜单 | `User` | 20 | `--muted` |

---

## 2. Lucide 图标映射总表（全局唯一 — 避免前后端理解偏差）

> 这是**唯一**图标真理源。前端所有图标从此表取，禁止自创或混库。

### 2.1 侧栏 5 个顶级导航（见 §1）
`LayoutDashboard`(运维首页) · `Activity`(可观测) · `Rocket`(交付) · `Server`(基础设施) · `ShieldCheck`(管理)

### 2.2 二级/子导航
| 子页 | 路由 | 图标 |
|---|---|---|
| 监控告警 | /observability/metrics | `Gauge` |
| 日志分析 | /observability/logs | `ScrollText` |
| 流水线/交付 | /delivery/pipelines | `Workflow` |
| 集群/基础设施 | /infrastructure/clusters | `Boxes` |
| 审计日志 | /management/audit | `History` |
| 权限/访问 | /management/access | `KeyRound` |
| 设置 | /settings | `Settings` |

### 2.3 通用操作/状态图标（跨页面复用）
| 语义 | 图标 | 尺寸 | 备注 |
|---|---|---|---|
| 搜索 | `Search` | 16/20 | 输入框内、工具栏 |
| 触发部署 | `Rocket` | 20 | 主操作（交付页） |
| 回滚 | `Undo2` | 20 | 危险操作，配确认 |
| 重启 Pod | `RotateCw` | 20 | 危险操作，配确认 |
| 告警/通知 | `Bell` | 20 | 列表/铃 |
| 日志 | `ScrollText` | 20 | 直达日志 |
| 集群 | `Boxes` | 20/24 | 拓扑/总览 |
| 主机/节点 | `HardDrive`(主机) / `Cpu`(节点) | 20 | |
| Pod | `Box` | 16/20 | 资源树叶子 |
| 容器 | `Package` | 16 | |
| 命名空间 | `Layers` | 16 | |
| 终端 | `Terminal` | 20 | xterm 弹窗入口 |
| 导出 | `Download` | 20 | CSV/审计导出 |
| 刷新 | `RefreshCw` | 16/20 | 列表/看板 |
| 过滤 | `ListFilter` | 16/20 | 级别/状态筛选 |
| 复制 | `Copy` | 16 | 资源名/命令 |
| 更多操作 | `MoreHorizontal` | 16 | Dropdown 触发 |
| 新建/创建 | `Plus` | 20 | |
| 编辑 | `SquarePen` | 16 | |
| 删除 | `Trash2` | 16/20 | 危险，配确认 |
| 保存 | `Check` | 20 | 表单提交 |
| 关闭/抽屉收 | `PanelRightClose` / `X` | 20 | Inspector |
| 全屏 | `Maximize2` | 16 | 终端/图表 |
| 下钻/详情 | `ChevronRight` | 16 | 行展开 |
| 时间线 | `Clock` | 16 | Timeline 节点 |
| 告警规则 | `SlidersHorizontal` | 20 | 阈值配置 |
| 通知渠道 | `Webhook` | 20 | M3 配置 |
| 作用域·团队 | `Building2` | 16 | |
| 作用域·环境 | `MapPin` | 16 | |
| 健康/存活 | `HeartPulse` | 16 | 节点/Pod 健康 |
| 指标·Gauge | `Gauge` | 20 | 监控入口 |
| 登录·用户 | `User` | 20 | 登录表单 |
| 登录·密码 | `Lock` | 20 | 密码框 |
| 成功 | `CheckCircle2` | 16/20 | success 状态 |
| 警告 | `AlertTriangle` | 16/20 | warn 状态 |
| 错误/危险 | `XCircle` | 16/20 | danger 状态 |
| 信息 | `Info` | 16 | info |
| 加载中 | `Loader2`(spin) | 16/20 | Spin 替代 |
| 空状态 | `Inbox` | 24/48 | Empty 插图 |
| 扩缩容 | `Scaling` | 16 | HPA |
| 网络 | `Network` | 16 | |

### 2.4 状态色编码（统一，配图标双编码）
| 状态 | 语义色 Token | 图标 |
|---|---|---|
| 健康/在线/成功 | `--success` | `CheckCircle2` |
| 注意/阈值逼近 | `--warn` | `AlertTriangle` |
| 告警/失败/离线 | `--danger` | `XCircle` |
| 运行中/加载 | `--accent` 或 `--muted` | `Loader2`(spin) |

---

## 3. 页面：登录 `/login`

- **路由 / 能力域**：`/login` · 底座（F0 统一账号体系）
- **布局**：独立 full-screen 规范面（**不**用 App Shell）。左右分栏（桌面）：左侧品牌/价值陈述（克制，深色 `--bg`，非营销大图——用产品名 + 一句话定位 + 3 个能力点列表，均真实语义），右侧登录卡片（`Card`，居中，`width: 360–400px`）。平板/移动：单列，卡片占满。
- **AntD 组件**：`Card` / `Form` / `Input`(prefix 图标) / `Button`(type=primary) / `Checkbox`(记住我) / `Alert`(错误 401) / `Spin`(提交中)。
- **Lucide 图标**：`User`(账号前缀)、`Lock`(密码前缀)、`Loader2`(提交 spin)、`ShieldCheck`(左侧品牌区"企业级 RBAC"能力点)、`Server`(纳管)、`ScrollText`(审计)。**无 emoji**。
- **强调色纪律**：仅 1 处——主登录按钮（type=primary，`--accent`）。左侧能力点图标用 `--muted`，不染 accent。
- **双主题**：登录页强制遵循当前 `data-theme`（默认跟随系统）；可在卡片内放 `Sun`/`Moon` 小切换（计入 ≤2 处，此时主按钮仍为本页唯一 accent 使用）。
- **响应式**：≥1280 左右分栏；≥768 单列卡片居中，留 24px gutter；移动端卡片 padding 16px。
- **文案（具体，禁占位）**：标题"登录统一运维控制台"；按钮"登录"；错误"邮箱或密码错误，请重试"（对应 AC-02）。左侧能力点示例："统一 RBAC 权限""主机与 K8s 纳管""全量操作审计"。

---

## 4. 页面：运维首页 `/`

- **路由 / 能力域**：`/` · 跨域总览（多端点聚合）
- **布局**（无 Hero、无占位，首屏即真实数据；`VISUAL_DENSITY=7` 但分组清晰）：
  1. **状态磁贴行**（Status Strip）：4 个 `Statistic` 磁贴（集群健康率 / 活跃告警数 / 今日部署数 / 失败流水线数），阈值着色（success/warn/danger），磁贴间 1px `--border-soft` 分隔，不用装饰卡片堆叠。
  2. **关键指标网格**：6 个指标卡（核心 SLO/资源使用率），每卡大数字(`--font-mono` tabular) + `ReactECharts` 迷你 sparkline（area，序列色取 `tokens.chart.series[0]`）。
  3. **活跃告警流**：`List`（按严重度排序，可 `ListFilter` 筛选），每条含级别图标 + 资源名(等宽) + 时间(等宽) + 跳转。
  4. **近期部署**：`Timeline`（commit/分支/环境/耗时/状态语义色 + 图标）。
  5. **集群利用率**：3 个 `Progress`（CPU/内存/磁盘，阈值色；`Progress` strokeColor 用 success/warn/danger 映射水位）。
  6. **近期审计**：`Table`（操作者/动作/对象/时间，行点击开右侧 Inspector `Drawer` 下钻）。
- **栅格**：桌面 `Row/Col` 24 栅格——状态磁贴 4×6；指标网格 3×8（或 6×4）；告警流/部署/利用率/审计用 12/12 或 8/8/8 组合。≥768 退 2 列。
- **AntD 组件**：`Statistic` / `Card` / `ReactECharts` / `List` / `Timeline` / `Progress` / `Table` / `Tag` / `Badge` / `Drawer`(Inspector) / `Segmented`(时间范围)。
- **Lucide 图标**：状态磁贴无图标或 `HeartPulse`(健康)/`Bell`(告警)/`Rocket`(部署)/`XCircle`(失败)；指标卡 `Gauge`/`Cpu`/`MemoryStick`/`HardDrive`/`Network`/`Activity`；告警流 `AlertTriangle`/`XCircle`/`CheckCircle2`；部署 `Rocket`/`CheckCircle2`/`XCircle`/`Loader2`；审计 `History`；下钻 `ChevronRight`；刷新 `RefreshCw`。
- **强调色纪律**：首页 `--accent` ≤2 处——典型做法：「时间范围 `Segmented` 的激活项」算 1 处视觉强调；「近期审计行 hover 高亮/激活态」算另 1 处。**状态磁贴的阈值色用语义色，不占 accent 配额**。所有"查看全部"链接用 `--fg-2` 或 `--accent` 二选一，避免超额。
- **双主题**：磁贴/卡片背景 `--surface`；区分用 `--border` + `--surface-2` 悬停；sparkline 在浅色下同样用全饱和序列色。
- **响应式**：≥1280 全网格；≥768 状态磁贴 2×2、指标 2 列、下方区块单列；移动端全单列、磁贴横滑。

---

## 5. 页面：监控告警 `/observability/metrics`

- **路由 / 能力域**：`/observability/metrics` · 监控告警（M1/M2/M3）
- **布局**：
  - **上区**：作用域 + 时间范围 `Segmented`/`RangePicker` + 刷新 `RefreshCw` + 告警规则入口 `SlidersHorizontal` + 通知渠道 `Webhook`。
  - **看板网格**：N 个监控面板（`Card` 包裹 `ReactECharts`），类型含折线(CPU/内存/网络)、柱状(磁盘 IO)、Gauge(饱和度)；面板标题 + 实时值(`--font-mono`) + 阈值线（markLine，warn/danger 色）。
  - **告警规则表**：`Table`（表达式/持续/严重度 `Tag`/通知渠道/状态/操作`MoreHorizontal`→编辑`SquarePen`/启停）。
  - **活跃告警列表**：`List` 或 `Table`（级别图标 + 规则 + 资源 + 持续时长 + 触发时间 + 确认/静默操作）。
- **AntD 组件**：`Card` / `ReactECharts` / `Table` / `Tag` / `Segmented` / `RangePicker` / `Dropdown` / `Switch`(规则启停) / `Drawer`(规则编辑表单) / `Modal`(新建规则 `Plus`)。
- **Lucide 图标**：`Gauge`(页标题)、`SlidersHorizontal`(规则)、`Webhook`(渠道)、`RefreshCw`(刷新)、`ListFilter`(筛选)、`SquarePen`(编辑)、`Plus`(新建)、`Bell`/`AlertTriangle`/`XCircle`(告警级别)、`CheckCircle2`(已确认)、`VolumeX`(静默)、`ChevronRight`(下钻)。
- **强调色纪律**：≤2 处——「新建规则主按钮」+「激活的时间范围 Segmented」；告警严重度一律语义色，不染 accent。
- **双主题 / 阈值着色**：折线/面积用 `tokens.chart.series`；阈值 markLine 用 `--warn`/`--danger`；深色面 grid 线用 `--border-soft`。
- **响应式**：≥1280 看板 2–3 列；≥768 单列堆叠；表格横向可滚（包 `div overflow-x:auto`）。

---

## 6. 页面：日志分析 `/observability/logs`

- **路由 / 能力域**：`/observability/logs` · 日志分析（L1/L2）· **深色优先**
- **布局**（类终端日志流）：
  - **左栏 Field Facet**（桌面 240px，`--surface-2`）：级别(`ListFilter`)、服务/Namespace、Pod、主机 多维 facet 勾选；可折叠。
  - **主区 终端流**：等宽高亮日志流（`--font-mono` tabular），每行 = 时间戳(等宽,`--meta`) + 级别 `Tag`(语义色) + Pod(等宽) + 消息(自动高亮关键字，命中处 `--accent` 下划线或 `--warn` 背景)。自动滚动 + 暂停(`Pause`)/跟随(`ArrowDownToLine`)。级别过滤 `Segmented`(ALL/ERROR/WARN/INFO/DEBUG)。多 Pod 聚合：流内按 Pod 着色前缀（序列色），非 accent。
  - **搜索栏**：顶部 `Input`(prefix `Search`) + 正则开关 + 时间范围 `RangePicker`；回车走 `/logging/search`，实时走 `/logging/tail` WebSocket。
  - **上下文抽屉 `Drawer`**（右侧，Inspector）：选中一行 → 展开前后 N 条上下文（`ScrollText` 图标），关键字高亮保持。
- **AntD 组件**：`Input`(search) / `Segmented` / `RangePicker` / `Tag` / `Drawer` / `Empty`(无结果 `Inbox`) / `Switch`(正则) / `Tooltip`(暂停跟随) / `List`(facet)。
- **Lucide 图标**：`Search`(搜索)、`ScrollText`(上下文/页标题)、`ListFilter`(级别)、`Pause`/`Play`(跟随暂停)、`ArrowDownToLine`(跳最新)、`Copy`(复制行)、`Download`(导出)、`Bell`(ERROR 计数)、`XCircle`/`AlertTriangle`/`Info`/`Bug`(级别)。
- **强调色纪律**：≤2 处——「搜索按钮/激活 Segmented」+「选中行高亮环」；级别 `Tag` 用语义色；关键字高亮用 `--warn` 背景或 `--accent` 细下划线（计 1 处）。深色优先：背景 `--bg`，流区 `--surface`，行 hover `--surface-2`。
- **双主题**：日志页**默认深色**（运维长时盯屏）；浅色下同样可读（消息 `--fg`，级别 Tag 语义色）。
- **响应式**：≥1280 左 facet + 主流；≥768 facet 收为顶部 `Dropdown` 或抽屉，主流单列；移动端 facet 折叠、流单列。

---

## 7. 页面：交付 CI/CD `/delivery/pipelines`

- **路由 / 能力域**：`/delivery/pipelines` · 部署·CI-CD（D1/D2）
- **布局**：
  - **上栏**：环境 `Segmented`/作用域 + 刷新 `RefreshCw` + 主操作「触发部署」`Rocket`(primary) + 过滤 `ListFilter`。
  - **流水线列表 `Table`**：列 = 流水线名/分支(`GitBranch`)/最近版本/环境 `Tag`/状态(语义色+图标)/耗时(等宽)/操作(`MoreHorizontal`→ 日志`ScrollText`/回滚`Undo2`/重启`RotateCw`)。
  - **状态时间线 `Timeline`**（点开某流水线或右侧 Inspector）：步骤节点(拉取→构建→部署→健康检查)，每节点 `Clock`/状态图标 + 耗时 + 日志链接。
  - **一键回滚（危险操作）**：点 `Undo2` → 弹 `Modal.confirm`（危险样式，`okButtonProps danger`），文案具体"确认回滚 {service} 至上一稳定版本 v{x.y.z}？此操作将记审计"，确认后调 `/deployment/pipelines/{id}/rollback` 并写审计；回滚中行状态 `Loader2`(spin)。
- **AntD 组件**：`Table` / `Timeline` / `Tag` / `Modal`(confirm) / `Button`(primary danger) / `Drawer`(Inspector 时间线) / `Segmented` / `Dropdown` / `Tooltip`。
- **Lucide 图标**：`Workflow`(页标题)、`Rocket`(触发)、`Undo2`(回滚)、`RotateCw`(重启)、`ScrollText`(日志)、`GitBranch`(分支)、`RefreshCw`、`ListFilter`、`Clock`(时间线节点)、`CheckCircle2`(成功)/`XCircle`(失败)/`Loader2`(进行中)/`AlertTriangle`(需关注)、`MoreHorizontal`、`ChevronRight`。
- **强调色纪律**：≤2 处——「触发部署主按钮」(`--accent`) + 「激活环境 Segmented」；回滚按钮**用 `--danger` 而非 accent**（危险语义，不占 accent 配额）；状态一律语义色。
- **双主题**：Table 行 hover `--surface-2`；Modal 确认危险用 `--danger` 描边/文字 + `--surface` 背景。
- **响应式**：≥1280 列表 + 右侧 Inspector 时间线；≥768 列表单列，点行开全屏 `Drawer` 时间线；表格横向可滚。

---

## 8. 页面：基础设施 `/infrastructure/clusters`

- **路由 / 能力域**：`/infrastructure/clusters` · 主机与 K8s（H1/H2）· **含 K8s 资源树 + 拓扑 + Pod 表 + 终端**
- **布局**（桌面三栏 / 平板两栏）：
  - **左栏 资源树 `Tree`**（240px，`--surface-2`）：Namespace → Deployment → `Box`(Pod) → `Package`(Container)；节点树 `Cpu`(节点)/`HardDrive`(主机)。选中节点驱动中右区。
  - **中区**：
    - **集群拓扑 Resource Map**：自绘 SVG/Canvas 依赖图（Namespace→Deployment→Pod 节点，边表依赖），节点按健康度着色(success/warn/danger)，点击下钻；非装饰，表达真实依赖。
    - **Pod 表 `Table`**：列 = Pod名(等宽)/命名空间/节点/状态(语义色+`Box`图标)/重启次数(等宽)/年龄(等宽)/操作(`MoreHorizontal`→ 日志`ScrollText`/终端`Terminal`/重启`RotateCw`)。
    - **节点资源压力**：`Progress`(CPU/内存，阈值色) + `HeartPulse` 健康检查。
  - **右区 Inspector `Drawer`**（或常驻 360px）：选中 Pod/节点详情(`Descriptions`) + 快捷操作。
  - **终端弹窗 `Modal`**（xterm）：点 `Terminal` → 全屏或 large `Modal` 内嵌 `@xterm/xterm`，连 `/infrastructure/clusters/{id}/exec` WebSocket；顶栏 `Copy`(复制选择)/`Maximize2`(全屏)/`X`(关闭)。
- **AntD 组件**：`Tree` / `Table` / `Progress` / `Drawer` / `Modal`(终端) / `Descriptions` / `Tag` / `Dropdown` / `Button` / `Tabs`(拓扑/列表视图切换) / `Empty`(`Inbox` 未选集群)。
- **Lucide 图标**：`Boxes`(页标题/集群)、`Server`(集群节点)、`Cpu`(节点)、`HardDrive`(主机)、`Layers`(Namespace)、`Box`(Pod)、`Package`(容器)、`Terminal`(终端)、`ScrollText`(日志)、`RotateCw`(重启)、`HeartPulse`(健康)、`RefreshCw`、`ListFilter`、`ChevronRight`、`Maximize2`、`Copy`、`X`、`Plus`(注册集群)。
- **强调色纪律**：≤2 处——「注册集群主按钮」+「激活 Tabs(拓扑/列表)」；拓扑节点健康用语义色；Pod 状态 `Tag` 用语义色；终端弹窗内光标/连接态可用 `--accent` 但属工具内，不计入页面主视觉配额（页面主区仍守 ≤2）。
- **双主题**：拓扑图背景 `--bg`，节点 `--surface-2` 描边 `--border`，文字 `--fg`；浅色下同构。
- **响应式**：≥1280 三栏(树+中区+Inspector)；≥768 树收为顶部 `Drawer` 或左 64px，中区单列，Inspector 全屏 `Modal`；移动端树/拓扑折叠，Pod 表横滚。

---

## 9. 页面：审计日志 `/management/audit`

- **路由 / 能力域**：`/management/audit` · 底座（F2）
- **布局**：
  - **筛选栏**：操作者 `Select`、动作 `Select`、资源类型 `Select`、时间 `RangePicker`、`Search`(关键字/对象) + `Download`(导出 CSV) + `RefreshCw`。
  - **审计表 `Table`**（高密度，等宽数字）：列 = 时间(等宽,`--meta`)/操作者(等宽 id+`User`)/模拟身份(impersonated_as,`UserCog`)/动作 `Tag`/对象(等宽)/结果(success/danger 图标)/详情下钻`ChevronRight`。分页(server)。
  - **详情 `Drawer`**(Inspector)：完整前后值(JSON，`--font-mono` 高亮 diff)、IP、UA。
- **AntD 组件**：`Table` / `Select` / `RangePicker` / `Input`(search) / `Button`(`Download`) / `Drawer` / `Tag` / `Pagination` / `Empty`(`Inbox`)。
- **Lucide 图标**：`History`(页标题)、`Search`、`Download`(导出)、`RefreshCw`、`User`(操作者)、`UserCog`(模拟身份)、`ChevronRight`(详情)、`CheckCircle2`(成功)/`XCircle`(失败)/`AlertTriangle`(警告)、`Filter`(筛选)、`Inbox`(空)。
- **强调色纪律**：≤2 处——「导出按钮」(可 `--accent` 或 `--fg-2`，若用 accent 则为本页 1 处) + 「激活筛选 Segmented/选中行高亮」；结果列用语义色，不染 accent。
- **双主题**：表头 `--surface-2`、行 hover `--surface-2`、等宽数字贯穿。
- **响应式**：≥1280 全列；≥768 隐藏次要列(模拟身份/IP)，`ScrollText` 详情走 `Drawer`；表格横向可滚。

---

## 10. 页面：权限 / 访问 `/management/access`

- **路由 / 能力域**：`/management/access` · 底座（F1 RBAC）
- **布局**：
  - **左：角色 `List`/`Tabs`**：超管/运维/SRE/开发/只读（`ShieldCheck`/`KeyRound`），选中显示权限矩阵。
  - **中：权限矩阵 `Table`**：行=能力域(监控/日志/交付/基础设施/管理)，列=查看/操作/管理 权限 `Tag`(允许=success/拒绝=meta 灰)；当前角色不可改的项 show 锁 `Lock` + tooltip"需要 X 权限"。
  - **右：成员分配 `Table`/`Transfer`**：成员列表(等宽 id + `User`)，分配角色 `Select`；越权操作(如 viewer 改规则)经后端 403 + 记审计(见 AC-03)，前端对无权限按钮**显示原因**(tooltip"需运维权限，联系管理员")而非静默置灰。
  - **分配操作 `Modal`**：`POST /rbac/assign`，危险/敏感操作记审计。
- **AntD 组件**：`Tabs` / `Table` / `Tag` / `Select` / `Transfer` / `Modal` / `Tooltip` / `Button` / `Empty`。
- **Lucide 图标**：`KeyRound`(页标题)、`ShieldCheck`(角色)、`User`(成员)、`Lock`(无权限)、`CheckCircle2`(允许)/`XCircle`(拒绝)/`AlertTriangle`(需关注)、`Plus`(添加成员)、`ChevronRight`、`Search`、`MoreHorizontal`。
- **强调色纪律**：≤2 处——「保存分配主按钮」+「激活角色 Tabs」；权限允许/拒绝用 success/meta，不染 accent。
- **双主题**：矩阵行 hover `--surface-2`；锁图标 `--muted`。
- **响应式**：≥1280 三栏；≥768 角色 Tabs 顶部、成员分配单列、`Drawer` 看权限矩阵；移动端矩阵折叠为列表。

---

## 11. 页面：设置 `/settings`

- **路由 / 能力域**：`/settings` · 跨域配置（主题/通知/集群注册/个人资料）
- **布局**（`Tabs` 分区，左侧 `Menu` 子导航 + 右侧表单）：
  - **外观**：主题 `Radio`(跟随系统/深色/浅色) + 预览；主题切换即时生效并持久化（用 `Sun`/`Moon` 图标 Radio）。
  - **通知渠道**：`Table`/`List` 渠道(邮件/Webhook/企微·钉钉·飞书) + 新建 `Modal`(`Webhook`/`Plus`)，配置 `SlidersHorizontal` 路由。
  - **集群注册**：已注册集群 `Table`(`Boxes`) + 注册 `Modal`(`Plus`) → `POST /infrastructure/clusters`（绑定 SA + impersonation，admin+）。
  - **个人资料**：显示名/邮箱(`User`/`Mail`)，密码修改(`Lock`)。
- **AntD 组件**：`Tabs` / `Menu`(子导航) / `Form` / `Radio` / `Switch` / `Table` / `Modal` / `Button`(primary) / `Input` / `Empty`。
- **Lucide 图标**：`Settings`(页标题)、`Sun`/`Moon`(外观)、`Webhook`(通知渠道)、`SlidersHorizontal`(路由配置)、`Boxes`(集群)、`Plus`(注册/新建)、`User`/`Mail`(资料)、`Lock`(密码)、`Save`(`Check`)、`ChevronRight`、`Trash2`(删除渠道,危险确认)。
- **强调色纪律**：≤2 处——「保存/注册主按钮」(每 Tab 各自 1 处，但同屏只显示一个 Tab 故合规) + 「激活子导航 Menu 项」；开关/Radio 激活可用 `--accent` 描边（计为激活态，属配额内）。
- **双主题**：设置页本身是双主题切换的"控制面"，务必双向可预览；浅色下 `--elev-raised` 轻阴影生效。
- **响应式**：≥1280 左子导航 + 右表单；≥768 子导航收顶部 `Tabs`；移动端表单单列、输入框全宽。

---

## 12. P0 合规自检（颜好看自审）

| # | 红线 | 结论 | 证据 |
|---|---|---|---|
| 1 | 禁止 emoji 作功能图标 | 通过 | 全文档图标均来自 §2 Lucide 映射总表（lucide-react 0.439.0）；零 emoji；CI grep `[\x{1F300}-\x{1FAFF}]` 预期无命中 |
| 2 | 禁止紫→粉渐变主视觉 | 通过 | 强调色为单一 `--accent`(#1C8FE6/#1577C2)，无渐变；紫 `#A371F7` 仅列于 `tokens.chart.series` 作数据序列色（§0.2/§2.3），非主视觉；无 Indigo→Pink 渐变+发光+毛玻璃三位一体 |
| 3 | 禁止空洞占位文案 | 通过 | 无 "Welcome to"/"Lorem ipsum"；首页无 Hero；文案具体（"回滚至 v{x.y.z}"、"邮箱或密码错误，请重试"、"统一 RBAC 权限"） |
| 4 | 禁止硬编码颜色 | 通过 | §0.2 铁律：颜色一律走 `design-tokens.json` 变量；仅 `#fff`/`#000` 例外且本产品刻意不用纯黑白 |
| 5 | 禁止千篇一律 Hero 大图 | 通过 | 运维首页(§4)首屏即状态磁贴/指标网格/告警流/部署/利用率/审计真实数据；登录页左侧为克制能力点列表非营销大图 |
| 6 | 禁止 AI 模板味 | 通过 | 禁用弹跳缓动 `cubic-bezier(0.68,-0.55,0.265,1.55)`（§0.7 指定 `cubic-bezier(0.2,0,0,1)`）；无侧条纹边框/渐变文字/幽灵卡片(§0.6)；文案业务语义化；图标库统一 Lucide 非默认靛蓝 |

**附加一致性核对**
- 侧栏 5 顶级导航图标与任务指定一致：`LayoutDashboard`/`Activity`/`Rocket`/`Server`/`ShieldCheck` - 每屏 `--accent` ≤2 处纪律在 9 页面均显式声明 - 双主题 `data-theme` 切换 + 持久化在 Shell/设置/首页均覆盖 - 响应式 ≥1280 桌面优先、≥768 平板可用，每页均给断点行为 - 危险操作（回滚/重启/删除/提权）均要求确认 Modal + 记审计（§7/§8/§10/§11）
---

> 交付物：`page-design-prompts.md`（本文件，工作区根目录）。前端照此实现 9 页面 + App Shell；图标严格按 §2 映射总表取，禁止混库/emoji；颜色严格走 Token。
