import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, DatePicker, Drawer, Empty, Input, Select, Space, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import {
  ChevronRight,
  Download,
  Filter,
  History,
  Inbox,
  RefreshCw,
  Search,
  User as UserIcon,
  UserCog,
} from '@/components/icons';
import { PageHeader } from '@/components/PageHeader';
import { auditTag } from '@/components/status';
import { listAudit } from '@/services/api/audit';
import type { AuditLog } from '@/types/api';

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('zh-CN', { hour12: false });

function exportCsv(logs: AuditLog[]) {
  const esc = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = [
    'createdAt,userId,action,resource,ok,detail',
    ...logs.map((l) => [l.createdAt, l.userId, l.action, l.resource, l.ok, l.detail].map(esc).join(',')),
  ];
  const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `audit-${new Date().toISOString().slice(0, 19)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function AuditPage() {
  const [q, setQ] = useState('');
  const [actorId, setActorId] = useState<string>();
  const [action, setAction] = useState<string>();
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<AuditLog | null>(null);

  const auditQ = useQuery({
    queryKey: ['audit', 'page', page],
    queryFn: () => listAudit({ page, limit: 20 }),
  });

  const raw = auditQ.data?.items ?? [];
  // 客户端二次过滤（后端分页 + 前端过滤当前页）
  const data = useMemo(
    () =>
      raw.filter((d) => {
        if (q && !`${d.action} ${d.resource} ${d.userId} ${d.detail}`.toLowerCase().includes(q.toLowerCase())) return false;
        if (actorId && d.userId !== actorId) return false;
        if (action && d.action !== action) return false;
        return true;
      }),
    [raw, q, actorId, action],
  );
  const actorOptions = useMemo(() => {
    const set = new Set<string>();
    raw.forEach((d) => set.add(d.userId));
    return [...set].map((id) => ({ value: id, label: id }));
  }, [raw]);
  const actionOptions = useMemo(() => {
    const set = new Set<string>();
    raw.forEach((d) => set.add(d.action));
    return [...set].sort().map((a) => ({ value: a, label: a }));
  }, [raw]);

  const columns: any[] = [
    { title: '时间', dataIndex: 'createdAt', width: 150, render: (v: string) => <span className="mono" style={{ color: 'var(--meta)', fontSize: 'var(--font-size-xs)' }}>{fmt(v)}</span> },
    {
      title: '操作者',
      dataIndex: 'userId',
      width: 200,
      render: (v: string) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <UserIcon size={14} style={{ color: 'var(--muted)' }} />
          <span className="mono" style={{ fontSize: 'var(--font-size-xs)' }}>{v}</span>
        </span>
      ),
    },
    { title: '动作', dataIndex: 'action', width: 150, render: (v: string) => <Tag style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{v}</Tag> },
    { title: '对象', dataIndex: 'resource', render: (v: string) => <span className="mono" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--fg-2)' }}>{v}</span> },
    { title: '结果', dataIndex: 'ok', width: 90, render: (v: boolean) => auditTag(v ? 'success' : 'failure') },
    {
      title: '',
      width: 48,
      render: (_: unknown, r: AuditLog) => (
        <Button type="text" size="small" icon={<ChevronRight size={16} />} onClick={() => setSel(r)} />
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <PageHeader
        title="审计日志"
        subtitle="关键操作留痕：谁 / 何时 / 对什么 / 做了什么（普通用户不可删）"
        icon={<History size={22} style={{ color: 'var(--muted)' }} />}
        extra={
          <Space>
            <Button icon={<Download size={16} />} disabled={data.length === 0} onClick={() => exportCsv(data)}>导出 CSV</Button>
            <Button icon={<RefreshCw size={16} />} onClick={() => auditQ.refetch()}>刷新</Button>
          </Space>
        }
      />

      <Card
        styles={{ body: { padding: 'var(--space-3)' } }}
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
      >
        <Space wrap size="small">
          <Input prefix={<Search size={16} />} placeholder="搜索动作 / 对象 / 操作者" allowClear value={q} onChange={(e) => setQ(e.target.value)} onPressEnter={() => setPage(1)} style={{ width: 240 }} />
          <Select placeholder="操作者" allowClear style={{ minWidth: 180 }} value={actorId} onChange={(v) => { setActorId(v); setPage(1); }} options={actorOptions} />
          <Select placeholder="动作" allowClear style={{ minWidth: 160 }} value={action} onChange={(v) => { setAction(v); setPage(1); }} options={actionOptions} />
          <DatePicker.RangePicker
            value={range}
            onChange={(v) => setRange(v as [dayjs.Dayjs, dayjs.Dayjs] | null)}
            placeholder={['开始', '结束']}
          />
          <Button icon={<Filter size={16} />} onClick={() => setPage(1)}>筛选</Button>
        </Space>
      </Card>

      <Card
        styles={{ body: { padding: 0 } }}
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
      >
        <Table
          rowKey="id"
          size="small"
          loading={auditQ.isLoading}
          columns={columns}
          dataSource={data}
          scroll={{ x: 900 }}
          pagination={{
            current: page,
            pageSize: 20,
            total: auditQ.data?.total ?? 0,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p) => setPage(p),
          }}
        />
        {!auditQ.isLoading && data.length === 0 && (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Inbox size={16} /> 无匹配审计事件</span>} style={{ padding: 40 }} />
        )}
      </Card>

      <Drawer
        title="审计详情"
        width={460}
        open={!!sel}
        onClose={() => setSel(null)}
        styles={{ body: { background: 'var(--surface)' } }}
      >
        {sel && (
          <div className="mono" style={{ fontSize: 'var(--font-size-sm)', lineHeight: 1.9 }}>
            <div style={{ color: 'var(--meta)' }}>操作者：{sel.userId}</div>
            <div style={{ color: 'var(--meta)' }}>动作：<Tag style={{ fontFamily: 'var(--font-mono)' }}>{sel.action}</Tag></div>
            <div style={{ color: 'var(--meta)' }}>对象：{sel.resource}</div>
            <div style={{ color: 'var(--meta)' }}>结果：{sel.ok ? '成功' : '失败'}</div>
            <div style={{ color: 'var(--meta)' }}>时间：{fmt(sel.createdAt)}</div>
            <div style={{ marginTop: 'var(--space-3)', color: 'var(--fg)' }}>
              详情：<span style={{ color: 'var(--fg-2)' }}>{sel.detail || '—'}</span>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
