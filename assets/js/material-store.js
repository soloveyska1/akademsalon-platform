(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => Number(value).toLocaleString('ru-RU') + ' ₽';
  const errors = {
    request_limit:'За сутки уже принято три запроса. Попробуй завтра.', request_changed:'Запрос изменён. Обнови страницу перед новой отправкой.',
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
  let readerState=null, cardFilter='all';
  const PROMO_END=1790802000000;
  let checkoutGeneration=0, interactionGeneration=0, demandPending=false, demandKey=null;
  let telegramTimer = null, accountTimer = null, busy = false, quoteSequence = 0, catalogueSequence = 0, loginCompleting = false;
  const INTENT_KEY='salon_material_intent_v1';
  const metric=(event,sku=selected?.sku||'none')=>window.StoreMetrics?.track(event,sku);
  function remember(sku) { try { sessionStorage.setItem(INTENT_KEY,JSON.stringify({sku,until:Date.now()+30*60*1000})); } catch {} }
  function forget() { try {sessionStorage.removeItem(INTENT_KEY);}catch{} const u=new URL(location.href);u.searchParams.delete('buy');if(products.some(p=>p.sku===u.hash.slice(1)))u.hash='catalogue';history.replaceState(null,'',u.pathname+u.search+u.hash); }
  function closeCheckout() { ++interactionGeneration; ++checkoutGeneration; ++quoteSequence;quote=null;selected=null;requestKey=null;forget();$('pay-button').disabled=true;$('login-home').append($('login')); }
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
  const pagesFor=p=>(p.previews||[]).filter(x=>/^\/assets\/store\/[a-z0-9/_-]+\.(png|webp|jpg)$/.test(x.path));
  function renderCards() {
    const expanded=new Set([...document.querySelectorAll('.product-card:has(.card-details[open])')].map(x=>x.id));
    const shown=products.filter(p=>cardFilter==='all'||(cardFilter==='speech')===p.programme.startsWith('44.'));
    $('products').innerHTML=shown.map(p=>`<article class="product-card" id="${esc(p.sku)}"><button type="button" class="card-visual" data-preview="${esc(p.sku)}" aria-label="Посмотреть страницы: ${esc(p.title)}"><span class="visual-label">${p.programme.startsWith('44.')?'Логопедия':'Социальная работа'}<span>${esc(p.semester)} семестр</span></span><img src="${esc(pagesFor(p)[0]?.path||'')}" alt="Фрагмент: ${esc(p.title)}" loading="lazy"><span class="visual-open">Полистать ${pagesFor(p).length} фрагмента <span>↗</span></span></button><div class="card-body"><h3>${esc(p.title)}</h3><p class="meta">${esc(p.page_label)} · PDF + Word</p><details class="card-details" ${expanded.has(p.sku)?'open':''}><summary>Состав и требования</summary><p>${esc(p.description)}</p><ul>${p.contents.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p>${esc(p.requirements_label)}</p><a href="${esc(safeSource(p.source_url))}" target="_blank" rel="noopener">Открыть РПД ↗</a></details><div class="foot"><span class="price">${money(p.price)}</span><span class="stock">${p.available?`${p.available} из ${p.licences} лицензий доступны`:'Свободных лицензий сейчас нет'}${p.reserved?`<br>Сейчас в брони: ${p.reserved}`:''}</span></div><div class="card-actions"><button type="button" class="button secondary" data-preview="${esc(p.sku)}">Смотреть</button><button type="button" class="button" data-buy="${esc(p.sku)}" ${!enabled||!p.available?'disabled':''}>${!p.available?'Нет лицензий':'Выбрать комплект ↗'}</button></div><p class="card-note">Личная неэксклюзивная лицензия · скачивание в кабинете</p></div></article>`).join('');
    $('hero-preview').disabled=!products.some(p=>p.sku==='social-pedagogy');
    readerChoice();
    $('catalogue-status').hidden=enabled&&products.length>0;
    if(!enabled)$('catalogue-status').textContent='Оформление временно закрыто. Состав и предпросмотр доступны.';
    else if(!products.length)$('catalogue-status').textContent='Новые материалы проходят проверку. Загляни позже.';
  }
  async function loadCatalog() {
    const sequence=++catalogueSequence;
    try { const d=await api('/api/store/catalogue'); if(sequence!==catalogueSequence)return; products=d.products || []; enabled=d.checkout_enabled === true; terms=d.terms; renderCards();
      if(selected && (!enabled || !products.some(p=>p.sku===selected.sku && p.available))) {++quoteSequence;quote=null;$('pay-button').disabled=true;$('checkout-status').textContent='Наличие изменилось. Закрой оформление и выбери доступный материал.';} }
    catch { if(sequence===catalogueSequence)$('catalogue-status').textContent='Не удалось проверить наличие. Обнови страницу, когда появится соединение.'; }
  }
  function readerChoice(){
    if(!readerState)return;const current=products.find(p=>p.sku===readerState.product.sku),button=$('reader-buy');
    button.disabled=!enabled||!current?.available;button.textContent=!enabled?'Продажи приостановлены':!current?.available?'Нет лицензий':'Выбрать этот комплект ↗';
  }
  function readerPage() {
    if(!readerState)return;const {product,index,zoom}=readerState,pages=pagesFor(product),page=pages[index];
    $('reader-page').dataset.zoom=String(zoom);
    $('reader-page').innerHTML=page?`<figure><img src="${esc(page.path)}" alt="${esc(page.label)}"><figcaption>${esc(page.label)}</figcaption></figure>`:'<p>Фрагменты пока не опубликованы.</p>';
    $('reader-page').scrollTop=0;$('reader-page').scrollLeft=0;
    $('reader-count').textContent=pages.length?(index+1)+' / '+pages.length:'Нет фрагментов';
    $('reader-prev').disabled=index===0;$('reader-next').disabled=index>=pages.length-1;
    $('reader-zoom').textContent=zoom?'По ширине':'Увеличить';$('reader-zoom').setAttribute('aria-pressed',String(zoom));readerChoice();
  }
  function preview(sku) {
    const p=products.find(x=>x.sku===sku);if(!p)return;
    readerState={product:p,index:0,zoom:false,opener:document.activeElement};
    $('preview-content').innerHTML=`<header class="reader-head"><p class="eyebrow">Предпросмотр · фрагменты оригинала</p><h2 id="reader-title">${esc(p.title)}</h2></header><div class="reader-tools"><div><button id="reader-prev" data-reader="prev" type="button" aria-label="Предыдущий фрагмент">←</button><span id="reader-count" aria-live="polite"></span><button id="reader-next" data-reader="next" type="button" aria-label="Следующий фрагмент">→</button></div><button id="reader-zoom" data-reader="zoom" type="button" aria-pressed="false">Увеличить</button></div><div id="reader-page" class="reader-page" tabindex="0" role="region" aria-label="Страница документа. В увеличенном виде прокручивай стрелками"></div><footer class="reader-foot"><div><strong>${money(p.price)}</strong><span>${esc(p.page_label)} · PDF + Word</span></div><button id="reader-buy" type="button" class="button" data-reader="buy">Выбрать этот комплект ↗</button></footer>`;
    readerPage();$('preview-dialog').showModal();metric('preview_opened',sku);
  }
  function moveReader(delta){if(!readerState)return;readerState.index=Math.max(0,Math.min(Math.max(0,pagesFor(readerState.product).length-1),readerState.index+delta));readerPage();}
  async function refreshQuote() {
    const sequence=++quoteSequence, sku=selected?.sku;
    if(!authenticated || !sku || !$('checkout-dialog').open)return;
    quote=null; $('pay-button').disabled=true;
    try {
      const calculated=await api('/api/store/quote', {sku,use_bonus:$('use-bonus').checked,coupon:$('coupon').value.trim()});
      if(sequence!==quoteSequence || selected?.sku!==sku || !$('checkout-dialog').open)return;
      quote=calculated; metric('quote_ready',sku);
      $('quote-lines').innerHTML=`<p><span>Цена комплекта</span><span>${money(quote.price)}</span></p><p><span>Скидка по промокоду</span><span>−${money(quote.discount)}</span></p><p><span>Бонусами</span><span>−${money(quote.bonus)}</span></p><p class="total"><span>К оплате</span><strong>${money(quote.cash)}</strong></p>`;
      $('pay-button').textContent=`Перейти к оплате ${money(quote.cash)}`; $('checkout-status').textContent='';
      $('pay-button').disabled=false; requestKey=null;
    } catch(e) { if(sequence===quoteSequence){$('checkout-status').textContent=e.message;if(e.code==='login_required'){authenticated=false;$('login').hidden=false;showSelection();}} }
  }
  function showSelection() {
    $('checkout-dialog').dataset.auth=String(authenticated);
    $('checkout-title').textContent=selected.title;
    $('checkout-description').textContent=selected.page_label+' · PDF и редактируемый Word. '+selected.requirements_label;
    $('checkout-guest').hidden=authenticated;$('checkout-form').hidden=!authenticated;
    $('selection-price').textContent=money(selected.price);
    if(!authenticated){$('checkout-login-slot').append($('login'));$('login').hidden=false;}
    if(!$('checkout-dialog').open)$('checkout-dialog').showModal();
  }
  async function choose(sku) {
    ++interactionGeneration;
    const product=products.find(x=>x.sku===sku);
    if(!product || !enabled || !product.available){forget();notice(!product?'Материал не найден. Выбери комплект в каталоге.':!enabled?errors.checkout_unavailable:errors.sold_out);return;}
    ++quoteSequence;quote=null;requestKey=null;selected=product;remember(sku);metric('product_selected',sku);
    $('pay-button').disabled=true;$('accept-terms').checked=false;$('use-bonus').checked=false;$('coupon').value='';
    $('quote-lines').textContent='';$('checkout-status').textContent='';showSelection();
    if(authenticated)await refreshQuote();
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
  async function afterLogin(interactive=false) {
    if(loginCompleting)return;loginCompleting=true;
    const wasAuthenticated=authenticated;authenticated=true;$('login').hidden=true;$('account-content').hidden=false;
    $('account-status').textContent='Покупки закреплены за этим аккаунтом.';clearInterval(telegramTimer);telegramTimer=null;
    if(interactive && !wasAuthenticated)metric('auth_completed');
    try { await Promise.all([loadAccount(),loadCatalog()]);window.StoreMetrics?.retryRevoke();if(selected && $('checkout-dialog').open){showSelection();await refreshQuote();} }
    finally {loginCompleting=false;}
  }
  async function loadSession() { try {const d=await api('/api/auth/session');if(d.authenticated)await afterLogin();}catch{} }
  $('products').addEventListener('click', e=>{const previewButton=e.target.closest('[data-preview]');const buy=e.target.closest('[data-buy]');if(previewButton)preview(previewButton.dataset.preview);if(buy)void choose(buy.dataset.buy);});
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
  $('checkout-dialog').addEventListener('close',closeCheckout);
  $('checkout-dialog').addEventListener('cancel',closeCheckout);
  $('seasonal-coupon').addEventListener('click',()=>{if(busy)return;if(Date.now()>=PROMO_END){$('seasonal-coupon').hidden=true;return;}$('coupon').value='СЕМЕСТР';void refreshQuote();});
  $('use-bonus').addEventListener('change',refreshQuote); $('apply-coupon').addEventListener('click',refreshQuote);
  $('coupon').addEventListener('input',()=>{++quoteSequence;quote=null;requestKey=null;$('pay-button').disabled=true;$('checkout-status').textContent='Нажми «Применить», чтобы пересчитать сумму.';});
  $('checkout-form').addEventListener('submit',async e=>{
    e.preventDefault(); if(busy || !authenticated || !quote || !selected || !$('accept-terms').checked)return;
    const generation=++checkoutGeneration, checkoutSku=selected.sku;
    busy=true;['coupon','use-bonus','apply-coupon','seasonal-coupon'].forEach(id=>$(id).disabled=true); $('pay-button').disabled=true; $('checkout-status').textContent='Резервируем лицензию и открываем кассу…';
    requestKey ||= crypto.randomUUID().replaceAll('-','');
    const params=new URLSearchParams(location.search);
    const source=params.get('utm_source')==='kladovaya'?'kladovaya':params.get('utm_source')==='telegram'?'telegram':'salon';
    const body={sku:selected.sku,request_key:requestKey,expected_cash:quote.cash,use_bonus:$('use-bonus').checked,
      coupon:$('coupon').value.trim(),accept_terms:true,terms,attribution:{source,surface:params.get('surface')||'catalogue'}};
    try {
      metric('checkout_submitted');
      const result=await api('/api/store/checkout',body);
      if(generation!==checkoutGeneration || selected?.sku!==checkoutSku){notice('Бронь сохранена в «Моих покупках». Проверь выбранный материал перед оплатой.');await loadAccount();return;}
      if(result.purchase.payment_url) { metric('payment_redirect'); $('checkout-dialog').close(); location.assign(result.purchase.payment_url); }
      else { $('checkout-status').textContent='Статус покупки обновлён. Проверь «Мои покупки».'; await loadAccount(); }
    } catch(err) { if(generation!==checkoutGeneration || selected?.sku!==checkoutSku){notice('Проверь «Мои покупки» перед повторным оформлением.');await loadAccount();return;} $('checkout-status').textContent=err.message; if(err.code==='quote_changed')await refreshQuote(); if(err.code==='already_owned'||err.code==='already_reserved') { $('checkout-dialog').close(); await loadAccount(); $('purchases').scrollIntoView(); } }
    finally { busy=false; ['coupon','use-bonus','apply-coupon','seasonal-coupon'].forEach(id=>$(id).disabled=false);$('pay-button').disabled=!quote; }
  });
  $('demand-form').addEventListener('submit',async e=>{
    e.preventDefault();if(demandPending)return;
    if(!authenticated){$('demand-status').textContent='Войди ниже и нажми «Передать задание» ещё раз. Введённый текст останется на странице.';$('purchases').scrollIntoView();$('telegram-login').focus();return;}
    demandPending=true;['demand-send','demand-subject','demand-task','demand-deadline','demand-budget'].forEach(id=>$(id).disabled=true);demandKey ||= crypto.randomUUID().replaceAll('-','');
    try{const result=await api('/api/store/requests',{subject:$('demand-subject').value.trim(),task:$('demand-task').value.trim(),deadline:$('demand-deadline').value,budget:Number($('demand-budget').value),request_key:demandKey});
      if(!Number.isSafeInteger(result.id)||result.id<=0)throw new Error('Не удалось подтвердить получение. Попробуй ещё раз.');
      $('demand-status').textContent='Запрос №'+result.id+' получен. Это подтверждение записи, а не обещание выполнения. Спасибо: так мы выберем следующие материалы.';demandKey=null;$('demand-form').reset();}
    catch(err){$('demand-status').textContent=err.message;if(err.code==='login_required'){authenticated=false;$('login').hidden=false;}}
    finally{demandPending=false;['demand-send','demand-subject','demand-task','demand-deadline','demand-budget'].forEach(id=>$(id).disabled=false);}
  });
  $('demand-form').addEventListener('input',()=>{if(!demandPending)demandKey=null;});
  $('purchases-list').addEventListener('click',async e=>{const b=e.target.closest('[data-retry]');if(!b)return;b.disabled=true;try {const r=await api('/api/store/purchases/'+b.dataset.retry+'/pay',{});if(r.purchase.payment_url)location.assign(r.purchase.payment_url);else await loadAccount();}catch(err){notice(err.message);}finally{b.disabled=false;}});
  $('telegram-login').addEventListener('click',async()=>{try {metric('auth_started');const d=await api('/api/auth/start',{});$('telegram-link').href=d.link;$('telegram-link').hidden=false;$('login-status').textContent='Открой Telegram по ссылке и подтверди вход в боте. Эта страница дождётся подтверждения.';clearInterval(telegramTimer);const until=Date.now()+d.ttl*1000;telegramTimer=setInterval(async()=>{if(Date.now()>until){clearInterval(telegramTimer);$('login-status').textContent='Срок подтверждения истёк. Начни вход ещё раз.';return;}try{const p=await api('/api/auth/poll',{}, {'X-Auth-Poll':d.poll_state});if(!p.pending)await afterLogin(true);}catch{}},2500);}catch(e){$('login-status').textContent=e.message;}});
  $('email-form').addEventListener('submit',async e=>{e.preventDefault();if(!$('email').reportValidity())return;const b=$('email-send');if(b.disabled)return;b.disabled=true;try{metric('auth_started');await api('/api/auth/start',{});await api('/api/auth/email/start',{email:$('email').value});$('code-row').hidden=false;$('code').value='';b.textContent='Отправить ещё раз';$('code').focus();$('login-status').textContent='Код отправлен. Проверь входящие и папку «Спам».';}catch(err){$('login-status').textContent=err.message;}finally{b.disabled=false;}});
  $('code').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('verify-code').click();}});
  $('verify-code').addEventListener('click',async()=>{const b=$('verify-code');if(b.disabled)return;b.disabled=true;try{await api('/api/auth/email/verify',{email:$('email').value,code:$('code').value},{'X-Session-Mode':'cookie'});await afterLogin(true);}catch(e){$('login-status').textContent=e.message;}finally{b.disabled=false;}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){void loadAccount();void loadCatalog();}});
  if(new URLSearchParams(location.search).has('Shp_store')) { history.replaceState(null,'',location.pathname+'#purchases'); $('account-status').textContent='Проверяем подтверждение оплаты. Войди тем же способом, которым оформлял покупку.'; }
  $('hero-preview').addEventListener('click',()=>preview('social-pedagogy'));
  $('shop-filters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;cardFilter=b.dataset.filter;if(!['all','social','speech'].includes(cardFilter))return;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderCards();});
  $('preview-content').addEventListener('click',async e=>{const b=e.target.closest('[data-reader]');if(!b||!readerState)return;const action=b.dataset.reader;if(action==='prev')moveReader(-1);if(action==='next')moveReader(1);if(action==='zoom'){readerState.zoom=!readerState.zoom;readerPage();}if(action==='buy'&&!$('reader-buy').disabled){const sku=readerState.product.sku;$('preview-dialog').close();await choose(sku);}});
  $('preview-dialog').addEventListener('keydown',e=>{if(!readerState)return;if(readerState.zoom&&e.target===$('reader-page'))return;if(e.key==='ArrowRight'){e.preventDefault();moveReader(1);}if(e.key==='ArrowLeft'){e.preventDefault();moveReader(-1);}});
  $('preview-dialog').addEventListener('close',()=>{const opener=readerState?.opener,sku=readerState?.product.sku;readerState=null;if(!$('checkout-dialog').open){const fallback=[...document.querySelectorAll('[data-preview]')].find(b=>b.dataset.preview===sku);(opener?.isConnected?opener:fallback||$('hero-preview')).focus();}});
  $('shop-theme').addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=next;try{localStorage.setItem('salon_theme',next);}catch{}});
  function campaign(){const active=Date.now()<PROMO_END;$('shop-offer').hidden=!active;$('seasonal-coupon').hidden=!active;}
  campaign();setInterval(campaign,60000);
  function requestAnchor(){if(location.hash==='#request')$('demand-panel').open=true;}
  window.addEventListener?.('hashchange',requestAnchor);requestAnchor();
  async function init() {
    const returning=location.hash==='#purchases';if(returning)forget();
    const interaction=interactionGeneration;
    await Promise.all([loadCatalog(),loadSession()]); metric('shop_opened','none');
    if(returning || interaction!==interactionGeneration)return;
    const params=new URLSearchParams(location.search);let sku=params.get('buy') || location.hash.slice(1);
    if(!sku){try{const pending=JSON.parse(sessionStorage.getItem(INTENT_KEY)||'null');if(pending?.until>Date.now())sku=pending.sku;else forget();}catch{forget();}}
    if(products.some(p=>p.sku===sku))await choose(sku);else if(params.has('buy'))notice('Материал не найден. Выбери комплект в каталоге.');
  }
  void init();
})();
