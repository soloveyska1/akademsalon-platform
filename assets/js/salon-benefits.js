(function(root){
'use strict';
// Published loyalty v2 rules. Personal eligibility and payable totals remain server-owned.
function planComparison(price,count,period){
 price=Math.max(0,Math.min(500000,Number(price)||0));count=Math.max(1,Math.min(20,Math.floor(Number(count)||1)));
 const sem=period==='sem';const plusCost=sem?999:449,proCost=sem?2690:1190;
 const plus=Math.round(Math.min(price*.05,1000))*count,pro=Math.round(Math.min(price*.10,3000))*count;
 return {price,count,total:price*count,plus:{discount:plus,cost:plusCost,net:plus-plusCost},pro:{discount:pro,cost:proCost,net:pro-proCost}};
}
function depositProjection(contribution,used){
 contribution=Math.max(20000,Math.min(60000,Math.round((Number(contribution)||20000)/1000)*1000));
 used=Math.max(0,Math.min(contribution,Math.floor(Number(used)||0)));
 const rate=contribution>=60000?.15:contribution>=45000?.12:contribution>=30000?.10:.08;
 // Earned portion uses actual utilisation tiers, capped by the contribution tier.
 const earnedRate=Math.min(rate,used>=60000?.15:used>=45000?.12:used>=30000?.10:.08);
 const earned=Math.floor(used*Math.round(earnedRate*10000)/10000),cashback=Math.floor(used*5/100);
 return {contribution,used,balance:contribution-used,rate,reserve:Math.floor(contribution*Math.round(rate*10000)/10000),earned,cashback,additional:Math.max(0,earned-cashback)};
}
root.SalonBenefitMath={planComparison,depositProjection};
if(typeof module!=='undefined'&&module.exports)module.exports=root.SalonBenefitMath;
if(typeof document==='undefined')return;
const money=n=>Math.round(n).toLocaleString('ru-RU')+' ₽';
const bonus=n=>Math.floor(n).toLocaleString('ru-RU')+' бонусов';
document.querySelectorAll('[data-plan-calculator]').forEach((host,i)=>{
 const id='plan-calc-'+i;
 host.innerHTML='<div class="benefit-calculator"><div class="benefit-controls"><h3>Ваш план на учёбу</h3><label for="'+id+'-price">Примерная цена одной работы</label><input id="'+id+'-price" type="number" min="1000" max="500000" step="500" value="14000" inputmode="numeric"><label for="'+id+'-count">Количество работ <output id="'+id+'-count-out">3</output></label><input id="'+id+'-count" type="range" min="1" max="20" step="1" value="3"><label for="'+id+'-period">За какой период</label><select id="'+id+'-period"><option value="sem">150 дней · семестр</option><option value="month">30 дней · месяц</option></select><p class="benefit-control-hint">Для сравнения считаем работы одной цены, подходящие под скидку. Промокоды и баллы не включены.</p></div><div class="benefit-results" aria-live="polite" aria-atomic="true"></div></div>';
 const price=host.querySelector('input[type=number]'),count=host.querySelector('input[type=range]'),period=host.querySelector('select');
 function render(){
  host.querySelector('output').textContent=count.value;
  const out=host.querySelector('.benefit-results');
  if(!price.value||!price.validity.valid){out.innerHTML='<p>Введите цену от 1 000 до 500 000 ₽, чтобы сравнить варианты.</p>';return}
  const v=planComparison(price.value,count.value,period.value),best=Math.max(v.plus.net,v.pro.net);
  out.innerHTML='<table class="benefit-comparison"><caption>Что получится за '+(period.value==='sem'?'150':'30')+' дней</caption><thead><tr><th scope="col">Расчёт</th><th scope="col">Салон+</th><th scope="col">Pro</th></tr></thead><tbody><tr><th scope="row">Скидки на работы</th><td>'+money(v.plus.discount)+'</td><td>'+money(v.pro.discount)+'</td></tr><tr><th scope="row">Цена абонемента</th><td>'+money(v.plus.cost)+'</td><td>'+money(v.pro.cost)+'</td></tr><tr><th scope="row">Экономия с учётом цены</th><td>'+money(v.plus.net)+'</td><td>'+money(v.pro.net)+'</td></tr></tbody></table><p class="benefit-verdict">'+(best<=0?'По этому расчёту дешевле заказать без абонемента.':(v.plus.net>=v.pro.net?'Салон+':'Pro')+' даёт больше экономии: '+money(best)+' за выбранный период.')+'</p><p class="micro">Если у вас есть промокод, применится большая из скидок, а не обе сразу. Будущий кешбэк не вычтен из цены. Итог и доступность скидки подтверждаются для каждого заказа.</p><a class="text-link" href="plus.html#plus-plans">Посмотреть, что ещё входит →</a>';
 }
 [price,count,period].forEach(x=>x.addEventListener('input',render));render();
});
document.querySelectorAll('[data-deposit-calculator]').forEach((host,i)=>{
 const id='dep-calc-'+i;
 host.innerHTML='<div class="benefit-calculator"><div class="benefit-controls"><h3>Ваши деньги и будущие бонусы</h3><label for="'+id+'-amount">Внести на депозит <output data-amount-out>60 000 ₽</output></label><input id="'+id+'-amount" type="range" min="20000" max="60000" step="1000" value="60000"><label for="'+id+'-used">Из них потратить на услуги <output data-used-out>20 000 ₽</output></label><input id="'+id+'-used" type="range" min="0" max="60000" step="1000" value="20000"><p class="benefit-control-hint">Иллюстрация без возвратов, с обычным кешбэком 5%. Считаем услуги, оплаченные депозитом и принятые клиентом.</p></div><div class="benefit-results" aria-live="polite" aria-atomic="true"></div></div>';
 const amount=host.querySelector('input'),used=host.querySelectorAll('input')[1];
 function render(){used.max=amount.value;used.value=Math.min(Number(used.value),Number(amount.value));const v=depositProjection(amount.value,used.value);host.querySelector('[data-amount-out]').textContent=money(v.contribution);host.querySelector('[data-used-out]').textContent=money(v.used);host.querySelector('.benefit-results').innerHTML='<div class="deposit-buckets"><div><span>Останется ваших денег<small>На следующие услуги</small></span><strong>'+money(v.balance)+'</strong></div><div><span>Максимальный резерв<small>Не доступен для оплаты сейчас</small></span><strong>'+bonus(v.reserve)+'</strong></div><div><span>Условная доплата бонусами<small>Кешбэк '+bonus(v.cashback)+' уже учтён</small></span><strong>'+bonus(v.additional)+'</strong></div></div><p class="micro">По использованной сумме рассчитано '+bonus(v.earned)+', из них вычтен обычный кешбэк. Положительная разница открывается после приёмки услуг и 14 дней. Возврат, другой кешбэк и действующие ограничения изменят результат. Доступный баланс смотрите в кабинете.</p><a class="text-link" href="deposit.html">Смотреть условия →</a>'}
 [amount,used].forEach(x=>x.addEventListener('input',render));render();
});
})(typeof window!=='undefined'?window:globalThis);
