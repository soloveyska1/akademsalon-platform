from pathlib import Path
import re,json,hashlib,subprocess,ast
from urllib.parse import urlsplit,parse_qs
R=Path('/Users/saymurrbk.ru/.codex/worktrees/salon-direct-orders');BASE='3c18690b90e25b73c056805c28f659f59533a0a7';tests=[]
def check(n,v):tests.append({'case':n,'pass':bool(v)});assert v,n
def old(n):return subprocess.check_output(['git','show',BASE+':'+n],cwd=R,text=True)
expected={'kursovaya-po-ekonomike':('course','hum',14000),'kursovaya-po-menedzhmentu':('course','hum',14000),'kursovaya-po-pedagogike':('course','pedagogy',14000),'kursovaya-po-yurisprudencii':('course','jurisprudence',14000),'kursovaya-po-informatike':('course','tech',18000),'kursovaya-po-psihologii':('course','psychology',17000),'diplomnaya-po-ekonomike':('diplom','hum',40000),'diplomnaya-po-yurisprudencii':('diplom','jurisprudence',40000),'diplomnaya-po-psihologii':('diplom','psychology',48500)}
for n,(p,d,b) in expected.items():
 s=(R/(n+'.html')).read_text();before=old(n+'.html')
 check(n+' identity',f'data-entry-product="{p}" data-entry-discipline="{d}"' in s and f'data-entry-base="{b}"' in s)
 graph=[json.loads(x) for x in re.findall(r'<script type="application/ld\+json">(.*?)</script>',s,re.S)];check(n+' single graph',len(graph)==1)
 service=graph[0]['@graph'][0];check(n+' price schema',service['@type']=='Service' and service['offers']['lowPrice']==b and service['offers']['@type']=='AggregateOffer')
 check(n+' url schema',service['url']=='https://akademsalon.ru/'+n+'.html')
 for kind in ['canonical','description','og:title','og:description','og:url']:
  pattern=r'<link[^>]*rel="canonical"[^>]*>' if kind=='canonical' else r'<meta[^>]*(?:name|property)="'+re.escape(kind)+'"[^>]*>'
  check(n+' retained '+kind,re.findall(pattern,s)==re.findall(pattern,before))
 for href in re.findall(r'<a[^>]*href="([^"<>]*configurator\.html[^"<>]*)"',s):
  q=parse_qs(urlsplit(href.replace('&amp;','&')).query)
  if q.get('service')==['pv']:continue
  check(n+' static CTA '+href,q.get('product')==[p] and q.get('disc')==[d])
 check(n+' noJS remains unenhanced','data-entry-enhanced' not in s)
 if d=='psychology' and p=='diplom':
  blocks=re.findall(r'<section class="section compact">.*?</section>',before,re.S);check('psychology exactly two protected blocks',len(blocks)==2 and all(x in s for x in blocks))
  for value in ['3500','29000','91000']:pass
for n in ['kursovaya-rabota','diplomnaya-rabota','magisterskaya-dissertaciya','kandidatskaya-dissertaciya','otchet-po-praktike','nauchnaya-statya','referat']:
 check(n+' unchanged bytes',(R/(n+'.html')).read_text()==old(n+'.html'))
for n in ['assets/js/salon-order.js','assets/js/app.js','assets/js/salon-commerce.js']:
 check(n+' financial/payload code unchanged',(R/n).read_text()==old(n))
files=[n+'.html' for n in expected]+['assets/js/salon-experience.js','assets/css/salon-experience.css','docs/brain/evidence/salon-product/discipline-20260909/rebuild-discipline.py']
out={'decision':'GO pending dynamic fixture','base':BASE,'tests':tests,'source_sha256':{n:hashlib.sha256((R/n).read_bytes()).hexdigest() for n in files},'reproducers':['/tmp/salon-discipline-contract.py'],'findings':[]}
Path('/tmp/salon-discipline-contract.json').write_text(json.dumps(out,ensure_ascii=False,indent=2));print({'pass':len(tests)})
