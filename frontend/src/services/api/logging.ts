import { get } from '../http';
import type { LogEntry, LogLevel } from '@/types/api';

export interface SearchLogsParams {
  q?: string;
  from?: string;
  to?: string;
  level?: LogLevel;
  service?: string;
  limit?: number;
}

/** GET /logging/search — 全文检索（代理 OpenSearch） */
export async function searchLogs(params: SearchLogsParams): Promise<LogEntry[]> {
  return get<LogEntry[]>('/logging/search', params);
}
