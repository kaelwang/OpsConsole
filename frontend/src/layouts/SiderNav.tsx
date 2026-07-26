import { useMemo } from 'react';
import { Menu } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  Boxes,
  Gauge,
  History,
  KeyRound,
  LayoutDashboard,
  Rocket,
  ScrollText,
  Server,
  Settings,
  ShieldCheck,
  Workflow,
} from '@/components/icons';

const ITEMS = [
  { key: '/', icon: <LayoutDashboard size={20} strokeWidth={1.75} />, label: '运维首页' },
  {
    key: 'observability',
    icon: <Activity size={20} strokeWidth={1.75} />,
    label: '可观测',
    children: [
      { key: '/observability/metrics', icon: <Gauge size={20} strokeWidth={1.75} />, label: '监控告警' },
      { key: '/observability/logs', icon: <ScrollText size={20} strokeWidth={1.75} />, label: '日志分析' },
    ],
  },
  {
    key: 'delivery',
    icon: <Rocket size={20} strokeWidth={1.75} />,
    label: '交付',
    children: [
      { key: '/delivery/pipelines', icon: <Workflow size={20} strokeWidth={1.75} />, label: '流水线 / 交付' },
    ],
  },
  {
    key: 'infrastructure',
    icon: <Server size={20} strokeWidth={1.75} />,
    label: '基础设施',
    children: [
      { key: '/infrastructure/clusters', icon: <Boxes size={20} strokeWidth={1.75} />, label: '集群 / 资源' },
    ],
  },
  {
    key: 'management',
    icon: <ShieldCheck size={20} strokeWidth={1.75} />,
    label: '管理',
    children: [
      { key: '/governance/audit', icon: <History size={20} strokeWidth={1.75} />, label: '审计日志' },
      { key: '/governance/access', icon: <KeyRound size={20} strokeWidth={1.75} />, label: '权限 / 访问' },
      { key: '/settings', icon: <Settings size={20} strokeWidth={1.75} />, label: '设置' },
    ],
  },
];

function parentOf(path: string): string | undefined {
  if (path.startsWith('/observability')) return 'observability';
  if (path.startsWith('/delivery')) return 'delivery';
  if (path.startsWith('/infrastructure')) return 'infrastructure';
  if (path.startsWith('/governance') || path.startsWith('/settings')) return 'management';
  return undefined;
}

export function SiderNav({ collapsed }: { collapsed: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const selected = location.pathname;
  const defaultOpen = useMemo(() => {
    const p = parentOf(selected);
    return p ? [p] : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Menu
      mode="inline"
      items={ITEMS}
      selectedKeys={[selected]}
      defaultOpenKeys={defaultOpen}
      inlineCollapsed={collapsed}
      onClick={({ key }) => {
        if (key.startsWith('/')) navigate(key);
      }}
      style={{
        background: 'transparent',
        borderInlineEnd: 'none',
        paddingTop: 'var(--space-2)',
      }}
    />
  );
}
