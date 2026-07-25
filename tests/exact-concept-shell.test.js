const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const app = read('assets/js/app.js');
const extras = read('assets/js/extras.js');
const home = read('index.html');
const knowledge = read('knowledge.html');
const knowledgeJs = read('assets/js/knowledge.js');
const admin = read('admin.html');
const adminJs = read('assets/js/admin.js');

test('общая навигация повторяет финальный концепт', () => {
  /* Решение владельца 25.07.2026 (отменяет более раннее решения того же дня
     о четырёх пунктах): в шапке ПЯТЬ пунктов в порядке эталона
     style-lab/full/index.html:38–44 — Услуги · Цены · Библиотека ·
     О мастерской · Выгоды. «Выгоды» возвращены сознательно: клуб, бонусы
     и сертификаты — это, по сути, УТП мастерской, и держать его только
     в подвале значит прятать главный довод. */
  const NAV_EXPECTED = [
    ['services.html', 'Услуги'],
    ['tariffs.html', 'Цены'],
    ['knowledge.html', 'Библиотека'],
    ['about.html', 'О мастерской'],
    ['referral.html', 'Выгоды'],
  ];
  for (const [href, label] of NAV_EXPECTED) {
    assert.match(app, new RegExp(`href: '${href.replace('.', '\\.')}',\\s+label: '${label}'`));
  }
  /* Порядок, а не только состав: он повторяет эталон и путь клиента. */
  const navBlock = app.match(/var NAV = \[[\s\S]*?\];/);
  assert.ok(navBlock, 'массив NAV должен находиться в assets/js/app.js');
  assert.deepEqual(
    [...navBlock[0].matchAll(/href: '([^']+)',\s+label: '([^']+)'/g)].map((m) => [m[1], m[2]]),
    NAV_EXPECTED,
    'порядок пунктов шапки должен совпадать с эталоном');
  /* Эталонный компактный подвал хранит Салон+ и депозит; клуб доступен
     из пятого пункта шапки, сертификат — из общего меню и поиска. */
  for (const href of ['plus.html', 'deposit.html']) {
    assert.match(app, new RegExp(`<a href="${href.replace('.', '\\.')}">`),
      `${href} должен остаться в подвале`);
  }
  assert.match(app, /\['gift\.html', 'Подарочный сертификат'/);
  for (const [href, label] of [
    ['/', 'Главная'],
    ['services.html', 'Услуги'],
    ['configurator.html', 'Описать'],
    ['knowledge.html', 'Библиотека'],
    ['dashboard.html', 'Кабинет'],
  ]) {
    assert.match(app, new RegExp(`mnItem\\('${href.replace('.', '\\.')}', '${label}'`));
  }
});

test('мобильная шапка показывает название текущего раздела, как в концепте', () => {
  assert.match(app, /function mobileMeta\(\)/);
  assert.match(app, /'knowledge\.html': \['Библиотека', 'Материалы'\]/);
  assert.match(app, /'configurator\.html': \['Новая заявка', 'Заказ'\]/);
  assert.match(app, /mobileHeaderMeta\.title/);
  assert.match(app, /mobileHeaderMeta\.kicker/);
});

test('главная и библиотека не возвращают блоки старого варианта', () => {
  assert.doesNotMatch(home, /class="home-tools"|Проверьте материал до заявки/);
  assert.doesNotMatch(knowledge, /Журнал мастерской|data-kb-journal|class="kb-entry"/i);
  assert.doesNotMatch(knowledgeJs, /initJournal|data-kb-journal|Журнал мастерской/i);
  assert.doesNotMatch(home + knowledge, /class="pf-footer"/);
  assert.match(app, /document\.body\.classList\.add\('concept-shell'\)/);
  assert.match(extras, /if \(document\.body\.classList\.contains\('concept-shell'\)\) return;/);
});

test('каталоги используют те же desktop и mobile лимиты, что финальное превью', () => {
  assert.match(knowledgeJs, /max-width: 620px/);
  assert.match(knowledgeJs, /\? 8 : 12/);
  assert.match(read('assets/js/polish15-catalog.js'), /\? 5 : 8/);
});

test('админка заменена новым рабочим столом, а не публичным или старым визуальным каркасом', () => {
  assert.match(admin, /<body class="is-admin-route">/);
  assert.match(admin, /assets\/css\/polish15-admin\.css/);
  assert.match(adminJs, /<div class="admin-shell">/);
  assert.match(adminJs, /<header class="admin-mobile-appbar">/);
  assert.match(adminJs, /<strong>Редакционный кабинет<\/strong><small>Управление<\/small>/);
  assert.match(adminJs, /<aside class="admin-sidebar">/);
  assert.match(adminJs, /<main class="admin-main">/);
  assert.match(read('assets/css/polish15-admin.css'), /\.is-admin-route \.site-header,[\s\S]*?display: none !important/);
});

test('футер — только финальная композиция с физическими ссылками', () => {
  assert.match(app, /Salon\.footerHTML = function \(\)/);
  for (const href of [
    'services.html', 'tariffs.html', 'configurator.html', 'guarantees.html',
    'knowledge.html', 'tools.html', 'plus.html', 'deposit.html', 'reviews.html',
    'priyomnaya.html', 'about.html', 'academic-integrity.html', 'privacy.html', 'terms.html',
  ]) {
    assert.match(app, new RegExp(`href="${href.replace('.', '\\.')}"`));
  }
  assert.doesNotMatch(app.match(/Salon\.footerHTML = function \(\) \{[\s\S]*?\n  \};/)?.[0] || '', /pf-footer|#\//);
});
