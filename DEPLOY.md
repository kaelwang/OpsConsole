# OpsConsole 部署指南（小白版）

> 目标读者：第一次部署这个系统、不熟悉 Go / Docker 的同学。
> 读完这份文档，你不需要理解代码，只要**照着步骤复制命令执行**就能跑起来。

---

## 一、这个系统是什么？

OpsConsole 是一个「统一运维控制台」，打开浏览器就能用，里面包含：

- 监控（看指标 / 告警）
- 日志（全文检索 / 实时追踪）
- CI/CD（流水线触发 / 回滚）
- 基础设施（集群 / 主机 / Pod 查看）

**部署完成后，用浏览器打开一个网址就能登录使用。**

---

## 二、先搞懂部署思路（心里有数）

整个系统由两部分组成：

| 部分 | 是什么 | 怎么来 |
|------|--------|--------|
| **后端服务（单二进制）** | 一个程序文件，已经把前端网页打包进去了，启动它浏览器就能访问 | 项目里已自带编译好的，或自己用 `make` 编译 |
| **依赖服务** | 数据库 PostgreSQL、缓存 Redis，以及可选的 VictoriaMetrics、OpenSearch 等 | 用 Docker 一键拉起 |

**最简部署 = 用 Docker 把依赖拉起来 + 运行那个单二进制后端服务。**

> 提示：依赖里**只有 PostgreSQL 和 Redis 是必须的**。VictoriaMetrics / OpenSearch / 告警等是「可选增强」——不配也能跑，只是对应页面暂时没数据（接口会返回 502，属正常现象）。

---

## 三、准备环境

需要一台 **Linux 服务器**（Ubuntu 20.04 / 22.04 / 24.04 都可以），能联网。

### 1. 安装 Docker 和 Docker Compose

复制下面整段执行（Ubuntu 适用）：

```bash
# 一条命令安装 Docker（含 compose 插件）
curl -fsSL https://get.docker.com | sudo sh

# 验证安装成功（看到版本号就 OK）
docker --version
docker compose version
```

> 如果你用 CentOS / 其他系统，或上面命令失败，去 https://docs.docker.com/install/ 按官方文档装即可。

### 2.（可选）安装 Go —— 只有「自己编译后端」时才需要

如果你直接用我**已经编译好的程序**，可以跳过这步。只有在程序在你的机器架构上跑不起来时，才需要装 Go 1.22+ 自己编译：

```bash
# Ubuntu 示例（用官方二进制最稳）
wget https://go.dev/dl/go1.22.12.linux-amd64.tar.gz
sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf go1.22.12.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc && source ~/.bashrc
go version   # 看到 go1.22.x 即成功
```

---

## 四、部署步骤（核心）

### 步骤 1：把项目放到服务器上

如果你在本地开发，用 `scp` 或 `git` 把 `OpsConsole` 整个文件夹传到服务器任意目录，例如 `/home/你的用户名/workspace/OpsConsole`。

进入项目根目录（**必须是有 `docker-compose.yml` 的那个目录**）：

```bash
cd /home/你的用户名/workspace/OpsConsole
pwd        # 确认能看到 docker-compose.yml
ls docker-compose.yml
```

> 如果你是用 git 下载的，直接 `git clone <仓库地址>` 然后 `cd OpsConsole` 即可。

---

### 步骤 2：启动依赖服务（数据库等）

在**项目根目录**执行：

```bash
docker compose up -d
```

- `-d` 表示后台运行。首次会去下载镜像，可能要等几分钟（看网速）。
- 执行完后，用下面命令看状态：

```bash
docker compose ps
```

看到 `pg`、`redis`、`victoriametrics` 等都是 `running`（或 `healthy`）就说明成功了。

这些依赖占用的端口（一般不用管，记一下就行）：

