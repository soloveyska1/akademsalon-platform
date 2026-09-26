"""Deterministic price-studio overlay on exact release223; never rebuild stale root HTML."""
from pathlib import Path
import argparse,hashlib,json,re,shutil,subprocess,tarfile
HERE=Path(__file__).resolve().parent
VERSION='services-20260927-v1'
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def inventory(p):return {str(f.relative_to(p)):digest(f) for f in sorted(p.rglob('*')) if f.is_file()}
def replace(s,a,b):
 assert s.count(a)==1,(a[:100],s.count(a));return s.replace(a,b)
def build(baseline,output):
 before=inventory(baseline);assert before==json.loads((HERE/'baseline-hashes.json').read_text()),'baseline drift'
 assert not output.exists();shutil.copytree(baseline,output)
 additions={'estimate.js':'assets/js/salon-estimate.js','benefits-ui.js':'assets/js/salon-estimate-benefits.js','services.css':'assets/css/salon-services-estimate.css','order-ui.js':'assets/js/salon-estimate-order.js','catalogue.js':'assets/js/salon-catalogue.js'}
 for src,target in additions.items():(output/target).write_bytes((HERE/src).read_bytes())
 s=(output/'services.html').read_text()
 start=s.index('<section class="cat-intro">');end=s.index('</section>',start)+len('</section>');s=s[:start]+(HERE/'hero.html').read_text()+s[end:]
 s=s.replace('>По заданию</strong>','>от 9 000 ₽</strong>',1);s=s.replace('>По заданию</strong>','>от 2 500 ₽</strong>',1)
 s=replace(s,'<span data-card-time>по заданию</span>','<span data-card-time>одна небольшая задача</span>')
 s=replace(s,'<details class="cat-price-settings">','<details class="cat-price-settings" open>')
 marker='<section class="sen-directory">';s=replace(s,marker,(HERE/'value.html').read_text()+marker)
 s=s.replace('Состав и заказ <span','Рассчитать и выбрать <span')
 s=replace(s,'id="cat-search" type="search"','id="cat-search" type="search" aria-label="Найти работу или услугу"')
 s=replace(s,'<p class="cat-price-note">','<p class="cat-price-note">Для другой задачи показан ориентир одного фрагмента до 5 страниц. Для доработки — редакторский этап курсовой; вид работы меняется в расчёте. ')
 s=replace(s,'<meta name="description" content="', '<meta name="description" content="Рассчитайте ориентир для любой работы, срока и нужного объёма. Подписки, бонусы и дополнения в одной смете. ')
 (output/'services.html').write_text(s)
 # Public quote only; payable totals/discount eligibility remain server-owned.
 p=output/'assets/js/salon-order.js';s=p.read_text()
 start=s.index('function quote(){');end=s.index('\nfunction renderComposition()',start)
 s=s[:start]+'''function quote(){
 const base=baseQuote(),cs=compositionState();if(!cs){if(base.amount!==null)return base;const fallback={product:$('product').value,scope:$('scope').value};const q=window.SalonEstimate.estimate(fallback,{discipline:$('discipline').value,deadline:$('deadline').value},window.SalonEstimate.read(fallback));return {amount:q.total,high:q.high,exact:false,note:q.note,estimateState:fallback,compositionQuote:q};}
 const cq=window.SalonEstimate.estimate(cs,{discipline:$('discipline').value,deadline:$('deadline').value},window.SalonEstimate.read(cs));
 return {amount:cq.total,high:cq.high,exact:false,baseAmount:cq.work,compositionQuote:cq,estimateState:cs,note:cq.note};
}'''+s[end:]
 s=replace(s,"$('summary-price').textContent=q.amount?(q.exact?'':'от ')+P.money(q.amount)+(service?.unit||''):'По заданию';", "$('summary-price').textContent=q.high?window.SalonEstimate.range(q.amount,q.high):q.amount?(q.exact?'':'от ')+P.money(q.amount)+(service?.unit||''):'По заданию';")
 s=replace(s,"if(vip){const row=document.createElement('div');row.textContent='VIP-сопровождение · единая смета по заданию';receipt.append(row)}", "if(vip){const row=document.createElement('div');row.textContent='VIP-сопровождение · бюджет с резервом координации';receipt.append(row)}")
 s=replace(s,"compositionState()?M.summary(composition):'',", "quote().estimateState?window.SalonEstimate.description(quote().estimateState,{discipline:$('discipline').value,deadline:$('deadline').value}):'',")
 # Preserve pending-estimate contract, transmit range rather than counterfeit fixed total.
 s=replace(s,'low:q.amount||0,high:q.amount||0','low:q.amount||0,high:q.high||q.amount||0')
 s=replace(s,'p.cart.items[0].quote_preview={low:cq.work||0,high:cq.work||0};p.cart.items[0].quote_pending=cq.work===null||cs.package===\'vip\';', 'p.cart.items[0].quote_preview={low:cs.package===\'vip\'?cq.total:cq.work,high:cs.package===\'vip\'?cq.high:cq.workHigh};p.cart.items[0].quote_pending=true;')
 s=replace(s,'p.cart.quote_preview={low:cq.total??cq.lowerBound,high:cq.total??cq.lowerBound};p.cart.quote_pending=cq.total===null;', 'p.cart.quote_preview={low:cq.total??cq.lowerBound,high:cq.high??cq.total??cq.lowerBound};p.cart.quote_pending=true;')
 # In all custom/partial flows the server still receives an explicitly pending estimate.
 s=replace(s,'if(composed)M.lines(cs).forEach','if(composed)(cs.package===\'vip\'?[]:q.compositionQuote.lines).forEach')
 s=replace(s,'const lineIds=new Map(p.cart.items.map', "if(q.compositionQuote){const cq=q.compositionQuote;p.cart.quote_pending=true;p.cart.quote_preview={low:cq.total,high:cq.high};p.cart.items[0].quote_preview=q.estimateState.package==='vip'?{low:cq.total,high:cq.high}:{low:cq.work,high:cq.workHigh};p.cart.items[0].quote_pending=true;}\n  const lineIds=new Map(p.cart.items.map")
 s=replace(s,"composition=M.normalize({...composition,product:$('product').value,scope:$('scope').value});return composition;", "composition=M.normalize({...composition,product:$('product').value,scope:$('scope').value});composition.addons=window.SalonEstimate.estimate(composition,{discipline:$('discipline').value,deadline:$('deadline').value},window.SalonEstimate.read(composition)).addons;return composition;")
 s=replace(s,"c.disabled=vip||busy||!!frozenPayload;", "c.disabled=vip||busy||!!frozenPayload||window.SalonEstimate.estimate(cs,{},window.SalonEstimate.read(cs)).primaryAddon===c.value;")
 p.write_text(s)
 def tag(path):return f'<script src="{path}?v={VERSION}&amp;r={digest(output/path)[:16]}"></script>'
 for name,anchor in [('services.html','assets/js/salon-catalogue.js'),('configurator.html','assets/js/salon-order.js')]:
  p=output/name;s=p.read_text();s=replace(s,'</head>',f'<link rel="stylesheet" href="assets/css/salon-services-estimate.css?v={VERSION}&amp;r={digest(output/"assets/css/salon-services-estimate.css")[:16]}"></head>')
  m=re.search(r'<script[^>]*src="'+re.escape(anchor)+r'[^>]*></script>',s);assert m
  s=replace(s,m[0],tag('assets/js/salon-estimate.js')+tag('assets/js/salon-estimate-benefits.js')+tag(anchor))
  if name=='configurator.html':s=replace(s,'</body>',tag('assets/js/salon-estimate-order.js')+'</body>')
  p.write_text(s)
 after=inventory(output);changed=[p for p,h in after.items() if before.get(p)!=h];deleted=sorted(set(before)-set(after));assert not deleted
 allowed={'services.html','configurator.html','assets/js/salon-order.js',*additions.values()};assert set(changed)==allowed,(changed,allowed)
 # Original prices, promotions, loyalty, auth, submit contract and all other files retained.
 for p in ['assets/js/app.js','assets/js/salon-products.js','assets/js/salon-commerce.js','assets/js/salon-benefits.js','sw.js']:assert before[p]==after[p]
 for p in changed:
  if p.endswith('.js'):subprocess.run(['node','--check',str(output/p)],check=True)
 manifest={'version':VERSION,'baseline_release':'release223-reading-9876e933','source_commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'baseline_files':before,'files':after,'changed':changed,'deleted':[]}
 (output.parent/(output.name+'-manifest.json')).write_text(json.dumps(manifest,indent=2)+'\n')
 with tarfile.open(output.parent/(output.name+'-delta.tar.gz'),'w:gz') as archive:
  for p in changed:archive.add(output/p,arcname=p)
 print(json.dumps({'output':str(output),'changed':changed,'files':len(after)}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('baseline',type=Path);p.add_argument('output',type=Path);a=p.parse_args();build(a.baseline,a.output)
