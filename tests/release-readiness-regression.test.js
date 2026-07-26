const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('stage tabs use an allowed tabpanel host and the review preview has intrinsic size', () => {
  const home = read('index.html');
  assert.equal((home.match(/<section class="case-stage-panel/g) || []).length, 4);
  assert.doesNotMatch(home, /<article[^>]+role="tabpanel"/);
  assert.match(
    home,
    /review-04\.webp"[^>]+width="591"[^>]+height="816"/,
  );
});

test('reviews use lightweight thumbnails while retaining full evidence for the lightbox', () => {
  const reviews = read('reviews.html');
  const thumbnailRefs = [...reviews.matchAll(
    /<img src="assets\/img\/reviews\/thumbs\/review-\d+\.webp"[^>]+width="\d+"[^>]+height="\d+"/g,
  )];
  const fullRefs = [...reviews.matchAll(
    /data-full="assets\/img\/reviews\/review-\d+\.webp"/g,
  )];
  assert.equal(thumbnailRefs.length, 48);
  assert.equal(fullRefs.length, 48);
  assert.equal((reviews.match(/loading="eager"/g) || []).length, 1);
  assert.equal((reviews.match(/fetchpriority="high"/g) || []).length, 1);
  assert.equal(fs.readdirSync(path.join(root, 'assets/img/reviews/thumbs')).length, 48);
});

test('social preview is the exact share-card size and stays within its payload budget', () => {
  const file = path.join(root, 'assets/img/og-cover-v3.png');
  const image = fs.readFileSync(file);
  assert.equal(image.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
  assert.ok(image.length < 1_300_000, `OG image is too large: ${image.length} bytes`);
});

test('horizontal comparison is a keyboard reachable named region', () => {
  const formats = read('vedenie.html');
  assert.match(
    formats,
    /class="comparison-table" tabindex="0" role="region" aria-label="Сравнение форматов сопровождения"/,
  );
});

test('consent choice stays compact, equal and non-blocking', () => {
  const extras = read('assets/js/extras.js');
  const chrome = read('assets/css/polish15-chrome.css');
  const mobile = read('assets/css/mobile.css');
  assert.match(extras, /Отказ не мешает сайту и заказу; черновик остаётся на вашем устройстве/);
  assert.match(chrome, /:root\.has-consent-bar \.lrail\{[\s\S]*?width:min\(1120px,calc\(100vw - 48px\)\)/);
  assert.match(chrome, /grid-template-areas:\s*"head copy actions"\s*"foot foot foot"/);
  assert.match(mobile, /:root\.has-consent-bar \.lrail \.cookiebar \.cb-head\{\s*display:none/);
  assert.match(mobile, /grid-template-columns:1fr 1fr/);
});

test('saved-draft card resets the legacy night palette in both themes', () => {
  const ecosystem = read('assets/css/home-ecosystem.css');
  assert.match(
    ecosystem,
    /\.home-case \.resume-card\{[\s\S]*?background:var\(--case-sheet\);[\s\S]*?color:var\(--ink\);/,
  );
  assert.match(
    ecosystem,
    /\.home-case \.resume-card__seal\{[\s\S]*?background:transparent;[\s\S]*?box-shadow:none;[\s\S]*?color:var\(--wax\);/,
  );
  assert.match(
    ecosystem,
    /\.home-case \.resume-card h2\{[\s\S]*?color:var\(--ink\);/,
  );
  assert.match(
    ecosystem,
    /\.home-case \.resume-card \.eyebrow\{\s*color:var\(--ink-soft\);/,
  );
});

test('home release build pins its compiler and complete ordered source set', () => {
  const build = read('scripts/build-home-release.mjs');
  assert.match(build, /const esbuildVersion = '0\.28\.1'/);
  assert.match(build, /const purgeCssVersion = '7\.0\.2'/);
  for (const source of [
    'assets/css/styles.css',
    'assets/css/chrome.css',
    'assets/css/polish15-chrome.css',
    'assets/css/extras.css',
    'assets/css/polish15-home.css',
    'assets/css/commission-zero.css',
    'assets/css/home-intro.css',
    'assets/css/home-ecosystem.css',
    'assets/css/mobile.css',
    'assets/js/app.js',
    'assets/js/polish15-chrome.js',
    'assets/js/extras.js',
    'assets/js/home-intro.js',
    'assets/js/home-ecosystem.js',
  ]) {
    assert.match(build, new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('home loads only the reproducible release bundles', () => {
  const home = read('index.html');
  assert.match(home, /assets\/css\/home-release\.min\.css\?v=20260726release33" data-mobile-edition="1"/);
  assert.match(home, /assets\/js\/home-release\.min\.js\?v=20260726release33/);
  assert.doesNotMatch(home, /assets\/css\/(?:styles|chrome|polish15-chrome|extras|polish15-home|commission-zero|home-intro|home-ecosystem|mobile)\.css/);
  assert.doesNotMatch(home, /assets\/js\/(?:app|polish15-chrome|extras|home-intro|home-ecosystem)\.js/);
});

test('the shared search and menu dialogs close explicitly on Escape', () => {
  const chrome = read('assets/js/polish15-chrome.js');
  assert.match(
    chrome,
    /if \(\(e\.key === 'Escape' \|\| e\.keyCode === 27\) && anyOpen\(\)\) \{[\s\S]*?e\.preventDefault\(\);[\s\S]*?closeAll\(\);/,
  );
});

test('shared dialogs restore focus to the exact trigger that opened them', () => {
  const app = read('assets/js/app.js');
  const chrome = read('assets/js/polish15-chrome.js');
  assert.match(app, /Salon\.toc\.open\(t\)/);
  assert.match(app, /Salon\.toc\.open\(search\)/);
  assert.match(chrome, /openSearch\(hit\)/);
  assert.match(
    chrome,
    /open: function \(trigger\) \{[\s\S]*?openDialog\(menuDlg, activeTrigger\);/,
  );
  assert.match(
    chrome,
    /if \(!silent && lastTrigger && lastTrigger\.focus && document\.contains\(lastTrigger\)\) \{[\s\S]*?lastTrigger\.focus\(\);/,
  );
});

test('the 320px appbar hides the compressed brand lockup without losing its accessible text', () => {
  const mobile = read('assets/css/mobile.css');
  const app = read('assets/js/app.js');
  assert.match(
    mobile,
    /@media screen and \(max-width:350px\)\{[\s\S]*?\.mobile-appbar__brand>span\{[\s\S]*?clip-path:inset\(50%\)/,
  );
  assert.match(
    app,
    /<span class="b-lockup brand__name"><strong class="b-full">Академический Салон<\/strong>[\s\S]*?<small>Редакторская мастерская<\/small><\/span>/,
  );
});
