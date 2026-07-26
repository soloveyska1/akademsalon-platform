const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const reference = read('style-lab/full/style.css');
const home = read('assets/css/polish15-home.css');
const catalog = read('assets/css/polish15-catalog.css');
const library = read('assets/css/polish15-library.css');
const account = read('assets/css/polish15-account.css');

test('home review proof keeps the final canonical crop', () => {
  assert.match(
    reference,
    /\.testimonial-section__result > img\s*\{[\s\S]*?max-height:\s*180px;[\s\S]*?border:\s*1px solid var\(--line\);/,
  );
  assert.match(
    home,
    /\.polish15-home \.testimonial-section__result > img\s*\{[\s\S]*?max-height:180px;[\s\S]*?border:1px solid var\(--line\);/,
  );
  assert.doesNotMatch(home, /\.testimonial-section__result(?: >)? img\s*\{[\s\S]*?max-height:260px;/);
});

test('services and knowledge retain the canonical desktop compositions', () => {
  assert.match(
    catalog,
    /\.p15-catalog \.service-card-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);[\s\S]*?gap:\s*14px;/,
  );
  assert.match(
    catalog,
    /\.p15-catalog \.service-card\s*\{[\s\S]*?min-height:\s*390px;/,
  );
  assert.match(
    library,
    /body\.polish15-library \.featured-guide\s*\{[\s\S]*?grid-template-columns:minmax\(0,1fr\) minmax\(380px,\.82fr\);[\s\S]*?min-height:430px;/,
  );
  assert.match(
    library,
    /body\.polish15-library \.article-card > a\s*\{[\s\S]*?min-height:350px;/,
  );
});

test('cabinet heading and summary use the canonical measures', () => {
  assert.match(
    account,
    /\.is-account-route \.account-main__head\s*\{[\s\S]*?gap:\s*30px;/,
  );
  assert.match(
    account,
    /\.is-account-route \.account-main__head h1\s*\{[\s\S]*?margin-top:\s*9px;[\s\S]*?font-size:\s*clamp\(38px,\s*4\.6vw,\s*58px\);[\s\S]*?line-height:\s*1\.08;/,
  );
  assert.match(
    account,
    /\.is-account-route \.account-summary\s*\{[\s\S]*?margin-top:\s*38px;/,
  );
  assert.match(
    account,
    /\.is-account-route \.account-summary article\s*\{[\s\S]*?min-height:\s*112px;[\s\S]*?gap:\s*3px;[\s\S]*?padding:\s*20px 24px;/,
  );
  assert.match(account, /\.account-summary article > strong\s*\{[\s\S]*?font:\s*500 30px\/1\.1 var\(--serif\);/);
});

test('cabinet benefit cards are full canonical sheets, not compact substitutes', () => {
  assert.match(
    account,
    /\.is-account-route \.account-benefit-card\s*\{[\s\S]*?min-height:\s*168px;[\s\S]*?gap:\s*14px;[\s\S]*?align-items:\s*start;[\s\S]*?padding:\s*20px;/,
  );
  assert.match(account, /\.account-benefit-card small\s*\{[\s\S]*?font-size:\s*11px;/);
  assert.match(account, /\.account-benefit-card strong\s*\{[\s\S]*?font:\s*500 25px\/1\.15 var\(--serif\);/);
  assert.match(account, /\.account-benefit-card p\s*\{[\s\S]*?font-size:\s*11px;[\s\S]*?line-height:\s*1\.48;/);
  assert.match(
    account,
    /@media \(max-width:\s*1100px\)\s*\{[\s\S]*?\.account-benefits > div\s*\{[\s\S]*?grid-template-columns:\s*1fr;/,
  );
  assert.match(
    account,
    /@media \(max-width:920px\)\s*\{[\s\S]*?\.account-benefit-card\s*\{[\s\S]*?min-height:\s*140px;[\s\S]*?grid-template-columns:\s*38px minmax\(0,\s*1fr\) auto;[\s\S]*?padding:\s*17px;/,
  );
});
