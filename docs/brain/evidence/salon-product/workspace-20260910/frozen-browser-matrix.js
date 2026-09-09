async page => {
 const base='/Users/saymurrbk.ru/.codex/worktrees/salon-direct-orders',evidence=base+'/docs/brain/evidence/salon-product/workspace-20260910';
 const context=await page.context().browser().newContext({serviceWorkers:'block'}),p=await context.newPage(),errors=[],checks=[];
 p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/assets/js/salon-workspace.js*',async r=>{const source=await (await p.request.get('http://127.0.0.1:8775/assets/js/salon-workspace.js')).text();await r.fulfill({contentType:'text/javascript',body:await (await p.request.get('http://127.0.0.1:8771/assets/js/cabinet-demo.js')).text()+'\n'+source});});
 await p.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({ok:false,error:'fixture_only'})}));
 for(const width of [320,390,768,1024,1440])for(const theme of ['light','dark']){
  await p.setViewportSize({width,height:900});
  await p.goto('http://127.0.0.1:8775/dashboard.html?demo=alexey');
  await p.locator('.ws-folio').first().waitFor();await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  for(const route of ['home','orders','messages','documents','calendar','benefits','order-701-work','order-701-chat','order-701-files','order-701-money','order-701-terms','profile']){
   await p.evaluate(r=>location.hash=r,route);
   await p.waitForFunction(r=>location.hash==='#'+r&&document.querySelector('#ws-main')?.getAttribute('aria-busy')!=='true',route);
   await p.evaluate(()=>document.fonts.ready);
   const result=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,heading:document.querySelector('.ws-pagehead h1')?.textContent,forms:[...document.querySelectorAll('[data-form]')].map(f=>({kind:f.dataset.form,epoch:f.dataset.epoch,order:f.dataset.orderId})),tabs:(()=>{const x=document.querySelector('.ws-tabs [aria-current=page]'),t=x?.parentElement;if(!x)return true;const a=x.getBoundingClientRect(),b=t.getBoundingClientRect();return a.left>=b.left-1&&a.right<=b.right+1;})()}));
   checks.push({width,theme,route,...result});
   if([390,1440].includes(width)&&['home','documents','order-701-money'].includes(route))await p.screenshot({path:evidence+'/frozen-'+width+'-'+theme+'-'+route+'.png',fullPage:route==='home'});
  }
 }
 await context.close();const result={checks:checks.length,overflow:checks.filter(c=>c.overflow),clippedTabs:checks.filter(c=>!c.tabs),errors,states:checks};return result;
}
