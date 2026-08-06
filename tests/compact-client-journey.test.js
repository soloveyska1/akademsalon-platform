const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const services = read('services.html');
const course = read('kursovaya-rabota.html');
const configurator = read('configurator.html');
const catalogCss = read('assets/css/polish15-catalog.css');
const configuratorCss = read('assets/css/polish15-configurator.css') + '\n' + read('assets/css/configurator-journey.css');
const catalogJs = read('assets/js/polish15-catalog.js');

test('catalog starts with one short promise and exposes all four situations on a phone', () => {
  assert.match(services, /Начните с того, что уже есть/);
  assert.match(services, /Выберите ситуацию — покажем подходящий первый шаг и ориентир цены/);
  assert.match(services, /<h2>Состав и цены<\/h2>/);
  assert.doesNotMatch(services, /Каталог — второй шаг, не экзамен/);
  assert.match(
    catalogCss,
    /Compact catalog entry[\s\S]*?@media\(max-width:620px\)[\s\S]*?catalog-route-index\{\s*display:grid!important;\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,
  );
  assert.match(catalogJs, /matchMedia\('\(max-width: 620px\)'\)\.matches \? 4 : 6/);
});

test('service detail keeps proof and pricing while secondary price factors are on demand', () => {
  assert.match(course, /Что согласуем до оплаты/);
  assert.match(course, /<details class="price-composition__factors">/);
  assert.match(course, /<summary>Что влияет на цену<\/summary>/);
  assert.doesNotMatch(course, /<details open><summary>Можно прийти вообще без текста/);
  assert.match(catalogCss, /Compact system · one decision, one proof layer, details on demand/);
});

test('configurator exposes a live quote and keeps only three real actions', () => {
  assert.match(configurator, /Три понятных этапа: ситуация, срок и материалы, контакт для ответа/);
  assert.match(configurator, /data-concept-jump="1" disabled><span>02<\/span><strong>Срок и материалы/);
  assert.equal((configurator.match(/data-tx-step="/g) || []).length, 3);
  assert.match(configurator, /function liveRecommendationMarkup\(\)/);
  assert.match(configurator, /class="live-quote live-quote--ready"/);
  assert.match(configurator, /Почему именно этот этап/);
  assert.doesNotMatch(configurator, /key:'recommendation', displayStep:null/);
  assert.match(configurator, /wizard-summary wizard-summary--selection/);
  assert.match(configurator, /wizard-summary wizard-summary--handoff/);
  assert.match(configurator, /<details class="materials-more"/);
  assert.match(configurator, /<details class="contact-more"/);
  assert.match(configurator, /<dt>Срок и материалы<\/dt>/);
  assert.match(configuratorCss, /Compact system · keep the decision visible, reveal explanations on demand/);
  assert.match(configuratorCss, /Клиентский путь «живое досье»/);
});

test('desktop wizard does not apply the sidebar offset twice', () => {
  assert.doesNotMatch(configuratorCss, /\.configurator-task \.conf-wrap\{\s*margin-left:250px;/);
  assert.match(configuratorCss, /\.configurator-task \.conf-wrap\{\s*margin-left:0;/);
  assert.match(configuratorCss, /\.configurator-task \.tx-wizard-sidebar\{[\s\S]*?width:100%;/);
});

test('configurator keeps tablet controls usable and hides the action dock for the software keyboard', () => {
  assert.match(configurator, /configurator-journey\.css\?v=20260806release116/);
  assert.match(
    configuratorCss,
    /@media\(min-width:921px\) and \(max-width:1200px\)\{[\s\S]*?\.configurator-task \.decision-workbench,[\s\S]*?grid-template-columns:minmax\(0,1fr\);/,
  );
  assert.match(
    configuratorCss,
    /html\.keyboard-open \.configurator-task \.concept-task-bar\{[\s\S]*?visibility:hidden;[\s\S]*?transform:translateY\(110%\);/,
  );
  assert.match(configuratorCss, /@media\(min-width:1800px\)\{[\s\S]*?margin-left:clamp\(120px,7vw,180px\);/);
  assert.match(configuratorCss, /\.concept-contact-methods button\.is-selected\{[\s\S]*?background:var\(--wax-cta,var\(--wax\)\);/);
});

test('compact copy preserves trust-critical facts and actions', () => {
  for (const phrase of [
    'ориентир цены',
    'Отправка заявки не списывает деньги',
    'В рабочее время обычно отвечаем за 15–30 минут',
    'Контакты и файлы не сохраняются',
    'Подтверждаю своё участие',
    'За отправку заявки платить не нужно',
  ]) {
    assert.match(configurator, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(configurator, /if \(key === 'contact'\) return 'Отправить заявку'/);
  assert.match(configurator, /if \(key === 'materials'\) return 'К проверке'/);
});
