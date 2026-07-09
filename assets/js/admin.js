/* ============================================================
   ГЛАЗ БОГА v2 — рабочий стол мастера поверх /api/admin/*.
   Вкладки: Заказы · Клиенты · Лиды · Настройки.
   Карточка заказа показывает всё: тариф сопровождения, цену
   с сайта, бонусы клиента, рефералов, согласие, источник.
   Доступ: Telegram-вход; сервер пускает только ADMIN_IDS.
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
  var st = {
    tab: 'orders', filter: 'active', q: '',
    orders: [], sel: null, card: null,
    clients: [], csel: null, ccard: null,
    ov: null, timer: null
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
  function confirmDlg(opts) {
    return S.confirm ? S.confirm(opts)
      : Promise.resolve({ ok: window.confirm(opts.title || 'Подтвердить?'), value: '' });
  }

  /* ---------------- вход/гейт ---------------- */
  function tplLogin(pending, denied) {
    return '<div class="ag-login sheet sheet-pad stacked">' +
      '<p class="caps">Глаз бога</p>' +
      '<h1 style="font-size:26px;margin:6px 0 10px">Рабочий стол мастера</h1>' +
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
      renderPanel();
      loadTab(true);
      if (!st.timer) st.timer = setInterval(function () {
        if (!document.hidden) refreshSilent();
      }, 30000);
    });
  }

  function refreshSilent() {
    S.api.get('/admin/overview').then(function (r) { if (r.ok) { st.ov = r; drawTiles(); } });
    if (st.tab === 'orders') {
      S.api.get('/admin/orders?' + listQuery()).then(function (r) {
        if (r.ok) { st.orders = r.orders; drawList(); }
      });
      if (st.sel) loadCard(st.sel, true);
    }
  }

  /* ---------------- данные ---------------- */
  function listQuery() {
    return st.q ? 'q=' + encodeURIComponent(st.q) : 'status=' + encodeURIComponent(st.filter);
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
    } else {
      drawBody();
      if (st.tab === 'leads') loadLeads();
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
      st.card = r.order;
      drawCard();
      drawList();
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
  function loadLeads() {
    S.api.get('/admin/leads').then(function (r) {
      var box = document.getElementById('agLeads');
      if (!box || !r.ok) return;
      box.innerHTML = r.leads.length ? r.leads.map(function (l) {
        return '<div class="ag-lead"><b>#' + l.id + '</b> ' + esc(l.name || '—') +
          ' · <span class="mono">' + esc(l.contact || '') + '</span>' +
          (l.message ? '<br><span class="petit">' + esc(l.message).slice(0, 160) + '</span>' : '') +
          ' <span class="petit">· ' + esc(l.status) + ' · ' + dt(l.at) + '</span></div>';
      }).join('') : '<div class="ag-empty">Лидов пока нет</div>';
    });
  }

  /* ---------------- каркас ---------------- */
  function render(html) { root.innerHTML = html; }

  function renderPanel() {
    var u = S.api.user() || {};
    render(
      '<div class="ag-head"><h1>👁 Глаз бога</h1>' +
      '<div class="ag-user"><span>' + esc(u.name || 'мастер') + '</span>' +
      '<a class="link" href="dashboard.html">кабинет</a>' +
      '<button type="button" class="ag-chip" id="agLogout">выйти</button></div></div>' +
      '<div class="ag-tiles" id="agTiles"></div>' +
      '<div class="ag-tabs" id="agTabs"></div>' +
      '<div id="agBody"></div>');
    drawTiles();
    drawTabs();
    drawBody();
  }

  function drawTiles() {
    var box = document.getElementById('agTiles');
    if (!box || !st.ov) return;
    var by = st.ov.by_status || {};
    var active = ['new', 'priced', 'prepay', 'work', 'check', 'fix']
      .reduce(function (s, k) { return s + (by[k] || 0); }, 0);
    box.innerHTML =
      tile(by.new || 0, '🆕 новые', by.new ? 'warn' : '') +
      tile(active, 'активные') +
      tile(st.ov.week.new, 'заявок за 7 дн') +
      tile(money(st.ov.month.revenue) + ' ₽', 'выручка 30 дн') +
      tile(st.ov.users, 'клиентов') +
      tile(st.ov.leads, 'лидов');
    function tile(n, l, cls) {
      return '<div class="ag-tile ' + (cls || '') + '"><div class="t-num">' + n + '</div><div class="t-lbl">' + l + '</div></div>';
    }
  }

  function drawTabs() {
    var box = document.getElementById('agTabs');
    if (!box) return;
    var tabs = [['orders', '🗂 Заказы'], ['clients', '👥 Клиенты'], ['leads', '🌐 Лиды'], ['settings', '⚙️ Настройки']];
    box.innerHTML = tabs.map(function (t) {
      return '<button type="button" class="ag-tab' + (st.tab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
    }).join('');
  }

  function drawBody() {
    var box = document.getElementById('agBody');
    if (!box) return;
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
    } else if (st.tab === 'clients') {
      box.innerHTML =
        '<div class="ag-split">' +
          '<div class="ag-list" id="agCList"></div>' +
          '<div class="ag-card" id="agCCard"><div class="ag-empty">Выберите клиента слева</div></div>' +
        '</div>';
      drawClientList();
      if (st.ccard) drawClientCard();
    } else if (st.tab === 'leads') {
      box.innerHTML =
        '<p class="petit" style="margin-bottom:10px">Обращения с сайта без оформленного заказа. ' +
        'Свяжитесь по контакту — эти люди уже проявили интерес.</p>' +
        '<div id="agLeads" style="border:1px solid var(--hairline);border-radius:var(--r);max-height:60vh;overflow-y:auto"></div>';
    } else {
      drawSettings(box);
    }
  }

  /* ---------------- вкладка «Заказы» ---------------- */
  function drawFilters() {
    var box = document.getElementById('agFilters');
    if (!box) return;
    var chips = [['active', 'Активные'], ['', 'Все']].concat(
      Object.keys(ST_META).map(function (k) { return [k, stMeta(k)[0] + ' ' + stMeta(k)[1]]; }));
    box.innerHTML = chips.map(function (c) {
      return '<button type="button" class="ag-chip' + (st.filter === c[0] && !st.q ? ' on' : '') + '" data-f="' + c[0] + '">' + c[1] + '</button>';
    }).join('') + '<input class="ag-search" id="agQ" placeholder="Поиск: №, тема, ник… (Enter)" value="' + esc(st.q) + '">';
  }

  function drawList() {
    var box = document.getElementById('agList');
    if (!box) return;
    if (!st.orders.length) { box.innerHTML = '<div class="ag-empty">Пусто</div>'; return; }
    box.innerHTML = st.orders.map(function (o) {
      var m = stMeta(o.status);
      var who = o.client.guest ? ('👻 ' + o.client.name) : (o.client.name + (o.client.username ? ' @' + o.client.username : ''));
      return '<button type="button" class="ag-row' + (o.id === st.sel ? ' sel' : '') + '" data-id="' + o.id + '">' +
        '<span class="r-no">№' + o.id + '</span>' +
        '<span class="r-main"><span class="r-t">' + m[0] + ' ' + esc(o.work_label || '') + '</span>' +
        '<span class="r-s">' + esc(who) + ' · ' + dt(o.created_at) + '</span></span>' +
        (o.unread ? '<span class="r-unrd">' + o.unread + '</span>' : '') +
        '<span class="r-price">' + (o.price ? money(o.price) + '₽' : (o.quote_low ? '~' + money(o.quote_low) : '')) + '</span>' +
        '</button>';
    }).join('');
  }

  function intelBlock(o) {
    var ci = o.client_intel;
    var rows = [];
    if (o.tier_label) rows.push(['⭐ Сопровождение', o.tier_label]);
    if (o.quote_low) rows.push(['🧮 Сайт показал', money(o.quote_low) + ' – ' + money(o.quote_high) + ' ₽']);
    if (o.price) {
      var pr = money(o.price) + ' ₽';
      if (o.bonus_spent) pr += ' · бонусами −' + money(o.bonus_spent) + ' → деньгами ' + money(o.due_total) + ' ₽';
      rows.push(['💰 Цена', pr]);
    }
    if (ci) {
      rows.push(['💎 Бонусы клиента', money(ci.bonus.balance) +
        (ci.bonus.expiring.length ? ' (сгорит ' + ci.bonus.expiring.map(function (e) { return e.amount + ' — ' + dt(e.at).slice(0, 5); }).join(', ') + ')' : '')]);
      rows.push(['🤝 Рефералы', ci.referrals + (ci.referrer ? ' · пришёл от ' + esc(ci.referrer.name || ci.referrer.id) : '')]);
      rows.push(['📇 Клиент с', dt(ci.since) + (ci.welcome_at ? ' · велком получен' : ' · велком не получал')]);
      if (ci.banned) rows.push(['⛔️', '<b style="color:var(--wax)">В чёрном списке</b>']);
    }
    if (o.consent_at) rows.push(['📋 Согласие', dt(o.consent_at) + ' · ' + esc(o.consent_doc || '')]);
    if (o.page) rows.push(['🔗 Источник', esc(o.page)]);
    if (o.cancel_reason) rows.push(['🚫 Причина отказа', '«' + esc(o.cancel_reason) + '»']);
    var paid = (o.payments || []).filter(function (p) { return p.status === 'paid'; });
    if (paid.length) rows.push(['💳 Оплачено', paid.map(function (p) {
      return money(p.amount) + ' ₽ (' + (p.kind === 'prepay' ? 'предоплата' : 'остаток') + ', ' + p.method + ')';
    }).join(' · ')]);
    var claimed = (o.payments || []).filter(function (p) { return p.status === 'claimed'; });
    if (claimed.length) rows.push(['⏳ Клиент отметил оплату', claimed.map(function (p) {
      return money(p.amount) + ' ₽ — проверьте поступление и подтвердите';
    }).join(' · ')]);
    if (!rows.length) return '';
    return '<div class="ag-intel">' + rows.map(function (r) {
      return '<div class="ai-row"><span class="ai-k">' + r[0] + '</span><span class="ai-v">' + r[1] + '</span></div>';
    }).join('') + '</div>';
  }

  function drawCard() {
    var box = document.getElementById('agCard');
    var o = st.card;
    if (!box || !o) return;
    var m = stMeta(o.status);
    var who = o.client.guest
      ? '👻 Гость: <b>' + esc(o.client.name) + '</b>' + (o.client.contact ? ' · <span class="mono">' + esc(o.client.contact) + '</span>' : '') + ' <span class="petit">(без Telegram — пишите ему здесь, он увидит в кабинете; контакт выше — для ручной связи)</span>'
      : '👤 <b>' + esc(o.client.name) + '</b>' + (o.client.username ? ' · @' + esc(o.client.username) : '') + ' · <button type="button" class="link ag-linkbtn" data-open-client="' + o.client.id + '">карточка клиента</button>';
    var feed = [];
    (o.history || []).forEach(function (h) { feed.push({ at: h.at, sys: true, text: h.text }); });
    (o.messages || []).forEach(function (x) {
      feed.push({ at: x.at, who: x.from, text: x.text || ('📎 ' + (x.file_name || 'вложение')) });
    });
    feed.sort(function (a, b) { return a.at < b.at ? -1 : 1; });
    var needConfirm = (o.payments || []).some(function (p) { return p.status === 'claimed'; }) ||
      o.status === 'prepay' || o.status === 'priced' || o.status === 'check';

    box.innerHTML =
      '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline">' +
      '<span class="mono petit">Заказ №' + o.id + ' · ' + esc(o.source || '') + '</span>' +
      '<span class="tag tag-ink">' + m[0] + ' ' + m[1] + '</span></div>' +
      '<h2>' + esc(o.work_label || '') + '</h2>' +
      (o.topic ? '<p class="petit" style="font-style:italic">«' + esc(o.topic) + '»</p>' : '') +
      '<p class="petit">' + who + '</p>' +
      '<p class="petit">' + (o.deadline_text ? '📅 ' + esc(o.deadline_text) + ' · ' : '') + 'создан ' + dt(o.created_at) + '</p>' +
      (o.details ? '<p class="petit">📋 ' + esc(o.details) + '</p>' : '') +
      intelBlock(o) +

      '<div class="ag-sec"><span class="caps">Цена и оплата</span>' +
      '<div class="ag-actrow"><input type="number" id="agPrice" placeholder="цена ₽" value="' + (o.price || '') + '">' +
      '<input type="number" id="agPrepay" placeholder="предоплата" value="' + (o.prepay || '') + '">' +
      '<button type="button" class="btn btn-wax" id="agPriceSend">Отправить предложение</button>' +
      (needConfirm ? '<button type="button" class="btn btn-ink" id="agPayConfirm">✅ Оплата получена</button>' : '') +
      '</div>' +
      '<p class="ag-note">Предложение уйдёт клиенту с кнопками — в Telegram и в кабинет. «Оплата получена» сама двинет статус и начислит кэшбэк.</p></div>' +

      '<div class="ag-sec"><span class="caps">Статус</span><div class="ag-actrow">' +
      Object.keys(ST_META).map(function (k) {
        return '<button type="button" class="ag-stbtn' + (o.status === k ? ' on' : '') + '" data-st="' + k + '">' + stMeta(k)[0] + ' ' + stMeta(k)[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="ag-actrow" style="margin-top:8px">' +
      (o.status === 'cancel'
        ? '<button type="button" class="btn btn-line" id="agResume">🔄 Возобновить заказ</button>'
        : '<button type="button" class="btn btn-line" id="agCancel2">🚫 Закрыть с причиной…</button>') +
      '</div></div>' +

      '<div class="ag-sec"><span class="caps">Переписка</span><div class="ag-feed" id="agFeed">' +
      (feed.length ? feed.map(function (f) {
        if (f.sys) return '<div class="ag-sys">' + esc(f.text) + ' · ' + dt(f.at) + '</div>';
        var me = f.who === 'master';
        return '<div class="ag-m' + (me ? ' master' : '') + '"><span class="who">' + (me ? 'Вы' : 'Клиент') + ' · ' + dt(f.at) + '</span><div class="txt">' + esc(f.text) + '</div></div>';
      }).join('') : '<div class="ag-sys">пока пусто</div>') + '</div>' +
      '<div class="ag-actrow" style="margin-top:10px"><textarea id="agMsg" rows="2" placeholder="Сообщение клиенту… (Cmd/Ctrl+Enter — отправить)"></textarea>' +
      '<button type="button" class="btn btn-wax" id="agMsgSend">Отправить</button></div>' +
      '<p class="ag-note">Файлы клиенту удобнее отправлять в ветке заказа в рабочей группе или из бота («Сдать работу»).</p></div>' +

      '<div class="ag-sec ag-files"><span class="caps">Файлы (' + (o.files || []).length + ')</span>' +
      ((o.files || []).length ? o.files.map(function (f) {
        return '<div class="petit">📎 ' + esc(f.name) + ' · ' + (f.from === 'master' ? 'от вас' : 'от клиента') +
          '<a class="link" href="' + S.api.base + '/orders/' + o.id + '/file/' + f.id + '?session=' + encodeURIComponent(S.api.token()) + '" download>скачать</a></div>';
      }).join('') : '<p class="ag-note">Файлов пока нет.</p>') + '</div>' +

      '<div class="ag-sec"><span class="caps">Заметка (видна только вам)</span>' +
      '<div class="ag-actrow"><textarea id="agNote" rows="2">' + esc(o.admin_note || '') + '</textarea>' +
      '<button type="button" class="btn btn-line" id="agNoteSave">Сохранить</button></div></div>' +

      '<div class="ag-sec"><span class="caps">События</span><div class="ag-ev">' +
      (o.events || []).map(function (e) {
        return dt(e.at) + ' · ' + esc(e.kind) + (e.data ? ' — ' + esc(String(e.data).slice(0, 60)) : '');
      }).join('<br>') + '</div></div>';
    var feedBox = document.getElementById('agFeed');
    if (feedBox) feedBox.scrollTop = feedBox.scrollHeight;
  }

  /* ---------------- вкладка «Клиенты» ---------------- */
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
      '<p class="petit">с нами с ' + dt(c.since) + ' · был ' + dt(c.last_seen) +
      (c.welcome_at ? ' · велком-бонус получен' : '') + '</p>' +
      (c.referrer ? '<p class="petit">🤝 пришёл по приглашению: ' + esc(c.referrer.name || c.referrer.id) + '</p>' : '') +
      (c.referrals.length ? '<p class="petit">🤝 привёл: ' + c.referrals.map(function (r) { return esc(r.name || r.id); }).join(', ') + '</p>' : '') +

      '<div class="ag-sec"><span class="caps">Бонусный счёт · ' + money(c.bonus.balance) + '</span>' +
      (c.bonus.expiring.length ? '<p class="petit">⏳ сгорает: ' + c.bonus.expiring.map(function (e) { return e.amount + ' — ' + dt(e.at).slice(0, 5); }).join(', ') + '</p>' : '') +
      '<div class="ag-actrow"><input type="number" id="agBDelta" placeholder="± сумма">' +
      '<input type="text" id="agBNote" placeholder="комментарий (клиент увидит)">' +
      '<button type="button" class="btn btn-line" id="agBApply">Провести</button></div>' +
      '<p class="ag-note">Плюс — начислить (срок 90 дней), минус — списать. Начисление придёт клиенту уведомлением.</p>' +
      '<div class="ag-ev" style="margin-top:10px">' +
      (c.ledger || []).map(function (r) {
        var sign = r.delta > 0 ? '+' : '';
        return dt(r.at) + ' · <b>' + sign + r.delta + '</b> · ' + esc(r.label) + (r.note ? ' — ' + esc(r.note) : '');
      }).join('<br>') + '</div></div>' +

      '<div class="ag-sec"><span class="caps">Заказы (' + c.orders.length + ')</span>' +
      (c.orders.length ? c.orders.map(function (o) {
        var m = stMeta(o.status);
        return '<div class="petit">' + m[0] + ' №' + o.id + ' · ' + esc(o.work_label || '') +
          (o.price ? ' · ' + money(o.price) + ' ₽' : '') +
          ' · <button type="button" class="link ag-linkbtn" data-open-order="' + o.id + '">открыть</button></div>';
      }).join('') : '<p class="ag-note">Заказов нет.</p>') + '</div>' +

      '<div class="ag-sec"><span class="caps">Доступ</span><div class="ag-actrow">' +
      '<button type="button" class="btn ' + (c.banned ? 'btn-line' : 'btn-wax') + '" id="agBan" data-on="' + (c.banned ? '0' : '1') + '">' +
      (c.banned ? 'Снять блокировку' : '⛔️ Заблокировать клиента') + '</button></div>' +
      '<p class="ag-note">Блокировка закрывает приём новых заявок с сайта от этого аккаунта.</p></div>';
  }

  /* ---------------- вкладка «Настройки» ---------------- */
  function drawSettings(box) {
    var ov = st.ov || {};
    box.innerHTML =
      '<div class="ag-card" style="max-width:640px">' +
      '<div class="ag-sec" style="border-top:0;margin-top:0;padding-top:0"><span class="caps">Реквизиты для переводов</span>' +
      '<div class="ag-actrow"><textarea id="agReq" rows="3" placeholder="Сбер: 0000 0000 0000 0000 (Имя О.)&#10;СБП: +7 900 000-00-00">' + esc(ov.requisites || '') + '</textarea>' +
      '<button type="button" class="btn btn-line" id="agReqSave">Сохранить</button></div>' +
      '<p class="ag-note">Эти реквизиты видят клиенты при оплате переводом — в боте и в кабинете.</p></div>' +

      '<div class="ag-sec"><span class="caps">Онлайн-оплата картой</span>' +
      '<p class="petit">' + (ov.pay_online
        ? '✅ Онлайн-касса подключена — клиенты могут платить картой/СБП, статусы двигаются сами.'
        : 'Пока выключена. Основной путь — <b>Robokassa</b> (работает с самозанятыми, «Робочеки СМЗ» сами шлют чек НПД): ' +
          'зарегистрируйте магазин на <b>robokassa.com</b>, в настройках магазина укажите Result URL ' +
          '<span class="mono">https://akademsalon.ru/api/pay/robokassa</span> (метод POST), ' +
          'Success/Fail URL — <span class="mono">…/dashboard.html</span>, возьмите «Идентификатор магазина» и «Пароль #1/#2» ' +
          'и добавьте в <span class="mono">/root/salon_bot/.env</span> строки ROBOKASSA_LOGIN, ROBOKASSA_PASS1, ROBOKASSA_PASS2, ' +
          'затем перезапустите бота (systemctl restart salon-bot-v2). Для теста: тестовые пароли + ROBOKASSA_TEST=1. ' +
          'Альтернатива — ЮKassa (YOOKASSA_SHOP_ID и YOOKASSA_SECRET). До этого работает оплата переводом с подтверждением в одну кнопку.') + '</p></div>' +

      '<div class="ag-sec"><span class="caps">Рабочая группа заказов</span>' +
      '<p class="petit">' + (ov.group_forum
        ? '✅ Темы включены: каждый заказ — отдельная ветка в группе. Пишите в ветке — клиент получит ответ.'
        : 'Группа подключена (id <span class="mono">' + esc(String(ov.group_chat_id || '')) + '</span>), но «Темы» ещё не включены. ' +
          'Откройте профиль группы → «Изменить» → включите <b>«Темы»</b> — и каждый заказ станет отдельной веткой. ' +
          'Пока темы выключены, заказы приходят в общую ленту с метками #заказ.') + '</p>' +
      '<p class="ag-note">Подсказка по работе в группе — команда /help внутри группы.</p></div>' +
      '</div>';
  }

  /* ---------------- события ---------------- */
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
    if (tab) { st.tab = tab.getAttribute('data-tab'); drawTabs(); loadTab(true); return; }

    var row = t.closest('.ag-row[data-id]');
    if (row) { loadCard(parseInt(row.getAttribute('data-id'), 10)); return; }
    var crow = t.closest('.ag-row[data-cid]');
    if (crow) { loadClient(parseInt(crow.getAttribute('data-cid'), 10)); return; }
    var oc = t.closest('[data-open-client]');
    if (oc) { st.tab = 'clients'; st.csel = parseInt(oc.getAttribute('data-open-client'), 10); drawTabs(); loadTab(); return; }
    var oo = t.closest('[data-open-order]');
    if (oo) { st.tab = 'orders'; st.sel = parseInt(oo.getAttribute('data-open-order'), 10); drawTabs(); loadTab(); return; }

    var chip = t.closest('.ag-chip[data-f]');
    if (chip) { st.filter = chip.getAttribute('data-f'); st.q = ''; loadTab(); return; }

    if (t.closest('#agPriceSend')) {
      var price = parseInt((document.getElementById('agPrice') || {}).value, 10);
      var prepay = parseInt((document.getElementById('agPrepay') || {}).value, 10);
      if (!price || price <= 0) { toast('Введите цену'); return; }
      S.api.post('/admin/orders/' + st.sel + '/price', { price: price, prepay: prepay || undefined })
        .then(function (r) { if (r.ok) { toast('Предложение ушло клиенту 💰'); st.card = r.order; loadCard(st.sel); } else toast('Не получилось'); });
      return;
    }
    if (t.closest('#agPayConfirm')) {
      confirmDlg({
        title: 'Подтвердить оплату?',
        text: 'Проверьте поступление денег. Подтверждение двинет статус заказа и начислит клиенту кэшбэк — отменить будет нельзя.',
        okLabel: 'Деньги пришли — подтвердить', noLabel: 'Отмена'
      }).then(function (res) {
        if (!res.ok) return;
        S.api.post('/admin/orders/' + st.sel + '/confirm_payment', {})
          .then(function (r) {
            if (r.ok) { toast('Оплата подтверждена ✓'); if (S.stamp) S.stamp('Оплачено'); st.card = r.order; drawCard(); refreshSilent(); }
            else toast('Не получилось');
          });
      });
      return;
    }
    var stb = t.closest('.ag-stbtn');
    if (stb) {
      S.api.post('/admin/orders/' + st.sel + '/status', { status: stb.getAttribute('data-st') })
        .then(function (r) { if (r.ok) { toast('Статус обновлён'); loadCard(st.sel); refreshSilent(); } else toast('Не получилось'); });
      return;
    }
    if (t.closest('#agCancel2')) {
      confirmDlg({
        title: 'Закрыть заказ?',
        text: 'Клиент получит уведомление; применённые бонусы вернутся ему на счёт. Заказ можно будет возобновить.',
        input: 'textarea', placeholder: 'Причина (клиент её увидит) — можно оставить пустым',
        okLabel: 'Закрыть заказ', noLabel: 'Отмена', danger: true
      }).then(function (res) {
        if (!res.ok) return;
        S.api.post('/admin/orders/' + st.sel + '/cancel', { reason: res.value })
          .then(function (r) { if (r.ok) { toast('Заказ закрыт'); st.card = r.order; drawCard(); } else toast('Не получилось'); });
      });
      return;
    }
    if (t.closest('#agResume')) {
      S.api.post('/admin/orders/' + st.sel + '/resume', {})
        .then(function (r) { if (r.ok) { toast('Заказ возобновлён 🔄'); st.card = r.order; drawCard(); refreshSilent(); } else toast('Не получилось'); });
      return;
    }
    if (t.closest('#agMsgSend')) {
      var ta = document.getElementById('agMsg');
      var txt = (ta.value || '').trim();
      if (!txt) return;
      S.api.post('/admin/orders/' + st.sel + '/message', { text: txt })
        .then(function (r) {
          if (r.ok) { ta.value = ''; toast(r.delivered_tg ? 'Доставлено в Telegram ✓' : 'Сохранено — клиент увидит в кабинете'); loadCard(st.sel); }
          else toast('Не отправилось');
        });
      return;
    }
    if (t.closest('#agNoteSave')) {
      S.api.post('/admin/orders/' + st.sel + '/note', { text: (document.getElementById('agNote') || {}).value || '' })
        .then(function (r) { toast(r.ok ? 'Заметка сохранена 📝' : 'Не получилось'); });
      return;
    }
    if (t.closest('#agReqSave')) {
      S.api.post('/admin/requisites', { text: (document.getElementById('agReq') || {}).value || '' })
        .then(function (r) { toast(r.ok ? 'Реквизиты сохранены ✓' : 'Не получилось'); });
      return;
    }
    if (t.closest('#agBApply')) {
      var delta = parseInt((document.getElementById('agBDelta') || {}).value, 10);
      var note = (document.getElementById('agBNote') || {}).value || '';
      if (!delta) { toast('Введите сумму: 500 — начислить, -500 — списать'); return; }
      S.api.post('/admin/clients/' + st.csel + '/bonus', { delta: delta, note: note })
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
        S.api.post('/admin/clients/' + st.csel + '/ban', { banned: on })
          .then(function (r) { if (r.ok) { toast(on ? 'Заблокирован ⛔️' : 'Разблокирован ✓'); loadClient(st.csel); loadTab(); } });
      });
      return;
    }
  });

  root.addEventListener('keydown', function (e) {
    if (e.target && e.target.id === 'agQ' && e.key === 'Enter') {
      st.q = e.target.value.trim();
      loadTab();
    }
    if (e.target && e.target.id === 'agMsg' && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      var btn = document.getElementById('agMsgSend');
      if (btn) btn.click();
    }
  });

  gate();
}
if (document.prerendering) {
  document.addEventListener('prerenderingchange', initGodEye, { once: true });
} else {
  initGodEye();
}
