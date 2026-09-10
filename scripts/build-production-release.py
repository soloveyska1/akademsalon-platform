#!/usr/bin/env python3
"""Build a frozen, allowlisted VPS release. Never use the private Sites dist.
The unactivated referral prototype stays private; reviewed live terms are explicit input.
"""
import argparse, hashlib, html, json, re, subprocess, tarfile
from html.parser import HTMLParser
import xml.etree.ElementTree as ET
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit, unquote

ROOT_FILES = {'favicon.ico','sw.js','manifest.webmanifest','robots.txt','sitemap.xml','feed.xml','llms.txt','d485ac6cc21986723e6f627b37da7c5b.txt'}
ASSET_EXT = {'.js','.mjs','.css','.woff2','.woff','.ttf','.pdf','.docx','.png','.jpg','.jpeg','.webp','.svg','.ico','.mp4','.gif','.bcmap','.pfb'}
def sha(b): return hashlib.sha256(b).hexdigest()
def allowed(name):
 p=PurePosixPath(name)
 if any(x.startswith('.') for x in p.parts): return False
 if name=='assets/js/cabinet-demo.js': return False
 if len(p.parts)==1: return p.suffix=='.html' or name in ROOT_FILES
 return p.parts[0] in ('assets','bimi') and (p.suffix in ASSET_EXT or name=='assets/vendor/pdfjs/LICENSE')
class SearchHead(HTMLParser):
 def __init__(self):
  super().__init__();self.canonicals=[];self.noindex=False;self.in_head=True
 def handle_starttag(self,tag,attrs):
  if not self.in_head:return
  a=dict(attrs)
  if tag=='link' and 'canonical' in a.get('rel','').lower().split():self.canonicals.append(a.get('href',''))
  if tag=='meta' and a.get('name','').lower() in ('robots','googlebot','yandex'):
   self.noindex=self.noindex or bool(re.search(r'(?:^|[\s,])(?:noindex|none)(?:$|[\s,])',a.get('content','').lower()))
 def handle_endtag(self,tag):
  if tag=='head':self.in_head=False

def public_sitemap(repo,commit,files):
 """Derive discovery from the final public overlay, never from private prototypes.
 Dates come from the exact source history; fingerprint changes are not content edits.
 """
 ns='http://www.sitemaps.org/schemas/sitemap/0.9';ET.register_namespace('',ns)
 tree=ET.Element('{'+ns+'}urlset');seen=set()
 for name,data in sorted(files.items()):
  if not name.endswith('.html') or '/' in name:continue
  head=SearchHead();head.feed(data.decode())
  if head.noindex:continue
  if len(head.canonicals)!=1:raise ValueError('indexable page needs one canonical: '+name)
  canonical=head.canonicals[0];u=urlsplit(canonical)
  if u.scheme!='https' or u.netloc!='akademsalon.ru' or u.query or u.fragment:raise ValueError('unsafe canonical: '+name)
  target='index.html' if u.path=='/' else unquote(u.path).lstrip('/')
  if target not in files:raise ValueError('missing canonical target: '+name)
  if target!=name:continue
  if canonical in seen:raise ValueError('duplicate canonical: '+name)
  seen.add(canonical);entry=ET.SubElement(tree,'{'+ns+'}url');ET.SubElement(entry,'{'+ns+'}loc').text=canonical
  # The legacy referral is supplied externally, not authored by this source commit.
  if name not in ('referral.html','referral-rules.html'):
   date=subprocess.check_output(['git','log','-1','--format=%cs',commit,'--',name],cwd=repo,text=True).strip()
   if re.fullmatch(r'\d{4}-\d{2}-\d{2}',date):ET.SubElement(entry,'{'+ns+'}lastmod').text=date
 return ET.tostring(tree,encoding='utf-8',xml_declaration=True)+b'\n'

