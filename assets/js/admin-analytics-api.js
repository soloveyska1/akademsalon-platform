(function adminAnalyticsApi() {
  'use strict';

  var S = window.Salon = window.Salon || {};
  var base = '/api';

  function get(path, options) {
    options = options || {};
    return fetch(base + path, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json' },
      signal: options.signal
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (response.status === 401 || response.status === 403) {
          return { ok: false, error: 'forbidden' };
        }
        if (!response.ok) return { ok: false, error: 'http_' + response.status };
        return data && typeof data === 'object' ? data : { ok: false, error: 'invalid_response' };
      });
    }).catch(function (error) {
      return { ok: false, error: error && error.name === 'AbortError' ? 'aborted' : 'network' };
    });
  }

  S.api = {
    base: base,
    get: get,
    ready: get('/auth/session')
  };
})();
