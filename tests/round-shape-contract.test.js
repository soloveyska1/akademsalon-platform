/* Контракт круглых форм.

   Дефект, из-за которого сургучная печать уведомления однажды растеклась
   в розовый эллипс во всю карточку: правило рисовало круг через
   border-radius:50%, задавало высоту, а ширину брало из flex-basis. Пока
   элемент лежал во флекс-строке, всё сходилось; в любой раскладке, где
   флекс не сработал, ширина становилась авто — и круг превращался в овал.

   Тот же промах нашёлся ещё в трёх местах (счётчик корзины, заглушка
   проверки, исходное правило печати). Здесь он закрыт как класс: если
   элемент объявляет себя кругом, он обязан объявить обе стороны — либо
   width, либо aspect-ratio, либо inline-size.

   Пилюли (border-radius:999px и подобные) правило не трогает: они
   намеренно тянутся по содержимому. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'assets', 'css');

function roundRulesWithoutWidth(source) {
  /* комментарии вырезаем до разбора: иначе их хвост прилипает к селектору
     и находка читается как каша */
  const css = source.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const bad = [];
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].trim().replace(/\s+/g, ' ');
    const body = match[2];
    if (!/border-radius\s*:\s*50%/.test(body)) continue;
    if (/(^|[;\s])width\s*:/.test(body)) continue;
    if (/aspect-ratio\s*:/.test(body) || /inline-size\s*:/.test(body)) continue;
    /* ширину могут задавать краями — тогда форма не зависит от содержимого */
    if (/(^|[;\s])(left|right)\s*:/.test(body) && /(^|[;\s])(left|right)\s*:/.test(body.replace(/(left|right)\s*:[^;]*/, ''))) continue;
    const declaresHeight = /(^|[;\s])height\s*:/.test(body);
    const declaresBasis = /flex\s*:\s*[^;]*\d+(px|rem|em)/.test(body);
    if (!declaresHeight && !declaresBasis) continue;
    bad.push(selector.slice(-70));
  }
  return bad;
}

test('круглые элементы задают обе стороны, а не только высоту', () => {
  const offenders = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.css') && !f.includes('.min.'))) {
    const css = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const selector of roundRulesWithoutWidth(css)) offenders.push(`${file}: ${selector}`);
  }
  assert.deepEqual(offenders, [],
    'круг без собственной ширины растечётся в эллипс, как только флекс-контекст не сработает:\n' + offenders.join('\n'));
});
