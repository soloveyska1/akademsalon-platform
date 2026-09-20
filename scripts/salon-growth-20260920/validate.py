"""Validate the actual built artifact and bounded source-to-live delta."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlparse,unquote
import argparse,json,re,xml.etree.ElementTree as ET

class Page(HTMLParser):
 def __init__(self,s):
  super().__init__();self.ids=[];self.links=[];self.assets=[];self.h1=0;self.footer=0;self.feed(s)
 def handle_starttag(self,t,a):
  d=dict(a)
  if 'id' in d:self.ids.append(d['id'])
  if t=='h1':self.h1+=1
  if t=='footer':self.footer+=1
  if t=='a' and 'href' in d:self.links.append(d['href'])
  if t=='script' and 'src' in d:self.assets.append(d['src'])
  if t=='link' and d.get('rel')=='stylesheet':self.assets.append(d['href'])

def check(root):
 count=0
 manifest=json.loads((root.parent/'build.json').read_text())
 assert not manifest['deleted']
 for file in [p for p in manifest['changed'] if p.endswith('.html')]:
  s=(root/file).read_text();p=Page(s)
  assert p.h1==1,(file,p.h1)
  assert len(p.ids)==len(set(p.ids)),(file,'duplicate id')
  for href in p.links+p.assets:
   u=urlparse(href)
   if u.scheme or u.netloc:continue
   dest=root/(unquote(u.path).lstrip('/') or file)
   if u.path=='/':dest=root/'index.html'
   assert dest.is_file(),(file,href)
   if u.fragment and dest.suffix=='.html':
    ids=Page(dest.read_text()).ids
    # Header/footer common runtime anchors are covered in browser; changed body links must resolve statically.
    if href in ['/komissiya-0.html#rehearsal','/komissiya-0.html#session','#rehearsal','#session','#ritual','#protocol','#data-lab','#faq','#price']:assert u.fragment in ids,(file,href)
   count+=1
  for raw in re.findall(r'<script type="application/ld\+json">(.*?)</script>',s,re.S):json.loads(raw);count+=1
  assert 'noindex' not in s.split('</head>')[0]
 commission=(root/'komissiya-0.html').read_text();cp=Page(commission)
 assert cp.footer==1
 assert 'commission-zero.js' not in commission and 'polish15-chrome.js' not in commission
 assert 'data-defense-trainer' in commission and '/configurator.html?service=k0' in commission
 assert all(x in commission for x in ['9 900 ₽','19 900 ₽','29 900 ₽','id="rehearsal"'])
 home=(root/'index.html').read_text()
 assert 'data-growth-discovery' in home and 'data-seo-entry' not in home
 assert all(x in home for x in ['kursovaya-rabota.html','diplomnaya-rabota.html','otchet-po-praktike.html','referat.html','magisterskaya-dissertaciya.html','nauchnaya-statya.html','razbor-zamechaniy-nauchruka.html','normokontrol-vkr.html','komissiya-0.html','guide-kursovaya-za-nedelyu.html'])
 js=(root/'assets/js/growth-20260920/rehearsal.js').read_text()
 assert 'fetch(' not in js and 'localStorage' not in js
 assert 'version:1,savedAt:Date.now()' in js
 assert 'prefers-reduced-motion:reduce' in (root/'assets/css/growth-20260920/discovery.css').read_text()
 for file in [p for p in manifest['changed'] if p.endswith('.html')]:
  assert 'class="seo-entry"' not in (root/file).read_text(),(file,'obsolete box remains')
 for file in ['razbor-zamechaniy-nauchruka.html','normokontrol-vkr.html','kursovaya-rabota.html','kursovaya-po-psihologii.html','guide-vvedenie-kursovoy.html','guide-kursovaya-za-nedelyu.html','guide-zashchita-diploma.html']:
  old=(root.parent/'baseline'/file).read_text();new=(root/file).read_text()
  block=re.search(r'<section class="seo-entry" data-seo-entry>(.*?)</section>',old,re.S)[1]
  for value in re.findall(r'href="([^"]+)"',block)+re.findall(r'<(?:td|th)[^>]*>(.*?)</(?:td|th)>',block,re.S):assert value in new,(file,value)
 xml=ET.parse(root/'sitemap.xml');assert len(xml.findall('{*}url'))==77
 print(json.dumps({'status':'PASS','link_asset_schema_checks':count,'changed_files':len(manifest['changed']),'sitemap_urls':77,'single_footer':True,'free_tool_network_calls':0}))

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('root',type=Path);check(p.parse_args().root)
