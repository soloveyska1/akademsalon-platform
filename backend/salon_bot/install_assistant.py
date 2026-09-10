#!/usr/bin/env python3
"""Exact-source assistant upgrade. No schema, pricing or payment mutations."""
from pathlib import Path
import argparse,datetime,hashlib,json,os,subprocess,tempfile
EXPECTED_WEB='4a008c0ed257d8614ef34698fe84dce01b6a64bd4c01c79cb74ef0724a76b621'
EXPECTED_ASSISTANT='ca32ca8d1bc6293780cff1580f10bd4a7492708ac20cee9518e3674cac0d1039'
def sha(data):return hashlib.sha256(data).hexdigest()
def atomic(path,data):
 fd,name=tempfile.mkstemp(prefix='.assistant-',dir=path.parent)
 try:
  with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
  os.chmod(name,0o644);os.replace(name,path)
 finally:
  if os.path.exists(name):os.unlink(name)
def prepare(root,module):
 web=(root/'app/webapp.py').read_bytes();old=(root/'app/services/assistant.py').read_bytes()
 if sha(web)!=EXPECTED_WEB or sha(old)!=EXPECTED_ASSISTANT:raise ValueError('reviewed_source_changed')
 s=web.decode()
 if s.count('return _json(assistant.answer(body["question"].strip(), order, context=body.get("context")))') != 1:raise ValueError('assistant_route_changed')
 new=module.read_bytes();compile(s,'webapp.py','exec');compile(new,'assistant.py','exec')
 return web,old,s.encode(),new
def apply(root,module):
 web,old,newweb,new=prepare(root,module)
 backup=root/'backups'/('assistant-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'));backup.mkdir(mode=0o700,parents=True)
 atomic(backup/'webapp.py',web);atomic(backup/'assistant.py',old)
 receipt={'before_web':sha(web),'after_web':sha(newweb),'before_assistant':sha(old),'after_assistant':sha(new),'database_changed':False,'backup':str(backup)}
 atomic(backup/'receipt.json',json.dumps(receipt,indent=2).encode())
 atomic(root/'app/services/assistant.py',new);atomic(root/'app/webapp.py',newweb);return receipt
def rollback(root,backup):
 if not root.resolve().is_relative_to(Path(tempfile.gettempdir()).resolve()):
  state=subprocess.check_output(['systemctl','show','salon-bot-v2.service','-p','ActiveState','-p','MainPID'],text=True)
  if 'MainPID=0' not in state or not any('ActiveState='+s in state for s in ['inactive','failed']):raise ValueError('stop_runtime_before_rollback')
 r=json.loads((backup/'receipt.json').read_text())
 for name,key in [('webapp.py','web'),('assistant.py','assistant')]:
  dest=root/('app/'+name if key=='web' else 'app/services/'+name)
  if sha(dest.read_bytes())!=r['after_'+key] or sha((backup/name).read_bytes())!=r['before_'+key]:raise ValueError('source_or_backup_changed')
 atomic(root/'app/services/assistant.py',(backup/'assistant.py').read_bytes());atomic(root/'app/webapp.py',(backup/'webapp.py').read_bytes());return {'rolled_back':True,'database_changed':False}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['prepare','apply','rollback']);p.add_argument('--root',type=Path,required=True);p.add_argument('--module',type=Path,default=Path(__file__).with_name('assistant.py'));p.add_argument('--backup',type=Path);a=p.parse_args()
 if a.mode=='prepare':w,o,nw,n=prepare(a.root,a.module);r={'before_web':sha(w),'after_web':sha(nw),'after_assistant':sha(n)}
 elif a.mode=='apply':r=apply(a.root,a.module)
 else:r=rollback(a.root,a.backup)
 print(json.dumps(r))
