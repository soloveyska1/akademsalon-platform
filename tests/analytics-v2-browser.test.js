const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../assets/js/analytics-v2.js'), 'utf8');

function runtime(analytics = true, shared = {}) {
  const values = shared.values || new Map();
  const listeners = new Map();
  const windowListeners = new Map();
  const calls = shared.calls || [];
  const state = shared.state || { uuid: 0, randomByte: 6 };
  const vendor = shared.vendor || { stops: 0 };
  const consent = { v: 3, analytics, at: new Date(Date.now() - 60_000).toISOString() };
  const storage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
  class TestAbortController {
    constructor() { this.signal = { aborted: false }; }
    abort() { this.signal.aborted = true; }
  }
  const location = {
    protocol: 'https:', hostname: 'akademsalon.ru',
    pathname: shared.pathname || '/services.html', search: shared.search || '',
    hash: shared.hash || '', origin: 'https://akademsalon.ru',
  };
  const context = {
    window: {},
    location,
    history: {
      state: null,
      replaceState(_state, _title, value) {
        const url = new URL(value, location.origin);
        location.pathname = url.pathname;
        location.search = url.search;
        location.hash = url.hash;
      },
    },
    performance: { timeOrigin: Date.now() - 5_000 },
    localStorage: storage,
    sessionStorage: storage,
    URL, URLSearchParams,
    TextEncoder,
    AbortController: TestAbortController,
    document: {
      referrer: '', visibilityState: 'visible',
      addEventListener(name, fn) { listeners.set(name, fn); },
    },
    CustomEvent: function CustomEvent(type, options) { this.type = type; this.detail = options.detail; },
    crypto: {
      randomUUID() {
        state.uuid += 1;
        return `00000000-0000-4000-8000-${String(state.uuid).padStart(12, '0')}`;
      },
      getRandomValues(bytes) {
        state.randomByte += 1;
        bytes.fill(state.randomByte);
        return bytes;
      },
    },
    fetch(url, options) {
      calls.push({ url, options });
      if (typeof shared.fetch === 'function') return shared.fetch(url, options);
      if (url === '/api/analytics/grant') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
          ok: true, grant: 'signed-test-grant',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
        ok: true,
        processed: JSON.parse(options.body).events?.map((event) => event.event_id) || [],
      }) });
    },
    setTimeout() { return 1; }, clearTimeout() {},
    addEventListener(name, fn) { windowListeners.set(name, fn); },
    Salon: {
      store: {
        get(key, fallback) { const value = storage.getItem(key); return value == null ? fallback : JSON.parse(value); },
        set(key, value) {
          if (shared.failSetKey === key) return false;
          storage.setItem(key, JSON.stringify(value));
          return true;
        },
        del(key) { storage.removeItem(key); },
      },
      consent: {
        allowed: () => consent.analytics,
        read: () => consent,
        save(value) { consent.analytics = value === true; return consent; },
      },
      attribution: { ref: () => shared.attribution || '' },
      metrika: { stop() { vendor.stops += 1; } },
      analyticsPrivacy: {
        page: () => '/services.html',
        mark: (value) => value === 'cta: конфигуратор' ? 'cta_configurator' : '',
        event: (name, detail) => ({ name, cta: detail.cta, variant: detail.variant || '' }),
      },
      visit: { mark() {}, order() {}, event() {} },
    },
  };
  if (shared.originalUrl) context.__salonAnalyticsOriginalUrl = shared.originalUrl;
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'analytics-v2.js' });
  return { context, calls, values, consent, listeners, windowListeners, vendor };
}

