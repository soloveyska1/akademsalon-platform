const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const cartSource = fs.readFileSync(path.join(root, 'assets/js/cart.js'), 'utf8');
const configuratorSource = fs.readFileSync(path.join(root, 'configurator.html'), 'utf8');

// Версию и срок годности берём из самого cart.js, чтобы тест не разъезжался с кодом.
const CART_VERSION = Number(cartSource.match(/var VERSION = (\d+);/)[1]);
const CART_MAX_AGE_MS = Function(`return ${cartSource.match(/var MAX_AGE_MS = ([^;]+);/)[1]}`)();

function makeHarness() {
  const saved = new Map();
  const store = {
    get(key, fallback) {
      return saved.has(key) ? JSON.parse(JSON.stringify(saved.get(key))) : fallback;
    },
    set(key, value) {
      saved.set(key, JSON.parse(JSON.stringify(value)));
    },
    del(key) {
      saved.delete(key);
    }
  };
  const toasts = [];
  const window = {
    __SALON_CART_TEST__: true,
    SalonServices: [
      {
        id: 'plan', code: 'pl', label: 'Разбор задачи и плана',
        from: 3000, fixed: true,
        priceFor(answers) {
          return answers.work === 'master' || answers.work === 'candidate' ? 5000 : 3000;
        },
        ask: [
          { id: 'work', label: 'Для какой работы?', short: 'Работа', type: 'chips', req: true,
            opts: [{ value: 'course', label: 'Курсовая' }, { value: 'master', label: 'Магистерская' }] },
          { id: 'req', label: 'Требования кафедры', short: 'Требования', type: 'textarea' }
        ]
      },
      {
        id: 'defense', code: 'df', label: 'Презентация и речь к защите',
        from: 6000, ask: [
          { id: 'when', label: 'Когда защита?', short: 'Защита', req: true, ph: '20 июля' }
        ]
      },
      {
        id: 'norm', code: 'nm', label: 'Нормоконтроль',
        from: 5000, ask: []
      }
    ],
    SalonCalc: {
      quote(type) {
        return type === 'diploma'
          ? { low: 30000, high: 40000 }
          : { low: 10000, high: 12000 };
      }
    }
  };
  const context = {
    window,
    crypto: webcrypto,
    setTimeout(fn) { fn(); return 1; },
    clearTimeout() {},
    console
  };
  vm.runInNewContext(cartSource, context, { filename: 'assets/js/cart.js' });
  const S = {
    store,
    toast(message) { toasts.push(message); }
  };
  return { api: window.__SalonCartTest, store, saved, S, toasts, window };
}

function blank(items = [], updatedAt = Date.now()) {
  return {
    version: CART_VERSION,
    items,
    checkout: { useBonus: false, bonusAmount: 0 },
    updatedAt
  };
}

function work(id, label, type = 'diploma') {
  return {
    id, kind: 'work', type, label,
    disc: 'hum', term: 'free', tier: 'base',
    topic: '', deadline: '', requirements: '', qty: 1
  };
}

function defense(id, parentId, when) {
  return {
    id, kind: 'service', type: 'svc_defense', serviceId: 'defense',
    serviceCode: 'df', label: 'Презентация и речь к защите',
    serviceMeta: 'дополнение к работе', low: 6000, high: 6000,
    fixed: false, allowQty: false, qty: 1, isAddon: true, parentId,
    answers: when ? { when } : {}, answerLines: when ? [`Защита: ${when}`] : [],
    topic: '', deadline: '', requirements: '', note: ''
  };
}

test('addCurrent обязательно вызывает validateCurrent и не сохраняет невалидную позицию', () => {
  const h = makeHarness();
  let getCurrentCalls = 0;
  h.api.reset(blank(), {
    S: h.S,
    api: {
      validateCurrent: () => false,
      getCurrent() {
        getCurrentCalls += 1;
        return work('w1', 'Диплом');
      }
    }
  });

  assert.equal(h.api.addCurrent(), false);
  assert.equal(getCurrentCalls, 1);
  assert.equal(h.api.state().items.length, 0);
});

