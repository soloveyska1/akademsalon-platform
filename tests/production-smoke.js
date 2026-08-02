/* Read-only проверка живого контура. Запуск вручную:
     node tests/production-smoke.js

   В общий прогон `node tests/*.test.js` не входит: здесь настоящая сеть.
   Guard ниже механически запрещает POST/PUT/PATCH/DELETE. Проверка заявки
   остаётся отдельным контуром до появления серверного preflight, уникального
   test marker, доказуемого lookup и проверки cleanup-кардинальности. */
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_SITE = process.env.SALON_SITE || 'https://akademsalon.ru';
const DEFAULT_BASE = process.env.SALON_API || DEFAULT_SITE + '/api';
const DEFAULT_TIMEOUT = 30000;

const REPO_CONSENT = (function readRepoConsent() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'configurator.html'), 'utf8');
  const match = /consent_doc:\s*'([^']+)'/.exec(src);
  if (!match) throw new Error('в configurator.html не найдено поле consent_doc');
  return match[1];
})();

function readOnlyMethod(options) {
  return String(options && options.method || 'GET').toUpperCase();
}

function assertReadOnly(options) {
  const method = readOnlyMethod(options);
  if (method !== 'GET' && method !== 'HEAD') {
    throw new Error('production smoke refuses unsafe method: ' + method);
  }
  return method;
}

function createSmoke(options = {}) {
  const site = options.site || DEFAULT_SITE;
  const base = options.base || DEFAULT_BASE;
  const timeout = options.timeout || DEFAULT_TIMEOUT;
  const transport = options.fetch || globalThis.fetch;
  const out = options.log || console.log;
  const pause = options.pause || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let pass = 0;
  let fail = 0;

  const ok = (message) => { pass++; out('  ✓ ' + message); };
  const bad = (message) => { fail++; out('  ✗ ' + message); };

  async function request(url, requestOptions) {
    const clean = Object.assign({}, requestOptions || {});
    const requestTimeout = clean.timeout || timeout;
    delete clean.timeout;
    assertReadOnly(clean);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeout);
    clean.signal = controller.signal;
    try {
      return await transport(url, clean);
    } finally {
      clearTimeout(timer);
    }
  }

  async function call(apiPath, requestOptions, retried) {
    assertReadOnly(requestOptions);
    try {
      const response = await request(base + apiPath, requestOptions);
      let body = null;
      try { body = await response.json(); } catch (error) { /* non-JSON remains null */ }
      return { status: response.status, body };
    } catch (error) {
      if (!retried) {
        await pause(1500);
        return call(apiPath, requestOptions, true);
      }
      return { status: 0, body: null, err: String(error.message || error) };
    }
  }

  async function fetchText(url) {
    try {
      const response = await request(url);
      return response.ok ? await response.text() : null;
    } catch (error) {
      return null;
    }
  }

  async function run() {
    out('Боевая read-only проверка: ' + base + '\n');

    out('Публичные справочники');
    for (const [apiPath, field] of [
      ['/features', 'pay_online'], ['/plans', 'base_price'], ['/gift/config', 'presets'],
      ['/slots', 'quota'], ['/channel', 'posts'], ['/qa', 'items'], ['/reviews', 'reviews'],
    ]) {
      const result = await call(apiPath);
      if (result.status === 200 && result.body && result.body.ok && result.body[field] !== undefined) {
        ok(apiPath);
      } else {
        bad(apiPath + ' → HTTP ' + result.status + ' ' + JSON.stringify(result.body).slice(0, 90));
      }
    }

    out('\nЗакрытые контуры отвечают отказом без авторизации');
    for (const [apiPath, expected] of [
      ['/me', 401], ['/bonus', 401], ['/deposit', 401],
      ['/admin/overview', 403], ['/admin/orders?status=active', 403],
    ]) {
      const result = await call(apiPath);
      if (result.status === expected) ok(apiPath + ' → ' + expected);
      else bad(apiPath + ' → HTTP ' + result.status + ', ожидался ' + expected);
    }

    out('\nШина событий (long-poll кабинета и админки)');
    const started = Date.now();
    const events = await call('/events?since=0', { timeout: 40000 });
    const seconds = Math.round((Date.now() - started) / 1000);
    if (events.status === 200 && events.body && events.body.ok && typeof events.body.v === 'number') {
      ok('/events отвечает за ~' + seconds + 'с, версия v=' + events.body.v);
    } else {
      bad('/events → HTTP ' + events.status + ' за ' + seconds + 'с');
    }

    out('\nВерсия согласия: репозиторий и выложенный сайт');
    const liveConfigurator = await fetchText(site + '/configurator.html');
    const liveMatch = liveConfigurator && /consent_doc:\s*'([^']+)'/.exec(liveConfigurator);
    if (!liveMatch) {
      bad('не удалось прочитать consent_doc с боевого configurator.html');
    } else if (liveMatch[1] !== REPO_CONSENT) {
      bad('строка согласия разошлась: репозиторий=' + REPO_CONSENT + ', сайт=' + liveMatch[1]);
    } else {
      ok('строка согласия совпадает: ' + REPO_CONSENT);
    }

    out('\n' + '─'.repeat(60));
    out('успешно: ' + pass + ' · провалено: ' + fail);
    return { pass, fail, methods: ['GET', 'HEAD'] };
  }

  return { run, call, fetchText };
}

async function main() {
  const result = await createSmoke().run();
  process.exitCode = result.fail ? 1 : 0;
}

if (require.main === module) {
  main().catch((error) => {
    console.error('сорвалось: ' + error.message);
    process.exitCode = 1;
  });
}

module.exports = { REPO_CONSENT, assertReadOnly, createSmoke };
