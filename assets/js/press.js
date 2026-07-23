/* ============================================================
   «ПРЕСС» — хореография сцены главной.
   Квик-калк, черновик, слоты и печати живут в app.js/pereplet.js —
   здесь только кино: прогресс скролла, наклон за курсором, пылинки,
   режим потока (мобильные и reduce-motion) и навигация к приёмной.
   ============================================================ */
(function () {
  'use strict';
  var docEl = document.documentElement;
  var track = document.getElementById('prTrack');
  var scene = document.querySelector('.pr-scene');
  var bookTrigger = document.getElementById('prBookTrigger');
  var formHeading = document.querySelector('.pr-formh');
  var concealedPages = [
    document.querySelector('.pr-first'),
    document.querySelector('.pr-cvin')
  ].filter(Boolean);
  var focusTimer = 0;
  if (!track || !scene) return;

  var rm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)');
  function reduced() {
    if (window.Salon && Salon.motion) return Salon.motion.mode() === 'off';
    return rm || docEl.hasAttribute('data-calm');
  }
  /* Поток — мобильная вёрстка, touch-устройства и явно включённый
     пользователем спокойный режим. Системный reduced-motion на широком
     экране сохраняет книгу в титуле, но превращает сцену в два статичных
     состояния — закрытая книга и раскрытая смета. */
  function flat() {
    return window.innerWidth <= 880 || (coarse && coarse.matches) || docEl.hasAttribute('data-calm');
  }
  function staticWide() {
    return window.innerWidth > 880 && !(coarse && coarse.matches) && reduced() && !docEl.hasAttribute('data-calm');
  }
  function syncBookState(open) {
    var conceal = !docEl.hasAttribute('data-pr-flat') && !open;
    var active = document.activeElement;
    if (conceal && bookTrigger && concealedPages.some(function (page) { return page.contains(active); })) {
      bookTrigger.focus({ preventScroll: true });
    }
    concealedPages.forEach(function (page) {
      page.inert = conceal;
      if (conceal) page.setAttribute('aria-hidden', 'true');
      else page.removeAttribute('aria-hidden');
    });
    if (bookTrigger) bookTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  /* На телефоне быстрый расчёт — это три коротких шага, а не длинный
     книжный разворот. Сами группы и расчёт остаются прежними: меняется
     только мобильная подача, поэтому один источник цен не раздваивается. */
  function initMobileEstimator() {
    var form = document.querySelector('.pr-form');
    if (!form || form.getAttribute('data-mobile-flow') === '1') return;
    var questions = Array.prototype.slice.call(form.querySelectorAll('.pr-question'));
    var foot = form.querySelector('.pr-pgfoot');
    if (questions.length !== 3 || !foot) return;

    var progress = document.createElement('div');
    progress.className = 'pr-qprog';
    progress.setAttribute('aria-live', 'polite');
    form.insertBefore(progress, questions[0]);

    var steps = [];
    questions.forEach(function (question) {
      var step = document.createElement('div');
      step.className = 'pr-qstep';
      form.insertBefore(step, question);
      step.appendChild(question);
      steps.push(step);
    });

    var nav = document.createElement('div');
    nav.className = 'pr-qnav';
    nav.innerHTML = '<button class="pr-qback" type="button" aria-label="Предыдущий вопрос">←</button>' +
      '<button class="btn btn-wax pr-qnext" type="button">Далее <span aria-hidden="true">→</span></button>';
    form.insertBefore(nav, foot);
    var back = nav.querySelector('.pr-qback');
    var nextBtn = nav.querySelector('.pr-qnext');
    var price = document.getElementById('qPrice');
    var current = 0;

    function priceText() {
      return price ? price.textContent.replace(/\s+/g, ' ').trim() : '';
    }
    function show(i, focus) {
      current = Math.max(0, Math.min(steps.length - 1, i));
      steps.forEach(function (step, n) { step.classList.toggle('active', n === current); });
      var question = steps[current].querySelector('.pr-question');
      var label = question ? question.getAttribute('data-label') : '';
      progress.innerHTML = '<span>Шаг ' + (current + 1) + '/' + steps.length + (label ? ' · ' + label : '') + '</span>' +
        '<em>' + priceText() + '</em>' +
        '<i><b style="width:' + ((current + 1) / steps.length * 100) + '%"></b></i>';
      back.hidden = current === 0;
      nextBtn.innerHTML = current === steps.length - 1
        ? 'Показать смету <span aria-hidden="true">↓</span>'
        : 'Далее <span aria-hidden="true">→</span>';
      if (focus) {
        var heading = steps[current].querySelector('.plate-q');
        if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
        form.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
      }
    }
    back.addEventListener('click', function () { show(current - 1, true); });
    nextBtn.addEventListener('click', function () {
      if (current < steps.length - 1) { show(current + 1, true); return; }
      var receipt = document.querySelector('.pr-first');
      if (receipt) receipt.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
    });
    if (price && window.MutationObserver) {
      new MutationObserver(function () {
        var livePrice = progress.querySelector('em');
        if (livePrice) livePrice.textContent = priceText();
      }).observe(price, { childList: true, characterData: true, subtree: true });
    }
    form.setAttribute('data-mobile-flow', '1');
    show(0, false);
  }

  /* режим потока: мобильные и «спокойные» получают страницы без кино */
  function applyMode() {
    if (flat()) docEl.setAttribute('data-pr-flat', '1');
    else docEl.removeAttribute('data-pr-flat');
    if (staticWide()) {
      docEl.setAttribute('data-pr-static', '1');
      if (!track.hasAttribute('data-static-open')) {
        track.style.setProperty('--p', '0');
        document.body.classList.remove('pr-open', 'pr-set');
        if (bookTrigger) bookTrigger.setAttribute('aria-expanded', 'false');
      }
    } else {
      docEl.removeAttribute('data-pr-static');
      track.removeAttribute('data-static-open');
      track.style.removeProperty('--p');
    }
    if (flat()) initMobileEstimator();
    onScroll();
  }

  /* ---------- прогресс кино ---------- */
  function onScroll() {
    if (docEl.hasAttribute('data-pr-flat') || docEl.hasAttribute('data-pr-static')) {
      syncBookState(document.body.classList.contains('pr-open'));
      return;
    }
    var total = track.offsetHeight - window.innerHeight;
    if (total <= 0) return;
    var p = Math.min(1, Math.max(0, -track.getBoundingClientRect().top / total));
    track.style.setProperty('--p', p.toFixed(4));
    document.body.classList.toggle('pr-open', p > .55);
    document.body.classList.toggle('pr-set', p > .82);
    syncBookState(p > .55);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', applyMode);
  window.addEventListener('salon:motionchange', applyMode);
  applyMode();

  /* ---------- ход к приёмной: конец кино, а не начало трека ----------
     Прод-CTA («Рассчитать» в шапке, мобильной панели, финале, прологе)
     ведут на #smeta — в кино-режиме перехватываем и довозим до разворота. */
  function focusFormSoon(smooth) {
    if (!formHeading) return;
    window.clearTimeout(focusTimer);
    focusTimer = window.setTimeout(function () {
      formHeading.focus({ preventScroll: true });
    }, smooth ? 620 : 60);
  }
  function goPriyomnaya(smooth, moveFocus) {
    if (docEl.hasAttribute('data-pr-flat')) {
      var s = document.getElementById('smeta');
      if (s) s.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
      if (moveFocus) focusFormSoon(smooth);
      return;
    }
    if (docEl.hasAttribute('data-pr-static')) {
      track.setAttribute('data-static-open', '1');
      track.style.setProperty('--p', '1');
      document.body.classList.add('pr-open', 'pr-set');
      syncBookState(true);
      scene.scrollIntoView({ behavior: 'auto', block: 'start' });
      if (moveFocus) focusFormSoon(false);
      return;
    }
    var total = track.offsetHeight - window.innerHeight;
    var top = track.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + total, behavior: smooth ? 'smooth' : 'auto' });
    if (moveFocus) focusFormSoon(smooth);
  }
  window.SalonPressGo = function () { goPriyomnaya(!reduced(), true); };
  if (bookTrigger) {
    bookTrigger.addEventListener('click', function () { goPriyomnaya(!reduced(), true); });
  }
  var infoButtons = Array.prototype.slice.call(document.querySelectorAll('.pr-info'));
  function closeTips(except) {
    infoButtons.forEach(function (button) {
      if (button !== except) button.setAttribute('aria-expanded', 'false');
    });
  }
  infoButtons.forEach(function (button) {
    button.addEventListener('click', function (e) {
      e.stopPropagation();
      var opening = button.getAttribute('aria-expanded') !== 'true';
      closeTips(button);
      button.setAttribute('aria-expanded', opening ? 'true' : 'false');
    });
  });
  document.addEventListener('click', function () { closeTips(); });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var info = e.target.closest && e.target.closest('.pr-info');
    closeTips();
    if (info) info.blur();
  });

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href$="#smeta"]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href !== '#smeta' && href.indexOf('index.html#smeta') === -1) return;
    e.preventDefault();
    goPriyomnaya(!reduced(), true);
  });

  /* прямой заход с якорем (реклама, пролог, чужие страницы) */
  if (location.hash === '#smeta') {
    setTimeout(function () { goPriyomnaya(false, false); }, 60);
  }

  /* ---------- наклон за курсором ---------- */
  if (!reduced() && window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
    scene.addEventListener('mousemove', function (e) {
      if (docEl.hasAttribute('data-pr-flat')) return;
      var r = scene.getBoundingClientRect();
      scene.style.setProperty('--mx', (((e.clientX - r.left) / r.width - .5) * 2).toFixed(3));
      scene.style.setProperty('--my', (((e.clientY - r.top) / r.height - .5) * 2).toFixed(3));
    });
  }

  /* ---------- пылинки в луче ---------- */
  var cv = document.getElementById('prDust');
  if (cv && !reduced() && !flat()) {
    var ctx = cv.getContext('2d'), W, H, ps = [], i;
    var dustFrame = 0;
    var size = function () { W = cv.width = cv.offsetWidth; H = cv.height = cv.offsetHeight; };
    size(); window.addEventListener('resize', size);
    for (i = 0; i < 45; i++) ps.push({
      x: Math.random(), y: Math.random(),
      r: .6 + Math.random() * 1.7,
      vx: .00004 + Math.random() * .00012,
      vy: -.00003 - Math.random() * .00009,
      ph: Math.random() * Math.PI * 2
    });
    function tick(t) {
      dustFrame = 0;
      if (!docEl.hasAttribute('data-pr-flat') && !document.hidden && !reduced() &&
          (!Salon.motion || Salon.motion.can(true))) {
        ctx.clearRect(0, 0, W, H);
        var cx = W * .4, cy = H * .3, rad = Math.min(W, H) * .55;
        for (i = 0; i < ps.length; i++) {
          var p = ps[i];
          p.x += p.vx + Math.sin(t * .0004 + p.ph) * .00006;
          p.y += p.vy;
          if (p.x > 1.02) p.x = -.02; if (p.x < -.02) p.x = 1.02;
          if (p.y < -.02) p.y = 1.02;
          var dx = p.x * W - cx, dy = p.y * H - cy;
          var a = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / rad);
          if (a <= 0) continue;
          ctx.globalAlpha = a * .32;
          ctx.fillStyle = '#FFF6DC';
          ctx.beginPath(); ctx.arc(p.x * W, p.y * H, p.r, 0, 6.283); ctx.fill();
        }
        dustFrame = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, W, H);
      }
    }
    function syncDust() {
      if (!document.hidden && !flat() && !reduced() && (!Salon.motion || Salon.motion.can(true))) {
        if (!dustFrame) dustFrame = requestAnimationFrame(tick);
      } else if (dustFrame) {
        cancelAnimationFrame(dustFrame); dustFrame = 0; ctx.clearRect(0, 0, W, H);
      }
    }
    document.addEventListener('visibilitychange', syncDust);
    window.addEventListener('salon:motionchange', syncDust);
    window.addEventListener('resize', syncDust);
    syncDust();
  }
})();
