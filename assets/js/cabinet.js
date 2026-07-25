/* ============================================================
   ЛИЧНЫЙ КАБИНЕТ — заказы живут на сайте; Telegram-бот — зеркало
   для тех, кто его привязал. Доступ: токены заказов этого
   устройства (salon_tokens), ссылка доступа #claim=<токен>
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
    clubOpen: false,  // развёрнуты ли карточки бонусов/подписки (полоса «клуба»)
    plusOpen: false,  // развёрнута ли витрина «Салон+»
    ctorOpen: false,  // развёрнут ли конструктор подписки внутри витрины
    curOpen: false,   // развёрнут ли куратор сессии внутри витрины
    plans: null,      // /plans (планы+конструктор), null = не загружали
    ctorFeats: [],    // выбранные фичи конструктора
    ctorPeriod: 'month',
    showPeriod: 'sem',  // витрина билетов: показываемый срок (семестр выгоднее)
    pendingJump: null,  // раздел, к которому доехать после смены дела (герой)
    timer: null,
    busy: false
  };
  var lastPending = null; // pending TG-входа — для перерисовки экрана входа
  var seenTimer = null;   // отложенная отметка «файлы посмотрены»
  var baseTitle = document.title;
  var hiddenNews = 0;     // сколько событий пришло, пока вкладка в фоне

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
    var h = orderHeaders(orderId);
    var sess = S.api.token();
    if (sess) h.Authorization = 'Bearer ' + sess;
    return fetch(S.api.base + path, {
      method: 'GET',
      headers: h,
      credentials: 'same-origin',
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
        '<div><b>Остался один шаг в Telegram</b>' +
        '<p>Откройте бота и нажмите кнопку «Начать». Кабинет войдёт сам — страницу можно не держать открытой.</p>' +
        '<div class="cab-pending-actions"><a class="btn btn-wax" href="' + (pending.link || 'https://t.me/academic_saloon_bot') + '" target="_blank" rel="noopener">Открыть Telegram <span class="ar">↗</span></a>' +
        '<button type="button" class="btn btn-line" id="cabTgCancel">Выбрать другой способ</button></div></div></div>'
      : '';
    /* Показываем только способы, которые сервер действительно включил.
       Почта универсальна, поэтому становится главным действием; Telegram и
       OAuth-провайдеры остаются равноценными быстрыми альтернативами. */
    var f = st.features || {};
    var provBtns = [];
    if (f.email_login) {
      provBtns.push('<button type="button" class="cab-provider cab-provider-tg" id="cabTg">' +
        '<span class="cab-provider-ic" aria-hidden="true">↗</span><span>Telegram</span></button>');
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
    var mainAction = f.email_login
      ? '<button type="button" class="btn btn-wax btn-block cab-login-main" id="cabEmailTgl" aria-expanded="false" aria-controls="cabEmailWrap">' +
        'Продолжить по почте <span class="ar">→</span></button>'
      : '<button type="button" class="btn btn-wax btn-block cab-login-main" id="cabTg">Продолжить с Telegram <span class="ar">→</span></button>';
    return '<main class="cab-login reveal">' +
      '<section class="cab-login-card" aria-labelledby="cabLoginTitle">' +
        '<div class="cab-login-story">' +
          '<div class="cab-login-seal" aria-hidden="true"><span>АС</span></div>' +
          '<p class="caps">Личный зал</p>' +
          '<h2 id="cabLoginTitle">Все дела —<br>в одном формуляре</h2>' +
          '<p class="cab-story-lead">Заказы, сроки, файлы и сообщения мастера. Спокойно, прозрачно, без потерянных переписок.</p>' +
          '<ul class="cab-login-promises">' +
            '<li><span>01</span>Статус работы в реальном времени</li>' +
            '<li><span>02</span>Файлы и история всегда под рукой</li>' +
            '<li><span>03</span>Без паролей и лишней регистрации</li>' +
          '</ul>' +
          '<p class="cab-story-note"><span aria-hidden="true">◇</span> Доступ защищён одноразовым кодом или подтверждением у выбранного сервиса.</p>' +
        '</div>' +
        '<div class="cab-login-auth">' +
          '<div class="cab-auth-head"><p class="caps">Вход в кабинет</p>' +
          '<h3>С возвращением</h3>' +
          '<p>Выберите удобный способ. Мы соберём ваши заказы в одном кабинете.</p></div>' +
          plusTeaser +
          pendingBlock +
          (pending ? '' : mainAction + emailBlock +
            (provBtns.length ? '<div class="cab-or" aria-hidden="true"><span>или быстрее через</span></div>' +
              '<div class="cab-prov">' + provBtns.join('') + '</div>' : '')) +
          '<p class="cab-login-hint" id="cabTgHint" role="status" aria-live="polite" hidden></p>' +
          '<p class="cab-login-legal">Мы используем почту или Telegram только для входа и защиты кабинета. Подробнее — в <a href="privacy.html">политике ПДн</a>.</p>' +
          '<details class="cab-alt"><summary>Есть ссылка доступа к отдельному делу</summary>' +
            '<p>Вставьте ссылку с экрана «Заявка принята» — заказ откроется без входа.</p>' +
            '<div class="cab-claim-row">' +
              '<label class="visually-hidden" for="cabClaimIn">Ссылка доступа или код дела</label>' +
              '<input class="cab-login-input" type="text" id="cabClaimIn" placeholder="Ссылка доступа или код дела" autocomplete="off">' +
              '<button type="button" class="btn btn-line" id="cabClaimBtn">Открыть</button>' +
            '</div></details>' +
          '<a class="cab-first-order" href="configurator.html"><span>Впервые у нас?</span><b>Оформить первый заказ <i aria-hidden="true">→</i></b></a>' +
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
    S.api.post('/auth/email/verify', { email: st.emailTo, code: code }).then(function (r) {
      st.busy = false;
      if (!r.ok || !r.token) { toast(EMAIL_ERR[r.error] || 'Не получилось — попробуйте ещё раз'); return; }
      S.api.setToken(r.token);
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
      '<a class="btn btn-wax" href="configurator.html">Рассчитать работу <span class="ar">→</span></a>' +
      '<a class="btn btn-line" href="configurator.html?service=pl">Начать с разбора плана · 3 000 ₽</a></footer>' +
      '</div>' + clubBlock();
  }

  /* -------- секция-раскрывашка: второстепенное свёрнуто, но под рукой -------- */
  function fold(id, summary, meta, inner, open) {
    if (!inner) return '';
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
    return '<div class="case-state case-state--error reveal">' +
      '<header><span>503</span><i aria-hidden="true"></i></header>' +
      '<div class="case-state__body">' +
      '<span class="case-state__mark" aria-hidden="true">×</span>' +
      '<h2>Картотека не отвечает</h2>' +
      '<p>Проверьте соединение и попробуйте ещё раз. Ваши дела и платежи в порядке — ' +
      'это сбой связи с сервером, а не с заказом. Повторная оплата не требуется.</p>' +
      '</div>' +
      '<footer class="case-acts">' +
      '<button type="button" class="btn btn-line" id="cabRetry">Повторить</button></footer>' +
      '</div>';
  }

  function notiRow() {
    /* однострочное приглашение включить уведомления устройства */
    if (!notiSupported() || Notification.permission !== 'default') return '';
    return '<p class="account-note account-note--row reveal">' +
      '<button type="button" class="line-link" id="cabNotiBtn">Включить уведомления на устройстве</button>' +
      ' — статусы, файлы и сообщения догонят вас, даже если вкладка в фоне.</p>';
  }

  function linksRow() {
    /* связанные входы: показываем, только когда ВК/Mail.ru включены на сервере.
       URL привязки сервер выдаёт только после Bearer-проверки; сессионный
       секрет не попадает в адресную строку, логи и Referer. */
    var me = st.me || {};
    var f = me.features || {};
    if (!f.vk_login && !f.mailru_login && !f.max_login) return '';
    var linked = me.oauth || [];
    var bits = [];
    [['vk', 'VK ID'], ['mailru', 'Mail ID'], ['max', 'MAX']].forEach(function (p) {
      if (!f[p[0] + '_login']) return;
      bits.push(linked.indexOf(p[0]) >= 0
        ? '<span class="account-linked">' + p[1] + ' — привязан</span>'
        : '<button type="button" class="linkbtn" data-oauth-link="' + p[0] + '">привязать ' + p[1] + '</button>');
    });
    if (!bits.length) return '';
    return '<p class="account-note account-note--row reveal">Входы: Telegram/почта · ' +
      bits.join(' · ') + '</p>';
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
    var best = null, score = 0;
    list.forEach(function (o) {
      var s = 0;
      if (o.paused) s = 0;
      else if (o.status === 'prepay' ||
               ((o.part_ready || o.final_ready) && (o.status === 'work' || o.status === 'fix'))) s = 5;
      else if (o.status === 'priced') s = 4;
      else if (o.status === 'check') s = 3;
      else if (o.files_new) s = 2;
      else if (o.unread) s = 1;
      if (s > score) { score = s; best = o; }
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
      sub = (o.stages_total || 1) > 1
        ? 'Платить всё сразу не нужно: старт — только первая часть, остальное по готовности. Бонусы тоже можно применить.'
        : 'Можно применить бонусы, обсудить детали в переписке или принять предложение.';
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
    return '<div class="account-notice account-notice--wax reveal">' +
      '<span class="account-notice__mark" aria-hidden="true">' + (score >= 4 ? '₽' : '¶') + '</span>' +
      '<div><strong>' + msg + '</strong><p>Дело ' + esc(o.no) + ' · ' + esc(shortWork(o)) +
      '. ' + sub + '</p></div>' +
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
    return '<section class="account-section reveal">' +
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
    return '<section class="account-section reveal" id="plusCard">' +
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
      copy = '<p>Скидка применяется сама, когда мастер называет цену. Состав плана и куратор сессии — ниже, ' +
        'в развороте абонемента.</p>' + facts +
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
      head = '<section class="account-section reveal" id="plusCard">' +
        '<header><div><p class="eyebrow">Абонемент «Салон+»</p>' +
        '<h2>План активен.</h2></div>' +
        '<button type="button" class="line-link" id="plusToggle">' +
        (st.plusOpen ? 'Свернуть разворот' : 'Опции · продлить · куратор') + '</button></header>' +
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
      head = '<section class="account-section reveal" id="plusCard">' +
        '<header><div><p class="eyebrow">Абонемент «Салон+»</p>' +
        '<h2>Абонемент пока не активен.</h2></div>' +
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
    /* конструктор-механика: слева плитки-опции, справа живой билет с составом
       и итогом — каждый клик сразу отражается в билете */
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
    var comp = '<div><dt>База абонемента</dt><dd>' + money(pl.base_price) + ' ₽</dd></div>' +
      (chosen.length
        ? chosen.map(function (f) {
            var idle = discIds.indexOf(f.id) >= 0 && f.id !== bestId;
            return '<div><dt>' + esc(f.label) + (idle ? ' — не суммируется со скидкой выше' : '') + '</dt>' +
              '<dd>' + (idle ? '—' : '+' + money(f.price) + ' ₽') + '</dd></div>';
          }).join('')
        : '<div><dt>Опции пока не выбраны</dt><dd>—</dd></div>');
    var saveNote = '';
    if (best) {
      var save = Math.min(Math.round(20000 * best.pct / 100), best.cap);
      saveNote = ' Курсовая за 20 000 ₽ с таким набором — уже −' + money(save) + ' ₽.';
    }
    var perSeg = '<div class="period-switch" role="group" aria-label="Срок абонемента">' +
      '<button type="button" data-ctor-period="month" class="' + (st.ctorPeriod === 'month' ? 'is-current' : '') +
      '" aria-pressed="' + (st.ctorPeriod === 'month') + '">30 дней</button>' +
      '<button type="button" data-ctor-period="sem" class="' + (st.ctorPeriod === 'sem' ? 'is-current' : '') +
      '" aria-pressed="' + (st.ctorPeriod === 'sem') + '">150 дней</button></div>';
    return '<section class="account-section" id="ctorBox">' +
      '<header><div><p class="eyebrow">Свой набор</p>' +
      '<h2>Соберите абонемент из опций.</h2></div>' + perSeg + '</header>' +
      '<div class="deposit-calculator">' +
      '<div class="deposit-calculator__controls">' +
      '<p class="eyebrow">Опции</p><h3>База ' + money(pl.base_price) + ' ₽ и всё, что нужно сверху.</h3>' +
      '<p>Из скидочных опций действует одна — самая большая. Готовые планы выгоднее того же набора на 10–15 %.' +
      saveNote + '</p>' +
      '<div class="builder-options">' + opts + '</div></div>' +
      '<aside class="deposit-receipt">' +
      '<header><span>Ваш абонемент</span><small>АС · НАБОР</small></header>' +
      '<dl>' + comp +
      '<div><dt>Итого ' + (st.ctorPeriod === 'sem' ? 'за 150 дней одной оплатой' : 'за 30 дней') + '</dt>' +
      '<dd id="ctorTotal">' + (chosen.length ? money(ctorTotal()) + ' ₽' : '—') + '</dd></div></dl>' +
      '<div class="deposit-receipt__note"><strong>Без автосписаний</strong>' +
      '<p>Оплата разовая: срок закончится, и продление нужно будет подтвердить отдельно.</p></div>' +
      '<button type="button" class="button button--primary" id="ctorBuy"' + (chosen.length ? '' : ' disabled') + '>Оформить</button>' +
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
    var rows = ms.map(function (m) {
      var d = m.due || '';
      return '<div class="account-ledger__row">' +
        '<span class="account-ledger__delta">' + d.slice(8, 10) + '.' + d.slice(5, 7) + '</span>' +
        '<span class="account-ledger__what">' + esc(m.title) + '</span>' +
        '<button type="button" class="line-link" data-ms-del="' + m.id + '">Убрать</button></div>';
    }).join('');
    return '<section class="account-section">' +
      '<header><div><p class="eyebrow">Куратор сессии</p>' +
      '<h2>График сдач с напоминаниями.</h2></div>' +
      '<span class="account-count">' + ms.length + '</span></header>' +
      '<div class="account-panel">' +
      '<header><span>Ваши сдачи и экзамены</span><small>АС · КУРАТОР</small></header>' +
      '<p>Внесите даты — мы напомним заранее, за 7, 3 и 1 день, и подстрахуем, если станет жарко.' +
      (canMore || ms.length ? '' : ' Без абонемента доступна одна запись, с «Салон+» — весь график.') + '</p>' +
      (rows ? '<div class="account-ledger">' + rows + '</div>' : '') +
      (canMore
        ? '<div class="account-form-row">' +
          '<input class="account-input" type="text" id="msTitle" maxlength="120" aria-label="Название сдачи или экзамена" placeholder="Что сдаёте — например, «Курсовая по ТГП»">' +
          '<input class="account-input account-input--short" type="date" id="msDate" aria-label="Дата сдачи или экзамена">' +
          '<button type="button" class="button button--secondary" id="msAdd">Добавить</button></div>'
        : '<p class="account-note">Лимит записей достигнут — с абонементом «Салон+» график безлимитный.</p>') +
      '</div></section>';
  }

  function plusSection() {
    if (!st.plans) {
      loadPlans();
      return '<div class="account-loading reveal" role="status">Листаем планы…</div>';
    }
    var cards = (st.plans.plans || []).map(planCardHtml).join('');
    var hasPeriods = (st.plans.plans || []).some(function (p) { return !p.once; });
    var seg = hasPeriods
      ? '<div class="period-switch" role="group" aria-label="Срок абонемента">' +
        '<button type="button" data-seg-period="month" class="' + (st.showPeriod === 'month' ? 'is-current' : '') +
        '" aria-pressed="' + (st.showPeriod === 'month') + '">30 дней</button>' +
        '<button type="button" data-seg-period="sem" class="' + (st.showPeriod === 'sem' ? 'is-current' : '') +
        '" aria-pressed="' + (st.showPeriod === 'sem') + '">150 дней</button></div>'
      : '';
    /* конструктор и куратор — отдельными разворотами под витриной планов */
    var ms = (st.me && st.me.milestones) || [];
    var ctorBlock = st.ctorOpen ? ctorHtml() : '';
    var curBlock = st.curOpen ? curatorHtml() : '';
    var extras = (st.ctorOpen && st.curOpen) ? '' :
      '<div class="plus-extras">' +
      (st.ctorOpen ? '' : '<button type="button" class="line-link" id="ctorShow">Собрать свой набор из опций <span aria-hidden="true">→</span></button>') +
      (st.curOpen ? '' : '<button type="button" class="line-link" id="curShow">Куратор сессии' +
        (ms.length ? ' · записей: ' + ms.length : '') + ' <span aria-hidden="true">→</span></button>') +
      '</div>';
    return '<section class="account-section reveal" id="plusSheet">' +
      '<header><div><p class="eyebrow">Готовые планы</p>' +
      '<h2>Состав и ограничения видны сразу.</h2></div>' + seg + '</header>' +
      '<div class="plus-plan-grid">' + cards + '</div>' +
      '<p class="commerce-caption">Абонемент активируется не позднее 24 часов после подтверждения оплаты. ' +
      'Скидка абонемента и бонусы учитываются раздельно; вместе они не превышают 25 % стоимости заказа. ' +
      'Оформить можно и в Telegram: <a class="line-link" href="https://t.me/academic_saloon_bot?start=plus" target="_blank" rel="noopener">@academic_saloon_bot</a></p>' +
      extras + '</section>' + ctorBlock + curBlock;
  }

  function rerenderHome() { renderTab(); }

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
      facts = [['Сейчас', shortStatus(o) || o.status_label || 'в работе'],
               ['Ближайший срок', o.deadline_text || 'уточняется']];
      foot = needsAction(o) ? 'Требуется ваше решение'
        : (unread || fresh) ? 'Есть новое событие'
        : o.pinned ? 'Закреплено первым' : 'Открыть дело';
    }
    var pct = orderPct(o);
    /* без .is-current: дело больше не раскрывается под списком, подсвечивать
       «выбранную» карточку нечем — в эталоне такого состояния тоже нет */
    return '<button type="button" class="order-card" data-ord="' + o.id +
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

  /* реестр: заголовок с отбором, сетка карточек, тихая приписка о скрытых пулах */
  function ordersRegister(mode) {
    var title = mode === 'messages' ? 'Сообщения по делам'
      : mode === 'documents' ? 'Документы по делам' : 'Ваши дела';
    var list = filteredOrders();
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
    return '<section class="account-orders account-orders--all reveal">' +
      '<header><h2>' + title + '</h2>' + registerFilters() + '</header>' +
      (list.length
        ? '<div class="order-list">' + list.map(function (o) { return orderCard(o, mode); }).join('') + '</div>'
        : '<div class="account-empty"><p>' + empty + '</p></div>') +
      (notes.length ? '<p class="account-note account-note--row">' + notes.join(' · ') + '</p>' : '') +
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
    var facts = [
      ['Результат', o.deadline_text || 'срок уточняется'],
      [total > 1 ? 'Часть' : 'Позиций в деле',
        total > 1 ? (o.stage || 1) + ' из ' + total
          : String((o.specification_lines || o.items || []).length || 1)],
      ['Следующее действие', next]
    ];
    return '<div class="fs-sec case-sec case-overview">' +
      '<header><div><p class="eyebrow">Текущий этап</p><h3>' + esc(stepName) + '</h3></div>' +
      '<strong class="case-overview__count"><small>Этапы</small>' + o.step + ' из ' + steps.length +
      '</strong></header>' + caseProgress(o) +
      '<div class="case-overview__facts">' + facts.map(function (f) {
        return '<span><small>' + f[0] + '</small><strong>' + esc(f[1]) + '</strong></span>';
      }).join('') + '</div></div>';
  }

  /* -------- правая колонка эталона: деньги короткой сводкой --------
     .case-payment из caseView: закрытая часть суммы, шкала и переход
     к самому платежу. Сама оплата (реквизиты, кнопки, история) живёт
     в главной колонке — сводка её не дублирует, а доводит до неё. */
  function caseAsidePay(o) {
    var scale = payScale(o);
    var due = o.due_now && o.due_now.amount ? o.due_now.amount : 0;
    if (!scale && !due && !o.claimed) return '';
    var note = due > 0
      ? 'К оплате сейчас — ' + money(due) + ' ₽' +
        (o.due_now && o.due_now.label ? ' (' + esc(o.due_now.label.toLowerCase()) + ').' : '.')
      : o.claimed ? 'Ваша отметка об оплате на сверке у мастера.'
      : isArch(o) ? 'Расчёты по делу закрыты.'
      : 'Следующий платёж появится по готовности этапа.';
    return '<section class="fs-sec case-sec case-payment">' +
      '<header><h3>Расчёты по делу</h3><span class="case-sec__note">' +
      (due > 0 ? 'ждёт вас' : o.claimed ? 'на сверке' : 'по плану') + '</span></header>' +
      (scale || '') + '<p class="case-note">' + note + '</p>' +
      '<div class="case-acts"><button type="button" class="btn btn-line" data-jump="secPay">' +
      (due > 0 ? 'Перейти к оплате' : 'История платежей') + '</button></div></section>';
  }

  /* -------- правая колонка эталона: .case-support -------- */
  function caseSupport(o) {
    return '<section class="fs-sec case-sec case-support">' +
      '<span class="case-support__mark" aria-hidden="true">?</span>' +
      '<h3>Нужна помощь?</h3>' +
      '<p>Напишите мастеру прямо в деле — он видит номер ' + esc(o.no) +
      ' и всю переписку. Общие вопросы удобнее задать в разделе «Помощь».</p>' +
      '<div class="case-acts"><button type="button" class="btn btn-line" data-chat-focus>' +
      'Написать по делу</button>' +
      '<button type="button" class="line-link" data-tab="help">Связь с мастерской ' +
      '<span aria-hidden="true">→</span></button></div></section>';
  }

  /* ход дела свёрнут, когда у клиента есть действие поважнее (оплата/решение) —
     этапы остаются в одном клике, но не отталкивают главное вниз */
  function stageFold(o) {
    if (o.step < 0) return stageRows(o); /* закрытая заявка — короткая заметка */
    var open = !needsAction(o) && o.status !== 'done' && o.status !== 'cancel';
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

  function payBlock(o) {
    /* блок оплаты: только когда реально есть что платить (или отметка на сверке) —
       во время работы над частью клиента не дёргаем кнопками оплаты */
    var due = o.due_now && o.due_now.amount ? o.due_now.amount : 0;
    var wantPay = due > 0;
    if (!wantPay && !o.claimed) return payHistory(o) ? '<div class="fs-sec case-sec case-pay" id="secPay">' +
      '<header><div><p class="eyebrow">Оплата</p><h3>История платежей</h3></div></header>' +
      payHistory(o) + '</div>' : '';
    var head = '<div class="fs-sec case-sec case-pay" id="secPay">' +
      '<header><div><p class="eyebrow">Оплата</p><h3>' +
      esc((o.due_now && o.due_now.label) || 'Платёж по делу') + '</h3></div>' +
      (due ? '<strong class="case-sum">' + money(due) + ' ₽</strong>' : '') + '</header>';
    if (o.claimed) {
      return head +
        '<div class="account-notice"><span class="account-notice__mark" aria-hidden="true">₽</span>' +
        '<div><strong>Отметка «оплатил» у мастера</strong>' +
        '<p>Мастер сверяет поступление — как подтвердит, заказ двинется дальше и придёт уведомление. ' +
        'Подтверждение перевода ускорит сверку.</p></div></div>' +
        '<div class="case-acts">' +
        '<label class="btn btn-line case-upload">Приложить подтверждение перевода<input type="file" id="cabReceipt" hidden accept="image/*,.pdf"></label>' +
        '<button type="button" class="btn btn-line" data-act="paid_undo">Я ещё не оплатил — снять отметку</button>' +
        '<button type="button" class="btn btn-line" data-chat-focus>Вопрос по оплате</button></div>' +
        payHistory(o) + '</div>';
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
    var payBtns = '<div class="case-acts">' +
      (depBtn ? '<button type="button" class="btn btn-wax" data-act-pay-dep>С депозита — ' + money(depDue) + ' ₽</button>' : '') +
      (o.pay_online ? '<button type="button" class="btn ' + (depBtn ? 'btn-line' : 'btn-wax') + '" data-act-pay>Оплатить картой онлайн</button>' : '') +
      '<button type="button" class="btn ' + (o.pay_online || depBtn ? 'btn-line' : 'btn-wax') + '" data-act="paid">Я оплатил(а) переводом</button>' +
      '<button type="button" class="btn btn-line" data-chat-focus>Вопрос по оплате</button></div>';
    return head + req + receiptField + payBtns + payHistory(o) + '</div>';
  }

  function actionsBlock(o) {
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
    var pay = ((o.due_now && o.due_now.amount > 0) || o.claimed ||
               (o.payments || []).some(function (p) { return p.status === 'paid'; }))
      ? payBlock(o) : '';
    if (!b.length) return pay || (payHistory(o) ? '<div class="fs-sec case-sec case-pay" id="secPay">' +
      '<header><div><p class="eyebrow">Оплата</p><h3>История платежей</h3></div></header>' +
      payHistory(o) + '</div>' : '');
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
  function filesBlock(o) {
    var rows = (o.files || []).map(function (f) {
      var bits = [f.from === 'master' ? 'от мастерской' : 'ваш файл', dt(f.at)];
      if (f.part && (o.stages_total || 1) > 1) bits.push('часть ' + f.part);
      if (f.label) bits.push(esc(f.label));
      return '<a class="file-row" href="#" data-protected-asset="' + apiPath(o.id, '/file/' + f.id) +
        '" data-order-id="' + o.id + '" data-filename="' + esc(f.name) + '">' +
        '<i aria-hidden="true">' + fileExt(f.name) + '</i>' +
        '<span><strong>' + esc(f.name) + '</strong><small>' + bits.join(' · ') +
        (f.new ? ' <b class="file-row__new">новый</b>' : '') + '</small></span>' +
        '<b aria-hidden="true">—</b></a>';
    }).join('');
    var n = (o.files || []).length;
    var meta = n
      ? (n + ' ' + plural(n, 'файл', 'файла', 'файлов') + (o.files_new ? ' · есть новые' : ''))
      : 'приложить методичку или задание';
    var open = n > 0 || o.status === 'new';
    return fold('secFiles', 'Документы', meta,
      (rows ? '<div class="case-files">' + rows + '</div>'
            : '<p class="case-sec__lead">Пока пусто. Приложите методичку или задание — мастеру будет проще оценить работу точно.</p>') +
      '<div class="case-acts"><label class="btn btn-line case-upload">Приложить файл<input type="file" id="cabUpload" hidden></label></div>' +
      '<p class="case-note up-note" id="upNote" hidden></p>' +
      '<p class="case-note"><button type="button" class="line-link" data-tab="documents">' +
      'Все документы кабинета <span aria-hidden="true">→</span></button></p>', open);
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

  function chatBlock(o) {
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
      hasMsgs || !!o.unread);
  }

  /* -------- доступ к делу: секретная ссылка для других устройств --------
     uid=true — режим «Помощи», где блок рендерится ПО КАЖДОМУ делу:
     id уникальные (иначе дубли secAccess), токен зашит в кнопку —
     копироваться обязан токен ЭТОГО дела, а не текущего открытого */
  function accessBlock(o, uid) {
    var t = tokenFor(o.id);
    if (!t) return ''; /* заказы аккаунта открываются входом через Telegram */
    return fold(uid ? 'secAccess-' + o.id : 'secAccess',
      'Доступ к делу' + (uid ? ' ' + esc(o.no) : ''), 'ссылка для других устройств',
      '<p class="case-sec__lead">Дело открывается на любом устройстве по секретной ссылке — сохраните её себе (заметки, «Избранное»). ' +
      'Не пересылайте посторонним: у кого ссылка, тот видит дело. По желанию привяжите Telegram — статусы придут и в бота.</p>' +
      '<div class="case-acts">' +
      '<button type="button" class="btn btn-line" data-access-copy="' + esc(t) + '">Скопировать ссылку доступа</button>' +
      '<a class="btn btn-line" href="https://t.me/academic_saloon_bot?start=claim_' + encodeURIComponent(t) + '" target="_blank" rel="noopener">Привязать Telegram</a>' +
      '</div>', false);
  }

  var STAMP_TONE = { priced: 's-act', prepay: 's-act', check: 's-act', fix: 's-act',
                     done: 's-done', cancel: 's-mute' };

  /* чипы-навигация по делу (мобайл): довести до раздела без листания */
  function jumpChips(o) {
    var chips = [];
    var due = o.due_now && o.due_now.amount ? o.due_now.amount : 0;
    if (due > 0 || o.claimed)
      chips.push(['secPay', 'Оплата' + (due > 0 ? ' · ' + money(due) + ' ₽' : ''), true]);
    if (o.actions.indexOf('accept_work') >= 0) chips.push(['secDecide', 'Решение', true]);
    chips.push(['secFiles', 'Документы' + ((o.files || []).length ? ' · ' + o.files.length : ''), false]);
    chips.push(['secChat', 'Переписка' + (o.unread ? ' · ' + o.unread : ''), !!o.unread]);
    if (manageBlock(o)) chips.push(['secManage', 'Управление', false]);
    return '<div class="ord-jump" role="navigation" aria-label="Разделы дела">' +
      chips.map(function (c) {
        return '<button type="button" class="oj' + (c[2] ? ' hot' : '') + '" data-jump="' + c[0] + '">' + c[1] + '</button>';
      }).join('') + '</div>';
  }


  /* ================= РАЗДЕЛЫ КАБИНЕТА (v2 «Маркетплейс», 2026-07-22) =================
     Постоянный каркас: строка личности + вкладки; контент собирается из
     прежних блоков. Вкладка живёт в location.hash — переживает F5 и даёт
     прямые ссылки (#orders, #wallet, #club, #help). */
  function tabBadges() {
    var unread = 0;
    st.orders.forEach(function (o) { unread += (o.unread || 0) + (o.files_new || 0); });
    return {
      orders: unread > 0 ? (unread > 99 ? '99+' : String(unread)) : '',
      club: (st.me && st.me.sub_pending) ? '!' : ''
    };
  }
  /* Навигация кабинета повторяет финальный account-shell из дизайн-концепта.
     data-tab остаётся единственным источником смены разделов. */
  function navSide() {
    var badge = tabBadges();
    var bonus = st.me && st.me.bonus ? st.me.bonus.balance || 0 : 0;
    var deposit = st.me && st.me.deposit ? st.me.deposit.balance || 0 : 0;
    var documentCount = st.orders.reduce(function (sum, order) {
      return sum + ((order.files && order.files.length) || order.files_count || 0);
    }, 0);
    var items = [
      ['home', 'Дела', String(st.orders.length || '')],
      ['messages', 'Сообщения', badge.orders || ''],
      ['documents', 'Документы', documentCount ? String(documentCount) : ''],
      ['wallet', 'Платежи', ''],
      ['club', 'Клуб Салона', bonus ? money(bonus) : (badge.club || '')],
      ['deposit', 'Депозит', deposit ? money(deposit) + ' ₽' : '']
    ];
    return '<nav aria-label="Разделы кабинета">' + items.map(function (item) {
      return '<button type="button" class="' + (st.tab === item[0] ? 'is-current' : '') +
        '" data-tab="' + item[0] + '" aria-current="' + (st.tab === item[0] ? 'page' : 'false') + '">' +
        '<span>' + item[1] + '</span>' + (item[2] ? '<b' +
        (item[0] === 'orders' && badge.orders ? ' class="badge-wax"' : '') + '>' + item[2] + '</b>' : '') +
        '</button>';
    }).join('') + '</nav>';
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
    return '';
  }
  function sideFoot() {
    return '<div class="account-nav__bottom">' +
      '<button type="button" data-tab="help">Помощь</button>' +
      '<button type="button" data-tab="settings">Настройки</button>' +
      '</div>';
  }

  /* заголовок рабочей полосы: раздел + живая мета */
  function tabHead() {
    var u = S.api.token() && S.api.user();
    var first = u && u.name ? String(u.name).trim().split(/\s+/)[0] : '';
    var copy = {
      home: ['Личный кабинет', first ? 'Добрый день, ' + esc(first) + '.' : 'Ваш личный кабинет.',
        'Здесь собраны текущие дела, документы и вопросы редактора.'],
      orders: ['Работа мастерской', 'Ваши дела.', 'Сроки, файлы, сообщения и оплата по каждому заказу.'],
      messages: ['Личный кабинет', 'Сообщения.', 'Новые вопросы редактора и переписка собраны по делам.'],
      documents: ['Личный кабинет', 'Документы.', 'Файлы, спецификации, акты и подтверждения оплаты.'],
      wallet: ['Платежи и документы', 'Счета и привилегии.', 'Депозит, бонусы и подтверждения операций ведутся раздельно.'],
      deposit: ['Платежи и документы', 'Депозит мастерской.', 'Пополнения и использование средств отражаются отдельно от бонусов.'],
      club: ['Клуб Салона', 'Абонементы и сопровождение.', 'Состав, срок и стоимость видны до каждого отдельного платежа.'],
      help: ['Связь с мастерской', 'Помощь по вашему делу.', 'Выберите удобный способ связи или восстановите доступ к заказу.'],
      settings: ['Личный кабинет', 'Настройки.', 'Тема интерфейса, данные аккаунта и выход из кабинета.']
    }[st.tab];
    return '<header class="account-main__head"><div><p class="eyebrow">' + copy[0] + '</p>' +
      '<h1>' + copy[1] + '</h1><p>' + copy[2] + '</p></div>' +
      '<a class="button button--primary" href="configurator.html">Новая заявка <span aria-hidden="true">→</span></a></header>';
  }

  function setTab(tab, silentHash) {
    st.tab = tab;
    st.caseOpen = false; /* раздел стойки всегда открывает свой список, не дело */
    if (tab === 'club') st.plusOpen = true;
    if (!silentHash) {
      try { history.replaceState(null, '', '#' + tab); } catch (e) { location.hash = tab; }
    }
    renderTab();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ---------------- Черновик заявки из этого браузера ----------------
     Незавершённая смета лежит в localStorage (salon_draft) и до отправки
     сервер о ней не знает. Показываем её ОБЫЧНОЙ карточкой дела: черновик
     стоит рядом с настоящими делами, а не отдельной плавающей плашкой.
     Условия допуска те же, что на витрине (extras.js → .resume-card):
     непустой savedAt (посадочные пишут 0 нарочно), две недели памяти,
     живой калькулятор и известный тип работы. */
  function draftSection() {
    var d = S.store.get('salon_draft', null);
    if (!d || !d.savedAt || !d.state || !window.SalonCalc) return '';
    if (Date.now() - d.savedAt > 14 * 24 * 3600 * 1000) return '';
    var t = window.SalonCalc.types.filter(function (x) { return x.id === d.state.type; })[0];
    if (!t) return '';
    var step = Math.max(1, Math.min(4, (d.idx || 0) + 1));
    var saved = new Date(d.savedAt).toLocaleString('ru-RU',
      { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return '<section class="account-orders account-drafts">' +
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

  function homeTab() {
    var me = st.me || {};
    var dep = me.deposit || {}, bon = me.bonus || {};
    var act = activeOrders().length;
    var unread = 0;
    st.orders.forEach(function (o) { unread += (o.unread || 0) + (o.files_new || 0); });
    var sub = me.sub;
    return '<section class="account-summary">' +
      '<article><span class="status-dot"><i></i> сейчас</span><strong>' + act + '</strong><p>' +
      plural(act, 'дело в работе', 'дела в работе', 'дел в работе') + '</p></article>' +
      '<article><span>Требуется внимание</span><strong>' + unread + '</strong><p>' +
      plural(unread, 'новое событие', 'новых события', 'новых событий') + '</p></article>' +
      '<article><span>Бонусный счёт</span><strong>' + money(bon.balance || 0) + ' бонусов</strong><p>условия видны до списания</p></article>' +
      '</section>' +
      nowCard() + draftSection() +
      (st.orders.length ? ordersRegister('') :
        '<section class="account-orders"><header><h2>Ваши дела</h2></header>' +
        '<div class="account-empty"><p>Здесь появятся сроки, файлы и сообщения мастера.</p>' +
        '<a class="button button--primary" href="configurator.html">Описать задачу</a></div></section>') +
      '<section class="account-benefits"><header><div><p class="eyebrow">Счета и привилегии</p>' +
      '<h2>Разные механизмы — отдельный учёт.</h2></div><a class="line-link" href="loyalty.html">Правила программы</a></header><div>' +
      '<button class="account-benefit-card account-benefit-card--deposit" type="button" data-tab="wallet">' +
      '<span class="account-benefit-card__mark">₽</span><div><small>Депозит мастерской</small><strong>' +
      money(dep.balance || 0) + ' ₽</strong><p>денежный остаток для согласованных этапов</p></div><b>→</b></button>' +
      '<button class="account-benefit-card" type="button" data-tab="wallet"><span class="account-benefit-card__mark">Б</span>' +
      '<div><small>Бонусный счёт</small><strong>' + money(bon.balance || 0) + ' бонусов</strong>' +
      '<p>срок и условия списания видны до операции</p></div><b>→</b></button>' +
      '<button class="account-benefit-card account-benefit-card--plus" type="button" data-tab="club">' +
      '<span class="account-benefit-card__mark">АС+</span><div><small>Абонемент</small><strong>' +
      (sub ? 'Активен до ' + esc(sub.expires_ru || '') : 'Не активен') + '</strong>' +
      '<p>состав, срок и цена доступны до оплаты</p></div><b>→</b></button></div></section>' +
      '<section class="account-quick"><button type="button" data-tab="documents"><span>¶</span>' +
      '<strong>Документы по делам</strong>' +
      '<small>Спецификации, акты и файлы</small></button><button type="button" data-tab="help"><span>?</span>' +
      '<strong>Задать вопрос</strong><small>Ответ придёт в кабинет и Telegram</small></button>' +
      '<button type="button" data-tab="club"><span>АС</span><strong>Клуб Салона</strong><small>Бонусы и абонементы</small></button></section>';
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
    return '<section class="account-section reveal">' +
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
      '<p class="account-note">PDF подтверждает платёж мастерской ' +
      'и хранится в кабинете. Это не налоговый чек НПД: официальный чек ' +
      'Robokassa отправляет отдельно на почту, указанную при оплате.</p></section>';
  }

  function walletTab() {
    if (!st.me) return loginNudge('Кошелёк — после входа');
    return promoHintStrip() + bonusCard() + depCard() + paymentDocumentsCard();
  }

  function clubTab() {
    if (!st.me) return loginNudge('Клуб — после входа');
    if (!st.plans) loadPlans();
    var pend = st.me.sub_pending;
    /* subCard сам добавляет plusSection при plusOpen — второй раз не звать,
       иначе витрина и все её id (plusSheet/ctorBox) задваиваются */
    return pend
      ? subPendingCard(pend) + (st.plusOpen ? plusSection() : '')
      : subCard();
  }

  function helpTab() {
    var access = '';
    if (!st.me) {
      st.orders.forEach(function (o) { access += accessBlock(o, true); });
    }
    return notiRow() + linksRow() + access + paymentDocumentsCard() +
      '<section class="account-section reveal">' +
      '<header><div><p class="eyebrow">Связь и полезное</p>' +
      '<h2>Куда написать и что почитать.</h2></div></header>' +
      '<div class="case-acts">' +
      '<button type="button" class="btn btn-wax" data-contact="1">Написать мастеру</button>' +
      '<a class="btn btn-line" href="priyomnaya.html">Открытая приёмная</a></div>' +
      '<p class="account-note account-note--links">' +
      '<a class="link" href="start.html">С чего начать</a> · ' +
      '<a class="link" href="guarantees.html">Гарантии и устав</a> · ' +
      '<a class="link" href="oplata.html">Как проходит оплата</a> · ' +
      '<a class="link" href="loyalty.html">Правила бонусов и депозита</a> · ' +
      '<a class="link" href="oferta.html">Оферта</a> · ' +
      '<a class="link" href="privacy.html">Политика данных</a></p>' +
      '<p class="account-note">Telegram-бот дублирует статусы и умеет всё то же: ' +
      '<a class="link" href="https://t.me/academic_saloon_bot" target="_blank" rel="noopener">@academic_saloon_bot</a></p>' +
      '</section>';
  }

  function settingsTab() {
    var user = S.api.token() && S.api.user();
    return '<section class="account-section reveal">' +
      '<header><div><p class="eyebrow">Настройки кабинета</p>' +
      '<h2>' + (user && user.name ? esc(user.name) : 'Гостевой доступ') + '</h2></div></header>' +
      '<p class="account-note">Тему оформления можно изменить в верхней панели. ' +
      'Настройки аналитики доступны в разделе конфиденциальности.</p>' +
      '<div class="case-acts">' +
      '<a class="btn btn-line" href="privacy.html">Настройки данных</a>' +
      (S.api.token()
        ? '<button type="button" class="btn btn-line" id="cabLogout">Выйти из кабинета</button>'
        : '<button type="button" class="btn btn-wax" id="cabTg">Войти через Telegram</button>') +
      '</div></section>';
  }

  function documentTab() {
    if (!st.orders.length) return tplEmpty();
    return paymentDocumentsCard() + ordersRegister('documents');
  }

  function messagesTab() {
    if (!st.orders.length) return tplEmpty();
    return nowCard() + ordersRegister('messages');
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
      '<button type="button" class="back-link" data-case-back>' +
      '<span aria-hidden="true">←</span> Все дела</button>' +
      '<p class="eyebrow case-file__no">Дело № ' + st.currentId + '</p>' +
      '<h2>Открываем дело…</h2></div></header>' +
      '<div class="account-loading" role="status">Проверяем этапы, файлы и последние сообщения.</div>' +
      '</article>';
  }

  function renderTab() {
    var inner;
    if (st.tab === 'orders') inner = ordersTab();
    else if (st.tab === 'messages') inner = messagesTab();
    else if (st.tab === 'documents') inner = documentTab();
    else if (st.tab === 'wallet') inner = walletTab();
    else if (st.tab === 'deposit') inner = walletTab();
    else if (st.tab === 'club') inner = clubTab();
    else if (st.tab === 'help') inner = helpTab();
    else if (st.tab === 'settings') inner = settingsTab();
    else inner = homeTab();
    var body = caseVisible()
      ? '<section class="account-case-production">' +
        ((st.detail && st.detail.id === st.currentId) ? tplDetail() : caseLoading()) + '</section>'
      : tabHead() + '<div class="account-main__body">' + inner + '</div>';
    render(impBanner() + '<div class="account-shell">' +
      '<aside class="account-nav">' + profileCard() + navSide() + sideMini() + sideFoot() + '</aside>' +
      '<main class="account-main">' + body + '</main>' +
      '</div>' + dockTabs());
    /* док появился ПОСЛЕ замеров app.js: будим measure() — иначе --floor=0
       и угловые пилюли («Связаться», куки) налезают на док до первого resize */
    if (!renderTab._floorSynced) {
      renderTab._floorSynced = true;
      try { window.dispatchEvent(new Event('resize')); } catch (e) {}
    }
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
      '<button type="button" class="back-link" data-case-back>' +
      '<span aria-hidden="true">←</span> Все дела</button>' +
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
      jumpChips(o) +
      '<div class="case-layout">' +
      '<div class="case-main">' +
      pauseBand(o) + finalBand(o) + partBand(o) + dueBand(o) +
      caseOverview(o) + orderItemsBlock(o) +
      priceBlock(o) + giftRestStrip(o) + actionsBlock(o) +
      stageFold(o) + reviewBlock(o) + thanksBlock(o) + defenseBlock(o) +
      chatBlock(o) +
      '</div>' +
      '<aside class="case-aside">' +
      filesBlock(o) + caseAsidePay(o) + manageBlock(o) + accessBlock(o) + caseSupport(o) +
      '</aside>' +
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
    if (!t && !g.length) {
      /* если вход уже запущен (в т.ч. до перезагрузки страницы) — продолжаем ловить */
      var pending = S.resumeTgLogin(
        function (u) { toast('Вы вошли' + (u && u.name ? ', ' + u.name : '') + '.'); loadList(); },
        function () { lastPending = null; render(tplLogin(null)); });
      lastPending = pending;
      render(tplLogin(pending));
      ensureFeatures();
      return;
    }
    /* первая загрузка: скелет формуляра вместо пустого экрана */
    if (!root.querySelector('.account-shell') && !root.querySelector('.cab-login')) {
      render('<div class="cab-skel reveal" aria-hidden="true">' +
        '<div class="sk sk1"></div><div class="sk sk2"></div><div class="sk sk3"></div></div>');
    }
    if (t) {
      S.api.get('/me').then(function (r) {
        if (r.ok) {
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
      if (!keepCurrent || !current) st.currentId = pickDefaultId();
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
    if (!st.detail) { renderTab(); return; }
    var draft = (document.getElementById('chatText') || {}).value || '';
    renderTab();
    var ta = document.getElementById('chatText');
    if (ta && draft) ta.value = draft;
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
    S.api.get(apiPath(id), orderHeaders(id)).then(function (r) {
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
        var draft = (document.getElementById('chatText') || {}).value || '';
        renderTab();
        var ta = document.getElementById('chatText');
        if (ta && draft) ta.value = draft;
        var feed = document.getElementById('chatFeed');
        if (feed) feed.scrollTop = feed.scrollHeight;
        scheduleFilesSeen(r.order);
        if (st.pendingJump) { scrollToEl(st.pendingJump); st.pendingJump = null; }
      }
    });
  }

  function refreshListSilent() {
    var t = S.api.token(), g = S.api.guestTokens();
    if (!t && !g.length) return;
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
        renderTab();
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
    var h = orderHeaders(st.currentId);
    var sess = S.api.token();
    if (sess) h.Authorization = 'Bearer ' + sess;
    fetch(url, { method: 'POST', body: fd, headers: h })
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
    if (btn) { btn.disabled = true; btn.textContent = 'Открываем Telegram…'; }
    var hint = document.getElementById('cabTgHint');
    S.tgLogin(
      function (user) { toast('Вы вошли' + (user && user.name ? ', ' + user.name : '') + '.'); loadList(); },
      function () { if (btn) { btn.disabled = false; btn.textContent = 'Войти через Telegram →'; } toast('Вход не подтвердился — попробуйте ещё раз'); },
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
      try { history.replaceState(null, '', '#' + st.tab); } catch (e) {}
      var newId = parseInt(sw.getAttribute('data-ord'), 10);
      var sameCase = st.currentId === newId && !!st.detail;
      st.currentId = newId;
      st.caseOpen = true;
      /* экран дела открываем сразу: уже загруженное дело показываем целиком,
         новое — с честной строкой ожидания, пока идёт /orders/<id> */
      renderTab();
      loadDetail(sameCase);
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    /* возврат к реестру — ссылка «Все дела» в шапке дела (маршрут эталона) */
    if (t.closest('[data-case-back]')) {
      st.caseOpen = false;
      renderTab();
      window.scrollTo({ top: 0, behavior: 'auto' });
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
      try { history.replaceState(null, '', '#' + st.tab); } catch (e) {}
      var nid = parseInt(nowBtn.getAttribute('data-now-open'), 10);
      var njump = nowBtn.getAttribute('data-now-jump') || '';
      var wasOpen = st.currentId === nid && st.detail && st.caseOpen;
      st.currentId = nid;
      st.caseOpen = true;
      if (wasOpen) { if (njump) scrollToEl(njump); return; }
      st.pendingJump = njump || null;
      if (st.detail && st.detail.id === nid) renderTab();
      loadDetail();
      return;
    }
    var segBtn = t.closest('[data-seg-period]');
    if (segBtn) {
      st.showPeriod = segBtn.getAttribute('data-seg-period') === 'sem' ? 'sem' : 'month';
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
      /* токен берём из самой кнопки: в «Помощи» блоки идут по каждому делу */
      var atok = acp.getAttribute('data-access-copy') || tokenFor(st.currentId);
      if (atok && S.copy) S.copy(S.claimLink ? S.claimLink(atok) : atok).then(function (okc) {
        toast(okc ? 'Ссылка доступа скопирована — сохраните её себе' : 'Не удалось скопировать — выделите ссылку вручную');
      });
      return;
    }
    if (t.closest('#cabNotiBtn')) { notiAsk(); return; }
    var jmp = t.closest('[data-jump]');
    if (jmp) {
      var jTo = jmp.getAttribute('data-jump');
      if ((jTo === 'plusCard' || jTo === 'subPaySheet') && st.tab !== 'club') {
        setTab('club');
        setTimeout(function () { scrollToEl(jTo); }, 60);
        return;
      } scrollToEl(jmp.getAttribute('data-jump')); return; }
    if (t.closest('#clubToggle')) {
      st.clubOpen = !st.clubOpen;
      rerenderHome();
      return;
    }
    if (t.closest('#ctorShow')) { st.ctorOpen = true; rerenderHome(); scrollToEl('ctorBox'); return; }
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
      rerenderHome();
      return;
    }
    if (t.closest('#curShow')) { st.curOpen = true; rerenderHome(); return; }
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
    if (t.closest('#cabTgCancel')) { S.store.del('salon_auth_pending'); render(tplLogin(null)); return; }
    var oaBtn = t.closest('[data-oauth]');
    if (oaBtn) {
      /* серверный OAuth: уходим к провайдеру, вернёмся с #oauth=токен */
      window.location.href = S.api.base + '/auth/' + oaBtn.getAttribute('data-oauth') + '/start';
      return;
    }
    var oaLink = t.closest('[data-oauth-link]');
    if (oaLink) {
      var provider = oaLink.getAttribute('data-oauth-link');
      oaLink.disabled = true;
      S.api.post('/auth/' + provider + '/link-start', {}).then(function (r) {
        if (!r.ok || !r.url) {
          oaLink.disabled = false;
          toast(r.error === 'provider_off'
            ? 'Этот способ входа пока не подключён'
            : 'Не получилось начать привязку — войдите заново и повторите');
          return;
        }
        window.location.href = r.url;
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
    if (t.closest('#cabLogout')) { S.api.logout(); st.detail = null; loadList(); return; }
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
    if (t.closest('[data-act-fix]')) { var ff = document.getElementById('fixForm'); if (ff) { ff.hidden = false; document.getElementById('fixText').focus(); } return; }
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

  /* ---------------- старт ---------------- */
  /* dashboard.html#plus — сразу раскрыть витрину «Салон+» (ссылки с referral)
     и довести взгляд до неё (на телефоне карточка ниже первого экрана) */
  var hashPlusScroll = false;
  try {
    var h0 = (location.hash || '').replace('#', '');
    if (h0.indexOf('plus') >= 0) {
      st.tab = 'club'; st.plusOpen = true; st.clubOpen = true; hashPlusScroll = true;
    }
    else if (['home', 'orders', 'messages', 'documents', 'wallet', 'deposit', 'club', 'help', 'settings'].indexOf(h0) >= 0) {
      st.tab = h0;
      if (h0 === 'club') st.plusOpen = true;
    }
    if (/[?&](paid|thanks)=/.test(location.search)) st.tab = 'orders';
  } catch (e) {}
  window.addEventListener('hashchange', function () {
    var h = (location.hash || '').replace('#', '');
    if (['home', 'orders', 'messages', 'documents', 'wallet', 'deposit', 'club', 'help', 'settings'].indexOf(h) >= 0 && h !== st.tab) setTab(h, true);
  });
  /* ссылка доступа с другого устройства: #claim=<токен> (или ?claim=) */
  try {
    var claimTok = (location.hash.match(/claim=([A-Za-z0-9_-]+)/) ||
                    location.search.match(/claim=([A-Za-z0-9_-]+)/) || [])[1];
    if (claimTok) {
      S.api.addGuestToken(claimTok);
      history.replaceState(null, '', location.pathname);
      toast('Дело добавлено на это устройство');
    }
  } catch (e) {}
  /* возврат из ВК/Mail.ru: сервер кладёт токен сессии во фрагмент адреса —
     он не светится ни в логах, ни в Referer; забираем и чистим строку */
  try {
    var oauthTok = (location.hash.match(/oauth=([A-Za-z0-9_-]+)/) || [])[1];
    var oauthErr = (location.hash.match(/oauth_err=([a-z_]+)/) || [])[1];
    if (oauthTok) {
      S.api.setToken(oauthTok);
      history.replaceState(null, '', location.pathname);
      var gtOa = S.api.guestTokens();
      if (gtOa.length) S.api.post('/orders/claim', { tokens: gtOa });
      toast('Вы вошли');
    } else if (oauthErr) {
      history.replaceState(null, '', location.pathname);
      toast({
        declined: 'Вход отменён на стороне сервиса',
        already_linked: 'Этот профиль уже привязан к другому аккаунту',
        forbidden: 'Доступ для этого аккаунта закрыт'
      }[oauthErr] || 'Вход через сервис не удался — попробуйте Telegram или почту');
    }
  } catch (e) {}
  /* возврат со страницы оплаты: ?paid=<id> — открываем заказ и обновляем */
  try {
    var paidId = new URLSearchParams(location.search).get('paid');
    if (paidId) {
      st.currentId = parseInt(paidId, 10) || null;
      st.caseOpen = true;
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
    loadList();
    startPolling();
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
