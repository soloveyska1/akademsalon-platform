async page=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8769/referral.html');await page.emulateMedia({reducedMotion:'reduce'});const results=[];
 for(const theme of ['light','dark'])for(const width of [320,360,390,768,1024,1440]){
 await page.setViewportSize({width,height:900});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
 for(const count of [1,3,5,6]){await page.locator('[data-circle-count="'+count+'"]').click();const r=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,credit:document.getElementById('circle-credit').textContent,due:document.getElementById('circle-due').textContent,next:document.getElementById('circle-next').textContent,small:[...document.querySelectorAll('[data-circle-count]')].filter(e=>e.getBoundingClientRect().width<43.5).length,doublePlus:getComputedStyle(document.querySelector('.circle-fold summary'),'::after').content}));results.push({theme,width,count,...r});}
 if(theme==='light'&&[390,1440].includes(width)){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'/tmp/referral-'+width+'.png',fullPage:true});}
 }
 await page.evaluate(()=>{window.Salon.api.get=async()=>({ok:true,authenticated:true,enabled:true,available:3000,confirmed_count:3,ref_link_tg:'https://t.me/academic_saloon_bot?start=ref_999999999'});window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});await page.locator('#circle-ref-link').waitFor();
 await page.evaluate(()=>{window.Salon.api.get=async()=>({ok:true,authenticated:false});window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});await page.waitForFunction(()=>!document.getElementById('circle-ref-link'));
 const privacy=await page.locator('#circle-personal').textContent();
 await page.goto('http://127.0.0.1:8769/referral-rules.html');const rules={overflow:await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),folds:await page.locator('details.circle-fold').count()};
 return {results,errors,privacyCleared:!privacy.includes('3 000'),rules,failures:results.filter(r=>r.overflow>1||r.small||r.doublePlus==='"+"')};
}
