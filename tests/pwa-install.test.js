/* Установка на домашний экран (OUT-008, этап 2).

   Замер до правки: `manifest` — 0 вхождений во всех HTML, service worker
   отсутствовал, `apple-mobile-web-app-*` — 0. Сайт нельзя было поставить
   как приложение и он не отвечал ничем осмысленным без сети. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.env.SALON_PUBLIC_ROOT || path.resolve(__dirname, '..');
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
  assert.match(offline, /Не удалось связаться с сайтом/);
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
  for (const name of pages) {
    const key=read(name).match(/manifest\.webmanifest\?v=([^"&]+)/)?.[1];
    assert.equal(key, version, name + ': manifest and worker must share a cache family');
  }
  // The redesigned catalogue no longer includes chrome.css. Production asset
  // content fingerprints are independently verified by production-release.test.

});

test('воркер регистрируется и не ломает страницу при отказе', () => {
  const app = read('assets/js/app.js');
  assert.match(app, /navigator\.serviceWorker\.register\('\/sw\.js'/);
  assert.match(app, /\.catch\(/, 'отказ регистрации не должен ронять страницу');
  assert.match(app, /location\.protocol !== 'https:'/, 'регистрируем только в защищённом контексте');
});

test('обновление не переносит старый offline и не читает чужую семью кэша', async () => {
  const vm = require('node:vm');
  const listeners = {};
  const stores = new Map();
  const origin = 'https://fixture.invalid';
  const keyOf = (request) => new URL(typeof request === 'string' ? request : request.url, origin).href;
  let installed = [], network = false;
  const lookups = [];
  const store = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name);
    return {
      addAll: async (requests) => {
        installed = requests;
        for (const request of requests) entries.set(keyOf(request), new Response(request.cache === 'reload' ? 'current' : 'stale-http'));
      },
      put: async (request, response) => entries.set(keyOf(request), response),
      match: async (request) => entries.get(keyOf(request))?.clone(),
    };
  };
  const caches = {
    open: async (name) => store(name),
    match: async (request, options = {}) => {
      lookups.push({path: new URL(keyOf(request)).pathname, cacheName: options.cacheName});
      if (options.cacheName) return store(options.cacheName).match(request);
      for (const name of stores.keys()) { const hit = await store(name).match(request); if (hit) return hit; }
    },
    keys: async () => [...stores.keys()], delete: async (name) => stores.delete(name),
  };
  class WorkerRequest extends Request {
    constructor(url, options) { super(new URL(url, origin), options); }
  }
  vm.runInNewContext(read('sw.js'), {
    self: {location: {origin}, addEventListener: (name, fn) => { listeners[name] = fn; }, skipWaiting: async () => {}, clients: {claim: async () => {}}},
    caches, Request: WorkerRequest, Response, URL, Promise,
    fetch: async () => { if (!network) throw new Error('offline'); return new Response('network'); },
  });
  const version = read('sw.js').match(/const VERSION = '([^']+)'/)[1];
  const shell = `salon-shell-${version}`, pagesCache = `salon-pages-${version}`;
  // An old worker can recreate its cache after activation cleanup. Insert it first.
  await store('salon-shell-old').put('/offline.html', new Response('old-offline'));
  await store('salon-pages-old').put('/about.html', new Response('old-page'));
  let install;
  listeners.install({waitUntil: (promise) => { install = promise; }}); await install;
  assert.ok(installed.length >= 5);
  assert.ok(installed.every((request) => request.cache === 'reload'));
  const request = (pathname, extra = {}) => ({url: origin + pathname, method: 'GET', mode: 'navigate', destination: 'document', ...extra});
  const run = async (req) => {
    let promise;
    listeners.fetch({request: req, respondWith: (response) => { promise = response; }});
    return promise ? (await promise).text() : undefined;
  };
  assert.equal(await run(request('/dashboard.html?token=fixture')), 'current');
  assert.ok(!lookups.some((entry) => entry.path === '/dashboard.html'));
  assert.equal(await run(request('/about.html')), 'current');
  await store(pagesCache).put('/about.html', new Response('current-page'));
  assert.equal(await run(request('/about.html')), 'current-page');
  const asset = '/assets/example.js?v=fixture';
  await store('salon-shell-old').put(asset, new Response('old-asset'));
  await store(shell).put(asset, new Response('current-asset'));
  assert.equal(await run(request(asset, {mode: 'cors', destination: 'script'})), 'current-asset');
  for (const req of [request('/api/payment'), request('/about.html', {method: 'POST'}), request('/about.html', {url: 'https://other.invalid/about.html'})]) assert.equal(await run(req), undefined);
  assert.ok(lookups.every((entry) => [shell, pagesCache].includes(entry.cacheName)));
});
