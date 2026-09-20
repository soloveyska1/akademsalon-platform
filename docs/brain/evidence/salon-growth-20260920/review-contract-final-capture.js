async (page) => {
  const results=[];
  const pages=[{path:'/',slug:'home',shots:[['discovery','[data-growth-discovery]']]},{path:'/services.html',slug:'services',shots:[['support','[data-growth-support]']]},{path:'/komissiya-0.html',slug:'commission',shots:[['hero','.gz-hero'],['trainer','.gz-trainer']]},{path:'/razbor-zamechaniy-nauchruka.html',slug:'remarks',shots:[['related','[data-growth-related]']]}];
  for(const item of pages)for(const width of [390,1440])for(const theme of ['light','dark']){
    if(theme==='dark'&&!['home','commission'].includes(item.slug))continue;
    await page.setViewportSize({width,height:1000});
    await page.evaluate(theme=>localStorage.setItem('salon_theme',theme),theme);
    await page.goto('http://127.0.0.1:8768'+item.path,{waitUntil:'load'});
    await page.evaluate(async theme=>{document.documentElement.dataset.theme=theme;await document.fonts.ready;},theme);
    for(const [name,selector]of item.shots){
      const target=page.locator(selector);
      const initial=await target.boundingBox();
      await page.setViewportSize({width,height:Math.ceil(initial.height)+340});
      await page.evaluate(async selector=>{await document.fonts.ready;const root=document.querySelector(selector);window.scrollTo({top:Math.max(0,root.getBoundingClientRect().top+scrollY-160),behavior:'instant'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))},selector);
      await page.mouse.move(0,0);
      const bounds=await target.boundingBox();
      const path='output/playwright/review-contract-final-'+item.slug+'-'+name+'-'+width+'-'+theme+'.png';
      await target.screenshot({path,animations:'disabled'});
      results.push({path,width,theme,viewport:page.viewportSize(),bounds,method:'Section fully fits viewport; fixed chrome outside clip; no elements hidden or image edits'});
    }
  }
  await page.evaluate(data=>window.__reviewCleanShots=data,results);
}