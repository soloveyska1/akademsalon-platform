const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const dashboardHtml = read('dashboard.html');
const adminHtml = read('admin.html');
const cabinetJs = read('assets/js/cabinet.js');
const adminJs = read('assets/js/admin.js');
const accountCss = read('assets/css/polish15-account.css');
const adminCss = read('assets/css/polish15-admin.css');

test('account home is a compact command centre with a dedicated full register', () => {
  assert.match(cabinetJs, /function ordersRegister\(mode, compact\)/);
  assert.match(cabinetJs, /ordersRegister\('', true\)/);
  assert.match(cabinetJs, /class="account-home-focus/);
  assert.match(cabinetJs, /class="account-home-tools reveal"/);
  assert.match(cabinetJs, /class="account-nav__group"/);
  assert.match(cabinetJs, /\['help', 'Помощь'/);
  assert.match(cabinetJs, /\['settings', 'Настройки'/);
  assert.match(cabinetJs, /needsAction\(o\)/);
  assert.match(accountCss, /\.account-orders--home \.order-list/);
  assert.match(accountCss, /\.account-home-focus__agenda/);
  assert.match(dashboardHtml, /class="workspace-skip-link"/);
});

test('account live refresh preserves work in progress and reading position', () => {
  assert.match(cabinetJs, /function captureAccountUi\(\)/);
  assert.match(cabinetJs, /function restoreAccountUi\(snap\)/);
  assert.match(cabinetJs, /selectionStart/);
  assert.match(cabinetJs, /main\.scrollTop/);
  assert.match(cabinetJs, /listScroll/);
  assert.match(cabinetJs, /listWindowScroll/);
  assert.match(cabinetJs, /requestSeq !== st\.detailRequestSeq/);
  assert.match(cabinetJs, /chatAtEnd/);
  assert.match(dashboardHtml, /href="#accountWorkspace"/);
});

test('admin restores all live queues and keeps the order drawer stateful', () => {
  assert.match(adminJs, /tplSubs\(ov\)/);
  assert.match(adminJs, /data-summary-jump="agSubs"/);
  assert.match(adminJs, /function captureAdminCardUi\(scope\)/);
  assert.match(adminJs, /function restoreAdminCardUi\(scope, snap\)/);
  assert.match(adminJs, /class="admin-order-drawer__workspace"/);
  assert.match(adminJs, /role="dialog" aria-modal="true"/);
  assert.match(adminJs, /openDrawer\.querySelectorAll/);
  assert.match(adminJs, /lastDrawerFocus\.focus\(\)/);
  assert.match(adminJs, /pendingAdminFocus/);
  assert.match(adminJs, /tabRequestEpoch/);
  assert.match(adminJs, /requestSeq !== st\.clientRequestSeq/);
  assert.match(adminJs, /subsFailed/);
  assert.match(adminJs, /setAdminDrawerBackground\(true\)/);
  assert.match(adminCss, /\.admin-order-drawer__workspace/);
});

test('admin mobile editions use list-detail clients and order cards', () => {
  assert.match(adminJs, /admin-client-selected/);
  assert.match(adminJs, /data-client-back/);
  assert.match(adminCss, /\.is-admin-route\.admin-client-selected \.client-directory__list/);
  assert.match(adminCss, /grid-template-areas:[\s\S]*?"select id state"[\s\S]*?"deadline deadline go"/);
  assert.match(adminCss, /admin-order-register \.ag-list\s*\{[\s\S]*?max-height: none;/);
  /* суффикс слоя двигается вместе с релизом — проверяем, что он ЕСТЬ,
     а не конкретный номер: иначе каждый бамп кеша роняет тест */
  assert.match(adminHtml, /ui=comfort\d+/);
  assert.match(dashboardHtml, /ui=comfort\d+/);
});
