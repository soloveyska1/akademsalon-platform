const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const pageNames = [
  'about.html',
  'guarantees.html',
  'reviews.html',
  'priyomnaya.html',
  'referral.html',
  'plus.html',
  'deposit.html',
  'gift.html'
];
const pages = Object.fromEntries(pageNames.map((name) => [
  name,
  fs.readFileSync(path.join(root, name), 'utf8')
]));
const behavior = fs.readFileSync(path.join(root, 'assets/js/polish15-supporting.js'), 'utf8');

test('вспомогательные маршруты используют один изолированный финальный слой', () => {
  for (const [name, source] of Object.entries(pages)) {
    assert.match(source, /<body class="polish15-supporting /, name);
    assert.match(source, /assets\/css\/polish15-supporting\.css/, name);
    assert.equal((source.match(/<h1\b/g) || []).length, 1, name);
    assert.match(source, new RegExp(`<link rel="canonical" href="https://akademsalon\\.ru/${name}"`), name);
    assert.doesNotMatch(source, /href="#\/|data-route=/, name);
  }
});

test('старые публичные композиции не попали в финальные страницы', () => {
  const all = Object.values(pages).join('\n');
  assert.doesNotMatch(all, /charter-article|pr-feed|pr-item|rv-live|rv-filter|gf-hero|clb-|pl-card/);
  assert.doesNotMatch(pages['priyomnaya.html'], /Журнал входящих|data-same=|Следующие записи/);
  assert.doesNotMatch(pages['reviews.html'], /Следующие записи|data-filter=|AggregateRating|reviewCount|ratingValue/);
});

test('приёмная сохраняет рабочий API и Telegram-маршрут без публичного журнала', () => {
  const source = pages['priyomnaya.html'];
  assert.match(source, /id="supportForm"/);
  assert.match(source, /id="supportQuestion"/);
  assert.match(source, /id="supportConsent"/);
  assert.match(source, /academic_saloon_bot\?start=question/);
  assert.match(behavior, /Salon\.api\.post\('\/qa'/);
  assert.match(behavior, /question:\s*bodyText/);
  assert.match(behavior, /quiet:\s*!!quiet\.checked/);
});

test('книга благодарностей содержит весь исходный архив и доступный просмотр', () => {
  const source = pages['reviews.html'];
  const images = [...source.matchAll(/data-full="(assets\/img\/reviews\/review-[^"]+\.webp)"/g)]
    .map((match) => match[1]);
  assert.equal(images.length, 48);
  assert.equal(new Set(images).size, 48);
  assert.equal((source.match(/class="rv-shot"/g) || []).length, 48);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /"@type":"CollectionPage"/);
  for (const key of ['Escape', 'ArrowLeft', 'ArrowRight', 'Tab']) {
    assert.match(behavior, new RegExp(`event\\.key === '${key}'`));
  }
  assert.match(behavior, /el\.inert = true/);
  assert.match(behavior, /el\.inert = false/);
});

test('денежные экраны оставляют расчёты и выпуск в рабочем слое', () => {
  assert.match(pages['plus.html'], /data-plus-period="month"/);
  assert.match(pages['plus.html'], /data-plus-period="semester"/);
  assert.match(pages['deposit.html'], /data-deposit-range/);
  assert.match(behavior, /amount >= 60000\) return 15/);
  assert.match(behavior, /Math\.floor\(amount \* rate \/ 100\)/);

  const gift = pages['gift.html'];
  assert.match(gift, /id="giftBuilder"/);
  assert.match(gift, /id="giftCheckout"[^>]*hidden/);
  assert.match(gift, /id="giftPayment"/);
  for (const endpoint of [
    '/gift/config',
    '/gift/view?code=',
    '/gift/state?id=',
    '/gift',
    '/pay',
    '/paid',
    '/unpaid',
    '/cancel'
  ]) {
    assert.ok(behavior.includes(endpoint), `missing gift endpoint ${endpoint}`);
  }
});

test('общий интерактивный файл синтаксически валиден', () => {
  new vm.Script(behavior, { filename: 'polish15-supporting.js' });
});