def build(repo, revision, legacy, output):
 commit=subprocess.check_output(['git','rev-parse',revision+'^{commit}'],cwd=repo,text=True).strip()
 names=subprocess.check_output(['git','ls-tree','-r','--name-only',commit],cwd=repo,text=True).splitlines()
 files={n:subprocess.check_output(['git','show',commit+':'+n],cwd=repo) for n in names if allowed(n)}
 # The assistant's sources must match this frozen public source, not a prior checkout.
 knowledge_name='backend/salon_bot/assistant_knowledge.json'
 knowledge_hash=None
 if knowledge_name in names:
  knowledge_bytes=subprocess.check_output(['git','show',commit+':'+knowledge_name],cwd=repo)
  knowledge=json.loads(knowledge_bytes);knowledge_hash=sha(knowledge_bytes)
  for page in knowledge['pages']:
   name=page['url'].lstrip('/')
   if name not in files or sha(files[name])!=page['sha256']:raise ValueError('stale assistant knowledge: '+name)
 old=legacy.read_bytes()
 if b'200' not in old or 'первый заказ'.encode() not in old or b'__site-preview' in old: raise ValueError('unexpected legacy referral input')
 # Present the verified public referral independently from legal documents.
 presenter=subprocess.check_output(['git','show',commit+':scripts/referral-presentation.py'],cwd=repo,text=True)
 namespace={};exec(compile(presenter,'frozen-referral-presentation','exec'),namespace)
 presented=namespace['render_referral'](old.decode(),files['priyomnaya.html'].decode()).encode()
 files['referral.html']=presented; files['referral-rules.html']=presented
 # Canonicalize the identical public referral compatibility page after its overlay.
 files['referral-rules.html']=re.sub(rb'(rel="canonical" href=")https://akademsalon.ru/referral-rules.html',rb'\1https://akademsalon.ru/referral.html',presented)
 files['sitemap.xml']=public_sitemap(repo,commit,files)
 version='production-'+commit[:12]
 # Replace the whole shell family, including JS-inserted mobile CSS, to evict old SW caches.
 for name,data in list(files.items()):
  if PurePosixPath(name).suffix in ('.html','.js','.css','.webmanifest'):
   s=data.decode('utf-8').replace('20260806shell123',version)
   if name.endswith('.html'):
    s=re.sub(r'<script\b[^>]*src=["\'][^"\']*cabinet-demo\.js[^"\']*["\'][^>]*>\s*</script>','',s)
   files[name]=s.encode()
 asset_hashes={name:sha(data)[:16] for name,data in files.items()}
 pattern=re.compile(r'\b(src|href)=("|\')([^"\']+)\2')
 for name,data in list(files.items()):
  if not name.endswith('.html'): continue
  def fingerprint(m):
   value=html.unescape(m[3]); u=urlsplit(value)
   key=unquote(u.path).lstrip('/')
   if u.scheme or u.netloc or key not in files or PurePosixPath(key).suffix not in ('.js','.css'): return m[0]
   value=u.path+('?' + u.query + '&' if u.query else '?')+'r='+asset_hashes[key]+('#'+u.fragment if u.fragment else '')
   return m[1]+'='+m[2]+html.escape(value,quote=True)+m[2]
  files[name]=pattern.sub(fingerprint,data.decode()).encode()
 for key in ('index.html','configurator.html','dashboard.html'):
  if b'__site-preview' in files[key]: raise ValueError('private preview guard')
 if output.exists(): raise ValueError('output must not already exist')
 output.mkdir(parents=True)
 for name,data in files.items():
  path=output/name; path.parent.mkdir(parents=True,exist_ok=True); path.write_bytes(data)
 manifest={'source_commit':commit,'assistant_knowledge_sha256':knowledge_hash,'shell_version':version,'legacy_referral_sha256':sha(old),'excluded':['private source','cabinet-demo.js','unactivated referral prototype'],'files':{name:sha(data) for name,data in sorted(files.items())}}
 receipt=output.with_suffix('.manifest.json'); receipt.write_text(json.dumps(manifest,indent=2)+'\n')
 archive=output.with_suffix('.tar.gz')
 with tarfile.open(archive,'w:gz',format=tarfile.PAX_FORMAT) as tar:
  for name in sorted(files):
   info=tarfile.TarInfo(name);info.size=len(files[name]);info.mode=0o644;info.mtime=0
   import io
   tar.addfile(info,io.BytesIO(files[name]))
 return {'source_commit':commit,'output':str(output),'manifest':str(receipt),'archive':str(archive),'archive_sha256':sha(archive.read_bytes()),'file_count':len(files)}
