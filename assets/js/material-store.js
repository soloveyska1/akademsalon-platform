(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => Number(value).toLocaleString('ru-RU') + ' ₽';
  const errors = {
    login_required:'Войди в аккаунт, чтобы сохранить покупку.', quote_changed:'Сумма изменилась. Проверь расчёт и попробуй ещё раз.',
    sold_out:'Свободных лицензий этой версии сейчас нет.', already_owned:'Этот материал уже есть в твоих покупках.',
    already_reserved:'Этот материал уже забронирован. Продолжи оплату в «Моих покупках».', reservation_limit:'У тебя уже две активные брони. Продолжи одну из них.',
    invalid_coupon:'Такого промокода нет. Проверь написание.', coupon_ineligible:'Этот промокод не подходит: проверь срок акции.',
    provider_unavailable:'Касса сейчас не ответила. Бронь сохранена; повтори переход к оплате.', checkout_unavailable:'Оплата временно недоступна. Материалы можно изучить в предпросмотре.',
    terms_required:'Подтверди условия покупки.', terms_changed:'Условия обновились. Перезагрузи страницу перед покупкой.',
    file_unavailable:'Файл временно недоступен. Доступ к покупке сохранён.', rate_limit:'Слишком много попыток. Подожди немного.',
    resend_wait:'Код уже отправлен. Проверь письмо или подожди перед повтором.', wrong_code:'Код не совпал. Проверь шесть цифр в письме.',
    code_expired:'Код истёк. Запроси новый.', email_off:'Почта временно недоступна. Войди через Telegram.',
    send_failed:'Письмо не отправилось. Попробуй ещё раз или войди через Telegram.', csrf:'Сессия истекла. Начни вход через Telegram или обнови страницу.',
  };
  let products = [], authenticated = false, enabled = false, terms = '', selected = null, quote = null, requestKey = null;
  let telegramTimer = null, accountTimer = null, busy = false, quoteSequence = 0, catalogueSequence = 0, initialHashHandled = false;
  function notice(message) { $('toast').textContent = message; $('toast').hidden = false; window.setTimeout(() => {$('toast').hidden = true;}, 8000); }
  function csrf() { return document.cookie.split('; ').find(x => x.startsWith('__Host-salon_csrf='))?.split('=').slice(1).join('=') || ''; }
  async function api(path, body, headers = {}) {
    const options = {credentials:'same-origin', cache:'no-store', headers:{...headers}};
    if (body !== undefined) { options.method='POST'; options.body=JSON.stringify(body); options.headers['Content-Type']='application/json'; options.headers['X-CSRF-Token']=decodeURIComponent(csrf()); }
    const response = await fetch(path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false || data.error) { const e = new Error(errors[data.error] || 'Не удалось выполнить действие. Проверь соединение и повтори.'); e.code=data.error; throw e; }
    return data;
  }
  function safeSource(url) { try { const u=new URL(url); return u.protocol==='https:' ? u.href : '#'; } catch { return '#'; } }
  function renderCards() {
    $('products').innerHTML = products.map(p => `<article class="product-card" id="${esc(p.sku)}"><p class="category">${esc(p.programme)} · ${esc(p.semester)} семестр</p><h3>${esc(p.title)}</h3><p class="description">${esc(p.description)}</p><ul>${p.contents.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p class="meta">${esc(p.page_label)} · PDF + редактируемый DOCX<br>${esc(p.requirements_label)}</p><div class="foot"><div><span class="price">${money(p.price)}</span><span class="stock">Доступно ${p.available} из ${p.licences} лицензий · в брони ${p.reserved}</span></div><span class="quiet">Личная<br>неэксклюзивная лицензия</span></div><div class="card-actions"><button class="preview-button" data-preview="${esc(p.sku)}">Посмотреть страницы</button><button class="button" data-buy="${esc(p.sku)}" ${!enabled || !p.available?'disabled':''}>${!p.available?'Нет свободных лицензий':'Выбрать за '+money(p.price)}</button></div><p class="source"><a href="${esc(safeSource(p.source_url))}" target="_blank" rel="noopener">РПД и основание комплекта ↗</a></p></article>`).join('');
    $('catalogue-status').hidden = enabled && products.length > 0;
    if (!enabled) $('catalogue-status').textContent='Готовим запуск оплаты. Сейчас доступны состав и предпросмотр материалов.';
    else if (!products.length) $('catalogue-status').textContent='Новые материалы проходят проверку. Загляни позже.';
  }
  async function loadCatalog() {
    const sequence=++catalogueSequence;
    try { const d=await api('/api/store/catalogue'); if(sequence!==catalogueSequence)return; products=d.products || []; enabled=d.checkout_enabled === true; terms=d.terms; renderCards();
      if(!initialHashHandled){initialHashHandled=true;const sku=location.hash.slice(1);if(products.some(p=>p.sku===sku))requestAnimationFrame(()=>$(sku)?.scrollIntoView());} }
    catch { if(sequence===catalogueSequence)$('catalogue-status').textContent='Не удалось проверить наличие. Обнови страницу, когда появится соединение.'; }
  }
  function preview(sku) {
    const p=products.find(x=>x.sku===sku); if (!p) return;
    $('preview-content').innerHTML=`<p class="eyebrow">Фрагмент оригинального файла</p><h2>${esc(p.title)}</h2><p>${esc(p.preview_note || 'Несколько страниц из комплекта. Полные файлы доступны после оплаты.')}</p><div class="preview-pages">${(p.previews || []).filter(x=>/^\/assets\/store\/[a-z0-9/_-]+\.(png|webp|jpg)$/.test(x.path)).map(x=>`<figure><img src="${esc(x.path)}" alt="${esc(x.label)}" loading="lazy"><figcaption>${esc(x.label)}</figcaption></figure>`).join('')}</div><p class="quiet">Предпросмотр содержит только перечисленные страницы. PDF и Word целиком не загружаются.</p>`;
    $('preview-dialog').showModal();
  }
  async function refreshQuote() {
    const sequence=++quoteSequence;
    quote=null; $('pay-button').disabled=true;
    try {
      const calculated=await api('/api/store/quote', {sku:selected.sku,use_bonus:$('use-bonus').checked,coupon:$('coupon').value.trim()});
      if(sequence!==quoteSequence)return;
      quote=calculated;
      $('quote-lines').innerHTML=`<p><span>Цена комплекта</span><span>${money(quote.price)}</span></p><p><span>Скидка по промокоду</span><span>−${money(quote.discount)}</span></p><p><span>Бонусами</span><span>−${money(quote.bonus)}</span></p><p class="total"><span>К оплате</span><strong>${money(quote.cash)}</strong></p>`;
      $('pay-button').textContent=`Перейти к оплате ${money(quote.cash)}`; $('checkout-status').textContent='';
      $('pay-button').disabled=false; requestKey=null;
    } catch(e) { if(sequence===quoteSequence)$('checkout-status').textContent=e.message; }
  }
  async function choose(sku) {
    selected=products.find(x=>x.sku===sku); if (!selected) return;
    if (!authenticated) { notice('Войди, чтобы покупка сохранилась в твоей библиотеке.'); $('purchases').scrollIntoView(); $('telegram-login').focus(); return; }
    $('checkout-title').textContent=selected.title;
    $('checkout-description').textContent=selected.page_label+' · PDF и DOCX. '+selected.requirements_label;
    $('accept-terms').checked=false; $('use-bonus').checked=false; $('coupon').value='';
    $('checkout-status').textContent=''; $('checkout-dialog').showModal(); await refreshQuote();
  }
  function renderAccount(d) {
    $('bonus-balance').textContent=d.balance.toLocaleString('ru-RU');
    const names={'first-material':'Первый материал','three-materials':'Три материала'};
    $('achievements').innerHTML=Object.entries(names).map(([code,label])=>{const a=d.achievements.find(x=>x.code===code);return `<span class="achievement" data-earned="${Boolean(a)}">${a?'✓':'○'} ${label}${a?' · +'+a.reward+' бонусов':' · +2% за достижение'}</span>`;}).join('');
    const states={pending:'Ожидает оплаты',paid:'Оплачено',expired:'Бронь завершена',refunded:'Возврат подтверждён',paid_unallocated:'Оплата получена. Свободная лицензия не выделена; проверяем возврат.'};
    $('purchases-list').innerHTML=d.purchases.length ? d.purchases.map(p=>`<article class="purchase"><div><p class="eyebrow">Покупка №${p.id}</p><h3>${esc(p.title)}</h3><p>${esc(states[p.state] || 'Проверяем статус')} · ${money(p.cash)}${p.state==='pending'?' · срок оплаты до '+new Date(p.expires_at*1000).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):''}</p>${p.state==='pending' && p.expires_at*1000<Date.now()?'<p>Время оплаты истекло. Сверяем операцию с кассой перед снятием брони.</p>':''}</div><div class="purchase-links">${p.download_available ? p.formats.filter(x=>['pdf','docx','zip'].includes(x)).map(fmt=>`<a class="button ${fmt==='docx'?'secondary':''}" href="/api/store/purchases/${p.id}/${fmt}">Скачать ${fmt.toUpperCase()}</a>`).join('') : p.payment_url ? `<a class="button" href="${esc(safeSource(p.payment_url))}" target="_blank" rel="noopener">Продолжить оплату ↗</a>` : p.state==='pending' && p.expires_at*1000>Date.now()?`<button class="button secondary" data-retry="${p.id}">Повторить переход</button>`:''}</div></article>`).join('') : '<p class="notice">Здесь появятся оплаченные материалы и активные брони.</p>';
    if (d.purchases.some(p=>p.state==='pending'||p.state==='paid_unallocated')) { if (!accountTimer) accountTimer=setInterval(loadAccount, 7000); }
    else { clearInterval(accountTimer); accountTimer=null; }
  }
  async function loadAccount() { if (!authenticated || document.hidden) return; try { renderAccount(await api('/api/store/account')); } catch(e) { $('account-status').textContent=e.message; } }
  async function afterLogin() { authenticated=true; $('login').hidden=true; $('account-content').hidden=false; $('account-status').textContent='Покупки закреплены за этим аккаунтом.'; clearInterval(telegramTimer); telegramTimer=null; await Promise.all([loadAccount(),loadCatalog()]); if(selected) await choose(selected.sku); }
  async function loadSession() { try { const d=await api('/api/auth/session'); if(d.authenticated) await afterLogin(); } catch { /* Catalogue remains usable without sign-in. */ } }
  $('products').addEventListener('click', e=>{const previewButton=e.target.closest('[data-preview]');const buy=e.target.closest('[data-buy]');if(previewButton)preview(previewButton.dataset.preview);if(buy)void choose(buy.dataset.buy);});
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>{++quoteSequence;b.closest('dialog').close();}));
  $('use-bonus').addEventListener('change',refreshQuote); $('apply-coupon').addEventListener('click',refreshQuote);
  $('coupon').addEventListener('input',()=>{++quoteSequence;quote=null;requestKey=null;$('pay-button').disabled=true;$('checkout-status').textContent='Нажми «Применить», чтобы пересчитать сумму.';});
  $('checkout-form').addEventListener('submit',async e=>{
    e.preventDefault(); if(busy || !quote || !selected || !$('accept-terms').checked)return;
    busy=true; $('pay-button').disabled=true; $('checkout-status').textContent='Резервируем лицензию и открываем кассу…';
    requestKey ||= crypto.randomUUID().replaceAll('-','');
    const params=new URLSearchParams(location.search);
    const source=params.get('utm_source')==='kladovaya'?'kladovaya':params.get('utm_source')==='telegram'?'telegram':'salon';
    const body={sku:selected.sku,request_key:requestKey,expected_cash:quote.cash,use_bonus:$('use-bonus').checked,
      coupon:$('coupon').value.trim(),accept_terms:true,terms,attribution:{source,surface:params.get('surface')||'catalogue'}};
    try {
      const result=await api('/api/store/checkout',body);
      if(result.purchase.payment_url) { $('checkout-dialog').close(); location.assign(result.purchase.payment_url); }
      else { $('checkout-status').textContent='Статус покупки обновлён. Проверь «Мои покупки».'; await loadAccount(); }
    } catch(err) { $('checkout-status').textContent=err.message; if(err.code==='quote_changed')await refreshQuote(); if(err.code==='already_owned'||err.code==='already_reserved') { $('checkout-dialog').close(); await loadAccount(); $('purchases').scrollIntoView(); } }
    finally { busy=false; $('pay-button').disabled=!quote; }
  });
  $('purchases-list').addEventListener('click',async e=>{const b=e.target.closest('[data-retry]');if(!b)return;b.disabled=true;try {const r=await api('/api/store/purchases/'+b.dataset.retry+'/pay',{});if(r.purchase.payment_url)location.assign(r.purchase.payment_url);else await loadAccount();}catch(err){notice(err.message);}finally{b.disabled=false;}});
  $('telegram-login').addEventListener('click',async()=>{try {const d=await api('/api/auth/start',{});$('telegram-link').href=d.link;$('telegram-link').hidden=false;$('login-status').textContent='Открой Telegram по ссылке и подтверди вход в боте. Эта страница дождётся подтверждения.';clearInterval(telegramTimer);const until=Date.now()+d.ttl*1000;telegramTimer=setInterval(async()=>{if(Date.now()>until){clearInterval(telegramTimer);$('login-status').textContent='Срок подтверждения истёк. Начни вход ещё раз.';return;}try{const p=await api('/api/auth/poll',{}, {'X-Auth-Poll':d.poll_state});if(!p.pending)await afterLogin();}catch{}},2500);}catch(e){$('login-status').textContent=e.message;}});
  $('email-form').addEventListener('submit',async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await api('/api/auth/start',{});await api('/api/auth/email/start',{email:$('email').value});$('code-row').hidden=false;$('code').focus();$('login-status').textContent='Код отправлен. Проверь входящие и папку «Спам».';}catch(err){$('login-status').textContent=err.message;}finally{b.disabled=false;}});
  $('verify-code').addEventListener('click',async()=>{try{await api('/api/auth/email/verify',{email:$('email').value,code:$('code').value},{'X-Session-Mode':'cookie'});await afterLogin();}catch(e){$('login-status').textContent=e.message;}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){void loadAccount();void loadCatalog();}});
  if(new URLSearchParams(location.search).has('Shp_store')) { history.replaceState(null,'',location.pathname+'#purchases'); $('account-status').textContent='Проверяем подтверждение оплаты. Войди тем же способом, которым оформлял покупку.'; }
  void loadCatalog(); void loadSession();
})();
