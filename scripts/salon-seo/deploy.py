"""Run on the existing VPS after transferring the validated delta and manifest.
Fail closed on a changed baseline. Does not modify backend, DB or Nginx config.
"""
from pathlib import Path
import argparse,fcntl,hashlib,json,os,shutil,tarfile,tempfile,urllib.request

BASE=Path('/var/www/academic_saloon')
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def inventory(p):return {str(f.relative_to(p)):digest(f) for f in p.rglob('*') if f.is_file()}
def get(path):
 with urllib.request.urlopen('https://akademsalon.ru'+path,timeout=20) as r:return r.read(),dict(r.headers)
def switch(target):
 temp=BASE/'.current-seo-switch'
 if temp.is_symlink():temp.unlink()
 os.symlink(str(target),temp);os.replace(temp,BASE/'current')

def deploy(stage,expected,release,archive_hash):
 manifest=json.loads((stage/'build.json').read_text());archive=stage/'delta.tar.gz'
 assert digest(archive)==archive_hash,'archive mismatch'
 old=(BASE/'current').resolve();dist=(BASE/'dist').resolve()
 assert old.name==expected,'production pointer moved'
 before=inventory(old)
 assert before==manifest['baseline_files'],'production contents changed since snapshot'
 assert not manifest['deleted'],'this overlay cannot delete public files'
 target=BASE/'releases'/release;assert not target.exists()
 tmp=Path(tempfile.mkdtemp(prefix='.seo-stage-',dir=BASE/'releases'))
 shutil.copytree(old,tmp,dirs_exist_ok=True,copy_function=shutil.copy2)
 with tarfile.open(archive) as tf:
  members=tf.getmembers()
  assert sorted(m.name for m in members)==sorted(manifest['changed'])
  for member in members:
   p=Path(member.name)
   assert member.isfile() and not p.is_absolute() and '..' not in p.parts and not member.issym() and not member.islnk()
   dest=tmp/p;dest.parent.mkdir(parents=True,exist_ok=True)
   with tf.extractfile(member) as source:dest.write_bytes(source.read())
   dest.chmod(0o644)
 assert inventory(tmp)==manifest['files'],'staged tree mismatch'
 tmp.chmod(old.stat().st_mode & 0o777);tmp.rename(target)
 record={'release':release,'baseline_release':expected,'source_commit':manifest.get('source_commit'),'old_dist':dist.name,'dist_preserved':True,'database_changed':False,'backend_changed':False,'steps':[]}
 critical=['/','/services.html','/configurator.html','/dashboard.html','/razbor-zamechaniy-nauchruka.html','/normokontrol-vkr.html','/guide-kursovaya-za-nedelyu.html','/favicon.svg','/favicon.ico','/manifest.webmanifest','/sw.js','/sitemap.xml','/feed.xml','/assets/img/seo-20260911/icon-96.png','/assets/img/seo-20260911/og-home.png']
 def verify(root,modern):
  assert (BASE/'current').resolve()==root and (BASE/'dist').resolve()==dist
  health=json.loads(get('/api/health')[0]);features=json.loads(get('/api/features')[0]);assert health.get('ok') and features.get('pay_online')
  checked=[]
  for path in critical if modern else ['/','/configurator.html','/dashboard.html','/sw.js']:
   file='index.html' if path=='/' else path[1:]
   body,headers=get(path+'?seo_verify='+release)
   assert hashlib.sha256(body).hexdigest()==digest(root/file),path
   if path.endswith('.svg'):assert 'image/svg+xml' in headers.get('Content-Type','')
   checked.append(path)
  return {'health_ok':True,'pay_online':True,'files_verified':checked}
 # Recheck immediately before the only public pointer mutation.
 assert (BASE/'current').resolve()==old and inventory(old)==before
 try:
  for action,root,modern in [('apply',target,True),('rollback',old,False),('forward',target,True)]:
   switch(root);record['steps'].append({'action':action,**verify(root,modern)})
 except Exception as e:
  switch(old);record['error']=type(e).__name__+': '+str(e);record['recovery']=verify(old,False)
  (stage/'receipt.json').write_text(json.dumps(record,indent=2));raise
 record['final_files']=len(manifest['files']);record['changed_files']=len(manifest['changed'])
 (stage/'receipt.json').write_text(json.dumps(record,indent=2));print(json.dumps(record))

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--stage',type=Path,required=True);p.add_argument('--expected-release',required=True);p.add_argument('--release',required=True);p.add_argument('--archive-sha256',required=True);a=p.parse_args()
 assert '/' not in a.release and '/' not in a.expected_release
 with open(BASE/'.seo-deploy.lock','a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  deploy(a.stage,a.expected_release,a.release,a.archive_sha256)
