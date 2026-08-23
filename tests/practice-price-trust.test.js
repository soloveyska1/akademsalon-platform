const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('otchet-po-praktike.html');
const css = read('assets/css/polish15-catalog.css');
const journeyCss = read('assets/css/configurator-journey.css');
const cart = read('assets/js/cart.js');
const configurator = read('configurator.html');
const cartCurrentItem = configurator.slice(
  configurator.indexOf('function cartCurrentItem()'),
  configurator.indexOf('function cartCurrentValid()'),
);
const radioGroup = configurator.slice(
  configurator.indexOf('function radioGroup('),
  configurator.indexOf('var rgType ='),
);
const visibleHtml = html.replace(/<script\b[\s\S]*?<\/script>/gi, '');
const serviceSchema = [...html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi)]
  .map((match) => JSON.parse(match[1]))
  .find((value) => value['@type'] === 'Service');

const section = (id) => {
  const start = html.indexOf(`id="${id}"`);
  assert.notEqual(start, -1, `missing #${id}`);
  const end = html.indexOf('</section>', start);
  assert.notEqual(end, -1, `unclosed #${id}`);
  return html.slice(start, end);
};

test('practice page explains all three canonical scopes before contact', () => {
  assert.match(visibleHtml, /data-practice-price-brief/);
  assert.match(visibleHtml, /Письменный разбор[\s\S]*?от 2(?: |&nbsp;|\u00a0)500(?: |&nbsp;|\u00a0)₽/);
  assert.match(visibleHtml, /Редактура готового комплекта[\s\S]*?от 8(?: |&nbsp;|\u00a0)000(?: |&nbsp;|\u00a0)₽/);
  assert.match(visibleHtml, /Сопровождение по этапам[\s\S]*?от 14(?: |&nbsp;|\u00a0)000(?: |&nbsp;|\u00a0)₽/);
  assert.match(visibleHtml, /Это разные объёмы, а не три цены за одну работу/);
  assert.doesNotMatch(visibleHtml, /редактура полного комплекта/i);
});

test('each price is tied to a different entry condition and verifiable output', () => {
  const price = section('service-price');
  assert.equal((price.match(/data-practice-scope=/g) || []).length, 3);
  assert.match(price, /data-practice-scope="diagnostic"[\s\S]*?Есть файл или замечания[\s\S]*?Без правок в документе/);
  assert.match(price, /data-practice-scope="editing"[\s\S]*?Готовы отчёт и дневник на фактических материалах[\s\S]*?Word с видимыми исправлениями/);
  assert.match(price, /data-practice-scope="support"[\s\S]*?[Чч]ерновик и реальные материалы[\s\S]*?несколько связанных этапов[\s\S]*?план согласованных этапов[\s\S]*?версии документов[\s\S]*?итоговый чек-лист комплектности/);
  assert.match(price, /Студент предоставляет и подтверждает факты, даты и выполненные задачи[\s\S]*?принимает содержательные решения[\s\S]*?формирует финальную авторскую версию/);
  assert.match(price, /Следующий этап не запускается автоматически/);
  assert.match(price, /в течение 14 дней[\s\S]*?зачтём один раз/);
  assert.match(price, /Нижние ориентиры[\s\S]*?свободного срока[\s\S]*?Направление, требования и срочность могут увеличить сумму/);
  assert.match(price, /Предварительный диапазон увидите в подборе до контакта[\s\S]*?в спецификации до оплаты/);
  assert.doesNotMatch(price, /под ключ|гарантируем (?:оценку|зачёт|принятие)|скидк|только сегодня|осталось \d+ мест/i);
});

