const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'style-lab/full/style.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'style-lab/full/app.js'), 'utf8');
const productionCss = fs.readFileSync(path.join(root, 'assets/css/chrome.css'), 'utf8');
const productionAdminCss = fs.readFileSync(path.join(root, 'assets/css/polish15-admin.css'), 'utf8');
const productionApp = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');

test('skip link is revealed only by keyboard navigation', () => {
  assert.match(
    css,
    /html\[data-input-modality="keyboard"\] \.skip-link:focus\s*\{\s*transform:\s*none;/,
  );
  assert.doesNotMatch(css, /(?<!\]) \.skip-link:focus\s*\{\s*transform:\s*none;/);
  assert.match(app, /event\.key === "Tab"[\s\S]*?dataset\.inputModality = "keyboard"/);
  assert.match(app, /window\.addEventListener\("pointerdown"[\s\S]*?delete document\.documentElement\.dataset\.inputModality/);
});

test('brand marks cannot be selected or dragged by pointer input', () => {
  assert.match(
    css,
    /\.brand,[\s\S]*?\.mobile-appbar__brand,[\s\S]*?\.admin-sidebar__brand\s*\{[\s\S]*?user-select:\s*none;/,
  );
  assert.match(
    css,
    /\.brand img,[\s\S]*?\.mobile-appbar__brand img,[\s\S]*?\.admin-sidebar__brand img\s*\{[\s\S]*?pointer-events:\s*none;[\s\S]*?-webkit-user-drag:\s*none;/,
  );
});

test('production chrome uses the same keyboard-only focus contract', () => {
  assert.match(
    productionCss,
    /html\[data-input-modality="keyboard"\] \.skip-link:focus\{top:0\}/,
  );
  assert.doesNotMatch(productionCss, /(?:^|\n)\.skip-link:focus\{top:0\}/);
  assert.match(
    productionApp,
    /event\.key === 'Tab'[\s\S]*?setAttribute\('data-input-modality', 'keyboard'\)/,
  );
  assert.match(
    productionApp,
    /window\.addEventListener\('pointerdown'[\s\S]*?removeAttribute\('data-input-modality'\)/,
  );
  assert.match(
    productionCss,
    /\.site-header \.brand:focus-visible\{outline:none;box-shadow:none\}/,
  );
  assert.match(
    css,
    /\.brand:focus-visible\s*\{\s*outline:\s*none;\s*box-shadow:\s*none;/,
  );
  assert.match(
    productionCss,
    /html\[data-input-modality="keyboard"\] \.site-header \.brand:focus-visible \.brand__mark\{/,
  );
  assert.match(
    productionAdminCss,
    /\.is-admin-route \.admin-sidebar__brand:focus-visible\s*\{\s*outline:\s*none;\s*box-shadow:\s*none;/,
  );
  assert.match(
    productionAdminCss,
    /html\[data-input-modality="keyboard"\] \.is-admin-route \.admin-sidebar__brand:focus-visible img\s*\{/,
  );
});
