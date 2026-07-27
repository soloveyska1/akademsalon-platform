/* Отправка адресов в IndexNow.

   Сеть здесь не нужна и не трогается: submit принимает fetch аргументом,
   а всё остальное — чистые функции над sitemap.xml и файлами ключа.

   Главное, что стережёт этот набор, — рассинхрон ключа. Если .indexnow-key
   и <ключ>.txt разойдутся, поиск ответит 403 и просто перестанет забирать
   обновления; в логах релиза это выглядит как «всё прошло». */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const load = () => import(path.join(root, 'scripts/ping-indexnow.mjs'));

test('ключ и файл-подтверждение в репозитории совпадают', async () => {
  const { readKey } = await load();
  const { key, keyLocation } = readKey();
  assert.match(key, /^[a-zA-Z0-9-]{8,128}$/);
  assert.equal(keyLocation, `https://akademsalon.ru/${key}.txt`);
  assert.equal(fs.readFileSync(path.join(root, `${key}.txt`), 'utf8').trim(), key);
});

test('расхождение ключа и подтверждения ловится до отправки', async () => {
  const { readKey } = await load();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'indexnow-'));

  fs.writeFileSync(path.join(dir, '.indexnow-key'), 'abcdef0123456789');
  assert.throws(() => readKey(dir), /нет файла-подтверждения/);

  fs.writeFileSync(path.join(dir, 'abcdef0123456789.txt'), 'совсем другой ключ');
  assert.throws(() => readKey(dir), /содержит/);

  fs.writeFileSync(path.join(dir, 'abcdef0123456789.txt'), 'abcdef0123456789\n');
  assert.equal(readKey(dir).key, 'abcdef0123456789');

  fs.writeFileSync(path.join(dir, '.indexnow-key'), 'нельзя кириллицей');
  assert.throws(() => readKey(dir), /8–128 символов/);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('sitemap разбирается целиком и совпадает с файлом', async () => {
  const { readSitemap } = await load();
  const entries = readSitemap();
  const declared = (fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8').match(/<loc>/g) || []).length;
  assert.equal(entries.length, declared, 'часть <url> из sitemap.xml потерялась при разборе');
  assert.ok(entries.length > 50, `в карте всего ${entries.length} адресов — подозрительно мало`);
  for (const e of entries) {
    assert.match(e.loc, /^https:\/\/akademsalon\.ru\//);
    assert.match(e.lastmod, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('по умолчанию уходят только адреса последнего релиза', async () => {
  const { selectUrls, newestLastmod } = await load();
  const entries = [
    { loc: 'https://akademsalon.ru/a.html', lastmod: '2026-07-20' },
    { loc: 'https://akademsalon.ru/b.html', lastmod: '2026-07-25' },
    { loc: 'https://akademsalon.ru/c.html', lastmod: '2026-07-25' }
  ];
  assert.equal(newestLastmod(entries), '2026-07-25');
  assert.deepEqual(selectUrls(entries), [
    'https://akademsalon.ru/b.html',
    'https://akademsalon.ru/c.html'
  ]);
  assert.equal(selectUrls(entries, { all: true }).length, 3);
  assert.equal(selectUrls(entries, { since: '2026-07-01' }).length, 3);
  assert.equal(selectUrls(entries, { since: '2026-12-01' }).length, 0);
});

test('чужие адреса отправить нельзя', async () => {
  const { selectUrls } = await load();
  assert.throws(
    () => selectUrls([], { urls: ['https://example.com/x.html'] }),
    /адреса не с https:\/\/akademsalon\.ru/
  );
  assert.deepEqual(
    selectUrls([], { urls: ['https://akademsalon.ru/index.html'] }),
    ['https://akademsalon.ru/index.html']
  );
});

test('тело запроса собирается по спецификации и знает свой потолок', async () => {
  const { buildPayload } = await load();
  const key = { key: 'abcdef0123456789', keyLocation: 'https://akademsalon.ru/abcdef0123456789.txt' };

  const payload = buildPayload(['https://akademsalon.ru/'], key);
  assert.deepEqual(payload, {
    host: 'akademsalon.ru',
    key: 'abcdef0123456789',
    keyLocation: 'https://akademsalon.ru/abcdef0123456789.txt',
    urlList: ['https://akademsalon.ru/']
  });

  assert.throws(() => buildPayload([], key), /пустой список/);
  const tooMany = Array.from({ length: 10001 }, (_, i) => `https://akademsalon.ru/${i}.html`);
  assert.throws(() => buildPayload(tooMany, key), /не больше 10000/);
});

test('202 считается успехом, 403 — нет', async () => {
  const { submit, describeStatus } = await load();
  const seen = [];
  const fakeFetch = (url, init) => {
    seen.push({ url, init });
    return Promise.resolve({ status: seen.length === 1 ? 202 : 403 });
  };

  const first = await submit({ host: 'akademsalon.ru' }, fakeFetch);
  assert.equal(first.ok, true, '202 Accepted — это принято, а не ошибка');
  assert.match(first.note, /ключ ещё проверяется/);

  const second = await submit({ host: 'akademsalon.ru' }, fakeFetch);
  assert.equal(second.ok, false);
  assert.match(second.note, /файл-подтверждение/);

  assert.equal(seen[0].url, 'https://api.indexnow.org/indexnow');
  assert.equal(seen[0].init.method, 'POST');
  assert.match(seen[0].init.headers['Content-Type'], /application\/json/);
  assert.match(describeStatus(429), /слишком часто/);
});

test('аргументы разбираются строго', async () => {
  const { parseArgs } = await load();
  assert.deepEqual(parseArgs([]), { submit: false, all: false, since: '', urls: [] });
  assert.equal(parseArgs(['--submit']).submit, true);
  assert.equal(parseArgs(['--all']).all, true);
  assert.equal(parseArgs(['--since=2026-07-25']).since, '2026-07-25');
  assert.deepEqual(parseArgs(['--url=https://akademsalon.ru/a.html']).urls, ['https://akademsalon.ru/a.html']);
  assert.throws(() => parseArgs(['--since=вчера']), /ГГГГ-ММ-ДД/);
  assert.throws(() => parseArgs(['--force']), /неизвестный аргумент/);
});

test('без --submit скрипт ничего не отправляет', async () => {
  /* защита от случайного запуска: предпросмотр обязан остаться предпросмотром */
  const src = fs.readFileSync(path.join(root, 'scripts/ping-indexnow.mjs'), 'utf8');
  assert.match(src, /if \(!opts\.submit\)/);
  const submitCall = src.indexOf('await submit(');
  const guard = src.indexOf('if (!opts.submit)');
  assert.ok(guard > 0 && submitCall > guard, 'отправка должна стоять после проверки --submit');
});
