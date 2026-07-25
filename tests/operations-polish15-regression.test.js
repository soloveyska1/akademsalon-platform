const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const publicRoutes = [
  'tools.html',
  'check.html',
  'audit-temy-vkr.html',
  'proverka-istochnikov-vkr.html',
  'dosie-nauchruka.html',
  'vedenie.html',
  'start.html',
  'zayavka.html',
  'oplata.html',
  'oplaceno.html',
  '404.html',
  '50x.html',
  'maintenance.html',
  'expertise.html',
  'prolog.html'
];

test('remaining public and system routes use the final operations layer', () => {
  for (const file of publicRoutes) {
    const html = read(file);
    assert.match(html, /p15-operations/, `${file}: final operations class`);
    assert.match(html, /polish15-operations\.css/, `${file}: final operations stylesheet`);
    assert.doesNotMatch(html, /href="#\/[^"]+"/, `${file}: no hash-router links`);
  }
});

test('tool routes keep real interactive controls', () => {
  assert.match(read('check.html'), /data-run-text-check/);
  assert.match(read('audit-temy-vkr.html'), /data-run-topic-audit/);
  assert.match(read('proverka-istochnikov-vkr.html'), /data-run-source-check/);
  assert.match(read('assets/js/polish15-operations.js'), /api\.crossref\.org\/works/);
  assert.match(read('dosie-nauchruka.html'), /data-generic-tool-submit/);
});

test('payment routing and live offer mechanics remain connected', () => {
  const paid = read('oplaceno.html');
  const offer = read('zayavka.html');
  assert.match(paid, /Shp_k/);
  assert.match(paid, /Shp_gift/);
  assert.match(paid, /Shp_kind/);
  assert.match(paid, /Shp_order/);
  assert.match(offer, /S\.api\.get\('\/offer\//);
  assert.match(offer, /S\.api\.post\('\/offer\//);
  assert.match(offer, /data-p15-offer-pay/);
});

test('system routes expose a useful recovery action', () => {
  assert.match(read('404.html'), /href="\/"/);
  assert.match(read('50x.html'), /data-system-retry/);
  assert.match(read('maintenance.html'), /priyomnaya\.html/);
  assert.match(read('expertise.html'), /razbor-zamechaniy-nauchruka\.html/);
});

test('old prohibited term is absent from visible route sources', () => {
  const prohibited = 'кон' + 'тур';
  for (const file of [...publicRoutes, 'admin-covers.html']) {
    assert.equal(read(file).toLocaleLowerCase('ru').includes(prohibited), false, file);
  }
});

test('cover workshop keeps browser canvas export mechanics', () => {
  const html = read('admin-covers.html');
  assert.match(html, /class="admin-shell"/);
  assert.match(html, /class="cover-studio"/);
  assert.match(html, /id="cv"/);
  assert.match(html, /toDataURL\('image\/png'\)/);
  assert.match(html, /document\.fonts\.load/);
  assert.match(html, /setAttribute\('data-theme', 'dark'\)/);
  assert.match(html, /removeAttribute\('data-theme'\)/);
  assert.doesNotMatch(html, /toggleAttribute\('data-theme'/);
});
