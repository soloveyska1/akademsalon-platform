"""Reproducible bounded public overlay; baseline remains immutable."""
from pathlib import Path
import argparse,hashlib,html,json,re,shutil,tarfile,xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent
VERSION='growth-20260920-v1'
CSS='assets/css/growth-20260920/discovery.css'
JS='assets/js/growth-20260920/rehearsal.js'
HOST='https://akademsalon.ru'

def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def inventory(p):return {str(f.relative_to(p)):digest(f) for f in sorted(p.rglob('*')) if f.is_file()}
def asset_tag(path,kind):
 url='/'+path+'?v='+VERSION+'&amp;r='+digest(ROOT/path)[:12]
 return f'<link rel="stylesheet" href="{url}">' if kind=='css' else f'<script defer src="{url}"></script>'
def meta(s,key,value,attr='name'):
 tag=f'<meta {attr}="{key}" content="{html.escape(value,quote=True)}">'
 pattern=rf'<meta\b(?=[^>]*\b{attr}=[\"\']{re.escape(key)}[\"\'])[^>]*>'
 return re.sub(pattern,lambda m:tag,s,flags=re.I) if re.search(pattern,s,re.I) else s.replace('</head>',tag+'</head>')
def related(m):
 body=m[1]
 # Preserve all text, table cells, captions and URLs; change only the presentation.
 links=re.search(r'<ul>(.*?)</ul>\s*$',body,re.S)
 assert links,'Expected related links at end of block'
 content=body[:links.start()]
 content=re.sub(r'(<table>.*?</table>)',r'<div class="gd-related-table">\1</div>',content,flags=re.S)
 return '<section class="gd-related" data-growth-related>'+content+'<ul class="gd-related-links">'+links[1]+'</ul></section>'
