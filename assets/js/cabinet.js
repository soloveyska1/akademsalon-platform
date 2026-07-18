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
    archOpen: false,  // развёрнут ли «Архив» в корешках
    remOpen: false,   // развёрнуты ли «убранные» (архивированные) дела
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
        toast(p === 'granted' ? 'Уведомления включены — догонят вас в любой вкладке 🔔'
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
  function systemNote(no, body) {
    hiddenNews++;
    titleBadge();
    if (!notiOn()) return;
    try {
      var n = new Notification('Дело ' + no + ' — Академический Салон',
        { body: body, icon: 'assets/img/favicon-120.png', tag: 'salon-' + no });
      n.onclick = function () { try { window.focus(); } catch (e) {} this.close(); };
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { hiddenNews = 0; titleBadge(); }
  });

  /* печати и подписи для смен статуса — «красивые уведомления» */
  var STATUS_STAMP = {
    work: ['В работе', 'Оплата получена — работа пошла'],
    check: ['Готово', 'Работа ждёт вашей проверки'],
    done: ['Принято', 'Заказ завершён — спасибо!'],
    priced: [null, 'Мастер назначил цену — решение за вами'],
    fix: [null, 'Приняли в правки']
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
  /* обратный отсчёт до сдачи — по deadline_date, только для живых дел */
  function daysLeft(o) {
    if (!o.deadline_date || o.step < 0 || o.status === 'done') return null;
    var d = new Date(o.deadline_date + 'T23:59:59');
    if (isNaN(d)) return null;
    return Math.ceil((d - new Date()) / 86400000);
  }
  function deadlineChip(o) {
    var n = daysLeft(o);
    if (n === null) return '';
    if (n < 0) return '<span class="dl-chip late">⏰ срок вышел — обсудите с мастером</span>';
    if (n === 0) return '<span class="dl-chip warn">⏰ сдача сегодня</span>';
    return '<span class="dl-chip' + (n <= 3 ? ' warn' : '') + '">⏳ до сдачи ' + n + ' ' +
      plural(n, 'день', 'дня', 'дней') + '</span>';
  }
  function tokenFor(id) {
    for (var i = 0; i < st.orders.length; i++)
      if (st.orders[i].id === id && st.orders[i].token) return st.orders[i].token;
    return null;
  }
  function qs(id) { /* хвост авторизации для GET-ссылок (скачивание) и запросов гостя */
    var t = tokenFor(id);
    if (t) return 'token=' + encodeURIComponent(t);
    var s = S.api.token();
    return s ? 'session=' + encodeURIComponent(s) : '';
  }
  function apiPath(id, tail) {
    var q = qs(id);
    return '/orders/' + id + (tail || '') + (q ? '?' + q : '');
  }
  function render(html) {
    root.innerHTML = html;
    if (S.observeReveal) S.observeReveal(root);
    root.querySelectorAll('.reveal').forEach(function (n) { n.classList.add('in'); });
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
    return '<div class="due-box" id="giftRest" data-oid="' + o.id + '" data-code="' + esc(o.gift_code) + '" hidden></div>';
  }
  function giftRestFill() {
    var box = document.getElementById('giftRest');
    if (!box) return;
    var code = box.getAttribute('data-code'), oid = box.getAttribute('data-oid');
    function show(bal) {
      if (!(bal > 0)) { box.remove(); return; }
      box.innerHTML =
        '<div class="dr"><span>💳 Остаток на сертификате ' + esc(code) + '</span><b>' + money(bal) + ' ₽</b></div>' +
        '<p class="petit" style="margin:6px 0 8px">Он не сгорел и ждёт: хватит на презентацию и речь к защите, нормоконтроль или часть новой работы.</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<a class="btn btn-line" href="configurator.html?service=df&gift=' + encodeURIComponent(code) + '">🎤 Презентация и речь</a>' +
        '<a class="btn btn-line" href="configurator.html?gift=' + encodeURIComponent(code) + '">📝 Новая заявка с кодом</a>' +
        '<button type="button" class="linkbtn" id="giftRestHide">не напоминать</button></div>';
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
    return '<div class="club-strip reveal" id="promoHint"><span class="cs-item">🏷 Промокод <b>' + esc(p.code) + '</b> ждёт: ' + esc(p.label || 'скидка') + '</span>' +
      '<span class="cs-dot">·</span><a class="linkbtn wax cs-more" href="configurator.html?promo=' + encodeURIComponent(p.code) + '">применить к новой заявке</a>' +
      '<button type="button" class="linkbtn cs-more" id="promoHintHide" style="margin-left:8px">скрыть</button></div>';
  }
  function toast(msg) { if (S.toast) S.toast(msg); }

  /* ---------------- экраны входа/пустоты ---------------- */
  function tplLogin(pending) {
    var pendingBlock = pending
      ? '<div class="req-slip" style="margin-bottom:14px"><p class="petit" style="margin:0"><b>Ждём подтверждение в Telegram.</b> ' +
        'Откройте бота и нажмите <b>Start</b> — эта страница поймает вход сама, даже если вы её перезагрузите.</p>' +
        '<div class="act-row"><a class="btn btn-wax" href="' + (pending.link || 'https://t.me/academic_saloon_bot') + '" target="_blank" rel="noopener">Открыть Telegram</a>' +
        '<button type="button" class="btn btn-line" id="cabTgCancel">Отменить вход</button></div></div>'
      : '';
    /* Telegram — первым: одна кнопка, самый надёжный канал. Остальные способы —
       тихим рядом под чертой «или»: экран входа не должен быть простынёй. */
    var f = st.features || {};
    var provBtns = [];
    if (f.vk_login) {
      provBtns.push('<button type="button" class="btn btn-line" data-oauth="vk">' +
        '<span class="pv-ic pv-vk">VK</span>ВКонтакте</button>');
    }
    if (f.mailru_login) {
      provBtns.push('<button type="button" class="btn btn-line" data-oauth="mailru">' +
        '<span class="pv-ic pv-mr">@</span>Mail.ru</button>');
    }
    if (f.email_login) {
      provBtns.push('<button type="button" class="btn btn-line" id="cabEmailTgl">' +
        '<span class="pv-ic">✉</span>Код на почту</button>');
    }
    var emailBlock = '';
    if (provBtns.length) {
      emailBlock = '<div class="cab-or" aria-hidden="true">или</div>' +
        '<div class="cab-prov">' + provBtns.join('') + '</div>' +
        (f.email_login
          ? '<div id="cabEmailWrap" hidden>' +
            '<p class="petit" style="margin:12px 0 8px">Пришлём 6-значный код — без паролей. ' +
            'Адреса @mail.ru и @bk.ru иногда задерживают письма — тогда надёжнее Telegram.</p>' +
            '<div class="act-row" id="cabEmailBox" style="margin:0">' +
              '<input type="email" id="cabEmailIn" placeholder="you@mail.ru" autocomplete="email" ' +
                'style="flex:2;min-width:0;font:inherit;font-size:16px;padding:11px 12px;color:inherit;border:1px solid var(--hairline-strong);border-radius:var(--r);background:transparent">' +
              '<button type="button" class="btn btn-wax" id="cabEmailSend" style="flex:1">Получить код</button>' +
            '</div></div>'
          : '');
    }
    /* пришли за «Салон+» с витрины (#plus), а сессии нет — не встречать гостя
       голой стеной входа: объясняем, что абонемент ждёт сразу за дверью */
    var plusTeaser = (typeof hashPlusScroll !== 'undefined' && hashPlusScroll)
      ? '<div class="req-slip" style="margin-bottom:14px"><p class="petit" style="margin:0">' +
        '⭐ <b>Абонемент «Салон+»</b> привязывается к аккаунту: скидка на каждый заказ (от −5%, ' +
        'в плане «Про» — до −10% и 3 000 ₽), приоритет мастера и куратор сессии. ' +
        'Войдите через Telegram — это минута, без паролей — и витрина планов откроется сама.</p></div>'
      : '';
    return '<div class="sheet sheet-pad stacked cab-login reveal">' +
      '<p class="caps">Вход в кабинет</p>' +
      '<h2 class="ord-type">Ваши заказы — здесь, на сайте</h2>' +
      '<p class="petit" style="margin-bottom:16px">Без паролей: одна кнопка — и кабинет ваш. ' +
      'Заказы этого устройства открываются и без входа.</p>' +
      plusTeaser +
      pendingBlock +
      (pending ? '' : '<button type="button" class="btn btn-wax btn-block" id="cabTg">Войти через Telegram <span class="ar">→</span></button>') +
      '<p class="petit cab-login-hint" id="cabTgHint" hidden></p>' +
      emailBlock +
      '<details class="cab-alt" style="margin-top:16px"><summary>У меня есть ссылка доступа к делу</summary>' +
      '<p class="petit" style="margin:6px 0 10px">Она была на экране «Заявка принята» — вставьте её целиком, дело откроется без входа.</p>' +
      '<div class="act-row" style="margin:0 0 12px">' +
        '<input type="text" id="cabClaimIn" placeholder="Ссылка доступа или код дела" style="flex:2;min-width:0;font:inherit;font-size:16px;padding:11px 12px;color:inherit;border:1px solid var(--hairline-strong);border-radius:var(--r);background:transparent">' +
        '<button type="button" class="btn btn-line" id="cabClaimBtn" style="flex:1">Открыть дело</button>' +
      '</div></details>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1px solid var(--hairline)">' +
        '<a class="btn btn-line" style="flex:1" href="configurator.html">Оформить первый заказ <span class="ar">→</span></a>' +
      '</div>' +
      '</div>';
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
        '<input type="text" id="cabEmailCode" inputmode="numeric" maxlength="6" placeholder="Код из письма" ' +
          'style="flex:2;min-width:0;font:inherit;font-size:14px;padding:10px 12px;color:inherit;border:1px solid var(--hairline-strong);border-radius:var(--r);background:transparent;letter-spacing:.2em">' +
        '<button type="button" class="btn btn-wax" id="cabEmailGo" style="flex:1">Войти</button>';
      box.insertAdjacentHTML('afterend',
        '<p class="petit" id="cabEmailNote" style="margin:-8px 0 18px">Код отправлен на <b>' + esc(email) + '</b> — действует 10 минут. ' +
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
        toast('Вы вошли' + (r.user && r.user.name ? ', ' + r.user.name : '') + ' ✓');
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
      '<input type="email" id="cabEmailIn" placeholder="you@mail.ru" autocomplete="email" ' +
        'style="flex:2;min-width:0;font:inherit;font-size:14px;padding:10px 12px;color:inherit;border:1px solid var(--hairline-strong);border-radius:var(--r);background:transparent">' +
      '<button type="button" class="btn btn-wax" id="cabEmailSend" style="flex:1">Получить код</button>';
    var inp = document.getElementById('cabEmailIn');
    if (inp) { inp.value = st.emailTo || ''; inp.focus(); }
  }

  /* открыть дело по ссылке доступа / коду (токен заказа) */
  function claimByCode(raw) {
    var s = String(raw == null ? '' : raw).trim();
    var m = s.match(/(?:claim|token)=([A-Za-z0-9_-]+)/);
    var tok = m ? m[1] : (/^[A-Za-z0-9_-]{16,}$/.test(s) ? s : '');
    if (!tok) { toast('Не похоже на ссылку доступа — скопируйте её целиком'); return; }
    S.api.get('/orders?tokens=' + encodeURIComponent(tok)).then(function (r) {
      if (!r.ok) { toast('Не получилось связаться с картотекой — попробуйте ещё раз'); return; }
      if (!(r.orders || []).length) { toast('По этому коду дело не нашлось — проверьте ссылку'); return; }
      S.api.addGuestToken(tok);
      toast('Дело открыто на этом устройстве ✓');
      loadList();
    });
  }

  function tplEmpty() {
    /* порядок по значимости: сначала дело (здесь — приглашение его завести),
       клубные карточки — после */
    return userRow() +
      '<div class="sheet sheet-pad stacked reveal" style="text-align:center">' +
      '<p class="caps">Картотека пуста</p>' +
      '<h2 class="ord-type">Заказов пока нет</h2>' +
      '<p class="petit" style="margin-bottom:16px">Соберите смету в конфигураторе — заявка попадёт к мастеру мгновенно, а статус появится прямо здесь.</p>' +
      '<div class="act-row" style="justify-content:center">' +
      '<a class="btn btn-wax" href="configurator.html">Рассчитать работу <span class="ar">→</span></a>' +
      '<a class="btn btn-line" href="configurator.html?service=pl">Начать с разбора плана · 3 000 ₽</a></div>' +
      '</div>' + clubBlock();
  }

  /* -------- секция-раскрывашка: второстепенное свёрнуто, но под рукой -------- */
  function fold(id, summary, meta, inner, open) {
    if (!inner) return '';
    return '<details class="fs-fold" id="' + id + '"' + (open ? ' open' : '') + '>' +
      '<summary><span class="caps">' + summary + '</span>' +
      (meta ? '<span class="fs-meta">' + meta + '</span>' : '') +
      '<span class="ff-ar" aria-hidden="true">▾</span></summary>' +
      '<div class="ff-body">' + inner + '</div></details>';
  }

  /* незакрытая оплата подписки не прячется никогда: тонкая лента сверху,
     сама карточка оплаты — в клубном блоке ниже дела */
  function subPendingBand() {
    var p = st.me && st.me.sub_pending;
    if (!p) return '';
    return '<div class="pause-band fin-band reveal"><span class="pb-ic">⭐</span><span class="pb-txt">' +
      'Подписка «' + esc(p.label) + '» ждёт оплаты — <b>' + money(p.price) + ' ₽</b>. ' +
      '<button type="button" class="linkbtn" data-jump="plusCard">К оплате подписки ↓</button></span></div>';
  }

  function tplError() {
    return '<div class="sheet sheet-pad stacked reveal" style="text-align:center">' +
      '<p class="petit">Не получилось связаться с картотекой. Проверьте интернет и попробуйте ещё раз.</p>' +
      '<button type="button" class="btn btn-line" id="cabRetry" style="margin-top:10px">Повторить</button>' +
      '</div>';
  }

  function notiRow() {
    /* однострочное приглашение включить уведомления устройства */
    if (!notiSupported() || Notification.permission !== 'default') return '';
    return '<p class="petit reveal" style="margin:2px 0 10px">' +
      '<button type="button" class="linkbtn wax" id="cabNotiBtn">🔔 Включить уведомления на устройстве</button>' +
      ' — статусы, файлы и сообщения догонят вас, даже если вкладка в фоне.</p>';
  }

  function linksRow() {
    /* связанные входы: показываем, только когда ВК/Mail.ru включены на сервере.
       Привязка = тот же серверный OAuth с текущей сессией (?session=) — после
       неё в кабинет можно попадать любым из способов, всё синхронно. */
    var me = st.me || {};
    var f = me.features || {};
    if (!f.vk_login && !f.mailru_login) return '';
    var linked = me.oauth || [];
    var bits = [];
    [['vk', 'ВКонтакте'], ['mailru', 'Mail.ru']].forEach(function (p) {
      if (!f[p[0] + '_login']) return;
      bits.push(linked.indexOf(p[0]) >= 0
        ? '<span style="color:var(--verify,#3D6B50)">' + p[1] + ' ✓</span>'
        : '<button type="button" class="linkbtn" data-oauth-link="' + p[0] + '">привязать ' + p[1] + '</button>');
    });
    if (!bits.length) return '';
    return '<p class="petit reveal" style="margin:2px 0 10px">Входы: Telegram/почта · ' +
      bits.join(' · ') + '</p>';
  }

  /* «тихий» режим мастера: кабинет клиента открыт из админки (#imp=…) */
  function impMode() {
    try {
      return sessionStorage.getItem('salon_imp') === '1' &&
        !!sessionStorage.getItem('salon_imp_token');
    } catch (e) { return false; }
  }

  function userRow() {
    if (impMode()) {
      var nm = '';
      try { nm = sessionStorage.getItem('salon_imp_name') || ''; } catch (e) {}
      return '<div class="cab-id reveal" style="border:1px dashed var(--wax);background:var(--wax-soft);border-radius:6px;padding:8px 10px">' +
        '<span>👁 <b>Режим мастера</b> — кабинет клиента' + (nm ? ' <b>' + esc(nm) + '</b>' : '') +
        '. Действия настоящие, но тихо: визиты и метки «прочитано» не трогаются.</span>' +
        '<span class="ci-act"><button type="button" class="linkbtn" id="cabImpExit">закрыть режим</button></span></div>' +
        notiRow();
    }
    var u = S.api.user();
    if (S.api.token() && u) {
      return '<div class="cab-id reveal">' +
        '<span>Вы вошли как <b>' + esc(u.name || 'гость') + '</b>' + (u.username ? ' (@' + esc(u.username) + ')' : '') + '</span>' +
        '<span class="ci-act"><button type="button" class="linkbtn" id="cabLogout">выйти</button></span></div>' +
        linksRow() +
        notiRow();
    }
    return '<div class="cab-id reveal"><span class="ci-dot guest"></span>' +
      '<span>Гостевой доступ — заказы видны на этом устройстве</span>' +
      '<span class="ci-act"><button type="button" class="linkbtn wax" id="cabTg">войти через Telegram — заказы привяжутся к вам</button></span></div>' +
      notiRow();
  }

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
      var what = (o.final_ready && o.status !== 'prepay') ? 'Работа готова целиком'
        : (o.part_ready && o.status !== 'prepay') ? 'Часть ' + o.part_ready + ' готова'
        : 'Смета согласована';
      msg = what + ' — дело за оплатой' + (due ? ': <b>' + money(due) + ' ₽</b>' : '') + '.';
      sub = o.status === 'prepay'
        ? 'Мастер приступит сразу после первого платежа. Реквизиты и оплата картой — в один клик.'
        : 'Файл придёт сразу, как подтвердится оплата этапа. Правки после — бесплатны.';
      cta = 'Перейти к оплате'; jump = 'secPay';
    } else if (score === 4) {
      msg = 'Мастер назвал цену: <b>' + money(o.price) + ' ₽</b> — решение за вами.';
      sub = (o.stages_total || 1) > 1
        ? 'Платить всё сразу не нужно: старт — только первая часть, остальное по готовности. Бонусы тоже можно применить.'
        : 'Можно применить бонусы, обсудить детали в переписке или принять предложение.';
      cta = 'Посмотреть предложение'; jump = 'secDecide';
    } else if (score === 3) {
      var partW = (o.stages_total || 1) > 1 ? 'Часть ' + (o.stage || 1) + ' из ' + o.stages_total : 'Работа';
      msg = partW + ' на вашей проверке.';
      sub = 'Посмотрите материал: примите — или запросите правки, это бесплатно.';
      cta = 'Проверить и решить'; jump = 'secDecide';
    } else if (score === 2) {
      msg = 'Новые файлы от мастерской в деле ' + esc(o.no) + '.';
      sub = 'Они уже в разделе «Файлы» — и в Telegram, если он привязан.';
      cta = 'Открыть файлы'; jump = 'secFiles';
    } else {
      msg = 'Новое сообщение мастера по делу ' + esc(o.no) + '.';
      sub = 'Ответить можно прямо в переписке дела.';
      cta = 'Открыть переписку'; jump = 'secChat';
    }
    return '<div class="now-card reveal">' +
      '<div class="nc-cap"><span class="caps">Сейчас важно</span>' +
      '<span class="nc-no">дело ' + esc(o.no) + ' · ' + esc(shortWork(o)) + '</span></div>' +
      '<p class="nc-msg">' + msg + '</p>' +
      '<p class="nc-sub">' + sub + '</p>' +
      '<div class="nc-act"><button type="button" class="btn btn-wax" data-now-open="' + o.id +
      '" data-now-jump="' + jump + '">' + cta + ' <span class="ar">→</span></button></div>' +
      '</div>';
  }

  /* -------- «клуб»: бонусы + подписка одной строкой, детали — по клику.
     Кабинет в первую очередь про ДЕЛО; клубные карточки не должны
     отталкивать его вниз. Незакрытая оплата подписки не прячется никогда. */
  function clubBlock() {
    if (!st.me) {
      /* гость: подписки привязаны к аккаунту — тонкий тизер со входом */
      if (!S.api.token()) {
        return '<div class="club-strip reveal"><span>⭐ Абонемент «Салон+» — скидка на каждый заказ, приоритет и куратор сессии</span>' +
          '<button type="button" class="linkbtn wax cs-more" id="cabTg2">войти и подключить</button></div>';
      }
      return '';
    }
    if (st.me.sub_pending) {
      return subPendingCard(st.me.sub_pending) + (st.plusOpen ? plusSection() : '');
    }
    var b = st.me.bonus || {};
    var sub = st.me.sub;
    var bits = ['<span class="cs-item">💎 <b>' + money(b.balance || 0) + '</b> бонусов</span>'];
    var exp = (b.expiring || [])[0];
    if (exp) bits.push('<span class="cs-item cs-warn">⏳ ' + exp.amount + ' сгорят ' + dt(exp.at).slice(0, 5) + '</span>');
    bits.push(sub
      ? '<span class="cs-item">' + esc(sub.emoji || '⭐') + ' Салон+ до <b>' + esc(sub.expires_ru) + '</b></span>'
      : '<span class="cs-item">⭐ Салон+ <span class="petit">от 449 ₽</span></span>');
    return promoHintStrip() +
      '<div class="club-strip reveal">' + bits.join('<span class="cs-dot">·</span>') +
      '<button type="button" class="linkbtn cs-more" id="clubToggle">' +
      (st.clubOpen ? 'свернуть' : (sub ? 'подробнее и куратор' : 'бонусы и подписка')) + '</button></div>' +
      (st.clubOpen ? bonusCard() + subCard() : '');
  }

  /* -------- бонусный счёт (только для вошедших) -------- */
  function bonusCard() {
    if (!st.me || !st.me.bonus) return '';
    var b = st.me.bonus;
    var exp = (b.expiring || []).map(function (e) {
      return e.amount + ' — до ' + dt(e.at).slice(0, 5);
    }).join(' · ');
    var led = '';
    if (st.ledgerOpen) {
      led = '<div class="cbn-ledger" id="bonusLedger">' +
        (st.ledger === null ? '<p class="petit" style="padding:8px 0">Листаем журнал…</p>'
          : (st.ledger.length ? st.ledger.map(function (r) {
              var plus = r.delta > 0;
              if (!r.delta) plus = null;
              return '<div class="bl-row">' +
                '<span class="bl-delta ' + (plus === null ? '' : plus ? 'plus' : 'minus') + '">' +
                  (plus === null ? '·' : (plus ? '+' : '') + r.delta) + '</span>' +
                '<span class="bl-what">' + esc(r.label || '') + (r.note ? ' · ' + esc(r.note) : '') +
                  (r.expires_at && r.delta > 0 ? ' <span class="bl-when">до ' + dt(r.expires_at).slice(0, 5) + '</span>' : '') + '</span>' +
                '<span class="bl-when">' + dt(r.at) + '</span></div>';
            }).join('') : '<p class="petit" style="padding:8px 0">Движений пока нет — бонусы появятся после первого заказа.</p>')) +
        '</div>';
    }
    return '<div class="cbn-card reveal">' +
      '<div><span class="bc-cap">Бонусный счёт</span>' +
      '<span class="bc-num">' + money(b.balance) + '</span></div>' +
      '<div class="bc-side">' +
        (exp ? '<p class="bc-exp">⏳ Сгорание: ' + esc(exp) + '</p>'
             : '<p class="bc-exp">1 бонус = 1 ₽ скидки · списание до 20% заказа</p>') +
        '<div class="bc-act"><button type="button" class="btn btn-line" id="bonusLogBtn">' +
          (st.ledgerOpen ? 'Скрыть журнал' : 'Журнал начислений') + '</button>' +
        '<button type="button" class="btn btn-line" id="bonusRefBtn">Пригласить друга</button></div>' +
      '</div>' + led + '</div>';
  }

  /* -------- подписка «Салон+»: карточка, витрина, конструктор, куратор --------
     У подписки СВОЙ платёжный порядок (не заказ): один перевод, без этапов,
     без бонусов; «я оплатил» → сверка мастером → активация. */
  function subPendingCard(p) {
    var head = '<div class="cbn-card reveal" id="plusCard">' +
      '<div><span class="bc-cap">' + esc(p.emoji || '⭐') + ' Подписка ' + esc(p.label) + '</span>' +
      '<span class="bc-num" style="font-size:20px">ждёт оплаты</span></div>' +
      '<div class="bc-side"><p class="bc-exp">' + esc(p.period_label) + ' · один перевод ' + money(p.price) + ' ₽. ' +
      'Бонусы и скидки к подписке не применяются.</p>' +
      '<div class="bc-act"><button type="button" class="btn btn-line" id="plusToggle">' +
      (st.plusOpen ? 'Свернуть планы' : 'Выбрать другой план') + '</button></div></div></div>';
    var body;
    if (p.claimed) {
      body = '<div class="sheet sheet-pad stacked reveal" id="subPaySheet">' +
        '<p class="caps">Оплата подписки</p>' +
        '<div class="req-slip"><span class="caps">Отметка «оплатил» у мастера</span>' +
        '<p class="petit" style="margin:8px 0 0">Сверяем поступление <b>' + money(p.price) + ' ₽</b> за «' + esc(p.label) + '» — ' +
        'как подтвердим, подписка включится сама и придёт уведомление.</p></div>' +
        '<div class="act-row">' +
        '<button type="button" class="btn btn-line" data-sub-unpaid="' + p.id + '">↩️ Я ещё не оплатил — снять отметку</button>' +
        '</div></div>';
    } else {
      var slip = p.requisites
        ? '<div class="payslip">' +
          '<div class="ps-head"><span class="caps">Платёж за подписку</span>' +
          '<span class="ps-due">' + money(p.price) + ' ₽</span></div>' +
          '<div class="ps-body">' + reqRows(p.requisites) + '</div>' +
          '<div class="ps-steps"><span><b>1</b> переведите сумму</span><span class="ps-ar">→</span>' +
          '<span><b>2</b> отметьте «Я оплатил(а)»</span><span class="ps-ar">→</span>' +
          '<span><b>3</b> сверим — подписка включится сама</span></div></div>'
        : '<p class="petit" style="margin-bottom:4px">Реквизиты появятся здесь в течение пары минут — либо оформите в Telegram: <a class="link" href="https://t.me/academic_saloon_bot?start=plus" target="_blank" rel="noopener">@academic_saloon_bot → /plus</a>.</p>';
      body = '<div class="sheet sheet-pad stacked reveal" id="subPaySheet">' +
        '<p class="caps">Оплата подписки</p>' +
        '<p class="petit" style="margin-bottom:10px">' + esc(p.label) + ' · ' + esc(p.period_label) +
        '. Это не заказ: один платёж без этапов и планов оплат, автосписаний нет.</p>' +
        slip +
        '<div class="act-row">' +
        (p.pay_online ? '<button type="button" class="btn btn-wax" data-sub-pay="' + p.id + '">💳 Оплатить картой онлайн</button>' : '') +
        '<button type="button" class="btn ' + (p.pay_online ? 'btn-line' : 'btn-wax') + '" data-sub-paid="' + p.id + '">Я оплатил(а) подписку</button>' +
        '<button type="button" class="btn btn-line" data-sub-cancel="' + p.id + '">Отменить оформление</button></div>' +
        '<p class="petit" style="margin-top:8px">Оплата подписки — деньгами целиком, бонусы к ней не применяются (<a class="link" href="loyalty.html" target="_blank" rel="noopener">правила, §5</a>).</p>' +
        '</div>';
    }
    return head + body;
  }

  function subCard() {
    if (!S.api.token()) return '';
    var pend = st.me && st.me.sub_pending;
    if (pend) return subPendingCard(pend) + (st.plusOpen ? plusSection() : '');
    var sub = st.me && st.me.sub;
    var head;
    if (sub) {
      head = '<div class="cbn-card reveal" id="plusCard">' +
        '<div><span class="bc-cap">' + esc(sub.emoji || '⭐') + ' Подписка ' + esc(sub.label) + '</span>' +
        '<span class="bc-num" style="font-size:20px">до ' + esc(sub.expires_ru) + '</span></div>' +
        '<div class="bc-side"><p class="bc-exp">' +
        (sub.discount_pct ? '−' + sub.discount_pct + '% на заказы (до ' + money(sub.discount_cap) + ' ₽ с заказа) — применяется сама. ' : '') +
        'Все опции — ниже, в развороте.</p>' +
        '<div class="bc-act"><button type="button" class="btn btn-line" id="plusToggle">' +
        (st.plusOpen ? 'Свернуть' : 'Опции · продлить · куратор') + '</button></div></div></div>';
    } else {
      head = '<div class="cbn-card reveal" id="plusCard">' +
        '<div><span class="bc-cap">⭐ Салон+</span>' +
        '<span class="bc-num" style="font-size:20px">от 449 ₽</span></div>' +
        '<div class="bc-side"><p class="bc-exp">Скидка на каждый заказ, приоритет, куратор сессии и подготовка к защите. Без автосписаний.</p>' +
        '<div class="bc-act"><button type="button" class="btn ' + (st.plusOpen ? 'btn-line' : 'btn-wax') + '" id="plusToggle">' +
        (st.plusOpen ? 'Свернуть' : 'Выбрать план') + '</button></div></div></div>';
    }
    return head + (st.plusOpen ? plusSection() : '');
  }

  function planCardHtml(p) {
    /* билет: имя → ГЛАВНАЯ выгода крупно (скидка) → цена → ключевое одной
       строкой → полный состав за раскрытием → один CTA. Без простыней */
    var pl = st.plans;
    var featObjs = (p.features || []).map(function (fid) {
      return (pl.features || []).filter(function (x) { return x.id === fid; })[0];
    }).filter(Boolean);
    var discF = featObjs.filter(function (f) { return pl.discounts[f.id]; })
      .sort(function (a, b) { return pl.discounts[b.id].pct - pl.discounts[a.id].pct; })[0];
    var disc = discF ? pl.discounts[discF.id] : null;
    var others = featObjs.filter(function (f) { return !discF || f.id !== discF.id; });
    var keyLine = others.slice(0, 3).map(function (f) { return esc(f.label); }).join(' · ');
    var moreList = featObjs.map(function (f) {
      return '<li><b>' + esc(f.label) + '</b>' + (f.hint ? ' — ' + esc(f.hint) : '') + '</li>';
    }).join('');
    var rec = /pro/.test(p.id || '');
    var per = st.showPeriod;
    var price, priceNote, buy, buyLabel;
    if (p.once) {
      price = money(p.month_price) + ' ₽';
      priceNote = 'разовый доступ · ' + p.period_days + ' дней';
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
    return '<div class="ticket' + (rec ? ' rec' : '') + '">' +
      (rec ? '<span class="rec-tape">выгодный выбор</span>' : '<span class="tk-star" aria-hidden="true">' + (p.once ? '🎓' : '⭐') + '</span>') +
      '<span class="tk-name">' + esc(p.label) + '</span>' +
      '<span class="tk-tag">' + esc(p.tagline || '') + '</span>' +
      (disc ? '<span class="tk-hero">−' + disc.pct + '%<small>на каждый заказ · до ' +
        money(disc.cap) + ' ₽ выгоды с заказа</small></span>' : '') +
      '<span class="tk-price">' + price + '<small>' + priceNote + '</small></span>' +
      (keyLine ? '<p class="tk-key">' + keyLine + (others.length > 3 ? ' · и ещё ' + (others.length - 3) : '') + '</p>' : '') +
      (moreList ? '<details class="tk-more"><summary>что входит — полностью</summary><ul>' + moreList + '</ul></details>' : '') +
      '<span class="tk-cta"><button type="button" class="btn ' + (rec ? 'btn-wax' : 'btn-line') +
      '" data-sub-buy="' + buy + '">' + buyLabel + '</button></span>' +
      '</div>';
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
      return '<button type="button" class="ctor-opt' + (on ? ' on' : '') + '" data-ctor-f="' + esc(f.id) +
        '" aria-pressed="' + on + '">' +
        '<span class="co-name">' + esc(f.label) + '</span>' +
        '<span class="co-price">+' + money(f.price) + ' ₽</span>' +
        (f.hint ? '<span class="co-hint">' + esc(f.hint) + '</span>' : '') +
        '<span class="co-tick" aria-hidden="true">✓</span></button>';
    }).join('');
    var chosen = (pl.features || []).filter(function (f) { return st.ctorFeats.indexOf(f.id) >= 0; });
    var comp = '<ul class="ct-comp"><li>База абонемента <b>' + money(pl.base_price) + ' ₽</b></li>' +
      (chosen.length
        ? chosen.map(function (f) {
            var idle = discIds.indexOf(f.id) >= 0 && f.id !== bestId;
            return '<li' + (idle ? ' class="ct-idle"' : '') + '>' + esc(f.label) +
              (idle ? ' <small>не суммируется со скидкой выше</small>' : ' <b>+' + money(f.price) + ' ₽</b>') + '</li>';
          }).join('')
        : '<li class="ct-idle">…выберите опции слева</li>') + '</ul>';
    var saveNote = '';
    if (best) {
      var save = Math.min(Math.round(20000 * best.pct / 100), best.cap);
      saveNote = '<p class="petit ct-note">Курсовая за 20 000 ₽ с таким набором — уже <b>−' + money(save) + ' ₽</b>.</p>';
    }
    var perSeg = '<span class="seg ct-per" role="tablist" aria-label="Срок">' +
      '<button type="button" data-ctor-period="month" class="' + (st.ctorPeriod === 'month' ? 'on' : '') + '">Месяц</button>' +
      '<button type="button" data-ctor-period="sem" class="' + (st.ctorPeriod === 'sem' ? 'on' : '') + '">Семестр · 150 дней</button></span>';
    return '<div class="fs-sec" id="ctorBox"><div class="fs-head"><span class="caps">Соберите свой Салон+</span>' +
      '<span class="fs-meta">база ' + money(pl.base_price) + ' ₽/мес + опции по вкусу</span></div>' +
      '<div class="ctor">' +
      '<div class="ctor-opts">' + opts + '</div>' +
      '<aside class="ctor-ticket"><span class="caps">Ваш абонемент</span>' +
      comp + perSeg +
      '<div class="ct-total" id="ctorTotal">' + (chosen.length ? money(ctorTotal()) + ' ₽' : '—') + '</div>' +
      '<p class="petit ct-note">' + (st.ctorPeriod === 'sem' ? 'одной оплатой за 150 дней' : 'за 30 дней') + ' · без автосписаний</p>' +
      saveNote +
      '<button type="button" class="btn btn-wax btn-block" id="ctorBuy"' + (chosen.length ? '' : ' disabled') + '>Оформить</button>' +
      '<p class="petit ct-note">Из скидочных опций действует одна — самая большая. Готовые планы выгоднее того же набора на 10–15%.</p>' +
      '</aside></div></div>';
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
      return '<div class="dr"><span>📅 ' + d.slice(8, 10) + '.' + d.slice(5, 7) + ' · ' + esc(m.title) + '</span>' +
        '<b><button type="button" class="linkbtn" data-ms-del="' + m.id + '">убрать</button></b></div>';
    }).join('');
    return '<div class="fs-sec"><div class="fs-head"><span class="caps">Куратор сессии</span>' +
      '<span class="fs-meta">напомним за 7 · 3 · 1 день</span></div>' +
      '<p class="petit" style="margin-bottom:8px">Внесите свои сдачи и экзамены — мы напомним заранее и подстрахуем, если станет жарко.' +
      (canMore || ms.length ? '' : ' Без подписки доступна одна запись, с «Салон+» — весь график.') + '</p>' +
      (rows ? '<div class="due-box">' + rows + '</div>' : '') +
      (canMore
        ? '<div class="act-row" style="margin-top:8px">' +
          '<input type="text" id="msTitle" maxlength="120" placeholder="Что сдаёте — например, «Курсовая по ТГП»" style="flex:2;min-width:0;font:inherit;font-size:13.5px;padding:9px 12px;border:1px solid var(--hairline-strong);border-radius:var(--r);background:transparent;color:inherit">' +
          '<input type="date" id="msDate" style="font:inherit;font-size:13.5px;padding:8px 10px;border:1px solid var(--hairline-strong);border-radius:var(--r);background:transparent;color:inherit">' +
          '<button type="button" class="btn btn-line" id="msAdd">Добавить</button></div>'
        : '<p class="petit" style="margin-top:6px">Лимит записей достигнут — с подпиской «Салон+» график безлимитный.</p>') +
      '</div>';
  }

  function plusSection() {
    if (!st.plans) {
      loadPlans();
      return '<div class="sheet sheet-pad stacked reveal"><p class="petit">Листаем планы…</p></div>';
    }
    var cards = (st.plans.plans || []).map(planCardHtml).join('');
    var hasPeriods = (st.plans.plans || []).some(function (p) { return !p.once; });
    var seg = hasPeriods
      ? '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px">' +
        '<span class="seg" role="tablist" aria-label="Срок абонемента">' +
        '<button type="button" data-seg-period="month" class="' + (st.showPeriod === 'month' ? 'on' : '') + '">Месяц</button>' +
        '<button type="button" data-seg-period="sem" class="' + (st.showPeriod === 'sem' ? 'on' : '') + '">Семестр · выгоднее</button></span>' +
        '<span class="petit">семестр = 150 дней одной оплатой — дешевле помесячного в разы</span></div>'
      : '';
    /* конструктор и куратор — за раскрытием: витрина = три билета, не простыня */
    var ms = (st.me && st.me.milestones) || [];
    var ctorBlock = st.ctorOpen ? ctorHtml() :
      '<p class="petit" style="margin-top:14px"><button type="button" class="linkbtn" id="ctorShow">🛠 Собрать свой абонемент из опций…</button> — если готовые не подходят.</p>';
    var curBlock = st.curOpen ? curatorHtml() :
      '<p class="petit" style="margin-top:8px"><button type="button" class="linkbtn" id="curShow">📅 Куратор сессии' + (ms.length ? ' · записей: ' + ms.length : '') + '…</button> — график сдач с напоминаниями за 7·3·1 день.</p>';
    return '<div class="sheet sheet-pad stacked reveal" id="plusSheet">' +
      '<p class="caps">Абонемент «Салон+»</p>' +
      '<p class="petit" style="margin:6px 0 0">Один платёж, автосписаний нет. Скидка применяется сама, когда мастер называет цену, — и суммируется с бонусами (вместе до 25% заказа).</p>' +
      seg + '<div class="tickets">' + cards + '</div>' + ctorBlock + curBlock +
      '<p class="petit" style="margin-top:12px">Оформить можно и в Telegram: <a class="link" href="https://t.me/academic_saloon_bot?start=plus" target="_blank" rel="noopener">@academic_saloon_bot → /plus</a></p>' +
      '</div>';
  }

  function rerenderHome() {
    if (st.detail) renderCurrent();
    else if (!st.orders.length) render(tplEmpty());
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
        toast('Оформлено! Остался один перевод — реквизиты в карточке подписки ⭐');
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
    sub_active: 'Подписка уже активна ⭐',
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
        toast('Подписка «' + (r.sub.label || 'Салон+') + '» активна — скидка уже работает 🎉');
        if (S.stamp) S.stamp('Салон+ активна');
        if (document.hidden) systemNote('⭐', 'Подписка ' + (r.sub.label || '') + ' активирована');
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

  function tabBtn(o) {
    var on = o.id === st.currentId;
    var badge = (o.unread || 0) + (o.files_new || 0);
    return '<button type="button" role="tab" class="spine' + (on ? ' on' : '') +
      (needsAction(o) ? ' st-act' : '') + (isArch(o) ? ' sp-arch' : '') +
      '" data-ord="' + o.id + '" aria-selected="' + on + '">' +
      '<span class="sp-no">' + esc(o.no) + (o.pinned ? ' 📌' : '') +
      (badge ? '<span class="sp-dot" title="Новое в деле">' + badge + '</span>' : '') + '</span>' +
      '<span class="sp-name">' + esc(shortWork(o)) + '</span>' +
      '<span class="sp-st">' + esc(shortStatus(o)) + '</span>' +
      '</button>';
  }

  function tplSwitch() {
    var act = activeOrders(), arch = archOrders(), rem = removedOrders();
    if (act.length + arch.length < 2 && !rem.length) return '';
    var row = act.map(tabBtn).join('');
    if (arch.length || rem.length) {
      row += '<button type="button" class="spine sp-ghost' + (st.archOpen ? ' on' : '') + '" data-arch-toggle aria-expanded="' + !!st.archOpen + '">' +
        '<span class="sp-no">🗂 архив</span>' +
        '<span class="sp-name">Завершённые · ' + arch.length + '</span>' +
        '<span class="sp-st">' + (st.archOpen ? 'свернуть' : 'показать') + '</span></button>';
    }
    var archRow = '';
    if (st.archOpen && (arch.length || rem.length)) {
      archRow = '<div class="shelf reveal">' + arch.map(tabBtn).join('') +
        (rem.length ? (st.remOpen
          ? rem.map(tabBtn).join('') + '<button type="button" class="spine sp-ghost" data-rem-toggle><span class="sp-no">···</span><span class="sp-name">спрятать убранные</span><span class="sp-st">&nbsp;</span></button>'
          : '<button type="button" class="spine sp-ghost" data-rem-toggle><span class="sp-no">···</span><span class="sp-name">убранные · ' + rem.length + '</span><span class="sp-st">показать</span></button>') : '') +
        '</div>';
    }
    return '<div class="shelf reveal" role="tablist" aria-label="Ваши заказы">' + row + '</div>' +
      (archRow || '') + '<div class="shelf-base" aria-hidden="true"></div>';
  }
  function shortWork(o) {
    var w = o.work_label || '';
    return w.length > 24 ? w.slice(0, 23) + '…' : w;
  }
  function shortStatus(o) {
    if (o.paused && o.status !== 'done' && o.status !== 'cancel') return '⏸ на паузе';
    return { new: 'на оценке', priced: 'ждёт решения', prepay: 'ждёт оплату', work: 'в работе',
             check: 'на проверке', fix: 'правки', done: 'завершён', cancel: 'закрыт' }[o.status] || '';
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
      return '<div class="fs-sec"><p class="petit" style="margin:0">Заявка закрыта' +
        (o.cancel_reason ? ' (причина: ' + esc(o.cancel_reason) + ')' : '') +
        '. Передумали? Нажмите «Возобновить заказ» ниже — мастер вернётся к вашей заявке, ' +
        'условия можно обсудить заново.</p></div>';
    }
    var NOW = {
      new: 'Мастер изучает заявку — ответ обычно за 15–30 минут в рабочее время',
      priced: 'Предложение готово — решение за вами (кнопки ниже)',
      prepay: 'Ожидаем оплату — реквизиты и кнопки в блоке «Оплата» ниже',
      work: 'Работа идёт; вопросы можно задать в чате',
      fix: 'Вносим правки по вашим замечаниям',
      check: 'Готово! Посмотрите работу и примите её — или запросите правки',
      done: 'Заказ завершён. Мы на связи до вашей защиты'
    };
    /* не обещаем реквизиты, которых нет: без созревшего платежа и отметки —
       честное «счёт готовится» (бывает при ручной смене статуса без цены) */
    if (o.status === 'prepay' && !(o.due_now && o.due_now.amount) && !o.claimed)
      NOW.prepay = 'Мастер готовит счёт — оплата появится здесь, мы уведомим';
    return '<div class="fs-sec"><div class="fs-head"><span class="caps">Этапы</span>' +
      '<span class="fs-meta">этап ' + o.step + ' из ' + o.steps.length + '</span></div>' +
      '<div class="stg">' +
      o.steps.map(function (name, i) {
        var n = i + 1;
        var cls = n < o.step ? ' past' : n === o.step ? ' now' : '';
        var sn = n < o.step ? '✓' : '0' + n;
        var tag = n < o.step ? 'пройден' : n === o.step ? 'сейчас' : '';
        var now = n === o.step ? '<small>' + esc(NOW[o.status] || o.status_label) + '</small>' : '';
        return '<div class="stg-row' + cls + '"><span class="sn">' + sn + '</span>' +
          '<span class="sb"><b>' + esc(name) + '</b>' + now + '</span>' +
          (tag ? '<span class="st-tag">' + tag + '</span>' : '') + '</div>';
      }).join('') + '</div></div>' + partsRows(o);
  }

  /* -------- сдача по частям: где мы в 2 или 3 выдачах -------- */
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
            : (o.part_ready === n ? 'готова — ждёт оплату этапа' : 'в работе');
      } else { state = ''; tag = 'впереди'; }
      rows += '<div class="stg-row ' + state + '"><span class="sn">' + (state === 'past' ? '✓' : '§' + n) + '</span>' +
        '<span class="sb"><b>Часть ' + n + ' из ' + total + '</b>' +
        (n === o.stage && o.status === 'check' ? '<small>Посмотрите материал: принять или запросить правки — кнопки ниже</small>' : '') +
        '</span><span class="st-tag">' + tag + '</span></div>';
    }
    return '<div class="fs-sec"><div class="fs-head"><span class="caps">Сдача по частям</span>' +
      '<span class="fs-meta">правки — без лимита, в рамках задания</span></div>' +
      '<div class="stg">' + rows + '</div></div>';
  }

  function specLink(o) {
    if (!o.price) return '';
    return '<p class="petit" style="margin-top:8px">📄 <a class="link" href="' +
      S.api.base + apiPath(o.id, '/contract') + '" target="_blank" rel="noopener">' +
      'Спецификация заказа (PDF)</a> — условия одним листом: что входит в цену, ' +
      'этапы оплаты, правки. Действует вместе с <a class="link" href="oferta.html">офертой</a>, ' +
      'подписывать ничего не нужно.</p>' + pamyatkaLink(o);
  }

  /* персональная памятка «что дальше» — появляется с передачей финала */
  function pamyatkaLink(o) {
    if (!o.pamyatka) return '';
    return '<p class="petit" style="margin-top:2px">📘 <a class="link" href="' +
      S.api.base + apiPath(o.id, '/pamyatka') + '" target="_blank" rel="noopener">' +
      'Памятка «что дальше» (PDF)</a> — приёмка за 48 часов, антиплагиат без паники, ' +
      'письмо научруку, окна бесплатных правок с датами и план подготовки к защите.</p>';
  }

  function priceBlock(o) {
    if (o.price) {
      var out = '<div class="ord-price-row"><span class="caps">Цена мастера</span>' +
        '<span class="mono ord-price">' + money(o.price) + ' ₽</span></div>' + specLink(o);
      if (o.bonus_spent || o.sub_discount || o.promo_discount || o.gift_amount) {
        out += '<div class="due-box">' +
          '<div class="dr"><span>Цена работы</span><b>' + money(o.price) + ' ₽</b></div>' +
          (o.sub_discount ? '<div class="dr"><span>⭐ Скидка «Салон+»</span><b class="minus">−' + money(o.sub_discount) + '</b></div>' : '') +
          (o.promo_discount ? '<div class="dr"><span>🎟 Промокод' + (o.promo_code ? ' ' + esc(o.promo_code) : '') + '</span><b class="minus">−' + money(o.promo_discount) + '</b></div>' : '') +
          (o.bonus_spent ? '<div class="dr"><span>Оплачено бонусами</span><b class="minus">−' + money(o.bonus_spent) + '</b></div>' : '') +
          (o.gift_amount ? '<div class="dr"><span>🎁 Сертификат' + (o.gift_code ? ' ' + esc(o.gift_code) : '') + '</span><b class="minus">−' + money(o.gift_amount) + '</b></div>' : '') +
          '<div class="dr total"><span>К оплате деньгами</span><b>' + money(o.due_total) + ' ₽</b></div>' +
          (o.bonus_spent && (o.status === 'priced' || o.status === 'prepay')
            ? '<div class="dr"><span></span><b><button type="button" class="linkbtn" data-act="bonus_cancel">↩ вернуть бонусы на счёт</button></b></div>' : '') +
          (o.gift_amount && (o.status === 'priced' || o.status === 'prepay') && !(o.payments || []).some(function (p) { return p.status === 'paid'; })
            ? '<div class="dr"><span></span><b><button type="button" class="linkbtn" data-act="gift_remove">↩ открепить сертификат</button></b></div>' : '') +
          '</div>';
      }
      return out + planTable(o) + bonusSpendFold(o) + giftFold(o) + subUpsell(o);
    }
    if (o.quote_low) {
      return '<div class="ord-price-row"><span class="caps">Вилка сметы</span>' +
        '<span class="mono ord-price">' + money(o.quote_low) + ' – ' + money(o.quote_high) + ' ₽</span></div>' +
        '<p class="petit ord-price-note">Точную цену мастер назовёт после разбора заявки — уведомим прямо здесь' +
        (S.api.token() ? ' и в Telegram' : '') + '.</p>' + giftFold(o);
    }
    return giftFold(o);
  }

  /* -------- подарочный сертификат в деле: привязать код / показать привязку.
     Средство платежа, не скидка: зачёт считает сервер при цене -------- */
  function giftFold(o) {
    if (/^sub_/.test(o.work_type || '')) return '';
    if (!(o.status === 'new' || o.status === 'priced' || o.status === 'prepay')) return '';
    var paidAlready = (o.payments || []).some(function (p) { return p.status === 'paid'; });
    if (o.gift_code && !o.gift_amount) {
      /* код привязан, цены ещё нет — покажем строку ожидания */
      return fold('secGift', '🎁 Сертификат', esc(o.gift_code),
        '<p class="petit" style="margin:0">Код <b class="mono">' + esc(o.gift_code) + '</b> привязан — ' +
        'сумма зачтётся, когда мастер назовёт цену.' +
        (paidAlready ? '' : ' <button type="button" class="linkbtn" data-act="gift_remove">Открепить</button>') +
        '</p>', false);
    }
    if (o.gift_code || paidAlready) return '';
    var inner = '<div class="due-box" id="gattBox" style="margin-top:0">' +
      '<p class="petit" style="margin:0 0 8px">Есть подарочный сертификат? Привяжите код — сумма спишется с итога' +
      (o.price ? ' сразу' : ', когда мастер назовёт цену') + '. Остаток сохранится на коде.</p>' +
      '<div class="cbn-row"><input type="text" id="gattCode" maxlength="24" autocomplete="off" placeholder="AS-XXXX-XXXX-XXXX" ' +
      'style="flex:1;min-width:0;background:transparent;border:1px solid var(--hairline-strong);border-radius:6px;padding:9px 10px;color:var(--ink);font:inherit;font-size:16px">' +
      '<button type="button" class="btn btn-line" id="gattApply">Применить</button></div></div>';
    return fold('secGift', '🎁 Сертификат', 'применить код к делу', inner, false);
  }

  /* -------- план оплат: этапы 50/50 или 30/40/30, статус каждого -------- */
  var PLAN_ST = {
    paid: ['оплачен ✓', 's-done'], claimed: ['на сверке у мастера', 's-act'],
    due: ['к оплате сейчас', 's-due'], later: ['после готовности следующей части', '']
  };
  function planTable(o) {
    var plan = o.plan || [];
    if (plan.length < 2) {
      if (o.prepay && (o.status === 'priced' || o.status === 'prepay') && !o.bonus_spent)
        return '<p class="petit ord-price-note">Предоплата — ' + money(o.prepay_due || o.prepay) + ' ₽, остальное после проверки работы.</p>';
      return '';
    }
    return '<div class="due-box plan-box">' +
      '<div class="dr caps" style="font-size:11px"><span>План оплаты — по этапам</span><b></b></div>' +
      plan.map(function (p) {
        var m = PLAN_ST[p.state] || ['', ''];
        return '<div class="dr"><span>' + p.n + '. ' + esc(p.label) +
          ' <span class="petit pl-st ' + m[1] + '">' + m[0] + '</span></span>' +
          '<b>' + money(p.amount) + ' ₽</b></div>';
      }).join('') + '</div>';
  }

  /* -------- списание бонусов: один раз на заказ, до первой оплаты.
     Свёрнуто в строку — раскрывается только тем, кому это нужно -------- */
  function bonusSpendFold(o) {
    var inner = bonusSpendBlock(o);
    if (!inner) return '';
    var limit = Math.min((o.bonus && o.bonus.balance) || 0, o.bonus_cap || 0);
    return fold('secBonus', '💎 Списать бонусы', 'до −' + money(limit) + ' ₽ с этого заказа', inner, false);
  }

  function bonusSpendBlock(o) {
    if (!o.bonus || !(o.status === 'priced' || o.status === 'prepay')) return '';
    var paidAlready = (o.payments || []).some(function (p) { return p.status === 'paid'; });
    if (paidAlready) return '';
    if ((o.bonus_spent || 0) > 0) return ''; /* уже применены — есть «вернуть бонусы» */
    var limit = Math.min(o.bonus.balance || 0, o.bonus_cap || 0);
    if (limit <= 0) return '';
    return '<div class="due-box" id="bspendBox">' +
      '<div class="cbn-row"><span>💎 Списать бонусы <span class="petit">(на счету ' + money(o.bonus.balance) + ', к этому заказу — до ' + money(limit) + ')</span></span>' +
      '<b class="num" id="bspendVal">' + money(limit) + '</b></div>' +
      '<input type="range" class="cbn-slider" id="bspendRange" min="0" max="' + limit + '" step="50" value="' + limit + '">' +
      '<div class="cbn-row"><span class="petit">Списание — один раз, до оплаты; деньгами останется <b id="bspendDue">' + money((o.due_total || o.price) - limit) + ' ₽</b></span>' +
      '<button type="button" class="btn btn-line" id="bspendApply">Применить</button></div>' +
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
    return '<p class="up-line reveal">⭐ С абонементом «Салон+» этот заказ — до <b>−' + money(save) +
      ' ₽</b>, от 449 ₽/мес. <button type="button" class="linkbtn wax" data-open-plus>Подключить →</button></p>';
  }

  function payHistory(o) {
    var paid = (o.payments || []).filter(function (p) { return p.status === 'paid'; });
    if (!paid.length) return '';
    var lbl = {};
    (o.plan || []).forEach(function (p) { lbl[p.kind] = p.label; });
    return '<p class="petit" style="margin-top:8px">Оплачено: ' + paid.map(function (p) {
      var what = lbl[p.kind] || (p.kind === 'prepay' ? 'предоплата' : 'остаток');
      return money(p.amount) + ' ₽ (' + esc(what.toLowerCase()) + ', ' + dt(p.at) + ')';
    }).join(' · ') + '</p>';
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
          '" title="Скопировать">⧉ копировать</button>' : '') +
        '</div>';
    }).join('');
  }
  function paySlip(o, due, label) {
    return '<div class="payslip">' +
      '<div class="ps-head"><span class="caps">' +
      (label ? esc(label) + ' · реквизиты' : 'Реквизиты для перевода') + '</span>' +
      (due ? '<span class="ps-due">' + money(due) + ' ₽</span>' : '') + '</div>' +
      '<div class="ps-body">' + reqRows(o.requisites) + '</div>' +
      '<div class="ps-steps">' +
        '<span><b>1</b> переведите сумму</span><span class="ps-ar">→</span>' +
        '<span><b>2</b> нажмите «Я оплатил(а)»</span><span class="ps-ar">→</span>' +
        '<span><b>3</b> приложите чек — сверка быстрее</span></div>' +
      '</div>';
  }

  function payBlock(o) {
    /* блок оплаты: только когда реально есть что платить (или отметка на сверке) —
       во время работы над частью клиента не дёргаем кнопками оплаты */
    var due = o.due_now && o.due_now.amount ? o.due_now.amount : 0;
    var wantPay = due > 0;
    if (!wantPay && !o.claimed) return payHistory(o) ? '<div class="fs-sec" id="secPay"><div class="fs-head"><span class="caps">Оплата</span></div>' + payHistory(o) + '</div>' : '';
    var head = '<div class="fs-sec" id="secPay"><div class="fs-head"><span class="caps">Оплата</span>' +
      (o.due_now ? '<span class="fs-meta">' + esc(o.due_now.label) + ' · ' + money(due) + ' ₽</span>' : '') + '</div>';
    if (o.claimed) {
      return head +
        '<div class="req-slip"><span class="caps">Отметка «оплатил» у мастера</span>' +
        '<p class="petit" style="margin:8px 0 0">Мастер сверяет поступление — как подтвердит, заказ двинется дальше и придёт уведомление. ' +
        'Чек ускорит сверку.</p></div>' +
        '<div class="act-row">' +
        '<label class="btn btn-line btn-upload">📎 Приложить чек<input type="file" id="cabReceipt" hidden accept="image/*,.pdf"></label>' +
        '<button type="button" class="btn btn-line" data-act="paid_undo">↩️ Я ещё не оплатил — снять отметку</button>' +
        '<button type="button" class="btn btn-line" data-chat-focus>Вопрос по оплате</button></div>' +
        payHistory(o) + '</div>';
    }
    var req = o.requisites
      ? paySlip(o, due, o.due_now && o.due_now.label)
      : (o.pay_online ? '' : '<p class="petit">Реквизиты пришлём в чат ниже (и в Telegram) в течение пары минут.</p>');
    var payBtns = '<div class="act-row">' +
      (o.pay_online ? '<button type="button" class="btn btn-wax" data-act-pay>💳 Оплатить картой онлайн</button>' : '') +
      '<button type="button" class="btn ' + (o.pay_online ? 'btn-line' : 'btn-wax') + '" data-act="paid">Я оплатил(а) переводом</button>' +
      '<button type="button" class="btn btn-line" data-chat-focus>Вопрос по оплате</button></div>';
    return head + req + payBtns + payHistory(o) + '</div>';
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
        partsNote = '<p class="petit" style="margin:0 0 10px">Полная стоимость — <b>' +
          money(o.due_total || o.price) + ' ₽</b>, но платить её сразу не нужно: сейчас — только ' +
          '<b>первая часть ' + money(plan0[0].amount) + ' ₽</b>. Каждый следующий платёж — после ' +
          'того, как увидите готовую часть работы (план — выше, рядом с ценой).</p>';
      } else {
        b.push('<button type="button" class="btn btn-wax" data-act="accept_price">Принять цену — к оплате ' + money(o.due_total || o.price) + ' ₽</button>');
      }
      b.push('<button type="button" class="btn btn-line" data-act="decline">Отказаться</button>');
    }
    if (o.actions.indexOf('accept_work') >= 0) {
      var lastPart = total <= 1 || (o.stage || 1) >= total;
      var acceptLabel = lastPart ? 'Принять работу' : 'Принять часть ' + (o.stage || 1);
      b.push('<button type="button" class="btn btn-wax" data-act="accept_work">' + acceptLabel + '</button>');
      b.push('<button type="button" class="btn btn-line" data-act-fix>Нужны правки' + (total > 1 ? ' по части ' + (o.stage || 1) : '') + '</button>');
    }
    if (o.actions.indexOf('resume') >= 0) {
      b.push('<button type="button" class="btn btn-wax" data-act="resume">🔄 Возобновить заказ</button>');
    }
    var pay = ((o.due_now && o.due_now.amount > 0) || o.claimed ||
               (o.payments || []).some(function (p) { return p.status === 'paid'; }))
      ? payBlock(o) : '';
    if (!b.length) return pay || (payHistory(o) ? '<div class="fs-sec" id="secPay"><div class="fs-head"><span class="caps">Оплата</span></div>' + payHistory(o) + '</div>' : '');
    return '<div class="fs-sec" id="secDecide"><div class="fs-head"><span class="caps">Решение по заказу</span>' +
      (total > 1 && 'check fix'.indexOf(o.status) >= 0 ? '<span class="fs-meta">правки — без лимита, в рамках задания</span>' : '') +
      '</div>' + partsNote + '<div class="act-row" style="margin-top:0">' + b.join('') + '</div>' +
      '<div class="fix-form" id="fixForm" hidden>' +
        '<textarea id="fixText" rows="3" maxlength="2000" placeholder="Что поправить? Например: «во 2-й главе обновить данные за 2025 год»"></textarea>' +
        '<div class="act-row"><button type="button" class="btn btn-wax" data-act-fix-send>Отправить на правки</button>' +
        '<button type="button" class="btn btn-line" data-act-fix-cancel>Передумал(а)</button></div>' +
      '</div></div>' + pay;
  }

  /* -------- часть/финал готовы и придержаны до оплаты: заметные ленты -------- */
  function finalBand(o) {
    if (!o.final_ready || 'work fix'.indexOf(o.status) < 0) return '';
    var due = o.due_now && o.due_now.amount ? o.due_now.amount : 0;
    if (due > 0) {
      return '<div class="pause-band fin-band"><span class="pb-ic">🏁</span><span class="pb-txt">' +
        '<b>Работа готова целиком!</b> Финальная часть передаётся после закрытия остатка — ' +
        '<b>' + money(due) + ' ₽</b>. Как только мастер подтвердит поступление, файлы придут сразу. ' +
        '<button type="button" class="linkbtn" data-jump="secPay">Перейти к оплате ↓</button></span></div>';
    }
    return '<div class="pause-band fin-band"><span class="pb-ic">🏁</span><span class="pb-txt">' +
      (o.claimed ? 'Ваша отметка об оплате на сверке у мастера — после подтверждения он передаст финальную часть.'
                 : 'Оплата закрыта — мастер передаёт финальную часть.') + '</span></div>';
  }

  function partBand(o) {
    /* промежуточная часть готова: «сначала оплата этапа — потом файл» */
    if (!o.part_ready || o.final_ready || 'work fix'.indexOf(o.status) < 0) return '';
    var due = o.due_now && o.due_now.amount ? o.due_now.amount : 0;
    if (due > 0) {
      return '<div class="pause-band fin-band"><span class="pb-ic">📘</span><span class="pb-txt">' +
        '<b>Часть ' + o.part_ready + ' готова!</b> Она передаётся после оплаты этапа — ' +
        '<b>' + money(due) + ' ₽</b>' + (o.due_now && o.due_now.label ? ' (' + esc(o.due_now.label.toLowerCase()) + ')' : '') +
        '. После подтверждения файл придёт сразу. ' +
        '<button type="button" class="linkbtn" data-jump="secPay">Перейти к оплате ↓</button></span></div>';
    }
    return '<div class="pause-band fin-band"><span class="pb-ic">📘</span><span class="pb-txt">' +
      (o.claimed ? 'Часть ' + o.part_ready + ' готова; ваша отметка об оплате на сверке — после подтверждения мастер передаст файл.'
                 : 'Часть ' + o.part_ready + ' готова, этап оплачен — мастер передаёт файл.') + '</span></div>';
  }

  /* -------- часть уже у клиента, а этап не оплачен: честная лента -------- */
  function dueBand(o) {
    if ('check fix'.indexOf(o.status) < 0 || o.final_ready || o.part_ready) return '';
    var due = o.due_now && o.due_now.amount ? o.due_now.amount : 0;
    if (due <= 0) return '';
    return '<div class="pause-band fin-band"><span class="pb-ic">💳</span><span class="pb-txt">' +
      'По плану оплат за эту часть — <b>' + money(due) + ' ₽</b>' +
      (o.due_now && o.due_now.label ? ' (' + esc(o.due_now.label.toLowerCase()) + ')' : '') +
      '. Мастерская передала её, доверившись вам — закройте этап, и работа продолжится без пауз. ' +
      '<button type="button" class="linkbtn" data-jump="secPay">Перейти к оплате ↓</button></span></div>';
  }

  /* -------- пауза: заметная лента под шапкой дела -------- */
  function pauseBand(o) {
    if (!o.paused) return '';
    var by = o.paused_by === 'admin'
      ? 'Мастер приостановил дело — вопросы можно задать в переписке ниже.'
      : 'Вы поставили дело на паузу: работа и напоминания подождут вашего сигнала.';
    return '<div class="pause-band"><span class="pb-ic">⏸</span><span class="pb-txt">' + by +
      (o.actions.indexOf('unpause') >= 0
        ? ' <button type="button" class="linkbtn" data-act="unpause">Снять с паузы</button>' : '') +
      '</span></div>';
  }

  /* -------- управление делом: пауза, отзыв заявки, закрытие в работе -------- */
  function manageBlock(o) {
    var items = [];
    if (o.actions.indexOf('unpause') >= 0)
      items.push('<button type="button" class="btn btn-line" data-act="unpause">▶️ Снять с паузы</button>');
    else if (o.actions.indexOf('pause') >= 0)
      items.push('<button type="button" class="btn btn-line" data-act-pause>⏸ Поставить на паузу</button>');
    if (o.status === 'new' && o.actions.indexOf('decline') >= 0)
      items.push('<button type="button" class="btn btn-line" data-act="decline">Отозвать заявку</button>');
    if (o.actions.indexOf('cancel_request') >= 0)
      items.push('<button type="button" class="btn btn-line" data-act-cancelreq>Закрыть дело…</button>');
    if (!items.length) return '';
    return fold('secManage', '⚙️ Управление делом', 'пауза — не отмена: всё сохраняется',
      '<div class="act-row" style="margin-top:0">' + items.join('') + '</div>', false);
  }

  /* -------- после завершения: услуги «к защите» -------- */
  function defenseBlock(o) {
    if (o.status !== 'done' || /^svc_/.test(o.work_type || '')) return '';
    return '<div class="fs-sec"><div class="fs-head"><span class="caps">Впереди защита?</span>' +
      '<span class="fs-meta">по вашей готовой работе</span></div>' +
      '<p class="petit" style="margin-bottom:12px">Работа уже у нас — заново ничего описывать не придётся. Бонусы с этого заказа на счету, их можно применить.</p>' +
      '<div class="act-row" style="margin-top:0">' +
      '<a class="btn btn-wax" href="configurator.html?service=dp&order=' + o.id + '">🎁 «К защите под ключ» · от 9 500 ₽</a>' +
      '<a class="btn btn-line" href="configurator.html?service=df&order=' + o.id + '">🎤 Презентация и речь · от 6 000 ₽</a>' +
      '<a class="btn btn-line" href="configurator.html?service=nm&order=' + o.id + '">📏 Нормоконтроль · от 5 000 ₽</a>' +
      '</div>' +
      '<p class="petit" style="margin-top:10px">Пакет выгоднее на 1 500 ₽, чем услуги по отдельности (11 000 ₽).</p></div>';
  }

  /* -------- отзыв: просто для тех, кто не любит писать -------- */
  function reviewBlock(o) {
    if (o.status !== 'done') return '';
    var r = o.review;
    if (r) {
      var stMap = { pending: 'на модерации у мастера', approved: 'опубликован на сайте — спасибо!', rejected: 'сохранён, на сайт не попал' };
      return '<div class="fs-sec"><div class="fs-head"><span class="caps">Ваш отзыв</span>' +
        '<span class="fs-meta">' + (stMap[r.status] || '') + '</span></div>' +
        '<p class="rv-stars-static">' + '★'.repeat(r.rating) + '<span class="dim">' + '★'.repeat(5 - r.rating) + '</span></p>' +
        (r.text ? '<p class="petit" style="font-style:italic">«' + esc(r.text) + '»</p>' : '') +
        '<div class="act-row"><button type="button" class="btn btn-line" data-review-edit>Изменить отзыв</button></div>' +
        '<div id="reviewForm" hidden>' + reviewFormInner(r) + '</div></div>';
    }
    return '<div class="fs-sec"><div class="fs-head"><span class="caps">Как вам работа?</span>' +
      '<span class="fs-meta">займёт полминуты</span></div>' +
      '<p class="petit" style="margin-bottom:10px">Оценка и пара слов помогают другим студентам решиться — а нам делают день. Публикуется после модерации, можно анонимно.</p>' +
      '<div id="reviewForm">' + reviewFormInner(null) + '</div></div>';
  }
  function reviewFormInner(r) {
    var cur = r ? r.rating : 5;
    var stars = '';
    for (var n = 1; n <= 5; n++)
      stars += '<button type="button" class="rv-star' + (n <= cur ? ' on' : '') + '" data-star="' + n + '" aria-label="' + n + ' из 5">★</button>';
    return '<div class="rv-stars" id="rvStars" data-val="' + cur + '">' + stars + '</div>' +
      '<textarea id="rvText" rows="3" maxlength="2000" placeholder="Пара слов — по желанию: как прошла защита, что понравилось">' + (r && r.text ? esc(r.text) : '') + '</textarea>' +
      '<div class="act-row" style="margin-top:10px">' +
      '<input type="text" id="rvAuthor" maxlength="60" placeholder="Подпись (например, «Мария, ВКР») — можно пусто" style="flex:2;min-width:0;font:inherit;font-size:13.5px;padding:9px 12px;border:1px solid var(--hairline-strong);border-radius:var(--r);background:transparent;color:inherit">' +
      '<button type="button" class="btn btn-wax" data-review-send>' + (r ? 'Обновить отзыв' : 'Отправить отзыв') + '</button></div>' +
      '<div class="act-row" style="margin-top:8px">' +
      '<label class="btn btn-line btn-upload">📎 Приложить скрин (оценка, переписка)<input type="file" id="cabReviewShot" hidden accept="image/*,.pdf"></label></div>' +
      '<p class="petit up-note" id="rvNote" hidden></p>';
  }

  var CLIP_SVG = '<svg class="fl-ic" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.2 12.7 13 19.9a5 5 0 0 1-7.1-7.1l7.9-7.8a3.35 3.35 0 0 1 4.7 4.7l-7.8 7.9a1.68 1.68 0 0 1-2.4-2.4l7.2-7.2"/></svg>';
  function filesBlock(o) {
    var rows = (o.files || []).map(function (f) {
      var who = f.from === 'master' ? 'от мастерской' : 'ваш файл';
      var tags = '';
      if (f.new) tags += ' <span class="fl-tag fl-new">новый</span>';
      if (f.part && (o.stages_total || 1) > 1) tags += ' <span class="fl-tag">часть ' + f.part + '</span>';
      if (f.label) tags += ' <span class="fl-tag">' + esc(f.label) + '</span>';
      return '<div class="file-line">' + CLIP_SVG +
        '<span class="fl-name">' + esc(f.name) + tags + '</span>' +
        '<span class="fl-meta">' + who + ' · ' + dt(f.at) + '</span>' +
        '<a class="link" href="' + S.api.base + apiPath(o.id, '/file/' + f.id) + '" download>скачать</a></div>';
    }).join('');
    var n = (o.files || []).length;
    var meta = n ? (n + (o.files_new ? ' · есть новые' : '')) : 'приложить методичку или задание';
    var open = n > 0 || o.status === 'new';
    return fold('secFiles', '📎 Файлы', meta,
      (rows || '<p class="petit">Пока пусто. Приложите методичку или задание — мастеру будет проще оценить работу точно.</p>') +
      '<div class="act-row"><label class="btn btn-line btn-upload">Приложить файл<input type="file" id="cabUpload" hidden></label></div>' +
      '<p class="petit up-note" id="upNote" hidden></p>', open);
  }

  function mediaHtml(o, m) {
    /* голосовые и фото из переписки проигрываются прямо в деле */
    var src = S.api.base + apiPath(o.id, '/msgmedia/' + m.id);
    if (m.kind === 'voice' || m.kind === 'audio')
      return '<audio controls preload="none" src="' + src + '" style="max-width:100%;height:36px"></audio>';
    if (m.kind === 'photo')
      return '<a href="' + src + '" target="_blank" rel="noopener"><img src="' + src + '" alt="фото из переписки" loading="lazy" style="max-width:min(260px,100%);border-radius:6px;display:block"></a>';
    if (m.kind === 'video' || m.kind === 'video_note')
      return '<video controls preload="none" src="' + src + '" style="max-width:min(280px,100%);border-radius:6px"></video>';
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
      if (i.sys) return '<div class="chat-sys petit">' + esc(i.text) + ' · ' + dt(i.at) + '</div>';
      var body = i.text ? esc(i.text) : '';
      var media = (i.media && i.kind !== 'document') ? mediaHtml(o, i) : '';
      if (media) body = (body ? body + '<br>' : '') + media;
      else if (!body && i.kind && i.kind !== 'text') body = '\u2758 вложение: ' + (i.file ? esc(i.file) : 'см. раздел «Файлы» или Telegram');
      else if (i.file) body += '<br>\u2758 ' + esc(i.file);
      return '<div class="chat-m' + (i.me ? ' me' : '') + '">' +
        '<span class="chat-who caps">' + (i.me ? 'Вы' : 'Мастерская') + '</span>' +
        '<span class="chat-txt">' + body + '</span>' +
        '<span class="chat-at petit">' + dt(i.at) + '</span></div>';
    }).join('');
    var hasMsgs = (o.messages || []).length > 0;
    var meta = o.unread ? ('новых: ' + o.unread) : (S.api.token() ? 'синхронно с Telegram' : 'мастер видит сразу');
    return fold('secChat', '💬 Переписка по заказу', meta,
      '<div class="chat-feed" id="chatFeed">' + (feed || '<p class="petit" style="text-align:center">Пока тихо. Напишите первым — мастер ответит прямо здесь.</p>') + '</div>' +
      '<div class="chat-form"><textarea id="chatText" rows="2" maxlength="3000" placeholder="Сообщение мастеру…"></textarea>' +
      '<button type="button" class="btn btn-wax" id="chatSend">Отправить</button></div>',
      hasMsgs || !!o.unread);
  }

  /* -------- доступ к делу: секретная ссылка для других устройств -------- */
  function accessBlock(o) {
    var t = tokenFor(o.id);
    if (!t) return ''; /* заказы аккаунта открываются входом через Telegram */
    return fold('secAccess', '🔑 Доступ к делу', 'ссылка для других устройств',
      '<p class="petit" style="margin-bottom:10px">Дело открывается на любом устройстве по секретной ссылке — сохраните её себе (заметки, «Избранное»). ' +
      'Не пересылайте посторонним: у кого ссылка, тот видит дело. По желанию привяжите Telegram — статусы придут и в бота.</p>' +
      '<div class="act-row" style="margin-top:0">' +
      '<button type="button" class="btn btn-line" data-access-copy>Скопировать ссылку доступа</button>' +
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
      chips.push(['secPay', '💳 Оплата' + (due > 0 ? ' · ' + money(due) + ' ₽' : ''), true]);
    if (o.actions.indexOf('accept_work') >= 0) chips.push(['secDecide', '✅ Решение', true]);
    chips.push(['secFiles', '📎 Файлы' + ((o.files || []).length ? ' · ' + o.files.length : ''), false]);
    chips.push(['secChat', '💬 Переписка' + (o.unread ? ' · ' + o.unread : ''), !!o.unread]);
    if (o.status !== 'done' && o.status !== 'cancel') chips.push(['secManage', '⚙️ Управление', false]);
    return '<div class="ord-jump" role="navigation" aria-label="Разделы дела">' +
      chips.map(function (c) {
        return '<button type="button" class="oj' + (c[2] ? ' hot' : '') + '" data-jump="' + c[0] + '">' + c[1] + '</button>';
      }).join('') + '</div>';
  }

  function tplDetail() {
    var o = st.detail;
    var meta = [];
    if (o.deadline_text) meta.push('срок: ' + esc(o.deadline_text));
    meta.push('заявка от ' + dt(o.created_at));
    var pinTitle = o.pinned ? 'Открепить дело' : 'Закрепить дело первым в списке';
    /* порядок по значимости: решение и оплата — сразу после шапки; ход дела,
       файлы и переписка — следом; сервисное (управление, доступ) — свёрнуто
       в конце; клуб (бонусы и подписка) — всегда ПОСЛЕ дела */
    return userRow() + nowCard() + subPendingBand() + tplSwitch() +
      '<article class="sheet sheet-pad stacked reveal form-sheet" aria-label="Дело заказа ' + esc(o.no) + '">' +
      '<div class="ord-top"><span class="mono ord-no">Дело ' + esc(o.no) + '</span>' +
      '<span class="ord-flags">' +
      '<button type="button" class="ord-pin' + (o.pinned ? ' on' : '') + '" data-act-pin title="' + pinTitle + '" aria-label="' + pinTitle + '" aria-pressed="' + !!o.pinned + '">📌</button>' +
      (o.paused ? '<span class="ord-stamp s-pause">⏸ пауза</span>' : '') +
      '<span class="ord-stamp ' + (STAMP_TONE[o.status] || '') + '">' + esc(o.status_label) + '</span></span></div>' +
      '<h2 class="ord-type">' + esc(o.work_label || '') + '</h2>' +
      (o.topic ? '<p class="ord-topic">Тема: «' + esc(o.topic) + '»</p>' : '') +
      '<p class="petit">' + meta.join(' · ') + ' ' + deadlineChip(o) + '</p>' +
      jumpChips(o) +
      pauseBand(o) + finalBand(o) + partBand(o) + dueBand(o) +
      priceBlock(o) + giftRestStrip(o) + actionsBlock(o) +
      stageFold(o) + reviewBlock(o) + defenseBlock(o) +
      filesBlock(o) + chatBlock(o) + manageBlock(o) + accessBlock(o) +
      (isArch(o) ? '<p class="petit" style="margin-top:clamp(20px,3vw,28px);padding-top:14px;border-top:1px solid var(--hairline)">' +
        'Дело ' + (o.status === 'done' ? 'завершено' : 'закрыто') + '. ' +
        (o.archived
          ? 'Оно убрано в архив и не показывается в списке. <button type="button" class="linkbtn" data-act="unarchive">Вернуть в список</button>'
          : '<button type="button" class="linkbtn" data-act="archive">Убрать в архив</button> — дело исчезнет из списка; вернуть можно в любой момент («Архив → убранные»).') +
        '</p>' : '') +
      '</article>' +
      clubBlock() +
      '<p class="petit cab-foot-sync">Всё по заказу живёт в этом кабинете. Привязан Telegram? Дублируем статусы и в бота: ' +
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
        function (u) { toast('Вы вошли' + (u && u.name ? ', ' + u.name : '') + ' ✓'); loadList(); },
        function () { lastPending = null; render(tplLogin(null)); });
      lastPending = pending;
      render(tplLogin(pending));
      ensureFeatures();
      return;
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
    S.api.get('/orders' + (t ? '' : '?tokens=' + encodeURIComponent(g.join(',')))).then(function (r) {
      if (!r.ok) { render(tplError()); return; }
      st.orders = r.orders || [];
      watchSync();
      if (!st.orders.length) { render(tplEmpty()); return; }
      var visible = visibleOrders();
      if (!visible.length) { st.archOpen = true; st.remOpen = true; }
      var pool = visible.length ? visible : st.orders;
      var current = pool.some(function (o) { return o.id === st.currentId; });
      if (!keepCurrent || !current) st.currentId = pickDefaultId();
      if (!st.currentId) { render(tplEmpty()); return; }
      /* выбранный заказ лежит в архиве — раскроем корешки, чтобы он был виден */
      var cur = st.orders.filter(function (o) { return o.id === st.currentId; })[0];
      if (cur && isArch(cur)) st.archOpen = true;
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
    if (st.detail) {
      var draft = (document.getElementById('chatText') || {}).value || '';
      render(tplDetail());
      var ta = document.getElementById('chatText');
      if (ta && draft) ta.value = draft;
    }
  }

  function scheduleFilesSeen(order) {
    /* метки «новый файл» гасим только после того, как клиент реально
       посмотрел на дело: 7 секунд видимой страницы с открытой карточкой.
       В «тихом» режиме мастера — не трогаем (сервер тоже гардит) */
    if (impMode()) return;
    if (seenTimer) { clearTimeout(seenTimer); seenTimer = null; }
    var hasNew = (order.files || []).some(function (f) { return f.new; });
    if (!hasNew) return;
    var id = order.id;
    seenTimer = setTimeout(function () {
      if (document.hidden || st.currentId !== id) return;
      var t = tokenFor(id);
      var body = { action: 'files_seen' };
      if (t) body.token = t;
      S.api.post('/orders/' + id + '/action' + (t ? '?token=' + encodeURIComponent(t) : ''), body);
    }, 7000);
  }

  function loadDetail(silent) {
    var id = st.currentId;
    S.api.get(apiPath(id)).then(function (r) {
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
        render(tplDetail());
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
    S.api.get('/orders' + (t ? '' : '?tokens=' + encodeURIComponent(g.join(',')))).then(function (r) {
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
    var t = tokenFor(id);
    var body = { action: 'wait_checks' };
    if (t) body.token = t;
    S.api.post('/orders/' + id + '/action' + (t ? '?token=' + encodeURIComponent(t) : ''), body)
      .then(function (r) { if (r.ok && r.order) { st.detail = r.order; } });
  }

  function doAction(action, extra) {
    if (st.busy) return;
    st.busy = true;
    var body = { action: action };
    if (extra && extra.comment) body.comment = extra.comment;
    if (extra && extra.reason) body.reason = extra.reason;
    if (extra && extra.amount != null) body.amount = extra.amount;
    if (extra && extra.rating != null) body.rating = extra.rating;
    if (extra && extra.text != null) body.text = extra.text;
    if (extra && extra.author != null) body.author = extra.author;
    var t = tokenFor(st.currentId);
    if (t) body.token = t;
    S.api.post('/orders/' + st.currentId + '/action' + (t ? '?token=' + encodeURIComponent(t) : ''), body)
      .then(function (r) {
        st.busy = false;
        if (!r.ok) {
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
                  only_finished: 'В архив убираются только завершённые и закрытые дела' }[r.error] ||
                (r.error === 'not_found' && action === 'gift_apply'
                  ? 'Такого кода нет — проверьте написание' : '') ||
                'Не получилось — попробуйте ещё раз');
          return;
        }
        st.detail = r.order;
        render(tplDetail());
        if (action === 'accept_work' && S.stamp) {
          var ai = r.accept || {};
          S.stamp(ai.final ? 'Принято' : 'Часть ' + (ai.part || '') + ' принята');
        }
        if (action === 'resume' && S.stamp) S.stamp('Снова в работе');
        if (action === 'pause' && S.stamp) S.stamp('На паузе');
        if (action === 'unpause' && S.stamp) S.stamp('Продолжаем');
        if (action === 'bonus_apply' && S.stamp) S.stamp('−' + money(r.spent || 0) + ' бонусами', { tone: 'wax' });
        if (action === 'bonus_cancel' && S.stamp) S.stamp('+' + money(r.restored || 0) + ' на счёт', { tone: 'wax' });
        if (action === 'gift_apply' && S.stamp) S.stamp(r.gift_amount ? '−' + money(r.gift_amount) + ' сертификатом' : 'Сертификат привязан', { tone: 'wax' });
        var msgA = { accept_price: 'Принято! Дальше — предоплата', paid: 'Передали мастеру на сверку',
                request_fixes: 'Отправили на правки — исправим и вернём',
                decline: 'Заявка закрыта — её можно возобновить в любой момент',
                resume: 'Заявка снова в работе — мастер уже видит',
                bonus_apply: 'Бонусы применены', bonus_cancel: 'Бонусы вернулись на счёт',
                gift_apply: 'Сертификат привязан к делу',
                gift_remove: 'Сертификат откреплён — сумма вернулась на код',
                paid_undo: 'Отметка снята — без паники',
                archive: 'Дело убрано в архив — вернуть можно в любой момент',
                unarchive: 'Дело вернулось в список',
                pause: 'Дело на паузе — продолжим по вашему сигналу',
                unpause: 'Пауза снята — работа продолжается',
                pin: 'Закрепили — дело теперь первое в списке',
                unpin: 'Закрепление снято',
                cancel_request: 'Запрос отправлен — мастер свяжется с вами',
                review: 'Спасибо! Отзыв ушёл на модерацию' }[action];
        if (action === 'accept_work') {
          var a2 = r.accept || {};
          msgA = a2.final
            ? (a2.need_pay ? 'Принято! Остался финальный платёж ' + money(a2.due || 0) + ' ₽'
                           : 'Заказ завершён — спасибо!')
            : 'Часть принята — мастер работает дальше';
        }
        toast(msgA || 'Готово');
        loadList(true);
        if (st.me) S.api.get('/me').then(function (rr) { if (rr.ok) { st.me = rr; renderCurrent(); } });
      });
  }

  function payOnline() {
    if (st.busy) return;
    st.busy = true;
    var t = tokenFor(st.currentId);
    S.api.post('/orders/' + st.currentId + '/pay' + (t ? '?token=' + encodeURIComponent(t) : ''),
               t ? { token: t } : {})
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

  function sendMessage() {
    var ta = document.getElementById('chatText');
    if (!ta) return;
    var text = ta.value.trim();
    if (!text || st.busy) return;
    st.busy = true;
    var t = tokenFor(st.currentId);
    S.api.post('/orders/' + st.currentId + '/message' + (t ? '?token=' + encodeURIComponent(t) : ''), { text: text })
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
    var t = tokenFor(st.currentId);
    var url = S.api.base + '/orders/' + st.currentId + '/upload?' + qs(st.currentId) +
      (kind ? '&kind=' + kind : '');
    var h = {};
    var sess = S.api.token();
    if (sess && !t) h['Authorization'] = 'Bearer ' + sess;
    fetch(url, { method: 'POST', body: fd, headers: h })
      .then(function (resp) {
        if (resp.status === 413) throw new Error('too_big');
        if (!resp.ok) throw new Error('http_' + resp.status);
        return resp.json();
      })
      .then(function (r) {
        if (!r.ok) { if (note) note.textContent = 'Не получилось загрузить (' + (r.error || 'ошибка') + ') — попробуйте ещё раз.'; return; }
        if (note) note.textContent = 'Файл у мастера ✓';
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
      function (user) { toast('Вы вошли' + (user && user.name ? ', ' + user.name : '') + ' ✓'); loadList(); },
      function () { if (btn) { btn.disabled = false; btn.textContent = 'Войти через Telegram →'; } toast('Вход не подтвердился — попробуйте ещё раз'); },
      function (link, opened) {
        if (btn) btn.textContent = 'Ждём подтверждение в боте…';
        if (hint) {
          hint.hidden = false;
          /* НЕ уводим страницу в Telegram — иначе поллинг умрёт; даём ссылку-кнопку */
          hint.innerHTML = (opened ? 'Окно Telegram открыто — нажмите в боте <b>Start</b>. '
                                   : 'Telegram не открылся сам — ')
            + '<a class="link" href="' + link + '" target="_blank" rel="noopener">открыть бота</a>'
            + ' · ждём подтверждение, страница поймает вход сама.';
        }
      });
  }

  /* ---------------- события ---------------- */
  root.addEventListener('click', function (e) {
    var t = e.target;
    var sw = t.closest('button[data-ord]');
    if (sw) { st.currentId = parseInt(sw.getAttribute('data-ord'), 10); loadDetail(); return; }
    var nowBtn = t.closest('[data-now-open]');
    if (nowBtn) {
      var nid = parseInt(nowBtn.getAttribute('data-now-open'), 10);
      var njump = nowBtn.getAttribute('data-now-jump') || '';
      if (st.currentId === nid && st.detail) { if (njump) scrollToEl(njump); return; }
      st.currentId = nid;
      st.pendingJump = njump || null;
      loadDetail();
      return;
    }
    var segBtn = t.closest('[data-seg-period]');
    if (segBtn) {
      st.showPeriod = segBtn.getAttribute('data-seg-period') === 'sem' ? 'sem' : 'month';
      rerenderHome();
      return;
    }
    if (t.closest('[data-open-plus]')) {
      st.clubOpen = true;
      st.plusOpen = true;
      if (!st.plans) loadPlans();
      rerenderHome();
      scrollToEl('plusSheet');
      return;
    }
    if (t.closest('[data-arch-toggle]')) { st.archOpen = !st.archOpen; renderCurrent(); return; }
    if (t.closest('[data-rem-toggle]')) { st.remOpen = !st.remOpen; renderCurrent(); return; }
    if (t.closest('#cabTg')) { doTgLogin(t.closest('#cabTg')); return; }
    if (t.closest('#cabTg2')) { doTgLogin(t.closest('#cabTg2')); return; }
    if (t.closest('#cabEmailSend')) { emailSendCode(); return; }
    if (t.closest('#cabEmailGo')) { emailVerify(); return; }
    if (t.closest('#cabEmailAgain')) { emailAgain(); return; }
    if (t.closest('#cabClaimBtn')) { claimByCode((document.getElementById('cabClaimIn') || {}).value); return; }
    if (t.closest('[data-access-copy]')) {
      var atok = tokenFor(st.currentId);
      if (atok && S.copy) S.copy(S.claimLink ? S.claimLink(atok) : atok).then(function (okc) {
        toast(okc ? 'Ссылка доступа скопирована — сохраните её себе' : 'Не удалось скопировать — выделите ссылку вручную');
      });
      return;
    }
    if (t.closest('#cabNotiBtn')) { notiAsk(); return; }
    var jmp = t.closest('[data-jump]');
    if (jmp) { scrollToEl(jmp.getAttribute('data-jump')); return; }
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
        toast('Записали — напомним за 7, 3 и 1 день 📅');
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
      /* привязка к текущему аккаунту: сессия уезжает в ?session= */
      window.location.href = S.api.base + '/auth/' + oaLink.getAttribute('data-oauth-link') +
        '/start?session=' + encodeURIComponent(S.api.token() || '');
      return;
    }
    if (t.closest('#cabEmailTgl')) {
      var ew = document.getElementById('cabEmailWrap');
      if (ew) {
        ew.hidden = !ew.hidden;
        if (!ew.hidden) { var ei = document.getElementById('cabEmailIn'); if (ei) ei.focus(); }
      }
      return;
    }
    if (t.closest('#cabLogout')) { S.api.logout(); st.detail = null; loadList(); return; }
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
          title: 'Принять и завершить заказ?',
          text: 'Правки в рамках задания бесплатны — до приёмки и в сервисном окне после неё ' +
                '(замечания научного руководителя и комиссии — до защиты). ' +
                'Ещё ждёте проверок? Нажмите «Пока жду проверок» — дело останется открытым, а сервисное окно продлится. ' +
                'Появились замечания — «Нужны правки» в карточке.',
          okLabel: 'Всё проверено — завершить', noLabel: 'Пока жду проверок'
        } : {
          title: 'Принять часть ' + (od2.stage || 1) + '?',
          text: 'Мастер продолжит со следующей частью. Замечания по этой части лучше отправить сейчас — кнопкой «Нужны правки», это бесплатно.',
          okLabel: 'Принять часть', noLabel: 'Ещё посмотрю'
        }).then(function (res) {
          if (res.ok) { doAction('accept_work'); return; }
          if (isFinal) {
            /* «жду проверок» — не правки и не завершение: дело остаётся открытым */
            toast('Дело остаётся открытым — правки бесплатны до приёмки. Мастер предупреждён.');
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
        toast(okc ? 'Скопировано: ' + cv + ' ✓' : 'Не получилось — выделите и скопируйте вручную');
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
        text: 'Работа и напоминания подождут, пока вы не снимете паузу. Это не отмена: ' +
              'цена, файлы и договорённости сохраняются. Мастер получит уведомление.',
        okLabel: 'Поставить на паузу', noLabel: 'Передумал(а)'
      }) : Promise.resolve({ ok: window.confirm('Поставить дело на паузу?') }))
        .then(function (res) { if (res.ok) doAction('pause'); });
      return;
    }
    if (t.closest('[data-act-cancelreq]')) {
      (S.confirm ? S.confirm({
        title: 'Закрыть дело, когда работа уже идёт?',
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
      doAction('review', { rating: rating, text: rvText.trim(), author: rvAuthor.trim() });
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
      var base = (st.detail.price || 0) - (st.detail.bonus_spent || 0);
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
    if ((location.hash || '').indexOf('plus') >= 0) {
      st.plusOpen = true; st.clubOpen = true; hashPlusScroll = true;
    }
  } catch (e) {}
  /* ссылка доступа с другого устройства: #claim=<токен> (или ?claim=) */
  try {
    var claimTok = (location.hash.match(/claim=([A-Za-z0-9_-]+)/) ||
                    location.search.match(/claim=([A-Za-z0-9_-]+)/) || [])[1];
    if (claimTok) {
      S.api.addGuestToken(claimTok);
      history.replaceState(null, '', location.pathname);
      toast('Дело добавлено на это устройство ✓');
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
      toast('Вы вошли ✓');
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
      toast('Проверяем оплату — статус обновится в течение минуты');
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
