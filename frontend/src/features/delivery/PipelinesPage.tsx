import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { App, Button, Drawer, Dropdown, Input, Modal, Segmented, Space, Table, Tag, Timeline } from 'antd';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  GitBranch,
  ListFilter,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  RotateCw,
  Rocket,
  ScrollText,
  Undo2,
  Workflow,
  XCircle,
} from '@/components/icons';
import { PageHeader } from '@/components/PageHeader';
import { pipelineTag } from '@/components/status';
import { listPipelines, triggerPipeline, rollbackPipeline } from '@/services/api/deployment';
import type { Pipeline, PipelineStatus } from '@/types/api';

function stageIcon(s: PipelineStatus) {
  return s === 'success' ? <CheckCircle2 size={16} color="var(--success)" /> : s === 'failed' ? <XCircle size={16} color="var(--danger)" /> : s === 'running' ? <Loader2 size={16} className="spin" color="var(--accent)" /> : <Clock size={16} color="var(--muted)" />;
}

function buildStages(p: Pipeline) {
  const failed = p.status === 'failed';
  const running = p.status === 'running';
  return [
    { name: '拉取代码', status: 'success' as PipelineStatus, durationSec: 28 },
    { name: '构建镜像', status: (failed ? 'failed' : 'success') as PipelineStatus, durationSec: 96 },
    { name: '部署', status: (failed ? 'failed' : running ? 'running' : 'success') as PipelineStatus, durationSec: 64 },
    { name: '健康检查', status: (failed ? 'failed' : running ? 'running' : 'success') as PipelineStatus, durationSec: 26 },
  ];
}

export function PipelinesPage() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [env, setEnv] = useState('prod');
  const [detail, setDetail] = useState<Pipeline | null>(null);

  const pipelinesQ = useQuery({ queryKey: ['pipelines'], queryFn: listPipelines });

  const trigger = useMutation({
    mutationFn: (id: string) => triggerPipeline(id),
    onSuccess: () => { message.success('已触发流水线'); qc.invalidateQueries({ queryKey: ['pipelines'] }); },
    onError: (e: Error) => message.error(e.message),
  });
  const rollback = useMutation({
    mutationFn: (id: string) => rollbackPipeline(id),
    onSuccess: (d) => { message.success(`已回滚至 ${d.version}（已记审计）`); qc.invalidateQueries({ queryKey: ['pipelines'] }); },
    onError: (e: Error) => message.error(e.message),
  });

  const confirmRollback = (p: Pipeline) => {
    modal.confirm({
      title: '确认回滚',
      icon: <AlertTriangle size={20} style={{ color: 'var(--danger)' }} />,
      content: `确认回滚 ${p.name} 至上一稳定版本 ${p.version}？此操作将记审计。`,
      okText: '确认回滚',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => rollback.mutate(p.id),
    });
  };

  const columns: any[] = [
    { title: '流水线', dataIndex: 'name', render: (v: string) => <span style={{ fontWeight: 500, color: 'var(--fg)' }}>{v}</span> },
    { title: '分支', dataIndex: 'branch', width: 140, render: (v: string) => <span className="mono" style={{ color: 'var(--fg-2)', fontSize: 'var(--font-size-sm)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><GitBranch size={14} />{v}</span> },
    { title: '版本', dataIndex: 'version', width: 110, render: (v: string) => <span className="mono" style={{ fontSize: 'var(--font-size-sm)' }}>{v}</span> },
    { title: '环境', dataIndex: 'env', width: 90, render: (v: string) => <Tag style={{ fontSize: 11 }}>{v}</Tag> },
    { title: '状态', dataIndex: 'status', width: 110, render: (v: PipelineStatus) => pipelineTag(v) },
    { title: '耗时', dataIndex: 'durationSec', width: 90, render: (v: number) => <span className="mono" style={{ color: 'var(--muted)', fontSize: 'var(--font-size-sm)' }}>{v}s</span> },
    {
      title: '操作',
      width: 120,
      render: (_: unknown, p: Pipeline) => (
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'log', icon: <ScrollText size={16} />, label: '查看日志', onClick: () => navigate('/observability/logs') },
              { key: 'rollback', icon: <Undo2 size={16} />, label: '回滚', danger: true, onClick: () => confirmRollback(p) },
              { key: 'restart', icon: <RotateCw size={16} />, label: '重启', onClick: () => message.success(`已重启 ${p.name}`) },
            ],
          }}
        >
          <Button type="text" size="small" icon={<MoreHorizontal size={16} />} />
        </Dropdown>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <PageHeader
        title="流水线 / 交付"
        subtitle="CI-CD 状态总览 · 触发与回滚"
        icon={<Workflow size={22} style={{ color: 'var(--muted)' }} />}
        extra={
          <Space>
            <Segmented
              value={env}
              onChange={(v) => setEnv(v as string)}
              options={[
                { label: '生产', value: 'prod' },
                { label: '预发', value: 'staging' },
                { label: '边缘', value: 'edge' },
              ]}
            />
            <Button icon={<RefreshCw size={16} />} onClick={() => pipelinesQ.refetch()}>刷新</Button>
            <Button type="primary" icon={<Rocket size={16} />} onClick={() => trigger.mutate('pl-api')}>
              触发部署
            </Button>
          </Space>
        }
      />

      <Input
        prefix={<ListFilter size={16} />}
        placeholder="按流水线名称过滤"
        allowClear
        onChange={() => {}}
        style={{ maxWidth: 320 }}
      />

      <Table
        rowKey="id"
        loading={pipelinesQ.isLoading}
        columns={columns}
        dataSource={pipelinesQ.data ?? []}
        onRow={(r) => ({ onClick: () => setDetail(r), style: { cursor: 'pointer' } })}
        pagination={false}
      />

      <Drawer
        title={detail ? `流水线详情 · ${detail.name}` : ''}
        width={440}
        open={!!detail}
        onClose={() => setDetail(null)}
        styles={{ body: { background: 'var(--surface)' } }}
        extra={<ChevronRight size={18} style={{ color: 'var(--muted)' }} />}
      >
        {detail && (
          <>
            <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-5)', color: 'var(--muted)', fontSize: 'var(--font-size-sm)' }}>
              <span>分支 <span className="mono" style={{ color: 'var(--fg-2)' }}>{detail.branch}</span></span>
              <span>版本 <span className="mono" style={{ color: 'var(--fg-2)' }}>{detail.version}</span></span>
              <span>环境 <Tag>{detail.env}</Tag></span>
            </div>
            <Timeline
              items={buildStages(detail).map((s) => ({
                dot: stageIcon(s.status),
                children: (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--fg)' }}>{s.name}</span>
                    <span className="mono" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--meta)' }}>{s.durationSec}s</span>
                  </div>
                ),
              }))}
            />
            <Button danger icon={<Undo2 size={16} />} block onClick={() => detail && confirmRollback(detail)}>
              回滚至上一稳定版本
            </Button>
          </>
        )}
      </Drawer>
    </div>
  );
}
