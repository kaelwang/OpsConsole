/* ==========================================================================
   由 openapi.yaml 生成的 TS 类型契约（前后端唯一依据 spec-as-contract）
   字段命名与后端 JSON 保持一致（camelCase）。
   ========================================================================== */

/** 统一响应体外壳：{ code, data, message } */
export interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

/** 分页外壳 */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/** 全局 / 租户角色 */
export type RoleName =
  | 'platform_admin'
  | 'owner'
  | 'admin'
  | 'member'
  | 'viewer';

/* ---------------- 认证 ---------------- */
export interface LoginRequest {
  email: string;
  password: string;
}
export interface TokenResponse {
  accessToken: string;
  expiresIn: number;
  tenantId: string;
  role: RoleName;
}

/* ---------------- 监控告警 ---------------- */
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertStatus = 'firing' | 'resolved';

export interface AlertRule {
  id: string;
  expr: string;
  for: string;
  severity: AlertSeverity;
  channelIds: string[];
  createdBy: string;
  createdAt: string;
}
export interface AlertRuleCreateRequest {
  expr: string;
  for?: string;
  severity: AlertSeverity;
  channelIds?: string[];
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  severity: AlertSeverity;
  status: AlertStatus;
  firedAt: string;
  summary: string;
  labels: Record<string, string>;
}

export type ChannelType = 'email' | 'webhook' | 'wecom' | 'dingtalk' | 'feishu';
export interface NotificationChannel {
  id: string;
  tenantId: string;
  type: ChannelType;
  config: Record<string, unknown>;
  createdAt: string;
}
export interface NotificationChannelCreateRequest {
  type: ChannelType;
  config: Record<string, unknown>;
}

/* ---------------- 日志 ---------------- */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  pod?: string;
}

/* ---------------- 部署 / CI-CD ---------------- */
export type PipelineStatus = 'success' | 'failed' | 'running' | 'pending';
export interface Pipeline {
  id: string;
  name: string;
  status: PipelineStatus;
  lastRunAt: string;
  branch?: string;
  version?: string;
  env?: string;
  durationSec?: number;
}
export type DeploymentStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'rolled_back';
export interface Deployment {
  id: string;
  pipelineId: string;
  version: string;
  status: DeploymentStatus;
  createdBy: string;
  createdAt: string;
}
export interface RollbackRequest {
  targetVersion?: string;
}

/** 流水线执行的步骤节点（前端聚合用于时间线） */
export interface PipelineStage {
  name: string;
  status: PipelineStatus;
  durationSec: number;
  startedAt: string;
}

/* ---------------- 主机与 K8s ---------------- */
export interface Cluster {
  id: string;
  name: string;
  kubeconfigRef: string;
  saName: string;
  createdAt: string;
  /** 前端聚合：节点数 */
  nodeCount?: number;
  /** 前端聚合：健康率 0-100 */
  health?: number;
}
export interface ClusterCreateRequest {
  name: string;
  kubeconfigRef: string;
  saName: string;
}
export interface Pod {
  name: string;
  namespace: string;
  status: string;
  node: string;
  restarts: number;
  age: string;
  cpu?: number;
  memory?: number;
}
export type HostStatus = 'online' | 'offline' | 'unknown';
export interface Host {
  id: string;
  ip: string;
  os: string;
  status: HostStatus;
  createdAt: string;
  cpu?: number;
  memory?: number;
}

/* ---------------- 审计 ---------------- */
export type AuditResult = 'success' | 'failure' | 'warning';
export interface AuditLog {
  id: string;
  tenantId: string;
  actorId: string;
  actorName: string;
  impersonatedAs?: string;
  action: string;
  object: string;
  result: AuditResult;
  createdAt: string;
  ip?: string;
  userAgent?: string;
  before?: string;
  after?: string;
}

/* ---------------- RBAC ---------------- */
export interface RolePermission {
  role: RoleName;
  roleLabel: string;
  permissions: string[];
}
export interface MemberAssignment {
  userId: string;
  displayName: string;
  email: string;
  role: RoleName;
  team: string;
}

/* ---------------- 指标查询 ---------------- */
export interface MetricSeries {
  metric: Record<string, string>;
  values: Array<[number, string]>;
}
export interface QueryResult {
  status: 'success' | 'error';
  data?: {
    resultType: string;
    result: MetricSeries[];
  };
  error?: string;
}
