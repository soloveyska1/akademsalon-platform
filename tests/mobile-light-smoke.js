#!/usr/bin/env node
'use strict';

/*
 * Mobile light-theme smoke test for the static site.
 *
 * Zero-install run:
 *   node tests/mobile-light-smoke.js
 *
 * Useful variants:
 *   node tests/mobile-light-smoke.js --browser=all
 *   node tests/mobile-light-smoke.js --browser=webkit --headed
 *   node tests/mobile-light-smoke.js --pages=index.html,tariffs.html
 *
 * Screenshots are written to output/playwright/mobile-light/.
 */

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PLAYWRIGHT_VERSION = '1.60.0';
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_ROOT = path.join(ROOT, 'output', 'playwright', 'mobile-light');
const DEFAULT_PAGES = ['index.html', 'tariffs.html', 'zayavka.html', 'dashboard.html'];
const VIEWPORTS = [
  { name: 'iphone-320', width: 320, height: 568 },
  { name: 'iphone-390', width: 390, height: 844 },
  { name: 'iphone-430', width: 430, height: 932 }
];

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (error) {
    if (process.env.MOBILE_SMOKE_BOOTSTRAPPED === '1') throw error;

    const shell = [
      'export NODE_PATH="$(dirname "$(dirname "$(command -v playwright)")")"',
      'export MOBILE_SMOKE_BOOTSTRAPPED=1',
      'exec node "$@"'
    ].join('; ');
    const result = spawnSync(
      'npm',
      [
        'exec',
        '--yes',
        `--package=playwright@${PLAYWRIGHT_VERSION}`,
        '--',
        'sh',
        '-c',
        shell,
        '_',
        __filename,
        ...process.argv.slice(2)
      ],
      { cwd: ROOT, env: process.env, stdio: 'inherit' }
    );

    if (result.error) {
      console.error(`Не удалось запустить Playwright через npx: ${result.error.message}`);
      process.exit(2);
    }
    process.exit(result.status === null ? 2 : result.status);
  }
}

function parseArgs(argv) {
  const options = {
    browser: process.env.SMOKE_BROWSER || 'webkit',
    pages: (process.env.SMOKE_PAGES || DEFAULT_PAGES.join(',')).split(','),
    headed: false,
    screenshots: true
  };

  for (const arg of argv) {
    if (arg === '--headed') options.headed = true;
    else if (arg === '--no-screenshots') options.screenshots = false;
    else if (arg.startsWith('--browser=')) options.browser = arg.slice('--browser='.length);
    else if (arg.startsWith('--pages=')) options.pages = arg.slice('--pages='.length).split(',');
    else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: node tests/mobile-light-smoke.js [options]',
        '',
        '  --browser=webkit|chromium|all  Browser engine (default: webkit)',
        '  --pages=a.html,b.html          Comma-separated pages',
        '  --headed                      Show the browser window',
        '  --no-screenshots              Do not save full-page screenshots'
      ].join('\n'));
      process.exit(0);
    } else {
      throw new Error(`Неизвестный аргумент: ${arg}`);
    }
  }

  options.pages = options.pages
    .map((page) => page.trim().replace(/^\/+/, ''))
    .filter(Boolean);

  if (!['webkit', 'chromium', 'all'].includes(options.browser)) {
    throw new Error(`Неизвестный browser: ${options.browser}`);
  }
  if (!options.pages.length) throw new Error('Список страниц пуст');
  return options;
}

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function startStaticServer() {
  const server = http.createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch {
      response.writeHead(400).end('Bad request');
      return;
    }

    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filePath = path.resolve(ROOT, relative);
    if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }

    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      response.writeHead(404).end('Not found');
      return;
    }
    if (!stat.isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }

    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
    });
    if (request.method === 'HEAD') response.end();
    else fs.createReadStream(filePath).pipe(response);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        baseURL: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done) => server.close(done))
      });
    });
  });
}

function sanitizePageName(pageName) {
  return pageName.replace(/\.html$/i, '').replace(/[^a-z0-9_-]+/gi, '-');
}

