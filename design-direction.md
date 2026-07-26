# 统一运维控制台 · 设计方向文档（Design Direction）

> 适用：企业多团队统一 Web 运维控制台 MVP（账号体系 / 权限分级 / 审计日志 + 监控告警 / 日志分析 / 部署·CI-CD / 主机与 K8s 管理）
> 知识库说明：本地 `references/design-systems/` 与 `references/industries/` 在本会话未挂载，本文基于内置四层 Token 标准 + 行业联网调研产出。

---

## 0. 设计寄存器（Register）判定

**Product Register（设计服务产品）—— 非 Brand Register。**
本产品是工具型控制台，设计服务于"看数据、排障、操作"的效率，不是品牌表达。因此：

- 色彩克制：中性色打底 + 单一强调色作"标点"，着色面积 ≤10%
- 字体以无衬线工作字体为主，等宽字体承载数据
- 动效纯功能导向（150–200ms 收敛值），无装饰性动画
- 图片策略：以数据可视化 / 图标 / 拓扑图替代照片；首屏即真实产品内容

**三轴设计刻度（建议默认，可由产品负责人覆盖）：**
| 参数 | 取值 | 含义 |
|------|------|------|
| `DESIGN_VARIANCE` | 4 | 干净网格、轻微偏移，不 chaotic；避免居中 Hero |
| `MOTION_INTENSITY` | 4 | 仅 hover/active/focus 与必要的状态过渡 |
| `VISUAL_DENSITY` | 7 | 驾驶舱模式：紧凑 padding + 1px 分隔线 + 等宽数字，但分组清晰 |

---

## 1. 对标品牌与借鉴 / 拒绝清单

调研对象（6 个，超出最低 3 个要求）：Grafana、Vercel(Geist)、Linear、Datadog、Cloudflare Dashboard、Lens(K8s IDE)。

| 产品 | 我们借鉴 | 我们拒绝 |
|------|----------|----------|
| **Grafana** | 深色原生画布；阈值着色（冷→暖表达健康度）；语义化图表调色板；monospace 标签；"Don't get in the way of the data" 哲学；状态用线宽/对比而非颜色堆砌 | 随机默认配色造成视觉噪音；面板按钮过多 |
| **Vercel / Geist** | 极致克制；单一蓝强调色作标点；tabular 等宽数字贯穿表格/日志/指标；深色为规范面；命令面板(⌘K) 范式；Geist 字体 | 消费级营销腔；整页照搬会被认成 "Vercel clone" |
| **Linear** | 暗色原生；超薄半透明白边框建立层级（不靠阴影）；表面阶梯(surface ladder)表达 elevation；Inter/Geist 负字距大标题；单一靛紫强调色仅用于 CTA/激活态 | 纯 #000 黑；第二强调色；发光卡片 |
| **Datadog** | 自定义仪表盘；跨组件联动(cross-widget interaction)；深色模式 Viridis/Plasma 调色板；导航重设计（侧栏可访问性、收藏） | 白底 + 企业紫的"营销 SaaS"感 |
| **Cloudflare** | 深色用"亮度反转"而非简单反色（保留色相/饱和度）；off-black `#1D1D1D` 而非纯黑（更不刺眼）；导航图标"描边 vs 填充"区分激活态；WCAG AA 全状态审计 | 纯黑背景的刺眼感 |
| **Lens** | 统一仪表盘聚合多集群；资源拓扑图(Resource Map)表达依赖；RBAC 可视化；底部 Dock（终端/日志/编辑器）；多集群一键切换 | 桌面应用局限（我们要 Web 化） |

**核心结论：** 走 **"紧凑型专业控制台"** 路线 —— 深色原生 + 单一克制强调色 + 表面阶梯 + 等宽数字 + 命令面板快速路径，借鉴 Grafana 的工程密度与 Linear/Vercel 的精致克制。

---

## 2. 配色基调

### 2.1 策略
- **深色为规范面（canonical）**：运维人员长时间盯屏，深色降低眼疲劳，且契合 Grafana/Linear/Vercel 的行业默认。
- **浅色为同等一等公民的可选面**：企业客户常要求浅色（Cloudflare/Grafana 均双主题）。**单一 Token 集合 + 双主题切换**，而非两套独立调色板。
- 通过 `data-theme="dark|light"` 或 class 切换；初始跟随 `prefers-color-scheme`，用户可在个人资料持久化。
- **绝不使用纯 #000 / 纯 #fff**（off-black / off-white 更护眼、更专业）。

