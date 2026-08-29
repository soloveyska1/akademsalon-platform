const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const analyticsSource = read('assets/js/analytics-v2.js');
const configurator = read('configurator.html');
const contractText = read('analytics/contract.json');
const contract = JSON.parse(contractText);

function runtime(analytics) {
  const values = new Map();
  const calls = [];
  let uuid = 0;
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
  const context = {
    window: {},
    location: {
      protocol: 'https:', hostname: 'akademsalon.ru', pathname: '/configurator.html',
      search: '', origin: 'https://akademsalon.ru',
    },
    performance: { timeOrigin: Date.now() - 5_000 },
    localStorage: storage,
    sessionStorage: storage,
    URLSearchParams,
    TextEncoder,
    AbortController: TestAbortController,
    document: { referrer: '', visibilityState: 'visible', addEventListener() {} },
    crypto: {
      randomUUID() {
        uuid += 1;
        return `00000000-0000-4000-8000-${String(uuid).padStart(12, '0')}`;
      },
      getRandomValues(bytes) { bytes.fill(7); return bytes; },
    },
    fetch(url, options) {
      calls.push({ url, options });
      if (url === '/api/analytics/grant') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
          ok: true, grant: 'quote-scope-test-grant',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        }) });
      }
      const body = JSON.parse(options.body);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
        ok: true, processed: body.events?.map((event) => event.event_id) || [],
      }) });
    },
    setTimeout() { return 1; },
    clearTimeout() {},
    addEventListener() {},
    Salon: {
      store: {
        get(key, fallback) {
          const value = storage.getItem(key);
          return value == null ? fallback : JSON.parse(value);
        },
        set(key, value) { storage.setItem(key, JSON.stringify(value)); return true; },
        del(key) { storage.removeItem(key); },
      },
      consent: { allowed: () => consent.analytics, read: () => consent },
      attribution: { ref: () => '' },
      analyticsPrivacy: { page: () => '/configurator.html', mark: () => '', event: () => null },
      visit: { mark() {}, order() {}, event() {} },
    },
  };
  context.window = context;
  vm.runInNewContext(analyticsSource, context, { filename: 'analytics-v2.js' });
  return { context, calls };
}

async function settle() {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

function deliveredEvents(calls) {
  return calls
    .filter((call) => call.url === '/api/analytics/events')
    .flatMap((call) => JSON.parse(call.options.body).events || []);
}

test('contract adds only bounded quote-scope progress events outside the strict funnel', () => {
  assert.equal(contract.contract_version, '2.4.0');
  assert.deepEqual(contract.events.quote_scope_seen, {
    label: 'Показан выбор объёма сметы', group: 'progress',
  });
  assert.deepEqual(contract.events.quote_scope_continue, {
    label: 'Выбранный объём сметы продолжен', group: 'progress',
  });
  for (const value of ['first', 'milestone', 'full']) {
    assert.ok(contract.variant_exact.includes(value));
  }
  const funnelEvents = contract.funnel.flatMap((stage) => stage.events);
  assert.equal(funnelEvents.includes('quote_scope_seen'), false);
  assert.equal(funnelEvents.includes('quote_scope_continue'), false);
});

test('consented quote-scope helper accepts two fixed stages and three fixed values only', async () => {
  const r = runtime(true);
  await settle();
  for (const [stage, scope] of [
    ['seen', 'first'], ['continue', 'full'], ['change', 'milestone'],
    ['seen', 'contact@example.com'], ['continue', 'full\nphone=79990000000'],
  ]) {
    r.context.Salon.analyticsV2.quoteScope(stage, scope);
    await settle();
  }
  const scoped = deliveredEvents(r.calls).filter((event) => event.event.startsWith('quote_scope_'));
  assert.deepEqual(scoped.map((event) => ({
    event: event.event, cta: event.cta_id, variant: event.variant,
  })), [
    { event: 'quote_scope_seen', cta: 'configurator', variant: 'first' },
    { event: 'quote_scope_continue', cta: 'configurator', variant: 'full' },
  ]);
  assert.doesNotMatch(JSON.stringify(scoped), /contact|phone|7999/);
});

test('quote-scope helper remains silent without analytics consent', async () => {
  const r = runtime(false);
  r.context.Salon.analyticsV2.quoteScope('seen', 'first');
  r.context.Salon.analyticsV2.quoteScope('continue', 'milestone');
  await settle();
  assert.equal(r.calls.length, 0);
});

test('configurator records exposure and carried value once without changing the UI contract', () => {
  assert.match(configurator, /var quoteScopeEventSeen = \{\};/);
  assert.match(configurator, /function trackQuoteScope\(stage,value\)/);
  assert.match(configurator, /var key = stage === 'seen' \? stage : stage \+ ':' \+ scope;/);
  assert.match(configurator, /Salon\.analyticsV2\.quoteScope\(stage,scope\)/);
  assert.match(configurator, /trackQuoteScope\('seen',state\.quoteScope\)/);
  assert.match(configurator, /trackQuoteScope\('continue',state\.quoteScope\)/);
  assert.match(configurator, /analytics-v2\.js\?v=20260829analytics4/);
  assert.match(configurator, /Смета до сдачи \/ защиты/);
  assert.match(configurator, /после просмотра материалов/);
});

test('installer pins the expanded contract bytes for a backend-first release', () => {
  const digest = crypto.createHash('sha256').update(contractText).digest('hex');
  const installer = read('backend/salon_bot/install_analytics_v2.py');
  assert.match(installer, new RegExp(`KNOWN_CONTRACT_SHA256 = "${digest}"`));
});
