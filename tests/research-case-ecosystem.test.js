const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const home = read('index.html');
const homeJs = read('assets/js/home-ecosystem.js');
const homeCss = read('assets/css/home-ecosystem.css');
const app = read('assets/js/app.js');
const chromeCss = read('assets/css/chrome.css');
const configurator = read('configurator.html');
const knowledge = read('knowledge.html');
const catalog = read('assets/js/polish15-catalog.js');

function makeClassifierHarness({ mobile = true, preset = 'Есть черновик ВКР, нужна редактура' } = {}) {
  class FakeClassList {
    constructor() {
      this.values = new Set();
    }
    toggle(name, force) {
      if (force) this.values.add(name);
      else this.values.delete(name);
    }
    contains(name) {
      return this.values.has(name);
    }
  }

  class FakeNode {
    constructor(tagName = 'div') {
      this.tagName = tagName.toUpperCase();
      this.attributes = {};
      this.children = [];
      this.listeners = {};
      this.classList = new FakeClassList();
      this.focusCalls = [];
      this.scrollCalls = [];
      this.hidden = false;
      this.href = '';
      this.value = '';
      this._textContent = '';
      this._innerHTML = '';
    }
    addEventListener(type, listener) {
      (this.listeners[type] ||= []).push(listener);
    }
    dispatch(type, event = {}) {
      for (const listener of this.listeners[type] || []) listener(event);
    }
    appendChild(child) {
      this.children.push(child);
      return child;
    }
    querySelector(selector) {
      if (selector === 'strong') return this.strong || null;
      return null;
    }
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }
    getAttribute(name) {
      return this.attributes[name] ?? null;
    }
    focus(options) {
      this.focusCalls.push(options);
      document.activeElement = this;
    }
    scrollIntoView(options) {
      this.scrollCalls.push(options);
    }
    set textContent(value) {
      this._textContent = String(value);
      if (value === '') this.children = [];
    }
    get textContent() {
      return this._textContent;
    }
    set innerHTML(value) {
      this._innerHTML = String(value);
      if (value === '') this.children = [];
    }
    get innerHTML() {
      return this._innerHTML;
    }
  }

  const form = new FakeNode('form');
  const input = new FakeNode('textarea');
  const route = new FakeNode('aside');
  const presetButton = new FakeNode('button');
  presetButton.setAttribute('data-case-preset', preset);

  const slots = Object.fromEntries([
    'confidence', 'state', 'result', 'why', 'need',
    'price', 'change', 'open', 'free', 'confirm',
  ].map((name) => [name, new FakeNode(name === 'open' || name === 'free' ? 'a' : 'div')]));
  slots.free.strong = new FakeNode('strong');

  const selectors = {
    '[data-case-form]': form,
    '[data-case-input]': input,
    '[data-route-confidence]': slots.confidence,
    '[data-route-state]': slots.state,
    '[data-route-result]': slots.result,
    '[data-route-why]': slots.why,
    '[data-route-need]': slots.need,
    '[data-route-price]': slots.price,
    '[data-route-change]': slots.change,
    '[data-route-open]': slots.open,
    '[data-route-free]': slots.free,
    '[data-route-confirm]': slots.confirm,
    '.case-route': route,
  };
  const document = {
    activeElement: null,
    querySelector(selector) {
      return selectors[selector] || null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-case-preset]') return [presetButton];
      return [];
    },
    createElement(tagName) {
      return new FakeNode(tagName);
    },
    createTextNode(value) {
      return { nodeType: 3, textContent: String(value) };
    },
  };
  const events = [];
  const Salon = {
    visit: {
      event(name, payload) {
        events.push({ name, payload });
      },
    },
  };
  const SalonCalc = {
    quote() {
      return { lowFmt: '24 000' };
    },
  };
  const window = {
    Salon,
    SalonCalc,
    matchMedia(query) {
      return { matches: query.includes('max-width') ? mobile : false };
    },
  };
  const context = vm.createContext({
    document,
    window,
    Salon,
    SalonCalc,
    URL,
    URLSearchParams,
    location: { href: 'https://example.test/' },
    console,
  });
  vm.runInContext(homeJs, context, { filename: 'assets/js/home-ecosystem.js' });

  return {
    document,
    events,
    form,
    input,
    presetButton,
    route,
    slots,
    submit(phrase) {
      input.value = phrase;
      form.dispatch('submit', { preventDefault() {} });
    },
    choose(label) {
      const button = slots.confirm.children.find((item) => item.textContent === label);
      assert.ok(button, `clarification button must exist: ${label}`);
      button.dispatch('click');
    },
  };
}

