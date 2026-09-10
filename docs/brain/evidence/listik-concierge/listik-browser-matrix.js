async page=>{
 const results=[];
 await page.unroute('**/api/assistant/answer');
 await page.evaluate(async()=>{for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();for(const k of await caches.keys())await caches.delete(k)});
 for(const width of [360,390,768,1024,1440]){
  await page.setViewportSize({width,height:844});
  for(const theme of ['light','dark']){
   await page.goto('http://127.0.0.1:8784/');await page.evaluate(t=>{localStorage.setItem('salon_theme',t);document.documentElement.dataset.theme=t},theme);
   await page.getByRole('button',{name:'Открыть Листика, бота-помощника Салона'}).click();
   await page.getByRole('textbox',{name:'Сообщение Листику'}).fill('Чем объект отличается от предмета?');await page.getByRole('button',{name:'Отправить вопрос',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('#sa-feed').getAttribute('aria-busy')==='false');
   const a=await page.locator('#salon-assistant').evaluate(p=>{const r=p.getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom,width:innerWidth,body:document.documentElement.scrollWidth,scroll:p.scrollWidth,client:p.clientWidth,answer:p.querySelector('.sa-answer p')?.textContent,source:!!p.querySelector('.sa-sources a'),input:getComputedStyle(p.querySelector('textarea')).fontSize}});
   if(a.left<0||a.right>a.width||a.bottom>844||a.scroll>a.client||!a.source||!a.answer.includes('Объект'))throw new Error(JSON.stringify({width,theme,...a}));
   if(width<=390&&parseFloat(a.input)<16)throw new Error('small input');
   results.push({width,theme,pass:true});
   if(width===390&&theme==='dark')await page.screenshot({path:'/Users/saymurrbk.ru/.codex/worktrees/listik-concierge/docs/brain/evidence/listik-concierge/answer-dark-mobile.png'});
   await page.getByRole('button',{name:'Свернуть чат'}).click();
   if(!await page.getByRole('button',{name:'Открыть Листика, бота-помощника Салона'}).evaluate(e=>e===document.activeElement))throw new Error('focus not restored');
  }
 }
 await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Открыть Листика, бота-помощника Салона'}).click();
 await page.getByRole('textbox',{name:'Сообщение Листику'}).fill('Кто создатель?');await page.getByRole('button',{name:'Отправить вопрос',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#sa-feed').getAttribute('aria-busy')==='false');
 if(await page.locator('.sa-show-now').count())throw new Error('reduced motion reveals characters');
 return {geometry:results,reducedMotion:true,focusReturn:true};
}
