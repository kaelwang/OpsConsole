import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Row,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
} from 'antd';
import {
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Webhook,
} from '@/components/icons';
import { PageHeader } from '@/components/PageHeader';
import { ReactECharts } from '@/components/chart';
import {
  severityIcon,
  severityTag,
  severityVar,
} from '@/components/status';
import { barOption, gaugeOption, lineOption } from './charts';
import { formatThroughput } from '@/lib/format';
import { listAlertRules, createAlertRule, listAlerts, listChannels, queryMetrics } from '@/services/api/monitoring';
import type { AlertRule, AlertSeverity, ChannelType, QueryResult } from '@/types/api';

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

const RANGE_PRESETS: Record<string, { step: number; window: number }> = {
  '1h': { step: 60, window: 3600 },
  '6h': { step: 300, window: 21600 },
  '24h': { step: 900, window: 86400 },
};

// 各趋势面板对应的 PromQL（数据源：node_exporter，经 vmagent 写入 VictoriaMetrics）
type Panel = {
  key: 'cpu' | 'mem' | 'net' | 'disk';
  title: string;
  unit: string;
  colorIdx: number;
  kind: 'line' | 'bar';
  expr: string;
  thresholds?: { warn: number; danger: number };
  adaptive?: boolean;
};

const PANELS: Panel[] = [
  { key: 'cpu', title: 'CPU 使用率', unit: '%', colorIdx: 0, thresholds: { warn: 70, danger: 85 }, kind: 'line',
    expr: '100 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100' },
  { key: 'mem', title: '内存使用率', unit: '%', colorIdx: 1, thresholds: { warn: 80, danger: 90 }, kind: 'line',
    expr: '(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100' },
  { key: 'net', title: '网络吞吐', unit: 'MB/s', colorIdx: 3, kind: 'line', adaptive: true,
    expr: '(rate(node_network_receive_bytes_total[5m]) + rate(node_network_transmit_bytes_total[5m])) / 1024 / 1024' },
  { key: 'disk', title: '磁盘 IO', unit: 'MB/s', colorIdx: 2, kind: 'bar', adaptive: true,
    expr: '(rate(node_disk_read_bytes_total[5m]) + rate(node_disk_written_bytes_total[5m])) / 1024 / 1024' },
];

const OK_EXPR = 'avg(up) * 100';

// 将 VM 返回的 matrix 结果按时间戳合并（多序列求和）为 { times, values }
function toSeries(res: QueryResult): { times: number[]; values: number[] } {
  const byTs = new Map<number, number>();
  for (const s of res.data?.result ?? []) {
    for (const [ts, val] of s.values) {
      const v = Number(val);
      if (!Number.isNaN(v)) byTs.set(ts, (byTs.get(ts) ?? 0) + v);
    }
  }
  const times = [...byTs.keys()].sort((a, b) => a - b);
  // 保留原始精度，交由显示层自适应格式化；否则低吞吐（<0.01 MB/s）会被四舍五入成 0
  return { times, values: times.map((t) => byTs.get(t) ?? 0) };
}

