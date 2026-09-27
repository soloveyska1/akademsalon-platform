from pathlib import Path
import argparse,json,hashlib,re,shutil,subprocess,tarfile
HERE=Path(__file__).resolve().parent
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def inventory(p):return {str(f.relative_to(p)):sha(f) for f in sorted(p.rglob('*')) if f.is_file()}
def build(base,out):
 before=inventory(base);expected=json.loads((HERE/'baseline-hashes.json').read_text());assert before==expected,'release225 baseline drift';assert not out.exists();shutil.copytree(base,out)
 products=json.loads(subprocess.check_output(['node','-e','process.stdout.write(JSON.stringify(require(process.argv[1]).products))',str((base/'assets/js/salon-products.js').resolve())],text=True))
 order=['course','diplom','practice','master','rinc','essay','referat','self','chapter','editing','custom','kandidat'];products.sort(key=lambda p:order.index(p['id']))
 import html
 rows=[]
 for p in products:
  name={'self':'Контрольная работа','diplom':'Дипломная / ВКР','custom':'Другая задача','editing':'Доработка текста'}.get(p['id'],p['name']);price=p.get('price') or (9000 if p['id']=='editing' else 2500);money=f'{price:,}'.replace(',',' ')
  rows.append(f'<a class="sv-row" href="configurator.html?product={p["id"]}" data-product="{p["id"]}"><span class="sv-row-icon" aria-hidden="true"></span><span class="sv-row-copy"><strong>{html.escape(name)}</strong><small data-card-detail>{html.escape(p['detail'])}</small></span><span class="sv-row-price"><b data-card-price>от {money} ₽</b><small data-card-perk>Оформление включено</small></span><span class="sv-row-arrow" aria-hidden="true">↗</span></a>')
 main=(HERE/'page.html').read_text().replace('{{ROWS}}',''.join(rows));p=out/'services.html';s=p.read_text();a=s.index('<main ');b=s.index('</main>',a)+len('</main>');s=s[:a]+main+s[b:]
 for css in ['salon-catalogue.css','salon-services-estimate.css','salon-services-studio.css']:
  s=re.sub(r'<link[^>]+href="assets/css/'+re.escape(css)+r'[^>]*>','',s)
 (out/'assets/css/salon-services-studio.css').write_bytes((HERE/'studio.css').read_bytes());(out/'assets/js/salon-catalogue.js').write_bytes((HERE/'studio.js').read_bytes())
 s=s.replace('</head>',f'<link rel="stylesheet" href="assets/css/salon-services-studio.css?v=clarity-20260927&amp;r={sha(out/"assets/css/salon-services-studio.css")[:16]}"></head>')
 s=re.sub(r'<script src="assets/js/salon-catalogue.js[^>]*></script>',f'<script src="assets/js/salon-catalogue.js?v=clarity-20260927&amp;r={sha(out/"assets/js/salon-catalogue.js")[:16]}"></script>',s);p.write_text(s)
 # Keep the configured benefit estimate visible across the existing request handoff.
 (out/'assets/js/salon-estimate-order.js').write_bytes((HERE/'order-ui.js').read_bytes());(out/'assets/css/salon-services-estimate.css').write_bytes((HERE/'order.css').read_bytes())
 cp=out/'configurator.html';cs=cp.read_text()
 for asset in ['assets/js/salon-estimate-order.js','assets/css/salon-services-estimate.css']:
  cs=re.sub(re.escape(asset)+r'[^"\s]*',asset+'?v=clarity-20260927&amp;r='+sha(out/asset)[:16],cs)
 cp.write_text(cs)
 after=inventory(out);changed=[p for p,h in after.items() if before.get(p)!=h];assert set(changed)=={'services.html','assets/css/salon-services-studio.css','assets/js/salon-catalogue.js','configurator.html','assets/js/salon-estimate-order.js','assets/css/salon-services-estimate.css'};assert set(before)<=set(after)
 for p in changed:
  if p.endswith('.js'):subprocess.run(['node','--check',str(out/p)],check=True)
 manifest={'version':'clarity-20260927','baseline_release':'release225-studio-a45b389e','source_commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'baseline_files':before,'files':after,'changed':changed,'deleted':[]}
 (out.parent/(out.name+'-manifest.json')).write_text(json.dumps(manifest,indent=2)+'\n')
 with tarfile.open(out.parent/(out.name+'-delta.tar.gz'),'w:gz') as tf:
  for p in changed:tf.add(out/p,arcname=p)
 print(json.dumps({'out':str(out),'files':len(after),'changed':changed}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('baseline',type=Path);p.add_argument('output',type=Path);a=p.parse_args();build(a.baseline,a.output)
