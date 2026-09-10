async (page)=>{
 async function ask(q){await page.getByRole('textbox',{name:'Сообщение Листику'}).fill(q);await page.getByRole('button',{name:'Отправить вопрос',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#sa-feed').getAttribute('aria-busy')==='false');}
 await ask('Хочу заказать курсовую');await ask('Тема: мотивация студентов');await ask('Срок: 2026-12-20');
 await page.locator('.sa-order-action').last().click();
 const form=page.frameLocator('.sa-order-frame');
 await form.locator('#topic').waitFor();await form.locator('#topic').filter({visible:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('.sa-order-state').textContent.includes('перенесён'));
 const values=await form.locator('#direct-order').evaluate(f=>Object.fromEntries(['product','topic','deadline','details','consent','participation'].map(k=>{const e=document.getElementById(k);return[k,e?.type==='checkbox'?e.checked:e?.value]})));
 if(values.topic!=='мотивация студентов'||values.deadline!=='2026-12-20'||values.consent!==false||values.participation!==false)throw new Error(JSON.stringify(values));
 await page.screenshot({path:'/Users/saymurrbk.ru/.codex/worktrees/listik-concierge/docs/brain/evidence/listik-concierge/intake-desktop.png'});
 await page.getByRole('button',{name:'К разговору',exact:false}).click();
 await ask('Какие скидки есть?');await page.locator('.sa-order-action').last().click();
 if(await form.locator('#topic').inputValue()!=='мотивация студентов')throw new Error('iframe draft lost');
 return values;
}
