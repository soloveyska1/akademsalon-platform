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
  if (claimedState === 'absent') {
    delete value.claimed;
    delete value.payments;
  }
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

  assert.equal(combinations, 2304);
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
  const manage = between('function manageBlock(o)', '/* -------- после завершения');
  assert.doesNotMatch(manage, /data-act="unpause"/);
});

test('payment workspace follows checking, due, paused and unknown phases literally', () => {
  const api = contractApi({
    st: { me: { deposit: { balance: 0 } } },
    esc: String,
    money: String,
    payHistory: () => '',
    paySlip: () => '<div>requisites</div>',
    payWorkspace: (main, history, state) => `<div data-pay-state="${state}">${main}${history}</div>`,
  });
  vm.runInNewContext(between('function payBlock(o)', "/* part='decide'"), api);

  const due = api.payBlock(order({ due_now: { amount: 500 }, pay_online: true }));
  assert.match(due, /data-pay-state="due"/);
  assert.match(due, /data-act-pay/);

  const checking = api.payBlock(order({ due_now: { amount: 500 }, claimed: true, pay_online: true }));
  assert.match(checking, /data-pay-state="checking"/);
  assert.doesNotMatch(checking, /data-act-pay(?:-|>)/);

  assert.equal(api.payBlock(order({ due_now: { amount: 500 }, paused: true, pay_online: true })), '');
  assert.equal(api.payBlock(withClaimedState(order({ due_now: { amount: 500 }, pay_online: true }), 'absent')), '');
});

