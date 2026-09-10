async initial=>{
 const ctx=await initial.context().browser().newContext({serviceWorkers:'block'});const page=await ctx.newPage();const errors=[],requests=[],rows=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith('http://127.0.0.1:8770/')&&r.status()>=400)requests.push({url:r.url(),status:r.status()})});
 await ctx.route('**/*',r=>{const u=r.request().url();if(u.includes('/api/'))return r.fulfill({json:u.endsWith('/features')?{ok:true,email_login:true,vk_login:true,pay_online:true,community_rewards:true}:{ok:true,authenticated:false,user:null,orders:[]}});if(u.startsWith('http://127.0.0.1:8770/'))return r.continue();return r.fulfill({status:200,body:'',contentType:'text/plain'})});
 const routes=['/','/services.html','/configurator.html','/samples.html','/benefits.html','/plus.html','/deposit.html','/referral.html','/dashboard.html','/oplata.html','/prolog.html','/specifikaciya.html'];
 try{
 for(const width of [360,390,768,1024,1280,1440])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});await page.addInitScript(t=>localStorage.setItem('salon_theme',t),theme);
  for(const route of routes){
   await page.goto('http://127.0.0.1:8770'+route,{waitUntil:'domcontentloaded'});await page.waitForTimeout(110);
   const row=await page.evaluate(()=>({title:document.title,heading:document.querySelector('main h1,#cabRoot h1')?.textContent,overflow:document.documentElement.scrollWidth>innerWidth+1,preview:!!document.querySelector('script[src*="__site-preview"],script[src*="cabinet-demo"]'),brokenImages:[...document.images].filter(i=>i.complete&&i.naturalWidth===0).map(i=>i.src)}));rows.push({route,width,theme,...row});
   if((width===390||width===1440)&&theme==='light'&&['/','/dashboard.html','/configurator.html','/specifikaciya.html'].includes(route))await page.screenshot({path:'docs/brain/evidence/salon-product/production/'+route.replaceAll('/','').replace('.html','')+'-'+width+'.png',fullPage:true,animations:'disabled'});
  }
 }
 return{data:'synthetic signed-out API; all external traffic intercepted; no mutations',browser:await ctx.browser().version(),states:rows.length,failures:rows.filter(r=>r.overflow||r.preview||r.brokenImages.length),errors,requests,rows};
 }finally{await ctx.close()}
}
