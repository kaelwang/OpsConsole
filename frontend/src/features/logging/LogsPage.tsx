import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Drawer, Empty, Input, Segmented, Select, Switch, Space, Tooltip } from 'antd';
import {
  AlertTriangle,
  ArrowDownToLine,
  Bug,
  Copy,
  Download,
  Info,
  Pause,
  Play,
  ScrollText,
  Search,
  XCircle,
} from '@/components/icons';
import { PageHeader } from '@/components/PageHeader';
import { logLevelVar } from '@/components/status';
import { searchLogs } from '@/services/api/logging';
import type { LogEntry, LogLevel } from '@/types/api';

function highlight(text: string, q?: string) {
  if (!q) return text;
  const idx = text.indexOf(q);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="log-hl">{q}</span>
      {text.slice(idx + q.length)}
    </>
  );
}

function LevelTag({ level }: { level: LogLevel }) {
  const color = logLevelVar(level);
  const icon =
    level === 'error' ? <XCircle size={12} /> : level === 'warn' ? <AlertTriangle size={12} /> : level === 'debug' ? <Bug size={12} /> : <Info size={12} />;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        padding: '0 6px',
        borderRadius: 4,
        color,
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 36%, transparent)`,
      }}
    >
      {icon}
      {level.toUpperCase()}
    </span>
  );
}

function exportCsv(logs: LogEntry[]) {
  const esc = (s: string) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = [
    'timestamp,level,service,message',
    ...logs.map((l) => [l.timestamp, l.level, l.service, l.message].map(esc).join(',')),
  ];
  const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `logs-${new Date().toISOString().slice(0, 19)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function LogsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // 允许通过 URL 参数 ?q=&level=&service= 预填查询（监控/告警页跳转过来时用到）。
  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [level, setLevel] = useState<LogLevel | 'all'>(((searchParams.get('level') as LogLevel) || 'all') as LogLevel | 'all');
  const [service, setService] = useState<string | undefined>(searchParams.get('service') || undefined);
  const [following, setFollowing] = useState(true);
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<LogEntry | null>(null);
  const streamRef = useRef<HTMLDivElement>(null);

  // 把当前筛选条件同步回 URL，使日志视图可分享/可后退。
  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (level !== 'all') params.set('level', level);
    if (service) params.set('service', service);
    setSearchParams(params, { replace: true });
  }, [q, level, service, setSearchParams]);

  const baseQ = useQuery({
    queryKey: ['logs', q, level, service],
    queryFn: () => searchLogs({ q: q || undefined, level: level === 'all' ? undefined : level, service, limit: 200 }),
    refetchInterval: following && !paused ? 5000 : false,
  });

  const logs = Array.isArray(baseQ.data) ? baseQ.data : [];

  // 服务列表从真实日志数据聚合
  const services = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => l.service && set.add(l.service));
    if (service) set.add(service);
    return [...set].sort();
  }, [logs, service]);

  useEffect(() => {
    if (following && !paused && streamRef.current) streamRef.current.scrollTop = 0;
  }, [logs, following, paused]);

  const errorCount = logs.filter((l) => l.level === 'error').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <PageHeader
        title="日志分析"
        subtitle="OpenSearch 全文检索 · 级别过滤 · 自动刷新"
        icon={<ScrollText size={22} style={{ color: 'var(--muted)' }} />}
        extra={
          <Space>
            <Tooltip title={paused ? '继续自动刷新' : '暂停自动刷新'}>
              <Button
                icon={paused ? <Play size={16} /> : <Pause size={16} />}
                onClick={() => setPaused((p) => !p)}
                type={paused ? 'primary' : 'default'}
              />
            </Tooltip>
            <Tooltip title="跳到最新">
              <Button icon={<ArrowDownToLine size={16} />} onClick={() => streamRef.current && (streamRef.current.scrollTop = 0)} />
            </Tooltip>
            <Button icon={<Download size={16} />} disabled={logs.length === 0} onClick={() => exportCsv(logs)}>
              导出 CSV
            </Button>
          </Space>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--space-4)' }} className="logs-grid">
        <style>{`@media (min-width:1280px){.logs-grid{grid-template-columns:240px 1fr!important;}}`}</style>

        {/* 左栏 facet */}
        <div
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3)',
            display: 'none',
          }}
          className="logs-facet"
        >
          <style>{`@media (min-width:1280px){.logs-facet{display:block!important;}}`}</style>
          <div className="caps" style={{ fontSize: 11, color: 'var(--meta)', marginBottom: 6 }}>级别</div>
          <Segmented
            block
            value={level}
            onChange={(v) => setLevel(v as LogLevel | 'all')}
            options={[
              { label: '全部', value: 'all' },
              { label: 'ERROR', value: 'error' },
              { label: 'WARN', value: 'warn' },
              { label: 'INFO', value: 'info' },
              { label: 'DEBUG', value: 'debug' },
            ]}
          />
          <div className="caps" style={{ fontSize: 11, color: 'var(--meta)', margin: 'var(--space-3) 0 6px' }}>服务</div>
          <Select
            allowClear
            placeholder="全部服务"
            style={{ width: '100%' }}
            value={service}
            onChange={setService}
            options={services.map((s) => ({ value: s, label: s }))}
          />
          <div style={{ marginTop: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--danger)' }}>
            <XCircle size={14} /> ERROR：{errorCount}
          </div>
        </div>

        {/* 主流 */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border-soft)', display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <Input
              prefix={<Search size={16} />}
              placeholder="搜索日志关键字（回车检索）"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onPressEnter={() => baseQ.refetch()}
              style={{ flex: 1 }}
            />
            <Segmented
              value={level}
              onChange={(v) => setLevel(v as LogLevel | 'all')}
              options={[
                { label: 'ALL', value: 'all' },
                { label: 'ERR', value: 'error' },
                { label: 'WARN', value: 'warn' },
                { label: 'INFO', value: 'info' },
                { label: 'DEBUG', value: 'debug' },
              ]}
            />
            <Tooltip title="自动刷新（每 5 秒）">
              <Switch checked={following} onChange={setFollowing} />
            </Tooltip>
          </div>

          <div
            ref={streamRef}
            className="mono"
            style={{ height: 'calc(100vh - 320px)', minHeight: 360, overflowY: 'auto', padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--font-size-sm)', lineHeight: 1.7 }}
          >
            {logs.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={baseQ.isLoading ? '检索中…' : '无匹配日志'} style={{ marginTop: 80 }} />
            ) : (
              logs.map((l, i) => (
                <div
                  key={i}
                  onClick={() => setSelected(l)}
                  style={{
                    display: 'flex',
                    gap: 10,
                    padding: '1px 4px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    color: 'var(--fg)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ color: 'var(--meta)', flexShrink: 0 }}>{new Date(l.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}</span>
                  <span style={{ flexShrink: 0 }}><LevelTag level={l.level} /></span>
                  <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{l.service}</span>
                  <span style={{ color: 'var(--fg-2)' }}>{highlight(l.message, q)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <Drawer
        title="日志详情"
        width={520}
        open={!!selected}
        onClose={() => setSelected(null)}
        styles={{ body: { background: 'var(--bg)' } }}
        extra={<Copy size={16} style={{ color: 'var(--muted)', cursor: 'pointer' }} onClick={() => selected && navigator.clipboard?.writeText(JSON.stringify(selected, null, 2)) } />}
      >
        {selected && (
          <div className="mono" style={{ fontSize: 'var(--font-size-sm)', lineHeight: 1.8 }}>
            <div style={{ color: 'var(--meta)' }}>时间：{new Date(selected.timestamp).toLocaleString('zh-CN')}</div>
            <div style={{ color: 'var(--meta)' }}>级别：<LevelTag level={selected.level} /></div>
            <div style={{ color: 'var(--meta)' }}>服务：{selected.service}</div>
            <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--surface)', borderRadius: 'var(--radius-md)', color: 'var(--fg)' }}>
              {selected.message}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
