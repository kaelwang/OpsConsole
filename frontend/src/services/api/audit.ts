import { USE_MOCK } from '../config';
import { get } from '../http';
import { delay, mockAudit } from '../mock';
import type { AuditLog, Page } from '@/types/api';

export interface ListAuditParams {
  q?: string;
  actorId?: string;
  page?: number;
  limit?: number;
}

/** GET /audit/logs — 分页 + 过滤 */
export async function listAudit(params: ListAuditParams = {}): Promise<Page<AuditLog>> {
  if (USE_MOCK) {
    await delay();
    return mockAudit(params.page ?? 1, params.limit ?? 20, params.q, params.actorId);
  }
  return get<Page<AuditLog>>('/audit/logs', params);
}
