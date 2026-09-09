from pathlib import Path
import runpy,json,hashlib,subprocess,xml.etree.ElementTree as ET,re,ast
from unittest.mock import patch
R=Path('/Users/saymurrbk.ru/.codex/worktrees/salon-direct-orders')
ns=runpy.run_path(str(R/'scripts/build-production-release.py')); results=[]
def check(name,value,details=None):
 results.append({'case':name,'pass':bool(value),'details':details});assert value,(name,details)
a=ast.parse(Path('/tmp/salon-seo-audit.py').read_text());module=ast.Module(body=[n for n in a.body if isinstance(n,(ast.Import,ast.ImportFrom,ast.ClassDef))],type_ignores=[]);pns={};exec(compile(module,'parser','exec'),pns)
files={f.name:f.read_bytes() for f in R.glob('*.html')}
# Exact approved live referral overlay, identical canonical alias.
old=Path('/tmp/salon-public-release193-v2/referral.html').read_bytes();files['referral.html']=old;files['referral-rules.html']=old
pages={}
for name,b in files.items():
 p=pns['Parser']();p.feed(b.decode());pages[name]=p
indexed={n:p for n,p in pages.items() if not any('noindex' in x for x in p.meta['robots'])}
for key in ['description','og:title','og:description','og:image']:
 check('indexable single '+key,all(len(p.meta[key])==1 and p.meta[key][0] for p in indexed.values()),[n for n,p in indexed.items() if len(p.meta[key])!=1 or not p.meta[key][0]])
check('single canonical indexable',all(len(p.can)==1 for p in indexed.values()))
check('all JSON-LD parses',all('INVALID' not in x for p in pages.values() for x in p.schemas))
check('no conflicting robots',all(not(any('noindex' in x for x in p.meta['robots']) and any(re.search(r'(^|,)index(,|$)',x) for x in p.meta['robots'])) for p in pages.values()))
check('tariffs alias',pages['tariffs.html'].can==['https://akademsalon.ru/services.html'])
for n in ['configurator.html','consent.html','consent-request.html','dashboard.html','oplaceno.html']:
 check('private noindex '+n,any('noindex' in x for x in pages[n].meta['robots']))
with patch.object(ns['subprocess'],'check_output',return_value='2026-09-09\n'):
 xml=ns['public_sitemap'](R,'HEAD',files)
t=ET.fromstring(xml);urls=[x.text for x in t.findall('.//{*}loc')]
check('derived exact discovery',set(urls)==set(p.can[0] for p in indexed.values()))
check('discovery unique',len(urls)==len(set(urls)),len(urls))
check('no unsafe discovery',all('?' not in u and '#' not in u and u.startswith('https://akademsalon.ru/') for u in urls))
check('referral no invented date',all(not x.findall('{*}lastmod') for x in t if 'referral' in x.find('{*}loc').text))
check('history dates',all(x.find('{*}lastmod').text=='2026-09-09' for x in t if 'referral' not in x.find('{*}loc').text))
for val in ['https://evil.example/index.html','https://akademsalon.ru/?token=private','https://akademsalon.ru/#secret','https://akademsalon.ru/missing.html','http://akademsalon.ru/']:
 try:ns['public_sitemap'](R,'HEAD',{'index.html':('<head><link rel="canonical" href="'+val+'"></head>').encode()});ok=False
 except ValueError:ok=True
 check('reject '+val,ok)
for meta in ['<meta name="robots" content="none">','<meta name="googlebot" content="NOINDEX,follow">','<meta name="yandex" content="noindex">','<meta name="robots" content="index,follow"><meta name="robots" content="noindex">']:
 check('noindex fixture '+meta,len(ET.fromstring(ns['public_sitemap'](R,'HEAD',{'secret.html':('<head>'+meta+'</head>').encode()})))==0)
expected={'kursovaya-rabota':14000,'diplomnaya-rabota':40000,'magisterskaya-dissertaciya':60000,'kandidatskaya-dissertaciya':200000,'otchet-po-praktike':14000,'nauchnaya-statya':9000,'referat':2500}
for name,price in expected.items():
 p=pages[name+'.html'];services=[x for s in p.schemas for x in s.get('@graph',[]) if x.get('@type')=='Service'];o=services[0]['offers'];check('bounded from price '+name,len(services)==1 and o['@type']=='AggregateOffer' and o['lowPrice']==price and o['priceCurrency']=='RUB' and 'до оплаты' in o['description'])
tracked=['scripts/build-production-release.py','assets/js/salon-order.js','assets/js/salon-experience.js','assets/css/salon-experience.css']
out={'decision':'GO (candidate read-only; frozen and live gates parent-owned)','head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip(),'source_sha256':{n:hashlib.sha256((R/n).read_bytes()).hexdigest() for n in tracked},'html_sha256':{n:hashlib.sha256((R/n).read_bytes()).hexdigest() for n in sorted(files)},'tests':results,'sitemap_urls':urls,'reproducers':['/tmp/salon-seo-contract.py'],'limitations':['Actual frozen build + live redirect/HTTP indexability are parent release gates. Overlay is exact reviewed release193 public HTML; do not derive from source referral prototype.','Metadata does not guarantee search rich results or ranking.'],'findings':[]}
Path('/tmp/salon-seo-contract.json').write_text(json.dumps(out,ensure_ascii=False,indent=2));print(json.dumps({'passed':len(results),'urls':len(urls)}))
