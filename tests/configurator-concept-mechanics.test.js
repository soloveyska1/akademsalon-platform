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
  assert.match(html, /state\.step = routedWork && routedSituation \? 1 : 0/);
  assert.match(html, /state\.situation = routedSituation;\s*state\.workType = routedWork;\s*state\.discipline = routedDiscipline;/);
  assert.match(html, /title:'Что у вас уже есть\?'/);
  for (const key of ['situation', 'work', 'discipline', 'result', 'route']) {
    assert.match(html, new RegExp(`routeParams\\.delete\\('${key}'\\)`));
  }
  assert.match(html, /history\.replaceState\(history\.state/);
  assert.match(html, /if \(key === 'situation'\) return !!\(state\.situation && state\.workType\)/);
  assert.match(html, /offer_id:caseOfferId\(\)/);
  assert.match(html, /payload\.case_context = caseContext/);
});

test('approved wizard facade exposes the live quote and first cart action', () => {
  assert.match(html, /window\.SalonConfiguratorPreview = function/);
  assert.match(html, /<dt>Ориентир стоимости<\/dt><dd>' \+ safeText\(pricing\.priceText\)/);
  assert.match(html, /function recommendationMarkup\(\)/);
  assert.match(html, /Проверьте результат, срок и ориентир цены/);
  assert.match(html, /<details class="recommendation-more">/);
  assert.match(html, /Почему этот вариант и что входит/);
  /* Раньше здесь стояла одна ссылка «Проверить расчёт» — она читается как
     «посмотреть итог», а не как «можно добавить ещё работу», и кнопки
     добавления в видимом интерфейсе не было вовсе: все три точки входа в
     корзину вырезал прежний редизайн. Теперь на этом месте полоса состава,
     и контракт проверяет именно её: сколько позиций набрано, вход в состав
     и явное действие «добавить ещё». */
  assert.match(html, /data-compose-bar/);
  assert.match(html, /data-compose-count/);
  assert.match(html, /class="compose-bar__open" data-cart-open/);
  assert.match(html, /class="compose-bar__add" data-compose-another/);
  assert.match(html, /cart\.materializeCurrent\(\{ silent:false \}\)\) return;\s*\n\s*startAnother\(\)/);
  assert.match(html, /function materialsMarkup\(\) \{\s*var rec = recommendationFor\(\);\s*var pricing = quoteInfo\(\)/);
});

test('canonical work subtypes stay accepted and the first screen includes a clear catch-all option', () => {
  for (const work of [
    'course', 'course_emp', 'diplom', 'master', 'chapter', 'kandidat',
    'vak', 'scopus', 'rinc', 'practice', 'self',
  ]) {
    assert.match(html, new RegExp(`['\"]${work}['\"]`), work);
  }
  assert.match(html, /workOptions:\[/);
  const visibleOptions = html.slice(html.indexOf('workOptions:['), html.indexOf(']\n      }', html.indexOf('workOptions:[')));
  assert.match(visibleOptions, /\['self','Другая работа'\]/);
  assert.match(html, /Не нашли свой вариант\? Спросить редактора/);
  assert.match(html, /function revealReadyQuote\(\)/);
  assert.match(html, /render\(\);\s*revealReadyQuote\(\);/);
  assert.match(html, /Что нужно подготовить\?/);
  assert.match(html, /state\.workType === option\[0\]/);
  assert.doesNotMatch(html, /Какая помощь нужна сейчас\?/);
});

test('draft and comments routes start with a file review instead of a guessed full-edit price', () => {
  assert.match(html, /function sourceFileRequired\(\)/);
  assert.match(html, /\['draft','comments'\]\.indexOf\(state\.situation\) >= 0/);
  assert.match(html, /\['diagnostic','editing'\]\.indexOf\(effectiveResult\(\)\) >= 0/);
  // Ворота остаются: без исходника расчёт не выдаётся. Но доказательством
  // служит файл ИЛИ описание задачи, и второй путь обязан жить внутри мастера —
  // прежняя ссылка уводила на приёмную и бросала заявку.
  assert.match(html, /function sourceEvidenceReady\(\)/);
  assert.match(html, /!sourceFileRequired\(\) \|\| fileNames\(\)\.length > 0 \|\| describedInsteadOfFile\(\)/);
  assert.match(html, /SOURCE_DESCRIPTION_MIN = \d+/);
  assert.match(html, /serviceQuestionsComplete\(\) && sourceEvidenceReady\(\)/);
  assert.match(html, /Для точного разбора нужен файл с текстом или замечаниями/);
  const hint = html.match(/<p class="materials-hint" role="note"><strong>Для точного разбора[\s\S]*?<\/p>/);
  assert.ok(hint, 'file-review hint must stay');
  assert.doesNotMatch(hint[0], /<a\b/, 'the no-file escape must not navigate out of the wizard');
  assert.match(hint[0], /data-describe-instead/);
  assert.match(html, /\[data-describe-instead\][\s\S]*?data-concept-field="comment"[\s\S]*?focus\(/);
  assert.match(html, /state\.workType === 'self'[\s\S]*?priceText:'после уточнения вида и объёма работы'/);
  assert.match(html, /state\.workType !== 'self'/);
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
    /return !!\(\(authed \|\| state\.contact\.trim\(\)\) && state\.consent &&\s*\(state\.result !== 'support' \|\| state\.authorParticipation\)\)/
  );
  // Проверка формата контакта не должна трогать вошедших: у них поля нет,
  // а значение подставляет кабинет. contactFormatIssue() обязан выходить сразу.
  assert.match(html, /function contactFormatIssue\(\)[\s\S]{0,400}?if \(authed\) return '';/);
  assert.match(html, /data-concept-authorship/);
});

test('final handoff keeps Telegram as an optional status channel without a hidden legacy click proxy', () => {
  assert.match(html, /concept-telegram-row concept-telegram-row--login/);
  assert.match(html, /Подключить Telegram для статусов/);
  assert.match(html, /<b>Необязательно<\/b>/);
  assert.match(html, /Пароль не нужен/);
  assert.match(html, /function beginTgLogin\(trigger\)/);
  assert.match(html, /telegramBridge\.start\(telegram\)/);
  assert.doesNotMatch(
    html,
    /var source = document\.getElementById\('tgLoginBtn'\);\s*if \(source\) source\.click\(\);/,
  );
  assert.match(html, /pendingLogin \? 'Подтвердить подключение' : 'Подключить Telegram для статусов'/);
});

test('concept contact step uses the scoped Telegram bridge and cannot crash on render', () => {
  const concept = html.slice(html.indexOf('(function initConceptWizard()'), html.lastIndexOf('})();'));
  assert.match(html, /window\.SalonTelegramLogin = \{[\s\S]*?pending:function \(\) \{ return pendingTgLogin; \}/);
  assert.doesNotMatch(concept, /\bpendingTgLogin\b/);
  assert.match(concept, /var telegramBridge = window\.SalonTelegramLogin/);
});

test('urgent homepage entry participates in saved-draft conflict handling', () => {
  assert.match(html, /var hasHomeRouteContext = \['home-zero','home-edit','home-urgent'\]\.indexOf\(routeOrigin\) >= 0/);
  assert.match(html, /routedResult \|\| hasHomeRouteContext/);
  assert.match(html, /Срочная задача с точной датой/);
  assert.match(html, /Сохранённый черновик будет заменён/);
});

test('pressed-button selectors use group semantics and support copy stays consistent', () => {
  assert.match(html, /concept-work-choice__rows" role="group"/);
  assert.match(html, /concept-contact-methods" role="group"/);
  assert.match(html, /<div role="group" aria-label="Направление работы">/);
  const reason = html.slice(html.indexOf('function recommendationReason()'), html.indexOf('function recommendationChange()'));
  assert.ok(reason.indexOf("result === 'support'") < reason.indexOf("state.situation === 'topic'"));
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

test('autosave feedback is factual and never hard-coded into the mobile dock', () => {
  assert.match(html, /function announceAutosave\(ok\)/);
  assert.match(html, /data-autosave-state/);
  assert.match(html, /Сохранено на этом устройстве/);
  assert.match(css, /span\[data-concept-task-kicker\]::after\{\s*display:none;\s*content:none;/);
  assert.match(css, /\.configurator-task \.wizard-main__footer\{\s*position:static;/);
  assert.match(mobileCss, /:root\.has-consent-bar \.concept-task-bar/);
  assert.match(html, /topic:String\(state\.topic \|\| ''\)\.slice\(0,4000\)/);
  assert.match(html, /comment:String\(state\.comment \|\| ''\)\.slice\(0,8000\)/);
  assert.match(html, /fieldAutosaveTimer = setTimeout\(function \(\) \{ saveSelections\(true\); \},450\)/);
  assert.match(html, /Контакты и файлы не сохраняются/);
  assert.doesNotMatch(
    html.slice(html.indexOf('function saveSelections'), html.indexOf('function newDraftId')),
    /contact:state\.contact|consent:state\.consent/,
  );
});

test('catalog handoff is acknowledged and the first estimate is visible before contact', () => {
  assert.match(
    html,
    /Сразу покажем первый результат и ориентир цены/,
    'the first screen should explain when the estimate appears',
  );
  assert.match(html, /if \(routeOrigin === 'page'\) handoffLabel = 'Вы выбрали на странице услуг'/);
  assert.match(html, /if \(routeOrigin === 'service'\) handoffLabel = 'Вы выбрали на странице услуги'/);
  assert.match(html, /Вы выбрали на странице услуг/);
  assert.match(html, /if \(key === 'situation'\) return 'Указать срок'/);
  assert.match(html, /data-change-home-situation/);
  assert.match(html, /pendingRouteConflict/);
  assert.doesNotMatch(html, /key:'recommendation', displayStep:null/);
  assert.match(
    css,
    /\.decision-card__origin\{[\s\S]*?border:1px solid color-mix/,
  );
  assert.match(
    css,
    /@media\(min-width:921px\)\{[\s\S]*?wizard-main__head--situation \.eyebrow/,
  );
});

test('late journey keeps current price, reviewable details and contact-first mobile order', () => {
  assert.equal((html.match(/<dd data-summary-price>/g) || []).length, 2);
  assert.match(html, /function refreshVisibleSummaryPrice\(\)/);
  assert.match(html, /refreshVisibleSummaryPrice\(\);/);
  assert.match(html, /serviceSummaryRows\(\)/);
  assert.match(html, /<dt>Тема<\/dt>/);
  assert.match(html, /<dt>Требования<\/dt>/);
  assert.match(html, /data-concept-edit>Изменить данные заявки/);
  assert.match(html, /В рабочее время обычно отвечаем за 15–30 минут/);
  assert.match(html, /host\.setAttribute\('data-concept-stage',step\.key\)/);
  assert.match(css, /@media\(max-width:1040px\)\{[\s\S]*?materials-step>\.wizard-summary/);
  assert.match(css, /review-step>\.contact-step__form\{order:1\}/);
  assert.match(css, /review-step>\.wizard-summary\{order:2\}/);
  assert.match(css, /concept-contact-methods\{\s*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});

test('required deadline precedes optional description fields on the materials screen', () => {
  const materials = html.slice(html.indexOf('function materialsMarkup()'), html.indexOf('function contactMarkup()'));
  const renderedDeadline = materials.indexOf('<div class="deadline-field">');
  const renderedDetails = materials.indexOf('(detailsRequired', renderedDeadline);
  assert.ok(renderedDeadline > -1 && renderedDetails > renderedDeadline);
  assert.match(materials, /var detailsBody =[\s\S]*?data-concept-field="topic"[\s\S]*?data-concept-field="comment"/);
  assert.match(materials, /<details class="materials-optional"/);
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
  // OUT-003 moves the shared shell and the generated home bundle in one cache wave.
  // OUT-007 keeps its shared search wave; release103 adds a CSS-only trigger marker.
  assert.match(indexHtml, /home-release\.min\.css\?v=20260804shell112&amp;search=20260803out007search1&amp;trigger=20260803out007trigger1&amp;contrast=20260804contrast1" data-mobile-edition="1"/);
  assert.match(mobileCss, /@media screen and \(max-width:920px\)/);
  assert.match(appJs, /link\.media = 'screen and \(max-width:920px\)'/);
  assert.match(appJs, /matchMedia\('\(max-width:920px\)'\)/);
});
