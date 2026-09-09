from pathlib import Path
import re,json,hashlib,subprocess,runpy,html
from urllib.parse import urlsplit
E=Path(__file__).resolve().parent;R=E.parents[4];BASE='5ba9917a1d4bb0e8e5f76d4d4f0bca2fabc58ebb';tests=[]
def old(n):return subprocess.check_output(['git','show',BASE+':'+n],cwd=R,text=True)
def check(n,v):tests.append({'case':n,'pass':bool(v)});assert v,n
names=subprocess.check_output(['git','ls-tree','--name-only',BASE],cwd=R,text=True).splitlines();rows=[{'file':n,'headers':re.findall(r'<header\b[^>]*class="([^"]+)"[^>]*>',old(n))} for n in names if n.endswith('.html')];targets=[r['file']for r in rows if any(h.startswith('site-header ') for h in r['headers'])];check('89 static targets',len(targets)==89)
for n in targets:
 s=(R/n).read_text();before=old(n);check(n+' singleton header',s.count('data-site-header')==1 and len(re.findall(r'<header[^>]*class="site-header',s))==1)
 check(n+' main exact',re.findall(r'<main\b.*?</main>',s,re.S)==re.findall(r'<main\b.*?</main>',before,re.S))
 check(n+' footer exact',re.findall(r'<footer\b.*?</footer>',s,re.S)==re.findall(r'<footer\b.*?</footer>',before,re.S))
 scripts=re.findall(r'<script[^>]*src="([^"]+)"',s);check(n+' single shell',sum('salon-shell.js' in x for x in scripts)==1)
 check(n+' search initializer before shell',next(i for i,x in enumerate(scripts)if 'salon-experience.js' in x)<next(i for i,x in enumerate(scripts)if 'salon-shell.js' in x))
 header=re.search(r'<header[^>]*data-site-header.*?</header>',s,re.S).group(0)
 check(n+' native details fallback','<details class="sh-menu">' in header and 'class="sh-search-fallback"' in header and 'data-sh-theme hidden' in header)
 links=re.findall(r'href="([^"]+)"',header);check(n+' no unsafe internal targets',all(h.startswith('https://t.me/') or h in ['/', '#direct-order'] or (R/urlsplit(html.unescape(h)).path.lstrip('/')).exists() for h in links))
 entry=re.search(r'<a[^>]*data-entry-order[^>]*href="([^"]+)"',s)
 if entry:check(n+' static exact context',all(html.unescape(h)==html.unescape(entry[1]) for h in links if 'configurator' in h))
 if n=='configurator.html':check('form links stay in form',links.count('#direct-order')>=2 and 'id="direct-order"' in s)
for n in ['assets/js/app.js','assets/js/salon-order.js','assets/js/salon-commerce.js','assets/js/salon-experience.js','assets/js/configurator-nav-guard.js']:check(n+' logic unchanged',(R/n).read_text()==old(n))
for n in [r['file']for r in rows if r['file'] not in targets]:check(n+' independent surface unchanged',(R/n).read_text()==old(n))
ns=runpy.run_path(str(R/'scripts/legal-presentation.py'));legacy=(E/'review-contract-legacy-fixture.html').read_text();rendered=ns['render_legal'](legacy,(R/'priyomnaya.html').read_text());check('overlay newheader singleton',rendered.count('data-site-header')==1 and 'sh-menu' in rendered);check('overlay shell andsearch',rendered.count('salon-shell.js')==1 and rendered.index('salon-experience.js')<rendered.index('salon-shell.js'));check('overlay no olddialog','id="home-navigation"' not in rendered)
base_ns={'__name__':'review'};exec(compile(old('scripts/legal-presentation.py'),'baseline-presenter','exec'),base_ns);before_render=base_ns['render_legal'](legacy,old('priyomnaya.html'));check('overlay legal main exact',re.findall(r'<main\b.*?</main>',rendered,re.S)==re.findall(r'<main\b.*?</main>',before_render,re.S))
changed=sorted(targets+['assets/css/salon-experience.css','assets/js/salon-shell.js','scripts/legal-presentation.py']);check('salon-home.css unchanged',(R/'assets/css/salon-home.css').read_text()==old('assets/css/salon-home.css'));report={'decision':'pending browser','base':BASE,'tests':tests,'passed':len(tests),'source_sha256':{n:hashlib.sha256((R/n).read_bytes()).hexdigest()for n in changed},'reproducer':str(Path(__file__).relative_to(R)),'findings':[]};(E/'review-contract-static.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(len(tests))
