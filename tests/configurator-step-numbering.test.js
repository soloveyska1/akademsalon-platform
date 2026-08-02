const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'configurator.html'), 'utf8');
const wizard = html.slice(html.indexOf('function initConceptWizard'));

/*
  Нумерация шагов конфигуратора живёт в нескольких независимых местах и легко
  расходится. Рассинхрон не роняет ничего сам по себе — он молча показывает
  человеку «Шаг 3 из 4» там, где шагов три, или ломает прыжок по ступеням.

  Рекомендация больше не является экраном: она обновляется рядом с первым
  выбором. Поэтому каждый реальный индекс совпадает с обещанным номером,
  а путь честно состоит из трёх действий.

  Легаси-движок в этом же файле ведёт собственную нумерацию «из 4» в скрытом
  контейнере — она к визарду отношения не имеет и здесь не проверяется.
*/

function stepsBlock(arrayName) {
  const start = html.indexOf('var ' + arrayName);
  assert.ok(start > 0, `массив ${arrayName} не найден`);
  const rest = html.slice(start + 4);
  const end = rest.search(/\n\s{2}var\s/);
  const body = rest.slice(0, end > 0 ? end : 2600);
  const entries = [...body.matchAll(/key:\s*'([a-z]+)'[^\n]*?displayStep:\s*(null|\d+)/g)];
  return {
    keys: [...body.matchAll(/key:\s*'([a-z]+)'/g)].map((m) => m[1]),
    display: entries.map((m) => ({ key: m[1], step: m[2] === 'null' ? null : Number(m[2]) })),
  };
}

test('у каждого шага объявлен показанный номер или явный отказ от него', () => {
  for (const name of ['routeSteps', 'serviceSteps']) {
    const { keys, display } = stepsBlock(name);
    assert.equal(
      display.length,
      keys.length,
      `${name}: displayStep объявлен не у всех шагов (${display.length} из ${keys.length})`,
    );
  }
});

test('показанные номера идут подряд с единицы и без пропусков', () => {
  for (const name of ['routeSteps', 'serviceSteps']) {
    const numbers = stepsBlock(name).display.map((d) => d.step).filter((n) => n !== null);
    assert.deepEqual(
      numbers,
      numbers.map((_, i) => i + 1),
      `${name}: показанные номера должны быть 1,2,3… — получено ${numbers.join(',')}`,
    );
  }
});

test('последний шаг всегда пронумерован и всегда contact', () => {
  for (const name of ['routeSteps', 'serviceSteps']) {
    const { keys, display } = stepsBlock(name);
    assert.equal(keys[keys.length - 1], 'contact', `${name}: последний шаг не contact`);
    const last = display[display.length - 1];
    assert.ok(last.step, `${name}: экран отправки обязан иметь номер, иначе путь выглядит бесконечным`);
  }
});

test('рекомендация живёт рядом с выбором и не добавляет скрытый экран', () => {
  const route = stepsBlock('routeSteps');
  assert.deepEqual(route.keys, ['situation', 'materials', 'contact']);
  assert.equal(route.display.some((d) => d.step === null), false);
  assert.match(html, /function liveRecommendationMarkup\(\)/);
  assert.match(html, /class="live-quote live-quote--ready"/);
});

test('в визарде не осталось нумерации, посчитанной от длины набора', () => {
  assert.doesNotMatch(
    wizard,
    /'Шаг ' \+ \(state\.step \+ 1\)/,
    'подпись снова считается от реального индекса, а не от показанного номера',
  );
  assert.match(wizard, /function displayTotal\(\)/);
  assert.match(wizard, /function stepEyebrow\(index\)/);
});

test('подписи собираются одной функцией, а не литералами', () => {
  assert.equal(html.match(/kicker:'Шаг \d/g), null, 'номер шага снова зашит в определение шага');
  // eyebrow экрана, нижний бар и мобильная шапка — из общего источника
  assert.match(wizard, /'<div><p class="eyebrow">' \+ stepEyebrow\(state\.step\)/);
  assert.match(wizard, /taskKicker\.textContent = stepEyebrow\(state\.step\)/);
  assert.match(wizard, /label\.textContent = stepEyebrow\(state\.step\)/);
});

test('индикатор прогресса обещает столько шагов, сколько показано', () => {
  const shown = stepsBlock('routeSteps').display.filter((d) => d.step !== null).length;
  // статическое значение до первого render() не должно врать
  const firstMax = html.match(/id="conceptProgress"[^>]*aria-valuemax="(\d+)"/);
  assert.ok(firstMax, 'индикатор визарда не найден');
  assert.equal(Number(firstMax[1]), shown, 'aria-valuemax визарда не совпадает с числом показанных шагов');
  assert.match(wizard, /setAttribute\('aria-valuemax',String\(shown\)\)/);
  // один источник номера остаётся общим для всех вариантов пути
  assert.match(wizard, /function progressNumber\(index\)/);
});

test('статические подписи в разметке согласованы с показанным числом', () => {
  const shown = stepsBlock('routeSteps').display.filter((d) => d.step !== null).length;
  for (const m of html.matchAll(/(?:data-conf-step>|id="conceptProgressLabel"[^>]*>|data-concept-task-kicker>)Шаг (\d+) (?:из|\/) (\d+)/g)) {
    assert.equal(Number(m[2]), shown, `разметка обещает ${m[2]} шагов вместо ${shown}`);
  }
});

test('ступени сайдбара покрывают реальные индексы, а не показанные номера', () => {
  // прыжки идут по настоящим индексам: скрытие номера не должно ломать навигацию
  const { keys } = stepsBlock('routeSteps');
  const jumps = [...html.matchAll(/data-concept-jump="(\d+)"/g)].map((m) => Number(m[1]));
  const txSteps = [...html.matchAll(/data-tx-step="(\d+)"/g)].map((m) => Number(m[1]));
  const expected = keys.map((_, i) => i);
  assert.deepEqual(jumps, expected, 'data-concept-jump разошёлся с реальными индексами шагов');
  assert.deepEqual(txSteps, expected, 'data-tx-step разошёлся с реальными индексами шагов');
});

test('состояние и аналитика по-прежнему опираются на реальный индекс', () => {
  // черновики в localStorage и события хранят индекс — его менять нельзя
  assert.match(wizard, /trackConcept\('case_step_view','s' \+ state\.step,true\)/);
  assert.match(wizard, /step:state\.step/);
  assert.match(wizard, /Math\.min\(steps\.length - 1,Number\(saved\.step\) \|\| 0\)/);
});

test('заявка отправляется по ключу шага, а не по его номеру', () => {
  assert.match(wizard, /if \(steps\[state\.step\]\.key === 'contact'\) \{\s*submit\(\);/);
});
