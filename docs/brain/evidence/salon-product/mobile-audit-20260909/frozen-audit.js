async(page)=>{
 const c=await page.context().browser().newContext({serviceWorkers:'block'}),rows=[],errors=[];let posts=0;
 await c.route('**/*',r=>{if(!['GET','HEAD'].includes(r.request().method())){posts++;return r.abort()}if(r.request().url().includes('/api/'))return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,authenticated:false,orders:[]})});return r.continue()});
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
 try{for(const width of [320,390])for(const theme of ['light','dark']){
  await p.setViewportSize({width,height:844});await p.goto('http://127.0.0.1:8772/services.html',{waitUntil:'domcontentloaded',timeout:30000});
  await p.evaluate(t=>{document.documentElement.dataset.theme=t;sessionStorage.clear()},theme);
  await p.locator('#cat-search').fill('курсовая');await p.locator('button.cat-card[data-product="course"]').click();
  await p.locator('[data-sheet-scope="part"]').click();await p.locator('[data-sheet-speed="express24"]').click();
  await p.locator('.cat-additions summary').click();await p.locator('[data-cat-addon="defense"]').check();
  const geometry=await p.locator('#catalog-sheet').evaluate(x=>({overflow:document.documentElement.scrollWidth>innerWidth,dialogOverflow:x.scrollWidth>x.clientWidth,checkout:[...x.querySelectorAll('#cat-checkout,.cat-close')].map(a=>{const r=a.getBoundingClientRect();return{text:a.textContent.trim(),width:r.width,height:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom}})}));
  await p.locator('#cat-checkout').click();await p.waitForFunction(()=>document.querySelector('#order-speed'));
  const form=await p.evaluate(()=>({product:document.querySelector('#product').value,scope:document.querySelector('#scope').value,speed:document.querySelector('#order-speed').value,addons:[...document.querySelectorAll('[data-order-addon]:checked')].map(x=>x.value),overflow:document.documentElement.scrollWidth>innerWidth}));
  if(form.product!=='course'||form.scope!=='part'||form.speed!=='express24'||!form.addons.includes('defense'))throw Error('lost selection '+JSON.stringify(form));
  await p.goBack({waitUntil:'domcontentloaded'});await p.locator('#cat-resume-open').click();
  const resume=await p.locator('#catalog-sheet').evaluate(x=>({scope:x.querySelector('[data-sheet-scope][aria-pressed=true]').dataset.sheetScope,speed:x.querySelector('[data-sheet-speed][aria-pressed=true]').dataset.sheetSpeed,addon:x.querySelector('[data-cat-addon="defense"]').checked}));
  if(resume.scope!=='part'||resume.speed!=='express24'||!resume.addon)throw Error('resume loss');
  await p.locator('.cat-close').click();
  await p.locator('.sen-directory a[href="/kursovaya-rabota.html"]').click();await p.locator('.sen-related a[href="/kursovaya-po-psihologii.html"]').click();
  await p.locator('[data-entry-scope="editing"]').click();await p.locator('[data-entry-speed="expressfast"]').click();await p.locator('[data-entry-order]').click();
  await p.waitForFunction(()=>document.querySelector('#order-speed'));
  const subject=await p.evaluate(()=>({product:document.querySelector('#product').value,disc:document.querySelector('#discipline').value,scope:document.querySelector('#scope').value,speed:document.querySelector('#order-speed').value,addons:[...document.querySelectorAll('[data-order-addon]:checked')].map(x=>x.value)}));
  if(subject.disc!=='psychology'||subject.scope!=='editing'||subject.speed!=='expressfast'||subject.addons.length)throw Error('subject loss '+JSON.stringify(subject));
  rows.push({width,theme,geometry,form,resume,subject});
 }return{rows,errors,posts}}finally{await c.close()}
}
