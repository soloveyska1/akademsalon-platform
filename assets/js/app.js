/* ============================================================
   АКАДЕМИЧЕСКИЙ САЛОН — общий слой «Оттиск»
   - калькулятор (window.SalonCalc) — единственный источник цен
   - UX-утилиты (Salon: store/toast/copy/mask/valid/countTo/seal)
   - колонтитул: шапка + индикатор раздела + «Оглавление»
   - подвал-колофон, мобильный CTA, reveal, prefetch
   ============================================================ */
(function () {
  'use strict';
  var docEl = document.documentElement;
  docEl.classList.add('has-js');
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- Калькулятор (единая логика, менять запрещено) ---------------- */
  var SalonCalc = {
    types: [
      { id: 'diplom',     label: 'Дипломная работа / ВКР',                         base: 40000 },
      { id: 'master',     label: 'Магистерская диссертация',                       base: 60000 },
      { id: 'chapter',    label: 'Глава диссертации',                              base: 30000 },
      { id: 'kandidat',   label: 'Кандидатская (по главам)',                          base: 200000 },
      { id: 'course',     label: 'Курсовая теоретическая',                         base: 14000 },
      { id: 'course_emp', label: 'Курсовая с исследованием (практика, расчёты)',   base: 20000 },
      { id: 'practice',   label: 'Отчёт по практике',                              base: 14000 },
      { id: 'vak',        label: 'Научная статья ВАК',                             base: 18000 },
      { id: 'scopus',     label: 'Научная статья Scopus / Web of Science',         base: 35000 },
      { id: 'rinc',       label: 'Научная статья РИНЦ',                            base: 9000 },
      { id: 'self',       label: 'Самостоятельная работа (реферат, эссе, контрольная)', base: 2500 }
    ],
    disciplines: [
      { id: 'hum',  label: 'Гуманитарные / экономика',                 k: 1.0 },
      { id: 'law',  label: 'Юриспруденция / педагогика / психология',  k: 1.15 },
      { id: 'tech', label: 'Технические / IT / программирование',      k: 1.3 },
      { id: 'med',  label: 'Медицина / финансы с расчётами',           k: 1.4 }
    ],
    terms: [
      { id: 'free',   label: 'Свободный (от 30 дней)', k: 1.0 },
      { id: 'mid',    label: '14–30 дней',             k: 1.15 },
      { id: 'urgent', label: 'Срочно (до 14 дней)',    k: 1.45 }
    ],
    tiers: [
      { id: 'base', label: 'Базовый',  k: 1.0,  note: 'Готовая работа' },
      { id: 'turn', label: 'Под ключ', k: 1.33, note: 'Сопровождение до защиты' },
      { id: 'vip',  label: 'VIP',      k: 2.0,  note: 'Личное ведение и защита' }
    ],
    round500: function (n) { return Math.round(n / 500) * 500; },
    fmt: function (n) { return n.toLocaleString('ru-RU'); },
    quote: function (baseId, discId, termId, tierId) {
      var t = this.types.find(function (x) { return x.id === baseId; }) || this.types[0];
      var d = this.disciplines.find(function (x) { return x.id === discId; }) || this.disciplines[0];
      var s = this.terms.find(function (x) { return x.id === termId; }) || this.terms[0];
      var v = this.tiers.find(function (x) { return x.id === tierId; }) || this.tiers[1];
      var low = this.round500(t.base * d.k * s.k * v.k);
      var high = this.round500(low * 1.4);
      return { low: low, high: high, lowFmt: this.fmt(low), highFmt: this.fmt(high), range: this.fmt(low) + ' – ' + this.fmt(high) + ' ₽' };
    }
  };
  window.SalonCalc = SalonCalc;

  /* Набор месяца — честный дефицит: квоту объявляет владелец (правило
     качества, задаётся в админке), занятые места сервер считает САМ по
     реальным заявкам месяца. Рисованных цифр нет: фальшивый дефицит
     убивает доверие быстрее любой цены. Сервер молчит — строка скрыта. */
  window.SalonSlots = { enabled: false, label: '', short: '', free: 0, quota: 0 };
  setTimeout(function slots() {
    /* Salon.api объявляется ниже по файлу — ждём конца синхронного прохода */
    var here_ = (location.pathname.split('/').pop() || 'index.html');
    if (here_ !== 'index.html' && here_ !== 'tariffs.html') return;
    if (!Salon.api) return;
    Salon.api.get('/slots').then(function (r) {
      if (!r || !r.ok || !r.on || !r.quota) return;
      var free = Math.max(0, r.quota - r.taken);
      var line = free > 0
        ? 'Набор на ' + r.month + ': свободно ' + free + ' из ' + r.quota + ' мест — место закрепляется после согласования плана'
        : 'Набор на ' + r.month + ' закрыт — идёт запись на ' + r.next;
      /* короткая форма — для обложки и финального CTA: тон мастерской,
         которая берёт столько, сколько ведёт лично, а не конвейера */
      var short_ = free > 0
        ? 'Набор на ' + r.month + ': свободно ' + free + ' из ' + r.quota + ' мест'
        : 'Набор на ' + r.month + ' закрыт · запись на ' + r.next;
      window.SalonSlots = { enabled: true, label: line, short: short_, free: free, quota: r.quota };
      /* печать квоты в прейскуранте: месяц + строка мест */
      var seal = document.getElementById('slotSeal');
      if (seal) {
        seal.querySelector('b').textContent = r.month;
        seal.querySelector('i').textContent = free > 0
          ? 'свободно ' + free + ' из ' + r.quota : 'мест нет · пишем на ' + r.next;
        seal.hidden = false;
      }
      var q = document.getElementById('qSlots');
      if (q) { q.textContent = line; q.hidden = false; }
      /* запись из журнала набора — на обложке и в финале главной:
         «НАБОР · ИЮЛЬ …отточие… свободно 2 из 15 мест», цифры сургучом */
      ['coverSlots', 'nextSlots'].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = '<span class="sl-k"></span>' +
          '<span class="sl-dots" aria-hidden="true"></span><span class="sl-v"></span>';
        el.querySelector('.sl-k').textContent = 'Набор · ' + r.month;
        el.querySelector('.sl-v').innerHTML = free > 0
          ? 'свободно <b>' + free + ' из ' + r.quota + '</b> мест'
          : 'мест нет — запись на <b>' + r.next + '</b>';
        el.hidden = false;
      });
    }).catch(function () {});
  }, 0);

  /* ---------------- Контакты (единственный источник ссылок) ----------------
     Главная площадка — сам сайт: конфигуратор и кабинет. Мессенджеры —
     по желанию клиента; порядок каналов: ВК → MAX → Telegram. */
  var LINKS = window.SalonLinks = {
    bot:   'https://t.me/academic_saloon_bot',   // бот: заявки, расчёт, статусы
    human: 'https://t.me/academicsaloon',        // личка: отвечает человек
    tgc:   'https://t.me/akademsalon',           // канал в Telegram: гайды и мастерская
    vk:    'https://vk.com/academicsaloon',      // сообщество ВКонтакте
    vkm:   'https://vk.me/academicsaloon',       // диалог с сообществом ВК
    max:   'https://max.ru/join/dP7MynBoq0tumYpQIc5e5UYtt_F9ZGElLsRetoIHZPs' // канал в MAX
  };
  /* монограмма мессенджера MAX — рисуем сами в тоне сайта (без чужих ассетов) */
  function maxLogoSVG(size) {
    size = size || 18;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<rect x="1.5" y="1.5" width="21" height="21" rx="6.5" stroke="currentColor" stroke-width="1.6"/>' +
      '<path d="M6.7 16.4V8.2l5.3 5.6 5.3-5.6v8.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
  }
  window.SalonMaxLogo = maxLogoSVG;
  /* короткие коды типов для deep-link в бота (?start=web_dp_h_u_t) */
  var TYPE_CODE = {
    diplom:'dp', master:'ms', chapter:'ch', kandidat:'kd', course:'cr',
    course_emp:'ce', practice:'pr', vak:'vk', scopus:'sc', rinc:'rc', self:'sf'
  };
  var DISC_CODE = { hum:'h', law:'l', tech:'t', med:'m' };
  var TERM_CODE = { free:'f', mid:'m', urgent:'u' };
  var TIER_CODE = { base:'b', turn:'t', vip:'v' };
  /* Собирает ссылку на бота с предзаполненной сметой (без личных данных). */
  window.SalonBotLink = function (st) {
    st = st || {};
    var parts = ['web', TYPE_CODE[st.type] || '', DISC_CODE[st.disc] || 'h',
                 TERM_CODE[st.term] || 'f', TIER_CODE[st.tier] || 'b'];
    var p = parts.join('_').replace(/[^A-Za-z0-9_]/g, '').slice(0, 60);
    return LINKS.bot + '?start=' + p;
  };

  /* ---------------- Отдельные услуги (плоские цены «от», вне формулы) ----------------
     У каждой услуги СВОЯ анкета (ask): конфигуратор в сервисном режиме
     рендерит эти вопросы вместо общей сметы — мастер сразу получает
     нужные детали. Поля вопроса: id, label, short (метка в сводке для
     мастера), type: chips|text|textarea, opts, ph (placeholder), req. */
  window.SalonServices = [
    { id:'plan', label:'Разбор плана', from:3000, unit:'', code:'pl', fixed:true,
      desc:'Структура глав, реалистичный срок и фиксированная смета за 1–2 дня. При продолжении работы стоимость разбора зачитывается полностью.',
      priceFor:function(a){ return (a.work === 'Магистерская' || a.work === 'Кандидатская') ? 5000 : 3000; },
      ask:[
        { id:'work', label:'Для какой работы нужен план?', short:'Работа', type:'chips', req:true,
          opts:['Курсовая','Диплом / ВКР','Магистерская','Кандидатская','Отчёт по практике','Другое'] },
        { id:'disc', label:'Направление', short:'Направление', type:'chips',
          opts:['Гуманитарные / экономика','Юриспруденция / педагогика','Технические / IT','Медицина / финансы'] },
        { id:'req', label:'Требования кафедры', short:'Требования', type:'textarea',
          ph:'Объём, число глав, особые пожелания. Методичку приложите файлом после отправки.' }
      ] },
    { id:'ai',    label:'Чистка текста от следов ИИ',        from:2500, unit:'',       code:'ai',
      desc:'Редактура и стилистическая доработка: убираем машинальные обороты и канцелярит, текст читается как живой.',
      ask:[
        { id:'vol', label:'Объём текста', short:'Объём', type:'chips',
          opts:['До 20 страниц','20–60 страниц','Больше 60'] },
        { id:'svc', label:'Каким сервисом проверяют?', short:'Сервис проверки', type:'text',
          ph:'Антиплагиат.ВУЗ, Текст.ру…' }
      ] },
    { id:'review',label:'Разбор готовой работы',             from:2500, unit:'',       code:'rv',
      desc:'Объясним структуру и логику вашей ВКР, курсовой или реферата, подготовим к вопросам на защите.',
      ask:[
        { id:'work', label:'Что за работа?', short:'Работа', type:'chips',
          opts:['Курсовая','Диплом / ВКР','Магистерская','Другое'] },
        { id:'when', label:'Когда защита или сдача?', short:'Защита', type:'text', ph:'Например, «20 июля»' }
      ] },
    { id:'tutor', label:'Репетиторство и консультации',      from:3000, unit:' / час', code:'tu',
      desc:'Индивидуальные занятия и разбор темы: методология, оформление, подготовка к сдаче — по вашему запросу.',
      ask:[
        { id:'fmt', label:'Формат', short:'Формат', type:'chips',
          opts:['Разовая консультация','Серия занятий','Пока не решил(а)'] },
        { id:'what', label:'Что разбираем?', short:'Запрос', type:'textarea',
          ph:'Предмет, тема, что вызывает сложность' }
      ] },
    { id:'norm',  label:'Оформление по методичке · нормоконтроль', from:5000, unit:'', code:'nm',
      desc:'Приводим работу к требованиям методички и ГОСТ, готовим к прохождению нормоконтроля.',
      ask:[
        { id:'guide', label:'Методичка на руках?', short:'Методичка', type:'chips',
          opts:['Да, приложу файлом','Нет — оформляем по ГОСТ'] },
        { id:'vol', label:'Объём работы', short:'Объём', type:'text', ph:'Примерно, в страницах' }
      ] },
    { id:'defense', label:'Презентация и речь к защите', from:6000, unit:'', code:'df',
      desc:'Слайды по готовой работе, текст доклада на 7 минут и вероятные вопросы комиссии.',
      ask:[
        { id:'when', label:'Когда защита?', short:'Защита', type:'text', req:true, ph:'Дата или «через 2 недели»' },
        { id:'len', label:'Регламент доклада', short:'Регламент', type:'chips',
          opts:['5 минут','7 минут','10 минут','Не знаю'] }
      ] },
    { id:'defensepack', label:'«К защите под ключ»: презентация + речь + нормоконтроль', from:9500, unit:'', code:'dp',
      desc:'Пакет со скидкой: нормоконтроль по методичке + презентация и речь. По отдельности — 11 000 ₽.',
      ask:[
        { id:'when', label:'Когда защита?', short:'Защита', type:'text', req:true, ph:'Дата или «через 2 недели»' }
      ] }
  ];

  /* ---------------- Профили компетенций по направлениям ---------------- */
  window.SalonExperts = {
    hum:  { name: 'Профиль: гуманитарные науки и экономика', desc: 'Социология, история, филология, менеджмент, маркетинг, экономическая теория.' },
    law:  { name: 'Профиль: право, педагогика, психология', desc: 'Гражданское и уголовное право, методика, возрастная и клиническая психология.' },
    tech: { name: 'Профиль: технические науки и IT',          desc: 'Программирование, инженерия, расчётные и проектные работы, анализ данных.' },
    med:  { name: 'Профиль: медицина и финансы',              desc: 'Клинические темы, доказательная база, финансовый анализ, эконометрика.' }
  };

  /* ---------------- UX-слой (Salon) ---------------- */
  var Salon = window.Salon = window.Salon || {};
  Salon.reduceMotion = reduceMotion;
  Salon.store = {
    get: function (k, fb) { try { var v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch (e) { return fb; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  Salon.plural = function (n, forms) {
    var a = Math.abs(n) % 100, b = a % 10;
    return forms[(a > 10 && a < 20) ? 2 : (b > 1 && b < 5) ? 1 : (b === 1) ? 0 : 2];
  };

  /* ---------------- Тема оформления (светлая «Оттиск» / «Оттиск ночью») ----------------
     Первичная тема выставляется инлайн-скриптом в <head> (без мигания).
     Переключение — «чернильной заливкой»: view transition раскрывает
     новую тему кругом от точки клика. Фолбэк — мягкий кросс-фейд. */
  var ttUid = 0;
  Salon.themeToggleHTML = function () {
    ttUid++;
    var m = 'ttm' + ttUid;
    return '<button class="theme-toggle" type="button" aria-label="Сменить тему оформления" title="Светлая / тёмная тема">' +
      '<svg class="tt-svg" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<mask id="' + m + '"><rect width="24" height="24" fill="#fff"/><circle class="tt-hole" cx="26" cy="2" r="0" fill="#000"/></mask>' +
        '<circle class="tt-core" cx="12" cy="12" r="4.6" fill="currentColor" mask="url(#' + m + ')"/>' +
        '<g class="tt-rays" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">' +
          '<line x1="12" y1="2.4" x2="12" y2="4.4"/><line x1="12" y1="19.6" x2="12" y2="21.6"/>' +
          '<line x1="2.4" y1="12" x2="4.4" y2="12"/><line x1="19.6" y1="12" x2="21.6" y2="12"/>' +
          '<line x1="5.2" y1="5.2" x2="6.6" y2="6.6"/><line x1="17.4" y1="17.4" x2="18.8" y2="18.8"/>' +
          '<line x1="18.8" y1="5.2" x2="17.4" y2="6.6"/><line x1="6.6" y1="17.4" x2="5.2" y2="18.8"/>' +
        '</g>' +
        '<g class="tt-stars" fill="currentColor"><circle cx="5.4" cy="6.4" r=".9"/><circle cx="8.1" cy="3.7" r=".6"/><circle cx="4" cy="10.4" r=".55"/></g>' +
      '</svg></button>';
  };
  Salon.theme = (function () {
    var THEME_BG = { light: '#F6F1E7', dark: '#14120E' };
    var vtBusy = false;
    function current() { return docEl.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
    function apply(mode, persist) {
      docEl.setAttribute('data-theme', mode);
      var m = document.querySelector('meta[name="theme-color"]');
      if (m) m.setAttribute('content', THEME_BG[mode]);
      docEl.querySelectorAll('.theme-toggle').forEach(function (b) {
        b.setAttribute('aria-pressed', String(mode === 'dark'));
        b.title = mode === 'dark' ? 'Тёмная тема · включить светлую' : 'Светлая тема · включить тёмную';
      });
      docEl.querySelectorAll('[data-theme-label]').forEach(function (l) {
        l.textContent = mode === 'dark' ? 'Тёмная тема' : 'Светлая тема';
      });
      if (persist) { try { localStorage.setItem('salon_theme', mode); } catch (e) {} }
    }
    /* чернильная заливка от точки (x, y) */
    function switchFrom(mode, x, y) {
      var canVT = typeof document.startViewTransition === 'function' && !reduceMotion && !vtBusy;
      if (!canVT) { apply(mode, true); return; }
      vtBusy = true;
      docEl.classList.add('vt-theme');
      var done = function () { vtBusy = false; docEl.classList.remove('vt-theme'); };
      var vt;
      try {
        vt = document.startViewTransition(function () { apply(mode, true); });
      } catch (e) { done(); apply(mode, true); return; }
      vt.ready.then(function () {
        var r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 24;
        docEl.animate(
          { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + r + 'px at ' + x + 'px ' + y + 'px)'] },
          { duration: 620, easing: 'cubic-bezier(.3,0,.3,1)', pseudoElement: '::view-transition-new(root)' }
        );
      }).catch(function () {});
      vt.finished.then(done, done);
    }
    function toggle() {
      var b = document.querySelector('.theme-toggle');
      var r = b ? b.getBoundingClientRect() : { left: window.innerWidth / 2, top: 0, width: 0, height: 0 };
      switchFrom(current() === 'dark' ? 'light' : 'dark', r.left + r.width / 2, r.top + r.height / 2);
    }
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.theme-toggle');
      if (!b) return;
      e.preventDefault();
      var rc = b.getBoundingClientRect();
      var x = e.clientX || rc.left + rc.width / 2;
      var y = e.clientY || rc.top + rc.height / 2;
      switchFrom(current() === 'dark' ? 'light' : 'dark', x, y);
    });
    /* если пользователь не выбирал тему вручную — следуем за системной */
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onSys = function () { var saved; try { saved = localStorage.getItem('salon_theme'); } catch (e) {}
        if (!saved) apply(mq.matches ? 'dark' : 'light', false); };
      if (mq.addEventListener) mq.addEventListener('change', onSys);
      else if (mq.addListener) mq.addListener(onSys);
    }
    return { toggle: toggle, apply: apply, current: current };
  })();

  /* ============================================================
     «ПОМЕТКИ НА ПОЛЯХ» — единый слой уведомлений «Оттиска».
     Заменяет Salon.toast (тёмный тост) и .onote (лист в углу).
     Три уровня: 'call'  — полоса набора, требует решения клиента;
                 'echo'  — оттиск его собственного действия;
                 'quiet' — только строка в реестре «Поля» и счётчик.
     ES5: var, конкатенация, без стрелок и шаблонных литералов.
     Показ БЕЗ rAF (void offsetWidth / setTimeout): в панели
     предпросмотра проекта кадр не наступает — обход снимать нельзя.
     ============================================================ */
  (function marginalia() {
    'use strict';
    var S = window.Salon || (window.Salon = {});
    var docEl = document.documentElement;
    var here = (location.pathname.split('/').pop() || 'index.html');
    var RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches);

    /* страницы решения: карточка не выходит ни при каких событиях */
    var HUSH_ALL = {
      'admin.html': 1, 'admin-mock.html': 1, '404.html': 1, 'dashboard.html': 1,
      'oferta.html': 1, 'privacy.html': 1, 'ustav.html': 1, 'priyomnaya.html': 1,
      'configurator.html': 1
    };
    /* денежные страницы: молчим обо всём, кроме денег по делу */
    var HUSH_SOFT = { 'oplata.html': 1, 'specifikaciya.html': 1 };
    var SOFT_PASS = { prepay: 1, priced: 1 };
    /* заголовок страницы ведут сами (кабинет) — не спорим */
    var TITLE_OFF = { 'dashboard.html': 1, 'admin.html': 1, 'admin-mock.html': 1 };

    var RANK = { check: 90, prepay: 85, priced: 80, msg: 60, file: 40, paused: 35,
                 work: 30, fix: 25, done: 20, cancel: 15, newo: 5 };

    var GAP_MS = 90000;       /* громкая — не чаще раза в полторы минуты   */
    var PER_HOUR = 3;         /* и не больше трёх в скользящий час          */
    var COLD_MS = 8000;       /* тишина первые 8 секунд ВИЗИТА             */
    var HOP_MS = 3000;        /* и первые 3 секунды после перехода         */
    var HOLD_MS = 180000;     /* потолок паузы под курсором                */
    var ECHO_MAX = 2;
    var MARKS_MAX = 30;
    var MARKS_TTL = 1209600000;   /* 14 суток */

    var rail = null, lrail = null, liveP = null, liveA = null, ledger = null;
    var current = null, echoes = [], queue = [], drainTimer = null;
    var hopT0 = Date.now(), baseTitle = null;

    /* ---------------- хранилище ---------------- */
    function get(k, fb) { return (S.store && S.store.get) ? S.store.get(k, fb) : fb; }
    function set(k, v) { if (S.store && S.store.set) S.store.set(k, v); }
    function sget(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
    function sset(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} return v; }

    /* начало ВИЗИТА, а не страницы: иначе холодные 8 секунд обнуляются на
       каждой из 71 страницы и громкий канал не заговорит никогда */
    var visitT0 = parseInt(sget('salon_t0') || '0', 10);
    if (!visitT0) { visitT0 = Date.now(); sset('salon_t0', String(visitT0)); }

    /* ---------------- единый нижний якорь --floor ----------------
       ОДНА переменная вместо шести формул max(база, --resume-clear+12).
       Считается как ЗАНЯТАЯ КРОМКА, а не как сумма высот: .resume-bar
       стоит ПОВЕРХ .mobile-cta (её bottom = высоте панели), поэтому
       сложение давало лишние ~76px. */
    function measure() {
      var f = 0, r, cs, nav, bar, hdr, narrow, lh;
      nav = document.querySelector('.mobile-cta');
      if (nav) { cs = getComputedStyle(nav); if (cs.display !== 'none') f = Math.round(nav.getBoundingClientRect().height); }
      bar = document.querySelector('.resume-bar');
      if (bar && bar.parentNode) {
        r = bar.getBoundingClientRect();
        f = Math.max(f, Math.round(window.innerHeight - r.top));
      }
      docEl.style.setProperty('--floor', (f > 0 ? f : 0) + 'px');

      hdr = document.querySelector('.site-header');
      docEl.style.setProperty('--hdr-h', (hdr ? Math.round(hdr.getBoundingClientRect().height) : 64) + 'px');

      /* на телефоне рельсы делят одну кромку: правый встаёт НАД левым */
      narrow = !!(window.matchMedia && window.matchMedia('(max-width:880px)').matches);
      lh = 0;
      if (narrow && lrail && lrail.children.length) {
        r = lrail.getBoundingClientRect();
        if (r.height > 0) lh = Math.round(r.height) + 10;
      }
      docEl.style.setProperty('--lrail-h', lh + 'px');
    }
    S.floor = measure;
    window.addEventListener('resize', measure, { passive: true });
    window.addEventListener('orientationchange', function () { setTimeout(measure, 250); });
    if (window.visualViewport && window.visualViewport.addEventListener) {
      window.visualViewport.addEventListener('resize', measure);
    }

    /* ---------------- рельсы ---------------- */
    function ensure() {
      if (rail) return rail;
      rail = document.createElement('div');
      rail.className = 'mrail'; rail.id = 'mrail';
      lrail = document.createElement('div');
      lrail.className = 'lrail'; lrail.id = 'lrail';

      /* живые регионы создаются ПУСТЫМИ и заранее: регион, вставленный
         сразу с текстом, большинство скринридеров не озвучивает */
      liveP = document.createElement('div');
      liveP.className = 'mrail-live';
      liveP.setAttribute('role', 'status');
      liveP.setAttribute('aria-live', 'polite');
      liveP.setAttribute('aria-atomic', 'false');
      liveA = liveP.cloneNode(false);
      liveA.setAttribute('aria-live', 'assertive');
      rail.appendChild(liveP);
      rail.appendChild(liveA);

      place();
      adopt();
      if (window.MutationObserver) {
        var mo = new MutationObserver(function () { measure(); });
        mo.observe(rail, { childList: true });
        mo.observe(lrail, { childList: true });
      }
      measure();
      setTimeout(measure, 400);   /* шрифты доехали — высоты поменялись */
      return rail;
    }

    /* рельсы стоят ПОСЛЕ main и ПЕРЕД подвалом: карточка достижима с
       клавиатуры сразу после содержимого, а постоянная пилюля «Связаться»
       не влезает в начало таб-порядка каждой страницы */
    function place() {
      var anchor = document.querySelector('.site-footer');
      if (anchor && anchor.parentNode === document.body) {
        document.body.insertBefore(lrail, anchor);
        document.body.insertBefore(rail, anchor);
      } else {
        document.body.appendChild(lrail);
        document.body.appendChild(rail);
      }
    }

    /* пилюля «Связаться», куки-плашка и закладка помощи перестают быть
       самостоятельными position:fixed и становятся детьми рельсов */
    function adopt() {
      if (!rail) return;
      var pill = document.querySelector('.tg-pill');
      if (pill && pill.parentNode !== rail) rail.appendChild(pill);
      var cb = document.querySelector('.cookiebar');
      if (cb && cb.parentNode !== lrail) lrail.appendChild(cb);
      var hf = document.querySelector('.helpfab');
      if (hf && hf.parentNode !== lrail) {
        if (cb && cb.parentNode === lrail) lrail.insertBefore(hf, cb);
        else lrail.appendChild(hf);
      }
      measure();
    }
    S.railAdopt = adopt;

    /* ---------------- реестр «Поля» ---------------- */
    function marks() {
      var a = get('salon_marks', null), out = [], i, cut = Date.now() - MARKS_TTL;
      if (!a || !a.length) return out;
      for (i = 0; i < a.length; i++) if (a[i] && a[i].ts > cut) out.push(a[i]);
      return out;
    }
    function unreadN() {
      var a = marks(), n = 0, i;
      for (i = 0; i < a.length; i++) if (!a[i].read) n++;
      return n;
    }
    function mark(rec) {
      if (!rec || !rec.k) return false;
      var a = marks(), i;
      for (i = 0; i < a.length; i++) if (a[i].k === rec.k) return false;
      a.unshift(rec);
      set('salon_marks', a.slice(0, MARKS_MAX));
      badge(true);
      if (ledger && !ledger.hidden) drawLedger();
      return true;
    }
    function readOne(k) {
      var a = marks(), i, ch = false;
      for (i = 0; i < a.length; i++) if (a[i].k === k && !a[i].read) { a[i].read = true; ch = true; }
      if (ch) { set('salon_marks', a); badge(false); }
    }
    function readAll() {
      var a = marks(), i;
      for (i = 0; i < a.length; i++) a[i].read = true;
      set('salon_marks', a);
      badge(false);
      drawLedger();
    }
    S.marks = { list: marks, add: mark, unread: unreadN, readAll: readAll, open: function () { openLedger(); } };

    function badge(printed) {
      var n = unreadN(), total = marks().length, btn, el;
      /* заголовок правится ПЕРВЫМ — раньше любых ранних выходов */
      if (!TITLE_OFF[here]) {
        if (baseTitle === null) baseTitle = document.title.replace(/^\(\d+\)\s*/, '');
        document.title = n ? '(' + n + ') ' + baseTitle : baseTitle;
      }
      btn = document.querySelector('.nav-marks');
      if (!btn) return;
      btn.hidden = !total;
      el = btn.querySelector('.nm-n');
      if (!el) return;
      if (n) { el.textContent = n > 9 ? '9+' : String(n); el.hidden = false; }
      else { el.hidden = true; }
      if (printed && n && !RM) { el.classList.remove('ink'); void el.offsetWidth; el.classList.add('ink'); }
    }

    function mountMarks() {
      var cta = document.querySelector('.nav-cta'), b, cab;
      if (!cta || cta.querySelector('.nav-marks')) return;
      b = document.createElement('button');
      b.type = 'button';
      b.className = 'nav-marks';
      b.id = 'navMarks';
      b.hidden = true;
      b.setAttribute('aria-expanded', 'false');
      b.setAttribute('aria-controls', 'mledger');
      b.setAttribute('aria-label', 'Пометки на полях');
      b.innerHTML = '<span class="nm-g" aria-hidden="true">¶</span><span class="nm-n" hidden></span>';
      cab = cta.querySelector('.nav-cab');
      if (cab) cta.insertBefore(b, cab); else cta.appendChild(b);
      b.addEventListener('click', function () { if (ledger && !ledger.hidden) closeLedger(); else openLedger(); });
    }

    function when(ts) {
      var d = new Date(ts), n = new Date();
      function p(x) { return (x < 10 ? '0' : '') + x; }
      var same = d.getDate() === n.getDate() && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
      return (same ? 'сегодня' : p(d.getDate()) + '.' + p(d.getMonth() + 1)) + ', ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    function buildLedger() {
      if (ledger) return ledger;
      ledger = document.createElement('div');
      ledger.className = 'mledger';
      ledger.id = 'mledger';
      ledger.setAttribute('role', 'dialog');
      ledger.setAttribute('aria-modal', 'false');
      ledger.setAttribute('aria-labelledby', 'mlH');
      ledger.hidden = true;
      ledger.innerHTML =
        '<div class="ml-head">' +
          '<h3 id="mlH">Пометки на полях</h3>' +
          '<button type="button" class="ml-x" data-ml-x aria-label="Закрыть">×</button>' +
        '</div>' +
        '<ol class="ml-list"></ol>' +
        '<p class="ml-empty" hidden>Поля чистые. Всё по делу — в кабинете.</p>' +
        '<div class="ml-foot">' +
          '<button type="button" class="ml-clear" data-ml-clear>Отметить всё прочтённым</button>' +
          '<a class="ml-all" href="dashboard.html">Все дела <span class="ar" aria-hidden="true">→</span></a>' +
        '</div>';
      document.body.appendChild(ledger);
      ledger.addEventListener('click', function (e) {
        var t = e.target;
        if (t.closest('[data-ml-x]')) { closeLedger(); return; }
        if (t.closest('[data-ml-clear]')) { readAll(); return; }
        var a = t.closest('a.ml-go');
        if (a) readOne(a.getAttribute('data-k'));
      });
      return ledger;
    }

    function drawLedger() {
      var box = buildLedger(), list = box.querySelector('.ml-list'), a = marks(), i, li, go, sp;
      while (list.firstChild) list.removeChild(list.firstChild);
      for (i = 0; i < a.length; i++) {
        li = document.createElement('li');
        li.className = 'ml-row' + (a[i].read ? '' : ' is-new');
        go = document.createElement('a');
        go.className = 'ml-go';
        go.setAttribute('href', a[i].href || 'dashboard.html');
        go.setAttribute('data-k', a[i].k);

        sp = document.createElement('span'); sp.className = 'ml-what';
        sp.textContent = a[i].text || ''; go.appendChild(sp);

        sp = document.createElement('span'); sp.className = 'ml-dots';
        sp.setAttribute('aria-hidden', 'true'); go.appendChild(sp);

        sp = document.createElement('span'); sp.className = 'ml-no';
        sp.textContent = a[i].no ? String(a[i].no) : ''; go.appendChild(sp);

        sp = document.createElement('span'); sp.className = 'ml-when';
        sp.textContent = when(a[i].ts); go.appendChild(sp);

        li.appendChild(go);
        list.appendChild(li);
      }
      box.querySelector('.ml-empty').hidden = a.length > 0;
      box.querySelector('.ml-foot').hidden = a.length === 0;
    }

    function outside(e) {
      if (!ledger || ledger.hidden) return;
      if (ledger.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.nav-marks')) return;
      closeLedger();
    }
    function openLedger() {
      buildLedger();
      drawLedger();
      ledger.hidden = false;
      void ledger.offsetWidth;
      ledger.classList.add('open');
      var b = document.querySelector('.nav-marks'), f;
      if (b) b.setAttribute('aria-expanded', 'true');
      f = ledger.querySelector('.ml-x');
      if (f) { try { f.focus(); } catch (e) {} }
      document.addEventListener('click', outside, true);
    }
    function closeLedger() {
      if (!ledger || ledger.hidden) return;
      ledger.classList.remove('open');
      var b = document.querySelector('.nav-marks');
      if (b) { b.setAttribute('aria-expanded', 'false'); try { b.focus(); } catch (e) {} }
      setTimeout(function () { if (ledger) ledger.hidden = true; }, RM ? 0 : 200);
      document.removeEventListener('click', outside, true);
      kick();   /* реестр закрылся — занятость снята, очередь может пойти */
    }

    /* ---------------- занятость и очередь ---------------- */
    function busy() {
      if (document.hidden) return true;
      if (S.tour && S.tour.active && S.tour.active()) return true;
      if (docEl.classList.contains('has-prelude')) return true;
      if (ledger && !ledger.hidden) return true;
      return !!document.querySelector('.contact-sheet, .sdlg.open, .toc.open, .tour-veil, .page-veil.act');
    }
    /* очередь разбирается не только по закрытию карточки, но и по СНЯТИЮ
       занятости: закрыли Путеводитель, лист связи, диалог, вернулись во
       вкладку. Самозаводящийся тик дешевле наблюдателей и не течёт. */
    function kick() {
      if (!queue.length) return;
      if (!drainTimer) {
        drainTimer = setInterval(function () {
          if (!queue.length) { clearInterval(drainTimer); drainTimer = null; return; }
          drain();
        }, 700);
      }
      drain();
    }
    function drain() {
      if (!queue.length || current || busy()) return;
      if (Date.now() - visitT0 < COLD_MS) return;
      if (Date.now() - hopT0 < HOP_MS) return;
      if (!canLoud()) { queue.length = 0; return; }   /* колпак: всё уже в полях */
      queue.sort(function (a, b) { return (RANK[b.kind] || 0) - (RANK[a.kind] || 0); });
      var top = queue.shift();
      queue.length = 0;                                /* остальное — в полях, не копим */
      render(top);
    }

    /* ---------------- частотные колпаки ---------------- */
    function loudLog() {
      var c = get('salon_caps', null) || {}, a = c.loud || [], now = Date.now(), keep = [], i;
      for (i = 0; i < a.length; i++) if (now - a[i] < 3600000) keep.push(a[i]);
      return keep;
    }
    function canLoud() {
      var keep = loudLog(), now = Date.now();
      if (keep.length >= PER_HOUR) return false;
      if (keep.length && now - keep[keep.length - 1] < GAP_MS) return false;
      return true;
    }
    function tookLoud() {
      var c = get('salon_caps', null) || {}, keep = loudLog();
      keep.push(Date.now());
      c.loud = keep;
      set('salon_caps', c);
    }

    /* ---------------- эмодзи → тон линейки ----------------
       Смысл переезжает из значка в цвет линейки: скринридер больше не
       читает «галочка», а «Оттиск» не держит в наборе эмодзи. */
    var OK_RE = /[✅✔✓⭐]|🎉|\uD83D[\uDCC5\uDCE6\uDD12\uDD14\uDCDD\uDCE3\uDD04]/;
    var BAD_RE = /[⛔❌❗⚠]|🚫/;
    function sniff(raw) {
      if (BAD_RE.test(raw)) return 'wax';
      if (OK_RE.test(raw)) return 'verify';
      return 'stamp';
    }
    function clean(s) {
      return String(s)
        .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
        .replace(/[\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u200D\u20E3]/g, '')
        .replace(/\s+([,.:;!?])/g, '$1')
        .replace(/\s{2,}/g, ' ')
        .replace(/^\s+|\s+$/g, '');
    }

    /* ---------------- сборка ---------------- */
    function build(o) {
      var el = document.createElement('article'), loud = (o.level === 'call'), go, sub, act, lead;
      el.className = 'mnote mnote--' + (loud ? 'call' : 'echo') + ' is-' + (o.tone || 'stamp');
      el._spec = o;
      if (loud) {
        el.setAttribute('tabindex', '-1');
        el.setAttribute('role', 'group');
        el.innerHTML =
          '<span class="mn-seal" aria-hidden="true">¶</span>' +
          '<div class="mn-body">' +
            '<span class="mn-cap"><span class="mc-no"></span>' +
              '<span class="mc-dots" aria-hidden="true"></span>' +
              '<span class="mc-st"></span></span>' +
            '<b class="mn-t"></b>' +
            '<p class="mn-sub"></p>' +
            '<div class="mn-act">' +
              '<a class="mn-go btn btn-line"></a>' +
              '<button type="button" class="mn-later">Позже</button>' +
            '</div>' +
          '</div>' +
          '<button type="button" class="mn-x" aria-label="Убрать в поля">×</button>';
        el.querySelector('.mc-no').textContent = o.cap || '';
        el.querySelector('.mc-st').textContent = o.state || '';
        el.querySelector('.mn-t').textContent = o.title || '';
        sub = el.querySelector('.mn-sub');
        if (o.sub) sub.textContent = o.sub;
        else sub.parentNode.removeChild(sub);
        go = el.querySelector('.mn-go');
        go.setAttribute('href', o.href || 'dashboard.html');
        go.textContent = (o.goLabel || 'Открыть дело') + ' ';
        go.insertAdjacentHTML('beforeend', '<span class="ar" aria-hidden="true">→</span>');
        el.querySelector('.mn-later').addEventListener('click', function () { close(el, true); });
      } else {
        el.innerHTML =
          '<span class="mn-ic" aria-hidden="true">§</span>' +
          '<span class="mn-msg"></span>' +
          '<span class="mn-lead" aria-hidden="true"><i></i></span>' +
          '<button type="button" class="mn-x" aria-label="Закрыть">×</button>';
        el.querySelector('.mn-msg').textContent = o.text || '';
        if (o.action && o.action.label) {
          act = document.createElement('button');
          act.type = 'button';
          act.className = 'mn-do';
          act.textContent = o.action.label;
          act.addEventListener('click', function () {
            try { if (o.action.onClick) o.action.onClick(); } catch (e) {}
            close(el, false);
          });
        } else if (o.href) {
          act = document.createElement('a');
          act.className = 'mn-do';
          act.setAttribute('href', o.href);
          act.textContent = o.hrefLabel || 'Открыть';
        }
        if (act) {
          lead = el.querySelector('.mn-lead');
          el.replaceChild(act, lead);   /* отточие уступает место действию */
          el.classList.add('has-do');
        }
      }
      el.querySelector('.mn-x').addEventListener('click', function () { close(el, o.level === 'call'); });
      return el;
    }

    function announce(o) {
      if (!liveP) return;
      var box = (o.level === 'call') ? liveA : liveP;
      var txt = (o.level === 'call')
        ? ((o.cap ? o.cap + '. ' : '') + (o.state ? o.state + '. ' : '') + (o.title || '') + (o.sub ? ' ' + o.sub : ''))
        : (o.text || '');
      box.textContent = '';
      setTimeout(function () { box.textContent = txt; }, 60);
    }

    function render(o) {
      var r = ensure(), el = build(o), pill = r.querySelector('.tg-pill'), life, lead, old;
      if (pill) r.insertBefore(el, pill); else r.appendChild(el);
      void el.offsetWidth;                 /* показ без rAF: кадр может не наступить */
      el.classList.add('in');

      if (o.level === 'call') {
        current = el;
        tookLoud();
        /* у громкой карточки ТАЙМЕРА НЕТ. Она про деньги и срок; исчезающий
           отсчёт рядом с ценой читается как «предложение истекает». Уходит
           только по «Позже», крестику, свайпу или Escape. */
      } else {
        echoes.push(el);
        while (echoes.length > ECHO_MAX) { old = echoes.shift(); close(old, false); }
        life = o.duration ? o.duration : Math.min(9000, 5500 + String(o.text || '').length * 60);
        if (o.href || o.action) life = Math.min(12000, Math.round(life * 1.6));
        lead = el.querySelector('.mn-lead i');
        if (RM || !lead) {
          el._timer = setTimeout(function () { close(el, false); }, life);
        } else {
          /* фирменный приём: отточие само себя стирает справа налево.
             Пауза при hover/focus — animation-play-state, значит пауза
             анимации и пауза таймера физически одно и то же. */
          lead.style.animationDuration = life + 'ms';
          lead.addEventListener('animationend', function () { close(el, false); });
          /* потолок паузы: забытая под курсором строка не висит вечно */
          el._hold = setTimeout(function () { close(el, false); }, life + HOLD_MS);
        }
      }
      announce(o);
      swipe(el);
      measure();
      return el;
    }

    function close(el, toMargin) {
      if (!el || el._dead) return;
      el._dead = true;
      if (el._timer) { clearTimeout(el._timer); el._timer = null; }
      if (el._hold) { clearTimeout(el._hold); el._hold = null; }
      var i = echoes.indexOf(el);
      if (i > -1) echoes.splice(i, 1);          /* СИНХРОННО: иначе while зациклится */
      if (current === el) current = null;
      if (toMargin && el._spec && el._spec.rec) mark(el._spec.rec);
      /* max-height ставится ТОЛЬКО на выход: в покое none, иначе на 200%
         зуме карточка обрезается по нижней кромке */
      el.style.maxHeight = el.scrollHeight + 'px';
      void el.offsetWidth;
      el.classList.remove('in');
      el.classList.add('out');
      el.style.maxHeight = '0px';
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
        measure();
        kick();
      }, RM ? 200 : 340);
    }

    /* ---------------- свайп вправо (телефон) ---------------- */
    function swipe(el) {
      var x0 = 0, y0 = 0, dx = 0, on = false, lock = 0;
      el.addEventListener('touchstart', function (e) {
        if (e.touches.length !== 1) return;
        x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
        dx = 0; lock = 0; on = true;
        el.classList.add('swiping');
      }, { passive: true });
      el.addEventListener('touchmove', function (e) {
        if (!on) return;
        var x = e.touches[0].clientX, y = e.touches[0].clientY;
        if (!lock) lock = (Math.abs(x - x0) > Math.abs(y - y0) + 4) ? 1 : -1;
        if (lock < 0) return;                    /* вертикаль — это скролл страницы */
        dx = Math.max(0, x - x0);
        el.style.transform = 'translateX(' + dx + 'px)';
        el.style.opacity = String(Math.max(0, 1 - dx / 220));
      }, { passive: true });
      function up() {
        if (!on) return;
        on = false;
        el.classList.remove('swiping');
        if (dx > 64) { el.style.transform = 'translateX(110%)'; close(el, true); }
        else { el.style.transform = ''; el.style.opacity = ''; }
      }
      el.addEventListener('touchend', up);
      el.addEventListener('touchcancel', up);
    }

    /* ---------------- квитанция вызова ----------------
       Функция (старый контракт Salon.toast → dismiss) + поля статуса,
       чтобы поллер писал ключ ПОСЛЕ доставки, а не после вызова. */
    function receipt() {
      var f = function () { if (f.dismiss) f.dismiss(); };
      f.delivered = false;
      f.channel = 'none';
      f.dismiss = null;
      return f;
    }

    /* ---------------- ЕДИНАЯ ТОЧКА ПОКАЗА ---------------- */
    S.note = function (spec) {
      var o = spec || {}, out = receipt(), el, landed, raw;
      o.level = o.level || 'echo';
      o.kind = o.kind || o.level;

      /* ЭХО — ответ на действие клиента в этой вкладке. Работает везде,
         включая тихие страницы и админку: человек нажал и ждёт ответа. */
      if (o.level === 'echo') {
        raw = o.text == null ? '' : String(o.text);
        o.text = clean(raw);
        if (!o.text) return out;
        if (!o.tone) o.tone = sniff(raw);
        el = render(o);
        out.delivered = true;
        out.channel = 'echo';
        out.dismiss = function () { close(el, false); };
        return out;
      }

      /* СЕРВЕРНОЕ СОБЫТИЕ сначала ложится в поля и только потом, если
         позволено, поднимается до карточки. Терять нечего в принципе. */
      landed = o.rec ? mark(o.rec) : false;
      out.delivered = !!(landed || !o.rec);
      out.channel = 'ledger';
      if (o.rec && !landed) { out.delivered = true; out.channel = 'dup'; return out; }

      if (o.level !== 'call') return out;
      if (HUSH_ALL[here]) return out;
      if (HUSH_SOFT[here] && !SOFT_PASS[o.kind]) return out;
      if (!canLoud()) return out;

      if (current) {
        if ((RANK[o.kind] || 0) <= (RANK[(current._spec || {}).kind] || 0)) return out;
        close(current, true);                    /* приоритетнее — вытесняет */
        queue.push(o); kick();
        out.channel = 'queued';
        return out;
      }
      if (busy() || Date.now() - visitT0 < COLD_MS || Date.now() - hopT0 < HOP_MS) {
        queue.push(o); kick();
        out.channel = 'queued';
        return out;
      }
      el = render(o);
      out.channel = 'call';
      out.dismiss = function () { close(el, true); };
      return out;
    };

    /* ---------------- совместимость: старая сигнатура ----------------
       Salon.toast(msg, {type,action,href,hrefLabel,duration}) — все 131
       существующий вызов продолжают работать, возвращается dismiss. */
    var TYPE_TONE = { success: 'verify', error: 'wax', info: 'stamp' };
    S.toast = function (msg, opts) {
      opts = opts || {};
      return S.note({
        level: 'echo',
        text: msg,
        tone: TYPE_TONE[opts.type] || null,
        action: opts.action || null,
        href: opts.href || null,
        hrefLabel: opts.hrefLabel || null,
        duration: opts.duration || 0
      });
    };

    /* ---------------- вкладка-лидер ----------------
       Опрашивает /orders и показывает только одна вкладка: чинит гонку
       setInterval(90000) × visibilitychange(800ms), дававшую дубль. */
    S.lead = function () {
      var id = sget('salon_tab'), l, now = Date.now();
      if (!id) { id = 't' + now + Math.random().toString(36).slice(2, 7); sset('salon_tab', id); }
      l = get('salon_lead', null);
      if (!l || !l.id || l.id === id || now - l.ts > 5000) {
        set('salon_lead', { id: id, ts: now });
        return true;
      }
      return false;
    };

    /* ---------------- клавиатура и фон ---------------- */
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' && e.keyCode !== 27) return;
      if (ledger && !ledger.hidden) { closeLedger(); return; }
      /* Escape отдаётся модальным слоям, если они открыты */
      if (document.querySelector('.sdlg.open, .toc.open, .contact-sheet')) return;
      if (current) { close(current, true); return; }
      if (echoes.length) close(echoes[echoes.length - 1], false);
    });
    document.addEventListener('visibilitychange', function () {
      if (rail) { if (document.hidden) rail.classList.add('held'); else rail.classList.remove('held'); }
      if (!document.hidden) kick();
    });
    window.addEventListener('storage', function (e) {
      if (!e.key || e.key.indexOf('salon_marks') < 0) return;
      badge(false);
      if (ledger && !ledger.hidden) drawLedger();
    });

    /* ---------------- запуск ---------------- */
    function init() {
      ensure();
      if (rail && document.querySelector('.site-footer')) place();  /* подвал появился позже */
      mountMarks();
      badge(false);
      adopt();
      setTimeout(adopt, 1200);   /* куки-плашка и закладка помощи приходят позже */
      measure();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else setTimeout(init, 0);
  })();

  Salon.copy = function (text) {
    return new Promise(function (res) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { res(true); }, fb);
      } else fb();
      function fb() {
        try {
          var ta = document.createElement('textarea'); ta.value = text;
          ta.style.cssText = 'position:fixed;top:-9999px'; document.body.appendChild(ta);
          ta.select(); document.execCommand('copy'); ta.remove(); res(true);
        } catch (e) { res(false); }
      }
    });
  };

  Salon.mask = {
    phone: function (v) {
      var d = v.replace(/\D/g, '').replace(/^8/, '7').replace(/^([^7])/, '7$1').slice(0, 11);
      if (!d) return '';
      var r = '+7'; if (d.length > 1) r += ' (' + d.slice(1, 4);
      if (d.length >= 4) r += ') ' + d.slice(4, 7);
      if (d.length >= 7) r += '-' + d.slice(7, 9);
      if (d.length >= 9) r += '-' + d.slice(9, 11);
      return r;
    },
    telegram: function (v) { var s = v.trim().replace(/^@?/, '@').replace(/[^@\w]/g, ''); return s === '@' ? '' : s; }
  };
  Salon.valid = {
    email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); },
    phone: function (v) { return v.replace(/\D/g, '').length === 11; },
    telegram: function (v) { return /^@\w{4,}$/.test(v); },
    vk: function (v) { return /^(https?:\/\/)?(m\.)?(vk\.com|vk\.me)\/[A-Za-z0-9_.]{2,}$/i.test(v.trim()); },
    contact: function (v) { return Salon.valid.phone(v) || Salon.valid.telegram(v) || Salon.valid.email(v) || Salon.valid.vk(v); }
  };
  Salon.btnLoading = function (btn, on, txt) {
    if (on) { btn.dataset._t = btn.innerHTML; btn.disabled = true; btn.classList.add('is-loading');
      btn.innerHTML = '<span class="spin"></span>' + (txt || 'Отправляем…'); }
    else { btn.disabled = false; btn.classList.remove('is-loading'); if (btn.dataset._t) btn.innerHTML = btn.dataset._t; }
  };

  /* Одометр: цифры «допечатываются» до значения. countTo(el, 79500, {suffix:' ₽'}) */
  Salon.countTo = function (el, target, opts) {
    opts = opts || {};
    var suffix = opts.suffix != null ? opts.suffix : '';
    var prefix = opts.prefix != null ? opts.prefix : '';
    function put(n) { el.textContent = prefix + Math.round(n).toLocaleString('ru-RU') + suffix; }
    if (reduceMotion || opts.instant) { el.dataset.cur = String(target); put(target); return; }
    var from = parseFloat(el.dataset.cur || '0') || 0;
    el.dataset.cur = String(target);
    var dur = opts.duration || 420, t0 = null;
    /* страховка от мёртвого rAF: финальное число встанет по таймеру,
       даже если анимация не сыграет ни одного кадра */
    var guard = setTimeout(function () {
      if (el.dataset.cur === String(target)) put(target);
    }, dur + 150);
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min((ts - t0) / dur, 1);
      var e = 1 - Math.pow(1 - p, 4);
      put(from + (target - from) * e);
      if (p < 1 && el.dataset.cur === String(target)) requestAnimationFrame(step);
      else clearTimeout(guard);
    }
    requestAnimationFrame(step);
  };

  /* Круглая печать-штемпель: SVG с текстом по окружности (наследует currentColor) */
  Salon.sealSVG = function (opts) {
    opts = opts || {};
    var ring = (opts.ring || 'ОТЧЁТ О ПРОВЕРКАХ · ДО ОПЛАТЫ · ').toUpperCase();
    var center = opts.center || '¶';
    var size = opts.size || 116;
    var id = 'sealp' + Math.abs((ring + center).split('').reduce(function (a, c) { return (a * 31 + c.charCodeAt(0)) | 0; }, 7));
    var label = ring.replace(/"/g, '').replace(/\s*·\s*$/, '').replace(/\s*·\s*/g, ', ');
    return '<svg class="seal press ' + (opts.cls || 'seal--verify') + '" width="' + size + '" height="' + size + '" viewBox="0 0 120 120" role="img" aria-label="Печать: ' + label + '">' +
      '<defs><path id="' + id + '" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0"/></defs>' +
      '<circle cx="60" cy="60" r="56" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
      '<circle cx="60" cy="60" r="33" fill="none" stroke="currentColor" stroke-width="1"/>' +
      '<text style="font:600 10.5px \'Golos Text\',sans-serif;letter-spacing:.22em" fill="currentColor"><textPath href="#' + id + '">' + ring + '</textPath></text>' +
      '<text x="60" y="61" text-anchor="middle" dominant-baseline="central" style="font:500 26px \'Literata\',serif" fill="currentColor">' + center + '</text>' +
      '</svg>';
  };

  /* ---------------- Скип-линк + #main ---------------- */
  (function () {
    var main = document.querySelector('main') || document.querySelector('section');
    if (main && !main.id) main.id = 'main';
    if (main && !document.querySelector('.skip-link')) {
      var skip = document.createElement('a');
      skip.className = 'skip-link'; skip.href = '#' + main.id; skip.textContent = 'К содержанию';
      document.body.insertBefore(skip, document.body.firstChild);
    }
  })();

  /* ---------------- Колонтитул (шапка) ----------------
     ОДНА шапка на всех страницах, включая главную: те же ссылки,
     тот же порядок — читатель никогда не теряется. */
  var here = (location.pathname.split('/').pop() || 'index.html') || 'index.html';
  var NAV = [
    { href: 'start.html',      label: 'С чего начать' },
    { href: 'tariffs.html',    label: 'Цены' },
    { href: 'guarantees.html', label: 'Гарантии' },
    { href: 'reviews.html',    label: 'Отзывы', x2: true },
    { href: 'knowledge.html',  label: 'Полезные материалы', x: true }
  ];
  /* Маршрут новичка: линейный путь «за ручку» от цен до заявки.
     Он же рисует полоску «Дальше по маршруту» внизу этих страниц. */
  var ROUTE = [
    { href: 'tariffs.html',      label: 'Цены и каталог' },
    { href: 'vedenie.html',      label: 'Уровни ведения' },
    { href: 'oplata.html',       label: 'Оплата' },
    { href: 'guarantees.html',   label: 'Гарантии' },
    { href: 'reviews.html',      label: 'Отзывы' },
    { href: 'configurator.html', label: 'Рассчитать и отправить' }
  ];
  /* Путеводитель: разделы сгруппированы по смыслу, у каждого — подсказка */
  var GROUPS = [
    { t: 'Заказ', items: [
      ['configurator.html', 'Рассчитать заказ', 'смета за минуту'],
      ['tariffs.html', 'Цены и каталог работ', '11 формуляров с разбором'],
      ['vedenie.html', 'Уровни ведения', 'Базовый · Под ключ · VIP'],
      ['oplata.html', 'Как проходит оплата', '50/50 · 30/40/30 · чеки'],
      ['plan.html', 'Разбор плана', '3 000 ₽, зачтётся в оплату'],
      ['gift.html', 'Подарочный сертификат', 'помощь в подарок']
    ]},
    { t: 'Доверие', items: [
      ['guarantees.html', 'Гарантии · устав', '7 статей с опорой на закон'],
      ['reviews.html', 'Отзывы · живые истории', 'скрины и живые истории'],
      ['priyomnaya.html', 'Открытая приёмная', 'спросить анонимно'],
      ['check.html', 'Проверка текста', 'бесплатный сервис'],
      ['requisites.html', 'Реквизиты', 'ИНН открыт — проверяйте']
    ]},
    { t: 'Клуб и материалы', items: [
      ['referral.html', 'Клуб и бонусы', 'кэшбэк и рефералка'],
      ['dashboard.html#plus', 'Подписка «Салон+»', 'скидки · приоритет · полка'],
      ['knowledge.html', 'Полезные материалы', 'гайды по учёбе и защите']
    ]},
    { t: 'Кабинет', items: [
      ['dashboard.html', 'Личный кабинет', 'дела, статусы, переписка']
    ]}
  ];
  /* Живой поиск путеводителя: любая страница сайта — в две буквы.
     [href, подпись, теги-синонимы] — теги в нижнем регистре. */
  var SEARCH = [
    ['start.html', 'С чего начать — карта за 60 секунд', 'новичок карта маршрут впервые гид путеводитель'],
    ['configurator.html', 'Рассчитать заказ · конфигуратор', 'смета цена калькулятор заявка заказать'],
    ['tariffs.html', 'Цены и каталог работ', 'прайс стоимость сколько стоит картотека формуляр'],
    ['vedenie.html', 'Уровни ведения', 'базовый под ключ vip вип сопровождение тариф'],
    ['oplata.html', 'Как проходит оплата', 'деньги оплатить рассрочка предоплата этапы чек касса возврат'],
    ['oplata.html#zaruchku', 'Первый платёж — за ручку, по шагам', 'оплата как платить кнопка что нажать инструкция пошагово'],
    ['specifikaciya.html', 'Спецификация заказа — что это + образец', 'спецификация договор документ условия pdf образец'],
    ['https://akademsalon.ru/api/pamyatka/welcome', 'Памятка новичка — путеводитель (PDF)', 'памятка новичок путеводитель pdf правила'],
    ['plan.html', 'Разбор плана', 'план структура старт'],
    ['gift.html', 'Подарочный сертификат', 'подарок подарить код'],
    ['guarantees.html', 'Гарантии · устав мастерской', 'гарантия закон возврат договор правки антиплагиат скептик'],
    ['reviews.html', 'Отзывы', 'отзыв истории скрины переписки'],
    ['priyomnaya.html', 'Открытая приёмная', 'вопрос анонимно спросить faq'],
    ['check.html', 'Проверка текста', 'антиплагиат ии нейросеть канцелярит проверить'],
    ['referral.html', 'Клуб и бонусы', 'реферал бонус кэшбэк скидка друг'],
    ['knowledge.html', 'Полезные материалы — все гайды', 'база знаний статьи гайды'],
    ['dashboard.html', 'Личный кабинет', 'вход дело статус заказы кабинет'],
    ['index.html', 'Главная', 'главная начало'],
    ['kursovaya-rabota.html', 'Курсовая работа — услуга', 'курсовая курсач'],
    ['diplomnaya-rabota.html', 'Дипломная / ВКР — услуга', 'диплом вкр выпускная'],
    ['magisterskaya-dissertaciya.html', 'Магистерская диссертация — услуга', 'магистратура магистерская'],
    ['kandidatskaya-dissertaciya.html', 'Кандидатская — услуга', 'аспирантура кандидатская диссертация'],
    ['otchet-po-praktike.html', 'Отчёт по практике — услуга', 'практика дневник характеристика'],
    ['nauchnaya-statya.html', 'Научная статья — услуга', 'ринц вак scopus скопус публикация статья'],
    ['referat.html', 'Реферат, эссе, контрольная — услуга', 'реферат эссе контрольная доклад'],
    ['kursovaya-po-ekonomike.html', 'Курсовая по экономике', 'экономика'],
    ['kursovaya-po-informatike.html', 'Курсовая по информатике', 'информатика программирование код it'],
    ['kursovaya-po-menedzhmentu.html', 'Курсовая по менеджменту', 'менеджмент управление'],
    ['kursovaya-po-pedagogike.html', 'Курсовая по педагогике', 'педагогика фгос'],
    ['kursovaya-po-psihologii.html', 'Курсовая по психологии', 'психология'],
    ['kursovaya-po-yurisprudencii.html', 'Курсовая по юриспруденции', 'юриспруденция право'],
    ['diplomnaya-po-ekonomike.html', 'Диплом по экономике', 'экономика вкр'],
    ['diplomnaya-po-psihologii.html', 'Диплом по психологии', 'психология вкр'],
    ['diplomnaya-po-yurisprudencii.html', 'Диплом по юриспруденции', 'право юрфак вкр'],
    ['guide-zashchita-diploma.html', 'Гайд · защита диплома', 'защита комиссия доклад'],
    ['guide-rech-na-zashchitu.html', 'Гайд · речь на защиту', 'речь доклад выступление'],
    ['guide-prezentaciya-k-zashchite.html', 'Гайд · презентация к защите', 'презентация слайды'],
    ['guide-normocontrol.html', 'Гайд · нормоконтроль', 'нормоконтроль гост оформление'],
    ['guide-antiplagiat-ai.html', 'Гайд · антиплагиат и ИИ', 'антиплагиат оригинальность ии детектор'],
    ['guide-spisok-literatury.html', 'Гайд · список литературы', 'литература список источники гост'],
    ['guide-titulnyj-list.html', 'Гайд · титульный лист', 'титульник титульный'],
    ['guide-vvedenie-kursovoy.html', 'Гайд · введение курсовой', 'введение актуальность'],
    ['guide-obekt-predmet-cel-zadachi.html', 'Гайд · объект, предмет, цель и задачи', 'объект предмет цель задачи методология введение'],
    ['guide-zaklyuchenie-kursovoy.html', 'Гайд · заключение курсовой', 'заключение курсовой выводы'],
    ['guide-prakticheskaya-chast-kursovoy.html', 'Гайд · практическая часть курсовой', 'практическая часть анализ данные эмпирика исследование'],
    ['guide-otzyv-rukovoditelya-vkr.html', 'Гайд · отзыв научного руководителя', 'отзыв руководителя научрук образец'],
    ['dosie-nauchruka.html', 'Досье научного руководителя — как мы его читаем', 'досье научрук руководитель подход защита вопросы'],
    ['guide-prilozheniya-po-gost.html', 'Гайд · приложения по ГОСТ', 'приложения оформление буквы нумерация'],
    ['guide-vkr-struktura.html', 'Гайд · введение и структура ВКР', 'структура введение вкр'],
    ['guide-zaklyuchenie-vkr.html', 'Гайд · заключение работы', 'заключение выводы'],
    ['guide-temy-vkr.html', 'Гайд · темы ВКР, 50 примеров', 'тема темы выбрать'],
    ['guide-kursovaya-za-nedelyu.html', 'Гайд · курсовая за неделю', 'срочно неделя быстро'],
    ['guide-skolko-stoit-diplomnaya.html', 'Гайд · сколько стоит диплом', 'цена диплом стоимость'],
    ['guide-skolko-stoit-kursovaya.html', 'Гайд · сколько стоит курсовая', 'цена курсовая стоимость'],
    ['guide-otchet-po-praktike.html', 'Гайд · отчёт по практике', 'практика отчёт'],
    ['guide-dnevnik-praktiki.html', 'Гайд · дневник практики', 'дневник практика'],
    ['guide-harakteristika-s-praktiki.html', 'Гайд · характеристика с практики', 'характеристика'],
    ['guide-recenziya-na-vkr.html', 'Гайд · рецензия на ВКР', 'рецензия'],
    ['guide-rinc-statya.html', 'Гайд · статья РИНЦ', 'ринц публикация журнал'],
    ['guide-apellyaciya.html', 'Гайд · апелляция на оценку', 'апелляция пересдача оценка'],
    ['oferta.html', 'Публичная оферта', 'договор оферта условия'],
    ['privacy.html', 'Политика персональных данных', 'политика данные приватность'],
    ['consent.html', 'Согласие на обработку данных', 'согласие'],
    ['loyalty.html', 'Правила лояльности', 'бонусы правила подписка'],
    ['terms.html', 'Пользовательское соглашение', 'соглашение'],
    ['requisites.html', 'Реквизиты исполнителя', 'инн самозанятый реквизиты']
  ];
  var DOCS = [
    ['oferta.html', 'Публичная оферта'],
    ['privacy.html', 'Политика ПДн'],
    ['consent.html', 'Согласие на обработку ПДн'],
    ['loyalty.html', 'Правила лояльности'],
    ['terms.html', 'Пользовательское соглашение'],
    ['requisites.html', 'Реквизиты']
  ];

  function brandHTML() {
    return '<a class="brand" href="index.html" aria-label="Академический Салон — на главную">' +
      '<span class="b-para" aria-hidden="true">¶</span>' +
      '<span class="b-name">Академический Салон</span></a>';
  }

  /* Полноэкранное меню-«Путеводитель» — одно на страницу: живой поиск по
     всем страницам, маршрут новичка и разделы по смыслу с подсказками.
     Задача: даже впервые зашедший находит любую страницу за секунды. */
  function mountTOC() {
    if (document.querySelector('.toc')) return;
    var toc = document.createElement('div');
    toc.className = 'toc'; toc.id = 'toc';
    toc.setAttribute('role', 'dialog'); toc.setAttribute('aria-modal', 'true'); toc.setAttribute('aria-label', 'Путеводитель по сайту');
    var routeRow = ROUTE.map(function (r, i) {
      return '<a class="tr-step" href="' + r.href + '"><i>' + (i + 1) + '</i>' + r.label + '</a>';
    }).join('<span class="tr-arr" aria-hidden="true">→</span>');
    var rows = GROUPS.map(function (g) {
      return '<div class="toc-grp"><span class="toc-grp-t">' + g.t + '</span>' +
        g.items.map(function (it) {
          var cur = it[0] === here ? ' aria-current="page"' : '';
          return '<a class="dotrow" href="' + it[0] + '"' + cur + '><span>' + it[1] +
            '</span><span class="dots"></span><span class="dr-val">' + it[2] + '</span></a>';
        }).join('') + '</div>';
    }).join('');
    var docRows = DOCS.map(function (d) {
      return '<a href="' + d[0] + '">' + d[1] + '</a>';
    }).join('');
    toc.innerHTML = '<div class="toc-inner">' +
      '<div class="toc-head"><span class="toc-title">Путеводитель</span>' +
        '<button class="toc-close" type="button">Закрыть</button></div>' +
      '<div class="toc-search"><input type="search" id="tocQ" autocomplete="off" ' +
        'placeholder="Куда вам? Наберите: «курсовая», «оплата», «речь»…" aria-label="Поиск по сайту" />' +
        '<div class="toc-sr" id="tocSR" hidden></div></div>' +
      '<div class="toc-route" id="tocRoute"><span class="toc-grp-t">Впервые здесь? Маршрут до заявки — 6 шагов</span>' +
        '<nav class="tr-steps" aria-label="Маршрут новичка">' + routeRow + '</nav>' +
        '<a class="tr-all link" href="start.html">Вся карта с пояснениями — «С чего начать» →</a></div>' +
      '<div class="toc-grid">' +
        '<nav class="toc-primary" aria-label="Разделы сайта">' + rows + '</nav>' +
        '<div class="toc-side">' +
          '<div><span class="toc-grp-t">Документы</span><nav class="toc-docs" aria-label="Правовые документы">' + docRows + '</nav></div>' +
          '<div><span class="toc-grp-t">Связь</span><div class="toc-contacts">' +
            '<a href="' + LINKS.vkm + '" target="_blank" rel="noopener"><span>ВКонтакте · написать</span><span class="tc-v">vk.me/academicsaloon</span></a>' +
            '<a href="' + LINKS.max + '" target="_blank" rel="noopener"><span>MAX · канал</span><span class="tc-v">Академический Салон</span></a>' +
            '<a href="' + LINKS.tgc + '" target="_blank" rel="noopener"><span>Telegram · канал</span><span class="tc-v">@akademsalon</span></a>' +
            '<a href="' + LINKS.human + '" target="_blank" rel="noopener"><span>Telegram · человек</span><span class="tc-v">@academicsaloon</span></a>' +
            '<a href="' + LINKS.bot + '" target="_blank" rel="noopener"><span>Telegram · бот</span><span class="tc-v">@academic_saloon_bot</span></a>' +
          '</div></div>' +
          '<div class="toc-theme-row"><span class="ttr-lbl" data-theme-label>Светлая тема</span>' + Salon.themeToggleHTML() + '</div>' +
          '<a class="btn btn-wax btn-block btn-lg toc-cta" href="configurator.html">Рассчитать стоимость <span class="ar">→</span></a>' +
        '</div>' +
      '</div></div>';
    document.body.appendChild(toc);
    if (Salon.theme) Salon.theme.apply(Salon.theme.current(), false); /* синк подписи темы */

    function tocSiblings() {
      /* .tg-pill теперь ребёнок .mrail — прячем сами рельсы, иначе
         под открытым Путеводителем осталась бы висеть карточка */
      return ['.site-header', 'main', '.site-footer', '.mobile-cta', '.lasse',
              '.mrail', '.lrail', '.mledger']
        .map(function (s) { return document.querySelector(s); }).filter(Boolean);
    }
    function setToc(open) {
      toc.classList.toggle('open', open);
      document.body.classList.toggle('toc-lock', open);
      tocSiblings().forEach(function (el) { if (open) el.setAttribute('inert', ''); else el.removeAttribute('inert'); });
      document.querySelectorAll('.menu-toggle').forEach(function (t) { t.setAttribute('aria-expanded', String(open)); });
      if (open) { var f = toc.querySelector('.toc-close'); if (f) f.focus(); }
      else { var mt = document.querySelector('.menu-toggle'); if (mt) mt.focus(); }
    }
    Salon.toc = { open: function () { setToc(true); }, close: function () { setToc(false); }, isOpen: function () { return toc.classList.contains('open'); } };
    /* страховочная петля Tab для браузеров без inert */
    toc.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var items = toc.querySelectorAll('button, a[href], input');
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    toc.querySelector('.toc-close').addEventListener('click', function () { setToc(false); });
    /* закрываем по переходу — но НЕ по клику на переключатель темы; ссылки
       поиска появляются позже — ловим кликом-делегатом */
    toc.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a[href]')) setToc(false);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && toc.classList.contains('open')) setToc(false); });

    /* --- живой поиск: label+теги, топ-9, Enter открывает первый --- */
    (function () {
      var q = toc.querySelector('#tocQ'), sr = toc.querySelector('#tocSR');
      var route = toc.querySelector('#tocRoute'), grid = toc.querySelector('.toc-grid');
      if (!q || !sr) return;
      function draw() {
        var v = (q.value || '').trim().toLowerCase();
        if (v.length < 2) {
          sr.hidden = true; sr.innerHTML = '';
          route.hidden = false; grid.hidden = false;
          return;
        }
        var hits = [];
        for (var i = 0; i < SEARCH.length && hits.length < 9; i++) {
          var s = SEARCH[i];
          if ((s[1] + ' ' + s[2]).toLowerCase().indexOf(v) >= 0) hits.push(s);
        }
        sr.innerHTML = hits.length
          ? hits.map(function (s) {
              return '<a class="dotrow" href="' + s[0] + '"><span>' + s[1] +
                '</span><span class="dots"></span><span class="dr-val">→</span></a>';
            }).join('')
          : '<p class="toc-sr-none">Ничего не нашлось. Напишите нам — найдём вместе: ' +
            '<a class="link" href="' + LINKS.human + '" target="_blank" rel="noopener">@academicsaloon</a> · ' +
            '<a class="link" href="priyomnaya.html">анонимно в приёмную</a></p>';
        sr.hidden = false; route.hidden = true; grid.hidden = true;
      }
      q.addEventListener('input', draw);
      q.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          var a = sr.querySelector('a.dotrow');
          if (a) { setToc(false); location.href = a.getAttribute('href'); }
        } else if (e.key === 'Escape' && q.value) {
          e.stopPropagation(); q.value = ''; draw();
        }
      });
    })();

    /* бейдж заказов на пункте «Личный кабинет» — из общей с ботом базы */
    (function () {
      var kab = toc.querySelector('a[href="dashboard.html"] span');
      if (!kab || !Salon.api || !Salon.api.identified()) return;
      var t = Salon.api.token(), g = Salon.api.guestTokens();
      Salon.api.get('/orders' + (t ? '' : '?tokens=' + encodeURIComponent(g.join(',')))).then(function (r) {
        if (!r.ok || !r.orders || !r.orders.length) return;
        var un = r.orders.reduce(function (s, o) { return s + (o.unread || 0); }, 0);
        kab.textContent = 'Личный кабинет · ' + r.orders.length + (un ? ' · ' + un + ' нов.' : '');
      });
    })();
  }

  /* Единая шапка для ВСЕХ страниц (и главной тоже):
     бренд · Цены · Гарантии · Отзывы · Клуб · Полезные материалы · тема · «Рассчитать» · «Меню».
     На главной «Рассчитать» ведёт к смете на странице, дальше — в конфигуратор. */
  /* админка — рабочий стол мастера: маркетинговый каркас сайта там ни к чему */
  var CHROME_OFF = here === 'admin.html' || here === 'admin-mock.html';
  if (!CHROME_OFF && !document.querySelector('.site-header')) {
    var header = document.createElement('header');
    header.className = 'site-header';
    var navLinks = NAV.map(function (n) {
      var cur = n.href === here ? ' aria-current="page"' : '';
      var cls = n.x ? ' class="nav-x"' : (n.x2 ? ' class="nav-x2"' : '');
      return '<a href="' + n.href + '"' + cur + cls + '>' + n.label + '</a>';
    }).join('');
    var calcHref = here === 'index.html' ? '#smeta' : 'configurator.html';
    header.innerHTML = '<div class="wrap nav">' + brandHTML() +
      '<nav class="nav-links" aria-label="Разделы">' + navLinks + '</nav>' +
      '<div class="nav-cta">' +
        Salon.themeToggleHTML() +
        '<a class="nav-cab" href="dashboard.html"' + (here === 'dashboard.html' ? ' aria-current="page"' : '') +
          ' aria-label="Личный кабинет"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 19.4c.9-3.4 3.5-5 6.5-5s5.6 1.6 6.5 5"/></svg><span class="nc-txt">Кабинет</span><span class="nc-badge" hidden></span></a>' +
        '<a class="btn btn-wax" href="' + calcHref + '">Рассчитать</a>' +
        '<button class="menu-toggle" type="button" aria-expanded="false" aria-controls="toc" aria-label="Открыть меню"><span class="mt-txt">Меню</span> <i aria-hidden="true"></i></button>' +
      '</div></div>' +
      '<span class="hdr-ink" aria-hidden="true"></span>';
    document.body.insertBefore(header, document.body.firstChild);
    if (Salon.theme) Salon.theme.apply(Salon.theme.current(), false); /* синк состояния кнопки темы */
  }

  /* бейдж кабинета (шапка + нижняя панель): активные дела и непрочитанное */
  Salon.cabBadge = function () {
    var slots = [].slice.call(document.querySelectorAll('.nav-cab .nc-badge, .mn-cab .mn-badge'));
    if (!slots.length || !Salon.api || !Salon.api.identified || !Salon.api.identified()) return;
    var t = Salon.api.token(), g = Salon.api.guestTokens();
    Salon.api.get('/orders' + (t ? '' : '?tokens=' + encodeURIComponent(g.join(',')))).then(function (r) {
      if (!r.ok || !r.orders || !r.orders.length) return;
      var un = r.orders.reduce(function (s, o) { return s + (o.unread || 0); }, 0);
      var act = r.orders.filter(function (o) { return 'done cancel'.indexOf(o.status) < 0 && !o.archived; }).length;
      slots.forEach(function (slot) {
        if (un > 0) { slot.textContent = un > 9 ? '9+' : un; slot.hidden = false; slot.classList.remove('calm'); }
        else if (act > 0) { slot.textContent = act; slot.hidden = false; slot.classList.add('calm'); }
      });
    });
  };

  /* Меню — на любой странице, где есть кнопка «Меню» (в т.ч. на главной) */
  if (document.querySelector('.menu-toggle')) {
    mountTOC();
    document.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('.menu-toggle');
      if (!t || !Salon.toc) return;
      e.preventDefault();
      Salon.toc.isOpen() ? Salon.toc.close() : Salon.toc.open();
    });
  }

  /* «Дальше по маршруту» — тонкий штурман внизу страниц маршрута:
     показывает, где читатель находится, и ведёт за руку к следующему шагу */
  function mountRouteNext() {
    if (CHROME_OFF) return;
    var i = -1;
    ROUTE.forEach(function (r, k) { if (r.href === here) i = k; });
    if (i < 0 || i >= ROUTE.length - 1) return; /* вне маршрута или финал */
    var next = ROUTE[i + 1];
    var el = document.createElement('aside');
    el.className = 'route-next';
    el.setAttribute('aria-label', 'Маршрут по сайту');
    el.innerHTML = '<div class="wrap rn-in">' +
      '<span class="rn-step">Маршрут новичка · шаг ' + (i + 1) + ' из ' + ROUTE.length + '</span>' +
      '<span class="rn-dots" aria-hidden="true">' + ROUTE.map(function (_, k) {
        return '<i' + (k <= i ? ' class="on"' : '') + '></i>';
      }).join('') + '</span>' +
      '<a class="rn-next" href="' + next.href + '">Дальше: ' + next.label + ' <span class="ar">→</span></a>' +
      '<a class="rn-map" href="start.html">вся карта</a>' +
    '</div>';
    var f = document.querySelector('.site-footer');
    if (f && f.parentNode) f.parentNode.insertBefore(el, f);
    else document.body.appendChild(el);
  }

  /* ---------------- Возврат к начатому заказу ----------------
     Подпись кнопки не меняем (шапка всегда одинаковая) — черновик
     тихо продолжается: ссылка ведёт на нужный шаг конфигуратора. */
  (function continueOrder() {
    var draft = Salon.store.get('salon_draft', null);
    if (!draft || !draft.state || here === 'configurator.html' || here === 'index.html') return;
    var main = document.querySelector('.nav-cta a.btn-wax');
    if (main) main.href = 'configurator.html?step=' + ((draft.idx || 0) + 1);
  })();

  /* ---------------- Индикатор раздела в колонтитуле ---------------- */
  (function () {
    var slot = document.querySelector('.head-section');
    if (!slot) return;
    var title = (document.title.split('—')[0] || '').trim();
    slot.textContent = title;
    var chapters = document.querySelectorAll('[data-chapter]');
    if (!chapters.length || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) slot.textContent = en.target.getAttribute('data-chapter');
      });
    }, { rootMargin: '-15% 0px -70% 0px' });
    chapters.forEach(function (c) { io.observe(c); });
  })();

  /* ---------------- Колофон v3 «Концевая полоса» ----------------
     Подвал — не сетка ссылок, а последняя страница издания: колонтитул
     с живыми часами приёмной, разворот «манифест | лист связи», гербовая
     плита выходных данных, реестр наборными строками, мостик к Путеводителю
     и концевая полоса-воронка с печатью мастерской.
     Ссылки набраны потоком: перенос уходит МЕЖДУ ярлыками, а не внутрь. */
  /* Большой призыв «Узнайте точную стоимость» — только там, где человек выбирает
     и сравнивает: главная, цены, страницы услуг и ценовые гайды. На справочных,
     юридических и сервисных страницах он повторялся навязчиво — там подвал
     начинается сразу с колонтитула. */
  /* index исключён 2026-07-22: на главной «Пресс» финал «Начнём?» стоит
     прямо над подвалом — колофонный CTA дублировал его впритык */
  var FOOTER_CTA_PAGES = /^(tariffs\.html|kursovaya-|diplomnaya-|magisterskaya-|kandidatskaya-|otchet-po-praktike|nauchnaya-statya|referat\.|guide-skolko-stoit-|guide-kursovaya-za-nedelyu)/;

  /* Часы приёмной по МСК. Один источник правды для колонтитула и листа связи:
     и «Приём открыт», и «отвечаем за 15–30 минут» считаются из одного isDay,
     поэтому в четыре утра подвал не врёт. */
  function mskNow() {
    var d = new Date();
    var h = (d.getUTCHours() + 3) % 24;
    return { h: h, m: d.getUTCMinutes(), day: h >= 9 && h < 23 };
  }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  /* Подписи у часов — человеческим языком, без типографского жаргона:
     владелец 2026-07-21 не понял слова «колофон», и это верный сигнал. */
  var CLOCK_STATE = ['Ночь, отвечаем дольше', 'Мы на связи'];
  /* строка в листе связи говорит только про СРОК ответа: статус «мы на связи»
     уже стоит в колонтитуле выше, и повторять его здесь было бы эхом */
  var CLOCK_ETA = ['Ночью отвечаем в течение нескольких часов',
                   'Отвечаем за 15–30 минут'];

  /* Наборная строка реестра — складная рубрика (v4, 2026-07-22):
     на телефоне подвал занимал ~2800px (половину страницы), поэтому
     группы там свёрнуты в строки-заголовки со счётчиком; на десктопе
     details всегда открыт (foldReestr после монтажа) и выглядит как
     прежняя наборная строка. Семантика групп — details/summary. */
  function reestrRow(id, key, items, extraCls) {
    var out = '<details class="cf-r-row" data-cf-fold open>' +
      '<summary class="cf-r-k" id="' + id + '">' + key +
      '<span class="cf-r-n" aria-hidden="true">' + items.length + '</span>' +
      '<i class="cf-r-ar" aria-hidden="true">→</i></summary>' +
      '<span class="cf-r-set' + (extraCls ? ' ' + extraCls : '') + '">';
    for (var i = 0; i < items.length; i++) {
      var cur = items[i][0] === here ? ' aria-current="page"' : '';
      out += '<a href="' + items[i][0] + '"' + cur + '>' + items[i][1] + '</a>';
    }
    return out + '</span></details>';
  }

  Salon.footerHTML = function () {
    var ctaBlock = FOOTER_CTA_PAGES.test(here) ?
      '<div class="colophon-center">' +
        '<div class="co-para" aria-hidden="true">¶</div>' +
        '<h2>Узнайте точную стоимость за минуту</h2>' +
        '<p class="co-line">Набрано вручную · сверстано без шаблонов · 1000+ работ</p>' +
        '<a class="btn btn-wax" href="configurator.html">Рассчитать и оформить на сайте <span class="ar">→</span></a>' +
        '<p class="co-alt">Или напишите, где удобнее: <a href="' + LINKS.vkm + '" target="_blank" rel="noopener">ВКонтакте<span class="visually-hidden"> (откроется в новом окне)</span></a> · <a href="' + LINKS.max + '" target="_blank" rel="noopener">MAX<span class="visually-hidden"> (откроется в новом окне)</span></a> · <a href="' + LINKS.human + '" target="_blank" rel="noopener">Telegram<span class="visually-hidden"> (откроется в новом окне)</span></a> — оценка бесплатна, решение остаётся за вами</p>' +
      '</div>' : '';

    var t = mskNow();
    var night = t.day ? '' : ' night';

    return '<div class="wrap">' + ctaBlock +

    /* --- колонтитул с живыми часами --- */
    '<div class="cf-head">' +
      '<span class="cf-head-t"><i aria-hidden="true">¶</i> Связь и документы</span>' +
      '<span class="cf-head-r" aria-hidden="true"></span>' +
      '<p class="cf-clock" data-foot-clock>' +
        '<span class="cf-lamp' + night + '" aria-hidden="true"></span>' +
        '<span class="cf-cl-s">' + CLOCK_STATE[t.day ? 1 : 0] + '</span>' +
        '<span class="cf-cl-t"><span class="cf-hh">' + pad2(t.h) + '</span>' +
          '<span class="cf-cn">:</span><span class="cf-mm">' + pad2(t.m) + '</span>' +
          '<span class="cf-tz">МСК</span></span>' +
      '</p>' +
    '</div>' +

    /* --- разворот: манифест | лист связи --- */
    '<div class="cf-spread">' +
      '<div class="cf-manifest">' + brandHTML() +
        '<p class="cf-motto">Мастерская, а&nbsp;не биржа: работу ведёт профильный специалист — от плана до защиты.</p>' +
        '<p class="cf-sub">Шесть лет практики · 1000+ работ доведено до защиты</p>' +
      '</div>' +
      '<div class="cf-hail">' +
        '<p class="cf-live" data-foot-eta><span class="fcl-dot' + night + '" aria-hidden="true"></span>' +
          '<span class="cf-live-t">' + CLOCK_ETA[t.day ? 1 : 0] + '</span></p>' +
        '<a class="cf-line" href="' + LINKS.vkm + '" target="_blank" rel="noopener">' +
          '<span class="cf-l-k">ВКонтакте · написать<span class="visually-hidden"> (откроется в новом окне)</span></span>' +
          '<i class="cf-dots" aria-hidden="true"></i>' +
          '<span class="cf-l-v">vk.me/academicsaloon</span></a>' +
        '<a class="cf-line" href="' + LINKS.human + '" target="_blank" rel="noopener">' +
          '<span class="cf-l-k">Telegram · человек<span class="visually-hidden"> (откроется в новом окне)</span></span>' +
          '<i class="cf-dots" aria-hidden="true"></i>' +
          '<span class="cf-l-v">@academicsaloon</span></a>' +
        '<p class="cf-more">Ещё: ' +
          '<a href="' + LINKS.tgc + '" target="_blank" rel="noopener">канал в Telegram<span class="visually-hidden"> (откроется в новом окне)</span></a> · ' +
          '<a href="' + LINKS.max + '" target="_blank" rel="noopener">канал в MAX<span class="visually-hidden"> (откроется в новом окне)</span></a> · ' +
          '<a href="' + LINKS.bot + '" target="_blank" rel="noopener">бот, если удобнее<span class="visually-hidden"> (откроется в новом окне)</span></a></p>' +
      '</div>' +
    '</div>' +

    /* --- выходные данные: оборот титульного листа --- */
    '<section class="cf-imprint" aria-labelledby="cf-imp-h">' +
      '<h2 class="cf-imp-h" id="cf-imp-h">Выходные данные</h2>' +
      '<dl class="cf-imp-rows">' +
        '<div class="cf-imp-row"><dt class="cf-imp-k"><span>Исполнитель</span><i class="cf-dots" aria-hidden="true"></i></dt>' +
          '<dd class="cf-imp-v"><b>Семёнов Семён Юрьевич</b> · самозанятый — плательщик налога на профессиональный доход (Федеральный закон №&nbsp;422-ФЗ) · ИНН <span class="cf-inn">212885750445</span> · г.&nbsp;Казань</dd></div>' +
        '<div class="cf-imp-row"><dt class="cf-imp-k"><span>Характер услуг</span><i class="cf-dots" aria-hidden="true"></i></dt>' +
          '<dd class="cf-imp-v">Информационно-консультационная и учебно-методическая помощь для самостоятельной подготовки заказчика — <a href="oferta.html">публичная оферта</a></dd></div>' +
        '<div class="cf-imp-row"><dt class="cf-imp-k"><span>Данные</span><i class="cf-dots" aria-hidden="true"></i></dt>' +
          '<dd class="cf-imp-v">Данные из формы заказа используются только для связи и выполнения заказа — <a href="privacy.html">политика ПДн</a></dd></div>' +
      '</dl>' +
      '<a class="cf-check" href="https://npd.nalog.ru/check-status/" target="_blank" rel="noopener nofollow">' +
        '<span class="cf-check-k">Открыто для проверки</span>' +
        '<span class="cf-check-t">Статус самозанятого в реестре ФНС <span class="ar">→</span></span>' +
        '<span class="visually-hidden"> (откроется в новом окне)</span></a>' +
    '</section>' +

    /* --- реестр: наборные строки вместо колонок --- */
    '<div class="cf-reestr">' +
      reestrRow('cf-r1', 'Заказать', [
        ['start.html', 'С чего начать'], ['configurator.html', 'Рассчитать смету'],
        ['tariffs.html', 'Цены'], ['vedenie.html', 'Уровни ведения'],
        ['oplata.html', 'Оплата'], ['plan.html', 'Разбор плана'],
        ['gift.html', 'Сертификат']
      ]) +
      reestrRow('cf-r2', 'Доверие', [
        ['guarantees.html', 'Гарантии · устав'], ['reviews.html', 'Отзывы'],
        ['priyomnaya.html', 'Открытая приёмная'], ['check.html', 'Проверка текста']
      ]) +
      reestrRow('cf-r3', 'Работы', [
        ['kursovaya-rabota.html', 'Курсовая'], ['diplomnaya-rabota.html', 'Диплом · ВКР'],
        ['magisterskaya-dissertaciya.html', 'Магистерская'], ['kandidatskaya-dissertaciya.html', 'Кандидатская'],
        ['otchet-po-praktike.html', 'Отчёт по практике'], ['nauchnaya-statya.html', 'Научная статья'],
        ['referat.html', 'Реферат · эссе']
      ]) +
      /* ЕДИНСТВЕННЫЙ .foot-links в подвале: сюда extras.js дописывает
         «Как всё устроено — тур». Голый <a> получает стиль от .cf-r-set a. */
      reestrRow('cf-r4', 'Ваш заказ', [
        ['dashboard.html', 'Кабинет'], ['referral.html', 'Клуб и бонусы'],
        ['plus.html', 'Абонемент «Салон+»'], ['knowledge.html', 'Полезные материалы']
      ], 'foot-links') +
      reestrRow('cf-r5', 'Документы', [
        ['oferta.html', 'Публичная оферта'], ['privacy.html', 'Политика ПДн'],
        ['consent.html', 'Согласие на обработку ПДн'], ['loyalty.html', 'Правила лояльности'],
        ['terms.html', 'Пользовательское соглашение'], ['requisites.html', 'Реквизиты']
      ]) +
    '</div>' +

    /* --- мостик к Путеводителю --- */
    '<a class="cf-guide" href="start.html" data-toc-open>' +
      '<span class="cf-g-t">Не нашли нужное? Путеводитель — живой поиск по всему сайту</span>' +
      '<i class="cf-dots" aria-hidden="true"></i>' +
      '<span class="cf-val">Открыть <span class="ar">→</span></span></a>' +

    /* --- концевая полоса-воронка --- */
    '<div class="cf-finis">' +
      '<p class="cf-fin-copy">© 2020–2026 «Академический Салон» · Казань · издание мастерской</p>' +
      '<p class="cf-fin-line">набрано и сверстано в мастерской</p>' +
      '<span class="fl-seal" aria-hidden="true">' + Salon.sealSVG({
        ring: 'АКАДЕМИЧЕСКИЙ САЛОН · ИЗДАНИЕ МАСТЕРСКОЙ · ',
        center: '¶', size: 104, cls: 'seal--foil'
      }) + '</span>' +
      '<a class="fc-top" href="#main">Наверх ↑</a>' +
    '</div>' +

    '</div>';
  };
  /* «Наверх» в колофоне: мягкий скролл вместо прыжка по якорю */
  document.addEventListener('click', function (e) {
    var top = e.target.closest && e.target.closest('.fc-top');
    if (!top) return;
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  });
  /* Мостик к Путеводителю: с JS — оверлей, без JS — честный переход на start.html */
  document.addEventListener('click', function (e) {
    var g = e.target.closest && e.target.closest('[data-toc-open]');
    if (!g || !Salon.toc) return;
    e.preventDefault();
    Salon.toc.open();
  });
  if (!CHROME_OFF && !document.querySelector('.site-footer')) {
    var footer = document.createElement('footer');
    footer.className = 'site-footer';
    footer.setAttribute('aria-label', 'Связь и документы');
    footer.innerHTML = Salon.footerHTML();
    document.body.appendChild(footer);
    /* мостик открывает диалог — сообщаем это вспомогательным технологиям
       только когда путеводитель реально смонтирован */
    var bridge = footer.querySelector('[data-toc-open]');
    if (bridge && Salon.toc) bridge.setAttribute('aria-haspopup', 'dialog');
    /* реестр: телефон — свёрнутые рубрики, десктоп — всегда раскрыт */
    (function foldReestr() {
      function apply() {
        var open = window.innerWidth > 880;
        footer.querySelectorAll('details[data-cf-fold]').forEach(function (d) { d.open = open; });
      }
      apply();
      window.addEventListener('resize', apply);
    })();
    /* Часы приёмной идут: setInterval, а не rAF — rAF в панели предпросмотра мёртв.
       Раз в 20 с пересчитываем и время, и день/ночь, чтобы страница, открытая
       с вечера, к ночи честно поменяла и лампу, и обещание по срокам. */
    (function () {
      var box = footer.querySelector('[data-foot-clock]');
      if (!box) return;
      var hh = box.querySelector('.cf-hh'), mm = box.querySelector('.cf-mm'),
          st = box.querySelector('.cf-cl-s'), lamp = box.querySelector('.cf-lamp'),
          eta = footer.querySelector('[data-foot-eta] .cf-live-t'),
          dot = footer.querySelector('[data-foot-eta] .fcl-dot');
      setInterval(function () {
        var n = mskNow(), i = n.day ? 1 : 0;
        hh.textContent = pad2(n.h); mm.textContent = pad2(n.m);
        if (st.textContent !== CLOCK_STATE[i]) st.textContent = CLOCK_STATE[i];
        lamp.className = 'cf-lamp' + (n.day ? '' : ' night');
        if (dot) dot.className = 'fcl-dot' + (n.day ? '' : ' night');
        if (eta && eta.textContent !== CLOCK_ETA[i]) eta.textContent = CLOCK_ETA[i];
      }, 20000);
    })();
  }
  mountRouteNext(); /* штурман «Дальше по маршруту» — сразу над колофоном.
                       ВАЖНО: вызов обязан оставаться ПОСЛЕ создания подвала —
                       иначе полоса уедет под колофон через fallback appendChild. */

  /* ---------------- Плавающая пилюля связи (десктоп) ----------------
     Открывает лист каналов: сайт → ВК → MAX → Telegram. */
  if (!CHROME_OFF && !document.querySelector('.tg-pill') && here !== 'configurator.html' && here !== '404.html') {
    var pill = document.createElement('a');
    pill.className = 'tg-pill';
    pill.href = '#';
    pill.setAttribute('role', 'button');
    pill.innerHTML = '<span class="tp-dot" aria-hidden="true"></span>Связаться';
    pill.addEventListener('click', function (e) {
      e.preventDefault();
      if (Salon.contact) Salon.contact();
    });
    document.body.appendChild(pill);
  }

  /* ---------------- Мобильная навигация: нижняя панель на всех страницах ----
     Кабинет всегда на виду (с бейджем), «Рассчитать» — сургучная кнопка. */
  var MCTA_OFF = CHROME_OFF || here === 'configurator.html' || here === '404.html';
  if (!MCTA_OFF && !document.querySelector('.mobile-cta')) {
    var mnav = document.createElement('nav');
    mnav.className = 'mobile-cta mnav';
    mnav.setAttribute('aria-label', 'Быстрая навигация');
    var mnCalc = here === 'index.html' ? '#smeta' : 'configurator.html';
    var CAB_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 19.4c.9-3.4 3.5-5 6.5-5s5.6 1.6 6.5 5"/></svg>';
    function mnItem(href, label, icon, cls) {
      var cur = href === here ? ' aria-current="page"' : '';
      return '<a class="mn-i' + (cls || '') + '" href="' + href + '"' + cur + '>' +
        '<span class="mn-ic" aria-hidden="true">' + icon + '</span>' +
        '<span class="mn-l">' + label + '</span>' +
        (cls === ' mn-cab' ? '<span class="mn-badge" hidden></span>' : '') + '</a>';
    }
    mnav.innerHTML =
      mnItem('index.html', 'Главная', '¶') +
      mnItem('tariffs.html', 'Цены', '₽') +
      mnItem(mnCalc, 'Рассчитать', '✒', ' mn-calc') +
      mnItem('dashboard.html', 'Кабинет', CAB_SVG, ' mn-cab');
    document.body.appendChild(mnav);
  }
  /* Внизу колофона зарезервированы 96px под нижнюю панель. Панель бывает
     двух видов: смонтированная выше и своя, прописанная прямо в разметке
     страницы (configurator.html — .conf-mcta). Отступ снимаем, только если
     панели нет НИ ОДНОЙ, иначе она накроет концевую полосу с печатью. */
  if (!CHROME_OFF && !document.querySelector('.mobile-cta')) document.body.classList.add('no-mcta');
  /* бейдж кабинета зовём ниже, когда Salon.api уже определён —
     здесь он молча выходил на проверке !Salon.api и не рисовался никогда */

  /* ---------------- Яндекс.Метрика ----------------
     Включается только после «Хорошо» на куки-плашке (salon_consent,
     privacy.html п. 2.3.1) и молчит в кабинете и админке — там
     переписка клиентов, вебвизору она ни к чему. */
  (function metrika() {
    var ID = 110565162;
    /* zayavka.html — страница оплаты по ссылке мастера: там человек принимает
       денежное решение, аналитике на ней делать нечего */
    if (here === 'admin.html' || here === 'dashboard.html' || here === '404.html'
        || here === 'zayavka.html') return;
    function boot() {
      if (boot.done) return;
      boot.done = true;
      (function (m, e, t, r, i, k, a) {
        m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
        m[i].l = 1 * new Date();
        for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) { return; } }
        k = e.createElement(t); a = e.getElementsByTagName(t)[0];
        k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
      })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=' + ID, 'ym');
      window.ym(ID, 'init', {
        ssr: true, webvisor: true, clickmap: true, ecommerce: 'dataLayer',
        referrer: document.referrer, url: location.href,
        accurateTrackBounce: true, trackLinks: true
      });
    }
    Salon.metrika = {
      id: ID,
      boot: boot,
      goal: function (name) { if (boot.done && window.ym) window.ym(ID, 'reachGoal', name); }
    };
    var c = Salon.store.get('salon_consent', null);
    if (c && c.v >= 1) boot();
    else document.addEventListener('salon:consent', boot, { once: true });
    /* цели: уходы в каналы — ВК, MAX, Telegram */
    document.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      var h = a.getAttribute('href') || '';
      if (h.indexOf('t.me/') > -1) Salon.metrika.goal('tg_click');
      else if (h.indexOf('vk.com/') > -1 || h.indexOf('vk.me/') > -1) Salon.metrika.goal('vk_click');
      else if (h.indexOf('max.ru/') > -1) Salon.metrika.goal('max_click');
    }, true);
  })();

  /* ---------------- Лист связи (сайт → ВК → MAX → Telegram) ----------------
     Главная дверь — конфигуратор на сайте: заявка, файлы и кабинет без
     мессенджеров. Каналы — по желанию. [data-msg]/[data-contact] — триггеры. */
  (function () {
    var sheet, lastFocus;
    function build(opts) {
      opts = opts || {};
      var el = document.createElement('div');
      el.className = 'contact-sheet';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-label', 'Как с нами связаться');
      var order = opts.orderLink || LINKS.bot;
      el.innerHTML =
        '<div class="cs-backdrop" data-cs-close></div>' +
        '<div class="cs-card sheet">' +
          '<div class="cs-head"><span class="caps">Связаться с Салоном</span>' +
            '<button class="cs-x" type="button" aria-label="Закрыть" data-cs-close>×</button></div>' +
          '<p class="cs-lead">' + (opts.lead ||
            'Напишите тему и срок — бесплатно оценим объём и назовём цену. Решение останется за вами.') + '</p>' +
          /* честный индикатор доступности: тишина после «написать» — главный страх */
          (function () {
            var mskH = (new Date().getUTCHours() + 3) % 24;
            var day = mskH >= 9 && mskH < 23;
            return '<p style="display:flex;align-items:center;gap:8px;margin:-6px 0 12px;font-size:12.5px;color:var(--ink-soft)">' +
              '<span style="width:8px;height:8px;border-radius:50%;flex:none;background:' +
              (day ? 'var(--verify,#3D6B50)' : 'var(--foil,#B98A2F)') + '"></span>' +
              (day ? 'Мастер на связи — обычно отвечаем за 15–30 минут'
                   : 'В мастерской ночь — отвечаем и ночью, просто чуть дольше') + '</p>';
          })() +
          '<a class="cs-opt cs-opt--wax" href="configurator.html">' +
            '<span class="cs-o-ic" aria-hidden="true">✎</span>' +
            '<span class="cs-o-txt"><b>Оформить заявку на сайте</b><small>Смета, файлы и кабинет — 2 минуты, без регистрации</small></span>' +
            '<span class="ar" aria-hidden="true">→</span></a>' +
          '<a class="cs-opt" href="' + LINKS.vkm + '" target="_blank" rel="noopener">' +
            '<span class="cs-o-ic" aria-hidden="true">ВК</span>' +
            '<span class="cs-o-txt"><b>Написать во ВКонтакте</b><small>Диалог с сообществом — отвечает человек</small></span>' +
            '<span class="ar" aria-hidden="true">→</span></a>' +
          '<a class="cs-opt" href="' + LINKS.max + '" target="_blank" rel="noopener">' +
            '<span class="cs-o-ic" aria-hidden="true">' + maxLogoSVG() + '</span>' +
            '<span class="cs-o-txt"><b>MAX</b><small>Канал мастерской — новости и связь</small></span>' +
            '<span class="ar" aria-hidden="true">→</span></a>' +
          '<a class="cs-opt" href="' + LINKS.human + '" target="_blank" rel="noopener">' +
            '<span class="cs-o-ic" aria-hidden="true">✆</span>' +
            '<span class="cs-o-txt"><b>Telegram — написать человеку</b><small>Лично, обычно отвечаем в течение пары часов</small></span>' +
            '<span class="ar" aria-hidden="true">→</span></a>' +
          '<a class="cs-opt" href="' + order + '" target="_blank" rel="noopener">' +
            '<span class="cs-o-ic" aria-hidden="true">⚙</span>' +
            '<span class="cs-o-txt"><b>Telegram-бот</b><small>Заявки и статусы — если привычнее в боте</small></span>' +
            '<span class="ar" aria-hidden="true">→</span></a>' +
          '<p class="cs-note">Заявка с сайта попадает мастеру напрямую, переписка и статусы — в <a href="dashboard.html">кабинете</a>. Нажимая, вы принимаете <a href="oferta.html">оферту</a> и <a href="privacy.html">политику ПДн</a>.</p>' +
        '</div>';
      return el;
    }
    function close() {
      if (!sheet) return;
      sheet.classList.remove('open');
      document.body.classList.remove('toc-lock');
      var s = sheet; setTimeout(function () { if (s && s.parentNode) s.parentNode.removeChild(s); }, 240);
      sheet = null;
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    Salon.contact = function (opts) {
      lastFocus = document.activeElement;
      sheet = build(opts || {});
      document.body.appendChild(sheet);
      document.body.classList.add('toc-lock');
      void sheet.offsetWidth; /* показ без rAF — иначе шит невидим при спящем рендере */
      sheet.classList.add('open');
      var f = sheet.querySelector('.cs-opt'); if (f) f.focus();
      sheet.addEventListener('click', function (e) { if (e.target.closest('[data-cs-close]')) { e.preventDefault(); close(); } });
    };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sheet) close(); });
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-msg], [data-contact]');
      if (!t) return;
      e.preventDefault();
      var st = Salon.store.get('salon_draft', null);
      var link = (t.getAttribute('data-contact') === 'bot' || (st && st.state))
        ? window.SalonBotLink(st && st.state) : LINKS.bot;
      Salon.contact({ orderLink: link, lead: t.getAttribute('data-msg-lead') || undefined });
    });
  })();

  /* ---------------- Печати по разметке: <span data-seal="ТЕКСТ · ПО · КРУГУ · "> ---------------- */
  document.querySelectorAll('[data-seal]').forEach(function (el) {
    el.innerHTML = Salon.sealSVG({
      ring: el.getAttribute('data-seal') || undefined,
      center: el.getAttribute('data-seal-center') || undefined,
      cls: el.getAttribute('data-seal-cls') || undefined,
      size: parseInt(el.getAttribute('data-seal-size'), 10) || undefined
    });
  });

  /* ---------------- Reveal: секции, линейки, печати, шкалы ---------------- */
  var OBSERVED = '.reveal, .rule.draw, .seal.press, .paysteps';
  function markAll() { document.querySelectorAll(OBSERVED).forEach(function (n) { n.classList.add('in'); }); }
  /* страховка помечает только то, что уже около вьюпорта, — скролл-хореография ниже сохраняется */
  function markNearViewport() {
    var limit = window.innerHeight * 1.2;
    document.querySelectorAll(OBSERVED).forEach(function (n) {
      if (!n.classList.contains('in') && n.getBoundingClientRect().top < limit) n.classList.add('in');
    });
  }
  if (reduceMotion || !('IntersectionObserver' in window)) {
    markAll();
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    document.querySelectorAll(OBSERVED).forEach(function (n) { if (!n.classList.contains('in')) io.observe(n); });
    window.addEventListener('load', function () { setTimeout(markNearViewport, 1800); });
  }
  /* наблюдатель для динамически добавленных узлов (кабинет, результаты) */
  Salon.observeReveal = function (root) {
    (root || document).querySelectorAll(OBSERVED).forEach(function (n) { n.classList.add('in'); });
  };

  /* ---------------- Умная шапка (прячется при скролле вниз) ----------------
     Планирование через setTimeout, не rAF: энергосберегающие режимы браузеров
     душат rAF, а шапка и чернильный прогресс должны жить везде. */
  var lastY = window.scrollY, hidden = false, scheduled = false;
  function onScrollFrame() {
    scheduled = false;
    var y = window.scrollY;
    var hdr = document.querySelector('.site-header');
    if (hdr) {
      if (Math.abs(y - lastY) > 6) {
        var goDown = y > lastY && y > 200;
        if (goDown !== hidden) { hidden = goDown; hdr.classList.toggle('hide', hidden); }
      }
      hdr.classList.toggle('scrolled', y > 12);
      var ink = hdr.querySelector('.hdr-ink');
      if (ink) {
        var max = (document.documentElement.scrollHeight - window.innerHeight) || 1;
        ink.style.width = Math.min(100, Math.max(0, (y / max) * 100)).toFixed(2) + '%';
      }
    }
    lastY = y;
  }
  window.addEventListener('scroll', function () { if (!scheduled) { scheduled = true; setTimeout(onScrollFrame, 16); } }, { passive: true });
  setTimeout(onScrollFrame, 50);

  /* ---------------- Мгновенная навигация: prefetch / prerender ---------------- */
  (function () {
    try {
      if (HTMLScriptElement.supports && HTMLScriptElement.supports('speculationrules')) {
        var sr = document.createElement('script'); sr.type = 'speculationrules';
        sr.textContent = JSON.stringify({ prerender: [{ source: 'document', where: { selector_matches: 'a[href$=".html"]' }, eagerness: 'moderate' }] });
        document.head.appendChild(sr);
      } else {
        var seen = {};
        document.addEventListener('mouseover', function (e) {
          var a = e.target.closest && e.target.closest('a[href$=".html"]');
          if (!a) return; var h = a.getAttribute('href');
          if (!h || seen[h] || h.charAt(0) === '#') return; seen[h] = 1;
          var l = document.createElement('link'); l.rel = 'prefetch'; l.href = h; document.head.appendChild(l);
        }, { passive: true });
      }
    } catch (e) {}
  })();

  /* ---------------- Кабинет: клиент API (общая база с ботом) ----------------
     Сайт и Telegram-бот работают с одним сервером: заказы, статусы и переписка
     синхронны. Сессия — токен в localStorage (вход через Telegram);
     у гостевых заказов — токены доступа по каждому заказу. */
  var API_BASE = (location.hostname === 'akademsalon.ru')
    ? '/api' : 'https://akademsalon.ru/api';
  /* «Тихий» вход мастера в кабинет клиента: токен живёт ТОЛЬКО в этой вкладке
     (sessionStorage), чтобы не выбить основную сессию мастера в админке. */
  function impToken() {
    try { return sessionStorage.getItem('salon_imp_token') || null; } catch (e) { return null; }
  }
  Salon.api = {
    base: API_BASE,
    token: function () { return impToken() || Salon.store.get('salon_session', null); },
    setToken: function (t) { t ? Salon.store.set('salon_session', t) : Salon.store.del('salon_session'); },
    user: function () { return Salon.store.get('salon_user', null); },
    setUser: function (u) { u ? Salon.store.set('salon_user', u) : Salon.store.del('salon_user'); },
    guestTokens: function () { var v = Salon.store.get('salon_tokens', []); return Array.isArray(v) ? v : []; },
    addGuestToken: function (t) {
      var v = Salon.api.guestTokens();
      if (t && v.indexOf(t) < 0) { v.push(t); Salon.store.set('salon_tokens', v.slice(-30)); }
    },
    identified: function () { return !!(Salon.api.token() || Salon.api.guestTokens().length); },
    req: function (method, path, body, _retried) {
      var h = {};
      if (body !== undefined) h['Content-Type'] = 'application/json';
      var t = Salon.api.token();
      if (t) h['Authorization'] = 'Bearer ' + t;
      /* GET безопасно повторить один раз: короткое окно рестарта сервера
         (деплой) отдаёт 502/обрыв на пару секунд — не теряем посетителя */
      function again() {
        return new Promise(function (res) {
          setTimeout(function () { res(Salon.api.req(method, path, body, true)); }, 1800);
        });
      }
      return fetch(API_BASE + path, { method: method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined })
        .then(function (r) {
          if (r.status === 401) {
            if (impToken()) {
              /* протухла «тихая» сессия мастера — чистим только её */
              try { sessionStorage.removeItem('salon_imp_token'); sessionStorage.removeItem('salon_imp'); } catch (e) {}
            } else { Salon.api.setToken(null); Salon.api.setUser(null); }
          }
          if (method === 'GET' && !_retried && (r.status === 502 || r.status === 503 || r.status === 504)) return again();
          return r.json().catch(function () { return { ok: false, error: 'bad_json' }; });
        })
        .catch(function () {
          if (method === 'GET' && !_retried) return again();
          return { ok: false, error: 'network' };
        });
    },
    get: function (p) { return Salon.api.req('GET', p); },
    post: function (p, b) { return Salon.api.req('POST', p, b || {}); },
    logout: function () { Salon.api.setToken(null); Salon.api.setUser(null); }
  };

  /* Ссылка доступа к делу: открывает заказ на любом устройстве без входа.
     Токен — тот же, что в salon_tokens; кабинет ловит #claim= при загрузке. */
  Salon.claimLink = function (token) {
    return 'https://akademsalon.ru/dashboard.html#claim=' + encodeURIComponent(token || '');
  };

  /* бейдж «есть живое дело» на кнопке кабинета — теперь, когда api готов */
  if (Salon.cabBadge) Salon.cabBadge();

  /* ---------------- Маячок визитов («Глаз бога») ----------------
     Служебная запись уровня серверного лога: страница, источник и шаг,
     на котором остановились, — мастер видит их в своей админке.
     Токены доступа из адреса вычищаются и здесь, и на сервере.
     Молчит в админке; не трогает бюджет обычных запросов (свой лимит). */
  Salon.visit = (function () {
    var here = (location.pathname.split('/').pop() || 'index.html');
    /* молчим в админке, на локальных превью и в «тихом» кабинете мастера —
       это не посетители (сервер дублирует этот гейт по флагу сессии) */
    var imp = false;
    try { imp = sessionStorage.getItem('salon_imp') === '1'; } catch (e) {}
    if (here.indexOf('admin') === 0 || here === 'zayavka.html' || imp
        || /^(localhost|127\.)/.test(location.hostname)) {
      return { mark: function () {}, order: function () {} };
    }
    function vid() {
      var v = Salon.store.get('salon_vid', null);
      if (v && /^[a-z0-9-]{8,40}$/.test(v)) return v;
      var a = new Uint8Array(9);
      if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
      else for (var i = 0; i < 9; i++) a[i] = Math.floor(Math.random() * 256);
      v = 'v' + Array.prototype.map.call(a, function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
      Salon.store.set('salon_vid', v);
      return v;
    }
    function page() {
      var q = location.search.replace(/(token|resume|session|claim)=[^&#]*/g, '$1=…');
      return (location.pathname + q).slice(0, 200);
    }
    function send(extra, _retried) {
      try {
        var body = { vid: vid(), page: page() };
        for (var k in extra) body[k] = extra[k];
        var h = { 'Content-Type': 'text/plain' };
        var t = Salon.api.token();
        if (t) h['Authorization'] = 'Bearer ' + t;
        function again() {
          /* окно рестарта сервера: один тихий повтор, пока вкладка жива */
          if (_retried || document.visibilityState === 'hidden') return;
          setTimeout(function () { send(extra, true); }, 2500);
        }
        fetch(API_BASE + '/visit', {
          method: 'POST', headers: h, keepalive: true,
          body: JSON.stringify(body)
        }).then(function (r) { if (r.status >= 502) again(); })
          .catch(again);
      } catch (e) {}
    }
    function view() {
      var ref = '';
      try {
        if (document.referrer &&
            document.referrer.indexOf(location.origin) !== 0) ref = document.referrer;
        var utm = /(utm_[a-z]+|yclid|gclid)=/.test(location.search) ? location.search : '';
        if (utm) ref += (ref ? ' · ' : '') + utm.slice(0, 180);
      } catch (e) {}
      send({ kind: 'view', ref: ref.slice(0, 380) || undefined });
    }
    if (document.prerendering) {
      document.addEventListener('prerenderingchange', view, { once: true });
    } else {
      view();
    }
    return {
      /* mark('шаг 3 из 4') — где человек сейчас; order(id, token) — дошёл до заявки */
      mark: function (step) { send({ kind: 'mark', step: String(step || '').slice(0, 120) }); },
      order: function (id, token) { send({ kind: 'order', order: id, token: token || undefined }); }
    };
  })();

  /* ---------------- Чёрный ящик: JS-ошибки посетителей ----------------
     Скрипт упал у клиента — метка «js: …» уходит маячком в «Визиты»
     (мастер видит в админке), сервер дублирует её в журнал, а «Салон-дозор»
     будит владельца в Telegram. Не больше трёх меток за сессию, без повторов. */
  (function blackBox() {
    var sent = {}, n = 0;
    function report(msg, src) {
      if (n >= 3) return;
      msg = String(msg || '').slice(0, 80);
      if (!msg || sent[msg]) return;
      sent[msg] = 1; n++;
      try { Salon.visit.mark('js: ' + msg + (src ? ' @ ' + src : '')); } catch (e) {}
    }
    window.addEventListener('error', function (e) {
      /* ошибки загрузки картинок/скриптов приходят без message — не наш случай */
      if (e && e.message) {
        report(e.message, (String(e.filename || '').split('/').pop() || '') + ':' + (e.lineno || 0));
      }
    });
    window.addEventListener('unhandledrejection', function (e) {
      var r = e && e.reason;
      report((r && (r.message || String(r))) || 'обещание без объяснений', 'promise');
    });
  })();

  /* Реферальная метка сайта (?ref=<код>): помним 30 дней, конфигуратор
     передаёт её с заявкой — пригласившему идёт бонус по правилам клуба. */
  (function () {
    try {
      var ref = new URLSearchParams(location.search).get('ref');
      if (ref && /^-?\d{1,12}$/.test(ref)) {
        Salon.store.set('salon_ref', { code: parseInt(ref, 10), ts: Date.now() });
      }
    } catch (e) {}
  })();
  Salon.refCode = function () {
    var r = Salon.store.get('salon_ref', null);
    if (!r || !r.code) return null;
    if (Date.now() - (r.ts || 0) > 30 * 24 * 3600 * 1000) {
      Salon.store.del('salon_ref');
      return null;
    }
    return r.code;
  };

  /* Вход через Telegram: код → t.me/бот?start=auth_<код> → поллинг → сессия.
     Код живёт в localStorage: страница может перезагрузиться или уйти в Telegram
     (мобильные!) — при возврате поллинг продолжится сам (Salon.resumeTgLogin).
     onOpen(link, opened) — сразу после window.open; onDone(user) — после входа. */
  Salon.tgLogin = function (onDone, onFail, onOpen) {
    Salon.api.post('/auth/start').then(function (r) {
      if (!r.ok || !r.link) { if (onFail) onFail(r); return; }
      Salon.store.set('salon_auth_pending', { code: r.code, link: r.link, ts: Date.now() });
      var win = window.open(r.link, '_blank', 'noopener');
      if (onOpen) onOpen(r.link, !!win);
      Salon.resumeTgLogin(onDone, onFail);
    });
  };

  /* Возобновить ожидание входа (по коду из localStorage). Возвращает pending-объект
     или null, если ожидания нет/протухло. Идемпотентно: вторая петля не запустится. */
  Salon.resumeTgLogin = function (onDone, onFail) {
    var TTL = 14 * 60 * 1000;
    var p = Salon.store.get('salon_auth_pending', null);
    if (!p || !p.code || (Date.now() - (p.ts || 0)) > TTL) {
      if (p) Salon.store.del('salon_auth_pending');
      return null;
    }
    if (Salon.__authLoop) return p;
    Salon.__authLoop = true;
    var iv = setInterval(tick, 2000);
    function stop() { clearInterval(iv); Salon.__authLoop = false; }
    function tick() {
      var cur = Salon.store.get('salon_auth_pending', null);
      if (!cur || (Date.now() - (cur.ts || 0)) > TTL) {
        stop(); Salon.store.del('salon_auth_pending');
        if (onFail) onFail({ error: 'timeout' });
        return;
      }
      Salon.api.get('/auth/poll?code=' + encodeURIComponent(cur.code)).then(function (pr) {
        if (pr.ok && pr.pending === false && pr.token) {
          stop();
          Salon.store.del('salon_auth_pending');
          Salon.api.setToken(pr.token);
          Salon.api.setUser(pr.user || null);
          var gt = Salon.api.guestTokens();
          var fin = function () { if (onDone) onDone(pr.user); };
          if (gt.length) Salon.api.post('/orders/claim', { tokens: gt }).then(fin, fin);
          else fin();
        }
      });
    }
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && Salon.__authLoop) tick();
    });
    tick();
    return p;
  };

  /* ---------------- Count-up для [data-count] ---------------- */
  if (!reduceMotion && 'IntersectionObserver' in window) {
    var cio = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (en.isIntersecting) {
          var n = en.target;
          Salon.countTo(n, parseFloat(n.getAttribute('data-count')) || 0, {
            suffix: n.getAttribute('data-suffix') || '', prefix: n.getAttribute('data-prefix') || '', duration: 900
          });
          cio.unobserve(n);
        }
      });
    }, { threshold: 0.6 });
    document.querySelectorAll('[data-count]').forEach(function (n) { cio.observe(n); });
  }
})();