async function settle() {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

test('consented page creates one idempotent page view with cookieless delivery', async () => {
  const r = runtime(true);
  await settle();
  assert.equal(r.calls.length, 2);
  const grantCall = r.calls.find((call) => call.url === '/api/analytics/grant');
  const call = r.calls.find((item) => item.url === '/api/analytics/events');
  assert.ok(grantCall);
  assert.equal(call.url, '/api/analytics/events');
  assert.equal(call.options.credentials, 'omit');
  const payload = JSON.parse(call.options.body);
  assert.equal(payload.grant, 'signed-test-grant');
  assert.equal(payload.events.length, 1);
  assert.equal(payload.events[0].event, 'page_view');
  assert.match(payload.events[0].event_id, /^[0-9a-f-]{36}$/);
  assert.equal(payload.events[0].page, '/services.html');
  assert.match(payload.events[0].occurred_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(payload.events[0].client_sequence, 1);
  assert.equal(JSON.stringify(payload).includes('contact'), false);
});

test('without consent no analytics event is sent', async () => {
  const r = runtime(false);
  await settle();
  assert.equal(r.calls.length, 0);
});

test('a pre-confirmed owner device and session QA never start collection', async () => {
  for (const [key, value] of [
    ['salon_analytics_owner_device_v1', JSON.stringify({ v: 1 })],
    ['salon_analytics_qa_session_v1', '1'],
  ]) {
    const values = new Map([[key, value]]);
    const r = runtime(true, { values });
    await settle();
    assert.equal(r.calls.length, 0, key);
    assert.equal(r.vendor.stops, 1, key);
    assert.equal(r.consent.analytics, true, 'saved consent choice is not rewritten');
  }
});

test('owner retention preview is GET-only and leaves seeded analytics identity untouched', async () => {
  const values = new Map([
    ['salon_analytics_owner_device_v1', JSON.stringify({ v: 1 })],
    ['salon_vid', JSON.stringify(`v${'a'.repeat(18)}`)],
    ['salon_analytics_delete_v2', JSON.stringify({
      visitor_id: `v${'a'.repeat(18)}`, deletion_secret: 'b'.repeat(64),
    })],
    ['salon_analytics_sequence_v2', JSON.stringify({ value: 7 })],
  ]);
  const before = [...values.entries()];
  const r = runtime(true, {
    values,
    pathname: '/configurator.html',
    search: '?desktop-preview=1&offer_preview=retention',
    originalUrl: '/configurator.html?offer_preview=retention',
  });
  await settle();
  assert.deepEqual([...r.values.entries()], before);
  assert.equal(r.calls.length, 0);
  assert.equal(r.vendor.stops, 1);
  assert.equal(r.context.location.search, '?offer_preview=retention');
});

test('late authenticated owner confirmation revokes the anonymous identity and stays silent', async () => {
  const r = runtime(true);
  await settle();
  assert.ok(r.calls.some((call) => call.url === '/api/analytics/events'));
  r.values.set('salon_analytics_owner_device_v1', JSON.stringify({ v: 1 }));
  const exclude = r.windowListeners.get('salon:analytics-exclusion');
  assert.equal(typeof exclude, 'function');
  exclude(new r.context.CustomEvent('salon:analytics-exclusion', { detail: { role: 'owner' } }));
  await settle();
  assert.ok(r.calls.some((call) => call.url === '/api/analytics/revoke'));
  assert.equal(r.vendor.stops, 1);
  const before = r.calls.length;
  r.context.Salon.visit.event('first_input', { cta: 'calculator' });
  await settle();
  assert.equal(r.calls.length, before);
  assert.equal(r.consent.analytics, true);
  assert.equal(r.values.has('salon_analytics_owner_device_v1'), true);
});

test('native owner marker from another tab revokes and stops vendor analytics', async () => {
  const r = runtime(true);
  await settle();
  r.values.set('salon_analytics_owner_device_v1', JSON.stringify({ v: 1 }));
  const storage = r.windowListeners.get('storage');
  assert.equal(typeof storage, 'function');
  storage({ key: 'salon_analytics_owner_device_v1' });
  await settle();
  assert.equal(r.vendor.stops, 1);
  assert.ok(r.calls.some((call) => call.url === '/api/analytics/revoke'));
  const before = r.calls.length;
  r.context.Salon.visit.event('first_input', { cta: 'calculator' });
  await settle();
  assert.equal(r.calls.length, before);
});

test('arbitrary UTM text never becomes a stored campaign dimension', async () => {
  const r = runtime(true, {
    attribution: 'utm_source=semen_semenov&utm_medium=private_note&utm_campaign=phone_79991234567',
  });
  await settle();
  const call = r.calls.find((item) => item.url === '/api/analytics/events');
  const sourceValue = JSON.parse(call.options.body).events[0].source;
  assert.deepEqual(sourceValue, { kind: 'direct', name: 'direct', medium: '', campaign: '' });
  assert.equal(JSON.stringify(sourceValue).includes('semen'), false);
  assert.equal(JSON.stringify(sourceValue).includes('7999'), false);
});

test('revocation sends only deletion proof, clears queue and rotates identity', async () => {
  const r = runtime(true);
  await settle();
  const oldVisitor = JSON.parse(r.values.get('salon_vid'));
  r.context.Salon.consent.save(false, 'settings');
  await settle();
  assert.ok(r.calls.some((call) => call.url === '/api/analytics/revoke'));
  assert.equal(r.values.has('salon_analytics_queue_v2'), false);
  assert.equal(r.values.has('salon_vid'), false);
  assert.equal(r.values.has('salon_analytics_sequence_v2'), false);
  assert.equal(r.values.has('salon_analytics_grant_v2'), false);
  r.context.Salon.consent.save(true, 'settings');
  await settle();
  const newVisitor = JSON.parse(r.values.get('salon_vid'));
  assert.notEqual(newVisitor, oldVisitor);
});

test('21 page navigations reuse one session grant and preserve client order', async () => {
  const shared = { values: new Map(), calls: [], state: { uuid: 0, randomByte: 6 } };
  for (let index = 0; index < 21; index += 1) {
    runtime(true, shared);
    assert.equal(JSON.parse(shared.values.get('salon_analytics_sequence_v2')).value, index + 1);
    await settle();
  }
  const grantCalls = shared.calls.filter((call) => call.url === '/api/analytics/grant');
  const eventCalls = shared.calls.filter((call) => call.url === '/api/analytics/events');
  assert.equal(grantCalls.length, 1);
  assert.equal(eventCalls.length, 21);
  const deliveredSequences = eventCalls.flatMap((call) => (
    JSON.parse(call.options.body).events.map((event) => event.client_sequence)
  ));
  assert.deepEqual(
    [...new Set(deliveredSequences)].sort((left, right) => left - right),
    Array.from({ length: 21 }, (_, index) => index + 1),
  );
});

test('expired consent still revokes by the durable visitor and deletion-secret pair', async () => {
  const visitor = `v${'a'.repeat(18)}`;
  const secret = 'b'.repeat(64);
  const values = new Map([[
    'salon_analytics_delete_v2',
    JSON.stringify({ visitor_id: visitor, deletion_secret: secret }),
  ]]);
  const r = runtime(false, { values, calls: [], state: { uuid: 0, randomByte: 6 } });
  await settle();
  const revoke = r.calls.find((call) => call.url === '/api/analytics/revoke');
  assert.ok(revoke);
  assert.deepEqual(JSON.parse(revoke.options.body), {
    schema_version: 2, visitor_id: visitor, deletion_secret: secret,
  });
  assert.equal(values.has('salon_analytics_delete_v2'), false);
  assert.equal(values.has('salon_analytics_revoke_pending'), false);
});

test('revocation aborts an in-flight grant and late response cannot restore or send', async () => {
  let resolveGrant;
  const grantResponse = new Promise((resolve) => { resolveGrant = resolve; });
  const shared = {
    values: new Map(), calls: [], state: { uuid: 0, randomByte: 6 },
    fetch(url, options) {
      if (url === '/api/analytics/grant') return grantResponse;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
    },
  };
  const r = runtime(true, shared);
  const grantCall = shared.calls.find((call) => call.url === '/api/analytics/grant');
  assert.ok(grantCall);
  r.context.Salon.consent.save(false, 'settings');
  assert.equal(grantCall.options.signal.aborted, true);
  resolveGrant({ ok: true, status: 200, json: () => Promise.resolve({
    ok: true, grant: 'late-signed-grant', expires_at: Math.floor(Date.now() / 1000) + 3600,
  }) });
  await settle();
  assert.equal(shared.calls.filter((call) => call.url === '/api/analytics/events').length, 0);
  assert.equal(shared.values.has('salon_analytics_grant_v2'), false);
  assert.equal(shared.values.has('salon_analytics_queue_v2'), false);
});

test('two identities revoked during one in-flight request are both sent in order', async () => {
  let resolveFirstRevoke;
  let revokeCount = 0;
  const firstRevoke = new Promise((resolve) => { resolveFirstRevoke = resolve; });
  const shared = {
    values: new Map(), calls: [], state: { uuid: 0, randomByte: 6 },
    fetch(url, options) {
      if (url === '/api/analytics/revoke') {
        revokeCount += 1;
        if (revokeCount === 1) return firstRevoke;
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
      }
      if (url === '/api/analytics/grant') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
          ok: true, grant: 'signed-test-grant',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
        ok: true, processed: JSON.parse(options.body).events?.map((event) => event.event_id) || [],
      }) });
    },
  };
  const r = runtime(true, shared);
  await settle();
  const visitorA = JSON.parse(shared.values.get('salon_vid'));
  r.context.Salon.consent.save(false, 'settings');
  const firstCall = shared.calls.find((call) => call.url === '/api/analytics/revoke');
  assert.equal(JSON.parse(firstCall.options.body).visitor_id, visitorA);

  r.context.Salon.consent.save(true, 'settings');
  await settle();
  const visitorB = JSON.parse(shared.values.get('salon_vid'));
  assert.notEqual(visitorB, visitorA);
  r.context.Salon.consent.save(false, 'settings');
  assert.equal(shared.calls.filter((call) => call.url === '/api/analytics/revoke').length, 1);

  resolveFirstRevoke({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
  await settle();
  const revokeCalls = shared.calls.filter((call) => call.url === '/api/analytics/revoke');
  assert.equal(revokeCalls.length, 2);
  assert.equal(JSON.parse(revokeCalls[1].options.body).visitor_id, visitorB);
  assert.equal(shared.values.has('salon_analytics_revoke_pending'), false);
});

