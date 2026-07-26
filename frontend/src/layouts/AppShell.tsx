import { useEffect, useState } from 'react';
import { Layout } from 'antd';
import { Outlet, useLocation } from 'react-router-dom';
import { SiderNav } from './SiderNav';
import { Topbar } from './Topbar';
import { CommandPalette } from './CommandPalette';

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const location = useLocation();

  // 平板 / 移动：自动收起侧栏
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const apply = () => setCollapsed(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // 全局 ⌘K / Ctrl+K 唤起命令面板
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 路由切换时回到顶部
  useEffect(() => {
    document.querySelector('.ops-content')?.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <Layout style={{ height: '100vh', background: 'var(--bg)' }}>
      <Layout.Sider
        collapsible
        collapsed={collapsed}
        trigger={null}
        width={240}
        collapsedWidth={64}
        style={{
          background: 'var(--surface)',
          borderRight: '1px solid var(--border-soft)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: collapsed ? '0' : '0 16px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            borderBottom: '1px solid var(--border-soft)',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: 'var(--accent)',
              color: 'var(--accent-on)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 15,
              flexShrink: 0,
            }}
          >
            O
          </div>
          {!collapsed && (
            <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, letterSpacing: 'var(--tracking-display)', color: 'var(--fg)' }}>
              统一运维控制台
            </span>
          )}
        </div>
        <div style={{ height: 'calc(100vh - 56px)', overflowY: 'auto' }}>
          <SiderNav collapsed={collapsed} />
        </div>
      </Layout.Sider>

      <Layout style={{ background: 'var(--bg)' }}>
        <Layout.Header style={{ padding: 0, height: 56, lineHeight: '56px', background: 'var(--surface)' }}>
          <Topbar
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((c) => !c)}
            onOpenCommand={() => setCmdOpen(true)}
          />
        </Layout.Header>
        <Layout.Content
          className="ops-content"
          style={{ padding: 'var(--space-6)', overflow: 'auto', background: 'var(--bg)' }}
        >
          <Outlet />
        </Layout.Content>
      </Layout>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </Layout>
  );
}
