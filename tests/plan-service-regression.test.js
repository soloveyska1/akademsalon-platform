const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const configurator = fs.readFileSync(path.join(root, 'configurator.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
const cart = fs.readFileSync(path.join(root, 'assets/js/cart.js'), 'utf8');

test('разбор плана использует стабильные ID и цену 3 000 / 5 000 ₽', () => {
  assert.match(app, /a\.work === 'master' \|\| a\.work === 'candidate'/);
  for (const value of ['course', 'diplom', 'master', 'candidate', 'practice', 'other']) {
    assert.match(app, new RegExp(`value:'${value}'`));
  }
});

test('прямая заявка на разбор не подменяется ранее собранной корзиной', () => {
  assert.match(
    configurator,
    /var cartHasItems = !!\(!isPlanService && window\.SalonCart && window\.SalonCart\.hasItems\(\)\)/
  );
  assert.match(
    configurator,
    /if \(!isPlanService && window\.SalonCart && window\.SalonCart\.hasItems\(\)\)/
  );
  assert.match(
    configurator,
    /submittedCartSnapshot = null;\s*if \(cartHasItems\)/
  );
  assert.match(
    configurator,
    /var text = \(\(!isPlanService && window\.SalonCart && window\.SalonCart\.hasItems\(\)\)/
  );
});

test('черновик услуги изолирован от черновика полной работы', () => {
  assert.match(configurator, /var SERVICE_DRAFT_KEY = 'salon_service_draft_v1'/);
  assert.match(configurator, /if \(isPlanService\) S\.store\.del\(SERVICE_DRAFT_KEY\);\s*else if \(!svc\) S\.store\.del\('salon_draft'\);/);
});

test('формуляр показывает раздел 01 и не маскирует сетевой сбой под успех', () => {
  assert.match(configurator, /<header class="plan-form-head">\s*<span class="plan-form-no">01<\/span>/);
  assert.match(configurator, /if \(isPlanService && !failed\)/);
  assert.match(configurator, /Автоматическую отправку подтвердить не удалось/);
});

test('фирменная подпись прямого действия переживает перерисовку корзины', () => {
  assert.match(configurator, /data-cart-submit-label/);
  assert.match(cart, /el\.getAttribute\('data-cart-submit-label'\) \|\| 'Отправить заявку мастеру'/);
});

test('выборы услуги и канала связи сообщают состояние вспомогательным технологиям', () => {
  assert.match(configurator, /aria-pressed="' \+ String\(on\) \+ '"/);
  assert.match(configurator, /x\.setAttribute\('aria-pressed', String\(x === b\)\)/);
});

test('Telegram принимает ник и ссылку t.me', () => {
  assert.match(app, /t\\\.me\\\/\\w\{4,\}/);
});
