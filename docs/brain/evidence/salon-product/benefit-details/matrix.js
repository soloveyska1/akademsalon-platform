async page=>{
const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.emulateMedia({reducedMotion:'reduce'});const states=[];
for(const route of ['plus','deposit','referral','gift','loyalty'])for(const width of [320,360,390,768,1024,1440])for(const theme of ['light','dark']){
 await page.setViewportSize({width,height:900});await page.goto('http://127.0.0.1:8769/'+route+'.html');await page.evaluate(t=>{document.documentElement.dataset.theme=t;localStorage.setItem('salon_theme',t)},theme);await page.waitForSelector('main h1');
 const v=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,footers:document.querySelectorAll('body>.site-footer').length,headers:document.querySelectorAll('body>.site-header').length,hidden:[...document.querySelectorAll('[hidden]')].filter(x=>getComputedStyle(x).display!=='none').map(x=>x.id)}));states.push({route,width,theme,...v});
 if(width===390&&theme==='light'||width===1440&&theme==='dark')await page.screenshot({path:'/tmp/detail-'+route+'-'+width+'-'+theme+'.png',fullPage:route!=='loyalty',animations:'disabled'});
}
return {states,errors,failures:states.filter(x=>x.overflow||x.footers!==1||x.headers!==1||x.hidden.length)}
}
