/* ==========================================================================
   Mock 适配器数据层 — 贴近真实的假数据，使 UI 在无后端时也能渲染、可演示。
   仅当 VITE_USE_MOCK=true 时由各域 API 调用。真实后端就绪后切 false 即走 axios。
   ========================================================================== */
import type {
  AlertEvent,
  AlertRule,
  AuditLog,
  Cluster,
  Deployment,
  Host,
  LogEntry,
  LogLevel,
  MemberAssignment,
  NotificationChannel,
  Pipeline,
  Pod,
  QueryResult,
  RolePermission,
  TokenResponse,
} from '@/types/api';

export const delay = (ms = 240) =>
  new Promise<void>((r) => setTimeout(r, ms));

let _seq = 1000;
export const uid = (p = 'id') => `${p}-${(_seq++).toString(36)}`;
export const iso = (minutesAgo: number) =>
  new Date(Date.now() - minutesAgo * 60000).toISOString();

/* ---------------- 集群 ---------------- */
export const clusters: Cluster[] = [
  { id: 'cls-prod-sh', name: 'prod-shanghai', kubeconfigRef: 'secret://vault/k8s/prod-sh', saName: 'ops-impersonator', createdAt: iso(60 * 24 * 90), nodeCount: 12, health: 92 },
  { id: 'cls-stg-bj', name: 'staging-beijing', kubeconfigRef: 'secret://vault/k8s/stg-bj', saName: 'ops-impersonator', createdAt: iso(60 * 24 * 60), nodeCount: 6, health: 100 },
  { id: 'cls-edge-sz', name: 'edge-shenzhen', kubeconfigRef: 'secret://vault/k8s/edge-sz', saName: 'ops-impersonator', createdAt: iso(60 * 24 * 20), nodeCount: 4, health: 75 },
];

const NODES = ['node-a1', 'node-a2', 'node-b1', 'node-b2', 'node-c1', 'node-c2'];
const NAMESPACES = ['default', 'kube-system', 'monitoring', 'app-gateway', 'order-service'];
const POD_STATUS = ['Running', 'Running', 'Running', 'Running', 'Running', 'CrashLoopBackOff', 'Pending', 'Completed'];

export function mockPods(clusterId: string): Pod[] {
  const n = clusterId === 'cls-prod-sh' ? 18 : clusterId === 'cls-stg-bj' ? 11 : 7;
  const pods: Pod[] = [];
  for (let i = 0; i < n; i++) {
    const ns = NAMESPACES[i % NAMESPACES.length];
    const status = POD_STATUS[i % POD_STATUS.length];
    pods.push({
      name: `${ns.split('-')[0] ?? ns}-${uid('pod').slice(0, 6)}`,
      namespace: ns,
      status,
      node: NODES[i % NODES.length],
      restarts: status === 'CrashLoopBackOff' ? 7 + (i % 5) : i % 3,
      age: `${i + 1}d${(i * 3) % 23}h`,
      cpu: Math.round(20 + ((i * 37) % 70)),
      memory: Math.round(30 + ((i * 53) % 60)),
    });
  }
  return pods;
}

export const hosts: Host[] = [
  { id: uid('host'), ip: '10.20.1.11', os: 'Ubuntu 22.04', status: 'online', createdAt: iso(60 * 24 * 80), cpu: 41, memory: 58 },
  { id: uid('host'), ip: '10.20.1.12', os: 'Ubuntu 22.04', status: 'online', createdAt: iso(60 * 24 * 80), cpu: 33, memory: 61 },
  { id: uid('host'), ip: '10.20.2.21', os: 'CentOS 7.9', status: 'offline', createdAt: iso(60 * 24 * 40), cpu: 0, memory: 0 },
  { id: uid('host'), ip: '10.20.3.31', os: 'Ubuntu 20.04', status: 'online', createdAt: iso(60 * 24 * 15), cpu: 52, memory: 47 },
];

