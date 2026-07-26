import { Card } from 'antd';
import {
  Activity,
  Cpu,
  Gauge,
  HardDrive,
  MemoryStick,
  Network,
} from '@/components/icons';
import { Sparkline } from '@/components/chart';

function genSeries(base: number, variance: number, n = 32): number[] {
  const out: number[] = [];
  let v = base;
  for (let i = 0; i < n; i++) {
    v = Math.max(0, Math.min(100, v + Math.sin(i / 3) * variance * 0.4 + (Math.random() - 0.5) * variance));
    out.push(Math.round(v * 10) / 10);
  }
  return out;
}

const METRICS = [
  { key: 'cpu', label: '集群 CPU 使用率', value: '63.2', unit: '%', colorIndex: 0, icon: <Cpu size={20} /> },
  { key: 'mem', label: '集群内存使用率', value: '71.4', unit: '%', colorIndex: 1, icon: <MemoryStick size={20} /> },
  { key: 'disk', label: '磁盘使用率', value: '44.0', unit: '%', colorIndex: 2, icon: <HardDrive size={20} /> },
  { key: 'net', label: '网络吞吐', value: '38.6', unit: '%', colorIndex: 3, icon: <Network size={20} /> },
  { key: 'restarts', label: '今日容器重启', value: '12', unit: '次', colorIndex: 4, icon: <Activity size={20} /> },
  { key: 'success', label: '请求成功率', value: '99.2', unit: '%', colorIndex: 5, icon: <Gauge size={20} /> },
];

export function MetricGrid({ points = 32 }: { points?: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 'var(--space-3)',
      }}
    >
      {METRICS.map((m) => (
        <Card
          key={m.key}
          styles={{ body: { padding: 'var(--space-4)' } }}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>{m.label}</span>
            <span style={{ color: 'var(--muted)', display: 'flex' }}>{m.icon}</span>
          </div>
          <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span className="mono" style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 600, color: 'var(--fg)', lineHeight: 1 }}>
              {m.value}
            </span>
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>{m.unit}</span>
          </div>
          <div style={{ marginTop: 8, height: 40 }}>
            <Sparkline data={genSeries(Number(m.value), 12, points)} colorIndex={m.colorIndex} />
          </div>
        </Card>
      ))}
    </div>
  );
}
