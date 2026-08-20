const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Akademsalon monitoring uses its own privacy-safe Nginx log', () => {
  const nginx = read('ops/monitoring/nginx-salon-watch.conf');
  assert.match(
    nginx,
    /access_log\s+\/var\/log\/nginx\/akademsalon-watch\.log\s+noqs;/,
  );
  assert.doesNotMatch(nginx, /access\.log\s+combined/);
});

test('static Akademsalon rejects PHP probes before any upstream', () => {
  const nginx = read('ops/monitoring/nginx-salon-watch.conf');
  assert.ok(nginx.includes(String.raw`location ~* \.php(?:/|$) {`));
  assert.match(nginx, /return\s+404;/);
  assert.doesNotMatch(nginx, /proxy_pass|fastcgi_pass/);
});

test('runbook keeps shared-host failures out of Salon alerts and defines rollback', () => {
  const runbook = read('ops/monitoring/README.md');
  assert.match(runbook, /отдельн\S*\s+privacy-safe лог/i);
  assert.match(runbook, /неактивн\S*\s+виртуальн\S*\s+хост/i);
  assert.match(runbook, /rollback/i);
  assert.match(runbook, /nginx -t/);
  assert.doesNotMatch(runbook, /BOT_TOKEN|chat_id|OAuth|парол/i);
});
