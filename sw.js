/* Академический Салон — сервис-воркер установки на домашний экран.

   Версия обязана совпадать с ключом кэш-семьи shell в HTML: тест
   `tests/pwa-install.test.js` это проверяет. Смена версии меняет имена кэшей,
   поэтому старые слои сносятся при активации — без этого правка ассетов не
   доезжала бы до уже установленного приложения.

   ЧЕГО ВОРКЕР НЕ КАСАЕТСЯ НАМЕРЕННО:
   - `/api/*` — оплата, вход, согласие и заявки всегда идут в сеть. Кэш здесь
     означал бы устаревший ответ там, где на кону деньги и юридические
     редакции;
   - кабинет и админка — их разметка может нести данные конкретного человека,
     а телефон бывает общим. Эти адреса не кладём в кэш никогда;
   - всё, что не GET, и всё, что с другого домена.
*/
const VERSION = '20260806shell123';
const SHELL_CACHE = `salon-shell-${VERSION}`;
const PAGE_CACHE = `salon-pages-${VERSION}`;
const OFFLINE_URL = '/offline.html';

/* Минимальный запас, который должен быть на устройстве до первого офлайна. */
const PRECACHE = [
  OFFLINE_URL,
  '/assets/img/icon-192.png',
  '/assets/img/icon-512.png',
  '/assets/img/icon-maskable-512.png',
  '/assets/img/favicon.svg',
];

/* Адреса, чью разметку не кэшируем ни при каких условиях. */
const PRIVATE_PAGES = /^\/(dashboard|admin(?:-[a-z0-9-]+)?|oplaceno)\.html$/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith('salon-') && !key.endsWith(VERSION))
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

/* Ассеты приходят с `?v=<ключ семьи>` и потому неизменяемы: раз положив, можно
   отдавать из кэша не спрашивая сеть. Ключ меняется — меняется и адрес. */
function isVersionedAsset(url) {
  return url.pathname.startsWith('/assets/') && url.searchParams.has('v');
}

function isPage(request, url) {
  return request.mode === 'navigate'
    || (request.destination === 'document' && url.pathname.endsWith('.html'));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch (err) {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (isVersionedAsset(url)) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })),
    );
    return;
  }

  if (!isPage(request, url)) return;

  /* Разметка всегда идёт в сеть первой: страницы несут юридические редакции,
     цены и состояние дела — устаревшая копия здесь опаснее, чем её отсутствие.
     Кэш и офлайн-лист остаются только страховкой на случай пропажи сети. */
  const priv = PRIVATE_PAGES.test(url.pathname);
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (!priv && response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request)
        .then((hit) => (priv ? null : hit) || caches.match(OFFLINE_URL))
        .then((hit) => hit || new Response('Нет сети', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        }))),
  );
});