| 服务 | 端口 | 说明 |
|------|------|------|
| PostgreSQL | 5432 | 主数据库（必须） |
| Redis | 6379 | 会话/缓存（必须） |
| VictoriaMetrics | 8428 | 时序指标（可选） |
| OpenSearch | 9200 | 日志检索（可选） |
| 其他 | 9100/9093/8081 | 监控告警相关（可选） |

---

### 步骤 3：准备后端程序（二选一）

#### 办法 A：用项目里现成的（推荐，最简单）

项目里已经有一个编译好的程序：

```bash
ls -l bin/opsconsole-server-linux-amd64
```

只要你的服务器是 **Linux + amd64 架构**（绝大多数云服务器都是），直接用它就行，跳到步骤 4。

#### 办法 B：自己编译（现成程序跑不起来时用）

需要装了 Go（见第三节第 2 步），在项目根目录执行：

```bash
make linux-amd
```

编译完成后会生成 `bin/opsconsole-server-linux-amd64`。

---

### 步骤 4：配置并启动后端服务

后端程序需要知道「数据库在哪里」，通过一个环境变量告诉它。在**项目根目录**执行下面这一整段：

```bash
# 设置数据库连接（这是必须的）
export OPS_DATABASE_URL="postgres://postgres:postgres_dev@localhost:5432/opsconsole?sslmode=disable"

# （可选）设置一个自己的登录密钥，生产环境务必改掉下面这个值
export OPS_JWT_SECRET="请你自己随便写一串字符"

# 启动后端服务
./bin/opsconsole-server-linux-amd64
```

如果看到类似 `listening on :8080` 或没有报错、光标停住（在运行中），就说明启动成功了。

> **各环境变量说明（看不懂可跳过）：**
> | 变量 | 是否必须 | 默认值 / 说明 |
> |------|----------|---------------|
> | `OPS_DATABASE_URL` | **必须** | 连 PostgreSQL 的地址，上面已给 |
> | `OPS_JWT_SECRET` | 可选 | 登录令牌密钥，不填有默认值（不安全，仅开发用） |
> | `OPS_REDIS_URL` | 可选 | 默认 `redis://localhost:6379/0` |
> | `OPS_PORT` | 可选 | 服务端口，默认 `8080` |
> | `OPS_VICTORIAMETRICS_URL` | 可选 | 配了监控才有数据 |
> | `OPS_OPENSEARCH_URL` | 可选 | 配了日志才有数据 |
> | `OPS_VMALERT_URL` | 可选 | 配了告警面板才有数据（默认 `http://localhost:8081`） |
> | `OPS_ALERTMANAGER_URL` | 可选 | 配了才能让告警真正发出去（默认 `http://localhost:9093`，见 §8.7） |
> | `OPS_ALERTMANAGER_CONFIG` | 可选 | 生成的 alertmanager.yml 路径（默认 `./deploy/generated/alertmanager.yml`，相对 backend/ 目录） |
> | `OPS_VMALERT_RULES` | 可选 | 生成的 vmalert 规则文件路径（默认 `./deploy/generated/vmalert-rules.yml`，相对 backend/ 目录） |

---

### 步骤 5：打开浏览器访问

在你能上网的电脑上，打开浏览器，访问：

```
http://服务器IP:8080
```

> 如果服务器有防火墙 / 云厂商安全组，记得**放行 8080 端口**。

默认账号（数据库首次启动会自动创建）：

| 角色 | 邮箱 | 密码 |
|------|------|------|
| 管理员（owner） | `admin@corp.com` | `opsconsole123` |
| 只读（viewer） | `viewer@corp.com` | `opsconsole123` |

登录后就能看到控制台首页了。🎉

---

## 五、常用操作

