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
async function test(name,fn){try{await fn();results.push({name,status:'PASS'})}catch(e){results.push({name,status:'FAIL',error:e.message});throw e}}
const plan='https://akademsalon.ru/configurator.html?service=pl&work=course';
const fixture=(name='private-file.txt',size=16)=>({name,mimeType:'text/plain',buffer:Buffer.alloc(size,65)});
async function drop(page,files,selector='.upload-box'){
 await page.evaluate(({files,selector})=>{const d=new DataTransfer();for(const f of files)d.items.add(new File([new Uint8Array(f.size||16)],f.name,{type:f.type||'text/plain',lastModified:1000}));const el=document.querySelector(selector);el.dispatchEvent(new DragEvent('dragenter',{bubbles:true,dataTransfer:d}));el.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:d}));},{files,selector});
}
try{
 await test('picker cards, safe long name, persistent undo, original ID and keyboard focus',async()=>{
  const x=await setup({consent:false,width:360});try{const p=x.page;await p.goto(plan);assert(!await p.locator('.comfort-file-undo').isVisible());
  await p.locator('#files').setInputFiles([fixture('private-file-<img src=x onerror=alert(1)>.txt'),fixture('Методичка_'+ 'оченьдлинноеимя'.repeat(10)+'.docx')]);assert.equal(await p.locator('.comfort-file').count(),2);assert.equal(await p.locator('.comfort-file-name img').count(),0);assert.match(await p.locator('.comfort-file-meta').first().textContent(),/Готов к отправке/);assert.equal(x.uploads.length,0);
  const id=await p.locator('.comfort-file').first().getAttribute('data-file-id');await p.locator('.comfort-file-remove').first().click();assert(await p.locator('.comfort-file-undo button').evaluate(el=>el===document.activeElement));await p.waitForTimeout(800);await p.locator('.comfort-file-undo button').press('Enter');assert.equal(await p.locator('.comfort-file').first().getAttribute('data-file-id'),id);assert(await p.locator('.comfort-file-remove').first().evaluate(el=>el===document.activeElement));assert(!await p.locator('.comfort-file-undo').isVisible());assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await x.privacy();
  }finally{await x.context.close()}
 });
 await test('drop and picker share duplicate, count, size, extension limits; rejected names never suggest topic',async()=>{
  const x=await setup({consent:false});try{const p=x.page;await p.goto(plan);
  await drop(p,[{name:'private-invalid.exe'},{name:'private-big.pdf',size:20*1048576+1}]);assert.equal(await p.locator('.comfort-file').count(),0);assert(!await p.locator('#intake-file-topic').isVisible());assert.match(await p.locator('.comfort-file-notice').textContent(),/Неподдерживаемый/);assert.match(await p.locator('.comfort-file-notice').textContent(),/20 МБ/);
  await p.locator('#files').setInputFiles(fixture('empty.txt',0));assert.equal(await p.locator('.comfort-file').count(),0);
  await drop(p,[{name:'Методичка_Тестовая_тема.docx'}]);assert.equal(await p.locator('.comfort-file').count(),1);assert(await p.locator('#intake-file-topic').isVisible());await drop(p,[{name:'Методичка_Тестовая_тема.docx'}]);assert.equal(await p.locator('.comfort-file').count(),1);assert.match(await p.locator('.comfort-file-notice').textContent(),/уже добавлен/);
  await drop(p,Array.from({length:5},(_,i)=>({name:'private-file'+i+'.pdf'})));assert.equal(await p.locator('.comfort-file').count(),5);assert.match(await p.locator('.comfort-file-notice').textContent(),/до 5 файлов/);
  await p.locator('.comfort-file-remove').first().click();await drop(p,[{name:'replacement.pdf'}]);await p.locator('.comfort-file-undo button').click();assert.equal(await p.locator('.comfort-file').count(),5);assert.match(await p.locator('.comfort-file-notice').textContent(),/Уже добавлено 5/);
  await drop(p,[{name:'outside.pdf'}],'body');assert.equal(await p.locator('.comfort-file').count(),5);assert(!await p.locator('.upload-box').evaluate(el=>el.classList.contains('is-dragging')));await x.privacy();
  }finally{await x.context.close()}
 });
 await test('local image previews clean up, malformed image falls back, undo recreates',async()=>{
  const x=await setup({consent:false});try{const p=x.page;await p.addInitScript(()=>{window.blobLifecycle={created:0,revoked:0};const c=URL.createObjectURL,r=URL.revokeObjectURL;URL.createObjectURL=function(...a){blobLifecycle.created++;return c.apply(this,a)};URL.revokeObjectURL=function(...a){blobLifecycle.revoked++;return r.apply(this,a)}});await p.goto(plan);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN2kAAAAASUVORK5CYII=','base64');
  await p.locator('#files').setInputFiles({name:'private-photo.png',mimeType:'image/png',buffer:png});await p.locator('.comfort-file-badge img').scrollIntoViewIfNeeded();await p.waitForFunction(()=>document.querySelector('.comfort-file-badge img')?.naturalWidth>0);await p.locator('.comfort-file-remove').click();assert.equal((await p.evaluate(()=>blobLifecycle)).revoked,1);await p.locator('.comfort-file-undo button').click();assert.equal((await p.evaluate(()=>blobLifecycle)).created,2);
  await p.locator('#files').setInputFiles({name:'broken.jpg',mimeType:'image/jpeg',buffer:Buffer.from('invalid')});await p.locator('.comfort-file').last().scrollIntoViewIfNeeded();await p.waitForFunction(()=>document.querySelectorAll('.comfort-file-badge img').length===1);assert.match(await p.locator('.comfort-file-badge').last().textContent(),/ФОТО/);assert.equal((await p.evaluate(()=>blobLifecycle)).revoked,2);await x.privacy();
  }finally{await x.context.close()}
 });
 await test('real trusted desktop drop records first input once; synthetic drop never does',async()=>{
  const x=await setup();try{const p=x.page;await p.goto(plan);await drop(p,[{name:'synthetic.txt'}]);await x.flush();assert(!x.names().includes('first_input'));
  const file=path.join(output,'private-drag.txt');fs.writeFileSync(file,'Synthetic fixture');const cdp=await x.context.newCDPSession(p);await p.locator('.upload-box').scrollIntoViewIfNeeded();const b=await p.locator('.upload-box').boundingBox();const data={items:[],files:[file],dragOperationsMask:1};for(const type of ['dragEnter','dragOver','drop'])await cdp.send('Input.dispatchDragEvent',{type,x:b.x+b.width/2,y:b.y+b.height/2,data});assert.equal(await p.locator('.comfort-file').count(),2);await x.flush();assert.equal(x.names().filter(n=>n==='first_input').length,1);await x.privacy();
  }finally{await x.context.close()}
 });
 await test('quick dates and clear use local calendar, quote and trusted keyboard measurement',async()=>{
  const x=await setup({now:'2026-09-24T20:59:00Z'});try{const p=x.page;await p.clock.setFixedTime(new Date('2026-09-24T20:59:00Z'));await p.goto('https://akademsalon.ru/configurator.html?type=course');const old=await p.locator('#summary-price').textContent();await p.locator('[data-deadline-days="1"]').press('Enter');assert.equal(await p.locator('#deadline').inputValue(),'2026-09-25');assert.equal(await p.locator('[data-deadline-days="1"]').getAttribute('aria-pressed'),'true');assert.match(await p.locator('.comfort-date-label').textContent(),/^Срок: пятница/);assert.notEqual(await p.locator('#summary-price').textContent(),old);await p.locator('[data-deadline-days="14"]').click();assert.equal(await p.locator('#deadline').inputValue(),'2026-10-08');await p.locator('.comfort-date-clear').click();assert.equal(await p.locator('#deadline').inputValue(),'');assert.equal(await p.locator('#summary-price').textContent(),old);await x.flush();assert.equal(x.names().filter(n=>n==='first_input').length,1);await x.privacy();
  }finally{await x.context.close()}
  const x2=await setup({saved:true});try{await x2.page.goto('https://akademsalon.ru/configurator.html');await x2.page.locator('.comfort-date-clear').click();await x2.flush();assert.equal(x2.names().filter(n=>n==='first_input').length,1)}finally{await x2.context.close()}
 });
 await test('open tab midnight updates min, urgency quote, chips and leap-year date correctly',async()=>{
  const x=await setup({consent:false});try{const p=x.page;await p.clock.setFixedTime(new Date('2026-09-24T20:59:00Z'));await p.goto('https://akademsalon.ru/configurator.html?type=course');await p.locator('[data-deadline-days="14"]').click();const old=await p.locator('#summary-price').textContent();await p.clock.setFixedTime(new Date('2026-09-24T21:01:00Z'));await p.evaluate(()=>window.dispatchEvent(new Event('focus')));assert.equal(await p.locator('#deadline').getAttribute('min'),'2026-09-25');assert.notEqual(await p.locator('#summary-price').textContent(),old);assert.equal(await p.locator('[data-deadline-days="14"]').getAttribute('aria-pressed'),'false');await p.locator('[data-deadline-days="1"]').click();assert.equal(await p.locator('#deadline').inputValue(),'2026-09-26');await p.clock.setFixedTime(new Date('2028-02-28T09:00:00Z'));await p.locator('[data-deadline-days="1"]').click();assert.equal(await p.locator('#deadline').inputValue(),'2028-02-29');await x.privacy();
  }finally{await x.context.close()}
 });
 await test('undo retains file ID through uncertain submit and upload retry; all mutation actions locked',async()=>{
  const x=await setup({response:503});try{const p=x.page;await p.goto(plan);await p.locator('#files').setInputFiles(fixture());const id=await p.locator('.comfort-file').getAttribute('data-file-id');await p.locator('.comfort-file-remove').click();await p.locator('.comfort-file-undo button').click();await p.locator('#files').setInputFiles(fixture('second.txt'));await p.locator('.comfort-file-remove').last().click();await x.valid();await p.locator('[data-deadline-days="7"]').click();const date=await p.locator('#deadline').inputValue();await p.locator('#send-order').click();await p.locator('#form-message:visible').waitFor();assert(await p.locator('.comfort-file-undo button').isDisabled());assert(await p.locator('.comfort-file-remove').isDisabled());assert(await p.locator('[data-deadline-days="1"]').isDisabled());await drop(p,[{name:'blocked.txt'}]);assert.equal(await p.locator('.comfort-file').count(),1);assert.equal(await p.locator('#deadline').inputValue(),date);x.setResponse('ok');await p.locator('#send-order').click();await p.locator('#order-success:visible').waitFor();assert.equal(x.orders[0].client_request_id,x.orders[1].client_request_id);await p.getByRole('button',{name:'Повторить загрузку'}).click();await p.getByText('private-file.txt · файл передан',{exact:true}).waitFor();assert.equal(x.uploads.length,2);for(const u of x.uploads){assert(u.includes(id));assert(u.includes('AAAAAAAAAAAAAAAA'))}await x.privacy();
  }finally{await x.context.close()}
 });
 await test('autogrow grows and shrinks after disclosure, keeps focus, caps long paste',async()=>{
  const x=await setup({consent:false,width:390});try{const p=x.page;await p.goto(plan);await p.locator('#intake-task-details > summary').click();const t=p.locator('#details');await t.fill(('Строка задания.\n').repeat(55));await p.waitForTimeout(100);assert.equal(Math.round((await t.boundingBox()).height),520);assert.equal(await t.evaluate(el=>getComputedStyle(el).overflowY),'auto');assert(await t.evaluate(el=>el===document.activeElement));await t.evaluate(el=>{el.setSelectionRange(el.value.length,el.value.length);el.scrollTop=el.scrollHeight});await t.press('End');await t.press('A');await p.waitForTimeout(100);assert(await t.evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop<40),'caret at bottom remains visible');await t.fill('Короткое задание');await p.waitForTimeout(100);assert([140,144].includes(Math.round((await t.boundingBox()).height)));assert(await t.evaluate(el=>el===document.activeElement));await p.locator('#intake-task-details > summary').click();await t.evaluate(el=>{el.value=('Long prefill\n').repeat(30);el.dispatchEvent(new Event('input',{bubbles:true}))});await p.locator('#intake-task-details > summary').click();await p.waitForTimeout(100);assert.equal(Math.round((await t.boundingBox()).height),520);await x.privacy();
  }finally{await x.context.close()}
 });
 await test('all 10 viewport/theme states, reduced motion, 44px controls, focus, no private persistence',async()=>{
  for(const width of [360,390,768,1024,1440])for(const theme of ['light','dark']){const x=await setup({width,theme,consent:false,reduced:true});try{const p=x.page;await p.goto(plan);await p.locator('#files').setInputFiles([fixture('Методичка_'+ 'длинноеимя'.repeat(10)+'.docx'),fixture('private-file.pdf')]);await p.locator('[data-deadline-days="7"]').click();await p.locator('#intake-task-details > summary').click();await p.locator('#details').fill('SYNTHETIC_PRIVATE details\n'.repeat(10));await p.waitForTimeout(100);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));for(const el of await p.locator('.comfort-file-remove,.comfort-dates button:visible').all()){const b=await el.boundingBox();assert(b.width>=44&&b.height>=44)}assert.equal(await p.locator('.upload-box').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');await p.locator('[data-deadline-days="7"]').focus();await p.keyboard.press('Tab');const focus=await p.evaluate(()=>{const s=getComputedStyle(document.activeElement);return s.outlineStyle!=='none'||s.boxShadow!=='none'});assert(focus);const storage=await p.evaluate(()=>JSON.stringify([Object.entries(localStorage),Object.entries(sessionStorage)]));assert(!/private-file|SYNTHETIC_PRIVATE/.test(storage));await p.evaluate(()=>window.scrollTo(0,0));await p.screenshot({path:path.join(output,`comfort-${width}-${theme}.png`),fullPage:true});await x.privacy();
  }finally{await x.context.close()}}
 });
}finally{
 await browser.close();const report={checkoutHead:sourceCommit,root,browser:'Chrome through Playwright',data:'synthetic only; all HTTP intercepted',screenshots:output,results};fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
