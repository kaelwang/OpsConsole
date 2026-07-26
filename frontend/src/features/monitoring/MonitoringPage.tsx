import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Card,
  Col,
  Dropdown,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Row,
  Segmented,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from 'antd';
import {
  CheckCircle2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  VolumeX,
  Webhook,
} from '@/components/icons';
import { PageHeader } from '@/components/PageHeader';
import { ReactECharts } from '@/components/chart';
import {
  severityIcon,
  severityTag,
  severityVar,
} from '@/components/status';
import { barOption, gaugeOption, genSeries, lineOption } from './charts';
import { listAlertRules, createAlertRule, listAlerts, listChannels } from '@/services/api/monitoring';
import type { AlertRule, AlertSeverity, ChannelType } from '@/types/api';

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

const PANELS = [
  { key: 'cpu', title: 'CPU 使用率', unit: '%', colorIdx: 0, thresholds: { warn: 70, danger: 85 }, kind: 'line' },
  { key: 'mem', title: '内存使用率', unit: '%', colorIdx: 1, thresholds: { warn: 80, danger: 90 }, kind: 'line' },
  { key: 'net', title: '网络吞吐', unit: '%', colorIdx: 3, thresholds: { warn: 75, danger: 90 }, kind: 'line' },
  { key: 'disk', title: '磁盘 IO', unit: 'MB/s', colorIdx: 2, kind: 'bar' },
  { key: 'sat', title: '集群饱和度', unit: '%', kind: 'gauge', value: 72 },
  { key: 'ok', title: '请求成功率', unit: '%', kind: 'gauge', value: 99 },
] as const;

const CHANNEL_LABEL: Record<ChannelType, string> = {
  email: '邮件',
  webhook: 'Webhook',
  wecom: '企业微信',
  dingtalk: '钉钉',
  feishu: '飞书',
};

