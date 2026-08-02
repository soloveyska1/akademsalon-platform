const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const cabinet = fs.readFileSync(path.join(root, 'assets/js/cabinet.js'), 'utf8');
const accountCss = fs.readFileSync(path.join(root, 'assets/css/polish15-account.css'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');

function between(start, end) {
  const from = cabinet.indexOf(start);
  const to = cabinet.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `cannot isolate ${start}`);
  return cabinet.slice(from, to);
}

test('opening Club no longer expands the plan catalogue automatically', () => {
  const setTab = between('function setTab(', 'function draftSection(');
  const clubTab = between('function clubTab()', 'function helpTab()');
  assert.doesNotMatch(setTab, /plusOpen\s*=\s*true/);
  assert.doesNotMatch(clubTab, /loadPlans\(\)/);
  assert.doesNotMatch(clubTab, /financeSummary\(\)/);
  assert.match(clubTab, /return accountTabs\(\) \+ \(pend/);
  assert.doesNotMatch(cabinet, /if \(h0 === 'club'\) st\.plusOpen = true/);
});

test('the explicit plus deep link still opens the catalogue', () => {
  assert.match(cabinet, /if \(h0\.indexOf\('plus'\) >= 0\) \{\s*st\.tab = 'club'; st\.plusOpen = true/);
  assert.match(cabinet, /if \(t\.closest\('#plusToggle'\)\) \{\s*st\.plusOpen = !st\.plusOpen/);
});

test('active, inactive and pending membership states have distinct shells', () => {
  assert.match(cabinet, /account-club-card account-club-card--active reveal/);
  assert.match(cabinet, /account-club-card account-club-card--inactive reveal/);
  assert.match(cabinet, /account-club-card account-club-card--pending reveal/);
  assert.match(cabinet, /Салон\+ работает/);
  assert.match(cabinet, /Управлять планом/);
  assert.match(accountCss, /\.account-club-card--active \.membership-pass\s*\{[\s\S]*?linear-gradient/);
});

test('plan management is one shelf with ready plans and a custom blank', () => {
  assert.match(cabinet, /account-section account-club-plans reveal/);
  assert.match(cabinet, /plus-plan-card plus-plan-card--blank/);
  assert.match(cabinet, /Планы и свой набор/);
  assert.match(accountCss, /CLUB SHELF · hall85/);
  assert.match(accountCss, /\.account-club-plans \.plus-plan-grid\s*\{[\s\S]*?repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(accountCss, /\.account-club-plans \.plus-extras\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test('one period controls both ready plans and custom total', () => {
  const ctor = between('function ctorHtml()', 'function bestCtorDisc()');
  const plus = between('function plusSection()', 'function captureAccountUi()');
  assert.equal((plus.match(/aria-label="Срок абонемента"/g) || []).length, 1);
  assert.doesNotMatch(ctor, /data-ctor-period|period-switch/);
  assert.match(cabinet, /st\.showPeriod = segBtn[\s\S]*?st\.ctorPeriod = st\.showPeriod/);
  assert.match(cabinet, /st\.ctorPeriod = cper[\s\S]*?st\.showPeriod = st\.ctorPeriod/);
});

test('custom builder is an inline blank instead of a second deposit calculator', () => {
  const ctor = between('function ctorHtml()', 'function bestCtorDisc()');
  const plus = between('function plusSection()', 'function captureAccountUi()');
  assert.match(ctor, /class="club-blank" id="ctorBox"/);
  assert.match(ctor, /class="club-blank__ticket"/);
  assert.doesNotMatch(ctor, /deposit-calculator|deposit-receipt/);
  assert.match(plus, /cards \+ blankCard[\s\S]*?\+ ctorBlock/);
  assert.match(plus, /return curBlock \+ planSection/);
});

test('custom blank has a stable direct preview route', () => {
  assert.match(cabinet, /h0 === 'club-builder'[\s\S]*?st\.tab = 'club'; st\.plusOpen = true; st\.ctorOpen = true/);
  assert.match(cabinet, /h === 'club-builder'[\s\S]*?st\.plusOpen = true; st\.ctorOpen = true; hashBuilderScroll = true/);
  assert.match(cabinet, /hashBuilderScroll && document\.getElementById\('ctorBox'\)/);
});

test('club uses a horizontal snap shelf on phones and keeps the blank touchable', () => {
  const shelfCss = accountCss.slice(accountCss.indexOf('CLUB SHELF · hall85'));
  assert.match(shelfCss, /@media \(max-width: 660px\)[\s\S]*?\.account-club-plans \.plus-plan-grid\s*\{[\s\S]*?display:\s*flex[\s\S]*?overflow-x:\s*auto[\s\S]*?scroll-snap-type:\s*x mandatory/);
  assert.match(shelfCss, /@media \(max-width: 660px\)[\s\S]*?\.club-blank \.builder-options\s*\{[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(shelfCss, /\.club-blank__ticket #ctorBuy\s*\{[\s\S]*?min-height:\s*48px/);
  assert.match(accountCss, /@media \(max-width: 920px\)[\s\S]*?\.account-club-card \.membership-pass\s*\{[\s\S]*?width:\s*100%/);
});

test('club desk assets are cache-busted', () => {
  assert.match(dashboard, /ui=comfort97/);
  assert.match(dashboard, /ui=telegram-primary-hall97/);
});
