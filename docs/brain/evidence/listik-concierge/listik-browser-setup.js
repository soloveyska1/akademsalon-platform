async (page) => {
 await page.unroute('**/api/**');
 await page.route('**/api/**',async route=>{
  const path=route.request().url().replace(/^https?:\/\/[^/]+/,'').split('?')[0];
  if(path==='/api/assistant/answer'){const r=await route.fetch({url:'http://127.0.0.1:8784'+path});await route.fulfill({response:r});return;}
  const responses={'/api/auth/session':{ok:true,authenticated:false},'/api/features':{ok:true,pay_online:true},'/api/me':{ok:false,error:'unauthorized'}};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(responses[path]||{ok:false,error:'local_mutation_blocked'})});
 });
 await page.reload();await page.getByRole('button',{name:'Открыть Листика, бота-помощника Салона'}).click();
 await page.getByRole('textbox',{name:'Сообщение Листику'}).fill('Как дела?');await page.getByRole('button',{name:'Отправить вопрос',exact:true}).click();
 await page.locator('.sa-answer:not(.sa-pending) .sa-bubble').last().getByText('Привет! Я на связи',{exact:false}).waitFor();
 await page.waitForFunction(()=>document.querySelector('#sa-feed').getAttribute('aria-busy')==='false');
 console.log(await page.locator('.sa-answer').last().innerText());
 await page.screenshot({path:'/Users/saymurrbk.ru/.codex/worktrees/listik-concierge/docs/brain/evidence/listik-concierge/social-desktop.png'});
}
