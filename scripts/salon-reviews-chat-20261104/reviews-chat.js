/* Отзывы текстом: фильтры, «Ещё сообщения», длинные переписки, плотная сетка и просмотр скриншота оригинала. */
(function () {
  'use strict';
  var wall = document.querySelector('.rc-wall');
  if (!wall) return;
  var cards = Array.prototype.slice.call(wall.querySelectorAll('.rc-card'));
  var more = document.querySelector('.rv-more');
  var count = document.querySelector('#rv-count');
  var filters = Array.prototype.slice.call(document.querySelectorAll('[data-review-filter]'));
  var workType = document.querySelector('#rc-work-type');
  var reset = document.querySelector('.rc-reset');
  var dialog = document.querySelector('.rv-viewer');
  var canvas = dialog && dialog.querySelector('.rv-canvas');
  var image = canvas && canvas.querySelector('img');
  var zoom = dialog && dialog.querySelector('[data-rv-zoom]');
  var STEP = 9, MAX = 400, GAP = 18;
  var current = 'all', limit = STEP, index = 0, opener = null, queued = false;
  var pendingTarget = null;

  function matchesTopic(card, topic) {
    return topic === 'all' || card.dataset.topic === topic;
  }

  function matchesWork(card, kind) {
    return kind === 'all' || (card.dataset.workTypes || '').split(' ').indexOf(kind) !== -1;
  }

  function selectedWork() { return workType ? workType.value : 'all'; }

  function filtered() {
    return cards.filter(function (card) {
      return matchesTopic(card, current) && matchesWork(card, selectedWork());
    });
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
    chat.insertAdjacentElement('afterend', b);
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
    if (pendingTarget) pendingTarget.scrollIntoView({ block: 'start', behavior: 'instant' });
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
    count.textContent = set.length ? 'Показано ' + Math.min(set.length, limit) + ' из ' + set.length
      : 'Для этой темы и вида работы пока нет отзывов.';
    if (more) more.hidden = set.length <= limit;
    if (reset) reset.hidden = current === 'all' && selectedWork() === 'all';
    filters.forEach(function (button) {
      var topic = button.dataset.reviewFilter;
      var badge = button.querySelector('.rc-total');
      if (badge) badge.textContent = cards.filter(function (card) {
        return matchesTopic(card, topic) && matchesWork(card, selectedWork());
      }).length;
      button.setAttribute('aria-pressed', String(topic === current));
    });
    if (workType) Array.prototype.forEach.call(workType.options, function (option) {
      var total = cards.filter(function (card) { return matchesTopic(card, current) && matchesWork(card, option.value); }).length;
      option.textContent = option.dataset.label + ' · ' + total;
    });
    layout();
  }

  function applyFilters() {
    pendingTarget = null;
    limit = STEP;
    render();
    var target = document.getElementById(location.hash.slice(1));
    if (target && cards.indexOf(target) !== -1 && target.hidden) {
      history.replaceState(history.state, '', location.pathname + location.search);
    }
  }

  filters.forEach(function (b) {
    b.addEventListener('click', function () { current = b.dataset.reviewFilter; applyFilters(); });
  });
  if (workType) workType.addEventListener('change', applyFilters);
  if (reset) reset.addEventListener('click', function () {
    current = 'all';
    workType.value = 'all';
    applyFilters();
    filters[0].focus({ preventScroll: true });
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

  var notice = document.createElement('span');
  notice.className = 'rc-sr';
  notice.setAttribute('role', 'status');
  wall.insertAdjacentElement('afterend', notice);
  var canonical = document.querySelector('link[rel="canonical"]');
  cards.forEach(function (card) {
    var link = card.querySelector('.rc-permalink');
    if (!link) return;
    var address = new URL(link.getAttribute('href'), canonical ? canonical.href : document.baseURI).href;
    var button = document.createElement('button');
    var manual, timer, pending = false;
    button.type = 'button';
    button.className = 'rc-copy';
    button.setAttribute('aria-describedby', link.getAttribute('aria-describedby'));
    button.textContent = 'Скопировать ссылку';
    link.replaceWith(button);

    function selectAddress() {
      if (!manual) {
        manual = document.createElement('label');
        manual.className = 'rc-manual';
        manual.textContent = 'Скопируйте выделенную ссылку';
        var field = document.createElement('input');
        field.type = 'url';
        field.readOnly = true;
        field.value = address;
        manual.appendChild(field);
        button.insertAdjacentElement('afterend', manual);
      }
      var input = manual.querySelector('input');
      input.focus({ preventScroll: true });
      input.select();
      input.setSelectionRange(0, input.value.length);
      try { return document.execCommand('copy'); } catch (e) { return false; }
    }

    button.addEventListener('click', async function () {
      if (pending) return;
      pending = true;
      clearTimeout(timer);
      button.textContent = 'Скопировать ссылку';
      notice.textContent = '';
      var copied = false;
      try {
        await navigator.clipboard.writeText(address);
        copied = true;
      } catch (e) {
        if (!card.hidden) copied = selectAddress();
      } finally {
        pending = false;
      }
      if (!copied) return;
      if (manual) {
        if (manual.contains(document.activeElement)) button.focus({ preventScroll: true });
        manual.remove();
        manual = null;
      }
      button.textContent = 'Скопировано';
      notice.textContent = 'Ссылка на отзыв скопирована';
      timer = setTimeout(function () { button.textContent = 'Скопировать ссылку'; }, 2400);
    });
  });

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

  /* Прямая ссылка открывает карточку в том числе за первой страницей. */
  function reveal() {
    var m = /^#review-\d+$/.test(location.hash) && document.getElementById(location.hash.slice(1));
    pendingTarget = null;
    if (!m || cards.indexOf(m) < 0) return;
    current = 'all';
    if (workType) workType.value = 'all';
    limit = Math.max(STEP, Math.ceil((cards.indexOf(m) + 1) / STEP) * STEP);
    pendingTarget = m;
    render();
    m.tabIndex = -1;
    m.focus({ preventScroll: true });
    m.classList.add('is-target');
    setTimeout(function () {
      m.classList.remove('is-target');
      if (pendingTarget === m) pendingTarget = null;
    }, 2600);
  }
  ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(function (event) {
    window.addEventListener(event, function () { pendingTarget = null; }, { passive: true, capture: true });
  });

  /* Ссылки с главной помечены явно. Обычной ссылкой на отзыв можно поделиться. */
  function freshVisit() {
    try { return performance.getEntriesByType('navigation')[0].type === 'navigate'; } catch (e) { return false; }
  }

  document.querySelector('.rv-toolbar').hidden = false;
  render();
  reveal();
  if (new URLSearchParams(location.search).get('from') === 'home' &&
      cards.indexOf(document.getElementById(location.hash.slice(1))) !== -1 && freshVisit()) {
    try { if (window.Salon && Salon.metrika && typeof Salon.metrika.goal === 'function') Salon.metrika.goal('review_open_home'); } catch (e) {}
  }
  window.addEventListener('hashchange', reveal);
  window.addEventListener('pageshow', function (e) {
    var target = document.getElementById(location.hash.slice(1));
    if (e.persisted && target && target.hidden) reveal();
  });
})();