/* ---------------- 流水线 / 部署 ---------------- */
export const pipelines: Pipeline[] = [
  { id: 'pl-api', name: 'api-gateway', status: 'success', lastRunAt: iso(42), branch: 'main', version: 'v2.4.1', env: 'prod', durationSec: 214 },
  { id: 'pl-web', name: 'web-portal', status: 'running', lastRunAt: iso(8), branch: 'main', version: 'v3.1.0', env: 'prod', durationSec: 96 },
  { id: 'pl-order', name: 'order-service', status: 'failed', lastRunAt: iso(73), branch: 'release/2.3', version: 'v2.3.4', env: 'prod', durationSec: 318 },
  { id: 'pl-auth', name: 'auth-service', status: 'success', lastRunAt: iso(180), branch: 'main', version: 'v1.9.2', env: 'staging', durationSec: 142 },
  { id: 'pl-data', name: 'data-pipeline', status: 'success', lastRunAt: iso(310), branch: 'main', version: 'v0.8.7', env: 'prod', durationSec: 540 },
];

export function mockDeployments(): Deployment[] {
  const out: Deployment[] = [];
  for (let i = 0; i < 8; i++) {
    const pl = pipelines[i % pipelines.length];
    const st = ['success', 'success', 'rolled_back', 'failed', 'running'][i % 5];
    out.push({
      id: uid('dep'),
      pipelineId: pl.id,
      version: pl.version ?? 'v1.0.0',
      status: st as Deployment['status'],
      createdBy: 'u-zhangwei',
      createdAt: iso(i * 47 + 5),
    });
  }
  return out;
}

/* ---------------- 告警 ---------------- */
export const alerts: AlertEvent[] = [
  { id: uid('al'), ruleId: uid('rule'), severity: 'critical', status: 'firing', firedAt: iso(3), summary: 'CPU 使用率持续高于 85%（order-service）', labels: { cluster: 'prod-shanghai', namespace: 'order-service', pod: 'order-9f3a' } },
  { id: uid('al'), ruleId: uid('rule'), severity: 'critical', status: 'firing', firedAt: iso(11), summary: 'Pod CrashLoopBackOff：payment-worker', labels: { cluster: 'prod-shanghai', namespace: 'app-gateway' } },
  { id: uid('al'), ruleId: uid('rule'), severity: 'warning', status: 'firing', firedAt: iso(26), summary: '节点 node-c2 内存水位 88%', labels: { cluster: 'prod-shanghai', node: 'node-c2' } },
  { id: uid('al'), ruleId: uid('rule'), severity: 'warning', status: 'firing', firedAt: iso(48), summary: 'PVC 存储使用率超过 80%', labels: { cluster: 'edge-shenzhen' } },
  { id: uid('al'), ruleId: uid('rule'), severity: 'info', status: 'firing', firedAt: iso(95), summary: 'apiserver 请求延迟 P99 升高', labels: { cluster: 'staging-beijing' } },
  { id: uid('al'), ruleId: uid('rule'), severity: 'critical', status: 'resolved', firedAt: iso(220), summary: '5xx 错误率回降至阈值内', labels: { cluster: 'prod-shanghai', service: 'api-gateway' } },
];

export const alertRules: AlertRule[] = [
  { id: uid('rule'), expr: 'cpu_usage_percent > 85', for: '5m', severity: 'critical', channelIds: ['ch-wecom', 'ch-pager'], createdBy: 'u-zhangwei', createdAt: iso(60 * 24 * 30) },
  { id: uid('rule'), expr: 'pod_restart_total > 5', for: '10m', severity: 'warning', channelIds: ['ch-wecom'], createdBy: 'u-lina', createdAt: iso(60 * 24 * 20) },
  { id: uid('rule'), expr: 'node_memory_util > 85', for: '5m', severity: 'warning', channelIds: ['ch-email'], createdBy: 'u-zhangwei', createdAt: iso(60 * 24 * 12) },
  { id: uid('rule'), expr: 'http_5xx_ratio > 0.02', for: '3m', severity: 'critical', channelIds: ['ch-wecom', 'ch-pager'], createdBy: 'u-lina', createdAt: iso(60 * 24 * 5) },
  { id: uid('rule'), expr: 'pvc_used_percent > 80', for: '15m', severity: 'warning', channelIds: ['ch-email'], createdBy: 'u-zhangwei', createdAt: iso(60 * 24 * 2) },
];

