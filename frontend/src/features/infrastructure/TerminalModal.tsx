import { useEffect, useRef } from 'react';
import { Modal } from 'antd';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { USE_MOCK } from '@/services/config';
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

    const prompt = `root@${clusterId}:~# `;
    term.writeln(`\x1b[36m已连接到容器终端\x1b[0m  ${pod}${container ? ' / ' + container : ''}`);
    term.write(prompt);

    let buf = '';
    const writePrompt = () => term.write('\r\n' + prompt);
    const run = (cmd: string) => {
      if (!cmd) return;
      if (cmd === 'clear') {
        term.clear();
        return;
      }
      if (cmd.startsWith('kubectl get pods') || cmd === 'kubectl get po') {
        term.writeln('NAME                      READY   STATUS    RESTARTS   AGE');
        term.writeln(`${pod.padEnd(25)} 1/1     Running   0          3d4h`);
        return;
      }
      if (cmd.startsWith('kubectl logs')) {
        term.writeln('[INFO] reconciling deployment revision=3');
        term.writeln('[INFO] health check passed on /healthz');
        return;
      }
      if (cmd.startsWith('kubectl')) {
        term.writeln('executing: ' + cmd);
        return;
      }
      term.writeln(`command not found: ${cmd}`);
    };

    const onData = term.onData((d) => {
      if (d === '\r') {
        term.write('\r\n');
        run(buf.trim());
        buf = '';
        writePrompt();
      } else if (d === '') {
        if (buf.length > 0) {
          buf = buf.slice(0, -1);
          term.write('\b \b');
        }
      } else {
        buf += d;
        term.write(d);
      }
    });

    let ws: WebSocket | null = null;
    if (!USE_MOCK) {
      try {
        ws = new WebSocket(buildExecUrl(clusterId, pod, container));
        ws.onmessage = (e) => term.write(e.data as string);
        ws.onclose = () => term.writeln('\r\n\x1b[31m[连接已关闭]\x1b[0m');
      } catch {
        term.writeln('\x1b[31m[终端连接失败]\x1b[0m');
      }
    }

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
