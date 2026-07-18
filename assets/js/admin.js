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
                due: ['созрел к оплате', 'pl-due'], later: ['после готовности следующей части', 'pl-later'] };

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
    part_ready: 'часть готова — клиенту выставлен счёт этапа',
    pay_reminder: 'напоминание клиенту об оплате',
    pay_silent: 'клиент молчит по счёту — нужен личный контакт',
    delivered_unpaid: '⚠️ часть передана без оплаты этапа',
    admin_ping_pay: 'алерт: счёт без движения',
    wait_checks: 'клиент ждёт проверок (научрук/предзащита)',
    spec_sent: 'спецификация отправлена клиенту',
    broadcast: 'рассылка клиентам', defense_offered: 'предложены услуги к защите',
    plan_set: 'план оплаты изменён', tg_linked: 'клиент привязал Telegram',
    admin_ping: 'напоминание о заявке', client_followup: 'напоминание клиенту о проверке',
    deadline1: 'скоро срок сдачи', deadline3: 'до срока 3 дня',
    fix_ack: 'правки взяты в работу — клиенту сообщили',
    review_nudge: 'напоминание клиенту о проверке части',
    accept_warn: 'предупреждение об авто-приёмке части'
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
    qa: null, qaTags: null,   /* «Открытая приёмная»: очередь и лента */
    desk: null, calDay: null, /* «Сегодня на столе»: активные дела + календарь сдач */
    subs: null,               /* /admin/subs: оформления подписки (свой контур) */
    gifts: null, gsel: null, gnew: false,  /* сертификаты: список, раскрытая карточка, форма выпуска */
    ov: null, timer: null, busy: false,
    visits: null, vstats: null,                    /* «Глаз бога»: лента заходов */
    vopts: { hours: 24, self: false, bots: false },
    vopen: {},                                     /* раскрытые строки визитов */
    vtimer: null,
    bulk: null                                     /* Set(id) — режим массовых действий */
  };

  /* цветные метки заказов: имя → чернила «Оттиска» */
  var CLR = { red: '#B23B22', gold: '#8A6D1C', green: '#2E6B4F', blue: '#3A4E7A', violet: '#6B4B8A' };
  var CLR_NAME = { red: 'сургуч', gold: 'золото', green: 'зелёный', blue: 'синий', violet: 'фиолетовый' };

  /* пин/цвет/скрыть/корзина — один вызов и для карточки, и для пачки */
  function flag(ids, payload, after) {
    payload.ids = ids;
    S.api.post('/admin/orders/flag', payload).then(function (r) {
      if (!r || !r.ok) { toast('Не получилось — попробуйте ещё раз'); return; }
      if (after) after(r);
    });
  }

  function bulkApply(payload) {
    if (!st.bulk || !st.bulk.size) { toast('Сначала отметьте заказы галочками'); return; }
    var ids = [];
    st.bulk.forEach(function (id) { ids.push(id); });
    flag(ids, payload, function () {
      toast('Готово · ' + ids.length + ' шт.');
      st.bulk = new Set();
      loadTab();
    });
  }

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
      loadSubs();
      if (!st.timer) {
        /* страховочный интервал; главное — long-poll событий ниже */
        st.timer = setInterval(function () {
          if (!document.hidden) refreshSilent();
        }, 60000);
        watchEvents();
      }
    });
  }

  /* мгновенные обновления: long-poll шины событий — карточки и списки
     подтягиваются в момент действия клиента, без ожидания поллинга */
  var evVer = 0;
  function watchEvents() {
    fetch(S.api.base + '/events?since=' + evVer)
      .then(function (resp) { return resp.json(); })
      .then(function (r) {
        var moved = r && r.ok && r.v > evVer;
        if (r && r.ok) evVer = r.v;
        if (moved && S.api.token()) refreshSilent();
        setTimeout(watchEvents, moved ? 250 : 500);
      })
      .catch(function () { setTimeout(watchEvents, 8000); });
  }

  function loadSubs() {
    S.api.get('/admin/subs').then(function (r) {
      if (r.ok) { st.subs = r; if (st.tab === 'summary') drawBody(); }
    });
  }

  function refreshSilent() {
    S.api.get('/admin/overview').then(function (r) { if (r.ok) { st.ov = r; drawNav(); drawLive(); if (st.tab === 'summary') drawBody(); } });
    loadSubs();
    if (st.tab === 'summary') loadDesk();
    if (st.tab === 'gifts') loadGifts();
    if (st.tab === 'qa') loadQA();
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
    /* лента визитов сама себя освежает — таймер живёт, пока открыта вкладка */
    if (st.vtimer) { clearInterval(st.vtimer); st.vtimer = null; }
    if (st.tab === 'visits') {
      drawBody();
      loadVisits();
      st.vtimer = setInterval(function () {
        if (st.tab === 'visits' && !document.hidden) loadVisits(true);
      }, 12000);
      return;
    }
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
    } else if (st.tab === 'qa') {
      loadQA();
    } else if (st.tab === 'gifts') {
      loadGifts();
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
  function loadQA() {
    S.api.get('/admin/qa').then(function (r) {
      if (!r || !r.ok) return;
      st.qa = r.items;
      st.qaTags = r.tags || {};
      if (st.tab === 'qa') drawBody();
    });
  }

  /* ---------------- ВИЗИТЫ («все заходы») ---------------- */
  function loadVisits(silent) {
    var o = st.vopts;
    var qs = 'hours=' + o.hours + (o.self ? '&self=1' : '') + (o.bots ? '&bots=1' : '');
    S.api.get('/admin/visits?' + qs).then(function (r) {
      if (!r || !r.ok) return;
      st.visits = r.visits;
      st.vstats = r.stats;
      if (st.tab === 'visits') drawVisits(silent);
      if (st.tab === 'summary') drawBody();
    });
  }

  /* устройство и браузер — коротко, по user-agent */
  function devLabel(ua) {
    ua = String(ua || '');
    var dev = /iPhone|iPad/.test(ua) ? '📱 iPhone'
      : /Android.*Mobile/.test(ua) ? '📱 Android'
      : /Android/.test(ua) ? '📱 планшет'
      : /Mobile/.test(ua) ? '📱'
      : '💻';
    var br = /YaBrowser/.test(ua) ? 'Яндекс.Браузер'
      : /Edg\//.test(ua) ? 'Edge'
      : /OPR\//.test(ua) ? 'Opera'
      : /Firefox\//.test(ua) ? 'Firefox'
      : /Chrome\//.test(ua) ? 'Chrome'
      : /Safari\//.test(ua) ? 'Safari' : '';
    return dev + (br ? ' · ' + br : '');
  }

  function refLabel(ref) {
    if (!ref) return '';
    var s = String(ref);
    var m = /https?:\/\/([^\/]+)/.exec(s);
    var host = m ? m[1].replace(/^www\./, '') : '';
    var q = /[?&]text=([^&]+)/.exec(s); /* запрос из поисковика — золото */
    var word = '';
    if (q) { try { word = decodeURIComponent(q[1].replace(/\+/g, ' ')); } catch (e) {} }
    if (/utm_/.test(s) && !host) return '🎯 ' + s.replace(/^[?&]/, '').slice(0, 60);
    if (!host) return s.slice(0, 60);
    var ic = /yandex|ya\.ru/.test(host) ? '🔎' : /google/.test(host) ? '🔎'
      : /vk\.com|vk\.ru/.test(host) ? '💙' : /t\.me|telegram/.test(host) ? '✈️' : '🔗';
    return ic + ' ' + host + (word ? ' · «' + word.slice(0, 48) + '»' : '');
  }

  function pageName(p) {
    var map = {
      '/index.html': 'главная', '/': 'главная', '/configurator.html': 'калькулятор',
      '/tariffs.html': 'цены', '/plan.html': 'разбор плана', '/guarantees.html': 'гарантии',
      '/reviews.html': 'отзывы', '/loyalty.html': 'клуб', '/dashboard.html': 'кабинет',
      '/referral.html': 'приглашения', '/knowledge.html': 'полезные материалы', '/check.html': 'проверка'
    };
    var path = String(p || '').split('?')[0];
    return map[path] || path.replace(/^\//, '').replace('.html', '') || '—';
  }

  function minsAgo(iso) {
    var t = new Date(iso + (String(iso).indexOf('Z') < 0 ? 'Z' : ''));
    if (isNaN(t)) return 9999;
    return Math.floor((Date.now() - t) / 60000);
  }

  function visitRow(v) {
    var online = minsAgo(v.at) < 3;
    var who;
    if (v.user && v.user.name) {
      who = '👤 ' + esc(v.user.name) + (v.user.username ? ' @' + esc(v.user.username) : '');
    } else if (v.contact) {
      who = '☎ ' + esc(v.contact);
    } else {
      who = 'аноним · ' + esc(v.vid);
    }
    var known = !!(v.user || v.contact);
    var stepCls = v.order_id ? 'v-step done' : 'v-step';
    var stepTxt = v.order_id
      ? '✓ заявка №' + v.order_id
      : (v.step ? '⚑ ' + esc(v.step) : '');
    var path = v.entry === v.page
      ? pageName(v.entry)
      : pageName(v.entry) + ' → ' + pageName(v.page);
    var dur = Math.max(0, Math.round((new Date(v.at + 'Z') - new Date(v.started + 'Z')) / 60000));
    var open = st.vopen[v.id];
    return '<div class="ag-vrow" data-vrow="' + v.id + '">' +
      '<div class="v-top">' +
        (online ? '<span class="v-on" title="на сайте прямо сейчас"></span>' : '') +
        '<span class="v-time">' + dt(v.at) + '</span>' +
        '<span class="v-geo">' + esc(v.geo || (v.bot ? 'робот' : 'откуда — выясняем…')) + '</span>' +
        '<span class="v-dev">' + devLabel(v.ua) + (v.bot ? ' · 🤖 бот' : '') + '</span>' +
        '<span class="v-who' + (known ? ' known' : '') + '">' + who + '</span>' +
      '</div>' +
      '<div class="v-sub">' +
        '<span>' + esc(path) + ' · стр: ' + (v.pages || 1) +
          (dur ? ' · ' + dur + ' мин' : '') + '</span>' +
        (stepTxt ? '<span class="' + stepCls + '">' + stepTxt + '</span>' : '') +
        (v.ref ? '<span class="v-ref" title="' + esc(v.ref) + '">' + esc(refLabel(v.ref)) + '</span>' : '') +
      '</div>' +
      (open ? visitDetails(v) : '') +
      '</div>';
  }

  function visitDetails(v) {
    var links = (v.links || []).map(function (l) {
      return '<a href="' + esc(l[1]) + '" target="_blank" rel="noopener">' + esc(l[0]) + '</a>';
    }).join(' · ');
    var refFull = v.ref || '';
    try { refFull = decodeURIComponent(refFull); } catch (e) {}
    return '<div class="v-det">' +
      '<span>Сессия с ' + dt(v.started) + ' · последняя активность ' + dt(v.at) + '</span>' +
      '<span>Вход: <b>' + esc(v.entry || '—') + '</b> → сейчас: <b>' + esc(v.page || '—') + '</b></span>' +
      (refFull ? '<span>Источник: ' + esc(refFull) + '</span>' : '') +
      '<span class="mono">IP ' + esc(v.ip || '—') + (v.org ? ' · ' + esc(v.org) : '') +
        ' · <a href="https://ipinfo.io/' + esc(v.ip || '') + '" target="_blank" rel="noopener">подробнее об IP</a></span>' +
      '<span class="mono">' + esc(v.ua || '') + '</span>' +
      (links ? '<span>Связаться: ' + links + '</span>' : '') +
      ((v.user && v.user.id > 0) ? '<span><button type="button" class="ag-linkbtn" data-open-client="' + v.user.id + '">карточка клиента →</button></span>' : '') +
      (v.order_id ? '<span><button type="button" class="ag-linkbtn" data-open-order="' + v.order_id + '">открыть заявку №' + v.order_id + ' →</button></span>' : '') +
      '</div>';
  }

  function tplVisits() {
    return '<div class="ag-tiles" id="agVTiles"></div>' +
      '<div class="ag-filters" id="agVFilters"></div>' +
      '<div class="ag-vwrap" id="agVList"><div class="ag-empty">Слушаем эфир…</div></div>' +
      '<p class="ag-note" style="margin-top:10px">Сессия — заходы без паузы больше 30 минут. ' +
      'Гео определяется по IP (примерно, город может съезжать на соседний). Контакт появляется, ' +
      'когда посетитель вошёл, оставил заявку или смету. Лента обновляется сама каждые 12 секунд.</p>';
  }

  function drawVisits(keepScroll) {
    var tiles = document.getElementById('agVTiles');
    var flt = document.getElementById('agVFilters');
    var list = document.getElementById('agVList');
    if (!tiles || !list) return;
    var s = st.vstats || {};
    var conv = s.uniq ? Math.round((s.with_order || 0) / s.uniq * 100) : 0;
    function tile(n, l, cls) {
      return '<div class="ag-tile ' + (cls || '') + '"><div class="t-num">' + n + '</div>' +
        '<div class="t-lbl">' + l + '</div></div>';
    }
    tiles.innerHTML =
      tile(s.online || 0, 'на сайте сейчас', s.online ? 'calm' : '') +
      tile(s.visits || 0, 'визитов за сутки') +
      tile(s.uniq || 0, 'уникальных') +
      tile(s.with_order || 0, 'дошли до заявки', s.with_order ? 'calm' : '') +
      tile(conv + '%', 'конверсия в заявку');
    var o = st.vopts;
    if (flt) flt.innerHTML = [[24, 'Сутки'], [72, '3 дня'], [168, 'Неделя'], [720, '30 дней']]
      .map(function (h) {
        return '<button type="button" class="ag-chip' + (o.hours === h[0] ? ' on' : '') + '" data-vh="' + h[0] + '">' + h[1] + '</button>';
      }).join('') +
      '<button type="button" class="ag-chip' + (o.self ? ' on' : '') + '" data-vt="self">мои заходы</button>' +
      '<button type="button" class="ag-chip' + (o.bots ? ' on' : '') + '" data-vt="bots">🤖 роботы</button>';
    var rows = st.visits || [];
    var top = keepScroll ? list.scrollTop : 0;
    list.innerHTML = rows.length
      ? rows.map(visitRow).join('')
      : '<div class="ag-empty">Пока тихо — за выбранный период заходов нет.<br>' +
        '<span class="petit">Маячок появился на сайте только что: лента наполнится с первыми посетителями.</span></div>';
    if (keepScroll) list.scrollTop = top;
  }

  function loadCard(id, silent) {
    st.sel = id;
    S.api.get('/admin/orders/' + id).then(function (r) {
      if (!r.ok) return;
      var was = st.card;
      var same = false;
      if (silent && was && was.id === r.order.id) {
        /* платежи и объявленная готовность части меняются без updated_at —
           сравниваем карточку целиком */
        try { same = JSON.stringify(was) === JSON.stringify(r.order); }
        catch (e) { same = false; }
      }
      if (same) return;
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
      '<div class="ag-mast"><h1><span class="mono">Академический салон · глаз бога</span>Кабинет мастера</h1>' +
      '<button type="button" class="ag-live quiet" id="agLive" title="Кто на сайте прямо сейчас — открыть визиты">' +
        '<span class="ld"></span><span>на сайте <b id="agLiveN">0</b></span></button>' +
      '<div class="ag-user">' + (S.themeToggleHTML ? S.themeToggleHTML() : '') +
      '<span>мастер: <b>' + esc(u.name || '—') + '</b></span>' +
      '<a class="ag-linkbtn" href="index.html">на сайт</a>' +
      '<a class="ag-linkbtn" href="dashboard.html">клиентский кабинет</a>' +
      '<button type="button" class="ag-linkbtn" id="agLogout">выйти</button></div></div>' +
      '<div class="ag-nav" id="agNav"></div>' +
      '<div id="agBody"></div>');
    drawNav();
    drawLive();
  }

  function drawLive() {
    var v = (st.ov && st.ov.visits) || {};
    var chip = document.getElementById('agLive'), n = document.getElementById('agLiveN');
    if (!chip || !n) return;
    n.textContent = v.online || 0;
    chip.classList.toggle('quiet', !(v.online > 0));
  }

  function navBadges() {
    var ov = st.ov || {};
    var by = ov.by_status || {};
    return {
      orders: (by.new || 0) + (by.fix || 0) + (ov.claimed || 0),
      reviews: ov.reviews_pending || 0,
      qa: (ov.qa && ov.qa.pending) || 0,
      gifts: (ov.gifts && ov.gifts.claimed_n) || 0
    };
  }

  function drawNav() {
    var box = document.getElementById('agNav');
    if (!box) return;
    var b = navBadges();
    var online = (st.ov && st.ov.visits && st.ov.visits.online) || 0;
    var tabs = [
      ['summary', '◉ Пульс', 0],
      ['visits', '👁 Визиты', online],
      ['orders', '🗂 Заказы', b.orders],
      ['clients', '👥 Клиенты', 0],
      ['reviews', '⭐ Отзывы', b.reviews],
      ['qa', '📮 Приёмная', b.qa],
      ['gifts', '🎁 Сертификаты', b.gifts],
      ['leads', '🌐 Лиды', 0],
      ['broadcast', '📣 Рассылка', 0],
      ['settings', '⚙️ Настройки', 0]
    ];
    box.innerHTML = tabs.map(function (t) {
      var bcls = t[0] === 'visits' ? 'ag-badge mut' : 'ag-badge';
      return '<button type="button" class="ag-tab' + (st.tab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] +
        (t[2] ? '<span class="' + bcls + '">' + t[2] + '</span>' : '') + '</button>';
    }).join('');
  }

  function drawBody() {
    var box = document.getElementById('agBody');
    if (!box) return;
    if (st.tab === 'summary') {
      box.innerHTML = tplSummary();
      if (st.visits === null) loadVisits(); /* мини-лента заходов дозагрузится сама */
      return;
    }
    if (st.tab === 'visits') { box.innerHTML = tplVisits(); drawVisits(); return; }
    if (st.tab === 'orders') {
      box.innerHTML =
        '<div class="ag-filters" id="agFilters"></div>' +
        '<div class="ag-split">' +
          '<div class="ag-list" id="agList"></div>' +
          '<div class="ag-card" id="agCard"><div class="ag-empty">Выберите заказ слева</div></div>' +
        '</div>' +
        '<div id="agBulkWrap"></div>';
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
    if (st.tab === 'qa') { box.innerHTML = tplQA(); return; }
    if (st.tab === 'gifts') { box.innerHTML = tplGifts(); return; }
    if (st.tab === 'leads') { box.innerHTML = tplLeads(); return; }
    if (st.tab === 'broadcast') { box.innerHTML = tplBroadcast(); bcastRefresh(); return; }
    drawSettings(box);
  }

  /* ---------------- СЕРТИФИКАТЫ ---------------- */
  function loadGifts() {
    S.api.get('/admin/gifts').then(function (r) {
      if (!r || !r.ok) return;
      st.gifts = r;
      if (st.tab === 'gifts') drawBody();
    });
  }
  var GIFT_ST = {
    pending: ['ожидает оплаты', 'act'], active: ['действителен', 'ok'],
    spent: ['погашен', ''], expired: ['истёк', ''],
    blocked: ['заблокирован', 'due'], canceled: ['отменён', '']
  };
  var GIFT_LEDGER_KIND = {
    issue: 'выпуск', hold: 'зачёт в заказ', release: 'возврат на код',
    adjust: 'корректировка', expire: 'сгорание'
  };
  function tplGifts() {
    if (!st.gifts) { loadGifts(); return '<div class="ag-empty">Загружаем сертификаты…</div>'; }
    var s = st.gifts.stats || {};
    var tiles =
      '<div class="ag-tiles">' +
        '<div class="ag-tile"><b class="t-num">' + (s.active_n || 0) + '</b><span class="t-lbl">в обращении</span></div>' +
        '<div class="ag-tile"><b class="t-num">' + money(s.live_balance) + ' ₽</b><span class="t-lbl">остаток на кодах</span></div>' +
        '<div class="ag-tile"><b class="t-num">' + money(s.redeemed_sum) + ' ₽</b><span class="t-lbl">погашено услугами</span></div>' +
        '<div class="ag-tile' + (s.claimed_n ? ' warn' : '') + '"><b class="t-num">' + (s.claimed_n || 0) + '</b><span class="t-lbl">на сверке оплаты</span></div>' +
      '</div>';
    var newBtn = '<div style="margin:12px 0">' +
      '<button type="button" class="btn ' + (st.gnew ? 'btn-line' : 'btn-wax') + '" id="agGiftNew">' +
      (st.gnew ? 'Свернуть форму' : '➕ Выпустить сертификат') + '</button></div>';
    var form = !st.gnew ? '' :
      '<div class="ag-card" style="max-width:560px;max-height:none;margin-bottom:14px">' +
        '<span class="caps">Ручной выпуск — комплимент или продажа вне сайта</span>' +
        '<div style="display:grid;gap:8px;margin-top:10px">' +
          '<input type="number" id="agGfAmount" min="500" max="50000" step="500" placeholder="Номинал, ₽ (например 5000)" class="ag-in">' +
          '<input type="text" id="agGfName" maxlength="120" placeholder="Имя получателя (на сертификате, по желанию)" class="ag-in">' +
          '<input type="email" id="agGfEmail" maxlength="120" placeholder="Почта получателя — отправим письмом (по желанию)" class="ag-in">' +
          '<input type="text" id="agGfCongrats" maxlength="280" placeholder="Поздравление (по желанию)" class="ag-in">' +
          '<input type="text" id="agGfNote" maxlength="300" placeholder="Заметка для себя: кому и за что" class="ag-in">' +
          '<button type="button" class="btn btn-wax" id="agGfCreate">Выпустить — код появится сразу</button>' +
          '<p class="ag-hint">Выпуск ручной оплаты: сертификат сразу действителен. Не забудьте чек, если это продажа.</p>' +
        '</div></div>';
    var rows = (st.gifts.gifts || []).map(function (g) {
      var stt = GIFT_ST[g.state] || [g.state_label || g.state, ''];
      var open = st.gsel === g.id;
      var head =
        '<button type="button" class="ag-grow" data-gift-open="' + g.id + '" aria-expanded="' + open + '">' +
          '<span class="gg-t"><b class="mono">' + esc(g.code) + '</b>' +
            ' <span class="ag-pill ' + stt[1] + '">' + stt[0] + '</span>' +
            (g.claimed && g.status === 'pending' ? ' <span class="ag-pill due">клиент отметил оплату</span>' : '') +
          '</span>' +
          '<span class="gg-m">' + money(g.balance) + ' / ' + money(g.amount) + ' ₽' +
            (g.recip_name ? ' · для: ' + esc(g.recip_name) : '') +
            (g.expires_ru && g.expires_ru !== '—' ? ' · до ' + g.expires_ru : '') + '</span>' +
        '</button>';
      if (!open) return '<div class="ag-gift">' + head + '</div>';
      return '<div class="ag-gift on">' + head + '<div class="ag-gift-body" data-gift-body="' + g.id + '">' +
        '<div class="ag-empty" style="padding:12px">Загружаем журнал…</div></div></div>';
    }).join('');
    return tiles + newBtn + form +
      '<div class="ag-gifts">' + (rows || '<div class="ag-empty">Сертификатов пока нет — выпустите первый или дождитесь покупки с сайта (страница /gift.html).</div>') + '</div>';
  }
  function drawGiftCard(g) {
    var box = document.querySelector('[data-gift-body="' + g.id + '"]');
    if (!box) return;
    var stt = GIFT_ST[g.state] || [g.state_label || g.state, ''];
    var info =
      '<div class="ag-kv">' +
        '<div><span>Состояние</span><b>' + stt[0] + (g.block_note ? ' · ' + esc(g.block_note) : '') + '</b></div>' +
        '<div><span>Остаток / номинал</span><b>' + money(g.balance) + ' / ' + money(g.amount) + ' ₽</b></div>' +
        '<div><span>Покупатель</span><b>' + esc(g.buyer_name || '—') + (g.buyer_contact ? ' · ' + esc(g.buyer_contact) : '') + (g.via ? ' · ' + esc(g.via) : '') + '</b></div>' +
        '<div><span>Получатель</span><b>' + esc(g.recip_name || '—') + (g.recip_contact ? ' · ' + esc(g.recip_contact) : '') +
          (g.recip_contact ? (g.delivered ? ' · письмо ушло' : (g.deliver_at ? ' · отправим ' + esc(g.deliver_at) : ' · письмо не ушло')) : '') + '</b></div>' +
        (g.congrats ? '<div><span>Поздравление</span><b>«' + esc(g.congrats) + '»</b></div>' : '') +
        '<div><span>Срок</span><b>' + (g.expires_ru || '—') + '</b></div>' +
        (g.note ? '<div><span>Заметка</span><b>' + esc(g.note) + '</b></div>' : '') +
      '</div>';
    var acts = [];
    if (g.status === 'pending') {
      acts.push('<button type="button" class="btn btn-wax" data-gift-act="confirm" data-gift-id="' + g.id + '">✅ Оплата получена — выпустить</button>');
      acts.push('<button type="button" class="btn btn-line" data-gift-act="cancel" data-gift-id="' + g.id + '">✖ Отменить оформление</button>');
    }
    if (g.status === 'active' || g.status === 'expired') {
      acts.push('<button type="button" class="btn btn-line" data-gift-act="extend" data-gift-id="' + g.id + '">🕐 Продлить +90 дн</button>');
      acts.push('<button type="button" class="btn btn-line" data-gift-act="adjust" data-gift-id="' + g.id + '">± Корректировать остаток</button>');
      acts.push('<button type="button" class="btn btn-line" data-gift-act="resend" data-gift-id="' + g.id + '">✉️ Переслать письма</button>');
      acts.push('<button type="button" class="btn btn-line" data-gift-act="block" data-gift-id="' + g.id + '">🚫 Заблокировать</button>');
    }
    if (g.status === 'blocked') {
      acts.push('<button type="button" class="btn btn-wax" data-gift-act="unblock" data-gift-id="' + g.id + '">Разблокировать</button>');
    }
    if (g.code && g.status !== 'pending' && g.status !== 'canceled') {
      acts.push('<a class="btn btn-line" target="_blank" rel="noopener" href="gift.html?code=' + encodeURIComponent(g.code) + '">Открыть лист</a>');
      acts.push('<a class="btn btn-line" target="_blank" rel="noopener" href="' + S.api.base + '/gift/pdf?code=' + encodeURIComponent(g.code) + '">PDF</a>');
    }
    var orders = (g.orders || []).map(function (o) {
      return '<button type="button" class="ag-linkbtn" data-open-order="' + o.id + '">№' + o.id + ' · ' +
        esc(o.work_label || '') + ' · зачтено ' + money(o.gift_amount) + ' ₽</button>';
    }).join('<br>');
    var ledger = (g.ledger || []).map(function (l) {
      var k = GIFT_LEDGER_KIND[l.kind] || l.kind;
      return '<div class="ag-ev"><span>' + (l.at || '').slice(0, 10) + ' ' + (l.at || '').slice(11, 16) + '</span>' +
        '<span>' + k + (l.order_id ? ' · заказ №' + l.order_id : '') + (l.note ? ' · ' + esc(l.note) : '') + '</span>' +
        '<b class="' + (l.delta < 0 ? 'neg' : 'pos') + '">' + (l.delta > 0 ? '+' : '') + money(l.delta) + '</b></div>';
    }).join('');
    box.innerHTML = info +
      '<div class="ag-actions" style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0">' + acts.join('') + '</div>' +
      (orders ? '<span class="caps">Заказы по коду</span><div style="margin:6px 0 10px">' + orders + '</div>' : '') +
      '<span class="caps">Журнал операций</span><div class="ag-evs" style="margin-top:6px">' +
      (ledger || '<p class="ag-hint">Пока пусто.</p>') + '</div>';
  }
  function giftAction(id, act, body, okMsg) {
    S.api.post('/admin/gifts/' + id + '/' + act, body || {}).then(function (r) {
      if (!r || !r.ok) {
        toast({ gift_state: 'Уже в другом состоянии — обновите список',
                mail_off: 'Почта не настроена или адресов нет',
                bad_amount: 'Проверьте сумму' }[(r && r.error) || ''] || 'Не получилось');
        return;
      }
      toast(okMsg || 'Готово');
      loadGifts();
      openGiftCard(id);
    });
  }
  function openGiftCard(id) {
    S.api.get('/admin/gifts/' + id).then(function (r) {
      if (r && r.ok) drawGiftCard(r.gift);
    });
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
  /* -------- «Сегодня на столе»: фокус-очередь + календарь сдач --------
     Правило подачи: сначала то, что требует рук сегодня (и деньги дела),
     остальное — ниже, как обычно. Список собирается из активных заказов. */
  function loadDesk() {
    S.api.get('/admin/orders?status=active').then(function (r) {
      if (r && r.ok) { st.desk = r.orders || []; if (st.tab === 'summary') drawBody(); }
    });
  }
  function dlLeft(o) {
    /* считаем по календарным суткам: вчера = −1, сегодня = 0, завтра = 1 */
    if (!o.deadline_date || 'done cancel'.indexOf(o.status) >= 0) return null;
    var t = new Date(o.deadline_date + 'T00:00:00');
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var n = Math.round((t - today) / 86400000);
    return isNaN(n) ? null : n;
  }
  function silentDays(o) {
    var raw = o.updated_at || o.created_at || '';
    var t = new Date(raw + (String(raw).indexOf('Z') < 0 ? 'Z' : ''));
    return isNaN(t) ? 0 : Math.floor((Date.now() - t) / 86400000);
  }
  function orderSum(o) {
    return o.price ? money(o.price) + ' ₽' : (o.quote_low ? '~' + money(o.quote_low) + ' ₽' : '');
  }
  function deskRows() {
    var rows = [];
    (st.desk || []).forEach(function (o) {
      if (o.paused) return;
      var left = dlLeft(o), quiet = silentDays(o);
      var r = null;
      if (left !== null && left < 0) {
        r = { sc: 100 + Math.min(-left, 30), ic: '🔥', why: 'срок вышел ' + (-left) + ' дн назад', cls: 'fire' };
      } else if (left !== null && left <= 2 && 'work check fix prepay priced new'.indexOf(o.status) >= 0) {
        r = { sc: 96 - left, ic: '⏳', why: left === 0 ? 'сдача сегодня' : left === 1 ? 'сдача завтра' : 'сдача через 2 дня', cls: 'fire' };
      } else if (o.claimed) {
        r = { sc: 85, ic: '💳', why: 'клиент отметил оплату — сверьте и подтвердите', cls: 'act' };
      } else if (o.status === 'new') {
        r = { sc: 80, ic: '🆕', why: 'новая заявка — посмотрите и назначьте цену', cls: 'act' };
      } else if (o.status === 'fix') {
        r = { sc: 75, ic: '✏️', why: 'клиент ждёт правки', cls: 'act' };
      } else if (o.status === 'priced' && quiet >= 2) {
        r = { sc: 60, ic: '🤝', why: 'предложение висит ' + quiet + ' дн — напомните о себе', cls: '' };
      } else if (o.status === 'prepay' && quiet >= 2) {
        r = { sc: 58, ic: '💤', why: 'счёт не оплачен ' + quiet + ' дн — стоит напомнить', cls: '' };
      } else if (o.status === 'check' && quiet >= 5) {
        r = { sc: 50, ic: '👀', why: 'на проверке ' + quiet + ' дн — поторопите с приёмкой', cls: '' };
      }
      if (!r) return;
      r.o = o;
      rows.push(r);
    });
    rows.sort(function (a, b) { return b.sc - a.sc; });
    return rows;
  }
  function deskBlock() {
    if (st.desk === null) {
      loadDesk();
      return '<p class="caps" style="margin:0 0 8px">Сегодня на столе</p><div class="ag-empty">Собираем стол…</div>';
    }
    var rows = deskRows();
    var head = '<p class="caps" style="margin:0 0 8px">Сегодня на столе' +
      (rows.length ? ' · ' + rows.length : '') + '</p>';
    if (!rows.length) return head + '<div class="ag-attn" style="border-left-color:var(--ag-ok)">' +
      '<div class="aa-row" style="cursor:default"><span>🕊</span><span class="aa-what">Стол чист — срочного нет. Загляните в календарь сдач ниже.</span></div></div>';
    var vis = rows.slice(0, 8);
    return head + '<div class="ag-desk">' + vis.map(function (r) {
      var o = r.o;
      var who = o.client && o.client.guest ? o.client.name : (o.client ? o.client.name : '');
      return '<button type="button" class="dk-row ' + r.cls + '" data-open-order="' + o.id + '">' +
        '<span class="dk-ic">' + r.ic + '</span>' +
        '<span class="dk-main"><b>№' + o.id + ' · ' + esc(o.work_label || '') + '</b>' +
        '<span class="dk-why">' + esc(r.why) + (who ? ' · ' + esc(who) : '') + '</span></span>' +
        '<span class="dk-sum">' + orderSum(o) + '</span>' +
        '<span class="dk-go">→</span></button>';
    }).join('') +
    (rows.length > 8
      ? '<button type="button" class="ag-linkbtn" data-go="attention" style="margin:8px 0 0">ещё ' + (rows.length - 8) + ' — во вкладке «Заказы» →</button>'
      : '') +
    '</div>';
  }
  function calBlock() {
    if (st.desk === null) return '';
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var byDay = {}, over = [];
    (st.desk || []).forEach(function (o) {
      var left = dlLeft(o);
      if (left === null) return;
      if (left < 0) { over.push(o); return; }
      (byDay[o.deadline_date] = byDay[o.deadline_date] || []).push(o);
    });
    var DOW = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
    var chips = '';
    if (over.length) {
      chips += '<button type="button" class="cal-day fire' + (st.calDay === 'over' ? ' on' : '') + '" data-cal="over">' +
        '<span class="cd-dow">срок</span><b>!</b><span class="cd-n">' + over.length + '</span></button>';
    }
    for (var i = 0; i < 14; i++) {
      var d = new Date(today.getTime() + i * 86400000);
      var iso = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      var list = byDay[iso] || [];
      chips += '<button type="button" class="cal-day' + (list.length ? ' has' : '') +
        (st.calDay === iso ? ' on' : '') + '" data-cal="' + iso + '">' +
        '<span class="cd-dow">' + (i === 0 ? 'сег' : i === 1 ? 'зав' : DOW[d.getDay()]) + '</span>' +
        '<b>' + d.getDate() + '</b>' +
        (list.length ? '<span class="cd-n">' + list.length + '</span>' : '') + '</button>';
    }
    var sel = st.calDay === 'over' ? over : (st.calDay ? (byDay[st.calDay] || []) : null);
    var selHtml = '';
    if (sel) {
      selHtml = sel.length
        ? '<div class="ag-attn" style="margin-top:8px">' + sel.map(function (o) {
            var left = dlLeft(o);
            return '<div class="aa-row" data-open-order="' + o.id + '"><span>' + stMeta(o.status)[0] + '</span>' +
              '<span class="aa-what"><b>№' + o.id + ' · ' + esc(o.work_label || '') + '</b>' +
              (o.deadline_text ? ' — «' + esc(o.deadline_text) + '»' : '') +
              (left !== null && left < 0 ? ' · срок вышел ' + (-left) + ' дн назад' : '') +
              '</span><span class="aa-go">' + orderSum(o) + ' →</span></div>';
          }).join('') + '</div>'
        : '<div class="ag-empty" style="margin-top:8px">На этот день сдач нет.</div>';
    }
    return '<p class="caps" style="margin:18px 0 8px">Календарь сдач · две недели</p>' +
      '<div class="ag-cal">' + chips + '</div>' + selHtml;
  }

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
    if (ov.qa && ov.qa.pending) attn.push({ f: '@qa', ic: '📮', t: '<b>Вопросы в приёмной: ' + ov.qa.pending + '</b> — ответить в течение дня' });
    var vs = ov.visits || {};
    return '' +
      deskBlock() +
      calBlock() +
      '<p class="caps" style="margin:18px 0 8px">Пульс мастерской</p>' +
      '<div class="ag-tiles">' +
      tile(by.new || 0, 'новые заявки', by.new ? 'warn' : '', 'new') +
      tile(ov.claimed || 0, 'оплаты на сверке', ov.claimed ? 'warn' : '', 'attention') +
      tile(active, 'активные заказы', '', 'active') +
      tile((by.fix || 0), 'в правках', by.fix ? 'warn' : '', 'fix') +
      tile(money(ov.month && ov.month.revenue) + ' ₽', 'выручка за 30 дней', 'calm') +
      tile('👁 ' + (vs.online || 0), 'на сайте сейчас', vs.online ? 'calm' : '', '@visits') +
      tile(vs.uniq || 0, 'посетителей за сутки', '', '@visits') +
      tile(ov.subs_active || 0, '⭐ подписчиков', ov.subs_claimed ? 'warn' : 'calm') +
      '</div>' +
      weeksChart(ov) +
      miniVisits() +
      tplSubs(ov) +
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

  /* -------- подписки «Салон+»: свой платёжный контур, сверка отдельно --------
     Подписка — не заказ: здесь только «оплата получена → активировать»
     и «закрыть оформление». Активация и уведомления — само. */
  function tplSubs(ov) {
    var sd = st.subs;
    var pend = (sd && sd.pending) || [];
    if (!pend.length && !(ov.subs_pending > 0)) return '';
    var rows;
    if (!sd) {
      rows = '<div class="aa-row" style="cursor:default"><span>⏳</span>' +
        '<span class="aa-what">Листаем оформления…</span></div>';
    } else {
      rows = pend.map(function (s) {
        var u = s.user || {};
        var who = esc(u.name || 'клиент') +
          (u.username ? ' (@' + esc(u.username) + ')' : (u.email ? ' · ' + esc(u.email) : ''));
        return '<div class="aa-row" style="cursor:default;align-items:flex-start"><span>' + (s.claimed ? '💳' : '⏳') + '</span>' +
          '<span class="aa-what"><b>' + esc(s.label) + '</b> · ' + esc(s.period_label) + ' · <b>' + money(s.price) + ' ₽</b> — ' + who +
          (s.claimed ? '<br><b>клиент отметил оплату — сверьте поступление</b>' : '<br>ждёт оплату клиента') +
          '<span class="petit" style="display:block;opacity:.7">' + (s.via ? 'оформлена: ' + esc(s.via) + ' · ' : '') + dt(s.created_at) + '</span></span>' +
          '<span class="aa-go" style="white-space:nowrap">' +
          '<button type="button" class="ag-linkbtn" data-sub-ok="' + s.id + '">✅ оплата получена</button><br>' +
          '<button type="button" class="ag-linkbtn" data-sub-no="' + s.id + '">✖ закрыть</button></span></div>';
      }).join('');
    }
    return '<p class="caps" style="margin:18px 0 8px">⭐ Подписки — оплата отдельно от заказов</p>' +
      '<div class="ag-attn">' + rows + '</div>';
  }

  /* мини-лента заходов на «Пульсе»: последние 6, клик — во вкладку «Визиты» */
  function miniVisits() {
    var rows = (st.visits || []).slice(0, 6);
    if (!rows.length) return '';
    return '<p class="caps" style="margin:18px 0 8px">Последние заходы ' +
      '<button type="button" class="ag-linkbtn" data-tab-go="visits" style="text-transform:none;letter-spacing:0;font-size:12px">все визиты →</button></p>' +
      '<div class="ag-vwrap">' + rows.map(visitRow).join('') + '</div>';
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
      .concat([['archive', '🗄 Архив'], ['trash', '🗑 Корзина']]);
    box.innerHTML = chips.map(function (c) {
      return '<button type="button" class="ag-chip' + (st.filter === c[0] ? ' on' : '') + '" data-f="' + c[0] + '">' + c[1] + '</button>';
    }).join('') +
      '<input class="ag-search" id="agQ" placeholder="Поиск: №, тема, ник… (Enter)" value="' + esc(st.q) + '">' +
      '<select class="ag-sort" id="agSort" title="Порядок списка">' +
        '<option value="fresh"' + (st.sort === 'fresh' ? ' selected' : '') + '>сначала новые</option>' +
        '<option value="updated"' + (st.sort === 'updated' ? ' selected' : '') + '>по последнему движению</option>' +
        '<option value="deadline"' + (st.sort === 'deadline' ? ' selected' : '') + '>по сроку сдачи</option>' +
      '</select>' +
      '<button type="button" class="ag-chip' + (st.bulk ? ' on' : '') + '" id="agBulkToggle" ' +
      'title="Выделить несколько заказов и разом закрепить, скрыть, покрасить или убрать в корзину">☑ Выбрать</button>';
  }

  /* панель массовых действий — живёт под списком, пока включён режим ☑ */
  function bulkBar() {
    if (!st.bulk) return '';
    var n = st.bulk.size;
    var trash = st.filter === 'trash';
    return '<div class="ag-bulkbar" id="agBulkBar">' +
      '<b>' + (n ? 'выбрано: ' + n : 'отметьте заказы галочками') + '</b>' +
      (n ? '<button type="button" class="btn btn-line" data-bulk="pin">📌 Закрепить</button>' +
        '<button type="button" class="btn btn-line" data-bulk="unpin">Открепить</button>' +
        '<span class="ag-pal">' + ['red', 'gold', 'green', 'blue', 'violet'].map(function (c) {
          return '<button type="button" class="clr-dot" data-bulk-clr="' + c + '" title="' + CLR_NAME[c] + '" style="background:' + CLR[c] + '"></button>';
        }).join('') +
        '<button type="button" class="clr-dot" data-bulk-clr="" title="без цвета" style="background:transparent"></button></span>' +
        (trash
          ? '<button type="button" class="btn btn-wax" data-bulk="restore">↩ Восстановить</button>' +
            '<button type="button" class="btn btn-line" data-bulk="purge" style="color:var(--wax,#A8402F)">🔥 Стереть навсегда</button>'
          : '<button type="button" class="btn btn-line" data-bulk="hide">🗄 Скрыть</button>' +
            '<button type="button" class="btn btn-wax" data-bulk="trash">🗑 В корзину</button>')
      : '') +
      '<button type="button" class="ag-linkbtn" data-bulk="off" style="margin-left:auto">✕ готово</button>' +
      '</div>';
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
      /* цветной корешок мастера — поверх маркера выбранности */
      var clrStyle = o.color && CLR[o.color]
        ? ' style="border-left-color:' + CLR[o.color] + ';border-left-width:4px"' : '';
      var ck = st.bulk
        ? '<input type="checkbox" class="ag-ck" data-ck="' + o.id + '"' +
          (st.bulk.has(o.id) ? ' checked' : '') + '>'
        : '';
      return '<button type="button" class="ag-row' + (o.id === st.sel ? ' sel' : '') +
        (o.pinned ? ' pin' : '') + '" data-id="' + o.id + '"' + clrStyle + '>' +
        ck +
        (o.pinned ? '<span class="r-pin" title="закреплён">📌</span>' : '') +
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
    var bb = document.getElementById('agBulkWrap');
    if (bb) bb.innerHTML = bulkBar();
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

  /* какой части сдачи соответствует этап оплаты (зеркало payments.kind_stage) */
  function kindStage(o, kind) {
    if ((o.stages_total || 1) === 3) return { prepay: 1, stage2: 2, rest: 3 }[kind] || 1;
    return { prepay: 1, rest: 2 }[kind] || 1;
  }

  /* долг, блокирующий передачу части (зеркало payments.unpaid_for_part):
     финальная часть — весь неоплаченный остаток; отметка «оплатил» ≠ оплата */
  function debtForPart(o, part) {
    var total = o.stages_total || 1;
    var block = (o.plan || []).filter(function (p) {
      if (p.state === 'paid') return false;
      return part >= total || kindStage(o, p.kind) <= part;
    });
    return {
      amount: block.reduce(function (s, p) { return s + (p.amount || 0); }, 0),
      claimed: block.some(function (p) { return p.state === 'claimed'; }),
      labels: block.map(function (p) { return p.label; })
    };
  }

  function debtLine(d) {
    return money(d.amount) + ' ₽' +
      (d.labels.length ? ' (' + d.labels.join(' + ').toLowerCase() + ')' : '');
  }

  /* сколько дней назад выставлен счёт (part_ready / final_ready) */
  function invoiceAgeDays(o) {
    var evs = o.events || []; /* новые сверху */
    for (var i = 0; i < evs.length; i++) {
      if (evs[i].kind === 'part_ready' || evs[i].kind === 'final_ready') {
        var t = new Date(evs[i].at + (String(evs[i].at).indexOf('Z') < 0 ? 'Z' : ''));
        if (isNaN(t)) return null;
        return Math.floor((Date.now() - t) / 86400000);
      }
      if (evs[i].kind === 'status') return null;
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
      if (o.due_now && o.due_now.amount > 0) {
        var fAge = invoiceAgeDays(o);
        return [fAge >= 2 ? 'due' : '', '🏁 Финал объявлен готовым — клиент получил счёт на остаток ' +
          money(o.due_now.amount) + ' ₽' +
          (fAge >= 1 ? ' <b>ещё ' + fAge + ' дн. назад — не оплачен</b>' : '') +
          '. Файл придержан. Поторопить: кнопка «🔔 Напомнить об оплате» ниже (авто-напоминания идут раз в день, до 3 раз).'];
      }
      return ['due', '🏁 <b>Остаток получен — передайте финальную часть.</b> Сдайте файлом ниже, клиент получит кнопки приёмки.'];
    }
    if (o.part_ready && 'work fix'.indexOf(o.status) >= 0) {
      if (o.due_now && o.due_now.amount > 0) {
        var pAge = invoiceAgeDays(o);
        return [pAge >= 2 ? 'due' : '', '📘 Часть ' + o.part_ready + ' объявлена готовой — клиент получил счёт ' +
          money(o.due_now.amount) + ' ₽ (' + esc((o.due_now.label || 'этап').toLowerCase()) + ')' +
          (pAge >= 1 ? ' <b>ещё ' + pAge + ' дн. назад — не оплачен</b>' : '') +
          '. Файл придержан. Поторопить: кнопка «🔔 Напомнить об оплате» ниже (авто-напоминания идут раз в день, до 3 раз).'];
      }
      return ['due', '📘 <b>Оплата за часть ' + o.part_ready + ' получена — передайте её.</b> Сдайте файлом ниже, клиент получит кнопки приёмки.'];
    }
    if (o.due_now && o.due_now.amount > 0 && 'check work'.indexOf(o.status) >= 0)
      return ['due', '💳 <b>Созрел неоплаченный этап: ' + money(o.due_now.amount) + ' ₽ (' +
        esc((o.due_now.label || 'этап').toLowerCase()) +
        ').</b> Новые части не передавайте до оплаты — напомнить клиенту можно кнопкой «🔔 Напомнить об оплате» ниже.'];
    if (o.status === 'new')
      return ['due', '💰 <b>Новая заявка.</b> Изучите требования и отправьте предложение с ценой — клиент получит его в Telegram и в кабинете.'];
    if (o.status === 'fix')
      return ['due', '✏️ <b>Клиент запросил правки' + ((o.stages_total || 1) > 1 ? ' по части ' + o.stage : '') + '.</b> Замечания — в переписке. Готовую версию сдайте файлом с пометкой «сдача» — клиент снова получит кнопки приёмки.' +
        (o.due_now && o.due_now.amount > 0 ? ' <b>Этап при этом не оплачен (' + money(o.due_now.amount) + ' ₽)</b> — исправления передавать можно, но напомните об оплате («🔔» ниже).' : '')];
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
        ' · <button type="button" class="ag-linkbtn" data-open-client="' + o.client.id + '">карточка клиента</button>' +
        ' · <button type="button" class="ag-linkbtn" data-imp-client="' + o.client.id + '">👁 его кабинет</button>';
    return '<p class="ag-meta" style="margin-top:8px">' + who + '</p>' +
      (links ? '<div class="ag-clinks">' + links + '</div>' : '');
  }

  function planBlock(o) {
    var plan = o.plan || [];
    var cur = o.stages_total || 1;
    var planSel = '<select id="agPlanSel">' + [1, 2, 3].map(function (n) {
      return '<option value="' + n + '"' + (cur === n ? ' selected' : '') + '>' + PLAN_LBL[n] + '</option>';
    }).join('') + '</select>';
    var remindShown = false;
    var rows = plan.map(function (p) {
      var m = PL_ST[p.state] || ['', ''];
      var act = '';
      if (p.state === 'claimed' || p.state === 'due')
        act = '<button type="button" class="btn btn-ink" data-pay-kind="' + p.kind + '" data-pay-amount="' + p.amount + '">Получена ✓</button>';
      if (p.state === 'due' && !remindShown) {
        /* напоминание уходит по ближайшему созревшему этапу — кнопка у него */
        remindShown = true;
        act += '<button type="button" class="btn btn-line" data-remind-pay="1" ' +
          'title="Клиенту заново уйдёт счёт с реквизитами и кассой — в Telegram, на почту и в кабинет">🔔 Напомнить</button>';
      }
      return '<div class="pl-row"><span class="pl-n">' + p.n + '</span>' +
        '<span class="pl-what">' + esc(p.label) + ' <span class="pl-st ' + m[1] + '">' + m[0] + '</span></span>' +
        '<span class="pl-sum">' + money(p.amount) + ' ₽</span>' + act + '</div>';
    }).join('');
    var paid = (o.payments || []).filter(function (p) { return p.status === 'paid'; });
    return '<div class="ag-sec"><span class="caps">Цена и план оплаты' +
      '<span class="sub">' + (o.sub_discount ? '⭐ скидка подписки: −' + money(o.sub_discount) + ' · ' : '') +
      'бонусами списано: ' + money(o.bonus_spent || 0) + ' · деньгами всего: ' + money(o.due_total || o.price || 0) + ' ₽</span></span>' +
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
          tag = o.status === 'check' ? 'у клиента' : o.status === 'fix' ? 'правки'
              : ((o.part_ready || 0) === n ? 'ждёт оплату' : 'в работе');
        }
        cells += '<div class="ag-part ' + cls + '"><b>Часть ' + n + '</b><span class="st">' + tag + '</span></div>';
      }
    }
    var canDeliver = 'work fix check'.indexOf(o.status) >= 0;
    var finalStage = total <= 1 || (o.stage || 1) >= total;
    var unpaid = (o.plan || []).some(function (p) { return p.state !== 'paid'; });
    var announced = (o.part_ready || 0) >= (o.stage || 1);
    /* долг текущей части: в work сдача заблокирована сервером, пока не оплачено
       (в fix/check повторная передача той же части свободна — клиент её видел) */
    var debt = debtForPart(o, o.stage || 1);
    var held = o.status === 'work' && debt.amount > 0;
    var finBtn = '';
    if ('work fix'.indexOf(o.status) >= 0 && unpaid) {
      if (finalStage && !o.final_ready)
        finBtn = '<button type="button" class="btn btn-wax" id="agFinalReady">🏁 Финал готов — счёт на остаток (файл придержать)</button>';
      else if (!finalStage && !announced)
        finBtn = '<button type="button" class="btn btn-wax" id="agPartReady">📣 Часть ' + o.stage + ' готова — счёт клиенту (файл придержать)</button>';
      else if (o.due_now && o.due_now.amount > 0)
        finBtn = '<button type="button" class="btn btn-wax" data-remind-pay="1">🔔 Напомнить об оплате (' + money(o.due_now.amount) + ' ₽)</button>';
    }
    var deliverWord = o.final_ready ? 'финал'
      : (total > 1 ? (announced ? 'Передать часть ' + o.stage : 'часть ' + o.stage) : 'работу');
    return '<div class="ag-sec"><span class="caps">Сдача работы' +
      '<span class="sub">' + (total > 1 ? 'часть ' + o.stage + ' из ' + total + ' · принято ' + (o.parts_done || 0) : '') +
      (o.final_ready ? ' · 🏁 финал придержан до оплаты'
        : (announced && 'work fix'.indexOf(o.status) >= 0 ? ' · 📣 счёт за часть ' + o.part_ready + ' выставлен, файл придержан' : '')) +
      '</span></span>' +
      (cells ? '<div class="ag-parts">' + cells + '</div>' : '') +
      (canDeliver
        ? '<div class="ag-actrow" style="margin-top:8px">' +
          finBtn +
          '<label class="btn ' + (held ? 'btn-line' : 'btn-wax') + ' btn-upload">📦 ' +
          (announced && !o.final_ready && total > 1 ? '' : 'Сдать ') + deliverWord + ' файлом' +
          (held ? ' · этап не оплачен ⚠️' : '') +
          '<input type="file" id="agDeliverFile"></label>' +
          '<label class="btn btn-line btn-upload">🔒 Предпросмотр клиенту<input type="file" id="agPreviewFile" accept=".pdf,.doc,.docx,.odt,.rtf,.txt"></label>' +
          '<label class="btn btn-line btn-upload">📎 Просто отправить файл<input type="file" id="agPlainFile"></label>' +
          (o.status !== 'check' ? '<button type="button" class="btn btn-line" id="agDeliverMark">Файлы уже у клиента — зафиксировать сдачу</button>' : '') +
          '</div>' +
          '<p class="ag-note"><b>Правило мастерской: сначала оплата части — потом файл.</b> ' +
          '«Часть готова / Финал готов» выставляет клиенту счёт этапа; файл передаёте после подтверждения оплаты — придёт напоминание. ' +
          'Пока этап не оплачен, «Сдать файлом» и «Просто отправить» придерживаются — передать вопреки правилу можно только с отдельным подтверждением. ' +
          '<b>«🔒 Предпросмотр»</b> — для «покажи работу до оплаты»: оригинал остаётся у вас, клиент получает копию с водяными знаками, её нельзя ни скопировать, ни сдать; счёт этапа приложится сам.</p>'
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

  /* быстрые действия мастера: пин, цвет, скрыть, корзина — прямо в шапке дела */
  function quickRow(o) {
    var pal = ['red', 'gold', 'green', 'blue', 'violet'].map(function (c) {
      return '<button type="button" class="clr-dot' + (o.color === c ? ' on' : '') + '" data-card-clr="' + c + '" ' +
        'title="метка «' + CLR_NAME[c] + '»" style="background:' + CLR[c] + '"></button>';
    }).join('') +
      '<button type="button" class="clr-dot' + (!o.color ? ' on' : '') + '" data-card-clr="" title="без метки" style="background:transparent"></button>';
    return '<div class="ag-quick">' +
      '<button type="button" class="ag-qbtn' + (o.pinned ? ' on' : '') + '" data-card-flag="pin" ' +
        'title="Закреплённые заказы всегда наверху списка">📌 ' + (o.pinned ? 'Закреплён' : 'Закрепить') + '</button>' +
      '<span class="ag-pal" title="Цветная метка — для своих пометок: срочное, ждёт, VIP…">' + pal + '</span>' +
      (o.deleted
        ? '<button type="button" class="ag-qbtn" data-card-flag="restore">↩ Вернуть из корзины</button>' +
          '<button type="button" class="ag-qbtn" data-card-flag="purge" ' +
            'title="Стереть дело навсегда — с хроникой, файлами и перепиской. Возврата нет" ' +
            'style="color:var(--wax,#A8402F)">🔥 Стереть навсегда</button>'
        : '<button type="button" class="ag-qbtn' + (o.archived_admin ? ' on' : '') + '" data-card-flag="hide" ' +
            'title="Скрыть с рабочего стола — заказ уедет в «Архив», клиент ничего не заметит">' +
            (o.archived_admin ? '🗄 В архиве' : '🗄 Скрыть') + '</button>' +
          '<button type="button" class="ag-qbtn" data-card-flag="trash" ' +
            'title="Убрать в корзину: пропадёт из всех списков, кроме «Корзины». Данные не стираются">🗑 В корзину</button>') +
      '</div>';
  }

  /* «Деньги по делу» — вся стоимость и скидки в одном месте, без раскопок:
     цена → каждая скидка с основанием → деньгами → получено → остаток */
  function moneyBlock(o) {
    var rows = [];
    if (!o.price) {
      rows.push(['Смета сайта', o.quote_low
        ? '~' + money(o.quote_low) + (o.quote_high ? ' – ' + money(o.quote_high) : '') + ' ₽'
        : 'без вилки']);
      rows.push(['Цена', '<b>не назначена</b> — клиент ждёт оценку']);
      if (o.promo_code) rows.push(['🎟 Промокод ' + esc(o.promo_code), 'привязан — скидка посчитается от цены']);
      if (o.gift_code) rows.push(['🎁 Сертификат ' + esc(o.gift_code), 'привязан — зачтётся при цене']);
      if (o.bonus_spent) rows.push(['💎 Бонусы', '−' + money(o.bonus_spent)]);
    } else {
      rows.push(['Цена', '<b>' + money(o.price) + ' ₽</b>']);
      if (o.promo_discount) rows.push(['🎟 Промокод ' + esc(o.promo_code || ''), '−' + money(o.promo_discount) + ' ₽']);
      else if (o.promo_code) rows.push(['🎟 Промокод ' + esc(o.promo_code), 'не применился (условия кода)']);
      if (o.sub_discount) rows.push(['⭐ Абонемент', '−' + money(o.sub_discount) + ' ₽']);
      if (o.bonus_spent) rows.push(['💎 Бонусы клиента', '−' + money(o.bonus_spent) + ' ₽']);
      if (o.gift_amount) rows.push(['🎁 Сертификат ' + esc(o.gift_code || ''), '−' + money(o.gift_amount) + ' ₽ (зачёт)']);
      else if (o.gift_code) rows.push(['🎁 Сертификат ' + esc(o.gift_code), 'привязан, зачтётся при пересчёте']);
      var paid = 0, claimed = 0;
      (o.plan || []).forEach(function (p) {
        if (p.state === 'paid') paid += p.amount || 0;
        else if (p.state === 'claimed') claimed += p.amount || 0;
      });
      var total = o.due_total || 0;
      rows.push(['💵 Деньгами к оплате', '<b>' + money(total) + ' ₽</b>']);
      if (paid) rows.push(['Получено', money(paid) + ' ₽']);
      if (claimed) rows.push(['Отмечено клиентом (сверить)', money(claimed) + ' ₽']);
      rows.push(['Остаток', '<b>' + money(Math.max(0, total - paid)) + ' ₽</b>']);
    }
    return '<div class="ag-sec ag-money"><span class="caps">Деньги по делу</span><div class="ag-kv">' +
      rows.map(function (r) { return '<div><span>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('') +
      '</div></div>';
  }

  function drawCard() {
    var box = document.getElementById('agCard');
    var o = st.card;
    if (!box || !o) return;
    var hint = nextHint(o);
    box.innerHTML =
      '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline">' +
      '<span class="mono petit">Дело №' + o.id + ' · ' + esc(o.source || '') + ' · создано ' + dt(o.created_at) +
      (o.archived_admin ? ' · 🗄 в архиве' : '') + (o.deleted ? ' · 🗑 в корзине' : '') + '</span>' +
      '<span>' + (o.paused ? '<span class="ag-stamp st-cancel" style="margin-right:6px">⏸ пауза</span>' : '') +
      stamp(o.status) + '</span></div>' +
      '<h2>' + (o.pinned ? '📌 ' : '') + esc(o.work_label || '') + '</h2>' +
      quickRow(o) +
      (o.topic ? '<p class="ag-topic">«' + esc(o.topic) + '»</p>' : '') +
      clientLine(o) +
      (hint ? '<div class="ag-next ' + hint[0] + '">' + hint[1] + '</div>' : '') +
      moneyBlock(o) +
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
      '<button type="button" class="btn btn-line" data-imp-client="' + c.id + '">👁 Открыть кабинет клиента</button>' +
      '<button type="button" class="btn ' + (c.banned ? 'btn-line' : 'btn-wax') + '" id="agBan" data-on="' + (c.banned ? '0' : '1') + '">' +
      (c.banned ? 'Снять блокировку' : '⛔️ Заблокировать клиента') + '</button></div>' +
      '<p class="ag-note">«Открыть кабинет» — тихий вход на правах клиента в новой вкладке: посмотреть его глазами, ' +
      'поправить, помочь. Клиент ничего не заметит — визиты и метки «прочитано» не трогаются.<br>' +
      'Блокировка закрывает приём новых заявок с сайта от этого аккаунта.</p></div>';
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

  /* ---------------- «ОТКРЫТАЯ ПРИЁМНАЯ» ---------------- */
  var QA_ST = {
    pending: '⏳ ждёт ответа', published: '📮 на сайте',
    answered: '🤫 отвечен тихо', rejected: '🚫 отклонён'
  };

  function qaTagSelect(id, cur) {
    var tags = st.qaTags || {};
    var opts = '<option value=""' + (cur ? '' : ' selected') + '>— рубрика —</option>' +
      Object.keys(tags).map(function (k) {
        return '<option value="' + k + '"' + (cur === k ? ' selected' : '') + '>' + esc(tags[k]) + '</option>';
      }).join('');
    return '<select id="qaT-' + id + '" class="ag-inp" style="max-width:220px">' + opts + '</select>';
  }

  function qaCard(q) {
    var pendingQ = q.status === 'pending';
    var raw = q.question_raw && q.question_raw !== q.question
      ? '<details style="margin:8px 0"><summary class="petit" style="cursor:pointer">Исходник гостя (до чистки)</summary>' +
        '<blockquote style="font-style:italic;margin-top:6px">«' + esc(q.question_raw) + '»</blockquote></details>' : '';
    var who = esc(q.pseudonym || 'Аноним') +
      (q.quiet ? ' · 🤫 тихий (без публикации)' : '') +
      (q.email ? ' · 📧 почта оставлена' : ' · без почты') +
      (q.source === 'archive' ? ' · 📜 архив' : '');
    var techno = '<span class="petit" style="opacity:.7">vid ' + esc((q.vid || '—').slice(0, 14)) +
      ' · ip ' + esc(q.ip || '—') + (q.same ? ' · 🙋 таких же: ' + q.same : '') + '</span>';
    var btns = [];
    if (pendingQ && !q.quiet) btns.push('<button type="button" class="btn btn-ink" data-qa-act="publish" data-qa-id="' + q.id + '">📮 Опубликовать с ответом</button>');
    if (pendingQ && q.email) btns.push('<button type="button" class="btn btn-line" data-qa-act="answer_quiet" data-qa-id="' + q.id + '">🤫 Ответить письмом' + (q.quiet ? '' : ' (без публикации)') + '</button>');
    if (pendingQ && q.quiet && !q.email) btns.push('<span class="petit">Тихий вопрос без почты — ответить некуда; можно отклонить.</span>');
    if (!pendingQ) btns.push('<button type="button" class="btn btn-line" data-qa-act="save" data-qa-id="' + q.id + '">💾 Сохранить правки</button>');
    if (q.status === 'published') {
      btns.push('<button type="button" class="btn btn-line" data-qa-act="' + (q.pinned ? 'unpin' : 'pin') + '" data-qa-id="' + q.id + '">' + (q.pinned ? '📌 Открепить' : '📌 Закрепить сверху') + '</button>');
      btns.push('<button type="button" class="btn btn-line" data-qa-act="unpublish" data-qa-id="' + q.id + '">👁 Снять с сайта</button>');
    }
    if (q.status === 'answered' && !q.quiet) btns.push('<button type="button" class="btn btn-line" data-qa-act="publish" data-qa-id="' + q.id + '">📮 Опубликовать</button>');
    if (pendingQ) btns.push('<button type="button" class="btn btn-line" data-qa-act="reject" data-qa-id="' + q.id + '">🚫 Отклонить</button>');
    btns.push('<button type="button" class="btn btn-line" data-qa-act="ban" data-qa-id="' + q.id + '" style="color:var(--wax)">⛔ Бан автора</button>');
    btns.push('<button type="button" class="btn btn-line" data-qa-act="delete" data-qa-id="' + q.id + '" style="color:var(--wax)">🗑 Удалить</button>');
    return '<div class="ag-rv ' + (pendingQ ? 'pending' : '') + '" id="qaRow-' + q.id + '">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline">' +
      '<b>Входящий ' + esc(q.num) + '</b>' +
      '<span class="rv-meta">' + (QA_ST[q.status] || esc(q.status)) + (q.pinned ? ' · 📌' : '') + ' · ' + dt(q.created_at) + '</span></div>' +
      '<p class="rv-meta" style="margin-top:4px">' + who + '</p>' + raw +
      '<div style="display:grid;gap:8px;margin-top:8px">' +
      '<label class="petit">Вопрос (публикуемая формулировка — чистите деанон и резкие формулировки)</label>' +
      '<textarea id="qaQ-' + q.id + '" class="ag-inp" rows="3" maxlength="600">' + esc(q.question) + '</textarea>' +
      '<label class="petit">Ответ мастера</label>' +
      '<textarea id="qaA-' + q.id + '" class="ag-inp" rows="' + (pendingQ ? 6 : 4) + '" maxlength="3000" placeholder="Спокойно, по делу, с тихим мостиком к услуге, где уместно">' + esc(q.answer || '') + '</textarea>' +
      qaTagSelect(q.id, q.tag) + '</div>' +
      '<div class="ag-actrow" style="margin-top:10px;flex-wrap:wrap">' + btns.join('') + '</div>' +
      '<p style="margin-top:6px">' + techno + '</p></div>';
  }

  function tplQA() {
    if (st.qa === null) return '<div class="ag-empty">Загружаем приёмную…</div>';
    var pending = st.qa.filter(function (q) { return q.status === 'pending'; });
    var rest = st.qa.filter(function (q) { return q.status !== 'pending'; });
    var head = '<p class="petit" style="margin-bottom:12px">«Открытая приёмная» на сайте: гость спрашивает анонимно, ' +
      'вы отвечаете — пара публикуется навсегда. Всё премодерируется: без вашего решения на сайт не попадает ни буквы. ' +
      'Формулировку вопроса можно (и нужно) редактировать — это заявлено в правилах приёмной. ' +
      'Отвечать можно и из Telegram: бот присылает каждый новый вопрос с кнопками, команда /qa — очередь. ' +
      '<a class="ag-linkbtn" href="priyomnaya.html" target="_blank" rel="noopener">Открыть приёмную на сайте ↗</a></p>';
    var out = head;
    out += '<div class="ag-sec" style="border-top:0;padding-top:0;margin-top:0"><span class="caps">Ждут ответа' +
      (pending.length ? ' · ' + pending.length : '') + '</span>';
    out += pending.length ? pending.map(qaCard).join('')
      : '<div class="ag-empty">Новых вопросов нет. Появится — придёт в Telegram и сюда.</div>';
    out += '</div>';
    out += '<div class="ag-sec"><span class="caps">Лента приёмной · ' + rest.length + '</span>' +
      (rest.length ? rest.map(qaCard).join('') : '<div class="ag-empty">Пока пусто.</div>') + '</div>';
    return out;
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
  function maintSec(ov) {
    var m = ov.maintenance || {};
    function row(key, on, title, note) {
      return '<div class="ag-actrow" style="align-items:center;gap:10px">' +
        '<button type="button" class="btn ' + (on ? 'btn-wax' : 'btn-line') + '" data-maint="' + key + '" data-on="' + (on ? 1 : 0) + '">' +
        (on ? '⏸ ' + title + ': ЗАКРЫТО — открыть' : '▶ ' + title + ': работает — закрыть') + '</button>' +
        '<span class="petit">' + note + '</span></div>';
    }
    return '<div class="ag-sec" style="border-top:0;margin-top:0;padding-top:0"><span class="caps">Техработы</span>' +
      ((m.site || m.bot) ? '<p class="petit" style="color:var(--wax)"><b>Внимание: занавес опущен.</b> Не забудьте открыть, когда закончите.</p>' : '') +
      row('site', m.site, 'Сайт',
          'Гости видят вывеску «Идут переплётные работы» (страница сама вернёт их, когда откроемся). ' +
          'Заявки, кабинет, эта админка и бот продолжают работать.') +
      row('bot', m.bot, 'Бот',
          'Клиентам в Telegram бот вежливо отвечает про короткий антракт. Вы (мастер) видите бота как обычно.') +
      '</div>' +
      '<div class="ag-sec"><span class="caps">Набор месяца — честная квота</span>' +
      '<div class="ag-actrow" style="align-items:center;gap:10px">' +
      '<input type="number" id="agSlots" min="0" max="500" value="' + (ov.slots_quota || 0) + '" style="width:96px">' +
      '<button type="button" class="btn btn-line" id="agSlotsSave">Сохранить</button>' +
      '<span class="petit">занято в этом месяце: <b>' + (ov.slots_taken || 0) + '</b></span></div>' +
      '<p class="ag-note">Квота — ваша политика качества: «мастерская берёт столько, сколько ведёт лично». ' +
      'Сайт покажет «Набор на месяц: свободно X из N» в каталоге и смете; занятые места считаются сами — ' +
      'по реальным заявкам месяца (без отмен, отдельных услуг и подписок). 0 — плашка скрыта. ' +
      'Рисовать цифры не надо: живой счётчик убедительнее и не подставляет бренд.</p></div>';
  }

  function drawSettings(box) {
    var ov = st.ov || {};
    box.innerHTML =
      '<div class="ag-card" style="max-width:680px;max-height:none">' +
      maintSec(ov) +
      '<div class="ag-sec"><span class="caps">Реквизиты для переводов</span>' +
      '<div class="ag-actrow"><textarea id="agReq" rows="3" placeholder="Сбер: 0000 0000 0000 0000 (Имя О.)&#10;СБП: +7 900 000-00-00">' + esc(ov.requisites || '') + '</textarea>' +
      '<button type="button" class="btn btn-line" id="agReqSave">Сохранить</button></div>' +
      '<p class="ag-note">Эти реквизиты видят клиенты при оплате переводом — в боте и в кабинете.</p></div>' +

      '<div class="ag-sec"><span class="caps">Оплата этапами</span>' +
      '<p class="petit">Небольшие работы — 2 части (50/50), крупные (диплом, магистерская, Scopus…) — 3 части (30/40/30), как обещает сайт. План ставится автоматически при назначении цены; в карточке заказа его можно поменять, пока этапы не пошли.</p></div>' +

      '<div class="ag-sec"><span class="caps">Инструменты мастерской</span>' +
      '<p class="petit">🖼 <a class="ag-linkbtn" href="admin-covers.html" target="_blank" rel="noopener" style="text-decoration:underline">Мастерская обложек</a> — ' +
      'картинки для постов в фирменном стиле: рубрика внизу, ваш заголовок по центру, скачивание PNG. ' +
      'Пустые заготовки девяти рубрик лежат в папке репозитория «Макеты постов».<br>' +
      '📕 <a class="ag-linkbtn" href="' + S.api.base + '/pamyatka/welcome" target="_blank" rel="noopener" style="text-decoration:underline">Памятка новичка (PDF)</a> — ' +
      'та самая, что бот дарит вместе с 300 бонусами; персональные памятки к выдаче уходят сами при передаче финала.</p></div>' +

      '<div class="ag-sec"><span class="caps">Онлайн-оплата картой</span>' +
      '<p class="petit">' + (ov.pay_online
        ? '✅ Онлайн-касса подключена — клиенты могут платить картой/СБП, статусы двигаются сами.'
        : 'Магазин Robokassa активирован — осталось три шага. ' +
          '<b>1) Робочеки СМЗ:</b> в ЛК Robokassa → Фискализация → «Робочеки СМЗ» → «Перейти с текущего» → «Отправить заявку», ' +
          'затем в приложении «Мой налог» одобрите запрос «Партнёр предлагает подключиться» и проверьте, что сервис стал активен. ' +
          '<b>2) Технические настройки магазина</b> (ЛК → Мои магазины → Настройки): Result URL ' +
          '<span class="mono">https://akademsalon.ru/api/pay/robokassa</span> (метод POST), ' +
          'Success URL и Fail URL — <span class="mono">https://akademsalon.ru/dashboard.html</span> (метод GET), ' +
          'алгоритм расчёта хеша — <b>MD5</b>. ' +
          '<b>3) Ключи:</b> там же возьмите «Идентификатор магазина» и боевые «Пароль #1» / «Пароль #2» ' +
          'и добавьте в <span class="mono">/root/salon_bot/.env</span> строки ROBOKASSA_LOGIN, ROBOKASSA_PASS1, ROBOKASSA_PASS2, ' +
          'затем перезапустите бота (systemctl restart salon-bot-v2) — кнопки «Оплатить картой» включатся сами. ' +
          'Состав корзины (номенклатуру) сайт уже передаёт — чеки НПД сформируются корректно. ' +
          'До этого работает оплата переводом с подтверждением в одну кнопку.') + '</p></div>' +

      '<div class="ag-sec"><span class="caps">Почта</span>' +
      '<p class="petit">' + (ov.mail_on
        ? '✅ Почта работает (support@akademsalon.ru): письма о заказе уходят, вход по коду включён. ' +
          '<b>Нюанс mail.ru:</b> адреса @mail.ru / @bk.ru / @inbox.ru их спам-фильтр может отбивать (550), ' +
          'пока домен не зарегистрирован в <b>postmaster.mail.ru</b> — зайдите туда с любого аккаунта mail.ru, ' +
          'добавьте домен akademsalon.ru и подтвердите права (DNS уже настроен). Отлупы копятся во «Входящих» ящика support@.'
        : (ov.mail_configured
          ? '⚠️ Почта настроена (support@akademsalon.ru), но письма сейчас не уходят: <b>' +
            esc(ov.mail_error || 'SMTP недоступен') + '</b>. ' +
            (/авторизац/i.test(ov.mail_error || '')
              ? 'Как починить: в панели <span class="mono">timeweb.cloud</span> → Почта → ящик support@ проверьте, не заблокирован ли он, ' +
                'и задайте новый пароль. Новый пароль впишите в <span class="mono">/root/salon_bot/.env</span> (строка SMTP_PASS) ' +
                'и перезапустите бота: <span class="mono">systemctl restart salon-bot-v2</span>. ' +
                'Пока логин не проходит, вход по коду на сайте спрятан автоматически.'
              : 'Похоже, хостер держит исходящий SMTP-порт закрытым. Напишите в поддержку Timeweb из панели: ' +
                '«Прошу открыть исходящие SMTP-порты 465 и 587 на VPS 217.18.63.210 — ' +
                'нужна отправка транзакционных писем моего домена akademsalon.ru». После разблокировки всё включится само, без перезапусков.')
          : 'SMTP не настроен — письма клиентам не уходят. Добавьте SMTP_HOST/USER/PASS в /root/salon_bot/.env.')) + '</p></div>' +

      '<div class="ag-sec"><span class="caps">Вход через ВК и Mail.ru</span>' +
      '<p class="petit">' +
        ((ov.oauth && ov.oauth.vk) ? '✅ <b>ВКонтакте</b> подключён — кнопка на экране входа видна. '
          : '<b>ВКонтакте:</b> выключен. Как включить: <span class="mono">id.vk.com</span> → «VK ID для бизнеса» → ' +
            'создать приложение (тип «Web»), Redirect URL: <span class="mono">https://akademsalon.ru/api/auth/vk/callback</span>, ' +
            'включить доступ «E-mail». Полученный ID приложения впишите в <span class="mono">/root/salon_bot/.env</span> ' +
            'строкой VK_CLIENT_ID и перезапустите бота — кнопка появится сама. ') +
        ((ov.oauth && ov.oauth.mailru) ? '✅ <b>Mail.ru</b> подключён.'
          : '<b>Mail.ru:</b> выключен. Как включить: <span class="mono">o2.mail.ru/app/</span> → создать приложение, ' +
            'Redirect URL: <span class="mono">https://akademsalon.ru/api/auth/mailru/callback</span>, scope «userinfo». ' +
            'ID и секрет — в .env строками MAILRU_CLIENT_ID и MAILRU_CLIENT_SECRET, затем ' +
            '<span class="mono">systemctl restart salon-bot-v2</span>.') +
        ' Механика уже на сервере: вход считает людей одним аккаунтом по почте (ВК/Mail.ru/код на почту не плодят дубли), ' +
        'а вошедший клиент может привязать сервисы в кабинете — строка «Входы».' +
      '</p></div>' +

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

  function uploadAdminFile(input, deliver, preview) {
    var f = input.files && input.files[0];
    if (!f || !st.sel) return;
    if (f.size > 20 * 1024 * 1024) { toast('Файл больше 20 МБ — отправьте его через ветку заказа в группе'); return; }
    sendAdminFile(f, deliver, preview, false);
  }

  /* «этап не оплачен» (409 stage_unpaid): файл придержан сервером — объясняем
     правило и даём осознанный обход вторым подтверждением */
  function unpaidDialog(r, deliver, retry) {
    var whatTxt = 'За часть ' + (r.part || '') + ' не оплачено ' + money(r.debt) + ' ₽' +
      (r.labels && r.labels.length ? ' (' + r.labels.join(' + ').toLowerCase() + ')' : '') + '. Файл НЕ отправлен.';
    if (r.claimed) {
      confirmDlg({
        title: 'Клиент отметил оплату — сверьте поступление',
        text: whatTxt + ' Отметка клиента ждёт вашей сверки: проверьте деньги и нажмите «Получена ✓» в плане оплат — тогда файл можно передавать. Передать без сверки — на ваш риск.',
        okLabel: '⚠️ Передать без сверки', noLabel: 'Не передавать', danger: true
      }).then(function (res) { if (res.ok) retry(); });
      return;
    }
    confirmDlg({
      title: 'Сначала оплата — потом файл',
      text: whatTxt + (deliver
        ? ' По правилу мастерской выставьте счёт («Часть готова / Финал готов» — файл придержится, клиент получит реквизиты и кассу) или покажите работу «🔒 Предпросмотром». Передать оригинал без оплаты — на ваш риск.'
        : ' Если это готовая работа — не отправляйте оригинал: выставьте счёт («Часть готова») или пошлите «🔒 Предпросмотр». Отправить как есть (это не сдача) — на ваш риск.'),
      okLabel: deliver ? '⚠️ Всё равно передать' : '⚠️ Отправить как есть',
      noLabel: 'Не отправлять', danger: true
    }).then(function (res) { if (res.ok) retry(); });
  }

  function sendAdminFile(f, deliver, preview, force) {
    var note = document.getElementById('agUpNote');
    if (note) {
      note.hidden = false;
      note.textContent = preview
        ? 'Готовим защищённый предпросмотр «' + f.name + '» — обычно до минуты…'
        : 'Отправляем «' + f.name + '»…';
    }
    var fd = new FormData();
    fd.append('file', f, f.name);
    var q = preview ? 'preview=1' : 'deliver=' + (deliver ? '1' : '0');
    if (force) q += '&force=1';
    fetch(S.api.base + '/admin/orders/' + st.sel + '/upload?' + q, {
      method: 'POST', body: fd,
      headers: { 'Authorization': 'Bearer ' + S.api.token() }
    }).then(function (resp) { return resp.json(); })
      .then(function (r) {
        if (!r.ok && r.error === 'stage_unpaid') {
          if (note) note.textContent = '✋ Файл придержан: этап не оплачен (' + money(r.debt) + ' ₽).';
          unpaidDialog(r, deliver, function () { sendAdminFile(f, deliver, preview, true); });
          return;
        }
        if (!r.ok) {
          var perr = { preview_format: 'Формат не поддержан — PDF, DOCX, DOC, ODT, RTF',
                       preview_failed: 'Не получилось собрать предпросмотр — проверьте файл' }[r.error];
          if (note) note.textContent = (perr || 'Не ушло (' + (r.error || 'ошибка') + ')');
          toast(perr || 'Файл не отправился');
          return;
        }
        if (preview) {
          if (note) note.textContent = '🔒 Предпросмотр у клиента ✓ — оригинал остался у вас' +
            (r.due ? '; счёт этапа ' + money(r.due) + ' ₽ приложен' : '');
          toast('🔒 Предпросмотр отправлен');
        } else {
          if (note) note.textContent = deliver ? 'Сдано ✓ — клиент получил кнопки приёмки' : 'Файл у клиента ✓';
          toast(deliver ? '📦 Сдача зафиксирована' : (r.delivered_tg ? 'Файл доставлен в Telegram ✓' : 'Файл в деле — клиент увидит в кабинете'));
        }
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
    if (t.closest('#agLive')) { st.tab = 'visits'; drawNav(); loadTab(); return; }
    var tabGo = t.closest('[data-tab-go]');
    if (tabGo) { st.tab = tabGo.getAttribute('data-tab-go'); drawNav(); loadTab(); return; }

    var go = t.closest('[data-go]');
    if (go) {
      var f = go.getAttribute('data-go');
      if (f === '@reviews') { st.tab = 'reviews'; }
      else if (f === '@qa') { st.tab = 'qa'; }
      else if (f === '@visits') { st.tab = 'visits'; }
      else { st.tab = 'orders'; st.filter = f; st.q = ''; st.sel = null; }
      drawNav(); loadTab(true);
      return;
    }

    /* --- сертификаты: раскрытие, выпуск, действия --- */
    var gop = t.closest('[data-gift-open]');
    if (gop) {
      var gid = parseInt(gop.getAttribute('data-gift-open'), 10);
      st.gsel = st.gsel === gid ? null : gid;
      drawBody();
      if (st.gsel) openGiftCard(gid);
      return;
    }
    if (t.closest('#agGiftNew')) { st.gnew = !st.gnew; drawBody(); return; }
    if (t.closest('#agGfCreate')) {
      var ga = parseInt((document.getElementById('agGfAmount') || {}).value, 10) || 0;
      if (ga < 500) { toast('Укажите номинал — от 500 ₽'); return; }
      var gemail = (document.getElementById('agGfEmail') || {}).value || '';
      confirmDlg({
        title: 'Выпустить сертификат на ' + money(ga) + ' ₽?',
        text: 'Сертификат станет действительным сразу (оплата ручная/вне сайта).' +
              (gemail ? ' Получателю уйдёт письмо с кодом.' : ''),
        okLabel: 'Выпустить', noLabel: 'Отмена'
      }).then(function (res) {
        if (!res.ok) return;
        S.api.post('/admin/gifts', {
          amount: ga,
          recip_name: (document.getElementById('agGfName') || {}).value || '',
          recip_contact: gemail,
          congrats: (document.getElementById('agGfCongrats') || {}).value || '',
          note: (document.getElementById('agGfNote') || {}).value || ''
        }).then(function (r) {
          if (!r || !r.ok) { toast(r && r.error === 'bad_recip_email' ? 'Проверьте почту получателя' : 'Не получилось — проверьте номинал'); return; }
          st.gnew = false;
          st.gsel = r.gift.id;
          toast('Выпущен: ' + r.gift.code);
          loadGifts();
          setTimeout(function () { openGiftCard(r.gift.id); }, 150);
        });
      });
      return;
    }
    var gact = t.closest('[data-gift-act]');
    if (gact) {
      var gaid = parseInt(gact.getAttribute('data-gift-id'), 10);
      var ga2 = gact.getAttribute('data-gift-act');
      if (ga2 === 'confirm') {
        confirmDlg({ title: 'Оплата получена?', text: 'Сертификат будет выпущен, покупатель получит код письмом' +
          ' (и в Telegram, если входил). Не забудьте чек.', okLabel: 'Выпустить', noLabel: 'Отмена' })
          .then(function (res) { if (res.ok) giftAction(gaid, 'confirm', {}, 'Выпущен — письма ушли'); });
      } else if (ga2 === 'cancel') {
        confirmDlg({ title: 'Отменить оформление?', text: 'Покупатель получит вежливое письмо. Деньги, если пришли, верните вручную.', okLabel: 'Отменить оформление', noLabel: 'Назад', danger: true })
          .then(function (res) { if (res.ok) giftAction(gaid, 'cancel', {}, 'Оформление закрыто'); });
      } else if (ga2 === 'block') {
        confirmDlg({ title: 'Заблокировать сертификат?', text: 'Код перестанет приниматься (утечка, чарджбек, спор). Остаток заморозится — разблокировать можно в любой момент.', input: 'textarea', placeholder: 'Причина — увидите её в карточке', okLabel: 'Заблокировать', noLabel: 'Назад', danger: true })
          .then(function (res) { if (res.ok) giftAction(gaid, 'block', { note: res.value || '' }, 'Заблокирован'); });
      } else if (ga2 === 'unblock') {
        giftAction(gaid, 'unblock', {}, 'Снова действует');
      } else if (ga2 === 'extend') {
        giftAction(gaid, 'extend', { days: 90 }, 'Продлён на 90 дней');
      } else if (ga2 === 'adjust') {
        confirmDlg({ title: 'Корректировка остатка', text: 'Введите сумму со знаком: «500» — добавить, «−500» — списать (возврат сгоревшего, компенсация, ручное погашение).', input: 'text', placeholder: 'например 500 или -500', okLabel: 'Применить', noLabel: 'Отмена' })
          .then(function (res) {
            if (!res.ok) return;
            var d = parseInt(String(res.value || '').replace('−', '-').replace(/\s/g, ''), 10);
            if (!d) { toast('Нужно число со знаком'); return; }
            giftAction(gaid, 'adjust', { delta: d, note: 'корректировка из админки' }, 'Остаток обновлён');
          });
      } else if (ga2 === 'resend') {
        giftAction(gaid, 'resend', {}, 'Письма отправлены заново');
      }
      return;
    }

    /* --- визиты: диапазон, тумблеры, раскрытие сессии --- */
    var vh = t.closest('[data-vh]');
    if (vh) { st.vopts.hours = parseInt(vh.getAttribute('data-vh'), 10); loadVisits(); return; }
    var vt = t.closest('[data-vt]');
    if (vt) {
      var vk = vt.getAttribute('data-vt');
      st.vopts[vk] = !st.vopts[vk];
      loadVisits();
      return;
    }
    var vr = t.closest('.ag-vrow[data-vrow]');
    if (vr && !t.closest('a') && !t.closest('.ag-linkbtn')) {
      var vrid = vr.getAttribute('data-vrow');
      st.vopen[vrid] = !st.vopen[vrid];
      if (st.tab === 'visits') drawVisits(true); else drawBody();
      return;
    }

    /* --- массовые действия над заказами --- */
    if (t.closest('#agBulkToggle')) {
      st.bulk = st.bulk ? null : new Set();
      drawFilters(); drawList();
      return;
    }
    var bclr = t.closest('[data-bulk-clr]');
    if (bclr) { bulkApply({ color: bclr.getAttribute('data-bulk-clr') }); return; }
    var bact = t.closest('[data-bulk]');
    if (bact) {
      var bAct = bact.getAttribute('data-bulk');
      if (bAct === 'off') { st.bulk = null; drawFilters(); drawList(); return; }
      if (bAct === 'pin') bulkApply({ pin: 1 });
      else if (bAct === 'unpin') bulkApply({ pin: 0 });
      else if (bAct === 'hide') bulkApply({ hide: 1 });
      else if (bAct === 'restore') bulkApply({ 'delete': 0 });
      else if (bAct === 'purge') {
        var pn = st.bulk ? st.bulk.size : 0;
        if (!pn) { toast('Сначала отметьте заказы галочками'); return; }
        confirmDlg({
          title: 'Стереть навсегда: ' + pn + ' шт.?',
          text: 'Дело исчезнет целиком — с хроникой, файлами и перепиской. Вернуть будет нельзя. Дела с реальными оплатами сервер не стирает (это учёт) — они останутся в корзине.',
          okLabel: 'Стереть навсегда', noLabel: 'Отмена', danger: true
        }).then(function (res) { if (res.ok) bulkApply({ purge: 1 }); });
      }
      else if (bAct === 'trash') {
        var bn = st.bulk ? st.bulk.size : 0;
        if (!bn) { toast('Сначала отметьте заказы галочками'); return; }
        confirmDlg({
          title: 'В корзину: ' + bn + ' шт.?',
          text: 'Заказы пропадут из всех списков (кроме «Корзины»), клиентам ничего не уходит. Вернуть можно в любой момент.',
          okLabel: 'В корзину', noLabel: 'Отмена', danger: true
        }).then(function (res) { if (res.ok) bulkApply({ 'delete': 1 }); });
      }
      return;
    }

    /* --- быстрые действия в карточке дела --- */
    var cclr = t.closest('[data-card-clr]');
    if (cclr && st.card) {
      flag([st.card.id], { color: cclr.getAttribute('data-card-clr') }, function () {
        loadCard(st.sel); loadTab();
      });
      return;
    }
    var cflag = t.closest('[data-card-flag]');
    if (cflag && st.card) {
      var ck = cflag.getAttribute('data-card-flag');
      var after = function () { loadCard(st.sel); loadTab(); };
      if (ck === 'pin') flag([st.card.id], { pin: st.card.pinned ? 0 : 1 }, after);
      else if (ck === 'hide') flag([st.card.id], { hide: st.card.archived_admin ? 0 : 1 }, after);
      else if (ck === 'restore') flag([st.card.id], { 'delete': 0 }, after);
      else if (ck === 'purge') {
        confirmDlg({
          title: 'Стереть дело №' + st.card.id + ' навсегда?',
          text: 'Исчезнет всё: хроника, файлы, переписка. Вернуть будет нельзя. Если по делу были реальные оплаты — сервер откажет: оплаченное остаётся учётом.',
          okLabel: 'Стереть навсегда', noLabel: 'Отмена', danger: true
        }).then(function (res) {
          if (!res.ok) return;
          flag([st.card.id], { purge: 1 }, function (r) {
            if (r && r.kept) { toast('Не стёрто: по делу есть оплаты (или оно не в корзине)'); return; }
            toast('Дело стёрто навсегда');
            st.sel = null; st.card = null;
            loadTab();
          });
        });
      }
      else if (ck === 'trash') {
        confirmDlg({
          title: 'Убрать дело №' + st.card.id + ' в корзину?',
          text: 'Оно пропадёт из всех списков, кроме фильтра «Корзина». Клиент ничего не заметит, данные не стираются — вернуть можно в любой момент.',
          okLabel: 'В корзину', noLabel: 'Отмена', danger: true
        }).then(function (res) {
          if (res.ok) flag([st.card.id], { 'delete': 1 }, after);
        });
      }
      return;
    }
    var subOk = t.closest('[data-sub-ok]');
    if (subOk) {
      var sOkId = subOk.getAttribute('data-sub-ok');
      confirmDlg({
        title: 'Оплата подписки получена?',
        text: 'Подписка активируется сразу на свой срок, клиент получит уведомление. Не забудьте чек в «Мой налог».',
        okLabel: 'Да, активировать', noLabel: 'Отмена'
      }).then(function (res) {
        if (!res.ok) return;
        api('/admin/subs/' + sOkId + '/confirm', {}).then(function (r) {
          if (!r.ok) { toast('Не получилось' + (r.error ? ' (' + r.error + ')' : '')); return; }
          toast('Подписка активирована — клиент уведомлён ⭐');
          loadSubs(); refreshSilent();
        });
      });
      return;
    }
    var subNo = t.closest('[data-sub-no]');
    if (subNo) {
      var sNoId = subNo.getAttribute('data-sub-no');
      confirmDlg({
        title: 'Закрыть оформление подписки?',
        text: 'Для неоплаченных «хвостов». Клиент получит честное уведомление; если он уже перевёл деньги — лучше активировать, а не закрывать.',
        okLabel: 'Закрыть оформление', noLabel: 'Отмена', danger: true
      }).then(function (res) {
        if (!res.ok) return;
        api('/admin/subs/' + sNoId + '/cancel', {}).then(function (r) {
          if (!r.ok) { toast('Не получилось' + (r.error ? ' (' + r.error + ')' : '')); return; }
          toast('Оформление закрыто');
          loadSubs(); refreshSilent();
        });
      });
      return;
    }
    var cal = t.closest('[data-cal]');
    if (cal) {
      var cd = cal.getAttribute('data-cal');
      st.calDay = st.calDay === cd ? null : cd;
      drawBody();
      return;
    }
    var oo = t.closest('[data-open-order]');
    if (oo) { st.tab = 'orders'; st.filter = ''; st.q = ''; st.sel = parseInt(oo.getAttribute('data-open-order'), 10); drawNav(); loadTab(); return; }
    var oc = t.closest('[data-open-client]');
    if (oc) { st.tab = 'clients'; st.csel = parseInt(oc.getAttribute('data-open-client'), 10); drawNav(); loadTab(); return; }
    var ic = t.closest('[data-imp-client]');
    if (ic) {
      /* «тихий» вход в кабинет клиента: новая вкладка, сессия только там */
      var icid = parseInt(ic.getAttribute('data-imp-client'), 10);
      ic.disabled = true;
      api('/admin/clients/' + icid + '/impersonate', {}).then(function (r) {
        ic.disabled = false;
        if (r.ok && r.url) window.open(r.url, '_blank');
        else toast('Не вышло открыть кабинет: ' + (r.error || 'ошибка'), 'error');
      });
      return;
    }

    var row = t.closest('.ag-row[data-id]');
    if (row) {
      var rid = parseInt(row.getAttribute('data-id'), 10);
      if (st.bulk) {
        /* режим ☑: клик по строке (и по галке) — выбор, а не открытие */
        if (st.bulk.has(rid)) st.bulk.delete(rid); else st.bulk.add(rid);
        drawList();
        return;
      }
      loadCard(rid);
      return;
    }
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
    if (t.closest('#agPartReady')) {
      var prPart = (st.card && st.card.stage) || 1;
      confirmDlg({
        title: 'Часть ' + prPart + ' готова — выставить счёт этапа?',
        text: 'Клиент получит уведомление: часть готова и передаётся после оплаты этапа (с подписью «оплата части ' + prPart + '»). ' +
              'Файл пока не отправляйте — как подтвердите оплату, придёт напоминание передать.',
        okLabel: 'Выставить счёт', noLabel: 'Отмена'
      }).then(function (res) {
        if (!res.ok) return;
        api('/admin/orders/' + st.sel + '/part_ready', {})
          .then(function (r) {
            if (r.ok && r.paid_already) { afterOrder(r, 'Этап уже оплачен — просто передайте часть файлом'); return; }
            afterOrder(r, r.ok ? '📣 Счёт за часть ушёл клиенту — файл придержите' : null);
          });
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
          .then(function (r) {
            if (!r.ok && r.error === 'stage_unpaid') {
              unpaidDialog(r, true, function () {
                api('/admin/orders/' + st.sel + '/deliver', { force: true })
                  .then(function (r2) { afterOrder(r2, '📦 Сдача зафиксирована (без оплаты — в хронике)'); });
              });
              return;
            }
            afterOrder(r, '📦 На проверке у клиента');
          });
      });
      return;
    }
    var remindBtn = t.closest('[data-remind-pay]');
    if (remindBtn) {
      api('/admin/orders/' + st.sel + '/remind_pay', {})
        .then(function (r) {
          if (!r.ok) {
            toast({ claimed: 'Клиент отметил оплату — сверьте и подтвердите «Получена ✓»',
                    nothing_due: 'Платить нечего — созревших неоплаченных этапов нет',
                    paused: 'Дело на паузе — сначала снимите паузу',
                    busy: 'Секунду…' }[r.error] || 'Не получилось');
            return;
          }
          var where = r.delivered_tg ? 'в Telegram' + (r.mailed ? ' и на почту' : '')
            : (r.mailed ? 'на почту' : 'в кабинет (там счёт и так виден)');
          afterOrder(r, '🔔 Напоминание ' + money(r.due) + ' ₽ ушло ' + where);
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
    if (t.closest('#agSlotsSave')) {
      var qv = parseInt((document.getElementById('agSlots') || {}).value || '0', 10) || 0;
      api('/admin/slots', { quota: qv }).then(function (r) {
        if (!r.ok) { toast('Не получилось'); return; }
        st.ov = st.ov || {}; st.ov.slots_quota = r.quota; st.ov.slots_taken = r.taken;
        toast(r.quota ? 'Квота ' + r.quota + ' мест — плашка на сайте живёт ✓' : 'Набор месяца скрыт');
        if (st.tab === 'settings') drawBody();
      });
      return;
    }
    /* --- техработы: занавес сайта и бота --- */
    var mt = t.closest('[data-maint]');
    if (mt) {
      var mtKey = mt.getAttribute('data-maint');
      var mtOn = mt.getAttribute('data-on') === '1';
      var mtBody = {}; mtBody[mtKey] = !mtOn;
      var go = function () {
        api('/admin/maintenance', mtBody).then(function (r) {
          if (!r.ok) { toast('Не получилось'); return; }
          st.ov = st.ov || {}; st.ov.maintenance = r.maintenance;
          toast(mtKey === 'site'
            ? (r.maintenance.site ? 'Сайт закрыт на техработы ⏸' : 'Сайт снова открыт ✅')
            : (r.maintenance.bot ? 'Бот на антракте ⏸' : 'Бот снова отвечает ✅'));
          if (st.tab === 'settings') drawBody();
        });
      };
      if (!mtOn) confirmDlg({
        title: mtKey === 'site' ? 'Закрыть сайт на техработы?' : 'Поставить бота на антракт?',
        text: mtKey === 'site'
          ? 'Гости увидят вывеску «Идут переплётные работы». Заявки, кабинет и админка продолжат работать.'
          : 'Клиенты в Telegram получат вежливый ответ про короткий перерыв. Вам бот отвечает как обычно.',
        okLabel: 'Закрыть', noLabel: 'Отмена'
      }).then(function (okd) { if (okd && okd.ok) go(); });
      else go();
      return;
    }
    /* --- приёмная --- */
    var qb = t.closest('[data-qa-act]');
    if (qb) {
      var qact = qb.getAttribute('data-qa-act');
      var qid = qb.getAttribute('data-qa-id');
      var qpayload = { action: qact };
      if (qact === 'publish' || qact === 'answer_quiet' || qact === 'save') {
        var qEl = document.getElementById('qaQ-' + qid);
        var aEl = document.getElementById('qaA-' + qid);
        var tEl = document.getElementById('qaT-' + qid);
        if (qEl) qpayload.question = qEl.value;
        if (aEl) qpayload.answer = aEl.value;
        if (tEl) qpayload.tag = tEl.value;
        if (qact !== 'save' && (!qpayload.answer || qpayload.answer.trim().length < 5)) {
          toast('Сначала напишите ответ мастера'); return;
        }
      }
      var qaDone = {
        publish: 'Опубликовано в приёмной 📮', answer_quiet: 'Ответ ушёл письмом 🤫',
        save: 'Сохранено', reject: 'Отклонён', unpublish: 'Снят с сайта',
        pin: 'Закреплён сверху', unpin: 'Откреплён', delete: 'Удалён навсегда',
        ban: 'Автор заблокирован — его вопросы больше не попадут в очередь'
      };
      var goQA = function () {
        api('/admin/qa/' + qid, qpayload).then(function (r) {
          if (!r || !r.ok) { toast('Не получилось — попробуйте ещё раз'); return; }
          toast(qaDone[qact] || 'Готово');
          loadQA();
          S.api.get('/admin/overview').then(function (r2) { if (r2.ok) { st.ov = r2; drawNav(); } });
        });
      };
      if (qact === 'delete' || qact === 'ban') {
        confirmDlg({
          title: qact === 'delete' ? 'Удалить пару навсегда?' : 'Заблокировать автора вопроса?',
          text: qact === 'delete'
            ? 'Вопрос и ответ исчезнут с сайта и из очереди. Действие необратимо.'
            : 'Новые вопросы с этого браузера и IP молча перестанут попадать в приёмную. Текущий вопрос будет отклонён.',
          okLabel: qact === 'delete' ? 'Удалить' : 'Заблокировать', noLabel: 'Отмена', danger: true
        }).then(function (okd) { if (okd && okd.ok) goQA(); });
      } else goQA();
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
    if (e.target && e.target.id === 'agPreviewFile') { uploadAdminFile(e.target, false, true); e.target.value = ''; }
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

  /* одноразовый вход по ссылке из бота: admin.html#alk=<ключ> (команда /panel).
     Диплинк на дело: #alk=<ключ>&o=<id> или просто #o=<id> у вошедшего мастера —
     карточка заказа открывается сразу (кнопка «Открыть в админке» в боте). */
  function tryLinkLogin(next) {
    var h = location.hash || '';
    var mo = h.match(/(?:^#|[#&])o=(\d+)/);
    if (mo) { st.tab = 'orders'; st.filter = ''; st.sel = parseInt(mo[1], 10); }
    var mch = h.match(/alk=([A-Za-z0-9_-]+)/);
    if (!mch) {
      if (mo) history.replaceState(null, '', location.pathname);
      next();
      return;
    }
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
