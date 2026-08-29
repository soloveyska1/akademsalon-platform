/* До общего runtime исключает подтверждённого владельца/QA из аналитики.
   Затем оставляет один нативный переход в конфигуратор на медленной сети. */
(function configuratorNavigationGuard() {
  'use strict';

  var pending = null;
  var restoreTimer = 0;
  var restoreUrl = '';

  function analyticsExcluded() {
    try {
      var owner = JSON.parse(localStorage.getItem('salon_analytics_owner_device_v1') || 'null');
      if (owner && owner.v === 1) return true;
    } catch (error) {}
    try { return sessionStorage.getItem('salon_analytics_qa_session_v1') === '1'; }
    catch (error) { return false; }
  }

  /* Shared runtime уже умеет полностью выключать обе аналитические линии в
     desktop-preview. Подставляем этот флаг только на время синхронной загрузки
     скриптов и возвращаем исходный URL до первого отображения страницы. */
  if (analyticsExcluded()) {
    try {
      var initialUrl = new URL(window.location.href);
      if (initialUrl.searchParams.get('desktop-preview') !== '1') {
        restoreUrl = initialUrl.pathname + initialUrl.search + initialUrl.hash;
        window.__salonAnalyticsOriginalUrl = restoreUrl;
        initialUrl.searchParams.set('desktop-preview', '1');
        history.replaceState(history.state, '',
          initialUrl.pathname + initialUrl.search + initialUrl.hash);
        document.addEventListener('DOMContentLoaded', function () {
          if (window.__salonAnalyticsOriginalUrl === restoreUrl) {
            history.replaceState(history.state, '', restoreUrl);
            delete window.__salonAnalyticsOriginalUrl;
          }
          restoreUrl = '';
        }, { once:true });
      }
    } catch (error) {}
  }

  function restore() {
    if (!pending) return;
    pending.link.innerHTML = pending.html;
    if (pending.busy === null) pending.link.removeAttribute('aria-busy');
    else pending.link.setAttribute('aria-busy', pending.busy);
    if (pending.label === null) pending.link.removeAttribute('aria-label');
    else pending.link.setAttribute('aria-label', pending.label);
    pending = null;
    if (restoreTimer) window.clearTimeout(restoreTimer);
    restoreTimer = 0;
  }

  function configuratorLink(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
        event.shiftKey || event.altKey) return null;
    var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return null;
    var url;
    try { url = new URL(link.getAttribute('href'), window.location.href); } catch (error) { return null; }
    return url.origin === window.location.origin && url.pathname === '/configurator.html' ? link : null;
  }

  window.addEventListener('click', function (event) {
    var link = configuratorLink(event);
    if (!link) return;
    if (pending) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    pending = {
      link: link,
      html: link.innerHTML,
      busy: link.getAttribute('aria-busy'),
      label: link.getAttribute('aria-label')
    };
    link.setAttribute('aria-busy', 'true');
    link.setAttribute('aria-label', 'Открываем конфигуратор');
    Promise.resolve().then(function () {
      if (pending && pending.link === link) {
        link.innerHTML = '<span>Открываем…</span><span aria-hidden="true">→</span>';
      }
    });
    restoreTimer = window.setTimeout(restore, 20000);
  }, { capture:true });

  window.addEventListener('pageshow', restore);
})();
