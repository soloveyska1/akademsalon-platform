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
    return window.matchMedia('(max-width: 620px)').matches ? 4 : 6;
  }

  function setupServicesChoice() {
    var root = document.querySelector('[data-services-choice]');
    if (!root) return;
    var routes = Object.freeze({
      topic: 'diagnostic',
      draft: 'editing',
      comments: 'diagnostic',
      defense: 'defense'
    });
    var choices = Array.prototype.slice.call(root.querySelectorAll('[data-service-situation]'));
    var continuation = document.querySelector('[data-service-continue]');
    var status = document.querySelector('[data-service-choice-status]');
    var resume = document.querySelector('[data-resume-card]');
    var reveal = document.querySelector('[data-new-choice-toggle]');

    function mobileDock() {
      return document.querySelector('.mnav .mn-calc');
    }

    function setDock(href, label) {
      var dock = mobileDock();
      if (!dock) return;
      dock.href = href;
      dock.removeAttribute('data-resume-draft');
      dock.setAttribute('aria-label', label);
      var text = dock.querySelector('.mn-l');
      if (text) text.textContent = label;
    }

    function revealFreshChoice() {
      if (resume) resume.hidden = true;
      root.hidden = false;
      if (reveal) reveal.setAttribute('aria-expanded', 'true');
      setDock('#servicesChoice', 'Выбрать ситуацию');
      var first = choices[0];
      if (first) first.focus({ preventScroll: true });
    }

    choices.forEach(function (choice) {
      choice.setAttribute('aria-pressed', 'false');
      choice.addEventListener('click', function () {
        var situation = choice.getAttribute('data-service-situation') || '';
        var result = choice.getAttribute('data-result') || '';
        var route = choice.getAttribute('data-route') || '';
        if (!Object.prototype.hasOwnProperty.call(routes, situation) || routes[situation] !== result || route !== 'page') return;
        choices.forEach(function (item) {
          var selected = item === choice;
          item.classList.toggle('is-selected', selected);
          item.setAttribute('aria-pressed', String(selected));
        });
        var params = new URLSearchParams();
        params.set('situation', situation);
        params.set('result', result);
        params.set('route', 'page');
        var href = 'configurator.html?' + params.toString();
        if (continuation) {
          continuation.href = href;
          continuation.hidden = false;
        }
        if (status) {
          var title = choice.querySelector('strong');
          status.textContent = 'Выбрано: ' + (title ? title.textContent : 'ситуация') + '. Теперь можно посмотреть первый шаг и цену.';
        }
        setDock(href, 'Продолжить');
      });
    });

    if (reveal) reveal.addEventListener('click', revealFreshChoice);
    root.hidden = !!(resume && !resume.hidden);
  }

  function setupServiceCatalog() {
    var root = document.querySelector('[data-p15-services]');
    if (!root) return;
    var cards = Array.prototype.slice.call(root.querySelectorAll('[data-service-card]'));
    var disciplineCards = Array.prototype.slice.call(root.querySelectorAll('[data-discipline-card]'));
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
      var disciplineMatches = false;
      disciplineCards.forEach(function (card) {
        var visible = !query || matches(card.getAttribute('data-search') || card.textContent, query);
        card.hidden = !visible;
        if (query && visible) disciplineMatches = true;
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
      if (empty) empty.hidden = pool.length !== 0 || disciplineMatches;
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

  var pricedRoutes = {
    'Реферат или эссе с нуля': { href: 'configurator.html?work=self&situation=topic&result=support&route=price', type: 'self', tier: 'vip' },
    'Курсовая теория с нуля': { href: 'configurator.html?work=course&situation=topic&result=support&route=price', type: 'course', tier: 'vip' },
    'Курсовая с исследованием с нуля': { href: 'configurator.html?work=course_emp&situation=topic&result=support&route=price', type: 'course_emp', tier: 'vip' },
    'ВКР или диплом с нуля': { href: 'configurator.html?work=diplom&situation=topic&result=support&route=price', type: 'diplom', tier: 'vip' },
    'Магистерская с нуля': { href: 'configurator.html?work=master&situation=topic&result=support&route=price', type: 'master', tier: 'vip' },
    'Комиссия №0 · курсовая': { href: 'configurator.html?service=k0', commissionWork: 'course' },
    'Комиссия №0 · ВКР': { href: 'configurator.html?service=k0', commissionWork: 'diplom' },
    'Комиссия №0 · магистерская': { href: 'configurator.html?service=k0', commissionWork: 'master' },
    'Разбор темы и плана': { href: 'configurator.html?service=pl' },
    'Разбор замечаний руководителя': { href: 'configurator.html?service=rv' },
    'Редактура вашей курсовой': { href: 'configurator.html?work=course&situation=draft&result=editing&route=price', type: 'course', tier: 'turn' },
    'Аудит и редактура вашей ВКР': { href: 'configurator.html?work=diplom&situation=draft&result=editing&route=price', type: 'diplom', tier: 'turn' },
    'Нормоконтроль': { href: 'configurator.html?service=nm' },
    'Проверка речи и презентации': { href: 'configurator.html?service=df' },
    'Научная статья РИНЦ': { href: 'configurator.html?work=rinc&situation=draft&result=editing&route=price', type: 'rinc', tier: 'turn' },
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
        if (route.commissionWork) {
          try {
            sessionStorage.setItem('salon_commission_zero_handoff_v1', JSON.stringify({
              version:1, work:route.commissionWork, source:'draft', topic:'', savedAt:Date.now()
            }));
          } catch (e) {}
        }
        window.location.href = route.href;
      });
    });
    paint();
  }

  setupServicesChoice();
  setupServiceCatalog();
  setupPriceTable();
})();
