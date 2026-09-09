const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const script=path.resolve('scripts/build-production-release.py');
test('frozen public artifact excludes private source and fixtures, retains viewer, busts cache and pins live referral terms',()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'salon-build-test-')),repo=path.join(base,'repo');fs.mkdirSync(repo);
 try{
  const put=(n,s)=>{fs.mkdirSync(path.dirname(path.join(repo,n)),{recursive:true});fs.writeFileSync(path.join(repo,n),s)};
  const page='<head><link rel="manifest" href="manifest.webmanifest?v=20260806shell123"><script src="assets/js/app.js?v=old&amp;flag=keep"></script><script src="assets/js/cabinet-demo.js"></script></head>';
  for(const n of ['index.html','dashboard.html','configurator.html'])put(n,page.replace('</head>', '<link rel="canonical" href="https://akademsalon.ru/'+(n==='index.html'?'':n)+'">'+(n==='index.html'?'':'<meta name="robots" content="noindex,follow">')+'</head>'));
  put('assets/js/app.js',"const dynamic='mobile.css?v=20260806shell123'");put('sw.js',"const VERSION = '20260806shell123'");
  put('manifest.webmanifest','{}');put('assets/vendor/pdfjs/pdf.min.mjs','viewer');put('assets/vendor/pdfjs/pdf.worker.min.mjs','worker');put('assets/samples/example.pdf','document');
  for(const n of ['.env','package.json','AGENTS.md','assets/.secret','assets/._document.pdf','backend/customer.txt','assets/js/cabinet-demo.js','docs/brain/private.txt'])put(n,'must-not-publish');
  put('scripts/legal-presentation.py',fs.readFileSync('scripts/legal-presentation.py','utf8'));put('priyomnaya.html',fs.readFileSync('priyomnaya.html','utf8'));
  for(const n of ['samples.html','benefits.html','services.html'])put(n,'<head><link rel="canonical" href="https://akademsalon.ru/'+n+'"></head>');
  put('tariffs.html','<head><link rel="canonical" href="https://akademsalon.ru/services.html"></head>');
  put('referral.html','unactivated1000');put('referral-rules.html','unactivated1000');
  execFileSync('git',['init','-q'],{cwd:repo});execFileSync('git',['add','.'],{cwd:repo});execFileSync('git',['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture'],{cwd:repo});
  const ref=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
  put('assets/js/app.js','DIRTY MUST NOT SHIP');
  const old=path.join(base,'legacy.html');fs.writeFileSync(old,'<html><head><title>Правила</title><link rel="canonical" href="https://akademsalon.ru/referral.html"></head><body><main><h1>200 бонусов</h1><p>первый заказ полностью оплачен</p></main></body></html>');
  const out=path.join(base,'public');const result=JSON.parse(execFileSync('python3',[script,'--repo',repo,'--ref',ref,'--legacy-referral',old,'--output',out],{encoding:'utf8'}));
  const manifest=JSON.parse(fs.readFileSync(result.manifest));assert.equal(result.source_commit,ref);
  const referral=fs.readFileSync(path.join(out,'referral.html'),'utf8');assert.match(referral, /data-legal-reader/);assert.match(referral, /<h1>200 бонусов<\/h1><p>первый заказ полностью оплачен<\/p>/);assert.doesNotMatch(referral,/unactivated1000/);
  const built=fs.readFileSync(path.join(out,'dashboard.html'),'utf8');assert.match(built,/flag=keep&amp;r=[a-f0-9]{16}/);assert.doesNotMatch(built,/cabinet-demo|__site-preview/);
  assert.match(built,new RegExp('production-'+ref.slice(0,12)));assert.doesNotMatch(fs.readFileSync(path.join(out,'assets/js/app.js'),'utf8'),/DIRTY/);
  assert.ok(manifest.files['assets/vendor/pdfjs/pdf.worker.min.mjs']);assert.ok(manifest.files['assets/samples/example.pdf']);
  assert.equal(Object.keys(manifest.files).some(n=>/secret|customer|brain|cabinet-demo|package|AGENTS|\._/.test(n)),false);
  const sitemap=fs.readFileSync(path.join(out,'sitemap.xml'),'utf8');
  for(const route of ['samples.html','benefits.html','services.html','referral.html'])assert.match(sitemap,new RegExp('https://akademsalon.ru/'+route));
  assert.doesNotMatch(sitemap,/dashboard|configurator|tariffs|referral-rules|\?token/);
  assert.equal((sitemap.match(/<loc>https:\/\/akademsalon.ru\/services.html<\/loc>/g)||[]).length,1);
  const unpack=path.join(base,'unpack');fs.mkdirSync(unpack);execFileSync('tar',['-xzf',result.archive,'-C',unpack]);
  const crypto=require('node:crypto');for(const [n,h] of Object.entries(manifest.files))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(unpack,n))).digest('hex'),h);
  assert.throws(()=>execFileSync('python3',[script,'--repo',repo,'--ref',ref,'--legacy-referral',old,'--output',out],{stdio:'pipe'}));
 }finally{fs.rmSync(base,{recursive:true,force:true})}
});
test('service worker never caches authenticated private routes with or without .html',()=>{
 const sw=fs.readFileSync('sw.js','utf8');const literal=sw.match(/const PRIVATE_PAGES = (.+);/)[1];const re=require('node:vm').runInNewContext(literal);
 for(const p of ['/dashboard','/dashboard.html','/admin','/admin-analytics.html','/oplaceno','/dashboard/'])assert.equal(re.test(p),true,p);
 assert.equal(re.test('/services.html'),false);
});
