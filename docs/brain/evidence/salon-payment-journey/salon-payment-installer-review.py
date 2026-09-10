import tempfile,subprocess,json,hashlib,sys
from pathlib import Path
SRC=Path('/Users/saymurrbk.ru/.codex/worktrees/salon-payment-journey/backend/salon_bot');original=Path('/tmp/salon-payment-backend');sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
with tempfile.TemporaryDirectory(prefix='checkout-installer-review-') as td:
 root=Path(td);refs={}
 for name in ('webapp','db','autoquote','economic_v2','gift','contract'):
  rel='app/'+('' if name in ('webapp','db') else 'services/')+name+'.py';p=root/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes((original/(name+'.py')).read_bytes());refs[rel]=sha(p)
 reference=root/'reference.json';reference.write_text(json.dumps(refs));cmd=[sys.executable,str(SRC/'install_payment_journey.py')]
 prepare=subprocess.run(cmd+['prepare','--root',td,'--reference',str(reference),'--module',str(SRC/'payment_journey.py')],capture_output=True,text=True,check=True)
 receipt=json.loads(subprocess.run(cmd+['apply','--root',td,'--reference',str(reference),'--module',str(SRC/'payment_journey.py')],capture_output=True,text=True,check=True).stdout)
 guardfile=root/'app/webapp.py';post=guardfile.read_bytes();guardfile.write_bytes(post+b'\n# test tamper\n');before={p:sha(root/p) for p in receipt['files']}
 denied=subprocess.run(cmd+['rollback','--root',td,'--backup',receipt['backup']],capture_output=True,text=True)
 assert denied.returncode and 'rollback_source_changed' in denied.stderr
 assert before=={p:sha(root/p) for p in receipt['files']}
 guardfile.write_bytes(post)
 rolled=json.loads(subprocess.run(cmd+['rollback','--root',td,'--backup',receipt['backup']],capture_output=True,text=True,check=True).stdout)
 assert all(sha(root/p)==h for p,h in refs.items() if p!='app/services/gift.py') and not (root/'app/services/payment_journey.py').exists()
 assert rolled['compatibility_retained']==['app/services/gift.py']
 assert sha(root/'app/services/gift.py')==receipt['files']['app/services/gift.py']['after']
 Path('/tmp/salon-payment-rollback-retained-gift.py').write_bytes((root/'app/services/gift.py').read_bytes())
 out={'pass':True,'tests':['prepare all six transforms compile','apply hashes exact','rollback refuses any changed afterhash before restoring anything','rollback restores five originals byte-for-byte, removes new module and retains exact standalone gift compatibility patch'],'source_hashes':{p.name:sha(p) for p in (SRC/'install_payment_journey.py',SRC/'payment_journey.py')},'limitation':'Source-only sandbox; no database and no post-deployment financial rows. Retained gift compatibility additionally exercised against synthetic accepted-gift DB in independent fixture.'}
 Path('/tmp/salon-payment-installer-review.json').write_text(json.dumps(out,indent=2));print(json.dumps(out,indent=2))
