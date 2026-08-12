const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('admin-analytics.html');
const js = read('assets/js/admin-analytics.js');
const api = read('assets/js/admin-analytics-api.js');
const css = read('assets/css/admin-analytics.css');
const admin = read('assets/js/admin.js');
const adminHtml = read('admin.html');
const sw = read('sw.js');

test('admin analytics is Russian, source-backed and explicit about coverage', () => {
  for (const phrase of [
    'Аналитика', 'Сводка', 'Сейчас на сайте', 'Источники', 'Страницы и переходы',
    'Воронка', 'Посетители и сессии', 'Качество данных', 'Только после согласия',
    'Московское время',
  ]) assert.match(html + js, new RegExp(phrase));
  assert.match(js, /\/admin\/analytics\/overview/);
  assert.match(js, /\/admin\/analytics\/sessions/);
  assert.match(js, /\/admin\/analytics\/session\//);
  assert.match(js, /полнота[^<]{0,80}неизвестна|охват[^<]{0,80}неизвестен/i);
  assert.match(admin, /admin-analytics\.html/);
});

test('analytics UI has no raw identity or third-party IP disclosure', () => {
  const combined = html + js + api;
  for (const forbidden of ['ipinfo.io', 'order_id', 'raw_user_agent', 'raw_referrer']) {
    assert.doesNotMatch(combined, new RegExp(forbidden.replace('.', '\\.'), 'i'));
  }
  assert.doesNotMatch(combined, /\bIP-адрес\b/i);
  assert.match(combined, /анонимн/i);
  assert.match(sw, /admin(?:\\\\\(\?:-\[a-z0-9-\]\+\\\\\)\?)?/i);
});

test('approximate geography visibly attributes the local DB-IP dataset', () => {
  assert.match(html, /Геоданные:\s*<a href="https:\/\/db-ip\.com"/);
  assert.match(html, /DB-IP<\/a>\s*\(CC BY 4\.0\)/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /(?:script|img|link)[^>]+db-ip\.com/i,
    'attribution is a link, never a third-party runtime resource');
});

test('private panel uses a read-only same-origin client without public analytics shell', () => {
  assert.doesNotMatch(html, /assets\/js\/app\.js/);
  assert.match(html, /admin-analytics-api\.js/);
  assert.match(api, /method:\s*'GET'/);
  assert.match(api, /credentials:\s*'same-origin'/);
  assert.match(api, /cache:\s*'no-store'/);
  assert.doesNotMatch(api, /post\s*:|method:\s*'POST'|mc\.yandex|metrika/i);
  assert.doesNotMatch(html, /<script(?![^>]+src=)[^>]*>[\s\S]*?<\/script>/i);
  assert.doesNotMatch(html + js, /\sstyle=|\.style\./i);
});

test('dashboard is responsive, keyboard-visible and does not encode meaning by colour alone', () => {
  assert.match(css, /@media\s*\(max-width:\s*920px\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /<table/);
  assert.match(js, /aria-label/);
  assert.match(js, /aria-sort/);
});

test('analytics projects the canonical master shell without loading its operational controller', () => {
  assert.match(html, /<body class="is-admin-route admin-workspace-ready admin-analytics-route">/);
  for (const shellClass of [
    'admin-mobile-appbar', 'admin-shell', 'admin-sidebar', 'admin-sidebar__brand',
    'admin-sidebar__scroll', 'admin-main', 'admin-head',
  ]) assert.match(html, new RegExp('class="[^"]*\\b' + shellClass + '\\b'));

  const masterCss = adminHtml.match(/assets\/css\/polish15-admin\.css\?[^" ]+/)?.[0];
  assert.ok(masterCss, 'master cabinet has a canonical shell stylesheet URL');
  assert.match(html, new RegExp(masterCss.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, /assets\/css\/styles\.css\?/);
  assert.doesNotMatch(html, /aa-topbar/);
  assert.doesNotMatch(html, /assets\/js\/(?:app|admin)\.js/);
});

test('analytics navigation mirrors every master group and deep-links back to real cabinet sections', () => {
  const labels = [
    'Работа', 'Рабочий стол', 'Дела', 'Клиенты',
    'Коммуникации', 'Приёмная', 'Отзывы', 'Обращения', 'Рассылки',
    'Бизнес и система', 'Сертификаты', 'Аналитика', 'Материалы', 'Настройки', 'Обложки',
  ];
  let cursor = -1;
  labels.forEach((label) => {
    const next = html.indexOf(label, cursor + 1);
    assert.ok(next > cursor, `${label} follows the canonical navigation order`);
    cursor = next;
  });
  for (const tab of ['summary', 'orders', 'clients', 'qa', 'reviews', 'leads', 'broadcast', 'gifts', 'content', 'settings']) {
    assert.match(html, new RegExp('href="admin\\.html#' + tab + '"'));
  }
  assert.match(html, /href="admin-analytics\.html"[^>]+aria-current="page"/);
  assert.match(html, /href="admin-covers\.html"/);
});

test('analytics shell remains strict-CSP compatible and uses one fresh asset wave', () => {
  assert.doesNotMatch(html, /<script(?![^>]+src=)[^>]*>|<style\b|\sstyle=|\son[a-z]+=/i);
  assert.doesNotMatch(html, /(?:https?:)?\/\/(?!db-ip\.com)/i);
  assert.match(html, /assets\/css\/admin-analytics\.css\?v=20260812analytics3/);
  assert.match(html, /assets\/js\/admin-analytics\.js\?v=20260812analytics3/);
  assert.doesNotMatch(css, /(^|\n)\s*:root\s*\{/);
  assert.doesNotMatch(css, /(^|\n)\s*(?:html|body|main|table|th|td|a|button|select)\s*(?:,|\{)/m);
});

test('pagination and details are bound to one immutable applied query', () => {
  assert.match(js, /appliedQuery/);
  assert.match(js, /cloneQuery|Object\.freeze/);
  assert.match(js, /state\.cursor\s*=\s*null[\s\S]{0,500}loadMore/);
  assert.match(js, /function loadMore\(\)[\s\S]*state\.appliedQuery/);
  assert.match(js, /function openSession\([^)]*\)[\s\S]*state\.appliedQuery/);
  assert.doesNotMatch(js, /function loadMore\(\)[\s\S]{0,260}requestState\(\)/);
});

test('every analytics controller hook exists in the static shell and remains read-only', () => {
  const runtimeIds = [...js.matchAll(/byId\('([^']+)'\)/g)].map((match) => match[1]);
  assert.ok(runtimeIds.length > 30, 'contract covers the complete interactive dashboard');
  for (const id of new Set(runtimeIds)) {
    assert.match(html, new RegExp('id=["\\\']' + id + '["\\\']'), `#${id} exists in the shell`);
  }
  assert.doesNotMatch(js, /\bfetch\s*\(|method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i);
});

test('authorization loss purges every read path and exposes one focused login action', () => {
  assert.match(js, /function showAccessDenied\(\)[\s\S]*state\.generation\s*\+=\s*1[\s\S]*\.abort\(\)[\s\S]*clearRenderedData\(\)[\s\S]*accessAction[\s\S]*\.focus\(/);
  assert.match(js, /function loadMore\(\)[\s\S]*error === 'forbidden'[\s\S]*showAccessDenied\(\)/);
  assert.match(js, /function openSession\([^)]*\)[\s\S]*error === 'forbidden'[\s\S]*showAccessDenied\(\)/);
  assert.match(html, /id="navOnlineCount"[^>]+hidden/);
  assert.match(js, /clearRenderedData[\s\S]*navOnline\.textContent\s*=\s*'0'[\s\S]*navOnline\.hidden\s*=\s*true/);
  assert.match(css, /:is\(#navOnlineCount, #loadMore\)\[hidden\][\s\S]*display:\s*none\s*!important/);
});

test('cabinet deep links override a stale saved tab before navigation', () => {
  assert.match(js, /data-admin-nav-link[\s\S]*admin\\?\.html#\(\[a-z\]\+\)[\s\S]*localStorage\.setItem\('ag_tab', JSON\.stringify\(match\[1\]\)\)/);
});

test('master search controls and shortcut hand focus to the real cabinet search', () => {
  assert.match(html, /data-admin-search[^>]*>[\s\S]{0,500}<kbd>⌘ K<\/kbd>/);
  assert.match(js, /function openCabinetSearch\(\)[\s\S]*ag_tab[\s\S]*ag_focus_search[\s\S]*admin\.html#orders/);
  assert.match(js, /metaKey \|\| event\.ctrlKey[\s\S]*openCabinetSearch\(\)/);
  assert.match(admin, /ag_focus_search[\s\S]*sessionStorage\.removeItem\('ag_focus_search'\)[\s\S]*pendingAdminFocus\s*=\s*true/);
});

test('hidden pagination stays hidden and the authenticated master identity is projected', () => {
  assert.match(css, /#loadMore\)\[hidden\][\s\S]*display:\s*none\s*!important/);
  assert.match(html, /id="adminProfile"/);
  assert.match(html, /id="adminReturn"/);
  assert.match(js, /function syncMasterIdentity\(session\)/);
});
