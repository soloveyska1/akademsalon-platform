/* Главная, версия 2: цели Метрики, Telegram в панели калькулятора, просмотр отзывов
   и липкая панель на телефоне. Без JS страница полностью рабочая: все ссылки обычные. */
(function () {
  'use strict';

  var TG_URL = 'https://t.me/academicsaloon';
  var TG_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.6 3.2 2.9 10.4c-1.3.5-1.3 1.2-.2 1.6l4.8 1.5 1.8 5.6c.2.6.4.8.8.8.4 0 .6-.2.9-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.9-1.3-1.5zM9.4 13.2l8.6-5.4c.4-.3.8-.1.5.2l-7.1 6.4-.3 3.3-1.7-4.5z"/></svg>';

  function goal(name) {
    try {
      if (window.Salon && Salon.metrika && typeof Salon.metrika.goal === 'function') Salon.metrika.goal(name);
    } catch (e) { /* аналитика не должна ломать клик */ }
  }

  document.addEventListener('click', function (e) {
    var tg = e.target.closest && e.target.closest('[data-tg-cta]');
    if (tg) goal('tg_click_' + tg.getAttribute('data-tg-cta'));
  });

  /* Нижнюю панель калькулятора создаёт salon-home.js: добавляем к ней Telegram. */
  function addDockButton(dock) {
    if (!dock) return false;
    if (dock.querySelector('.dock-tg')) return true;
    var a = document.createElement('a');
    a.className = 'dock-tg';
    a.href = TG_URL;
    a.target = '_blank';
    a.rel = 'noopener';
    a.setAttribute('aria-label', 'Написать в Telegram');
    a.setAttribute('data-tg-cta', 'dock');
    a.innerHTML = TG_ICON;
    dock.insertBefore(a, dock.querySelector('.button'));
    return true;
  }

  /* Отзыв открывается поверх страницы; без <dialog> — обычный переход к скриншоту. */
  function initViewer() {
    var cards = document.querySelectorAll('.hv-voice a');
    if (!cards.length || typeof HTMLDialogElement !== 'function') return;
    var dlg = document.createElement('dialog');
    dlg.className = 'hv-viewer';
    dlg.setAttribute('aria-label', 'Отзыв клиента');
    dlg.innerHTML = '<figure><div class="hv-viewer-img"><img alt=""></div>' +
      '<figcaption><span></span><button type="button">Закрыть</button></figcaption></figure>';
    document.body.appendChild(dlg);
    var img = dlg.querySelector('img');
    var cap = dlg.querySelector('figcaption span');
    var opener = null;
    dlg.querySelector('button').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', function () {
      img.removeAttribute('src');
      if (opener) opener.focus();
    });
    Array.prototype.forEach.call(cards, function (card) {
      card.addEventListener('click', function (e) {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        opener = card;
        var quote = card.parentNode.querySelector('figcaption');
        img.src = card.getAttribute('href');
        img.alt = quote ? quote.textContent : 'Отзыв клиента';
        cap.textContent = quote ? quote.textContent : '';
        dlg.showModal();
        goal('review_open_home');
      });
    });
  }

  /* Липкая панель на телефоне: появляется, когда кнопки первого экрана ушли из вида,
     и прячется, пока видна панель калькулятора или финальный призыв. */
  function initBar() {
    var bar = document.querySelector('.hv-bar');
    var actions = document.querySelector('.hv-hero .hv-actions');
    var final = document.querySelector('.hv-final');
    if (!bar || !actions || !('IntersectionObserver' in window)) return;
    var heroGone = false, finalSeen = false;
    function dockShown() {
      var dock = document.querySelector('.home-order-dock');
      return !!dock && !dock.hidden;
    }
    function update() {
      var on = heroGone && !finalSeen && !dockShown();
      bar.classList.toggle('is-on', on);
      bar.setAttribute('aria-hidden', on ? 'false' : 'true');
      Array.prototype.forEach.call(bar.querySelectorAll('a'), function (a) { a.tabIndex = on ? 0 : -1; });
    }
    new IntersectionObserver(function (entries) {
      heroGone = !entries[0].isIntersecting && entries[0].boundingClientRect.top < 0;
      update();
    }).observe(actions);
    if (final) {
      new IntersectionObserver(function (entries) {
        finalSeen = entries[0].isIntersecting;
        update();
      }).observe(final);
    }
    if ('MutationObserver' in window) {
      new MutationObserver(update).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
    }
    update();
  }

  function init() {
    if (!addDockButton(document.querySelector('.home-order-dock')) && 'MutationObserver' in window) {
      var mo = new MutationObserver(function () {
        if (addDockButton(document.querySelector('.home-order-dock'))) mo.disconnect();
      });
      mo.observe(document.body, { childList: true });
      setTimeout(function () { mo.disconnect(); }, 10000);
    }
    initViewer();
    initBar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
