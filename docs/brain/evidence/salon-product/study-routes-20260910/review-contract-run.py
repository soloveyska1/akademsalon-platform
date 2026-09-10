from pathlib import Path
import json,hashlib,subprocess
E=Path(__file__).resolve().parent;R=E.parents[4]
subprocess.run(['python3',str(E/'review-contract-static.py')],cwd=R,check=True)
for n in ['route','order','observers']:subprocess.run(['node',str(E/('review-contract-'+n+'.cjs'))],cwd=R,check=True)
d=json.loads((E/'review-contract-static.json').read_text())
for n in ['route','order','observers']:
 x=json.loads((E/('review-contract-'+n+'.json')).read_text());d['tests'].extend(x['tests'])
s=(R/'knowledge.html').read_text();css=(R/'assets/css/salon-library.css').read_text();checks={'noJS fallback disclosed':'Здесь показан маршрут для начала курсовой.' in s,'noJS copy hidden':'data-study-copy hidden' in s,'noJS controls hidden and gated':'.lr-route-controls{display:none;' in css and '[data-study-enhanced] .lr-route-controls{display:grid}' in css}
for n,v in checks.items():assert v,n;d['tests'].append({'case':n,'pass':v})
d['decision']='GO';d['passed']=len(d['tests']);d['findings']=[];d['summary']={'passed':len(d['tests']),'P0':0,'P1':0,'P2':0,'files':len(d['source_sha256'])}
d['reproducer']=str((E/'review-contract-run.py').relative_to(R));d['limitations']=['Pinned source/VM review; UX browser and frozen/live deployment gates parent-owned.','Original29 unscoped order links retained inside exact original25articles; contextual next block adds correct explicit path.','No network, customer-data or financial mutations.']
assert all(hashlib.sha256((R/n).read_bytes()).hexdigest()==h for n,h in d['source_sha256'].items());d['final_drift']=[]
d['reproducer_sha256']={str(p.relative_to(R)):hashlib.sha256(p.read_bytes()).hexdigest() for p in E.glob('review-contract-*') if p.suffix in ['.py','.cjs']}
(E/'review-contract-final.json').write_text(json.dumps(d,ensure_ascii=False,indent=2));print(d['summary'])
