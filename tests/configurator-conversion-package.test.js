const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('configurator.html');
const css = read('assets/css/configurator-journey.css');
const reviews = read('reviews.html');

test('quote scope is an optional three-way preference with a safe default', () => {
  assert.match(html, /function quoteScopeMarkup\(\)/);
  assert.match(html, /\['first','Только первый этап'/);
  assert.match(html, /\['milestone','До следующего рубежа'/);
  assert.match(html, /\['full','До сдачи \/ защиты'/);
  assert.match(html, /quoteScope:\['first','milestone','full'\]\.indexOf\(value\.quoteScope\) >= 0 \? value\.quoteScope : 'first'/);
  assert.match(html, /quoteScope:state\.quoteScope/);
  assert.match(html, /quoteScope:savedMatchesMode \? \(saved\.quoteScope \|\| 'first'\) : 'first'/);
  assert.match(html, /data-quote-scope="' \+ option\[0\]/);
  assert.match(html, /host\.querySelectorAll\('\[data-quote-scope\]'\)/);
  assert.match(html, /Предпочтение по смете: ' \+ quoteScopeLabel\(state\.quoteScope\) \+ '\.'/);
  assert.match(html, /Выбор нужен только для сметы и не запускает работу/);
});

test('expanded scope never masquerades as a known total or adds a submission gate', () => {
  assert.match(html, /Ориентир первого этапа/);
  assert.match(html, /Полный состав и общую стоимость редактор рассчитает после просмотра материалов/);
  assert.match(html, /Состав и общая цена — после материалов/);
  assert.match(html, /Можно сменить вариант до отправки заявки/);
  const blockReason = html.slice(html.indexOf('function blockReason()'), html.indexOf('function contactFormatIssue()'));
  assert.doesNotMatch(blockReason, /quoteScope/);
  assert.doesNotMatch(html, /quote_scope_(?:view|change|submit)/);
});

test('an explicit full-support route never labels its project range as a first-stage price', () => {
  assert.match(html, /function quoteScopeEligible\(\) \{\s*return !service && effectiveResult\(\) !== 'support';\s*\}/);
  assert.match(html, /function quoteScopeMarkup\(\) \{\s*if \(!quoteScopeEligible\(\)\) return '';/);
  assert.match(html, /if \(effectiveResult\(\) === 'support'\) return 'Ориентир сопровождения';/);
  assert.match(html, /quoteScopeEligible\(\) \? 'Предпочтение по смете:/);
  assert.match(html, /quoteScopeEligible\(\) \? '<div><dt>Запрос сметы/);
});

test('eligible written diagnostics disclose one consistent fourteen-day credit', () => {
  assert.match(html, /function creditEligible\(\)/);
  assert.match(html, /service\.id === 'plan' \|\| service\.id === 'review'/);
  assert.match(html, /effectiveResult\(\) === 'diagnostic'/);
  assert.match(html, /в течение 14 календарных дней/);
  assert.match(html, /зачтём один раз в ближайший согласованный этап/);
  assert.match(html, /Совместимое продолжение — ближайший этап по этому же материалу или плану, который использует выводы разбора/);
  assert.match(html, /Не действует на несвязанную услугу/);
  assert.match(html, /Точную строку зачёта закрепим в спецификации до оплаты/);
});

test('contextual proof points only to published source messages', () => {
  assert.match(html, /function contextualProof\(\)/);
  for (const id of ['33', '39', '41', '43', '47', '48']) {
    const asset = `assets/img/reviews/review-${id}.webp`;
    assert.match(html, new RegExp(asset.replaceAll('/', '\\/').replace('.', '\\.')));
    assert.match(reviews, new RegExp(asset.replaceAll('/', '\\/').replace('.', '\\.')));
    assert.ok(fs.existsSync(path.join(root, asset)), `${asset} must exist`);
  }
  assert.match(html, /Личный опыт клиента не обещает оценку или решение вуза/);
  assert.match(html, /target="_blank" rel="noopener"/);
});

test('new controls remain tappable, responsive and theme-aware', () => {
  assert.match(css, /\.quote-scope__option\{[\s\S]*?min-height:44px/);
  assert.match(css, /@media\(max-width:920px\)[\s\S]*?\.quote-scope__options/);
  assert.match(css, /:root\[data-theme="dark"\][\s\S]*?\.quote-scope/);
  assert.match(html, /conversion=20260822conversion1/);
});

test('cart refresh cannot recursively rerender the visible wizard', () => {
  assert.match(html, /var cartRenderSync = false;/);
  assert.match(html, /host\.querySelector\('\[data-compose-bar\]'\) && !cartRenderSync/);
  assert.match(html, /cartRenderSync = true;[\s\S]*?window\.SalonCart\.refresh\(\);[\s\S]*?cartRenderSync = false;/);
  assert.match(html, /document\.addEventListener\('salon:cart',function \(\) \{\s*if \(cartRenderSync\) return;/);
});
