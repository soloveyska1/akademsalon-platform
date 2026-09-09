async page => {
 const results=[];
 const lum=c=>{const a=c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*a[0]+.7152*a[1]+.0722*a[2]};
 for(const theme of ['light','dark']){
  await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  for(let i=0;i<4;i++){
   await page.locator('[data-field]').nth(i).click();
   const colors=await page.evaluate(()=>{
    const parse=s=>(s.match(/[\d.]+/g)||[]).map(Number);
    return [...document.querySelectorAll('.specification-main h1,.agreement-eyebrow,.agreement-meta span,.agreement-field-value small,.agreement-field-value strong,.agreement-field-value>span,.agreement-paper-foot span,.annotation-kicker span,.agreement-annotations h2,.annotation-lead,.agreement-comparison p,.agreement-comparison div>span,.annotation-note,.annotation-next,.agreement-back,.agreement-fact p,.agreement-detail-body p,.agreement-detail-body a,.agreement-questions summary,.agreement-help p,.agreement-help a,.salon-bottom a,.footer-note')].filter(e=>e.checkVisibility()).map(e=>{
     const style=getComputedStyle(e);let p=e,bg;
     while(p){let v=parse(getComputedStyle(p).backgroundColor);if(v.length===3 || v[3]===1){bg=v;break}p=p.parentElement;}
     return {text:e.textContent.trim().slice(0,35),fg:parse(style.color),bg:bg||[255,255,255]};
    });
   });
   for(const c of colors){const a=lum(c.fg),b=lum(c.bg);results.push({theme,stage:i+1,text:c.text,ratio:Math.round((Math.max(a,b)+.05)/(Math.min(a,b)+.05)*100)/100})}
  }
 }
 return {minimum:Math.min(...results.map(r=>r.ratio)),under45:results.filter(r=>r.ratio<4.5),results};
}
