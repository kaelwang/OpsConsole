-- =============================================================================
-- OpsConsole — PostgreSQL 种子数据（真实场景，非演示内存）
-- -----------------------------------------------------------------------------
-- 在 schema.sql（结构 / RLS / 角色）之后执行；首次初始化由 docker-compose 挂载
-- 为 02-seed.sql。所有 INSERT 均幂等（ON CONFLICT DO NOTHING），可重复执行。
--
-- 默认账号：
--   admin@corp.com  / opsconsole123   (owner)
--   viewer@corp.com / opsconsole123   (viewer)
-- =============================================================================

-- 租户（固定 UUID，便于审计与跨环境追踪）
INSERT INTO tenants (id, name, created_at, updated_at) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Acme Corp', now(), now())
ON CONFLICT (id) DO NOTHING;

-- 用户
INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at) VALUES
  ('33333333-3333-3333-3333-333333333333', 'admin@corp.com',
   '$2a$10$R09DP9l2bELLcMhU4a7apeKTk6FqMMlBhozzaI0Tg7bdGq1l0pSlC', 'Admin', now(), now()),
  ('44444444-4444-4444-4444-444444444444', 'viewer@corp.com',
   '$2a$10$R09DP9l2bELLcMhU4a7apeKTk6FqMMlBhozzaI0Tg7bdGq1l0pSlC', 'Viewer', now(), now())
ON CONFLICT (email) DO NOTHING;

-- 租户成员关系
INSERT INTO tenant_memberships (tenant_id, user_id, role, created_at) VALUES
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'owner', now()),
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'viewer', now())
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- 集群（kubeconfig_ref / sa_name 为 secret 引用，不落明文）
INSERT INTO clusters (id, tenant_id, name, provider, kubeconfig_ref, sa_name, created_at, updated_at) VALUES
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   'prod-cluster', 'eks', 'secret://kubeconfig/prod-cluster', 'opsconsole-sa', now(), now())
ON CONFLICT (id) DO NOTHING;

-- 主机纳管
INSERT INTO hosts (id, tenant_id, cluster_id, name, ip, ssh_ref, os, status, created_at, updated_at) VALUES
  ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222', 'node-1', '10.0.0.11', 'secret://ssh/node-1', 'ubuntu 22.04', 'online', now(), now()),
  ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222', 'node-2', '10.0.0.12', 'secret://ssh/node-2', 'ubuntu 22.04', 'online', now(), now())
ON CONFLICT (id) DO NOTHING;

-- 通知渠道
INSERT INTO notification_channels (id, tenant_id, type, target, created_at, updated_at) VALUES
  ('77777777-7777-7777-7777-777777777777', '11111111-1111-1111-1111-111111111111',
   'email', 'oncall@corp.com', now(), now())
ON CONFLICT (id) DO NOTHING;

-- 告警规则
INSERT INTO alert_rules (id, tenant_id, name, expr, for_seconds, severity, channel_ids, created_by, created_at, updated_at) VALUES
  ('88888888-8888-8888-8888-888888888888', '11111111-1111-1111-1111-111111111111',
   'High CPU', 'cpu_usage > 80', 300, 'warning',
   '["77777777-7777-7777-7777-777777777777"]'::jsonb,
   '33333333-3333-3333-3333-333333333333', now(), now()),
  ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111',
   'High Memory', 'memory_usage > 90', 120, 'critical',
   '["77777777-7777-7777-7777-777777777777"]'::jsonb,
   '33333333-3333-3333-3333-333333333333', now(), now())
ON CONFLICT (id) DO NOTHING;

-- 部署记录
INSERT INTO deployments (id, tenant_id, project_id, name, ref, status, created_at, updated_at) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   'web-platform', 'web', 'main', 'success', now(), now())
ON CONFLICT (id) DO NOTHING;
