import pathlib,hashlib,json,re,xml.etree.ElementTree as ET,subprocess,sys
repo=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else '/Users/saymurrbk.ru/.codex/worktrees/salon-referral-visual-fix');new=pathlib.Path(sys.argv[2] if len(sys.argv)>2 else '/tmp/salon-public-release201');old=pathlib.Path('/tmp/salon-public-release200');manifest=json.loads(new.with_suffix('.manifest.json').read_text());rows=[]
def check(n,ok):rows.append({'name':n,'pass':bool(ok)})
def sha(b):return hashlib.sha256(b).hexdigest()
terms=re.search(r'<p>Пригласившему[\s\S]*?</p>',(old/'referral.html').read_text())[0]
for name in ['referral.html','referral-rules.html']:
 s=(new/name).read_text();check(name+' preserves exact published economic paragraph',terms in s)
 check(name+' independent presentation has no legal reader/input',all(x not in s for x in ['data-legal-reader','salon-legal.js','ld-layout','<input readonly','class="doc"']) and 'data-referral-public' in s)
 check(name+' has two actionable cabinet links and Telegram fallback',s.count('href="dashboard.html#referral"')==2 and 'href="https://t.me/academic_saloon_bot?start=club"' in s)
 check(name+' full rules and related benefits retained',all('href="'+x+'"' in s for x in ['loyalty.html','plus.html','deposit.html','gift.html']))
 check(name+' canonical points to single referral',re.findall(r'<link rel="canonical" href="([^"]+)"',s)==['https://akademsalon.ru/referral.html'])
 check(name+' one main and h1',s.count('<main ')==1 and len(re.findall(r'<h1\b',s))==1)
 check(name+' no unactivated prototype runtime',not re.search(r'salon-referral(?:-policy)?\.js|ещё не запущен|1000 бонус|1 000 бонус|5 000',s))
 check(name+' CSS fingerprint matches exact artifact',re.search(r'salon-referral-public\.css\?[^" ]*r='+sha((new/'assets/css/salon-referral-public.css').read_bytes())[:16],s))
check('Both referral aliases are identical',(new/'referral.html').read_bytes()==(new/'referral-rules.html').read_bytes())
sitemap=ET.fromstring((new/'sitemap.xml').read_bytes());locs=[e.text for e in sitemap.iter('{http://www.sitemaps.org/schemas/sitemap/0.9}loc')]
check('Discovery contains referral exactly once and not private/alias',locs.count('https://akademsalon.ru/referral.html')==1 and not any('referral-rules' in l or 'dashboard' in l for l in locs))
for name in ['oferta','privacy','terms','refunds','requisites','academic-integrity','loyalty','consent','consent-request','consent-analytics','consent-marketing','consent-publication']:
 article=lambda p:re.search(r'<article class="doc">[\s\S]*?</article>',p.read_text())[0];check(name+' original legal article unchanged',article(old/(name+'.html'))==article(new/(name+'.html')))
for n,h in manifest['files'].items():check('Manifest '+n,sha((new/n).read_bytes())==h)
check('Private documents/secrets excluded',not any(n.startswith(('docs/','scripts/','backend/','.')) or 'cabinet-demo' in n or '/._' in n for n in manifest['files']))
report={'decision':'GO' if all(r['pass'] for r in rows) else 'NO-GO','source_commit':manifest['source_commit'],'scope':'Frozen static/contract/manifest review; full gate and visual results separate','passed':sum(r['pass'] for r in rows),'failed':sum(not r['pass'] for r in rows),'source_hashes':{n:sha((repo/n).read_bytes()) for n in ['scripts/referral-presentation.py','scripts/build-production-release.py','tests/production-release.test.js','assets/css/salon-referral-public.css']},'frozen_referral_sha256':sha((new/'referral.html').read_bytes()),'reproducer':__file__,'results':rows};pathlib.Path('/tmp/salon-referral-final-contract.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='results'},ensure_ascii=False,indent=2));print([r for r in rows if not r['pass']])
