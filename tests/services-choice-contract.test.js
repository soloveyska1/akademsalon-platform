const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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
const disciplinePriceMatrix = [
  ['diplomnaya-po-ekonomike.html', 'diplom', 'hum', 24000],
  ['diplomnaya-po-psihologii.html', 'diplom', 'psychology', 29000],
  ['diplomnaya-po-yurisprudencii.html', 'diplom', 'jurisprudence', 24000],
  ['kursovaya-po-ekonomike.html', 'course', 'hum', 9000],
  ['kursovaya-po-menedzhmentu.html', 'course', 'hum', 9000],
  ['kursovaya-po-informatike.html', 'course', 'tech', 11500],
  ['kursovaya-po-pedagogike.html', 'course', 'pedagogy', 9000],
  ['kursovaya-po-psihologii.html', 'course', 'psychology', 11000],
  ['kursovaya-po-yurisprudencii.html', 'course', 'jurisprudence', 9000]
];

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

function salonCalc() {
  const source = read('assets/js/app.js');
  const start = source.indexOf('var SalonCalc =');
  const end = source.indexOf('\n  window.SalonCalc = SalonCalc;', start);
  assert.ok(start !== -1 && end !== -1, 'SalonCalc source must remain extractable');
  const context = {};
  vm.runInNewContext(source.slice(start, end) + '\nthis.result = SalonCalc;', context);
  return context.result;
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
  const catalog = read('assets/js/polish15-catalog.js');
  const css = read('assets/css/polish15-catalog.css');
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
  assert.match(html, /<body class="page-services" data-p15-page>/);
  assert.match(
    css,
    /body\.page-services \.site-header \.nav-cta>a\.btn-wax\{display:none!important\}/,
    'desktop shared header must not bypass or duplicate the services choice primary'
  );

  const noScript = html.match(/<noscript\b[^>]*>([\s\S]*?)<\/noscript>/);
  assert.ok(noScript, 'four physical fallback links must survive without JavaScript');
  const fallbackLinks = [...noScript[1].matchAll(/href="(configurator\.html\?[^"#]+)"/g)]
    .map((match) => new URL(decodeHtmlUrl(match[1]), 'https://akademsalon.ru/'));
  assert.equal(fallbackLinks.length, 4, 'no-JS fallback must expose exactly four routes');
  assert.deepEqual(
    Object.fromEntries(fallbackLinks.map((url) => [url.searchParams.get('situation'), url.searchParams.get('result')])),
    expectedSituationRoutes
  );
  assert.match(
    catalog,
    /if \(!hasSavedResume\) setDock\('#servicesChoice', 'Выбрать ситуацию'\)/,
    'fresh mobile dock must lead to the mandatory choice, never a bare configurator'
  );
  assert.doesNotMatch(
    read('assets/css/polish15-catalog.css'),
    /catalog-route-index small\{font-size:7px\}/,
    'mobile stage labels must remain readable'
  );
  assert.match(
    read('assets/css/polish15-catalog.css'),
    /@media\(max-width:920px\)[\s\S]*?catalog-route-index small\{font-size:9px\}/,
    'tablet and phone stage labels must share the 9px floor'
  );
});

test('saved progress owns the primary action and reveals a fresh selector secondarily', () => {
  const html = read('services.html');
  const catalog = read('assets/js/polish15-catalog.js');
  const css = read('assets/css/polish15-catalog.css');
  const resume = html.match(/<section\b[^>]*\bdata-resume-card\b[\s\S]*?<\/section>/);

  assert.ok(resume, 'saved state needs a dedicated resume region');
  assert.equal(count(resume[0], /\bresume-card__action(?:\s|")/g), 1, 'resume must own one primary continuation');
  assert.match(resume[0], /data-new-choice-toggle/);
  assert.match(resume[0], />\s*Начать новый подбор\s*</);
  assert.match(html, /data-services-choice[^>]*\bhidden\b/, 'fresh selector must be collapsed while saved progress is present');
  assert.match(catalog, /data-new-choice-toggle/);
  assert.match(catalog, /data-services-choice/);
  assert.match(catalog, /\.hidden\s*=\s*false/, 'secondary action must reveal rather than navigate or mutate');
  assert.match(catalog, /next\.hidden\s*=\s*hasSavedResume/, 'saved state must hide the orphan fresh-choice hint');
  assert.match(
    css,
    /@media\(max-width:920px\)[\s\S]*?\.catalog-route-continue,\s*body \.p15-catalog \.catalog-resume \.resume-card__action\{\s*display:none!important/,
    'the persistent mobile dock must be the only visible primary continuation'
  );
});

test('configurator keeps an incoming route until explicit conflict resolution and restores focus', () => {
  const source = read('configurator.html');
  const apply = functionSlice(source, 'applyPendingRoute');
  const keep = functionSlice(source, 'continueSavedRoute');

  assert.ok(source.includes('function clearIncomingRouteParams('), 'missing deferred route cleanup helper');
  assert.match(source, /var pendingRouteConflict = !!\(hasRoutedContext && savedHasProgress\)/, 'service routes must preserve a saved draft until explicit resolution');
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
  for (const field of ['deadlineDate', 'deadlineFlexible', 'topic', 'comment']) {
    assert.match(apply, new RegExp('state\\.' + field + ' = '), `replace must clear stale ${field}`);
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
    const configuratorAnchors = [...html.matchAll(/<a\b[^>]*href="configurator\.html[^\"]*"[^>]*>/g)]
      .map((match) => match[0]);
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
    assert.ok(configuratorAnchors.every((tag) => !/\bdata-type=/.test(tag)), `${file}: legacy click hook can overwrite a saved draft`);
    assert.doesNotMatch(html, /querySelectorAll\(['"]a\[data-type\]['"]\)/, `${file}: dead pre-navigation draft mutator`);
  }

  const catalog = read('assets/js/polish15-catalog.js');
  const app = read('assets/js/app.js');
  assert.doesNotMatch(catalog, /Salon\.store\.set\(['"]salon_draft/, 'catalog navigation must not mutate a saved draft before conflict resolution');
  assert.match(app, /'otchet-po-praktike':\['practice','draft','editing',3/);
  assert.match(app, /'dorabotka-otcheta-po-praktike':\['practice','comments','diagnostic',3/);
  assert.match(app, /'kandidatskaya-dissertaciya':\['kandidat','draft','diagnostic',3/);
  assert.match(app, /'referat':\['self','draft','editing',3/);
});

test('discipline detail routes preserve their canonical visible entry price', () => {
  const calc = salonCalc();
  const configurator = read('configurator.html');
  assert.deepEqual(
    ['jurisprudence', 'pedagogy', 'psychology'].map((value) => calc.transportDiscipline(value)),
    ['law', 'law', 'law'],
    'new client-side price profiles must keep the established API discipline code'
  );
  assert.doesNotMatch(configurator, /\bdisc:\s*transportDiscipline\(/, 'legacy submit must not call a helper from another script scope');
  assert.match(configurator, /disc:\s*C\.transportDiscipline\(state\.disc\)/, 'legacy submit must use the shared executable helper');
  assert.match(
    configurator,
    /\/quote\/email'[\s\S]*?disc:\s*C\.transportDiscipline\(state\.disc\),\s*client_disc:\s*state\.disc/,
    'email quote must use the server vocabulary while preserving the exact client price profile'
  );
  assert.match(configurator, /resumedDisc\s*=\s*has\(C\.disciplines, q\.client_disc\)\s*\?\s*q\.client_disc\s*:\s*q\.disc/);
  assert.match(
    configurator,
    /kind:'work',\s*type:state\.type,\s*label:t\.label,\s*disc:state\.disc/,
    'local cart items must retain the exact client profile so their quote does not drift'
  );
  assert.match(
    configurator,
    /payload\.disc\s*=\s*cartItems\.length\s*===\s*1[\s\S]*?C\.transportDiscipline\(cartFirst\.disc\)/,
    'single-item cart submissions must map the precise profile at the API boundary'
  );
  assert.match(
    configurator,
    /payload\.cart\.items\.forEach\([\s\S]*?item\.disc\s*=\s*C\.transportDiscipline\(item\.disc\)/,
    'nested cart items must map the precise profile only in the serialized payload'
  );
  assert.match(configurator, /\['law','Право · педагогика · психология \(общий ориентир\)'\]/, 'legacy saved law drafts stay selectable');
  for (const profile of ['jurisprudence', 'pedagogy', 'psychology']) {
    assert.match(configurator, new RegExp('id="discGroup"[\\s\\S]*?data-id="' + profile + '"'), `legacy quote registry needs ${profile}`);
  }
  for (const [file, work, discipline, expectedPrice] of disciplinePriceMatrix) {
    const html = read(file);
    const href = decodeHtmlUrl(html.match(/href="(configurator\.html[^"#]*)"/)[1]);
    const url = new URL(href, 'https://akademsalon.ru/');
    const visible = Number((html.match(/<strong>от ([\d\s\u00a0]+)\s*₽<\/strong>/) || [])[1]?.replace(/\D/g, ''));

    assert.equal(url.searchParams.get('work'), work, `${file}: route work drift`);
    assert.equal(url.searchParams.get('discipline'), discipline, `${file}: route discipline is too generic`);
    assert.equal(url.searchParams.get('result'), 'editing', `${file}: route result drift`);
    assert.equal(visible, expectedPrice, `${file}: protected visible price drift`);
    assert.equal(calc.quote(work, discipline, 'free', 'turn').low, expectedPrice, `${file}: routed quote disagrees with the page`);
  }
});

test('hub promises match referat editing truth and practice rework carries full context', () => {
  const services = read('services.html');
  const referat = read('referat.html');
  const practice = read('dorabotka-otcheta-po-praktike.html');

  assert.doesNotMatch(services, /Реферат или эссе с нуля|полный рабочий черновик/);
  assert.match(services, /Редактура реферата или эссе/);
  assert.match(referat, /configurator\.html\?work=self&amp;situation=draft&amp;result=editing&amp;route=service/);

  const routes = [...practice.matchAll(/href="(configurator\.html[^"#]*)"/g)].map((match) => decodeHtmlUrl(match[1]));
  assert.ok(routes.length >= 3, 'practice rework needs all visible actions');
  assert.deepEqual([...new Set(routes)], [
    'configurator.html?service=rv&work=practice&situation=comments&result=diagnostic&route=service'
  ]);
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
  assert.deepEqual([...versions], ['20260804services112']);
});
