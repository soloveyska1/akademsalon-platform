/* «Библиотека» v4.
   1. Подписи кнопок пишут salon-library.js и salon-reading.js («Ещё 9 материалов ↓», «Поделиться ↗», «Разделы ↑») —
      по правилам сайта в кнопках нет стрелок, поэтому здесь они убираются, в том числе после каждой перерисовки.
   2. Разбор: пункты в разделах «Чек-лист…» и «Что проверить…» становятся галочками, отметки хранятся на устройстве.
      salon-library.js берёт только список сразу под заголовком, а там уже стоит «Ссылка на раздел» или абзац —
      поэтому раньше галочки не появлялись ни в одном разборе.
   3. Хаб: поиск стоит на первом экране, а каталог — ниже. Под полем видно, сколько нашлось, и есть кнопка к результатам;
      подсказки «Часто ищут» подставляют запрос. Сам поиск по-прежнему делает salon-library.js. */
(function () {
  'use strict';
  var body = document.body;
  if (!body || !body.classList.contains('ds-v4')) return;

  var ARROW = /[←-⇿]/;
  // только кнопки раздела: у Листика и шапки свои значки, их не трогаем
  var UI = 'main button,main [data-study-help],main .lr-reader-top a,.sx-focus-bar button,.sx-dialog button';
  function tidy(el) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), node;
    while ((node = walker.nextNode())) {
      if (!ARROW.test(node.nodeValue)) continue;
      node.nodeValue = node.nodeValue
        .replace(/^\s*[←-⇿]\s*/, '')
        .replace(/\s*[←-⇿]\s*$/, '')
        .replace(/\s*[←-⇿]\s*/g, ' ');
    }
  }
  var queued = false;
  function sweep() {
    queued = false;
    document.querySelectorAll(UI).forEach(tidy);
  }
  function queue() {
    if (queued) return;
    queued = true;
    (window.requestAnimationFrame || setTimeout)(sweep);
  }
  new MutationObserver(queue).observe(body, { childList: true, subtree: true, characterData: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sweep, { once: true });
  else sweep();

  var article = document.querySelector('[data-guide-reader] article.doc');
  if (article) {
    var key = 'salon-checks:' + location.pathname.replace(/^.*\//, '').replace(/-v4(?=\.html$)/, '');
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { saved = {}; }
    var count = 0;
    article.querySelectorAll('h2').forEach(function (h) {
      if (!/чек.?лист|что проверить/i.test(h.textContent)) return;
      for (var el = h.nextElementSibling; el && el.tagName !== 'H2'; el = el.nextElementSibling) {
        if (!/^(UL|OL)$/.test(el.tagName) || el.classList.contains('lr-checklist')) continue;
        el.classList.add('lr-checklist');
        Array.prototype.forEach.call(el.children, function (li) {
          var id = String(count++);
          var label = document.createElement('label');
          var box = document.createElement('input');
          var text = document.createElement('span');
          box.type = 'checkbox';
          box.checked = !!saved[id];
          box.addEventListener('change', function () {
            if (box.checked) saved[id] = 1;
            else delete saved[id];
            try { localStorage.setItem(key, JSON.stringify(saved)); } catch (e) { /* отметки живут до перезагрузки */ }
          });
          while (li.firstChild) text.appendChild(li.firstChild);
          label.append(box, text);
          li.appendChild(label);
        });
      }
    });
  }

  var input = document.querySelector('[data-library-search]');
  var hint = document.querySelector('[data-lb-hint]');
  if (!input || !hint) return;
  var status = document.querySelector('[data-library-status]');
  var target = document.querySelector('.lb-filters');
  var label = hint.querySelector('span');
  var show = hint.querySelector('button');
  var calm = window.matchMedia('(prefers-reduced-motion: reduce)');

  function toResults() {
    if (target) target.scrollIntoView({ behavior: calm.matches ? 'auto' : 'smooth', block: 'start' });
  }
  function word(n) {
    var a = n % 10, b = n % 100;
    if (a === 1 && b !== 11) return 'разбор';
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 'разбора';
    return 'разборов';
  }
  function sync() {
    if (!input.value.trim()) {
      hint.hidden = true;
      return;
    }
    // salon-library.js пишет «Показано 9 из 12 материалов» или «Ничего не найдено»
    var m = /из\s(\d+)/.exec(status ? status.textContent : '');
    var n = m ? Number(m[1]) : 0;
    label.textContent = n ? 'Нашлось ' + n + ' ' + word(n) : 'Ничего не нашлось — попробуй другое слово';
    show.hidden = !n;
    hint.hidden = false;
  }
  if (status) new MutationObserver(sync).observe(status, { childList: true, characterData: true, subtree: true });
  input.addEventListener('input', sync);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && input.value.trim()) {
      e.preventDefault();
      toResults();
    }
  });
  show.addEventListener('click', toResults);
  document.querySelectorAll('[data-lb-query]').forEach(function (b) {
    b.addEventListener('click', function () {
      input.value = b.getAttribute('data-lb-query');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      toResults();
    });
  });
  sync();
})();
