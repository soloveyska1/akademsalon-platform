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

function count(source, pattern) {
  return (source.match(pattern) || []).length;
}

function rendered(source) {
  return source.replace(/<template\b[\s\S]*?<\/template>/g, '');
}

function assertJsonLdParses(file, source) {
  const scripts = [...source.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length, `${file}: missing JSON-LD`);
  for (const [, raw] of scripts) {
    assert.doesNotThrow(() => JSON.parse(raw), `${file}: invalid JSON-LD`);
  }
}

test('approved catalog shell is the only rendered catalog composition', () => {
  for (const file of ['services.html', 'tariffs.html']) {
    const html = read(file);
    assert.equal(count(html, /<main\b/g), 1, `${file}: expected one main`);
    assert.match(html, /<main class="p15-catalog"/, `${file}: missing approved catalog shell`);
    assert.match(html, /assets\/css\/polish15-catalog\.css/, `${file}: missing catalog CSS`);
    assert.match(html, /assets\/js\/polish15-catalog\.js/, `${file}: missing catalog behavior`);
    assert.doesNotMatch(html, /assets\/css\/(?:service-v2|rescue-v1)\.css/, `${file}: legacy visual CSS is still loaded`);
    assertJsonLdParses(file, html);
  }
});

test('every approved service page keeps its physical URL and production integrations', () => {
  for (const file of servicePages) {
    const html = read(file);
    const visible = rendered(html);
    assert.equal(count(visible, /<main\b/g), 1, `${file}: expected one rendered main`);
    assert.equal(count(visible, /<h1\b/g), 1, `${file}: expected one rendered H1`);
    assert.match(html, /<main class="p15-service"/, `${file}: missing approved service shell`);
    assert.match(html, /assets\/css\/polish15-catalog\.css/, `${file}: missing approved CSS`);
    assert.match(html, /assets\/js\/app\.js/, `${file}: core mechanics are not loaded`);
    assert.match(html, /assets\/js\/extras\.js/, `${file}: production extras are not loaded`);
    assert.match(html, /assets\/js\/polish15-catalog\.js/, `${file}: service prefill behavior is not loaded`);
    assert.match(html, /href="configurator\.html/, `${file}: no configurator route`);
    assert.doesNotMatch(html, /assets\/css\/(?:service-v2|rescue-v1)\.css/, `${file}: legacy visual CSS is still loaded`);
    assertJsonLdParses(file, html);
  }
});

test('service hub links only to real physical service pages', () => {
  const html = read('services.html');
  const hrefs = [...html.matchAll(/<a class="service-card__link" href="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(hrefs.length, 12, 'services.html: unexpected primary-card count');
  for (const href of hrefs) {
    assert.ok(fs.existsSync(path.join(root, href)), `services.html: broken card link ${href}`);
  }
});

test('catalog behavior preserves search, routing and legacy-widget isolation', () => {
  const catalog = read('assets/js/polish15-catalog.js');
  const extras = read('assets/js/extras.js');
  assert.match(catalog, /data-service-search/);
  assert.match(catalog, /data-price-search/);
  assert.match(catalog, /storeDraft/);
  assert.match(catalog, /configurator\.html\?service=pl/);
  assert.match(extras, /document\.querySelector\('\.p15-service,\.p15-catalog'\)/);
});
