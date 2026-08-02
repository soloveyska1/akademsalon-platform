const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const releaseKey = '20260802release98';
const shellRuntimeKey = '20260803out003shell1';
const changedAssets = new Set([
  'assets/css/cart.css',
  'assets/css/chrome.css',
  'assets/css/polish15-chrome.css',
  'assets/css/styles.css',
  'assets/css/mobile.css',
  'assets/css/polish15-account.css',
  'assets/css/polish15-admin.css',
  'assets/css/polish15-catalog.css',
  'assets/css/commission-zero.css',
  'assets/css/polish15-configurator.css',
  'assets/css/polish15-home.css',
  'assets/css/home-intro.css',
  'assets/css/home-release.min.css',
  'assets/css/polish15-library.css',
  'assets/css/polish15-operations.css',
  'assets/css/polish15-reading.css',
  'assets/css/polish15-specification.css',
  'assets/css/polish15-supporting.css',
  'assets/js/admin.js',
  'assets/js/app.js',
  'assets/js/polish15-chrome.js',
  'assets/js/cabinet.js',
  'assets/js/cart.js',
  'assets/js/extras.js',
  'assets/js/home-intro.js',
  'assets/js/home-release.min.js',
  'assets/js/knowledge.js',
  'assets/js/polish15-catalog.js',
  'assets/js/commission-zero.js',
  'assets/js/polish15-operations.js',
  'assets/js/polish15-reading.js',
  'assets/js/polish15-supporting.js',
]);
const shellAssets = new Set([
  'assets/css/chrome.css',
  'assets/css/home-release.min.css',
  'assets/css/mobile.css',
  'assets/css/polish15-chrome.css',
  'assets/js/app.js',
  'assets/js/extras.js',
  'assets/js/home-release.min.js',
]);

test('every changed public asset uses the release cache key', () => {
  const htmlFiles = fs.readdirSync(root).filter(
    (file) => file.endsWith('.html') && file !== 'zk-test.html',
  );
  let references = 0;

  for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of html.matchAll(/(?:href|src)="(assets\/(?:css|js)\/[^"]+)"/g)) {
      const url = match[1].replaceAll('&amp;', '&');
      const assetPath = url.split('?')[0];
      if (!changedAssets.has(assetPath)) continue;
      references += 1;
      const query = new URLSearchParams(url.split('?')[1] || '');
      const expectedKey = shellAssets.has(assetPath)
        ? shellRuntimeKey
        : releaseKey;
      assert.equal(query.get('v'), expectedKey, `${file}: ${assetPath}`);
    }
  }

  assert.ok(references > 100, `expected broad cache coverage, found ${references} references`);

  const app = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
  assert.doesNotMatch(app, /mobile\.css\?v=(?!20260803out003shell1)/);
});
