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
  for (const [href, label] of [
    ['services.html', 'Услуги'],
    ['tariffs.html', 'Цены'],
    ['knowledge.html', 'Библиотека'],
    ['about.html', 'О мастерской'],
    ['referral.html', 'Выгоды'],
  ]) {
    assert.match(app, new RegExp(`href: '${href.replace('.', '\\.')}',\\s+label: '${label}'`));
  }
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
