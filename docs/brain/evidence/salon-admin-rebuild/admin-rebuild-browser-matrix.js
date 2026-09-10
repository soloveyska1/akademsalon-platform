async page=>{
 const browser=page.context().browser();const context=await browser.newContext({serviceWorkers:'block',reducedMotion:'reduce'});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));const states=[];
 for(const theme of ['light','dark'])for(const width of [320,390,768,1024,1440]){
  await p.setViewportSize({width,height:900});await p.goto('http://127.0.0.1:8780/admin.html');await p.waitForSelector('.aw-shell');await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  for(const route of ['home','orders','orders/9701/brief','orders/9701/messages','orders/9703/money','clients/91001/brief','gifts/984/brief','qa','reviews','money','broadcast','visits','leads','settings','content']){
   await p.evaluate(r=>location.hash=r,route);await p.waitForTimeout(100);await p.waitForFunction(()=>!document.querySelector('.aw-loading-bar'));if(route.includes('/'))await p.waitForFunction(()=>!document.querySelector('#aw-detail .aw-empty'));
   const result=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,emptyButtons:Array.from(document.querySelectorAll('button')).filter(b=>b.getClientRects().length&&!b.textContent.trim()&&!b.getAttribute('aria-label')).length}));states.push({theme,width,route,...result});
   if((width===1440||width===390)&&['home','orders/9701/brief','clients/91001/brief','visits'].includes(route))await p.screenshot({path:'/Users/saymurrbk.ru/.codex/worktrees/salon-admin-rebuild/docs/brain/evidence/salon-admin-rebuild/'+theme+'-'+width+'-'+route.replaceAll('/','-')+'.png',fullPage:true});
  }
 }
 await context.close();return {synthetic:true,states,errors,failures:states.filter(s=>s.overflow||s.emptyButtons)};
}
