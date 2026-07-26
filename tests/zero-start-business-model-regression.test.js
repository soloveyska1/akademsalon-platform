const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('home keeps the from-zero route without turning the first screen into a price catalog', () => {
  const home = read('index.html');

  assert.match(home, /Одно дело\.<br>От темы до защиты\./);
  assert.match(home, /Проект с нуля/);
  assert.match(home, /configurator\.html\?situation=topic&result=support/);
  assert.match(home, /ориентир цены и самостоятельную альтернативу/i);
  assert.doesNotMatch(home, /class="project-ledger"/);
  assert.doesNotMatch(home, /любая работа (?:за|за один) день/i);
});

test('the brand promise now matches the research-case model', () => {
  assert.match(read('index.html'), /Одно дело исследования[\s\S]*от темы до защиты/);
});

test('calculator and configurator expose the project from zero as the full-price format', () => {
  const app = read('assets/js/app.js');
  const configurator = read('configurator.html');

  assert.match(app, /\{ id: 'vip',\s+label: 'Проект с нуля',\s+priceKey: 'support'/);
  assert.match(configurator, /Только тема — начинаем с нуля/);
  assert.match(configurator, /Собрать проект с нуля/);
  assert.match(configurator, /Первый полный рабочий черновик/);
  assert.match(configurator, /data-concept-authorship/);
  assert.match(configurator, /Участие клиента подтверждено/);
});

test('tariff catalog exposes all five promised entry prices and routes them to the full project tier', () => {
  const tariffs = read('tariffs.html');
  const catalog = read('assets/js/polish15-catalog.js');

  for (const price of ['2 500', '14 000', '20 000', '40 000', '60 000']) {
    assert.match(tariffs, new RegExp(`>${price}[ \u00a0]₽<`));
  }
  for (const type of ['self', 'course', 'course_emp', 'diplom', 'master']) {
    assert.match(catalog, new RegExp(`type: '${type}', tier: 'vip'`));
  }
});

test('offer documents make from-zero work operational without promising substitution', () => {
  const offer = read('oferta.html');
  const terms = read('terms.html');
  const integrity = read('academic-integrity.html');
  const combined = `${offer}\n${terms}\n${integrity}`;

  assert.match(offer, /А2 — совместная исследовательская разработка с нуля/);
  assert.match(offer, /«авторский контур»/);
  assert.match(offer, /Экспресс-срок «от 24 часов»/);
  assert.match(terms, /полный рабочий черновик/);
  assert.match(integrity, /содержательно доработать рабочий черновик/);
  assert.match(combined, /не (?:допускает|принимает).*подмен/u);
});
