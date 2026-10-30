/* Витрина примеров v4: карточки открывают документ в прежней читалке (salon-portfolio.js),
   ссылки с data-page — сразу на нужной странице. Цены «от …» сверяются с каталогом сайта,
   кнопка «Читать целиком» показывает, где читатель остановился. Без JavaScript ссылки ведут на PDF. */
(function () {
  'use strict';
  var docs = window.SalonPortfolio || [];
  var P = window.SalonProducts;

  function byId(id) {
    for (var i = 0; i < docs.length; i++) if (docs[i].id === id) return docs[i];
    return null;
  }

  function goal(name) {
    try {
      if (window.Salon && Salon.metrika && typeof Salon.metrika.goal === 'function') Salon.metrika.goal(name);
    } catch (e) { /* аналитика не должна ломать клик */ }
  }

  document.addEventListener('click', function (e) {
    var tg = e.target.closest && e.target.closest('[data-tg-cta]');
    if (tg) goal('tg_click_' + tg.getAttribute('data-tg-cta'));
    var el = e.target.closest && e.target.closest('[data-open]');
    var reader = window.SalonPortfolioReader;
    if (!el || !reader) return;
    var doc = byId(el.getAttribute('data-open'));
    if (!doc) return;
    e.preventDefault();
    var page = Number(el.getAttribute('data-page')) || 0;
    if (page) reader.open(doc, el, true, page);
    else reader.open(doc, el);
  });

  if (P && P.get) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-price-for]'), function (s) {
      var p = P.get(s.getAttribute('data-price-for'));
      if (p && p.price) s.textContent = 'от ' + P.money(p.price);
    });
  }

  function syncReadLabels() {
    var R = window.SalonReturn;
    Array.prototype.forEach.call(document.querySelectorAll('.sm-read[data-open]'), function (b) {
      var saved = R && R.pdfGet ? R.pdfGet(b.getAttribute('data-open')) : null;
      b.textContent = saved && saved.page > 1 ? 'Продолжить со стр. ' + saved.page : 'Читать целиком';
    });
  }
  syncReadLabels();
  document.addEventListener('salon:return-updated', syncReadLabels);
  document.addEventListener('salon:return-cleared', syncReadLabels);
  var dialog = document.getElementById('pdf-reader');
  if (dialog) dialog.addEventListener('close', syncReadLabels);
})();
