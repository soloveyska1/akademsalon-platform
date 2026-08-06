const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const demo = fs.readFileSync(path.join(root, 'assets/js/cabinet-demo.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/polish15-account.css'), 'utf8');

test('filled cabinet fixture is explicitly local, synthetic, and noindex', () => {
  assert.match(demo, /location\.hostname === 'localhost'/);
  assert.match(demo, /\.saymoon\\\.chatgpt\\\.site\$/);
  assert.match(demo, /if \(!previewHost \|\|/);
  assert.match(demo, /demoName === 'alexey'/);
  assert.match(demo, /Алексей Воронов/);
  assert.match(demo, /noindex,nofollow,noarchive/);
  assert.match(demo, /Демо-данные/);
  assert.match(demo, /alexey\.voronov@example\.invalid/);
  assert.match(demo, /key === 'salon_draft'/);
});

test('demo cabinet intercepts every mutation and keeps navigation interactive', () => {
  assert.match(demo, /post: function \(\) \{ return Promise\.resolve\(\{ ok: false, error: 'demo_only' \}\); \}/);
  assert.match(demo, /event\.stopImmediatePropagation\(\)/);
  assert.match(demo, /\[data-act\]/);
  assert.match(demo, /#chatSend/);
  assert.match(demo, /\[data-protected-asset\]/);
  assert.match(demo, /\[data-oauth-link\]/);
  assert.doesNotMatch(demo, /fetch\(['"]\/api\//);
});

test('filled demo exposes both VK unlinked and linked account states', () => {
  assert.match(demo, /demoName === 'alexey-vk'/);
  assert.match(demo, /vkLinkedDemo \? \['telegram', 'vk'\] : \['telegram'\]/);
  assert.match(demo, /features: \{ email_login: true, vk_login: true/);
  assert.match(demo, /telegram_connected: true/);
  assert.match(demo, /email_masked:/);
});

test('demo bootstrap loads before cabinet and has a permanent visible marker', () => {
  const demoAt = dashboard.indexOf('assets/js/cabinet-demo.js');
  const cabinetAt = dashboard.indexOf('assets/js/cabinet.js');
  assert.ok(demoAt > 0 && cabinetAt > demoAt);
  assert.match(dashboard, /cabinet-demo\.js\?v=20260806release115/);
  assert.match(css, /\.is-cabinet-demo \.account-demo-flag/);
  assert.match(demo, /<span>Внешние действия отключены<\/span>/);
  assert.doesNotMatch(demo, /Алексей Воронов · внешние действия отключены/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('demo marker stays in document flow on phones instead of covering controls', () => {
  assert.match(demo, /cabinetRoot\.parentNode\.insertBefore\(flag, cabinetRoot\)/);
  assert.match(demo, /flag\.setAttribute\('aria-atomic', 'true'\)/);
  assert.match(css, /@media \(max-width: 920px\)[\s\S]*?\.account-demo-flag \{[\s\S]*?position: static;/);
  assert.match(css, /@media \(max-width: 920px\)[\s\S]*?\.account-demo-flag \{[\s\S]*?bottom: auto;/);
  assert.match(css, /@media \(max-width: 920px\)[\s\S]*?\.account-demo-flag\.is-pulse \{[\s\S]*?animation: none;/);
});

test('signed-out entry fixture is local and never starts real authentication', () => {
  assert.match(demo, /demoName === 'entry'/);
  assert.match(demo, /identified: function \(\) \{ return false; \}/);
  assert.match(demo, /email_login: true, vk_login: false, mailru_login: false, max_login: false/);
  assert.match(demo, /S\.resumeTgLogin = function \(\) \{ return null; \}/);
  assert.match(dashboard, /ui=alexey-entry5/);
});
