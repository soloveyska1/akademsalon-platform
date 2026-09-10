from pathlib import Path
import json,re,hashlib,subprocess
from urllib.parse import urlsplit,parse_qs
from collections import Counter
E=Path(__file__).resolve().parent;R=E.parents[4];BASE='ccb1d12b20e48d58ba2d1b909406d6c4215e3719';tests=[]
def old(n):return subprocess.check_output(['git','show',BASE+':'+n],cwd=R,text=True)
def article_records():
 rows=[]
 for p in sorted(R.glob('guide-*.html')):
  s=old(p.name);a=re.search(r'<article\b[^>]*class="doc".*?</article>',s,re.S);rows.append({'file':p.name,'article_sha256':hashlib.sha256(a.group(0).encode()).hexdigest()})
 return rows
def reading_records():
 rows=[]
 for p in sorted(R.glob('*.html')):
  s=old(p.name)
  if 'data-service-entry' not in s:continue
  reading=re.search(r'<section class="sen-reading".*?</section>',s,re.S);faq=re.search(r'<section class="sen-faq".*?</section>',s,re.S)
  rows.append({'file':p.name,'reading_hrefs':re.findall(r'href="([^"]+)"',reading.group(0)),'faq_pairs':re.findall(r'<details[^>]*><summary>(.*?)</summary><p>(.*?)</p></details>',faq.group(0),re.S)})
 return rows
def check(n,v):tests.append({'case':n,'pass':bool(v)});assert v,n
for r in article_records():
 s=(R/r['file']).read_text();m=re.search(r'<article\b[^>]*class="doc".*?</article>',s,re.S);check(r['file']+' exact article',hashlib.sha256(m.group(0).encode()).hexdigest()==r['article_sha256'])
 blocks=re.findall(r'<section class="lr-next".*?</section>',s,re.S);check(r['file']+' one outside next',len(blocks)==1 and s.index(blocks[0])>=m.end())
 for href in re.findall(r'href="([^"]+)"',blocks[0]):
  u=urlsplit(href.replace('&amp;','&'));check(r['file']+' existing safe '+href,not u.scheme and not u.netloc and (R/u.path).exists() and u.path!=r['file'])
  if 'knowledge' in u.path and r['file']!='guide-rinc-statya.html':check(r['file']+' finite route',parse_qs(u.query).get('work',[None])[0] in ['course','practice','diplom'] and parse_qs(u.query).get('stage',[None])[0] in ['starting','writing','finishing'])
for r in reading_records():
 s=(R/r['file']).read_text();m=re.search(r'<section class="sen-reading".*?</section>',s,re.S);h=re.findall(r'href="([^"]+)"',m.group(0));check(r['file']+' old reading targets retained',not(Counter(r['reading_hrefs'])-Counter(h)));check(r['file']+' only added library',not(Counter(h)-Counter(r['reading_hrefs'])-Counter(['/knowledge.html'])))
 faq=re.search(r'<section class="sen-faq".*?</section>',s,re.S);pairs=re.findall(r'<details[^>]*><summary>(.*?)</summary><p>(.*?)</p></details>',faq.group(0),re.S);check(r['file']+' all original FAQ pairs',pairs==[tuple(x)for x in r['faq_pairs']])
s=(R/'knowledge.html').read_text();data=json.loads(re.search(r'<script[^>]*data-study-data[^>]*>(.*?)</script>',s,re.S)[1]);check('exact3worktypes',set(data)=={'course','practice','diplom'})
for work,value in data.items():
 check(work+' correct service',value['service']=={'course':'kursovaya-rabota.html','practice':'otchet-po-praktike.html','diplom':'diplomnaya-rabota.html'}[work]);check(work+' exact3stages',set(value['plans'])=={'starting','writing','finishing'})
 for stage,items in value['plans'].items():check(work+stage+' 3 unique real guides',len(items)==3 and len(set(i['url']for i in items))==3 and all(re.fullmatch(r'guide-[a-z-]+\.html',i['url']) and (R/i['url']).exists() for i in items))
script=(R/'assets/js/salon-library.js').read_text();base=subprocess.check_output(['git','show',BASE+':assets/js/salon-library.js'],cwd=R,text=True);check('original shelf/search/history/reader exact',script.startswith(base));
for n in ['assets/js/salon-order.js','assets/js/app.js','assets/js/salon-commerce.js']:check(n+' unchanged',(R/n).read_text()==subprocess.check_output(['git','show',BASE+':'+n],cwd=R,text=True))
experience=(R/'assets/js/salon-experience.js').read_text();observer=' // Keep the reading and FAQ controls clear of the floating mascot at every width.\n if(root.matches(\'[data-service-entry]\')&&\'IntersectionObserver\' in window){const visible=new Set();const observer=new IntersectionObserver(entries=>{entries.forEach(e=>e.isIntersecting?visible.add(e.target):visible.delete(e.target));document.body.classList.toggle(\'entry-reading-visible\',visible.size>0)});document.querySelectorAll(\'.sen-reading,.sen-faq,footer a[href*="configurator.html"]\').forEach(el=>observer.observe(el))}\n'
check('experience exact observer-only delta',experience.count(observer)==1 and experience.replace(observer,'')==old('assets/js/salon-experience.js'))
files=['assets/css/salon-experience.css', 'assets/css/salon-library.css', 'assets/js/salon-experience.js', 'assets/js/salon-library.js', 'diplomnaya-po-ekonomike.html', 'diplomnaya-po-psihologii.html', 'diplomnaya-po-yurisprudencii.html', 'diplomnaya-rabota.html', 'guide-antiplagiat-ai.html', 'guide-apellyaciya.html', 'guide-dnevnik-praktiki.html', 'guide-harakteristika-s-praktiki.html', 'guide-kursovaya-za-nedelyu.html', 'guide-normocontrol.html', 'guide-obekt-predmet-cel-zadachi.html', 'guide-otchet-po-praktike.html', 'guide-otzyv-rukovoditelya-vkr.html', 'guide-prakticheskaya-chast-kursovoy.html', 'guide-prezentaciya-k-zashchite.html', 'guide-prilozheniya-po-gost.html', 'guide-recenziya-na-vkr.html', 'guide-rech-na-zashchitu.html', 'guide-rinc-statya.html', 'guide-skolko-stoit-diplomnaya.html', 'guide-skolko-stoit-kursovaya.html', 'guide-spisok-literatury.html', 'guide-temy-vkr.html', 'guide-titulnyj-list.html', 'guide-vkr-struktura.html', 'guide-vvedenie-kursovoy.html', 'guide-zaklyuchenie-kursovoy.html', 'guide-zaklyuchenie-vkr.html', 'guide-zashchita-diploma.html', 'kandidatskaya-dissertaciya.html', 'knowledge.html', 'kursovaya-po-ekonomike.html', 'kursovaya-po-informatike.html', 'kursovaya-po-menedzhmentu.html', 'kursovaya-po-pedagogike.html', 'kursovaya-po-psihologii.html', 'kursovaya-po-yurisprudencii.html', 'kursovaya-rabota.html', 'magisterskaya-dissertaciya.html', 'nauchnaya-statya.html', 'otchet-po-praktike.html', 'referat.html']
report={'decision':'GO','base':BASE,'tests':tests,'passed':len(tests),'source_sha256':{n:hashlib.sha256((R/n).read_bytes()).hexdigest() for n in files},'findings':[]}
(E/'review-contract-static.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(len(tests))
