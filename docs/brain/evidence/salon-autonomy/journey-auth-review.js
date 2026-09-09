async (page) => {
 const calls=[], errors=[], blocked=[]; let auth=false,tgConfirmed=false,hold=false,release,held=false;
 const user={id:-91001,name:'Тестовый клиент',username:null,telegram_connected:false,email_masked:'t•••@example.test'};
 const order={id:91001,no:'QA-91001',status:'prepay',status_label:'Ожидает оплаты',work_label:'Тестовая работа',topic:'PRIVATE STALE PAYLOAD',price:10000,deadline_date:'2026-12-20',actions:['paid','bonus_cancel','gift_remove'],due_now:{kind:'prepay',amount:5000,label:'Первый этап'},claimed:false,pay_online:true,bonus_cap:1000,bonus_spent:0,items:[],files:[],messages:[],history:[],payments:[],plan:[],specification_meta:{id:1,snapshot_id:1,data_sha256:'fixture-hash'}};
 const me=()=>({ok:true,user:{...user},imp:false,oauth:[],bonus:{balance:1000,expiring:[]},deposit:{balance:0},sub:null,sub_pending:null,milestones:[],payment_confirmations:[]});
 page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/*',async route=>{
  const q=route.request(),u={pathname:q.url().replace(/^https?:\/\/[^/]+/,'').split('?')[0],origin:(q.url().match(/^https?:\/\/[^/]+/)||[])[0]};
  if(u.pathname.startsWith('/api/')){
   const path=u.pathname.slice(4);const headers={'access-control-allow-origin':'http://127.0.0.1:8771','access-control-allow-credentials':'true','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'};
   if(q.method()==='OPTIONS')return route.fulfill({status:204,headers});
   const body=q.postDataJSON();calls.push({path,method:q.method(),body});let r={ok:true};
   if(path==='/auth/session')r={ok:true,authenticated:auth,guest_session:false,user:auth?user:null};
   else if(path==='/features')r={ok:true,email_login:true,vk_login:false,mailru_login:false,community_rewards:true,pay_online:true};
   else if(path==='/orders')r={ok:true,authorized:auth,orders:auth?[order]:[]};
   else if(path==='/me')r=auth?me():{ok:false,error:'unauthorized'};
   else if(path==='/auth/email/start')r={ok:true,ttl:600};
   else if(path==='/auth/email/verify'){auth=true;r={ok:true,session:true,user};}
   else if(path==='/auth/logout'){auth=false;r={ok:true};}
   else if(path==='/auth/start')r={ok:true,code:'fixture',poll_state:'fixture-poll',ttl:900,link:'https://t.me/academic_saloon_bot?start=auth_fixture'};
   else if(path==='/auth/poll'){if(tgConfirmed){auth=true;user.id=91001;user.telegram_connected=true;r={ok:true,pending:false,session:true,user};}else r={ok:true,pending:true};}
   else if(path==='/orders/91001'){if(hold){held=true;await new Promise(res=>release=res);}r={ok:true,order:{...order}};}
   else if(path==='/orders/91001/action'){if(body.action==='bonus_apply')order.bonus_spent=body.amount;r={ok:true,order};}
   else if(path==='/orders/91001/pay')r={ok:false,error:'quote_changed'};
   return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(r)});
  }
  if(u.origin==='http://127.0.0.1:8771'&&q.method()==='GET'&&!u.pathname.endsWith('/sw.js'))return route.continue();
  blocked.push({url:q.url(),method:q.method()});return route.abort();
 });
 await page.goto('http://127.0.0.1:8771/dashboard.html');
 await page.locator('#ws-email').fill('test@example.test');
 await page.locator('form[data-form=email] button[type=submit]').click();
 await page.locator('[name=code]').fill('123456');
 await page.locator('[name=code]').press('Enter');
 await page.locator('.ws-shell').waitFor();
 const email={starts:calls.filter(x=>x.path==='/auth/email/start').length,verifies:calls.filter(x=>x.path==='/auth/email/verify').length,body:calls.find(x=>x.path==='/auth/email/verify')?.body};
 await page.locator('a[href="#benefits"]').first().click(); await page.locator('h1').filter({hasText:'Приятно быть своим'}).waitFor();
 await page.goto('http://127.0.0.1:8771/dashboard.html#order-91001-money');
 await page.locator('form[data-form=bonus]').locator('..').locator('summary').count().catch(()=>0);
 await page.locator('summary').filter({hasText:'Бонусы и сертификат'}).click();
 await page.locator('form[data-form=bonus] input').fill('500');
 await page.locator('form[data-form=bonus] button[type=submit]').click();
 await page.waitForFunction(()=>document.querySelector('.ws-main')?.textContent.includes('500'));
 await page.locator('form[data-form=pay] [name=email]').fill('test@example.test');
 await page.locator('form[data-form=pay] [name=accept]').check();
 await page.locator('form[data-form=pay] button[type=submit]').click();
 await page.locator('#ws-notice').filter({hasText:'Смета обновилась'}).waitFor();
 const financial={post:calls.filter(x=>x.path.endsWith('/action')||x.path.endsWith('/pay')),errorVisible:await page.locator('#ws-notice').innerText(),buttonEnabled:await page.locator('form[data-form=pay] button[type=submit]').isEnabled()};
 await page.locator('a[href="#profile"]').click();await page.locator('[data-action=logout]').click();await page.locator('#ws-email').waitFor();
 await page.locator('[data-action=tg-login]').click();await page.locator('#ws-tg-state a').waitFor();
 const pendingVisible=await page.locator('#ws-tg-state').innerText();tgConfirmed=true;
 await page.locator('.ws-shell').waitFor({timeout:8000});
 const telegram={pendingVisible,polls:calls.filter(x=>x.path==='/auth/poll').length};
 await page.locator('a[href="#profile"]').click();await page.locator('[data-action=logout]').waitFor();
 hold=true;await page.evaluate(()=>location.hash='order-91001');
 for(let i=0;i<20&&!held;i++)await page.waitForTimeout(50);
 await page.locator('[data-action=logout]').click();await page.locator('#ws-email').waitFor();release();
 await page.waitForTimeout(300);
 const stale={held,loginVisible:await page.locator('#ws-email').isVisible(),privatePayloadVisible:(await page.locator('body').innerText()).includes('PRIVATE STALE PAYLOAD')};
 return {email,financial,telegram,stale,errors,blocked,apiCalls:calls.length,productionRenderer:!await page.locator('.ws-demo-band').count()};
}
