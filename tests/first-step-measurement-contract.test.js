const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('assets/js/app.js');
const supporting = read('assets/js/polish15-supporting.js');
const configurator = read('configurator.html');
const admin = read('assets/js/admin.js');
const privacyWave = '20260803out006privacy1';

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `function ${name} must exist`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = bodyStart; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

function namedFunction(source, name) {
  const body = functionSource(source, name)
    .replace(`function ${name}`, 'function');
  return Function(`"use strict"; return (${body});`)();
}

function analyticsPageFunction() {
  const start = app.indexOf('var ANALYTICS_PAGE_LIST =');
  const end = app.indexOf('function analyticsMark(', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return Function(`"use strict"; ${app.slice(start, end)}; return analyticsPage;`)();
}

function conceptVariantRuntime(state, extra) {
  const start = configurator.indexOf('function conceptCode(');
  const end = configurator.indexOf('function trackConcept(', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const effectiveResult = () => state.result || 'diagnostic';
  return Function(
    'state', 'extra', 'RULES_EVENT_VERSION', 'effectiveResult',
    `"use strict"; ${configurator.slice(start, end)}; return conceptVariant(extra);`,
  )(state, extra, 'r1', effectiveResult);
}

function visitRuntime(pathname, consent, responseStatus = 204, options = {}) {
  const calls = [];
  const timers = [];
  const values = new Map();
  const analyticsStart = app.indexOf('var ANALYTICS_PAGE_LIST =');
  const analyticsEnd = app.indexOf('function purgeAnalyticsBrowserState(', analyticsStart);
  const visitStart = app.indexOf('Salon.visit = (function ()');
  const visitEnd = app.indexOf('/* Privacy-safe CTA attribution', visitStart);
  const context = {
    API_BASE: '/api',
    Salon: {
      store: {
        get: (key, fallback) => values.has(key) ? values.get(key) : fallback,
        set: (key, value) => values.set(key, value),
        del: (key) => values.delete(key),
      },
      consent: {
        allowed: () => consent.current.analytics === true,
        read: () => consent.current,
      },
      attribution: { ref: () => '' },
    },
    location: {
      pathname,
      search: options.search || '',
      protocol: options.protocol || 'https:',
      hostname: options.hostname || 'akademsalon.ru',
    },
    URLSearchParams,
    sessionStorage: { getItem: (key) => key === 'salon_imp' && options.imp ? '1' : null },
    document: {
      visibilityState: 'visible',
      prerendering: false,
      addEventListener: () => {},
    },
    window: {},
    crypto: { getRandomValues: (bytes) => bytes.fill(calls.length + 1) },
    fetch: (url, options) => {
      calls.push({ url, options });
      return {
        catch() {},
      };
    },
    setTimeout: (callback) => { timers.push(callback); return timers.length; },
  };
  context.window.crypto = context.crypto;
  vm.runInNewContext(
    `${app.slice(analyticsStart, analyticsEnd)}\n${app.slice(visitStart, visitEnd)}`,
    context,
    { filename: 'assets/js/app.js#visit-privacy-contract' },
  );
  return { calls, timers, context };
}

function consentRuntime(seed = {}) {
  const values = new Map(Object.entries(seed));
  const cookieWrites = [];
  const vendor = {
    _ym_uid: 'vendor-id',
    removeItem(key) { delete this[key]; },
  };
  const document = {
    dispatchEvent() {},
    createEvent: () => ({ initCustomEvent() {} }),
  };
  Object.defineProperty(document, 'cookie', {
    get: () => '_ym_uid=vendor-id; other=ok',
    set: (value) => cookieWrites.push(value),
  });
  const privacyStart = app.indexOf('function forgetAnalyticsVendorState(');
  const privacyEnd = app.indexOf('Salon.analyticsPrivacy =', privacyStart);
  const consentStart = app.indexOf('Salon.consent = (function ()');
  const consentEnd = app.indexOf('/* ---------------- Фирменный motion-язык', consentStart);
  const context = {
    Salon: {
      store: {
        get: (key, fallback) => values.has(key) ? values.get(key) : fallback,
        set: (key, value) => values.set(key, value),
        del: (key) => values.delete(key),
      },
    },
    localStorage: vendor,
    location: { hostname: 'akademsalon.ru' },
    document,
    CustomEvent: function CustomEvent(type, options) {
      this.type = type;
      this.detail = options.detail;
    },
    window: { addEventListener() {} },
  };
  vm.runInNewContext(
    `${app.slice(privacyStart, privacyEnd)}\n${app.slice(consentStart, consentEnd)}`,
    context,
    { filename: 'assets/js/app.js#consent-purge-contract' },
  );
  return { values, vendor, cookieWrites, context };
}

function attributionRuntime(pathname, consent, options = {}) {
  const values = new Map(Object.entries(options.seed || {}));
  const listeners = new Map();
  const analyticsStart = app.indexOf('var ANALYTICS_PAGE_LIST =');
  const analyticsEnd = app.indexOf('function purgeAnalyticsBrowserState(', analyticsStart);
  const attributionStart = app.indexOf('Salon.attribution = (function ()');
  const attributionEnd = app.indexOf('/* ---------------- Собственная аналитика визитов', attributionStart);
  const context = {
    Salon: {
      store: {
        get: (key, fallback) => values.has(key) ? values.get(key) : fallback,
        set: (key, value) => values.set(key, value),
        del: (key) => values.delete(key),
      },
      consent: { allowed: () => consent.current.analytics === true },
    },
    location: {
      pathname,
      search: options.search || '',
      origin: 'https://akademsalon.ru',
    },
    URL,
    URLSearchParams,
    sessionStorage: { getItem: (key) => key === 'salon_imp' && options.imp ? '1' : null },
    document: {
      referrer: options.referrer || '',
      addEventListener: (name, callback) => listeners.set(name, callback),
    },
  };
  vm.runInNewContext(
    `${app.slice(analyticsStart, analyticsEnd)}\n${app.slice(attributionStart, attributionEnd)}`,
    context,
    { filename: 'assets/js/app.js#attribution-privacy-contract' },
  );
  return {
    values,
    context,
    consentEvent(analytics) {
      consent.current = { analytics };
      listeners.get('salon:consent')({ detail: { analytics } });
    },
  };
}

test('analytics page identity accepts only canonical public routes', () => {
  const analyticsPage = analyticsPageFunction();
  for (const [input, expected] of [
    ['/', '/'],
    ['/services.html', '/services.html'],
    ['/KURSOVAYA-RABOTA.HTML', '/other'],
    ['/name@example.com', '/other'],
    ['/claim=cx1_secret', '/other'],
    ['/%2B79991234567', '/other'],
    ['/nested/page.html', '/other'],
    ['/secret-token.html', '/other'],
    ['/john-smith.html', '/other'],
    ['/very-long-' + 'x'.repeat(90) + '.html', '/other'],
  ]) {
    assert.equal(analyticsPage(input), expected, input);
  }
  const rootPages = fs.readdirSync(root).filter((file) => file.endsWith('.html'));
  /* Закрытая аналитика и автономные условия акции не грузят public runtime. */
  assert.equal(rootPages.length, 95);
  for (const file of rootPages) {
    const expected = ['admin-analytics.html', 'zero-classes.html'].includes(file)
      ? '/other'
      : `/${file}`;
    assert.equal(analyticsPage(`/${file}`), expected, file);
  }
  assert.match(app, /url:\s*location\.origin\s*\+\s*analyticsPage\(location\.pathname\)/);
  assert.match(app, /function page\(\) \{ return analyticsPage\(location\.pathname\); \}/);
});

test('visit beacon is anonymous and silent on private or operational contours', () => {
  const visitBlock = app.slice(
    app.indexOf('Salon.visit = (function ()'),
    app.indexOf('/* Privacy-safe CTA attribution'),
  );
  assert.match(visitBlock, /here === 'dashboard\.html'/);
  assert.match(visitBlock, /here === 'zayavka\.html'/);
  assert.match(visitBlock, /here\.indexOf\('admin'\) === 0/);
  assert.match(visitBlock, /credentials:\s*'omit'/);
  assert.doesNotMatch(visitBlock, /credentials:\s*'include'/);

  const consent = { current: { analytics: true, at: 'allow-1' } };
  const publicRuntime = visitRuntime('/services.html', consent);
  assert.equal(publicRuntime.calls.length, 1);
  assert.equal(publicRuntime.calls[0].options.credentials, 'omit');
  assert.equal(publicRuntime.calls[0].options.headers['Content-Type'], 'text/plain');
  assert.deepEqual(Object.keys(publicRuntime.calls[0].options.headers), ['Content-Type']);
  const body = JSON.parse(publicRuntime.calls[0].options.body);
  assert.equal(body.page, '/services.html');
  assert.equal(Object.hasOwn(body, 'event_id'), false, 'unknown backend schema is unchanged');

  const unknownRuntime = visitRuntime('/secret-token.html', consent);
  assert.equal(JSON.parse(unknownRuntime.calls[0].options.body).page, '/other');

  for (const pathname of ['/dashboard.html', '/zayavka.html', '/admin.html']) {
    assert.equal(visitRuntime(pathname, consent).calls.length, 0, pathname);
  }
  assert.equal(visitRuntime('/', consent, 204, { imp: true }).calls.length, 0, 'impersonation');
  assert.equal(visitRuntime('/', consent, 204, { search: '?desktop-preview=1' }).calls.length, 0, 'preview');
  assert.equal(visitRuntime('/', consent, 204, { hostname: 'preview.example' }).calls.length, 0, 'foreign host');
  assert.match(app, /location\.hostname !== 'akademsalon\.ru' \|\| analyticsPreview\(\)/);
});

test('reject, revoke and expiry purge browser id and attribution', () => {
  const purge = functionSource(app, 'purgeAnalyticsBrowserState');
  assert.match(purge, /Salon\.store\.del\('salon_vid'\)/);
  assert.match(purge, /Salon\.store\.del\('salon_attr_v2'\)/);
  assert.match(purge, /Salon\.metrika\.stop\(\)/);

  const readConsent = functionSource(app, 'read');
  const saveConsent = functionSource(app, 'save');
  assert.match(readConsent, /purgeAnalyticsBrowserState\(\)/);
  assert.match(saveConsent, /purgeAnalyticsBrowserState\(\)/);

  const attributionBlock = app.slice(
    app.indexOf('Salon.attribution = (function ()'),
    app.indexOf('/* ---------------- Собственная аналитика визитов'),
  );
  assert.match(attributionBlock, /else\s*\{[\s\S]*?Salon\.store\.del\(KEY\)/);
  assert.match(attributionBlock, /blockedUntilNavigation/);
  assert.match(app, /forgetAnalyticsVendorState\(\)/);

  const expired = consentRuntime({
    salon_consent: {
      v: 3,
      analytics: true,
      at: '2020-01-01T00:00:00.000Z',
      expiresAt: '2020-01-02T00:00:00.000Z',
    },
    salon_vid: 'v12345678',
    salon_attr_v2: { first: { kind: 'utm' }, firstAt: 1 },
  });
  assert.equal(expired.context.Salon.consent.read(), null);
  assert.equal(expired.values.has('salon_consent'), false);
  assert.equal(expired.values.has('salon_vid'), false);
  assert.equal(expired.values.has('salon_attr_v2'), false);
  assert.equal(Object.hasOwn(expired.vendor, '_ym_uid'), false);
  assert.ok(expired.cookieWrites.some((value) => /^_ym_uid=;/.test(value)));

  const rejected = consentRuntime();
  rejected.context.Salon.consent.save(true, 'settings');
  rejected.values.set('salon_vid', 'v12345678');
  rejected.values.set('salon_attr_v2', { firstAt: 1 });
  rejected.context.Salon.consent.save(false, 'settings');
  assert.equal(rejected.values.has('salon_vid'), false);
  assert.equal(rejected.values.has('salon_attr_v2'), false);
});

test('private contours and same-document regrant cannot capture attribution', () => {
  const privateConsent = { current: { analytics: true } };
  for (const [pathname, options] of [
    ['/dashboard.html', { search: '?utm_source=google' }],
    ['/zayavka.html', { search: '?utm_source=google' }],
    ['/admin.html', { search: '?utm_source=google' }],
    ['/services.html', { search: '?utm_source=google', imp: true }],
    ['/services.html', { search: '?desktop-preview=1&utm_source=google' }],
  ]) {
    const runtime = attributionRuntime(pathname, privateConsent, options);
    assert.equal(runtime.values.has('salon_attr_v2'), false, pathname);
    assert.equal(runtime.context.Salon.attribution.ref(), '', pathname);
  }

  const consent = { current: { analytics: false } };
  const sameDocument = attributionRuntime('/services.html', consent, { search: '?utm_source=google' });
  sameDocument.consentEvent(true);
  assert.equal(sameDocument.context.Salon.attribution.ref(), '');
  assert.equal(sameDocument.values.has('salon_attr_v2'), false);

  const revokedConsent = { current: { analytics: true } };
  const revoked = attributionRuntime('/services.html', revokedConsent, { search: '?utm_source=google' });
  assert.equal(revoked.values.has('salon_attr_v2'), true, 'initial allowed navigation may capture');
  revoked.consentEvent(false);
  revoked.consentEvent(true);
  assert.equal(revoked.context.Salon.attribution.ref(), '');
  assert.equal(revoked.values.has('salon_attr_v2'), false);

  const legacy = attributionRuntime('/services.html', { current: { analytics: true } }, {
    seed: {
      salon_attr_v2: {
        first: { kind: 'utm', values: { utm_source: 'google' } },
        entry: '/secret-token.html',
        firstAt: 1,
        lastEntry: '/name@example.com',
      },
    },
  });
  const migrated = legacy.values.get('salon_attr_v2');
  assert.equal(migrated.entry, '/other');
  assert.equal(migrated.lastEntry, '/other');
  assert.doesNotMatch(legacy.context.Salon.attribution.decoratePage('site'), /secret|@/);
});

test('beacon is best-effort and cannot retry after a network failure', () => {
  const consent = { current: { analytics: true, at: 'allow-1' } };
  const failed = visitRuntime('/services.html', consent, 503);
  assert.equal(failed.calls.length, 1);
  assert.equal(failed.timers.length, 0);
  assert.match(app, /Best-effort by design/);
  assert.doesNotMatch(app, /setTimeout\(function \(\) \{ deliver\(/);
});

test('legacy marks collapse to a fixed non-PII enum allowlist', () => {
  const analyticsMark = namedFunction(app, 'analyticsMark');
  assert.equal(analyticsMark('cta: конфигуратор'), 'cta_configurator');
  assert.equal(analyticsMark('услуга: Курсовая работа'), 'service_selected');
  assert.equal(analyticsMark('шаг 3 из 4'), 'config_step_3');
  assert.equal(analyticsMark('js: boom @ /name@example.com:42'), 'js_error');
  for (const value of ['name@example.com', 'cx1_secret_token', '/private/file.pdf']) {
    assert.equal(analyticsMark(value), '', value);
  }
});

test('semantic events use exact names and bounded dimensions instead of sanitizing PII', () => {
  const consent = { current: { analytics: true, at: 'allow-1' } };
  const runtime = visitRuntime('/services.html', consent);
  const initial = runtime.calls.length;
  for (const [name, detail] of [
    ['custom_event', { cta: 'safe_code' }],
    ['cta_click', { cta: 'name@example.com' }],
    ['cta_click', { cta: 'configurator', variant: 'cx1_secret_token' }],
    ['home_desk_situation', { cta: 'home_editorial_desk', variant: 'john_smith' }],
    ['case_route_ready', { cta: 'research_case', variant: 'r1_diagnos' }],
  ]) {
    runtime.context.Salon.visit.event(name, detail);
  }
  assert.equal(runtime.calls.length, initial, 'unknown or high-cardinality dimensions are dropped');

  runtime.context.Salon.visit.event('cta_click', { cta: 'configurator:pl' });
  runtime.context.Salon.visit.event('home_desk_situation', {
    cta: 'home_editorial_desk',
    variant: 'comments',
  });
  runtime.context.Salon.visit.event('case_ecosystem_stage', {
    cta: 'research_case',
    variant: 'r1_3',
  });
  for (const [label, expected] of [
    ['ВКР, пока есть только тема', 'r1_topic'],
    ['ВКР, получены замечания руководителя', 'r1_comments'],
    ['Диплом готов, скоро защита', 'r1_defense'],
    ['Курсовая, уже есть мой черновик', 'r1_draft'],
  ]) {
    runtime.context.Salon.visit.event('case_result_situation_changed', {
      cta: 'research_case',
      variant: ('r1_' + label).slice(0, 32),
    });
    assert.equal(JSON.parse(runtime.calls.at(-1).options.body).variant, expected, label);
  }
  assert.equal(runtime.calls.length, initial + 7);
  const cta = JSON.parse(runtime.calls[initial].options.body);
  const desk = JSON.parse(runtime.calls[initial + 1].options.body);
  assert.deepEqual({ event: cta.event, cta: cta.cta_id }, {
    event: 'cta_click', cta: 'configurator:pl',
  });
  assert.deepEqual({ event: desk.event, cta: desk.cta_id, variant: desk.variant }, {
    event: 'home_desk_situation', cta: 'home_editorial_desk', variant: 'comments',
  });
  assert.equal(JSON.parse(runtime.calls[initial + 2].options.body).variant, 'r1_3');
  assert.equal(JSON.parse(runtime.calls[initial + 3].options.body).variant, 'r1_topic');

  const longNormalRoute = conceptVariantRuntime({
    workType: 'course', situation: 'topic', result: 'diagnostic',
  }, 'visible_summary');
  assert.equal(longNormalRoute, 'r1_vs_cr_t_dg');
  assert.ok(longNormalRoute.length <= 32);
  runtime.context.Salon.visit.event('case_route_confirm', {
    cta: 'work_base', variant: longNormalRoute,
  });
  assert.equal(runtime.calls.length, initial + 8, 'normal long route remains measurable');

  runtime.context.Salon.visit.event('case_route_ready', {
    cta: 'research_case',
    variant: ('r1_comments_course_emp_diagnostic').slice(0, 32),
  });
  assert.equal(runtime.calls.length, initial + 9, 'legacy home truncation maps to an exact enum');
  assert.equal(JSON.parse(runtime.calls.at(-1).options.body).variant, 'r1_c_ce_dg');
});

test('question payload never links PII to the analytics browser id', () => {
  const qaStart = supporting.indexOf("Salon.api.post('/qa'");
  const qaEnd = supporting.indexOf('}).then(function (response)', qaStart);
  assert.notEqual(qaStart, -1);
  assert.notEqual(qaEnd, -1);
  const qaPayload = supporting.slice(qaStart, qaEnd);
  assert.doesNotMatch(qaPayload, /salon_vid/);
  assert.doesNotMatch(qaPayload, /\bvid\s*:/);
});

test('OUT-006 adds no production measurement milestone before server authority', () => {
  assert.doesNotMatch(app, /first_step_(?:exposed|selected|continued|alternate)/);
  assert.doesNotMatch(read('assets/js/home-guided-flow.js'), /first_step_(?:exposed|selected|continued|alternate)/);
});

test('first input remains armed until analytics consent actually allows collection', () => {
  const start = configurator.indexOf('(function trackFirstInput()');
  const end = configurator.indexOf('btnSubmit.addEventListener', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const source = configurator.slice(start, end);
  const consentAt = source.indexOf('S.consent.allowed()');
  const removeAt = source.indexOf("removeEventListener('input', firstInput)");
  assert.ok(consentAt > 0, 'listener must check current consent');
  assert.ok(removeAt > consentAt, 'pre-consent input must not consume the one-shot listener');
  assert.match(source, /var body = \$\('main'\)/,
    'delegated listener must cover both the dynamic concept wizard and legacy form');
  assert.doesNotMatch(source, /var body = \$\('confBody'\)/,
    'hidden legacy form alone cannot represent current wizard input');
});

test('only an authenticated admin overview can persist the owner-device exclusion', () => {
  const success = admin.slice(
    admin.indexOf("S.api.get('/admin/overview')"),
    admin.indexOf('st.ov = r'),
  );
  assert.match(success, /salon_analytics_owner_device_v1/);
  assert.ok(success.indexOf('if (!r.ok)') < success.indexOf('salon_analytics_owner_device_v1'));
  assert.doesNotMatch(admin.slice(0, admin.indexOf("S.api.get('/admin/overview')")),
    /salon_analytics_owner_device_v1/);
});

test('all direct app consumers carry one atomic privacy cache wave', () => {
  const consumers = fs.readdirSync(root)
    .filter((file) => file.endsWith('.html'))
    .filter((file) => read(file).includes('assets/js/app.js'));
  assert.equal(consumers.length, 89);
  for (const file of consumers) {
    const html = read(file);
    const matches = [...html.matchAll(/src="assets\/js\/app\.js\?([^"#]+)"/g)];
    assert.equal(matches.length, 1, `${file}: one app runtime`);
    const query = new URLSearchParams(matches[0][1].replaceAll('&amp;', '&'));
    assert.equal(query.get('privacy'), privacyWave, `${file}: privacy cache wave`);
  }
  const home = read('index.html');
  assert.match(home, new RegExp(`assets/js/home-release\\.min\\.js\\?[^"\\n]*privacy=${privacyWave}`));
  assert.match(read('assets/js/home-release.min.js'), /credentials:"omit"/);

  const supportingConsumers = consumers.filter((file) =>
    read(file).includes('assets/js/polish15-supporting.js'),
  );
  assert.equal(supportingConsumers.length, 5);
  for (const file of supportingConsumers) {
    const html = read(file);
    const match = /src="assets\/js\/polish15-supporting\.js\?([^"#]+)"/.exec(html);
    assert.ok(match, `${file}: supporting runtime`);
    const query = new URLSearchParams(match[1].replaceAll('&amp;', '&'));
    assert.equal(query.get('privacy'), privacyWave, `${file}: supporting privacy wave`);
  }
});
