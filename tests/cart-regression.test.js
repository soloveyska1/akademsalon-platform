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
      },
      {
        id: 'psychologyvip', code: 'pv', label: 'ВКР по психологии · полный проект',
        from: 91000, fixed: true, ask: []
      }
    ],
    SalonCalc: {
      quote(type, disc, term, tier) {
        if (type === 'practice') {
          return {
            base: { low: 2500, high: 3500 },
            turn: { low: 8000, high: 11000 },
            vip: { low: 14000, high: 19500 },
          }[tier];
        }
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

test('three practice scopes keep their exact result contract while generic vip remains A2', () => {
  const h = makeHarness();
  const exacts = [
    Object.assign(work('practice-diagnostic', 'Отчёт по практике', 'practice'), {
      tier: 'base', academicSubmode: 'A1', resultCode: 'diagnostic',
      scopeCode: 'practice_draft_diagnostic',
    }),
    Object.assign(work('practice-editing', 'Отчёт по практике', 'practice'), {
      tier: 'turn', academicSubmode: 'A1', resultCode: 'editing',
      scopeCode: 'practice_draft_editing',
    }),
    Object.assign(work('practice-support', 'Отчёт по практике', 'practice'), {
      tier: 'vip', academicSubmode: 'A1', resultCode: 'support',
      scopeCode: 'practice_draft_support',
    }),
  ];
  const generic = Object.assign(work('practice-a2', 'Отчёт по практике', 'practice'), {
    tier: 'vip'
  });

  h.api.reset(blank(exacts), { S: h.S });
  let payload = h.api.payload();
  assert.deepEqual(
    { low: payload.quote_preview.low, high: payload.quote_preview.high },
    { low: 24500, high: 34000 }
  );
  const [diagnostic, editing, support] = payload.items;

  assert.equal(h.api.contourLabel(exacts[0]), 'Письменный разбор комплекта по практике');
  assert.equal(diagnostic.result_code, 'diagnostic');
  assert.equal(diagnostic.scope_code, 'practice_draft_diagnostic');
  assert.equal(diagnostic.academic_submode, 'A1');
  assert.equal(diagnostic.legal_service_type, 'consultation');
  assert.match(diagnostic.deliverable, /Карта несоответствий/);
  assert.match(diagnostic.deliverable, /редактор не вносит правки/i);
  assert.doesNotMatch(diagnostic.inclusions.join(' '), /правк\w* в документ|исправленн\w* Word/i);
  assert.match(diagnostic.exclusions.join(' '), /правки в Word, дневник или приложения/i);

  assert.equal(h.api.contourLabel(exacts[1]), 'Редактура готового комплекта по практике');
  assert.equal(editing.result_code, 'editing');
  assert.equal(editing.scope_code, 'practice_draft_editing');
  assert.equal(editing.academic_submode, 'A1');
  assert.equal(editing.legal_service_type, 'editing');
  assert.match(editing.deliverable, /Word с видимыми правками/);
  assert.match(editing.deliverable, /сверка с программой практики/);
  assert.match(editing.deliverable, /чек-лист подписей и приложений/);

  assert.equal(h.api.contourLabel(exacts[2]), 'Сопровождение комплекта по практике');
  assert.equal(support.result_code, 'support');
  assert.equal(support.scope_code, 'practice_draft_support');
  assert.equal(support.academic_submode, 'A1');
  assert.equal(support.legal_service_type, 'editing');
  assert.match(support.permitted_purpose, /предоставленного Заказчиком черновика и связанных документов по практике/);
  assert.doesNotMatch(support.permitted_purpose, /от темы или задания/);
  assert.match(support.deliverable, /Карта требований и план согласованных этапов/);
  assert.match(support.deliverable, /версии отчёта и дневника/);
  assert.match(support.deliverable, /итоговый чек-лист/);

  payload.items.forEach((item) => {
    assert.equal(item.deliverables_pending, false);
    assert.equal(item.scope.included_pending, false);
    assert.equal(item.scope.excluded_pending, false);
    assert.ok(item.inclusions.length >= 3);
    assert.ok(item.exclusions.length >= 3);
  });

  h.api.reset(blank([generic]), { S: h.S });
  payload = h.api.payload();
  assert.equal(h.api.contourLabel(generic), 'Совместный исследовательский проект с нуля');
  assert.equal(payload.items[0].academic_submode, 'A2');
  assert.match(payload.items[0].permitted_purpose, /от темы или задания до рабочего черновика/);
  assert.equal(payload.items[0].scope_code, '');
  assert.equal(payload.items[0].deliverables_pending, true);
});

test('psychology VIP materializes one exact 91k A2 package with scope and three payment stages', () => {
  const h = makeHarness();
  const current = {
    kind: 'service', type: 'custom', serviceId: 'psychologyvip', serviceCode: 'pv',
    label: 'ВКР по психологии · полный проект', serviceMeta: 'услуга мастерской',
    low: 91000, high: 91000, fixed: true, allowQty: false,
    answers: { scope: 'Нужно перестроить главы', data: 'Обезличенная таблица' },
    answerLines: ['Исходная задача: Нужно перестроить главы', 'Данные: Обезличенная таблица'],
    needs: 0, topic: 'Клиническая психология', deadline: '20 сентября',
    requirements: 'Есть две курсовые и замечания руководителя', note: '', sourceId: 'psychology-vip',
    contractContour: 'A', academicSubmode: 'A2', authorParticipation: true,
  };
  h.api.reset(blank(), {
    S: h.S,
    api: { getCurrent: () => ({ ...current }), validateCurrent: () => true }
  });

  assert.equal(h.api.materializeCurrent({ silent: true }), true);
  const payload = h.api.payload();
  const item = payload.items[0];

  assert.deepEqual(
    { low: payload.quote_preview.low, high: payload.quote_preview.high },
    { low: 91000, high: 91000 }
  );
  assert.equal(item.scope_code, 'psychology_full_vip');
  assert.equal(item.result_code, 'support');
  assert.equal(item.academic_submode, 'A2');
  assert.equal(item.author_participation.confirmed, true);
  assert.equal(item.fixed_package_selected, true);
  assert.equal(item.price_status, 'customer_selected_fixed_package');
  assert.equal(item.iterations, 3);
  assert.equal(item.payment_stage_allocations.length, 3);
  assert.deepEqual(Array.from(item.payment_stage_allocations, (stage) => stage.percentage), [30, 40, 30]);
  assert.deepEqual(Array.from(item.payment_stage_allocations, (stage) => stage.amount_preview), [27300, 36400, 27300]);
  assert.deepEqual(Array.from(payload.payment_plan_request.percentages), [30, 40, 30]);
  assert.deepEqual(Array.from(payload.payment_plan_request.amounts_preview), [27300, 36400, 27300]);
  assert.match(item.deliverable, /нормоконтроль/);
  assert.match(item.deliverable, /презентация/);
  assert.match(item.inclusions.join(' '), /до трёх консолидированных циклов/);
  assert.match(item.exclusions.join(' '), /новые данные, методики или дополнительная выборка/);
  assert.equal(item.scope.included_pending, false);
  assert.equal(item.scope.excluded_pending, false);
  assert.equal(item.deliverables_pending, false);
  assert.equal(item.acceptance_criteria_pending, false);
});

test('psychology VIP keeps the existing best-of discount and 25 percent combined-benefit floor', () => {
  const h = makeHarness();
  const vip = {
    id: 'pv1', kind: 'service', type: 'custom', serviceId: 'psychologyvip',
    serviceCode: 'pv', label: 'ВКР по психологии · полный проект',
    low: 91000, high: 91000, fixed: true, qty: 1,
    academicSubmode: 'A2', authorParticipation: true, answers: {},
  };
  const state = blank([vip]);
  state.checkout = { useBonus: true, bonusAmount: 17750 };
  h.api.reset(state, {
    S: h.S,
    member: {
      sub: { label: 'Салон+', discount_pct: 10, discount_cap: 7000 },
      bonus: { balance: 30000 }
    },
    api: {
      getDeals: () => ({
        promoCode: 'ПЕРВЫЙЛИСТ', promoDeal: { pct: 20, cap: 5000, min_price: 5000 }
      })
    }
  });

  const totals = h.api.benefitsFor();
  assert.equal(totals.discount, 7000, 'best-of выбирает подписку, не складывает её с промокодом');
  assert.equal(totals.bonus, 15750, 'общая выгода ограничена 25%');
  assert.equal(totals.due, 68250);
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

test('ПЕРВЫЙЛИСТ выигрывает best-of, а бонусы не пробивают общий потолок 25%', () => {
  const h = makeHarness();
  const state = blank([work('w1', 'Диплом')]);
  state.checkout = { useBonus: true, bonusAmount: 9000 };
  h.api.reset(state, {
    S: h.S,
    member: {
      sub: { label: 'Салон+ Про', discount_pct: 10, discount_cap: 3000 },
      bonus: { balance: 9000 },
    },
    api: {
      getDeals: () => ({
        promoCode: 'ПЕРВЫЙЛИСТ',
        promoDeal: { pct: 12, cap: 5000, min_price: 2500 },
      }),
    },
  });

  const totals = h.api.benefitsFor();
  assert.equal(totals.quote.low, 30000);
  assert.equal(totals.promo, 3600);
  assert.equal(totals.subSave, 3000);
  assert.equal(totals.discount, 3600, 'promo и подписка не складываются');
  assert.equal(totals.bonus, 3900, 'бонус уменьшается до остатка общего потолка');
  assert.equal(totals.discount + totals.bonus, 7500);
  assert.equal(totals.due, 22500);
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
