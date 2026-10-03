"""Serve only the prepared public preview. No production API proxy."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import urllib.parse
from prepare import CACHE, REDIRECTS, RELEASE


class PreviewHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Robots-Tag', 'noindex, nofollow')
        self.send_header('X-Akademsalon-Preview', RELEASE)
        self.send_header('Content-Security-Policy',
                         "default-src 'self'; script-src 'self' 'unsafe-inline'; "
                         "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
                         "font-src 'self' data:; media-src 'self' blob:; "
                         "connect-src 'self'; form-action 'none'; base-uri 'self'")
        super().end_headers()

    def unavailable(self):
        self.send_response(503)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        body = b'{"ok":false,"error":"preview_has_no_backend"}'
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def do_GET(self):
        path = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)
        if path == '/api' or path.startswith('/api/'):
            return self.unavailable()
        if any(part.startswith('.') for part in path.split('/') if part):
            return self.send_error(404)
        root = Path(self.directory).resolve()
        target = Path(self.translate_path(self.path))
        if not target.resolve().is_relative_to(root):
            return self.send_error(404)
        if path.lstrip('/') in REDIRECTS:
            self.send_response(301)
            self.send_header('Location', REDIRECTS[path.lstrip('/')])
            self.end_headers()
            return
        if self.command == 'HEAD':
            return super().do_HEAD()
        return super().do_GET()

    do_HEAD = do_GET
    do_POST = unavailable
    do_PUT = unavailable
    do_PATCH = unavailable
    do_DELETE = unavailable

    def list_directory(self, path):
        self.send_error(404)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--host', default='127.0.0.1')
    args = parser.parse_args()
    if not (CACHE / 'baseline.json').is_file() or not (CACHE / 'public/index.html').is_file():
        parser.error('Run bash scripts/cloud-workspace/setup.sh first')
    server = ThreadingHTTPServer((args.host, args.port), partial(PreviewHandler, directory=str(CACHE / 'public')))
    print(f'Preview {RELEASE}: http://{args.host}:{server.server_port} (API disabled)', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
