#!/usr/bin/env node
'use strict';

/* Real-browser acceptance for the private Analytics v2 master-cabinet shell. */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PLAYWRIGHT_VERSION = '1.60.0';
const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'output', 'playwright', 'admin-analytics-master-parity');
const VIEWPORTS = [
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'tablet-1024', width: 1024, height: 900 },
  { name: 'desktop-1440', width: 1440, height: 1000 }
];

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (error) {
    if (process.env.ANALYTICS_SMOKE_BOOTSTRAPPED === '1') throw error;
    const shell = [
      'export NODE_PATH="$(dirname "$(dirname "$(command -v playwright)")")"',
      'export ANALYTICS_SMOKE_BOOTSTRAPPED=1',
      'exec node "$@"'
    ].join('; ');
    const result = spawnSync('npm', [
      'exec', '--yes', `--package=playwright@${PLAYWRIGHT_VERSION}`, '--',
      'sh', '-c', shell, '_', __filename, ...process.argv.slice(2)
    ], { cwd: ROOT, env: process.env, stdio: 'inherit' });
    if (result.error) {
      console.error(`Не удалось запустить Playwright: ${result.error.message}`);
      process.exit(2);
    }
    process.exit(result.status === null ? 2 : result.status);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.ico': 'image/x-icon'
};

function json(response, status, payload, delay = 0) {
  const body = Buffer.from(JSON.stringify(payload));
  setTimeout(() => {
    response.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Length': body.length
    });
    response.end(body);
  }, delay);
}

function overview(hours, query) {
  const factor = hours === 2160 ? 4 : hours === 720 ? 2 : 1;
  const generated = '2026-08-12T19:30:00Z';
  return {
    ok: true,
    schema_version: 2,
    generated_at: generated,
    period: { hours },
    metrics: {
      visitors: 184 * factor, sessions: 231 * factor, pageviews: 612 * factor,
      converted_sessions: 37 * factor, session_conversion_pct: 16,
      avg_pageviews: 2.6, online: 3
    },
    trend: [
      { bucket: '2026-08-08', visitors: 22, sessions: 28, pageviews: 76, conversions: 4 },
      { bucket: '2026-08-09', visitors: 31, sessions: 38, pageviews: 101, conversions: 7 },
      { bucket: '2026-08-10', visitors: 27, sessions: 34, pageviews: 90, conversions: 5 },
      { bucket: '2026-08-11', visitors: 45, sessions: 57, pageviews: 149, conversions: 9 },
      { bucket: '2026-08-12', visitors: 59, sessions: 74, pageviews: 196, conversions: 12 }
    ],
    sources: [
      { kind: 'referral', name: 'yandex', sessions: 114, visitors: 96, conversions: 21 },
      { kind: 'referral', name: 'telegram', sessions: 62, visitors: 49, conversions: 12 },
      { kind: 'referral', name: 'external', sessions: 31, visitors: 26, conversions: 3 }
    ],
    geo: [
      { city: 'Москва', region: 'Москва', country: 'Россия', sessions: 92, visitors: 75 },
      { city: 'Казань', region: 'Татарстан', country: 'Россия', sessions: 33, visitors: 27 }
    ],
    devices: [
      { name: 'phone', sessions: 142 }, { name: 'desktop', sessions: 77 },
      { name: 'tablet', sessions: 12 }
    ],
    browsers: [
      { name: 'yandex', sessions: 96 }, { name: 'chrome', sessions: 84 },
      { name: 'safari', sessions: 51 }
    ],
    operating_systems: [
      { name: 'android', sessions: 101 }, { name: 'windows', sessions: 70 },
      { name: 'ios', sessions: 60 }
    ],
    pages: [
      { page: '/home', views: 260, entries: 143, exits: 41, conversions: 16 },
      { page: '/services', views: 174, entries: 42, exits: 39, conversions: 10 },
      { page: '/configurator', views: 128, entries: 31, exits: 33, conversions: 11 }
    ],
    transitions: [
      { from_page: '/home', to_page: '/services', transitions: 73 },
      { from_page: '/services', to_page: '/configurator', transitions: 49 }
    ],
    funnel: [
      ['Просмотр страницы', 231, 100], ['Интерес', 158, 68.4],
      ['Открыт конфигуратор', 112, 70.9], ['Ввод данных', 78, 69.6],
      ['Попытка отправки', 49, 62.8], ['Успешная заявка', 37, 75.5]
    ].map(([label, sessions, from_previous_pct]) => ({ label, sessions, from_previous_pct })),
    events: [
      { event: 'page_view', events: 612, sessions: 231 },
      { event: 'submit_success', events: 37, sessions: 37 }
    ],
    errors: [
      { error_type: 'network_error', browser: 'chrome', release: 'release157', page: '/configurator', errors: 2, last_at: generated }
    ],
    health: { accepted: 4821, duplicate: 17, invalid: 3, rate_limited: 1 },
    quality: { geo_defined_pct: 82.4, latest_event_at: generated, data_delay_seconds: 25 },
    labels: {
      pages: { '/home': 'Главная', '/services': 'Услуги', '/configurator': 'Конфигуратор' },
      events: { page_view: 'Просмотр страницы', submit_success: 'Успешная заявка' }
    },
    request_echo: query
  };
}

