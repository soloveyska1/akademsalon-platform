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
        '<button class="icon-button icon-button--close" type="button" data-close-dialog aria-label="Закрыть меню">×</button>' +
      '</header>' +
      '<div class="menu-layout">' +
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
        '<a class="button button--primary btn btn-wax" href="configurator.html">Описать задачу <span aria-hidden="true">→</span></a>' +
      '</footer>' +
    '</div>';
  }

  function searchMarkup() {
    return '<div class="overlay__panel overlay__panel--search">' +
      '<h2 class="visually-hidden" id="p15SearchTitle">Поиск по сайту</h2>' +
      '<header class="search-head">' +
        '<img src="assets/img/logo-mark.svg" alt="" width="34" height="34">' +
        '<div>' +
          '<label class="visually-hidden" for="p15SearchField">Поиск по сайту</label>' +
          '<input id="p15SearchField" type="search" role="combobox" autocomplete="off" ' +
            'aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false" ' +
            'aria-controls="p15SearchResults" placeholder="Услуга, статья или раздел">' +
        '</div>' +
        '<button class="icon-button icon-button--close" type="button" data-close-dialog aria-label="Закрыть поиск">×</button>' +
      '</header>' +
      '<div class="search-suggestions"><span>Попробуйте:</span>' +
        '<button type="button" data-search-query="замечания руководителя">замечания руководителя</button>' +
        '<button type="button" data-search-query="нормоконтроль">нормоконтроль</button>' +
        '<button type="button" data-search-query="цены">цены</button>' +
      '</div>' +
      '<div class="search-results" id="p15SearchResults" role="listbox" aria-live="polite" aria-label="Результаты поиска"></div>' +
      '<footer class="search-footer">' +
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

  function search(q) {
    q = String(q || '').trim().toLowerCase();
    if (!q) return [];
    var rows = data.SEARCH || [];
    var hit = [];
    for (var i = 0; i < rows.length; i++) {
      var href = rows[i][0], label = rows[i][1], tags = rows[i][2] || '';
      var hay = (label + ' ' + tags).toLowerCase();
      var at = hay.indexOf(q);
      if (at < 0) continue;
      /* совпадение в начале подписи весомее, чем в хвосте синонимов */
      hit.push({ href: href, label: label, tags: tags, rank: label.toLowerCase().indexOf(q) === 0 ? 0 : (at === 0 ? 1 : 2) });
      if (hit.length > 60) break;
    }
    hit.sort(function (a, b) { return a.rank - b.rank; });
    return hit.slice(0, 12);
  }

  function renderResults(q) {
    results = search(q);
    cursor = results.length ? 0 : -1;
    if (!q) {
      resultsBox.innerHTML = '';
      searchField.setAttribute('aria-expanded', 'false');
      return;
    }
    if (!results.length) {
      resultsBox.innerHTML = '<p class="search-empty">Ничего не нашлось. ' +
        'Напишите мастеру — подскажем, где смотреть: ' +
        '<a href="priyomnaya.html">открытая приёмная</a>.</p>';
      searchField.setAttribute('aria-expanded', 'false');
      return;
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
      open: function () { openDialog(menuDlg, document.querySelector('.menu-toggle')); },
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

  function boot() {
    build();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
