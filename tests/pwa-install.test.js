/* Установка на домашний экран (OUT-008, этап 2).

   Замер до правки: `manifest` — 0 вхождений во всех HTML, service worker
   отсутствовал, `apple-mobile-web-app-*` — 0. Сайт нельзя было поставить
   как приложение и он не отвечал ничем осмысленным без сети. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const pages = fs.readdirSync(root).filter((f) => f.endsWith('.html'));

test('манифест и мета установки есть на КАЖДОЙ странице', () => {
  const missing = { manifest: [], apple: [], title: [] };
  for (const page of pages) {
    const html = read(page);
    if (!/<link rel="manifest" href="\/manifest\.webmanifest\?v=/.test(html)) missing.manifest.push(page);
    if (!/<meta name="apple-mobile-web-app-capable" content="yes"/.test(html)) missing.apple.push(page);
    if (!/<meta name="apple-mobile-web-app-title" content="Академсалон"/.test(html)) missing.title.push(page);
  }
  assert.deepEqual(missing.manifest, [], 'страницы без манифеста');
  assert.deepEqual(missing.apple, [], 'страницы без apple-mobile-web-app-capable');
  assert.deepEqual(missing.title, [], 'страницы без имени на домашнем экране');
  assert.ok(pages.length >= 90, `страниц должно остаться много, найдено ${pages.length}`);
});

test('манифест описывает установку полностью', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.display, 'standalone', 'приложение должно открываться без адресной строки');
  assert.equal(manifest.scope, '/');
  assert.match(manifest.start_url, /^\//);
  assert.ok(manifest.name && manifest.short_name, 'нужны полное и короткое имя');
  assert.ok(manifest.theme_color && manifest.background_color, 'нужны цвета темы и подложки');

  const sizes = manifest.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192'), 'нужна иконка 192');
  assert.ok(sizes.includes('512x512'), 'нужна иконка 512');
  /* Без maskable система обрезает иконку по своей форме и режет печать. */
  assert.ok(
    manifest.icons.some((i) => String(i.purpose || '').includes('maskable')),
    'нужна маскируемая иконка',
  );
  for (const icon of manifest.icons) {
    const file = icon.src.replace(/^\//, '');
    assert.ok(fs.existsSync(path.join(root, file)), `иконка ${icon.src} должна существовать`);
  }
});

test('иконки установки нужного размера, а не растянутые', () => {
  const png = (file) => {
    const buf = fs.readFileSync(path.join(root, file));
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  };
  assert.deepEqual(png('assets/img/icon-192.png'), { w: 192, h: 192 });
  assert.deepEqual(png('assets/img/icon-512.png'), { w: 512, h: 512 });
  assert.deepEqual(png('assets/img/icon-maskable-512.png'), { w: 512, h: 512 });
});

test('воркер не касается денег, входа и чужих кабинетов', () => {
  const sw = read('sw.js');
  /* Кэш на этих путях означал бы устаревший ответ там, где на кону оплата,
     сессия и юридические редакции. */
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)\)\s*return/,
    'запросы к /api/ должны уходить в сеть без вмешательства');
  assert.match(sw, /request\.method !== 'GET'\)\s*return/, 'не-GET не трогаем');
  assert.match(sw, /url\.origin !== self\.location\.origin\)\s*return/, 'чужие домены не трогаем');
  assert.match(sw, /PRIVATE_PAGES\s*=\s*\/\^\\\/\(dashboard\|admin/,
    'кабинет и админка не должны попадать в кэш разметки');
});

test('страница без сети существует и не зависит от внешних файлов', () => {
  const offline = read('offline.html');
  assert.match(offline, /<style>/, 'стили должны лежать внутри: внешний файл может быть недоступен');
  assert.doesNotMatch(offline, /<link rel="stylesheet"/, 'внешних стилей быть не должно');
  assert.doesNotMatch(offline, /<script src=/, 'внешних скриптов быть не должно');
  assert.match(offline, /Сети нет/);
  const sw = read('sw.js');
  assert.match(sw, /OFFLINE_URL = '\/offline\.html'/);
  assert.ok(sw.includes('PRECACHE'), 'офлайн-лист должен класться заранее');
});

test('версия воркера совпадает с ключом семьи shell', () => {
  /* Иначе установленное приложение продолжит отдавать старые ассеты: имена
     кэшей не сменятся, и слой прошлого релиза останется жить на устройстве. */
  const sw = read('sw.js');
  const version = sw.match(/const VERSION = '([^']+)'/)?.[1];
  assert.ok(version, 'воркер должен объявлять версию');
  /* Читаем ключ по ссылке манифеста, а не по chrome.css: главная подключает
     не исходники, а сборку, и chrome.css в её разметке нет вовсе. Ссылка на
     манифест есть на всех страницах и несёт тот же ключ семьи shell. */
  const shellKey = read('index.html').match(/manifest\.webmanifest\?v=([a-z0-9]+)/)?.[1];
  assert.ok(shellKey, 'ключ семьи shell должен читаться из ссылки на манифест');
  assert.equal(version, shellKey, 'при бампе ключа обязательно поднять версию воркера');
  /* И тот же ключ обязан стоять у ассетов, иначе воркер и стили разъедутся. */
  const assetKey = read('services.html').match(/chrome\.css\?v=([a-z0-9]+)/)?.[1];
  assert.equal(assetKey, shellKey, 'ключ манифеста и ключ ассетов должны совпадать');
});

test('воркер регистрируется и не ломает страницу при отказе', () => {
  const app = read('assets/js/app.js');
  assert.match(app, /navigator\.serviceWorker\.register\('\/sw\.js'/);
  assert.match(app, /\.catch\(/, 'отказ регистрации не должен ронять страницу');
  assert.match(app, /location\.protocol !== 'https:'/, 'регистрируем только в защищённом контексте');
});