test('одна текущая позиция сразу даёт ориентир в смете без скрытого сохранения', () => {
  const h = makeHarness();
  h.api.reset(blank(), {
    S: h.S,
    api: {
      getCurrent() {
        return work('draft', 'Диплом');
      }
    }
  });

  const preview = h.api.currentPreview();
  assert.equal(preview.item.label, 'Диплом');
  assert.deepEqual(
    { low: preview.quote.low, high: preview.quote.high },
    { low: 30000, high: 40000 },
  );
  assert.equal(h.api.state().items.length, 0, 'предпросмотр не должен тайно добавлять позицию');

  const totals = h.api.benefitsFor(preview.quote);
  assert.equal(totals.quote.low, 30000);
  assert.equal(totals.quote.high, 40000);
  assert.equal(totals.due, 30000);
});

test('materializeCurrent сохраняет единственную позицию и bonus intent в одном payload', () => {
  const h = makeHarness();
  const state = blank();
  const current = Object.assign(work('draft', 'Диплом'), { sourceId: 'draft-1' });
  h.api.reset(state, {
    S: h.S,
    member: { bonus: { balance: 9000 } },
    api: { getCurrent: () => ({ ...current }), validateCurrent: () => true }
  });

  assert.equal(h.api.checkoutBenefits().bonusCap, 6000, 'лимит должен считаться от current preview');
  h.api.setBonusChoice('1000', true);
  assert.equal(h.api.state().checkout.useBonus, true);
  assert.equal(h.api.state().checkout.bonusAmount, 1000);
  assert.equal(h.api.materializeCurrent({ silent: true }), true);
  const payload = h.api.payload();
  assert.equal(payload.items.length, 1);
  assert.deepEqual(
    { use_bonus: payload.benefits_intent.use_bonus, bonus_amount: payload.benefits_intent.bonus_amount },
    { use_bonus: true, bonus_amount: 1000 }
  );
});

test('редактирование current с тем же sourceId обновляет строку без дубля', () => {
  const h = makeHarness();
  let current = Object.assign(work('draft', 'Диплом'), {
    sourceId: 'draft-1', deadline: '1–2 недели', requirements: 'Первый комментарий'
  });
  h.api.reset(blank(), {
    S: h.S,
    api: { getCurrent: () => ({ ...current }), validateCurrent: () => true }
  });

  assert.equal(h.api.materializeCurrent({ silent: true }), true);
  const stableId = h.api.state().items[0].id;
  current = { ...current, deadline: '3–5 дней', requirements: 'Исправленный комментарий' };
  assert.equal(h.api.syncCurrent({ quiet: true }), true);
  assert.equal(h.api.materializeCurrent({ silent: true }), true);

  const rows = h.api.state().items;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, stableId);
  assert.equal(rows[0].deadline, '3–5 дней');
  assert.equal(rows[0].requirements, 'Исправленный комментарий');
});

test('валидация перед отправкой блокирует старую незаполненную допуслугу', () => {
  const h = makeHarness();
  h.api.reset(blank([
    work('w1', 'Диплом'),
    defense('s1', 'w1', '')
  ]), { S: h.S });

  assert.equal(h.api.validate(), false);
  assert.match(h.toasts.join(' '), /Дополните обязательные сведения/);

  h.api.reset(blank([
    work('w1', 'Диплом'),
    defense('s1', 'w1', '20 июля')
  ]), { S: h.S });
  assert.equal(h.api.validate(), true);
});

test('одна и та же услуга различается по parentId и сохраняет обе связи в payload', () => {
  const h = makeHarness();
  const first = defense('s1', 'w1', '20 июля');
  const second = defense('s2', 'w2', '25 июля');
  h.api.reset(blank([
    work('w1', 'Диплом'),
    work('w2', 'Курсовая', 'course'),
    first,
    second
  ]), { S: h.S });

  assert.equal(h.api.equivalent(first, second), false);
  const payload = h.api.payload();
  const services = payload.items.filter((item) => item.kind === 'service');
  assert.deepEqual(
    Array.from(services, (item) => item.parent_client_id),
    ['w1', 'w2']
  );
  assert.deepEqual(
    Array.from(services, (item) => item.answers.when),
    ['20 июля', '25 июля']
  );
});

