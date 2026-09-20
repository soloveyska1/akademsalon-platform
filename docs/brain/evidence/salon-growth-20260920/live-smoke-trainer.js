async page => {
 const errors=[],requests=[],blocked=[];
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('request',r=>requests.push({method:r.method(),url:r.url()}));
 await page.route('**/api/**',r=>{if(['GET','HEAD'].includes(r.request().method()))return r.continue();blocked.push(r.request().method()+' '+r.request().url());return r.abort()});
 await page.evaluate(async()=>{await document.fonts.ready;window.scrollTo(0,0)});
 await page.screenshot({path:'output/playwright/live-commission-desktop.png'});
 await page.getByRole('combobox',{name:'Что защищаешь?'}).selectOption('master');
 await page.getByRole('link',{name:'Попробовать бесплатно',exact:true}).click();
 for(const name of ['Ответил уверенно','Нужно доработать','Ответил уверенно','Нужно доработать','Ответил уверенно','Нужно доработать'])await page.getByRole('button',{name,exact:true}).click();
 await page.evaluate(data=>window.__salonLiveSmoke=data,{sourceCommit:'449b719fcb5d418aa588e0daa26a4ba6ceaa6f5f',date:new Date().toISOString(),browser:'Chromium153',viewport:page.viewportSize(),url:page.url(),errors,requests,blocked});
}
