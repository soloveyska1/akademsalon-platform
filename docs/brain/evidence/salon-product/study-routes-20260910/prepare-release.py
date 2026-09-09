from pathlib import Path
import json,hashlib,tarfile,subprocess
root=Path('/Users/saymurrbk.ru/.codex/worktrees/salon-direct-orders')
newroot=Path('/tmp/salon-public-release197')
manifestpath=Path('/tmp/salon-public-release197.manifest.json')
new=json.loads(manifestpath.read_text());old=json.loads(Path('/tmp/salon-public-release196.manifest.json').read_text())
archive=Path('/tmp/salon-public-release197-delta.tar.gz')
changed=[p for p,h in new['files'].items() if old['files'].get(p)!=h]
with tarfile.open(archive,'w:gz') as tf:
 for p in changed:
  item=tf.gettarinfo(str(newroot/p),arcname=p);item.uid=item.gid=0;item.uname=item.gname='';item.mtime=0
  with (newroot/p).open('rb') as f:tf.addfile(item,f)
html=[p for p in subprocess.check_output(['git','diff','--name-only','ccb1d12b',new['source_commit']],cwd=root,text=True).splitlines() if p.endswith('.html')]
assert len(html)==42
paths=list(dict.fromkeys(html+['sitemap.xml','assets/css/salon-experience.css','assets/js/salon-experience.js','assets/css/salon-library.css','assets/js/salon-library.js','assets/js/salon-order.js','index.html','services.html','configurator.html','dashboard.html','referral.html','offline.html','sw.js']))
s=Path('/tmp/salon-fieldset-static-release.py').read_text()
s=s.replace('/tmp/salon-fieldset-release196','/tmp/salon-study-release197').replace('salon-public-release196','salon-public-release197')
s=s.replace('b9f918650c4d3e7b2d15ffec11ac5af7c16f902abedeccc6cd197e62e97a3854',hashlib.sha256(archive.read_bytes()).hexdigest()).replace('e0a2c748023bd4b79df23ded9288a61bf41ac44203ba45bec14545f9803a5692',hashlib.sha256(manifestpath.read_bytes()).hexdigest()).replace('55ed92ad4ca3b56ce1d5faec4b8612fccc4fc97d',new['source_commit'])
s=s.replace("old=base/'releases/release195-dc6fa1ff';release=base/'releases/release196-55ed92ad'","old=base/'releases/release196-55ed92ad';release=base/'releases/release197-"+new['source_commit'][:8]+"'")
s=s.replace("prefix='.release196-'","prefix='.release197-'").replace("'-release196'","'-release197'")
lines=s.splitlines()
for i,line in enumerate(lines):
 if line.startswith('  for path in ['):lines[i]='  for path in '+repr(paths)+':'
s='\n'.join(lines)+'\n';Path('/tmp/salon-study-static-release.py').write_text(s)
report={'source_commit':new['source_commit'],'files':len(new['files']),'delta_files':len(changed),'archive_bytes':archive.stat().st_size,'public_readbacks':len(paths),'archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest()}
Path('/tmp/salon-study-delta-build.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
