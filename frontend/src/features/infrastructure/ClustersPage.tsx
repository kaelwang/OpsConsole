import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tree,
} from 'antd';
import {
  Box,
  Boxes,
  ChevronRight,
  Cpu,
  HardDrive,
  HeartPulse,
  Layers,
  Plus,
  RefreshCw,
  RotateCw,
  ScrollText,
  Server,
  Terminal,
} from '@/components/icons';
import { PageHeader } from '@/components/PageHeader';
import { StatusTag, podStatusVar, usageVar } from '@/components/status';
import { ClusterTopology } from './ClusterTopology';
import { TerminalModal } from './TerminalModal';
import { listClusters, listPods, listHosts, registerCluster } from '@/services/api/infrastructure';
import { useScopeStore } from '@/stores/scope';
import type { Pod } from '@/types/api';

function PodTag({ status }: { status: string }) {
  return <StatusTag color={podStatusVar(status)}>{status}</StatusTag>;
}

export function ClustersPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { cluster: activeCluster, setScope } = useScopeStore();

  const [selectedPod, setSelectedPod] = useState<Pod | null>(null);
  const [term, setTerm] = useState<Pod | null>(null);
  const [regOpen, setRegOpen] = useState(false);
  const [tab, setTab] = useState('topo');

  const clustersQ = useQuery({ queryKey: ['clusters'], queryFn: listClusters });
  const podsQ = useQuery({ queryKey: ['pods', activeCluster], queryFn: () => listPods(activeCluster), enabled: !!activeCluster });
  const hostsQ = useQuery({ queryKey: ['hosts'], queryFn: listHosts });

  // 若当前作用域中的集群不存在（或为空），自动选中第一个真实集群
  useEffect(() => {
    const list = clustersQ.data ?? [];
    if (list.length && !list.some((c) => c.id === activeCluster)) {
      setScope({ cluster: list[0].id });
    }
  }, [clustersQ.data, activeCluster, setScope]);

  const clusters = clustersQ.data ?? [];
  const pods = podsQ.data ?? [];
  const hosts = hostsQ.data ?? [];

  const treeData = useMemo(() => {
    const nsMap = new Map<string, Pod[]>();
    pods.forEach((p) => {
      if (!nsMap.has(p.namespace)) nsMap.set(p.namespace, []);
      nsMap.get(p.namespace)!.push(p);
    });
    return Array.from(nsMap.entries()).map(([ns, ps]) => ({
      key: 'ns:' + ns,
      title: ns,
      icon: <Layers size={16} />,
      children: ps.map((p) => ({ key: 'pod:' + p.name, title: p.name, icon: <Box size={16} />, isLeaf: true, pod: p })),
    }));
  }, [pods]);

  const regCluster = useMutation({
    mutationFn: (v: { name: string; provider?: string; kubeconfig?: string }) => registerCluster(v),
    onSuccess: () => { message.success('集群已注册（已记审计）'); setRegOpen(false); qc.invalidateQueries({ queryKey: ['clusters'] }); },
    onError: (e: Error) => message.error(e.message),
  });

  const podCols: any[] = [
    { title: 'Pod', dataIndex: 'name', render: (v: string) => <span className="mono" style={{ fontSize: 'var(--font-size-sm)' }}>{v}</span> },
    { title: '命名空间', dataIndex: 'namespace', width: 130, render: (v: string) => <Tag style={{ fontSize: 11 }}>{v}</Tag> },
    { title: '节点', dataIndex: 'node', width: 110, render: (v: string) => <span className="mono" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>{v}</span> },
    { title: '状态', dataIndex: 'status', width: 130, render: (v: string) => <PodTag status={v} /> },
    { title: '重启', dataIndex: 'restarts', width: 70, render: (v?: number) => <span className="mono" style={{ color: (v ?? 0) > 3 ? 'var(--warn)' : 'var(--muted)' }}>{v ?? '—'}</span> },
    { title: '年龄', dataIndex: 'age', width: 90, render: (v: string) => <span className="mono" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--meta)' }}>{v}</span> },
    {
      title: '操作',
      width: 110,
      render: (_: unknown, p: Pod) => (
        <Space size={4}>
          <Button type="text" size="small" icon={<ScrollText size={16} />} onClick={() => navigate('/observability/logs')} />
          <Button type="text" size="small" icon={<Terminal size={16} />} onClick={() => setTerm(p)} />
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <PageHeader
        title="集群 / 基础设施"
        subtitle="资源树 · 拓扑 · Pod 管控 · 容器终端"
        icon={<Boxes size={22} style={{ color: 'var(--muted)' }} />}
        extra={
          <Space>
            <Select
              value={activeCluster}
              onChange={(v) => setScope({ cluster: v })}
              style={{ minWidth: 180 }}
              options={clusters.map((c) => ({ value: c.id, label: c.name }))}
              loading={clustersQ.isLoading}
            />
            <Button icon={<RefreshCw size={16} />} onClick={() => { podsQ.refetch(); hostsQ.refetch(); }}>刷新</Button>
            <Button type="primary" icon={<Plus size={16} />} onClick={() => setRegOpen(true)}>注册集群</Button>
          </Space>
        }
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={6}>
          <Card
            title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Server size={18} style={{ color: 'var(--muted)' }} /> 资源树</span>}
            styles={{ body: { padding: 'var(--space-2)', maxHeight: 520, overflow: 'auto' } }}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
          >
            <Tree
              treeData={treeData as any}
              blockNode
              defaultExpandAll
              onSelect={(keys) => {
                const k = keys[0] as string;
                if (k?.startsWith('pod:')) {
                  const p = pods.find((x) => 'pod:' + x.name === k);
                  if (p) setSelectedPod(p);
                }
              }}
            />
          </Card>
        </Col>

        <Col xs={24} lg={18}>
          <Tabs
            activeKey={tab}
            onChange={setTab}
            items={[
              {
                key: 'topo',
                label: '集群拓扑',
                children: (
                  <Card
                    styles={{ body: { padding: 'var(--space-3)' } }}
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
                  >
                    {pods.length ? (
                      <ClusterTopology pods={pods} onSelect={setSelectedPod} selected={selectedPod?.name} />
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请选择集群" />
                    )}
                  </Card>
                ),
              },
              {
                key: 'pods',
                label: 'Pod 列表',
                children: (
                  <Card
                    styles={{ body: { padding: 0 } }}
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
                  >
                    <Table rowKey="name" size="small" loading={podsQ.isLoading} columns={podCols} dataSource={pods} pagination={false} scroll={{ x: 720 }} />
                  </Card>
                ),
              },
            ]}
          />

          <Card
            title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Cpu size={18} style={{ color: 'var(--muted)' }} /> 节点资源压力</span>}
            styles={{ body: { padding: 'var(--space-4)' } }}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', marginTop: 'var(--space-4)' }}
          >
            <Row gutter={[24, 16]}>
              {hosts.length === 0 && <Col span={24}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无主机" /></Col>}
              {hosts.map((h) => (
                <Col xs={24} md={12} key={h.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <HardDrive size={16} style={{ color: 'var(--muted)' }} />
                    <span className="mono" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--fg)' }}>{h.name || h.ip}</span>
                    <span className="mono" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--meta)' }}>{h.ip}</span>
                    <span style={{ color: 'var(--meta)', fontSize: 'var(--font-size-xs)', marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <HeartPulse size={12} style={{ color: h.status === 'online' ? 'var(--success)' : 'var(--danger)' }} /> {h.os || '—'} · {h.status}
                    </span>
                  </div>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>
      </Row>

      <Drawer
        title={selectedPod ? `Pod 详情 · ${selectedPod.name}` : ''}
        width={420}
        open={!!selectedPod}
        onClose={() => setSelectedPod(null)}
        styles={{ body: { background: 'var(--surface)' } }}
        extra={<ChevronRight size={18} style={{ color: 'var(--muted)' }} />}
      >
        {selectedPod && (
          <>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="命名空间"><Tag>{selectedPod.namespace}</Tag></Descriptions.Item>
              <Descriptions.Item label="节点"><span className="mono">{selectedPod.node}</span></Descriptions.Item>
              <Descriptions.Item label="状态"><PodTag status={selectedPod.status} /></Descriptions.Item>
              <Descriptions.Item label="重启次数"><span className="mono">{selectedPod.restarts}</span></Descriptions.Item>
              <Descriptions.Item label="年龄"><span className="mono">{selectedPod.age}</span></Descriptions.Item>
              <Descriptions.Item label="CPU"><span className="mono">{selectedPod.cpu ?? '—'}%</span></Descriptions.Item>
              <Descriptions.Item label="内存"><span className="mono">{selectedPod.memory ?? '—'}%</span></Descriptions.Item>
            </Descriptions>
            <Space style={{ marginTop: 'var(--space-4)' }}>
              <Button icon={<Terminal size={16} />} onClick={() => setTerm(selectedPod)}>终端</Button>
              <Button icon={<ScrollText size={16} />} onClick={() => navigate('/observability/logs')}>日志</Button>
            </Space>
          </>
        )}
      </Drawer>

      <TerminalModal open={!!term} clusterId={activeCluster} pod={term?.name ?? ''} container={term?.namespace} onClose={() => setTerm(null)} />

      <Modal
        title="注册集群"
        open={regOpen}
        onCancel={() => setRegOpen(false)}
        onOk={() => document.getElementById('reg-form-submit')?.click()}
        okText="注册"
      >
        <Form
          id="reg-form"
          layout="vertical"
          onFinish={(v) => regCluster.mutate({ name: v.name, provider: v.provider, kubeconfig: v.kubeconfig })}
        >
          <button id="reg-form-submit" type="submit" style={{ display: 'none' }} form="reg-form" />
          <Form.Item name="name" label="集群名称" rules={[{ required: true, message: '请输入集群名称' }]}>
            <Input placeholder="prod-shanghai" />
          </Form.Item>
          <Form.Item name="provider" label="提供商">
            <Input placeholder="self-hosted / tke / eks" />
          </Form.Item>
          <Form.Item name="kubeconfig" label="kubeconfig 引用">
            <Input className="mono" placeholder="secret://vault/k8s/prod-sh" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
