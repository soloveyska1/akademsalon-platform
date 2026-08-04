const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const journeyCss = read('assets/css/configurator-journey.css');
const mobileCss = read('assets/css/mobile.css');
const configurator = read('configurator.html');
const app = read('assets/js/app.js');

test('narrow configurator header cannot exceed the mobile viewport', () => {
  assert.match(
    journeyCss,
    /@media\(max-width:520px\)\{[\s\S]*?wizard-main__head>div:first-child\{\s*width:100%;\s*min-width:0;\s*max-width:100%;/,
  );
});

test('desktop work choices preserve a readable 44px target', () => {
  // Раньше здесь стояли точные 44px/12px, и любое укрупнение читалось как
  // регрессия. Стережём сам инвариант: цель не мельче 44px, подпись не мельче
  // 12px — исходный дефект (сжатие ниже порога) по-прежнему валит тест.
  const rule = journeyCss.match(
    /@media\(min-width:921px\)\{[\s\S]*?\.configurator-task \.concept-work-choice__rows button\{[\s\S]*?min-height:(\d+)px;\s*font-size:(\d+)px;/,
  );
  assert.ok(rule, 'desktop work choices need an explicit target rule');
  assert.ok(Number(rule[1]) >= 44, `work choice target must stay >=44px, got ${rule[1]}px`);
  assert.ok(Number(rule[2]) >= 12, `work choice label must stay >=12px, got ${rule[2]}px`);
});

test('mobile footer has no duplicate light-only tail and keeps legal links tappable', () => {
  assert.doesNotMatch(mobileCss, /body \.site-footer\{\s*padding-bottom:calc\(74px/);
  assert.match(
    mobileCss,
    /body \.site-footer__legal a\{\s*display:inline-flex;\s*min-height:44px;/,
  );
});

test('shared API gives retryable GET reads a bounded body-aware timeout', () => {
  assert.match(app, /fetchController = method === 'GET'/);
  assert.match(app, /setTimeout\(function \(\) \{ fetchController\.abort\(\); \}, 10000\)/);
  assert.match(app, /signal: fetchController \? fetchController\.signal : undefined/);
  assert.match(app, /if \(fetchController && fetchController\.signal\.aborted\) throw error/);
});

test('order submission timeout never aborts an ambiguous POST mutation', () => {
  const orderContract = app.slice(
    app.indexOf('/* order-contract:start */'),
    app.indexOf('/* order-contract:end */'),
  );
  assert.doesNotMatch(orderContract, /AbortController|\.abort\(|\bsignal\s*:/);
  assert.match(orderContract, /timedOut: true/);
  assert.match(orderContract, /return softTimeout\(active\.promise/);
  assert.match(orderContract, /method: 'POST'/);
  assert.match(configurator, /S\.orderContract\.submit\('configurator', payload, timeoutMs\)/);
});

test('contact step supports Enter without bypassing validation', () => {
  assert.match(configurator, /key !== 'contact' \|\| event\.key !== 'Enter'/);
  assert.match(configurator, /event\.preventDefault\(\);\s*updateChrome\(\);\s*if \(canContinue\(\)\) next\(\);/);
});
