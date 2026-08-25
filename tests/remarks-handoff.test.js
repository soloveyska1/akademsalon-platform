const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function runHandoffScript({ session = {}, local = {}, throwingGetters = false } = {}) {
  const source = read('assets/js/remarks-handoff.js');
  const sessionStorage = memoryStorage(session);
  const localStorage = memoryStorage(local);
  const browserWindow = {};
  if (throwingGetters) {
    Object.defineProperties(browserWindow, {
      sessionStorage: { get() { throw new Error('session blocked'); } },
      localStorage: { get() { throw new Error('local blocked'); } },
    });
  } else {
    browserWindow.sessionStorage = sessionStorage;
    browserWindow.localStorage = localStorage;
  }
  const context = {
    window: browserWindow,
    document: {
      querySelector() { return null; },
      querySelectorAll() { return []; },
    },
    location: { pathname: '/dosie-nauchruka.html', href: '' },
    sessionStorage,
    localStorage,
    URL,
    console,
  };
  vm.runInNewContext(source, context, { filename: 'remarks-handoff.js' });
  return {
    contract: context.window.SalonRemarksHandoffContract,
    sessionStorage,
    localStorage,
  };
}

function handoffContract() {
  return runHandoffScript().contract;
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} exists`);
  const open = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return vm.runInNewContext(`(${source.slice(start, index + 1)})`);
    }
  }
  throw new Error(`unterminated ${name}`);
}

test('remarks handoff builder is finite, bounded and contains no source or identity fields', () => {
  const contract = handoffContract();
  assert.ok(contract);
  assert.equal(contract.KEY, 'salon_remarks_handoff_v1');
  assert.equal(contract.TTL_MS, 10 * 60 * 1000);
  assert.equal(contract.MAX_LENGTH, 800);
  assert.equal(contract.build('коротко', 123), null);
  const built = contract.build('  ' + 'а'.repeat(900) + '  ', 123);
  assert.deepEqual(JSON.parse(JSON.stringify(built)), {
    v: 1,
    kind: 'remarks',
    text: 'а'.repeat(800),
    created_at: 123,
  });
});

test('dossier uses one session handoff and a code-only estimate URL', () => {
  const html = read('dosie-nauchruka.html');
  const source = read('assets/js/remarks-handoff.js');
  assert.match(html, /Вставьте замечания — мы перенесём их в заявку/u);
  assert.match(html, /Не указывайте ФИО, контакты/u);
  assert.match(html, /Перейти к смете/u);
  assert.match(html, /assets\/js\/remarks-handoff\.js\?v=20260825rescue1/u);
  assert.doesNotMatch(html, /data-generic-tool-submit/u);
  assert.match(source, /Нижняя ссылка открывает маршрут отдельно, без текста/u);
  assert.match(source, /sessionStorage\.setItem\(KEY/u);
  assert.match(source, /configurator\.html\?situation=comments&result=diagnostic&route=page&handoff=remarks/u);
  assert.match(source, /LEGACY_SESSION_KEY = 'salon_editor_brief'/u);
  assert.match(source, /LEGACY_LOCAL_KEY = 'salon_prefill_comment'/u);
});

test('dossier scrubs both legacy private-text stores without touching unrelated state', () => {
  const run = runHandoffScript({
    session: { salon_editor_brief: '{"message":"legacy"}', keep_session: 'yes' },
    local: { salon_prefill_comment: 'legacy text', keep_local: 'yes' },
  });
  assert.equal(run.sessionStorage.getItem('salon_editor_brief'), null);
  assert.equal(run.localStorage.getItem('salon_prefill_comment'), null);
  assert.equal(run.sessionStorage.getItem('keep_session'), 'yes');
  assert.equal(run.localStorage.getItem('keep_local'), 'yes');
});

test('blocked storage getters fail closed without breaking the dossier handoff UI', () => {
  const run = runHandoffScript({ throwingGetters: true });
  assert.ok(run.contract);
  assert.equal(run.contract.KEY, 'salon_remarks_handoff_v1');
});

test('configurator defers valid consumption through draft choice and resolves both branches', () => {
  const html = read('configurator.html');
  const readBlock = html.slice(
    html.indexOf('function readIncomingRemarksHandoff'),
    html.indexOf('var remarksHandoff = readIncomingRemarksHandoff'),
  );
  assert.ok(
    readBlock.indexOf("return { expected:true, status:'imported', text:text };") <
      readBlock.indexOf('sessionStorage.removeItem(REMARKS_HANDOFF_KEY)'),
    'a valid record returns before cleanup and survives until the explicit draft choice',
  );
  assert.match(html, /function dropIncomingRemarksHandoff/u);
  assert.match(html, /function applyPendingRoute[\s\S]{0,1200}dropIncomingRemarksHandoff\(\)/u);
  assert.match(html, /function continueSavedRoute[\s\S]{0,600}dropIncomingRemarksHandoff\(\)/u);
  assert.match(html, /Новые замечания в этот черновик не добавятся/u);
  assert.match(html, /Перенесённые замечания будут добавлены/u);

  const resolveChoice = extractFunction(html, 'resolveRemarksDraftChoice');
  const incoming = { expected: true, status: 'imported', text: 'Новые замечания' };
  const startNew = resolveChoice(incoming, 'new', 'Старый комментарий');
  assert.equal(startNew.comment, 'Новые замечания');
  assert.equal(startNew.handoff.status, 'imported');
  const continueSaved = resolveChoice(incoming, 'saved', 'Старый комментарий');
  assert.equal(continueSaved.comment, 'Старый комментарий');
  assert.deepEqual(JSON.parse(JSON.stringify(continueSaved.handoff)), {
    expected: false,
    status: 'declined',
    text: '',
  });
});

test('configurator never places remarks text in URL or telemetry', () => {
  const html = read('configurator.html');
  assert.match(html, /handoffCode === 'remarks'/u);
  assert.match(html, /Date\.now\(\) - createdAt <= REMARKS_HANDOFF_TTL/u);
  assert.match(html, /text\.length >= SOURCE_DESCRIPTION_MIN/u);
  assert.match(html, /remarksHandoff\.text/u);
  assert.match(html, /Замечания перенесены/u);
  assert.match(html, /Текст не перенесён/u);
  assert.doesNotMatch(html, /routeParams\.set\([^\n]+remarksHandoff\.text/u);
  const telemetry = html.slice(html.indexOf('function trackConcept'), html.indexOf('function confirmVisibleRoute'));
  assert.doesNotMatch(telemetry, /state\.(comment|topic|contact|name)/u);
});
