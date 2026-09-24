"""Bounded, hash-pinned overlay on immutable release222. Never rebuild root HTML."""
from pathlib import Path
import argparse,hashlib,json,re,shutil,subprocess,tarfile
HERE=Path(__file__).resolve().parent
VERSION='reading-20260924-v1'
JS='assets/js/salon-reading.js';CSS='assets/css/salon-reading.css'
EXP='assets/js/salon-experience.js';LIB='assets/js/salon-library.js';PDF='assets/js/salon-portfolio.js'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def inventory(p):return {str(f.relative_to(p)):sha(f) for f in sorted(p.rglob('*')) if f.is_file()}
def replace(s,old,new,n=1):
 assert s.count(old)==n,(old[:100],s.count(old));return s.replace(old,new)
def build(baseline,output):
 before=inventory(baseline);assert before==json.loads((HERE/'baseline-hashes.json').read_text())
 assert not output.exists();shutil.copytree(baseline,output)
 (output/JS).write_text((HERE/'reading.js').read_text());(output/CSS).write_text((HERE/'reading.css').read_text())
 s=(output/EXP).read_text();start=s.index('  function results(){');end=s.index('\n',start)
 s=s[:start]+(HERE/'search-results.js').read_text().rstrip()+s[end:];(output/EXP).write_text(s)
 s=(output/LIB).read_text();s=replace(s,"tokens.every(t=>hay.includes(t))","(window.SalonReading?Number.isFinite(window.SalonReading.match(hay,input.value.slice(0,160)).score):tokens.every(t=>hay.includes(t)))")
 # Keep saved/filter behaviour; only paint the title, never feed mark/button text into search.
 s=replace(s,"const norm=s=>s.toLocaleLowerCase", "const originalTitles=new Map(cards.map(c=>[c,c.querySelector('h2').textContent]));\n const norm=s=>s.toLocaleLowerCase")
 s=replace(s,"if(!c.hidden)visible++;", "if(!c.hidden)visible++;if(window.SalonReading)c.querySelector('h2').innerHTML=window.SalonReading.highlight(originalTitles.get(c),input.value.slice(0,160));")
 (output/LIB).write_text(s)
 s=(output/PDF).read_text()
 s=replace(s,'async function open(doc,button,start=false){','async function open(doc,button,start=false,directPage=null){directHash=directPage?location.hash:null;')
 s=replace(s,'pageNo=saved?.page||1;','pageNo=directPage||saved?.page||1;')
 s=replace(s,"function loading(on){", "function loading(on){if(on){sharedPage=null;$('pdf-share').disabled=true;}")
 s=replace(s,"$('pdf-page-number').value=pageNo;", "sharedPage={id:renderedDoc,page:renderedPage,title:current.title};$('pdf-share').disabled=false;$('pdf-page-number').value=pageNo;")
 s=replace(s,"if(dialog.open)return;loading(false);epoch++;", "if(dialog.open)return;sharedPage=null;$('pdf-share').disabled=true;if(directHash&&location.hash===directHash){history.replaceState(history.state,'',location.pathname+location.search);}directHash=null;loading(false);epoch++;")
 s=replace(s,"select(selected);\n})();", "select(selected);\n"+(HERE/'pdf-links.js').read_text()+"\n})();")
 (output/PDF).write_text(s)
 pages=[];guide_count=0;copy_count=0
 for p in sorted(baseline.glob('*.html')):
  s=p.read_text();public='salon-shell.js' in s
  if public:
   pages.append(p.name)
   s=replace(s,'</head>',f'<link rel="stylesheet" href="{CSS}?v={VERSION}&amp;r={sha(output/CSS)[:16]}"></head>')
   # Install helpers before existing search/portfolio scripts, enhance only after DOMContentLoaded.
   tag=re.search(r'<script\b[^>]*src="/?assets/js/salon-experience.js[^>]*></script>',s)
   assert tag,p.name
   s=replace(s,tag[0],f'<script src="{JS}?v={VERSION}&amp;r={sha(output/JS)[:16]}"></script>'+tag[0])
   if 'data-guide-reader' in s:
    guide_count+=1
    if p.name=='guide-spisok-literatury.html':
     start=s.index('<h2>Образцы описаний:');end=s.index('<h2>',start+4);chunk=s[start:end]
     # Nine explicitly reviewed bibliographic examples; original text is untouched.
     def add(m):
      nonlocal copy_count
      copy_count+=1;label=re.sub('<[^>]+>','',m[1]);return '<h3>'+m[1]+'</h3>'+m[2]+'<p data-sx-copy="'+label+'">'
     chunk,n=re.subn(r'<h3>(.*?)</h3>(\s*)<p>',add,chunk,flags=re.S);assert n==9
     s=s[:start]+chunk+s[end:]
    if p.name in ['guide-prilozheniya-po-gost.html','guide-titulnyj-list.html','guide-vkr-struktura.html']:
     labels={'guide-prilozheniya-po-gost.html':'Макет приложения','guide-titulnyj-list.html':'Макет титульного листа','guide-vkr-struktura.html':'Формулировка во введении'}
     s,n=re.subn(r'<(pre|blockquote)(\s[^>]*|)>',lambda m:'<'+m[1]+m[2]+' data-sx-copy="'+labels[p.name]+'">',s)
     assert n==(3 if p.name=='guide-vkr-struktura.html' else 1);copy_count+=n
   if p.name=='samples.html':
    s=replace(s,'id="pdf-fullscreen"','id="pdf-fullscreen"')
    tag=re.search(r'<button\b[^>]*id="pdf-fullscreen".*?</button>',s,re.S)[0]
    s=replace(s,tag,tag+'<button type="button" id="pdf-share" aria-label="Поделиться страницей" title="Поделиться страницей" disabled><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M5 13v7h14v-7"/></svg><span class="sx-pdf-share-label">Поделиться</span></button>')
  if p.name=='404.html':
   s=replace(s,'</head>',f'<link rel="stylesheet" href="/{CSS}?v={VERSION}&amp;r={sha(output/CSS)[:16]}"></head>')
   # Decorative source SVG; recovery actions, scripts and route handling stay byte-identical.
   art='<svg class="sx-art" viewBox="0 0 144 124" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M37 17h49l18 18v64H37z" fill="var(--sx-paper)"/><path d="M37 17h49l18 18v64H37zM86 17v19h18M38 66l17-8 18 13 17-8 14 6M52 40h18M52 48h27m33 27 9 9m0-9-9 9M26 116h90"/></svg>'
   s=replace(s,'<div class="re-listik" aria-hidden="true"></div>','<div class="re-listik sx-recovery-art" aria-hidden="true">'+art+'</div>')
  for asset in [EXP,LIB,PDF]:
   if asset not in s:continue
   s,n=re.subn(r'(<script\b[^>]*src="/?)'+re.escape(asset)+r'(?:\?[^\"]*)?(")',lambda m:m[1]+asset+'?v='+VERSION+'&amp;r='+sha(output/asset)[:16]+m[2],s);assert n==1,(p.name,asset)
  if s!=p.read_text():(output/p.name).write_text(s)
 after=inventory(output);changed=[p for p,h in after.items() if before.get(p)!=h]
 assert set(changed)==set(pages)|{'404.html',EXP,LIB,PDF,JS,CSS}
 assert before==inventory(baseline)
 manifest={'version':VERSION,'source_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=HERE,text=True).strip(),'baseline_files':before,'files':after,'changed':changed,'deleted':[],'public_routes':pages,'guide_count':guide_count,'copy_count':copy_count}
 (output.parent/'build.json').write_text(json.dumps(manifest,indent=2))
 with tarfile.open(output.parent/'delta.tar.gz','w:gz') as tf:
  for p in changed:tf.add(output/p,arcname=p)
 print(json.dumps({'status':'PASS','changed':len(changed),'public_pages':len(pages),'guides':guide_count,'copy_examples':copy_count,'files':len(after)}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('baseline',type=Path);p.add_argument('output',type=Path);a=p.parse_args();build(a.baseline,a.output)
