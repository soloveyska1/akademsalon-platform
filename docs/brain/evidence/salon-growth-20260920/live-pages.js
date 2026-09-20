async page => {
 const rows=[], errors=[], methods=[];
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('request',r=>{if(r.url().includes('/api/'))methods.push({method:r.method(),url:r.url()})});
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:1000});
  for(const path of ['/','/services.html','/komissiya-0.html','/razbor-zamechaniy-nauchruka.html']){
   const response=await page.goto('https://akademsalon.ru'+path,{waitUntil:'load'});
   await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});
   const data=await page.evaluate(()=>({title:document.title,width:innerWidth,theme:document.documentElement.dataset.theme||'light',overflow:document.documentElement.scrollWidth>innerWidth,oldBoxes:document.querySelectorAll('.seo-entry').length,newSections:document.querySelectorAll('.gd-discovery,.gd-support,.gz-main,.gd-related').length,h1:document.querySelector('h1')?.innerText,freeTool:!!document.querySelector('[data-rehearsal]')}));
   if(response.status()!==200||data.overflow||data.oldBoxes||!data.newSections)throw new Error('Live page check failed: '+path+' '+width);
   rows.push({path,status:response.status(),...data});
   if(width===1440&&path==='/'){
    await page.locator('.gd-discovery').scrollIntoViewIfNeeded();
    await page.screenshot({path:'output/playwright/live-home-discovery-desktop.png'});
   }
   if(width===390&&path==='/komissiya-0.html')await page.screenshot({path:'output/playwright/live-commission-mobile.png'});
  }
 }
 await page.evaluate(result=>window.__salonLivePages=result,{checkedAt:new Date().toISOString(),sourceCommit:'449b719fcb5d418aa588e0daa26a4ba6ceaa6f5f',rows,errors,apiRequests:methods,nonGetApi:methods.filter(r=>r.method!=='GET'),expected:'200, no overflow, zero old boxes, new sections present; no submitted orders'});
}
