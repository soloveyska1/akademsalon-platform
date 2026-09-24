(function(){
'use strict';
const $=id=>document.getElementById(id),form=$('direct-order'),S=window.Salon;
if(!form||!document.body.classList.contains('salon-intake'))return;
const contact=$('contact'),states=new Map();
const live=document.createElement('p');live.className='sr-only';live.setAttribute('role','status');live.setAttribute('aria-live','polite');form.append(live);
function described(el,id,on){if(!el)return;const ids=new Set((el.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean));on?ids.add(id):ids.delete(id);if(ids.size)el.setAttribute('aria-describedby',[...ids].join(' '));else el.removeAttribute('aria-describedby')}
function visibleField(field){return field.closest('.salon-select')?.querySelector('.salon-select-trigger')||field}
function host(field){return field.closest('.salon-select')||field.closest('label.check-row')||field}
function errorFor(field){
 if(field.disabled||!field.willValidate)return '';
 const value=field.value.trim();
 if(field.id==='topic'&&!value)return 'Напиши тему или коротко опиши задачу.';
 if(field.id==='contact'){if(!value)return 'Укажи контакт, по которому можно прислать расчёт.';if(S.valid?.contact&&!S.valid.contact(value))return 'Проверь контакт: @ник Telegram, email, 11 цифр телефона или ссылка VK.'}
 if(field.id==='deadline'&&value&&value<field.min)return 'Эта дата уже прошла. Выбери сегодняшнюю или будущую.';
 if(field.validity.valueMissing){if(field.type==='checkbox')return field.id==='consent'?'Для отправки нужно согласие на обработку данных заявки.':'Отметь подтверждение, чтобы продолжить.';if(field.tagName==='SELECT')return 'Выбери вариант из списка.';return 'Заполни это поле, чтобы продолжить.'}
 return field.validity.valid?'':field.validationMessage;
}
function state(field){
 let s=states.get(field);if(s)return s;
 const node=document.createElement('p');node.className='polish-field-error';node.id='polish-error-'+field.id;node.hidden=true;
 host(field).after(node);s={node,text:''};states.set(field,s);return s;
}
function showError(field,text,announce=false){
 if(!field?.id||field.disabled||!form.contains(field))return;const s=state(field),changed=s.text!==text;
 s.node.textContent=text;s.node.hidden=false;s.text=text;field.setAttribute('aria-invalid','true');
 const target=visibleField(field);target.setAttribute('aria-invalid','true');described(field,s.node.id,true);if(target!==field)described(target,s.node.id,true);
 if(announce&&changed)live.textContent=text;
}
function clearError(field){
 const s=states.get(field);if(!s)return;const previous=s.text;s.node.hidden=true;s.text='';
 const target=visibleField(field);field.removeAttribute('aria-invalid');target.removeAttribute('aria-invalid');described(field,s.node.id,false);if(target!==field)described(target,s.node.id,false);
 // Only retire the exact client validation message belonging to this field; server/retry messages stay.
 if($('form-message').dataset.polishField===field.id){$('form-message').hidden=true;delete $('form-message').dataset.polishField}
 if(live.textContent===previous)live.textContent='';
}
form.addEventListener('salon:field-error',e=>{const field=$(e.detail?.id);if(!field)return;$('form-message').dataset.polishField=field.id;showError(field,errorFor(field)||e.detail.text)});
form.addEventListener('invalid',e=>{const field=e.target;if(field.matches('input,select,textarea'))showError(field,errorFor(field)||field.validationMessage)},true);
// A blur caused by pointerdown must not move the button before pointerup/click.
let pointerDown=false,pendingBlur=null;
document.addEventListener('pointerdown',()=>{pointerDown=true},true);
function finishPointer(){pointerDown=false;if(pendingBlur){const run=pendingBlur;pendingBlur=null;setTimeout(run,0)}}
document.addEventListener('pointerup',finishPointer,true);document.addEventListener('pointercancel',finishPointer,true);
window.addEventListener('blur',finishPointer);
form.addEventListener('focusout',e=>{const field=e.target;const run=()=>{
 if(field.disabled||document.activeElement===field||!form.contains(field))return;
 if((field===contact&&field.value.trim())||states.has(field)){const error=errorFor(field);error?showError(field,error,true):clearError(field)}
 if(field===contact){const mode=detectedMode();if(mode)chooseMode(mode)}
 };if(pointerDown)pendingBlur=run;else run();},true);
function correct(e){const field=e.target;if(!states.has(field)||field.disabled)return;if(!errorFor(field))clearError(field)}
form.addEventListener('input',correct);form.addEventListener('change',correct);
form.addEventListener('salon:order-message',()=>{delete $('form-message').dataset.polishField});
document.addEventListener('salon:order-updated',()=>{for(const [field,s]of states){if(!form.contains(field)){s.node.remove();states.delete(field)}else if(!errorFor(field))clearError(field)}});
// These optional hints never change the value, type, constraints, payload or stored data.
const modes=[
 {id:'telegram',label:'Telegram',mode:'text',placeholder:'@username',hint:'Ник с @ или ссылка t.me/username.'},
 {id:'email',label:'Email',mode:'email',placeholder:'mail@example.ru',hint:'Адрес целиком, например mail@example.ru.'},
 {id:'phone',label:'Телефон',mode:'tel',placeholder:'+7 900 123-45-67',hint:'Номер из 11 цифр. Пробелы, скобки и дефисы можно оставить.'},
 {id:'vk',label:'VK',mode:'url',placeholder:'vk.com/username',hint:'Ссылка на профиль: vk.com/username или vk.me/username.'}
];
const group=document.createElement('div');group.className='polish-contact-modes';group.setAttribute('role','group');group.setAttribute('aria-label','Подсказки для способа связи');
const hint=document.createElement('p');hint.id='polish-contact-hint';hint.className='polish-contact-hint';hint.textContent='Достаточно одного контакта — выбери удобный способ.';contact.before(group);contact.after(hint);described(contact,hint.id,true);
contact.setAttribute('autocapitalize','none');contact.setAttribute('autocorrect','off');contact.setAttribute('spellcheck','false');
let selected=null;
const modeButtons=modes.map(mode=>{const b=document.createElement('button');b.type='button';b.dataset.contactMode=mode.id;b.textContent=mode.label;b.setAttribute('aria-pressed','false');b.setAttribute('aria-controls','contact');b.onclick=()=>{if(contact.disabled)return;chooseMode(mode);contact.focus({preventScroll:true})};group.append(b);return b});
function chooseMode(mode){selected=mode.id;contact.inputMode=mode.mode;contact.placeholder=mode.placeholder;hint.textContent=mode.hint;modeButtons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.contactMode===selected)))}
function detectedMode(){const value=contact.value.trim();if(!value)return null;return ['telegram','email','vk','phone'].map(id=>modes.find(m=>m.id===id)).find(m=>S.valid?.[m.id]?.(value))}

