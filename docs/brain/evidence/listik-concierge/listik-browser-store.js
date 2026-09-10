async page=>{
 await page.unroute('**/api/assistant/answer');
 await page.evaluate(async()=>{for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();for(const k of await caches.keys())await caches.delete(k)});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const results=[];
 for(const width of [390,1280]){
  await page.setViewportSize({width,height:900});
  await page.goto('http://127.0.0.1:8784/shop.html');
  await page.getByRole('button',{name:'Открыть Листика, бота-помощника Салона'}).click();
  await page.getByRole('textbox',{name:'Сообщение Листику'}).fill('Какие скидки есть?');
  await page.getByRole('button',{name:'Отправить вопрос',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#sa-feed').getAttribute('aria-busy')==='false');
  if(await page.locator('.sa-answer').last().innerText().then(s=>s.length<100||s.includes('ПЕРВЫЙЛИСТ')||!s.includes('5%')))throw new Error('no shop answer');
  await page.getByRole('button',{name:'Свернуть чат'}).click();
  const g=await page.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth,title:document.querySelector('h1').textContent,buttons:document.querySelectorAll('[data-action]').length}));
  if(await page.locator('.mobile-appbar,.mobile-cta,.skip-link').count())throw new Error('store chrome replaced');
  if(await page.locator('.site-header').count()!==1)throw new Error('store header changed');
  if(g.scroll>g.w)throw new Error('store overflow');results.push({width,...g});
  await page.screenshot({path:'/Users/saymurrbk.ru/.codex/worktrees/listik-concierge/docs/brain/evidence/listik-concierge/store-'+width+'.png'});
 }
 await page.goto('http://127.0.0.1:8784/shop-terms.html');await page.getByRole('button',{name:'Открыть Листика, бота-помощника Салона'}).waitFor();
 if(errors.length)throw new Error(JSON.stringify(errors));return {results,errors,termsHasListik:true};
}
