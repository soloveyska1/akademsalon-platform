/* Store entry point: mount Listik without restarting the site's consent or analytics. */
(function () {
  'use strict';
  const S = window.Salon = window.Salon || {};
  function secret(key, fallback) {
    try {
      if (S.secretStore?.get) return S.secretStore.get(key, fallback);
      const value = sessionStorage.getItem(key);
      return value == null ? fallback : JSON.parse(value);
    } catch (_) { return fallback; }
  }
  function csrf() {
    try {
      const value = document.cookie.split(';').map(x => x.trim()).find(x => x.startsWith('__Host-salon_csrf='));
      return value ? decodeURIComponent(value.slice(value.indexOf('=') + 1)) : '';
    } catch (_) { return ''; }
  }
  function bearer() {
    const value = secret('salon_session', null);
    return typeof value === 'string' && value !== '__cookie__' && /^[A-Za-z0-9_.-]{16,2048}$/.test(value) ? value : '';
  }
  if (!S.api) S.api = {
    demoPreview: false,
    guestTokens() {
      const values = secret('salon_tokens', []);
      return Array.isArray(values) ? values.filter(x => typeof x === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(x)).slice(-30) : [];
    },
    async post(path, body, extraHeaders) {
      if (typeof path !== 'string' || !/^(\/assistant\/answer|\/lead|\/orders\/[1-9][0-9]*\/message)$/.test(path)) return {ok: false, error: 'unsupported_path'};
      const token = bearer(), csrfToken = csrf(), hadSession = !!token || secret('salon_cookie_session', false) === true;
      const headers = {'X-Session-Mode': 'cookie', 'Content-Type': 'application/json'};
      if (token) headers.Authorization = 'Bearer ' + token;
      else if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
      const orderTokens = extraHeaders?.['X-Order-Tokens'];
      if (typeof orderTokens === 'string' && orderTokens.split(',').length <= 30 && orderTokens.split(',').every(x => /^[A-Za-z0-9_-]{16,128}$/.test(x))) headers['X-Order-Tokens'] = orderTokens;
      try {
        const response = await fetch('/api' + path, {method: 'POST', credentials: 'include', headers, body: JSON.stringify(body)});
        // An old request must not clear a session established while it was in flight.
        if (response.status === 401 && token === bearer() && csrfToken === csrf()) {
          for (const key of ['salon_session', 'salon_user', 'salon_cookie_session']) {
            try { if (S.secretStore?.del) S.secretStore.del(key); else sessionStorage.removeItem(key); } catch (_) {}
          }
          if (hadSession) document.dispatchEvent(new CustomEvent('salon:auth-lost', {detail: {path, impersonated: false}}));
        }
        const data = await response.json().catch(() => ({ok: false, error: 'bad_json'}));
        return response.ok ? data : {...data, ok: false, error: data?.error || 'http_' + response.status};
      } catch (_) { return {ok: false, error: 'network'}; }
    }
  };
  function mount() {
    if (document.querySelector('script[data-salon-assistant]')) return;
    if (!document.querySelector('link[data-salon-assistant]')) {
      const style = document.createElement('link');
      style.rel = 'stylesheet'; style.href = '/assets/css/salon-assistant.css?v=listik20260911';
      style.dataset.salonAssistant = ''; document.head.append(style);
    }
    const script = document.createElement('script');
    script.src = '/assets/js/salon-assistant.js?v=listik20260911';
    script.dataset.salonAssistant = ''; document.head.append(script);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once: true});
  else mount();
})();
