(function(){
'use strict';
const header=document.querySelector('[data-site-header]');if(!header||header.dataset.shReady)return;
const menu=header.querySelector('.sh-menu'),trigger=menu.querySelector('summary'),panel=menu.querySelector('.sh-panel');
header.dataset.shReady='1';document.documentElement.classList.add('has-salon-header');
const page=(location.pathname.split('/').pop()||'index.html').replace(/\.html$/,'');
const group=/^(kursovaya|diplomnaya|otchet-po-praktike|referat|magisterskaya|kandidatskaya|nauchnaya|services|tariffs|plan|normokontrol|redaktura|dorabotka|avtorskiy|razbor|audit|proverka)/.test(page)?'services':/^guide-|^(knowledge|tools)$/.test(page)?'knowledge':/^(benefits|plus|deposit|gift|referral|loyalty)$/.test(page)?'benefits':page;
header.querySelectorAll('.sh-nav a').forEach(a=>{if(a.getAttribute('href').replace(/\.html$/,'')===group)a.setAttribute('aria-current',page===group?'page':'true')});
panel.querySelectorAll('nav a').forEach(a=>{if(a.getAttribute('href').replace(/\.html$/,'')===page)a.setAttribute('aria-current','page')});
// Reuse the page's existing explicit selection; no second price or composition model.
const entry=document.querySelector('[data-entry-order]');if(entry){const syncOrder=()=>{try{const u=new URL(entry.href,location.href);if(u.origin!==location.origin||!/^\/configurator(?:\.html)?$/.test(u.pathname)||[...u.searchParams.keys()].some(k=>!['product','disc','result','speed'].includes(k)))return;header.querySelectorAll('.sh-order,.sh-mobile-order,.sh-start-order').forEach(a=>a.href=u.pathname+u.search);panel.querySelectorAll('.sh-mobile-order,.sh-start-order').forEach(a=>a.href=u.pathname+u.search)}catch(_){}};syncOrder();new MutationObserver(syncOrder).observe(entry,{attributes:true,attributeFilter:['href']})}
const theme=panel.querySelector('[data-sh-theme]');
function themeLabel(){const dark=document.documentElement.dataset.theme==='dark';theme.querySelector('span').textContent=dark?'Светлая тема':'Тёмная тема';theme.setAttribute('aria-label',dark?'Включить светлую тему':'Включить тёмную тему')}
theme.hidden=false;themeLabel();theme.addEventListener('click',()=>{const mode=document.documentElement.dataset.theme==='dark'?'light':'dark';if(window.Salon?.theme?.apply)window.Salon.theme.apply(mode,true);else{document.documentElement.dataset.theme=mode;try{localStorage.setItem('salon_theme',mode)}catch(_){}}const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=mode==='dark'?'#211c2b':'#f5f3ed';themeLabel()});new MutationObserver(themeLabel).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
if(typeof HTMLDialogElement==='undefined'||typeof HTMLDialogElement.prototype.showModal!=='function')return;
const search=panel.querySelector('.search-button');search.hidden=false;panel.querySelector('.sh-search-fallback').hidden=true;
const dialog=document.createElement('dialog');dialog.className='sh-dialog';dialog.id='salon-navigation';dialog.setAttribute('aria-labelledby','salon-menu-title');document.body.append(dialog);dialog.append(panel);
trigger.setAttribute('role','button');trigger.setAttribute('aria-controls',dialog.id);trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');
let restore=true;
function close(focus=true){restore=focus;if(dialog.open)dialog.close()}
trigger.addEventListener('click',e=>{e.preventDefault();restore=true;dialog.showModal();trigger.setAttribute('aria-expanded','true');document.body.classList.add('sh-menu-open');panel.querySelector('[data-sh-close]').focus({preventScroll:true});document.dispatchEvent(new Event('salon:shellchange'))});
const closer=panel.querySelector('[data-sh-close]');closer.hidden=false;closer.addEventListener('click',()=>close());
dialog.addEventListener('close',()=>{document.body.classList.remove('sh-menu-open');trigger.setAttribute('aria-expanded','false');if(restore)trigger.focus({preventScroll:true});document.dispatchEvent(new Event('salon:shellchange'))});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close()}else if(e.target.closest('a[href]'))close(false)});
search.addEventListener('click',()=>{close(false);queueMicrotask(()=>{const searchDialog=document.querySelector('.experience-search');if(searchDialog?.open)searchDialog.addEventListener('close',()=>trigger.focus({preventScroll:true}),{once:true})})},true);
window.addEventListener('popstate',()=>close(false));window.addEventListener('pagehide',()=>close(false));
// On the form, return to the current task instead of opening a second blank one.
if(page==='configurator')[...header.querySelectorAll('a[href="#direct-order"]'),...panel.querySelectorAll('a[href="#direct-order"]')].forEach(a=>a.addEventListener('click',()=>{const form=document.getElementById('direct-order');if(form){form.tabIndex=-1;requestAnimationFrame(()=>{form.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});form.focus({preventScroll:true})})}}));
})();
