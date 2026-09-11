// Pass to playwright-cli run-code. Local anonymous fixture, no real submissions.
async (page) => {
  const requests=[],errors=[],results=[];
  await page.context().route('**/api/**',async route=>{
    requests.push({method:route.request().method(),path:route.request().url().replace(/^https?:\/\/[^/]+/,'').split('?')[0]});
    await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'http://127.0.0.1:4317','Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type, Authorization'},body:JSON.stringify({ok:true,user:null,authenticated:false})});
  });
  page.on('pageerror',e=>errors.push(String(e)));
  for(const file of ['index.html','services.html','razbor-zamechaniy-nauchruka.html','normokontrol-vkr.html','guide-kursovaya-za-nedelyu.html','komissiya-0.html']){
    await page.goto('http://127.0.0.1:4317/'+file);
    await page.evaluate(()=>document.fonts.ready);
    for(const width of [360,390,768,1024,1440])for(const theme of ['light','dark']){
      await page.setViewportSize({width,height:900});
      await page.evaluate(async theme=>{document.documentElement.dataset.theme=theme;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))},theme);
      const result=await page.evaluate(()=>{
        const section=document.querySelector('[data-seo-entry]'),r=section.getBoundingClientRect();
        const controls=[...section.querySelectorAll('a')].map(a=>({text:a.textContent,height:a.getBoundingClientRect().height,width:a.getBoundingClientRect().width}));
        return {viewport:innerWidth,body:document.documentElement.scrollWidth,section:{left:r.left,right:r.right,width:r.width},tooSmall:controls.filter(a=>a.height<43||a.width<43)};
      });
      results.push({file,width,theme,...result});
      if(width===390&&theme==='light'||width===1440&&theme==='dark'){
        await page.locator('[data-seo-entry]').scrollIntoViewIfNeeded();
        await page.screenshot({path:`output/seo/${file}-${width}-${theme}.png`});
      }
    }
  }
  for(const service of ['nm','df','rv']){
    await page.goto('http://127.0.0.1:4317/configurator.html?service='+service);
    const result=await page.evaluate(()=>({product:document.querySelector('#product')?.value,label:document.querySelector('#product option:checked')?.textContent}));
    results.push({service,...result});
  }
  await page.goto('http://127.0.0.1:4317/configurator.html?product=course&result=editing&discipline=psychology');
  results.push(await page.evaluate(()=>({editing:true,product:document.querySelector('#product')?.value,scope:document.querySelector('#scope')?.value,discipline:document.querySelector('#discipline')?.value})));
  return {fixture:'local anonymous API; all API calls intercepted; no actual submit/payment',results,errors,requests};
}
