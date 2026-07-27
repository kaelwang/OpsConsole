import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Form, Input, Modal, Space, Table, Tag } from 'antd';
import {
  AlertTriangle,
  GitBranch,
  ListFilter,
  RefreshCw,
  Rocket,
  Undo2,
  Workflow,
} from '@/components/icons';
import { PageHeader } from '@/components/PageHeader';
import { pipelineTag, deploymentTag } from '@/components/status';
import {
  listPipelines,
  listRecentDeployments,
  triggerDeployment,
  rollbackDeployment,
} from '@/services/api/deployment';
import type { Deployment, Pipeline, PipelineStatus } from '@/types/api';

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

export function PipelinesPage() {
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('');
  const [triggerOpen, setTriggerOpen] = useState(false);

  const pipelinesQ = useQuery({ queryKey: ['pipelines'], queryFn: () => listPipelines() });
  const deploysQ = useQuery({ queryKey: ['deployments', 'recent'], queryFn: listRecentDeployments });

  const trigger = useMutation({
    mutationFn: (v: { projectId: string; ref: string }) => triggerDeployment(v.projectId, v.ref),
    onSuccess: () => {
      message.success('已触发部署（已记审计）');
      setTriggerOpen(false);
      qc.invalidateQueries({ queryKey: ['pipelines'] });
      qc.invalidateQueries({ queryKey: ['deployments'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const rollback = useMutation({
    mutationFn: (id: string) => rollbackDeployment(id),
    onSuccess: () => {
      message.success('已回滚（已记审计）');
      qc.invalidateQueries({ queryKey: ['deployments'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const confirmRollback = (d: Deployment) => {
    modal.confirm({
      title: '确认回滚',
      icon: <AlertTriangle size={20} style={{ color: 'var(--danger)' }} />,
      content: `确认回滚部署 ${d.name}（${d.ref}）？此操作将记审计。`,
      okText: '确认回滚',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => rollback.mutate(d.id),
    });
  };

  const pipelines = useMemo(() => {
    const list = pipelinesQ.data ?? [];
    return filter ? list.filter((p) => p.name?.toLowerCase().includes(filter.toLowerCase()) || p.ref?.toLowerCase().includes(filter.toLowerCase())) : list;
  }, [pipelinesQ.data, filter]);

  const pipelineCols: any[] = [
    { title: '流水线', dataIndex: 'name', render: (v: string, p: Pipeline) => <span style={{ fontWeight: 500, color: 'var(--fg)' }}>{v || `#${p.id}`}</span> },
    { title: '分支 / Ref', dataIndex: 'ref', width: 180, render: (v: string) => <span className="mono" style={{ color: 'var(--fg-2)', fontSize: 'var(--font-size-sm)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><GitBranch size={14} />{v}</span> },
    { title: '状态', dataIndex: 'status', width: 110, render: (v: PipelineStatus) => pipelineTag(v) },
    { title: '创建时间', dataIndex: 'created_at', width: 140, render: (v?: string) => <span className="mono" style={{ color: 'var(--meta)', fontSize: 'var(--font-size-xs)' }}>{v ? fmt(v) : '—'}</span> },
    {
      title: '链接',
      dataIndex: 'web_url',
      width: 110,
      render: (v: string) =>
        v ? (
          <a href={v} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 'var(--font-size-sm)' }}>
            GitLab ↗
          </a>
        ) : (
          <span style={{ color: 'var(--meta)' }}>—</span>
        ),
    },
  ];

  const deployCols: any[] = [
    { title: '部署', dataIndex: 'name', render: (v: string) => <span style={{ fontWeight: 500, color: 'var(--fg)' }}>{v}</span> },
    { title: '项目', dataIndex: 'projectId', width: 140, render: (v: string) => <span className="mono" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--fg-2)' }}>{v}</span> },
    { title: 'Ref', dataIndex: 'ref', width: 140, render: (v: string) => <Tag style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{v}</Tag> },
    { title: '状态', dataIndex: 'status', width: 110, render: (v: Deployment['status']) => deploymentTag(v) },
    { title: '时间', dataIndex: 'createdAt', width: 140, render: (v: string) => <span className="mono" style={{ color: 'var(--meta)', fontSize: 'var(--font-size-xs)' }}>{fmt(v)}</span> },
    {
      title: '操作',
      width: 100,
      render: (_: unknown, d: Deployment) => (
        <Button
          size="small"
          danger
          icon={<Undo2 size={14} />}
          disabled={d.status === 'rolled_back'}
          onClick={() => confirmRollback(d)}
        >
          回滚
        </Button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <PageHeader
        title="流水线 / 交付"
        subtitle="GitLab CI-CD 状态总览 · 触发与回滚"
        icon={<Workflow size={22} style={{ color: 'var(--muted)' }} />}
        extra={
          <Space>
            <Button icon={<RefreshCw size={16} />} onClick={() => { pipelinesQ.refetch(); deploysQ.refetch(); }}>刷新</Button>
            <Button type="primary" icon={<Rocket size={16} />} onClick={() => setTriggerOpen(true)}>
              触发部署
            </Button>
          </Space>
        }
      />

      <Input
        prefix={<ListFilter size={16} />}
        placeholder="按流水线名称 / 分支过滤"
        allowClear
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ maxWidth: 320 }}
      />

      <Card
        title="流水线（GitLab）"
        styles={{ body: { padding: 0 } }}
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
      >
        <Table
          rowKey="id"
          size="small"
          loading={pipelinesQ.isLoading}
          columns={pipelineCols}
          dataSource={pipelines}
          pagination={false}
          locale={{ emptyText: pipelinesQ.isError ? 'CI/CD 服务未配置或不可用' : '暂无流水线' }}
        />
      </Card>

      <Card
        title="部署历史"
        styles={{ body: { padding: 0 } }}
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
      >
        <Table
          rowKey="id"
          size="small"
          loading={deploysQ.isLoading}
          columns={deployCols}
          dataSource={deploysQ.data ?? []}
          pagination={false}
        />
      </Card>

      <Modal
        title="触发部署"
        open={triggerOpen}
        onCancel={() => setTriggerOpen(false)}
        onOk={() => document.getElementById('trigger-form-submit')?.click()}
        okText="触发"
        confirmLoading={trigger.isPending}
      >
        <Form
          id="trigger-form"
          layout="vertical"
          onFinish={(v) => trigger.mutate({ projectId: v.projectId, ref: v.ref })}
        >
          <button id="trigger-form-submit" type="submit" style={{ display: 'none' }} form="trigger-form" />
          <Form.Item name="projectId" label="GitLab 项目 ID" rules={[{ required: true, message: '请输入项目 ID' }]}>
            <Input className="mono" placeholder="如 123" />
          </Form.Item>
          <Form.Item name="ref" label="分支 / Ref" initialValue="main" rules={[{ required: true, message: '请输入分支' }]}>
            <Input className="mono" placeholder="main" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
