(function () {
  'use strict';
  const S = window.Salon;
  if (!S?.api || document.getElementById('salon-assistant') || /^admin/.test(location.pathname.split('/').pop())) return;
  const A = S.api;
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
  panel.innerHTML = '<header class="sa-head"><div class="sa-avatar">'+portrait()+'</div><div class="sa-identity"><h2 id="sa-title">Листик</h2><p><span class="sa-status-dot" aria-hidden="true"></span><span id="sa-status">Бот-помощник Салона</span></p></div><button class="sa-icon" type="button" data-sa-close aria-label="Свернуть чат">'+icons.close+'</button></header>'+
    '<div class="sa-context"><span id="sa-context"></span><button type="button" data-sa-topics aria-expanded="false" aria-controls="sa-topics">Темы ↗</button></div><nav id="sa-topics" class="sa-topics" aria-label="Темы для Листика" hidden></nav><div class="sa-feed" id="sa-feed" role="log" aria-live="polite" aria-relevant="additions text"></div>'+
    '<section class="sa-handoff" id="sa-handoff" hidden aria-labelledby="sa-handoff-title"></section>'+
    '<footer class="sa-bottom"><form class="sa-form"><label class="sa-sr" for="sa-question">Сообщение Листику</label><div class="sa-composer"><textarea id="sa-question" name="question" rows="1" maxlength="2000" placeholder="Что хочешь узнать?" autocomplete="off" required></textarea><button type="submit" aria-label="Отправить вопрос">↑</button></div></form><div class="sa-bottom-line"><span>Отвечает бот · важное уточним у мастера</span><button type="button" data-sa-human>Позвать мастера</button></div></footer>';
  document.body.append(launcher,panel);
  const feed = panel.querySelector('#sa-feed'), input = panel.querySelector('#sa-question'), handoff = panel.querySelector('#sa-handoff'), bottom = panel.querySelector('.sa-bottom');
  const bindings = new WeakMap();
  let busy = false, epoch = 0, context = {}, conversation = [], currentOrder = orderId(), draftBeforeHandoff = '', savedHandoff = null, phase = 'idle', phaseTimer = null, finishReveal = null, followScroll = true;
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
    return ['Хочу заказать работу','Можно за 24 часа?','Как получить подарки?'];
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
    const node=entry(''),bubble=node.querySelector('.sa-bubble');
    if(!await reveal(bubble.querySelector('p'),result.answer,generation))return false;
    if(result.card?.rows?.length){const card=document.createElement('section');card.className='sa-result-card';card.innerHTML='<h4>'+esc(result.card.title)+'</h4><dl>'+result.card.rows.slice(0,6).map(r=>'<div><dt>'+esc(r.label)+'</dt><dd>'+esc(r.value)+'</dd></div>').join('')+'</dl>';bubble.append(card);}
    const links=(result.links||[]).slice(0,2).map(l=>{const url=safeLink(l.url);return url?'<a href="'+esc(url)+'">'+esc(l.label)+'<span aria-hidden="true">↗</span></a>':'';}).join('');
    if(links)bubble.insertAdjacentHTML('beforeend','<div class="sa-links">'+links+'</div>');
    if(result.handoff){bubble.insertAdjacentHTML('beforeend','<button class="sa-transfer" type="button" data-sa-handoff>Подготовить вопрос мастеру ↗</button>');bindings.set(bubble.querySelector('[data-sa-handoff]'),{question,order:currentOrder,epoch});}
    if(result.suggestions?.length){const follow=document.createElement('div');follow.className='sa-followups';follow.innerHTML=chips(result.suggestions);feed.append(follow);}
    scroll();return true;
  }
  async function ask(question,addUser=true){
    question=String(question||'').trim();if(!question||question.length>2000||busy)return;
    if(!panel.open)open();
    hideHandoff();const generation=epoch,requestedOrder=currentOrder;
    feed.querySelector('.sa-welcome')?.remove();feed.querySelectorAll('.sa-followups').forEach(n=>n.remove());
    if(addUser){followScroll=true;entry(question,true);conversation.push(question);}
    setBusy(true);const pending=entry('');pending.classList.add('sa-pending');pending.querySelector('p').innerHTML='<span class="sa-thinking" aria-label="Листик ищет ответ"><i></i><i></i><i></i></span>';
    let timer;
    try{
      const body={question,context};if(requestedOrder)body.order_id=requestedOrder;
      const result=await Promise.race([A.post('/assistant/answer',body,authHeaders()),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),25000);})]);
      if(generation!==epoch||requestedOrder!==currentOrder)return;
      pending.remove();
      if(!result?.ok||typeof result.answer!=='string')throw new Error('answer_unavailable');
      context=result.context&&typeof result.context==='object'?{topic:result.context.topic,product:result.context.product}:{};
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
    if(!panel.open)open();if(!handoff.hidden){handoff.querySelector('textarea').focus();return;}
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
      const generation=epoch;setBusy(true,'sending');form.querySelector('[type=submit]').disabled=true;status.textContent='Отправляем…';
      try{
        const result=id?await A.post('/orders/'+id+'/message',{text:payload.text.trim()},authHeaders()):await A.post('/lead',{name:payload.name.trim(),contact:payload.contact.trim(),message:payload.text.trim(),page:location.pathname+'#assistant',privacy_notice_ack:true});
        if(generation!==epoch)return;
        if(!result?.ok||(!id&&!result.id))throw new Error('not_confirmed');
        handoff.hidden=true;feed.hidden=false;bottom.hidden=false;savedHandoff=null;handoff.replaceChildren();
        const node=entry(id?'Вопрос сохранён в обсуждении заказа. Ответ мастера появится там.':'Обращение № '+result.id+' сохранено. Ответ придёт на указанный контакт.');
        node.querySelector('.sa-bubble').insertAdjacentHTML('beforeend','<div class="sa-confirmed">✓ Сохранено</div>');setPhase('sent');scroll();
      }catch(_){if(generation===epoch){status.textContent='Не удалось подтвердить отправку. Текст сохранён здесь. Проверь '+(id?'обсуждение заказа':'обращение через приёмную')+' перед повтором.';}}
      finally{if(generation===epoch){setBusy(false);const submit=form.querySelector('[type=submit]');if(submit)submit.disabled=false;}}
    });
    feed.hidden=true;bottom.hidden=true;handoff.hidden=false;jump.hidden=true;handoff.querySelector('[data-sa-back]').focus({preventScroll:true});
  }
  launcher.addEventListener('click',open);
  panel.querySelector('[data-sa-close]').addEventListener('click',close);
  panel.addEventListener('cancel',e=>{e.preventDefault();close();});
  panel.addEventListener('close',()=>{launcher.hidden=false;launcher.setAttribute('aria-expanded','false');});
  panel.querySelector('.sa-form').addEventListener('submit',e=>{e.preventDefault();if(!busy&&input.value.trim()){const q=input.value;input.value='';input.style.height='';ask(q);}});
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();panel.querySelector('.sa-form').requestSubmit();}});
  input.addEventListener('input',()=>{if(!busy)setPhase(input.value.trim()?'listening':'idle');input.style.height='auto';input.style.height=Math.min(input.scrollHeight,112)+'px';});
  panel.addEventListener('click',e=>{
    const q=e.target.closest('[data-sa-question]');if(q){panel.querySelector('#sa-topics').hidden=true;panel.querySelector('[data-sa-topics]').setAttribute('aria-expanded','false');ask(q.dataset.saQuestion);return;}
    const topics=e.target.closest('[data-sa-topics]');if(topics){const tray=panel.querySelector('#sa-topics');tray.hidden=!tray.hidden;topics.setAttribute('aria-expanded',String(!tray.hidden));if(!tray.hidden)tray.querySelector('button').focus();return;}
    const transfer=e.target.closest('[data-sa-handoff]');if(transfer){showHandoff(bindings.get(transfer));return;}
    if(e.target.closest('[data-sa-human]')){showHandoff();return;}
    if(e.target.closest('[data-sa-back]')){if(!busy)hideHandoff();return;}
    if(e.target.closest('[data-sa-copy]')){const box=handoff.querySelector('textarea'),button=e.target.closest('button');navigator.clipboard?.writeText(box.value).then(()=>button.textContent='Скопировано',()=>{box.focus();box.select();});}
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&panel.open){e.preventDefault();close();}});
  function reset(){epoch++;if(finishReveal)finishReveal();setBusy(false,'idle');context={};conversation=[];savedHandoff=null;draftBeforeHandoff='';followScroll=true;jump.hidden=true;input.value='';currentOrder=orderId();handoff.replaceChildren();handoff.hidden=true;feed.hidden=false;bottom.hidden=false;welcome();}
  document.addEventListener('salon:auth-lost',()=>{reset();if(panel.open)close();});
  document.addEventListener('salon:identity-changing',()=>{reset();if(panel.open)close();});
  window.addEventListener('hashchange',()=>{if(orderId()!==currentOrder)reset();});
  window.visualViewport?.addEventListener('resize',updateSize);window.visualViewport?.addEventListener('scroll',updateSize);window.addEventListener('resize',updateSize);
  panel.querySelector('#sa-topics').innerHTML=chips(['Хочу заказать работу','Можно за 24 часа?','Что входит в работу?'])+chips(['Как получить подарки?','Я уже оплатил, деньги списались','Позови мастера']);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&finishReveal)finishReveal();});
  welcome();updateSize();setPhase('idle');
})();
