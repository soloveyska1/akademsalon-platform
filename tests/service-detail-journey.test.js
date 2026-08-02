const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('kursovaya-rabota.html');
const css = read('assets/css/polish15-catalog.css');

test('course detail sends one explicit, prefilled intent into the configurator', () => {
  const route = 'configurator.html?work=course&amp;situation=topic&amp;result=support&amp;route=service';
  assert.equal(html.split(route).length - 1, 3);
  assert.equal((html.match(/Оценить задачу/g) || []).length, 3);
  assert.match(html, /1 минута · без оплаты/);
  assert.match(html, /<details class="price-composition__factors">/);
  assert.match(html, /Получите точный состав и цену/);
  assert.doesNotMatch(html, /savedAt\s*:\s*0|tier\s*:\s*['"]base['"]/);
});

test('course detail uses the shared dossier treatment in both themes and on mobile', () => {
  assert.match(html, /<main class="p15-service"/);
  assert.match(css, /Service dossier · the page after a catalog card/);
  assert.match(css, /\.p15-service \.service-hero__copy\{[\s\S]*?border-left:3px solid var\(--wax-p15\)/);
  assert.match(css, /\.p15-service \.service-facts\{[\s\S]*?border-top:4px solid var\(--wax-p15\)/);
  assert.match(css, /:root\[data-theme="dark"\] \.p15-service \.service-facts/);
  assert.match(css, /@media\(max-width:620px\)\{[\s\S]*?\.p15-service \.deliverable-grid\{grid-template-columns:1fr/);
});
