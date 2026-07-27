import { App as AntdApp, ConfigProvider, theme as antdTheme } from 'antd';
import { Navigate, Route, Routes } from 'react-router-dom';
import tokens from '@/design-tokens.json';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { AppShell } from '@/layouts/AppShell';
import { LoginPage } from '@/features/login/LoginPage';
import { HomePage } from '@/features/home/HomePage';
import { MonitoringPage } from '@/features/monitoring/MonitoringPage';
import { LogsPage } from '@/features/logging/LogsPage';
import { PipelinesPage } from '@/features/delivery/PipelinesPage';
import { ClustersPage } from '@/features/infrastructure/ClustersPage';
import { AuditPage } from '@/features/audit/AuditPage';
import { AccessPage } from '@/features/access/AccessPage';
import { SettingsPage } from '@/features/settings/SettingsPage';

/* AntD 主题桥：颜色全部来自 design-tokens.json（设计 Token 真值来源），
   不在组件内硬编码任何 hex。随 resolved 主题切换实时重算。 */
function AntdThemeBridge({ children }: { children: React.ReactNode }) {
  const resolved = useThemeStore((s) => s.resolved);
  const key = resolved === 'dark' ? 'dark' : 'light';
  const c = tokens.color;

  const token = {
    colorPrimary: c.accent[key],
    colorInfo: c.accent[key],
    colorLink: c.accent[key],
    colorBgContainer: c.surface[key],
    colorBgElevated: c.surface[key],
    colorBgLayout: c.bg[key],
    colorBorder: c.border[key],
    colorBorderSecondary: c['border-soft'][key],
    colorSplit: c['border-soft'][key],
    colorText: c.fg[key],
    colorTextSecondary: c['fg-2'][key],
    colorTextTertiary: c.muted[key],
    colorTextQuaternary: c.meta[key],
    borderRadius: 8,
    borderRadiusLG: 12,
    fontFamily: tokens.font.family.body,
    fontSize: 14,
    motionDurationMid: tokens.motion.base,
    motionDurationSlow: tokens.motion.base,
    wireframe: false,
  };

  return (
    <ConfigProvider
      theme={{
        algorithm:
          resolved === 'dark'
            ? [antdTheme.darkAlgorithm, antdTheme.compactAlgorithm]
            : [antdTheme.defaultAlgorithm, antdTheme.compactAlgorithm],
        token,
        cssVar: true,
        components: {
          Layout: {
            bodyBg: c.bg[key],
            headerBg: c.surface[key],
            siderBg: c.surface[key],
          },
          Menu: {
            itemBg: 'transparent',
            darkItemBg: 'transparent',
            itemSelectedBg: `color-mix(in srgb, ${c.accent[key]} 16%, transparent)`,
            itemSelectedColor: c.accent[key],
          },
        },
      }}
    >
      <AntdApp style={{ height: '100%' }}>{children}</AntdApp>
    </ConfigProvider>
  );
}

// 路由守卫：未登录（无内存令牌）一律重定向到登录页，刷新后强制重新登录
function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <AntdThemeBridge>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="observability/metrics" element={<MonitoringPage />} />
          <Route path="observability/logs" element={<LogsPage />} />
          <Route path="delivery/pipelines" element={<PipelinesPage />} />
          <Route path="infrastructure/clusters" element={<ClustersPage />} />
          <Route path="governance/audit" element={<AuditPage />} />
          <Route path="governance/access" element={<AccessPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AntdThemeBridge>
  );
}
