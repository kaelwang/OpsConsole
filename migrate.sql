-- =============================================================================
-- OpsConsole — 一次性迁移：将运行中的数据库结构对齐到 Go 模型
-- -----------------------------------------------------------------------------
-- schema.sql 与实现（Go model / repository）曾发生漂移，本文件修正运行库，
-- 使其与修正后的 schema.sql 一致。可重复执行（已做存在性判断）。
-- 前提：租户作用域表当前为空（演示/初装阶段）。
-- =============================================================================

-- hosts: 新增 name / cluster_id
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS cluster_id text NOT NULL DEFAULT '';
-- hosts.ip 由 inet 改为 text，便于与 Go string 直接映射
ALTER TABLE hosts ALTER COLUMN ip TYPE text USING ip::text;

-- clusters: 新增 provider 列
ALTER TABLE clusters ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT '';

-- alert_rules: 新增 name / for_seconds，删除 "for"（保留字），created_by 改为可空
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS for_seconds integer NOT NULL DEFAULT 300;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='alert_rules' AND column_name='for') THEN
    ALTER TABLE alert_rules DROP COLUMN "for";
  END IF;
END $$;
ALTER TABLE alert_rules ALTER COLUMN created_by DROP NOT NULL;

-- notification_channels: 新增 target（替代 config）
ALTER TABLE notification_channels ADD COLUMN IF NOT EXISTS target text NOT NULL DEFAULT '';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notification_channels' AND column_name='config') THEN
    ALTER TABLE notification_channels DROP COLUMN config;
  END IF;
END $$;

-- deployments: pipeline_id -> project_id，删除 version，新增 name / ref，created_by 可空
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='deployments' AND column_name='pipeline_id') THEN
    ALTER TABLE deployments RENAME COLUMN pipeline_id TO project_id;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='deployments' AND column_name='version') THEN
    ALTER TABLE deployments DROP COLUMN version;
  END IF;
END $$;
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS ref text NOT NULL DEFAULT '';
ALTER TABLE deployments ALTER COLUMN created_by DROP NOT NULL;

-- audit_logs: actor_id -> user_id，object -> resource，新增 detail / ok
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='actor_id') THEN
    ALTER TABLE audit_logs RENAME COLUMN actor_id TO user_id;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='object') THEN
    ALTER TABLE audit_logs RENAME COLUMN object TO resource;
  END IF;
END $$;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS detail text NOT NULL DEFAULT '';
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ok boolean NOT NULL DEFAULT true;
