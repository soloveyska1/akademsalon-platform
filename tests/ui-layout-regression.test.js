const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const configurator = fs.readFileSync(path.join(root, 'configurator.html'), 'utf8');
const cartCss = fs.readFileSync(path.join(root, 'assets/css/cart.css'), 'utf8');
const chromeCss = fs.readFileSync(path.join(root, 'assets/css/chrome.css'), 'utf8');

test('конфигуратор не сжимает названия и цены во вложенную узкую сетку', () => {
  assert.match(configurator, /class="wrap conf-wrap"/);
  assert.match(configurator, /\.conf-wrap\{max-width:1440px\}/);
  assert.match(
    configurator,
    /grid-template-columns:minmax\(0,1\.55fr\) minmax\(360px,\.8fr\)/
  );
  assert.match(
    configurator,
    /#typeGroup\{display:grid;grid-template-columns:repeat\(2,minmax\(320px,1fr\)\)/
  );
  assert.match(configurator, /@media\(max-width:1240px\)\{\s*#typeGroup\{grid-template-columns:1fr/);
  assert.match(configurator, /#typeGroup \.optrow \.dots\{display:block/);
});

test('пустая смета не создаёт вторую карточку внутри расчёта', () => {
  assert.match(cartCss, /\.cart-dock\.is-empty\{display:none!important\}/);
  assert.doesNotMatch(cartCss, /\.cart-dock\.is-empty\{display:flex!important\}/);
});

test('фокус бренда остаётся доступным без рамки вокруг всего названия', () => {
  assert.match(chromeCss, /\.site-header \.brand:focus-visible\{outline:none\}/);
  assert.match(
    chromeCss,
    /\.site-header \.brand:focus-visible \.b-para\{\s*outline:2px solid var\(--wax\)/
  );
  assert.match(
    chromeCss,
    /\.site-header \.brand:focus-visible \.b-name\{\s*text-decoration-line:underline/
  );
});
