(function(){
'use strict';
function init(){
const E=window.SalonEase,T=window.SalonEaseTheme;if(!E||!T)return;
const reduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches||document.documentElement.dataset.motion==='off'||document.documentElement.hasAttribute('data-calm');
const panel=document.querySelector('.sh-panel');
if(panel){
 const settings=document.createElement('details');settings.className='se-settings';settings.innerHTML='<summary>Вид сайта <span aria-hidden="true">Аа</span></summary><div class="se-settings-body"><label>Тема<select data-ease-theme><option value="system">Как на устройстве</option><option value="light">Светлая</option><option value="dark">Тёмная</option></select></label><label>Кнопка Листика<select data-ease-assistant><option value="full">С подписью</option><option value="compact">Только значок</option></select></label><p>На небольшом экране подпись может скрываться, чтобы оставить больше места.</p><p class="se-setting-status" role="status"></p></div>';
 panel.querySelector('.sh-panel-bottom').before(settings);
 const theme=settings.querySelector('[data-ease-theme]'),assistant=settings.querySelector('[data-ease-assistant]'),status=settings.querySelector('[role=status]');
 const sync=()=>{for(const [field,value] of [[theme,T.choice()],[assistant,E.get('assistant')]])if(field.value!==value){field.value=value;field.dispatchEvent(new Event('input',{bubbles:true}))}};sync();
 theme.addEventListener('change',()=>{if(window.Salon?.theme)window.Salon.theme.apply(theme.value,true);else T.apply(theme.value,true);status.textContent=T.saved?'':'Выбор действует на этой странице: браузер не разрешил его сохранить.'});
 assistant.addEventListener('change',()=>{const saved=E.set('assistant',assistant.value);status.textContent=saved?'':'Выбор действует на этой странице: браузер не разрешил его сохранить.'});
 document.addEventListener('salon:appearance-change',sync);document.addEventListener('salon:ease-change',sync);
}
const reader=document.querySelector('[data-guide-reader]');
if(reader){
 let noticeTimer;
 const size=reader.querySelector('[data-reader-size]'),space=reader.querySelector('[data-reader-space]');
 const sync=()=>{size.setAttribute('aria-pressed',String(E.get('readingSize')==='large'));space.setAttribute('aria-pressed',String(E.get('readingSpace')==='roomy'))};sync();document.addEventListener('salon:ease-change',sync);
 for(const [button,key,off,on] of [[size,'readingSize','normal','large'],[space,'readingSpace','normal','roomy']])button.onclick=()=>{const saved=E.set(key,E.get(key)===on?off:on);const status=document.querySelector('[data-learning-status]');if(status){clearTimeout(noticeTimer);const text=saved?'Настройка чтения сохранена':'Настройка действует на этой странице: браузер не разрешил её сохранить.';status.textContent=text;noticeTimer=setTimeout(()=>{if(status.textContent===text)status.textContent=''},4200)}};
}
// Keep scrolling native. Only move the horizontal axis to expose the selected chip.
for(const row of document.querySelectorAll('.cat-filters,.lr-filters')){
 const wrap=document.createElement('div');wrap.className='se-chip-wrap';row.before(wrap);wrap.append(row);let frame=0;
 function paint(){frame=0;const overflow=row.scrollWidth>row.clientWidth+2;wrap.classList.toggle('se-chips-before',overflow&&row.scrollLeft>2);wrap.classList.toggle('se-chips-after',overflow&&row.scrollLeft+row.clientWidth<row.scrollWidth-2)}
 function schedule(){if(!frame)frame=requestAnimationFrame(paint)}
 function reveal(button){if(!button||row.scrollWidth<=row.clientWidth+2)return;const r=row.getBoundingClientRect(),b=button.getBoundingClientRect();let delta=0;if(b.left<r.left+6)delta=b.left-r.left-6;else if(b.right>r.right-6)delta=b.right-r.right+6;if(delta)row.scrollTo({left:row.scrollLeft+delta,behavior:'instant'});schedule()}
 row.addEventListener('scroll',schedule,{passive:true});row.addEventListener('focusin',e=>reveal(e.target.closest('button')));
 const observer=new MutationObserver(records=>{if(records.some(r=>r.target.getAttribute('aria-pressed')==='true'))reveal(row.querySelector('[aria-pressed=true]'));schedule()});observer.observe(row,{subtree:true,attributes:true,attributeFilter:['aria-pressed']});
 if('ResizeObserver' in window)new ResizeObserver(schedule).observe(row);window.addEventListener('resize',schedule);document.fonts?.ready.then(()=>{reveal(row.querySelector('[aria-pressed=true]'));schedule()});reveal(row.querySelector('[aria-pressed=true]'));paint();
}
const registry=/* FAQ_REGISTRY */{};
const route=location.pathname.split('/').pop()||'index.html';
const norm=s=>s.replace(/[+＋−↗⌄]/g,'').replace(/\s+/g,' ').trim();
const candidates=document.querySelectorAll('[data-home-faq] details,.sen-faq details,.svx-faq details,.sp-faq details,.cat-questions details,.lr-studio-faq details,.gz-faq details,.journey-faq details,.tool-guidance__faq details,.faq details');
const faqs=[];
for(const detail of candidates){
 const summary=detail.querySelector('summary'),record=registry[route]?.find(x=>x.question===norm(summary?.textContent||''));if(!record)continue;
 if(!detail.id)detail.id=record.id;detail.classList.add('se-faq');faqs.push(detail);
 const tools=document.createElement('div');tools.className='se-faq-tools';const button=document.createElement('button');button.type='button';button.className='se-faq-copy';button.textContent='Ссылка на ответ ↗';button.setAttribute('aria-label','Скопировать ссылку на ответ: '+record.question);
 const status=document.createElement('p');status.setAttribute('role','status');const fallback=document.createElement('label');fallback.hidden=true;fallback.textContent='Ссылка на этот ответ';const input=document.createElement('input');input.readOnly=true;input.type='url';fallback.append(input);tools.append(button,status,fallback);detail.append(tools);
 button.addEventListener('click',async()=>{const u=new URL(location.pathname,location.origin);u.hash=detail.id;button.disabled=true;try{await navigator.clipboard.writeText(u.href);status.textContent='Ссылка скопирована';fallback.hidden=true}catch(_){input.value=u.href;fallback.hidden=false;status.textContent='Скопируй ссылку из поля.';input.focus({preventScroll:true});input.select()}finally{button.disabled=false}});
 detail.addEventListener('toggle',()=>{if(detail.open&&!reduced())for(const child of detail.children)if(child!==summary)child.animate([{opacity:.55,transform:'translateY(-3px)'},{opacity:1,transform:'translateY(0)'}],{duration:160,easing:'ease-out'})});
}
function followAnswer(){let id;try{id=decodeURIComponent(location.hash.slice(1))}catch(_){return}const detail=faqs.find(d=>d.id===id);if(!detail)return;let p=detail;while(p){if(p.tagName==='DETAILS')p.open=true;p=p.parentElement}requestAnimationFrame(()=>{detail.scrollIntoView({block:'start',behavior:'instant'});detail.querySelector('summary').focus({preventScroll:true})})}
followAnswer();window.addEventListener('hashchange',followAnswer);window.addEventListener('popstate',followAnswer);
// One short response to a successful saved state, never to a failed write.
document.addEventListener('click',e=>{const b=e.target.closest('[data-save]');if(!b||reduced()||b.getAttribute('aria-pressed')==='true')return;queueMicrotask(()=>{if(b.getAttribute('aria-pressed')==='true')b.animate([{transform:'scale(1)'},{transform:'scale(1.08)'},{transform:'scale(1)'}],{duration:180,easing:'ease-out'})})},true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
