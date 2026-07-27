/* Метка канала ?s= и белый список рекламных параметров.

   Зачем поведенческий тест, а не проверка исходника регуляркой: здесь важен
   не текст, а результат разбора ссылки. Опечатка в CHANNELS или потерянный
   toLowerCase не ломают ни один паттерн, но тихо возвращают источник обратно
   в direct_or_unknown — то есть ровно в ту дыру, ради которой метка вводилась.

   Салон вырезается из app.js целиком, без остального файла: у Salon.attribution
   нет зависимостей, кроме consent, store и location. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');

const OPEN = 'Salon.attribution = (function () {';
const CLOSE = '\n  })();';

function attributionSource() {
  const start = appJs.indexOf(OPEN);
  assert.ok(start > 0, 'в app.js не найден Salon.attribution');
  const end = appJs.indexOf(CLOSE, start);
  assert.ok(end > start, 'не найден конец блока Salon.attribution');
  return appJs.slice(start, end + CLOSE.length);
}

/* consentAllowed=false воспроизводит посетителя, не давшего согласие на
   аналитику: атрибуция обязана молчать целиком. */
function makeAttribution(search, { referrer = '', consentAllowed = true } = {}) {
  const store = new Map();
  const sandbox = {
    URL,
    URLSearchParams,
    Date,
    Object,
    String,
    location: { search, pathname: '/configurator.html', origin: 'https://akademsalon.ru' },
    document: { referrer, addEventListener() {} },
    Salon: {
      consent: { allowed: () => consentAllowed },
      store: {
        get: (key, fallback) => (store.has(key) ? store.get(key) : fallback),
        set: (key, value) => store.set(key, value)
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(attributionSource(), sandbox);
  return sandbox.Salon.attribution;
}

test('короткая метка канала разворачивается в utm_source и utm_medium', () => {
  const cases = [
    ['?s=tg', '?utm_source=telegram&utm_medium=bot'],
    ['?s=tgch', '?utm_source=telegram&utm_medium=channel'],
    ['?s=vk', '?utm_source=vk&utm_medium=social'],
    ['?s=feed', '?utm_source=feed&utm_medium=rss'],
    ['?s=ref', '?utm_source=referral&utm_medium=word_of_mouth'],
    ['?s=qr', '?utm_source=qr&utm_medium=offline']
  ];
  for (const [search, expected] of cases) {
    assert.equal(makeAttribution(search).ref(), expected, `метка ${search} развернулась неверно`);
  }
});

test('регистр метки не имеет значения — ссылку копируют руками', () => {
  assert.equal(makeAttribution('?s=TG').ref(), '?utm_source=telegram&utm_medium=bot');
  assert.equal(makeAttribution('?s=Vk').ref(), '?utm_source=vk&utm_medium=social');
});

test('неизвестная метка не сочиняет источник', () => {
  /* иначе любой желающий подмешает в отчёт собственный канал через ссылку */
  assert.equal(makeAttribution('?s=partner-of-my-own').ref(), '');
  assert.equal(makeAttribution('?s=').ref(), '');
  assert.equal(makeAttribution('?s=tg%00drop').ref(), '');
});

test('явные utm_* в той же ссылке главнее метки', () => {
  const ref = makeAttribution('?s=tg&utm_source=yandex&utm_campaign=vkr').ref();
  const got = new URLSearchParams(ref.replace(/^\?/, ''));
  assert.equal(got.get('utm_source'), 'yandex', 'метка перезаписала явный utm_source');
  assert.equal(got.get('utm_campaign'), 'vkr');
  assert.equal(got.get('utm_medium'), 'bot', 'недостающий utm_medium метка дополнить обязана');
});

test('рекламные click-id из белого списка доходят до отчёта', () => {
  for (const key of ['yclid', 'gclid', 'ymclid', 'fbclid', 'erid']) {
    const ref = makeAttribution(`?${key}=abc123`).ref();
    assert.equal(ref, `?${key}=abc123`, `${key} потерялся по дороге`);
  }
});

test('произвольный query в атрибуцию не попадает', () => {
  /* контакты и содержимое формы не должны утекать в аналитику */
  const ref = makeAttribution('?email=student%40example.com&phone=79990000000&s=tg').ref();
  assert.equal(ref, '?utm_source=telegram&utm_medium=bot');
  assert.ok(!ref.includes('example.com'), 'адрес почты просочился в атрибуцию');
  assert.ok(!ref.includes('79990000000'), 'телефон просочился в атрибуцию');
});

test('без согласия на аналитику атрибуция молчит', () => {
  const attribution = makeAttribution('?s=tg', { consentAllowed: false });
  assert.equal(attribution.ref(), '');
  assert.equal(attribution.capture(), null);
  assert.equal(attribution.decoratePage('/configurator.html'), '/configurator.html');
});

test('канал доезжает до заявки через decoratePage', () => {
  /* configurator.html подмешивает это в payload.page — так мастер видит,
     какой канал принёс конкретный заказ, а не только сессию */
  const decorated = makeAttribution('?s=tg').decoratePage('/configurator.html');
  assert.match(decorated, /entry=\/configurator\.html/);
  assert.match(decorated, /utm_source=telegram/);
  assert.match(decorated, /utm_medium=bot/);
});

test('переход без метки и без referer остаётся честно пустым', () => {
  /* Telegram срезает Referer: такой заход мы не имеем права записать в поиск */
  assert.equal(makeAttribution('').ref(), '');
});

test('внешний referer распознаётся, свой — нет', () => {
  assert.equal(
    makeAttribution('', { referrer: 'https://yandex.ru/search/?text=вкр' }).ref(),
    'https://yandex.ru/search/'
  );
  assert.equal(
    makeAttribution('', { referrer: 'https://akademsalon.ru/knowledge.html' }).ref(),
    ''
  );
});
