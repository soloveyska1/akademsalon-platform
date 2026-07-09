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
      { id: 'kandidat',   label: 'Кандидатская под ключ',                          base: 200000 },
      { id: 'course',     label: 'Курсовая теоретическая',                         base: 14000 },
      { id: 'course_emp', label: 'Курсовая эмпирическая (с практикой, расчётами)', base: 20000 },
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
      { id: 'turn', label: 'Под ключ', k: 1.33, note: 'Сопровождение до приёмки' },
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

  /* ---------------- Контакты (единственный источник ссылок) ----------------
     Сайт НЕ собирает и НЕ хранит персональные данные: заявка уходит
     в мессенджер, где отвечает человек/бот. На сайте — только ссылки. */
  var LINKS = window.SalonLinks = {
    bot:   'https://t.me/academic_saloon_bot',   // бот: заявки, расчёт, статусы
    human: 'https://t.me/academicsaloon',        // личка: отвечает человек
    vk:    'https://vk.com/academicsaloon',      // сообщество ВКонтакте
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

  /* ---------------- Отдельные услуги (плоские цены «от», вне формулы) ---------------- */
  window.SalonServices = [
    { id:'ai',    label:'Чистка текста от следов ИИ',        from:2500, unit:'',       code:'ai',
      desc:'Редактура и стилистическая доработка: убираем машинальные обороты и канцелярит, текст читается как живой.' },
    { id:'review',label:'Разбор готовой работы',             from:2500, unit:'',       code:'rv',
      desc:'Объясним структуру и логику вашей ВКР, курсовой или реферата, подготовим к вопросам на защите.' },
    { id:'tutor', label:'Репетиторство и консультации',      from:3000, unit:' / час', code:'tu',
      desc:'Индивидуальные занятия и разбор темы: методология, оформление, подготовка к сдаче — по вашему запросу.' },
    { id:'norm',  label:'Оформление по методичке · нормоконтроль', from:5000, unit:'', code:'nm',
      desc:'Приводим работу к требованиям методички и ГОСТ, готовим к прохождению нормоконтроля.' }
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

  (function () {
    var box;
    function ensure() {
      if (box) return box;
      box = document.createElement('div'); box.className = 'toast-stack';
      box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box); return box;
    }
    Salon.toast = function (msg, opts) {
      opts = opts || {};
      var t = document.createElement('div');
      t.className = 'toast toast-' + (opts.type || 'info');
      var icon = opts.type === 'success' ? '¶' : opts.type === 'error' ? '!' : '§';
      t.innerHTML = '<span class="toast-ic">' + icon + '</span><span class="toast-msg"></span>';
      t.querySelector('.toast-msg').textContent = msg;
      if (opts.action) {
        var b = document.createElement('button');
        b.className = 'toast-act'; b.textContent = opts.action.label;
        b.addEventListener('click', function () { opts.action.onClick(); dismiss(); });
        t.appendChild(b);
      }
      ensure().appendChild(t);
      requestAnimationFrame(function () { t.classList.add('in'); });
      var to = setTimeout(dismiss, opts.duration || 4200);
      function dismiss() { clearTimeout(to); t.classList.remove('in'); setTimeout(function () { t.remove(); }, 260); }
      return dismiss;
    };
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
    contact: function (v) { return Salon.valid.phone(v) || Salon.valid.telegram(v) || Salon.valid.email(v); }
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
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min((ts - t0) / dur, 1);
      var e = 1 - Math.pow(1 - p, 4);
      put(from + (target - from) * e);
      if (p < 1 && el.dataset.cur === String(target)) requestAnimationFrame(step);
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
    { href: 'tariffs.html',    label: 'Цены' },
    { href: 'guarantees.html', label: 'Гарантии' },
    { href: 'reviews.html',    label: 'Отзывы' },
    { href: 'referral.html',   label: 'Клуб', x: true },
    { href: 'knowledge.html',  label: 'База знаний', x: true }
  ];
  var TOC = [
    { href: 'index.html',        label: 'Главная',          no: '01' },
    { href: 'configurator.html', label: 'Рассчитать заказ', no: '02' },
    { href: 'tariffs.html',      label: 'Цены и услуги',    no: '03' },
    { href: 'guarantees.html',   label: 'Гарантии · устав', no: '04' },
    { href: 'reviews.html',      label: 'Отзывы',           no: '05' },
    { href: 'referral.html',     label: 'Клуб и бонусы',    no: '06' },
    { href: 'knowledge.html',    label: 'База знаний',      no: '07' },
    { href: 'check.html',        label: 'Проверка текста',  no: '08' },
    { href: 'dashboard.html',    label: 'Личный кабинет',   no: '09' }
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

  /* Полноэкранное меню «Оглавление» — одно на страницу; держит ВСЕ разделы,
     документы, контакты и переключатель темы. Быстрый доступ ко всему,
     не перегружая шапку. */
  function mountTOC() {
    if (document.querySelector('.toc')) return;
    var toc = document.createElement('div');
    toc.className = 'toc'; toc.id = 'toc';
    toc.setAttribute('role', 'dialog'); toc.setAttribute('aria-modal', 'true'); toc.setAttribute('aria-label', 'Меню сайта');
    var rows = TOC.map(function (t) {
      var cur = t.href === here ? ' aria-current="page"' : '';
      return '<a class="dotrow" href="' + t.href + '"' + cur + '><span>' + t.label + '</span><span class="dots"></span><span class="dr-val">' + t.no + '</span></a>';
    }).join('');
    var docRows = DOCS.map(function (d) {
      return '<a href="' + d[0] + '">' + d[1] + '</a>';
    }).join('');
    toc.innerHTML = '<div class="toc-inner">' +
      '<div class="toc-head"><span class="toc-title">Оглавление</span>' +
        '<button class="toc-close" type="button">Закрыть</button></div>' +
      '<div class="toc-grid">' +
        '<nav class="toc-primary" aria-label="Разделы сайта">' + rows + '</nav>' +
        '<div class="toc-side">' +
          '<div><span class="toc-grp-t">Документы</span><nav class="toc-docs" aria-label="Правовые документы">' + docRows + '</nav></div>' +
          '<div><span class="toc-grp-t">Связь</span><div class="toc-contacts">' +
            '<a href="' + LINKS.bot + '" target="_blank" rel="noopener"><span>Бот · заявки и расчёт</span><span class="tc-v">@academic_saloon_bot</span></a>' +
            '<a href="' + LINKS.human + '" target="_blank" rel="noopener"><span>Написать человеку</span><span class="tc-v">@academicsaloon</span></a>' +
            '<a href="' + LINKS.vk + '" target="_blank" rel="noopener"><span>ВКонтакте</span><span class="tc-v">vk.com/academicsaloon</span></a>' +
          '</div></div>' +
          '<div class="toc-theme-row"><span class="ttr-lbl" data-theme-label>Светлая тема</span>' + Salon.themeToggleHTML() + '</div>' +
          '<a class="btn btn-wax btn-block btn-lg toc-cta" href="configurator.html">Рассчитать стоимость <span class="ar">→</span></a>' +
        '</div>' +
      '</div></div>';
    document.body.appendChild(toc);
    if (Salon.theme) Salon.theme.apply(Salon.theme.current(), false); /* синк подписи темы */

    function tocSiblings() {
      return ['.site-header', 'main', '.site-footer', '.mobile-cta', '.lasse', '.tg-pill']
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
      var items = toc.querySelectorAll('button, a[href]');
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    toc.querySelector('.toc-close').addEventListener('click', function () { setToc(false); });
    /* закрываем по переходу — но НЕ по клику на переключатель темы */
    toc.querySelectorAll('a[href]').forEach(function (a) { a.addEventListener('click', function () { setToc(false); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && toc.classList.contains('open')) setToc(false); });

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
     бренд · Цены · Гарантии · Отзывы · Клуб · База знаний · тема · «Рассчитать» · «Меню».
     На главной «Рассчитать» ведёт к смете на странице, дальше — в конфигуратор. */
  if (!document.querySelector('.site-header')) {
    var header = document.createElement('header');
    header.className = 'site-header';
    var navLinks = NAV.map(function (n) {
      var cur = n.href === here ? ' aria-current="page"' : '';
      var cls = n.x ? ' class="nav-x"' : '';
      return '<a href="' + n.href + '"' + cur + cls + '>' + n.label + '</a>';
    }).join('');
    var calcHref = here === 'index.html' ? '#smeta' : 'configurator.html';
    header.innerHTML = '<div class="wrap nav">' + brandHTML() +
      '<nav class="nav-links" aria-label="Разделы">' + navLinks + '</nav>' +
      '<div class="nav-cta">' +
        Salon.themeToggleHTML() +
        '<a class="btn btn-wax" href="' + calcHref + '">Рассчитать</a>' +
        '<button class="menu-toggle" type="button" aria-expanded="false" aria-controls="toc" aria-label="Открыть меню"><span class="mt-txt">Меню</span> <i aria-hidden="true"></i></button>' +
      '</div></div>';
    document.body.insertBefore(header, document.body.firstChild);
    if (Salon.theme) Salon.theme.apply(Salon.theme.current(), false); /* синк состояния кнопки темы */
  }

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

  /* ---------------- Подвал-колофон (тёмный финал каждой страницы) ---------------- */
  Salon.footerHTML = function () {
    return '<div class="wrap">' +
      '<div class="colophon-center">' +
        '<div class="co-para" aria-hidden="true">¶</div>' +
        '<h2>Узнайте точную стоимость за минуту</h2>' +
        '<p class="co-line">Набрано вручную · сверстано без шаблонов · 1000+ работ</p>' +
        '<a class="btn btn-wax" href="' + LINKS.bot + '" target="_blank" rel="noopener">Написать в Telegram<span class="visually-hidden"> (откроется в новом окне)</span> <span class="ar">→</span></a>' +
        '<p class="co-alt">Или лично: <a href="' + LINKS.human + '" target="_blank" rel="noopener">@academicsaloon<span class="visually-hidden"> (откроется в новом окне)</span></a> · Оценка бесплатна — решение остаётся за вами</p>' +
      '</div>' +
      '<div class="foot-cols">' +
        '<div class="fc-brand">' + brandHTML() +
          '<div class="foot-contacts">' +
            '<a href="' + LINKS.bot + '" target="_blank" rel="noopener"><span class="fco-l">Бот · заявки и расчёт</span><span class="fco-v">@academic_saloon_bot</span></a>' +
            '<a href="' + LINKS.human + '" target="_blank" rel="noopener"><span class="fco-l">Написать человеку</span><span class="fco-v">@academicsaloon</span></a>' +
            '<a href="' + LINKS.vk + '" target="_blank" rel="noopener"><span class="fco-l">Сообщество ВКонтакте</span><span class="fco-v">vk.com/academicsaloon</span></a>' +
            '<a href="' + LINKS.max + '" target="_blank" rel="noopener"><span class="fco-l">Канал в MAX</span><span class="fco-v">max.ru — Академический Салон</span></a>' +
          '</div>' +
        '</div>' +
        '<div><div class="fc-h">Разделы</div><nav class="foot-links" aria-label="Карта сайта">' +
          '<a href="configurator.html">Рассчитать заказ</a><a href="tariffs.html">Цены и услуги</a>' +
          '<a href="guarantees.html">Гарантии · устав</a><a href="reviews.html">Отзывы</a>' +
          '<a href="referral.html">Клуб и бонусы</a><a href="knowledge.html">База знаний</a>' +
          '<a href="check.html">Проверка текста</a><a href="dashboard.html">Кабинет</a>' +
        '</nav></div>' +
        '<div><div class="fc-h">Документы</div><nav class="foot-links" aria-label="Правовые документы">' +
          '<a href="oferta.html">Публичная оферта</a><a href="privacy.html">Политика ПДн</a>' +
          '<a href="consent.html">Согласие на обработку ПДн</a><a href="loyalty.html">Правила лояльности</a>' +
          '<a href="terms.html">Пользовательское соглашение</a><a href="requisites.html">Реквизиты</a>' +
        '</nav></div>' +
      '</div>' +
      '<div class="foot-legal">' +
        '<div class="fl-row"><span class="fl-k">Исполнитель</span><span class="fl-v">Семёнов Семён Юрьевич · самозанятый, налог на профессиональный доход (ФЗ №&nbsp;422-ФЗ) · ИНН 212885750445 · г.&nbsp;Казань</span></div>' +
        '<div class="fl-row"><span class="fl-k">Характер услуг</span><span class="fl-v">Информационно-консультационная и учебно-методическая помощь для самостоятельной подготовки заказчика</span></div>' +
        '<div class="fl-row"><span class="fl-k">Данные</span><span class="fl-v">Данные из формы заказа используются только для связи и выполнения заказа — <a href="privacy.html">политика ПДн</a></span></div>' +
      '</div>' +
      '<div class="foot-copy"><span>© 2020–2026 «Академический Салон»</span><span class="fc-sep">·</span><span>6 лет практики</span><span class="fc-sep">·</span><span>1000+ работ доведено до приёмки</span></div>' +
    '</div>';
  };
  if (!document.querySelector('.site-footer')) {
    var footer = document.createElement('footer');
    footer.className = 'site-footer';
    footer.setAttribute('aria-label', 'Колофон');
    footer.innerHTML = Salon.footerHTML();
    document.body.appendChild(footer);
  }

  /* ---------------- Плавающий Telegram (десктоп) ---------------- */
  if (!document.querySelector('.tg-pill') && here !== 'configurator.html' && here !== '404.html') {
    var pill = document.createElement('a');
    pill.className = 'tg-pill';
    pill.href = LINKS.bot; pill.target = '_blank'; pill.rel = 'noopener';
    pill.innerHTML = '<span class="tp-dot" aria-hidden="true"></span>Telegram<span class="visually-hidden"> (откроется в новом окне)</span>';
    document.body.appendChild(pill);
  }

  /* ---------------- Мобильный sticky-CTA (если страница не задала свой) ---------------- */
  if (!document.querySelector('.mobile-cta') && here !== 'configurator.html' && here !== '404.html') {
    var mcta = document.createElement('div');
    mcta.className = 'mobile-cta';
    mcta.innerHTML = '<a class="btn btn-wax" href="configurator.html">Рассчитать стоимость</a>';
    document.body.appendChild(mcta);
  }

  /* ---------------- Лист связи (bot / человек / ВК) ----------------
     Никакие данные не отправляются с сайта: открываем мессенджер,
     где отвечает бот или человек. [data-msg] или [data-contact] — триггеры. */
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
          '<a class="cs-opt cs-opt--wax" href="' + order + '" target="_blank" rel="noopener">' +
            '<span class="cs-o-ic" aria-hidden="true">✎</span>' +
            '<span class="cs-o-txt"><b>Оформить через бота</b><small>Расчёт, заявка и статус заказа — за пару минут</small></span>' +
            '<span class="ar" aria-hidden="true">→</span></a>' +
          '<a class="cs-opt" href="' + LINKS.human + '" target="_blank" rel="noopener">' +
            '<span class="cs-o-ic" aria-hidden="true">✆</span>' +
            '<span class="cs-o-txt"><b>Написать человеку в Telegram</b><small>Ответим лично, обычно в течение пары часов</small></span>' +
            '<span class="ar" aria-hidden="true">→</span></a>' +
          '<a class="cs-opt" href="' + LINKS.vk + '" target="_blank" rel="noopener">' +
            '<span class="cs-o-ic" aria-hidden="true">ВК</span>' +
            '<span class="cs-o-txt"><b>ВКонтакте</b><small>vk.com/academicsaloon</small></span>' +
            '<span class="ar" aria-hidden="true">→</span></a>' +
          '<a class="cs-opt" href="' + LINKS.max + '" target="_blank" rel="noopener">' +
            '<span class="cs-o-ic" aria-hidden="true">' + maxLogoSVG() + '</span>' +
            '<span class="cs-o-txt"><b>Канал в MAX</b><small>новости и акции мастерской</small></span>' +
            '<span class="ar" aria-hidden="true">→</span></a>' +
          '<p class="cs-note">Переписка идёт в выбранном мессенджере; заказ можно оформить и на сайте — в <a href="configurator.html">конфигураторе</a>. Нажимая, вы принимаете <a href="oferta.html">оферту</a> и <a href="privacy.html">политику ПДн</a>.</p>' +
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
      requestAnimationFrame(function () { sheet.classList.add('open'); });
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

  /* ---------------- Умная шапка (прячется при скролле вниз) ---------------- */
  var lastY = window.scrollY, hidden = false, scheduled = false;
  function onScrollFrame() {
    scheduled = false;
    var y = window.scrollY;
    var hdr = document.querySelector('.site-header');
    if (hdr && Math.abs(y - lastY) > 6) {
      var goDown = y > lastY && y > 200;
      if (goDown !== hidden) { hidden = goDown; hdr.classList.toggle('hide', hidden); }
    }
    lastY = y;
  }
  window.addEventListener('scroll', function () { if (!scheduled) { scheduled = true; requestAnimationFrame(onScrollFrame); } }, { passive: true });

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
  var API_BASE = (location.hostname === 'academic-saloon.duckdns.org')
    ? '/api' : 'https://academic-saloon.duckdns.org/api';
  Salon.api = {
    base: API_BASE,
    token: function () { return Salon.store.get('salon_session', null); },
    setToken: function (t) { t ? Salon.store.set('salon_session', t) : Salon.store.del('salon_session'); },
    user: function () { return Salon.store.get('salon_user', null); },
    setUser: function (u) { u ? Salon.store.set('salon_user', u) : Salon.store.del('salon_user'); },
    guestTokens: function () { var v = Salon.store.get('salon_tokens', []); return Array.isArray(v) ? v : []; },
    addGuestToken: function (t) {
      var v = Salon.api.guestTokens();
      if (t && v.indexOf(t) < 0) { v.push(t); Salon.store.set('salon_tokens', v.slice(-30)); }
    },
    identified: function () { return !!(Salon.api.token() || Salon.api.guestTokens().length); },
    req: function (method, path, body) {
      var h = {};
      if (body !== undefined) h['Content-Type'] = 'application/json';
      var t = Salon.api.token();
      if (t) h['Authorization'] = 'Bearer ' + t;
      return fetch(API_BASE + path, { method: method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined })
        .then(function (r) {
          if (r.status === 401) { Salon.api.setToken(null); Salon.api.setUser(null); }
          return r.json();
        })
        .catch(function () { return { ok: false, error: 'network' }; });
    },
    get: function (p) { return Salon.api.req('GET', p); },
    post: function (p, b) { return Salon.api.req('POST', p, b || {}); },
    logout: function () { Salon.api.setToken(null); Salon.api.setUser(null); }
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
