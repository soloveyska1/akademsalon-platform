from pathlib import Path
import sys,json,hashlib,tarfile,subprocess,time,urllib.request,os,importlib.util
STAGE=Path('/tmp/salon-listik-0821d4c7');BASE=Path('/var/www/academic_saloon');OLD=BASE/'releases/release208-store-current-0e05ce04';NEW=BASE/'releases/release209-listik-0821d4c7';ROOT=Path('/root/salon_bot')
manifest=json.loads((STAGE/'public209.manifest.json').read_text())
sha=lambda b:hashlib.sha256(b).hexdigest()
expected={'assistant.py':'8a1a4293ccb2d6e22ea622123b39b8265335297bd32da94e3a286793444c6c0a','assistant_knowledge.json':'7c37d57e334b38798d534f4724d238e212cc5f114cf85fb95cc2ede98c63c8fc','install_assistant_concierge.py':'53b70e6c7051449df4a3dfc863af538b55d01586f2b8273a712aa695792ae602'}
for n,h in expected.items():assert sha((STAGE/n).read_bytes())==h,n
assert sha((STAGE/'public209.tar.gz').read_bytes())=='98c5d2fac153144226303eec55c04ecc7c01cadf33b2a812b69f69566dd9f708'
assert manifest['source_commit']=='0821d4c7bf6daa2d77bc03b669f2e123d86469a6'
spec=importlib.util.spec_from_file_location('installer',STAGE/'install_assistant_concierge.py');installer=importlib.util.module_from_spec(spec);spec.loader.exec_module(installer)
def command(*args):return subprocess.check_output(args,text=True).strip()
def api(path,body=None):
 data=None if body is None else json.dumps(body).encode();req=urllib.request.Request('https://akademsalon.ru/api'+path,data=data,headers={'Content-Type':'application/json','Origin':'https://akademsalon.ru'})
 with urllib.request.urlopen(req,timeout=8) as r:return json.load(r)
def health():
 for i in range(20):
  try:
   r=api('/health')
   if r.get('ok') is True:return {'ok':True,'service':command('systemctl','is-active','salon-bot-v2.service')}
  except Exception:pass
  time.sleep(.5)
 raise RuntimeError('healthcheck_failed')
def check_tree(root,hashes):
 actual={str(p.relative_to(root)) for p in root.rglob('*') if p.is_file()}
 assert actual==set(hashes),'inventory_changed'
 for n,h in hashes.items():assert not (root/n).is_symlink() and sha((root/n).read_bytes())==h,n

def switch(expect,target):
 assert (BASE/'current').resolve()==expect,'live_pointer_changed'
 tmp=BASE/'current.listik-next';assert not tmp.exists() and not tmp.is_symlink()
 os.symlink(str(target),tmp);os.replace(tmp,BASE/'current')
 assert (BASE/'current').resolve()==target

def activate_backend():
 command('systemctl','stop','salon-bot-v2.service');receipt=None
 try:
  receipt=installer.apply(ROOT,STAGE/'assistant.py',STAGE/'assistant_knowledge.json')
 finally:command('systemctl','start','salon-bot-v2.service')
 try:
  health();r=api('/assistant/answer',{'question':'Как дела?'})
  assert r.get('ok') is True and r.get('version')=='listik-concierge-2026-09-11.1','assistant_version'
 except Exception:
  if receipt:rollback_backend(receipt)
  raise
 return receipt

def rollback_backend(receipt):
 command('systemctl','stop','salon-bot-v2.service')
 try:installer.rollback(ROOT,Path(receipt['backup']))
 finally:command('systemctl','start','salon-bot-v2.service')
 health()

if sys.argv[1]=='stage':
 assert (BASE/'current').resolve()==OLD,'live_release_advanced'
 check_tree(OLD,manifest['before_files']);installer.prepare(ROOT,STAGE/'assistant.py',STAGE/'assistant_knowledge.json')
 assert not NEW.exists();NEW.mkdir()
 with tarfile.open(STAGE/'public209.tar.gz','r:gz') as archive:
  for member in archive:
   assert member.isfile() and member.name in manifest['files'];p=NEW/member.name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(archive.extractfile(member).read());p.chmod(0o644)
 check_tree(NEW,manifest['files']);print(json.dumps({'prepared':True,'files':len(manifest['files']),'previous':str(OLD),'health':health()}))
elif sys.argv[1]=='release':
 assert (BASE/'current').resolve()==OLD;check_tree(OLD,manifest['before_files']);check_tree(NEW,manifest['files'])
 dist_before=os.readlink(BASE/'dist');first=activate_backend()
 try:
  switch(OLD,NEW);health()
  # Verify the actual static rollback and source rollback, then deploy forward again.
  switch(NEW,OLD);rollback_backend(first)
  assert sha((ROOT/'app/services/assistant.py').read_bytes())==installer.EXPECTED
  assert not (ROOT/'app/services/assistant_knowledge.json').exists()
  check_tree(OLD,manifest['before_files'])
  second=activate_backend();switch(OLD,NEW);check_tree(NEW,manifest['files']);health()
 except Exception:
  if (BASE/'current').resolve()==NEW:switch(NEW,OLD)
  current=sha((ROOT/'app/services/assistant.py').read_bytes())
  if current==expected['assistant.py']:rollback_backend(locals().get('second',first))
  raise
 assert os.readlink(BASE/'dist')==dist_before,'compatibility_pointer_changed'
 receipt={'source_commit':manifest['source_commit'],'release':str(NEW),'previous':str(OLD),'dist_preserved':dist_before,'files':459,'assistant_hash':expected['assistant.py'],'knowledge_hash':expected['assistant_knowledge.json'],'first_backup':first['backup'],'rollback_verified':True,'forward_backup':second['backup'],'health':health(),'database_changed_by_installer':False,'timestamp_utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
 dest=BASE/'deployments/listik-release209-0821d4c7.json';dest.write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
