from pathlib import Path
import hashlib,json,os,tarfile,tempfile,urllib.request,urllib.error,subprocess,shutil
from urllib.parse import urlsplit
base=Path('/var/www/academic_saloon');stage=Path('/tmp/salon-control-release199');archive=stage/'salon-public-release199-delta.tar.gz';manifest=json.loads((stage/'salon-public-release199.manifest.json').read_text())
assert hashlib.sha256(archive.read_bytes()).hexdigest()=='3ec08449f154b501c48537e227b1742f27c376b583675feb8038b9e791d94a89'
assert hashlib.sha256((stage/'salon-public-release199.manifest.json').read_bytes()).hexdigest()=='b0622647965ee70cf77581667bce8dcfecfb9d59d699a49d14a68f43d9ee912f'
assert manifest['source_commit']=='c8f7afaa0cec529daa70b6e765de5be9ae87dccf'
old=base/'releases/release198-666e7b8f';release=base/'releases/release199-c8f7afaa'
assert (base/'current').resolve()==old and (base/'dist').resolve()==old
assert not release.exists()
unpack=Path(tempfile.mkdtemp(prefix='.release199-',dir=base/'releases'))
shutil.copytree(old,unpack,dirs_exist_ok=True,copy_function=shutil.copyfile)
with tarfile.open(archive) as tf:
 for m in tf.getmembers():
  p=Path(m.name)
  assert not p.is_absolute() and '..' not in p.parts and not m.issym() and not m.islnk() and (m.isfile() or m.isdir())
  assert all(not x.startswith('._') and x!='.DS_Store' for x in p.parts)
 tf.extractall(unpack)
# Drop only obsolete files in the new, unpublished copy. The old release is immutable.
for p in unpack.rglob('*'):
 if p.is_file() and str(p.relative_to(unpack)) not in manifest['files']:p.unlink()
actual={str(p.relative_to(unpack)):hashlib.sha256(p.read_bytes()).hexdigest() for p in unpack.rglob('*') if p.is_file()}
assert actual==manifest['files'],{'missing':list(set(manifest['files'])-set(actual))[:4],'extra':list(set(actual)-set(manifest['files']))[:4]}
for p in unpack.rglob('*'):p.chmod(0o755 if p.is_dir() else 0o644)
unpack.chmod(0o755);unpack.rename(release)
record={'release':release.name,'source_commit':manifest['source_commit'],'files':len(actual),'steps':[],'database_restored':False}
def switch(target,name):
 temp=base/('.'+name+'-release199')
 if temp.is_symlink():temp.unlink()
 os.symlink(str(target),temp);os.replace(temp,base/name)
def get(path):
 req=urllib.request.Request('http://127.0.0.1'+path,headers={'Host':'akademsalon.ru'})
 # Nginx HTTP redirects to HTTPS; use TLS canonical host for exact public artifact.
 req=urllib.request.Request('https://akademsalon.ru'+path)
 with urllib.request.urlopen(req,timeout=10) as r:return r.read(),r.headers
redirects={'expertise.html': {'status': 301, 'location': 'https://akademsalon.ru/'}, 'index.html': {'status': 301, 'location': 'https://akademsalon.ru/'}}
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
oldhash=hashlib.sha256((old/'index.html').read_bytes()).hexdigest()
def verify(target,modern):
 h=json.loads(get('/api/health')[0]);assert h.get('ok'),h
 f=json.loads(get('/api/features')[0]);assert f.get('pay_online'),f
 home=get('/?release_check='+target.name)[0];assert hashlib.sha256(home).hexdigest()==(actual['index.html'] if modern else oldhash)
 out={'health':h,'pay_online':f['pay_online'],'current':str((base/'current').resolve()),'index_sha256':hashlib.sha256(home).hexdigest()}
 assert (base/'current').resolve()==target and (base/'dist').resolve()==target
 if modern:
  for path in ['index.html', 'dashboard.html', 'configurator.html', 'zayavka.html', 'services.html', 'kursovaya-rabota.html', 'kursovaya-po-psihologii.html', 'benefits.html', 'admin.html', 'privacy.html', 'oferta.html', 'referral.html', 'referral-rules.html', 'sitemap.xml', 'sw.js', 'assets/js/app.js', 'assets/js/salon-workspace.js', 'assets/css/salon-workspace.css', 'assets/js/admin.js']:
   final=destination(path);body,headers=get('/'+final+'?release_check='+target.name);assert hashlib.sha256(body).hexdigest()==actual[final],path
  assert b'cabinet-demo.js' not in get('/dashboard.html')[0]
  _,hdr=get('/assets/vendor/pdfjs/pdf.min.mjs');assert 'javascript' in hdr.get('Content-Type','')
  out['pdf_module_mime']=hdr.get('Content-Type');out['preserved_redirects']=redirects
 return out
assert (base/'current').resolve()==old and (base/'dist').resolve()==old
try:
 for action,target,modern in [('apply',release,True),('rollback',old,False),('forward',release,True)]:
  switch(target,'current');switch(target,'dist');record['steps'].append({'action':action,**verify(target,modern)})
 switch(old,'previous')
except Exception as e:
 switch(old,'current');switch(old,'dist');record['error']=type(e).__name__+': '+str(e);record['recovery']=verify(old,False)
 (stage/'static-release.json').write_text(json.dumps(record,indent=2));raise
(stage/'static-release.json').write_text(json.dumps(record,indent=2));print(json.dumps(record))
