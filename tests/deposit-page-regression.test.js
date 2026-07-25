const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const page = read('deposit.html');
const loyalty = read('loyalty.html');
const cabinet = read('assets/js/cabinet.js');
const behavior = read('assets/js/polish15-supporting.js');

function jsonLd(html) {
  return [...html.matchAll(
    /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi,
  )].map((match) => {
    assert.doesNotThrow(() => JSON.parse(match[1]), 'deposit.html: JSON-LD parses');
    return JSON.parse(match[1]);
  });
}

test('deposit page has complete indexable metadata', () => {
  const title = page.match(/<title>([^<]+)<\/title>/i)?.[1] || '';
  const description = page.match(
    /<meta\s+name="description"\s+content="([^"]+)"/i,
  )?.[1] || '';
  assert.ok(title.length >= 35 && title.length <= 80, `title length: ${title.length}`);
  assert.ok(
    description.length >= 100 && description.length <= 170,
    `description length: ${description.length}`,
  );
  assert.match(page, /<link rel="canonical" href="https:\/\/akademsalon\.ru\/deposit\.html"/);
  assert.match(page, /name="robots" content="index,follow,max-image-preview:large"/);
  assert.match(page, /property="og:url" content="https:\/\/akademsalon\.ru\/deposit\.html"/);
  assert.match(page, /property="og:image" content="https:\/\/akademsalon\.ru\/assets\/img\/og-cover-v2\.png"/);
  assert.equal((page.match(/<h1\b/gi) || []).length, 1, 'exactly one H1');
  assert.match(page, /assets\/js\/app\.js\?v=/);
  assert.match(page, /assets\/css\/mobile\.css\?v=/);
  assert.match(page, /assets\/css\/polish15-supporting\.css\?v=/);
});

test('calculator mirrors the four live wallet top-ups and loyalty rates', () => {
  const expected = [
    { amount: 20000, rate: 8, bonus: 1600 },
    { amount: 30000, rate: 10, bonus: 3000 },
    { amount: 45000, rate: 12, bonus: 5400 },
    { amount: 60000, rate: 15, bonus: 9000 },
  ];

  for (const item of expected) {
    assert.match(
      page,
      new RegExp(`data-deposit-amount="${item.amount}" data-deposit-rate="${item.rate}"`),
      `page amount ${item.amount}`,
    );
    assert.match(
      cabinet,
      new RegExp(`\\[20000, 30000, 45000, 60000\\]`),
      'cabinet exposes the same fixed amounts',
    );
    assert.match(
      loyalty,
      new RegExp(`${item.amount.toLocaleString('ru-RU').replace(/\s/g, '[ \\\\u00a0]')}[^<]*₽[\\s\\S]{0,80}${item.rate}%`),
      `loyalty rate ${item.rate}%`,
    );
    assert.match(
      page,
      new RegExp(`\\+${item.bonus.toLocaleString('ru-RU').replace(/\s/g, '[ \\\\u00a0]')} бонусов`),
      `visible bonus ${item.bonus}`,
    );
  }

  assert.match(behavior, /Math\.floor\(amount \* rate \/ 100\)/);
  assert.match(page, /data-receipt-money/);
  assert.match(page, /data-receipt-bonus/);
  assert.match(page, /aria-live="polite"/);
});

test('page keeps money and bonuses separate and states the approved limits', () => {
  assert.match(page, /не складываются в одну денежную сумму/);
  assert.match(page, /учитываются раздельно/);
  assert.match(page, /до 120 000 ₽/);
  assert.match(page, /180 дней/);
  assert.match(page, /не банковский вклад/);
  assert.match(page, /Этап оплачивается целиком/);
  assert.match(page, /Неиспользованный денежный остаток можно вернуть/);
  assert.match(page, /href="loyalty\.html"/);
});

test('public CTA opens the existing wallet and never initiates payment', () => {
  assert.match(page, /href="dashboard\.html#wallet">Перейти в кошелёк/);
  assert.match(page, /Оплата происходит только в кабинете\. Эта страница ничего не списывает\./);
  assert.doesNotMatch(page, /Salon\.api\.post|\/deposit\/topup|data-dep-topup/);
  assert.doesNotMatch(page, /фиктивн|демо-оплат|тестов(?:ая|ый) оплат/i);
});

test('structured data describes only visible page entities', () => {
  const schemas = jsonLd(page);
  const graph = schemas.flatMap((entry) => entry['@graph'] || [entry]);
  assert.ok(graph.some((entry) => entry['@type'] === 'WebPage'));
  assert.ok(graph.some((entry) => entry['@type'] === 'Service'));
  assert.ok(graph.some((entry) => entry['@type'] === 'BreadcrumbList'));
  assert.ok(!graph.some((entry) => entry['@type'] === 'FAQPage'));
  assert.doesNotMatch(page, /class="faq-item"/);
});

test('crawl surfaces include the production deposit page', () => {
  assert.match(
    read('sitemap.xml'),
    /<loc>https:\/\/akademsalon\.ru\/deposit\.html<\/loc>/,
  );
  assert.match(
    read('llms.txt'),
    /\[Депозит мастерской\]\(https:\/\/akademsalon\.ru\/deposit\.html\)/,
  );
});
