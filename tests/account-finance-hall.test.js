const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const cabinet = fs.readFileSync(path.join(root, 'assets/js/cabinet.js'), 'utf8');
const demo = fs.readFileSync(path.join(root, 'assets/js/cabinet-demo.js'), 'utf8');
const accountCss = fs.readFileSync(path.join(root, 'assets/css/polish15-account.css'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');

test('financial screens use one live three-destination route', () => {
  assert.match(cabinet, /class="account-tabs account-money-route"/);
  assert.doesNotMatch(cabinet, /function financeSummary\(\)/);
  assert.doesNotMatch(cabinet, /class="account-finance-summary reveal"/);
  for (const label of ['Платежи', 'Депозит и бонусы', 'Клуб Салона']) {
    assert.ok(cabinet.includes(label), `missing money route label ${label}`);
  }
  assert.match(cabinet, /Счетов сейчас нет/);
  assert.match(cabinet, /Платёж на сверке/);
  assert.match(accountCss, /\.account-money-route\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3/);
});

test('payments pair the current bill with a compact confirmation journal', () => {
  assert.match(cabinet, /class="account-finance-layout' \+ \(docs \? '' : ' is-single'\)/);
  assert.match(cabinet, /class="account-finance-main"/);
  assert.match(cabinet, /class="account-finance-side" aria-label="Подтверждения оплаты"/);
  assert.match(cabinet, /account-finance-primary/);
  assert.match(cabinet, /account-payment-documents/);
  assert.match(accountCss, /\.account-finance-layout,[\s\S]*?grid-template-columns:\s*minmax\(0, 1\.45fr\) minmax\(300px, \.55fr\)/);
});

test('deposit keeps the calculator primary and bonuses in a compact side account', () => {
  assert.match(cabinet, /class="account-balance-layout"/);
  assert.match(cabinet, /class="account-balance-main"/);
  assert.match(cabinet, /class="account-balance-aside" aria-label="Бонусный счёт"/);
  assert.match(cabinet, /account-bonus-card/);
  assert.match(accountCss, /\.account-balance-aside \.account-panel__acts\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test('financial hall keeps one compact route and one content column on phones', () => {
  assert.match(accountCss, /@media \(max-width: 760px\)[\s\S]*?\.account-money-route button\s*\{[\s\S]*?min-height:\s*70px/);
  assert.match(accountCss, /@media \(max-width: 760px\)[\s\S]*?\.account-money-route__mark,[\s\S]*?display:\s*none/);
  assert.match(accountCss, /@media \(max-width: 1020px\)[\s\S]*?\.account-finance-layout[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(accountCss, /@media \(max-width: 700px\)[\s\S]*?\.account-balance-main \.deposit-calculator[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test('filled client demo includes payment confirmations for the journal', () => {
  assert.match(demo, /payment_confirmations:\s*\[/);
  assert.match(demo, /payment-confirmation-9001\.pdf/);
  assert.match(demo, /payment-confirmation-8801\.pdf/);
});

test('financial hall assets are cache-busted', () => {
  assert.match(dashboard, /ui=comfort97/);
  assert.match(dashboard, /ui=telegram-primary-hall97/);
});