function sessionRow(hours, index = 1) {
  return {
    session_id: `session-${hours}-${index}`,
    session_label: `С-${hours}-${index}`,
    visitor_label: `П-${hours}-${index}`,
    started_at: '2026-08-12T18:10:00Z',
    last_at: '2026-08-12T19:29:30Z',
    duration_s: 4770,
    source: { kind: 'referral', name: index === 1 ? 'yandex' : 'telegram' },
    entry_page: '/home', exit_page: index === 1 ? '/configurator' : '/services',
    device: index === 1 ? 'phone' : 'desktop', browser: index === 1 ? 'yandex' : 'chrome',
    geo: { city: index === 1 ? 'Москва' : 'Казань', region: index === 1 ? 'Москва' : 'Татарстан', country: 'Россия' },
    pageviews: index === 1 ? 5 : 3, event_count: index === 1 ? 12 : 7,
    converted: index === 1, active: index === 1
  };
}

function handleApi(request, response, url, requests) {
  const cookie = request.headers.cookie || '';
  if (url.pathname === '/api/auth/session') {
    if (/analytics_mode=forbidden/.test(cookie)) return json(response, 403, { ok: false });
    return json(response, 200, { ok: true, authenticated: true, session: true, user: { name: 'Мастер' } });
  }
  if (url.pathname === '/api/admin/overview') {
    return json(response, 200, {
      ok: true, by_status: {}, visits: { online: 0 }, qa: { pending: 0 },
      gifts: { claimed_n: 0 }, current_user: { name: 'Мастер' }
    });
  }
  if (url.pathname === '/api/admin/orders') return json(response, 200, { ok: true, orders: [] });
  if (url.pathname === '/api/admin/subs') return json(response, 200, { ok: true, subscribers: [] });
  if (url.pathname === '/api/events') return json(response, 200, { ok: true, v: 0, events: [] });
  if (!url.pathname.startsWith('/api/admin/analytics/')) return false;
  const hours = Number(url.searchParams.get('hours') || 168);
  const source = url.searchParams.get('source') || '';
  requests.push(url.pathname + url.search);
  if (/analytics_mode=forbidden/.test(cookie)) return json(response, 403, { ok: false });
  if (hours === 24 || source === 'external') return json(response, 503, { ok: false }, 180);
  if (url.pathname.endsWith('/overview')) return json(response, 200, overview(hours, Object.fromEntries(url.searchParams)));
  if (url.pathname.endsWith('/sessions')) {
    const cursor = url.searchParams.get('cursor');
    return json(response, 200, {
      ok: true, period: { hours }, items: [sessionRow(hours, cursor ? 2 : 1)],
      next_cursor: cursor ? null : `cursor-${hours}`
    });
  }
  if (/\/session\//.test(url.pathname)) {
    const delayed = /analytics_mode=late_detail/.test(cookie);
    return json(response, 200, {
      ok: true, period: { hours }, session_label: `С-${hours}-1`,
      visitor_label: delayed ? 'П-LATE-SECRET' : `П-${hours}-1`,
      started_at: '2026-08-12T18:10:00Z', duration_s: 4770,
      source: { kind: 'referral', name: 'yandex' }, device: 'phone', browser: 'yandex',
      geo: { city: 'Москва', region: 'Москва', country: 'Россия' },
      events: [
        { event: 'page_view', page: '/home', occurred_at: '2026-08-12T18:10:00Z' },
        { event: 'submit_success', page: '/configurator', occurred_at: '2026-08-12T19:20:00Z' }
      ]
    }, delayed ? 400 : 0);
  }
  return json(response, 404, { ok: false });
}

