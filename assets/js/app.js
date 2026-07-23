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
  /* Отдельное согласие на необязательную аналитику. Старый v1 намеренно
     не мигрируем: его кнопка «Хорошо» не фиксировала предметный выбор.
     Через 12 месяцев и при новой версии текст согласия показывается заново. */
  Salon.consent = (function () {
    var KEY = 'salon_consent';
    var VERSION = 2;
    var TTL = 365 * 24 * 60 * 60 * 1000;
    function read() {
      var c = Salon.store.get(KEY, null);
      var exp = c && c.expiresAt ? Date.parse(c.expiresAt) : NaN;
      if (!c || c.v !== VERSION || typeof c.analytics !== 'boolean' ||
          !c.at || !isFinite(exp) || exp <= Date.now()) {
        if (c) Salon.store.del(KEY);
        return null;
      }
      return c;
    }
    function emit(c) {
      try {
        document.dispatchEvent(new CustomEvent('salon:consent', { detail: c }));
      } catch (e) {
        var ev = document.createEvent('CustomEvent');
        ev.initCustomEvent('salon:consent', false, false, c);
        document.dispatchEvent(ev);
      }
    }
    function save(analytics, source) {
      var now = new Date();
      var c = {
        v: VERSION,
        document: 'analytics-consent-2.0',
        necessary: true,
        analytics: analytics === true,
        action: analytics === true ? 'allow' : 'reject',
        source: source || 'banner',
        at: now.toISOString(),
        expiresAt: new Date(now.getTime() + TTL).toISOString()
      };
      Salon.store.set(KEY, c);
      if (!c.analytics) Salon.store.del('salon_vid');
      emit(c);
      return c;
    }
    function allowed() {
      var c = read();
      return !!(c && c.analytics === true);
    }
    window.addEventListener('storage', function (e) {
      if (e.key !== KEY) return;
      emit(read() || { v: VERSION, necessary: true, analytics: false, action: 'reject' });
    });
    return { key: KEY, version: VERSION, ttl: TTL, read: read, save: save, allowed: allowed };
  })();

  /* ---------------- Фирменный motion-язык ----------------
     Один реактивный источник вместо разрозненных проверок.
     full — полная типографская хореография; lite — те же жесты,
     но без ambient-циклов; off — статичный итог без движения. */
  Salon.motion = (function () {
    var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var current = '';
    function lowPower() {
      var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      return !!((c && c.saveData) ||
        (navigator.deviceMemory && navigator.deviceMemory <= 2) ||
        (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2));
    }
    function read() {
      if (docEl.hasAttribute('data-calm') || (mq && mq.matches)) return 'off';
      return lowPower() ? 'lite' : 'full';
    }
    function refresh() {
      var next = read(), changed = next !== current;
      current = next;
      docEl.setAttribute('data-motion', next);
      reduceMotion = next === 'off';
      Salon.reduceMotion = reduceMotion;
      if (changed) {
        try { window.dispatchEvent(new CustomEvent('salon:motionchange', { detail: { mode: next } })); } catch (e) {}
      }
      return next;
    }
    function can(ambient) { return current !== 'off' && (!ambient || current === 'full'); }
    function replay(el, cls, hold) {
      if (!el) return;
      el.classList.remove(cls);
      if (current === 'off') return;
      void el.offsetWidth;
      el.classList.add(cls);
      setTimeout(function () { if (el) el.classList.remove(cls); }, hold || 420);
    }
    function field(el, state) {
      if (!el) return;
      if (state === 'error') {
        el.setAttribute('aria-invalid', 'true');
        el.classList.add('motion-field-error');
        replay(el, 'motion-field-kick', 360);
      } else {
        el.removeAttribute('aria-invalid');
        el.classList.remove('motion-field-error', 'motion-field-kick');
        if (state === 'success') replay(el, 'motion-field-ok', 520);
      }
    }
    refresh();
    if (mq) {
      if (mq.addEventListener) mq.addEventListener('change', refresh);
      else if (mq.addListener) mq.addListener(refresh);
    }
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn && conn.addEventListener) conn.addEventListener('change', refresh);
    document.addEventListener('invalid', function (e) { field(e.target, 'error'); }, true);
    document.addEventListener('input', function (e) {
      if (e.target && e.target.classList && e.target.classList.contains('motion-field-error')) field(e.target, 'clear');
    }, true);
    document.addEventListener('pointerdown', function (e) {
      if (!can(false) || e.button > 0) return;
      var b = e.target.closest && e.target.closest('.btn-wax, .mn-calc, [data-motion-press]');
      if (!b || b.disabled || b.querySelector('.motion-ink-drop')) return;
      var r = b.getBoundingClientRect(), d = document.createElement('span');
      d.className = 'motion-ink-drop'; d.setAttribute('aria-hidden', 'true');
      d.style.left = (e.clientX - r.left) + 'px'; d.style.top = (e.clientY - r.top) + 'px';
      b.appendChild(d);
      setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 520);
    }, { passive: true });
    return { mode: function () { return current; }, can: can, refresh: refresh, replay: replay, field: field };
  })();

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
  /* ---------------- «Спокойный режим»: движение — по желанию ----------------
     Тумблер в шапке и путеводителе: html[data-calm] глушит анимации всего
     сайта (chrome.css), главная-«Пресс» раскладывается потоком (press.js
     слышит сигнал resize), контраст слегка поднят. localStorage salon_calm. */
  Salon.calmToggleHTML = function () {
    return '<button class="calm-toggle" type="button" aria-pressed="false" ' +
      'aria-label="Спокойный режим: без анимаций" title="Спокойный режим: без анимаций">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.6" stroke-linecap="round" aria-hidden="true">' +
      '<path class="ct-wave" d="M3 12c2.2-3.4 4.3-3.4 6.5 0s4.3 3.4 6.5 0 3.4-2.7 5-1"/>' +
      '<path class="ct-flat" d="M4 12h16" style="display:none"/></svg></button>';
  };
  Salon.calm = (function () {
    function on() { return docEl.hasAttribute('data-calm'); }
    function apply(mode, persist) {
      if (mode) docEl.setAttribute('data-calm', '1');
      else docEl.removeAttribute('data-calm');
      docEl.querySelectorAll('.calm-toggle').forEach(function (b) {
        b.setAttribute('aria-pressed', String(!!mode));
        b.title = mode ? 'Спокойный режим включён · вернуть движение'
                       : 'Спокойный режим: без анимаций';
        var w = b.querySelector('.ct-wave'), f = b.querySelector('.ct-flat');
        if (w) w.style.display = mode ? 'none' : '';
        if (f) f.style.display = mode ? '' : 'none';
      });
      docEl.querySelectorAll('[data-calm-label]').forEach(function (l) {
        l.textContent = mode ? 'Спокойный режим — включён' : 'Спокойный режим';
      });
      if (persist) { try { localStorage.setItem('salon_calm', mode ? '1' : ''); } catch (e) {} }
      if (Salon.motion) Salon.motion.refresh();
      try { window.dispatchEvent(new Event('resize')); } catch (e) {}
    }
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.calm-toggle');
      if (!b) return;
      e.preventDefault();
      var next = !on();
      apply(next, true);
      if (Salon.toast) Salon.toast(next
        ? 'Спокойный режим: без анимаций и мерцания'
        : 'Движение возвращено');
    });
    try { if (localStorage.getItem('salon_calm')) apply(true, false); } catch (e) {}
    return { on: on, apply: apply };
  })();

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
      var canVT = typeof document.startViewTransition === 'function' &&
        (!Salon.motion || Salon.motion.mode() === 'full') && !document.hidden && !vtBusy;
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
          { duration: Salon.motion && Salon.motion.mode() === 'lite' ? 340 : 460,
            easing: 'cubic-bezier(.2,.72,.25,1)', pseudoElement: '::view-transition-new(root)' }
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
    function rmNow() {
      return S.motion ? S.motion.mode() === 'off' :
        !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches);
    }

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
      var f = 0, r, cs, nav, bar, hdr, narrow, lh, vv, keyboard;
      vv = window.visualViewport;
      keyboard = !!(vv && window.innerHeight - vv.height > 140);
      docEl.classList.toggle('keyboard-open', keyboard);
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
      window.visualViewport.addEventListener('scroll', measure);
    }
    if ('ResizeObserver' in window) {
      var floorRO = new ResizeObserver(measure);
      setTimeout(function () {
        var n = document.querySelector('.mobile-cta'), h = document.querySelector('.site-header');
        if (n) floorRO.observe(n); if (h) floorRO.observe(h);
      }, 0);
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
      if (printed && n && !rmNow()) { el.classList.remove('ink'); void el.offsetWidth; el.classList.add('ink'); }
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
      b.setAttribute('aria-label', 'События по вашим делам');
      b.innerHTML = '<span class="nm-g" aria-hidden="true"></span><span class="nm-n" hidden></span>';
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
          '<div><span class="ml-kicker">Пометки на полях</span><h3 id="mlH">По вашим делам</h3></div>' +
          '<button type="button" class="ml-x" data-ml-x aria-label="Закрыть"><span aria-hidden="true">×</span></button>' +
        '</div>' +
        '<ol class="ml-list"></ol>' +
        '<div class="ml-empty" hidden><span aria-hidden="true">✓</span><b>Здесь пока тихо</b><small>Новые сообщения и статусы появятся здесь.</small></div>' +
        '<div class="ml-foot">' +
          '<button type="button" class="ml-clear" data-ml-clear>Прочитать всё</button>' +
          '<a class="ml-all" href="dashboard.html">Открыть кабинет <span class="ar" aria-hidden="true">→</span></a>' +
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
      var box = buildLedger(), list = box.querySelector('.ml-list'), a = marks(), i, li, go, sp, main, meta;
      while (list.firstChild) list.removeChild(list.firstChild);
      for (i = 0; i < a.length; i++) {
        li = document.createElement('li');
        li.className = 'ml-row' + (a[i].read ? '' : ' is-new');
        go = document.createElement('a');
        go.className = 'ml-go';
        go.setAttribute('href', a[i].href || 'dashboard.html');
        go.setAttribute('data-k', a[i].k);

        sp = document.createElement('span'); sp.className = 'ml-pin';
        sp.setAttribute('aria-hidden', 'true'); go.appendChild(sp);

        main = document.createElement('span'); main.className = 'ml-main';
        sp = document.createElement('span'); sp.className = 'ml-what';
        sp.textContent = a[i].text || ''; main.appendChild(sp);
        meta = document.createElement('span'); meta.className = 'ml-meta';
        if (a[i].no) {
          sp = document.createElement('span'); sp.className = 'ml-no';
          sp.textContent = String(a[i].no); meta.appendChild(sp);
        }
        sp = document.createElement('span'); sp.className = 'ml-when';
        sp.textContent = when(a[i].ts); meta.appendChild(sp);
        main.appendChild(meta); go.appendChild(main);

        sp = document.createElement('span'); sp.className = 'ml-arrow';
        sp.setAttribute('aria-hidden', 'true'); sp.textContent = '→'; go.appendChild(sp);

        li.appendChild(go);
        list.appendChild(li);
      }
      box.querySelector('.ml-empty').hidden = a.length > 0;
      box.querySelector('.ml-foot').hidden = a.length === 0;
      box.querySelector('.ml-clear').hidden = unreadN() === 0;
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
      setTimeout(function () { if (ledger) ledger.hidden = true; }, rmNow() ? 0 : 200);
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
    var OK_WORD_RE = /(готов|принят|оплачен|скопирован|сохранён|сохранен|вошли|в буфере|подтверждён|подтвержден)/i;
    var BAD_WORD_RE = /(ошиб|не получилось|не отправил|не принял|не похож|оставьте|отметьте|слишком|нужно от|доступ ограничен|сеть шалит|подождите)/i;
    function sniff(raw) {
      if (BAD_RE.test(raw) || BAD_WORD_RE.test(raw)) return 'wax';
      if (OK_RE.test(raw) || OK_WORD_RE.test(raw)) return 'verify';
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
        if (rmNow() || !lead) {
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
      }, rmNow() ? 200 : 340);
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
    if (!btn) return;
    if (on) {
      if (!btn.classList.contains('is-loading')) btn.dataset._t = btn.innerHTML;
      btn.disabled = true;
      btn.classList.add('is-loading');
      btn.setAttribute('aria-busy', 'true');
      btn.innerHTML = '<span class="motion-loader" aria-hidden="true"><i></i><i></i><i></i></span>' +
        '<span class="motion-loading-text"></span>';
      btn.querySelector('.motion-loading-text').textContent = txt || 'Отправляем…';
    } else {
      btn.disabled = false;
      btn.classList.remove('is-loading');
      btn.removeAttribute('aria-busy');
      if (btn.dataset._t) btn.innerHTML = btn.dataset._t;
    }
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
  /* Короткий маршрут новичка: не заставляем читать сайт по кругу.
     Три решения ведут от ориентира по цене к заявке. */
  var ROUTE = [
    { href: 'tariffs.html',      label: 'Свериться с ценой', note: '1 мин' },
    { href: 'guarantees.html',   label: 'Проверить условия', note: 'по делу' },
    { href: 'configurator.html', label: 'Получить смету', note: 'без звонка' }
  ];
  var QUICK = [
    { href: 'configurator.html', no: '01', label: 'Узнать цену своей работы', note: 'Смета за минуту · без телефона', main: true },
    { href: 'start.html', no: '02', label: 'Понять, как всё устроено', note: 'Коротко: от заявки до защиты' },
    { href: 'knowledge.html', no: '03', label: 'Найти полезный разбор', note: 'ГОСТ, структура, защита' },
    { href: 'dashboard.html', no: '04', label: 'Вернуться к своему делу', note: 'Статус, файлы и переписка' }
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
      '<span class="b-name"><span class="b-full">Академический Салон</span>' +
      '<span class="b-short" aria-hidden="true">Академсалон</span></span></a>';
  }

  /* Путеводитель строится от намерения, а не от структуры сайта:
     четыре быстрых входа, поиск, три шага новичка и тихий полный индекс. */
  function mountTOC() {
    if (document.querySelector('.toc')) return;
    var toc = document.createElement('div');
    toc.className = 'toc'; toc.id = 'toc';
    toc.setAttribute('role', 'dialog'); toc.setAttribute('aria-modal', 'true'); toc.setAttribute('aria-label', 'Путеводитель по сайту');
    var routeRow = ROUTE.map(function (r, i) {
      return '<a class="tr-step" href="' + r.href + '"><i>' + (i + 1) + '</i>' +
        '<span><b>' + r.label + '</b><small>' + r.note + '</small></span></a>';
    }).join('<span class="tr-arr" aria-hidden="true">→</span>');
    var quickRows = QUICK.map(function (q) {
      return '<a class="toc-choice' + (q.main ? ' is-main' : '') + '" href="' + q.href + '">' +
        '<span class="tch-no">' + q.no + '</span><span class="tch-copy"><b>' + q.label +
        '</b><small>' + q.note + '</small></span><span class="tch-go" aria-hidden="true">→</span></a>';
    }).join('');
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
      '<div class="toc-head"><div><span class="toc-kicker">Навигация по Салону</span>' +
        '<h2 class="toc-title">Куда вам сейчас?</h2><p>Выберите задачу или найдите нужное своими словами.</p></div>' +
        '<button class="toc-close" type="button" aria-label="Закрыть путеводитель"><span aria-hidden="true">×</span></button></div>' +
      '<div class="toc-search"><span class="tcs-mark" aria-hidden="true">⌕</span><input type="search" id="tocQ" autocomplete="off" ' +
        'placeholder="Например: курсовая, оплата, речь…" aria-label="Поиск по сайту" />' +
        '<kbd>⌘ K</kbd><div class="toc-sr" id="tocSR" hidden></div></div>' +
      '<nav class="toc-choices" aria-label="Быстрый выбор" data-toc-home>' + quickRows + '</nav>' +
      '<section class="toc-route" id="tocRoute" data-toc-home><div class="tr-head"><span class="toc-grp-t">Впервые здесь</span>' +
        '<a href="start.html">Подробная карта →</a></div><nav class="tr-steps" aria-label="Маршрут новичка">' + routeRow + '</nav></section>' +
      '<details class="toc-directory" data-toc-home><summary><span><b>Весь Салон</b><small>Услуги, гарантии, материалы и документы</small></span><i aria-hidden="true">+</i></summary>' +
        '<div class="toc-grid"><nav class="toc-primary" aria-label="Разделы сайта">' + rows + '</nav>' +
          '<div class="toc-side"><div><span class="toc-grp-t">Документы</span><nav class="toc-docs" aria-label="Правовые документы">' + docRows + '</nav></div>' +
            '<div class="toc-theme-row"><span class="ttr-lbl" data-theme-label>Светлая тема</span>' + Salon.themeToggleHTML() + '</div>' +
            '<div class="toc-theme-row"><span class="ttr-lbl" data-calm-label>Спокойный режим</span>' + Salon.calmToggleHTML() + '</div>' +
          '</div></div></details>' +
      '<div class="toc-footbar" data-toc-home><button type="button" data-contact="1"><span>Нужен человек?</span><b>Связаться с мастером →</b></button>' +
        '<span>Без звонка и обязательств</span></div></div>';
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
      document.querySelectorAll('.menu-toggle').forEach(function (t) {
        t.setAttribute('aria-expanded', String(open));
        t.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
      });
      if (open) {
        toc.scrollTop = 0;
        var f = toc.querySelector('.toc-close'); if (f) f.focus();
      }
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
      else if (e.target.closest && e.target.closest('[data-contact]')) setToc(false);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && toc.classList.contains('open')) setToc(false); });

    /* --- живой поиск: label+теги, топ-9, Enter открывает первый --- */
    (function () {
      var q = toc.querySelector('#tocQ'), sr = toc.querySelector('#tocSR');
      var home = toc.querySelectorAll('[data-toc-home]');
      if (!q || !sr) return;
      function showHome(show) {
        for (var h = 0; h < home.length; h++) home[h].hidden = !show;
      }
      function draw() {
        var v = (q.value || '').trim().toLowerCase();
        if (v.length < 2) {
          sr.hidden = true; sr.innerHTML = '';
          showHome(true);
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
        sr.hidden = false; showHome(false);
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
      document.addEventListener('keydown', function (e) {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          if (!toc.classList.contains('open')) setToc(true);
          q.focus();
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
        '<span class="nav-tools" role="group" aria-label="Оформление">' +
          Salon.themeToggleHTML() +
          Salon.calmToggleHTML() +
        '</span>' +
        '<a class="nav-cab" href="dashboard.html"' + (here === 'dashboard.html' ? ' aria-current="page"' : '') +
          ' aria-label="Личный кабинет"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 19.4c.9-3.4 3.5-5 6.5-5s5.6 1.6 6.5 5"/></svg><span class="nc-txt">Кабинет</span><span class="nc-badge" hidden></span></a>' +
        '<a class="btn btn-wax" href="' + calcHref + '">Рассчитать <span class="ar" aria-hidden="true">→</span></a>' +
        '<button class="menu-toggle" type="button" aria-expanded="false" aria-controls="toc" aria-label="Открыть меню"><span class="mt-txt">Меню</span> <i aria-hidden="true"></i></button>' +
      '</div></div>' +
      '<span class="hdr-ink" aria-hidden="true"><i class="hi-tip" aria-hidden="true"></i></span>';
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

  /* ---------------- Колофон v7 «Пульт мастерской» ----------------
     Компактный финал вместо пятиколоночного каталога: ясный тезис, живой статус,
     три канала связи, быстрый маршрут и складной юридический слой. */

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
  var CLOCK_STATE = ['Ночь в мастерской', 'Мы на связи'];
  /* строка ниже говорит ТОЛЬКО про срок ответа: слово «ночь» уже стоит
     в статусе у часов — повторять его здесь было бы эхом (правка 2026-07-22) */
  var CLOCK_ETA = ['Ответим в течение нескольких часов',
                   'Отвечаем за 15–30 минут'];

  Salon.footerHTML = function () {
    var t = mskNow();
    var night = t.day ? '' : ' night';

    return '<div class="wrap">' +

    '<div class="cf7-top">' +
      '<div class="cf7-brand">' + brandHTML() +
        '<p class="cf7-kicker">Издание мастерской · с 2020 года</p>' +
        '<h2 class="cf7-title">Доведём до&nbsp;точки.<br><em>И до&nbsp;защиты.</em></h2>' +
        '<p class="cf7-copy">Профильный специалист ведёт вашу работу от&nbsp;плана до&nbsp;уверенной защиты.</p>' +
        '<span class="cf7-stamp" aria-hidden="true">' + Salon.sealSVG({
          ring: 'АКАДЕМИЧЕСКИЙ САЛОН · КАЗАНЬ · ', center: '¶', size: 94, cls: 'seal--wax'
        }) + '</span>' +
      '</div>' +
      '<div class="cf7-action">' +
        '<div class="cf7-status">' +
          '<p class="cf-clock" data-foot-clock>' +
            '<span class="cf-lamp' + night + '" aria-hidden="true"></span>' +
            '<span class="cf-cl-s">' + CLOCK_STATE[t.day ? 1 : 0] + '</span>' +
            '<span class="cf-cl-t"><span class="cf-hh">' + pad2(t.h) + '</span><span class="cf-cn">:</span><span class="cf-mm">' + pad2(t.m) + '</span><span class="cf-tz">МСК</span></span>' +
          '</p>' +
          '<p class="cf-live" data-foot-eta><span class="fcl-dot' + night + '" aria-hidden="true"></span><span class="cf-live-t">' + CLOCK_ETA[t.day ? 1 : 0] + '</span></p>' +
        '</div>' +
        '<div class="cf7-cta">' +
          '<a class="cf7-btn cf7-btn--gold" href="configurator.html">Оформить заявку <span aria-hidden="true">→</span></a>' +
          '<button class="cf7-btn cf7-btn--ghost" type="button" data-contact="1">Спросить мастера</button>' +
        '</div>' +
        '<p class="cf7-facts"><span>6 лет</span><span>1000+ защит</span><span>0 утечек</span><span>чек НПД</span></p>' +
      '</div>' +
    '</div>' +

    '<div class="cf7-board">' +
      '<nav class="cf7-channels" aria-label="Каналы связи">' +
        '<a href="' + LINKS.human + '" target="_blank" rel="noopener"><span class="cf7-no">01</span><span><b>Telegram</b><small>Отвечает человек</small></span><i aria-hidden="true">↗</i><span class="visually-hidden"> (откроется в новом окне)</span></a>' +
        '<a href="' + LINKS.vkm + '" target="_blank" rel="noopener"><span class="cf7-no">02</span><span><b>ВКонтакте</b><small>Быстрый диалог</small></span><i aria-hidden="true">↗</i><span class="visually-hidden"> (откроется в новом окне)</span></a>' +
        '<a href="' + LINKS.bot + '" target="_blank" rel="noopener"><span class="cf7-no">03</span><span><b>Бот заказов</b><small>Смета и статус 24/7</small></span><i aria-hidden="true">↗</i><span class="visually-hidden"> (откроется в новом окне)</span></a>' +
      '</nav>' +
      '<div class="cf7-route">' +
        '<a class="cf7-guide" href="start.html" data-toc-open><span class="cf7-guide-mark" aria-hidden="true">¶</span><span><b>Путеводитель по сайту</b><small>Все услуги, гайды и документы</small></span><i aria-hidden="true">→</i></a>' +
        '<nav class="cf7-quick foot-links" aria-label="Быстрые ссылки">' +
          '<a href="tariffs.html">Цены</a><a href="guarantees.html">Гарантии</a><a href="reviews.html">Отзывы</a><a href="dashboard.html">Кабинет</a><a href="knowledge.html">Гайды</a>' +
        '</nav>' +
      '</div>' +
    '</div>' +

    '<details class="cf7-legal">' +
      '<summary><span>Реквизиты и документы</span><small>самозанятый · ИНН 212885750445</small><i aria-hidden="true">+</i></summary>' +
      '<div class="cf7-legal-in">' +
        '<p><b>Семёнов Семён Юрьевич</b><br>Плательщик налога на профессиональный доход · г.&nbsp;Казань</p>' +
        '<nav aria-label="Юридические документы"><a href="oferta.html">Оферта</a><a href="privacy.html">Политика ПДн</a><a href="consent.html">Согласие</a><a href="terms.html">Соглашение</a><a href="requisites.html">Реквизиты</a><button type="button" class="cf7-data" data-cookie-settings>Настройки данных</button></nav>' +
        '<a class="cf7-fns" href="https://npd.nalog.ru/check-status/" target="_blank" rel="noopener nofollow">Проверить статус в ФНС <span aria-hidden="true">↗</span><span class="visually-hidden"> (откроется в новом окне)</span></a>' +
      '</div>' +
    '</details>' +

    '<div class="cf7-finis">' +
      '<p>© 2020–2026 «Академический Салон» <span>·</span> Казань</p>' +
      '<p class="cf7-made">набрано и сверстано в мастерской</p>' +
      '<a class="fc-top" href="#main">Наверх <span aria-hidden="true">↑</span></a>' +
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
    footer.setAttribute('aria-label', 'Приёмная и документы');
    footer.innerHTML = Salon.footerHTML();
    document.body.appendChild(footer);
    /* мостик открывает диалог — сообщаем это вспомогательным технологиям
       только когда путеводитель реально смонтирован */
    var bridge = footer.querySelector('[data-toc-open]');
    if (bridge && Salon.toc) bridge.setAttribute('aria-haspopup', 'dialog');
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
  /* ---------------- Плавающая пилюля связи (десктоп) ----------------
     Открывает лист каналов: сайт → ВК → MAX → Telegram. */
  if (!CHROME_OFF && !document.querySelector('.tg-pill') && here !== 'configurator.html' && here !== '404.html') {
    var pill = document.createElement('a');
    pill.className = 'tg-pill';
    pill.href = '#';
    pill.setAttribute('role', 'button');
    pill.innerHTML = '<span class="tp-dot" aria-hidden="true"></span>Спросить мастера';
    pill.addEventListener('click', function (e) {
      e.preventDefault();
      if (Salon.contact) Salon.contact();
    });
    document.body.appendChild(pill);
  }

  /* ---------------- Мобильная навигация: нижняя панель на всех страницах ----
     Кабинет всегда на виду (с бейджем), «Рассчитать» — сургучная кнопка. */
  /* dashboard: кабинет несёт СВОЙ нижний док с вкладками — общий не монтируем */
  var MCTA_OFF = CHROME_OFF || here === 'configurator.html' || here === '404.html' || here === 'dashboard.html';
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
    /* «Мастер» открывает короткую приёмную — глобальный [data-contact] */
    var CHAT_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6.2h16v10.4H8.6L4 20V6.2z"/><path d="M7.6 10h8.8M7.6 13h5.6"/></svg>';
    /* перо на печати — SVG: глифа ✒ нет в фирменных подмножествах шрифтов */
    var PEN_SVG = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.2c2.7 1.9 4.4 4.1 4.4 6.8 0 1.8-.9 3.4-2.4 4.4L12 20.4l-2-6c-1.5-1-2.4-2.6-2.4-4.4 0-2.7 1.7-4.9 4.4-6.8z"/><circle cx="12" cy="10.2" r="1.5"/></svg>';
    mnav.innerHTML =
      mnItem('index.html', 'Главная', '¶') +
      mnItem('tariffs.html', 'Цены', '₽') +
      mnItem(mnCalc, 'Смета', PEN_SVG, ' mn-calc') +
      mnItem('dashboard.html', 'Кабинет', CAB_SVG, ' mn-cab') +
      '<button class="mn-i mn-link" type="button" data-contact="1">' +
        '<span class="mn-ic" aria-hidden="true">' + CHAT_SVG + '</span>' +
        '<span class="mn-l">Мастер</span></button>';
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
     Включается только после отдельного analytics:true (consent v2).
     Вебвизор и ecommerce выключены; URL передаётся без query/hash. */
  (function metrika() {
    var ID = 110565162;
    /* zayavka.html — страница оплаты по ссылке мастера: там человек принимает
       денежное решение, аналитике на ней делать нечего */
    if (here === 'admin.html' || here === 'dashboard.html' || here === '404.html'
        || here === 'zayavka.html') return;
    function boot() {
      if (boot.done || !Salon.consent.allowed()) return;
      boot.done = true;
      (function (m, e, t, r, i, k, a) {
        m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
        m[i].l = 1 * new Date();
        for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) { return; } }
        k = e.createElement(t); a = e.getElementsByTagName(t)[0];
        k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
      })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=' + ID, 'ym');
      window.ym(ID, 'init', {
        ssr: true, webvisor: false, clickmap: true,
        referrer: safeReferrer(), url: location.origin + location.pathname,
        accurateTrackBounce: true, trackLinks: true
      });
    }
    function safeReferrer() {
      try {
        if (!document.referrer) return '';
        var u = new URL(document.referrer);
        return u.origin + u.pathname;
      } catch (e) { return ''; }
    }
    function forgetBrowserData() {
      try {
        Object.keys(localStorage).forEach(function (k) {
          if (/^_ym/i.test(k)) localStorage.removeItem(k);
        });
        document.cookie.split(';').forEach(function (part) {
          var name = part.split('=')[0].trim();
          if (/^_ym/i.test(name)) {
            document.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax';
            document.cookie = name + '=; Max-Age=0; path=/; domain=.' + location.hostname + '; SameSite=Lax';
          }
        });
      } catch (e) {}
    }
    function stop() {
      if (boot.done && window.ym) {
        try { window.ym(ID, 'destruct'); } catch (e) {}
      }
      boot.done = false;
      forgetBrowserData();
    }
    Salon.metrika = {
      id: ID,
      boot: boot,
      stop: stop,
      goal: function (name) {
        if (boot.done && Salon.consent.allowed() && window.ym) window.ym(ID, 'reachGoal', name);
      }
    };
    if (Salon.consent.allowed()) boot();
    document.addEventListener('salon:consent', function (e) {
      if (e.detail && e.detail.analytics === true) boot();
      else stop();
    });
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

  /* ---------------- Приёмная мастера -----------------------------------------
     Два ясных начала: личный ответ или заявка на сайте. Остальные каналы
     остаются рядом, но не спорят с главным выбором. */
  (function () {
    var sheet, lastFocus, inerted = [];
    function build(opts) {
      opts = opts || {};
      var el = document.createElement('div');
      el.className = 'contact-sheet contact-v2';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-labelledby', 'csTitle');
      var order = opts.orderLink || LINKS.bot;
      var mskH = (new Date().getUTCHours() + 3) % 24;
      var day = mskH >= 9 && mskH < 23;
      el.innerHTML =
        '<style>' +
          '.contact-v2 .cs-card{width:min(100%,460px);padding:22px 22px 18px;border:1px solid var(--hairline-strong);' +
            'border-radius:8px 8px 0 0;background:var(--sheet);box-shadow:0 -16px 50px rgba(28,25,20,.18)}' +
          '.contact-v2 .cs-head{margin:0 0 4px;min-height:44px}.contact-v2 .cs-kicker{font:10px/1.3 var(--mono);' +
            'letter-spacing:.14em;text-transform:uppercase;color:var(--ink-faint)}' +
          '.contact-v2 .cs-title{margin:0 0 7px;font:400 29px/1.05 var(--serif);color:var(--ink)}' +
          '.contact-v2 .cs-lead{margin:0 0 10px;max-width:39ch;font-size:13.5px;line-height:1.48;color:var(--ink-soft)}' +
          '.contact-v2 .cs-live{display:flex;align-items:center;gap:8px;min-height:30px;margin:0 0 12px;' +
            'padding:5px 9px;background:var(--mark);font-size:11.5px;color:var(--ink-soft)}' +
          '.contact-v2 .cs-live i{width:7px;height:7px;border-radius:50%;flex:none;background:var(--verify,#3D6B50)}' +
          '.contact-v2 .cs-live.night i{background:var(--foil,#B98A2F)}' +
          '.contact-v2 .cs-routes{display:grid;gap:7px}.contact-v2 .cs-route{min-height:60px;padding:10px 11px;' +
            'display:grid;grid-template-columns:26px minmax(0,1fr) 18px;align-items:center;gap:10px;' +
            'border:1px solid var(--hairline-strong);border-radius:3px;color:var(--ink);text-decoration:none}' +
          '.contact-v2 .cs-route--main{border-color:var(--wax);background:var(--wax-soft)}' +
          '.contact-v2 .cs-route:hover{background:var(--mark);border-color:var(--ink)}' +
          '.contact-v2 .cs-num{font:10px/1 var(--mono);letter-spacing:.08em;color:var(--wax)}' +
          '.contact-v2 .cs-route-copy{min-width:0;display:grid;gap:2px}.contact-v2 .cs-route-copy b{font-size:14.5px;font-weight:600}' +
          '.contact-v2 .cs-route-copy small{font-size:11.5px;line-height:1.3;color:var(--ink-soft)}' +
          '.contact-v2 .cs-arrow{font:20px/1 var(--serif);color:var(--wax)}' +
          '.contact-v2 .cs-alt{margin-top:13px;padding-top:10px;border-top:1px solid var(--hairline)}' +
          '.contact-v2 .cs-alt-label{display:block;margin-bottom:7px;font:9.5px/1.2 var(--mono);letter-spacing:.12em;' +
            'text-transform:uppercase;color:var(--ink-faint)}' +
          '.contact-v2 .cs-alt-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}' +
          '.contact-v2 .cs-alt-grid a{min-height:44px;padding:7px 4px;display:grid;place-items:center;border:1px solid var(--hairline);' +
            'border-radius:3px;font-size:11.5px;text-align:center;color:var(--ink-soft);text-decoration:none}' +
          '.contact-v2 .cs-alt-grid a:hover{border-color:var(--wax);color:var(--wax)}' +
          '.contact-v2 .cs-foot{margin:11px 0 0;font-size:11.5px;color:var(--ink-faint);text-align:center}' +
          '.contact-v2 .cs-foot b{font-weight:600;color:var(--ink-soft)}' +
          '@media(min-width:560px){.contact-v2 .cs-card{border-radius:6px;box-shadow:0 20px 70px rgba(28,25,20,.28)}}' +
          '@media(max-width:559px){.contact-v2 .cs-card{width:100%;max-height:88svh;padding:22px var(--mobile-gutter) calc(15px + env(safe-area-inset-bottom));' +
            'border-radius:10px 10px 0 0}.contact-v2 .cs-card::before{top:8px}.contact-v2 .cs-title{font-size:27px}' +
            '.contact-v2 .cs-route{min-height:58px;padding:8px 10px}.contact-v2 .cs-lead{font-size:13px}}' +
        '</style>' +
        '<div class="cs-backdrop" data-cs-close></div>' +
        '<div class="cs-card sheet">' +
          '<div class="cs-head"><span class="cs-kicker">Приёмная · без обязательств</span>' +
            '<button class="cs-x" type="button" aria-label="Закрыть приёмную" data-cs-close>×</button></div>' +
          '<h2 class="cs-title" id="csTitle">Спросить мастера</h2>' +
          '<p class="cs-lead">' + (opts.lead ||
            'Напишите тему и срок. Скажем, возьмёмся ли, сколько это стоит и что понадобится от вас.') + '</p>' +
          '<div class="cs-live' + (day ? '' : ' night') + '"><i aria-hidden="true"></i><span>' +
            (day ? 'Сейчас отвечаем · обычно 15–30 минут' : 'В мастерской ночь · ответим утром или раньше') + '</span></div>' +
          '<div class="cs-routes">' +
            '<a class="cs-route cs-route--main" href="' + LINKS.human + '" target="_blank" rel="noopener">' +
              '<span class="cs-num" aria-hidden="true">01</span><span class="cs-route-copy"><b>Написать мастеру</b>' +
              '<small>Личный диалог в Telegram</small></span><span class="cs-arrow" aria-hidden="true">→</span></a>' +
            '<a class="cs-route" href="configurator.html">' +
              '<span class="cs-num" aria-hidden="true">02</span><span class="cs-route-copy"><b>Оставить заявку на сайте</b>' +
              '<small>Смета, файлы и статус в одном месте</small></span><span class="cs-arrow" aria-hidden="true">→</span></a>' +
          '</div>' +
          '<div class="cs-alt"><span class="cs-alt-label">Другой путь</span><div class="cs-alt-grid">' +
            '<a href="' + LINKS.vkm + '" target="_blank" rel="noopener">ВКонтакте</a>' +
            '<a href="' + order + '" target="_blank" rel="noopener">Бот 24/7</a>' +
            '<a href="priyomnaya.html">Анонимно</a>' +
          '</div></div>' +
          '<p class="cs-foot"><b>Без оплаты:</b> сначала ответ и понятная цена.</p>' +
        '</div>';
      return el;
    }
    function close() {
      if (!sheet) return;
      sheet.classList.remove('open');
      document.body.classList.remove('toc-lock');
      inerted.forEach(function (el) { el.removeAttribute('inert'); }); inerted = [];
      var s = sheet; setTimeout(function () { if (s && s.parentNode) s.parentNode.removeChild(s); }, 240);
      sheet = null;
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    Salon.contact = function (opts) {
      lastFocus = document.activeElement;
      sheet = build(opts || {});
      document.body.appendChild(sheet);
      document.body.classList.add('toc-lock');
      inerted = ['.site-header', 'main', '.site-footer', '.mobile-cta', '.toc', '.mrail', '.lrail']
        .map(function (s) { return document.querySelector(s); }).filter(function (el) {
          return el && !sheet.contains(el);
        });
      inerted.forEach(function (el) { el.setAttribute('inert', ''); });
      void sheet.offsetWidth; /* показ без rAF — иначе шит невидим при спящем рендере */
      sheet.classList.add('open');
      var f = sheet.querySelector('.cs-x');
      if (f) {
        f.focus({ preventScroll: true });
        setTimeout(function () {
          if (sheet && !sheet.contains(document.activeElement)) f.focus({ preventScroll: true });
        }, 0);
      }
      sheet.addEventListener('click', function (e) { if (e.target.closest('[data-cs-close]')) { e.preventDefault(); close(); } });
      sheet.addEventListener('keydown', function (e) {
        if (e.key !== 'Tab') return;
        var focusable = Array.prototype.filter.call(
          sheet.querySelectorAll('a[href],button,summary'),
          function (el) { return el.getClientRects().length && !el.hasAttribute('disabled'); }
        );
        if (!focusable.length) return;
        var first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
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
        if (goDown !== hidden) {
          hidden = goDown;
          hdr.classList.toggle('hide', hidden);
          document.body.classList.toggle('header-hidden', hidden);
        }
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
      var mobile = window.matchMedia && window.matchMedia('(max-width:880px), (pointer:coarse)').matches;
      var save = navigator.connection && navigator.connection.saveData;
      if (!mobile && !save && HTMLScriptElement.supports && HTMLScriptElement.supports('speculationrules')) {
        var sr = document.createElement('script'); sr.type = 'speculationrules';
        sr.textContent = JSON.stringify({ prerender: [{ source: 'document', where: {
          selector_matches: 'a[href="configurator.html"],a[href="dashboard.html"]'
        }, eagerness: 'moderate' }] });
        document.head.appendChild(sr);
      } else if (!mobile && !save) {
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

  /* ---------------- Собственная аналитика визитов ----------------
     Работает только после analytics:true. Не получает секретные параметры
     URL, токен кабинета и идентификатор заказа. */
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
    function allowed() { return Salon.consent && Salon.consent.allowed(); }
    function page() { return location.pathname.slice(0, 200); }
    function send(extra, _retried) {
      if (!allowed()) return;
      try {
        var body = { vid: vid(), page: page() };
        for (var k in extra) body[k] = extra[k];
        var h = { 'Content-Type': 'text/plain' };
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
        if (document.referrer && document.referrer.indexOf(location.origin) !== 0) {
          var u = new URL(document.referrer);
          ref = u.origin + u.pathname;
        }
      } catch (e) {}
      send({ kind: 'view', ref: ref.slice(0, 380) || undefined });
    }
    function start() {
      if (!allowed() || start.done) return;
      start.done = true;
      if (document.prerendering) document.addEventListener('prerenderingchange', view, { once: true });
      else view();
    }
    if (allowed()) start();
    document.addEventListener('salon:consent', function (e) {
      if (e.detail && e.detail.analytics === true) start();
      else start.done = false;
    });
    return {
      /* Конверсию считаем без номера дела и без токена доступа. */
      mark: function (step) { send({ kind: 'mark', step: String(step || '').slice(0, 120) }); },
      order: function () { send({ kind: 'mark', step: 'заявка отправлена' }); }
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
