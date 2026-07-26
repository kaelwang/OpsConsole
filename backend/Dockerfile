# syntax=docker/dockerfile:1
# =============================================================================
# OpsConsole Backend - multi-stage build
# -----------------------------------------------------------------------------
# Go 1.22 (CGO_ENABLED=0, fully static) -> alpine (non-root, ~12MB runtime)
# Spec lock: Go 1.22.x / PostgreSQL 16 / Redis 7.2 / VictoriaMetrics /
#            OpenSearch 2.17 / K8s 1.31 (client-go v0.31)
# Binary: opsconsole-server  (entry: ./cmd/api-server)
# Listen: :OPS_PORT (default 8080, binds all interfaces)
# Health: GET /healthz
# NOTE: image is not built in this sandbox (no docker); build command and
#       structure are validated only.
# =============================================================================

# ---- build stage ----
FROM golang:1.22-alpine AS builder

# git for module fetch; ca-certificates for HTTPS to external services during build
RUN apk add --no-cache git ca-certificates

WORKDIR /src

# Cache module downloads (layer only re-built when go.mod/go.sum change)
COPY go.mod go.sum ./
RUN go mod download

# Source
COPY . .

# Static, reproducible, stripped binary.
# CGO_ENABLED=0 avoids any libc dependency so distroless/alpine can run it.
ENV CGO_ENABLED=0 GOOS=linux GOARCH=amd64
RUN go build -trimpath -ldflags="-s -w" -o /out/opsconsole-server ./cmd/api-server

# ---- runtime stage ----
FROM alpine:3.20

# Non-root user + minimal CA certs / tzdata (external HTTPS calls + correct logs)
RUN addgroup -S opsconsole \
    && adduser -S opsconsole -G opsconsole \
    && apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=builder /out/opsconsole-server /app/opsconsole-server

USER opsconsole

# Defaults; override via orchestrator (docker-compose / k8s / helm).
ENV OPS_PORT=8080 \
    OPS_REPOSITORY_MODE=memory \
    OPS_JWT_SECRET=dev-insecure-secret-change-me

EXPOSE 8080

# Liveness probe: backend exposes GET /healthz.
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -q -O- "http://127.0.0.1:${OPS_PORT:-8080}/healthz" >/dev/null 2>&1 || exit 1

# Exec form (no shell wrapper).
ENTRYPOINT ["/app/opsconsole-server"]
