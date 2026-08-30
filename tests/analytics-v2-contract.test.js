const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const contract = JSON.parse(read('analytics/contract.json'));
const client = read('assets/js/analytics-v2.js');
const backend = read('backend/salon_bot/analytics_v2.py');
const app = read('assets/js/app.js');

test('v2 contract is one explicit privacy-safe source of truth', () => {
  assert.equal(contract.schema_version, 2);
  assert.equal(contract.contract_version, '2.4.1');
  assert.equal(contract.timezone, 'Europe/Moscow');
  assert.equal(contract.session_timeout_minutes, 30);
  assert.equal(contract.raw_retention_days, 365);
  assert.equal(contract.retention_cleanup_interval_seconds, 3600);
  assert.deepEqual(contract.event_ordering, ['occurred_at', 'client_sequence', 'event_id']);
  assert.equal(contract.identity_definition, 'anonymous_browser');
  assert.deepEqual(
    contract.funnel.find((stage) => stage.id === 'input').events,
    ['first_input'],
    'opening step 1 must not masquerade as a real form interaction',
  );
  assert.equal(contract.events.first_input.label, 'Первое изменение поля заявки');
  assert.equal(contract.funnel.find((stage) => stage.id === 'input').label,
    'Изменили поле заявки');
  assert.ok(Object.keys(contract.pages).length >= 85);
  assert.ok(Object.keys(contract.events).length >= 35);
  assert.deepEqual(contract.forbidden_fields.sort(), [
    'contact', 'file', 'form', 'message', 'name', 'oauth', 'order_id',
    'query', 'raw_referrer', 'raw_user_agent', 'text', 'token', 'user_id',
  ].sort());
  for (const [page, label] of Object.entries(contract.pages)) {
    assert.match(page, /^\/(?:[a-z0-9-]+\.html)?$|^\/other$/);
    assert.match(label, /[А-Яа-яЁё]/, page);
  }
  for (const [event, meta] of Object.entries(contract.events)) {
    assert.match(event, /^[a-z][a-z0-9_]{1,39}$/);
    assert.match(meta.label, /[А-Яа-яЁё]/, event);
    assert.ok(['view', 'interest', 'progress', 'conversion', 'error'].includes(meta.group));
  }
});

test('every event already emitted by app.js exists in v2 contract', () => {
  const start = app.indexOf("('cta_click tg_open config_open");
  const end = app.indexOf(".split(' ').forEach", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const legacyNames = [...app.slice(start, end).matchAll(/'([^']*)'/g)]
    .flatMap((match) => match[1].trim().split(/\s+/))
    .filter(Boolean);
  for (const event of legacyNames) assert.ok(contract.events[event], event);
});

test('client and backend pin the exact contract fingerprint and safe routes', () => {
  assert.match(client, new RegExp(`SCHEMA_VERSION\\s*=\\s*${contract.schema_version}\\b`));
  assert.match(client, /credentials:\s*'omit'/);
  assert.match(client, /salon_analytics_queue_v2/);
  assert.match(client, /salon_analytics_revoke_pending/);
  assert.match(client, /event_id/);
  assert.match(client, /client_sequence/);
  assert.match(client, /salon_analytics_grant_v2/);
  assert.match(backend, new RegExp(`SCHEMA_VERSION\\s*=\\s*${contract.schema_version}\\b`));
  assert.match(backend, /UNIQUE|PRIMARY KEY/);
  assert.match(backend, /event_id/);
  assert.match(backend, /retention_cleanup_worker/);
  assert.match(backend, /grant_budget_exhausted/);
  assert.match(backend, /Origin/);
  assert.match(backend, /ON DELETE CASCADE/);
  assert.match(read('backend/salon_bot/install_analytics_v2.py'),
    /ANALYTICS_LEGACY_ENABLED[^\n]+"0"/,
    'release must disable legacy ingest before v2 static becomes reachable');
  assert.doesNotMatch(client, /sendBeacon\s*\(/);
});

test('all public app pages load v2 after the shared application runtime', () => {
  const pages = fs.readdirSync(root).filter((file) => file.endsWith('.html'));
  const privatePages = new Set([
    'admin.html', 'admin-covers.html', 'admin-mock.html', 'admin-analytics.html',
    'dashboard.html', 'zayavka.html', 'oplaceno.html', 'offline.html',
  ]);
  for (const file of pages) {
    const html = read(file);
    if (privatePages.has(file) || !/assets\/js\/(?:app|home-release\.min)\.js/.test(html)) continue;
    const appAt = Math.max(html.indexOf('assets/js/app.js'), html.indexOf('assets/js/home-release.min.js'));
    const v2At = html.indexOf('assets/js/analytics-v2.js?v=20260829analytics4');
    assert.ok(v2At > appAt, `${file}: analytics v2 must follow the shared runtime`);
  }
});
