// Isolated browser regression: routes ALL requests, never contacts production.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
const require=createRequire(process.env.SALON_NODE_DEPS+'/package.json');const {chromium}=require('playwright');
const root=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]);fs.mkdirSync(output,{recursive:true});
const serverContract=JSON.parse(fs.readFileSync(process.argv[4]));
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
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS '+name)}catch(e){results.push({name,status:'FAIL',error:e.message});throw e}}
const plan='https://akademsalon.ru/configurator.html?service=pl&work=course';
async function choose(page,id,label){const wrap=page.locator('.salon-select').filter({has:page.locator('#'+id)});await wrap.locator('.salon-select-trigger').evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));await page.waitForTimeout(60);await wrap.locator('.salon-select-trigger').click();await wrap.getByRole('option',{name:label,exact:true}).click()}
try{
 await test('pristine quiet, contact blur error linked locally, correction and cleared required value without focus theft',async()=>{
  const x=await setup();try{const p=x.page;await p.goto(plan);await p.locator('#contact').focus();await p.locator('#topic').click();assert.equal(await p.locator('.polish-field-error:visible').count(),0);await p.locator('#contact').evaluate(el=>el.setAttribute('aria-describedby',el.getAttribute('aria-describedby')+' external-hint'));await p.locator('#contact').fill('bad');await p.locator('#topic').click();await p.locator('#polish-error-contact').waitFor();assert(await p.locator('#polish-error-contact').isVisible());assert.match(await p.locator('#contact').getAttribute('aria-describedby'),/external-hint.*polish-error-contact/);assert(await p.locator('#topic').evaluate(el=>el===document.activeElement));await x.flush();assert(!x.names().includes('validation_error'));
  await p.locator('#contact').fill(privateContact);assert(!await p.locator('#polish-error-contact').isVisible());assert.equal(await p.locator('#contact').getAttribute('aria-invalid'),null);assert.match(await p.locator('#contact').getAttribute('aria-describedby'),/external-hint/);assert(await p.locator('#contact').evaluate(el=>el===document.activeElement));await p.locator('#contact').fill('');await p.locator('#topic').click();await p.locator('#polish-error-contact').waitFor();assert(await p.locator('#polish-error-contact').isVisible());assert.match(await p.locator('#polish-error-contact').textContent(),/Укажи контакт/);await x.privacy();
  }finally{await x.context.close()}
 });
 await test('channel hints do not change contact or native constraints, send nothing and are not first input',async()=>{
  const x=await setup();try{const p=x.page;await p.goto(plan);await p.locator('#contact').evaluate(el=>el.value='kept@example.invalid');for(const [id,mode]of [['telegram','text'],['email','email'],['phone','tel'],['vk','url']]){await p.locator('[data-contact-mode='+id+']').click();assert.equal(await p.locator('#contact').inputValue(),'kept@example.invalid');assert.equal(await p.locator('#contact').evaluate(el=>el.type),'text');assert.equal(await p.locator('#contact').getAttribute('inputmode'),mode);assert.equal(await p.locator('[data-contact-mode='+id+']').getAttribute('aria-pressed'),'true');assert(await p.locator('#contact').evaluate(el=>el===document.activeElement));assert.equal(await p.locator('#contact').getAttribute('pattern'),null)}await x.flush();assert(!x.names().includes('first_input'));assert.equal(x.orders.length,0);assert.equal(await p.locator('.polish-field-error:visible').count(),0);await x.privacy();
  }finally{await x.context.close()}
 });
 await test('all four original contact formats remain accepted across mismatched hint modes; VK numeric profile detected as VK',async()=>{
  for(const value of ['@synthetic_user','synthetic@example.invalid','+7 (900) 000-00-00','https://vk.com/id12345678901']){const x=await setup();try{const p=x.page;await p.goto(plan);await p.locator('[data-contact-mode=email]').click();await p.locator('#contact').fill(value);await p.locator('#topic').fill(privateTopic);await p.locator('#consent').check();assert.equal(await p.locator('.polish-field-error:visible').count(),0);if(value.includes('vk.com'))assert.equal(await p.locator('[data-contact-mode=vk]').getAttribute('aria-pressed'),'true');await p.locator('#send-order').click();await p.locator('#order-success:visible').waitFor();assert.equal(x.orders[0].contact,value);assert.equal(x.orders.length,1);await p.locator('body > .sa-launch').waitFor();assert.equal(await p.locator('.sa-launch').evaluate(el=>getComputedStyle(el).position),'fixed');await p.locator('.sa-launch').click();await p.locator('#salon-assistant[open]').waitFor();await p.locator('[data-sa-close]').click();assert(await p.locator('.sa-launch').evaluate(el=>el===document.activeElement));await x.privacy()}finally{await x.context.close()}}
 });
 await test('one submit validation event, adjacent error and immediate clean correction, date error is local',async()=>{
  const x=await setup();try{const p=x.page;await p.goto(plan);await p.locator('#send-order').click();assert(await p.locator('#polish-error-topic').isVisible());assert(await p.locator('#topic').evaluate(el=>el===document.activeElement));await x.flush();assert.equal(x.names().filter(n=>n==='validation_error').length,1);await p.locator('#topic').fill(privateTopic);assert(!await p.locator('#polish-error-topic').isVisible());assert(!await p.locator('#form-message').isVisible());await p.locator('#contact').fill(privateContact);await p.locator('#deadline').fill('2020-01-01');await p.locator('#send-order').click();assert(await p.locator('#polish-error-deadline').isVisible());await p.locator('[data-deadline-days="7"]').click();assert(!await p.locator('#polish-error-deadline').isVisible());assert.equal(await p.locator('#deadline').getAttribute('aria-invalid'),null);await x.privacy();assert.equal(x.orders.length,0);
  }finally{await x.context.close()}
 });
 await test('first invalid native field focuses visible select, descriptions/checkbox linked and dynamic service errors cleaned',async()=>{
  const x=await setup({consent:false});try{const p=x.page;await p.goto('https://akademsalon.ru/configurator.html?service=pl');await p.locator('#topic').fill(privateTopic);await p.locator('#contact').fill(privateContact);await p.locator('#send-order').click();const wrap=p.locator('.salon-select').filter({has:p.locator('#service-work')});assert(await wrap.locator('.salon-select-trigger').evaluate(el=>el===document.activeElement));assert(await p.locator('#polish-error-service-work').isVisible());assert.match(await wrap.locator('.salon-select-trigger').getAttribute('aria-describedby'),/polish-error-service-work/);assert(await p.locator('#polish-error-consent').isVisible());
  await choose(p,'service-work','Курсовая');assert(!await p.locator('#polish-error-service-work').isVisible());assert.equal(await wrap.locator('.salon-select-trigger').getAttribute('aria-invalid'),null);await p.locator('#send-order').click();assert(await p.locator('#consent').evaluate(el=>el===document.activeElement));await p.locator('#consent').check();assert(!await p.locator('#polish-error-consent').isVisible());await choose(p,'service-work','Выберите вариант');await p.locator('#send-order').click();assert(await p.locator('#polish-error-service-work').isVisible());await p.locator('#intake-settings > summary').click();await choose(p,'product','Курсовая работа');assert.equal(await p.locator('#polish-error-service-work').count(),0);assert.equal(await p.locator('[aria-describedby*=polish-error-service-work]').count(),0);await x.privacy();
  }finally{await x.context.close()}
 });
 await test('uncertain state locks channel controls, retry IDs and value stable; rejected server message survives editing',async()=>{
  for(const response of [503,400]){const x=await setup({response});try{const p=x.page;await p.goto(plan);await p.locator('#contact').fill('bad');await p.locator('#topic').click();await x.valid();await p.locator('#send-order').click();await p.locator('#form-message:visible').waitFor();const text=await p.locator('#form-message').textContent();if(response===503){assert(await p.locator('[data-contact-mode=email]').isDisabled());const value=await p.locator('#contact').inputValue(),mode=await p.locator('#contact').getAttribute('inputmode');await p.locator('[data-contact-mode=phone]').evaluate(el=>{el.disabled=false;el.click()});assert.equal(await p.locator('#contact').inputValue(),value);assert.equal(await p.locator('#contact').getAttribute('inputmode'),mode)}else{assert(!await p.locator('[data-contact-mode=email]').isDisabled());await p.locator('#contact').fill('synthetic2@example.invalid');assert.equal(await p.locator('#form-message').textContent(),text);assert(await p.locator('#form-message').isVisible())}x.setResponse('ok');await p.locator('#send-order').click();await p.locator('#order-success:visible').waitFor();if(response===503)assert.equal(x.orders[0].client_request_id,x.orders[1].client_request_id);await x.privacy()}finally{await x.context.close()}}
 });
 await test('near-limit UTF16 counters, unchanged over-limit prefill, real paste maxlength, quiet threshold announcements',async()=>{
  const x=await setup({consent:false});try{const p=x.page;await p.goto(plan);assert(!await p.locator('#polish-count-topic').isVisible());await p.locator('#topic').fill('x'.repeat(400));assert.match(await p.locator('#polish-count-topic').textContent(),/400 \/ 500/);const live=p.locator('#direct-order > .sr-only[role=status]'),msg=await live.textContent();await p.locator('#topic').press('a');assert.equal(await live.textContent(),msg);await p.locator('#topic').fill('😀'.repeat(250));assert.equal(await p.locator('#topic').evaluate(el=>el.value.length),500);assert.match(await p.locator('#polish-count-topic').textContent(),/500 \/ 500.*лимит/);await p.locator('#topic').fill('short');assert(!await p.locator('#polish-count-topic').isVisible());
  await p.locator('#intake-task-details > summary').click();await p.locator('#details').evaluate(el=>{el.value='x'.repeat(12005);el.dispatchEvent(new Event('input',{bubbles:true}))});assert.equal(await p.locator('#details').evaluate(el=>el.value.length),12005);assert.match(await p.locator('#polish-count-details').textContent(),/сократи текст/);await p.locator('#topic').fill('Updated topic');assert.match(await p.locator('#intake-details-count').textContent(),/12.005 \/ 12.000/);await p.locator('#details').fill('');await p.locator('#details').focus();await p.keyboard.insertText('A'.repeat(12500));assert.equal(await p.locator('#details').evaluate(el=>el.value.length),12000);assert.match(await p.locator('#polish-count-details').textContent(),/лимит/);assert.match(await p.locator('#details').getAttribute('aria-describedby'),/polish-count-details/);await x.privacy();
  }finally{await x.context.close()}
 });
 await test('held pointer submit is never lost on blur; cancel flushes; inline helper stays available without overlap',async()=>{
 const x=await setup({width:360});try{const p=x.page;await p.goto(plan);await p.locator('#topic').fill(privateTopic);await p.locator('#contact').fill('bad');await p.locator('#send-order').scrollIntoViewIfNeeded();const b=await p.locator('#send-order').boundingBox();await p.mouse.move(b.x+b.width/2,b.y+b.height/2);await p.mouse.down();await p.waitForTimeout(250);const during=await p.locator('#send-order').boundingBox();assert.equal(Math.round(during.y),Math.round(b.y));await p.mouse.up();await p.locator('#polish-error-contact').waitFor();await x.flush();assert.equal(x.names().filter(n=>n==='validation_error').length,1);assert(await p.locator('#contact').evaluate(el=>el===document.activeElement));
 await p.locator('#contact').fill('bad2');await p.evaluate(()=>{document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));document.querySelector('#topic').focus();document.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true}))});await p.waitForTimeout(50);assert(await p.locator('#polish-error-contact').isVisible());await p.locator('#contact').fill(privateContact);await p.locator('#contact').press('Tab');assert(!await p.locator('#polish-error-contact').isVisible());
 await p.locator('.polish-help-slot .sa-launch').waitFor();assert.equal(await p.locator('.sa-launch').count(),1);assert.equal(await p.locator('.sa-launch').evaluate(el=>getComputedStyle(el).position),'static');const before=await p.locator('.polish-help-slot').boundingBox();await p.locator('.sa-launch').click();await p.locator('#salon-assistant[open]').waitFor();assert.equal((await p.locator('.polish-help-slot').boundingBox()).height,before.height);await p.locator('[data-sa-close]').click();assert(await p.locator('.sa-launch').evaluate(el=>el===document.activeElement));const help=await p.locator('.sa-launch').boundingBox(),contact=await p.locator('#contact').boundingBox();assert(help.y>=contact.y+contact.height);await x.privacy();assert.equal(x.orders.length,0);
 }finally{await x.context.close()}
 });
 await test('10 viewport/theme states, field/chip focus, no clipping, private data stays off storage and analytics',async()=>{
  for(const width of [360,390,768,1024,1440])for(const theme of ['light','dark']){const x=await setup({width,theme,consent:false,reduced:true});try{const p=x.page;await p.goto(plan);await p.locator('[data-contact-mode=phone]').click();await p.locator('#contact').fill('bad');await p.locator('#topic').fill('SYNTHETIC_PRIVATE '+ 'x'.repeat(400));await p.locator('#intake-task-details > summary').click();await p.locator('#details').fill('SYNTHETIC_PRIVATE details');await p.locator('[data-contact-mode=telegram]').focus();await p.keyboard.press('Tab');assert(await p.locator('[data-contact-mode=email]').evaluate(el=>getComputedStyle(el).outlineStyle!=='none'));for(const el of await p.locator('[data-contact-mode]').all()){const b=await el.boundingBox();assert(b.height>=44&&b.width>=44)}assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.locator('#contact').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(output,`polish-${width}-${theme}.png`)});assert(!/SYNTHETIC_PRIVATE/.test(await p.evaluate(()=>JSON.stringify([Object.entries(localStorage),Object.entries(sessionStorage)]))));await x.privacy();
  }finally{await x.context.close()}}
 });
}finally{
 await browser.close();const report={checkoutHead:sourceCommit,root,browser:'Chrome through Playwright',data:'synthetic only; all HTTP intercepted',screenshots:output,results};fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
