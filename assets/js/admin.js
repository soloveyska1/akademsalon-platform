/* ============================================================
   ГЛАЗ БОГА — рабочий стол мастера поверх /api/admin/*.
   Доступ: Telegram-вход; сервер пускает только ADMIN_IDS (403 остальным).
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
  var st = { filter: 'active', q: '', orders: [], sel: null, card: null, ov: null, timer: null };

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
      loadOrders(true);
      if (!st.timer) st.timer = setInterval(function () {
        if (!document.hidden) refreshSilent();
      }, 30000);
    });
  }

  function refreshSilent() {
    S.api.get('/admin/overview').then(function (r) { if (r.ok) { st.ov = r; drawTiles(); } });
    S.api.get('/admin/orders?' + listQuery()).then(function (r) {
      if (r.ok) { st.orders = r.orders; drawList(); }
    });
  }

  /* ---------------- данные ---------------- */
  function listQuery() {
    return st.q ? 'q=' + encodeURIComponent(st.q) : 'status=' + encodeURIComponent(st.filter);
  }
  function loadOrders(openFirst) {
    S.api.get('/admin/orders?' + listQuery()).then(function (r) {
      if (!r.ok) return;
      st.orders = r.orders;
      if (openFirst && st.orders.length && !st.sel) st.sel = st.orders[0].id;
      renderPanel();
      if (st.sel) loadCard(st.sel);
      loadLeads();
    });
  }
  function loadCard(id) {
    st.sel = id;
    S.api.get('/admin/orders/' + id).then(function (r) {
      if (!r.ok) return;
      st.card = r.order;
      drawCard();
      drawList();
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

  /* ---------------- отрисовка ---------------- */
  function render(html) { root.innerHTML = html; }

  function renderPanel() {
    var u = S.api.user() || {};
    render(
      '<div class="ag-head"><h1>👁 Глаз бога</h1>' +
      '<div class="ag-user"><span>' + esc(u.name || 'мастер') + '</span>' +
      '<a class="link" href="dashboard.html">кабинет</a>' +
      '<button type="button" class="ag-chip" id="agLogout">выйти</button></div></div>' +
      '<div class="ag-tiles" id="agTiles"></div>' +
      '<div class="ag-filters" id="agFilters"></div>' +
      '<div class="ag-split">' +
        '<div><div class="ag-list" id="agList"></div>' +
          '<div class="ag-sec"><span class="caps">Лиды с сайта</span><div id="agLeads" style="border:1px solid var(--hairline);border-radius:var(--r);max-height:260px;overflow-y:auto"></div></div>' +
          '<div class="ag-sec"><span class="caps">Реквизиты оплаты</span>' +
            '<div class="ag-actrow"><textarea id="agReq" rows="3" placeholder="Сбер: 0000 0000 0000 0000 (Имя О.)&#10;СБП: +7 900 000-00-00">' + esc(st.ov.requisites || '') + '</textarea>' +
            '<button type="button" class="btn btn-line" id="agReqSave">Сохранить</button></div></div>' +
        '</div>' +
        '<div class="ag-card" id="agCard"><div class="ag-empty">Выберите заказ слева</div></div>' +
      '</div>');
    drawTiles();
    drawFilters();
    drawList();
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

  function drawFilters() {
    var box = document.getElementById('agFilters');
    if (!box) return;
    var chips = [['active', 'Активные'], ['', 'Все']].concat(
      Object.keys(ST_META).map(function (k) { return [k, stMeta(k)[0] + ' ' + stMeta(k)[1]]; }));
    box.innerHTML = chips.map(function (c) {
      return '<button type="button" class="ag-chip' + (st.filter === c[0] && !st.q ? ' on' : '') + '" data-f="' + c[0] + '">' + c[1] + '</button>';
    }).join('') + '<input class="ag-search" id="agQ" placeholder="Поиск: №, тема, ник…" value="' + esc(st.q) + '">';
  }

  function drawList() {
    var box = document.getElementById('agList');
    if (!box) return;
    if (!st.orders.length) { box.innerHTML = '<div class="ag-empty">Пусто</div>'; return; }
    box.innerHTML = st.orders.map(function (o) {
      var m = stMeta(o.status);
      var who = o.client.guest ? (o.client.name + ' · сайт') : (o.client.name + (o.client.username ? ' @' + o.client.username : ''));
      return '<button type="button" class="ag-row' + (o.id === st.sel ? ' sel' : '') + '" data-id="' + o.id + '">' +
        '<span class="r-no">№' + o.id + '</span>' +
        '<span class="r-main"><span class="r-t">' + m[0] + ' ' + esc(o.work_label || '') + '</span>' +
        '<span class="r-s">' + esc(who) + ' · ' + dt(o.created_at) + '</span></span>' +
        (o.unread ? '<span class="r-unrd">' + o.unread + '</span>' : '') +
        '<span class="r-price">' + (o.price ? money(o.price) + '₽' : (o.quote_low ? '~' + money(o.quote_low) : '')) + '</span>' +
        '</button>';
    }).join('');
  }

  function drawCard() {
    var box = document.getElementById('agCard');
    var o = st.card;
    if (!box || !o) return;
    var m = stMeta(o.status);
    var who = o.client.guest
      ? '👤 Гость: <b>' + esc(o.client.name) + '</b>' + (o.client.contact ? ' · <span class="mono">' + esc(o.client.contact) + '</span>' : '') + ' <span class="petit">(без Telegram — всё увидит в кабинете)</span>'
      : '👤 <b>' + esc(o.client.name) + '</b>' + (o.client.username ? ' · @' + esc(o.client.username) : '') + ' · id <span class="mono">' + o.client.id + '</span>';
    var feed = [];
    (o.history || []).forEach(function (h) { feed.push({ at: h.at, sys: true, text: h.text }); });
    (o.messages || []).forEach(function (x) {
      feed.push({ at: x.at, who: x.from, text: x.text || ('📎 ' + (x.file_name || 'вложение')) });
    });
    feed.sort(function (a, b) { return a.at < b.at ? -1 : 1; });
    box.innerHTML =
      '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline">' +
      '<span class="mono petit">Заказ №' + o.id + ' · ' + esc(o.source || '') + '</span>' +
      '<span class="tag tag-ink">' + m[0] + ' ' + m[1] + '</span></div>' +
      '<h2>' + esc(o.work_label || '') + '</h2>' +
      (o.topic ? '<p class="petit" style="font-style:italic">«' + esc(o.topic) + '»</p>' : '') +
      '<p class="petit">' + who + '</p>' +
      '<p class="petit">' + (o.deadline_text ? '📅 ' + esc(o.deadline_text) + ' · ' : '') + 'создан ' + dt(o.created_at) + '</p>' +
      (o.details ? '<p class="petit">📋 ' + esc(o.details) + '</p>' : '') +
      (o.quote_low ? '<p class="petit">🧮 смета сайта: ' + money(o.quote_low) + '–' + money(o.quote_high) + ' ₽</p>' : '') +

      '<div class="ag-sec"><span class="caps">Цена' + (o.price ? ' · сейчас ' + money(o.price) + ' ₽ (предоплата ' + money(o.prepay) + ')' : '') + '</span>' +
      '<div class="ag-actrow"><input type="number" id="agPrice" placeholder="цена ₽" value="' + (o.price || '') + '">' +
      '<input type="number" id="agPrepay" placeholder="предоплата" value="' + (o.prepay || '') + '">' +
      '<button type="button" class="btn btn-wax" id="agPriceSend">Отправить предложение</button></div>' +
      '<p class="ag-note">Клиент получит цену с кнопками — в Telegram и в кабинете.</p></div>' +

      '<div class="ag-sec"><span class="caps">Статус</span><div class="ag-actrow">' +
      Object.keys(ST_META).map(function (k) {
        return '<button type="button" class="ag-stbtn' + (o.status === k ? ' on' : '') + '" data-st="' + k + '">' + stMeta(k)[0] + ' ' + stMeta(k)[1] + '</button>';
      }).join('') + '</div></div>' +

      '<div class="ag-sec"><span class="caps">Переписка</span><div class="ag-feed" id="agFeed">' +
      (feed.length ? feed.map(function (f) {
        if (f.sys) return '<div class="ag-sys">' + esc(f.text) + ' · ' + dt(f.at) + '</div>';
        var me = f.who === 'master';
        return '<div class="ag-m' + (me ? ' master' : '') + '"><span class="who">' + (me ? 'Вы' : 'Клиент') + ' · ' + dt(f.at) + '</span><div class="txt">' + esc(f.text) + '</div></div>';
      }).join('') : '<div class="ag-sys">пока пусто</div>') + '</div>' +
      '<div class="ag-actrow" style="margin-top:10px"><textarea id="agMsg" rows="2" placeholder="Сообщение клиенту…"></textarea>' +
      '<button type="button" class="btn btn-wax" id="agMsgSend">Отправить</button></div></div>' +

      '<div class="ag-sec ag-files"><span class="caps">Файлы (' + (o.files || []).length + ')</span>' +
      ((o.files || []).length ? o.files.map(function (f) {
        return '<div class="petit">📎 ' + esc(f.name) + ' · ' + (f.from === 'master' ? 'от вас' : 'от клиента') +
          '<a class="link" href="' + S.api.base + '/orders/' + o.id + '/file/' + f.id + '?session=' + encodeURIComponent(S.api.token()) + '" download>скачать</a></div>';
      }).join('') : '<p class="ag-note">Файлы клиенту удобнее слать из бота (кнопка «Сдать работу»).</p>') + '</div>' +

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
    var row = t.closest('.ag-row');
    if (row) { loadCard(parseInt(row.getAttribute('data-id'), 10)); return; }
    var chip = t.closest('.ag-chip[data-f]');
    if (chip) { st.filter = chip.getAttribute('data-f'); st.q = ''; loadOrders(); return; }
    if (t.closest('#agPriceSend')) {
      var price = parseInt((document.getElementById('agPrice') || {}).value, 10);
      var prepay = parseInt((document.getElementById('agPrepay') || {}).value, 10);
      if (!price || price <= 0) { toast('Введите цену'); return; }
      S.api.post('/admin/orders/' + st.sel + '/price', { price: price, prepay: prepay || undefined })
        .then(function (r) { if (r.ok) { toast('Предложение ушло клиенту 💰'); st.card = r.order; loadCard(st.sel); } else toast('Не получилось'); });
      return;
    }
    var stb = t.closest('.ag-stbtn');
    if (stb) {
      S.api.post('/admin/orders/' + st.sel + '/status', { status: stb.getAttribute('data-st') })
        .then(function (r) { if (r.ok) { toast('Статус обновлён'); loadCard(st.sel); refreshSilent(); } else toast('Не получилось'); });
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
  });

  root.addEventListener('keydown', function (e) {
    if (e.target && e.target.id === 'agQ' && e.key === 'Enter') {
      st.q = e.target.value.trim();
      loadOrders();
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
