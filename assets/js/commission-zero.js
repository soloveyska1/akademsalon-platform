(function commissionZero() {
  'use strict';

  var root = document.querySelector('[data-question-zero]');
  if (!root) return;

  var state = { work: 'diplom', source: 'ai' };
  var form = root.querySelector('[data-q0-form]');
  var topic = root.querySelector('[data-q0-topic]');
  var output = root.querySelector('[data-q0-output]');
  var question = root.querySelector('[data-q0-text]');
  var gap = root.querySelector('[data-q0-gap]');
  var label = root.querySelector('[data-q0-label]');
  var code = root.querySelector('[data-q0-code]');
  var price = root.querySelector('[data-q0-price]');
  var route = root.querySelector('[data-q0-route]');
  var share = root.querySelector('[data-q0-share]');

  var works = {
    course: { short: 'КР', label: 'курсовой', price: '9 900 ₽' },
    diplom: { short: 'ВКР', label: 'ВКР', price: '19 900 ₽' },
    master: { short: 'МАГ', label: 'магистерской', price: '29 900 ₽' }
  };
  var sources = {
    topic: { short: 'TOPIC', label: 'темы' },
    draft: { short: 'DRAFT', label: 'своего текста' },
    ai: { short: 'AI', label: 'черновика после ИИ' }
  };

  function chooseQuestion(value) {
    var text = String(value || '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
    var isData = /опрос|анкет|интерв|выборк|эксперимент|статист|данн|эмпир|респондент/.test(text);
    var isLaw = /прав|закон|суд|норматив|юрид/.test(text);
    var isMetric = /эффектив|влияни|результатив|показател|динамик|сравн|изменени/.test(text);
    var isTech = /алгоритм|систем|программ|модел|нейросет|информацион|приложени/.test(text);

    if (state.source === 'ai') {
      if (isData) return {
        q:'Откуда взялась выборка, и можете ли вы воспроизвести хотя бы один ключевой расчёт без текста черновика?',
        gap:'происхождение данных, воспроизводимость расчёта и понимание метода'
      };
      if (isLaw) return {
        q:'Какая редакция нормы и какая судебная практика подтверждают главный правовой вывод — и что в них сказано дословно?',
        gap:'актуальность нормы, первоисточник и границы правового вывода'
      };
      if (isTech) return {
        q:'Какой измеримый критерий показывает, что предложенная система решает задачу лучше исходного варианта?',
        gap:'критерий проверки, исходная база и воспроизводимый результат'
      };
      return {
        q:'Какой источник вы открыли лично — и где именно он подтверждает главный вывод черновика?',
        gap:'происхождение тезиса и способность объяснить его своими словами'
      };
    }

    if (state.source === 'draft') {
      if (isMetric) return {
        q:'Относительно какой базы измеряется заявленное изменение, на каком массиве данных и почему выбран именно этот показатель?',
        gap:'база сравнения, измеримость результата и связь с выводом'
      };
      if (isData) return {
        q:'Какая часть вывода следует из данных напрямую, а какая остаётся вашей интерпретацией?',
        gap:'граница между наблюдаемым результатом и интерпретацией автора'
      };
      return {
        q:'Какой главный вывод в тексте опирается на проверяемое доказательство, а какой пока держится только на формулировке?',
        gap:'связь вывода с источником, данными или исследовательским решением'
      };
    }

    if (isData) return {
      q:'Какие данные действительно доступны для этой темы — и какой вывод они позволят проверить, а не просто проиллюстрировать?',
      gap:'доступность реального массива и соответствие данных исследовательскому вопросу'
    };
    if (isMetric) return {
      q:'Какой один проверяемый показатель позволит отличить результат исследования от общего рассуждения по теме?',
      gap:'измеримый результат, исходная база и критерий сравнения'
    };
    return {
      q:'Какой один проверяемый результат отличит исследование по этой теме от пересказа источников?',
      gap:'исследовательский вопрос, доступное доказательство и граница будущего вывода'
    };
  }

  function paintButtons(selector, key, value) {
    root.querySelectorAll(selector).forEach(function (button) {
      var active = button.getAttribute(key) === value;
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function updatePrice() {
    if (price) {
      price.textContent = state.source === 'topic'
        ? (state.work === 'master' ? '5 000 ₽' : '3 000 ₽')
        : works[state.work].price;
    }
    var foot = root.querySelector('.q0-sheet__foot span');
    if (foot) {
      foot.textContent = state.source === 'topic'
        ? 'Сначала — письменный разбор темы и плана'
        : 'Комиссия №0 для ' + works[state.work].label;
    }
  }

  function updateRoute() {
    if (!route) return;
    if (state.source === 'topic') {
      route.href = 'configurator.html?service=pl&work=' + encodeURIComponent(state.work) +
        '&situation=topic&result=diagnostic&route=page';
      route.innerHTML = 'Сначала разобрать тему и план <span aria-hidden="true">→</span>';
      route.setAttribute('aria-label', 'Открыть разбор темы и плана: Комиссия №0 пока преждевременна');
      return;
    }
    route.href = 'configurator.html?service=k0';
    route.innerHTML = 'Передать готовую версию Оппоненту <span aria-hidden="true">→</span>';
    route.removeAttribute('aria-label');
  }

  function handoff() {
    if (state.source === 'topic') {
      try { sessionStorage.removeItem('salon_commission_zero_handoff_v1'); } catch (e) {}
      return false;
    }
    try {
      sessionStorage.setItem('salon_commission_zero_handoff_v1', JSON.stringify({
        version: 1,
        work: state.work,
        source: state.source,
        topic: topic ? topic.value.trim().slice(0, 240) : '',
        savedAt: Date.now()
      }));
    } catch (e) {}
    return true;
  }

  root.addEventListener('click', function (event) {
    var work = event.target.closest && event.target.closest('[data-q0-work]');
    if (work) {
      state.work = work.getAttribute('data-q0-work');
      paintButtons('[data-q0-work]', 'data-q0-work', state.work);
      updatePrice();
      updateRoute();
      return;
    }
    var source = event.target.closest && event.target.closest('[data-q0-source]');
    if (source) {
      state.source = source.getAttribute('data-q0-source');
      paintButtons('[data-q0-source]', 'data-q0-source', state.source);
      updatePrice();
      updateRoute();
      return;
    }
    var order = event.target.closest && event.target.closest('[data-q0-route]');
    if (order) handoff();
  });

  document.querySelectorAll('[data-k0-order]').forEach(function (link) {
    link.addEventListener('click', function () {
      state.work = link.getAttribute('data-k0-work') || state.work;
      handoff();
    });
  });

  if (form) form.addEventListener('submit', function (event) {
    event.preventDefault();
    var selected = chooseQuestion(topic && topic.value);
    question.textContent = selected.q;
    gap.textContent = selected.gap;
    label.textContent = 'Ваш первичный Вопрос №0';
    code.textContent = 'Q0 / ' + sources[state.source].short + '–' + works[state.work].short;
    output.classList.remove('is-sample');
    output.setAttribute('tabindex', '-1');
    output.focus({ preventScroll: true });
    output.scrollIntoView({ behavior: window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  });

  if (share) share.addEventListener('click', function () {
    var shareData = {
      title: 'Вопрос №0 — Академический Салон',
      text: 'Настоящая комиссия не должна быть первой. Получите первый вопрос к своей работе.',
      url: location.origin + '/komissiya-0.html#question-zero'
    };
    if (navigator.share) {
      navigator.share(shareData).catch(function () {});
      return;
    }
    var value = shareData.text + ' ' + shareData.url;
    var copy = window.Salon && Salon.copy
      ? Salon.copy(value)
      : (navigator.clipboard && navigator.clipboard.writeText
        ? navigator.clipboard.writeText(value).then(function () { return true; })
        : Promise.resolve(false));
    copy.then(function (ok) {
      if (!ok) return;
      var original = share.textContent;
      share.textContent = 'Ссылка скопирована';
      setTimeout(function () { share.textContent = original; }, 1800);
    });
  });

  updatePrice();
  updateRoute();
})();
