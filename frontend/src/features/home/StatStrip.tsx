import { Card } from 'antd';
import { Bell, HeartPulse, Rocket, XCircle } from '@/components/icons';
import type { AlertEvent, Cluster, Deployment, Pipeline } from '@/types/api';
import { healthVar, deploymentVar, severityVar } from '@/components/status';

interface Props {
  clusters: Cluster[];
  alerts: AlertEvent[];
  pipelines: Pipeline[];
  deployments: Deployment[];
}

function Tile({
  label,
  value,
  unit,
  color,
  icon,
}: {
  label: string;
  value: string | number;
  unit?: string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <Card
      styles={{ body: { padding: 'var(--space-4)' } }}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>{label}</span>
        <span style={{ color, display: 'flex' }}>{icon}</span>
      </div>
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span className="mono" style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 600, color: 'var(--fg)', lineHeight: 1 }}>
          {value}
        </span>
        {unit && <span style={{ fontSize: 'var(--font-size-md)', color: 'var(--muted)' }}>{unit}</span>}
      </div>
    </Card>
  );
}

export function StatStrip({ clusters, alerts, pipelines, deployments }: Props) {
  const avgHealth = clusters.length
    ? Math.round(clusters.reduce((s, c) => s + (c.health ?? 100), 0) / clusters.length)
    : 100;
  const firing = alerts.filter((a) => a.status === 'firing').length;
  const failed = pipelines.filter((p) => p.status === 'failed').length;
  const todayDeploys = deployments.length;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 'var(--space-3)',
      }}
    >
      <Tile label="集群健康率" value={avgHealth} unit="%" color={healthVar(avgHealth)} icon={<HeartPulse size={20} />} />
      <Tile label="活跃告警" value={firing} color={severityVar(firing > 0 ? 'critical' : 'info')} icon={<Bell size={20} />} />
      <Tile label="近期部署" value={todayDeploys} color="var(--accent)" icon={<Rocket size={20} />} />
      <Tile label="失败流水线" value={failed} color={failed > 0 ? 'var(--danger)' : 'var(--success)'} icon={<XCircle size={20} />} />
    </div>
  );
}

export { deploymentVar };