export function MonitoringPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [range, setRange] = useState('6h');
  const [ruleModal, setRuleModal] = useState(false);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});

  const rulesQ = useQuery({ queryKey: ['alert-rules'], queryFn: listAlertRules });
  const alertsQ = useQuery({ queryKey: ['alerts', 'monitor'], queryFn: () => listAlerts({ page: 1, limit: 20 }) });
  const channelsQ = useQuery({ queryKey: ['channels'], queryFn: listChannels });

  const series = useMemo(
    () => ({
      cpu: genSeries(63, 12),
      mem: genSeries(71, 10),
      net: genSeries(38, 14),
      disk: genSeries(44, 20, 16),
    }),
    [],
  );

  const createRule = useMutation({
    mutationFn: (v: { expr: string; severity: AlertSeverity; for: string }) => createAlertRule(v),
    onSuccess: () => {
      message.success('告警规则已创建');
      setRuleModal(false);
      qc.invalidateQueries({ queryKey: ['alert-rules'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const rules = rulesQ.data ?? [];
  const alerts = alertsQ.data?.items ?? [];
  const channels = channelsQ.data ?? [];

  const ruleColumns: any[] = [
    { title: '表达式', dataIndex: 'expr', render: (v: string) => <span className="mono" style={{ fontSize: 'var(--font-size-sm)' }}>{v}</span> },
    { title: '持续', dataIndex: 'for', width: 80, render: (v: string) => <span className="mono" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>{v}</span> },
    { title: '严重度', dataIndex: 'severity', width: 100, render: (v: AlertSeverity) => severityTag(v) },
    {
      title: '通知渠道',
      dataIndex: 'channelIds',
      render: (ids: string[]) =>
        ids.map((id) => {
          const ch = channels.find((c) => c.id === id);
          return ch ? <Tag key={id} style={{ fontSize: 11 }}>{CHANNEL_LABEL[ch.type]}</Tag> : null;
        }),
    },
    {
      title: '启用',
      width: 80,
      render: (_: unknown, r: AlertRule) => (
        <Switch
          size="small"
          checked={enabled[r.id] ?? true}
          onChange={(c) => setEnabled((s) => ({ ...s, [r.id]: c }))}
        />
      ),
    },
    {
      title: '操作',
      width: 80,
      render: () => (
        <Dropdown
          menu={{
            items: [
              { key: 'edit', label: '编辑规则' },
              { key: 'toggle', label: '启停' },
              { type: 'divider' },
              { key: 'del', label: '删除', danger: true },
            ],
          }}
        >
          <Button type="text" size="small" icon={<MoreHorizontal size={16} />} />
        </Dropdown>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <PageHeader
        title="监控告警"
        subtitle="PromQL 看板 · 告警规则 · 活跃事件"
        icon={<SlidersHorizontal size={22} style={{ color: 'var(--muted)' }} />}
        extra={
          <Space>
            <Segmented
              value={range}
              onChange={(v) => setRange(v as string)}
              options={[
                { label: '1 小时', value: '1h' },
                { label: '6 小时', value: '6h' },
                { label: '24 小时', value: '24h' },
              ]}
            />
            <Button icon={<RefreshCw size={16} />} onClick={() => { rulesQ.refetch(); alertsQ.refetch(); }}>
              刷新
            </Button>
            <Button icon={<Webhook size={16} />} onClick={() => channelsQ.refetch()}>
              通知渠道
            </Button>
          </Space>
        }
      />

      <Row gutter={[16, 16]}>
        {PANELS.map((p) => {
          const value = p.kind === 'gauge' ? p.value : (series[p.key as keyof typeof series] ?? [])[ (series[p.key as keyof typeof series]?.length ?? 1) - 1 ] ?? 0;
          return (
            <Col xs={24} md={12} xxl={8} key={p.key}>
              <Card
                styles={{ body: { padding: 'var(--space-4)' } }}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>{p.title}</span>
                  <span className="mono" style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, color: 'var(--fg)' }}>
                    {typeof value === 'number' ? value : 0}
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)', marginLeft: 2 }}>{p.unit}</span>
                  </span>
                </div>
                {p.kind === 'line' && (
                  <ReactECharts option={lineOption(p.title, series[p.key as keyof typeof series] as number[], p.colorIdx, p.thresholds)} height={180} />
                )}
                {p.kind === 'bar' && (
                  <ReactECharts option={barOption(p.title, series.disk, p.colorIdx)} height={180} />
                )}
                {p.kind === 'gauge' && <ReactECharts option={gaugeOption(p.value ?? 0, p.title)} height={180} />}
              </Card>
            </Col>
          );
        })}
      </Row>

      <Card
        styles={{ body: { padding: 'var(--space-4)' } }}
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <SlidersHorizontal size={18} style={{ color: 'var(--muted)' }} /> 告警规则
          </span>
        }
        extra={
          <Button type="primary" icon={<Plus size={16} />} onClick={() => setRuleModal(true)}>
            新建规则
          </Button>
        }
      >
        <Table rowKey="id" size="small" pagination={false} columns={ruleColumns} dataSource={rules} />
      </Card>

      <Card
        styles={{ body: { padding: 'var(--space-4)' } }}
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
        title="活跃告警"
      >
        {alerts.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前无活跃告警" />
        ) : (
          <List
            itemLayout="horizontal"
            dataSource={alerts}
            renderItem={(a) => (
              <List.Item
                style={{ padding: '10px 0', borderBottom: '1px solid var(--border-soft)' }}
                actions={[
                  <Button key="ack" type="text" size="small" icon={<CheckCircle2 size={16} />} style={{ color: 'var(--success)' }} onClick={() => message.success('已确认告警')}>确认</Button>,
                  <Button key="sil" type="text" size="small" icon={<VolumeX size={16} />} style={{ color: 'var(--muted)' }} onClick={() => message.success('已静默 1 小时')}>静默</Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={<span style={{ color: severityVar(a.severity), display: 'flex', marginTop: 2 }}>{severityIcon(a.severity)}</span>}
                  title={<span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--fg)' }}>{a.summary}</span>}
                  description={
                    <span className="mono" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--meta)' }}>
                      {a.labels.cluster ?? a.labels.namespace ?? a.labels.node ?? '—'} · {fmt(a.firedAt)} · {a.status === 'firing' ? '触发中' : '已恢复'}
                    </span>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>

      <Modal
        title="新建告警规则"
        open={ruleModal}
        onCancel={() => setRuleModal(false)}
        onOk={() => document.getElementById('rule-form-submit')?.click()}
        okText="创建"
      >
        <Form
          id="rule-form"
          layout="vertical"
          onFinish={(v) => createRule.mutate({ expr: v.expr, severity: v.severity, for: v.for ?? '5m' })}
        >
          <button id="rule-form-submit" type="submit" style={{ display: 'none' }} form="rule-form" />
          <Form.Item name="expr" label="PromQL 表达式" rules={[{ required: true, message: '请输入表达式' }]}>
            <Input className="mono" placeholder="cpu_usage_percent > 85" />
          </Form.Item>
          <Form.Item name="severity" label="严重度" initialValue="critical">
            <Select
              options={[
                { value: 'critical', label: '严重' },
                { value: 'warning', label: '警告' },
                { value: 'info', label: '提示' },
              ]}
            />
          </Form.Item>
          <Form.Item name="for" label="持续时长" initialValue="5m">
            <Input className="mono" placeholder="5m" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
