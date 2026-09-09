from pathlib import Path
import subprocess,json,re,hashlib
R=Path('/Users/saymurrbk.ru/.codex/worktrees/salon-direct-orders');name='assets/css/salon-experience.css';s=(R/name).read_text();base=subprocess.check_output(['git','show','HEAD:'+name],cwd=R,text=True);tests=[]
def check(n,v):tests.append({'case':n,'pass':bool(v)});assert v,n
expected=base.replace('.sen-brief fieldset{border:0;padding:0;', '.sen-brief fieldset{border:0;border-radius:0;background:transparent;padding:0;').replace('.sen-brief legend{font-size:12px;', '.sen-brief legend{padding:0;font-size:12px;')
check('exact three property additions only',expected==s)
changed=subprocess.check_output(['git','diff','--name-only'],cwd=R,text=True).splitlines();check('only CSS dirty',changed==[name])
pages=[]
for f in R.glob('*.html'):
 text=f.read_text()
 if 'class="sen-brief"' not in text:continue
 pages.append(f.name);styles=re.findall(r'<link[^>]*href="([^"<>]*\.css[^"<>]*)"',text)
 check(f.name+' loads override after global',next(i for i,x in enumerate(styles)if 'salon-direct.css' in x)<next(i for i,x in enumerate(styles)if 'salon-experience.css' in x))
 check(f.name+' HTML unchanged',text==subprocess.check_output(['git','show','HEAD:'+f.name],cwd=R,text=True))
check('exact sixteen entry pages',len(pages)==16)
check('selector does not match normal configurator','class="sen-brief"' not in (R/'configurator.html').read_text())
check('no JS activation visibility change','.sen-brief fieldset{display:none}[data-entry-enhanced] .sen-brief fieldset{display:block}' in s)
check('new reset all themes/media','@media' not in s[s.index('.sen-brief fieldset{border:0'):s.index('.sen-brief fieldset{border:0')+150] and not s[s.index('.sen-brief fieldset{border:0')-1]=='>')
for n in ['assets/js/salon-experience.js','assets/js/salon-order.js','assets/js/salon-commerce.js','assets/js/app.js']:
 check(n+' behavior unchanged',(R/n).read_text()==subprocess.check_output(['git','show','HEAD:'+n],cwd=R,text=True))
report={'decision':'GO','findings':[],'scope':'CSS cascade contract review, no browser screenshot acceptance implied','head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip(),'css_sha256':hashlib.sha256(s.encode()).hexdigest(),'tests':tests,'passed':len(tests),'pages':sorted(pages),'cascade':'Scoped selectors (0,1,1) override global fieldset/legend (0,0,1), including the mobile18px/global20px radius; transparent follows light/dark parent. No focus, sizing, checked state, display, JS, scope, price, submit or ordinary-form declarations changed.','reproducer':'/tmp/salon-fieldset-contract.py'}
Path('/tmp/salon-fieldset-contract.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print({'passed':len(tests),'sha':report['css_sha256'],'decision':'GO'})
