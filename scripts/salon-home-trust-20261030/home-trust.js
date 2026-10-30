/* Главная: Telegram в нижней панели заказа и просмотр отзыва без ухода со страницы.
   Без JS всё остаётся рабочим: ссылки ведут в бота и на полноразмерный скриншот. */
(function () {
  'use strict';

  var TG_URL = 'https://t.me/academic_saloon_bot?start=web';
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

  /* Нижняя панель заказа создаётся salon-home.js — добавляем к ней короткий путь «написать». */
  function addDockButton(dock) {
    if (!dock) return false;
    if (dock.querySelector('.dock-tg')) return true;
    var go = dock.querySelector('.button');
    var a = document.createElement('a');
    a.className = 'dock-tg';
    a.href = TG_URL;
    a.target = '_blank';
    a.rel = 'noopener';
    a.setAttribute('aria-label', 'Написать в Telegram');
    a.setAttribute('data-tg-cta', 'dock');
    a.innerHTML = TG_ICON;
    dock.insertBefore(a, go || null);
    return true;
  }

  /* Отзыв открывается поверх страницы; без <dialog> — обычный переход к скриншоту. */
  function initViewer() {
    var cards = document.querySelectorAll('.home-voices a.voice');
    if (!cards.length || typeof HTMLDialogElement !== 'function') return;
    var dlg = document.createElement('dialog');
    dlg.className = 'voice-viewer';
    dlg.setAttribute('aria-label', 'Отзыв клиента');
    dlg.innerHTML = '<figure><img alt=""><figcaption><span></span>' +
      '<button type="button">Закрыть</button></figcaption></figure>';
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
        var quote = card.querySelector('strong');
        img.src = card.getAttribute('href');
        img.alt = quote ? quote.textContent : 'Отзыв клиента';
        cap.textContent = quote ? quote.textContent : '';
        dlg.showModal();
        goal('review_open_home');
      });
    });
  }

  function init() {
    if (!addDockButton(document.querySelector('.home-order-dock')) && 'MutationObserver' in window) {
      var mo = new MutationObserver(function () {
        var dock = document.querySelector('.home-order-dock');
        if (dock) { addDockButton(dock); mo.disconnect(); }
      });
      mo.observe(document.body, { childList: true });
      setTimeout(function () { mo.disconnect(); }, 10000);
    }
    initViewer();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
