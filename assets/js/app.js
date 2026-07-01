/* ============================================================
   АКАДЕМИЧЕСКИЙ САЛОН — shared app layer
   - общий UX-слой (Salon: store/toast/copy/mask/valid/loading)
   - инъекция шапки/подвала (DRY) + умная шапка, прогресс, «наверх»
   - непрерывность заказа («Продолжить заказ»)
   - тихий статичный фон (#bg-base), без 3D/WebGL
   - reveal без флэша; данные/логика калькулятора (window.SalonCalc)
   ============================================================ */
(function () {
  'use strict';
  var docEl = document.documentElement;
  docEl.classList.add('has-js');
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- Единый error-handler: упал внешний скрипт → градиент-фолбэк ---------------- */
  window.addEventListener('error', function (e) {
    if (e && e.target && e.target.tagName === 'SCRIPT') docEl.classList.add('bg-fallback');
  }, true);

  /* ---------------- Калькулятор (единая логика) ---------------- */
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

  /* ---------------- Чем мы сильны (по дисциплинам, анонимно) ---------------- */
  window.SalonExperts = {
    hum:  { name: 'Профиль: гуманитарные науки и экономика', desc: 'Социология, история, филология, менеджмент, маркетинг, экономическая теория.' },
    law:  { name: 'Профиль: право, педагогика, психология', desc: 'Гражданское и уголовное право, методика, возрастная и клиническая психология.' },
    tech: { name: 'Профиль: технические науки и IT',          desc: 'Программирование, инженерия, расчётные и проектные работы, анализ данных.' },
    med:  { name: 'Профиль: медицина и финансы',              desc: 'Клинические темы, доказательная база, финансовый анализ, эконометрика.' }
  };

  /* ---------------- Общий UX-слой (Salon namespace) ---------------- */
  var Salon = window.Salon = window.Salon || {};
  Salon.store = {
    get: function (k, fb) { try { var v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch (e) { return fb; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  Salon.plural = function (n, forms) {
    var a = Math.abs(n) % 100, b = a % 10;
    return forms[(a > 10 && a < 20) ? 2 : (b > 1 && b < 5) ? 1 : (b === 1) ? 0 : 2];
  };
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
      var icon = opts.type === 'success' ? '✦' : opts.type === 'error' ? '!' : 'i';
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
      function dismiss() { clearTimeout(to); t.classList.remove('in'); setTimeout(function () { t.remove(); }, 300); }
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

  /* ---------------- Инъекция фоновых слоёв ---------------- */
  function el(tag, id) { var e = document.createElement(tag); if (id) e.id = id; return e; }
  function bgLayer(id) { var d = el('div', id); d.setAttribute('aria-hidden', 'true'); return d; }
  if (!document.getElementById('bg-base')) document.body.insertBefore(bgLayer('bg-base'), document.body.firstChild);
  if (!document.getElementById('bg-vignette')) document.body.insertBefore(bgLayer('bg-vignette'), document.body.firstChild);

  /* скип-линк + #main (доступность) */
  (function () {
    var main = document.querySelector('main') || document.querySelector('.hero') || document.querySelector('section');
    if (main && !main.id) main.id = 'main';
    if (main && !document.querySelector('.skip-link')) {
      var skip = document.createElement('a');
      skip.className = 'skip-link'; skip.href = '#' + (main.id || 'main'); skip.textContent = 'К содержанию';
      document.body.insertBefore(skip, document.body.firstChild);
    }
  })();

  /* ---------------- Шапка ---------------- */
  var NAV = [
    { href: 'tariffs.html', label: 'Тарифы' },
    { href: 'referral.html', label: 'Клуб' }
  ];
  var here = (location.pathname.split('/').pop() || 'index.html') || 'index.html';
  function brandHTML() {
    return '<a class="brand" href="index.html" aria-label="Академический Салон">' +
      '<span class="brand-mark"><span>А</span></span>' +
      '<span class="brand-text"><b>Академический Салон</b><small>Мастерская работ</small></span></a>';
  }
  function navLinks() {
    return NAV.map(function (n) {
      var file = n.href.split('#')[0];
      var cur = (file === here && n.href.indexOf('#') === -1) ? ' aria-current="page"' : '';
      return '<a href="' + n.href + '"' + cur + '>' + n.label + '</a>';
    }).join('');
  }

  if (!document.querySelector('.site-header')) {
    var header = document.createElement('header');
    header.className = 'site-header';
    header.innerHTML = '<div class="wrap nav">' + brandHTML() +
      '<nav class="nav-links">' + navLinks() + '</nav>' +
      '<div class="nav-cta">' +
        '<a class="btn btn-ghost" href="dashboard.html">Кабинет</a>' +
        '<a class="btn btn-primary" href="configurator.html">Рассчитать цену</a>' +
        '<button class="menu-toggle" aria-label="Меню" aria-expanded="false"><span></span><span></span><span></span></button>' +
      '</div></div>';
    document.body.insertBefore(header, document.body.firstChild);

    var overlay = document.createElement('div'); overlay.className = 'drawer-overlay';
    document.body.appendChild(overlay);
    var mm = document.createElement('aside');
    mm.className = 'mobile-menu'; mm.id = 'mobile-menu';
    mm.setAttribute('aria-hidden', 'true'); mm.setAttribute('aria-label', 'Меню');
    mm.innerHTML = navLinks() + '<a class="btn btn-ghost btn-block mt-s" href="dashboard.html">Личный кабинет</a><a class="btn btn-primary btn-block mt-s" href="configurator.html">Рассчитать стоимость</a>';
    document.body.appendChild(mm);

    var toggle = header.querySelector('.menu-toggle');
    toggle.setAttribute('aria-controls', 'mobile-menu');
    function setMenu(open) {
      mm.classList.toggle('open', open); overlay.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open)); mm.setAttribute('aria-hidden', String(!open));
      document.body.style.overflow = open ? 'hidden' : '';
      if (open) { var f = mm.querySelector('a'); if (f) f.focus(); }
    }
    toggle.addEventListener('click', function () { setMenu(!mm.classList.contains('open')); });
    overlay.addEventListener('click', function () { setMenu(false); });
    mm.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && mm.classList.contains('open')) { setMenu(false); toggle.focus(); } });

    /* бейдж активных заказов на «Кабинете» */
    var _orders = Salon.store.get('salon_orders', []);
    if (_orders && _orders.length) {
      var kab = header.querySelector('.nav-cta a[href="dashboard.html"]');
      if (kab) {
        var bdg = document.createElement('span'); bdg.className = 'nav-badge';
        bdg.textContent = _orders.length;
        bdg.setAttribute('aria-label', _orders.length + ' ' + Salon.plural(_orders.length, ['заказ', 'заказа', 'заказов']));
        kab.appendChild(bdg);
      }
    }
  }

  /* ---------------- Непрерывность заказа: «Продолжить заказ» ---------------- */
  (function continueOrder() {
    var draft = Salon.store.get('salon_draft', null);
    var cta = document.querySelector('.nav-cta');
    if (!cta || !draft || !draft.state || here === 'configurator.html') return;
    var a = document.createElement('a');
    a.className = 'btn btn-ghost nav-resume';
    a.href = 'configurator.html?step=' + ((draft.idx || 0) + 1);
    a.innerHTML = 'Продолжить заказ <span class="ar">→</span>';
    cta.insertBefore(a, cta.firstChild);
    var kab = cta.querySelector('a.btn-ghost[href="dashboard.html"]');
    if (kab) kab.style.display = 'none';
  })();

  /* ---------------- Подвал (DOM API, без innerHTML) ---------------- */
  if (!document.querySelector('.site-footer')) {
    var footer = document.createElement('footer');
    footer.className = 'site-footer';
    var fWrap = document.createElement('div'); fWrap.className = 'wrap foot-slim';
    var fRow = document.createElement('div'); fRow.className = 'foot-row';

    var fBrand = document.createElement('a');
    fBrand.className = 'brand'; fBrand.href = 'index.html';
    fBrand.setAttribute('aria-label', 'Академический Салон');
    var fMark = document.createElement('span'); fMark.className = 'brand-mark';
    var fMarkCh = document.createElement('span'); fMarkCh.textContent = 'А';
    fMark.appendChild(fMarkCh);
    var fText = document.createElement('span'); fText.className = 'brand-text';
    var fName = document.createElement('b'); fName.textContent = 'Академический Салон';
    var fSub = document.createElement('small'); fSub.textContent = 'Мастерская работ';
    fText.appendChild(fName); fText.appendChild(fSub);
    fBrand.appendChild(fMark); fBrand.appendChild(fText);

    var fNav = document.createElement('nav'); fNav.className = 'foot-links';
    [['tariffs.html', 'Тарифы'], ['referral.html', 'Клуб'], ['configurator.html', 'Рассчитать'],
     ['dashboard.html', 'Кабинет'], ['knowledge.html', 'База знаний']].forEach(function (l) {
      var a = document.createElement('a'); a.href = l[0]; a.textContent = l[1]; fNav.appendChild(a);
    });

    var fNote = document.createElement('div'); fNote.className = 'foot-note';
    fNote.textContent = 'Сайт оказывает информационно-консультационные услуги и помощь в подготовке авторских материалов по теме, указанной заказчиком. © 2026 Академический Салон.';

    fRow.appendChild(fBrand); fRow.appendChild(fNav);
    fWrap.appendChild(fRow); fWrap.appendChild(fNote);
    footer.appendChild(fWrap);
    document.body.appendChild(footer);
  }

  /* ---------------- Заглушки мессенджеров → тост ---------------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-msg]');
    if (t) { e.preventDefault(); Salon.toast('Контакты подставим, когда вы их дадите — пока это демонстрация.', { type: 'info' }); }
  });

  /* ---------------- Reveal (без флэша) ---------------- */
  function revealAll() { document.querySelectorAll('.reveal').forEach(function (n) { n.classList.add('in'); }); }
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealAll();
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('.reveal:not(.in)').forEach(function (n) { io.observe(n); });
    window.addEventListener('load', function () { setTimeout(revealAll, 1600); });
  }

  /* ---------------- Прогресс чтения + умная шапка + «наверх» (единый scroll) ---------------- */
  var bar = null;
  if (!reduceMotion) { bar = document.createElement('div'); bar.className = 'read-progress'; bar.setAttribute('aria-hidden', 'true'); document.body.appendChild(bar); }
  var toTop = document.createElement('button');
  toTop.className = 'to-top'; toTop.setAttribute('aria-label', 'Наверх'); toTop.innerHTML = '↑';
  document.body.appendChild(toTop);
  toTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); });

  var lastY = window.scrollY, hidden = false, scheduled = false;
  function onScrollFrame() {
    scheduled = false;
    var y = window.scrollY;
    var hdr = document.querySelector('.site-header');
    if (hdr) {
      hdr.classList.toggle('scrolled', y > 24);
      if (Math.abs(y - lastY) > 6) {
        var goDown = y > lastY && y > 220;
        if (goDown !== hidden) { hidden = goDown; hdr.classList.toggle('hide', hidden); }
      }
    }
    if (bar) { var h = docEl.scrollHeight - docEl.clientHeight; bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(y / h, 1) : 0) + ')'; }
    toTop.classList.toggle('show', y > 700);
    window.SalonScrollY = y;
    lastY = y;
  }
  window.addEventListener('scroll', function () { if (!scheduled) { scheduled = true; requestAnimationFrame(onScrollFrame); } }, { passive: true });
  window.addEventListener('resize', onScrollFrame, { passive: true });
  onScrollFrame();

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

  /* ---------------- Count-up чисел ---------------- */
  function countUp(n) {
    var target = parseFloat(n.getAttribute('data-count')) || 0;
    var suf = n.getAttribute('data-suffix') || '', pre = n.getAttribute('data-prefix') || '';
    var dur = 1100, t0 = null;
    function step(ts) { if (!t0) t0 = ts; var p = Math.min((ts - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3);
      n.textContent = pre + Math.round(target * e).toLocaleString('ru-RU') + suf; if (p < 1) requestAnimationFrame(step); }
    requestAnimationFrame(step);
  }
  if (!reduceMotion && 'IntersectionObserver' in window) {
    var cio = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) { if (en.isIntersecting) { countUp(en.target); cio.unobserve(en.target); } });
    }, { threshold: 0.6 });
    document.querySelectorAll('[data-count]').forEach(function (n) { cio.observe(n); });
  }

  /* Магнитные кнопки убраны — спокойный минималистичный тон. */

  /* 3D-фон «созвездие знаний» удалён в редизайне «Тихий салон» —
     фон теперь статичный градиент в #bg-base (см. git-историю при необходимости). */
})();
