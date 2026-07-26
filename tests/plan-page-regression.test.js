const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const plan = fs.readFileSync(path.join(root, 'plan.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
const extras = fs.readFileSync(path.join(root, 'assets/js/extras.js'), 'utf8');
const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');

test('первый экран показывает предмет, результат и условия начала', () => {
  assert.match(plan, /<h1>Разбор темы и плана<\/h1>/);
  assert.match(plan, /Проверка темы, объекта, предмета, цели, задач и структуры будущей работы/);
  assert.match(plan, /от 3(?: |\s)000(?: |\s)₽/);
  assert.match(plan, /письменный разбор/);
});

test('страница использует единственный main и финальные блоки услуги', () => {
  assert.equal((plan.match(/<main\b/g) || []).length, 1);
  assert.match(plan, /<main class="p15-service" id="main" tabindex="-1"/);
  assert.match(plan, /<ol class="vertical-process">/);
  assert.match(plan, /class="deliverable-grid"/);
  assert.match(plan, /class="price-composition"/);
  assert.doesNotMatch(plan, /data-p15-plan-compatibility|class="pl-process"|class="pl-boundaries"/);
});

test('все CTA открывают утверждённый сценарий заявки на разбор плана', () => {
  assert.equal((plan.match(/<a[^>]+data-plan-cta/g) || []).length, 2);
  assert.equal((plan.match(/href="configurator\.html\?service=pl"/g) || []).length, 3);
  assert.doesNotMatch(plan, /data-plan-type|typeChosen|salon_plan/);
});

test('стоимость и результат не подменяются устаревшим интерактивным примером', () => {
  assert.match(plan, /Базовый ориентир/);
  assert.match(plan, /Результат помогает предметно обсудить план с научным руководителем/);
  assert.doesNotMatch(plan, /demoPrice|demoOutline|creditPrice|ОБЕЗЛИЧЕННЫЙ ФРАГМЕНТ/);
});

test('мобильный док совпадает с финальным пятираздельным концептом', () => {
  assert.match(app, /mnItem\('\/', 'Главная'/);
  assert.match(app, /mnItem\('services\.html', 'Услуги'/);
  assert.match(app, /mnItem\(mobileRouteHref, mobileRouteLabel, 'mobile-dock__seal'/);
  assert.match(app, /mnItem\('knowledge\.html', 'Библиотека'/);
  assert.match(app, /mnItem\('dashboard\.html', 'Кабинет'/);
  assert.doesNotMatch(app, /var planLanding = here === 'plan\.html'/);
  assert.match(extras, /if \(document\.body\.classList\.contains\('concept-shell'\)\) return;/);
});

test('видимый FAQ совпадает с FAQPage schema', () => {
  const visible = [...plan.matchAll(/<details(?:\s[^>]*)?>\s*<summary>([^<]+)<span/gi)]
    .map((match) => match[1].trim());
  const jsonLd = [...plan.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
  const faq = jsonLd.find((entry) => entry['@type'] === 'FAQPage');
  assert.ok(faq);
  assert.equal(visible.length, 4);
  assert.deepEqual(faq.mainEntity.map((entry) => entry.name), visible);
});

test('метаданные и sitemap обновлены для новой страницы', () => {
  const title = plan.match(/<title>([^<]+)<\/title>/)[1];
  const description = plan.match(/<meta name="description" content="([^"]+)"/)[1];
  assert.ok(title.length <= 80, `title too long: ${title.length}`);
  assert.ok(description.length <= 160, `description too long: ${description.length}`);
  assert.match(plan, /<meta name="theme-color" content="#F6F1E7"/);
  assert.match(sitemap, /<loc>https:\/\/akademsalon\.ru\/plan\.html<\/loc><lastmod>2026-07-26<\/lastmod>/);
});
