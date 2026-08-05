/* Академический Салон · «Печатный двор» — интерактив страницы цен.

   Надстройка над setupPricePick/setupPriceTable из polish15-catalog.js:
   ничего в их логике не подменяет, только слушает результат и дорисовывает.
   Смена цены замечается через MutationObserver — карточку красит чужой код,
   и вклиниваться в него значило бы связать два файла навсегда. Без этого
   скрипта страница полностью работоспособна: суммы меняются мгновенно,
   печать просто стоит на месте, а все чипы выглядят одинаково. */
(function () {
  'use strict';

  var root = document.querySelector('[data-p15-tariffs]');
  if (!root) return;

  var card = root.querySelector('[data-price-card]');
  var sum = root.querySelector('[data-card-sum]');

  /* ── Оттиск: печать прижимается при каждой новой цене ──────────────── */
  function press() {
    if (!card) return;
    /* Снять и вернуть класс с принудительным reflow — единственный
       способ перезапустить CSS-анимацию без requestAnimationFrame,
       которого в среде предпросмотра может не быть. */
    card.classList.remove('is-press');
    void card.offsetWidth;
    card.classList.add('is-press');
  }

  if (sum && typeof MutationObserver === 'function') {
    var lastSum = sum.textContent;
    new MutationObserver(function () {
      if (sum.textContent === lastSum) return;
      lastSum = sum.textContent;
      press();
    }).observe(sum, { childList: true, characterData: true, subtree: true });
  }

  /* ── Тупики видно заранее ──────────────────────────────────────────────
     В прайсе есть не всякое сочетание: у реферата нет ни редактуры, ни
     защиты, ни Комиссии №0. Раньше человек узнавал об этом только после
     клика — получал «посчитаем индивидуально» и упирался. Теперь
     недоступные варианты приглушены заранее.

     Кнопки НЕ блокируются: выбрать по-прежнему можно, и честный ответ
     про индивидуальный расчёт никуда не делся — он просто перестал
     выглядеть обычным путём.

     ВНИМАНИЕ: это копия ключей матрицы PICK из polish15-catalog.js. Взять
     их оттуда напрямую нельзя — PICK закрыт в замыкании модуля. Копия
     обязана сходиться с оригиналом, поэтому расхождение ловит тест
     «приглушение недоступных сочетаний совпадает с матрицей прайса»
     в tests/catalog-polish15-regression.test.js. Правите цены там —
     тест сам укажет сюда. Цена от рассинхронизации не пострадает
     (её всё равно считает каталог), но приглушение начнёт врать. */
  var WORK_TASKS = {
    ref:  ['zero', 'razbor', 'norm'],
    kurs: ['zero', 'edit', 'razbor', 'norm', 'zashita', 'k0'],
    vkr:  ['zero', 'edit', 'razbor', 'norm', 'zashita', 'k0'],
    mag:  ['zero', 'razbor', 'norm', 'zashita', 'k0'],
    art:  ['zero', 'edit', 'razbor']
  };

  var workChips = Array.prototype.slice.call(root.querySelectorAll('[data-pick-work]'));
  var taskChips = Array.prototype.slice.call(root.querySelectorAll('[data-pick-task]'));

  function paintAvailability() {
    var current = null;
    workChips.forEach(function (chip) {
      if (chip.getAttribute('aria-pressed') === 'true') current = chip.getAttribute('data-pick-work');
    });
    var allowed = WORK_TASKS[current];
    taskChips.forEach(function (chip) {
      var on = !allowed || allowed.indexOf(chip.getAttribute('data-pick-task')) !== -1;
      if (on) {
        chip.removeAttribute('data-pick-off');
        chip.removeAttribute('title');
      } else {
        chip.setAttribute('data-pick-off', '1');
        chip.setAttribute('title', 'Такого сочетания нет в прайсе — посчитаем индивидуально');
      }
    });
  }

  /* Слушатель вешается на тот же корень, что и чужой: обработчики одного
     элемента вызываются в порядке регистрации, а наш файл грузится после
     каталога — значит к моменту перекраски выбор уже переключён. */
  root.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    if (e.target.closest('[data-pick-work]')) paintAvailability();
  });
  paintAvailability();

  /* ── Картотека: счётчик находок и пустые ящики ─────────────────────── */
  var rows = Array.prototype.slice.call(root.querySelectorAll('[data-price-row]'));
  var groups = Array.prototype.slice.call(root.querySelectorAll('[data-price-group]'));
  var counter = root.querySelector('[data-price-count]');
  var search = root.querySelector('[data-price-search]');

  function recount() {
    var visible = rows.filter(function (row) { return !row.hidden; }).length;
    if (counter) {
      counter.textContent = visible === rows.length
        ? rows.length + ' позиций'
        : visible + ' из ' + rows.length;
    }
    /* Ящик без единой видимой строки прячется целиком: заголовок группы
       над пустотой читался бы как сломанный фильтр. */
    groups.forEach(function (group) {
      group.hidden = !group.querySelector('[data-price-row]:not([hidden])');
    });
  }

  if (search) search.addEventListener('input', recount);
  recount();
})();
