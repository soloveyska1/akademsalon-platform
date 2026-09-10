from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
import os,sys,json
ROOT=Path('/Users/saymurrbk.ru/.codex/worktrees/listik-concierge')
sys.path.insert(0,str(ROOT/'backend/salon_bot'));import assistant
os.chdir(ROOT)
class Local(SimpleHTTPRequestHandler):
 def do_POST(self):
  if self.path=='/api/assistant/answer':
   try:
    body=json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))));r=assistant.answer(body.get('question'),context=body.get('context'));status=200
   except Exception as e:r={'ok':False,'error':str(e)};status=400
  else:r={'ok':False,'error':'local_mutation_blocked'};status=405
  data=json.dumps(r,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(data)
 def log_message(self,*args):pass
ThreadingHTTPServer(('127.0.0.1',8784),Local).serve_forever()