test('failed pending-revoke storage keeps durable proof and still sends it directly', async () => {
  let resolveRevoke;
  const revokeResponse = new Promise((resolve) => { resolveRevoke = resolve; });
  const shared = {
    values: new Map(), calls: [], state: { uuid: 0, randomByte: 6 },
    fetch(url, options) {
      if (url === '/api/analytics/revoke') return revokeResponse;
      if (url === '/api/analytics/grant') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
          ok: true, grant: 'signed-test-grant',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
    },
  };
  const r = runtime(true, shared);
  await settle();
  const durable = JSON.parse(shared.values.get('salon_analytics_delete_v2'));
  shared.failSetKey = 'salon_analytics_revoke_pending';
  r.context.Salon.consent.save(false, 'settings');
  const revokeCall = shared.calls.find((call) => call.url === '/api/analytics/revoke');
  assert.ok(revokeCall);
  assert.equal(shared.values.has('salon_analytics_revoke_pending'), false);
  assert.deepEqual(JSON.parse(shared.values.get('salon_analytics_delete_v2')), durable);
  assert.equal(JSON.parse(revokeCall.options.body).visitor_id, durable.visitor_id);

  resolveRevoke({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
  await settle();
  assert.equal(shared.values.has('salon_analytics_delete_v2'), false);
});

test('grant budget exhaustion clears cached token and the queued event gets a fresh grant', async () => {
  let grantNumber = 0;
  let eventNumber = 0;
  const shared = {
    values: new Map(), calls: [], state: { uuid: 0, randomByte: 6 },
    fetch(url, options) {
      if (url === '/api/analytics/grant') {
        grantNumber += 1;
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
          ok: true,
          grant: `signed-test-grant-${grantNumber}`,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        }) });
      }
      eventNumber += 1;
      if (eventNumber === 1) {
        return Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({
          ok: false, error: 'grant_budget_exhausted',
        }) });
      }
      const ids = JSON.parse(options.body).events.map((event) => event.event_id);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
        ok: true, processed: ids,
      }) });
    },
  };
  const r = runtime(true, shared);
  await settle();
  assert.equal(grantNumber, 1);
  assert.equal(shared.values.has('salon_analytics_queue_v2'), true);
  for (let index = 0; index < 3 && grantNumber < 2; index += 1) {
    await settle();
    await r.context.Salon.analyticsV2.flush();
  }
  await settle();
  assert.equal(grantNumber, 2);
  assert.equal(shared.values.has('salon_analytics_queue_v2'), false);
  const cached = JSON.parse(shared.values.get('salon_analytics_grant_v2'));
  assert.equal(cached.grant, 'signed-test-grant-2');
});
