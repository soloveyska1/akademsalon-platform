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

  /* [0] — имя знака из набора ICO, [1] — полное название статуса.
     Раньше в [0] стоял цветной эмодзи: системный шрифт рисовал его чужой
     краской и со своей базовой линией, мимо палитры и ритма «Оттиска». */
  var ST_META = {
    new: ['stNew', 'Новая'], priced: ['stPriced', 'Спецификация предложена'], prepay: ['stPrepay', 'Ждёт первого платежа'],
    work: ['stWork', 'Исполнение позиций'], check: ['stCheck', 'Результат на проверке'], fix: ['stFix', 'Корректировка результата'],
    done: ['stDone', 'Результат принят'], cancel: ['stCancel', 'Закрыт']
  };
  var PLAN_LBL = { 1: 'Одним платежом · целиком', 2: '2 части · 50/50', 3: '3 части · 30/40/30' };
  var PL_ST = { paid: ['оплачен', 'pl-paid'], claimed: ['клиент отметил — сверьте!', 'pl-claimed'],
                due: ['созрел к оплате', 'pl-due'], later: ['после готовности следующей части', 'pl-later'] };

  /* серверные коды — по-русски: хроника и события не должны быть «тьмой» */
  var EV_LABEL = {
    created: 'заявка создана', status: 'смена статуса',
    price_accepted: 'клиент принял цену', payment_marked: 'клиент отметил оплату',
    payment_unmarked: 'клиент снял отметку об оплате', payment_confirmed: 'оплата подтверждена',
    payment_link: 'выдана ссылка на оплату', receipt: 'клиент приложил чек',
    delivered: 'результат передан на проверку', part_accepted: 'результат позиции принят',
    work_accepted: 'результат принят, акт приёмки зафиксирован', accept_wait_pay: 'результат принят — ждём финальный платёж',
    fix_requested: 'клиент запросил корректировку по критериям', client_msg: 'сообщение клиента',
    admin_msg: 'ваш ответ клиенту', admin_file: 'ваш файл клиенту',
    bonus_spent: 'клиент применил бонусы', bonus_canceled: 'бонусы возвращены на счёт',
    cancel_reason: 'причина отказа', client_archive: 'клиент: архив дела',
    admin_archive: 'архив мастера', review: 'отзыв клиента',
    paused: 'дело поставлено на паузу', unpaused: 'пауза снята',
    cancel_request: 'клиент просит закрыть дело', client_pin: 'клиент закрепил дело',
    final_ready: 'финальный пакет результата подготовлен — клиенту выставлен остаток',
    part_ready: 'результат этапа подготовлен — клиенту выставлен счёт',
    pay_reminder: 'напоминание клиенту об оплате',
    pay_silent: 'клиент молчит по счёту — нужен личный контакт',
    delivered_unpaid: 'часть передана без оплаты этапа',
    admin_ping_pay: 'алерт: счёт без движения',
    wait_checks: 'клиент продолжает первичную проверку результата',
    spec_sent: 'спецификация отправлена клиенту',
    broadcast: 'рассылка клиентам', defense_offered: 'предложены услуги к защите',
    plan_set: 'план оплаты изменён', tg_linked: 'клиент привязал Telegram',
    admin_ping: 'напоминание о заявке', client_followup: 'напоминание клиенту о проверке',
    deadline1: 'скоро срок результата', deadline3: 'до срока результата 3 дня',
    fix_ack: 'корректировка взята в работу — клиенту сообщили',
    review_nudge: 'напоминание клиенту о проверке части',
    accept_warn: 'предупреждение об авто-приёмке части'
  };
  var STATUS_WORD = { new: 'новая', priced: 'спецификация предложена', prepay: 'ждёт первого платежа',
    work: 'исполнение позиций', check: 'результат на проверке', fix: 'корректировка результата',
    done: 'результат принят', cancel: 'закрыт' };
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
  var LEAD_ST = { new: 'новый', seen: 'просмотрен', done: 'обработан' };

  /* Серверные коды отказов — человеческим языком: что произошло и что
     безопасно сделать сейчас. Владельцу нечего делать с «bad_price». */
  var ERR_WORD = {
    busy: 'Секунду — предыдущее действие ещё выполняется.',
    forbidden: 'Доступ закрыт: этот аккаунт не в списке мастеров.',
    unauthorized: 'Сессия закончилась. Войдите заново.',
    not_found: 'Запись не найдена — обновите список.',
    bad_request: 'Сервер не принял данные. Проверьте поля и повторите.',
    bad_price: 'Цена не распознана. Проверьте число в блоке «Цена и план оплаты».',
    bad_amount: 'Проверьте сумму.',
    no_price: 'Сначала назначьте цену — план оплаты считается от неё.',
    plan_locked: 'Этапы уже начались — план оплаты менять поздно.',
    stage_unpaid: 'Этап не оплачен: файл придержан. Выставьте счёт или пошлите защищённый предпросмотр.',
    already: 'Это уже сделано — повторять не нужно.',
    already_paid: 'По делу уже прошла оплата, условия зафиксированы.',
    claimed: 'Клиент отметил оплату. Сверьте поступление и нажмите «Получена».',
    claimed_pending: 'Клиент отметил перевод. Сперва подтвердите оплату или снимите отметку.',
    nothing_due: 'Платить нечего: созревших неоплаченных этапов нет.',
    paused: 'Дело на паузе. Снимите паузу и повторите.',
    order_has_owner: 'У дела уже есть владелец — ссылку выписать нельзя.',
    bonus_empty: 'У клиента нет столько бонусов.',
    no_contact: 'В заявке нет почты клиента.',
    bad_recip_email: 'Проверьте почту получателя.',
    telegram_not_linked: 'Клиент не привязал Telegram.',
    gift_state: 'Сертификат уже в другом состоянии — обновите список.',
    preview_format: 'Формат не поддержан: PDF, DOCX, DOC, ODT, RTF, PPTX или PPT.',
    preview_failed: 'Не получилось собрать защищённую копию — проверьте файл.',
    sanitize_failed: 'Не удалось очистить свойства файла. Сохраните его заново и повторите загрузку.'
  };
  /* code → фраза. Незнакомый код показываем как есть, но с подсказкой действия. */
  function errSay(code, fallback) {
    if (!code) return fallback || 'Не получилось. Повторите или обновите страницу.';
    return ERR_WORD[code] ||
      (fallback || 'Не получилось. Повторите или обновите страницу.') + ' Код: ' + code + '.';
  }

  var st = {
    offnew: false, offlink: null,   /* сборка заявки под ссылку */
    tab: 'summary', filter: 'attention', q: '', sort: 'fresh', listLimit: 40,
    orders: [], sel: null, card: null,
    clients: [], csel: null, ccard: null, cq: '', csort: 'recent',
    reviews: [], leads: [],
    qa: null, qaTags: null, qaDrafts: {},   /* «Открытая приёмная»: очередь, лента, несохранённые наброски */
    desk: null,                                    /* «Сегодня на столе»: активные дела */
    subs: null, subsLoading: false, subsFailed: false,
    gifts: null, gsel: null, gnew: false, gq: '', gfilter: '', giftBusy: false,  /* сертификаты: список, раскрытая карточка, форма, поиск/фильтр */
    ov: null, ovAt: 0, ovFailed: false, timer: null, busy: false,
    visits: null, vstats: null,                    /* «Глаз бога»: лента заходов */
    vopts: { hours: 24, self: false, bots: false },
    vgeo: null, vanmore: false,                    /* выбранный город: фильтр ленты; раскрыт ли блок «ещё разрезы» */
    vopen: {},                                     /* раскрытые строки визитов */
    vtimer: null,
    bulk: null,                                    /* Set(id) — режим массовых действий */
    contentQ: '', contentTopic: 'all',
    leadsLoaded: false, leadsSynced: false,   /* обращения: список загружен / фоновая догрузка счётчика */
    tabRequestEpoch: 0, cardRequestSeq: 0, clientRequestSeq: 0
  };

  /* ОТМЕТКА «ОБРАБОТАН» У ОБРАЩЕНИЙ.
     Серверного маршрута для смены статуса лида нет (в API живёт только
     GET /admin/leads), поэтому отметка хранится на устройстве мастера.
     Как только маршрут появится — заменить leadMark на POST и снести стор. */
  var LEAD_DONE_KEY = 'salon_admin_leads_done';
  function leadsDone() {
    var v = S.store && S.store.get ? S.store.get(LEAD_DONE_KEY, []) : [];
    return Array.isArray(v) ? v : [];
  }
  function leadDone(id) { return leadsDone().indexOf(Number(id)) >= 0; }
  function leadMark(id, done) {
    var list = leadsDone().filter(function (x) { return x !== Number(id); });
    if (done) list.push(Number(id));
    if (S.store && S.store.set) S.store.set(LEAD_DONE_KEY, list.slice(-500));
  }
  function leadOpen(l) { return l.status !== 'done' && !leadDone(l.id); }
  function leadsOpenCount() {
    return (st.leads || []).filter(function (l) {
      return l.status === 'new' && !leadDone(l.id);
    }).length;
  }
  var pendingAdminFocus = false;
  var VALID_TABS = { summary: 1, visits: 1, orders: 1, clients: 1, reviews: 1,
    qa: 1, gifts: 1, leads: 1, broadcast: 1, settings: 1, content: 1 };
  var CONTENT_GUIDES = [
    ['guide-temy-vkr', 'Темы ВКР: критерии выбора и примеры формулировок', 'ВКР · старт', 'vkr',
      'Критерии проверки темы: исследовательский вопрос, доступные данные, объём и срок.'],
    ['guide-obekt-predmet-cel-zadachi', 'Объект, предмет, цель и задачи исследования', 'Методология', 'vkr',
      'Как связать объект, предмет, цель и задачи с будущей структурой работы.'],
    ['guide-vkr-struktura', 'Введение к ВКР: структура и связь с главами', 'ВКР · введение', 'vkr',
      'Состав введения и проверка связи между задачами, главами и выводами.'],
    ['guide-vvedenie-kursovoy', 'Введение курсовой работы: структура и пример', 'Курсовая · введение', 'course',
      'Актуальность, объект, предмет, цель, задачи и методы — в рабочей последовательности.'],
    ['guide-kursovaya-za-nedelyu', 'Как спланировать курсовую на семь дней', 'Курсовая · маршрут', 'course',
      'План на семь дней для ситуации, когда тема определена, а источники и данные доступны.'],
    ['guide-prakticheskaya-chast-kursovoy', 'Практическая часть курсовой: данные и анализ', 'Курсовая · исследование', 'course',
      'Как выбрать данные и метод, показать результаты и сформулировать выводы.'],
    ['guide-normocontrol', 'Нормоконтроль: что проверить перед сдачей', 'Оформление · проверка', 'format',
      'Параметры страницы, нумерация, таблицы, рисунки, ссылки и список источников.'],
    ['guide-zashchita-diploma', 'Подготовка к защите ВКР', 'Защита · маршрут', 'defense',
      'Доклад, презентация, раздаточный материал, репетиция и ответы на вопросы.']
  ];

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

  function bulkApply(payload, keepSel) {
    if (!st.bulk || !st.bulk.size) { toast('Сначала отметьте заказы галочками'); return; }
    var ids = [];
    st.bulk.forEach(function (id) { ids.push(id); });
    flag(ids, payload, function () {
      toast('Готово · ' + ids.length + ' шт.');
      /* цвет/пин не убирают строки из списка — держим выделение, чтобы можно
         было тут же применить к той же пачке ещё действие; hide/trash — сбрасываем */
      if (keepSel) { loadTab(); return; }
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
  function copyText(text, okMsg) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () { toast(okMsg || 'Скопировано'); },
          function () { toast('Браузер не дал доступ к буферу'); });
        return;
      }
    } catch (e) {}
    toast('Не удалось скопировать — выделите вручную');
  }
  function csvCell(value) {
    var s = String(value == null ? '' : value);
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function exportClientsCsv() {
    if (!st.clients.length) {
      toast('В картотеке пока нет данных для экспорта');
      return;
    }
    var rows = [['Имя', 'Telegram', 'Дел', 'Оплачено, ₽', 'Бонусы', 'Последний визит', 'Заблокирован']];
    st.clients.forEach(function (client) {
      rows.push([
        client.name || '',
        client.username ? '@' + client.username : '',
        client.orders || 0,
        client.paid_sum || 0,
        client.balance || 0,
        dt(client.last_seen),
        client.banned ? 'да' : 'нет'
      ]);
    });
    var csv = '\uFEFF' + rows.map(function (row) {
      return row.map(csvCell).join(';');
    }).join('\r\n');
    var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    var link = document.createElement('a');
    link.href = url;
    link.download = 'clients-' + new Date().toISOString().slice(0, 10) + '.csv';
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('Картотека экспортирована');
  }
  function stMeta(s) { return ST_META[s] || ['·', s]; }
  /* Короткая форма статуса — только для плотных мест (реестр, строка клиента).
     Полное название остаётся в фильтрах, карточке и подсказке title: длинные
     «Спецификация предложена» и «Корректировка результата» рвали штамп на две
     строки, и высота строк реестра гуляла вдвое. */
  var ST_SHORT = {
    new: 'Новая', priced: 'Спецификация', prepay: 'Ждёт оплаты', work: 'Исполнение',
    check: 'На проверке', fix: 'Корректировка', done: 'Принят', cancel: 'Закрыт'
  };
  var ST_ICON = {
    new: 'stNew', priced: 'stPriced', prepay: 'stPrepay', work: 'stWork',
    check: 'stCheck', fix: 'stFix', done: 'stDone', cancel: 'stCancel'
  };
  function stShort(s) { return ST_SHORT[s] || stMeta(s)[1]; }
  function stamp(s) {
    return '<span class="ag-stamp st-' + s + '">' + ico(ST_ICON[s], 13) +
      '<span>' + stMeta(s)[1] + '</span></span>';
  }
  /* штамп для таблиц: короткое слово в одну строку, полное — в подсказке */
  function stampShort(s) {
    return '<span class="status-stamp st-' + esc(s) + '" title="' + esc(stMeta(s)[1]) + '">' +
      ico(ST_ICON[s], 12) + '<span>' + esc(stShort(s)) + '</span></span>';
  }
  function confirmDlg(opts) {
    return S.confirm ? S.confirm(opts)
      : Promise.resolve({ ok: window.confirm(opts.title || 'Подтвердить?'), value: '' });
  }
  /* ---------------- значки ----------------
     Рисуем знаки сами, а не берём из шрифта. Причина проверяемая:
     в assets/fonts/fonts.css ни одно из трёх семейств (Golos Text,
     JetBrains Mono, Literata) не объявляет в unicode-range знаки
     ✓ U+2713, ⌕ U+2315, ✉ U+2709, ⧉ U+29C9, ★ U+2605 — их подставлял
     системный шрифт: рисунок чужой, а на Android возможен пустой
     прямоугольник. currentColor держит значок в теме панели,
     focusable="false" убирает его из таб-порядка. */
  function icoSvg(body, cls, size) {
    return '<svg class="ag-ico' + (cls ? ' ' + cls : '') + '" width="' + (size || 16) +
      '" height="' + (size || 16) + '" viewBox="0 0 24 24" fill="none" ' +
      'aria-hidden="true" focusable="false">' + body + '</svg>';
  }
  function icoCheck(size) {
    return icoSvg('<path d="M5 12.5 9.7 17.2 19 6.9" stroke="currentColor" stroke-width="2.2" ' +
      'stroke-linecap="round" stroke-linejoin="round"/>', 'ag-ico--check', size);
  }
  function icoMail(size) {
    return icoSvg('<rect x="2.9" y="5.2" width="18.2" height="13.6" rx="2.1" stroke="currentColor" stroke-width="1.7"/>' +
      '<path d="m3.6 6.6 8.4 6 8.4-6" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round"/>', 'ag-ico--mail', size);
  }
  function icoPhone(size) {
    return icoSvg('<path d="M8.1 4.3 9.8 8 8 9.9c-.4.4-.5 1-.2 1.5a12 12 0 0 0 4.8 4.8c.5.3 1.1.2 1.5-.2l1.9-1.8 3.7 1.7c.5.2.8.8.7 1.4l-.5 2.2c-.1.6-.7 1-1.3.9C11.6 19.6 4.4 12.4 3.6 5.4c-.1-.6.3-1.2.9-1.3l2.2-.5c.6-.1 1.2.2 1.4.7z" ' +
      'stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>', 'ag-ico--phone', size);
  }
  function icoCopy(size) {
    return icoSvg('<rect x="8.6" y="8.6" width="11.6" height="11.6" rx="2.1" stroke="currentColor" stroke-width="1.7"/>' +
      '<path d="M15.8 5.3H5.9a2.1 2.1 0 0 0-2.1 2.1v9.9" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round"/>', 'ag-ico--copy', size);
  }
  function icoCross(size) {
    return icoSvg('<path d="m6.4 6.4 11.2 11.2M17.6 6.4 6.4 17.6" stroke="currentColor" ' +
      'stroke-width="2.1" stroke-linecap="round"/>', 'ag-ico--cross', size);
  }
  function icoSearch(size) {
    return icoSvg('<circle cx="10.5" cy="10.5" r="6.6" stroke="currentColor" stroke-width="1.9"/>' +
      '<path d="M15.5 15.5 20 20" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
      'ag-ico--search', size);
  }
  /* звезда: залитая — за оценку, контурная — за остаток. Раньше пустую
     отличал только класс .dim, который покрашен лишь внутри .ag-rv —
     в карточке дела (строка «Отзыв») все пять выглядели одинаково. */
  function icoStar(on) {
    var d = 'm12 3.6 2.6 5.3 5.8.85-4.2 4.1 1 5.8-5.2-2.73-5.2 2.73 1-5.8-4.2-4.1 5.8-.85z';
    return icoSvg('<path d="' + d + '" fill="' + (on ? 'currentColor' : 'none') + '" ' +
      'stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
      'ag-ico--star' + (on ? ' is-on' : ' dim'), 15);
  }
  function starRow(n) {
    var out = '';
    for (var i = 1; i <= 5; i++) out += icoStar(i <= n);
    return out;
  }

  /* ---------------- закрытый набор знаков панели ----------------
     Правило (совет модели Kimi, принято write-owner-ом): значок ставится
     там, где он делает работу, которую не делает слово, — маркер в плотном
     списке или кнопка без подписи. Рядом с внятной подписью значок только
     шумит: там его нет вовсе. Все знаки — один контур 24×24, stroke 1.6,
     currentColor: тема красит их сама, а цветные эмодзи больше не тащат
     в «Оттиск» чужую палитру и чужую базовую линию. */
  var ICO = {
    /* разделы */
    desk: '<path d="M4 5.2h16v9.4H4z"/><path d="M9.4 19h5.2M12 14.6V19"/>',
    cases: '<path d="M4.2 8.4h15.6v10.4H4.2z"/><path d="M9.2 8.4V6.1a1.2 1.2 0 0 1 1.2-1.2h3.2a1.2 1.2 0 0 1 1.2 1.2v2.3M4.2 12.6h15.6"/>',
    clients: '<circle cx="9.4" cy="8.7" r="3.1"/><path d="M3.8 19.3c.5-3 2.8-4.6 5.6-4.6s5.1 1.6 5.6 4.6"/><path d="M16.4 6.2a3 3 0 0 1 0 5.6M18 14.9c2 .6 3.3 2.2 3.6 4.4"/>',
    ask: '<path d="M4.4 5.6h15.2v10.2H12l-4.5 3.6v-3.6H4.4z"/><path d="M9.9 9.1a2.2 2.2 0 1 1 2.3 2.3M12.2 13.1v.1"/>',
    reviews: '<path d="m12 4.4 2.3 4.7 5.2.75-3.75 3.65.9 5.15L12 16.2l-4.65 2.45.9-5.15L4.5 9.85l5.2-.75z"/>',
    leads: '<path d="M3.6 12.4h4.1l1.5 2.6h5.6l1.5-2.6h4.1"/><path d="m3.6 12.4 2.8-6.3a1.4 1.4 0 0 1 1.3-.9h8.6a1.4 1.4 0 0 1 1.3.9l2.8 6.3v5a1.4 1.4 0 0 1-1.4 1.4H5a1.4 1.4 0 0 1-1.4-1.4z"/>',
    broadcast: '<path d="M4.2 10.1v4.2M8 8.6 18.3 4.9v14.2L8 15.4z"/><path d="M4.2 10.1H8v5.3H4.2a1.5 1.5 0 0 1-1.5-1.5v-2.3a1.5 1.5 0 0 1 1.5-1.5zM8.9 16.6l1 3.1"/>',
    gifts: '<path d="M4 10.4h16v8.9H4z"/><path d="M2.9 7h18.2v3.4H2.9zM12 7v12.3"/><path d="M12 7S9.4 7 8.3 6.2a1.9 1.9 0 0 1 2-3.1C11.4 3.7 12 7 12 7zM12 7s2.6 0 3.7-.8a1.9 1.9 0 0 0-2-3.1C12.6 3.7 12 7 12 7z"/>',
    visits: '<path d="M2.9 12.5h4.3l2.1-5.4 3.1 10 2.3-6.1 1.4 1.5h5.1"/>',
    content: '<path d="M4.1 5.3h6.3a1.6 1.6 0 0 1 1.6 1.6v11.8a1.6 1.6 0 0 0-1.6-1.6H4.1z"/><path d="M19.9 5.3h-6.3A1.6 1.6 0 0 0 12 6.9v11.8a1.6 1.6 0 0 1 1.6-1.6h6.3z"/>',
    settings: '<circle cx="12" cy="12" r="2.9"/><path d="M12 3.4v2.2M12 18.4v2.2M20.6 12h-2.2M5.6 12H3.4M18.1 5.9l-1.6 1.6M7.5 16.5l-1.6 1.6M18.1 18.1l-1.6-1.6M7.5 7.5 5.9 5.9"/>',
    covers: '<path d="M4 5.4h16v13.2H4z"/><circle cx="8.9" cy="10" r="1.5"/><path d="m4.6 17.4 4.9-4.6 3.3 3.1 2.9-2.6 3.7 3.4"/>',
    /* статусы */
    stNew: '<path d="M12 4.6v14.8M4.6 12h14.8"/>',
    stPriced: '<path d="M6.2 4.4h8.1l4.5 4.5v10.7H6.2z"/><path d="M14 4.4v4.8h4.8M9.2 13.2h5.6M9.2 16.2h3.6"/>',
    stPrepay: '<circle cx="12" cy="12" r="7.7"/><path d="M12 7.6V12l3 1.9"/>',
    stWork: '<path d="M4.6 19.4 14 10l-1.3-1.3 2.4-2.4 1.3 1.3 1.9-1.9 1.9 1.9-1.9 1.9 1.3 1.3-2.4 2.4L15.9 12l-9.4 9.4z" transform="translate(0 -2)"/>',
    stCheck: '<path d="M4.6 13.2v5.1a1.4 1.4 0 0 0 1.4 1.4h12a1.4 1.4 0 0 0 1.4-1.4v-5.1"/><path d="M12 15.1V4.6M8.1 8.5 12 4.6l3.9 3.9"/>',
    stFix: '<path d="M4.6 19.4h4l10-10a2 2 0 0 0-2.8-2.8l-10 10z"/><path d="m14.2 7.6 2.8 2.8"/>',
    stDone: '<path d="m5.2 12.6 4.5 4.5 9.1-9.6"/>',
    stCancel: '<circle cx="12" cy="12" r="7.7"/><path d="m7.6 16.4 8.8-8.8"/>',
    /* действия и метки */
    pin: '<path d="M9.1 3.9h5.8l-.7 5.6 3 3.2H6.8l3-3.2z"/><path d="M12 12.7v7.4"/>',
    archive: '<path d="M3.6 4.9h16.8v3.7H3.6zM5.2 8.6h13.6v10.5H5.2z"/><path d="M9.8 12.1h4.4"/>',
    trash: '<path d="M4.9 6.7h14.2M9.5 6.7V4.9h5v1.8"/><path d="M6.6 6.7 7.5 19a1.3 1.3 0 0 0 1.3 1.2h6.4a1.3 1.3 0 0 0 1.3-1.2l.9-12.3"/><path d="M10.4 10.2v6M13.6 10.2v6"/>',
    bell: '<path d="M6.6 10.4a5.4 5.4 0 1 1 10.8 0c0 3.4 1.3 4.7 1.3 4.7H5.3s1.3-1.3 1.3-4.7z"/><path d="M10.3 18.3a2 2 0 0 0 3.4 0"/>',
    upload: '<path d="M4.6 14.6v3.4a1.4 1.4 0 0 0 1.4 1.4h12a1.4 1.4 0 0 0 1.4-1.4v-3.4"/><path d="M12 15.6V4.8M8.1 8.7 12 4.8l3.9 3.9"/>',
    clip: '<path d="M17.6 11.1 11 17.7a3.6 3.6 0 0 1-5.1-5.1l7.4-7.4a2.4 2.4 0 0 1 3.4 3.4l-7.3 7.3a1.2 1.2 0 0 1-1.7-1.7l6.6-6.6"/>',
    pause: '<path d="M9.3 5.6v12.8M14.7 5.6v12.8"/>',
    play: '<path d="M7.9 5.2 18.4 12 7.9 18.8z"/>',
    money: '<path d="M3.4 6.6h17.2v10.8H3.4z"/><circle cx="12" cy="12" r="2.5"/><path d="M6.6 9.9v.1M17.4 14v.1"/>',
    hourglass: '<path d="M7.4 4.4h9.2M7.4 19.6h9.2"/><path d="M8.3 4.4c0 4 3.7 5.1 3.7 7.6s-3.7 3.6-3.7 7.6M15.7 4.4c0 4-3.7 5.1-3.7 7.6s3.7 3.6 3.7 7.6"/>',
    flag: '<path d="M6 20.1V4.5M6 5.4h11.6l-2.2 3.6 2.2 3.6H6"/>',
    link: '<path d="M10.4 13.6a3.4 3.4 0 0 0 5 .4l2.6-2.6a3.4 3.4 0 0 0-4.8-4.8l-1.5 1.5"/><path d="M13.6 10.4a3.4 3.4 0 0 0-5-.4L6 12.6a3.4 3.4 0 0 0 4.8 4.8l1.5-1.5"/>',
    dots: '<circle cx="6.2" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="17.8" cy="12" r="1.2" fill="currentColor" stroke="none"/>'
  };
  /* один знак: имя из ICO → готовый svg. Размер по умолчанию — 16px. */
  function ico(name, size, cls) {
    var body = ICO[name];
    if (!body) return '';
    return icoSvg('<g stroke="currentColor" stroke-width="1.6" stroke-linecap="round" ' +
      'stroke-linejoin="round">' + body + '</g>', 'ag-ico--' + name + (cls ? ' ' + cls : ''), size);
  }

  function mediaPath(orderId, msgId) {
    return '/orders/' + orderId + '/msgmedia/' + msgId;
  }
  function filePath(orderId, fid) {
    return '/orders/' + orderId + '/file/' + fid;
  }
  var adminObjectUrls = [];
  function releaseAdminObjectUrls() {
    adminObjectUrls.forEach(function (url) {
      try { URL.revokeObjectURL(url); } catch (e) {}
    });
    adminObjectUrls = [];
  }
  function adminProtectedFetch(path) {
    var h = S.api.headers ? S.api.headers('GET') : {};
    return fetch(S.api.base + path, {
      method: 'GET',
      headers: h,
      credentials: 'include',
      cache: 'no-store'
    });
  }
  function hydrateAdminMedia(scope) {
    (scope || root).querySelectorAll('[data-admin-media]').forEach(function (el) {
      if (el.getAttribute('data-admin-loading') === '1') return;
      el.setAttribute('data-admin-loading', '1');
      adminProtectedFetch(el.getAttribute('data-admin-media')).then(function (resp) {
        if (!resp.ok) throw new Error('http_' + resp.status);
        return resp.blob();
      }).then(function (blob) {
        if (!el.isConnected) return;
        var url = URL.createObjectURL(blob);
        adminObjectUrls.push(url);
        el.src = url;
        var open = el.closest('[data-admin-media-open]');
        if (open) {
          open.href = url;
          open.removeAttribute('aria-disabled');
        }
      }).catch(function () {
        if (el.isConnected) el.setAttribute('aria-label', 'Вложение сейчас недоступно');
      });
    });
  }

  /* ---------------- вход/гейт ---------------- */
  function tplLogin(pending, denied) {
    return '<main class="ag-login sheet sheet-pad stacked">' +
      '<div class="admin-login-brand"><img src="bimi/logo.svg" alt=""><div><p class="caps">Редакционный кабинет</p>' +
      '<strong>Академический Салон</strong></div></div>' +
      '<p class="caps">Кабинет мастера</p>' +
      '<h1 style="font-size:26px;margin:6px 0 10px">Рабочий стол мастерской</h1>' +
      (denied ? '<p class="petit" style="color:var(--wax,#A8402F);margin-bottom:12px">Этот аккаунт Telegram не является мастером — доступа нет.</p>' : '') +
      (pending
        ? '<p class="petit" style="margin-bottom:12px">Ждём подтверждение в Telegram — нажмите в боте <b>Start</b>.</p>' +
          '<a class="btn btn-wax btn-block" href="' + (pending.link || 'https://t.me/academic_saloon_bot') + '" target="_blank" rel="noopener">Открыть Telegram</a>' +
          '<button type="button" class="btn btn-line btn-block" id="agCancel" style="margin-top:10px">Отменить</button>'
        : '<button type="button" class="btn btn-wax btn-block" id="agTg">Войти через Telegram</button>') +
      (denied ? '<button type="button" class="btn btn-line btn-block" id="agLogout" style="margin-top:10px">Выйти и сменить аккаунт</button>' : '') +
      '<p class="ag-note" style="margin-top:14px">Вход подтверждается в боте мастерской. Посторонним сервер не отвечает.</p>' +
      '</main>';
  }

  function gate() {
    if (!S.api.token()) {
      document.body.classList.remove('admin-workspace-ready', 'admin-nav-expanded',
        'admin-drawer-open', 'admin-client-selected');
      var pending = S.resumeTgLogin(function () { gate(); }, function () { render(tplLogin(null)); });
      render(tplLogin(pending));
      return;
    }
    S.api.get('/admin/overview').then(function (r) {
      if (r.error === 'forbidden') {
        document.body.classList.remove('admin-workspace-ready');
        render(tplLogin(null, true));
        return;
      }
      if (!r.ok) {
        document.body.classList.remove('admin-workspace-ready');
        render('<div class="ag-empty">Сервер недоступен. <button class="btn btn-line" id="agRetry">Повторить</button></div>');
        return;
      }
      st.ov = r;
      st.ovAt = Date.now();
      st.ovFailed = false;
      /* вернуть последнюю вкладку (переживает F5 и релогин с бота), но не
         перебивать диплинк #o= — он уже увёл st.tab на «Заказы» */
      if (st.tab === 'summary') {
        var saved = S.store.get('ag_tab', null);
        if (saved && VALID_TABS[saved]) st.tab = saved;
      }
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

  document.addEventListener('salon:auth-lost', function () {
    st.busy = false;
    st.card = null;
    releaseAdminObjectUrls();
    if (st.timer) { clearInterval(st.timer); st.timer = null; }
    gate();
  });

  /* мгновенные обновления: long-poll шины событий — карточки и списки
     подтягиваются в момент действия клиента, без ожидания поллинга */
  var evVer = 0;
  function watchEvents() {
    /* в фоне или после выхода — не держим полусекундный long-poll, только редкая сверка */
    if (!S.api.token() || document.hidden) { setTimeout(watchEvents, 4000); return; }
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
    if (st.subsLoading) return;
    st.subsLoading = true;
    st.subsFailed = false;
    S.api.get('/admin/subs').then(function (r) {
      st.subsLoading = false;
      if (r && r.ok) {
        st.subs = r;
        st.subsFailed = false;
      } else {
        st.subsFailed = true;
      }
      if (st.tab === 'summary') drawBody();
    }).catch(function () {
      st.subsLoading = false;
      st.subsFailed = true;
      if (st.tab === 'summary') drawBody();
    });
  }

  /* всплеск событий на общей шине (чужие заказы, визиты, рассылки) не должен
     оборачиваться очередью полных /overview — коалесцируем и не дублируем запрос */
  var refreshT = null;
  function refreshSilent() {
    if (!S.api.token()) return;                       /* после выхода — тихий no-op */
    if (refreshT) clearTimeout(refreshT);
    refreshT = setTimeout(doRefresh, 300);
  }
  function doRefresh() {
    refreshT = null;
    if (!S.api.token()) return;
    if (!st.ovBusy) {
      st.ovBusy = true;
      S.api.get('/admin/overview').then(function (r) {
        st.ovBusy = false;
        if (r.ok) {
          st.ov = r;
          st.ovAt = Date.now();
          st.ovFailed = false;
          drawNav();
          drawLive();
          if (st.tab === 'summary') drawBody();
        } else {
          st.ovFailed = true;
          if (st.tab === 'summary') drawBody();
        }
      });
    }
    loadSubs();
    if (st.tab === 'summary') loadDesk();
    if (st.tab === 'gifts') loadGifts();
    if (st.tab === 'qa') loadQA();
    if (st.tab === 'orders') {
      S.api.get('/admin/orders?' + listQuery()).then(function (r) {
        if (r.ok && st.tab === 'orders') { st.orders = r.orders; drawList(); }
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
    var requestedTab = st.tab;
    var requestEpoch = ++st.tabRequestEpoch;
    function tabRequestCurrent() {
      return requestEpoch === st.tabRequestEpoch && st.tab === requestedTab;
    }
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
    /* показываем «Загружаем…» сразу: без этого при обрыве/медленной сети экран
       остаётся на прошлой вкладке, хотя в шапке уже подсвечена новая */
    tabLoading();
    if (st.tab === 'orders') {
      S.api.get('/admin/orders?' + listQuery()).then(function (r) {
        if (!tabRequestCurrent()) return;
        if (!r.ok) return tabFail();
        st.orders = r.orders;
        /* открываем ту строку, что визуально сверху (закреплённые всплывают) */
        if (openFirst && st.orders.length && !st.sel) st.sel = sortedOrders()[0].id;
        drawBody();
        if (st.sel) loadCard(st.sel);
      });
    } else if (st.tab === 'clients') {
      S.api.get('/admin/clients').then(function (r) {
        if (!tabRequestCurrent()) return;
        if (!r.ok) return tabFail();
        st.clients = r.clients;
        drawBody();
        if (st.csel) loadClient(st.csel);
      });
    } else if (st.tab === 'reviews') {
      S.api.get('/admin/reviews').then(function (r) {
        if (!tabRequestCurrent()) return;
        if (!r.ok) return tabFail();
        st.reviews = r.reviews;
        drawBody();
      });
    } else if (st.tab === 'qa') {
      loadQA();
    } else if (st.tab === 'gifts') {
      loadGifts();
    } else if (st.tab === 'leads') {
      S.api.get('/admin/leads').then(function (r) {
        if (!tabRequestCurrent()) return;
        if (!r.ok) return tabFail();
        st.leads = r.leads || [];
        st.leadsLoaded = true;
        drawNav();
        drawBody();
      });
    } else {
      drawBody();
    }
  }
  function tabLoading() {
    var box = document.getElementById('agBody');
    if (box) box.innerHTML = '<div class="ag-empty">Загружаем…</div>';
  }
  function tabFail() {
    var box = document.getElementById('agBody');
    if (box) box.innerHTML = '<div class="ag-empty">Не удалось загрузить эту вкладку. ' +
      '<button type="button" class="btn btn-line" id="agTabRetry" style="margin-left:8px">Повторить</button></div>';
  }
  /* переход на вкладку: запоминаем её (переживёт перезагрузку и релогин с бота)
     и уводим фокус на тело — иначе он падает на <body> при каждой смене */
  function goTab(name, openFirst) {
    if (!VALID_TABS[name]) return;
    st.tab = name;
    try { S.store.set('ag_tab', name); } catch (e) {}
    try {
      history.replaceState(null, '', location.pathname + (name === 'summary' ? '' : '#' + name));
    } catch (e) {}
    drawNav();
    loadTab(openFirst);
    var body = document.getElementById('agBody');
    if (body) { try { body.focus({ preventScroll: true }); } catch (e) {} }
  }
  function loadQA() {
    snapshotQaDrafts();   /* сохранить недописанные ответы перед перерисовкой ленты */
    S.api.get('/admin/qa').then(function (r) {
      if (!r || !r.ok) { if (st.tab === 'qa') tabFail(); return; }
      st.qa = r.items;
      st.qaTags = r.tags || {};
      if (st.tab === 'qa') drawBody();
    });
  }
  /* каждая карточка приёмной — редактор; действие над одной не должно затирать
     наброски в остальных. Складываем «грязные» поля и подставляем их обратно. */
  function snapshotQaDrafts() {
    if (!st.qa) return;
    st.qaDrafts = st.qaDrafts || {};
    (st.qa || []).forEach(function (q) {
      var qEl = document.getElementById('qaQ-' + q.id), aEl = document.getElementById('qaA-' + q.id);
      if (!qEl && !aEl) return;
      var d = st.qaDrafts[q.id] || {};
      if (qEl && qEl.value !== (q.question || '')) d.q = qEl.value; else delete d.q;
      if (aEl && aEl.value !== (q.answer || '')) d.a = aEl.value; else delete d.a;
      if (d.q != null || d.a != null) st.qaDrafts[q.id] = d; else delete st.qaDrafts[q.id];
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
    var dev = /iPhone|iPad/.test(ua) ? 'iPhone'
      : /Android.*Mobile/.test(ua) ? 'Android'
      : /Android/.test(ua) ? 'планшет'
      : /Mobile/.test(ua) ? 'мобильный'
      : '';
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
    if (/utm_/.test(s) && !host) return '' + s.replace(/^[?&]/, '').slice(0, 60);
    if (!host) return s.slice(0, 60);
    var ic = '';
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

  /* ============ АНАЛИТИКА ВИЗИТОВ: города, источники, конверсия ============
     Всё считается на клиенте из уже загруженной ленты st.visits. Единица —
     уникальный человек (по v.vid), а не сессия: три захода одного не должны
     перевешивать трёх разных людей. Честно: цифры — «по загруженным сессиям
     за период», не перепись. Появится серверный агрегат st.vstats.cities —
     подхватим его как более точный (см. visitStats). */
  var AN_PERIOD = { 24: 'сутки', 72: '3 дня', 168: 'неделю', 720: '30 дней' };
  function anPl(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }
  function anCut(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  /* город из v.geo — строка от IP приходит разнобоем: «Москва», «Москва,
     Россия», «г. Москва», «», «—», «робот». Режем до запятой, чистим «г.». */
  function cityOf(v) {
    var s = String((v && v.geo) || '').split(',')[0].trim().replace(/^г\.?\s+/i, '');
    if (!s || s === '—' || /^(робот|бот)$/i.test(s) || /^откуда/i.test(s)) return null;
    return s;
  }
  function sourceOf(v) {
    var ref = String((v && v.ref) || '');
    if (!ref) return { key: 'direct', label: 'прямые заходы' };
    var m = /https?:\/\/([^\/]+)/.exec(ref);
    var host = m ? m[1].replace(/^www\./, '') : '';
    if (/yandex|ya\.ru|google/.test(host)) return { key: 'search', label: 'Поиск' };
    if (/vk\.com|vk\.ru/.test(host)) return { key: 'vk', label: 'ВКонтакте' };
    if (/t\.me|telegram/.test(host)) return { key: 'tg', label: 'Telegram' };
    if (!host && /utm_/.test(ref)) return { key: 'utm', label: 'Реклама (utm)' };
    return { key: host || 'other', label: host || 'другой источник' };
  }
  function deviceOf(ua) { return /Mobile|iPhone|Android.*Mobile/.test(String(ua || '')) ? 'mob' : 'desk'; }

  function anTop(map, n) {
    var a = Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (x, y) { return y.uniq - x.uniq; });
    var t = a.slice(0, n || 5);
    var r = a.slice(n || 5).reduce(function (s, c) { return s + c.uniq; }, 0);
    if (r) t.push({ name: 'прочие', uniq: r });
    return t;
  }

  function visitStats(rows) {
    rows = rows || [];
    var seen = {}, order = [], bots = 0;
    for (var i = 0; i < rows.length; i++) {
      var v = rows[i];
      if (v.bot) { bots++; continue; }
      var vid = v.vid || ('v' + v.id);
      var rec = seen[vid];
      if (!rec) {
        seen[vid] = { city: cityOf(v), src: sourceOf(v), entry: pageName(v.entry),
          dev: deviceOf(v.ua), order: !!v.order_id, sessions: 1 };
        order.push(vid);
      } else { rec.sessions++; if (v.order_id) rec.order = true; }
    }
    var uniq = order.length;
    var cmap = {}, none = { name: 'не определён', uniq: 0, orders: 0, none: true, color: 'var(--an-none)' };
    var srcMap = {}, entMap = {}, devMap = { mob: 0, desk: 0 }, ret = 0;
    order.forEach(function (vid) {
      var r = seen[vid];
      if (r.city) { var c = cmap[r.city] || (cmap[r.city] = { name: r.city, uniq: 0, orders: 0 }); c.uniq++; if (r.order) c.orders++; }
      else { none.uniq++; if (r.order) none.orders++; }
      var sc = srcMap[r.src.key] || (srcMap[r.src.key] = { name: r.src.label, uniq: 0 }); sc.uniq++;
      var ec = entMap[r.entry] || (entMap[r.entry] = { name: r.entry, uniq: 0 }); ec.uniq++;
      devMap[r.dev]++;
      if (r.sessions > 1) ret++;
    });
    var cities = Object.keys(cmap).map(function (k) { return cmap[k]; })
      .sort(function (a, b) { return b.uniq - a.uniq; });
    var top = cities.slice(0, 6), rest = cities.slice(6);
    top.forEach(function (c, i) { c.color = 'var(--an' + (i + 1) + ')'; });
    var slices = top.slice();
    var restSum = rest.reduce(function (s, c) { return s + c.uniq; }, 0);
    if (restSum) slices.push({ name: 'прочие', uniq: restSum,
      orders: rest.reduce(function (s, c) { return s + c.orders; }, 0), rest: true, color: 'var(--an-rest)' });
    if (none.uniq) slices.push(none);
    var serverUniq = (st.vstats && st.vstats.uniq) || 0;
    return {
      uniq: uniq, bots: bots, gap: Math.max(0, serverUniq - uniq),
      slices: slices, cities: top, distinctCities: cities.length,
      sources: anTop(srcMap, 5), entries: anTop(entMap, 5),
      devices: devMap, ret: ret, fresh: uniq - ret
    };
  }

  /* дуга кольца: угол считаем по часовой от 12ч; sweep=1 — по часовой */
  function anArc(r, a0, a1) {
    function pt(a) { var d = (a - 90) * Math.PI / 180; return [(60 + r * Math.cos(d)).toFixed(2), (60 + r * Math.sin(d)).toFixed(2)]; }
    var s = pt(a0), e = pt(a1), large = (a1 - a0) > 180 ? 1 : 0;
    return 'M' + s[0] + ' ' + s[1] + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + e[0] + ' ' + e[1];
  }
  function anDonut(stats, sel) {
    var slices = stats.slices, r = 42, sw = 15, GAP = 2.6;
    var total = slices.reduce(function (s, c) { return s + c.uniq; }, 0) || 1;
    var segs = '', cum = 0;
    if (slices.length === 1) {
      var one = slices[0];
      segs = '<circle cx="60" cy="60" r="42" fill="none" stroke="' + one.color + '" stroke-width="' + sw + '"' +
        (one.none || one.rest ? '' : ' data-vgeo="' + esc(one.name) + '" style="cursor:pointer"') + '>' +
        '<title>' + esc(one.name) + ' · ' + one.uniq + ' чел · 100%</title></circle>';
    } else {
      slices.forEach(function (c) {
        var frac = c.uniq / total, a0 = cum * 360, a1 = (cum + frac) * 360, span = a1 - a0;
        cum += frac;
        var pad = span > GAP * 1.6 ? GAP : 0;
        var dim = sel && c.name !== sel ? ' opacity="0.3"' : '';
        var w = sel && c.name === sel ? sw + 3 : sw;
        var pickable = !c.none && !c.rest;
        segs += '<path d="' + anArc(r, a0 + pad / 2, a1 - pad / 2) + '" fill="none" stroke="' + c.color +
          '" stroke-width="' + w + '" stroke-linecap="butt"' + dim +
          (pickable ? ' data-vgeo="' + esc(c.name) + '" style="cursor:pointer"' : '') + '>' +
          '<title>' + esc(c.name) + ' · ' + c.uniq + ' ' + anPl(c.uniq, 'человек', 'человека', 'человек') +
          ' · ' + Math.round(frac * 100) + '%' + (c.orders ? ' · ' + c.orders + ' ' + anPl(c.orders, 'заявка', 'заявки', 'заявок') : '') +
          '</title></path>';
      });
    }
    var selC = sel && slices.filter(function (c) { return c.name === sel; })[0];
    var big = selC ? Math.round(selC.uniq / total * 100) + '%' : String(stats.uniq);
    var small = selC ? anCut(sel, 13) : (stats.distinctCities + ' ' + anPl(stats.distinctCities, 'город', 'города', 'городов'));
    return '<svg viewBox="0 0 120 120" role="img" aria-label="Города посетителей: ' + esc(small) + '">' +
      '<circle cx="60" cy="60" r="42" fill="none" stroke="var(--hairline)" stroke-width="' + sw + '"/>' +
      segs +
      '<text x="60" y="59" text-anchor="middle" style="font-family:var(--mono);font-size:21px;fill:var(--ink)">' + esc(big) + '</text>' +
      '<text x="60" y="73" text-anchor="middle" style="font-family:var(--sans);font-size:7.5px;letter-spacing:.06em;text-transform:uppercase;fill:var(--ink-soft)">' + esc(small) + '</text>' +
      '</svg>';
  }
  function anBars(items, denom) {
    if (!items || !items.length) return '<p class="an-foot">нет данных</p>';
    var max = items.reduce(function (m, x) { return Math.max(m, x.uniq); }, 1);
    return items.map(function (x, i) {
      var w = Math.max(3, Math.round(x.uniq / max * 100));
      var pct = denom ? Math.round(x.uniq / denom * 100) : 0;
      return '<div class="an-bar' + (i === 0 ? ' top' : '') + '" title="' + esc(x.name) + ' · ' + x.uniq + (pct ? ' · ' + pct + '%' : '') + '">' +
        '<span class="an-blbl">' + esc(x.name) + '</span>' +
        '<span class="an-track"><span class="an-fill" style="width:' + w + '%"></span></span>' +
        '<span class="an-n">' + x.uniq + '</span></div>';
    }).join('');
  }
  function tplAnalytics(stats) {
    if (!stats || !stats.uniq) {
      return '<p class="an-empty-c">Данных для аналитики за выбранный период пока нет — расширьте окно фильтром выше.</p>';
    }
    var period = AN_PERIOD[st.vopts.hours] || 'период';
    var real = stats.cities;
    var head = '<div class="an-head"><p class="caps" style="margin:0">Откуда наши посетители</p>' +
      '<span class="sub">уник. люди · за ' + period + ' · по загруженным сессиям</span></div>';
    if (!real.length) {
      return head + '<p class="an-empty-c">Город по IP пока не определился ни у кого за период. ' +
        'Он появляется, когда посетитель заходит не через анонимайзер — расширьте окно (Неделя / 30 дней).</p>';
    }
    var p1 = Math.round(real[0].uniq / stats.uniq * 100);
    var reco = '<div class="an-reco">Больше всего людей из <b>' + esc(real[0].name) + '</b> — ' + p1 + '%' +
      (real[1] ? ', затем <b>' + esc(real[1].name) + '</b> — ' + Math.round(real[1].uniq / stats.uniq * 100) + '%' : '') +
      '. Туда есть смысл усилить таргет.</div>';
    var sel = st.vgeo;
    var legend = '<ul class="an-legend">' + stats.slices.map(function (c) {
      var pct = Math.round(c.uniq / stats.uniq * 100);
      var pick = !c.none && !c.rest;
      var on = sel && c.name === sel ? ' class="on"' : '';
      return '<li' + on + '>' +
        (pick ? '<button type="button" data-vgeo="' + esc(c.name) + '">' : '<button type="button" disabled>') +
        '<span class="an-sw" style="background:' + c.color + '"></span>' +
        '<span class="an-nm">' + esc(c.name) + '</span>' +
        '<span class="an-pct">' + c.uniq + ' · ' + pct + '%</span></button></li>';
    }).join('') + '</ul>';
    var conv = '<div class="an-conv"><span class="caps">Конверсия в заявку по городам</span>' +
      real.map(function (c) {
        var low = c.uniq < 3;
        var pct = c.uniq ? Math.round(c.orders / c.uniq * 100) : 0;
        return '<div class="an-crow' + (low ? ' low' : (c.orders ? ' hot' : '')) + '">' +
          '<span class="an-cnm">' + esc(c.name) + '</span>' +
          '<span class="an-cn">' + c.orders + '/' + c.uniq + '</span>' +
          '<span class="an-cv">' + (low ? '—' : pct + '%') + '</span></div>';
      }).join('') + '<p class="an-foot">Города с 1–2 людьми (—) — слишком мелкая выборка, чтобы верить проценту.</p></div>';
    var band = '<div class="an-band"><div class="an-donut">' + anDonut(stats, sel) + '</div>' +
      '<div class="an-side">' + legend + conv + '</div></div>';
    var breaks = '<div class="an-breaks">' +
      '<div class="an-block"><span class="caps">Источники</span>' + anBars(stats.sources, stats.uniq) + '</div>' +
      '<div class="an-block"><span class="caps">Устройства</span>' +
        anBars([{ name: 'мобильные', uniq: stats.devices.mob }, { name: 'десктоп', uniq: stats.devices.desk }], stats.uniq) +
        (stats.bots ? '<p class="an-foot">+' + stats.bots + ' ' + anPl(stats.bots, 'заход робота', 'захода роботов', 'заходов роботов') + ' отфильтровано</p>' : '') +
      '</div></div>';
    var more = '<details class="an-more"' + (st.vanmore ? ' open' : '') + '><summary>ещё разрезы — входные страницы, новые и вернувшиеся</summary>' +
      '<div class="an-breaks">' +
        '<div class="an-block"><span class="caps">Входные страницы</span>' + anBars(stats.entries, stats.uniq) + '</div>' +
        '<div class="an-block"><span class="caps">Новые и вернувшиеся <span style="text-transform:none;letter-spacing:0;color:var(--ink-faint)">— в пределах окна</span></span>' +
          anBars([{ name: 'новые', uniq: stats.fresh }, { name: 'вернувшиеся', uniq: stats.ret }], stats.uniq) + '</div>' +
      '</div></details>';
    var foot = stats.gap
      ? '<p class="an-foot" style="margin-bottom:12px">Ещё ~' + stats.gap + ' уник. посетителей за период не попали в загруженное окно ленты — на круге показаны только загруженные сессии.</p>'
      : '';
    return head + reco + band + breaks + more + foot;
  }

  function visitRow(v) {
    var online = minsAgo(v.at) < 3;
    var who;
    if (v.user && v.user.name) {
      who = '' + esc(v.user.name) + (v.user.username ? ' @' + esc(v.user.username) : '');
    } else if (v.contact) {
      who = icoPhone(13) + ' ' + esc(v.contact);
    } else {
      who = 'аноним · ' + esc(v.vid);
    }
    var known = !!(v.user || v.contact);
    var stepCls = v.order_id ? 'v-step done' : 'v-step';
    var stepTxt = v.order_id
      ? 'заявка №' + v.order_id
      : (v.step ? ico('flag', 12) + ' ' + esc(v.step) : '');
    var path = v.entry === v.page
      ? pageName(v.entry)
      : pageName(v.entry) + ' → ' + pageName(v.page);
    var dur = Math.max(0, Math.round((new Date(v.at + 'Z') - new Date(v.started + 'Z')) / 60000));
    var open = st.vopen[v.id];
    return '<div class="ag-vrow" data-vrow="' + v.id + '" role="button" tabindex="0" aria-expanded="' + (open ? 'true' : 'false') + '">' +
      '<div class="v-top">' +
        (online ? '<span class="v-on" title="на сайте прямо сейчас"></span>' : '') +
        '<span class="v-time">' + dt(v.at) + '</span>' +
        '<span class="v-geo">' + esc(v.geo || (v.bot ? 'робот' : 'откуда — выясняем…')) + '</span>' +
        '<span class="v-dev">' + devLabel(v.ua) + (v.bot ? ' · бот' : '') + '</span>' +
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
      '<div id="agVAnalytics"></div>' +
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
    var an = document.getElementById('agVAnalytics');
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
    if (an) an.innerHTML = tplAnalytics(visitStats(st.visits || []));
    var o = st.vopts;
    if (flt) flt.innerHTML =
      (st.vgeo ? '<button type="button" class="ag-chip on" data-vgeo="' + esc(st.vgeo) + '" title="Показать все города">× ' + esc(anCut(st.vgeo, 20)) + '</button>' : '') +
      [[24, 'Сутки'], [72, '3 дня'], [168, 'Неделя'], [720, '30 дней']]
      .map(function (h) {
        return '<button type="button" class="ag-chip' + (o.hours === h[0] ? ' on' : '') + '" data-vh="' + h[0] + '">' + h[1] + '</button>';
      }).join('') +
      '<button type="button" class="ag-chip' + (o.self ? ' on' : '') + '" data-vt="self">мои заходы</button>' +
      '<button type="button" class="ag-chip' + (o.bots ? ' on' : '') + '" data-vt="bots">роботы</button>';
    var rows = st.visits || [];
    if (st.vgeo) rows = rows.filter(function (v) { return cityOf(v) === st.vgeo; });
    var top = keepScroll ? list.scrollTop : 0;
    list.innerHTML = rows.length
      ? rows.map(visitRow).join('')
      : (st.vgeo
        ? '<div class="ag-empty">Из города «' + esc(st.vgeo) + '» заходов в загруженном окне нет. ' +
          '<button type="button" class="ag-linkbtn" data-vgeo="' + esc(st.vgeo) + '">показать все</button></div>'
        : '<div class="ag-empty">Пока тихо — за выбранный период заходов нет.<br>' +
          '<span class="petit">Маячок появился на сайте только что: лента наполнится с первыми посетителями.</span></div>');
    if (keepScroll) list.scrollTop = top;
  }

  function loadCard(id, silent) {
    st.sel = id;
    var requestSeq = ++st.cardRequestSeq;
    S.api.get('/admin/orders/' + id).then(function (r) {
      if (requestSeq !== st.cardRequestSeq || st.tab !== 'orders' || st.sel !== id) return;
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
    var requestSeq = ++st.clientRequestSeq;
    document.body.classList.add('admin-client-selected');
    drawClientList();   /* подсветить выбранную строку сразу */
    var profile = document.getElementById('agCCard');
    if (profile) profile.innerHTML = '<div class="ag-empty" role="status">Открываем карточку клиента…</div>';
    S.api.get('/admin/clients/' + id).then(function (r) {
      if (requestSeq !== st.clientRequestSeq || st.tab !== 'clients' || st.csel !== id) return;
      if (!r.ok) {
        st.csel = null;
        st.ccard = null;
        document.body.classList.remove('admin-client-selected');
        drawClientList();
        toast('Карточка клиента не загрузилась — попробуйте ещё раз');
        return;
      }
      st.ccard = r.client;
      drawClientCard();
      var back = document.querySelector('[data-client-back]');
      if (back) {
        try { back.focus({ preventScroll: true }); } catch (e) {}
      }
    }).catch(function () {
      if (requestSeq !== st.clientRequestSeq || st.tab !== 'clients' || st.csel !== id) return;
      st.csel = null;
      st.ccard = null;
      document.body.classList.remove('admin-client-selected');
      drawClientList();
      toast('Сеть прервалась — карточка клиента не открылась');
    });
  }

  /* ---------------- каркас ---------------- */
  function render(html) { root.innerHTML = html; }

  function adminThemeButton() {
    var action = S.theme && S.theme.current && S.theme.current() === 'dark'
      ? 'Включить светлую тему'
      : 'Включить тёмную тему';
    return '<button class="theme-toggle" type="button" aria-label="Сменить тему оформления">' +
      '<span aria-hidden="true">◐</span><span class="visually-hidden" data-theme-action>' +
      action + '</span></button>';
  }

  function renderShell() {
    var u = S.api.user() || {};
    document.body.classList.add('admin-workspace-ready');
    render('<a class="workspace-skip-link" href="#agBody">К рабочей области</a>' +
      '<header class="admin-mobile-appbar">' +
        '<button type="button" class="admin-mobile-appbar__back" data-admin-mobile-back aria-label="Вернуться назад">←</button>' +
        '<span class="admin-mobile-appbar__brand"><img src="bimi/logo.svg" alt="">' +
          '<span><strong>Редакционный кабинет</strong><small>Управление</small></span></span>' +
        '<button type="button" class="admin-mobile-appbar__search" data-admin-mobile-search aria-label="Найти дело">' + icoSearch(18) + '</button>' +
        adminThemeButton() +
        '<button type="button" class="admin-mobile-appbar__menu" data-admin-mobile-menu aria-controls="agNav" aria-expanded="false" aria-label="Открыть разделы"><i></i></button>' +
      '</header>' +
      '<div class="admin-shell">' +
      '<aside class="admin-sidebar">' +
        '<a class="admin-sidebar__brand" href="/"><img src="bimi/logo.svg" alt="">' +
          '<span><strong>Академический Салон</strong><small>Редакционный кабинет</small></span></a>' +
        /* Поиск поднят НАД навигацией: раньше он стоял после неё и вместе с
           подвалом съедал столько высоты, что на окне 720px список разделов
           обрывался на «Отзывах» — пять разделов не существовало для глаза. */
        '<button type="button" class="admin-sidebar__search" data-admin-global-search>' +
          icoSearch(15) + '<span>Найти дело</span><kbd>⌘ K</kbd></button>' +
        '<div class="admin-sidebar__scroll">' +
          '<nav id="agNav" aria-label="Разделы администрирования"></nav>' +
        '</div>' +
        /* Подвал сжат до двух строк. Раньше он занимал пять: две ссылки,
           плашка темы с текстом в два ряда, выход и декоративная подпись
           «Рабочая среда». Эти ~90px отбирались у списка разделов. */
        '<footer><div class="admin-sidebar__links">' +
            '<a href="/">Сайт <span>↗</span></a>' +
            '<a href="dashboard.html">Кабинет клиента <span>↗</span></a>' +
          '</div>' +
          '<div class="admin-theme-row">' + adminThemeButton() +
            '<span data-theme-action>' + (S.theme && S.theme.current && S.theme.current() === 'dark'
              ? 'Включить светлую тему' : 'Включить тёмную тему') + '</span></div>' +
          '<button type="button" class="admin-logout" id="agLogout" title="Выйти из кабинета мастера">Выйти · ' +
            esc(u.name || 'мастер') + '</button></footer>' +
      '</aside>' +
      '<main class="admin-main"><header class="admin-head" id="agHead"></header>' +
        '<div id="agBody" tabindex="-1"></div></main></div>');
    drawNav();
    drawLive();
    bindNavOverflow();
  }

  /* Список разделов длиннее сайдбара на любом ноутбучном окне. Скролл там был
     всегда, но невидимый: ни полосы, ни среза. Класс на обёртке включает
     затухание у нижней кромки — оно и есть единственный честный признак,
     что список продолжается. Снимаем его, когда доскроллили. */
  function syncNavOverflow() {
    var box = root.querySelector('.admin-sidebar__scroll');
    if (!box) return;
    var slack = box.scrollHeight - box.clientHeight;
    box.classList.toggle('has-more', slack > 4 && box.scrollTop < slack - 4);
    box.classList.toggle('has-before', slack > 4 && box.scrollTop > 4);
  }
  function bindNavOverflow() {
    var box = root.querySelector('.admin-sidebar__scroll');
    if (!box) return;
    box.addEventListener('scroll', syncNavOverflow, { passive: true });
    if (window.ResizeObserver) {
      try { new ResizeObserver(syncNavOverflow).observe(box); } catch (e) {}
    }
    syncNavOverflow();
  }
  window.addEventListener('resize', function () { syncNavOverflow(); });

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
    /* пока список обращений не загружен — верим сводке; после загрузки
       считаем сами, иначе отметки мастера не гасят счётчик */
    var leads = st.leadsLoaded ? leadsOpenCount() : (ov.leads_new || 0);
    if (!st.leadsLoaded && !st.leadsSynced && leads > 0 && leadsDone().length) {
      st.leadsSynced = true;
      S.api.get('/admin/leads').then(function (r) {
        if (!r || !r.ok) return;
        st.leads = r.leads || [];
        st.leadsLoaded = true;
        drawNav();
      });
    }
    return {
      orders: (by.new || 0) + (by.fix || 0) + (ov.claimed || 0),
      reviews: ov.reviews_pending || 0,
      qa: (ov.qa && ov.qa.pending) || 0,
      gifts: (ov.gifts && ov.gifts.claimed_n) || 0,
      leads: leads
    };
  }

  function drawNav() {
    var box = document.getElementById('agNav');
    if (!box) return;
    var b = navBadges();
    var online = (st.ov && st.ov.visits && st.ov.visits.online) || 0;
    /* [id, подпись, знак из ICO, счётчик]. Раньше в третьей позиции стояла
       кириллическая буква в рамке — «С Д К ? О Л Р П V М Н И». Периферийным
       зрением такие плашки не различаются, а «V» рядом с кириллицей читалась
       как опечатка: разделы теперь опознаются рисунком. */
    var groups = [
      ['Работа', [
        ['summary', 'Рабочий стол', 'desk', 0],
        ['orders', 'Дела', 'cases', b.orders],
        ['clients', 'Клиенты', 'clients', 0]
      ]],
      ['Коммуникации', [
        ['qa', 'Приёмная', 'ask', b.qa],
        ['reviews', 'Отзывы', 'reviews', b.reviews],
        ['leads', 'Обращения', 'leads', b.leads],
        ['broadcast', 'Рассылки', 'broadcast', 0]
      ]],
      ['Бизнес и система', [
        ['gifts', 'Сертификаты', 'gifts', b.gifts],
        ['visits', 'Посещения', 'visits', online],
        ['content', 'Материалы', 'content', 0],
        ['settings', 'Настройки', 'settings', 0]
      ]]
    ];
    box.innerHTML = groups.map(function (group) {
      return '<section class="admin-nav-group"><span class="admin-nav-group__label">' +
        group[0] + '</span>' + group[1].map(function (t) {
          var on = st.tab === t[0];
          return '<button type="button" aria-current="' + (on ? 'page' : 'false') +
            '" class="ag-tab' + (on ? ' is-current on' : '') + '" data-tab="' + t[0] + '">' +
            '<i>' + ico(t[2], 17) + '</i><span>' + t[1] + '</span>' +
            (t[3] ? '<b>' + t[3] + '</b>' : '') + '</button>';
        }).join('') + (group[0] === 'Бизнес и система'
          ? '<a class="ag-tab admin-nav-link" href="admin-covers.html">' +
            '<i>' + ico('covers', 17) + '</i><span>Обложки</span></a>'
          : '') + '</section>';
    }).join('');
    syncNavOverflow();
    drawHead();
  }

  function drawHead() {
    var box = document.getElementById('agHead');
    if (!box) return;
    var u = S.api.user() || {};
    var orderByStatus = (st.ov && st.ov.by_status) || {};
    var activeOrders = ['new', 'priced', 'prepay', 'work', 'check', 'fix'].reduce(function (sum, key) {
      return sum + (orderByStatus[key] || 0);
    }, 0);
    var attentionOrders = (orderByStatus.new || 0) + (orderByStatus.fix || 0) +
      ((st.ov && st.ov.claimed) || 0);
    var ordersLead = activeOrders
      ? activeOrders + ' ' + anPl(activeOrders, 'активное дело', 'активных дела', 'активных дел') +
        ' · ' + attentionOrders + ' требуют решения'
      : 'Сроки, оплаты и переписка';
    var label = {
      summary: ['Редакционный кабинет', 'Рабочий стол', 'Сводка на сегодня'],
      visits: ['Аналитика', 'Посещения', 'Живые визиты и источники переходов'],
      orders: ['Операционная работа', 'Дела', ordersLead],
      clients: ['Отношения с клиентами', 'Клиенты', 'История дел и обращений'],
      reviews: ['Репутация', 'Отзывы', 'Публикация и модерация'],
      qa: ['Открытая приёмная', 'Вопросы', 'Редакторские ответы посетителям'],
      gifts: ['Подарочная программа', 'Сертификаты', 'Выпуск, оплата и остатки'],
      leads: ['Обращения с сайта', 'Лиды', 'Новые задачи и контакты'],
      broadcast: ['Коммуникации', 'Рассылки', 'Сегменты и история отправок'],
      settings: ['Настройки сервиса', 'Настройки', 'Доступность, расчёты и рабочие подключения'],
      content: ['Редакционная система', 'Публикации сайта', CONTENT_GUIDES.length + ' материалов в рабочем каталоге']
    }[st.tab] || ['Редакционный кабинет', 'Рабочий стол', ''];
    var initials = String(u.name || 'СМ').trim().split(/\s+/).map(function (p) {
      return p.charAt(0);
    }).join('').slice(0, 2).toUpperCase() || 'СМ';
    var mobileTitle = {
      summary: 'Редакционный кабинет',
      visits: 'Посещения',
      orders: 'Дела',
      clients: 'Клиенты',
      reviews: 'Отзывы',
      qa: 'Приёмная',
      gifts: 'Сертификаты',
      leads: 'Обращения',
      broadcast: 'Рассылки',
      settings: 'Настройки',
      content: 'Материалы'
    }[st.tab] || 'Редакционный кабинет';
    var mobileBrand = root.querySelector('.admin-mobile-appbar__brand strong');
    if (mobileBrand) mobileBrand.textContent = mobileTitle;
    var headAction = '';
    if (st.tab === 'content') {
      headAction = '<a class="header-action" href="knowledge.html" target="_blank" rel="noopener">Открыть библиотеку</a>';
    } else if (st.tab === 'orders') {
      /* Тот же рабочий мастер создания, но с точным названием действия
         текущего раздела: универсальное «Создать» здесь теряло контекст. */
      headAction = '<button type="button" class="header-action wz-open" id="wzOpen">Создать дело</button>';
    } else if (st.tab === 'clients') {
      /* Это не декоративная кнопка: выгрузка строится из уже загруженной
         серверной картотеки и выполняется локально, без новых API-вызовов. */
      headAction = '<button type="button" class="header-action" id="agClientsExport">Экспорт</button>';
    } else if (st.tab === 'broadcast' || st.tab === 'gifts' || st.tab === 'leads') {
      /* Кнопка всегда открывает мастер создания ДЕЛА. Безымянное «Создать»
         в «Отзывах» или «Посещениях» обещало создать отзыв или визит —
         оставляем её только там, где заявка действительно рядом, и с
         честным названием. */
      headAction = '<button type="button" class="header-action wz-open" id="wzOpen">Создать дело</button>';
    }
    box.innerHTML = '<div><p class="eyebrow">' + label[0] + '</p><h1>' + label[1] + '</h1>' +
      '<p>' + label[2] + '</p></div><div class="admin-head__tools">' +
      '<button type="button" class="admin-global-search" data-admin-global-search>' +
        icoSearch(15) + '<span>Найти дело</span><kbd>⌘ K</kbd></button>' +
      headAction +
      '<button type="button" class="ag-live quiet" id="agLive" title="Открыть посещения">' +
        '<span class="ld"></span><span><b id="agLiveN">0</b> онлайн</span></button>' +
      '<span class="admin-profile">' + esc(initials) + '</span></div>';
    drawLive();
  }

  function drawBody() {
    var box = document.getElementById('agBody');
    if (!box) return;
    document.body.classList.remove('admin-drawer-open');
    setAdminDrawerBackground(false);
    if (st.tab !== 'clients') document.body.classList.remove('admin-client-selected');
    releaseAdminObjectUrls();
    if (st.tab === 'summary') {
      box.innerHTML = tplSummary();
      if (st.visits === null) loadVisits(); /* мини-лента заходов дозагрузится сама */
      return;
    }
    if (st.tab === 'content') {
      box.innerHTML = tplContent();
      drawContentRows();
      return;
    }
    if (st.tab === 'visits') { box.innerHTML = tplVisits(); drawVisits(); return; }
    if (st.tab === 'orders') {
      box.innerHTML =
        '<div class="ag-filters" id="agFilters"></div>' +
        '<section class="admin-table-wrap admin-order-register" aria-label="Реестр дел">' +
          '<div class="admin-order-register__head">' +
            '<span aria-hidden="true"></span><span>Дело</span><span>Клиент</span><span>Задача</span>' +
            '<span>Статус</span><span>Ближайший срок</span><span>Сумма</span><span></span></div>' +
          '<div class="ag-list" id="agList" aria-label="Дела"></div>' +
          '<footer class="admin-order-register__footer" id="agListFooter" aria-live="polite"></footer>' +
        '</section><div id="agBulkWrap"></div>' +
        '<button type="button" class="admin-order-backdrop" id="agCardBackdrop" tabindex="-1" aria-label="Закрыть карточку дела" hidden></button>' +
        '<aside class="ag-card admin-order-drawer" id="agCard" role="dialog" aria-modal="true" ' +
          'aria-labelledby="agCardTitle" aria-hidden="true" tabindex="-1"></aside>';
      drawFilters();
      drawList();
      if (st.card) drawCard();
      return;
    }
    if (st.tab === 'clients') {
      box.innerHTML =
        '<section class="client-directory ag-split" aria-label="Клиентская картотека">' +
          '<div class="client-directory__list">' +
            '<div class="ag-filters client-directory__toolbar">' +
              '<input class="ag-search" id="agCQ" type="search" aria-label="Поиск по клиентам" placeholder="Поиск по клиентам" value="' + esc(st.cq) + '">' +
              '<button type="button" class="ag-chip" id="agCQClear" title="Сбросить"' + (st.cq ? '' : ' hidden') + '>× сброс</button>' +
              '<select class="ag-sort" id="agCSort" title="Порядок" aria-label="Порядок клиентов">' +
                '<option value="recent"' + (st.csort === 'recent' ? ' selected' : '') + '>по последнему визиту</option>' +
                '<option value="ltv"' + (st.csort === 'ltv' ? ' selected' : '') + '>по сумме оплат</option>' +
                '<option value="orders"' + (st.csort === 'orders' ? ' selected' : '') + '>по числу заказов</option>' +
                '<option value="bonus"' + (st.csort === 'bonus' ? ' selected' : '') + '>по бонусам</option>' +
                '<option value="name"' + (st.csort === 'name' ? ' selected' : '') + '>по имени</option>' +
              '</select>' +
            '</div>' +
            '<div class="ag-list" id="agCList"></div>' +
          '</div>' +
          '<div class="client-profile ag-card" id="agCCard">' +
            '<div class="ag-empty"><strong>Карточка клиента</strong><br>Выберите клиента в картотеке</div></div>' +
        '</section>';
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
      /* при обрыве: есть кэш — вернём его (loadTab уже стёр тело в «Загружаем…»),
         нет — покажем ошибку с «Повторить». Иначе вкладка зависает на плейсхолдере */
      if (!r || !r.ok) { if (st.tab === 'gifts') { if (st.gifts) drawBody(); else tabFail(); } return; }
      st.gifts = r;
      if (st.tab === 'gifts') drawBody();
    });
  }
  /* «Погашен» приходит с сервера то как spent, то как redeemed — в выпадающем
     списке состояний стоял второй вариант, а в словаре был только первый:
     фильтр «погашенные» мог не найти ни одного кода, а сам код показывал
     сырое английское слово. Держим обе формы как одно состояние. */
  var GIFT_ST = {
    pending: ['ожидает оплаты', 'act'], active: ['действителен', 'ok'],
    spent: ['погашен', ''], redeemed: ['погашен', ''], expired: ['истёк', ''],
    blocked: ['заблокирован', 'due'], canceled: ['отменён', '']
  };
  var GIFT_ST_ALIAS = { spent: 'redeemed', redeemed: 'spent' };
  var GIFT_LEDGER_KIND = {
    issue: 'выпуск', hold: 'зачёт в заказ', release: 'возврат на код',
    adjust: 'корректировка', expire: 'сгорание'
  };
  function tplGifts() {
    if (!st.gifts) { loadGifts(); return '<div class="ag-empty">Загружаем сертификаты…</div>'; }
    var s = st.gifts.stats || {};
    var tiles =
      '<div class="ag-tiles">' +
        '<div class="ag-tile click" data-gift-filter="active"><b class="t-num">' + (s.active_n || 0) + '</b><span class="t-lbl">в обращении →</span></div>' +
        '<div class="ag-tile"><b class="t-num">' + money(s.live_balance) + ' ₽</b><span class="t-lbl">остаток на кодах</span></div>' +
        '<div class="ag-tile"><b class="t-num">' + money(s.redeemed_sum) + ' ₽</b><span class="t-lbl">погашено услугами</span></div>' +
        '<div class="ag-tile click' + (s.claimed_n ? ' warn' : '') + '" data-gift-filter="claimed"><b class="t-num">' + (s.claimed_n || 0) + '</b><span class="t-lbl">на сверке оплаты →</span></div>' +
      '</div>';
    var newBtn = '<div style="margin:12px 0">' +
      '<button type="button" class="btn ' + (st.gnew ? 'btn-line' : 'btn-wax') + '" id="agGiftNew">' +
      (st.gnew ? 'Свернуть форму' : 'Выпустить сертификат') + '</button></div>';
    var form = !st.gnew ? '' :
      '<div class="ag-card" style="max-width:560px;max-height:none;margin-bottom:14px">' +
        '<span class="caps">Ручной выпуск — комплимент или продажа вне сайта</span>' +
        '<div style="display:grid;gap:8px;margin-top:10px">' +
          '<input type="number" id="agGfAmount" min="500" max="50000" step="500" placeholder="Номинал, ₽ (например 5000)" class="ag-inp">' +
          '<input type="text" id="agGfName" maxlength="120" placeholder="Имя получателя (на сертификате, по желанию)" class="ag-inp">' +
          '<input type="email" id="agGfEmail" maxlength="120" placeholder="Почта получателя — отправим письмом (по желанию)" class="ag-inp">' +
          '<input type="text" id="agGfCongrats" maxlength="280" placeholder="Поздравление (по желанию)" class="ag-inp">' +
          '<input type="text" id="agGfNote" maxlength="300" placeholder="Заметка для себя: кому и за что" class="ag-inp">' +
          '<button type="button" class="btn btn-wax" id="agGfCreate">Выпустить — код появится сразу</button>' +
          '<p class="ag-hint">Выпуск ручной оплаты: сертификат сразу действителен. Не забудьте чек, если это продажа.</p>' +
        '</div></div>';
    var gq = (st.gq || '').toLowerCase().trim();
    var list = (st.gifts.gifts || []).filter(function (g) {
      if (st.gfilter === 'claimed' && !(g.claimed && g.status === 'pending')) return false;
      if (st.gfilter && st.gfilter !== 'claimed') {
        var alias = GIFT_ST_ALIAS[st.gfilter];
        var hit = g.state === st.gfilter || g.status === st.gfilter ||
          (alias && (g.state === alias || g.status === alias));
        if (!hit) return false;
      }
      if (!gq) return true;
      return [g.code, g.recip_name, g.buyer_name, g.buyer_contact, g.recip_contact]
        .some(function (x) { return String(x || '').toLowerCase().indexOf(gq) >= 0; });
    });
    var controls = '<div class="ag-filters" style="margin:12px 0">' +
      '<input class="ag-search" id="agGfQ" type="search" placeholder="Поиск: код, имя, почта" value="' + esc(st.gq) + '">' +
      (st.gq || st.gfilter ? '<button type="button" class="ag-chip on" id="agGfClear" title="Сбросить">× фильтр</button>' : '') +
      '<select class="ag-sort" id="agGfState" title="Состояние">' +
        [['', 'все состояния'], ['active', 'действительные'], ['pending', 'на оформлении'],
         ['claimed', 'на сверке оплаты'], ['redeemed', 'погашенные'], ['expired', 'истёкшие'], ['blocked', 'заблокированные']]
        .map(function (o) { return '<option value="' + o[0] + '"' + (st.gfilter === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
      '</select></div>';
    var rows = list.map(function (g) {
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
    var empty = (st.gq || st.gfilter)
      ? '<div class="ag-empty">Ничего не найдено по фильтру. <button type="button" class="ag-linkbtn" data-gift-clear>сбросить</button></div>'
      : '<div class="ag-empty">Сертификатов пока нет — выпустите первый или дождитесь покупки с сайта (страница /gift.html).</div>';
    return tiles + newBtn + form + controls +
      '<div class="ag-gifts">' + (rows || empty) + '</div>';
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
    if (g.code) {
      acts.push('<button type="button" class="btn btn-line" data-gift-copy="' + esc(g.code) + '">Скопировать код</button>');
      acts.push('<button type="button" class="btn btn-line" data-gift-copy-link="' + esc(g.code) + '">Ссылка на активацию</button>');
    }
    if (g.status === 'pending') {
      acts.push('<button type="button" class="btn btn-wax" data-gift-act="confirm" data-gift-id="' + g.id + '">Оплата получена — выпустить</button>');
      acts.push('<button type="button" class="btn btn-line" data-gift-act="cancel" data-gift-id="' + g.id + '">Отменить оформление</button>');
    }
    if (g.status === 'active' || g.status === 'expired') {
      acts.push('<button type="button" class="btn btn-line" data-gift-act="extend" data-gift-id="' + g.id + '">Продлить +90 дн</button>');
      acts.push('<button type="button" class="btn btn-line" data-gift-act="adjust" data-gift-id="' + g.id + '">± Корректировать остаток</button>');
      if (g.recip_contact || g.buyer_contact)
        acts.push('<button type="button" class="btn btn-line" data-gift-act="resend" data-gift-id="' + g.id + '">' + icoMail(15) + ' Переслать письма</button>');
      acts.push('<button type="button" class="btn btn-line" data-gift-act="block" data-gift-id="' + g.id + '">Заблокировать</button>');
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
    /* показываем остаток ПОСЛЕ каждой операции — иначе сверку приходится
       складывать в уме. Копим в хронологическом порядке (по времени), не
       завися от того, как отсортирован массив (новые сверху или снизу) */
    var led = (g.ledger || []).slice();
    var chron = led.map(function (l, i) { return i; })
      .sort(function (a, b) { return String(led[a].at || '') < String(led[b].at || '') ? -1 : 1; });
    var runMap = {}, run = 0;
    chron.forEach(function (i) { run += (led[i].delta || 0); runMap[i] = run; });
    var ledger = led.map(function (l, idx) {
      var k = GIFT_LEDGER_KIND[l.kind] || l.kind;
      return '<div class="ag-ev"><span>' + (l.at || '').slice(0, 10) + ' ' + (l.at || '').slice(11, 16) + '</span>' +
        '<span>' + k + (l.order_id ? ' · заказ №' + l.order_id : '') + (l.note ? ' · ' + esc(l.note) : '') +
          ' <span style="color:var(--ink-faint)">→ остаток ' + money(runMap[idx]) + ' ₽</span></span>' +
        '<b class="' + (l.delta < 0 ? 'neg' : 'pos') + '">' + (l.delta > 0 ? '+' : '') + money(l.delta) + '</b></div>';
    }).join('');
    box.innerHTML = info +
      '<div class="ag-actions" style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0">' + acts.join('') + '</div>' +
      (orders ? '<span class="caps">Заказы по коду</span><div style="margin:6px 0 10px">' + orders + '</div>' : '') +
      '<span class="caps">Журнал операций</span><div class="ag-evs" style="margin-top:6px">' +
      (ledger || '<p class="ag-hint">Пока пусто.</p>') + '</div>';
  }
  function giftAction(id, act, body, okMsg) {
    if (st.giftBusy) return;   /* без этого двойной клик шлёт +90+90 или дубли писем */
    st.giftBusy = true;
    S.api.post('/admin/gifts/' + id + '/' + act, body || {}).then(function (r) {
      st.giftBusy = false;
      if (!r || !r.ok) {
        toast({ gift_state: 'Уже в другом состоянии — обновите список',
                mail_off: 'Почта не настроена или адресов нет',
                bad_amount: 'Проверьте сумму' }[(r && r.error) || ''] || 'Не получилось');
        return;
      }
      toast((r.gift && r.gift.expires_ru && act === 'extend') ? 'Продлён · теперь до ' + r.gift.expires_ru : (okMsg || 'Готово'));
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
      'В конец автоматически добавляется «Отписаться: /stopnews». Отписавшиеся, заблокировавшие бота ' +
      'и заблокированные вами клиенты рассылку не получают.</p>' +
      '<div class="ag-actrow"><select id="agBSeg" class="ag-sort" style="border-radius:var(--r)">' +
        '<option value="all">Все клиенты</option>' +
        '<option value="active">С активными заказами</option>' +
        '<option value="done">С завершёнными заказами</option>' +
      '</select><span class="petit" id="agBCount">считаем получателей…</span></div>' +
      '<div class="ag-actrow" style="margin-top:10px"><textarea id="agBText" rows="7" ' +
      'placeholder="Текст сообщения — обычным текстом, как пишете в Telegram.&#10;&#10;Например: «До конца месяца дарим +10% бонусами на любую летнюю работу…»"></textarea></div>' +
      '<p class="petit" id="agBCnt" style="margin:6px 0 0;text-align:right">0 / 4096</p>' +
      '<div class="ag-actrow" style="margin-top:10px">' +
        '<button type="button" class="btn btn-line" id="agBTest">Отправить себе — посмотреть</button>' +
        '<button type="button" class="btn btn-wax" id="agBSend">Запустить рассылку</button></div>' +
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
    /* пока идёт рассылка — гасим кнопки, чтобы не запустить вторую поверх */
    var send = document.getElementById('agBSend'), test = document.getElementById('agBTest');
    if (send) { send.disabled = !!stt.running; send.textContent = stt.running ? 'Идёт рассылка' : 'Запустить рассылку'; }
    if (test) test.disabled = !!stt.running;
    if (stt.running) {
      el.innerHTML = 'Идёт рассылка: отправлено <b>' + stt.sent + '</b> из ' + stt.total +
        (stt.failed ? ' · недоставлено ' + stt.failed : '');
      setTimeout(function () {
        if (st.tab !== 'broadcast') return;
        S.api.get('/admin/broadcast/status').then(function (r) { if (r.ok) bcastStatus(r.state); });
      }, 2500);
    } else if (stt.finished_at) {
      el.innerHTML = 'Последняя рассылка («' + esc(stt.segment) + '»): доставлено ' + stt.sent +
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
  function deskRows() {
    var rows = [];
    (st.desk || []).forEach(function (o) {
      if (o.paused) return;
      var left = dlLeft(o), quiet = silentDays(o);
      var r = null;
      /* focus — блок карточки, из-за которого дело попало в очередь.
         Очередь называет причину, значит знает и адрес: карточка встанет
         на нужном месте, а не заставит искать его глазами заново. */
      if (left !== null && left < 0) {
        r = { sc: 100 + Math.min(-left, 30), why: 'срок вышел ' + (-left) + ' дн назад', cls: 'fire',
              focus: 'handoff', act: 'Открыть передачу' };
      } else if (left !== null && left <= 2 && 'work check fix prepay priced new'.indexOf(o.status) >= 0) {
        r = { sc: 96 - left, why: left === 0 ? 'срок результата сегодня' : left === 1 ? 'срок результата завтра' : 'срок результата через 2 дня', cls: 'fire',
              focus: 'handoff', act: 'Открыть передачу' };
      } else if (o.claimed) {
        r = { sc: 85, why: 'клиент отметил оплату — сверьте и подтвердите', cls: 'act',
              focus: 'plan', act: 'Открыть план оплат' };
      } else if (o.status === 'new') {
        r = { sc: 80, why: 'новая заявка — посмотрите и назначьте цену', cls: 'act',
              focus: 'plan', act: 'Назначить цену' };
      } else if (o.status === 'fix') {
        r = { sc: 75, why: 'клиент ждёт правки', cls: 'act',
              focus: 'feed', act: 'Открыть переписку' };
      } else if (o.status === 'priced' && quiet >= 2) {
        r = { sc: 60, why: 'предложение висит ' + quiet + ' дн — напомните о себе', cls: '',
              focus: 'feed', act: 'Написать клиенту' };
      } else if (o.status === 'prepay' && quiet >= 2) {
        r = { sc: 58, why: 'счёт не оплачен ' + quiet + ' дн — стоит напомнить', cls: '',
              focus: 'plan', act: 'Открыть план оплат' };
      } else if (o.status === 'check' && quiet >= 5) {
        r = { sc: 50, why: 'на проверке ' + quiet + ' дн — поторопите с приёмкой', cls: '',
              focus: 'feed', act: 'Написать клиенту' };
      }
      if (!r) return;
      r.o = o;
      rows.push(r);
    });
    rows.sort(function (a, b) { return b.sc - a.sc; });
    return rows;
  }
  /* «12:07» — метка свежести сводки: рабочий стол должен признаваться,
     когда цифры на экране уже устарели */
  function clockHM(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' +
      (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
  }

  function tplSummary() {
    var ov = st.ov || {};
    var by = ov.by_status || {};
    var active = ['new', 'priced', 'prepay', 'work', 'check', 'fix']
      .reduce(function (s, k) { return s + (by[k] || 0); }, 0);
    if (st.desk === null) loadDesk();
    var queue = st.desk === null ? [] : deskRows();
    var qa = +((ov.qa && ov.qa.pending) || 0);
    var reviews = +(ov.reviews_pending || 0);
    var subsPending = +(ov.subs_pending || 0);
    var attention = queue.length + qa + reviews + subsPending;
    var dueToday = (st.desk || []).filter(function (o) { return dlLeft(o) === 0; }).length;
    var waiting = (by.priced || 0) + (by.prepay || 0) + (by.check || 0);
    var events = (ov.events || []).slice(0, 2);
    var weeks = (ov.weeks || []).slice(-7);
    var maxWeek = Math.max.apply(null, weeks.map(function (x) { return x.revenue || 0; }).concat([1]));
    var quality = ov.quality || {};
    var alertAction = queue.length
      ? ' data-open-order="' + queue[0].o.id + '">Открыть первое дело'
      : qa
        ? ' data-go="@qa">Открыть приёмную'
        : reviews
          ? ' data-go="@reviews">Открыть отзывы'
          : ' data-summary-jump="agSubs">Открыть подписки';
    var loading = st.desk === null;
    var fresh = '<small class="admin-alert__stamp">живые данные · обновлено ' +
      clockHM(st.ovAt) + '</small>';
    var alertCopy = st.ovFailed
      ? '<section class="admin-alert admin-alert--stale" aria-busy="false"><span>!</span>' +
        '<div><strong>Связь со сводкой прервалась</strong>' +
        '<p>Показываем последние полученные данные. Рабочие действия доступны.</p>' +
        '<small class="admin-alert__stamp">нет связи · данные на ' + clockHM(st.ovAt) + '</small></div>' +
        '<button type="button" id="agPulseRetry">Обновить сейчас <span>→</span></button></section>'
      : loading
      ? '<section class="admin-alert admin-alert--stale" aria-busy="true"><span>···</span>' +
        '<div><strong>Собираем очередь</strong>' +
        '<p>Сверяем сроки, оплаты и обращения. Список появится через мгновение.</p>' +
        '<small class="admin-alert__stamp">обновлено ' + clockHM(st.ovAt) + '</small></div></section>'
      : attention
      ? '<section class="admin-alert" aria-busy="false"><span>' + attention + '</span><div><strong>' +
        attention + ' ' + anPl(attention, 'задача требует', 'задачи требуют', 'задач требуют') +
        ' решения</strong><p>Сроки, оплаты, вопросы и модерация собраны в одном центре действий.</p>' +
        fresh + '</div>' +
        '<button type="button"' + alertAction + ' <span>→</span></button></section>'
      : '<section class="admin-alert admin-alert--calm" aria-busy="false"><span>' + icoCheck(17) +
        '</span><div><strong>Стол чист — срочных решений нет</strong>' +
        '<p>Новые события появятся здесь автоматически.</p>' + fresh + '</div>' +
        '<button type="button" data-go="active">Активные дела <span>→</span></button></section>';
    var queueHtml = queue.length
      ? queue.slice(0, 4).map(function (r) {
          var o = r.o;
          var time = o.deadline_date ? dmLabel(o.deadline_date) : '—';
          return '<button type="button" data-open-order="' + o.id + '" data-focus="' +
            esc(r.focus || '') + '" title="' + esc(r.act || 'Открыть дело') + '"><span>' + esc(time) + '</span>' +
            '<i class="admin-status admin-status--' + (r.cls === 'fire' ? 'attention' : 'work') + '"></i>' +
            '<div><strong>' + esc(r.why) + '</strong><small>№' + o.id + ' · ' +
            esc(o.work_label || 'Заявка') + '</small></div>' +
            '<b class="admin-queue__act">' + esc(r.act || 'Открыть') + ' →</b></button>';
        }).join('')
      : loading
        ? '<div class="admin-queue-empty" aria-busy="true"><i class="admin-status admin-status--work"></i>' +
          '<span><strong>Собираем очередь</strong><small>Читаем активные дела</small></span></div>'
        : '<div class="admin-queue-empty"><i class="admin-status admin-status--done"></i>' +
          '<span><strong>Срочных действий нет</strong><small>Очередь разобрана</small></span></div>';
    /* Сумма недели стоит над СВОИМ столбиком, а не в общей полосе у верхней
       кромки графика: раньше все подписи были прижаты к потолку колонки и
       читались как строка заголовков, оторванная от высоты столбиков. */
    var weekHtml = weeks.length
      ? weeks.map(function (x, index) {
          var value = x.revenue || 0;
          var height = value ? Math.max(10, Math.round(value / maxWeek * 100)) : 3;
          var when = esc(dmLabel(x.start || String(index + 1)));
          return '<span title="Неделя с ' + when + ': ' + money(value) + ' ₽">' +
            '<span class="load-chart__track"><i style="height:' + height + '%">' +
              '<b>' + (value ? money(value) : '0') + '</b></i></span>' +
            '<small>' + when + '</small></span>';
        }).join('')
      : '<div class="admin-chart-empty">Данные появятся после подтверждённых платежей.</div>';
    var inboxHtml = events.length
      ? events.map(function (e) {
          var raw = evData(e);
          return '<button type="button"' + (e.order_id ? ' data-open-order="' + e.order_id + '"' : '') +
            '><span>' + (e.order_id ? '№' : 'АС') + '</span><div><strong>' +
            esc(evLabel(e.kind)) + '</strong><small>' + esc(raw || 'Событие мастерской') +
            '</small></div><time>' + dt(e.at) + '</time></button>';
        }).join('')
      : '<div class="admin-inbox-empty">Новых событий пока нет.</div>';
    return '<section class="admin-workbench" aria-label="Рабочий стол мастерской">' +
      alertCopy +
      tplSubs(ov) +
      '<section class="admin-metrics">' +
        '<button type="button" data-go="active"><span>Активные дела</span><strong>' + active + '</strong><small>' +
          (by.new || 0) + ' новых</small></button>' +
        '<button type="button" data-go="active"><span>Ожидают клиента</span><strong>' + waiting + '</strong><small>' +
          (ov.claimed || 0) + ' оплат на сверке</small></button>' +
        '<button type="button" data-go="active"><span>Срок сегодня</span><strong>' + dueToday + '</strong><small>' +
          (dueToday ? '<i class="warn">проверьте очередь</i>' : 'рисков не отмечено') + '</small></button>' +
        '<article><span>Поступления за месяц</span><strong>' +
          money((ov.month && ov.month.revenue) || 0) + ' ₽</strong><small>подтверждённые операции</small></article>' +
      '</section>' +
      '<div class="admin-dashboard-grid">' +
        '<section class="admin-panel admin-queue"><header><div><h2>Сегодня</h2><span>По срочности</span></div>' +
          '<button type="button" class="line-link" data-go="active">Вся очередь</button></header><div>' +
          queueHtml + '</div></section>' +
        '<section class="admin-panel admin-load"><header><div><h2>Поступления</h2><span>Последние недели</span></div></header>' +
          '<div class="load-chart">' + weekHtml + '</div><footer><span><i class="admin-status admin-status--work"></i>' +
          'Подтверждённые платежи</span></footer></section>' +
        '<section class="admin-panel admin-quality"><header><div><h2>Качество</h2><span>По данным мастерской</span></div></header>' +
          '<div><strong>' + (quality.first_accept_pct != null ? quality.first_accept_pct + '%' : '—') +
          '</strong><span>этапов приняты с первого раза</span></div><dl>' +
          '<div><dt>Средний ответ</dt><dd>' + esc(quality.reply_time || '—') + '</dd></div>' +
          '<div><dt>На доработке</dt><dd>' + (by.fix || 0) + '</dd></div>' +
          '<div><dt>Отзывы</dt><dd>' + reviews + '</dd></div></dl></section>' +
        '<section class="admin-panel admin-inbox"><header><div><h2>Последние события</h2><span>' +
          (ov.events || []).length + ' в сводке</span></div><button type="button" data-go="@visits">Посещения</button></header>' +
          '<div>' + inboxHtml + '</div></section>' +
      '</div></section>';
  }

  function tplContent() {
    var topics = [
      ['all', 'Все'],
      ['vkr', 'ВКР'],
      ['course', 'Курсовые'],
      ['format', 'Оформление'],
      ['defense', 'Защита']
    ];
    return '<section class="content-overview" aria-label="Состояние библиотеки">' +
        '<article><span>В рабочем каталоге</span><strong>' + CONTENT_GUIDES.length +
          '</strong><small>доступны из кабинета</small></article>' +
        '<article><span>Тематические группы</span><strong>' + (topics.length - 1) +
          '</strong><small>от темы до защиты</small></article>' +
        '<article><span>Правовые документы</span><strong>12</strong><small>с отдельной навигацией</small></article>' +
        '<article><span>Обложки</span><strong>2</strong><small>формата выгрузки</small></article>' +
      '</section>' +
      '<section class="admin-content-toolbar" aria-label="Фильтры материалов">' +
        '<label><span class="sr-only">Поиск публикаций</span>' +
          '<input id="agContentQ" type="search" autocomplete="off" placeholder="Название или тема" value="' +
          esc(st.contentQ) + '"><i aria-hidden="true">' + icoSearch(15) + '</i></label>' +
        '<div class="admin-content-tabs" role="group" aria-label="Темы публикаций">' +
          topics.map(function (item) {
            var on = st.contentTopic === item[0];
            return '<button type="button" data-content-topic="' + item[0] + '" class="' +
              (on ? 'is-active' : '') + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
              item[1] + '</button>';
          }).join('') +
        '</div>' +
        '<a class="admin-content-cover-link" href="admin-covers.html">Мастерская обложек <span>→</span></a>' +
      '</section>' +
      '<section class="content-list" id="agContentList" aria-live="polite"></section>';
  }

  function drawContentRows() {
    var box = document.getElementById('agContentList');
    if (!box) return;
    var query = String(st.contentQ || '').toLocaleLowerCase('ru-RU').trim();
    var rows = CONTENT_GUIDES.filter(function (guide) {
      var topicOk = st.contentTopic === 'all' || guide[3] === st.contentTopic;
      var textOk = !query || (guide[1] + ' ' + guide[2] + ' ' + guide[4])
        .toLocaleLowerCase('ru-RU').indexOf(query) >= 0;
      return topicOk && textOk;
    });
    box.innerHTML = rows.length ? rows.map(function (guide) {
      var index = CONTENT_GUIDES.indexOf(guide) + 1;
      return '<article>' +
        '<span class="content-list__index">' + String(index).padStart(2, '0') + '</span>' +
        '<div><span class="tag">' + esc(guide[2]) + '</span><h2>' + esc(guide[1]) +
          '</h2><p>' + esc(guide[4]) + '</p></div>' +
        '<div><span class="tag tag--green">Опубликовано</span><small>страница доступна</small></div>' +
        '<div><a href="' + guide[0] + '.html" target="_blank" rel="noopener" ' +
          'aria-label="Открыть материал: ' + esc(guide[1]) + '">↗</a></div>' +
      '</article>';
    }).join('') : '<div class="admin-content-empty">По этому запросу материалов нет.</div>';
  }

  /* -------- подписки «Салон+»: свой платёжный контур, сверка отдельно --------
     Подписка — не заказ: здесь только «оплата получена → активировать»
     и «закрыть оформление». Активация и уведомления — само. */
  function tplSubs(ov) {
    var sd = st.subs;
    var pend = (sd && sd.pending) || [];
    if (!pend.length && !(ov.subs_pending > 0)) return '';
    var rows;
    if (st.subsFailed) {
      rows = '<div class="aa-row" style="cursor:default"><span>!</span>' +
        '<span class="aa-what"><b>Не удалось открыть оформления</b><br>' +
        '<span class="petit">Данные сводки сохранены — повторите загрузку списка.</span></span>' +
        '<span class="aa-go"><button type="button" class="ag-linkbtn" id="agSubsRetry">Повторить</button></span></div>';
    } else if (!sd || st.subsLoading) {
      rows = '<div class="aa-row" style="cursor:default"><span>' + ico('hourglass', 15) + '</span>' +
        '<span class="aa-what">Листаем оформления…</span></div>';
    } else {
      rows = pend.map(function (s) {
        var u = s.user || {};
        var who = esc(u.name || 'клиент') +
          (u.username ? ' (@' + esc(u.username) + ')' : (u.email ? ' · ' + esc(u.email) : ''));
        return '<div class="aa-row" style="cursor:default;align-items:flex-start"><span>' + ico(s.claimed ? 'money' : 'hourglass', 15) + '</span>' +
          '<span class="aa-what"><b>' + esc(s.label) + '</b> · ' + esc(s.period_label) + ' · <b>' + money(s.price) + ' ₽</b> — ' + who +
          (s.claimed ? '<br><b>клиент отметил оплату — сверьте поступление</b>' : '<br>ждёт оплату клиента') +
          '<span class="petit" style="display:block;opacity:.7">' + (s.via ? 'оформлена: ' + esc(s.via) + ' · ' : '') + dt(s.created_at) + '</span></span>' +
          /* Две подчёркнутые ссылки стопкой сливались в одну строку текста
             и не читались как разные решения. Кнопки: подтвердить — главная,
             закрыть оформление — вторая. */
          '<span class="aa-go aa-go--acts">' +
          '<button type="button" class="btn btn-wax" data-sub-ok="' + s.id + '">Оплата получена</button>' +
          '<button type="button" class="btn btn-line" data-sub-no="' + s.id + '">Закрыть</button></span></div>';
      }).join('');
    }
    return '<section class="admin-subscriptions" id="agSubs" aria-label="Подписки на сверке">' +
      '<p class="caps">Салон+ · оплата отдельно от заказов</p>' +
      '<div class="ag-attn">' + rows + '</div></section>';
  }

  /* «15.03» из ISO-даты — для колонок срока и столбиков поступлений */
  function dmLabel(s) { var p = String(s || '').split('-'); return p.length === 3 ? p[2] + '.' + p[1] : s; }
  /* ---------------- ЗАКАЗЫ: фильтры и список ---------------- */
  function drawFilters() {
    var box = document.getElementById('agFilters');
    if (!box) return;
    var primary = [
      ['', 'Все'],
      ['new', 'Новые'],
      ['attention', 'Требуется решение'],
      ['work', 'В работе'],
      ['done', 'Завершённые']
    ];
    var secondary = [['active', 'Активные']]
      .concat(Object.keys(ST_META).filter(function (key) {
        return ['new', 'work', 'done'].indexOf(key) < 0;
      }).map(function (key) {
        return [key, stMeta(key)[1]];
      }))
      .concat([['archive', 'Архив'], ['trash', 'Корзина']]);
    var secondaryLabel = '';
    secondary.some(function (item) {
      if (item[0] !== st.filter) return false;
      secondaryLabel = item[1];
      return true;
    });
    function filterButton(item) {
      var on = st.filter === item[0];
      return '<button type="button" class="ag-chip' + (on ? ' on is-active' : '') +
        '" data-f="' + item[0] + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
        item[1] + '</button>';
    }
    box.innerHTML =
      '<div class="admin-filter-tools admin-order-search">' +
        '<input class="ag-search" id="agQ" type="search" aria-label="Поиск дел" ' +
          'placeholder="Номер, клиент или услуга" value="' + esc(st.q) + '">' +
        (st.q ? '<button type="button" class="ag-chip" id="agQClear" title="Сбросить поиск" ' +
          'aria-label="Сбросить поиск">×</button>' : '') +
      '</div>' +
      '<div class="admin-filter-scroll" aria-label="Основные фильтры">' +
        primary.map(filterButton).join('') +
      '</div>' +
      '<details class="admin-order-filters-more"' + (secondaryLabel || st.bulk ? ' open' : '') + '>' +
        '<summary class="quiet-button">Фильтры' +
          (secondaryLabel ? ' · ' + esc(secondaryLabel) : '') +
        '</summary>' +
        '<div class="admin-order-filter-menu">' +
          '<div class="admin-order-filter-menu__statuses" aria-label="Дополнительные статусы">' +
            secondary.map(filterButton).join('') +
          '</div>' +
          '<label class="admin-order-filter-menu__sort"><span>Порядок</span>' +
            '<select class="ag-sort" id="agSort" title="Порядок списка">' +
              '<option value="fresh"' + (st.sort === 'fresh' ? ' selected' : '') + '>Сначала новые</option>' +
              '<option value="updated"' + (st.sort === 'updated' ? ' selected' : '') + '>По последнему движению</option>' +
              '<option value="deadline"' + (st.sort === 'deadline' ? ' selected' : '') + '>По ближайшему сроку</option>' +
            '</select>' +
          '</label>' +
          '<button type="button" class="ag-chip' + (st.bulk ? ' on' : '') + '" id="agBulkToggle" ' +
            'title="Выделить несколько дел для массового действия">' +
            (st.bulk ? 'Завершить выбор' : 'Выбрать несколько') +
          '</button>' +
        '</div>' +
      '</details>';
    if (pendingAdminFocus) {
      pendingAdminFocus = false;
      var search = document.getElementById('agQ');
      if (search) {
        try { search.focus(); search.select(); } catch (e) {}
      }
    }
  }

  function focusAdminSearch() {
    document.body.classList.remove('admin-nav-expanded');
    setAdminNavBackground(false);
    var menuButton = root.querySelector('[data-admin-mobile-menu]');
    if (menuButton) menuButton.setAttribute('aria-expanded', 'false');
    var hadDrawer = !!document.querySelector('.admin-order-drawer.is-open');
    st.sel = null;
    st.card = null;
    st.cardRequestSeq++;
    document.body.classList.remove('admin-drawer-open');
    setAdminDrawerBackground(false);
    pendingAdminFocus = true;
    if (st.tab !== 'orders') {
      goTab('orders');
      return;
    }
    if (hadDrawer) {
      drawBody();
      return;
    }
    var search = document.getElementById('agQ');
    if (search) {
      pendingAdminFocus = false;
      try { search.focus(); search.select(); } catch (e) {}
    } else {
      loadTab();
    }
  }

  function setAdminNavBackground(makeInert) {
    var main = document.querySelector('.admin-main');
    if (main) main.inert = !!makeInert;
  }

  /* панель массовых действий — живёт под списком, пока включён режим выбора */
  function bulkBar() {
    if (!st.bulk) return '';
    var n = st.bulk.size;
    var trash = st.filter === 'trash';
    return '<div class="ag-bulkbar" id="agBulkBar">' +
      '<b>' + (n ? 'выбрано: ' + n : 'отметьте заказы галочками') + '</b>' +
      (n ? '<button type="button" class="btn btn-line" data-bulk="pin">Закрепить</button>' +
        '<button type="button" class="btn btn-line" data-bulk="unpin">Открепить</button>' +
        '<span class="ag-pal">' + ['red', 'gold', 'green', 'blue', 'violet'].map(function (c) {
          return '<button type="button" class="clr-dot" data-bulk-clr="' + c + '" title="' + CLR_NAME[c] + '" aria-label="Метка «' + CLR_NAME[c] + '»" style="--clr-dot-ink:' + CLR[c] + '"></button>';
        }).join('') +
        '<button type="button" class="clr-dot" data-bulk-clr="" title="без цвета" aria-label="Снять цветную метку"></button></span>' +
        (trash
          ? '<button type="button" class="btn btn-wax" data-bulk="restore">↩ Восстановить</button>' +
            '<button type="button" class="btn btn-line" data-bulk="purge" style="color:var(--wax,#A8402F)">Стереть навсегда</button>'
          : '<button type="button" class="btn btn-line" data-bulk="hide">Скрыть</button>' +
            '<button type="button" class="btn btn-wax" data-bulk="trash">В корзину</button>')
      : '') +
      '<button type="button" class="ag-linkbtn" data-bulk="off" style="margin-left:auto">× готово</button>' +
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
    /* закреплённые — всегда наверху во всех режимах (знак кнопки это обещает);
       стабильная сортировка сохраняет порядок внутри групп */
    arr.sort(function (a, b) { return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0); });
    return arr; /* 'fresh' — порядок сервера: новые сверху */
  }

  function drawList() {
    var box = document.getElementById('agList');
    if (!box) return;
    var footer = document.getElementById('agListFooter');
    var register = box.closest('.admin-order-register');
    if (!st.orders.length) {
      if (register) register.classList.add('admin-order-register--empty');
      box.innerHTML = '<div class="ag-empty admin-order-empty"><strong>' +
        (st.q || st.filter ? 'По выбранным условиям дел нет.' : 'Дел пока нет.') +
        '</strong><span>' +
        (st.q || st.filter
          ? 'Измените поиск или вернитесь к полному списку.'
          : 'Новое дело появится здесь после первой заявки или ручного создания.') +
        '</span>' +
        (st.q || st.filter
          ? '<button type="button" class="btn btn-line" id="agOrdersReset">Показать все дела</button>'
          : '') +
        '</div>';
      if (footer) footer.innerHTML = '<span>0 дел</span><small>Список актуален</small>';
      var emptyBulk = document.getElementById('agBulkWrap');
      if (emptyBulk) emptyBulk.innerHTML = bulkBar();
      return;
    }
    var arr = sortedOrders();
    var shown = arr.slice(0, st.listLimit);
    if (register) {
      register.classList.remove('admin-order-register--empty');
      register.classList.toggle('admin-order-register--low-data', arr.length < 3);
    }
    box.innerHTML = shown.map(function (o) {
      var client = o.client || {};
      var who = client.name || 'клиент';
      var whoMeta = client.guest
        ? 'Гостевая заявка'
        : (client.username ? '@' + client.username : 'Профиль клиента');
      /* Пилюли ушли из колонки «Статус». Они там ломали строку: длинный штамп
         переносился на две строки, под ним вставала вторая полка пилюль, и
         высота строк реестра гуляла вдвое. Прогресс — не статус: части и
         пауза теперь стоят при задаче, а требование решения — маркером слева. */
      var marks = '';
      if (o.paused) marks += '<span class="ag-pill">пауза</span>';
      if ((o.stages_total || 1) > 1 && 'work check fix done'.indexOf(o.status) >= 0)
        marks += '<span class="ag-pill">ч.' + o.stage + '/' + o.stages_total + '</span>';
      var needsAct = !!(o.claimed || o.status === 'new' || o.status === 'fix');
      /* подпись под штампом — глагол «что сделать вам», а не повтор статуса */
      var actWord = o.claimed ? 'сверить оплату'
        : o.status === 'new' ? 'назначить цену' : 'внести правки';
      /* Срок раньше стоял в двух колонках сразу: словами при задаче и датой
         в «Ближайшем сроке». Оставили одну — дату с относительной подписью. */
      var left = null;
      if (o.deadline_date && 'done cancel'.indexOf(o.status) < 0) {
        var days = Math.ceil((new Date(o.deadline_date + 'T23:59:59') - new Date()) / 86400000);
        if (!isNaN(days)) left = days;
      }
      var dueWord = left === null ? ''
        : left < 0 ? 'просрочен на ' + (-left) + ' дн'
        : left === 0 ? 'сегодня'
        : left === 1 ? 'завтра'
        : 'через ' + left + ' ' + anPl(left, 'день', 'дня', 'дней');
      /* цветной корешок мастера — поверх маркера выбранности */
      var rowStyle = '';
      if (o.color && CLR[o.color])
        rowStyle = '--admin-order-mark:' + CLR[o.color];
      /* галка — рисованная (не <input>): вложенный в <button> input невалиден,
         а выбор всё равно делает клик по всей строке (см. обработчик .ag-row) */
      var ck = st.bulk
        ? '<span class="ag-ck-box' + (st.bulk.has(o.id) ? ' on' : '') + '" aria-hidden="true"></span>'
        : '';
      var deadlineLabel = o.deadline_text || (o.deadline_date ? dmLabel(o.deadline_date) : '—');
      return '<button type="button" class="ag-row' + (o.id === st.sel ? ' sel' : '') +
        (o.pinned ? ' pin' : '') + (needsAct ? ' needs-act' : '') +
        (left !== null && left < 0 ? ' is-overdue' : '') + '" data-id="' + o.id + '"' +
        (st.bulk ? ' aria-pressed="' + (st.bulk.has(o.id) ? 'true' : 'false') + '"' : '') +
        ' aria-label="' + (st.bulk ? 'Выбрать' : 'Открыть') + ' дело №' + o.id + '"' +
        (rowStyle ? ' style="' + rowStyle + '"' : '') + '>' +
        '<span class="admin-order-select">' + ck + '</span>' +
        '<span class="admin-order-id">' +
          (o.pinned ? '<span class="r-pin" title="закреплено">' + ico('pin', 12) + '</span>' : '') +
          '<span class="r-no">№' + o.id + '</span>' +
          '<small class="r-born" title="создано ' + esc(dt(o.created_at)) + '">' + esc(dt(o.created_at).split(',')[0]) + '</small></span>' +
        '<span class="admin-order-client"><strong>' + esc(who) + '</strong><small>' +
          esc(whoMeta) + '</small></span>' +
        '<span class="r-main"><span class="r-t"><span class="r-name">' +
          esc(o.work_label || 'Заявка') + '</span>' +
          (marks ? '<span class="r-marks">' + marks + '</span>' : '') + '</span>' +
          '<span class="r-s">' + esc(o.topic || (o.cancel_reason
            ? 'закрыто: ' + String(o.cancel_reason).slice(0, 40) : 'тема не указана')) + '</span></span>' +
        '<span class="admin-order-state">' + stampShort(o.status) +
          (needsAct ? '<small class="r-act">' + esc(actWord) + '</small>' : '') + '</span>' +
        '<span class="admin-order-deadline"><b>' + esc(deadlineLabel) + '</b>' +
          (dueWord ? '<small>' + esc(dueWord) + '</small>' : '') + '</span>' +
        '<span class="r-price">' + (o.price ? money(o.price) + ' ₽' : (o.quote_low ? 'от ' + money(o.quote_low) + ' ₽' : '—')) + '</span>' +
        '<span class="admin-order-go" aria-hidden="true">→</span>' +
        '</button>';
    }).join('');
    if (footer) {
      footer.innerHTML =
        '<span>' + shown.length + ' ' + anPl(shown.length, 'дело', 'дела', 'дел') +
          (shown.length < arr.length ? ' из ' + arr.length : '') + '</span>' +
        (arr.length > st.listLimit
          ? '<button type="button" class="ag-linkbtn" id="agMore">Показать ещё ' +
              Math.min(40, arr.length - st.listLimit) + '</button>'
          : '<small>' + (arr.length < 3
            ? 'Показаны все доступные дела по текущему фильтру.'
            : 'Все доступные дела показаны.') + '</small>');
    }
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

  /* Следующий шаг по делу. Возвращает [tone, заголовок, пояснение, кнопка]:
     заголовок — одной строкой, что происходит; пояснение — что делать;
     кнопка (если есть) выносится отдельным элементом, а не врезается
     в середину абзаца, как было раньше. */
  function nextHint(o) {
    var cr = pendingCancelReq(o);
    if (cr)
      return ['due', 'Клиент просит закрыть дело',
        (cr.data ? 'Причина: «' + esc(cr.data) + '». ' : '') +
        'Свяжитесь с ним, решите вопрос по выполненной части и оплате; закрыть можно кнопкой «Закрыть с причиной…» в управлении статусом.'];
    if (o.paused)
      return ['calm', 'Дело на паузе' + (o.paused_by === 'admin' ? ' — поставили вы' : ' — поставил клиент'),
        'Напоминания молчат. Снять паузу можно в «Управлении статусом».'];
    var claimed = (o.payments || []).filter(function (p) { return p.status === 'claimed'; });
    if (claimed.length) {
      var cSum = claimed.reduce(function (s, p) { return s + (p.amount || 0); }, 0);
      var cWhat = claimed.length > 1
        ? 'Клиент отметил оплату ' + claimed.length + ' этапов на ' + money(cSum) + ' ₽'
        : 'Клиент отметил оплату ' + money(cSum) + ' ₽';
      return ['due', cWhat,
        'Проверьте поступление и подтвердите в плане оплат — статус и кэшбэк посчитаются сами.'];
    }
    if (o.final_ready && 'work fix'.indexOf(o.status) >= 0) {
      if (o.due_now && o.due_now.amount > 0) {
        var fAge = invoiceAgeDays(o);
        return [fAge >= 2 ? 'due' : 'calm',
          'Финальный пакет готов — ждём остаток ' + money(o.due_now.amount) + ' ₽' +
            (fAge >= 1 ? ', счёт выставлен ' + fAge + ' дн. назад' : ''),
          'Файл придержан до оплаты. Авто-напоминания идут раз в день, до 3 раз; поторопить можно кнопкой «Напомнить об оплате».'];
      }
      return ['due', 'Остаток получен — передайте финальную часть',
        'Загрузите результат в блоке передачи, клиент получит кнопки приёмки.'];
    }
    if (o.part_ready && 'work fix'.indexOf(o.status) >= 0) {
      if (o.due_now && o.due_now.amount > 0) {
        var pAge = invoiceAgeDays(o);
        return [pAge >= 2 ? 'due' : 'calm',
          'Часть ' + o.part_ready + ' готова — ждём ' + money(o.due_now.amount) + ' ₽ (' +
            esc((o.due_now.label || 'этап').toLowerCase()) + ')' +
            (pAge >= 1 ? ', счёт выставлен ' + pAge + ' дн. назад' : ''),
          'Файл придержан до оплаты. Авто-напоминания идут раз в день, до 3 раз.'];
      }
      return ['due', 'Оплата за часть ' + o.part_ready + ' получена — передайте результат',
        'Загрузите файл в блоке передачи, клиент получит кнопки приёмки.'];
    }
    if (o.due_now && o.due_now.amount > 0 && 'check work'.indexOf(o.status) >= 0)
      return ['due', 'Созрел неоплаченный этап: ' + money(o.due_now.amount) + ' ₽ (' +
        esc((o.due_now.label || 'этап').toLowerCase()) + ')',
        'Новые части не передавайте до оплаты — напомнить клиенту можно кнопкой «Напомнить об оплате».'];
    if (o.status === 'new')
      return ['due', 'Новая заявка — цена ещё не назначена',
        'Изучите требования и отправьте предложение с ценой: клиент получит его в Telegram и в кабинете.'];
    if (o.status === 'fix')
      return ['due', 'Клиент запросил корректировку' + ((o.stages_total || 1) > 1 ? ' по части ' + o.stage : ''),
        'Замечания — в переписке. Передайте обновлённую версию как результат, клиент снова получит кнопки приёмки.' +
        (o.due_now && o.due_now.amount > 0
          ? ' Этап при этом не оплачен на ' + money(o.due_now.amount) + ' ₽ — исправления передавать можно, но напомните об оплате.'
          : ''),
        '<button type="button" class="btn btn-wax" id="agFixAck">Взял в работу — сообщить клиенту</button>'];
    if (o.status === 'priced')
      return ['calm', 'Предложение у клиента — ждём решения',
        'Можно поменять цену или написать в переписке.'];
    if (o.status === 'prepay')
      return ['calm', 'Ждём первый платёж',
        'Если клиент оплатил и отметил это у себя — здесь появится кнопка подтверждения.'];
    if (o.status === 'work')
      return ['calm', 'Исполнение' + ((o.stages_total || 1) > 1 ? ': часть ' + o.stage + ' из ' + o.stages_total : ''),
        'Подготовленный результат передайте файлом в блоке передачи и приёмки.'];
    if (o.status === 'check')
      return ['calm', ((o.stages_total || 1) > 1 ? 'Результат части ' + o.stage + ' из ' + o.stages_total : 'Результат') + ' на проверке у клиента',
        'Он примет его или запросит корректировку по критериям спецификации.'];
    if (o.status === 'cancel')
      return ['calm', 'Дело закрыто' + (o.cancel_reason ? ': «' + esc(o.cancel_reason) + '»' : ''),
        'Можно возобновить — клиент получит предложение заново.'];
    return null;
  }

  function clientLine(o) {
    var links = (o.client.links || []).map(function (l) {
      return '<a href="' + esc(l[1]) + '" target="_blank" rel="noopener">' + esc(l[0]) + '</a>';
    }).join('');
    var who = o.client.guest
      ? 'Гость: <b>' + esc(o.client.name) + '</b>' + (o.client.contact ? ' · <span class="mono">' + esc(o.client.contact) + '</span>' : '') +
        '<br><span class="petit">Без Telegram: всё написанное здесь он видит в кабинете сайта' + (o.client.contact ? '; для живой связи — кнопки ниже' : '') + '.</span>'
      : '<b>' + esc(o.client.name) + '</b>' + (o.client.username ? ' · @' + esc(o.client.username) : '') +
        ' · <button type="button" class="ag-linkbtn" data-open-client="' + o.client.id + '">карточка клиента</button>' +
        ' · <button type="button" class="ag-linkbtn" data-imp-client="' + o.client.id + '">его кабинет</button>';
    return '<p class="ag-meta" style="margin-top:8px">' + who + '</p>' +
      (links ? '<div class="ag-clinks">' + links + '</div>' : '');
  }

  /* Собранная заявка: ссылка, по которой клиент смотрит условия и платит.
     Дело до оплаты не принадлежит никому — владельца назначает платёж. */
  function offerBlock(o) {
    var off = o.offer;
    var owned = !!o.tg_linked;
    var head = '<div class="ag-sec"><span class="caps">Заявка под ссылку' +
      (off ? '<span class="sub">ред. ' + off.version + ' · открыта ' + (off.opens || 0) +
             ' раз' + (off.opened_at ? ' · последний раз ' + dt(off.opened_at) : '') +
             ' · ' + (OFF_ST[off.status] || off.status) + '</span>' : '') + '</span>';
    if (owned) {
      return head + '<p class="ag-note"><b>Telegram привязан' +
        (o.client && o.client.username ? ': @' + esc(o.client.username) : '') +
        '.</b> Сообщения, статусы и файлы можно отправлять прямо в бот; кабинет сайта остаётся синхронной резервной копией.</p>' +
        '<div class="ag-actrow">' +
        '<button type="button" class="btn btn-wax" id="agTgSync">Отправить актуальную карточку в Telegram</button>' +
        (o.claim_url ? '<button type="button" class="btn btn-line" id="agRouteCopy">Скопировать безопасную инструкцию</button>' : '') +
        (o.claim_url ? '<a class="btn btn-line" href="' + esc(o.claim_url) + '" target="_blank" rel="noopener">Открыть его кабинет</a>' : '') +
        '</div><p class="ag-note">Для привязки Telegram клиент входит из кабинета через одноразовый код; ключ дела в мессенджер не передаётся.</p></div>';
    }
    var linkRow = '';
    if (off && off.status !== 'canceled') {
      linkRow =
        '<div class="ag-actrow" style="margin-bottom:8px">' +
        '<input type="text" class="ag-inp" id="agOffUrl" readonly style="flex:1;min-width:220px" value="' + esc(off.url) + '">' +
        '<button type="button" class="btn btn-line" id="agOffCopy">Скопировать ссылку</button>' +
        '<button type="button" class="btn btn-line" id="agOffMsg">Скопировать текст для мессенджера</button>' +
        '<a class="btn btn-line" href="' + esc(off.url + (off.url.indexOf('?') < 0 ? '?' : '&') + 'preview=1') + '" target="_blank" rel="noopener">Открыть как клиент</a>' +
        (off.status === 'live' ? '<button type="button" class="btn btn-line" id="agOffCancel">Отозвать</button>' : '') +
        '</div>' +
        (off.status === 'paid'
          ? '<p class="ag-note">Оплачена' + (off.paid_at ? ' ' + dt(off.paid_at) : '') +
            ' — условия зафиксированы в акцепте, пересборка недоступна. Эта же ссылка теперь показывает клиенту «дело закреплено».</p>'
          : '<p class="ag-note">Действительна до ' + dt(off.expires_at) +
            '. Пересборка создаёт РЕДАКЦИЮ ' + (off.version + 1) + ' с новым кодом: старая ссылка ' +
            'честно скажет «условия обновились» и уведёт на свежую. Молча переписывать открытую ' +
            'ссылку нельзя — человек мог видеть одну цену, а нажать на другую.</p>');
      /* почта, оставленная клиентом при оплате: письма включает ТОЛЬКО мастер,
         сверив адрес с перепиской (в письмах — ключ доступа к делу) */
      if (off.notify_to && !off.mail_enabled) {
        linkRow += '<div class="ag-actrow" style="margin-bottom:8px">' +
          '<span class="ag-note" style="margin:0">Клиент оставил почту: <b class="mono">' + esc(off.notify_to) + '</b></span>' +
          '<button type="button" class="btn btn-line" id="agOffMailOn">Включить письма на этот адрес</button>' +
          '</div>';
      } else if (off.mail_enabled) {
        linkRow += '<p class="ag-note">Письма клиенту включены — счета, готовность частей и сообщения уходят на почту.</p>';
      }
    }
    var claimRow = '';
    if (o.claim_url) {
      claimRow = '<div class="ag-actrow" style="margin-bottom:8px">' +
        '<input type="text" class="ag-inp" id="agClaimUrl" readonly style="flex:1;min-width:220px" value="' + esc(o.claim_url) + '">' +
        '<button type="button" class="btn btn-line" id="agClaimCopy">Ссылка клиента на дело</button>' +
        '<button type="button" class="btn btn-line" id="agRouteCopy">Инструкция для безопасной привязки</button>' +
        '</div>' +
        '<p class="ag-note">Это единственный ключ клиента от дела («потеряли ссылку — восстановим за минуту» — это сюда). Отдавайте только в ту переписку, где договаривались.</p>';
    }
    var btn = '<div class="ag-actrow"><button type="button" class="btn ' +
      (st.offnew ? 'btn-line' : 'btn-wax') + '" id="agOffNew">' +
      (st.offnew ? 'Свернуть форму' : (off ? 'Пересобрать заявку' : 'Собрать заявку под ссылку')) +
      '</button></div>';
    if (off && off.status === 'paid') btn = '';   /* акцепт состоялся — пересборки нет */
    if (!st.offnew) return head + linkRow + claimRow + btn + '</div>';

    var p = off || {};
    var sd = specificationSeed(p);
    var form =
      '<div class="ag-card ag-off-form" style="max-height:none;margin-top:12px">' +
      '<div style="display:grid;gap:8px">' +
      '<input type="text" id="agOffName" maxlength="60" class="ag-inp" placeholder="Имя для обращения — только имя" value="' + esc(p.greet_name || '') + '">' +
      '<p class="ag-hint">Фамилию, вуз и научрука не пишем: ссылку могут переслать, а на предоплатной странице лишних данных быть не должно (Политика п. 4.4).</p>' +
      '<textarea id="agOffIntro" rows="3" maxlength="400" class="ag-inp" placeholder="Письмо клиенту, 2–3 предложения: «Анна, собрал по нашему вчерашнему разговору…»">' + esc(p.intro || '') + '</textarea>' +
      '<input type="text" id="agOffVolume" maxlength="120" class="ag-inp" placeholder="Объём исходника или единица услуги — 35 страниц / 2 таблицы" value="' + esc(p.volume || '') + '">' +
      '<input type="text" id="agOffTier" maxlength="120" class="ag-inp" placeholder="Формат — Диагностика / Редактура / Сопровождение" value="' + esc(p.tier_label || '') + '">' +
      '<input type="text" id="agOffReq" maxlength="200" class="ag-inp" placeholder="Критерии одной строкой — методичка, перечень проверок, формат результата" value="' + esc(p.reqs_short || '') + '">' +
      '<textarea id="agOffReqFull" rows="3" maxlength="2000" class="ag-inp" placeholder="Полный текст требований (складка на странице)">' + esc(p.reqs_full || '') + '</textarea>' +
      '<textarea id="agOffTierFull" rows="3" maxlength="2000" class="ag-inp" placeholder="Что входит в выбранный формат целиком (складка)">' + esc(p.tier_full || '') + '</textarea>' +
      '<fieldset class="ag-card" style="display:grid;gap:8px;margin:4px 0;padding:14px"><legend class="caps">Поля каждой строки спецификации</legend>' +
        '<p class="ag-hint">Один заказ — один документ. Эти значения попадут в каждую строку сметы; результат и цена сохраняются отдельно для каждой позиции.</p>' +
        '<select id="agOffContour" class="ag-inp" aria-label="Тип договора">' +
          '<option value="A"' + (sd.contract_contour === 'A' ? ' selected' : '') + '>A · академическая мастерская</option>' +
          '<option value="B1"' + (sd.contract_contour === 'B1' ? ' selected' : '') + '>B1 · авторский материал вне аттестации, лицензия</option>' +
          '<option value="B2"' + (sd.contract_contour === 'B2' ? ' selected' : '') + '>B2 · авторский материал вне аттестации, отчуждение права</option>' +
        '</select>' +
        '<select id="agOffAcademicSubmode" class="ag-inp" aria-label="Подрежим академической мастерской">' +
          '<option value="A1"' + (sd.academic_submode === 'A1' ? ' selected' : '') + '>A1 · редакторская и консультационная помощь по материалу клиента</option>' +
          '<option value="A2"' + (sd.academic_submode === 'A2' ? ' selected' : '') + '>A2 · совместная исследовательская разработка с нуля</option>' +
        '</select>' +
        '<p class="ag-hint">Подрежим A1/A2 обязателен для контура A. Для B1/B2 действуют поля фактического автора и прав.</p>' +
        '<textarea id="agOffPurpose" rows="2" maxlength="1000" class="ag-inp" placeholder="Разрешённая цель использования">' + esc(sd.permitted_purpose) + '</textarea>' +
        '<textarea id="agOffDeliverable" rows="2" maxlength="1000" class="ag-inp" placeholder="Результат / передаваемый артефакт">' + esc(sd.deliverable) + '</textarea>' +
        '<div class="ag-actrow"><input id="agOffInput" maxlength="500" class="ag-inp" placeholder="Исходник клиента" value="' + esc(sd.input_description) + '">' +
          '<input id="agOffInputVersion" maxlength="120" class="ag-inp" placeholder="Версия исходника" value="' + esc(sd.input_version) + '"></div>' +
        '<textarea id="agOffInclusions" rows="2" maxlength="1000" class="ag-inp" placeholder="Включено — по одной операции с новой строки">' + esc(sd.inclusions_text) + '</textarea>' +
        '<textarea id="agOffExclusions" rows="2" maxlength="1000" class="ag-inp" placeholder="Не включено — по одной границе с новой строки">' + esc(sd.exclusions_text) + '</textarea>' +
        '<textarea id="agOffAcceptance" rows="2" maxlength="1200" class="ag-inp" placeholder="Критерии приёмки — проверяемые признаки результата">' + esc(sd.acceptance_text) + '</textarea>' +
        '<textarea id="agOffDependencies" rows="2" maxlength="1000" class="ag-inp" placeholder="Зависимости срока — исходники, согласования, внешние данные">' + esc(sd.dependencies_text) + '</textarea>' +
        '<textarea id="agOffAuthorParticipation" rows="3" maxlength="1500" class="ag-inp" placeholder="Для A2: контрольные точки участия Заказчика — по одной с новой строки">' + esc(sd.author_participation_text) + '</textarea>' +
        '<label class="ag-hint" style="display:flex;align-items:flex-start;gap:8px"><input id="agOffAuthorConfirmed" type="checkbox"' + (sd.author_participation_confirmed ? ' checked' : '') + '>Заказчик явно подтвердил обязательное содержательное участие в режиме A2</label>' +
        '<textarea id="agOffAuthorDecisions" rows="3" maxlength="1500" class="ag-inp" placeholder="Для A2: уже согласованные решения и реальные данные Заказчика — по одному пункту с новой строки">' + esc(sd.author_decisions_text) + '</textarea>' +
        '<div class="ag-actrow"><input id="agOffDiscount" type="number" min="0" step="100" class="ag-inp" placeholder="Скидка на строку, ₽" value="' + (sd.discount_amount || '') + '">' +
          '<input id="agOffPaymentAllocation" maxlength="500" class="ag-inp" placeholder="Распределение платежа по строке" value="' + esc(sd.payment_allocation_text) + '"></div>' +
        '<div class="ag-actrow"><input id="agOffCorrectionDays" type="number" min="0" max="365" class="ag-inp" placeholder="Окно первичной проверки, дней" value="' + sd.correction_days + '">' +
          '<input id="agOffIterations" type="number" min="0" max="20" class="ag-inp" placeholder="Добровольных итераций" value="' + sd.iterations + '"></div>' +
        '<div class="ag-actrow"><input id="agOffActualAuthor" maxlength="300" class="ag-inp" placeholder="Фактический автор исходника / результата" value="' + esc(sd.actual_author) + '">' +
          '<input id="agOffRightsMode" maxlength="500" class="ag-inp" placeholder="Режим прав" value="' + esc(sd.rights_mode) + '"></div>' +
        '<input id="agOffRightsEvidence" maxlength="500" class="ag-inp" placeholder="Основание прав: номер/дата документа или эта редакция Спецификации" value="' + esc(sd.rights_evidence) + '">' +
        '<textarea id="agOffPerformers" rows="3" maxlength="2000" class="ag-inp" placeholder="Для B2, одна строка на человека: ФИО | author/coauthor/technical | creative/technical | ссылка на письменное согласие">' + esc(sd.performers_text) + '</textarea>' +
        '<label class="ag-hint" style="display:flex;align-items:flex-start;gap:8px"><input id="agOffRightsConfirmed" type="checkbox"' + (sd.rights_confirmed ? ' checked' : '') + '>Я проверил(а) личность автора, письменное основание прав и согласия всех творческих исполнителей. Время и роль подтверждения зафиксирует сервер.</label>' +
        '<p class="ag-hint">B1: автором должен быть Семёнов Семён Юрьевич; цепочка лицензии строится из этой Спецификации. B2: укажите ФИО каждого автора и отдельную ссылку на его письменное согласие/передачу прав.</p>' +
      '</fieldset>' +
      '<div class="ag-chips"><span class="caps">Что входит — добавить одним кликом</span>' +
        OFF_INCLS.map(function (t) { return offChip('incl', t); }).join('') + '</div>' +
      '<textarea id="agOffIncl" rows="5" class="ag-inp" placeholder="Что входит — и чего нет. Строка: «Отчёт о проверках | да». У невключённого можно дописать цену — «Презентация к защите | нет | 6000» — лист покажет её тихим предложением «можно довложить»">' + esc(jl2t(p.incl, 'in')) + '</textarea>' +
      '<section class="ag-est" id="agEst" aria-labelledby="agEstTitle">' +
        '<header class="ag-est-head">' +
          '<div><div class="ag-est-title"><b id="agEstTitle">Смета</b><span class="ag-est-count" id="agEstCount">0 позиций</span></div>' +
          '<span class="ag-est-kicker">Найдите услугу и добавьте её одним нажатием</span></div>' +
          '<div class="ag-est-search"><input type="search" id="agOffSearch" autocomplete="off" placeholder="ВКР, нормоконтроль, речь…" aria-label="Поиск работы или услуги">' +
          '<button type="button" id="agOffSearchClear" aria-label="Очистить поиск" hidden>×</button></div>' +
        '</header>' +
        '<div class="ag-est-tools">' +
          '<div class="ag-est-cats" role="tablist" aria-label="Категории услуг">' +
            OFF_CATS.map(function (c, i) { return '<button type="button" class="ag-est-cat' + (i ? '' : ' on') +
              '" data-off-cat="' + c[0] + '" role="tab" aria-selected="' + (i ? 'false' : 'true') + '">' + c[1] + '</button>'; }).join('') +
          '</div>' +
          '<label class="ag-est-mode" title="Для услуг, которые клиент может выбрать дополнительно">' +
            '<input type="checkbox" id="agOffAsAdd"><span>Как доп. опцию</span></label>' +
        '</div>' +
        '<div class="ag-est-catalog" id="agOffCatalog">' +
          OFF_CATALOG.map(offCatalogItem).join('') +
          '<div class="ag-est-empty" id="agOffEmpty" hidden>Ничего не найдено — попробуйте короче или добавьте свою строку ниже.</div>' +
        '</div>' +
        '<div class="ag-est-picked">' +
          '<div class="ag-est-pickedhead"><span class="caps">Выбрано для клиента</span>' +
          '<button type="button" class="ag-est-add" id="agOffCustom">+ Своя позиция</button></div>' +
          '<div class="ag-est-rows" id="agOffRows"></div>' +
          '<details class="ag-est-raw" id="agOffLedgerRaw"><summary>Ручная правка строк</summary>' +
          '<textarea id="agOffLedger" rows="4" class="ag-inp" placeholder="Название позиции | 38000">' + esc(jl2t(p.ledger, 'a')) + '</textarea></details>' +
        '</div>' +
        '<div class="ag-offsum" id="agOffSum"></div>' +
      '</section>' +
      '<textarea id="agOffRail" rows="5" class="ag-inp" placeholder="Календарь. Строка: «2026-07-25 | План согласован | развёрнутый план глав | prepay». Платёж: prepay / stage2 / rest / пусто">' + esc(railToText(p.rail)) + '</textarea>' +
      '<label class="ag-hint"><input type="checkbox" id="agOffFiles"' + (p.need_files ? ' checked' : '') + '> Ждём материалы от клиента (срок пойдёт и с их получения)</label>' +
      '<div class="ag-actrow">' +
      '<select id="agOffTtl"><option value="7">7 дней</option><option value="14" selected>14 дней</option><option value="30">30 дней</option></select>' +
      '<button type="button" class="btn btn-wax" id="agOffBuild">' + (off ? 'Пересобрать — редакция ' + (off.version + 1) : 'Собрать заявку') + '</button>' +
      '</div>' +
      '<p class="ag-hint">Цена, первый платёж и план берутся из блока «Цена и план оплаты» выше. ' +
      'Никаких уведомлений сейчас никому не уйдёт: у дела нет владельца, а письма о цене ' +
      'мы намеренно не шлём — акцептом будет оплата.</p>' +
      '</div></div>';
    return head + linkRow + claimRow + btn + form + '</div>';
  }

  var OFF_ST = { live: 'ждёт оплату', paid: 'оплачена', replaced: 'заменена',
                 canceled: 'отозвана' };

  /* «Название | значение» ↔ JSON: мастеру проще править текстом */
  function jl2t(raw, key) {
    var arr = [];
    try { arr = typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || []); }
    catch (e) { arr = []; }
    return arr.map(function (r) {
      if (key === 'in')
        return r.t + ' | ' + (r['in'] ? 'да' : 'нет') + (r.p ? ' | ' + r.p : '');
      return r.t + ' | ' + r.a;
    }).join('\n');
  }
  function t2ledger(txt) {
    return String(txt || '').split('\n').map(function (l) {
      var p = l.split('|');
      if (p.length < 2 || !p[0].trim()) return null;
      return { t: p[0].trim(), a: parseInt(String(p[1]).replace(/\D/g, ''), 10) || 0 };
    }).filter(Boolean);
  }
  function t2incl(txt) {
    return String(txt || '').split('\n').map(function (l) {
      var p = l.split('|');
      if (!p[0] || !p[0].trim()) return null;
      var v = (p[1] || '').trim().toLowerCase();
      var row = { t: p[0].trim(), 'in': (v === 'да' || v === 'yes' || v === '1') ? 1 : 0 };
      /* третья колонка — цена допа: невключённая строка с ценой становится
         на листе тихим предложением «можно довложить» */
      var price = parseInt(String(p[2] || '').replace(/\D/g, ''), 10);
      if (!row['in'] && price > 0) row.p = price;
      return row;
    }).filter(Boolean);
  }
  function railToText(raw) {
    var arr = [];
    try { arr = typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || []); }
    catch (e) { arr = []; }
    return arr.map(function (r) {
      return [r.d || '', r.t || '', r.g || '', r.pay || ''].join(' | ');
    }).join('\n');
  }
  function t2rail(txt) {
    return String(txt || '').split('\n').map(function (l) {
      var p = l.split('|');
      if (p.length < 2 || !p[1].trim()) return null;
      return { d: p[0].trim(), t: p[1].trim(), g: (p[2] || '').trim(),
               pay: (p[3] || '').trim() || null };
    }).filter(Boolean);
  }

  /* Расширенная строка спецификации. Старые t/a, label/final_price остаются
     нейтральными aliases: старый PDF и API продолжают читать ту же смету,
     а новые клиенты получают договорный профиль каждой позиции. */
  function specList(v) {
    if (Array.isArray(v)) return v.filter(Boolean).map(String);
    return String(v || '').split(/\n|;/).map(function (x) { return x.trim(); }).filter(Boolean);
  }
  var SPEC_EXECUTOR_NAME = 'Семёнов Семён Юрьевич';
  var RIGHTS_SCHEMA_VERSION = 1;
  var RIGHTS_MODE_B1 = 'simple_license';
  var RIGHTS_MODE_B2 = 'exclusive_right_alienation';
  function rightsProfilesText(value) {
    if (!Array.isArray(value)) return '';
    return value.map(function (profile) {
      if (!profile || !profile.name) return '';
      return [
        profile.name,
        profile.role_code || 'technical',
        profile.creative === true ? 'creative' : 'technical',
        profile.consent_ref || ''
      ].join(' | ');
    }).filter(Boolean).join('\n');
  }
  function rightsProfilesFromText(value, confirmed) {
    return String(value || '').split('\n').map(function (line) {
      var parts = line.split('|').map(function (part) { return part.trim(); });
      var name = parts[0] || '';
      var role = String(parts[1] || '').toLowerCase();
      var contribution = String(parts[2] || '').toLowerCase();
      var consentRef = parts.slice(3).join(' | ').trim();
      if (!name || ['author', 'coauthor', 'technical'].indexOf(role) < 0) return null;
      var creative = contribution === 'creative';
      return {
        name: name,
        role_code: role,
        creative: creative,
        consent_confirmed: creative && confirmed === true && !!consentRef,
        consent_ref: consentRef
      };
    }).filter(Boolean);
  }
  function structuredRights(contour, actualAuthor, evidenceRef, profiles, confirmed) {
    if (contour !== 'B1' && contour !== 'B2') {
      return {
        schema_version: 0, mode_code: '', basis: {}, author_profile: {},
        performer_profiles: [], chain: [], confirmation: { confirmed: false }
      };
    }
    var b1 = contour === 'B1';
    var modeCode = b1 ? RIGHTS_MODE_B1 : RIGHTS_MODE_B2;
    var author = String(actualAuthor || '').trim();
    var evidence = String(evidenceRef || '').trim();
    var performerProfiles = Array.isArray(profiles) ? profiles : [];
    var chain = [];
    if (b1 && author && evidence) {
      chain.push({
        from_role: 'author',
        from_name: author,
        to_role: 'customer',
        mode_code: modeCode,
        basis_ref: evidence,
        status_code: 'documented'
      });
    }
    if (!b1) {
      performerProfiles.forEach(function (profile) {
        if (profile.creative === true && profile.name && profile.consent_ref) {
          chain.push({
            from_role: 'author',
            from_name: profile.name,
            to_role: 'contractor',
            mode_code: modeCode,
            basis_ref: profile.consent_ref,
            status_code: 'documented'
          });
        }
      });
      if (evidence) {
        chain.push({
          from_role: 'contractor',
          from_name: SPEC_EXECUTOR_NAME,
          to_role: 'customer',
          mode_code: modeCode,
          basis_ref: evidence,
          status_code: 'documented'
        });
      }
    }
    return {
      schema_version: RIGHTS_SCHEMA_VERSION,
      mode_code: modeCode,
      basis: {
        code: b1 ? 'contractor_is_author' : 'third_party_written_assignment',
        evidence_ref: evidence,
        effective_on_code: b1
          ? 'full_payment_and_delivery'
          : 'incoming_right_effective_and_full_payment_and_delivery'
      },
      author_profile: {
        name: author,
        party_role: b1 ? 'contractor' : 'third_party',
        confirmed: confirmed === true
      },
      performer_profiles: performerProfiles,
      chain: chain,
      // Only the boolean crosses the trust boundary. The backend discards
      // browser actor/time and stamps the authenticated role and server time.
      confirmation: { confirmed: confirmed === true }
    };
  }
  function rightsLineReady(line) {
    var contour = line && line.contract_contour;
    if (contour !== 'B1' && contour !== 'B2') return true;
    var b1 = contour === 'B1';
    var expectedMode = b1 ? RIGHTS_MODE_B1 : RIGHTS_MODE_B2;
    var author = line.actual_author_profile || {};
    var basis = line.rights_basis || {};
    var confirmation = line.rights_confirmation || {};
    var profiles = Array.isArray(line.performer_profiles)
      ? line.performer_profiles : [];
    if (line.rights_schema_version !== RIGHTS_SCHEMA_VERSION ||
        line.rights_mode_code !== expectedMode ||
        !String(basis.evidence_ref || '').trim() ||
        confirmation.confirmed !== true ||
        author.confirmed !== true ||
        !String(author.name || '').trim()) return false;
    if (b1) {
      return author.party_role === 'contractor' &&
        String(author.name).trim() === SPEC_EXECUTOR_NAME;
    }
    if (author.party_role !== 'third_party' ||
        String(author.name).trim() === SPEC_EXECUTOR_NAME) return false;
    var creative = profiles.filter(function (profile) {
      return profile && profile.creative === true;
    });
    if (!creative.length || !creative.some(function (profile) {
      return ['author', 'coauthor'].indexOf(profile.role_code) >= 0 &&
        String(profile.name || '').trim().toLowerCase() ===
          String(author.name || '').trim().toLowerCase();
    })) return false;
    return creative.every(function (profile) {
      return profile.consent_confirmed === true &&
        !!String(profile.consent_ref || '').trim();
    });
  }
  function specInputValue(id, fallback) {
    var el = document.getElementById(id);
    return el ? String(el.value || '').trim() : String(fallback || '').trim();
  }
  function specificationSeed(raw) {
    raw = raw || {};
    var lines = raw.specification_lines ||
      (raw.specification && raw.specification.lines) || [];
    var x = lines[0] || {};
    var inp = x.input || {};
    var contour = x.contract_contour || raw.contract_contour || 'A';
    var academicSubmode = contour === 'A'
      ? (x.academic_submode || raw.academic_submode || 'A1')
      : '';
    if (academicSubmode !== 'A2') academicSubmode = contour === 'A' ? 'A1' : '';
    var authorParticipation = x.author_participation || raw.author_participation || {};
    var rightsBasis = x.rights_basis && typeof x.rights_basis === 'object'
      ? x.rights_basis : {};
    var rightsConfirmation = x.rights_confirmation &&
      typeof x.rights_confirmation === 'object' ? x.rights_confirmation : {};
    var performerProfiles = Array.isArray(x.performer_profiles)
      ? x.performer_profiles : [];
    var isA = contour === 'A';
    return {
      contract_contour: contour,
      academic_submode: academicSubmode,
      permitted_purpose: x.permitted_purpose || raw.permitted_purpose ||
        (isA ? 'Консультация, проверка и редактура самостоятельного материала клиента; не для подмены автора аттестационной работы.'
             : 'Использование авторского материала вне учебной или научной аттестации в согласованных каналах.'),
      deliverable: x.deliverable || x.result || '',
      input_description: inp.description || x.input_description ||
        (isA ? 'Черновик, данные и требования клиента' : 'Техническое задание и материалы заказчика'),
      input_version: inp.version || x.input_version || 'версия на дату передачи',
      inclusions_text: (x.inclusions || []).join('\n'),
      exclusions_text: (x.exclusions || (isA
        ? ['создание аттестационной работы вместо клиента', 'гарантия процента, оценки, сдачи или защиты']
        : ['использование в учебной или научной аттестации'])).join('\n'),
      acceptance_text: (x.acceptance_criteria ||
        ['передан согласованный артефакт', 'результат соответствует операциям и границам строки']).join('\n'),
      dependencies_text: (x.dependencies ||
        ['срок начинается после получения полного комплекта исходников']).join('\n'),
      author_participation_text: (authorParticipation.checkpoints || (academicSubmode === 'A2'
        ? [
          'утверждение проблемы, цели, метода и содержательных решений',
          'проверка фактов, источников и исходных данных',
          'содержательная доработка рабочего черновика и формирование финальной авторской версии'
        ]
        : [])).join('\n'),
      author_participation_confirmed: authorParticipation.confirmed === true,
      author_decisions_text: (authorParticipation.customer_decisions_and_data || []).join('\n'),
      discount_amount: (x.discount && x.discount.amount) || x.discount_amount || 0,
      payment_allocation_text: Array.isArray(x.payment_allocation)
        ? x.payment_allocation.join('\n') : (x.payment_allocation || 'по плану оплаты заказа'),
      correction_days: (x.correction_window && x.correction_window.days != null)
        ? x.correction_window.days : (x.correction_window_days != null ? x.correction_window_days : 7),
      iterations: x.iterations != null ? x.iterations : 1,
      actual_author: x.actual_author ||
        (x.actual_author_profile && x.actual_author_profile.name) || (isA
        ? (academicSubmode === 'A2'
          ? 'Заказчик — автор финальной версии; мастерская готовит промежуточный рабочий черновик'
          : 'Клиент — автор исходного материала')
        : (contour === 'B1' ? SPEC_EXECUTOR_NAME : '')),
      rights_mode: x.rights_mode || (contour === 'B2'
        ? 'Отчуждение исключительного права после полной оплаты'
        : contour === 'B1' ? 'Лицензия в пределах согласованных способов использования'
        : 'Права на исходник клиента сохраняются у клиента; исполнитель отвечает за свои редакторские материалы'),
      rights_evidence: rightsBasis.evidence_ref ||
        (contour === 'B1' ? 'эта редакция Спецификации' : ''),
      rights_confirmed: rightsConfirmation.confirmed === true,
      performers_text: rightsProfilesText(performerProfiles)
    };
  }
  function specificationDefaultsFromForm(raw) {
    var seed = specificationSeed(raw);
    var contour = specInputValue('agOffContour', seed.contract_contour) || 'A';
    var academicSubmode = contour === 'A'
      ? specInputValue('agOffAcademicSubmode', seed.academic_submode || 'A1')
      : '';
    if (academicSubmode !== 'A2') academicSubmode = contour === 'A' ? 'A1' : '';
    var actual = specInputValue('agOffActualAuthor', seed.actual_author);
    if (!actual) actual = contour === 'A'
      ? (academicSubmode === 'A2'
        ? 'Заказчик — автор финальной версии; мастерская готовит промежуточный рабочий черновик'
        : 'Клиент — автор исходного материала')
      : (contour === 'B1' ? SPEC_EXECUTOR_NAME : '');
    var authorConfirmedEl = document.getElementById('agOffAuthorConfirmed');
    var rightsConfirmedEl = document.getElementById('agOffRightsConfirmed');
    var rightsConfirmed = rightsConfirmedEl
      ? rightsConfirmedEl.checked : seed.rights_confirmed;
    var performerProfiles = rightsProfilesFromText(
      specInputValue('agOffPerformers', seed.performers_text),
      rightsConfirmed
    );
    return {
      contract_contour: contour,
      academic_submode: academicSubmode,
      permitted_purpose: specInputValue('agOffPurpose', seed.permitted_purpose),
      deliverable: specInputValue('agOffDeliverable', seed.deliverable),
      input_description: specInputValue('agOffInput', seed.input_description),
      input_version: specInputValue('agOffInputVersion', seed.input_version),
      inclusions: specList(specInputValue('agOffInclusions', seed.inclusions_text)),
      exclusions: specList(specInputValue('agOffExclusions', seed.exclusions_text)),
      acceptance_criteria: specList(specInputValue('agOffAcceptance', seed.acceptance_text)),
      dependencies: specList(specInputValue('agOffDependencies', seed.dependencies_text)),
      author_participation: specList(specInputValue('agOffAuthorParticipation', seed.author_participation_text)),
      author_participation_confirmed: authorConfirmedEl
        ? authorConfirmedEl.checked : seed.author_participation_confirmed,
      author_decisions: specList(specInputValue('agOffAuthorDecisions', seed.author_decisions_text)),
      discount_amount: parseInt(specInputValue('agOffDiscount', seed.discount_amount), 10) || 0,
      payment_allocation: specList(specInputValue('agOffPaymentAllocation', seed.payment_allocation_text)),
      correction_days: Math.max(0, parseInt(specInputValue('agOffCorrectionDays', seed.correction_days), 10) || 0),
      iterations: Math.max(0, parseInt(specInputValue('agOffIterations', seed.iterations), 10) || 0),
      actual_author: actual,
      rights_mode: specInputValue('agOffRightsMode', seed.rights_mode),
      rights_evidence: specInputValue('agOffRightsEvidence', seed.rights_evidence),
      rights_confirmed: rightsConfirmed,
      performer_profiles: performerProfiles,
      third_party_performers: performerProfiles.map(function (profile) {
        return profile.name;
      })
    };
  }
  function buildSpecificationLines(ledger, cfg) {
    cfg = cfg || {};
    return (ledger || []).map(function (r, i) {
      var amount = Number(r.a || r.final_price || 0);
      var label = r.t || r.label || ('Позиция ' + (i + 1));
      var result = r.result || r.deliverable || cfg.deliverable ||
        ('Результат по позиции «' + label + '» в согласованном формате');
      var inclusions = specList(r.inclusions || cfg.inclusions);
      if (!inclusions.length) inclusions = ['операции и объём, прямо названные в позиции'];
      var exclusions = specList(r.exclusions || cfg.exclusions);
      var criteria = specList(r.acceptance_criteria || cfg.acceptance_criteria);
      if (!criteria.length) criteria = ['передан согласованный артефакт', 'результат соответствует описанию позиции'];
      var dependencies = specList(r.dependencies || cfg.dependencies);
      var allocation = specList(r.payment_allocation || cfg.payment_allocation);
      var correction = r.correction_window || {};
      var correctionDays = correction.days != null ? correction.days
        : (r.correction_window_days != null ? r.correction_window_days
          : (cfg.correction_days == null ? 7 : cfg.correction_days));
      var iterations = r.iterations != null ? r.iterations
        : (cfg.iterations == null ? 1 : cfg.iterations);
      var hasCfg = Object.prototype.hasOwnProperty;
      var lineContour = hasCfg.call(cfg, 'contract_contour')
        ? cfg.contract_contour : (r.contract_contour || 'A');
      var lineAcademicSubmode = lineContour === 'A'
        ? (hasCfg.call(cfg, 'academic_submode')
          ? (cfg.academic_submode || 'A1') : (r.academic_submode || 'A1'))
        : '';
      if (lineAcademicSubmode !== 'A2') lineAcademicSubmode = lineContour === 'A' ? 'A1' : '';
      var lineServiceId = String(
        r.service_id || r.serviceId || r.catalog_id || r.type || cfg.service_id || ''
      );
      var isAiLine = /^(?:ai|svc_ai)$/i.test(lineServiceId);
      if (isAiLine) lineServiceId = 'ai';
      var customerInputs = r.customer_inputs &&
        typeof r.customer_inputs === 'object' ? r.customer_inputs : {};
      var legacyInput = r.input && typeof r.input === 'object' ? r.input : {};
      var authorCheckpoints = specList(
        (r.author_participation && r.author_participation.checkpoints) ||
        r.author_participation || cfg.author_participation
      );
      var authorParticipation = r.author_participation &&
        typeof r.author_participation === 'object' ? r.author_participation : {};
      var authorConfirmed = authorParticipation.confirmed === true ||
        cfg.author_participation_confirmed === true;
      var authorDecisions = specList(
        authorParticipation.customer_decisions_and_data || cfg.author_decisions
      );
      var lineActualAuthor = hasCfg.call(cfg, 'actual_author')
        ? cfg.actual_author : (r.actual_author || '');
      var existingBasis = r.rights_basis && typeof r.rights_basis === 'object'
        ? r.rights_basis : {};
      var lineEvidence = hasCfg.call(cfg, 'rights_evidence')
        ? cfg.rights_evidence : (existingBasis.evidence_ref || '');
      var lineProfiles = Array.isArray(cfg.performer_profiles)
        ? cfg.performer_profiles
        : (Array.isArray(r.performer_profiles) ? r.performer_profiles : []);
      var existingConfirmation = r.rights_confirmation &&
        typeof r.rights_confirmation === 'object' ? r.rights_confirmation : {};
      var lineRightsConfirmed = hasCfg.call(cfg, 'rights_confirmed')
        ? cfg.rights_confirmed === true : existingConfirmation.confirmed === true;
      var rights = structuredRights(
        lineContour,
        lineActualAuthor,
        lineEvidence,
        lineProfiles,
        lineRightsConfirmed
      );
      return {
        id: r.id || ('line-' + String(i + 1).padStart(2, '0')),
        position: r.position || i + 1,
        service_id: lineServiceId,
        contract_contour: lineContour,
        academic_submode: lineAcademicSubmode,
        permitted_purpose: r.permitted_purpose || cfg.permitted_purpose || '',
        result: result,
        deliverable: result,
        input: {
          description: legacyInput.description || customerInputs.description ||
            r.input_description || cfg.input_description || '',
          version: legacyInput.version || customerInputs.version ||
            r.input_version || cfg.input_version || 'версия на дату передачи',
          source_material_required: isAiLine,
          source_material_provided: isAiLine
            ? customerInputs.source_material_provided === true ||
              legacyInput.source_material_provided === true
            : null,
          original_prompt: isAiLine
            ? String(customerInputs.original_prompt || legacyInput.original_prompt || '')
            : '',
          sources_disclosure: isAiLine
            ? String(customerInputs.sources_disclosure || legacyInput.sources_disclosure || '')
            : ''
        },
        input_version: legacyInput.version || customerInputs.version ||
          r.input_version || cfg.input_version || 'версия на дату передачи',
        inclusions: inclusions,
        exclusions: exclusions,
        acceptance_criteria: criteria,
        deadline: {
          text: r.deadline_text || cfg.deadline_text || '',
          date: r.deadline_date || cfg.deadline_date || ''
        },
        deadline_text: r.deadline_text || cfg.deadline_text || '',
        deadline_date: r.deadline_date || cfg.deadline_date || '',
        dependencies: dependencies,
        author_participation: lineAcademicSubmode === 'A2' ? {
          required: true,
          confirmed: authorConfirmed,
          checkpoints: authorCheckpoints,
          customer_decisions_and_data: authorDecisions,
          confirmation_version: 'specification-2.2',
          status: 'фиксируется по контрольным точкам в деле заказа'
        } : null,
        price: { amount: amount, currency: 'RUB' },
        price_amount: amount,
        discount: { amount: Number((r.discount && r.discount.amount) || r.discount_amount || cfg.discount_amount || 0), currency: 'RUB' },
        discount_amount: Number((r.discount && r.discount.amount) || r.discount_amount || cfg.discount_amount || 0),
        payment_allocation: allocation.length ? allocation : ['по плану оплаты заказа'],
        correction_window: {
          days: correctionDays,
          starts: correction.starts || 'с момента передачи результата',
          scope: correction.scope || 'первичная проверка; подтверждённые недостатки исправляются по закону независимо от добровольных итераций'
        },
        correction_window_days: correctionDays,
        iterations: iterations,
        actual_author: lineActualAuthor,
        actual_author_profile: rights.author_profile,
        rights_mode: hasCfg.call(cfg, 'rights_mode')
          ? cfg.rights_mode : (r.rights_mode || ''),
        rights_schema_version: rights.schema_version,
        rights_mode_code: rights.mode_code,
        rights_basis: rights.basis,
        performer_profiles: rights.performer_profiles,
        rights_chain: rights.chain,
        rights_confirmation: rights.confirmation,
        third_party_performers: rights.performer_profiles.map(function (profile) {
          return profile.name;
        }),
        acceptance: {
          status: (r.acceptance && r.acceptance.status) || r.acceptance_status || 'pending',
          act: (r.acceptance && r.acceptance.act) || 'фиксируется отдельно по результату этой позиции'
        },
        /* совместимые aliases */
        t: label,
        a: amount,
        label: label,
        final_price: amount
      };
    });
  }

  /* ── конструктор v3: каталог работ/услуг и состав — строки в один клик.
     Заявка может нести НЕСКОЛЬКО работ и услуг разом: каждая — строка
     сметы; «включено» и «можно довложить» — строки листа состава. ── */
  var OFF_CATS = [
    ['all', 'Все'], ['work', 'Академическая помощь'], ['edit', 'Редактура'],
    ['format', 'Оформление'], ['defense', 'Подготовка выступления'], ['support', 'Консультации']
  ];
  var OFF_CATALOG = [
    { k:'work', c:'work', m:'КР', t:'Разбор и редактура курсовой', s:'исходный текст клиента, консультации и правки', q:'курсач курсовик аудит' },
    { k:'work', c:'work', m:'ВКР', t:'Сопровождение ВКР', s:'аудит и редактура самостоятельного материала клиента', q:'диплом дипломная выпускная консультация' },
    { k:'work', c:'work', m:'МАГ', t:'Сопровождение магистерского исследования', s:'методология, редактура и консультации', q:'магистр магистратура' },
    { k:'work', c:'work', m:'ГЛ', t:'Редактура главы исследования', s:'отдельный блок исходного текста клиента', q:'диссер глава кандидатская' },
    { k:'work', c:'work', m:'ПР', t:'Разбор отчёта по практике', s:'редактура отчёта, дневника и приложений клиента', q:'практика дневник' },
    { k:'work', c:'work', m:'СТ', t:'Научная редактура статьи', s:'проверка аргументации и требований издания', q:'вак ринц публикация' },
    { k:'work', c:'work', m:'РФ', t:'Консультация по реферату · эссе', s:'разбор структуры и редактура исходника', q:'эссе доклад' },
    { k:'svc', c:'support', m:'ПЛ', t:'Разбор задачи и плана', s:'структура и дорожная карта самостоятельной работы', a:3000, q:'план структура' },
    { k:'svc', c:'edit', m:'ЛР', t:'Литературная редактура', s:'стилистика, логика и естественность текста клиента', a:2500, q:'ии ai нейросеть текст редактура' },
    { k:'svc', c:'edit', m:'ДГ', t:'Диагностика черновика', s:'аудит, замечания и карта правок', a:2500, q:'проверка аудит черновик' },
    { k:'svc', c:'format', m:'НК', t:'Нормоконтроль по методичке', s:'оформление и требования вуза', a:5000, q:'гост оформление методичка' },
    { k:'svc', c:'defense', m:'ВЫ', t:'Редактура доклада и слайдов', s:'правки в материалах клиента и репетиция ответов', a:6000, q:'защита презентация речь доклад слайды репетиция' },
    { k:'svc', c:'defense', m:'PRO', t:'Пакет подготовки к выступлению', s:'редактура доклада и слайдов клиента, репетиция самостоятельных ответов', a:9500, q:'защита выступление комплект' },
    { k:'svc', c:'support', m:'1Ч', t:'Репетиторство · консультация', s:'один час с мастером', a:3000, q:'репетитор час консультация созвон' }
  ];
  var OFF_INCLS = ['Работа с исходником клиента', 'Видимые редакторские правки', 'Карта замечаний',
                   'Редактура слайдов клиента', 'Редактура доклада клиента', 'Оформление по ГОСТ и методичке',
                   'Репетиция самостоятельных ответов'];
  function offCatalogItem(x) {
    return '<button type="button" class="ag-est-item" data-off-add="' + x.k + '" data-off-cat-item="' + x.c +
      '" data-off-search="' + esc((x.t + ' ' + x.s + ' ' + (x.q || '')).toLowerCase()) +
      '" data-t="' + esc(x.t) + '"' + (x.a ? ' data-a="' + x.a + '"' : '') + '>' +
      '<span class="ag-est-mark"><span>' + esc(x.m) + '</span></span>' +
      '<span><span class="ag-est-nm">' + esc(x.t) + '</span><span class="ag-est-sub">' + esc(x.s) + '</span></span>' +
      '<span class="ag-est-price' + (x.a ? '' : ' free') + '">' + (x.a ? money(x.a) + ' ₽' : 'своя цена') + '</span></button>';
  }
  function offChip(kind, t, a, label) {
    return '<button type="button" class="ag-chip" data-off-add="' + kind + '" data-t="' + esc(t) + '"' +
      (a ? ' data-a="' + a + '"' : '') + '>' + esc(label || t) +
      (a ? ' <small>' + money(a) + '</small>' : '') + '</button>';
  }
  function offChipAdd(btn) {
    if (btn.classList.contains('ag-est-item') && btn.classList.contains('is-added')) {
      toast('Уже добавлено — цену можно изменить в выбранных позициях');
      return;
    }
    var kind = btn.getAttribute('data-off-add');
    var t = btn.getAttribute('data-t');
    var a = parseInt(btn.getAttribute('data-a') || '0', 10);
    var asAdd = (document.getElementById('agOffAsAdd') || {}).checked;
    var ta, line;
    if (kind === 'incl') { ta = document.getElementById('agOffIncl'); line = t + ' | да'; }
    else if (kind === 'svc' && asAdd) {
      ta = document.getElementById('agOffIncl');
      line = t + ' | нет | ' + (a || 0); /* «можно довложить» — тихое предложение на листе */
    } else {
      ta = document.getElementById('agOffLedger');
      line = t + ' | ' + (a || 0);
    }
    if (!ta) return;
    var head = line.split('|')[0].trim().toLowerCase();
    var dup = ta.value.split('\n').some(function (l) {
      return l.split('|')[0].trim().toLowerCase() === head;
    });
    if (dup) { toast('Такая строка уже есть — поправьте её прямо в поле'); return; }
    ta.value = (ta.value.trim() ? ta.value.replace(/\s+$/, '') + '\n' : '') + line;
    offSumRender();
    offRowsRender();
    offCatalogState();
    if (ta.id === 'agOffLedger') {
      var rows = document.querySelectorAll('#agOffRows [data-off-row-price]');
      var last = rows[rows.length - 1];
      if (last) { last.focus(); try { last.select(); } catch (e) {} }
    }
  }
  function offWord(n) {
    var n10 = n % 10, n100 = n % 100;
    return n10 === 1 && n100 !== 11 ? 'позиция' :
      (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14) ? 'позиции' : 'позиций');
  }
  function offRowsRender() {
    var box = document.getElementById('agOffRows');
    var ta = document.getElementById('agOffLedger');
    if (!box || !ta) return;
    var rows = t2ledger(ta.value);
    box.innerHTML = rows.length ? rows.map(function (r, i) {
      return '<div class="ag-est-row">' +
        '<input type="text" value="' + esc(r.t) + '" data-off-row-title="' + i + '" aria-label="Название позиции ' + (i + 1) + '">' +
        '<input type="number" min="0" step="100" inputmode="numeric" value="' + (r.a || '') +
          '" data-off-row-price="' + i + '" aria-label="Цена позиции ' + (i + 1) + '">' +
        '<button type="button" class="ag-est-rm" data-off-row-rm="' + i + '" aria-label="Удалить ' + esc(r.t) + '">×</button></div>';
    }).join('') : '<div class="ag-est-none">Пока пусто — выберите работу или услугу выше</div>';
    var count = document.getElementById('agEstCount');
    if (count) count.textContent = rows.length + ' ' + offWord(rows.length);
  }
  function offRowsSync() {
    var ta = document.getElementById('agOffLedger');
    if (!ta) return;
    var titles = document.querySelectorAll('#agOffRows [data-off-row-title]');
    var lines = [];
    Array.prototype.forEach.call(titles, function (title) {
      var i = title.getAttribute('data-off-row-title');
      var price = document.querySelector('#agOffRows [data-off-row-price="' + i + '"]');
      if (title.value.trim()) lines.push(title.value.trim() + ' | ' + (parseInt(price && price.value, 10) || 0));
    });
    ta.value = lines.join('\n');
    offSumRender();
    offCatalogState();
  }
  function offCatalogState() {
    var ledger = t2ledger((document.getElementById('agOffLedger') || {}).value);
    var incl = t2incl((document.getElementById('agOffIncl') || {}).value);
    var names = ledger.concat(incl).map(function (r) { return String(r.t || '').toLowerCase(); });
    var items = document.querySelectorAll('#agOffCatalog .ag-est-item');
    Array.prototype.forEach.call(items, function (item) {
      var on = names.indexOf(String(item.getAttribute('data-t') || '').toLowerCase()) >= 0;
      item.classList.toggle('is-added', on);
      item.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  function offCatalogFilter() {
    var q = String((document.getElementById('agOffSearch') || {}).value || '').toLowerCase()
      .replace(/ё/g, 'е').trim();
    var on = document.querySelector('#agEst .ag-est-cat.on');
    var cat = on ? on.getAttribute('data-off-cat') : 'all';
    var shown = 0;
    var items = document.querySelectorAll('#agOffCatalog .ag-est-item');
    Array.prototype.forEach.call(items, function (item) {
      var hay = String(item.getAttribute('data-off-search') || '').replace(/ё/g, 'е');
      var ok = (cat === 'all' || item.getAttribute('data-off-cat-item') === cat) && (!q || hay.indexOf(q) >= 0);
      item.hidden = !ok;
      if (ok) shown++;
    });
    var empty = document.getElementById('agOffEmpty');
    if (empty) empty.hidden = !!shown;
    var clear = document.getElementById('agOffSearchClear');
    if (clear) clear.hidden = !q;
  }
  function offSumRender() {
    var box = document.getElementById('agOffSum');
    if (!box) return;
    var sum = t2ledger((document.getElementById('agOffLedger') || {}).value)
      .reduce(function (s, r) { return s + (r.a || 0); }, 0);
    var price = parseInt((document.getElementById('agPrice') || {}).value, 10)
                || (st.card && st.card.price) || 0;
    box.innerHTML = '<span>Смета по строкам: <b>' + money(sum) + ' ₽</b></span>' +
      '<span>Цена дела: <b>' + money(price) + ' ₽</b></span>' +
      (sum ? '<span class="' + (sum === price ? 'ok' : 'diff') + '">' +
        (sum === price ? 'сходится' : 'не сходится — проверьте распределение перед публикацией')
        + '</span>' : '<span>добавьте первую позицию из каталога</span>');
  }

  function specificationContour(value, serviceId) {
    value = String(value || '').toUpperCase();
    if (value.indexOf('B2') === 0 || value.indexOf('Б2') === 0) return 'B2';
    if (value.indexOf('B1') === 0 || value.indexOf('Б1') === 0) return 'B1';
    if (value.indexOf('A') === 0 || value.indexOf('А') === 0) return 'A';
    return serviceId === 'author' || serviceId === 'svc_author_order' ? 'B_PENDING' : 'A';
  }
  function specificationAcademicSubmode(row, contour, serviceId) {
    if (contour !== 'A') return '';
    row = row || {};
    var value = String(row.academic_submode || row.academicSubmode || '').toUpperCase();
    if (value === 'A2' || value === 'А2') return 'A2';
    var routeResult = String(row.result_code || row.resultCode ||
      (row.case_context && row.case_context.result) || '').toLowerCase();
    var tier = String(row.tier || '').toLowerCase();
    var type = String(row.type || serviceId || '').toLowerCase();
    if (routeResult === 'support' || tier === 'vip' || type === 'work_vip') return 'A2';
    return 'A1';
  }
  function specificationAllocation(total, rows) {
    var weights = rows.map(function (row) {
      return Math.max(1, parseInt(row.final_price || row.price_rub || row.quote_low ||
        (row.quote_preview && row.quote_preview.low) || 1, 10) || 1);
    });
    var weightSum = weights.reduce(function (sum, value) { return sum + value; }, 0);
    var amounts = weights.map(function (value) { return Math.floor(total * value / weightSum); });
    var rest = total - amounts.reduce(function (sum, value) { return sum + value; }, 0);
    for (var i = 0; i < rest; i++) amounts[i % amounts.length]++;
    return amounts;
  }
  function specificationLinesForPrice(o, total) {
    var saved = o.specification_lines ||
      (o.specification && o.specification.lines) ||
      (o.offer && o.offer.specification_lines) ||
      (o.offer && o.offer.specification && o.offer.specification.lines) || [];
    var rows = saved.length ? saved : (o.items || []);
    if (!rows.length) {
      rows = [{
        id:'order-' + o.id, label:o.work_label || 'Индивидуальная услуга',
        topic:o.topic || '', deadline_text:o.deadline_text || '',
        requirements:o.details || '', contract_contour:'A', academic_submode:'A1'
      }];
    }
    var amounts = specificationAllocation(total, rows);
    return rows.map(function (source, index) {
      var row = {};
      Object.keys(source || {}).forEach(function (key) { row[key] = source[key]; });
      var answers = row.answers && typeof row.answers === 'object' ? row.answers : {};
      var authorProfile = row.actual_author_profile && typeof row.actual_author_profile === 'object'
        ? row.actual_author_profile : {};
      var rightsProvenance = row.rights_provenance &&
        typeof row.rights_provenance === 'object' ? row.rights_provenance : {};
      var scope = row.scope && typeof row.scope === 'object' ? row.scope : {};
      var inputs = row.customer_inputs && typeof row.customer_inputs === 'object'
        ? row.customer_inputs : {};
      var serviceId = String(row.service_id || row.serviceId || row.catalog_id || row.type || '');
      var contour = specificationContour(row.contract_contour || answers.author_model, serviceId);
      var academicSubmode = specificationAcademicSubmode(row, contour, serviceId);
      var isA2 = academicSubmode === 'A2';
      var isAiEditing = /^(?:ai|svc_ai)$/i.test(serviceId);
      var title = String(row.title || row.label || o.work_label || ('Позиция ' + (index + 1)));
      var topic = String(row.topic || scope.topic || o.topic || '');
      var requirements = String(row.requirements || scope.customer_requirements || o.details || '');
      var actualAuthor = String(
        row.actual_author || authorProfile.name || authorProfile.author_name || ''
      );
      if (!actualAuthor) {
        actualAuthor = contour === 'A'
          ? (isA2
            ? 'Заказчик — автор финальной версии; мастерская готовит промежуточный рабочий черновик'
            : 'Заказчик — автор содержательной основы; мастерская оказывает согласованную консультационную или редакторскую услугу')
          : (contour === 'B1' ? SPEC_EXECUTOR_NAME : '');
      }
      var rights = String(row.rights_mode || row.intellectual_rights_profile || answers.rights || '');
      if (!rights && contour === 'A') {
        rights = 'Права на исходник сохраняются у Заказчика; мастерская отвечает за собственные консультационные и редакторские материалы';
      }
      var result = String(row.deliverable || row.result || row.plain_description || '');
      if (!result) {
        if (contour !== 'A') result = 'Авторский материал «' + title + '» в согласованном формате';
        else if (isA2) result = 'Промежуточный полный рабочий черновик и исследовательские материалы для содержательной проверки и доработки Заказчиком';
        else if (isAiEditing) result = 'Файл с видимыми правками и комментариями к фактам, источникам и логическим разрывам';
        else if (/norm|format|gost/i.test(serviceId)) result = 'Оформленная версия исходника с видимыми изменениями и листом проверки';
        else if (/review|razbor/i.test(serviceId)) result = 'Письменное экспертное заключение и карта замечаний по исходнику';
        else result = 'Письменный разбор, редакторские комментарии и согласованные изменения в материале Заказчика';
      }
      var included = row.inclusions || row.included || scope.included;
      if (!Array.isArray(included) || !included.length) included = isA2
        ? [
          'исследовательская карта, структура, источники и рабочий черновик по согласованным этапам',
          'контрольные точки для решений и проверки данных Заказчиком',
          'передача промежуточного результата в проверяемом формате'
        ]
        : isAiEditing
          ? [
            'сверка текста с исходным prompt',
            'проверка внутренней логики, фактических утверждений и связи с переданными источниками',
            'видимые редакторские правки и комментарии к неподтверждённым местам'
          ]
          : [
            'проверка исходника и требований, переданных по этой позиции',
            'операции, прямо названные в теме, требованиях и переписке дела',
            'передача согласованного результата в проверяемом формате'
          ];
      var excluded = row.exclusions || row.excluded || scope.excluded;
      if (!Array.isArray(excluded) || !excluded.length) excluded = contour === 'A'
        ? [
          'выполнение и сдача аттестационной работы вместо Заказчика',
          'гарантия оценки, допуска, процента оригинальности или решения комиссии',
          isAiEditing ? 'обход детекторов или подтверждение факта, для которого не передан проверяемый источник' : ''
        ]
        : [
          'использование результата в учебной или научной аттестации',
          'гарантия публикации, одобрения либо иного решения третьего лица'
        ];
      var criteria = row.acceptance_criteria;
      if (!Array.isArray(criteria) || !criteria.length) criteria = [
        'передан читаемый файл или иной прямо согласованный результат',
        'выполнены операции, перечисленные во включённом составе позиции',
        'тема, объём и формат соответствуют зафиксированным условиям'
      ];
      var performerProfiles = Array.isArray(row.performer_profiles)
        ? row.performer_profiles
        : (Array.isArray(rightsProvenance.performer_profiles)
          ? rightsProvenance.performer_profiles : []);
      var performers = performerProfiles.map(function (profile) {
        return profile && profile.name;
      }).filter(Boolean);
      excluded = excluded.filter(Boolean);
      var rightsBasis = row.rights_basis && typeof row.rights_basis === 'object'
        ? row.rights_basis : (rightsProvenance.basis || {});
      var rightsChain = Array.isArray(row.rights_chain)
        ? row.rights_chain
        : (Array.isArray(rightsProvenance.chain) ? rightsProvenance.chain : []);
      var rightsConfirmation = row.rights_confirmation &&
        typeof row.rights_confirmation === 'object'
        ? row.rights_confirmation : (rightsProvenance.confirmation || {});
      return {
        line_id:String(row.line_id || row.requested_line_id || row.client_id || row.id ||
          ('LN-' + String(index + 1).padStart(3, '0'))),
        parent_line_id:row.parent_line_id || row.parent_client_id || null,
        position:index + 1,
        service_id:isAiEditing ? 'ai' : serviceId,
        contract_contour:contour,
        academic_submode:academicSubmode,
        legal_service_type:row.legal_service_type ||
          (contour === 'A'
            ? (isA2 ? 'joint_research_development' : 'academic_support')
            : 'author_order_non_attestation'),
        title:title,
        label:title,
        t:title,
        plain_description:result,
        deliverable:result,
        quantity:Math.max(1, parseInt(row.quantity || row.qty || 1, 10) || 1),
        qty:Math.max(1, parseInt(row.quantity || row.qty || 1, 10) || 1),
        unit:row.unit || 'позиция',
        unit_definition:row.unit_definition ||
          ('1 позиция = один результат «' + title + '» с указанным составом'),
        permitted_purpose:row.permitted_purpose || answers.purpose ||
          (contour === 'A'
            ? (isA2
              ? 'Совместная исследовательская разработка с обязательным содержательным участием Заказчика; финальная авторская версия формируется Заказчиком'
              : 'Самостоятельная работа Заказчика с консультационной, редакторской или учебно-методической помощью мастерской')
            : 'Использование авторского материала только для прямо согласованной цели вне учебной и научной аттестации'),
        topic:topic,
        scope:{ topic:topic, included:included, excluded:excluded },
        inclusions:included,
        exclusions:excluded,
        customer_inputs:{
          description:inputs.description || (isAiEditing
            ? ('Исходный текст; исходный prompt: ' + String(answers.prompt || '') +
              '; сведения об источниках: ' + String(answers.sources || ''))
            : topic || requirements || 'Исходные материалы и требования, переданные в деле заказа'),
          version:inputs.version || 'версия, зафиксированная в деле до начала позиции',
          source_material_required:isAiEditing,
          source_material_provided:isAiEditing
            ? inputs.source_material_provided === true : null,
          original_prompt:isAiEditing ? String(inputs.original_prompt || answers.prompt || '') : '',
          sources_disclosure:isAiEditing ? String(inputs.sources_disclosure || answers.sources || '') : ''
        },
        author_participation:isA2 ? (row.author_participation || {
          required:true,
          confirmed:false,
          checkpoints:[
            'утверждение проблемы, цели, метода и содержательных решений',
            'проверка фактов, источников и исходных данных',
            'содержательная доработка рабочего черновика и формирование финальной авторской версии'
          ]
        }) : null,
        acceptance_criteria:criteria,
        deadline_text:row.deadline_text || row.deadline || o.deadline_text || '',
        deadline_date:row.deadline_date || o.deadline_date || '',
        correction_window:{ days:7, scope:'устранение подтверждённых несоответствий этой позиции' },
        iterations:1,
        actual_author:actualAuthor,
        actual_author_profile:authorProfile,
        rights_mode:rights,
        rights_schema_version:Number(
          row.rights_schema_version || rightsProvenance.schema_version || 0
        ),
        rights_mode_code:String(
          row.rights_mode_code || rightsProvenance.mode_code || ''
        ),
        rights_basis:rightsBasis,
        performer_profiles:performerProfiles,
        rights_chain:rightsChain,
        rights_confirmation:rightsConfirmation,
        third_party_performers:performers,
        price_amount:amounts[index],
        final_price:amounts[index],
        a:amounts[index],
        payment_allocation:['распределяется сервером по утверждённому графику платежей'],
        cancellation_effect:'расчёт за фактически оказанное по этой позиции'
      };
    });
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
        act = '<button type="button" class="btn btn-ink" data-pay-kind="' + p.kind + '" data-pay-amount="' + p.amount + '">Получена</button>';
      if (p.state === 'due' && !remindShown) {
        /* напоминание уходит по ближайшему созревшему этапу — кнопка у него */
        remindShown = true;
        act += '<button type="button" class="btn btn-line" data-remind-pay="1" ' +
          'title="Клиенту заново уйдёт счёт с реквизитами и кассой — в Telegram, на почту и в кабинет">Напомнить</button>';
      }
      return '<div class="pl-row"><span class="pl-n">' + p.n + '</span>' +
        '<span class="pl-what">' + esc(p.label) + ' <span class="pl-st ' + m[1] + '">' + m[0] + '</span></span>' +
        '<span class="pl-sum">' + money(p.amount) + ' ₽</span>' + act + '</div>';
    }).join('');
    var paid = (o.payments || []).filter(function (p) { return p.status === 'paid'; });
    return '<div class="ag-sec" data-block="plan"><span class="caps">Цена и план оплаты' +
      '<span class="sub">' + (o.sub_discount ? 'скидка подписки: −' + money(o.sub_discount) + ' · ' : '') +
      'бонусами списано: ' + money(o.bonus_spent || 0) + ' · деньгами всего: ' + money(o.due_total || o.price || 0) + ' ₽</span></span>' +
      '<div class="ag-actrow">' +
      '<input type="number" id="agPrice" placeholder="цена ₽" value="' + (o.price || '') + '">' +
      '<input type="number" id="agPrepay" placeholder="первый платёж" value="' + (o.prepay || '') + '">' +
      planSel +
      '<button type="button" class="btn btn-wax" id="agPriceSend">' + (o.price ? 'Обновить предложение' : 'Отправить предложение') + '</button>' +
      '</div>' +
      '<p class="ag-note">Первый платёж можно не указывать — посчитается по плану (целиком, 50% или 30%). Перед отправкой сервер заморозит новую редакцию спецификации по ' +
      ((o.items && o.items.length) || 1) + ' поз.; клиент получит тот же PDF в Telegram и кабинете.</p>' +
      (plan.length ? '<div class="ag-plan">' + rows + '</div>' : '') +
      (paid.length ? '<p class="ag-note">Получено: ' + paid.map(function (p) {
        return money(p.amount) + ' ₽ (' + dt(p.at) + ', ' + (METHOD_LBL[p.method] || esc(p.method)) + ')';
      }).join(' · ') + '</p>' : '') +
      '</div>';
  }

  /* Счёт за готовый этап обязан оставаться достижимым и в новом handoff.
     Раньше work/check/fix возвращали handoff-блок раньше старой панели,
     поэтому кнопки part_ready/final_ready существовали в коде, но никогда
     не попадали в DOM. */
  function stageBillingAction(o, total) {
    if ('work fix'.indexOf(o.status) < 0) return '';
    var unpaid = (o.plan || []).some(function (p) { return p.state !== 'paid'; });
    if (!unpaid) return '';
    var finalStage = total <= 1 || (o.stage || 1) >= total;
    var announced = (o.part_ready || 0) >= (o.stage || 1);
    if (finalStage && !o.final_ready)
      return '<button type="button" class="btn btn-wax" id="agFinalReady">Финальный результат подготовлен — счёт на остаток</button>';
    if (!finalStage && !announced)
      return '<button type="button" class="btn btn-wax" id="agPartReady">Результат части ' + o.stage + ' подготовлен — счёт клиенту</button>';
    if (o.due_now && o.due_now.amount > 0)
      return '<button type="button" class="btn btn-wax" data-remind-pay="1">Напомнить об оплате (' + money(o.due_now.amount) + ' ₽)</button>';
    return '';
  }

  /* полоса частей: одинаково нужна и на сдаче, и на уже принятом деле */
  function partsCells(o, total) {
    if (total <= 1) return '';
    var cells = '';
    for (var n = 1; n <= total; n++) {
      var cls = '', tag = 'впереди';
      if (o.status === 'done' || n <= (o.parts_done || 0)) { cls = 'past'; tag = 'принята'; }
      else if (n === o.stage) {
        cls = 'now';
        tag = o.status === 'check' ? 'у клиента' : o.status === 'fix' ? 'правки'
            : ((o.part_ready || 0) === n ? 'ждёт оплату' : 'в работе');
      }
      cells += '<div class="ag-part ' + cls + '"><b>Часть ' + n + '</b><span class="st">' + tag + '</span></div>';
    }
    return '<div class="ag-parts">' + cells + '</div>';
  }

  /* Один блок передачи вместо двух.
     Раньше статусы work/check/fix уходили в ранний return, и весь хвост
     функции (передача файлом, обычный файл, отметка «файлы уже у клиента»)
     не попадал в DOM, хотя обработчики жили. Оставался только «скрепка» в
     переписке — она грузит deliver=0, то есть чистый оригинал без защиты и
     без предупреждения. Теперь: наверху защищённый пакет и счёт этапа, ниже
     складка «без защиты» — тот же оригинал, но осознанно и с пометкой.
     #agPreviewFile выводится ровно один раз за отрисовку. */
  function partsBlock(o) {
    var total = o.stages_total || 1;
    var live = 'work check fix'.indexOf(o.status) >= 0;
    if (!live && o.status !== 'done' && !(total > 1 && o.price)) return '';
    /* вне сдачи и без частей показывать нечего — пустой раздел только шумит */
    if (!live && total <= 1) return '';
    var announced = (o.part_ready || 0) >= (o.stage || 1);
    var head = '<span class="caps">Передача и приёмка результата' +
      '<span class="sub">' +
      (total > 1 ? 'часть ' + o.stage + ' из ' + total + ' · принято ' + (o.parts_done || 0) : '') +
      (live ? (total > 1 ? ' · ' : '') + 'версия ' + (o.handoff_version || 0) : '') +
      (o.final_ready ? ' · финал придержан до оплаты'
        : (announced && 'work fix'.indexOf(o.status) >= 0
          ? ' · счёт за часть ' + o.part_ready + ' выставлен, файл придержан' : '')) +
      '</span></span>';
    if (!live) return '<div class="ag-sec" data-block="handoff">' + head + partsCells(o, total) + '</div>';

    var hp = o.handoff_phase || '';
    var billingAction = stageBillingAction(o, total);
    var state = '';
    var action = '';
    if (!o.handoff_artifact_id || hp === 'fix_requested') {
      state = o.status === 'fix'
        ? 'Клиент прислал замечания. Загрузите исправленный полный документ — новый счёт не создаётся.'
        : 'Загрузите полный документ один раз. Оригинал останется закрытым до принятия защищённой части и оплаты остатка.';
      action = '<label class="btn btn-wax btn-upload">' +
        (o.status === 'fix' ? 'Загрузить исправленную версию' : 'Загрузить пакет результата') +
        '<input type="file" id="agPreviewFile" multiple accept=".pdf,.doc,.docx,.odt,.rtf,.txt,.ppt,.pptx"></label>';
    } else if (hp === 'master_review') {
      state = 'Версия v' + (o.handoff_version || 1) + ' подготовлена: ' +
        ((o.handoff_files || []).length || 1) + ' файл(а). Откройте все защищённые копии перед отправкой.';
      action = '<button type="button" class="btn btn-wax" id="agHandoffPublish">Проверено — отправить клиенту</button>' +
        '<label class="btn btn-line btn-upload">Заменить пакет<input type="file" id="agPreviewFile" multiple accept=".pdf,.docx,.doc,.odt,.rtf,.txt,.ppt,.pptx"></label>';
    } else if (hp === 'preview_published') {
      state = 'Защищённая первая часть у клиента. Ждём: принять или запросить правки.';
    } else if (hp === 'accepted_wait_pay' || hp === 'releasing') {
      state = 'Клиент принял защищённую часть. Ждём остаток — после подтверждения чистый оригинал отправится автоматически.';
    } else if (hp === 'released') {
      state = 'Чистый оригинал выдан автоматически. Ждём финальную приёмку или новые замечания.';
    }
    /* долг текущей части: в work передача заблокирована сервером, пока не оплачено
       (в fix/check повторная передача той же части свободна — клиент её видел) */
    var debt = debtForPart(o, o.stage || 1);
    var held = o.status === 'work' && debt.amount > 0;
    var deliverWord = o.final_ready ? 'финал'
      : (total > 1 ? 'результат части ' + o.stage : 'результат');
    var plain =
      '<details class="ag-plainbox" id="agHandoffPlain">' +
      '<summary>Отправить файл без защиты</summary>' +
      '<p class="ag-note"><b>Отсюда уходит чистый оригинал:</b> без водяного знака и без ограничений на копирование. ' +
      'Берите этот путь, когда защита не нужна — черновик, справка, материалы самого клиента. ' +
      (held
        ? '<b>Этап не оплачен на ' + money(debt.amount) + ' ₽ — сервер придержит файл, передача пойдёт только с отдельным подтверждением.</b>'
        : 'Если этап не оплачен, сервер придержит файл и спросит подтверждение.') + '</p>' +
      '<div class="ag-actrow">' +
      '<label class="btn ' + (held ? 'btn-line' : 'btn-wax') + ' btn-upload">Передать ' + deliverWord +
        ' файлом' + (held ? ' · этап не оплачен' : '') +
        '<input type="file" id="agDeliverFile"></label>' +
      '<label class="btn btn-line btn-upload">Просто отправить файл' +
        '<input type="file" id="agPlainFile"></label>' +
      (o.status !== 'check'
        ? '<button type="button" class="btn btn-line" id="agDeliverMark">Файлы уже у клиента — зафиксировать передачу</button>'
        : '') +
      '</div>' +
      '<p class="ag-note">«Передать ' + esc(deliverWord) + ' файлом» ставит дело на проверку и даёт клиенту кнопки приёмки. ' +
      '«Просто отправить файл» кладёт документ в дело без приёмки. Обе отправки попадают в хронику.</p>' +
      '</details>';
    return '<div class="ag-sec" data-block="handoff">' + head +
      '<p class="ag-note"><b>' + esc(state) + '</b></p>' +
      partsCells(o, total) +
      (billingAction || action ? '<div class="ag-actrow">' + billingAction + action + '</div>' : '') +
      '<p class="ag-note">Правило мастерской: сначала оплата этапа — потом чистый файл. Кнопка «Результат части подготовлен / Финальный результат подготовлен» выставляет счёт; защищённую копию клиент видит сразу, оригинал уходит после подтверждения оплаты. В пакет можно положить сразу основной результат, слайды и доклад — на каждый файл создаётся своя защищённая копия.</p>' +
      ((o.handoff_files || []).length ? '<p class="ag-note"><b>Пакет:</b> ' +
        o.handoff_files.map(esc).join(' · ') + '</p>' : '') +
      plain +
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
      var path = mediaPath(o.id, x.id);
      if (x.media && (x.kind === 'voice' || x.kind === 'audio'))
        body += (body ? '<br>' : '') + '<audio controls preload="none" data-admin-media="' + path + '"></audio>';
      else if (x.media && x.kind === 'photo')
        body += (body ? '<br>' : '') + '<a href="#" target="_blank" rel="noopener" data-admin-media-open aria-disabled="true">' +
          '<img loading="lazy" data-admin-media="' + path + '" alt="фото"></a>';
      else if (x.media && (x.kind === 'video' || x.kind === 'video_note'))
        body += (body ? '<br>' : '') + '<video controls preload="none" style="max-width:min(260px,100%)" data-admin-media="' + path + '"></video>';
      else if (!body || x.file_name)
        body += (body ? '<br>' : '') + ico('clip', 13) + ' ' + esc(x.file_name || ('вложение (' + esc(x.kind || '') + ')'));
      return '<div class="ag-m' + (me ? ' master' : '') + '"><span class="who">' + (me ? 'Мастерская' : 'Клиент') + ' · ' + dt(f.at) + '</span>' +
        '<div class="txt">' + body + '</div></div>';
    }).join('');
    return '<div class="ag-sec" data-block="feed"><span class="caps">Переписка' +
      '<span class="sub">клиент видит её в кабинете' + (o.tg_linked ? ' и в Telegram' : '') + '</span></span>' +
      '<div class="ag-feed" id="agFeed">' + (html || '<div class="ag-sys">пока пусто</div>') + '</div>' +
      '<div class="ag-tpls">' + TPL.map(function (t, i) {
        return '<button type="button" class="ag-tpl" data-tpl="' + i + '" title="Вставить текст в поле">' + t[0] + '</button>';
      }).join('') + '</div>' +
      '<div class="ag-chatform">' +
      '<textarea id="agMsg" rows="2" placeholder="Сообщение клиенту… (Cmd/Ctrl+Enter)"></textarea>' +
      '<label class="btn btn-line btn-upload" title="Приложить файл к сообщению" aria-label="Приложить файл">' +
        ico('clip', 16) + '<input type="file" id="agChatFile"></label>' +
      '<button type="button" class="btn btn-wax" id="agMsgSend">Отправить</button></div></div>';
  }

  /* быстрые заготовки ответов: клик — текст в поле, дальше правится руками */
  var TPL = [
    ['Взял в работу', 'Добрый день! Заявку получил, изучаю требования — вернусь с оценкой в ближайшее время.'],
    ['Уточнение', 'Добрый день! Чтобы оценить точно, уточните, пожалуйста: '],
    ['Результат на проверке', 'Результат передан — проверьте, пожалуйста, по критериям спецификации. Если всё в порядке, нажмите «Принять результат»; замечания по критериям отправьте кнопкой «Нужна корректировка».'],
    ['Правки принял', 'Замечания получил, всё поправлю — пришлю обновлённую версию и напишу здесь.'],
    ['Про оплату', 'Напомню про оплату этапа — реквизиты в карточке заказа (кнопка «Оплатить»). Как поступит, сразу продолжаю.'],
    ['Спасибо', 'Спасибо, что выбрали мастерскую! Если появятся вопросы по принятому результату или отдельной услуге подготовки к выступлению, пишите прямо сюда.']
  ];

  function filesBlock(o) {
    var fs = o.files || [];
    return '<div class="ag-sec"><span class="caps">Файлы дела (' + fs.length + ')</span>' +
      (fs.length ? fs.map(function (f) {
        var tags = '';
        if (f.part) tags += '<span class="fl-tag">часть ' + f.part + '</span>';
        if (f.label) tags += '<span class="fl-tag">' + esc(f.label) + '</span>';
        return '<div class="ag-file"><span class="fname">' + ico('clip', 13) + esc(f.name) + tags + '</span>' +
          '<span class="fmeta">' + (f.from === 'master' ? 'от вас' : 'от клиента') + ' · ' + dt(f.at) + '</span>' +
          '<a class="ag-linkbtn" href="#" data-admin-download="' + filePath(o.id, f.id) +
          '" data-filename="' + esc(f.name) + '">скачать</a></div>';
      }).join('') : '<p class="ag-note">Файлов пока нет.</p>') + '</div>';
  }

  function manageBlock(o) {
    var activeSt = 'new priced prepay work check fix'.indexOf(o.status) >= 0;
    return '<div class="ag-sec"><span class="caps">Управление статусом</span>' +
      '<div class="ag-actrow">' +
      Object.keys(ST_META).map(function (k) {
        return '<button type="button" class="ag-stbtn' + (o.status === k ? ' on' : '') +
          '" data-st="' + k + '">' + ico(stMeta(k)[0], 14) + '<span>' + stMeta(k)[1] + '</span></button>';
      }).join('') + '</div>' +
      '<p class="ag-note">Клиент получает уведомление о смене статуса — в Telegram, на почту и в кабинет.</p>' +
      '<div class="ag-actrow" style="margin-top:10px">' +
      (o.status === 'cancel'
        ? '<button type="button" class="btn btn-line" id="agResume">Возобновить заказ</button>'
        : '<button type="button" class="btn btn-line" id="agCancel2">Закрыть с причиной…</button>') +
      (activeSt
        ? (o.paused
          ? '<button type="button" class="btn btn-line" id="agPause" data-on="0">Снять с паузы</button>'
          : '<button type="button" class="btn btn-line" id="agPause" data-on="1">Поставить на паузу…</button>')
        : '') +
      (o.archived_admin
        ? '<button type="button" class="btn btn-line" id="agArch" data-on="0">Вернуть из архива</button>'
        : '<button type="button" class="btn btn-line" id="agArch" data-on="1">Убрать в архив</button>') +
      '</div>' +
      (o.paused ? '<p class="ag-note">Пауза: напоминания о сроках молчат, клиент видит отметку в кабинете. ' +
        (o.paused_by === 'admin' ? 'Паузу ставили вы — клиент снять её не может.' : 'Паузу ставил клиент — он может снять её сам.') + '</p>' : '') +
      '</div>';
  }

  function intelBlock(o) {
    var ci = o.client_intel;
    var rows = [];
    if (o.tier_label) rows.push(['Сопровождение', esc(o.tier_label)]);
    if (o.quote_low) rows.push(['Сайт показал', money(o.quote_low) + ' – ' + money(o.quote_high) + ' ₽']);
    if (o.deadline_text) rows.push(['Срок клиента', esc(o.deadline_text)]);
    if (o.details) rows.push(['Требования', esc(o.details)]);
    if (ci) {
      rows.push(['Бонусы клиента', money(ci.bonus.balance) +
        (ci.bonus.expiring.length ? ' (сгорит ' + ci.bonus.expiring.map(function (e) { return e.amount + ' — ' + dt(e.at).slice(0, 5); }).join(', ') + ')' : '')]);
      rows.push(['Рефералы', ci.referrals + (ci.referrer ? ' · пришёл от ' + esc(ci.referrer.name || ci.referrer.id) : '')]);
      rows.push(['Клиент с', dt(ci.since) + (ci.welcome_at ? ' · велком получен' : '')]);
      if (ci.banned) rows.push(['Доступ', '<b class="is-danger">В чёрном списке</b>']);
    }
    if (o.consent_at) rows.push(['Согласие ПДн', dt(o.consent_at) + ' · ' + esc(o.consent_doc || '')]);
    if (o.page) rows.push(['Источник', esc(o.page)]);
    if (o.cancel_reason) rows.push(['Причина отказа', '«' + esc(o.cancel_reason) + '»']);
    if (o.review) rows.push(['Отзыв', starRow(o.review.rating) + ' · ' + ({ pending: 'на модерации — вкладка «Отзывы»', approved: 'опубликован', rejected: 'отклонён' }[o.review.status] || '')]);
    if (!rows.length) return '';
    return '<div class="ag-intel">' + rows.map(function (r) {
      return '<div class="ai-row"><span class="ai-k">' + r[0] + '</span><span class="ai-v">' + r[1] + '</span></div>';
    }).join('') + '</div>';
  }

  /* складки «Условия и критерии позиции» нумеруются по порядку строк:
     без стабильного id снимок черновиков захлопывал их при каждой
     фоновой перерисовке карточки */
  var specFactsSeq = 0;
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
    var linked = {};
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
    function itemPrice(item) {
      var amount = item.price && item.price.amount != null ? item.price.amount
        : (item.price_amount != null ? item.price_amount : null);
      var low = amount != null ? amount : (item.final_price || item.quote_low || item.a || 0);
      var high = amount != null ? amount : (item.final_price || item.quote_high || low);
      if (!low) return 'без вилки';
      return (low === high ? money(low) : money(low) + '–' + money(high)) + ' ₽';
    }
    function row(item, child) {
      var facts = [];
      var input = item.input || {};
      var deadline = item.deadline || {};
      var correction = item.correction_window || {};
      var discount = item.discount && item.discount.amount != null
        ? item.discount.amount : item.discount_amount;
      fact(facts, 'Тип договора', item.contract_contour);
      fact(facts, 'Подрежим академической мастерской', item.academic_submode);
      fact(facts, 'Разрешённая цель', item.permitted_purpose);
      fact(facts, 'Результат', item.deliverable || item.result);
      fact(facts, 'Исходник', input.description || item.input_description);
      fact(facts, 'Версия исходника', input.version || item.input_version);
      fact(facts, 'Включено', item.inclusions);
      fact(facts, 'Не включено', item.exclusions);
      fact(facts, 'Критерии приёмки', item.acceptance_criteria);
      fact(facts, 'Срок результата', deadline.text || item.deadline_text);
      fact(facts, 'Дата результата', deadline.date || item.deadline_date);
      fact(facts, 'Зависимости', item.dependencies);
      if (discount) fact(facts, 'Скидка по строке', money(discount) + ' ₽');
      fact(facts, 'Платёж по строке', item.payment_allocation);
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
      if (item.author_participation) {
        fact(facts, 'Участие Заказчика обязательно',
          item.author_participation.required ? 'да' : 'нет');
        fact(facts, 'Контрольные точки участия Заказчика',
          item.author_participation.checkpoints);
      }
      var customerInputs = item.customer_inputs || {};
      fact(facts, 'Исходный prompt', customerInputs.original_prompt);
      fact(facts, 'Сведения об источниках', customerInputs.sources_disclosure);
      if (item.acceptance) {
        fact(facts, 'Приёмка позиции',
          [item.acceptance.status, item.acceptance.act].filter(Boolean).join(' · '));
      }
      if (item.topic) fact(facts, 'Тема', item.topic);
      if (item.requirements) fact(facts, 'Требования', item.requirements);
      if (item.note) fact(facts, 'Комментарий', item.note);
      Object.keys(item.answers || {}).forEach(function (key) {
        var value = item.answers[key];
        if (value !== '' && value != null) facts.push('<b>' + esc(key) + ':</b> ' + esc(value));
      });
      var label = item.position_label || item.label || item.t || '';
      var pos = item.position || item.id || '•';
      return '<div class="ag-ci' + (child ? ' child' : '') + '">' +
        '<span class="ag-ci-no">' + (child ? '↳' : esc(pos)) + '</span>' +
        '<div class="ag-ci-main"><div><b>' + esc(label) + '</b>' +
        ((item.qty || 1) > 1 ? ' × ' + item.qty : '') + '</div>' +
        (facts.length ? '<details id="agSpecFacts' + specFactsSeq++ +
          '"><summary>Условия и критерии позиции · ' + facts.length +
          '</summary><p>' + facts.join('<br>') + '</p></details>' : '') + '</div>' +
        '<span class="ag-ci-price">' + itemPrice(item) + '</span></div>';
    }
    var rows = '';
    specFactsSeq = 0;
    if (isSpecification) {
      items.forEach(function (item) { rows += row(item, false); });
    } else {
      items.filter(function (item) { return item.kind === 'work'; }).forEach(function (work) {
        rows += row(work, false);
        (byParent[work.client_id] || []).forEach(function (service) {
          linked[service.id] = true;
          rows += row(service, true);
        });
      });
      items.filter(function (item) {
        return item.kind !== 'work' && !linked[item.id];
      }).forEach(function (service) { rows += row(service, false); });
    }
    return '<div class="ag-sec ag-compose"><span class="caps">Спецификация заказа <span class="sub">один документ · ' +
      items.length + ' поз.</span></span><p class="ag-note">У каждой позиции свои результат, критерии, срок, цена, порядок корректировок и акт приёмки.</p>' +
      '<div class="ag-ci-list">' + rows + '</div></div>';
  }

  /* быстрые действия мастера: пин, цвет, скрыть, корзина — прямо в шапке дела */
  function quickRow(o) {
    var pal = ['red', 'gold', 'green', 'blue', 'violet'].map(function (c) {
      return '<button type="button" class="clr-dot' + (o.color === c ? ' on' : '') + '" data-card-clr="' + c + '" ' +
        'title="метка «' + CLR_NAME[c] + '»" aria-label="Метка «' + CLR_NAME[c] + '»" style="--clr-dot-ink:' + CLR[c] + '"></button>';
    }).join('') +
      '<button type="button" class="clr-dot' + (!o.color ? ' on' : '') + '" data-card-clr="" title="без метки" aria-label="Снять цветную метку"></button>';
    /* Убрать в архив и в корзину — необратимые для рабочего стола действия.
       В один клик рядом с «Закрепить» они опасны: карточка открывается
       десятками раз за день, и промах стоит дела. Прячем под «···». */
    var hidden = o.deleted
      ? '<button type="button" class="ag-qbtn" data-card-flag="restore">↩ Вернуть из корзины</button>' +
        '<button type="button" class="ag-qbtn is-danger" data-card-flag="purge" ' +
          'title="Стереть дело навсегда — с хроникой, файлами и перепиской. Возврата нет">' +
          ico('trash', 13) + '<span>Стереть навсегда</span></button>'
      : '<button type="button" class="ag-qbtn' + (o.archived_admin ? ' on' : '') + '" data-card-flag="hide" ' +
          'title="Скрыть с рабочего стола — заказ уедет в «Архив», клиент ничего не заметит">' +
          ico('archive', 13) + '<span>' + (o.archived_admin ? 'В архиве' : 'Убрать в архив') + '</span></button>' +
        '<button type="button" class="ag-qbtn is-danger" data-card-flag="trash" ' +
          'title="Убрать в корзину: пропадёт из всех списков, кроме «Корзины». Данные не стираются">' +
          ico('trash', 13) + '<span>В корзину</span></button>';
    return '<div class="ag-quick">' +
      '<button type="button" class="ag-qbtn' + (o.pinned ? ' on' : '') + '" data-card-flag="pin" ' +
        'title="Закреплённые заказы всегда наверху списка">' + ico('pin', 13) +
        '<span>' + (o.pinned ? 'Закреплён' : 'Закрепить') + '</span></button>' +
      '<span class="ag-pal" title="Цветная метка — для своих пометок: срочное, ждёт, VIP…">' + pal + '</span>' +
      '<details class="ag-more"><summary class="ag-qbtn" aria-label="Ещё действия с делом" ' +
        'title="Архив и корзина">' + ico('dots', 14) + '</summary>' +
        '<div class="ag-more__menu">' + hidden + '</div></details>' +
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
      if (o.promo_code) rows.push(['Промокод ' + esc(o.promo_code), 'привязан — скидка посчитается от цены']);
      if (o.gift_code) rows.push(['Сертификат ' + esc(o.gift_code), 'привязан — зачтётся при цене']);
      if (o.bonus_spent) rows.push(['Бонусы', '−' + money(o.bonus_spent)]);
    } else {
      rows.push(['Цена', '<b>' + money(o.price) + ' ₽</b>']);
      if (o.promo_discount) rows.push(['Промокод ' + esc(o.promo_code || ''), '−' + money(o.promo_discount) + ' ₽']);
      else if (o.promo_code) rows.push(['Промокод ' + esc(o.promo_code), 'не применился (условия кода)']);
      if (o.sub_discount) rows.push(['Абонемент', '−' + money(o.sub_discount) + ' ₽']);
      if (o.bonus_spent) rows.push(['Бонусы клиента', '−' + money(o.bonus_spent) + ' ₽']);
      if (o.gift_amount) rows.push(['Сертификат ' + esc(o.gift_code || ''), '−' + money(o.gift_amount) + ' ₽ (зачёт)']);
      else if (o.gift_code) rows.push(['Сертификат ' + esc(o.gift_code), 'привязан, зачтётся при пересчёте']);
      var paid = 0, claimed = 0;
      (o.plan || []).forEach(function (p) {
        if (p.state === 'paid') paid += p.amount || 0;
        else if (p.state === 'claimed') claimed += p.amount || 0;
      });
      var total = o.due_total || 0;
      rows.push(['Деньгами к оплате', '<b>' + money(total) + ' ₽</b>']);
      if (paid) rows.push(['Получено', money(paid) + ' ₽']);
      if (claimed) rows.push(['Отмечено клиентом (сверить)', money(claimed) + ' ₽']);
      rows.push(['Остаток', '<b>' + money(Math.max(0, total - paid)) + ' ₽</b>']);
    }
    return '<div class="ag-sec ag-money"><span class="caps">Деньги по делу</span><div class="ag-kv">' +
      rows.map(function (r) { return '<div><span>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('') +
      '</div></div>';
  }

  function captureAdminCardUi(scope) {
    var snap = { fields: {}, details: [], focus: '', selection: null, primary: 0, rail: 0, estCat: '' };
    if (!scope) return snap;
    var estCat = scope.querySelector('.ag-est-cat.on');
    if (estCat) snap.estCat = estCat.getAttribute('data-off-cat') || '';
    scope.querySelectorAll('input[id], textarea[id], select[id]').forEach(function (el) {
      if (el.type === 'file') return;
      snap.fields[el.id] = {
        value: el.value,
        checked: !!el.checked,
        kind: (el.type === 'checkbox' || el.type === 'radio') ? 'checked' : 'value'
      };
    });
    scope.querySelectorAll('details[id][open]').forEach(function (el) { snap.details.push(el.id); });
    var active = document.activeElement;
    if (active && scope.contains(active) && active.id) {
      snap.focus = active.id;
      if (typeof active.selectionStart === 'number') snap.selection = active.selectionStart;
    }
    var primary = scope.querySelector('.admin-order-drawer__primary');
    var rail = scope.querySelector('.admin-order-drawer__rail');
    if (primary) snap.primary = primary.scrollTop;
    if (rail) snap.rail = rail.scrollTop;
    return snap;
  }

  function restoreAdminCardUi(scope, snap) {
    if (!scope || !snap) return;
    Object.keys(snap.fields || {}).forEach(function (id) {
      var el = document.getElementById(id), saved = snap.fields[id];
      if (!el || el.type === 'file') return;
      if (saved.kind === 'checked') el.checked = saved.checked;
      else el.value = saved.value;
    });
    (snap.details || []).forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.tagName === 'DETAILS') el.open = true;
    });
    if (snap.estCat) {
      scope.querySelectorAll('.ag-est-cat').forEach(function (btn) {
        var on = btn.getAttribute('data-off-cat') === snap.estCat;
        btn.classList.toggle('on', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }
    var primary = scope.querySelector('.admin-order-drawer__primary');
    var rail = scope.querySelector('.admin-order-drawer__rail');
    if (primary) primary.scrollTop = snap.primary || 0;
    if (rail) rail.scrollTop = snap.rail || 0;
    if (snap.focus) {
      var focus = document.getElementById(snap.focus);
      if (focus) {
        try {
          focus.focus({ preventScroll: true });
          if (snap.selection !== null && focus.setSelectionRange)
            focus.setSelectionRange(snap.selection, snap.selection);
        } catch (e) {}
      }
    }
  }

  function setAdminDrawerBackground(makeInert) {
    ['.admin-sidebar', '.admin-head'].forEach(function (selector) {
      var el = document.querySelector(selector);
      if (el) el.inert = !!makeInert;
    });
    var body = document.getElementById('agBody');
    if (body) {
      Array.prototype.forEach.call(body.children, function (el) {
        if (el.id !== 'agCard' && el.id !== 'agCardBackdrop') el.inert = !!makeInert;
      });
    }
    var shade = document.getElementById('agCardBackdrop');
    if (shade) shade.tabIndex = -1;
  }

  function drawCard() {
    var box = document.getElementById('agCard');
    var o = st.card;
    if (!box || !o) return;
    var preserved = box.getAttribute('data-order-id') === String(o.id)
      ? captureAdminCardUi(box) : null;
    box.classList.add('is-open');
    box.setAttribute('aria-hidden', 'false');
    box.setAttribute('data-order-id', String(o.id));
    document.body.classList.add('admin-drawer-open');
    setAdminDrawerBackground(true);
    ['agFilters', 'agBulkWrap'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.inert = true;
    });
    var register = document.querySelector('.admin-order-register');
    if (register) register.inert = true;
    var backdrop = document.getElementById('agCardBackdrop');
    if (backdrop) backdrop.hidden = false;
    releaseAdminObjectUrls();
    /* переписка не должна прыгать в конец при каждом действии/тихом обновлении:
       к низу — только на свежем открытии дела и после отправки сообщения */
    var prevFeed = document.getElementById('agFeed');
    var prevTop = prevFeed ? prevFeed.scrollTop : null;
    var sameOrder = st._feedOrder === o.id;
    var hint = nextHint(o);
    box.innerHTML =
      '<div class="admin-order-drawer__bar"><div><span id="agCardTitle">Карточка дела</span><strong>№' + o.id +
      '</strong></div><button type="button" id="agCardClose" aria-label="Закрыть карточку дела">×</button></div>' +
      '<div class="admin-order-drawer__intro">' +
      '<div class="admin-order-drawer__meta">' +
      '<span class="mono petit">Дело №' + o.id + ' · ' + esc(o.source || '') + ' · создано ' + dt(o.created_at) +
      (o.archived_admin ? ' · в архиве' : '') + (o.deleted ? ' · в корзине' : '') + '</span>' +
      '<span>' + (o.paused ? '<span class="ag-stamp st-cancel" style="margin-right:6px">' +
        ico('pause', 13) + '<span>пауза</span></span>' : '') +
      stamp(o.status) + '</span></div>' +
      /* заявка из бота может прийти без названия услуги — пустой <h2>
         оставлял в шапке карточки дыру вместо заголовка */
      '<h2>' + (o.pinned ? ico('pin', 17, 'h2-pin') + ' ' : '') +
        esc(o.work_label || 'Заявка без названия услуги') + '</h2>' +
      (o.topic ? '<p class="ag-topic">«' + esc(o.topic) + '»</p>' : '') +
      quickRow(o) +
      /* Следующий шаг — полоса действия, а не абзац со врезанной кнопкой:
         это главная точка входа в карточку, её нельзя читать по диагонали. */
      (hint ? '<section class="ag-next ' + hint[0] + '" aria-label="Следующий шаг">' +
        '<span class="ag-next__mark">' + ico(hint[0] === 'due' ? 'flag' : 'hourglass', 15) + '</span>' +
        '<div><span class="ag-next__kicker">Следующий шаг</span>' +
        '<strong>' + hint[1] + '</strong>' +
        (hint[2] ? '<p>' + hint[2] + '</p>' : '') + '</div>' +
        (hint[3] ? '<div class="ag-next__act">' + hint[3] + '</div>' : '') +
        '</section>' : '') + '</div>' +
      '<div class="admin-order-drawer__workspace">' +
      '<div class="admin-order-drawer__primary">' +
        /* порядок — по частоте работы: переписка, передача и счёт этапа,
           цена и план, сборка заявки, и только потом длинная спецификация */
        feedBlock(o) + partsBlock(o) + planBlock(o) + offerBlock(o) + orderItemsBlock(o) +
      '</div><aside class="admin-order-drawer__rail" aria-label="Сводка и управление">' +
      /* деньги первыми: при полусотне открытий в день это главный вопрос */
      moneyBlock(o) + clientLine(o) + filesBlock(o) + manageBlock(o) + intelBlock(o) +
      '<div class="ag-sec"><span class="caps">Заметка (видна только вам)</span>' +
      '<div class="ag-actrow"><textarea id="agNote" rows="2">' + esc(o.admin_note || '') + '</textarea>' +
      '<button type="button" class="btn btn-line" id="agNoteSave">Сохранить</button></div></div>' +
      '<div class="ag-sec"><span class="caps">Хроника дела</span><div class="ag-ev">' +
      (o.events || []).map(function (e) {
        return dt(e.at) + ' · ' + esc(evLabel(e.kind)) + (e.data ? ' — ' + esc(evData(e).slice(0, 70)) : '');
      }).join('<br>') + '</div></div></aside></div>';
    hydrateAdminMedia(box);
    if (st.offnew) setTimeout(function () {
      offSumRender(); offRowsRender(); offCatalogState(); offCatalogFilter();
    }, 0);
    var feedBox = document.getElementById('agFeed');
    if (feedBox) {
      if (st.feedStick || !sameOrder) feedBox.scrollTop = feedBox.scrollHeight;
      else if (prevTop != null) feedBox.scrollTop = prevTop;
    }
    restoreAdminCardUi(box, preserved);
    if (!preserved) {
      setTimeout(function () {
        if (box.classList.contains('is-open')) {
          try { box.focus({ preventScroll: true }); } catch (e) {}
        }
      }, 0);
    }
    /* Пришли из очереди с адресом блока — встаём на нём и подсвечиваем один
       раз. Дальше карточка ведёт себя как обычно: адрес одноразовый. */
    if (st.cardFocus) {
      var want = st.cardFocus;
      st.cardFocus = '';
      setTimeout(function () {
        var target = box.querySelector('[data-block="' + want + '"]');
        if (!target) return;
        try { target.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
        catch (e) { target.scrollIntoView(); }
        target.classList.add('is-called');
        setTimeout(function () { target.classList.remove('is-called'); }, 1800);
      }, 60);
    }
    st.feedStick = false;
    st._feedOrder = o.id;
  }

  /* ---------------- КЛИЕНТЫ ---------------- */
  function clientInitials(name) {
    return String(name || 'Клиент').trim().split(/\s+/).map(function (part) {
      return part.charAt(0);
    }).join('').slice(0, 2).toUpperCase() || 'К';
  }

  function drawClientList() {
    var box = document.getElementById('agCList');
    if (!box) return;
    if (!st.clients.length) { box.innerHTML = '<div class="ag-empty">Клиентов пока нет</div>'; return; }
    var q = (st.cq || '').toLowerCase().trim();
    var arr = st.clients.filter(function (c) {
      if (!q) return true;
      return (String(c.name || '').toLowerCase().indexOf(q) >= 0) ||
             (String(c.username || '').toLowerCase().indexOf(q) >= 0);
    });
    arr.sort(function (a, b) {
      switch (st.csort) {
        case 'ltv': return (b.paid_sum || 0) - (a.paid_sum || 0);
        case 'orders': return (b.orders || 0) - (a.orders || 0);
        case 'bonus': return (b.balance || 0) - (a.balance || 0);
        case 'name': return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
        default: return (b.last_seen || '') < (a.last_seen || '') ? -1 : 1;
      }
    });
    if (!arr.length) { box.innerHTML = '<div class="ag-empty">Никто не найден по «' + esc(st.cq) + '».</div>'; return; }
    box.innerHTML = arr.map(function (c) {
      var selected = c.id === st.csel;
      return '<button type="button" class="ag-row client-directory__row' +
        (selected ? ' sel is-current' : '') + '" data-cid="' + c.id +
        '" aria-pressed="' + (selected ? 'true' : 'false') + '">' +
        '<span class="client-directory__avatar">' + clientInitials(c.name) + '</span>' +
        /* @ник переехал во вторую строку: в одной строке с именем он
           обрезался посреди слова и колонка картотеки не давала прочесть
           ни имя целиком, ни ник */
        '<span class="r-main"><strong class="r-t">' +
          (c.banned ? '<span class="cl-banned" title="В чёрном списке">' + ico('stCancel', 12) + '</span>' : '') +
          esc(c.name || 'клиент') + '</strong>' +
        '<small class="r-s">' + (c.username ? '@' + esc(c.username) + ' · ' : '') +
          (c.orders || 0) + ' ' +
          anPl(c.orders || 0, 'дело', 'дела', 'дел') + ' · был ' + dt(c.last_seen) + '</small></span>' +
        /* «бонусов» словом: раньше здесь стоял значок алмаза, и без него
           колонка превращалась в число без единицы измерения */
        '<span class="r-side"><span class="r-price" title="Бонусный счёт клиента">' +
          money(c.balance) + '<small>бонусов</small></span><b aria-hidden="true">→</b></span>' +
        '</button>';
    }).join('');
  }

  function drawClientCard() {
    var box = document.getElementById('agCCard');
    var c = st.ccard;
    if (!box || !c) return;
    /* защита от неполного payload (новый клиент без бонусов/рефералов и т.п.) —
       иначе всё innerHTML-выражение падало и карточка не рисовалась вовсе */
    var refs = c.referrals || [];
    var bonus = c.bonus || {}; if (!bonus.expiring) bonus.expiring = [];
    var orders = c.orders || [];
    var ledger = c.ledger || [];
    var paidSum = c.paid_sum != null ? c.paid_sum
      : orders.reduce(function (s, o) { return s + (/^(done|work|check|fix)$/.test(o.status) ? (o.price || 0) : 0); }, 0);
    var activeN = orders.filter(function (o) { return 'new priced prepay work check fix'.indexOf(o.status) >= 0; }).length;
    var doneN = orders.filter(function (o) { return o.status === 'done'; }).length;
    var activeOrder = orders.filter(function (o) {
      return 'new priced prepay work check fix'.indexOf(o.status) >= 0;
    })[0] || null;
    var telegram = c.username
      ? '<a href="https://t.me/' + esc(c.username) + '" target="_blank" rel="noopener">@' + esc(c.username) + '</a>'
      : (c.id > 0 ? '<a href="tg://user?id=' + c.id + '">Профиль привязан</a>' : 'Не привязан');
    var caseDeadline = activeOrder
      ? (activeOrder.deadline_text
        ? esc(activeOrder.deadline_text)
        : (activeOrder.deadline_date
          ? 'Ближайший срок ' + esc(dmLabel(activeOrder.deadline_date))
          : 'Срок не указан'))
      : '';
    var activeCase = activeOrder
      ? '<section class="client-profile__case"><header><h3>Активное дело</h3>' +
          '<button type="button" class="ag-linkbtn" data-open-order="' + activeOrder.id + '">Открыть дело</button></header>' +
          '<div class="client-case">' +
            '<span class="client-case__status"><span class="status-stamp st-' + esc(activeOrder.status) + '">' +
              esc(stMeta(activeOrder.status)[1]) + '</span></span>' +
            '<strong class="client-case__id">№' + activeOrder.id + '</strong>' +
            '<span class="client-case__task">' + esc(activeOrder.work_label || 'Заявка') + '</span>' +
            '<small class="client-case__deadline">' + caseDeadline + '</small>' +
          '</div></section>'
      : '<section class="client-profile__case"><header><h3>Активное дело</h3></header>' +
          '<div class="client-case client-case--empty"><strong>Активных дел нет</strong>' +
            '<small>Завершённые и закрытые дела доступны ниже.</small></div></section>';
    box.innerHTML =
      '<button type="button" class="client-profile__back" data-client-back>← К картотеке</button>' +
      '<header class="client-profile__header"><span class="client-profile__avatar">' +
        clientInitials(c.name) + '</span><div><p class="eyebrow">Карточка клиента</p>' +
        '<h2>' + esc(c.name || 'клиент') + '</h2>' +
        (c.banned ? '<span class="ag-stamp st-cancel cl-banned-stamp">' + ico('stCancel', 13) +
          '<span>в чёрном списке</span></span>' : '') +
        '<span>С нами с ' + dt(c.since) + (c.welcome_at ? ' · приветственный бонус получен' : '') +
        '</span></div>' +
        '<details class="client-profile__menu"><summary class="quiet-button" aria-label="Действия с клиентом">•••</summary>' +
          '<div><button type="button" class="ag-linkbtn" data-imp-client="' + c.id + '">Открыть кабинет</button>' +
          (c.username
            ? '<a class="ag-linkbtn" href="https://t.me/' + esc(c.username) +
              '" target="_blank" rel="noopener">Открыть Telegram</a>'
            : '') + '</div>' +
        '</details></header>' +
      '<div class="client-profile__contacts">' +
        '<span><small>Telegram</small><strong>' + telegram + '</strong></span>' +
        '<span><small>Последний визит</small><strong>' + (dt(c.last_seen) || 'Нет данных') + '</strong></span>' +
        '<span><small>Оплачено всего</small><strong>' + money(paidSum) + ' ₽</strong></span>' +
      '</div>' +

      activeCase +

      /* Три больших ящика под три однозначных числа занимали полосу во всю
         ширину и весили больше, чем сами цифры. Одна строка-итог. */
      '<p class="cl-tally"><b>' + orders.length + '</b> ' +
        anPl(orders.length, 'дело', 'дела', 'дел') + ' всего · <b>' + activeN +
        '</b> в работе · <b>' + doneN + '</b> ' +
        anPl(doneN, 'завершено', 'завершено', 'завершено') + '</p>' +

      (c.referrer ? '<p class="ag-meta">По приглашению: ' + esc(c.referrer.name || 'клиент') + '</p>' : '') +
      (refs.length ? '<p class="ag-meta">Приглашённые клиенты: ' + refs.map(function (r) {
        return esc(r.name || 'клиент');
      }).join(', ') + '</p>' : '') +

      /* Бонусный счёт переписан: остаток — крупной цифрой, сгорание —
         отмеченной строкой, а не серым хвостом под заголовком, форма
         проводки подписана (это операция с деньгами клиента, а не поиск),
         журнал — таблицей со знаком, а не потоком моношрифта. */
      '<section class="ag-sec client-profile__bonus" id="clBonusPanel"><header><h3>Бонусный счёт</h3>' +
      '<span class="sub">' + (bonus.expiring.length ? 'срок у части баллов истекает' : 'начисления и списания') + '</span></header>' +
      '<div class="cl-bonus__figure"><b>' + money(bonus.balance || 0) + '</b><i>' +
        anPl(bonus.balance || 0, 'бонус', 'бонуса', 'бонусов') + ' на счёте</i></div>' +
      (bonus.expiring.length
        ? '<p class="cl-bonus__burn">' + ico('hourglass', 14) + '<span>Сгорает: ' +
          bonus.expiring.map(function (e) { return '<b>' + money(e.amount) + '</b> — ' + dt(e.at).slice(0, 5); }).join(', ') +
          '</span></p>'
        : '') +
      '<div class="cl-bonus__form">' +
        '<label class="cl-bonus__field"><span>Сумма</span>' +
          '<input type="number" id="agBDelta" placeholder="+500 или −500" inputmode="numeric"></label>' +
        '<label class="cl-bonus__field cl-bonus__field--wide"><span>Комментарий — клиент его увидит</span>' +
          '<input type="text" id="agBNote" placeholder="за что начисляем или списываем"></label>' +
        '<button type="button" class="btn btn-wax" id="agBApply">Провести</button>' +
      '</div>' +
      '<p class="ag-note">Плюс — начислить, срок жизни 90 дней. Минус — списать. О начислении клиент получит уведомление.</p>' +
      /* Журнал был потоком строк моношрифта, склеенных <br>: дата, знак и
         основание сливались. Три колонки — когда, за что, сколько. */
      (ledger.length
        ? '<div class="cl-ledger client-profile__ledger">' +
          ledger.map(function (r) {
            var neg = (r.delta || 0) < 0;
            return '<div class="cl-ledger__row">' +
              '<time>' + dt(r.at) + '</time>' +
              '<span>' + esc(r.label) + (r.note ? ' <i>— ' + esc(r.note) + '</i>' : '') + '</span>' +
              '<b class="' + (neg ? 'neg' : 'pos') + '">' + (neg ? '−' : '+') +
                money(Math.abs(r.delta || 0)) + '</b></div>';
          }).join('') + '</div>'
        : '<p class="ag-note">Движений по счёту пока не было.</p>') + '</section>' +

      '<section class="ag-sec client-profile__orders" id="clOrdersPanel"><header><h3>Дела клиента</h3>' +
      '<span class="sub">' + orders.length + '</span></header>' +
      /* Дела клиента ехали в разметке файловой строки: имя услуги, цена и
         «открыть» стояли в одну линию без колонок и без статуса. */
      (orders.length
        ? '<div class="cl-orders">' + orders.map(function (o) {
            return '<button type="button" class="cl-orders__row" data-open-order="' + o.id + '">' +
              '<span class="cl-orders__id">№' + o.id + '</span>' +
              '<span class="cl-orders__task">' + esc(o.work_label || 'Заявка') + '</span>' +
              stampShort(o.status) +
              '<span class="cl-orders__sum">' + (o.price ? money(o.price) + ' ₽' : '—') + '</span>' +
              '<span class="cl-orders__go" aria-hidden="true">→</span></button>';
          }).join('') + '</div>'
        : '<p class="ag-note">Дел пока нет.</p>') + '</section>' +

      '<section class="ag-sec client-profile__access" id="clAccessPanel"><header><h3>Доступ и безопасность</h3></header>' +
      '<div class="ag-actrow">' +
      '<button type="button" class="btn btn-line" data-imp-client="' + c.id + '">Открыть кабинет клиента</button>' +
      /* Блокировка — не главное действие карточки: сургучная заливка
         звала нажать её первой. Обводка и сургучное слово. */
      '<button type="button" class="btn btn-line' + (c.banned ? '' : ' is-danger') +
      '" id="agBan" data-on="' + (c.banned ? '0' : '1') + '">' +
      (c.banned ? 'Снять блокировку' : 'Заблокировать клиента') + '</button></div>' +
      '<p class="ag-note">«Открыть кабинет» — тихий вход на правах клиента в новой вкладке: посмотреть его глазами, ' +
      'поправить, помочь. Клиент ничего не заметит — визиты и метки «прочитано» не трогаются.<br>' +
      'Блокировка закрывает приём новых заявок с сайта от этого аккаунта.</p></section>';
  }

  /* ---------------- ОТЗЫВЫ ---------------- */
  function tplReviews() {
    if (!st.reviews.length) return '<div class="ag-empty">Отзывов пока нет. Они появляются, когда клиент завершённого заказа ставит оценку в боте или кабинете.</div>';
    var stLbl = { pending: 'ждёт решения', approved: 'на сайте', rejected: 'отклонён' };
    function rvCard(r) {
      return '<div class="ag-rv ' + r.status + '" data-rv-st="' + r.status + '">' +
        '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline">' +
        '<span class="rv-st">' + starRow(r.rating) + '</span>' +
        '<span class="rv-meta">' + (stLbl[r.status] || '') + ' · ' + dt(r.at) + '</span></div>' +
        (r.text ? '<blockquote>«' + esc(r.text) + '»</blockquote>' : '<blockquote style="opacity:.6">Без текста — только оценка.</blockquote>') +
        '<p class="rv-meta">' + esc(r.author || 'Без подписи') + ' · ' + esc(r.work_label || '') +
        ' · <button type="button" class="ag-linkbtn" data-open-order="' + r.order_id + '">дело №' + r.order_id + '</button></p>' +
        '<div class="ag-actrow" style="margin-top:10px">' +
        (r.status !== 'approved' ? '<button type="button" class="btn btn-ink" data-rv="' + r.id + '" data-ok="1">Опубликовать</button>' : '') +
        (r.status !== 'approved' && !r.publication_consent ? '<span class="rv-meta">Нет отметки об отдельном согласии на публикацию</span>' : '') +
        (r.status !== 'rejected' ? '<button type="button" class="btn btn-line" data-rv="' + r.id + '" data-ok="0">' + (r.status === 'approved' ? 'Снять с сайта' : 'Отклонить') + '</button>' : '') +
        '</div></div>';
    }
    var pend = st.reviews.filter(function (r) { return r.status === 'pending'; });
    var rest = st.reviews.filter(function (r) { return r.status !== 'pending'; });
    return '<p class="petit" style="margin-bottom:12px">Отзывы публикуются на «Книге отзывов» сайта только после вашего одобрения. Отклонённый отзыв клиент не увидит как отклонённый — просто не попадёт на сайт.</p>' +
      '<div class="ag-sec" style="border-top:0;padding-top:0;margin-top:0"><span class="caps">Ждут решения' +
        (pend.length ? ' · ' + pend.length : '') + '</span>' +
        (pend.length ? pend.map(rvCard).join('') : '<div class="ag-empty">Отзывов на модерации нет.</div>') + '</div>' +
      '<div class="ag-sec"><span class="caps">На сайте и отклонённые · ' + rest.length + '</span>' +
        (rest.length ? rest.map(rvCard).join('') : '<div class="ag-empty">Пусто.</div>') + '</div>';
  }

  /* ---------------- «ОТКРЫТАЯ ПРИЁМНАЯ» ---------------- */
  var QA_ST = {
    pending: 'ждёт ответа', published: 'на сайте',
    answered: 'отвечен тихо', rejected: 'отклонён'
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
    var draft = (st.qaDrafts && st.qaDrafts[q.id]) || {};
    var pendingQ = q.status === 'pending';
    var raw = q.question_raw && q.question_raw !== q.question
      ? '<details style="margin:8px 0"><summary class="petit" style="cursor:pointer">Исходник гостя (до чистки)</summary>' +
        '<blockquote style="font-style:italic;margin-top:6px">«' + esc(q.question_raw) + '»</blockquote></details>' : '';
    var who = esc(q.pseudonym || 'Аноним') +
      (q.quiet ? ' · тихий (без публикации)' : '') +
      (q.email ? ' · почта оставлена' : ' · без почты') +
      (q.source === 'archive' ? ' · архив' : '');
    var techno = '<span class="petit" style="opacity:.7">vid ' + esc((q.vid || '—').slice(0, 14)) +
      ' · ip ' + esc(q.ip || '—') + (q.same ? ' · таких же: ' + q.same : '') + '</span>';
    var btns = [];
    if (pendingQ && !q.quiet) {
      btns.push('<button type="button" class="btn btn-ink" data-qa-act="publish" data-qa-id="' + q.id + '">Опубликовать с ответом</button>');
      if (!q.publish_consent) btns.push('<span class="petit">Нет отметки об отдельном разрешении на публикацию</span>');
    }
    if (pendingQ && q.email) btns.push('<button type="button" class="btn btn-line" data-qa-act="answer_quiet" data-qa-id="' + q.id + '">Ответить письмом' + (q.quiet ? '' : ' (без публикации)') + '</button>');
    if (pendingQ && q.quiet && !q.email) btns.push('<span class="petit">Тихий вопрос без почты — ответить некуда; можно отклонить.</span>');
    if (!pendingQ) btns.push('<button type="button" class="btn btn-line" data-qa-act="save" data-qa-id="' + q.id + '">Сохранить правки</button>');
    if (q.status === 'published') {
      btns.push('<button type="button" class="btn btn-line" data-qa-act="' + (q.pinned ? 'unpin' : 'pin') + '" data-qa-id="' + q.id + '">' + (q.pinned ? 'Открепить' : 'Закрепить сверху') + '</button>');
      btns.push('<button type="button" class="btn btn-line" data-qa-act="unpublish" data-qa-id="' + q.id + '">Снять с сайта</button>');
    }
    if ((q.status === 'answered' || q.status === 'rejected') && !q.quiet) {
      btns.push('<button type="button" class="btn btn-line" data-qa-act="publish" data-qa-id="' + q.id + '">' + (q.status === 'rejected' ? 'Вернуть и опубликовать' : 'Опубликовать') + '</button>');
    }
    if (pendingQ) btns.push('<button type="button" class="btn btn-line" data-qa-act="reject" data-qa-id="' + q.id + '">Отклонить</button>');
    btns.push('<button type="button" class="btn btn-line is-danger" data-qa-act="ban" data-qa-id="' + q.id + '">Бан автора</button>');
    btns.push('<button type="button" class="btn btn-line is-danger" data-qa-act="delete" data-qa-id="' + q.id + '">Удалить</button>');
    return '<div class="ag-rv ' + (pendingQ ? 'pending' : '') + '" id="qaRow-' + q.id + '">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline">' +
      '<b>Входящий ' + esc(q.num) + '</b>' +
      '<span class="rv-meta">' + (QA_ST[q.status] || esc(q.status)) + (q.pinned ? ' · закреплён' : '') + ' · ' + dt(q.created_at) + '</span></div>' +
      '<p class="rv-meta" style="margin-top:4px">' + who + '</p>' + raw +
      '<div style="display:grid;gap:8px;margin-top:8px">' +
      '<label class="petit" for="qaQ-' + q.id + '">Вопрос (публикуемая формулировка — чистите деанон и резкие формулировки)' + (draft.q != null ? ' · <span class="is-danger">черновик не сохранён</span>' : '') + '</label>' +
      '<textarea id="qaQ-' + q.id + '" class="ag-inp" rows="3" maxlength="600">' + esc(draft.q != null ? draft.q : q.question) + '</textarea>' +
      '<label class="petit" for="qaA-' + q.id + '">Ответ мастера' + (draft.a != null ? ' · <span class="is-danger">черновик не сохранён</span>' : '') + '</label>' +
      '<textarea id="qaA-' + q.id + '" class="ag-inp" rows="' + (pendingQ ? 6 : 4) + '" maxlength="3000" placeholder="По делу, ясно, с уместным переходом к услуге">' + esc(draft.a != null ? draft.a : (q.answer || '')) + '</textarea>' +
      qaTagSelect(q.id, q.tag) + '</div>' +
      '<div class="ag-actrow" style="margin-top:10px;flex-wrap:wrap">' + btns.join('') + '</div>' +
      '<p style="margin-top:6px">' + techno + '</p></div>';
  }

  function tplQA() {
    if (st.qa === null) return '<div class="ag-empty">Загружаем приёмную…</div>';
    var pending = st.qa.filter(function (q) { return q.status === 'pending'; });
    var rest = st.qa.filter(function (q) { return q.status !== 'pending'; })
      .sort(function (a, b) { return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0); });   /* закреплённые — наверх */
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
  /* контакт лида — сразу кликабельный: позвонить/написать/скопировать */
  function leadContact(raw) {
    var s = String(raw || '').trim();
    if (!s) return '<span class="mono">—</span>';
    var e = esc(s);
    if (/^\+?\d[\d\s()\-]{6,}$/.test(s))
      return '<a class="ag-linkbtn" href="tel:' + esc(s.replace(/[^\d+]/g, '')) + '">' + icoPhone(14) + ' ' + e + '</a>';
    if (s.indexOf('@') > 0 && s.indexOf('.') > s.indexOf('@') && !/\s/.test(s))
      return '<a class="ag-linkbtn" href="mailto:' + e + '">' + icoMail(14) + ' ' + e + '</a>';
    if (/^@/.test(s) || /t\.me\//.test(s)) {
      var tg = s.replace(/^@/, '').replace(/^(https?:\/\/)?t\.me\//, '');
      return '<a class="ag-linkbtn" href="https://t.me/' + esc(tg) + '" target="_blank" rel="noopener">' + e + '</a>';
    }
    return '<button type="button" class="ag-linkbtn" data-copy="' + e + '" title="скопировать">' + e + ' ' + icoCopy(14) + '</button>';
  }
  function leadRow(l) {
    var open = leadOpen(l);
    var msg = String(l.message || '');
    var word = l.status === 'done' ? LEAD_ST.done
      : (leadDone(l.id) ? 'обработан · отмечено вами' : (LEAD_ST[l.status] || esc(l.status)));
    return '<article class="ag-lead' + (open ? ' is-open' : ' is-done') + '">' +
      '<div class="ag-lead__main">' +
      '<p class="ag-lead__who"><b>№' + l.id + '</b> ' + esc(l.name || 'без имени') +
        ' · ' + leadContact(l.contact) + '</p>' +
      (msg ? '<p class="ag-lead__msg">' + esc(msg.slice(0, 240)) + (msg.length > 240 ? '…' : '') + '</p>' : '') +
      '<p class="ag-lead__meta">' + word + ' · ' + dt(l.at) + '</p>' +
      '</div>' +
      (l.status === 'done'
        ? ''
        : '<button type="button" class="btn btn-line ag-lead__act" data-lead-done="' + l.id +
          '" data-lead-on="' + (open ? '1' : '0') + '">' +
          (open ? 'Отметить обработанным' : 'Вернуть в работу') + '</button>') +
      '</article>';
  }

  function tplLeads() {
    var list = st.leads || [];
    var open = list.filter(leadOpen);
    var closed = list.filter(function (l) { return !leadOpen(l); });
    var head = '<p class="petit" style="margin-bottom:10px">Обращения с сайта без оформленного заказа. ' +
      'Свяжитесь по контакту, потом отметьте обращение обработанным — счётчик в меню погаснет. ' +
      'Отметка живёт на этом устройстве: сервер пока не хранит статус обращения.</p>';
    if (!list.length)
      return head + '<div class="ag-empty">Обращений пока нет</div>';
    return head +
      '<section class="ag-sec ag-leads" style="border-top:0;padding-top:0;margin-top:0">' +
        '<span class="caps">Ждут ответа' + (open.length ? ' · ' + open.length : '') + '</span>' +
        (open.length ? open.map(leadRow).join('')
          : '<div class="ag-empty">Все обращения разобраны.</div>') +
      '</section>' +
      (closed.length
        ? '<section class="ag-sec ag-leads"><span class="caps">Обработанные · ' + closed.length + '</span>' +
          closed.map(leadRow).join('') + '</section>'
        : '');
  }

  /* ---------------- НАСТРОЙКИ ---------------- */
  function settingsPanel(title, note, body, extraClass) {
    return '<section class="ag-sec admin-panel admin-settings-panel' +
      (extraClass ? ' ' + extraClass : '') + '">' +
      '<header><div><h2>' + title + '</h2><span>' + note + '</span></div></header>' +
      '<div class="admin-settings-panel__body">' + body + '</div></section>';
  }

  function settingsSummary(ov) {
    var maintenance = ov.maintenance || {};
    var siteOn = !maintenance.site;
    var botOn = !maintenance.bot;
    var payLabel = ov.pay_online ? 'Онлайн' : (ov.requisites ? 'Переводы' : 'Не настроена');
    var payNote = ov.pay_online ? 'карта и СБП доступны' :
      (ov.requisites ? 'ручная сверка платежей' : 'нужны реквизиты');
    var mailLabel = ov.mail_on ? 'Работает' : (ov.mail_configured ? 'Ошибка' : 'Не настроена');
    var mailNote = ov.mail_on ? 'письма и вход по коду' :
      (ov.mail_configured ? esc(ov.mail_error || 'SMTP недоступен') : 'SMTP не подключён');
    return '<section class="admin-metrics admin-settings-summary" aria-label="Состояние сервисов">' +
      '<article><span>Публичный сайт</span><strong>' + (siteOn ? 'Работает' : 'Закрыт') +
        '</strong><small>' + (siteOn ? 'страницы и формы доступны' : 'включён режим техработ') + '</small></article>' +
      '<article><span>Telegram-бот</span><strong>' + (botOn ? 'Работает' : 'Закрыт') +
        '</strong><small>' + (botOn ? 'клиентские команды доступны' : 'включён короткий антракт') + '</small></article>' +
      '<article><span>Оплата</span><strong>' + payLabel + '</strong><small>' + payNote + '</small></article>' +
      '<article><span>Почта</span><strong>' + mailLabel + '</strong><small>' + mailNote + '</small></article>' +
      '</section>';
  }

  function maintSec(ov) {
    var m = ov.maintenance || {};
    function row(key, on, title, note) {
      return '<div class="admin-settings-service-row">' +
        '<span><strong>' + title + '</strong><small>' + note + '</small></span>' +
        '<span class="status-stamp ' + (on ? 'st-cancel' : 'st-done') + '">' +
          (on ? 'Закрыт' : 'Работает') + '</span>' +
        '<button type="button" class="btn ' + (on ? 'btn-wax' : 'btn-line') +
          '" data-maint="' + key + '" data-on="' + (on ? 1 : 0) + '">' +
          (on ? 'Открыть' : 'Закрыть на техработы') + '</button>' +
      '</div>';
    }
    var body =
      ((m.site || m.bot) ? '<p class="admin-settings-warning"><b>Один из сервисов закрыт.</b> Откройте его после завершения работ.</p>' : '') +
      row('site', m.site, 'Публичный сайт', 'Страницы и формы для посетителей') +
      row('bot', m.bot, 'Telegram-бот', 'Клиентские команды и уведомления');
    return settingsPanel('Режимы сервиса', 'Изменения требуют подтверждения', body,
      'admin-settings-panel--service');
  }

  /* ответ /admin/slots -> обновить локальное состояние и перерисовать настройки */
  function slotsApply(r) {
    st.ov = st.ov || {};
    st.ov.slots = { quota: r.quota, taken: r.taken, auto: r.auto || 0, extra: r.extra || 0 };
    st.ov.slots_quota = r.quota; st.ov.slots_taken = r.taken;
    if (st.tab === 'settings') drawBody();
  }

  /* «Набор месяца»: квота-политика + брони мастера (место занято договорённостью
     вне картотеки). Счётчик сайта = заявки картотеки (сами) + брони (руками).
     Быстрые / сохраняют сразу — то же самое умеет /slots в боте. */
  function slotsSec(ov) {
    var s = ov.slots || { quota: ov.slots_quota || 0, taken: ov.slots_taken || 0, auto: 0, extra: 0 };
    var free = Math.max(0, (s.quota || 0) - (s.taken || 0));
    var stateLine = s.quota
      ? (free
        ? 'Сайт показывает: <b>свободно ' + free + ' из ' + s.quota + '</b> — обложка, прейскурант, смета.'
        : 'Сайт показывает: <b>мест нет</b> — идёт запись на следующий месяц.')
      : 'Квота 0 — плашки набора на сайте скрыты.';
    var body =
      '<p class="petit admin-settings-slots-state">' + stateLine + '</p>' +
      '<div class="ag-actrow admin-settings-slots-controls">' +
      '<label class="petit"><span>Квота</span>' +
      '<input type="number" id="agSlots" min="0" max="500" value="' + (s.quota || 0) + '"></label>' +
      '<button type="button" class="btn btn-line" id="agSlotsSave">Сохранить квоту</button>' +
      '<span class="petit">занято: <b>' + (s.taken || 0) + '</b> = картотека ' + (s.auto || 0) +
      ' + брони ' + (s.extra || 0) + '</span></div>' +
      '<div class="ag-actrow admin-settings-slots-actions">' +
      '<button type="button" class="btn btn-wax" data-slot-extra="1">Место забронировано</button>' +
      '<button type="button" class="btn btn-line" data-slot-extra="-1"' + (s.extra ? '' : ' disabled') + '>Снять бронь</button>' +
      '</div>' +
      '<details class="admin-settings-disclosure admin-settings-disclosure--note">' +
        '<summary>Как считается доступность</summary>' +
        '<p class="ag-note">Заявки картотеки месяца считаются автоматически. Ручная бронь — это ' +
        'реальная договорённость вне картотеки; после оформления заявки снимите её, чтобы место не ' +
        'посчиталось дважды. То же действие доступно командой <b>/slots</b> в Telegram.</p>' +
      '</details>';
    return settingsPanel('Запись и доступность', 'Квота и ручные брони', body,
      'admin-settings-panel--slots');
  }

  function settingsDisclosure(title, note, body, extraClass) {
    return '<details class="admin-settings-disclosure' + (extraClass ? ' ' + extraClass : '') + '">' +
      '<summary><span><strong>' + title + '</strong><small>' + note + '</small></span>' +
        '<span class="admin-settings-disclosure__action">Подробнее</span></summary>' +
      '<div class="admin-settings-disclosure__body">' + body + '</div></details>';
  }

  function drawSettings(box) {
    var ov = st.ov || {};
    var payStatus = ov.pay_online
      ? 'Онлайн-касса работает; карта и СБП доступны.'
      : (ov.requisites
        ? 'Доступна ручная оплата переводом.'
        : 'Сначала добавьте реквизиты для ручной оплаты.');
    var payDetails = ov.pay_online
      ? '<p class="petit">Платёжные статусы обновляются автоматически. Ручная оплата остаётся резервным способом.</p>'
      : '<p class="petit">Для подключения Robokassa проверьте в кабинете магазина Робочеки СМЗ, ' +
        'Result URL <span class="mono">https://akademsalon.ru/api/pay/robokassa</span> (POST), ' +
        'Success/Fail URL <span class="mono">https://akademsalon.ru/dashboard.html</span> (GET) и MD5. ' +
        'Боевые ROBOKASSA_LOGIN, ROBOKASSA_PASS1 и ROBOKASSA_PASS2 хранятся в защищённой конфигурации. ' +
        'После её изменения перезапустите сервис <span class="mono">salon-bot-v2</span>.</p>';
    var mailStatus = ov.mail_on
      ? 'Транзакционные письма и вход по коду работают.'
      : (ov.mail_configured ? 'SMTP настроен, но сейчас недоступен.' : 'SMTP пока не настроен.');
    var mailDetails = ov.mail_on
      ? '<p class="petit">Рабочий адрес: support@akademsalon.ru. Для доменов Mail.ru проверьте ' +
        'регистрацию akademsalon.ru в postmaster.mail.ru и журнал возвратов.</p>'
      : (ov.mail_configured
        ? '<p class="petit">Последняя ошибка: <b>' + esc(ov.mail_error || 'SMTP недоступен') + '</b>. ' +
          'Проверьте состояние ящика, SMTP-порты 465/587 и защищённые SMTP-параметры. После изменения ' +
          'конфигурации перезапустите сервис <span class="mono">salon-bot-v2</span>.</p>'
        : '<p class="petit">Добавьте SMTP_HOST, SMTP_USER и SMTP_PASS в защищённую конфигурацию. ' +
          'До подключения письма и вход по коду скрыты автоматически.</p>');
    var oauth = ov.oauth || {};
    var oauthStatus = 'ВКонтакте: ' + (oauth.vk ? 'подключён' : 'выключен') +
      ' · Mail.ru: ' + (oauth.mailru ? 'подключён' : 'выключен');
    var oauthDetails =
      '<p class="petit"><b>ВКонтакте.</b> Redirect URL: ' +
        '<span class="mono">https://akademsalon.ru/api/auth/vk/callback</span>; идентификатор ' +
        'приложения хранится как VK_CLIENT_ID.</p>' +
      '<p class="petit"><b>Mail.ru.</b> Redirect URL: ' +
        '<span class="mono">https://akademsalon.ru/api/auth/mailru/callback</span>; ID и секрет ' +
        'хранятся как MAILRU_CLIENT_ID и MAILRU_CLIENT_SECRET. После изменения защищённой ' +
        'конфигурации перезапустите сервис <span class="mono">salon-bot-v2</span>.</p>';
    var groupStatus = ov.group_forum
      ? 'Темы включены; каждое дело получает отдельную ветку.'
      : (ov.group_chat_id ? 'Группа подключена, темы пока выключены.' : 'Рабочая группа не подключена.');
    var groupDetails = ov.group_forum
      ? '<p class="petit">Файлы, чеки и отзывы по делу направляются в его тему. Справка доступна командой /help.</p>'
      : '<p class="petit">Включите для группы режим тем «Список», затем выполните команду /threads. ' +
        (ov.group_chat_id ? 'Текущий идентификатор группы: <span class="mono">' +
          esc(String(ov.group_chat_id)) + '</span>. ' : '') +
        'Пока темы выключены, события идут в общую ленту с метками дел.</p>';
    var recoveryBody =
      '<div class="admin-settings-status-list">' +
        settingsDisclosure('Онлайн-оплата', payStatus, payDetails, 'admin-settings-panel--payments') +
        settingsDisclosure('Почта', mailStatus, mailDetails, 'admin-settings-panel--mail') +
        settingsDisclosure('Вход через ВК и Mail.ru', oauthStatus, oauthDetails, 'admin-settings-panel--oauth') +
        settingsDisclosure('Рабочая группа заказов', groupStatus, groupDetails, 'admin-settings-panel--group') +
      '</div>';
    box.innerHTML =
      settingsSummary(ov) +
      '<div class="admin-settings-workspace" aria-label="Настройки сервиса">' +
        '<div class="admin-dashboard-grid admin-settings-primary">' +
          maintSec(ov) +
          slotsSec(ov) +
        '</div>' +
        '<div class="admin-dashboard-grid admin-settings-finance">' +
          settingsPanel('Реквизиты для переводов', 'Показываются при ручной оплате',
            '<div class="ag-actrow"><textarea id="agReq" rows="3" ' +
              'placeholder="СБП или банковские реквизиты">' + esc(ov.requisites || '') + '</textarea>' +
              '<button type="button" class="btn btn-line" id="agReqSave">Сохранить</button></div>' +
            '<p class="ag-note">Эти реквизиты видят клиенты при оплате переводом — в боте и кабинете.</p>',
            'admin-settings-panel--requisites') +
          settingsPanel('Оплата этапами', 'Рабочая политика расчётов',
            '<p class="petit">Небольшие работы делятся на 2 части (50/50), крупные — на 3 части ' +
            '(30/40/30). План назначается вместе с ценой и остаётся редактируемым в карточке дела, ' +
            'пока этапы не начались.</p>',
            'admin-settings-panel--stages') +
        '</div>' +
        '<div class="admin-dashboard-grid admin-settings-secondary">' +
          settingsPanel('Подключения и восстановление', 'Статусы и инструкции раскрываются по запросу',
            recoveryBody, 'admin-settings-panel--recovery') +
          settingsPanel('Инструменты мастерской', 'Обложки и памятки',
            '<div class="admin-settings-tools">' +
              '<a class="ag-linkbtn" href="admin-covers.html" target="_blank" rel="noopener">' +
                '<strong>Мастерская обложек</strong><small>Фирменные PNG для публикаций</small></a>' +
              '<a class="ag-linkbtn" href="' + S.api.base + '/pamyatka/welcome" target="_blank" rel="noopener">' +
                '<strong>Памятка новичка (PDF)</strong><small>Актуальная клиентская версия</small></a>' +
            '</div>',
            'admin-settings-panel--tools') +
        '</div>' +
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
    } else toast(errSay(r.error));
  }

  function uploadAdminFile(input, deliver, preview) {
    var files = input.files ? Array.prototype.slice.call(input.files) : [];
    if (!files.length || !st.sel) return;
    if (!preview) files = [files[0]];
    if (files.length > 10) { toast('В одном пакете можно передать до 10 файлов.'); return; }
    if (files.some(function (f) { return f.size > 20 * 1024 * 1024; })) {
      toast('Один из файлов больше 20 МБ — такие не пролезают через Telegram-бота.'); return;
    }
    sendAdminFiles(files, deliver, preview, false);
  }

  /* «этап не оплачен» (409 stage_unpaid): файл придержан сервером — объясняем
     правило и даём осознанный обход вторым подтверждением */
  function unpaidDialog(r, deliver, retry) {
    var whatTxt = 'За часть ' + (r.part || '') + ' не оплачено ' + money(r.debt) + ' ₽' +
      (r.labels && r.labels.length ? ' (' + r.labels.join(' + ').toLowerCase() + ')' : '') + '. Файл НЕ отправлен.';
    if (r.claimed) {
      confirmDlg({
        title: 'Клиент отметил оплату — сверьте поступление',
        text: whatTxt + ' Отметка клиента ждёт вашей сверки: проверьте деньги и нажмите «Получена» в плане оплат — тогда файл можно передавать. Передать без сверки — на ваш риск.',
        okLabel: 'Передать без сверки', noLabel: 'Не передавать', danger: true
      }).then(function (res) { if (res.ok) retry(); });
      return;
    }
    confirmDlg({
      title: 'Сначала оплата — потом файл',
      text: whatTxt + (deliver
        ? ' По правилу мастерской выставьте счёт («Результат части подготовлен / Финальный результат подготовлен» — файл придержится, клиент получит реквизиты и кассу) или покажите защищённый предпросмотр. Передать оригинал без оплаты — на ваш риск.'
        : ' Если это результат позиции — не отправляйте оригинал: выставьте счёт за этап или пошлите защищённый предпросмотр. Обычная передача без оплаты — на ваш риск.'),
      okLabel: deliver ? 'Всё равно передать' : 'Отправить как есть',
      noLabel: 'Не отправлять', danger: true
    }).then(function (res) { if (res.ok) retry(); });
  }

  function sendAdminFiles(files, deliver, preview, force) {
    var f = files[0];
    var names = files.map(function (x) { return x.name; });
    var note = document.getElementById('agUpNote');
    if (note) {
      note.hidden = false;
      note.textContent = preview
        ? 'Сохраняем пакет (' + files.length + ') и готовим защищённые копии: ' + names.join(' · ') + '…'
        : 'Отправляем «' + f.name + '»…';
    }
    var fd = new FormData();
    files.forEach(function (item) { fd.append('file', item, item.name); });
    var q = preview ? 'preview=1' : 'deliver=' + (deliver ? '1' : '0');
    if (force) q += '&force=1';
    fetch(S.api.base + '/admin/orders/' + st.sel + '/upload?' + q, {
      method: 'POST', body: fd,
      headers: S.api.headers ? S.api.headers('POST') : {},
      credentials: 'include'
    }).then(function (resp) { return resp.json(); })
      .then(function (r) {
        if (!r.ok && r.error === 'stage_unpaid') {
          if (note) note.textContent = 'Файл придержан: этап не оплачен (' + money(r.debt) + ' ₽).';
          unpaidDialog(r, deliver, function () { sendAdminFiles(files, deliver, preview, true); });
          return;
        }
        if (!r.ok) {
          var perr = errSay(r.error, 'Файл не ушёл. Проверьте документ и повторите.');
          if (r.filename && ERR_WORD[r.error]) perr += ' Файл: ' + r.filename + '.';
          if (note) note.textContent = perr;
          toast(perr);
          return;
        }
        if (preview) {
          if (note) note.textContent = 'Пакет из ' + (r.file_count || files.length) + ' файлов подготовлен. Клиент его ещё не видел — откройте все проверочные копии в рабочей ветке и подтвердите отправку.';
          toast('Пакет готов к вашей проверке');
        } else {
          if (note) note.textContent = deliver ? 'Передано — клиент получил кнопки приёмки' : 'Файл у клиента';
          toast(deliver ? 'Передача результата зафиксирована' : (r.delivered_tg ? 'Файл доставлен в Telegram' : 'Файл в деле — клиент увидит в кабинете'));
        }
        if (r.order) { st.card = r.order; drawCard(); }
      })
      .catch(function () { if (note) note.textContent = 'Сеть прервалась — попробуйте ещё раз'; });
  }

  root.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest('[data-admin-mobile-back]')) {
      if (history.length > 1) history.back();
      else location.href = '/';
      return;
    }
    if (t.closest('[data-admin-mobile-search], [data-admin-global-search]')) {
      focusAdminSearch();
      return;
    }
    if (t.closest('[data-admin-mobile-menu]')) {
      var navOpen = document.body.classList.toggle('admin-nav-expanded');
      var navButton = t.closest('[data-admin-mobile-menu]');
      navButton.setAttribute('aria-expanded', String(navOpen));
      setAdminNavBackground(navOpen);
      if (navOpen) {
        setTimeout(function () {
          var current = document.querySelector('#agNav .ag-tab.is-current');
          if (current) current.focus();
        }, 0);
      }
      return;
    }
    var protectedDownload = t.closest('[data-admin-download]');
    if (protectedDownload) {
      e.preventDefault();
      if (protectedDownload.getAttribute('aria-busy') === 'true') return;
      protectedDownload.setAttribute('aria-busy', 'true');
      adminProtectedFetch(protectedDownload.getAttribute('data-admin-download'))
        .then(function (resp) {
          if (!resp.ok) throw new Error('http_' + resp.status);
          var disp = resp.headers.get('Content-Disposition') || '';
          var m = disp.match(/filename\*=UTF-8''([^;]+)/i);
          var fallback = protectedDownload.getAttribute('data-filename') || 'файл';
          var filename = fallback;
          if (m) {
            try { filename = decodeURIComponent(m[1]); } catch (err) {}
          }
          return resp.blob().then(function (blob) { return { blob: blob, filename: filename }; });
        })
        .then(function (asset) {
          var url = URL.createObjectURL(asset.blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = asset.filename;
          a.rel = 'noopener';
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(function () { try { URL.revokeObjectURL(url); } catch (err) {} }, 60000);
        })
        .catch(function () { toast('Файл сейчас не скачался — обновите дело и повторите'); })
        .then(function () {
          if (protectedDownload.isConnected) protectedDownload.removeAttribute('aria-busy');
        });
      return;
    }
    var pendingMedia = t.closest('[data-admin-media-open][aria-disabled="true"]');
    if (pendingMedia) {
      e.preventDefault();
      toast('Вложение ещё загружается');
      return;
    }
    if (t.closest('#agHandoffPublish')) {
      var pb = t.closest('#agHandoffPublish');
      if (!st.card || !st.card.handoff_artifact_id) return;
      pb.disabled = true;
      api('/admin/orders/' + st.sel + '/handoff/' + st.card.handoff_artifact_id + '/publish', {})
        .then(function (r) {
          /* не отпустили — вернуть кнопку, иначе публикация недоступна до перезагрузки */
          if (!r.ok) pb.disabled = false;
          afterOrder(r, r.ok ? 'Защищённая версия отправлена клиенту' : '');
        })
        .catch(function () { pb.disabled = false; toast('Сеть прервалась — попробуйте ещё раз'); });
      return;
    }
    if (t.closest('#agTg')) {
      var b = t.closest('#agTg');
      b.disabled = true; b.textContent = 'Подтвердите в боте…';
      S.tgLogin(function () { gate(); }, function () { gate(); },
        function (link, opened) { if (!opened) b.insertAdjacentHTML('afterend', '<p class="petit"><a class="link" href="' + link + '" target="_blank">Открыть бота</a></p>'); });
      return;
    }
    if (t.closest('#agCancel')) { S.secretStore.del('salon_auth_pending'); gate(); return; }
    if (t.closest('#agLogout')) { S.api.logout().then(gate); return; }
    if (t.closest('#agRetry')) { gate(); return; }
    if (t.closest('#agTabRetry')) { loadTab(true); return; }
    if (t.closest('#agPulseRetry')) { doRefresh(); return; }
    if (t.closest('#agSubsRetry')) { loadSubs(); return; }
    var leadBtn = t.closest('[data-lead-done]');
    if (leadBtn) {
      var leadId = parseInt(leadBtn.getAttribute('data-lead-done'), 10);
      var leadOn = leadBtn.getAttribute('data-lead-on') === '1';
      leadMark(leadId, leadOn);
      toast(leadOn ? 'Обращение № ' + leadId + ' отмечено обработанным'
                   : 'Обращение № ' + leadId + ' вернулось в работу');
      drawNav();
      drawBody();
      return;
    }
    if (t.closest('#agCardClose') || t.closest('#agCardBackdrop')) {
      var closedOrderId = st.sel;
      st.sel = null;
      st.card = null;
      var drawer = document.getElementById('agCard');
      var shade = document.getElementById('agCardBackdrop');
      if (drawer) {
        drawer.classList.remove('is-open');
        drawer.setAttribute('aria-hidden', 'true');
        drawer.removeAttribute('data-order-id');
        drawer.innerHTML = '';
      }
      if (shade) shade.hidden = true;
      document.body.classList.remove('admin-drawer-open');
      setAdminDrawerBackground(false);
      ['agFilters', 'agBulkWrap'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.inert = false;
      });
      var register = document.querySelector('.admin-order-register');
      if (register) register.inert = false;
      drawList();
      if (closedOrderId) {
        var returnRow = document.querySelector('.ag-row[data-id="' + closedOrderId + '"]');
        if (returnRow) {
          try { returnRow.focus({ preventScroll: true }); } catch (err) {}
        }
      }
      return;
    }

    var externalAdminLink = t.closest('a.ag-tab[href]:not([data-tab])');
    if (externalAdminLink) return;
    var contentTopic = t.closest('[data-content-topic]');
    if (contentTopic) {
      st.contentTopic = contentTopic.getAttribute('data-content-topic') || 'all';
      drawBody();
      return;
    }
    var tab = t.closest('.ag-tab');
    if (tab) {
      document.body.classList.remove('admin-nav-expanded');
      setAdminNavBackground(false);
      var mobileMenu = root.querySelector('[data-admin-mobile-menu]');
      if (mobileMenu) mobileMenu.setAttribute('aria-expanded', 'false');
      var nextTab = tab.getAttribute('data-tab');
      if (nextTab === 'orders') { st.sel = null; st.card = null; }
      goTab(nextTab, nextTab !== 'orders');
      return;
    }
    if (t.closest('#agLive')) { goTab('visits'); return; }
    var tabGo = t.closest('[data-tab-go]');
    if (tabGo) { goTab(tabGo.getAttribute('data-tab-go')); return; }

    var summaryJump = t.closest('[data-summary-jump]');
    if (summaryJump) {
      var target = document.getElementById(summaryJump.getAttribute('data-summary-jump'));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    var go = t.closest('[data-go]');
    if (go) {
      var f = go.getAttribute('data-go');
      if (f === '@reviews') { goTab('reviews', true); }
      else if (f === '@qa') { goTab('qa', true); }
      else if (f === '@visits') { goTab('visits', true); }
      else { st.filter = f; st.q = ''; st.sel = null; goTab('orders', true); }
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
      if (ga > 50000) { toast('Номинал — до 50 000 ₽'); return; }
      if (ga % 500) { toast('Номинал кратен 500 ₽'); return; }
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
        confirmDlg({ title: 'Продлить срок на 90 дней?', text: 'Код будет действовать на 90 дней дольше. Новую дату покажем после продления.', okLabel: 'Продлить', noLabel: 'Отмена' })
          .then(function (res) { if (res.ok) giftAction(gaid, 'extend', { days: 90 }, 'Продлён на 90 дней'); });
      } else if (ga2 === 'adjust') {
        confirmDlg({ title: 'Корректировка остатка', text: 'Введите сумму со знаком: «500» — добавить, «−500» — списать (возврат сгоревшего, компенсация, ручное погашение).', input: 'text', placeholder: 'например 500 или -500', okLabel: 'Применить', noLabel: 'Отмена' })
          .then(function (res) {
            if (!res.ok) return;
            var d = parseInt(String(res.value || '').replace('−', '-').replace(/\s/g, ''), 10);
            if (!d) { toast('Нужно число со знаком'); return; }
            giftAction(gaid, 'adjust', { delta: d, note: 'корректировка из админки' }, 'Остаток обновлён');
          });
      } else if (ga2 === 'resend') {
        confirmDlg({ title: 'Переслать письма заново?', text: 'Получателю и покупателю (если есть адреса) повторно уйдёт код сертификата.', okLabel: 'Отправить', noLabel: 'Отмена' })
          .then(function (res) { if (res.ok) giftAction(gaid, 'resend', {}, 'Письма отправлены заново'); });
      }
      return;
    }
    var gcopy = t.closest('[data-gift-copy]');
    if (gcopy) { copyText(gcopy.getAttribute('data-gift-copy'), 'Код скопирован'); return; }
    var glink = t.closest('[data-gift-copy-link]');
    if (glink) {
      var lc = glink.getAttribute('data-gift-copy-link');
      copyText('https://akademsalon.ru/gift.html?code=' + encodeURIComponent(lc), 'Ссылка на активацию скопирована');
      return;
    }
    var gfl = t.closest('[data-gift-filter]');
    if (gfl) { st.gfilter = gfl.getAttribute('data-gift-filter'); st.gq = ''; drawBody(); return; }
    if (t.closest('#agGfClear, [data-gift-clear]')) { st.gq = ''; st.gfilter = ''; drawBody(); return; }
    var cpy = t.closest('[data-copy]');
    if (cpy) { copyText(cpy.getAttribute('data-copy'), 'Скопировано'); return; }

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
    var vg = t.closest('[data-vgeo]');
    if (vg) {
      var gc = vg.getAttribute('data-vgeo');
      st.vgeo = (st.vgeo === gc) ? null : gc;   /* повторный клик — снять фильтр */
      drawVisits(true);
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
    if (bclr) { bulkApply({ color: bclr.getAttribute('data-bulk-clr') }, true); return; }
    var bact = t.closest('[data-bulk]');
    if (bact) {
      var bAct = bact.getAttribute('data-bulk');
      if (bAct === 'off') { st.bulk = null; drawFilters(); drawList(); return; }
      if (bAct === 'pin') bulkApply({ pin: 1 }, true);
      else if (bAct === 'unpin') bulkApply({ pin: 0 }, true);
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
          if (!r.ok) { toast(errSay(r.error)); return; }
          toast('Подписка активирована — клиент уведомлён');
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
          if (!r.ok) { toast(errSay(r.error)); return; }
          toast('Оформление закрыто');
          loadSubs(); refreshSilent();
        });
      });
      return;
    }
    var oo = t.closest('[data-open-order]');
    if (oo) {
      st.tab = 'orders'; st.filter = ''; st.q = '';
      st.sel = parseInt(oo.getAttribute('data-open-order'), 10);
      /* Открыть карточку мало: мастер всё равно ищет глазами тот блок,
         из-за которого дело попало в очередь. Очередь знает, какой это
         блок, и говорит карточке, куда встать. */
      st.cardFocus = oo.getAttribute('data-focus') || '';
      drawNav(); loadTab(); return;
    }
    var oc = t.closest('[data-open-client]');
    if (oc) { st.tab = 'clients'; st.csel = parseInt(oc.getAttribute('data-open-client'), 10); drawNav(); loadTab(); return; }
    var ic = t.closest('[data-imp-client]');
    if (ic) {
      /* «тихий» вход в кабинет клиента: новая вкладка, сессия только там */
      var icid = parseInt(ic.getAttribute('data-imp-client'), 10);
      var impWindow = null;
      try {
        impWindow = window.open('about:blank', '_blank');
        if (impWindow) impWindow.opener = null;
      } catch (e) {}
      ic.disabled = true;
      api('/admin/clients/' + icid + '/impersonate', {}).then(function (r) {
        ic.disabled = false;
        if (r.ok && r.url) {
          if (impWindow) impWindow.location.replace(r.url);
          else {
            var fallbackWindow = window.open(r.url, '_blank', 'noopener');
            if (!fallbackWindow) {
              copyText(r.url, 'Ссылка входа скопирована');
              toast('Браузер заблокировал вкладку — ссылка входа скопирована');
            }
          }
        } else {
          if (impWindow) impWindow.close();
          toast(errSay(r.error, 'Кабинет клиента не открылся. Повторите попытку.'), 'error');
        }
      });
      return;
    }

    var row = t.closest('.ag-row[data-id]');
    if (row) {
      var rid = parseInt(row.getAttribute('data-id'), 10);
      if (st.bulk) {
        /* режим выбора: клик по строке (и по галке) — выбор, а не открытие */
        if (st.bulk.has(rid)) st.bulk.delete(rid); else st.bulk.add(rid);
        drawList();
        return;
      }
      loadCard(rid);
      return;
    }
    var crow = t.closest('.ag-row[data-cid]');
    if (crow) { loadClient(parseInt(crow.getAttribute('data-cid'), 10)); return; }

    if (t.closest('[data-client-back]')) {
      var returnClientId = st.csel;
      st.csel = null;
      st.ccard = null;
      st.clientRequestSeq++;
      document.body.classList.remove('admin-client-selected');
      drawBody();
      var returnClient = document.querySelector('.ag-row[data-cid="' + returnClientId + '"]');
      if (returnClient) {
        try { returnClient.focus({ preventScroll: true }); } catch (err) {}
      }
      return;
    }

    if (t.closest('#agClientsExport')) { exportClientsCsv(); return; }
    if (t.closest('#agOrdersReset')) {
      st.filter = '';
      st.q = '';
      st.sort = 'fresh';
      st.listLimit = 40;
      loadTab();
      return;
    }
    var chip = t.closest('.ag-chip[data-f]');
    if (chip) { st.filter = chip.getAttribute('data-f'); st.listLimit = 40; loadTab(); return; }
    if (t.closest('#agMore')) { st.listLimit += 40; drawList(); return; }
    if (t.closest('#agQClear')) { st.q = ''; st.listLimit = 40; loadTab(); return; }
    if (t.closest('#agCQClear')) { st.cq = ''; drawBody(); return; }
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
          .then(function (r) { afterOrder(r, 'Пауза снята — клиент уведомлён'); });
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
          .then(function (r) { afterOrder(r, 'Дело на паузе — клиент уведомлён'); });
      });
      return;
    }

    /* --- карточка дела --- */
    if (t.closest('#wzOpen')) { wzOpen(); return; }
    if (t.closest('#agOffNew')) {
      st.offnew = !st.offnew;
      drawCard();
      return;
    }
    var offCat = t.closest('[data-off-cat]');
    if (offCat) {
      var cats = document.querySelectorAll('#agEst [data-off-cat]');
      Array.prototype.forEach.call(cats, function (b) {
        var on = b === offCat;
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      offCatalogFilter();
      return;
    }
    if (t.closest('#agOffSearchClear')) {
      var search = document.getElementById('agOffSearch');
      if (search) { search.value = ''; search.focus(); }
      offCatalogFilter();
      return;
    }
    if (t.closest('#agOffCustom')) {
      var customTa = document.getElementById('agOffLedger');
      if (!customTa) return;
      customTa.value += (customTa.value.trim() ? '\n' : '') + 'Новая позиция | 0';
      offRowsRender(); offSumRender(); offCatalogState();
      var customTitles = document.querySelectorAll('#agOffRows [data-off-row-title]');
      var customLast = customTitles[customTitles.length - 1];
      if (customLast) { customLast.focus(); customLast.select(); }
      return;
    }
    var offRm = t.closest('[data-off-row-rm]');
    if (offRm) {
      var rmIndex = parseInt(offRm.getAttribute('data-off-row-rm'), 10);
      var rmTa = document.getElementById('agOffLedger');
      if (!rmTa) return;
      var rmRows = t2ledger(rmTa.value);
      rmRows.splice(rmIndex, 1);
      rmTa.value = rmRows.map(function (r) { return r.t + ' | ' + r.a; }).join('\n');
      offRowsRender(); offSumRender(); offCatalogState();
      return;
    }
    var offChipBtn = t.closest('[data-off-add]');
    if (offChipBtn) { offChipAdd(offChipBtn); return; }

    if (t.closest('#agOffCopy') || t.closest('#agOffMsg')) {
      var oc = st.card && st.card.offer;
      if (!oc) return;
      var payload = t.closest('#agOffMsg')
        ? ((st.card.offer.greet_name || 'Здравствуйте') + ', собрал заявку по вашей работе. ' +
           'Там весь план с датами, что входит и цена — заполнять ничего не надо, только ' +
           'посмотреть. Если всё верно, внизу кнопка оплаты.\n' + oc.url)
        : oc.url;
      try { navigator.clipboard.writeText(payload); toast('Скопировано'); }
      catch (e) { toast('Скопируйте вручную из поля'); }
      return;
    }

    if (t.closest('#agClaimCopy')) {
      var cu = (st.card && st.card.claim_url) || (document.getElementById('agClaimUrl') || {}).value || '';
      if (!cu) return;
      try { navigator.clipboard.writeText(cu); toast('Ссылка клиента в буфере — продублируйте её в переписку'); }
      catch (e) { toast('Скопируйте вручную из поля'); }
      return;
    }

    if (t.closest('#agRouteCopy')) {
      var co = st.card || {};
      var nm = (co.client && co.client.name) || 'Здравствуйте';
      var routeText = nm + ', ваш заказ ' + (co.no || ('№' + co.id)) +
        ' «' + (co.work_label || 'работа') + '» уже в системе.\n' +
        'Откройте секретную ссылку на кабинет сайта:\n' + (co.claim_url || '') +
        '\n\nЕсли нужны уведомления в Telegram, в кабинете нажмите «Привязать Telegram безопасно» ' +
        'и подтвердите одноразовый вход в боте. Сам ключ дела в Telegram не передаётся.';
      try { navigator.clipboard.writeText(routeText); toast('Сообщение для клиента скопировано'); }
      catch (e) { toast('Не скопировалось — откройте ссылки вручную'); }
      return;
    }

    if (t.closest('#agTgSync')) {
      var sb = t.closest('#agTgSync');
      sb.disabled = true;
      api('/admin/orders/' + st.sel + '/sync_tg', {}).then(function (r) {
        sb.disabled = false;
        if (r && r.ok) toast('Актуальная карточка отправлена клиенту в Telegram');
        else toast(r && r.error === 'telegram_not_linked'
          ? 'Клиент ещё не запускал бота — скопируйте ему приглашение'
          : 'Telegram недоступен; кабинет сайта продолжает работать');
      });
      return;
    }

    if (t.closest('#agOffMailOn')) {
      var mto = st.card && st.card.offer && st.card.offer.notify_to;
      confirmDlg({
        title: 'Включить письма клиенту?',
        text: 'Адрес: ' + (mto || '—') + '. Сверьте его с перепиской: в письмах будет ссылка доступа к делу, ' +
              'и подменённый на оплате адрес получил бы ключ. После включения клиенту начнут уходить счета, готовность частей и сообщения.',
        okLabel: 'Адрес верный — включить', noLabel: 'Отмена'
      }).then(function (res) {
        if (!res.ok) return;
        api('/admin/offers/' + st.card.offer.id + '/mail_on', {}).then(function (r) {
          if (!r || !r.ok) {
            toast(errSay(r && r.error));
            return;
          }
          toast('Письма включены на ' + (r.contact || mto));
          loadCard(st.sel);
        });
      });
      return;
    }

    if (t.closest('#agOffCancel')) {
      confirmDlg({
        title: 'Отозвать ссылку?',
        text: 'Клиент увидит понятное «заявка отозвана» и предложение написать вам. ' +
              'Дело и цена останутся на месте.',
        okLabel: 'Отозвать', noLabel: 'Отмена', danger: true
      }).then(function (res) {
        if (!res.ok) return;
        api('/admin/offers/' + st.card.offer.id + '/cancel', {})
          .then(function (r) { afterOrder(r, 'Ссылка отозвана'); });
      });
      return;
    }

    if (t.closest('#agOffBuild')) {
      var price = parseInt((document.getElementById('agPrice') || {}).value, 10)
                  || (st.card && st.card.price) || 0;
      if (!price || price <= 0) { toast('Сначала укажите цену в блоке выше'); return; }
      var offerLedger = t2ledger((document.getElementById('agOffLedger') || {}).value);
      var existingSpecLines = (st.card && st.card.offer && (
        st.card.offer.specification_lines ||
        (st.card.offer.specification && st.card.offer.specification.lines))) || [];
      var sourceSpecLines = existingSpecLines.length
        ? existingSpecLines : ((st.card && st.card.items) || []);
      offerLedger = offerLedger.map(function (line, i) {
        var old = sourceSpecLines[i] || {};
        var merged = {};
        Object.keys(old).forEach(function (key) { merged[key] = old[key]; });
        merged.t = line.t;
        merged.a = line.a;
        merged.label = line.t;
        merged.final_price = line.a;
        return merged;
      });
      var specCfg = specificationDefaultsFromForm(st.card && st.card.offer);
      specCfg.service_id = (st.card && st.card.work_type) || '';
      specCfg.deadline_text = (st.card && st.card.deadline_text) || '';
      specCfg.deadline_date = (st.card && st.card.deadline_date) || '';
      var offerSpecLines = buildSpecificationLines(offerLedger, specCfg);
      var incompleteA2 = offerSpecLines.some(function (line) {
        if (line.contract_contour !== 'A' || line.academic_submode !== 'A2') return false;
        var participation = line.author_participation || {};
        return participation.confirmed !== true ||
          !Array.isArray(participation.customer_decisions_and_data) ||
          !participation.customer_decisions_and_data.length;
      });
      if (incompleteA2) {
        toast('Для A2 отметьте подтверждение участия и перечислите согласованные решения или реальные данные Заказчика');
        return;
      }
      if (offerSpecLines.some(function (line) { return !rightsLineReady(line); })) {
        toast('Для B1/B2 подтвердите автора и основание прав; для B2 укажите каждого творческого автора и ссылку на его письменное согласие');
        return;
      }
      var prepay = parseInt((document.getElementById('agPrepay') || {}).value, 10);
      var stages = parseInt((document.getElementById('agPlanSel') || {}).value, 10);
      var was = st.card && st.card.offer;
      confirmDlg({
        title: (was ? 'Пересобрать заявку № ' : 'Собрать заявку № ') + st.sel + '?',
        text: 'Появится ссылка для клиента. ' +
              (was ? 'Старая ссылка перестанет действовать и будет уводить на новую. ' : '') +
              'Дело ни к кому не привяжется, пока по нему не заплатят. ' +
              'Никаких уведомлений сейчас никому не уйдёт.',
        okLabel: was ? 'Пересобрать' : 'Собрать', noLabel: 'Отмена'
      }).then(function (res) {
        if (!res.ok) return;
        api('/admin/offers', {
          order_id: st.sel, price: price,
          prepay: prepay || undefined, stages: stages || undefined,
          greet_name: (document.getElementById('agOffName') || {}).value || '',
          intro: (document.getElementById('agOffIntro') || {}).value || '',
          volume: (document.getElementById('agOffVolume') || {}).value || '',
          tier_label: (document.getElementById('agOffTier') || {}).value || '',
          reqs_short: (document.getElementById('agOffReq') || {}).value || '',
          reqs_full: (document.getElementById('agOffReqFull') || {}).value || '',
          tier_full: (document.getElementById('agOffTierFull') || {}).value || '',
          need_files: (document.getElementById('agOffFiles') || {}).checked ? 1 : 0,
          incl: t2incl((document.getElementById('agOffIncl') || {}).value),
          /* ledger остаётся совместимым: t/a читаются старым рендерером,
             новые поля едут в тех же строках и отдельном v2-контейнере. */
          ledger: offerSpecLines,
          specification_lines: offerSpecLines,
          specification: { version: 2, document_mode: 'single_order_multi_line', lines: offerSpecLines },
          contract_contour: specCfg.contract_contour,
          permitted_purpose: specCfg.permitted_purpose,
          rail: t2rail((document.getElementById('agOffRail') || {}).value),
          ttl_days: parseInt((document.getElementById('agOffTtl') || {}).value, 10) || 14
        }).then(function (r) {
          if (!r || !r.ok) {
            var OFF_ERR = {
              order_has_owner: 'У дела уже есть владелец — ссылку выписать нельзя',
              already_paid: 'По делу уже была оплата — условия зафиксированы, пересборка недоступна',
              claimed_pending: 'Клиент отметил перевод — сперва подтвердите оплату («Получена») или снимите отметку в TG-алерте',
              bad_price: 'Цена не распознана — проверьте цифру в блоке «Цена и план оплаты»'
            };
            toast(OFF_ERR[r && r.error] || errSay(r && r.error));
            return;
          }
          st.offnew = false;
          try { navigator.clipboard.writeText(r.url); } catch (e) {}
          toast('Заявка собрана · ссылка в буфере');
          afterOrder(r, null);
        });
      });
      return;
    }

    if (t.closest('#agPriceSend')) {
      var price = parseInt((document.getElementById('agPrice') || {}).value, 10);
      var prepay = parseInt((document.getElementById('agPrepay') || {}).value, 10);
      var stages = parseInt((document.getElementById('agPlanSel') || {}).value, 10);
      if (!price || price <= 0) { toast('Введите цену'); return; }
      var priceSpecLines = specificationLinesForPrice(st.card || {}, price);
      if (priceSpecLines.some(function (line) { return !rightsLineReady(line); })) {
        toast('Для B1/B2 сначала заполните доказательства прав в форме персональной заявки');
        return;
      }
      api('/admin/orders/' + st.sel + '/price', {
        price:price, prepay:prepay || undefined, stages:stages || undefined,
        specification_lines:priceSpecLines,
        specification:{ version:2, document_mode:'single_order_multi_line', lines:priceSpecLines }
      }).then(function (r) {
        if (!r || !r.ok) {
          var detail = r && r.detail ? ' · ' + r.detail : '';
          toast('Не удалось выпустить спецификацию' + detail);
          return;
        }
        afterOrder(r, 'Предложение и спецификация ушли клиенту');
      });
      return;
    }
    var payBtn = t.closest('[data-pay-kind]');
    if (payBtn) {
      var kind = payBtn.getAttribute('data-pay-kind');
      var amount = parseInt(payBtn.getAttribute('data-pay-amount'), 10);
      confirmDlg({
        title: 'Подтвердить оплату ' + money(amount) + ' ₽?',
        text: 'Сверьте поступление С ТОЧНОСТЬЮ ДО СУММЫ: этап закроется на ' + money(amount) +
              ' ₽. Пришло меньше или больше — сначала договоритесь с клиентом (доплата или возврат разницы), потом подтверждайте. ' +
              'Подтверждение двинет заказ и начислит клиенту кэшбэк — отменить будет нельзя.',
        okLabel: 'Пришло ровно ' + money(amount) + ' ₽ — подтвердить', noLabel: 'Отмена'
      }).then(function (res) {
        if (!res.ok) return;
        api('/admin/orders/' + st.sel + '/confirm_payment', { kind: kind, amount: amount })
          .then(function (r) { afterOrder(r, 'Оплата подтверждена'); if (r.ok && S.stamp) S.stamp('Оплачено'); });
      });
      return;
    }
    var stb = t.closest('.ag-stbtn');
    if (stb) {
      var stTo = stb.getAttribute('data-st');
      /* ручной check/done обходит механику передачи: клиент получит запрос
         приёмки без файла или закрытие мимо плана оплат */
      if (stTo === 'check' || stTo === 'done') {
        confirmDlg({
          title: stTo === 'check' ? 'Перевести в «На проверке» вручную?' : 'Завершить дело вручную?',
          text: stTo === 'check'
            ? 'Клиент получит запрос проверить результат с кнопками приёмки. Если файл ещё не передан, он увидит пустую проверку. Для передачи файла с придержкой до оплаты пользуйтесь блоком «Передача и приёмка результата».'
            : 'Дело закроется мимо плана оплат и приёмки. Обычно завершение происходит само: клиент принимает финал после полной оплаты. Продолжайте, только если понимаете, зачем.',
          okLabel: 'Всё равно перевести', noLabel: 'Отмена', danger: true
        }).then(function (res) {
          if (!res.ok) return;
          api('/admin/orders/' + st.sel + '/status', { status: stTo })
            .then(function (r) { afterOrder(r, 'Статус обновлён — клиент уведомлён'); });
        });
        return;
      }
      api('/admin/orders/' + st.sel + '/status', { status: stTo })
        .then(function (r) { afterOrder(r, 'Статус обновлён — клиент уведомлён'); });
      return;
    }
    if (t.closest('#agFixAck')) {
      api('/admin/orders/' + st.sel + '/fix_ack', {}).then(function (r) {
        if (r && !r.ok && r.error === 'already') { toast('Клиенту уже сообщали — после нового запроса правок кнопка оживёт'); return; }
        afterOrder(r, r && r.ok ? 'Клиенту сообщено: правки в работе' : null);
        if (r && !r.ok) toast(errSay(r.error));
      });
      return;
    }
    if (t.closest('#agFinalReady')) {
      confirmDlg({
        title: 'Финальный результат подготовлен — выставить счёт на остаток?',
        text: 'Клиент получит уведомление: финальный пакет результата подготовлен и передаётся после закрытия остатка. ' +
              'Файл пока не отправляйте — после подтверждения оплаты придёт напоминание передать.',
        okLabel: 'Выставить счёт', noLabel: 'Отмена'
      }).then(function (res) {
        if (!res.ok) return;
        api('/admin/orders/' + st.sel + '/final_ready', {})
          .then(function (r) { afterOrder(r, r.ok ? 'Счёт на остаток ушёл клиенту' : null); });
      });
      return;
    }
    if (t.closest('#agPartReady')) {
      var prPart = (st.card && st.card.stage) || 1;
      confirmDlg({
        title: 'Результат части ' + prPart + ' подготовлен — выставить счёт этапа?',
        text: 'Клиент получит уведомление: результат части подготовлен и передаётся после оплаты этапа (с подписью «оплата части ' + prPart + '»). ' +
              'Файл пока не отправляйте — как подтвердите оплату, придёт напоминание передать.',
        okLabel: 'Выставить счёт', noLabel: 'Отмена'
      }).then(function (res) {
        if (!res.ok) return;
        api('/admin/orders/' + st.sel + '/part_ready', {})
          .then(function (r) {
            if (r.ok && r.paid_already) { afterOrder(r, 'Этап уже оплачен — просто передайте часть файлом'); return; }
            afterOrder(r, r.ok ? 'Счёт за часть ушёл клиенту — файл придержите' : null);
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
      if (btxt2.length > 4096) { toast('Слишком длинно для Telegram (лимит 4096 знаков)'); return; }
      var cntRaw = ((document.getElementById('agBCount') || {}).textContent || '');
      var cnt = cntRaw.replace(/\D/g, '');
      if (!/получателей/.test(cntRaw) || cnt === '') { toast('Ещё считаем получателей — секунду'); return; }
      if (cnt === '0') { toast('В этом сегменте сейчас никого нет'); return; }
      confirmDlg({
        title: 'Запустить рассылку на ' + cnt + ' получателей?',
        text: 'Сообщение уйдёт сразу и отозвать его будет нельзя. Лучше сначала «Отправить себе» и перечитать.',
        okLabel: 'Отправить всем', noLabel: 'Отмена', danger: true
      }).then(function (res) {
        if (!res.ok) return;
        api('/admin/broadcast', { text: btxt2.trim(), segment: seg2 })
          .then(function (r) {
            if (!r.ok) { toast(r.error === 'busy' ? 'Предыдущая рассылка ещё идёт' : 'Не получилось'); return; }
            toast('Рассылка пошла — статус ниже');
            bcastStatus({ running: true, sent: 0, total: r.total, failed: 0 });
          });
      });
      return;
    }
    if (t.closest('#agDeliverMark')) {
      confirmDlg({
        title: 'Зафиксировать передачу результата?',
        text: 'Клиент получит кнопки «принять результат / нужна корректировка». Используйте, если файлы уже отправили ему раньше (в группе или в боте).',
        okLabel: 'Передать на проверку', noLabel: 'Отмена'
      }).then(function (res) {
        if (!res.ok) return;
        api('/admin/orders/' + st.sel + '/deliver', {})
          .then(function (r) {
            if (!r.ok && r.error === 'stage_unpaid') {
              unpaidDialog(r, true, function () {
                api('/admin/orders/' + st.sel + '/deliver', { force: true })
                  .then(function (r2) { afterOrder(r2, 'Передача результата зафиксирована (без оплаты — в хронике)'); });
              });
              return;
            }
            afterOrder(r, 'На проверке у клиента');
          });
      });
      return;
    }
    var remindBtn = t.closest('[data-remind-pay]');
    if (remindBtn) {
      api('/admin/orders/' + st.sel + '/remind_pay', {})
        .then(function (r) {
          if (!r.ok) {
            toast({ claimed: 'Клиент отметил оплату — сверьте и подтвердите «Получена»',
                    nothing_due: 'Платить нечего — созревших неоплаченных этапов нет',
                    paused: 'Дело на паузе — сначала снимите паузу',
                    busy: 'Секунду…' }[r.error] || 'Не получилось');
            return;
          }
          var where = r.delivered_tg ? 'в Telegram' + (r.mailed ? ' и на почту' : '')
            : (r.mailed ? 'на почту' : 'в кабинет (там счёт и так виден)');
          afterOrder(r, 'Напоминание ' + money(r.due) + ' ₽ ушло ' + where);
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
        .then(function (r) { afterOrder(r, 'Заказ возобновлён — клиент получил предложение'); });
      return;
    }
    var arch = t.closest('#agArch');
    if (arch) {
      api('/admin/orders/' + st.sel + '/archive', { on: arch.getAttribute('data-on') === '1' })
        .then(function (r) { afterOrder(r, arch.getAttribute('data-on') === '1' ? 'Убрано в архив' : 'Возвращено из архива'); });
      return;
    }
    if (t.closest('#agMsgSend')) {
      var ta = document.getElementById('agMsg');
      var txt = (ta.value || '').trim();
      if (!txt) return;
      api('/admin/orders/' + st.sel + '/message', { text: txt })
        .then(function (r) {
          if (r.ok) { toast(r.delivered_tg ? 'Доставлено в Telegram' : 'Сохранено — клиент увидит в кабинете'); st.card = r.order; st.feedStick = true; drawCard(); }
          else toast('Не отправилось');
        });
      return;
    }
    if (t.closest('#agNoteSave')) {
      /* локальное состояние обновляем сразу: любое событие клиента перерисует
         карточку раньше следующей загрузки — и вернуло бы старый текст */
      var noteText = (document.getElementById('agNote') || {}).value || '';
      var noteOrder = st.sel;
      api('/admin/orders/' + noteOrder + '/note', { text: noteText })
        .then(function (r) {
          if (!r.ok) { toast(errSay(r.error, 'Заметка не сохранилась.')); return; }
          if (st.card && st.card.id === noteOrder) st.card.admin_note = noteText;
          if (r.order) st.card = r.order;
          toast('Заметка сохранена ');
        });
      return;
    }
    if (t.closest('#agReqSave')) {
      var reqText = (document.getElementById('agReq') || {}).value || '';
      api('/admin/requisites', { text: reqText })
        .then(function (r) {
          if (!r.ok) { toast(errSay(r.error, 'Реквизиты не сохранились.')); return; }
          st.ov = st.ov || {};
          st.ov.requisites = reqText;
          toast('Реквизиты сохранены');
        });
      return;
    }
    if (t.closest('#agSlotsSave')) {
      var qv = parseInt((document.getElementById('agSlots') || {}).value || '0', 10) || 0;
      api('/admin/slots', { quota: qv }).then(function (r) {
        if (!r.ok) { toast('Не получилось'); return; }
        slotsApply(r);
        toast(r.quota ? 'Квота ' + r.quota + ' мест — плашка на сайте живёт' : 'Набор месяца скрыт');
      });
      return;
    }
    var se = t.closest('[data-slot-extra]');
    if (se) {
      var sd = parseInt(se.getAttribute('data-slot-extra'), 10) || 0;
      var cur = (st.ov && st.ov.slots && st.ov.slots.extra) || 0;
      api('/admin/slots', { extra: Math.max(0, cur + sd) }).then(function (r) {
        if (!r.ok) { toast('Не получилось'); return; }
        slotsApply(r);
        toast(sd > 0
          ? (r.quota ? 'Бронь отмечена — на сайте стало на место меньше' : 'Бронь отмечена. Квота 0 — плашка скрыта!')
          : 'Бронь снята — место снова свободно');
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
            ? (r.maintenance.site ? 'Сайт закрыт на техработы' : 'Сайт снова открыт')
            : (r.maintenance.bot ? 'Бот на антракте' : 'Бот снова отвечает'));
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
        publish: 'Опубликовано в приёмной', answer_quiet: 'Ответ ушёл письмом',
        save: 'Сохранено', reject: 'Отклонён', unpublish: 'Снят с сайта',
        pin: 'Закреплён сверху', unpin: 'Откреплён', delete: 'Удалён навсегда',
        ban: 'Автор заблокирован — его вопросы больше не попадут в очередь'
      };
      var goQA = function () {
        api('/admin/qa/' + qid, qpayload).then(function (r) {
          if (!r || !r.ok) { toast('Не получилось — попробуйте ещё раз'); return; }
          if (st.qaDrafts) delete st.qaDrafts[qid];   /* этот набросок сохранён — не тащим его дальше */
          /* и синхронизируем кэш, иначе синхронный snapshotQaDrafts в loadQA сравнит
             сохранённый текст со СТАРЫМ значением и снова пометит «черновик не сохранён» */
          var qo = (st.qa || []).filter(function (x) { return String(x.id) === String(qid); })[0];
          if (qo) { if ('answer' in qpayload) qo.answer = qpayload.answer; if ('question' in qpayload) qo.question = qpayload.question; }
          toast(qaDone[qact] || 'Готово');
          loadQA();
          S.api.get('/admin/overview').then(function (r2) { if (r2.ok) { st.ov = r2; drawNav(); } });
        });
      };
      if (qact === 'delete' || qact === 'ban') {
        var qObj = (st.qa || []).filter(function (x) { return String(x.id) === String(qid); })[0];
        var banText = (qObj && qObj.status === 'pending')
          ? 'Новые вопросы с этого браузера и IP молча перестанут попадать в приёмную. Текущий вопрос будет отклонён.'
          : 'Новые вопросы с этого браузера и IP молча перестанут попадать в приёмную. Уже опубликованная пара останется на сайте — блокируется только автор от новых вопросов.';
        confirmDlg({
          title: qact === 'delete' ? 'Удалить пару навсегда?' : 'Заблокировать автора вопроса?',
          text: qact === 'delete'
            ? 'Вопрос и ответ исчезнут с сайта и из очереди. Действие необратимо.'
            : banText,
          okLabel: qact === 'delete' ? 'Удалить' : 'Заблокировать', noLabel: 'Отмена', danger: true
        }).then(function (okd) { if (okd && okd.ok) goQA(); });
      } else goQA();
      return;
    }
    /* --- отзывы --- */
    var rv = t.closest('[data-rv]');
    if (rv) {
      var ok = rv.getAttribute('data-ok') === '1';
      var rvCardEl = rv.closest('[data-rv-st]');
      var wasLive = rvCardEl && rvCardEl.getAttribute('data-rv-st') === 'approved';
      var doMod = function () {
        api('/admin/reviews/' + rv.getAttribute('data-rv') + '/moderate', { approve: ok })
          .then(function (r) {
            if (!r.ok) { toast('Не получилось'); return; }
            toast(ok ? 'Опубликован на сайте' : 'Снят с сайта');
            loadTab();
            S.api.get('/admin/overview').then(function (r2) { if (r2.ok) { st.ov = r2; drawNav(); } });
          });
      };
      /* снять уже опубликованный отзыв — публичное действие, спрашиваем; отклонить
         ещё не опубликованный ничего публичного не меняет — делаем сразу */
      if (!ok && wasLive) {
        confirmDlg({
          title: 'Снять отзыв с сайта?',
          text: 'Отзыв перестанет показываться в «Книге отзывов». Вернуть можно повторной публикацией.',
          okLabel: 'Снять', noLabel: 'Отмена', danger: true
        }).then(function (res) { if (res.ok) doMod(); });
      } else doMod();
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
          .then(function (r) { if (r.ok) { toast(on ? 'Заблокирован' : 'Разблокирован'); loadClient(st.csel); loadTab(); } });
      });
      return;
    }
  });

  root.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'agOffAsAdd') return;
    if (e.target && e.target.id === 'agOffContour') {
      var contour = e.target.value;
      var author = document.getElementById('agOffActualAuthor');
      var rightsMode = document.getElementById('agOffRightsMode');
      var evidence = document.getElementById('agOffRightsEvidence');
      var profiles = document.getElementById('agOffPerformers');
      var confirmation = document.getElementById('agOffRightsConfirmed');
      if (contour === 'B1') {
        if (author) author.value = SPEC_EXECUTOR_NAME;
        if (rightsMode) rightsMode.value = 'Лицензия в пределах согласованных способов использования';
        if (evidence && !evidence.value.trim()) evidence.value = 'эта редакция Спецификации';
        if (profiles) profiles.value = '';
        if (confirmation) confirmation.checked = false;
      } else if (contour === 'B2') {
        if (author && author.value.trim() === SPEC_EXECUTOR_NAME) author.value = '';
        if (rightsMode) rightsMode.value = 'Отчуждение исключительного права после полной оплаты';
        if (evidence && evidence.value.trim() === 'эта редакция Спецификации') evidence.value = '';
        if (confirmation) confirmation.checked = false;
      }
      return;
    }
    if (e.target && e.target.id === 'agBSeg') { bcastRefresh(); return; }
    if (e.target && e.target.id === 'agSort') { st.sort = e.target.value; drawList(); return; }
    if (e.target && e.target.id === 'agCSort') { st.csort = e.target.value; drawClientList(); return; }
    if (e.target && e.target.id === 'agCQ') { st.cq = e.target.value; drawClientList(); return; }
    if (e.target && e.target.id === 'agGfState') { st.gfilter = e.target.value; drawBody(); return; }
    if (e.target && e.target.id === 'agGfQ') { st.gq = e.target.value; drawBody(); return; }
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

  /* запоминаем, раскрыт ли блок «ещё разрезы» — иначе живое обновление визитов
     (каждые 12с перерисовывает #agVAnalytics) захлопывает его на середине чтения.
     toggle не всплывает — слушаем в фазе перехвата */
  root.addEventListener('toggle', function (e) {
    if (e.target && e.target.classList && e.target.classList.contains('an-more')) st.vanmore = e.target.open;
  }, true);

  /* живые реакции на ввод: поиск по клиентам и счётчик длины рассылки */
  root.addEventListener('input', function (e) {
    /* живой итог конструктора заявки: смета и цена дела сверяются на лету */
    if (e.target && e.target.id === 'agOffSearch') { offCatalogFilter(); return; }
    if (e.target && (e.target.hasAttribute('data-off-row-title') || e.target.hasAttribute('data-off-row-price'))) {
      offRowsSync(); return;
    }
    if (e.target && e.target.id === 'agOffLedger') {
      offSumRender(); offRowsRender(); offCatalogState(); return;
    }
    if (e.target && e.target.id === 'agOffIncl') { offCatalogState(); return; }
    if (e.target && e.target.id === 'agPrice') offSumRender();
    if (e.target && e.target.id === 'agCQ') {
      st.cq = e.target.value; drawClientList();
      var cc = document.getElementById('agCQClear'); if (cc) cc.hidden = !st.cq;   /* держим × в такт вводу */
      return;
    }
    if (e.target && e.target.id === 'agContentQ') {
      st.contentQ = e.target.value;
      drawContentRows();
      return;
    }
    if (e.target && e.target.id === 'agBText') {
      var cel = document.getElementById('agBCnt');
      if (cel) {
        var n = e.target.value.length;
        cel.textContent = n + ' / 4096';
        cel.style.color = n > 4096 ? 'var(--wax)' : (n > 3900 ? 'var(--wax)' : '');
      }
    }
  });

  /* одноразовый вход по ссылке из бота: admin.html#alk=<ключ> (команда /panel).
     Диплинк на дело: #alk=<ключ>&o=<id> или просто #o=<id> у вошедшего мастера —
     карточка заказа открывается сразу (кнопка «Открыть в админке» в боте). */
  function tryLinkLogin(next) {
    var h = location.hash || '';
    var mt = h.match(/^#(summary|visits|orders|clients|reviews|qa|gifts|leads|broadcast|settings|content)$/);
    if (mt && VALID_TABS[mt[1]]) st.tab = mt[1];
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
      if (r.ok && (r.session || r.token)) {
        if (r.token) S.api.setToken(r.token);
        if (r.session && S.api.setSessionHint) S.api.setSessionHint(true);
        if (S.api.setUser) S.api.setUser(r.user || null);
        toast('Вы вошли как мастер');
      } else {
        toast(r.error === 'bad_key'
          ? 'Ссылка входа устарела — запросите новую: /panel в боте'
          : 'Не получилось войти по ссылке — попробуйте /panel ещё раз');
      }
      next();
    });
  }

  root.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'k') {
      e.preventDefault();
      focusAdminSearch();
      return;
    }
    if (e.key === 'Tab') {
      var openDrawer = document.querySelector('.admin-order-drawer.is-open');
      if (openDrawer) {
        var drawerFocus = Array.prototype.filter.call(
          openDrawer.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), ' +
            'select:not([disabled]), details > summary, [tabindex]:not([tabindex="-1"])'
          ),
          function (el) {
            return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
          }
        );
        if (!drawerFocus.length) {
          e.preventDefault();
          openDrawer.focus();
          return;
        }
        var firstDrawerFocus = drawerFocus[0];
        var lastDrawerFocus = drawerFocus[drawerFocus.length - 1];
        if (!openDrawer.contains(document.activeElement) || document.activeElement === openDrawer) {
          e.preventDefault();
          (e.shiftKey ? lastDrawerFocus : firstDrawerFocus).focus();
          return;
        }
        if (e.shiftKey && document.activeElement === firstDrawerFocus) {
          e.preventDefault();
          lastDrawerFocus.focus();
          return;
        }
        if (!e.shiftKey && document.activeElement === lastDrawerFocus) {
          e.preventDefault();
          firstDrawerFocus.focus();
          return;
        }
      }
      if (document.body.classList.contains('admin-nav-expanded')) {
        var openNav = document.getElementById('agNav');
        var navFocus = openNav ? Array.prototype.filter.call(
          openNav.querySelectorAll('a[href], button:not([disabled])'),
          function (el) {
            return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
          }
        ) : [];
        if (navFocus.length) {
          var firstNavFocus = navFocus[0];
          var lastNavFocus = navFocus[navFocus.length - 1];
          if (!openNav.contains(document.activeElement)) {
            e.preventDefault();
            (e.shiftKey ? lastNavFocus : firstNavFocus).focus();
            return;
          }
          if (e.shiftKey && document.activeElement === firstNavFocus) {
            e.preventDefault();
            lastNavFocus.focus();
            return;
          }
          if (!e.shiftKey && document.activeElement === lastNavFocus) {
            e.preventDefault();
            firstNavFocus.focus();
            return;
          }
        }
      }
    }
    if (e.key === 'Escape') {
      var closeCard = document.getElementById('agCardClose');
      if (closeCard) { closeCard.click(); return; }
      if (document.body.classList.contains('admin-nav-expanded')) {
        document.body.classList.remove('admin-nav-expanded');
        setAdminNavBackground(false);
        var navToggle = root.querySelector('[data-admin-mobile-menu]');
        if (navToggle) {
          navToggle.setAttribute('aria-expanded', 'false');
          navToggle.focus();
        }
        return;
      }
    }
    if (e.target && e.target.id === 'agQ' && e.key === 'Enter') {
      st.q = e.target.value.trim();
      st.listLimit = 40;
      loadTab();
    }
    if (e.target && e.target.id === 'agCQ' && e.key === 'Enter') { drawClientList(); return; }
    if (e.target && e.target.id === 'agGfQ' && e.key === 'Enter') { st.gq = e.target.value; drawBody(); return; }
    if (e.target && e.target.id === 'agSlots' && e.key === 'Enter') {
      e.preventDefault();
      var sb = document.getElementById('agSlotsSave');
      if (sb) sb.click();
      return;
    }
    if (e.target && e.target.id === 'agMsg' && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      var btn = document.getElementById('agMsgSend');
      if (btn) btn.click();
    }
    /* стрелки перелистывают вкладки, когда фокус на регистре */
    var onTab = e.target && e.target.closest && e.target.closest('.ag-tab');
    if (onTab && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      var order = ['summary', 'orders', 'clients', 'qa', 'reviews', 'leads', 'broadcast',
        'gifts', 'visits', 'content', 'settings'];
      var i = order.indexOf(st.tab);
      if (i < 0) i = 0;
      i = (i + (e.key === 'ArrowRight' ? 1 : order.length - 1)) % order.length;
      goTab(order[i], order[i] === 'orders');
      var nt = document.querySelector('.ag-tab[data-tab="' + order[i] + '"]');
      if (nt) { try { nt.focus(); } catch (er) {} }
      return;
    }
    /* Enter/Пробел активируют «кнопочные» строки-div (визиты, очередь, события) */
    if ((e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') &&
        e.target && e.target.getAttribute && e.target.getAttribute('role') === 'button') {
      e.preventDefault();
      e.target.click();
    }
  });

  Promise.resolve(S.api.ready).then(
    function () { tryLinkLogin(gate); },
    function () { tryLinkLogin(gate); }
  );

  /* ==========================================================================
     ПОЛКА ЗАГОТОВОК — заявка в три нажатия и одну строку.
     Мастер печатает только тему работы: всё прочее считается из
     window.SalonCalc и таблиц ниже. Заготовки выведены из истории базы
     (SELECT work_type, discipline, term, tier, count(*) FROM orders GROUP BY
     1,2,3,4 — 80 дел на 21.07.2026). Пересматривать раз в квартал.
     ES5: var, конкатенация, никаких стрелок, литералов и Array.find.
     ========================================================================== */

  /* --- длительность: по ТИПУ × сроку. Одной таблицы «по сроку» мало —
     кандидатская получала бы календарь курсовой. --- */
  var WZ_DAYS = {
    diplom:   { urgent: 12, mid: 21, free: 35 },
    master:   { urgent: 18, mid: 30, free: 45 },
    chapter:  { urgent: 10, mid: 18, free: 28 },
    kandidat: { urgent: 45, mid: 75, free: 110 },
    course:   { urgent: 7,  mid: 14, free: 25 },
    course_emp:{ urgent: 10, mid: 18, free: 30 },
    practice: { urgent: 6,  mid: 12, free: 20 },
    vak:      { urgent: 10, mid: 18, free: 30 },
    scopus:   { urgent: 21, mid: 35, free: 55 },
    rinc:     { urgent: 7,  mid: 14, free: 24 },
    self:     { urgent: 4,  mid: 8,  free: 14 }
  };
  /* где «срочно» физически не бывает срочным — говорим об этом честно */
  var WZ_SLOW = { kandidat: 1, scopus: 1, master: 1 };

  var WZ_VOL = {
    diplom: '60–70 страниц', master: '80–100 страниц', chapter: '25–35 страниц',
    kandidat: '120–150 страниц, по главам', course: '30–35 страниц',
    course_emp: '35–45 страниц, с расчётами и приложениями',
    practice: '25–30 страниц, с дневником и характеристикой',
    vak: '12–16 страниц, 8–10 источников',
    scopus: '6 000–8 000 слов по требованиям журнала',
    rinc: '8–10 страниц, 6–8 источников', self: '15–20 страниц'
  };

  var WZ_DNOTE = {
    hum:  'гуманитарные, экономика',
    law:  'юриспруденция, педагогика, психология — нормативка и терминология',
    tech: 'технические, IT — расчёты и терминология',
    med:  'медицина, финансы — расчёты и точность формулировок'
  };
  var WZ_TNOTE = {
    free:   'свободный, от 30 дней',
    mid:    '14–30 дней — работа в приоритете',
    urgent: 'до 14 дней — работа вне общей очереди'
  };

  /* ЯРЛЫКИ СОСТАВА ≤ 28 СИМВОЛОВ — это не стиль, это ограничение рендерера.
     zayavka.html:610 кладёт incl[].t в КЛЮЧ формулярной строки, а у ключа
     .zk-slot .k стоит white-space:nowrap (zayavka.html:62), который не
     снимается и в мобильной ветке. Длинная строка уедет капсом за край
     страницы. Развёрнутые пояснения живут в tier_full — он рисуется абзацем. */
  var WZ_TIER = {
    base: {
      label: 'Диагностика',
      ledger: 'аудит исходника и карта правок',
      full: 'Проверяем предоставленный клиентом материал: структуру, аргументацию, ' +
            'источники и оформление. Результат — файл с комментариями и карта правок. ' +
            'Редакторское внесение изменений, консультации и подготовка выступления ' +
            'в этот формат не входят и фиксируются отдельными позициями.',
      incl: [
        ['Аудит исходника клиента', 1],
        ['Карта замечаний', 1],
        ['Критерии приёмки', 1],
        ['Редактура файла клиента', 0],
        ['Оплата по этапам', 1],
        ['Консультация по замечаниям', 0],
        ['Репетиция самостоятельных ответов', 0, 6000]
      ]
    },
    turn: {
      label: 'Редактура',
      ledger: 'видимые правки в исходнике клиента',
      full: 'После диагностики вносим согласованные изменения в предоставленный ' +
            'клиентом текст с видимой историей правок и комментариями. Проверяем ' +
            'устранение замечаний по критериям позиции. Новая тема, новые данные и ' +
            'дополнительный объём оформляются отдельной строкой.',
      incl: [
        ['Всё из «Диагностики»', 1],
        ['Видимые правки в файле', 1],
        ['Комментарии редактора', 1],
        ['Сверка по критериям', 1],
        ['Новая тема и новые данные', 0],
        ['Редактура доклада и слайдов', 0],
        ['Репетиция ответов', 0]
      ]
    },
    vip: {
      label: 'Сопровождение',
      ledger: 'редактура, консультации и репетиция ответов',
      full: 'Редактура исходника клиента дополняется консультациями по принятым ' +
            'решениям. Для выступления редактируем подготовленные клиентом тезисы и ' +
            'слайды, затем репетируем его самостоятельные ответы на вероятные вопросы.',
      incl: [
        ['Всё из «Редактуры»', 1],
        ['Консультации по решениям', 1],
        ['Редактура доклада клиента', 1],
        ['Редактура слайдов клиента', 1],
        ['Репетиция самостоятельных ответов', 1]
      ]
    }
  };

  var WZ_XTRA = {
    diplom: 'Практическая часть с расчётами',
    master: 'Практическая часть с расчётами',
    chapter: 'Практическая часть с расчётами',
    kandidat: 'Практическая часть с расчётами',
    course_emp: 'Обработка эмпирики',
    practice: 'Дневник и характеристика',
    vak: 'Подбор журнала', scopus: 'Подбор журнала', rinc: 'Подбор журнала'
  };

  /* rail[].pay ОБЯЗАН быть подмножеством kind-ов из payments.stage_plan:
     при двух частях сервер отдаёт только prepay + rest (payments.py:130–133),
     а _offer_public ставит pay_amount = amounts.get(k, 0) (webapp.py:1122) —
     значок платежа на лишней остановке просто исчезнет, тихо и без ошибки. */
  var WZ_RAIL = {
    work: [
      [0.00, 'Старт исполнения', 'спецификация и исходная версия зафиксированы', 'prepay'],
      [0.25, 'Диагностика завершена', 'карта замечаний и порядок редакторских действий', ''],
      [0.60, 'Промежуточный результат', 'согласованный блок правок — на проверку', 'stage2'],
      [1.00, 'Результат позиции', 'отредактированный материал и комментарии', 'rest']
    ],
    art: [
      [0.00, 'Старт исполнения', 'требования издания и исходник зафиксированы', 'prepay'],
      [0.55, 'Научная редактура', 'правки и комментарии — на проверку', 'stage2'],
      [1.00, 'Результат позиции', 'отредактированный материал и реестр проверки', 'rest']
    ],
    prac: [
      [0.00, 'Старт исполнения', 'исходники и требования зафиксированы', 'prepay'],
      [0.50, 'Промежуточный результат', 'правки отчёта и приложений — на проверку', 'stage2'],
      [1.00, 'Результат позиции', 'отредактированные материалы и комментарии', 'rest']
    ],
    sml: [
      [0.00, 'Старт исполнения', 'задача, исходник и смета зафиксированы', 'prepay'],
      [1.00, 'Результат позиции', 'согласованный артефакт и комментарии', 'rest']
    ]
  };
  var WZ_FAM = { vak: 'art', scopus: 'art', rinc: 'art', practice: 'prac', self: 'sml' };

  /* услуги: цена фиксированная, коэффициентов нет (config.py SERVICES) */
  var WZ_SVC = {
    svc_plan: { label: 'Разбор задачи и плана', price: 3000, days: 2,
      full: 'Проверим требования, предложим логику разделов и дорожную карту самостоятельной работы клиента.' },
    svc_ai: { label: 'Литературная редактура', price: 2500, days: 3,
      full: 'Исправим канцелярит, повторы и машинальные обороты в исходном тексте клиента с сохранением видимой истории правок.' },
    svc_review: { label: 'Диагностика черновика', price: 2500, days: 3,
      full: 'Проверим структуру и доказательность черновика, составим карту замечаний и критерии доработки.' },
    svc_tutor: { label: 'Репетиторство и консультации', price: 3000, days: 7, unit: 'час',
      full: 'Индивидуальные занятия: методология, оформление и разбор самостоятельных решений клиента. Цена указана за час.' },
    svc_norm: { label: 'Нормоконтроль и оформление', price: 5000, days: 4,
      full: 'Проверим и исправим оформление исходного материала клиента: поля, ссылки, список литературы и приложения.' },
    svc_defense: { label: 'Редактура доклада и слайдов', price: 6000, days: 5,
      full: 'Отредактируем подготовленные клиентом тезисы и слайды, затем разберём вероятные вопросы для самостоятельных ответов.' },
    svc_defense_pack: { label: 'Пакет подготовки к выступлению', price: 9500, days: 7,
      full: 'Редактура подготовленных клиентом доклада и слайдов, затем репетиция его самостоятельных ответов на вероятные вопросы.' }
  };
  var WZ_SVC_ORDER = ['svc_plan', 'svc_ai', 'svc_review', 'svc_tutor',
                      'svc_norm', 'svc_defense', 'svc_defense_pack'];

  /* полка: порядок — по частоте в базе */
  var WZ_SHELF = [
    { id: 'dip_hum',  ico: 'stPriced', nm: 'ВКР · Диагностика',
      sub: 'гуманитарные / экономика · аудит исходника',
      type: 'diplom', disc: 'hum', term: 'free', tier: 'base' },
    { id: 'dip_law',  ico: 'stPriced', nm: 'ВКР · Диагностика',
      sub: 'юриспруденция / педагогика / психология · аудит исходника',
      type: 'diplom', disc: 'law', term: 'free', tier: 'base' },
    { id: 'dip_urg',  ico: 'hourglass', nm: 'ВКР · срочная диагностика',
      sub: 'юриспруденция · до 14 дней · Диагностика',
      type: 'diplom', disc: 'law', term: 'urgent', tier: 'base' },
    { id: 'dip_turn', ico: 'stFix', nm: 'ВКР · Редактура',
      sub: 'гуманитарные · видимые правки в исходнике',
      type: 'diplom', disc: 'hum', term: 'free', tier: 'turn' },
    { id: 'dip_vip',  ico: 'reviews', nm: 'ВКР · Сопровождение',
      sub: 'редактура, консультации и репетиция ответов',
      type: 'diplom', disc: 'hum', term: 'free', tier: 'vip' },
    { id: 'crs',      ico: 'content', nm: 'Курсовая · Диагностика',
      sub: 'гуманитарные · аудит исходника',
      type: 'course', disc: 'hum', term: 'free', tier: 'base' },
    { id: 'crs_emp',  ico: 'visits', nm: 'Исследовательская часть · Диагностика',
      sub: 'проверка методологии и данных клиента',
      type: 'course_emp', disc: 'law', term: 'free', tier: 'base' },
    { id: 'mag',      ico: 'cases', nm: 'Магистерское исследование',
      sub: 'юриспруденция · Диагностика исходника',
      type: 'master', disc: 'law', term: 'free', tier: 'base' }
  ];

  var WZ_MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля',
                'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  var wz = { step: 1, p: null, adj: '0', own: 0, exact: '', dshift: 0,
             stages: 2, ttl: 14, files: 1, tone: 'work', orig: 0, avuz: 0,
             topic: '', name: '', noname: 0,
             res: null, oid: 0, sent: false };

  /* ---------------------- вычисления ---------------------- */

  function wzMoney(n) { return Number(n || 0).toLocaleString('ru-RU'); }
  /* Шаг округления зависит от порядка цены. При шаге 500 у услуги за 2 500 ₽
     кнопка «−10 %» давала 0 % (2 500 → 2 500), а «+10 %» давала +20 % (→ 3 000):
     мастер думал, что уступил, и не уступал. Замерено. Для сумм до 20 000
     округляем до 100 ₽ — скидка становится честной. */
  function wzR500(n) {
    var step = n < 20000 ? 100 : 500;
    return Math.round(n / step) * step;
  }

  /* Питоновский round(): половина уходит К ЧЁТНОМУ. JS Math.round() округляет
     половину вверх — на 66 500 ₽ (50 % = 33 250) это давало 33 300 против
     серверных 33 200 (payments.py:108–110). Мастер видел бы одну цифру,
     клиент — другую. nd: 0 или -2. */
  function wzPy(x, nd) {
    var f = nd === -2 ? 100 : 1, h = x / f, fl = Math.floor(h), d = h - fl, n;
    if (d > 0.5) n = fl + 1;
    else if (d < 0.5) n = fl;
    else n = (fl % 2 === 0) ? fl : fl + 1;
    return n * f;
  }

  function wzPick(arr, id) {
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return arr[0];
  }

  /* Уровень берём ЯВНО по id: legacy-код turn имеет отдельный коэффициент,
     а видимый ярлык в этом интерфейсе — «Редактура». */
  function wzQuote(p) {
    var C = window.SalonCalc, sv;
    if (p.svc) {
      sv = WZ_SVC[p.type];
      return { svc: 1, t: { label: sv.label, base: sv.price },
               d: { label: '' }, s: { label: '' }, v: { label: sv.label },
               p0: sv.price, p1: sv.price, p2: sv.price,
               low: sv.price, high: sv.price };
    }
    var t = wzPick(C.types, p.type), d = wzPick(C.disciplines, p.disc);
    var s = wzPick(C.terms, p.term), v = wzPick(C.tiers, p.tier);
    var selectedBase = t.prices && t.prices[v.priceKey]
      ? t.prices[v.priceKey] : t.base;
    var quote = C.quote(p.type, p.disc, p.term, p.tier);
    return { svc: 0, t: t, d: d, s: s, v: v,
             p0: C.round500(selectedBase),
             p1: C.round500(selectedBase * d.k),
             p2: C.round500(selectedBase * d.k * s.k),
             low: quote.low, high: quote.high };
  }

  function wzPrice() {
    var q = wzQuote(wz.p);
    if (wz.adj === 'own') return Math.max(1, wz.own || q.low);
    if (wz.adj === 'top') return q.high;
    if (wz.adj === '0') return q.low;
    return wzR500(q.low * (1 + parseInt(wz.adj, 10) / 100));
  }

  function wzDaysBase() {
    if (wz.p.svc) return WZ_SVC[wz.p.type].days;
    var row = WZ_DAYS[wz.p.type] || WZ_DAYS.diplom;
    return row[wz.p.term] || row.free;
  }
  function wzFloor() {
    if (wz.p.svc) return 1;
    var row = WZ_DAYS[wz.p.type] || WZ_DAYS.diplom;
    return Math.max(2, Math.ceil(row.urgent * 0.6));
  }
  function wzDays() {
    if (wz.exact) {
      var d = wzParse(wz.exact);
      if (d) return Math.max(1, wzDiff(d));
    }
    return Math.max(wzFloor(), Math.min(400, wzDaysBase() + wz.dshift));
  }
  /* в какую полосу срочности попал КАЛЕНДАРЬ — сравниваем с таблицей типа */
  function wzBand(days) {
    var row = WZ_DAYS[wz.p.type] || WZ_DAYS.diplom;
    if (days <= row.urgent) return 'urgent';
    if (days <= row.mid) return 'mid';
    return 'free';
  }

  /* полдень — чтобы переход на летнее время не сдвигал сутки */
  function wzToday() { var d = new Date(); d.setHours(12, 0, 0, 0); return d; }
  function wzPlus(n) { var d = wzToday(); d.setDate(d.getDate() + n); return d; }
  function wzDiff(d) { return Math.round((d.getTime() - wzToday().getTime()) / 86400000); }
  function wzParse(iso) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) return null;
    var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10), 12, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }
  function wzISO(d) {
    var m = d.getMonth() + 1, dd = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (dd < 10 ? '0' : '') + dd;
  }
  function wzRu(d) { return d.getDate() + ' ' + WZ_MON[d.getMonth()]; }
  /* обещаем то, что делаем: суббота и воскресенье уезжают на понедельник */
  function wzWork(d) {
    var g = d.getDay();
    if (g === 6) d.setDate(d.getDate() + 2);
    else if (g === 0) d.setDate(d.getDate() + 1);
    return d;
  }
  function wzFinal() {
    if (wz.exact) { var d = wzParse(wz.exact); if (d) return d; }
    return wzWork(wzPlus(wzDays()));
  }

  function wzLedger() {
    var q = wzQuote(wz.p), price = wzPrice(), out = [], diff;
    if (q.svc) {
      /* У почасовой услуги цена в конфиге — ЗА ЧАС. Без единицы клиент читал
         «Итого 3 000 ₽» как стоимость всей работы, а мастер мог продать
         десять занятий по цене одного. Единицу печатаем прямо в строке. */
      var un = WZ_SVC[wz.p.type] && WZ_SVC[wz.p.type].unit;
      out.push({ t: q.t.label + (un ? ' — цена за один ' + un : ' — услуга мастерской'),
                 a: q.p0 });
    } else {
      out.push({ t: q.t.label + ' · ' + q.v.label + ' — выбранный результат', a: q.p0 });
      if (q.p1 !== q.p0) out.push({ t: 'Направление: ' + WZ_DNOTE[wz.p.disc], a: q.p1 - q.p0 });
      if (q.p2 !== q.p1) out.push({ t: 'Срок: ' + WZ_TNOTE[wz.p.term], a: q.p2 - q.p1 });
      if (q.low !== q.p2)
        out.push({ t: 'Уровень «' + wzPick(window.SalonCalc.tiers, wz.p.tier).label +
                      '» — ' + WZ_TIER[wz.p.tier].ledger, a: q.low - q.p2 });
    }
    diff = price - q.low;
    if (diff > 0) out.push({ t: 'Надбавка за объём и требования методички', a: diff });
    else if (diff < 0) out.push({ t: 'Скидка мастерской', a: diff });
    return out;
  }

  function wzIncl() {
    if (wz.p.svc) {
      return [{ t: 'Исходный материал клиента', 'in': 1 },
              { t: 'Согласованные редакторские действия', 'in': 1 },
              { t: 'Подмена автора аттестационной работы', 'in': 0 }];
    }
    var src = WZ_TIER[wz.p.tier].incl, xtra = WZ_XTRA[wz.p.type], out = [], i, row;
    for (i = 0; i < src.length; i++) {
      row = { t: src[i][0], 'in': src[i][1] };
      if (!src[i][1] && src[i][2]) row.p = src[i][2];  // цена допа → «можно довложить»
      out.push(row);
      if (i === 0 && xtra) out.push({ t: xtra, 'in': 1 });
    }
    return out;
  }

  function wzRail() {
    var fam = wz.p.svc ? 'sml' : (WZ_FAM[wz.p.type] || 'work');
    var set = WZ_RAIL[fam].slice();
    var days = wzDays(), fin = wzFinal(), out = [], i, r, pay, d, n, prev = null;
    if (fam === 'work' && wzBand(days) === 'urgent') set.splice(1, 1);
    for (i = 0; i < set.length; i++) {
      r = set[i];
      pay = r[3];
      if (pay === 'stage2' && wz.stages !== 3) pay = '';
      /* одним платежом: деньги целиком на старте, у финала платёжного флажка нет */
      if (pay === 'rest' && wz.stages === 1) pay = '';
      if (r[0] >= 1) d = fin;
      else {
        n = Math.min(Math.ceil(days * r[0]), Math.max(0, days - 1));
        d = wzWork(wzPlus(n));
      }
      /* монотонность: сдвиг с выходных не должен перепутать порядок остановок */
      if (prev && d.getTime() < prev.getTime()) d = new Date(prev.getTime());
      prev = d;
      out.push({ d: wzISO(d), t: r[1], g: r[2], pay: pay || null });
    }
    return out;
  }

  /* повторяет payments.default_prepay + payments.stage_plan */
  function wzPlan(price) {
    var a1, a2;
    if (wz.stages === 1) return [price];
    if (wz.stages === 3) {
      a1 = wzPy(price * 0.30, 0);
      a2 = wzPy(price * 0.40, 0);
      return [a1, a2, price - a1 - a2];
    }
    a1 = Math.min(wzPy(price * 0.5, -2), price);
    return [a1, price - a1];
  }
  function wzPayNote(price) {
    var p = wzPlan(price), i, s = [];
    if (p.length === 1)
      return 'Один платёж — ' + wzMoney(p[0]) + ' ₽ целиком, до начала работы. ' +
        'Файл передаётся после оплаты. Считает сервер — это его цифры.';
    for (i = 0; i < p.length; i++) s.push(wzMoney(p[i]) + ' ₽');
    return 'Сейчас ' + s.shift() +
      ' · потом ' + s.join(' и ') + '. Считает сервер — это его цифры.';
  }

  /* «3 дней» видно всегда: у услуг срок 1–7 дней, двузначных не бывает */
  function wzPlural(n, one, few, many) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }
  function wzDaysWord(n) { return n + ' ' + wzPlural(n, 'день', 'дня', 'дней'); }

  /* Требования описывают только проверяемые операции и артефакты.
     Решения внешних систем и третьих лиц результатами услуги не являются.
     Старые reqs_* aliases сохраняются для API/PDF. */
  var WZ_REQ_OK = { svc_norm: 1 };
  function wzReqApplies() { return !wz.p.svc || WZ_REQ_OK[wz.p.type]; }
  function wzReqShort() {
    if (!wzReqApplies()) {
      if (wz.p.type === 'svc_ai')
        return 'Видимые стилистические правки · комментарии редактора';
      return 'Результат и критерии фиксируются в строке спецификации';
    }
    var a = ['Проверка по методичке', 'Видимые правки в исходнике клиента'];
    if (wz.avuz) a.push('Отчёт технической проверки без обещания процента');
    return a.join(' · ');
  }
  function wzReqFull() {
    var s = 'Проверяем оформление по переданной методичке: поля, нумерацию, ссылки, ' +
      'список литературы и приложения. Редакторские изменения видны в файле.\n';
    if (wz.avuz) s += 'Прикладываем доступный технический отчёт без гарантии процента и решения внешней системы.\n';
    return s + 'Дополнительные требования, новая версия исходника и новый объём сначала фиксируются в спецификации.';
  }

  function wzSpecificationLines(price, iso, dlText) {
    var included = wzIncl().filter(function (x) { return x['in']; }).map(function (x) { return x.t; });
    var excluded = wzIncl().filter(function (x) { return !x['in']; }).map(function (x) { return x.t; });
    excluded.push('гарантия процента, оценки, допуска, сдачи или защиты');
    var payments = wzPlan(price).map(function (amount, i) {
      return 'платёж ' + (i + 1) + ': ' + amount + ' RUB';
    });
    var result = wz.p.svc
      ? WZ_SVC[wz.p.type].label + ' — согласованный результат по исходнику клиента'
      : 'Отредактированный материал клиента, карта замечаний и согласованные консультационные материалы';
    return buildSpecificationLines(wzLedger(), {
      contract_contour: 'A',
      academic_submode: 'A1',
      permitted_purpose: 'Консультация, проверка и редактура самостоятельного материала клиента; клиент использует рекомендации при самостоятельной подготовке.',
      deliverable: result,
      input_description: wz.files ? 'Полный комплект исходников, данных и требований клиента' : 'Исходник и требования, переданные клиентом к началу исполнения',
      input_version: 'версия, переданная при старте позиции',
      inclusions: included,
      exclusions: excluded,
      acceptance_criteria: [
        'передан результат в согласованном формате',
        'выполнены операции, прямо перечисленные в строке',
        'редакторские изменения и замечания доступны для проверки клиентом'
      ],
      dependencies: wz.files
        ? ['срок начинается после получения полного комплекта исходников', 'изменение исходника требует обновления строки спецификации']
        : ['изменение исходника, объёма или требований требует обновления строки спецификации'],
      discount_amount: 0,
      payment_allocation: payments,
      correction_days: 7,
      iterations: 1,
      actual_author: 'Клиент — автор исходного академического материала',
      rights_mode: 'Права на исходник сохраняются у клиента; исполнитель отвечает за свои редакторские и консультационные материалы',
      third_party_performers: ['не привлекаются без согласования роли'],
      deadline_text: dlText,
      deadline_date: iso
    });
  }

  function wzCut(s, n) {
    s = String(s || '').trim();
    if (s.length <= n) return s;
    var c = s.slice(0, n), sp = c.lastIndexOf(' ');
    return (sp > n * 0.6 ? c.slice(0, sp) : c) + '…';
  }
  /* Письмо НЕ начинается с имени: zayavka.html:566 уже печатает заголовок
     «{Имя}, ваша заявка собрана», а :568 сразу под ним — этот текст.
     work_label БЕЗ toLowerCase: «ВКР» строчными выглядит опечаткой. */
  function wzIntro() {
    var q = wzQuote(wz.p), fin = wzRu(wzFinal()), days = wzDays();
    /* 80 символов рвали тему посреди слова и глотали закрывающую скобку.
       140 хватает почти на любую вузовскую формулировку целиком. */
    var topic = wzCut(wz.topic, 140);
    var head = q.t.label + (topic ? ' — «' + topic + '»' : '');
    /* У УСЛУГИ НЕТ УРОВНЯ ВЕДЕНИЯ. Раньше сюда клался ярлык самой услуги,
       и письмо выходило так: «Чистка текста от следов ИИ — «тема». Уровень
       «Чистка текста от следов ИИ»» — название дублировалось дважды.
       Для услуг оборот про уровень не печатаем вовсе. */
    /* У УСЛУГИ НЕТ УРОВНЯ ВЕДЕНИЯ, и предложение обязано остаться грамотным:
       при пустом обороте следующее слово идёт с заглавной, иначе выходит
       «...следов ИИ. работа у вас на руках». */
    var hasTier = !wz.p.svc;
    var lvl = hasTier ? ' Уровень «' + WZ_TIER[wz.p.tier].label + '»,' : '';
    var W = hasTier ? ' результат' : ' Результат';
    var F = hasTier ? ' результат' : ' Результат';
    var s;
    if (wz.tone === 'short')
      s = 'Заявка: ' + head + '.' + lvl + ' ' + wzDaysWord(days) +
          ',' + W.toLowerCase() + ' передадим ' + fin + '. Смета и этапы ниже. ' +
          'Стартуем со стартового платежа.';
    else if (wz.tone === 'warm')
      s = 'Здравствуйте! Ниже — всё, о чём договорились, в одном месте: ' + head +
          '.' + lvl + F.toLowerCase() + ' передадим ' + fin + '. Проверьте ' +
          'календарь и смету. Вопросы можно задать до оплаты — заполнять ничего не надо.';
    else
      s = 'Собрал заявку по нашему разговору: ' + head + '.' + lvl +
          W + ' передадим ' + fin + '. Ниже — что входит, смета по строкам ' +
          'и календарь с датами. Цена зафиксирована, пока ссылка жива; ничего ' +
          'не спишется само.';
    return s.length > 400 ? wzCut(s, 397) : s;
  }

  /* ---------------------- отрисовка ---------------------- */

  function wzChips(attr, list, cur) {
    var h = '<div class="ag-filters">', i;
    for (i = 0; i < list.length; i++)
      h += '<button type="button" class="ag-chip' +
        (String(list[i][0]) === String(cur) ? ' on' : '') + '" ' +
        attr + '="' + esc(String(list[i][0])) + '">' + esc(list[i][1]) + '</button>';
    return h + '</div>';
  }

  function wzShelfHtml() {
    var h = '<p class="wz-lead">Возьмите заготовку — заявка соберётся целиком: цена, ' +
      'состав, смета, календарь и письмо. Поправить можно потом, нажатиями.</p>' +
      '<div class="wz-shelf">', i, s, q;
    for (i = 0; i < WZ_SHELF.length; i++) {
      s = WZ_SHELF[i];
      q = wzQuote(s);
      h += '<button type="button" class="wz-card" data-wz-p="' + s.id + '">' +
        '<span class="wz-ico">' + ico(s.ico, 20) + '</span>' +
        '<span class="wz-nm">' + esc(s.nm) + '</span>' +
        '<span class="wz-sub">' + esc(s.sub) + '</span>' +
        '<span class="wz-pr">' + wzMoney(q.low) + ' ₽</span></button>';
    }
    h += '<button type="button" class="wz-card wz-own" data-wz-p="own">' +
      '<span class="wz-ico">' + ico('settings', 20) + '</span><span class="wz-nm">Своё сочетание</span>' +
      '<span class="wz-sub">статья, практика, реферат, отдельные услуги</span></button>';
    return h + '</div><p class="ag-note">Заготовки собраны по истории мастерской. ' +
      'Не подошло — «Своё сочетание»: там все типы работ, услуги и коэффициенты.</p>';
  }

  function wzOwnHtml() {
    var C = window.SalonCalc, i, a, h = '';
    a = [];
    for (i = 0; i < C.types.length; i++) a.push([C.types[i].id, C.types[i].label]);
    h += '<div class="wz-row"><span class="caps">Тип работы</span>' +
         wzChips('data-wz-type', a, wz.p.svc ? '' : wz.p.type) + '</div>';
    a = [];
    for (i = 0; i < WZ_SVC_ORDER.length; i++)
      a.push([WZ_SVC_ORDER[i], WZ_SVC[WZ_SVC_ORDER[i]].label + ' · ' +
              wzMoney(WZ_SVC[WZ_SVC_ORDER[i]].price)]);
    h += '<div class="wz-row"><span class="caps">Или отдельная услуга</span>' +
         wzChips('data-wz-svc', a, wz.p.svc ? wz.p.type : '') +
         '<p class="ag-note">У услуг цена фиксированная, коэффициенты не применяются.</p></div>';
    if (wz.p.svc) return h;
    a = [];
    for (i = 0; i < C.disciplines.length; i++) a.push([C.disciplines[i].id, C.disciplines[i].label]);
    h += '<div class="wz-row"><span class="caps">Направление</span>' +
         wzChips('data-wz-disc', a, wz.p.disc) + '</div>';
    a = [];
    for (i = 0; i < C.terms.length; i++) a.push([C.terms[i].id, C.terms[i].label]);
    h += '<div class="wz-row"><span class="caps">Срок</span>' +
         wzChips('data-wz-term', a, wz.p.term) + '</div>';
    a = [];
    for (i = 0; i < C.tiers.length; i++) a.push([C.tiers[i].id, C.tiers[i].label]);
    h += '<div class="wz-row"><span class="caps">Уровень</span>' +
         wzChips('data-wz-tier', a, wz.p.tier) + '</div>';
    return h;
  }

  function wzRangeText() {
    var q = wzQuote(wz.p);
    if (q.svc) return 'Услуга мастерской: ' + wzMoney(q.low) + ' ₽ — цена фиксированная, правится вручную.';
    return 'Формула мастерской даёт ' + wzMoney(q.low) + ' – ' + wzMoney(q.high) + ' ₽ · ' +
      q.t.label + ' · ' + q.d.label + ' · ' + q.s.label + ' · ' + q.v.label;
  }

  function wzWarnHtml() {
    var days = wzDays(), out = '', band, lbl, C = window.SalonCalc, i;
    if (!wz.p.svc && WZ_SLOW[wz.p.type] && wz.p.term === 'urgent')
      out += '<div>«Срочно» для этого типа работы — это ' + wzDaysWord(wzDaysBase()) +
        ': быстрее не бывает. Коэффициент срочности в цене учтён.</div>';
    if (!wz.p.svc) {
      band = wzBand(days);
      if (band !== wz.p.term) {
        lbl = '';
        for (i = 0; i < C.terms.length; i++) if (C.terms[i].id === band) lbl = C.terms[i].label;
        out += '<div>Календарь стал «' + esc(lbl) + '» (' + days + ' дн.), а цена ' +
          'считается по сроку «' + esc(wzPick(C.terms, wz.p.term).label) + '». ' +
          '<button type="button" class="ag-chip" data-wz-fix="' + band + '">' +
          'пересчитать как «' + esc(lbl) + '»</button></div>';
      }
    }
    return out;
  }

  function wzPreviewHtml() {
    var led = wzLedger(), rail = wzRail(), inc = wzIncl(), price = wzPrice(), i, h = '';
    h += '<div class="wz-pv"><span class="caps">Письмо клиенту</span>' + esc(wzIntro()) + '</div>';
    h += '<div class="wz-pv"><span class="caps">Что входит</span><ul>';
    for (i = 0; i < inc.length; i++)
      h += '<li class="' + (inc[i]['in'] ? 'yes' : 'no') + '">' +
        (inc[i]['in'] ? icoCheck(13) : icoCross(13)) + ' ' + esc(inc[i].t) + '</li>';
    h += '</ul></div>';
    h += '<div class="wz-pv"><span class="caps">Смета</span><ul>';
    for (i = 0; i < led.length; i++)
      h += '<li class="sum"><span>' + esc(led[i].t) + '</span><b>' +
        wzMoney(led[i].a) + ' ₽</b></li>';
    h += '<li class="sum tot"><span>Итого по заявке</span><b>' +
      wzMoney(price) + ' ₽</b></li></ul></div>';
    h += '<div class="wz-pv"><span class="caps">Календарь</span><ul>';
    for (i = 0; i < rail.length; i++)
      h += '<li><span class="d">' + esc(wzRu(wzParse(rail[i].d))) + '</span>' + esc(rail[i].t) +
        ' — ' + esc(rail[i].g) + (rail[i].pay ? ' · платёж' : '') + '</li>';
    h += '</ul></div>';
    h += '<div class="wz-pv"><span class="caps">Исходник и критерии</span>' +
      esc((wz.p.svc ? '' : (WZ_VOL[wz.p.type] || '') + ' · ') + wzReqShort()) + '</div>';
    h += '<div class="wz-pv"><span class="caps">Формат помощи — складка</span>' +
      esc(wz.p.svc ? WZ_SVC[wz.p.type].full : WZ_TIER[wz.p.tier].full) + '</div>';
    return h;
  }

  function wzReviewHtml() {
    var q = wzQuote(wz.p), price = wzPrice(), days = wzDays(), fin = wzFinal();
    var h =
      '<div class="wz-say" id="wzSay" aria-live="polite"></div>' +
      '<label class="wz-fl">Тема или задача клиента' +
      '<input type="text" id="wzTopic" class="wz-inp big" maxlength="400" ' +
      'placeholder="Мотивация персонала в розничной торговле" value="' + esc(wz.topic) + '">' +
      '<span class="wz-hint">Единственное, что придётся напечатать.</span></label>' +
      '<label class="wz-fl">Имя клиента <span class="wz-opt">необязательно</span>' +
      '<input type="text" id="wzName" class="wz-inp" maxlength="60" placeholder="Анна" ' +
      'value="' + esc(wz.name) + '"' + (wz.noname ? ' disabled' : '') + '>' +
      '<span class="wz-hint">Только имя: ссылку могут переслать, лишних данных ' +
      'на предоплатной странице быть не должно (Политика п. 4.4).</span></label>' +
      wzChips('data-wz-noname', [['1', 'без имени — «Здравствуйте»']], wz.noname ? '1' : '');

    if (wz.p.id === 'own') h += wzOwnHtml();

    h += '<div class="wz-row"><span class="caps">Цена</span>' +
      '<div class="wz-big"><input type="number" inputmode="numeric" id="wzPriceIn" ' +
      'class="wz-inp wz-price" min="100" step="100" value="' + price + '">' +
      '<span class="wz-cur">₽</span></div>' +
      wzChips('data-wz-adj', [['0', 'по формуле'], ['-10', '−10 %'], ['10', '+10 %'],
                              ['top', 'верх вилки ' + wzMoney(q.high)]], wz.adj) +
      '<p class="ag-note" id="wzRange">' + esc(wzRangeText()) + '</p></div>';

    h += '<div class="wz-row"><span class="caps">Дата передачи результата</span>' +
      '<div class="wz-big"><span class="wz-val" id="wzDateV">' + wzRu(fin) + ' · ' + wzDaysWord(days) +
      '</span><input type="date" id="wzDateIn" class="wz-inp wz-date" value="' +
      wzISO(fin) + '"></div>' +
      wzChips('data-wz-d', [['-7', '− неделя'], ['7', '+ неделя'], ['14', '+ 2 недели'],
                            ['0', 'вернуть по сроку']], '') +
      '<p class="ag-note">Даты выходных сдвигаются на понедельник — обещаем то, что делаем.</p>' +
      '<div class="wz-warn" id="wzWarn">' + wzWarnHtml() + '</div></div>';

    h += '<div class="wz-row"><span class="caps">План оплаты</span>' +
      wzChips('data-wz-st', [['2', '2 части · 50/50'], ['3', '3 части · 30/40/30'],
                             ['1', 'Одним платежом']], wz.stages) +
      '<p class="ag-note" id="wzPayNote">' + esc(wzPayNote(price)) + '</p></div>';

    h += '<div class="wz-row"><span class="caps">Критерии и исходники</span>' +
      wzChips('data-wz-avuz', [['1', 'Приложить доступный технический отчёт']], wz.avuz ? '1' : '') +
      '<label class="ag-hint"><input type="checkbox" id="wzFiles"' +
      (wz.files ? ' checked' : '') + '> Ждём материалы от клиента — срок пойдёт ' +
      'и с их получения</label></div>';

    h += '<div class="wz-row"><span class="caps">Письмо клиенту</span>' +
      wzChips('data-wz-tone', [['work', 'деловое'], ['warm', 'тёплое'], ['short', 'короткое']], wz.tone) +
      '</div>';

    h += '<div class="wz-row"><span class="caps">Ссылка живёт</span>' +
      wzChips('data-wz-ttl', [['7', '7 дней'], ['14', '14 дней'], ['30', '30 дней']], wz.ttl) +
      '</div>';

    h += '<details class="wz-prev" id="wzPrev"><summary>▸ Что увидит клиент — всё уже собрано</summary>' +
      '<div id="wzPrevBody">' + wzPreviewHtml() + '</div></details>';
    return h;
  }

  function wzDoneHtml() {
    var r = wz.res || {}, o = r.order || {};
    var oid = wz.oid || o.id || 0;
    var price = o.price || wzPrice();
    var till = r.expires_ru ? ('действительна до ' + r.expires_ru)
             : (r.expires_at ? ('действительна до ' + dt(r.expires_at))
                             : ('живёт ' + wz.ttl + ' дней'));
    return '<div class="wz-say" id="wzSay" aria-live="polite">Ссылка уже в буфере обмена.</div>' +
      '<p class="wz-lead">Дело № ' + oid + ' · ' + wzMoney(price) + ' ₽ · заявка ' + esc(till) + '.</p>' +
      '<input type="text" class="wz-inp mono" id="wzUrl" readonly value="' + esc(r.url || '') + '">' +
      '<p class="ag-note">Дело ни к кому не привязано, пока по нему не заплатят. ' +
      'Никаких уведомлений сейчас никому не ушло — акцептом будет оплата.</p>';
  }

  /* ------------- патч без перерисовки: галки, скролл, каретка на месте ------------- */

  function wzTxt(id, s) { var el = document.getElementById(id); if (el) el.textContent = s; }
  function wzHtm(id, s) { var el = document.getElementById(id); if (el) el.innerHTML = s; }
  function wzMark(attr, val) {
    var list = document.querySelectorAll('#wzBody [' + attr + ']'), i, on;
    for (i = 0; i < list.length; i++) {
      on = String(list[i].getAttribute(attr)) === String(val);
      if (on) list[i].classList.add('on'); else list[i].classList.remove('on');
    }
  }

  /* ЕДИНСТВЕННЫЙ способ обновить экран 2. Полная перерисовка здесь запрещена:
     она снимала бы чекбокс «ждём материалы», захлопывала складку, сбрасывала
     скролл (три из шести рядов чипов лежат ниже сгиба телефона) и выбрасывала
     мобильную клавиатуру. skipPrice — когда мастер сам набирает цифру. */
  function wzSync(skipPrice) {
    if (wz.step !== 2) return;
    var q = wzQuote(wz.p), price = wzPrice(), days = wzDays(), fin = wzFinal();
    var el = document.getElementById('wzPriceIn');
    if (el && !skipPrice && String(el.value) !== String(price)) el.value = price;
    el = document.getElementById('wzDateIn');
    if (el) el.value = wzISO(fin);

    wzMark('data-wz-adj', wz.adj);
    wzMark('data-wz-st', wz.stages);
    wzMark('data-wz-ttl', wz.ttl);
    wzMark('data-wz-tone', wz.tone);
    wzMark('data-wz-avuz', wz.avuz ? '1' : '');
    wzMark('data-wz-noname', wz.noname ? '1' : '');
    wzMark('data-wz-type', wz.p.svc ? '' : wz.p.type);
    wzMark('data-wz-svc', wz.p.svc ? wz.p.type : '');
    wzMark('data-wz-disc', wz.p.disc);
    wzMark('data-wz-term', wz.p.term);
    wzMark('data-wz-tier', wz.p.tier);

    el = document.querySelector('#wzBody [data-wz-adj="top"]');
    if (el) el.textContent = 'верх вилки ' + wzMoney(q.high);
    wzTxt('wzRange', wzRangeText());
    wzTxt('wzDateV', wzRu(fin) + ' · ' + wzDaysWord(days));
    wzTxt('wzPayNote', wzPayNote(price));
    wzHtm('wzWarn', wzWarnHtml());

    el = document.getElementById('wzName');
    if (el) el.disabled = !!wz.noname;
    el = document.getElementById('wzPrev');
    if (el && el.open) wzHtm('wzPrevBody', wzPreviewHtml());
  }

  function wzSay(msg, bad) {
    var el = document.getElementById('wzSay');
    if (el) { el.textContent = msg; el.className = 'wz-say' + (bad ? ' bad' : ''); }
    toast(msg);   /* рельса поднята над оверлеем классом html.wz-lock */
  }

  function wzDraw() {
    var body = document.getElementById('wzBody');
    var foot = document.getElementById('wzFoot');
    var head = document.getElementById('wzH');
    if (!body || !foot || !head) return;
    if (wz.step === 1) {
      head.textContent = 'Что собираем?';
      body.innerHTML = wzShelfHtml();
      foot.innerHTML = '';
    } else if (wz.step === 2) {
      head.textContent = 'Проверьте — и выпускаем';
      body.innerHTML = wzReviewHtml();
      foot.innerHTML =
        '<button type="button" class="btn btn-line" id="wzBack">← другая заготовка</button>' +
        '<button type="button" class="btn btn-wax wz-go" id="wzFire">Выпустить ссылку</button>';
      var ti = document.getElementById('wzTopic');
      if (ti && !ti.value) { try { ti.focus(); } catch (e) {} }
    } else {
      head.textContent = 'Заявка собрана';
      body.innerHTML = wzDoneHtml();
      foot.innerHTML =
        '<button type="button" class="btn btn-line" id="wzCopy">Скопировать ссылку</button>' +
        '<button type="button" class="btn btn-line" id="wzMsg">Текст для мессенджера</button>' +
        '<a class="btn btn-line" href="' + esc((wz.res && wz.res.url) || '#') +
        '&preview=1" target="_blank" rel="noopener">Открыть как клиент</a>' +
        '<button type="button" class="btn btn-line" id="wzAgain">Собрать ещё одну</button>' +
        '<button type="button" class="btn btn-wax wz-go" id="wzGoCard">Перейти в дело</button>';
    }
  }

  /* Ловушка extras.js:56–61: класс .open ставится ПОСЛЕ void offsetWidth,
     БЕЗ requestAnimationFrame — в браузерах с придушенным rAF кадр не
     наступает, диалог остаётся невидимым, а подложка замораживает админку.
     Повторяем приём буквально. Ни одного rAF в этом модуле нет. */
  function wzOpen() {
    var ov = document.getElementById('wzOv');
    if (!ov) { wzMount(); ov = document.getElementById('wzOv'); }
    if (!ov) return;
    wz.step = 1; wz.p = null; wz.adj = '0'; wz.own = 0; wz.exact = ''; wz.dshift = 0;
    wz.stages = 2; wz.ttl = 14; wz.files = 1; wz.tone = 'work'; wz.orig = 0; wz.avuz = 0;
    wz.topic = ''; wz.name = ''; wz.noname = 0;
    wz.res = null; wz.oid = 0; wz.sent = false;
    wz._opener = document.activeElement;   /* вернём фокус сюда при закрытии */
    ov.hidden = false;
    wzDraw();
    void ov.offsetWidth;
    ov.classList.add('open');
    document.documentElement.classList.add('wz-lock');
    /* уводим фокус внутрь листа — иначе он остаётся на кнопке за оверлеем */
    setTimeout(function () {
      var f = ov.querySelector('#wzTopic') || ov.querySelector('.wz-card') || ov.querySelector('.wz-x');
      if (f) { try { f.focus(); } catch (e) {} }
    }, 60);
  }
  function wzClose() {
    var ov = document.getElementById('wzOv');
    if (!ov) return;
    ov.classList.remove('open');
    document.documentElement.classList.remove('wz-lock');
    setTimeout(function () { ov.hidden = true; }, 200);
    if (wz._opener && wz._opener.focus) { try { wz._opener.focus(); } catch (e) {} }
    wz._opener = null;
  }

  function wzTake(id) {
    var i, s;
    if (id === 'own') {
      wz.p = { id: 'own', svc: 0, type: 'diplom', disc: 'hum', term: 'free', tier: 'base' };
    } else {
      for (i = 0; i < WZ_SHELF.length; i++) if (WZ_SHELF[i].id === id) {
        s = WZ_SHELF[i];
        wz.p = { id: s.id, svc: 0, type: s.type, disc: s.disc, term: s.term, tier: s.tier };
      }
    }
    if (!wz.p) return;
    /* сбрасываем правки прошлой заготовки, иначе новая наследует чужую цену/срок/этапы
       (те же сбросы делают обработчики выбора типа/услуги) */
    wz.exact = ''; wz.dshift = 0; wz.adj = '0'; wz.stages = 2;
    if (wz.p.term === 'urgent') wz.tone = 'short';
    wz.step = 2;
    wzDraw();
  }

  function wzCopy(text, okMsg) {
    var ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () { wzSay(okMsg || 'Скопировано'); },
          function () { wzSay('Браузер не дал доступ к буферу — выделите текст в поле', 1); });
        ok = true;
      }
    } catch (e) { ok = false; }
    if (!ok) wzSay('Скопируйте ссылку из поля — браузер не дал доступ к буферу', 1);
  }

  /* Два POST подряд по существующим эндпоинтам. Подтверждения перед выпуском
     НЕТ намеренно: ссылка никому не уходит (мастер копирует её сам), дело
     заводится без владельца, а ошибку исправляет «Отозвать». Лишнее нажатие
     здесь стоило бы ровно того, на что жаловался владелец. */
  function wzFire() {
    var el = document.getElementById('wzTopic');
    var topic = String((el && el.value) || '').trim();
    if (!topic) {
      wzSay('Напишите тему работы — это единственное обязательное поле', 1);
      if (el) { try { el.focus(); } catch (e) {} }
      return;
    }
    if (wz.sent) return;
    wz.sent = true;
    wz.topic = topic;
    el = document.getElementById('wzName');
    var name = wz.noname ? '' : String((el && el.value) || '').trim().split(' ')[0].slice(0, 60);
    el = document.getElementById('wzFiles');
    wz.files = el && el.checked ? 1 : 0;

    var price = wzPrice(), days = wzDays(), fin = wzFinal(), iso = wzISO(fin);
    var dlText = 'к ' + wzRu(fin) + ', ' + wzDaysWord(days) + ' с начала работы';
    var specLines = wzSpecificationLines(price, iso, dlText);
    var btn = document.getElementById('wzFire');
    if (btn) { btn.disabled = true; btn.textContent = 'Собираем…'; }
    wzSay('Заводим дело…');

    api('/admin/orders', {
      topic: topic, type: wz.p.type,
      disc: wz.p.svc ? '' : wz.p.disc, term: wz.p.svc ? '' : wz.p.term,
      tier: wz.p.svc ? '' : wz.p.tier,
      name: name, deadline: dlText, deadline_date: iso
    }).then(function (r) {
      if (!r || !r.ok) {
        wz.sent = false;
        if (btn) { btn.disabled = false; btn.textContent = 'Выпустить ссылку'; }
        wzSay('Не получилось завести дело' +
              (r && r.error ? ' (' + r.error + ')' : '') + ' — попробуйте ещё раз', 1);
        return;
      }
      wz.oid = r.id;
      api('/admin/offers', {
        order_id: wz.oid, price: price, stages: wz.stages,
        greet_name: name, intro: wzIntro(),
        volume: wz.p.svc ? '' : (WZ_VOL[wz.p.type] || ''),
        /* У услуги уровня ведения нет: строка «Ведение» на листе получала её же
           название и дублировала строку «Работа». Оставляем пустым — лист такую
           строку не рисует. Описание услуги уходит в tier_full, где оно к месту. */
        tier_label: wz.p.svc ? '' : WZ_TIER[wz.p.tier].label,
        tier_full: wz.p.svc ? WZ_SVC[wz.p.type].full : WZ_TIER[wz.p.tier].full,
        /* reqs_full применяется только там, где методичка действительно входит
           в позицию; старый alias сохраняем для существующего API/PDF. */
        reqs_short: wzReqShort(), reqs_full: wzReqApplies() ? wzReqFull() : '',
        need_files: wz.files,
        incl: wzIncl(), ledger: specLines, rail: wzRail(),
        specification_lines: specLines,
        specification: {
          version: 2,
          document_mode: 'single_order_multi_line',
          lines: specLines
        },
        contract_contour: 'A',
        academic_submode: 'A1',
        permitted_purpose: 'Консультация, проверка и редактура самостоятельного материала клиента; клиент использует рекомендации при самостоятельной подготовке.',
        deadline_text: dlText, deadline_date: iso, ttl_days: wz.ttl
      }).then(function (r2) {
        if (!r2 || !r2.ok) {
          wz.sent = false;
          if (btn) { btn.disabled = false; btn.textContent = 'Выпустить ссылку'; }
          /* дело уже заведено — молча терять его нельзя */
          wzSay('Дело № ' + wz.oid + ' заведено, но заявка не собралась' +
                (r2 && r2.error ? ' (' + r2.error + ')' : '') +
                '. Открываю карточку — там форма заявки.', 1);
          setTimeout(function () {
            wzClose();
            st.tab = 'orders'; st.filter = ''; st.sel = wz.oid; st.card = null; st.offnew = true;
            drawNav(); loadTab(true);
          }, 1800);
          return;
        }
        wz.res = r2;
        wz.step = 3;
        wzDraw();
        wzCopy(r2.url, 'Ссылка в буфере');
        if (S.stamp) S.stamp('Готово');
        refreshSilent();
      });
    });
  }

  /* Оверлей живёт в document.body, а НЕ в #agRoot: render() (admin.js:469)
     перетирает root.innerHTML целиком, drawBody() — тем более; разметку листа
     снесло бы первым же переключением вкладки. Делегаты вешаются один раз. */
  function wzMount() {
    if (document.getElementById('wzOv')) return;
    var box = document.createElement('div');
    box.innerHTML =
      '<div class="wz-ov" id="wzOv" hidden><div class="wz-sheet" role="dialog" ' +
      'aria-modal="true" aria-labelledby="wzH"><div class="wz-head">' +
      '<h2 id="wzH">Что собираем?</h2>' +
      '<button type="button" class="wz-x" id="wzClose" aria-label="Закрыть">×</button></div>' +
      '<div class="wz-body" id="wzBody"></div><div class="wz-foot" id="wzFoot"></div>' +
      '</div></div>';
    while (box.firstChild) document.body.appendChild(box.firstChild);
    var ov = document.getElementById('wzOv');

    ov.addEventListener('click', function (e) {
      var t = e.target, b, v, d;
      if (t.id === 'wzOv' || t.closest('#wzClose')) { wzClose(); return; }

      b = t.closest('[data-wz-p]');
      if (b) { wzTake(b.getAttribute('data-wz-p')); return; }
      if (t.closest('#wzBack')) { wz.step = 1; wzDraw(); return; }
      if (t.closest('#wzFire')) { wzFire(); return; }
      if (t.closest('#wzAgain')) { wzOpen(); return; }

      b = t.closest('[data-wz-adj]');
      if (b) { wz.adj = b.getAttribute('data-wz-adj'); wzSync(); return; }
      b = t.closest('[data-wz-d]');
      if (b) {
        v = parseInt(b.getAttribute('data-wz-d'), 10);
        if (!v) { wz.exact = ''; wz.dshift = 0; }
        else {
          d = wzFinal(); d.setDate(d.getDate() + v);
          if (wzDiff(d) < wzFloor()) d = wzPlus(wzFloor());
          wz.exact = wzISO(d);
        }
        wzSync(); return;
      }
      b = t.closest('[data-wz-fix]');
      if (b) { wz.p.term = b.getAttribute('data-wz-fix'); wzSync(); return; }
      b = t.closest('[data-wz-st]');
      if (b) { wz.stages = parseInt(b.getAttribute('data-wz-st'), 10); wzSync(); return; }
      b = t.closest('[data-wz-ttl]');
      if (b) { wz.ttl = parseInt(b.getAttribute('data-wz-ttl'), 10); wzSync(); return; }
      b = t.closest('[data-wz-tone]');
      if (b) { wz.tone = b.getAttribute('data-wz-tone'); wzSync(); return; }
      if (t.closest('[data-wz-avuz]')) { wz.avuz = wz.avuz ? 0 : 1; wzSync(); return; }
      if (t.closest('[data-wz-noname]')) { wz.noname = wz.noname ? 0 : 1; wzSync(); return; }

      b = t.closest('[data-wz-type]');
      if (b) { wz.p.svc = 0; wz.p.type = b.getAttribute('data-wz-type');
               wz.exact = ''; wz.dshift = 0; wz.adj = '0'; wzDraw(); return; }
      b = t.closest('[data-wz-svc]');
      if (b) { wz.p.svc = 1; wz.p.type = b.getAttribute('data-wz-svc');
               wz.exact = ''; wz.dshift = 0; wz.adj = '0'; wz.stages = 2; wzDraw(); return; }
      b = t.closest('[data-wz-disc]');
      if (b) { wz.p.disc = b.getAttribute('data-wz-disc'); wzSync(); return; }
      b = t.closest('[data-wz-term]');
      if (b) { wz.p.term = b.getAttribute('data-wz-term');
               wz.exact = ''; wz.dshift = 0; wzSync(); return; }
      b = t.closest('[data-wz-tier]');
      if (b) { wz.p.tier = b.getAttribute('data-wz-tier'); wzSync(); return; }

      if (t.closest('#wzCopy')) { wzCopy((wz.res || {}).url || ''); return; }
      if (t.closest('#wzMsg')) {
        var nm = ((wz.res || {}).order || {}).guest_name || 'Здравствуйте';
        wzCopy(nm + ', собрал заявку по вашей работе. Там весь план с датами, ' +
          'что входит и цена — заполнять ничего не надо, только посмотреть. ' +
          'Если всё верно, внизу кнопка оплаты.\n' + ((wz.res || {}).url || ''),
          'Текст для мессенджера в буфере');
        return;
      }
      if (t.closest('#wzGoCard')) {
        var oid = wz.oid || (((wz.res || {}).order || {}).id) || 0;
        wzClose();
        if (oid) { st.tab = 'orders'; st.filter = ''; st.sel = oid; st.card = null;
                   st.offnew = false; drawNav(); loadTab(true); }
        return;
      }
    });

    /* состояние пишется по событию, а не при отправке: экран 2 не
       перерисовывается, но «Собрать ещё одну» и «← другая заготовка» должны
       вернуть то, что мастер уже набрал */
    ov.addEventListener('input', function (e) {
      var t = e.target;
      if (!t || !t.id) return;
      if (t.id === 'wzTopic') { wz.topic = t.value; return; }
      if (t.id === 'wzName') { wz.name = t.value; return; }
      if (t.id === 'wzPriceIn') {
        var v = parseInt(t.value, 10);
        if (v > 0) { wz.adj = 'own'; wz.own = v; wzSync(true); }
        return;
      }
    });
    ov.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || !t.id) return;
      if (t.id === 'wzFiles') { wz.files = t.checked ? 1 : 0; return; }
      if (t.id === 'wzDateIn') {
        var d = wzParse(t.value);
        if (!d || wzDiff(d) < wzFloor()) {
          wzSay('Такой срок мастерская не потянет — минимум ' + wzFloor() + ' дней', 1);
          wzSync(); return;
        }
        wz.exact = wzISO(d); wzSync(); return;
      }
    });
    ov.addEventListener('toggle', function (e) {
      if (e.target && e.target.id === 'wzPrev' && e.target.open)
        wzHtm('wzPrevBody', wzPreviewHtml());
    }, true);

    document.addEventListener('keydown', function (e) {
      var o = document.getElementById('wzOv');
      if (!o || o.hidden) return;
      if (e.key === 'Escape') { wzClose(); return; }
      if (e.key === 'Enter' && wz.step === 2 && e.target && e.target.id === 'wzTopic') {
        e.preventDefault(); wzFire();
      }
    });
  }
}
if (document.prerendering) {
  document.addEventListener('prerenderingchange', initGodEye, { once: true });
} else {
  initGodEye();
}
