const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('flagship page explains the category, result, price and legal boundary', () => {
  const html = read('komissiya-0.html');

  assert.match(html, /<link rel="canonical" href="https:\/\/akademsalon\.ru\/komissiya-0\.html"/);
  assert.match(html, /Настоящая комиссия[\s\S]*не должна быть первой/);
  assert.match(html, /независимый от подготовки[\s\S]*Оппонент/i);
  assert.match(html, /Протокол №0/);
  assert.match(html, /Лаборатория настоящих данных/);
  assert.match(html, /ИИ уже написал[\s\S]*Выдержит ли работа/);
  assert.match(html, /9[ \u00a0]900 ₽/);
  assert.match(html, /19[ \u00a0]900 ₽/);
  assert.match(html, /29[ \u00a0]900 ₽/);
  assert.match(html, /Не является комиссией вуза, официальным допуском или гарантией оценки/);
  assert.doesNotMatch(html, /(?:100%|гарантированн(?:ая|ый) защит|официальный оппонент|допущено)/i);
});

test('Question Zero stays an honest local diagnostic and hands off without URL text', () => {
  const html = read('komissiya-0.html');
  const js = read('assets/js/commission-zero.js');
  const configurator = read('configurator.html');

  assert.match(html, /первичный вопрос/i);
  assert.match(html, /Текст обрабатывается только в этом браузере/);
  assert.match(js, /sessionStorage\.setItem\('salon_commission_zero_handoff_v1'/);
  assert.match(configurator, /sessionStorage\.getItem\('salon_commission_zero_handoff_v1'\)/);
  assert.match(configurator, /sessionStorage\.removeItem\('salon_commission_zero_handoff_v1'\)/);
  assert.doesNotMatch(js, /\b(?:fetch|XMLHttpRequest|sendBeacon)\b/);
  assert.doesNotMatch(js, /searchParams\.(?:set|append)\([^)]*topic/i);
});

test('Commission Zero is a real configurator service with exact work-based prices', () => {
  const app = read('assets/js/app.js');
  const configurator = read('configurator.html');

  assert.match(app, /id:'commission0'[\s\S]*code:'k0'[\s\S]*fixed:true/);
  assert.match(app, /a\.work === 'master' \? 29900 : a\.work === 'diplom' \? 19900 : 9900/);
  assert.match(app, /независимый от подготовки проверяемой версии Оппонент/i);
  assert.match(app, /Протокол №0/);
  assert.match(configurator, /service\.id === 'commission0'/);
  assert.match(configurator, /Живая сессия и Протокол №0/);
  assert.match(configurator, /service\.id === 'defense' \|\| service\.id === 'defensepack' \|\| service\.id === 'commission0' \? 'defense'/);
  assert.doesNotMatch(app, /value:'topic', label:'Пока только тема'/);
  assert.match(read('assets/js/commission-zero.js'), /state\.source === 'topic'[\s\S]*service=pl/);
});

test('flagship is discoverable as the final gate of the research case', () => {
  const home = read('index.html');
  const services = read('services.html');
  const tariffs = read('tariffs.html');
  const app = read('assets/js/app.js');

  assert.match(home, /Одно дело\.[\s\S]*От темы до защиты\./);
  assert.match(home, /Финальный рубеж дела · Комиссия №0/);
  assert.match(home, /Настоящая комиссия[\s\S]*не должна быть первой/);
  assert.match(home, /commission0-feature/);
  assert.match(home, /configurator\.html\?service=k0/);
  assert.match(services, /catalog-commission[\s\S]*Комиссия №0/);
  assert.match(tariffs, /Комиссия №0 · курсовая/);
  assert.match(tariffs, /Комиссия №0 · ВКР/);
  assert.match(tariffs, /Комиссия №0 · магистерская/);
  assert.match(app, /\['komissiya-0\.html', 'Комиссия №0'/);
});

test('public documents define Commission Zero as A1 and preserve the non-official boundary', () => {
  const offer = read('oferta.html');
  const terms = read('terms.html');
  const integrity = read('academic-integrity.html');
  const ops = read('content/legal/COMMISSION-ZERO-OPS.md');

  assert.match(offer, /Редакция 3\.2/);
  assert.match(offer, /«Комиссия №0» оформляется отдельной Позицией А1/);
  assert.match(offer, /не участвовавший в создании или редактуре проверяемой версии/);
  assert.match(offer, /аудио- или видеозапись сессии по умолчанию не ведётся/i);
  assert.match(terms, /Редакция 2\.2/);
  assert.match(terms, /частная редакторская предзащита/);
  assert.match(integrity, /Комиссия №0 в режиме А1/);
  assert.match(integrity, /Модельные данные не выдаются за результаты фактического исследования/i);
  assert.match(ops, /не является доказательством допустимости фактического[\s\S]*А2/);
});

test('minimum public work price is 2,500 rubles in the canonical calculator', () => {
  const app = read('assets/js/app.js');
  const tariffs = read('tariffs.html');
  assert.match(app, /id: 'self'[\s\S]*diagnostic: 2500,[\s\S]*editing: 2500,[\s\S]*support: 2500/);
  assert.doesNotMatch(tariffs, /"minPrice":1500/);
});

test('Commission Zero mobile treatment is explicit and never hidden at narrow widths', () => {
  const css = read('assets/css/commission-zero.css');
  const pageRoot = css.match(/^\.p15-commission\{([^}]*)\}/m);
  const featureRoot = css.match(/^\.commission0-feature\{([^}]*)\}/m);
  assert.match(css, /@media\(max-width:680px\)/);
  assert.match(css, /\.p15-commission \.protocol-paper__row\{\s*display:grid;\s*grid-template-columns:1fr/);
  assert.match(css, /\.commission0-feature__inner\{\s*grid-template-columns:1fr/);
  assert.ok(pageRoot);
  assert.ok(featureRoot);
  assert.doesNotMatch(pageRoot[1], /display:none/);
  assert.doesNotMatch(featureRoot[1], /display:none/);
});
