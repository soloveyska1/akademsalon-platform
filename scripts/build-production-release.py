#!/usr/bin/env python3
"""Build a frozen, allowlisted VPS release. Never use the private Sites dist.
The unactivated referral prototype stays private; reviewed live terms are explicit input.
"""
import argparse, hashlib, html, json, re, subprocess, tarfile
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
def build(repo, revision, legacy, output):
 commit=subprocess.check_output(['git','rev-parse',revision+'^{commit}'],cwd=repo,text=True).strip()
 names=subprocess.check_output(['git','ls-tree','-r','--name-only',commit],cwd=repo,text=True).splitlines()
 files={n:subprocess.check_output(['git','show',commit+':'+n],cwd=repo) for n in names if allowed(n)}
 old=legacy.read_bytes()
 if b'200' not in old or 'первый заказ'.encode() not in old or b'__site-preview' in old: raise ValueError('unexpected legacy referral input')
 files['referral.html']=old; files['referral-rules.html']=old
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
 manifest={'source_commit':commit,'shell_version':version,'legacy_referral_sha256':sha(old),'excluded':['private source','cabinet-demo.js','unactivated referral prototype'],'files':{name:sha(data) for name,data in sorted(files.items())}}
 receipt=output.with_suffix('.manifest.json'); receipt.write_text(json.dumps(manifest,indent=2)+'\n')
 archive=output.with_suffix('.tar.gz')
 with tarfile.open(archive,'w:gz',format=tarfile.PAX_FORMAT) as tar:
  for name in sorted(files):
   info=tarfile.TarInfo(name);info.size=len(files[name]);info.mode=0o644;info.mtime=0
   import io
   tar.addfile(info,io.BytesIO(files[name]))
 return {'source_commit':commit,'output':str(output),'manifest':str(receipt),'archive':str(archive),'archive_sha256':sha(archive.read_bytes()),'file_count':len(files)}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--repo',type=Path,default=Path(__file__).resolve().parents[1]);p.add_argument('--ref',required=True);p.add_argument('--legacy-referral',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 print(json.dumps(build(a.repo,a.ref,a.legacy_referral,a.output)))
