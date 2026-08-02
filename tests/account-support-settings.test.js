const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const cabinet = fs.readFileSync(path.join(root, 'assets/js/cabinet.js'), 'utf8');
const accountCss = fs.readFileSync(path.join(root, 'assets/css/polish15-account.css'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');

test('help starts with two clear contact contexts', () => {
  assert.match(cabinet, /class="account-support-layout"/);
  assert.match(cabinet, /class="account-support-primary"/);
  assert.match(cabinet, /class="account-support-reception"/);
  assert.match(cabinet, /data-contact="1"/);
  assert.match(cabinet, /@academic_saloon_bot|academic_saloon_bot/);
  assert.match(cabinet, /href="priyomnaya\.html"/);
  assert.match(accountCss, /\.account-support-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1\.35fr\) minmax\(290px, \.65fr\)/);
});

test('help groups the six durable references into a compact guide index', () => {
  assert.match(cabinet, /class="account-support-guides"/);
  for (const pathName of ['start.html', 'guarantees.html', 'oplata.html', 'loyalty.html', 'oferta.html', 'privacy.html']) {
    assert.ok(cabinet.includes(`href="${pathName}"`), `missing support route ${pathName}`);
  }
  assert.match(accountCss, /\.account-support-guides\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3/);
});

test('settings exposes profile, theme, motion and notification status', () => {
  assert.match(cabinet, /class="account-settings-profile reveal"/);
  assert.match(cabinet, /class="account-settings-layout"/);
  assert.match(cabinet, /S\.themeToggleHTML/);
  assert.match(cabinet, /S\.calmToggleHTML/);
  assert.match(cabinet, /account-setting-row--notifications/);
  assert.match(cabinet, /id="cabNotiBtn"/);
  assert.match(accountCss, /\.account-settings-layout\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2/);
});

test('settings distinguishes connected methods from actions and keeps OAuth linking functional', () => {
  assert.match(cabinet, /Как вы входите в кабинет/);
  assert.match(cabinet, /telegramConnected/);
  assert.match(cabinet, /data-oauth-link="' \+ provider \+ '"/);
  assert.match(cabinet, /Подключить ещё один способ|Подключите ещё один способ/);
  assert.match(cabinet, /account-access-notice/);
  assert.match(cabinet, /id="cabLogout"/);
  assert.match(cabinet, /href="privacy\.html">Настроить/);
});

test('support and settings collapse without losing controls on phones', () => {
  assert.match(accountCss, /@media \(max-width: 1060px\)[\s\S]*?\.account-support-layout,[\s\S]*?\.account-settings-layout[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(accountCss, /@media \(max-width: 700px\)[\s\S]*?\.account-support-guides\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(accountCss, /@media \(max-width: 480px\)[\s\S]*?\.account-access-item\s*\{[\s\S]*?grid-template-columns:\s*38px minmax\(0, 1fr\)/);
  assert.match(accountCss, /@media \(max-width: 360px\)[\s\S]*?\.account-access-action\s*\{[\s\S]*?width:\s*100%/);
});

test('support and settings assets are cache-busted', () => {
  assert.match(dashboard, /ui=comfort97/);
  assert.match(dashboard, /ui=telegram-primary-hall97/);
});
