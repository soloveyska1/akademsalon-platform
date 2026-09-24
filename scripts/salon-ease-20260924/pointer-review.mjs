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
const records=[];let error=null;
try{for(const hoverWait of [0,400]){const x=await setup({width:360});try{const p=x.page;await p.goto(plan);await p.locator('#topic').fill(privateTopic);await p.locator('#contact').fill('bad');await p.locator('#send-order').scrollIntoViewIfNeeded();await p.evaluate(()=>{window.__pointerEvents=[];for(const name of ['pointerdown','pointerup','click'])document.addEventListener(name,e=>window.__pointerEvents.push({name,target:e.target.closest('#send-order')?'send-order':e.target.id,trusted:e.isTrusted}),true)});
const read=()=>p.locator('#send-order').evaluate(e=>{const rect=e.getBoundingClientRect(),css=getComputedStyle(e),matrix=new DOMMatrixReadOnly(css.transform==='none'?undefined:css.transform);let layoutTop=0,n=e;const offsets=[];while(n){offsets.push({tag:n.tagName,id:n.id,top:n.offsetTop});layoutTop+=n.offsetTop;n=n.offsetParent}return {y:rect.y,layoutTop,rectDocumentTop:rect.y+scrollY,normalizedDocumentTop:rect.y+scrollY-matrix.m42,scroll:scrollY,offsets,transform:css.transform,hover:e.matches(':hover'),active:e.matches(':active'),errorVisible:!!document.querySelector('#polish-error-contact')?.getClientRects().length}});
const before=await read();const b=await p.locator('#send-order').boundingBox();const point={x:b.x+b.width/2,y:b.y+b.height/2};await p.mouse.move(point.x,point.y);if(hoverWait)await p.waitForTimeout(hoverWait);const hover=await read();await p.mouse.down();await p.waitForTimeout(250);const held=await read();const hit=await p.evaluate(p=>!!document.elementFromPoint(p.x,p.y)?.closest('#send-order'),point);assert.equal(held.layoutTop,before.layoutTop,'layout document offset must be stable while held');assert.equal(held.scroll,before.scroll,'document scroll stable while held');assert(Math.abs(held.normalizedDocumentTop-before.normalizedDocumentTop)<0.5,'transform-normalized position stable');assert.equal(held.errorVisible,false,'blur error deferred until release');assert.equal(hit,true,'original pointer center remains on button');await p.mouse.up();await p.locator('#polish-error-contact').waitFor();await x.flush();const trace=await p.evaluate(()=>window.__pointerEvents);assert.equal(trace.filter(e=>e.name==='click'&&e.target==='send-order'&&e.trusted).length,1,'one trusted button click delivered');assert.equal(x.names().filter(n=>n==='validation_error').length,1,'one validation event');assert(await p.locator('#contact').evaluate(e=>e===document.activeElement));assert.equal(x.orders.length,0);await x.privacy();records.push({hoverWait,before,hover,held,hit,trace,validationEvents:x.names().filter(n=>n==='validation_error').length,status:'PASS'});}finally{await x.context.close()}}}catch(e){error=e.stack;process.exitCode=1}finally{await browser.close();const report={root,status:error?'FAIL':'PASS',error,records,network:'all requests fulfilled locally; no production traffic'};fs.writeFileSync(path.join(output,'pointer-review.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))}
