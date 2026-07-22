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
  if (!track || !scene) return;

  var rm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* Поток — только мобильная вёрстка и no-JS. Системный reduce-motion
     НЕ понижает раскладку (решение владельца 2026-07-22: полная красота
     по умолчанию для всех — ЯБ/macOS часто шлют reduce без ведома людей),
     он лишь глушит фоновое: пылинки, дыхание света, тилт, каскад оттиска.
     Полная статика появится явным тумблером «Спокойный режим» (этап 2). */
  function flat() { return window.innerWidth <= 880; }

  /* режим потока: мобильные и «спокойные» получают страницы без кино */
  function applyMode() {
    if (flat()) docEl.setAttribute('data-pr-flat', '1');
    else docEl.removeAttribute('data-pr-flat');
    onScroll();
  }

  /* ---------- прогресс кино ---------- */
  function onScroll() {
    if (docEl.hasAttribute('data-pr-flat')) return;
    var total = track.offsetHeight - window.innerHeight;
    if (total <= 0) return;
    var p = Math.min(1, Math.max(0, -track.getBoundingClientRect().top / total));
    track.style.setProperty('--p', p.toFixed(4));
    document.body.classList.toggle('pr-open', p > .55);
    document.body.classList.toggle('pr-set', p > .82);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', applyMode);
  applyMode();

  /* ---------- ход к приёмной: конец кино, а не начало трека ----------
     Прод-CTA («Рассчитать» в шапке, мобильной панели, финале, прологе)
     ведут на #smeta — в кино-режиме перехватываем и довозим до разворота. */
  function goPriyomnaya(smooth) {
    if (docEl.hasAttribute('data-pr-flat')) {
      var s = document.getElementById('smeta');
      if (s) s.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
      return;
    }
    var total = track.offsetHeight - window.innerHeight;
    var top = track.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + total, behavior: smooth ? 'smooth' : 'auto' });
  }
  window.SalonPressGo = function () { goPriyomnaya(!rm); };

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href$="#smeta"]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href !== '#smeta' && href.indexOf('index.html#smeta') === -1) return;
    e.preventDefault();
    goPriyomnaya(!rm);
  });

  /* прямой заход с якорем (реклама, пролог, чужие страницы) */
  if (location.hash === '#smeta') {
    setTimeout(function () { goPriyomnaya(false); }, 60);
  }

  /* ---------- наклон за курсором ---------- */
  if (!rm && window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
    scene.addEventListener('mousemove', function (e) {
      if (docEl.hasAttribute('data-pr-flat')) return;
      var r = scene.getBoundingClientRect();
      scene.style.setProperty('--mx', (((e.clientX - r.left) / r.width - .5) * 2).toFixed(3));
      scene.style.setProperty('--my', (((e.clientY - r.top) / r.height - .5) * 2).toFixed(3));
    });
  }

  /* ---------- пылинки в луче ---------- */
  var cv = document.getElementById('prDust');
  if (cv && !rm && !flat()) {
    var ctx = cv.getContext('2d'), W, H, ps = [], i;
    var size = function () { W = cv.width = cv.offsetWidth; H = cv.height = cv.offsetHeight; };
    size(); window.addEventListener('resize', size);
    for (i = 0; i < 45; i++) ps.push({
      x: Math.random(), y: Math.random(),
      r: .6 + Math.random() * 1.7,
      vx: .00004 + Math.random() * .00012,
      vy: -.00003 - Math.random() * .00009,
      ph: Math.random() * Math.PI * 2
    });
    (function tick(t) {
      if (!docEl.hasAttribute('data-pr-flat')) {
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
      }
      requestAnimationFrame(tick);
    })(0);
  }
})();
