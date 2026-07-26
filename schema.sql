-- =============================================================================
-- 企业运维控制台 (OpsConsole) — PostgreSQL 16 Schema
-- 多租户隔离：RLS (Row-Level Security) + session GUC (app.tenant_id / app.role)
-- -----------------------------------------------------------------------------
-- 设计说明（架构师决策）：
--   SPEC §6 表述“所有业务表含 tenant_id”，但 tenants / users / roles 属平台级
--   全局引用表（被多租户共享，不应带 tenant_id），故本 schema 仅对“租户作用域表”
--   施加 tenant_id NOT NULL + RLS。全局表不挂 RLS，由应用层按 JWT 全局角色管控。
--
--   租户作用域表（7 张，含 tenant_id + RLS）：
--     tenant_memberships, clusters, alert_rules, notification_channels,
--     hosts, deployments, audit_logs
--   全局表（3 张，无 tenant_id，无 RLS）：
--     tenants, users, roles
--
-- RLS 租户上下文注入（由 Go 中间件在连接上执行，见下“租户上下文”注释）：
--   SET app.tenant_id = '<uuid>';   -- 来自 JWT 的租户声明
--   SET app.role      = '<role>';   -- 来自 JWT 的角色声明
-- 当前实现在 pgxpool 连接获取后（AfterConnect / 每请求 SET LOCAL）设置，
-- 确保 current_setting('app.tenant_id') 在查询时有效。
-- =============================================================================

-- 兼容 gen_random_uuid()（PG13+ 已内置，此处防御性启用）
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- 枚举类型（原生 enum，保证值域约束）
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('platform_admin', 'owner', 'admin', 'member', 'viewer');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'channel_type') THEN
    CREATE TYPE channel_type AS ENUM ('email', 'webhook', 'wecom', 'dingtalk', 'feishu');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_severity') THEN
    CREATE TYPE alert_severity AS ENUM ('info', 'warning', 'critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deployment_status') THEN
    CREATE TYPE deployment_status AS ENUM ('pending', 'running', 'success', 'failed', 'rolled_back');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'host_status') THEN
    CREATE TYPE host_status AS ENUM ('online', 'offline', 'unknown');
  END IF;
END$$;

-- =============================================================================
-- 全局引用表（无 tenant_id，无 RLS）
-- =============================================================================

-- 租户
CREATE TABLE tenants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 用户（平台级，跨租户通过 tenant_memberships 关联）
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 角色定义（平台级全局，预置 5 角色；permissions 为 resource:action 列表）
CREATE TABLE roles (
  name        text PRIMARY KEY,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 租户作用域表（tenant_id uuid NOT NULL + RLS）
-- =============================================================================

-- 租户成员关系
CREATE TABLE tenant_memberships (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  role      user_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

-- 集群注册（kubeconfig 以 secret 引用形式存储，不落明文）
CREATE TABLE clusters (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  kubeconfig_ref text NOT NULL,
  sa_name       text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_clusters_tenant ON clusters(tenant_id);

-- 告警规则
CREATE TABLE alert_rules (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expr       text NOT NULL,
  "for"      text NOT NULL DEFAULT '5m',                 -- SQL 保留字，使用引号标识符
  severity   alert_severity NOT NULL DEFAULT 'warning',
  channel_ids jsonb NOT NULL DEFAULT '[]'::jsonb,        -- 关联 notification_channels.id 数组
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_alert_rules_tenant ON alert_rules(tenant_id);

-- 通知渠道配置
CREATE TABLE notification_channels (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type       channel_type NOT NULL,
  config     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notification_channels_tenant ON notification_channels(tenant_id);

-- 主机纳管
CREATE TABLE hosts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ip         inet NOT NULL,
  ssh_ref    text NOT NULL,
  os         text,
  status     host_status NOT NULL DEFAULT 'unknown',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hosts_tenant ON hosts(tenant_id);

-- 部署记录
CREATE TABLE deployments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pipeline_id text NOT NULL,
  version     text NOT NULL,
  status      deployment_status NOT NULL DEFAULT 'pending',
  created_by  uuid NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_deployments_tenant ON deployments(tenant_id);
-- 回滚查询：按租户 + 流水线 + 时间倒序取历史版本
CREATE INDEX idx_deployments_tenant_pipeline ON deployments(tenant_id, pipeline_id, created_at DESC);

-- 审计日志（普通用户无 DELETE 权限，见 GRANT 段）
CREATE TABLE audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_id        uuid NOT NULL REFERENCES users(id),
  impersonated_as text,                                   -- K8s impersonation 身份（可空）
  action          text NOT NULL,                          -- 如 'deployment:trigger'
  object          text NOT NULL,                          -- 目标对象标识
  result          text NOT NULL DEFAULT 'success',        -- success / failure
  created_at      timestamptz NOT NULL DEFAULT now()
);
-- SPEC §6 索引：IDX(tenant_id, actor_id, created_at)；复合索引前缀已覆盖 tenant_id 单列查询
CREATE INDEX idx_audit_logs_lookup ON audit_logs(tenant_id, actor_id, created_at DESC);

-- =============================================================================
-- RLS：租户强制隔离
-- -----------------------------------------------------------------------------
-- 策略同时支持：(a) 租户匹配  (b) platform_admin 跨租户越权查看（运维/合规场景）。
-- 当 app.tenant_id 未设置时 current_setting(..., true) 返回 NULL，
--   tenant_id = NULL 求值为 NULL(即 false)，默认拒绝（default-deny）。
-- 应用连接使用最小权限角色 opsconsole_app（非表属主），RLS 自动生效。
-- =============================================================================
ALTER TABLE tenant_memberships      ENABLE ROW LEVEL SECURITY;
ALTER TABLE clusters                ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules             ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_channels   ENABLE ROW LEVEL SECURITY;
ALTER TABLE hosts                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs              ENABLE ROW LEVEL SECURITY;

-- 防御性：即便以属主身份执行也强制 RLS（开发/排障场景）
ALTER TABLE tenant_memberships      FORCE ROW LEVEL SECURITY;
ALTER TABLE clusters                FORCE ROW LEVEL SECURITY;
ALTER TABLE alert_rules             FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_channels   FORCE ROW LEVEL SECURITY;
ALTER TABLE hosts                   FORCE ROW LEVEL SECURITY;
ALTER TABLE deployments             FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs              FORCE ROW LEVEL SECURITY;

-- 统一隔离策略：租户匹配 或 platform_admin 越权
CREATE POLICY tenant_isolation ON tenant_memberships
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid
         OR current_setting('app.role', true) = 'platform_admin')
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid
         OR current_setting('app.role', true) = 'platform_admin');

CREATE POLICY tenant_isolation ON clusters
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid
         OR current_setting('app.role', true) = 'platform_admin')
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid
         OR current_setting('app.role', true) = 'platform_admin');

