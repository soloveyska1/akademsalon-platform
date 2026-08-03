const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const servicePages = [
  'kursovaya-rabota.html',
  'diplomnaya-rabota.html',
  'magisterskaya-dissertaciya.html',
  'kandidatskaya-dissertaciya.html',
  'nauchnaya-statya.html',
  'otchet-po-praktike.html',
  'referat.html',
  'normokontrol-vkr.html',
  'plan.html',
  'razbor-zamechaniy-nauchruka.html',
  'redaktura-posle-ii.html',
  'avtorskiy-zakaz.html',
  'dorabotka-otcheta-po-praktike.html',
  'kursovaya-po-ekonomike.html',
  'kursovaya-po-psihologii.html',
  'kursovaya-po-yurisprudencii.html',
  'kursovaya-po-pedagogike.html',
  'kursovaya-po-menedzhmentu.html',
  'kursovaya-po-informatike.html',
  'diplomnaya-po-ekonomike.html',
  'diplomnaya-po-psihologii.html',
  'diplomnaya-po-yurisprudencii.html'
];

const catalogConsumers = ['services.html', 'tariffs.html', ...servicePages];
const expectedSituationRoutes = {
  topic: 'diagnostic',
  draft: 'editing',
  comments: 'diagnostic',
  defense: 'defense'
};
const allowedRouteKeys = new Set(['work', 'discipline', 'situation', 'result', 'route', 'service']);
const allowedSituations = new Set(Object.keys(expectedSituationRoutes));
const allowedResults = new Set(['diagnostic', 'support', 'editing', 'formatting', 'ai_editing', 'defense']);
const allowedOrigins = new Set(['page', 'service', 'price']);

function count(source, pattern) {
  return (source.match(pattern) || []).length;
}

function attr(tag, name) {
  const match = tag.match(new RegExp('\\b' + name + '="([^"]*)"'));
  return match ? match[1] : '';
}

function decodeHtmlUrl(value) {
  return value.replace(/&amp;/g, '&');
}

function functionSlice(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, `missing function ${name}`);
  const next = source.indexOf('\n  function ', start + 10);
  return source.slice(start, next === -1 ? source.length : next);
}

function relativeLuminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map((pair) => {
    const value = parseInt(pair, 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test('fresh services state requires one selected situation before one continuation', () => {
  const html = read('services.html');
  const controls = [...html.matchAll(/<(?:button|input)\b[^>]*\bdata-service-situation="[^"]+"[^>]*>/g)]
    .map((match) => match[0]);

  assert.equal(controls.length, 4, 'fresh state must expose exactly four selectable situations');
  assert.deepEqual(
    Object.fromEntries(controls.map((tag) => [attr(tag, 'data-service-situation'), attr(tag, 'data-result')])),
    expectedSituationRoutes,
    'situation controls must carry the audited allowlisted map'
  );
  assert.ok(controls.every((tag) => attr(tag, 'data-route') === 'page'), 'every choice must declare route=page');
  assert.ok(controls.every((tag) => !/\bchecked\b|aria-pressed="true"/.test(tag)), 'fresh state must not silently select a choice');

  const continuations = [...html.matchAll(/<a\b[^>]*\bdata-service-continue\b[^>]*>/g)].map((match) => match[0]);
  assert.equal(continuations.length, 1, 'choice state must own one continuation control');
  assert.match(continuations[0], /\bhidden\b/, 'continuation must stay hidden until a choice is made');

  const noScript = html.match(/<noscript\b[^>]*>([\s\S]*?)<\/noscript>/);
  assert.ok(noScript, 'four physical fallback links must survive without JavaScript');
  const fallbackLinks = [...noScript[1].matchAll(/href="(configurator\.html\?[^"#]+)"/g)]
    .map((match) => new URL(decodeHtmlUrl(match[1]), 'https://akademsalon.ru/'));
  assert.equal(fallbackLinks.length, 4, 'no-JS fallback must expose exactly four routes');
  assert.deepEqual(
    Object.fromEntries(fallbackLinks.map((url) => [url.searchParams.get('situation'), url.searchParams.get('result')])),
    expectedSituationRoutes
  );
});

test('saved progress owns the primary action and reveals a fresh selector secondarily', () => {
  const html = read('services.html');
  const catalog = read('assets/js/polish15-catalog.js');
  const resume = html.match(/<section\b[^>]*\bdata-resume-card\b[\s\S]*?<\/section>/);

  assert.ok(resume, 'saved state needs a dedicated resume region');
  assert.equal(count(resume[0], /\bresume-card__action(?:\s|")/g), 1, 'resume must own one primary continuation');
  assert.match(resume[0], /data-new-choice-toggle/);
  assert.match(resume[0], />\s*Начать новый подбор\s*</);
  assert.match(html, /data-services-choice[^>]*\bhidden\b/, 'fresh selector must be collapsed while saved progress is present');
  assert.match(catalog, /data-new-choice-toggle/);
  assert.match(catalog, /data-services-choice/);
  assert.match(catalog, /\.hidden\s*=\s*false/, 'secondary action must reveal rather than navigate or mutate');
});

test('configurator keeps an incoming route until explicit conflict resolution and restores focus', () => {
  const source = read('configurator.html');
  const apply = functionSlice(source, 'applyPendingRoute');
  const keep = functionSlice(source, 'continueSavedRoute');

  assert.ok(source.includes('function clearIncomingRouteParams('), 'missing deferred route cleanup helper');
  assert.doesNotMatch(
    source,
    /if \(hasRoutedContext\) \{\s*try \{\s*routeParams\.delete/,
    'incoming intent must not be removed before the user resolves the conflict'
  );

  for (const [name, body] of [['replace', apply], ['continue', keep]]) {
    const clearAt = body.indexOf('clearIncomingRouteParams()');
    const renderAt = body.indexOf('render()');
    const focusAt = body.indexOf('focusConceptHeading()');
    assert.ok(clearAt !== -1 && clearAt < renderAt, `${name}: explicit outcome must clear the consumed route before render`);
    assert.ok(renderAt !== -1 && focusAt > renderAt, `${name}: focus must move after the old control is removed`);
  }
});

test('catalog-owned normal-text actions use AA color tokens in both themes', () => {
  const css = read('assets/css/polish15-catalog.css');
  const backgrounds = [...css.matchAll(/--catalog-action-bg-p15:\s*(#[0-9a-f]{6})/gi)].map((match) => match[1]);
  const foregrounds = [...css.matchAll(/--catalog-action-text-p15:\s*(#[0-9a-f]{6})/gi)].map((match) => match[1]);

  assert.equal(backgrounds.length, 2, 'light and dark themes must each declare the action background');
  assert.equal(foregrounds.length, 2, 'light and dark themes must each declare the action foreground');
  backgrounds.forEach((background, index) => {
    assert.ok(
      contrastRatio(foregrounds[index], background) >= 4.5,
      `theme ${index + 1}: catalog action contrast must be at least 4.5:1`
    );
  });
  assert.match(css, /\.p15-catalog \.button--primary,[\s\S]*?color:\s*var\(--catalog-action-text-p15\);[\s\S]*?background:\s*var\(--catalog-action-bg-p15\)/);
  assert.match(css, /\.catalog-resume \.resume-card__action\{[\s\S]*?color:\s*var\(--catalog-action-text-p15\)!important;[\s\S]*?background:\s*var\(--catalog-action-bg-p15\)!important/);
});

test('catalog search includes discipline links before declaring an empty result', () => {
  const html = read('services.html');
  const catalog = read('assets/js/polish15-catalog.js');

  assert.equal(count(html, /\bdata-discipline-card\b/g), 9, 'all nine discipline routes must join search');
  assert.equal(count(html, /\bdata-discipline-card\b[^>]*\bdata-search="[^"]+"/g), 9, 'discipline routes need explicit searchable text');
  assert.match(catalog, /querySelectorAll\('\[data-discipline-card\]'\)/);
  assert.match(catalog, /disciplineMatches/);
  assert.match(catalog, /empty\.hidden\s*=\s*pool\.length\s*!==\s*0\s*\|\|\s*disciplineMatches/);
});

test('physical catalog inventory and ItemList remain exact', () => {
  const html = read('services.html');
  const itemListScript = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]))
    .find((value) => value['@type'] === 'ItemList');

  assert.equal(count(html, /\bdata-service-card\b/g), 12);
  assert.equal(count(html.match(/<div class="discipline-grid">([\s\S]*?)<\/div>/)[1], /<a\b/g), 9);
  assert.equal(servicePages.length, 22);
  servicePages.forEach((file) => assert.ok(fs.existsSync(path.join(root, file)), `missing physical page ${file}`));
  assert.ok(itemListScript, 'services hub needs an ItemList');
  assert.equal(itemListScript.itemListElement.length, 13);
});

test('detail configurator actions carry one explicit allowlisted URL intent without draft mutation', () => {
  for (const file of servicePages) {
    const html = read(file);
    const routes = [...html.matchAll(/href="(configurator\.html[^"#]*)"/g)].map((match) => decodeHtmlUrl(match[1]));
    assert.ok(routes.length, `${file}: missing configurator action`);
    assert.ok(routes.every((route) => route !== 'configurator.html'), `${file}: storage-only configurator action`);
    assert.equal(new Set(routes).size, 1, `${file}: visible configurator actions disagree`);

    const url = new URL(routes[0], 'https://akademsalon.ru/');
    assert.ok([...url.searchParams.keys()].every((key) => allowedRouteKeys.has(key)), `${file}: unsupported route key`);
    assert.ok(
      url.searchParams.has('service') ||
        (url.searchParams.has('situation') && url.searchParams.has('result')),
      `${file}: route has no allowlisted service or situation/result intent`
    );
    if (url.searchParams.has('situation')) assert.ok(allowedSituations.has(url.searchParams.get('situation')), `${file}: bad situation`);
    if (url.searchParams.has('result')) assert.ok(allowedResults.has(url.searchParams.get('result')), `${file}: bad result`);
    if (url.searchParams.has('route')) assert.ok(allowedOrigins.has(url.searchParams.get('route')), `${file}: bad route origin`);
  }

  const catalog = read('assets/js/polish15-catalog.js');
  const app = read('assets/js/app.js');
  assert.doesNotMatch(catalog, /Salon\.store\.set\(['"]salon_draft/, 'catalog navigation must not mutate a saved draft before conflict resolution');
  assert.match(app, /'otchet-po-praktike':\['practice','draft','editing',3/);
  assert.match(app, /'dorabotka-otcheta-po-praktike':\['practice','comments','diagnostic',3/);
  assert.match(app, /'kandidatskaya-dissertaciya':\['kandidat','draft','diagnostic',3/);
  assert.match(app, /'referat':\['self','draft','editing',3/);
});

test('all 24 catalog consumers use one OUT-005 cache key', () => {
  const versions = new Set();
  for (const file of catalogConsumers) {
    const html = read(file);
    for (const asset of ['css', 'js']) {
      const match = html.match(new RegExp('polish15-catalog\\.' + asset + '\\?v=([^"&]+)'));
      assert.ok(match, `${file}: missing versioned catalog ${asset}`);
      versions.add(match[1]);
    }
  }
  assert.deepEqual([...versions], ['20260803out005services1']);
});
