(function () {
  'use strict';

  var form = document.querySelector('[data-topic-form]');
  var result = document.querySelector('[data-topic-result]');
  var scoreNode = document.querySelector('[data-topic-score]');
  var verdict = document.querySelector('[data-topic-verdict]');
  var list = document.querySelector('[data-topic-list]');
  var copy = document.querySelector('[data-topic-copy]');
  var sample = document.querySelector('[data-topic-sample]');
  var analyzeButton = document.querySelector('[data-topic-analyze]');
  if (!form || !result || !scoreNode || !verdict || !list || !analyzeButton) return;

  function field(name) {
    return form.querySelector('[name="' + name + '"]');
  }

  function value(name) {
    var input = field(name);
    return input ? String(input.value || '').trim() : '';
  }

  function words(text) {
    return String(text || '').toLowerCase().match(/[а-яёa-z0-9-]{3,}/gi) || [];
  }

  var STOP_WORDS = {
    для: true, как: true, или: true, при: true, это: true, этой: true, этот: true,
    того: true, чтобы: true, через: true, между: true, после: true, перед: true,
    работа: true, работы: true, исследование: true, исследования: true,
  };

  function overlap(a, b) {
    var left = Object.create(null);
    words(a).forEach(function (word) {
      if (word.length >= 4 && !STOP_WORDS[word]) left[word] = true;
    });
    return words(b).some(function (word) {
      return word.length >= 4 && !STOP_WORDS[word] && left[word];
    });
  }

  function addCheck(rows, label, pass, note, points) {
    rows.push({ label: label, note: note, pass: pass, points: pass ? points : 0, max: points });
  }

  function analyze(event) {
    if (event) event.preventDefault();
    var topic = value('topic');
    var goal = value('goal');
    var object = value('object');
    var subject = value('subject');
    var tasks = value('tasks').split(/\n|;/).map(function (item) { return item.trim(); }).filter(Boolean);
    var data = value('data');
    var period = value('period');
    var methods = value('methods');
    var rows = [];

    addCheck(rows, 'Тема конкретна', topic.length >= 35 && topic.length <= 190,
      'Рабочая формулировка обычно называет явление, контекст и границу исследования; финальный формат всё равно задаёт кафедра.',
      14);
    addCheck(rows, 'Цель сформулирована как результат', goal.length >= 30 && !/изучить тему|рассмотреть вопрос/i.test(goal),
      'Лучше назвать результат: выявить, оценить, разработать или обосновать — и уточнить, для чего.',
      14);
    addCheck(rows, 'Объект и предмет разведены', object.length >= 12 && subject.length >= 18 && object.toLowerCase() !== subject.toLowerCase(),
      'Объект шире; предмет — конкретная сторона, связь или механизм внутри объекта.',
      14);
    addCheck(rows, 'Тема связана с целью', overlap(topic, goal),
      'В цели полезно повторить ключевой объект или предмет из темы, чтобы логика читалась без догадки.',
      12);
    addCheck(rows, 'Задачи образуют маршрут', tasks.length >= 3 && tasks.length <= 7,
      'Обычно достаточно 3–7 задач: теория → методика/данные → анализ → рекомендации.',
      14);
    addCheck(rows, 'Названа эмпирическая база', data.length >= 18,
      'Укажите организацию, выборку, корпус документов, статистику или другой проверяемый материал.',
      12);
    addCheck(rows, 'Есть временные или предметные границы', period.length >= 4,
      'Период, территория, отрасль или группа не дают теме расползтись.',
      10);
    addCheck(rows, 'Методы соответствуют замыслу', methods.length >= 12,
      'Методы должны описывать реальные действия с данными, а не декоративный список во введении.',
      10);

    var score = rows.reduce(function (sum, row) { return sum + row.points; }, 0);
    scoreNode.textContent = String(score);
    verdict.textContent = score >= 82
      ? 'Каркас выглядит связным. Теперь сверьте формулировки с методичкой и реальной доступностью данных.'
      : score >= 58
        ? 'Основа есть, но несколько звеньев пока держатся на предположениях. Исправьте пункты без галочки.'
        : 'Тему рано утверждать: сначала зафиксируйте объект, данные и границы, затем перепишите цель и задачи.';

    list.replaceChildren();
    rows.forEach(function (row) {
      var item = document.createElement('li');
      item.dataset.pass = row.pass ? 'true' : 'false';
      var status = document.createElement('span');
      status.className = 'visually-hidden';
      status.textContent = row.pass ? 'Пройдено. ' : 'Требует проверки. ';
      var body = document.createElement('span');
      var strong = document.createElement('b');
      strong.textContent = row.label;
      body.appendChild(strong);
      body.appendChild(document.createTextNode(row.note));
      item.appendChild(status);
      item.appendChild(body);
      list.appendChild(item);
    });
    result.hidden = false;
    result.focus({ preventScroll: true });
    result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (copy) copy.hidden = false;
    if (window.Salon && Salon.visit) Salon.visit.mark('инструмент: аудит темы завершен');
  }

  analyzeButton.addEventListener('click', analyze);
  form.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) analyze(event);
  });
  if (sample) sample.addEventListener('click', function () {
    field('topic').value = 'Оценка факторов удержания молодых специалистов в технологических компаниях Москвы';
    field('goal').value = 'Выявить факторы удержания молодых специалистов и разработать рекомендации для HR-службы компании';
    field('object').value = 'Система управления персоналом технологической компании';
    field('subject').value = 'Факторы, влияющие на удержание молодых специалистов в организации';
    field('tasks').value = 'Систематизировать подходы к удержанию персонала\nОпределить показатели и методы оценки\nПроанализировать данные опроса и интервью\nРазработать рекомендации';
    field('data').value = 'Анонимный опрос 80 сотрудников и 8 интервью с HR-специалистами';
    field('period').value = 'Москва, 2025–2026 годы';
    field('methods').value = 'Описательная статистика, тематический анализ интервью, сопоставление групп';
  });
  if (copy) copy.addEventListener('click', function () {
    var text = 'Паспорт темы\nТема: ' + value('topic') + '\nЦель: ' + value('goal') +
      '\nОбъект: ' + value('object') + '\nПредмет: ' + value('subject') +
      '\nЗадачи:\n' + value('tasks') + '\nДанные: ' + value('data') +
      '\nГраницы: ' + value('period') + '\nМетоды: ' + value('methods') +
      '\n\nСамопроверка: ' + scoreNode.textContent + '/100';
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () {
      copy.textContent = 'Скопировано ✓';
      setTimeout(function () { copy.textContent = 'Скопировать паспорт'; }, 1800);
    });
  });
})();
