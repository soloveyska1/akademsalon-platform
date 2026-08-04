/* «Как работаем»: экскурсия по шагам дела.

   Страница читается и без этого файла — все пять шагов лежат в разметке
   и видны подряд. Скрипт лишь повышает её до вкладок: показывает один шаг
   за раз, проигрывает его кадр и по умолчанию переключает шаги сам.

   Автопоказ обязан останавливаться: любое действие клиента выключает его
   насовсем, а кнопка возвращает. В спокойном режиме он не запускается. */
(function () {
  'use strict';

  var STEP_MS = 7200;

  function slice(list) {
    return Array.prototype.slice.call(list);
  }

  function init() {
    var tour = document.querySelector('[data-prolog-tour]');
    if (!tour) return;

    var rail = tour.querySelector('[data-prolog-rail]');
    var steps = slice(tour.querySelectorAll('[data-prolog-step]'));
    var panels = slice(tour.querySelectorAll('[data-prolog-panel]'));
    var toggle = tour.querySelector('[data-prolog-toggle]');
    if (!rail || steps.length < 2 || steps.length !== panels.length) return;

    /* Второй запуск оставил бы за собой первый setInterval: показ продолжал
       бы листать шаги после того, как клиент его выключил. Метка в DOM
       переживает любой повторный разбор файла. */
    if (tour.getAttribute('data-prolog-ready') === '1') return;
    tour.setAttribute('data-prolog-ready', '1');

    var calm = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var index = 0;
    var timer = null;
    var stopped = false;
    var hovered = false;

    tour.classList.add('is-live');
    tour.style.setProperty('--prolog-dur', STEP_MS + 'ms');
    rail.setAttribute('role', 'tablist');
    rail.setAttribute('aria-label', 'Шаги работы над делом');

    steps.forEach(function (step, i) {
      step.setAttribute('role', 'tab');
      step.setAttribute('aria-controls', panels[i].id);
      panels[i].setAttribute('role', 'tabpanel');
      panels[i].setAttribute('aria-labelledby', step.id);
    });

    function quiet() {
      return !!(calm && calm.matches);
    }

    function playState() {
      if (quiet() || stopped) return 'off';
      return hovered ? 'paused' : 'on';
    }

    /* Значки рисуются, а не набираются: ▶ и ‖ не покрыты подмножествами
       шрифтов сайта и на части систем подменяются эмодзи. */
    var ICON_PLAY = '<svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true" focusable="false">'
      + '<path d="M1.4 .7 L9 5 L1.4 9.3 Z" fill="currentColor" /></svg>';
    var ICON_PAUSE = '<svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true" focusable="false">'
      + '<rect x="1.4" y=".8" width="2.6" height="8.4" fill="currentColor" />'
      + '<rect x="6" y=".8" width="2.6" height="8.4" fill="currentColor" /></svg>';

    function labelToggle() {
      if (!toggle) return;
      var off = playState() === 'off';
      toggle.setAttribute('aria-pressed', off ? 'false' : 'true');
      toggle.innerHTML = off
        ? ICON_PLAY + 'Смотреть подряд'
        : ICON_PAUSE + 'Остановить показ';
    }

    function stopTimer() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function syncTimer() {
      stopTimer();
      tour.setAttribute('data-play', playState());
      if (playState() !== 'on') return;
      timer = setInterval(function () {
        show(index + 1);
      }, STEP_MS);
    }

    /* Рельс на узком экране прокручивается: активный шаг встаёт к левому
       краю, следующий выглядывает и подсказывает жест. Выравнивание идёт
       по началу шага — иначе scroll-snap тут же отменит центрирование. */
    function revealStep(step) {
      if (rail.scrollWidth <= rail.clientWidth + 1) return;
      var left = step.offsetLeft;
      if (rail.scrollTo) rail.scrollTo({ left: left, behavior: quiet() ? 'auto' : 'smooth' });
      else rail.scrollLeft = left;
    }

    function show(next, focusTab) {
      var total = steps.length;
      index = ((next % total) + total) % total;

      steps.forEach(function (step, i) {
        var active = i === index;
        step.setAttribute('aria-selected', active ? 'true' : 'false');
        step.setAttribute('tabindex', active ? '0' : '-1');
        panels[i].setAttribute('data-active', 'false');
        if (active && focusTab) step.focus();
      });

      /* Принудительный пересчёт перезапускает кадр: без него повторный
         показ того же шага остался бы застывшей картинкой. */
      void panels[index].offsetWidth;
      panels[index].setAttribute('data-active', 'true');
      revealStep(steps[index]);
    }

    function halt() {
      if (stopped) return;
      stopped = true;
      syncTimer();
      labelToggle();
    }

    steps.forEach(function (step, i) {
      step.addEventListener('click', function (event) {
        event.preventDefault();
        halt();
        show(i);
      });
    });

    rail.addEventListener('keydown', function (event) {
      var key = event.key;
      var last = steps.length - 1;
      var next = null;

      if (key === 'ArrowRight' || key === 'ArrowDown') next = index + 1;
      else if (key === 'ArrowLeft' || key === 'ArrowUp') next = index - 1;
      else if (key === 'Home') next = 0;
      else if (key === 'End') next = last;
      if (next === null) return;

      event.preventDefault();
      halt();
      show(next, true);
    });

    if (toggle) {
      toggle.addEventListener('click', function () {
        if (quiet()) return;
        stopped = !stopped;
        if (!stopped) show(index + 1);
        syncTimer();
        labelToggle();
      });
    }

    tour.addEventListener('mouseenter', function () {
      hovered = true;
      syncTimer();
    });
    tour.addEventListener('mouseleave', function () {
      hovered = false;
      syncTimer();
    });
    tour.addEventListener('focusin', function () {
      hovered = true;
      syncTimer();
    });
    tour.addEventListener('focusout', function (event) {
      if (tour.contains(event.relatedTarget)) return;
      hovered = false;
      syncTimer();
    });

    document.addEventListener('visibilitychange', syncTimer);

    if (calm) {
      var onCalm = function () {
        syncTimer();
        labelToggle();
      };
      if (calm.addEventListener) calm.addEventListener('change', onCalm);
      else if (calm.addListener) calm.addListener(onCalm);
    }

    /* Ссылка на конкретный шаг открывает его и не крутит показ дальше. */
    function stepFromHash() {
      var hash = (location.hash || '').replace('#', '');
      if (!hash) return -1;
      for (var i = 0; i < panels.length; i += 1) {
        if (panels[i].id === hash) return i;
      }
      return -1;
    }

    window.addEventListener('hashchange', function () {
      var target = stepFromHash();
      if (target < 0) return;
      halt();
      show(target);
    });

    var start = stepFromHash();
    if (start < 0) start = 0;
    else stopped = true;
    if (quiet()) stopped = true;

    show(start);
    syncTimer();
    labelToggle();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
