import type { ReactNode } from 'react';

/** 页头：标题 + 可选副标题/图标 + 右侧操作区 */
export function PageHeader({
  title,
  subtitle,
  icon,
  extra,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 'var(--space-4)',
        marginBottom: 'var(--space-5)',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
        {icon}
        <div>
          <h1
            style={{
              fontSize: 'var(--font-size-xl)',
              fontWeight: 600,
              margin: 0,
              letterSpacing: 'var(--tracking-display)',
              color: 'var(--fg)',
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <div style={{ color: 'var(--muted)', fontSize: 'var(--font-size-sm)', marginTop: 4 }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>
      {extra && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
          {extra}
        </div>
      )}
    </div>
  );
}