| 想做的事 | 怎么做 |
|----------|--------|
| **停止后端服务** | 在运行后端那个终端按 `Ctrl + C`；或另开终端 `pkill -f opsconsole-server` |
| **停止所有依赖** | 在项目根目录执行 `docker compose down`（数据会保留） |
| **彻底清空数据重来** | `docker compose down -v`（⚠️ 会删掉数据库里的所有数据） |
| **看后端日志** | 后端是在前台运行的，日志直接显示在终端；或 `journalctl` / 重定向到文件 |
| **看依赖日志** | `docker compose logs -f pg`（把 `pg` 换成别的服务名） |
| **重启后端** | 重新执行步骤 4 的最后一行启动命令即可 |

---

## 六、常见问题（排错）

**Q1：浏览器打不开页面 / 连不上？**
- 确认后端程序还在运行（终端没退出、没报错）。
- 确认服务器防火墙 / 安全组放行了 `8080` 端口。
- 如果是云服务器，浏览器里填的是**服务器的公网 IP**，不是 `localhost`。

**Q2：能打开页面但登录报错，或很多接口返回 502？**
- 最常见原因：PostgreSQL 还没启动好，或 `OPS_DATABASE_URL` 写错了。
- 排错：`docker compose ps` 看 `pg` 状态是不是 `healthy`；确认步骤 4 的 `export` 命令确实执行了。
- 监控 / 日志页面没数据是正常的——那些依赖是可选的，没配对应地址就会 502。

**Q3：后端一启动就自动退出了？**
- 大概率是**没设置 `OPS_DATABASE_URL`**，或者连不上数据库。请回到步骤 4 重新设置环境变量再启动。
- 看终端报错信息里有没有 `OPS_DATABASE_URL` / `connection refused` 字样。

**Q4：想让后端在后台一直跑、关了终端也不停？**
```bash
# 用 nohup 后台启动，日志写到 server.log
nohup ./bin/opsconsole-server-linux-amd64 > server.log 2>&1 &
# 之后看日志：  tail -f server.log
# 停止它：      pkill -f opsconsole-server
```

**Q5：数据库里默认账号登录不了？**
- 确认 `docker compose up -d` 后**等一两分钟**再登录（数据库初始化需要时间）。
- 如果之前执行过 `docker compose down -v` 清空过数据，重新 `up -d` 会自动重建账号。

---

## 七、（进阶）用 Docker 跑后端（可选）

如果你不想在服务器上直接跑二进制，也可以把后端也塞进 Docker。前提是先把前端打包好（否则镜像里缺网页文件）：

```bash
# 1) 先构建前端，让程序能打包进网页
make frontend

# 2) 构建后端镜像
docker build -t opsconsole-backend ./backend

# 3) 运行（用 host 网络，方便连到上面的依赖）
docker run -d --name opsconsole --network host \
  -e OPS_DATABASE_URL="postgres://postgres:postgres_dev@localhost:5432/opsconsole?sslmode=disable" \
  -e OPS_JWT_SECRET="请你自己随便写一串字符" \
  opsconsole-backend
```

之后同样访问 `http://服务器IP:8080`。

---

## 八、开启监控与日志模块（可选增强）

前面"核心步骤"只用到了 **PostgreSQL + Redis** 这两个必选依赖，所以监控、日志页面当时是空/报错的。
这一节教你把 **VictoriaMetrics（指标）** 和 **OpenSearch（日志）** 也点亮——它们已经在 `docker-compose.yml` 里了，只是后端默认没去连。

### 8.1 这两个东西是干嘛的（一句话）

- **VictoriaMetrics（VM）**：时序数据库，负责存"指标"（CPU%、内存、磁盘、网络等）。前端「监控」Tab 的图表、节点列表、告警都来自它。
- **OpenSearch**：搜索/分析引擎，负责存"日志文本"。前端「日志」Tab 的检索、实时追踪（tail）都来自它。

数据是怎么流进来的（了解一下即可）：

```
主机指标： node_exporter → vmagent 抓取 → 写入 VictoriaMetrics → 后端查 PromQL → 前端图表
日志文本： 应用/主机写日志 → OpenSearch 索引 logs-<租户> → 后端查 DSL → 前端日志列表
告警链路： vmalert 对 VM 数据做规则评估 → alertmanager 接收 → 后端读活跃告警 → 前端告警面板
```

