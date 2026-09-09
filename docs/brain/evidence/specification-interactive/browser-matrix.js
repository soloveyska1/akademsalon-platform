async page => {
 await page.evaluate(async()=>{for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();for(const k of await caches.keys())await caches.delete(k)});
 await page.route('**/sw.js*',r=>r.abort());
 await page.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"user":null,"authenticated":false}'}));
 await page.goto('http://127.0.0.1:8774/specifikaciya.html');
 await page.emulateMedia({reducedMotion:'reduce'});
 const results=[],failures=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const theme of ['light','dark']){
  await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  for(const width of [320,360,390,768,1024,1440]){
   await page.setViewportSize({width,height:900});
   for(let field=0;field<4;field++){
    await page.locator('[data-field]').nth(field).click();
    const value=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,panels:[...document.querySelectorAll('[data-annotation]')].filter(e=>!e.hidden).length,footer:getComputedStyle(document.querySelector('.salon-bottom')).backgroundColor,small:[...document.querySelectorAll('.specification-main a,.specification-main button,.specification-main summary')].filter(e=>e.checkVisibility()).map(e=>({text:e.textContent.trim().slice(0,40),w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})).filter(e=>e.w<43.5||e.h<43.5)}));
    results.push({theme,width,field:field+1,...value});
    if(value.overflow>1||value.panels!==1||value.small.length||value.footer!=='rgb(41, 35, 55)')failures.push({theme,width,field:field+1,...value});
    if([390,1440].includes(width)&&[0,3].includes(field)){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'output/playwright/spec-'+theme+'-'+width+'-'+(field+1)+'.png',fullPage:true});}
   }
  }
 }
 await page.setViewportSize({width:1440,height:900});
 await page.locator('[data-field]').nth(0).focus();await page.keyboard.press('End');
 if(await page.locator('[data-field]').nth(3).getAttribute('aria-selected')!=='true')failures.push('End failed');
 await page.keyboard.press('ArrowDown');if(await page.locator('[data-field]').nth(0).getAttribute('aria-selected')!=='true')failures.push('wrap failed');
 await page.getByText('Кто автор и что с правами',{exact:false}).first().click();
 for(let mode=0;mode<4;mode++){
  await page.locator('[data-mode-tab]').nth(mode).click();
  if(!await page.locator('[data-mode-panel]').nth(mode).isVisible())failures.push('mode hidden '+mode);
 }
 const modeText=await page.locator('[data-mode-panel]').nth(1).textContent();
 if(!modeText.includes('рабочий черновик')||!modeText.includes('дорабатываешь ты'))failures.push('A2 meaning lost');
 await page.goto('http://127.0.0.1:8774/specifikaciya.html#agreement-field-4');
 await page.locator('[data-field][aria-selected="true"][data-field="3"]').waitFor();if(await page.locator('[data-field]').nth(3).getAttribute('aria-selected')!=='true')failures.push('deep link failed');
 return {states:results.length,failures,errors,results};
}
