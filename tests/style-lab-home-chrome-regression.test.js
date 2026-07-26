const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const homeCss = fs.readFileSync(path.join(root, 'assets/css/polish15-home.css'), 'utf8');
const chromeCss = fs.readFileSync(path.join(root, 'assets/css/polish15-chrome.css'), 'utf8');
const mobileCss = fs.readFileSync(path.join(root, 'assets/css/mobile.css'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
const baseChromeCss = fs.readFileSync(path.join(root, 'assets/css/chrome.css'), 'utf8');
const polishChromeJs = fs.readFileSync(path.join(root, 'assets/js/polish15-chrome.js'), 'utf8');

test('home typography keeps the approved style-lab measures', () => {
  assert.match(
    homeCss,
    /\.polish15-home h1,[\s\S]*?font-weight:470;/,
    'editorial headings must retain the approved 470 weight',
  );
  assert.match(
    homeCss,
    /@media\(max-width:620px\)\{[\s\S]*?\.polish15-home \.home-hero h1\{\s*font-size:clamp\(40px,9\.5vw,46px\);/,
    'mobile home H1 must retain the approved 40–46px clamp',
  );
  const homeRoot = homeCss.match(/\.polish15-home\{([^}]*)\}/);
  assert.ok(homeRoot, 'home root rule must exist');
  assert.doesNotMatch(homeRoot[1], /padding-top:/, 'home must begin directly below the shared chrome');
});

test('desktop chrome keeps the approved control geometry', () => {
  for (const rule of [
    /body \.site-header \.brand__mark\{[\s\S]*?width:39px;[\s\S]*?height:39px;/,
    /body \.site-header \.primary-nav\{ gap:26px; \}/,
    /body \.site-header \.header-action,[\s\S]*?min-height:38px;/,
    /body \.site-header \.header-theme-toggle,[\s\S]*?width:38px;[\s\S]*?height:38px;/,
    /body \.site-header \.site-header__actions \.button\{[\s\S]*?min-height:40px;[\s\S]*?gap:12px;/,
  ]) {
    assert.match(chromeCss, rule);
  }
});

test('chrome icons and theme transition remain identical to style-lab', () => {
  assert.match(appJs, /aria-hidden="true">⌕<\/span>/);
  assert.match(appJs, /data-theme-glyph data-theme-icon="dark"/);
  assert.match(appJs, /class="ha-theme-night"/);
  assert.match(appJs, /class="ha-theme-sun"/);
  assert.match(appJs, /g\.setAttribute\('data-theme-icon', mode === 'dark' \? 'light' : 'dark'\)/);
  assert.doesNotMatch(appJs, /☀|🌞/);
  assert.match(
    chromeCss,
    /\.ha-ico--theme\[data-theme-icon="dark"\] \.ha-theme-sun,[\s\S]*?opacity:0;/,
  );
});

test('production shell keeps the approved light and dark palette', () => {
  for (const token of [
    '--canvas:#F3EEE4',
    '--paper:#FAF6EE',
    '--sheet:#FFFDF8',
    '--ink:#1D1C18',
    '--text:#38352F',
    '--hairline:#D8CEBD',
    '--wax:#A63F29',
  ]) {
    assert.ok(chromeCss.includes(token), `${token} must match the approved light palette`);
  }
  for (const token of [
    '--canvas:#171714',
    '--sheet:#24221D',
    '--ink:#F2ECDF',
    '--text:#D0C8BA',
    '--hairline:#3C3932',
    '--wax:#C65B41',
  ]) {
    assert.ok(chromeCss.includes(token), `${token} must match the approved dark palette`);
  }
  assert.doesNotMatch(
    homeCss.match(/\.polish15-home\{([^}]*)\}/)[1],
    /--(?:canvas|text|muted|quiet|line):/,
    'home must inherit the exact concept-shell palette',
  );
});

test('footer retains the approved compact link set and theme control', () => {
  const footer = appJs.slice(appJs.indexOf('Salon.footerHTML'), appJs.indexOf('Salon.footerHTML') + 3000);
  assert.doesNotMatch(footer, /Клуб и бонусы|Подарочный сертификат/);
  assert.match(
    baseChromeCss,
    /\.site-footer__bottom \.theme-toggle\{[\s\S]*?display:inline-block;[\s\S]*?min-height:0;[\s\S]*?padding:2px 6px 3px;/,
  );
});

test('tablet and phone appbar lockups retain their approved heights', () => {
  assert.match(
    mobileCss,
    /@media screen and \(min-width:621px\) and \(max-width:920px\)\{\s*\.mobile-appbar__brand\{min-height:0\}/,
  );
  assert.match(mobileCss, /\.mobile-appbar__brand\{[\s\S]*?min-height:44px;/);
  assert.match(mobileCss, /--mobile-dock-h:calc\(74px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(mobileCss, /body\{padding-bottom:calc\(var\(--mobile-dock-h\) \+ 16px\)\}/);
  assert.match(mobileCss, /body\.no-mcta,[\s\S]*?body\.is-admin-route\{padding-bottom:0\}/);
  assert.match(
    homeCss,
    /@media\(max-width:920px\)\{[\s\S]*?--gutter:max\(18px,env\(safe-area-inset-left\)\);[\s\S]*?--section:64px;/,
  );
  assert.match(homeCss, /\.polish15-home \.situation-grid\{\s*grid-template-columns:1fr;/);
  assert.match(homeCss, /\.polish15-home \.service-card__link\{[\s\S]*?padding:22px;/);
  assert.match(homeCss, /\.polish15-home \.project-ledger\{[\s\S]*?width:min\(100%,620px\);/);
  assert.match(homeCss, /\.polish15-home \.project-ledger__paper\{ padding:24px; \}/);
  assert.doesNotMatch(polishChromeJs, /collapseOnPhone|document-reveal\[open\]/);
  assert.match(
    homeCss,
    /@media\(max-width:620px\)\{[\s\S]*?\.polish15-home \.evidence-section,[\s\S]*?\.polish15-home \.process-section,[\s\S]*?\.polish15-home \.calm-cta,[\s\S]*?\.polish15-home ~ \.site-footer\{[\s\S]*?display:none;/,
    'the mobile home must retain the approved compact section set',
  );
  assert.match(homeCss, /\.polish15-home \.home-library__articles a:nth-child\(n \+ 3\)\{\s*display:none;/);
  assert.match(homeCss, /\.polish15-home \.testimonial-section__grid\{ gap:28px; \}/);
  assert.match(homeCss, /\.polish15-home \.testimonial-section__quote\{ padding-left:0; \}/);
});

test('mobile consent replaces the dock without keeping its empty floor', () => {
  assert.match(
    mobileCss,
    /:root\.has-consent-bar \.mobile-dock\{[\s\S]*?visibility:hidden;/,
  );
  assert.match(
    mobileCss,
    /:root\.has-consent-bar \.lrail\{\s*bottom:max\(8px,env\(safe-area-inset-bottom\)\);/,
  );
  assert.match(
    mobileCss,
    /:root\.has-consent-bar \.lrail \.cookiebar>p\{[\s\S]*?display:block;[\s\S]*?-webkit-line-clamp:unset;[\s\S]*?font-size:13\.5px;/,
  );
  assert.match(
    mobileCss,
    /:root\.has-consent-bar \.lrail \.cookiebar \.cb-actions \.btn\{\s*min-height:50px;/,
  );
});
