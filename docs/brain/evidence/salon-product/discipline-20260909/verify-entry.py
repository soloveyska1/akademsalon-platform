"""Run against source or frozen public tree; no network or customer operations."""
from pathlib import Path
import sys,re,json,html,subprocess
SRC=Path(__file__).resolve().parents[5]
ROOT=Path(sys.argv[1]) if len(sys.argv)>1 else SRC
rows=json.loads((SRC/'docs/brain/evidence/salon-product/discipline-20260909/entries.json').read_text())
for d in rows:
 s=(ROOT/(d['slug']+'.html')).read_text();price=f"{d['price']:,}".replace(',',' ')
 assert s.count('<h1>')==1
 assert 'data-entry-base="'+str(d['price'])+'"' in s
 assert 'data-entry-discipline="'+d['disc']+'"' in s
 assert 'data-entry-price>от '+price+' ₽' in s
 assert 'salon-home.css' in s
 for result in ['whole','part','editing']:
  assert f"product={d['product']}&amp;disc={d['disc']}&amp;result={result}" in s
 assert 'https://akademsalon.ru/'+d['slug']+'.html' in re.search(r'<link rel="canonical"[^>]+>',s)[0]
 graphs=[json.loads(x) for x in re.findall(r'<script type="application/ld\+json">(.*?)</script>',s,re.S)]
 services=[n for g in graphs for n in g.get('@graph',[]) if n.get('@type')=='Service']
 assert len(services)==1 and services[0]['offers']['lowPrice']==d['price']
 assert d['slug']+'.html' in services[0]['url']
 # All inline static local links resolve in the release, except reserved API routes.
 for href in re.findall(r'href="([^"]+)"',s):
  h=html.unescape(href).split('#')[0].split('?')[0]
  if h and not re.match(r'(?:https?:|mailto:|tel:|tg:)',h):assert (ROOT/h.lstrip('/')).exists(),(d['slug'],h)
old=subprocess.check_output(['git','show','3c18690b90e25b73c056805c28f659f59533a0a7:diplomnaya-po-psihologii.html'],cwd=SRC,text=True)
new=(ROOT/'diplomnaya-po-psihologii.html').read_text()
for block in re.findall(r'<section class="section compact">.*?</section>',old,re.S):assert block in new,'psychology package changed'
print(json.dumps({'entries':len(rows),'tariff_schema_static_links':True,'psychology_original_blocks_unchanged':True,'root':str(ROOT)}))
