/* ============================================================
   ОБВЯЗКА POLISH15 — два диалога вместо одного оглавления

   Заменяет старую панель «Куда вам сейчас?» (mountTOC в app.js) на
   раздельные окна утверждённого макета:
     • «Навигация»    — все разделы, нумерованные основные + группы;
     • «Поиск по сайту» — отдельное окно с живым поиском и клавиатурой.

   Списки НЕ дублируются: всё берётся из Salon.navData (app.js).
   Старые обработчики зовут Salon.toc.open() — мы подменяем Salon.toc
   собой, поэтому править app.js почти не пришлось.
   ============================================================ */
(function () {
  'use strict';

  var S = window.Salon;
  if (!S || !S.navData || !window.HTMLDialogElement) return;

  var docEl = document.documentElement;
  var data = S.navData;
  var menuDlg = null, searchDlg = null, searchField = null, resultsBox = null;
  var results = [], cursor = -1, lastTrigger = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Разделы верхнего уровня — порядок по пути клиента из DESIGN-STANDARDS §10 */
  var PRIMARY = [
    ['/', 'Главная', 'С чего начать'],
    ['services.html', 'Услуги', 'По задаче и виду работы'],
    ['tariffs.html', 'Цены', 'Состав и стоимость'],
    ['knowledge.html', 'Библиотека', 'Статьи и образцы'],
    ['dashboard.html', 'Кабинет', 'Дела, документы, оплата']
  ];

  /* ---------- разметка ---------- */

  function menuMarkup() {
    var situations = [
      ['topic', '01', 'Пока есть только тема', 'Проверить масштаб темы и собрать логику глав'],
      ['draft', '02', 'Черновик уже есть', 'Найти провалы в логике и объяснить правки'],
      ['comments', '03', 'Пришли замечания', 'Понять, что критично и с чего начать'],
      ['defense', '04', 'До защиты мало времени', 'Сверить речь, презентацию и вопросы комиссии']
    ].map(function (it) {
      return '<a href="configurator.html?situation=' + it[0] + '&route=menu">' +
        '<span>' + it[1] + '</span><strong>' + esc(it[2]) + '</strong>' +
        '<small>' + esc(it[3]) + '</small><i aria-hidden="true">→</i></a>';
    }).join('');

    var primary = PRIMARY.map(function (it, i) {
      return '<a href="' + esc(it[0]) + '">' +
        '<span>' + (i < 9 ? '0' : '') + (i + 1) + '</span>' +
        '<strong>' + esc(it[1]) + '</strong>' +
        '<small>' + esc(it[2]) + '</small></a>';
    }).join('');

    var groups = (data.GROUPS || []).map(function (g) {
      return '<section><h3>' + esc(g.t) + '</h3>' +
        g.items.map(function (it) {
          return '<a href="' + esc(it[0]) + '">' + esc(it[1]) + '</a>';
        }).join('') + '</section>';
    }).join('');

    var docs = (data.DOCS || []).length
      ? '<section><h3>Документы</h3>' + data.DOCS.map(function (d) {
          return '<a href="' + esc(d[0]) + '">' + esc(d[1]) + '</a>';
        }).join('') + '</section>'
      : '';

    /* История событий переехала сюда из шапки: сами события теперь
       приходят уведомлением, а список остаётся доступным одним кликом. */
    var marks = '';
    try {
      var total = S.marks && S.marks.list ? S.marks.list().length : 0;
      var unread = S.marks && S.marks.unread ? S.marks.unread() : 0;
      if (total) {
        marks = '<section><h3>По вашим делам</h3>' +
          '<a href="#" data-open-marks>События' +
          (unread ? ' <b>' + unread + '</b>' : '') + '</a></section>';
      }
    } catch (e) {}

    return '<div class="overlay__panel">' +
      '<header class="overlay__header">' +
        '<div><span class="eyebrow">Навигация</span><h2 id="p15MenuTitle">Все разделы</h2></div>' +
        '<button class="icon-button icon-button--close" type="button" data-close-dialog aria-label="Закрыть меню"><i aria-hidden="true"></i></button>' +
      '</header>' +
      '<div class="menu-layout">' +
        '<section class="menu-layout__situations" aria-labelledby="p15MenuSituations">' +
          '<div><span class="eyebrow">Быстрый выбор</span><h3 id="p15MenuSituations">Что у вас уже есть?</h3></div>' +
          '<nav aria-label="Выбрать исходную ситуацию">' + situations + '</nav>' +
        '</section>' +
        '<div class="menu-layout__primary">' + primary + '</div>' +
        '<div class="menu-layout__secondary">' + groups + marks + docs + '</div>' +
      '</div>' +
      '<footer class="overlay__footer">' +
        '<div class="theme-choice">' +
          '<span><strong>Тема оформления</strong><small>Выбор сохраняется в этом браузере</small></span>' +
          '<div role="group" aria-label="Выбрать тему оформления">' +
            '<button type="button" data-set-theme="light">Светлая</button>' +
            '<button type="button" data-set-theme="dark">Тёмная</button>' +
          '</div>' +
        '</div>' +
        /* Оба набора классов, как у кнопки в шапке (app.js): «button--primary»
           из макета и «btn btn-wax» из продового слоя — иначе кнопка теряет
           и оформление, и размер цели касания 52px. */
        '<a class="button button--primary btn btn-wax" href="configurator.html">Подобрать помощь <span aria-hidden="true">→</span></a>' +
      '</footer>' +
    '</div>';
  }

  function searchMarkup() {
    return '<div class="overlay__panel overlay__panel--search">' +
      '<h2 class="visually-hidden" id="p15SearchTitle">Поиск по сайту</h2>' +
      '<header class="search-head">' +
        '<div class="search-brand" aria-hidden="true">' +
          '<span class="search-brand__mark"><img src="assets/img/logo-mark.svg" alt="" width="40" height="40"></span>' +
          '<span><small>Академический Салон</small><strong>Поиск по мастерской</strong></span>' +
        '</div>' +
        '<button class="icon-button icon-button--close search-close" type="button" data-close-dialog aria-label="Закрыть поиск"><i aria-hidden="true"></i></button>' +
        '<div class="search-field-shell">' +
          '<span class="search-field-shell__index" aria-hidden="true">⌕</span>' +
          '<div>' +
          '<label class="visually-hidden" for="p15SearchField">Поиск по сайту</label>' +
          '<input id="p15SearchField" type="search" role="combobox" autocomplete="off" ' +
            'aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false" ' +
            'aria-controls="p15SearchResults" placeholder="Что вы хотите найти?">' +
          '</div>' +
          '<kbd aria-hidden="true">/</kbd>' +
        '</div>' +
      '</header>' +
      '<div class="search-suggestions"><span>Часто ищут</span><div>' +
        '<button type="button" data-search-query="замечания руководителя">Замечания руководителя</button>' +
        '<button type="button" data-search-query="нормоконтроль">Нормоконтроль</button>' +
        '<button type="button" data-search-query="цены">Цены и состав</button>' +
      '</div></div>' +
      '<div class="search-stage">' +
        '<div class="search-zero-state" data-search-zero>' +
          '<span>01</span><div><strong>Начните с задачи своими словами.</strong>' +
          '<small>Найдём подходящую услугу, статью, правило или раздел сайта.</small></div>' +
        '</div>' +
        '<p class="search-results-meta" data-search-results-meta role="status" aria-live="polite" aria-atomic="true"></p>' +
        '<div class="search-empty" data-search-empty hidden>' +
          '<span>Ничего не найдено</span>' +
          '<strong>Попробуйте сформулировать короче.</strong>' +
          '<p>Или напишите мастеру — подскажем, где искать.</p>' +
          '<a href="priyomnaya.html">Открыть приёмную <i aria-hidden="true">→</i></a>' +
        '</div>' +
        '<div class="search-results" id="p15SearchResults" role="listbox" aria-label="Результаты поиска" hidden></div>' +
      '</div>' +
      '<footer class="search-footer">' +
        '<small>Клавиатура</small>' +
        '<span><kbd>↑</kbd><kbd>↓</kbd> выбрать</span>' +
        '<span><kbd>Enter</kbd> открыть</span>' +
        '<span><kbd>Esc</kbd> закрыть</span>' +
      '</footer>' +
    '</div>';
  }

  /* ---------- поиск ---------- */

  /* Раздел для плашки результата: ищем страницу в группах путеводителя. */
  var sectionOf = (function () {
    var map = {};
    PRIMARY.forEach(function (it) { map[it[0]] = 'Основное'; });
    (data.GROUPS || []).forEach(function (g) {
      g.items.forEach(function (it) { if (!map[it[0]]) map[it[0]] = g.t; });
    });
    (data.DOCS || []).forEach(function (d) { if (!map[d[0]]) map[d[0]] = 'Документы'; });
    return function (href) { return map[href] || 'Раздел'; };
  })();

  var SEARCH_QUERY_ALIASES = Object.freeze([
    ['выпускная квалификационная работа', 'вкр'],
    ['выпускная квалификационная', 'вкр'],
    ['дипломная работа', 'вкр'],
    ['научного руководителя', 'научрук'],
    ['научный руководитель', 'научрук'],
    ['научный рук', 'научрук'],
    ['науч рук', 'научрук'],
    ['курсовая работа', 'курсовая'],
    ['дипломная', 'вкр'],
    ['диплом', 'вкр'],
    ['экономике', 'экономика'],
    ['психологии', 'психология'],
    ['клинической психологии', 'психология'],
    ['клиническая психология', 'психология'],
    ['корреляционный анализ', 'корреляция'],
    ['корреляции', 'корреляция'],
    ['манна уитни', 'манн уитни'],
    ['критерий манна уитни', 'манн уитни'],
    ['сравнить группы', 'сравнение групп'],
    ['детектор искусственного интеллекта', 'детектор ии'],
    ['юриспруденции', 'юриспруденция'],
    ['педагогике', 'педагогика'],
    ['информатике', 'информатика'],
    ['менеджменту', 'менеджмент']
  ]);

  function normalizeSearchText(value) {
    var text = String(value == null ? '' : value);
    if (text.normalize) text = text.normalize('NFKC');
    return text
      .toLocaleLowerCase('ru')
      .replace(/ё/g, 'е')
      .replace(/[^a-zа-я0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function canonicalSearchText(value) {
    var query = normalizeSearchText(value);
    var padded = ' ' + query + ' ';
    for (var i = 0; i < SEARCH_QUERY_ALIASES.length; i++) {
      padded = padded.split(' ' + SEARCH_QUERY_ALIASES[i][0] + ' ').join(' ' + SEARCH_QUERY_ALIASES[i][1] + ' ');
    }
    return normalizeSearchText(padded).split(' ').filter(function (token, index, tokens) {
      return index === 0 || token !== tokens[index - 1];
    }).join(' ');
  }

  function allTokensIn(tokens, text) {
    return tokens.every(function (token) { return text.indexOf(token) !== -1; });
  }

  function resultTier(href, query) {
    var discipline = /^(?:kursovaya|diplomnaya)-po-/.test(href);
    var workType = /^(?:kursovaya-rabota|diplomnaya-rabota|magisterskaya-dissertaciya|kandidatskaya-dissertaciya|nauchnaya-statya|otchet-po-praktike|referat|avtorskiy-zakaz)\.html/.test(href);
    var bareWorkType = query === 'вкр' || query === 'курсовая';
    if (bareWorkType && workType) return 0;
    if (discipline) return bareWorkType ? 1 : 0;
    if (workType) return 1;
    if (/^(?:plan|razbor-|normokontrol-|proverka-|audit-|redaktura-|dorabotka-|dosie-)/.test(href)) return 2;
    return 3;
  }

  function search(q) {
    q = canonicalSearchText(q);
    if (!q) return [];
    var tokens = q.split(' ');
    var rows = data.SEARCH || [];
    var hit = [];
    for (var i = 0; i < rows.length; i++) {
      var href = rows[i][0], label = rows[i][1], tags = rows[i][2] || '';
      var normalizedLabel = canonicalSearchText(label);
      var hay = canonicalSearchText(label + ' ' + tags);
      var phrase = ' ' + normalizedLabel + ' ';
      var rank = normalizedLabel === q ? 0
        : (normalizedLabel.indexOf(q) === 0 || phrase.indexOf(' ' + q + ' ') !== -1 ? 1
          : (allTokensIn(tokens, normalizedLabel) ? 2
            : (allTokensIn(tokens, hay) ? 3 : -1)));
      if (rank < 0) continue;
      hit.push({ href: href, label: label, tags: tags, tier: resultTier(href, q), rank: rank, sourceIndex: i });
    }
    hit.sort(function (a, b) { return a.tier - b.tier || a.rank - b.rank || a.sourceIndex - b.sourceIndex; });
    var seen = Object.create(null);
    var unique = [];
    for (var j = 0; j < hit.length && unique.length < 12; j++) {
      if (seen[hit[j].href]) continue;
      seen[hit[j].href] = true;
      unique.push(hit[j]);
    }
    return unique;
  }

  S.searchIndex = Object.freeze({ search: search, normalize: normalizeSearchText, canonicalize: canonicalSearchText });

  function renderResults(q) {
    q = String(q || '').trim();
    results = search(q);
    cursor = results.length ? 0 : -1;
    var zero = searchDlg && searchDlg.querySelector('[data-search-zero]');
    var empty = searchDlg && searchDlg.querySelector('[data-search-empty]');
    var meta = searchDlg && searchDlg.querySelector('[data-search-results-meta]');
    if (zero) zero.hidden = !!q;
    searchField.removeAttribute('aria-activedescendant');
    if (!q) {
      resultsBox.innerHTML = '';
      resultsBox.hidden = true;
      if (empty) empty.hidden = true;
      if (meta) {
        meta.textContent = '';
        meta.hidden = true;
      }
      searchField.setAttribute('aria-expanded', 'false');
      return;
    }
    if (!results.length) {
      resultsBox.innerHTML = '';
      resultsBox.hidden = true;
      if (empty) empty.hidden = false;
      if (meta) {
        meta.textContent = 'Найдено: 0';
        meta.hidden = false;
      }
      searchField.setAttribute('aria-expanded', 'false');
      return;
    }
    resultsBox.hidden = false;
    if (empty) empty.hidden = true;
    if (meta) {
      meta.textContent = 'Найдено: ' + results.length;
      meta.hidden = false;
    }
    resultsBox.innerHTML = results.map(function (r, i) {
      return '<a class="search-result" role="option" id="p15Res' + i + '"' +
        ' aria-selected="' + (i === cursor) + '" href="' + esc(r.href) + '">' +
        '<span class="search-result__tag">' + esc(sectionOf(r.href)) + '</span>' +
        '<strong>' + esc(r.label) + '</strong>' +
        '<span aria-hidden="true">→</span></a>';
    }).join('');
    searchField.setAttribute('aria-expanded', 'true');
    syncCursor();
  }

  function syncCursor() {
    var nodes = resultsBox.querySelectorAll('.search-result');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].setAttribute('aria-selected', String(i === cursor));
      nodes[i].classList.toggle('is-current', i === cursor);
    }
    if (cursor >= 0 && nodes[cursor]) {
      searchField.setAttribute('aria-activedescendant', 'p15Res' + cursor);
      if (nodes[cursor].scrollIntoView) nodes[cursor].scrollIntoView({ block: 'nearest' });
    } else {
      searchField.removeAttribute('aria-activedescendant');
    }
  }

  function moveCursor(step) {
    if (!results.length) return;
    cursor = (cursor + step + results.length) % results.length;
    syncCursor();
  }

  /* ---------- открытие и закрытие ---------- */

  function anyOpen() {
    return (menuDlg && menuDlg.open) || (searchDlg && searchDlg.open);
  }

  function openDialog(dlg, trigger) {
    if (!dlg || dlg.open) return;
    closeAll(true);
    if (dlg === menuDlg) syncThemeChoice();
    lastTrigger = trigger || document.activeElement || null;
    try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); }
    docEl.classList.add('has-p15-dialog');
    syncMenuButtons();
  }

  function closeDialog(dlg, silent) {
    if (!dlg || !dlg.open) return;
    try { dlg.close(); } catch (e) { dlg.removeAttribute('open'); }
    if (!anyOpen()) docEl.classList.remove('has-p15-dialog');
    syncMenuButtons();
    if (!silent && lastTrigger && lastTrigger.focus && document.contains(lastTrigger)) {
      lastTrigger.focus();
    }
  }

  function closeAll(silent) {
    closeDialog(menuDlg, silent);
    closeDialog(searchDlg, silent);
  }

  function syncMenuButtons() {
    var open = !!(menuDlg && menuDlg.open);
    var list = document.querySelectorAll('.menu-toggle');
    for (var i = 0; i < list.length; i++) {
      list[i].setAttribute('aria-expanded', String(open));
      list[i].setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    }
  }

  function openSearch(trigger) {
    openDialog(searchDlg, trigger);
    searchField.value = '';
    renderResults('');
    /* rAF вместо таймера: фокус ставим после первой отрисовки диалога */
    requestAnimationFrame(function () { try { searchField.focus(); } catch (e) {} });
  }

  /* ---------- сборка ---------- */

  function build() {
    menuDlg = document.createElement('dialog');
    menuDlg.className = 'overlay overlay--menu';
    menuDlg.id = 'p15MenuDialog';
    menuDlg.setAttribute('aria-labelledby', 'p15MenuTitle');
    menuDlg.innerHTML = menuMarkup();

    searchDlg = document.createElement('dialog');
    searchDlg.className = 'overlay overlay--search';
    searchDlg.id = 'p15SearchDialog';
    searchDlg.setAttribute('aria-labelledby', 'p15SearchTitle');
    searchDlg.innerHTML = searchMarkup();

    document.body.appendChild(menuDlg);
    document.body.appendChild(searchDlg);

    searchField = searchDlg.querySelector('#p15SearchField');
    resultsBox = searchDlg.querySelector('#p15SearchResults');

    searchField.addEventListener('input', function () { renderResults(searchField.value); });

    /* Клик по подложке закрывает: у нативного dialog клик приходит на сам
       элемент, если попал мимо панели. */
    [menuDlg, searchDlg].forEach(function (dlg) {
      dlg.addEventListener('click', function (e) {
        if (e.target === dlg) closeDialog(dlg);
      });
      dlg.addEventListener('cancel', function (e) { e.preventDefault(); closeDialog(dlg); });
    });

    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('[data-close-dialog]')) {
        e.preventDefault();
        closeAll();
        return;
      }
      var chip = t.closest('[data-search-query]');
      if (chip && searchDlg.open) {
        e.preventDefault();
        searchField.value = chip.getAttribute('data-search-query') || '';
        renderResults(searchField.value);
        searchField.focus();
        return;
      }
      var marksLink = t.closest('[data-open-marks]');
      if (marksLink) {
        e.preventDefault();
        closeAll(true);
        if (S.marks && S.marks.open) S.marks.open();
        return;
      }
      var themeBtn = t.closest('[data-set-theme]');
      if (themeBtn && S.theme) {
        e.preventDefault();
        S.theme.apply(themeBtn.getAttribute('data-set-theme') === 'dark' ? 'dark' : 'light', true);
        syncThemeChoice();
      }
    });

    /* Поиск перехватываем в фазе погружения: иначе сработает старый
       обработчик из app.js и откроет оглавление. */
    document.addEventListener('click', function (e) {
      var hit = e.target && e.target.closest && e.target.closest('[data-open-search]');
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      openSearch(hit);
    }, true);

    document.addEventListener('keydown', function (e) {
      /* Закрываем сами, а не полагаемся только на нативный cancel:
         так Escape одинаково работает в WebKit, во встроенных браузерах
         и когда фокус находится в поле с role="combobox". */
      if ((e.key === 'Escape' || e.keyCode === 27) && anyOpen()) {
        e.preventDefault();
        closeAll();
        return;
      }
      if (searchDlg.open) {
        if (e.key === 'ArrowDown') { e.preventDefault(); moveCursor(1); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); moveCursor(-1); return; }
        if (e.key === 'Enter' && cursor >= 0 && results[cursor]) {
          e.preventDefault();
          location.href = results[cursor].href;
          return;
        }
      }
      if (anyOpen()) return;
      var tag = (e.target && e.target.tagName || '').toLowerCase();
      var typing = tag === 'input' || tag === 'textarea' || tag === 'select' ||
        (e.target && e.target.isContentEditable);
      if (typing) return;
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        openSearch(document.querySelector('[data-open-search]'));
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        openSearch(document.querySelector('[data-open-search]'));
      }
    });

    syncThemeChoice();

    /* Подменяем старое оглавление: обработчики .menu-toggle в app.js
       зовут Salon.toc.open() и теперь открывают диалог «Навигация». */
    S.toc = {
      open: function (trigger) {
        var activeTrigger = trigger;
        if (!activeTrigger && document.activeElement && document.activeElement.closest) {
          activeTrigger = document.activeElement.closest('.menu-toggle');
        }
        if (!activeTrigger) {
          var triggers = document.querySelectorAll('.menu-toggle');
          for (var i = 0; i < triggers.length; i++) {
            if (triggers[i].getClientRects().length) { activeTrigger = triggers[i]; break; }
          }
        }
        openDialog(menuDlg, activeTrigger);
      },
      close: function () { closeAll(); },
      isOpen: function () { return !!(menuDlg && menuDlg.open); }
    };

    /* Старая панель, если её успел смонтировать app.js, больше не нужна. */
    var legacy = document.getElementById('toc');
    if (legacy && legacy.parentNode) legacy.parentNode.removeChild(legacy);
    document.body.classList.remove('toc-lock', 'menu-lock');
    docEl.classList.remove('menu-lock');
  }

  function syncThemeChoice() {
    if (!menuDlg || !S.theme) return;
    var mode = S.theme.current();
    var btns = menuDlg.querySelectorAll('[data-set-theme]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', String(btns[i].getAttribute('data-set-theme') === mode));
    }
  }

  window.addEventListener('salon:theme-change', syncThemeChoice);

  function initHeaderDropdowns() {
    var triggers = [].slice.call(document.querySelectorAll('[data-header-menu-trigger]'));
    if (!triggers.length) return;

    function closeMenus(returnFocus) {
      var active = null;
      triggers.forEach(function (trigger) {
        var menu = document.getElementById(trigger.getAttribute('aria-controls') || '');
        if (trigger.getAttribute('aria-expanded') === 'true') active = trigger;
        trigger.setAttribute('aria-expanded','false');
        if (menu) {
          menu.setAttribute('aria-hidden','true');
          menu.classList.remove('is-open');
        }
      });
      document.documentElement.classList.remove('header-menu-open');
      if (returnFocus && active) active.focus({ preventScroll:true });
    }

    function openMenu(trigger,focusFirst) {
      var menu = document.getElementById(trigger.getAttribute('aria-controls') || '');
      if (!menu) return;
      var alreadyOpen = trigger.getAttribute('aria-expanded') === 'true';
      closeMenus(false);
      if (alreadyOpen) return;
      trigger.setAttribute('aria-expanded','true');
      menu.setAttribute('aria-hidden','false');
      menu.classList.add('is-open');
      document.documentElement.classList.add('header-menu-open');
      if (focusFirst) {
        var first = menu.querySelector('a[href]');
        if (first) first.focus({ preventScroll:true });
      }
    }

    triggers.forEach(function (trigger) {
      trigger.addEventListener('click',function (event) {
        event.preventDefault();
        openMenu(trigger,false);
      });
      trigger.addEventListener('keydown',function (event) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          openMenu(trigger,true);
        }
      });
    });

    document.addEventListener('click',function (event) {
      if (!event.target.closest('.header-nav-group')) closeMenus(false);
    });
    document.addEventListener('focusin',function (event) {
      if (document.documentElement.classList.contains('header-menu-open') &&
          !event.target.closest('.header-nav-group')) closeMenus(false);
    });
    document.addEventListener('keydown',function (event) {
      if (event.key === 'Escape' && document.documentElement.classList.contains('header-menu-open')) {
        event.preventDefault();
        closeMenus(true);
      }
    });
    window.addEventListener('resize',function () {
      if (window.innerWidth <= 1120) closeMenus(false);
    },{ passive:true });
    var scrollStart = window.scrollY;
    window.addEventListener('scroll',function () {
      document.documentElement.classList.toggle('header-scrolled',window.scrollY > 20);
      if (document.documentElement.classList.contains('header-menu-open') &&
          Math.abs(window.scrollY - scrollStart) > 18) closeMenus(false);
      if (!document.documentElement.classList.contains('header-menu-open')) scrollStart = window.scrollY;
    },{ passive:true });
    document.documentElement.classList.toggle('header-scrolled',window.scrollY > 20);
  }

  function boot() {
    build();
    initHeaderDropdowns();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
