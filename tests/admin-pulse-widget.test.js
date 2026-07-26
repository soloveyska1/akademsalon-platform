const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const adminHtml = read('admin.html');
const adminJs = read('assets/js/admin.js');
const publicHome = read('index.html');

test('owner pulse stays inside the protected master cabinet', () => {
  assert.match(adminHtml, /class="ag" id="agRoot"/);
  assert.match(adminJs, /function pulseWidget\(ov, by\)/);
  assert.match(adminJs, /¶ Пульс мастерской/);
  assert.doesNotMatch(publicHome, /Пульс мастерской|class="pw\b/);
});

test('pulse exposes the three actionable signals and a priority queue', () => {
  assert.match(adminJs, />на сайте<\/span>/);
  assert.match(adminJs, />новых<\/span>/);
  assert.match(adminJs, />оплат на сверке<\/span>/);
  assert.match(adminJs, /deskRows\(\)/);
  assert.match(adminJs, /data-open-order=/);
  assert.match(adminJs, /data-go="@qa"/);
  assert.match(adminJs, /data-go="@reviews"/);
});

test('pulse distinguishes fresh, loading, calm and stale data', () => {
  assert.match(adminJs, /ovAt: 0, ovFailed: false/);
  assert.match(adminJs, /живые данные/);
  assert.match(adminJs, /Собираем пульс/);
  assert.match(adminJs, /aria-busy=/);
  assert.match(adminJs, /Стол чист/);
  assert.match(adminJs, /нет связи/);
  assert.match(adminJs, /данные на /);
  assert.match(adminJs, /id="agPulseRetry"/);
  assert.doesNotMatch(adminJs, /Сайт (?:работает|отвечает|доступен)/i);
});

test('pulse is responsive, keyboard-visible and motion-safe', () => {
  assert.match(adminHtml, /\.pw\{[^}]*display:grid/);
  assert.match(adminHtml, /@media\(max-width:720px\)\{\s*\.pw\{grid-template-columns:1fr\}/);
  assert.match(adminHtml, /\.pw-metric:focus-visible/);
  assert.match(adminHtml, /\.pw-queue:focus-visible/);
  assert.match(adminHtml, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(adminHtml, /assets\/js\/admin\.js\?v=20260726release20/);
});
