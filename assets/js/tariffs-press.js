/* Академический Салон · «Печатный двор» — интерактив страницы цен.

   Надстройка над setupPricePick/setupPriceTable из polish15-catalog.js:
   ничего в их логике не подменяет, только слушает результат и дорисовывает.
   Смена цены замечается через MutationObserver — карточку красит чужой код,
   и вклиниваться в него значило бы связать два файла навсегда. Без этого
   скрипта страница полностью работоспособна: суммы меняются мгновенно,
   шкала и печать просто стоят на месте. */
(function () {
  'use strict';

  var root = document.querySelector('[data-p15-tariffs]');
  if (!root) return;

  /* ── Оттиск: печать и шкала при смене цены ─────────────────────────── */
  var card = root.querySelector('[data-price-card]');
  var sum = root.querySelector('[data-card-sum]');
  var scale = root.querySelector('[data-price-scale]');
  var marker = root.querySelector('[data-scale-marker]');

  /* Края шкалы = края реального прайса «с нуля»: 2 500 и 60 000.
     Числа не назначают цену — только позицию уже показанной суммы. */
  var SCALE_MIN = 2500;
  var SCALE_MAX = 60000;

  function priceOf(text) {
    var digits = String(text || '').replace(/[^0-9]/g, '');
    return digits ? parseInt(digits, 10) : null;
  }

  function place(value) {
    if (!scale || !marker) return;
    if (value == null) {
      scale.setAttribute('data-scale-state', 'custom');
      return;
    }
    scale.setAttribute('data-scale-state', 'priced');
    /* Шкала логарифмическая: линейная сплющила бы 2 500…9 900 в углу. */
    var t = (Math.log(value) - Math.log(SCALE_MIN)) /
            (Math.log(SCALE_MAX) - Math.log(SCALE_MIN));
    t = Math.max(0, Math.min(1, t));
    marker.style.left = (t * 100).toFixed(2) + '%';
  }

  function press() {
    if (!card) return;
    /* Снять и вернуть класс с принудительным reflow — единственный
       способ перезапустить CSS-анимацию без requestAnimationFrame,
       которого в среде предпросмотра может не быть. */
    card.classList.remove('is-press');
    void card.offsetWidth;
    card.classList.add('is-press');
  }

  if (sum) {
    place(priceOf(sum.textContent));
    if (typeof MutationObserver === 'function') {
      var lastSum = sum.textContent;
      new MutationObserver(function () {
        if (sum.textContent === lastSum) return;
        lastSum = sum.textContent;
        place(priceOf(lastSum));
        press();
      }).observe(sum, { childList: true, characterData: true, subtree: true });
    }
  }

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
    /* Ящик без единой видимой строки прячется целиком: заголовок
       группы над пустотой читался бы как сломанный фильтр. */
    groups.forEach(function (group) {
      group.hidden = !group.querySelector('[data-price-row]:not([hidden])');
    });
  }

  /* Слушатель регистрируется после чужого paint(): порядок вызова
     на одном элементе сохраняется, к моменту recount() строки уже
     спрятаны или показаны. */
  if (search) search.addEventListener('input', recount);
  recount();
})();
