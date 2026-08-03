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
    var next = document.querySelector('.catalog-route-next');

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
      if (next) next.hidden = false;
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
    var hasSavedResume = !!(resume && !resume.hidden);
    root.hidden = hasSavedResume;
    if (next) next.hidden = hasSavedResume;
    if (!hasSavedResume) setDock('#servicesChoice', 'Выбрать ситуацию');
  }

  function setupServiceCatalog() {
    var root = document.querySelector('[data-p15-services]');
    if (!root) return;
    var cards = Array.prototype.slice.call(root.querySelectorAll('[data-service-card]'));
    var disciplineCards = Array.prototype.slice.call(root.querySelectorAll('[data-discipline-card]'));
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[data-service-filter]'));
    var more = root.querySelector('[data-catalog-more]');
    var empty = root.querySelector('[data-service-empty]');
    var filter = 'all';
    var expanded = false;

    function phaseMatches(card) {
      return filter === 'all' || (card.getAttribute('data-phase') || '').split(' ').indexOf(filter) !== -1;
    }

    function paint() {
      var pool = cards.filter(function (card) {
        return phaseMatches(card);
      });
      var disciplineMatches = false;
      disciplineCards.forEach(function (card) {
        card.hidden = false;
      });
      var limit = filter === 'all' && !expanded ? currentLimit() : pool.length;
      cards.forEach(function (card) {
        card.hidden = pool.indexOf(card) === -1 || pool.indexOf(card) >= limit;
      });
      if (more) {
        var rest = Math.max(0, pool.length - limit);
        more.hidden = expanded || filter !== 'all' || rest === 0;
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

  /* ── Подбор цены на первом экране ───────────────────────────────────────
     Матрица собрана СТРОГО из позиций каталога: сочинять цену для сочетания,
     которого в прайсе нет, нельзя — это коммерческое обещание. Чего нет,
     то честно уходит в «посчитаем индивидуально». */
  var PICK = {
    'ref.zero':    ['от','2 500 ₽','План, источники и рабочий черновик · от 24 часов','Реферат или эссе с нуля'],
    'ref.razbor':  ['от','2 500 ₽','Замечания руководителя, тема, план и порядок правок','Разбор замечаний руководителя'],
    'ref.norm':    ['от','5 000 ₽','Проверка по методичке','Нормоконтроль'],
    'kurs.zero':   ['от','14 000 ₽','От темы до рабочего черновика · от 24 часов. С исследованием — от 20 000 ₽','Курсовая теория с нуля'],
    'kurs.edit':   ['от','9 000 ₽','Правки и комментарии в Word','Редактура вашей курсовой'],
    'kurs.razbor': ['от','2 500 ₽','Замечания руководителя, тема, план и порядок правок','Разбор замечаний руководителя'],
    'kurs.norm':   ['от','5 000 ₽','Проверка по методичке','Нормоконтроль'],
    'kurs.zashita':['от','6 000 ₽','Правки речи и презентации, репетиция','Проверка речи и презентации'],
    'kurs.k0':     ['','9 900 ₽','Живая сессия, Оппонент и Протокол №0 · по записи','Комиссия №0 · курсовая'],
    'vkr.zero':    ['от','40 000 ₽','Исследовательский проект и материалы к защите · от 24 часов','ВКР или диплом с нуля'],
    'vkr.edit':    ['от','24 000 ₽','Поэтапная редактура рукописи','Аудит и редактура вашей ВКР'],
    'vkr.razbor':  ['от','2 500 ₽','Замечания руководителя, тема, план и порядок правок','Разбор замечаний руководителя'],
    'vkr.norm':    ['от','5 000 ₽','Проверка по методичке','Нормоконтроль'],
    'vkr.zashita': ['от','6 000 ₽','Правки речи и презентации, репетиция','Проверка речи и презентации'],
    'vkr.k0':      ['','19 900 ₽','Живая сессия, Оппонент и Протокол №0 · по записи','Комиссия №0 · ВКР'],
    'mag.zero':    ['от','60 000 ₽','Методология, анализ, рабочий текст и защита','Магистерская с нуля'],
    'mag.razbor':  ['от','2 500 ₽','Замечания руководителя, тема, план и порядок правок','Разбор замечаний руководителя'],
    'mag.norm':    ['от','5 000 ₽','Проверка по методичке','Нормоконтроль'],
    'mag.zashita': ['от','6 000 ₽','Правки речи и презентации, репетиция','Проверка речи и презентации'],
    'mag.k0':      ['','29 900 ₽','Живая сессия, Оппонент и Протокол №0 · по записи','Комиссия №0 · магистерская'],
    'art.zero':    ['от','7 000 ₽','Редактура и требования издания','Научная статья РИНЦ'],
    'art.edit':    ['от','7 000 ₽','Редактура и требования издания','Научная статья РИНЦ'],
    'art.razbor':  ['от','2 500 ₽','Замечания руководителя, тема, план и порядок правок','Разбор замечаний руководителя']
  };
  var WORK_NAME = { ref:'Реферат или эссе', kurs:'Курсовая', vkr:'ВКР / диплом', mag:'Магистерская', art:'Научная статья' };
  var TASK_NAME = { zero:'написать с нуля', edit:'отредактировать', razbor:'разобрать и объяснить',
                    norm:'оформить по методичке', zashita:'подготовить к защите', k0:'Комиссия №0' };

  function setupPricePick() {
    var root = document.querySelector('[data-pricepick]');
    if (!root) return;
    var card = document.querySelector('[data-price-card]');
    var work = 'kurs', task = 'zero';

    function press(sel, attr, value) {
      Array.prototype.forEach.call(root.querySelectorAll('[' + attr + ']'), function (b) {
        var on = b.getAttribute(attr) === value;
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    function paintCard() {
      var hit = PICK[work + '.' + task];
      var what = WORK_NAME[work] + ' — ' + TASK_NAME[task];
      card.querySelector('[data-card-what]').textContent = what;
      var go = card.querySelector('[data-card-go]');
      if (hit) {
        card.querySelector('[data-card-pref]').textContent = hit[0];
        card.querySelector('[data-card-sum]').textContent = hit[1];
        card.querySelector('[data-card-note]').textContent = hit[2];
        card.setAttribute('data-state', 'priced');
        go.textContent = 'Рассчитать точно';
        go.setAttribute('data-start-priced', hit[3]);
      } else {
        /* Сочетания нет в прайсе — не выдумываем число. */
        card.querySelector('[data-card-pref]').textContent = '';
        card.querySelector('[data-card-sum]').textContent = 'Посчитаем индивидуально';
        card.querySelector('[data-card-note]').textContent =
          'Такого сочетания нет в прайсе. Пришлите материалы — редактор назовёт цену и срок до оплаты.';
        card.setAttribute('data-state', 'custom');
        go.textContent = 'Прислать материалы';
        go.removeAttribute('data-start-priced');
      }
      var arrow = document.createElement('span');
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = ' →';
      go.appendChild(arrow);
    }

    root.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-pick-work],[data-pick-task]') : null;
      if (!b) return;
      if (b.hasAttribute('data-pick-work')) { work = b.getAttribute('data-pick-work'); press(root, 'data-pick-work', work); }
      else { task = b.getAttribute('data-pick-task'); press(root, 'data-pick-task', task); }
      paintCard();
    });

    card.querySelector('[data-card-go]').addEventListener('click', function (e) {
      var key = e.currentTarget.getAttribute('data-start-priced');
      var route = (key && pricedRoutes[key]) || { href: 'configurator.html' };
      if (route.commissionWork) {
        try {
          sessionStorage.setItem('salon_commission_zero_handoff_v1', JSON.stringify({
            version:1, work:route.commissionWork, source:'draft', topic:'', savedAt:Date.now()
          }));
        } catch (err) {}
      }
      window.location.href = route.href;
    });

    paintCard();
  }

  function setupPriceTable() {
    var root = document.querySelector('[data-p15-tariffs]');
    if (!root) return;
    var search = root.querySelector('[data-price-search]');
    var rows = Array.prototype.slice.call(root.querySelectorAll('[data-price-row]'));
    var empty = root.querySelector('[data-price-empty]');

    var groups = Array.prototype.slice.call(root.querySelectorAll('[data-price-group]'));

    function setOpen(group, open) {
      var head = group.querySelector('[data-group-toggle]');
      var body = group.querySelector('.price-group__body');
      if (!head || !body) return;
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
      body.hidden = !open;
    }

    /* Дверь открывается по клику; состояние живёт только на странице —
       запоминать его негде и незачем. */
    groups.forEach(function (group) {
      var head = group.querySelector('[data-group-toggle]');
      if (!head) return;
      head.addEventListener('click', function () {
        setOpen(group, head.getAttribute('aria-expanded') !== 'true');
      });
    });

    function paint() {
      var query = search ? search.value : '';
      var visible = 0;
      rows.forEach(function (row) {
        row.hidden = !matches(row.getAttribute('data-search') || row.textContent, query);
        if (!row.hidden) visible += 1;
      });
      /* Поиск сам открывает дверь, за которой нашлось: иначе человек печатает
         «нормоконтроль», строка отфильтровывается — и остаётся невидимой
         внутри закрытой группы, то есть поиск выглядит сломанным. Группа без
         совпадений на время поиска убирается целиком, чтобы пустых дверей на
         экране не оставалось. */
      var searching = !!(query && query.trim());
      groups.forEach(function (group) {
        var found = group.querySelectorAll('[data-price-row]:not([hidden])').length;
        if (!searching) {
          group.hidden = false;
          return;
        }
        group.hidden = found === 0;
        if (found) setOpen(group, true);
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
  setupPricePick();
  setupPriceTable();
})();