test('payment handlers recheck the current case context before any API mutation', async () => {
  let posts = 0;
  let toasts = 0;
  const api = contractApi({
    st: { detail: null, currentId: 71, busy: false },
    toast: () => { toasts += 1; },
    orderHeaders: () => ({}),
    S: { api: { post: () => {
      posts += 1;
      return Promise.resolve({ ok: false, error: 'nothing_due' });
    } } },
  });
  vm.runInNewContext(between('function doAction(action, extra)', 'function payOnline()'), api);

  api.st.detail = order({ due_now: { amount: 500 }, claimed: false });
  assert.equal(api.paymentActionAllowed(), true);
  [
    order({ due_now: { amount: 500 }, claimed: true }),
    order({ due_now: { amount: 500 }, claimed: false, paused: true }),
    withClaimedState(order({ due_now: { amount: 500 } }), 'absent'),
    order({ status: 'done', due_now: { amount: 500 }, claimed: false }),
  ].forEach((blocked) => {
    api.st.detail = blocked;
    api.doAction('paid');
  });
  assert.equal(posts, 0);
  assert.equal(toasts, 4);

  api.st.detail = order({ due_now: { amount: 500 }, claimed: false });
  api.doAction('paid');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(posts, 1);

  assert.match(between('function doAction(action, extra)', 'function payOnline()'), /action === 'paid' && !paymentActionAllowed\(\)/);
  assert.match(between('function payOnline()', 'function tipOnline(amount)'), /!paymentActionAllowed\(\)/);
  assert.match(between('function payDeposit()', 'function sendMessage()'), /!paymentActionAllowed\(\)/);
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

test('list signature covers every context-only field and refreshes home', async () => {
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

  let renders = 0;
  const changed = order({ claimed: true });
  const live = contractApi({
    st: { orders: [base], detail: null },
    S: { api: {
      token: () => 'test',
      guestTokens: () => ({}),
      identified: () => true,
      get: () => Promise.resolve({ ok: true, orders: [changed] }),
    } },
    ordersHeaders: () => ({}),
    renderCurrent: () => { renders += 1; },
  });
  vm.runInNewContext(refresh, live);
  live.refreshListSilent();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(renders, 1);
  live.refreshListSilent();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(renders, 1);
});

test('case return restores the exact priority trigger after a live-safe rerender', () => {
  const clickSource = between("root.addEventListener('click'", '/* живой пересчёт');
  assert.match(clickSource, /var wasCaseOpen = sameDetail && st\.caseOpen/);
  assert.match(clickSource, /if \(!wasCaseOpen\) st\.caseSec = openingSec\(newId, ordHint\)/);
  assert.match(clickSource, /caseReturnFocus = \{ kind: 'now', id: nid, jump: njump \}/);
  assert.match(clickSource, /returnFocus && returnFocus\.kind === 'now'/);
  assert.match(clickSource, /el\.getAttribute\('data-now-jump'\) === returnFocus\.jump/);
});

test('one-time claim keeps the exact returned case and malformed identity fails open', async () => {
  const source = between(
    '/* claim-continuity-contract:start */',
    '/* claim-continuity-contract:end */',
  ) + '/* claim-continuity-contract:end */';
  let releaseReady;
  let posts = 0;
  const ready = new Promise((resolve) => { releaseReady = resolve; });
  const api = {
    st: {
      currentId: null,
      caseOpen: false,
      pendingCaseFocus: false,
      claimTargetId: null,
      claimGeneration: 0,
      tab: 'wallet',
    },
    S: { api: {
      ready,
      post: () => {
        posts += 1;
        return Promise.resolve({ ok: true, order_id: 202 });
      },
    } },
  };
  vm.runInNewContext(source, api);
  const select = (response) => {
    const generation = api.beginClaimExchange();
    return api.selectClaimedOrder(response, generation);
  };

  assert.equal(select({ ok: true, order_id: 202 }), 202);
  assert.equal(api.st.currentId, 202);
  assert.equal(api.st.caseOpen, true);
  assert.equal(api.st.tab, 'orders');
  assert.equal(api.st.pendingCaseFocus, true);
  assert.equal(api.st.claimGeneration, 1);
  assert.equal(api.reconcileClaimedOrder([{ id: 101 }, { id: 202 }], 101), 202);
  assert.equal(api.st.currentId, 202);

  select({ ok: true, order_id: 202 });
  assert.equal(api.st.claimGeneration, 2);
  assert.equal(api.reconcileClaimedOrder([{ id: 101 }], 101), 101);
  assert.equal(api.st.currentId, 101);
  assert.equal(api.st.caseOpen, false);
  assert.equal(api.st.pendingCaseFocus, false);

  select({ ok: true, order_id: 202 });
  assert.equal(api.st.claimGeneration, 3);
  assert.equal(api.reconcileClaimedOrder([{ id: 101 }, { id: 202, archived: true }], 101), 202);
  assert.equal(api.st.currentId, 202);

  select({ ok: true, order_id: 202 });
  assert.equal(api.reconcileClaimedOrder([], null), null);
  assert.equal(api.st.currentId, null);
  assert.equal(api.st.caseOpen, false);
  assert.equal(api.st.pendingCaseFocus, false);

  [
    null,
    {},
    { ok: false, order_id: 101 },
    { ok: true, order_id: 0 },
    { ok: true, order_id: -1 },
    { ok: true, order_id: 4.2 },
    { ok: true, order_id: '0202' },
    { ok: true, order_id: '202x' },
    { ok: true, order_id: Number.MAX_SAFE_INTEGER + 1 },
  ].forEach((response) => {
    api.st.currentId = 101;
    api.st.caseOpen = false;
    api.st.pendingCaseFocus = false;
    api.st.claimTargetId = null;
    assert.equal(select(response), null);
    assert.equal(api.st.currentId, 101);
    assert.equal(api.st.caseOpen, false);
    assert.equal(api.st.pendingCaseFocus, false);
    assert.equal(api.st.claimTargetId, null);
  });

  assert.equal(select({ ok: true, order_id: '202' }), 202);
  assert.equal(api.st.currentId, 202);
  assert.equal(api.st.caseOpen, true);

  const staleGeneration = api.st.claimGeneration;
  const stalePendingClaim = api.st.claimTargetId;
  const olderExchange = api.beginClaimExchange();
  const newerExchange = api.beginClaimExchange();
  assert.equal(api.selectClaimedOrder({ ok: true, order_id: 303 }, newerExchange), 303);
  assert.equal(api.selectClaimedOrder({ ok: true, order_id: 202 }, olderExchange), null);
  assert.equal(api.st.currentId, 303, 'last user intent wins even when its response arrives first');
  assert.equal(api.acceptsListResolution(staleGeneration, stalePendingClaim, 202), false);
  assert.equal(api.acceptsListResolution(api.st.claimGeneration, api.st.claimTargetId, null), false);
  assert.equal(api.acceptsListResolution(api.st.claimGeneration, api.st.claimTargetId, 303), true);

  let startupTicket = null;
  const exchange = api.afterApiReady(function () {
    startupTicket = api.beginClaimExchange();
    return api.S.api.post('/orders/access/exchange', {}, { 'X-Claim-Exchange': 'cx1_test' });
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(posts, 0, 'startup exchange must wait for auth discovery');
  api.st.claimGeneration += 1; // auth-lost while discovery is still settling
  releaseReady();
  const startupResponse = await exchange;
  assert.equal(startupResponse.order_id, 202);
  assert.equal(posts, 1);
  assert.equal(startupTicket, api.st.claimGeneration, 'ticket is reserved next to the POST');
  assert.equal(api.selectClaimedOrder(startupResponse, startupTicket), 202);

  const manualClaim = between('function claimByCode(raw)', 'function tplEmpty()');
  assert.match(manualClaim, /var claimGeneration = beginClaimExchange\(\)/);
  assert.match(manualClaim, /if \(!claimExchangeCurrent\(claimGeneration\)\) return/);
  assert.match(manualClaim, /var claimedId = selectClaimedOrder\(r, claimGeneration\)/);
  assert.match(manualClaim, /loadList\(!!claimedId, claimedId\)/);

  const startupClaim = between('/* Ссылка доступа с другого устройства:', '/* возврат из ВК/Mail.ru:');
  assert.match(startupClaim, /startupAccess = afterApiReady\(function \(\) \{/);
  assert.match(startupClaim, /'X-Claim-Exchange': claimTok/);
  assert.match(startupClaim, /var startupClaimGeneration = null/);
  assert.match(startupClaim, /afterApiReady\(function \(\) \{[\s\S]*?startupClaimGeneration = beginClaimExchange\(\);[\s\S]*?S\.api\.post/);
  assert.match(startupClaim, /if \(!claimExchangeCurrent\(startupClaimGeneration\)\) return r/);
  assert.match(startupClaim, /startupClaimId = selectClaimedOrder\(r, startupClaimGeneration\)/);
  const startupLoad = between("var impKey = null;", '/* гостям с заказом');
  assert.match(startupLoad, /loadList\(!!startupClaimId, startupClaimId\)/);
  const listLoad = between('function loadList(keepCurrent, claimLoadId)', '/* снапшот для «живых уведомлений»');
  assert.match(listLoad, /acceptsListResolution\(listClaimGeneration, pendingClaimAtStart, claimLoadId\)/);
  assert.match(listLoad, /reconcileClaimedOrder\(st\.orders, defaultId\)/);
  assert.match(listLoad, /st\.orders\.some\(function \(o\) \{ return o\.id === st\.currentId; \}\)/);
  const authLost = between("document.addEventListener('salon:auth-lost'", '/* ---------------- старт');
  assert.match(authLost, /st\.claimTargetId = null/);
  assert.match(authLost, /st\.claimGeneration \+= 1/);
  assert.match(dashboard, /cabinet\.js\?[^"']*claim=exact1/);
});

test('dark priority CTA reaches WCAG AA and changed assets are cache-busted', () => {
  const darkBlocks = [...accountCss.matchAll(/:root\[data-theme="dark"\] \.is-account-route\s*\{([\s\S]*?)\}/g)];
  assert.ok(darkBlocks.length > 0);
  const backgrounds = darkBlocks.flatMap((match) => [...match[1].matchAll(/--wax-cta:\s*(#[0-9a-f]{6})/gi)]
    .map((color) => color[1]));
  const foregrounds = [...accountCss.matchAll(/--text-on-wax:\s*(#[0-9a-f]{6})/gi)]
    .map((color) => color[1]);
  assert.ok(backgrounds.length > 0);
  assert.ok(foregrounds.length > 0);
  backgrounds.forEach((background) => foregrounds.forEach((foreground) => {
    const ratio = contrast(foreground, background);
    assert.ok(ratio >= 4.5, `${foreground} on ${background} is only ${ratio.toFixed(2)}:1`);
  }));
  assert.match(accountCss, /\.account-priority \.line-link\s*\{[\s\S]*?color:\s*var\(--text-on-wax\);[\s\S]*?background:\s*var\(--wax-cta\);/);
  assert.match(dashboard, /polish15-account\.css\?[^"']*context=truth1/);
  assert.match(dashboard, /cabinet\.js\?[^"']*context=truth1/);
});
