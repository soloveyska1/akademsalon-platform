from pathlib import Path
import json,hashlib,tarfile,subprocess,re
root=Path('/Users/saymurrbk.ru/.codex/worktrees/salon-direct-orders');newroot=Path('/tmp/salon-public-release198');manifestpath=Path('/tmp/salon-public-release198.manifest.json');new=json.loads(manifestpath.read_text());old=json.loads(Path('/tmp/salon-public-release197.manifest.json').read_text());archive=Path('/tmp/salon-public-release198-delta.tar.gz')
changed=[p for p,h in new['files'].items() if old['files'].get(p)!=h]
with tarfile.open(archive,'w:gz') as tf:
 for p in changed:
  item=tf.gettarinfo(str(newroot/p),arcname=p);item.uid=item.gid=0;item.uname=item.gname='';item.mtime=0
  with (newroot/p).open('rb') as f:tf.addfile(item,f)
html=[p for p in subprocess.check_output(['git','diff','--name-only','5ba9917a',new['source_commit']],cwd=root,text=True).splitlines() if p.endswith('.html')];assert len(html)==89
paths=list(dict.fromkeys(html+['sitemap.xml','assets/css/salon-experience.css','assets/js/salon-shell.js','assets/js/salon-order.js','dashboard.html','referral.html','referral-rules.html','offline.html','sw.js']))
s=Path('/tmp/salon-study-static-release.py').read_text().replace('/tmp/salon-study-release197','/tmp/salon-header-release198').replace('salon-public-release197','salon-public-release198')
s=re.sub(r"(assert hashlib.sha256\(archive.read_bytes\(\)\).hexdigest\(\)==')[^']+",lambda m:m[1]+hashlib.sha256(archive.read_bytes()).hexdigest(),s)
s=re.sub(r"(assert hashlib.sha256\(\(stage/'salon-public-release198.manifest.json'\).read_bytes\(\)\).hexdigest\(\)==')[^']+",lambda m:m[1]+hashlib.sha256(manifestpath.read_bytes()).hexdigest(),s)
s=s.replace("assert manifest['source_commit']=='be99a1d914d7063f7232ab7d243d3a6503ad317d'", "assert manifest['source_commit']=='"+new['source_commit']+"'")
s=s.replace("old=base/'releases/release196-55ed92ad';release=base/'releases/release197-be99a1d9'","old=base/'releases/release197-be99a1d9';release=base/'releases/release198-"+new['source_commit'][:8]+"'")
s=s.replace("prefix='.release197-'","prefix='.release198-'").replace("'-release197'","'-release198'")
lines=s.splitlines()
for i,line in enumerate(lines):
 if line.startswith('  for path in ['):lines[i]='  for path in '+repr(paths)+':'
s='\n'.join(lines)+'\n';Path('/tmp/salon-header-static-release.py').write_text(s)
report={'source_commit':new['source_commit'],'files':len(new['files']),'delta_files':len(changed),'archive_bytes':archive.stat().st_size,'public_readbacks':len(paths),'archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest()};Path('/tmp/salon-header-delta-build.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