test('14k support has one checkable result passport before the primary action', () => {
  const price = section('service-price');
  const passportStart = price.indexOf('data-practice-result-passport');
  const actionStart = price.indexOf('class="practice-price-action"');

  assert.equal((price.match(/data-practice-result-passport/g) || []).length, 1);
  assert.ok(passportStart >= 0 && passportStart < actionStart, 'passport must precede the price action');
  assert.match(
    price,
    /data-practice-scope="support"[\s\S]*?data-practice-scope-choice[\s\S]*?data-practice-result-passport[\s\S]*?<\/li>[\s\S]*?<\/ol>/
  );
  assert.match(price, /Вариант 03 · сопровождение от 14(?: |&nbsp;|\u00a0)000(?: |&nbsp;|\u00a0)₽/);
  assert.match(price, /Паспорт результата сопровождения/);
  assert.match(price, /class="practice-result-passport__folio" aria-hidden="true">03/);
  assert.match(
    price,
    /Для старта[\s\S]*?Программа или методичка практики[\s\S]*?черновики отчёта и дневника[\s\S]*?реальные факты, даты, выполненные задачи и приложения/
  );
  assert.equal((price.match(/data-practice-passport-output=/g) || []).length, 4);
  assert.match(price, /Карта требований и список недостающего по переданному комплекту/);
  assert.match(price, /План согласованных этапов[\s\S]*?результат каждого этапа/);
  assert.match(price, /Согласованные редакторские версии отчёта и дневника/);
  assert.match(price, /Итоговый чек-лист комплектности, подписей и приложений/);
  assert.match(
    price,
    /Самостоятельный сбор реальных сведений о практике[\s\S]*?выполнение и сдача аттестационной работы вместо вас[\s\S]*?вымышленные факты, даты, задачи и фиктивный дневник[\s\S]*?гарантия оценки, допуска, принятия комплекта или решения комиссии/
  );
  assert.match(price, /Следующий этап не запускается автоматически/);
  assert.match(price, /14 000 ₽ — нижний ориентир всего состава выше, не только первого результата/);
  assert.match(price, /до оплаты в спецификации зафиксируем общую цену сопровождения и разбивку по этапам/);
  assert.match(price, /Новые задачи вне неё считаются отдельно/);
  assert.match(price, /<details class="practice-result-passport__boundary">[\s\S]*?<summary>Кто за что отвечает и как запускаются этапы/);
  assert.match(price, /href="specifikaciya\.html"[\s\S]*?вымышленный образец/);
  assert.equal((price.match(/href="specifikaciya\.html"/g) || []).length, 1);
  assert.equal((price.match(/button--primary/g) || []).length, 1);
  assert.doesNotMatch(price, /универсальная смета|реальный кейс|результат клиента/i);
});

test('one selected scope controls every continuation into the configurator', () => {
  const price = section('service-price');
  assert.equal((price.match(/button--primary/g) || []).length, 1);
  assert.equal((price.match(/data-practice-scope-choice/g) || []).length, 3);
  assert.equal((price.match(/type="radio"/g) || []).length, 3);
  assert.equal((price.match(/checked/g) || []).length, 1);
  assert.match(html, /data-route="configurator\.html\?work=practice&amp;situation=draft&amp;result=diagnostic&amp;route=service"/);
  assert.match(html, /data-route="configurator\.html\?work=practice&amp;situation=draft&amp;result=editing&amp;route=service"/);
  assert.match(html, /data-route="configurator\.html\?work=practice&amp;situation=draft&amp;result=support&amp;route=service"/);
  assert.doesNotMatch(html, /situation=topic&amp;result=support/);
  assert.match(configurator, /draft:'Свой черновик'/);
  assert.match(configurator, /support:'Сопровождение исследования по этапам'/);
  assert.match(configurator, /support:\{[\s\S]*?first:'План исследования и задачи на первый этап'/);
  assert.equal((html.match(/data-practice-route href=/g) || []).length, 2);
  assert.match(html, /querySelectorAll\('\[data-practice-scope-choice\]'\)/);
  assert.match(html, /link\.setAttribute\('href',route\)/);
  assert.match(html, /data-practice-selection aria-live="polite"/);
  assert.match(
    html,
    /function syncChoice\(\)[\s\S]*?data-practice-scope-choice\]:checked[\s\S]*?window\.addEventListener\('pageshow',syncChoice\)/
  );
  assert.match(html, /href="#service-price">Выбрать объём и цену/);
  assert.doesNotMatch(price, /data-start-format/);
  assert.deepEqual(
    serviceSchema.offers.map((offer) => offer.priceSpecification.minPrice),
    [2500, 8000, 14000]
  );
  assert.doesNotMatch(html, /"highPrice":/);
});

