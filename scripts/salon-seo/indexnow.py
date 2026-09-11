"""Notify IndexNow only about changed canonical, indexable public pages.
No repeated polling, no customer identifiers, no key in logs or reports.
Run from the VPS after successful production readback.
"""
from pathlib import Path
import argparse,json,re,urllib.request,urllib.error
HOST='https://akademsalon.ru'
def submit(root,manifest):
 key=(root/'.indexnow-key').read_text().strip()
 assert re.fullmatch('[A-Za-z0-9-]{8,128}',key)
 key_file=root/(key+'.txt')
 assert key_file.exists() and key_file.read_text().strip()==key
 with urllib.request.urlopen(HOST+'/'+key+'.txt',timeout=20) as r:assert r.read().decode().strip()==key
 urls=[]
 for file in manifest['changed']:
  if not file.endswith('.html'):continue
  s=(root/file).read_text()
  if re.search(r'<meta[^>]*name="robots"[^>]*noindex',s,re.I):continue
  m=re.search(r'<link rel="canonical" href="([^"]+)"',s)
  if m and m[1].startswith(HOST+'/'):urls.append(m[1])
 urls=sorted(set(urls));assert 0<len(urls)<=10000
 payload=json.dumps({'host':'akademsalon.ru','key':key,'keyLocation':HOST+'/'+key+'.txt','urlList':urls}).encode()
 results=[]
 # The shared protocol distributes notifications; a single participating endpoint is enough.
 endpoint='https://yandex.com/indexnow'
 req=urllib.request.Request(endpoint,data=payload,headers={'Content-Type':'application/json; charset=utf-8'},method='POST')
 try:
  with urllib.request.urlopen(req,timeout=30) as r:status=r.status
 except urllib.error.HTTPError as e:status=e.code
 results.append({'endpoint':endpoint,'http_status':status,'submitted_urls':len(urls),'accepted':status in [200,202]})
 return {'urls':urls,'results':results,'meaning':'Accepted notification is not proof of indexing, rankings, traffic or orders.'}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--manifest',type=Path,required=True);p.add_argument('--receipt',type=Path,required=True);a=p.parse_args()
 result=submit(a.root,json.loads(a.manifest.read_text()));a.receipt.write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False))
