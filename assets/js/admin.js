/* ============================================================
   КАБИНЕТ МАСТЕРА v3 — все процессы мастерской в одном окне.
   Вкладки: Сводка · Заказы · Клиенты · Отзывы · Лиды · Настройки.
   Умеет: цену с планом этапов (50/50, 30/40/30), подтверждение
   оплат по этапам, сдачу частей файлами, переписку с файлами и
   голосовыми, причины отмен, архив, модерацию отзывов, ссылки
   на мессенджеры клиента. Доступ: Telegram-вход из ADMIN_IDS.
   ============================================================ */
function initGodEye() {
  'use strict';
  var S = window.Salon;
  var root = document.getElementById('agRoot');
  if (!S || !S.api || !root) return;

  var ST_META = {
    new: ['🆕', 'Новая'], priced: ['💰', 'Цена предложена'], prepay: ['⏳', 'Ждёт предоплату'],
    work: ['🔨', 'В работе'], check: ['📤', 'На проверке'], fix: ['✏️', 'Правки'],
    done: ['✅', 'Завершён'], cancel: ['🚫', 'Отменён']
  };
  var PLAN_LBL = { 1: 'Одна выдача', 2: '2 части · 50/50', 3: '3 части · 30/40/30' };
  var PL_ST = { paid: ['оплачен ✓', 'pl-paid'], claimed: ['клиент отметил — сверьте!', 'pl-claimed'],
                due: ['созрел к оплате', 'pl-due'], later: ['после следующей части', 'pl-later'] };

  /* серверные коды — по-русски: хроника и события не должны быть «тьмой» */
  var EV_LABEL = {
    created: 'заявка создана', status: 'смена статуса',
    price_accepted: 'клиент принял цену', payment_marked: 'клиент отметил оплату',
    payment_unmarked: 'клиент снял отметку об оплате', payment_confirmed: 'оплата подтверждена',
    payment_link: 'выдана ссылка на оплату', receipt: 'клиент приложил чек',
    delivered: 'работа сдана на проверку', part_accepted: 'часть принята',
    work_accepted: 'работа принята', accept_wait_pay: 'принято — ждём финальный платёж',
    fix_requested: 'клиент запросил правки', client_msg: 'сообщение клиента',
    admin_msg: 'ваш ответ клиенту', admin_file: 'ваш файл клиенту',
    bonus_spent: 'клиент применил бонусы', bonus_canceled: 'бонусы возвращены на счёт',
    cancel_reason: 'причина отказа', client_archive: 'клиент: архив дела',
    admin_archive: 'архив мастера', review: 'отзыв клиента',
    paused: 'дело поставлено на паузу', unpaused: 'пауза снята',
    cancel_request: 'клиент просит закрыть дело', client_pin: 'клиент закрепил дело',
    final_ready: 'финал готов — клиенту выставлен остаток',
    spec_sent: 'спецификация отправлена клиенту',
    broadcast: 'рассылка клиентам', defense_offered: 'предложены услуги к защите',
    plan_set: 'план оплаты изменён', tg_linked: 'клиент привязал Telegram',
    admin_ping: 'напоминание о заявке', client_followup: 'напоминание клиенту о проверке',
    deadline1: 'скоро срок сдачи', deadline3: 'до срока 3 дня'
  };
  var STATUS_WORD = { new: 'новая', priced: 'цена предложена', prepay: 'ждёт предоплату',
    work: 'в работе', check: 'на проверке', fix: 'правки', done: 'завершён', cancel: 'закрыт' };
  function evLabel(kind) { return EV_LABEL[kind] || kind; }
  function evData(e) {
    var d = String(e.data == null ? '' : e.data);
    if (e.kind === 'status') {
      d = d.replace(/\b(new|priced|prepay|work|check|fix|done|cancel)\b/g,
        function (m) { return STATUS_WORD[m] || m; });
    }
    return d;
  }
  var METHOD_LBL = { manual: 'перевод', yookassa: 'ЮKassa', robokassa: 'Robokassa' };
  var LEAD_ST = { new: '🆕 новый', seen: 'просмотрен', done: '✓ обработан' };

  var st = {
    tab: 'summary', filter: 'attention', q: '', sort: 'fresh', listLimit: 40,
    orders: [], sel: null, card: null,
    clients: [], csel: null, ccard: null,
    reviews: [], leads: [],
    ov: null, timer: null, busy: false
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) { return (n || 0).toLocaleString('ru-RU'); }
  function dt(iso) {
    if (!iso) return '';
    var d = new Date(iso + (String(iso).indexOf('Z') < 0 ? 'Z' : ''));
    return isNaN(d) ? '' : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  function toast(m) { if (S.toast) S.toast(m); }
  function stMeta(s) { return ST_META[s] || ['·', s]; }
  function stamp(s) { return '<span class="ag-stamp st-' + s + '">' + stMeta(s)[1] + '</span>'; }
  function confirmDlg(opts) {
    return S.confirm ? S.confirm(opts)
      : Promise.resolve({ ok: window.confirm(opts.title || 'Подтвердить?'), value: '' });
  }
  function starRow(n) {
    var out = '';
    for (var i = 1; i <= 5; i++) out += i <= n ? '★' : '<span class="dim">★</span>';
    return out;
  }
  function mediaSrc(orderId, msgId) {
    return S.api.base + '/orders/' + orderId + '/msgmedia/' + msgId + '?session=' + encodeURIComponent(S.api.token());
  }
  function fileSrc(orderId, fid) {
    return S.api.base + '/orders/' + orderId + '/file/' + fid + '?session=' + encodeURIComponent(S.api.token());
  }

  /* ---------------- вход/гейт ---------------- */
  function tplLogin(pending, denied) {
    return '<div class="ag-login sheet sheet-pad stacked">' +
      '<p class="caps">Кабинет мастера</p>' +
      '<h1 style="font-size:26px;margin:6px 0 10px">Рабочий стол мастерской</h1>' +
      (denied ? '<p class="petit" style="color:var(--wax,#A8402F);margin-bottom:12px">Этот аккаунт Telegram не является мастером — доступа нет.</p>' : '') +
      (pending
        ? '<p class="petit" style="margin-bottom:12px">⏳ Ждём подтверждение в Telegram — нажмите в боте <b>Start</b>.</p>' +
          '<a class="btn btn-wax btn-block" href="' + (pending.link || 'https://t.me/academic_saloon_bot') + '" target="_blank" rel="noopener">Открыть Telegram</a>' +
          '<button type="button" class="btn btn-line btn-block" id="agCancel" style="margin-top:10px">Отменить</button>'
        : '<button type="button" class="btn btn-wax btn-block" id="agTg">Войти через Telegram</button>') +
      (denied ? '<button type="button" class="btn btn-line btn-block" id="agLogout" style="margin-top:10px">Выйти и сменить аккаунт</button>' : '') +
      '<p class="ag-note" style="margin-top:14px">Вход подтверждается в боте мастерской. Посторонним сервер не отвечает.</p>' +
      '</div>';
  }

  function gate() {
    if (!S.api.token()) {
      var pending = S.resumeTgLogin(function () { gate(); }, function () { render(tplLogin(null)); });
      render(tplLogin(pending));
      return;
    }
    S.api.get('/admin/overview').then(function (r) {
      if (r.error === 'forbidden') { render(tplLogin(null, true)); return; }
      if (!r.ok) { render('<div class="ag-empty">Сервер недоступен. <button class="btn btn-line" id="agRetry">Повторить</button></div>'); return; }
      st.ov = r;
      renderShell();
      loadTab(true);
      if (!st.timer) st.timer = setInterval(function () {
        if (!document.hidden) refreshSilent();
      }, 25000);
    });
  }

  function refreshSilent() {
    S.api.get('/admin/overview').then(function (r) { if (r.ok) { st.ov = r; drawNav(); if (st.tab === 'summary') drawBody(); } });
    if (st.tab === 'orders') {
      S.api.get('/admin/orders?' + listQuery()).then(function (r) {
        if (r.ok) { st.orders = r.orders; drawList(); }
      });
      if (st.sel) loadCard(st.sel, true);
    }
  }

  /* ---------------- данные ---------------- */
  function listQuery() {
    /* поиск и фильтр совместимы: q ищет, status сужает */
    var parts = ['status=' + encodeURIComponent(st.filter)];
    if (st.q) parts.push('q=' + encodeURIComponent(st.q));
    return parts.join('&');
  }
  function loadTab(openFirst) {
    if (st.tab === 'orders') {
      S.api.get('/admin/orders?' + listQuery()).then(function (r) {
        if (!r.ok) return;
        st.orders = r.orders;
        if (openFirst && st.orders.length && !st.sel) st.sel = st.orders[0].id;
        drawBody();
        if (st.sel) loadCard(st.sel);
      });
    } else if (st.tab === 'clients') {
      S.api.get('/admin/clients').then(function (r) {
        if (!r.ok) return;
        st.clients = r.clients;
        drawBody();
        if (st.csel) loadClient(st.csel);
      });
    } else if (st.tab === 'reviews') {
      S.api.get('/admin/reviews').then(function (r) {
        if (!r.ok) return;
        st.reviews = r.reviews;
        drawBody();
      });
    } else if (st.tab === 'leads') {
      S.api.get('/admin/leads').then(function (r) {
        if (!r.ok) return;
        st.leads = r.leads;
        drawBody();
      });
    } else {
      drawBody();
    }
  }
  function loadCard(id, silent) {
    st.sel = id;
    S.api.get('/admin/orders/' + id).then(function (r) {
      if (!r.ok) return;
      var was = st.card;
      if (silent && was && was.id === r.order.id &&
          was.updated_at === r.order.updated_at &&
          (was.messages || []).length === (r.order.messages || []).length) return;
      var draft = (document.getElementById('agMsg') || {}).value || '';
      st.card = r.order;
      drawCard();
      drawList();
      var ta = document.getElementById('agMsg');
      if (ta && draft) ta.value = draft;
    });
  }
  function loadClient(id) {
    st.csel = id;
    S.api.get('/admin/clients/' + id).then(function (r) {
      if (!r.ok) return;
      st.ccard = r.client;
      drawClientCard();
    });
  }

  /* ---------------- каркас ---------------- */
  function render(html) { root.innerHTML = html; }

  function renderShell() {
    var u = S.api.user() || {};
    render(
      '<div class="ag-mast"><h1><span class="mono">Академический салон · картотека</span>Кабинет мастера</h1>' +
      '<div class="ag-user"><span>мастер: <b>' + esc(u.name || '—') + '</b></span>' +
      '<a class="ag-linkbtn" href="dashboard.html">клиентский кабинет</a>' +
      '<button type="button" class="ag-linkbtn" id="agLogout">выйти</button></div></div>' +
      '<div class="ag-nav" id="agNav"></div>' +
      '<div id="agBody"></div>');
    drawNav();
  }

  function navBadges() {
    var ov = st.ov || {};
    var by = ov.by_status || {};
    return {
      orders: (by.new || 0) + (by.fix || 0) + (ov.claimed || 0),
      reviews: ov.reviews_pending || 0
    };
  }

  function drawNav() {
    var box = document.getElementById('agNav');
    if (!box) return;
    var b = navBadges();
    var tabs = [
      ['summary', '◫ Сводка', 0],
      ['orders', '🗂 Заказы', b.orders],
      ['clients', '👥 Клиенты', 0],
      ['reviews', '⭐ Отзывы', b.reviews],
      ['leads', '🌐 Лиды', 0],
      ['broadcast', '📣 Рассылка', 0],
      ['settings', '⚙️ Настройки', 0]
    ];
    box.innerHTML = tabs.map(function (t) {
      return '<button type="button" class="ag-tab' + (st.tab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] +
        (t[2] ? '<span class="ag-badge">' + t[2] + '</span>' : '') + '</button>';
    }).join('');
  }

  function drawBody() {
    var box = document.getElementById('agBody');
    if (!box) return;
    if (st.tab === 'summary') { box.innerHTML = tplSummary(); return; }
    if (st.tab === 'orders') {
      box.innerHTML =
        '<div class="ag-filters" id="agFilters"></div>' +
        '<div class="ag-split">' +
          '<div class="ag-list" id="agList"></div>' +
          '<div class="ag-card" id="agCard"><div class="ag-empty">Выберите заказ слева</div></div>' +
        '</div>';
      drawFilters();
      drawList();
      if (st.card) drawCard();
      return;
    }
    if (st.tab === 'clients') {
      box.innerHTML =
        '<div class="ag-split">' +
          '<div class="ag-list" id="agCList"></div>' +
          '<div class="ag-card" id="agCCard"><div class="ag-empty">Выберите клиента слева</div></div>' +
        '</div>';
      drawClientList();
      if (st.ccard) drawClientCard();
      return;
    }
    if (st.tab === 'reviews') { box.innerHTML = tplReviews(); return; }
    if (st.tab === 'leads') { box.innerHTML = tplLeads(); return; }
    if (st.tab === 'broadcast') { box.innerHTML = tplBroadcast(); bcastRefresh(); return; }
    drawSettings(box);
  }

  /* ---------------- РАССЫЛКА ---------------- */
  function tplBroadcast() {
    return '<div class="ag-card" style="max-width:680px;max-height:none">' +
      '<div class="ag-sec" style="border-top:0;margin-top:0;padding-top:0">' +
      '<span class="caps">Рассылка клиентам в Telegram</span>' +
      '<p class="petit" style="margin:8px 0 12px">Сообщение уйдёт от имени бота всем выбранным клиентам. ' +
      'В конец автоматически добавляется «🔕 Отписаться: /stopnews». Отписавшиеся, заблокировавшие бота ' +
      'и заблокированные вами клиенты рассылку не получают.</p>' +
      '<div class="ag-actrow"><select id="agBSeg" class="ag-sort" style="border-radius:var(--r)">' +
        '<option value="all">Все клиенты</option>' +
        '<option value="active">С активными заказами</option>' +
        '<option value="done">С завершёнными заказами</option>' +
      '</select><span class="petit" id="agBCount">считаем получателей…</span></div>' +
      '<div class="ag-actrow" style="margin-top:10px"><textarea id="agBText" rows="7" ' +
      'placeholder="Текст сообщения — обычным текстом, как пишете в Telegram.&#10;&#10;Например: «До конца месяца дарим +10% бонусами на любую летнюю работу…»"></textarea></div>' +
      '<div class="ag-actrow" style="margin-top:10px">' +
        '<button type="button" class="btn btn-line" id="agBTest">👀 Отправить себе — посмотреть</button>' +
        '<button type="button" class="btn btn-wax" id="agBSend">📣 Запустить рассылку</button></div>' +
      '<p class="ag-note" id="agBStatus"></p>' +
      '<p class="ag-note">Хорошая рассылка — редкая и полезная: акция, новая услуга, сезонное напоминание. ' +
      'Чаще раза в пару недель лучше не беспокоить.</p></div></div>';
  }

  function bcastRefresh() {
    var seg = (document.getElementById('agBSeg') || {}).value || 'all';
    S.api.get('/admin/broadcast?segment=' + seg).then(function (r) {
      var c = document.getElementById('agBCount');
      if (!c || !r.ok) return;
      c.textContent = 'получателей: ' + r.count;
      bcastStatus(r.state);
    });
  }

  function bcastStatus(stt) {
    var el = document.getElementById('agBStatus');
    if (!el || !stt) return;
    if (stt.running) {
      el.innerHTML = '⏳ Идёт рассылка: отправлено <b>' + stt.sent + '</b> из ' + stt.total +
        (stt.failed ? ' · недоставлено ' + stt.failed : '');
      setTimeout(function () {
        if (st.tab !== 'broadcast') return;
        S.api.get('/admin/broadcast/status').then(function (r) { if (r.ok) bcastStatus(r.state); });
      }, 2500);
    } else if (stt.finished_at) {
      el.innerHTML = '✅ Последняя рассылка («' + esc(stt.segment) + '»): доставлено ' + stt.sent +
        (stt.failed ? ', недоставлено ' + stt.failed + ' (блокировки)' : '') + '.';
    } else {
      el.textContent = '';
    }
  }

  /* ---------------- СВОДКА ---------------- */
  function tplSummary() {
    var ov = st.ov || {};
    var by = ov.by_status || {};
    var active = ['new', 'priced', 'prepay', 'work', 'check', 'fix']
      .reduce(function (s, k) { return s + (by[k] || 0); }, 0);
    function tile(n, l, cls, go) {
      return '<div class="ag-tile ' + (cls || '') + (go ? ' click" data-go="' + go : '') + '">' +
        '<div class="t-num">' + n + '</div><div class="t-lbl">' + l + '</div></div>';
    }
    var attn = [];
    if (by.new) attn.push({ f: 'new', ic: '🆕', t: '<b>Новые заявки: ' + by.new + '</b> — посмотрите и назначьте цену' });
    if (ov.claimed) attn.push({ f: 'attention', ic: '💳', t: '<b>Отмеченные оплаты: ' + ov.claimed + '</b> — сверьте поступления и подтвердите' });
    if (by.fix) attn.push({ f: 'fix', ic: '✏️', t: '<b>Правки: ' + by.fix + '</b> — клиенты ждут исправленную версию' });
    if (by.check) attn.push({ f: 'check', ic: '📤', t: 'На проверке у клиентов: ' + by.check });
    if (ov.reviews_pending) attn.push({ f: '@reviews', ic: '⭐', t: '<b>Отзывы на модерации: ' + ov.reviews_pending + '</b> — опубликовать или отклонить' });
    return '' +
      '<div class="ag-tiles">' +
      tile(by.new || 0, 'новые заявки', by.new ? 'warn' : '', 'new') +
      tile(ov.claimed || 0, 'оплаты на сверке', ov.claimed ? 'warn' : '', 'attention') +
      tile(active, 'активные заказы', '', 'active') +
      tile((by.fix || 0), 'в правках', by.fix ? 'warn' : '', 'fix') +
      tile(money(ov.month && ov.month.revenue) + ' ₽', 'выручка за 30 дней', 'calm') +
      tile(ov.users || 0, 'клиентов', '') +
      '</div>' +
      weeksChart(ov) +
      (attn.length
        ? '<p class="caps" style="margin-bottom:8px">Требует вашего внимания</p><div class="ag-attn">' +
          attn.map(function (a) {
            return '<div class="aa-row" data-go="' + a.f + '"><span>' + a.ic + '</span>' +
              '<span class="aa-what">' + a.t + '</span><span class="aa-go">открыть →</span></div>';
          }).join('') + '</div>'
        : '<div class="ag-attn" style="border-left-color:var(--ag-ok)"><div class="aa-row" style="cursor:default"><span>🕊</span><span class="aa-what">Всё разобрано — срочных дел нет.</span></div></div>') +
      '<p class="caps" style="margin:18px 0 8px">Последние события</p>' +
      '<div class="ag-attn" style="border-left-color:var(--hairline-strong)">' +
      (st.ov.events || []).map(function (e) {
        return '<div class="aa-row" ' + (e.order_id ? 'data-open-order="' + e.order_id + '"' : 'style="cursor:default"') + '>' +
          '<span class="aa-go">' + dt(e.at) + '</span>' +
          '<span class="aa-what">' + (e.order_id ? '№' + e.order_id + ' · ' : '') + esc(evLabel(e.kind)) +
          (e.data ? ' — ' + esc(evData(e).slice(0, 70)) : '') + '</span></div>';
      }).join('') + '</div>';
  }

  /* выручка по неделям — тихие столбики без библиотек */
  function weeksChart(ov) {
    var w = ov.weeks || [];
    if (!w.length || !w.some(function (x) { return x.revenue > 0; })) return '';
    var max = Math.max.apply(null, w.map(function (x) { return x.revenue; })) || 1;
    return '<p class="caps" style="margin:18px 0 8px">Выручка по неделям <span style="text-transform:none;letter-spacing:0;color:var(--ink-faint,#888)">— подтверждённые платежи, 8 недель</span></p>' +
      '<div class="ag-weeks">' + w.map(function (x) {
        var h = Math.max(3, Math.round(x.revenue / max * 74));
        return '<div class="wk" title="' + x.start + ' — ' + money(x.revenue) + ' ₽' + (x.pays ? ' (' + x.pays + ' пл.)' : '') + '">' +
          '<span class="wk-sum">' + (x.revenue ? money(x.revenue) : '') + '</span>' +
          '<span class="wk-bar' + (x.revenue ? '' : ' zero') + '" style="height:' + h + 'px"></span>' +
          '<span class="wk-lbl">' + esc(x.start) + '</span></div>';
      }).join('') + '</div>';
  }

  /* ---------------- ЗАКАЗЫ: фильтры и список ---------------- */
  function drawFilters() {
    var box = document.getElementById('agFilters');
    if (!box) return;
    var chips = [['attention', '❗ Требуют действий'], ['active', 'Активные'], ['', 'Все']]
      .concat(Object.keys(ST_META).map(function (k) { return [k, stMeta(k)[0] + ' ' + stMeta(k)[1]]; }))
      .concat([['archive', '🗄 Архив']]);
    box.innerHTML = chips.map(function (c) {
      return '<button type="button" class="ag-chip' + (st.filter === c[0] ? ' on' : '') + '" data-f="' + c[0] + '">' + c[1] + '</button>';
    }).join('') +
      '<input class="ag-search" id="agQ" placeholder="Поиск: №, тема, ник… (Enter)" value="' + esc(st.q) + '">' +
      '<select class="ag-sort" id="agSort" title="Порядок списка">' +
        '<option value="fresh"' + (st.sort === 'fresh' ? ' selected' : '') + '>сначала новые</option>' +
        '<option value="updated"' + (st.sort === 'updated' ? ' selected' : '') + '>по последнему движению</option>' +
        '<option value="deadline"' + (st.sort === 'deadline' ? ' selected' : '') + '>по сроку сдачи</option>' +
      '</select>';
  }

  function sortedOrders() {
    var arr = st.orders.slice();
    if (st.sort === 'updated') {
      arr.sort(function (a, b) { return (b.updated_at || '') < (a.updated_at || '') ? -1 : 1; });
    } else if (st.sort === 'deadline') {
      arr.sort(function (a, b) {
        var da = a.deadline_date || '9999', db2 = b.deadline_date || '9999';
        return da < db2 ? -1 : da > db2 ? 1 : 0;
      });
    }
    return arr; /* 'fresh' — порядок сервера: новые сверху */
  }

  function drawList() {
    var box = document.getElementById('agList');
    if (!box) return;
    if (!st.orders.length) { box.innerHTML = '<div class="ag-empty">Здесь пусто 🕊</div>'; return; }
    var arr = sortedOrders();
    var shown = arr.slice(0, st.listLimit);
    box.innerHTML = shown.map(function (o) {
      var m = stMeta(o.status);
      var who = o.client.guest ? ('👤 ' + o.client.name) : (o.client.name + (o.client.username ? ' @' + o.client.username : ''));
      var pills = '';
      if (o.paused) pills += '<span class="ag-pill">⏸ пауза</span>';
      if (o.claimed) pills += '<span class="ag-pill due">сверка</span>';
      else if (o.status === 'new') pills += '<span class="ag-pill due">оценить</span>';
      else if (o.status === 'fix') pills += '<span class="ag-pill act">правки</span>';
      if ((o.stages_total || 1) > 1 && 'work check fix done'.indexOf(o.status) >= 0)
        pills += '<span class="ag-pill">ч.' + o.stage + '/' + o.stages_total + '</span>';
      var dl = '';
      if (o.deadline_date && 'done cancel'.indexOf(o.status) < 0) {
        var left = Math.ceil((new Date(o.deadline_date + 'T23:59:59') - new Date()) / 86400000);
        if (!isNaN(left)) dl = ' · ⏳ ' + (left < 0 ? 'срок вышел' : left === 0 ? 'сдача сегодня' : left + ' дн.');
      }
      return '<button type="button" class="ag-row' + (o.id === st.sel ? ' sel' : '') + '" data-id="' + o.id + '">' +
        '<span class="r-no">№' + o.id + '</span>' +
        '<span class="r-main"><span class="r-t">' + m[0] + ' ' + esc(o.work_label || '') + '</span>' +
        '<span class="r-s">' + esc(who) + ' · ' + dt(o.created_at) + dl +
        (o.cancel_reason ? ' · 🚫 ' + esc(String(o.cancel_reason).slice(0, 30)) : '') + '</span></span>' +
        '<span class="r-side">' + (pills || '') +
        '<span class="r-price">' + (o.price ? money(o.price) + '₽' : (o.quote_low ? '~' + money(o.quote_low) : '')) + '</span></span>' +
        '</button>';
    }).join('') +
    (arr.length > st.listLimit
      ? '<button type="button" class="ag-row ag-more" id="agMore">Показать ещё ' +
        Math.min(40, arr.length - st.listLimit) + ' из ' + (arr.length - st.listLimit) + '</button>'
      : '');
  }

  /* ---------------- карточка дела ---------------- */
  function pendingCancelReq(o) {
    /* запрос «закройте дело», не перекрытый более поздней сменой статуса */
    var evs = o.events || []; /* новые сверху */
    for (var i = 0; i < evs.length; i++) {
      if (evs[i].kind === 'status') return null;
      if (evs[i].kind === 'cancel_request') return evs[i];
    }
    return null;
  }

  function nextHint(o) {
    /* что мастеру сделать прямо сейчас — карточка сама подсказывает */
    var cr = pendingCancelReq(o);
    if (cr)
      return ['due', '✋ <b>Клиент просит закрыть дело.</b>' + (cr.data ? ' Причина: «' + esc(cr.data) + '».' : '') +
        ' Свяжитесь с ним, решите вопрос по выполненной части и оплате; закрыть можно кнопкой «Закрыть с причиной…» ниже.'];
    if (o.paused)
      return ['', '⏸ <b>Дело на паузе' + (o.paused_by === 'admin' ? ' (поставили вы)' : ' (поставил клиент)') + '.</b> ' +
        'Напоминания молчат. Снять паузу можно в «Управлении статусом» ниже.'];
    var claimed = (o.payments || []).filter(function (p) { return p.status === 'claimed'; });
    if (claimed.length)
      return ['due', '💳 <b>Клиент отметил оплату ' + money(claimed[0].amount) + ' ₽.</b> Проверьте поступление и подтвердите в плане оплат ниже — статус и кэшбэк посчитаются сами.'];
    if (o.final_ready && 'work fix'.indexOf(o.status) >= 0) {
      if (o.due_now && o.due_now.amount > 0)
        return ['', '🏁 Финал объявлен готовым — клиент получил счёт на остаток ' +
          money(o.due_now.amount) + ' ₽. Файл придержите: как только подтвердите оплату, напомним сдать.'];
      return ['due', '🏁 <b>Остаток получен — передайте финальную часть.</b> Сдайте файлом ниже, клиент получит кнопки приёмки.'];
    }
    if (o.status === 'new')
      return ['due', '💰 <b>Новая заявка.</b> Изучите требования и отправьте предложение с ценой — клиент получит его в Telegram и в кабинете.'];
    if (o.status === 'fix')
      return ['due', '✏️ <b>Клиент запросил правки' + ((o.stages_total || 1) > 1 ? ' по части ' + o.stage : '') + '.</b> Замечания — в переписке. Готовую версию сдайте файлом с пометкой «сдача» — клиент снова получит кнопки приёмки.'];
    if (o.status === 'priced')
      return ['', '⏳ Предложение у клиента — ждём решения. Можно поменять цену или написать в переписке.'];
    if (o.status === 'prepay')
      return ['', '⏳ Ждём предоплату. Если клиент оплатил и отметил — здесь появится кнопка подтверждения.'];
    if (o.status === 'work')
      return ['', '🔨 В работе' + ((o.stages_total || 1) > 1 ? ': часть ' + o.stage + ' из ' + o.stages_total : '') + '. Когда будет готово — сдайте файлом ниже.'];
    if (o.status === 'check')
      return ['', '📤 ' + ((o.stages_total || 1) > 1 ? 'Часть ' + o.stage + ' из ' + o.stages_total : 'Работа') + ' на проверке у клиента — он примет или запросит правки.'];
    if (o.status === 'cancel')
      return ['', '🚫 Заявка закрыта' + (o.cancel_reason ? ': «' + esc(o.cancel_reason) + '»' : '') + '. Можно возобновить — клиент получит предложение заново.'];
    return null;
  }

  function clientLine(o) {
    var links = (o.client.links || []).map(function (l) {
      return '<a href="' + esc(l[1]) + '" target="_blank" rel="noopener">' + esc(l[0]) + '</a>';
    }).join('');
    var who = o.client.guest
      ? '👤 Гость: <b>' + esc(o.client.name) + '</b>' + (o.client.contact ? ' · <span class="mono">' + esc(o.client.contact) + '</span>' : '') +
        '<br><span class="petit">Без Telegram: всё написанное здесь он видит в кабинете сайта' + (o.client.contact ? '; для живой связи — кнопки ниже' : '') + '.</span>'
      : '👤 <b>' + esc(o.client.name) + '</b>' + (o.client.username ? ' · @' + esc(o.client.username) : '') +
        ' · <button type="button" class="ag-linkbtn" data-open-client="' + o.client.id + '">карточка клиента</button>';
    return '<p class="ag-meta" style="margin-top:8px">' + who + '</p>' +
      (links ? '<div class="ag-clinks">' + links + '</div>' : '');
  }

  function planBlock(o) {
    var plan = o.plan || [];
    var cur = o.stages_total || 1;
    var planSel = '<select id="agPlanSel">' + [1, 2, 3].map(function (n) {
      return '<option value="' + n + '"' + (cur === n ? ' selected' : '') + '>' + PLAN_LBL[n] + '</option>';
    }).join('') + '</select>';
    var rows = plan.map(function (p) {
      var m = PL_ST[p.state] || ['', ''];
      var act = '';
      if (p.state === 'claimed' || p.state === 'due')
        act = '<button type="button" class="btn btn-ink" data-pay-kind="' + p.kind + '" data-pay-amount="' + p.amount + '">Получена ✓</button>';
      return '<div class="pl-row"><span class="pl-n">' + p.n + '</span>' +
        '<span class="pl-what">' + esc(p.label) + ' <span class="pl-st ' + m[1] + '">' + m[0] + '</span></span>' +
        '<span class="pl-sum">' + money(p.amount) + ' ₽</span>' + act + '</div>';
    }).join('');
    var paid = (o.payments || []).filter(function (p) { return p.status === 'paid'; });
    return '<div class="ag-sec"><span class="caps">Цена и план оплаты' +
      '<span class="sub">бонусами списано: ' + money(o.bonus_spent || 0) + ' · деньгами всего: ' + money(o.due_total || o.price || 0) + ' ₽</span></span>' +
      '<div class="ag-actrow">' +
      '<input type="number" id="agPrice" placeholder="цена ₽" value="' + (o.price || '') + '">' +
      '<input type="number" id="agPrepay" placeholder="первый платёж" value="' + (o.prepay || '') + '">' +
      planSel +
      '<button type="button" class="btn btn-wax" id="agPriceSend">' + (o.price ? 'Обновить предложение' : 'Отправить предложение') + '</button>' +
      '</div>' +
      '<p class="ag-note">Первый платёж можно не указывать — посчитается по плану (50% или 30%). Предложение уйдёт клиенту с кнопками в Telegram и в кабинет.</p>' +
      (plan.length ? '<div class="ag-plan">' + rows + '</div>' : '') +
      (paid.length ? '<p class="ag-note">💰 Получено: ' + paid.map(function (p) {
        return money(p.amount) + ' ₽ (' + dt(p.at) + ', ' + (METHOD_LBL[p.method] || esc(p.method)) + ')';
      }).join(' · ') + '</p>' : '') +
      '</div>';
  }

  function partsBlock(o) {
    var total = o.stages_total || 1;
    if ('work check fix done'.indexOf(o.status) < 0 && !(total > 1 && o.price)) return '';
    var cells = '';
    if (total > 1) {
      for (var n = 1; n <= total; n++) {
        var cls = '', tag = 'впереди';
        if (o.status === 'done' || n <= (o.parts_done || 0)) { cls = 'past'; tag = 'принята ✓'; }
        else if (n === o.stage) {
          cls = 'now';
          tag = o.status === 'check' ? 'у клиента' : o.status === 'fix' ? 'правки' : 'в работе';
        }
        cells += '<div class="ag-part ' + cls + '"><b>Часть ' + n + '</b><span class="st">' + tag + '</span></div>';
      }
    }
    var canDeliver = 'work fix check'.indexOf(o.status) >= 0;
    var finalStage = total <= 1 || (o.stage || 1) >= total;
    var unpaid = (o.plan || []).some(function (p) { return p.state !== 'paid'; });
    var finBtn = ('work fix'.indexOf(o.status) >= 0 && finalStage && !o.final_ready && unpaid)
      ? '<button type="button" class="btn btn-line" id="agFinalReady">🏁 Финал готов — счёт на остаток (файл придержать)</button>'
      : '';
    return '<div class="ag-sec"><span class="caps">Сдача работы' +
      '<span class="sub">' + (total > 1 ? 'часть ' + o.stage + ' из ' + total + ' · принято ' + (o.parts_done || 0) : '') +
      (o.final_ready ? ' · 🏁 финал придержан до оплаты' : '') + '</span></span>' +
      (cells ? '<div class="ag-parts">' + cells + '</div>' : '') +
      (canDeliver
        ? '<div class="ag-actrow" style="margin-top:8px">' +
          '<label class="btn btn-wax btn-upload">📦 Сдать ' + (o.final_ready ? 'финал' : (total > 1 ? 'часть ' + o.stage : 'работу')) + ' файлом' +
          '<input type="file" id="agDeliverFile"></label>' +
          '<label class="btn btn-line btn-upload">📎 Просто отправить файл<input type="file" id="agPlainFile"></label>' +
          finBtn +
          (o.status !== 'check' ? '<button type="button" class="btn btn-line" id="agDeliverMark">Файлы уже у клиента — зафиксировать сдачу</button>' : '') +
          '</div>' +
          '<p class="ag-note">«Сдать» — клиент получит файл с кнопками «принять / нужны правки», статус и оплата этапа посчитаются сами. «Просто файл» — ничего не меняет. ' +
          '«Финал готов» — клиенту уходит счёт на остаток, а финальный файл вы передаёте после оплаты.</p>'
        : '') +
      '<p class="ag-note" id="agUpNote" hidden></p></div>';
  }

  function feedBlock(o) {
    var feed = [];
    (o.history || []).forEach(function (h) { feed.push({ at: h.at, sys: true, text: h.text }); });
    (o.messages || []).forEach(function (x) { feed.push({ at: x.at, m: x }); });
    feed.sort(function (a, b) { return a.at < b.at ? -1 : 1; });
    var html = feed.map(function (f) {
      if (f.sys) return '<div class="ag-sys">' + esc(f.text) + ' · ' + dt(f.at) + '</div>';
      var x = f.m;
      var me = x.from === 'master';
      var body = x.text ? esc(x.text) : '';
      if (x.media && (x.kind === 'voice' || x.kind === 'audio'))
        body += (body ? '<br>' : '') + '<audio controls preload="none" src="' + mediaSrc(o.id, x.id) + '"></audio>';
      else if (x.media && x.kind === 'photo')
        body += (body ? '<br>' : '') + '<a href="' + mediaSrc(o.id, x.id) + '" target="_blank" rel="noopener"><img loading="lazy" src="' + mediaSrc(o.id, x.id) + '" alt="фото"></a>';
      else if (x.media && (x.kind === 'video' || x.kind === 'video_note'))
        body += (body ? '<br>' : '') + '<video controls preload="none" style="max-width:min(260px,100%)" src="' + mediaSrc(o.id, x.id) + '"></video>';
      else if (!body || x.file_name)
        body += (body ? '<br>' : '') + '📎 ' + esc(x.file_name || ('вложение (' + esc(x.kind || '') + ')'));
      return '<div class="ag-m' + (me ? ' master' : '') + '"><span class="who">' + (me ? 'Мастерская' : 'Клиент') + ' · ' + dt(f.at) + '</span>' +
        '<div class="txt">' + body + '</div></div>';
    }).join('');
    return '<div class="ag-sec"><span class="caps">Переписка' +
      '<span class="sub">клиент видит её в кабинете' + (o.tg_linked ? ' и в Telegram' : '') + '</span></span>' +
      '<div class="ag-feed" id="agFeed">' + (html || '<div class="ag-sys">пока пусто</div>') + '</div>' +
      '<div class="ag-tpls">' + TPL.map(function (t, i) {
        return '<button type="button" class="ag-tpl" data-tpl="' + i + '" title="Вставить текст в поле">' + t[0] + '</button>';
      }).join('') + '</div>' +
      '<div class="ag-chatform">' +
      '<textarea id="agMsg" rows="2" placeholder="Сообщение клиенту… (Cmd/Ctrl+Enter)"></textarea>' +
      '<label class="btn btn-line btn-upload" title="Файл клиенту">📎<input type="file" id="agChatFile"></label>' +
      '<button type="button" class="btn btn-wax" id="agMsgSend">Отправить</button></div></div>';
  }

  /* быстрые заготовки ответов: клик — текст в поле, дальше правится руками */
  var TPL = [
    ['👋 Взял в работу', 'Добрый день! Заявку получил, изучаю требования — вернусь с оценкой в ближайшее время.'],
    ['❓ Уточнение', 'Добрый день! Чтобы оценить точно, уточните, пожалуйста: '],
    ['📦 Готово, проверьте', 'Работа готова и отправлена — посмотрите, пожалуйста. Если всё в порядке, нажмите «Принять»; замечания — кнопкой «Нужны правки», исправлю бесплатно.'],
    ['✏️ Правки принял', 'Замечания получил, всё поправлю — пришлю обновлённую версию и напишу здесь.'],
    ['💳 Про оплату', 'Напомню про оплату этапа — реквизиты в карточке заказа (кнопка «Оплатить»). Как поступит, сразу продолжаю.'],
    ['🕊 Спасибо', 'Спасибо, что выбрали мастерскую! На связи до самой защиты — если появятся вопросы по работе, пишите прямо сюда.']
  ];

  function filesBlock(o) {
    var fs = o.files || [];
    return '<div class="ag-sec"><span class="caps">Файлы дела (' + fs.length + ')</span>' +
      (fs.length ? fs.map(function (f) {
        var tags = '';
        if (f.part) tags += '<span class="fl-tag">часть ' + f.part + '</span>';
        if (f.label) tags += '<span class="fl-tag">' + esc(f.label) + '</span>';
        return '<div class="ag-file"><span class="fname">📎 ' + esc(f.name) + tags + '</span>' +
          '<span class="fmeta">' + (f.from === 'master' ? 'от вас' : 'от клиента') + ' · ' + dt(f.at) + '</span>' +
          '<a class="ag-linkbtn" href="' + fileSrc(o.id, f.id) + '" download>скачать</a></div>';
      }).join('') : '<p class="ag-note">Файлов пока нет.</p>') + '</div>';
  }

  function manageBlock(o) {
    var activeSt = 'new priced prepay work check fix'.indexOf(o.status) >= 0;
    return '<div class="ag-sec"><span class="caps">Управление статусом</span>' +
      '<div class="ag-actrow">' +
      Object.keys(ST_META).map(function (k) {
        return '<button type="button" class="ag-stbtn' + (o.status === k ? ' on' : '') + '" data-st="' + k + '">' + stMeta(k)[0] + ' ' + stMeta(k)[1] + '</button>';
      }).join('') + '</div>' +
      '<p class="ag-note">Клиент получает уведомление о смене статуса — в Telegram, на почту и в кабинет.</p>' +
      '<div class="ag-actrow" style="margin-top:10px">' +
      (o.status === 'cancel'
        ? '<button type="button" class="btn btn-line" id="agResume">🔄 Возобновить заказ</button>'
        : '<button type="button" class="btn btn-line" id="agCancel2">🚫 Закрыть с причиной…</button>') +
      (activeSt
        ? (o.paused
          ? '<button type="button" class="btn btn-line" id="agPause" data-on="0">▶️ Снять с паузы</button>'
          : '<button type="button" class="btn btn-line" id="agPause" data-on="1">⏸ Поставить на паузу…</button>')
        : '') +
      (o.archived_admin
        ? '<button type="button" class="btn btn-line" id="agArch" data-on="0">📂 Вернуть из архива</button>'
        : '<button type="button" class="btn btn-line" id="agArch" data-on="1">🗄 Убрать в архив</button>') +
      '</div>' +
      (o.paused ? '<p class="ag-note">⏸ Пауза: напоминания о сроках молчат, клиент видит отметку в кабинете. ' +
        (o.paused_by === 'admin' ? 'Паузу ставили вы — клиент снять её не может.' : 'Паузу ставил клиент — он может снять её сам.') + '</p>' : '') +
      '</div>';
  }

  function intelBlock(o) {
    var ci = o.client_intel;
    var rows = [];
    if (o.tier_label) rows.push(['⭐ Сопровождение', esc(o.tier_label)]);
    if (o.quote_low) rows.push(['🧮 Сайт показал', money(o.quote_low) + ' – ' + money(o.quote_high) + ' ₽']);
    if (o.deadline_text) rows.push(['📅 Срок клиента', esc(o.deadline_text)]);
    if (o.details) rows.push(['📋 Требования', esc(o.details)]);
    if (ci) {
      rows.push(['💎 Бонусы клиента', money(ci.bonus.balance) +
        (ci.bonus.expiring.length ? ' (сгорит ' + ci.bonus.expiring.map(function (e) { return e.amount + ' — ' + dt(e.at).slice(0, 5); }).join(', ') + ')' : '')]);
      rows.push(['🤝 Рефералы', ci.referrals + (ci.referrer ? ' · пришёл от ' + esc(ci.referrer.name || ci.referrer.id) : '')]);
      rows.push(['📇 Клиент с', dt(ci.since) + (ci.welcome_at ? ' · велком получен' : '')]);
      if (ci.banned) rows.push(['⛔️', '<b style="color:var(--wax)">В чёрном списке</b>']);
    }
    if (o.consent_at) rows.push(['📋 Согласие ПДн', dt(o.consent_at) + ' · ' + esc(o.consent_doc || '')]);
    if (o.page) rows.push(['🔗 Источник', esc(o.page)]);
    if (o.cancel_reason) rows.push(['🚫 Причина отказа', '«' + esc(o.cancel_reason) + '»']);
    if (o.review) rows.push(['⭐ Отзыв', starRow(o.review.rating) + ' · ' + ({ pending: 'на модерации — вкладка «Отзывы»', approved: 'опубликован', rejected: 'отклонён' }[o.review.status] || '')]);
    if (!rows.length) return '';
    return '<div class="ag-intel">' + rows.map(function (r) {
      return '<div class="ai-row"><span class="ai-k">' + r[0] + '</span><span class="ai-v">' + r[1] + '</span></div>';
    }).join('') + '</div>';
  }

  function drawCard() {
    var box = document.getElementById('agCard');
    var o = st.card;
    if (!box || !o) return;
    var hint = nextHint(o);
    box.innerHTML =
      '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline">' +
      '<span class="mono petit">Дело №' + o.id + ' · ' + esc(o.source || '') + ' · создано ' + dt(o.created_at) +
      (o.archived_admin ? ' · 🗄 в архиве' : '') + '</span>' +
      '<span>' + (o.paused ? '<span class="ag-stamp st-cancel" style="margin-right:6px">⏸ пауза</span>' : '') +
      stamp(o.status) + '</span></div>' +
      '<h2>' + esc(o.work_label || '') + '</h2>' +
      (o.topic ? '<p class="ag-topic">«' + esc(o.topic) + '»</p>' : '') +
      clientLine(o) +
      (hint ? '<div class="ag-next ' + hint[0] + '">' + hint[1] + '</div>' : '') +
      planBlock(o) +
      partsBlock(o) +
      feedBlock(o) +
      filesBlock(o) +
      manageBlock(o) +
      intelBlock(o) +
      '<div class="ag-sec"><span class="caps">Заметка (видна только вам)</span>' +
      '<div class="ag-actrow"><textarea id="agNote" rows="2">' + esc(o.admin_note || '') + '</textarea>' +
      '<button type="button" class="btn btn-line" id="agNoteSave">Сохранить</button></div></div>' +
      '<div class="ag-sec"><span class="caps">Хроника дела</span><div class="ag-ev">' +
      (o.events || []).map(function (e) {
        return dt(e.at) + ' · ' + esc(evLabel(e.kind)) + (e.data ? ' — ' + esc(evData(e).slice(0, 70)) : '');
      }).join('<br>') + '</div></div>';
    var feedBox = document.getElementById('agFeed');
    if (feedBox) feedBox.scrollTop = feedBox.scrollHeight;
  }

  /* ---------------- КЛИЕНТЫ ---------------- */
  function drawClientList() {
    var box = document.getElementById('agCList');
    if (!box) return;
    if (!st.clients.length) { box.innerHTML = '<div class="ag-empty">Клиентов пока нет</div>'; return; }
    box.innerHTML = st.clients.map(function (c) {
      return '<button type="button" class="ag-row' + (c.id === st.csel ? ' sel' : '') + '" data-cid="' + c.id + '">' +
        '<span class="r-main"><span class="r-t">' + (c.banned ? '⛔️ ' : '') + esc(c.name || 'клиент') +
        (c.username ? ' <span class="petit">@' + esc(c.username) + '</span>' : '') + '</span>' +
        '<span class="r-s">заказов: ' + c.orders + ' · оплачено: ' + money(c.paid_sum) + ' ₽ · был ' + dt(c.last_seen) + '</span></span>' +
        '<span class="r-price">💎 ' + money(c.balance) + '</span>' +
        '</button>';
    }).join('');
  }

  function drawClientCard() {
    var box = document.getElementById('agCCard');
    var c = st.ccard;
    if (!box || !c) return;
    box.innerHTML =
      '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline">' +
      '<h2 style="margin:0">' + (c.banned ? '⛔️ ' : '') + esc(c.name || 'клиент') +
      (c.username ? ' <span class="petit">@' + esc(c.username) + '</span>' : '') + '</h2>' +
      '<span class="mono petit">id ' + c.id + '</span></div>' +
      '<p class="ag-meta">с нами с ' + dt(c.since) + ' · был ' + dt(c.last_seen) +
      (c.welcome_at ? ' · велком-бонус получен' : '') + '</p>' +
      (c.username ? '<div class="ag-clinks"><a href="https://t.me/' + esc(c.username) + '" target="_blank" rel="noopener">Telegram @' + esc(c.username) + '</a></div>'
        : (c.id > 0 ? '<div class="ag-clinks"><a href="tg://user?id=' + c.id + '">Профиль Telegram</a></div>' : '')) +
      (c.referrer ? '<p class="ag-meta">🤝 пришёл по приглашению: ' + esc(c.referrer.name || c.referrer.id) + '</p>' : '') +
      (c.referrals.length ? '<p class="ag-meta">🤝 привёл: ' + c.referrals.map(function (r) { return esc(r.name || r.id); }).join(', ') + '</p>' : '') +

      '<div class="ag-sec"><span class="caps">Бонусный счёт · ' + money(c.bonus.balance) + '</span>' +
      (c.bonus.expiring.length ? '<p class="petit">⏳ сгорает: ' + c.bonus.expiring.map(function (e) { return e.amount + ' — ' + dt(e.at).slice(0, 5); }).join(', ') + '</p>' : '') +
      '<div class="ag-actrow"><input type="number" id="agBDelta" placeholder="± сумма">' +
      '<input type="text" id="agBNote" placeholder="комментарий (клиент увидит)" style="flex:1;min-width:150px">' +
      '<button type="button" class="btn btn-line" id="agBApply">Провести</button></div>' +
      '<p class="ag-note">Плюс — начислить (срок 90 дней), минус — списать. Начисление придёт клиенту уведомлением.</p>' +
      '<div class="ag-ev" style="margin-top:10px;max-height:200px;overflow-y:auto">' +
      (c.ledger || []).map(function (r) {
        var sign = r.delta > 0 ? '+' : '';
        return dt(r.at) + ' · <b>' + sign + r.delta + '</b> · ' + esc(r.label) + (r.note ? ' — ' + esc(r.note) : '');
      }).join('<br>') + '</div></div>' +

      '<div class="ag-sec"><span class="caps">Заказы (' + c.orders.length + ')</span>' +
      (c.orders.length ? c.orders.map(function (o) {
        var m = stMeta(o.status);
        return '<div class="ag-file"><span class="fname">' + m[0] + ' №' + o.id + ' · ' + esc(o.work_label || '') +
          (o.price ? ' · ' + money(o.price) + ' ₽' : '') + '</span>' +
          '<button type="button" class="ag-linkbtn" data-open-order="' + o.id + '">открыть</button></div>';
      }).join('') : '<p class="ag-note">Заказов нет.</p>') + '</div>' +

      '<div class="ag-sec"><span class="caps">Доступ</span><div class="ag-actrow">' +
      '<button type="button" class="btn ' + (c.banned ? 'btn-line' : 'btn-wax') + '" id="agBan" data-on="' + (c.banned ? '0' : '1') + '">' +
      (c.banned ? 'Снять блокировку' : '⛔️ Заблокировать клиента') + '</button></div>' +
      '<p class="ag-note">Блокировка закрывает приём новых заявок с сайта от этого аккаунта.</p></div>';
  }

  /* ---------------- ОТЗЫВЫ ---------------- */
  function tplReviews() {
    if (!st.reviews.length) return '<div class="ag-empty">Отзывов пока нет. Они появляются, когда клиент завершённого заказа ставит оценку в боте или кабинете.</div>';
    var stLbl = { pending: '⏳ ждёт решения', approved: '✅ на сайте', rejected: '🚫 отклонён' };
    return '<p class="petit" style="margin-bottom:12px">Отзывы публикуются на «Книге отзывов» сайта только после вашего одобрения. Отклонённый отзыв клиент не увидит как отклонённый — просто не попадёт на сайт.</p>' +
      st.reviews.map(function (r) {
        return '<div class="ag-rv ' + r.status + '">' +
          '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline">' +
          '<span class="rv-st">' + starRow(r.rating) + '</span>' +
          '<span class="rv-meta">' + (stLbl[r.status] || '') + ' · ' + dt(r.at) + '</span></div>' +
          (r.text ? '<blockquote>«' + esc(r.text) + '»</blockquote>' : '<blockquote style="opacity:.6">Без текста — только оценка.</blockquote>') +
          '<p class="rv-meta">' + esc(r.author || 'Без подписи') + ' · ' + esc(r.work_label || '') +
          ' · <button type="button" class="ag-linkbtn" data-open-order="' + r.order_id + '">дело №' + r.order_id + '</button></p>' +
          '<div class="ag-actrow" style="margin-top:10px">' +
          (r.status !== 'approved' ? '<button type="button" class="btn btn-ink" data-rv="' + r.id + '" data-ok="1">✅ Опубликовать</button>' : '') +
          (r.status !== 'rejected' ? '<button type="button" class="btn btn-line" data-rv="' + r.id + '" data-ok="0">🚫 ' + (r.status === 'approved' ? 'Снять с сайта' : 'Отклонить') + '</button>' : '') +
          '</div></div>';
      }).join('');
  }

  /* ---------------- ЛИДЫ ---------------- */
  function tplLeads() {
    return '<p class="petit" style="margin-bottom:10px">Обращения с сайта без оформленного заказа — эти люди уже проявили интерес, свяжитесь по контакту.</p>' +
      '<div style="border:1px solid var(--hairline);border-radius:var(--r);max-height:65vh;overflow-y:auto;background:var(--sheet,transparent)">' +
      (st.leads.length ? st.leads.map(function (l) {
        return '<div class="ag-lead"><b>#' + l.id + '</b> ' + esc(l.name || '—') +
          ' · <span class="mono">' + esc(l.contact || '') + '</span>' +
          (l.message ? '<br><span class="petit">' + esc(l.message).slice(0, 200) + '</span>' : '') +
          '<br><span class="petit">' + (LEAD_ST[l.status] || esc(l.status)) + ' · ' + dt(l.at) + '</span></div>';
      }).join('') : '<div class="ag-empty">Лидов пока нет</div>') + '</div>';
  }

  /* ---------------- НАСТРОЙКИ ---------------- */
  function drawSettings(box) {
    var ov = st.ov || {};
    box.innerHTML =
      '<div class="ag-card" style="max-width:680px;max-height:none">' +
      '<div class="ag-sec" style="border-top:0;margin-top:0;padding-top:0"><span class="caps">Реквизиты для переводов</span>' +
      '<div class="ag-actrow"><textarea id="agReq" rows="3" placeholder="Сбер: 0000 0000 0000 0000 (Имя О.)&#10;СБП: +7 900 000-00-00">' + esc(ov.requisites || '') + '</textarea>' +
      '<button type="button" class="btn btn-line" id="agReqSave">Сохранить</button></div>' +
      '<p class="ag-note">Эти реквизиты видят клиенты при оплате переводом — в боте и в кабинете.</p></div>' +

      '<div class="ag-sec"><span class="caps">Оплата этапами</span>' +
      '<p class="petit">Небольшие работы — 2 части (50/50), крупные (диплом, магистерская, Scopus…) — 3 части (30/40/30), как обещает сайт. План ставится автоматически при назначении цены; в карточке заказа его можно поменять, пока этапы не пошли.</p></div>' +

      '<div class="ag-sec"><span class="caps">Онлайн-оплата картой</span>' +
      '<p class="petit">' + (ov.pay_online
        ? '✅ Онлайн-касса подключена — клиенты могут платить картой/СБП, статусы двигаются сами.'
        : 'Пока выключена. Основной путь — <b>Robokassa</b> (работает с самозанятыми, «Робочеки СМЗ» сами шлют чек НПД): ' +
          'зарегистрируйте магазин на <b>robokassa.com</b>, в настройках магазина укажите Result URL ' +
          '<span class="mono">https://akademsalon.ru/api/pay/robokassa</span> (метод POST), ' +
          'Success/Fail URL — <span class="mono">…/dashboard.html</span>, возьмите «Идентификатор магазина» и «Пароль #1/#2» ' +
          'и добавьте в <span class="mono">/root/salon_bot/.env</span> строки ROBOKASSA_LOGIN, ROBOKASSA_PASS1, ROBOKASSA_PASS2, ' +
          'затем перезапустите бота (systemctl restart salon-bot-v2). Для теста: тестовые пароли + ROBOKASSA_TEST=1. ' +
          'До этого работает оплата переводом с подтверждением в одну кнопку.') + '</p></div>' +

      '<div class="ag-sec"><span class="caps">Почта</span>' +
      '<p class="petit">' + (ov.mail_on
        ? '✅ Почта работает (support@akademsalon.ru): письма о заказе уходят, вход по коду включён.'
        : (ov.mail_configured
          ? '⚠️ Почта настроена (support@akademsalon.ru), но <b>хостер держит исходящий SMTP-порт закрытым</b> — письма не уходят. ' +
            'Напишите в поддержку Timeweb из панели: «Прошу открыть исходящие SMTP-порты 465 и 587 на VPS 217.18.63.210 — ' +
            'нужна отправка транзакционных писем моего домена akademsalon.ru». После разблокировки всё включится само, без перезапусков.'
          : 'SMTP не настроен — письма клиентам не уходят. Добавьте SMTP_HOST/USER/PASS в /root/salon_bot/.env.')) + '</p></div>' +

      '<div class="ag-sec"><span class="caps">Рабочая группа заказов</span>' +
      '<p class="petit">' + (ov.group_forum
        ? '✅ Темы включены: каждый заказ — отдельная ветка. Всё по заказу (файлы клиента, чеки, отзывы) падает в его тему.'
        : 'Группа подключена (id <span class="mono">' + esc(String(ov.group_chat_id || '')) + '</span>), но «Темы» не включены. ' +
          'Профиль группы → «Изменить» → «Темы» → вид <b>«Список»</b>, затем команда /threads в группе. ' +
          'Пока тем нет, заказы идут в общую ленту с метками #заказ.') + '</p>' +
      '<p class="ag-note">Шпаргалка по работе в группе — команда /help внутри группы.</p></div>' +
      '</div>';
  }

  /* ---------------- действия ---------------- */
  function api(path, body) {
    if (st.busy) return Promise.resolve({ ok: false, error: 'busy' });
    st.busy = true;
    return S.api.post(path, body).then(function (r) { st.busy = false; return r; });
  }
  function afterOrder(r, msg) {
    if (r.ok) {
      if (msg) toast(msg);
      if (r.order) { st.card = r.order; drawCard(); }
      refreshSilent();
    } else toast(r.error === 'busy' ? 'Секунду…' : 'Не получилось' + (r.error ? ' (' + r.error + ')' : ''));
  }

  function uploadAdminFile(input, deliver) {
    var f = input.files && input.files[0];
    if (!f || !st.sel) return;
    if (f.size > 20 * 1024 * 1024) { toast('Файл больше 20 МБ — отправьте его через ветку заказа в группе'); return; }
    var note = document.getElementById('agUpNote');
    if (note) { note.hidden = false; note.textContent = 'Отправляем «' + f.name + '»…'; }
    var fd = new FormData();
    fd.append('file', f, f.name);
    fetch(S.api.base + '/admin/orders/' + st.sel + '/upload?deliver=' + (deliver ? '1' : '0'), {
      method: 'POST', body: fd,
      headers: { 'Authorization': 'Bearer ' + S.api.token() }
    }).then(function (resp) { return resp.json(); })
      .then(function (r) {
        if (!r.ok) { if (note) note.textContent = 'Не ушло (' + (r.error || 'ошибка') + ')'; toast('Файл не отправился'); return; }
        if (note) note.textContent = deliver ? 'Сдано ✓ — клиент получил кнопки приёмки' : 'Файл у клиента ✓';
        toast(deliver ? '📦 Сдача зафиксирована' : (r.delivered_tg ? 'Файл доставлен в Telegram ✓' : 'Файл в деле — клиент увидит в кабинете'));
        if (r.order) { st.card = r.order; drawCard(); }
      })
      .catch(function () { if (note) note.textContent = 'Сеть прервалась — попробуйте ещё раз'; });
  }

  root.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest('#agTg')) {
      var b = t.closest('#agTg');
      b.disabled = true; b.textContent = 'Подтвердите в боте…';
      S.tgLogin(function () { gate(); }, function () { gate(); },
        function (link, opened) { if (!opened) b.insertAdjacentHTML('afterend', '<p class="petit"><a class="link" href="' + link + '" target="_blank">Открыть бота</a></p>'); });
      return;
    }
    if (t.closest('#agCancel')) { S.store.del('salon_auth_pending'); gate(); return; }
    if (t.closest('#agLogout')) { S.api.logout(); gate(); return; }
    if (t.closest('#agRetry')) { gate(); return; }

    var tab = t.closest('.ag-tab');
    if (tab) { st.tab = tab.getAttribute('data-tab'); drawNav(); loadTab(true); return; }

    var go = t.closest('[data-go]');
    if (go) {
      var f = go.getAttribute('data-go');
      if (f === '@reviews') { st.tab = 'reviews'; }
      else { st.tab = 'orders'; st.filter = f; st.q = ''; st.sel = null; }
      drawNav(); loadTab(true);
      return;
    }
    var oo = t.closest('[data-open-order]');
    if (oo) { st.tab = 'orders'; st.filter = ''; st.q = ''; st.sel = parseInt(oo.getAttribute('data-open-order'), 10); drawNav(); loadTab(); return; }
    var oc = t.closest('[data-open-client]');
    if (oc) { st.tab = 'clients'; st.csel = parseInt(oc.getAttribute('data-open-client'), 10); drawNav(); loadTab(); return; }

    var row = t.closest('.ag-row[data-id]');
    if (row) { loadCard(parseInt(row.getAttribute('data-id'), 10)); return; }
    var crow = t.closest('.ag-row[data-cid]');
    if (crow) { loadClient(parseInt(crow.getAttribute('data-cid'), 10)); return; }

    var chip = t.closest('.ag-chip[data-f]');
    if (chip) { st.filter = chip.getAttribute('data-f'); st.listLimit = 40; loadTab(); return; }
    if (t.closest('#agMore')) { st.listLimit += 40; drawList(); return; }
    var tplBtn = t.closest('.ag-tpl[data-tpl]');
    if (tplBtn) {
      var ta0 = document.getElementById('agMsg');
      if (ta0) {
        var ins = TPL[parseInt(tplBtn.getAttribute('data-tpl'), 10)][1];
        ta0.value = ta0.value.trim() ? ta0.value.replace(/\s+$/, '') + '\n' + ins : ins;
        ta0.focus();
        ta0.selectionStart = ta0.selectionEnd = ta0.value.length;
      }
      return;
    }
    var pauseBtn = t.closest('#agPause');
    if (pauseBtn) {
      var pOn = pauseBtn.getAttribute('data-on') === '1';
      if (!pOn) {
        api('/admin/orders/' + st.sel + '/pause', { on: false })
          .then(function (r) { afterOrder(r, '▶️ Пауза снята — клиент уведомлён'); });
        return;
      }
      confirmDlg({
        title: 'Поставить дело на паузу?',
        text: 'Напоминания о сроках замолчат, клиент получит уведомление с вашей припиской (если укажете). Это не отмена — всё по делу сохраняется.',
        input: 'textarea', placeholder: 'Приписка клиенту — например: «жду методичку» (можно пусто)',
        okLabel: 'Поставить на паузу', noLabel: 'Отмена'
      }).then(function (res) {
        if (!res.ok) return;
        api('/admin/orders/' + st.sel + '/pause', { on: true, note: res.value })
          .then(function (r) { afterOrder(r, '⏸ Дело на паузе — клиент уведомлён'); });
      });
      return;
    }

    /* --- карточка дела --- */
    if (t.closest('#agPriceSend')) {
      var price = parseInt((document.getElementById('agPrice') || {}).value, 10);
      var prepay = parseInt((document.getElementById('agPrepay') || {}).value, 10);
      var stages = parseInt((document.getElementById('agPlanSel') || {}).value, 10);
      if (!price || price <= 0) { toast('Введите цену'); return; }
      api('/admin/orders/' + st.sel + '/price', { price: price, prepay: prepay || undefined, stages: stages || undefined })
        .then(function (r) { afterOrder(r, 'Предложение ушло клиенту 💰'); });
      return;
    }
    var payBtn = t.closest('[data-pay-kind]');
    if (payBtn) {
      var kind = payBtn.getAttribute('data-pay-kind');
      var amount = parseInt(payBtn.getAttribute('data-pay-amount'), 10);
      confirmDlg({
        title: 'Подтвердить оплату ' + money(amount) + ' ₽?',
        text: 'Проверьте поступление денег. Подтверждение двинет заказ и начислит клиенту кэшбэк — отменить будет нельзя.',
        okLabel: 'Деньги пришли — подтвердить', noLabel: 'Отмена'
      }).then(function (res) {
        if (!res.ok) return;
        api('/admin/orders/' + st.sel + '/confirm_payment', { kind: kind, amount: amount })
          .then(function (r) { afterOrder(r, 'Оплата подтверждена ✓'); if (r.ok && S.stamp) S.stamp('Оплачено'); });
      });
      return;
    }
    var stb = t.closest('.ag-stbtn');
    if (stb) {
      api('/admin/orders/' + st.sel + '/status', { status: stb.getAttribute('data-st') })
        .then(function (r) { afterOrder(r, 'Статус обновлён — клиент уведомлён'); });
      return;
    }
    if (t.closest('#agFinalReady')) {
      confirmDlg({
        title: 'Финал готов — выставить счёт на остаток?',
        text: 'Клиент получит уведомление: работа готова целиком, финальная часть передаётся после закрытия остатка. ' +
              'Файл пока не отправляйте — как подтвердите оплату, придёт напоминание сдать.',
        okLabel: 'Выставить счёт', noLabel: 'Отмена'
      }).then(function (res) {
        if (!res.ok) return;
        api('/admin/orders/' + st.sel + '/final_ready', {})
          .then(function (r) { afterOrder(r, r.ok ? '🏁 Счёт на остаток ушёл клиенту' : null); });
      });
      return;
    }
    if (t.closest('#agBTest')) {
      var btxt = (document.getElementById('agBText') || {}).value || '';
      if (!btxt.trim()) { toast('Напишите текст рассылки'); return; }
      api('/admin/broadcast', { text: btxt.trim(), test: true })
        .then(function (r) { toast(r.ok ? 'Отправили вам в Telegram — посмотрите глазами клиента' : 'Не получилось (бот не может вам написать?)'); });
      return;
    }
    if (t.closest('#agBSend')) {
      var btxt2 = (document.getElementById('agBText') || {}).value || '';
      var seg2 = (document.getElementById('agBSeg') || {}).value || 'all';
      if (!btxt2.trim()) { toast('Напишите текст рассылки'); return; }
      var cnt = ((document.getElementById('agBCount') || {}).textContent || '').replace(/\D/g, '') || '?';
      confirmDlg({
        title: 'Запустить рассылку на ' + cnt + ' получателей?',
        text: 'Сообщение уйдёт сразу и отозвать его будет нельзя. Лучше сначала «Отправить себе» и перечитать.',
        okLabel: 'Отправить всем', noLabel: 'Отмена', danger: true
      }).then(function (res) {
        if (!res.ok) return;
        api('/admin/broadcast', { text: btxt2.trim(), segment: seg2 })
          .then(function (r) {
            if (!r.ok) { toast(r.error === 'busy' ? 'Предыдущая рассылка ещё идёт' : 'Не получилось'); return; }
            toast('📣 Рассылка пошла — статус ниже');
            bcastStatus({ running: true, sent: 0, total: r.total, failed: 0 });
          });
      });
      return;
    }
    if (t.closest('#agDeliverMark')) {
      confirmDlg({
        title: 'Зафиксировать сдачу?',
        text: 'Клиент получит кнопки «принять / нужны правки». Используйте, если файлы уже отправили ему раньше (в группе или в боте).',
        okLabel: 'Сдать на проверку', noLabel: 'Отмена'
      }).then(function (res) {
        if (!res.ok) return;
        api('/admin/orders/' + st.sel + '/deliver', {})
          .then(function (r) { afterOrder(r, '📦 На проверке у клиента'); });
      });
      return;
    }
    if (t.closest('#agCancel2')) {
      confirmDlg({
        title: 'Закрыть заказ?',
        text: 'Клиент получит уведомление с причиной; применённые бонусы вернутся ему на счёт. Заказ можно будет возобновить.',
        input: 'textarea', placeholder: 'Причина (клиент её увидит) — можно оставить пустым',
        okLabel: 'Закрыть заказ', noLabel: 'Отмена', danger: true
      }).then(function (res) {
        if (!res.ok) return;
        api('/admin/orders/' + st.sel + '/cancel', { reason: res.value })
          .then(function (r) { afterOrder(r, 'Заказ закрыт'); });
      });
      return;
    }
    if (t.closest('#agResume')) {
      api('/admin/orders/' + st.sel + '/resume', {})
        .then(function (r) { afterOrder(r, 'Заказ возобновлён — клиент получил предложение 🔄'); });
      return;
    }
    var arch = t.closest('#agArch');
    if (arch) {
      api('/admin/orders/' + st.sel + '/archive', { on: arch.getAttribute('data-on') === '1' })
        .then(function (r) { afterOrder(r, arch.getAttribute('data-on') === '1' ? 'Убрано в архив 🗄' : 'Возвращено из архива'); });
      return;
    }
    if (t.closest('#agMsgSend')) {
      var ta = document.getElementById('agMsg');
      var txt = (ta.value || '').trim();
      if (!txt) return;
      api('/admin/orders/' + st.sel + '/message', { text: txt })
        .then(function (r) {
          if (r.ok) { toast(r.delivered_tg ? 'Доставлено в Telegram ✓' : 'Сохранено — клиент увидит в кабинете'); st.card = r.order; drawCard(); }
          else toast('Не отправилось');
        });
      return;
    }
    if (t.closest('#agNoteSave')) {
      api('/admin/orders/' + st.sel + '/note', { text: (document.getElementById('agNote') || {}).value || '' })
        .then(function (r) { toast(r.ok ? 'Заметка сохранена 📝' : 'Не получилось'); });
      return;
    }
    if (t.closest('#agReqSave')) {
      api('/admin/requisites', { text: (document.getElementById('agReq') || {}).value || '' })
        .then(function (r) { toast(r.ok ? 'Реквизиты сохранены ✓' : 'Не получилось'); });
      return;
    }
    /* --- отзывы --- */
    var rv = t.closest('[data-rv]');
    if (rv) {
      var ok = rv.getAttribute('data-ok') === '1';
      api('/admin/reviews/' + rv.getAttribute('data-rv') + '/moderate', { approve: ok })
        .then(function (r) {
          if (!r.ok) { toast('Не получилось'); return; }
          toast(ok ? 'Опубликован на сайте ✅' : 'Не публикуется 🚫');
          loadTab();
          S.api.get('/admin/overview').then(function (r2) { if (r2.ok) { st.ov = r2; drawNav(); } });
        });
      return;
    }
    /* --- клиенты --- */
    if (t.closest('#agBApply')) {
      var delta = parseInt((document.getElementById('agBDelta') || {}).value, 10);
      var note = (document.getElementById('agBNote') || {}).value || '';
      if (!delta) { toast('Введите сумму: 500 — начислить, -500 — списать'); return; }
      api('/admin/clients/' + st.csel + '/bonus', { delta: delta, note: note })
        .then(function (r) {
          if (r.ok) { toast('Проведено · баланс ' + money(r.balance)); loadClient(st.csel); }
          else toast(r.error === 'bonus_empty' ? 'У клиента нет столько бонусов' : 'Не получилось');
        });
      return;
    }
    if (t.closest('#agBan')) {
      var on = t.closest('#agBan').getAttribute('data-on') === '1';
      confirmDlg({
        title: on ? 'Заблокировать клиента?' : 'Снять блокировку?',
        text: on ? 'Клиент не сможет отправлять новые заявки с сайта. Текущие заказы останутся видны.'
                 : 'Клиент снова сможет оформлять заявки.',
        okLabel: on ? 'Заблокировать' : 'Разблокировать', noLabel: 'Отмена', danger: on
      }).then(function (res) {
        if (!res.ok) return;
        api('/admin/clients/' + st.csel + '/ban', { banned: on })
          .then(function (r) { if (r.ok) { toast(on ? 'Заблокирован ⛔️' : 'Разблокирован ✓'); loadClient(st.csel); loadTab(); } });
      });
      return;
    }
  });

  root.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'agBSeg') { bcastRefresh(); return; }
    if (e.target && e.target.id === 'agSort') { st.sort = e.target.value; drawList(); return; }
    if (e.target && e.target.id === 'agDeliverFile') { uploadAdminFile(e.target, true); e.target.value = ''; }
    if (e.target && e.target.id === 'agPlainFile') { uploadAdminFile(e.target, false); e.target.value = ''; }
    if (e.target && e.target.id === 'agChatFile') { uploadAdminFile(e.target, false); e.target.value = ''; }
    if (e.target && e.target.id === 'agPlanSel' && st.card && st.card.price) {
      var stages = parseInt(e.target.value, 10);
      api('/admin/orders/' + st.sel + '/plan', { stages: stages })
        .then(function (r) {
          afterOrder(r, r.ok ? 'План: ' + PLAN_LBL[stages] : null);
          if (!r.ok && r.error === 'plan_locked') toast('Этапы уже пошли — план не поменять');
        });
    }
  });

  /* одноразовый вход по ссылке из бота: admin.html#alk=<ключ> (команда /panel) */
  function tryLinkLogin(next) {
    var mch = (location.hash || '').match(/alk=([A-Za-z0-9_-]+)/);
    if (!mch) { next(); return; }
    history.replaceState(null, '', location.pathname);
    S.api.post('/admin/login', { key: mch[1] }).then(function (r) {
      if (r.ok && r.token) {
        S.api.setToken(r.token);
        if (S.api.setUser) S.api.setUser(r.user || null);
        toast('Вы вошли как мастер ✓');
      } else {
        toast(r.error === 'bad_key'
          ? 'Ссылка входа устарела — запросите новую: /panel в боте'
          : 'Не получилось войти по ссылке — попробуйте /panel ещё раз');
      }
      next();
    });
  }

  root.addEventListener('keydown', function (e) {
    if (e.target && e.target.id === 'agQ' && e.key === 'Enter') {
      st.q = e.target.value.trim();
      st.listLimit = 40;
      loadTab();
    }
    if (e.target && e.target.id === 'agMsg' && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      var btn = document.getElementById('agMsgSend');
      if (btn) btn.click();
    }
  });

  tryLinkLogin(gate);
}
if (document.prerendering) {
  document.addEventListener('prerenderingchange', initGodEye, { once: true });
} else {
  initGodEye();
}
