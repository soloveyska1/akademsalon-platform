const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/js/configurator-nav-guard.js'), 'utf8');

function runtime() {
  const listeners = new Map();
  const timers = [];
  const context = {
    window: {},
    location: { href: 'https://akademsalon.ru/', origin: 'https://akademsalon.ru' },
    URL,
    document: {
      addEventListener(name, fn, options) { listeners.set(`document:${name}`, { fn, options }); },
    },
    addEventListener(name, fn) { listeners.set(`window:${name}`, { fn }); },
    setTimeout(fn, delay) { timers.push({ fn, delay }); return timers.length; },
    clearTimeout() {},
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'configurator-nav-guard.js' });
  return { listeners, timers };
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

test('one unmodified activation stays native while rapid repeats are blocked', () => {
  const r = runtime();
  const handler = r.listeners.get('document:click');
  assert.ok(handler);
  assert.equal(handler.options.capture, true);
  const anchor = link();
  const first = clickEvent(anchor);
  handler.fn(first);
  assert.equal(first.prevented, false);
  assert.equal(first.stopped, false);
  assert.equal(anchor.getAttribute('aria-busy'), 'true');
  assert.match(anchor.innerHTML, /Открываем/u);

  const second = clickEvent(anchor);
  handler.fn(second);
  assert.equal(second.prevented, true);
  assert.equal(second.stopped, true);
  assert.equal(r.timers.length, 1);
  assert.equal(r.timers[0].delay, 20000);
});

test('pageshow restores the original control and modified clicks remain untouched', () => {
  const r = runtime();
  const handler = r.listeners.get('document:click').fn;
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
});

test('every analytics-enabled public page loads the one-flight guard before analytics', () => {
  const pages = fs.readdirSync(root).filter((file) => file.endsWith('.html'));
  let consumers = 0;
  for (const file of pages) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    const analyticsAt = html.indexOf('assets/js/analytics-v2.js?v=20260829analytics4');
    if (analyticsAt < 0) continue;
    consumers += 1;
    const guardAt = html.indexOf('assets/js/configurator-nav-guard.js?v=20260829nav1');
    assert.ok(guardAt > 0 && guardAt < analyticsAt, file);
  }
  assert.equal(consumers, 87);
});
