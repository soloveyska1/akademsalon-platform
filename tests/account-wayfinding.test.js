const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const cabinet = fs.readFileSync(path.join(root, 'assets/js/cabinet.js'), 'utf8');
const accountCss = fs.readFileSync(path.join(root, 'assets/css/polish15-account.css'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');

test('cabinet exposes one ordered route with compact section identity', () => {
  assert.match(cabinet, /function accountIcon\(name\)/);
  for (const icon of ['home', 'orders', 'messages', 'documents', 'wallet', 'help', 'settings']) {
    assert.match(cabinet, new RegExp(`${icon}: '<`), `missing unified ${icon} icon`);
  }
  assert.match(cabinet, /class="account-nav__more/);
  assert.match(cabinet, /class="account-nav__more-panel" aria-label="Другие разделы"/);
  assert.match(cabinet, /class="account-main__identity"/);
  assert.match(cabinet, /class="account-main__code"/);
  for (const code of ['01', '02', '03', '04', '05', '06', '07']) {
    assert.ok(cabinet.includes(`'${code}']`), `missing section code ${code}`);
  }
});

test('the messages badge counts messages, not files from another section', () => {
  const start = cabinet.indexOf('function tabBadges()');
  const end = cabinet.indexOf('function accountIcon', start);
  const source = cabinet.slice(start, end);
  assert.match(source, /unread \+= o\.unread \|\| 0/);
  assert.doesNotMatch(source, /files_new/);
});

test('desktop navigation has a strong current state without changing routes', () => {
  assert.match(accountCss, /\.account-nav nav button\.is-current\s*\{[\s\S]*?box-shadow:\s*inset 3px 0 0 var\(--wax\)/);
  assert.match(accountCss, /\.account-nav nav button\.is-current \.account-nav__glyph\s*\{[\s\S]*?background:\s*var\(--wax\)/);
  assert.match(cabinet, /data-tab="' \+ item\[0\] \+ '" aria-current="' \+ \(current \? 'page' : 'false'\)/);
});

test('new matter is primary only where creation belongs to the route', () => {
  assert.match(cabinet, /var newMatterPrimary = \(st\.tab === 'home' \|\| st\.tab === 'orders'\) &&/);
  assert.match(cabinet, /st\.orders\.length > 0 && !st\.orders\.some\(needsAction\)/);
  assert.match(cabinet, /account-head__new--seal' : 'account-head__new--quiet'/);
  assert.match(cabinet, /href="configurator\.html">Новое дело/);
  assert.match(accountCss, /WAX SEAL CTA · hall86/);
  assert.match(accountCss, /\.account-main__head > \.account-head__new--seal\s*\{[\s\S]*?background:\s*var\(--account-seal-wax\)[\s\S]*?text-transform:\s*uppercase/);
  assert.match(accountCss, /\.account-main__head > \.account-head__new--quiet\s*\{[\s\S]*?background:\s*transparent/);
  assert.match(accountCss, /\.account-main__head > \.account-head__new--seal:focus-visible\s*\{[\s\S]*?outline-offset:\s*3px/);
  assert.match(accountCss, /:root\[data-theme="dark"\] \.is-account-route \.account-head__new--seal\s*\{[\s\S]*?--account-seal-wax:\s*#9f3e2a/);
  assert.match(accountCss, /@media \(max-width: 920px\)[\s\S]*?\.account-main__head > \.account-head__new\s*\{\s*display:\s*none/);
});

test('mobile navigation keeps three core routes stable and groups the rest', () => {
  const finalLayer = accountCss.slice(accountCss.lastIndexOf('CABINET CHROME'));
  assert.match(finalLayer, /\.account-nav nav\s*\{[\s\S]*?display:\s*grid[\s\S]*?grid-template-columns:\s*repeat\(4/);
  assert.match(finalLayer, /button\.is-mobile-secondary\s*\{\s*display:\s*none/);
  assert.match(finalLayer, /\.account-nav__more-panel\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2/);
  assert.match(cabinet, /account-nav__more-new" href="configurator\.html"/);
  assert.match(finalLayer, /\.account-nav__more-panel \.account-nav__more-new\s*\{[\s\S]*?grid-column:\s*1 \/ -1/);
  assert.match(finalLayer, /body\.is-account-route \.mobile-dock\.mobile-cta\s*\{\s*display:\s*none !important/);
  assert.match(accountCss, /\.account-nav__bottom\s*\{\s*display:\s*none !important/);
  assert.match(finalLayer, /\.account-nav nav button\.is-current\s*\{[\s\S]*?box-shadow:\s*inset 0 -2px 0 var\(--wax\)/);
  assert.match(cabinet, /<summary aria-current="' \+ \(activeSecondary \? 'page' : 'false'\)/);
});

test('mobile route does not jump horizontally when the current section changes', () => {
  assert.doesNotMatch(cabinet, /var mobileCurrent/);
  assert.doesNotMatch(cabinet, /mobileNav\.scrollLeft/);
  assert.doesNotMatch(cabinet, /mobileCurrent\.scrollIntoView/);
  assert.match(cabinet, /activeSecondary \? activeSecondary\[1\] : 'Ещё'/);
});

test('wayfinding assets are cache-busted', () => {
  assert.match(dashboard, /ui=comfort97/);
  assert.match(dashboard, /ui=telegram-primary-hall97/);
});
