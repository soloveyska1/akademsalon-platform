const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'assets/js/polish15-chrome.js'), 'utf8');
const shared = fs.readFileSync(path.join(root, 'assets/css/polish15-chrome.css'), 'utf8');
const searchLayer = shared.slice(shared.lastIndexOf('SHARED SEARCH ·'));

test('search dialog has a branded header and an intentional empty state', () => {
  assert.match(js, /class="search-brand"/);
  assert.match(js, /Поиск по мастерской/);
  assert.match(js, /class="search-field-shell"/);
  assert.match(js, /class="search-zero-state" data-search-zero/);
  assert.match(js, /Начните с задачи своими словами/);
});

test('search close button uses a stable drawn mark instead of a text glyph', () => {
  assert.match(js, /class="icon-button icon-button--close search-close"[\s\S]*?<i aria-hidden="true"><\/i>/);
  assert.match(searchLayer, /\.overlay--search \.search-close i,/);
  assert.match(searchLayer, /\.overlay--search \.search-close:hover,[\s\S]*?transform:rotate\(90deg\)/);
});

test('search palette is responsive and supports both themes', () => {
  assert.match(searchLayer, /--search-head:#1b1916/);
  assert.match(searchLayer, /:root\[data-theme="dark"\] \.overlay--search/);
  assert.match(searchLayer, /width:min\(calc\(100% - 36px\),880px\)/);
  assert.match(searchLayer, /@media\(max-width:760px\)/);
});