### 8.2 启用方法（只多三行环境变量）

停掉之前运行的后端（参考第五节），然后在**步骤 4 启动后端前**，把下面三行一起 `export`：

```bash
# 必选依赖（之前已设过）
export OPS_DATABASE_URL="postgres://postgres:postgres_dev@localhost:5432/opsconsole?sslmode=disable"
export OPS_JWT_SECRET="请你自己随便写一串字符"

# ↓↓↓ 新增：点亮监控与日志 ↓↓↓
export OPS_VICTORIAMETRICS_URL="http://localhost:8428"   # 指标存储
export OPS_OPENSEARCH_URL="http://localhost:9200"        # 日志存储
export OPS_VMALERT_URL="http://localhost:8081"            # 告警评估（想要告警面板就加这行）
export OPS_ALERTMANAGER_URL="http://localhost:9093"       # 告警通知（想让告警真发钉钉/邮件/Webhook 就加这行）
```

> 如果你还想让「通知渠道」动态生成并热加载 Alertmanager 配置，再加两行（**有默认值**，一般不用改）：
>
> ```bash
> # 这两个文件由后端按数据库里的渠道/规则自动生成，路径默认相对 backend/ 目录。
> # 注意：启动后端时请在 backend/ 目录下运行，使生成路径和 docker-compose 挂载一致；
> # 否则用绝对路径指定即可（例如 /home/你的用户名/workspace/OpsConsole/backend/deploy/generated/...）。
> export OPS_ALERTMANAGER_CONFIG="/home/你的用户名/workspace/OpsConsole/backend/deploy/generated/alertmanager.yml"
> export OPS_VMALERT_RULES="/home/你的用户名/workspace/OpsConsole/backend/deploy/generated/vmalert-rules.yml"
> ```
>
> 原理：后端在「创建/删除通知渠道」或「创建告警规则」后，会自动把 `notification_channels` / `alert_rules` 生成成 Alertmanager 配置和 vmalert 规则文件，并 `POST /-/reload` 热加载，无需重启容器。详见 §8.7。

然后照常启动后端：

```bash
./bin/opsconsole-server-linux-amd64
```

> 说明：VM / OpenSearch / vmagent / vmalert / alertmanager 这些容器在 `docker compose up -d` 时**已经一起启动了**，不用再额外操作。这里只是告诉后端"去连它们"。

### 8.3 怎么验证监控通了

> ⚠️ 监控/日志接口**都需要登录鉴权**（Bearer Token），直接 curl 不带 token 会返回 `401`。下面先登录拿 token，再调接口。

```bash
# 1) 登录，取出 accessToken（默认管理员账号）
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@corp.com","password":"opsconsole123"}' \
  | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
echo "token 长度: ${#TOKEN}"

# 2) 查即时指标（node_exporter / victoriametrics 的存活状态，up=1 表示正常）
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/v1/monitoring/query?expr=up" | head -c 400; echo

# 3) 列出被监控的节点
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/v1/monitoring/nodes" | head -c 300; echo

# 4) 看活跃告警（内置了一条 DemoAlwaysFiring 演示告警，应该能看到 firing）
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/v1/monitoring/alerts" | head -c 400; echo
```

能返回 JSON 数据（而不是 `502 upstream ... unavailable`），就说明监控链路通了。

### 8.4 怎么验证日志通了

日志接口同样需要 token（沿用上面的 `$TOKEN`）。另外 OpenSearch 默认**没有任何日志**，所以先往里插两条测试日志，再搜，才能看到数据：

