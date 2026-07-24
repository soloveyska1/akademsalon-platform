const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const money = (value) => Number(String(value).replace(/\s/g, ''));

function canonicalPrices() {
  const source = read('assets/js/app.js');
  const found = {};
  const row = /\{\s*id:\s*'([^']+)'[\s\S]*?prices:\s*\{\s*diagnostic:\s*(\d+),\s*editing:\s*(\d+),\s*support:\s*(\d+)\s*\}\s*\}/g;
  let match;
  while ((match = row.exec(source))) {
    found[match[1]] = [Number(match[2]), Number(match[3]), Number(match[4])];
  }
  return found;
}

const pages = {
  'diplomnaya-rabota.html': { type: 'diplom', visible: ['3 000', '24 000', '40 000'] },
  'magisterskaya-dissertaciya.html': { type: 'master', visible: ['5 000', '36 000', '60 000'] },
  'kandidatskaya-dissertaciya.html': { type: 'kandidat', visible: ['7 500', '60 000', '200 000'] },
  'kursovaya-rabota.html': { type: 'course', visible: ['2 500', '9 000', '14 000'] },
  'otchet-po-praktike.html': { type: 'practice', visible: ['2 500', '8 000', '14 000'] }
};

test('canonical pricing source contains every primary service type', () => {
  const prices = canonicalPrices();
  for (const { type } of Object.values(pages)) {
    assert.ok(prices[type], `SalonCalc is missing ${type}`);
  }
});

test('primary landing pages match SalonCalc in visible, FAQ and schema prices', () => {
  const prices = canonicalPrices();
  for (const [file, config] of Object.entries(pages)) {
    const html = read(file);
    const expected = prices[config.type];
    assert.deepEqual(config.visible.map(money), expected, `${file}: fixture must match SalonCalc`);
    for (const amount of config.visible) {
      assert.match(html, new RegExp(`${amount.replace(' ', '[ \\\\u00a0]')} (?:₽|рублей)`), `${file}: ${amount} is not visible`);
    }
    assert.match(html, new RegExp(`"lowPrice":${expected[0]}\\b`), `${file}: wrong AggregateOffer.lowPrice`);
    assert.match(html, new RegExp(`"highPrice":${expected[2]}\\b`), `${file}: wrong AggregateOffer.highPrice`);
    assert.match(html, new RegExp(`Диагностика[^"]*от ${config.visible[0].replace(' ', '[ \\\\u00a0]')} рублей`), `${file}: FAQ diagnostic price`);
  }
});

test('article and short-text CTAs open the advertised editing tier', () => {
  const article = read('nauchnaya-statya.html');
  assert.match(article, /tier:'turn'/);
  assert.doesNotMatch(article, /"name":"Диагностика статьи/);
  assert.doesNotMatch(article, /Указан тариф «Диагностика»/);
  assert.match(read('referat.html'), /tier:'turn'/);
});

test('format comparison has explicit tier prices and no obsolete multipliers', () => {
  const html = read('vedenie.html');
  assert.match(html, /fallbackPrices\s*=\s*\{/);
  assert.match(html, /diplom:\{base:3000,turn:24000,vip:40000\}/);
  assert.doesNotMatch(html, /×\s*(?:1\.33|2\.0)/);
  assert.doesNotMatch(html, /(?:32|48)[ \u00a0]000 ₽/);
});

test('discipline prefills use only valid SalonCalc IDs', () => {
  const files = fs.readdirSync(root).filter((file) => /^(kursovaya|diplomnaya)-po-.*\.html$/.test(file));
  for (const file of files) {
    assert.doesNotMatch(read(file), /disc:'sci'/, `${file}: invalid discipline ID`);
  }
});

test('indexation signals exclude consent forms and include growth landings', () => {
  const sitemap = read('sitemap.xml');
  for (const file of ['consent-request.html','consent.html','consent-analytics.html','consent-marketing.html','consent-publication.html']) {
    assert.match(read(file), /name="robots" content="noindex,follow"/);
    assert.doesNotMatch(sitemap, new RegExp(`/${file.replace('.', '\\.')}`));
  }
  for (const file of ['about.html','razbor-zamechaniy-nauchruka.html','normokontrol-vkr.html']) {
    assert.match(sitemap, new RegExp(`/${file.replace('.', '\\.')}`));
  }
});

test('internal home links do not route through the /index.html redirect', () => {
  const files = fs.readdirSync(root).filter((file) => file.endsWith('.html'));
  for (const file of files) {
    assert.doesNotMatch(read(file), /href="index\.html"/, `${file}: redirecting home link`);
  }
  assert.doesNotMatch(read('assets/js/app.js'), /href="index\.html"/);
});