function createServer(requests) {
  return http.createServer((request, response) => {
    let url;
    try { url = new URL(request.url, 'http://127.0.0.1'); } catch (_) {
      response.writeHead(400); response.end(); return;
    }
    const handled = handleApi(request, response, url, requests);
    if (handled !== false) return;
    const pathname = url.pathname === '/' ? '/admin-analytics.html' : decodeURIComponent(url.pathname);
    const candidate = path.resolve(ROOT, '.' + pathname);
    if (!candidate.startsWith(ROOT + path.sep) || !fs.existsSync(candidate) || fs.statSync(candidate).isDirectory()) {
      response.writeHead(404); response.end('Not found'); return;
    }
    const headers = {
      'Content-Type': MIME[path.extname(candidate)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    };
    if (pathname === '/admin-analytics.html') {
      headers['Content-Security-Policy'] = [
        "default-src 'self'", "script-src 'self'", "style-src 'self'", "font-src 'self'",
        "img-src 'self' data:", "connect-src 'self'", "object-src 'none'", "base-uri 'none'",
        "frame-ancestors 'none'", "form-action 'self'"
      ].join('; ');
      headers['Referrer-Policy'] = 'no-referrer';
    }
    response.writeHead(200, headers);
    fs.createReadStream(candidate).pipe(response);
  });
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

function watchPage(page, origin, ignoreExpectedHttpError = false) {
  const faults = [];
  const external = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !(ignoreExpectedHttpError && /Failed to load resource/.test(message.text()))) {
      faults.push(`console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => faults.push(`pageerror: ${error.message}`));
  page.on('request', (request) => {
    if (!request.url().startsWith(origin)) external.push(request.url());
  });
  return { faults, external };
}

async function waitLoaded(page) {
  await page.waitForSelector('#analyticsContent:not([hidden])', { timeout: 8000 });
  await page.waitForSelector('.aa-metric:nth-child(6)', { timeout: 3000 });
}

async function checkLayout(browser, origin, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const watch = watchPage(page, origin);
  await page.goto(origin + '/admin-analytics.html', { waitUntil: 'networkidle' });
  await waitLoaded(page);
  await page.evaluate(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations.push(event.violatedDirective + ':' + event.blockedURI);
    });
  });

  const geometry = await page.evaluate(() => {
    const sidebar = document.querySelector('.admin-sidebar').getBoundingClientRect();
    const main = document.querySelector('.admin-main').getBoundingClientRect();
    const h1 = document.querySelector('.admin-head h1');
    const firstMetric = document.querySelector('.aa-metric__value').getBoundingClientRect();
    const root = document.documentElement;
    return {
      rootWidth: root.scrollWidth,
      viewportWidth: window.innerWidth,
      sidebarWidth: Math.round(sidebar.width),
      mainX: Math.round(main.x),
      h1Size: Math.round(parseFloat(getComputedStyle(h1).fontSize)),
      firstMetricBottom: Math.round(firstMetric.bottom),
      metrics: document.querySelectorAll('.aa-metric').length,
      csp: window.__cspViolations
    };
  });
  assert(geometry.rootWidth === geometry.viewportWidth,
    `${viewport.name}: root overflow ${geometry.rootWidth}/${geometry.viewportWidth}`);
  assert(geometry.metrics === 6, `${viewport.name}: rendered ${geometry.metrics}/6 metrics`);
  assert(geometry.csp.length === 0, `${viewport.name}: CSP violations ${geometry.csp.join(', ')}`);

  if (viewport.width > 920) {
    assert(Math.abs(geometry.sidebarWidth - 232) <= 1,
      `${viewport.name}: sidebar ${geometry.sidebarWidth}px instead of 232px`);
    assert(Math.abs(geometry.mainX - 232) <= 1,
      `${viewport.name}: main x=${geometry.mainX}px instead of 232px`);
    if (viewport.width === 1440) assert(geometry.h1Size === 40, `${viewport.name}: H1 is ${geometry.h1Size}px`);
  } else {
    const appbarHeight = await page.locator('.admin-mobile-appbar').evaluate((node) => Math.round(node.getBoundingClientRect().height));
    assert(appbarHeight === 62, `${viewport.name}: appbar ${appbarHeight}px instead of 62px`);
    assert(geometry.firstMetricBottom <= viewport.height,
      `${viewport.name}: first analytics value ends below the first screen (${geometry.firstMetricBottom}px)`);
    await page.locator('[data-admin-mobile-menu]').click();
    assert(await page.locator('body').evaluate((node) => node.classList.contains('admin-nav-expanded')),
      `${viewport.name}: mobile menu did not open`);
    assert(await page.locator('#analyticsMain').evaluate((node) => node.inert),
      `${viewport.name}: main was not made inert under menu`);
    await page.keyboard.press('Escape');
    assert(!(await page.locator('body').evaluate((node) => node.classList.contains('admin-nav-expanded'))),
      `${viewport.name}: Escape did not close menu`);
    assert(await page.locator('[data-admin-mobile-menu]').evaluate((node) => node === document.activeElement),
      `${viewport.name}: focus did not return to menu button`);

    assert(await page.locator('#advancedFilters').evaluate((node) => node.hidden),
      `${viewport.name}: advanced filters are not compact by default`);
    await page.locator('#filterToggle').click();
    assert(!(await page.locator('#advancedFilters').evaluate((node) => node.hidden)),
      `${viewport.name}: filters disclosure did not open`);
    const targets = await page.locator('#advancedFilters select, #advancedFilters input, #advancedFilters button').evaluateAll((nodes) =>
      nodes.map((node) => Math.round(node.getBoundingClientRect().height)));
    assert(targets.every((height) => height >= 18) && targets.filter((height) => height >= 44).length >= 4,
      `${viewport.name}: main filter controls are not touch-sized (${targets.join(',')})`);
    await page.locator('#filterToggle').click();
  }

  await page.screenshot({ path: path.join(OUTPUT, `${viewport.name}-light.png`), fullPage: true });
  await page.locator('[data-theme-toggle]:visible').first().click();
  assert(await page.locator('html').getAttribute('data-theme') === 'dark', `${viewport.name}: dark theme did not apply`);
  if (viewport.width <= 920) {
    const darkMetricBottom = await page.locator('.aa-metric__value').first().evaluate((node) =>
      Math.round(node.getBoundingClientRect().bottom));
    assert(darkMetricBottom <= viewport.height,
      `${viewport.name}: dark first analytics value ends below the first screen (${darkMetricBottom}px)`);
  }
  assert((await page.locator('#adminReturn').textContent()).includes('Мастер'),
    `${viewport.name}: authenticated master identity was not projected`);
  await page.screenshot({ path: path.join(OUTPUT, `${viewport.name}-dark.png`), fullPage: true });
  assert(watch.faults.length === 0, `${viewport.name}: ${watch.faults.join(' | ')}`);
  assert(watch.external.length === 0, `${viewport.name}: external requests ${watch.external.join(', ')}`);
  await context.close();
  return geometry;
}

async function checkForbidden(browser, origin) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([{ name: 'analytics_mode', value: 'forbidden', url: origin }]);
  const page = await context.newPage();
  const watch = watchPage(page, origin, true);
  await page.goto(origin + '/admin-analytics.html', { waitUntil: 'networkidle' });
  await page.waitForSelector('#accessDenied:not([hidden])');
  assert(await page.locator('#analyticsWorkspace').evaluate((node) => node.hidden), '403: analytics workspace remained visible');
  assert(await page.locator('#analyticsContent').evaluate((node) => node.hidden), '403: analytics content remained visible');
  assert(await page.locator('#navOnlineCount').evaluate((node) =>
    node.hidden && node.textContent === '0' && node.getClientRects().length === 0),
    '403: online badge was not empty and hidden');
  const tabbableInternal = await page.evaluate(() => Array.from(document.querySelectorAll(
    '#analyticsWorkspace a[href], #analyticsWorkspace button:not([disabled]), #analyticsWorkspace select, #analyticsWorkspace input'
  )).filter((node) => !node.closest('[hidden]') && node.getClientRects().length).length);
  assert(tabbableInternal === 0, `403: ${tabbableInternal} internal controls remain focusable`);
  assert(watch.faults.length === 0, `403: ${watch.faults.join(' | ')}`);
  assert(watch.external.length === 0, `403: external requests ${watch.external.join(', ')}`);
  await context.close();
}

async function checkForbiddenAfterData(browser, origin) {
  for (const action of ['loadMore', 'detail']) {
    const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
    const page = await context.newPage();
    const watch = watchPage(page, origin, true);
    await page.goto(origin + '/admin-analytics.html', { waitUntil: 'networkidle' });
    await waitLoaded(page);
    await context.addCookies([{ name: 'analytics_mode', value: 'forbidden', url: origin }]);
    if (action === 'loadMore') await page.locator('#loadMore').click();
    else await page.locator('#sessionRows [data-session]').first().click();
    await page.waitForSelector('#accessDenied:not([hidden])');
    assert(await page.locator('#analyticsWorkspace').evaluate((node) => node.hidden),
      `runtime 403/${action}: workspace remained visible`);
    assert(await page.locator('#sessionRows').evaluate((node) => node.childElementCount === 0),
      `runtime 403/${action}: session rows were retained`);
    assert(!(await page.locator('#sessionDialog').evaluate((node) => node.open)),
      `runtime 403/${action}: detail dialog remained open`);
    assert(await page.locator('#navOnlineCount').evaluate((node) =>
      node.hidden && node.textContent === '0' && node.getClientRects().length === 0),
      `runtime 403/${action}: stale online badge remained visible`);
    assert(await page.locator('#accessDenied a[href]').evaluate((node) => node === document.activeElement),
      `runtime 403/${action}: focus did not move to the cabinet login action`);
    assert(watch.faults.length === 0, `runtime 403/${action}: ${watch.faults.join(' | ')}`);
    assert(watch.external.length === 0, `runtime 403/${action}: external requests ${watch.external.join(', ')}`);
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  await context.addCookies([{ name: 'analytics_mode', value: 'late_detail', url: origin }]);
  const page = await context.newPage();
  const watch = watchPage(page, origin, true);
  await page.goto(origin + '/admin-analytics.html', { waitUntil: 'networkidle' });
  await waitLoaded(page);
  const detailRequest = page.waitForRequest((request) => /\/api\/admin\/analytics\/session\//.test(request.url()));
  await page.locator('#sessionRows [data-session]').first().click();
  await detailRequest;
  await page.keyboard.press('Escape');
  await context.addCookies([{ name: 'analytics_mode', value: 'forbidden', url: origin }]);
  await page.locator('#loadMore').click();
  await page.waitForSelector('#accessDenied:not([hidden])');
  await page.waitForTimeout(500);
  assert(await page.locator('#sessionDetail').evaluate((node) => node.childElementCount === 0),
    'runtime 403/race: delayed detail repopulated the purged DOM');
  assert(!(await page.locator('#sessionDetail').textContent()).includes('П-LATE-SECRET'),
    'runtime 403/race: delayed private label survived authorization loss');
  assert(await page.locator('#navOnlineCount').evaluate((node) =>
    node.hidden && node.textContent === '0' && node.getClientRects().length === 0),
    'runtime 403/race: stale online badge remained visible');
  assert(watch.faults.length === 0, `runtime 403/race: ${watch.faults.join(' | ')}`);
  assert(watch.external.length === 0, `runtime 403/race: external requests ${watch.external.join(', ')}`);
  await context.close();
}

async function checkCabinetDeepLink(browser, origin) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  const page = await context.newPage();
  await page.goto(origin + '/admin-analytics.html', { waitUntil: 'networkidle' });
  await waitLoaded(page);
  const saved = await page.evaluate(() => {
    localStorage.setItem('ag_tab', JSON.stringify('orders'));
    const link = document.querySelector('[data-admin-nav-link][href="admin.html#summary"]');
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
    link.click();
    return JSON.parse(localStorage.getItem('ag_tab'));
  });
  assert(saved === 'summary', `cabinet deep link: stale tab won (${saved})`);
  await context.close();
}

async function checkCabinetSearchHandoff(browser, origin) {
  const cabinetOrigin = origin.replace('127.0.0.1', 'akademsalon.ru');
  const scenarios = [
    { name: 'shortcut', viewport: { width: 1024, height: 900 }, run: (page) => page.keyboard.press('Meta+K') },
    { name: 'sidebar', viewport: { width: 1024, height: 900 }, run: (page) => page.locator('.admin-sidebar__search').click() },
    { name: 'mobile', viewport: { width: 390, height: 844 }, run: (page) => page.locator('.admin-mobile-appbar__search').click() }
  ];
  for (const scenario of scenarios) {
    const context = await browser.newContext({ viewport: scenario.viewport });
    const page = await context.newPage();
    const watch = watchPage(page, cabinetOrigin, true);
    await page.goto(cabinetOrigin + '/admin-analytics.html', { waitUntil: 'networkidle' });
    await waitLoaded(page);
    await scenario.run(page);
    try {
      await page.waitForSelector('#agQ', { timeout: 8000 });
    } catch (error) {
      const diagnostic = await page.evaluate(() => ({
        url: location.href,
        text: document.body.innerText.slice(0, 500),
        marker: sessionStorage.getItem('ag_focus_search'),
        saved: localStorage.getItem('ag_tab')
      }));
      throw new Error(`cabinet search/${scenario.name}: ${JSON.stringify(diagnostic)}; ${watch.faults.join(' | ')}`);
    }
    await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'agQ');
    assert(new URL(page.url()).pathname === '/admin.html',
      `cabinet search/${scenario.name}: did not enter the real cabinet`);
    assert(await page.locator('#agQ').evaluate((node) => node === document.activeElement),
      `cabinet search/${scenario.name}: order search was not focused`);
    assert(await page.evaluate(() => sessionStorage.getItem('ag_focus_search')) === null,
      `cabinet search/${scenario.name}: one-shot focus marker was retained`);
    assert(await page.evaluate(() => JSON.parse(localStorage.getItem('ag_tab'))) === 'orders',
      `cabinet search/${scenario.name}: Orders tab was not persisted`);
    await context.close();
  }
}

async function checkRaceAndPagination(browser, origin, requests) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  const page = await context.newPage();
  const watch = watchPage(page, origin, true);
  await page.goto(origin + '/admin-analytics.html', { waitUntil: 'networkidle' });
  await waitLoaded(page);
  assert(!(await page.locator('#loadMore').evaluate((node) => node.hidden)), 'race: initial cursor is not available');
  await page.locator('#loadMore').click();
  await page.waitForFunction(() => document.querySelector('#loadMore').hidden);
  assert(await page.locator('#loadMore').evaluate((node) => node.getClientRects().length === 0),
    'race: exhausted pagination remained visually present');

  await page.locator('#sourceFilter').selectOption('external');
  await page.locator('#applyFilters').click();
  await page.waitForFunction(() => document.querySelector('#message').textContent.includes('не ответил'));
  assert(await page.locator('#loadMore').evaluate((node) => node.hidden), 'race: stale cursor remained actionable after failed filter');
  assert(await page.locator('#sourceFilter').inputValue() === '', 'race: failed draft filter was shown as applied');
  assert((await page.locator('#periodCaption').textContent()).includes('7 дней'), 'race: old dataset lost its applied period label');

  await page.locator('#sessionRows [data-session]').first().click();
  await page.waitForSelector('#sessionDialog[open]');
  await page.waitForSelector('#sessionDetail .aa-timeline li');
  const lastDetail = [...requests].reverse().find((entry) => /\/session\//.test(entry));
  assert(lastDetail && /hours=168/.test(lastDetail), `race: detail used the wrong query (${lastDetail || 'none'})`);
  await page.keyboard.press('Escape');

  await page.locator('[data-hours="24"]').click();
  await page.locator('[data-hours="2160"]').click();
  await page.waitForFunction(() => document.querySelector('#periodCaption').textContent.includes('90 дней'));
  assert((await page.locator('#sessionRows').textContent()).includes('С-2160-1'), 'race: latest 90-day response did not win');
  assert(!(await page.locator('#sessionRows').textContent()).includes('С-168-1'), 'race: previous rows leaked into the new dataset');
  await page.waitForTimeout(250);
  assert((await page.locator('#periodCaption').textContent()).includes('90 дней'), 'race: delayed 24-hour failure overwrote 90-day data');
  assert(watch.faults.length === 0, `race: ${watch.faults.join(' | ')}`);
  assert(watch.external.length === 0, `race: external requests ${watch.external.join(', ')}`);
  await context.close();
}

async function main() {
  fs.mkdirSync(OUTPUT, { recursive: true });
  const requests = [];
  const server = createServer(requests);
  const origin = await listen(server);
  const { chromium } = loadPlaywright();
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--host-resolver-rules=MAP akademsalon.ru 127.0.0.1']
    });
    const geometry = [];
    for (const viewport of VIEWPORTS) geometry.push(await checkLayout(browser, origin, viewport));
    await checkForbidden(browser, origin);
    await checkForbiddenAfterData(browser, origin);
    await checkCabinetDeepLink(browser, origin);
    await checkCabinetSearchHandoff(browser, origin);
    await checkRaceAndPagination(browser, origin, requests);
    console.log(JSON.stringify({
      ok: true,
      viewports: VIEWPORTS.map((item, index) => ({ ...item, ...geometry[index] })),
      forbidden: 'isolated',
      runtime_forbidden: 'isolated',
      cabinet_deep_link: 'explicit',
      cabinet_search_handoff: 'focused',
      race_and_pagination: 'isolated',
      screenshots: OUTPUT,
      analytics_requests: requests.length
    }, null, 2));
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
