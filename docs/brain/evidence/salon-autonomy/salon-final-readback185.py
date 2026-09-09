import json,sqlite3,pathlib,subprocess,urllib.request,urllib.error,datetime,re
pid=subprocess.check_output(['systemctl','show','salon-bot-v2.service','-p','MainPID','--value'],text=True).strip()
env=dict(x.split(b'=',1) for x in pathlib.Path('/proc/'+pid+'/environ').read_bytes().split(b'\0') if b'=' in x)
p=pathlib.Path(env.get(b'DB_PATH',b'/root/salon_bot/salon.db').decode());p=p if p.is_absolute() else pathlib.Path('/root/salon_bot')/p
with sqlite3.connect(p.as_uri()+'?mode=ro',uri=True) as c:
 c.execute('PRAGMA query_only=ON')
 check=c.execute('PRAGMA quick_check').fetchone()[0]
 promo=c.execute("SELECT uses_left,amount,min_price,expires_at,active FROM promos WHERE code='СВОИ6000'").fetchone()
record={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source_commit':'432dfa9bd03a716c38b85d5d648d2655ed1ab8ed','sqlite_quick_check':check,'services':{},'links':{},'private_urls':{},'promo':{'uses_left':promo[0],'applications':4-promo[0],'amount':promo[1],'minimum':promo[2],'expires_at':promo[3],'active':bool(promo[4]),'paid_conversions':'not established'}}
for name in ['salon-bot-v2.service','nginx','salon-watch.timer']:record['services'][name]=subprocess.check_output(['systemctl','is-active',name],text=True).strip()
for name in ['current','dist','previous']:record['links'][name]=str((pathlib.Path('/var/www/academic_saloon')/name).resolve())
for path in ['/docs/brain/START-HERE.md','/.env','/assets/js/cabinet-demo.js','/__site-preview.js','/._index.html']:
 try:
  with urllib.request.urlopen('https://akademsalon.ru'+path,timeout=8) as r:status=r.status
 except urllib.error.HTTPError as e:status=e.code
 record['private_urls'][path]=status
log=subprocess.check_output(['journalctl','-u','salon-bot-v2.service','--since','2026-09-09 16:31:00','--no-pager','-o','cat'],text=True)
record['runtime_error_line_count']=sum(bool(re.search(r'traceback|exception|\berror\b',x,re.I)) for x in log.splitlines())
print(json.dumps(record))
