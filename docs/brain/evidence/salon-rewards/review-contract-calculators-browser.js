async page=>{
const ctx=await page.context().browser().newContext({serviceWorkers:'block'}),p=await ctx.newPage(),results=[],errors=[];
await ctx.route('**/*',r=>{const url=r.request().url();if(url.includes('/api/'))return r.fulfill({status:200,contentType:'application/json',body:'{"ok":false,"error":"unauthorized"}'});if(url.startsWith('http://127.0.0.1:8771/'))return r.continue();return r.fulfill({status:204,body:''});});
p.on('pageerror',e=>errors.push(e.message));
const check=(name,ok,detail)=>results.push({name,pass:!!ok,...(detail?{detail}: {})});
try{
 await p.goto('http://127.0.0.1:8771/benefits.html#bonuses');
 for(const value of ['', '0','500001','2500.5']){await p.locator('#rw-order').fill(value);check('bonus invalid '+JSON.stringify(value),await p.locator('.rw-bonus-card').isHidden());}
 await p.locator('#rw-order').fill('14000');check('bonus valid restores result',await p.locator('.rw-bonus-card').isVisible());
 await p.evaluate(()=>{Date.now=()=>new Date('2026-09-22T00:00:00+03:00').getTime();window.dispatchEvent(new Event('focus'));});
 check('expired promo hidden on focus',await p.locator('#rw-promo-option').isHidden());
 await p.goto('http://127.0.0.1:8771/plus.html');
 for(const value of ['', '0','21','2.5']){await p.locator('#rw-plan-count').fill(value);check('plan invalid '+JSON.stringify(value),await p.locator('.rw-plan-verdict').isHidden());}
 await p.locator('#rw-plan-count').fill('3');check('valid plan restores result',await p.locator('.rw-plan-verdict').isVisible());
 await p.locator('#rw-plan-price').fill('');await p.locator('[data-period="month"]').click();
 const fee=await p.locator('[data-plan-fee="plus"]').textContent(),days=await p.locator('[data-plan-days="plus"]').textContent();
 check('fixed plan tariff updates despite invalid estimate input',/449/.test(fee)&&/30/.test(days),{fee,days});
}finally{await ctx.close();}
return {results,errors,pass:results.every(x=>x.pass)&&!errors.length,productionMutations:0};
}
