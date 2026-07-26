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

test('context links preserve safe route codes and skip only resolved decisions', () => {
  assert.match(html, /situationCode = routeParams\.get\('situation'\)/);
  assert.match(html, /workCode = routeParams\.get\('work'\)/);
  assert.match(html, /resultCode = routeParams\.get\('result'\)/);
  assert.match(html, /disciplineCode = routeParams\.get\('discipline'\)/);
  assert.match(html, /var routedSituation = \['topic','draft','comments','defense'\]\.indexOf\(situationCode\) >= 0/);
  assert.match(html, /state\.step = routedWork && routedDiscipline && routedSituation && routedResult \? 3/);
  assert.match(html, /state\.situation = routedSituation;\s*state\.workType = routedWork;\s*state\.discipline = routedDiscipline;\s*state\.result = routedResult/);
  assert.match(html, /title:'С какой работой нужна помощь\?'/);
  for (const key of ['situation', 'work', 'discipline', 'result', 'route']) {
    assert.match(html, new RegExp(`routeParams\\.delete\\('${key}'\\)`));
  }
  assert.match(html, /history\.replaceState\(history\.state/);
  assert.match(html, /if \(key === 'workType'\) return !!\(state\.workType && state\.discipline\)/);
  assert.match(html, /offer_id:caseOfferId\(\)/);
  assert.match(html, /payload\.case_context = caseContext/);
});

test('approved wizard facade exposes the live quote and first cart action', () => {
  assert.match(html, /window\.SalonConfiguratorPreview = function/);
  assert.match(html, /<dt>Ориентир стоимости<\/dt><dd>' \+ safeText\(pricing\.priceText\)/);
  assert.match(html, /function recommendationMarkup\(\)/);
  assert.match(html, /До контактов уже видны состав, границы работы и ориентир стоимости/);
  assert.match(html, /cartHasItems \? 'Открыть состав сметы' : 'Открыть смету заказа'/);
  assert.match(html, /class="line-link concept-cart-link" type="button" data-cart-open/);
  assert.match(html, /function materialsMarkup\(\) \{\s*var rec = recommendationFor\(\);\s*var pricing = quoteInfo\(\)/);
});

test('every canonical work subtype stays visible and preserves its exact selection', () => {
  for (const work of [
    'course', 'course_emp', 'diplom', 'master', 'chapter', 'kandidat',
    'vak', 'scopus', 'rinc', 'practice', 'self',
  ]) {
    assert.match(html, new RegExp(`\\['${work}','`), work);
  }
  assert.match(html, /specialistOptions:\[/);
  assert.match(html, /Специализированные форматы/);
  assert.match(html, /selected === option\[0\]/);
});

test('topic-only routes cannot bypass prerequisites for file-dependent results', () => {
  assert.match(html, /function resultNeedsExistingMaterial\(value\)/);
  for (const result of ['editing', 'formatting', 'defense', 'ai_editing']) {
    assert.match(html, new RegExp(`resultNeedsExistingMaterial[\\s\\S]*?'${result}'`));
  }
  assert.match(html, /routedSituation === 'topic' && resultNeedsExistingMaterial\(routedResult\)/);
  assert.match(html, /disabled aria-disabled="true"/);
  assert.match(html, /Для редактуры, оформления, работы после ИИ и подготовки к защите нужен готовый файл/);
  assert.match(html, /if \(!service && state\.situation === 'topic' && resultNeedsExistingMaterial\(state\.result\)\)/);
});

test('candidate diagnostic and specialist services use canonical offers and prices', () => {
  assert.match(html, /result === 'diagnostic' && state\.workType === 'kandidat'\) return 'work_base'/);
  assert.match(html, /diagnostic:'base'/);
  assert.match(html, /offer === 'svc_tutor' \? 3000/);
  assert.match(html, /offer === 'svc_ai' \? 2500/);
  assert.match(html, /service\.id === 'tutor' \? 'tutoring'/);
  assert.match(html, /service\.id === 'ai' \? 'ai_editing'/);
});

test('privacy-safe route telemetry is versioned and never includes free text fields', () => {
  assert.match(html, /var RULES_EVENT_VERSION = 'r1'/);
  assert.match(html, /Salon\.visit\.event\(name,\{\s*cta:caseOfferId\(\),\s*variant:variant/);
  for (const event of ['case_step_view', 'case_recommend_view', 'case_route_change', 'case_submit_ready']) {
    assert.match(html, new RegExp(`trackConcept\\('${event}'`));
  }
  const telemetry = html.slice(html.indexOf('function conceptVariant'), html.indexOf('function isFullWorkOffer'));
  assert.doesNotMatch(telemetry, /state\.(?:topic|comment|contact|name)/);
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
  assert.match(indexHtml, /home-release\.min\.css\?v=20260726release32" data-mobile-edition="1"/);
  assert.match(mobileCss, /@media screen and \(max-width:920px\)/);
  assert.match(appJs, /link\.media = 'screen and \(max-width:920px\)'/);
  assert.match(appJs, /matchMedia\('\(max-width:920px\)'\)/);
});
