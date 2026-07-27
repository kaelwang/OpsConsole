import { useEffect, useMemo, useRef, useState } from 'react';
import { App, Modal } from 'antd';
import { useNavigate } from 'react-router-dom';
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
  Settings as SettingsIcon,
  Terminal,
  Workflow,
} from '@/components/icons';
interface Cmd {
  id: string;
  label: string;
  group: string;
  icon: React.ReactNode;
  run: () => void;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Cmd[] = useMemo(
    () => [
      { id: 'home', label: '运维首页', group: '导航', icon: <LayoutDashboard size={18} />, run: () => navigate('/') },
      { id: 'metrics', label: '监控告警', group: '导航', icon: <Gauge size={18} />, run: () => navigate('/observability/metrics') },
      { id: 'logs', label: '日志分析', group: '导航', icon: <ScrollText size={18} />, run: () => navigate('/observability/logs') },
      { id: 'pipelines', label: '流水线 / 交付', group: '导航', icon: <Workflow size={18} />, run: () => navigate('/delivery/pipelines') },
      { id: 'clusters', label: '集群 / 资源', group: '导航', icon: <Boxes size={18} />, run: () => navigate('/infrastructure/clusters') },
      { id: 'audit', label: '审计日志', group: '导航', icon: <History size={18} />, run: () => navigate('/governance/audit') },
      { id: 'access', label: '权限 / 访问', group: '导航', icon: <KeyRound size={18} />, run: () => navigate('/governance/access') },
      { id: 'settings', label: '设置', group: '导航', icon: <SettingsIcon size={18} />, run: () => navigate('/settings') },
      {
        id: 'act-trigger',
        label: '触发部署（前往流水线页）',
        group: '操作',
        icon: <Rocket size={18} />,
        run: () => navigate('/delivery/pipelines'),
      },
      {
        id: 'act-logs',
        label: '跳转到日志检索',
        group: '操作',
        icon: <Terminal size={18} />,
        run: () => navigate('/observability/logs'),
      },
      {
        id: 'act-obs',
        label: '跳转到可观测总览',
        group: '操作',
        icon: <Activity size={18} />,
        run: () => navigate('/observability/metrics'),
      },
      {
        id: 'act-infra',
        label: '跳转到基础设施',
        group: '操作',
        icon: <Server size={18} />,
        run: () => navigate('/infrastructure/clusters'),
      },
    ],
    [navigate, message],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[active];
      if (cmd) {
        void cmd.run();
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  // 按分组渲染
  const groups = useMemo(() => {
    const map = new Map<string, Cmd[]>();
    filtered.forEach((c) => {
      if (!map.has(c.group)) map.set(c.group, []);
      map.get(c.group)!.push(c);
    });
    return Array.from(map.entries());
  }, [filtered]);

  let flatIndex = -1;

  return (
    <Modal open={open} onCancel={onClose} footer={null} closable={false} centered width={600} styles={{ body: { padding: 12 } }}>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="搜索页面或执行操作…"
        style={{
          width: '100%',
          height: 42,
          background: 'var(--surface-2)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--fg)',
          padding: '0 12px',
          fontSize: 'var(--font-size-md)',
          outline: 'none',
        }}
      />
      <div style={{ maxHeight: 360, overflowY: 'auto', marginTop: 8 }}>
        {filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>无匹配结果</div>
        )}
        {groups.map(([group, cmds]) => (
          <div key={group} style={{ marginBottom: 6 }}>
            <div
              className="caps"
              style={{ fontSize: 11, color: 'var(--meta)', padding: '6px 10px' }}
            >
              {group}
            </div>
            {cmds.map((c) => {
              flatIndex += 1;
              const idx = flatIndex;
              const isActive = idx === active;
              return (
                <div
                  key={c.id}
                  onMouseEnter={() => setActive(idx)}
                  onClick={async () => {
                    await c.run();
                    onClose();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    color: 'var(--fg-2)',
                    background: isActive ? 'var(--surface-2)' : 'transparent',
                  }}
                >
                  <span style={{ color: 'var(--muted)', display: 'flex' }}>{c.icon}</span>
                  <span style={{ fontSize: 'var(--font-size-sm)' }}>{c.label}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Modal>
  );
}
