import { useQuery } from '@tanstack/react-query';
import { Avatar, Badge, Button, Dropdown, Select, Space, Tooltip } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Building2,
  Boxes,
  Command,
  LogOut,
  MapPin,
  Moon,
  PanelLeft,
  PanelLeftClose,
  Settings as SettingsIcon,
  Sun,
  User as UserIcon,
} from '@/components/icons';
import { useThemeStore } from '@/stores/theme';
import { useScopeStore } from '@/stores/scope';
import { useAuthStore } from '@/stores/auth';
import { listAlerts } from '@/services/api/monitoring';
import { listClusters } from '@/services/api/infrastructure';

const TEAMS = [
  { value: 'all', label: '全团队' },
  { value: '平台工程', label: '平台工程' },
  { value: '交易研发', label: '交易研发' },
  { value: '合规审计', label: '合规审计' },
];
const ENVS = [
  { value: 'prod', label: '生产' },
  { value: 'staging', label: '预发' },
  { value: 'edge', label: '边缘' },
];

export function Topbar({
  collapsed,
  onToggleCollapse,
  onOpenCommand,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenCommand: () => void;
}) {
  const navigate = useNavigate();
  const { resolved, setMode } = useThemeStore();
  const { team, cluster, env, setScope } = useScopeStore();
  const { email, logout } = useAuthStore();

  const clustersQ = useQuery({ queryKey: ['clusters'], queryFn: listClusters });
  const alertsQ = useQuery({ queryKey: ['alerts', 'top'], queryFn: () => listAlerts({ page: 1, limit: 50 }) });
  const firingCount = alertsQ.data?.items.filter((a) => a.status === 'firing').length ?? 0;

  const clusterOptions = (clustersQ.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  const selectStyle = { minWidth: 132 } as const;

  return (
    <div
      style={{
        height: 56,
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: '0 var(--space-4)',
        borderBottom: '1px solid var(--border-soft)',
        background: 'var(--surface)',
      }}
    >
      <Button
        type="text"
        aria-label="切换侧栏"
        onClick={onToggleCollapse}
        icon={collapsed ? <PanelLeft size={20} /> : <PanelLeftClose size={20} />}
      />

      <Button
        type="text"
        onClick={onOpenCommand}
        icon={<Command size={18} />}
        style={{ color: 'var(--muted)', gap: 8 }}
      >
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>搜索资源 / 跳转</span>
        <kbd
          style={{
            fontSize: 11,
            padding: '1px 6px',
            borderRadius: 4,
            border: '1px solid var(--border)',
            color: 'var(--meta)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          ⌘K
        </kbd>
      </Button>

      <div style={{ flex: 1 }} />

      <Space size="small" wrap>
        <Select
          prefix={<Building2 size={16} />}
          value={team}
          options={TEAMS}
          onChange={(v) => setScope({ team: v })}
          variant="filled"
          style={selectStyle}
          aria-label="团队作用域"
        />
        <Select
          prefix={<Boxes size={16} />}
          value={cluster}
          options={clusterOptions}
          onChange={(v) => setScope({ cluster: v })}
          variant="filled"
          style={selectStyle}
          loading={clustersQ.isLoading}
          aria-label="集群作用域"
        />
        <Select
          prefix={<MapPin size={16} />}
          value={env}
          options={ENVS}
          onChange={(v) => setScope({ env: v })}
          variant="filled"
          style={{ minWidth: 96 }}
          aria-label="环境作用域"
        />
      </Space>

      <Tooltip title="命令面板">
        <Button type="text" aria-label="告警" onClick={onOpenCommand} style={{ position: 'relative' }}>
          <Badge count={firingCount} size="small" offset={[-2, 2]}>
            <Bell size={20} style={{ color: 'var(--muted)' }} />
          </Badge>
        </Button>
      </Tooltip>

      <Tooltip title={resolved === 'dark' ? '切换到浅色' : '切换到深色'}>
        <Button
          type="text"
          aria-label="主题切换"
          icon={resolved === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          onClick={() => setMode(resolved === 'dark' ? 'light' : 'dark')}
        />
      </Tooltip>

      <Dropdown
        menu={{
          items: [
            { key: 'profile', icon: <UserIcon size={16} />, label: '个人资料', onClick: () => navigate('/settings') },
            { key: 'appearance', icon: <SettingsIcon size={16} />, label: '外观设置', onClick: () => navigate('/settings') },
            { type: 'divider' },
            {
              key: 'logout',
              icon: <LogOut size={16} />,
              label: '退出登录',
              danger: true,
              onClick: () => {
                logout();
                navigate('/login');
              },
            },
          ],
        }}
        trigger={['click']}
      >
        <Button type="text" style={{ display: 'flex', alignItems: 'center', gap: 8, paddingInline: 6 }}>
          <Avatar size={28} style={{ background: 'var(--accent)', color: 'var(--accent-on)' }}>
            <UserIcon size={16} />
          </Avatar>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--fg-2)' }}>{email ?? '未登录'}</span>
        </Button>
      </Dropdown>
    </div>
  );
}
