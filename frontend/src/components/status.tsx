import type { ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  XCircle,
} from './icons';
import type {
  AlertSeverity,
  AuditResult,
  DeploymentStatus,
  LogLevel,
  PipelineStatus,
} from '@/types/api';

/** 统一状态标签：图标 + 文字双编码（无障碍），颜色取自语义 Token */
export function StatusTag({
  color,
  icon,
  children,
}: {
  color: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px',
        borderRadius: 'var(--radius-pill)',
        fontSize: 'var(--font-size-xs)',
        fontWeight: 500,
        lineHeight: 1.4,
        color,
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 36%, transparent)`,
        whiteSpace: 'nowrap',
      }}
    >
      {icon}
      {children}
    </span>
  );
}

export const severityVar = (s: AlertSeverity): string =>
  s === 'critical' ? 'var(--danger)' : s === 'warning' ? 'var(--warn)' : 'var(--accent)';

export const severityIcon = (s: AlertSeverity) =>
  s === 'critical' ? <XCircle size={16} /> : s === 'warning' ? <AlertTriangle size={16} /> : <Info size={16} />;

export function severityTag(s: AlertSeverity) {
  return (
    <StatusTag color={severityVar(s)} icon={severityIcon(s)}>
      {s === 'critical' ? '严重' : s === 'warning' ? '警告' : '提示'}
    </StatusTag>
  );
}

export const pipelineVar = (s: PipelineStatus): string =>
  s === 'success'
    ? 'var(--success)'
    : s === 'failed'
      ? 'var(--danger)'
      : s === 'running'
        ? 'var(--accent)'
        : 'var(--muted)';

export function pipelineTag(s: PipelineStatus) {
  const icon =
    s === 'success' ? (
      <CheckCircle2 size={16} />
    ) : s === 'failed' ? (
      <XCircle size={16} />
    ) : s === 'running' ? (
      <Loader2 size={16} className="spin" />
    ) : (
      <Clock size={16} />
    );
  const label = s === 'success' ? '成功' : s === 'failed' ? '失败' : s === 'running' ? '运行中' : '等待中';
  return <StatusTag color={pipelineVar(s)} icon={icon}>{label}</StatusTag>;
}

export const deploymentVar = (s: DeploymentStatus): string =>
  s === 'success'
    ? 'var(--success)'
    : s === 'failed'
      ? 'var(--danger)'
      : s === 'running'
        ? 'var(--accent)'
        : s === 'rolled_back'
          ? 'var(--warn)'
          : 'var(--muted)';

export function deploymentTag(s: DeploymentStatus) {
  return (
    <StatusTag color={deploymentVar(s)}>
      {s === 'success' ? '成功' : s === 'failed' ? '失败' : s === 'running' ? '运行中' : s === 'rolled_back' ? '已回滚' : '等待中'}
    </StatusTag>
  );
}

export const podStatusVar = (s: string): string =>
  s === 'Running'
    ? 'var(--success)'
    : s === 'Pending'
      ? 'var(--warn)'
      : s === 'Completed'
        ? 'var(--muted)'
        : s === 'CrashLoopBackOff' || s === 'Error' || s === 'Failed'
          ? 'var(--danger)'
          : 'var(--muted)';

export const auditVar = (r: AuditResult): string =>
  r === 'success' ? 'var(--success)' : r === 'warning' ? 'var(--warn)' : 'var(--danger)';

export const auditIcon = (r: AuditResult) =>
  r === 'success' ? <CheckCircle2 size={16} /> : r === 'warning' ? <AlertTriangle size={16} /> : <XCircle size={16} />;

export function auditTag(r: AuditResult) {
  return (
    <StatusTag color={auditVar(r)} icon={auditIcon(r)}>
      {r === 'success' ? '成功' : r === 'warning' ? '需关注' : '失败'}
    </StatusTag>
  );
}

/** 健康率 → 语义色（冷→暖映射水位） */
export function healthVar(health: number): string {
  return health >= 90 ? 'var(--success)' : health >= 75 ? 'var(--warn)' : 'var(--danger)';
}

/** 水位百分比 → 进度条色（阈值色） */
export function usageVar(pct: number): string {
  return pct >= 85 ? 'var(--danger)' : pct >= 70 ? 'var(--warn)' : 'var(--success)';
}

export const logLevelVar = (l: LogLevel): string =>
  l === 'error'
    ? 'var(--danger)'
    : l === 'warn'
      ? 'var(--warn)'
      : l === 'info'
        ? 'var(--accent)'
        : 'var(--muted)';
