/* ============================================================
   ЛИЧНЫЙ КАБИНЕТ — живые заказы из общей с Telegram-ботом базы.
   Вход через Telegram (Salon.tgLogin) или гостевой доступ по
   токенам заказов (salon_tokens). Поллинг раз в 25 секунд.
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
    me: null,         // /me (бонусы, реф-ссылка) — только при tg-входе
    ledgerOpen: false,
    ledger: null,     // журнал бонусов из /bonus
    timer: null,
    busy: false
  };

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
    return '<div class="sheet sheet-pad stacked cab-login reveal">' +
      '<p class="caps">Вход в кабинет</p>' +
      '<h2 class="ord-type">Ваши заказы — на сайте и в Telegram</h2>' +
      '<p class="petit" style="margin-bottom:18px">Кабинет и бот работают с одной картотекой: статусы, переписка с мастером и файлы синхронны. ' +
      'Вход занимает пару секунд — подтвердите его в нашем боте.</p>' +
      pendingBlock +
      (pending ? '' : '<button type="button" class="btn btn-wax btn-block" id="cabTg">Войти через Telegram <span class="ar">→</span></button>') +
      '<p class="petit cab-login-hint" id="cabTgHint" hidden></p>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">' +
        '<a class="btn btn-line" style="flex:1" href="configurator.html">Оформить первый заказ</a>' +
      '</div>' +
      '<p class="petit" style="margin-top:14px;color:var(--ink-soft)">Оформляли заказ на этом устройстве без входа? Он появится здесь автоматически. ' +
      'Входить нужно, только чтобы видеть заказы с других устройств и получать уведомления в Telegram.</p>' +
      '</div>';
  }

  function tplEmpty() {
    return userRow() +
      '<div class="sheet sheet-pad stacked reveal" style="text-align:center">' +
      '<p class="caps">Картотека пуста</p>' +
      '<h2 class="ord-type">Заказов пока нет</h2>' +
      '<p class="petit" style="margin-bottom:16px">Соберите смету в конфигураторе — заявка попадёт к мастеру мгновенно, а статус появится здесь и в боте.</p>' +
      '<a class="btn btn-wax" href="configurator.html">Рассчитать работу <span class="ar">→</span></a>' +
      '</div>';
  }

  function tplError() {
    return '<div class="sheet sheet-pad stacked reveal" style="text-align:center">' +
      '<p class="petit">Не получилось связаться с картотекой. Проверьте интернет и попробуйте ещё раз.</p>' +
      '<button type="button" class="btn btn-line" id="cabRetry" style="margin-top:10px">Повторить</button>' +
      '</div>';
  }

  function userRow() {
    var u = S.api.user();
    if (S.api.token() && u) {
      return '<div class="cab-id reveal"><span class="ci-dot"></span>' +
        '<span>Вы вошли как <b>' + esc(u.name || 'гость') + '</b>' + (u.username ? ' (@' + esc(u.username) + ')' : '') +
        ' · уведомления дублируются в бота</span>' +
        '<span class="ci-act"><button type="button" class="linkbtn" id="cabLogout">выйти</button></span></div>' +
        bonusCard();
    }
    return '<div class="cab-id reveal"><span class="ci-dot guest"></span>' +
      '<span>Гостевой доступ — заказы видны на этом устройстве</span>' +
      '<span class="ci-act"><button type="button" class="linkbtn wax" id="cabTg">войти через Telegram — заказы привяжутся к вам</button></span></div>';
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

  /* ---------------- список и карточка ---------------- */
  function tplSwitch() {
    if (st.orders.length < 2) return '';
    return '<div class="ord-tabs reveal" role="tablist" aria-label="Ваши заказы">' +
      st.orders.map(function (o) {
        var on = o.id === st.currentId;
        return '<button type="button" role="tab" class="ord-tab' + (on ? ' on' : '') + '" data-ord="' + o.id + '" aria-selected="' + on + '">' +
          '<span class="ot-no">' + esc(o.no) + '</span>' +
          '<span>' + esc(shortWork(o)) + ' · ' + esc(shortStatus(o)) + '</span>' +
          (o.unread ? '<span class="ot-unread">' + o.unread + '</span>' : '') +
          '</button>';
      }).join('') + '</div>';
  }
  function shortWork(o) {
    var w = o.work_label || '';
    return w.length > 24 ? w.slice(0, 23) + '…' : w;
  }
  function shortStatus(o) {
    return { new: 'на оценке', priced: 'ждёт решения', prepay: 'ждёт оплату', work: 'в работе',
             check: 'на проверке', fix: 'правки', done: 'завершён', cancel: 'закрыт' }[o.status] || '';
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
      prepay: 'Ожидаем предоплату — реквизиты ниже',
      work: 'Работа идёт; вопросы можно задать в чате',
      fix: 'Вносим правки по вашим замечаниям',
      check: 'Готово! Посмотрите работу и примите её — или запросите правки',
      done: 'Заказ завершён. Мы на связи до вашей защиты'
    };
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
      }).join('') + '</div></div>';
  }

  function priceBlock(o) {
    if (o.price) {
      var out = '<div class="ord-price-row"><span class="caps">Цена мастера</span>' +
        '<span class="mono ord-price">' + money(o.price) + ' ₽</span></div>';
      if (o.bonus_spent) {
        out += '<div class="due-box">' +
          '<div class="dr"><span>Цена работы</span><b>' + money(o.price) + ' ₽</b></div>' +
          '<div class="dr"><span>Оплачено бонусами</span><b class="minus">−' + money(o.bonus_spent) + '</b></div>' +
          '<div class="dr total"><span>К оплате деньгами</span><b>' + money(o.due_total) + ' ₽</b></div>' +
          (o.prepay && (o.status === 'priced' || o.status === 'prepay')
            ? '<div class="dr"><span>Из них предоплата</span><b>' + money(o.prepay_due) + ' ₽</b></div>' : '') +
          '</div>';
      } else if (o.prepay && (o.status === 'priced' || o.status === 'prepay')) {
        out += '<p class="petit ord-price-note">Предоплата — ' + money(o.prepay_due || o.prepay) + ' ₽, остальное после проверки работы.</p>';
      }
      return out + bonusSpendBlock(o);
    }
    if (o.quote_low) {
      return '<div class="ord-price-row"><span class="caps">Вилка сметы</span>' +
        '<span class="mono ord-price">' + money(o.quote_low) + ' – ' + money(o.quote_high) + ' ₽</span></div>' +
        '<p class="petit ord-price-note">Точную цену мастер назовёт после разбора заявки — уведомим здесь и в Telegram.</p>';
    }
    return '';
  }

  /* -------- списание бонусов: ползунок + точная сумма -------- */
  function bonusSpendBlock(o) {
    if (!o.bonus || !(o.status === 'priced' || o.status === 'prepay')) return '';
    var paidAlready = (o.payments || []).some(function (p) { return p.status === 'paid'; });
    if (paidAlready) return '';
    var room = Math.max((o.bonus_cap || 0) - (o.bonus_spent || 0), 0);
    var limit = Math.min(o.bonus.balance || 0, room);
    if (limit <= 0) return '';
    return '<div class="due-box" id="bspendBox">' +
      '<div class="cbn-row"><span>💎 Списать бонусы <span class="petit">(на счету ' + money(o.bonus.balance) + ', к этому заказу — до ' + money(limit) + ')</span></span>' +
      '<b class="num" id="bspendVal">' + money(limit) + '</b></div>' +
      '<input type="range" class="cbn-slider" id="bspendRange" min="0" max="' + limit + '" step="50" value="' + limit + '">' +
      '<div class="cbn-row"><span class="petit">Спишутся при подтверждении — деньгами останется <b id="bspendDue">' + money((o.due_total || o.price) - limit) + ' ₽</b></span>' +
      '<button type="button" class="btn btn-line" id="bspendApply">Применить</button></div>' +
      '</div>';
  }

  function payHistory(o) {
    var paid = (o.payments || []).filter(function (p) { return p.status === 'paid'; });
    if (!paid.length) return '';
    return '<p class="petit" style="margin-top:8px">Оплачено: ' + paid.map(function (p) {
      return money(p.amount) + ' ₽ (' + (p.kind === 'prepay' ? 'предоплата' : 'остаток') + ', ' + dt(p.at) + ')';
    }).join(' · ') + '</p>';
  }

  function actionsBlock(o) {
    var b = [];
    if (o.actions.indexOf('accept_price') >= 0) {
      b.push('<button type="button" class="btn btn-wax" data-act="accept_price">Принять цену — к оплате ' + money(o.due_total || o.price) + ' ₽</button>');
      b.push('<button type="button" class="btn btn-line" data-act="decline">Отказаться</button>');
    }
    if (o.actions.indexOf('paid') >= 0) {
      var amount = o.status === 'prepay' ? (o.prepay_due || o.prepay) : (o.due_total || o.price);
      var payBtns = '<div class="act-row">' +
        (o.pay_online ? '<button type="button" class="btn btn-wax" data-act-pay>💳 Оплатить картой онлайн</button>' : '') +
        '<button type="button" class="btn ' + (o.pay_online ? 'btn-line' : 'btn-wax') + '" data-act="paid">Я оплатил(а) переводом</button>' +
        '<button type="button" class="btn btn-line" data-chat-focus>Вопрос по оплате</button></div>';
      var req = o.requisites
        ? '<div class="req-slip"><span class="caps">Реквизиты для перевода' + (amount ? ' · ' + money(amount) + ' ₽' : '') + '</span>' +
          '<pre class="req-pre mono">' + esc(o.requisites) + '</pre></div>'
        : (o.pay_online ? '' : '<p class="petit">Реквизиты пришлём в чат ниже (и в Telegram) в течение пары минут.</p>');
      return '<div class="fs-sec"><div class="fs-head"><span class="caps">Оплата</span></div>' + req + payBtns + payHistory(o) + '</div>';
    }
    if (o.actions.indexOf('accept_work') >= 0) {
      b.push('<button type="button" class="btn btn-wax" data-act="accept_work">Принять работу</button>');
      b.push('<button type="button" class="btn btn-line" data-act-fix>Нужны правки</button>');
    }
    if (o.actions.indexOf('resume') >= 0) {
      b.push('<button type="button" class="btn btn-wax" data-act="resume">🔄 Возобновить заказ</button>');
    }
    if (!b.length) return payHistory(o) ? '<div class="fs-sec"><div class="fs-head"><span class="caps">Оплата</span></div>' + payHistory(o) + '</div>' : '';
    return '<div class="fs-sec"><div class="fs-head"><span class="caps">Решение по заказу</span></div><div class="act-row" style="margin-top:0">' + b.join('') + '</div>' +
      '<div class="fix-form" id="fixForm" hidden>' +
        '<textarea id="fixText" rows="3" maxlength="2000" placeholder="Что поправить? Например: «во 2-й главе обновить данные за 2025 год»"></textarea>' +
        '<div class="act-row"><button type="button" class="btn btn-wax" data-act-fix-send>Отправить на правки</button>' +
        '<button type="button" class="btn btn-line" data-act-fix-cancel>Передумал(а)</button></div>' +
      '</div>' + payHistory(o) + '</div>';
  }

  var CLIP_SVG = '<svg class="fl-ic" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.2 12.7 13 19.9a5 5 0 0 1-7.1-7.1l7.9-7.8a3.35 3.35 0 0 1 4.7 4.7l-7.8 7.9a1.68 1.68 0 0 1-2.4-2.4l7.2-7.2"/></svg>';
  function filesBlock(o) {
    var rows = (o.files || []).map(function (f) {
      var who = f.from === 'master' ? 'от мастерской' : 'ваш файл';
      return '<div class="file-line">' + CLIP_SVG +
        '<span class="fl-name">' + esc(f.name) + '</span>' +
        '<span class="fl-meta">' + who + ' · ' + dt(f.at) + '</span>' +
        '<a class="link" href="' + S.api.base + apiPath(o.id, '/file/' + f.id) + '" download>скачать</a></div>';
    }).join('');
    return '<div class="fs-sec"><div class="fs-head"><span class="caps">Файлы</span>' +
      '<label class="btn btn-line btn-upload">Приложить файл<input type="file" id="cabUpload" hidden></label></div>' +
      (rows || '<p class="petit">Пока пусто. Приложите методичку или задание — мастеру будет проще оценить работу точно.</p>') +
      '<p class="petit up-note" id="upNote" hidden></p></div>';
  }

  function chatBlock(o) {
    var items = [];
    (o.history || []).forEach(function (h) { items.push({ at: h.at, sys: true, text: h.text }); });
    (o.messages || []).forEach(function (m) {
      items.push({ at: m.at, me: m.from === 'client', text: m.text, kind: m.kind, file: m.file_name });
    });
    items.sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
    var feed = items.map(function (i) {
      if (i.sys) return '<div class="chat-sys petit">' + esc(i.text) + ' · ' + dt(i.at) + '</div>';
      var body = i.text ? esc(i.text) : '';
      if (!body && i.kind && i.kind !== 'text') body = '\u2758 вложение: ' + (i.file ? esc(i.file) : 'см. раздел «Файлы» или Telegram');
      else if (i.file) body += '<br>\u2758 ' + esc(i.file);
      return '<div class="chat-m' + (i.me ? ' me' : '') + '">' +
        '<span class="chat-who caps">' + (i.me ? 'Вы' : 'Мастерская') + '</span>' +
        '<span class="chat-txt">' + body + '</span>' +
        '<span class="chat-at petit">' + dt(i.at) + '</span></div>';
    }).join('');
    return '<div class="fs-sec"><div class="fs-head"><span class="caps">Переписка по заказу</span>' +
      '<span class="fs-meta">синхронно с Telegram</span></div>' +
      '<div class="chat-feed" id="chatFeed">' + (feed || '<p class="petit" style="text-align:center">Пока тихо. Напишите первым — мастер ответит здесь и в боте.</p>') + '</div>' +
      '<div class="chat-form"><textarea id="chatText" rows="2" maxlength="3000" placeholder="Сообщение мастеру…"></textarea>' +
      '<button type="button" class="btn btn-wax" id="chatSend">Отправить</button></div></div>';
  }

  var STAMP_TONE = { priced: 's-act', prepay: 's-act', check: 's-act', fix: 's-act',
                     done: 's-done', cancel: 's-mute' };
  function tplDetail() {
    var o = st.detail;
    var meta = [];
    if (o.deadline_text) meta.push('срок: ' + esc(o.deadline_text));
    meta.push('заявка от ' + dt(o.created_at));
    return userRow() + tplSwitch() +
      '<article class="sheet sheet-pad stacked reveal form-sheet" aria-label="Дело заказа ' + esc(o.no) + '">' +
      '<div class="ord-top"><span class="mono ord-no">Дело ' + esc(o.no) + '</span>' +
      '<span class="ord-stamp ' + (STAMP_TONE[o.status] || '') + '">' + esc(o.status_label) + '</span></div>' +
      '<h2 class="ord-type">' + esc(o.work_label || '') + '</h2>' +
      (o.topic ? '<p class="ord-topic">Тема: «' + esc(o.topic) + '»</p>' : '') +
      '<p class="petit">' + meta.join(' · ') + '</p>' +
      priceBlock(o) + stageRows(o) +
      actionsBlock(o) + filesBlock(o) + chatBlock(o) + '</article>' +
      '<p class="petit cab-foot-sync">Кабинет и Telegram-бот — одна картотека: что бы ни изменилось, вы увидите это в обоих местах. ' +
      'Бот: <a class="link" href="https://t.me/academic_saloon_bot" target="_blank" rel="noopener">@academic_saloon_bot</a></p>';
  }

  /* ---------------- загрузка данных ---------------- */
  function loadList(keepCurrent) {
    var t = S.api.token(), g = S.api.guestTokens();
    if (!t && !g.length) {
      /* если вход уже запущен (в т.ч. до перезагрузки страницы) — продолжаем ловить */
      var pending = S.resumeTgLogin(
        function (u) { toast('Вы вошли' + (u && u.name ? ', ' + u.name : '') + ' ✓'); loadList(); },
        function () { render(tplLogin(null)); });
      render(tplLogin(pending));
      return;
    }
    if (t) {
      S.api.get('/me').then(function (r) {
        if (r.ok) { st.me = r; if (document.querySelector('.cbn-card') || st.detail) renderCurrent(); }
      });
    } else {
      st.me = null;
    }
    S.api.get('/orders' + (t ? '' : '?tokens=' + encodeURIComponent(g.join(',')))).then(function (r) {
      if (!r.ok) { render(tplError()); return; }
      st.orders = r.orders || [];
      if (!st.orders.length) { render(tplEmpty()); return; }
      if (!keepCurrent || !st.orders.some(function (o) { return o.id === st.currentId; }))
        st.currentId = st.orders[0].id;
      loadDetail();
    });
  }

  function renderCurrent() {
    if (st.detail) {
      var draft = (document.getElementById('chatText') || {}).value || '';
      render(tplDetail());
      var ta = document.getElementById('chatText');
      if (ta && draft) ta.value = draft;
    }
  }

  function loadDetail(silent) {
    var id = st.currentId;
    S.api.get(apiPath(id)).then(function (r) {
      if (!r.ok) { if (!silent) render(tplError()); return; }
      var was = st.detail;
      var changed = !was || was.id !== r.order.id || was.updated_at !== r.order.updated_at ||
        (was.messages || []).length !== (r.order.messages || []).length ||
        (was.files || []).length !== (r.order.files || []).length;
      /* статус изменился, пока страница была открыта → живое уведомление */
      if (was && was.id === r.order.id && was.status !== r.order.status) {
        var meta = STATUS_STAMP[r.order.status];
        if (meta) {
          if (meta[0] && S.stamp) S.stamp(meta[0]);
          toast(meta[1]);
        }
      }
      st.detail = r.order;
      if (changed || !silent) {
        var draft = (document.getElementById('chatText') || {}).value || '';
        render(tplDetail());
        var ta = document.getElementById('chatText');
        if (ta && draft) ta.value = draft;
        var feed = document.getElementById('chatFeed');
        if (feed) feed.scrollTop = feed.scrollHeight;
      }
    });
  }

  function startPolling() {
    if (st.timer) clearInterval(st.timer);
    st.timer = setInterval(function () {
      if (document.hidden || !st.currentId || !S.api.identified()) return;
      loadDetail(true);
    }, 25000);
  }

  /* ---------------- действия ---------------- */
  function doAction(action, extra) {
    if (st.busy) return;
    st.busy = true;
    var body = { action: action };
    if (extra && extra.comment) body.comment = extra.comment;
    if (extra && extra.reason) body.reason = extra.reason;
    if (extra && extra.amount != null) body.amount = extra.amount;
    var t = tokenFor(st.currentId);
    if (t) body.token = t;
    S.api.post('/orders/' + st.currentId + '/action' + (t ? '?token=' + encodeURIComponent(t) : ''), body)
      .then(function (r) {
        st.busy = false;
        if (!r.ok) {
          toast({ bonus_need_login: 'Чтобы списывать бонусы, войдите через Telegram',
                  bonus_after_payment: 'По заказу уже была оплата — бонусы не применить',
                  bonus_order_small: 'Бонусы применимы к заказам от 1000 ₽',
                  bonus_cap: 'Лимит списания по этому заказу уже выбран',
                  bonus_empty: 'На счету нет доступных бонусов' }[r.error] ||
                'Не получилось — попробуйте ещё раз');
          return;
        }
        st.detail = r.order;
        render(tplDetail());
        if (action === 'accept_work' && S.stamp) S.stamp('Принято');
        if (action === 'resume' && S.stamp) S.stamp('Снова в работе');
        if (action === 'bonus_apply' && S.stamp) S.stamp('−' + money(r.spent || 0) + ' бонусами', { tone: 'wax' });
        toast({ accept_price: 'Принято! Дальше — предоплата', paid: 'Передали мастеру на сверку',
                accept_work: 'Заказ завершён — спасибо!', request_fixes: 'Отправили на правки',
                decline: 'Заявка закрыта — её можно возобновить в любой момент',
                resume: 'Заявка снова в работе', bonus_apply: 'Бонусы применены' }[action] || 'Готово');
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

  function uploadFile(input) {
    var f = input.files && input.files[0];
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) { toast('Файл больше 20 МБ — пришлите его в Telegram-боте'); return; }
    var note = document.getElementById('upNote');
    if (note) { note.hidden = false; note.textContent = 'Загружаем «' + f.name + '»…'; }
    var fd = new FormData();
    fd.append('file', f, f.name);
    var t = tokenFor(st.currentId);
    var url = S.api.base + '/orders/' + st.currentId + '/upload?' + qs(st.currentId);
    var h = {};
    var sess = S.api.token();
    if (sess && !t) h['Authorization'] = 'Bearer ' + sess;
    fetch(url, { method: 'POST', body: fd, headers: h })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        if (!r.ok) { if (note) note.textContent = 'Не получилось загрузить — попробуйте ещё раз или пришлите в боте.'; return; }
        if (note) note.textContent = 'Файл у мастера ✓';
        loadDetail();
      })
      .catch(function () { if (note) note.textContent = 'Сеть прервалась — попробуйте ещё раз.'; });
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
    if (t.closest('#cabTg')) { doTgLogin(t.closest('#cabTg')); return; }
    if (t.closest('#cabTgCancel')) { S.store.del('salon_auth_pending'); render(tplLogin(null)); return; }
    if (t.closest('#cabLogout')) { S.api.logout(); st.detail = null; loadList(); return; }
    if (t.closest('#cabRetry')) { loadList(); return; }
    if (t.closest('#chatSend')) { sendMessage(); return; }
    var act = t.closest('[data-act]');
    if (act) {
      var a = act.getAttribute('data-act');
      if (a === 'decline') {
        var ask = S.confirm ? S.confirm({
          title: 'Закрыть заявку?',
          text: 'Если смущает цена или срок — напишите в чат, обычно удаётся договориться. ' +
                'Закрытую заявку можно возобновить в любой момент.',
          input: 'textarea',
          placeholder: 'Причина — по желанию: поможет нам сделать предложение точнее',
          okLabel: 'Закрыть заявку', noLabel: 'Вернуться', danger: true
        }) : Promise.resolve({ ok: window.confirm('Закрыть заявку?'), value: '' });
        ask.then(function (res) { if (res.ok) doAction('decline', { reason: res.value }); });
        return;
      }
      if (a === 'accept_work' && S.confirm) {
        S.confirm({
          title: 'Принять работу?',
          text: 'Подтверждение завершит заказ. Если остались замечания — лучше нажать «Нужны правки», это бесплатно до приёмки.',
          okLabel: 'Принять работу', noLabel: 'Ещё посмотрю'
        }).then(function (res) { if (res.ok) doAction('accept_work'); });
        return;
      }
      doAction(a);
      return;
    }
    if (t.closest('[data-act-pay]')) { payOnline(); return; }
    if (t.closest('#bspendApply')) {
      var rng = document.getElementById('bspendRange');
      var amount = rng ? parseInt(rng.value, 10) : 0;
      if (!amount) { toast('Выберите сумму списания ползунком'); return; }
      doAction('bonus_apply', { amount: amount });
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
      return;
    }
    if (t.closest('#bonusRefBtn')) {
      var link = (st.me && st.me.ref_link) || 'https://t.me/academic_saloon_bot';
      if (S.copy) S.copy(link).then(function (okc) {
        toast(okc ? 'Ссылка-приглашение скопирована — отправьте другу'
                  : 'Ссылка: ' + link);
      });
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
    if (t.closest('[data-chat-focus]')) { var ta = document.getElementById('chatText'); if (ta) { ta.focus(); ta.scrollIntoView({ block: 'center' }); } return; }
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
  });

  root.addEventListener('keydown', function (e) {
    if (e.target && e.target.id === 'chatText' && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault(); sendMessage();
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && st.currentId) loadDetail(true);
  });

  /* ---------------- старт ---------------- */
  /* возврат со страницы оплаты: ?paid=<id> — открываем заказ и обновляем */
  try {
    var paidId = new URLSearchParams(location.search).get('paid');
    if (paidId) {
      st.currentId = parseInt(paidId, 10) || null;
      toast('Проверяем оплату — статус обновится в течение минуты');
      history.replaceState(null, '', location.pathname);
    }
  } catch (e) {}
  loadList();
  startPolling();

  /* гостям с заказом — мягкое предложение привязать Telegram (раз за сессию) */
  setTimeout(function () {
    try {
      if (S.api.token() || sessionStorage.getItem('salon_nudged') === '1') return;
      var tokenized = st.orders.filter(function (o) { return o.token; });
      if (!tokenized.length || !S.tgNudge) return;
      sessionStorage.setItem('salon_nudged', '1');
      var link = 'https://t.me/academic_saloon_bot?start=claim_' + encodeURIComponent(tokenized[0].token);
      S.tgNudge(root, link);
    } catch (e) {}
  }, 2600);
}
if (document.prerendering) {
  document.addEventListener('prerenderingchange', initCabinet, { once: true });
} else {
  initCabinet();
}
