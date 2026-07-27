import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  List,
  Progress,
  Row,
  Segmented,
  Spin,
  Table,
  Tag,
  Timeline,
} from 'antd';
import { ChevronRight, History, Inbox, User as UserIcon } from '@/components/icons';
import { PageHeader } from '@/components/PageHeader';
import { StatStrip } from './StatStrip';
import { MetricGrid } from './MetricGrid';
import { auditTag, deploymentTag, deploymentVar, severityIcon, severityVar, usageVar } from '@/components/status';
import { listClusters } from '@/services/api/infrastructure';
import { listAlerts, queryMetrics } from '@/services/api/monitoring';
import { listPipelines, listRecentDeployments } from '@/services/api/deployment';
import { listAudit } from '@/services/api/audit';
import type { AuditLog, QueryResult } from '@/types/api';

// 实时利用率（即时向量查询，数据源 VictoriaMetrics）
const UTIL_EXPRS = [
  { label: 'CPU 使用率', expr: '100 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100' },
  { label: '内存使用率', expr: '(1 - sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes)) * 100' },
  { label: '磁盘使用率', expr: 'max((1 - node_filesystem_avail_bytes{fstype!~"tmpfs|overlay|squashfs"} / node_filesystem_size_bytes{fstype!~"tmpfs|overlay|squashfs"}) * 100)' },
];

function instantValue(res: QueryResult): number {
  const item = res.data?.result?.[0];
  if (item?.value) return Number(item.value[1]) || 0;
  const last = item?.values?.slice(-1)[0];
  return last ? Number(last[1]) || 0 : 0;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, margin: '0 0 var(--space-3)', color: 'var(--fg)', letterSpacing: 'var(--tracking-display)' }}>
      {children}
    </h2>
  );
}

