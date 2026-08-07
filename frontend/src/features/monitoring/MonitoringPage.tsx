import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  ScrollText,
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
import { gaugeOption, lineOption, multiLineOption } from './charts';
import { formatThroughput } from '@/lib/format';
import { listAlertRules, createAlertRule, listAlerts, listChannels, queryMetrics, listNodes } from '@/services/api/monitoring';
import { instantValue } from '@/lib/metricData';
import { CHANNEL_LABEL } from '@/lib/channel';
import type { AlertRule, AlertSeverity, QueryResult } from '@/types/api';

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

const RANGE_PRESETS: Record<string, { step: number; window: number }> = {
  '1h': { step: 60, window: 3600 },
  '6h': { step: 300, window: 21600 },
  '24h': { step: 900, window: 86400 },
};

// 各趋势面板对应的 PromQL（数据源：node_exporter，经 vmagent 写入 VictoriaMetrics）
type Panel = {
  key: 'cpu' | 'mem' | 'net' | 'disk' | 'diskusage';
  title: string;
  unit: string;
  colorIdx: number;
  kind: 'line';
  expr: string;
  thresholds?: { warn: number; danger: number };
  adaptive?: boolean;
};

const PANELS: Panel[] = [
  { key: 'cpu', title: 'CPU 使用率', unit: '%', colorIdx: 0, thresholds: { warn: 70, danger: 85 }, kind: 'line',
    expr: '100 - avg by (node)(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100' },
  { key: 'mem', title: '内存使用率', unit: '%', colorIdx: 1, thresholds: { warn: 80, danger: 90 }, kind: 'line',
    expr: '(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100' },
  { key: 'diskusage', title: '磁盘使用率', unit: '%', colorIdx: 4, thresholds: { warn: 80, danger: 90 }, kind: 'line',
    expr: '100 - avg by (node)(node_filesystem_avail_bytes{fstype!~"tmpfs|overlay|squashfs"}) / avg by (node)(node_filesystem_size_bytes{fstype!~"tmpfs|overlay|squashfs"}) * 100' },
  { key: 'disk', title: '磁盘 IO', unit: 'MB/s', colorIdx: 2, kind: 'line', adaptive: true,
    expr: '(rate(node_disk_read_bytes_total[5m]) + rate(node_disk_written_bytes_total[5m])) / 1024 / 1024' },
  { key: 'net', title: '网络吞吐', unit: 'MB/s', colorIdx: 3, kind: 'line', adaptive: true,
    expr: '(rate(node_network_receive_bytes_total[5m]) + rate(node_network_transmit_bytes_total[5m])) / 1024 / 1024' },
];

// 节点在线率 = 在线节点数 / 总节点数。
// 用 kubernetes-nodes 抓取任务（node 服务发现，覆盖全部控制面+工作节点），
// 不要用 node-exporter（DaemonSet 缺控制面 toleration，仅覆盖工作节点）。
const OK_EXPR = 'count(up{job="kubernetes-nodes"} == 1) / count(up{job="kubernetes-nodes"}) * 100';

// 吞吐类纵轴/tooltip 自适应：图表内数值单位已是 MB/s，按量级在 KB/s / MB/s / GB/s 间切换显示。
// 网络吞吐(net)与磁盘 IO(disk) 两个 adaptive 面板共用。
const throughputAxisFormatter = (v: number) => {
  const t = formatThroughput(v);
  return `${t.value} ${t.unit}`;
};

// K8s 工作负载面板（数据源：vmagent 采集 kubelet/cadvisor/kube-state-metrics，
// 经 VictoriaMetrics 存储）。按 namespace 过滤，按 pod 标签拆分多序列。
type K8SPanel = {
  key: 'kcpu' | 'kmem' | 'krestart';
  title: string;
  unit: string;
  colorIdx: number;
  expr: string;
  groupBy: string;
};

const K8S_PANELS: K8SPanel[] = [
  {
    key: 'kcpu',
    title: 'Pod CPU 使用率',
    unit: 'cores',
    colorIdx: 0,
    expr: 'sum(rate(container_cpu_usage_seconds_total{container!="POD",container!="",namespace="$NS"}[5m])) by (pod)',
    groupBy: 'pod',
  },
  {
    key: 'kmem',
    title: 'Pod 内存使用',
    unit: 'MiB',
    colorIdx: 1,
    expr: 'sum(container_memory_usage_bytes{container!="POD",container!="",namespace="$NS"}) by (pod) / 1024 / 1024',
    groupBy: 'pod',
  },
  {
    key: 'krestart',
    title: 'Pod 重启次数',
    unit: '次',
    colorIdx: 2,
    // 注意：kube-state-metrics v2 已移除 pod 级的 kube_pod_status_restarts_total，
    // 改用按容器的 kube_pod_container_status_restarts_total，按 pod 求和得到该 pod 的总重启次数。
    expr: 'sum(kube_pod_container_status_restarts_total{namespace="$NS"}) by (pod)',
    groupBy: 'pod',
  },
];

