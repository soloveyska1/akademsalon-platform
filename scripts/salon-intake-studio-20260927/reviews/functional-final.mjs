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
try{
 for(const width of [390,1440])for(const method of ['Tab','click-name']){
  const x=await setup({width,consent:false,reduced:true});const n={width,method,status:'RUNNING'};evidence.push(n);
  try{
   const p=x.page,raw='  synthetic+delta@example.invalid  ';await open(x);await p.locator('#contact').fill(raw);await p.locator('[data-contact-mode=phone]').click();
   assert.equal(await p.locator('[data-contact-mode=phone]').getAttribute('aria-pressed'),'true');n.before={status:await p.locator('#ic-contact-format').textContent(),mode:await p.locator('[data-contact-mode][aria-pressed=true]').getAttribute('data-contact-mode')};assert.match(n.before.status,/Сейчас введён Email.*по телефону/);
   if(method==='Tab')await p.locator('#contact').press('Tab');else await p.locator('#name').click();await p.waitForTimeout(150);
   n.after={status:await p.locator('#ic-contact-format').textContent(),mode:await p.locator('[data-contact-mode][aria-pressed=true]').getAttribute('data-contact-mode'),raw:await p.locator('#contact').inputValue()};
   assert.equal(n.after.mode,'email');assert.equal(n.after.status,'Формат: Email. Проверь, что контакт твой.');assert.equal(n.after.raw,raw);assert(await p.locator('#name').evaluate(e=>e===document.activeElement));
   await p.locator('.ic-contact-line').screenshot({path:path.join(output,'status-'+width+'-'+method+'.png')});
   // Keep the same mismatch immediately before synthetic send: validator remains format union.
   await p.locator('#topic').fill('Synthetic candidate4 contact regression');await p.locator('#consent').check();if(await p.locator('#participation').isVisible())await p.locator('#participation').check();await p.locator('[data-contact-mode=phone]').click();await p.locator('#send-order').press('Enter');await p.locator('#order-success:visible').waitFor();assert.equal(x.orders.length,1);assert.equal(x.orders[0].contact,raw.trim());n.payloadContact=x.orders[0].contact;
   await x.privacy();assert.deepEqual(x.errors,[]);n.status='PASS';console.log('PASS '+width+' '+method);
  }catch(e){n.status='FAIL';n.error=e.stack;process.exitCode=1;console.error('FAIL '+width+' '+method+' '+e.message)}
  finally{await x.context.close();fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({root,data:'Every request intercepted; synthetic API; contexts closed after test',results:evidence},null,2))}
 }
}finally{await browser.close();fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({root,data:'Every request intercepted; synthetic API; all contexts and browser closed',results:evidence},null,2));}
