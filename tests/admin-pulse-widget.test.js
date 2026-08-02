const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const adminHtml = read('admin.html');
const adminJs = read('assets/js/admin.js');
const adminCss = read('assets/css/polish15-admin.css');
const publicHome = read('index.html');

/* «Пульс мастерской» жил отдельным виджетом (.pw). После переноса сводки на
   эталонный рабочий стол функция pulseWidget перестала вызываться, а центр
   действий, плитки и панель «Сегодня» повторяли её один в один. Виджет снят
   вместе с мёртвым CSS; его обещания проверяем на живом рабочем столе. */

test('owner workbench stays inside the protected master cabinet', () => {
  assert.match(adminHtml, /class="ag" id="agRoot"/);
  assert.match(adminJs, /<section class="admin-workbench" aria-label="Рабочий стол мастерской">/);
  assert.doesNotMatch(publicHome, /Пульс мастерской|class="pw\b/);
  assert.doesNotMatch(adminJs, /function pulseWidget/);
  assert.doesNotMatch(adminHtml, /\.pw-metric|\.pw-queue/);
});

test('workbench exposes the actionable signals and a priority queue', () => {
  assert.match(adminJs, /<span>Активные дела<\/span>/);
  assert.match(adminJs, /<span>Ожидают клиента<\/span>/);
  assert.match(adminJs, /<span>Срок сегодня<\/span>/);
  assert.match(adminJs, /оплат на сверке/);
  assert.match(adminJs, /deskRows\(\)/);
  assert.match(adminJs, /data-open-order=/);
  assert.match(adminJs, /data-go="@qa"/);
  assert.match(adminJs, /data-go="@reviews"/);
});

test('workbench distinguishes fresh, loading, calm and stale data', () => {
  assert.match(adminJs, /ovAt: 0, ovFailed: false/);
  assert.match(adminJs, /живые данные · обновлено /);
  assert.match(adminJs, /Собираем очередь/);
  assert.match(adminJs, /aria-busy=/);
  assert.match(adminJs, /Стол чист/);
  assert.match(adminJs, /Связь со сводкой прервалась/);
  assert.match(adminJs, /нет связи · данные на /);
  assert.match(adminJs, /id="agPulseRetry"/);
  assert.match(adminCss, /\.admin-alert__stamp/);
  assert.doesNotMatch(adminJs, /Сайт (?:работает|отвечает|доступен)/i);
});

test('workbench is responsive, keyboard-visible and motion-safe', () => {
  assert.match(adminCss, /\.admin-metrics \{[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
  assert.match(adminCss, /@media \(max-width: 1100px\)[\s\S]*?\.admin-metrics \{[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(adminCss, /:is\(button, a, input, textarea, select, \[tabindex\]\):focus-visible/);
  assert.match(adminCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(adminHtml, /assets\/js\/admin\.js\?v=20260802release98/);
});
