(function(){
'use strict';
const main=document.querySelector('[data-support-page]');if(!main)return;
const $=s=>main.querySelector(s),money=n=>new Intl.NumberFormat('ru-RU').format(n)+' ₽';
function choose(selector,button){main.querySelectorAll(selector).forEach(b=>b.setAttribute('aria-pressed',String(b===button)));}
const cases={
 fix:{label:'ИСПРАВЛЕНИЕ ПО ЗАДАНИЮ',title:'Поправим без доплаты.',text:'Например, в работе не соблюдён пункт исходной методички. Пришли замечание в обсуждение заказа. Сверим с согласованными требованиями и исправим несоответствие.',url:'dashboard.html#orders',action:'Открыть мой заказ'},
 new:{label:'ИЗМЕНИЛСЯ СОСТАВ',title:'Сначала оценим изменения.',text:'Новая глава, новая тема или требования, которых не было в задании, меняют объём. Согласуем дополнение, цену и срок. До твоего подтверждения новый объём не запускается.',url:'priyomnaya.html',action:'Обсудить изменения'},
 date:{label:'ИЗМЕНИЛАСЬ ДАТА',title:'Сверим объём и возможность.',text:'Если тебе нужен результат раньше, напиши в обсуждении заказа. Проверим загрузку и состав. Новую дату и возможную доплату закрепим после согласования, а не поменяем молча.',url:'dashboard.html#orders',action:'Написать по заказу'},
 stop:{label:'ОСТАНОВКА РАБОТЫ',title:'Посмотрим, что уже сделано.',text:'До начала оплаченной позиции можно вернуть её стоимость. Если работа начата, расчёт зависит от выполненной части и подтверждённых расходов. Следующий этап не стартует автоматически.',url:'refunds.html',action:'Правила возврата'}
};
function showCase(key){const c=cases[key];if(!c)return;$('#sp-case-answer').innerHTML='<span class="sp-case-label">'+c.label+'</span><h3>'+c.title+'</h3><p>'+c.text+'</p><a class="sp-inline" href="'+c.url+'">'+c.action+' <span aria-hidden="true">↗</span></a>';}
main.querySelectorAll('[data-guarantee-case]').forEach(b=>b.addEventListener('click',()=>{choose('[data-guarantee-case]',b);showCase(b.dataset.guaranteeCase)}));if($('#sp-case-answer'))showCase('fix');
const steps={
 terms:['Состав понятен до оплаты.','Сверь задачи, объём, материалы, дату и стоимость. Для работы по частям проверь, какой результат входит в каждый этап. Если что-то не совпадает — обсуди это до платежа.','guarantees.html','Что фиксируем в заказе'],
 pay:['Платишь по своему счёту.','В кабинете открой заказ и раздел оплаты. Там видны назначение и сумма. Кнопка ведёт на защищённую страницу кассы. Оплата появляется после согласования и закрепления условий.','dashboard.html#orders','К моим заказам'],
 confirm:['Ждём подтверждение кассы.','Возвращение с платёжной страницы ещё не означает, что деньги зачислены. Проверь статус в заказе. Если деньги списаны, а статус не обновился, не плати снова: напиши в обсуждение.','dashboard.html#orders','Проверить статус'],
 work:['Всё остаётся в одном заказе.','Файлы, переписка и согласованные сроки доступны в кабинете. После получения результата можешь передать замечания. Следующий этап начинается по согласованию.','dashboard.html#orders','Открыть заказ']
};
function showStep(key){const s=steps[key];if(!s)return;$('#sp-payment-step').innerHTML='<h3>'+s[0]+'</h3><div><p>'+s[1]+'</p><a class="sp-inline" href="'+s[2]+'">'+s[3]+' <span aria-hidden="true">↗</span></a></div>';}
main.querySelectorAll('[data-payment-step]').forEach(b=>b.addEventListener('click',()=>{choose('[data-payment-step]',b);showStep(b.dataset.paymentStep)}));if($('#sp-payment-step'))showStep('terms');
let parts=3;
function example(){const input=$('#sp-budget');if(!input)return;const total=Number(input.value),err=$('#sp-budget-error');if(!Number.isInteger(total)||total<1000||total>300000){err.hidden=false;err.textContent='Введи сумму от 1 000 до 300 000 ₽ целыми рублями.';input.setAttribute('aria-invalid','true');$('#sp-pay-now').textContent='—';$('#sp-pay-total').textContent='—';$('#sp-pay-caption').textContent='Нужна сумма для примера';$('#sp-pay-schedule').replaceChildren();return;}err.hidden=true;input.removeAttribute('aria-invalid');const rates=parts===1?[100]:parts===2?[50,50]:[30,40,30],amounts=rates.map((r,i)=>i===rates.length-1?0:Math.floor(total*r/100));amounts[amounts.length-1]=total-amounts.reduce((a,b)=>a+b,0);$('#sp-pay-now').textContent=money(amounts[0]);$('#sp-pay-total').textContent=money(total);$('#sp-pay-caption').textContent=rates[0]+'% от суммы примера';$('#sp-pay-schedule').innerHTML=amounts.map((a,i)=>'<div><span class="sp-payment-dot">'+(i+1)+'</span><span>'+(['Первый платёж','Второй платёж','Третий платёж'][i])+'<small>'+rates[i]+'% · '+(i?'по согласованному графику':'после согласования')+'</small></span><b>'+money(a)+'</b></div>').join('');}
main.querySelectorAll('[data-pay-parts]').forEach(b=>b.addEventListener('click',()=>{parts=Number(b.dataset.payParts);choose('[data-pay-parts]',b);example()}));$('#sp-budget')?.addEventListener('input',example);example();
const form=$('#sp-question-form');
if(form){
 let busy=false,uncertain=false,topic='scope',settled=false;
 const submit=form.querySelector('[type=submit]'),status=$('#sp-form-status'),message=$('#sp-message'),contact=$('#sp-contact');
 const hints={scope:'Тип работы, примерный объём и дата помогут ответить точнее. Если пока не знаешь — так и напиши.',urgent:'Напиши точную дату и время, объём и что уже готово. Экспресс за 24 часа: ×2 к плановой цене основной работы; быстрее — по расчёту.',payment:'Если вопрос о твоём платеже, лучше открыть обсуждение заказа: там есть счёт и история. Не отправляй номер карты, пароль или код банка.',other:'Опиши ситуацию своими словами. Одного-двух предложений достаточно, чтобы начать.'};
 main.querySelectorAll('[data-question-topic]').forEach(b=>b.addEventListener('click',()=>{choose('[data-question-topic]',b);topic=b.dataset.questionTopic;$('#sp-topic-hint').textContent=hints[topic]}));
 function note(text,error=false){status.hidden=false;status.textContent=text;status.toggleAttribute('data-error',error)}
 function snapshot(){return{name:form.elements.name.value.trim(),contact:contact.value.trim(),message:message.value.trim()};}
 message.addEventListener('input',()=>{$('#sp-message-count').textContent=message.value.length+' / 2 000';message.setCustomValidity('')});contact.addEventListener('input',()=>contact.setCustomValidity(''));
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||uncertain||settled)return;const body=snapshot();
  if(body.message.length<10){message.setCustomValidity('Добавь немного деталей: минимум 10 символов.');message.reportValidity();return;}
  const S=window.Salon;const valid=S?.valid?.contact?S.valid.contact(body.contact):/^@[a-zA-Z0-9_]{5,32}$/.test(body.contact)||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.contact);
  if(!valid){contact.setCustomValidity('Укажи Telegram в формате @ник или корректную почту.');contact.reportValidity();return;}
  if(!form.reportValidity())return;
  if(!S?.api){note('Не удалось подключиться. Текст остаётся здесь. Обнови соединение или напиши в Telegram.',true);return;}
  busy=true;submit.disabled=true;submit.textContent='Сохраняем вопрос…';note('Отправляем. Не закрывай страницу до подтверждения.');
  let timer;
  function ambiguous(){uncertain=true;note('Не удалось подтвердить сохранение. Чтобы не отправить вопрос дважды, уточни его статус в Telegram. Текст и контакт остались в форме.',true);form.querySelector('.sp-recovery').hidden=false;submit.textContent='Подтверждение не получено';}
  timer=setTimeout(ambiguous,25000);
  try{
   const r=await S.api.post('/lead',{...body,page:'/priyomnaya.html#'+topic,privacy_notice_ack:true,website:form.elements.website.value});
   clearTimeout(timer);
   if(r?.ok&&typeof r.id==='number'&&Number.isSafeInteger(r.id)&&r.id>0){settled=true;uncertain=false;form.hidden=true;const done=$('#sp-success');done.hidden=false;$('#sp-success-copy').textContent='Обращение № '+Number(r.id)+'. Ответ придёт на указанный контакт.';done.querySelector('.sp-success-contact').textContent=body.contact;done.focus({preventScroll:true});done.scrollIntoView({block:'center',behavior:'auto'});return;}
   // Only confirmed pre-write validation/rate-limit failures permit resubmission.
   const errors={rate_limit:'Слишком много обращений. Подожди и попробуй позже.',rate_limited:'Слишком много обращений. Подожди и попробуй позже.',bad_contact:'Проверь контакт для ответа.',contact_required:'Укажи контакт для ответа.',bad_message:'Опиши вопрос подробнее.',privacy_notice_required:'Подтверди согласие на обработку вопроса.',privacy_notice_ack_required:'Подтверди согласие на обработку вопроса.'};
   if(r?.ok===false&&Object.hasOwn(errors,r.error)){uncertain=false;form.querySelector('.sp-recovery').hidden=true;note(errors[r.error],true);}
   else ambiguous();
  }catch(_){clearTimeout(timer);ambiguous();}
  finally{busy=false;if(!uncertain){submit.disabled=false;submit.innerHTML='Отправить вопрос <span aria-hidden="true">↗</span>';}}
 });
 $('[data-copy-question]').addEventListener('click',async e=>{const button=e.currentTarget;try{await navigator.clipboard.writeText(message.value);button.textContent='Вопрос скопирован'}catch(_){message.focus();message.select();note('Текст выделен. Скопируй его и отправь в Telegram.')}});
 // Drafts and contact stay only in this page's live controls, never in storage or telemetry.
}
$('[data-open-listik]')?.addEventListener('click',()=>{const launcher=document.querySelector('.sa-launch');if(launcher){launcher.click();return;}const status=$('#sp-listik-status');if(!status)return;status.hidden=false;status.textContent='Листик ещё загружается. Попробуй через несколько секунд или оставь вопрос в форме.'});
})();