// 将面板表达式中的 $NS 占位符替换为当前命名空间（空时移除该过滤条件）。
function withNamespace(expr: string, ns: string): string {
  if (ns) return expr.replace(/\$NS/g, ns);
  return expr
    .replace(/\{namespace="\$NS"\}/g, '')
    .replace(/,namespace="\$NS"/g, '')
    .replace(/namespace="\$NS",/g, '');
}

interface MultiSeries {
  times: number[];
  series: { name: string; values: number[] }[];
}

// 将 VM 返回的 matrix 结果按节点（node/instance 标签）拆分为多条序列，
// 每个节点内部按时间戳合并（多序列求和）。多节点时即一张图里多条曲线。
// groupBy 可指定按某标签（如 pod/namespace）分组，用于 K8s 工作负载面板。
function toSeries(res: QueryResult, groupBy?: string): MultiSeries {
  const buckets = new Map<string, Map<number, number>>();
  const order: string[] = [];
  for (const s of res.data?.result ?? []) {
    const name =
      groupBy && s.metric?.[groupBy]
        ? s.metric[groupBy]
        : s.metric?.node || s.metric?.instance || s.metric?.exported_instance || 'all';
    let b = buckets.get(name);
    if (!b) {
      b = new Map<number, number>();
      buckets.set(name, b);
      order.push(name);
    }
    for (const [ts, val] of s.values ?? []) {
      const v = Number(val);
      if (!Number.isNaN(v)) b.set(ts, (b.get(ts) ?? 0) + v);
    }
  }
  const times = [...new Set([...buckets.values()].flatMap((b) => [...b.keys()]))].sort((a, b) => a - b);
  const series = order.map((name) => ({
    name,
    values: times.map((t) => buckets.get(name)?.get(t) ?? 0),
  }));
  return { times, series };
}

// 聚合出卡片标题用的"最新值"：默认取峰值节点（max，含 net/disk 吞吐类）；
// sum=true 时对各序列求和（仅用于 K8s 工作负载面板按 pod 合计）。
function latestOf(ms: MultiSeries | undefined, sum = false): number {
  if (!ms || ms.series.length === 0) return 0;
  const lasts = ms.series.map((s) => s.values[s.values.length - 1] ?? 0);
  return sum ? lasts.reduce((a, b) => a + b, 0) : Math.max(...lasts);
}

