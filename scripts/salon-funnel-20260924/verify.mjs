// Isolated browser regression: routes ALL requests, never contacts production.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
const require=createRequire(process.env.SALON_NODE_DEPS+'/package.json');const {chromium}=require('playwright');
const root=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]);fs.mkdirSync(output,{recursive:true});
const serverContract=JSON.parse(fs.readFileSync(process.argv[4]));
const browser=await chromium.launch({headless:true,channel:'chrome'});const results=[];
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const privateTopic='SYNTHETIC_PRIVATE_TOPIC_SENTINEL',privateContact='synthetic@example.invalid';
async function setup(opts={}){
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:opts.width||1440,height:900},colorScheme:opts.theme||'light'});
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
   if(u.pathname==='/api/analytics/grant')return route.fulfill({json:{ok:true,grant:'synthetic-test-grant-123456',expires_at:Math.floor(Date.now()/1000)+3600}});
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
async function test(name,fn){try{await fn();results.push({name,status:'PASS'})}catch(e){results.push({name,status:'FAIL',error:e.message});throw e}}
const plan='https://akademsalon.ru/configurator.html?service=pl&work=course';
try{
 await test('fresh and saved guide intent, selection and submitted service payload',async()=>{
  for(const saved of [false,true]){const x=await setup({saved});try{
   await x.page.goto('https://akademsalon.ru/guide-kursovaya-za-nedelyu.html');await x.page.locator('.read-cta a').click();await x.page.waitForLoadState('load');
   assert.equal(await x.page.locator('#product').inputValue(),'service:plan');assert.equal(await x.page.locator('#service-work').inputValue(),'course');assert.equal(await x.page.locator('#scope').inputValue(),'whole');
   assert.match(await x.page.locator('#intake-estimate').textContent(),/3.?000/);
   await x.valid();await x.page.locator('#send-order').click();await x.page.locator('#order-success:visible').waitFor();
   assert.equal(x.orders.length,1);const p=x.orders[0];assert.equal(p.type,'svc_plan');assert.equal(p.plan,true);assert.equal(p.cart.items[0].answers.work,'course');assert.equal(p.cart.items[0].type,'svc_plan');
   await x.flush();assert.equal(x.names().filter(n=>n==='submit_success').length,1);
  }finally{await x.context.close()}}
 });
 await test('open once, no programmatic prefill engagement, trusted input once, private validation',async()=>{
  const x=await setup();try{
   await x.page.goto(plan);await x.flush();assert.equal(x.names().filter(n=>n==='config_open').length,1);
   await x.page.evaluate(()=>{document.querySelector('#topic').value='programmatic';document.querySelector('#topic').dispatchEvent(new Event('input',{bubbles:true}));});await x.flush();assert(!x.names().includes('first_input'));
   await x.page.locator('#topic').fill(privateTopic);await x.page.locator('#contact').fill('bad');await x.page.locator('#send-order').click();await x.flush();assert.equal(x.names().filter(n=>n==='first_input').length,1);assert.equal(x.names().filter(n=>n==='validation_error').length,1);assert.equal(x.orders.length,0);assert(!x.names().includes('submit_attempt'));
   await x.page.locator('#contact').fill(privateContact);await x.page.locator('#send-order').click();await x.flush();assert.equal(x.names().filter(n=>n==='validation_error').length,2);assert.equal(x.orders.length,0);
   await x.privacy();
  }finally{await x.context.close()}
 });
 await test('custom select search is not input; committed pointer and keyboard changes are input',async()=>{
  for(const keyboard of [false,true]){const x=await setup();try{
   await x.page.goto('https://akademsalon.ru/configurator.html');await x.page.locator('#intake-settings > summary').click();
   const wrap=x.page.locator('.salon-select').filter({has:x.page.locator('#product')});
   await wrap.locator('.salon-select-trigger').click();await wrap.locator('input[type=search]').fill('Дипломная');await x.flush();assert(!x.names().includes('first_input'));
   if(keyboard)await wrap.locator('input[type=search]').press('Enter');else await wrap.getByRole('option',{name:'Дипломная работа / ВКР',exact:true}).click();
   assert.equal(await x.page.locator('#product').inputValue(),'diplom');await x.flush();assert.equal(x.names().filter(n=>n==='first_input').length,1);await x.privacy();
  }finally{await x.context.close()}}
 });
 await test('no consent, owner and QA produce no new analytics-v2 events',async()=>{
  for(const opts of [{consent:false},{owner:true},{qa:true}]){const x=await setup(opts);try{await x.page.goto(plan);await x.page.locator('#topic').fill(privateTopic);await x.page.locator('#send-order').click();await x.flush();assert.equal(x.events.length,0);assert.equal(x.calls.filter(c=>c.path==='/api/analytics/events'||c.path==='/api/analytics/grant').length,0);if(opts.consent===false)assert.equal(x.calls.filter(c=>c.path==='/api/visit').length,0)}finally{await x.context.close()}}
 });
 await test('late consent and revoke/regrant never replay earlier input',async()=>{
  const x=await setup({consent:false});try{
   await x.page.goto(plan);await x.page.locator('#topic').fill(privateTopic);await x.page.evaluate(()=>Salon.consent.save(true,'settings'));await x.flush();assert.equal(x.names().filter(n=>n==='config_open').length,1);assert(!x.names().includes('first_input'));
   await x.page.locator('#topic').fill(privateTopic+'2');await x.flush();assert.equal(x.names().filter(n=>n==='first_input').length,1);
   await x.page.evaluate(()=>Salon.consent.save(false,'settings'));await x.page.locator('#topic').fill('revoked');await x.page.evaluate(()=>Salon.consent.save(true,'settings'));await x.flush();assert.equal(x.names().filter(n=>n==='config_open').length,2);assert.equal(x.names().filter(n=>n==='first_input').length,1);
  }finally{await x.context.close()}
 });
 await test('400 rejection, 409 conflict, 503 uncertainty, malformed 2xx and network failure classify truthfully',async()=>{
  for(const response of [400,409,503,'malformed','network']){const x=await setup({response});try{
   await x.page.goto(plan);await x.valid();await x.page.locator('#send-order').click();await x.page.locator('#form-message:visible').waitFor();await x.flush();assert(!await x.page.locator('#order-success').isVisible());assert(!x.names().includes('submit_success'));
   assert.equal(x.names().filter(n=>n==='submit_fail').length,1);const fail=x.events.find(e=>e.event==='submit_fail');assert.equal(fail.cta_id,response===400?'server_rejected':response===409?'request_conflict':'network_fallback');
   const first=x.orders[0].client_request_id;assert(first);x.setResponse('ok');await x.page.locator('#send-order').click();await x.page.locator('#order-success:visible').waitFor();assert.equal(x.orders.length,2);if(response!==400)assert.equal(x.orders[1].client_request_id,first);await x.privacy();
  }finally{await x.context.close()}}
 });
 await test('double submit, confirmed success and upload retry retain single order/file identities',async()=>{
  const x=await setup();try{
   await x.page.goto(plan);await x.valid();await x.page.locator('#files').setInputFiles({name:'private-file.txt',mimeType:'text/plain',buffer:Buffer.from('Synthetic fixture')});await x.page.locator('#send-order').dblclick();await x.page.locator('#order-success:visible').waitFor();assert.equal(x.orders.length,1);
   await x.page.getByRole('button',{name:'Повторить загрузку'}).click();await x.page.getByText('private-file.txt · файл передан',{exact:true}).waitFor();assert.equal(x.uploads.length,2);
   const fileId=s=>s.match(/name="client_file_id"\r\n\r\n([^\r]+)/)[1];assert.equal(fileId(x.uploads[0]),fileId(x.uploads[1]));await x.privacy();assert.equal(x.names().filter(n=>n==='submit_success').length,1);
  }finally{await x.context.close()}
 });
 await test('work calculator route remains work with keyboard Enter submission',async()=>{
  const x=await setup();try{await x.page.goto('https://akademsalon.ru/configurator.html?type=course');assert.equal(await x.page.locator('#product').inputValue(),'course');await x.valid();await x.page.locator('#contact').press('Enter');await x.page.locator('#order-success:visible').waitFor();assert.equal(x.orders[0].type,'course');await x.privacy();assert.equal(x.events.find(e=>e.event==='config_open').cta_id,'calculator')}finally{await x.context.close()}
 });
 await test('browser back-forward preserves explicit plan choice',async()=>{
  const x=await setup({saved:true});try{await x.page.goto('https://akademsalon.ru/guide-kursovaya-za-nedelyu.html');await x.page.locator('.read-cta a').click();await x.page.waitForLoadState('load');await x.page.goBack();await x.page.goForward();await x.page.waitForLoadState('load');assert.equal(await x.page.locator('#product').inputValue(),'service:plan');assert.equal(await x.page.locator('#service-work').inputValue(),'course')}finally{await x.context.close()}
 });
 await test('light/dark at 360,390,768,1024,1440: no overflow, visible errors and CTA',async()=>{
  for(const width of [360,390,768,1024,1440])for(const theme of ['light','dark']){const x=await setup({width,theme,consent:false});try{
   await x.page.goto(plan);assert.equal(await x.page.locator('html').getAttribute('data-theme'),theme==='dark'?'dark':await x.page.locator('html').getAttribute('data-theme'));
   assert(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await x.page.locator('#send-order').click();await x.page.locator('#form-message:visible').waitFor();assert.equal(await x.page.locator('#topic').getAttribute('aria-invalid'),'true');assert(await x.page.locator('#topic').evaluate(el=>el===document.activeElement));
   const box=await x.page.locator('#send-order').boundingBox();assert(box.width>=44&&box.height>=44);assert.deepEqual(x.errors,[]);
   await x.page.screenshot({path:path.join(output,`plan-${width}-${theme}.png`),fullPage:true});
  }finally{await x.context.close()}}
 });
}finally{
 await browser.close();const report={checkoutHead:sourceCommit,candidateHashes:JSON.parse(fs.readFileSync(path.join(root,'..','build.json'))).files,root,browser:'Chrome through Playwright',data:'synthetic only; all HTTP intercepted',screenshots:output,results};fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