async function inspectPage(page, ctaRequired) {
  const theme = await page.evaluate(() => ({
    dataTheme: document.documentElement.getAttribute('data-theme'),
    prefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
    storedTheme: localStorage.getItem('salon_theme')
  }));

  const overflow = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const root = document.documentElement;
    const scrolling = document.scrollingElement || root;
    const width = Math.max(root.scrollWidth, document.body.scrollWidth, scrolling.scrollWidth);
    const isVisible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 &&
        rect.height > 0;
    };
    const inHorizontalScroller = (element) => {
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (/(auto|scroll)/.test(style.overflowX) && parent.scrollWidth > parent.clientWidth + 1) return true;
      }
      return false;
    };
    const offenders = Array.from(document.querySelectorAll('body *'))
      .filter(isVisible)
      .filter((element) => !inHorizontalScroller(element))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          selector: element.id ? `#${element.id}` :
            `${element.tagName.toLowerCase()}${element.classList.length ? `.${Array.from(element.classList).slice(0, 3).join('.')}` : ''}`,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width)
        };
      })
      .filter((item) => item.left < -1 || item.right > viewportWidth + 1)
      .sort((a, b) => Math.max(-a.left, a.right - viewportWidth) - Math.max(-b.left, b.right - viewportWidth))
      .slice(-8);

    return {
      viewportWidth,
      scrollWidth: width,
      delta: width - viewportWidth,
      offenders
    };
  });

  const cta = await page.evaluate((required) => {
    const targets = ['Рассчитать за минуту', 'Смета за минуту', 'Открыть формуляр'];
    const normalized = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 &&
        rect.height > 0;
    };
    const matches = Array.from(document.querySelectorAll('a, button'))
      .filter((element) => {
        if (!visible(element)) return false;
        const label = normalized(element.textContent);
        return targets.some((target) => label.includes(target));
      })
      .map((element) => element.id ? `#${element.id}` :
        `${element.tagName.toLowerCase()}${element.classList.length ? `.${Array.from(element.classList).join('.')}` : ''}`);
    return { count: matches.length, matches, required };
  }, ctaRequired);

  const homeHero = await page.evaluate((required) => {
    if (!required) return null;
    const visible = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 &&
        rect.height > 0;
    };
    return {
      bookVisible: visible('.pr-bookwrap'),
      proofVisible: visible('.pr-note'),
      storyVisible: visible('.story-chip')
    };
  }, ctaRequired);

  await page.evaluate(() => {
    const scrolling = document.scrollingElement || document.documentElement;
    window.scrollTo(0, scrolling.scrollHeight);
  });
  await page.waitForTimeout(100);

  const dock = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 &&
        rect.height > 0;
    };
    const selectorFor = (element) => element.id ? `#${element.id}` :
      `${element.tagName.toLowerCase()}${element.classList.length ? `.${Array.from(element.classList).slice(0, 3).join('.')}` : ''}`;
    const docks = Array.from(document.querySelectorAll('.mobile-cta, .cabdock'))
      .filter(visible)
      .filter((element) => getComputedStyle(element).position === 'fixed');
    const contentSelector = [
      'main a', 'main button', 'main input', 'main textarea', 'main select',
      'main h1', 'main h2', 'main h3', 'main h4', 'main p', 'main li'
    ].join(',');

    return docks.map((item) => {
      const rect = item.getBoundingClientRect();
      const overlaps = Array.from(document.querySelectorAll(contentSelector))
        .filter(visible)
        .filter((element) => !item.contains(element))
        .filter((element) => {
          const candidate = element.getBoundingClientRect();
          return candidate.right > rect.left + 1 &&
            candidate.left < rect.right - 1 &&
            candidate.bottom > rect.top + 1 &&
            candidate.top < rect.bottom - 1;
        })
        .map(selectorFor)
        .slice(0, 10);
      return {
        selector: selectorFor(item),
        top: Math.round(rect.top),
        height: Math.round(rect.height),
        overlaps
      };
    });
  });

  const failures = [];
  if (theme.dataTheme === 'dark' || theme.prefersDark || theme.storedTheme !== 'light') {
    failures.push(`theme=${JSON.stringify(theme)}`);
  }
  if (overflow.delta > 1) {
    failures.push(`horizontal overflow +${overflow.delta}px; offenders=${JSON.stringify(overflow.offenders)}`);
  }
  if (cta.count > 1 || (cta.required && cta.count !== 1)) {
    failures.push(`основных CTA быстрого расчёта: ${cta.count}; matches=${cta.matches.join(', ') || 'none'}`);
  }
  if (homeHero && (homeHero.bookVisible || homeHero.proofVisible || homeHero.storyVisible)) {
    failures.push(`перегруженный hero=${JSON.stringify(homeHero)}`);
  }
  const dockOverlaps = dock.flatMap((item) =>
    item.overlaps.map((overlap) => `${item.selector} → ${overlap}`)
  );
  if (dockOverlaps.length) {
    failures.push(`fixed dock overlaps: ${dockOverlaps.join(', ')}`);
  }

  return { theme, overflow, cta, homeHero, dock, failures };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const playwright = loadPlaywright();
  const server = await startStaticServer();
  const browserNames = options.browser === 'all' ? ['webkit', 'chromium'] : [options.browser];
  const results = [];

  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  console.log(`Static site: ${server.baseURL}`);
  console.log(`Light scheme: forced; pages: ${options.pages.join(', ')}`);

  try {
    for (const browserName of browserNames) {
      let browser;
      try {
        browser = await playwright[browserName].launch({ headless: !options.headed });
      } catch (error) {
        console.error(`\nНе удалось запустить ${browserName}: ${error.message}`);
        console.error(
          `Установите совместимый runtime: npx playwright@${PLAYWRIGHT_VERSION} install ${browserName}`
        );
        process.exitCode = 2;
        continue;
      }

      try {
        for (const viewport of VIEWPORTS) {
          for (const pageName of options.pages) {
            const context = await browser.newContext({
              colorScheme: 'light',
              deviceScaleFactor: 2,
              hasTouch: true,
              isMobile: true,
              locale: 'ru-RU',
              reducedMotion: 'reduce',
              userAgent: browserName === 'webkit'
                ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
                : undefined,
              viewport: { width: viewport.width, height: viewport.height }
            });
            await context.addInitScript(() => {
              try {
                localStorage.setItem('salon_theme', 'light');
                localStorage.setItem('salon_calm', '1');
                const now = new Date();
                localStorage.setItem('salon_consent', JSON.stringify({
                  v: 2,
                  document: 'analytics-consent-2.0',
                  necessary: true,
                  analytics: false,
                  action: 'reject',
                  source: 'mobile-smoke',
                  at: now.toISOString(),
                  expiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString()
                }));
              } catch {}
            });

            const page = await context.newPage();
            const consoleErrors = [];
            page.on('console', (message) => {
              if (message.type() === 'error') consoleErrors.push(`console: ${message.text()}`);
            });
            page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

            const label = `${browserName}/${sanitizePageName(pageName)}-${viewport.width}`;
            const url = `${server.baseURL}/${pageName}`;
            let inspection = null;
            let navigationError = null;
            try {
              const response = await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 20_000
              });
              if (!response || !response.ok()) {
                navigationError = `HTTP ${response ? response.status() : 'no response'}`;
              }
              await page.waitForTimeout(700);
              await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
              inspection = await inspectPage(page, pageName === 'index.html');
              if (options.screenshots) {
                const screenshotPath = path.join(OUTPUT_ROOT, `${label}.png`);
                fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
                await page.screenshot({ path: screenshotPath, fullPage: true });
              }
            } catch (error) {
              navigationError = error.message;
            }

            const failures = [
              ...(navigationError ? [`navigation: ${navigationError}`] : []),
              ...(inspection ? inspection.failures : []),
              ...consoleErrors
            ];
            results.push({
              browser: browserName,
              page: pageName,
              viewport: viewport.width,
              failures
            });
            console.log(`${failures.length ? 'FAIL' : 'PASS'} ${label}`);
            for (const failure of failures) console.log(`  - ${failure}`);
            await context.close();
          }
        }
      } finally {
        await browser.close();
      }
    }
  } finally {
    await server.close();
  }

  const failed = results.filter((result) => result.failures.length);
  console.log(`\nResult: ${results.length - failed.length}/${results.length} passed`);
  if (options.screenshots) console.log(`Screenshots: ${OUTPUT_ROOT}`);
  if (failed.length || process.exitCode) process.exitCode = process.exitCode || 1;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 2;
});
