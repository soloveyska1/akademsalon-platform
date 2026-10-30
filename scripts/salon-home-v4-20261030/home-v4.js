/* Главная, версия 4: калькулятор «Что нужно сделать?», цели Метрики, просмотр отзывов,
   липкая панель на телефоне и наклон стопки страниц за курсором.
   Без JS страница рабочая: в калькуляторе видны все варианты, обе кнопки — обычные ссылки. */
(function () {
  'use strict';

  var TG = 'https://t.me/academicsaloon';
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function goal(name) {
    try {
      if (window.Salon && Salon.metrika && typeof Salon.metrika.goal === 'function') Salon.metrika.goal(name);
    } catch (e) { /* аналитика не должна ломать клик */ }
  }

  document.addEventListener('click', function (e) {
    var tg = e.target.closest && e.target.closest('[data-tg-cta]');
    if (tg) goal('tg_click_' + tg.getAttribute('data-tg-cta'));
  });

  /* ---------- Калькулятор ----------
     Цена считается теми же функциями сайта, что и в конфигураторе: SalonCalc даёт базу
     по типу работы, направлению и сроку, SalonCommerce добавляет экспресс и дополнения.
     Выбор сохраняется в те же ключи sessionStorage, поэтому заявка открывается с ним. */
  var TERMS = {
    later: { speed: 'standard', term: 'free', text: 'не срочно, через месяц и позже' },
    weeks: { speed: 'standard', term: 'mid', text: 'через 2–4 недели' },
    soon: { speed: 'standard', term: 'urgent', text: 'в ближайшие 2 недели' },
    tomorrow: { speed: 'express24', term: 'free', text: 'за 24 часа' }
  };
  var SCOPE_TEXT = { whole: 'целиком', part: 'часть работы', editing: 'доработка готового текста' };
  var DRAFT_KEY = 'salon_direct_selection_v1';
  var TERM_KEY = 'salon_home_term_v4';

  function initCalc() {
    var form = document.getElementById('calc-form');
    var M = window.SalonCommerce, P = window.SalonProducts, C = window.SalonCalc;
    if (!form || !M || !P || !C) return;

    var priceEl = form.querySelector('[data-calc-price]');
    var metaEl = form.querySelector('[data-calc-meta]');
    var tgEl = form.querySelector('[data-calc-tg]');
    var orderEl = form.querySelector('[data-calc-order]');
    var packEl = form.querySelector('[data-calc-pack]');
    var countEl = form.querySelector('[data-calc-extras-count]');
    var more = form.querySelector('.calc-more');
    var live = document.createElement('span');
    live.className = 'ds-sr';
    live.setAttribute('aria-live', 'polite');
    form.appendChild(live);

    function radios(name) { return form.querySelectorAll('input[name="' + name + '"]'); }
    function val(name) { var el = form.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : null; }
    function setRadio(name, value) {
      var el = form.querySelector('input[name="' + name + '"][value="' + value + '"]');
      if (el && !el.disabled) { el.checked = true; return true; }
      return false;
    }
    function labelOf(name, value) {
      var el = form.querySelector('input[name="' + name + '"][value="' + value + '"]');
      var chip = el && el.nextElementSibling;
      return chip ? chip.firstChild.textContent.trim() : value;
    }
    function readDraft() {
      try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || '{}') || {}; } catch (e) { return {}; }
    }

    function allowedScopes(work) {
      if (work === 'intro') return ['part'];
      if (work === 'editing') return ['editing'];
      if (work === 'chapter') return ['part', 'editing'];
      return ['whole', 'part', 'editing'];
    }
    function base(productId, scope, disc, termKey) {
      var p = P.get(productId);
      if (p.id === 'custom' || p.id === 'editing' || (scope === 'part' && p.id !== 'chapter')) return null;
      var t = TERMS[termKey];
      var term = t.speed !== 'standard' ? 'free' : t.term;
      return C.quote(p.type, disc, term, scope === 'editing' ? 'turn' : 'vip').low;
    }
    function snapshot() {
      var work = val('work') || 'course';
      var termKey = val('term') || 'later';
      var addons = Array.prototype.map.call(form.querySelectorAll('input[name="addon"]:checked'), function (i) { return i.value; });
      var raw = work === 'intro'
        ? { product: 'custom', scope: 'part', part: 'intro' }
        : { product: work, scope: val('scope') || 'whole' };
      raw.speed = TERMS[termKey].speed;
      raw.addons = addons;
      raw.package = 'standard';
      return { st: M.normalize(raw), work: work, disc: val('disc') || 'hum', termKey: termKey };
    }

    /* Ограничения вариантов — те же, что в прежнем калькуляторе сайта */
    function constrain() {
      var work = val('work') || 'course';
      var allowed = allowedScopes(work);
      Array.prototype.forEach.call(radios('scope'), function (r) { r.disabled = allowed.indexOf(r.value) < 0; });
      if (allowed.indexOf(val('scope')) < 0) setRadio('scope', allowed[0]);
      var noExpress = work === 'kandidat';
      var tomorrow = form.querySelector('input[name="term"][value="tomorrow"]');
      if (tomorrow) {
        tomorrow.disabled = noExpress;
        if (noExpress && tomorrow.checked) setRadio('term', 'later');
      }
    }

    var shown = null, anim = 0, settle = 0;
    function showPrice(n, quoteText) {
      cancelAnimationFrame(anim);
      clearTimeout(settle);
      if (n === null) {
        priceEl.textContent = quoteText;
        priceEl.classList.add('is-quote');
        shown = null;
        return;
      }
      priceEl.classList.remove('is-quote');
      if (reduceMotion || document.hidden || shown === null || shown === n) {
        priceEl.textContent = 'от ' + P.money(n);
        shown = n;
        return;
      }
      var from = shown, start = performance.now();
      shown = n;
      (function step(now) {
        var k = Math.min(1, (now - start) / 320);
        var e = 1 - Math.pow(1 - k, 3);
        var v = k < 1 ? Math.round((from + (n - from) * e) / 100) * 100 : n;
        priceEl.textContent = 'от ' + P.money(v);
        if (k < 1) anim = requestAnimationFrame(step);
      })(start);
      // Если кадры не идут (фоновая вкладка, экономия энергии), цифра всё равно встанет на место
      settle = setTimeout(function () {
        cancelAnimationFrame(anim);
        priceEl.textContent = 'от ' + P.money(n);
      }, 420);
    }

    function chipPrices(disc, termKey) {
      Array.prototype.forEach.call(form.querySelectorAll('[data-price-for]'), function (small) {
        var id = small.getAttribute('data-price-for');
        if (id === 'intro' || id === 'custom' || id === 'editing') return;
        var scope = id === 'chapter' ? 'part' : 'whole';
        var b = base(id, scope, disc, termKey);
        if (b === null) return;
        var factor = TERMS[termKey].speed === 'express24' && id !== 'kandidat' ? 2 : 1;
        small.textContent = 'от ' + P.money(b * factor);
      });
    }

    function message(s, q) {
      var p = P.get(s.st.product);
      var work = s.work === 'intro' ? 'введение или заключение' : p.name + ', ' + SCOPE_TEXT[s.st.scope];
      var lines = [
        'Здравствуйте! Хочу узнать точную цену.',
        'Работа: ' + work,
        'Направление: ' + labelOf('disc', s.disc).toLowerCase(),
        'Срок: ' + TERMS[s.termKey].text
      ];
      var extras = M.lines(s.st).map(function (l) { return l.label.toLowerCase(); });
      if (extras.length) lines.push('Дополнительно: ' + extras.join(', '));
      lines.push(q.total !== null ? 'Ориентир на сайте: от ' + P.money(q.total) : 'На сайте цену не посчитать, нужна оценка по заданию');
      return lines.join('\n');
    }

    function save(s) {
      M.save(s.st);
      try {
        var d = readDraft();
        d.discipline = s.disc;
        d.product = s.st.product;
        d.scope = s.st.scope;
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
        sessionStorage.setItem(TERM_KEY, s.termKey);
      } catch (e) { /* приватный режим: расчёт работает, просто не запоминается */ }
    }

    function sync(persist) {
      constrain();
      var s = snapshot();
      var q = M.quote(s.st, base(s.st.product, s.st.scope, s.disc, s.termKey));
      showPrice(q.total, 'Назовём по заданию');
      var p = P.get(s.st.product);
      if (q.total === null) {
        metaEl.textContent = 'Пришли задание: в рабочее время оценим его за 15–30 минут.' +
          (q.extras ? ' Дополнения — от ' + P.money(q.extras) + '.' : '');
      } else if (s.termKey === 'tomorrow') {
        metaEl.textContent = '24 часа считаем после согласования задания и оплаты. Оформление по методичке уже в цене.';
      } else {
        metaEl.textContent = 'Обычно ' + p.days + '. Оформление по методичке уже в цене.';
      }
      packEl.hidden = !(q.saving > 0);
      var n = s.st.addons.length;
      countEl.textContent = n ? String(n) : '';
      chipPrices(s.disc, s.termKey);
      tgEl.href = TG + '?text=' + encodeURIComponent(message(s, q));
      live.textContent = (q.total !== null ? 'Ориентир от ' + P.money(q.total) : 'Цена по заданию') + '. ' + metaEl.textContent;
      /* Сохраняем только выбор человека: открытие страницы само по себе ничего не запоминает */
      if (persist) save(s);
    }

    /* Восстановить прошлый выбор: из этой главной или из конфигуратора */
    (function restore() {
      var st = M.read(), d = readDraft(), t = null;
      var work = st.part === 'intro' ? 'intro' : st.product;
      if (!setRadio('work', work)) setRadio('work', 'course');
      setRadio('scope', st.scope);
      if (d.discipline) setRadio('disc', d.discipline);
      try { t = sessionStorage.getItem(TERM_KEY); } catch (e) { t = null; }
      if (st.speed === 'express24') t = 'tomorrow';
      if (t && TERMS[t]) setRadio('term', t);
      st.addons.forEach(function (id) {
        var box = form.querySelector('input[name="addon"][value="' + id + '"]');
        if (box) box.checked = true;
      });
      var chosen = form.querySelector('input[name="work"]:checked');
      if (more && chosen && more.contains(chosen)) more.open = true;
      if (st.addons.length) form.querySelector('.calc-extras').open = true;
    })();

    form.addEventListener('change', function () { sync(true); });
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    orderEl.addEventListener('click', function () { sync(true); goal('calc_order_click'); });
    sync(false);
  }

  /* ---------- Просмотр отзыва поверх страницы ---------- */
  function initViewer() {
    var cards = document.querySelectorAll('.hv-voice a');
    if (!cards.length || typeof HTMLDialogElement !== 'function') return;
    var dlg = document.createElement('dialog');
    dlg.className = 'hv-viewer';
    dlg.setAttribute('aria-label', 'Отзыв клиента');
    dlg.innerHTML = '<figure><div class="hv-viewer-img"><img alt=""></div>' +
      '<figcaption><span></span><button type="button">Закрыть</button></figcaption></figure>';
    document.body.appendChild(dlg);
    var img = dlg.querySelector('img');
    var cap = dlg.querySelector('figcaption span');
    var opener = null;
    dlg.querySelector('button').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', function () {
      img.removeAttribute('src');
      if (opener) opener.focus();
    });
    Array.prototype.forEach.call(cards, function (card) {
      card.addEventListener('click', function (e) {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        opener = card;
        var quote = card.parentNode.querySelector('figcaption');
        img.src = card.getAttribute('href');
        img.alt = quote ? quote.textContent : 'Отзыв клиента';
        cap.textContent = quote ? quote.textContent : '';
        dlg.showModal();
        goal('review_open_home');
      });
    });
  }

  /* ---------- Липкая панель на телефоне ----------
     Видна, когда кнопки первого экрана ушли из вида; прячется у калькулятора
     и у финального призыва — там свои кнопки. */
  function initBar() {
    var bar = document.querySelector('.hv-bar');
    var actions = document.querySelector('.hv-hero .hv-actions');
    if (!bar || !actions || !('IntersectionObserver' in window)) return;
    var heroGone = false, quiet = {};
    function update() {
      var on = heroGone && !quiet.calc && !quiet.final;
      bar.classList.toggle('is-on', on);
      bar.setAttribute('aria-hidden', on ? 'false' : 'true');
      Array.prototype.forEach.call(bar.querySelectorAll('a'), function (a) { a.tabIndex = on ? 0 : -1; });
    }
    new IntersectionObserver(function (entries) {
      heroGone = !entries[0].isIntersecting && entries[0].boundingClientRect.top < 0;
      update();
    }).observe(actions);
    [['calc', '#calc-form'], ['final', '.hv-final']].forEach(function (pair) {
      var el = document.querySelector(pair[1]);
      if (!el) return;
      new IntersectionObserver(function (entries) {
        quiet[pair[0]] = entries[0].isIntersecting;
        // Пока калькулятор на экране, пузырь Листика на телефоне не закрывает чипы и кнопки
        if (pair[0] === 'calc') document.body.classList.toggle('hv-calc-focus', quiet.calc);
        update();
      }).observe(el);
    });
    update();
  }

  /* ---------- Наклон стопки страниц за курсором (только мышь) ---------- */
  function initTilt() {
    var hero = document.querySelector('.hv-hero');
    var inner = document.querySelector('.hv-stack-inner');
    if (!hero || !inner || !window.matchMedia || reduceMotion) return;
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    var frame = 0, px = 0, py = 0;
    function apply() {
      frame = 0;
      inner.style.setProperty('--ry', (-13 + px * 12).toFixed(2) + 'deg');
      inner.style.setProperty('--rx', (7 - py * 9).toFixed(2) + 'deg');
    }
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      px = (e.clientX - r.left) / r.width - 0.5;
      py = (e.clientY - r.top) / r.height - 0.5;
      if (!frame) frame = requestAnimationFrame(apply);
    });
    hero.addEventListener('pointerleave', function () {
      inner.style.removeProperty('--ry');
      inner.style.removeProperty('--rx');
    });
  }

  function init() {
    initCalc();
    initViewer();
    initBar();
    initTilt();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
