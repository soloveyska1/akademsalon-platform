async (page) => {
  await page.route('**/api/**', route => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,user:null,authenticated:false})}));
  const failures=[]; const results=[]; const errors=[];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/sw.js*',route=>route.abort());
  await page.goto('http://127.0.0.1:8769/prolog.html');
  await page.emulateMedia({reducedMotion:'reduce'});
  for (const theme of ['light','dark']) {
    await page.evaluate(theme => document.documentElement.dataset.theme=theme,theme);
    for (const width of [320,360,390,768,1024,1280,1440]) {
      await page.setViewportSize({width,height:900});
      for(let stage=0;stage<5;stage++) {
        await page.locator('[data-step]').nth(stage).click();
        const r=await page.evaluate(() => {
          const panel=document.querySelector('.journey-panel:not([hidden])');
          const b=panel.getBoundingClientRect();
          const bad=[...document.querySelectorAll('.journey-main a,.journey-main button,.journey-main summary')].filter(e=>e.checkVisibility() && e.getClientRects().length && e.closest('[hidden]')===null).map(e=>({t:(e.innerText||e.ariaLabel||e.textContent||"").slice(0,40),b:e.getBoundingClientRect()})).filter(x=>x.b.width<43.5 || x.b.height<43.5).map(x=>({text:x.t,w:x.b.width,h:x.b.height}));
          return {overflow:document.documentElement.scrollWidth-innerWidth,visible:document.querySelectorAll('.journey-panel:not([hidden])').length,badTargets:bad,panelHeight:b.height};
        });
        results.push({theme,width,stage:stage+1,...r});
        if(r.overflow>1 || r.visible!==1 || r.badTargets.length) failures.push({theme,width,stage:stage+1,...r});
        if([390,1440].includes(width) && [0,1,3,4].includes(stage)) {
          await page.evaluate(()=>scrollTo(0,0));
          await page.screenshot({path:'/tmp/integrated-journey-'+theme+'-'+width+'-'+(stage+1)+'.png',fullPage:true});
        }
      }
    }
  }
  await page.setViewportSize({width:1440,height:900});
  await page.locator('[data-step]').nth(0).click();
  await page.getByRole('button',{name:'Глава',exact:true}).click();
  await page.locator('[data-step]').nth(4).click();
  if(await page.locator('[data-result-file]').textContent()!=='Глава.docx')failures.push('scope persistence failed');
  await page.locator('[data-step]').nth(3).click();
  await page.getByRole('button',{name:'Новая задача',exact:true}).click();
  if(await page.locator('[data-revision-label]').textContent()!=='Сначала согласуем')failures.push('new requirements boundary failed');
  await page.locator('[data-step]').nth(0).focus();
  await page.keyboard.press('End');
  if(await page.locator('[data-step]').nth(4).getAttribute('aria-selected')!=='true')failures.push('End failed');
  await page.keyboard.press('Home');
  if(await page.locator('[data-step]').nth(0).getAttribute('aria-selected')!=='true')failures.push('Home failed');
  await page.keyboard.press('ArrowLeft');
  if(await page.locator('[data-step]').nth(4).getAttribute('aria-selected')!=='true')failures.push('wrap failed');
  await page.goto('http://127.0.0.1:8769/prolog.html#prolog-step-3');
  if(await page.locator('[data-step]').nth(2).getAttribute('aria-selected')!=='true')failures.push('deep link failed');
  return {states:results.length,failures,errors,results};
}
