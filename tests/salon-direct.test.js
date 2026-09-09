const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const P=require('../assets/js/salon-products');
const source=read('assets/js/salon-order.js');
const app=read('assets/js/app.js');
const sandbox={window:{}};
vm.runInNewContext(app.slice(app.indexOf('var SalonCalc ='),app.indexOf('window.SalonCalc = SalonCalc;'))+'this.C=SalonCalc',sandbox);
const C=sandbox.C;
const selectionSource=source.slice(source.indexOf('function selected(){'),source.indexOf('function renderQuestions(){'));
function selected(id,scope,service=null){const fields={scope:{value:scope},discipline:{value:'hum'}};const ctx={product:()=>P.get(id),$:id=>fields[id],term:()=> 'free',service};vm.runInNewContext(selectionSource+';this.result=selected()',ctx);return ctx.result}
test('every priced work matches the actual complete-project tariff, not diagnostic',()=>{for(const p of P.products.filter(p=>p.price))assert.equal(p.price,C.types.find(t=>t.id===p.type).prices.support,p.id)});
test('all 12 categories have explicit deliverables and timing',()=>{assert.equal(P.products.length,12);assert.equal(new Set(P.products.map(p=>p.id)).size,12);for(const p of P.products){assert.ok(p.detail.length>30);assert.ok(p.days)}});
test('whole work sends support tier for every canonical work',()=>{for(const p of P.products.filter(p=>p.price)){const r=selected(p.id,p.id==='chapter'?'part':'whole');assert.equal(r.type,p.type);assert.equal(r.tier,'vip')}});
test('partial thesis is custom rather than the full thesis price',()=>{for(const id of ['course','diplom','master','kandidat'])assert.equal(selected(id,'part').type,'custom')});
test('unclassified editing never silently becomes a course order',()=>assert.equal(selected('editing','editing').type,'custom'));
test('explicit diagnostic selection remains available without becoming a prerequisite',()=>{const a=selected('kandidat','diagnostic');assert.equal(a.type,'kandidat');assert.equal(a.tier,'base');assert.equal(selected('kandidat','whole').tier,'vip')});
test('named chapter remains a separate supported work type',()=>assert.equal(selected('chapter','part').type,'chapter'));
test('each public card targets a selectable product and all internal files exist',()=>{for(const route of fs.readdirSync(root).filter(p=>p.endsWith('.html')&&read(p).includes('salon-direct concept-shell'))){const html=read(route);for(const [,href]of html.matchAll(/href="([^"]+)"/g)){if(/^(https?:|#)/.test(href))continue;const file=href.split('?')[0].split('#')[0];if(file&&file!=='/')assert.ok(fs.existsSync(path.join(root,file)),route+': '+file)}assert.match(html,/<meta name="referrer" content="no-referrer">/)}for(const [,id]of read('services.html').matchAll(/configurator.html\?product=([a-z]+)/g))assert.ok(P.products.some(p=>p.id===id),id)});
test('direct form has explicit consent, no prechecked agreement and correct shared helper',()=>{const html=read('configurator.html');assert.doesNotMatch(html,/type="checkbox"[^>]*checked/);assert.match(html,/id="participation"/);assert.match(source,/S\.orderContract\.submit\('configurator',frozenPayload,25000\)/);assert.doesNotMatch(source,/client_request_id\s*:/)});
test('serializer preserves detailed existing package contracts without reading a saved cart',()=>{assert.match(source,/cart\.payload\(\)/);assert.doesNotMatch(source,/SalonCart\.init\(/);assert.match(source,/practice_draft_/);assert.match(source,/psychology_full_vip/)});
test('only finite selection state is persisted; entered content stays in memory',()=>{const persisted=source.match(/sessionStorage\.setItem\(draftKey,JSON.stringify\((.*?)\)\)/s)[1];for(const sensitive of ['topic','contact','name','details','consent','file','volume'])assert.ok(!persisted.includes(sensitive),sensitive)});
test('request agreement is read from the HTML contract consumed by production smoke',()=>{const m=read('configurator.html').match(/consent_doc:\s*'([^']+)'/);assert.ok(m);assert.equal(m[1],'consent-request 1.0 · privacy 3.1 · oferta 3.2');assert.match(source,/consent_doc:window.SalonDirectContract.consent_doc/)});

test('every redesigned route retains analytics exclusion before the shared runtime',()=>{const routes=fs.readdirSync(root).filter(p=>p.endsWith('.html')&&read(p).includes('salon-direct concept-shell'));assert.equal(routes.length,26);for(const p of routes){const h=read(p);assert.ok(h.indexOf('configurator-nav-guard.js')<h.indexOf('assets/js/app.js'),p);assert.match(h,/analytics-v2.js\?v=20260829analytics4/);}});
test('contact requires an answer channel and remains private',()=>{const h=read('priyomnaya.html');assert.match(h,/id="supportContact" type="email" required/);assert.doesNotMatch(h,/novalidate/);assert.match(h,/id="supportQuiet" type="checkbox" checked hidden/);assert.ok(h.indexOf('</form>')<h.indexOf('id="supportSuccess"'));});

test('one-time remarks handoff rejects expired, future and oversized content',()=>{const ctx={};vm.runInNewContext(source.slice(source.indexOf('function validRemarks('),source.indexOf('function consumeHandoff('))+';this.remarks=validRemarks;this.commission=validCommission',ctx);const now=1000000;const rec={v:1,kind:'remarks',text:'Синтетические замечания для проверки переноса в новую заявку.',created_at:now};assert.equal(ctx.remarks(rec,now),rec.text);for(const patch of [{v:2},{created_at:now-600001},{created_at:now+1},{text:'коротко'},{text:'x'.repeat(801)}])assert.equal(ctx.remarks({...rec,...patch},now),'');const c={version:1,work:'master',source:'comments',topic:'Синтетическая тема',savedAt:now};assert.equal(ctx.commission(c,now).work,'master');for(const patch of [{work:'other'},{source:'topic'},{savedAt:now-600001},{topic:'x'.repeat(241)}])assert.equal(ctx.commission({...c,...patch},now),null);});
