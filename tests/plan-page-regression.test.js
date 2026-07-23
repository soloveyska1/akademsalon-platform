const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const plan = fs.readFileSync(path.join(root, 'plan.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
const extras = fs.readFileSync(path.join(root, 'assets/js/extras.js'), 'utf8');
const configurator = fs.readFileSync(path.join(root, 'configurator.html'), 'utf8');
const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');

test('первый экран показывает результат и честно отделяет заявку от оплаты', () => {
  assert.match(plan, /Сначала — ясная структура/);
  assert.match(plan, /Сейчас ничего не списываем/);
  assert.match(plan, /рабочий комплект для согласования/);
  assert.match(plan, /ОБЕЗЛИЧЕННЫЙ ФРАГМЕНТ/);
});

test('страница использует семантический main и настоящие списки процесса', () => {
  assert.match(plan, /<main id="main" tabindex="-1">/);
  assert.match(plan, /<ol class="pl-process">/);
  assert.doesNotMatch(plan, /<span class="t">[\s\S]*?<p>/);
  assert.match(plan, /class="pl-boundaries" aria-labelledby="planBoundariesTitle"/);
  assert.doesNotMatch(plan, /id="planExample"[^>]+aria-live/);
});

test('все CTA сохраняют услугу, выбранный тип и промокод', () => {
  assert.equal((plan.match(/<a[^>]+data-plan-cta/g) || []).length, 2);
  assert.match(plan, /href="configurator\.html\?service=pl"/);
  assert.match(plan, /if \(typeChosen\) href \+= '&work=' \+ encodeURIComponent\(active\)/);
  assert.match(plan, /if \(promo\) href \+= '&promo=' \+ encodeURIComponent\(promo\)/);
  assert.match(plan, /var mobileCta = document\.querySelector\('\.mnav \.mn-calc'\)/);
  assert.match(plan, /mobileCta\.href = ctaHref\(\)/);
});

test('выбранный пример передаётся в формуляр и управляет ценой', () => {
  for (const value of ['course', 'diplom', 'master', 'candidate']) {
    assert.match(plan, new RegExp(`data-plan-type="${value}"`));
  }
  assert.match(configurator, /var workFromPage = new URLSearchParams\(location\.search\)\.get\('work'\)/);
  assert.match(configurator, /svcAnswers\.work = workFromPage/);
  assert.match(plan, /price:'5 000 ₽'/);
});

test('мобильный док plan.html ведёт прямо в разбор', () => {
  assert.match(app, /var planLanding = here === 'plan\.html'/);
  assert.match(app, /planLanding \? 'configurator\.html\?service=pl' : 'configurator\.html'/);
  assert.match(app, /var mnCalcLabel = planLanding \? 'Разбор' : 'Смета'/);
  assert.match(extras, /if \(here === 'plan\.html'\) return;/);
});

test('видимый FAQ совпадает с FAQPage schema', () => {
  const visible = [...plan.matchAll(/<details class="faq-item">\s*<summary>([^<]+)<\/summary>/g)]
    .map((match) => match[1].trim());
  const jsonLd = [...plan.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
  const faq = jsonLd.find((entry) => entry['@type'] === 'FAQPage');
  assert.ok(faq);
  assert.deepEqual(faq.mainEntity.map((entry) => entry.name), visible);
});

test('метаданные и sitemap обновлены для новой страницы', () => {
  const title = plan.match(/<title>([^<]+)<\/title>/)[1];
  const description = plan.match(/<meta name="description" content="([^"]+)"/)[1];
  assert.ok(title.length <= 80, `title too long: ${title.length}`);
  assert.ok(description.length <= 160, `description too long: ${description.length}`);
  assert.match(plan, /<meta name="theme-color" content="#F6F1E7"/);
  assert.match(sitemap, /<loc>https:\/\/akademsalon\.ru\/plan\.html<\/loc><lastmod>2026-07-24<\/lastmod>/);
});
