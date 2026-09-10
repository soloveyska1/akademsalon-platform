from pathlib import Path,PurePosixPath
import subprocess,json,hashlib,re,html
from urllib.parse import urlsplit,unquote
R=Path('/Users/saymurrbk.ru/.codex/worktrees/salon-direct-orders');F=Path('/tmp/salon-public-release195');review=json.loads(Path('/tmp/salon-discipline-contract.json').read_text());manifest=json.loads(F.with_suffix('.manifest.json').read_text());SHA='dc6fa1ff7174dfb5feae7c0021d2a0b89202a816';tests=[]
def check(n,v):tests.append({'case':n,'pass':bool(v)});assert v,n
def digest(b):return hashlib.sha256(b).hexdigest()
def source(n):return subprocess.check_output(['git','show',SHA+':'+n],cwd=R)
check('pinned source',manifest['source_commit']==SHA)
check('434 frozen file hashes',len(manifest['files'])==434 and all(digest((F/n).read_bytes())==h for n,h in manifest['files'].items()))
version=manifest['shell_version'];pattern=re.compile(r'\b(src|href)=("|\')([^"\']+)\2')
def transform(n):
 s=source(n).decode().replace('20260806shell123',version)
 if n.endswith('.html'):
  s=re.sub(r'<script\b[^>]*src=["\'][^"\']*cabinet-demo\.js[^"\']*["\'][^>]*>\s*</script>','',s)
  def fp(m):
   value=html.unescape(m[3]);u=urlsplit(value);key=unquote(u.path).lstrip('/')
   if u.scheme or u.netloc or key not in manifest['files'] or PurePosixPath(key).suffix not in ('.js','.css'):return m[0]
   value=u.path+('?' + u.query + '&' if u.query else '?')+'r='+manifest['files'][key][:16]+('#'+u.fragment if u.fragment else '')
   return m[1]+'='+m[2]+html.escape(value,quote=True)+m[2]
  s=pattern.sub(fp,s)
 return s.encode()
for n,h in review['source_sha256'].items():
 b=source(n)
 if n=='assets/css/salon-experience.css':
  suffix=b'.sen-psychology .part-band em{color:var(--sen-deep)}\n.sen-psychology .package-side .button{background:var(--sen-deep);color:var(--sen-sheet)}\n';check('CSS only reviewed two color rules',b.endswith(suffix) and digest(b[:-len(suffix)])==h)
 else:check(n+' reviewed source identity',digest(b)==h)
 if n.endswith(('.html','.js','.css')):check(n+' exact frozen transform',transform(n)==(F/n).read_bytes())
psych='diplomnaya-po-psihologii.html';base=subprocess.check_output(['git','show',review['base']+':'+psych],cwd=R,text=True);blocks=re.findall(r'<section class="section compact">.*?</section>',base,re.S)
check('frozen psychology protected blocks byte exact',len(blocks)==2 and all(b in (F/psych).read_text() for b in blocks))
out={'decision':'GO','findings':[],'source_commit':SHA,'tests':tests,'passed':len(tests),'reproducer':'/tmp/salon-discipline-frozen-contract.py','manifest_sha256':digest(F.with_suffix('.manifest.json').read_bytes()),'frozen_reviewed_files':{n:manifest['files'][n] for n in review['source_sha256'] if n in manifest['files']},'boundary':'Independent local frozen byte verification. Parent owns browser/live and rollback receipts.'};Path('/tmp/salon-discipline-frozen-contract.json').write_text(json.dumps(out,ensure_ascii=False,indent=2));print({'passed':len(tests),'source':SHA,'decision':'GO'})
