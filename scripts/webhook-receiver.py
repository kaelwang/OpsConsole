#!/usr/bin/env python3
"""Minimal Alertmanager webhook receiver for local verification.

Listens on the given port, prints every POST it receives (the Alertmanager
notification payload), and replies 200. Useful for confirming that the
OpsConsole dynamic alerting pipeline actually delivers alerts.

Usage:
    python3 scripts/webhook-receiver.py [port]
"""
import http.server
import json
import sys


class Handler(http.server.BaseHTTPRequestHandler):
    def _receive(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        body = self.rfile.read(length) if length else b""
        try:
            payload = json.loads(body)
        except Exception:
            payload = body.decode(errors="replace")
        alerts = payload.get("alerts", []) if isinstance(payload, dict) else []
        names = [a.get("labels", {}).get("alertname", "?") for a in alerts]
        print(f"RECEIVED {self.command} {self.path} alerts={names}", flush=True)
        print("  payload: " + json.dumps(payload)[:500], flush=True)

    def do_POST(self):
        self._receive()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')

    def do_GET(self):
        self._receive()
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9099
    print(f"webhook receiver listening on 0.0.0.0:{port}", flush=True)
    http.server.HTTPServer(("0.0.0.0", port), Handler).serve_forever()
