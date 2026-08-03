const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('assets/js/app.js');
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

test('analytics page identity accepts only canonical public routes', () => {
  const analyticsPage = namedFunction(app, 'analyticsPage');
  for (const [input, expected] of [
    ['/', '/'],
    ['/services.html', '/services.html'],
    ['/KURSOVAYA-RABOTA.HTML', '/kursovaya-rabota.html'],
    ['/name@example.com', '/other'],
    ['/claim=cx1_secret', '/other'],
    ['/%2B79991234567', '/other'],
    ['/nested/page.html', '/other'],
    ['/very-long-' + 'x'.repeat(90) + '.html', '/other'],
  ]) {
    assert.equal(analyticsPage(input), expected, input);
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
  assert.match(attributionBlock, /else\s+Salon\.store\.del\(KEY\)/);
});

test('OUT-006 adds no production measurement milestone before server authority', () => {
  assert.doesNotMatch(app, /first_step_(?:exposed|selected|continued|alternate)/);
  assert.doesNotMatch(read('assets/js/home-guided-flow.js'), /first_step_(?:exposed|selected|continued|alternate)/);
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
});
