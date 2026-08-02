const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('home keeps the from-zero route without turning the first screen into a price catalog', () => {
  const home = read('index.html');

  assert.match(home, /<h1 id="caseHeroTitle"><span>Не нужно разбираться<\/span><em>во всём сразу\.<\/em><\/h1>/);
  assert.match(home, /Нужна помощь не только с планом\?[\s\S]*Посмотреть, как будем работать дальше/);
  assert.match(home, /configurator\.html\?route=home-zero&amp;situation=topic&amp;result=diagnostic/);
  assert.match(home, /До оплаты<\/dt><dd>результат, срок и цена/);
  assert.doesNotMatch(home, /class="project-ledger"/);
  assert.doesNotMatch(home, /любая работа (?:за|за один) день/i);
});

test('the brand promise now matches the research-case model', () => {
  assert.match(read('index.html'), /Работаем, пока ты отдыхаешь[\s\S]*— с гарантией\./);
});

test('calculator and configurator expose supported work without weakening authorship', () => {
  const app = read('assets/js/app.js');
  const configurator = read('configurator.html');

  assert.match(app, /\{ id: 'vip',\s+label: 'Сопровождение по этапам',\s+priceKey: 'support'/);
  assert.match(app, /содержательным участием автора/);
  assert.match(configurator, /Только тема — начинаем с нуля/);
  assert.match(configurator, /support:'Сопровождение исследования по этапам'/);
  assert.match(configurator, /Это совместная работа/);
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
