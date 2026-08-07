#!/usr/bin/env bash
# 把仓库根的 schema.sql / seed.sql 做成 ConfigMap，供 Postgres 首次启动初始化。
# 用法：bash deploy/k8s/make-init.sh
set -euo pipefail
cd "$(dirname "$0")/../.."   # 回到仓库根
kubectl -n opsconsole create configmap opsconsole-pg-init \
  --from-file=01-schema.sql=./schema.sql \
  --from-file=02-seed.sql=./seed.sql \
  --dry-run=client -o yaml | kubectl apply -f -
echo "created configmap/opsconsole-pg-init"
