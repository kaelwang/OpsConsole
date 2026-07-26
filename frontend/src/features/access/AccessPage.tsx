import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Card, Col, Row, Select, Space, Table, Tag } from 'antd';
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Lock,
  ShieldCheck,
  User as UserIcon,
  XCircle,
} from '@/components/icons';
import { PageHeader } from '@/components/PageHeader';
import { listRoles, listMembers, assignRole } from '@/services/api/rbac';
import type { RoleName, RolePermission } from '@/types/api';

const DOMAINS = [
  { key: 'monitoring', label: '监控告警' },
  { key: 'logging', label: '日志分析' },
  { key: 'deployment', label: '交付 / CI-CD' },
  { key: 'infrastructure', label: '基础设施' },
  { key: 'management', label: '管理 / 审计' },
];
const LEVELS = [
  { key: 'view', label: '查看' },
  { key: 'operate', label: '操作' },
  { key: 'manage', label: '管理' },
];

function computeMatrix(role: RolePermission) {
  const grants: Record<string, Set<string>> = {};
  const add = (d: string, l: string) => ((grants[d] ??= new Set()).add(l));
  if (role.permissions.includes('*:*')) {
    DOMAINS.forEach((d) => LEVELS.forEach((l) => add(d.key, l.key)));
  } else {
    role.permissions.forEach((p) => {
      const [dom, lvl] = p.split(':');
      if (dom === 'monitoring') {
        if (lvl === 'read') add('monitoring', 'view');
        if (lvl === 'write') add('monitoring', 'operate');
      }
      if (dom === 'logging' && lvl === 'read') add('logging', 'view');
      if (dom === 'deployment') add('deployment', 'operate');
      if (dom === 'infrastructure') {
        if (lvl === 'read') add('infrastructure', 'view');
        if (lvl === 'write') add('infrastructure', 'operate');
      }
      if (dom === 'rbac' && lvl === 'assign') add('management', 'manage');
      if (dom === 'audit' && lvl === 'read') add('management', 'view');
    });
  }
  return grants;
}

function Cell({ ok }: { ok: boolean }) {
  return ok ? (
    <Tag color="success" style={{ fontSize: 11 }}><CheckCircle2 size={12} style={{ verticalAlign: -2 }} /> 允许</Tag>
  ) : (
    <Tag style={{ fontSize: 11, color: 'var(--meta)', borderColor: 'var(--border)', background: 'transparent' }}><XCircle size={12} style={{ verticalAlign: -2 }} /> 拒绝</Tag>
  );
}

const ROLE_OPTIONS: { value: RoleName; label: string }[] = [
  { value: 'platform_admin', label: '平台超管' },
  { value: 'owner', label: '租户所有者' },
  { value: 'admin', label: '运维管理员' },
  { value: 'member', label: '研发成员' },
  { value: 'viewer', label: '只读' },
];

export function AccessPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [roleKey, setRoleKey] = useState<string>('admin');

  const rolesQ = useQuery({ queryKey: ['roles'], queryFn: listRoles });
  const membersQ = useQuery({ queryKey: ['members'], queryFn: listMembers });

  const assign = useMutation({
    mutationFn: (v: { userId: string; role: RoleName }) => assignRole(v),
    onSuccess: () => { message.success('角色已分配（已记审计）'); qc.invalidateQueries({ queryKey: ['members'] }); },
    onError: (e: Error) => message.error(e.message),
  });

  const roles = rolesQ.data ?? [];
  const members = membersQ.data ?? [];
  const active = roles.find((r) => r.role === roleKey) ?? roles[0];
  const matrix = useMemo(() => (active ? computeMatrix(active) : {}), [active]);

  const matrixCols: any[] = [
    { title: '能力域', dataIndex: 'label', render: (v: string) => <span style={{ color: 'var(--fg)', fontSize: 'var(--font-size-sm)' }}>{v}</span> },
    ...LEVELS.map((l) => ({
      title: l.label,
      key: l.key,
      render: (_: unknown, row: { key: string }) => <Cell ok={!!matrix[row.key]?.has(l.key)} />,
    })),
  ];

  const memberCols: any[] = [
    {
      title: '成员',
      dataIndex: 'displayName',
      render: (v: string, r: { email: string }) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <UserIcon size={16} style={{ color: 'var(--muted)' }} />
          <span>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--fg)' }}>{v}</div>
            <div className="mono" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--meta)' }}>{r.email}</div>
          </span>
        </span>
      ),
    },
    { title: '团队', dataIndex: 'team', width: 120, render: (v: string) => <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--fg-2)' }}>{v}</span> },
    {
      title: '角色',
      dataIndex: 'role',
      width: 150,
      render: (v: RoleName, r: { userId: string }) => (
        <Select
          size="small"
          value={v}
          style={{ width: 130 }}
          options={ROLE_OPTIONS}
          onChange={(nv) => assign.mutate({ userId: r.userId, role: nv })}
          suffixIcon={<ShieldCheck size={14} />}
        />
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <PageHeader
        title="权限 / 访问"
        subtitle="角色权限矩阵 · 成员分配（RBAC 分级）"
        icon={<KeyRound size={22} style={{ color: 'var(--muted)' }} />}
      />

      <Alert
        type="info"
        showIcon
        icon={<AlertTriangle size={16} />}
        message="越权操作（如 viewer 修改告警规则）将经后端 403 拦截并记入审计"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={6}>
          <Card
            title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><ShieldCheck size={18} style={{ color: 'var(--muted)' }} /> 角色</span>}
            styles={{ body: { padding: 'var(--space-2)' } }}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
          >
            {roles.map((r) => (
              <div
                key={r.role}
                onClick={() => setRoleKey(r.role)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  marginBottom: 4,
                  background: r.role === roleKey ? 'var(--surface-2)' : 'transparent',
                  border: `1px solid ${r.role === roleKey ? 'var(--border-strong)' : 'transparent'}`,
                }}
              >
                <ShieldCheck size={18} style={{ color: r.role === roleKey ? 'var(--accent)' : 'var(--muted)' }} />
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--fg)' }}>{r.roleLabel}</span>
                <span className="mono" style={{ marginLeft: 'auto', fontSize: 'var(--font-size-xs)', color: 'var(--meta)' }}>{r.permissions.length}</span>
              </div>
            ))}
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card
            title="权限矩阵"
            styles={{ body: { padding: 0 } }}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
          >
            <Table rowKey="key" size="small" pagination={false} columns={matrixCols} dataSource={DOMAINS} />
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card
            title="成员分配"
            styles={{ body: { padding: 0 } }}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
          >
            <Table rowKey="userId" size="small" pagination={false} columns={memberCols} dataSource={members} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
