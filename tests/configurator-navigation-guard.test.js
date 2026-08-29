const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/js/configurator-nav-guard.js'), 'utf8');
const analyticsSource = fs.readFileSync(path.join(root, 'assets/js/analytics-v2.js'), 'utf8');

function runtime(seed = {}) {
  const listeners = new Map();
  const timers = [];
  const localValues = new Map(Object.entries(seed.local || {}));
  const sessionValues = new Map(Object.entries(seed.session || {}));
  const location = {
    href: 'https://akademsalon.ru/services.html?service=diplom#price',
    origin: 'https://akademsalon.ru', pathname: '/services.html',
    search: '?service=diplom', hash: '#price',
  };
  const applyUrl = (value) => {
    const url = new URL(value, location.href);
    Object.assign(location, {
      href: url.href, origin: url.origin, pathname: url.pathname,
      search: url.search, hash: url.hash,
    });
  };
  const storage = (values) => ({
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  });
  const context = {
    window: {},
    location,
    history: { state: { safe: true }, replaceState(_state, _title, value) { applyUrl(value); } },
    localStorage: storage(localValues),
    sessionStorage: storage(sessionValues),
    URL,
    document: {
      addEventListener(name, fn, options) { listeners.set(`document:${name}`, { fn, options }); },
    },
    addEventListener(name, fn, options) { listeners.set(`window:${name}`, { fn, options }); },
    setTimeout(fn, delay) { timers.push({ fn, delay }); return timers.length; },
    clearTimeout() {},
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'configurator-nav-guard.js' });
  return { listeners, timers, context };
}

function link(href = '/configurator.html') {
  const attributes = new Map([['href', href]]);
  return {
    innerHTML: 'Подобрать следующий шаг <span aria-hidden="true">→</span>',
    target: '', download: false,
    closest(selector) { return selector === 'a[href]' ? this : null; },
    getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null; },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
    hasAttribute(name) { return attributes.has(name); },
  };
}

function clickEvent(target, extra = {}) {
  return {
    target, button: 0, defaultPrevented: false,
    metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
    prevented: false, stopped: false,
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.stopped = true; },
    ...extra,
  };
}

test('one unmodified activation stays native while rapid repeats are blocked before telemetry', async () => {
  const r = runtime();
  const handler = r.listeners.get('window:click');
  assert.ok(handler);
  assert.equal(handler.options.capture, true);
  const anchor = link();
  let telemetry = 0;
  const first = clickEvent(anchor);
  handler.fn(first);
  if (!first.stopped) telemetry += 1;
  assert.equal(first.prevented, false);
  assert.equal(first.stopped, false);
  assert.equal(anchor.getAttribute('aria-busy'), 'true');
  assert.equal(anchor.getAttribute('aria-label'), 'Открываем конфигуратор');

  const second = clickEvent(anchor);
  handler.fn(second);
  if (!second.stopped) telemetry += 1;
  assert.equal(second.prevented, true);
  assert.equal(second.stopped, true);
  assert.equal(telemetry, 1);
  await Promise.resolve();
  assert.match(anchor.innerHTML, /Открываем/u);
  assert.equal(r.timers.length, 1);
  assert.equal(r.timers[0].delay, 20000);
});

test('pageshow restores the original control and modified clicks remain untouched', () => {
  const r = runtime();
  const handler = r.listeners.get('window:click').fn;
  const anchor = link();
  const modified = clickEvent(anchor, { metaKey: true });
  handler(modified);
  assert.equal(anchor.hasAttribute('aria-busy'), false);

  handler(clickEvent(anchor));
  r.listeners.get('window:pageshow').fn();
  assert.equal(anchor.hasAttribute('aria-busy'), false);
  assert.match(anchor.innerHTML, /Подобрать следующий шаг/u);

  const external = link('https://example.org/configurator.html');
  handler(clickEvent(external));
  assert.equal(external.hasAttribute('aria-busy'), false);

  const download = link();
  download.setAttribute('download', '');
  handler(clickEvent(download));
  assert.equal(download.hasAttribute('aria-busy'), false);
});

test('owner and QA bootstrap analytics preview only during shared-runtime startup', () => {
  for (const seed of [
    { local: { salon_analytics_owner_device_v1: JSON.stringify({ v: 1 }) } },
    { session: { salon_analytics_qa_session_v1: '1' } },
  ]) {
    const r = runtime(seed);
    assert.match(r.context.location.search, /desktop-preview=1/);
    assert.equal(r.context.window.__salonAnalyticsOriginalUrl,
      '/services.html?service=diplom#price');
    r.listeners.get('document:DOMContentLoaded').fn();
    assert.equal(r.context.location.href,
      'https://akademsalon.ru/services.html?service=diplom#price');
    assert.equal('__salonAnalyticsOriginalUrl' in r.context.window, false);
  }
  const restoreAt = analyticsSource.indexOf('__salonAnalyticsOriginalUrl');
  const runtimeGateAt = analyticsSource.indexOf('if (!window.Salon || !Salon.store || !Salon.consent)');
  assert.ok(restoreAt > 0 && restoreAt < runtimeGateAt,
    'analytics v2 must restore the clean URL before its own runtime gates');
});

test('every analytics-enabled page boots exclusion guard before shared runtime and analytics', () => {
  const pages = fs.readdirSync(root).filter((file) => file.endsWith('.html'));
  let consumers = 0;
  for (const file of pages) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    const analyticsAt = html.indexOf('assets/js/analytics-v2.js?v=20260829analytics4');
    if (analyticsAt < 0) continue;
    consumers += 1;
    const guardAt = html.indexOf('assets/js/configurator-nav-guard.js?v=20260829nav2');
    const runtimeAt = Math.max(
      html.indexOf('assets/js/app.js'),
      html.indexOf('assets/js/home-release.min.js'),
    );
    assert.ok(guardAt > 0 && guardAt < runtimeAt && runtimeAt < analyticsAt, file);
  }
  assert.equal(consumers, 87);
});