def build_overlay(repo, revision, baseline, output, baseline_release='release207-store-design-36b11ec7'):
 """Bounded assistant overlay on a frozen published release, preserving concurrent work."""
 commit=subprocess.check_output(['git','rev-parse',revision+'^{commit}'],cwd=repo,text=True).strip()
 files={}
 with tarfile.open(baseline,'r:gz') as archive:
  for member in archive:
   if member.isdir():continue
   name=str(PurePosixPath(member.name.removeprefix('./')))
   if not member.isfile() or name.startswith('/') or '..' in PurePosixPath(name).parts:raise ValueError('unsafe baseline entry')
   files[name]=archive.extractfile(member).read()
 before={n:sha(b) for n,b in files.items()}
 patches=['assets/js/app.js','assets/js/salon-assistant.js','assets/js/salon-order.js','assets/css/salon-assistant.css','assets/css/salon-intake.css','assets/js/salon-assistant-order.js']
 normalize=lambda b:re.sub(rb'production-[a-f0-9]{12}',b'20260806shell123',b)
 # Refuse an overlay if another release changed the same shared source.
 for name in patches[:-1]:
  expected=subprocess.check_output(['git','show','f878db1a:'+name],cwd=repo)
  if normalize(files[name])!=expected:raise ValueError('overlapping published change: '+name)
 if patches[-1] in files:raise ValueError('new module already exists')
 knowledge_bytes=subprocess.check_output(['git','show',commit+':backend/salon_bot/assistant_knowledge.json'],cwd=repo)
 for page in json.loads(knowledge_bytes)['pages']:
  if before.get(page['url'].lstrip('/'))!=page['sha256']:raise ValueError('knowledge is not from exact published baseline: '+page['url'])
 for name in patches:files[name]=subprocess.check_output(['git','show',commit+':'+name],cwd=repo)
 # The standalone store previously omitted the shared helper and PWA shell metadata.
 # Add only runtime entrypoints and installation metadata; preserve every body byte.
 for name in ('shop.html','shop-terms.html'):
  page=files[name].decode()
  if re.search(r'<script[^>]+src=["\'][^"\']*assets/js/app.js',page):continue
  extra='<link rel="manifest" href="/manifest.webmanifest?v=20260806shell123"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Академсалон"><link rel="apple-touch-icon" href="/assets/img/icon-192.png"><script src="/assets/js/app.js?v=listik20260911" data-salon-assistant-only defer></script>'
  if page.count('</head>')!=1:raise ValueError('unexpected store document')
  files[name]=page.replace('</head>',extra+'</head>').encode()
 version='production-'+commit[:12]
 for name,data in list(files.items()):
  if PurePosixPath(name).suffix in ('.html','.js','.css','.webmanifest'):
   files[name]=normalize(data).replace(b'20260806shell123',version.encode())
 asset_hashes={n:sha(b)[:16] for n,b in files.items()}
 pattern=re.compile(r"\b(src|href)=(\"|')([^\"']+)\2")
 for name,data in list(files.items()):
  if not name.endswith('.html'):continue
  def fingerprint(m):
   u=urlsplit(html.unescape(m[3]));key=unquote(u.path).lstrip('/')
   if u.scheme or u.netloc or key not in files or PurePosixPath(key).suffix not in ('.js','.css'):return m[0]
   query=[q for q in u.query.split('&') if q and not q.startswith('r=')]+['r='+asset_hashes[key]]
   value=u.path+'?'+'&'.join(query)+('#'+u.fragment if u.fragment else '')
   return m[1]+'='+m[2]+html.escape(value,quote=True)+m[2]
  files[name]=pattern.sub(fingerprint,data.decode()).encode()
 if output.exists():raise ValueError('output already exists')
 output.mkdir(parents=True)
 for name,data in files.items():
  dest=output/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
 manifest={'source_commit':commit,'baseline_archive_sha256':sha(baseline.read_bytes()),'baseline_release':baseline_release,'assistant_knowledge_sha256':sha(knowledge_bytes),'shell_version':version,'patches':patches,'before_files':before,'files':{n:sha(b) for n,b in sorted(files.items())},'transform':'six assistant assets; store helper/PWA head entrypoints; shared shell cache generation; HTML asset fingerprints'}
 receipt=output.with_suffix('.manifest.json');receipt.write_text(json.dumps(manifest,indent=2)+'\n')
 archive=output.with_suffix('.tar.gz')
 with tarfile.open(archive,'w:gz',format=tarfile.PAX_FORMAT) as tar:
  import io
  for name,data in sorted(files.items()):
   info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o644;info.mtime=0;tar.addfile(info,io.BytesIO(data))
 return {'source_commit':commit,'output':str(output),'manifest':str(receipt),'archive':str(archive),'archive_sha256':sha(archive.read_bytes()),'file_count':len(files)}

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--repo',type=Path,default=Path(__file__).resolve().parents[1]);p.add_argument('--ref',required=True);p.add_argument('--legacy-referral',type=Path);p.add_argument('--baseline-archive',type=Path);p.add_argument('--baseline-release',default='release207-store-design-36b11ec7');p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 if a.baseline_archive:result=build_overlay(a.repo,a.ref,a.baseline_archive,a.output,a.baseline_release)
 elif a.legacy_referral:result=build(a.repo,a.ref,a.legacy_referral,a.output)
 else:p.error('a baseline archive or legacy referral is required')
 print(json.dumps(result))
