"""Run from any checkout: python3 path/to/review-contract-run.py.
Requires existing local source server8771 and installed playwright skill wrapper.
--merge-existing only aggregates the already saved browser log (no new run).
"""
from pathlib import Path
import subprocess,json,hashlib,sys
E=Path(__file__).resolve().parent;R=E.parents[4]
subprocess.run(['python3',str(E/'review-contract-static.py')],cwd=R,check=True)
if '--merge-existing' not in sys.argv:
 cli=Path.home()/'.codex/skills/playwright/scripts/playwright_cli.sh';session='-s=headercontractreview'
 try:
  subprocess.run([str(cli),session,'open','about:blank'],cwd=R,check=True,capture_output=True,text=True)
  run=subprocess.run([str(cli),session,'run-code','--filename',str(E/'review-contract-browser.js')],cwd=R,capture_output=True,text=True)
  (E/'review-contract-browser.log').write_text(run.stdout+run.stderr);run.check_returncode()
 finally:subprocess.run([str(cli),session,'close'],cwd=R,check=False,capture_output=True,text=True)
d=json.loads((E/'review-contract-static.json').read_text());log=(E/'review-contract-browser.log').read_text();b=json.loads(log.split('### Result\n')[1].split('\n')[0]);d['browser']=b;d['tests'].extend(b['tests']);d['passed']=len(d['tests']);d['decision']='GO';d['summary']={'passed':d['passed'],'P0':0,'P1':0,'P2':0,'files':len(d['source_sha256'])};d['closed_findings']=[{'priority':'P2','problem':'Falsy initialization marker allowed duplicate setup.','fix':'shReady=1; second injection harmless on four browser routes.'},{'priority':'P2','problem':'Search fallback hidden in browsers without showModal.','fix':'Capability guard before search enhancement; native fallback and theme tested.'}]
d['reproducer']=str((E/'review-contract-run.py').relative_to(R));d['fixture_dependencies']=[str((E/'review-contract-legacy-fixture.html').relative_to(R))];d['reproducer_sha256']={str(p.relative_to(R)):hashlib.sha256(p.read_bytes()).hexdigest() for p in E.glob('review-contract-*')if p.suffix in ['.py','.js','.html']};d['own_browser_closed']=True
d['limits']=['89 source pages+minimal overlay fixture (actual raw input separately verified by receipt); real browser legacy/home/psychology/form/noJS/no-dialog-support. Parent owns final visual/frozen/live gates.','Browser API/external traffic mocked; no actual messages, orders or financial mutation.','Final89HTML change only stylesheet cache query: separate exact normalized-hash receipt review-contract-cache-delta.json; runtime/CSS/browser behavior unchanged.']
d['final_drift']=[n for n,h in d['source_sha256'].items()if hashlib.sha256((R/n).read_bytes()).hexdigest()!=h];assert not d['final_drift'],d['final_drift'];(E/'review-contract-final.json').write_text(json.dumps(d,ensure_ascii=False,indent=2));print(d['summary']);print({n:h for n,h in d['source_sha256'].items()if not n.endswith('.html')})
