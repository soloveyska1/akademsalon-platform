const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
const cabinet = fs.readFileSync(path.join(root, 'assets/js/cabinet.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'assets/js/admin.js'), 'utf8');
const extras = fs.readFileSync(path.join(root, 'assets/js/extras.js'), 'utf8');
const press = fs.readFileSync(path.join(root, 'assets/js/press.js'), 'utf8');
const pressCss = fs.readFileSync(path.join(root, 'assets/css/press.css'), 'utf8');
const configurator = fs.readFileSync(path.join(root, 'configurator.html'), 'utf8');
const tariffs = fs.readFileSync(path.join(root, 'tariffs.html'), 'utf8');
const dossier = fs.readFileSync(path.join(root, 'dosie-nauchruka.html'), 'utf8');
const publicBuild = fs.readFileSync(path.join(root, 'scripts/build-public.mjs'), 'utf8');

test('frontend не помещает сессионные и гостевые секреты в URL API', () => {
  for (const [name, source] of Object.entries({ app, cabinet, admin, extras })) {
    assert.doesNotMatch(source, /\?session=/, `${name}: session token in URL`);
    assert.doesNotMatch(source, /[?&]token=['"`]?\s*\+\s*encodeURIComponent/, `${name}: order token in URL`);
    assert.doesNotMatch(source, /\?tokens=/, `${name}: order token list in URL`);
  }
});

test('гостевой доступ использует специальные заголовки, а сессия — Bearer', () => {
  assert.match(app, /Authorization.*Bearer/);
  assert.match(app, /X-Order-Tokens/);
  assert.match(cabinet, /'X-Order-Token': t/);
  assert.match(cabinet, /'X-Order-Tokens': tokens\.join\(','\)/);
  assert.match(cabinet, /protectedFetch\(orderId, path\)/);
  assert.match(admin, /adminProtectedFetch/);
});

test('защищённые медиа и файлы загружаются fetch-запросом, а не прямой ссылкой', () => {
  assert.match(cabinet, /data-protected-asset/);
  assert.match(cabinet, /data-protected-media/);
  assert.doesNotMatch(cabinet, /src="' \+ S\.api\.base \+ apiPath/);
  assert.match(admin, /data-admin-download/);
  assert.match(admin, /data-admin-media/);
  assert.doesNotMatch(admin, /msgmedia\/.*\?session=/);
});

test('отклонённый запрос получает понятные разрешённые альтернативы во всех формах', () => {
  assert.match(app, /outsideScopeMessage: function \(response\)/);
  assert.match(app, /response\.error !== 'request_outside_scope'/);
  assert.match(app, /response\.allowed_routes/);
  assert.match(configurator, /S\.api\.outsideScopeMessage\(r\)/);
  assert.match(tariffs, /Salon\.api\.outsideScopeMessage\(r\)/);
  assert.match(extras, /S\.api\.outsideScopeMessage\(r\)/);
});

test('снятые материалы и внутренние генераторы не попадают в публичный артефакт', () => {
  for (const retired of [
    'assets/img/vk',
    'assets/img/samples',
    'assets/img/showcase',
    'assets/samples',
    'assets/img/og-cover.png',
    'salon-promo.gif',
    'assets/brand/telegram/generate.py',
    'assets/brand/telegram/preview.html',
    'admin-covers.html'
  ]) {
    assert.match(publicBuild, new RegExp(retired.replace(/[/.]/g, '\\$&')));
  }
  assert.match(publicBuild, /Public artifact contains missing local references/);
  assert.doesNotMatch(dossier, /assets\/(?:img\/showcase|samples)\//);
  assert.match(dossier, /Не готовая глава, а карта правок к вашему черновику/);
});

test('закрытая 3D-книга не показывает оборотный лист вверх ногами', () => {
  for (const phase of ['--pcopy', '--pm', '--po', '--ps']) {
    assert.match(press, new RegExp(`\\[['"]${phase}['"],`));
  }
  assert.match(press, /track\.style\.setProperty\(phase\[0\], progress\.toFixed\(4\)\)/);
  assert.match(pressCss, /\.pr-cvout\{[\s\S]*?opacity:calc\(1 - var\(--po\)\)/);
  assert.match(pressCss, /\.pr-cvin\{[\s\S]*?opacity:var\(--po\)/);
});

test('изменённые JavaScript-файлы синтаксически валидны', () => {
  new vm.Script(app, { filename: 'assets/js/app.js' });
  new vm.Script(cabinet, { filename: 'assets/js/cabinet.js' });
  new vm.Script(admin, { filename: 'assets/js/admin.js' });
  new vm.Script(extras, { filename: 'assets/js/extras.js' });
  new vm.Script(press, { filename: 'assets/js/press.js' });
});
