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
const DEFAULT_PAGES = [
  'index.html',
  'tariffs.html',
  'zayavka.html',
  'dashboard.html',
  'configurator.html?step=2',
  'configurator.html?step=4'
];
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

  const header = await page.evaluate(() => {
    const element = document.querySelector('.site-header');
    if (!element) return null;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (element.hidden || style.display === 'none' || style.visibility === 'hidden') return null;
    return {
      position: style.position,
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      hiddenClass: element.classList.contains('hide'),
      bodyHiddenClass: document.body.classList.contains('header-hidden')
    };
  });

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
  if (header && (
    header.position !== 'fixed' ||
    header.top < -1 ||
    header.bottom <= 0 ||
    header.hiddenClass ||
    header.bodyHiddenClass
  )) {
    failures.push(`fixed header left viewport after scroll: ${JSON.stringify(header)}`);
  }
  const dockOverlaps = dock.flatMap((item) =>
    item.overlaps.map((overlap) => `${item.selector} → ${overlap}`)
  );
  if (dockOverlaps.length) {
    failures.push(`fixed dock overlaps: ${dockOverlaps.join(', ')}`);
  }

  return { theme, overflow, cta, homeHero, header, dock, failures };
}

async function inspectMobileHeaderMenu(page) {
  await page.waitForFunction(() => {
    const toggle = document.querySelector('.menu-toggle');
    const toc = document.getElementById('toc');
    return toggle && toc && window.Salon && Salon.toc;
  }, null, { timeout: 10_000 });

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(80);

  const header = await page.evaluate(() => {
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 &&
        rect.height > 0;
    };
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    };
    const overlap = (a, b) =>
      a.right > b.left + 1 && a.left < b.right - 1 &&
      a.bottom > b.top + 1 && a.top < b.bottom - 1;
    const siteHeader = document.querySelector('.site-header');
    const controls = [
      document.querySelector('.site-header .brand'),
      document.querySelector('.site-header .nav-cab'),
      document.querySelector('.site-header .menu-toggle')
    ].filter(Boolean).map((element) => ({
      selector: element.classList.contains('brand') ? '.brand' :
        element.classList.contains('nav-cab') ? '.nav-cab' : '.menu-toggle',
      visible: visible(element),
      box: box(element),
      label: element.getAttribute('aria-label') || String(element.textContent || '').trim()
    }));
    const overlaps = [];
    for (let i = 0; i < controls.length; i += 1) {
      for (let j = i + 1; j < controls.length; j += 1) {
        if (overlap(controls[i].box, controls[j].box)) {
          overlaps.push(`${controls[i].selector} ↔ ${controls[j].selector}`);
        }
      }
    }
    const toggle = document.querySelector('.menu-toggle');
    return {
      visible: visible(siteHeader),
      position: getComputedStyle(siteHeader).position,
      box: box(siteHeader),
      controls,
      overlaps,
      viewport: { width: innerWidth, height: innerHeight },
      toggle: {
        expanded: toggle.getAttribute('aria-expanded'),
        controls: toggle.getAttribute('aria-controls'),
        label: toggle.getAttribute('aria-label')
      }
    };
  });

  const failures = [];
  if (!header.visible || !['fixed', 'sticky'].includes(header.position)) {
    failures.push(`mobile header: visibility/position=${JSON.stringify(header)}`);
  }
  if (header.box.left < -1 ||
      header.box.right > header.viewport.width + 1 ||
      header.box.top < -1 ||
      header.box.bottom > header.viewport.height + 1) {
    failures.push(`mobile header clipped: ${JSON.stringify(header.box)}`);
  }
  if (header.controls.length !== 3) {
    failures.push(`mobile header controls: expected 3, got ${header.controls.length}`);
  }
  for (const control of header.controls) {
    if (!control.visible ||
        control.box.width < 44 ||
        control.box.height < 44 ||
        control.box.left < -1 ||
        control.box.right > header.viewport.width + 1) {
      failures.push(`mobile header target ${control.selector}: ${JSON.stringify(control)}`);
    }
  }
  if (header.overlaps.length) {
    failures.push(`mobile header overlaps: ${header.overlaps.join(', ')}`);
  }
  if (header.toggle.expanded !== 'false' ||
      header.toggle.controls !== 'toc' ||
      header.toggle.label !== 'Открыть меню') {
    failures.push(`mobile menu initial ARIA: ${JSON.stringify(header.toggle)}`);
  }

  await page.click('.menu-toggle');
  await page.waitForFunction(() => document.getElementById('toc')?.classList.contains('open'));
  await page.waitForTimeout(450);
  const openState = await page.evaluate(() => {
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    };
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 &&
        rect.height > 0;
    };
    const toggle = document.querySelector('.menu-toggle');
    const toc = document.getElementById('toc');
    const tocHead = toc.querySelector('.toc-head');
    const tocTitle = toc.querySelector('.toc-title');
    const close = toc.querySelector('.toc-close');
    const search = toc.querySelector('#tocQ');
    const routeLink = toc.querySelector('.toc-route .tr-head>a');
    const directory = toc.querySelector('.toc-directory>summary');
    const keyTargets = [
      close,
      search,
      ...Array.from(toc.querySelectorAll('.toc-choice')),
      routeLink,
      directory
    ].filter(Boolean).map((element) => ({
      selector: element === close ? '.toc-close' :
        element === search ? '#tocQ' :
        element === routeLink ? '.toc-route .tr-head>a' :
        element === directory ? '.toc-directory>summary' :
        '.toc-choice',
      visible: visible(element),
      box: box(element)
    }));
    const siblings = ['.site-header', 'main', '.site-footer', '.mobile-cta']
      .map((selector) => {
        const element = document.querySelector(selector);
        return element ? {
          selector,
          inert: element.hasAttribute('inert')
        } : null;
      }).filter(Boolean);
    return {
      open: toc.classList.contains('open'),
      role: toc.getAttribute('role'),
      ariaModal: toc.getAttribute('aria-modal'),
      ariaLabelledBy: toc.getAttribute('aria-labelledby'),
      dialog: box(toc),
      head: box(tocHead),
      title: box(tocTitle),
      close: box(close),
      search: box(search),
      titleCloseOverlap: (() => {
        const a = tocTitle.getBoundingClientRect();
        const b = close.getBoundingClientRect();
        return a.right > b.left + 1 && a.left < b.right - 1 &&
          a.bottom > b.top + 1 && a.top < b.bottom - 1;
      })(),
      headSearchOverlap: (() => {
        const a = tocHead.getBoundingClientRect();
        const b = search.getBoundingClientRect();
        return a.right > b.left + 1 && a.left < b.right - 1 &&
          a.bottom > b.top + 1 && a.top < b.bottom - 1;
      })(),
      tocOverflowY: getComputedStyle(toc).overflowY,
      bodyLocked: document.body.classList.contains('toc-lock'),
      bodyOverflow: getComputedStyle(document.body).overflow,
      bodyPosition: getComputedStyle(document.body).position,
      scrollingElement: document.scrollingElement === document.body ? 'body' : 'html',
      scrollingOverflow: getComputedStyle(document.scrollingElement).overflow,
      toggleExpanded: toggle.getAttribute('aria-expanded'),
      toggleLabel: toggle.getAttribute('aria-label'),
      activeClass: document.activeElement?.className || '',
      activeLabel: document.activeElement?.getAttribute('aria-label') || '',
      keyTargets,
      siblings,
      scrollY: Math.round(scrollY),
      viewport: { width: innerWidth, height: innerHeight }
    };
  });

  if (!openState.open ||
      openState.role !== 'dialog' ||
      openState.ariaModal !== 'true' ||
      openState.ariaLabelledBy !== 'tocTitle') {
    failures.push(`mobile menu dialog semantics: ${JSON.stringify(openState)}`);
  }
  if (openState.toggleExpanded !== 'true' ||
      openState.toggleLabel !== 'Закрыть меню') {
    failures.push(
      `mobile menu open ARIA: expanded=${openState.toggleExpanded}, label=${openState.toggleLabel}`
    );
  }
  if (openState.activeLabel !== 'Закрыть меню') {
    failures.push(
      `mobile menu open focus: class=${openState.activeClass}, label=${openState.activeLabel}`
    );
  }
  if (!openState.bodyLocked ||
      !/(hidden|clip)/.test(openState.bodyOverflow) ||
      (openState.scrollingElement === 'html' &&
        !/(hidden|clip)/.test(openState.scrollingOverflow) &&
        openState.bodyPosition !== 'fixed') ||
      !/(auto|scroll)/.test(openState.tocOverflowY)) {
    failures.push(
      `mobile menu scroll lock: bodyClass=${openState.bodyLocked}, bodyOverflow=${openState.bodyOverflow}, bodyPosition=${openState.bodyPosition}, scrolling=${openState.scrollingElement}/${openState.scrollingOverflow}, tocOverflow=${openState.tocOverflowY}`
    );
  }
  if (openState.dialog.left < -1 ||
      openState.dialog.right > openState.viewport.width + 1 ||
      openState.dialog.top < -1 ||
      openState.dialog.bottom > openState.viewport.height + 1) {
    failures.push(`mobile menu dialog clipped: ${JSON.stringify(openState.dialog)}`);
  }
  if (openState.head.top > 1 ||
      openState.head.left < -1 ||
      openState.head.right > openState.viewport.width + 1 ||
      openState.titleCloseOverlap ||
      openState.headSearchOverlap) {
    failures.push(
      `mobile menu sticky head: head=${JSON.stringify(openState.head)}, title=${JSON.stringify(openState.title)}, close=${JSON.stringify(openState.close)}, search=${JSON.stringify(openState.search)}, titleOverlap=${openState.titleCloseOverlap}, searchOverlap=${openState.headSearchOverlap}`
    );
  }
  if (openState.siblings.some((item) => !item.inert)) {
    failures.push(`mobile menu background not inert: ${JSON.stringify(openState.siblings)}`);
  }
  for (const target of openState.keyTargets) {
    if (!target.visible || target.box.width < 44 || target.box.height < 44) {
      failures.push(`mobile menu target ${target.selector}: ${JSON.stringify(target)}`);
    }
  }

  await page.fill('#tocQ', 'оплата');
  await page.waitForTimeout(60);
  const searchState = await page.evaluate(() => ({
    results: document.querySelectorAll('#tocSR a.dotrow').length,
    homeHidden: Array.from(document.querySelectorAll('[data-toc-home]')).every((element) =>
      element.hidden && getComputedStyle(element).display === 'none'
    ),
    overflow: document.documentElement.scrollWidth - innerWidth
  }));
  if (searchState.results < 1 || !searchState.homeHidden || searchState.overflow > 1) {
    failures.push(`mobile menu search state: ${JSON.stringify(searchState)}`);
  }
  await page.fill('#tocQ', '');
  await page.waitForTimeout(40);
  await page.focus('.toc-close');

  await page.keyboard.press('Shift+Tab');
  const backwardsTrap = await page.evaluate(() => ({
    inside: document.getElementById('toc')?.contains(document.activeElement),
    selector: document.activeElement?.className || document.activeElement?.id || ''
  }));
  await page.keyboard.press('Tab');
  const forwardsTrap = await page.evaluate(() => ({
    inside: document.getElementById('toc')?.contains(document.activeElement),
    label: document.activeElement?.getAttribute('aria-label') || '',
    selector: document.activeElement?.className || document.activeElement?.id || ''
  }));
  if (!backwardsTrap.inside ||
      !forwardsTrap.inside ||
      forwardsTrap.label !== 'Закрыть меню') {
    failures.push(
      `mobile menu focus trap: backwards=${JSON.stringify(backwardsTrap)}, forwards=${JSON.stringify(forwardsTrap)}`
    );
  }

  let wheelSupported = true;
  try {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(80);
  } catch (error) {
    if (/not supported in mobile WebKit/i.test(error.message)) wheelSupported = false;
    else throw error;
  }
  const scrollLock = await page.evaluate(({ before, supported }) => {
    const state = {
      supported,
      before,
      after: Math.round(scrollY),
      tocScrollTop: Math.round(document.getElementById('toc')?.scrollTop || 0)
    };
    window.scrollTo(0, before);
    return state;
  }, { before: openState.scrollY, supported: wheelSupported });
  if (scrollLock.supported && scrollLock.after !== scrollLock.before) {
    failures.push(`mobile menu background scrolled: ${JSON.stringify(scrollLock)}`);
  }

  await page.keyboard.press('Escape');
  await page.waitForTimeout(50);
  const escapeClose = await page.evaluate(() => ({
    open: document.getElementById('toc')?.classList.contains('open'),
    expanded: document.querySelector('.menu-toggle')?.getAttribute('aria-expanded'),
    label: document.querySelector('.menu-toggle')?.getAttribute('aria-label'),
    activeIsToggle: document.activeElement === document.querySelector('.menu-toggle'),
    bodyLocked: document.body.classList.contains('toc-lock'),
    backgroundInert: ['.site-header', 'main', '.site-footer', '.mobile-cta']
      .map((selector) => document.querySelector(selector))
      .filter(Boolean)
      .some((element) => element.hasAttribute('inert'))
  }));
  if (escapeClose.open ||
      escapeClose.expanded !== 'false' ||
      escapeClose.label !== 'Открыть меню' ||
      !escapeClose.activeIsToggle ||
      escapeClose.bodyLocked ||
      escapeClose.backgroundInert) {
    failures.push(`mobile menu Escape close: ${JSON.stringify(escapeClose)}`);
  }

  await page.click('.menu-toggle');
  await page.waitForFunction(() => document.getElementById('toc')?.classList.contains('open'));
  await page.click('.toc-close');
  await page.waitForTimeout(50);
  const closeButton = await page.evaluate(() => ({
    open: document.getElementById('toc')?.classList.contains('open'),
    expanded: document.querySelector('.menu-toggle')?.getAttribute('aria-expanded'),
    activeIsToggle: document.activeElement === document.querySelector('.menu-toggle'),
    bodyLocked: document.body.classList.contains('toc-lock')
  }));
  if (closeButton.open ||
      closeButton.expanded !== 'false' ||
      !closeButton.activeIsToggle ||
      closeButton.bodyLocked) {
    failures.push(`mobile menu close button: ${JSON.stringify(closeButton)}`);
  }

  await page.click('.menu-toggle');
  await page.waitForFunction(() => document.getElementById('toc')?.classList.contains('open'));
  const outsideClose = await page.evaluate(() => {
    const toc = document.getElementById('toc');
    toc.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 1,
      clientY: 1
    }));
    return {
      open: toc.classList.contains('open'),
      expanded: document.querySelector('.menu-toggle')?.getAttribute('aria-expanded'),
      bodyLocked: document.body.classList.contains('toc-lock')
    };
  });
  if (outsideClose.open || outsideClose.expanded !== 'false' || outsideClose.bodyLocked) {
    failures.push(`mobile menu outside click does not close: ${JSON.stringify(outsideClose)}`);
    await page.evaluate(() => window.Salon?.toc?.close());
  }

  return {
    header,
    openState,
    searchState,
    backwardsTrap,
    forwardsTrap,
    scrollLock,
    escapeClose,
    closeButton,
    outsideClose,
    failures
  };
}