test('при нескольких работах выбор parent создаёт отдельную услугу для каждой работы', () => {
  const h = makeHarness();
  h.api.reset(blank([
    work('w1', 'Диплом'),
    work('w2', 'Курсовая', 'course')
  ]), { S: h.S });

  h.api.beginAddon('norm');
  assert.equal(h.api.pending().parentId, 'w1');
  h.api.setPendingParent('w2');
  assert.equal(h.api.savePendingAddon(), true);

  h.api.beginAddon('norm');
  assert.equal(h.api.pending().parentId, 'w1');
  assert.equal(h.api.savePendingAddon(), true);

  const services = h.api.state().items.filter((item) => item.kind === 'service');
  assert.deepEqual(
    Array.from(services, (item) => item.parentId).sort(),
    ['w1', 'w2']
  );
});

test('самостоятельная услуга добавляется без фиктивной основной работы', () => {
  const h = makeHarness();
  h.api.reset(blank(), { S: h.S });

  h.api.beginStandalone('defense');
  assert.equal(h.api.pending().standalone, true);
  assert.equal(h.api.pending().parentId, '');
  h.api.setPendingAnswer('when', '20 июля');
  assert.equal(h.api.savePendingAddon(), true);

  const service = h.api.state().items[0];
  assert.equal(service.kind, 'service');
  assert.equal(service.parentId, '');
  assert.equal(service.isAddon, false);
  assert.equal(service.serviceMeta, 'самостоятельная услуга');
  assert.equal(service.answers.when, '20 июля');
  assert.equal(h.api.payload().items[0].parent_client_id, '');
});

test('plan priceFor и optional answers одинаково работают при добавлении и редактировании standalone', () => {
  const h = makeHarness();
  h.api.reset(blank(), { S: h.S });

  h.api.beginStandalone('plan');
  assert.equal(h.api.pending().standalone, true, 'анкета с optional полями не должна автодобавляться');
  h.api.setPendingAnswer('work', 'master');
  h.api.setPendingAnswer('req', 'Три главы');
  assert.equal(h.api.savePendingAddon(), true);

  let service = h.api.state().items[0];
  assert.equal(service.low, 5000);
  assert.equal(service.high, 5000);
  assert.equal(service.answers.req, 'Три главы');

  h.api.beginAddon('plan', service.id);
  assert.equal(h.api.pending().standalone, true);
  h.api.setPendingAnswer('work', 'course');
  h.api.setPendingAnswer('req', 'Две главы');
  assert.equal(h.api.savePendingAddon(), true);

  service = h.api.state().items[0];
  assert.equal(service.low, 3000);
  assert.equal(service.answers.req, 'Две главы');
  assert.equal(h.api.state().items.length, 1);
});

test('benefit badge считает только реально совместимые выгоды, explicit zero не заменяется максимумом', () => {
  const h = makeHarness();
  const state = blank([work('w1', 'Диплом')]);
  state.checkout = { useBonus: true, bonusAmount: 0 };
  h.api.reset(state, {
    S: h.S,
    member: {
      sub: { label: 'Салон+', discount_pct: 10, discount_cap: 7000 },
      bonus: { balance: 9000 }
    },
    api: {
      getDeals: () => ({
        promoCode: 'SAVE20',
        promoDeal: { pct: 20, cap: 5000, min_price: 5000 },
        giftCode: 'AS-TEST', giftBal: 2000
      })
    }
  });

  let totals = h.api.benefitsFor();
  assert.equal(totals.discount, 5000, 'promo и subscription должны конкурировать, а не складываться');
  assert.equal(totals.bonus, 0, 'явно выбранный ноль не должен превращаться в максимум');
  assert.equal(h.api.appliedBenefitCount(totals), 2, 'одна скидка + сертификат');

  state.checkout.bonusAmount = 1000;
  h.api.reset(state, {
    S: h.S,
    member: {
      sub: { label: 'Салон+', discount_pct: 10, discount_cap: 7000 },
      bonus: { balance: 9000 }
    },
    api: {
      getDeals: () => ({
        promoCode: 'SAVE20',
        promoDeal: { pct: 20, cap: 5000, min_price: 5000 },
        giftCode: 'AS-TEST', giftBal: 2000
      })
    }
  });
  totals = h.api.benefitsFor();
  assert.equal(h.api.appliedBenefitCount(totals), 3, 'скидка + бонус + сертификат');
});

