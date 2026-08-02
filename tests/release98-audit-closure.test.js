const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const catalogCss = read('assets/css/polish15-catalog.css');
const libraryCss = read('assets/css/polish15-library.css');
const chromeCss = read('assets/css/polish15-chrome.css');
const configuratorCss = read('assets/css/polish15-configurator.css');
const accountCss = read('assets/css/polish15-account.css');
const aboutCss = read('assets/css/about-rebuild.css');
const configurator = read('configurator.html');

test('audited standalone controls keep the 44px comfort floor', () => {
  for (const rule of [
    /\.p15-catalog \.line-link,[\s\S]*?min-height: 44px;/,
    /\.p15-catalog \.filter-tabs button \{[\s\S]*?min-height: 44px;/,
    /\.p15-catalog \.catalog-search input \{[\s\S]*?height: 44px;/,
    /\.p15-catalog \.price-row > button \{[\s\S]*?height: 44px;/,
  ]) assert.match(catalogCss, rule);

  assert.match(libraryCss, /\.filter-tabs button\{\s*min-height:44px;/);
  assert.match(chromeCss, /site-footer__group>summary\{[\s\S]*?min-height:44px;/);
  assert.match(chromeCss, /site-footer__links a\{[\s\S]*?min-height:44px;/);
  assert.match(chromeCss, /site-footer__bottom \.theme-toggle\{\s*min-width:44px;\s*min-height:44px;/);
  assert.match(configuratorCss, /\.tx-wizard-help button\{[\s\S]*?min-height:44px;/);
  assert.match(configuratorCss, /\.configurator-task \.line-link\{[\s\S]*?min-height:44px;/);
  assert.match(accountCss, /\.account-document-note > summary \{[\s\S]*?min-height:44px;/);
});

test('narrow service and about grids cannot retain an oversized min-content track', () => {
  assert.match(
    catalogCss,
    /@media \(max-width:920px\)[\s\S]*?\.p15-service \.service-hero,[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/,
  );
  assert.match(
    catalogCss,
    /\.p15-service \.service-hero__copy,[\s\S]*?\.p15-service \.service-facts \{\s*min-width: 0;/,
  );
  assert.match(
    catalogCss,
    /\.p15-service \.service-hero__copy \{\s*grid-template-columns: minmax\(0, 1fr\);/,
  );
  assert.match(catalogCss, /\.p15-service \.service-hero h1 \{\s*overflow-wrap: anywhere;/);
  assert.match(
    aboutCss,
    /@media\(max-width:900px\)\{\s*\.ar-editorial__grid\{\s*grid-template-columns:minmax\(0,1fr\);/,
  );
  assert.match(aboutCss, /@media\(max-width:900px\)[\s\S]*?\.ar-work-grid\{grid-template-columns:minmax\(0,1fr\)\}/);
});

test('deadline and contact feedback stay live without forcing a rerender', () => {
  assert.match(configurator, /<dd data-summary-date>/);
  assert.match(configurator, /data-deadline-reason/);
  assert.match(configurator, /data-concept-contact-hint/);
  assert.match(configurator, /var footerNext = host\.querySelector\('\.wizard-main__footer \[data-concept-next\]'\)/);
  assert.match(configurator, /footerReason\.textContent = barReason;\s*footerReason\.hidden = !barReason;/);
  assert.match(configurator, /if \(summaryDate\) summaryDate\.textContent = dateText;/);
  assert.match(configurator, /contactInput\.setAttribute\('aria-invalid','true'\)/);
  assert.match(configurator, /contactHint\.hidden = !contactIssue;/);
});
