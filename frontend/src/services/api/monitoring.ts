import { get, post, del } from '../http';
import type {
  AlertEvent,
  AlertRule,
  AlertRuleCreateRequest,
  AlertSeverity,
  NotificationChannel,
  NotificationChannelCreateRequest,
  Page,
  QueryResult,
} from '@/types/api';

export interface ListAlertsParams {
  severity?: AlertSeverity;
  page?: number;
  limit?: number;
}

export interface QueryMetricsParams {
  expr: string;
  step?: string;
  start?: string | number;
  end?: string | number;
  instance?: string;
  node?: string;
  cluster?: string;
  namespace?: string;
}

/** GET /monitoring/query — PromQL 代理（step + start/end 触发区间趋势查询），可按 node/cluster/instance/namespace 过滤 */
export async function queryMetrics(params: QueryMetricsParams): Promise<QueryResult> {
  const q: Record<string, string | number> = { expr: params.expr };
  if (params.step) q.step = params.step;
  if (params.start != null) q.start = params.start;
  if (params.end != null) q.end = params.end;
  if (params.instance) q.instance = params.instance;
  if (params.node) q.node = params.node;
  if (params.cluster) q.cluster = params.cluster;
  if (params.namespace) q.namespace = params.namespace;
  return get<QueryResult>('/monitoring/query', q);
}

/** GET /monitoring/nodes — 当前被 node_exporter 采集的节点列表 */
export async function listNodes(): Promise<string[]> {
  return get<string[]>('/monitoring/nodes');
}

/** GET /monitoring/alert-rules */
export async function listAlertRules(): Promise<AlertRule[]> {
  return get<AlertRule[]>('/monitoring/alert-rules');
}

/** POST /monitoring/alert-rules */
export async function createAlertRule(req: AlertRuleCreateRequest): Promise<AlertRule> {
  return post<AlertRule>('/monitoring/alert-rules', {
    name: req.name,
    expr: req.expr,
    severity: req.severity,
    for_seconds: req.forSeconds ?? 300,
  });
}

/** GET /monitoring/alerts — 活跃告警（vmalert） */
export async function listAlerts(params: ListAlertsParams = {}): Promise<Page<AlertEvent>> {
  return get<Page<AlertEvent>>('/monitoring/alerts', params);
}

/** GET /monitoring/notifications */
export async function listChannels(): Promise<NotificationChannel[]> {
  return get<NotificationChannel[]>('/monitoring/notifications');
}

/** POST /monitoring/notifications */
export async function createChannel(
  req: NotificationChannelCreateRequest,
): Promise<NotificationChannel> {
  return post<NotificationChannel>('/monitoring/notifications', req);
}

/** DELETE /monitoring/notifications/:id */
export async function deleteChannel(id: string): Promise<void> {
  return del(`/monitoring/notifications/${id}`);
}
