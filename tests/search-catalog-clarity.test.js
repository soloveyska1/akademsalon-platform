const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const chromeCss = read('assets/css/polish15-chrome.css');
const homeStory = read('assets/css/home-story.css');
const catalogCss = read('assets/css/polish15-catalog.css');
const chromeJs = read('assets/js/polish15-chrome.js');
const catalogJs = read('assets/js/polish15-catalog.js');
const services = read('services.html');
const homeReleaseCss = read('assets/css/home-release.min.css');
const releaseWave = '20260803out007search1';
const triggerWave = '20260803out007trigger1';

function assertPattern(source, pattern, message) {
  assert.ok(pattern.test(source), message);
}

function bootSearchIndex(rows) {
  const listeners = {};
  const context = {
    window: {
      Salon: { navData: { SEARCH: rows, GROUPS: [], DOCS: [] } },
      HTMLDialogElement: function HTMLDialogElement() {},
      addEventListener() {},
      innerWidth: 1440,
      scrollY: 0,
    },
    document: {
      documentElement: {},
      readyState: 'loading',
      addEventListener(name, callback) { listeners[name] = callback; },
    },
    requestAnimationFrame(callback) { callback(); },
    location: { href: 'https://akademsalon.ru/services.html' },
    console,
  };
  vm.runInNewContext(chromeJs, context, { filename: 'polish15-chrome.js' });
  assert.ok(context.window.Salon.searchIndex, 'shared search must expose its deterministic test seam');
  return context.window.Salon.searchIndex;
}

