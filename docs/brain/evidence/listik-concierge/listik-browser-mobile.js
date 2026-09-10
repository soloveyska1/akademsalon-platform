async page=>{
 await page.unroute('**/api/assistant/answer');await page.evaluate(async()=>{for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();for(const k of await caches.keys())await caches.delete(k)});
 await page.setViewportSize({width:390,height:844});
 // Restart this synthetic session before any form submission; no customer data exists.
 await page.goto('http://127.0.0.1:8784/');await page.getByRole('button',{name:'Открыть Листика, бота-помощника Салона'}).click();
 async function ask(q){await page.getByRole('textbox',{name:'Сообщение Листику'}).fill(q);await page.getByRole('button',{name:'Отправить вопрос',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#sa-feed').getAttribute('aria-busy')==='false');}
 await ask('Хочу заказать курсовую, тема: мотивация студентов, срок: 2026-12-20, 30 страниц');
 await page.screenshot({path:'/Users/saymurrbk.ru/.codex/worktrees/listik-concierge/docs/brain/evidence/listik-concierge/draft-mobile.png'});
 await page.locator('.sa-order-action').last().click();
 const frame=page.frameLocator('.sa-order-frame');await frame.locator('#topic').waitFor();
 await page.waitForFunction(()=>document.querySelector('.sa-order-state').textContent.includes('перенесён'));
 const geometry=await frame.locator('body').evaluate(b=>({width:innerWidth,scroll:document.documentElement.scrollWidth,header:getComputedStyle(document.querySelector('header')).display,topic:document.querySelector('#topic').value,details:document.querySelector('#details').value}));
 if(geometry.topic!=='мотивация студентов'||geometry.header!=='none'||geometry.scroll>geometry.width)throw new Error(JSON.stringify(geometry));
 await page.screenshot({path:'/Users/saymurrbk.ru/.codex/worktrees/listik-concierge/docs/brain/evidence/listik-concierge/intake-mobile.png'});
 return geometry;
}
