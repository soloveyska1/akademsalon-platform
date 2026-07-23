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
  var bookClose = document.getElementById('prBookClose');
  var editEstimate = document.getElementById('prEditEstimate');
  var bookEl = document.getElementById('smeta');
  var formHeading = document.querySelector('.pr-formh');
  var concealedPages = [
    document.querySelector('.pr-first'),
    document.querySelector('.pr-cvin')
  ].filter(Boolean);
  var focusTimer = 0;
  var bookFrame = 0;
  var bookProgress = 0;
  var bookState = 'closed';
  if (!track || !scene) return;

  var rm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)');
  function reduced() {
    if (window.Salon && Salon.motion) return Salon.motion.mode() === 'off';
    return rm || docEl.hasAttribute('data-calm');
  }
  /* Полный 3D-разворот безопасен только на достаточно широком и высоком
     экране. Ниже остаётся та же книга, но открывается в устойчивый лист. */
  function flat() {
    return window.innerWidth <= 1120 || window.innerHeight <= 680 ||
      (coarse && coarse.matches) || docEl.hasAttribute('data-calm');
  }
  function syncBookState(open) {
    var isFlat = docEl.hasAttribute('data-pr-flat');
    var result = !!(bookEl && bookEl.classList.contains('mobile-result'));
    var active = document.activeElement;
    var activeWillHide = concealedPages.some(function (page) {
      if (!page.contains(active)) return false;
      if (!open) return true;
      if (!isFlat) return false;
      return page.classList.contains('pr-first') ? !result : result;
    });
    if (activeWillHide && bookTrigger) {
      bookTrigger.focus({ preventScroll: true });
    }
    concealedPages.forEach(function (page) {
      var show = open && (!isFlat ||
        (page.classList.contains('pr-first') ? result : !result));
      page.inert = !show;
      if (!show) page.setAttribute('aria-hidden', 'true');
      else page.removeAttribute('aria-hidden');
    });
    if (bookTrigger) bookTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (bookClose) bookClose.hidden = !open;
  }

  /* Один и тот же пошаговый формуляр работает внутри 3D-разворота и на
     телефоне. Цены и выбор по-прежнему считает только pereplet.js. */
  var showEstimatorStep = null;
  function initEstimatorFlow() {
    var form = document.querySelector('.pr-form');
    if (!form || form.getAttribute('data-estimator-flow') === '1') return;
    var questions = Array.prototype.slice.call(form.querySelectorAll('.pr-question'));
    var foot = form.querySelector('.pr-pgfoot');
    var help = form.querySelector('.pr-step-help');
    if (questions.length !== 3 || !foot) return;

    var progress = document.createElement('div');
    progress.className = 'pr-qprog';
    progress.innerHTML = '<div class="pr-step-tabs" role="group" aria-label="Шаги расчёта">' +
      questions.map(function (q, i) {
        return '<button class="pr-step-tab" type="button" data-step="' + i +
          '" aria-label="Шаг ' + (i + 1) + ': ' + q.getAttribute('data-label') + '">' +
          String(i + 1).padStart(2, '0') + '</button>';
      }).join('') + '</div><div class="pr-qprice" aria-live="polite">' +
      '<span>Ориентир</span><em></em></div>';
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
    var stepTabs = Array.prototype.slice.call(progress.querySelectorAll('.pr-step-tab'));
    var current = 0;

    function priceText() {
      return price ? price.textContent.replace(/\s+/g, ' ').trim() : '';
    }
    function show(i, focus) {
      current = Math.max(0, Math.min(steps.length - 1, i));
      steps.forEach(function (step, n) { step.classList.toggle('active', n === current); });
      var question = steps[current].querySelector('.pr-question');
      stepTabs.forEach(function (tab, n) {
        if (n === current) tab.setAttribute('aria-current', 'step');
        else tab.removeAttribute('aria-current');
      });
      var livePrice = progress.querySelector('em');
      if (livePrice) livePrice.textContent = priceText();
      if (help && question) {
        help.textContent = question.getAttribute('data-tip') ||
          'Выберите ближайший вариант — мастер всё уточнит до фиксации сметы.';
      }
      back.hidden = current === 0;
      nextBtn.innerHTML = current === steps.length - 1
        ? 'Смета готова <span aria-hidden="true">→</span>'
        : 'Далее <span aria-hidden="true">→</span>';
      if (focus) {
        var heading = steps[current].querySelector('.plate-q');
        if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
        if (docEl.hasAttribute('data-pr-flat')) {
          form.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
        }
      }
    }
    showEstimatorStep = show;
    stepTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        if (bookEl) bookEl.classList.remove('mobile-result');
        show(parseInt(tab.getAttribute('data-step'), 10) || 0, true);
        syncBookState(true);
      });
    });
    back.addEventListener('click', function () { show(current - 1, true); });
    nextBtn.addEventListener('click', function () {
      if (current < steps.length - 1) { show(current + 1, true); return; }
      var receipt = document.querySelector('.pr-first');
      if (docEl.hasAttribute('data-pr-flat') && bookEl) {
        bookEl.classList.add('mobile-result');
        syncBookState(true);
      }
      if (receipt) {
        receipt.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
        var total = receipt.querySelector('.pr-estimate-total');
        if (total) total.setAttribute('tabindex', '-1');
        if (total) total.focus({ preventScroll: true });
      }
    });
    if (price && window.MutationObserver) {
      new MutationObserver(function () {
        var livePrice = progress.querySelector('em');
        if (livePrice) livePrice.textContent = priceText();
      }).observe(price, { childList: true, characterData: true, subtree: true });
    }
    form.setAttribute('data-estimator-flow', '1');
    show(0, false);
  }

  function setProgress(value) {
    bookProgress = Math.max(0, Math.min(1, value));
    track.style.setProperty('--p', bookProgress.toFixed(4));
  }
  function animateBook(to, done) {
    if (bookFrame) cancelAnimationFrame(bookFrame);
    var from = bookProgress;
    var duration = reduced() ? 0 : 760;
    if (!duration || docEl.hasAttribute('data-pr-flat')) {
      setProgress(to);
      if (done) done();
      return;
    }
    var started = 0;
    function frame(t) {
      if (!started) started = t;
      var x = Math.min(1, (t - started) / duration);
      var eased = 1 - Math.pow(1 - x, 3);
      setProgress(from + (to - from) * eased);
      if (x < 1) bookFrame = requestAnimationFrame(frame);
      else { bookFrame = 0; if (done) done(); }
    }
    bookFrame = requestAnimationFrame(frame);
  }

  function focusFormSoon(smooth) {
    if (!formHeading) return;
    window.clearTimeout(focusTimer);
    focusTimer = window.setTimeout(function () {
      formHeading.focus({ preventScroll: true });
    }, smooth ? 120 : 0);
  }
  function openBook(smooth, moveFocus) {
    if (bookState === 'open' || bookState === 'opening') {
      if (moveFocus) focusFormSoon(false);
      return;
    }
    bookState = 'opening';
    document.body.classList.add('pr-opening');
    if (bookTrigger) bookTrigger.disabled = true;
    scene.scrollIntoView({ behavior: smooth && !flat() ? 'smooth' : 'auto', block: 'start' });
    animateBook(1, function () {
      bookState = 'open';
      document.body.classList.remove('pr-opening', 'pr-closing');
      document.body.classList.add('pr-open', 'pr-set');
      if (bookTrigger) bookTrigger.disabled = false;
      syncBookState(true);
      if (docEl.hasAttribute('data-pr-flat')) {
        var form = document.querySelector('.pr-form');
        if (form) form.scrollIntoView({ behavior: smooth && !reduced() ? 'smooth' : 'auto', block: 'start' });
      }
      if (moveFocus) focusFormSoon(smooth);
    });
  }
  function closeBook(restoreFocus) {
    if (bookState === 'closed' || bookState === 'closing') return;
    bookState = 'closing';
    if (bookEl) bookEl.classList.remove('mobile-result');
    document.body.classList.remove('pr-open', 'pr-set', 'pr-opening');
    document.body.classList.add('pr-closing');
    syncBookState(false);
    animateBook(0, function () {
      bookState = 'closed';
      document.body.classList.remove('pr-closing');
      if (restoreFocus && bookTrigger) bookTrigger.focus({ preventScroll: true });
    });
  }

  /* режим листа вычисляется до взаимодействия; состояние книги дискретное,
     скрытые страницы никогда не становятся активны посреди анимации. */
  function applyMode() {
    if (flat()) docEl.setAttribute('data-pr-flat', '1');
    else docEl.removeAttribute('data-pr-flat');
    docEl.removeAttribute('data-pr-static');
    initEstimatorFlow();
    setProgress(bookState === 'open' ? 1 : 0);
    syncBookState(bookState === 'open');
  }
  window.addEventListener('resize', applyMode);
  window.addEventListener('salon:motionchange', applyMode);
  applyMode();

  /* Прод-CTA, обложка и прямой #smeta открывают одно и то же состояние. */
  function goPriyomnaya(smooth, moveFocus) {
    openBook(smooth, moveFocus);
  }
  window.SalonPressGo = function () { goPriyomnaya(!reduced(), true); };
  window.SalonPressClose = function () { closeBook(false); };
  if (bookTrigger) {
    bookTrigger.addEventListener('click', function () { goPriyomnaya(!reduced(), true); });
  }
  if (bookClose) {
    bookClose.addEventListener('click', function () { closeBook(true); });
  }
  if (editEstimate) {
    editEstimate.addEventListener('click', function () {
      if (bookEl) bookEl.classList.remove('mobile-result');
      if (showEstimatorStep) showEstimatorStep(2, false);
      syncBookState(true);
      var form = document.querySelector('.pr-form');
      if (form) form.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && bookState === 'open') closeBook(true);
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
    /* Убираем нативное fragment-позиционирование: у 3D-элемента оно
       вычисляется до раскрытия и способно утащить верх страницы под шапку. */
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    window.scrollTo(0, 0);
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
