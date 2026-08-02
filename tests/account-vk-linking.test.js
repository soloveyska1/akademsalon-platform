const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const cabinet = fs.readFileSync(path.join(root, 'assets/js/cabinet.js'), 'utf8');
const accountCss = fs.readFileSync(path.join(root, 'assets/css/polish15-account.css'), 'utf8');

function namedFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `function ${name} must exist`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = bodyStart; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        const fnSource = source.slice(start, i + 1)
          .replace(`function ${name}`, 'function');
        return Function(`"use strict"; return (${fnSource});`)();
      }
    }
  }
  throw new Error(`unterminated function ${name}`);
}

test('OAuth navigation accepts only the exact provider authorization surfaces', () => {
  const safeOauthUrl = namedFunction(cabinet, 'safeOauthUrl');
  assert.match(
    safeOauthUrl('vk', 'https://id.vk.com/authorize?client_id=1&state=x'),
    /^https:\/\/id\.vk\.com\/authorize\?/
  );
  assert.match(
    safeOauthUrl('vk', 'https://id.vk.ru/authorize?client_id=1&state=x'),
    /^https:\/\/id\.vk\.ru\/authorize\?/
  );
  assert.match(
    safeOauthUrl('mailru', 'https://oauth.mail.ru/login?client_id=1&state=x'),
    /^https:\/\/oauth\.mail\.ru\/login\?/
  );
  for (const bad of [
    'http://id.vk.com/authorize?state=x',
    'https://id.vk.com.evil.example/authorize?state=x',
    'https://id.vk.com/not-authorize?state=x',
    'javascript:alert(1)',
    'https://example.com/authorize?state=x',
  ]) {
    assert.equal(safeOauthUrl('vk', bad), '', bad);
  }
});

test('settings uses explicit connected, pending, success and conflict states', () => {
  for (const token of [
    'account-access-item',
    'account-access-state is-linked',
    'account-access-notice',
    "status: 'pending'",
    "status: 'success'",
    'already_linked',
    'provider_linked',
    'session',
  ]) assert.ok(cabinet.includes(token), `missing ${token}`);
  assert.match(cabinet, /Подключите ещё один способ, чтобы не потерять доступ к делам/);
  assert.doesNotMatch(cabinet, /Telegram<\/b><small>основной вход/);
});

test('link-start is single-action, visibly busy and validates the returned URL', () => {
  assert.match(cabinet, /oaLink\.disabled = true/);
  assert.match(cabinet, /oaLink\.setAttribute\('aria-busy', 'true'\)/);
  assert.match(cabinet, /status: 'pending' \};\s*renderCurrent\(\)/);
  assert.match(cabinet, /pending \? 'Подключаем…' : 'Подключить'/);
  assert.match(cabinet, /S\.api\.post\('\/auth\/' \+ provider \+ '\/link-start', \{\}\)/);
  assert.match(cabinet, /var next = safeOauthUrl\(provider, r\.url\)/);
  assert.match(cabinet, /if \(!next\)[\s\S]*?переход остановлен/);
  assert.match(cabinet, /sessionStorage\.setItem\('salon_oauth_link_provider', provider\)/);
  assert.match(cabinet, /window\.location\.href = next/);
});

test('linked callback is verified against fresh account data before success is shown', () => {
  assert.match(cabinet, /st\.oauthNotice = \{ provider: oauthProvider, status: 'pending', verify: true \}/);
  assert.match(cabinet, /var verified = \(r\.oauth \|\| \[\]\)\.indexOf\(verifiedProvider\) >= 0/);
  assert.match(cabinet, /verified[\s\S]*?status: 'success'/);
  assert.match(cabinet, /sessionStorage\.removeItem\('salon_oauth_link_provider'\)/);
  assert.match(cabinet, /history\.replaceState\(null, '', location\.pathname\)/);
  assert.match(cabinet, /st\.tab = 'settings';\s*history\.replaceState\(null, '', location\.pathname \+ '#settings'\)/);
});

test('access rows remain compact and usable on dark mobile screens', () => {
  assert.match(accountCss, /\.account-access-item\s*\{[\s\S]*?min-height:\s*72px/);
  assert.match(accountCss, /\.account-access-action\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(accountCss, /\.account-access-item\.is-linked\s*\{[\s\S]*?border-color/);
  assert.match(accountCss, /\.account-access-state\.is-linked\s*\{[\s\S]*?color:\s*var\(--green\)/);
  assert.match(accountCss, /:root\[data-theme="dark"\][\s\S]*?\.account-access-notice\.is-error\s*\{[\s\S]*?color:\s*var\(--wax\)/);
  assert.match(accountCss, /@media \(max-width: 480px\)[\s\S]*?\.account-access-notice\s*\{[\s\S]*?grid-column:\s*1 \/ -1/);
  assert.match(accountCss, /@media \(max-width: 480px\)[\s\S]*?\.account-access-action\s*\{[\s\S]*?grid-column:\s*1 \/ -1/);
  assert.match(accountCss, /@media \(max-width: 540px\)[\s\S]*?\.cab-login-methods--visible \.cab-prov,[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
});