CREATE POLICY tenant_isolation ON alert_rules
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid
         OR current_setting('app.role', true) = 'platform_admin')
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid
         OR current_setting('app.role', true) = 'platform_admin');

CREATE POLICY tenant_isolation ON notification_channels
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid
         OR current_setting('app.role', true) = 'platform_admin')
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid
         OR current_setting('app.role', true) = 'platform_admin');

CREATE POLICY tenant_isolation ON hosts
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid
         OR current_setting('app.role', true) = 'platform_admin')
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid
         OR current_setting('app.role', true) = 'platform_admin');

CREATE POLICY tenant_isolation ON deployments
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid
         OR current_setting('app.role', true) = 'platform_admin')
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid
         OR current_setting('app.role', true) = 'platform_admin');

-- audit_logs：审计只增可查，禁止普通用户/应用删除（满足 AC-04 防篡改）
CREATE POLICY tenant_isolation ON audit_logs
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid
         OR current_setting('app.role', true) = 'platform_admin')
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid
         OR current_setting('app.role', true) = 'platform_admin');

-- =============================================================================
-- 角色预置（RBAC 枚举，参考 SPEC §5）
--   权限维度：monitoring:* / logging:read / deployment:* / infrastructure:* /
--             rbac:* / audit:read / tenant:manage
-- =============================================================================
INSERT INTO roles (name, permissions, description) VALUES
  ('platform_admin',
   '["monitoring:read","monitoring:write","logging:read","deployment:read","deployment:trigger","deployment:rollback","infrastructure:read","infrastructure:exec","rbac:read","rbac:assign","audit:read","tenant:manage"]'::jsonb,
   '平台超级管理员，跨租户全局管控'),
  ('owner',
   '["monitoring:read","monitoring:write","logging:read","deployment:read","deployment:trigger","deployment:rollback","infrastructure:read","infrastructure:exec","rbac:read","rbac:assign","audit:read","tenant:manage"]'::jsonb,
   '租户所有者，租户内完全控制'),
  ('admin',
   '["monitoring:read","monitoring:write","logging:read","deployment:read","deployment:trigger","deployment:rollback","infrastructure:read","infrastructure:exec","rbac:read","rbac:assign","audit:read"]'::jsonb,
   '租户管理员，可配规则/通知/触发部署/分配角色'),
  ('member',
   '["monitoring:read","logging:read","deployment:read","deployment:trigger","deployment:rollback","infrastructure:read","infrastructure:exec","audit:read"]'::jsonb,
   '成员，可触发/回滚部署与执行 K8s 操作，不可改配置'),
  ('viewer',
   '["monitoring:read","logging:read","deployment:read","infrastructure:read","audit:read"]'::jsonb,
   '只读，无写权限（越权写将被 403 拦截，AC-03）')
ON CONFLICT (name) DO UPDATE
  SET permissions = EXCLUDED.permissions,
      description = EXCLUDED.description;

-- =============================================================================
-- 应用最小权限角色（开发单节点用，生产应改用密钥管理）
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opsconsole_app') THEN
    CREATE ROLE opsconsole_app LOGIN PASSWORD 'opsconsole_dev';   -- 仅 MVP 开发用，生产替换为密钥
  END IF;
END$$;

GRANT USAGE ON SCHEMA public TO opsconsole_app;

-- 租户作用域可写表：增删改查
GRANT SELECT, INSERT, UPDATE, DELETE
  ON clusters, alert_rules, notification_channels, hosts, deployments
  TO opsconsole_app;

-- 全局引用表：读 + 写（注册用户/租户/成员关系），通常无需删除
GRANT SELECT, INSERT, UPDATE
  ON users, tenants, tenant_memberships, roles
  TO opsconsole_app;

-- 审计日志：仅查 + 增（INSERT 由系统落审计），严禁 DELETE / UPDATE（AC-04 防篡改）
GRANT SELECT, INSERT ON audit_logs TO opsconsole_app;
REVOKE DELETE, UPDATE ON audit_logs FROM opsconsole_app;

-- 租户上下文 GUC 说明（由 Go 中间件在连接上执行，示例）：
--   SET app.tenant_id = 'b3e1f0a0-...';   -- 来自 JWT tenant 声明
--   SET app.role      = 'admin';          -- 来自 JWT role 声明
-- 建议在 pgxpool 的 AfterConnect 钩子或每请求事务内 SET LOCAL 设置，
-- 确保 RLS 策略的 current_setting('app.tenant_id') 在查询时有效。
