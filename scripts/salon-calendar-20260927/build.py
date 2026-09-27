from pathlib import Path
import argparse,json,hashlib,shutil,subprocess,tarfile
HERE=Path(__file__).resolve().parent
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def inventory(p):return {str(f.relative_to(p)):sha(f) for f in sorted(p.rglob('*')) if f.is_file()}
def build(base,out):
 before=inventory(base);assert before==json.loads((HERE/'baseline-hashes.json').read_text()),'release226 baseline drift';assert not out.exists();shutil.copytree(base,out)
 for source,target in [('calendar.js','assets/js/salon-calendar.js'),('calendar.css','assets/css/salon-calendar.css')]:
  assert not (out/target).exists();(out/target).write_bytes((HERE/source).read_bytes())
 for page in ['services.html','configurator.html']:
  p=out/page;s=p.read_text();assert 'salon-calendar.js' not in s
  s=s.replace('</head>','<link rel="stylesheet" href="assets/css/salon-calendar.css?v=calendar-20260927&amp;r='+sha(out/'assets/css/salon-calendar.css')[:16]+'"></head>')
  s=s.replace('</body>','<script src="assets/js/salon-calendar.js?v=calendar-20260927&amp;r='+sha(out/'assets/js/salon-calendar.js')[:16]+'"></script></body>');p.write_text(s)
 subprocess.run(['node','--check',str(out/'assets/js/salon-calendar.js')],check=True)
 after=inventory(out);changed=[p for p,h in after.items() if before.get(p)!=h];assert set(changed)=={'services.html','configurator.html','assets/css/salon-calendar.css','assets/js/salon-calendar.js'};assert set(before)<=set(after);assert len(after)==533
 manifest={'version':'calendar-20260927','baseline_release':'release226-clarity-376cd066','source_commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'baseline_files':before,'files':after,'changed':changed,'deleted':[]}
 (out.parent/(out.name+'-manifest.json')).write_text(json.dumps(manifest,indent=2)+'\n')
 with tarfile.open(out.parent/(out.name+'-delta.tar.gz'),'w:gz') as tf:
  for p in changed:tf.add(out/p,arcname=p)
 print(json.dumps({'out':str(out),'files':len(after),'changed':changed}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('baseline',type=Path);p.add_argument('output',type=Path);a=p.parse_args();build(a.baseline,a.output)
