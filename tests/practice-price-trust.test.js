const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('otchet-po-praktike.html');
const css = read('assets/css/polish15-catalog.css');
const visibleHtml = html.replace(/<script\b[\s\S]*?<\/script>/gi, '');

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
  assert.match(price, /data-practice-scope="support"[\s\S]*?[Рр]еальные материалы[\s\S]*?несколько связанных этапов[\s\S]*?версии документов по согласованным этапам[\s\S]*?итоговый чек-лист комплектности/);
  assert.match(price, /Студент предоставляет и подтверждает факты, даты и выполненные задачи[\s\S]*?принимает содержательные решения[\s\S]*?формирует финальную авторскую версию/);
  assert.match(price, /Следующий этап не запускается автоматически/);
  assert.match(price, /в течение 14 дней[\s\S]*?зачтём один раз/);
  assert.match(price, /Нижние ориентиры[\s\S]*?свободного срока[\s\S]*?Направление, требования и срочность могут увеличить сумму/);
  assert.match(price, /Предварительный диапазон увидите в подборе до контакта[\s\S]*?в спецификации до оплаты/);
  assert.doesNotMatch(price, /под ключ|гарантируем (?:оценку|зачёт|принятие)|скидк|только сегодня|осталось \d+ мест/i);
});

test('one selected scope controls every continuation into the configurator', () => {
  const price = section('service-price');
  assert.equal((price.match(/button--primary/g) || []).length, 1);
  assert.equal((price.match(/data-practice-scope-choice/g) || []).length, 3);
  assert.equal((price.match(/type="radio"/g) || []).length, 3);
  assert.equal((price.match(/checked/g) || []).length, 1);
  assert.match(html, /data-route="configurator\.html\?work=practice&amp;situation=draft&amp;result=diagnostic&amp;route=service"/);
  assert.match(html, /data-route="configurator\.html\?work=practice&amp;situation=draft&amp;result=editing&amp;route=service"/);
  assert.match(html, /data-route="configurator\.html\?work=practice&amp;situation=topic&amp;result=support&amp;route=service"/);
  assert.equal((html.match(/data-practice-route href=/g) || []).length, 2);
  assert.match(html, /querySelectorAll\('\[data-practice-scope-choice\]'\)/);
  assert.match(html, /link\.setAttribute\('href',route\)/);
  assert.match(html, /data-practice-selection aria-live="polite"/);
  assert.match(html, /href="#service-price">Выбрать объём и цену/);
  assert.doesNotMatch(price, /data-start-format/);
  assert.match(html, /"lowPrice":2500\b/);
  assert.match(html, /"highPrice":14000\b/);
});

test('practice price ledger is page-scoped and covered in dark and mobile layouts', () => {
  assert.match(css, /\[data-p15-service="otchet-po-praktike"\] \.practice-price-map/);
  assert.match(css, /:root\[data-theme="dark"\] \.p15-service\[data-p15-service="otchet-po-praktike"\][\s\S]*?\.practice-price-map/);
  assert.match(css, /practice-price-map__input:checked\+\.practice-price-map__choice/);
  assert.match(css, /practice-price-map__input:focus-visible\+\.practice-price-map__choice/);
  assert.match(css, /@media\(max-width:920px\)[\s\S]*?\[data-p15-service="otchet-po-praktike"\] \.practice-price-map__choice/);
  assert.match(css, /@media\(max-width:620px\)[\s\S]*?\[data-p15-service="otchet-po-praktike"\] \.practice-price-map__head/);
});
