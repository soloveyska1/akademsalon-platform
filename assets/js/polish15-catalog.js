(function () {
  'use strict';

  function normal(value) {
    return String(value || '')
      .toLocaleLowerCase('ru')
      .replace(/ё/g, 'е')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function matches(source, query) {
    var haystack = normal(source);
    var words = normal(query).match(/[a-zа-я0-9-]+/g) || [];
    return words.every(function (word) {
      var stem = word.length >= 6 ? word.slice(0, -2) : word;
      return haystack.indexOf(stem) !== -1;
    });
  }

  function currentLimit() {
    return window.matchMedia('(max-width: 620px)').matches ? 5 : 8;
  }

  function setupServiceCatalog() {
    var root = document.querySelector('[data-p15-services]');
    if (!root) return;
    var cards = Array.prototype.slice.call(root.querySelectorAll('[data-service-card]'));
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[data-service-filter]'));
    var search = root.querySelector('[data-service-search]');
    var more = root.querySelector('[data-catalog-more]');
    var empty = root.querySelector('[data-service-empty]');
    var filter = 'all';
    var expanded = false;

    function phaseMatches(card) {
      return filter === 'all' || (card.getAttribute('data-phase') || '').split(' ').indexOf(filter) !== -1;
    }

    function paint() {
      var query = search ? search.value : '';
      var pool = cards.filter(function (card) {
        return phaseMatches(card) && matches(card.getAttribute('data-search') || card.textContent, query);
      });
      var limit = filter === 'all' && !query && !expanded ? currentLimit() : pool.length;
      cards.forEach(function (card) {
        card.hidden = pool.indexOf(card) === -1 || pool.indexOf(card) >= limit;
      });
      if (more) {
        var rest = Math.max(0, pool.length - limit);
        more.hidden = expanded || filter !== 'all' || !!query || rest === 0;
        more.textContent = rest ? 'Показать остальные — ' + rest : 'Показать остальные';
      }
      if (empty) empty.hidden = pool.length !== 0;
    }

    tabs.forEach(function (tab) {
      tab.setAttribute('aria-pressed', String(tab.classList.contains('is-active')));
      tab.addEventListener('click', function () {
        filter = tab.getAttribute('data-service-filter') || 'all';
        expanded = false;
        tabs.forEach(function (item) {
          var active = item === tab;
          item.classList.toggle('is-active', active);
          item.setAttribute('aria-pressed', String(active));
        });
        paint();
      });
    });
    if (search) search.addEventListener('input', paint);
    if (more) more.addEventListener('click', function () {
      expanded = true;
      paint();
      var firstRevealed = cards[currentLimit()];
      if (firstRevealed) firstRevealed.querySelector('a').focus({ preventScroll: true });
    });
    window.addEventListener('resize', paint, { passive: true });
    paint();
  }

  function storeDraft(type, tier, discipline) {
    if (!type || !(window.Salon && Salon.store)) return;
    var draft = Salon.store.get('salon_draft', {}) || {};
    draft.state = Object.assign({}, draft.state || {}, {
      type: type,
      disc: discipline || draft.state && draft.state.disc || 'hum',
      term: draft.state && draft.state.term || 'free',
      tier: tier || draft.state && draft.state.tier || 'turn'
    });
    draft.idx = 0;
    draft.savedAt = Date.now();
    Salon.store.set('salon_draft', draft);
  }

  function setupServicePrefills() {
    document.querySelectorAll('.p15-service a[data-type]').forEach(function (link) {
      link.addEventListener('click', function () {
        storeDraft(
          link.getAttribute('data-type'),
          link.getAttribute('data-tier') || 'turn',
          link.getAttribute('data-disc') || ''
        );
      });
    });
  }

  var pricedRoutes = {
    'Реферат или эссе с нуля': { href: 'configurator.html', type: 'self', tier: 'vip' },
    'Курсовая теория с нуля': { href: 'configurator.html', type: 'course', tier: 'vip' },
    'Курсовая с исследованием с нуля': { href: 'configurator.html', type: 'course_emp', tier: 'vip' },
    'ВКР или диплом с нуля': { href: 'configurator.html', type: 'diplom', tier: 'vip' },
    'Магистерская с нуля': { href: 'configurator.html', type: 'master', tier: 'vip' },
    'Разбор темы и плана': { href: 'configurator.html?service=pl' },
    'Разбор замечаний руководителя': { href: 'configurator.html?service=rv' },
    'Курсовая работа': { href: 'configurator.html', type: 'course', tier: 'turn' },
    'ВКР или дипломная': { href: 'configurator.html', type: 'diplom', tier: 'turn' },
    'Нормоконтроль': { href: 'configurator.html?service=nm' },
    'Проверка речи и презентации': { href: 'configurator.html?service=df' },
    'Научная статья РИНЦ': { href: 'configurator.html', type: 'rinc', tier: 'turn' },
    'Методическая сессия': { href: 'configurator.html?service=tu' }
  };

  function setupPriceTable() {
    var root = document.querySelector('[data-p15-tariffs]');
    if (!root) return;
    var search = root.querySelector('[data-price-search]');
    var rows = Array.prototype.slice.call(root.querySelectorAll('[data-price-row]'));
    var empty = root.querySelector('[data-price-empty]');

    function paint() {
      var query = search ? search.value : '';
      var visible = 0;
      rows.forEach(function (row) {
        row.hidden = !matches(row.getAttribute('data-search') || row.textContent, query);
        if (!row.hidden) visible += 1;
      });
      if (empty) empty.hidden = visible !== 0;
    }

    if (search) search.addEventListener('input', paint);
    rows.forEach(function (row) {
      var button = row.querySelector('[data-start-priced]');
      if (!button) return;
      button.addEventListener('click', function () {
        var key = button.getAttribute('data-start-priced');
        var route = pricedRoutes[key] || { href: 'configurator.html' };
        if (route.type) storeDraft(route.type, route.tier);
        window.location.href = route.href;
      });
    });
    paint();
  }

  setupServiceCatalog();
  setupServicePrefills();
  setupPriceTable();
})();
