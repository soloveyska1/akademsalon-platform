from pathlib import Path
import json
p=Path('/tmp/salon-header-static-release.py');s=p.read_text();start=s.index('assert not release.exists()');end=s.index('record={',start)
s=s[:start]+'''assert release.is_dir()
actual={str(p.relative_to(release)):hashlib.sha256(p.read_bytes()).hexdigest() for p in release.rglob('*') if p.is_file()}
assert actual==manifest['files']
if (stage/'static-release.json').exists():shutil.copyfile(stage/'static-release.json',stage/'recovered-initial-attempt.json')
'''+s[end:]
s=s.replace('import hashlib,json,os,tarfile,tempfile,urllib.request,subprocess,shutil','import hashlib,json,os,tarfile,tempfile,urllib.request,urllib.error,subprocess,shutil\nfrom urllib.parse import urlsplit')
marker="oldhash=hashlib.sha256((old/'index.html').read_bytes()).hexdigest()"
redirects=json.loads(Path('/tmp/salon-header-redirects.json').read_text())
insert="redirects="+repr(redirects)+'''
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
opener=urllib.request.build_opener(NoRedirect)
def destination(path):
 if path not in redirects:return path
 expected=redirects[path]
 try:
  opener.open(urllib.request.Request('https://akademsalon.ru/'+path,method='HEAD'),timeout=10)
  raise AssertionError('Expected preserved redirect: '+path)
 except urllib.error.HTTPError as e:
  assert e.code==expected['status'] and e.headers.get('Location')==expected['location'],path
 return urlsplit(expected['location']).path.lstrip('/') or 'index.html'
'''
s=s.replace(marker,insert+marker)
s=s.replace("body,headers=get('/'+path+'?release_check='+target.name);assert hashlib.sha256(body).hexdigest()==actual[path],path", "final=destination(path);body,headers=get('/'+final+'?release_check='+target.name);assert hashlib.sha256(body).hexdigest()==actual[final],path")
s=s.replace("out['pdf_module_mime']=hdr.get('Content-Type')", "out['pdf_module_mime']=hdr.get('Content-Type');out['preserved_redirects']=redirects")
Path('/tmp/salon-header-activate-release.py').write_text(s)
