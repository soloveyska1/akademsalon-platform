(async function () {
  'use strict';
  const S = window.Salon;
  if (!S?.api || document.getElementById('salon-assistant') || /^admin/.test(location.pathname.split('/').pop())) return;
  const A = S.api;
  try{await import('/assets/js/salon-assistant-order.js?v=listik20260911');}catch(_){}
  const D=window.SalonAssistantOrder;

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const mascot = '/assets/img/salon-assistant/listik-states.webp';
  const portrait = (cls = '') => '<span class="sa-mascot '+cls+'" aria-hidden="true"><img class="sa-sprite" src="'+mascot+'" alt="" width="1024" height="1024"></span>';
  const icons = {send:'↑', close:'×', back:'←', more:'↗'};
  const launcher = document.createElement('button');
  launcher.type = 'button'; launcher.className = 'sa-launch';
  launcher.setAttribute('aria-label', 'Открыть Листика, бота-помощника Салона');
  launcher.setAttribute('aria-controls','salon-assistant'); launcher.setAttribute('aria-expanded','false');
  launcher.innerHTML = portrait()+'<span><b>Есть вопрос?</b><small>Давай разберёмся</small></span><i aria-hidden="true">↗</i>';
  const panel = document.createElement('dialog');
  panel.id = 'salon-assistant'; panel.className = 'sa-panel'; panel.setAttribute('aria-labelledby','sa-title');
  panel.innerHTML = '<header class="sa-head"><div class="sa-avatar">'+portrait()+'</div><div class="sa-identity"><h2 id="sa-title">Листик</h2><p><span class="sa-status-dot" aria-hidden="true"></span><span id="sa-status">Бот-помощник Салона</span></p></div><button class="sa-icon sa-reset" type="button" data-sa-reset aria-label="Начать новый разговор">↺</button><button class="sa-icon" type="button" data-sa-close aria-label="Свернуть чат">'+icons.close+'</button></header>'+
    '<div class="sa-context"><span id="sa-context"></span><button type="button" data-sa-topics aria-expanded="false" aria-controls="sa-topics">Темы ↗</button></div><nav id="sa-topics" class="sa-topics" aria-label="Темы для Листика" hidden></nav><section class="sa-brief" id="sa-brief" aria-label="Черновик задания" hidden></section><section class="sa-reset-check" hidden><p>Начать новый разговор? Текст текущего разговора будет очищен.</p><button type="button" data-sa-reset-confirm>Начать заново</button><button type="button" data-sa-reset-cancel>Продолжить разговор</button></section><div class="sa-feed" id="sa-feed" role="log" aria-live="polite" aria-relevant="additions"></div>'+
    '<section class="sa-order-stage" id="sa-order-stage" hidden aria-label="Проверка и оформление заказа"></section><section class="sa-handoff" id="sa-handoff" hidden aria-labelledby="sa-handoff-title"></section>'+
    '<footer class="sa-bottom"><form class="sa-form"><label class="sa-sr" for="sa-question">Сообщение Листику</label><div class="sa-composer"><textarea id="sa-question" name="question" rows="1" maxlength="2000" placeholder="Что хочешь узнать?" autocomplete="off" required></textarea><button type="submit" aria-label="Отправить вопрос">↑</button></div></form><div class="sa-bottom-line"><span>Отвечает бот · важное уточним у мастера</span><button type="button" data-sa-human>Позвать мастера</button></div></footer>';
  document.body.append(launcher,panel);
  const feed = panel.querySelector('#sa-feed'), input = panel.querySelector('#sa-question'), handoff = panel.querySelector('#sa-handoff'), bottom = panel.querySelector('.sa-bottom');
  const bindings = new WeakMap();
  let handoffLocked=false;
  let createdOrderId=null;
  let draft={},orderFrame=null,orderState=null,frameCleanup=null;
  let busy = false, epoch = 0, context = {}, conversation = [], currentOrder = orderId(), draftBeforeHandoff = '', savedHandoff = null, phase = 'idle', phaseTimer = null, finishReveal = null, followScroll = true;
  function pendingFrame(){return !!orderFrame&&!(orderState?.state==='uploads'&&orderState.pending===0);}
  function orderId(){ const m = location.hash.match(/^#order-(\d+)(?:-|$)/); return m ? Number(m[1]) : null; }
  function authHeaders(){const tokens = A.guestTokens();return tokens.length ? {'X-Order-Tokens':tokens.join(',')} : {};}
  function demo(){return !!(A.demoPreview || document.body.classList.contains('is-cabinet-demo'));}
  function safeLink(value){try{const u=new URL(value,location.origin);if(u.origin===location.origin || u.protocol==='https:' && ['akademsalon.ru','studkladovaya.ru','t.me'].includes(u.hostname))return u.href;}catch(_){}return '';}
  const jump=document.createElement('button');jump.type='button';jump.className='sa-jump';jump.textContent='К последнему сообщению ↓';jump.hidden=true;feed.after(jump);
  function scroll(force=false){if(force||followScroll)feed.scrollTop=feed.scrollHeight;}
  feed.addEventListener('scroll',()=>{followScroll=feed.scrollHeight-feed.clientHeight-feed.scrollTop<65;jump.hidden=followScroll||!handoff.hidden;});
  jump.addEventListener('click',()=>{followScroll=true;scroll(true);jump.hidden=true;});
  function starters(){
    if(currentOrder)return ['Что дальше по моему заказу?','Где мои файлы?','Вопрос по оплате'];
    if(/benefits|plus|deposit|referral/.test(location.pathname+location.hash))return ['Как получить подарки?','Как работают бонусы?','Чем отличается депозит?'];
    return ['Хочу заказать работу','Расскажи о Салоне','Как получить подарки?'];
  }
  function chips(questions){return '<div class="sa-suggestions">'+questions.slice(0,3).map(q=>'<button type="button" data-sa-question="'+esc(q)+'">'+esc(q)+'<span aria-hidden="true">↗</span></button>').join('')+'</div>';}
  function welcome(){
    const title = currentOrder ? 'Давай посмотрим<br>твой заказ.' : 'С чего начнём?';
    feed.innerHTML='<section class="sa-welcome"><div class="sa-welcome-art">'+portrait()+'<span class="sa-paper-note">На твоей<br>стороне.</span></div><h3>'+title+'</h3><p>'+(currentOrder ? 'Подскажу по статусу, файлам и оплате. Если нужен человек, подготовлю вопрос мастеру.' : 'Я Листик. Помогу с работой, сроками и выгодами. Можно спросить своими словами.')+'</p>'+chips(starters())+'</section>';
    panel.querySelector('#sa-context').innerHTML = currentOrder ? '<span class="sa-context-icon">⌑</span>Обсуждаем заказ № '+currentOrder : '<span class="sa-context-icon">⌑</span>Твой короткий путь к ответу';
  }
  function setPhase(next){
    clearTimeout(phaseTimer);phase=next;panel.dataset.phase=next;
    const labels={idle:'Бот-помощник Салона',listening:'Слушаю. Что у тебя за вопрос?',thinking:'Разбираюсь с вопросом…',writing:'Пишу ответ…',done:'Ответ готов',sending:'Передаю вопрос мастеру…',sent:'Обращение сохранено',error:'Ответ не получен. Можно повторить'};
    panel.querySelector('#sa-status').textContent=labels[next]||labels.idle;
    if(next==='done'||next==='sent')phaseTimer=setTimeout(()=>{if(phase===next)setPhase('idle');},2400);
  }
  function setBusy(value,next){busy=value;panel.classList.toggle('sa-is-thinking',value);panel.querySelector('.sa-form button').disabled=value;feed.setAttribute('aria-busy',String(value));if(next)setPhase(next);else if(value)setPhase('thinking');else if(!['done','sent','error'].includes(phase))setPhase('idle');}
  async function reveal(paragraph,text,generation){
    if(matchMedia('(prefers-reduced-motion:reduce)').matches||!panel.open||document.hidden||feed.hidden){paragraph.textContent=text;return true;}
    const chars=Array.from(text),duration=Math.min(1250,Math.max(220,chars.length*2));paragraph.textContent='';
    const skip=document.createElement('button');skip.type='button';skip.className='sa-show-now';skip.textContent='Показать сразу';paragraph.after(skip);
    return new Promise(resolve=>{
      let frame=0,done=false,start=null;
      const finish=()=>{if(done)return;done=true;cancelAnimationFrame(frame);const valid=generation===epoch;if(valid)paragraph.textContent=text;skip.remove();if(finishReveal===finish)finishReveal=null;resolve(valid);};
      finishReveal=finish;skip.addEventListener('click',finish);
      function tick(now){if(generation!==epoch||!panel.open||document.hidden){finish();return;}if(start===null)start=now;const progress=Math.min(1,(now-start)/duration);paragraph.textContent=chars.slice(0,Math.floor(chars.length*progress)).join('');scroll();if(progress===1)finish();else frame=requestAnimationFrame(tick);}
      frame=requestAnimationFrame(tick);
    });
  }
  function entry(text,mine=false){
    const node=document.createElement('article');node.className=mine?'sa-message sa-question':'sa-message sa-answer';
    node.innerHTML=(mine?'':'<div class="sa-message-avatar">'+portrait()+'</div>')+'<div class="sa-bubble"><span class="sa-speaker">'+(mine?'Ты':'Листик')+'</span><p></p></div>';
    node.querySelector('p').textContent=text;feed.append(node);scroll();return node;
  }
  function failure(question,message){
    const node=entry(message),retry=document.createElement('button');retry.type='button';retry.className='sa-retry';retry.textContent='Повторить вопрос';
    retry.addEventListener('click',()=>{if(!busy){node.remove();ask(question,false);}});node.querySelector('.sa-bubble').append(retry);scroll();
  }
  async function renderAnswer(result,question,generation){
    const node=entry(''),bubble=node.querySelector('.sa-bubble');node.setAttribute('aria-busy','true');
    if(!await reveal(bubble.querySelector('p'),result.answer,generation))return false;node.setAttribute('aria-busy','false');
    if(result.card?.rows?.length){const card=document.createElement('section');card.className='sa-result-card';card.innerHTML='<h4>'+esc(result.card.title)+'</h4><dl>'+result.card.rows.slice(0,6).map(r=>'<div><dt>'+esc(r.label)+'</dt><dd>'+esc(r.value)+'</dd></div>').join('')+'</dl>';bubble.append(card);}
    const links=(result.links||[]).slice(0,2).map(l=>{const url=safeLink(l.url);return url?'<a href="'+esc(url)+'">'+esc(l.label)+'<span aria-hidden="true">↗</span></a>':'';}).join('');
    if(links)bubble.insertAdjacentHTML('beforeend','<div class="sa-links">'+links+'</div>');
    if(result.sources?.length){const sources=document.createElement('details');sources.className='sa-sources';sources.innerHTML='<summary>Откуда ответ</summary>'+result.sources.slice(0,3).map(l=>{const url=safeLink(l.url);return url?'<a href="'+esc(url)+'">'+esc(l.title)+'</a>':'';}).join('');bubble.append(sources);}
    for(const action of result.actions||[]){if(action.id!=='review_order')continue;const button=document.createElement('button');button.type='button';button.className='sa-order-action';button.dataset.saReview='';button.textContent='Проверить и оформить заказ ↗';bubble.append(button);}
    if(result.promo?.code==='ПЕРВЫЙЛИСТ'){const code=document.createElement('button');code.type='button';code.className='sa-promo-code';code.textContent='Скопировать ПЕРВЫЙЛИСТ';code.addEventListener('click',()=>{navigator.clipboard?.writeText('ПЕРВЫЙЛИСТ').then(()=>code.textContent='Код скопирован — проверь его в форме',()=>code.textContent='Промокод: ПЕРВЫЙЛИСТ');});bubble.append(code);}
    if(result.handoff){bubble.insertAdjacentHTML('beforeend','<button class="sa-transfer" type="button" data-sa-handoff>Подготовить вопрос мастеру ↗</button>');bindings.set(bubble.querySelector('[data-sa-handoff]'),{question,order:currentOrder,epoch});}
    if(result.suggestions?.length){const follow=document.createElement('div');follow.className='sa-followups';follow.innerHTML=chips(result.suggestions);feed.append(follow);}
    scroll();return true;
  }
  async function ask(question,addUser=true){
    question=String(question||'').trim();if(!question||question.length>2000||busy)return;
    if(!panel.open)open();
    hideHandoff();hideOrder();const generation=epoch,requestedOrder=currentOrder;
    feed.querySelector('.sa-welcome')?.remove();feed.querySelectorAll('.sa-followups').forEach(n=>n.remove());
    if(addUser){followScroll=true;entry(question,true);conversation.push(question);}
    setBusy(true);const pending=entry('');pending.classList.add('sa-pending');pending.querySelector('p').innerHTML='<span class="sa-thinking" aria-label="Листик ищет ответ"><i></i><i></i><i></i></span>';
    let timer;
    try{
      const body={question,context:{...context,intake_open:!!orderFrame}};if(requestedOrder)body.order_id=requestedOrder;
      const result=await Promise.race([A.post('/assistant/answer',body,authHeaders()),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),25000);})]);
      if(generation!==epoch||requestedOrder!==currentOrder)return;
      pending.remove();
      if(!result?.ok||typeof result.answer!=='string')throw new Error('answer_unavailable');
      const rc=result.context&&typeof result.context==='object'?result.context:{};
      context={topic:typeof rc.topic==='string'?rc.topic:'',product:typeof rc.product==='string'?rc.product:null,source_url:typeof rc.source_url==='string'?rc.source_url:null};
      if(rc.brief&&typeof rc.brief==='object'&&D){draft=D.clean(rc.brief);if(rc.brief.active===true){draft.active=true;context.brief=draft;}}
      renderBrief();
      setPhase('writing');
      if(!await renderAnswer(result,question,generation))return;
      if(generation!==epoch||requestedOrder!==currentOrder)return;
      setPhase('done');
      if(result.handoff_requested&&panel.open&&!document.hidden)showHandoff();
    }catch(_){if(generation===epoch){pending.remove();failure(question,'Не получилось получить ответ. Вопрос остался в чате — можно повторить или позвать мастера.');setPhase('error');}}
    finally{clearTimeout(timer);if(generation===epoch)setBusy(false);}
  }
  function updateSize(){const v=window.visualViewport;panel.style.setProperty('--sa-vh',(v?v.height:innerHeight)+'px');panel.style.setProperty('--sa-top',(v?v.offsetTop:0)+'px');}
  function open(){updateSize();if(!panel.open){if(matchMedia('(max-width:620px)').matches)panel.showModal();else panel.show();}launcher.setAttribute('aria-expanded','true');launcher.hidden=true;if(!matchMedia('(max-width:620px)').matches)input.focus({preventScroll:true});}
  function close(){if(finishReveal)finishReveal();panel.close();launcher.hidden=false;launcher.setAttribute('aria-expanded','false');launcher.focus({preventScroll:true});}
  function hideHandoff(){if(handoff.hidden)return;savedHandoff=readHandoff();handoff.hidden=true;feed.hidden=false;bottom.hidden=false;input.value=draftBeforeHandoff;}
  function readHandoff(){const form=handoff.querySelector('form');if(!form)return null;return {text:form.elements.message.value,name:form.elements.name?.value||'',contact:form.elements.contact?.value||'',consent:!!form.elements.consent?.checked,order:currentOrder};}
  function showHandoff(binding){
    if(binding&&(binding.epoch!==epoch||binding.order!==currentOrder))return;
    if(!panel.open)open();hideOrder();if(handoffLocked&&handoff.querySelector('form')){handoff.hidden=false;feed.hidden=true;bottom.hidden=true;return;}if(!handoff.hidden){handoff.querySelector('textarea').focus();return;}
    draftBeforeHandoff=input.value;const id=currentOrder;
    const history=binding?[binding.question]:conversation;
    let text=(history.length?'Вопрос к мастеру:\n'+history.map((q,i)=>history.length>1?(i+1)+'. '+q:q).join('\n\n'):'Хочу обсудить свою задачу.')+(id?'\n\nЗаказ № '+id:'');
    const saved=!binding&&savedHandoff?.order===id?savedHandoff:null;if(saved)text=saved.text;
    handoff.innerHTML='<button class="sa-back" type="button" data-sa-back>← К разговору</button><h3 id="sa-handoff-title">Подключим мастера.</h3><p class="sa-handoff-intro">'+(id?'Вопрос попадёт в обсуждение этого заказа.':'Проверь сообщение и оставь контакт для ответа.')+'</p><form><label>Твой вопрос<textarea name="message" rows="5" required></textarea></label><div class="sa-length" aria-live="polite"></div>'+(id?'':'<div class="sa-contact-grid"><label>Имя <span>необязательно</span><input name="name" maxlength="120" autocomplete="given-name" placeholder="Как к тебе обращаться"></label><label>Telegram или почта<input name="contact" maxlength="200" autocomplete="email" placeholder="@ник или почта" required></label></div><label class="sa-consent"><input name="consent" type="checkbox" required><span>Передать мой вопрос и контакт мастеру по <a href="/privacy.html">политике конфиденциальности</a></span></label>')+'<p class="sa-form-status" role="status"></p><button class="sa-send-handoff" type="submit">Отправить мастеру ↗</button><button type="button" class="sa-copy" data-sa-copy>Скопировать сообщение</button></form>';
    const form=handoff.querySelector('form');form.elements.message.value=text;
    if(saved&&!id){form.elements.name.value=saved.name;form.elements.contact.value=saved.contact;form.elements.consent.checked=saved.consent;}
    const limit=id?2800:2000;
    function length(){const n=form.elements.message.value.length;handoff.querySelector('.sa-length').textContent=n+' / '+limit+(n>limit?' · сократи сообщение перед отправкой':'');form.elements.message.setCustomValidity(n>limit?'Сократи сообщение до '+limit+' символов.':'');}
    length();form.elements.message.addEventListener('input',length);
    form.addEventListener('submit',async e=>{
      e.preventDefault();length();if(busy||!form.reportValidity())return;const status=form.querySelector('.sa-form-status');
      if(demo()){status.textContent='Это демонстрационный кабинет. Сообщение здесь не отправляется.';return;}
      const payload=readHandoff();if(!id&&S.valid?.contact&&!S.valid.contact(payload.contact.trim())){status.textContent='Укажи Telegram в формате @ник или корректную почту.';form.elements.contact.focus();return;}
      const generation=epoch;let uncertain=false;handoffLocked=true;setBusy(true,'sending');form.querySelector('[type=submit]').disabled=true;status.textContent='Отправляем…';
      try{
        const result=id?await A.post('/orders/'+id+'/message',{text:payload.text.trim()},authHeaders()):await A.post('/lead',{name:payload.name.trim(),contact:payload.contact.trim(),message:payload.text.trim(),page:location.pathname+'#assistant',privacy_notice_ack:true});
        if(generation!==epoch)return;
        if(result?.ok===false&&['contact_required','contact_invalid','message_required','message_too_long','rate_limit','privacy_notice_required'].includes(result.error)){handoffLocked=false;status.textContent='Вопрос не принят: проверь поля или повтори чуть позже. Текст сохранён.';return;}
        if(!result?.ok||(!id&&(!Number.isSafeInteger(result.id)||result.id<1)))throw new Error('not_confirmed');
        handoff.hidden=true;feed.hidden=false;bottom.hidden=false;savedHandoff=null;handoffLocked=false;handoff.replaceChildren();
        const node=entry(id?'Вопрос сохранён в обсуждении заказа. Ответ мастера появится там.':'Обращение № '+result.id+' сохранено. Ответ придёт на указанный контакт.');
        node.querySelector('.sa-bubble').insertAdjacentHTML('beforeend','<div class="sa-confirmed">✓ Сохранено</div>');setPhase('sent');scroll();
      }catch(_){uncertain=true;if(generation===epoch){status.textContent='Не удалось подтвердить отправку. Текст сохранён здесь. Проверь '+(id?'обсуждение заказа':'обращение через приёмную')+' перед повтором.';}}
      finally{if(generation===epoch){setBusy(false);const submit=form.querySelector('[type=submit]');if(submit)submit.disabled=uncertain;}}
    });
    feed.hidden=true;bottom.hidden=true;handoff.hidden=false;jump.hidden=true;handoff.querySelector('[data-sa-back]').focus({preventScroll:true});
  }
  const orderStage=panel.querySelector('#sa-order-stage'),brief=panel.querySelector('#sa-brief');
  function renderBrief(){
    brief.hidden=!draft.active;
    if(brief.hidden){brief.replaceChildren();return;}
    const fields=[['product','Формат',draft.product],['topic','Тема',draft.topic],['deadline','Срок',draft.deadline]];
    const ready=fields.filter(x=>x[2]).length;
    const labels={course:'Курсовая',course_emp:'Курсовая с исследованием',diplom:'ВКР',master:'Магистерская',practice:'Практика',rinc:'Статья',essay:'Эссе',referat:'Реферат',chapter:'Глава',custom:'Другая задача'};
    brief.innerHTML='<details><summary><span class="sa-brief-grow" aria-hidden="true">'+[0,1,2].map(i=>'<i'+(i<ready?' class="is-filled"':'')+'></i>').join('')+'</span><span>Твоё задание <small>'+ready+' из 3 ориентиров</small></span><span aria-hidden="true">⌄</span></summary><dl>'+fields.map(([key,label,value])=>'<div><dt>'+label+'</dt><dd>'+esc(key==='product'?(labels[value]||value||'Выберем вместе'):(value||'Можно уточнить'))+'</dd></div>').join('')+'</dl><p>Это черновик. Состав, срок и цена подтверждаются до оплаты.</p><button type="button" data-sa-review>Проверить и оформить ↗</button></details>';
  }
  function hideOrder(){if(!orderStage||orderStage.hidden)return;orderStage.hidden=true;feed.hidden=false;bottom.hidden=false;panel.classList.remove('sa-reviewing');}
  function reviewOrder(){
    if(!D){entry('Форма пока не загрузилась. Можно открыть оформление по ссылке.').querySelector('.sa-bubble').insertAdjacentHTML('beforeend','<div class="sa-links"><a href="/configurator.html">Оформить заказ ↗</a></div>');return;}
    hideHandoff();
    // A configurator already on this page remains the single owner of its request ID.
    if(document.getElementById('direct-order')){
      const applied=window.SalonAssistantIntake?.applyBrief(draft);
      if(!applied){const n=entry('В форме уже есть задание. Сохраним его: можно вручную перенести нужные детали из карточки Листика.');n.querySelector('.sa-bubble').insertAdjacentHTML('beforeend','<button type="button" data-sa-existing-form class="sa-order-action">Вернуться к заполненной форме ↗</button>');return;}
      close();document.getElementById('direct-order').scrollIntoView({block:'start'});return;
    }
    if(!orderFrame){
      orderStage.innerHTML='<div class="sa-order-toolbar"><button type="button" data-sa-order-back>← К разговору</button><span>Контакт и отправка — в форме</span></div><p class="sa-order-state" role="status">Открываю форму…</p>';
      orderFrame=document.createElement('iframe');orderFrame.title='Проверь задание и отправь заказ';orderFrame.src='/configurator.html?assistant=1';orderFrame.className='sa-order-frame';
      frameCleanup=D.attach(orderFrame,draft,state=>{
        orderState=state;if(state.brief&&!state.id){draft={...state.brief,active:true};context.brief=draft;renderBrief();if(!orderStage.hidden)brief.hidden=true;}const status=orderStage.querySelector('.sa-order-state');
        const labels={ready:'Проверь задание и добавь материалы.',prefilled:'Черновик перенесён. Проверь поля перед отправкой.',editing:'Изменения остаются в форме.',sending:'Заявка отправляется. Дождись подтверждения.',uncertain:'Подтверждение пока не получено. Продолжай проверку в этой же форме.',rejected:'Проверь сообщение формы и исправь поля.',confirmed:'Заявка № '+state.id+' принята.',uploads:state.pending?'Заявка № '+state.id+' принята. Ещё файлов к передаче: '+state.pending+'.':'Заявка № '+state.id+' принята. Все выбранные файлы переданы.'};
        status.textContent=labels[state.state];
        if(state.id){createdOrderId=state.id;currentOrder=state.id;context={};draft={};brief.hidden=true;panel.querySelector('#sa-context').textContent='Обсуждаем заказ № '+state.id;panel.dataset.phase='sent';panel.querySelector('#sa-status').textContent='Заказ № '+state.id;}
      });
      orderStage.append(orderFrame);
    }
    try{orderFrame.contentDocument.documentElement.dataset.theme=document.documentElement.dataset.theme||'light';}catch(_){}
    orderStage.hidden=false;feed.hidden=true;bottom.hidden=true;brief.hidden=true;jump.hidden=true;panel.classList.add('sa-reviewing');orderStage.querySelector('button').focus({preventScroll:true});
  }
  launcher.addEventListener('click',open);
  panel.querySelector('[data-sa-close]').addEventListener('click',close);
  panel.addEventListener('cancel',e=>{e.preventDefault();close();});
  panel.addEventListener('close',()=>{launcher.hidden=false;launcher.setAttribute('aria-expanded','false');});
  panel.querySelector('.sa-form').addEventListener('submit',e=>{e.preventDefault();if(!busy&&input.value.trim()){const q=input.value;input.value='';input.style.height='';ask(q);}});
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();panel.querySelector('.sa-form').requestSubmit();}});
  input.addEventListener('input',()=>{if(!busy)setPhase(input.value.trim()?'listening':'idle');input.style.height='auto';input.style.height=Math.min(input.scrollHeight,112)+'px';});
  panel.addEventListener('click',e=>{
    if(e.target.closest('[data-sa-existing-form]')){close();document.getElementById('direct-order')?.scrollIntoView({block:'start'});return;}
    if(e.target.closest('[data-sa-review]')){if(!busy)reviewOrder();return;}
    if(e.target.closest('[data-sa-order-back]')){hideOrder();renderBrief();input.focus({preventScroll:true});return;}
    if(e.target.closest('[data-sa-reset-cancel]')){panel.querySelector('.sa-reset-check').hidden=true;return;}
    if(e.target.closest('[data-sa-reset]')){const check=panel.querySelector('.sa-reset-check');check.hidden=!check.hidden;if(!check.hidden)check.querySelector('button').focus();return;}
    if(e.target.closest('[data-sa-reset-confirm]')){
      if(busy||pendingFrame()||handoffLocked){panel.querySelector('.sa-reset-check p').textContent=handoffLocked?'Отправка вопроса ещё не подтверждена. Сохраняю её состояние; проверь обращение через приёмную перед новым.':orderFrame?'Форма заказа сохранена. Вернись к ней, чтобы завершить отправку или проверить её состояние.':'Дождись завершения текущего действия.';return;}
      panel.querySelector('.sa-reset-check').hidden=true;reset();input.focus();return;
    }

    const q=e.target.closest('[data-sa-question]');if(q){panel.querySelector('#sa-topics').hidden=true;panel.querySelector('[data-sa-topics]').setAttribute('aria-expanded','false');ask(q.dataset.saQuestion);return;}
    const topics=e.target.closest('[data-sa-topics]');if(topics){const tray=panel.querySelector('#sa-topics');tray.hidden=!tray.hidden;topics.setAttribute('aria-expanded',String(!tray.hidden));if(!tray.hidden)tray.querySelector('button').focus();return;}
    const transfer=e.target.closest('[data-sa-handoff]');if(transfer){showHandoff(bindings.get(transfer));return;}
    if(e.target.closest('[data-sa-human]')){showHandoff();return;}
    if(e.target.closest('[data-sa-back]')){if(!busy)hideHandoff();return;}
    if(e.target.closest('[data-sa-copy]')){const box=handoff.querySelector('textarea'),button=e.target.closest('button');navigator.clipboard?.writeText(box.value).then(()=>button.textContent='Скопировано',()=>{box.focus();box.select();});}
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&panel.open){e.preventDefault();close();}});
  function reset(){epoch++;handoffLocked=false;draft={};brief.hidden=true;brief.replaceChildren();if(orderFrame){frameCleanup?.();orderFrame.remove();orderFrame=null;orderState=null;orderStage.replaceChildren();orderStage.hidden=true;panel.classList.remove('sa-reviewing');}if(finishReveal)finishReveal();setBusy(false,'idle');context={};conversation=[];savedHandoff=null;draftBeforeHandoff='';followScroll=true;jump.hidden=true;input.value='';currentOrder=orderId();createdOrderId=null;handoff.replaceChildren();handoff.hidden=true;feed.hidden=false;bottom.hidden=false;welcome();}
  document.addEventListener('salon:auth-lost',()=>{reset();if(panel.open)close();});
  document.addEventListener('salon:identity-changing',()=>{reset();if(panel.open)close();});
  window.addEventListener('hashchange',()=>{
    if((orderId()||createdOrderId)===currentOrder)return;
    // A route change in the same identity cannot discard an unresolved mutation.
    if(pendingFrame()||handoffLocked){panel.querySelector('#sa-context').textContent=(currentOrder?'Продолжаем заказ № '+currentOrder:'Продолжаем начатое оформление')+' · состояние отправки сохранено';return;}
    reset();
  });
  window.visualViewport?.addEventListener('resize',updateSize);window.visualViewport?.addEventListener('scroll',updateSize);window.addEventListener('resize',updateSize);
  panel.querySelector('#sa-topics').innerHTML=chips(['Хочу заказать работу','Расскажи о Салоне','Что входит в работу?'])+chips(['Какие скидки есть?','Как пригласить друга?','Я уже оплатил, деньги списались'])+chips(['Как оформить список литературы?','Кто создатель?','Позови мастера']);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&finishReveal)finishReveal();});
  welcome();updateSize();setPhase('idle');
})();
