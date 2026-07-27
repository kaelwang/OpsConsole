import { Card } from 'antd';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Cpu,
  Gauge,
  HardDrive,
  MemoryStick,
  Network,
} from '@/components/icons';
import { Sparkline } from '@/components/chart';
import { queryMetrics } from '@/services/api/monitoring';
import type { QueryResult } from '@/types/api';
import { formatThroughput } from '@/lib/format';

// 数据源：node_exporter → vmagent → VictoriaMetrics
const METRICS = [
  { key: 'cpu', label: '集群 CPU 使用率', unit: '%', colorIndex: 0, icon: <Cpu size={20} />,
    expr: '100 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100' },
  { key: 'mem', label: '集群内存使用率', unit: '%', colorIndex: 1, icon: <MemoryStick size={20} />,
    expr: '(1 - sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes)) * 100' },
  { key: 'disk', label: '磁盘使用率', unit: '%', colorIndex: 2, icon: <HardDrive size={20} />,
    expr: 'max((1 - node_filesystem_avail_bytes{fstype!~"tmpfs|overlay|squashfs"} / node_filesystem_size_bytes{fstype!~"tmpfs|overlay|squashfs"}) * 100)' },
  { key: 'net', label: '网络吞吐', unit: 'MB/s', colorIndex: 3, icon: <Network size={20} />,
    expr: 'sum(rate(node_network_receive_bytes_total[5m]) + rate(node_network_transmit_bytes_total[5m])) / 1024 / 1024' },
  { key: 'diskio', label: '磁盘 IO', unit: 'MB/s', colorIndex: 4, icon: <Activity size={20} />,
    expr: 'sum(rate(node_disk_read_bytes_total[5m]) + rate(node_disk_written_bytes_total[5m])) / 1024 / 1024' },
  { key: 'up', label: '采集目标在线率', unit: '%', colorIndex: 5, icon: <Gauge size={20} />,
    expr: 'avg(up) * 100' },
];

// 将 matrix 结果按时间戳合并（多序列求和）为按时间排序的数值序列
function toValues(res: QueryResult): number[] {
  const byTs = new Map<number, number>();
  for (const s of res.data?.result ?? []) {
    for (const [ts, val] of s.values ?? []) {
      const v = Number(val);
      if (!Number.isNaN(v)) byTs.set(ts, (byTs.get(ts) ?? 0) + v);
    }
  }
  return [...byTs.keys()].sort((a, b) => a - b).map((t) => byTs.get(t) ?? 0);
}

export function MetricGrid({ rangeSec = 86400 }: { rangeSec?: number }) {
  const q = useQuery({
    queryKey: ['home-metric-grid', rangeSec],
    queryFn: async () => {
      const now = Math.floor(Date.now() / 1000);
      const step = Math.max(60, Math.round(rangeSec / 32));
      const results = await Promise.all(
        METRICS.map((m) => queryMetrics(m.expr, String(step), now - rangeSec, now)),
      );
      return results.map(toValues);
    },
    refetchInterval: 60_000,
  });

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 'var(--space-3)',
      }}
    >
      {METRICS.map((m, i) => {
        const series = q.data?.[i] ?? [];
        const latest = series.length ? series[series.length - 1] : null;
        return (
          <Card
            key={m.key}
            loading={q.isLoading}
            styles={{ body: { padding: 'var(--space-4)' } }}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>{m.label}</span>
              <span style={{ color: 'var(--muted)', display: 'flex' }}>{m.icon}</span>
            </div>
            <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 4 }}>
              {(() => {
                const shown = latest == null ? null : (m.key === 'net' || m.key === 'diskio') ? formatThroughput(latest) : null;
                const val = latest == null ? '—' : shown ? shown.value : Math.round(latest * 10) / 10;
                const unit = latest == null ? '' : shown ? shown.unit : m.unit;
                return (
                  <>
                    <span className="mono" style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 600, color: 'var(--fg)', lineHeight: 1 }}>
                      {val}
                    </span>
                    <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>{unit}</span>
                  </>
                );
              })()}
            </div>
            <div style={{ marginTop: 8, height: 40 }}>
              <Sparkline data={series} colorIndex={m.colorIndex} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}
