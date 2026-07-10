/* ============================================================
   «ПЕРЕПЛЁТ» — сценарий главной страницы
   - hero: наклон книги за мышью + раскрытие обложки по скроллу
   - ляссе: прогресс чтения
   - смета: радио-плашки → SalonCalc → deep-link в бота
   - процесс: листаемые страницы (десктоп) / лента (мобайл)
   Всё содержимое отпечатано в HTML заранее: без JS страница
   полностью читается, скрипт лишь добавляет движение.
   Хореография включается классом body.enhanced и живо
   реагирует на ресайз/поворот через matchMedia.
   ============================================================ */
(function () {
  'use strict';
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* отладочный форс анимаций: ?motion=1 (и ?motion=0 — принудительная статика) */
  if (/[?&]motion=1/.test(location.search)) reduceMotion = false;
  if (/[?&]motion=0/.test(location.search)) reduceMotion = true;
  var finePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
  /* ВАЖНО: не выключаем хореографию по navigator.connection.saveData —
     Яндекс.Браузер в режиме «Турбо»/экономии выставляет этот флаг, и у части
     гостей страница выглядела «мёртвой» (Safari такого API не имеет, потому
     там всё работало). Листание — дешёвые transform-анимации, они по карману
     любому устройству; честно уважаем только prefers-reduced-motion. */
  var animate = !reduceMotion;

  /* Десктопная ширина. 881px не пересекается с CSS-мобайлом (max-width:880px). */
  var wideMQ = window.matchMedia('(min-width: 881px)');
  function enhanced() { return document.body.classList.contains('enhanced'); }

  /* сбросы инлайновых стилей хореографии — вызываются при выходе из десктопа */
  var resetFns = [];
  function syncEnhanced() {
    var on = animate && wideMQ.matches;
    document.body.classList.toggle('enhanced', on);
    if (on) onScroll(); else resetFns.forEach(function (fn) { fn(); });
  }

  /* ---------------- Один rAF-слушатель скролла на всё ---------------- */
  var jobs = [];
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var y = window.scrollY;
      for (var i = 0; i < jobs.length; i++) jobs[i](y);
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  /* ---------------- HERO: книга ---------------- */
  var coverScene = document.querySelector('.cover-scene');
  var bookTilt = document.querySelector('.b-tilt');
  var bookCover = document.querySelector('.b-cover');
  var bookEl = document.querySelector('.book');

  /* наклон за мышью (только тонкий указатель, без тача) */
  if (bookTilt && coverScene && finePointer && animate) {
    var mx = 0, my = 0, tiltQueued = false;
    coverScene.addEventListener('mousemove', function (e) {
      var r = coverScene.getBoundingClientRect();
      mx = (e.clientX - r.left) / r.width * 2 - 1;   /* −1 … 1 */
      my = (e.clientY - r.top) / r.height * 2 - 1;
      if (!tiltQueued) {
        tiltQueued = true;
        requestAnimationFrame(function () {
          tiltQueued = false;
          bookTilt.style.setProperty('--mx', mx.toFixed(3));
          bookTilt.style.setProperty('--my', (-my).toFixed(3));
        });
      }
    }, { passive: true });
    coverScene.addEventListener('mouseleave', function () {
      bookTilt.style.setProperty('--mx', 0);
      bookTilt.style.setProperty('--my', 0);
    });
  }

  /* раскрытие обложки по скроллу (JS-путь работает во всех браузерах) */
  if (bookCover && coverScene && animate) {
    var coverTrack = coverScene.querySelector('.cover-track');
    jobs.push(function (y) {
      if (!enhanced()) return;
      var h = coverTrack ? coverTrack.offsetHeight - window.innerHeight : window.innerHeight;
      var p = Math.min(Math.max(y / Math.max(h, 1), 0), 1);
      var e = 1 - Math.pow(1 - p, 2.2);              /* лёгкое замедление в конце */
      bookCover.style.setProperty('--open', (e * 122).toFixed(2));
      if (bookEl) bookEl.style.setProperty('--flat', e.toFixed(3)); /* книга доворачивается лицом */
      coverScene.classList.toggle('opened', p > 0.06);
      /* по мере раскрытия крышка перестаёт ловить клики */
      bookCover.style.pointerEvents = p > 0.5 ? 'none' : '';
    });
    resetFns.push(function () {
      bookCover.style.removeProperty('--open');
      bookCover.style.pointerEvents = '';
      if (bookEl) bookEl.style.removeProperty('--flat');
      coverScene.classList.remove('opened');
    });
  }

  /* ---------------- Ляссе: прогресс чтения ---------------- */
  var lasseRoot = document.querySelector('.lasse');
  if (lasseRoot) {
    jobs.push(function (y) {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      lasseRoot.style.setProperty('--sp', (Math.min(y / Math.max(max, 1), 1)).toFixed(4));
    });
  }

  /* ---------------- СМЕТА: плашки → расчёт → Telegram ---------------- */
  (function () {
    var C = window.SalonCalc;
    var root = document.getElementById('smeta');
    if (!C || !root) return;

    var state = { type: 'diplom', disc: 'hum', term: 'free' };
    var priceEl = document.getElementById('qPrice');
    var live = document.getElementById('qPriceLive');
    var typeLbl = document.getElementById('qType');
    var rowBase = document.getElementById('qBase');
    var rowDisc = document.getElementById('qDisc');
    var rowTerm = document.getElementById('qTerm');
    var tgBtn = document.getElementById('qSend');
    var cfgBtn = document.getElementById('qFull');

    /* пока калькулятор жив, дубль цены для AT скрыт — озвучивает live-регион;
       без JS aria-hidden не ставится и цена читается из разметки */
    if (priceEl) priceEl.setAttribute('aria-hidden', 'true');

    function saveDraft() {
      if (window.Salon && Salon.store) {
        Salon.store.set('salon_draft', { state: { type: state.type, disc: state.disc, term: state.term, tier: 'base' }, idx: 0, savedAt: 0 });
      }
    }

    function render(first) {
      var t = C.types.find(function (x) { return x.id === state.type; }) || C.types[0];
      var d = C.disciplines.find(function (x) { return x.id === state.disc; });
      var s = C.terms.find(function (x) { return x.id === state.term; });
      var q = C.quote(state.type, state.disc, state.term, 'base');

      if (typeLbl) typeLbl.textContent = t.label;
      rowBase.textContent = C.fmt(t.base) + ' ₽';
      rowDisc.textContent = '×' + d.k.toFixed(2).replace(/0$/, '');
      rowTerm.textContent = '×' + s.k.toFixed(2).replace(/0$/, '');
      priceEl.textContent = 'от ' + q.lowFmt + ' ₽';
      if (live) live.textContent = 'Итого: от ' + q.lowFmt + ' ₽';

      if (!first && animate) {
        priceEl.classList.remove('restamp');
        void priceEl.offsetWidth;                    /* перезапуск анимации */
        priceEl.classList.add('restamp');
      }
      if (tgBtn && window.SalonBotLink) tgBtn.href = window.SalonBotLink(state);
    }

    function selectPlate(key, value) {
      var grp = root.querySelector('[data-plates="' + key + '"]');
      if (grp) {
        grp.querySelectorAll('button[data-v]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        var plate = grp.querySelector('button[data-v="' + value + '"]');
        if (plate) plate.setAttribute('aria-pressed', 'true');
        /* если плашки для типа нет — честно не нажата ни одна, тип виден в строке сметы */
      }
      state[key] = value;
      render(false);
      saveDraft(); /* черновик — только после действия пользователя */
    }

    root.querySelectorAll('[data-plates]').forEach(function (group) {
      var key = group.getAttribute('data-plates');   /* type | disc | term */
      group.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-v]');
        if (!b) return;
        selectPlate(key, b.getAttribute('data-v'));
      });
    });

    if (cfgBtn) cfgBtn.addEventListener('click', saveDraft);
    if (tgBtn) tgBtn.addEventListener('click', saveDraft);
    render(true);

    /* строки оглавления: выбирают тип и ведут к смете */
    document.querySelectorAll('a.dotrow[data-type]').forEach(function (a) {
      a.addEventListener('click', function () {
        var id = a.getAttribute('data-type');
        if (!C.types.some(function (x) { return x.id === id; })) return;
        selectPlate('type', id);
      });
    });
  })();

  /* ---------------- ПРОЦЕСС: листание страниц ---------------- */
  (function () {
    var trackEl = document.querySelector('.proc-track');
    if (!trackEl) return;
    var sheets = Array.prototype.slice.call(trackEl.querySelectorAll('.proc-sheet'));
    var rows = Array.prototype.slice.call(trackEl.querySelectorAll('.proc-toc .pt-row'));
    var n = sheets.length;
    if (!n) return;

    /* z-порядок стопки: первый лист сверху */
    sheets.forEach(function (s, i) { s.style.zIndex = String(n - i); });

    /* оглавление глав кликабельно: ведёт к нужной странице (работает
       и при выключенных анимациях — просто прокручивает к листу) */
    rows.forEach(function (row, i) {
      row.style.cursor = 'pointer';
      row.addEventListener('click', function () {
        var total = trackEl.offsetHeight - window.innerHeight;
        if (enhanced() && total > 1) {
          var top = trackEl.getBoundingClientRect().top + window.scrollY;
          var target = i === 0 ? top : top + total * (i / (n - 1)) - 1;
          window.scrollTo({ top: target, behavior: reduceMotion ? 'auto' : 'smooth' });
        } else {
          sheets[i].scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
        }
      });
    });

    /* статичный вид: подсветка текущей главы в оглавлении — без движения,
       только смена класса, поэтому живёт и при prefers-reduced-motion.
       Нарочно без rAF: слушатель прямой, чтобы работать даже там, где
       кадры анимации задушены энергосбережением. Четыре замера — копейки. */
    function spyStatic() {
      if (enhanced()) return;                /* сценой правит листающий джоб */
      var mid = window.innerHeight / 2, current = 0;
      for (var i = 0; i < n; i++) {
        if (sheets[i].getBoundingClientRect().top <= mid) current = i;
      }
      rows.forEach(function (row, j) {
        row.classList.toggle('active', j === current);
        row.classList.toggle('done', j < current);
      });
    }
    window.addEventListener('scroll', spyStatic, { passive: true });
    window.addEventListener('resize', spyStatic, { passive: true });
    spyStatic();

    if (!animate) return;

    jobs.push(function () {
      if (!enhanced()) return;
      var r = trackEl.getBoundingClientRect();
      var total = trackEl.offsetHeight - window.innerHeight;
      if (total <= 1) return;                        /* нет запаса скролла — не листаем */
      var p = Math.min(Math.max(-r.top / total, 0), 1);
      /* последний лист не листается — на нём останавливаемся */
      var lead = p * (n - 1);
      var current = Math.min(Math.floor(lead + 0.5), n - 1);
      sheets.forEach(function (s, i) {
        var sp = Math.min(Math.max(lead - i, 0), 1);
        s.style.transform = 'rotateY(' + (-168 * sp).toFixed(2) + 'deg)';
        s.classList.toggle('turning', sp > 0.02 && sp < 0.98);
        /* улетевший лист прячем от кликов */
        s.style.visibility = sp > 0.995 ? 'hidden' : '';
      });
      rows.forEach(function (row, i) {
        row.classList.toggle('active', i === current);
        row.classList.toggle('done', i < current);
      });
    });
    resetFns.push(function () {
      sheets.forEach(function (s) {
        s.style.transform = '';
        s.style.visibility = '';
        s.classList.remove('turning');
      });
      rows.forEach(function (row, i) {
        row.classList.toggle('active', i === 0);
        row.classList.remove('done');
      });
    });
  })();

  /* режим включаем после регистрации всех джобов и следим за шириной */
  syncEnhanced();
  if (wideMQ.addEventListener) wideMQ.addEventListener('change', syncEnhanced);
  else if (wideMQ.addListener) wideMQ.addListener(syncEnhanced);

  /* первый прогон, чтобы всё встало по месту без скролла */
  onScroll();
})();
