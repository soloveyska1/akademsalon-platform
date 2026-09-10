from pathlib import Path
import json,hashlib,subprocess,time,urllib.request,urllib.error,importlib.util,os
root=Path('/root/salon_bot');stage=Path('/tmp/salon-checkout-release203');service='salon-bot-v2.service'
def sha(b):return hashlib.sha256(b).hexdigest()
def run(*args):return subprocess.check_output(list(args),text=True)
def stop():subprocess.run(['systemctl','stop',service],check=True)
def start():subprocess.run(['systemctl','start',service],check=True)
def health(modern):
 error=None
 for attempt in range(20):
  try:
   with urllib.request.urlopen('https://akademsalon.ru/api/health',timeout=3) as r:h=json.load(r)
   with urllib.request.urlopen('https://akademsalon.ru/api/features',timeout=3) as r:f=json.load(r)
   assert h.get('ok') and f.get('pay_online')
   assert run('systemctl','is-active',service).strip()=='active'
   code=None
   if modern:
    try:urllib.request.urlopen('https://akademsalon.ru/api/orders/999999999/checkout-action',timeout=3)
    except urllib.error.HTTPError as e:code=e.code
    assert code==405,code
   return {'health':h,'pay_online':f['pay_online'],'checkout_get_status':code}
  except Exception as exc:error=type(exc).__name__+': '+str(exc);time.sleep(.5)
 raise RuntimeError(error)
spec=importlib.util.spec_from_file_location('installer',stage/'installer.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
refs=stage/'reference.json';module=stage/'payment_journey.py';changes=m.prepare(root,refs,module)
expected=json.loads((stage/'expected.json').read_text())
assert {rel:sha(new) for rel,(old,new) in changes.items()}==expected
record={'release':'onsite-checkout-203','database_restored':False,'steps':[],'files':{rel:{'before':sha(old) if old else None,'after':sha(new)} for rel,(old,new) in changes.items()}}
assert run('systemctl','is-active',service).strip()=='active'
backup=None
try:
 stop()
 result=json.loads(run('/root/salon_bot/venv/bin/python',str(stage/'installer.py'),'apply','--root',str(root),'--reference',str(refs),'--module',str(module)));backup=Path(result['backup']);record['backup']=str(backup)
 start();record['steps'].append({'action':'apply',**health(True)})
 stop()
 rollback=json.loads(run('/root/salon_bot/venv/bin/python',str(stage/'installer.py'),'rollback','--root',str(root),'--backup',str(backup)))
 assert rollback['compatibility_retained']==['app/services/gift.py']
 start();record['steps'].append({'action':'rollback','compatibility_retained':rollback['compatibility_retained'],**health(False)})
 stop()
 for rel,(old,new) in changes.items():
  path=root/rel
  if rel=='app/services/gift.py':assert sha(path.read_bytes())==sha(new)
  elif old is None:assert not path.exists()
  else:assert sha(path.read_bytes())==sha(old)
 for rel,(old,new) in changes.items():m.atomic(root/rel,new)
 start();record['steps'].append({'action':'forward',**health(True)})
 record['final_hashes']={rel:sha((root/rel).read_bytes()) for rel in changes};assert record['final_hashes']==expected
except Exception as exc:
 record['error']=type(exc).__name__+': '+str(exc)
 stop()
 for rel,(old,new) in changes.items():
  path=root/rel;current=sha(path.read_bytes()) if path.exists() else None
  assert current in (sha(old) if old else None,sha(new)),rel
 for rel,(old,new) in changes.items():
  if rel=='app/services/gift.py':m.atomic(root/rel,new)
  elif old is None:(root/rel).unlink(missing_ok=True)
  else:m.atomic(root/rel,old)
 start();record['recovery']=health(False)
 (stage/'backend-release.json').write_text(json.dumps(record,indent=2));raise
(stage/'backend-release.json').write_text(json.dumps(record,indent=2));print(json.dumps(record))
