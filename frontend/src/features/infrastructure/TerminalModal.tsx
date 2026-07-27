import { useEffect, useRef } from 'react';
import { Modal } from 'antd';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { buildExecUrl } from '@/services/api/infrastructure';
import { cssVar } from '@/components/chart';

export function TerminalModal({
  open,
  clusterId,
  pod,
  container,
  onClose,
}: {
  open: boolean;
  clusterId: string;
  pod: string;
  container?: string;
  onClose: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!open || !hostRef.current) return;

    const term = new XTerm({
      fontSize: 13,
      fontFamily: "'Geist Mono','JetBrains Mono',ui-monospace,monospace",
      cursorBlink: true,
      theme: {
        background: cssVar('--surface', '#121620'),
        foreground: cssVar('--fg', '#e6e9ef'),
        cursor: cssVar('--accent', '#1c8fe6'),
        selectionBackground: cssVar('--accent-ring', 'rgba(28,143,230,0.4)'),
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    term.writeln(`\x1b[36m正在连接容器终端…\x1b[0m  ${pod}${container ? ' / ' + container : ''}`);

    let ws: WebSocket | null = null;
    try {
      const url = buildExecUrl(clusterId, pod, container).replace(/^http/, 'ws');
      ws = new WebSocket(url);
      ws.onopen = () => term.writeln('\x1b[32m[已连接]\x1b[0m');
      ws.onmessage = (e) => term.write(typeof e.data === 'string' ? e.data : '');
      ws.onerror = () => term.writeln('\r\n\x1b[31m[终端连接失败]\x1b[0m');
      ws.onclose = () => term.writeln('\r\n\x1b[31m[连接已关闭]\x1b[0m');
    } catch {
      term.writeln('\x1b[31m[终端连接失败]\x1b[0m');
    }

    const onData = term.onData((d) => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(d);
    });

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
    });
    ro.observe(hostRef.current);

    return () => {
      onData.dispose();
      ro.disconnect();
      ws?.close();
      term.dispose();
      termRef.current = null;
    };
  }, [open, clusterId, pod, container]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={`容器终端 · ${pod}`}
      width="80%"
      styles={{ body: { padding: 0, background: 'var(--surface)' } }}
    >
      <div ref={hostRef} className="xterm-host" style={{ height: 420, borderRadius: 0, border: 'none' }} />
    </Modal>
  );
}
