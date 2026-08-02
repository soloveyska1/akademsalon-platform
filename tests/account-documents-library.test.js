const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const cabinet = fs.readFileSync(path.join(root, 'assets/js/cabinet.js'), 'utf8');
const accountCss = fs.readFileSync(path.join(root, 'assets/css/polish15-account.css'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');

test('document library starts with a compact factual summary', () => {
  assert.match(cabinet, /function documentSummary\(groups\)/);
  assert.match(cabinet, /class="account-document-summary reveal"/);
  for (const label of ['Материалы', 'Новые', 'Оплата']) {
    assert.ok(cabinet.includes(label), `missing document summary label ${label}`);
  }
  assert.match(accountCss, /\.account-document-summary\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3/);
});

test('files are grouped into a two-column case folder library', () => {
  assert.match(cabinet, /class="account-document-folders"/);
  assert.match(cabinet, /class="account-docgroup' \+ \(o\.files_new \? ' account-docgroup--fresh'/);
  assert.match(cabinet, /class="account-docgroup__identity"/);
  assert.match(cabinet, /class="account-docgroup__count"/);
  assert.match(accountCss, /\.account-document-folders\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2/);
  assert.match(accountCss, /\.account-docgroup--fresh\s*\{[\s\S]*?box-shadow:\s*inset 3px 0 0 var\(--wax\)/);
});

test('payment confirmations live in the library side journal', () => {
  assert.match(cabinet, /account-payment-documents/);
  assert.match(cabinet, /class="account-document-receipts"/);
  assert.match(cabinet, /class="account-document-note"/);
  assert.match(cabinet, /<summary>О подтверждении и налоговом чеке<\/summary>/);
  assert.match(accountCss, /\.account-document-receipts\s*\{[\s\S]*?position:\s*sticky/);
});

test('document library collapses cleanly on tablets and keeps a compact phone summary', () => {
  assert.match(accountCss, /@media \(max-width: 1120px\)[\s\S]*?\.account-document-layout[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(accountCss, /@media \(max-width: 760px\)[\s\S]*?\.account-document-folders[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(accountCss, /@media \(max-width: 620px\)[\s\S]*?\.account-document-summary p\s*\{[\s\S]*?display:\s*none/);
});

test('document library assets are cache-busted', () => {
  assert.match(dashboard, /ui=comfort97/);
  assert.match(dashboard, /ui=telegram-primary-hall97/);
});
