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

test('homepage situation deep links preserve the situation and start with the work type', () => {
  assert.match(html, /situationCode = routeParams\.get\('situation'\)/);
  assert.match(html, /\['topic','draft','comments','defense'\]\.indexOf\(situationCode\) >= 0/);
  assert.match(html, /state\.step = 0;\s*state\.draftId = newDraftId\(\);\s*state\.situation = situationCode/);
  assert.match(html, /title:'С какой работой нужна помощь\?'/);
  assert.match(html, /routeParams\.delete\('situation'\)/);
  assert.match(html, /history\.replaceState\(history\.state/);
});

test('approved wizard facade exposes the live quote and first cart action', () => {
  assert.match(html, /window\.SalonConfiguratorPreview = function/);
  assert.match(html, /<dt>Ориентир стоимости<\/dt><dd>' \+ safeText\(pricing\.priceText\)/);
  assert.match(html, /function recommendationMarkup\(\)/);
  assert.match(html, /До контактов уже видны состав, границы работы и ориентир стоимости/);
  assert.match(html, /cartHasItems \? 'Открыть состав сметы' : 'Открыть смету заказа'/);
  assert.match(html, /class="line-link concept-cart-link" type="button" data-cart-open/);
});

test('multi-position flow returns to the visible concept wizard and keeps cart totals authoritative', () => {
  assert.match(html, /window\.SalonConceptWizard\.startAnother\(kind\)/);
  assert.match(html, /window\.SalonConceptWizard = \{[\s\S]*?startAnother:startAnother,[\s\S]*?currentKey:function/);
  assert.match(html, /quote = cartHasItems && window\.SalonCart\.quote/);
  assert.match(html, /window\.SalonCart\.contains\(window\.SalonCart\.currentItem\(\)\)/);
  assert.match(html, /Текущий выбор пока не входит в состав/);
  assert.match(html, /document\.addEventListener\('salon:cart'/);
  assert.match(html, /key === 'recommendation' \|\| key === 'materials' \|\| key === 'contact'/);
});

test('concept draft updates the saved cart row in place and current-only benefits are materialized', () => {
  assert.match(html, /draftId:savedMatchesMode && saved\.draftId \? saved\.draftId : newDraftId\(\)/);
  assert.match(html, /draft\.concept = concept/);
  assert.match(html, /sourceId:sourceId/);
  assert.match(html, /window\.SalonCart\.syncCurrent\(\{ quiet:true \}\)/);
  assert.match(html, /activeCart\.hasCheckoutIntent\(\)/);
  assert.match(html, /activeCart\.materializeCurrent\(\{ silent:true \}\)/);
});

test('authenticated customer can continue without retyping an already connected contact', () => {
  assert.match(
    html,
    /var authed = !!\(window\.Salon && Salon\.api && Salon\.api\.token && Salon\.api\.token\(\)\);/
  );
  assert.match(
    html,
    /return !!\(\(authed \|\| state\.contact\.trim\(\)\) && state\.consent &&\s*\(state\.result !== 'support' \|\| state\.authorParticipation\)\);/
  );
  assert.match(html, /data-concept-authorship/);
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
  assert.match(
    css,
    /@media\(max-width:390px\)\{\s*\.concept-task-bar>div\{display:none\}/
  );
  assert.match(
    css,
    /\.concept-task-bar>\.btn\{\s*width:auto;\s*flex:1 1 auto;/
  );
});

test('1024px keeps the canonical two-column choices and readable contact width', () => {
  assert.match(
    css,
    /@media\(min-width:921px\) and \(max-width:1040px\)\{/
  );
  assert.match(
    css,
    /\.configurator-task \.concept-wizard-host\{\s*padding-right:48px;\s*padding-left:48px;/
  );
  assert.match(
    css,
    /\.configurator-task \.decision-grid--compact\{\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\);/
  );
});

test('home begins directly after the in-flow desktop header and mobile appbar offset', () => {
  const rootRule = homeCss.match(/\.polish15-home\{[\s\S]*?\n\}/)?.[0] || '';
  assert.doesNotMatch(rootRule, /padding-top/);
  assert.doesNotMatch(homeCss, /\.polish15-home\{[\s\S]*?padding-top:(?:48|60|64)px/);
});

test('production chrome switches to the approved mobile edition at 920px', () => {
  assert.match(indexHtml, /mobile\.css\?v=20260726release28" media="screen and \(max-width:920px\)"/);
  assert.match(mobileCss, /@media screen and \(max-width:920px\)/);
  assert.match(appJs, /link\.media = 'screen and \(max-width:920px\)'/);
  assert.match(appJs, /matchMedia\('\(max-width:920px\)'\)/);
});