test('gate 1: catalogue and mobile search geometry reserve header and dock space', () => {
  assertPattern(chromeCss, /--site-header-h:\s*70px/, 'shared desktop header height is not explicit');
  assertPattern(chromeCss, /--site-header-h:\s*calc\(var\(--mobile-appbar-h,62px\) \+ env\(safe-area-inset-top\)\)/, 'shared mobile appbar height is not explicit');
  assertPattern(catalogCss, /--catalog-header-offset:\s*var\(--site-header-h,70px\)/, 'catalogue does not consume the shared header height');
  assertPattern(catalogCss, /\.p15-catalog \.catalog-toolbar\s*\{[\s\S]*?top:\s*var\(--catalog-header-offset\)/, 'toolbar does not use the shared header offset');
  assertPattern(catalogCss, /body\.page-services \.p15-catalog\s*\{[\s\S]*?padding-bottom:\s*var\(--mobile-bottom-clear\)/, 'catalogue does not reserve dock-safe flow space');
  assertPattern(catalogCss, /\.p15-catalog \.catalog-toolbar\s*\{[\s\S]*?scroll-margin-bottom:\s*var\(--mobile-bottom-clear\)/, 'toolbar lacks dock-safe scroll margin');

  const correctedSearchLayer = `${homeStory}\n${chromeCss}`;
  assertPattern(correctedSearchLayer, /@media\(max-width:480px\)[\s\S]*?\.overlay--search \.search-results>\.search-result\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,1fr\) 34px/, '390 result title is still constrained by the tag column');
  assertPattern(correctedSearchLayer, /\.overlay--search \.search-suggestions button\s*\{[\s\S]*?min-height:\s*44px/, 'suggestion chips are below the touch-target floor');
  assertPattern(correctedSearchLayer, /\.overlay--search \.search-suggestions>div\s*\{[\s\S]*?-webkit-mask-image:\s*linear-gradient/, 'horizontal suggestions have no overflow affordance');
  assertPattern(correctedSearchLayer, /@media\(prefers-reduced-motion:reduce\)[\s\S]*?\.overlay--search \.search-close:hover,[\s\S]*?transform:\s*none/, 'search close motion is not disabled for reduced-motion users');
  assertPattern(homeReleaseCss, /grid-template-columns:minmax\(0,1fr\) 34px/, 'generated home bundle does not contain the corrected mobile result row');
  assertPattern(homeReleaseCss, /-webkit-mask-image:linear-gradient/, 'generated home bundle lacks the chip overflow affordance');
  assertPattern(homeReleaseCss, /@media\(min-width:921px\) and \(max-width:1240px\)\{body \.site-header:not\(\.site-header--account\) \.header-action--search,body \.site-header--account \.header-action--search\{display:inline-flex\}\}/, 'generated home bundle lacks the continuous desktop trigger range');
});

test('gate 2: the corrected editorial search layer has one shared owner', () => {
  assert.equal(/SEARCH · редакционная командная палитра/.test(homeStory), false, 'home still owns the shared search layer');
  assert.equal(/:root\[data-theme="dark"\] \.overlay--search \.overlay__panel\s*\{[\s\S]*?background:#11100e/.test(homeStory), false, 'home keeps a stale post-move dark override');
  assert.match(chromeCss, /SHARED SEARCH · редакционная командная палитра/);
  assert.match(chromeCss, /\.overlay--search \.search-brand/);
  assert.match(chromeCss, /\.overlay--search \.search-field-shell/);
  assert.match(chromeCss, /:root\[data-theme="dark"\] \.overlay--search/);
});

test('gate 3: services has facets, while global search owns the only text query', () => {
  assert.equal(/data-service-search/.test(services), false, 'services still renders a second text search');
  assert.equal(/class="catalog-search"/.test(services), false, 'services still renders the local search shell');
  assert.equal(/data-service-search/.test(catalogJs), false, 'catalogue runtime still owns text-query behavior');
  assert.match(services, /data-service-filter="all"/);
  assert.match(chromeJs, /SEARCH_QUERY_ALIASES/);
  assert.match(chromeJs, /aria-atomic="true"/);
  assert.match(chromeJs, /Найдено: 0/);
});

test('gate 3: aliases and ranking are deterministic for the frozen query matrix', () => {
  const index = bootSearchIndex([
    ['komissiya-0.html', 'Комиссия №0', 'защита оппонент протокол'],
    ['kursovaya-po-ekonomike.html', 'Курсовая по экономике', 'экономика дисциплина'],
    ['diplomnaya-po-ekonomike.html', 'Диплом по экономике', 'экономика вкр дисциплина'],
    ['normokontrol-vkr.html', 'Нормоконтроль ВКР и курсовой', 'вкр гост оформление'],
    ['audit-temy-vkr.html', 'Бесплатная проверка темы ВКР', 'вкр тема аудит'],
    ['diplomnaya-rabota.html', 'Дипломная / ВКР — услуга', 'диплом вкр выпускная'],
    ['razbor-zamechaniy-nauchruka.html', 'Разбор замечаний научного руководителя', 'научрук замечания'],
    ['kursovaya-po-ekonomike.html', 'Экономика для курсовой', 'дубликат маршрута'],
  ]);

  assert.deepEqual(
    Array.from(index.search('экономика'), (row) => row.href),
    ['kursovaya-po-ekonomike.html', 'diplomnaya-po-ekonomike.html'],
  );
  for (const query of ['диплом', 'дипломная', 'дипломная работа', 'ВКР', 'выпускная квалификационная']) {
    assert.equal(index.search(query)[0].href, 'diplomnaya-rabota.html', `${query}: work type must rank first`);
  }
  for (const query of ['дипломная по экономике', 'выпускная квалификационная по экономике']) {
    assert.equal(index.search(query)[0].href, 'diplomnaya-po-ekonomike.html', `${query}: composite alias must preserve discipline`);
  }
  assert.equal(index.search('научрук')[0].href, 'razbor-zamechaniy-nauchruka.html');
  assert.equal(index.search('научный руководитель')[0].href, 'razbor-zamechaniy-nauchruka.html');
  assert.equal(index.search('НАУЧ-РУК')[0].href, 'razbor-zamechaniy-nauchruka.html');
  assert.equal(index.search('ДИПЛОМНАЯ / ВКР')[0].href, 'diplomnaya-rabota.html');
  assert.deepEqual(
    Array.from(index.search('КУРСОВАЯ, экономика!'), (row) => row.href),
    ['kursovaya-po-ekonomike.html'],
  );
  assert.equal(index.normalize(' Ёлка / ВКР—тест '), 'елка вкр тест');
  assert.equal(index.canonicalize(' Дипломная работа по экономике '), 'вкр по экономика');
  assert.deepEqual(Array.from(index.search('несуществующий абракадабра')), []);

  const lateExact = bootSearchIndex([
    ...Array.from({ length: 14 }, (_, i) => [`tag-${i}.html`, `Материал ${i}`, 'альфа']),
    ['exact.html', 'Альфа', 'точное совпадение'],
  ]);
  assert.equal(lateExact.search('альфа')[0].href, 'exact.html', 'ranking must finish before the 12-result limit');
});

test('gate 3: zero results are outside the listbox and status has one live owner', () => {
  assert.equal((chromeJs.match(/aria-live="polite"/g) || []).length, 1);
  assert.match(chromeJs, /data-search-results-meta role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(chromeJs, /data-search-empty hidden/);
  assert.match(chromeCss, /\.overlay--search \.search-empty\[hidden\]\s*\{display:none\}/);
  assert.match(chromeJs, /id="p15SearchResults" role="listbox" aria-label="Результаты поиска" hidden/);
  assert.doesNotMatch(chromeJs, /role="listbox"[^>]*aria-live/);
  assert.match(chromeJs, /resultsBox\.hidden = true/);
  assert.match(chromeJs, /searchField\.removeAttribute\('aria-activedescendant'\)/);
});

test('gate 2: every shared CSS consumer and the home CSS bundle use one cache wave', () => {
  const files = fs.readdirSync(root).filter((file) => file.endsWith('.html'));
  let cssConsumers = 0;
  for (const file of files) {
    const html = read(file);
    if (/polish15-chrome\.css\?/.test(html)) cssConsumers += 1;
    for (const match of html.matchAll(/polish15-chrome\.css\?([^"']+)/g)) {
      const params = new URLSearchParams(match[1].replaceAll('&amp;', '&'));
      assert.equal(params.get('search'), releaseWave, `${file}: stale shared-search cache key`);
      assert.equal(params.get('trigger'), triggerWave, `${file}: stale search-trigger cache key`);
    }
  }
  assert.equal(cssConsumers, 89, 'unexpected shared-search CSS consumer inventory');

  const home = read('index.html');
  const match = home.match(/home-release\.min\.css\?([^"']+)/);
  assert.ok(match, 'home CSS bundle is missing');
  const params = new URLSearchParams(match[1].replaceAll('&amp;', '&'));
  assert.equal(params.get('search'), releaseWave, 'home CSS bundle lacks the search cache wave');
  assert.equal(params.get('trigger'), triggerWave, 'home CSS bundle lacks the search-trigger cache wave');
});

test('gate 3: every shared JS consumer and the home JS bundle use one cache wave', () => {
  const files = fs.readdirSync(root).filter((file) => file.endsWith('.html'));
  let jsConsumers = 0;
  for (const file of files) {
    const html = read(file);
    if (/polish15-chrome\.js\?/.test(html)) jsConsumers += 1;
    for (const match of html.matchAll(/polish15-chrome\.js\?([^"']+)/g)) {
      const params = new URLSearchParams(match[1].replaceAll('&amp;', '&'));
      assert.equal(params.get('search'), releaseWave, `${file}: stale shared-search JS cache key`);
    }
  }
  assert.equal(jsConsumers, 88, 'unexpected shared-search JS consumer inventory');

  const home = read('index.html');
  const match = home.match(/home-release\.min\.js\?([^"']+)/);
  assert.ok(match, 'home JS bundle is missing');
  const params = new URLSearchParams(match[1].replaceAll('&amp;', '&'));
  assert.equal(params.get('search'), releaseWave, 'home JS bundle lacks the search cache wave');

  const catalogConsumers = files.filter((file) => /polish15-catalog\.(?:css|js)\?/.test(read(file)));
  assert.equal(catalogConsumers.length, 24, 'unexpected catalog consumer inventory');
  for (const file of catalogConsumers) {
    const html = read(file);
    for (const asset of ['css', 'js']) {
      const assetMatch = html.match(new RegExp(`polish15-catalog\\.${asset}\\?([^"']+)`));
      assert.ok(assetMatch, `${file}: missing catalog ${asset}`);
      const assetParams = new URLSearchParams(assetMatch[1].replaceAll('&amp;', '&'));
      assert.equal(assetParams.get('search'), releaseWave, `${file}: stale catalog ${asset} cache key`);
    }
  }
});

test('protected catalogue inventory remains physically unchanged', () => {
  assert.equal((services.match(/<article class="service-card/g) || []).length, 12);
  assert.equal((services.match(/data-discipline-card/g) || []).length, 9);
  assert.equal((services.match(/<a class="service-card__link" href="/g) || []).length, 12);
  const jsonLd = [...services.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
  const itemList = jsonLd.find((entry) => entry['@type'] === 'ItemList');
  assert.ok(itemList, 'services ItemList is missing');
  assert.equal(itemList.itemListElement.length, 13);
});
