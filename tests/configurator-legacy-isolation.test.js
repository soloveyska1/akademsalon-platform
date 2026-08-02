const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'configurator.html'), 'utf8');
const split = html.indexOf('function initConceptWizard');
const legacy = html.slice(0, split);
const wizard = html.slice(split);

/*
  В файле два движка. Легаси невидим (mechanics-registry, display:none!important)
  и оставлен ради механики: смета, файлы, промокоды, Telegram, отправка.
  Видимый интерфейс рисует визард.

  Проблема в том, что легаси адресовал часть узлов документ-широкими
  селекторами и попадал в разметку визарда: гасил видимую полосу прогресса,
  переписывал подпись шага, дёргал скролл и уводил фокус в display:none.
  Эти проверки держат движки по своим сторонам.
*/

test('легаси ищет свою полосу прогресса внутри реестра, а не первую в документе', () => {
  assert.doesNotMatch(
    legacy,
    /document\.querySelector\('\.wprog'\)/,
    'легаси снова адресует .wprog документ-широко и погасит видимый индикатор визарда',
  );
  assert.match(legacy, /document\.querySelector\('#order \.wprog'\)/);
});

test('подпись шага пишется каждым движком только в свой узел', () => {
  assert.match(
    legacy,
    /document\.querySelectorAll\('#order \[data-conf-step\]'\)/,
    'легаси пишет подпись шага в чужие узлы',
  );
  assert.match(
    wizard,
    /document\.querySelectorAll\('\.tx-mobile-head \[data-conf-step\]'\)/,
    'визард пишет подпись шага в реестр легаси',
  );
  // документ-широких обращений к этому атрибуту не осталось ни с одной стороны
  assert.doesNotMatch(legacy, /querySelectorAll\('\[data-conf-step\]'\)/);
  assert.doesNotMatch(wizard, /querySelectorAll\('\[data-conf-step\]'\)/);
});

test('легаси не наводит фокус и не прокручивает страницу, пока скрыт', () => {
  assert.match(
    legacy,
    /if \(focus && !\$\('order'\)\.hidden\) \{/,
    'ветка фокуса снова выполняется при скрытом реестре: фокус уйдёт в display:none, страница дёрнется',
  );
});

test('корзина переводит видимый визард, а не только скрытый реестр', () => {
  // «Продолжить · контакты →» раньше двигала только легаси-шаги
  assert.match(wizard, /goToContact:function \(\)/, 'у визарда нет способа встать на шаг контактов');
  assert.match(
    legacy,
    /wiz\.goToContact === 'function'\) wiz\.goToContact\(\)/,
    'checkout не передаёт управление визарду — человек останется на прежнем экране',
  );
  assert.match(legacy, /go\(3, false\);/, 'реестру не нужен фокус и прокрутка при checkout');
});

test('переход на контакты ищет шаг по ключу, а не по номеру', () => {
  const method = wizard.slice(wizard.indexOf('goToContact:function'), wizard.indexOf('currentKey:function'));
  assert.match(method, /item\.key === 'contact'/);
  assert.doesNotMatch(method, /go\(3\)/, 'жёсткий номер шага сломается при изменении набора');
});

test('реестр остаётся скрытым и не показывается по частям', () => {
  const css = fs.readFileSync(path.join(root, 'assets/css/polish15-configurator.css'), 'utf8');
  assert.match(html, /<div class="mechanics-registry" id="order" hidden aria-hidden="true">/);
  assert.match(css, /\.configurator-task \.mechanics-registry,[\s\S]{0,200}display:none!important/);
});

test('визард не полагается на видимые побочные эффекты легаси', () => {
  // единственные допустимые зависимости — состояние авторизации и экран исхода
  assert.match(wizard, /getElementById\('ctAuthed'\)/);
  assert.match(wizard, /getElementById\('confDone'\)/);
  // и никакого чтения легаси-нумерации
  assert.doesNotMatch(wizard, /getElementById\('wpLbl'\)/);
  assert.doesNotMatch(wizard, /\.wstep/);
});