```bash
# 取租户 ID（从登录返回里拿，admin 租户通常是 11111111-1111-1111-1111-111111111111）
TID=$(curl -s -X POST http://localhost:8080/api/v1/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@corp.com","password":"opsconsole123"}' \
  | grep -o '"tenantId":"[^"]*"' | cut -d'"' -f4)

# 往 OpenSearch 的 logs-<租户> 索引插两条测试日志（自动建索引）
curl -s -X POST "http://localhost:9200/logs-$TID/_doc?refresh=wait_for" \
  -H 'Content-Type: application/json' \
  -d '{"@timestamp":"2026-07-29T13:00:00Z","level":"error","service":"api","message":"db connection timeout"}' >/dev/null
curl -s -X POST "http://localhost:9200/logs-$TID/_doc?refresh=wait_for" \
  -H 'Content-Type: application/json' \
  -d '{"@timestamp":"2026-07-29T13:01:00Z","level":"info","service":"auth","message":"user login success"}' >/dev/null

# 搜 error 关键字（应返回那条 error 日志）
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/v1/logging/search?q=error&limit=10" | head -c 400; echo

# 按服务名过滤（应返回 auth 那条）
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/v1/logging/search?service=auth" | head -c 400; echo
```

只要接口返回的是 JSON 列表（哪怕为空 `[]`，而不是 `502 log service not configured`），就说明日志检索链路通了。
要看到真实业务日志，需要把你系统的日志采集进 OpenSearch 的 `logs-<租户ID>` 索引（超出本文档范围）。
验证完可删掉测试索引：`curl -X DELETE "http://localhost:9200/logs-$TID"`。

### 8.5 几个小提示

- **中文日志分词（可选）**：OpenSearch 默认英文分词。若要中文日志全文检索更准，可在容器里装 IK 插件（compose 注释里有命令：`docker exec opsconsole-os bin/opensearch-plugin install --batch https://github.com/infinilabs/analysis-ik/releases/download/v2.17.0/analysis-ik-2.17.0.zip`）。
- **告警默认不发通知**：只要没创建「通知渠道」，告警就走 `noop`（丢弃），仅用于让告警面板有数据。一旦在控制台「监控 → 通知渠道」里创建了 Webhook/邮件/钉钉等渠道，并把它绑到告警规则上，后端会动态生成 Alertmanager 配置并热加载，告警就会**真的发**出去（详见 §8.7）。
- **内置告警规则**在 `deploy/vmalert-rules.yml`（静态，node 指标相关）。另外后端还会根据数据库里的 `alert_rules` 自动生成一个 `vmalert-rules.generated.yml`（含 `channels` 标签，用于路由到对应渠道）。这两个文件都会被 vmalert 加载。
- 若这些可选接口仍返回 502，先 `docker compose ps` 确认 `victoriametrics` / `opensearch` 容器是 `Up` 状态，再检查上面三个 `OPS_*` 环境变量是否真的 `export` 成功了。

### 8.6 让日志真正有数据：采集链路

OpenSearch 默认是空的，所以「日志」Tab 能搜但没内容。要让它有用，需要把日志**采集进** `logs-<租户ID>` 索引。后端约定每条日志的字段为：`@timestamp`、`level`、`service`、`message`。

**方式一：一键演示（零依赖，验证链路用）**

项目自带脚本，直接往 OpenSearch 写一批示例日志：

```bash
# 默认写入 admin 租户（11111111-1111-1111-1111-111111111111），20 条
./scripts/ingest-demo-logs.sh

# 指定租户和数量
TENANT_ID=你的租户ID ./scripts/ingest-demo-logs.sh 50
```

写完后回到浏览器「日志」Tab 搜 `error`、`level:error` 或按服务过滤，就能看到数据。

> 要清空演示数据：`curl -X DELETE "http://localhost:9200/logs-<租户ID>"`

**方式二：生产采集（Vector / Fluent-bit）**

仓库提供 Vector 示例配置 `deploy/vector/vector.toml`：

- 数据源：尾随日志文件（`file` source）或 Docker 容器日志（`docker` source）；
- 转换：用 `remap` 把文本解析成 `@timestamp/level/service/message` 字段，并打上 `tenant`；
- 输出：写进 OpenSearch，索引名 `logs-{{ tenant }}`。

