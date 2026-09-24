"""Hash-pinned overlay on release217. Never reconstruct production from stale root HTML."""
from pathlib import Path
import argparse,hashlib,json,re,shutil,tarfile,subprocess
HERE=Path(__file__).resolve().parent
VERSION='funnel-20260924-v1'
ORDER='assets/js/salon-order.js'
APP='assets/js/app.js'
SELECT='assets/js/salon-select.js'
GUIDE='guide-kursovaya-za-nedelyu.html'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def inventory(root):return {str(p.relative_to(root)):sha(p) for p in sorted(root.rglob('*')) if p.is_file()}
def replace(s,old,new):
 assert s.count(old)==1,('Expected unique anchor',old[:100],s.count(old))
 return s.replace(old,new,1)
def build(baseline,output):
 assert not output.exists() and baseline.resolve()!=output.resolve()
 before=inventory(baseline)
 expected=json.loads((HERE/'baseline-hashes.json').read_text())
 for p,h in expected.items():assert before.get(p)==h,('Baseline drift',p)
 shutil.copytree(baseline,output)
 s=(baseline/ORDER).read_text()
 s=replace(s,"mountComposition();update();", """// Explicit plan landing intent takes precedence over an unrelated saved draft.
if(service?.id==='plan'&&['course','diplom','master','candidate'].includes(params.get('work'))){
 $('service-work').value=params.get('work');serviceAnswers.work=params.get('work');
}
mountComposition();update();
"""+(HERE/'intake-measurement.js').read_text())
 s=replace(s,"if(!$(id).value.trim()){message(","if(!$(id).value.trim()){measureValidation();message(")
 s=replace(s,"if(S.valid?.contact&&!S.valid.contact($('contact').value.trim())){message(","if(S.valid?.contact&&!S.valid.contact($('contact').value.trim())){measureValidation();message(")
 s=replace(s,"if($('deadline').value&&$('deadline').value<isoDate(today)){message(","if($('deadline').value&&$('deadline').value<isoDate(today)){measureValidation();message(")
 s=replace(s,"if(!form.reportValidity())return;","if(!form.reportValidity()){measureValidation();return;}")
 s=replace(s,"if(S.visit?.event)S.visit.event('submit_attempt',{cta:service?'service:'+service.code:'calculator'});","measureOpen();measure('submit_attempt',measurementCta());")
 s=replace(s,"const kind=S.orderContract.classify(attempt),error=attempt.r?.error;", "const kind=S.orderContract.classify(attempt),error=attempt.r?.error;\n measure('submit_fail',kind==='conflict'?'request_conflict':['definitive_rejection','local_blocked'].includes(kind)?'server_rejected':'network_fallback');")
 (output/ORDER).write_text(s)
 s=(baseline/APP).read_text()
 s=replace(s,"('cta_click tg_open config_open step_view submit_attempt submit_fail first_input ' +", "('cta_click tg_open config_open step_view submit_attempt submit_fail first_input validation_error ' +")
 s=replace(s,"name === 'submit_attempt' || name === 'first_input'", "name === 'submit_attempt' || name === 'first_input' || name === 'validation_error'")
 (output/APP).write_text(s)
 s=(baseline/SELECT).read_text()
 s=replace(s,'row.onclick=()=>choose(i)','row.onclick=e=>choose(i,e)')
 s=replace(s,'function choose(i){','function choose(i,inputEvent){')
 s=replace(s,'select.value=value;trigger.removeAttribute', 'const changed=select.value!==value;select.value=value;trigger.removeAttribute')
 s=replace(s,"close();sync()}","close();sync();if(changed&&inputEvent?.isTrusted)select.dispatchEvent(new CustomEvent('salon:select-commit',{bubbles:true,detail:{inputEvent}}))}")
 s=replace(s,'choose(active)','choose(active,e)')
 (output/SELECT).write_text(s)
 # Only the form depends on the additive sanitizer capability. Both required URLs
 # change together; other pages never emit validation_error and remain compatible.
 s=(baseline/'configurator.html').read_text()
 for asset in [ORDER,APP,SELECT]:
  pattern=r'(<script\b[^>]*src=")'+re.escape(asset)+r'\?[^\"]*(")'
  s,n=re.subn(pattern,lambda m:m[1]+asset+'?v='+VERSION+'&amp;r='+sha(output/asset)[:16]+m[2],s)
  assert n==1,asset
 (output/'configurator.html').write_text(s)
 s=(baseline/GUIDE).read_text()
 s=replace(s,'<a href="configurator.html">Составим план под ваш срок', '<a href="configurator.html?service=pl&amp;work=course">Составим план под ваш срок')
 (output/GUIDE).write_text(s)
 s=(baseline/'sitemap.xml').read_text()
 s,n=re.subn(r'(<loc>https://akademsalon.ru/'+re.escape(GUIDE)+r'</loc>\s*<lastmod>)[^<]+',r'\g<1>2026-09-24',s);assert n==1
 (output/'sitemap.xml').write_text(s)
 after=inventory(output);changed=[p for p,h in after.items() if before.get(p)!=h]
 assert set(changed)=={ORDER,APP,SELECT,GUIDE,'configurator.html','sitemap.xml'}
 assert before==inventory(baseline)
 manifest={'version':VERSION,'source_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=HERE,text=True).strip(),'baseline_files':before,'files':after,'changed':changed,'deleted':[]}
 (output.parent/'build.json').write_text(json.dumps(manifest,indent=2))
 with tarfile.open(output.parent/'delta.tar.gz','w:gz') as tar:
  for p in changed:tar.add(output/p,arcname=p)
 print(json.dumps({'status':'PASS','changed':changed,'baseline_files':len(before),'candidate_files':len(after)}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('baseline',type=Path);p.add_argument('output',type=Path);a=p.parse_args();build(a.baseline,a.output)
