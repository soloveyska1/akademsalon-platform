const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const cabinet = fs.readFileSync(path.join(root, 'assets/js/cabinet.js'), 'utf8');
const accountCss = fs.readFileSync(path.join(root, 'assets/css/polish15-account.css'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');

function cabinetOrder(id, overrides) {
  return Object.assign({
    id,
    no: `АС-${id}`,
    status: 'work',
    step: 1,
    days: null,
    unread: 0,
    files_new: 0,
    paused: false,
    price: 1000,
    stages_total: 1,
  }, overrides || {});
}

function renderNowCard(orders) {
  const nowStart = cabinet.indexOf('function nowCard()');
  const nowEnd = cabinet.indexOf('function clubBlock()', nowStart);
  assert.notEqual(nowStart, -1, 'nowCard() must remain independently testable');
  assert.notEqual(nowEnd, -1, 'clubBlock() must follow nowCard()');

  const contractStart = cabinet.indexOf('/* now-action-contract:start */');
  const contractEnd = cabinet.indexOf('/* now-action-contract:end */');
  const contract = contractStart >= 0 && contractEnd > contractStart
    ? cabinet.slice(contractStart, contractEnd + '/* now-action-contract:end */'.length)
    : '';
  const context = {
    activeOrders: () => orders,
    daysLeft: (order) => order.days,
    st: { detail: null },
    esc: (value) => String(value),
    money: (value) => String(value),
    shortWork: () => 'Работа',
    accountIcon: (name) => `<svg data-icon="${name}"></svg>`,
  };
  vm.runInNewContext(`${contract}\n${cabinet.slice(nowStart, nowEnd)}\nthis.output = nowCard();`, context);
  return context.output;
}

test('overview has one priority area paired with a short agenda', () => {
  assert.match(cabinet, /class="account-home-focus' \+ \(agenda \? '' : ' is-single'\)/);
  assert.match(cabinet, /class="account-home-focus__primary"/);
  assert.match(cabinet, /class="account-home-focus__agenda" aria-label="Ближайшие даты"/);
  assert.match(cabinet, /rows\.slice\(0, 4\)/);
  assert.match(accountCss, /\.account-home-focus\s*\{[\s\S]*?align-items:\s*stretch/);
  assert.match(accountCss, /\.account-home-focus__agenda \.account-dates > header\s*\{[\s\S]*?display:\s*grid/);
});

test('overview has an honest calm state when no client action is pending', () => {
  assert.match(cabinet, /account-priority--calm/);
  assert.match(cabinet, /От вас ничего срочного не требуется/);
  assert.match(cabinet, /Изменение статуса, новый файл или счёт появятся здесь первыми/);
  assert.doesNotMatch(cabinet, /Мастерская продолжает работу\. Новое решение/);
  assert.match(cabinet, /data-account-priority="0"/);
  assert.match(accountCss, /\.account-priority--calm\s*\{[\s\S]*?box-shadow:\s*inset 3px 0 0 var\(--green\)/);
});

test('quiet and paused cases never invent a priority action from a deadline', () => {
  [null, -1, 0, 2, 7, 14, 100].forEach((days) => {
    assert.equal(renderNowCard([cabinetOrder(1, { days })]), '', `quiet case at ${days} days`);
    assert.equal(renderNowCard([cabinetOrder(2, {
      status: 'prepay',
      paused: true,
      unread: 2,
      files_new: 1,
      days,
    })]), '', `paused case at ${days} days`);
  });
});

test('action class is strict and deadline only breaks ties inside one class', () => {
  const actions = [
    { id: 1, status: 'prepay', priority: 5, jump: 'secPay' },
    { id: 2, status: 'priced', priority: 4, jump: 'secDecide' },
    { id: 3, status: 'check', priority: 3, jump: 'secDecide' },
    { id: 4, files_new: 1, priority: 2, jump: 'secFiles' },
    { id: 5, unread: 1, priority: 1, jump: 'secChat' },
  ];

  actions.forEach((action) => {
    const html = renderNowCard([cabinetOrder(action.id, action)]);
    assert.match(html, new RegExp(`data-account-priority="${action.priority}"`));
    assert.match(html, new RegExp(`data-now-jump="${action.jump}"`));
  });

  for (let i = 0; i < actions.length - 1; i += 1) {
    const stronger = cabinetOrder(actions[i].id, Object.assign({ days: 100 }, actions[i]));
    const urgentWeaker = cabinetOrder(actions[i + 1].id, Object.assign({ days: 0 }, actions[i + 1]));
    const html = renderNowCard([stronger, urgentWeaker]);
    assert.match(html, new RegExp(`data-now-open="${stronger.id}"`),
      `priority ${actions[i].priority} must beat urgent priority ${actions[i + 1].priority}`);
  }

  const sameClass = renderNowCard([
    cabinetOrder(11, { unread: 1, days: 8 }),
    cabinetOrder(12, { unread: 1, days: 2 }),
  ]);
  assert.match(sameClass, /data-now-open="12"/);

  const overdueSameClass = renderNowCard([
    cabinetOrder(13, { unread: 1, days: 2 }),
    cabinetOrder(14, { unread: 1, days: -1 }),
  ]);
  assert.match(overdueSameClass, /data-now-open="14"/);

  const stableTie = renderNowCard([
    cabinetOrder(21, { files_new: 1, days: 2 }),
    cabinetOrder(22, { files_new: 1, days: 2 }),
  ]);
  assert.match(stableTie, /data-now-open="21"/);
});

test('zero-like and negative counters are not new files or messages', () => {
  assert.equal(renderNowCard([cabinetOrder(31, { files_new: '0', unread: '0', days: 1 })]), '');
  assert.equal(renderNowCard([cabinetOrder(32, { files_new: -1, unread: -1, days: 1 })]), '');
});

test('overview ends with exactly three useful destinations instead of a card stack', () => {
  const start = cabinet.indexOf('function homeTab()');
  const end = cabinet.indexOf('function loginNudge', start);
  const source = cabinet.slice(start, end);
  assert.match(source, /class="account-home-tools reveal"/);
  assert.match(source, /data-tab="messages"/);
  assert.match(source, /data-tab="documents"/);
  assert.match(source, /data-tab="wallet"/);
  assert.doesNotMatch(source, /account-command-grid/);
  assert.doesNotMatch(source, /data-contact="1"/);
  assert.match(source, /accountIcon\('messages'\)/);
  assert.match(source, /accountIcon\('documents'\)/);
  assert.match(source, /accountIcon\('wallet'\)/);
  assert.doesNotMatch(source, /<span aria-hidden="true">(?:¶|PDF|₽)<\/span><div>/);
  assert.match(accountCss, /\.account-home-tools\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3/);
  assert.match(accountCss, /\.account-home-tools > button > span svg\s*\{[\s\S]*?stroke:\s*currentColor/);
});

test('dark luminous materials keep saved drafts on the same surface as live cases', () => {
  assert.match(accountCss, /\.account-drafts--home \.order-card\[href\]\s*\{[\s\S]*?background:\s*var\(--hall90-surface\)/);
  assert.match(accountCss, /\.case-fold__body :is\(\.case-sec, \.case-fold\)\s*\{[\s\S]*?background:\s*transparent/);
});

test('overview collapses cleanly without a narrow desktop side column', () => {
  assert.match(accountCss, /@media \(max-width: 1100px\)[\s\S]*?\.account-home-focus,[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(accountCss, /@media \(max-width: 700px\)[\s\S]*?\.account-home-tools\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test('overview assets are cache-busted', () => {
  assert.match(dashboard, /ui=comfort97/);
  assert.match(dashboard, /ui=telegram-primary-hall97/);
  assert.match(dashboard, /priority=truth1/);
});
