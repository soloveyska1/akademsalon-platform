"""Pinned, reproducible public return-context overlay on immutable release220."""
from pathlib import Path
import argparse,hashlib,json,re,shutil,subprocess,tarfile,html
HERE=Path(__file__).resolve().parent
VERSION='return-20260924-v1'
JS='assets/js/salon-return.js';CSS='assets/css/salon-return.css';PORT='assets/js/salon-portfolio.js';CAT='assets/js/salon-catalogue.js'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def inventory(root):return {str(p.relative_to(root)):sha(p) for p in sorted(root.rglob('*')) if p.is_file()}
def replace(s,old,new):
 assert s.count(old)==1,('unique anchor required',old[:120],s.count(old))
 return s.replace(old,new,1)
def build(baseline,output):
 assert not output.exists() and baseline.resolve()!=output.resolve()
 before=inventory(baseline)
 assert before==json.loads((HERE/'baseline-hashes.json').read_text()),'baseline drift'
 shutil.copytree(baseline,output)
 titles={'index.html':'Главная','services.html':'Работы и цены','samples.html':'Примеры работ','knowledge.html':'Библиотека','reviews.html':'Отзывы','about.html':'О мастерской','guarantees.html':'Условия и гарантии','oplata.html':'Оплата и этапы','tools.html':'Инструменты для учёбы','tariffs.html':'Стоимость услуг','benefits.html':'Все выгоды','plus.html':'Салон+','gift.html':'Подарить сертификат','deposit.html':'Депозит','referral.html':'Пригласить друга','prolog.html':'Как проходит заказ','komissiya-0.html':'Подготовка к защите','dosie-nauchruka.html':'Разбор замечаний научрука','vedenie.html':'Сопровождение работы'}
 public=re.compile(r'^(?:guide-.+|kursovaya-.+|diplomnaya-.+|otchet-po-praktike|referat|magisterskaya-dissertaciya|kandidatskaya-dissertaciya|nauchnaya-statya|avtorskiy-zakaz|plan|normokontrol-vkr|redaktura-posle-ii|dorabotka-otcheta-po-praktike|razbor-zamechaniy-nauchruka|audit-temy-vkr|proverka-istochnikov-vkr)\.html$')
 registry={}
 for p in sorted(baseline.glob('*.html')):
  if p.name not in titles and not public.fullmatch(p.name):continue
  s=p.read_text();assert 'salon-shell.js' in s
  h=re.search(r'<h1[^>]*>(.*?)</h1>',s,re.S);title=titles.get(p.name) or html.unescape(re.sub('<[^>]+>','',re.sub(r'<br\s*/?>',' ',h[1]))).replace('В твоём объёме.','').strip()
  item={'title':title}
  if p.name.startswith('guide-'):
   a=re.search(r'<article class="doc">(.*?)</article>',s,re.S);assert a
   item.update(article=hashlib.sha256(a[1].encode()).hexdigest()[:16],sections=len(re.findall(r'<h2\b',a[1])))
  registry[p.name]=item
 docs=json.loads((baseline/'assets/js/salon-portfolio-data.js').read_text().split('=',1)[1].strip().rstrip(';'))
 documents={d['id']:{'pages':d['pages'],'version':sha(baseline/d['pdf'].split('?',1)[0])[:16]} for d in docs}
 s=(HERE/'return.js').read_text().replace('/* REGISTRY */{}',json.dumps(registry,ensure_ascii=False,separators=(',',':'))).replace('/* DOCUMENTS */{}',json.dumps(documents,separators=(',',':')))
 (output/JS).write_text(s);shutil.copyfile(HERE/'return.css',output/CSS)
 s=(baseline/PORT).read_text()
 s=replace(s,'function price(d){',"""function syncBookmark(doc){if(doc.id!==selected.id)return;const saved=window.SalonReturn?.pdfGet(doc.id),button=$('library-document').querySelector('.document-open'),start=$('library-document').querySelector('.sr-pdf-start');if(button)button.textContent=saved?'Продолжить · стр. '+saved.page+' →':'Читать работу ↗';if(start)start.hidden=!saved;}
function price(d){""")
 s=replace(s,"$('library-document').querySelectorAll('button').forEach(b=>b.onclick=()=>open(doc,b));}","$('library-document').querySelectorAll('button').forEach(b=>b.onclick=()=>open(doc,b));if(window.SalonReturn){const start=document.createElement('button');start.type='button';start.className='sr-pdf-start';start.textContent='С первой страницы';start.onclick=()=>open(doc,start,true);$('library-document').querySelector('.document-open').after(start);syncBookmark(doc);}}")
 s=replace(s,"async function open(doc,button){current=doc;opener=button;pageNo=1;scaleMode='fit';", "async function open(doc,button,start=false){current=doc;opener=button;const saved=start?null:window.SalonReturn?.pdfGet(doc.id);pageNo=saved?.page||1;scaleMode=saved?.mode||'fit';scale=saved?.scale||1;bookmarkAllowed=true;")
 s=replace(s,"let selected=", "let bookmarkAllowed=true;\nlet selected=")
 s=replace(s,"pdf=loaded;$('pdf-page-number').max", "pdf=loaded;pageNo=Math.max(1,Math.min(pdf.numPages,pageNo));$('pdf-page-number').max")
 s=replace(s,'const token=epoch,painting=++paintId;', 'const token=epoch,painting=++paintId,renderedDoc=current.id,renderedPage=pageNo,renderedMode=scaleMode;')
 s=replace(s,'const p=await pdf.getPage(pageNo);','const p=await pdf.getPage(renderedPage);')
 s=replace(s,"const viewport=p.getViewport({scale}),dpr", "const renderedScale=scale,viewport=p.getViewport({scale}),dpr")
 s=replace(s,"$('pdf-scroll').scrollLeft=0}catch(err)","$('pdf-scroll').scrollLeft=0;if(dialog.open&&bookmarkAllowed&&window.SalonReturn){window.SalonReturn.pdfSave(renderedDoc,renderedPage,renderedMode,renderedScale);syncBookmark(current)}}catch(err)")
 s=replace(s,"dialog.addEventListener('close',()=>{epoch++;","dialog.addEventListener('close',()=>{if(dialog.open)return;epoch++;")
 s=replace(s,"function go(n){if(!pdf)return;", "function go(n){if(!pdf)return;bookmarkAllowed=true;")
 for control in ['pdf-zoom-in','pdf-zoom-out','pdf-fit']:
  s=replace(s,"$('"+control+"').onclick=()=>{","$('"+control+"').onclick=()=>{bookmarkAllowed=true;")
 s=replace(s,"let resizeTimer;", "document.addEventListener('salon:return-cleared',()=>{bookmarkAllowed=false;searchEpoch++;clearTimeout(searchTimer);syncBookmark(selected)});window.addEventListener('storage',e=>{if(e.key==='salon_return_v1'||e.key===null){syncBookmark(selected)}});\nlet resizeTimer;")
 (output/PORT).write_text(s)
 s=(baseline/CAT).read_text();s=replace(s,'\n})();', '\n'+(HERE/'catalogue-return.js').read_text()+'\n})();');(output/CAT).write_text(s)
 for name in registry:
  s=(baseline/name).read_text()
  # Load before existing page modules, after the DOM, so APIs are available without a head-blocking request.
  anchor=re.search(r'<script\b[^>]*src="assets/js/app\.js\?[^\"]*"[^>]*></script>',s);assert anchor,(name,'app script')
  s=replace(s,anchor[0],f'<script src="{JS}?v={VERSION}&amp;r={sha(output/JS)[:16]}"></script>'+anchor[0])
  s=replace(s,'</head>',f'<link rel="stylesheet" href="{CSS}?v={VERSION}&amp;r={sha(output/CSS)[:16]}"></head>')
  for asset in [PORT,CAT]:
   if asset not in s:continue
   s,n=re.subn(r'(<script\b[^>]*src=")'+re.escape(asset)+r'\?[^\"]*(")',lambda m:m[1]+asset+'?v='+VERSION+'&amp;r='+sha(output/asset)[:16]+m[2],s);assert n==1
  (output/name).write_text(s)
 after=inventory(output);changed=[p for p,h in after.items() if before.get(p)!=h]
 assert set(changed)==set(registry)|{JS,CSS,PORT,CAT} and before==inventory(baseline)
 manifest={'version':VERSION,'source_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=HERE,text=True).strip(),'baseline_files':before,'files':after,'changed':changed,'deleted':[],'public_routes':list(registry)}
 (output.parent/'build.json').write_text(json.dumps(manifest,indent=2))
 with tarfile.open(output.parent/'delta.tar.gz','w:gz') as tf:
  for p in changed:tf.add(output/p,arcname=p)
 print(json.dumps({'status':'PASS','changed':len(changed),'public_pages':len(registry),'baseline_files':len(before),'candidate_files':len(after),'deleted':[]}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('baseline',type=Path);p.add_argument('output',type=Path);a=p.parse_args();build(a.baseline,a.output)
