const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const cabinet = fs.readFileSync(path.join(root, 'assets/js/cabinet.js'), 'utf8');
const accountCss = fs.readFileSync(path.join(root, 'assets/css/polish15-account.css'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');

test('case register groups work by client priority', () => {
  assert.match(cabinet, /function registerGroups\(list, mode\)/);
  const waiting = cabinet.indexOf("add('waiting', 'Ждут вас'");
  const working = cabinet.indexOf("add('working', 'В работе'");
  const closed = cabinet.indexOf("add('closed', 'Завершены'");
  assert.ok(waiting > 0 && waiting < working && working < closed);
  assert.match(cabinet, /class="account-order-group account-order-group--/);
  assert.match(cabinet, /account-orders--registry/);
});

test('full register uses compact horizontal rows while mobile stays stacked', () => {
  assert.match(accountCss, /\.account-orders--registry \.order-list\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(accountCss, /\.account-orders--registry \.order-card\s*\{[\s\S]*?grid-template-columns:\s*124px/);
  assert.match(accountCss, /\.order-card--attention\s*\{[\s\S]*?box-shadow:\s*inset 3px 0 0 var\(--wax\)/);
  assert.match(accountCss, /@media \(max-width: 920px\)[\s\S]*?\.account-orders--registry \.order-card\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test('message index is a conversation list sorted by unread state', () => {
  const start = cabinet.indexOf('function messagesTab()');
  const end = cabinet.indexOf('function ordersTab()', start);
  const source = cabinet.slice(start, end);
  assert.match(source, /var unread = \(b\.order\.unread \|\| 0\) - \(a\.order\.unread \|\| 0\)/);
  assert.match(source, /class="account-conversation/);
  assert.match(source, /class="account-conversation__body"/);
  assert.match(source, /account-conversation__mark" aria-hidden="true">' \+ accountIcon\('messages'\)/);
  assert.match(source, /conversationGroup\('Новые'/);
  assert.doesNotMatch(source, /nowCard\(\)/);
  assert.doesNotMatch(source, /account-ledger__row--act/);
});

test('conversation rows expose case, state, preview, date and unread count', () => {
  for (const hook of [
    'account-conversation__mark',
    'account-conversation__body',
    'account-conversation__meta',
    'data-now-jump="secChat"'
  ]) assert.ok(cabinet.includes(hook), `missing conversation hook ${hook}`);
  assert.match(accountCss, /\.account-conversation\.is-unread\s*\{/);
  assert.match(accountCss, /@media \(max-width: 620px\)[\s\S]*?\.account-conversation__meta\s*\{[\s\S]*?grid-column:\s*2/);
});

test('register and messages assets are cache-busted', () => {
  assert.match(dashboard, /ui=comfort97/);
  assert.match(dashboard, /ui=telegram-primary-hall97/);
});
