const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('configurator.html');
const css = read('assets/css/polish15-configurator.css');
const homeCss = read('assets/css/polish15-home.css');
const mobileCss = read('assets/css/mobile.css');
const appJs = read('assets/js/app.js');
const indexHtml = read('index.html');

test('homepage situation deep links enter the matching second wizard step', () => {
  assert.match(html, /situationCode = routeParams\.get\('situation'\)/);
  assert.match(html, /\['topic','draft','comments','defense'\]\.indexOf\(situationCode\) >= 0/);
  assert.match(html, /state\.situation = situationCode;\s*state\.step = 1;\s*saveSelections\(\)/);
  assert.match(html, /routeParams\.delete\('situation'\)/);
  assert.match(html, /history\.replaceState\(history\.state/);
});

test('approved wizard facade exposes the live quote and first cart action', () => {
  assert.match(html, /window\.SalonConfiguratorPreview = function/);
  assert.match(html, /<dt>Ориентир стоимости<\/dt><dd>' \+ safeText\(priceText\)/);
  assert.match(html, /cartHasItems \? 'Открыть состав сметы' : 'Открыть смету заказа'/);
  assert.match(html, /class="line-link concept-cart-link" type="button" data-cart-open/);
});

test('multi-position flow returns to the visible concept wizard and keeps cart totals authoritative', () => {
  assert.match(html, /window\.SalonConceptWizard\.startAnother\(kind\)/);
  assert.match(html, /window\.SalonConceptWizard = \{ startAnother:startAnother \}/);
  assert.match(html, /quote = cartHasItems && window\.SalonCart\.quote/);
  assert.match(html, /window\.SalonCart\.contains\(window\.SalonCart\.currentItem\(\)\)/);
  assert.match(html, /Текущий выбор пока не входит в состав/);
  assert.match(html, /document\.addEventListener\('salon:cart'/);
  assert.match(html, /if \(state\.step === 4\) render\(\)/);
});

test('universal contact field serializes obvious email, phone and messenger formats correctly', () => {
  assert.match(html, /function contactKind\(value\)/);
  assert.match(html, /\^\[\^\\s@\]\+@\[\^\\s@\]\+\\\.\[\^\\s@\]\{2,\}\$/);
  assert.match(html, /digits\.length >= 10/);
  assert.match(html, /var kind = contactKind\(v\)/);
  assert.match(html, /return CT_TAG\[kind\] \? CT_TAG\[kind\] \+ ': ' \+ v : v/);
});

test('mobile cart access cannot be covered by the contextual task bar', () => {
  assert.match(css, /\.configurator-task>\.cart-tab\{display:none!important\}/);
  assert.match(css, /\.configurator-task \.cart-drawer\{\s*display:block;/);
  assert.match(css, /overflow-y:auto;/);
});

test('home begins directly after the in-flow desktop header and mobile appbar offset', () => {
  const rootRule = homeCss.match(/\.polish15-home\{[\s\S]*?\n\}/)?.[0] || '';
  assert.doesNotMatch(rootRule, /padding-top/);
  assert.doesNotMatch(homeCss, /\.polish15-home\{[\s\S]*?padding-top:(?:48|60|64)px/);
});

test('production chrome switches to the approved mobile edition at 920px', () => {
  assert.match(indexHtml, /mobile\.css\?v=20260726release18" media="screen and \(max-width:920px\)"/);
  assert.match(mobileCss, /@media screen and \(max-width:920px\)/);
  assert.match(appJs, /link\.media = 'screen and \(max-width:920px\)'/);
  assert.match(appJs, /matchMedia\('\(max-width:920px\)'\)/);
});
