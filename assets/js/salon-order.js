(function(){
'use strict';
const $=id=>document.getElementById(id), form=$('direct-order'), S=window.Salon, C=window.SalonCalc, P=window.SalonProducts;
if(!form||!S||!C||!P)return;
const summary=document.querySelector('.order-summary'),layout=document.querySelector('.order-layout'),summaryMedia=matchMedia('(max-width:800px)');
function placeSummary(){const focus=document.activeElement;if(summaryMedia.matches){$('topic').previousElementSibling.before(summary)}else layout.append(summary);if(focus&&summary.contains(focus))focus.focus({preventScroll:true})}
placeSummary();summaryMedia.addEventListener('change',placeSummary);
const params=new URLSearchParams(location.search), draftKey='salon_direct_selection_v1';
const serviceTypes={plan:'svc_plan',ai:'svc_ai',review:'svc_review',tutor:'svc_tutor',norm:'svc_norm',defense:'svc_defense',defensepack:'svc_defense_pack',commission0:'commission_zero',psychologyvip:'custom',author:'svc_author_order'};
const serviceList=window.SalonServices||[];
let queue=[],busy=false,confirmed=null,frozenPayload=null,service=null,serviceAnswers={};
const diagnosticOption=new Option('Письменный разбор (по желанию)','diagnostic');$('scope').append(diagnosticOption);$('scope').append(new Option('Помощь с готовым проектом по этапам','support')); 
C.disciplines.filter(d=>!['hum','law','tech','med'].includes(d.id)).forEach(d=>$('discipline').append(new Option(d.label,d.id))); 
let svcCode=params.get('service')||(params.get('plan')==='1'?'pl':null)||(params.get('offer')||'').replace(/^svc_/,'');
if(!svcCode)svcCode=({formatting:'nm',defense:'df',tutoring:'tu',ai_editing:'ai'}[params.get('result')])||null;
serviceList.forEach(s=>{const o=document.createElement('option');o.value='service:'+s.id;o.textContent=s.label;$('product').append(o)});
// Historical work URLs remain valid. A work-type entry now defaults to the whole project.
const codes={dp:'diplom',ms:'master',ch:'chapter',kd:'kandidat',cr:'course',ce:'course_emp',pr:'practice',vk:'vak',sc:'scopus',rc:'rinc',sf:'self'};
['course_emp','vak','scopus'].forEach(type=>{const t=C.types.find(x=>x.id===type);const o=document.createElement('option');o.value=type;o.textContent=t.label;$('product').append(o)});
let initial=params.get('product')||params.get('type')||params.get('work')||params.get('workType')||codes[params.get('t')]||'';
const initialService=serviceList.find(s=>s.id===svcCode||s.code===svcCode);
if(initialService)initial='service:'+initialService.id;
function setValue(id,value){if([...$(id).options].some(o=>o.value===value))$(id).value=value}
if(initial)setValue('product',initial);
else{try{const saved=JSON.parse(sessionStorage.getItem(draftKey)||'null');if(saved){setValue('product',saved.product);setValue('scope',saved.scope);setValue('discipline',saved.discipline);if(/^\d{4}-\d{2}-\d{2}$/.test(saved.deadline||''))$('deadline').value=saved.deadline}}catch(e){}}
if(params.get('result')==='editing'||params.get('result')==='ai_editing')$('scope').value='editing';
const legacyDisc=params.get('disc')||params.get('discipline')||({h:'hum',l:'law',t:'tech',m:'med'}[params.get('d')]);
if(legacyDisc)setValue('discipline',legacyDisc);
if(params.get('result')==='diagnostic'||params.get('tier')==='base')$('scope').value='diagnostic';
for(const id of ['promo','gift']){const value=params.get(id);if(value&&/^[A-Za-zА-Яа-яЁё0-9_-]{1,100}$/.test(value))$(id).value=value}
if(params.get('work')==='practice'&&params.get('situation')==='draft'&&params.get('result')==='support')$('scope').value='support';
const part={intro:'Введение или заключение',defense:'Презентация и речь'}[params.get('part')];
if(part){$('scope').value='part';$('volume').value=part}
const today=new Date();today.setHours(0,0,0,0);const isoDate=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
$('deadline').min=isoDate(today);
const asks=document.createElement('div');asks.id='service-questions';$('product').after(asks);
function product(){
 const id=$('product').value;
 if(id.startsWith('service:'))return {id,type:serviceTypes[service.id]||'custom',name:service.label,days:'по заданию',detail:service.desc,price:service.from,min:0};
 const extra=C.types.find(x=>x.id===id);
 return P.products.find(p=>p.id===id)||(extra?{id,type:id,name:extra.label,days:'по заданию',detail:'Состав работы и этапы согласуем по требованиям к вашему проекту.',price:extra.base,min:0}:P.get('course'));
}
function term(){if(!$('deadline').value)return 'free';const diff=Math.ceil((new Date($('deadline').value+'T00:00:00')-today)/86400000);return diff<14?'urgent':diff<30?'mid':'free'}
function selected(){const p=product(),scope=$('scope').value;const custom=p.id==='custom'||p.id==='editing'||(scope==='part'&&p.id!=='chapter');return {p,scope,type:custom?'custom':p.type,tier:service?'base':scope==='diagnostic'?'base':scope==='editing'?'turn':'vip',term:service?'free':term(),disc:$('discipline').value}}
function renderQuestions(){
 asks.replaceChildren();serviceAnswers={};
 if(!service)return;
 (service.ask||[]).forEach(q=>{
  const label=document.createElement('label');label.htmlFor='service-'+q.id;label.textContent=q.label+(q.req?' *':'');let input;
  if(q.opts){input=document.createElement('select');const empty=new Option('Выберите вариант','');input.append(empty);q.opts.forEach(o=>input.append(new Option(typeof o==='string'?o:o.label,typeof o==='string'?o:o.value)))}
  else{input=document.createElement(q.type==='textarea'?'textarea':'input');input.placeholder=q.ph||'';input.maxLength=4000}
  input.id='service-'+q.id;input.required=!!q.req;input.addEventListener('input',()=>{serviceAnswers[q.id]=input.value;update()});asks.append(label,input);
 });
}
function changeProduct(){
 service=serviceList.find(s=>'service:'+s.id===$('product').value)||null;
 if($('product').value==='editing')$('scope').value='editing';
 else if($('product').value==='chapter')$('scope').value='part';
 else if($('product').value!=='custom')$('scope').value='whole';
 $('scope').disabled=!!service;
 renderQuestions();update();
}
function quote(){const a=selected();if(service){const n=service.priceFor?service.priceFor(serviceAnswers):service.from;return {amount:n,exact:service.fixed,note:'Стоимость выбранной услуги. Окончательные условия закрепим до оплаты.'}}
 if(a.p.id==='custom'||a.p.id==='editing'||(a.scope==='part'&&a.p.id!=='chapter'))return {amount:null,note:'Посчитаем только выбранную часть по заданию. Полная работа в цену не включается.'};
 const q=C.quote(a.type,a.disc,a.term,a.tier);return {amount:q.low,exact:false,note:(a.term==='urgent'?'Срок до 14 дней: в действующем тарифе учтена срочность ×1,45. ':a.term==='mid'?'Срок 14–29 дней: учтён коэффициент ×1,15. ':'')+(a.disc!=='hum'?'Учтена выбранная дисциплина. ':'')+'Итоговая смета после задания.'};
}
function update(){
 const a=selected(),q=quote();
 const participation=((a.tier==='vip'&&a.scope!=='support')||service?.id==='psychologyvip')&&service?.id!=='author';$('participation-row').hidden=!participation;$('participation').required=participation;
 const anonymous=service?.id==='psychologyvip';$('anonymous-row').hidden=!anonymous;$('anonymous-data').required=anonymous;
 $('summary-name').textContent=a.p.name;
 $('summary-scope').textContent=service?'Отдельная услуга':{whole:'Работа с нуля',part:'Отдельная часть',editing:'Доработка готового текста',diagnostic:'Письменный разбор (по желанию)',support:'Работа с готовым проектом по этапам'}[a.scope];
 $('summary-price').textContent=q.amount?(q.exact?'':'от ')+P.money(q.amount)+(service?.unit||''):'По заданию';
 $('summary-price-note').textContent=q.note;
 $('summary-days').textContent=a.scope==='diagnostic'?'1–2 рабочих дня':a.scope==='editing'?'по объёму правок':a.p.days;
 $('summary-detail').textContent=a.scope==='support'?'План согласованных этапов, редакторские версии готового комплекта и итоговая сверка.':a.scope==='diagnostic'?'Письменный разбор требований и материалов с порядком дальнейших действий. Это отдельная услуга по вашему выбору.':a.scope==='editing'?'Исправленный текст по вашим замечаниям и согласованному заданию.':a.scope==='part'&&a.p.id!=='chapter'?'Только указанная вами часть. Уточните нужный результат в поле «Объём» или описании.':a.p.detail;
 let timeNote='Срок плановый. Точную дату подтвердим до оплаты.';
 if($('deadline').value){const days=Math.ceil((new Date($('deadline').value+'T00:00:00')-today)/86400000);timeNote='Нужная дата: '+new Date($('deadline').value+'T00:00:00').toLocaleDateString('ru-RU')+'. '+(days<(a.scope==='diagnostic'?1:a.p.min)?'Срок короче планового: сначала подтвердим возможность выполнить задание.':'Возможность сдачи подтвердим до оплаты.')}
 $('deadline-note').textContent=timeNote;
 try{sessionStorage.setItem(draftKey,JSON.stringify({product:$('product').value,scope:a.scope,discipline:a.disc,deadline:$('deadline').value}))}catch(e){}
}
// Restore selection without storing topic, contact, name, notes, consent or files.
service=serviceList.find(s=>'service:'+s.id===$('product').value)||null;
if($('product').value==='editing')$('scope').value='editing';if($('product').value==='chapter')$('scope').value='part';
$('scope').disabled=!!service;renderQuestions();
function validRemarks(record,now){if(!record||record.v!==1||record.kind!=='remarks'||typeof record.text!=='string'||!Number.isFinite(record.created_at)||record.created_at>now||now-record.created_at>600000)return '';const text=record.text.trim();return text.length>=40&&text.length<=800?text:''}
function validCommission(record,now){if(!record||record.version!==1||!['course','diplom','master'].includes(record.work)||!['draft','ai','comments'].includes(record.source)||!Number.isFinite(record.savedAt)||record.savedAt>now||now-record.savedAt>600000||typeof record.topic!=='string'||record.topic.length>240)return null;return {work:record.work,source:record.source,topic:record.topic.trim()}}
function consumeHandoff(key){try{const raw=sessionStorage.getItem(key);sessionStorage.removeItem(key);return JSON.parse(raw||'null')}catch(e){return null}}
if(params.get('handoff')==='remarks'){
 const text=validRemarks(consumeHandoff('salon_remarks_handoff_v1'),Date.now());
 const note=document.createElement('p');note.className='field-note';note.setAttribute('role','status');
 if(text){$('details').value=text;note.textContent='Замечания перенесены в задание. Проверьте их перед отправкой.'}else note.textContent='Текст не перенесён: прошло больше 10 минут или он недоступен. Вставьте замечания в задание.';
 $('details').after(note);const clean=new URL(location.href);clean.searchParams.delete('handoff');history.replaceState(history.state,'',clean.pathname+clean.search+clean.hash);
}
if(service?.id==='commission0'){
 const incoming=validCommission(consumeHandoff('salon_commission_zero_handoff_v1'),Date.now());
 if(incoming){for(const id of ['work','source']){$('service-'+id).value=incoming[id];serviceAnswers[id]=incoming[id]}$('topic').value=incoming.topic}
}
update();
$('product').addEventListener('change',changeProduct);['scope','discipline','deadline'].forEach(id=>$(id).addEventListener('change',update));
function message(text,focus=true){$('form-message').textContent=text;$('form-message').hidden=false;if(focus)$('form-message').focus()}
function fileId(f){let h=2166136261;const s=[f.name,f.size,f.lastModified,f.type].join('|');for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return 'file_'+(h>>>0).toString(36)}
function fileList(){
 $('file-list').replaceChildren();queue.forEach((a,i)=>{const row=document.createElement('div');row.className='file-row';const text=document.createElement('span');text.textContent=a.file.name+' · '+(a.file.size/1048576).toFixed(1)+' МБ';const b=document.createElement('button');b.type='button';b.textContent='×';b.setAttribute('aria-label','Убрать файл '+a.file.name);b.disabled=busy||!!frozenPayload;b.onclick=()=>{queue.splice(i,1);fileList()};row.append(text,b);$('file-list').append(row)})
}
$('files').addEventListener('change',()=>{
 const errors=[];for(const f of $('files').files){if(queue.some(a=>a.id===fileId(f)))continue;if(queue.length>=5){errors.push('Можно прикрепить до 5 файлов.');break}if(!f.size||f.size>20*1048576){errors.push('Пустой файл или размер больше 20 МБ: '+f.name);continue}if(!/\.(docx?|pdf|rtf|odt|txt|jpe?g|png|webp|heic)$/i.test(f.name)){errors.push('Неподдерживаемый формат: '+f.name);continue}queue.push({file:f,id:fileId(f),state:'wait'})}
 $('files').value='';fileList();if(errors.length)message(errors.join('\n'));
});
function freeze(on){form.querySelectorAll('input,select,textarea').forEach(x=>x.disabled=on);$('scope').disabled=on||!!service;fileList()}
function payload(){const a=selected();const details=[a.p.name,'Объём заказа: '+$('summary-scope').textContent,$('volume').value.trim()?'Объём: '+$('volume').value.trim():'',...Object.entries(serviceAnswers).map(([k,v])=>{const q=service.ask.find(x=>x.id===k);return q.label+': '+v}),$('details').value.trim()].filter(Boolean).join('\n');
 const p={type:a.type,disc:C.transportDiscipline(a.disc),term:a.term,tier:a.tier,topic:$('topic').value.trim(),deadline:$('deadline').value,details,plan:service?.id==='plan',name:$('name').value.trim(),contact:$('contact').value.trim(),website:$('website').value,consent:$('consent').checked,privacy_notice_ack:$('consent').checked,consent_doc:window.SalonDirectContract.consent_doc,page:'configurator.html'};
 if($('promo').value.trim())p.promo=$('promo').value.trim();if($('gift').value.trim())p.gift=$('gift').value.trim();
 if(S.refCode?.())p.ref=S.refCode();
 if(service?.id!=='author'){p.contract_contour='A';p.academic_submode=((a.tier==='vip'&&a.scope!=='support')||service?.id==='psychologyvip')?'A2':'A1';if(p.academic_submode==='A2')p.author_participation={required:true,confirmed:$('participation').checked,checkpoints:['утверждение проблемы, цели, метода и содержательных решений','проверка фактов, источников и исходных данных','подготовка, содержательная проверка и утверждение клиентом финальной версии']}}
 p.case_context={work_type:a.p.type,requested_result:service?service.id:a.scope==='diagnostic'?'diagnostic':a.scope==='editing'?'editing':'support',offer_id:service?.id==='psychologyvip'?'psychology_full_vip':service?serviceTypes[service.id]:a.type==='custom'?'custom':a.tier==='vip'?'work_vip':a.tier==='turn'?'work_turn':'work_base',contract_contour:p.contract_contour,academic_submode:p.academic_submode,author_participation:!!p.author_participation?.confirmed,scope_code:service?.id==='psychologyvip'?'psychology_full_vip':a.p.type==='practice'&&['diagnostic','editing','support'].includes(a.scope)?'practice_draft_'+a.scope:null,result_code:a.scope==='diagnostic'?'diagnostic':a.scope==='editing'?'editing':'support',work:a.p.type,result:a.scope==='diagnostic'?'diagnostic':a.scope==='editing'?'editing':'support',user_confirmed:true,scope:a.scope,source:'direct-order'};
 if(service?.id==='psychologyvip')p.case_context.data_deidentified=$('anonymous-data').checked;
 // Reuse the established serializer without init(): no stored cart is read,
 // no cart UI is mounted, and S inside cart.js stays null so client fields
 // cannot be persisted. The actual submitted line retains package semantics.
 if(service||p.case_context.scope_code){
  const q=quote(),cart=window.SalonCart;cart.clear();
  cart.add({kind:service?'service':'work',type:a.type,serviceId:service?.id||'',label:a.p.name,disc:a.disc,term:a.term,tier:a.tier,low:q.amount||0,high:q.amount||0,fixed:!!service?.fixed,topic:p.topic,deadline:p.deadline,requirements:p.details,answers:{...serviceAnswers},academicSubmode:p.academic_submode,authorParticipation:!!p.author_participation?.confirmed,scopeCode:p.case_context.scope_code,resultCode:a.scope==='diagnostic'?'diagnostic':a.scope==='editing'?'editing':'support',sourceMaterialProvided:queue.length>0},{silent:true});
  p.cart=cart.payload();p.cart.items.forEach(x=>x.disc=C.transportDiscipline(x.disc));
 }
 if(queue.length)p.attachments=queue.map(a=>({client_file_id:a.id,name:a.file.name,size:a.file.size,type:a.file.type||'application/octet-stream',status:'pending'}));
 if(S.attribution?.decoratePage)p.page=S.attribution.decoratePage(p.page);
 return p;
}
function renderUploads(){
 $('upload-results').replaceChildren();queue.forEach(a=>{const row=document.createElement('div');row.className='file-row';const text=document.createElement('span');text.textContent=a.file.name+' · '+({wait:'ожидает загрузки',up:'загружаем…',ok:'файл передан',err:'файл не загрузился'}[a.state]);row.append(text);if(a.state==='err'){const b=document.createElement('button');b.type='button';b.textContent='Повторить загрузку';b.onclick=()=>upload(a);row.append(b)}$('upload-results').append(row)})
}
async function upload(a){if(!confirmed||a.state==='up'||a.state==='ok')return;a.state='up';renderUploads();try{const fd=new FormData();fd.append('file',a.file,a.file.name);fd.append('client_file_id',a.id);const h=S.api.headers('POST');if(confirmed.token)h['X-Order-Token']=confirmed.token;const r=await fetch(S.api.base+'/orders/'+confirmed.id+'/upload',{method:'POST',credentials:'include',headers:h,body:fd});const data=await r.json();a.state=r.ok&&data.ok===true?'ok':'err'}catch(e){a.state='err'}renderUploads();if(queue.every(f=>f.state==='ok')){try{sessionStorage.removeItem(draftKey)}catch(e){}}}
async function showSuccess(r,attempt){
 confirmed=r;if(S.visit?.order)S.visit.order(r.id,r.token);if(S.metrika?.goal)S.metrika.goal('order_submitted');S.orderContract.clear('configurator',undefined,attempt.clientRequestId);
 if(r.token)S.api.addGuestToken(r.token);if(r.guest_session)S.api.setGuestHint(true);
 if(!queue.length){try{sessionStorage.removeItem(draftKey)}catch(e){}}
 document.querySelector('.order-layout').hidden=true;document.body.classList.add('is-success');$('order-success').hidden=false;$('success-id').textContent=String(r.id);
 // Only a local cabinet claim URL can become a navigation target.
 $('success-cabinet').href=r.token&&/^[A-Za-z0-9_-]{16,128}$/.test(r.token)?'dashboard.html#claim='+encodeURIComponent(r.token):'dashboard.html';
 if(!r.token&&r.claim_url){try{const u=new URL(r.claim_url,location.origin);if(u.origin===location.origin&&u.pathname==='/dashboard.html')$('success-cabinet').href=u.href}catch(e){}}
 const notices=[];if(r.promo&&r.promo!=='ok')notices.push('Промокод не применился. Уточним условия вместе со сметой.');if(r.gift&&r.gift!=='ok')notices.push('Сертификат не применился. Уточним его вместе со сметой.');if(notices.length){const p=document.createElement('p');p.textContent=notices.join(' ');$('success-cabinet').before(p)}
 $('order-success').focus();renderUploads();for(const a of queue)await upload(a);
}
const pendingFiles=()=>confirmed&&queue.some(a=>a.state!=='ok');
window.addEventListener('beforeunload',e=>{if(pendingFiles()){e.preventDefault();e.returnValue=''}});
$('success-cabinet').addEventListener('click',e=>{if(pendingFiles()&&!window.confirm('Часть файлов ещё не передана. Если уйти, их потребуется прикрепить заново в кабинете. Перейти?'))e.preventDefault()});
form.addEventListener('submit',async e=>{
 e.preventDefault();if(busy||confirmed)return;
 if(!frozenPayload){
  for(const id of ['topic','contact']){$(id).removeAttribute('aria-invalid');if(!$(id).value.trim()){message(id==='topic'?'Напишите тему или коротко опишите задачу.':'Укажите контакт для расчёта.',false);$(id).setAttribute('aria-invalid','true');$(id).focus();return}}
  if(S.valid?.contact&&!S.valid.contact($('contact').value.trim())){message('Укажите корректный @ник Telegram, email, телефон или ссылку VK.',false);$('contact').setAttribute('aria-invalid','true');$('contact').focus();return}
  if($('deadline').value&&$('deadline').value<isoDate(today)){message('Дата уже прошла. Выберите сегодняшнюю или будущую дату.',false);$('deadline').focus();return}
  if(!form.reportValidity())return;
  frozenPayload=payload();
 }
 if(S.visit?.event)S.visit.event('submit_attempt',{cta:service?'service:'+service.code:'calculator'});busy=true;freeze(true);$('send-order').disabled=true;$('send-order').textContent='Отправляем…';$('form-message').hidden=true;
 let attempt;try{attempt=await S.orderContract.submit('configurator',frozenPayload,25000)}catch(e){attempt={st:0,r:null}}
 busy=false;$('send-order').disabled=false;
 if(S.orderContract.isConfirmed(attempt)){await showSuccess(attempt.r,attempt);return}
 const kind=S.orderContract.classify(attempt),error=attempt.r?.error;
 if(/consent.*mismatch/.test(error||'')){$('send-order').disabled=true;$('send-order').textContent='Нужно обновить страницу';message('Условия обработки заявки обновились. Заявка не принята. Скопируйте введённое задание и обновите страницу, затем проверьте согласие.');return}
 if(kind==='definitive_rejection'||kind==='local_blocked'){
  if(kind==='definitive_rejection')S.orderContract.clear('configurator',undefined,attempt.clientRequestId);
  frozenPayload=null;freeze(false);$('send-order').textContent='Отправить заявку →';
  message(/consent.*mismatch/.test(error||'')?'Условия обработки заявки обновились. Обновите страницу и проверьте согласие перед отправкой.':error==='business_model_forbidden'?'Эта задача требует другого формата договора. Свяжитесь с нами через раздел контактов, чтобы согласовать подходящий вариант.':'Заявка не отправлена. Проверьте поля и попробуйте ещё раз. Если ошибка повторяется, свяжитесь с нами через раздел контактов.');
 }else{
  $('send-order').textContent='Проверить отправку ещё раз';
  message(kind==='conflict'?'Сервер сообщил о конфликте заявки. Мы сохранили эту попытку. Повторите проверку или свяжитесь с нами; не создавайте новую заявку.':'Пока нет подтверждения сервера. Заявка могла дойти. Повторная проверка использует тот же номер попытки и не создаёт новую заявку.');
 }
});
})();
