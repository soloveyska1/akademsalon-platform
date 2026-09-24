from pathlib import Path
import importlib.util,hashlib,io,json,tempfile,unittest,urllib.error
from email.message import Message
from unittest.mock import patch
source=Path('/Users/saymurrbk.ru/.codex/worktrees/salon-ease-20260924/scripts/salon-ease-20260924/deploy.py')
spec=importlib.util.spec_from_file_location('reviewed_deploy',source);d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
checks=[]
assert d.NoRedirect().redirect_request(None,None,None,None,None,None) is None
checks.append('NoRedirect refuses construction of a redirected request')
for code in [301,302,303,307,308]:
 headers=Message();headers['Location']='https://akademsalon.ru/';headers['Content-Type']='application/json'
 error=urllib.error.HTTPError('https://akademsalon.ru/expertise.html',code,'redirect',headers,io.BytesIO(b'body'))
 with patch.object(d.opener,'open',side_effect=error) as opened:
  body,h,status=d.get('/expertise.html');assert status==code and body==b'body' and h['location']=='https://akademsalon.ru/';assert opened.call_count==1
checks.append('All redirect statuses returned without a second request; headers normalized')
with tempfile.TemporaryDirectory() as tmp:
 root=Path(tmp);(root/'index.html').write_bytes(b'home');(root/'x.js').write_bytes(b'script')
 for status in [206,301,302,303,307,308]:
  with patch.object(d,'get',return_value=(b'script',{'location':'https://akademsalon.ru/'},status)):
   try:d.verify_file(root,'/x.js','r')
   except AssertionError:pass
   else:raise AssertionError(('unexpected ordinary status accepted',status))
 for status in [200,302,303,307,308]:
  with patch.object(d,'get',return_value=(b'home',{'location':'https://akademsalon.ru/'},status)) as get:
   try:d.verify_file(root,'/expertise.html','r')
   except AssertionError:pass
   else:raise AssertionError(('noncanonical status accepted',status))
   assert get.call_count==1
 with patch.object(d,'get',side_effect=[(b'',{'location':'https://akademsalon.ru/'},301),(b'home',{'location':'https://akademsalon.ru/'},301)]):
  try:d.verify_file(root,'/expertise.html','r')
  except AssertionError:pass
  else:raise AssertionError('redirect chain accepted')
checks.append('Matching bytes cannot bypass non-200 ordinary status, wrong expertise status, or redirect chain')
for endpoint in [0,1]:
 for status in [206,301,302,303,307,308]:
  replies=[(b'{"ok":true}',{},200),(b'{"pay_online":true}',{},200)]
  body,headers,_=replies[endpoint];replies[endpoint]=(body,headers,status)
  with patch.object(d,'get',side_effect=replies):
   try:d.verify_health()
   except AssertionError:pass
   else:raise AssertionError(('health/features status accepted',endpoint,status))
checks.append('Health and features independently reject every tested non-200 status even with valid success JSON')
report={'status':'PASS','source':str(source),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'checks':checks,'network':'none; all HTTP mocked'}
Path('/tmp/salon-ease-safety-review/deploy-delta-results.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
