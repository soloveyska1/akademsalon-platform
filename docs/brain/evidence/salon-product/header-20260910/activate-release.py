from pathlib import Path
import hashlib,json,os,tarfile,tempfile,urllib.request,urllib.error,subprocess,shutil
from urllib.parse import urlsplit
base=Path('/var/www/academic_saloon');stage=Path('/tmp/salon-header-release198');archive=stage/'salon-public-release198-delta.tar.gz';manifest=json.loads((stage/'salon-public-release198.manifest.json').read_text())
assert hashlib.sha256(archive.read_bytes()).hexdigest()=='207d6e54df6f0488aff1c59b67b0f63897736d96522024c05b6edb35460a1fe2'
assert hashlib.sha256((stage/'salon-public-release198.manifest.json').read_bytes()).hexdigest()=='e6ae313ff9631e2b7b3f3707460ac95360888c8499c7cf2b7e2b3bf04a5829a3'
assert manifest['source_commit']=='666e7b8f95aa262fc7f152bc7fc117469a8489b5'
old=base/'releases/release197-be99a1d9';release=base/'releases/release198-666e7b8f'
assert (base/'current').resolve()==old and (base/'dist').resolve()==old
assert release.is_dir()
actual={str(p.relative_to(release)):hashlib.sha256(p.read_bytes()).hexdigest() for p in release.rglob('*') if p.is_file()}
assert actual==manifest['files']
if (stage/'static-release.json').exists():shutil.copyfile(stage/'static-release.json',stage/'recovered-initial-attempt.json')
record={'release':release.name,'source_commit':manifest['source_commit'],'files':len(actual),'steps':[],'database_restored':False}
def switch(target,name):
 temp=base/('.'+name+'-release198')
 if temp.is_symlink():temp.unlink()
 os.symlink(str(target),temp);os.replace(temp,base/name)
def get(path):
 req=urllib.request.Request('http://127.0.0.1'+path,headers={'Host':'akademsalon.ru'})
 # Nginx HTTP redirects to HTTPS; use TLS canonical host for exact public artifact.
 req=urllib.request.Request('https://akademsalon.ru'+path)
 with urllib.request.urlopen(req,timeout=10) as r:return r.read(),r.headers
redirects={'expertise.html': {'status': 301, 'location': 'https://akademsalon.ru/'}, 'index.html': {'status': 301, 'location': 'https://akademsalon.ru/'}}
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
opener=urllib.request.build_opener(NoRedirect)
def destination(path):
 if path not in redirects:return path
 expected=redirects[path]
 try:
  opener.open(urllib.request.Request('https://akademsalon.ru/'+path,method='HEAD'),timeout=10)
  raise AssertionError('Expected preserved redirect: '+path)
 except urllib.error.HTTPError as e:
  assert e.code==expected['status'] and e.headers.get('Location')==expected['location'],path
 return urlsplit(expected['location']).path.lstrip('/') or 'index.html'
