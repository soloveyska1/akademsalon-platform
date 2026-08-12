const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/js/analytics-attribution-v2.js'), 'utf8');

function runtime(search, initial = null) {
  const values = new Map();
  if (initial) values.set('salon_attr_v2', initial);
  const listeners = {};
  const context = {
    location: { pathname:'/configurator.html', search, protocol:'https:', hostname:'akademsalon.ru', origin:'https://akademsalon.ru' },
    document: { referrer:'', addEventListener(name, callback) { listeners[name] = callback; } },
    sessionStorage: { getItem() { return null; } },
    URL, URLSearchParams, Date,
    Salon: {
      store: {
        get(key, fallback) { return values.has(key) ? values.get(key) : fallback; },
        set(key, value) { values.set(key, value); return true; },
        del(key) { values.delete(key); },
      },
      consent: { allowed() { return true; } },
      analyticsPrivacy: { page() { return '/configurator.html'; } },
      attribution: {},
      visit: { mark() {}, order() {}, event() {} },
    },
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename:'analytics-attribution-v2.js' });
  return { context, values, listeners };
}

test('arbitrary UTM-like text is neither stored nor attached to an order page', () => {
  const result = runtime('?utm_source=semen_semenov&utm_medium=private_note' +
    '&utm_campaign=ivan_petrov&utm_content=client&utm_term=phone');
  assert.equal(result.values.has('salon_attr_v2'), false);
  assert.equal(result.context.Salon.attribution.ref(), '');
  assert.equal(result.context.Salon.attribution.decoratePage('configurator.html'), 'configurator.html');
});

test('published campaign enums remain measurable and legacy values are recanonicalized', () => {
  const result = runtime('?utm_source=yandex&utm_medium=cpc&utm_campaign=services', {
    first: { kind:'utm', values:{ utm_source:'semen_semenov', utm_medium:'private_note' } },
  });
  assert.equal(result.context.Salon.attribution.ref(),
    'utm_source=yandex&utm_medium=cpc&utm_campaign=services');
  const saved = result.values.get('salon_attr_v2');
  assert.deepEqual(JSON.parse(JSON.stringify(saved.first.values)), {
    utm_source:'yandex', utm_medium:'cpc', utm_campaign:'services',
  });
  assert.match(result.context.Salon.attribution.decoratePage('configurator.html'),
    /utm_source=yandex&utm_medium=cpc&utm_campaign=services/);
});

test('revocation purges attribution and blocks same-document recapture', () => {
  const result = runtime('?utm_source=yandex&utm_medium=cpc&utm_campaign=services');
  assert.equal(result.values.has('salon_attr_v2'), true);
  result.listeners['salon:consent']({ detail:{ analytics:false } });
  assert.equal(result.values.has('salon_attr_v2'), false);
  assert.equal(result.context.Salon.attribution.ref(), '');
});

test('strict attribution precedes analytics v2 on every measured public page', () => {
  const pages = fs.readdirSync(root).filter((file) => file.endsWith('.html'));
  const measured = pages.filter((file) =>
    fs.readFileSync(path.join(root, file), 'utf8').includes('assets/js/analytics-v2.js'),
  );
  assert.equal(measured.length, 87);
  for (const file of measured) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /<script(?: defer)? src="assets\/js\/analytics-attribution-v2\.js\?v=20260812analytics2"><\/script>\s*<script(?: defer)? src="assets\/js\/analytics-v2\.js\?v=20260812analytics2"><\/script>/,
      `${file}: strict attribution must be loaded first`);
  }
  for (const file of ['admin.html', 'dashboard.html', 'zayavka.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(html, /analytics-(?:attribution-)?v2\.js/, `${file}: private contour`);
  }
});

test('v2 boundary disables legacy visit hooks after loading', () => {
  const result = runtime('?utm_source=yandex&utm_medium=cpc&utm_campaign=services');
  assert.deepEqual(Object.keys(result.context.Salon.visit).sort(), ['event', 'mark', 'order']);
  assert.equal(result.context.Salon.visit.event('submit_success'), undefined);
});
