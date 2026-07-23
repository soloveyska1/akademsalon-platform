const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const cartSource = fs.readFileSync(path.join(root, 'assets/js/cart.js'), 'utf8');
const configuratorSource = fs.readFileSync(path.join(root, 'configurator.html'), 'utf8');

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

function blank(items = []) {
  return {
    version: 1,
    items,
    checkout: { useBonus: false, bonusAmount: 0 },
    updatedAt: 0
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
