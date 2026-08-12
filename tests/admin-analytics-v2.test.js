const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('admin-analytics.html');
const js = read('assets/js/admin-analytics.js');
const api = read('assets/js/admin-analytics-api.js');
const css = read('assets/css/admin-analytics.css');
const admin = read('assets/js/admin.js');
const sw = read('sw.js');

test('admin analytics is Russian, source-backed and explicit about coverage', () => {
  for (const phrase of [
    'Аналитика', 'Сводка', 'Сейчас на сайте', 'Источники', 'Страницы и переходы',
    'Воронка', 'Посетители и сессии', 'Качество данных', 'Только после согласия',
    'Московское время',
  ]) assert.match(html + js, new RegExp(phrase));
  assert.match(js, /\/admin\/analytics\/overview/);
  assert.match(js, /\/admin\/analytics\/sessions/);
  assert.match(js, /\/admin\/analytics\/session\//);
  assert.match(js, /полнота[^<]{0,80}неизвестна|охват[^<]{0,80}неизвестен/i);
  assert.match(admin, /admin-analytics\.html/);
});

test('analytics UI has no raw identity or third-party IP disclosure', () => {
  const combined = html + js + api;
  for (const forbidden of ['ipinfo.io', 'order_id', 'raw_user_agent', 'raw_referrer']) {
    assert.doesNotMatch(combined, new RegExp(forbidden.replace('.', '\\.'), 'i'));
  }
  assert.doesNotMatch(combined, /\bIP-адрес\b/i);
  assert.match(combined, /анонимн/i);
  assert.match(sw, /admin(?:\\\\\(\?:-\[a-z0-9-\]\+\\\\\)\?)?/i);
});

test('private panel uses a read-only same-origin client without public analytics shell', () => {
  assert.doesNotMatch(html, /assets\/js\/app\.js/);
  assert.match(html, /admin-analytics-api\.js/);
  assert.match(api, /method:\s*'GET'/);
  assert.match(api, /credentials:\s*'same-origin'/);
  assert.match(api, /cache:\s*'no-store'/);
  assert.doesNotMatch(api, /post\s*:|method:\s*'POST'|mc\.yandex|metrika/i);
  assert.doesNotMatch(html, /<script(?![^>]+src=)[^>]*>[\s\S]*?<\/script>/i);
  assert.doesNotMatch(html + js, /\sstyle=|\.style\./i);
});

test('dashboard is responsive, keyboard-visible and does not encode meaning by colour alone', () => {
  assert.match(css, /@media\s*\(max-width:\s*720px\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /<table/);
  assert.match(js, /aria-label/);
  assert.match(js, /aria-sort/);
});
