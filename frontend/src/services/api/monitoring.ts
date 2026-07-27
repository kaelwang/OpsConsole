import { get, post, del } from '../http';
import type {
  AlertEvent,
  AlertRule,
  AlertRuleCreateRequest,
  AlertSeverity,
  AlertStatus,
  NotificationChannel,
  NotificationChannelCreateRequest,
  Page,
  QueryResult,
} from '@/types/api';

export interface ListAlertsParams {
  severity?: AlertSeverity;
  status?: AlertStatus;
  page?: number;
  limit?: number;
}

/** GET /monitoring/query — PromQL 代理（step + start/end 触发区间趋势查询） */
export async function queryMetrics(
  expr: string,
  step?: string,
  start?: number,
  end?: number,
): Promise<QueryResult> {
  const params: Record<string, string | number> = { expr };
  if (step) params.step = step;
  if (start != null) params.start = start;
  if (end != null) params.end = end;
  return get<QueryResult>('/monitoring/query', params);
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
