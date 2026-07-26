const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('assets/js/app.js');
const extras = read('assets/js/extras.js');
const knowledge = read('knowledge.html');
const article = read('nauchnaya-statya.html');
const integrity = read('academic-integrity.html');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  assert.fail(`${name} must have a complete body`);
}

const caseRoute = Function(`return (${extractFunction(app, 'caseRoute')});`)();
const guideHelpers = Function(`
  ${extractFunction(app, 'guideWorkType')}
  ${extractFunction(app, 'guideRouteProfile')}
  return { guideWorkType, guideRouteProfile };
`)();
function pageContext(file) {
  return Function('here', 'URLSearchParams', `
    ${extractFunction(app, 'caseRoute')}
    ${extractFunction(app, 'guideWorkType')}
    ${extractFunction(app, 'guideRouteProfile')}
    ${extractFunction(app, 'selfRouteFor')}
    ${extractFunction(app, 'pageCaseContext')}
    return pageCaseContext();
  `)(file, URLSearchParams);
}

test('page routes use the same pl/rv/nm/df service taxonomy as the home route', () => {
  const cases = [
    [['course', 'topic', 'diagnostic'], 'pl'],
    [['diplom', 'draft', 'diagnostic'], 'rv'],
    [['diplom', 'draft', 'formatting'], 'nm'],
    [['diplom', 'defense', 'defense'], 'df'],
  ];

  for (const [args, expectedService] of cases) {
    const url = new URL(caseRoute(...args), 'https://akademsalon.ru/');
    assert.equal(url.searchParams.get('service'), expectedService);
    assert.equal(url.searchParams.get('route'), 'page');
    assert.equal(url.searchParams.get('work'), args[0]);
    assert.equal(url.searchParams.get('situation'), args[1]);
    assert.equal(url.searchParams.get('result'), args[2]);
  }

  const support = new URL(
    caseRoute('course', 'topic', 'support'),
    'https://akademsalon.ru/',
  );
  assert.equal(support.searchParams.has('service'), false);
});

test('special routes keep dedicated services and candidate diagnostics out of generic review', () => {
  const tutoring = new URL(caseRoute('', 'draft', 'tutoring'), 'https://akademsalon.ru/');
  assert.equal(tutoring.searchParams.get('service'), 'tu');
  assert.equal(tutoring.searchParams.get('result'), 'tutoring');

  const aiEditing = new URL(caseRoute('', 'draft', 'ai_editing'), 'https://akademsalon.ru/');
  assert.equal(aiEditing.searchParams.get('service'), 'ai');
  assert.equal(aiEditing.searchParams.get('result'), 'ai_editing');

  const candidate = new URL(
    caseRoute('kandidat', 'draft', 'diagnostic'),
    'https://akademsalon.ru/',
  );
  assert.equal(candidate.searchParams.has('service'), false);
  assert.equal(candidate.searchParams.get('work'), 'kandidat');
  assert.equal(candidate.searchParams.get('situation'), 'draft');
  assert.equal(candidate.searchParams.get('result'), 'diagnostic');
});

test('case routes serialize only allowlisted state codes', () => {
  const url = caseRoute(
    'student@example.com',
    'draft',
    'нужна помощь Ивану +7 900 000-00-00',
  );
  assert.equal(url, 'configurator.html?situation=draft&route=page');
  assert.doesNotMatch(url, /student|example|Иван|900/iu);
});

test('specialized page context reaches the correct dedicated or neutral route', () => {
  assert.equal(
    pageContext('avtorskiy-zakaz.html').action,
    'configurator.html?service=au',
  );
  assert.equal(
    pageContext('redaktura-posle-ii.html').action,
    'configurator.html?service=ai',
  );

  const candidate = new URL(
    pageContext('kandidatskaya-dissertaciya.html').action,
    'https://akademsalon.ru/',
  );
  assert.equal(candidate.searchParams.has('service'), false);
  assert.equal(candidate.searchParams.get('work'), 'kandidat');
  assert.equal(candidate.searchParams.get('situation'), 'draft');
  assert.equal(candidate.searchParams.get('result'), 'diagnostic');

  const publication = new URL(
    pageContext('nauchnaya-statya.html').action,
    'https://akademsalon.ru/',
  );
  assert.equal(publication.searchParams.has('work'), false);
  assert.equal(publication.searchParams.get('situation'), 'draft');
  assert.equal(publication.searchParams.get('result'), 'editing');
});

test('article CTAs ask the configurator to clarify publication type', () => {
  const links = [...article.matchAll(
    /<a\b([^>]*\bhref="configurator\.html[^"]*"[^>]*)>/g,
  )].map((match) => match[1]);
  assert.equal(links.length, 3);
  for (const attributes of links) {
    assert.doesNotMatch(attributes, /\bdata-type=/);
    assert.doesNotMatch(attributes, /(?:[?&]|&amp;)work=/);
    assert.match(attributes, /situation=draft/);
    assert.match(attributes, /result=editing/);
  }
  assert.doesNotMatch(article, /data-type="rinc"/);
});

test('integrity boundary ends with two non-binding allowed next steps', () => {
  assert.match(integrity, /id="integrityNextTitle">Разрешённый следующий шаг/);
  assert.match(integrity, /href="priyomnaya\.html">Уточнить допустимый формат/);
  assert.match(integrity, /href="configurator\.html">Открыть конфигуратор/);
  assert.match(integrity, /не создаёт заказ и ни к чему не обязывает/);
  assert.match(integrity, /оплата не выполняются автоматически/);
});

