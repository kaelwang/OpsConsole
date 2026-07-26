import type { Pod } from '@/types/api';
import { podStatusVar } from '@/components/status';

/** 集群依赖拓扑（SVG）— 表达 Namespace → Pod 真实依赖，节点按健康度着色 */
export function ClusterTopology({
  pods,
  onSelect,
  selected,
}: {
  pods: Pod[];
  onSelect: (p: Pod) => void;
  selected?: string;
}) {
  const groups = new Map<string, Pod[]>();
  pods.forEach((p) => {
    if (!groups.has(p.namespace)) groups.set(p.namespace, []);
    groups.get(p.namespace)!.push(p);
  });
  const nsList = Array.from(groups.entries());
  const rowH = 54;
  const height = Math.max(280, nsList.length * rowH + 40);
  const nsX = 70;
  const podX = 280;

  let podY = 40;
  const podPositions = new Map<string, number>();
  const nsY = new Map<string, number>();
  nsList.forEach(([ns, ps], i) => {
    nsY.set(ns, 40 + i * rowH + rowH / 2 - 10);
    const shown = ps.slice(0, 10);
    shown.forEach((p) => {
      podPositions.set(p.name, podY);
      podY += 30;
    });
    if (ps.length > 10) podY += 14;
  });

  return (
    <svg viewBox={`0 0 460 ${height}`} width="100%" style={{ maxHeight: 420, display: 'block' }}>
      <text x={nsX} y={20} fill="var(--meta)" fontSize={11} style={{ letterSpacing: '0.06em' }}>NAMESPACE</text>
      <text x={podX} y={20} fill="var(--meta)" fontSize={11} style={{ letterSpacing: '0.06em' }}>POD</text>
      {nsList.map(([ns, ps]) => (
        <g key={ns}>
          <line x1={nsX + 40} y1={nsY.get(ns)!} x2={podX - 10} y2={nsY.get(ns)!} stroke="var(--border-strong)" strokeWidth={1} />
          <rect x={nsX - 30} y={nsY.get(ns)! - 12} width={120} height={24} rx={6} fill="var(--surface-2)" stroke="var(--border)" />
          <text x={nsX + 30} y={nsY.get(ns)! + 4} fill="var(--fg-2)" fontSize={12} textAnchor="middle">{ns}</text>
          {ps.slice(0, 10).map((p) => {
            const y = podPositions.get(p.name)!;
            const color = podStatusVar(p.status);
            return (
              <g key={p.name} onClick={() => onSelect(p)} style={{ cursor: 'pointer' }}>
                <line x1={nsX + 40} y1={nsY.get(ns)!} x2={podX - 10} y2={y} stroke={color} strokeWidth={1} opacity={0.5} />
                <circle cx={podX - 8} cy={y} r={5} fill={color} />
                <text x={podX + 4} y={y + 4} fill={selected === p.name ? 'var(--accent)' : 'var(--fg-2)'} fontSize={12}>
                  {p.name.length > 22 ? p.name.slice(0, 22) + '…' : p.name}
                </text>
              </g>
            );
          })}
          {ps.length > 10 && (
            <text x={podX + 4} y={podPositions.get(ps[9].name)! + 18} fill="var(--meta)" fontSize={11}>+{ps.length - 10} 个</text>
          )}
        </g>
      ))}
    </svg>
  );
}
