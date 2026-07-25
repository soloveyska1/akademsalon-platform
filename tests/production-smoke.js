/* Боевая проверка живого контура. Запуск вручную:  node tests/production-smoke.js
   В общий прогон `node tests/*.test.js` НЕ входит — здесь настоящая сеть.

   Все запросы безопасны: ни один не создаёт заказ, платёж или сертификат.
   Единственный POST — заявка с пустым контактом: сервер отвергает её раньше,
   чем что-либо записывает. Если он вдруг ответит ok:true, скрипт это отметит.

   Зачем: сервер и Telegram-бот в этот репозиторий не входят, а выкладка идёт
   отдельно. Если статика здесь разойдётся с выложенной, приём заявок может
   встать целиком — по одному лишь коду это не видно. Сверка строки согласия
   с боевым configurator.html отвечает на вопрос «безопасно ли выкладывать». */
const SITE = process.env.SALON_SITE || 'https://akademsalon.ru';
const BASE = process.env.SALON_API || SITE + '/api';
const TIMEOUT = 30000;

/* строку согласия читаем прямо из конфигуратора — так проба ловит рассинхрон
   сама, без правки этого файла. Сервер сверяет её и отвергает чужую версию. */
const REPO_CONSENT = (function () {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'configurator.html'), 'utf8');
  const m = /consent_doc:\s*'([^']+)'/.exec(src);
  if (!m) throw new Error('в configurator.html не найдено поле consent_doc');
  return m[1];
})();

let pass = 0, fail = 0, warn = 0;
const ok = (m) => { pass++; console.log('  ✓ ' + m); };
const bad = (m) => { fail++; console.log('  ✗ ' + m); };
const note = (m) => { warn++; console.log('  ! ' + m); };

async function call(path, opts, _retried) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), (opts && opts.timeout) || TIMEOUT);
  try {
    const res = await fetch(BASE + path, Object.assign({ signal: ctl.signal }, opts));
    let body = null;
    try { body = await res.json(); } catch (e) { /* не JSON — оставляем null */ }
    return { status: res.status, body };
  } catch (e) {
    /* обрыв или таймаут — один тихий повтор: иначе разовая сетевая помеха
       показывается как отказ сервера и скрипту перестают верить. GET
       повторять безопасно; POST — только пробы, они ничего не создают. */
    if (!_retried) {
      await new Promise((r) => setTimeout(r, 1500));
      return call(path, opts, true);
    }
    return { status: 0, body: null, err: String(e.message || e) };
  } finally { clearTimeout(t); }
}

/* обычный GET за текстом страницы — без разбора JSON */
async function fetchText(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    return res.ok ? await res.text() : null;
  } catch (e) {
    return null;
  } finally { clearTimeout(t); }
}

async function main() {
  console.log('Боевая проверка: ' + BASE + '\n');

  console.log('Публичные справочники');
  for (const [path, field] of [
    ['/features', 'pay_online'], ['/plans', 'base_price'], ['/gift/config', 'presets'],
    ['/slots', 'quota'], ['/channel', 'posts'], ['/qa', 'items'], ['/reviews', 'reviews']
  ]) {
    const r = await call(path);
    if (r.status === 200 && r.body && r.body.ok && r.body[field] !== undefined) ok(path);
    else bad(path + ' → HTTP ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 90));
  }

  console.log('\nЗакрытые контуры отвечают отказом без авторизации');
  for (const [path, want] of [['/me', 401], ['/bonus', 401], ['/deposit', 401],
                              ['/admin/overview', 403], ['/admin/orders?status=active', 403]]) {
    const r = await call(path);
    if (r.status === want) ok(path + ' → ' + want);
    else bad(path + ' → HTTP ' + r.status + ', ожидался ' + want + ' (закрытый контур открыт?)');
  }

  console.log('\nШина событий (long-poll кабинета и админки)');
  const started = Date.now();
  const ev = await call('/events?since=0', { timeout: 40000 });
  const secs = Math.round((Date.now() - started) / 1000);
  if (ev.status === 200 && ev.body && ev.body.ok && typeof ev.body.v === 'number') {
    ok('/events отвечает за ~' + secs + 'с, версия v=' + ev.body.v);
  } else bad('/events → HTTP ' + ev.status + ' за ' + secs + 'с — кабинет не узнает о новых файлах');

  console.log('\nВерсия согласия: совпадает ли репозиторий с выложенным сайтом');
  /* Сверяем строку согласия с той, что отдаёт боевой configurator.html.
     Именно её сервер принимает сегодня, поэтому сравнение отвечает на вопрос
     «безопасно ли выкладывать» без единого POST — заказы не создаются. */
  const liveConf = await fetchText(SITE + '/configurator.html');
  const liveMatch = liveConf && /consent_doc:\s*'([^']+)'/.exec(liveConf);
  if (!liveMatch) {
    bad('не удалось прочитать consent_doc с боевого configurator.html — проверьте вручную');
  } else if (liveMatch[1] !== REPO_CONSENT) {
    bad('строка согласия разошлась с выложенным сайтом:\n' +
        '      репозиторий: ' + REPO_CONSENT + '\n' +
        '      на сайте:    ' + liveMatch[1] + '\n' +
        '      Выкладка остановит приём ВСЕХ заявок: каждый POST /orders → HTTP 409.');
  } else {
    ok('строка согласия совпадает: ' + REPO_CONSENT);
  }

  console.log('\nКонтур заявки отвечает и не принимает пустой контакт');
  const probe = await call('/orders', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'course', disc: 'hum', term: 'free', tier: 'base',
      topic: 'smoke probe', name: '', contact: '', website: '', deadline: '', details: '',
      consent: true, privacy_notice_ack: true, consent_doc: REPO_CONSENT,
      page: 'configurator.html', client_request_id: 'smoke-contact-probe'
    })
  });
  const err = probe.body && probe.body.error;
  if (err === 'contact_required') {
    ok('POST /orders живой, заявка без контакта отклонена (заказ не создан)');
  } else if (probe.body && probe.body.ok) {
    note('проба неожиданно СОЗДАЛА заказ №' + probe.body.id + ' — его надо удалить вручную');
  } else if (err) {
    ok('POST /orders живой, отклонил пробу (' + err + ', заказ не создан)');
  } else {
    bad('непонятный ответ POST /orders: HTTP ' + probe.status + ' ' + JSON.stringify(probe.body).slice(0, 90));
  }

  console.log('\n' + '─'.repeat(60));
  console.log('успешно: ' + pass + ' · провалено: ' + fail + (warn ? ' · внимание: ' + warn : ''));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('сорвалось: ' + e.message); process.exit(1); });
