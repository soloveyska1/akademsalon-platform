(function () {
  'use strict';

  var desk = document.querySelector('[data-guided-desk]');
  if (!desk) return;

  var dossier = desk.querySelector('[data-desk-dossier]');
  var inputs = [].slice.call(desk.querySelectorAll('[data-desk-situation]'));
  var artifact = desk.querySelector('[data-desk-artifact]');
  var prompt = desk.querySelector('[data-desk-prompt]');
  var primary = desk.querySelector('[data-desk-primary]');
  var free = desk.querySelector('[data-desk-free]');
  var mobilePrimary = document.querySelector('.mobile-dock--home .mobile-dock__primary');
  var mobilePrimaryLabel = mobilePrimary && mobilePrimary.querySelector('.mn-l');
  var mobilePrimaryCanSync = mobilePrimaryLabel &&
    !(mobilePrimary && mobilePrimary.getAttribute('data-resume-draft') === 'true');
  var announcement = desk.querySelector('[data-desk-announcement]');
  var updateTimer = 0;

  var fields = {
    number: [].slice.call(desk.querySelectorAll('[data-desk-number]')),
    kicker: desk.querySelector('[data-desk-kicker]'),
    title: desk.querySelector('[data-desk-title]'),
    copy: desk.querySelector('[data-desk-copy]'),
    need: desk.querySelector('[data-desk-need]'),
    result: desk.querySelector('[data-desk-result]'),
    priceLabel: desk.querySelector('[data-desk-price-label]'),
    price: desk.querySelector('[data-desk-price]'),
    primaryLabel: desk.querySelector('[data-desk-primary-label]'),
    actionNote: desk.querySelector('[data-desk-action-note]'),
    artifactSummary: desk.querySelector('[data-desk-artifact-summary]'),
    artifactLabel: desk.querySelector('[data-desk-artifact-label]'),
    artifactTitle: desk.querySelector('[data-desk-artifact-title]'),
    artifactOne: desk.querySelector('[data-desk-artifact-one]'),
    artifactOneNote: desk.querySelector('[data-desk-artifact-one-note]'),
    artifactTwo: desk.querySelector('[data-desk-artifact-two]'),
    artifactTwoNote: desk.querySelector('[data-desk-artifact-two-note]'),
    artifactThree: desk.querySelector('[data-desk-artifact-three]'),
    artifactThreeNote: desk.querySelector('[data-desk-artifact-three-note]')
  };

  var routes = {
    text: {
      number: '01',
      label: 'Начать',
      kicker: 'Есть задание или тема',
      title: 'Начнём с задания',
      copy: 'Посмотрим требования, уточним тему и предложим первый конкретный результат.',
      need: 'задание или описание задачи',
      result: 'понятный план первого этапа',
      priceLabel: 'Цена',
      price: 'до оплаты, после просмотра задания',
      primary: '/configurator.html?route=home-zero&situation=topic&result=diagnostic',
      primaryLabel: 'Начать с задания',
      free: '/services.html',
      freeLabel: 'Другой случай',
      freeAria: 'Посмотреть все услуги и цены',
      actionNote: 'Сначала увидите состав, срок и цену. Продолжать необязательно.',
      artifactSummary: 'Что входит в первый этап?',
      artifactLabel: 'Пример этапа',
      artifactTitle: 'От задания к понятному результату',
      artifact: [
        ['Уточняем задачу', 'тема, требования и срок'],
        ['Собираем структуру', 'логика и состав этапа'],
        ['Готовим материал', 'по зафиксированному результату']
      ]
    },
    comments: {
      number: '02',
      label: 'Доработать',
      kicker: 'Черновик или замечания',
      title: 'Разберём ваш файл',
      copy: 'Сначала отделим обязательные правки от пожеланий и оценим точный объём редактуры.',
      need: 'файл, требования или замечания',
      result: 'список правок и точный объём редактуры',
      priceLabel: 'Цена',
      price: 'от 2 500 ₽ за разбор',
      primary: '/configurator.html?route=home-edit&situation=comments&result=diagnostic',
      primaryLabel: 'Разобрать файл',
      free: '/services.html',
      freeLabel: 'Другой случай',
      freeAria: 'Посмотреть все услуги и цены',
      actionNote: 'Сначала увидите состав, срок и цену. Продолжать необязательно.',
      artifactSummary: 'Как проходит разбор?',
      artifactLabel: 'Фрагмент разбора',
      artifactTitle: 'Замечания становятся порядком действий',
      artifact: [
        ['Сначала — логика', 'что меняет содержание'],
        ['Затем — аргументация', 'где не хватает связи'],
        ['После — оформление', 'без двойной работы']
      ]
    },
    defense: {
      number: '03',
      label: 'Успеть к сроку',
      kicker: 'Срок уже близко',
      title: 'Проверим, что реально успеть',
      copy: 'Сверим объём с вашей датой и начнём с того, что сильнее всего влияет на результат.',
      need: 'файл, требования и точную дату',
      result: 'реалистичный объём и план к вашей дате',
      priceLabel: 'Цена',
      price: 'до оплаты, после проверки материалов',
      primary: '/configurator.html?route=home-urgent',
      primaryLabel: 'Указать срок',
      free: '/services.html',
      freeLabel: 'Другой случай',
      freeAria: 'Посмотреть все услуги и цены',
      actionNote: 'Сначала увидите состав, срок и цену. Продолжать необязательно.',
      artifactSummary: 'Как расставим приоритеты?',
      artifactLabel: 'Срочный маршрут',
      artifactTitle: 'Сначала то, что влияет на результат',
      artifact: [
        ['Проверяем объём', 'что реально успеть'],
        ['Выбираем главное', 'без лишней работы'],
        ['Фиксируем срок', 'и состав результата']
      ]
    }
  };

  function setText(node, value) {
    if (node) node.textContent = value;
  }

  function track(name, value) {
    try {
      if (window.Salon && Salon.visit && typeof Salon.visit.event === 'function') {
        Salon.visit.event(name, {
          cta: 'home_editorial_desk',
          variant: String(value || 'na').slice(0, 24)
        });
      }
    } catch (error) {}
  }

  function revealDossierOnCompactScreen() {
    if (!dossier || !window.matchMedia || !window.matchMedia('(max-width: 920px)').matches) return;
    var viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    var dock = document.querySelector('.mobile-dock--home');
    var dockHeight = dock ? dock.getBoundingClientRect().height : 0;
    var revealTarget = fields.title || dossier;
    if (revealTarget.getBoundingClientRect().bottom <= viewportHeight - dockHeight - 16) return;
    window.requestAnimationFrame(function () {
      dossier.scrollIntoView({
        behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block:'start'
      });
    });
  }

  function selectSituation(code, options) {
    var route = routes[code];
    if (!route) return;
    options = options || {};

    if (prompt) prompt.hidden = true;
    if (dossier) dossier.hidden = false;

    inputs.forEach(function (input) {
      input.checked = input.value === code;
    });
    fields.number.forEach(function (node) { setText(node, route.number); });
    setText(fields.kicker, route.kicker);
    setText(fields.title, route.title);
    setText(fields.copy, route.copy);
    setText(fields.need, route.need);
    setText(fields.result, route.result);
    setText(fields.priceLabel, route.priceLabel);
    setText(fields.price, route.price);
    setText(fields.primaryLabel, route.primaryLabel);
    setText(fields.actionNote, route.actionNote);
    setText(fields.artifactSummary, route.artifactSummary);
    setText(fields.artifactLabel, route.artifactLabel);
    setText(fields.artifactTitle, route.artifactTitle);
    setText(fields.artifactOne, route.artifact[0][0]);
    setText(fields.artifactOneNote, route.artifact[0][1]);
    setText(fields.artifactTwo, route.artifact[1][0]);
    setText(fields.artifactTwoNote, route.artifact[1][1]);
    setText(fields.artifactThree, route.artifact[2][0]);
    setText(fields.artifactThreeNote, route.artifact[2][1]);

    if (primary) primary.href = route.primary;
    if (free) {
      free.href = route.free;
      free.textContent = route.freeLabel;
      free.setAttribute('aria-label', route.freeAria);
    }
    /* Сохранённый черновик остаётся главным только до нового осознанного
       выбора. Иначе на телефоне единственная видимая CTA уводит в старую
       заявку, потому что кнопка внутри досье скрыта нижней навигацией. */
    var shouldSyncMobilePrimary = mobilePrimaryCanSync || !options.initial;
    if (mobilePrimary && shouldSyncMobilePrimary) {
      mobilePrimary.href = route.primary;
      mobilePrimary.setAttribute('aria-label', 'Продолжить: ' + route.primaryLabel.toLowerCase());
      if (!options.initial) mobilePrimary.removeAttribute('data-resume-draft');
    }
    if (mobilePrimaryLabel && shouldSyncMobilePrimary) mobilePrimaryLabel.textContent = 'Продолжить';

    if (announcement && !options.initial) {
      announcement.textContent = 'Выбрано: ' + route.label + '. Первый результат: ' +
        route.result + '. ' + route.priceLabel + ': ' + route.price + '.';
    }

    if (dossier && !options.initial) {
      dossier.classList.remove('is-updating');
      window.requestAnimationFrame(function () {
        dossier.classList.add('is-updating');
        window.clearTimeout(updateTimer);
        updateTimer = window.setTimeout(function () {
          dossier.classList.remove('is-updating');
        }, 300);
      });
      revealDossierOnCompactScreen();
    }

    if (!options.initial) {
      try { localStorage.setItem('salon_home_situation', code); } catch (error) {}
      track('home_desk_situation', code);
    }
  }

  inputs.forEach(function (input) {
    input.addEventListener('change', function () {
      if (input.checked) selectSituation(input.value);
    });
  });

  if (artifact) {
    artifact.addEventListener('toggle', function () {
      track('home_desk_artifact', artifact.open ? 'open' : 'close');
    });
  }

  [primary, free].forEach(function (link) {
    if (!link) return;
    link.addEventListener('click', function () {
      track('home_desk_continue', link === free ? 'free' : 'configurator');
    });
  });

  var initial = '';
  try {
    var saved = localStorage.getItem('salon_home_situation');
    if (routes[saved]) initial = saved;
  } catch (error) {}
  if (initial) {
    selectSituation(initial, { initial: true });
    /* На коротком экране восстановленное досье может целиком оказаться под
       фиксированной панелью. Скроллим только когда его заголовок не виден. */
    window.requestAnimationFrame(revealDossierOnCompactScreen);
  } else if (mobilePrimaryCanSync) {
    mobilePrimary.href = '#deskStart';
    mobilePrimaryLabel.textContent = 'Выбрать';
  }
}());
