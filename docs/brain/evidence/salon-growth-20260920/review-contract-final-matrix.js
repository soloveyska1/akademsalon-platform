async (page) => {
  const regression=await page.evaluate(()=>window.__reviewRegression);
  const matrix=[], shots=[], failures=[];
  let currentErrors=[];
  const consoleHandler=m=>{if(m.type()==='error')currentErrors.push({kind:'console',text:m.text(),url:m.location().url})};
  const pageErrorHandler=e=>currentErrors.push({kind:'pageerror',text:String(e)});
  const requestHandler=r=>{if(r.failure())currentErrors.push({kind:'requestfailed',url:r.url(),failure:r.failure().errorText})};
  page.on('console',consoleHandler);page.on('pageerror',pageErrorHandler);page.on('requestfailed',requestHandler);
  await page.route('https://**/*',r=>r.abort());
  const pages=[{path:'/',slug:'home',root:'[data-growth-discovery]',shots:[['discovery','[data-growth-discovery]']]},{path:'/services.html',slug:'services',root:'[data-growth-support]',shots:[['support','[data-growth-support]']]},{path:'/komissiya-0.html',slug:'commission',root:'.gz-main',shots:[['hero','.gz-hero'],['trainer','.gz-trainer']]},{path:'/razbor-zamechaniy-nauchruka.html',slug:'remarks',root:'[data-growth-related]',shots:[['related','[data-growth-related]']]}];
  for(const item of pages){
    for(const width of [360,390,768,1024,1440]){
      await page.setViewportSize({width,height:width<700?844:1000});
      for(const theme of ['light','dark']){
        currentErrors=[];
        await page.evaluate(theme=>localStorage.setItem('salon_theme',theme),theme);
        const response=await page.goto('http://127.0.0.1:8768'+item.path,{waitUntil:'load'});
        await page.evaluate(async theme=>{document.documentElement.dataset.theme=theme;await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))},theme);
        await page.waitForTimeout(180);
        const data=await page.evaluate(({selector,width})=>{
          const root=document.querySelector(selector);
          if(!root)return {missing:selector};
          const visible=e=>{const b=e.getBoundingClientRect();const s=getComputedStyle(e);return b.width>0&&b.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&!e.closest('[hidden]')};
          const label=e=>(e.getAttribute('aria-label')||e.textContent||e.id||e.tagName).replace(/\s+/g,' ').trim().slice(0,120);
          const controls=[...root.querySelectorAll('a,button,summary,input,select,textarea')].filter(visible).map(e=>{const b=e.getBoundingClientRect(),s=getComputedStyle(e);return {tag:e.tagName,label:label(e),height:+b.height.toFixed(2),width:+b.width.toFixed(2),fontSize:parseFloat(s.fontSize),inlineLink:e.tagName==='A'&&s.display==='inline'}});
          const bounds=root.getBoundingClientRect();
          const overflow=[...root.querySelectorAll('*')].filter(visible).map(e=>({e,b:e.getBoundingClientRect()})).filter(({e,b})=>b.left<-.5||b.right>innerWidth+.5).map(({e,b})=>({tag:e.tagName,class:e.className,label:label(e),left:+b.left.toFixed(2),right:+b.right.toFixed(2)}));
          const title=document.querySelector('.gd-shelf--defense h3');
          return {viewportWidth:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,rootBounds:{left:bounds.left,right:bounds.right,width:bounds.width},ownOverflow:overflow,controls,shortControls:controls.filter(c=>!c.inlineLink&&c.height<43.99),narrowControls:controls.filter(c=>!c.inlineLink&&c.width<43.99),smallMobileFields:width<=390?controls.filter(c=>['INPUT','SELECT','TEXTAREA'].includes(c.tag)&&c.fontSize<16):[],defenseTitle:title?{color:getComputedStyle(title).color,background:getComputedStyle(title.closest('.gd-shelf')).backgroundColor}:null};
        },{selector:item.root,width});
        const record={page:item.path,width,theme,status:response.status(),csp:response.headers()['content-security-policy'],...data,errors:currentErrors.slice()};
        matrix.push(record);
        if(record.missing||record.overflow||record.shortControls?.length||record.smallMobileFields?.length)failures.push({page:item.path,width,theme,overflow:record.overflow,missing:record.missing,shortControls:record.shortControls,smallMobileFields:record.smallMobileFields});
        if([390,1440].includes(width)&&(theme==='light'||['home','commission'].includes(item.slug))){
          for(const [name,selector]of item.shots){
            const path='output/playwright/review-contract-final-'+item.slug+'-'+name+'-'+width+'-'+theme+'.png';
            await page.locator(selector).screenshot({path,animations:'disabled'});shots.push(path);
          }
        }
      }
    }
  }
  page.off('console',consoleHandler);page.off('pageerror',pageErrorHandler);page.off('requestfailed',requestHandler);
  await page.evaluate(data=>window.__reviewFinalMatrix=data,{createdAt:new Date().toISOString(),regression,matrix,shots,failures,scope:'Exact candidate at localhost8768; readonly DOM/screenshot; no form submission; independent Chromium'});
}