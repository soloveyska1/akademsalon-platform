// Real Chrome, all HTTP routed to the exact candidate. No production traffic.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';import crypto from 'node:crypto';
const require=createRequire(process.env.SALON_NODE_DEPS+'/package.json');const {chromium}=require('playwright');
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);const browser=await chromium.launch({headless:true,channel:'chrome'}),results=[];
const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),KEY='salon_return_v1',CAT='salon_catalog_return_v1',guide='/guide-kursovaya-za-nedelyu.html';
async function setup(opts={}){
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:opts.width||1440,height:900},colorScheme:opts.theme||'light',reducedMotion:opts.reduced?'reduce':'no-preference'}),errors=[],calls=[];
 await context.addInitScript(({opts})=>{const t=Date.now();localStorage.setItem('salon_consent',JSON.stringify({v:3,analytics:false,at:new Date(t-60000).toISOString(),expiresAt:new Date(t+86400000).toISOString()}));localStorage.setItem('salon_theme',opts.theme||'light');localStorage.setItem('salon_analytics_owner_device_v1',JSON.stringify({v:1}));sessionStorage.setItem('salon_analytics_qa_session_v1','1')},{opts});
 await context.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());if(u.hostname!=='akademsalon.ru')return route.abort();if(u.pathname.startsWith('/api/')){calls.push({path:u.pathname,method:r.method(),body:r.postData()});return route.fulfill({json:{ok:true,authenticated:false,pay_online:true}})}if(opts.failPDF&&u.pathname.endsWith('.pdf'))return route.fulfill({status:503,body:'Unavailable'});const p=path.join(root,u.pathname==='/'?'index.html':decodeURIComponent(u.pathname));if(!p.startsWith(root+'/'))throw Error('unsafe route');if(!fs.existsSync(p)||!fs.statSync(p).isFile())return route.fulfill({status:404,body:'Not found'});const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.pdf':'application/pdf','.woff2':'font/woff2'};return route.fulfill({path:p,contentType:mime[path.extname(p)]||'application/octet-stream'});});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));return {context,page,errors,calls};
}
const goto=async(p,url)=>{await p.goto('https://akademsalon.ru'+url,{waitUntil:'load'});await p.evaluate(()=>document.fonts.ready);};
const stored=p=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)||'null'),KEY);
async function headingRead(page,index=3){await page.mouse.wheel(0,350);await page.locator('article.doc h2').nth(index).evaluate(h=>window.scrollTo({top:scrollY+h.getBoundingClientRect().top-140,behavior:'instant'}));await page.waitForTimeout(650);}
async function test(name,fn,opts={}){const env=await setup(opts);try{await fn(env);assert.deepEqual(env.errors,[],'no JS errors');assert(!env.calls.some(x=>x.method!=='GET'),'no API writes');results.push({name,status:'PASS'})}catch(e){results.push({name,status:'FAIL',error:String(e),pageErrors:env.errors});await env.page.screenshot({path:path.join(out,name+'.png'),fullPage:false}).catch(()=>{});throw e}finally{await env.context.close()}}
async function readyPDF(page,n){await page.waitForFunction(n=>document.querySelector('#pdf-page-number').value===String(n)&&document.querySelector('#pdf-loading').hidden&&!document.querySelector('#pdf-error').getClientRects().length,n);}

const checks=[],hashes=()=>Object.fromEntries(['assets/js/salon-return.js','assets/js/salon-portfolio.js','assets/js/salon-catalogue.js'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')]));const initialHashes=hashes();let error=null;
try {
 for(const guarded of [false,true]){
  const env=await setup();const {page}=env;
  try {
   if(!guarded){const original=fs.readFileSync(path.join(root,'assets/js/salon-portfolio.js'),'utf8');const anchor="dialog.addEventListener('close',()=>{if(dialog.open)return;";assert.equal(original.split(anchor).length,2);await page.route('**/assets/js/salon-portfolio.js*',r=>r.fulfill({contentType:'text/javascript',body:original.replace(anchor,"dialog.addEventListener('close',()=>{")}));}
   await goto(page,'/samples.html');await page.locator('.document-open').click();await readyPDF(page,1);await page.locator('#pdf-page-number').fill('5');await page.locator('#pdf-page-number').press('Enter');await readyPDF(page,5);
   // Same event-loop turn reproduces the browser's queued old close after a new opening.
   await page.evaluate(()=>{document.querySelector('#pdf-reader').close();document.querySelector('.sr-pdf-start').click()});
   if(!guarded){await page.waitForTimeout(1200);const state=await page.evaluate(()=>({open:document.querySelector('#pdf-reader').open,reading:document.documentElement.classList.contains('portfolio-reading'),loading:!document.querySelector('#pdf-loading').hidden}));assert.equal(state.open,true);assert.equal(state.reading,false);assert.equal(state.loading,true);checks.push('REPRODUCED old close event tears down newly opened PDF when guard removed in isolated route');}
   else{await readyPDF(page,1);assert(await page.evaluate(()=>document.documentElement.classList.contains('portfolio-reading')));await page.locator('#pdf-next').click();await readyPDF(page,2);await page.locator('#pdf-close').click();await page.waitForFunction(()=>!document.documentElement.classList.contains('portfolio-reading'));assert.equal(await page.locator('.sr-pdf-start').evaluate(e=>e===document.activeElement),true);checks.push('PASS guard preserves new load/page navigation and final close restores opener focus');
    await page.locator('.document-open').press('Enter');await readyPDF(page,2);await page.locator('#pdf-close').click();await page.locator('.sr-pdf-start').press('Enter');await readyPDF(page,1);await page.locator('#pdf-close').click();await page.waitForFunction(()=>!document.documentElement.classList.contains('portfolio-reading'));checks.push('PASS exact immediate keyboard Enter start-from-first after close');
   }
   assert.deepEqual(env.errors,[]);assert(!env.calls.some(x=>x.method!=='GET'));
  }finally{await env.context.close()}
 }
 assert.deepEqual(hashes(),initialHashes);checks.push('PASS candidate unchanged, no JS errors, no API mutations');
}catch(e){error=String(e);process.exitCode=1}finally{await browser.close();const result={status:error?'FAIL':'PASS',error,source,network:'all requests fulfilled locally or aborted; before variant changed only in route response',browser:'Chrome headless',hashes:initialHashes,checks};fs.writeFileSync(path.join(out,'delta-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))}
