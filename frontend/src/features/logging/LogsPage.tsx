import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Drawer, Empty, Input, Segmented, Select, Space, Switch, Tooltip } from 'antd';
import {
  AlertTriangle,
  ArrowDownToLine,
  Bug,
  Copy,
  Download,
  Info,
  ListFilter,
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

const SERVICES = ['api-gateway', 'order-service', 'auth-service', 'payment-worker', 'data-pipeline'];
const MSGS: Record<LogLevel, string[]> = {
  debug: ['配置加载完成 config=app.yaml', '连接池复用 conn=12'],
  info: ['处理请求 method=POST path=/v1/orders latency=42ms', '健康检查通过 endpoint=/healthz'],
  warn: ['数据库连接等待 time=820ms', '内存水位偏高 usage=86%'],
  error: ['下游服务 503 service=payment-worker', '连接数据库超时 retry=3'],
};

function makeLine(prev?: LogEntry): LogEntry {
  const level = (['debug', 'info', 'warn', 'error'] as LogLevel[])[Math.floor(Math.random() * 4)];
  const service = SERVICES[Math.floor(Math.random() * SERVICES.length)];
  const pool = MSGS[level];
  return {
    timestamp: prev ? new Date(new Date(prev.timestamp).getTime() + 1200).toISOString() : new Date().toISOString(),
    level,
    service,
    message: pool[Math.floor(Math.random() * pool.length)],
    pod: `${service.split('-')[0]}-${Math.random().toString(36).slice(2, 7)}`,
  };
}

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

export function LogsPage() {
  const [q, setQ] = useState('');
  const [level, setLevel] = useState<LogLevel | 'all'>('all');
  const [service, setService] = useState<string | undefined>();
  const [following, setFollowing] = useState(true);
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<LogEntry | null>(null);
  const [live, setLive] = useState<LogEntry[]>([]);
  const streamRef = useRef<HTMLDivElement>(null);

  const baseQ = useQuery({
    queryKey: ['logs', q, level, service],
    queryFn: () => searchLogs({ q: q || undefined, level: level === 'all' ? undefined : level, service, limit: 80 }),
  });

  const logs = useMemo(() => [...live, ...(baseQ.data ?? [])].slice(0, 400), [live, baseQ.data]);

  // 模拟实时流（跟随 + 未暂停时追加）
  useEffect(() => {
    if (!following || paused) return;
    const id = setInterval(() => {
      setLive((prev) => {
        const last = prev[0] ?? baseQ.data?.[0];
        return [makeLine(last), ...prev].slice(0, 200);
      });
    }, 1600);
    return () => clearInterval(id);
  }, [following, paused, baseQ.data]);

  useEffect(() => {
    if (following && !paused && streamRef.current) streamRef.current.scrollTop = 0;
  }, [logs, following, paused]);

  const errorCount = logs.filter((l) => l.level === 'error').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <PageHeader
        title="日志分析"
        subtitle="等宽高亮日志流 · 级别过滤 · 上下文下钻"
        icon={<ScrollText size={22} style={{ color: 'var(--muted)' }} />}
        extra={
          <Space>
            <Tooltip title={paused ? '继续跟随' : '暂停跟随'}>
              <Button
                icon={paused ? <Play size={16} /> : <Pause size={16} />}
                onClick={() => setPaused((p) => !p)}
                type={paused ? 'primary' : 'default'}
              />
            </Tooltip>
            <Tooltip title="跳到最新">
              <Button icon={<ArrowDownToLine size={16} />} onClick={() => streamRef.current && (streamRef.current.scrollTop = 0)} />
            </Tooltip>
            <Button icon={<Download size={16} />} onClick={() => alert('已导出最近 ' + logs.length + ' 条日志为 CSV（演示）')}>
              导出
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
            options={SERVICES.map((s) => ({ value: s, label: s }))}
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
            <Tooltip title="模拟实时流">
              <Switch checked={following} onChange={setFollowing} />
            </Tooltip>
          </div>

          <div
            ref={streamRef}
            className="mono"
            style={{ height: 'calc(100vh - 320px)', minHeight: 360, overflowY: 'auto', padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--font-size-sm)', lineHeight: 1.7 }}
          >
            {logs.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无匹配日志" style={{ marginTop: 80 }} />
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
                  <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{l.pod}</span>
                  <span style={{ color: 'var(--fg-2)' }}>{highlight(l.message, q)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <Drawer
        title="日志上下文"
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
            <div style={{ color: 'var(--meta)' }}>Pod：{selected.pod}</div>
            <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--surface)', borderRadius: 'var(--radius-md)', color: 'var(--fg)' }}>
              {selected.message}
            </div>
            <div style={{ marginTop: 'var(--space-4)', color: 'var(--muted)', fontSize: 'var(--font-size-xs)' }}>
              上下文（同服务前后各 3 条，演示数据）
            </div>
            {Array.from({ length: 6 }).map((_, k) => {
              const d = new Date(new Date(selected.timestamp).getTime() + (k - 3) * 1200).toLocaleTimeString('zh-CN', { hour12: false });
              return (
                <div key={k} style={{ opacity: k === 3 ? 1 : 0.55, padding: '2px 0' }}>
                  <span style={{ color: 'var(--meta)' }}>{d} </span>
                  <span style={{ color: 'var(--fg-2)' }}>{MSGS[selected.level][k % 2]}</span>
                </div>
              );
            })}
          </div>
        )}
      </Drawer>
    </div>
  );
}
