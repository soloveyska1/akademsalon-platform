async page=>{
 const errors=[],failures=[],answers=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failures.push(r.url()));
 await page.setViewportSize({width:1280,height:900});
 await page.goto('https://akademsalon.ru/?listik=release209');
 await page.getByRole('button',{name:'Открыть Листика, бота-помощника Салона'}).click();
 async function ask(q){const response=page.waitForResponse(r=>r.url().includes('/api/assistant/answer')&&r.request().method()==='POST');await page.getByRole('textbox',{name:'Сообщение Листику'}).fill(q);await page.getByRole('button',{name:'Отправить вопрос',exact:true}).click();const raw=await response;const body=await raw.json();if(!body.ok||body.version!=='listik-concierge-2026-09-11.1')throw new Error(JSON.stringify(body));await page.waitForFunction(()=>document.querySelector('#sa-feed').getAttribute('aria-busy')==='false');answers.push({q,status:raw.status(),source:body.source,version:body.version,sources:body.sources});return body;}
 const social=await ask('Как дела?');if(social.source!=='social')throw new Error('wrong social');
 const order=await ask('Хочу заказать курсовую на тему Мотивация студентов, срок: 2026-12-20');
 if(order.context.brief.topic!=='Мотивация студентов')throw new Error('missing live draft');
 await page.locator('.sa-order-action').last().click();const frame=page.frameLocator('.sa-order-frame');await frame.locator('#topic').waitFor();await page.waitForFunction(()=>document.querySelector('.sa-order-state').textContent.includes('перенесён'));
 if(await frame.locator('#topic').inputValue()!=='Мотивация студентов'||await frame.locator('#consent').isChecked()||await frame.locator('#participation').isChecked())throw new Error('live form contract');
 await page.screenshot({path:'/Users/saymurrbk.ru/.codex/worktrees/listik-concierge/docs/brain/evidence/listik-concierge/live-intake-desktop.png'});
 // Read-only production verification: leave the real order form unsubmitted.
 await page.goto('https://akademsalon.ru/shop.html?listik=release209');await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Открыть Листика, бота-помощника Салона'}).click();const benefit=await ask('Какие скидки есть?');if(benefit.source!=='store'||benefit.answer.includes('ПЕРВЫЙЛИСТ')||!benefit.answer.includes('5%'))throw new Error('mixed live discounts');
 await page.screenshot({path:'/Users/saymurrbk.ru/.codex/worktrees/listik-concierge/docs/brain/evidence/listik-concierge/live-store-answer-mobile.png'});
 await page.getByRole('button',{name:'Свернуть чат'}).click();const width=await page.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}));
 if(width.scroll>width.w||errors.length)throw new Error(JSON.stringify({width,errors}));
 return {answers,errors,failures,liveIntakePrefilled:true,consentUnchecked:true,productionSubmissions:0,width};
}
