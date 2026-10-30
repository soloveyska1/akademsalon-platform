(function(root){
'use strict';
// Published loyalty v2 rules. Personal eligibility and payable totals remain server-owned.
function planComparison(price,count,period){
 price=Math.max(0,Math.min(500000,Number(price)||0));count=Math.max(1,Math.min(20,Math.floor(Number(count)||1)));
 const sem=period==='sem';const plusCost=sem?999:449,proCost=sem?2690:1190;
 const plus=Math.floor(Math.min(price*5/100,1000))*count,pro=Math.floor(Math.min(price*10/100,3000))*count;
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

(function(root){
'use strict';
const bounded=(v,min,max)=>Math.max(min,Math.min(max,Math.floor(Number(v)||0)));
const planRules={none:{rate:0,cap:0,cashback:5},plus:{rate:5,cap:1000,cashback:5},pro:{rate:10,cap:3000,cashback:10},session:{rate:7,cap:2000,cashback:5}};
function welcomeActive(now){const t=Number(now===undefined?Date.now():now);return Number.isFinite(t)&&t>=Date.parse('2026-08-24T00:00:00+03:00')&&t<Date.parse('2026-09-22T00:00:00+03:00')}
function orderProjection(price,points,plan,promo,gift){
 price=bounded(price,0,500000);points=bounded(points,0,500000);gift=bounded(gift,0,50000);
 const rule=planRules[plan]||planRules.none,subscription=Math.floor(Math.min(price*rule.rate/100,rule.cap));
 const promotion=promo&&price>=2500?Math.round(Math.min(price*.12,5000)):0,discount=Math.max(subscription,promotion);
 const spent=price>=1000?Math.min(points,Math.floor(price*.20),Math.max(0,Math.floor(price*.25)-discount)):0;
 const giftUsed=Math.min(gift,price-discount-spent),payable=price-discount-spent-giftUsed;
 return {price,points,discount,discountSource:promotion>subscription?'promo':subscription?'subscription':'none',spent,giftUsed,payable,cashback:Math.floor(payable*rule.cashback/100),cashbackRate:rule.cashback,pointsLeft:points-spent};
}
root.SalonBenefitMath.orderProjection=orderProjection;root.SalonBenefitMath.welcomeActive=welcomeActive;
if(typeof document==='undefined')return;
const host=document.querySelector('[data-benefits-hub]');if(!host)return;
const $=s=>host.querySelector(s),$$=s=>Array.from(host.querySelectorAll(s));
const money=n=>Math.round(n).toLocaleString('ru-RU')+' ₽',points=n=>Math.floor(n).toLocaleString('ru-RU')+' б.';
const aliases={compare:'subscriptions',bonuses:'bonuses',deposit:'deposit',more:'more',subscriptions:'subscriptions'};
function activate(id,write){id=aliases[id]||'subscriptions';$$('[data-benefit-tab]').forEach(a=>{if(a.dataset.benefitTab===id)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});$$('.bh-panel').forEach(p=>p.hidden=p.id!==id);if(write)history.replaceState(null,'','#'+id)}
$$('[data-benefit-tab]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();activate(a.dataset.benefitTab,true)}));window.addEventListener('hashchange',()=>activate(location.hash.slice(1),false));activate(location.hash.slice(1),false);
const price=$('#bh-price'),count=$('#bh-count');
let visiblePlan=null;
$('#bh-calculation').open=window.matchMedia('(min-width:1051px)').matches;
function selectPlan(id){visiblePlan=id;$$('[data-plan-card]').forEach(p=>p.classList.toggle('is-selected',p.dataset.planCard===id));$$('[data-show-plan]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.showPlan===id)));}
$('#bh-plan-switch').addEventListener('click',e=>{const b=e.target.closest('[data-show-plan]');if(b)selectPlan(b.dataset.showPlan)});
function renderPlans(){
 const valid=price.value&&count.value&&price.validity.valid&&count.validity.valid;$('#bh-plan-error').hidden=!!valid;$('#bh-plans').hidden=!valid;$('#bh-verdict').hidden=!valid;$('#bh-plan-switch').hidden=!valid;if(!valid){$('#bh-calculation-caption').textContent='Проверь параметры расчёта';$('#bh-calculation-period').textContent='Укажи цену и число работ';return;}
 const period=$('input[name=bh-period]:checked').value,v=root.SalonBenefitMath.planComparison(price.value,count.value,period),days=period==='sem'?150:30;
 $('#bh-calculation-caption').textContent=v.count+' '+(v.count===1?'работа':v.count<5?'работы':'работ')+' × '+money(v.price||Number(price.value));$('#bh-calculation-period').textContent='за '+days+' дней';
 const best=v.pro.net>Math.max(0,v.plus.net)?'pro':v.plus.net>0?'plus':'none';
 const items=[{id:'none',title:'Без подписки',fee:0,discount:0,net:0,rate:'Обычная цена заказа',cap:'Кешбэк 5% после полной оплаты',features:['Без дополнительной платы','Бонусы на следующие заказы'],cta:'Выбрать работу',link:'services.html'}, {id:'plus',title:'Салон+',fee:v.plus.cost,...v.plus,rate:'Скидка 5% на каждый заказ',cap:'Не больше 1 000 ₽ на заказ',features:['Приоритет в графике','Куратор и материалы'],cta:'Оформить Салон+',link:'dashboard.html#plus'}, {id:'pro',title:'Салон+ Про',fee:v.pro.cost,...v.pro,rate:'Скидка 10% на каждый заказ',cap:'Не больше 3 000 ₽ на заказ',features:['Всё из Салон+','Кешбэк 10% · тренажёр защиты','Консультация 15 мин / 30 дней'],cta:'Оформить Про',link:'dashboard.html#plus'}];
 const opened=new Set($$('[data-plan-card] details[open]').map(d=>d.closest('[data-plan-card]').dataset.planCard));
 const selected=visiblePlan||best;
 $('#bh-plan-switch').innerHTML=items.map(p=>'<button type="button" data-show-plan="'+p.id+'" aria-pressed="'+(p.id===selected)+'"><span>'+p.title+'</span><small>'+(p.net>0?'−'+money(p.net):p.id==='none'?'Без доплат':'+'+money(-p.net))+'</small></button>').join('');
 $('#bh-plans').innerHTML=items.map(p=>'<article data-plan-card="'+p.id+'" class="bh-plan bh-plan--'+p.id+' '+(p.id===best?'is-best ':'')+(p.id===selected?'is-selected':'')+'"><div class="bh-pass-top"><span>'+(p.id==='none'?'СВОБОДНЫЙ ФОРМАТ':p.id==='plus'?'ТВОЙ АБОНЕМЕНТ':'БОЛЬШЕ ВОЗМОЖНОСТЕЙ')+'</span><i aria-hidden="true">а.</i></div><div class="bh-plan-name"><h3>'+p.title+'</h3></div><div class="bh-plan-price">'+money(p.fee)+'<small>'+(p.fee?'один платёж · '+days+' дней':'без подключения')+'</small></div><div class="bh-plan-discount">'+p.rate+'<small>'+p.cap+'</small></div><details class="bh-plan-features"'+(opened.has(p.id)?' open':'')+'><summary>Что входит <span aria-hidden="true">+</span></summary><ul>'+p.features.map(f=>'<li>'+f+'</li>').join('')+'</ul></details><div class="bh-plan-summary"><div><span>Скидки на '+v.count+' раб.</span><b>'+money(p.discount)+'</b></div><div><span>Работы + абонемент</span><b>'+money(v.total-p.discount+p.fee)+'</b></div><div><span>'+(p.net>=0?'Чистая экономия':'Переплата за подписку')+'</span><b>'+(p.net>=0?money(p.net):money(-p.net))+'</b></div></div><a class="bh-plan-cta" href="'+p.link+'">'+p.cta+' <span aria-hidden="true">↗</span></a>'+(p.id===best?'<span class="bh-best-label">✓ Выгоднее по расчёту</span>':'')+'</article>').join('');
 const chosen=items.find(p=>p.id===best),breakEven=chosen.id==='none'?null:Math.ceil(chosen.fee/(chosen.discount/v.count));
 $('#bh-verdict').innerHTML='<div><strong>'+(best==='none'?'Для этого заказа подписка не обязательна.':chosen.title+' окупается на '+breakEven+'-й работе.')+'</strong><p>'+(best==='none'?'По указанному плану обычный заказ не дороже платных подписок. Бонусы всё равно начислятся.':'За '+v.count+' раб. с подпиской: '+money(v.total-chosen.discount+chosen.fee)+'. Без неё: '+money(v.total)+'.')+'</p></div><div class="bh-verdict-number">'+(best==='none'?'Без доплат':'−'+money(chosen.net))+'</div>';
 $$('[data-count-step]').forEach(b=>b.disabled=Number(count.value)+(Number(b.dataset.countStep))<1||Number(count.value)+(Number(b.dataset.countStep))>20);
}
[price,count,...$$('input[name=bh-period]')].forEach(el=>el.addEventListener('input',renderPlans));$$('[data-count-step]').forEach(b=>b.onclick=()=>{count.value=bounded(Number(count.value)+Number(b.dataset.countStep),1,20);renderPlans()});$$('[data-plan-preset]').forEach(b=>b.onclick=()=>{const v=b.dataset.planPreset.split(',');price.value=v[0];count.value=v[1];$('input[name=bh-period][value='+v[2]+']').checked=true;renderPlans()});renderPlans();
function renderBonus(){
 const inputs=['#bh-order-price','#bh-points','#bh-gift'].map($);if(inputs.some(e=>!e.value||!e.validity.valid)){$('#bh-bonus-receipt').innerHTML='<p>Укажи корректные суммы: заказ от 1 000 ₽, бонусы от 0, сертификат до 50 000 ₽.</p>';return}
 const v=orderProjection(inputs[0].value,inputs[1].value,$('#bh-member').value,$('#bh-promo').checked&&welcomeActive(),inputs[2].value);
 $('#bh-bonus-receipt').innerHTML='<span class="bh-overline">ПРИМЕР ТВОЕГО СЧЁТА</span><div class="bh-receipt-total">'+money(v.payable)+'</div><div class="bh-receipt-caption">Останется оплатить деньгами</div><dl><div><dt>Цена работы</dt><dd>'+money(v.price)+'</dd></div><div><dt>'+(v.discountSource==='promo'?'Промокод 12%':v.discountSource==='subscription'?'Скидка подписки':'Скидка')+'</dt><dd>−'+money(v.discount)+'</dd></div><div><dt>Списать бонусы</dt><dd>−'+points(v.spent)+'</dd></div>'+(v.giftUsed?'<div><dt>Оплата сертификатом</dt><dd>−'+money(v.giftUsed)+'</dd></div>':'')+'</dl><div class="bh-future"><strong>+'+points(v.cashback)+' на следующие заказы</strong><span>'+v.cashbackRate+'% с оплаченной деньгами части после полной оплаты. Использовать за 90 дней.</span></div><p class="bh-note">'+(v.pointsLeft?'Останется '+points(v.pointsLeft)+' из введённого баланса. ':'')+'Скидка + списание: '+money(v.discount+v.spent)+'. Лимит 25% соблюдён.'+($('#bh-promo').checked&&v.price<2500?' Промокод действует от 2 500 ₽.':'')+'</p><a class="bh-plan-cta" href="dashboard.html#deposit">Открыть бонусный счёт ↗</a>';
}
['#bh-order-price','#bh-points','#bh-gift','#bh-member','#bh-promo'].forEach(s=>$(s).addEventListener('input',renderBonus));renderBonus();
function renderDeposit(){
 const amount=$('#bh-deposit-amount'),used=$('#bh-deposit-used');used.max=amount.value;used.value=Math.min(Number(used.value),Number(amount.value));
 const v=root.SalonBenefitMath.depositProjection(amount.value,used.value),rate=$('#bh-deposit-pro').checked?10:5,cashback=Math.floor(v.used*rate/100),extra=Math.max(0,v.earned-cashback);
 $('#bh-deposit-amount-out').textContent=money(v.contribution);$('#bh-deposit-used-out').textContent=money(v.used);
 $$('[data-deposit-preset]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.depositPreset)===v.contribution)));
 $('#bh-deposit-receipt').innerHTML='<span class="bh-overline">ДЕНЕЖНЫЙ ОСТАТОК</span><div class="bh-receipt-total">'+money(v.balance)+'</div><div class="bh-receipt-caption">Твои деньги на следующие услуги</div><div class="bh-deposit-meter" aria-hidden="true"><span style="width:'+(v.used/v.contribution*100)+'%"></span></div><p class="bh-note">Использовано '+money(v.used)+' из '+money(v.contribution)+'</p><dl><div><dt>Резерв до '+Math.round(v.rate*100)+'%</dt><dd>'+points(v.reserve)+'</dd></div><div><dt>Расчёт по использованному</dt><dd>'+points(v.earned)+'</dd></div><div><dt>Кешбэк уже учтён</dt><dd>'+points(cashback)+'</dd></div></dl><div class="bh-future"><strong>Ещё +'+points(extra)+' по депозиту</strong><span>Условная доплата сверх кешбэка. После приёмки услуг и 14 дней. Резерв не доступен для оплаты сейчас.</span></div><a class="bh-plan-cta" href="deposit.html#deposit-calc">Перейти к депозиту ↗</a>';
}
['#bh-deposit-amount','#bh-deposit-used','#bh-deposit-pro'].forEach(s=>$(s).addEventListener('input',renderDeposit));$$('[data-deposit-preset]').forEach(b=>b.onclick=()=>{$('#bh-deposit-amount').value=b.dataset.depositPreset;renderDeposit()});renderDeposit();
function refreshCampaign(){const active=welcomeActive();$('#bh-promo').disabled=!active;if(!active)$('#bh-promo').checked=false;$('#bh-copy-promo').disabled=!active;$('#bh-first-active').hidden=!active;$('#bh-first-ended').hidden=active;return active}
refreshCampaign();document.addEventListener('visibilitychange',()=>{if(!document.hidden){refreshCampaign();renderBonus()}});
$('#bh-copy-promo').onclick=async()=>{if(!refreshCampaign())return;try{await navigator.clipboard.writeText('ПЕРВЫЙЛИСТ');$('[data-copy-label]').textContent='Скопировано';$('#bh-copy-status').textContent='Код скопирован. Укажи его в заявке; доступность и скидку подтвердим при расчёте.'}catch(e){$('#bh-copy-status').textContent='Скопируй код вручную: ПЕРВЫЙЛИСТ. Затем укажи его в заявке.'}};
})(typeof window!=='undefined'?window:globalThis);