test('practice selection also controls the mobile dock without stealing a saved draft', () => {
  assert.match(html, /document\.querySelector\('\.mobile-dock__primary'\)/);
  assert.match(html, /dock\.setAttribute\('href',route\)/);
  assert.match(html, /dock\.setAttribute\('aria-label','Продолжить: '\+selected\.title\)/);
  assert.match(html, /dockLabel\.textContent='Продолжить'/);
  assert.match(html, /!explicit && dock\.getAttribute\('data-resume-draft'\)==='true'/);
  assert.match(html, /dock\.removeAttribute\('data-resume-draft'\)/);
  assert.match(html, /applyChoice\(choice,true\)/);
  assert.match(html, /applyChoice\([^;]+,false\)/);
});

test('three practice routes preserve scope codes while draft support stays supplied-material A1', () => {
  assert.match(
    configurator,
    /function practiceDraftScopeCode\(\)[\s\S]*?service \|\| state\.workType !== 'practice' \|\| state\.situation !== 'draft'[\s\S]*?practice_draft_/
  );
  assert.match(configurator, /function isPracticeDraftDiagnostic\(\)[\s\S]*?practiceDraftScopeCode\(\) === 'practice_draft_diagnostic'/);
  assert.match(configurator, /function isPracticeDraftEditing\(\)[\s\S]*?practiceDraftScopeCode\(\) === 'practice_draft_editing'/);
  assert.match(configurator, /function isPracticeDraftSupport\(\)[\s\S]*?practiceDraftScopeCode\(\) === 'practice_draft_support'/);
  assert.match(configurator, /Письменный разбор комплекта по практике/);
  assert.match(configurator, /Карта несоответствий, обязательных исправлений и приоритетов/);
  assert.match(configurator, /Редактор не вносит правки в документы на этом этапе/);
  assert.match(configurator, /Редактура готового комплекта по практике/);
  assert.match(configurator, /Word с видимыми правками, сверка с программой и чек-лист подписей и приложений/);
  assert.match(configurator, /Приложить готовый комплект/);
  assert.match(configurator, /Для точной редактуры нужны готовые отчёт и дневник/);
  assert.match(configurator, /срок начнётся после получения полного комплекта/);
  assert.match(configurator, /Сопровождение комплекта по практике/);
  assert.match(
    configurator,
    /Начнём с проверки вашего черновика, дневника, программы и приложений\.[\s\S]*?будем вести согласованные версии документов/
  );
  assert.match(configurator, /Карта требований, список недостающего и план согласованных этапов/);
  assert.match(
    configurator,
    /Передать реальные сведения о практике[\s\S]*?подтвердить факты, даты и выполненные задачи/
  );
  assert.match(
    configurator,
    /function academicSubmode\(\)[\s\S]*?isPracticeDraftSupport\(\)[\s\S]*?return 'A1'/
  );
  assert.match(configurator, /scope_code:practiceDraftScopeCode\(\) \|\| null/);
  assert.match(configurator, /result_code:effectiveResult\(\) \|\| null/);
  assert.match(configurator, /practice_draft_diagnostic\|practice_draft_editing\|practice_draft_support/);
  assert.match(cartCurrentItem, /var scopeCode = caseContext[\s\S]*?scopeCode:scopeCode/);
  assert.match(cartCurrentItem, /var resultCode = caseContext[\s\S]*?resultCode:resultCode/);
  assert.doesNotMatch(radioGroup, /caseContext|practice_draft_/);
  assert.match(
    configurator,
    /var practiceScopeSubmit = caseContext &&[\s\S]*?practice_draft_diagnostic\|practice_draft_editing\|practice_draft_support/
  );
  assert.match(
    configurator,
    /var shouldMaterializeCurrent = activeCart[\s\S]*?practiceScopeSubmit[\s\S]*?activeCart\.materializeCurrent\(\{ silent:true \}\)/
  );
  assert.match(
    configurator,
    /if \(!svc && !practiceScopeSubmit &&[\s\S]*?svc_\(\?:plan\|review\|norm\|defense\|ai\|tutor\)/
  );
  assert.match(configurator, /payload\.cart = window\.SalonCart\.payload\(\)/);
  assert.match(
    configurator,
    /var academicSubmode = caseContext && caseContext\.academic_submode === 'A2'[\s\S]*?state\.tier === 'vip' \? 'A2' : 'A1'[\s\S]*?caseContext\.academic_submode === 'A1'\) academicSubmode = 'A1'/
  );
  assert.match(
    cart,
    /function resolvedAcademicSubmode\(x\)[\s\S]*?x\.academicSubmode === 'A1'[\s\S]*?x\.academicSubmode === 'A2'[\s\S]*?x\.tier === 'vip'/
  );
  assert.match(cart, /Письменный разбор комплекта по практике/);
  assert.match(cart, /Редактура готового комплекта по практике/);
  assert.match(cart, /Сопровождение комплекта по практике/);
  assert.match(cart, /Редакторское сопровождение предоставленного Заказчиком черновика и связанных документов по практике/);
  assert.match(configurator, /materials-step--practice-scope/);
  assert.match(configurator, /configurator-journey\.css[^\"]*practice=20260823continuity1/);
  assert.match(configurator, /assets\/js\/cart\.js[^\"]*practice=20260823continuity1/);
  assert.match(
    journeyCss,
    /@media\(max-width:920px\)[\s\S]*?\.materials-step--practice-scope \.wizard-summary[\s\S]*?order:-1/
  );
  assert.match(
    configurator,
    /<a class="line-link" href="otchet-po-praktike\.html#service-price">Изменить объём/
  );
  assert.doesNotMatch(
    configurator,
    /practiceSupport \? '<button[^']*data-concept-edit[^']*Изменить объём/
  );
  assert.match(
    configurator,
    /Проверьте перенесённый объём, укажите дату первого результата и приложите материалы комплекта/
  );
  assert.match(
    configurator,
    /Проверю факты, даты и выполненные задачи, приму содержательные решения и подготовлю финальную авторскую версию/
  );
  assert.match(configurator, /aria-describedby="practiceSupportDescriptionHint"/);
  assert.match(
    configurator,
    /practiceSupportDescriptionHint[\s\S]*?минимум ' \+ SOURCE_DESCRIPTION_MIN \+ ' знаков[\s\S]*?data-source-description-count/
  );
  assert.match(
    configurator,
    /key === 'comment'[\s\S]*?data-source-description-count[\s\S]*?state\.comment\.trim\(\)\.length \+ ' из ' \+ SOURCE_DESCRIPTION_MIN/
  );
  assert.doesNotMatch(configurator, /data-source-description-count[^>]*aria-live/);
  assert.match(configurator, /опишите комплект: минимум 40 знаков/);
  assert.match(configurator, /support:\{[\s\S]*?Можно прийти без текста[\s\S]*?first:'План исследования и задачи на первый этап'/);
});

test('practice price ledger is page-scoped and covered in dark and mobile layouts', () => {
  assert.match(css, /\[data-p15-service="otchet-po-praktike"\] \.practice-price-map/);
  assert.match(css, /:root\[data-theme="dark"\] \.p15-service\[data-p15-service="otchet-po-praktike"\][\s\S]*?\.practice-price-map/);
  assert.match(css, /\[data-p15-service="otchet-po-praktike"\] \.practice-result-passport/);
  assert.match(css, /\.practice-result-passport\{[\s\S]*?display:none/);
  assert.match(css, /practice-price-map__input:checked~\.practice-result-passport\{[\s\S]*?display:block/);
  assert.match(css, /:root\[data-theme="dark"\] \.p15-service\[data-p15-service="otchet-po-praktike"\][\s\S]*?\.practice-result-passport/);
  assert.match(css, /:root\[data-theme="dark"\][\s\S]*?\.practice-result-passport__outputs li span[\s\S]*?color:color-mix/);
  assert.match(css, /practice-price-map__input:checked\+\.practice-price-map__choice/);
  assert.match(css, /practice-price-map__input:focus-visible\+\.practice-price-map__choice/);
  assert.match(css, /\.practice-result-passport__boundary summary\{[\s\S]*?min-height:54px/);
  assert.match(css, /@media\(max-width:920px\)[\s\S]*?\[data-p15-service="otchet-po-praktike"\] \.practice-result-passport__outputs ol/);
  assert.match(css, /@media\(max-width:620px\)[\s\S]*?\[data-p15-service="otchet-po-praktike"\] \.practice-result-passport__folio/);
});