// 取即时向量查询的当前值（用于仪表盘）
function instantValue(res: QueryResult): number {
  const item = res.data?.result?.[0] as { value?: [number, string] } | undefined;
  if (item?.value) return Number(item.value[1]) || 0;
  const last = res.data?.result?.[0]?.values?.slice(-1)[0];
  return last ? Number(last[1]) || 0 : 0;
}

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
  const [range, setRange] = useState('1h');
  const [ruleModal, setRuleModal] = useState(false);

  const rulesQ = useQuery({ queryKey: ['alert-rules'], queryFn: listAlertRules });
  const alertsQ = useQuery({ queryKey: ['alerts', 'monitor'], queryFn: () => listAlerts({ page: 1, limit: 20 }), refetchInterval: 60_000 });
  const channelsQ = useQuery({ queryKey: ['channels'], queryFn: listChannels });

  const metricsQ = useQuery({
    queryKey: ['metrics', range],
    queryFn: async () => {
      const { step, window } = RANGE_PRESETS[range];
      const now = Math.floor(Date.now() / 1000);
      const [panels, ok] = await Promise.all([
        Promise.all(
          PANELS.map(async (p) => ({
            key: p.key,
            series: toSeries(await queryMetrics(p.expr, String(step), now - window, now)),
          })),
        ),
        queryMetrics(OK_EXPR),
      ]);
      const map: Record<string, { times: number[]; values: number[] }> = {};
      panels.forEach((p) => {
        map[p.key] = p.series;
      });
      return { map, okVal: instantValue(ok) };
    },
    refetchInterval: 60_000,
  });

  const createRule = useMutation({
    mutationFn: (v: { name: string; expr: string; severity: AlertSeverity; forSeconds: number }) => createAlertRule(v),
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
    { title: '名称', dataIndex: 'name', width: 160, render: (v: string) => <span style={{ fontWeight: 500, color: 'var(--fg)', fontSize: 'var(--font-size-sm)' }}>{v}</span> },
    { title: '表达式', dataIndex: 'expr', render: (v: string) => <span className="mono" style={{ fontSize: 'var(--font-size-sm)' }}>{v}</span> },
    {
      title: '持续',
      dataIndex: 'forSeconds',
      width: 80,
      render: (v: number) => (
        <span className="mono" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>
          {v ? `${v}s` : '—'}
        </span>
      ),
    },
    { title: '严重度', dataIndex: 'severity', width: 100, render: (v: AlertSeverity) => severityTag(v) },
    {
      title: '通知渠道',
      dataIndex: 'channelIds',
      render: (ids: string[] = []) =>
        (ids ?? []).map((id) => {
          const ch = channels.find((c) => c.id === id);
          return ch ? <Tag key={id} style={{ fontSize: 11 }}>{CHANNEL_LABEL[ch.type] ?? ch.type}（{ch.target}）</Tag> : null;
        }),
    },
    { title: '创建时间', dataIndex: 'createdAt', width: 140, render: (v: string) => <span className="mono" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--meta)' }}>{fmt(v)}</span> },
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
            <Button icon={<RefreshCw size={16} />} onClick={() => { rulesQ.refetch(); alertsQ.refetch(); metricsQ.refetch(); }}>
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
          const m = metricsQ.data?.map[p.key];
          const points: Array<[number, number]> = m ? m.times.map((t, i) => [t * 1000, m.values[i]]) : [];
          const latest = m && m.values.length ? m.values[m.values.length - 1] : 0;
          return (
            <Col xs={24} md={12} xxl={8} key={p.key}>
              <Card
                styles={{ body: { padding: 'var(--space-4)' } }}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>{p.title}</span>
                  <span className="mono" style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, color: 'var(--fg)' }}>
                    {(() => {
                      const shown = p.adaptive ? formatThroughput(latest) : null;
                      return (
                        <>
                          {typeof latest === 'number' ? (shown ? shown.value : Math.round(latest * 10) / 10) : 0}
                          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)', marginLeft: 2 }}>{shown ? shown.unit : p.unit}</span>
                        </>
                      );
                    })()}
                  </span>
                </div>
                {p.kind === 'line' && (
                  <ReactECharts option={lineOption(p.title, points, p.colorIdx, p.thresholds)} height={180} />
                )}
                {p.kind === 'bar' && (
                  <ReactECharts option={barOption(p.title, points, p.colorIdx)} height={180} />
                )}
              </Card>
            </Col>
          );
        })}
        <Col xs={24} md={12} xxl={8}>
          <Card
            styles={{ body: { padding: 'var(--space-4)' } }}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>集群饱和度</span>
              <span className="mono" style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, color: 'var(--fg)' }}>
                {Math.round(metricsQ.data?.map.cpu?.values.slice(-1)[0] ?? 0)}
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)', marginLeft: 2 }}>%</span>
              </span>
            </div>
            <ReactECharts option={gaugeOption(metricsQ.data?.map.cpu?.values.slice(-1)[0] ?? 0, '集群饱和度')} height={180} />
          </Card>
        </Col>
        <Col xs={24} md={12} xxl={8}>
          <Card
            styles={{ body: { padding: 'var(--space-4)' } }}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>节点在线率</span>
              <span className="mono" style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, color: 'var(--fg)' }}>
                {Math.round(metricsQ.data?.okVal ?? 0)}
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)', marginLeft: 2 }}>%</span>
              </span>
            </div>
            <ReactECharts option={gaugeOption(metricsQ.data?.okVal ?? 0, '节点在线率')} height={180} />
          </Card>
        </Col>
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
          onFinish={(v) => createRule.mutate({ name: v.name, expr: v.expr, severity: v.severity, forSeconds: v.forSeconds ?? 300 })}
        >
          <button id="rule-form-submit" type="submit" style={{ display: 'none' }} form="rule-form" />
          <Form.Item name="name" label="规则名称" rules={[{ required: true, message: '请输入规则名称' }]}>
            <Input placeholder="如 high-cpu" />
          </Form.Item>
          <Form.Item name="expr" label="PromQL 表达式" rules={[{ required: true, message: '请输入表达式' }]}>
            <Input className="mono" placeholder='100 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100 > 85' />
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
          <Form.Item name="forSeconds" label="持续时长（秒）" initialValue={300}>
            <InputNumber className="mono" min={0} step={60} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
