async page=>{
 const submissions=[],uploads=[],questions=[];
 await page.route('**/api/orders',async route=>{const body=route.request().postDataJSON();submissions.push(body);await route.fulfill({status:submissions.length===1?500:200,contentType:'application/json',body:JSON.stringify(submissions.length===1?{ok:false,error:'temporary_error'}:{ok:true,id:77777,token:'synthetic_listik_token_77777'})});});
 await page.route('**/api/orders/77777/upload',async route=>{uploads.push(1);await route.fulfill({status:uploads.length===1?500:200,contentType:'application/json',body:JSON.stringify(uploads.length===1?{ok:false,error:'temporary_error'}:{ok:true})});});
 const frame=page.frameLocator('.sa-order-frame');
 await frame.locator('#contact').fill('listik-fixture@example.test');await frame.locator('#consent').check();await frame.locator('#participation').check();
 await frame.locator('#files').setInputFiles('/tmp/listik-fixture.txt');
 await frame.locator('#send-order').click();
 await frame.getByText('Пока нет подтверждения сервера.',{exact:false}).waitFor();
 if(submissions.length!==1)throw new Error('unexpected submission count');
 await page.evaluate(()=>location.hash='order-202');
 await frame.locator('#send-order').waitFor();
 if(!await page.locator('#sa-context').innerText().then(s=>s.includes('сохранено')))throw new Error('route lost pending context');
 await page.getByRole('button',{name:'Свернуть чат'}).click();await page.getByRole('button',{name:'Открыть Листика, бота-помощника Салона'}).click();
 await frame.locator('#send-order').click();await frame.locator('#success-id').getByText('77777',{exact:true}).waitFor();
 if(submissions.length!==2||submissions[0].client_request_id!==submissions[1].client_request_id||JSON.stringify(submissions[0])!==JSON.stringify(submissions[1]))throw new Error('retry changed identity or payload');
 await frame.getByRole('button',{name:'Повторить загрузку'}).click();await frame.getByText('файл передан',{exact:false}).waitFor();
 if(uploads.length!==2)throw new Error('upload retry not isolated');
 await page.getByRole('button',{name:'К разговору',exact:false}).click();
 await page.route('**/api/assistant/answer',async route=>{questions.push(route.request().postDataJSON());await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,answer:'Текущий синтетический заказ на проверке задания.',context:{topic:'order'},source:'order',order_id:77777})});});
 await page.getByRole('textbox',{name:'Сообщение Листику'}).fill('Что дальше по моему заказу?');await page.getByRole('button',{name:'Отправить вопрос',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#sa-feed').getAttribute('aria-busy')==='false');
 if(questions.at(-1).order_id!==77777)throw new Error('accepted order not bound');
 await page.screenshot({path:'/Users/saymurrbk.ru/.codex/worktrees/listik-concierge/docs/brain/evidence/listik-concierge/accepted-mobile.png'});
 return {submissions:submissions.length,sameRequestId:true,hashPreservesAttempt:true,uploads:uploads.length,boundOrder:questions.at(-1).order_id,consent:submissions[0].consent,participation:submissions[0].author_participation?.confirmed};
}
