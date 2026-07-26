# =============================================================================
# 企业运维控制台 (OpsConsole) — Makefile
# -----------------------------------------------------------------------------
# 交叉编译后端 Go 二进制（静态链接、可复现、裁剪符号）。
# 前端 SPA 在构建时被嵌入二进制（Go embed），实现「一个二进制启动前后端」。
# Go 模块位于 backend/ 目录，因此构建命令均在该目录下执行。
# 模块: github.com/opsconsole/backend
# 入口: ./cmd/api-server
# 产物: bin/opsconsole-server-<os>-<arch>
#
# 常用目标:
#   make linux-amd   构建 linux/amd64 二进制（已内嵌前端，bin/opsconsole-server-linux-amd64）
#   make linux-arm   构建 linux/arm64 二进制（已内嵌前端，bin/opsconsole-server-linux-arm64）
#   make build       构建当前平台的二进制（已内嵌前端）
#   make frontend    仅构建前端并把 dist 拷入后端 embed 目录
#   make clean       清理 bin/ 与后端 embed 目录
# =============================================================================

# ---- 可覆盖的变量 ----
BINARY      ?= opsconsole-server
PKG         := github.com/opsconsole/backend
CMD         := ./cmd/api-server
BUILD_DIR   ?= bin

# Go 模块所在目录（go.mod 位置），构建需在此目录执行
BACKEND_DIR ?= backend

# 前端相关路径
FRONTEND_DIR ?= frontend
# 后端 embed 目录（须为后端包源码所在目录的子目录，见 backend/cmd/api-server/web.go）
WEB_EMBED_DIR := backend/cmd/api-server/web/dist

GO          ?= go
GOOS        ?= $(shell $(GO) env GOOS)
GOARCH      ?= $(shell $(GO) env GOARCH)

# 静态、可复现、裁剪符号（与 Dockerfile 一致：CGO_ENABLED=0）
CGO_ENABLED ?= 0
LDFLAGS     := -s -w
GOFLAGS     := -trimpath

# 前端构建时关闭 mock，API 走相对路径 /api/v1（由后端同源托管）
VITE_USE_MOCK  ?= false
VITE_API_BASE  ?= /api/v1
NPM            ?= npm

# ---- 派生变量 ----
OUT := $(BUILD_DIR)/$(BINARY)-$(GOOS)-$(GOARCH)

.PHONY: all build linux-amd linux-arm frontend clean

all: build

# 构建前端 SPA 并拷入后端 embed 目录。
# 已存在且非空则跳过，避免重复 npm 安装/打包。
frontend:
	@if [ ! -d "$(WEB_EMBED_DIR)" ] || [ -z "$$(ls -A $(WEB_EMBED_DIR) 2>/dev/null)" ]; then \
		echo ">> building frontend SPA ..."; \
		cd $(FRONTEND_DIR) && $(NPM) ci && \
		VITE_USE_MOCK=$(VITE_USE_MOCK) VITE_API_BASE=$(VITE_API_BASE) $(NPM) run build && \
		cd .. && \
		rm -rf $(WEB_EMBED_DIR) && mkdir -p $(WEB_EMBED_DIR) && \
		cp -r $(FRONTEND_DIR)/dist/. $(WEB_EMBED_DIR)/ ; \
	else \
		echo ">> frontend assets already embedded at $(WEB_EMBED_DIR), skip"; \
	fi

# 当前平台构建（内嵌前端）。go build 须在 backend/ 模块目录执行，
# 产物输出到仓库根的 $(BUILD_DIR)。
build: frontend
	cd $(BACKEND_DIR) && CGO_ENABLED=$(CGO_ENABLED) GOOS=$(GOOS) GOARCH=$(GOARCH) \
		$(GO) build -trimpath -ldflags="$(LDFLAGS)" -o ../$(OUT) $(CMD)

# linux/amd64（内嵌前端）
linux-amd: frontend
	cd $(BACKEND_DIR) && CGO_ENABLED=$(CGO_ENABLED) GOOS=linux GOARCH=amd64 \
		$(GO) build -trimpath -ldflags="$(LDFLAGS)" -o ../$(BUILD_DIR)/$(BINARY)-linux-amd64 $(CMD)

# linux/arm64（内嵌前端）
linux-arm: frontend
	cd $(BACKEND_DIR) && CGO_ENABLED=$(CGO_ENABLED) GOOS=linux GOARCH=arm64 \
		$(GO) build -trimpath -ldflags="$(LDFLAGS)" -o ../$(BUILD_DIR)/$(BINARY)-linux-arm64 $(CMD)

clean:
	rm -rf $(BUILD_DIR)
	rm -rf $(WEB_EMBED_DIR)
