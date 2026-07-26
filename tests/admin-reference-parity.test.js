const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('assets/css/polish15-admin.css');
const adminJs = read('assets/js/admin.js');
const coversHtml = read('admin-covers.html');

test('admin uses the canonical light workspace palette without replacing the sign', () => {
  for (const token of [
    '--ad-bg: #eee9df',
    '--ad-side: #f7f2e9',
    '--ad-card: #fcf9f3',
    '--ad-card-2: #f4eee4',
    '--ad-input: #fffdf8',
    '--ad-ink: #28251f',
    '--ad-text: #514b42',
    '--ad-muted: #69635a',
    '--ad-hover: #e9e1d5',
    '--ad-wax: #a5412c',
  ]) {
    assert.ok(css.includes(token), `missing canonical admin token: ${token}`);
  }
  assert.match(adminJs, /bimi\/logo\.svg/);
  assert.match(coversHtml, /bimi\/logo\.svg/);
});

test('admin operational typography and navigation keep the reference readability floor', () => {
  assert.match(
    css,
    /\.admin-sidebar nav \.ag-tab,[\s\S]*?min-height:\s*44px;[\s\S]*?font-size:\s*12px;/,
  );
  assert.match(
    css,
    /\.admin-main :is\(p, small, span, td, th, button, label, input, textarea, select, dt, dd, a\),[\s\S]*?font-size:\s*12px !important;[\s\S]*?line-height:\s*1\.45;/,
  );
  assert.match(css, /\.admin-table th\s*\{[\s\S]*?height:\s*44px;/);
  assert.match(css, /\.admin-table td\s*\{[\s\S]*?height:\s*62px;/);
});

test('mobile admin controls remain 44px and order rows scroll as a table', () => {
  assert.match(css, /@media \(max-width:920px\)[\s\S]*?\.admin-order-register\s*\{[\s\S]*?overflow-x:\s*auto;/);
  assert.match(
    css,
    /\.admin-order-register__head,[\s\S]*?\.admin-order-register \.ag-list\s*\{[\s\S]*?min-width:\s*930px;/,
  );
  assert.match(
    css,
    /@media \(max-width: 400px\)[\s\S]*?grid-template-columns:\s*44px minmax\(0, 1fr\) 44px 44px 44px;/,
  );
  assert.match(
    css,
    /@media \(max-width: 400px\)[\s\S]*?\.admin-mobile-appbar__menu\s*\{[\s\S]*?min-height:\s*44px;/,
  );
});

test('settings, content and cover shells keep production mechanics in reference geometry', () => {
  assert.match(
    css,
    /#agBody > \.admin-settings-workspace\s*\{[\s\S]*?grid-template-columns:\s*1fr;/,
  );
  assert.match(
    css,
    /#agBody > \.admin-settings-workspace > \.admin-dashboard-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/,
  );
  assert.match(css, /\.admin-content-toolbar\s*\{[\s\S]*?grid-template-columns:\s*minmax\(220px, \.65fr\) minmax\(0, 1fr\) auto;/);
  assert.match(css, /\.is-admin-route\.p15-admin-covers \.cover-controls\s*\{[\s\S]*?padding:\s*20px;/);
  assert.match(css, /\.is-admin-route\.p15-admin-covers \.cover-canvas-wrap\s*\{[\s\S]*?padding:\s*16px;/);
  for (const hook of [
    '/admin/overview',
    '/admin/orders',
    'data-open-order',
    'agReqSave',
    'data-tab',
  ]) {
    assert.ok(adminJs.includes(hook), `missing live admin hook: ${hook}`);
  }
  for (const hook of ['data-generate-cover', 'data-export-size', 'data-save-cover']) {
    assert.ok(coversHtml.includes(hook), `missing live cover hook: ${hook}`);
  }
});

test('workbench and live order register use the canonical structural hierarchy', () => {
  assert.match(adminJs, /<section class="admin-workbench" aria-label="Рабочий стол мастерской">/);
  for (const title of ['Сегодня', 'Поступления', 'Качество', 'Последние события']) {
    assert.ok(adminJs.includes(`<h2>${title}</h2>`), `missing canonical workbench panel: ${title}`);
  }
  assert.match(adminJs, /class="admin-table-wrap admin-order-register" aria-label="Реестр дел"/);
  assert.match(
    adminJs,
    /<span aria-hidden="true"><\/span><span>Дело<\/span><span>Клиент<\/span><span>Задача<\/span>[\s\S]*?<span>Статус<\/span><span>Ближайший срок<\/span><span>Сумма<\/span>/,
  );
  for (const hook of [
    'id="agFilters"',
    'id="agList"',
    'id="agListFooter"',
    'id="agBulkWrap"',
    'id="agCard"',
    'data-id="',
    'class="admin-order-select"',
    'class="admin-order-client"',
  ]) {
    assert.ok(adminJs.includes(hook), `missing live order structure or hook: ${hook}`);
  }
  for (const label of ['Все', 'Новые', 'Требуется решение', 'В работе', 'Завершённые']) {
    assert.ok(adminJs.includes(`['${label === 'Все' ? '' :
      label === 'Новые' ? 'new' :
      label === 'Требуется решение' ? 'attention' :
      label === 'В работе' ? 'work' : 'done'}', '${label}']`),
    `missing canonical primary order filter: ${label}`);
  }
  assert.match(adminJs, /class="admin-order-filters-more"/);
  assert.match(adminJs, /<summary class="quiet-button">Фильтры/);
  assert.match(adminJs, /id="wzOpen">Создать дело<\/button>/);
  assert.match(adminJs, /admin-order-register--low-data/);
  assert.match(adminJs, /id="agOrdersReset"/);
});

test('client workspace keeps the canonical directory and profile around live actions', () => {
  assert.match(adminJs, /<section class="client-directory ag-split" aria-label="Клиентская картотека">/);
  assert.match(adminJs, /class="client-directory__list"/);
  assert.match(adminJs, /class="client-profile ag-card" id="agCCard"/);
  assert.match(adminJs, /class="ag-row client-directory__row/);
  assert.match(adminJs, /class="client-profile__contacts"/);
  assert.match(adminJs, /class="client-profile__menu"/);
  assert.match(adminJs, /<h3[^>]*>Активное дело<\/h3>/);
  assert.match(adminJs, /<h3[^>]*>Бонусный счёт<\/h3>/);
  assert.match(adminJs, /<h3[^>]*>Дела клиента<\/h3>/);
  assert.match(adminJs, /<h3[^>]*>Доступ и безопасность<\/h3>/);
  for (const hook of [
    'id="agCQ"',
    'id="agCSort"',
    'data-cid="',
    'id="agBApply"',
    'id="clBonusPanel"',
    'id="clAccessPanel"',
    'data-open-order="',
    'data-imp-client="',
    'id="agBan"',
  ]) {
    assert.ok(adminJs.includes(hook), `missing live client hook: ${hook}`);
  }
  assert.match(adminJs, /id="agClientsExport">Экспорт<\/button>/);
  assert.match(adminJs, /function exportClientsCsv\(\)/);
  assert.doesNotMatch(adminJs, /class="mono petit">id /);
});

test('settings are live summary plus canonical panels without invented reference data', () => {
  assert.match(adminJs, /function settingsSummary\(ov\)/);
  assert.match(adminJs, /class="admin-metrics admin-settings-summary"/);
  assert.match(adminJs, /function settingsPanel\(title, note, body, extraClass\)/);
  assert.match(adminJs, /class="admin-settings-workspace"/);
  for (const title of [
    'Режимы сервиса',
    'Запись и доступность',
    'Реквизиты для переводов',
    'Оплата этапами',
    'Инструменты мастерской',
    'Подключения и восстановление',
  ]) {
    assert.ok(adminJs.includes(`settingsPanel('${title}'`), `missing live settings panel: ${title}`);
  }
  for (const title of ['Онлайн-оплата', 'Почта', 'Вход через ВК и Mail.ru', 'Рабочая группа заказов']) {
    assert.ok(adminJs.includes(`settingsDisclosure('${title}'`),
      `missing progressive settings disclosure: ${title}`);
  }
  for (const hook of ['data-maint="', 'id="agSlotsSave"', 'data-slot-extra="', 'id="agReqSave"']) {
    assert.ok(adminJs.includes(hook), `missing live settings hook: ${hook}`);
  }
  assert.doesNotMatch(adminJs, /systemctl restart|\/root\/salon_bot\/\.env/);
  assert.doesNotMatch(adminJs, /admin-settings-panel--(?:roles|schedule|consents)/);
});