运行：`vector --config deploy/vector/vector.toml`（先装 Vector：https://vector.dev/docs/setup/installation/）。
多租户场景下，让每条日志带上正确的 `tenant` 字段即可自动落到对应租户的索引。

**中文日志检索更准（可选）**：默认英文分词。装 IK 插件后中文全文检索效果更好：
`docker exec opsconsole-os bin/opensearch-plugin install --batch https://github.com/infinilabs/analysis-ik/releases/download/v2.17.0/analysis-ik-2.17.0.zip`

### 8.7 让告警真正通知出去（通知渠道）

默认情况下告警只进面板、不往外发。要让告警**真发到** 钉钉 / 企业微信 / 飞书 / 邮件 / 自定义 Webhook，按下面三步来：

**① 后端连上 Alertmanager**（已在 §8.2 加过 `OPS_ALERTMANAGER_URL` 即可）。该地址默认开启 `/-/reload` 接口，后端用它热加载配置。

**② 在控制台创建「通知渠道」**（或调用 API）。渠道 `type` 与 `target` 的对应关系：

| type | target 写法 | 后端生成的 Alertmanager 配置 |
|------|-------------|------------------------------|
| `webhook` | 完整 HTTP 地址，如 `https://hook.example.com/alert` | `webhook_configs[].url` |
| `dingtalk` | 钉钉机器人 Webhook 地址 | 同上（`webhook_configs`） |
| `wecom` | 企业微信机器人 Webhook 地址 | 同上 |
| `feishu` | 飞书机器人 Webhook 地址 | 同上 |
| `email` | 收件人，如 `oncall@corp.com`（如需指定 SMTP：`to@域名:端口`） | `email_configs[]`（需全局 SMTP，见下方提示） |

> 邮件渠道：生成的配置里全局 `smtp_from/smtp_smarthost` 默认是 `opsconsole@localhost:25`（仅保证配置合法）。要真发邮件，需把后端指向的 Generated 文件里的这两个值改成你的真实邮件中继，或在部署时覆盖。

**③ 创建告警规则时绑定渠道**：在「监控 → 告警规则」里新建规则，把 `channelIds` 指向上一步的渠道 id。后端会：
1. 把数据库里的 `alert_rules` 重新生成成 vmalert 规则文件，每条规则带上 `channels` 标签；
2. 把 `notification_channels` 重新生成成 Alertmanager 配置（每个渠道一个 receiver，每个渠道 id 一个路由匹配 `channels=~".*<渠道id>.*"`）；
3. 分别对 vmalert、Alertmanager 执行 `/-/reload`。

之后告警一触发，Alertmanager 会按 `channels` 标签把告警送给对应渠道。

**手动同步 / 排错**：修改完渠道或规则后配置会自动 reload；若想强制重新生成并热加载，可调用：

```bash
curl -s -X POST http://localhost:8080/api/v1/monitoring/alerting/sync \
  -H "Authorization: Bearer $TOKEN"
# 返回 {"status":"synced"} 即成功
```

**命令行验证（以 Webhook 为例）**：

```bash
# 起一个本地接收端（端口 9099），Alertmanager 发来的告警会打印在这里
python3 scripts/webhook-receiver.py 9099 &

# 创建 webhook 渠道（target 填容器内能访问到的地址；若 Alertmanager 在 docker 内，
# 用宿主机网关 IP，例如 172.18.0.1:9099。本机直跑后端+容器可用宿主机网关）
CHID=$(curl -s -X POST http://localhost:8080/api/v1/monitoring/notifications \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"type":"webhook","target":"http://172.18.0.1:9099/"}' \
  | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

# 创建一条「永远触发」的告警规则并绑定该渠道
curl -s -X POST http://localhost:8080/api/v1/monitoring/alert-rules \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"name\":\"WebhookTest\",\"expr\":\"vector(1) > 0\",\"severity\":\"info\",\"channelIds\":[\"$CHID\"]}"

# 等几秒，看接收端是否收到 POST（payload 里 alertname=WebhookTest 即成功）
```