### 2.2 强调色决策（关键 · 反 AI 模板）
为避开 "默认 Tailwind 靛蓝 #6366F1" 的 AI 味（P1 反模式）与 "紫→粉渐变"（P0 红线），**推荐单一信号蓝**：

- **主推：`Signal Cerulean #1C8FE6`**（清亮、略偏青的 azure，区别于 indigo 与 blue-500，读作" operational signal / 可信"）
  - hover `#3AA0F0` · active `#1577C2` · on `#FFFFFF` · ring `rgba(28,143,230,0.4)`
- **备选 A（更偏"终端/活力"）：`Signal Teal #0FB8A8`**（青绿，在 6 个对标中更独特；Grafana 的 chart-teal 是数据色非品牌色，故不冲突）
- **备选 B（最稳企业信任）：`Azure #2563EB` 的微调版 `#2F6FED`**（略去紫味）

> 注意：强调色使用纪律：**每屏 ≤2 处可见使用**，仅作 CTA / 激活态 / 焦点环 / 关键链接；不用于装饰、不做渐变、不与粉形成渐变。Indigo `#6366F1`、Slate Blue `#4F46E5` 作为纯色允许，但**不作为品牌主色**（避免 AI 默认感）。

### 2.3 语义色（状态，非装饰）
| 语义 | 深色值 | 浅色值 | 用途 |
|------|--------|--------|------|
| 成功 success | `#2EA043` | `#1A7F37` | 健康/成功部署/在线 |
| 警告 warn | `#E8A33D` | `#B7791F` | 阈值逼近/需注意 |
| 危险 danger | `#F85149` | `#D23F3F` | 告警/失败/离线 |
| 信息 info | 折叠进 accent | 折叠进 accent | 保持调色板紧凑，info 用强调蓝 |

### 2.4 图表分类调色板（多序列，全饱和度，双主题一致）
用于折线/柱状/拓扑多系列，**与品牌强调色区分**（这是数据色，非主视觉）：
`#58A6FF`(蓝) `#2DD4BF`(青) `#E8A33D`(琥珀) `#F85149`(红) `#A371F7`(紫·仅数据序列) `#3FB950`(绿) `#DB61F2`(品红) `#D2A8FF`(淡紫)
> 说明：紫 `#A371F7` 在此**仅作为数据序列色**（Grafana 同法），与 P0 禁止的"紫→粉渐变主视觉"无关 —— 红线禁止的是 Indigo→Pink 的**主视觉渐变 + 发光边框 + 毛玻璃三位一体**，并非禁用紫色作为中性数据色。

### 2.5 中性色阶梯（深色规范面）
`--bg #0B0E14`(近黑·冷调) → `--surface #121620` → `--surface-2 #1A1F2B` → `--surface-3 #232A38`(hover/raised)
文字：`--fg #E6E9EF` → `--fg-2 #B4BACD` → `--muted #7A8294` → `--meta #565E6E`
边框：`--border rgba(255,255,255,0.08)` → `--border-soft 0.05` → `--border-strong 0.12`
> 深色下 elevation 用**表面阶梯 + 发丝边框**表达，不用大阴影（Linear 法则）。

---

## 3. 字体栈

- **UI / 标题（display+body 同一家族）：** `"Geist", "Inter", "Noto Sans SC", system-ui, sans-serif`
  - 选 **Geist**（Vercel 开源，dev-tool 原生，区别于 Inter 单体文化，同等易读）；Inter 作回退；**Noto Sans SC** 承载中文标签（团队为中文环境，企业控制台必有中文）。
- **等宽（数据 / 数字 / 日志 / 标签）：** `"Geist Mono", "JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, monospace`
  - 表格、指标、日志流、时间戳、资源名一律等宽 + tabular 数字，呈现"工程级"质感（Geist/Vercel 关键决策）。
- **字重系统：** 400(正文/Read) · 500(强调/Emphasize) · 600(标题/Announce)。（注：Linear 的 510 为其定制字重，Geist 用 500 映射。）
- **字距规则：** 正文 `0`；ALL CAPS 小标签 `0.06em`；大标题(≥24px) `-0.01em ~ -0.02em`。
- **字号层级（8 级，控制台基准 14px）：** 12 / 13 / 14 / 16 / 18 / 20 / 24 / 32。
- **行高：** 正文 1.5，标题 1.2。

