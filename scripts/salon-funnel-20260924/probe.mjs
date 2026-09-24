// Hermetic actual-browser reproduction. Every HTTP request is intercepted.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require=createRequire(process.env.SALON_NODE_DEPS+'/package.json');
const {chromium}=require('playwright');
const root=path.resolve(process.argv[2]);
const browser=await chromium.launch({headless:true,channel:"chrome"});
const context=await browser.newContext({serviceWorkers:'block'});
const events=[];const errors=[];const api=[];
await context.addInitScript(()=>{
 const now=Date.now();localStorage.setItem('salon_consent',JSON.stringify({v:3,analytics:true,at:new Date(now-60000).toISOString(),expiresAt:new Date(now+86400000).toISOString()}));
});
await context.route('**/*',async route=>{
 const r=route.request(),u=new URL(r.url());
 if(u.hostname!=='akademsalon.ru')return route.abort();
 if(u.pathname.startsWith('/api/')){
  api.push(u.pathname);
  if(u.pathname==='/api/analytics/grant')return route.fulfill({json:{ok:true,grant:'test-signed-grant-12345',expires_at:Math.floor(Date.now()/1000)+3600}});
  if(u.pathname==='/api/analytics/events'){const body=r.postDataJSON();events.push(...body.events);return route.fulfill({json:{ok:true,processed:body.events.map(e=>e.event_id)}})}
  return route.fulfill({json:{ok:true,authenticated:false,pay_online:true}});
 }
 const f=path.join(root,u.pathname==='/'?'index.html':decodeURIComponent(u.pathname));
 if(!f.startsWith(root+'/')||!fs.existsSync(f))return route.abort();
 const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp'}[path.extname(f)]||'application/octet-stream';
 return route.fulfill({path:f,contentType:mime});
});
try{
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://akademsalon.ru/guide-kursovaya-za-nedelyu.html');
 await page.locator('.read-cta a').click();
 await page.locator('#topic').fill('Synthetic private topic');
 await page.locator('#send-order').click();
 await page.waitForTimeout(1800);
 console.log(JSON.stringify({root,product:await page.locator('#product').inputValue(),events:events.map(e=>({event:e.event,cta:e.cta_id})),errors,api:[...new Set(api)]},null,2));
}finally{await browser.close()}
