# OpsConsole — 完整 Kubernetes 部署文档

本文件把 **“把 OpsConsole 整套系统部署到 Kubernetes（数据库/Redis/VM/OpenSearch 全部集群内自建）”** 的全过程，按执行顺序拆成可照搬的步骤。每一步都附带验证命令，跑完一步确认一步。

> **主线场景：真实多节点 K8s 集群**（你用 `kubectl` 已经能连上的那种，例如多台物理机/虚拟机组成的集群）。
> 所有清单（`deploy/k8s/*.yaml`）都是**标准 K8s 对象**，跟具体发行版、跟 kind 都没有耦合，直接 `kubectl apply` 即可。
> **kind / k3s / minikube 只是“本地快速起个测试集群”的可选方案**，见文末附录，不是前提条件——你有真实集群就完全不需要看那节。

---

## 目录

1. [先澄清：什么是 kind](#1-先澄清什么是-kind)
2. [架构总览](#2-架构总览)
3. [前置条件（真实集群视角）](#3-前置条件真实集群视角)
4. [步骤 0：构建并推送镜像](#4-步骤-0构建并推送镜像)
5. [步骤 1：创建 Secret（敏感配置）](#5-步骤-1创建-secret敏感配置)
6. [步骤 2：准备 PostgreSQL 初始化数据](#6-步骤-2准备-postgresql-初始化数据)
7. [步骤 3：部署核心栈](#7-步骤-3部署核心栈)
8. [步骤 4：暴露访问入口](#8-步骤-4暴露访问入口)
9. [步骤 5：功能冒烟验证](#9-步骤-5功能冒烟验证)
10. [步骤 6：接入监控采集（让指标/告警有真实数据）](#10-步骤-6接入监控采集让指标告警有真实数据)
11. [步骤 7：配置真实告警通知（B6，端到端验证）](#11-步骤-7配置真实告警通知b6端到端验证)
12. [步骤 8：验证 A2/A3（粘贴真实 kubeconfig）](#12-步骤-8验证-a2a3粘贴真实-kubeconfig)
13. [运维操作（扩缩容 / 升级 / 备份 / 清理）](#13-运维操作)
14. [故障排查表](#14-故障排查表)
15. [已知限制与生产建议](#15-已知限制与生产建议)
16. [附录：本地测试集群（kind/k3s/minikube）快速起法](#16-附录本地测试集群kindk3sminikube快速起法)
17. [文件清单](#17-文件清单)

---

## 1. 先澄清：什么是 kind

**kind = "Kubernetes IN Docker"**，是一个用 Docker 容器在**单台机器上模拟出一套 K8s 集群**的工具，专门用来本地测试。它跑出来的“节点”其实是一个个容器，不是真机器。

- 如果你 `kubectl get nodes` 看到的是真节点（比如 `k8s-node1/2/3...`、多个 worker），那你用的就是**真实集群**，本文档主线完全适用。
- kind 在本文档里**只是附录里的一个“本地测试”例子**，不是部署 OpsConsole 的必要条件。文档里出现的 `kind create cluster`、`ingress-ready` 标签、`extraPortMappings` 端口映射——这些 kind 专属步骤，**真实集群用户全部跳过**，跟你的环境无关。

一句话：**清单是通用的，直接 apply；只有附录那一节才是 kind 专属。**

---

## 2. 架构总览

```
                         ┌─────────────────────────────────────────────┐
                         │  Pod: opsconsole-backend (1 个 Pod 3 容器)   │
                         │                                               │
  浏览器 ──Ingress/port──▶│  backend (单二进制, 内嵌前端 SPA)  :8080       │
                         │     │ 启动时把生成的告警配置写到 /generated     │
                         │     ├──▶ alertmanager  sidecar  :9093 ─┐      │
                         │     └──▶ vmalert       sidecar  :8429 ─┤      │
                         │         (共享 emptyDir 卷 /generated)   │      │
                         └────────────────────────────────────────┼──────┘
                                                                  │ reload
                         ┌────────────────────────────────────────┼──────┐
                         │  opsconsole 命名空间（其余有状态组件）     │      │
                         │   postgres  / redis / victoriametrics     │      │
                         │   (opensearch 可选)                       │      │
                         └───────────────────────────────────────────────┘

  监控采集（独立命名空间 opsconsole-monitoring）：
     kube-state-metrics + node-exporter + vmagent
     vmagent 把指标 remoteWrite 到上面的 victoriametrics
```

**三个关键设计点（与 docker-compose 的对应）：**

1. **后端是单二进制内嵌前端**（`//go:embed web/dist`），所以 K8s 里**只需部署后端镜像**，它同时托管 SPA（`/`）与 API（`/api/v1`）。`frontend/Dockerfile`（nginx）是可选的，本方案不部署。
2. **告警配置共享问题**：docker-compose 里「后端写 `alertmanager.yml`/`vmalert-rules.yml` 到 bind mount，alertmanager/vmalert 再读」这个共享文件需求，在 K8s 用 **同 Pod 的 sidecar + 共享 `emptyDir` 卷 `/generated`** 实现，**不需要 RWX 共享盘**。
3. **版本锁定 v1.101.0**（VM / vmagent / vmalert 一致），与你本地验证的版本相同，避免 `label_filters` 等行为差异。

---

## 3. 前置条件（真实集群视角）

| 项 | 说明 |
|----|------|
| `kubectl` | 你已经能连上目标集群（`kubectl get nodes` 正常返回真节点）。版本无需和本文一致。 |
| 后端镜像分发 | **两种方式都支持**：① **无仓库（本文默认）**——构建后 `docker save` 成 tar，拷到每个节点 `ctr import` / `docker load`；清单 `20-backend.yaml` 已写死 `opsconsole-backend:localbuild` + `imagePullPolicy: IfNotPresent`，无需改清单。② 有仓库——push 后把镜像字段改成 `$REG/opsconsole-backend:$TAG`。 |
| 存储类（StorageClass） | 清单会**自动创建专用存储类 `opsconsole-longhorn`（Longhorn，单副本）**并在各 PVC 引用，所以**不要求集群有默认 StorageClass**。前提是你集群已装 **Longhorn**（`kubectl get sc` 应能看到 `longhorn`）。先用 `kubectl get sc` 确认 Longhorn 存在。 |
| `openssl` | 用来生成随机口令/JWT（在你自己机器上执行即可）。 |
| 节点资源 | 建议控制平面/worker 有足够余量；OpenSearch 较吃内存（请求 1.5Gi、限制 2Gi），建议单节点预留 2G+。 |

代码已就绪：

```bash
cd /home/kael/workspace/OpsConsole
ls deploy/k8s            # 本目录所有清单
ls schema.sql seed.sql   # PG 初始化脚本（必须存在）
```

---

## 4. 步骤 0：构建镜像并分发到节点

后端镜像**必须在构建期**就把前端 SPA 嵌进去（embed 目录要在 `go build` 前就存在）：

```bash
cd /home/kael/workspace/OpsConsole

# 1) 先把前端打包进后端 embed 目录（backend/cmd/api-server/web/dist）
make frontend

# 2) 构建后端镜像（镜像名保持 opsconsole-backend:localbuild，与清单一致）
docker build --build-arg GOPROXY=https://goproxy.cn,direct \
  -f backend/Dockerfile -t opsconsole-backend:localbuild ./backend
```

> 网络受限拉 Go 依赖超时？上面已加 `--build-arg GOPROXY=https://goproxy.cn,direct`
> （`backend/Dockerfile` 已内置可覆盖的 `GOPROXY` 构建参数）。

镜像构建好后，要让集群**每个节点**都能拿到它。两种分发方式：

**方式 A（无镜像仓库，本文默认）：tar 导出 + 各节点导入**

```bash
# 在构建机导出
docker save opsconsole-backend:localbuild -o /home/kael/opsconsole-backend-localbuild.tar

# 把 tar 拷到每个节点并导入：
#   scp /home/kael/opsconsole-backend-localbuild.tar <节点>:/tmp/
# 容器运行时是 containerd（多数新集群）：
#   每个节点执行： ctr -n k8s.io images import /tmp/opsconsole-backend-localbuild.tar
# 容器运行时是 docker：
#   每个节点执行： docker load -i /tmp/opsconsole-backend-localbuild.tar
```

清单 `20-backend.yaml` 里镜像就是 `opsconsole-backend:localbuild` + `imagePullPolicy: IfNotPresent`，正好匹配此方式，**无需改清单**。

**方式 B（有镜像仓库）：push 后改镜像字段**

```bash
REG=你的镜像仓库地址        # 如 docker.io/你的用户名 或 harbor.example.com/opsconsole
TAG=$(git rev-parse --short HEAD)
docker tag opsconsole-backend:localbuild $REG/opsconsole-backend:$TAG
docker push $REG/opsconsole-backend:$TAG
# 然后把 20-backend.yaml 里的 image: opsconsole-backend:localbuild
# 改成 image: $REG/opsconsole-backend:$TAG（imagePullPolicy 保持 IfNotPresent）
```

> 构建机不是部署机也没关系：镜像分发到节点即可，构建在哪儿做都行。

---

## 5. 步骤 1：创建 Secret（敏感配置）

`deploy/k8s/01-secrets.yaml` 里是**示例弱口令**，生产前务必替换。最干净的做法是命令直接生成（不落明文文件）：

```bash
# 后端只认 OPS_ 前缀的键名（见 backend/internal/config/config.go）。
# 数据库密码单一来源：先生成一次存入 db-password，OPS_DATABASE_URL 复用它。
# 用 tr 过滤成纯字母数字，避免 base64 里的 / + = 破坏连接串 URL。
PGPW=$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 24)
kubectl create secret generic opsconsole-secrets -n opsconsole \
  --from-literal=db-password="$PGPW" \
  --from-literal=OPS_DATABASE_URL="postgres://postgres:$PGPW@opsconsole-postgres:5432/opsconsole?sslmode=disable" \
  --from-literal=OPS_REDIS_URL="redis://opsconsole-redis:6379/0" \
  --from-literal=OPS_JWT_SECRET="$(openssl rand -base64 32)" \
  --from-literal=OPS_OPENSEARCH_URL="http://opsconsole-opensearch:9200"
```

- 不部署 OpenSearch 时，把 `OPS_OPENSEARCH_URL` 留空：`--from-literal=OPS_OPENSEARCH_URL=""`（后端会优雅返回 502，不影响其他功能）。
- **数据库密码是单一来源**：`db-password` 供 Postgres 容器用 `secretKeyRef` 读取；`OPS_DATABASE_URL` 是后端真正读取的连接串，两者密码部分必须相同（上面命令已自动保证）。改密码只改 `PGPW` 一处即可。
- 如果选择直接用 `01-secrets.yaml` 文件，请先编辑里面的 `postgres-dev` / `change-me...` 等值再 apply。**注意**：清单文件里是明文，生产请改用上面的命令生成；且务必保证 `OPS_DATABASE_URL` 内的密码与 `db-password` 相同。

---

## 6. 步骤 2：准备 PostgreSQL 初始化数据

Postgres 首次启动会自动执行 `initdb.d` 里的 `schema.sql`（建表 / RLS / 角色）与 `seed.sql`（种子账号/租户）：

```bash
bash deploy/k8s/make-init.sh
# 等价于：
kubectl -n opsconsole create configmap opsconsole-pg-init \
  --from-file=01-schema.sql=./schema.sql \
  --from-file=02-seed.sql=./seed.sql \
  --dry-run=client -o yaml | kubectl apply -f -
```

---

## 7. 步骤 3：部署核心栈

先确认存储类（见第 3 节），然后按依赖顺序 apply：

```bash
kubectl apply -f deploy/k8s/00-namespace.yaml
kubectl apply -f deploy/k8s/02-configmap.yaml
kubectl apply -f deploy/k8s/14-storageclass.yaml   # 专用 Longhorn 存储类（单副本）
kubectl apply -f deploy/k8s/01-secrets.yaml        # 若已在步骤 1 用命令创建过 Secret，这里【跳过】，否则会覆盖成示例口令

# 有状态组件
kubectl apply -f deploy/k8s/10-postgres.yaml
kubectl apply -f deploy/k8s/11-redis.yaml
kubectl apply -f deploy/k8s/12-victoriametrics.yaml
kubectl apply -f deploy/k8s/13-opensearch.yaml     # 可选（重）；不部署就删掉 os-url

# 告警规则 + 后端（含 alertmanager/vmalert sidecar）
kubectl apply -f deploy/k8s/22-static-rules-configmap.yaml
kubectl apply -f deploy/k8s/20-backend.yaml
```

观察启动（建议新开一个终端常驻）：

```bash
kubectl -n opsconsole get pods -w
```

逐个就绪的预期：

```bash
kubectl -n opsconsole wait --for=condition=Ready pod -l app=opsconsole-postgres --timeout=180s
kubectl -n opsconsole wait --for=condition=Ready pod -l app=opsconsole-redis     --timeout=120s
kubectl -n opsconsole wait --for=condition=Ready pod -l app=opsconsole-victoriametrics --timeout=120s
kubectl -n opsconsole wait --for=condition=Ready pod -l app=opsconsole-backend   --timeout=180s
```

> 后端 Pod 有三个容器（`backend` / `alertmanager` / `vmalert`）。后端启动时会把生成的告警配置写进 `/generated` 并 reload，日志里能看到 `listening on :8080`。
>
> **PVC 一直 Pending？** 多半是集群没有默认 StorageClass。用 `kubectl get sc` 看；没有就告诉我你集群用哪个（如 `rook-ceph-block` / `local-path` / 云盘类），我帮你在 PVC 里加 `storageClassName:`。

---

## 8. 步骤 4：暴露访问入口

**方式 A（最简，推荐先用）：port-forward**

```bash
kubectl -n opsconsole port-forward svc/opsconsole-backend 8080:8080
# 浏览器打开 http://localhost:8080
```

**方式 B（Ingress，域名访问，可选）：**

```bash
kubectl apply -f deploy/k8s/30-ingress.yaml
```

> Ingress 需要集群里**已经装了 Ingress Controller**（如 ingress-nginx / traefik）。没装的话这条可跳过，不影响功能；要用的话把 `30-ingress.yaml` 里的 `ingressClassName` 改成你集群实际装的 controller 名称。
> Ingress 已特意**不做 rewrite**，避免把 `/api/v1/...` 改写成 `/` 导致接口 404（后端本身同时托管 SPA 与 API）。

---

## 9. 步骤 5：功能冒烟验证

```bash
# 1) 后端存活
curl -fsS http://localhost:8080/healthz && echo "  -> backend OK"

# 2) 前端 SPA 已内嵌
curl -fsS http://localhost:8080/ | grep -o '<title>.*</title>'

# 3) 登录（种子账号见 seed.sql，一般为 admin@corp.com / opsconsole123）
#    注意：真实路由是 /api/v1/login（不是 /api/v1/auth/login）
curl -s -X POST http://localhost:8080/api/v1/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@corp.com","password":"opsconsole123"}' | head -c 300; echo

# 4) 告警配置已生成 + sidecar 已加载
kubectl -n opsconsole exec deploy/opsconsole-backend -c alertmanager -- \
  wget -qO- http://localhost:9093/-/ready
kubectl -n opsconsole exec deploy/opsconsole-backend -c vmalert -- \
  wget -qO- http://localhost:8429/api/v1/alerts
```

能登录、能取到 `/healthz`、alertmanager 返回 `ready`，说明核心栈跑通。

---

## 10. 步骤 6：接入监控采集（让指标/告警有真实数据）

把 OpsConsole 所在的集群也纳管为采集对象，复用仓库里现成的采集清单：

```bash
# 上游数据源：kube-state-metrics + node-exporter
kubectl apply -f deploy/k8s/monitoring/00-k8s-monitoring.yaml
# vmagent：采集指标并 remoteWrite 到集群内的 VictoriaMetrics
kubectl apply -f deploy/k8s/monitoring/01-vmagent.yaml

kubectl -n opsconsole-monitoring wait --for=condition=Ready pod -l app=vmagent --timeout=180s
```

> 把 `01-vmagent.yaml` 里的 `cluster: <your-cluster-name>` 改成真实集群名，否则所有指标共用同一个 `cluster` 标签。

验证指标是否进 VM、并按 namespace 过滤（B5 能力）：

```bash
kubectl -n opsconsole port-forward svc/opsconsole-victoriametrics 8428:8428 &
curl -fsS 'http://localhost:8428/api/v1/query?query=up' | head -c 400; echo
```

前端验证：进入「监控告警 → K8s 工作负载」面板，切换 namespace 应能过滤；进入「实时告警」面板能看到 `DemoAlwaysFiring` 等规则（验证链路用，可删）。

---

## 11. 步骤 7：配置真实告警通知（B6，端到端验证）

静态规则里 `DemoAlwaysFiring` 会持续触发。把它真正“通知”出去，验证 B6：

1. 在 UI 的 **通知渠道（notification channels）** 里新增一个渠道：
   - **Webhook**（最易验证）：填一个能收到 POST 的地址（如 `https://webhook.site/...` 或你自己的接收服务）。
   - **Email**：需 SMTP 可达；Alertmanager 的全局 SMTP 由后端在生成 `alertmanager.yml` 时写入，确保你填的 SMTP 服务器/账号正确。
2. 在 **告警规则（alert rules）** 里把某条规则（如 `DemoAlwaysFiring`）关联到该渠道。
3. 保存后，后端会**重新生成 `alertmanager.yml` 并自动 reload**（无需重启容器）。
4. 观察：
   - `kubectl -n opsconsole exec deploy/opsconsole-backend -c alertmanager -- wget -qO- http://localhost:9093/api/v2/alerts` 能看到活跃告警；
   - 你的 webhook/邮箱应能收到通知 → B6 端到端打通。

> Alertmanager v0.27 默认开启 `/-/reload`，后端在渠道/规则变更后 POST 该接口热加载。

---

## 12. 步骤 8：验证 A2/A3（粘贴真实 kubeconfig）

A2（多集群 kubeconfig）与 A3（从真实 K8s 读节点资源压力）需要你提供一个真实集群的 kubeconfig：

1. UI 进入 **基础设施 → 集群**，新增集群，把目标集群的 kubeconfig（含 `clusters`/`users`/`contexts` 的完整 YAML）**粘贴进文本框**（A2 特性：支持内联 kubeconfig，无需后端挂全局文件）。
2. 保存后，点开该集群的 **节点** 视图：应能看到真实节点列表、CPU/内存使用率（占 Allocatable 百分比）、磁盘/内存/PID 压力标签、Pod 数量/容量（A3 特性）。
3. 若节点视图返回 502，通常是 kubeconfig 不可达（如内网地址、证书问题），检查 kubeconfig 里的 `server` 地址从当前集群网络是否可达。

### 注册 OpsConsole 自身所在的集群（in-cluster）

OpsConsole 后端以 Pod 形式跑在目标集群里，粘贴的 kubeconfig 是**从 Pod 内部去连 API Server** 的，所以要满足两点：① `server` 地址 Pod 能解析/连通；② 凭据被 API Server 接受。直接用控制平面的 `admin.conf` 经常失败（它的 `server` 多是 `127.0.0.1:6443` 或某台控制面 IP，Pod 内不可达）。最稳的做法是建一个**只读 ServiceAccount**，并把 `server` 指向集群内地址 `https://kubernetes.default.svc:443`：

```bash
# 1) 建只读 SA + 权限（在当前集群执行）
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: ServiceAccount
metadata:
  name: opsconsole-cluster-reader
  namespace: opsconsole
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: opsconsole-cluster-reader
rules:
  - apiGroups: [""]
    resources: ["nodes","nodes/status","nodes/proxy","nodes/metrics","pods","pods/status","namespaces","namespaces/status","services","endpoints","configmaps","events","persistentvolumes","persistentvolumeclaims","replicationcontrollers","limitranges","resourcequotas"]
    verbs: ["get","list","watch"]
  - apiGroups: ["apps"]
    resources: ["deployments","statefulsets","daemonsets","replicasets"]
    verbs: ["get","list","watch"]
  - apiGroups: ["batch"]
    resources: ["jobs","cronjobs"]
    verbs: ["get","list","watch"]
  - apiGroups: ["metrics.k8s.io"]
    resources: ["nodes","pods"]
    verbs: ["get","list","watch"]
  - apiGroups: ["autoscaling"]
    resources: ["horizontalpodautoscalers"]
    verbs: ["get","list","watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: opsconsole-cluster-reader
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: opsconsole-cluster-reader
subjects:
  - kind: ServiceAccount
    name: opsconsole-cluster-reader
    namespace: opsconsole
EOF

# 2) 给 SA 发一个长期 token（用 Secret 绑定，避免 1 小时过期）
kubectl -n opsconsole apply -f - <<'EOF'
apiVersion: v1
kind: Secret
metadata:
  name: opsconsole-cluster-reader-token
  namespace: opsconsole
  annotations:
    kubernetes.io/service-account.name: opsconsole-cluster-reader
type: kubernetes.io/service-account-token
EOF

# 3) 生成可直接粘贴进 UI 的 kubeconfig
CA=$(kubectl -n opsconsole get secret opsconsole-cluster-reader-token -o jsonpath='{.data.ca\.crt}')
TOKEN=$(kubectl -n opsconsole get secret opsconsole-cluster-reader-token -o jsonpath='{.data.token}' | base64 -d)
cat > /tmp/opsconsole-self-kubeconfig.yaml <<EOF
apiVersion: v1
kind: Config
clusters:
  - name: self-cluster
    cluster:
      server: https://kubernetes.default.svc:443
      certificate-authority-data: $CA
contexts:
  - name: self-cluster
    context:
      cluster: self-cluster
      user: opsconsole-cluster-reader
      namespace: opsconsole
current-context: self-cluster
users:
  - name: opsconsole-cluster-reader
    user:
      token: $TOKEN
EOF
echo "生成完毕，内容如下，复制粘贴进 UI："
cat /tmp/opsconsole-self-kubeconfig.yaml
```

然后在 UI **基础设施 → 集群 → 新增集群**，把上面生成的 YAML 整段粘进去保存。节点视图即可看到真实节点资源压力（A3）。

> 嫌麻烦也可直接 `cat ~/.kube/config` 粘贴，但务必把其中的 `server:` 改成 `https://kubernetes.default.svc:443`（否则 Pod 内连不上），且 admin 凭据权限过大——生产不建议。

---

## 13. 运维操作

**查看日志**
```bash
kubectl -n opsconsole logs deploy/opsconsole-backend -c backend -f
kubectl -n opsconsole logs deploy/opsconsole-backend -c alertmanager -f
```

**滚动更新后端（改了镜像后）**
```bash
kubectl -n opsconsole set image deploy/opsconsole-backend backend=$REG/opsconsole-backend:$NEW_TAG
kubectl -n opsconsole rollout status deploy/opsconsole-backend
```

**扩缩容**
```bash
kubectl -n opsconsole scale deploy/opsconsole-backend --replicas=2
```
⚠️ 扩副本时每个新 Pod 都会带自己的 alertmanager/vmalert sidecar 与独立 `/generated`（emptyDir 不跨 Pod 共享），符合设计。**不要**只扩 `backend` 容器而漏掉 sidecar；本清单里两者绑定在同一 Deployment，一起扩。生产建议拆成独立 Deployment + RWX PVC（见第 15 节）。

**备份（有状态组件数据）**
- Postgres：`kubectl -n opsconsole exec opsconsole-postgres-0 -- pg_dump -U postgres opsconsole > backup.sql`
- VictoriaMetrics / Redis / OpenSearch：对有 `persistentVolumeClaim` 的 PVC 做卷快照或 `kubectl cp`。

**彻底重装（删除全部数据，从头部署）**

要完全推倒重来（如改了密码/存储/配置，或想清掉旧数据），按相反顺序删，最后删命名空间（级联删除 PVC 与数据）：

```bash
cd /home/kael/workspace/OpsConsole/deploy/k8s

# 1) 监控栈（独立 namespace）
kubectl delete -f monitoring/01-vmagent.yaml --ignore-not-found
kubectl delete -f monitoring/00-k8s-monitoring.yaml --ignore-not-found
kubectl delete namespace opsconsole-monitoring --ignore-not-found

# 2) 核心栈（按相反顺序）
kubectl delete -f 30-ingress.yaml                 --ignore-not-found
kubectl delete -f 20-backend.yaml                 --ignore-not-found
kubectl delete -f 22-static-rules-configmap.yaml  --ignore-not-found
kubectl delete -f 13-opensearch.yaml              --ignore-not-found
kubectl delete -f 12-victoriametrics.yaml         --ignore-not-found
kubectl delete -f 11-redis.yaml                   --ignore-not-found
kubectl delete -f 10-postgres.yaml                --ignore-not-found
kubectl delete -f 02-configmap.yaml               --ignore-not-found
kubectl delete -f 01-secrets.yaml                 --ignore-not-found
kubectl delete -f 14-storageclass.yaml            --ignore-not-found
# 删命名空间会级联删除其中所有 PVC（数据随之删除）
kubectl delete namespace opsconsole               --ignore-not-found
```

确认彻底干净（避免残留 Longhorn 卷导致重装撞旧数据）：

```bash
kubectl get ns | grep opsconsole            # 应为空
kubectl -n longhorn-system get volumes 2>/dev/null | grep -E 'pvc-|opsconsole' || echo "无残留 Longhorn 卷"
```

> 若 `opsconsole` 命名空间一直 `Terminating`（通常 PVC finalizer 卡住）：
> ```bash
> kubectl get pvc -n opsconsole -o name | xargs -r kubectl delete --force --grace-period=0
> kubectl delete namespace opsconsole --force --grace-period=0
> ```
> 若 Longhorn 卷仍残留，到 Longhorn UI 或 `kubectl -n longhorn-system delete volume <name>` 清掉。
>
> 清理干净后，从本文「步骤 1」开始重新部署即可（注意**先建 Secret 再 apply 10-postgres.yaml**）。

**清理（保留 PVC 数据）**
```bash
kubectl delete -f deploy/k8s/30-ingress.yaml
kubectl delete -f deploy/k8s/20-backend.yaml
kubectl delete -f deploy/k8s/22-static-rules-configmap.yaml
kubectl delete -f deploy/k8s/13-opensearch.yaml
kubectl delete -f deploy/k8s/12-victoriametrics.yaml
kubectl delete -f deploy/k8s/11-redis.yaml
kubectl delete -f deploy/k8s/10-postgres.yaml
kubectl delete -f deploy/k8s/02-configmap.yaml
kubectl delete -f deploy/k8s/01-secrets.yaml
kubectl delete -f deploy/k8s/00-namespace.yaml
# 采集侧
kubectl delete -f deploy/k8s/monitoring/01-vmagent.yaml
kubectl delete -f deploy/k8s/monitoring/00-k8s-monitoring.yaml
```
> PVC 默认保留（`kubectl delete pvc -n opsconsole --all` 才清数据）。

---

## 14. 故障排查表

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| `backend` 容器 CrashLoopBackOff，日志 `OPS_DATABASE_URL is required` | Secret 里没有 `OPS_DATABASE_URL` 这个键（以前错写成了 `db-url`） | 后端只认 `OPS_` 前缀键名。`opsconsole-secrets` 必须含 `OPS_DATABASE_URL` / `OPS_REDIS_URL` / `OPS_JWT_SECRET` / `OPS_OPENSEARCH_URL`（见步骤 1 命令）。重建 Secret 后重启后端：`kubectl -n opsconsole rollout restart deploy/opsconsole-backend` |
| `backend` 日志 `postgres ping: ...` 失败 | PG 未就绪 / Secret 没建好 | 密码现在由 Secret 的 `db-password` **单一来源**保证（`db-url` 与 PG 容器都引用它，永远一致）。连不上先看 PG Pod 日志；确认 `opsconsole-secrets` 已创建且含 `db-password`，且**先建 Secret 再起 PG**（若 PG 先于 Secret 启动，删 Pod 重建：`kubectl -n opsconsole delete pod opsconsole-postgres-0`）。 |
| PVC 一直 Pending | 集群没有默认 StorageClass | `kubectl get sc`；无默认就告我 SC 名，我补 `storageClassName` |
| `alertmanager` / `vmalert` 启动失败，报找不到配置文件 | init `seed-config` 没跑 / 卷没挂上 | 检查 Pod 内 `/generated` 是否有文件：`kubectl exec ... -c alertmanager -- ls -l /generated` |
| 前端能开但 `/api/v1` 全 502 | 某个外部服务 URL 没配（VM/Alertmanager/OS） | 后端对这些是“显式 502”，确认对应 Service 已起、URL 正确 |
| 日志页面 502 | 没部署 OpenSearch 或 `os-url` 有误 | 属预期；部署 OpenSearch 或忽略该功能 |
| 指标面板空 / 无数据 | vmagent 没起或 remoteWrite 地址错 | `kubectl -n opsconsole-monitoring logs deploy/vmagent`；确认 `remoteWriteURL` 指向 `opsconsole-victoriametrics.opsconsole.svc` |
| 告警触发了但收不到通知 | 渠道/SMTP/Webhook 没配对 | 查 alertmanager `/api/v2/alerts` 是否活跃；查 alertmanager 日志是否 reload 成功 |
| 扩到多副本后部分 Pod 无告警 | sidecar 没随副本一起扩 | 本清单 sidecar 与 backend 同 Deployment，一起扩即可 |
| Ingress 不生效 | 集群没装 Ingress Controller | 装 ingress-nginx/traefik，或改 `ingressClassName`；或直接用 port-forward |
| `postgres` CrashLoopBackOff，日志 `initdb: error: directory "/var/lib/postgresql/data" exists but is not empty ... contains a lost+found directory` | 用 Longhorn（或任何会预建 `lost+found` 的存储）做数据盘，`initdb` 要求目录为空而失败 | 数据卷改用 `subPath: pgdata`（已写进 `10-postgres.yaml`）。重来：`kubectl apply -f 10-postgres.yaml && kubectl -n opsconsole delete pod opsconsole-postgres-0` |
| 多个有状态 PVC（PG/Redis/VM/OS）都用 Longhorn 默认 3 副本，卷 `faulted` / Pod `FailedAttachVolume: volume is not ready` | 单节点/小集群磁盘不够 3 副本 | 已建专用 StorageClass `opsconsole-longhorn`（replicas=1）并在各 PVC 声明；若仍用默认 `longhorn`，把默认 SC 的 `numberOfReplicas` 改成 1 |

---

## 15. 已知限制与生产建议

- **OpenSearch 很重**：本地小集群可以先不部署，日志功能会暂时 502，其它不受影响。
- **版本锁定 v1.101.0**：VM / vmagent / vmalert 三者同步，升级时一起升，避免内部协议/行为不匹配。
- **共享告警配置无持久化**：`/generated` 是 emptyDir，Pod 重启后由后端重新生成，符合预期；alertmanager 活跃告警内存（`/alertmanager`）也是 emptyDir，重启即清空——本地验证可接受。
- **多副本**：当前 `replicas: 1`。若扩到多副本，要保证每个后端 Pod 都带 alertmanager/vmalert sidecar（本清单已绑定）。生产更稳妥的方案是：把 alertmanager/vmalert 拆成**独立 Deployment + RWX PVC**（或各自单副本 StatefulSet），后端写 PVC、sidecar 读同一 PVC。
- **生产数据库**：本清单为有状态组件用了 `ReadWriteOnce` PVC（单副本）。生产建议换成托管 Postgres/Redis，或给 StatefulSet 配靠谱的 StorageClass + 定期备份。
- **Secret 管理**：示例用 `kubectl create secret`，生产应接 Sealed Secrets / External Secrets / Vault。
- **Ingress TLS**：示例未启用 HTTPS，生产请在 Ingress 上加 `cert-manager` 证书。

---

## 16. 附录：本地测试集群（kind/k3s/minikube）快速起法

> 本节**只针对“想在笔记本上快速起个临时集群试试”**的场景。你有真实集群，可忽略本节。

**kind（单机容器模拟）：**
```bash
cat <<'EOF' | kind create cluster --name opsconsole --config -
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
  kubeadmConfigPatches:
  - |
    kind: InitConfiguration
    nodeRegistration:
      kubeletExtraArgs:
        node-labels: "ingress-ready=true"
  extraPortMappings:
  - containerPort: 80
    hostPort: 80
    protocol: TCP
  - containerPort: 443
    hostPort: 443
    protocol: TCP
EOF
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
```
kind 自带默认 StorageClass，PVC 可直接用；镜像可免 push，用 `kind load docker-image $REG/opsconsole-backend:$TAG --name opsconsole` 直接塞进集群。

**k3s：** 自带 traefik，把 `30-ingress.yaml` 的 `ingressClassName: nginx` 改成 `traefik`；默认也有 local-path 存储类。

**minikube：** `minikube addons enable ingress`；或全程用 `kubectl port-forward`，跳过 Ingress。

---

## 17. 文件清单

```
deploy/k8s/
├── 00-namespace.yaml              Namespace opsconsole
├── 01-secrets.yaml               敏感配置（口令/JWT/连接串）—— 生产请自建
├── 02-configmap.yaml             内部服务地址、端口、生成配置路径
├── 10-postgres.yaml              PostgreSQL 16 StatefulSet + initdb 挂载
├── 11-redis.yaml                 Redis 7.2 Deployment + PVC
├── 12-victoriametrics.yaml       VictoriaMetrics v1.101.0 Deployment + PVC
├── 13-opensearch.yaml            OpenSearch 2.17 StatefulSet（可选/重）
├── 14-storageclass.yaml          专用存储类 opsconsole-longhorn（Longhorn 单副本）
├── 20-backend.yaml               后端 Deployment（含 alertmanager+vmalert sidecar）+ Service
├── 22-static-rules-configmap.yaml vmalert 静态节点规则（等价于 deploy/vmalert-rules.yml）
├── 30-ingress.yaml               Ingress（可选，需集群已装 Ingress Controller）
├── make-init.sh                  生成 pg-init ConfigMap 的辅助脚本
├── README.md                     本文件
└── monitoring/
    ├── 00-k8s-monitoring.yaml    kube-state-metrics + node-exporter（采集上游）
    └── 01-vmagent.yaml           vmagent，remoteWrite 到集群内 VictoriaMetrics
```
