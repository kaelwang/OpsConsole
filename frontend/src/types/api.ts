/* ==========================================================================
   与后端 Go model 对齐的 TS 类型契约（字段命名与后端 JSON 一致）。
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
  refreshToken?: string;
  expiresIn: number;
  tenantId: string;
  role: RoleName;
}

/* ---------------- 监控告警 ---------------- */
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertStatus = 'firing' | 'resolved';

export interface AlertRule {
  id: string;
  tenantId: string;
  name: string;
  expr: string;
  forSeconds: number;
  severity: AlertSeverity;
  channelIds?: string[];
  createdBy?: string;
  createdAt: string;
}
export interface AlertRuleCreateRequest {
  name: string;
  expr: string;
  severity: AlertSeverity;
  forSeconds?: number;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  groupId?: string;
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
  target: string;
  createdAt: string;
}
export interface NotificationChannelCreateRequest {
  type: ChannelType;
  target: string;
}

/* ---------------- 日志 ---------------- */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
}

/* ---------------- 部署 / CI-CD ---------------- */
export type PipelineStatus = 'success' | 'failed' | 'running' | 'pending';
export interface Pipeline {
  id: number;
  name: string;
  ref: string;
  status: PipelineStatus;
  web_url: string;
  created_at?: string;
  updated_at?: string;
}
export type DeploymentStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'rolled_back';
export interface Deployment {
  id: string;
  tenantId: string;
  projectId: string;
  name: string;
  ref: string;
  status: DeploymentStatus;
  createdAt: string;
}

/* ---------------- 主机与 K8s ---------------- */
export interface Cluster {
  id: string;
  tenantId: string;
  name: string;
  provider: string;
  kubeconfigRef: string;
  createdAt: string;
  /** 前端聚合：节点数 */
  nodeCount?: number;
  /** 前端聚合：健康率 0-100 */
  health?: number;
}
export interface ClusterCreateRequest {
  name: string;
  provider?: string;
  kubeconfig?: string;
}
export interface Pod {
  name: string;
  namespace: string;
  status: string;
  node: string;
  age: string;
  restarts?: number;
  cpu?: number;
  memory?: number;
}
export type HostStatus = 'online' | 'offline' | 'unknown';
export interface Host {
  id: string;
  tenantId: string;
  clusterId: string;
  name: string;
  ip: string;
  os: string;
  status: HostStatus;
  createdAt: string;
}

/** 真实 K8s 节点的资源压力视图（CPU/内存为占 Allocatable 的百分比）。 */
export interface Node {
  name: string;
  status: string; // Ready / NotReady
  age: string;
  cpuPercent?: number;
  memoryPercent?: number;
  cpuUsed?: string;
  cpuTotal?: string;
  memUsed?: string;
  memTotal?: string;
  diskPressure?: boolean;
  memPressure?: boolean;
  pidPressure?: boolean;
  podCount: number;
  podCapacity: number;
}

/* ---------------- 审计 ---------------- */
export type AuditResult = 'success' | 'failure' | 'warning';
export interface AuditLog {
  id: string;
  tenantId: string;
  userId: string;
  action: string;
  resource: string;
  detail: string;
  ok: boolean;
  createdAt: string;
}

/* ---------------- RBAC ---------------- */
export interface RolePermission {
  role: RoleName;
  roleLabel: string;
  permissions: string[];
}
export interface MemberAssignment {
  tenantId?: string;
  userId: string;
  role: RoleName;
  displayName?: string;
  email?: string;
}

/* ---------------- 指标查询 ---------------- */
export interface MetricSeries {
  metric: Record<string, string>;
  values: Array<[number, string]>;
  value?: [number, string];
}
export interface QueryResult {
  status: 'success' | 'error';
  data?: {
    resultType: string;
    result: MetricSeries[];
  };
  error?: string;
}
