"""Локальное превью: файлы из site-work поверх живого akademsalon.ru.
Только GET/HEAD — никаких записей в боевой API."""
import http.server
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve()
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8765
ORIGIN = "https://akademsalon.ru"
TYPES = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
         ".js": "application/javascript; charset=utf-8", ".webp": "image/webp",
         ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".json": "application/json"}


class H(http.server.BaseHTTPRequestHandler):
    def _local(self, path):
        rel = "index.html" if path in ("", "/") else path.lstrip("/")
        f = (ROOT / rel).resolve()
        if ROOT in f.parents and f.is_file():
            return f
        return None

    def do_GET(self, head=False):
        path = self.path.split("?", 1)[0]
        f = self._local(path)
        if f:
            body = f.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", TYPES.get(f.suffix, "application/octet-stream"))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if not head:
                self.wfile.write(body)
            return
        try:
            req = urllib.request.Request(ORIGIN + self.path, headers={"User-Agent": "salon-preview"})
            with urllib.request.urlopen(req, timeout=20) as r:
                body, status, ctype = r.read(), r.status, r.headers.get("Content-Type", "")
        except urllib.error.HTTPError as e:
            body, status, ctype = e.read(), e.code, e.headers.get("Content-Type", "")
        self.send_response(status)
        if ctype:
            self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if not head:
            self.wfile.write(body)

    def do_HEAD(self):
        self.do_GET(head=True)

    def _refuse(self):
        self.send_response(405)
        self.end_headers()

    do_POST = do_PUT = do_PATCH = do_DELETE = _refuse

    def log_message(self, *a):
        pass


http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
