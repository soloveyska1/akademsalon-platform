// Isolated browser regression: routes ALL requests, never contacts production.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
const require=createRequire((process.env.SALON_NODE_DEPS||'/Users/saymurrbk.ru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')+'/package.json');const {chromium}=require('playwright');
const root=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]);fs.mkdirSync(output,{recursive:true});
const serverContract=JSON.parse(fs.readFileSync(process.argv[4]||'docs/brain/evidence/salon-comfort-20260924/server-contract.json'));
const browser=await chromium.launch({headless:true,channel:'chrome'});const results=[];
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const privateTopic='SYNTHETIC_PRIVATE_TOPIC_SENTINEL',privateContact='synthetic@example.invalid';
async function setup(opts={}){
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:opts.width||1440,height:900},colorScheme:opts.theme||'light',timezoneId:'Europe/Moscow',reducedMotion:opts.reduced?'reduce':'no-preference'});
 const calls=[],events=[],orders=[],uploads=[],errors=[];let response=opts.response||'ok';
 await context.addInitScript(({opts})=>{
  const now=Date.now();localStorage.setItem('salon_consent',JSON.stringify({v:3,analytics:opts.consent!==false,at:new Date(now-60000).toISOString(),expiresAt:new Date(now+86400000).toISOString()}));
  localStorage.setItem('salon_theme',opts.theme||'light');
  if(opts.owner)localStorage.setItem('salon_analytics_owner_device_v1',JSON.stringify({v:1}));
  if(opts.qa)sessionStorage.setItem('salon_analytics_qa_session_v1','1');
  if(opts.saved)sessionStorage.setItem('salon_direct_selection_v1',JSON.stringify({product:'master',scope:'editing',discipline:'law',deadline:'2030-01-01'}));
 },{opts});
 await context.route('**/*',async route=>{
  const r=route.request(),u=new URL(r.url());
  if(u.hostname!=='akademsalon.ru')return route.abort();
  if(u.pathname.startsWith('/api/')){
   calls.push({path:u.pathname,body:r.postData(),headers:r.headers()});
   if(u.pathname==='/api/analytics/grant')return route.fulfill({json:{ok:true,grant:'synthetic-test-grant-123456',expires_at:Math.floor((opts.now?Date.parse(opts.now):Date.now())/1000)+3600}});
   if(u.pathname==='/api/analytics/events'){let b=r.postDataJSON();events.push(...b.events);return route.fulfill({json:{ok:true,processed:b.events.map(e=>e.event_id)}})}
   if(u.pathname==='/api/orders'){
    orders.push(r.postDataJSON());await new Promise(r=>setTimeout(r,120));
    if(response==='network')return route.abort('connectionfailed');
    if(response==='malformed')return route.fulfill({json:{ok:true}});
    if(typeof response==='number')return route.fulfill({status:response,json:{ok:false,error:response===400?'bad_input':response===409?'conflict':'unavailable'}});
    return route.fulfill({json:{ok:true,id:712345,token:'SYNTHETIC_ORDER_TOKEN_123456'}});
   }
   if(/\/orders\/\d+\/upload$/.test(u.pathname)){uploads.push(r.postDataBuffer().toString());return route.fulfill({status:uploads.length===1?503:200,json:{ok:uploads.length!==1}})}
   return route.fulfill({json:{ok:true,authenticated:false,pay_online:true}});
  }
  const f=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
  if(!f.startsWith(root+'/')||!fs.existsSync(f))return route.abort();
  return route.fulfill({path:f,contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp'})[path.extname(f)]||'application/octet-stream'});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 async function flush(){for(let i=0;i<3;i++){await page.waitForTimeout(300);await page.evaluate(()=>window.dispatchEvent(new Event('online')))}await page.waitForTimeout(200)}
 function names(){return events.map(e=>e.event)}
 async function valid(){await page.locator('#topic').fill(privateTopic);await page.locator('#contact').fill(privateContact);await page.locator('#consent').check();if(await page.locator('#participation').isVisible())await page.locator('#participation').check()}
 async function privacy(){
  await flush();assert.deepEqual(errors,[]);
  for(const c of calls.filter(c=>c.path.startsWith('/api/analytics/'))){assert(!/SYNTHETIC_PRIVATE|synthetic@example|SYNTHETIC_ORDER_TOKEN|private-file/.test(c.body||''));assert(!c.headers.cookie)}
  for(const e of events){assert(serverContract.events[e.event],e.event);if(e.cta_id)assert(serverContract.cta_values.includes(e.cta_id),e.cta_id);assert.equal(e.page,'/configurator.html');}
 }
 return {context,page,calls,events,orders,uploads,errors,flush,names,valid,privacy,setResponse(v){response=v}};
}
async function test(name,fn){if(process.env.SALON_TEST_FILTER&&!new RegExp(process.env.SALON_TEST_FILTER).test(name))return;try{await fn();results.push({name,status:'PASS'});console.log('PASS '+name)}catch(e){results.push({name,status:'FAIL',error:e.message});console.error('FAIL '+name+' '+e.message);process.exitCode=1}}
const plan='https://akademsalon.ru/configurator.html?service=pl&work=course';
async function choose(page,id,label){const wrap=page.locator('.salon-select').filter({has:page.locator('#'+id)});await wrap.locator('.salon-select-trigger').evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));await page.waitForTimeout(60);await wrap.locator('.salon-select-trigger').click();await wrap.getByRole('option',{name:label,exact:true}).click()}const route='https://akademsalon.ru/configurator.html';
async function open(x,url=route){await x.page.goto(url);await x.page.evaluate(()=>document.fonts.ready);await x.page.waitForTimeout(120)}
async function brief(p){await p.locator('#intake-task-details > summary').click()}
const chip=(p,label)=>p.getByRole('button',{name:'Добавить пункт: '+label,exact:true});

const evidence=[];
const expected=JSON.parse(fs.readFileSync('/tmp/salon-intake-functional-review/baseline-contract.json'));
const norm=s=>s.replace(/\s+/g,' ').replace(/\s+([,.])/g,'$1').trim();
async function scenario(name,width,fn,opts={}){
 const x=await setup({width,consent:false,reduced:true,...opts});
 let note={name,width,status:'RUNNING'};evidence.push(note);
 try{await open(x);await fn(x,note);assert.deepEqual(x.errors,[]);await x.privacy();note.status='PASS';console.log('PASS '+name+' '+width)}
 catch(e){note.status='FAIL';note.error=e.stack;console.error('FAIL '+name+' '+width+' '+e.message);process.exitCode=1;try{await x.page.screenshot({path:path.join(output,name+'-'+width+'-failure.png'),fullPage:true})}catch{}}
 finally{note.syntheticOrderCount=x.orders.length;await x.context.close();fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({root,data:'Every request intercepted; synthetic API; isolated Chrome; contexts closed after each test',results:evidence},null,2))}
}
async function scope(x,value){const label=await x.page.locator('#scope option[value="'+value+'"]').textContent();await choose(x.page,'scope',label)}
async function product(x,value){const label=await x.page.locator('#product option[value="'+value+'"]').textContent();await choose(x.page,'product',label)}
try{
 for(const width of [390,1440]){
  await scenario('contact-format-raw-value-and-union',width,async(x,n)=>{
   const p=x.page;const rows=[];
   for(const [value,mode]of [['  @synthetic_review  ','telegram'],[' synthetic+review@example.invalid ','email'],['+7 (900) 001-20-30','phone'],['https://vk.com/id12345678901','vk']]){
    await p.locator('#contact').fill(value);await p.waitForTimeout(30);
    assert.equal(await p.locator('#contact').inputValue(),value);
    assert.equal(await p.locator('[data-contact-mode][aria-pressed=true]').count(),1);
    assert.equal(await p.locator('[data-contact-mode='+mode+']').getAttribute('aria-pressed'),'true');
    rows.push({raw:value,mode,format:await p.locator('#ic-contact-format').textContent()});
   }
   assert.equal(await p.locator('#contact').getAttribute('pattern'),null);assert.equal(await p.locator('#contact').getAttribute('type'),null);
   assert.equal(await p.locator('#contact').getAttribute('maxlength'),'200');assert(await p.locator('#contact').evaluate(e=>e.required));
   await p.locator('#contact').fill('  synthetic+review@example.invalid  ');
   await p.locator('[data-contact-mode=phone]').focus();await p.keyboard.press('Enter');
   assert.equal(await p.locator('#contact').inputValue(),'  synthetic+review@example.invalid  ');
   assert(await p.locator('#contact').evaluate(e=>e===document.activeElement));
   assert.equal(await p.locator('[data-contact-mode=phone]').getAttribute('aria-pressed'),'true');
   assert(!await p.evaluate(()=>JSON.stringify({l:{...localStorage},s:{...sessionStorage}}).includes('synthetic+review')));
   await p.locator('#topic').fill('Synthetic contact union');await p.locator('#consent').check();if(await p.locator('#participation').isVisible())await p.locator('#participation').check();
   await p.locator('#send-order').press('Enter');await p.locator('#order-success:visible').waitFor();
   assert.equal(x.orders.length,1);assert.equal(x.orders[0].contact,'synthetic+review@example.invalid');n.formats=rows;n.payloadContact=x.orders[0].contact;
  });
  await scenario('brief-selection-boundary-undo-and-template',width,async(x,n)=>{
   const p=x.page;await brief(p);const seed='Мой исходный текст.\nВторая строка и требования.';const prefix='Требования к источникам: ';
   await p.locator('#details').fill(seed);await p.locator('#details').evaluate(e=>e.setSelectionRange(4,18));
   await chip(p,'Источники').click();assert.equal(await p.locator('#details').inputValue(),seed+'\n\n'+prefix);
   assert(await p.locator('#details').evaluate(e=>e===document.activeElement&&e.selectionStart===e.value.length&&e.selectionEnd===e.value.length));
   await chip(p,'Источники').click();assert.equal(await p.locator('#details').inputValue(),seed+'\n\n'+prefix);
   await p.locator('.ic-brief-undo').click();assert.equal(await p.locator('#details').inputValue(),seed);
   const boundary='Я'.repeat(12000-prefix.length-2);await p.locator('#details').fill(boundary);await chip(p,'Источники').click();assert.equal((await p.locator('#details').inputValue()).length,12000);
   assert.match(await p.locator('#polish-count-details').textContent(),/лимит/);await p.locator('.ic-brief-undo').click();assert.equal(await p.locator('#details').inputValue(),boundary);
   await p.locator('#details').fill('Я'.repeat(12000));await chip(p,'Что уже есть').click();assert.equal((await p.locator('#details').inputValue()).length,12000);assert.match(await p.locator('#ic-brief-message').textContent(),/не хватает места/);
   await p.locator('#details').fill('');await chip(p,'Структура').focus();await p.keyboard.press('Enter');assert.equal(await p.locator('#details').inputValue(),'Структура работы: ');assert(!await p.locator('#intake-use-topic').isVisible());
   await p.locator('#details').pressSequentially('Две главы');assert(!await p.locator('.ic-brief-undo').isVisible());assert(!await p.locator('#intake-use-topic').isVisible());
   await p.locator('#details').fill('Тема моей работы\nНастоящий текст');assert(await p.locator('#intake-use-topic').isVisible());await p.locator('#intake-use-topic').press('Enter');assert.equal(await p.locator('#topic').inputValue(),'Тема моей работы');
   n.limit=12000;n.selectedTextPreserved=true;n.templateNotPromoted=true;
  });
  await scenario('legal-text-links-and-dynamic-scope',width,async(x,n)=>{
   const p=x.page;assert.equal(await p.evaluate(()=>SalonDirectContract.consent_doc),expected.consent_doc);
   for(const c of expected.consents){const row=p.locator('label.check-row').filter({has:p.locator('#'+c.id)});assert.equal(norm(await row.locator('.ic-consent-text').textContent()),norm(c.text));assert.deepEqual(await row.locator('a').evaluateAll(a=>a.map(e=>e.getAttribute('href'))),c.links);assert(!await p.locator('#'+c.id).isChecked())}
   const consentRow=p.locator('label.check-row').filter({has:p.locator('#consent')});
   const popupPromise=p.waitForEvent('popup');await consentRow.locator('a[href="privacy.html"]').click();const popup=await popupPromise;await popup.waitForLoadState();assert(popup.url().includes('/privacy.html'));await popup.close();assert(!await p.locator('#consent').isChecked());
   await consentRow.locator('.ic-consent-title').click();assert(await p.locator('#consent').isChecked());await p.locator('#consent').focus();await p.keyboard.press('Space');assert(!await p.locator('#consent').isChecked());
   await p.locator('#intake-settings > summary').click();await scope(x,'editing');assert(!await p.locator('#participation-row').isVisible());assert(!await p.locator('#participation').evaluate(e=>e.required));
   await scope(x,'whole');assert(await p.locator('#participation-row').isVisible());assert(await p.locator('#participation').evaluate(e=>e.required));assert(!await p.locator('#participation').isChecked());
   await product(x,'service:psychologyvip');assert(await p.locator('#anonymous-row').isVisible());assert(await p.locator('#anonymous-data').evaluate(e=>e.required));assert(!await p.locator('#anonymous-data').isChecked());
   await p.locator('#topic').fill('Synthetic psychology');await p.locator('#contact').fill('synthetic@example.invalid');await p.locator('#consent').check();await p.locator('#participation').check();await p.locator('#send-order').press('Enter');await p.waitForTimeout(180);assert.equal(x.orders.length,0,'unchecked anonymization blocks POST');
   await product(x,'course');await scope(x,'editing');assert(!await p.locator('#anonymous-row').isVisible());assert(!await p.locator('#anonymous-data').evaluate(e=>e.required));
   await p.locator('#send-order').press('Enter');await p.locator('#order-success:visible').waitFor();assert.equal(x.orders.length,1);assert.equal(x.orders[0].academic_submode,'A1');assert.equal(x.orders[0].consent_doc,expected.consent_doc);n.hiddenConsentsBlock=false;
  });
  await scenario('all-optional-fields-payload-and-keyboard',width,async(x,n)=>{
   const p=x.page;await p.locator('#intake-settings > summary').click();await scope(x,'editing');await brief(p);
   const requirements='  SYNTHETIC_PRIVATE exact requirements\nСписок — с пунктуацией.  ';
   await p.locator('#details').fill(requirements);await p.locator('#name').fill('  Synthetic Reviewer  ');
   await p.locator('.intake-personal > summary').focus();await p.keyboard.press('Enter');assert(await p.locator('#promo').isVisible());
   await p.locator('#promo').fill('  REVIEW-PROMO  ');await p.locator('#gift').fill('  REVIEW-GIFT  ');assert.match(await p.locator('.intake-personal > summary small').textContent(),/2 кода/);
   await p.locator('.intake-personal > summary').press('Enter');assert(!await p.locator('#promo').isVisible());
   await p.locator('#contact').fill('synthetic@example.invalid');await p.locator('#contact').press('Tab');assert(await p.locator('#name').evaluate(e=>e===document.activeElement));
   await p.locator('#topic').fill('  Synthetic optional payload  ');await p.locator('#consent').focus();await p.keyboard.press('Space');
   const storage=await p.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}));assert(!/SYNTHETIC_PRIVATE|Synthetic Reviewer|REVIEW-PROMO|REVIEW-GIFT|synthetic@example/.test(JSON.stringify(storage)));
   await p.locator('.intake-contact').screenshot({path:path.join(output,'contact-'+width+'.png')});await p.locator('#send-order').press('Enter');await p.locator('#order-success:visible').waitFor();
   const o=x.orders[0];assert.equal(o.name,'Synthetic Reviewer');assert.equal(o.promo,'REVIEW-PROMO');assert.equal(o.gift,'REVIEW-GIFT');assert.equal(o.topic,'Synthetic optional payload');assert(o.details.includes(requirements.trim()));
   assert.equal(o.privacy_notice_ack,true);assert.equal(o.consent,true);fs.writeFileSync(path.join(output,'payload-'+width+'.json'),JSON.stringify(o,null,2));n.payloadKeys=Object.keys(o);
  });
  await scenario('empty-optionals-and-503-frozen-idempotent-retry',width,async(x,n)=>{
   const p=x.page;await brief(p);await p.locator('#details').fill('SYNTHETIC_PRIVATE stable retry');await chip(p,'Что исправить').click();await x.valid();
   await p.locator('#send-order').press('Enter');await p.locator('#form-message:visible').waitFor();await p.waitForTimeout(40);assert.equal(x.orders.length,1);
   const before=await p.locator('#details').inputValue();const contact=await p.locator('#contact').inputValue();
   for(const el of await p.locator('#direct-order input:not(#website),#direct-order select,#direct-order textarea').all())assert(await el.isDisabled(),'form control frozen');
   for(const el of await p.locator('[data-contact-mode],.ic-brief-chip,.ic-brief-undo').all())assert(await el.isDisabled(),'helper frozen');
   await p.locator('.ic-brief-undo').evaluate(e=>{e.disabled=false;e.click()});await chip(p,'Источники').evaluate(e=>{e.disabled=false;e.click()});await p.locator('[data-contact-mode=phone]').evaluate(e=>{e.disabled=false;e.click()});
   assert.equal(await p.locator('#details').inputValue(),before);assert.equal(await p.locator('#contact').inputValue(),contact);
   assert.equal(x.orders[0].name,'');assert(!('promo'in x.orders[0]));assert(!('gift'in x.orders[0]));
   x.setResponse('ok');await p.locator('#send-order').press('Enter');await p.locator('#order-success:visible').waitFor();assert.equal(x.orders.length,2);assert.deepEqual(x.orders[1],x.orders[0]);n.sameFullPayload=true;n.requestId=x.orders[0].client_request_id;
  },{response:503});
 }
}finally{await browser.close();fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({root,data:'Every request intercepted; synthetic API; isolated Chrome; all browser contexts and browser closed',results:evidence},null,2));}