const initial=detectedMode();if(initial)chooseMode(initial);
function syncDisabled(){modeButtons.forEach(b=>b.disabled=contact.disabled)}new MutationObserver(syncDisabled).observe(contact,{attributes:true,attributeFilter:['disabled']});syncDisabled();
const number=new Intl.NumberFormat('ru-RU');
for(const id of ['topic','details']){
 const field=$(id),limit=field.maxLength;if(limit<=0)continue;
 const count=document.createElement('p');count.id='polish-count-'+id;count.className='polish-text-count';count.hidden=true;field.after(count);let bucket=0;
 function updateCount(e){
  const used=field.value.length,next=used>=limit?2:used>=limit*.8?1:0;
  count.hidden=next===0;count.classList.toggle('is-full',next===2);count.textContent=used>limit?number.format(used)+' / '+number.format(limit)+' — сократи текст':number.format(used)+' / '+number.format(limit)+(next===2?' — лимит поля':'');described(field,count.id,next>0);
  if(id==='details')$('intake-details-count').textContent=used?number.format(used)+' / '+number.format(limit):'по желанию';
  if(next!==bucket&&e?.isTrusted&&next>0)live.textContent=(id==='topic'?'Тема: ':'Описание: ')+(used>=limit?'достигнут лимит '+number.format(limit)+' знаков.':'осталось '+number.format(limit-used)+' знаков.');bucket=next;
 }
 if(id==='details')$('topic').addEventListener('input',()=>updateCount());
 field.addEventListener('input',updateCount);field.addEventListener('change',updateCount);field.addEventListener('focus',updateCount);window.addEventListener('pageshow',updateCount);updateCount();
}
// Keep the existing helper and its original handlers in the form flow. Its dialog stays on body.
const helpSlot=document.createElement('div');helpSlot.className='polish-help-slot';helpSlot.hidden=true;document.querySelector('.intake-contact').append(helpSlot);
const helpLayout=document.querySelector('.order-layout');
function placeHelper(){const launcher=document.querySelector('.sa-launch');if(!launcher)return false;const focused=document.activeElement===launcher,destination=helpLayout.hidden?document.body:helpSlot;if(launcher.parentElement!==destination)destination.append(launcher);helpSlot.hidden=destination!==helpSlot;if(focused)launcher.focus({preventScroll:true});return true}
new MutationObserver(placeHelper).observe(helpLayout,{attributes:true,attributeFilter:['hidden']});
if(!placeHelper()){const observer=new MutationObserver(()=>{if(placeHelper())observer.disconnect()});observer.observe(document.body,{childList:true});window.addEventListener('pagehide',()=>observer.disconnect(),{once:true})}
})();
