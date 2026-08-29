/* Один нативный переход в конфигуратор с мгновенной обратной связью на медленной сети. */
(function configuratorNavigationGuard() {
  'use strict';

  var pending = null;
  var restoreTimer = 0;

  function restore() {
    if (!pending) return;
    pending.link.innerHTML = pending.html;
    if (pending.busy === null) pending.link.removeAttribute('aria-busy');
    else pending.link.setAttribute('aria-busy', pending.busy);
    pending = null;
    if (restoreTimer) window.clearTimeout(restoreTimer);
    restoreTimer = 0;
  }

  function configuratorLink(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
        event.shiftKey || event.altKey) return null;
    var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!link || link.download || (link.target && link.target !== '_self')) return null;
    var url;
    try { url = new URL(link.getAttribute('href'), window.location.href); } catch (error) { return null; }
    return url.origin === window.location.origin && url.pathname === '/configurator.html' ? link : null;
  }

  document.addEventListener('click', function (event) {
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
      busy: link.getAttribute('aria-busy')
    };
    link.setAttribute('aria-busy', 'true');
    link.innerHTML = '<span>Открываем…</span><span aria-hidden="true">→</span>';
    restoreTimer = window.setTimeout(restore, 20000);
  }, { capture:true });

  window.addEventListener('pageshow', restore);
})();
