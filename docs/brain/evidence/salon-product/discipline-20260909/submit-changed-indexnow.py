from pathlib import Path
import urllib.request,urllib.error,json,re,xml.etree.ElementTree as ET,hashlib
root=Path('/var/www/academic_saloon/current');receipt=Path('/tmp/salon-discipline-release195/indexnow.json')
assert root.resolve().name=='release195-dc6fa1ff'
if receipt.exists():print(receipt.read_text());raise SystemExit
keys=[p for p in root.glob('*.txt') if re.fullmatch('[a-zA-Z0-9-]{8,128}',p.stem) and p.read_text().strip()==p.stem]
if len(keys)!=1:print(json.dumps({'submitted':False,'reason':'no unambiguous existing verification key'}));raise SystemExit
key=keys[0].read_text().strip();keyurl='https://akademsalon.ru/'+keys[0].name
with urllib.request.urlopen(keyurl,timeout=10) as r:assert r.status==200 and r.read().decode().strip()==key
sitemap=(root/'sitemap.xml').read_bytes()
urls=[e.text for e in ET.fromstring(sitemap).findall('{*}url/{*}loc')]
changed=['https://akademsalon.ru/kursovaya-po-ekonomike.html', 'https://akademsalon.ru/diplomnaya-po-ekonomike.html', 'https://akademsalon.ru/kursovaya-po-menedzhmentu.html', 'https://akademsalon.ru/kursovaya-po-pedagogike.html', 'https://akademsalon.ru/kursovaya-po-yurisprudencii.html', 'https://akademsalon.ru/diplomnaya-po-yurisprudencii.html', 'https://akademsalon.ru/kursovaya-po-informatike.html', 'https://akademsalon.ru/kursovaya-po-psihologii.html', 'https://akademsalon.ru/diplomnaya-po-psihologii.html']
assert set(changed)<=set(urls)
urls=changed
assert len(urls)==len(set(urls))==9
assert all(u.startswith('https://akademsalon.ru/') and '?' not in u and '#' not in u for u in urls)
body=json.dumps({'host':'akademsalon.ru','key':key,'keyLocation':keyurl,'urlList':urls}).encode()
request=urllib.request.Request('https://api.indexnow.org/indexnow',data=body,headers={'Content-Type':'application/json; charset=utf-8'},method='POST')
try:
 with urllib.request.urlopen(request,timeout=20) as r:status=r.status
except urllib.error.HTTPError as e:status=e.code
out={'endpoint':'https://api.indexnow.org/indexnow','status':status,'submitted':status in (200,202),'url_count':len(urls),'url_list':urls,'key_verified_on_public_origin':True,'sitemap_sha256':hashlib.sha256(sitemap).hexdigest(),'meaning':'received, not proof of crawling, indexing or ranking'}
receipt.write_text(json.dumps(out,indent=2));print(json.dumps(out))
