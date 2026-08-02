const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const cabinet = fs.readFileSync(path.join(root, 'assets/js/cabinet.js'), 'utf8');
const accountCss = fs.readFileSync(path.join(root, 'assets/css/polish15-account.css'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');

test('entry presents Telegram as the only immediate authentication action', () => {
  assert.match(cabinet, /var mainAction = '<button[^']+id="cabTg">'[\s\S]*?Войти через Telegram/);
  assert.match(cabinet, /class="cab-login-trust" aria-label="Что важно о входе"/);
  assert.match(cabinet, /≈ 1 минута/);
  assert.match(cabinet, /Без пароля/);
  assert.match(cabinet, /Без потерь/);
});

test('all enabled login methods are visible while single-case access stays compact', () => {
  assert.match(cabinet, /<section class="cab-login-methods cab-login-methods--visible" aria-label="Другие способы входа">/);
  assert.match(cabinet, /Или войдите другим способом/);
  assert.match(cabinet, /<details class="cab-alt"><summary><span>Открыть одно дело по ссылке<\/span>/);
  assert.match(cabinet, /class="cab-login-methods__body"><div class="cab-prov">/);
  assert.match(cabinet, /id="cabEmailWrap" hidden/);
  assert.match(cabinet, /'X-Session-Mode':'cookie'/);
  assert.match(accountCss, /\.cab-login-methods--visible\s*\{[\s\S]*?border-top:\s*1px solid var\(--line\)/);
});

test('entry copy explains the client route instead of listing technical providers', () => {
  assert.match(cabinet, /Продолжить<br>с того же места/);
  assert.match(cabinet, /Сначала — главное/);
  assert.match(cabinet, /Затем — всё дело/);
  assert.match(cabinet, /Всегда — один маршрут/);
  assert.match(cabinet, /Откройте свой формуляр/);
});

test('pending Telegram state communicates its step and keeps an escape route', () => {
  assert.match(cabinet, /cab-login-pending__step">Шаг 2 из 2/);
  assert.match(cabinet, /id="cabTgCancel">Выбрать другой способ/);
  assert.match(accountCss, /\.cab-login-pending__step\s*\{[\s\S]*?text-transform:\s*uppercase/);
  assert.match(cabinet, /var idleMarkup = btn \? btn\.innerHTML : ''/);
  assert.match(cabinet, /btn\.innerHTML = idleMarkup/);
});

test('phone entry puts the action before the editorial story and preserves touch targets', () => {
  assert.match(accountCss, /@media \(max-width: 920px\)[\s\S]*?\.cab-login-auth\s*\{[\s\S]*?order:\s*1/);
  assert.match(accountCss, /@media \(max-width: 920px\)[\s\S]*?\.cab-login-story\s*\{[\s\S]*?order:\s*2/);
  assert.match(accountCss, /\.cab-login-main\s*\{[\s\S]*?min-height:\s*54px/);
  assert.match(accountCss, /@media \(max-width: 540px\)[\s\S]*?\.cab-email-row \.btn,[\s\S]*?min-height:\s*46px/);
});

test('loading and connection failure remain branded, named and motion-safe', () => {
  assert.match(cabinet, /class="account-entry-state account-entry-state--loading reveal"/);
  assert.match(cabinet, /class="account-loader" role="status" aria-live="polite"/);
  assert.match(cabinet, /Собираем ваш формуляр/);
  assert.match(cabinet, /class="account-entry-state account-entry-state--error"/);
  assert.match(cabinet, /Картотека не отвечает/);
  assert.match(accountCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.account-loader__line i\s*\{[\s\S]*?animation:\s*none/);
  assert.doesNotMatch(cabinet, /class="cab-skel/);
});

test('entry assets are cache-busted', () => {
  assert.match(dashboard, /ui=comfort97/);
  assert.match(dashboard, /ui=telegram-primary-hall97/);
  assert.match(dashboard, /ui=alexey-entry5/);
});