def build(baseline,output):
 assert baseline.resolve()!=output.resolve() and not output.exists()
 before=inventory(baseline);shutil.copytree(baseline,output)
 home=(baseline/'index.html').read_text()
 assert 'data-seo-entry' in home and 'salon-home' in home and 'data-home-workbench' in home,'Unexpected live homepage'
 new_home,n=re.subn(r'<section class="seo-entry" data-seo-entry>.*?</section>',lambda m:(HERE/'home-discovery.html').read_text(),home,count=1,flags=re.S)
 assert n==1
 new_home=new_home.replace('</head>',asset_tag(CSS,'css')+'</head>')
 (output/'index.html').write_text(new_home)
 services=(baseline/'services.html').read_text()
 services,n=re.subn(r'<section class="seo-entry" data-seo-entry>.*?</section>',lambda m:(HERE/'services-support.html').read_text(),services,count=1,flags=re.S)
 assert n==1,'Expected existing service support block'
 services=services.replace('</head>',asset_tag(CSS,'css')+'</head>')
 (output/'services.html').write_text(services)
 head=home[:home.index('</head>')+7]
 title='Вопросы на защите ВКР: бесплатный тренажёр и репетиция | Салон'
 desc='Потренируй ответы на 6 вопросов к защите ВКР, курсовой или магистерской. Бесплатно, без регистрации. Скачай план подготовки или запишись на репетицию с редактором.'
 head=re.sub(r'<title>.*?</title>',lambda m:'<title>'+title+'</title>',head,flags=re.S)
 head=re.sub(r'<link rel="canonical"[^>]*>',f'<link rel="canonical" href="{HOST}/komissiya-0.html">',head)
 for k,a,v in [('description','name',desc),('og:title','property',title),('og:description','property',desc),('og:url','property',HOST+'/komissiya-0.html'),('twitter:title','name',title),('twitter:description','name',desc),('og:image','property',HOST+'/assets/img/seo-20260911/og-defense.png'),('twitter:image','name',HOST+'/assets/img/seo-20260911/og-defense.png'),('og:image:alt','property','Комиссия №0: подготовка к защите')]:head=meta(head,k,v,a)
 # Keep the verified shared identity; page-specific structured data follows visible content.
 schemas=[{'@context':'https://schema.org','@type':'BreadcrumbList','itemListElement':[{'@type':'ListItem','position':1,'name':'Главная','item':HOST+'/'},{'@type':'ListItem','position':2,'name':'Подготовка к защите','item':HOST+'/komissiya-0.html'}]}, {'@context':'https://schema.org','@type':'Service','name':'Комиссия №0 — репетиция защиты','provider':{'@id':HOST+'/#organization'},'url':HOST+'/komissiya-0.html#session','description':'Репетиция с независимым редактором, Протокол №0 и повторная проверка согласованных критических исправлений.','offers':[{'@type':'Offer','name':name,'price':price,'priceCurrency':'RUB','url':HOST+'/configurator.html?service=k0'} for name,price in [('Курсовая',9900),('ВКР / диплом',19900),('Магистерская',29900)]]}]
 head=head.replace('</head>',asset_tag(CSS,'css')+''.join('<script type="application/ld+json">'+json.dumps(s,ensure_ascii=False)+'</script>' for s in schemas)+'</head>')
 header=re.search(r'<a class="skip-link".*?</header>',home,re.S)[0]
 footer=re.search(r'<footer\b.*?</footer>',home,re.S)[0]
 footer=footer.replace('Теперь к твоей задаче.','Теперь к твоему выступлению.').replace('href="#order-desk"','href="#rehearsal"').replace('href="/#order-desk"','href="#rehearsal"').replace('Собрать заказ','Начать тренировку')
 scripts=[]
 for src in re.findall(r'<script\b[^>]*\bsrc="([^"]+)"[^>]*></script>',home):
  if any('/'+n in src for n in ['configurator-nav-guard.js','app.js','analytics-attribution-v2.js','analytics-v2.js','salon-products.js','salon-direct.js','salon-experience.js','salon-shell.js']):scripts.append('<script src="'+src+'"></script>')
 commission=head+'<body class="salon-experience salon-direct concept-shell salon-commission">'+header+(HERE/'commission.html').read_text()+footer+''.join(scripts)+asset_tag(JS,'js')+'</body></html>'
 (output/'komissiya-0.html').write_text(commission)
 # Existing high-intent articles become entry points for an actual usable tool.
 guides=['guide-rech-na-zashchitu.html','guide-prezentaciya-k-zashchite.html','guide-zashchita-diploma.html']
 callout='<aside class="seo-entry" data-defense-entry><h2>Попробуй ответить до защиты</h2><p>Шесть вопросов по задаче, методу, результатам и источникам. Отметь сложные ответы и скачай личный план подготовки. Бесплатно, без регистрации.</p><ul><li><a href="/komissiya-0.html#rehearsal">Потренироваться отвечать на вопросы комиссии</a></li></ul></aside>'
 for file in guides:
  s=(baseline/file).read_text();assert s.count('</main>')==1
  (output/file).write_text(s.replace('</main>',callout+'</main>'))
 # The user reported the same obsolete block across multiple pages. Fix every instance,
 # including the three new article entry points, without deleting their useful content.
 related_pages=[]
 for page in output.glob('*.html'):
  s=page.read_text()
  s,n=re.subn(r'<(?:section|aside) class="seo-entry" data-(?:seo-entry|defense-entry)>(.*?)</(?:section|aside)>',related,s,flags=re.S)
  if n:
   s=s.replace('</head>',asset_tag(CSS,'css')+'</head>')
   page.write_text(s);related_pages.append(page.name)
 for path in [CSS,JS]:
  dest=output/path;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/path,dest)
 # Change only dates for pages actually changed. Preserve every original canonical URL.
 sitemap=(output/'sitemap.xml').read_text();changed_html=sorted({'index.html','services.html','komissiya-0.html',*guides,*related_pages})
 for file in changed_html:
  url=HOST+('/' if file=='index.html' else '/'+file)
  pattern=r'(<url>\s*<loc>'+re.escape(url)+r'</loc>\s*<lastmod>)[^<]*(</lastmod>)'
  sitemap,n=re.subn(pattern,lambda m:m[1]+'2026-09-20'+m[2],sitemap);assert n==1,file
 (output/'sitemap.xml').write_text(sitemap)
 assert before==inventory(baseline),'Baseline was changed'
 after=inventory(output);changed=[p for p,h in after.items() if before.get(p)!=h]
 allowed={*changed_html,'sitemap.xml',CSS,JS};assert set(changed)<=allowed
 manifest={'version':VERSION,'baseline_files':before,'files':after,'changed':changed,'deleted':sorted(set(before)-set(after))}
 (output.parent/'build.json').write_text(json.dumps(manifest,indent=2))
 with tarfile.open(output.parent/'delta.tar.gz','w:gz') as archive:
  for path in changed:archive.add(output/path,arcname=path)
 print(json.dumps({'changed':changed,'baseline_files':len(before),'candidate_files':len(after),'deleted':manifest['deleted']}))

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('baseline',type=Path);p.add_argument('output',type=Path);a=p.parse_args();build(a.baseline,a.output)
