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
  let readerState=null, cardFilter='all', searchQuery='', displaySku='social-pedagogy';
  const SAVED_KEY='salon_material_saved_v1';
  let saved=new Set();try{const v=JSON.parse(localStorage.getItem(SAVED_KEY)||'[]');if(Array.isArray(v))saved=new Set(v.filter(x=>typeof x==='string'&&/^[a-z0-9-]{1,70}$/.test(x)).slice(0,50));}catch{}
  const covers={
    'social-pedagogy':{title:'Социальная\nпедагогика',kind:'14 заданий с разбором',tone:'violet',tab:'Педагогика'},
    'social-work-tech':{title:'Технологии\nсоциальной\nработы',kind:'Комплект третьего семестра',tone:'lilac',tab:'Соцработа'},
    'housing-first':{title:'Housing\nFirst',kind:'Социальная работа в Финляндии',tone:'green',tab:'Housing First'},
    'psycholinguistics':{title:'Выготский.\nМысль\nи слово.',kind:'Основы психолингвистики',tone:'paper',tab:'Выготский'}
  };
  const coverFor=p=>covers[p.sku]||{title:p.title,kind:'Учебный комплект',tone:'paper',tab:p.title};
  const normalize=v=>String(v).toLocaleLowerCase('ru-RU').replaceAll('ё','е');
  function matchesProduct(p){const tokens=normalize(searchQuery).trim().split(/\s+/).filter(Boolean);const text=normalize([p.title,p.description,p.programme,...p.contents].join(' '));return tokens.every(x=>text.includes(x))&&(cardFilter==='all'||cardFilter==='saved'&&saved.has(p.sku)||cardFilter==='speech'&&p.programme.startsWith('44.')||cardFilter==='social'&&!p.programme.startsWith('44.'));}
  function coverMarkup(p){const c=coverFor(p);return `<span class="ms-book-eyebrow">ГИПСР · ${esc(p.semester)} семестр</span><strong>${esc(c.title).replaceAll('\n','<br>')}</strong><span class="ms-book-kind">${esc(c.kind)}</span><span class="ms-book-signature">а. <small>Академический<br>Салон</small><span>PDF<br>+ Word</span></span>`;}
  function renderShowcase(){
    const p=products.find(x=>x.sku===displaySku)||products[0];if(!p){$('hero-preview').disabled=true;$('hero-preview').setAttribute('aria-label','Комплекты пока недоступны');$('feature-price').textContent='';$('feature-tabs').innerHTML='';$('feature-cover').innerHTML='<span class="ms-book-eyebrow">Учебная полка</span><strong>Готовим<br>материалы</strong>';$('feature-note').textContent='Новые комплекты появятся после проверки.';return;}displaySku=p.sku;
    $('hero-preview').disabled=false;$('hero-preview').dataset.tone=coverFor(p).tone;$('hero-preview').setAttribute('aria-label','Полистать: '+p.title);
    $('feature-cover').innerHTML=coverMarkup(p);$('feature-price').textContent=money(p.price);$('feature-note').textContent=p.page_label+' · PDF + Word';
    $('feature-tabs').innerHTML=products.map(x=>`<button type="button" data-feature="${esc(x.sku)}" aria-pressed="${x.sku===displaySku}">${esc(coverFor(x).tab)}</button>`).join('');
  }
  function toggleSaved(sku){if(!products.some(p=>p.sku===sku))return;if(saved.has(sku))saved.delete(sku);else saved.add(sku);try{localStorage.setItem(SAVED_KEY,JSON.stringify([...saved]));}catch{notice('Полка сохранена до закрытия страницы: браузер не разрешил постоянное сохранение.');}renderCards();const b=[...document.querySelectorAll('[data-save]')].find(x=>x.dataset.save===sku);(b||$('store-search')).focus();}

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
    const shown=products.filter(matchesProduct);
    $('products').innerHTML=shown.map(p=>`<article class="product-card ms-card" id="${esc(p.sku)}" data-tone="${coverFor(p).tone}"><div class="ms-card-top"><button type="button" class="ms-mini-book" data-preview="${esc(p.sku)}" aria-label="Посмотреть страницы: ${esc(p.title)}">${coverMarkup(p)}<span class="ms-mini-open">Полистать ↗</span></button><div class="ms-card-summary"><div class="ms-card-tags"><span>${p.programme.startsWith('44.')?'Логопедия':'Социальная работа'} · ${esc(p.semester)} семестр</span><button class="ms-save" data-save="${esc(p.sku)}" type="button" aria-pressed="${saved.has(p.sku)}" aria-label="${saved.has(p.sku)?'Убрать с полки':'Сохранить на полку'}: ${esc(p.title)}"><svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true"><path d="M6 4h12v17l-6-4-6 4z" fill="${saved.has(p.sku)?'currentColor':'none'}" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg></button></div><h3>${esc(p.title)}</h3><p class="meta">${esc(p.page_label)} · PDF + Word</p><ul class="ms-contents">${p.contents.slice(0,3).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></div><div class="ms-card-bottom"><details class="card-details" ${expanded.has(p.sku)?'open':''}><summary>Полный состав и требования</summary><p>${esc(p.description)}</p><ul>${p.contents.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p>${esc(p.requirements_label)}</p><p>У себя сверь точную тему, дополнительные указания преподавателя и срок.</p><a href="${esc(safeSource(p.source_url))}" target="_blank" rel="noopener">Открыть РПД ↗</a></details><div class="ms-price-row"><strong class="price">${money(p.price)}</strong><span class="stock">${p.available?'Доступен для покупки':'Свободных лицензий нет'}${p.sold>0?` · Продано лицензий: ${Number(p.sold)}`:''}</span></div><div class="card-actions"><button type="button" class="button secondary" data-preview="${esc(p.sku)}">Полистать</button><button type="button" class="button" data-buy="${esc(p.sku)}" ${!enabled||!p.available?'disabled':''}>${!enabled?'Оплата закрыта':!p.available?'Нет лицензий':`Выбрать за ${money(p.price)} ↗`}</button></div><p class="card-note">Личная неэксклюзивная лицензия · ${Number(p.available)} из ${Number(p.licences)} доступны${p.reserved?` · в брони ${Number(p.reserved)}`:''}</p></div></article>`).join('');
    renderShowcase();readerChoice();
    const savedCount=products.filter(x=>saved.has(x.sku)).length;$('saved-count').textContent=String(savedCount);
    $('filter-result').textContent=cardFilter==='saved'?`На твоей полке: ${shown.length}. Сохраняется в этом браузере.`:`Найдено комплектов: ${shown.length}`;
    $('reset-filters').hidden=cardFilter==='all'&&!searchQuery;$('catalogue-empty').hidden=shown.length>0||!products.length;
    $('empty-title').textContent=cardFilter==='saved'&&!searchQuery?'Твоя полка пока пуста':'Пока нет такого комплекта';$('empty-copy').textContent=cardFilter==='saved'&&!searchQuery?'Нажми на закладку у подходящего комплекта. Он останется здесь, когда вернёшься с этого браузера.':'Попробуй другой запрос или загляни в бесплатную библиотеку. Свою тему можно передать Салону.';
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
  $('products').addEventListener('click', e=>{const save=e.target.closest('[data-save]');if(save){toggleSaved(save.dataset.save);return;}const previewButton=e.target.closest('[data-preview]');const buy=e.target.closest('[data-buy]');if(previewButton)preview(previewButton.dataset.preview);if(buy)void choose(buy.dataset.buy);});
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
  $('hero-preview').addEventListener('click',()=>preview(displaySku));
  $('feature-tabs').addEventListener('click',e=>{const b=e.target.closest('[data-feature]');if(!b||!products.some(p=>p.sku===b.dataset.feature))return;displaySku=b.dataset.feature;renderShowcase();[...document.querySelectorAll('[data-feature]')].find(x=>x.dataset.feature===displaySku)?.focus();});
  $('store-search').addEventListener('input',()=>{searchQuery=$('store-search').value;renderCards();});
  $('reset-filters').addEventListener('click',()=>{cardFilter='all';searchQuery='';$('store-search').value='';document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.filter==='all')));renderCards();$('store-search').focus();});
  const proofLabels={'41':'О длительном сотрудничестве','43':'Об оперативности','47':'Впечатление после чтения'};let proofOpener=null;
  $('store-reviews').addEventListener('click',e=>{const b=e.target.closest('[data-proof]'),id=b?.dataset.proof;if(!Object.hasOwn(proofLabels,id||''))return;proofOpener=b;$('proof-title').textContent=proofLabels[id];$('proof-image').src='/assets/img/reviews/review-'+id+'.webp';$('proof-dialog').showModal();});
  $('proof-close').addEventListener('click',()=>$('proof-dialog').close());
  $('proof-dialog').addEventListener('close',()=>{proofOpener?.focus();});

  $('shop-filters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;cardFilter=b.dataset.filter;if(!['all','social','speech','saved'].includes(cardFilter))return;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderCards();});
  $('preview-content').addEventListener('click',async e=>{const b=e.target.closest('[data-reader]');if(!b||!readerState)return;const action=b.dataset.reader;if(action==='prev')moveReader(-1);if(action==='next')moveReader(1);if(action==='zoom'){readerState.zoom=!readerState.zoom;readerPage();}if(action==='buy'&&!$('reader-buy').disabled){const sku=readerState.product.sku;$('preview-dialog').close();await choose(sku);}});
  $('preview-dialog').addEventListener('keydown',e=>{if(!readerState)return;if(readerState.zoom&&e.target===$('reader-page'))return;if(e.key==='ArrowRight'){e.preventDefault();moveReader(1);}if(e.key==='ArrowLeft'){e.preventDefault();moveReader(-1);}});
  $('preview-dialog').addEventListener('close',()=>{const opener=readerState?.opener,sku=readerState?.product.sku;readerState=null;if(!$('checkout-dialog').open){const fallback=[...document.querySelectorAll('[data-preview]')].find(b=>b.dataset.preview===sku);(opener?.isConnected?opener:fallback||$('hero-preview')).focus();}});
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