export function HomePage() {
  const [range, setRange] = useState('1h');
  const [auditSel, setAuditSel] = useState<AuditLog | null>(null);

  const clustersQ = useQuery({ queryKey: ['clusters'], queryFn: listClusters });
  const alertsQ = useQuery({ queryKey: ['alerts', 'home'], queryFn: () => listAlerts({ page: 1, limit: 20 }) });
  const pipelinesQ = useQuery({ queryKey: ['pipelines'], queryFn: () => listPipelines() });
  const deploysQ = useQuery({ queryKey: ['deployments', 'recent'], queryFn: listRecentDeployments });
  const auditQ = useQuery({ queryKey: ['audit', 'home'], queryFn: () => listAudit({ page: 1, limit: 8 }) });
  const utilQ = useQuery({
    queryKey: ['home-util'],
    queryFn: async () => {
      const res = await Promise.all(UTIL_EXPRS.map((u) => queryMetrics(u.expr)));
      return res.map(instantValue);
    },
    refetchInterval: 60_000,
  });

  const loading = clustersQ.isLoading || alertsQ.isLoading || pipelinesQ.isLoading || deploysQ.isLoading || auditQ.isLoading;
  const clusters = clustersQ.data ?? [];
  const alerts = alertsQ.data?.items ?? [];
  const pipelines = pipelinesQ.data ?? [];
  const deploys = deploysQ.data ?? [];
  const audit = auditQ.data?.items ?? [];

  const util = useMemo(
    () =>
      UTIL_EXPRS.map((u, i) => ({
        label: u.label,
        pct: Math.round(utilQ.data?.[i] ?? 0),
      })),
    [utilQ.data],
  );

  const auditCols = [
    { title: '时间', dataIndex: 'createdAt', width: 110, render: (v: string) => <span className="mono" style={{ color: 'var(--meta)', fontSize: 'var(--font-size-xs)' }}>{fmt(v)}</span> },
    {
      title: '操作者',
      dataIndex: 'userId',
      width: 150,
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
  ];

  return (
    <Spin spinning={loading}>
      <PageHeader
        title="运维首页"
        subtitle="跨域总览：健康、告警、部署、资源与审计一览"
        extra={
          <Segmented
            value={range}
            onChange={(v) => setRange(v as string)}
            options={[
              { label: '1 小时', value: '1h' },
              { label: '6 小时', value: '6h' },
              { label: '24 小时', value: '24h' },
              { label: '7 天', value: '7d' },
            ]}
          />
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <StatStrip clusters={clusters} alerts={alerts} pipelines={pipelines} deployments={deploys} />

        <div>
          <SectionTitle>关键指标</SectionTitle>
          <MetricGrid rangeSec={range === '1h' ? 3600 : range === '6h' ? 21600 : range === '24h' ? 86400 : 604800} />
        </div>

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card
              styles={{ body: { padding: 'var(--space-4)' } }}
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', height: '100%' }}
            >
              <SectionTitle>活跃告警</SectionTitle>
              {alerts.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前无活跃告警" />
              ) : (
                <List
                  itemLayout="horizontal"
                  dataSource={alerts.slice(0, 6)}
                  renderItem={(a) => (
                    <List.Item style={{ padding: '8px 0', borderBottom: '1px solid var(--border-soft)' }}>
                      <List.Item.Meta
                        avatar={<span style={{ color: severityVar(a.severity), display: 'flex', marginTop: 2 }}>{severityIcon(a.severity)}</span>}
                        title={<span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--fg)' }}>{a.summary}</span>}
                        description={
                          <span className="mono" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--meta)' }}>
                            {a.labels?.instance ?? a.labels?.cluster ?? a.labels?.namespace ?? '—'} · {fmt(a.firedAt)}
                          </span>
                        }
                      />
                    </List.Item>
                  )}
                />
              )}
            </Card>
          </Col>

          <Col xs={24} lg={12}>
            <Card
              styles={{ body: { padding: 'var(--space-4)' } }}
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', height: '100%' }}
            >
              <SectionTitle>近期部署</SectionTitle>
              {deploys.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无部署记录" />
              ) : (
                <Timeline
                  items={deploys.slice(0, 6).map((d) => ({
                    color: deploymentVar(d.status),
                    children: (
                      <div style={{ fontSize: 'var(--font-size-sm)' }}>
                        <span className="mono" style={{ color: 'var(--fg)' }}>{d.name}</span>
                        <span style={{ color: 'var(--muted)', margin: '0 6px' }}>·</span>
                        <span className="mono" style={{ color: 'var(--fg-2)' }}>{d.ref}</span>
                        <div style={{ color: 'var(--meta)', fontSize: 'var(--font-size-xs)', marginTop: 2 }}>{fmt(d.createdAt)}</div>
                      </div>
                    ),
                  }))}
                />
              )}
            </Card>
          </Col>
        </Row>

        <Card
          styles={{ body: { padding: 'var(--space-4)' } }}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
        >
          <SectionTitle>集群资源利用率</SectionTitle>
          <Row gutter={[24, 16]}>
            {util.map((u) => (
              <Col xs={24} md={8} key={u.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>{u.label}</span>
                  <span className="mono" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--fg)' }}>{u.pct}%</span>
                </div>
                <Progress percent={u.pct} strokeColor={usageVar(u.pct)} showInfo={false} strokeWidth={8} />
              </Col>
            ))}
          </Row>
        </Card>

        <Card
          styles={{ body: { padding: 'var(--space-4)' } }}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
        >
          <SectionTitle>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <History size={18} style={{ color: 'var(--muted)' }} /> 近期审计
            </span>
          </SectionTitle>
          {audit.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Inbox size={16} /> 暂无审计事件</span>} />
          ) : (
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              columns={auditCols}
              dataSource={audit}
              onRow={(r) => ({ onClick: () => setAuditSel(r), style: { cursor: 'pointer' } })}
            />
          )}
        </Card>
      </div>

      <Drawer
        title="审计详情"
        width={420}
        open={!!auditSel}
        onClose={() => setAuditSel(null)}
        styles={{ body: { background: 'var(--surface)' } }}
        extra={<ChevronRight size={18} style={{ color: 'var(--muted)' }} />}
      >
        {auditSel && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="操作者"><span className="mono">{auditSel.userId}</span></Descriptions.Item>
            <Descriptions.Item label="动作"><Tag style={{ fontFamily: 'var(--font-mono)' }}>{auditSel.action}</Tag></Descriptions.Item>
            <Descriptions.Item label="对象"><span className="mono">{auditSel.resource}</span></Descriptions.Item>
            <Descriptions.Item label="结果">{auditTag(auditSel.ok ? 'success' : 'failure')}</Descriptions.Item>
            <Descriptions.Item label="时间"><span className="mono">{fmt(auditSel.createdAt)}</span></Descriptions.Item>
            <Descriptions.Item label="详情"><span className="mono" style={{ fontSize: 'var(--font-size-xs)' }}>{auditSel.detail || '—'}</span></Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>

      <div style={{ height: 'var(--space-8)' }} />
    </Spin>
  );
}
