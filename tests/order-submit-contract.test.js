const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
const configurator = fs.readFileSync(path.join(root, 'configurator.html'), 'utf8');
const extras = fs.readFileSync(path.join(root, 'assets/js/extras.js'), 'utf8');
const homeBundle = fs.readFileSync(path.join(root, 'assets/js/home-release.min.js'), 'utf8');
const productionSmokeSource = fs.readFileSync(path.join(root, 'tests/production-smoke.js'), 'utf8');
const { REPO_CONSENT, assertReadOnly, createSmoke } = require('./production-smoke');
const orderContractSource = app.slice(
  app.indexOf('/* order-contract:start */'), app.indexOf('/* order-contract:end */'),
);

function loadFactory() {
  const startMarker = '/* order-contract:start */';
  const endMarker = '/* order-contract:end */';
  const start = app.indexOf(startMarker);
  const end = app.indexOf(endMarker);
  assert.notEqual(start, -1, 'в app.js нет начала pure order-contract factory');
  assert.ok(end > start, 'в app.js нет конца pure order-contract factory');
  const source = app.slice(start + startMarker.length, end) +
    '\nthis.__createOrderContract = createOrderContract;';
  const context = {};
  vm.runInNewContext(source, context, { filename: 'assets/js/app.js#order-contract' });
  return context.__createOrderContract;
}

function loadAuthContextMatcher() {
  const startMarker = '/* auth-status-contract:start */';
  const endMarker = '/* auth-status-contract:end */';
  const start = app.indexOf(startMarker);
  const end = app.indexOf(endMarker);
  assert.notEqual(start, -1, 'нет начала pure auth status contract');
  assert.ok(end > start, 'нет конца pure auth status contract');
  const source = app.slice(start + startMarker.length, end) +
    '\nthis.__sameAuthContext = sameAuthContext;';
  const context = {};
  vm.runInNewContext(source, context, { filename: 'assets/js/app.js#auth-status-contract' });
  return context.__sameAuthContext;
}

function fakeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    entries() { return [...values.entries()]; },
  };
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function fingerprint(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function makeContract(options = {}) {
  const requests = [];
  let sequence = 0;
  const storage = options.storage || fakeStorage();
  const factory = loadFactory();
  const contract = factory({
    storage,
    makeId: options.makeId || (() => `request-${String(++sequence).padStart(4, '0')}`),
    base: '/api',
    headers: options.headers || (() => ({ 'X-Test': '1' })),
    fingerprint: options.fingerprint || (async (payload) => fingerprint(payload)),
    statusContext: options.statusContext || (() => ({
      generation: 1, logicalToken: '__cookie__', impersonationToken: null, csrfToken: 'csrf-1',
    })),
    onStatus: options.onStatus || (() => {}),
    fetch: options.fetch || (async (url, init) => {
      requests.push({ url, init });
      return { status: 200, json: async () => ({ ok: true, id: 17 }) };
    }),
    setTimeout: options.setTimeout || setTimeout,
    clearTimeout: options.clearTimeout || clearTimeout,
  });
  return { contract, requests, storage };
}

test('the two public producers use one frozen v2 contract and no parallel JSON truth', () => {
  const { contract } = makeContract();
  assert.deepEqual(Object.keys(contract.producers).sort(), ['configurator', 'guide_microlead']);
  assert.equal(contract.producers.configurator.storageKey, 'salon_pending_request_v2');
  assert.equal(contract.producers.guide_microlead.storageKey, 'salon_pending_guide_request_v2');
  assert.equal(Object.isFrozen(contract.producers), true);
  assert.equal(fs.existsSync(path.join(root, 'docs/brain/contracts/ORDER-SUBMIT.json')), false);
});

test('every tracked browser producer routes /orders through the canonical helper', () => {
  const files = childProcess.execFileSync('git', ['ls-files', '*.html', 'assets/js/*.js'], {
    cwd: root, encoding: 'utf8',
  }).trim().split('\n').filter(Boolean);
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /\.post\(\s*['"]\/orders['"]/, `${file}: direct api.post(/orders)`);
    assert.doesNotMatch(source, /fetch\([^\n]{0,180}['"]\/orders['"]/, `${file}: direct fetch(/orders)`);
  }
  assert.equal((configurator.match(/S\.orderContract\.submit\('configurator'/g) || []).length, 1);
  assert.equal((extras.match(/S\.orderContract\.submit\('guide_microlead'/g) || []).length, 1);
  assert.doesNotMatch(configurator, /client_request_id\s*:/,
    'producer must not supply the helper-owned request id');
});

test('one atomic v2 session record binds producer, scope, id and fingerprint', async () => {
  const { contract, storage } = makeContract({
    fetch: async () => ({ status: 503, json: async () => ({ ok: false, error: 'later' }) }),
  });
  const attempt = await contract.submit('configurator', { topic: 'synthetic' }, 0);
  assert.equal(contract.classify(attempt), 'ambiguous');
  const entries = storage.entries();
  assert.equal(entries.length, 1, 'identity and fingerprint must not be torn across keys');
  assert.equal(entries[0][0], 'salon_pending_request_v2');
  assert.deepEqual(JSON.parse(entries[0][1]), {
    v: 2,
    producer: 'configurator',
    scope: 'configurator',
    id: attempt.clientRequestId,
    intent_sha256: fingerprint({ topic: 'synthetic' }),
  });
});

test('legacy v1 identity or fingerprint fails closed and is never rebound', async () => {
  for (const initial of [
    { salon_pending_request_v1: 'legacy-id' },
    { 'salon_pending_request_v1:intent_sha256': 'a'.repeat(64) },
    { 'salon_pending_guide_request_v1:guide-a.html': 'legacy-guide-id' },
  ]) {
    const { contract, requests, storage } = makeContract({ storage: fakeStorage(initial) });
    const guide = Object.keys(initial)[0].includes('guide');
    const attempt = await contract.submit(
      guide ? 'guide_microlead' : 'configurator', { topic: 'synthetic' }, 0,
      guide ? 'guide-a.html' : undefined,
    );
    assert.equal(attempt.contractError, 'legacy_request_pending');
    assert.equal(contract.classify(attempt), 'local_blocked');
    assert.equal(requests.length, 0);
    assert.equal(storage.entries().some(([key]) => key.endsWith('_v2')), false);
  }
});

test('corrupt, partial, foreign and future records all fail closed', async () => {
  const states = [
    '{',
    JSON.stringify({ v: 2, producer: 'configurator' }),
    JSON.stringify({ v: 3, producer: 'configurator', scope: 'configurator', id: 'request-0001', intent_sha256: 'a'.repeat(64) }),
    JSON.stringify({ v: 2, producer: 'guide_microlead', scope: 'configurator', id: 'request-0001', intent_sha256: 'a'.repeat(64) }),
    JSON.stringify({ v: 2, producer: 'configurator', scope: 'configurator', id: 'request-0001', intent_sha256: 'a'.repeat(64), extra: true }),
  ];
  for (const encoded of states) {
    const storage = fakeStorage({ salon_pending_request_v2: encoded });
    const { contract, requests } = makeContract({ storage });
    const attempt = await contract.submit('configurator', { topic: 'synthetic' }, 0);
    assert.equal(attempt.contractError, 'request_state_corrupt');
    assert.equal(requests.length, 0);
  }
});

test('storage, fingerprint, header and secure-id failures are shaped before network', async () => {
  const brokenStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
  const cases = [
    { options: { storage: brokenStorage }, error: 'storage_unavailable' },
    { options: { fingerprint: () => { throw new Error('crypto'); } }, error: 'intent_fingerprint_unavailable' },
    { options: { makeId: () => '' }, error: 'request_id_unavailable' },
    { options: { headers: () => { throw new Error('auth'); } }, error: 'headers_unavailable' },
    { options: { statusContext: () => { throw new Error('auth'); } }, error: 'auth_context_unavailable' },
  ];
  for (const item of cases) {
    const { contract, requests } = makeContract(item.options);
    const attempt = await contract.submit('configurator', { topic: 'synthetic' }, 0);
    assert.equal(attempt.contractError, item.error);
    assert.equal(contract.classify(attempt), 'local_blocked');
    assert.equal(requests.length, 0);
  }
  assert.doesNotMatch(orderContractSource, /Math\.random/);
  assert.match(app, /crypto\.getRandomValues/);
});

test('success accepts only a safe positive integer or its canonical decimal string', () => {
  const { contract } = makeContract();
  for (const id of [1, 42, Number.MAX_SAFE_INTEGER, '1', '9042', String(Number.MAX_SAFE_INTEGER)]) {
    assert.equal(contract.isConfirmed({ st: 200, r: { ok: true, id } }), true, String(id));
  }
  for (const id of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '0', '01',
    '9007199254740992', '9'.repeat(200), 'unknown', '', null]) {
    assert.equal(contract.isConfirmed({ st: 200, r: { ok: true, id } }), false, String(id));
  }
});

test('outcomes distinguish terminal rejection, conflict, ambiguity and local block', () => {
  const { contract } = makeContract();
  assert.equal(contract.classify({ st: 200, r: { ok: true, id: 42 } }), 'confirmed');
  assert.equal(contract.classify({ st: 400, r: { ok: false } }), 'definitive_rejection');
  assert.equal(contract.classify({ st: 200, r: { ok: false } }), 'definitive_rejection');
  assert.equal(contract.classify({ st: 409, r: { ok: false } }), 'conflict');
  assert.equal(contract.classify({ st: 0, r: null, contractError: 'intent_changed' }), 'conflict');
  assert.equal(contract.classify({ st: 0, r: null, contractError: 'storage_unavailable' }), 'local_blocked');
  for (const st of [0, 408, 425, 429, 500, 503]) {
    assert.equal(contract.classify({ st, r: { ok: false } }), 'ambiguous');
  }
});

test('fingerprint follows JSON wire semantics and ignores object key order', async () => {
  const calls = [];
  const { contract } = makeContract({
    fetch: async (url, init) => {
      calls.push(JSON.parse(init.body));
      return { status: 503, json: async () => ({ ok: false }) };
    },
  });
  await contract.submit('guide_microlead', { topic: 'same', nested: { b: 2, a: 1 }, values: [] }, 0, 'guide-a.html');
  await contract.submit('guide_microlead', { values: [], nested: { a: 1, b: 2 }, topic: 'same' }, 0, 'guide-a.html');
  assert.equal(calls.length, 2, 'same JSON intent may retry with the same durable identity');
  assert.equal(calls[0].client_request_id, calls[1].client_request_id);

  /* Изменённое намерение больше не запирает форму, а РОТИРУЕТ номер попытки.
     Отпечаток по-прежнему различает [] и [undefined] — просто наблюдаемый
     результат другой: не отказ, а новая попытка с новым номером. */
  const changed = await contract.submit(
    'guide_microlead', { topic: 'same', nested: { a: 1, b: 2 }, values: [undefined] }, 0, 'guide-a.html',
  );
  assert.equal(changed.contractError, undefined, '[] and [undefined] are a new intent, not a lockout');
  assert.equal(calls.length, 3, 'changed intent reaches the server');
  assert.notEqual(
    calls[2].client_request_id, calls[0].client_request_id,
    'changed intent carries a fresh identity',
  );
});

test('producer-supplied request identity and unserializable payload fail before fetch', async () => {
  const { contract, requests } = makeContract();
  const owned = await contract.submit('configurator', {
    topic: 'synthetic', client_request_id: 'producer-owned',
  }, 0);
  assert.equal(owned.contractError, 'producer_request_id_forbidden');
  const circular = {}; circular.self = circular;
  const invalid = await contract.submit('configurator', circular, 0);
  assert.equal(invalid.contractError, 'payload_unserializable');
  assert.equal(requests.length, 0);
});

test('concurrent identical submits are single-flight and cause one physical POST', async () => {
  const requests = [];
  let release;
  const { contract } = makeContract({
    fetch: (url, init) => {
      requests.push({ url, init });
      return new Promise((resolve) => { release = resolve; });
    },
  });
  const first = contract.submit('configurator', { topic: 'synthetic' }, 0);
  const second = contract.submit('configurator', { topic: 'synthetic' }, 0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 1);
  release({ status: 200, json: async () => ({ ok: true, id: 18 }) });
  const [a, b] = await Promise.all([first, second]);
  assert.equal(contract.classify(a), 'confirmed');
  assert.equal(contract.classify(b), 'confirmed');
  assert.equal(a.clientRequestId, b.clientRequestId);
});

test('soft timeout never aborts POST and retry joins the still-live request', async () => {
  const requests = [];
  let release;
  let fireTimeout;
  const { contract } = makeContract({
    fetch: (url, init) => {
      requests.push({ url, init });
      return new Promise((resolve) => { release = resolve; });
    },
    setTimeout: (callback) => { fireTimeout = callback; return 1; },
    clearTimeout: () => {},
  });
  const firstPending = contract.submit('guide_microlead', { topic: 'same' }, 10, 'guide-a.html');
  await new Promise((resolve) => setImmediate(resolve));
  fireTimeout();
  const timed = await firstPending;
  assert.equal(timed.timedOut, true);
  const retry = contract.submit('guide_microlead', { topic: 'same' }, 0, 'guide-a.html');
  assert.equal(requests.length, 1);
  assert.equal('signal' in requests[0].init, false, 'POST is never aborted after a soft timeout');
  release({ status: 200, json: async () => ({ ok: true, id: 19 }) });
  assert.equal(contract.classify(await retry), 'confirmed');
  assert.equal(requests.length, 1);
});

test('changed concurrent intent conflicts while the original flight continues', async () => {
  let release;
  const { contract, requests } = makeContract({
    fetch: (url, init) => {
      requests.push({ url, init });
      return new Promise((resolve) => { release = resolve; });
    },
  });
  const original = contract.submit('configurator', { topic: 'first' }, 0);
  const changed = await contract.submit('configurator', { topic: 'second' }, 0);
  assert.equal(changed.contractError, 'intent_changed');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 1);
  release({ status: 503, json: async () => ({ ok: false }) });
  await original;
});

test('request state clears only by compare-and-swap with the exact terminal attempt id', async () => {
  const { contract, storage } = makeContract();
  const attempt = await contract.submit('configurator', { topic: 'synthetic' }, 0);
  assert.ok(contract.requestId('configurator'));
  assert.equal(contract.clear('configurator', undefined, 'another-request'), false);
  assert.equal(storage.entries().length, 1);
  assert.equal(contract.clear('configurator', undefined, attempt.clientRequestId), true);
  assert.equal(storage.entries().length, 0);
});

test('ambiguous failures retain identity across reload and changed intent rotates it', async () => {
  const storage = fakeStorage();
  const ids = [];
  const options = {
    storage,
    fetch: async (url, init) => {
      ids.push(JSON.parse(init.body).client_request_id);
      return { status: 503, json: async () => ({ ok: false, error: 'later' }) };
    },
  };
  await makeContract(options).contract.submit('configurator', { topic: 'same' }, 0);
  const reloaded = makeContract(options).contract;
  await reloaded.submit('configurator', { topic: 'same' }, 0);
  assert.equal(ids[0], ids[1]);
  /* Прежний контракт держал форму запертой: правка после неподтверждённой
     отправки не уходила вовсе, и человек читал «верните прежний вариант».
     Вернуть его он обычно не мог, а состояние живёт в sessionStorage и
     переживает перезагрузку — форма запиралась до закрытия вкладки.
     Теперь правка уходит с новым номером; идемпотентность продолжает
     работать там, где она и нужна, — на повторе ОДНОГО И ТОГО ЖЕ. */
  const changed = await reloaded.submit('configurator', { topic: 'changed' }, 0);
  assert.equal(changed.contractError, undefined);
  assert.equal(ids.length, 3, 'edited intent is sent instead of being blocked');
  /* Сравнивать ids[2] с ids[0] нельзя: поддельный генератор номеров в этом
     тесте начинает счёт заново на каждом «перезапуске» и честно выдаёт ту же
     строку. Проверяем по существу — повтор УЖЕ ИЗМЕНЁННОГО намерения обязан
     переиспользовать номер: значит ротация записала его как текущий. */
  const repeat = await reloaded.submit('configurator', { topic: 'changed' }, 0);
  assert.equal(repeat.contractError, undefined);
  assert.equal(ids.length, 4);
  assert.equal(ids[3], ids[2], 'the rotated identity became the durable one');
});

test('order transport invokes the shared status hook before reading a 401 body', async () => {
  const events = [];
  const { contract } = makeContract({
    onStatus: (status, endpoint, producer, context) => {
      events.push(['status', status, endpoint, producer, context]);
    },
    fetch: async () => ({
      status: 401,
      json: async () => { events.push(['json']); return { ok: false, error: 'unauthorized' }; },
    }),
  });
  const attempt = await contract.submit('configurator', { topic: 'synthetic' }, 0);
  assert.equal(contract.classify(attempt), 'definitive_rejection');
  assert.equal(events[0][0], 'status');
  assert.equal(events[1][0], 'json');
});

test('late 401 cannot clear a newer auth generation, token or impersonation context', () => {
  const sameAuthContext = loadAuthContextMatcher();
  const request = {
    generation: 7, logicalToken: '__cookie__', impersonationToken: null, csrfToken: 'csrf-old',
  };
  assert.equal(sameAuthContext(request, { ...request }), true);
  assert.equal(sameAuthContext(request, { ...request, generation: 8 }), false);
  assert.equal(sameAuthContext(request, { ...request, logicalToken: 'fresh-token' }), false);
  assert.equal(sameAuthContext(request, { ...request, impersonationToken: 'fresh-imp' }), false);
  assert.equal(sameAuthContext(request, { ...request, csrfToken: 'csrf-fresh' }), false);
});

test('producer UI clears identity only after confirmed or definitive terminal outcomes', () => {
  assert.match(configurator, /onSubmitOk\(a1\.r, a1\)/);
  assert.match(configurator, /classify\(attempt\) === 'definitive_rejection'/);
  assert.doesNotMatch(configurator, /function onSubmitErr[\s\S]{0,120}?clearRequestId\(\);/);
  assert.match(extras, /outcome === 'definitive_rejection'/);
  assert.match(extras, /clear\('guide_microlead', here, attempt\.clientRequestId\)/);
  /* Локальный замок guideIntent убран целиком: он повторял ту же ошибку —
     не давал отправить переписанный вопрос. Сбрасывать теперь нечего,
     поэтому проверяем обратное: замка в коде нет. */
  assert.doesNotMatch(extras, /guideIntent/);
});

test('generated home runtime remains in parity with the canonical helper', () => {
  assert.equal((app.match(/\/\* order-contract:start \*\//g) || []).length, 1);
  assert.equal((app.match(/Salon\.orderContract = createOrderContract\(/g) || []).length, 1);
  assert.match(homeBundle, /salon_pending_request_v2/);
  assert.match(homeBundle, /definitive_rejection/);
  const bundleContract = homeBundle.slice(
    homeBundle.indexOf('salon_pending_request_v2') - 500,
    homeBundle.indexOf('definitive_rejection') + 500,
  );
  assert.doesNotMatch(bundleContract, /Math\.random/);
});

test('every shared order-runtime consumer uses its current atomic cache wave', () => {
  const files = childProcess.execFileSync('git', ['ls-files', '*.html'], {
    cwd: root, encoding: 'utf8',
  }).trim().split('\n').filter(Boolean);
  let consumers = 0;
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const refs = [...source.matchAll(/assets\/js\/(app|extras|home-release\.min)\.js\?v=([^&"']+)/g)];
    for (const ref of refs) {
      consumers++;
      const expected = ref[1] === 'extras' ? '20260806shell123' : '20260806services115';
      assert.equal(ref[2], expected, `${file}: stale ${ref[1]} runtime cache key`);
    }
  }
  assert.ok(consumers >= 170, 'shared runtime consumer inventory unexpectedly shrank');
});

test('production smoke default run is mechanically read-only and never reaches /orders', async () => {
  const calls = [];
  const publicFields = {
    '/api/features': 'pay_online', '/api/plans': 'base_price', '/api/gift/config': 'presets',
    '/api/slots': 'quota', '/api/channel': 'posts', '/api/qa': 'items', '/api/reviews': 'reviews',
  };
  const protectedStatuses = {
    '/api/me': 401, '/api/bonus': 401, '/api/deposit': 401,
    '/api/admin/overview': 403, '/api/admin/orders?status=active': 403,
  };
  const transport = async (url, init) => {
    calls.push({ url, init });
    const parsed = new URL(url);
    if (parsed.pathname === '/configurator.html') {
      return {
        status: 200, ok: true,
        text: async () => `consent_doc: '${REPO_CONSENT}'`,
        json: async () => ({}),
      };
    }
    const route = parsed.pathname + parsed.search;
    if (publicFields[route]) {
      return { status: 200, ok: true, json: async () => ({ ok: true, [publicFields[route]]: [] }) };
    }
    if (protectedStatuses[route]) {
      return { status: protectedStatuses[route], ok: false, json: async () => ({ ok: false }) };
    }
    if (route === '/api/events?since=0') {
      return { status: 200, ok: true, json: async () => ({ ok: true, v: 1 }) };
    }
    throw new Error('unexpected smoke route: ' + route);
  };
  const result = await createSmoke({
    site: 'https://example.test', base: 'https://example.test/api', fetch: transport,
    log: () => {}, pause: async () => {}, timeout: 100,
  }).run();
  assert.equal(result.fail, 0);
  assert.ok(calls.length > 0);
  assert.equal(calls.some(({ url }) => new URL(url).pathname === '/api/orders'), false);
  assert.equal(calls.every(({ init }) => ['GET', 'HEAD'].includes(String(init.method || 'GET').toUpperCase())), true);
  assert.throws(() => assertReadOnly({ method: 'POST' }), /refuses unsafe method/);
  assert.doesNotMatch(productionSmokeSource, /call\(\s*['"]\/orders['"]/);
  assert.doesNotMatch(productionSmokeSource, /method:\s*['"]POST['"]/);
});

test('unknown producer and invalid guide scope fail closed', async () => {
  const { contract, requests } = makeContract();
  assert.equal((await contract.submit('unknown', { topic: 'x' }, 0)).contractError, 'unknown_producer');
  assert.equal((await contract.submit('guide_microlead', { topic: 'x' }, 0, '../bad')).contractError, 'invalid_scope');
  assert.equal(requests.length, 0);
});
