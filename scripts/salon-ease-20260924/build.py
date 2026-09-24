"""Exact release221 overlay; public appearance only, no backend or payload edits."""
from pathlib import Path
from html.parser import HTMLParser
import argparse,ast,hashlib,json,re,shutil,subprocess,tarfile
HERE=Path(__file__).resolve().parent
VERSION='ease-20260924-v1'
PREF='assets/js/salon-ease-preferences.js';JS='assets/js/salon-ease.js';CSS='assets/css/salon-ease.css'
APP='assets/js/app.js';SHELL='assets/js/salon-shell.js';EXP='assets/js/salon-experience.js';LIB='assets/js/salon-library.js';PDF='assets/js/salon-portfolio.js'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def inventory(root):return {str(p.relative_to(root)):sha(p) for p in sorted(root.rglob('*')) if p.is_file()}
def replace(s,old,new):
 assert s.count(old)==1,('unique anchor',old[:90],s.count(old))
 return s.replace(old,new,1)
class Questions(HTMLParser):
 def __init__(self):super().__init__();self.stack=[];self.rows=[];self.row=None;self.summary=False
 def handle_starttag(self,tag,attrs):
  a=dict(attrs);classes=set(a.get('class','').split());faq=bool(classes&{'sen-faq','svx-faq','sp-faq','cat-questions','lr-studio-faq','gz-faq','journey-faq','tool-guidance__faq','faq'}) or 'data-home-faq' in a or any(x[1] for x in self.stack)
  if tag not in {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}:self.stack.append((tag,faq))
  if tag=='details' and faq:self.row={'question':'','id':a.get('id')}
  if tag=='summary' and self.row is not None:self.summary=True
 def handle_endtag(self,tag):
  if tag=='summary':self.summary=False
  if tag=='details' and self.row is not None:self.rows.append(self.row);self.row=None
  for i in range(len(self.stack)-1,-1,-1):
   if self.stack[i][0]==tag:self.stack=self.stack[:i];break
 def handle_data(self,s):
  if self.summary:self.row['question']+=s
def collect(baseline):
 registry={}
 for p in sorted(baseline.glob('*.html')):
  if 'salon-shell.js' not in p.read_text():continue
  parser=Questions();parser.feed(p.read_text());rows=parser.rows
  if p.name=='index.html':
   code=(baseline/'assets/js/salon-home.js').read_text();data=ast.literal_eval(re.search(r'const questions=(\[.*?\]);faq',code,re.S)[1]);rows=[{'question':x[0],'id':None} for x in data]
  for row in rows:
   row['question']=re.sub(r'\s+',' ',re.sub(r'[+＋−↗⌄]','',row['question'])).strip()
   row['id']=row['id'] or 'answer-'+hashlib.sha256(row['question'].encode()).hexdigest()[:10]
  if rows:
   assert len({r['id'] for r in rows})==len(rows),p.name
   registry[p.name]=rows
 return registry

