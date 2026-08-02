const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('home limits each visible decision scene to two or three actions', () => {
  const home = read('index.html');
  const between = (start, end) => home.slice(home.indexOf(start), home.indexOf(end));

  const hero = between('<section class="case-hero"', '<section class="guided-situations');
  const situations = between('<section class="guided-situations', '<section class="guided-results');
  const results = between('<section class="guided-results', '<section class="guided-proof');
  const proof = between('<section class="guided-proof', '<section class="guided-process');
  const final = between('<section class="guided-final', '<section class="case-confidence-shell');

  assert.equal((hero.match(/class="hero-act__cta/g) || []).length, 2);
  assert.equal((situations.match(/<a href=/g) || []).length, 3);
  assert.equal((results.match(/class="guided-button/g) || []).length, 2);
  assert.equal((proof.match(/class="guided-button/g) || []).length, 2);
  assert.equal((final.match(/class="guided-button/g) || []).length, 2);
  assert.match(home, /class="case-ecosystem[^"]*"[^>]+hidden/);
  assert.match(home, /class="case-dossier"[^>]+hidden/);
});

test('guided home keeps the brand and responsive dark visual contract', () => {
  const css = read('assets/css/home-guided.css');
  const build = read('scripts/build-home-release.mjs');

  assert.match(build, /'assets\/css\/home-guided\.css'/);
  assert.match(css, /--guided-canvas:#efe5d6/);
  assert.match(css, /--guided-wax:#a63f29/);
  assert.match(css, /--guided-canvas:#15110e/);
  assert.match(css, /--guided-sheet:#25201b/);
  assert.match(css, /--guided-wax:#e56e52/);
  assert.match(css, /--guided-action:#b44a36/);
  assert.match(css, /\.home-guided \.guided-passport\{[\s\S]*?border-top:3px solid var\(--guided-wax\)/);
  assert.match(css, /@media \(max-width:620px\)/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)/);
});
