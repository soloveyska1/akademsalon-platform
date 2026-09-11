const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const site=process.env.SALON_SEO_SITE_DIR;
const baseline=process.env.SALON_SEO_BASELINE;
const root=path.resolve(__dirname,'..');
const run=(name,fn)=>test(name,{skip:!site},fn);
const read=f=>fs.readFileSync(path.join(site,f),'utf8');
const files=()=>fs.readdirSync(site).filter(f=>f.endsWith('.html'));
const ld=s=>[...s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));
const nodes=x=>Array.isArray(x)?x.flatMap(nodes):x&&typeof x==='object'?[x,...Object.values(x).flatMap(nodes)]:[];
const canon=s=>s.match(/<link rel="canonical" href="([^"]+)"/)[1];
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

test('SEO overlay is declared independently of product HTML and runtime',()=>{
 const source=fs.readFileSync(path.join(root,'scripts/salon-seo/build.py'),'utf8');
 assert.match(source,/assert baseline!=out/);
 assert.match(source,/assert not out.exists/);
 assert.match(source,/shutil.copytree\(baseline,out\)/);
});
run('all sitemap pages retain indexability, unique metadata and self canonical',()=>{
 const urls=[...read('sitemap.xml').matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);
 assert.equal(urls.length,77);assert.equal(new Set(urls).size,77);
 const titles=new Set(),descriptions=new Set();
 for(const url of urls){
  const f=new URL(url).pathname==='/'?'index.html':new URL(url).pathname.slice(1),s=read(f);
  assert.equal(canon(s),url,f);assert.doesNotMatch(s,/<meta[^>]+name="robots"[^>]+noindex/i,f);
  const title=s.match(/<title>(.*?)<\/title>/s)[1],desc=s.match(/<meta name="description" content="([^"]+)"/)[1];
  assert.ok(!titles.has(title),`duplicate title: ${f}`);titles.add(title);
  assert.ok(!descriptions.has(desc),`duplicate description: ${f}`);descriptions.add(desc);
  assert.ok(title.length>=12&&title.length<115,`${f}: title length`);assert.ok(desc.length>55,`${f}: description length`);
 }
});
run('icons are square, sufficiently large and consistent across every HTML page',()=>{
 for(const n of [16,32,48,96,120,180,192,512]){
  const b=fs.readFileSync(path.join(site,`assets/img/seo-20260911/icon-${n}.png`));
  assert.equal(b.readUInt32BE(16),n);assert.equal(b.readUInt32BE(20),n);
 }
 for(const f of files()){
  const s=read(f);assert.match(s,/href="\/favicon.svg" type="image\/svg\+xml"/,f);
  assert.match(s,/seo-20260911\/icon-180.png" sizes="180x180"/,f);
  assert.doesNotMatch(s,/<link[^>]+(?:assets\/img\/favicon\.svg|href="assets\/img\/(?:apple-touch-icon|icon-192))/,f);
 }
 const m=JSON.parse(read('manifest.webmanifest'));assert.equal(m.theme_color,'#5136b5');
 for(const icon of m.icons)assert.ok(icon.src.startsWith('/assets/img/seo-20260911/'));
 assert.ok(m.icons.some(i=>i.purpose==='maskable'));
});
run('all structured data parses and organization references have one identity',()=>{
 for(const f of files()){
  for(const doc of ld(read(f))){
   assert.ok(!JSON.stringify(doc).includes('https://akademsalon.ru/#org"'),f);
   for(const n of nodes(doc))if(n['@type']==='BreadcrumbList')for(const i of n.itemListElement)assert.notEqual(i.item,'https://akademsalon.ru/tariffs.html',f);
  }
 }
 const home=ld(read('index.html')).flatMap(nodes);
 assert.ok(home.some(n=>n['@type']==='WebSite'&&n.name==='Академический Салон'));
 assert.ok(home.some(n=>n['@type']==='Organization'&&n['@id']==='https://akademsalon.ru/#organization'));
});
run('social images exist, match declared dimensions and use current identity',()=>{
 for(const f of files()){
  const s=read(f),image=s.match(/<meta property="og:image" content="([^"]+)"/)[1];
  assert.ok(image.startsWith('https://akademsalon.ru/assets/img/seo-20260911/'),f);
  const b=fs.readFileSync(path.join(site,new URL(image).pathname));
  assert.equal(b.readUInt32BE(16),1200);assert.equal(b.readUInt32BE(20),630);
  assert.match(s,/<meta property="og:image:width" content="1200">/);
  assert.match(s,/<meta property="og:image:height" content="630">/);
 }
});
run('previously isolated service pages and seven-day guide have visible incoming links',()=>{
 for(const f of ['razbor-zamechaniy-nauchruka.html','komissiya-0.html','guide-kursovaya-za-nedelyu.html']){
  const incoming=files().filter(other=>other!==f&&new RegExp(`href="/?${f.replaceAll('.','\\.')}"`).test(read(other)));
  assert.ok(incoming.length>=3,`${f}: ${incoming.length} links`);
 }
 for(const f of ['kursovaya-rabota.html','diplomnaya-rabota.html','otchet-po-praktike.html','referat.html'])assert.ok(read('index.html').includes(`href="/${f}"`));
});
run('contextual order buttons preserve formatting and defense intent',()=>{
 for(const [f,service] of Object.entries({'guide-prilozheniya-po-gost.html':'nm','guide-prezentaciya-k-zashchite.html':'df','guide-zashchita-diploma.html':'df'})){
  const main=read(f).match(/<main[\s\S]*?<\/main>/)[0];
  assert.doesNotMatch(main,/href="configurator.html"/,f);assert.ok(main.includes(`configurator.html?service=${service}`));
 }
 const s=read('razbor-zamechaniy-nauchruka.html');
 assert.match(s,/product=course&amp;result=editing/);assert.match(s,/product=diplom&amp;result=editing/);
 assert.doesNotMatch(read('guide-kursovaya-za-nedelyu.html'),/Мастерская не выполняет содержательную часть/);
});
run('existing local HTML and static asset references resolve',()=>{
 for(const f of files()){
  for(const m of read(f).matchAll(/\b(?:href|src)="([^"<>]+)"/g)){
   const raw=m[1].replaceAll('&amp;','&');
   if(/^(?:https?:|data:|mailto:|tel:|#|javascript:)/.test(raw))continue;
   const p=new URL(raw,'https://akademsalon.ru/'+f).pathname;
   if(p.startsWith('/api/')||p==='/')continue;
   if(/\.(?:html|svg|png|css|js|webmanifest)$/.test(p))assert.ok(fs.existsSync(path.join(site,p)),`${f}: ${p}`);
  }
 }
});
run('private flows, prices, backend and runtime are preserved; cache refresh is isolated',()=>{
 assert.ok(baseline,'set SALON_SEO_BASELINE for source parity');
 const report=JSON.parse(fs.readFileSync(path.join(root,'docs/brain/evidence/salon-seo-20260911/build.json')));
 assert.deepEqual(report.deleted,[]);
 for(const f of Object.keys(report.baseline_files)){
  if(f.startsWith('assets/js/')||f.startsWith('assets/vendor/')||f.startsWith('assets/fonts/'))assert.equal(hash(path.join(site,f)),hash(path.join(baseline,f)),f);
 }
 for(const f of ['configurator.html','dashboard.html','admin.html','oplaceno.html']){
  const body=s=>s.slice(s.indexOf('<body'));
  const b=body(fs.readFileSync(path.join(baseline,f),'utf8')).replaceAll('production-59f998595ea5','seo-20260911-v1');
  const a=body(read(f));assert.equal(a,b,`${f}: body/runtime must not change`);
  assert.match(read(f),/<meta[^>]+name="robots"[^>]+noindex/);
 }
 const beforeSw=fs.readFileSync(path.join(baseline,'sw.js'),'utf8');
 assert.equal(read('sw.js'),beforeSw.replaceAll('production-59f998595ea5','seo-20260911-v1'));
});
run('only substantive content changes update Article dates',()=>{
 assert.ok(baseline);
 for(const f of ['guide-recenziya-na-vkr.html','guide-temy-vkr.html','guide-prezentaciya-k-zashchite.html']){
  const old=ld(fs.readFileSync(path.join(baseline,f),'utf8')).flatMap(nodes).find(n=>n['@type']==='Article');
  const now=ld(read(f)).flatMap(nodes).find(n=>n['@type']==='Article');
  assert.equal(now.dateModified,old.dateModified,f);
 }
 for(const f of ['guide-kursovaya-za-nedelyu.html','guide-vvedenie-kursovoy.html','guide-zashchita-diploma.html']){
  assert.equal(ld(read(f)).flatMap(nodes).find(n=>n['@type']==='Article').dateModified,'2026-09-11');
  assert.match(read(f),/Обновлено 11 сентября 2026/);
 }
 assert.match(read('feed.xml'),/<updated>2026-09-11T00:00:00Z<\/updated>/);
});
