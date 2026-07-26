import { USE_MOCK } from '../config';
import { get, post } from '../http';
import { delay, alerts, alertRules, channels, mockQuery } from '../mock';
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

/** GET /monitoring/query — PromQL 代理 */
export async function queryMetrics(expr: string, step?: string): Promise<QueryResult> {
  if (USE_MOCK) {
    await delay();
    return mockQuery(expr);
  }
  return get<QueryResult>('/monitoring/query', { expr, step });
}

/** GET /monitoring/alert-rules */
export async function listAlertRules(): Promise<AlertRule[]> {
  if (USE_MOCK) {
    await delay();
    return alertRules;
  }
  return get<AlertRule[]>('/monitoring/alert-rules');
}

/** POST /monitoring/alert-rules */
export async function createAlertRule(req: AlertRuleCreateRequest): Promise<AlertRule> {
  if (USE_MOCK) {
    await delay();
    const created: AlertRule = {
      id: `rule-${Date.now().toString(36)}`,
      expr: req.expr,
      for: req.for ?? '5m',
      severity: req.severity,
      channelIds: req.channelIds ?? [],
      createdBy: 'u-current',
      createdAt: new Date().toISOString(),
    };
    alertRules.unshift(created);
    return created;
  }
  return post<AlertRule>('/monitoring/alert-rules', req);
}

/** GET /monitoring/alerts */
export async function listAlerts(params: ListAlertsParams = {}): Promise<Page<AlertEvent>> {
  if (USE_MOCK) {
    await delay();
    let items = alerts;
    if (params.severity) items = items.filter((a) => a.severity === params.severity);
    if (params.status) items = items.filter((a) => a.status === params.status);
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    return { items, total: items.length, page, limit, hasMore: false };
  }
  return get<Page<AlertEvent>>('/monitoring/alerts', params);
}

/** GET /monitoring/notifications */
export async function listChannels(): Promise<NotificationChannel[]> {
  if (USE_MOCK) {
    await delay();
    return channels;
  }
  return get<NotificationChannel[]>('/monitoring/notifications');
}

/** POST /monitoring/notifications */
export async function createChannel(
  req: NotificationChannelCreateRequest,
): Promise<NotificationChannel> {
  if (USE_MOCK) {
    await delay();
    const created: NotificationChannel = {
      id: `ch-${Date.now().toString(36)}`,
      tenantId: 't-default',
      type: req.type,
      config: req.config,
      createdAt: new Date().toISOString(),
    };
    channels.unshift(created);
    return created;
  }
  return post<NotificationChannel>('/monitoring/notifications', req);
}