def build(baseline,output):
 assert not output.exists();before=inventory(baseline)
 assert before==json.loads((HERE/'baseline-hashes.json').read_text()),'baseline drift'
 registry=json.loads((HERE/'faq-ids.json').read_text());assert collect(baseline)==registry,'FAQ registry requires explicit revision'
 shutil.copytree(baseline,output)
 shutil.copyfile(HERE/'preferences.js',output/PREF);shutil.copyfile(HERE/'ease.css',output/CSS)
 (output/JS).write_text((HERE/'ease.js').read_text().replace('/* FAQ_REGISTRY */{}',json.dumps(registry,ensure_ascii=False,separators=(',',':'))))
 s=(baseline/APP).read_text()
 s=replace(s,'    function apply(mode, persist) {\n      docEl.setAttribute', '    function apply(mode, persist) {\n      if (window.SalonEaseTheme) mode = window.SalonEaseTheme.apply(mode, persist);\n      docEl.setAttribute')
 s=replace(s,"      if (persist) { try { localStorage.setItem('salon_theme', mode); } catch (e) {} }", "      if (persist && !window.SalonEaseTheme) { try { localStorage.setItem('salon_theme', mode); } catch (e) {} }\n      if (window.SalonEaseTheme && m) m.setAttribute('content', mode === 'dark' ? '#211c2b' : '#f5f3ed');")
 s=replace(s,'var onSys = function () { var saved;', 'var onSys = function () { if (window.SalonEaseTheme) return; var saved;');(output/APP).write_text(s)
 s=(baseline/SHELL).read_text();start=s.index("const theme=panel.querySelector('[data-sh-theme]');");end=s.index("if(typeof HTMLDialogElement",start);s=s[:start]+s[end:];(output/SHELL).write_text(s)
 s=(baseline/EXP).read_text();s=replace(s,"document.querySelectorAll('.search-button').forEach(b=>b.addEventListener('click',()=>openSearch(b)));", "document.querySelectorAll('.search-button').forEach(b=>{if(b.classList.contains('sh-quick-search'))b.hidden=false;b.addEventListener('click',()=>openSearch(b))});");(output/EXP).write_text(s)
 s=(baseline/LIB).read_text();s=replace(s,"$('[data-reader-size]').onclick=e=>{const on=reader.classList.toggle('lr-large');e.currentTarget.setAttribute('aria-pressed',String(on))};",'');(output/LIB).write_text(s)
 s=(baseline/PDF).read_text()
 s=replace(s,"async function load(doc){", "function loading(on){$('pdf-loading').hidden=!on;$('pdf-page').setAttribute('aria-busy',String(on));if(on)$('pdf-page').classList.remove('se-page-ready')}\nasync function load(doc){")
 assert s.count("$('pdf-loading').hidden=false;")==2 and s.count("$('pdf-loading').hidden=true;")==3
 s=s.replace("$('pdf-loading').hidden=false;","loading(true);").replace("$('pdf-loading').hidden=true;","loading(false);")
 s=replace(s,"highlight();loading(false);", "highlight();loading(false);$('pdf-page').classList.add('se-page-ready');")
 s=replace(s,"if(dialog.open)return;epoch++;", "if(dialog.open)return;loading(false);epoch++;");(output/PDF).write_text(s)
 pages=[];appconsumers=[]
 for p in sorted(baseline.glob('*.html')):
  s=p.read_text();public='salon-shell.js' in s
  if public:
   pages.append(p.name)
   pattern=r'<script>[^<]*salon_theme[^<]*</script>'
   assert len(re.findall(pattern,s))==1,p.name
   s=re.sub(pattern,f'<script src="{PREF}?v={VERSION}&amp;r={sha(output/PREF)[:16]}"></script>',s)
   s=replace(s,'</head>',f'<link rel="stylesheet" href="{CSS}?v={VERSION}&amp;r={sha(output/CSS)[:16]}"></head>')
   s=replace(s,'<details class="sh-menu">','<button type="button" class="search-button sh-quick-search" aria-label="Поиск по сайту" title="Поиск по сайту" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg></button><details class="sh-menu">')
   s,n=re.subn(r'<button\b[^>]*data-sh-theme[^>]*>.*?</button>','',s,flags=re.S);assert n==1,p.name
   s=replace(s,'</body>',f'<script src="{JS}?v={VERSION}&amp;r={sha(output/JS)[:16]}"></script></body>')
   if 'data-reader-size' in s:
    a=re.search(r'<button[^>]*data-reader-size[^>]*>.*?</button>',s)[0]
    s=replace(s,a,a+'<button type="button" data-reader-space aria-pressed="false">Интервал · Просторнее</button>')
   if p.name=='samples.html':
    s=replace(s,'<p id="pdf-loading" role="status">Открываем документ…</p>','<div id="pdf-loading" role="status"><span>Открываем документ…</span><span class="se-pdf-outline" aria-hidden="true">'+('<i></i>'*9)+'</span></div>')
  for asset in [APP,SHELL,EXP,LIB,PDF]:
   if asset not in s:continue
   if asset==APP:appconsumers.append(p.name)
   s,n=re.subn(r'(<script\b[^>]*src="/?)'+re.escape(asset)+r'(?:\?[^\"]*)?(")',lambda m:m[1]+asset+'?v='+VERSION+'&amp;r='+sha(output/asset)[:16]+m[2],s);assert n==1,(p.name,asset)
  if s!=p.read_text():(output/p.name).write_text(s)
 after=inventory(output);changed=[p for p,h in after.items() if before.get(p)!=h]
 assert set(changed)==set(pages)|set(appconsumers)|{APP,SHELL,EXP,LIB,PDF,PREF,JS,CSS}
 assert before==inventory(baseline)
 manifest={'version':VERSION,'source_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=HERE,text=True).strip(),'baseline_files':before,'files':after,'changed':changed,'deleted':[],'public_routes':pages,'faq_routes':list(registry)}
 (output.parent/'build.json').write_text(json.dumps(manifest,indent=2))
 with tarfile.open(output.parent/'delta.tar.gz','w:gz') as tf:
  for p in changed:tf.add(output/p,arcname=p)
 print(json.dumps({'status':'PASS','changed':len(changed),'public_pages':len(pages),'faq_pages':len(registry),'candidate_files':len(after)}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('baseline',type=Path);p.add_argument('output',type=Path);a=p.parse_args();build(a.baseline,a.output)
