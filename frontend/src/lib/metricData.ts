import type { QueryResult } from '@/types/api';

// 取即时向量查询的当前值。
// 注意：VictoriaMetrics 即时查询（/api/v1/query）返回 resultType:"vector"，
// 每条记录使用 `value`（单数 [ts,"num"]）；范围查询才用 `values` 数组。
// 这里两种形态都兼容。
export function instantValue(res: QueryResult | undefined): number {
  const item = res?.data?.result?.[0];
  if (item?.value) return Number(item.value[1]) || 0;
  const last = item?.values?.slice(-1)[0];
  return last ? Number(last[1]) || 0 : 0;
}
