/* Академический Салон · собственная аналитика v2.
   Только после отдельного согласия. Контакты, тексты, заказ, кабинет, query,
   raw referrer, raw user-agent и файлы не входят в контракт по определению. */
(function analyticsV2Bootstrap() {
  'use strict';

  var SCHEMA_VERSION = 2;
  var RELEASE = '20260812analytics2';
  var API = '/api';
  var QUEUE_KEY = 'salon_analytics_queue_v2';
  var DELETE_KEY = 'salon_analytics_delete_v2';
  var PENDING_REVOKE_KEY = 'salon_analytics_revoke_pending';
  var SEQUENCE_KEY = 'salon_analytics_sequence_v2';
  var GRANT_KEY = 'salon_analytics_grant_v2';
  var QUEUE_LIMIT = 50;
  var QUEUE_TTL = 72 * 60 * 60 * 1000;
  var RETRIES = [1500, 5000, 15000, 45000];
  var grantToken = '';
  var grantExpiresAt = 0;
  var grantPromise = null;
  var grantController = null;
  var eventsController = null;
  var revokePromise = null;
  var revokeFallbackQueue = [];
  var consentGeneration = 0;

  if (!window.Salon || !Salon.store || !Salon.consent) return;
  if (location.protocol !== 'https:' || location.hostname !== 'akademsalon.ru') return;

  var here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var privatePage = here.indexOf('admin') === 0 || here === 'dashboard.html' ||
    here === 'zayavka.html' || here === 'oplaceno.html' || here === 'offline.html';
  var impersonation = false;
  try { impersonation = sessionStorage.getItem('salon_imp') === '1'; } catch (ignore) {}
  try {
    if (new URLSearchParams(location.search).get('desktop-preview') === '1') privatePage = true;
  } catch (ignorePreview) {}
  if (privatePage || impersonation) return;

  var EVENT_NAMES = {};
  ('page_view cta_click tg_open config_open step_view submit_attempt submit_fail first_input ' +
    'case_bridge_open case_route_inferred case_step_view case_recommend_view case_route_confirm ' +
    'case_route_change case_submit_ready case_route_ready case_route_uncertain case_route_blocked ' +
    'case_prompt_start case_result_situation_changed case_route_open case_free_route_open ' +
    'case_ecosystem_stage home_desk_situation home_desk_artifact home_desk_continue ' +
    'quote_scope_seen quote_scope_continue cta_contact ' +
    'cta_configurator service_selected config_step_1 config_step_2 config_step_3 config_step_4 ' +
    'quote_email_requested order_form_ready order_fallback_shown help_hint_shown help_bookmark_shown ' +
    'guide_question_opened quote_return_shown mini_quote_seen doi_check_complete js_error ' +
    'validation_error submit_success').split(' ').forEach(function (name) { EVENT_NAMES[name] = true; });
  var ERROR_TYPES = {
    type_error: 1, reference_error: 1, syntax_error: 1, security_error: 1,
    network_error: 1, runtime_error: 1
  };
  var SOURCE_NAMES = {
    yandex: 'search', google: 'search', bing: 'search', telegram: 'social', vk: 'social',
    mailru: 'referral', external: 'referral'
  };
  var CAMPAIGN_SOURCES = { yandex: 1, google: 1, bing: 1, telegram: 1, vk: 1, mailru: 1 };
  var CAMPAIGN_MEDIUMS = { cpc: 1, organic: 1, social: 1, referral: 1, email: 1, banner: 1 };
  var CAMPAIGN_CODES = { brand: 1, services: 1, catalog: 1, guides: 1, remarketing: 1 };

  function get(key, fallback) {
    try { return Salon.store.get(key, fallback); } catch (error) { return fallback; }
  }
  function set(key, value) {
    try { return Salon.store.set(key, value); } catch (error) { return false; }
  }
  function del(key) {
    try { Salon.store.del(key); } catch (error) {}
  }
  function allowed() {
    try { return Salon.consent.allowed() === true; } catch (error) { return false; }
  }
  function consentRecord() {
    try {
      var record = Salon.consent.read();
      return record && record.analytics === true && record.at ? record : null;
    } catch (error) { return null; }
  }
  function hex(bytes) {
    return Array.prototype.map.call(bytes, function (byte) {
      return ('0' + byte.toString(16)).slice(-2);
    }).join('');
  }
  function randomBytes(size) {
    var bytes = new Uint8Array(size);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else throw new Error('secure_random_unavailable');
    return bytes;
  }
  function eventId() {
    if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    var bytes = randomBytes(16);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    var value = hex(bytes);
    return value.slice(0, 8) + '-' + value.slice(8, 12) + '-' + value.slice(12, 16) + '-' +
      value.slice(16, 20) + '-' + value.slice(20);
  }
  function visitorId() {
    var value = get('salon_vid', '');
    if (/^v[0-9a-f]{18}$/.test(String(value || ''))) return value;
    value = 'v' + hex(randomBytes(9));
    set('salon_vid', value);
    return value;
  }
  function deletionProof(identity) {
    var value = get(DELETE_KEY, null);
    if (value && /^v[0-9a-f]{18}$/.test(String(value.visitor_id || '')) &&
        /^[0-9a-f]{64}$/.test(String(value.deletion_secret || ''))) return value;
    if (/^v[0-9a-f]{18}$/.test(String(identity || '')) &&
        /^[0-9a-f]{64}$/.test(String(value || ''))) {
      value = { visitor_id: identity, deletion_secret: String(value) };
      set(DELETE_KEY, value);
      return value;
    }
    return null;
  }
  function deletionSecret(identity) {
    var proof = deletionProof(identity);
    if (proof && proof.visitor_id === identity) return proof.deletion_secret;
    proof = { visitor_id: identity, deletion_secret: hex(randomBytes(32)) };
    set(DELETE_KEY, proof);
    return proof.deletion_secret;
  }
  function nextClientSequence(identity) {
    var record = get(SEQUENCE_KEY, null);
    var previous = record && record.visitor_id === identity ? Number(record.value) : 0;
    if (!isFinite(previous) || previous < 0 || Math.floor(previous) !== previous ||
        previous >= 9007199254740990) previous = 0;
    var value = previous + 1;
    set(SEQUENCE_KEY, { visitor_id: identity, value: value });
    return value;
  }
  function sessionGrant(identity) {
    try {
      var record = JSON.parse(sessionStorage.getItem(GRANT_KEY) || 'null');
      if (!record || record.visitor_id !== identity || typeof record.grant !== 'string' ||
          record.grant.length < 16 || record.grant.length > 1024 ||
          !isFinite(record.expires_at) || Number(record.expires_at) * 1000 <= Date.now() + 10000) {
        sessionStorage.removeItem(GRANT_KEY);
        return null;
      }
      return record;
    } catch (error) {
      try { sessionStorage.removeItem(GRANT_KEY); } catch (ignore) {}
      return null;
    }
  }
  function rememberGrant(identity, grant, expiresAt) {
    grantToken = grant;
    grantExpiresAt = Number(expiresAt);
    try {
      sessionStorage.setItem(GRANT_KEY, JSON.stringify({
        visitor_id: identity, grant: grant, expires_at: grantExpiresAt
      }));
    } catch (error) {}
  }
  function clearGrant() {
    grantToken = '';
    grantExpiresAt = 0;
    try { sessionStorage.removeItem(GRANT_KEY); } catch (error) {}
  }
  function consentStamp() {
    var record = consentRecord();
    return record ? String(record.v || '') + ':' + String(record.at || '') : '';
  }
  function consentIsCurrent(generation, stamp) {
    return generation === consentGeneration && stamp && allowed() && consentStamp() === stamp;
  }
  function abortCollectionRequests() {
    if (grantController) {
      try { grantController.abort(); } catch (error) {}
    }
    if (eventsController) {
      try { eventsController.abort(); } catch (error) {}
    }
    grantController = null;
    eventsController = null;
  }
  function canonicalPage() {
    try {
      var page = Salon.analyticsPrivacy && Salon.analyticsPrivacy.page
        ? Salon.analyticsPrivacy.page(location.pathname) : '/other';
      return /^\/(?:[a-z0-9-]+\.html)?$/.test(page) || page === '/other' ? page : '/other';
    } catch (error) { return '/other'; }
  }
  function safeCode(value) {
    value = String(value == null ? '' : value).trim().toLowerCase();
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(value)) return '';
    if ((value.match(/\d/g) || []).length >= 7) return '';
    return value;
  }
  function currentSource(newGrant) {
    var compact = '';
    try { compact = Salon.attribution && Salon.attribution.ref ? Salon.attribution.ref() : ''; }
    catch (error) {}
    var values = {};
    String(compact || '').split('&').forEach(function (part) {
      var pair = part.split('=');
      if (pair.length !== 2) return;
      var key = pair[0], value = safeCode(pair[1]);
      if (/^(?:utm_source|utm_medium|utm_campaign|utm_content|utm_term|ref)$/.test(key) && value) {
        values[key] = value;
      }
    });
    if (values.utm_source && CAMPAIGN_SOURCES[values.utm_source]) {
      return {
        kind: 'campaign', name: values.utm_source,
        medium: CAMPAIGN_MEDIUMS[values.utm_medium] ? values.utm_medium : '',
        campaign: CAMPAIGN_CODES[values.utm_campaign] ? values.utm_campaign : ''
      };
    }
    if (values.ref && SOURCE_NAMES[values.ref]) {
      return { kind: SOURCE_NAMES[values.ref], name: values.ref, medium: '', campaign: '' };
    }
    var consent = consentRecord();
    var grantedAt = consent ? Date.parse(consent.at) : NaN;
    var sameDocumentGrant = newGrant === true || (isFinite(grantedAt) && window.performance &&
      grantedAt >= Number(performance.timeOrigin || 0));
    return sameDocumentGrant
      ? { kind: 'unknown', name: 'unknown', medium: '', campaign: '' }
      : { kind: 'direct', name: 'direct', medium: '', campaign: '' };
  }
  function queue() {
    var value = get(QUEUE_KEY, []);
    if (!Array.isArray(value)) value = [];
    var cutoff = Date.now() - QUEUE_TTL;
    return value.filter(function (item) {
      return item && item.added_at >= cutoff && item.event && item.event.event_id;
    }).slice(-QUEUE_LIMIT);
  }
  function saveQueue(items) {
    if (!items.length) del(QUEUE_KEY);
    else set(QUEUE_KEY, items.slice(-QUEUE_LIMIT));
  }
  function buildEvent(name, detail, newGrant, identity) {
    if (EVENT_NAMES[name] !== true || !allowed()) return null;
    detail = detail || {};
    var item = {
      event_id: eventId(), event: name, page: canonicalPage(), release: RELEASE,
      source: currentSource(newGrant), occurred_at: new Date().toISOString(),
      client_sequence: nextClientSequence(identity)
    };
    if (detail.cta && /^[a-z][a-z0-9_:-]{0,31}$/.test(detail.cta)) item.cta_id = detail.cta;
    if (detail.variant && (/^r1_[a-z0-9_-]{1,29}$/.test(detail.variant) ||
        /^(?:text|comments|defense|open|close|free|configurator|first|milestone|full)$/.test(detail.variant))) {
      item.variant = detail.variant;
    }
    if (name === 'js_error' && ERROR_TYPES[detail.error_type]) item.error_type = detail.error_type;
    return item;
  }

  var flushing = false;
  var flushToken = 0;
  var retryIndex = 0;
  var retryTimer = 0;
  function scheduleRetry() {
    if (!allowed() || retryTimer) return;
    var delay = RETRIES[Math.min(retryIndex, RETRIES.length - 1)];
    retryIndex += 1;
    retryTimer = setTimeout(function () { retryTimer = 0; flush(); }, delay);
  }
  function analyticsGrant(identity, generation, stamp) {
    if (!consentIsCurrent(generation, stamp)) return Promise.reject(new Error('consent_changed'));
    if (grantToken && grantExpiresAt * 1000 > Date.now() + 10000) {
      return Promise.resolve(grantToken);
    }
    grantToken = '';
    grantExpiresAt = 0;
    var cached = sessionGrant(identity);
    if (cached) {
      rememberGrant(identity, cached.grant, cached.expires_at);
      return Promise.resolve(grantToken);
    }
    if (grantPromise) return grantPromise;
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    grantController = controller;
    var options = {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      credentials: 'omit',
      body: JSON.stringify({ schema_version: SCHEMA_VERSION, visitor_id: identity })
    };
    if (controller) options.signal = controller.signal;
    var pending = fetch(API + '/analytics/grant', options).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok || !data.ok || typeof data.grant !== 'string' ||
            !isFinite(data.expires_at) || Number(data.expires_at) * 1000 <= Date.now() + 10000) {
          throw new Error(data.error || 'grant_failed');
        }
        if (!consentIsCurrent(generation, stamp)) throw new Error('consent_changed');
        rememberGrant(identity, data.grant, data.expires_at);
        return grantToken;
      });
    }).finally(function () {
      if (grantPromise === pending) grantPromise = null;
      if (grantController === controller) grantController = null;
    });
    grantPromise = pending;
    return pending;
  }
  function flush() {
    if (flushing || !allowed()) return Promise.resolve(false);
    var items = queue();
    if (!items.length) return Promise.resolve(true);
    var identity = items[0].visitor_id;
    var secret = items[0].deletion_secret;
    var batch = items.filter(function (item) {
      return item.visitor_id === identity && item.deletion_secret === secret;
    }).slice(0, 20);
    var consent = consentRecord();
    if (!consent) return Promise.resolve(false);
    var generation = consentGeneration;
    var stamp = consentStamp();
    var token = ++flushToken;
    flushing = true;
    return analyticsGrant(identity, generation, stamp).then(function (grant) {
      if (!consentIsCurrent(generation, stamp) || token !== flushToken) {
        throw new Error('consent_changed');
      }
      var body = JSON.stringify({
        schema_version: SCHEMA_VERSION,
        visitor_id: identity,
        deletion_secret: secret,
        consent_version: Number(consent.v || 0),
        consent_at: String(consent.at || ''),
        grant: grant,
        events: batch.map(function (item) { return item.event; })
      });
      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      eventsController = controller;
      var options = {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        credentials: 'omit',
        keepalive: body.length < 60000,
        body: body
      };
      if (controller) options.signal = controller.signal;
      return fetch(API + '/analytics/events', options).finally(function () {
        if (eventsController === controller) eventsController = null;
      });
    }).then(function (response) {
      return response.json().catch(function () { return { ok: false }; }).then(function (data) {
        if (!consentIsCurrent(generation, stamp) || token !== flushToken) return false;
        if (response.status === 429 && data.error === 'grant_budget_exhausted') {
          clearGrant();
          throw new Error('grant_budget_exhausted');
        }
        if (response.status === 429) throw new Error('rate_limited');
        if (response.status === 403 && /^grant_/.test(String(data.error || ''))) {
          clearGrant();
          throw new Error(data.error);
        }
        var done = {};
        (data.processed || []).concat(data.discarded || []).forEach(function (id) { done[id] = true; });
        if (data.ok || Object.keys(done).length) {
          saveQueue(queue().filter(function (item) { return done[item.event.event_id] !== true; }));
          retryIndex = 0;
        } else if (response.status === 400 || response.status === 409) {
          saveQueue(queue().filter(function (item) {
            return !batch.some(function (sent) { return sent.event.event_id === item.event.event_id; });
          }));
        } else {
          throw new Error('temporary_failure');
        }
        return data.ok === true;
      });
    }).catch(function () {
      if (consentIsCurrent(generation, stamp) && token === flushToken) scheduleRetry();
      return false;
    }).then(function (result) {
      if (token === flushToken) {
        flushing = false;
        if (queue().length && consentIsCurrent(generation, stamp)) scheduleRetry();
      }
      return result;
    });
  }
  function enqueue(name, detail, newGrant) {
    if (EVENT_NAMES[name] !== true || !allowed()) return '';
    var identity = visitorId();
    var event = buildEvent(name, detail, newGrant, identity);
    if (!event) return '';
    var items = queue();
    items.push({
      added_at: Date.now(), visitor_id: identity,
      deletion_secret: deletionSecret(identity), event: event
    });
    saveQueue(items);
    flush();
    return event.event_id;
  }

  /* Конфигуратор сообщает только два этапа и один из трёх заранее известных
     объёмов. Свободный текст формы, контакт и файлы сюда не принимаются. */
  function quoteScope(stage, scope) {
    stage = String(stage || '').toLowerCase();
    scope = String(scope || '').toLowerCase();
    if (stage !== 'seen' && stage !== 'continue') return '';
    if (scope !== 'first' && scope !== 'milestone' && scope !== 'full') return '';
    return enqueue('quote_scope_' + stage, { cta:'configurator', variant:scope });
  }

  function pendingRevoke() {
    var pending = get(PENDING_REVOKE_KEY, null);
    return pending && /^v[0-9a-f]{18}$/.test(String(pending.visitor_id || '')) &&
      /^[0-9a-f]{64}$/.test(String(pending.deletion_secret || '')) ? pending : null;
  }
  function sameRevokeProof(left, right) {
    return !!left && !!right && left.visitor_id === right.visitor_id &&
      left.deletion_secret === right.deletion_secret;
  }
  function queueFallbackRevoke(proof) {
    if (!proof || revokeFallbackQueue.some(function (item) {
      return sameRevokeProof(item, proof);
    })) return;
    revokeFallbackQueue.push(proof);
  }
  function nextRevokeProof() {
    return pendingRevoke() || revokeFallbackQueue[0] || null;
  }
  function sendPendingRevoke() {
    var pending = nextRevokeProof();
    if (!pending) return Promise.resolve(true);
    if (revokePromise) return revokePromise;
    var completed = false;
    var body = JSON.stringify({
      schema_version: SCHEMA_VERSION,
      visitor_id: pending.visitor_id,
      deletion_secret: pending.deletion_secret
    });
    var request = fetch(API + '/analytics/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      credentials: 'omit', keepalive: true, body: body
    }).then(function (response) {
      if (!response.ok) throw new Error('revoke_failed');
      completed = true;
      var current = pendingRevoke();
      if (sameRevokeProof(current, pending)) del(PENDING_REVOKE_KEY);
      revokeFallbackQueue = revokeFallbackQueue.filter(function (item) {
        return !sameRevokeProof(item, pending);
      });
      var durable = deletionProof('');
      if (sameRevokeProof(durable, pending)) del(DELETE_KEY);
      return true;
    }).catch(function () {
      queueFallbackRevoke(pending);
      setTimeout(sendPendingRevoke, 15000);
      return false;
    }).finally(function () {
      if (revokePromise === request) {
        revokePromise = null;
        // A second identity may have been revoked while this request was in
        // flight. Drain that durable proof now instead of waiting for reload.
        if (completed && nextRevokeProof()) sendPendingRevoke();
      }
    });
    revokePromise = request;
    return request;
  }
  function beginRevoke() {
    consentGeneration += 1;
    flushToken += 1;
    flushing = false;
    abortCollectionRequests();
    var unsent = queue();
    var storedProof = deletionProof(get('salon_vid', ''));
    var id = (storedProof && storedProof.visitor_id) || get('salon_vid', '') ||
      (unsent[0] && unsent[0].visitor_id) || '';
    var secret = (storedProof && storedProof.deletion_secret) ||
      (unsent[0] && unsent[0].deletion_secret) || '';
    var proofPersisted = false;
    if (/^v[0-9a-f]{18}$/.test(String(id || '')) && /^[0-9a-f]{64}$/.test(String(secret || ''))) {
      var proof = {
        schema_version: SCHEMA_VERSION, visitor_id: id, deletion_secret: secret,
        requested_at: new Date().toISOString()
      };
      proofPersisted = set(PENDING_REVOKE_KEY, proof) === true;
      if (!proofPersisted) queueFallbackRevoke(proof);
    }
    saveQueue([]);
    clearGrant();
    grantPromise = null;
    del(SEQUENCE_KEY);
    if (proofPersisted) del(DELETE_KEY);
    del('salon_vid');
    return sendPendingRevoke();
  }

  var started = false;
  function start(newGrant) {
    if (started || !allowed()) return;
    started = true;
    enqueue('page_view', {}, newGrant === true);
  }

  var originalSave = Salon.consent.save;
  Salon.consent.save = function saveAnalyticsChoice(value, source) {
    if (value !== true) {
      started = false;
      beginRevoke();
    }
    var result = originalSave.call(Salon.consent, value, source);
    if (value === true) start(true);
    return result;
  };
  document.addEventListener('salon:consent', function (event) {
    if (event.detail && event.detail.analytics === true) start(true);
    else {
      started = false;
      beginRevoke();
    }
  });

  Salon.visit = {
    mark: function (step) {
      var raw = String(step || '').toLowerCase();
      if (raw.indexOf('js: ') === 0) {
        var match = /^js:\s*(type_error|reference_error|syntax_error|security_error|network_error|runtime_error)\b/.exec(raw);
        enqueue('js_error', { error_type: match ? match[1] : 'runtime_error' });
        return;
      }
      var name = '';
      try { name = Salon.analyticsPrivacy.mark(step); } catch (error) {}
      if (name && EVENT_NAMES[name]) enqueue(name, {});
    },
    order: function () { enqueue('submit_success', {}); },
    event: function (name, detail) {
      var item = null;
      try { item = Salon.analyticsPrivacy.event(name, detail || {}); } catch (error) {}
      if (item && EVENT_NAMES[item.name]) {
        enqueue(item.name, { cta: item.cta || '', variant: item.variant || '' });
      }
    }
  };

  window.addEventListener('online', flush);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
  Salon.analyticsV2 = {
    schemaVersion: SCHEMA_VERSION,
    release: RELEASE,
    flush: flush,
    quoteScope: quoteScope
  };

  sendPendingRevoke();
  if (allowed()) start(false);
  else if (queue().length || get(DELETE_KEY, '') || get('salon_vid', '')) beginRevoke();
})();
