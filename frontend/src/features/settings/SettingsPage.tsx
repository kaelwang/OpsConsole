import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Form, Input, Menu, Modal, Radio, Select, Space, Table, Tag } from 'antd';
import {
  Boxes,
  Check,
  Lock,
  Mail,
  Moon,
  Plus,
  Settings as SettingsIcon,
  Sun,
  Trash2,
  User as UserIcon,
  Webhook,
} from '@/components/icons';
import { PageHeader } from '@/components/PageHeader';
import { useThemeStore, type ThemeMode } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { listChannels, createChannel } from '@/services/api/monitoring';
import { listClusters, registerCluster } from '@/services/api/infrastructure';
import type { ChannelType } from '@/types/api';

const CHANNEL_LABEL: Record<ChannelType, string> = {
  email: '邮件',
  webhook: 'Webhook',
  wecom: '企业微信',
  dingtalk: '钉钉',
  feishu: '飞书',
};

export function SettingsPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { mode, setMode } = useThemeStore();
  const email = useAuthStore((s) => s.email);

  const [tab, setTab] = useState('appearance');
  const [chanOpen, setChanOpen] = useState(false);
  const [clusterOpen, setClusterOpen] = useState(false);

  const channelsQ = useQuery({ queryKey: ['channels'], queryFn: listChannels });
  const clustersQ = useQuery({ queryKey: ['clusters'], queryFn: listClusters });

  const createChan = useMutation({
    mutationFn: (v: { type: ChannelType; value: string }) => {
      const config: Record<string, string> =
        v.type === 'email' ? { to: v.value } : v.type === 'webhook' ? { url: v.value } : { token: v.value };
      return createChannel({ type: v.type, config });
    },
    onSuccess: () => { message.success('通知渠道已创建'); setChanOpen(false); qc.invalidateQueries({ queryKey: ['channels'] }); },
    onError: (e: Error) => message.error(e.message),
  });
  const regCluster = useMutation({
    mutationFn: (v: { name: string; kubeconfigRef: string; saName: string }) => registerCluster(v),
    onSuccess: () => { message.success('集群已注册'); setClusterOpen(false); qc.invalidateQueries({ queryKey: ['clusters'] }); },
    onError: (e: Error) => message.error(e.message),
  });

  const menuItems = [
    { key: 'appearance', icon: <SettingsIcon size={18} />, label: '外观' },
    { key: 'channels', icon: <Webhook size={18} />, label: '通知渠道' },
    { key: 'clusters', icon: <Boxes size={18} />, label: '集群注册' },
    { key: 'profile', icon: <UserIcon size={18} />, label: '个人资料' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <PageHeader title="设置" subtitle="外观 · 通知渠道 · 集群注册 · 个人资料" icon={<SettingsIcon size={22} style={{ color: 'var(--muted)' }} />} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-4)' }} className="settings-grid">
        <style>{`@media (min-width:768px){.settings-grid{grid-template-columns:220px 1fr!important;}}`}</style>

        <Card
          styles={{ body: { padding: 'var(--space-2)' } }}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', height: 'fit-content' }}
        >
          <Menu mode="inline" selectedKeys={[tab]} items={menuItems} onClick={({ key }) => setTab(key)} style={{ background: 'transparent', borderInlineEnd: 'none' }} />
        </Card>

        <Card
          styles={{ body: { padding: 'var(--space-5)' } }}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
        >
          {tab === 'appearance' && (
            <div>
              <h3 style={{ fontSize: 'var(--font-size-lg)', margin: '0 0 var(--space-3)' }}>外观</h3>
              <div style={{ color: 'var(--muted)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-4)' }}>主题切换即时生效并持久化（写入 localStorage，刷新不丢）。</div>
              <Radio.Group value={mode} onChange={(e) => setMode(e.target.value as ThemeMode)} optionType="button" buttonStyle="solid">
                <Radio.Button value="system">跟随系统</Radio.Button>
                <Radio.Button value="dark"><Moon size={14} style={{ verticalAlign: -2, marginRight: 4 }} />深色</Radio.Button>
                <Radio.Button value="light"><Sun size={14} style={{ verticalAlign: -2, marginRight: 4 }} />浅色</Radio.Button>
              </Radio.Group>
              <div style={{ marginTop: 'var(--space-5)', padding: 'var(--space-4)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg)' }}>
                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                  <div style={{ width: 64, height: 40, borderRadius: 6, background: 'var(--accent)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ width: '60%', height: 10, borderRadius: 4, background: 'var(--surface-3)', marginBottom: 8 }} />
                    <div style={{ width: '80%', height: 8, borderRadius: 4, background: 'var(--surface-2)' }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'channels' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                <h3 style={{ fontSize: 'var(--font-size-lg)', margin: 0 }}>通知渠道</h3>
                <Button type="primary" icon={<Plus size={16} />} onClick={() => setChanOpen(true)}>新建渠道</Button>
              </div>
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={channelsQ.data ?? []}
                columns={[
                  { title: '类型', dataIndex: 'type', width: 120, render: (v: ChannelType) => <Tag style={{ fontSize: 11 }}>{CHANNEL_LABEL[v]}</Tag> },
                  { title: '配置', dataIndex: 'config', render: (c: Record<string, unknown>) => <span className="mono" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-2)' }}>{String(Object.values(c)[0] ?? '')}</span> },
                  { title: '', width: 60, render: () => <Button type="text" size="small" danger icon={<Trash2 size={16} />} onClick={() => message.success('已删除渠道（演示）')} /> },
                ]}
              />
            </div>
          )}

          {tab === 'clusters' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                <h3 style={{ fontSize: 'var(--font-size-lg)', margin: 0 }}>集群注册</h3>
                <Button type="primary" icon={<Plus size={16} />} onClick={() => setClusterOpen(true)}>注册集群</Button>
              </div>
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={clustersQ.data ?? []}
                columns={[
                  { title: '名称', dataIndex: 'name', render: (v: string) => <span style={{ color: 'var(--fg)' }}>{v}</span> },
                  { title: 'kubeconfig', dataIndex: 'kubeconfigRef', render: (v: string) => <span className="mono" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)' }}>{v}</span> },
                  { title: '服务账号', dataIndex: 'saName', render: (v: string) => <span className="mono" style={{ fontSize: 'var(--font-size-xs)' }}>{v}</span> },
                  { title: '健康', dataIndex: 'health', width: 80, render: (v: number) => <span style={{ color: v >= 90 ? 'var(--success)' : v >= 75 ? 'var(--warn)' : 'var(--danger)' }}>{v}%</span> },
                ]}
              />
            </div>
          )}

          {tab === 'profile' && (
            <div style={{ maxWidth: 420 }}>
              <h3 style={{ fontSize: 'var(--font-size-lg)', margin: '0 0 var(--space-4)' }}>个人资料</h3>
              <Form layout="vertical" initialValues={{ email: email ?? '', name: '当前用户' }}>
                <Form.Item label="显示名" name="name"><Input prefix={<UserIcon size={16} />} /></Form.Item>
                <Form.Item label="邮箱" name="email"><Input prefix={<Mail size={16} />} disabled /></Form.Item>
                <Form.Item label="修改密码" name="password"><Input.Password prefix={<Lock size={16} />} placeholder="新密码（至少 8 位）" /></Form.Item>
                <Button type="primary" icon={<Check size={16} />} onClick={() => message.success('个人资料已保存')}>保存</Button>
              </Form>
            </div>
          )}
        </Card>
      </div>

      <Modal title="新建通知渠道" open={chanOpen} onCancel={() => setChanOpen(false)} onOk={() => document.getElementById('chan-submit')?.click()} okText="创建">
        <Form id="chan-form" layout="vertical" onFinish={(v) => createChan.mutate({ type: v.type, value: v.value })}>
          <button id="chan-submit" type="submit" form="chan-form" style={{ display: 'none' }} />
          <Form.Item name="type" label="渠道类型" rules={[{ required: true }]} initialValue="webhook">
            <Select options={Object.entries(CHANNEL_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
          </Form.Item>
          <Form.Item name="value" label="配置值（URL / 密钥 / 收件人）" rules={[{ required: true, message: '请输入配置值' }]}>
            <Input className="mono" placeholder="https://... 或 secret-token 或 user@corp.example" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="注册集群" open={clusterOpen} onCancel={() => setClusterOpen(false)} onOk={() => document.getElementById('set-cluster-submit')?.click()} okText="注册">
        <Form id="set-cluster-form" layout="vertical" onFinish={(v) => regCluster.mutate({ name: v.name, kubeconfigRef: v.kubeconfigRef, saName: v.saName })}>
          <button id="set-cluster-submit" type="submit" form="set-cluster-form" style={{ display: 'none' }} />
          <Form.Item name="name" label="集群名称" rules={[{ required: true }]}><Input placeholder="prod-shanghai" /></Form.Item>
          <Form.Item name="kubeconfigRef" label="kubeconfig 引用" rules={[{ required: true }]}><Input className="mono" placeholder="secret://vault/k8s/prod-sh" /></Form.Item>
          <Form.Item name="saName" label="服务账号（impersonation）" rules={[{ required: true }]}><Input className="mono" placeholder="ops-impersonator" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