test('guide taxonomy keeps course, practice and publication formats distinct', () => {
  const expectedWork = new Map([
    ['guide-vvedenie-kursovoy', 'course'],
    ['guide-prakticheskaya-chast-kursovoy', 'course'],
    ['guide-skolko-stoit-kursovaya', 'course'],
    ['guide-otchet-po-praktike', 'practice'],
    ['guide-dnevnik-praktiki', 'practice'],
    ['guide-harakteristika-s-praktiki', 'practice'],
    ['guide-rinc-statya', 'rinc'],
    ['guide-statya-vak', 'vak'],
    ['guide-statya-scopus', 'scopus'],
    ['guide-temy-vkr', 'diplom'],
  ]);

  for (const [slug, work] of expectedWork) {
    assert.equal(guideHelpers.guideWorkType(slug), work, slug);
  }
});

test('formatting and defense guides enter their dedicated service at the right stage', () => {
  for (const slug of [
    'guide-normocontrol',
    'guide-prilozheniya-po-gost',
    'guide-spisok-literatury',
    'guide-titulnyj-list',
  ]) {
    const profile = guideHelpers.guideRouteProfile(slug);
    assert.equal(profile.stage, 3, slug);
    assert.equal(profile.result, 'formatting', slug);
    const url = new URL(
      caseRoute(profile.work, profile.situation, profile.result),
      'https://akademsalon.ru/',
    );
    assert.equal(url.searchParams.get('service'), 'nm', slug);
  }

  for (const slug of [
    'guide-zashchita-diploma',
    'guide-prezentaciya-k-zashchite',
    'guide-rech-na-zashchitu',
  ]) {
    const profile = guideHelpers.guideRouteProfile(slug);
    assert.equal(profile.stage, 4, slug);
    assert.equal(profile.result, 'defense', slug);
    const url = new URL(
      caseRoute(profile.work, profile.situation, profile.result),
      'https://akademsalon.ru/',
    );
    assert.equal(url.searchParams.get('service'), 'df', slug);
  }
});

test('Commission Zero cannot start from a topic-only source', () => {
  const start = app.indexOf("{ id:'commission0'");
  const end = app.indexOf("{ id:'defensepack'", start);
  assert.ok(start >= 0 && end > start, 'Commission Zero service block must exist');
  const commission = app.slice(start, end);
  const sourceQuestion = commission.match(/\{ id:'source'[\s\S]*?opts:\[([\s\S]*?)\]\s*\}/);
  assert.ok(sourceQuestion, 'Commission Zero source question must exist');
  const values = [...sourceQuestion[1].matchAll(/value:'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(values, ['draft', 'ai', 'comments']);
});

test('injected desktop and mobile chrome preserves the skip link as body first child', () => {
  const insertChromeAfterSkip = Function(
    'document',
    `return (${extractFunction(app, 'insertChromeAfterSkip')});`,
  );
  const bodyNodes = [];
  const body = {
    firstChild: null,
    insertBefore(node, reference) {
      const oldIndex = bodyNodes.indexOf(node);
      if (oldIndex >= 0) bodyNodes.splice(oldIndex, 1);
      const index = reference == null ? bodyNodes.length : bodyNodes.indexOf(reference);
      bodyNodes.splice(index < 0 ? bodyNodes.length : index, 0, node);
      node.parentNode = body;
      body.firstChild = bodyNodes[0] || null;
    },
  };
  const intro = { parentNode: body };
  const skip = { parentNode: body };
  Object.defineProperty(skip, 'nextSibling', {
    get() {
      return bodyNodes[bodyNodes.indexOf(skip) + 1] || null;
    },
  });
  bodyNodes.push(intro, skip);
  body.firstChild = intro;
  const documentStub = {
    body,
    querySelector(selector) {
      return selector === '.skip-link' ? skip : null;
    },
  };
  const header = {};

  insertChromeAfterSkip(documentStub)(header);

  assert.deepEqual(bodyNodes, [skip, header, intro]);
  assert.match(app, /header\.insertAdjacentElement\('afterend', mobileHeader\)/);
});

test('mobile brand uses its visible text as the accessible name', () => {
  const brand = app.match(/<a class="mobile-appbar__brand"[^>]*>/);
  assert.ok(brand, 'mobile brand link must exist');
  assert.match(brand[0], /\bhref="\/"/);
  assert.match(brand[0], /\btitle="На главную"/);
  assert.doesNotMatch(brand[0], /\baria-label=/);
});

test('saved draft cannot replace a contextual mobile route', () => {
  const hasContextRoute = Function(
    'URL',
    'location',
    `return (${extractFunction(extras, 'hasContextRoute')});`,
  )(URL, { href: 'https://akademsalon.ru/knowledge.html' });
  const link = (href) => ({ getAttribute: () => href });

  assert.equal(hasContextRoute(link('configurator.html?route=page&service=nm')), true);
  assert.equal(hasContextRoute(link('/configurator.html?route=case1&service=df')), true);
  assert.equal(hasContextRoute(link('configurator.html?service=au')), true);
  assert.equal(hasContextRoute(link('configurator.html?service=ai')), true);
  assert.equal(hasContextRoute(link('configurator.html?step=2')), false);
  assert.match(
    extras,
    /if \(dockCalc && here !== 'configurator\.html' && !hasContextRoute\(dockCalc\)\)/,
  );
});

test('library copy does not promise to persist a page filter', () => {
  assert.match(knowledge, /Выберите тему текущей задачи/);
  assert.doesNotMatch(knowledge, /сохранит выбранн(?:ую|ый) (?:стадию|фильтр)/i);
  assert.doesNotMatch(app, /маршрут сохранит выбранную стадию/i);
});
