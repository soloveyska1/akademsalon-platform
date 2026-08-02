const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const home = read('index.html');
const app = read('assets/js/app.js');
const ecosystem = read('assets/js/home-ecosystem.js');
const flow = read('assets/js/home-guided-flow.js');
const configurator = read('configurator.html');
const css = read('assets/css/home-guided-flow.css');
const tokens = read('assets/css/home-guided.css');

test('home begins with recognition, then one contextual action', () => {
  const desk = home.slice(home.indexOf('<section class="guided-desk"'), home.indexOf('<section class="case-hero"'));
  const intro = desk.slice(desk.indexOf('<header class="guided-desk__intro">'), desk.indexOf('<section class="guided-desk__studio"'));
  const dossier = desk.slice(desk.indexOf('<section class="guided-desk__dossier"'));

  assert.doesNotMatch(intro, /guided-desk__button/);
  assert.equal((dossier.match(/guided-desk__button--primary/g) || []).length, 1);
  assert.match(desk, /Начать[\s\S]*Доработать[\s\S]*Успеть к сроку/);
  assert.match(desk, /Начать с задания/);
  assert.match(desk, /Другой случай/);
  assert.match(desk, /route=home-zero&amp;situation=topic&amp;result=diagnostic/);
  assert.match(desk, /Сначала увидите состав, срок и цену/);
  assert.doesNotMatch(desk, /data-desk-situation[^>]+checked/);
  assert.match(desk, /data-desk-prompt/);
  assert.match(desk, /data-desk-dossier[^>]+hidden/);
});

test('header reaches the visible desk and legacy handler does not hijack it', () => {
  assert.match(home, /id="deskStart"/);
  assert.match(app, /calcHref = '#deskStart'/);
  assert.match(app, /calcLabel = 'Подобрать помощь'/);
  assert.match(ecosystem, /getAttribute\('href'\) === '#deskStart'/);
  assert.match(css, /\.guided-desk__studio\{[\s\S]*?scroll-margin-top:94px/);
});

test('dynamic dossier announces one atomic summary instead of the whole card', () => {
  assert.doesNotMatch(home, /data-desk-dossier aria-live/);
  assert.match(home, /role="status" aria-live="polite" aria-atomic="true" data-desk-announcement/);
  assert.match(flow, /announcement\.textContent = 'Выбрано: '/);
  assert.match(flow, /route\.priceLabel \+ ': '/);
});

test('mobile home exposes three destinations and prioritises the situation picker', () => {
  assert.match(app, /mnav\.classList\.add\('mobile-dock--home'\)/);
  assert.match(app, /if \(here === 'index\.html'\)[\s\S]*?mnItem\('\/', 'Главная'[\s\S]*?mnItem\(mobileRouteHref[\s\S]*?mnItem\('dashboard\.html', 'Кабинет'/);
  assert.match(css, /@media \(max-width:620px\)\{[\s\S]*?\.guided-desk__facts\{\s*display:none/);
  assert.match(css, /\.mobile-dock\.mobile-dock--home\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /\.guided-desk__actions--dossier \[data-desk-primary\]\{\s*display:none/);
  assert.match(css, /\.guided-desk__actions--dossier\{[\s\S]*?grid-template-columns:1fr/);
  assert.match(flow, /mobilePrimaryCanSync/);
  assert.match(flow, /mobilePrimaryLabel\.textContent = 'Выбрать'/);
});

test('light and dark palettes meet the warm editorial direction', () => {
  assert.match(tokens, /--guided-quiet:#665c52/);
  assert.match(tokens, /--guided-canvas:#15110e/);
  assert.match(tokens, /--guided-sheet:#25201b/);
  assert.match(tokens, /--guided-ink:#fff7ed/);
  assert.match(tokens, /--guided-action:#b44a36/);
  assert.match(css, /content:"ОТТИСК"/);
});

test('trust contract stays honest with and without JavaScript', () => {
  assert.match(home, /Отзывы — исходные сообщения[\s\S]*личные данные клиентов скрыты/);
  assert.match(home, /До оплаты — письменно[\s\S]*результат, срок и цена/);
  assert.match(home, /Вы остаётесь автором[\s\S]*финальные решения — ваши/);
  assert.match(home, /<noscript>[\s\S]*situation=comments&amp;result=diagnostic/);
  assert.match(home, /aria-label="Доработать: есть черновик или замечания"/);
  assert.match(flow, /primary: '\/configurator\.html\?route=home-edit&situation=comments&result=diagnostic'/);
  assert.match(flow, /primary: '\/configurator\.html\?route=home-urgent'/);
  assert.match(configurator, /routeOrigin === 'home-urgent'[\s\S]*укажете дату[\s\S]*что успеем/);
  assert.match(css, /html:not\(\.has-js\) \.home-guided \.guided-desk__picker\{[\s\S]*?display:none/);
  assert.match(home, /"@type":"FAQPage"/);
});
