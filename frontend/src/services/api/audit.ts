import { get } from '../http';
import type { AuditLog, Page } from '@/types/api';

export interface ListAuditParams {
  q?: string;
  actorId?: string;
  page?: number;
  limit?: number;
}

/** GET /audit/logs — 分页 + 过滤 */
export async function listAudit(params: ListAuditParams = {}): Promise<Page<AuditLog>> {
  return get<Page<AuditLog>>('/audit/logs', params);
}
