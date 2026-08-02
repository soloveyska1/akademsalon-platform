const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const home = read('index.html');
const css = read('assets/css/home-intro.css');
const js = read('assets/js/home-intro.js');

test('intro is a home-only layer before the existing content landmark', () => {
  assert.equal((home.match(/data-salon-intro/g) || []).length, 1);
  assert.ok(home.indexOf('data-salon-intro') < home.indexOf('<main id="main"'));
  assert.match(home, /Академический[\s\S]*Салон/);
  assert.match(home, /Работаем, пока ты отдыхаешь[\s\S]*— с гарантией\./);
  assert.doesNotMatch(
    home.match(/<div class="salon-intro"[\s\S]*?<\/div>\s*\n\s*<a class="skip-link"/)?.[0] || '',
    /<h1\b|<main\b/,
  );
});

test('intro fails open and respects repeat, calm and reduced-motion preferences', () => {
  assert.match(css, /\.salon-intro\{\s*display:none;/);
  assert.match(home, /sessionStorage\.getItem\('salon_home_intro_v6'\)/);
  assert.match(home, /localStorage\.getItem\('salon_home_intro_v6'\)/);
  assert.match(home, /seenThisVersion/);
  assert.match(home, /var previewAlways = false/);
  assert.match(home, /previewAlways \|\| entryAllowed/);
  assert.match(home, /var shouldPlay = !skip && storageReady/);
  assert.match(home, /skip = params\.get\('intro'\) === 'skip'/);
  assert.doesNotMatch(home, /24 \* 60 \* 60 \* 1000/);
  assert.match(home, /prefers-reduced-motion: reduce/);
  assert.match(home, /navigator\.connection && navigator\.connection\.saveData/);
  assert.match(home, /salon_calm/);
  assert.match(css, /html\[data-calm\]\.salon-intro-pending/);
  assert.match(css, /@media print[\s\S]*?\.salon-intro/);
});

test('intro supports both themes, mobile composition and accessible dismissal', () => {
  assert.match(css, /--intro-canvas:#E9DDCC/);
  assert.match(css, /:root\[data-theme="dark"\]\.salon-intro-pending/);
  assert.match(css, /--intro-canvas:#171714/);
  assert.match(home, /assets\/img\/logo-mark\.svg/);
  assert.match(css, /\.salon-intro__logo/);
  assert.match(css, /\.salon-intro__panel--left/);
  assert.match(css, /\.salon-intro__panel--right/);
  assert.match(css, /@media\(max-width:920px\)/);
  assert.match(home, /<button class="salon-intro__skip" type="button" data-intro-skip aria-label="Пропустить вступление">/);
  assert.match(home, /data-salon-intro role="dialog" aria-modal="true"/);
  assert.match(js, /event\.key === 'Escape'/);
  assert.match(js, /event\.persisted/);
  assert.match(js, /document\.visibilityState === 'hidden'/);
  assert.match(js, /setAttribute\('inert'/);
  assert.match(js, /setAttribute\('aria-hidden','true'\)/);
  assert.match(js, /removeAttribute\('inert'/);
});

test('intro JavaScript is syntactically valid and has bounded cleanup', () => {
  assert.doesNotThrow(() => new vm.Script(js));
  assert.match(home, /}, 3200\);/);
  assert.match(js, /}, 2050\)\);/);
  assert.match(js, /}, 420\)\);/);
  assert.match(js, /removeChild\(intro\)/);
});
