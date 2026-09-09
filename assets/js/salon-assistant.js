(function () {
  'use strict';
  const S = window.Salon;
  if (!S?.api || document.getElementById('salon-assistant') || /^admin/.test(location.pathname.split('/').pop())) return;
  const A = S.api;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const mascot = '/assets/img/salon-assistant/list.webp';
  const portrait = (cls = '') => '<img class="sa-mascot '+cls+'" src="'+mascot+'" alt="" width="100" height="150">';
  const icons = {send:'↑', close:'×', back:'←', more:'↗'};
  const launcher = document.createElement('button');
  launcher.type = 'button'; launcher.className = 'sa-launch';
  launcher.setAttribute('aria-label', 'Открыть Листа, бота-помощника Салона');
  launcher.setAttribute('aria-controls','salon-assistant'); launcher.setAttribute('aria-expanded','false');
  launcher.innerHTML = portrait()+'<span><b>Есть вопрос?</b><small>Давай разберёмся</small></span><i aria-hidden="true">↗</i>';
  const panel = document.createElement('dialog');
  panel.id = 'salon-assistant'; panel.className = 'sa-panel'; panel.setAttribute('aria-labelledby','sa-title');
  panel.innerHTML = '<header class="sa-head"><div class="sa-avatar">'+portrait()+'</div><div class="sa-identity"><h2 id="sa-title">Лист</h2><p><span class="sa-status-dot" aria-hidden="true"></span><span id="sa-status">Бот-помощник Салона</span></p></div><button class="sa-icon" type="button" data-sa-close aria-label="Свернуть чат">'+icons.close+'</button></header>'+
    '<div class="sa-context" id="sa-context"></div><div class="sa-feed" id="sa-feed" role="log" aria-live="polite" aria-relevant="additions text"></div>'+
    '<section class="sa-handoff" id="sa-handoff" hidden aria-labelledby="sa-handoff-title"></section>'+
    '<footer class="sa-bottom"><form class="sa-form"><label class="sa-sr" for="sa-question">Сообщение Листу</label><div class="sa-composer"><textarea id="sa-question" name="question" rows="1" maxlength="2000" placeholder="Что хочешь узнать?" autocomplete="off" required></textarea><button type="submit" aria-label="Отправить вопрос">↑</button></div></form><div class="sa-bottom-line"><span>Отвечает бот · важное уточним у мастера</span><button type="button" data-sa-human>Позвать мастера</button></div></footer>';
  document.body.append(launcher,panel);
  const feed = panel.querySelector('#sa-feed'), input = panel.querySelector('#sa-question'), handoff = panel.querySelector('#sa-handoff'), bottom = panel.querySelector('.sa-bottom');
  const bindings = new WeakMap();
  let busy = false, epoch = 0, context = {}, conversation = [], currentOrder = orderId(), draftBeforeHandoff = '', savedHandoff = null;
  function orderId(){ const m = location.hash.match(/^#order-(\d+)(?:-|$)/); return m ? Number(m[1]) : null; }
  function authHeaders(){const tokens = A.guestTokens();return tokens.length ? {'X-Order-Tokens':tokens.join(',')} : {};}
  function demo(){return !!(A.demoPreview || document.body.classList.contains('is-cabinet-demo'));}
  function safeLink(value){try{const u=new URL(value,location.origin);if(u.origin===location.origin || u.protocol==='https:' && ['akademsalon.ru','studkladovaya.ru','t.me'].includes(u.hostname))return u.href;}catch(_){}return '';}
  function scroll(){feed.scrollTop = feed.scrollHeight;}
  function starters(){
    if(currentOrder)return ['Что дальше по моему заказу?','Где мои файлы?','Вопрос по оплате'];
    if(/benefits|plus|deposit|referral/.test(location.pathname+location.hash))return ['Как получить подарки?','Как работают бонусы?','Чем отличается депозит?'];
    return ['Хочу заказать работу','Можно за 24 часа?','Как получить подарки?'];
  }
  function chips(questions){return '<div class="sa-suggestions">'+questions.slice(0,3).map(q=>'<button type="button" data-sa-question="'+esc(q)+'">'+esc(q)+'<span aria-hidden="true">↗</span></button>').join('')+'</div>';}
  function welcome(){
    const title = currentOrder ? 'Давай посмотрим<br>твой заказ.' : 'С чего начнём?';
    feed.innerHTML='<section class="sa-welcome"><div class="sa-welcome-art">'+portrait()+'<span class="sa-paper-note">На твоей<br>стороне.</span></div><h3>'+title+'</h3><p>'+(currentOrder ? 'Подскажу по статусу, файлам и оплате. Если нужен человек, подготовлю вопрос мастеру.' : 'Я Лист. Помогу с работой, сроками и выгодами. Можно спросить своими словами.')+'</p>'+chips(starters())+'</section>';
    panel.querySelector('#sa-context').innerHTML = currentOrder ? '<span class="sa-context-icon">⌑</span>Обсуждаем заказ № '+currentOrder : '<span class="sa-context-icon">⌑</span>Твой короткий путь к ответу';
  }
  function setBusy(value){busy=value;panel.classList.toggle('sa-is-thinking',value);panel.querySelector('#sa-status').textContent=value?'Разбираюсь с вопросом…':'Бот-помощник Салона';panel.querySelector('.sa-form button').disabled=value;feed.setAttribute('aria-busy',String(value));}
  function entry(text,mine=false){
    const node=document.createElement('article');node.className=mine?'sa-message sa-question':'sa-message sa-answer';
    node.innerHTML=(mine?'':'<div class="sa-message-avatar">'+portrait()+'</div>')+'<div class="sa-bubble"><span class="sa-speaker">'+(mine?'Ты':'Лист')+'</span><p></p></div>';
    node.querySelector('p').textContent=text;feed.append(node);scroll();return node;
  }
  function failure(question,message){
    const node=entry(message),retry=document.createElement('button');retry.type='button';retry.className='sa-retry';retry.textContent='Повторить вопрос';
    retry.addEventListener('click',()=>{if(!busy){node.remove();ask(question,false);}});node.querySelector('.sa-bubble').append(retry);scroll();
  }
  function renderAnswer(result,question){
    const node=entry(result.answer),bubble=node.querySelector('.sa-bubble');
    if(result.card?.rows?.length){const card=document.createElement('section');card.className='sa-result-card';card.innerHTML='<h4>'+esc(result.card.title)+'</h4><dl>'+result.card.rows.slice(0,6).map(r=>'<div><dt>'+esc(r.label)+'</dt><dd>'+esc(r.value)+'</dd></div>').join('')+'</dl>';bubble.append(card);}
    const links=(result.links||[]).slice(0,2).map(l=>{const url=safeLink(l.url);return url?'<a href="'+esc(url)+'">'+esc(l.label)+'<span aria-hidden="true">↗</span></a>':'';}).join('');
    if(links)bubble.insertAdjacentHTML('beforeend','<div class="sa-links">'+links+'</div>');
    if(result.handoff){bubble.insertAdjacentHTML('beforeend','<button class="sa-transfer" type="button" data-sa-handoff>Подготовить вопрос мастеру ↗</button>');bindings.set(bubble.querySelector('[data-sa-handoff]'),{question,order:currentOrder,epoch});}
    if(result.suggestions?.length){const follow=document.createElement('div');follow.className='sa-followups';follow.innerHTML=chips(result.suggestions);feed.append(follow);}
    scroll();
  }
  async function ask(question,addUser=true){
    question=String(question||'').trim();if(!question||question.length>2000||busy)return;
    if(!panel.open)open();
    hideHandoff();const generation=epoch,requestedOrder=currentOrder;
    feed.querySelector('.sa-welcome')?.remove();feed.querySelectorAll('.sa-followups').forEach(n=>n.remove());
    if(addUser){entry(question,true);conversation.push(question);}
    setBusy(true);const pending=entry('');pending.classList.add('sa-pending');pending.querySelector('p').innerHTML='<span class="sa-thinking" aria-label="Лист ищет ответ"><i></i><i></i><i></i></span>';
    let timer;
    try{
      const body={question,context};if(requestedOrder)body.order_id=requestedOrder;
      const result=await Promise.race([A.post('/assistant/answer',body,authHeaders()),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),25000);})]);
      if(generation!==epoch||requestedOrder!==currentOrder)return;
      pending.remove();
      if(!result?.ok||typeof result.answer!=='string')throw new Error('answer_unavailable');
      context=result.context&&typeof result.context==='object'?{topic:result.context.topic}:{};
      renderAnswer(result,question);
      if(result.handoff_requested)showHandoff();
    }catch(_){if(generation===epoch){pending.remove();failure(question,'Не получилось получить ответ. Вопрос остался в чате — можно повторить или позвать мастера.');}}
    finally{clearTimeout(timer);if(generation===epoch)setBusy(false);}
  }
  function updateSize(){const v=window.visualViewport;panel.style.setProperty('--sa-vh',(v?v.height:innerHeight)+'px');panel.style.setProperty('--sa-top',(v?v.offsetTop:0)+'px');}
  function open(){updateSize();if(!panel.open){if(matchMedia('(max-width:620px)').matches)panel.showModal();else panel.show();}launcher.setAttribute('aria-expanded','true');launcher.hidden=true;if(!matchMedia('(max-width:620px)').matches)input.focus({preventScroll:true});}
  function close(){panel.close();launcher.hidden=false;launcher.setAttribute('aria-expanded','false');launcher.focus({preventScroll:true});}
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
      const generation=epoch;setBusy(true);form.querySelector('[type=submit]').disabled=true;status.textContent='Отправляем…';
      try{
        const result=id?await A.post('/orders/'+id+'/message',{text:payload.text.trim()},authHeaders()):await A.post('/lead',{name:payload.name.trim(),contact:payload.contact.trim(),message:payload.text.trim(),page:location.pathname+'#assistant',privacy_notice_ack:true});
        if(generation!==epoch)return;
        if(!result?.ok||(!id&&!result.id))throw new Error('not_confirmed');
        handoff.hidden=true;feed.hidden=false;bottom.hidden=false;savedHandoff=null;handoff.replaceChildren();
        const node=entry(id?'Вопрос сохранён в обсуждении заказа. Ответ мастера появится там.':'Обращение № '+result.id+' сохранено. Ответ придёт на указанный контакт.');
        node.querySelector('.sa-bubble').insertAdjacentHTML('beforeend','<div class="sa-confirmed">✓ Сохранено</div>');scroll();
      }catch(_){if(generation===epoch){status.textContent='Не удалось подтвердить отправку. Текст сохранён здесь. Проверь '+(id?'обсуждение заказа':'обращение через приёмную')+' перед повтором.';}}
      finally{if(generation===epoch){setBusy(false);const submit=form.querySelector('[type=submit]');if(submit)submit.disabled=false;}}
    });
    feed.hidden=true;bottom.hidden=true;handoff.hidden=false;handoff.querySelector('[data-sa-back]').focus({preventScroll:true});
  }
  launcher.addEventListener('click',open);
  panel.querySelector('[data-sa-close]').addEventListener('click',close);
  panel.addEventListener('cancel',e=>{e.preventDefault();close();});
  panel.addEventListener('close',()=>{launcher.hidden=false;launcher.setAttribute('aria-expanded','false');});
  panel.querySelector('.sa-form').addEventListener('submit',e=>{e.preventDefault();if(!busy&&input.value.trim()){const q=input.value;input.value='';input.style.height='';ask(q);}});
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();panel.querySelector('.sa-form').requestSubmit();}});
  input.addEventListener('input',()=>{input.style.height='auto';input.style.height=Math.min(input.scrollHeight,112)+'px';});
  panel.addEventListener('click',e=>{
    const q=e.target.closest('[data-sa-question]');if(q){ask(q.dataset.saQuestion);return;}
    const transfer=e.target.closest('[data-sa-handoff]');if(transfer){showHandoff(bindings.get(transfer));return;}
    if(e.target.closest('[data-sa-human]')){showHandoff();return;}
    if(e.target.closest('[data-sa-back]')){if(!busy)hideHandoff();return;}
    if(e.target.closest('[data-sa-copy]')){const box=handoff.querySelector('textarea'),button=e.target.closest('button');navigator.clipboard?.writeText(box.value).then(()=>button.textContent='Скопировано',()=>{box.focus();box.select();});}
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&panel.open){e.preventDefault();close();}});
  function reset(){epoch++;setBusy(false);context={};conversation=[];savedHandoff=null;draftBeforeHandoff='';input.value='';currentOrder=orderId();handoff.replaceChildren();handoff.hidden=true;feed.hidden=false;bottom.hidden=false;welcome();}
  document.addEventListener('salon:auth-lost',()=>{reset();if(panel.open)close();});
  document.addEventListener('salon:identity-changing',()=>{reset();if(panel.open)close();});
  window.addEventListener('hashchange',()=>{if(orderId()!==currentOrder)reset();});
  window.visualViewport?.addEventListener('resize',updateSize);window.visualViewport?.addEventListener('scroll',updateSize);window.addEventListener('resize',updateSize);
  welcome();updateSize();
})();
