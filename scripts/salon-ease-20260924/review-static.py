from pathlib import Path
import sys,re,json,hashlib
r=Path(sys.argv[1]); b=Path('/tmp/salon-ease-20260924/baseline'); pages=[]
for p in sorted(r.glob('*.html')):
 s=p.read_text()
 if 'salon-shell.js' not in s:continue
 for asset in ['salon-ease-preferences.js','salon-ease.js','salon-ease.css']:
  assert s.count(asset)==1,(p.name,asset)
  h=hashlib.sha256((r/('assets/css/' if asset.endswith('.css') else 'assets/js/')/asset).read_bytes()).hexdigest()[:16]
  assert re.search(re.escape(asset)+r'\?[^"\']*r='+h,s),(p.name,asset)
 assert s.count('sh-quick-search')==1 and 'data-sh-theme' not in s,p.name
 assert s.index('salon-ease-preferences.js')<s.index('</head>')
 pages.append(p.name)
changes=[str(p.relative_to(r)) for p in r.rglob('*') if p.is_file() and (not(b/p.relative_to(r)).exists() or p.read_bytes()!=(b/p.relative_to(r)).read_bytes())]
allowed={'assets/js/salon-ease-preferences.js','assets/js/salon-ease.js','assets/css/salon-ease.css','assets/js/app.js','assets/js/salon-shell.js','assets/js/salon-experience.js','assets/js/salon-library.js','assets/js/salon-portfolio.js'}
assert all(p.endswith('.html') or p in allowed for p in changes)
result={'status':'PASS','candidate':str(r),'public_shell_pages':len(pages),'checks':'All shell pages have unique early preferences/runtime/style/header search, matching current hash queries, no old theme control; no backend/API/payload files differ','pages':pages,'changed_count':len(changes)}
Path(sys.argv[2]).write_text(json.dumps(result,ensure_ascii=False,indent=2)); print(json.dumps({k:v for k,v in result.items() if k!='pages'}))
