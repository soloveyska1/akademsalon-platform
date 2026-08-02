/* ============================================================
   ЛИЧНЫЙ КАБИНЕТ — заказы живут на сайте; Telegram-бот — зеркало
   для тех, кто его привязал. Доступ: токены заказов этого
   текущей вкладки (salon_tokens), ссылка доступа #claim=<токен>
   с другого устройства или вход через Telegram (Salon.tgLogin).
   Обновления мгновенные: long-poll /api/events (+ редкий страховочный
   поллинг). В фоновой вкладке события продолжают приходить — при
   разрешении показываем системные уведомления устройства.
   ============================================================ */
function initCabinet() {
  'use strict';
  var S = window.Salon;
  var root = document.getElementById('cabRoot');
  if (!S || !S.api || !root) return;
  var startupAccess = Promise.resolve();

  var st = {
    orders: [],       // список из /orders
    currentId: null,  // выбранный заказ
    detail: null,     // полная карточка из /orders/<id>
    me: null,         // /me (бонусы, реф-ссылка) — только при входе
    features: null,   // /features (что включено на сервере), null = ещё не спрашивали
    emailTo: '',      // почта, на которую отправлен код входа
    ledgerOpen: false,
    ledger: null,     // журнал бонусов из /bonus
    depLedgerOpen: false,
    depLedger: null,  // журнал депозита из /deposit
    archOpen: false,  // открыт ли отбор «Завершённые» по ярлыку под списком
    remOpen: false,   // развёрнуты ли «убранные» (архивированные) дела
    tab: 'home',  // активный раздел: home|orders|wallet|club|help
    filter: 'all',    // отбор реестра дел: all|active|done (чипы эталона)
    caseOpen: false,  // открыто ли дело отдельным экраном (как маршрут эталона)
    caseSec: 'work',  // раздел внутри дела: work|money|files|chat|terms
    clubOpen: false,  // развёрнуты ли карточки бонусов/подписки (полоса «клуба»)
    plusOpen: false,  // развёрнута ли витрина «Салон+»
    ctorOpen: false,  // развёрнут ли конструктор подписки внутри витрины
    curOpen: false,   // развёрнут ли куратор сессии внутри витрины
    plans: null,      // /plans (планы+конструктор), null = не загружали
    ctorFeats: [],    // выбранные фичи конструктора
    ctorPeriod: 'month',
    showPeriod: 'sem',  // витрина билетов: показываемый срок (семестр выгоднее)
    pendingJump: null,  // раздел, к которому доехать после смены дела (герой)
    listScroll: 0,      // позиция реестра до открытия дела
    listWindowScroll: 0,
    detailRequestSeq: 0,
    chatStick: false,
    pendingCaseFocus: false,
    timer: null,
    busy: false,
    oauthNotice: null
  };
  var lastPending = null; // pending TG-входа — для перерисовки экрана входа
  var seenTimer = null;   // отложенная отметка «файлы посмотрены»
  var baseTitle = document.title;
  var hiddenNews = 0;     // сколько событий пришло, пока вкладка в фоне
  var skipLink = document.querySelector('.workspace-skip-link');
  if (skipLink) {
    skipLink.addEventListener('click', function (e) {
      var workspace = document.getElementById('accountWorkspace') || root;
      e.preventDefault();
      try { workspace.focus({ preventScroll: true }); } catch (err) { workspace.focus(); }
    });
  }

  /* ---------- системные уведомления устройства (по разрешению) ---------- */
  function notiSupported() { return 'Notification' in window; }
  function notiOn() { return notiSupported() && Notification.permission === 'granted'; }
  function notiAsk() {
    if (!notiSupported()) return;
    try {
      Notification.requestPermission().then(function (p) {
        toast(p === 'granted' ? 'Уведомления включены — догонят вас в любой вкладке'
                              : 'Хорошо, без уведомлений — всё останется здесь, в кабинете');
        renderCurrent();
      });
    } catch (e) { /* старые браузеры без промиса */
      Notification.requestPermission(function () { renderCurrent(); });
    }
  }
  function titleBadge() {
    document.title = (hiddenNews > 0 ? '(' + hiddenNews + ') ' : '') + baseTitle;
  }
  /* Тег обязан совпадать с extras.js ('salon-' + o.id). Раньше здесь стоял
     НОМЕР дела, а там — id: ОС не схлопывала два уведомления об одном
     событии, и клиент с открытым кабинетом в одной вкладке и статьёй
     в другой получал их два. Принимаем и объект заказа, и голый номер. */
  function systemNote(no, body) {
    hiddenNews++;
    titleBadge();
    if (!notiOn()) return;
    var num = (no && no.no) || no, id = (no && no.id) || num;
    try {
      var n = new Notification('Дело ' + num + ' — Академический Салон',
        { body: body, icon: 'assets/img/favicon-120.png', tag: 'salon-' + id });
      n.onclick = function () { try { window.focus(); } catch (e) {} this.close(); };
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { hiddenNews = 0; titleBadge(); }
  });

  /* печати и подписи для смен статуса — «красивые уведомления» */
  var STATUS_STAMP = {
    work: ['Исполнение', 'Оплата получена — началось исполнение позиций'],
    check: ['На проверке', 'Результат ждёт вашей проверки'],
    done: ['Результат принят', 'Заказ завершён — акт приёмки зафиксирован'],
    priced: [null, 'Спецификация и цена предложены — решение за вами'],
    fix: [null, 'Корректировка принята в работу']
  };

  /* ---------------- утилиты ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function safeOauthUrl(provider, raw) {
    try {
      var u = new URL(String(raw || ''));
      if (u.protocol !== 'https:') return '';
      if (provider === 'vk' && (u.hostname === 'id.vk.com' || u.hostname === 'id.vk.ru') &&
          u.pathname === '/authorize') return u.href;
      if (provider === 'mailru' && u.hostname === 'oauth.mail.ru' &&
          u.pathname === '/login') return u.href;
    } catch (e) {}
    return '';
  }
  function money(n) { return (n || 0).toLocaleString('ru-RU'); }
  function dt(iso) {
    if (!iso) return '';
    var d = new Date(iso + (iso.indexOf('Z') < 0 ? 'Z' : ''));
    if (isNaN(d)) return '';
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  /* обратный отсчёт до срока результата — по deadline_date, только для живых дел */
  function daysLeft(o) {
    if (!o.deadline_date || o.step < 0 || o.status === 'done') return null;
    var d = new Date(o.deadline_date + 'T23:59:59');
    if (isNaN(d)) return null;
    return Math.ceil((d - new Date()) / 86400000);
  }
  function deadlineChip(o) {
    var n = daysLeft(o);
    if (n === null) return '';
    if (n < 0) return '<span class="dl-chip late">срок вышел — обсудите с мастером</span>';
    if (n === 0) return '<span class="dl-chip warn">срок результата сегодня</span>';
    return '<span class="dl-chip' + (n <= 3 ? ' warn' : '') + '">до срока результата ' + n + ' ' +
      plural(n, 'день', 'дня', 'дней') + '</span>';
  }
  function tokenFor(id) {
    for (var i = 0; i < st.orders.length; i++)
      if (st.orders[i].id === id && st.orders[i].token) return st.orders[i].token;
    return null;
  }
  function orderHeaders(id) {
    var t = tokenFor(id);
    return t ? { 'X-Order-Token': t } : {};
  }
  function ordersHeaders(tokens) {
    return tokens && tokens.length ? { 'X-Order-Tokens': tokens.join(',') } : {};
  }
  function apiPath(id, tail) {
    return '/orders/' + id + (tail || '');
  }
  var protectedObjectUrls = [];
  function rememberObjectUrl(url) {
    protectedObjectUrls.push(url);
    return url;
  }
  function releaseObjectUrls() {
    protectedObjectUrls.forEach(function (url) {
      try { URL.revokeObjectURL(url); } catch (e) {}
    });
    protectedObjectUrls = [];
  }
  function protectedFetch(orderId, path) {
    var h = S.api.headers ? S.api.headers('GET', orderHeaders(orderId))
      : orderHeaders(orderId);
    return fetch(S.api.base + path, {
      method: 'GET',
      headers: h,
      credentials: 'include',
      cache: 'no-store'
    });
  }
  function protectedFilename(resp, fallback) {
    var disp = resp.headers.get('Content-Disposition') || '';
    var m = disp.match(/filename\*=UTF-8''([^;]+)/i);
    if (m) {
      try { return decodeURIComponent(m[1]); } catch (e) {}
    }
    return fallback || 'файл';
  }
  function hydrateProtectedMedia(scope) {
    (scope || root).querySelectorAll('[data-protected-media]').forEach(function (el) {
      if (el.getAttribute('data-protected-loading') === '1') return;
      el.setAttribute('data-protected-loading', '1');
      var orderId = parseInt(el.getAttribute('data-order-id'), 10);
      var path = el.getAttribute('data-protected-media');
      protectedFetch(orderId, path).then(function (resp) {
        if (!resp.ok) throw new Error('http_' + resp.status);
        return resp.blob();
      }).then(function (blob) {
        if (!el.isConnected) return;
        var url = rememberObjectUrl(URL.createObjectURL(blob));
        el.src = url;
        var open = el.closest('[data-protected-media-open]');
        if (open) {
          open.href = url;
          open.removeAttribute('aria-disabled');
        }
      }).catch(function () {
        if (el.isConnected) {
          el.setAttribute('aria-label', 'Вложение сейчас недоступно');
          el.classList.add('is-unavailable');
        }
      });
    });
  }
  function render(html) {
    releaseObjectUrls();
    root.innerHTML = html;
    if (S.observeReveal) S.observeReveal(root);
    root.querySelectorAll('.reveal').forEach(function (n) { n.classList.add('in'); });
    hydrateProtectedMedia(root);
    giftRestFill(); /* остаток сертификата в завершённом деле — дозагружается тихо */
    var ph = document.getElementById('promoHintHide');
    if (ph) ph.addEventListener('click', function () {
      var p = st.me && st.me.promo_hint;
      if (p) S.store.set('salon_ph_' + p.code, 1);
      var el = document.getElementById('promoHint');
      if (el) el.remove();
    });
  }

  /* -------- остаток подарочного сертификата после завершения дела --------
     Ненавязчиво: только в done-делах с кодом, баланс тянем один раз,
     «скрыть» запоминается на устройстве. */
  var giftBalCache = {};
  function giftRestStrip(o) {
    if (!o || !o.gift_code || o.status !== 'done') return '';
    if (S.store.get('salon_grst_' + o.id)) return '';
    return '<div class="account-notice" id="giftRest" data-oid="' + o.id + '" data-code="' + esc(o.gift_code) + '" hidden></div>';
  }
  function giftRestFill() {
    var box = document.getElementById('giftRest');
    if (!box) return;
    var code = box.getAttribute('data-code'), oid = box.getAttribute('data-oid');
    function show(bal) {
      if (!(bal > 0)) { box.remove(); return; }
      box.innerHTML =
        '<span class="account-notice__mark" aria-hidden="true">₽</span>' +
        '<div><strong>Остаток на сертификате <span class="account-code">' + esc(code) + '</span> — ' + money(bal) + ' ₽</strong>' +
        '<p>Он не сгорел: остатком оплачивается редактура слайдов и доклада, репетиция самостоятельных ответов, нормоконтроль или новая консультационная позиция.</p>' +
        '<span class="gift-actions">' +
        '<a class="line-link" href="configurator.html?service=df&gift=' + encodeURIComponent(code) + '">Редактура выступления <span aria-hidden="true">→</span></a>' +
        '<a class="line-link" href="configurator.html?gift=' + encodeURIComponent(code) + '">Новая заявка с кодом <span aria-hidden="true">→</span></a>' +
        '<button type="button" class="line-link" id="giftRestHide">Не напоминать</button></span></div>';
      box.hidden = false;
      var h = box.querySelector('#giftRestHide');
      if (h) h.addEventListener('click', function () {
        S.store.set('salon_grst_' + oid, 1); box.remove();
        toast('Хорошо — остаток всё равно виден в деле и не сгорает');
      });
    }
    if (giftBalCache[code] != null) { show(giftBalCache[code]); return; }
    S.api.get('/gift/check?code=' + encodeURIComponent(code)).then(function (r) {
      var bal = (r && r.ok) ? (r.balance || 0) : 0;
      giftBalCache[code] = bal; show(bal);
    }, function () { box.remove(); });
  }

  /* -------- живой промокод, который клиент так и не потратил -------- */
  function promoHintStrip() {
    var p = st.me && st.me.promo_hint;
    if (!p || !p.code) return '';
    if (S.store.get('salon_ph_' + p.code)) return '';
    return '<div class="account-notice reveal" id="promoHint">' +
      '<span class="account-notice__mark" aria-hidden="true">%</span>' +
      '<div><strong>Промокод <span class="account-code">' + esc(p.code) + '</span> не использован</strong>' +
      '<p>' + esc(p.label || 'скидка') + ' · применяется к новой заявке</p></div>' +
      '<span class="account-notice__acts">' +
      '<a class="line-link" href="configurator.html?promo=' + encodeURIComponent(p.code) + '">Применить <span aria-hidden="true">→</span></a>' +
      '<button type="button" class="line-link" id="promoHintHide">Скрыть</button></span></div>';
  }
  function toast(msg) { if (S.toast) S.toast(msg); }

  /* ---------------- экраны входа/пустоты ---------------- */
  function tplLogin(pending) {
    var pendingBlock = pending
      ? '<div class="cab-login-pending" role="status" aria-live="polite">' +
        '<span class="cab-pending-mark" aria-hidden="true"><i></i></span>' +
        '<div><span class="cab-login-pending__step">Шаг 2 из 2</span><b>Подтвердите вход в Telegram</b>' +
        '<p>Нажмите «Начать» в боте и вернитесь сюда. Кабинет откроется сам — повторять вход не придётся.</p>' +
        '<div class="cab-pending-actions"><a class="btn btn-wax" href="' + (pending.link || 'https://t.me/academic_saloon_bot') + '" target="_blank" rel="noopener">Открыть Telegram <span class="ar">↗</span></a>' +
        '<button type="button" class="btn btn-line" id="cabTgCancel">Выбрать другой способ</button></div></div></div>'
      : '';
    /* Telegram — самостоятельный основной вход: его /auth/start не зависит
       от SMTP и OAuth-флагов. Остальные способы показываем только когда
       сервер подтвердил, что они действительно включены. Так пропавшая
       почта не прячет Telegram, а незавершённый VK ID не попадает в UI. */
    var f = st.features || {};
    var provBtns = [];
    if (f.email_login) {
      provBtns.push('<button type="button" class="cab-provider cab-provider-email" id="cabEmailTgl" aria-expanded="false" aria-controls="cabEmailWrap">' +
        '<span class="cab-provider-ic" aria-hidden="true">✉</span><span>Код на почту</span></button>');
    }
    if (f.vk_login) {
      provBtns.push('<button type="button" class="cab-provider cab-provider-vk" data-oauth="vk">' +
        '<span class="cab-provider-ic" aria-hidden="true">VK</span><span>VK ID</span></button>');
    }
    if (f.mailru_login) {
      provBtns.push('<button type="button" class="cab-provider cab-provider-mail" data-oauth="mailru">' +
        '<span class="cab-provider-ic" aria-hidden="true">@</span><span>Mail ID</span></button>');
    }
    if (f.max_login) {
      provBtns.push('<button type="button" class="cab-provider cab-provider-max" data-oauth="max">' +
        '<span class="cab-provider-ic" aria-hidden="true">M</span><span>MAX</span></button>');
    }
    var emailBlock = '';
    if (f.email_login) {
      emailBlock = '<div class="cab-email-panel" id="cabEmailWrap" hidden>' +
        '<p>Пришлём одноразовый код. Пароль придумывать и запоминать не нужно.</p>' +
        '<div class="cab-email-row" id="cabEmailBox">' +
          '<label class="visually-hidden" for="cabEmailIn">Электронная почта</label>' +
          '<input class="cab-login-input" type="email" id="cabEmailIn" placeholder="pochta@example.ru" autocomplete="email" inputmode="email">' +
          '<button type="button" class="btn btn-wax" id="cabEmailSend">Получить код</button>' +
        '</div></div>';
    }
    /* пришли за «Салон+» с витрины (#plus), а сессии нет — не встречать гостя
       голой стеной входа: объясняем, что абонемент ждёт сразу за дверью */
    var plusTeaser = (typeof hashPlusScroll !== 'undefined' && hashPlusScroll)
      ? '<div class="cab-login-teaser"><span aria-hidden="true">АС+</span> <span><b>Абонемент «Салон+» уже рядом.</b> ' +
        'Войдите любым способом — и витрина планов откроется автоматически.</span></div>'
      : '';
    var mainAction = '<button type="button" class="btn btn-wax btn-block cab-login-main cab-login-main--telegram" id="cabTg">' +
      '<span class="cab-login-main__telegram" aria-hidden="true">↗</span>' +
      'Войти через Telegram</button>';
    var loginTrust = '<div class="cab-login-trust" aria-label="Что важно о входе">' +
      '<span><b>≈ 1 минута</b><small>обычно занимает вход</small></span>' +
      '<span><b>Без пароля</b><small>подтверждение один раз</small></span>' +
      '<span><b>Без потерь</b><small>дела соберутся сами</small></span></div>';
    var fallbackMethods = provBtns.length
      ? '<section class="cab-login-methods cab-login-methods--visible" aria-label="Другие способы входа">' +
        '<div class="cab-login-methods__head"><span>Или войдите другим способом</span>' +
        '<small>одноразовый код или подключённый ID</small></div>' +
        '<div class="cab-login-methods__body"><div class="cab-prov">' + provBtns.join('') + '</div>' +
        emailBlock + '</div></section>'
      : '';
    var claimAccess = '<details class="cab-alt"><summary><span>Открыть одно дело по ссылке</span>' +
      '<small>без входа в аккаунт</small></summary>' +
      '<p>Вставьте ссылку с экрана «Заявка принята» — откроется только связанное с ней дело.</p>' +
      '<div class="cab-claim-row">' +
        '<label class="visually-hidden" for="cabClaimIn">Ссылка доступа или код дела</label>' +
        '<input class="cab-login-input" type="text" id="cabClaimIn" placeholder="Ссылка доступа или код дела" autocomplete="off">' +
        '<button type="button" class="btn btn-line" id="cabClaimBtn">Открыть</button>' +
      '</div></details>';
    var loginLegal = '<p class="cab-login-legal">Данные входа используются только для защиты кабинета. ' +
      'Подробнее — в <a href="privacy.html">политике ПДн</a>.</p>';
    var firstOrder = '<a class="cab-first-order" href="configurator.html"><span><small>Ещё нет дела?</small>' +
      '<strong>Соберите первую заявку</strong></span><b>Начать <i aria-hidden="true">→</i></b></a>';
    return '<main class="cab-login reveal" id="accountWorkspace" tabindex="-1">' +
      '<section class="cab-login-card" aria-labelledby="cabLoginTitle">' +
        '<div class="cab-login-story">' +
          '<div class="cab-login-seal" aria-hidden="true"><span>АС</span></div>' +
          '<p class="caps">Академический Салон · личный зал</p>' +
          '<h2 id="cabLoginTitle">Продолжить<br>с того же места</h2>' +
          '<p class="cab-story-lead">Один спокойный экран вместо поисков по чатам: что происходит, что нужно от вас и где лежит результат.</p>' +
          '<ul class="cab-login-promises">' +
            '<li><span>01</span><div><strong>Сначала — главное</strong><small>решения и новые события</small></div></li>' +
            '<li><span>02</span><div><strong>Затем — всё дело</strong><small>этапы, файлы и переписка</small></div></li>' +
            '<li><span>03</span><div><strong>Всегда — один маршрут</strong><small>на компьютере и телефоне</small></div></li>' +
          '</ul>' +
          '<p class="cab-story-note"><span aria-hidden="true">¶</span> Доступ подтверждается у выбранного сервиса; пароль для Салона создавать не нужно.</p>' +
        '</div>' +
        '<div class="cab-login-auth">' +
          '<div class="cab-auth-head"><p class="caps">Защищённый вход</p>' +
          '<h3>Откройте свой формуляр</h3>' +
          '<p>Основной путь — через Telegram. После подтверждения все связанные дела появятся здесь автоматически.</p></div>' +
          plusTeaser +
          (pending ? pendingBlock : mainAction + loginTrust + fallbackMethods + claimAccess + loginLegal + firstOrder) +
          '<p class="cab-login-hint" id="cabTgHint" role="status" aria-live="polite" hidden></p>' +
        '</div>' +
      '</section>' +
      '</main>';
  }

  /* ---------------- вход по почте: код на e-mail ---------------- */
  var EMAIL_ERR = {
    resend_wait: 'Код уже отправлен — новый можно запросить через минуту',
    bad_email: 'Проверьте адрес почты',
    send_failed: 'Не получилось отправить письмо — попробуйте позже',
    email_off: 'Вход по почте пока не подключён',
    wrong_code: 'Неверный код — проверьте письмо',
    code_expired: 'Код устарел — запросите новый',
    too_many_attempts: 'Слишком много попыток — запросите новый код',
    rate_limit: 'Слишком часто — подождите минуту'
  };

  function emailSendCode() {
    var inp = document.getElementById('cabEmailIn');
    var email = inp ? inp.value.trim() : '';
    if (!email || !(S.valid && S.valid.email(email))) {
      toast('Введите почту — на неё придёт код входа');
      if (inp) inp.focus();
      return;
    }
    if (st.busy) return;
    st.busy = true;
    S.api.post('/auth/email/start', { email: email }).then(function (r) {
      st.busy = false;
      if (!r.ok) { toast(EMAIL_ERR[r.error] || 'Не получилось — попробуйте ещё раз'); return; }
      st.emailTo = email;
      var box = document.getElementById('cabEmailBox');
      if (!box) return;
      box.innerHTML =
        '<label class="visually-hidden" for="cabEmailCode">Шестизначный код из письма</label>' +
        '<input class="cab-login-input cab-code-input" type="text" id="cabEmailCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="Код из письма">' +
        '<button type="button" class="btn btn-wax" id="cabEmailGo">Войти</button>';
      box.insertAdjacentHTML('afterend',
        '<p class="cab-email-note" id="cabEmailNote" role="status">Код отправлен на <b>' + esc(email) + '</b> — действует 10 минут. ' +
        'Не пришёл? Проверьте «Спам» или <button type="button" class="linkbtn" id="cabEmailAgain">отправьте ещё раз</button>.</p>');
      var code = document.getElementById('cabEmailCode');
      if (code) code.focus();
    });
  }

  function emailVerify() {
    var inp = document.getElementById('cabEmailCode');
    var code = inp ? inp.value.trim() : '';
    if (!code || code.length < 6) { toast('Введите 6-значный код из письма'); if (inp) inp.focus(); return; }
    if (st.busy) return;
    st.busy = true;
    S.api.post('/auth/email/verify', { email: st.emailTo, code: code }, { 'X-Session-Mode':'cookie' }).then(function (r) {
      st.busy = false;
      if (!r.ok || (!r.session && !r.token)) { toast(EMAIL_ERR[r.error] || 'Не получилось — попробуйте ещё раз'); return; }
      if (r.token) S.api.setToken(r.token);
      if (r.session && S.api.setSessionHint) S.api.setSessionHint(true);
      S.api.setUser(r.user || null);
      var gt = S.api.guestTokens();
      var fin = function () {
        toast('Вы вошли' + (r.user && r.user.name ? ', ' + r.user.name : ''));
        loadList();
      };
      if (gt.length) S.api.post('/orders/claim', { tokens: gt }).then(fin, fin);
      else fin();
    });
  }

  function emailAgain() {
    var note = document.getElementById('cabEmailNote');
    if (note) note.remove();
    var box = document.getElementById('cabEmailBox');
    if (!box) return;
    box.innerHTML =
      '<label class="visually-hidden" for="cabEmailIn">Электронная почта</label>' +
      '<input class="cab-login-input" type="email" id="cabEmailIn" placeholder="pochta@example.ru" autocomplete="email" inputmode="email">' +
      '<button type="button" class="btn btn-wax" id="cabEmailSend">Получить код</button>';
    var inp = document.getElementById('cabEmailIn');
    if (inp) { inp.value = st.emailTo || ''; inp.focus(); }
  }

  /* открыть дело по ссылке доступа / коду (токен заказа) */
  function claimByCode(raw) {
    var s = String(raw == null ? '' : raw).trim();
    var m = s.match(/(?:claim|token)=([A-Za-z0-9_-]+)/);
    var tok = m ? m[1] : (/^[A-Za-z0-9_-]{16,}$/.test(s) ? s : '');
    if (!tok) { toast('Не похоже на ссылку доступа — скопируйте её целиком'); return; }
    if (/^cx1_/.test(tok)) {
      S.api.post('/orders/access/exchange', {}, { 'X-Claim-Exchange': tok }).then(function (r) {
        if (!r || !r.ok) { toast('Ссылка уже использована или истекла — попросите новую'); return; }
        if (r.guest_session && S.api.setGuestHint) S.api.setGuestHint(true);
        toast('Дело открыто на этом устройстве');
        loadList();
      });
      return;
    }
    S.api.get('/orders', ordersHeaders([tok])).then(function (r) {
      if (!r.ok) { toast('Не получилось связаться с картотекой — попробуйте ещё раз'); return; }
      if (!(r.orders || []).length) { toast('По этому коду дело не нашлось — проверьте ссылку'); return; }
      S.api.addGuestToken(tok);
      toast('Дело открыто на этом устройстве');
      loadList();
    });
  }

  function tplEmpty() {
    /* порядок по значимости: сначала дело (здесь — приглашение его завести),
       клубные карточки — после; личность живёт в стойке каркаса */
    return '<div class="case-state case-state--empty reveal">' +
      '<header><span>204</span><i aria-hidden="true"></i></header>' +
      '<div class="case-state__body">' +
      '<span class="case-state__mark" aria-hidden="true">+</span>' +
      '<h2>Заказов пока нет</h2>' +
      '<p>Соберите смету в конфигураторе — заявка попадёт к мастеру мгновенно, а статус появится прямо здесь.</p>' +
      '</div>' +
      '<footer class="case-acts">' +
      '<a class="btn btn-wax" href="configurator.html">Подобрать помощь <span class="ar">→</span></a>' +
      '<a class="btn btn-line" href="configurator.html?service=pl">Начать с разбора плана · 3 000 ₽</a></footer>' +
      '</div>' + clubBlock();
  }

  /* -------- секция-раскрывашка: второстепенное свёрнуто, но под рукой -------- */
  /* plain=true — блок и есть содержимое своего раздела дела: сворачивать
     нечего, лишняя строка «свернуть» только мешает. Отдаём обычный лист. */
  function fold(id, summary, meta, inner, open, plain) {
    if (!inner) return '';
    if (plain) {
      return '<section class="fs-sec case-sec" id="' + id + '">' +
        '<header><div><h3>' + summary + '</h3></div>' +
        (meta ? '<span class="case-sec__note">' + meta + '</span>' : '') +
        '</header>' + inner + '</section>';
    }
    /* раскрытие — словом, как служебные кнопки в шапках разделов эталона:
       глиф-шеврона в этом языке нет, состояние читается текстом */
    return '<details class="fs-fold case-fold" id="' + id + '"' + (open ? ' open' : '') + '>' +
      '<summary><h3>' + summary + '</h3>' +
      (meta ? '<span class="case-sec__note">' + meta + '</span>' : '') +
      '<span class="case-fold__toggle">' +
      '<span class="case-fold__shut">развернуть</span>' +
      '<span class="case-fold__open">свернуть</span></span></summary>' +
      '<div class="ff-body case-fold__body">' + inner + '</div></details>';
  }

  /* незакрытая оплата подписки не прячется никогда: тонкая лента сверху,
     сама карточка оплаты — в клубном блоке ниже дела */
  function subPendingBand() {
    var p = st.me && st.me.sub_pending;
    if (!p) return '';
    return '<div class="account-notice account-notice--wax reveal">' +
      '<span class="account-notice__mark" aria-hidden="true">АС+</span>' +
      '<div><strong>Абонемент «' + esc(p.label) + '» ждёт оплаты — ' + money(p.price) + ' ₽</strong>' +
      '<p>Один платёж целиком, без этапов и автосписаний.</p></div>' +
      '<span class="account-notice__acts">' +
      '<button type="button" class="line-link" data-jump="plusCard">К оплате абонемента</button></span></div>';
  }

  function tplError() {
    /* Состояние называем кодом и словами, не цветом (DESIGN-STANDARDS §3). */
    return '<main class="account-entry-state account-entry-state--error" id="accountWorkspace" tabindex="-1">' +
      '<div class="case-state case-state--error reveal">' +
      '<header><span>503</span><i aria-hidden="true"></i></header>' +
      '<div class="case-state__body">' +
      '<span class="case-state__mark" aria-hidden="true">×</span>' +
      '<h2>Картотека не отвечает</h2>' +
      '<p>Проверьте соединение и попробуйте ещё раз. Ваши дела и платежи в порядке — ' +
      'это сбой связи с сервером, а не с заказом. Повторная оплата не требуется.</p>' +
      '</div>' +
      '<footer class="case-acts">' +
      '<button type="button" class="btn btn-line" id="cabRetry">Повторить</button></footer>' +
      '</div></main>';
  }

  function notiRow() {
    var state, note, action, tone = '';
    if (!notiSupported()) {
      state = 'Недоступны';
      note = 'Этот браузер не поддерживает системные уведомления.';
    } else if (Notification.permission === 'granted') {
      state = 'Включены';
      note = 'Статусы, файлы и сообщения приходят, даже если вкладка в фоне.';
      tone = ' is-on';
    } else if (Notification.permission === 'denied') {
      state = 'Заблокированы';
      note = 'Разрешить их можно в настройках сайта вашего браузера.';
    } else {
      state = 'Выключены';
      note = 'Можно получать статусы, новые файлы и сообщения вне открытой вкладки.';
      action = '<button type="button" class="line-link" id="cabNotiBtn">Включить</button>';
    }
    return '<div class="account-setting-row account-setting-row--notifications reveal">' +
      '<span class="account-setting-row__mark' + tone + '" aria-hidden="true">◎</span>' +
      '<div><small>Уведомления</small><strong>' + state + '</strong><p>' + note + '</p></div>' +
      (action || '<span class="account-setting-row__state' + tone + '">' + state + '</span>') + '</div>';
  }

  function linksRow() {
    /* Связанные входы показываем как ясный список состояний, а не как россыпь
       одинаковых чипов. URL подключения сервер выдаёт только из действующей
       cookie-сессии; сессионный секрет не попадает в адрес, логи и Referer. */
    var me = st.me || {};
    var user = me.user || {};
    var f = me.features || {};
    var linked = me.oauth || [];
    var labels = { telegram: 'Telegram', email: 'Почта', vk: 'VK ID', mailru: 'Mail ID', max: 'MAX' };
    var marks = {
      telegram: '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M20.7 4.2 17.9 19c-.2 1.1-.8 1.4-1.7.9l-4.3-3.2-2.1 2c-.2.2-.4.4-.9.4l.3-4.4 8-7.2c.4-.3-.1-.5-.5-.2l-9.9 6.2-4.3-1.3c-.9-.3-.9-.9.2-1.3L19.5 4.4c.8-.3 1.5.2 1.2-.2Z" fill="currentColor"/></svg>',
      email: '@', vk: 'VK', mailru: 'M', max: 'M'
    };
    function noticeFor(provider) {
      var n = st.oauthNotice;
      if (!n || n.provider !== provider) return '';
      var copy = {
        success: labels[provider] + ' подключён. Теперь этот способ открывает тот же кабинет.',
        pending: 'Открываем защищённый вход ' + labels[provider] + '…',
        declined: 'Подключение отменено. Остальные способы входа работают как раньше.',
        already_linked: 'Этот ' + labels[provider] + ' уже используется для другого кабинета. Войдите через него или напишите в поддержку.',
        provider_linked: 'К этому кабинету уже подключён другой ' + labels[provider] + '.',
        session: 'Сессия кабинета истекла. Войдите снова и повторите подключение.',
        provider_off: 'Этот способ входа временно недоступен. Текущий вход продолжает работать.',
        forbidden: 'Этот аккаунт ' + labels[provider] + ' нельзя подключить. Попробуйте другой аккаунт или напишите в поддержку.',
        network: labels[provider] + ' не ответил. Текущий способ входа работает как раньше.'
      };
      var key = n.status === 'error' ? (n.error || 'network') : n.status;
      return '<p class="account-access-notice is-' + esc(n.status) + '" role="status">' +
        esc(copy[key] || copy.network) + '</p>';
    }
    var connectedCount = 0;
    function method(provider, connected, detail, canConnect, stateLabel) {
      var providerNotice = st.oauthNotice && st.oauthNotice.provider === provider
        ? st.oauthNotice : null;
      var pending = providerNotice && providerNotice.status === 'pending';
      var blocked = providerNotice && providerNotice.status === 'error' &&
        (providerNotice.error === 'already_linked' || providerNotice.error === 'forbidden');
      if (connected) connectedCount += 1;
      var action = connected
        ? '<span class="account-access-state is-linked"><i aria-hidden="true">✓</i> ' +
          (stateLabel || 'Подключён') + '</span>'
        : (blocked
          ? '<a class="line-link account-access-action" href="https://t.me/academicsaloon" target="_blank" rel="noopener">Поддержка</a>'
          : (canConnect
          ? '<button type="button" class="line-link account-access-action" data-oauth-link="' + provider + '"' +
            (pending ? ' disabled aria-busy="true"' : '') + '>' + (pending ? 'Подключаем…' : 'Подключить') + '</button>'
          : (provider === 'telegram'
            ? '<a class="line-link account-access-action" href="https://t.me/academicsaloon" target="_blank" rel="noopener">Написать</a>'
            : '<span class="account-access-state">' + (stateLabel || 'Не подключён') + '</span>')));
      return '<div class="account-access-item' + (connected ? ' is-linked' : '') + '" role="listitem" data-access-provider="' + provider + '">' +
        '<span class="account-access-item__mark account-access-item__mark--' + provider + '" aria-hidden="true">' + marks[provider] + '</span>' +
        '<div class="account-access-item__copy"><strong>' + labels[provider] + '</strong><p>' + detail + '</p></div>' +
        action + noticeFor(provider) + '</div>';
    }
    var hasTelegramFlag = Object.prototype.hasOwnProperty.call(user, 'telegram_connected');
    var telegramConnected = hasTelegramFlag ? !!user.telegram_connected
      : (Number(user.id) > 0 || linked.indexOf('telegram') >= 0);
    var bits = [method('telegram', telegramConnected,
      telegramConnected ? 'Вход и уведомления через бота.' : 'Можно добавить позже через мастера.', false)];
    if (f.email_login || user.email_masked) {
      bits.push(method('email', !!user.email_masked,
        user.email_masked ? 'Одноразовый код на ' + esc(user.email_masked) + '.' : 'Вход по одноразовому коду доступен.', false,
        user.email_masked ? 'Подключена' : 'Доступен'));
    }
    [['vk', 'VK ID'], ['mailru', 'Mail ID'], ['max', 'MAX']].forEach(function (p) {
      if (!f[p[0] + '_login']) return;
      bits.push(method(p[0], linked.indexOf(p[0]) >= 0,
        p[0] === 'vk' ? 'Быстрый вход без нового пароля.' : 'Вход через аккаунт ' + p[1] + '.', true));
    });
    return '<div class="account-setting-row account-setting-row--access reveal">' +
      '<span class="account-setting-row__mark" aria-hidden="true">↗</span>' +
      '<div><small>Способы входа</small><strong>Как вы входите в кабинет</strong>' +
      '<p>' + (connectedCount > 1 ? 'Резервный способ входа настроен.' :
        'Подключите ещё один способ, чтобы не потерять доступ к делам.') + '</p></div>' +
      '<div class="account-access-list" role="list">' + bits.join('') + '</div></div>';
  }

  /* «тихий» режим мастера: кабинет клиента открыт из админки (#imp=…) */
  function impMode() {
    try {
      return sessionStorage.getItem('salon_imp') === '1' &&
        !!sessionStorage.getItem('salon_imp_token');
    } catch (e) { return false; }
  }

  /* Строка личности v2 (userRow) заменена стойкой каркаса:
     profileCard()/impBanner() в renderTab; notiRow/linksRow живут в «Помощи». */

  /* -------- «Сейчас важно»: одно главное действие по всем делам --------
     Кабинет сам ранжирует: оплата → решение по цене → приёмка → новое.
     Одна карточка, один сургучный CTA — никакого шума. */
  function nowCard() {
    var list = activeOrders();
    if (!list.length) return '';
    var best = null, score = 0, bestRank = 0, bestDays = Infinity;
    list.forEach(function (o) {
      var s = 0;
      if (o.paused) s = 0;
      else if (o.status === 'prepay' ||
               ((o.part_ready || o.final_ready) && (o.status === 'work' || o.status === 'fix'))) s = 5;
      else if (o.status === 'priced') s = 4;
      else if (o.status === 'check') s = 3;
      else if (o.files_new) s = 2;
      else if (o.unread) s = 1;
      var left = daysLeft(o);
      var urgency = left == null ? 0 : left <= 2 ? 2 : left <= 7 ? 1.5 : left <= 14 ? .5 : 0;
      var rank = s + urgency;
      if (rank > bestRank || (rank === bestRank && left != null && left < bestDays)) {
        score = s;
        best = o;
        bestRank = rank;
        bestDays = left == null ? Infinity : left;
      }
    });
    if (!best) return '';
    var o = best;
    var det = (st.detail && st.detail.id === o.id) ? st.detail : null;
    var due = det && det.due_now && det.due_now.amount ? det.due_now.amount : 0;
    if (!due && o.status === 'prepay') due = o.prepay_due || 0;
    var msg, sub, cta, jump;
    if (score === 5) {
      var what = (o.final_ready && o.status !== 'prepay') ? 'Финальный пакет результата подготовлен'
        : (o.part_ready && o.status !== 'prepay') ? 'Результат части ' + o.part_ready + ' подготовлен'
        : 'Спецификация согласована';
      msg = what + ' — дело за оплатой' + (due ? ': <b>' + money(due) + ' ₽</b>' : '') + '.';
      sub = o.status === 'prepay'
        ? 'Мастер приступит сразу после первого платежа. Реквизиты и оплата картой — в один клик.'
        : 'Файл придёт после подтверждения оплаты этапа. Проверка и корректировки — по условиям соответствующей позиции.';
      cta = 'Перейти к оплате'; jump = 'secPay';
    } else if (score === 4) {
      msg = 'Мастер назвал цену: <b>' + money(o.price) + ' ₽</b> — решение за вами.';
      var discountNote = o.due_total && o.price && o.due_total < o.price
        ? 'С учётом вашей скидки к оплате <b>' + money(o.due_total) + ' ₽</b>. '
        : '';
      sub = discountNote + ((o.stages_total || 1) > 1
        ? 'Платить всё сразу не нужно: старт — только первая часть, остальное по готовности. Бонусы тоже можно применить.'
        : 'Можно применить бонусы, обсудить детали в переписке или принять предложение.');
      cta = 'Посмотреть предложение'; jump = 'secDecide';
    } else if (score === 3) {
      var partW = (o.stages_total || 1) > 1 ? 'Результат части ' + (o.stage || 1) + ' из ' + o.stages_total : 'Результат';
      msg = partW + ' на вашей проверке.';
      sub = 'Сверьте результат с критериями позиции: примите его или запросите обоснованную корректировку.';
      cta = 'Проверить и решить'; jump = 'secDecide';
    } else if (score === 2) {
      msg = 'Новые файлы от мастерской в деле ' + esc(o.no) + '.';
      sub = 'Они уже в разделе «Документы» — и в Telegram, если он привязан.';
      cta = 'Открыть документы'; jump = 'secFiles';
    } else {
      msg = 'Новое сообщение мастера по делу ' + esc(o.no) + '.';
      sub = 'Ответить можно прямо в переписке дела.';
      cta = 'Открыть переписку'; jump = 'secChat';
    }
    /* лента внимания в языке эталона: тот же .account-notice, что у пауз
       и придержанных файлов внутри дела — своих компонентов не заводим */
    return '<div class="account-notice account-notice--wax account-priority reveal" data-account-priority="' + score + '">' +
      '<span class="account-notice__mark" aria-hidden="true">' +
        accountIcon(score >= 4 ? 'wallet' : score === 1 ? 'messages' : 'documents') + '</span>' +
      '<div><p class="account-priority__kicker">Сейчас важно · дело ' + esc(o.no) + '</p>' +
      '<strong>' + msg + '</strong><p>' + esc(shortWork(o)) + '. ' + sub + '</p></div>' +
      '<span class="account-notice__acts">' +
      '<button type="button" class="line-link" data-now-open="' + o.id +
      '" data-now-jump="' + jump + '">' + cta + ' <span aria-hidden="true">→</span></button></span></div>';
  }

  /* -------- «клуб»: бонусы + подписка одной строкой, детали — по клику.
     Кабинет в первую очередь про ДЕЛО; клубные карточки не должны
     отталкивать его вниз. Незакрытая оплата подписки не прячется никогда. */
  function clubBlock() {
    if (!st.me) {
      /* гость: подписки привязаны к аккаунту — тонкий тизер со входом */
      if (!S.api.token()) {
        return '<div class="account-notice reveal">' +
          '<span class="account-notice__mark" aria-hidden="true">АС+</span>' +
          '<div><strong>Абонемент «Салон+»</strong>' +
          '<p>Скидка на каждый заказ, приоритет в согласованном графике и куратор сессии.</p></div>' +
          '<span class="account-notice__acts">' +
          '<button type="button" class="line-link" id="cabTg2">Войти и подключить</button></span></div>';
      }
      return '';
    }
    if (st.me.sub_pending) {
      /* неоплаченная подписка не прячет кошелёк и бонусы (баг 2026-07-22) */
      return subPendingCard(st.me.sub_pending) + (st.plusOpen ? plusSection() : '') +
             bonusCard() + depCard();
    }
    var b = st.me.bonus || {};
    var sub = st.me.sub;
    var depB = (st.me.deposit || {}).balance || 0;
    /* Счёт одной строкой: сумма — в заголовке, оговорки — под ним.
       Состояние называем словом, а не цветом (DESIGN-STANDARDS §3). */
    var head = money(b.balance || 0) + ' бонусов';
    if (depB) head += ' · ' + money(depB) + ' ₽ на депозите';
    var notes = [];
    var exp = (b.expiring || [])[0];
    if (exp) notes.push('Сгорают ' + exp.amount + ' — ' + dt(exp.at).slice(0, 5));
    notes.push(sub ? 'Салон+ действует до ' + esc(sub.expires_ru) : 'Салон+ — от 449 ₽ в месяц');
    return promoHintStrip() +
      '<div class="account-notice reveal">' +
      '<span class="account-notice__mark" aria-hidden="true">₽</span>' +
      '<div><strong>' + head + '</strong><p>' + notes.join(' · ') + '</p></div>' +
      '<span class="account-notice__acts">' +
      '<button type="button" class="line-link" id="clubToggle">' +
      (st.clubOpen ? 'Свернуть' : (sub ? 'Подробнее и куратор' : 'Бонусы и подписка')) + '</button></span></div>' +
      (st.clubOpen ? bonusCard() + depCard() + subCard() : '');
  }

  /* -------- бонусный счёт (только для вошедших) -------- */
  function bonusCard() {
    if (!st.me || !st.me.bonus) return '';
    var b = st.me.bonus;
    var expiring = (b.expiring || []);
    var facts = expiring.length
      ? '<div class="bonus-list bonus-list--expiring">' + expiring.map(function (e) {
          return '<span><b>' + e.amount + '</b><small>сгорают ' + dt(e.at).slice(0, 5) + ' — списываются первыми</small></span>';
        }).join('') + '</div>'
      : '<div class="bonus-list">' +
        '<span><b>1 : 1</b><small>один бонус равен одному рублю скидки</small></span>' +
        '<span><b>20 %</b><small>максимум списания с одного заказа</small></span>' +
        '<span><b>180</b><small>дней действует начисление за пополнение депозита</small></span>' +
        '</div>';
    var led = '';
    if (st.ledgerOpen) {
      led = '<div class="account-ledger" id="bonusLedger">' +
        (st.ledger === null ? '<p class="account-ledger__empty">Листаем журнал…</p>'
          : (st.ledger.length ? st.ledger.map(function (r) {
              var plus = r.delta > 0;
              if (!r.delta) plus = null;
              return '<div class="account-ledger__row">' +
                '<span class="account-ledger__delta ' + (plus === null ? '' : plus ? 'is-plus' : 'is-minus') + '">' +
                  (plus === null ? '·' : (plus ? '+' : '') + r.delta) + '</span>' +
                '<span class="account-ledger__what">' + esc(r.label || '') + (r.note ? ' · ' + esc(r.note) : '') +
                  (r.expires_at && r.delta > 0 ? ' <i class="account-ledger__at">до ' + dt(r.expires_at).slice(0, 5) + '</i>' : '') + '</span>' +
                '<span class="account-ledger__at">' + dt(r.at) + '</span></div>';
            }).join('') : '<p class="account-ledger__empty">Движений пока нет — бонусы появятся после первого заказа.</p>')) +
        '</div>';
    }
    return '<section class="account-section account-bonus-card reveal">' +
      '<header><div><p class="eyebrow">Бонусный счёт</p>' +
      '<h2>Бонусы — единицы скидки, не деньги.</h2></div>' +
      '<a class="line-link" href="loyalty.html">Правила программы <span aria-hidden="true">→</span></a></header>' +
      '<div class="account-panel">' +
      '<header><span>Баланс счёта</span><small>АС · БОН</small></header>' +
      '<strong class="account-panel__figure">' + money(b.balance) + ' бонусов</strong>' +
      '<p>Списание применяется один раз к одному заказу и только до первой оплаты. ' +
      'Стоимость абонемента бонусами не оплачивается.</p>' +
      facts +
      '<div class="account-panel__acts">' +
      '<button type="button" class="button button--secondary" id="bonusLogBtn">' +
      (st.ledgerOpen ? 'Скрыть журнал' : 'Журнал начислений') + '</button>' +
      '<button type="button" class="button button--secondary" id="bonusRefBtn">Пригласить друга</button></div>' +
      '</div>' + led + '</section>';
  }

  /* -------- депозит мастерской: кошелёк-аванс с бонусом за пополнение ------
     Данные для чека НПД передаются при пополнении; внутреннее списание
     аванса на этап не изображаем отдельным денежным расчётом. */
  function depCard() {
    var d = st.me && st.me.deposit;
    if (!d) return '';
    var led = '';
    if (st.depLedgerOpen) {
      led = '<div class="account-ledger" id="depLedger">' +
        (st.depLedger === null ? '<p class="account-ledger__empty">Листаем журнал…</p>'
          : (st.depLedger.length ? st.depLedger.map(function (r) {
              var plus = r.delta > 0;
              return '<div class="account-ledger__row">' +
                '<span class="account-ledger__delta ' + (plus ? 'is-plus' : 'is-minus') + '">' +
                  (plus ? '+' : '−') + money(Math.abs(r.delta)) + '</span>' +
                '<span class="account-ledger__what">' + esc(r.note || r.kind) +
                  (r.order_id ? ' · заказ №' + r.order_id : '') + '</span>' +
                '<span class="account-ledger__at">' + dt(r.at) + '</span></div>';
            }).join('') : '<p class="account-ledger__empty">Движений пока нет — счёт ждёт первого пополнения.</p>')) +
        '</div>';
    }
    var tops = (d.can_topup !== false)
      ? '<div class="deposit-tiers" aria-label="Ступени бонусного начисления">' + [20000, 30000, 45000, 60000].map(function (a) {
          var pct = 0;
          (d.rates || []).forEach(function (rr) { if (a >= rr.from) pct = rr.pct; });
          return '<button type="button" data-dep-topup="' + a + '">' +
            '<span class="deposit-tiers__sum">' + money(a) + ' ₽</span>' +
            '<b>+' + pct + ' %</b><small>бонусами</small></button>';
        }).join('') + '</div>'
      : '<div class="account-notice account-notice--wax">' +
        '<span class="account-notice__mark" aria-hidden="true">≤</span>' +
        '<div><strong>Потолок счёта достигнут</strong>' +
        '<p>Пополнение откроется снова, когда часть остатка уйдёт на согласованные этапы.</p></div></div>';
    var bon = st.me && st.me.bonus;
    return '<section class="account-section reveal" id="depCard">' +
      '<header><div><p class="eyebrow">Депозит мастерской</p>' +
      '<h2>Аванс в счёт согласованных этапов.</h2></div>' +
      '<a class="line-link" href="deposit.html">Условия депозита <span aria-hidden="true">→</span></a></header>' +
      '<div class="deposit-calculator">' +
      '<div class="deposit-calculator__controls">' +
      '<p class="eyebrow">Пополнение</p><h3>Выберите сумму аванса.</h3>' +
      '<p>Ставка начисления зависит от суммы пополнения. Из денежного остатка этап оплачивается целиком; ' +
      'официальный чек относится к пополнению, а не к списанию.</p>' +
      tops +
      '<div class="account-panel__acts"><button type="button" class="button button--secondary" id="depLogBtn">' +
      (st.depLedgerOpen ? 'Скрыть журнал' : 'Журнал счёта') + '</button></div>' +
      '</div>' +
      '<aside class="deposit-ledger-card">' +
      '<header><span>Счёт мастерской</span><small>АС · ДЕП</small></header>' +
      '<div><small>Денежный остаток</small><strong>' + money(d.balance) + ' ₽</strong>' +
      '<p>аванс для оплаты согласованных этапов</p></div>' +
      (bon ? '<div><small>Бонусный счёт</small><strong>+' + money(bon.balance || 0) + '</strong>' +
        '<p>начисление за пополнения, срок действия 180 дней</p></div>' : '') +
      '<footer><span>Деньги и бонусы</span>' +
      '<b>учитываются раздельно и не складываются в одну денежную сумму</b></footer>' +
      '</aside></div>' + led + '</section>';
  }

  /* -------- подписка «Салон+»: карточка, витрина, конструктор, куратор --------
     У подписки СВОЙ платёжный порядок (не заказ): один перевод, без этапов,
     без бонусов; «я оплатил» → сверка мастером → активация. */
  function subPendingCard(p) {
    var controls, receiptNote, receiptAct;
    if (p.claimed) {
      controls = '<p class="eyebrow">Сверка платежа</p><h3>Отметка «оплатил» у мастера.</h3>' +
        '<p>Сверяем поступление ' + money(p.price) + ' ₽ за «' + esc(p.label) + '». ' +
        'Как подтвердим — абонемент включится сам и придёт уведомление.</p>' +
        '<div class="account-panel__acts">' +
        '<button type="button" class="button button--secondary" data-sub-unpaid="' + p.id + '">Я ещё не оплатил — снять отметку</button>' +
        '</div>';
      receiptNote = '<div class="deposit-receipt__note"><strong>На сверке</strong>' +
        '<p>Платёж отмечен вами и ждёт подтверждения мастером. Повторно переводить сумму не нужно.</p></div>';
      receiptAct = '';
    } else {
      var slip = p.requisites
        ? '<div class="pay-requisites">' + reqRows(p.requisites) + '</div>' +
          '<div class="account-steps"><span><b>01</b>переведите сумму по реквизитам</span>' +
          '<span><b>02</b>отметьте «Я оплатил(а)»</span>' +
          '<span><b>03</b>сверим — абонемент включится сам</span></div>'
        : '<p>Реквизиты появятся здесь в течение пары минут — либо оформите в Telegram: ' +
          '<a class="line-link" href="https://t.me/academic_saloon_bot?start=plus" target="_blank" rel="noopener">@academic_saloon_bot</a></p>';
      controls = '<p class="eyebrow">Реквизиты для перевода</p><h3>Один платёж целиком.</h3>' +
        '<p>' + esc(p.label) + ' · ' + esc(p.period_label) +
        '. Это не заказ: без этапов и планов оплат, автосписаний нет.</p>' + slip +
        '<div class="account-panel__acts">' +
        (p.pay_online ? '<button type="button" class="button button--secondary" data-sub-paid="' + p.id + '">Я оплатил(а) абонемент</button>'
                      : '') +
        '<button type="button" class="button button--secondary" data-sub-cancel="' + p.id + '">Отменить оформление</button></div>';
      receiptNote = '<div class="deposit-receipt__note"><strong>Важно</strong>' +
        '<p>Абонемент оплачивается деньгами целиком: бонусы и скидки к нему не применяются ' +
        '(<a class="line-link" href="loyalty.html" target="_blank" rel="noopener">правила, §5</a>).</p></div>';
      receiptAct = p.pay_online
        ? '<button type="button" class="button button--primary" data-sub-pay="' + p.id + '">Оплатить картой онлайн</button>'
        : '<button type="button" class="button button--primary" data-sub-paid="' + p.id + '">Я оплатил(а) абонемент</button>';
    }
    return '<section class="account-section account-club-card account-club-card--pending reveal" id="plusCard">' +
      '<header><div><p class="eyebrow">Абонемент «Салон+»</p>' +
      '<h2>Оформление ждёт оплаты.</h2></div>' +
      '<button type="button" class="line-link" id="plusToggle">' +
      (st.plusOpen ? 'Свернуть планы' : 'Выбрать другой план') + '</button></header>' +
      '<div class="deposit-calculator reveal" id="subPaySheet">' +
      '<div class="deposit-calculator__controls">' + controls + '</div>' +
      '<aside class="deposit-receipt">' +
      '<header><span>Платёж за абонемент</span><small>АС · АБН</small></header>' +
      '<dl><div><dt>План</dt><dd>' + esc(p.label) + '</dd></div>' +
      '<div><dt>Срок действия</dt><dd>' + esc(p.period_label) + '</dd></div>' +
      '<div><dt>К оплате деньгами</dt><dd>' + money(p.price) + ' ₽</dd></div></dl>' +
      receiptNote + receiptAct + '</aside></div></section>';
  }

  function subCard() {
    if (!S.api.token()) return '';
    var pend = st.me && st.me.sub_pending;
    if (pend) return subPendingCard(pend) + (st.plusOpen ? plusSection() : '');
    var sub = st.me && st.me.sub;
    var head, pass, facts, copy;
    var passHead = '<header><img src="bimi/logo.svg" alt="" width="32" height="32">' +
      '<span>Академический Салон</span><small>Серия С+</small></header>' +
      '<div><span class="membership-pass__seal">АС+</span></div>';
    if (sub) {
      facts = '<div class="commerce-facts" aria-label="Условия плана">' +
        '<span><b>до ' + esc(sub.expires_ru) + '</b><small>срок действия плана</small></span>' +
        (sub.discount_pct
          ? '<span><b>−' + sub.discount_pct + ' %</b><small>на подходящий заказ, до ' + money(sub.discount_cap) + ' ₽ выгоды</small></span>'
          : '<span><b>Приоритет</b><small>в согласованном графике мастерской</small></span>') +
        '<span><b>' + (sub.auto_renew ? 'Счёт вручную' : 'Без продления') + '</b>' +
        '<small>автосписаний нет ни в одном режиме</small></span></div>';
      copy = '<p>Скидка уже применяется сама, когда мастер называет цену. Здесь остаются только срок, ' +
        'состав плана и ручное управление — без скрытых списаний.</p>' + facts +
        '<p class="account-note">Автопродление <b>' + (sub.auto_renew ? 'включено' : 'выключено') + '</b>: ' +
        (sub.auto_renew ? 'при истечении срока пришлём счёт — деньги спишутся только вашими руками'
                        : 'срок закончится, и мы просто напомним') +
        ' · <button type="button" class="line-link" data-sub-ar="' + sub.id + '" data-ar-on="' + (sub.auto_renew ? 0 : 1) + '">' +
        (sub.auto_renew ? 'выключить' : 'включить') + '</button></p>';
      pass = '<aside class="membership-pass" aria-label="Ваш абонемент">' + passHead +
        '<div class="membership-pass__body"><p>Абонемент мастерской</p><h2>' + esc(sub.label) + '</h2>' +
        '<span>действует до ' + esc(sub.expires_ru) + '</span></div>' +
        '<dl><div><dt>Продление</dt><dd>' + (sub.auto_renew ? 'счёт вручную, без списания' : 'только вручную') + '</dd></div>' +
        '<div><dt>Скидка</dt><dd>' + (sub.discount_pct ? '−' + sub.discount_pct + ' % к подходящему заказу' : 'по составу плана') + '</dd></div>' +
        '<div><dt>Бонусы</dt><dd>учитываются отдельно</dd></div></dl>' +
        '<footer><span>Абонемент активен</span><b>АС / АБОНЕМЕНТ</b></footer></aside>';
      head = '<section class="account-section account-club-card account-club-card--active reveal" id="plusCard">' +
        '<header><div><p class="eyebrow">Абонемент «Салон+»</p>' +
        '<h2>Салон+ работает.</h2></div>' +
        '<button type="button" class="line-link" id="plusToggle">' +
        (st.plusOpen ? 'Скрыть управление' : 'Управлять планом') + '</button></header>' +
        '<div class="plus-intro"><div class="plus-intro__copy">' + copy + '</div>' + pass + '</div></section>';
    } else {
      facts = '<div class="commerce-facts" aria-label="Основные условия">' +
        '<span><b>30 или 150 дней</b><small>у двух основных планов</small></span>' +
        '<span><b>Один платёж</b><small>без автоматического списания</small></span>' +
        '<span><b>До 24 часов</b><small>на активацию после оплаты</small></span></div>';
      pass = '<aside class="membership-pass" aria-label="Образец абонемента">' + passHead +
        '<div class="membership-pass__body"><p>Абонемент мастерской</p><h2>Салон+</h2>' +
        '<span>срок и состав фиксируются до оплаты</span></div>' +
        '<dl><div><dt>Продление</dt><dd>только вручную</dd></div>' +
        '<div><dt>Скидка</dt><dd>применяется к подходящему заказу</dd></div>' +
        '<div><dt>Бонусы</dt><dd>учитываются отдельно</dd></div></dl>' +
        '<footer><span>Образец</span><b>активируется после оплаты</b></footer></aside>';
      head = '<section class="account-section account-club-card account-club-card--inactive reveal" id="plusCard">' +
        '<header><div><p class="eyebrow">Абонемент «Салон+»</p>' +
        '<h2>Подключите только то, что действительно пригодится.</h2></div>' +
        '<a class="line-link" href="plus.html">Условия абонемента <span aria-hidden="true">→</span></a></header>' +
        '<div class="plus-intro"><div class="plus-intro__copy">' +
        '<p>Абонемент даёт скидку на подходящие услуги, приоритет в графике, куратора сессии и отдельную ' +
        'редактуру материалов к выступлению. Он оплачивается отдельно и не продлевается автоматически.</p>' +
        facts +
        '<button type="button" class="button ' + (st.plusOpen ? 'button--secondary' : 'button--primary') + '" id="plusToggle">' +
        (st.plusOpen ? 'Свернуть планы' : 'Выбрать план') + '</button>' +
        '</div>' + pass + '</div></section>';
    }
    return head + (st.plusOpen ? plusSection() : '');
  }

  function planCardHtml(p, i) {
    /* карточка плана эталона: индекс и назначение → имя → цена серифом →
       состав волосяными строками (доля/индекс — моно) → один CTA */
    var pl = st.plans;
    var featObjs = (p.features || []).map(function (fid) {
      return (pl.features || []).filter(function (x) { return x.id === fid; })[0];
    }).filter(Boolean);
    var discF = featObjs.filter(function (f) { return pl.discounts[f.id]; })
      .sort(function (a, b) { return pl.discounts[b.id].pct - pl.discounts[a.id].pct; })[0];
    var disc = discF ? pl.discounts[discF.id] : null;
    var others = featObjs.filter(function (f) { return !discF || f.id !== discF.id; });
    var featRows = others.map(function (f, n) {
      return '<li><b>' + (n + 1 < 10 ? '0' : '') + (n + 1) + '</b><span>' + esc(f.label) +
        (f.hint ? ' — ' + esc(f.hint) : '') + '</span></li>';
    }).join('');
    var rec = /pro/.test(p.id || '');
    var per = st.showPeriod;
    var price, priceNote, buy, buyLabel;
    if (p.once) {
      price = money(p.month_price) + ' ₽';
      priceNote = p.period_days ? 'разовый доступ · ' + p.period_days + ' дней' : 'разовый доступ · срок в условиях плана';
      buy = p.id + ':month';
      buyLabel = 'Оформить';
    } else if (per === 'sem') {
      price = money(p.sem_price) + ' ₽';
      priceNote = 'семестр · 150 дней одной оплатой';
      buy = p.id + ':sem';
      buyLabel = 'Оформить на семестр';
    } else {
      price = money(p.month_price) + ' ₽';
      priceNote = 'месяц · 30 дней · без автосписаний';
      buy = p.id + ':month';
      buyLabel = 'Оформить на месяц';
    }
    if (!rec) buyLabel = 'Выбрать';
    var no = (i || 0) + 1;
    return '<article class="plus-plan-card' + (rec ? ' plus-plan-card--featured' : '') + '">' +
      '<header><span>' + (no < 10 ? '0' : '') + no + '</span>' +
      '<p>' + esc(p.tagline || (p.once ? 'Разовый формат' : 'План абонемента')) + '</p>' +
      (rec ? '<em>Выбор мастерской</em>' : '') + '</header>' +
      '<h3>' + esc(p.label) + '</h3>' +
      '<div class="plus-plan-card__price"><strong>' + price + '</strong><small>' + priceNote + '</small></div>' +
      '<p>' + (p.once ? 'Фиксированный срок для плотного графика сдач без последующего продления.'
                     : 'Скидка применяется сама, когда мастер называет цену заказа.') + '</p>' +
      '<ul>' +
      (disc ? '<li><b>−' + disc.pct + ' %</b><span>скидка на каждый заказ, но не более ' +
        money(disc.cap) + ' ₽ выгоды с одного заказа</span></li>' : '') +
      featRows + '</ul>' +
      '<button type="button" class="button ' + (rec ? 'button--primary' : 'button--secondary') +
      '" data-sub-buy="' + buy + '">' + buyLabel + '</button>' +
      '</article>';
  }

  function ctorHtml() {
    /* Бланк живёт внутри единой полки планов. Период у каталога и набора один,
       а каждый клик по опции сразу отражается в компактном билете справа. */
    var pl = st.plans;
    var discIds = Object.keys(pl.discounts || {});
    var best = bestCtorDisc();
    var bestId = null;
    if (best) {
      st.ctorFeats.forEach(function (fid) {
        if (pl.discounts[fid] && pl.discounts[fid].pct === best.pct) bestId = bestId || fid;
      });
    }
    var opts = (pl.features || []).map(function (f) {
      var on = st.ctorFeats.indexOf(f.id) >= 0;
      return '<button type="button" class="builder-option' + (on ? ' is-selected' : '') + '" data-ctor-f="' + esc(f.id) +
        '" aria-pressed="' + on + '">' +
        '<span class="builder-option__name">' + esc(f.label) + '</span>' +
        '<b>+' + money(f.price) + ' ₽</b>' +
        (f.hint ? '<small>' + esc(f.hint) + '</small>' : '') +
        '<i aria-hidden="true">+</i></button>';
    }).join('');
    var chosen = (pl.features || []).filter(function (f) { return st.ctorFeats.indexOf(f.id) >= 0; });
    var comp = '<div><dt>Базовая ставка</dt><dd>' + money(pl.base_price) + ' ₽ / 30 дн.</dd></div>' +
      (chosen.length
        ? chosen.map(function (f) {
            var idle = discIds.indexOf(f.id) >= 0 && f.id !== bestId;
            return '<div><dt>' + esc(f.label) + (idle ? ' — не суммируется со скидкой выше' : '') + '</dt>' +
              '<dd>' + (idle ? '—' : '+' + money(f.price) + ' ₽ / 30 дн.') + '</dd></div>';
          }).join('')
        : '<div><dt>Опции пока не выбраны</dt><dd>—</dd></div>');
    var saveNote = '';
    if (best) {
      var save = Math.min(Math.round(20000 * best.pct / 100), best.cap);
      saveNote = ' Курсовая за 20 000 ₽ с таким набором — уже −' + money(save) + ' ₽.';
    }
    return '<section class="club-blank" id="ctorBox" aria-label="Бланк своего набора">' +
      '<header><div><p class="eyebrow">Бланк набора</p>' +
      '<h3>Только нужные опции.</h3></div><span>' +
      (st.ctorPeriod === 'sem' ? '150 дней · одна оплата' : '30 дней · одна оплата') + '</span></header>' +
      '<div class="club-blank__body">' +
      '<div class="club-blank__options">' +
      '<p>Базовая ставка ' + money(pl.base_price) + ' ₽ за 30 дней; выбранный срок учтён в итоговой сумме. ' +
      'Из скидочных опций действует одна — самая большая. ' +
      'Готовые планы выгоднее того же набора на 10–15 %.' + saveNote + '</p>' +
      '<div class="builder-options">' + opts + '</div></div>' +
      '<aside class="club-blank__ticket">' +
      '<header><span>Ваш набор</span><small>АС · БЛАНК</small></header>' +
      '<dl>' + comp +
      '<div><dt>Итого ' + (st.ctorPeriod === 'sem' ? 'за 150 дней одной оплатой' : 'за 30 дней') + '</dt>' +
      '<dd id="ctorTotal">' + (chosen.length ? money(ctorTotal()) + ' ₽' : '—') + '</dd></div></dl>' +
      '<div class="club-blank__note"><strong>Без автосписаний</strong>' +
      '<p>Оплата разовая: срок закончится, и продление нужно будет подтвердить отдельно.</p></div>' +
      '<button type="button" class="button button--primary" id="ctorBuy"' + (chosen.length ? '' : ' disabled') + '>Оформить набор</button>' +
      '</aside></div></section>';
  }

  function bestCtorDisc() {
    var pl = st.plans;
    if (!pl) return null;
    var best = null;
    st.ctorFeats.forEach(function (fid) {
      var d = pl.discounts[fid];
      if (d && (!best || d.pct > best.pct)) best = d;
    });
    return best;
  }

  function ctorTotal() {
    var pl = st.plans;
    if (!pl || !st.ctorFeats.length) return 0;
    var feats = st.ctorFeats.slice();
    /* скидка одна — как на сервере: считаем по самой жирной */
    var sum = pl.base_price;
    var discIds = Object.keys(pl.discounts);
    var chosenDiscs = feats.filter(function (f) { return discIds.indexOf(f) >= 0; });
    var keepDisc = chosenDiscs.sort(function (a, b) { return pl.discounts[b].pct - pl.discounts[a].pct; })[0];
    feats.forEach(function (fid) {
      if (discIds.indexOf(fid) >= 0 && fid !== keepDisc) return;
      var f = (pl.features || []).filter(function (x) { return x.id === fid; })[0];
      if (f) sum += f.price;
    });
    var k = pl.periods[st.ctorPeriod] ? pl.periods[st.ctorPeriod].k : 1;
    return Math.round(sum * k / 10) * 10;
  }

  function curatorHtml() {
    var ms = (st.me && st.me.milestones) || [];
    var sub = st.me && st.me.sub;
    var canMore = (sub && (sub.features || []).indexOf('curator') >= 0) ? ms.length < 50 : ms.length < 1;
    var months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    var rows = ms.map(function (m) {
      var d = m.due || '';
      var mi = parseInt(d.slice(5, 7), 10) - 1;
      return '<article class="account-curator-row">' +
        '<time datetime="' + esc(d) + '"><b>' + (d.slice(8, 10) || '—') + '</b>' +
        '<small>' + (months[mi] || d.slice(5, 7) || 'дата') + '</small></time>' +
        '<span class="account-curator-row__copy"><small>Контрольная точка</small>' +
        '<strong>' + esc(m.title) + '</strong></span>' +
        '<button type="button" class="line-link" data-ms-del="' + m.id +
        '" aria-label="Убрать дату: ' + esc(m.title) + '">Убрать</button></article>';
    }).join('');
    var agenda = rows
      ? '<div class="account-curator-agenda__list">' + rows + '</div>'
      : '<div class="account-curator-empty"><span aria-hidden="true">＋</span><div>' +
        '<strong>Пока ни одной даты</strong><p>Добавьте ближайшую сдачу — начнём с неё.</p></div></div>';
    var add = canMore
      ? '<details class="account-curator-add" id="curatorAdd"' + (ms.length ? '' : ' open') + '>' +
        '<summary><span><small>Новая контрольная точка</small><strong>Добавить дату</strong></span>' +
        '<i aria-hidden="true"></i></summary><div class="account-form-row">' +
          '<input class="account-input" type="text" id="msTitle" maxlength="120" aria-label="Название сдачи или экзамена" placeholder="Что сдаёте — например, «Курсовая по ТГП»">' +
          '<input class="account-input account-input--short" type="date" id="msDate" aria-label="Дата сдачи или экзамена">' +
          '<button type="button" class="button button--secondary" id="msAdd">Добавить в график</button></div></details>'
      : '<p class="account-curator-cap">Без абонемента доступна одна дата. В плане с куратором можно вести весь график.</p>';
    return '<section class="account-section account-club-curator reveal" id="curatorBox">' +
      '<header><div><p class="eyebrow">Куратор сессии</p>' +
      '<h2>Сессия под контролем.</h2></div>' +
      '<span class="account-count">' + ms.length + ' ' + plural(ms.length, 'дата', 'даты', 'дат') + '</span></header>' +
      '<div class="account-curator-layout">' +
      '<div class="account-curator-agenda"><header><div><small>Личный график</small>' +
      '<strong>Ближайшие точки</strong></div><span>АС · КУР</span></header>' + agenda + add + '</div>' +
      '<aside class="account-curator-aside"><span class="account-curator-aside__mark" aria-hidden="true">7·3·1</span>' +
      '<p class="eyebrow">Ритм напоминаний</p><h3>Раньше, чем станет срочно.</h3>' +
      '<p>Напомним за 7, 3 и 1 день. Если срок начинает гореть, можно сразу открыть заявку и передать задачу мастерской.</p>' +
      '<div class="account-curator-reminders" aria-label="Напоминания за 7, 3 и 1 день">' +
      '<span><b>7</b><small>спланировать</small></span><span><b>3</b><small>свериться</small></span>' +
      '<span><b>1</b><small>подстраховать</small></span></div>' +
      '<a class="button button--primary" href="configurator.html">Передать задачу <span aria-hidden="true">→</span></a>' +
      '</aside></div></section>';
  }

  function plusSection() {
    if (!st.plans) {
      loadPlans();
      return '<div class="account-loading reveal" role="status">Листаем планы…</div>';
    }
    var planList = st.plans.plans || [];
    var cards = planList.map(planCardHtml).join('');
    var hasPeriods = (st.plans.plans || []).some(function (p) { return !p.once; });
    var seg = hasPeriods
      ? '<div class="period-switch" role="group" aria-label="Срок абонемента">' +
        '<button type="button" data-seg-period="month" class="' + (st.showPeriod === 'month' ? 'is-current' : '') +
        '" aria-pressed="' + (st.showPeriod === 'month') + '">30 дней</button>' +
        '<button type="button" data-seg-period="sem" class="' + (st.showPeriod === 'sem' ? 'is-current' : '') +
        '" aria-pressed="' + (st.showPeriod === 'sem') + '">150 дней</button></div>'
      : '';
    /* Срок общий для готовых планов и бланка: на одном экране не должно быть
       двух независимых денежных переключателей. */
    st.ctorPeriod = st.showPeriod;
    var ms = (st.me && st.me.milestones) || [];
    var ctorBlock = st.ctorOpen ? ctorHtml() : '';
    var curBlock = st.curOpen ? curatorHtml() : '';
    var extras = st.curOpen ? '' :
      '<div class="plus-extras">' +
      '<button type="button" class="line-link" id="curShow">Куратор сессии' +
        (ms.length ? ' · записей: ' + ms.length : '') + ' <span aria-hidden="true">→</span></button>' +
      '</div>';
    var baseK = st.plans.periods[st.showPeriod] ? st.plans.periods[st.showPeriod].k : 1;
    var baseShown = Math.round(st.plans.base_price * baseK / 10) * 10;
    var blankNo = planList.length + 1;
    var blankCard = '<article class="plus-plan-card plus-plan-card--blank">' +
      '<header><span>' + (blankNo < 10 ? '0' : '') + blankNo + '</span><p>Бланк абонемента</p></header>' +
      '<h3>Свой набор</h3>' +
      '<div class="plus-plan-card__price"><strong>от ' + money(baseShown) + ' ₽</strong><small>' +
      (st.showPeriod === 'sem' ? 'база на 150 дней' : 'база на 30 дней') + '</small></div>' +
      '<p>База и только нужные опции. Итог пересчитается прямо в бланке.</p>' +
      '<ul><li><b>01</b><span>выберите нужные возможности</span></li>' +
      '<li><b>02</b><span>сверьте единый итог до оформления</span></li></ul>' +
      '<button type="button" class="button button--secondary" id="ctorShow" aria-controls="ctorBox" aria-expanded="' +
      st.ctorOpen + '">' + (st.ctorOpen ? 'Свернуть бланк' : 'Открыть бланк') + '</button></article>';
    var hasActiveSub = !!(st.me && st.me.sub);
    var planSection = '<section class="account-section account-club-plans reveal" id="plusSheet">' +
      '<header><div><p class="eyebrow">' + (hasActiveSub ? 'Управление · Клуб Салона' : 'Клуб Салона') + '</p>' +
      '<h2>Планы и свой набор.</h2></div>' + seg + '</header>' +
      '<div class="plus-plan-grid">' + cards + blankCard + '</div>' + ctorBlock +
      '<p class="commerce-caption">Абонемент активируется не позднее 24 часов после подтверждения оплаты. ' +
      'Скидка абонемента и бонусы учитываются раздельно; вместе они не превышают 25 % стоимости заказа. ' +
      'Оформить можно и в Telegram: <a class="line-link" href="https://t.me/academic_saloon_bot?start=plus" target="_blank" rel="noopener">@academic_saloon_bot</a></p>' +
      extras + '</section>';
    return curBlock + planSection;
  }

  function captureAccountUi() {
    var snap = {
      fields: {}, details: {}, visibility: {}, focus: '', focusStart: null,
      scroll: 0, windowScroll: window.scrollY || 0, navScroll: 0,
      chatSeen: false, chatAtEnd: true, chatScroll: 0
    };
    var main = root.querySelector('.account-main');
    if (main) snap.scroll = main.scrollTop;
    var nav = root.querySelector('.account-nav nav');
    if (nav) snap.navScroll = nav.scrollLeft;
    root.querySelectorAll('details[id]').forEach(function (el) {
      snap.details[el.id] = !!el.open;
    });
    ['reviewForm', 'fixForm'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) snap.visibility[id] = !!el.hidden;
    });
    var chat = document.getElementById('chatFeed');
    if (chat) {
      snap.chatSeen = true;
      snap.chatScroll = chat.scrollTop;
      snap.chatAtEnd = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 24;
    }
    root.querySelectorAll('input[id], textarea[id], select[id]').forEach(function (el) {
      if (el.type === 'file') return;
      snap.fields[el.id] = {
        value: el.value,
        checked: !!el.checked,
        kind: (el.type === 'checkbox' || el.type === 'radio') ? 'checked' : 'value'
      };
    });
    var active = document.activeElement;
    if (active && root.contains(active) && active.id) {
      snap.focus = active.id;
      if (typeof active.selectionStart === 'number') snap.focusStart = active.selectionStart;
    }
    return snap;
  }
  function restoreAccountUi(snap) {
    if (!snap) return;
    Object.keys(snap.fields || {}).forEach(function (id) {
      var el = document.getElementById(id), saved = snap.fields[id];
      if (!el || el.type === 'file') return;
      if (saved.kind === 'checked') el.checked = saved.checked;
      else el.value = saved.value;
    });
    Object.keys(snap.details || {}).forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.tagName === 'DETAILS') el.open = !!snap.details[id];
    });
    Object.keys(snap.visibility || {}).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = !!snap.visibility[id];
    });
    var main = root.querySelector('.account-main');
    if (main) main.scrollTop = snap.scroll || 0;
    var nav = root.querySelector('.account-nav nav');
    if (nav) nav.scrollLeft = snap.navScroll || 0;
    var chat = document.getElementById('chatFeed');
    if (chat) {
      if (st.chatStick || !snap.chatSeen || snap.chatAtEnd) chat.scrollTop = chat.scrollHeight;
      else chat.scrollTop = snap.chatScroll || 0;
      st.chatStick = false;
    }
    if (window.scrollY !== (snap.windowScroll || 0)) {
      window.scrollTo({ top: snap.windowScroll || 0, behavior: 'auto' });
    }
    if (snap.focus) {
      var focus = document.getElementById(snap.focus);
      if (focus) {
        try {
          focus.focus({ preventScroll: true });
          if (snap.focusStart !== null && focus.setSelectionRange)
            focus.setSelectionRange(snap.focusStart, snap.focusStart);
        } catch (e) {}
      }
    }
  }
  function rerenderHome() {
    var snap = captureAccountUi();
    renderTab();
    restoreAccountUi(snap);
  }

  function loadPlans() {
    S.api.get('/plans').then(function (r) {
      if (r.ok) { st.plans = r; rerenderHome(); }
    });
  }

  function doSubscribe(plan, period, features) {
    if (st.busy) return;
    st.busy = true;
    S.api.post('/subscribe', { plan: plan, period: period, features: features || [] })
      .then(function (r) {
        st.busy = false;
        if (!r.ok) {
          toast(r.error === 'unauthorized' ? 'Войдите через Telegram или почту — подписка привязывается к аккаунту'
            : 'Не получилось оформить — попробуйте ещё раз');
          return;
        }
        /* подписка — не заказ: платёж живёт в карточке «Салон+», список дел не трогаем */
        toast('Оформлено. Остался один перевод — реквизиты в карточке абонемента');
        if (S.stamp) S.stamp('Салон+');
        if (st.me) st.me.sub_pending = r.sub || null;
        st.plusOpen = false;
        rerenderHome();
        scrollToEl('subPaySheet');
      });
  }

  function scrollToEl(id) {
    /* довести взгляд до появившегося блока — на телефоне иначе не видно;
       если блок спрятан в свёрнутой секции, сперва раскрываем её */
    setTimeout(function () {
      var el = document.getElementById(id);
      if (!el) return;
      var d = el.tagName === 'DETAILS' ? el : (el.closest ? el.closest('details') : null);
      if (d && !d.open) d.open = true;
      if (el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  /* -------- действия по оплате подписки (свой контур, не заказ) -------- */
  var SUB_ERR = {
    already_claimed: 'Отметка уже стоит — мастер сверяет поступление',
    nothing_claimed: 'Отметки нет — снимать нечего',
    sub_state: 'Это оформление уже закрыто — выберите план заново',
    sub_active: 'Абонемент уже активен',
    unauthorized: 'Войдите через Telegram или почту',
    not_found: 'Оформление не нашлось — обновите страницу'
  };
  function subAction(id, act) {
    if (st.busy) return;
    st.busy = true;
    S.api.post('/subs/' + id + '/' + act, {}).then(function (r) {
      st.busy = false;
      if (!r.ok) { toast(SUB_ERR[r.error] || 'Не получилось — попробуйте ещё раз'); refreshMe(true); return; }
      if (st.me) st.me.sub_pending = r.sub || null;
      if (act === 'paid') {
        toast('Передали мастеру на сверку — активируем сразу после подтверждения');
        if (S.stamp) S.stamp('На сверке');
      } else if (act === 'unpaid') {
        toast('Отметка снята — без паники');
      } else if (act === 'cancel') {
        toast('Оформление отменено — ничего не списано и не должно');
      }
      rerenderHome();
    });
  }
  function subPayOnline(id) {
    if (st.busy) return;
    st.busy = true;
    S.api.post('/subs/' + id + '/pay', {}).then(function (r) {
      st.busy = false;
      if (!r.ok) { toast('Не получилось открыть оплату — воспользуйтесь реквизитами'); return; }
      if (r.online && r.url) {
        toast('Открываем защищённую страницу оплаты…');
        var w = window.open(r.url, '_blank', 'noopener');
        if (!w) location.href = r.url;
      } else {
        toast('Онлайн-оплата пока не подключена — переведите по реквизитам');
      }
    });
  }

  /* /me заново: карточки бонусов и подписки обновляются реалтаймом
     (активация мастером видна сразу, без перезагрузки страницы) */
  var meSnap = '';
  function meSnapshot(r) {
    try { return JSON.stringify([r.bonus, r.sub, r.sub_pending, r.milestones, r.unread]); }
    catch (e) { return String(Date.now()); }
  }
  function refreshMe(force) {
    if (!S.api.token()) return;
    S.api.get('/me').then(function (r) {
      if (!r.ok) return;
      var hadPending = !!(st.me && st.me.sub_pending);
      var snap = meSnapshot(r);
      var changed = snap !== meSnap;
      meSnap = snap;
      st.me = r;
      if (hadPending && !r.sub_pending && r.sub) {
        toast('Подписка «' + (r.sub.label || 'Салон+') + '» активна — скидка уже работает');
        if (S.stamp) S.stamp('Салон+ активна');
        if (document.hidden) systemNote('АС+', 'Абонемент ' + (r.sub.label || '') + ' активирован');
      }
      if (changed || force) rerenderHome();
    });
  }

  /* ---------------- список и карточка ----------------
     Порядок сам собой: активные дела — на виду, завершённые и отменённые
     складываются в «Архив», отдельные можно скрыть совсем (локально). */
  function isArch(o) { return o.status === 'done' || o.status === 'cancel'; }
  function hiddenIds() { /* локальные скрытия старых версий кабинета */
    var v = S.store.get('salon_hidden_orders', []);
    return Array.isArray(v) ? v : [];
  }
  function isRemoved(o) { return !!o.archived || hiddenIds().indexOf(o.id) >= 0; }
  function visibleOrders() {
    return st.orders.filter(function (o) { return !isRemoved(o); });
  }
  function removedOrders() { return st.orders.filter(isRemoved); }
  function activeOrders() {
    /* закреплённые дела — первыми, дальше свежие сверху (порядок сервера) */
    return visibleOrders().filter(function (o) { return !isArch(o); })
      .sort(function (a, b) { return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0); });
  }
  function archOrders() { return visibleOrders().filter(isArch); }
  function pickDefaultId() {
    var act = activeOrders(), arch = archOrders();
    if (act.length) return act[0].id;
    if (arch.length) return arch[0].id;
    var rem = removedOrders();
    if (rem.length) return rem[0].id;
    return null;
  }

  function needsAction(o) {
    /* дело ждёт решения клиента: оплата, цена или приёмка */
    if (o.paused) return false;
    return o.status === 'prepay' || o.status === 'priced' || o.status === 'check' ||
      (!!(o.part_ready || o.final_ready) && (o.status === 'work' || o.status === 'fix'));
  }

  /* ---------------- Реестр дел: ОДНА карточка на весь кабинет ----------------
     В утверждённом эталоне (style-lab/full → dashboardView) список дел один:
     секция .account-orders с отбором .filter-tabs и сеткой .order-list из
     одинаковых .order-card. Кабинет держал ЧЕТЫРЕ разных списка — на главной
     полноразмерные карточки, а в «Делах», «Сообщениях» и «Документах» три
     почти одинаковых набора компактных корешков. Теперь карточка одна: раздел
     меняет только две справки под шкалой и подпись в подвале. */
  function orderPct(o) {
    if (o.status === 'done') return 100;
    if (o.status === 'cancel' || (o.step || 0) < 0) return 0;
    var total = Math.max(1, o.stages_total || 1);
    var stage = Math.max(1, o.stage || 1);
    return Math.max(8, Math.min(92, Math.round((stage - 0.35) / total * 100)));
  }
  function orderCard(o, mode) {
    var files = (o.files && o.files.length) || o.files_count || 0;
    var unread = o.unread || 0;
    var fresh = o.files_new || 0;
    var facts, foot;
    if (mode === 'messages') {
      facts = [['Непрочитанное', unread
                  ? plural(unread, unread + ' сообщение', unread + ' сообщения', unread + ' сообщений')
                  : 'всё прочитано'],
               ['Файлы от мастерской', fresh
                  ? plural(fresh, fresh + ' новый', fresh + ' новых', fresh + ' новых')
                  : 'без изменений']];
      foot = unread ? 'Ответить мастеру' : 'Открыть переписку';
    } else if (mode === 'documents') {
      facts = [['В деле', files
                  ? plural(files, files + ' файл', files + ' файла', files + ' файлов')
                  : 'файлов пока нет'],
               ['Ближайший срок', o.deadline_text || 'уточняется']];
      foot = fresh ? 'Есть новые файлы' : 'Открыть материалы дела';
    } else {
      /* Статус уже назван меткой в шапке карточки — повторять его строкой
         «Сейчас» было тавтологией. Вместо неё — деньги: единственное, чего
         карточка не показывала, а спрашивают о нём чаще всего. */
      var due = dueOf(o);
      facts = [[due ? 'К оплате' : 'Стоимость',
                 due ? money(due) + ' ₽'
                   : o.price ? money(o.due_total || o.price) + ' ₽' : 'по оценке мастера'],
               ['Ближайший срок', o.deadline_text || 'уточняется']];
      /* подвал называет само действие, а не факт его наличия: три карточки
         с одинаковым «Требуется ваше решение» ничего не сообщали */
      foot = due ? 'Оплатить ' + money(due) + ' ₽'
        : o.status === 'priced' ? 'Ждёт вашего решения'
        : o.status === 'check' ? 'Проверить результат'
        : o.status === 'fix' ? 'Идёт корректировка'
        : o.paused ? 'Снять с паузы'
        : fresh ? 'Новые файлы от мастерской'
        : unread ? 'Ответить мастеру'
        : o.status === 'new' ? 'Мастер оценивает заявку'
        : isArch(o) ? 'Открыть завершённое дело'
        : 'Открыть дело';
    }
    var pct = orderPct(o);
    var attention = !isArch(o) && needsAction(o);
    /* без .is-current: дело больше не раскрывается под списком, подсвечивать
       «выбранную» карточку нечем — в эталоне такого состояния тоже нет */
    return '<button type="button" class="order-card' + (attention ? ' order-card--attention' : '') +
      (isArch(o) ? ' order-card--archived' : '') + '" data-ord="' + o.id +
      '" data-order-status="' + esc(o.status || 'new') + '">' +
      '<div class="order-card__top">' +
      '<span class="tag tag--status tag--' + esc(o.status || 'new') + '">' +
      esc(o.status_label || shortStatus(o) || 'дело') + '</span>' +
      '<span>' + esc(o.no || ('№ ' + o.id)) + '</span></div>' +
      '<h3>' + esc(o.work_label || 'Редакторская работа') + '</h3>' +
      '<div class="order-card__progress" role="img" aria-label="Пройдено по делу: ' + pct +
      ' процентов"><i style="width:' + pct + '%"></i></div>' +
      '<div class="order-card__stage">' + facts.map(function (f) {
        return '<span><small>' + f[0] + '</small><strong>' + esc(f[1]) + '</strong></span>';
      }).join('') + '</div>' +
      '<footer><span>' + esc(foot) + '</span><b aria-hidden="true">→</b></footer></button>';
  }

  /* отбор реестра — три чипа эталона (.filter-tabs--small) */
  function registerFilters() {
    return '<div class="filter-tabs filter-tabs--small" role="group" aria-label="Отбор дел">' +
      [['all', 'Все'], ['active', 'Активные'], ['done', 'Завершённые']].map(function (f) {
        var on = st.filter === f[0];
        return '<button type="button" class="' + (on ? 'is-active' : '') +
          '" data-order-filter="' + f[0] + '" aria-pressed="' + on + '">' + f[1] + '</button>';
      }).join('') + '</div>';
  }
  function filteredOrders() {
    var vis = visibleOrders();
    var pool = st.filter === 'active' ? vis.filter(function (o) { return !isArch(o); })
      : st.filter === 'done' ? vis.filter(isArch) : vis;
    return st.remOpen ? pool.concat(removedOrders()) : pool;
  }

  function registerGroups(list, mode) {
    var waiting = list.filter(function (o) { return !isArch(o) && needsAction(o); });
    var working = list.filter(function (o) { return !isArch(o) && !needsAction(o); });
    var closed = list.filter(isArch);
    var groups = [];
    function add(key, title, note, rows) {
      if (!rows.length) return;
      groups.push('<section class="account-order-group account-order-group--' + key + '">' +
        '<header><div><h3>' + title + '</h3><p>' + note + '</p></div>' +
        '<span>' + rows.length + '</span></header>' +
        '<div class="order-list">' + rows.map(function (o) { return orderCard(o, mode); }).join('') +
        '</div></section>');
    }
    add('waiting', 'Ждут вас', 'оплата, согласование или проверка результата', waiting);
    add('working', 'В работе', 'мастерская ведёт дело — срочных действий нет', working);
    add('closed', 'Завершены', 'результаты и история остаются доступными', closed);
    return groups.join('');
  }

  /* реестр: заголовок с отбором, сетка карточек, тихая приписка о скрытых пулах */
  function ordersRegister(mode, compact) {
    var title = mode === 'messages' ? 'Сообщения по делам'
      : mode === 'documents' ? 'Документы по делам' : 'Ваши дела';
    var list = filteredOrders();
    var totalBeforeLimit = list.length;
    if (compact) {
      list = activeOrders();
      if (!list.length) list = archOrders().slice(0, 1);
      totalBeforeLimit = list.length;
      list = list.slice(0, 3);
    }
    if (mode === 'messages') {
      list = list.slice().sort(function (a, b) {
        return ((b.unread || 0) + (b.files_new || 0)) - ((a.unread || 0) + (a.files_new || 0));
      });
    }
    var arch = visibleOrders().filter(isArch), rem = removedOrders();
    var notes = [];
    if (arch.length && st.filter !== 'done')
      notes.push('Завершённых дел: ' + arch.length +
        ' · <button type="button" class="line-link" data-arch-toggle aria-expanded="' +
        !!st.archOpen + '">' + (st.archOpen ? 'вернуться ко всем' : 'показать только их') + '</button>');
    if (rem.length)
      notes.push('Убранных в архив: ' + rem.length +
        ' · <button type="button" class="line-link" data-rem-toggle aria-expanded="' +
        !!st.remOpen + '">' + (st.remOpen ? 'спрятать снова' : 'показать в списке') + '</button>');
    var empty = mode === 'messages' ? 'В этом отборе переписок нет — смените отбор дел выше.'
      : mode === 'documents' ? 'В этом отборе материалов нет — смените отбор дел выше.'
      : 'В этом отборе дел нет — смените отбор выше.';
    var registerBody = compact
      ? '<div class="order-list">' + list.map(function (o) { return orderCard(o, mode); }).join('') + '</div>'
      : registerGroups(list, mode);
    return '<section class="account-orders account-orders--all' +
      (!compact ? ' account-orders--registry' : '') +
      (compact ? ' account-orders--home' : '') + ' reveal">' +
      '<header><div><p class="eyebrow">' + (compact ? 'Работа мастерской' : 'Картотека') +
      '</p><h2>' + title + '</h2></div>' +
      (compact
        ? '<button type="button" class="line-link" data-tab="orders">Открыть картотеку' +
          (totalBeforeLimit > list.length ? ' · ' + totalBeforeLimit : '') + ' <span aria-hidden="true">→</span></button>'
        : registerFilters()) + '</header>' +
      (list.length
        ? registerBody
        : '<div class="account-empty"><p>' + empty + '</p></div>') +
      (!compact && notes.length ? '<p class="account-note account-note--row">' + notes.join(' · ') + '</p>' : '') +
      '</section>';
  }
  function shortWork(o) {
    var w = o.work_label || '';
    return w.length > 24 ? w.slice(0, 23) + '…' : w;
  }
  function shortStatus(o) {
    if (o.paused && o.status !== 'done' && o.status !== 'cancel') return 'на паузе';
    return { new: 'на оценке', priced: 'ждёт решения', prepay: 'ждёт оплату', work: 'исполнение',
             check: 'результат на проверке', fix: 'корректировка', done: 'результат принят', cancel: 'закрыт' }[o.status] || '';
  }

  /* -------- шкалы эталона: готовность этапов и закрытая часть денег --------
     Ширина задаётся классом кратно 5 %, а не style="width:…": инлайновых
     стилей в раскрытии дела не бывает. Цифра — честная (этап N из M). */
  function pctBucket(n) {
    return 'p' + Math.round(Math.max(0, Math.min(100, n)) / 5) * 5;
  }
  function caseProgress(o) {
    if (!o.steps || !o.steps.length || o.step < 1) return '';
    var pct = o.status === 'done'
      ? 100
      : Math.max(5, Math.min(95, Math.round((o.step - 0.35) / o.steps.length * 100)));
    /* дробь «N из M» стоит в шапке разворота — здесь та же величина долей,
       без тавтологии: рядом со шкалой уместен процент, как в эталоне */
    return '<div class="case-progress-meta"><span>Готовность дела</span>' +
      '<strong>' + pct + ' %</strong></div>' +
      '<div class="case-progress" role="img" aria-label="Пройдено этапов: ' +
      o.step + ' из ' + o.steps.length + '"><i class="' + pctBucket(pct) + '"></i></div>';
  }
  function payScale(o) {
    var total = o.due_total || o.price || 0;
    var paid = (o.payments || []).filter(function (p) { return p.status === 'paid'; })
      .reduce(function (s, p) { return s + (p.amount || 0); }, 0);
    if (!total || !paid) return '';
    var pct = Math.max(3, Math.min(100, Math.round(paid / total * 100)));
    return '<strong class="case-paid">Оплачено ' + money(paid) + ' ₽ из ' + money(total) + ' ₽</strong>' +
      '<div class="case-paid-scale" role="img" aria-label="Оплачено ' + pct +
      ' процентов"><i class="' + pctBucket(pct) + '"></i></div>';
  }

  /* -------- разворот эталона: текущий этап одним листом --------
     .case-overview из caseView: надзаголовок «Текущий этап», название этапа,
     серифная дробь «N из M», шкала готовности и три справки в одну линейку.
     Раньше шкала висела голой строкой между шапкой и составом заказа. */
  function caseOverview(o) {
    var steps = o.steps || [];
    if (o.step < 0 || !steps.length) return '';
    var stepName = steps[Math.max(0, Math.min(steps.length - 1, o.step - 1))] || '';
    var total = o.stages_total || 1;
    var next = {
      new: 'Оценка мастера',
      priced: 'Ваше решение по цене',
      prepay: 'Оплата первого этапа',
      work: 'Работа мастерской',
      fix: 'Корректировка мастером',
      check: 'Ваша приёмка результата',
      done: 'Дело завершено',
      cancel: 'Дело закрыто'
    }[o.status] || 'Уточняется';
    if (o.paused && o.status !== 'done' && o.status !== 'cancel') next = 'Снять дело с паузы';
    /* Чей сейчас ход — главный вопрос, с которым сюда заходят. Раньше на него
       отвечала только строка «Следующее действие», из которой не читалось,
       ждут ли чего-то от человека или работа идёт своим ходом. */
    var yours = o.paused
      ? false
      : ('priced prepay check'.indexOf(o.status) >= 0) ||
        !!(o.due_now && o.due_now.amount > 0);
    var facts = [
      ['Результат', o.deadline_text || 'срок уточняется'],
      [total > 1 ? 'Часть' : 'Позиций в деле',
        total > 1 ? (o.stage || 1) + ' из ' + total
          : String((o.specification_lines || o.items || []).length || 1)],
      ['Следующее действие', next]
    ];
    /* что именно от вас нужно — из состояния дела, а не из названия
       следующего этапа: иначе «ваш ход» соседствует с «работой мастерской» */
    var due = o.due_now && o.due_now.amount ? o.due_now.amount : 0;
    var ask;
    if (due > 0) {
      ask = 'Оплатить ' + (o.due_now.label ? o.due_now.label.toLowerCase() : 'текущий этап') +
        ' — ' + money(due) + ' ₽. Раздел «Оплата»: карта или перевод по реквизитам.';
    } else if (o.status === 'priced') {
      ask = 'Посмотреть расчёт и принять цену — или обсудить её с мастером в переписке.';
    } else if (o.status === 'prepay') {
      ask = 'Оплатить первый этап, чтобы мастер приступил к работе.';
    } else if (o.status === 'check') {
      ask = 'Проверить результат: принять его или запросить корректировку с указанием, что не так.';
    } else {
      ask = 'Решение по делу ждёт вас ниже.';
    }
    var turn = '<p class="case-turn' + (yours ? ' case-turn--yours' : '') + '">' +
      '<span class="case-turn__who">' +
      (o.paused ? 'Дело на паузе'
        : yours ? 'Сейчас ваш ход' : 'Сейчас работает мастерская') + '</span>' +
      '<span class="case-turn__what">' +
      (o.paused ? 'Пока дело на паузе, мастер к нему не возвращается. Снять паузу можно в разделе «Условия».'
        : yours ? ask
        : esc(next) + '. От вас сейчас ничего не требуется — напишем, когда будет результат.') +
      '</span></p>';
    /* закрытая часть денег переехала сюда из отдельного листа правой стойки:
       та же шкала повторяла блок оплаты целиком и стоила ещё один экран */
    var paid = payScale(o);
    return '<div class="fs-sec case-sec case-overview">' +
      '<header><div><p class="eyebrow">Текущий этап</p><h3>' + esc(stepName) + '</h3></div>' +
      '<strong class="case-overview__count"><small>Этапы</small>' + o.step + ' из ' + steps.length +
      '</strong></header>' + turn + caseProgress(o) +
      '<div class="case-overview__facts">' + facts.map(function (f) {
        return '<span><small>' + f[0] + '</small><strong>' + esc(f[1]) + '</strong></span>';
      }).join('') + '</div>' +
      (paid ? '<div class="case-overview__paid">' + paid + '</div>' : '') + '</div>';
  }

  /* Поддержка в деле — служебная строка, а не ещё один большой лист:
     она остаётся доступной, но не отталкивает рабочее содержимое вниз. */
  function caseSupport(o) {
    return '<section class="case-support case-support--compact">' +
      '<span class="case-support__mark" aria-hidden="true">?</span>' +
      '<div><strong>Вопрос по делу?</strong>' +
      '<p>Мастер уже видит номер ' + esc(o.no) + ' и весь контекст.</p></div>' +
      '<div class="case-support__actions"><button type="button" class="line-link" data-chat-focus>' +
      'Написать мастеру <span aria-hidden="true">→</span></button>' +
      '<button type="button" class="line-link" data-tab="help">Другие способы</button></div></section>';
  }

  /* Полная история всегда раскрывается по запросу. Текущий этап и прогресс уже
     видны в обзоре, поэтому автоматическое раскрытие только удлиняло экран. */
  function stageFold(o) {
    if (o.step < 0) return stageRows(o); /* закрытая заявка — короткая заметка */
    var open = false;
    var meta = 'этап ' + o.step + ' из ' + o.steps.length +
      ((o.stages_total || 1) > 1 ? ' · частей: ' + o.stages_total : '');
    return fold('secStages', 'Ход дела', meta, stageRows(o), open);
  }

  function stageRows(o) {
    if (o.step < 0) {
      return '<div class="fs-sec case-sec">' +
        '<header><h3>Ход дела</h3><span class="case-sec__note">заявка закрыта</span></header>' +
        '<p class="case-sec__lead">Заявка закрыта' +
        (o.cancel_reason ? ' (причина: ' + esc(o.cancel_reason) + ')' : '') +
        '. Передумали? Нажмите «Возобновить заказ» ниже — мастер вернётся к вашей заявке, ' +
        'условия можно обсудить заново.</p></div>';
    }
    var NOW = {
      new: 'Мастер изучает заявку — ответ обычно за 15–30 минут в рабочее время',
      priced: 'Предложение готово — решение за вами (кнопки ниже)',
      prepay: 'Ожидаем оплату — реквизиты и кнопки в блоке «Оплата» ниже',
      work: 'Исполняются позиции спецификации; вопросы можно задать в чате',
      fix: 'Выполняется корректировка результата по вашим замечаниям и критериям позиции',
      check: 'Результат передан: сверьте его с критериями позиции, примите или запросите корректировку',
      done: 'Результат принят, заказ и акт приёмки зафиксированы'
    };
    /* не обещаем реквизиты, которых нет: без созревшего платежа и отметки —
       честное «счёт готовится» (бывает при ручной смене статуса без цены) */
    if (o.status === 'prepay' && !(o.due_now && o.due_now.amount) && !o.claimed)
      NOW.prepay = 'Мастер готовит счёт — оплата появится здесь, мы уведомим';
    return '<ol class="case-timeline__list">' +
      o.steps.map(function (name, i) {
        var n = i + 1;
        var cls = n < o.step ? ' is-past' : n === o.step ? ' is-current' : '';
        /* только цифры: ✓ нет ни в одном подмножестве (fonts.css), а
           состояние и без него читается подписью и рамкой медальона */
        var sn = n < 10 ? '0' + n : String(n);
        var tag = n < o.step ? 'пройден' : n === o.step ? 'сейчас' : 'впереди';
        var now = n === o.step ? '<p>' + esc(NOW[o.status] || o.status_label) + '</p>' : '';
        return '<li class="' + cls + '"><span class="case-timeline__mark">' + sn + '</span>' +
          '<div><small>' + tag + '</small><h4>' + esc(name) + '</h4>' + now + '</div></li>';
      }).join('') + '</ol>' + partsRows(o);
  }

  /* -------- передача по частям: где мы в 2 или 3 выдачах -------- */
  function partsRows(o) {
    var total = o.stages_total || 1;
    if (total < 2 || !('work check fix done'.indexOf(o.status) + 1)) return '';
    var rows = '';
    for (var n = 1; n <= total; n++) {
      var state, tag;
      if (o.status === 'done' || n <= (o.parts_done || 0)) { state = 'past'; tag = 'принята'; }
      else if (n === o.stage) {
        state = 'now';
        tag = o.status === 'check' ? 'на вашей проверке'
            : o.status === 'fix' ? 'в правках'
            : (o.part_ready === n ? 'результат подготовлен — ждёт оплату этапа' : 'исполнение');
      } else { state = ''; tag = 'впереди'; }
      rows += '<li class="' + (state === 'past' ? 'is-past' : state === 'now' ? 'is-current' : '') + '">' +
        '<span class="case-timeline__mark">§' + n + '</span>' +
        '<div><small>' + tag + '</small><h4>Часть ' + n + ' из ' + total + '</h4>' +
        (n === o.stage && o.status === 'check' ? '<p>Сверьте результат с критериями: принять или запросить корректировку — кнопки ниже</p>' : '') +
        '</div></li>';
    }
    return '<section class="case-subsec">' +
      '<header><h4>Передача и приёмка по частям</h4>' +
      '<span class="case-sec__note">условия проверки — отдельно для каждой позиции</span></header>' +
      '<ol class="case-timeline__list">' + rows + '</ol></section>';
  }

  function specLink(o) {
    if (!o.price) return '';
    return '<p class="case-note"><a class="link" href="#" ' +
      'data-protected-asset="' + apiPath(o.id, '/contract') + '" data-order-id="' + o.id + '" data-open="1">' +
      'Спецификация заказа (PDF)</a> — один документ со всеми позициями: у каждой отдельно указаны результат, исходник, включения и исключения, критерии приёмки, срок, цена, платежи и порядок корректировок. Действует вместе с <a class="link" href="oferta.html">офертой</a>, ' +
      'подписывать ничего не нужно. <a class="link" href="specifikaciya.html" target="_blank" rel="noopener">Что это такое — простыми словами →</a></p>' + pamyatkaLink(o);
  }

  /* персональная памятка «что дальше» — появляется с передачей финала */
  function pamyatkaLink(o) {
    if (!o.pamyatka) return '';
    return '<p class="case-note"><a class="link" href="#" ' +
      'data-protected-asset="' + apiPath(o.id, '/pamyatka') + '" data-order-id="' + o.id + '" data-open="1">' +
      'Памятка «что дальше» (PDF)</a> — порядок первичной проверки, фиксация замечаний по критериям и самостоятельная подготовка клиента к использованию результата.</p>';
  }

  function priceBlock(o) {
    if (o.price) {
      var discounted = o.bonus_spent || o.sub_discount || o.promo_discount || o.gift_amount;
      var out = '<div class="fs-sec case-sec case-money">' +
        '<header><div><p class="eyebrow">Цена мастера</p><h3>Расчёт по делу</h3></div>' +
        '<strong class="case-sum">' + money(discounted ? o.due_total : o.price) + ' ₽</strong></header>' +
        specLink(o);
      if (discounted) {
        out += '<dl class="case-ledger">' +
          '<div><dt>Цена заказа</dt><dd>' + money(o.price) + ' ₽</dd></div>' +
          (o.sub_discount ? '<div><dt>Скидка «Салон+»</dt><dd class="is-minus">−' + money(o.sub_discount) + ' ₽</dd></div>' : '') +
          (o.promo_discount ? '<div><dt>Промокод' + (o.promo_code ? ' ' + esc(o.promo_code) : '') + '</dt><dd class="is-minus">−' + money(o.promo_discount) + ' ₽</dd></div>' : '') +
          (o.bonus_spent ? '<div><dt>Оплачено бонусами</dt><dd class="is-minus">−' + money(o.bonus_spent) + ' ₽</dd></div>' : '') +
          (o.gift_amount ? '<div><dt>Сертификат' + (o.gift_code ? ' ' + esc(o.gift_code) : '') + '</dt><dd class="is-minus">−' + money(o.gift_amount) + ' ₽</dd></div>' : '') +
          '<div class="is-total"><dt>К оплате деньгами</dt><dd>' + money(o.due_total) + ' ₽</dd></div>' +
          '</dl>' +
          (o.bonus_spent && (o.status === 'priced' || o.status === 'prepay')
            ? '<p class="case-note"><button type="button" class="line-link" data-act="bonus_cancel">Вернуть бонусы на счёт <span aria-hidden="true">←</span></button></p>' : '') +
          (o.gift_amount && (o.status === 'priced' || o.status === 'prepay') && !(o.payments || []).some(function (p) { return p.status === 'paid'; })
            ? '<p class="case-note"><button type="button" class="line-link" data-act="gift_remove">Открепить сертификат <span aria-hidden="true">←</span></button></p>' : '');
      }
      return out + planTable(o) + '</div>' + bonusSpendFold(o) + giftFold(o) + subUpsell(o);
    }
    if (o.quote_low) {
      return '<div class="fs-sec case-sec case-money">' +
        '<header><div><p class="eyebrow">Вилка сметы</p><h3>Предварительная оценка</h3></div>' +
        '<strong class="case-sum">' + money(o.quote_low) + ' – ' + money(o.quote_high) + ' ₽</strong></header>' +
        '<p class="case-sec__lead">Точную цену мастер назовёт после разбора заявки — уведомим прямо здесь' +
        (S.api.token() ? ' и в Telegram' : '') + '.</p></div>' + giftFold(o);
    }
    return giftFold(o);
  }

  function itemQuote(item) {
    var amount = item.price && item.price.amount != null ? item.price.amount
      : (item.price_amount != null ? item.price_amount : null);
    var low = amount != null ? amount : (item.final_price || item.quote_low || item.a || 0);
    var high = amount != null ? amount : (item.final_price || item.quote_high || low);
    if (!low) return '';
    return low === high ? money(low) + ' ₽' : money(low) + '–' + money(high) + ' ₽';
  }

  function orderItemsBlock(o) {
    var items = o.specification_lines ||
      (o.specification && o.specification.lines) ||
      (o.offer && o.offer.specification_lines) ||
      (o.offer && o.offer.specification && o.offer.specification.lines) ||
      o.items || [];
    if (!items.length) return '';
    var isSpecification = !!(o.specification_lines ||
      (o.specification && o.specification.lines) ||
      (o.offer && o.offer.specification_lines) ||
      (o.offer && o.offer.specification && o.offer.specification.lines));
    var byParent = {};
    items.forEach(function (item) {
      var key = item.parent_client_id || '';
      (byParent[key] || (byParent[key] = [])).push(item);
    });
    function values(v) {
      if (Array.isArray(v)) return v.filter(Boolean).map(String);
      return v == null || v === '' ? [] : [String(v)];
    }
    function fact(facts, label, value) {
      var list = values(value);
      if (list.length) facts.push('<b>' + esc(label) + ':</b> ' + list.map(esc).join(' · '));
    }
    function row(item, child) {
      var facts = [];
      var input = item.input || {};
      var deadline = item.deadline || {};
      var correction = item.correction_window || {};
      if ((item.qty || 1) > 1) facts.push('× ' + item.qty);
      fact(facts, 'Тип договора', item.contract_contour);
      fact(facts, 'Разрешённая цель', item.permitted_purpose);
      fact(facts, 'Результат', item.deliverable || item.result);
      fact(facts, 'Исходник', input.description || item.input_description);
      fact(facts, 'Версия', input.version || item.input_version);
      fact(facts, 'Включено', item.inclusions);
      fact(facts, 'Не включено', item.exclusions);
      fact(facts, 'Критерии приёмки', item.acceptance_criteria);
      fact(facts, 'Срок результата', deadline.text || item.deadline_text);
      fact(facts, 'Зависимости', item.dependencies);
      fact(facts, 'Платежи по позиции', item.payment_allocation);
      if (correction.days != null || item.correction_window_days != null || item.iterations != null) {
        var days = correction.days != null ? correction.days : item.correction_window_days;
        fact(facts, 'Проверка и корректировки',
          (days != null ? days + ' дн. первичной проверки' : '') +
          (item.iterations != null ? ' · добровольных итераций: ' + item.iterations : '') +
          (correction.scope ? ' · ' + correction.scope : ''));
      }
      fact(facts, 'Фактический автор', item.actual_author);
      fact(facts, 'Режим прав', item.rights_mode);
      fact(facts, 'Третьи лица', item.third_party_performers);
      if (item.acceptance)
        fact(facts, 'Приёмка позиции', [item.acceptance.status, item.acceptance.act].filter(Boolean).join(' · '));
      if (item.topic) fact(facts, 'Тема', item.topic);
      var label = item.position_label || item.label || item.t || '';
      var pos = item.position || item.id || '•';
      return '<div class="case-spec__row' + (child ? ' is-child' : '') + '">' +
        '<span class="case-spec__no">' + (child ? '—' : esc(String(pos).padStart(2, '0'))) + '</span>' +
        '<span class="case-spec__main"><b>' + esc(label) + '</b>' +
        (facts.length ? '<details class="case-spec__terms"><summary>' +
          '<span class="case-spec__shut">условия позиции</span>' +
          '<span class="case-spec__open">свернуть условия</span></summary>' +
          '<small>' + facts.join('<br>') + '</small></details>' : '') + '</span>' +
        '<span class="case-spec__price">' + itemQuote(item) + '</span></div>';
    }
    var linked = {};
    var html = '';
    if (isSpecification) {
      items.forEach(function (item) { html += row(item, false); });
    } else {
      items.filter(function (item) { return item.kind === 'work'; }).forEach(function (work) {
        html += row(work, false);
        (byParent[work.client_id] || []).forEach(function (service) {
          linked[service.id] = true;
          html += row(service, true);
        });
      });
      items.filter(function (item) {
        return item.kind !== 'work' && !linked[item.id];
      }).forEach(function (service) { html += row(service, false); });
    }
    return '<section class="fs-sec case-sec case-spec" aria-label="Спецификация заказа">' +
      '<header><div><p class="eyebrow">Один документ</p><h3>Спецификация заказа</h3></div>' +
      '<span class="case-sec__note">' + items.length + ' ' +
      plural(items.length, 'позиция', 'позиции', 'позиций') + '</span></header>' +
      '<p class="case-sec__lead">Каждая позиция имеет собственные результат, критерии, срок, цену и акт приёмки.</p>' +
      '<div class="case-spec__list">' + html + '</div></section>';
  }

  /* -------- подарочный сертификат в деле: привязать код / показать привязку.
     Средство платежа, не скидка: зачёт считает сервер при цене -------- */
  function giftFold(o) {
    if (/^sub_/.test(o.work_type || '')) return '';
    if (!(o.status === 'new' || o.status === 'priced' || o.status === 'prepay')) return '';
    var paidAlready = (o.payments || []).some(function (p) { return p.status === 'paid'; });
    if (o.gift_code && !o.gift_amount) {
      /* код привязан, цены ещё нет — покажем строку ожидания */
      return fold('secGift', 'Сертификат', esc(o.gift_code),
        '<p class="account-note">Код <span class="account-code">' + esc(o.gift_code) + '</span> привязан — ' +
        'сумма зачтётся, когда мастер назовёт цену.' +
        (paidAlready ? '' : ' <button type="button" class="line-link" data-act="gift_remove">Открепить</button>') +
        '</p>', false);
    }
    if (o.gift_code || paidAlready) return '';
    var inner = '<div class="account-panel" id="gattBox">' +
      '<p class="account-note">Есть подарочный сертификат? Привяжите код — сумма спишется с итога' +
      (o.price ? ' сразу' : ', когда мастер назовёт цену') + '. Остаток сохранится на коде.</p>' +
      '<div class="account-form-row"><input class="account-input account-input--code" type="text" id="gattCode" maxlength="24" autocomplete="off" aria-label="Код подарочного сертификата" placeholder="AS-XXXX-XXXX-XXXX">' +
      '<button type="button" class="button button--secondary" id="gattApply">Применить</button></div></div>';
    return fold('secGift', 'Сертификат', 'применить код к делу', inner, false);
  }

  /* -------- план оплат: этапы 50/50 или 30/40/30, статус каждого -------- */
  var PLAN_ST = {
    paid: ['оплачен', 's-done'], claimed: ['на сверке у мастера', 's-act'],
    due: ['к оплате сейчас', 's-due'], later: ['после готовности следующей части', '']
  };
  function planTable(o) {
    var plan = o.plan || [];
    if (plan.length < 2) {
      if (o.prepay && (o.status === 'priced' || o.status === 'prepay') && !o.bonus_spent)
        return '<p class="case-note">Первый платёж — ' + money(o.prepay_due || o.prepay) + ' ₽, остальное по плану после передачи результата этапа.</p>';
      return '';
    }
    return '<p class="case-sub">План оплаты — по этапам</p>' +
      '<dl class="case-ledger case-ledger--plan">' +
      plan.map(function (p) {
        var m = PLAN_ST[p.state] || ['', ''];
        return '<div><dt><i>' + p.n + '</i>' + esc(p.label) +
          (m[0] ? '<small class="' + m[1] + '">' + m[0] + '</small>' : '') + '</dt>' +
          '<dd>' + money(p.amount) + ' ₽</dd></div>';
      }).join('') + '</dl>';
  }

  /* -------- списание бонусов: один раз на заказ, до первой оплаты.
     Свёрнуто в строку — раскрывается только тем, кому это нужно -------- */
  function bonusSpendFold(o) {
    var inner = bonusSpendBlock(o);
    if (!inner) return '';
    var limit = Math.min((o.bonus && o.bonus.balance) || 0, o.bonus_cap || 0);
    return fold('secBonus', 'Списать бонусы', 'до −' + money(limit) + ' ₽ с этого заказа', inner, false);
  }

  function bonusSpendBlock(o) {
    if (!o.bonus || !(o.status === 'priced' || o.status === 'prepay')) return '';
    var paidAlready = (o.payments || []).some(function (p) { return p.status === 'paid'; });
    if (paidAlready) return '';
    if ((o.bonus_spent || 0) > 0) return ''; /* уже применены — есть «вернуть бонусы» */
    var limit = Math.min(o.bonus.balance || 0, o.bonus_cap || 0);
    if (limit <= 0) return '';
    return '<div class="account-panel" id="bspendBox">' +
      '<header><span>Списать бонусы</span>' +
      '<b class="account-slider__val" id="bspendVal">' + money(limit) + '</b></header>' +
      '<p class="account-note">На счету ' + money(o.bonus.balance) + ' — к этому заказу можно применить до ' + money(limit) + '.</p>' +
      '<input type="range" class="account-slider" id="bspendRange" min="0" max="' + limit + '" step="50" value="' + limit + '" aria-label="Сколько бонусов списать">' +
      '<p class="account-note">Списание — один раз, до оплаты. Деньгами останется ' +
      '<b id="bspendDue">' + money((o.due_total || o.price) - limit) + ' ₽</b>.</p>' +
      '<div class="case-acts">' +
      '<button type="button" class="button button--secondary" id="bspendApply">Применить</button></div>' +
      '</div>';
  }

  /* -------- купон «Салон+» в деле: честная выгода, один тихий талон --------
     Показывается только там, где подписка реально сэкономит: цена названа,
     оплат ещё не было. После активации скидка пересчитает ЭТОТ заказ сама. */
  function subUpsell(o) {
    if (!S.api.token() || !st.me) return '';
    if (st.me.sub || st.me.sub_pending) return '';
    if (o.sub_discount || /^sub_/.test(o.work_type || '')) return '';
    if (!(o.status === 'priced' || o.status === 'prepay')) return '';
    if ((o.price || 0) < 3000) return '';
    if ((o.payments || []).some(function (p) { return p.status === 'paid'; })) return '';
    var save = Math.min(Math.round(o.price * 0.10), 3000);
    /* один тихий талон-строка: без карточек и простыней в середине дела */
    return '<div class="account-notice reveal">' +
      '<span class="account-notice__mark" aria-hidden="true">АС+</span>' +
      '<div><strong>С абонементом «Салон+» этот заказ — до −' + money(save) + ' ₽</strong>' +
      '<p>Скидка применяется к уже названной цене, от 449 ₽ за 30 дней.</p></div>' +
      '<span class="account-notice__acts">' +
      '<button type="button" class="line-link" data-open-plus>Подключить <span aria-hidden="true">→</span></button></span></div>';
  }

  function payHistory(o) {
    var paid = (o.payments || []).filter(function (p) { return p.status === 'paid'; });
    if (!paid.length) return '';
    var lbl = {};
    (o.plan || []).forEach(function (p) { lbl[p.kind] = p.label; });
    return '<p class="case-sub">Оплачено</p>' +
      '<dl class="case-ledger case-ledger--paid">' +
      paid.map(function (p) {
      var what = lbl[p.kind] || (p.kind === 'prepay' ? 'предоплата' : 'остаток');
      var confirmation = p.confirmation_url
        ? '<a class="line-link" href="#" data-protected-asset="' +
          apiPath(o.id, '/payments/' + p.id + '/confirmation.pdf') +
          '" data-order-id="' + o.id + '" data-filename="podtverzhdenie-oplaty-' +
          o.id + '-' + p.id + '.pdf">Подтверждение <span aria-hidden="true">→</span></a>'
        : '';
      return '<div><dt>' + esc(what.toLowerCase()) + '<small>' + dt(p.at) + '</small>' +
        confirmation + '</dt><dd>' + money(p.amount) + ' ₽</dd></div>';
    }).join('') + '</dl>' +
      '<p class="case-note">Официальный чек НПД формирует Robokassa ' +
      'и отправляет на почту, указанную при оплате. Подтверждение выше не заменяет налоговый чек.</p>';
  }

  /* -------- реквизиты: платёжный лист с крупной суммой и копированием --------
     Текст реквизитов свободный (мастер пишет как удобно) — карту и телефон
     находим сами и даём скопировать в одно касание. */
  function reqRows(req) {
    var lines = String(req).split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean);
    return lines.map(function (line) {
      var copyVal = null, isCard = false, shown = line;
      var mCard = line.match(/\d(?:[\s-]?\d){15,18}/);
      if (mCard && mCard[0].replace(/\D/g, '').length >= 16) {
        var digits = mCard[0].replace(/\D/g, '');
        copyVal = digits;
        isCard = true;
        shown = line.replace(mCard[0], digits.replace(/(\d{4})(?=\d)/g, '$1 '));
      } else {
        var mPhone = line.match(/(?:\+7|\b8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/);
        if (mPhone) copyVal = mPhone[0].replace(/[^\d+]/g, '');
      }
      return '<div class="ps-row' + (isCard ? ' ps-card' : '') + '">' +
        '<span class="ps-val' + (isCard ? ' mono' : '') + '">' + esc(shown) + '</span>' +
        (copyVal ? '<button type="button" class="ps-copy" data-copy="' + esc(copyVal) +
          '" title="Скопировать">копировать</button>' : '') +
        '</div>';
    }).join('');
  }
  function paySlip(o, due) {
    return '<p class="case-sub">Реквизиты для перевода</p>' +
      '<div class="pay-requisites">' + reqRows(o.requisites) + '</div>' +
      '<div class="account-steps">' +
        '<span><b>1</b><span>переведите ' + (due ? money(due) + ' ₽' : 'сумму') + '</span></span>' +
        '<span><b>2</b><span>нажмите «Я оплатил(а)»</span></span>' +
        '<span><b>3</b><span>приложите подтверждение — сверка быстрее</span></span></div>';
  }

  function payWorkspace(main, history, state) {
    return '<div class="case-pay__workspace case-pay__workspace--' + state + '">' +
      '<div class="case-pay__main">' + main + '</div>' +
      (history ? '<aside class="case-pay__history" aria-label="История платежей">' + history + '</aside>' : '') +
      '</div>';
  }

  function payBlock(o) {
    /* блок оплаты: только когда реально есть что платить (или отметка на сверке) —
       во время работы над частью клиента не дёргаем кнопками оплаты */
    var due = o.due_now && o.due_now.amount ? o.due_now.amount : 0;
    var wantPay = due > 0;
    var history = payHistory(o);
    if (!wantPay && !o.claimed) return history ? '<div class="fs-sec case-sec case-pay case-pay--settled" id="secPay">' +
      '<header><div><p class="eyebrow">Оплата</p><h3>По делу всё спокойно</h3></div>' +
      '<span class="case-pay__state"><i aria-hidden="true">✓</i> к оплате сейчас: 0 ₽</span></header>' +
      payWorkspace('<div class="case-pay__settled"><span aria-hidden="true">₽</span>' +
        '<div><strong>Текущий этап оплачен</strong><p>Новый платёж появится только после готовности следующего результата.</p></div></div>',
        history, 'settled') + '</div>' : '';
    var head = '<div class="fs-sec case-sec case-pay case-pay--active" id="secPay">' +
      '<header><div><p class="eyebrow">Оплата</p><h3>' +
      esc((o.due_now && o.due_now.label) || 'Платёж по делу') + '</h3></div>' +
      (due ? '<strong class="case-sum">' + money(due) + ' ₽</strong>' : '') + '</header>';
    if (o.claimed) {
      var claimedMain =
        '<div class="account-notice"><span class="account-notice__mark" aria-hidden="true">₽</span>' +
        '<div><strong>Отметка «оплатил» у мастера</strong>' +
        '<p>Мастер сверяет поступление — как подтвердит, заказ двинется дальше и придёт уведомление. ' +
        'Подтверждение перевода ускорит сверку.</p></div></div>' +
        '<div class="case-acts case-pay__actions">' +
        '<label class="btn btn-line case-upload">Приложить подтверждение перевода<input type="file" id="cabReceipt" hidden accept="image/*,.pdf"></label>' +
        '<button type="button" class="btn btn-line" data-act="paid_undo">Я ещё не оплатил — снять отметку</button></div>' +
        '<p class="case-pay__help"><button type="button" class="line-link" data-chat-focus>' +
        'Задать вопрос по оплате <span aria-hidden="true">→</span></button></p>';
      return head + payWorkspace(claimedMain, history, 'checking') + '</div>';
    }
    var req = o.requisites
      ? paySlip(o, due)
      : (o.pay_online ? '' : '<p class="case-sec__lead">Реквизиты пришлём в чат ниже (и в Telegram) в течение пары минут.</p>');
    var depBal = (st.me && st.me.deposit && st.me.deposit.balance) || 0;
    var depDue = (o.due_now && o.due_now.amount) || 0;
    var depBtn = depBal >= depDue && depDue > 0;
    var receiptEmail = esc(o.receipt_email || '');
    var receiptField = o.pay_online
      ? '<label class="case-field"><span class="case-field__label">Почта для официального чека НПД</span>' +
        '<input class="account-input" type="email" id="payReceiptEmail" autocomplete="email" inputmode="email" ' +
        'placeholder="pochta@example.ru" value="' + receiptEmail + '" required>' +
        '<span class="case-field__hint">Передадим только Robokassa для чека и уведомления об оплате.</span></label>'
      : '';
    var payBtns = '<div class="case-acts case-pay__actions">' +
      (depBtn ? '<button type="button" class="btn btn-wax" data-act-pay-dep>С депозита — ' + money(depDue) + ' ₽</button>' : '') +
      (o.pay_online ? '<button type="button" class="btn ' + (depBtn ? 'btn-line' : 'btn-wax') + '" data-act-pay>Оплатить картой онлайн</button>' : '') +
      '<button type="button" class="btn ' + (o.pay_online || depBtn ? 'btn-line' : 'btn-wax') + '" data-act="paid">Я оплатил(а) переводом</button>' +
      '</div><p class="case-pay__help"><button type="button" class="line-link" data-chat-focus>' +
      'Вопрос по оплате <span aria-hidden="true">→</span></button></p>';
    return head + payWorkspace(req + receiptField + payBtns, history, 'due') + '</div>';
  }

  /* part='decide' — только решения по делу, part='pay' — только платёж.
     Раздел «Дело» спрашивает решение, раздел «Оплата» принимает деньги;
     без этого разделения блок оплаты выводился в обоих сразу. */
  function actionsBlock(o, part) {
    var b = [];
    var total = o.stages_total || 1;
    var plan0 = o.plan || [];
    var byParts = plan0.length > 1;   /* платят по частям — не пугаем полной суммой */
    var partsNote = '';
    if (o.actions.indexOf('accept_price') >= 0) {
      if (byParts) {
        b.push('<button type="button" class="btn btn-wax" data-act="accept_price">Принять цену — начать с ' + money(plan0[0].amount) + ' ₽</button>');
        partsNote = '<p class="case-sec__lead">Полная стоимость — <b>' +
          money(o.due_total || o.price) + ' ₽</b>, но платить её сразу не нужно: сейчас — только ' +
          '<b>первая часть ' + money(plan0[0].amount) + ' ₽</b>. Каждый следующий платёж — после ' +
          'того, как результат соответствующей части будет подготовлен (план — выше, рядом с ценой).</p>';
      } else {
        b.push('<button type="button" class="btn btn-wax" data-act="accept_price">Принять цену — к оплате ' + money(o.due_total || o.price) + ' ₽</button>');
      }
      b.push('<button type="button" class="btn btn-line" data-act="decline">Отказаться</button>');
    }
    if (o.actions.indexOf('accept_work') >= 0) {
      var lastPart = total <= 1 || (o.stage || 1) >= total;
      var acceptLabel = lastPart ? 'Принять результат' : 'Принять результат части ' + (o.stage || 1);
      b.push('<button type="button" class="btn btn-wax" data-act="accept_work">' + acceptLabel + '</button>');
      b.push('<button type="button" class="btn btn-line" data-act-fix>Нужна корректировка' + (total > 1 ? ' по части ' + (o.stage || 1) : '') + '</button>');
    }
    if (o.actions.indexOf('resume') >= 0) {
      b.push('<button type="button" class="btn btn-wax" data-act="resume">Возобновить заказ</button>');
    }
    var wantPay = part !== 'decide';
    var pay = (wantPay && ((o.due_now && o.due_now.amount > 0) || o.claimed ||
               (o.payments || []).some(function (p) { return p.status === 'paid'; })))
      ? payBlock(o) : '';
    if (!b.length || part === 'pay') {
      return pay || (wantPay && payHistory(o)
        ? '<div class="fs-sec case-sec case-pay" id="secPay">' +
          '<header><div><p class="eyebrow">Оплата</p><h3>История платежей</h3></div></header>' +
          payHistory(o) + '</div>' : '');
    }
    return '<div class="fs-sec case-sec" id="secDecide">' +
      '<header><div><p class="eyebrow">Решение по заказу</p><h3>Слово за вами</h3></div>' +
      (total > 1 && 'check fix'.indexOf(o.status) >= 0 ? '<span class="case-sec__note">проверка и итерации — по условиям позиции</span>' : '') +
      '</header>' + partsNote + '<div class="case-acts">' + b.join('') + '</div>' +
      '<div class="case-fix" id="fixForm" hidden>' +
        '<label class="case-field"><span class="case-field__label">Что нужно скорректировать</span>' +
        '<textarea id="fixText" rows="3" maxlength="2000" placeholder="Укажите критерий позиции и конкретное расхождение результата"></textarea></label>' +
        '<div class="case-acts"><button type="button" class="btn btn-wax" data-act-fix-send>Запросить корректировку</button>' +
        '<button type="button" class="btn btn-line" data-act-fix-cancel>Передумал(а)</button></div>' +
      '</div></div>' + pay;
  }

  /* -------- часть/финал готовы и придержаны до оплаты: заметные ленты -------- */
  function finalBand(o) {
    if (!o.final_ready || 'work fix'.indexOf(o.status) < 0) return '';
    var due = o.due_now && o.due_now.amount ? o.due_now.amount : 0;
    if (due > 0) {
      return '<div class="account-notice account-notice--wax">' +
        '<span class="account-notice__mark" aria-hidden="true">₽</span>' +
        '<div><strong>Финальный пакет результата подготовлен</strong>' +
        '<p>Он передаётся после закрытия остатка — ' + money(due) + ' ₽. ' +
        'Как только мастер подтвердит поступление, файлы придут сразу.</p></div>' +
        '<span class="account-notice__acts">' +
        '<button type="button" class="line-link" data-jump="secPay">Перейти к оплате <span aria-hidden="true">→</span></button></span></div>';
    }
    return '<div class="account-notice">' +
      '<span class="account-notice__mark" aria-hidden="true">¶</span>' +
      '<div><strong>Финальная часть на передаче</strong><p>' +
      (o.claimed ? 'Ваша отметка об оплате на сверке у мастера — после подтверждения он передаст финальную часть.'
                 : 'Оплата закрыта — мастер передаёт финальную часть.') + '</p></div></div>';
  }

  function partBand(o) {
    /* промежуточный результат подготовлен: «сначала оплата этапа — потом файл» */
    if (!o.part_ready || o.final_ready || 'work fix'.indexOf(o.status) < 0) return '';
    var due = o.due_now && o.due_now.amount ? o.due_now.amount : 0;
    if (due > 0) {
      return '<div class="account-notice account-notice--wax">' +
        '<span class="account-notice__mark" aria-hidden="true">₽</span>' +
        '<div><strong>Результат части ' + o.part_ready + ' подготовлен</strong>' +
        '<p>Он передаётся после оплаты этапа — ' + money(due) + ' ₽' +
        (o.due_now && o.due_now.label ? ' (' + esc(o.due_now.label.toLowerCase()) + ')' : '') +
        '. После подтверждения файл придёт сразу.</p></div>' +
        '<span class="account-notice__acts">' +
        '<button type="button" class="line-link" data-jump="secPay">Перейти к оплате <span aria-hidden="true">→</span></button></span></div>';
    }
    return '<div class="account-notice">' +
      '<span class="account-notice__mark" aria-hidden="true">§</span>' +
      '<div><strong>Результат части ' + o.part_ready + ' подготовлен</strong><p>' +
      (o.claimed ? 'Ваша отметка об оплате на сверке — после подтверждения мастер передаст файл.'
                 : 'Этап оплачен — мастер передаёт файл.') + '</p></div></div>';
  }

  /* -------- часть уже у клиента, а этап не оплачен: честная лента -------- */
  function dueBand(o) {
    if ('check fix'.indexOf(o.status) < 0 || o.final_ready || o.part_ready) return '';
    var due = o.due_now && o.due_now.amount ? o.due_now.amount : 0;
    if (due <= 0) return '';
    return '<div class="account-notice account-notice--wax">' +
      '<span class="account-notice__mark" aria-hidden="true">₽</span>' +
      '<div><strong>По плану оплат за эту часть — ' + money(due) + ' ₽' +
      (o.due_now && o.due_now.label ? ' (' + esc(o.due_now.label.toLowerCase()) + ')' : '') + '</strong>' +
      '<p>Мастерская передала результат, доверившись вам — закройте этап, и исполнение продолжится без пауз.</p></div>' +
      '<span class="account-notice__acts">' +
      '<button type="button" class="line-link" data-jump="secPay">Перейти к оплате <span aria-hidden="true">→</span></button></span></div>';
  }

  /* -------- пауза: заметная лента под шапкой дела -------- */
  function pauseBand(o) {
    if (!o.paused) return '';
    var by = o.paused_by === 'admin'
      ? 'Мастер приостановил дело — вопросы можно задать в переписке ниже.'
      : 'Вы поставили дело на паузу: исполнение и напоминания подождут вашего сигнала.';
    return '<div class="account-notice">' +
      '<span class="account-notice__mark" aria-hidden="true">П</span>' +
      '<div><strong>Дело на паузе</strong><p>' + by + '</p></div>' +
      (o.actions.indexOf('unpause') >= 0
        ? '<span class="account-notice__acts">' +
          '<button type="button" class="line-link" data-act="unpause">Снять с паузы <span aria-hidden="true">→</span></button></span>' : '') +
      '</div>';
  }

  /* -------- управление делом: пауза, отзыв заявки, закрытие в работе -------- */
  function manageBlock(o) {
    var items = [];
    if (o.actions.indexOf('unpause') >= 0)
      items.push('<button type="button" class="btn btn-line" data-act="unpause">Снять с паузы</button>');
    else if (o.actions.indexOf('pause') >= 0)
      items.push('<button type="button" class="btn btn-line" data-act-pause>Поставить на паузу</button>');
    if (o.status === 'new' && o.actions.indexOf('decline') >= 0)
      items.push('<button type="button" class="btn btn-line" data-act="decline">Отозвать заявку</button>');
    if (o.actions.indexOf('cancel_request') >= 0)
      items.push('<button type="button" class="btn btn-line" data-act-cancelreq>Закрыть дело…</button>');
    if (!items.length) return '';
    return fold('secManage', 'Управление делом', 'пауза — не отмена',
      '<div class="case-acts">' + items.join('') + '</div>', false);
  }

  /* -------- после завершения: отдельная подготовка к выступлению -------- */
  function defenseBlock(o) {
    if (o.status !== 'done' || /^svc_/.test(o.work_type || '')) return '';
    return '<div class="fs-sec case-sec">' +
      '<header><div><p class="eyebrow">По вашим материалам</p><h3>Нужна подготовка к выступлению?</h3></div></header>' +
      '<p class="case-sec__lead">Можно отдельно заказать редактуру вашего доклада и слайдов, а также репетицию самостоятельных ответов. Бонусы с этого заказа можно применить.</p>' +
      '<div class="case-acts">' +
      '<a class="btn btn-wax" href="configurator.html?service=dp&order=' + o.id + '">Пакет подготовки к выступлению · от 9 500 ₽</a>' +
      '<a class="btn btn-line" href="configurator.html?service=df&order=' + o.id + '">Редактура доклада и слайдов · от 6 000 ₽</a>' +
      '<a class="btn btn-line" href="configurator.html?service=nm&order=' + o.id + '">Нормоконтроль · от 5 000 ₽</a>' +
      '</div>' +
      '<p class="case-note">Пакет выгоднее на 1 500 ₽, чем услуги по отдельности (11 000 ₽).</p></div>';
  }

  /* -------- отзыв: просто для тех, кто не любит писать -------- */
  function reviewBlock(o) {
    if (!o.engagement_ready) return '';
    var r = o.review;
    if (r) {
      var stMap = { pending: 'на модерации у мастера', approved: 'опубликован на сайте — спасибо!', rejected: 'сохранён, на сайт не попал' };
      return '<div class="fs-sec case-sec case-review">' +
        '<header><div><p class="eyebrow">Ваш отзыв</p><h3>Спасибо за оценку</h3></div>' +
        '<span class="case-sec__note">' + (stMap[r.status] || '') + '</span></header>' +
        '<p class="rv-stars-static">' + '★'.repeat(r.rating) + '<span class="dim">' + '★'.repeat(5 - r.rating) + '</span></p>' +
        (r.text ? '<blockquote class="case-quote">«' + esc(r.text) + '»</blockquote>' : '') +
        '<div class="case-acts"><button type="button" class="btn btn-line" data-review-edit>Изменить отзыв</button></div>' +
        '<div id="reviewForm" hidden>' + reviewFormInner(r) + '</div></div>';
    }
    return '<div class="fs-sec case-sec case-review">' +
      '<header><div><p class="eyebrow">Займёт полминуты</p><h3>Как вам результат и сервис?</h3></div></header>' +
      '<p class="case-sec__lead">Оценка и пара слов помогают другим студентам решиться — а нам делают день. Публикуется после модерации, можно анонимно.</p>' +
      '<div id="reviewForm">' + reviewFormInner(null) + '</div></div>';
  }
  function reviewFormInner(r) {
    var cur = r ? r.rating : 5;
    var stars = '';
    for (var n = 1; n <= 5; n++)
      stars += '<button type="button" class="rv-star' + (n <= cur ? ' on' : '') + '" data-star="' + n + '" aria-label="' + n + ' из 5">★</button>';
    return '<div class="rv-stars" id="rvStars" data-val="' + cur + '">' + stars + '</div>' +
      '<label class="case-field"><span class="case-field__label">Текст отзыва — по желанию</span>' +
      '<textarea id="rvText" rows="3" maxlength="2000" placeholder="Пара слов: что было полезно и удобно">' + (r && r.text ? esc(r.text) : '') + '</textarea></label>' +
      '<div class="case-acts">' +
      '<input class="account-input" type="text" id="rvAuthor" maxlength="60" aria-label="Подпись к отзыву, необязательно" placeholder="Подпись (например, «Мария, ВКР») — можно пусто">' +
      '<button type="button" class="btn btn-wax" data-review-send>' + (r ? 'Обновить отзыв' : 'Отправить отзыв') + '</button></div>' +
      '<div class="case-consents">' +
      '<label class="case-consent"><input type="checkbox" id="rvConsentText">' +
      '<span>Отдельно разрешаю опубликовать оценку и текст на akademsalon.ru. Условия — <a href="consent-publication.html" target="_blank">согласие на распространение</a>.</span></label>' +
      '<label class="case-consent"><input type="checkbox" id="rvConsentAuthor">' +
      '<span>Также разрешаю опубликовать введённую подпись. Без отметки отзыв будет анонимным.</span></label>' +
      '<label class="case-consent"><input type="checkbox" id="rvConsentShot">' +
      '<span>Также разрешаю публикацию приложенного скриншота после удаления данных третьих лиц.</span></label>' +
      '</div>' +
      '<div class="case-acts">' +
      '<label class="btn btn-line case-upload">Приложить скрин (оценка, переписка)<input type="file" id="cabReviewShot" hidden accept="image/*,.pdf"></label></div>' +
      '<p class="case-note up-note" id="rvNote" hidden></p>';
  }

  /* -------- благодарность: только после завершённого дела -------- */
  function thanksBlock(o) {
    if (!o.engagement_ready) return '';
    var tips = o.tips || {};
    if (tips.total > 0) {
      return '<div class="fs-sec case-sec thanks-card th-complete" id="thanksCard" data-tip="500">' +
        '<header><div><p class="eyebrow">После финальной точки</p>' +
        '<h3>Спасибо за поддержку мастерской</h3></div>' +
        '<span class="case-support__mark" aria-hidden="true">¶</span></header>' +
        '<p class="case-sec__lead">Вы уже оставили ' + money(tips.total) + ' ₽ на развитие проекта. Это правда помогает.</p>' +
        '<p class="case-note"><button type="button" class="line-link" data-tip-more>Поддержать ещё раз <span aria-hidden="true">→</span></button></p>' +
      '</div>';
    }
    return '<div class="fs-sec case-sec thanks-card" id="thanksCard" data-tip="500">' +
      '<header><div><p class="eyebrow">После финальной точки</p>' +
      '<h3>Оставить благодарность мастерской</h3></div></header>' +
      '<p class="case-sec__lead">Если результат и сопровождение помогли, можно поддержать развитие проекта. Только по желанию — на заказ, корректировки и отношение это никак не влияет.</p>' +
      '<div class="case-chips" role="group" aria-label="Сумма благодарности">' +
        '<button type="button" class="case-chip" data-tip-preset="300" aria-pressed="false">300 ₽</button>' +
        '<button type="button" class="case-chip on" data-tip-preset="500" aria-pressed="true">500 ₽</button>' +
        '<button type="button" class="case-chip" data-tip-preset="1000" aria-pressed="false">1 000 ₽</button>' +
        '<button type="button" class="case-chip" data-tip-preset="2000" aria-pressed="false">2 000 ₽</button>' +
      '</div>' +
      '<div class="case-acts"><input class="account-input account-input--short" id="tipOwn" type="number" inputmode="numeric" min="100" max="30000" step="50" placeholder="Своя сумма" aria-label="Своя сумма благодарности в рублях">' +
        '<button type="button" class="btn btn-wax" data-tip-pay>Поблагодарить <span class="ar">→</span></button></div>' +
      '<p class="case-note">100–30 000 ₽ · оплата картой или через СБП на защищённой странице Robokassa · электронный чек придёт от платёжного сервиса.</p>' +
    '</div>';
  }

  /* расширение файла в мономарке — как в эталонной строке документа */
  function fileExt(name) {
    var m = String(name || '').match(/\.([A-Za-zА-Яа-я0-9]{1,4})$/);
    return m ? m[1].toUpperCase() : 'ФАЙЛ';
  }
  /* own=true — раздел «Документы» дела: свёртка не нужна, он и так открыт */
  function filesBlock(o, own) {
    var rows = (o.files || []).map(function (f) {
      var bits = [f.from === 'master' ? 'от мастерской' : 'ваш файл', dt(f.at)];
      if (f.part && (o.stages_total || 1) > 1) bits.push('часть ' + f.part);
      if (f.label) bits.push(esc(f.label));
      return '<a class="file-row" href="#" data-protected-asset="' + apiPath(o.id, '/file/' + f.id) +
        '" data-order-id="' + o.id + '" data-filename="' + esc(f.name) + '">' +
        '<i aria-hidden="true">' + fileExt(f.name) + '</i>' +
        '<span><strong>' + esc(f.name) + '</strong><small>' + bits.join(' · ') +
        (f.new ? ' <b class="file-row__new">новый</b>' : '') + '</small></span>' +
        '<b aria-hidden="true">↗</b></a>';
    }).join('');
    var n = (o.files || []).length;
    var meta = n
      ? (n + ' ' + plural(n, 'файл', 'файла', 'файлов') + (o.files_new ? ' · есть новые' : ''))
      : 'приложить методичку или задание';
    var open = n > 0 || o.status === 'new';
    return fold('secFiles', 'Документы', meta,
      (rows ? '<div class="case-files">' + rows + '</div>'
            : '<p class="case-sec__lead">Пока пусто. Приложите методичку или задание — мастеру будет проще оценить работу точно.</p>') +
      '<div class="case-files__tools"><label class="btn btn-line case-upload">Приложить файл<input type="file" id="cabUpload" hidden></label>' +
      '<button type="button" class="line-link" data-tab="documents">Все документы кабинета ' +
      '<span aria-hidden="true">→</span></button></div>' +
      '<p class="case-note up-note" id="upNote" hidden></p>', own || open, own);
  }

  function mediaHtml(o, m) {
    /* голосовые и фото из переписки проигрываются прямо в деле */
    var path = apiPath(o.id, '/msgmedia/' + m.id);
    var attrs = ' data-protected-media="' + path + '" data-order-id="' + o.id + '"';
    if (m.kind === 'voice' || m.kind === 'audio')
      return '<audio class="message__audio" controls preload="none"' + attrs + '></audio>';
    if (m.kind === 'photo')
      return '<a class="message__shot" href="#" target="_blank" rel="noopener" data-protected-media-open aria-disabled="true"><img' +
        attrs + ' alt="фото из переписки" loading="lazy"></a>';
    if (m.kind === 'video' || m.kind === 'video_note')
      return '<video class="message__video" controls preload="none"' + attrs + '></video>';
    return '';
  }

  function chatBlock(o, own) {
    var items = [];
    (o.history || []).forEach(function (h) { items.push({ at: h.at, sys: true, text: h.text }); });
    (o.messages || []).forEach(function (m) {
      items.push({ at: m.at, me: m.from === 'client', text: m.text, kind: m.kind,
                   file: m.file_name, id: m.id, media: m.media });
    });
    items.sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
    var feed = items.map(function (i) {
      if (i.sys) return '<p class="message-sys">' + esc(i.text) + ' · ' + dt(i.at) + '</p>';
      var body = i.text ? '<p>' + esc(i.text) + '</p>' : '';
      var media = (i.media && i.kind !== 'document') ? mediaHtml(o, i) : '';
      if (media) body = body + media;
      else if (!body && i.kind && i.kind !== 'text') body = '<p>Вложение: ' + (i.file ? esc(i.file) : 'см. раздел «Документы» или Telegram') + '</p>';
      else if (i.file) body += '<p>' + esc(i.file) + '</p>';
      return '<article class="message ' + (i.me ? 'message--client' : 'message--editor') + '">' +
        '<span aria-hidden="true">' + (i.me ? 'ВЫ' : 'МС') + '</span>' +
        '<div><strong>' + (i.me ? 'Вы' : 'Мастерская') + '</strong>' + body +
        '<small>' + dt(i.at) + '</small></div></article>';
    }).join('');
    var hasMsgs = (o.messages || []).length > 0;
    var meta = o.unread ? ('новых: ' + o.unread) : (S.api.token() ? 'синхронно с Telegram' : 'мастер видит сразу');
    return fold('secChat', 'Переписка по заказу', meta,
      '<div class="message-list" id="chatFeed">' +
      (feed || '<p class="message-sys">Пока тихо. Напишите первым — мастер ответит прямо здесь.</p>') + '</div>' +
      '<div class="message-form"><label><span class="case-field__label">Сообщение мастеру</span>' +
      '<textarea id="chatText" rows="2" maxlength="3000" placeholder="Сообщение мастеру…"></textarea></label>' +
      '<button type="button" class="btn btn-wax" id="chatSend">Отправить</button></div>',
      own || !!o.unread || !hasMsgs, own);
  }

  /* -------- доступ к делу: секретная ссылка для других устройств --------
     uid=true — режим «Помощи», где блок рендерится ПО КАЖДОМУ делу:
     id уникальные (иначе дубли secAccess); в DOM лежит номер дела,
     а capability-токен читается из памяти только по явному действию */
  function accessBlock(o, uid) {
    var t = tokenFor(o.id);
    if (!t) return ''; /* заказы аккаунта открываются входом через Telegram */
    return fold(uid ? 'secAccess-' + o.id : 'secAccess',
      'Доступ к делу' + (uid ? ' ' + esc(o.no) : ''), 'ссылка для других устройств',
      '<p class="case-sec__lead">Секретная ссылка переносит гостевой доступ на другое устройство — сохраните её себе (заметки, «Избранное»). ' +
      'Не пересылайте посторонним: до привязки аккаунта у кого ссылка, тот видит дело. Привязка через Telegram одноразовая: после подтверждения прежний ключ отзывается сервером.</p>' +
      '<div class="case-acts">' +
      '<button type="button" class="btn btn-line" data-access-copy data-order-id="' + o.id + '">Скопировать ссылку доступа</button>' +
      '<button type="button" class="btn btn-line" data-secure-tg-link>Привязать Telegram одноразово</button>' +
      '</div>', false);
  }

  var STAMP_TONE = { priced: 's-act', prepay: 's-act', check: 's-act', fix: 's-act',
                     done: 's-done', cancel: 's-mute' };

  /* чипы-навигация по делу (мобайл): довести до раздела без листания */
  /* ---------------- разделы внутри дела ----------------
     Дело перестало быть одной лентой. Раньше всё — этап, смета, оплата,
     файлы, переписка, спецификация, служебное — лежало подряд: на телефоне
     это 5 600 px, около восьми прокруток, и нужное приходилось искать.
     Теперь пять разделов, как в ACC-03 стандарта: открыт один, остальные
     в один тап. Ленты внимания и шапка остаются над разделами всегда. */
  var CASE_SECS = ['work', 'money', 'files', 'chat', 'terms'];

  function caseSecOf(o) {
    var s = st.caseSec;
    if (CASE_SECS.indexOf(s) < 0) s = 'work';
    return s;
  }

  /* какой раздел открыть, когда дело открывают заново */
  function defaultCaseSec(o) {
    if (!o) return 'work';
    var due = o.due_now && o.due_now.amount ? o.due_now.amount : 0;
    if (due > 0 || o.status === 'prepay') return 'money';
    if (o.files_new) return 'files';
    if (o.unread) return 'chat';
    return 'work';
  }

  function orderById(id) {
    return st.orders.filter(function (o) { return o.id === id; })[0] || null;
  }

  /* раздел, с которого открывается дело: тот, где сейчас дело за клиентом */
  function openingSec(id, hint) {
    if (hint && JUMP_SEC[hint]) return JUMP_SEC[hint];
    return defaultCaseSec(orderById(id));
  }

  function jumpChips(o) {
    var cur = caseSecOf(o);
    var due = o.due_now && o.due_now.amount ? o.due_now.amount : 0;
    var files = (o.files || []).length;
    var tabs = [
      ['work', 'Дело', o.actions.indexOf('accept_work') >= 0 || o.actions.indexOf('accept_price') >= 0],
      ['money', 'Оплата' + (due > 0 ? ' · ' + money(due) + ' ₽' : ''), due > 0 || !!o.claimed],
      ['files', 'Документы' + (files ? ' · ' + files : ''), !!o.files_new],
      ['chat', 'Переписка' + (o.unread ? ' · ' + o.unread : ''), !!o.unread],
      ['terms', 'Условия', false]
    ];
    return '<div class="ord-jump case-secnav" role="tablist" aria-label="Разделы дела">' +
      tabs.map(function (c) {
        var on = cur === c[0];
        return '<button type="button" role="tab" class="oj' + (on ? ' is-on' : '') +
          (c[2] && !on ? ' hot' : '') + '" data-case-sec="' + c[0] + '"' +
          ' aria-selected="' + on + '" tabindex="' + (on ? '0' : '-1') + '">' + c[1] + '</button>';
      }).join('') + '</div>';
  }

  /* старые якоря дела → раздел, в котором они теперь живут */
  var JUMP_SEC = {
    secPay: 'money', secDecide: 'work', secStages: 'work',
    secFiles: 'files', secChat: 'chat', secManage: 'terms', secAccess: 'terms'
  };

  function setCaseSec(sec, scrollTo) {
    if (CASE_SECS.indexOf(sec) < 0) sec = 'work';
    st.caseSec = sec;
    try { history.replaceState(caseHistoryState(), '', caseHash()); } catch (e) {}
    renderTab();
    var main = root.querySelector('.account-main');
    if (main) main.scrollTop = 0;
    var nav = root.querySelector('.case-secnav .oj.is-on');
    if (nav) { try { nav.focus({ preventScroll: true }); } catch (e) {} }
    if (scrollTo) setTimeout(function () { scrollToEl(scrollTo); }, 40);
  }

  /* содержимое раздела дела */
  function caseSecHtml(o, sec) {
    if (sec === 'money') {
      /* расчёт уже показан рядом с «Принять цену» — второй раз не повторяем */
      var money = actionsBlock(o, 'pay') + giftRestStrip(o) +
        (decideFirst(o) ? '' : priceBlock(o));
      if (money) return money;
      /* пустой раздел показывать нельзя: говорим, что происходит и чего ждать */
      return '<div class="case-state case-state--empty">' +
        '<header><span>по плану</span><i aria-hidden="true"></i></header>' +
        '<div class="case-state__body">' +
        '<span class="case-state__mark" aria-hidden="true">₽</span>' +
        '<h2>Платить пока нечего</h2>' +
        '<p>' + (o.status === 'new'
          ? 'Мастер разбирает заявку и назовёт цену — она появится здесь и в разделе «Дело».'
          : 'Счёт появится здесь, когда мастер подготовит результат этапа. Заранее платить не нужно.') +
        '</p></div></div>';
    }
    if (sec === 'files') return filesBlock(o, true);
    if (sec === 'chat') return chatBlock(o, true);
    if (sec === 'terms') {
      var spec = orderItemsBlock(o);
      var tools = stageFold(o) + manageBlock(o) + accessBlock(o) + caseSupport(o);
      var after = reviewBlock(o) + thanksBlock(o) + defenseBlock(o);
      return (spec
        ? '<div class="case-terms-layout"><div class="case-terms-layout__main">' + spec +
          '</div><aside class="case-terms-layout__aside" aria-label="Служебные разделы дела">' +
          tools + '</aside></div>'
        : tools) + after;
    }
    /* «Дело» — что происходит и что от вас ждут. Пока цена только названа,
       расчёт обязан стоять здесь же: нельзя просить принять сумму, не
       показав, из чего она сложилась. */
    return caseOverview(o) +
      (decideFirst(o)
        ? priceBlock(o) + giftRestStrip(o) + actionsBlock(o, 'decide')
        : actionsBlock(o, 'decide')) +
      stageFold(o) + caseSupport(o);
  }

  function caseSecBody(o) {
    return caseSecHtml(o, caseSecOf(o));
  }

  function caseBackLabel() {
    if (st.tab === 'messages') return 'К сообщениям';
    if (st.tab === 'documents') return 'К документам';
    if (st.tab === 'home') return 'К обзору';
    return 'Все дела';
  }


  /* ================= РАЗДЕЛЫ КАБИНЕТА (v2 «Маркетплейс», 2026-07-22) =================
     Постоянный каркас: строка личности + вкладки; контент собирается из
     прежних блоков. Вкладка живёт в location.hash — переживает F5 и даёт
     прямые ссылки (#orders, #wallet, #club, #help). */
  function tabBadges() {
    var unread = 0;
    st.orders.forEach(function (o) { unread += o.unread || 0; });
    return {
      orders: unread > 0 ? (unread > 99 ? '99+' : String(unread)) : '',
      club: (st.me && st.me.sub_pending) ? '!' : ''
    };
  }
  /* Навигация кабинета повторяет финальный account-shell из дизайн-концепта.
     data-tab остаётся единственным источником смены разделов. */
  function accountIcon(name) {
    var paths = {
      home: '<path d="M3.5 10.5 12 3.5l8.5 7v9a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1z"/>',
      orders: '<rect x="3.5" y="6.5" width="17" height="13" rx="1.5"/><path d="M8.5 6.5v-2h7v2M3.5 11.5h17"/>',
      messages: '<path d="M4 5.5h16v11H9l-5 4z"/><path d="M8 10h8M8 13h5"/>',
      documents: '<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4M9 12h6M9 15h6"/>',
      wallet: '<rect x="3.5" y="6" width="17" height="13" rx="2"/><path d="M3.5 9h17M15 13h5.5"/><circle cx="16.5" cy="13" r=".75" fill="currentColor" stroke="none"/>',
      help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.2 2.4c-.8.3-.8 1-.8 1.6M12 17h.01"/>',
      settings: '<path d="M4 7h10M18 7h2M4 12h3M11 12h9M4 17h8M16 17h4"/><circle cx="16" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="14" cy="17" r="2"/>',
      plus: '<path d="M12 4.5v15M4.5 12h15"/>',
      spark: '<path d="M12 3.5c.45 4.7 2.8 7.05 7.5 7.5-4.7.45-7.05 2.8-7.5 7.5-.45-4.7-2.8-7.05-7.5-7.5 4.7-.45 7.05-2.8 7.5-7.5z"/><path d="M18.5 3.5v3M20 5h-3"/>',
      more: '<circle cx="5" cy="12" r="1.35" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.35" fill="currentColor" stroke="none"/>'
    };
    return '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">' +
      (paths[name] || paths.more) + '</svg>';
  }

  function navSide() {
    var badge = tabBadges();
    var accountOpen = ['wallet', 'deposit', 'club'].indexOf(st.tab) >= 0;
    var items = [
      ['home', 'Обзор', '', 'home'],
      ['orders', 'Дела', '', 'orders'],
      ['messages', 'Сообщения', badge.orders || '', 'messages'],
      ['documents', 'Документы', '', 'documents'],
      ['wallet', 'Счёт и клуб', badge.club || '', 'wallet']
    ];
    var secondary = [
      ['documents', 'Документы', '', 'documents'],
      ['wallet', 'Счёт и клуб', badge.club || '', 'wallet'],
      ['help', 'Помощь', '', 'help'],
      ['settings', 'Настройки', '', 'settings']
    ];
    function currentFor(tab) { return st.tab === tab || (tab === 'wallet' && accountOpen); }
    function button(item, extraClass) {
      var current = currentFor(item[0]);
      return '<button type="button" class="' + (extraClass || '') + (current ? ' is-current' : '') +
        '" data-tab="' + item[0] + '" aria-current="' + (current ? 'page' : 'false') + '">' +
        '<i class="account-nav__glyph" aria-hidden="true">' + accountIcon(item[3]) + '</i>' +
        '<span>' + item[1] + '</span>' + (item[2] ? '<b' +
        (item[0] === 'messages' && badge.orders ? ' class="badge-wax"' : '') + '>' + item[2] + '</b>' : '') +
        '</button>';
    }
    var activeSecondary = null;
    secondary.some(function (item) {
      if (currentFor(item[0])) { activeSecondary = item; return true; }
      return false;
    });
    return '<nav aria-label="Разделы кабинета"><section class="account-nav__group"><span class="account-nav__label">Главное</span>' +
      items.map(function (item, index) { return button(item, index > 2 ? 'is-mobile-secondary' : ''); }).join('') +
      '</section><details class="account-nav__more' + (activeSecondary ? ' is-current' : '') + '">' +
      '<summary aria-current="' + (activeSecondary ? 'page' : 'false') + '"><i class="account-nav__glyph" aria-hidden="true">' +
        accountIcon(activeSecondary ? activeSecondary[3] : 'more') + '</i><span>' +
        (activeSecondary ? activeSecondary[1] : 'Ещё') + '</span></summary>' +
      '<div class="account-nav__more-panel" aria-label="Другие разделы">' +
        '<a class="account-nav__more-option account-nav__more-new" href="configurator.html">' +
          '<i class="account-nav__glyph" aria-hidden="true">' + accountIcon('plus') + '</i>' +
          '<span>Новое дело</span><b aria-hidden="true">→</b></a>' +
        secondary.map(function (item) { return button(item, 'account-nav__more-option'); }).join('') +
      '</div></details></nav>';
  }
  function dockTabs() {
    return '';
  }

  /* режим мастера — вымпел над каркасом (вместо строки личности) */
  function impBanner() {
    if (!impMode()) return '';
    var nm = '';
    try { nm = sessionStorage.getItem('salon_imp_name') || ''; } catch (e) {}
    return '<div class="imp-band reveal"><span><b>Режим мастера</b> — кабинет клиента' +
      (nm ? ' <b>' + esc(nm) + '</b>' : '') +
      '. Действия настоящие, но тихо: визиты и метки «прочитано» не трогаются.</span>' +
      '<button type="button" class="linkbtn" id="cabImpExit">закрыть режим</button></div>';
  }

  /* Личность — точная верхняя ячейка account-nav из концепта. */
  function profileCard() {
    if (impMode()) {
      var inm = '';
      try { inm = sessionStorage.getItem('salon_imp_name') || 'клиент'; } catch (e) {}
      return '<button type="button" class="account-nav__person" data-tab="settings" aria-label="Открыть настройки профиля"><span aria-hidden="true">МС</span><div>' +
        '<strong>' + esc(inm) + '</strong><small>Режим мастера</small></div></button>';
    }
    var u = S.api.token() && S.api.user();
    if (u) {
      var name = String(u.name || 'Клиент').trim();
      var parts = name.split(/\s+/);
      var letter = ((parts[0] || 'А').charAt(0) + (parts[1] || '').charAt(0)).toUpperCase();
      var joined = u.created_at ? new Date(u.created_at) : null;
      var joinedLabel = joined && !isNaN(joined.getTime())
        ? 'Клиент с ' + joined.getFullYear() + ' года'
        : 'Клиент мастерской';
      return '<button type="button" class="account-nav__person" data-tab="settings" aria-label="Открыть настройки профиля"><span aria-hidden="true">' + esc(letter || 'АС') + '</span><div>' +
        '<strong>' + esc(name) + '</strong><small>' + joinedLabel + '</small></div></button>';
    }
    return '<button type="button" class="account-nav__person" data-tab="settings" aria-label="Открыть настройки профиля"><span aria-hidden="true">АС</span><div>' +
      '<strong>Гостевой доступ</strong><small>Дела этого устройства</small></div></button>';
  }

  /* мини-кошелёк стойки: бонусы и депозит формулярными строками */
  function sideMini() {
    if (!st.me) {
      return '<div class="account-nav__assurance"><span aria-hidden="true">¶</span>' +
        '<p><strong>Доступ защищён.</strong> Дела этого устройства видны только по секретной ссылке.</p></div>';
    }
    var deposit = (st.me.deposit && st.me.deposit.balance) || 0;
    var bonus = (st.me.bonus && st.me.bonus.balance) || 0;
    return '<button type="button" class="account-nav__wallet" data-tab="wallet">' +
      '<span>Ваши средства</span><strong>' + money(deposit) + ' ₽</strong>' +
      '<small>' + money(bonus) + ' бонусов · открыть счёт →</small></button>';
  }
  function sideFoot() {
    return '<div class="account-nav__bottom" role="navigation" aria-label="Служебные разделы">' + [['help', 'Помощь', 'help'],
      ['settings', 'Настройки', 'settings']].map(function (item) {
        var current = st.tab === item[0];
        return '<button type="button" class="' + (current ? 'is-current' : '') +
          '" data-tab="' + item[0] + '" aria-current="' + (current ? 'page' : 'false') + '">' +
          '<i class="account-nav__glyph" aria-hidden="true">' + accountIcon(item[2]) + '</i><span>' + item[1] + '</span></button>';
      }).join('') + '</div>';
  }

  /* заголовок рабочей полосы: раздел + живая мета */
  function tabHead() {
    var u = S.api.token() && S.api.user();
    var first = u && u.name ? String(u.name).trim().split(/\s+/)[0] : '';
    var copy = {
      home: ['Личный зал', first ? 'Добрый день, ' + esc(first) + '.' : 'Ваш личный кабинет.',
        'Здесь видно, что происходит с заказами и требуется ли от вас действие.', '01'],
      orders: ['Работа мастерской', 'Ваши дела.', 'Сроки, файлы, сообщения и оплата по каждому заказу.', '02'],
      messages: ['Личный кабинет', 'Сообщения.', 'Новые вопросы редактора и переписка собраны по делам.', '03'],
      documents: ['Личный кабинет', 'Документы.', 'Файлы, спецификации, акты и подтверждения оплаты.', '04'],
      wallet: ['Платежи и документы', 'Платежи.', 'Что ждёт оплаты по вашим делам и подтверждения прошедших операций.', '05'],
      deposit: ['Платежи и документы', 'Депозит и бонусы.', 'Денежный аванс и бонусные единицы скидки ведутся раздельно.', '05'],
      club: ['Клуб Салона', 'Абонементы и сопровождение.', 'Состав, срок и стоимость видны до каждого отдельного платежа.', '05'],
      help: ['Связь с мастерской', 'Помощь по вашему делу.', 'Выберите удобный способ связи или восстановите доступ к заказу.', '06'],
      settings: ['Личный кабинет', 'Настройки.', 'Тема интерфейса, данные аккаунта и выход из кабинета.', '07']
    };
    copy = copy[st.tab] || copy.home;
    var newMatterPrimary = (st.tab === 'home' || st.tab === 'orders') &&
      st.orders.length > 0 && !st.orders.some(needsAction);
    return '<header class="account-main__head' + (st.tab === 'home' ? ' account-main__head--home' : '') + '">' +
      '<div class="account-main__identity"><p class="eyebrow"><span class="account-main__code">' +
      copy[3] + '</span>' + copy[0] + '</p>' +
      '<h1>' + copy[1] + '</h1><p>' + copy[2] + '</p></div>' +
      '<a class="button button--secondary account-head__new ' +
        (newMatterPrimary ? 'account-head__new--seal' : 'account-head__new--quiet') +
        '" href="configurator.html">Новое дело <span aria-hidden="true">→</span></a></header>';
  }

  function setTab(tab, silentHash) {
    st.tab = tab;
    st.caseOpen = false; /* раздел стойки всегда открывает свой список, не дело */
    if (!silentHash) {
      /* pushState, а не replaceState: иначе «Назад» на телефоне уводит
         с сайта вместо возврата к предыдущему разделу кабинета */
      try { history.pushState(null, '', '#' + tab); } catch (e) { location.hash = tab; }
    }
    renderTab();
    var main = root.querySelector('.account-main');
    if (main) {
      main.scrollTop = 0;
      try { main.focus({ preventScroll: true }); } catch (e) {}
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
    if (tab === 'deposit') scrollToEl('depCard');
  }

  /* ---------------- Черновик заявки из этого браузера ----------------
     Незавершённая смета лежит в localStorage (salon_draft) и до отправки
     сервер о ней не знает. Показываем её ОБЫЧНОЙ карточкой дела: черновик
     стоит рядом с настоящими делами, а не отдельной плавающей плашкой.
     Условия допуска те же, что на витрине (extras.js → .resume-card):
     непустой savedAt (посадочные пишут 0 нарочно), две недели памяти,
     живой калькулятор и известный тип работы. */
  function draftSection(compact) {
    var d = S.store.get('salon_draft', null);
    if (!d || !d.savedAt || !d.state || !window.SalonCalc) return '';
    if (Date.now() - d.savedAt > 14 * 24 * 3600 * 1000) return '';
    var t = window.SalonCalc.types.filter(function (x) { return x.id === d.state.type; })[0];
    if (!t) return '';
    var step = Math.max(1, Math.min(4, (d.idx || 0) + 1));
    var saved = new Date(d.savedAt).toLocaleString('ru-RU',
      { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return '<section class="account-orders account-drafts' +
      (compact ? ' account-orders--home account-drafts--home' : '') + '">' +
      '<header><div><p class="eyebrow">Сохранено в этом браузере</p>' +
      '<h2>Черновики заявок</h2></div></header>' +
      '<div class="order-list">' +
      '<a class="order-card" href="configurator.html?step=' + step + '">' +
      '<div class="order-card__top"><span class="tag tag--status tag--new">Черновик</span>' +
      '<span>без номера</span></div>' +
      '<h3>' + esc(t.label.split(' (')[0]) + '</h3>' +
      '<div class="order-card__stage">' +
      '<span><small>Состояние</small><strong>Заполнен шаг ' + step + ' из 4 · ' + esc(saved) + '</strong></span>' +
      '<span><small>Следующий шаг</small><strong>Оценка редактора</strong></span></div>' +
      '<footer><span>Продолжить заявку</span><b aria-hidden="true">→</b></footer></a>' +
      '</div></section>';
  }

  /* -------- «Ближайшие даты»: сроки дел и собственные отметки клиента ------
     Даты сдач лежали только внутри «Клуба Салона» → витрины «Салон+» →
     свёрнутого куратора, то есть на три уровня вглубь. При этом ради них
     в кабинет и заходят. Сроки самих дел рядом — из одного источника. */
  function datesCard() {
    var rows = [];
    function shortDate(date) {
      if (!date) return 'без даты';
      var parsed = new Date(date + 'T12:00:00');
      if (isNaN(parsed.getTime())) return date;
      return parsed.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    }
    activeOrders().forEach(function (o) {
      if (!o.deadline_text) return;
      rows.push({ sort: o.deadline_date || '', when: o.deadline_text,
        what: esc(o.no || ('№ ' + o.id)) + ' · ' + esc(shortWork(o)), id: o.id });
    });
    ((st.me && st.me.milestones) || []).forEach(function (m) {
      var d = m.due || '';
      rows.push({ sort: d,
        when: shortDate(d),
        what: esc(m.title), own: true });
    });
    if (!rows.length) return '';
    rows.sort(function (a, b) { return a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0; });
    return '<section class="account-dates" data-comfort-card>' +
      '<header><p class="eyebrow">Календарь</p><h2>Ближайшие даты</h2></header>' +
      '<div>' + rows.slice(0, 4).map(function (r) {
        var body = '<span class="account-dates__when">' + esc(r.when) + '</span>' +
          '<span class="account-dates__what">' + r.what + '</span>' +
          (r.own ? '<span class="account-dates__own">ваша отметка</span>' : '');
        return r.own
          ? '<div class="account-dates__row">' + body + '</div>'
          : '<button type="button" class="account-dates__row" data-now-open="' + r.id + '">' +
            body + '</button>';
      }).join('') + '</div>' +
      '<p class="account-dates__foot"><button type="button" class="line-link" data-tab="club">' +
      'Свои отметки и напоминания <span aria-hidden="true">→</span></button></p></section>';
  }

  function homeTab() {
    var me = st.me || {};
    var dep = me.deposit || {}, bon = me.bonus || {};
    var act = activeOrders().length;
    var unread = 0, messageUnread = 0, freshFiles = 0, files = 0, attention = 0;
    st.orders.forEach(function (o) {
      unread += (o.unread || 0) + (o.files_new || 0);
      messageUnread += o.unread || 0;
      freshFiles += o.files_new || 0;
      files += (o.files || []).length || o.files_count || 0;
      if (needsAction(o)) attention++;
    });
    var priority = nowCard();
    if (!priority) {
      priority = '<section class="account-notice account-priority account-priority--calm reveal" ' +
        'data-account-priority="0"><span class="account-notice__mark" aria-hidden="true">' + accountIcon('spark') + '</span>' +
        '<div><p class="account-priority__kicker">Сейчас спокойно</p>' +
        '<strong>От вас ничего срочного не требуется.</strong>' +
        '<p>Мастерская продолжает работу. Новое решение, файл или счёт появятся здесь первыми.</p></div>' +
        '<span class="account-notice__acts"><button type="button" class="line-link" data-tab="orders">' +
        'Посмотреть дела <span aria-hidden="true">→</span></button></span></section>';
    }
    var agenda = datesCard();
    var tools = '<nav class="account-home-tools reveal" aria-label="Основные разделы кабинета">' +
      '<button type="button" data-tab="messages"><span aria-hidden="true">' + accountIcon('messages') + '</span><div>' +
      '<small>Переписка</small><strong>Сообщения</strong><em>' +
      (messageUnread ? messageUnread + ' ' + plural(messageUnread, 'новое', 'новых', 'новых') : 'новых нет') +
      '</em></div><i aria-hidden="true">→</i></button>' +
      '<button type="button" data-tab="documents"><span aria-hidden="true">' + accountIcon('documents') + '</span><div>' +
      '<small>Материалы</small><strong>Документы</strong><em>' +
      (freshFiles ? freshFiles + ' ' + plural(freshFiles, 'новый файл', 'новых файла', 'новых файлов')
                  : files + ' ' + plural(files, 'файл', 'файла', 'файлов')) +
      '</em></div><i aria-hidden="true">→</i></button>' +
      '<button type="button" data-tab="wallet"><span aria-hidden="true">' + accountIcon('wallet') + '</span><div>' +
      '<small>Средства</small><strong>Счёт и клуб</strong><em>' + money(dep.balance || 0) +
      ' ₽ · ' + money(bon.balance || 0) + ' бонусов</em></div><i aria-hidden="true">→</i></button></nav>';
    return '<section class="account-summary" data-account-brief>' +
      '<article><span class="status-dot"><i></i> В работе</span><strong>' + act + '</strong><p>' +
      plural(act, 'дело в работе', 'дела в работе', 'дел в работе') + '</p></article>' +
      '<article><span>Ждёт вас</span><strong>' + attention + '</strong><p>' +
      plural(attention, 'решение по делу', 'решения по делам', 'решений по делам') + '</p></article>' +
      '<article><span>Новое</span><strong>' + unread + '</strong><p>' +
      plural(unread, 'сообщение или файл', 'сообщения или файла', 'сообщений или файлов') + '</p></article>' +
      '</section>' +
      '<div class="account-home-focus' + (agenda ? '' : ' is-single') + '">' +
      '<div class="account-home-focus__primary">' + priority + '</div>' +
      (agenda ? '<aside class="account-home-focus__agenda" aria-label="Ближайшие даты">' +
        agenda + '</aside>' : '') + '</div>' +
      '<div class="account-home-cases">' + draftSection(true) +
      (st.orders.length ? ordersRegister('', true) :
        '<section class="account-orders"><header><h2>Ваши дела</h2></header>' +
        '<div class="account-empty"><p>Здесь появятся сроки, файлы и сообщения мастера.</p>' +
        '<a class="button button--primary" href="configurator.html">Описать задачу</a></div></section>') +
      '</div>' + tools;
  }

  function loginNudge(what) {
    return '<section class="account-section reveal">' +
      '<header><div><p class="eyebrow">' + what + '</p>' +
      '<h2>Кошелёк, бонусы и абонемент — после входа.</h2></div></header>' +
      '<p class="case-sec__lead">Всё это привязано к аккаунту. Войдите — данные появятся здесь.</p>' +
      '<div class="case-acts"><button type="button" class="btn btn-wax" id="cabTg">Войти через Telegram</button></div></section>';
  }

  function paymentDocumentsCard() {
    if (!st.me) return '';
    var docs = st.me.payment_confirmations || [];
    if (!docs.length) return '';
    return '<section class="account-section account-payment-documents reveal">' +
      '<header><div><p class="eyebrow">Документы</p>' +
      '<h2>Подтверждения оплаты.</h2></div>' +
      '<span class="account-count">' + docs.length + '</span></header>' +
      '<div class="account-doc-list">' + docs.map(function (d) {
        var ref = d.scope === 'order' ? 'заказ № ' + d.reference : 'абонемент и счета';
        var filename = 'podtverzhdenie-oplaty-' + (d.scope || 'payment') +
          '-' + d.reference + '-' + d.id + '.pdf';
        return '<div class="account-doc-list__row">' +
          '<span class="account-doc-list__mark" aria-hidden="true">PDF</span>' +
          '<span><strong>' + esc(d.label || 'Оплата') + '</strong>' +
          '<small>' + ref + '</small></span>' +
          '<b>' + money(d.amount || 0) + ' ₽</b>' +
          '<i class="account-doc-list__at">' + dt(d.at) + '</i>' +
          '<a class="line-link" href="#" data-protected-asset="' +
          esc(d.url || '') + '" data-filename="' + esc(filename) +
          '">Скачать</a></div>';
      }).join('') + '</div>' +
      '<details class="account-document-note"><summary>О подтверждении и налоговом чеке</summary>' +
      '<p>PDF подтверждает платёж мастерской и хранится в кабинете. Это не налоговый чек НПД: ' +
      'официальный чек Robokassa отправляет отдельно на почту, указанную при оплате.</p></details></section>';
  }

  /* сумма, которую дело ждёт от клиента прямо сейчас. В списке /orders
     нет payments/plan — считаем только по полям, которые там точно есть,
     и ничего не выдумываем про уже оплаченное. */
  function dueOf(o) {
    if (o.due_now && o.due_now.amount) return o.due_now.amount;
    if (o.status === 'prepay') return o.prepay_due || o.prepay || 0;
    return 0;
  }

  /* -------- «Платежи»: деньги по всем делам одной сводкой --------
     До этой правки пункты меню «Платежи» и «Депозит» открывали ОДИН и тот же
     экран (обе ветки renderTab звали walletTab) — два названия, одно
     содержимое, и ни в одном не было ответа на главный денежный вопрос:
     сколько всего ждут от меня сейчас и по каким делам. */
  function payLedgerCard() {
    var rows = [], total = 0;
    visibleOrders().forEach(function (o) {
      var due = dueOf(o);
      if (!due) return;
      total += due;
      rows.push('<button type="button" class="account-ledger__row account-ledger__row--act" ' +
        'data-now-open="' + o.id + '" data-now-jump="secPay">' +
        '<span class="account-ledger__what"><b>' + esc(o.no || ('№ ' + o.id)) + '</b> · ' +
        esc(shortWork(o)) +
        ((o.stages_total || 1) > 1 ? ' <i class="account-ledger__at">этап ' + (o.stage || 1) +
          ' из ' + o.stages_total + '</i>' : '') + '</span>' +
        '<span class="account-ledger__delta is-due">' + money(due) + ' ₽</span></button>');
    });
    var head = money(total) + ' ₽';
    var title = total ? 'К оплате по делам.' : 'Сейчас платить не нужно.';
    var note = total
      ? 'Оплата идёт по каждому делу отдельно: этап закрывается целиком. ' +
        'Откройте дело — там реквизиты, оплата картой и подтверждение.'
      : 'Следующий счёт появится здесь, когда мастер подготовит результат этапа. ' +
        'Заранее платить не нужно.';
    return '<section class="account-section account-finance-primary reveal">' +
      '<header><div><p class="eyebrow">Платежи</p>' +
      '<h2>' + title + '</h2></div>' +
      '<button type="button" class="line-link" data-tab="orders">Все дела ' +
      '<span aria-hidden="true">→</span></button></header>' +
      '<div class="account-panel">' +
      '<header><span>К оплате сейчас</span><small>АС · СЧЁТ</small></header>' +
      '<strong class="account-panel__figure">' + head + '</strong>' +
      '<p>' + note + '</p>' +
      (rows.length ? '<div class="account-ledger">' + rows.join('') + '</div>' : '') +
      '</div></section>';
  }

  function walletTab() {
    if (!S.api.identified()) return loginNudge('Платежи — после входа');
    var docs = paymentDocumentsCard();
    return accountTabs() + promoHintStrip() +
      '<div class="account-finance-layout' + (docs ? '' : ' is-single') + '">' +
      '<div class="account-finance-main">' + payLedgerCard() + '</div>' +
      (docs ? '<aside class="account-finance-side" aria-label="Подтверждения оплаты">' +
        docs + '</aside>' : '') + '</div>';
  }

  /* Локальные вкладки одного раздела стойки. Старые маршруты #deposit/#club
     остаются прямыми ссылками, но больше не конкурируют с делами глобально. */
  function accountTabs() {
    var me = st.me || {};
    var dep = me.deposit || {};
    var bon = me.bonus || {};
    var due = visibleOrders().reduce(function (sum, o) { return sum + dueOf(o); }, 0);
    var clubState = me.sub_pending
      ? 'Платёж на сверке'
      : me.sub ? 'Активен до ' + esc(me.sub.expires_ru) : 'Не подключён';
    var items = [
      { tab: 'wallet', label: 'Платежи', mark: '₽',
        value: due ? money(due) + ' ₽ к оплате' : 'Счетов сейчас нет' },
      { tab: 'deposit', label: 'Депозит и бонусы', mark: '◆',
        value: money(dep.balance || 0) + ' ₽ · ' + money(bon.balance || 0) + ' бонусов' },
      { tab: 'club', label: 'Клуб Салона', mark: 'АС+', value: clubState }
    ];
    return '<nav class="account-tabs account-money-route" aria-label="Счёт и клуб">' + items.map(function (item) {
      var current = st.tab === item.tab;
      return '<button type="button" class="' + (current ? 'is-current' : '') +
        '" data-tab="' + item.tab + '" aria-current="' + (current ? 'page' : 'false') + '">' +
        '<i class="account-money-route__mark" aria-hidden="true">' + item.mark + '</i>' +
        '<span class="account-money-route__copy"><strong>' + item.label + '</strong>' +
        '<small>' + item.value + '</small></span>' +
        '<b class="account-money-route__arrow" aria-hidden="true">→</b></button>';
    }).join('') + '</nav>';
  }

  /* «Депозит и бонусы» — свой экран, а не копия «Платежей» */
  function depositTab() {
    if (!st.me) return loginNudge('Счета мастерской — после входа');
    return accountTabs() +
      '<div class="account-balance-layout"><div class="account-balance-main">' + depCard() +
      '</div><aside class="account-balance-aside" aria-label="Бонусный счёт">' +
      bonusCard() + '</aside></div>';
  }

  function clubTab() {
    if (!st.me) return loginNudge('Клуб — после входа');
    var pend = st.me.sub_pending;
    /* subCard сам добавляет plusSection при plusOpen — второй раз не звать,
       иначе витрина и все её id (plusSheet/ctorBox) задваиваются */
    return accountTabs() + (pend
      ? subPendingCard(pend) + (st.plusOpen ? plusSection() : '')
      : subCard());
  }

  function helpTab() {
    var access = '';
    if (!st.me) {
      st.orders.forEach(function (o) { access += accessBlock(o, true); });
    }
    /* подтверждения оплаты живут в «Документах» и «Платежах» — помощь
       отвечает только за связь и короткие маршруты к правилам. */
    return access + '<section class="account-support-hub reveal">' +
      '<div class="account-support-layout">' +
      '<div class="account-support-primary"><span class="account-support-primary__mark" aria-hidden="true">?</span>' +
      '<div><p class="eyebrow">По текущему делу</p><h2>Напишите мастеру прямо из кабинета.</h2>' +
      '<p>Сообщение попадёт в рабочую переписку вместе с номером дела. Не придётся заново объяснять контекст.</p>' +
      '<div class="account-support-actions"><button type="button" class="button button--primary" data-contact="1">' +
      'Написать мастеру</button><a class="line-link" href="https://t.me/academic_saloon_bot" ' +
      'target="_blank" rel="noopener">Открыть Telegram-бот <span aria-hidden="true">→</span></a></div></div></div>' +
      '<aside class="account-support-reception"><p class="eyebrow">Общий вопрос</p>' +
      '<h2>Открытая приёмная.</h2><p>Для вопроса без активного дела, предложения или обращения к мастерской.</p>' +
      '<a class="button button--secondary" href="priyomnaya.html">Перейти в приёмную</a>' +
      '<footer><span>АС · ПРИЁМНАЯ</span><b>сообщение сохранится отдельно от дела</b></footer></aside></div>' +
      '<nav class="account-support-guides" aria-label="Справка и правила">' +
      '<a href="start.html"><span>01</span><div><strong>С чего начать</strong><small>как устроен путь клиента</small></div><i>→</i></a>' +
      '<a href="guarantees.html"><span>02</span><div><strong>Гарантии и устав</strong><small>границы и обязательства</small></div><i>→</i></a>' +
      '<a href="oplata.html"><span>03</span><div><strong>Как проходит оплата</strong><small>этапы, чеки и подтверждения</small></div><i>→</i></a>' +
      '<a href="loyalty.html"><span>04</span><div><strong>Бонусы и депозит</strong><small>начисление и списание</small></div><i>→</i></a>' +
      '<a href="oferta.html"><span>05</span><div><strong>Оферта</strong><small>условия редакторских услуг</small></div><i>→</i></a>' +
      '<a href="privacy.html"><span>06</span><div><strong>Данные и приватность</strong><small>согласия и настройки</small></div><i>→</i></a>' +
      '</nav></section>';
  }

  function settingsTab() {
    var user = S.api.token() && S.api.user();
    var name = user && user.name ? String(user.name).trim() : 'Гостевой доступ';
    var parts = name.split(/\s+/);
    var initials = user
      ? ((parts[0] || 'А').charAt(0) + (parts[1] || '').charAt(0)).toUpperCase()
      : 'АС';
    var joined = user && user.created_at ? new Date(user.created_at) : null;
    var joinedLabel = joined && !isNaN(joined.getTime())
      ? 'в мастерской с ' + joined.getFullYear() + ' года'
      : (user ? 'подтверждённый аккаунт' : 'доступ по ссылке дела');
    var dark = S.theme && S.theme.current && S.theme.current() === 'dark';
    var calm = S.calm && S.calm.on && S.calm.on();
    var themeControl = S.themeToggleHTML ? S.themeToggleHTML() : '';
    if (themeControl) themeControl = themeControl.replace('type="button"',
      'type="button" aria-pressed="' + dark + '"');
    var calmControl = S.calmToggleHTML ? S.calmToggleHTML() : '';
    if (calm && calmControl) {
      calmControl = calmControl.replace('aria-pressed="false"', 'aria-pressed="true"')
        .replace('class="ct-wave"', 'class="ct-wave" style="display:none"')
        .replace('class="ct-flat" d="M4 12h16" style="display:none"',
          'class="ct-flat" d="M4 12h16"');
    }
    return '<section class="account-settings-profile reveal">' +
      '<span class="account-settings-profile__avatar" aria-hidden="true">' + esc(initials) + '</span>' +
      '<div><p class="eyebrow">Профиль кабинета</p><h2>' + esc(name) + '</h2><p>' + joinedLabel + '</p></div>' +
      '<span class="account-settings-profile__state"><i></i>' +
      (user ? 'Вход подтверждён' : 'Гостевой режим') + '</span></section>' +
      '<div class="account-settings-layout">' +
      '<section class="account-settings-panel reveal"><header><div><p class="eyebrow">Интерфейс</p>' +
      '<h2>Вид и комфорт.</h2></div></header>' +
      '<div class="account-setting-row"><span class="account-setting-row__mark" aria-hidden="true">◐</span>' +
      '<div><small>Оформление</small><strong data-theme-label>' + (dark ? 'Тёмная тема' : 'Светлая тема') + '</strong>' +
      '<p>Фирменная палитра сохраняется в обоих режимах.</p></div>' + themeControl + '</div>' +
      '<div class="account-setting-row"><span class="account-setting-row__mark" aria-hidden="true">≈</span>' +
      '<div><small>Движение</small><strong data-calm-label>' + (calm ? 'Анимации выключены' : 'Режим без анимаций') + '</strong>' +
      '<p>Можно убрать переходы и декоративное движение.</p></div>' + calmControl + '</div>' +
      notiRow() + '</section>' +
      '<section class="account-settings-panel reveal"><header><div><p class="eyebrow">Доступ и данные</p>' +
      '<h2>Безопасность кабинета.</h2></div></header>' + linksRow() +
      '<div class="account-setting-row"><span class="account-setting-row__mark" aria-hidden="true">§</span>' +
      '<div><small>Конфиденциальность</small><strong>Данные и согласия</strong>' +
      '<p>Аналитика, обращения и правила обработки данных.</p></div>' +
      '<a class="line-link" href="privacy.html">Настроить <span aria-hidden="true">→</span></a></div>' +
      '<footer class="account-settings-session">' +
      (S.api.token()
        ? '<button type="button" class="line-link" id="cabLogout">Выйти из кабинета</button>'
        : '<button type="button" class="button button--primary" id="cabTg">Войти через Telegram</button>') +
      '<small>' + (user ? 'Дела останутся в аккаунте и снова появятся после входа.'
                          : 'Вход объединит доступ к делам на ваших устройствах.') + '</small></footer></section></div>';
  }

  /* -------- «Документы»: сами файлы, а не ещё одна копия реестра дел -------
     Вкладка носила бейдж с числом файлов, но показывала карточки дел —
     ни одного файла в ней не было. Сервер отдаёт files в списке не всегда,
     поэтому: есть files — показываем строки файлов, нет — честную строку
     дела со счётчиком и переходом сразу в раздел «Документы» этого дела. */
  function docsByOrder() {
    var out = [];
    visibleOrders().forEach(function (o) {
      var files = (o.files || []).slice();
      var count = files.length || o.files_count || 0;
      if (!count) return;
      files.sort(function (a, b) { return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; });
      out.push({ order: o, files: files, count: count });
    });
    return out;
  }

  function documentSummary(groups) {
    var total = groups.reduce(function (sum, g) { return sum + (g.count || 0); }, 0);
    var fresh = visibleOrders().reduce(function (sum, o) { return sum + (o.files_new || 0); }, 0);
    var payments = st.me && st.me.payment_confirmations ? st.me.payment_confirmations.length : 0;
    return '<section class="account-document-summary reveal" aria-label="Сводка документов">' +
      '<article><span aria-hidden="true">' + accountIcon('documents') + '</span><div><small>Материалы</small><strong>' + total + '</strong>' +
      '<p>' + plural(total, 'файл в делах', 'файла в делах', 'файлов в делах') + '</p></div></article>' +
      '<article class="' + (fresh ? 'is-fresh' : '') + '"><span aria-hidden="true">' + accountIcon('spark') + '</span><div>' +
      '<small>Новые</small><strong>' + fresh + '</strong><p>' +
      (fresh ? 'от мастерской' : 'всё просмотрено') + '</p></div></article>' +
      '<article><span aria-hidden="true">' + accountIcon('wallet') + '</span><div><small>Оплата</small><strong>' + payments + '</strong>' +
      '<p>' + plural(payments, 'подтверждение', 'подтверждения', 'подтверждений') + '</p></div></article>' +
      '</section>';
  }

  function documentTab() {
    if (!st.orders.length) return tplEmpty();
    var groups = docsByOrder();
    var summary = documentSummary(groups);
    var receipts = paymentDocumentsCard();
    if (!groups.length) {
      return summary + receipts +
        '<section class="account-section reveal"><header><div><p class="eyebrow">Документы</p>' +
        '<h2>Файлов пока нет.</h2></div></header>' +
        '<div class="account-empty"><p>Здесь появятся результаты этапов, отчёты проверок и ваши ' +
        'приложенные материалы. Методичку или задание можно приложить прямо в деле.</p>' +
        '<button type="button" class="button button--secondary" data-tab="orders">К делам</button>' +
        '</div></section>';
    }
    var body = groups.map(function (g) {
      var o = g.order;
      var rows = g.files.length
        ? g.files.map(function (f) {
            var bits = [f.from === 'master' ? 'от мастерской' : 'ваш файл', dt(f.at)];
            if (f.label) bits.push(esc(f.label));
            return '<a class="file-row" href="#" data-protected-asset="' +
              apiPath(o.id, '/file/' + f.id) + '" data-order-id="' + o.id +
              '" data-filename="' + esc(f.name) + '">' +
              '<i aria-hidden="true">' + fileExt(f.name) + '</i>' +
              '<span><strong>' + esc(f.name) + '</strong><small>' + bits.join(' · ') +
              '</small></span>' + (f.new ? '<b class="file-row__new">новый</b>' : '') + '</a>';
          }).join('')
        : '<p class="case-sec__lead">' + g.count + ' ' +
          plural(g.count, 'файл', 'файла', 'файлов') + ' по этому делу. ' +
          'Откройте дело — файлы в разделе «Документы».</p>';
      /* компактная шапка группы: три полноразмерных заголовка раздела
         подряд отталкивали сами файлы вниз на целый экран */
      return '<section class="account-docgroup' + (o.files_new ? ' account-docgroup--fresh' : '') + ' reveal">' +
        '<header><div class="account-docgroup__identity"><span class="account-docgroup__no">' +
        esc(o.no || ('№ ' + o.id)) + '</span><strong>' + esc(o.work_label || 'Дело') + '</strong></div>' +
        '<span class="account-docgroup__count">' + g.count + '</span>' +
        '<button type="button" class="line-link" data-now-open="' + o.id +
        '" data-now-jump="secFiles">Открыть дело <span aria-hidden="true">→</span></button></header>' +
        '<div class="case-files">' + rows + '</div></section>';
    }).join('');
    return summary + '<div class="account-document-layout' + (receipts ? '' : ' is-single') + '">' +
      '<div class="account-document-folders" aria-label="Папки дел">' + body + '</div>' +
      (receipts ? '<aside class="account-document-receipts" aria-label="Подтверждения оплаты">' +
        receipts + '</aside>' : '') + '</div>';
  }

  /* -------- «Сообщения»: переписки, а не копия реестра -------- */
  function messagesTab() {
    if (!st.orders.length) return tplEmpty();
    var conversations = visibleOrders().map(function (o) {
      var msgs = (o.messages || []).slice();
      var last = msgs.length ? msgs[msgs.length - 1] : null;
      var preview = last
        ? (last.from === 'client' ? 'Вы: ' : 'Мастерская: ') +
          String(last.text || 'вложение').slice(0, 120)
        : (o.unread ? 'Есть непрочитанное' : 'Переписки по делу пока нет');
      return { order: o, last: last, preview: preview };
    }).sort(function (a, b) {
      var unread = (b.order.unread || 0) - (a.order.unread || 0);
      if (unread) return unread;
      var ba = (b.last && b.last.at) || b.order.updated_at || '';
      var aa = (a.last && a.last.at) || a.order.updated_at || '';
      return ba < aa ? -1 : ba > aa ? 1 : 0;
    });
    function conversationRow(c) {
      var o = c.order, last = c.last;
      return '<button type="button" class="account-conversation' +
        (o.unread ? ' is-unread' : '') + '" ' +
        'data-now-open="' + o.id + '" data-now-jump="secChat">' +
        '<span class="account-conversation__mark" aria-hidden="true">' + accountIcon('messages') + '</span>' +
        '<span class="account-conversation__body"><span><b>' + esc(o.no || ('№ ' + o.id)) + '</b>' +
        '<small>' + esc(o.status_label || shortStatus(o)) + '</small></span>' +
        '<strong>' + esc(shortWork(o)) + '</strong><i>' + esc(c.preview) + '</i></span>' +
        '<span class="account-conversation__meta"><time>' + (last ? dt(last.at) : '') + '</time>' +
        (o.unread ? '<b>' + o.unread + ' ' + plural(o.unread, 'новое', 'новых', 'новых') + '</b>' : '') +
        '<i aria-hidden="true">→</i></span>' +
        '</button>';
    }
    function conversationGroup(title, note, pool) {
      if (!pool.length) return '';
      return '<section class="account-conversation-group"><header><div><h3>' + title + '</h3>' +
        '<p>' + note + '</p></div><span>' + pool.length + '</span></header>' +
        '<div class="account-conversation-list">' + pool.map(conversationRow).join('') + '</div></section>';
    }
    var unread = conversations.filter(function (c) { return !!c.order.unread; });
    var quiet = conversations.filter(function (c) { return !c.order.unread; });
    return '<section class="account-conversations reveal">' +
      '<header><div><p class="eyebrow">Переписка</p><h2>' +
      (unread.length ? 'Сначала новые сообщения.' : 'Все сообщения прочитаны.') + '</h2></div>' +
      '<button type="button" class="line-link" data-tab="orders">Все дела ' +
      '<span aria-hidden="true">→</span></button></header>' +
      conversationGroup('Новые', 'разговоры, где появилось сообщение мастера', unread) +
      conversationGroup(unread.length ? 'Остальные' : 'Разговоры по делам',
        'история остаётся привязана к номеру дела', quiet) + '</section>';
  }

  function ordersTab() {
    if (!st.orders.length) return tplEmpty();
    return nowCard() + draftSection() + ordersRegister('');
  }

  /* дело открыто? тогда рабочая полоса — это экран дела, как маршрут эталона:
     список сюда не подмешивается, возврат к нему — ссылкой в шапке дела */
  function caseVisible() {
    return !!(st.caseOpen && st.currentId &&
      (st.tab === 'orders' || st.tab === 'messages' || st.tab === 'documents' || st.tab === 'home'));
  }

  /* дело ещё летит по сети: та же шапка-возврат и честная строка ожидания */
  function caseLoading() {
    return '<article class="case-file reveal">' +
      '<header class="case-file__head"><div class="case-file__title">' +
      '<button type="button" class="back-link" id="accountCaseBack" data-case-back>' +
      '<span aria-hidden="true">←</span> ' + caseBackLabel() + '</button>' +
      '<p class="eyebrow case-file__no">Дело № ' + st.currentId + '</p>' +
      '<h2>Открываем дело…</h2></div></header>' +
      '<div class="account-loading" role="status">Проверяем этапы, файлы и последние сообщения.</div>' +
      '</article>';
  }

  /* Раздел не собрался — показываем состояние, а не тишину.
     Раньше исключение в любом шаблоне гасило весь renderTab до render():
     экран молча оставался на ПРЕДЫДУЩЕЙ вкладке, адрес уже показывал новую.
     Человек жал «Помощь» и не понимал, почему ничего не происходит. */
  function safeBlock(name, fn) {
    try { return fn(); }
    catch (e) {
      try { if (window.console && console.error) console.error('cabinet:' + name, e); } catch (e2) {}
      return '<div class="case-state case-state--error">' +
        '<header><span>сбой</span><i aria-hidden="true"></i></header>' +
        '<div class="case-state__body">' +
        '<span class="case-state__mark" aria-hidden="true">×</span>' +
        '<h2>Раздел не собрался</h2>' +
        '<p>Ваши дела, файлы и платежи в порядке — не открылся только этот экран. ' +
        'Обновите страницу или откройте другой раздел.</p>' +
        '</div>' +
        '<footer class="case-acts">' +
        '<button type="button" class="btn btn-line" id="cabRetry">Обновить</button></footer>' +
        '</div>';
    }
  }

  function renderTab() {
    var inner = safeBlock(st.tab || 'home', function () {
      if (st.tab === 'orders') return ordersTab();
      if (st.tab === 'messages') return messagesTab();
      if (st.tab === 'documents') return documentTab();
      if (st.tab === 'wallet') return walletTab();
      if (st.tab === 'deposit') return depositTab();
      if (st.tab === 'club') return clubTab();
      if (st.tab === 'help') return helpTab();
      if (st.tab === 'settings') return settingsTab();
      return homeTab();
    });
    var body = caseVisible()
      ? '<section class="account-case-production">' +
        safeBlock('case', function () {
          return (st.detail && st.detail.id === st.currentId) ? tplDetail() : caseLoading();
        }) + '</section>'
      /* незакрытая оплата абонемента не прячется ни в одном разделе —
         функция была написана ровно для этого, но её никто не звал, и
         напоминание жило только во вкладке «Клуб Салона» */
      : tabHead() + '<div class="account-main__body">' +
        (st.tab === 'club' ? '' : subPendingBand()) + inner + '</div>';
    render(impBanner() + '<div class="account-shell">' +
      '<aside class="account-nav">' + profileCard() + navSide() + sideFoot() + '</aside>' +
      '<main class="account-main" id="accountWorkspace" data-account-tab="' + esc(st.tab || 'home') +
      '" data-account-case="' + (caseVisible() ? 'true' : 'false') + '" tabindex="-1">' + body + '</main>' +
      '</div>' + dockTabs());
    /* В мобильной ленте активный раздел остаётся в поле зрения даже для
       крайних пунктов «Помощь» и «Настройки». Геометрию меняем только у
       горизонтальной навигации — вертикальная позиция страницы не прыгает. */
    if (window.innerWidth <= 920) {
      function bindOverflowCue(nav) {
        if (!nav) return;
        var cueHost = nav.closest('.account-nav') || nav;
        function syncOverflowCue() {
          var hiddenRight = nav.scrollWidth - nav.clientWidth - nav.scrollLeft;
          cueHost.classList.toggle('has-more-right', hiddenRight > 6);
        }
        nav.addEventListener('scroll', syncOverflowCue, { passive: true });
        requestAnimationFrame(syncOverflowCue);
      }
      var mobileNav = root.querySelector('.account-nav nav');
      bindOverflowCue(mobileNav);
      var caseNav = root.querySelector('.account-case-production .case-secnav');
      var caseCurrent = caseNav && caseNav.querySelector('.oj.is-on');
      bindOverflowCue(caseNav);
      if (caseNav && caseCurrent) {
        requestAnimationFrame(function () {
          var nr = caseNav.getBoundingClientRect();
          var cr = caseCurrent.getBoundingClientRect();
          caseNav.scrollLeft += cr.left - nr.left - (nr.width - cr.width) / 2;
        });
      }
    }
    if (hashDepositScroll && st.tab === 'deposit') {
      hashDepositScroll = false;
      requestAnimationFrame(function () { scrollToEl('depCard'); });
    }
    if (hashCuratorScroll && document.getElementById('curatorBox')) {
      hashCuratorScroll = false;
      requestAnimationFrame(function () { scrollToEl('curatorBox'); });
    }
    if (hashBuilderScroll && document.getElementById('ctorBox')) {
      hashBuilderScroll = false;
      requestAnimationFrame(function () { scrollToEl('ctorBox'); });
    }
    /* док появился ПОСЛЕ замеров app.js: будим measure() — иначе --floor=0
       и угловые пилюли («Связаться», куки) налезают на док до первого resize */
    if (!renderTab._floorSynced) {
      renderTab._floorSynced = true;
      try { window.dispatchEvent(new Event('resize')); } catch (e) {}
    }
  }

  /* цена ещё не принята — расчёт обязан стоять выше кнопки «Принять» */
  function decideFirst(o) {
    return 'new priced'.indexOf(o.status) >= 0;
  }

  function tplDetail() {
    var o = st.detail;
    var meta = [];
    if (o.deadline_text) meta.push('срок: ' + esc(o.deadline_text));
    meta.push('заявка от ' + dt(o.created_at));
    var pinTitle = o.pinned ? 'Открепить дело' : 'Закрепить дело первым в списке';
    /* Дело — отдельный экран, как маршрут #/order в эталоне: возврат к списку,
       шапка с номером и статусом, дальше разворот из двух колонок. В главной —
       всё, что требует решения и денег, ход дела и переписка; в правой стойке —
       документы, сводка оплаты, служебное (управление, доступ) и помощь. */
    return '<article class="case-file reveal" aria-label="Дело заказа ' + esc(o.no) + '">' +
      '<header class="case-file__head"><div class="case-file__title">' +
      '<button type="button" class="back-link" id="accountCaseBack" data-case-back>' +
      '<span aria-hidden="true">←</span> ' + caseBackLabel() + '</button>' +
      '<p class="eyebrow case-file__no">Дело ' + esc(o.no) + '</p>' +
      '<h2>' + esc(o.work_label || '') + '</h2>' +
      (o.topic ? '<p class="case-file__topic">Тема: «' + esc(o.topic) + '»</p>' : '') +
      '<p class="case-file__meta">' + meta.join(' · ') + ' ' + deadlineChip(o) + '</p></div>' +
      '<div class="case-file__status">' +
      (o.paused ? '<span class="tag">пауза</span>' : '') +
      '<span class="tag tag--status tag--' + esc(o.status || '') + '">' + esc(o.status_label) + '</span>' +
      '<button type="button" class="quiet-button' + (o.pinned ? ' is-on' : '') + '" data-act-pin title="' + pinTitle + '" aria-label="' + pinTitle + '" aria-pressed="' + !!o.pinned + '">' +
      (o.pinned ? 'закреплено' : 'закрепить') + '</button>' +
      '</div></header>' +
      /* ленты внимания живут НАД разделами: что от вас ждут прямо сейчас,
         видно из любого раздела дела, а не только из того, где лежит кнопка */
      '<div class="case-bands">' +
      pauseBand(o) + finalBand(o) + partBand(o) + dueBand(o) +
      '</div>' +
      jumpChips(o) +
      '<div class="case-body" id="caseSecBody" data-case-section="' + esc(caseSecOf(o)) +
      '" role="tabpanel" aria-label="Раздел дела">' +
      caseSecBody(o) +
      '</div>' +
      (isArch(o) ? '<footer class="case-file__foot">' +
        '<p>Дело ' + (o.status === 'done' ? 'завершено' : 'закрыто') + '. ' +
        (o.archived
          ? 'Оно убрано в архив и не показывается в списке.'
          : 'Дело можно убрать в архив: оно исчезнет из списка, вернуть можно в любой момент («Архив → убранные»).') +
        '</p>' +
        (o.archived
          ? '<button type="button" class="line-link" data-act="unarchive">Вернуть в список <span aria-hidden="true">→</span></button>'
          : '<button type="button" class="line-link" data-act="archive">Убрать в архив <span aria-hidden="true">→</span></button>') +
        '</footer>' : '') +
      '</article>' +
      '<p class="cab-foot-sync">Всё по заказу живёт в этом кабинете. Привязан Telegram? Дублируем статусы и в бота: ' +
      '<a class="link" href="https://t.me/academic_saloon_bot" target="_blank" rel="noopener">@academic_saloon_bot</a></p>';
  }

  /* ---------------- загрузка данных ---------------- */
  function ensureFeatures() {
    if (st.features !== null) return;
    st.features = false; /* запрошено — не дублируем */
    S.api.get('/features').then(function (r) {
      st.features = (r && r.ok) ? r : {};
      /* экран входа уже на месте — дорисуем опцию почты */
      if (!S.api.identified() && document.getElementById('cabTg')) render(tplLogin(lastPending));
    });
  }

  function loadList(keepCurrent) {
    var t = S.api.token(), g = S.api.guestTokens();
    if (!S.api.identified()) {
      /* если вход уже запущен (в т.ч. до перезагрузки страницы) — продолжаем ловить */
      var pending = S.resumeTgLogin(
        function (u) { toast('Вы вошли' + (u && u.name ? ', ' + u.name : '') + '.'); loadList(); },
        function () { lastPending = null; render(tplLogin(null)); });
      lastPending = pending;
      render(tplLogin(pending));
      ensureFeatures();
      return;
    }
    /* первая загрузка: короткое живое состояние вместо безымянных серых блоков */
    if (!root.querySelector('.account-shell') && !root.querySelector('.cab-login')) {
      render('<main class="account-entry-state account-entry-state--loading reveal" id="accountWorkspace" tabindex="-1">' +
        '<section class="account-loader" role="status" aria-live="polite">' +
          '<span class="account-loader__seal" aria-hidden="true">АС</span>' +
          '<div><p class="eyebrow">Личный зал</p><h1>Собираем ваш формуляр</h1>' +
          '<p>Сверяем дела, новые сообщения и документы. Это займёт несколько секунд.</p>' +
          '<span class="account-loader__line" aria-hidden="true"><i></i></span></div>' +
        '</section></main>');
    }
    if (t) {
      S.api.get('/me').then(function (r) {
        if (r.ok) {
          if (st.oauthNotice && st.oauthNotice.verify) {
            var verifiedProvider = st.oauthNotice.provider;
            var verified = (r.oauth || []).indexOf(verifiedProvider) >= 0;
            st.oauthNotice = verified
              ? { provider: verifiedProvider, status: 'success' }
              : { provider: verifiedProvider, status: 'error', error: 'network' };
            toast(verified
              ? ({ vk: 'VK ID', mailru: 'Mail ID', max: 'MAX' }[verifiedProvider] || 'Способ входа') + ' подключён'
              : 'Не удалось подтвердить подключение — текущий вход сохранён');
          }
          st.me = r;
          meSnap = meSnapshot(r);
          rerenderHome(); /* карточки бонусов/подписки — и при пустой картотеке */
          if (hashPlusScroll) {
            hashPlusScroll = false;
            scrollToEl(r.sub_pending ? 'subPaySheet' : 'plusCard');
          }
        }
      });
    } else {
      st.me = null;
    }
    /* токены шлём ВСЕГДА, когда они есть: сервер склеивает «сессия + гостевые
       дела», но раньше при живом входе tokens не передавались вовсе — человек
       с аккаунтом сайта, оплативший заявку по ссылке, не видел это дело
       и не мог оплатить вторую часть */
    S.api.get('/orders', ordersHeaders(g)).then(function (r) {
      if (!r.ok) { render(tplError()); return; }
      st.orders = r.orders || [];
      watchSync();
      if (!st.orders.length) { renderTab(); return; }
      var visible = visibleOrders();
      /* все дела убраны в архив — иначе реестр выглядел бы пустым */
      if (!visible.length) st.remOpen = true;
      var pool = visible.length ? visible : st.orders;
      var current = pool.some(function (o) { return o.id === st.currentId; });
      /* дело выбрано адресом (#order-231) — список не имеет права его сменить */
      if ((!keepCurrent && !st.caseOpen) || !current) {
        if (!(st.caseOpen && current)) st.currentId = pickDefaultId();
      }
      if (!st.currentId) { renderTab(); return; }
      /* выбранное дело лежит среди убранных — покажем их в реестре */
      var cur = st.orders.filter(function (o) { return o.id === st.currentId; })[0];
      if (cur && isRemoved(cur)) st.remOpen = true;
      loadDetail();
    });
  }

  /* снапшот для «живых уведомлений» на остальных страницах сайта:
     кабинет — источник правды, здесь всё уже увидено */
  function watchSync() {
    try {
      var snap = {};
      st.orders.forEach(function (o) { snap[o.id] = { s: o.status, u: 0, f: 0 }; });
      S.store.set('salon_watch', snap);
    } catch (e) {}
  }

  function renderCurrent() {
    /* без открытого дела — обычный ре-рендер вкладки: иначе журналы
       кошелька/бонусов и переключатели архива молчали при st.detail=null */
    var uiSnap = captureAccountUi();
    if (!st.detail) { renderTab(); restoreAccountUi(uiSnap); return; }
    var draft = (document.getElementById('chatText') || {}).value || '';
    var fixDraft = (document.getElementById('fixText') || {}).value || '';
    var fixForm = document.getElementById('fixForm');
    var fixOpen = !!(fixForm && !fixForm.hidden);
    renderTab();
    var ta = document.getElementById('chatText');
    if (ta && draft) ta.value = draft;
    var fixTa = document.getElementById('fixText');
    var nextFixForm = document.getElementById('fixForm');
    if (fixTa && fixDraft) fixTa.value = fixDraft;
    if (nextFixForm && fixOpen) nextFixForm.hidden = false;
    restoreAccountUi(uiSnap);
  }

  function scheduleFilesSeen(order) {
    /* метки «новый файл» гасим только после того, как клиент реально
       посмотрел на дело: 7 секунд видимой страницы с открытой карточкой.
       В «тихом» режиме мастера — не трогаем (сервер тоже гардит) */
    if (impMode()) return;
    if (seenTimer) { clearTimeout(seenTimer); seenTimer = null; }
    var hasNew = (order.files || []).some(function (f) { return f.new; });
    if (!hasNew || !st.caseOpen) return; /* дело закрыто экраном — метки не гасим */
    var id = order.id;
    seenTimer = setTimeout(function () {
      if (document.hidden || st.currentId !== id || !st.caseOpen) return;
      var body = { action: 'files_seen' };
      S.api.post('/orders/' + id + '/action', body, orderHeaders(id));
    }, 7000);
  }

  function loadDetail(silent) {
    var id = st.currentId;
    var requestSeq = ++st.detailRequestSeq;
    S.api.get(apiPath(id), orderHeaders(id)).then(function (r) {
      if (requestSeq !== st.detailRequestSeq || id !== st.currentId) return;
      if (!r.ok) { if (!silent) render(tplError()); return; }
      var was = st.detail;
      /* полное сравнение: платежи/план/готовность части меняются без
         updated_at заказа — раньше карточка не замечала подтверждение оплаты */
      var changed = !was || was.id !== r.order.id;
      if (!changed) {
        try { changed = JSON.stringify(was) !== JSON.stringify(r.order); }
        catch (e) { changed = true; }
      }
      /* статус изменился, пока страница была открыта → живое уведомление */
      if (was && was.id === r.order.id && was.status !== r.order.status) {
        var meta = STATUS_STAMP[r.order.status];
        if (meta) {
          if (meta[0] && S.stamp) S.stamp(meta[0]);
          toast(meta[1]);
        }
        if (document.hidden) systemNote(r.order.no, meta ? meta[1] : ('Статус: ' + (r.order.status_label || '')));
      }
      if (was && was.id === r.order.id && document.hidden) {
        /* вкладка в фоне: новые сообщения/файлы → системное уведомление */
        var dM = (r.order.messages || []).length - (was.messages || []).length;
        var dF = (r.order.files || []).length - (was.files || []).length;
        if (dF > 0) systemNote(r.order.no, 'Новый файл от мастерской — уже в деле');
        else if (dM > 0) systemNote(r.order.no, 'Новое сообщение мастера');
      }
      st.detail = r.order;
      if (changed || !silent) {
        var uiSnap = captureAccountUi();
        var draft = (document.getElementById('chatText') || {}).value || '';
        var fixDraft = (document.getElementById('fixText') || {}).value || '';
        var fixForm = document.getElementById('fixForm');
        var fixOpen = !!(fixForm && !fixForm.hidden);
        renderTab();
        var ta = document.getElementById('chatText');
        if (ta && draft) ta.value = draft;
        var fixTa = document.getElementById('fixText');
        var nextFixForm = document.getElementById('fixForm');
        if (fixTa && fixDraft) fixTa.value = fixDraft;
        if (nextFixForm && fixOpen) nextFixForm.hidden = false;
        restoreAccountUi(uiSnap);
        if (st.pendingCaseFocus) {
          st.pendingCaseFocus = false;
          var caseBack = document.getElementById('accountCaseBack');
          if (caseBack) {
            try { caseBack.focus({ preventScroll: true }); } catch (e) {}
          }
        }
        scheduleFilesSeen(r.order);
        if (st.pendingJump) { scrollToEl(st.pendingJump); st.pendingJump = null; }
      }
    });
  }

  function refreshListSilent() {
    var t = S.api.token(), g = S.api.guestTokens();
    if (!S.api.identified()) return;
    S.api.get('/orders', ordersHeaders(g)).then(function (r) {
      if (!r.ok) return;
      var mini = function (o) { return [o.id, o.status, o.unread, o.files_new, o.pinned, o.archived].join(':'); };
      var before = st.orders.map(mini).join('|');
      st.orders = r.orders || [];
      if (st.orders.map(mini).join('|') !== before && st.detail) renderCurrent();
    });
  }

  /* мгновенные обновления: long-poll шины событий сервера.
     Ответ приходит в момент любого движения по делам (или раз в ~25 с
     тишины) — работает и в фоновой вкладке, питает системные уведомления. */
  var evVer = 0;
  function watchEvents() {
    /* Preview fixtures are hermetic: they must never touch production. */
    if (S.api.demoPreview) return;
    fetch(S.api.base + '/events?since=' + evVer)
      .then(function (resp) { return resp.json(); })
      .then(function (r) {
        var moved = r && r.ok && r.v > evVer;
        if (r && r.ok) evVer = r.v;
        if (moved && S.api.identified()) {
          if (st.currentId) loadDetail(true);
          refreshListSilent();
          refreshMe(); /* активация подписки/бонусы — видны сразу */
        }
        setTimeout(watchEvents, moved ? 250 : 500);
      })
      .catch(function () { setTimeout(watchEvents, 8000); });
  }

  function startPolling() {
    /* страховочный поллинг на случай, если long-poll перекрыт сетью */
    if (st.timer) clearInterval(st.timer);
    st.timer = setInterval(function () {
      if (document.hidden || !st.currentId || !S.api.identified()) return;
      loadDetail(true);
    }, 60000);
    watchEvents();
  }

  /* ---------------- действия ---------------- */
  var waitChkSent = {};
  function waitChecksOnce(id) {
    /* сообщить мастеру «клиент ждёт проверок» — тихо, раз за сессию */
    if (!id || waitChkSent[id]) return;
    waitChkSent[id] = true;
    var body = { action: 'wait_checks' };
    S.api.post('/orders/' + id + '/action', body, orderHeaders(id))
      .then(function (r) { if (r.ok && r.order) { st.detail = r.order; } });
  }

  function doAction(action, extra) {
    var claimedPayment = st.detail && (st.detail.claimed ||
      (st.detail.payments || []).some(function (p) { return p.status === 'claimed'; }));
    if (claimedPayment && (action === 'bonus_apply' || action === 'gift_apply')) {
      toast('Оплата уже отмечена и ждёт сверки — бонусы и сертификат пока менять нельзя');
      return;
    }
    if (st.busy) return;
    st.busy = true;
    var body = { action: action };
    if (extra && extra.comment) body.comment = extra.comment;
    if (extra && extra.reason) body.reason = extra.reason;
    if (extra && extra.amount != null) body.amount = extra.amount;
    if (extra && extra.code != null) body.code = extra.code;
    if (extra && extra.rating != null) body.rating = extra.rating;
    if (extra && extra.text != null) body.text = extra.text;
    if (extra && extra.author != null) body.author = extra.author;
    if (extra && extra.publication_consent != null)
      body.publication_consent = extra.publication_consent === true;
    if (extra && extra.publication_categories != null)
      body.publication_categories = extra.publication_categories;
    if (extra && extra.publication_consent_doc != null)
      body.publication_consent_doc = extra.publication_consent_doc;
    if (extra && extra.publication_consent_at != null)
      body.publication_consent_at = extra.publication_consent_at;
    if ((action === 'accept_work' || action === 'request_fixes') &&
        st.detail && st.detail.handoff_artifact_id) {
      body.artifact_id = st.detail.handoff_artifact_id;
    }
    S.api.post('/orders/' + st.currentId + '/action', body, orderHeaders(st.currentId))
      .then(function (r) {
        st.busy = false;
        if (!r.ok) {
          if (r.error === 'stale_version') loadList(true);
          toast({ bonus_need_login: 'Чтобы списывать бонусы, войдите через Telegram',
                  bonus_not_for_subs: 'Подписка оплачивается деньгами целиком — бонусы к ней не применяются',
                  bonus_after_payment: 'По заказу уже была оплата — бонусы не применить',
                  bonus_order_small: 'Бонусы применимы к заказам от 1000 ₽',
                  bonus_cap: 'Лимит списания по этому заказу уже выбран',
                  bonus_once: 'Бонусы применяются один раз на заказ. Передумали — «вернуть бонусы» и примените заново',
                  bonus_empty: 'На счету нет доступных бонусов',
                  gift_not_for_subs: 'Подписка оплачивается деньгами — сертификат к ней не применяется',
                  gift_after_payment: 'По заказу уже была оплата — сертификат не изменить',
                  gift_stage: 'К закрытому делу сертификат не применить',
                  gift_nothing: 'К этому делу сертификат не привязан',
                  not_paid: 'Сертификат ещё не оплачен',
                  blocked: 'Сертификат приостановлен — напишите нам, разберёмся',
                  expired: 'Срок сертификата истёк — напишите нам, продлим',
                  spent: 'Сертификат уже полностью использован',
                  empty: 'Введите код с сертификата',
                  paused_by_master: 'Паузу ставил мастер — напишите ему в переписке, он снимет',
                  pause_state: 'Пауза тут не применима — обновите страницу',
                  nothing_due: 'Сейчас платить нечего — оплата по заказу закрыта',
                  already_claimed: 'Отметка уже стоит — мастер сверяет поступление',
                  stale_version: 'Появилась новая версия — карточка обновлена, посмотрите её перед решением',
                  only_finished: 'В архив убираются только завершённые и закрытые дела' }[r.error] ||
                (r.error === 'not_found' && action === 'gift_apply'
                  ? 'Такого кода нет — проверьте написание' : '') ||
                'Не получилось — попробуйте ещё раз');
          return;
        }
        st.detail = r.order;
        renderCurrent();
        if (action === 'accept_work' && S.stamp) {
          var ai = r.accept || {};
          S.stamp(ai.final ? 'Принято' : 'Часть ' + (ai.part || '') + ' принята');
        }
        if (action === 'resume' && S.stamp) S.stamp('Исполнение возобновлено');
        if (action === 'pause' && S.stamp) S.stamp('На паузе');
        if (action === 'unpause' && S.stamp) S.stamp('Продолжаем');
        if (action === 'bonus_apply' && S.stamp) S.stamp('−' + money(r.spent || 0) + ' бонусами', { tone: 'wax' });
        if (action === 'bonus_cancel' && S.stamp) S.stamp('+' + money(r.restored || 0) + ' на счёт', { tone: 'wax' });
        if (action === 'gift_apply' && S.stamp) S.stamp(r.gift_amount ? '−' + money(r.gift_amount) + ' сертификатом' : 'Сертификат привязан', { tone: 'wax' });
        var msgA = { accept_price: 'Принято! Дальше — предоплата', paid: 'Передали мастеру на сверку',
                request_fixes: 'Запрос корректировки отправлен — результат проверят и обновят',
                decline: 'Заявка закрыта — её можно возобновить в любой момент',
                resume: 'Исполнение заявки возобновлено — мастер уже видит',
                bonus_apply: 'Бонусы применены', bonus_cancel: 'Бонусы вернулись на счёт',
                gift_apply: 'Сертификат привязан к делу',
                gift_remove: 'Сертификат откреплён — сумма вернулась на код',
                paid_undo: 'Отметка снята — без паники',
                archive: 'Дело убрано в архив — вернуть можно в любой момент',
                unarchive: 'Дело вернулось в список',
                pause: 'Дело на паузе — продолжим по вашему сигналу',
                unpause: 'Пауза снята — исполнение продолжается',
                pin: 'Закрепили — дело теперь первое в списке',
                unpin: 'Закрепление снято',
                cancel_request: 'Запрос отправлен — мастер свяжется с вами',
                review: 'Спасибо! Отзыв ушёл на модерацию' }[action];
        if (action === 'accept_work') {
          var a2 = r.accept || {};
          msgA = a2.final
            ? (a2.need_pay ? 'Принято! Остался финальный платёж ' + money(a2.due || 0) + ' ₽'
                           : 'Заказ завершён — спасибо!')
            : 'Результат части принят — мастер переходит к следующему этапу';
        }
        toast(msgA || 'Готово');
        loadList(true);
        if (st.me) S.api.get('/me').then(function (rr) { if (rr.ok) { st.me = rr; renderCurrent(); } });
      });
  }

  function payOnline() {
    if (st.busy) return;
    var emailEl = document.getElementById('payReceiptEmail');
    var email = emailEl ? String(emailEl.value || '').trim().toLowerCase() : '';
    if (emailEl && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))) {
      toast('Укажите рабочую почту — на неё Robokassa отправит официальный чек');
      emailEl.focus();
      return;
    }
    st.busy = true;
    S.api.post('/orders/' + st.currentId + '/pay', { email: email }, orderHeaders(st.currentId))
      .then(function (r) {
        st.busy = false;
        if (!r.ok) { toast('Не получилось открыть оплату — воспользуйтесь реквизитами'); return; }
        if (r.online && r.url) {
          toast('Открываем защищённую страницу оплаты…');
          var w = window.open(r.url, '_blank', 'noopener');
          if (!w) location.href = r.url;
        } else {
          toast('Онлайн-оплата пока не подключена — переведите по реквизитам');
        }
      });
  }

  function tipOnline(amount) {
    if (st.busy) return;
    amount = parseInt(amount, 10) || 0;
    if (amount < 100 || amount > 30000) {
      toast('Укажите сумму от 100 до 30 000 ₽');
      return;
    }
    st.busy = true;
    var body = { amount: amount };
    S.api.post('/orders/' + st.currentId + '/tip', body, orderHeaders(st.currentId))
      .then(function (r) {
        st.busy = false;
        if (!r.ok) {
          toast(r.error === 'tip_stage'
            ? 'Благодарность доступна после завершения заказа'
            : 'Не получилось открыть оплату — попробуйте чуть позже');
          return;
        }
        if (r.online === false && r.tip_id && r.requisites) {
          var ask = S.confirm ? S.confirm({
            title: 'Благодарность ' + money(amount) + ' ₽',
            text: 'Переведите по реквизитам ниже, затем нажмите «Я перевёл(а)». Мастер сверит поступление.\n\n' + r.requisites,
            okLabel: 'Я перевёл(а)', noLabel: 'Закрыть'
          }) : Promise.resolve({ ok: window.confirm('Перевести ' + money(amount) + ' ₽ по реквизитам:\n\n' + r.requisites + '\n\nУже перевели?') });
          ask.then(function (ans) {
            if (!ans.ok) return;
            S.api.post('/orders/' + st.currentId + '/tip/' + r.tip_id + '/claim',
              {}, orderHeaders(st.currentId)).then(function (cr) {
                toast(cr.ok ? 'Спасибо. Передали мастеру на сверку' : 'Не получилось поставить отметку — напишите мастеру');
              });
          });
          return;
        }
        if (!r.url) { toast('Не получилось открыть оплату — попробуйте чуть позже'); return; }
        toast('Открываем защищённую страницу оплаты…');
        var w = window.open(r.url, '_blank', 'noopener');
        if (!w) location.href = r.url;
      });
  }

  function depTopup(amount) {
    if (st.busy) return;
    st.busy = true;
    S.api.post('/deposit/topup', { amount: amount })
      .then(function (r) {
        st.busy = false;
        if (!r.ok || !r.url) {
          toast(r.error === 'over_limit'
            ? 'Потолок кошелька 120 000 ₽ — сначала потратьте часть'
            : 'Не получилось открыть оплату — напишите мастеру');
          return;
        }
        toast('Открываем оплату: +' + money(r.bonus) + ' бонусами сверху (+' + r.pct + '%)');
        var w = window.open(r.url, '_blank', 'noopener');
        if (!w) location.href = r.url;
      });
  }

  function payDeposit() {
    if (st.busy) return;
    st.busy = true;
    S.api.post('/orders/' + st.currentId + '/pay-deposit', {}, orderHeaders(st.currentId))
      .then(function (r) {
        st.busy = false;
        if (!r.ok) {
          toast(r.message || 'Не получилось списать с депозита — попробуйте картой');
          return;
        }
        toast('Этап оплачен с депозита. Остаток: ' + money(r.balance) + ' ₽');
        loadList(true);
        S.api.get('/me').then(function (rr) { if (rr.ok) { st.me = rr; } renderCurrent(); });
      });
  }

  function sendMessage() {
    var ta = document.getElementById('chatText');
    if (!ta) return;
    var text = ta.value.trim();
    if (!text || st.busy) return;
    st.busy = true;
    S.api.post('/orders/' + st.currentId + '/message', { text: text }, orderHeaders(st.currentId))
      .then(function (r) {
        st.busy = false;
        if (!r.ok) { toast(r.error === 'rate_limit' ? 'Слишком часто — подождите минуту' : 'Не отправилось, попробуйте ещё раз'); return; }
        ta.value = '';
        st.chatStick = true;
        loadDetail();
      });
  }

  function uploadFile(input, kind, noteId) {
    var f = input.files && input.files[0];
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) { toast('Файл больше 20 МБ — отправьте его ссылкой (диск) в чате или через Telegram-бота'); return; }
    var note = document.getElementById(noteId || 'upNote');
    if (note) { note.hidden = false; note.textContent = 'Загружаем «' + f.name + '»…'; }
    var fd = new FormData();
    fd.append('file', f, f.name);
    var url = S.api.base + '/orders/' + st.currentId + '/upload' +
      (kind ? '?kind=' + encodeURIComponent(kind) : '');
    var h = S.api.headers ? S.api.headers('POST', orderHeaders(st.currentId))
      : orderHeaders(st.currentId);
    fetch(url, { method: 'POST', body: fd, headers: h, credentials: 'include' })
      .then(function (resp) {
        if (resp.status === 413) throw new Error('too_big');
        if (!resp.ok) throw new Error('http_' + resp.status);
        return resp.json();
      })
      .then(function (r) {
        if (!r.ok) { if (note) note.textContent = 'Не получилось загрузить (' + (r.error || 'ошибка') + ') — попробуйте ещё раз.'; return; }
        if (note) note.textContent = 'Файл у мастера.';
        loadDetail();
      })
      .catch(function (err) {
        if (note) note.textContent = err && err.message === 'too_big'
          ? 'Файл не влез в лимит сервера — сожмите его или пришлите ссылкой в чате.'
          : (err && /^http_/.test(err.message || '')
            ? 'Сервер ответил ошибкой (' + err.message.slice(5) + ') — попробуйте ещё раз через минуту.'
            : 'Сеть прервалась — проверьте интернет и попробуйте ещё раз.');
      });
  }

  function doTgLogin(btn) {
    var idleMarkup = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Открываем Telegram…'; }
    var hint = document.getElementById('cabTgHint');
    S.tgLogin(
      function (user) { toast('Вы вошли' + (user && user.name ? ', ' + user.name : '') + '.'); loadList(); },
      function () { if (btn) { btn.disabled = false; btn.innerHTML = idleMarkup; } toast('Вход не подтвердился — попробуйте ещё раз'); },
      function (link, opened) {
        if (btn) btn.textContent = 'Ждём подтверждение в боте…';
        if (hint) {
          hint.hidden = false;
          /* НЕ уводим страницу в Telegram — иначе поллинг умрёт; даём ссылку-кнопку */
          hint.innerHTML = (opened ? 'Окно Telegram открыто — нажмите в боте кнопку «Начать». '
                                   : 'Telegram не открылся сам — ')
            + '<a class="link" href="' + link + '" target="_blank" rel="noopener">открыть бота</a>'
            + ' · ждём подтверждение, страница поймает вход сама.';
        }
      });
  }

  /* ---------------- события ---------------- */
  root.addEventListener('click', function (e) {
    var t = e.target;
    var protectedAsset = t.closest('[data-protected-asset]');
    if (protectedAsset) {
      e.preventDefault();
      if (protectedAsset.getAttribute('aria-busy') === 'true') return;
      var assetOrderId = parseInt(protectedAsset.getAttribute('data-order-id'), 10);
      var assetPath = protectedAsset.getAttribute('data-protected-asset');
      var openAsset = protectedAsset.getAttribute('data-open') === '1';
      var popup = null;
      if (openAsset) {
        try {
          popup = window.open('about:blank', '_blank');
          if (popup) popup.opener = null;
        } catch (err) {}
      }
      protectedAsset.setAttribute('aria-busy', 'true');
      protectedFetch(assetOrderId, assetPath).then(function (resp) {
        if (!resp.ok) throw new Error('http_' + resp.status);
        var filename = protectedFilename(
          resp,
          protectedAsset.getAttribute('data-filename') || (openAsset ? 'документ.pdf' : 'файл')
        );
        return resp.blob().then(function (blob) { return { blob: blob, filename: filename }; });
      }).then(function (asset) {
        var url = URL.createObjectURL(asset.blob);
        if (openAsset && popup) {
          popup.location.replace(url);
        } else {
          if (popup) popup.close();
          var a = document.createElement('a');
          a.href = url;
          a.download = asset.filename;
          a.rel = 'noopener';
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
        setTimeout(function () { try { URL.revokeObjectURL(url); } catch (err) {} }, openAsset ? 300000 : 60000);
      }).catch(function () {
        if (popup) popup.close();
        toast('Файл сейчас не открылся — обновите дело и попробуйте ещё раз');
      }).then(function () {
        if (protectedAsset.isConnected) protectedAsset.removeAttribute('aria-busy');
      });
      return;
    }
    var protectedMediaOpen = t.closest('[data-protected-media-open][aria-disabled="true"]');
    if (protectedMediaOpen) {
      e.preventDefault();
      toast('Вложение ещё загружается');
      return;
    }
    var tabBtn = t.closest('[data-tab]');
    if (tabBtn) { setTab(tabBtn.getAttribute('data-tab')); return; }
    var sw = t.closest('button[data-ord]');
    if (sw) {
      if (st.tab !== 'messages' && st.tab !== 'documents' && st.tab !== 'home') st.tab = 'orders';
      var newId = parseInt(sw.getAttribute('data-ord'), 10);
      var sameCase = st.currentId === newId && !!st.detail;
      var currentMain = root.querySelector('.account-main');
      st.listScroll = currentMain ? currentMain.scrollTop : 0;
      st.listWindowScroll = window.scrollY || 0;
      st.currentId = newId;
      st.caseOpen = true;
      st.pendingCaseFocus = true;
      var ordHint = st.tab === 'messages' ? 'secChat' :
        st.tab === 'documents' ? 'secFiles' : null;
      st.pendingJump = null; /* раздел открывается сам — доезжать некуда */
      if (!sameCase) st.caseSec = openingSec(newId, ordHint);
      else if (ordHint) st.caseSec = JUMP_SEC[ordHint];
      try { history.pushState(caseHistoryState(), '', caseHash()); } catch (e) {}
      /* экран дела открываем сразу: уже загруженное дело показываем целиком,
         новое — с честной строкой ожидания, пока идёт /orders/<id> */
      renderTab();
      var openBack = document.getElementById('accountCaseBack');
      if (openBack) {
        st.pendingCaseFocus = false;
        try { openBack.focus({ preventScroll: true }); } catch (err) {}
      }
      if (sameCase && st.pendingJump) {
        scrollToEl(st.pendingJump);
        st.pendingJump = null;
      }
      loadDetail(sameCase);
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    /* возврат к реестру — ссылка «Все дела» в шапке дела (маршрут эталона) */
    if (t.closest('[data-case-back]')) {
      var returnId = st.currentId;
      st.caseOpen = false;
      try { history.pushState({ accountTab: st.tab }, '', '#' + st.tab); } catch (e) {}
      renderTab();
      requestAnimationFrame(function () {
        var listMain = root.querySelector('.account-main');
        if (listMain) listMain.scrollTop = st.listScroll || 0;
        window.scrollTo({ top: st.listWindowScroll || 0, behavior: 'auto' });
        var returnCard = root.querySelector('button[data-ord="' + returnId + '"], [data-now-open="' + returnId + '"]');
        if (returnCard) {
          try { returnCard.focus({ preventScroll: true }); } catch (err) {}
        }
      });
      return;
    }
    var filterBtn = t.closest('[data-order-filter]');
    if (filterBtn) {
      var fv = filterBtn.getAttribute('data-order-filter');
      st.filter = (fv === 'active' || fv === 'done') ? fv : 'all';
      st.archOpen = st.filter === 'done';
      st.caseOpen = false;
      renderTab();
      return;
    }
    var nowBtn = t.closest('[data-now-open]');
    if (nowBtn) {
      if (st.tab !== 'messages' && st.tab !== 'documents' && st.tab !== 'home') st.tab = 'orders';
      var nid = parseInt(nowBtn.getAttribute('data-now-open'), 10);
      var njump = nowBtn.getAttribute('data-now-jump') || '';
      var wasOpen = st.currentId === nid && st.detail && st.caseOpen;
      st.currentId = nid;
      st.caseOpen = true;
      if (wasOpen) { setCaseSec(openingSec(nid, njump)); return; }
      st.caseSec = openingSec(nid, njump);
      st.pendingJump = null;
      try { history.pushState(caseHistoryState(), '', caseHash()); } catch (e) {}
      st.pendingCaseFocus = true;
      if (st.detail && st.detail.id === nid) {
        renderTab();
        var nowBack = document.getElementById('accountCaseBack');
        if (nowBack) {
          st.pendingCaseFocus = false;
          try { nowBack.focus({ preventScroll: true }); } catch (err) {}
        }
      }
      loadDetail();
      return;
    }
    var segBtn = t.closest('[data-seg-period]');
    if (segBtn) {
      st.showPeriod = segBtn.getAttribute('data-seg-period') === 'sem' ? 'sem' : 'month';
      st.ctorPeriod = st.showPeriod;
      rerenderHome();
      return;
    }
    if (t.closest('[data-open-plus]')) { setTab('club'); return; }
    if (t.closest('[data-arch-toggle]')) {
      st.archOpen = !st.archOpen;
      st.filter = st.archOpen ? 'done' : 'all';
      st.caseOpen = false;
      renderTab();
      return;
    }
    if (t.closest('[data-rem-toggle]')) {
      st.remOpen = !st.remOpen;
      st.caseOpen = false;
      renderTab();
      return;
    }
    if (t.closest('#cabTg')) { doTgLogin(t.closest('#cabTg')); return; }
    if (t.closest('#cabTg2')) { doTgLogin(t.closest('#cabTg2')); return; }
    if (t.closest('#cabEmailSend')) { emailSendCode(); return; }
    if (t.closest('#cabEmailGo')) { emailVerify(); return; }
    if (t.closest('#cabEmailAgain')) { emailAgain(); return; }
    if (t.closest('#cabClaimBtn')) { claimByCode((document.getElementById('cabClaimIn') || {}).value); return; }
    var acp = t.closest('[data-access-copy]');
    if (acp) {
      var accessOrderId = parseInt(acp.getAttribute('data-order-id'), 10) || st.currentId;
      var atok = tokenFor(accessOrderId);
      if (atok && S.copy) S.copy(S.claimLink ? S.claimLink(atok) : atok).then(function (okc) {
        toast(okc ? 'Ссылка доступа скопирована — сохраните её себе' : 'Не удалось скопировать — выделите ссылку вручную');
      });
      return;
    }
    if (t.closest('[data-secure-tg-link]')) {
      doTgLogin(t.closest('[data-secure-tg-link]'));
      return;
    }
    if (t.closest('#cabNotiBtn')) { notiAsk(); return; }
    /* переключение раздела внутри дела */
    var secBtn = t.closest('[data-case-sec]');
    if (secBtn) { setCaseSec(secBtn.getAttribute('data-case-sec')); return; }

    var jmp = t.closest('[data-jump]');
    if (jmp) {
      var jTo = jmp.getAttribute('data-jump');
      if ((jTo === 'plusCard' || jTo === 'subPaySheet') && st.tab !== 'club') {
        setTab('club');
        setTimeout(function () { scrollToEl(jTo); }, 60);
        return;
      }
      /* прежние переходы по якорям ведут в свой раздел дела: сами якоря
         больше не лежат на одной ленте, их надо сначала открыть */
      if (st.caseOpen && JUMP_SEC[jTo]) { setCaseSec(JUMP_SEC[jTo], jTo); return; }
      scrollToEl(jTo); return; }
    if (t.closest('#clubToggle')) {
      st.clubOpen = !st.clubOpen;
      rerenderHome();
      return;
    }
    if (t.closest('#ctorShow')) {
      st.ctorOpen = !st.ctorOpen;
      rerenderHome();
      if (st.ctorOpen) scrollToEl('ctorBox');
      return;
    }
    var cf = t.closest('[data-ctor-f]');
    if (cf) {
      var fid = cf.getAttribute('data-ctor-f');
      var ix = st.ctorFeats.indexOf(fid);
      if (ix >= 0) st.ctorFeats.splice(ix, 1); else st.ctorFeats.push(fid);
      rerenderHome();
      return;
    }
    var cper = t.closest('[data-ctor-period]');
    if (cper) {
      st.ctorPeriod = cper.getAttribute('data-ctor-period') === 'sem' ? 'sem' : 'month';
      st.showPeriod = st.ctorPeriod;
      rerenderHome();
      return;
    }
    if (t.closest('#curShow')) {
      st.curOpen = true;
      rerenderHome();
      scrollToEl('curatorBox');
      return;
    }
    if (t.closest('#plusToggle')) {
      st.plusOpen = !st.plusOpen;
      if (st.plusOpen && !st.plans) loadPlans();
      rerenderHome();
      if (st.plusOpen) scrollToEl('plusSheet');
      return;
    }
    var sbuy = t.closest('[data-sub-buy]');
    if (sbuy) {
      var sp = sbuy.getAttribute('data-sub-buy').split(':');
      doSubscribe(sp[0], sp[1] || 'month');
      return;
    }
    var sPaid = t.closest('[data-sub-paid]');
    if (sPaid) { subAction(sPaid.getAttribute('data-sub-paid'), 'paid'); return; }
    var sUnpaid = t.closest('[data-sub-unpaid]');
    if (sUnpaid) { subAction(sUnpaid.getAttribute('data-sub-unpaid'), 'unpaid'); return; }
    var sPay = t.closest('[data-sub-pay]');
    if (sPay) { subPayOnline(sPay.getAttribute('data-sub-pay')); return; }
    var sCancel = t.closest('[data-sub-cancel]');
    if (sCancel) {
      var sid = sCancel.getAttribute('data-sub-cancel');
      (S.confirm ? S.confirm({
        title: 'Отменить оформление подписки?',
        text: 'Ничего не списано и не должно — просто закроем это оформление. ' +
              'Вернуться к планам можно в любой момент.',
        okLabel: 'Отменить оформление', noLabel: 'Вернуться'
      }) : Promise.resolve({ ok: window.confirm('Отменить оформление подписки?') }))
        .then(function (res) { if (res.ok) subAction(sid, 'cancel'); });
      return;
    }
    if (t.closest('#ctorBuy')) {
      if (!st.ctorFeats.length) { toast('Отметьте хотя бы одну опцию'); return; }
      doSubscribe('custom', st.ctorPeriod, st.ctorFeats);
      return;
    }
    if (t.closest('#msAdd')) {
      var mst = (document.getElementById('msTitle') || {}).value || '';
      var msd = (document.getElementById('msDate') || {}).value || '';
      if (!mst.trim() || !msd) { toast('Напишите, что сдаёте, и выберите дату'); return; }
      S.api.post('/milestones', { title: mst.trim(), due: msd }).then(function (r) {
        if (!r.ok) {
          toast(r.error === 'milestone_limit' ? 'Лимит записей — с подпиской «Салон+» график безлимитный'
            : 'Не получилось добавить');
          return;
        }
        if (st.me) st.me.milestones = r.milestones;
        toast('Записали — напомним за 7, 3 и 1 день');
        rerenderHome();
      });
      return;
    }
    var msDel = t.closest('[data-ms-del]');
    if (msDel) {
      S.api.post('/milestones/' + msDel.getAttribute('data-ms-del') + '/delete', {}).then(function (r) {
        if (r.ok && st.me) { st.me.milestones = r.milestones; rerenderHome(); }
      });
      return;
    }
    if (t.closest('#cabTgCancel')) { S.secretStore.del('salon_auth_pending'); render(tplLogin(null)); return; }
    var oaBtn = t.closest('[data-oauth]');
    if (oaBtn) {
      /* Сервер вернёт HttpOnly session cookie; секрет не попадает во фрагмент. */
      window.location.href = S.api.base + '/auth/' + oaBtn.getAttribute('data-oauth') + '/start?mode=cookie';
      return;
    }
    var oaLink = t.closest('[data-oauth-link]');
    if (oaLink) {
      var provider = oaLink.getAttribute('data-oauth-link');
      oaLink.disabled = true;
      oaLink.setAttribute('aria-busy', 'true');
      st.oauthNotice = { provider: provider, status: 'pending' };
      renderCurrent();
      S.api.post('/auth/' + provider + '/link-start', {}).then(function (r) {
        if (!r.ok || !r.url) {
          oaLink.disabled = false;
          oaLink.removeAttribute('aria-busy');
          st.oauthNotice = {
            provider: provider,
            status: 'error',
            error: r.error === 'provider_off' ? 'provider_off'
              : (r.error === 'already_connected' ? 'provider_linked'
                : (r.error === 'reauth_required' || r.error === 'unauthorized' ? 'session' : 'network'))
          };
          toast(st.oauthNotice.error === 'provider_off'
            ? 'Этот способ входа временно недоступен'
            : (st.oauthNotice.error === 'session'
              ? 'Войдите снова и повторите подключение'
              : 'Не получилось начать подключение'));
          renderCurrent();
          return;
        }
        var next = safeOauthUrl(provider, r.url);
        if (!next) {
          oaLink.disabled = false;
          oaLink.removeAttribute('aria-busy');
          st.oauthNotice = { provider: provider, status: 'error', error: 'network' };
          toast('Получен неверный адрес входа — переход остановлен');
          renderCurrent();
          return;
        }
        try { sessionStorage.setItem('salon_oauth_link_provider', provider); } catch (e) {}
        window.location.href = next;
      });
      return;
    }
    if (t.closest('#cabEmailTgl')) {
      var ew = document.getElementById('cabEmailWrap');
      if (ew) {
        ew.hidden = !ew.hidden;
        t.closest('#cabEmailTgl').setAttribute('aria-expanded', ew.hidden ? 'false' : 'true');
        if (!ew.hidden) { var ei = document.getElementById('cabEmailIn'); if (ei) ei.focus(); }
      }
      return;
    }
    if (t.closest('#cabLogout')) {
      S.api.logout().then(function () { st.detail = null; loadList(); });
      return;
    }
    var arBtn = t.closest('[data-sub-ar]');
    if (arBtn) {
      var arId = parseInt(arBtn.getAttribute('data-sub-ar'), 10);
      var arOn = arBtn.getAttribute('data-ar-on') === '1';
      arBtn.disabled = true;
      S.api.post('/subs/' + arId + '/autorenew', { on: arOn }).then(function (r) {
        if (r.ok) {
          toast(arOn ? 'Автопродление включено — счёт пришлём сами, спишете руками'
                     : 'Автопродление выключено');
          if (st.me && st.me.sub) st.me.sub.auto_renew = arOn;
          rerenderHome();
        } else {
          arBtn.disabled = false;
          toast('Не получилось переключить: ' + (r.error || 'ошибка'));
        }
      });
      return;
    }
    if (t.closest('#cabImpExit')) {
      /* закрыть «тихий» режим мастера: чистим только вкладочные ключи */
      try {
        sessionStorage.removeItem('salon_imp');
        sessionStorage.removeItem('salon_imp_token');
        sessionStorage.removeItem('salon_imp_name');
      } catch (e) {}
      window.close();
      setTimeout(function () { location.href = 'admin.html'; }, 150);
      return;
    }
    if (t.closest('#cabRetry')) { loadList(); return; }
    if (t.closest('#chatSend')) { sendMessage(); return; }
    var act = t.closest('[data-act]');
    if (act) {
      var a = act.getAttribute('data-act');
      if (a === 'archive' || a === 'unarchive') {
        /* заодно чистим локальные скрытия старой версии кабинета */
        var hid = hiddenIds().filter(function (id) { return id !== st.currentId; });
        S.store.set('salon_hidden_orders', hid);
        doAction(a);
        return;
      }
      if (a === 'decline') {
        var od = st.detail || {};
        var isNew = od.status === 'new';
        var bonusNote = od.bonus_spent
          ? ' Применённые бонусы (' + money(od.bonus_spent) + ') сразу вернутся на ваш счёт.' : '';
        var ask = S.confirm ? S.confirm({
          title: isNew ? 'Отозвать заявку?' : 'Закрыть заявку?',
          text: (isNew
            ? 'Заявка закроется, мастер получит уведомление.'
            : 'Если смущает цена или срок — напишите в чат, обычно удаётся договориться. Мастер получит уведомление о закрытии.') +
            bonusNote + ' Закрытую заявку можно возобновить в любой момент.',
          input: 'textarea',
          placeholder: 'Причина — по желанию: поможет нам сделать предложение точнее',
          okLabel: isNew ? 'Отозвать заявку' : 'Закрыть заявку', noLabel: 'Вернуться', danger: true
        }) : Promise.resolve({ ok: window.confirm('Закрыть заявку?'), value: '' });
        ask.then(function (res) { if (res.ok) doAction('decline', { reason: res.value }); });
        return;
      }
      if (a === 'accept_work' && S.confirm) {
        var od2 = st.detail || {};
        var isFinal = (od2.stage || 1) >= (od2.stages_total || 1);
        S.confirm(isFinal ? {
          title: 'Принять результат и завершить заказ?',
          text: 'Сверьте результат с критериями каждой позиции спецификации. Первичная проверка и добровольные итерации действуют в указанном для позиции окне; подтверждённые недостатки рассматриваются по закону независимо от этих итераций. ' +
                'Если проверка ещё идёт, нажмите «Пока продолжаю проверку». Для конкретного расхождения используйте «Нужна корректировка».',
          okLabel: 'Результат проверен — принять', noLabel: 'Пока продолжаю проверку'
        } : {
          title: 'Принять результат части ' + (od2.stage || 1) + '?',
          text: 'Мастер продолжит со следующей частью. Сначала сверьте результат с критериями соответствующей позиции; конкретное расхождение отправьте кнопкой «Нужна корректировка».',
          okLabel: 'Принять результат части', noLabel: 'Ещё посмотрю'
        }).then(function (res) {
          if (res.ok) { doAction('accept_work'); return; }
          if (isFinal) {
            /* продолжение первичной проверки — не корректировка и не завершение */
            toast('Дело остаётся открытым на время первичной проверки. Мастер предупреждён.');
            waitChecksOnce(st.currentId);
          }
        });
        return;
      }
      doAction(a);
      return;
    }
    if (t.closest('[data-act-pay]')) { payOnline(); return; }
    var cp = t.closest('[data-copy]');
    if (cp) {
      var cv = cp.getAttribute('data-copy') || '';
      if (S.copy) S.copy(cv).then(function (okc) {
        toast(okc ? 'Скопировано: ' + cv : 'Не получилось — выделите и скопируйте вручную');
      });
      return;
    }
    if (t.closest('[data-act-pin]')) {
      doAction(st.detail && st.detail.pinned ? 'unpin' : 'pin');
      return;
    }
    if (t.closest('[data-act-pause]')) {
      (S.confirm ? S.confirm({
        title: 'Поставить дело на паузу?',
        text: 'Исполнение и напоминания подождут, пока вы не снимете паузу. Это не отмена: ' +
              'цена, файлы и договорённости сохраняются. Мастер получит уведомление.',
        okLabel: 'Поставить на паузу', noLabel: 'Передумал(а)'
      }) : Promise.resolve({ ok: window.confirm('Поставить дело на паузу?') }))
        .then(function (res) { if (res.ok) doAction('pause'); });
      return;
    }
    if (t.closest('[data-act-cancelreq]')) {
      (S.confirm ? S.confirm({
        title: 'Закрыть дело во время исполнения?',
        text: 'По делу уже есть выполненная часть, поэтому закрытие согласуем лично: ' +
              'мастер свяжется с вами, решите вопрос по материалам и оплате. ' +
              'Если нужен просто перерыв — удобнее пауза.',
        input: 'textarea',
        placeholder: 'Почему решили закрыть? Пара слов ускорит решение',
        okLabel: 'Отправить запрос мастеру', noLabel: 'Вернуться', danger: true
      }) : Promise.resolve({ ok: window.confirm('Отправить мастеру запрос на закрытие дела?'), value: '' }))
        .then(function (res) { if (res.ok) doAction('cancel_request', { reason: res.value }); });
      return;
    }
    if (t.closest('#bspendApply')) {
      var rng = document.getElementById('bspendRange');
      var amount = rng ? parseInt(rng.value, 10) : 0;
      if (!amount) { toast('Выберите сумму списания ползунком'); return; }
      doAction('bonus_apply', { amount: amount });
      return;
    }
    if (t.closest('#gattApply')) {
      var gin = document.getElementById('gattCode');
      var gcode = (gin && gin.value || '').trim().toUpperCase();
      if (!gcode) { toast('Введите код с сертификата'); if (gin) gin.focus(); return; }
      doAction('gift_apply', { code: gcode });
      return;
    }
    if (t.closest('#depLogBtn')) {
      st.depLedgerOpen = !st.depLedgerOpen;
      renderCurrent();
      if (st.depLedgerOpen && st.depLedger === null) {
        S.api.get('/deposit').then(function (r) {
          st.depLedger = r.ok ? (r.rows || []) : [];
          renderCurrent();
        });
      }
      if (st.depLedgerOpen) scrollToEl('depLedger');
      return;
    }
    var dtp = t.closest('[data-dep-topup]');
    if (dtp) { depTopup(+dtp.getAttribute('data-dep-topup')); return; }
    if (t.closest('[data-act-pay-dep]')) { payDeposit(); return; }
    if (t.closest('#bonusLogBtn')) {
      st.ledgerOpen = !st.ledgerOpen;
      renderCurrent();
      if (st.ledgerOpen && st.ledger === null) {
        S.api.get('/bonus').then(function (r) {
          st.ledger = r.ok ? (r.items || []) : [];
          renderCurrent();
        });
      }
      if (st.ledgerOpen) scrollToEl('bonusLedger');
      return;
    }
    if (t.closest('#bonusRefBtn')) {
      var link = (st.me && st.me.ref_link) || 'https://t.me/academic_saloon_bot';
      var linkTg = (st.me && st.me.ref_link_tg) || link;
      if (S.invite) { S.invite({ site: link, tg: linkTg }); return; }
      if (S.copy) S.copy(link).then(function (okc) {
        toast(okc ? 'Ссылка-приглашение скопирована — отправьте другу'
                  : 'Ссылка: ' + link);
      });
      return;
    }
    var star = t.closest('.rv-star');
    if (star) {
      var wrap = document.getElementById('rvStars');
      var val = parseInt(star.getAttribute('data-star'), 10);
      if (wrap) {
        wrap.setAttribute('data-val', val);
        wrap.querySelectorAll('.rv-star').forEach(function (s2) {
          s2.classList.toggle('on', parseInt(s2.getAttribute('data-star'), 10) <= val);
        });
      }
      return;
    }
    if (t.closest('[data-review-edit]')) {
      var rf = document.getElementById('reviewForm');
      if (rf) rf.hidden = !rf.hidden;
      return;
    }
    if (t.closest('[data-review-send]')) {
      var wrap2 = document.getElementById('rvStars');
      var rating = wrap2 ? parseInt(wrap2.getAttribute('data-val'), 10) || 5 : 5;
      var rvText = (document.getElementById('rvText') || {}).value || '';
      var rvAuthor = (document.getElementById('rvAuthor') || {}).value || '';
      var consentText = document.getElementById('rvConsentText');
      var consentRatingText = !!(consentText && consentText.checked);
      var consentAuthor = !!((document.getElementById('rvConsentAuthor') || {}).checked);
      var consentShot = !!((document.getElementById('rvConsentShot') || {}).checked);
      doAction('review', {
        rating: rating,
        text: rvText.trim(),
        author: rvAuthor.trim(),
        publication_consent: consentRatingText,
        publication_categories: { rating_text: consentRatingText, author: consentAuthor, screenshot: consentShot },
        publication_consent_doc: consentRatingText ? 'consent-publication 1.0 · akademsalon.ru' : '',
        publication_consent_at: consentRatingText ? new Date().toISOString() : ''
      });
      return;
    }
    var tipPreset = t.closest('[data-tip-preset]');
    if (tipPreset) {
      var tipCard = tipPreset.closest('#thanksCard');
      if (!tipCard) return;
      tipCard.setAttribute('data-tip', tipPreset.getAttribute('data-tip-preset'));
      tipCard.querySelectorAll('[data-tip-preset]').forEach(function (b) {
        var on = b === tipPreset;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      var own = document.getElementById('tipOwn');
      if (own) own.value = '';
      return;
    }
    if (t.closest('[data-tip-pay]')) {
      var card = document.getElementById('thanksCard');
      var custom = parseInt(((document.getElementById('tipOwn') || {}).value || ''), 10);
      tipOnline(custom || (card ? card.getAttribute('data-tip') : 500));
      return;
    }
    if (t.closest('[data-tip-more]')) {
      var done = t.closest('.thanks-card');
      if (done) {
        done.classList.remove('th-complete');
        done.innerHTML = '<header><div><p class="eyebrow">Добровольная поддержка</p>' +
          '<h3>Ещё раз — по желанию</h3></div></header>' +
          '<p class="case-sec__lead">Спасибо ещё раз. Выберите сумму — это по-прежнему только по желанию.</p>' +
          '<div class="case-chips" role="group" aria-label="Сумма благодарности">' +
          '<button type="button" class="case-chip on" data-tip-preset="500" aria-pressed="true">500 ₽</button>' +
          '<button type="button" class="case-chip" data-tip-preset="1000" aria-pressed="false">1 000 ₽</button></div>' +
          '<div class="case-acts"><input class="account-input account-input--short" id="tipOwn" type="number" inputmode="numeric" min="100" max="30000" step="50" placeholder="Своя сумма" aria-label="Своя сумма благодарности в рублях">' +
          '<button type="button" class="btn btn-wax" data-tip-pay>Поблагодарить <span class="ar">→</span></button></div>';
      }
      return;
    }
    if (t.closest('[data-act-fix]')) { var ff = document.getElementById('fixForm'); if (ff) { ff.hidden = false; var fixTa0 = document.getElementById('fixText'); if (fixTa0) fixTa0.focus(); } return; }
    if (t.closest('[data-act-fix-cancel]')) { var f2 = document.getElementById('fixForm'); if (f2) f2.hidden = true; return; }
    if (t.closest('[data-act-fix-send]')) {
      var txt = (document.getElementById('fixText') || {}).value || '';
      if (!txt.trim()) { toast('Опишите, что поправить'); return; }
      doAction('request_fixes', { comment: txt.trim() });
      return;
    }
    if (t.closest('[data-chat-focus]')) {
      /* поле чата может лежать в свёрнутой секции — сперва раскрываем её,
         иначе focus() по скрытому полю молча не срабатывает */
      var chatFold = document.getElementById('secChat');
      if (chatFold && chatFold.tagName === 'DETAILS' && !chatFold.open) chatFold.open = true;
      var ta = document.getElementById('chatText');
      if (ta) { ta.focus(); ta.scrollIntoView({ block: 'center' }); }
      return;
    }
  });

  /* живой пересчёт «деньгами останется…» при движении ползунка */
  root.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'bspendRange' && st.detail) {
      var v = parseInt(e.target.value, 10) || 0;
      var val = document.getElementById('bspendVal');
      var due = document.getElementById('bspendDue');
      /* due_total уже учитывает промокод, подписку и сертификат; отнимать
         бонусы от голой цены здесь означало показывать завышенный остаток. */
      var base = st.detail.due_total != null
        ? st.detail.due_total + (st.detail.bonus_spent || 0)
        : (st.detail.price || 0);
      if (val) val.textContent = money(v);
      if (due) due.textContent = money(Math.max(base - v, 0)) + ' ₽';
    }
  });

  root.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'cabUpload') uploadFile(e.target);
    if (e.target && e.target.id === 'cabReceipt') { uploadFile(e.target, 'receipt'); toast('Чек уйдёт мастеру — сверка станет быстрее'); }
    if (e.target && e.target.id === 'cabReviewShot') uploadFile(e.target, 'review', 'rvNote');
  });

  root.addEventListener('keydown', function (e) {
    var caseTab = e.target && e.target.closest && e.target.closest('[data-case-sec][role="tab"]');
    if (caseTab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(e.key) >= 0) {
      var caseTabs = Array.prototype.slice.call(root.querySelectorAll('.case-secnav [data-case-sec][role="tab"]'));
      var currentIndex = caseTabs.indexOf(caseTab);
      var nextIndex = currentIndex;
      if (e.key === 'Home') nextIndex = 0;
      else if (e.key === 'End') nextIndex = caseTabs.length - 1;
      else if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % caseTabs.length;
      else if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + caseTabs.length) % caseTabs.length;
      if (caseTabs[nextIndex]) {
        e.preventDefault();
        setCaseSec(caseTabs[nextIndex].getAttribute('data-case-sec'));
      }
      return;
    }
    if (e.target && e.target.id === 'chatText' && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault(); sendMessage();
    }
    if (e.target && e.target.id === 'cabClaimIn' && e.key === 'Enter') {
      e.preventDefault(); claimByCode(e.target.value);
    }
    if (e.target && e.target.id === 'cabEmailIn' && e.key === 'Enter') {
      e.preventDefault(); emailSendCode();
    }
    if (e.target && e.target.id === 'cabEmailCode' && e.key === 'Enter') {
      e.preventDefault(); emailVerify();
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && st.currentId) loadDetail(true);
  });

  document.addEventListener('salon:auth-lost', function () {
    st.detail = null;
    st.orders = [];
    st.currentId = null;
    st.caseOpen = false;
    loadList();
  });

  /* ---------------- старт ---------------- */
  /* dashboard.html#plus — сразу раскрыть витрину «Салон+» (ссылки с referral)
     и довести взгляд до неё (на телефоне карточка ниже первого экрана) */
  var hashPlusScroll = false;
  var hashDepositScroll = false;
  var hashCuratorScroll = false;
  var hashBuilderScroll = false;
  try {
    var h0 = (location.hash || '').replace('#', '');
    if (h0 === 'club-curator') {
      st.tab = 'club'; st.plusOpen = true; st.curOpen = true; hashCuratorScroll = true;
    }
    else if (h0 === 'club-builder') {
      st.tab = 'club'; st.plusOpen = true; st.ctorOpen = true; hashBuilderScroll = true;
    }
    else if (h0.indexOf('plus') >= 0) {
      st.tab = 'club'; st.plusOpen = true; st.clubOpen = true; hashPlusScroll = true;
    }
    else if (['home', 'orders', 'messages', 'documents', 'wallet', 'deposit', 'club', 'help', 'settings'].indexOf(h0) >= 0) {
      st.tab = h0;
      if (h0 === 'deposit') hashDepositScroll = true;
    }
    /* прямая ссылка на дело: #order-231 или #order-231-money — открывается
       именно оно и именно тот раздел, а не общий список */
    else {
      var m0 = h0.match(/^order-(\d+)(?:-([a-z]+))?$/);
      if (m0) {
        st.tab = 'orders';
        st.currentId = parseInt(m0[1], 10);
        st.caseOpen = true;
        if (m0[2]) st.caseSec = m0[2];
      }
    }
    if (/[?&](paid|thanks)=/.test(location.search)) st.tab = 'orders';
  } catch (e) {}
  /* Адрес — источник правды для «Назад»/«Вперёд» и для пересланной ссылки.
     Формат: #orders, #order-231, #order-231-money. Раньше у дела своего
     адреса не было вовсе: F5 или присланная ссылка всегда открывали список,
     а «Назад» на телефоне уводил с сайта (везде стоял replaceState). */
  var TAB_HASHES = ['home', 'orders', 'messages', 'documents', 'wallet',
                    'deposit', 'club', 'help', 'settings'];

  function caseHash() {
    return '#order-' + st.currentId + (st.caseSec && st.caseSec !== 'work' ? '-' + st.caseSec : '');
  }

  function caseHistoryState() {
    return { accountTab: ['home', 'orders', 'messages', 'documents'].indexOf(st.tab) >= 0 ? st.tab : 'orders' };
  }

  function applyHash(h, viaHistory) {
    h = (h || '').replace('#', '');
    var m = h.match(/^order-(\d+)(?:-([a-z]+))?$/);
    if (m) {
      var id = parseInt(m[1], 10);
      var originTab = history.state && history.state.accountTab;
      st.tab = ['home', 'orders', 'messages', 'documents'].indexOf(originTab) >= 0 ? originTab : 'orders';
      st.caseSec = (m[2] && CASE_SECS.indexOf(m[2]) >= 0) ? m[2] : 'work';
      st.caseOpen = true;
      if (st.currentId !== id) { st.currentId = id; renderTab(); loadDetail(); }
      else renderTab();
      return true;
    }
    if (TAB_HASHES.indexOf(h) >= 0) {
      /* тот же раздел, но дело было открыто — «Назад» обязан вернуть к списку */
      if (h === st.tab && !st.caseOpen) return true;
      st.caseOpen = false;
      setTab(h, true);
      return true;
    }
    if (viaHistory && st.caseOpen) { st.caseOpen = false; renderTab(); return true; }
    return false;
  }

  window.addEventListener('popstate', function () { applyHash(location.hash, true); });
  window.addEventListener('hashchange', function () {
    var h = (location.hash || '').replace('#', '');
    if (h === 'club-curator') {
      st.plusOpen = true; st.curOpen = true; hashCuratorScroll = true;
      setTab('club', true);
      return;
    }
    if (h === 'club-builder') {
      st.plusOpen = true; st.ctorOpen = true; hashBuilderScroll = true;
      setTab('club', true);
      return;
    }
    if (h === 'plus') { setTab('club'); setTimeout(function () { scrollToEl('plusCard'); }, 60); return; }
    if (TAB_HASHES.indexOf(h) >= 0 && (h !== st.tab || st.caseOpen)) { st.caseOpen = false; setTab(h, true); }
    else if (/^order-\d+/.test(h)) applyHash(h, true);
  });
  /* Ссылка доступа с другого устройства: только #claim=<токен>.
     Query-вариант намеренно не принимается: он попадает в access-log.
     Если затем пользователь привязывает дело к аккаунту, сервер принимает
     claim один раз и отзывает предъявленный гостевой ключ. */
  try {
    var claimTok = (location.hash.match(/claim=([A-Za-z0-9_-]+)/) || [])[1];
    if (claimTok) {
      history.replaceState(null, '', location.pathname);
      if (/^cx1_/.test(claimTok)) {
        startupAccess = S.api.post(
          '/orders/access/exchange',
          {},
          { 'X-Claim-Exchange': claimTok }
        ).then(function (r) {
          if (!r || !r.ok) {
            toast('Ссылка уже использована или истекла — попросите новую');
            return r;
          }
          if (r.guest_session && S.api.setGuestHint) S.api.setGuestHint(true);
          toast('Дело добавлено на это устройство');
          return r;
        });
      } else {
        /* Migration grace for old raw fragment links. */
        S.api.addGuestToken(claimTok);
        toast('Дело добавлено на это устройство');
      }
    }
  } catch (e) {}
  /* возврат из ВК/Mail.ru: сервер кладёт токен сессии во фрагмент адреса —
     он не светится ни в логах, ни в Referer; забираем и чистим строку */
  try {
    var oauthTok = (location.hash.match(/oauth=([A-Za-z0-9_-]+)/) || [])[1];
    var oauthErr = (location.hash.match(/oauth_err=([a-z_]+)/) || [])[1];
    var oauthProvider = '';
    try { oauthProvider = sessionStorage.getItem('salon_oauth_link_provider') || ''; } catch (e) {}
    if (oauthTok) {
      if (oauthTok === 'ok' || oauthTok === 'linked') {
        if (S.api.setSessionHint) S.api.setSessionHint(true);
        if (oauthTok === 'linked' && oauthProvider) {
          st.tab = 'settings';
          history.replaceState(null, '', location.pathname + '#settings');
          st.oauthNotice = { provider: oauthProvider, status: 'pending', verify: true };
          toast('Проверяем подключение способа входа…');
        } else {
          history.replaceState(null, '', location.pathname);
          toast('Вы вошли');
        }
      } else {
        history.replaceState(null, '', location.pathname);
        /* Migration grace for provider callbacks opened before this release. */
        S.api.setToken(oauthTok);
        var gtOa = S.api.guestTokens();
        if (gtOa.length) S.api.post('/orders/claim', { tokens: gtOa });
        toast('Вы вошли');
      }
    } else if (oauthErr) {
      if (oauthProvider) {
        st.tab = 'settings';
        history.replaceState(null, '', location.pathname + '#settings');
        st.oauthNotice = { provider: oauthProvider, status: 'error', error: oauthErr };
      } else {
        history.replaceState(null, '', location.pathname);
      }
      toast({
        declined: 'Вход отменён на стороне сервиса',
        already_linked: 'Этот профиль уже привязан к другому аккаунту',
        provider_linked: 'К кабинету уже подключён другой профиль этого сервиса',
        session: 'Сессия кабинета истекла — войдите снова',
        forbidden: 'Доступ для этого аккаунта закрыт'
      }[oauthErr] || 'Вход через сервис не удался — попробуйте Telegram или почту');
    }
    if (oauthTok || oauthErr) {
      try { sessionStorage.removeItem('salon_oauth_link_provider'); } catch (e) {}
    }
  } catch (e) {}
  /* возврат со страницы оплаты: ?paid=<id> — открываем заказ и обновляем */
  try {
    var paidId = new URLSearchParams(location.search).get('paid');
    if (paidId) {
      st.currentId = parseInt(paidId, 10) || null;
      st.caseOpen = true;
      st.caseSec = 'money';
      toast('Проверяем оплату — статус обновится в течение минуты');
      history.replaceState(null, '', location.pathname);
    }
  } catch (e) {}
  /* возврат после добровольной благодарности: открываем то же завершённое дело */
  try {
    var thanksId = new URLSearchParams(location.search).get('thanks');
    if (thanksId) {
      st.currentId = parseInt(thanksId, 10) || null;
      st.caseOpen = true;
      st.caseSec = 'terms';
      toast('Спасибо за поддержку мастерской. Платёж уже подтверждается');
      history.replaceState(null, '', location.pathname);
    }
  } catch (e) {}
  /* «тихий» вход мастера: dashboard.html#imp=<ключ> из админки. Токен живёт
     только в sessionStorage ЭТОЙ вкладки — основная сессия мастера
     (админка в соседней) не затирается; маячок визитов молчит (гейт в app.js) */
  var impKey = null;
  try { impKey = (location.hash.match(/imp=([A-Za-z0-9_-]+)/) || [])[1] || null; } catch (e) {}
  if (impKey) {
    history.replaceState(null, '', location.pathname);
    S.api.post('/imp_login', { key: impKey }).then(function (r) {
      if (r.ok && r.token) {
        try {
          sessionStorage.setItem('salon_imp', '1');
          sessionStorage.setItem('salon_imp_token', r.token);
          sessionStorage.setItem('salon_imp_name', (r.user && r.user.name) || 'клиент');
        } catch (e) {}
      } else {
        toast('Ключ входа истёк — откройте кабинет клиента из админки заново');
      }
      loadList();
      startPolling();
    });
  } else {
    Promise.all([S.api.ready || Promise.resolve(), startupAccess]).then(
      function () { loadList(); startPolling(); },
      function () { loadList(); startPolling(); }
    );
  }

  /* гостям с заказом — раз за сессию напоминаем сохранить доступ к делу */
  setTimeout(function () {
    try {
      if (S.api.token() || sessionStorage.getItem('salon_nudged') === '1') return;
      var tokenized = st.orders.filter(function (o) { return o.token; });
      if (!tokenized.length || !S.orderNudge) return;
      sessionStorage.setItem('salon_nudged', '1');
      S.orderNudge(root, tokenized[0].token);
    } catch (e) {}
  }, 2600);
}
if (document.prerendering) {
  document.addEventListener('prerenderingchange', initCabinet, { once: true });
} else {
  initCabinet();
}
