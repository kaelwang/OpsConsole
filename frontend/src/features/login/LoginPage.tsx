import { useState } from 'react';
import { Alert, App, Button, Card, Checkbox, Form, Input } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Lock, Moon, ScrollText, Server, ShieldCheck, Sun, User } from '@/components/icons';
import { login } from '@/services/api/auth';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';

interface LoginValues {
  email: string;
  password: string;
  remember?: boolean;
}

export function LoginPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const setSession = useAuthStore((s) => s.setSession);
  const { resolved, setMode } = useThemeStore();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (v: LoginValues) => login({ email: v.email, password: v.password }),
    onSuccess: (token, v) => {
      setSession(token, v.email);
      message.success('登录成功');
      navigate('/');
    },
    onError: (e: Error) => {
      setError(e.message || '登录失败，请稍后重试');
    },
  });

  const caps = [
    { icon: <ShieldCheck size={18} />, text: '统一 RBAC 权限' },
    { icon: <Server size={18} />, text: '主机与 K8s 纳管' },
    { icon: <ScrollText size={18} />, text: '全量操作审计' },
  ];

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '1fr',
        background: 'var(--bg)',
      }}
      className="login-grid"
    >
      <style>{`@media (min-width:1280px){.login-grid{grid-template-columns:1.1fr 1fr!important;}}@media (min-width:768px) and (max-width:1279px){.login-grid{grid-template-columns:1fr!important;}}`}</style>

      {/* 左侧品牌 / 价值陈述（克制，非营销大图） */}
      <div
        style={{
          display: 'none',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 'var(--space-12)',
          background: 'var(--surface)',
          borderRight: '1px solid var(--border-soft)',
        }}
        className="login-brand"
      >
        <style>{`@media (min-width:1280px){.login-brand{display:flex!important;}}`}</style>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: 'var(--accent)',
                color: 'var(--accent-on)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 18,
              }}
            >
              O
            </div>
            <span style={{ fontSize: 'var(--font-size-xl)', fontWeight: 600, letterSpacing: 'var(--tracking-display)' }}>
              统一运维控制台
            </span>
          </div>
          <p style={{ color: 'var(--fg-2)', fontSize: 'var(--font-size-md)', marginTop: 'var(--space-6)', maxWidth: 420, lineHeight: 1.6 }}>
            面向企业多团队的自托管运维控制台，在监控告警、日志分析、部署 CI-CD 与主机 K8s 四大域提供最小可用闭环，并以一套账号、RBAC 与审计贯穿全局。
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {caps.map((c) => (
            <div key={c.text} style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--muted)' }}>
              <span style={{ color: 'var(--muted)', display: 'flex' }}>{c.icon}</span>
              <span style={{ fontSize: 'var(--font-size-md)', color: 'var(--fg-2)' }}>{c.text}</span>
            </div>
          ))}
        </div>
        <div style={{ color: 'var(--meta)', fontSize: 'var(--font-size-xs)' }}>
          内网部署 · 数据不出企业边界 · 操作全留痕
        </div>
      </div>

      {/* 右侧登录卡片 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-4)',
          position: 'relative',
        }}
      >
        <button
          onClick={() => setMode(resolved === 'dark' ? 'light' : 'dark')}
          aria-label="切换主题"
          style={{
            position: 'absolute',
            top: 20,
            right: 20,
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-pill)',
            color: 'var(--muted)',
            width: 36,
            height: 36,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {resolved === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <Card
          style={{
            width: '100%',
            maxWidth: 400,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
          }}
          styles={{ body: { padding: 'var(--space-8)' } }}
        >
          <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 600, margin: '0 0 4px', letterSpacing: 'var(--tracking-display)' }}>
            登录统一运维控制台
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-6)' }}>
            使用企业账号登录以继续
          </p>

          {error && (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 'var(--space-4)' }}
              message={error}
            />
          )}

          <Form<LoginValues>
            layout="vertical"
            initialValues={{ remember: true }}
            onFinish={(v) => {
              setError(null);
              mutation.mutate(v);
            }}
          >
            <Form.Item name="email" label="企业邮箱" rules={[{ required: true, type: 'email', message: '请输入有效的企业邮箱' }]}>
              <Input prefix={<User size={16} />} placeholder="you@corp.example" size="large" autoComplete="username" />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, min: 8, message: '密码至少 8 位' }]}>
              <Input.Password prefix={<Lock size={16} />} placeholder="••••••••" size="large" autoComplete="current-password" />
            </Form.Item>
            <Form.Item style={{ marginBottom: 'var(--space-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Checkbox defaultChecked>记住我</Checkbox>
                <a onClick={() => message.info('请联系平台管理员重置密码')} style={{ fontSize: 'var(--font-size-sm)' }}>
                  忘记密码？
                </a>
              </div>
            </Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={mutation.isPending}
            >
              登录
            </Button>
          </Form>

          <p style={{ color: 'var(--meta)', fontSize: 'var(--font-size-xs)', marginTop: 'var(--space-5)', textAlign: 'center' }}>
            请使用企业账号登录，如无账号请联系平台管理员开通
          </p>
        </Card>
      </div>
    </div>
  );
}
