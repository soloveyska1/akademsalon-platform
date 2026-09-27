(function () {
  'use strict';
  const $ = id => document.getElementById(id), form=$('direct-order');
  if (!form || !document.body.classList.contains('salon-intake')) return;
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n};
  const contact=$('contact'), details=$('details'), personal=document.querySelector('.intake-personal');
  const contactSection=document.querySelector('.intake-contact'), group=document.querySelector('.polish-contact-modes');
  if(!contact || !details || !personal || !group)return;
  document.body.classList.add('intake-studio');

  const icons={telegram:'<path d="m3 11 17-7-4 16-5-5-4 3v-6l10-6-8 8"/>',email:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',phone:'<path d="M8 3H5a2 2 0 0 0-2 2c0 9 7 16 16 16a2 2 0 0 0 2-2v-3l-5-2-2 3a13 13 0 0 1-7-7l3-2-2-5Z"/>',vk:'<path d="M3 7c1 6 5 10 10 10v-5c3 0 5 3 6 5h3c-1-3-3-5-5-6l4-4h-4l-4 4V7H9v7c-2-1-3-3-4-7H3Z"/>'};
  group.setAttribute('aria-label','Способ связи');
  group.querySelectorAll('button').forEach(b=>{
    const label=b.textContent;b.setAttribute('aria-label',label);
    const icon=el('span','ic-channel-icon');icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">'+icons[b.dataset.contactMode]+'</svg>';
    const check=el('span','ic-channel-check','✓');check.setAttribute('aria-hidden','true');b.replaceChildren(icon,el('span','ic-channel-name',label),check);
  });
  const intro=el('p','ic-section-note','Достаточно одного контакта. Выбери, где тебе удобно получить расчёт.');group.before(intro);
  const line=el('div','ic-contact-line'), contactField=el('div','ic-contact-field'), nameField=el('div','ic-name-field');
  const contactLabel=form.querySelector('label[for="contact"]');contactLabel.firstChild.textContent='Контакт для ответа ';
  group.after(line);line.append(contactField,nameField);contactField.append(contactLabel,contact,$('polish-contact-hint'));
  const nameLabel=form.querySelector('label[for="name"]');nameLabel.append(el('span','ic-optional','необязательно'));nameField.append(nameLabel,$('name'));
  nameField.append(el('p','ic-name-hint','Чтобы обращаться к тебе по имени.'));

  // Existing input/validation owns the value. Only a format observation is added.
  const format=el('p','ic-contact-format');format.id='ic-contact-format';format.setAttribute('role','status');format.setAttribute('aria-live','polite');contactField.append(format);
  contact.setAttribute('aria-describedby',(contact.getAttribute('aria-describedby')||'')+' '+format.id);
  function formatStatus(){
    const value=contact.value.trim(),v=window.Salon?.valid;
    const detected=v?.email?.(value)?'email':v?.telegram?.(value)?'telegram':v?.vk?.(value)?'vk':/^[+\d()\s-]+$/.test(value)&&v?.phone?.(value)?'phone':'';
    const names={email:'Email',telegram:'Telegram',vk:'VK',phone:'Телефон'},via={email:'по email',telegram:'в Telegram',vk:'во VK',phone:'по телефону'};
    const type=names[detected],selected=group.querySelector('[aria-pressed="true"]')?.dataset.contactMode;
    format.textContent=type?(selected&&selected!==detected?'Сейчас введён '+type+'. Для ответа '+via[selected]+' замени контакт.':'Формат: '+type+'. Проверь, что контакт твой.') :'';
    format.classList.toggle('has-format',!!type);
  }
  contact.addEventListener('input',formatStatus);contact.addEventListener('change',formatStatus);contact.addEventListener('blur',formatStatus);group.addEventListener('click',formatStatus);window.addEventListener('pageshow',formatStatus);formatStatus();
  // Validation may select the detected channel during focusout, after blur.
  new MutationObserver(formatStatus).observe(group,{subtree:true,attributes:true,attributeFilter:['aria-pressed']});

  personal.querySelector('summary>span').textContent='Промокод или сертификат';
  personal.querySelector('summary>small').textContent='если есть';
  const codeNote=el('p','ic-code-note','Проверим код вместе с заданием. Сумму с учётом выгоды подтвердим до оплаты.');personal.querySelector('summary').after(codeNote);
  $('promo').placeholder='Введи промокод';$('gift').placeholder='Номер сертификата';
  function codeCount(){const n=[$('promo'),$('gift')].filter(x=>x.value.trim()).length;personal.querySelector('summary>small').textContent=n?(n===1?'1 код добавлен':'2 кода добавлены'):'если есть'}
  [$('promo'),$('gift')].forEach(x=>x.addEventListener('input',codeCount));codeCount();

  // Preserve the original legal spans and checkbox nodes, including their listeners.
  const consents=document.querySelector('.intake-consents');consents.before(el('p','ic-consent-heading','Перед отправкой'));
  const titles={consent:'Условия заявки',participation:'Твоё участие в работе','anonymous-data':'Обезличенные материалы'};
  consents.querySelectorAll('label.check-row').forEach(row=>{const input=row.querySelector('input'),copy=row.querySelector('span'),wrap=el('span','ic-consent-copy');copy.classList.add('ic-consent-text');const title=el('strong','ic-consent-title',titles[input.id]);row.insertBefore(wrap,copy);wrap.append(title,copy)});

  $('intake-task-details').querySelector('summary>span').textContent='Задание и пожелания';
  form.querySelector('label[for="details"]').textContent='Текст задания или сообщение преподавателя';
  details.placeholder='Вставь готовое задание или напиши, что важно учесть.';details.rows=4;
  const editor=el('div','ic-editor');details.before(editor);editor.append(details);
  const tools=el('details','ic-brief-tools'),caption=el('summary','ic-tools-caption','Добавить пункт в задание'),chips=el('div','ic-brief-chips');chips.setAttribute('role','group');chips.setAttribute('aria-label','Добавить пункт в задание');tools.append(caption,chips);editor.append(tools);
  const message=el('span','ic-brief-message');message.id='ic-brief-message';message.setAttribute('role','status');message.setAttribute('aria-live','polite');
  const undo=el('button','ic-brief-undo','Отменить добавление');undo.type='button';undo.hidden=true;
  const helperFoot=el('div','ic-brief-foot');helperFoot.append(message,undo);tools.append(helperFoot);
  let insertion=null,internal=false;
  const labels=[['Структура','Структура работы: '],['Источники','Требования к источникам: '],['Оригинальность','Требования к оригинальности: '],['Что уже есть','Уже есть: '],['Что исправить','Нужно исправить: ']];
  function protectTopicSuggestion(){const first=details.value.trim().split(/\r?\n/).find(s=>s.trim())||'';if(labels.some(([,prefix])=>first.startsWith(prefix.trim())))$('intake-use-topic').hidden=true}
  details.addEventListener('input',protectTopicSuggestion);$('topic').addEventListener('input',protectTopicSuggestion);window.addEventListener('pageshow',protectTopicSuggestion);protectTopicSuggestion();
  function dispatch(){internal=true;details.dispatchEvent(new Event('input',{bubbles:true}));internal=false}
  function assist(prefix){
    if(details.disabled)return;const current=details.value,found=current.indexOf(prefix.trim());
    if(found>=0){const pos=Math.min(current.length,found+prefix.length);details.focus();details.setSelectionRange(pos,pos);message.textContent='Этот пункт уже есть — можно дописать ответ.';return}
    const addition=(current?(current.endsWith('\n')?'\n':'\n\n'):'')+prefix;
    if(current.length+addition.length>details.maxLength){message.textContent='Для новой строки не хватает места. Сократи текст или приложи файл.';return}
    const value=current+addition;insertion={before:current,after:value};details.value=value;undo.hidden=false;message.textContent='Пункт добавлен. Напиши свой ответ.';dispatch();details.focus();details.setSelectionRange(value.length,value.length);
  }
  labels.forEach(([name,prefix])=>{const b=el('button','ic-brief-chip',name);b.type='button';b.setAttribute('aria-label','Добавить пункт: '+name);b.onclick=()=>assist(prefix);chips.append(b)});
  undo.onclick=()=>{if(details.disabled||!insertion||details.value!==insertion.after)return;details.value=insertion.before;insertion=null;undo.hidden=true;message.textContent='Добавление отменено.';dispatch();details.focus()};
  details.addEventListener('input',()=>{if(!internal){insertion=null;undo.hidden=true;message.textContent=''}});
  const controlled=[...chips.querySelectorAll('button'),undo];
  function lock(){controlled.forEach(b=>b.disabled=details.disabled)}new MutationObserver(lock).observe(details,{attributes:true,attributeFilter:['disabled']});lock();
})();
