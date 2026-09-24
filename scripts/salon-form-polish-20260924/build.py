"""Bounded field-guidance overlay on verified live release219. No backend changes."""
from pathlib import Path
import argparse,hashlib,json,re,shutil,subprocess,tarfile
HERE=Path(__file__).resolve().parent
VERSION='form-polish-20260924-v1'
ORDER='assets/js/salon-order.js';CSS='assets/css/form-polish-20260924.css';JS='assets/js/form-polish-20260924.js'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def inventory(root):return {str(p.relative_to(root)):sha(p) for p in sorted(root.rglob('*')) if p.is_file()}
def replace(s,old,new):
 assert s.count(old)==1,('Unique anchor required',old[:100],s.count(old))
 return s.replace(old,new,1)
def build(baseline,output):
 assert not output.exists() and baseline.resolve()!=output.resolve()
 before=inventory(baseline)
 for p,h in json.loads((HERE/'baseline-hashes.json').read_text()).items():assert before.get(p)==h,('Baseline drift',p)
 shutil.copytree(baseline,output);s=(baseline/ORDER).read_text()
 s=replace(s,"function message(text,focus=true){$('form-message').textContent=text;", "function message(text,focus=true){form.dispatchEvent(new Event('salon:order-message'));$('form-message').textContent=text;")
 s=replace(s,'function fileId(f){',"function focusField(field){const target=field.closest('.salon-select')?.querySelector('.salon-select-trigger')||field;target.focus({preventScroll:true});target.scrollIntoView({block:'center',behavior:'instant'})}\nfunction fieldError(id,text){message(text,false);const field=$(id);field.setAttribute('aria-invalid','true');form.dispatchEvent(new CustomEvent('salon:field-error',{detail:{id,text}}));focusField(field)}\nfunction fileId(f){")
 s=replace(s,"message(id==='topic'?'Напишите тему или коротко опишите задачу.':'Укажите контакт для расчёта.',false);$(id).setAttribute('aria-invalid','true');$(id).focus();", "fieldError(id,id==='topic'?'Напишите тему или коротко опишите задачу.':'Укажите контакт для расчёта.');")
 s=replace(s,"message('Укажите корректный @ник Telegram, email, телефон или ссылку VK.',false);$('contact').setAttribute('aria-invalid','true');$('contact').focus();", "fieldError('contact','Укажите корректный @ник Telegram, email, телефон или ссылку VK.');")
 s=replace(s,"message('Дата уже прошла. Выберите сегодняшнюю или будущую дату.',false);$('deadline').focus();", "fieldError('deadline','Дата уже прошла. Выберите сегодняшнюю или будущую дату.');")
 s=replace(s,"if(!form.reportValidity()){measureValidation();return;}","if(!form.reportValidity()){measureValidation();const first=[...form.elements].find(el=>!el.disabled&&el.willValidate&&!el.validity.valid);if(first)focusField(first);return;}")
 (output/ORDER).write_text(s)
 for src,dest in [('polish.js',JS),('polish.css',CSS)]:shutil.copyfile(HERE/src,output/dest)
 s=(baseline/'configurator.html').read_text()
 s,n=re.subn(r'(<script\b[^>]*src=")'+re.escape(ORDER)+r'\?[^\"]*(")',lambda m:m[1]+ORDER+'?v='+VERSION+'&amp;r='+sha(output/ORDER)[:16]+m[2],s);assert n==1
 s=replace(s,'</head>',f'<link rel="stylesheet" href="{CSS}?v={VERSION}&amp;r={sha(output/CSS)[:16]}"></head>')
 s=replace(s,'</body>',f'<script src="{JS}?v={VERSION}&amp;r={sha(output/JS)[:16]}"></script></body>')
 s=replace(s,'Telegram, email, телефон или ссылка VK <span class="required">*</span>','Как с тобой связаться <span class="required">*</span>')
 (output/'configurator.html').write_text(s)
 after=inventory(output);changed=[p for p,h in after.items() if before.get(p)!=h]
 assert set(changed)=={ORDER,JS,CSS,'configurator.html'} and before==inventory(baseline)
 manifest={'version':VERSION,'source_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=HERE,text=True).strip(),'baseline_files':before,'files':after,'changed':changed,'deleted':[]}
 (output.parent/'build.json').write_text(json.dumps(manifest,indent=2))
 with tarfile.open(output.parent/'delta.tar.gz','w:gz') as tf:
  for p in changed:tf.add(output/p,arcname=p)
 print(json.dumps({'status':'PASS','changed':changed,'baseline_files':len(before),'candidate_files':len(after),'deleted':[]}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('baseline',type=Path);p.add_argument('output',type=Path);a=p.parse_args();build(a.baseline,a.output)
