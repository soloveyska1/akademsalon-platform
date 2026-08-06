/* Оболочка приложения на телефоне (OUT-008, этап 1, вариант A).
   База измерений — docs/brain/evidence/E-1014.md.

   Разрыв: в кабинете собственная панель разделов стояла липко СВЕРХУ
   (замер 390×844 в залогиненном виде: rect 0,104,390,61), а нижняя зона
   экрана — та, до которой достаёт большой палец, — оставалась пустой.
   Общий док здесь намеренно выключен решением hall97 «без дублирующей
   mobile CTA», поэтому навигация не добавляется второй, а переезжает вниз:
   разделов по-прежнему один набор, просто в досягаемости пальца.

   Проверяем последний слой каскада (`CABINET CHROME`) — именно он выигрывает;
   в файле 15 блоков `max-width: 920px`, и проверка произвольного из них
   молча ничего не доказывает. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const accountCss = fs.readFileSync(path.join(root, 'assets/css/polish15-account.css'), 'utf8');
const finalLayer = accountCss.slice(accountCss.lastIndexOf('CABINET CHROME'));

/* Тело правила по точному селектору внутри выигрывающего слоя.
   Селектор обязан начинать строку: иначе `.is-account-route .account-nav {`
   совпадает и внутри `:root[data-theme="dark"] .is-account-route .account-nav`,
   и тест молча проверяет правило тёмной темы. */
function rule(selector, source = finalLayer) {
  const anchored = new RegExp(
    `^[ \\t]*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`,
    'm'
  );
  const found = anchored.exec(source);
  assert.notEqual(found, null, `правило ${selector} должно остаться в слое CABINET CHROME`);
  const open = source.indexOf('{', found.index);
  const end = source.indexOf('}', open);
  assert.notEqual(end, -1, `правило ${selector} должно быть закрыто`);
  return source.slice(open + 1, end);
}

test('панель разделов кабинета закреплена внизу экрана, в зоне большого пальца', () => {
  const nav = rule('.is-account-route .account-nav');
  assert.match(nav, /position:\s*fixed/, 'панель должна быть закреплена, а не липнуть к шапке');
  assert.match(nav, /bottom:\s*0/, 'панель должна стоять у нижней кромки');
  assert.match(nav, /top:\s*auto/, 'прежняя привязка к шапке должна быть снята явно');
  assert.match(
    nav,
    /padding-bottom:\s*max\([^)]*env\(safe-area-inset-bottom\)/,
    'нижний отступ должен считать домашний индикатор'
  );
});

test('панель «Ещё» раскрывается вверх, а не за нижнюю кромку', () => {
  const panel = rule('.is-account-route .account-nav__more-panel');
  assert.match(panel, /bottom:\s*calc\(100% \+ 7px\)/, 'панель должна расти вверх от кнопки');
  assert.match(panel, /top:\s*auto/, 'прежнее раскрытие вниз должно быть снято явно');
});

test('кабинет резервирует высоту нижней панели, а не обнуляет отступ', () => {
  const body = rule('body.is-account-route');
  assert.doesNotMatch(
    body,
    /padding-bottom:\s*0\s*!important/,
    'padding-bottom:0 !important возвращал контент под панель'
  );
  assert.match(
    body,
    /padding-bottom:\s*calc\(var\(--account-dock-h\)/,
    'кабинет должен резервировать высоту панели через --account-dock-h'
  );
});

test('баннер согласия уступает панели разделов, а не накрывает её', () => {
  /* Замер до правила: баннер `#lrail` (z 96) перекрывал панель (z 95) на 51 px
     при первом визите прямо в кабинет. */
  const lifted = rule(':root.has-consent-bar body.is-account-route .lrail');
  assert.match(
    lifted,
    /bottom:\s*calc\(var\(--account-dock-h\)/,
    'баннер должен подниматься над панелью разделов на её высоту'
  );
});

test('решение hall97 не отменяется: общий док в кабинете остаётся выключен', () => {
  /* Вариант A переносит собственную навигацию кабинета, а не добавляет вторую.
     Если это правило исчезнет, в кабинете окажутся два нижних слоя сразу. */
  assert.match(
    finalLayer,
    /body\.is-account-route \.mobile-dock\.mobile-cta\s*\{\s*display:\s*none !important/,
    'общий док должен остаться скрытым в кабинете'
  );
});

test('набор разделов кабинета не меняется: четыре кнопки и «Ещё»', () => {
  assert.match(
    finalLayer,
    /\.account-nav nav\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4/,
    'панель разделов должна остаться сеткой из четырёх колонок'
  );
});