export const channels: NotificationChannel[] = [
  { id: 'ch-wecom', tenantId: 't-default', type: 'wecom', config: { webhook: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=****' }, createdAt: iso(60 * 24 * 30) },
  { id: 'ch-pager', tenantId: 't-default', type: 'webhook', config: { url: 'https://events.pagerduty.com/v2/enqueue' }, createdAt: iso(60 * 24 * 28) },
  { id: 'ch-email', tenantId: 't-default', type: 'email', config: { to: 'sre-oncall@corp.example' }, createdAt: iso(60 * 24 * 20) },
  { id: 'ch-ding', tenantId: 't-default', type: 'dingtalk', config: { token: '****' }, createdAt: iso(60 * 24 * 10) },
];

/* ---------------- 审计 ---------------- */
const ACTIONS = [
  'login.success', 'role.assign', 'cluster.register', 'pipeline.trigger',
  'pipeline.rollback', 'pod.restart', 'alertrule.create', 'channel.create',
  'scope.switch', 'member.invite',
];
const OBJECTS = [
  'cluster/prod-shanghai', 'pipeline/api-gateway', 'pod/order-9f3a',
  'role/member', 'alertrule/cpu_usage_percent', 'channel/wecom',
  'user/u-lina', 'deployment/v2.4.1',
];
const ACTORS = ['u-zhangwei', 'u-lina', 'u-chenhao', 'u-wangfang', 'u-zhaolei'];
const ACTOR_NAMES: Record<string, string> = {
  'u-zhangwei': '张伟', 'u-lina': '李娜', 'u-chenhao': '陈浩',
  'u-wangfang': '王芳', 'u-zhaolei': '赵磊',
};

export function mockAudit(page = 1, limit = 20, q?: string, actorId?: string): { items: AuditLog[]; total: number; page: number; limit: number; hasMore: boolean } {
  const all: AuditLog[] = [];
  for (let i = 0; i < 64; i++) {
    const actor = ACTORS[i % ACTORS.length];
    const action = ACTIONS[i % ACTIONS.length];
    const obj = OBJECTS[i % OBJECTS.length];
    all.push({
      id: uid('audit'),
      tenantId: 't-default',
      actorId: actor,
      actorName: ACTOR_NAMES[actor],
      impersonatedAs: i % 4 === 0 ? 'sa-ops-impersonator' : undefined,
      action,
      object: obj,
      result: i % 9 === 0 ? 'failure' : i % 7 === 0 ? 'warning' : 'success',
      createdAt: iso(i * 37 + 3),
      ip: `10.20.${(i % 8) + 1}.${(i * 13) % 240}`,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) OpsConsole/1.0',
      before: i % 5 === 0 ? 'role=viewer' : undefined,
      after: i % 5 === 0 ? 'role=member' : undefined,
    });
  }
  let filtered = all;
  if (actorId) filtered = filtered.filter((a) => a.actorId === actorId);
  if (q) {
    const kw = q.toLowerCase();
    filtered = filtered.filter(
      (a) =>
        a.action.toLowerCase().includes(kw) ||
        a.object.toLowerCase().includes(kw) ||
        a.actorName.toLowerCase().includes(kw),
    );
  }
  const start = (page - 1) * limit;
  const items = filtered.slice(start, start + limit);
  return { items, total: filtered.length, page, limit, hasMore: start + limit < filtered.length };
}

/* ---------------- RBAC ---------------- */
export const roles: RolePermission[] = [
  { role: 'platform_admin', roleLabel: '平台超管', permissions: ['*:*'] },
  { role: 'owner', roleLabel: '租户所有者', permissions: ['monitoring:read', 'monitoring:write', 'logging:read', 'deployment:trigger', 'deployment:rollback', 'infrastructure:write', 'rbac:assign', 'audit:read'] },
  { role: 'admin', roleLabel: '运维管理员', permissions: ['monitoring:read', 'monitoring:write', 'logging:read', 'deployment:trigger', 'deployment:rollback', 'infrastructure:write', 'rbac:assign', 'audit:read'] },
  { role: 'member', roleLabel: '研发成员', permissions: ['monitoring:read', 'logging:read', 'deployment:trigger', 'infrastructure:read'] },
  { role: 'viewer', roleLabel: '只读', permissions: ['monitoring:read', 'logging:read', 'infrastructure:read', 'audit:read'] },
];

export const members: MemberAssignment[] = [
  { userId: 'u-zhangwei', displayName: '张伟', email: 'zhangwei@corp.example', role: 'admin', team: '平台工程' },
  { userId: 'u-lina', displayName: '李娜', email: 'lina@corp.example', role: 'member', team: '交易研发' },
  { userId: 'u-chenhao', displayName: '陈浩', email: 'chenhao@corp.example', role: 'member', team: '交易研发' },
  { userId: 'u-wangfang', displayName: '王芳', email: 'wangfang@corp.example', role: 'viewer', team: '合规审计' },
  { userId: 'u-zhaolei', displayName: '赵磊', email: 'zhaolei@corp.example', role: 'admin', team: '平台工程' },
];

/* ---------------- 指标查询（PromQL 代理） ---------------- */
function series(base: number, variance: number, n = 60): Array<[number, string]> {
  const now = Math.floor(Date.now() / 1000);
  const step = 60;
  const out: Array<[number, string]> = [];
  let v = base;
  for (let i = n - 1; i >= 0; i--) {
    v = Math.max(0, Math.min(100, v + (Math.sin(i / 3) * variance) / 2 + (Math.random() - 0.5) * variance));
    out.push([now - i * step, v.toFixed(2)]);
  }
  return out;
}

export function mockQuery(expr: string): QueryResult {
  const lower = expr.toLowerCase();
  let base = 50;
  if (lower.includes('cpu')) base = 63;
  else if (lower.includes('mem')) base = 71;
  else if (lower.includes('disk')) base = 44;
  else if (lower.includes('net')) base = 38;
  return {
    status: 'success',
    data: {
      resultType: 'matrix',
      result: [
        { metric: { instance: 'node-a1', job: 'node' }, values: series(base, 12) },
        { metric: { instance: 'node-b2', job: 'node' }, values: series(base - 8, 10) },
      ],
    },
  };
}

/* ---------------- 日志检索 ---------------- */
const SERVICES = ['api-gateway', 'order-service', 'auth-service', 'payment-worker', 'data-pipeline'];
const MSG: Record<LogLevel, string[]> = {
  debug: ['配置加载完成 config=app.yaml', '连接池复用 conn=12', 'GC pause 120ms'],
  info: ['处理请求 method=POST path=/v1/orders latency=42ms', '健康检查通过 endpoint=/healthz', '接收 webhook 回调 event=deploy.succeeded', '用户登录成功 user=u-lina'],
  warn: ['数据库连接等待 time=820ms', '重试请求 attempt=2 reason=timeout', '内存水位偏高 usage=86%'],
  error: ['下游服务 503 service=payment-worker', '连接数据库超时 retry=3', 'Pod 启动失败 reason=ImagePullBackOff', '5xx 比例超过阈值 ratio=0.03'],
};
const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

export function mockLogs(opts: { q?: string; level?: LogLevel; service?: string; limit?: number } = {}): LogEntry[] {
  const limit = opts.limit ?? 120;
  const out: LogEntry[] = [];
  for (let i = 0; i < limit; i++) {
    const lvl = opts.level ?? LEVELS[i % LEVELS.length];
    const svc = opts.service ?? SERVICES[i % SERVICES.length];
    const pool = MSG[lvl];
    const message = pool[i % pool.length];
    if (opts.q && !message.includes(opts.q) && !svc.includes(opts.q)) continue;
    out.push({
      timestamp: iso(i * 0.4 + 0.2),
      level: lvl,
      service: svc,
      message,
      pod: `${svc.split('-')[0]}-${uid('pod').slice(0, 5)}`,
    });
  }
  return out.reverse();
}

export function mockLogin(email: string, password: string): TokenResponse {
  if (!email || !password || password.length < 8) {
    throw new Error('邮箱或密码错误，请重试');
  }
  const role: TokenResponse['role'] = email.includes('admin') ? 'admin' : 'member';
  return {
    accessToken: `mock.${btoa(email)}.${Date.now()}`,
    expiresIn: 900,
    tenantId: 't-default',
    role,
  };
}
