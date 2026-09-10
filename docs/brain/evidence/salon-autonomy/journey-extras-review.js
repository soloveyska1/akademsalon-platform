async (page) => {
 const calls=[], errors=[], blocked=[]; let auth=true,tgConfirmed=false,hold=false,release,held=false;
 const user={id:-91001,name:'Тестовый клиент',username:null,telegram_connected:false,email_masked:'t•••@example.test'};
 const order={id:91001,no:'QA-91001',status:'done',engagement_ready:true,status_label:'Завершён',work_label:'Тестовая работа',topic:'PRIVATE STALE PAYLOAD',price:10000,deadline_date:'2026-12-20',actions:['review'],due_now:{kind:'prepay',amount:5000,label:'Первый этап'},claimed:false,pay_online:true,bonus_cap:1000,bonus_spent:0,items:[],files:[],messages:[],history:[],payments:[],plan:[],specification_meta:{id:1,snapshot_id:1,data_sha256:'fixture-hash'}};
 const pending={id:42,plan:'plus',label:'Тестовая подписка',price:3900,period_label:'месяц',features:[],status:'pending',claimed:false,requisites:'Тестовые реквизиты',pay_online:false};
 const me=()=>({ok:true,user:{...user},imp:false,oauth:[],bonus:{balance:1000,expiring:[]},deposit:{balance:0},sub:null,sub_pending:pending,milestones:[{id:42,title:"PRIVATE DATE",due:"2026-12-25"}],payment_confirmations:[]});
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
   else if(path==='/plans')r={ok:true,plans:[],features:[],periods:{}};
   else if(path==='/subs/42/paid'){pending.claimed=true;r={ok:true,sub:pending};}
   else if(path==='/subs/42/unpaid'){pending.claimed=false;r={ok:true,sub:pending};}
   else if(path==='/orders/91001/tip')r={ok:true,online:false,tip_id:12,amount:500,requisites:'Тестовые реквизиты'};
   else if(path==='/orders/91001/pay')r={ok:false,error:'quote_changed'};
   return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(r)});
  }
  if(u.origin==='http://127.0.0.1:8771'&&q.method()==='GET'&&!u.pathname.endsWith('/sw.js'))return route.continue();
  blocked.push({url:q.url(),method:q.method()});return route.abort();
 });
 await page.goto('http://127.0.0.1:8771/dashboard.html#plus');
 await page.locator('[data-action=sub-mark]').click();await page.locator('[data-action=sub-unmark]').waitFor();
 const claimedNoPay=await page.locator('[data-action=sub-pay]').count()===0&&await page.locator('[data-action=sub-mark]').count()===0;
 await page.locator('[data-action=sub-unmark]').click();await page.locator('[data-action=sub-mark]').waitFor();
 await page.goto('http://127.0.0.1:8771/dashboard.html#order-91001-terms');
 await page.locator('[data-action=review]').click();
 const unchecked=!(await page.locator('[name=publish]').isChecked())&&!(await page.locator('[name=publish-author]').isChecked());
 await page.locator('[name=text]').fill('Частный отзыв для проверки');
 await page.locator('form[data-form=review] button[type=submit]').click();await page.locator('#ws-dialog').waitFor({state:'hidden'});
 await page.locator('[data-action=tip]').click();
 const tipBeforeSubmit=calls.filter(x=>x.path.endsWith('/tip')).length;
 await page.locator('form[data-form=tip] button[type=submit]').click();await page.locator('[data-action=tip-claim]').waitFor();
 const tipBeforeClaim=calls.filter(x=>x.path.endsWith('/claim')).length;
 await page.locator('[data-action=tip-claim]').click();await page.locator('#ws-dialog').waitFor({state:'hidden'});
 await page.locator('a[href="#calendar"]').first().click();
 const dlPromise=page.waitForEvent('download');await page.locator('[data-action=calendar-export]').click();const dl=await dlPromise;await dl.saveAs('/tmp/journey-calendar.ics');
 await page.locator('a[href="#profile"]').click();
 await page.locator('[data-action=privacy-settings]').click();
 const analyticsUnchecked=!(await page.locator('[name=analytics]').isChecked());await page.locator('form[data-form=privacy] button[type=submit]').click();
 const consent=await page.evaluate(()=>Salon.consent.read());
 return {claimedNoPay,unchecked,tipBeforeSubmit,tipBeforeClaim,analyticsUnchecked,consent,mutations:calls.filter(x=>x.method==='POST'),errors,blocked};
}