test('storage round-trip сохраняет состав, ответы и parentId без сетевых вызовов', () => {
  const h = makeHarness();
  const original = blank([
    work('w1', 'Диплом'),
    defense('s1', 'w1', '20 июля')
  ]);
  h.api.reset(original, { S: h.S });
  h.api.write();

  h.api.reset(blank(), { S: h.S });
  h.api.read();
  const restored = h.api.state();

  assert.equal(restored.items.length, 2);
  assert.equal(restored.items[1].parentId, 'w1');
  assert.equal(restored.items[1].answers.when, '20 июля');
  assert.equal(restored.items[1].needs, 0);
});

test('комплексный submit строится только из SalonCart, без текущего незаписанного черновика', () => {
  assert.match(
    configuratorSource,
    /if \(!cartHasItems && svc && svc\.ask && svc\.ask\.length\)/
  );
  assert.match(
    configuratorSource,
    /payload\.details = window\.SalonCart\.summary\(\);/
  );
  assert.doesNotMatch(
    configuratorSource,
    /payload\.details = window\.SalonCart\.summary\(\) \+\s*\(payload\.details/
  );
  assert.match(
    configuratorSource,
    /: \(cartFirst\.topic \|\| cartFirst\.label\);/
  );
  assert.match(
    configuratorSource,
    /payload\.deadline = cartItems\.length === 1 \? \(cartFirst\.deadline \|\| ''\) : '';/
  );
});

/* Регрессия 25.07.2026 — «невидимая корзина подменяла заявку».
   Редизайн убрал из конфигуратора все точки входа в корзину, а submit()
   в configurator.html перезаписывает корзиной type/topic/term/details уже
   заполненной заявки. Клиент не мог ни открыть, ни очистить такой черновик.
   Обе проверки ниже стерегут, что незримый черновик не доживёт до отправки. */

test('корзина, собранная до редизайна (прошлая версия), при чтении отбрасывается', () => {
  const h = makeHarness();
  const stale = blank([work('w1', 'Диплом')]);
  stale.version = CART_VERSION - 1;
  h.store.set('salon_cart_v1', stale);

  h.api.reset(blank(), { S: h.S });
  h.api.read();

  assert.equal(h.api.state().items.length, 0, 'старая корзина не должна восстанавливаться');
});

test('просроченный черновик корзины отбрасывается и стирается из хранилища', () => {
  const h = makeHarness();
  const old = Date.now() - CART_MAX_AGE_MS - 60_000;
  h.store.set('salon_cart_v1', blank([work('w1', 'Диплом')], old));

  h.api.reset(blank(), { S: h.S });
  h.api.read();

  assert.equal(h.api.state().items.length, 0, 'просроченная корзина не должна восстанавливаться');
  assert.equal(h.store.get('salon_cart_v1', null), null, 'просроченная корзина должна быть стёрта');
});

test('свежая корзина текущей версии по-прежнему восстанавливается', () => {
  const h = makeHarness();
  h.store.set('salon_cart_v1', blank([work('w1', 'Диплом')], Date.now()));

  h.api.reset(blank(), { S: h.S });
  h.api.read();

  assert.equal(h.api.state().items.length, 1);
});

test('смета не прячет тему и сворачивает необязательные способы выгоды', () => {
  assert.match(
    cartSource,
    /class="theme-toggle cart-theme" aria-label="Сменить тему оформления"/
  );
  assert.match(
    cartSource,
    /<details class="cart-tools"' \+ \(shouldOpen \? ' open' : ''\)/
  );
  assert.match(cartSource, /class="cart-tools-toggle"/);
  assert.match(cartSource, /class="cart-tools-body"/);
  assert.doesNotMatch(cartSource, /<section class="cart-tools"/);
  /* Проверка на раскрытие <details> при переходе снята вместе с мини-визардом
     «01 Состав · 02 Выгода · 03 Отправка»: он был визардом внутри визарда,
     «Отправка» дублировала кнопку подвала, а переходы прокручивали панель,
     которая помещается почти целиком. Убран по решению владельца.
     Свёртка выгоды при этом осталась и проверяется выше. */
  assert.doesNotMatch(cartSource, /data-cart-jump/);
});
