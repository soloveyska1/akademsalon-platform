from pathlib import Path
import hashlib,json,os,tarfile,tempfile,urllib.request,subprocess,shutil
base=Path('/var/www/academic_saloon');stage=Path('/tmp/salon-rewards-release189');archive=stage/'salon-public-release189-delta.tar.gz';manifest=json.loads((stage/'salon-public-release189-final.manifest.json').read_text())
assert hashlib.sha256(archive.read_bytes()).hexdigest()=='53182d56fc02826b2857ab44e67c97ef4d8fe8327f557426d8ea42c96a61a88f'
assert hashlib.sha256((stage/'salon-public-release189-final.manifest.json').read_bytes()).hexdigest()=='0c7bcd39bfc515a97cc287015f1b26b6c5e81c79699012817269c91c94890a37'
assert manifest['source_commit']=='3988a47186db92b269ce569e0204aa7a5abc79e4'
old=base/'releases/release188-2276c819';release=base/'releases/release189-3988a471'
assert (base/'current').resolve()==old and (base/'dist').resolve()==old
assert not release.exists()
unpack=Path(tempfile.mkdtemp(prefix='.release189-',dir=base/'releases'))
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
 temp=base/('.'+name+'-release189')
 if temp.is_symlink():temp.unlink()
 os.symlink(str(target),temp);os.replace(temp,base/name)
def get(path):
 req=urllib.request.Request('http://127.0.0.1'+path,headers={'Host':'akademsalon.ru'})
 # Nginx HTTP redirects to HTTPS; use TLS canonical host for exact public artifact.
 req=urllib.request.Request('https://akademsalon.ru'+path)
 with urllib.request.urlopen(req,timeout=10) as r:return r.read(),r.headers
oldhash=hashlib.sha256((old/'index.html').read_bytes()).hexdigest()
def verify(target,modern):
 h=json.loads(get('/api/health')[0]);assert h.get('ok'),h
 f=json.loads(get('/api/features')[0]);assert f.get('pay_online'),f
 home=get('/?release_check='+target.name)[0];assert hashlib.sha256(home).hexdigest()==(actual['index.html'] if modern else oldhash)
 out={'health':h,'pay_online':f['pay_online'],'current':str((base/'current').resolve()),'index_sha256':hashlib.sha256(home).hexdigest()}
 assert (base/'current').resolve()==target and (base/'dist').resolve()==target
 if modern:
  for path in ['benefits.html', 'gift.html', 'reviews.html', 'deposit.html', 'plus.html', 'oferta.html', 'privacy.html', 'terms.html', 'refunds.html', 'requisites.html', 'loyalty.html', 'consent.html', 'consent-analytics.html', 'consent-marketing.html', 'consent-publication.html', 'consent-request.html', 'academic-integrity.html', 'referral.html', 'referral-rules.html', 'specifikaciya.html', 'assets/js/salon-workspace.js', 'assets/js/polish15-supporting.js', 'assets/css/salon-rewards.css', 'assets/css/salon-legal.css', 'assets/css/salon-reviews.css', 'assets/js/salon-rewards.js', 'assets/js/salon-legal.js', 'assets/js/salon-reviews.js']:
   body,headers=get('/'+path+'?release_check='+target.name);assert hashlib.sha256(body).hexdigest()==actual[path],path
  assert b'cabinet-demo.js' not in get('/dashboard.html')[0]
  _,hdr=get('/assets/vendor/pdfjs/pdf.min.mjs');assert 'javascript' in hdr.get('Content-Type','')
  out['pdf_module_mime']=hdr.get('Content-Type')
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
