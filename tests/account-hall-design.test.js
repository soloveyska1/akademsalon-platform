const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const cabinet = fs.readFileSync(path.join(root, 'assets/js/cabinet.js'), 'utf8');
const accountCss = fs.readFileSync(path.join(root, 'assets/css/polish15-account.css'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');

test('account overview separates work, client decisions, and new events', () => {
  assert.match(cabinet, /class="account-summary" data-account-brief/);
  assert.match(cabinet, /В работе/);
  assert.match(cabinet, /Ждёт вас/);
  assert.match(cabinet, /Новое/);
  assert.doesNotMatch(cabinet, /attention \+= unread/);
  assert.match(cabinet, /Здесь видно, что происходит с заказами и требуется ли от вас действие/);
});

test('one priority sheet leads the next client action', () => {
  assert.match(cabinet, /data-account-priority="' \+ score \+ '"/);
  assert.match(cabinet, /Сейчас важно · дело/);
  assert.match(accountCss, /\.account-priority\s*\{/);
  assert.match(accountCss, /grid-template-columns:\s*42px minmax\(0, 1fr\) auto/);
});

test('cabinet uses one stroke-icon navigation alphabet and compact home register', () => {
  assert.match(cabinet, /function accountIcon\(name\)/);
  for (const icon of ['home', 'orders', 'messages', 'documents', 'wallet', 'help', 'settings', 'more']) {
    assert.match(cabinet, new RegExp(`${icon}: '<`), `missing cabinet icon ${icon}`);
  }
  assert.match(cabinet, /class="account-nav__glyph"/);
  assert.match(cabinet, /class="account-nav__more-panel" aria-label="Другие разделы"/);
  assert.match(cabinet, /function accountTabs\(\)/);
  assert.match(cabinet, /navSide\(\) \+ sideFoot\(\)/);
  assert.doesNotMatch(cabinet, /navSide\(\) \+ sideMini\(\)/);
  assert.match(accountCss, /\.account-nav__glyph\s*\{/);
  assert.match(accountCss, /\.account-nav__glyph svg\s*\{[\s\S]*?stroke:\s*currentColor/);
  assert.match(accountCss, /\.account-tabs\s*\{/);
  assert.match(accountCss, /\.account-orders--home \.order-card:not\(\[href\]\)\s*\{[\s\S]*?min-height:\s*118px/);
  assert.match(accountCss, /\.account-home-focus\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1\.45fr\) minmax\(285px, \.55fr\)/);
  assert.match(accountCss, /\.account-home-tools\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3/);
});

test('hall dark theme is deep, branded, and cache-busted', () => {
  for (const token of ['#181411', '#211c18', '#29231e', '#302822']) {
    assert.ok(accountCss.includes(token), `missing hall dark token ${token}`);
  }
  assert.match(accountCss, /DARK LUMINOUS MATERIALS/);
  assert.match(accountCss, /data-theme="dark"[\s\S]*?\.case-overview\s*\{[\s\S]*?background:\s*var\(--hall90-surface-focus\)/);
  assert.match(accountCss, /data-theme="dark"[\s\S]*?\.account-home-cases[\s\S]*?\.order-list\s*\{[\s\S]*?background:\s*transparent/);
  assert.match(accountCss, /radial-gradient\(circle at 86% 5%/);
  assert.match(accountCss, /@media \(max-width: 700px\)/);
  assert.match(dashboard, /ui=comfort97/);
  assert.match(dashboard, /ui=telegram-primary-hall97/);
});
