# syntax=docker/dockerfile:1
# =============================================================================
# OpsConsole Frontend - multi-stage build
# -----------------------------------------------------------------------------
# node 20 build (Vite 5 / React 18.3.1 / AntD 5 / lucide-react 0.439.0)
#   -> nginx:alpine serves the static SPA with history-API fallback.
# Spec lock: React 18.3.1 / Vite 5 / Ant Design 5.21 / lucide-react 0.439.0
# IMPORTANT: Vite embeds VITE_* at BUILD time (not runtime). They are set here
#            so the production image talks to the real backend, not the mock.
# NOTE: image is not built in this sandbox (no docker); build command and
#       structure are validated only.
# =============================================================================

# ---- build stage ----
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Production build: disable mock, point UI at relative /api/v1
# (the ingress / frontend nginx proxies /api to the backend service).
ENV VITE_USE_MOCK=false
ENV VITE_API_BASE=/api/v1

RUN npm run build

# ---- runtime stage ----
FROM nginx:alpine

# SPA fallback + /api reverse proxy to the backend service.
# The backend Service is named "opsconsole-backend" (see chart); keep that name
# stable so this baked proxy resolves inside the cluster.
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -q -O- "http://127.0.0.1:8080/" >/dev/null 2>&1 || exit 1

# nginx:alpine runs the master as root and workers drop to the "nginx" user.
