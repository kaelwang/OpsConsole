#!/usr/bin/env bash
# =============================================================================
# OpsConsole — 演示日志写入脚本
# -----------------------------------------------------------------------------
# 向 OpenSearch 的 logs-<租户ID> 索引批量写入示例日志，用于验证「日志检索」链路。
# 后端 /api/v1/logging/search 读取的正是 logs-<租户ID> 索引。
#
# 用法：
#   TENANT_ID=xxxx ./scripts/ingest-demo-logs.sh [数量]
#   ./scripts/ingest-demo-logs.sh            # 默认用 admin 租户 + 写入 20 条
#
# 前置：OpenSearch 已通过 docker compose 启动（端口 9200 可访问）。
# =============================================================================
set -euo pipefail

OS_URL="${OPS_OPENSEARCH_URL:-http://localhost:9200}"
TENANT_ID="${TENANT_ID:-11111111-1111-1111-1111-111111111111}"
COUNT="${1:-20}"

echo ">> OpenSearch: $OS_URL"
echo ">> 目标索引: logs-$TENANT_ID"

# 探活
if ! curl -s -m 8 "$OS_URL/_cluster/health" >/dev/null 2>&1; then
  echo "!! OpenSearch 不可达，请先 'docker compose up -d' 并确保 OPS_OPENSEARCH_URL 正确" >&2
  exit 1
fi

SERVICES=("api" "auth" "gateway" "scheduler" "billing")
LEVELS=("info" "info" "info" "warn" "error")
MESSAGES=(
  "request completed status=200"
  "user login success"
  "cache miss, loading from db"
  "high latency detected p99=850ms"
  "db connection timeout, retrying"
  "kafka consumer lag increasing"
  "payment processed ok"
  "config reloaded"
  "rate limit triggered for client"
  "pod restarted unexpectedly"
)

now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
i=0
while [ "$i" -lt "$COUNT" ]; do
  svc="${SERVICES[$((i % ${#SERVICES[@]}))]}"
  lvl="${LEVELS[$((i % ${#LEVELS[@]}))]}"
  msg="${MESSAGES[$((i % ${#MESSAGES[@]}))]}"
  ts=$(date -u -d "$now + ${i} minutes" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v+${i}M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "$now")

  doc=$(cat <<JSON
{"@timestamp":"$ts","level":"$lvl","service":"$svc","message":"$msg"}
JSON
)
  resp=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$OS_URL/logs-$TENANT_ID/_doc?refresh=wait_for" \
    -H 'Content-Type: application/json' \
    -d "$doc")
  if [ "$resp" != "201" ] && [ "$resp" != "200" ]; then
    echo "!! 写入失败 HTTP $resp，文档: $doc" >&2
    exit 1
  fi
  i=$((i + 1))
done

echo ">> 已写入 $COUNT 条示例日志到 logs-$TENANT_ID"
echo ">> 验证检索："
echo "   curl -s -H \"Authorization: Bearer \$TOKEN\" \"http://localhost:8080/api/v1/logging/search?q=error&limit=10\""
echo "   （或直接查 OpenSearch: curl -s \"$OS_URL/logs-$TENANT_ID/_search?q=level:error\" | head -c 300)"
