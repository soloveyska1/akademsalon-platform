async page=>{
const browser=page.context().browser(),results=[],errors=[],calls=[];
const base='http://127.0.0.1:8771';
async function run(name,{state='pending',create,restore=false,publicCode=false,restoreError=null,guard=false},check){
 const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:1000,height:900}}),p=await ctx.newPage();
 p.on('pageerror',e=>errors.push(name+': '+e.message));
 await ctx.route('**/*',async route=>{const req=route.request(),u={origin:(req.url().match(/^https?:\/\/[^/]+/)||[])[0]},path=req.url().replace(/^https?:\/\/[^/]+/,'').split('?')[0];const headers={'access-control-allow-origin':base,'access-control-allow-credentials':'true','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'};
  if(path.startsWith('/api/')){if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});calls.push({case:name,path,method:req.method()});let r={ok:false,error:'unauthorized'};
   if(path==='/api/gift/config')r={ok:true,min:2000,max:50000,presets:[3000,5000,10000,15000],deliver_max_days:90,pay_online:true};
   if(path==='/api/gift/state'||path==='/api/gift/view')r=restoreError||{ok:true,gift:{id:41,state,amount:5000,balance:state==='active'?5000:0,pay_online:true,claimed:false,serial:'FIXTURE',code:state==='pending'?undefined:'AS-FIXTURE',recip_name:'Fixture'}};
   if(path==='/api/gift'&&req.method()==='POST')r=create;
   return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(r)});
  }
  if(u.origin===base)return route.continue();return route.fulfill({status:204,body:''});
 });
 if(guard)await ctx.addInitScript(()=>sessionStorage.setItem('salon_gift_creation_uncertain','1'));
 await p.goto(base+'/gift.html'+(restore?'#buy=41&t=fixture-token':publicCode?'?code=AS-FIXTURE':''));
 await p.waitForFunction(()=>window.Salon?.api&&document.getElementById('giftPrepare'));
 await p.waitForTimeout(150);
 try{await check(p);results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.message});}finally{await ctx.close();}
}
async function submit(p){await p.locator('#giftPrepare').click();await p.locator('#giftBuyerEmail').fill('fixture@example.test');await p.locator('#giftConsent').check();await p.locator('#giftSubmit').click();await p.waitForTimeout(100);}
for(const state of ['pending','active','spent','expired','refunded','unknown'])await run('restore '+state,{restore:true,state},async p=>{const status=await p.locator('#giftPaymentStatus').textContent();if(['expired','refunded','unknown'].includes(state)&&/выпущен|Оплата подтверждена|Деньги не списаны/.test(status))throw Error('false issue/payment claim');if(state==='active'&&!/выпущен/.test(status))throw Error('active not usable');if(!(await p.locator('#giftSubmit').isDisabled()))throw Error('duplicate create enabled');});
await run('known create rejection',{create:{ok:false,error:'bad_email'}},async p=>{await submit(p);if(await p.locator('#giftSubmit').isDisabled())throw Error('known rejection not retryable');});
await run('unknown create locks across reload',{create:{ok:false,error:'bad_json'}},async p=>{await submit(p);if(!(await p.locator('#giftSubmit').isDisabled()))throw Error('unconfirmed retry enabled');await p.reload();if(!(await p.locator('#giftSubmit').isDisabled()))throw Error('reload removed guard');});
await run('successful create blocks duplicate',{create:{ok:true,gift:{id:41,state:'pending',amount:5000,pay_online:true},buy_token:'fixture-token'}},async p=>{await submit(p);if(!(await p.locator('#giftSubmit').isDisabled()))throw Error('duplicate create enabled');});
await run('unknown restore must block new create',{restore:true,restoreError:{ok:false,error:'network'}},async p=>{if(!(await p.locator('#giftSubmit').isDisabled()))throw Error('restore network enabled duplicate creation');});
await run('public code cleaned',{publicCode:true,state:'active'},async p=>{if(p.url().includes('code='))throw Error('code stays in URL');if(!(await p.locator('#giftViewUse').isVisible()))throw Error('active certificate unusable');});
return {results,errors,calls,productionMutations:0,total:results.length,pass:results.every(x=>x.pass)&&errors.length===0};
}
