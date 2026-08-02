const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const cabinet = fs.readFileSync(path.join(root, 'assets/js/cabinet.js'), 'utf8');
const accountCss = fs.readFileSync(path.join(root, 'assets/css/polish15-account.css'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');

function between(startNeedle, endNeedle, source = cabinet) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(start, -1, `${startNeedle} must remain extractable`);
  assert.notEqual(end, -1, `${endNeedle} must follow ${startNeedle}`);
  return source.slice(start, end);
}

function contractApi(extra = {}) {
  const source = between('/* now-action-contract:start */', '/* now-action-contract:end */') +
    '/* now-action-contract:end */';
  const context = Object.assign({}, extra);
  vm.runInNewContext(source, context);
  return context;
}

function order(overrides = {}) {
  return Object.assign({
    id: 71,
    no: 'АС-71',
    status: 'work',
    step: 2,
    steps: ['Заявка', 'Исполнение', 'Передача'],
    status_label: 'В работе',
    due_now: { amount: 0, label: '' },
    claimed: false,
    part_ready: 0,
    final_ready: false,
    paused: false,
    paused_by: '',
    files_new: 0,
    unread: 0,
    actions: [],
    payments: [],
    stages_total: 1,
    stage: 1,
  }, overrides);
}

function withDueState(base, dueState) {
  const value = Object.assign({}, base);
  if (dueState === 'absent') delete value.due_now;
  else value.due_now = { amount: dueState, label: dueState ? 'Текущий этап' : '' };
  return value;
}

function withClaimedState(base, claimedState) {
  const value = Object.assign({}, base);
  if (claimedState === 'absent') delete value.claimed;
  else value.claimed = claimedState;
  return value;
}

function expectedAction(o, dueState, claimedState) {
  if (o.paused || o.status === 'done' || o.status === 'cancel') return null;
  if (dueState === 500 && claimedState === false)
    return { kind: 'payment', score: 5, jump: 'secPay' };
  if (o.status === 'priced') return { kind: 'price', score: 4, jump: 'secDecide' };
  if (o.status === 'check') return { kind: 'review', score: 3, jump: 'secDecide' };
  if (o.files_new > 0) return { kind: 'files', score: 2, jump: 'secFiles' };
  if (o.unread > 0) return { kind: 'message', score: 1, jump: 'secChat' };
  return null;
}

function actionShape(action) {
  return action ? { kind: action.kind, score: action.score, jump: action.jump } : null;
}

function contrast(a, b) {
  function luminance(hex) {
    const rgb = hex.match(/[0-9a-f]{2}/gi).map((part) => parseInt(part, 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  }
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test('one pure resolver distinguishes explicit payment truth from unknown context', () => {
  const api = contractApi();
  assert.equal(typeof api.caseContextFor, 'function');

  assert.equal(api.caseContextFor(order({ claimed: true, due_now: { amount: 500 } })).payment, 'checking');
  assert.equal(api.caseContextFor(order({ claimed: false, due_now: { amount: 500 } })).payment, 'due');
  assert.equal(api.caseContextFor(order({ status: 'prepay', due_now: { amount: 0 } })).payment, 'preparing');
  assert.equal(api.caseContextFor(order({ final_ready: true, due_now: { amount: 0 } })).payment, 'transfer');
  assert.equal(api.caseContextFor(withDueState(order(), 'absent')).payment, 'unknown');
  assert.equal(api.caseContextFor(withClaimedState(order({ due_now: { amount: 500 } }), 'absent')).payment, 'unknown');
});

test('literal action matrix never invents payment or masks a proven due', () => {
  const api = contractApi();
  const statuses = ['new', 'priced', 'prepay', 'work', 'fix', 'check', 'done', 'cancel'];
  const dueStates = ['absent', 0, 500];
  const claimedStates = ['absent', false, true];
  let combinations = 0;

  statuses.forEach((status) => dueStates.forEach((dueState) =>
    claimedStates.forEach((claimedState) => [false, true].forEach((paused) =>
      [false, true].forEach((partReady) => [false, true].forEach((finalReady) =>
        [0, 1].forEach((filesNew) => [0, 1].forEach((unread) => {
          let value = order({
            status,
            paused,
            part_ready: partReady ? 1 : 0,
            final_ready: finalReady,
            files_new: filesNew,
            unread,
          });
          value = withDueState(value, dueState);
          value = withClaimedState(value, claimedState);
          assert.deepEqual(
            actionShape(api.nowActionFor(value)),
            expectedAction(value, dueState, claimedState),
            JSON.stringify({ status, dueState, claimedState, paused, partReady, finalReady, filesNew, unread }),
          );
          combinations += 1;
        }))))))));

  assert.equal(combinations, 4608);
});

test('priority card uses one summary snapshot and keeps a stable focus target', () => {
  const contract = between('/* now-action-contract:start */', '/* now-action-contract:end */') +
    '/* now-action-contract:end */';
  const nowCard = between('function nowCard()', 'function clubBlock()');
  const summary = order({ id: 83, status: 'prepay', due_now: { amount: 900, label: 'Первый этап' } });
  const context = {
    activeOrders: () => [summary],
    daysLeft: () => 3,
    st: { detail: order({ id: 83, status: 'prepay', due_now: { amount: 99999 } }) },
    esc: String,
    money: String,
    shortWork: () => 'Работа',
    accountIcon: () => '<svg></svg>',
  };
  vm.runInNewContext(`${contract}\n${nowCard}\nthis.output = nowCard();`, context);
  assert.match(context.output, /900 ₽/);
  assert.doesNotMatch(context.output, /99999/);
  assert.match(context.output, /id="accountPriorityAction-83"/);
});

test('claimed, transfer and pause bands never expose a second payment action', () => {
  const api = contractApi({ money: String, esc: String });
  vm.runInNewContext(between('function finalBand(o)', '/* -------- пауза:'), api);
  vm.runInNewContext(between('function pauseBand(o)', '/* -------- управление делом'), api);

  const checking = order({ final_ready: true, claimed: true, due_now: { amount: 500 } });
  assert.match(api.finalBand(checking), /сверк/);
  assert.doesNotMatch(api.finalBand(checking), /data-jump="secPay"/);

  const paused = order({ final_ready: true, paused: true, due_now: { amount: 500 }, actions: ['unpause'] });
  assert.equal(api.finalBand(paused), '');
  assert.equal(api.partBand(Object.assign({}, paused, { final_ready: false, part_ready: 1 })), '');
  assert.equal(api.dueBand(Object.assign({}, paused, { final_ready: false })), '');
  assert.match(api.pauseBand(paused), /Снять с паузы/);
});

test('overview and opening destination agree with the resolved action owner', () => {
  const api = contractApi({
    st: { caseSec: '' },
    esc: String,
    money: String,
    caseProgress: () => '',
    payScale: () => '',
  });
  vm.runInNewContext(between('function caseOverview(o)', '/* Поддержка в деле'), api);
  vm.runInNewContext(between('function defaultCaseSec(o)', 'function orderById'), api);

  const checkingReview = order({ status: 'check', claimed: true, due_now: { amount: 500 } });
  const reviewHtml = api.caseOverview(checkingReview);
  assert.match(reviewHtml, /Проверить результат/);
  assert.doesNotMatch(reviewHtml, /Оплатить/);
  assert.equal(api.defaultCaseSec(checkingReview), 'work');

  const waitingInvoice = order({ status: 'prepay', due_now: { amount: 0 } });
  assert.match(api.caseOverview(waitingInvoice), /готовит счёт/);
  assert.doesNotMatch(api.caseOverview(waitingInvoice), /Сейчас ваш ход/);
  assert.equal(api.defaultCaseSec(waitingInvoice), 'work');

  assert.equal(api.defaultCaseSec(order({ paused: true, actions: ['unpause'] })), 'terms');
  assert.equal(api.defaultCaseSec(order({ paused: true, paused_by: 'admin' })), 'chat');
  assert.equal(api.defaultCaseSec(order({ final_ready: true, files_new: 1 })), 'files');
});

test('shared consumers call the context resolver instead of reclassifying money', () => {
  [
    between('function needsAction(o)', '/* ---------------- Реестр дел'),
    between('function caseOverview(o)', '/* Поддержка в деле'),
    between('function payBlock(o)', "/* part='decide'"),
    between('function finalBand(o)', '/* -------- пауза:'),
    between('function defaultCaseSec(o)', 'function orderById'),
    between('function jumpChips(o)', '/* старые якоря'),
    between('function dueOf(o)', '/* -------- «Платежи»'),
  ].forEach((source) => assert.match(source, /caseContextFor\(o\)/));
});

test('list signature covers every context-only field and refreshes home', () => {
  const api = contractApi();
  const base = order();
  const signature = api.caseContextSignature(base);
  [
    order({ due_now: { amount: 500, label: 'Этап' } }),
    order({ claimed: true }),
    order({ part_ready: 1 }),
    order({ final_ready: true }),
    order({ paused: true }),
    order({ paused_by: 'admin' }),
    order({ actions: ['unpause'] }),
  ].forEach((changed) => assert.notEqual(api.caseContextSignature(changed), signature));

  const refresh = between('function refreshListSilent()', '/* мгновенные обновления');
  assert.match(refresh, /st\.orders\.map\(caseContextSignature\)/);
  assert.match(refresh, /!== before\) renderCurrent\(\)/);
  assert.doesNotMatch(refresh, /&& st\.detail/);
});

test('dark priority CTA reaches WCAG AA and changed assets are cache-busted', () => {
  const darkBlocks = [...accountCss.matchAll(/:root\[data-theme="dark"\] \.is-account-route\s*\{([\s\S]*?)\}/g)];
  assert.ok(darkBlocks.length > 0);
  const colors = darkBlocks.flatMap((match) => [...match[1].matchAll(/--wax-cta:\s*(#[0-9a-f]{6})/gi)]
    .map((color) => color[1]));
  assert.ok(colors.length > 0);
  assert.ok(contrast('#fffaf3', colors.at(-1)) >= 4.5, `dark CTA contrast is ${contrast('#fffaf3', colors.at(-1)).toFixed(2)}:1`);
  assert.match(dashboard, /priority=truth1/);
  assert.match(dashboard, /context=truth1/);
});
