const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const cabinet = fs.readFileSync(path.join(root, 'assets/js/cabinet.js'), 'utf8');
const accountCss = fs.readFileSync(path.join(root, 'assets/css/polish15-account.css'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');

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
  assert.match(cabinet, /data-account-priority="0"/);
  assert.match(accountCss, /\.account-priority--calm\s*\{[\s\S]*?box-shadow:\s*inset 3px 0 0 var\(--green\)/);
});

test('the priority sheet weighs the nearest deadline as well as action type', () => {
  const start = cabinet.indexOf('function nowCard()');
  const end = cabinet.indexOf('function clubBlock()', start);
  const source = cabinet.slice(start, end);
  assert.match(source, /var best = null, score = 0, bestRank = 0, bestDays = Infinity/);
  assert.match(source, /var left = daysLeft\(o\)/);
  assert.match(source, /left <= 2 \? 2 : left <= 7 \? 1\.5 : left <= 14 \? \.5/);
  assert.match(source, /rank > bestRank/);
  assert.match(source, /accountIcon\(score >= 4 \? 'wallet' : score === 1 \? 'messages' : 'documents'\)/);
  assert.doesNotMatch(source, /score >= 4 \? '₽' : '¶'/);
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
});
