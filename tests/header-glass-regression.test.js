const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

/* Шапка больше НЕ стеклянная — решение владельца от 2026-08-04, отменяющее
   прежний «liquid-glass». Причина замерена: при 14% собственной краски в
   светлой теме и 12% в тёмной цвет шапки определяла страница под ней, и по
   47 страницам она принимала ПЯТЬ разных фонов, включая серый #d1cdc4;
   девиз «Редакторская мастерская» на девяти страницах падал до 3.26 при
   норме AA 4.5. Стало: один тон в каждой теме (#e9ddcc и #1e1d19), альфа 1,
   блюра нет, худший контраст 4.66. Прежние стеклянные правила оставлены в
   листе как история решения — их перекрывает финальный непрозрачный слой,
   поэтому тест проверяет именно его. */
test('shared header stays opaque so its colour never depends on the page beneath', () => {
  const chrome = read('assets/css/polish15-chrome.css');
  const finalLayer = chrome.slice(chrome.lastIndexOf('HEADER GLASS'));

  assert.match(finalLayer, /background:var\(--paper\)!important/);
  assert.match(finalLayer, /backdrop-filter:none!important/);
  assert.match(finalLayer, /html\.header-scrolled body \.site-header/);
  /* Палитра шапки закреплена локально: страничные слои переопределяют --paper
     под свой лист (polish15-reading и соседи — на #faf6ee), и без этого даже
     непрозрачная шапка красилась бы по-разному. */
  assert.match(chrome, /body \.site-header,\s*\n\s*body \.mobile-appbar\{[\s\S]*?--paper:#E9DDCC/);
});

test('header popover stays opaque and readable above page content', () => {
  const chrome = read('assets/css/polish15-chrome.css');
  const finalLayer = chrome.slice(chrome.lastIndexOf('HEADER GLASS'));
  const popover = finalLayer.slice(finalLayer.lastIndexOf('body .site-header .header-nav-popover{'));

  assert.match(popover, /background:var\(--sheet\)/);
  assert.match(popover, /color:var\(--ink\)/);
  assert.match(popover, /backdrop-filter:none/);
});

test('brand lockup keeps one calm editorial descriptor', () => {
  const app = read('assets/js/app.js');
  const chrome = read('assets/css/polish15-chrome.css');

  assert.match(app, /brand__motto-default">Редакторская мастерская/);
  assert.doesNotMatch(app, /brand__motto-hover/);
  assert.match(chrome, /@keyframes header-seal-alive/);
  assert.match(chrome, /brand\.brand--wordmark:hover \.brand__motto-hover/);
  assert.match(chrome, /@media\(prefers-reduced-motion:reduce\)/);
});

test('header actions share one control geometry and account mode removes duplicate acquisition actions', () => {
  const app = read('assets/js/app.js');
  const chrome = read('assets/css/polish15-chrome.css');
  const headerTemplate = app.slice(app.indexOf("header.innerHTML ="), app.indexOf("insertChromeAfterSkip(header)"));
  const finalLayer = chrome.slice(chrome.lastIndexOf('финальная мера шапки'));

  assert.doesNotMatch(headerTemplate, /header-master-link/);
  assert.match(app, /calcLabel = 'Подобрать помощь'/);
  assert.match(app, /var accountChrome = document\.body\.classList\.contains\('is-account-route'\)/);
  assert.match(headerTemplate, /accountChrome \? '' :[\s\S]*?class="header-action nav-cab"/);
  assert.match(headerTemplate, /accountChrome \? '' : '<a class="button button--primary/);
  assert.match(finalLayer, /\.header-action,[\s\S]*?width:44px;[\s\S]*?height:44px;/);
  assert.match(finalLayer, /\.site-header--account \.header-menu-button\{display:grid\}/);
  assert.match(app, /aria-controls="p15MenuDialog"/);
  assert.match(app, /main\.innerHTML = 'Продолжить подбор/);
  assert.doesNotMatch(app, /main\.innerHTML = 'Продолжить дело/);
});

test('desktop search trigger has no reachability gap after the mobile breakpoint', () => {
  const chrome = read('assets/css/polish15-chrome.css');
  const mobile = read('assets/css/mobile.css');
  const finalMeasure = chrome.lastIndexOf('финальная мера шапки');
  const sharedSearch = chrome.indexOf('SHARED SEARCH · редакционная командная палитра', finalMeasure);
  const finalHeader = chrome.slice(finalMeasure, sharedSearch);

  assert.match(finalHeader, /@media\s*\(min-width:920px\) and \(max-width:1240px\)\s*\{[\s\S]*?body \.site-header:not\(\.site-header--account\) \.header-action--search,[\s\S]*?body \.site-header--account \.header-action--search\s*\{[\s\S]*?display:inline-flex;/);
  assert.ok(
    finalHeader.lastIndexOf('display:inline-flex') > finalHeader.lastIndexOf('header-action--search{display:none}'),
    'the 921–1240 search rescue must follow every final hide rule',
  );
  assert.match(finalHeader, /\.header-action,[\s\S]*?width:44px;[\s\S]*?height:44px;/);
  assert.match(
    mobile,
    /@media screen and \(max-width:920px\)[\s\S]*?\.site-header\{display:none!important\}/,
    'the desktop parent must remain hidden through 920px while the rescue begins at 920px',
  );
});

test('shared menu uses the same CTA vocabulary and drawn close mark as the header', () => {
  const chromeJs = read('assets/js/polish15-chrome.js');
  assert.match(chromeJs, /href="configurator\.html">Подобрать помощь/);
  assert.doesNotMatch(chromeJs, /Подобрать помощь и узнать цену/);
  assert.match(chromeJs, /aria-label="Закрыть меню"><i aria-hidden="true"><\/i>/);
});

test('cabinet skip link precedes chrome and points to the live workspace', () => {
  const app = read('assets/js/app.js');
  const dashboard = read('dashboard.html');
  const bodyStart = dashboard.slice(dashboard.indexOf('<body'), dashboard.indexOf('<div class="account-page"'));

  assert.match(bodyStart, /workspace-skip-link" href="#accountWorkspace"/);
  assert.match(app, /querySelector\('\.skip-link, \.workspace-skip-link'\)/);
});

test('mobile appbar inherits the same translucent material', () => {
  const mobile = read('assets/css/mobile.css');
  const finalLayer = mobile.slice(mobile.lastIndexOf('Мобильное продолжение стеклянной шапки'));

  assert.match(finalLayer, /background:color-mix\(in srgb,var\(--paper\) 14%,transparent\)!important/);
  assert.match(finalLayer, /backdrop-filter:blur\(20px\) saturate\(1\.28\)/);
});