> 生成的配置文件在 `backend/deploy/generated/` 下：`alertmanager.yml` 与 `vmalert-rules.yml`。它们由后端维护，请勿手改（会被覆盖）。

---

### 8.8 Kubernetes 集群接入与指标监控

控制台已内置三类 K8s 能力，均通过「基础设施 → 集群」页面与「监控告警」页面使用。

**① 多集群 kubeconfig（A2）**

注册集群时可直接在「kubeconfig (YAML)」输入框**粘贴该集群的 kubeconfig 内容**，后端会按集群维度用这份内容独立建连（解析 `clientcmd.Load` + `NewDefaultClientConfig`），实现真正的多集群隔离。留空则全局回退到 `OPS_KUBECONFIG_PATH` 环境变量。验证：

```bash
# 注册一个带内联 kubeconfig 的集群
curl -s -X POST http://localhost:8080/api/v1/infrastructure/clusters \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"prod-bj","provider":"self-hosted","kubeconfig":"<base64 或纯 YAML 文本>"}'
```

**② 真实节点资源压力（A3）**

`GET /api/v1/infrastructure/clusters/:id/nodes` 返回**真实节点**的 Allocatable 占比与压力状态：CPU / 内存使用率（`listNodeMetrics`，即 metrics-server 的 `NodeMetrics`）、DiskPressure / MemoryPressure / PIDPressure 三态、Pod 容量占用。metrics-server 不可用时 CPU / 内存百分比为 null（前端显示「—」），节点本身仍可列出。「基础设施 → 集群」页面的「节点资源压力」卡片即消费该接口。

**③ K8s 指标监控与命名空间过滤（B5）**

- **命名空间过滤**：`GET /api/v1/monitoring/query` 现支持 `?namespace=<ns>` 标签过滤（与既有的 `node`/`cluster`/`instance` 同机制，值走白名单校验）。
- **K8s 工作负载面板**：「监控告警」页面新增「K8s 工作负载」区块，按 `namespace` 过滤、按 `pod` 拆分曲线，含 Pod CPU 使用率、Pod 内存使用、Pod 重启次数三张图（数据源 `container_*_seconds_total` / `kube_pod_status_restarts_total`）。
- **采集侧部署**（可选增强，把 K8s 指标喂进 VictoriaMetrics）：
  - `deploy/k8s-monitoring.yaml`：在集群内拉起 **kube-state-metrics** + **node-exporter**（DaemonSet，即 vmagent 的采集上游）。
  - `deploy/vmagent-k8s.yml`：在集群内部署 **vmagent**，采集 kubelet/cAdvisor + kube-state-metrics + node-exporter，并 `remoteWrite` 到 OpsConsole 的 VictoriaMetrics。**保留 `namespace`/`pod`/`node` 标签**，与前端命名空间过滤一一对应。

  ```bash
  kubectl apply -f deploy/k8s-monitoring.yaml   # 先起数据源
  kubectl apply -f deploy/vmagent-k8s.yml        # 再起采集与回写
  ```

> 注意：以上 K8s 指标/节点能力依赖真实集群与 metrics-server；未接入时对应接口返回 502（属正常），不影响其余功能。

---

## 九、一句话总结

1. `docker compose up -d` 起依赖（含 PG/Redis 以及可选的 VM/OpenSearch 等）
2. `export OPS_DATABASE_URL=...` 设数据库地址（监控/日志再加 3 行 `OPS_*_URL`）
3. `./bin/opsconsole-server-linux-amd64` 启动服务
4. 浏览器开 `http://IP:8080`，用 `admin@corp.com / opsconsole123` 登录

搞定。