export function MonitoringPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [range, setRange] = useState('1h');
  const [ruleModal, setRuleModal] = useState(false);

  const rulesQ = useQuery({ queryKey: ['alert-rules'], queryFn: listAlertRules });
  const alertsQ = useQuery({ queryKey: ['alerts', 'monitor'], queryFn: () => listAlerts({ page: 1, limit: 20 }), refetchInterval: 60_000 });
  const channelsQ = useQuery({ queryKey: ['channels'], queryFn: listChannels });

  const nodesQ = useQuery({ queryKey: ['nodes'], queryFn: listNodes });
  const [node, setNode] = useState('all');
  const [namespace, setNamespace] = useState('');

  const metricsQ = useQuery({
    queryKey: ['metrics', range, node],
    queryFn: async () => {
      const { step, window } = RANGE_PRESETS[range];
      const now = Math.floor(Date.now() / 1000);
      const filters = node !== 'all' ? { node } : {};
      const [panels, ok] = await Promise.all([
        Promise.all(
          PANELS.map(async (p) => ({
            key: p.key,
            ms: toSeries(await queryMetrics({ expr: p.expr, step: String(step), start: String(now - window), end: String(now), ...filters })),
          })),
        ),
        queryMetrics({ expr: OK_EXPR, ...filters }),
      ]);
      const map: Record<string, MultiSeries> = {};
      panels.forEach((p) => {
        map[p.key] = p.ms;
      });
      return { map, okVal: instantValue(ok) };
    },
    refetchInterval: 60_000,
  });

  // K8s 工作负载面板：按 namespace 过滤，按 pod 拆分。
  const k8sQ = useQuery({
    queryKey: ['k8s-metrics', range, namespace],
    queryFn: async () => {
      const { step, window } = RANGE_PRESETS[range];
      const now = Math.floor(Date.now() / 1000);
      const ns = namespace.trim();
      const res = await Promise.all(
        K8S_PANELS.map(async (p) => ({
          key: p.key,
          ms: toSeries(await queryMetrics({ expr: withNamespace(p.expr, ns), step: String(step), start: String(now - window), end: String(now), ...(ns ? { namespace: ns } : {}) }), p.groupBy),
        })),
      );
      const map: Record<string, MultiSeries> = {};
      res.forEach((r) => {
        map[r.key] = r.ms;
      });
      return map;
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
            <Select
              value={node}
              onChange={(v) => setNode(v)}
              options={[
                { label: '全部节点', value: 'all' },
                ...(nodesQ.data ?? []).map((n) => ({ label: n, value: n })),
              ]}
              style={{ width: 172 }}
              placeholder="选择节点"
            />
            <Input
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
              placeholder="命名空间（K8s 面板）"
              className="mono"
              style={{ width: 200 }}
              allowClear
            />
            <Button icon={<RefreshCw size={16} />} onClick={() => { rulesQ.refetch(); alertsQ.refetch(); metricsQ.refetch(); k8sQ.refetch(); }}>
              刷新
            </Button>
            <Button icon={<ScrollText size={16} />} onClick={() => navigate('/observability/logs?level=error')}>
              查看日志
            </Button>
            <Button icon={<Webhook size={16} />} onClick={() => navigate('/settings?tab=channels')}>
              通知渠道
            </Button>
          </Space>
        }
      />

      {/* 节点在线率：标题栏下方一行文字展示，100% 绿色，否则黄色 */}
      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>
            节点在线率{' '}
            <span
              className="mono"
              style={{
                fontWeight: 600,
                color: (metricsQ.data?.okVal ?? 0) >= 100 ? 'var(--success)' : 'var(--warn)',
              }}
            >
              {Math.round((metricsQ.data?.okVal ?? 0) * 10) / 10}%
            </span>
            {' · '}
            {nodesQ.data?.length ?? 0} 节点
          </span>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {PANELS.map((p) => {
          const m = metricsQ.data?.map[p.key];
          const latest = latestOf(m);
          const singlePoints: Array<[number, number]> = m ? m.times.map((t, i) => [t * 1000, m.series[0]?.values[i] ?? 0]) : [];
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
                          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)', fontWeight: 500, marginRight: 4 }}>max</span>
                          {typeof latest === 'number' ? (shown ? shown.value : Math.round(latest * 10) / 10) : 0}
                          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)', marginLeft: 2 }}>{shown ? shown.unit : p.unit}</span>
                        </>
                      );
                    })()}
                  </span>
                </div>
                {m && m.series.length > 1 ? (
                  <ReactECharts option={multiLineOption(m.times, m.series, p.colorIdx, p.thresholds, p.adaptive ? throughputAxisFormatter : undefined)} height={180} />
                ) : (
                  <ReactECharts option={lineOption(p.title, singlePoints, p.colorIdx, p.thresholds, p.adaptive ? throughputAxisFormatter : undefined)} height={180} />
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
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)', fontWeight: 500, marginRight: 4 }}>max</span>
                {Math.round(latestOf(metricsQ.data?.map.cpu) * 10) / 10}
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)', marginLeft: 2 }}>%</span>
              </span>
            </div>
            <ReactECharts option={gaugeOption(Math.round(latestOf(metricsQ.data?.map.cpu) * 10) / 10, '集群饱和度')} height={180} />
          </Card>
        </Col>
      </Row>

      <Card
        styles={{ body: { padding: 'var(--space-4)' } }}
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <SlidersHorizontal size={18} style={{ color: 'var(--muted)' }} /> K8s 工作负载
            {namespace.trim() && <Tag style={{ fontSize: 11 }}>ns: {namespace.trim()}</Tag>}
            {k8sQ.isFetching && <RefreshCw size={13} className="spin" />}
          </span>
        }
      >
        <Row gutter={[16, 16]}>
          {K8S_PANELS.map((p) => {
            const m = k8sQ.data?.[p.key];
            const latest = latestOf(m, true);
            const singlePoints: Array<[number, number]> = m ? m.times.map((t, i) => [t * 1000, m.series[0]?.values[i] ?? 0]) : [];
            return (
              <Col xs={24} md={12} xxl={8} key={p.key}>
                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                    <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>{p.title}</span>
                    <span className="mono" style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, color: 'var(--fg)' }}>
                      {typeof latest === 'number' ? Math.round(latest * 10) / 10 : 0}
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)', marginLeft: 2 }}>{p.unit}</span>
                    </span>
                  </div>
                  {!m || m.series.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据（请确认 vmagent 已采集该命名空间）" style={{ padding: '24px 0' }} />
                  ) : m.series.length > 1 ? (
                    <ReactECharts option={multiLineOption(m.times, m.series, p.colorIdx)} height={180} />
                  ) : (
                    <ReactECharts option={lineOption(p.title, singlePoints, p.colorIdx)} height={180} />
                  )}
                </div>
              </Col>
            );
          })}
        </Row>
      </Card>

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
                  <Button
                    key="logs"
                    size="small"
                    icon={<ScrollText size={14} />}
                    onClick={() =>
                      navigate(
                        '/observability/logs?level=error' +
                          (a.labels.namespace ? `&q=${encodeURIComponent(a.labels.namespace)}` : ''),
                      )
                    }
                  >
                    查看日志
                  </Button>,
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
