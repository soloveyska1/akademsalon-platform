from pathlib import Path
import importlib.util, json, subprocess, urllib.request, urllib.error, time, hashlib
root=Path('/root/salon_bot'); stage=Path('/tmp/salon-autonomy-release185')
spec=importlib.util.spec_from_file_location('installer',stage/'install_autoquote.py'); installer=importlib.util.module_from_spec(spec);spec.loader.exec_module(installer)
record={'source_commit':'432dfa9bd03a716c38b85d5d648d2655ed1ab8ed','steps':[],'database_restored':False}
def service(action):subprocess.run(['systemctl',action,'salon-bot-v2.service'],check=True,timeout=25)
def get(path,body=None):
 data=None if body is None else json.dumps(body).encode()
 req=urllib.request.Request('http://127.0.0.1:8090'+path,data=data,headers={'Content-Type':'application/json','Host':'akademsalon.ru'})
 with urllib.request.urlopen(req,timeout=4) as r:return json.load(r)
def health(modern):
 for n in range(20):
  try:
   h=get('/api/health')
   if h.get('ok'):break
  except Exception:time.sleep(.5)
 else:raise RuntimeError('health_timeout')
 f=get('/api/features');assert f.get('pay_online'),f
 out={'health':h,'pay_online':f.get('pay_online'),'webapp_sha256':hashlib.sha256((root/'app/webapp.py').read_bytes()).hexdigest()}
 if modern:
  a=get('/api/assistant/answer',{'question':'Сколько стоит экспресс за 24 часа?'})
  assert a.get('ok') and a.get('answer'),a
  q=get('/api/quote/preview',{'work':'essay'})
  assert q.get('ok') and q['quote']['can_pay'] is False,q
  out.update(assistant_source=a.get('source'),quote_state=q['quote']['state'],quote_can_pay=q['quote']['can_pay'])
 return out
installer.prepare(root,stage/'autoquote.py')
backup=None
try:
 service('stop')
 applied=installer.apply(root,stage/'autoquote.py');backup=Path(applied['backup']);record['install']=applied
 service('start');record['steps'].append({'action':'apply',**health(True)})
 service('stop');installer.rollback(root,backup);service('start');record['steps'].append({'action':'rollback',**health(False)})
 service('stop');record['forward_install']=installer.apply(root,stage/'autoquote.py');service('start');record['steps'].append({'action':'forward',**health(True)})
except Exception as e:
 record['error']=type(e).__name__+': '+str(e)
 if backup:
  try:
   service('stop')
   if hashlib.sha256((root/'app/webapp.py').read_bytes()).hexdigest()==record['install']['after']:installer.rollback(root,backup)
   service('start');record['recovery']=health(False)
  except Exception as rollback_error:record['recovery_error']=str(rollback_error)
 else:service('start')
 (stage/'backend-release.json').write_text(json.dumps(record,indent=2));raise
(stage/'backend-release.json').write_text(json.dumps(record,indent=2));print(json.dumps(record))
