const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const dashboardHtml = read('dashboard.html');
const appJs = read('assets/js/app.js');
const cabinetJs = read('assets/js/cabinet.js');
const accountCss = read('assets/css/polish15-account.css');
const adminHtml = read('admin.html');
const adminJs = read('assets/js/admin.js');
const adminCss = read('assets/css/polish15-admin.css');

test('account production page uses the final concept shell', () => {
  assert.match(dashboardHtml, /body class="is-account-route"/);
  assert.match(dashboardHtml, /polish15-account\.css/);
  assert.doesNotMatch(dashboardHtml, /class="chapter cab"/);
  assert.match(cabinetJs, /class="account-shell"/);
  assert.match(cabinetJs, /class="account-nav"/);
  assert.match(cabinetJs, /class="account-nav__person" data-tab="settings" aria-label="Открыть настройки профиля"/);
  assert.match(cabinetJs, /class="account-main"/);
  assert.match(cabinetJs, /class="account-summary"/);
  assert.match(cabinetJs, /class="order-list"/);
  assert.match(cabinetJs, /class="account-benefits"/);
  for (const label of ['Дела', 'Сообщения', 'Документы', 'Платежи', 'Клуб Салона', 'Депозит']) {
    assert.match(cabinetJs, new RegExp(`'${label.replace(/[+]/g, '\\$&')}'`));
  }
});

test('account authentication and live order mechanics remain bound', () => {
  [
    'cabTg', 'cabEmailSend', 'cabEmailGo', 'cabClaimBtn', 'cabLogout',
    'chatSend', 'data-protected-asset', 'data-protected-media',
    '/orders/', '/message', '/upload', '/pay-deposit', '/deposit/topup',
    '/bonus', '/plans', '/subs/', '/milestones'
  ].forEach((hook) => assert.ok(cabinetJs.includes(hook), `missing account hook: ${hook}`));
  ['home', 'orders', 'wallet', 'club', 'help'].forEach((tab) => {
    assert.ok(cabinetJs.includes(`['${tab}'`) || cabinetJs.includes(`'${tab}',`), `missing account tab: ${tab}`);
  });
});

test('account mobile edition is bounded and motion-safe', () => {
  assert.match(accountCss, /@media \(max-width: 880px\)/);
  assert.match(accountCss, /@media \(max-width: 480px\)/);
  assert.match(accountCss, /padding-top: calc\(var\(--mobile-appbar-h, 62px\) \+ env\(safe-area-inset-top\)\)/);
  assert.match(accountCss, /overflow-x: auto/);
  assert.match(accountCss, /env\(safe-area-inset-bottom\)/);
  assert.match(accountCss, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(appJs, /MCTA_OFF\s*=[^;]+dashboard\.html/);
  assert.match(appJs, /mnItem\('dashboard\.html', 'Кабинет'/);
});

test('admin production page uses the final concept workspace', () => {
  assert.match(adminHtml, /body class="is-admin-route"/);
  assert.match(adminHtml, /polish15-admin\.css/);
  assert.match(adminJs, /class="admin-shell"/);
  assert.match(adminJs, /class="admin-sidebar"/);
  assert.match(adminJs, /class="admin-main"/);
  assert.match(adminJs, /class="admin-metrics"/);
  assert.match(adminJs, /class="admin-dashboard-grid"/);
  assert.doesNotMatch(adminJs, /class="ag-mast"/);
  assert.doesNotMatch(adminJs, /class="ag-nav"/);
  for (const label of ['Рабочий стол', 'Посещения', 'Дела', 'Клиенты', 'Отзывы',
    'Приёмная', 'Сертификаты', 'Обращения', 'Рассылки', 'Настройки', 'Материалы', 'Обложки']) {
    assert.ok(adminJs.includes(label), `missing final admin navigation item: ${label}`);
  }
  assert.match(adminJs, /function tplContent\(\)/);
  assert.match(adminJs, /href="admin-covers\.html"/);
  assert.match(adminJs, /content: 'Материалы'/);
  assert.match(adminJs, /mobileBrand\.textContent = mobileTitle/);
  assert.match(adminJs, /function adminThemeButton\(\)/);
  assert.match(adminJs, /<span aria-hidden="true">◐<\/span>/);
  assert.doesNotMatch(adminJs, /data-theme-label>Тема интерфейса/);
});

test('admin API actions and operational hooks remain present', () => {
  [
    '/admin/overview', '/admin/orders', '/admin/clients', '/admin/reviews',
    '/admin/qa', '/admin/gifts', '/admin/leads', '/admin/subs',
    'data-open-order', 'data-bulk', 'data-gift-act', 'data-sub-ok',
    'agNoteSave', 'agMsgSend', 'wzOpen', 'agLogout'
  ].forEach((hook) => assert.ok(adminJs.includes(hook), `missing admin hook: ${hook}`));
});

test('admin workspace supports light, dark and compact mobile layouts', () => {
  assert.match(adminCss, /:root\[data-theme="dark"\] \.is-admin-route/);
  assert.match(adminCss, /@media \(max-width: 880px\)/);
  assert.match(adminCss, /@media \(max-width: 560px\)/);
  assert.match(adminCss, /overflow-x: auto/);
  assert.match(adminCss, /env\(safe-area-inset-bottom\)/);
  assert.match(adminCss, /prefers-reduced-motion: reduce/);
});
