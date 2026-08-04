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
    /* Лид описывает выбор ситуации, но при сохранённом подборе выбора на экране
       нет — единственное действие «Продолжить». Обе редакции лежат в разметке. */
    var lead = document.querySelector('.page-head__lead[data-lead-saved]');
    var leadFresh = lead ? lead.textContent : '';

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
      if (lead && leadFresh) lead.textContent = leadFresh;
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
        /* Выбор ситуации сразу перестраивает каталог ниже. Прежде он менял
           только ссылку продолжения, и страница на действие не отвечала. */
        var PHASE = { topic: 'start', draft: 'draft', comments: 'draft', defense: 'finish' };
        if (PHASE[situation]) {
          document.dispatchEvent(new CustomEvent('salon:catalog-phase', { detail: PHASE[situation] }));
        }
      });
    });

    if (reveal) reveal.addEventListener('click', revealFreshChoice);
    var hasSavedResume = !!(resume && !resume.hidden);
    root.hidden = hasSavedResume;
    if (next) next.hidden = hasSavedResume;
    if (lead && hasSavedResume) lead.textContent = lead.getAttribute('data-lead-saved') || leadFresh;
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

    var live = root.querySelector('[data-catalog-live]');

    /* Что клиент получит на руки — миниатюрой прямо в карточке.
       Рисуется полосками через CSS: ни одной картинки, ни одного запроса. */
    var ARTIFACT_CAPTION = {
      plan: 'план и структура',
      marks: 'правки и комментарии',
      checklist: 'чек-лист сверки',
      research: 'карта источников',
      manuscript: 'готовая рукопись'
    };

    function decorate(card) {
      if (card.querySelector('.service-artifact')) return;
      var kind = card.getAttribute('data-artifact');
      var body = card.querySelector('.service-card__body');
      if (kind && body && ARTIFACT_CAPTION[kind]) {
        var art = document.createElement('span');
        art.className = 'service-artifact';
        art.setAttribute('data-kind', kind);
        art.setAttribute('data-caption', ARTIFACT_CAPTION[kind]);
        art.setAttribute('aria-hidden', 'true');
        for (var i = 0; i < 5; i++) art.appendChild(document.createElement('i'));
        var link = card.querySelector('.service-card__link');
        var meta = card.querySelector('.service-card__meta');
        if (link && meta) link.insertBefore(art, meta);
        else body.appendChild(art);
      }
      /* Кнопка сравнения — СНАРУЖИ ссылки: вложенный интерактив внутри <a>
         недопустим, а разметку карточек держат контракт-тесты. */
      var compare = document.createElement('button');
      compare.type = 'button';
      compare.className = 'service-compare';
      compare.setAttribute('data-compare-toggle', '');
      compare.setAttribute('aria-pressed', 'false');
      compare.textContent = 'Сравнить';
      card.appendChild(compare);
    }

    cards.forEach(decorate);

    /* Ритм: первая подходящая услуга — герой, следующие две крупные,
       остальные компактные. Раньше все двенадцать весили одинаково. */
    function rank(pool) {
      cards.forEach(function (card) { card.removeAttribute('data-rank'); });
      pool.forEach(function (card, index) {
        card.setAttribute('data-rank', index === 0 ? 'hero' : (index <= 2 ? 'major' : 'minor'));
      });
    }

    function priceOf(card) {
      var node = card.querySelector('.service-card__meta strong');
      var digits = (node ? node.textContent : '').replace(/[^\d]/g, '');
      return digits ? parseInt(digits, 10) : 0;
    }

    var FIRST_STEP = {
      start: 'разбор темы и плана',
      draft: 'разбор вашего черновика',
      finish: 'сверка перед сдачей'
    };

    function summarize(pool) {
      if (!live) return;
      if (!pool.length) { live.textContent = ''; return; }
      var prices = pool.map(priceOf).filter(function (value) { return value > 0; });
      var parts = ['Подходит <b>' + pool.length + '</b> ' + plural(pool.length)];
      if (prices.length) {
        parts.push('от <b>' + Math.min.apply(null, prices).toLocaleString('ru-RU') + ' ₽</b>');
      }
      if (FIRST_STEP[filter]) parts.push('первый шаг — <em>' + FIRST_STEP[filter] + '</em>');
      live.innerHTML = parts.join(' · ');
    }

    function plural(n) {
      var last = n % 10, two = n % 100;
      if (two > 10 && two < 20) return 'услуг';
      if (last === 1) return 'услуга';
      if (last >= 2 && last <= 4) return 'услуги';
      return 'услуг';
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
      var shown = [];
      cards.forEach(function (card) {
        var visible = pool.indexOf(card) !== -1 && pool.indexOf(card) < limit;
        card.hidden = !visible;
        if (visible) shown.push(card);
      });
      rank(shown);
      summarize(pool);
      if (more) {
        var rest = Math.max(0, pool.length - limit);
        more.hidden = expanded || filter !== 'all' || rest === 0;
        more.textContent = rest ? 'Показать остальные — ' + rest : 'Показать остальные';
      }
      if (empty) empty.hidden = pool.length !== 0 || disciplineMatches;
    }

    setupCompare(root, cards);

    /* Ситуация наверху страницы теперь управляет каталогом: выбор сразу
       перестраивает список, а не только уводит в конфигуратор. */
    document.addEventListener('salon:catalog-phase', function (e) {
      var phase = e && e.detail;
      var tab = tabs.filter(function (item) {
        return item.getAttribute('data-service-filter') === phase;
      })[0];
      if (tab) tab.click();
    });

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

  /* Сравнение до трёх услуг. Данные берутся из самой карточки, поэтому
     таблица не может разойтись с каталогом: один источник правды. */
  function setupCompare(root, cards) {
    var tray = document.querySelector('[data-compare-tray]');
    var sheet = document.querySelector('[data-compare-sheet]');
    if (!tray || !sheet) return;
    var list = tray.querySelector('[data-compare-list]');
    var count = tray.querySelector('[data-compare-count]');
    var body = sheet.querySelector('[data-compare-body]');
    var LIMIT = 3;
    var picked = [];
    var lastFocus = null;

    function read(card) {
      var meta = Array.prototype.slice.call(card.querySelectorAll('.service-card__meta span'));
      var rows = meta.map(function (span) {
        var label = span.querySelector('small');
        var value = span.querySelector('strong');
        return {
          label: label ? label.textContent.trim() : '',
          value: value ? value.textContent.trim() : ''
        };
      });
      return {
        title: (card.querySelector('h2') || {}).textContent || 'Услуга',
        eyebrow: (card.querySelector('.eyebrow') || {}).textContent || '',
        about: (card.querySelector('.service-card__body p:last-of-type') || {}).textContent || '',
        artifact: card.getAttribute('data-artifact') || '',
        href: (card.querySelector('.service-card__link') || {}).getAttribute
          ? card.querySelector('.service-card__link').getAttribute('href') : '',
        rows: rows
      };
    }

    var RESULT = {
      plan: 'план и структура',
      marks: 'правки и комментарии',
      checklist: 'чек-лист сверки',
      research: 'карта источников',
      manuscript: 'готовая рукопись'
    };
    var AUTHOR = {
      plan: 'вы — автор, мы объясняем и правим',
      marks: 'вы — автор, мы объясняем и правим',
      checklist: 'вы — автор, мы объясняем и правим',
      research: 'вы — автор финальной версии',
      manuscript: 'автор — наш редактор'
    };

    function paintTray() {
      tray.hidden = picked.length === 0;
      if (count) count.textContent = picked.length + ' из ' + LIMIT;
      if (!list) return;
      list.textContent = '';
      picked.forEach(function (card) {
        var item = document.createElement('li');
        item.textContent = (card.querySelector('h2') || {}).textContent || '';
        var drop = document.createElement('button');
        drop.type = 'button';
        drop.setAttribute('aria-label', 'Убрать из сравнения');
        drop.textContent = '×';
        drop.addEventListener('click', function () { toggle(card); });
        item.appendChild(drop);
        list.appendChild(item);
      });
      cards.forEach(function (card) {
        var button = card.querySelector('[data-compare-toggle]');
        if (!button) return;
        var on = picked.indexOf(card) !== -1;
        button.setAttribute('aria-pressed', String(on));
        button.textContent = on ? 'В сравнении' : 'Сравнить';
      });
    }

    function toggle(card) {
      var at = picked.indexOf(card);
      if (at !== -1) picked.splice(at, 1);
      else if (picked.length < LIMIT) picked.push(card);
      else return;
      paintTray();
    }

    function row(label, values, extra) {
      var line = document.createElement('div');
      line.className = 'compare-grid__row' + (extra ? ' ' + extra : '');
      var head = document.createElement('span');
      head.textContent = label;
      line.appendChild(head);
      values.forEach(function (value) {
        var cell = document.createElement('span');
        cell.textContent = value || '—';
        line.appendChild(cell);
      });
      return line;
    }

    function open() {
      if (!picked.length || !body) return;
      var data = picked.map(read);
      body.textContent = '';
      var grid = document.createElement('div');
      grid.className = 'compare-grid';
      grid.style.setProperty('--compare-cols',
        '132px repeat(' + data.length + ',minmax(0,1fr))');
      grid.appendChild(row('Услуга', data.map(function (x) { return x.title.trim(); }), 'compare-grid__row--head'));
      grid.appendChild(row('Для чего', data.map(function (x) { return x.eyebrow.trim(); })));
      grid.appendChild(row('Что делаем', data.map(function (x) { return x.about.trim(); })));
      grid.appendChild(row('Что получите', data.map(function (x) { return RESULT[x.artifact] || '—'; })));
      grid.appendChild(row('Кто автор результата', data.map(function (x) { return AUTHOR[x.artifact] || '—'; })));
      var labels = {};
      data.forEach(function (x) {
        x.rows.forEach(function (r) { if (r.label) labels[r.label] = true; });
      });
      Object.keys(labels).forEach(function (label) {
        grid.appendChild(row(label, data.map(function (x) {
          var hit = x.rows.filter(function (r) { return r.label === label; })[0];
          return hit ? hit.value : '';
        }), label === 'Стоимость' ? 'compare-grid__row--price' : ''));
      });
      var links = document.createElement('div');
      links.className = 'compare-grid__row';
      links.style.gridTemplateColumns = 'var(--compare-cols)';
      var spacer = document.createElement('span');
      spacer.textContent = 'Подробно';
      links.appendChild(spacer);
      data.forEach(function (x) {
        var cell = document.createElement('span');
        var a = document.createElement('a');
        a.className = 'line-link';
        a.href = x.href;
        a.textContent = 'Посмотреть состав →';
        cell.appendChild(a);
        links.appendChild(cell);
      });
      grid.appendChild(links);
      body.appendChild(grid);
      lastFocus = document.activeElement;
      sheet.hidden = false;
      var close = sheet.querySelector('[data-compare-close]');
      if (close) close.focus({ preventScroll: true });
    }

    function close() {
      sheet.hidden = true;
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }

    root.addEventListener('click', function (e) {
      var button = e.target.closest ? e.target.closest('[data-compare-toggle]') : null;
      if (!button) return;
      e.preventDefault();
      var card = button.closest('[data-service-card]');
      if (card) toggle(card);
    });
    var openButton = tray.querySelector('[data-compare-open]');
    if (openButton) openButton.addEventListener('click', open);
    var clearButton = tray.querySelector('[data-compare-clear]');
    if (clearButton) clearButton.addEventListener('click', function () { picked = []; paintTray(); });
    var closeButton = sheet.querySelector('[data-compare-close]');
    if (closeButton) closeButton.addEventListener('click', close);
    sheet.addEventListener('click', function (e) { if (e.target === sheet) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !sheet.hidden) close();
    });
    paintTray();
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
    'ref.zero':    ['от','2 500 ₽','План, источники и рабочий черновик · от 24 часов','Реферат или эссе с нуля'],
    'ref.razbor':  ['от','2 500 ₽','Замечания руководителя, тема, план и порядок правок','Разбор замечаний руководителя'],
    'ref.norm':    ['от','5 000 ₽','Проверка по методичке','Нормоконтроль'],
    'kurs.zero':   ['от','14 000 ₽','От темы до рабочего черновика · от 24 часов. С исследованием — от 20 000 ₽','Курсовая теория с нуля'],
    'kurs.edit':   ['от','9 000 ₽','Правки и комментарии в Word','Редактура вашей курсовой'],
    'kurs.razbor': ['от','2 500 ₽','Замечания руководителя, тема, план и порядок правок','Разбор замечаний руководителя'],
    'kurs.norm':   ['от','5 000 ₽','Проверка по методичке','Нормоконтроль'],
    'kurs.zashita':['от','6 000 ₽','Правки речи и презентации, репетиция','Проверка речи и презентации'],
    'kurs.k0':     ['','9 900 ₽','Живая сессия, Оппонент и Протокол №0 · по записи','Комиссия №0 · курсовая'],
    'vkr.zero':    ['от','40 000 ₽','Исследовательский проект и материалы к защите · от 24 часов','ВКР или диплом с нуля'],
    'vkr.edit':    ['от','24 000 ₽','Поэтапная редактура рукописи','Аудит и редактура вашей ВКР'],
    'vkr.razbor':  ['от','2 500 ₽','Замечания руководителя, тема, план и порядок правок','Разбор замечаний руководителя'],
    'vkr.norm':    ['от','5 000 ₽','Проверка по методичке','Нормоконтроль'],
    'vkr.zashita': ['от','6 000 ₽','Правки речи и презентации, репетиция','Проверка речи и презентации'],
    'vkr.k0':      ['','19 900 ₽','Живая сессия, Оппонент и Протокол №0 · по записи','Комиссия №0 · ВКР'],
    'mag.zero':    ['от','60 000 ₽','Методология, анализ, рабочий текст и защита','Магистерская с нуля'],
    'mag.razbor':  ['от','2 500 ₽','Замечания руководителя, тема, план и порядок правок','Разбор замечаний руководителя'],
    'mag.norm':    ['от','5 000 ₽','Проверка по методичке','Нормоконтроль'],
    'mag.zashita': ['от','6 000 ₽','Правки речи и презентации, репетиция','Проверка речи и презентации'],
    'mag.k0':      ['','29 900 ₽','Живая сессия, Оппонент и Протокол №0 · по записи','Комиссия №0 · магистерская'],
    'art.zero':    ['от','7 000 ₽','Редактура и требования издания','Научная статья РИНЦ'],
    'art.edit':    ['от','7 000 ₽','Редактура и требования издания','Научная статья РИНЦ'],
    'art.razbor':  ['от','2 500 ₽','Замечания руководителя, тема, план и порядок правок','Разбор замечаний руководителя']
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
  setupPricePick();
  setupPriceTable();
})();
