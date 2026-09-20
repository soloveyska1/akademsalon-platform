"""Local-only static preview. No request can reach production."""
import argparse,json
from pathlib import Path
from urllib.parse import urlsplit
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
class Handler(SimpleHTTPRequestHandler):
 def do_GET(self):
  if urlsplit(self.path).path=='/assets/js/app.js':
   # Preview-only rewrite of the existing cross-origin API fallback. Never part of the release.
   s=(Path(self.directory)/'assets/js/app.js').read_text()
   assert "'https://akademsalon.ru/api'" in s
   s=s.replace("'https://akademsalon.ru/api'","'/api'")
   self.send_response(200);self.send_header('Content-Type','application/javascript');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(s.encode());return
  if self.path.startswith('/api/'):
   self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps({'ok':True,'authenticated':False,'items':[],'pay_online':True}).encode());return
  return super().do_GET()
 def end_headers(self):
  self.send_header('Content-Security-Policy',"connect-src 'self'")
  super().end_headers()
 def do_POST(self):
  self.send_response(403);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"ok":false,"error":"local_preview_read_only"}')
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('directory');p.add_argument('--port',type=int,default=8768);a=p.parse_args();ThreadingHTTPServer(('127.0.0.1',a.port),partial(Handler,directory=a.directory)).serve_forever()