async function inspectConfiguratorStep2(page) {
  await page.waitForFunction(() => {
    const title = document.getElementById('ws2t');
    const step = title && title.closest('.wstep');
    const mobileEdition = document.querySelector('link[data-mobile-edition]');
    return step && step.classList.contains('active') &&
      mobileEdition && mobileEdition.sheet &&
      document.getElementById('wpLbl') &&
      document.getElementById('mBack') &&
      document.getElementById('mNext');
  }, null, { timeout: 10_000 });

  const layout = await page.evaluate(() => {
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return !element.hidden &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 &&
        rect.height > 0;
    };
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    };
    const overlap = (a, b) =>
      a.right > b.left + 1 && a.left < b.right - 1 &&
      a.bottom > b.top + 1 && a.top < b.bottom - 1;

    const activeSteps = Array.from(document.querySelectorAll('.wstep.active'));
    const dock = document.getElementById('confMcta');
    const bar = dock && dock.querySelector('.mq-bar');
    const controls = [
      document.getElementById('mBack'),
      document.getElementById('mqToggle'),
      document.getElementById('mNext')
    ].filter(Boolean);
    const controlBoxes = controls.map((element) => ({
      selector: element.id ? `#${element.id}` : '.cart-tab',
      visible: visible(element),
      ariaLabel: element.getAttribute('aria-label') || '',
      text: String(element.textContent || '').replace(/\s+/g, ' ').trim(),
      box: box(element)
    }));
    const overlaps = [];
    for (let i = 0; i < controlBoxes.length; i += 1) {
      for (let j = i + 1; j < controlBoxes.length; j += 1) {
        if (overlap(controlBoxes[i].box, controlBoxes[j].box)) {
          overlaps.push(`${controlBoxes[i].selector} ↔ ${controlBoxes[j].selector}`);
        }
      }
    }

    const fill = document.getElementById('wpFill');
    return {
      activeStepCount: activeSteps.length,
      activeStepTitle: activeSteps[0] &&
        String(activeSteps[0].querySelector('.ws-title')?.textContent || '').trim(),
      laterClass: document.body.classList.contains('conf-step-later'),
      progressLabel: String(document.getElementById('wpLbl')?.textContent || '').trim(),
      progressFill: fill ? parseFloat(getComputedStyle(fill).width) /
        Math.max(1, parseFloat(getComputedStyle(fill.parentElement).width)) : 0,
      helpFabs: Array.from(document.querySelectorAll('.helpfab')).map((element) => ({
        visible: visible(element),
        text: String(element.textContent || '').replace(/\s+/g, ' ').trim(),
        box: box(element)
      })),
      introVisible: visible(document.querySelector('.conf-head')),
      cartTabVisible: visible(bar && bar.querySelector('.cart-tab')),
      dock: dock ? {
        visible: visible(dock),
        position: getComputedStyle(dock).position,
        box: box(dock)
      } : null,
      controls: controlBoxes,
      overlaps,
      viewport: { width: innerWidth, height: innerHeight },
      desktopNextVisible: visible(document.getElementById('btnNext'))
    };
  });

  const failures = [];
  if (layout.activeStepCount !== 1 || !/направление/i.test(layout.activeStepTitle || '')) {
    failures.push(
      `configurator step 2: active=${layout.activeStepCount}, title=${layout.activeStepTitle || 'none'}`
    );
  }
  if (!layout.laterClass) failures.push('configurator step 2: body.conf-step-later missing');
  if (layout.progressLabel !== 'Шаг 2 из 4' || Math.abs(layout.progressFill - 0.5) > 0.03) {
    failures.push(
      `configurator progress: label=${layout.progressLabel || 'none'}, fill=${Math.round(layout.progressFill * 100)}%`
    );
  }
  if (layout.helpFabs.some((item) => item.visible)) {
    failures.push(`configurator top nudge .helpfab is visible: ${JSON.stringify(layout.helpFabs)}`);
  }
  if (layout.introVisible) failures.push('configurator step 2: introductory .conf-head still visible');
  if (layout.cartTabVisible) failures.push('configurator action bar: .cart-tab must stay hidden');
  if (!layout.dock || !layout.dock.visible || layout.dock.position !== 'fixed') {
    failures.push('configurator action bar: not visible/fixed');
  } else {
    if (layout.dock.box.left < -1 ||
        layout.dock.box.right > layout.viewport.width + 1 ||
        layout.dock.box.bottom > layout.viewport.height + 1) {
      failures.push(`configurator action bar: clipped ${JSON.stringify(layout.dock.box)}`);
    }
    if (layout.controls.length !== 3) {
      failures.push(`configurator action bar: expected 3 controls, got ${layout.controls.length}`);
    }
    for (const control of layout.controls) {
      if (!control.visible) failures.push(`configurator action bar: ${control.selector} hidden`);
      if (control.box.height < 44 || control.box.width < 44) {
        failures.push(
          `configurator action bar: ${control.selector} touch target ${control.box.width}×${control.box.height}`
        );
      }
    }
    if (layout.overlaps.length) {
      failures.push(`configurator action bar overlaps: ${layout.overlaps.join(', ')}`);
    }
    const back = layout.controls.find((item) => item.selector === '#mBack');
    const next = layout.controls.find((item) => item.selector === '#mNext');
    const total = layout.controls.find((item) => item.selector === '#mqToggle');
    if (!back || !back.visible) failures.push('configurator action bar: back unavailable on step 2');
    if (!next || next.text !== 'Далее') {
      failures.push(`configurator action bar: next copy=${next ? next.text : 'none'}`);
    }
    if (!total || !/Итого/.test(total.text) || !/Смета/.test(total.text)) {
      failures.push(`configurator action bar: total copy=${total ? total.text : 'none'}`);
    }
  }
  if (layout.desktopNextVisible) {
    failures.push('configurator action bar: desktop #btnNext is also visible');
  }

  await page.evaluate(() => document.getElementById('mqToggle')?.click());
  await page.waitForTimeout(80);
  const panel = await page.evaluate(() => {
    const element = document.getElementById('mqPanel');
    const bar = document.querySelector('#confMcta .mq-bar');
    const rect = element && element.getBoundingClientRect();
    const barRect = bar && bar.getBoundingClientRect();
    const style = element && getComputedStyle(element);
    return {
      visible: !!(element && !element.hidden && style.display !== 'none'),
      expanded: document.getElementById('mqToggle')?.getAttribute('aria-expanded'),
      box: rect ? {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        height: Math.round(rect.height)
      } : null,
      barTop: barRect ? Math.round(barRect.top) : null,
      overflowY: style && style.overflowY,
      maxHeight: style && style.maxHeight,
      clientHeight: element && element.clientHeight,
      scrollHeight: element && element.scrollHeight,
      viewport: { width: innerWidth, height: innerHeight }
    };
  });
  if (!panel.visible || panel.expanded !== 'true') {
    failures.push('configurator estimate panel: #mqPanel did not open');
  } else {
    if (!panel.box ||
        panel.box.left < -1 ||
        panel.box.right > panel.viewport.width + 1 ||
        panel.box.top < -1 ||
        panel.box.bottom > panel.viewport.height + 1 ||
        (panel.barTop !== null && panel.box.bottom > panel.barTop + 1)) {
      failures.push(`configurator estimate panel: clipped/overlapping ${JSON.stringify(panel)}`);
    }
    if (panel.box.height > panel.viewport.height * 0.56 + 2) {
      failures.push(
        `configurator estimate panel: height ${panel.box.height}px exceeds 56vh`
      );
    }
    if (!/(auto|scroll)/.test(panel.overflowY || '')) {
      failures.push(
        `configurator estimate panel: overflow-y=${panel.overflowY || 'unset'}`
      );
    }
  }
  await page.evaluate(() => document.getElementById('mqToggle')?.click());
  await page.waitForTimeout(50);

  await page.evaluate(() => document.getElementById('mBack')?.click());
  await page.waitForFunction(() => {
    const title = document.getElementById('ws1t');
    return title?.closest('.wstep')?.classList.contains('active');
  });
  const backState = await page.evaluate(() => ({
    label: document.getElementById('wpLbl')?.textContent.trim(),
    backHidden: document.getElementById('mBack')?.hidden,
    laterClass: document.body.classList.contains('conf-step-later')
  }));
  if (backState.label !== 'Шаг 1 из 4' || !backState.backHidden || backState.laterClass) {
    failures.push(`configurator action bar back: ${JSON.stringify(backState)}`);
  }
  await page.evaluate(() => document.getElementById('mNext')?.click());
  await page.waitForFunction(() => {
    const title = document.getElementById('ws2t');
    return title?.closest('.wstep')?.classList.contains('active');
  });
  const nextState = await page.evaluate(() => ({
    label: document.getElementById('wpLbl')?.textContent.trim(),
    backHidden: document.getElementById('mBack')?.hidden,
    laterClass: document.body.classList.contains('conf-step-later')
  }));
  if (nextState.label !== 'Шаг 2 из 4' || nextState.backHidden || !nextState.laterClass) {
    failures.push(`configurator action bar next: ${JSON.stringify(nextState)}`);
  }

  await page.evaluate(() => {
    const progress = document.querySelector('.wprog');
    if (!progress) return;
    const stickyTop = parseFloat(getComputedStyle(progress).top) || 58;
    window.scrollTo(0, window.scrollY + progress.getBoundingClientRect().top - stickyTop);
  });
  await page.waitForTimeout(80);
  const sticky = await page.evaluate(() => {
    const progress = document.querySelector('.wprog');
    const title = document.getElementById('ws2t');
    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return {
        left: Math.round(value.left),
        top: Math.round(value.top),
        right: Math.round(value.right),
        bottom: Math.round(value.bottom)
      };
    };
    return {
      position: getComputedStyle(progress).position,
      cssTop: parseFloat(getComputedStyle(progress).top),
      progress: rect(progress),
      title: rect(title),
      helpVisible: Array.from(document.querySelectorAll('.helpfab')).some((element) => {
        const style = getComputedStyle(element);
        const value = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' &&
          value.width > 0 && value.height > 0;
      })
    };
  });
  if (sticky.position !== 'sticky' ||
      sticky.progress.top < sticky.cssTop - 1 ||
      sticky.progress.bottom > sticky.title.top + 1) {
    failures.push(`configurator sticky progress overlap: ${JSON.stringify(sticky)}`);
  }
  if (sticky.helpVisible) failures.push('configurator top nudge .helpfab became visible after scroll');

  return { layout, panel, backState, nextState, sticky, failures };
}

