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

const ACTIONS = [
  'login.success', 'role.assign', 'cluster.register', 'pipeline.trigger',
  'pipeline.rollback', 'pod.restart', 'alertrule.create', 'channel.create', 'scope.switch',
];

export function AuditPage() {
  const [q, setQ] = useState('');
  const [actorId, setActorId] = useState<string>();
  const [action, setAction] = useState<string>();
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<AuditLog | null>(null);

  const auditQ = useQuery({
    queryKey: ['audit', 'page', page, q, actorId, action],
    queryFn: () => listAudit({ page, limit: 20, q: q || undefined, actorId }),
  });

  const data = auditQ.data?.items ?? [];
  const actorOptions = useMemo(() => {
    const map = new Map<string, string>();
    data.forEach((d) => map.set(d.actorId, d.actorName));
    return Array.from(map.entries()).map(([id, name]) => ({ value: id, label: `${name}（${id}）` }));
  }, [data]);

  const columns: any[] = [
    { title: '时间', dataIndex: 'createdAt', width: 150, render: (v: string) => <span className="mono" style={{ color: 'var(--meta)', fontSize: 'var(--font-size-xs)' }}>{fmt(v)}</span> },
    {
      title: '操作者',
      dataIndex: 'actorName',
      width: 170,
      render: (v: string, r: AuditLog) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <UserIcon size={14} style={{ color: 'var(--muted)' }} />
          <span style={{ fontSize: 'var(--font-size-sm)' }}>{v}</span>
          <span className="mono" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--meta)' }}>{r.actorId}</span>
        </span>
      ),
    },
    {
      title: '模拟身份',
      dataIndex: 'impersonatedAs',
      width: 150,
      render: (v?: string) =>
        v ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--fg-2)', fontSize: 'var(--font-size-sm)' }}>
            <UserCog size={14} style={{ color: 'var(--muted)' }} /> {v}
          </span>
        ) : (
          <span style={{ color: 'var(--meta)' }}>—</span>
        ),
    },
    { title: '动作', dataIndex: 'action', width: 150, render: (v: string) => <Tag style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{v}</Tag> },
    { title: '对象', dataIndex: 'object', render: (v: string) => <span className="mono" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--fg-2)' }}>{v}</span> },
    { title: '结果', dataIndex: 'result', width: 90, render: (v: AuditLog['result']) => auditTag(v) },
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
            <Button icon={<Download size={16} />} onClick={() => alert('已导出当前筛选结果为 CSV（演示）')}>导出</Button>
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
          <Select placeholder="动作" allowClear style={{ minWidth: 160 }} value={action} onChange={(v) => { setAction(v); setPage(1); }} options={ACTIONS.map((a) => ({ value: a, label: a }))} />
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
            <div style={{ color: 'var(--meta)' }}>操作者：{sel.actorName}（{sel.actorId}）</div>
            <div style={{ color: 'var(--meta)' }}>模拟身份：{sel.impersonatedAs ?? '—'}</div>
            <div style={{ color: 'var(--meta)' }}>动作：<Tag style={{ fontFamily: 'var(--font-mono)' }}>{sel.action}</Tag></div>
            <div style={{ color: 'var(--meta)' }}>对象：{sel.object}</div>
            <div style={{ color: 'var(--meta)' }}>结果：{sel.result}</div>
            <div style={{ color: 'var(--meta)' }}>时间：{fmt(sel.createdAt)}</div>
            <div style={{ color: 'var(--meta)' }}>IP：{sel.ip ?? '—'}</div>
            <div style={{ color: 'var(--meta)' }}>User-Agent：{sel.userAgent ?? '—'}</div>
            <div style={{ marginTop: 'var(--space-3)', color: 'var(--fg)' }}>
              变更前：<span style={{ color: 'var(--danger)' }}>{sel.before ?? '—'}</span>
            </div>
            <div style={{ color: 'var(--fg)' }}>
              变更后：<span style={{ color: 'var(--success)' }}>{sel.after ?? '—'}</span>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