> 字体决策遵循"非单体文化"原则：避免把 Inter 当作"高级展示字体"；Geist 更贴合开发者工具定位，且不在反射拒绝清单内。

---

## 4. 图标系统推荐（P0：禁 emoji，必须统一描边 SVG）

**推荐：Lucide**（MIT，24×24 视口，1.5–2px 描边，currentColor 着色，覆盖监控/日志/部署/K8s 等基础设施语义，tree-shakeable，契合 Linear/Vercel 的细描边工程美学）。

- **尺寸规范：** 行内 `16px` · 按钮内 `20px` · 独立图标 `24px`
- **描边：** 1.5–2px（深色面建议 1.75px 保清晰），`stroke="currentColor"`
- **备选：** Tabler Icons（图标更全，若需更偏门的运维/云厂商图标时补充）

> 注意：图标库须由**架构师在 Spec 中锁定一套**，全项目统一不混用。本文推荐 Lucide，最终以 Spec 为准。任何 emoji（如火箭、火焰、闪电等符号）一律禁止作为功能图标。

---

## 5. 浅色 / 深色主题策略

- **双主题一等公民**，同一套语义 Token（`--bg/--surface/--fg/--muted/--border/--accent/...`），仅值随 `data-theme` 切换。
- 初始：跟随系统 `prefers-color-scheme`；用户可在「个人资料 → 外观」持久化覆盖。
- 深色：表面阶梯 + 发丝边框表达层级；浅色：发丝边框 + 极轻阴影（`0 1px 2px rgba(0,0,0,0.06)`）。
- 全组件状态（default/hover/focus/active/disabled）双主题均须达 WCAG AA（对比度 ≥4.5:1，大字 ≥3:1）。
- 图表调色板双主题保持全饱和度一致（Grafana 法则）。

---

## 6. 风格方向

**"紧凑型专业控制台（Compact Mission-Control Console）"**
- 信息密度高但层级清晰：概览优先 → 下钻；分组用 section 标题 + 留白，组内用 1px 分隔线，不用装饰卡片堆叠。
- 数据即主角：首屏展示真实指标/告警/部署/拓扑，无营销大图、无占位文案。
- 表面阶梯 + 发丝边框建立深度（拒绝阴影滥用与毛玻璃）。
- 强调色作标点；语义色只表达状态。
- 等宽数字贯穿数据区；对齐到 4px 网格。
- 动效：150ms(fast) / 200ms(base)，缓动 `cubic-bezier(0.2,0,0,1)`；**禁用弹跳缓动 `cubic-bezier(0.68,-0.55,0.265,1.55)`**；支持 `prefers-reduced-motion`。

---

## 7. 首屏与核心页面布局方向

### 7.1 应用外壳（App Shell）
```
┌──────────┬───────────────────────────────────────────────┐
│          │  顶栏: [⌘K 全局搜索] [团队/集群/环境 作用域选择器] │
│  侧边栏   │        [告警铃+计数] [主题] [用户/团队菜单]      │
│ (图标+文字 │───────────────────────────────────────────────│
│  可折叠    │  面包屑 / 页标题 + 上下文筛选&操作栏            │
│  64px↔     │───────────────────────────────────────────────│
│  240px)    │                                               │
│          │   主内容区（真实数据：指标/日志/拓扑/表格）       │
│  · 运维首页 │                                               │
│  · 监控告警 │                              （可选右侧 Inspector │
│  · 日志分析 │                               面板，类似 Linear  │
│  · 交付CI/CD│                               侧栏 / Lens Dock） │
│  · 基础设施 │                                               │
│  · 管理     │                                               │
│   (审计/权限 │                                               │
│   /设置)    │                                               │
└──────────┴───────────────────────────────────────────────┘
```

### 7.2 默认首屏 = 「运维首页 / Operations Home」（展示真实数据，非 Hero）
高密度但分组清晰：
1. **状态条（Status Strip）**：集群健康、活跃告警数、今日部署数、失败流水线数（stat 磁贴 + 阈值着色）
2. **关键服务指标网格**：核心 SLO/资源使用率（大数字 + sparkline + 阈值色）
3. **活跃告警流**（按严重度排序，可筛选）
4. **近期部署 / CI-CD 状态**（部署卡：commit/分支/环境/耗时/状态）
5. **集群资源利用率**（CPU/内存/磁盘，小图表）
6. **近期审计事件**（谁/什么/何时，可下钻）

