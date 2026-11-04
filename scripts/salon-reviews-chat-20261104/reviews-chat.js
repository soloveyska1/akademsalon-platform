/* Отзывы текстом: фильтры, «Ещё сообщения», длинные переписки, плотная сетка и просмотр скриншота оригинала. */
(function () {
  'use strict';
  var wall = document.querySelector('.rc-wall');
  if (!wall) return;
  var cards = Array.prototype.slice.call(wall.querySelectorAll('.rc-card'));
  var more = document.querySelector('.rv-more');
  var count = document.querySelector('#rv-count');
  var filters = Array.prototype.slice.call(document.querySelectorAll('[data-review-filter]'));
  var dialog = document.querySelector('.rv-viewer');
  var canvas = dialog && dialog.querySelector('.rv-canvas');
  var image = canvas && canvas.querySelector('img');
  var zoom = dialog && dialog.querySelector('[data-rv-zoom]');
  var STEP = 9, MAX = 400, GAP = 18;
  var current = 'all', limit = STEP, index = 0, opener = null, queued = false;

  function filtered() {
    return cards.filter(function (c) { return current === 'all' || c.dataset.topic === current; });
  }

  function clamp(card) {
    if (card.hidden || card.dataset.rcClamp) return;
    var chat = card.querySelector('.rc-chat');
    card.dataset.rcClamp = '1';
    if (!chat || chat.scrollHeight <= MAX + 80) return;
    card.classList.add('is-clamped');
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'rc-toggle';
    b.setAttribute('aria-expanded', 'false');
    b.textContent = 'Вся переписка ↓';
    b.addEventListener('click', function () {
      var open = card.classList.toggle('is-open');
      b.setAttribute('aria-expanded', String(open));
      b.textContent = open ? 'Свернуть ↑' : 'Вся переписка ↓';
      if (!open && card.getBoundingClientRect().top < 0) card.scrollIntoView({ block: 'start' });
    });
    card.querySelector('.rc-foot').appendChild(b);
  }

  function layout() {
    queued = false;
    var cols = getComputedStyle(wall).gridTemplateColumns.split(' ').filter(Boolean).length;
    var on = cols > 1;
    wall.classList.toggle('is-masonry', on);
    cards.forEach(function (c) {
      if (!on || c.hidden) { c.style.gridRowEnd = ''; return; }
      c.style.gridRowEnd = 'span ' + Math.ceil(c.getBoundingClientRect().height + GAP);
    });
  }

  function relayout() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(layout);
  }

  function render() {
    var set = filtered();
    cards.forEach(function (c) {
      var i = set.indexOf(c);
      c.hidden = i < 0 || i >= limit;
    });
    cards.forEach(clamp);
    if (count) count.textContent = Math.min(set.length, limit) + ' из ' + set.length + ' сообщений';
    if (more) more.hidden = set.length <= limit;
    filters.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.reviewFilter === current)); });
    layout();
  }

  filters.forEach(function (b) {
    b.addEventListener('click', function () { current = b.dataset.reviewFilter; limit = STEP; render(); });
  });
  if (more) more.addEventListener('click', function () {
    var first = filtered()[limit];
    limit += STEP;
    render();
    if (first) { var p = first.querySelector('.rc-proof'); if (p) p.focus({ preventScroll: true }); }
  });

  if ('ResizeObserver' in window) {
    var ro = new ResizeObserver(relayout);
    cards.forEach(function (c) { ro.observe(c); });
  } else {
    window.addEventListener('resize', relayout);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);

  /* просмотр скриншота оригинала */
  function show() {
    var set = filtered(), card = set[index];
    if (!card || !image) return;
    var link = card.querySelector('.rc-proof');
    canvas.classList.remove('is-zoomed');
    canvas.scrollTo(0, 0);
    zoom.textContent = 'Увеличить ＋';
    zoom.setAttribute('aria-pressed', 'false');
    image.src = link.href;
    image.alt = 'Скриншот: ' + link.dataset.caption;
    document.querySelector('#rv-title').textContent = link.dataset.caption;
    document.querySelector('#rv-original').href = link.href;
    document.querySelector('#rv-position').textContent = (index + 1) + ' / ' + set.length;
    dialog.querySelector('[data-rv-prev]').disabled = index === 0;
    dialog.querySelector('[data-rv-next]').disabled = index === set.length - 1;
  }

  function move(n) {
    var next = index + n;
    if (next < 0 || next >= filtered().length) return;
    index = next;
    show();
  }

  if (dialog && dialog.showModal) {
    cards.forEach(function (c) {
      var link = c.querySelector('.rc-proof');
      if (!link) return;
      link.addEventListener('click', function (e) {
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        opener = link;
        index = filtered().indexOf(c);
        show();
        dialog.showModal();
        dialog.querySelector('[data-rv-close]').focus();
      });
    });
    dialog.querySelector('[data-rv-close]').addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('close', function () { if (opener) opener.focus({ preventScroll: true }); });
    dialog.addEventListener('click', function (e) {
      if (e.target !== dialog) return;
      var r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
    });
    dialog.querySelector('[data-rv-prev]').addEventListener('click', function () { move(-1); });
    dialog.querySelector('[data-rv-next]').addEventListener('click', function () { move(1); });
    dialog.addEventListener('keydown', function (e) {
      if (canvas.classList.contains('is-zoomed')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); move(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); }
    });
    zoom.addEventListener('click', function () {
      var on = canvas.classList.toggle('is-zoomed');
      zoom.textContent = on ? 'Вписать ↙' : 'Увеличить ＋';
      zoom.setAttribute('aria-pressed', String(on));
      canvas.scrollTo(0, 0);
    });
  }

  /* переход с главной: #review-05 — показать карточку и подсветить её */
  function reveal() {
    var m = /^#review-\d+$/.test(location.hash) && document.getElementById(location.hash.slice(1));
    if (!m || cards.indexOf(m) < 0) return;
    current = 'all';
    limit = Math.max(STEP, Math.ceil((cards.indexOf(m) + 1) / STEP) * STEP);
    render();
    requestAnimationFrame(function () {
      m.scrollIntoView({ block: 'center' });
      m.classList.add('is-target');
      setTimeout(function () { m.classList.remove('is-target'); }, 2600);
    });
  }

  /* цель «отзыв открыт с главной» (раньше её слал просмотрщик главной). Ссылки reviews.html#review-NN
     есть только у карточек главной, referrer сайт не передаёт (meta no-referrer) — поэтому цель
     ставится, когда страницу открыли по такой ссылке; перезагрузка и «назад» не считаются */
  function freshVisit() {
    try { return performance.getEntriesByType('navigation')[0].type === 'navigate'; } catch (e) { return false; }
  }

  render();
  reveal();
  if (/^#review-\d+$/.test(location.hash) && freshVisit()) {
    try { if (window.Salon && Salon.metrika && typeof Salon.metrika.goal === 'function') Salon.metrika.goal('review_open_home'); } catch (e) {}
  }
  window.addEventListener('hashchange', reveal);
})();
