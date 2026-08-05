const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const words = (value) => value.trim().split(/\s+/).filter(Boolean);

const routeFamilies = {
  fixed: words(`
    404.html 50x.html about.html configurator.html dashboard.html deposit.html
    expertise.html gift.html guarantees.html index.html knowledge.html
    komissiya-0.html maintenance.html oplata.html plus.html priyomnaya.html
    prolog.html referral.html reviews.html services.html specifikaciya.html
    start.html tariffs.html tools.html vedenie.html zayavka.html
  `),
  legal: words(`
    academic-integrity.html consent-analytics.html consent-marketing.html
    consent-publication.html consent-request.html consent.html loyalty.html
    oferta.html privacy.html refunds.html requisites.html terms.html
  `),
  tools: words(`
    audit-temy-vkr.html check.html dosie-nauchruka.html
    proverka-istochnikov-vkr.html
  `),
  disciplines: words(`
    diplomnaya-po-ekonomike.html diplomnaya-po-psihologii.html
    diplomnaya-po-yurisprudencii.html kursovaya-po-ekonomike.html
    kursovaya-po-informatike.html kursovaya-po-menedzhmentu.html
    kursovaya-po-pedagogike.html kursovaya-po-psihologii.html
    kursovaya-po-yurisprudencii.html
  `),
  services: words(`
    avtorskiy-zakaz.html diplomnaya-rabota.html
    dorabotka-otcheta-po-praktike.html kandidatskaya-dissertaciya.html
    kursovaya-rabota.html magisterskaya-dissertaciya.html nauchnaya-statya.html
    normokontrol-vkr.html otchet-po-praktike.html plan.html
    razbor-zamechaniy-nauchruka.html redaktura-posle-ii.html referat.html
  `),
  guides: words(`
    guide-antiplagiat-ai.html guide-apellyaciya.html
    guide-dnevnik-praktiki.html guide-harakteristika-s-praktiki.html
    guide-kursovaya-za-nedelyu.html guide-normocontrol.html
    guide-obekt-predmet-cel-zadachi.html guide-otchet-po-praktike.html
    guide-otzyv-rukovoditelya-vkr.html
    guide-prakticheskaya-chast-kursovoy.html
    guide-prezentaciya-k-zashchite.html guide-prilozheniya-po-gost.html
    guide-recenziya-na-vkr.html guide-rech-na-zashchitu.html
    guide-rinc-statya.html guide-skolko-stoit-diplomnaya.html
    guide-skolko-stoit-kursovaya.html guide-spisok-literatury.html
    guide-temy-vkr.html guide-titulnyj-list.html guide-vkr-struktura.html
    guide-vvedenie-kursovoy.html guide-zaklyuchenie-kursovoy.html
    guide-zaklyuchenie-vkr.html guide-zashchita-diploma.html
  `),
};

const publicRoutes = Object.values(routeFamilies).flat().sort();
const adminFoundation = ['admin.html'];
const standaloneRoutes = ['admin-covers.html', 'oplaceno.html'];
const directPublicRoutes = publicRoutes.filter((file) => file !== 'index.html');
const shellReleaseKey = '20260806shell114';
const out005ReleaseKey = '20260806services113';

function assetUrl(html, asset) {
  const match = html.match(new RegExp(`(?:href|src)="(${asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\"]*)"`));
  return match && match[1].replaceAll('&amp;', '&');
}

function queryVersion(url) {
  return new URLSearchParams((url || '').split('?')[1] || '').get('v');
}

function cssBlock(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `missing CSS rule ${selector}`);
  return match[1];
}

function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const value = hex.replace('#', '');
  const rgb = [0, 2, 4].map((offset) => channel(parseInt(value.slice(offset, offset + 2), 16)));
  return (0.2126 * rgb[0]) + (0.7152 * rgb[1]) + (0.0722 * rgb[2]);
}

