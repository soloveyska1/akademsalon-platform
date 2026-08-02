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

test('session curator is a compact planner rather than a generic account panel', () => {
  const curator = between('function curatorHtml()', 'function plusSection()');
  assert.match(curator, /account-club-curator reveal/);
  assert.match(curator, /account-curator-layout/);
  assert.match(curator, /account-curator-agenda/);
  assert.match(curator, /account-curator-aside/);
  assert.match(curator, /Раньше, чем станет срочно/);
  assert.match(curator, /Напомним за 7, 3 и 1 день/);
  assert.doesNotMatch(curator, /<div class="account-panel">/);
});

test('planner keeps milestone actions and hides the add form behind one disclosure', () => {
  const curator = between('function curatorHtml()', 'function plusSection()');
  assert.match(curator, /<details class="account-curator-add" id="curatorAdd"/);
  assert.match(curator, /id="msTitle"/);
  assert.match(curator, /id="msDate"/);
  assert.match(curator, /id="msAdd"/);
  assert.match(curator, /data-ms-del/);
  assert.match(curator, /ms\.length < 50 : ms\.length < 1/);
});

test('opened curator appears before the plan catalogue and scrolls into view', () => {
  const plus = between('function plusSection()', 'function captureAccountUi()');
  assert.match(plus, /return curBlock \+ planSection/);
  assert.match(cabinet, /if \(t\.closest\('#curShow'\)\)[\s\S]*?scrollToEl\('curatorBox'\)/);
});

test('curator has a stable direct preview route', () => {
  assert.match(cabinet, /if \(h0 === 'club-curator'\) \{\s*st\.tab = 'club'; st\.plusOpen = true; st\.curOpen = true/);
  assert.match(cabinet, /if \(h === 'club-curator'\) \{\s*st\.plusOpen = true; st\.curOpen = true; hashCuratorScroll = true/);
  assert.match(cabinet, /hashCuratorScroll && document\.getElementById\('curatorBox'\)/);
});

test('planner has branded desktop composition and one-column mobile controls', () => {
  assert.match(accountCss, /SESSION CURATOR · hall84/);
  assert.match(accountCss, /\.account-curator-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1\.35fr\) minmax\(280px, \.65fr\)/);
  assert.match(accountCss, /\.account-curator-aside\s*\{[\s\S]*?linear-gradient/);
  assert.match(accountCss, /\.account-curator-row \.line-link\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(accountCss, /@media \(max-width: 700px\)[\s\S]*?\.account-curator-add \.account-form-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test('curator planner assets are cache-busted', () => {
  assert.match(dashboard, /ui=comfort97/);
  assert.match(dashboard, /ui=telegram-primary-hall97/);
});
