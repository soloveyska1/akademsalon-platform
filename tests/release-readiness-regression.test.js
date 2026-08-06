const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('stage tabs use an allowed tabpanel host and the review preview has intrinsic size', () => {
  const home = read('index.html');
  assert.equal((home.match(/<section class="case-stage-panel/g) || []).length, 4);
  assert.doesNotMatch(home, /<article[^>]+role="tabpanel"/);
  assert.match(
    home,
    /review-14\.webp"[^>]+width="720"[^>]+height="402"/,
  );
});

test('home follows the client decision sequence and keeps its brand concept durable', () => {
  const home = read('index.html');
  const story = read('assets/css/home-story.css');
  const concept = read('docs/HOME-BRAND-CONCEPT.md');

  for (const phrase of [
    'Что будет готово',
    'О задаче не придётся рассказывать заново',
    'Что согласуем письменно',
    'Посмотрите, кому доверяете работу',
    'Что ещё важно знать',
    'Разобрать мою ситуацию',
  ]) {
    assert.match(home, new RegExp(phrase));
  }
  assert.doesNotMatch(home, /case-continuity/);
  assert.match(home, /Посмотреть репетицию «Комиссия №0»/);
  assert.doesNotMatch(home, /commission0-feature--inline/);
  assert.doesNotMatch(home, /case-confidence__actions/);
  assert.doesNotMatch(home, /case-proof__story/);
  assert.match(story, /\.home-case \.case-confidence\{/);
  assert.match(story, /\.home-case \.case-file__control\{/);
  assert.match(story, /\.home-case \.case-faq__grid\{/);
  assert.match(concept, /--paper.*#E9DDCC/);
  assert.match(concept, /Literata.*--serif/);
  assert.match(concept, /Golos Text.*--sans/);
  assert.match(concept, /JetBrains Mono.*--mono/);
  assert.match(concept, /Не используем в клиентском тексте/);
});

test('reviews use lightweight thumbnails while retaining full evidence for the lightbox', () => {
  const reviews = read('reviews.html');
  const thumbnailRefs = [...reviews.matchAll(
    /<img src="assets\/img\/reviews\/thumbs\/review-\d+\.webp"[^>]+width="\d+"[^>]+height="\d+"/g,
  )];
  const fullRefs = [...reviews.matchAll(
    /data-full="assets\/img\/reviews\/review-\d+\.webp"/g,
  )];
  assert.equal(thumbnailRefs.length, 48);
  assert.equal(fullRefs.length, 48);
  assert.equal((reviews.match(/loading="eager"/g) || []).length, 1);
  assert.equal((reviews.match(/fetchpriority="high"/g) || []).length, 1);
  assert.equal(fs.readdirSync(path.join(root, 'assets/img/reviews/thumbs')).length, 48);
});

test('social preview is the exact share-card size and stays within its payload budget', () => {
  const file = path.join(root, 'assets/img/og-cover-v4.png');
  const image = fs.readFileSync(file);
  assert.equal(image.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
  assert.ok(image.length < 1_300_000, `OG image is too large: ${image.length} bytes`);
});

test('horizontal comparison is a keyboard reachable named region', () => {
  const formats = read('vedenie.html');
  assert.match(
    formats,
    /class="comparison-table" tabindex="0" role="region" aria-label="Сравнение форматов сопровождения"/,
  );
});

test('consent choice stays compact, equal and non-blocking', () => {
  const extras = read('assets/js/extras.js');
  const mobile = read('assets/css/mobile.css');
  assert.match(extras, /Обезличенную аналитику включим только с вашего разрешения/);
  assert.match(mobile, /:root\.has-consent-bar \.lrail\{[\s\S]*?width:min\(1030px,calc\(100vw - 40px\)\)/);
  assert.match(mobile, /grid-template-areas:\s*"head copy actions"\s*"head foot actions"/);
  assert.match(mobile, /:root\.has-consent-bar \.lrail \.cookiebar \.cb-kicker\{\s*display:none/);
  assert.match(mobile, /grid-template-columns:1fr 1fr/);
});

test('saved-draft card resets the legacy night palette in both themes', () => {
  const ecosystem = read('assets/css/home-ecosystem.css');
  assert.match(
    ecosystem,
    /\.home-case \.resume-card\{[\s\S]*?background:var\(--case-sheet\);[\s\S]*?color:var\(--ink\);/,
  );
  assert.match(
    ecosystem,
    /\.home-case \.resume-card__seal\{[\s\S]*?background:transparent;[\s\S]*?box-shadow:none;[\s\S]*?color:var\(--wax\);/,
  );
  assert.match(
    ecosystem,
    /\.home-case \.resume-card h2\{[\s\S]*?color:var\(--ink\);/,
  );
  assert.match(
    ecosystem,
    /\.home-case \.resume-card \.eyebrow\{\s*color:var\(--ink-soft\);/,
  );
});

test('home release build pins its compiler and complete ordered source set', () => {
  const build = read('scripts/build-home-release.mjs');
  assert.match(build, /const esbuildVersion = '0\.28\.1'/);
  assert.match(build, /const purgeCssVersion = '7\.0\.2'/);
  for (const source of [
    'assets/css/styles.css',
    'assets/css/chrome.css',
    'assets/css/polish15-chrome.css',
    'assets/css/extras.css',
    'assets/css/polish15-home.css',
    'assets/css/commission-zero.css',
    'assets/css/home-intro.css',
    'assets/css/home-ecosystem.css',
    'assets/css/mobile.css',
    'assets/css/home-story.css',
    'assets/js/app.js',
    'assets/js/polish15-chrome.js',
    'assets/js/extras.js',
    'assets/js/home-intro.js',
    'assets/js/home-ecosystem.js',
  ]) {
    assert.match(build, new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('home loads only the reproducible release bundles', () => {
  const home = read('index.html');
  // OUT-003 moves both generated bundles in the same shared-shell cache wave.
  // OUT-005 rebuilds only JS after the route-context source changes.
  // OUT-007 keeps its shared search wave; release103 adds a CSS-only trigger marker.
  // This check also proves that home loads only the generated bundles.
  assert.match(home, /assets\/css\/home-release\.min\.css\?v=20260806shell116&amp;search=20260803out007search1&amp;trigger=20260803out007trigger1&amp;contrast=20260804contrast1&amp;wax=20260804wax1&amp;hdr=20260804hdr2&amp;sheen=20260804sheen2&amp;glass=20260804glass1&amp;ask=20260804ask1&amp;ask=20260804ask2" data-mobile-edition="1"/);
  assert.match(home, /assets\/js\/home-release\.min\.js\?v=20260806services113/);
  assert.doesNotMatch(home, /assets\/css\/(?:styles|chrome|polish15-chrome|extras|polish15-home|commission-zero|home-intro|home-ecosystem|mobile)\.css/);
  assert.doesNotMatch(home, /assets\/js\/(?:app|polish15-chrome|extras|home-intro|home-ecosystem)\.js/);
});

test('home interactions connect meaning instead of adding decorative motion', () => {
  const home = read('index.html');
  const ecosystem = read('assets/js/home-ecosystem.js');

  assert.equal((home.match(/data-case-process-step="/g) || []).length, 4);
  assert.equal((home.match(/data-case-file-step="/g) || []).length, 0);
  assert.equal((home.match(/data-case-file-(?:kicker|title|copy)/g) || []).length, 3);
  assert.match(ecosystem, /function linkProcessStep\(step\)/);
  assert.match(ecosystem, /function keepOneOpen\(selector\)/);
  assert.match(ecosystem, /new IntersectionObserver/);
  assert.ok((home.match(/data-story-reveal/g) || []).length >= 3);
  assert.doesNotMatch(home, /Создали специально для вас|самостоятельная альтернатива|Проект с нуля/);
});

test('phone review link can deliberately preserve the desktop composition', () => {
  const home = read('index.html');
  assert.match(home, /<meta id="viewportMeta" name="viewport"/);
  assert.match(home, /get\('desktop-preview'\) === '1'/);
  assert.match(home, /setAttribute\('content', 'width=1440'\)/);
  assert.match(home, /document\.documentElement\.dataset\.desktopPreview = 'true'/);
});

test('privacy confirmation and saved progress never replace one another', () => {
  const home = read('index.html');
  const extras = read('assets/js/extras.js');
  const mobile = read('assets/css/mobile.css');
  assert.match(home, /data-resume-typed aria-hidden="true">Ваш прогресс бережно сохранён<\/strong>/);
  assert.match(extras, /function showChoiceSaved\(analytics\)/);
  assert.match(extras, /title\.textContent = 'Настройки приватности сохранены'/);
  assert.match(extras, /setTimeout\(closeBar, reduceMotion \? 500 : 1400\)/);
  assert.match(extras, /if \(!S\.consent\.read\(\)\) showBar\(\)/);
  assert.match(extras, /if \(!S\.consent\.read\(\)\) return;/);
  assert.doesNotMatch(extras, /showConsentPreviewAlways/);
  assert.doesNotMatch(extras, /salon:consent-complete/);
  assert.match(extras, /var finalText = 'Ваш прогресс бережно сохранён'/);
  assert.doesNotMatch(extras, /сохраненн/);
  assert.match(mobile, /:root\.has-resume-rail \.lrail\{/);
  assert.match(mobile, /body \.resume-card\.is-consent-waiting\{\s*display:none!important;/);
  assert.match(mobile, /body \.resume-card\.is-rail-resume\{[\s\S]*?width:min\(820px,100%\);/);
  assert.match(mobile, /body \.resume-card__action\{[\s\S]*?background:var\(--wax\)!important;/);
});

test('services saved progress stays a single inline card at tablet widths', () => {
  const services = read('services.html');
  const catalog = read('assets/css/polish15-catalog.css');

  assert.match(services, /data-resume-inline aria-label="Продолжить сохранённый подбор"/);
  assert.match(services, /class="resume-card__folio"[^>]*><svg/);
  assert.match(services, /<span class="resume-card__kicker">Сохранённый подбор<\/span>/);
  assert.match(
    services,
    /<strong data-resume-type>Тип работы<\/strong><span class="resume-card__detail">Шаг <span data-resume-step>1<\/span> из 3<\/span>/,
  );
  assert.doesNotMatch(services, /class="resume-card__typed" data-resume-typed/);
  assert.match(
    catalog,
    /@media\(max-width:920px\)\{[\s\S]*?body \.p15-catalog \.catalog-resume\.is-rail-resume\.is-home-inline-resume\{[\s\S]*?grid-template-columns:34px minmax\(0,1fr\) auto;/,
  );
  assert.match(
    catalog,
    /body \.p15-catalog \.catalog-resume \.resume-card__action-label\{[\s\S]*?position:static!important;/,
  );
});

test('header and guided entry use one editorial hierarchy', () => {
  const home = read('index.html');
  const app = read('assets/js/app.js');
  const mobile = read('assets/css/mobile.css');
  const guided = read('assets/css/home-guided.css');
  const hero = home.slice(home.indexOf('<section class="case-hero"'), home.indexOf('<section class="guided-situations'));
  const situations = home.slice(home.indexOf('<section class="guided-situations'), home.indexOf('<section class="guided-results'));

  assert.match(home, /class="home polish15-home home-case home-guided"/);
  assert.match(home, /<h1 id="caseHeroTitle"><span>Не нужно разбираться<\/span><em>во всём сразу\.<\/em><\/h1>/);
  assert.equal((hero.match(/class="hero-act__cta/g) || []).length, 2);
  assert.match(hero, /Подобрать следующий шаг/);
  assert.match(hero, /Услуги и цены/);
  assert.match(hero, /class="guided-passport"/);
  assert.match(hero, /class="case-scope-deck"[^>]+hidden aria-hidden="true"/);
  assert.equal((situations.match(/<a href=/g) || []).length, 3);
  assert.match(app, /<span>Гайды и инструменты<\/span><strong>Проверить самостоятельно<\/strong>/);
  assert.doesNotMatch(mobile, /body \.site-header\{\s*background:var\(--paper\)!important;/);
  assert.match(mobile, /background:color-mix\(in srgb,var\(--paper\) 14%,transparent\)!important;/);
  assert.match(guided, /--guided-wax:#a63f29/);
  assert.match(guided, /:root\[data-theme="dark"\] \.home-guided\{[\s\S]*?--guided-canvas:#15110e/);
  assert.match(guided, /@media \(max-width:620px\)\{[\s\S]*?\.home-guided \.hero-act__actions\{[\s\S]*?grid-template-columns:1fr/);
  assert.match(guided, /\.home-guided \[hidden\]\{[\s\S]*?display:none !important/);
});

test('the shared search and menu dialogs close explicitly on Escape', () => {
  const chrome = read('assets/js/polish15-chrome.js');
  assert.match(
    chrome,
    /if \(\(e\.key === 'Escape' \|\| e\.keyCode === 27\) && anyOpen\(\)\) \{[\s\S]*?e\.preventDefault\(\);[\s\S]*?closeAll\(\);/,
  );
});

test('shared dialogs restore focus to the exact trigger that opened them', () => {
  const app = read('assets/js/app.js');
  const chrome = read('assets/js/polish15-chrome.js');
  assert.match(app, /Salon\.toc\.open\(t\)/);
  assert.match(app, /Salon\.toc\.open\(search\)/);
  assert.match(chrome, /openSearch\(hit\)/);
  assert.match(
    chrome,
    /open: function \(trigger\) \{[\s\S]*?openDialog\(menuDlg, activeTrigger\);/,
  );
  assert.match(
    chrome,
    /if \(!silent && lastTrigger && lastTrigger\.focus && document\.contains\(lastTrigger\)\) \{[\s\S]*?lastTrigger\.focus\(\);/,
  );
});

test('the 320px appbar hides the compressed brand lockup without losing its accessible text', () => {
  const mobile = read('assets/css/mobile.css');
  const app = read('assets/js/app.js');
  assert.match(
    mobile,
    /@media screen and \(max-width:350px\)\{[\s\S]*?\.mobile-appbar__brand>span\{[\s\S]*?clip-path:inset\(50%\)/,
  );
  assert.match(app, /brand__motto-default">Редакторская мастерская/);
  assert.doesNotMatch(app, /brand__motto-hover/);
  assert.doesNotMatch(app, /brand__care/);
});
