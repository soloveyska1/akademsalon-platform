from pathlib import Path
import argparse,json,hashlib,shutil,subprocess,tarfile,re
HERE=Path(__file__).resolve().parent
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def inventory(p):return {str(f.relative_to(p)):sha(f) for f in sorted(p.rglob('*')) if f.is_file()}
def build(base,out):
 before=inventory(base);assert before==json.loads((HERE/'baseline-hashes.json').read_text()),'release227 baseline drift';assert not out.exists();shutil.copytree(base,out)
 for source,target in [('intake-studio.js','assets/js/intake-studio.js'),('intake-studio.css','assets/css/intake-studio.css')]:
  assert not (out/target).exists();(out/target).write_bytes((HERE/source).read_bytes())
 p=out/'assets/js/form-polish-20260924.js';s=p.read_text();old='const initial=detectedMode();if(initial)chooseMode(initial);';assert s.count(old)==1
 s=s.replace(old,"const initial=detectedMode()||modes[0];chooseMode(initial);\ncontact.addEventListener('input',()=>{const mode=detectedMode();if(mode)chooseMode(mode)});");p.write_text(s)
 p=out/'configurator.html';s=p.read_text();assert 'intake-studio.js' not in s
 s,n=re.subn(r'assets/js/form-polish-20260924\.js\?[^\"]+', 'assets/js/form-polish-20260924.js?v=intake-studio-20260927&amp;r='+sha(out/'assets/js/form-polish-20260924.js')[:16],s);assert n==1
 s=s.replace('</head>','<link rel="stylesheet" href="assets/css/intake-studio.css?v=intake-studio-20260927&amp;r='+sha(out/'assets/css/intake-studio.css')[:16]+'"></head>')
 s=s.replace('</body>','<script src="assets/js/intake-studio.js?v=intake-studio-20260927&amp;r='+sha(out/'assets/js/intake-studio.js')[:16]+'"></script></body>');p.write_text(s)
 for f in ['assets/js/intake-studio.js','assets/js/form-polish-20260924.js']:subprocess.run(['node','--check',str(out/f)],check=True)
 after=inventory(out);changed=[p for p,h in after.items() if before.get(p)!=h];assert set(changed)=={'configurator.html','assets/css/intake-studio.css','assets/js/intake-studio.js','assets/js/form-polish-20260924.js'};assert set(before)<=set(after);assert len(after)==535
 manifest={'version':'intake-studio-20260927','baseline_release':'release227-calendar-97e3cc13','source_commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'baseline_files':before,'files':after,'changed':changed,'deleted':[]}
 (out.parent/(out.name+'-manifest.json')).write_text(json.dumps(manifest,indent=2)+'\n')
 with tarfile.open(out.parent/(out.name+'-delta.tar.gz'),'w:gz') as tf:
  for p in changed:tf.add(out/p,arcname=p)
 print(json.dumps({'out':str(out),'files':len(after),'changed':changed}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('baseline',type=Path);p.add_argument('output',type=Path);a=p.parse_args();build(a.baseline,a.output)