function contrast(left, right) {
  const a = luminance(left);
  const b = luminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test('all 92 root documents resolve to one explicit delivery and shell family', () => {
  const htmlFiles = fs.readdirSync(root).filter((file) => file.endsWith('.html')).sort();
  const declared = [...publicRoutes, ...adminFoundation, ...standaloneRoutes].sort();
  assert.equal(publicRoutes.length, 89);
  assert.equal(new Set(publicRoutes).size, 89, 'public route families must not overlap');
  assert.deepEqual(declared, htmlFiles);

  for (const file of directPublicRoutes) {
    const html = read(file);
    assert.ok(assetUrl(html, 'assets/js/app.js'), `${file}: direct app runtime`);
    assert.ok(assetUrl(html, 'assets/js/polish15-chrome.js'), `${file}: direct dialog runtime`);
    assert.ok(assetUrl(html, 'assets/css/mobile.css'), `${file}: direct mobile shell`);
  }
  assert.ok(assetUrl(read('index.html'), 'assets/js/home-release.min.js'));
  assert.ok(assetUrl(read('index.html'), 'assets/css/home-release.min.css'));
  for (const file of standaloneRoutes) {
    assert.equal(assetUrl(read(file), 'assets/js/app.js'), null, `${file}: standalone exception`);
  }
});

test('admin foundation has one Cmd/Ctrl+K owner and no public dialog runtime', () => {
  const admin = read('admin.html');
  assert.ok(assetUrl(admin, 'assets/js/app.js'));
  assert.equal(assetUrl(admin, 'assets/js/polish15-chrome.js'), null);
  assert.match(read('assets/js/admin.js'), /focusAdminSearch\(\)/);
});

test('saved theme is bootstrapped before app runtime on every public route', () => {
  for (const file of publicRoutes) {
    const html = read(file);
    const themeAt = html.indexOf('salon_theme');
    const appAt = file === 'index.html'
      ? html.indexOf('assets/js/home-release.min.js')
      : html.indexOf('assets/js/app.js');
    assert.notEqual(themeAt, -1, `${file}: missing early saved-theme bootstrap`);
    assert.ok(themeAt < appAt, `${file}: theme bootstrap must precede app runtime`);
    assert.match(html, /<meta name="theme-color"/i, `${file}: theme-color contract`);
  }
});

test('consent settings remain available on every public route and are truly modal', () => {
  for (const file of directPublicRoutes) {
    const html = read(file);
    assert.ok(assetUrl(html, 'assets/css/extras.css'), `${file}: consent presentation`);
    assert.ok(assetUrl(html, 'assets/js/extras.js'), `${file}: consent runtime`);
  }

  const app = read('assets/js/app.js');
  const extras = read('assets/js/extras.js');
  assert.match(app, /data-cookie-settings/,
    'shared footer must expose the legally promised persistent settings opener');
  assert.match(extras, /function setPrefsBackgroundInert\(active\)/);
  assert.match(extras, /node\.inert\s*=\s*true/);
  assert.match(extras, /setPrefsBackgroundInert\(true\)/);
  assert.match(extras, /setPrefsBackgroundInert\(false\)/);
  assert.match(extras, /aria-modal', 'true/);
});

test('normal-text CTA and unread badge fills use the accessible wax token', () => {
  const styles = read('assets/css/styles.css');
  const mobile = read('assets/css/mobile.css');
  const chrome = read('assets/css/chrome.css');
  const polish = read('assets/css/polish15-chrome.css');

  assert.match(styles, /--wax-cta:#B8503A/);
  assert.ok(contrast('#fff8ef', '#B8503A') >= 4.5);
  assert.ok(contrast('#FFFEF9', '#B8503A') >= 4.5);
  assert.match(
    cssBlock(mobile, 'body .site-footer__brand-actions a:first-child'),
    /background:var\(--wax-cta,var\(--wax\)\)/,
  );
  assert.match(cssBlock(polish, 'body .site-header .nav-marks .nm-n'),
    /background:var\(--wax-cta,var\(--wax\)\)/);
  assert.match(cssBlock(chrome, '.mnav .mn-badge'),
    /background:var\(--wax-cta,var\(--wax\)\)/);

  const lightTextGoldRules = [...chrome.matchAll(/\.cf7-btn--gold\{([^}]*)\}/g)]
    .map((match) => match[1])
    .filter((block) => /color:#FFFEF9/.test(block));
  assert.ok(lightTextGoldRules.length > 0);
  for (const block of lightTextGoldRules) {
    assert.match(block, /background:var\(--wax-cta,var\(--wax\)\)/);
  }
});

test('auth, footer and overlay source invariants remain explicit', () => {
  const app = read('assets/js/app.js');
  const chrome = read('assets/js/polish15-chrome.js');
  const mobile = read('assets/css/mobile.css');
  assert.match(app, /authenticated \? 'Кабинет' : \(guest \? 'Моё дело' : 'Войти'\)/);
  assert.match(app, /authenticated \? 'Личный кабинет' : \(guest \? 'Открыть моё дело' : 'Войти в личный кабинет'\)/);
  assert.match(app, /data-auth-state/);
  assert.match(app, /data-footer-group/);
  assert.match(mobile, /site-footer__group>summary[\s\S]{0,220}min-height:4[4-9]px/);
  assert.match(chrome, /returnFocus/);
  assert.match(chrome, /showModal\(\)/);
});

test('shared shell and OUT-005 runtime changes keep atomic cache waves and home parity', () => {
  const changedDirectAssets = [
    'assets/css/chrome.css',
    'assets/css/mobile.css',
    'assets/css/polish15-chrome.css',
    'assets/js/app.js',
    'assets/js/extras.js',
  ];
  for (const file of [...directPublicRoutes, ...adminFoundation]) {
    const html = read(file);
    for (const asset of changedDirectAssets) {
      const url = assetUrl(html, asset);
      if (!url) continue;
      const expected = asset === 'assets/js/app.js' ? out005ReleaseKey : shellReleaseKey;
      assert.equal(queryVersion(url), expected, `${file}: ${asset}`);
    }
  }

  const home = read('index.html');
  assert.equal(queryVersion(assetUrl(home, 'assets/css/home-release.min.css')), shellReleaseKey);
  assert.equal(queryVersion(assetUrl(home, 'assets/js/home-release.min.js')), out005ReleaseKey);
  const homeCss = read('assets/css/home-release.min.css');
  const homeJs = read('assets/js/home-release.min.js');
  assert.match(homeCss, /site-footer__brand-actions a:first-child\{[^}]*background:var\(--wax-cta,var\(--wax\)\)/);
  assert.match(homeJs, /data-cookie-settings/);
  assert.match(homeJs, /\.inert=!0/);
});