### 7.3 四大能力域导航（认知负荷关键，见 Risk #2）
- 顶栏常驻**作用域选择器**（团队 / 集群 / 环境），让"当前我在操作哪个范围"始终显式。
- 侧栏一级 ≤5 项（认知负荷规则：导航 ≤5 顶级项）：
  1. 运维首页
  2. 可观测（监控告警 + 日志分析 合并）
  3. 交付（CI/CD 部署）
  4. 基础设施（主机 + K8s）
  5. 管理（审计日志 + 权限 + 设置）
- **命令面板 ⌘K** 作为跨域快速路径（Vercel 范式）：搜资源、跳页面、执行操作。

### 7.4 核心页面要点
- **监控告警**：仪表盘网格 + 阈值着色；告警列表支持严重度/状态/时间筛选；详情抽屉下钻。
- **日志分析**：类终端日志流（等宽、自动滚动、关键词高亮、级别过滤、多 Pod 聚合）；左侧字段 facet 过滤。
- **交付 CI/CD**：部署列表/流水线视图（状态用语义色 + 图标，不用 emoji）；Pipeline 步骤时间线；一键回滚（危险操作需确认 + 记审计）。
- **主机与 K8s**：资源树（Namespace→Deployment→Pod→Container）+ **集群拓扑图(Resource Map)** 表达依赖；节点资源压力颜色编码；内嵌终端/日志 Dock（借鉴 Lens）。
- **审计日志**：可搜索/可筛选表格（操作者 / 动作 / 资源 / 前后值 / 时间）；分页 + 导出；与权限联动。

---

## 8. 设计 Token 草案（四层架构，供架构师锁入 Spec）

### 深色主题（canonical）
```css
:root[data-theme="dark"] {
  /* A1-identity */
  --bg: #0B0E14; --surface: #121620; --surface-2: #1A1F2B; --surface-3: #232A38;
  --fg: #E6E9EF; --fg-2: #B4BACD; --muted: #7A8294; --meta: #565E6E;
  --accent: #1C8FE6; --border: rgba(255,255,255,0.08);
  --font-display: "Geist","Inter","Noto Sans SC",system-ui,sans-serif;
  --font-body: "Geist","Inter","Noto Sans SC",system-ui,sans-serif;

  /* B-slot */
  --surface-warm: #1A1F2B; --fg-2b: #B4BACD; --meta-2: #565E6E;
  --border-soft: rgba(255,255,255,0.05); --border-strong: rgba(255,255,255,0.12);

  /* A2 */
  --accent-on: #FFFFFF; --accent-hover: #3AA0F0; --accent-active: #1577C2;
  --accent-ring: rgba(28,143,230,0.4);
  --success: #2EA043; --warn: #E8A33D; --danger: #F85149;
  --font-mono: "Geist Mono","JetBrains Mono",ui-monospace,"SFMono-Regular",Menlo,monospace;

  /* Elevation (surface ladder, not shadows) */
  --elev-flat: none; --elev-ring: 0 0 0 1px var(--border);
  --elev-raised: 0 0 0 1px var(--border-strong);

  /* Focus & Motion */
  --focus-ring: 0 0 0 3px var(--accent-ring);
  --motion-fast: 150ms; --motion-base: 200ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
}
```

### 浅色主题（alternate）
```css
:root[data-theme="light"] {
  --bg: #F7F8FA; --surface: #FFFFFF; --surface-2: #F1F3F7; --surface-3: #E8EBF1;
  --fg: #1A1F2B; --fg-2: #3D4456; --muted: #6B7385; --meta: #98A0B0;
  --accent: #1577C2; --border: rgba(0,0,0,0.10);
  --border-soft: rgba(0,0,0,0.06); --border-strong: rgba(0,0,0,0.16);
  --accent-on: #FFFFFF; --accent-hover: #1C8FE6; --accent-active: #0F5FA0;
  --accent-ring: rgba(21,119,194,0.35);
  --success: #1A7F37; --warn: #B7791F; --danger: #D23F3F;
  --elev-flat: none; --elev-ring: 0 0 0 1px var(--border);
  --elev-raised: 0 1px 2px rgba(0,0,0,0.06), 0 0 0 1px var(--border);
  --focus-ring: 0 0 0 3px var(--accent-ring);
  --motion-fast: 150ms; --motion-base: 200ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
}
```

