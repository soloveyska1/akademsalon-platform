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
    timer: null,
    busy: false
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
  function tplLogin() {
    return '<div class="sheet sheet-pad stacked cab-login reveal">' +
      '<p class="caps">Вход в кабинет</p>' +
      '<h2 class="ord-type">Ваши заказы — на сайте и в Telegram</h2>' +
      '<p class="petit" style="margin-bottom:18px">Кабинет и бот работают с одной картотекой: статусы, переписка с мастером и файлы синхронны. ' +
      'Вход занимает пару секунд — подтвердите его в нашем боте.</p>' +
      '<button type="button" class="btn btn-wax btn-block" id="cabTg">Войти через Telegram <span class="ar">→</span></button>' +
      '<p class="petit cab-login-hint" id="cabTgHint" hidden>Окно Telegram открыто — нажмите в боте кнопку <b>Start</b>. Ждём подтверждение…</p>' +
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
      return '<div class="demo-note reveal cab-user"><span class="tag tag-verify">Telegram</span>' +
        '<p class="dn-text">Вы вошли как <b>' + esc(u.name || 'гость') + '</b>' + (u.username ? ' (@' + esc(u.username) + ')' : '') +
        ' — уведомления придут и в бота.</p>' +
        '<button type="button" class="btn btn-line" id="cabLogout">Выйти</button></div>';
    }
    return '<div class="demo-note reveal cab-user"><span class="tag tag-stamp">Гостевой доступ</span>' +
      '<p class="dn-text">Заказы видны на этом устройстве. Войдите через Telegram — привяжем их к вам, продублируем уведомления в бота.</p>' +
      '<button type="button" class="btn btn-wax" id="cabTg">Войти</button></div>';
  }

  /* ---------------- список и карточка ---------------- */
  function tplSwitch() {
    if (st.orders.length < 2) return '';
    return '<div class="ord-switch reveal" role="group" aria-label="Ваши заказы">' +
      st.orders.map(function (o) {
        var on = o.id === st.currentId;
        return '<button type="button" class="dotrow' + (on ? ' hl' : '') + '" data-ord="' + o.id + '" aria-pressed="' + on + '">' +
          '<span class="mono osw-no">' + esc(o.no) + '</span>' +
          '<span class="osw-type">' + esc(o.work_label || '') + '</span>' +
          '<span class="dots"></span>' +
          '<span class="dr-val">' + esc(o.status_emoji) + ' ' + esc(shortStatus(o)) + (o.unread ? ' · ' + o.unread + ' нов.' : '') + '</span>' +
          '</button>';
      }).join('') + '</div>';
  }
  function shortStatus(o) {
    return { new: 'на оценке', priced: 'ждёт решения', prepay: 'ждёт оплату', work: 'в работе',
             check: 'на проверке', fix: 'правки', done: 'завершён', cancel: 'закрыт' }[o.status] || '';
  }

  function stageRows(o) {
    if (o.step < 0) {
      return '<p class="petit" style="margin-top:6px">🚫 Заявка закрыта. Передумали? Напишите нам в чате ниже — продолжим.</p>';
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
    return '<div class="stage-head"><span class="caps">Этапы</span>' +
      '<span class="mono stage-prog">Этап ' + o.step + ' из ' + o.steps.length + '</span></div>' +
      '<div class="stage-list">' +
      o.steps.map(function (name, i) {
        var n = i + 1;
        var cls = n < o.step ? ' is-past' : n === o.step ? ' hl is-now' : ' is-next';
        var val = n < o.step ? '<span class="tag tag-verify tag-mini">пройден</span>'
          : n === o.step ? '<span class="dr-val">сейчас</span>' : '<span class="dr-val">—</span>';
        var now = n === o.step ? '<small>' + esc(NOW[o.status] || o.status_label) + '</small>' : '';
        return '<div class="dotrow stage-row' + cls + '"><span class="st-no">0' + n + '</span>' +
          '<span>' + esc(name) + '</span><span class="dots"></span>' + val + now + '</div>';
      }).join('') + '</div>';
  }

  function priceBlock(o) {
    if (o.price) {
      var pp = (o.prepay && (o.status === 'priced' || o.status === 'prepay'))
        ? ' <span class="petit">(предоплата ' + money(o.prepay) + ' ₽)</span>' : '';
      return '<div class="ord-price-row"><span class="caps">Цена мастера</span>' +
        '<span class="mono ord-price">' + money(o.price) + ' ₽' + pp + '</span></div>';
    }
    if (o.quote_low) {
      return '<div class="ord-price-row"><span class="caps">Вилка сметы</span>' +
        '<span class="mono ord-price">' + money(o.quote_low) + ' – ' + money(o.quote_high) + ' ₽</span></div>' +
        '<p class="petit ord-price-note">Точную цену мастер назовёт после разбора заявки — уведомим здесь и в Telegram.</p>';
    }
    return '';
  }

  function actionsBlock(o) {
    var b = [];
    if (o.actions.indexOf('accept_price') >= 0) {
      b.push('<button type="button" class="btn btn-wax" data-act="accept_price">Принять цену ' + money(o.price) + ' ₽</button>');
      b.push('<button type="button" class="btn btn-line" data-act="decline">Отказаться</button>');
    }
    if (o.actions.indexOf('paid') >= 0) {
      var req = o.requisites
        ? '<div class="req-box"><span class="caps">Реквизиты для предоплаты' + (o.prepay ? ' · ' + money(o.prepay) + ' ₽' : '') + '</span>' +
          '<pre class="req-pre mono">' + esc(o.requisites) + '</pre></div>'
        : '<p class="petit">Реквизиты пришлём в чат ниже (и в Telegram) в течение пары минут.</p>';
      return '<section class="cab-act reveal">' + req +
        '<div class="act-row"><button type="button" class="btn btn-wax" data-act="paid">Я оплатил(а)</button>' +
        '<button type="button" class="btn btn-line" data-chat-focus>Вопрос по оплате</button></div></section>';
    }
    if (o.actions.indexOf('accept_work') >= 0) {
      b.push('<button type="button" class="btn btn-wax" data-act="accept_work">Принять работу</button>');
      b.push('<button type="button" class="btn btn-line" data-act-fix>Нужны правки</button>');
    }
    if (!b.length) return '';
    return '<section class="cab-act reveal"><div class="act-row">' + b.join('') + '</div>' +
      '<div class="fix-form" id="fixForm" hidden>' +
        '<textarea id="fixText" rows="3" maxlength="2000" placeholder="Что поправить? Например: «во 2-й главе обновить данные за 2025 год»"></textarea>' +
        '<div class="act-row"><button type="button" class="btn btn-wax" data-act-fix-send>Отправить на правки</button>' +
        '<button type="button" class="btn btn-line" data-act-fix-cancel>Передумал(а)</button></div>' +
      '</div></section>';
  }

  function filesBlock(o) {
    var rows = (o.files || []).map(function (f) {
      var who = f.from === 'master' ? 'от мастерской' : 'ваш файл';
      return '<div class="dotrow file-row"><span>📎 ' + esc(f.name) + '</span><span class="dots"></span>' +
        '<span class="dr-val">' + who + ' · ' + dt(f.at) + '</span>' +
        '<a class="link file-dl" href="' + S.api.base + apiPath(o.id, '/file/' + f.id) + '" download>скачать</a></div>';
    }).join('');
    return '<section class="cab-files reveal"><div class="stage-head"><span class="caps">Файлы</span>' +
      '<label class="btn btn-line btn-upload">Приложить файл<input type="file" id="cabUpload" hidden></label></div>' +
      (rows || '<p class="petit">Пока пусто. Приложите методичку или задание — мастеру будет проще оценить работу точно.</p>') +
      '<p class="petit up-note" id="upNote" hidden></p></section>';
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
      if (!body && i.kind && i.kind !== 'text') body = '📎 ' + (i.file ? esc(i.file) : 'вложение (см. «Файлы» или Telegram)');
      else if (i.file) body += '<br>📎 ' + esc(i.file);
      return '<div class="chat-m' + (i.me ? ' me' : '') + '">' +
        '<span class="chat-who caps">' + (i.me ? 'Вы' : 'Мастерская') + '</span>' +
        '<span class="chat-txt">' + body + '</span>' +
        '<span class="chat-at petit">' + dt(i.at) + '</span></div>';
    }).join('');
    return '<section class="cab-chat reveal"><div class="stage-head"><span class="caps">Переписка по заказу</span>' +
      '<span class="petit">видна и в Telegram-боте</span></div>' +
      '<div class="chat-feed" id="chatFeed">' + (feed || '<p class="petit" style="text-align:center">Пока тихо. Напишите первым — мастер ответит здесь и в боте.</p>') + '</div>' +
      '<div class="chat-form"><textarea id="chatText" rows="2" maxlength="3000" placeholder="Сообщение мастеру…"></textarea>' +
      '<button type="button" class="btn btn-wax" id="chatSend">Отправить</button></div></section>';
  }

  function tplDetail() {
    var o = st.detail;
    var meta = [];
    if (o.deadline_text) meta.push('срок: ' + esc(o.deadline_text));
    meta.push('заявка от ' + dt(o.created_at));
    return userRow() + tplSwitch() +
      '<article class="sheet sheet-pad stacked reveal" aria-label="Формуляр заказа ' + esc(o.no) + '">' +
      '<div class="ord-top"><span class="mono ord-no">Заказ ' + esc(o.no) + '</span>' +
      '<span class="tag tag-ink">' + esc(o.status_emoji) + ' ' + esc(o.status_label) + '</span></div>' +
      '<h2 class="ord-type">' + esc(o.work_label || '') + '</h2>' +
      (o.topic ? '<p class="ord-topic">Тема: «' + esc(o.topic) + '»</p>' : '') +
      '<p class="petit">' + meta.join(' · ') + '</p>' +
      priceBlock(o) + stageRows(o) + '</article>' +
      actionsBlock(o) + filesBlock(o) + chatBlock(o) +
      '<p class="petit cab-foot-sync">Кабинет и Telegram-бот — одна картотека: что бы ни изменилось, вы увидите это в обоих местах. ' +
      'Бот: <a class="link" href="https://t.me/academic_saloon_bot" target="_blank" rel="noopener">@academic_saloon_bot</a></p>';
  }

  /* ---------------- загрузка данных ---------------- */
  function loadList(keepCurrent) {
    var t = S.api.token(), g = S.api.guestTokens();
    if (!t && !g.length) { render(tplLogin()); return; }
    S.api.get('/orders' + (t ? '' : '?tokens=' + encodeURIComponent(g.join(',')))).then(function (r) {
      if (!r.ok) { render(tplError()); return; }
      st.orders = r.orders || [];
      if (!st.orders.length) { render(tplEmpty()); return; }
      if (!keepCurrent || !st.orders.some(function (o) { return o.id === st.currentId; }))
        st.currentId = st.orders[0].id;
      loadDetail();
    });
  }

  function loadDetail(silent) {
    var id = st.currentId;
    S.api.get(apiPath(id)).then(function (r) {
      if (!r.ok) { if (!silent) render(tplError()); return; }
      var was = st.detail;
      var changed = !was || was.id !== r.order.id || was.updated_at !== r.order.updated_at ||
        (was.messages || []).length !== (r.order.messages || []).length ||
        (was.files || []).length !== (r.order.files || []).length;
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
    if (extra) body.comment = extra;
    var t = tokenFor(st.currentId);
    if (t) body.token = t;
    S.api.post('/orders/' + st.currentId + '/action' + (t ? '?token=' + encodeURIComponent(t) : ''), body)
      .then(function (r) {
        st.busy = false;
        if (!r.ok) { toast('Не получилось — попробуйте ещё раз'); return; }
        st.detail = r.order;
        render(tplDetail());
        toast({ accept_price: 'Принято! Ждём предоплату', paid: 'Передали на сверку',
                accept_work: 'Заказ завершён — спасибо!', request_fixes: 'Отправили на правки',
                decline: 'Заявка закрыта' }[action] || 'Готово');
        loadList(true);
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
        if (hint) hint.hidden = false;
        if (btn) btn.textContent = 'Ждём подтверждение в боте…';
        if (!opened) { window.location.href = link; }
      });
  }

  /* ---------------- события ---------------- */
  root.addEventListener('click', function (e) {
    var t = e.target;
    var sw = t.closest('button[data-ord]');
    if (sw) { st.currentId = parseInt(sw.getAttribute('data-ord'), 10); loadDetail(); return; }
    if (t.closest('#cabTg')) { doTgLogin(t.closest('#cabTg')); return; }
    if (t.closest('#cabLogout')) { S.api.logout(); st.detail = null; loadList(); return; }
    if (t.closest('#cabRetry')) { loadList(); return; }
    if (t.closest('#chatSend')) { sendMessage(); return; }
    var act = t.closest('[data-act]');
    if (act) {
      var a = act.getAttribute('data-act');
      if (a === 'decline' && !window.confirm('Закрыть заявку? Если смущает цена или срок — просто напишите в чат, обычно договариваемся.')) return;
      doAction(a);
      return;
    }
    if (t.closest('[data-act-fix]')) { var ff = document.getElementById('fixForm'); if (ff) { ff.hidden = false; document.getElementById('fixText').focus(); } return; }
    if (t.closest('[data-act-fix-cancel]')) { var f2 = document.getElementById('fixForm'); if (f2) f2.hidden = true; return; }
    if (t.closest('[data-act-fix-send]')) {
      var txt = (document.getElementById('fixText') || {}).value || '';
      if (!txt.trim()) { toast('Опишите, что поправить'); return; }
      doAction('request_fixes', txt.trim());
      return;
    }
    if (t.closest('[data-chat-focus]')) { var ta = document.getElementById('chatText'); if (ta) { ta.focus(); ta.scrollIntoView({ block: 'center' }); } return; }
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
  loadList();
  startPolling();
}
if (document.prerendering) {
  document.addEventListener('prerenderingchange', initCabinet, { once: true });
} else {
  initCabinet();
}
