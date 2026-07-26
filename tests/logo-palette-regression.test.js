const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const referenceCss = fs.readFileSync(path.join(root, 'style-lab/full/style.css'), 'utf8');
const productionCss = fs.readFileSync(path.join(root, 'assets/css/polish15-chrome.css'), 'utf8');
const canonicalLogo = fs.readFileSync(path.join(root, 'bimi/logo.svg'), 'utf8');

function tokenValues(css, token) {
  return [...css.matchAll(new RegExp(`${token}\\s*:\\s*([^;]+);`, 'gi'))]
    .map((match) => match[1].replace(/\s+/g, '').toLowerCase());
}

test('reference and production share the exact light and dark logo optics', () => {
  for (const token of [
    '--logo-ring',
    '--logo-ring-edge',
    '--logo-shadow-rest',
    '--logo-shadow-hover',
    '--logo-filter',
    '--logo-filter-pulse',
    '--logo-filter-hover',
  ]) {
    const reference = tokenValues(referenceCss, token);
    const production = tokenValues(productionCss, token);

    assert.equal(reference.length, 2, `${token} must have light and dark reference values`);
    assert.deepEqual(production, reference, `${token} must be identical in reference and production`);
  }
});

test('all logo implementations retain the canonical BIMI palette', () => {
  for (const color of ['#8C2D18', '#B23B22', '#C65B41', '#F6F1E7']) {
    assert.ok(canonicalLogo.includes(color), `canonical logo must retain ${color}`);
    assert.ok(productionCss.includes(color), `production inline logo must use canonical ${color}`);
  }
  assert.match(productionCss, /background:#F6F1E7;/);
});

test('logo motion is delicate and respects every opt-out', () => {
  for (const css of [referenceCss, productionCss]) {
    assert.match(css, /@keyframes salon-logo-breathe/);
    assert.match(css, /animation:\s*salon-logo-breathe 8\.4s ease-in-out infinite/);
    assert.match(css, /scale\(1\.008\)/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.match(css, /data-motion="off"/);
    assert.match(css, /data-calm/);
  }
});
