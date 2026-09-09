const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const math=require('../assets/js/salon-benefits.js');
const samples=require('../assets/js/salon-samples.js');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('semester plans subtract membership price and respect per-order caps',()=>{
 const v=math.planComparison(14000,3,'sem');assert.equal(v.plus.net,1101);assert.equal(v.pro.net,1510);
 const cap=math.planComparison(100000,1,'month');assert.equal(cap.plus.discount,1000);assert.equal(cap.pro.discount,3000);
 assert.equal(cap.plus.net,551);assert.equal(cap.pro.net,1810);
 const small=math.planComparison(2500,1,'sem');assert.ok(small.plus.net<0);assert.ok(small.pro.net<0);
});
test('deposit projection follows authoritative integer tier boundaries',()=>{
 for(const [amount,reserve,additional] of [[20000,1600,600],[29000,2320,870],[30000,3000,1500],[44000,4400,2200],[45000,5400,3150],[59000,7080,4130],[60000,9000,6000]]){
  const v=math.depositProjection(amount,amount);assert.equal(v.reserve,reserve,String(amount));assert.equal(v.earned,reserve,String(amount));assert.equal(v.additional,additional,String(amount));assert.equal(v.balance,0);
 }
 const part=math.depositProjection(60000,20000);assert.equal(part.reserve,9000);assert.equal(part.earned,1600);assert.equal(part.additional,600);assert.equal(part.balance,40000);
 assert.equal(math.depositProjection(60000,30000).additional,1500);assert.equal(math.depositProjection(60000,45000).additional,3150);
 assert.equal(math.depositProjection(60000,1012.9).earned,80);assert.equal(math.depositProjection(60000,0).additional,0);
});
test('deposit projection never treats unused reserve as spendable money',()=>{
 for(let amount=20000;amount<=60000;amount+=1000)for(let used=0;used<=amount;used+=1000){
  const v=math.depositProjection(amount,used);assert.equal(v.balance+v.used,v.contribution);assert.ok(v.additional>=0);assert.ok(v.additional<=v.earned);assert.ok(v.earned<=v.reserve);
 }
 const code=read('assets/js/salon-benefits.js');assert.match(code,/Не доступен для оплаты сейчас/);assert.match(code,/bonus\(v.reserve\)/);assert.doesNotMatch(code,/money\(v.reserve\)/);
});
test('three original sample types have complete annotations and real order destinations',()=>{
 assert.deepEqual(Object.keys(samples).sort(),['course','essay','practice']);
 for(const s of Object.values(samples)){
  assert.equal(s.notes.length,3);assert.equal(s.structure.length,5);assert.ok(s.paragraphs.length>=3);
  for(let i=0;i<3;i++)assert.ok(s.paragraphs.some(p=>p.includes('|'+i+']]')));
  assert.ok(['course','essay','practice'].includes(s.product));
 }
 assert.match(read('assets/js/salon-samples.js'),/не клиентские работы/);
});
test('every declared customer page uses the experience shell exactly once',()=>{
 const routes=JSON.parse(read('docs/brain/evidence/salon-product/routes.json'));
 for(const r of routes){if(r.concurrentOwner||r.selfContained)continue;const html=read(r.path);assert.equal((html.match(/assets\/css\/salon-experience.css/g)||[]).length,1,r.path);assert.equal((html.match(/assets\/js\/salon-experience.js/g)||[]).length,1,r.path);assert.match(html,/class="site-header direct-header"/,r.path)}
});
test('private cabinet preserves IDs and loads changed runtime with a new cache identity',()=>{
 assert.match(read('dashboard.html'),/skip-link" href="#accountWorkspace"/);
 assert.match(read('dashboard.html'),/cabinet\.js\?[^"\n]+experience=20260909product1/);
 assert.match(read('assets/js/salon-experience.js'),/if\(main&&!main.id\)/);
 const cabinet=read('assets/js/cabinet.js');assert.doesNotMatch(cabinet,/stage - 0\.35|o\.step - 0\.35|Пройдено по делу:.*pct/);
 assert.match(cabinet,/var action = caseContextFor\(o\).action/);
});
test('shared selection stores finite choices only and search is local',()=>{
 const code=read('assets/js/salon-experience.js');assert.doesNotMatch(code,/fetch\(|sendBeacon\(|localStorage\.setItem/);
 const block=code.slice(code.indexOf('function publishChoice'),code.indexOf('let trail'));
 assert.doesNotMatch(block,/topic|contact|email|files|consent/);assert.match(block,/P\?\.products.some/);
 assert.match(code,/input.value.toLocaleLowerCase/);assert.doesNotMatch(code,/sessionStorage.setItem\([^)]*input.value/);
});
test('new interactions support keyboard, reduced motion and no-JS routing',()=>{
 const css=read('assets/css/salon-experience.css');assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(read('assets/js/salon-samples.js'),/ArrowRight/);assert.match(read('assets/js/salon-samples.js'),/aria-controls/);
 for(const p of ['samples.html','benefits.html']){assert.match(read(p),/href="configurator.html"|href="plus.html/);assert.match(read(p),/analytics-attribution-v2/)}
});
