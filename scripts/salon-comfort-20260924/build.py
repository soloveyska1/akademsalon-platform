"""Bounded, hash-pinned static overlay on current release218. No backend changes."""
from pathlib import Path
import argparse,hashlib,json,re,shutil,subprocess,tarfile
HERE=Path(__file__).resolve().parent
VERSION='comfort-20260924-v1'
ORDER='assets/js/salon-order.js';INTAKE='assets/js/salon-intake.js'
CSS='assets/css/comfort-20260924.css';JS='assets/js/comfort-20260924.js'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def inventory(root):return {str(p.relative_to(root)):sha(p) for p in sorted(root.rglob('*')) if p.is_file()}
def replace(s,old,new):
 assert s.count(old)==1,('Unique anchor required',old[:100],s.count(old))
 return s.replace(old,new,1)
def build(baseline,output):
 assert not output.exists() and baseline.resolve()!=output.resolve()
 before=inventory(baseline)
 for p,h in json.loads((HERE/'baseline-hashes.json').read_text()).items():assert before.get(p)==h,('Baseline drift',p)
 shutil.copytree(baseline,output)
 s=(baseline/ORDER).read_text()
 a=s.index('function fileList(){');b=s.index('function freeze(on)',a);s=s[:a]+(HERE/'files.js').read_text()+s[b:]
 # Always use the current local day in min/quote/validation, even in a tab left open overnight.
 s=replace(s,"const today=new Date();today.setHours(0,0,0,0);const isoDate=", "let today=new Date();today.setHours(0,0,0,0);const isoDate=")
 s=replace(s,"$('deadline').min=isoDate(today);", "function refreshToday(){today=new Date();today.setHours(0,0,0,0);$('deadline').min=isoDate(today)}\nrefreshToday();")
 s=replace(s,'function update(){','function update(){\n refreshToday();')
 s=replace(s,'e.preventDefault();if(busy||confirmed)return;', 'e.preventDefault();if(busy||confirmed)return;if(!frozenPayload)update();')
 s=replace(s,"e.type==='salon:select-commit'&&field.tagName==='SELECT'&&e.detail?.inputEvent?.isTrusted===true", "((e.type==='salon:select-commit'&&field.tagName==='SELECT')||(e.type==='salon:field-commit'&&['files','deadline'].includes(field.id)))&&e.detail?.inputEvent instanceof Event&&e.detail.inputEvent.isTrusted===true")
 s=replace(s,"form.addEventListener('salon:select-commit',measureInput);", "form.addEventListener('salon:select-commit',measureInput);\nform.addEventListener('salon:field-commit',measureInput);")
 s=replace(s,"$('product').addEventListener('change',changeProduct);", "window.addEventListener('focus',()=>{if(!busy&&!confirmed&&!frozenPayload)update()});\ndocument.addEventListener('visibilitychange',()=>{if(!document.hidden&&!busy&&!confirmed&&!frozenPayload)update()});\n$('product').addEventListener('change',changeProduct);")
 (output/ORDER).write_text(s)
 # Filename suggestion only follows accepted queue state (including drop/remove/undo).
 s=(baseline/INTAKE).read_text()
 s=replace(s,"$('files').addEventListener('change',()=>{const file=$('files').files[0];", "$('files').addEventListener('salon:files-changed',e=>{const file=e.detail?.file;")
 s=replace(s,"},true);$('intake-file-topic').onclick=", "});$('intake-file-topic').onclick=")
 (output/INTAKE).write_text(s)
 for src,dest in [('comfort.js',JS),('comfort.css',CSS)]:shutil.copyfile(HERE/src,output/dest)
 s=(baseline/'configurator.html').read_text()
 for asset in [ORDER,INTAKE]:
  s,n=re.subn(r'(<script\b[^>]*src=")'+re.escape(asset)+r'\?[^\"]*(")',lambda m:m[1]+asset+'?v='+VERSION+'&amp;r='+sha(output/asset)[:16]+m[2],s);assert n==1
 s=replace(s,'</head>',f'<link rel="stylesheet" href="{CSS}?v={VERSION}&amp;r={sha(output/CSS)[:16]}"></head>')
 s=replace(s,'</body>',f'<script src="{JS}?v={VERSION}&amp;r={sha(output/JS)[:16]}"></script></body>')
 s=replace(s,'Добавить задание, методичку или замечания','Добавить файлы или перетащить сюда')
 (output/'configurator.html').write_text(s)
 after=inventory(output);changed=[p for p,h in after.items() if before.get(p)!=h]
 assert set(changed)=={ORDER,INTAKE,JS,CSS,'configurator.html'} and before==inventory(baseline)
 manifest={'version':VERSION,'source_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=HERE,text=True).strip(),'baseline_files':before,'files':after,'changed':changed,'deleted':[]}
 (output.parent/'build.json').write_text(json.dumps(manifest,indent=2))
 with tarfile.open(output.parent/'delta.tar.gz','w:gz') as tf:
  for p in changed:tf.add(output/p,arcname=p)
 print(json.dumps({'status':'PASS','changed':changed,'baseline_files':len(before),'candidate_files':len(after),'deleted':[]}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('baseline',type=Path);p.add_argument('output',type=Path);a=p.parse_args();build(a.baseline,a.output)
