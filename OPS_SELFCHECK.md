# OpsConsole 运维自检报告（DevOps Self-Check）

生成环境：沙箱内无 docker / kubectl / helm（均不可用），Go 1.26 + 受管 Python 3.13 可用。
本环境**未执行**镜像构建与集群部署，仅做语法与结构校验。

## 1. 后端 Go 构建阶段（实跑）
- 命令：`go vet ./...` 于 `backend/`
- 结果：**通过（退出码 0）**，与 `backend/Dockerfile` 的 `go build ./cmd/api-server` 指令一致。
- 说明：本机工具链为 Go 1.26，Dockerfile 锁定 `golang:1.22` 构建，二者均满足 Spec 锁定的 Go 1.22 源码兼容。

## 2. YAML 语法校验（受管 Python `yaml.safe_load`）
校验脚本：`_validate_yaml.py`

| 文件 | 结果 |
|------|------|
| chart/Chart.yaml | PASS |
| chart/values.yaml | PASS |
| docker-compose.yml | PASS |
| .gitlab-ci.yml | PASS |
| chart/templates/configmap.yaml | PASS |
| chart/templates/secret.yaml | PASS |
| chart/templates/backend-deployment.yaml | PASS |
| chart/templates/backend-service.yaml | PASS |
| chart/templates/backend-ingress.yaml | PASS |
| chart/templates/frontend-deployment.yaml | PASS |
| chart/templates/frontend-service.yaml | PASS |
| chart/templates/frontend-ingress.yaml | PASS |

Helm 模板含 Go template 指令 `{{ }}`，纯 `yaml.safe_load` 无法直接解析；
脚本先剥离整行模板指令并将行内 `{{ }}` 替换为占位符，再做结构解析，全部通过。

## 3. Helm 模板值引用校验
校验脚本：`_check_values_refs.py`
- 扫描 `chart/templates/*.yaml` 中全部 `.Values.*` 引用，共 **45 处**。
- 结果：全部可在 `chart/values.yaml` 中解析（无路径拼写错误）。

## 4. 已知无法在本环境验证项（需具备 Docker/K8s 的环境实跑）
- `docker build` 后端 / 前端镜像（多阶段、镜像体积 <30MB 目标）。
- `helm lint` / `helm template` / `helm install` 渲染与部署。
- `kubectl apply` / ArgoCD sync 实际集群行为。
- GitLab CI 流水线真实执行（test/build/deploy 各阶段）。

## 5. 一致性核对
- 环境变量采用与编译后二进制一致的 `OPS_PORT`（任务简报写作 `OPS_SERVER_PORT`，
  实际读取见 `backend/internal/config/config.go:22`）。
- 镜像版本 / 技术栈与 Spec §4 锁定一致：Go 1.22、React 18.3.1、Vite 5、AntD 5.21、
  lucide-react 0.439.0、PG 16、Redis 7.2、VM 1.101、OpenSearch 2.17、K8s 1.31、
  Helm 3.15+、ArgoCD 2.12+。
- 全部交付物零 emoji（符合 P0 红线）。
