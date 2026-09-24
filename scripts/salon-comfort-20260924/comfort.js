(function(){
'use strict';
const form=document.getElementById('direct-order');if(!form)return;
const deadline=document.getElementById('deadline'),details=document.getElementById('details'),disclosure=document.getElementById('intake-task-details');
const days=[1,7,14],labels=['Завтра','Через неделю','Через две недели'];
const row=document.createElement('div');row.className='comfort-dates';row.setAttribute('role','group');row.setAttribute('aria-label','Быстро выбрать дату сдачи');
const readable=document.createElement('p');readable.className='comfort-date-label';readable.setAttribute('aria-live','polite');readable.hidden=true;
const iso=date=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
const dateAfter=n=>{const date=new Date();date.setHours(12,0,0,0);date.setDate(date.getDate()+n);return date};
const fullDate=new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
const buttons=days.map((n,i)=>{const b=document.createElement('button');b.type='button';b.textContent=labels[i];b.dataset.deadlineDays=n;b.onclick=e=>{
 if(deadline.disabled)return;deadline.min=iso(dateAfter(0));deadline.value=iso(dateAfter(n));deadline.dispatchEvent(new Event('input',{bubbles:true}));deadline.dispatchEvent(new Event('change',{bubbles:true}));deadline.dispatchEvent(new CustomEvent('salon:field-commit',{bubbles:true,detail:{inputEvent:e}}));syncDate();
 };row.append(b);return b});
const clear=document.createElement('button');clear.type='button';clear.className='comfort-date-clear';clear.textContent='Убрать дату';clear.hidden=true;clear.onclick=e=>{if(deadline.disabled)return;deadline.value='';deadline.dispatchEvent(new Event('input',{bubbles:true}));deadline.dispatchEvent(new Event('change',{bubbles:true}));deadline.dispatchEvent(new CustomEvent('salon:field-commit',{bubbles:true,detail:{inputEvent:e}}));syncDate();deadline.focus({preventScroll:true})};row.append(clear);
document.querySelector('.intake-dates').after(row,readable);
function syncDate(){
 buttons.forEach((b,i)=>{const date=dateAfter(days[i]);b.disabled=deadline.disabled;b.setAttribute('aria-label',labels[i]+', '+fullDate.format(date));b.setAttribute('aria-pressed',String(deadline.value===iso(date)))});
 clear.hidden=!deadline.value;clear.disabled=deadline.disabled;
 const valid=/^\d{4}-\d{2}-\d{2}$/.test(deadline.value);readable.hidden=!valid;
 if(valid)readable.textContent='Срок: '+fullDate.format(new Date(deadline.value+'T12:00:00'));
}
deadline.addEventListener('input',syncDate);deadline.addEventListener('change',syncDate);
new MutationObserver(syncDate).observe(deadline,{attributes:true,attributeFilter:['disabled']});
window.addEventListener('pageshow',syncDate);window.addEventListener('focus',syncDate);document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncDate()});syncDate();
let scheduled=0;
function fitDetails(){
 scheduled=0;if(!details.getClientRects().length)return;
 const scrollX=window.scrollX,scrollY=window.scrollY,previous=document.documentElement.style.scrollBehavior;
 document.documentElement.style.scrollBehavior='auto';details.style.height='auto';
 const style=getComputedStyle(details),border=parseFloat(style.borderTopWidth)+parseFloat(style.borderBottomWidth),target=Math.min(520,Math.max(140,details.scrollHeight+border));
 details.style.height=target+'px';details.style.overflowY=details.scrollHeight+border>520?'auto':'hidden';
 window.scrollTo({left:scrollX,top:scrollY,behavior:'instant'});document.documentElement.style.scrollBehavior=previous;
}
function requestFit(){if(!scheduled)scheduled=requestAnimationFrame(fitDetails)}
details.classList.add('comfort-growing');details.addEventListener('input',requestFit);disclosure.addEventListener('toggle',requestFit);window.addEventListener('resize',requestFit);window.addEventListener('pageshow',requestFit);requestFit();
})();