### 共享比例
- 字号：12/13/14/16/18/20/24/32 · 间距(4px 网格)：4/8/12/16/20/24/32/40/48/64 · 圆角：6/8/12/9999 · 阴影：仅浅色轻阴影
- **圆角上限 12px**（避开 AI 过度圆滑的 ≥24px）；卡片用 1px 边框 + 轻圆角，禁用"幽灵卡片"(1px 边框 + ≥16px 模糊阴影同现)。

---

## 9. 关键 UX 风险与缓解（3 项）

### Risk #1 · 高密度信息下的视觉层级崩塌
- **问题**：监控 + 日志 + 拓扑同时高密度呈现时，凌晨 3 点故障场景下用户找不到信号；颜色若作装饰会制造"迪厅灯效"式噪音。
- **缓解**：
  - 颜色仅表达**状态语义**（成功/警告/危险/信息），绝不作装饰；阈值着色（冷→暖映射健康度）。
  - 概览优先 → 下钻；分组用 section + 留白，组内 1px 分隔线。
  - 数据墨水比（Tufte）：去掉 chartjunk；重要指标用线宽(2px)/对比而非颜色堆砌。
  - 等宽 tabular 数字对齐；状态用图标 + 文字双编码（不只靠颜色，满足无障碍）。

### Risk #2 · 四域 + 多团队/多集群的作用域导航过载
- **问题**：四大能力域 + 企业多团队/多集群，侧栏顶级项易超 5，导致"点哪里"认知过载与迷失。
- **缓解**：
  - 一级导航收敛到 ≤5（运维首页 / 可观测 / 交付 / 基础设施 / 管理）。
  - 顶栏常驻**作用域选择器**（团队·集群·环境），当前操作范围始终显式，避免"我在哪"混淆。
  - **命令面板 ⌘K** 作为跨域快速路径（搜/跳/执行）。
  - 每页面包屑 + 标题显式当前位置；深层下钻用右侧 Inspector 抽屉而非整页跳转。

### Risk #3 · 权限分级与审计可见性造成"隐藏状态"困惑
- **问题**：RBAC 下部分用户看到禁用操作却无解释；审计日志若只是不可查的追加列表则无价值；越权/误操作的代价高。
- **缓解**：
  - 禁用操作**显示原因**（如"需要 X 权限，联系管理员"），而非静默置灰。
  - 审计日志**可搜索/可筛选**（操作者/动作/资源/前后值/时间）+ 分页导出，与权限联动。
  - 顶栏/侧栏显式"当前作用域"，危险操作（删除/回滚/提权）**二次确认 + 必记审计**。
  - 权限差异用 UI 状态可见化（如 Lens 的 RBAC 可视化），而非后台静默拒绝。

---

## 10. P0 合规自检

- [x] **无 emoji 功能图标**：统一 SVG（推荐 Lucide），16/20/24px 规范，currentColor 描边
- [x] **无紫→粉渐变主视觉**：强调色为单一信号蓝 `#1C8FE6`（紫仅作数据序列色，非主视觉渐变）
- [x] **无空洞占位文案**：首屏即真实运维数据；无 "Welcome to" / "Lorem ipsum"
- [x] **无硬编码颜色**：全部经 Design Token 引用（仅 `#fff`/`#000` 例外，且本文刻意避免纯黑白）
- [x] **无千篇一律 Hero 大图**：控制台首屏为真实指标/告警/部署/拓扑
- [x] **无 AI 模板味**：禁用弹跳缓动；文案具体（如"回滚到 v1.4.2"而非"Get started"）

---

## 11. 给架构师 / 前端的下一步
1. 在 **Spec 锁定**：图标库（建议 Lucide）、强调色最终值（建议 `#1C8FE6`）、字体加载方式（Geist + Noto Sans SC via CDN/self-host）。
2. 落地 `design-tokens.json`（机器可读，供前端 import）+ Token CSS（见 §8）。
3. 先实现 App Shell + 运维首页 + 监控告警列表 三个纵向切片，验证密度/层级/导航假设。
4. 无障碍审计（对比度/键盘/focus ring/ARIA）在设计后专项做，不在设计时掺杂。
