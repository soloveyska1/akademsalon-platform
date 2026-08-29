const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('welcome artwork is a bounded modern source with an intrinsic PNG fallback', () => {
  const webp = path.join(root, 'assets/img/promo-salon-welcome.webp');
  const artwork = fs.readFileSync(webp);
  const script = read('assets/js/promo-campaign.js');
  assert.equal(fs.existsSync(webp), true, 'modern artwork must exist');
  assert.ok(fs.statSync(webp).size <= 50 * 1024, 'modern artwork must stay at or below 50 KiB');
  assert.equal(artwork.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(artwork.subarray(8, 12).toString('ascii'), 'WEBP');
  assert.equal(artwork.subarray(12, 16).toString('ascii'), 'VP8 ');
  assert.equal(artwork.subarray(23, 26).toString('hex'), '9d012a', 'VP8 frame marker');
  assert.equal(artwork.readUInt16LE(26) & 0x3fff, 960, 'encoded width');
  assert.equal(artwork.readUInt16LE(28) & 0x3fff, 720, 'encoded height');
  assert.match(script, /promo-salon-welcome\.webp\?v=20260825promo3/);
  assert.match(script, /promo-salon-welcome\.png/);
  assert.match(script, /img\.src\s*=\s*IMAGE_WEBP_PATH/);
  assert.match(script, /data-promo-fallback/);
  assert.match(script, /img\.src\s*=\s*IMAGE_FALLBACK_PATH/);
  assert.match(script, /img\.width\s*=\s*960/);
  assert.match(script, /img\.height\s*=\s*720/);
});

test('promo cache wave is atomic on both eligible entry routes', () => {
  for (const file of ['index.html', 'configurator.html']) {
    const html = read(file);
    assert.match(html, /assets\/css\/promo-campaign\.css\?v=20260825rescue2/);
    assert.match(html, /assets\/js\/promo-campaign\.js\?v=20260829rescue3/);
    assert.doesNotMatch(html, /<img[^>]+promo-salon-welcome/u);
    assert.doesNotMatch(html, /rel=["']preload["'][^>]+promo-salon-welcome/u);
  }
});

test('application entry and terminal promise use the current three-step contract', () => {
  const configurator = read('configurator.html');
  const application = read('zayavka.html');
  const responseWindow = 'В рабочее время обычно отвечаем за 15–30 минут; ночью может потребоваться больше времени.';

  assert.match(application, /три коротких шага/u);
  assert.match(application, /01—03/u);
  assert.doesNotMatch(application, /пять коротких вопросов|01—05/u);
  assert.match(configurator, /после просмотра заявки и приложенных материалов/u);
  assert.equal(configurator.split(responseWindow).length - 1, 1, 'response promise has one source');
  assert.match(configurator, /Редактор посмотрит заявку и приложенные материалы/u);
  assert.match(configurator, /если данных достаточно — состав, срок и точная цена, иначе уточним недостающее/u);
});