oldhash=hashlib.sha256((old/'index.html').read_bytes()).hexdigest()
def verify(target,modern):
 h=json.loads(get('/api/health')[0]);assert h.get('ok'),h
 f=json.loads(get('/api/features')[0]);assert f.get('pay_online'),f
 home=get('/?release_check='+target.name)[0];assert hashlib.sha256(home).hexdigest()==(actual['index.html'] if modern else oldhash)
 out={'health':h,'pay_online':f['pay_online'],'current':str((base/'current').resolve()),'index_sha256':hashlib.sha256(home).hexdigest()}
 assert (base/'current').resolve()==target and (base/'dist').resolve()==target
 if modern:
  for path in ['about.html', 'academic-integrity.html', 'audit-temy-vkr.html', 'avtorskiy-zakaz.html', 'benefits.html', 'check.html', 'configurator.html', 'consent-analytics.html', 'consent-marketing.html', 'consent-publication.html', 'consent-request.html', 'consent.html', 'deposit.html', 'diplomnaya-po-ekonomike.html', 'diplomnaya-po-psihologii.html', 'diplomnaya-po-yurisprudencii.html', 'diplomnaya-rabota.html', 'dorabotka-otcheta-po-praktike.html', 'dosie-nauchruka.html', 'expertise.html', 'gift.html', 'guarantees.html', 'guide-antiplagiat-ai.html', 'guide-apellyaciya.html', 'guide-dnevnik-praktiki.html', 'guide-harakteristika-s-praktiki.html', 'guide-kursovaya-za-nedelyu.html', 'guide-normocontrol.html', 'guide-obekt-predmet-cel-zadachi.html', 'guide-otchet-po-praktike.html', 'guide-otzyv-rukovoditelya-vkr.html', 'guide-prakticheskaya-chast-kursovoy.html', 'guide-prezentaciya-k-zashchite.html', 'guide-prilozheniya-po-gost.html', 'guide-recenziya-na-vkr.html', 'guide-rech-na-zashchitu.html', 'guide-rinc-statya.html', 'guide-skolko-stoit-diplomnaya.html', 'guide-skolko-stoit-kursovaya.html', 'guide-spisok-literatury.html', 'guide-temy-vkr.html', 'guide-titulnyj-list.html', 'guide-vkr-struktura.html', 'guide-vvedenie-kursovoy.html', 'guide-zaklyuchenie-kursovoy.html', 'guide-zaklyuchenie-vkr.html', 'guide-zashchita-diploma.html', 'index.html', 'kandidatskaya-dissertaciya.html', 'knowledge.html', 'komissiya-0.html', 'kursovaya-po-ekonomike.html', 'kursovaya-po-informatike.html', 'kursovaya-po-menedzhmentu.html', 'kursovaya-po-pedagogike.html', 'kursovaya-po-psihologii.html', 'kursovaya-po-yurisprudencii.html', 'kursovaya-rabota.html', 'loyalty.html', 'magisterskaya-dissertaciya.html', 'nauchnaya-statya.html', 'normokontrol-vkr.html', 'oferta.html', 'oplaceno.html', 'oplata.html', 'otchet-po-praktike.html', 'plan.html', 'plus.html', 'privacy.html', 'priyomnaya.html', 'prolog.html', 'proverka-istochnikov-vkr.html', 'razbor-zamechaniy-nauchruka.html', 'redaktura-posle-ii.html', 'referat.html', 'referral-rules.html', 'referral.html', 'refunds.html', 'requisites.html', 'reviews.html', 'samples.html', 'services.html', 'specifikaciya.html', 'start.html', 'tariffs.html', 'terms.html', 'tools.html', 'vedenie.html', 'zayavka.html', 'sitemap.xml', 'assets/css/salon-experience.css', 'assets/js/salon-shell.js', 'assets/js/salon-order.js', 'dashboard.html', 'offline.html', 'sw.js']:
   final=destination(path);body,headers=get('/'+final+'?release_check='+target.name);assert hashlib.sha256(body).hexdigest()==actual[final],path
  assert b'cabinet-demo.js' not in get('/dashboard.html')[0]
  _,hdr=get('/assets/vendor/pdfjs/pdf.min.mjs');assert 'javascript' in hdr.get('Content-Type','')
  out['pdf_module_mime']=hdr.get('Content-Type');out['preserved_redirects']=redirects
 return out
assert (base/'current').resolve()==old and (base/'dist').resolve()==old
try:
 for action,target,modern in [('apply',release,True),('rollback',old,False),('forward',release,True)]:
  switch(target,'current');switch(target,'dist');record['steps'].append({'action':action,**verify(target,modern)})
 switch(old,'previous')
except Exception as e:
 switch(old,'current');switch(old,'dist');record['error']=type(e).__name__+': '+str(e);record['recovery']=verify(old,False)
 (stage/'static-release.json').write_text(json.dumps(record,indent=2));raise
(stage/'static-release.json').write_text(json.dumps(record,indent=2));print(json.dumps(record))
