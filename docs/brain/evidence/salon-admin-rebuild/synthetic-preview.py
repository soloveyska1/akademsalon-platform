from pathlib import Path
import http.server,json,os,urllib.parse
os.chdir('/Users/saymurrbk.ru/.codex/worktrees/salon-admin-rebuild')
class H(http.server.SimpleHTTPRequestHandler):
 def do_GET(self):
  p=urllib.parse.urlsplit(self.path)
  if p.path=='/admin.html':
   text=Path('admin.html').read_text().replace('<script src="assets/js/app.js', '<script>const nativeFetch=window.fetch.bind(window);window.fetch=(u,o)=>nativeFetch(String(u).replace(/^https:\\/\\/akademsalon.ru\\/api/,"/api"),o);</script><script src="assets/js/app.js')
   self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(text.encode());return
  if p.path.startswith('/api/'):
   data=json.load(open('/tmp/admin-rebuild-fixtures.json'));route=p.path[4:];d=data.get(route,{'ok':True})
   if '/analytics/' in route:
    hours=int(urllib.parse.parse_qs(p.query).get('hours',['168'])[0]);d={'ok':True,'period':{'hours':hours},'metrics':{'visitors':128,'sessions':163,'pageviews':540,'converted_sessions':9,'session_conversion_pct':5.52,'online':3},'funnel':[{'label':'Открыли сайт','sessions':163},{'label':'Выбрали услугу','sessions':42},{'label':'Оформили заявку','sessions':9}],'sources':[{'name':'Поиск','sessions':83},{'name':'Telegram','sessions':54},{'name':'Прямой переход','sessions':26}],'devices':[{'name':'Телефоны','sessions':113},{'name':'Компьютеры','sessions':50}],'items':[],'errors':[],'pages':[]}
   body=json.dumps(d,ensure_ascii=False).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(body);return
  return super().do_GET()
 def do_POST(self):
  self.send_response(403);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"ok":false,"error":"qa_readonly"}')
http.server.ThreadingHTTPServer(('127.0.0.1',8780),H).serve_forever()
