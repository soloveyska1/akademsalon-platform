from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
import json,re,xml.etree.ElementTree as ET,collections
root=Path('/tmp/salon-public-release193-v2')
class Parser(HTMLParser):
 def __init__(self):super().__init__();self.meta=collections.defaultdict(list);self.can=[];self.title='';self.h1=[];self.text=[];self.in_title=False;self.in_h1=False;self.in_script=False;self.js='';self.schemas=[];self.links=[]
 def handle_starttag(self,t,a):
  d=dict(a)
  if t=='meta':self.meta[d.get('name',d.get('property','')).lower()].append(d.get('content',''))
  if t=='link' and d.get('rel')=='canonical':self.can.append(d.get('href'))
  if t=='title':self.in_title=True
  if t=='h1':self.in_h1=True;self.h1.append('')
  if t=='script' and d.get('type')=='application/ld+json':self.in_script=True;self.js=''
  if t=='a':self.links.append(d.get('href',''))
 def handle_endtag(self,t):
  if t=='title':self.in_title=False
  if t=='h1':self.in_h1=False
  if t=='script' and self.in_script:
   self.in_script=False
   try:self.schemas.append(json.loads(self.js))
   except Exception as e:self.schemas.append({'INVALID':str(e)})
 def handle_data(self,s):
  if self.in_title:self.title+=s
  if self.in_h1:self.h1[-1]+=s
  if self.in_script:self.js+=s
pages={}
for f in sorted(root.glob('*.html')):
 p=Parser();p.feed(f.read_text());pages[f.name]={'canonical':p.can,'robots':p.meta['robots'],'title':p.title,'description':p.meta['description'],'ogtitle':p.meta['og:title'],'ogdesc':p.meta['og:description'],'ogimage':p.meta['og:image'],'h1':p.h1,'schemas':p.schemas,'noindex':any('noindex' in x.lower() for x in p.meta['robots'])}
sm=ET.parse(root/'sitemap.xml');urls=[n.text for n in sm.findall('.//{*}loc')];sminvalid=[]
for u in urls:
 f=urlsplit(u).path.lstrip('/') or 'index.html';p=pages.get(f)
 if not p:sminvalid.append({'url':u,'error':'missing file'});continue
 if p['noindex']:sminvalid.append({'url':u,'error':'noindex'})
 if p['canonical']!=[u]:sminvalid.append({'url':u,'error':'not canonical','canon':p['canonical']})
expected={p['canonical'][0]for p in pages.values() if len(p['canonical'])==1 and not p['noindex']};duplicates={}
for field in ['title','description']:
 groups=collections.defaultdict(list)
 for f,p in pages.items():
  if not p['noindex']:groups[str(p[field])].append(f)
 duplicates[field]={k:v for k,v in groups.items()if len(v)>1}
out={'pages':pages,'sitemap_urls':len(urls),'sitemap_invalid':sminvalid,'missing_indexable_canonical':sorted(expected-set(urls)),'duplicates':duplicates};Path('/tmp/salon-seo-source-audit.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in out.items()if k!='pages'},ensure_ascii=False,indent=2))
print('Service offers')
def walk(obj):
 if isinstance(obj,list):
  for a in obj:yield from walk(a)
 elif isinstance(obj,dict):
  if obj.get('@type') in ['Service','Product','Offer','AggregateOffer']:yield obj
  for a in obj.values():yield from walk(a)
for f,p in pages.items():
 matches=[]
 for obj in p['schemas']:
  for x in walk(obj):
   if x.get('@type') in ['Offer','AggregateOffer']:matches.append({k:x[k]for k in ['@type','name','price','lowPrice','highPrice','priceCurrency','url']if k in x})
 if matches:print(f,json.dumps(matches,ensure_ascii=False))
