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

test('крестик закрытия рисуется у любого оверлея, а не только у поиска', () => {
  /* Меню и поиск несут одну разметку — `<button class="icon-button
     icon-button--close"><i aria-hidden="true"></i></button>`
     (`polish15-chrome.js:89` и `:123`), но полоски крестика были заданы только
     для `.overlay--search .search-close i`. Меню получало круг 50×50 с пустым
     `<i>` 0×0 — замер на index, services, knowledge, dashboard и tariffs. */
  const chromeCss = fs.readFileSync(path.join(root, 'assets/css/chrome.css'), 'utf8');
  assert.match(
    chromeCss,
    /\.overlay \.icon-button--close\s*>\s*i[^{]*\{[^}]*background:\s*currentColor/,
    'полоски крестика должны задаваться для любого оверлея'
  );
  assert.match(
    chromeCss,
    /\.overlay \.icon-button--close\s*>\s*i[^{]*\{\s*transform:\s*rotate\(45deg\)/,
    'первая полоска должна быть повёрнута на 45°'
  );
  /* Главная подключает не исходники, а сборку — без пересборки правка до неё
     не доходит. Замер это и показал: крестик починился везде, кроме index. */
  const homeCss = fs.readFileSync(path.join(root, 'assets/css/home-release.min.css'), 'utf8');
  assert.ok(
    homeCss.includes('.overlay .icon-button--close>i') ||
      homeCss.includes('.overlay .icon-button--close > i'),
    'сборка главной должна содержать то же правило — пересоберите home-release'
  );
});

test('первая строка панели «Ещё» выровнена так же, как остальные', () => {
  /* Замер до правки: в строке «Новое дело» иконка и подпись стояли на y=7
     при высоте строки 48 и растягивались до 34 px, тогда как в остальных
     строках они центрированы (y=14 и y=17, высота 20 и 14). */
  const option = rule('.is-account-route .account-nav__more-panel .account-nav__more-option');
  assert.match(
    option,
    /align-items:\s*center/,
    'строки панели должны центрировать содержимое по вертикали'
  );
});

test('набор разделов кабинета не меняется: четыре кнопки и «Ещё»', () => {
  assert.match(
    finalLayer,
    /\.account-nav nav\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4/,
    'панель разделов должна остаться сеткой из четырёх колонок'
  );
});

/* ---------------- Лист согласия: вторая половина этапа 1 ----------------

   Замер до правки (chromium 390×844 и 375×667, первый визит, главная,
   services и tariffs дают одно и то же): лист `10,615,370×218.8` — 26% экрана
   на 390 и 33% на iPhone SE, то есть ровно «нижняя треть». Внутри: заголовок
   20.7 + абзац 57.1 (три строки по 14px) + кнопки 51 + подвал 50 + паддинги 21.

   Владелец выбрал вариант B: кегли не трогаем (абзац и кнопки остаются 14px),
   компактность берём структурой — уплотнение и уход заголовка из раскладки.
   Замер после правки: 178.1 px, 21% и 26.7%.

   Выигрывающий слой — последний блок `has-consent-bar` в mobile.css
   (специфичность 0,4,1). Более ранний блок `.cookiebar` (0,1,0) в том же файле
   не применяется НИКОГДА: замер с заглушённым `app.js` показал, что вне
   `.lrail` баннер не рисуется вообще — на services и tariffs он без app.js
   не появляется, а главная несёт тот же код в сборке. */

const mobileCss = fs.readFileSync(path.join(root, 'assets/css/mobile.css'), 'utf8');
const consentLayer = mobileCss.slice(mobileCss.lastIndexOf(':root.has-consent-bar .lrail{'));

test('лист согласия уплотнён и больше не занимает нижнюю треть телефона', () => {
  const sheet = rule(':root.has-consent-bar body .lrail .cookiebar', consentLayer);
  assert.match(sheet, /padding:\s*10px 12px 8px/, 'паддинги листа должны стать плотнее');

  const button = rule(':root.has-consent-bar .lrail .cookiebar .cb-actions .btn', consentLayer);
  assert.match(button, /min-height:\s*44px/, 'тач-цель кнопки остаётся не меньше 44px');
  assert.match(button, /padding:\s*5px 8px/, 'кнопка должна стать ровно 44, а не 51');
  assert.match(button, /font-size:\s*14px/, 'кегль кнопки не уменьшается: компактность берём структурой');

  const foot = rule(':root.has-consent-bar .lrail .cookiebar .cb-foot', consentLayer);
  assert.match(foot, /padding-top:\s*0/, 'подвал не должен нести верхний отступ');
  assert.match(foot, /border-top:\s*0/, 'разделительная линия подвала уходит вместе с отступом');

  const more = rule(':root.has-consent-bar .lrail .cookiebar .cb-more', consentLayer);
  assert.match(more, /min-height:\s*44px/, 'ссылки подвала остаются тач-целями 44px');
});

test('абзац листа остаётся целым: юридический текст не режется многоточием', () => {
  /* Ранний блок mobile.css клэмпил абзац в две строки. Решение более позднего
     блока — `display:block; overflow:visible` — отменило клэмп сознательно.
     Возврат клэмпа обрезал бы фразу о целях обработки, поэтому запрещён. */
  const paragraph = rule(':root.has-consent-bar .lrail .cookiebar>p', consentLayer);
  assert.match(paragraph, /font-size:\s*14px/, 'кегль абзаца не уменьшается');
  /* Ранний блок этого же файла продолжает страховать `-webkit-line-clamp:unset`
     на случай, если клэмп вернётся из другого слоя. Запрещено именно число. */
  assert.doesNotMatch(
    mobileCss,
    /-webkit-line-clamp:\s*\d/,
    'клэмп абзаца числом не должен возвращаться ни в одном блоке mobile.css'
  );
});

test('заголовок листа уходит из раскладки, но остаётся именем региона', () => {
  /* `role="region" aria-labelledby="cb-title"` берёт имя из этого h2.

     Проверять один блок здесь НЕЛЬЗЯ. Этот селектор объявлен в mobile.css
     дважды с одинаковой специфичностью (0,4,1): ранний блок ставит
     `display:none`, поздний — sr-only. Пока поздний не объявлял `display`,
     побеждал `display:none`, и замер в браузере показывал ровно то, что
     этот тест запрещает, — а тест был зелёный, потому что смотрел только
     на поздний блок. Поэтому берём ВСЕ объявления и проверяем последнее. */
  const heads = [...mobileCss.matchAll(
    /:root\.has-consent-bar[^{}]*\.cookiebar \.cb-head\s*\{([^}]*)\}/g
  )].map((m) => m[1]);
  assert.ok(heads.length >= 1, 'правило .cb-head должно остаться в mobile.css');

  const lastDisplay = heads
    .flatMap((body) => [...body.matchAll(/display:\s*([a-z-]+)/g)].map((m) => m[1]))
    .pop();
  assert.equal(lastDisplay, 'block', 'итог каскада не должен быть display:none');

  const srOnly = heads[heads.length - 1];
  assert.match(srOnly, /position:\s*absolute/, 'заголовок должен выходить из потока, а не сжиматься');
  assert.match(srOnly, /clip:\s*rect\(0 0 0 0\)/, 'заголовок прячется приёмом sr-only');
});

test('мёртвый блок компактности убран, а не оставлен вводить в заблуждение', () => {
  assert.doesNotMatch(
    mobileCss,
    /max-height:\s*min\(52svh,\s*360px\)/,
    'правило max-height не применялось ни на одном живом пути'
  );
});

test('сборка главной несёт тот же уплотнённый лист', () => {
  const homeCss = fs.readFileSync(path.join(root, 'assets/css/home-release.min.css'), 'utf8');
  assert.ok(
    homeCss.includes('padding:10px 12px 8px'),
    'сборка главной должна содержать уплотнённый лист — пересоберите home-release'
  );
});

/* ---------------- Сборка главной: классы, собираемые из JS ----------------

   Главная — единственная страница на сборке `home-release.min.css`, и сборка
   проходит через purgecss. Purge ищет имена классов как ЦЕЛЫЕ строки в HTML и
   JS, поэтому имя, собранное склейкой, он не находит и правило выбрасывает:

     el.className = 'mnote mnote--' + (loud ? 'call' : 'echo') + ' is-' + tone;

   Строк `mnote--call`, `is-stamp`, `is-wax` в исходниках нет — есть только
   куски. Замер до правки: в `extras.css` правило `.mnote--call` встречается
   5 раз, в сборке — 0. Из-за этого карточка уведомления на главной рисовалась
   без своей раскладки: `display:block` и `padding:0` вместо флекса с отступами,
   печать «¶» упиралась в верхнюю кромку, а крестик уезжал под кнопки.
   На остальных 89 страницах `extras.css` подключён напрямую и дефекта нет. */

const homeBundle = fs.readFileSync(path.join(root, 'assets/css/home-release.min.css'), 'utf8');

test('сборка главной сохраняет раскладку карточки уведомления', () => {
  assert.ok(
    homeBundle.includes('.mnote--call'),
    'правило .mnote--call не должно вырезаться purge: имя собирается склейкой в app.js'
  );
  assert.match(
    homeBundle,
    /\.mnote--call\{[^}]*display:flex/,
    'карточка должна оставаться флексом, иначе печать и крестик уезжают'
  );
});

test('сборка главной сохраняет классы тона, которые ставит JS', () => {
  /* `is-` + tone: stamp по умолчанию, wax и verify для других событий. */
  for (const tone of ['is-stamp', 'is-wax', 'is-verify']) {
    assert.ok(
      homeBundle.includes(`.mnote.${tone}`),
      `класс тона ${tone} собирается склейкой и должен пережить purge`
    );
  }
});

/* ---------------- Панель «Ещё» в кабинете: закрытие ----------------

   `.account-nav__more` — нативный `<details>`, а он по устройству закрывается
   только повторным нажатием на свой `<summary>`. Пока панель стояла сверху,
   это почти не мешало. После переезда панели разделов вниз (релиз 151) она
   раскрывается ВВЕРХ на 172 px и накрывает контент прямо в зоне пальца:
   замер 390×844 — панель `[58,610,316,172]`. Тап мимо не закрывал её, а при
   смене раздела она оставалась висеть поверх нового.

   Обработчик живёт на документе, а не на самой панели: разметка кабинета
   перерисовывается при каждой смене вкладки, и обработчик на узле умирал бы
   вместе с ней. */

const cabinetJs = fs.readFileSync(path.join(root, 'assets/js/cabinet.js'), 'utf8');

test('панель «Ещё» закрывается тапом мимо, Esc и сменой раздела', () => {
  assert.match(
    cabinetJs,
    /document\.addEventListener\('pointerdown'/,
    'закрытие по тапу мимо должно ловиться на документе, чтобы пережить перерисовку'
  );
  assert.match(cabinetJs, /key === 'Escape'/, 'Esc должен закрывать панель');
  assert.match(
    cabinetJs,
    /window\.addEventListener\('hashchange', closeMorePanel\)/,
    'при смене раздела панель не должна оставаться висеть поверх нового'
  );
  assert.match(
    cabinetJs,
    /\.account-nav__more\[open\]/,
    'ищем именно открытую панель, иначе обработчик работает вхолостую'
  );
});

test('закрытие возвращает фокус на кнопку, а не теряет его', () => {
  /* Иначе после Esc фокус остаётся на исчезнувшем пункте, и следующий Tab
     уводит в начало документа. */
  assert.match(cabinetJs, /summary[\s\S]{0,200}focus\(\)/, 'фокус должен возвращаться на «Ещё»');
});