test('home opens one explainable research case before asking for contact', () => {
  for (const marker of [
    'data-case-form',
    'data-case-input',
    'data-route-confidence',
    'data-route-why',
    'data-route-need',
    'data-route-change',
    'data-route-free',
    'Контакт не требуется',
    'мы её не отправляем и не сохраняем',
  ]) {
    assert.ok(home.includes(marker), `home must expose ${marker}`);
  }
  assert.match(home, /Одно дело\.<br>От темы до защиты\./);
  assert.match(home, /Самостоятельно/);
  assert.match(home, /Не узнали ситуацию\?[\s\S]*?Спросите мастера без заказа/);
  assert.doesNotMatch(home, /Работаем, пока ты отдыхаешь|Рассчитать проект/);
});

test('local classifier is explainable, reversible and never serializes the raw phrase', () => {
  assert.match(homeJs, /function classify\(raw\)/);
  assert.match(homeJs, /function findResults\(text\)/);
  assert.match(homeJs, /function showResultConflict/);
  assert.match(homeJs, /function showUncertain/);
  assert.match(homeJs, /function showBlocked/);
  assert.match(homeJs, /Такой запрос не принимается/);
  assert.match(homeJs, /situations\.length > 1/);
  assert.match(homeJs, /works\.length > 1/);
  assert.match(homeJs, /Одной фразы пока недостаточно для честной рекомендации/);
  assert.match(homeJs, /params\.set\('work',work\)/);
  assert.match(homeJs, /params\.set\('situation',situation\)/);
  assert.match(homeJs, /params\.set\('result',result\)/);
  assert.doesNotMatch(homeJs, /localStorage|sessionStorage|Salon\.store\.(?:set|save)/);
  assert.doesNotMatch(homeJs, /params\.set\([^,]+,\s*(?:raw|text|input\.value)\)/);
  assert.doesNotMatch(homeJs, /Salon\.visit\.event\([\s\S]{0,180}(?:raw|input\.value)/);
  assert.match(homeJs, /variant:\('r1_' \+ String\(variant \|\| 'na'\)\)\.slice\(0,32\)/);
  assert.match(homeJs, /track\('case_free_route_open',activeFreeCode\)/);
  assert.doesNotMatch(homeJs, /track\('case_free_route_open',[\s\S]{0,100}(?:href|getAttribute)/);
});

test('classifier dynamically blocks fabricated evidence and detector evasion', () => {
  const harness = makeClassifierHarness();
  const blocked = [
    'Придумайте результаты анкетирования для моей ВКР',
    'Сочините ответы пятидесяти респондентов для опроса',
    'Составьте результаты опроса для готового черновика',
    'Нарисуйте результаты анкеты, которых у меня нет',
    'Подгоните результаты опроса под нужную гипотезу',
    'Сгенерируйте выборку респондентов для эксперимента',
    'Сделайте текст неотличимым от человеческого, чтобы пройти детектор ИИ',
    'Перепишите так, чтобы детектор ИИ не распознал текст',
    'Перепишите, чтобы антиплагиат не нашёл',
    'Перепишите текст так, чтобы он не определялся как ИИ',
    'Помогите обойти проверку на ИИ',
    'Скройте признаки нейросети в готовом тексте',
    'Сделайте процент ИИ нулевым',
  ];

  for (const phrase of blocked) {
    harness.submit(phrase);
    assert.equal(harness.slots.confidence.textContent, 'Такой запрос не принимается', phrase);
    assert.equal(harness.slots.open.href, '/academic-integrity.html', phrase);
  }
});

test('classifier dynamically preserves safe visualization of supplied evidence', () => {
  const harness = makeClassifierHarness();
  const safe = [
    'Есть черновик ВКР. Нарисуйте диаграмму по моим собранным данным опроса',
    'Создайте график на основе предоставленных результатов анкеты, черновик уже есть',
    'Есть черновик ВКР, не придумывайте результаты опроса, нужна диагностика',
    'Помогите составить анкету для сбора моих будущих данных',
    'Объясните, почему детектор ИИ не распознал корректную цитату',
  ];

  for (const phrase of safe) {
    harness.submit(phrase);
    assert.notEqual(harness.slots.confidence.textContent, 'Такой запрос не принимается', phrase);
    assert.notEqual(harness.slots.open.href, '/academic-integrity.html', phrase);
  }
});

test('conflicting requested results require an explicit first priority', () => {
  const phrase = 'Есть мой черновик ВКР, нужна редактура и оформление по ГОСТ';
  const editFirst = makeClassifierHarness();
  editFirst.submit(phrase);

  assert.equal(editFirst.slots.result.textContent, 'Что важнее первым?');
  assert.equal(editFirst.slots.confidence.textContent, 'Нужно выбрать приоритет');
  assert.deepEqual(
    editFirst.slots.confirm.children.map((button) => button.textContent),
    ['Сначала редактура', 'Сначала оформление'],
  );
  editFirst.choose('Сначала редактура');
  let route = new URL(editFirst.slots.open.href, 'https://example.test/');
  assert.equal(route.searchParams.get('result'), 'editing');
  assert.equal(route.searchParams.get('service'), null);

  const formatFirst = makeClassifierHarness();
  formatFirst.submit(phrase);
  formatFirst.choose('Сначала оформление');
  route = new URL(formatFirst.slots.open.href, 'https://example.test/');
  assert.equal(route.searchParams.get('result'), 'formatting');
  assert.equal(route.searchParams.get('service'), 'nm');
});

test('clear tutoring and post-AI editing contexts use formal safe route codes', () => {
  const tutoring = makeClassifierHarness();
  tutoring.submit('У меня только тема ВКР, нужна консультация по методологии с редактором');
  let route = new URL(tutoring.slots.open.href, 'https://example.test/');
  assert.equal(tutoring.slots.result.textContent, 'Консультация с редактором');
  assert.equal(route.searchParams.get('result'), 'tutoring');
  assert.equal(route.searchParams.get('service'), 'tu');

  const aiEditing = makeClassifierHarness();
  const phrase = 'Есть черновик ВКР после ChatGPT, нужна редактура и проверка фактов';
  aiEditing.submit(phrase);
  route = new URL(aiEditing.slots.open.href, 'https://example.test/');
  assert.equal(aiEditing.slots.result.textContent, 'Редактура текста после ИИ');
  assert.equal(route.searchParams.get('result'), 'ai_editing');
  assert.equal(route.searchParams.get('service'), 'ai');

  const allowedParams = new Set(['work', 'situation', 'result', 'service', 'route']);
  for (const key of route.searchParams.keys()) assert.ok(allowedParams.has(key), `unexpected URL key: ${key}`);
  assert.doesNotMatch(decodeURIComponent(route.href), /черновик|chatgpt|факт/i);
  assert.ok(aiEditing.events.every(({ payload }) => !String(payload.variant).includes(phrase)));
  assert.ok(aiEditing.events.every(({ payload }) => payload.variant.startsWith('r1_')));
  assert.ok(aiEditing.events.every(({ payload }) => payload.variant.length <= 32));
});

test('candidate diagnostics keep the work-based route and its canonical first price', () => {
  const candidate = makeClassifierHarness();
  candidate.submit('Есть черновик кандидатской диссертации, нужна диагностика');
  const route = new URL(candidate.slots.open.href, 'https://example.test/');
  assert.equal(route.searchParams.get('work'), 'kandidat');
  assert.equal(route.searchParams.get('result'), 'diagnostic');
  assert.equal(route.searchParams.has('service'), false);
  assert.equal(candidate.slots.price.textContent, 'от 24 000 ₽ · диапазон после материалов');
});

test('chapter is recognized as the eleventh canonical work type', () => {
  const harness = makeClassifierHarness();
  harness.submit('Есть мой черновик главы исследования, нужна редактура');
  const route = new URL(harness.slots.open.href, 'https://example.test/');
  assert.equal(route.searchParams.get('work'), 'chapter');
  assert.equal(route.searchParams.get('situation'), 'draft');
  assert.equal(route.searchParams.get('result'), 'editing');
  assert.match(harness.slots.state.textContent, /глава исследования/);
});

test('submit and presets focus and reveal the route only on mobile', () => {
  const mobile = makeClassifierHarness();
  mobile.submit('Есть черновик ВКР, нужна редактура');
  assert.equal(mobile.document.activeElement, mobile.route);
  assert.equal(mobile.route.getAttribute('tabindex'), '-1');
  assert.equal(mobile.route.scrollCalls.at(-1).behavior, 'smooth');
  assert.equal(mobile.route.scrollCalls.at(-1).block, 'start');

  const focusCount = mobile.route.focusCalls.length;
  mobile.presetButton.dispatch('click');
  assert.equal(mobile.route.focusCalls.length, focusCount + 1);
  assert.equal(mobile.document.activeElement, mobile.route);

  const desktop = makeClassifierHarness({ mobile: false });
  desktop.submit('Есть черновик ВКР, нужна редактура');
  assert.equal(desktop.route.focusCalls.length, 0);
  assert.equal(desktop.route.scrollCalls.length, 0);
  assert.match(homeCss, /@media\(max-width:920px\)[\s\S]*?\.home-case \.case-route\{[\s\S]*?scroll-margin-top:8px/);
  assert.match(homeCss, /\.home-case \.case-route:focus\{[\s\S]*?outline:none/);
});

test('safe route codes prefill the configurator and are removed from its address', () => {
  for (const code of ['work', 'situation', 'result', 'discipline']) {
    assert.match(configurator, new RegExp(`routeParams\\.get\\('${code}'\\)`));
    assert.match(configurator, new RegExp(`routeParams\\.delete\\('${code}'\\)`));
  }
  assert.match(configurator, /routeParams\.delete\('route'\)/);
  assert.match(
    configurator,
    /routedWork && routedDiscipline && routedSituation && routedResult \? 3[\s\S]*?routedWork && routedDiscipline && routedSituation \? 2/,
  );
  assert.match(configurator, /Участие клиента подтверждено/);
  assert.doesNotMatch(configurator, /Подтверждаю авторский контур/);
});

test('every major public surface can continue the same case', () => {
  assert.match(app, /function pageCaseContext\(\)/);
  assert.match(app, /function caseRoute\(work, situation, result\)/);
  assert.match(app, /className = 'case-bridge'/);
  assert.match(app, /data-case-bridge-action="self"/);
  assert.match(app, /data-case-bridge-action="route"/);
  assert.match(app, /var stageNames = \['Разобрать','Подготовить','Проверить','Представить'\]/);
  assert.match(chromeCss, /\.case-bridge__inner\{/);
  assert.match(chromeCss, /@media\(max-width:620px\)\{[\s\S]*?\.case-bridge__stages\{/);
  assert.match(app, /mobileRouteHref = currentCaseContext \? currentCaseContext\.action/);
});

test('library, catalog and mobile proof no longer contain orphan routes', () => {
  const topics = [...knowledge.matchAll(/data-topic="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(topics.length, 25, 'all 25 library cards must remain discoverable');
  assert.ok(topics.every((topic) => topic !== 'other'), 'no article may fall into an “other” bucket');
  for (const topic of [
    'start', 'methodology', 'sources', 'formatting',
    'practice', 'defense', 'publication', 'price',
  ]) {
    assert.ok(topics.includes(topic), `library must expose ${topic}`);
  }
  for (const route of [
    'Редактура вашей курсовой',
    'Аудит и редактура вашей ВКР',
    'Научная статья РИНЦ',
  ]) {
    assert.match(catalog, new RegExp(`'${route}'[\\s\\S]{0,180}route=price`));
  }
  assert.match(homeCss, /\.home-case~\.site-footer\{display:block!important\}/);
  assert.match(homeCss, /\.home-case \.commission0-feature\{display:block\}/);
});

test('public service copy uses plain participation language while legal terms stay defined', () => {
  for (const file of [
    'kursovaya-rabota.html',
    'diplomnaya-rabota.html',
    'magisterskaya-dissertaciya.html',
  ]) {
    const source = read(file);
    assert.doesNotMatch(source, /авторск\w*\s+контур/i, `${file} must not expose internal jargon`);
    assert.match(source, /ваше участие|решения, которые останутся за вами/i);
  }
  assert.match(
    read('academic-integrity.html'),
    /Обязательное участие Заказчика[\s\S]*?в Оферте[\s\S]*?«авторским контуром»/,
  );
});
