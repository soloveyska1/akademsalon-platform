#!/usr/bin/env python3
"""Guarded source-only assistant release; no database or pricing mutations."""
from pathlib import Path
import argparse,datetime,hashlib,json,os,subprocess,tempfile
EXPECTED='61ab866d1c600893e05271e39eaf6c4ffbc865591c94d4cec701d7d180a71aee'
FILES={'assistant.py':'app/services/assistant.py','assistant_knowledge.json':'app/services/assistant_knowledge.json'}
def sha(b):return hashlib.sha256(b).hexdigest() if b is not None else None
def read(p):
 if p.is_symlink():raise ValueError('symlink_source')
 return p.read_bytes() if p.exists() else None
def stopped(root):
 if root.resolve().is_relative_to(Path(tempfile.gettempdir()).resolve()):return
 state=subprocess.check_output(['systemctl','show','salon-bot-v2.service','-p','ActiveState','-p','MainPID'],text=True)
 if 'MainPID=0' not in state or not any('ActiveState='+s in state for s in ['inactive','failed']):raise ValueError('stop_runtime_before_mutation')
def atomic(p,b):
 p.parent.mkdir(parents=True,exist_ok=True);fd,name=tempfile.mkstemp(prefix='.listik-',dir=p.parent)
 try:
  with os.fdopen(fd,'wb') as f:f.write(b);f.flush();os.fsync(f.fileno())
  os.chmod(name,0o644);os.replace(name,p)
 finally:
  if os.path.exists(name):os.unlink(name)
def prepare(root,module,knowledge):
 old={name:read(root/rel) for name,rel in FILES.items()}
 if sha(old['assistant.py'])!=EXPECTED or old['assistant_knowledge.json'] is not None:raise ValueError('reviewed_source_changed')
 new={'assistant.py':module.read_bytes(),'assistant_knowledge.json':knowledge.read_bytes()}
 compile(new['assistant.py'],'assistant.py','exec');data=json.loads(new['assistant_knowledge.json'])
 if data.get('version')!=1 or len(data.get('pages',[]))<50:raise ValueError('invalid_public_index')
 if any(p['url'] in ['/referral.html','/referral-rules.html','/dashboard.html','/terms.html'] for p in data['pages']):raise ValueError('private_or_stale_source')
 return old,new
def apply(root,module,knowledge):
 old,new=prepare(root,module,knowledge);stopped(root)
 backup=root/'backups'/('listik-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'));backup.mkdir(mode=0o700,parents=True)
 receipt={'database_changed':False,'backup':str(backup),'files':{n:{'before':sha(old[n]),'after':sha(new[n])} for n in FILES}}
 for n,b in old.items():
  if b is not None:atomic(backup/n,b)
 atomic(backup/'receipt.json',json.dumps(receipt,indent=2).encode())
 try:
  for n,rel in FILES.items():atomic(root/rel,new[n])
 except Exception:
  for n,rel in FILES.items():
   if old[n] is None:(root/rel).unlink(missing_ok=True)
   else:atomic(root/rel,old[n])
  raise
 return receipt
def rollback(root,backup):
 stopped(root);receipt=json.loads((backup/'receipt.json').read_text())
 for n,rel in FILES.items():
  if sha(read(root/rel))!=receipt['files'][n]['after'] or sha(read(backup/n))!=receipt['files'][n]['before']:raise ValueError('source_or_backup_changed')
 for n,rel in FILES.items():
  old=read(backup/n)
  if old is None:(root/rel).unlink()
  else:atomic(root/rel,old)
 return {'rolled_back':True,'database_changed':False}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['prepare','apply','rollback']);p.add_argument('--root',type=Path,required=True);p.add_argument('--module',type=Path,default=Path(__file__).with_name('assistant.py'));p.add_argument('--knowledge',type=Path,default=Path(__file__).with_name('assistant_knowledge.json'));p.add_argument('--backup',type=Path);a=p.parse_args()
 if a.mode=='prepare':old,new=prepare(a.root,a.module,a.knowledge);r={'files':{n:{'before':sha(old[n]),'after':sha(new[n])} for n in FILES},'database_changed':False}
 elif a.mode=='apply':r=apply(a.root,a.module,a.knowledge)
 else:r=rollback(a.root,a.backup)
 print(json.dumps(r))
