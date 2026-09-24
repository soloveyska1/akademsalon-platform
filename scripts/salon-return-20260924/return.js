/* Public browsing comfort. Finite IDs only; no analytics, request text or URLs in storage. */
(function(){
'use strict';
const registry=/* REGISTRY */{},documents=/* DOCUMENTS */{};
const page=location.pathname==='/'?'index.html':location.pathname.slice(1),params=new URLSearchParams(new URL(window.__salonAnalyticsOriginalUrl||location.href,location.origin).search);
if(!Object.hasOwn(registry,page)||params.has('offer_preview')||params.has('desktop-preview')||params.has('demo'))return;
const KEY='salon_return_v1',CAT='salon_catalog_return_v1',TTL=30*86400000;
const own=(o,k)=>!!o&&Object.hasOwn(o,k),number=(x,min,max)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
const fresh=t=>number(t,Date.now()-TTL,Date.now()+60000);
const empty=()=>({v:1,clearedAt:0,recent:[],articles:[],pdfs:[]});
function parse(raw){
 try{if(typeof raw!=='string'||raw.length>30000)return empty();const data=JSON.parse(raw);if(!data||data.v!==1)return empty();
 const clean=(arr,valid,cap)=>{const seen=new Set();return Array.isArray(arr)?arr.filter(x=>x&&typeof x==='object'&&fresh(x.at)&&valid(x)).sort((a,b)=>b.at-a.at).filter(x=>{const id=x.path||x.id;if(seen.has(id))return false;seen.add(id);return true}).slice(0,cap):[]};
 return {v:1,clearedAt:number(data.clearedAt,0,Date.now()+60000)?data.clearedAt:0,recent:clean(data.recent,x=>own(registry,x.path),5).map(x=>({path:x.path,at:x.at})),
 articles:clean(data.articles,x=>own(registry,x.path)&&registry[x.path].article===x.version&&Number.isInteger(x.section)&&number(x.section,0,registry[x.path].sections-1)&&number(x.offset,0,1)&&number(x.progress,0,100),25).map(x=>({path:x.path,version:x.version,section:x.section,offset:x.offset,progress:x.progress,at:x.at})),
 pdfs:clean(data.pdfs,x=>own(documents,x.id)&&documents[x.id].version===x.version&&Number.isInteger(x.page)&&number(x.page,1,documents[x.id].pages)&&['fit','manual'].includes(x.mode)&&number(x.scale,.3,2.5),20).map(x=>({id:x.id,version:x.version,page:x.page,mode:x.mode,scale:x.scale,at:x.at}))};
 }catch(_){return empty()}
}
function read(){try{return parse(localStorage.getItem(KEY))}catch(_){return empty()}}
function write(change){try{const value=read();change(value);localStorage.setItem(KEY,JSON.stringify(parse(JSON.stringify(value))));document.dispatchEvent(new Event('salon:return-updated'));return true}catch(_){return false}}
function pdfGet(id){return read().pdfs.find(x=>x.id===id)||null}
function pdfSave(id,p,mode,scale){if(!own(documents,id))return false;return write(data=>{data.pdfs=data.pdfs.filter(x=>x.id!==id);data.pdfs.unshift({id,version:documents[id].version,page:p,mode,scale:mode==='fit'?1:scale,at:Date.now()})})}
function catalogueRead(raw){try{const x=JSON.parse(raw);if(!x||x.v!==1||!fresh(x.at)||x.at<=read().clearedAt||!['all','small','student','science','part'].includes(x.filter)||!['standard','express24','expressfast'].includes(x.speed)||!['','essay','referat','self','course','practice','chapter','diplom','master','rinc','kandidat','editing','custom'].includes(x.product)||!number(x.top,-5000,5000)||!number(x.y,0,100000))return null;return {v:1,filter:x.filter,speed:x.speed,product:x.product,top:x.top,y:x.y,at:x.at}}catch(_){return null}}
function catalogueIntent(){try{const at=Number(sessionStorage.getItem(CAT+'_intent'));sessionStorage.removeItem(CAT+'_intent');return at>Date.now()-120000&&at<=Date.now()&&at>read().clearedAt}catch(_){return false}}
// Referrer is intentionally disabled on this site. A one-use timestamp records only an explicit catalogue navigation.
document.addEventListener('click',e=>{if(!e.isTrusted||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;const a=e.target.closest('a[href]');if(!a||a.hasAttribute('download')||a.target&&a.target!=='_self')return;try{const u=new URL(a.href,location.href);if(u.origin===location.origin&&u.pathname==='/services.html'&&!u.hash&&!u.search)sessionStorage.setItem(CAT+'_intent',String(Date.now()))}catch(_){}});
window.SalonReturn={pdfGet,pdfSave,catalogueRead,catalogueIntent,catalogueKey:CAT};
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text)node.textContent=text;return node}
function button(text){const b=element('button','sr-return-button',text);b.type='button';return b}
let observedClear=read().clearedAt;
function init(){
 const panel=document.querySelector('.sh-panel');let recent,links,note,clear,status;
 if(panel){
  recent=element('details','sr-recent');const summary=element('summary',null,'Недавно смотрел');links=element('nav','sr-recent-links');links.setAttribute('aria-label','Недавно просмотренные страницы');
  note=element('p','sr-return-note','История и место чтения хранятся только в этом браузере, до 30 дней.');clear=button('Очистить историю чтения');clear.setAttribute('aria-label','Очистить историю страниц и место чтения статей и PDF');status=element('p','sr-return-note');status.setAttribute('role','status');
  recent.append(summary,links,note,clear,status);panel.querySelector('.sh-panel-bottom').before(recent);
  function paint(){const data=read(),items=data.recent.filter(x=>x.path!==page);links.replaceChildren();items.forEach(x=>{const a=element('a',null,registry[x.path].title);a.href='/'+x.path;links.append(a)});recent.hidden=!items.length&&!data.articles.length&&!data.pdfs.length&&!status.textContent;note.hidden=false;clear.disabled=!data.recent.length&&!data.articles.length&&!data.pdfs.length;summary.textContent='Недавно смотрел'+(items.length?' · '+items.length:'');}
  clear.addEventListener('click',()=>{try{const value=empty();value.clearedAt=Date.now();localStorage.setItem(KEY,JSON.stringify(value));observedClear=value.clearedAt;}catch(_){status.textContent='Браузер не разрешил очистить историю.';return}document.dispatchEvent(new Event('salon:return-cleared'));try{sessionStorage.removeItem(CAT);const state=history.state;if(state&&typeof state==='object'){const next={...state};delete next.salonCatalogReturn;history.replaceState(next,'');}}catch(_){}status.textContent='История и место чтения очищены. Избранное сохранено.';paint();summary.focus({preventScroll:true});});
  document.addEventListener('salon:return-updated',paint);window.addEventListener('storage',e=>{if(e.key===KEY||e.key===null){const cleared=read().clearedAt;if(!e.newValue||cleared>observedClear)document.dispatchEvent(new Event('salon:return-cleared'));observedClear=cleared;paint()}});paint();
 }
 write(data=>{data.recent=[{path:page,at:Date.now()},...data.recent.filter(x=>x.path!==page)].slice(0,5)});
 const article=document.querySelector('[data-guide-reader] article.doc');if(!article||!registry[page].article)return;
 const headings=[...article.querySelectorAll('h2')];if(!headings.length)return;
 let saved=read().articles.find(x=>x.path===page),armed=false,pending=null,timer,bar;
 function removeBar(){if(bar){bar.remove();bar=null}}
 function put(record){write(data=>{data.articles=data.articles.filter(x=>x.path!==page);if(record)data.articles.unshift(record)})}
 function snapshot(){if(!armed||document.hidden)return;const rect=article.getBoundingClientRect();if(headings[0].getBoundingClientRect().top>150)return;if(rect.top>innerHeight||rect.bottom<120)return;let index=0;headings.forEach((h,i)=>{if(h.getBoundingClientRect().top<=150)index=i});const top=headings[index].getBoundingClientRect().top,end=headings[index+1]?.getBoundingClientRect().top??rect.bottom;pending={path:page,version:registry[page].article,section:index,offset:Math.max(0,Math.min(1,(150-top)/Math.max(1,end-top))),progress:Math.round(Math.max(0,Math.min(100,(150-rect.top)/rect.height*100))),at:Date.now()};}
 function flush(){clearTimeout(timer);if(pending){put(pending);pending=null}}
 function scroll(){if(!armed)return;snapshot();clearTimeout(timer);timer=setTimeout(flush,500)}
 function arm(e){if(e.isTrusted)armed=true}
 window.addEventListener('wheel',arm,{passive:true});window.addEventListener('touchmove',arm,{passive:true});window.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(e.key)&&!e.target.matches('input,textarea,select'))arm(e)});
 document.querySelector('[data-reader-toc]')?.addEventListener('click',arm);
 window.addEventListener('scroll',scroll,{passive:true});window.addEventListener('pagehide',()=>{snapshot();flush()});document.addEventListener('visibilitychange',()=>{if(document.hidden)flush()});
 window.addEventListener('hashchange',()=>{removeBar();armed=false;pending=null;clearTimeout(timer)});
 document.addEventListener('salon:return-cleared',()=>{armed=false;pending=null;clearTimeout(timer);saved=null;removeBar()});
 if(saved&&!location.hash){
  bar=element('div','sr-reading-return');const text=element('div');text.append(element('span','sr-return-eyebrow','ТВОЯ ЗАКЛАДКА · '+saved.progress+'%'),element('strong',null,headings[saved.section].textContent));
  const actions=element('div','sr-return-actions'),resume=button('Продолжить чтение →'),start=button('Сначала');actions.append(resume,start);bar.append(text,actions);document.querySelector('.lr-reader-actions').after(bar);
  resume.addEventListener('click',()=>{const record=saved;if(!record)return;const h=headings[record.section];removeBar();const top=h.getBoundingClientRect().top+scrollY,end=headings[record.section+1]?.getBoundingClientRect().top+scrollY||article.getBoundingClientRect().bottom+scrollY;h.tabIndex=-1;h.focus({preventScroll:true});armed=true;window.scrollTo({top:Math.max(0,top+(end-top)*record.offset-140),behavior:'instant'});snapshot();flush()});
  start.addEventListener('click',()=>{put(null);saved=null;pending=null;armed=false;removeBar();const h=article.querySelector('h1');h.tabIndex=-1;h.focus({preventScroll:true})});
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