async function inspectConfiguratorStep4(page) {
  await page.waitForFunction(() => {
    const title = document.getElementById('ws4t');
    const step = title && title.closest('.wstep');
    const mobileEdition = document.querySelector('link[data-mobile-edition]');
    return step && step.classList.contains('active') &&
      mobileEdition && mobileEdition.sheet &&
      document.body.classList.contains('conf-step-final') &&
      document.getElementById('fContact') &&
      document.getElementById('fConsent') &&
      document.getElementById('mNext');
  }, null, { timeout: 10_000 });

  const layout = await page.evaluate(() => {
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return !element.hidden &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 &&
        rect.height > 0;
    };
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    };
    const overlap = (a, b) =>
      a.right > b.left + 1 && a.left < b.right - 1 &&
      a.bottom > b.top + 1 && a.top < b.bottom - 1;
    const activeSteps = Array.from(document.querySelectorAll('.wstep.active'));
    const dock = document.getElementById('confMcta');
    const bar = dock && dock.querySelector('.mq-bar');
    const controls = [
      document.getElementById('mBack'),
      document.getElementById('mqToggle'),
      document.getElementById('mNext')
    ].filter(Boolean);
    const controlBoxes = controls.map((element) => ({
      selector: `#${element.id}`,
      visible: visible(element),
      text: String(element.textContent || '').replace(/\s+/g, ' ').trim(),
      box: box(element)
    }));
    const overlaps = [];
    for (let i = 0; i < controlBoxes.length; i += 1) {
      for (let j = i + 1; j < controlBoxes.length; j += 1) {
        if (overlap(controlBoxes[i].box, controlBoxes[j].box)) {
          overlaps.push(`${controlBoxes[i].selector} ↔ ${controlBoxes[j].selector}`);
        }
      }
    }
    const labels = ['fTopic', 'fDeadline', 'fDetails', 'fFiles', 'fContact'].map((id) => ({
      id,
      label: String(document.querySelector(`label[for="${id}"]`)?.textContent || '')
        .replace(/\s+/g, ' ').trim(),
      visible: visible(document.getElementById(id)) ||
        (id === 'fFiles' && visible(document.getElementById('attAdd')))
    }));
    const contactChips = Array.from(document.querySelectorAll('#ctChips .ct-chip')).map((element) => ({
      text: String(element.textContent || '').trim(),
      selected: element.classList.contains('on'),
      visible: visible(element),
      box: box(element)
    }));
    const fill = document.getElementById('wpFill');
    const consent = document.getElementById('fConsent');
    const consentLabel = consent && consent.closest('label');
    return {
      activeStepCount: activeSteps.length,
      activeStepTitle: activeSteps[0] &&
        String(activeSteps[0].querySelector('.ws-title')?.textContent || '').trim(),
      laterClass: document.body.classList.contains('conf-step-later'),
      finalClass: document.body.classList.contains('conf-step-final'),
      progressLabel: String(document.getElementById('wpLbl')?.textContent || '').trim(),
      progressFill: fill ? parseFloat(getComputedStyle(fill).width) /
        Math.max(1, parseFloat(getComputedStyle(fill.parentElement).width)) : 0,
      helpVisible: Array.from(document.querySelectorAll('.helpfab')).some(visible),
      introVisible: visible(document.querySelector('.conf-head')),
      cartTabVisible: visible(bar && bar.querySelector('.cart-tab')),
      dock: dock ? {
        visible: visible(dock),
        position: getComputedStyle(dock).position,
        box: box(dock)
      } : null,
      controls: controlBoxes,
      overlaps,
      labels,
      nameVisible: visible(document.getElementById('fName')),
      sectionOrder: ['.final-contact', '.final-files', '.final-task'].map((selector) => {
        const element = document.querySelector(selector);
        return {
          selector,
          top: element ? Math.round(element.getBoundingClientRect().top + scrollY) : -1,
          visible: visible(element)
        };
      }),
      contactChips,
      initialContact: (() => {
        const input = document.getElementById('fContact');
        return {
          type: input.type,
          inputMode: input.getAttribute('inputmode'),
          autocomplete: input.getAttribute('autocomplete'),
          enterKeyHint: input.getAttribute('enterkeyhint'),
          placeholder: input.placeholder,
          fontSize: parseFloat(getComputedStyle(input).fontSize)
        };
      })(),
      attachment: (() => {
        const button = document.getElementById('attAdd');
        return {
          visible: visible(button),
          describedBy: button?.getAttribute('aria-describedby') || '',
          box: button ? box(button) : null
        };
      })(),
      consent: {
        visible: visible(consent),
        wrappedByLabel: !!consentLabel,
        labelText: String(consentLabel?.textContent || '').replace(/\s+/g, ' ').trim()
      },
      desktopSubmitVisible: visible(document.getElementById('btnSubmit')),
      viewport: { width: innerWidth, height: innerHeight }
    };
  });

  const failures = [];
  if (layout.activeStepCount !== 1 || !/заявка мастеру/i.test(layout.activeStepTitle || '')) {
    failures.push(
      `configurator step 4: active=${layout.activeStepCount}, title=${layout.activeStepTitle || 'none'}`
    );
  }
  if (!layout.laterClass || !layout.finalClass) {
    failures.push(
      `configurator step 4: body classes later=${layout.laterClass}, final=${layout.finalClass}`
    );
  }
  if (layout.progressLabel !== 'Шаг 4 из 4' || Math.abs(layout.progressFill - 1) > 0.03) {
    failures.push(
      `configurator step 4 progress: label=${layout.progressLabel || 'none'}, fill=${Math.round(layout.progressFill * 100)}%`
    );
  }
  if (layout.helpVisible) failures.push('configurator step 4: .helpfab is visible');
  if (layout.introVisible) failures.push('configurator step 4: introductory .conf-head still visible');
  if (layout.cartTabVisible) failures.push('configurator step 4: .cart-tab must stay hidden');
  if (!layout.dock || !layout.dock.visible || layout.dock.position !== 'fixed') {
    failures.push('configurator step 4 action bar: not visible/fixed');
  } else {
    if (layout.dock.box.left < -1 ||
        layout.dock.box.right > layout.viewport.width + 1 ||
        layout.dock.box.bottom > layout.viewport.height + 1) {
      failures.push(`configurator step 4 action bar: clipped ${JSON.stringify(layout.dock.box)}`);
    }
    if (layout.controls.length !== 3) {
      failures.push(`configurator step 4 action bar: expected 3 controls, got ${layout.controls.length}`);
    }
    for (const control of layout.controls) {
      if (!control.visible) failures.push(`configurator step 4 action bar: ${control.selector} hidden`);
      if (control.box.height < 44 || control.box.width < 44) {
        failures.push(
          `configurator step 4 action bar: ${control.selector} touch target ${control.box.width}×${control.box.height}`
        );
      }
    }
    if (layout.overlaps.length) {
      failures.push(`configurator step 4 action bar overlaps: ${layout.overlaps.join(', ')}`);
    }
    const next = layout.controls.find((item) => item.selector === '#mNext');
    if (!next || next.text !== 'Отправить') {
      failures.push(`configurator step 4 submit copy=${next ? next.text : 'none'}`);
    }
  }
  if (layout.desktopSubmitVisible) {
    failures.push('configurator step 4: desktop #btnSubmit is also visible');
  }
  for (const field of layout.labels) {
    if (!field.label || !field.visible) {
      failures.push(`configurator step 4 field ${field.id}: label/visibility=${JSON.stringify(field)}`);
    }
  }
  if (layout.nameVisible) {
    failures.push('configurator step 4: optional name field should stay hidden on mobile');
  }
  if (layout.sectionOrder.some((item) => !item.visible) ||
      !(layout.sectionOrder[0].top < layout.sectionOrder[1].top &&
        layout.sectionOrder[1].top < layout.sectionOrder[2].top)) {
    failures.push(`configurator step 4 section order: ${JSON.stringify(layout.sectionOrder)}`);
  }
  if (!layout.attachment.visible ||
      !layout.attachment.box ||
      layout.attachment.box.height < 44 ||
      layout.attachment.describedBy !== 'attHint') {
    failures.push(`configurator attachments trigger: ${JSON.stringify(layout.attachment)}`);
  }
  if (layout.contactChips.length !== 5 ||
      layout.contactChips.filter((item) => item.selected).length !== 1 ||
      layout.contactChips.some((item) => !item.visible || item.box.height < 44)) {
    failures.push(`configurator contact chips: ${JSON.stringify(layout.contactChips)}`);
  }
  if (layout.initialContact.type !== 'text' ||
      layout.initialContact.inputMode !== 'text' ||
      layout.initialContact.autocomplete !== 'off' ||
      layout.initialContact.enterKeyHint !== 'done' ||
      !/@nickname/i.test(layout.initialContact.placeholder) ||
      layout.initialContact.fontSize < 16) {
    failures.push(`configurator Telegram field metadata: ${JSON.stringify(layout.initialContact)}`);
  }
  if (!layout.consent.visible ||
      !layout.consent.wrappedByLabel ||
      !/обработку данных/i.test(layout.consent.labelText)) {
    failures.push(`configurator consent label: ${JSON.stringify(layout.consent)}`);
  }

  await page.evaluate(() => {
    const contact = document.getElementById('fContact');
    const consent = document.getElementById('fConsent');
    contact.value = '';
    contact.dispatchEvent(new Event('input', { bubbles: true }));
    consent.checked = false;
    consent.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('mNext')?.click();
  });
  await page.waitForTimeout(80);
  const emptyValidation = await page.evaluate(() => ({
    activeId: document.activeElement?.id || '',
    contactInvalid: document.getElementById('fContact')?.getAttribute('aria-invalid'),
    consentInvalid: document.getElementById('fConsent')?.getAttribute('aria-invalid'),
    step4Active: document.getElementById('ws4t')?.closest('.wstep')?.classList.contains('active')
  }));
  if (emptyValidation.activeId !== 'fContact' ||
      emptyValidation.contactInvalid !== 'true' ||
      !emptyValidation.step4Active) {
    failures.push(`configurator empty contact validation: ${JSON.stringify(emptyValidation)}`);
  }

  await page.fill('#fContact', 'not-a-contact');
  await page.click('#mNext');
  await page.waitForTimeout(80);
  const invalidValidation = await page.evaluate(() => ({
    activeId: document.activeElement?.id || '',
    invalid: document.getElementById('fContact')?.getAttribute('aria-invalid'),
    value: document.getElementById('fContact')?.value
  }));
  if (invalidValidation.activeId !== 'fContact' ||
      invalidValidation.invalid !== 'true' ||
      invalidValidation.value !== 'not-a-contact') {
    failures.push(`configurator invalid contact validation: ${JSON.stringify(invalidValidation)}`);
  }

  await page.click('#ctChips [data-ct="em"]');
  await page.waitForTimeout(30);
  const emailMode = await page.evaluate(() => {
    const input = document.getElementById('fContact');
    const selected = document.querySelector('#ctChips .ct-chip.on');
    return {
      selected: selected?.getAttribute('data-ct') || '',
      type: input.type,
      inputMode: input.getAttribute('inputmode'),
      autocomplete: input.getAttribute('autocomplete'),
      enterKeyHint: input.getAttribute('enterkeyhint'),
      placeholder: input.placeholder,
      activeId: document.activeElement?.id || ''
    };
  });
  if (emailMode.selected !== 'em' ||
      emailMode.type !== 'email' ||
      emailMode.inputMode !== 'email' ||
      emailMode.autocomplete !== 'email' ||
      emailMode.enterKeyHint !== 'done' ||
      emailMode.placeholder !== 'you@mail.ru' ||
      emailMode.activeId !== 'fContact') {
    failures.push(`configurator email mode: ${JSON.stringify(emailMode)}`);
  }

  await page.fill('#fContact', 'student@example.com');
  await page.click('#mNext');
  await page.waitForTimeout(80);
  const consentValidation = await page.evaluate(() => ({
    activeId: document.activeElement?.id || '',
    consentInvalid: document.getElementById('fConsent')?.getAttribute('aria-invalid'),
    contactInvalid: document.getElementById('fContact')?.getAttribute('aria-invalid'),
    step4Active: document.getElementById('ws4t')?.closest('.wstep')?.classList.contains('active')
  }));
  if (consentValidation.activeId !== 'fConsent' ||
      consentValidation.consentInvalid !== 'true' ||
      !consentValidation.step4Active) {
    failures.push(`configurator consent validation: ${JSON.stringify(consentValidation)}`);
  }

  const firstAttachment = {
    name: 'method-guide.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 mobile smoke')
  };
  await page.setInputFiles('#fFiles', firstAttachment);
  await page.setInputFiles('#fFiles', firstAttachment);
  let attachments = await page.evaluate(() => ({
    hidden: document.getElementById('attList')?.hidden,
    count: document.querySelectorAll('#attList .att-item').length,
    names: Array.from(document.querySelectorAll('#attList .ai-name'))
      .map((element) => element.textContent.trim()),
    removeLabels: Array.from(document.querySelectorAll('#attList [data-att-x]'))
      .map((element) => element.getAttribute('aria-label') || '')
  }));
  if (attachments.hidden ||
      attachments.count !== 1 ||
      attachments.names[0] !== firstAttachment.name ||
      !attachments.removeLabels[0]?.includes(firstAttachment.name)) {
    failures.push(`configurator attachment add/dedupe: ${JSON.stringify(attachments)}`);
  }

  const extraAttachments = Array.from({ length: 6 }, (_, index) => ({
    name: `brief-${index + 1}.txt`,
    mimeType: 'text/plain',
    buffer: Buffer.from(`mobile smoke attachment ${index + 1}`)
  }));
  await page.setInputFiles('#fFiles', extraAttachments);
  attachments = await page.evaluate(() => ({
    hidden: document.getElementById('attList')?.hidden,
    count: document.querySelectorAll('#attList .att-item').length,
    names: Array.from(document.querySelectorAll('#attList .ai-name'))
      .map((element) => element.textContent.trim())
  }));
  if (attachments.hidden || attachments.count !== 5) {
    failures.push(`configurator attachment limit: ${JSON.stringify(attachments)}`);
  }
  await page.click('#attList [data-att-x]');
  const attachmentRemoval = await page.evaluate(() => ({
    hidden: document.getElementById('attList')?.hidden,
    count: document.querySelectorAll('#attList .att-item').length,
    firstName: document.querySelector('#attList .ai-name')?.textContent.trim() || ''
  }));
  if (attachmentRemoval.hidden ||
      attachmentRemoval.count !== 4 ||
      attachmentRemoval.firstName === firstAttachment.name) {
    failures.push(`configurator attachment removal: ${JSON.stringify(attachmentRemoval)}`);
  }

  await page.evaluate(() => {
    const input = document.getElementById('fContact');
    input.scrollIntoView({ block: 'center' });
    input.focus();
  });
  await page.waitForTimeout(80);
  const focusedField = await page.evaluate(() => {
    const input = document.getElementById('fContact');
    const rect = input.getBoundingClientRect();
    return {
      activeId: document.activeElement?.id || '',
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      fontSize: parseFloat(getComputedStyle(input).fontSize),
      viewport: { width: innerWidth, height: innerHeight }
    };
  });
  if (focusedField.activeId !== 'fContact' ||
      focusedField.fontSize < 16 ||
      focusedField.left < -1 ||
      focusedField.right > focusedField.viewport.width + 1 ||
      focusedField.top < -1 ||
      focusedField.bottom > focusedField.viewport.height + 1) {
    failures.push(`configurator focused contact field: ${JSON.stringify(focusedField)}`);
  }

  const keyboardState = await page.evaluate(() => {
    const testStyle = document.createElement('style');
    testStyle.id = 'mobile-smoke-no-dock-transition';
    testStyle.textContent = '.mobile-cta{transition:none!important}';
    document.head.appendChild(testStyle);
    document.documentElement.classList.add('keyboard-open');
    const dock = document.getElementById('confMcta');
    void dock.offsetHeight;
    const rect = dock.getBoundingClientRect();
    const style = getComputedStyle(dock);
    const state = {
      keyboardClass: document.documentElement.classList.contains('keyboard-open'),
      transform: style.transform,
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      viewportHeight: innerHeight,
      activeId: document.activeElement?.id || ''
    };
    document.documentElement.classList.remove('keyboard-open');
    void dock.offsetHeight;
    return state;
  });
  if (!keyboardState.keyboardClass ||
      keyboardState.transform === 'none' ||
      keyboardState.top < keyboardState.viewportHeight ||
      keyboardState.activeId !== 'fContact') {
    failures.push(`configurator keyboard-open state: ${JSON.stringify(keyboardState)}`);
  }
  const dockRestored = await page.evaluate(() => {
    const dock = document.getElementById('confMcta');
    const rect = dock.getBoundingClientRect();
    return {
      keyboardClass: document.documentElement.classList.contains('keyboard-open'),
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      viewportHeight: innerHeight
    };
  });
  if (dockRestored.keyboardClass ||
      dockRestored.top >= dockRestored.viewportHeight ||
      dockRestored.bottom > dockRestored.viewportHeight + 1) {
    failures.push(`configurator action bar restore: ${JSON.stringify(dockRestored)}`);
  }

  return {
    layout,
    emptyValidation,
    invalidValidation,
    emailMode,
    consentValidation,
    attachments,
    attachmentRemoval,
    focusedField,
    keyboardState,
    dockRestored,
    failures
  };
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
                localStorage.removeItem('salon_draft');
                localStorage.removeItem('salon_cart_v1');
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
            let headerMenuInspection = null;
            let configuratorInspection = null;
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
              if (pageName === 'index.html') {
                headerMenuInspection = await inspectMobileHeaderMenu(page);
                if (options.screenshots) {
                  await page.reload({ waitUntil: 'domcontentloaded' });
                  await page.waitForTimeout(700);
                  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
                  await page.click('.menu-toggle');
                  await page.waitForFunction(() =>
                    document.getElementById('toc')?.classList.contains('open')
                  );
                  await page.waitForTimeout(450);
                  const menuPath = path.join(
                    OUTPUT_ROOT,
                    `${label}-menu-open.png`
                  );
                  fs.mkdirSync(path.dirname(menuPath), { recursive: true });
                  await page.screenshot({ path: menuPath, fullPage: false });
                  await page.keyboard.press('Escape');
                  await page.waitForTimeout(50);
                }
              }
              if (/^configurator\.html\?step=2(?:&|$)/.test(pageName)) {
                configuratorInspection = await inspectConfiguratorStep2(page);
                if (options.screenshots) {
                  await page.evaluate(() => document.getElementById('mqToggle')?.click());
                  await page.waitForTimeout(80);
                  const panelPath = path.join(
                    OUTPUT_ROOT,
                    `${label}-estimate-panel.png`
                  );
                  const viewportPath = path.join(
                    OUTPUT_ROOT,
                    `${label}-step2-viewport.png`
                  );
                  fs.mkdirSync(path.dirname(panelPath), { recursive: true });
                  await page.screenshot({ path: panelPath, fullPage: false });
                  await page.evaluate(() => document.getElementById('mqToggle')?.click());
                  await page.waitForTimeout(50);
                  await page.screenshot({ path: viewportPath, fullPage: false });
                }
              }
              if (/^configurator\.html\?step=4(?:&|$)/.test(pageName)) {
                configuratorInspection = await inspectConfiguratorStep4(page);
                if (options.screenshots) {
                  const formPath = path.join(
                    OUTPUT_ROOT,
                    `${label}-step4-form.png`
                  );
                  const keyboardPath = path.join(
                    OUTPUT_ROOT,
                    `${label}-step4-keyboard-state.png`
                  );
                  fs.mkdirSync(path.dirname(formPath), { recursive: true });
                  await page.screenshot({ path: formPath, fullPage: false });
                  await page.evaluate(() => {
                    const style = document.createElement('style');
                    style.id = 'mobile-smoke-keyboard-screenshot';
                    style.textContent =
                      'html[data-smoke-keyboard] .mobile-cta{transform:translateY(110%)!important;transition:none!important}';
                    document.head.appendChild(style);
                    document.documentElement.setAttribute('data-smoke-keyboard', '');
                  });
                  await page.screenshot({ path: keyboardPath, fullPage: false });
                  await page.evaluate(() => {
                    document.documentElement.removeAttribute('data-smoke-keyboard');
                    document.getElementById('mobile-smoke-keyboard-screenshot')?.remove();
                  });
                }
              }
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
              ...(headerMenuInspection ? headerMenuInspection.failures : []),
              ...(configuratorInspection ? configuratorInspection.failures : []),
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
