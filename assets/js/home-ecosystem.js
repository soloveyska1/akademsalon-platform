/* Главная «Дело исследования»: локальный объяснимый маршрут и карта стадий. */
(function () {
  'use strict';

  var form = document.querySelector('[data-case-form]');
  var input = document.querySelector('[data-case-input]');
  if (!form || !input) return;

  var slots = {
    confidence:document.querySelector('[data-route-confidence]'),
    state:document.querySelector('[data-route-state]'),
    result:document.querySelector('[data-route-result]'),
    why:document.querySelector('[data-route-why]'),
    need:document.querySelector('[data-route-need]'),
    price:document.querySelector('[data-route-price]'),
    change:document.querySelector('[data-route-change]'),
    open:document.querySelector('[data-route-open]'),
    free:document.querySelector('[data-route-free]'),
    confirm:document.querySelector('[data-route-confirm]')
  };
  var stateLabels = {
    topic:'Только тема или задание',
    draft:'Есть рабочий черновик',
    comments:'Получены замечания',
    defense:'Скоро сдача или защита'
  };
  var workLabels = {
    course:'курсовая работа',
    course_emp:'курсовая с исследованием',
    diplom:'ВКР или диплом',
    master:'магистерская',
    chapter:'глава исследования',
    vak:'научная статья ВАК',
    scopus:'статья Scopus / Web of Science',
    rinc:'научная статья',
    practice:'отчёт по практике',
    kandidat:'диссертационное исследование',
    self:'другая работа'
  };
  var resultLabels = {
    diagnostic:'Письменная карта замечаний',
    editing:'Редактура вашего черновика',
    ai_editing:'Редактура текста после ИИ',
    formatting:'Проверка по методичке',
    defense:'Подготовка к защите',
    support:'Маршрут проекта с нуля',
    tutoring:'Консультация с редактором'
  };
  var resultChoiceLabels = {
    diagnostic:'Сначала диагностика',
    editing:'Сначала редактура',
    ai_editing:'Сначала редактура после ИИ',
    formatting:'Сначала оформление',
    defense:'Сначала подготовка к защите',
    support:'Сначала маршрут проекта',
    tutoring:'Сначала консультация'
  };
  var freeRoutes = {
    topic:['/audit-temy-vkr.html','Проверить тему самостоятельно','topic'],
    draft:['/check.html','Проверить признаки академического текста','draft'],
    comments:['/dosie-nauchruka.html','Собрать требования руководителя','comments'],
    defense:['/guide-rech-na-zashchitu.html','Проверить речь по чек-листу','defense'],
    formatting:['/guide-normocontrol.html','Сверить оформление самостоятельно','formatting'],
    ai_editing:['/guide-antiplagiat-ai.html','Проверить текст после ИИ самостоятельно','ai_editing'],
    tutoring:['/knowledge.html','Выбрать материал для разбора','tutoring']
  };
  var prompted = false;
  var routeCard = document.querySelector('.case-route');
  var activeFreeCode = 'knowledge';

  function track(name, variant) {
    try {
      if (window.Salon && Salon.visit && typeof Salon.visit.event === 'function') {
        Salon.visit.event(name, { cta:'research_case', variant:('r1_' + String(variant || 'na')).slice(0,32) });
      }
    } catch (e) {}
  }

  function normalize(value) {
    return String(value || '')
      .toLocaleLowerCase('ru-RU')
      .replace(/ё/g,'е')
      .replace(/[«»„“"']/g,' ')
      .replace(/[^\p{L}\p{N}\s-]/gu,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function uniq(items) {
    return items.filter(function (item,index) { return items.indexOf(item) === index; });
  }

  function matches(text, patterns) {
    return patterns.some(function (pattern) { return pattern.test(text); });
  }

  function findWorks(text) {
    var found = [];
    var masterMention = matches(text,[
      /магистр[а-яa-z0-9_-]*/,
      /магистер[а-яa-z0-9_-]*/
    ]);
    var chapterMention = matches(text,[
      /глав[а-яa-z0-9_-]*\s+(?:исследован[а-яa-z0-9_-]*|диссертац[а-яa-z0-9_-]*|вкр|диплом[а-яa-z0-9_-]*|работ[а-яa-z0-9_-]*|отчет[а-яa-z0-9_-]*)/,
      /(?:теоретическ[а-яa-z0-9_-]*|практическ[а-яa-z0-9_-]*|эмпирическ[а-яa-z0-9_-]*)\s+глав[а-яa-z0-9_-]*/,
      /(?:перв[а-яa-z0-9_-]*|втор[а-яa-z0-9_-]*|трет[а-яa-z0-9_-]*|\d+)\s+глав[а-яa-z0-9_-]*/
    ]);
    if (chapterMention) found.push('chapter');
    if (!chapterMention && matches(text,[/курсов[а-яa-z0-9_-]*/,/(?:^|\s)кр(?:\s|$)/])) {
      found.push(matches(text,[
        /эмпир[а-яa-z0-9_-]*/,
        /курсов[а-яa-z0-9_-]*\s+с\s+исследован[а-яa-z0-9_-]*/,
        /практическ[а-яa-z0-9_-]*\s+част[а-яa-z0-9_-]*/,
        /опрос[а-яa-z0-9_-]*/,
        /анализ\s+данн[а-яa-z0-9_-]*/
      ]) ? 'course_emp' : 'course');
    }
    if (!chapterMention && matches(text,[/вкр/,/диплом[а-яa-z0-9_-]*/])) found.push('diplom');
    if (!chapterMention && masterMention) found.push('master');
    if (matches(text,[/scopus/,/web\s+of\s+science/,/веб\s+оф\s+сайнс/])) found.push('scopus');
    else if (matches(text,[/(?:^|\s)вак(?:\s|$)/])) found.push('vak');
    else if (matches(text,[/стать[яиюе]/,/рукопис[а-яa-z0-9_-]*/,/ринц/])) found.push('rinc');
    if (!chapterMention && matches(text,[/практик[а-яa-z0-9_-]*/,/отчет[а-яa-z0-9_-]*\s+по\s+практик/])) found.push('practice');
    if (!chapterMention && (matches(text,[/кандидат[а-яa-z0-9_-]*/]) ||
        (matches(text,[/диссертац[а-яa-z0-9_-]*/]) &&
         !masterMention))) found.push('kandidat');
    if (matches(text,[/реферат[а-яa-z0-9_-]*/,/эссе/])) found.push('self');
    return uniq(found);
  }

  function findSituations(text) {
    var found = [];
    var noDraft = matches(text,[
      /(?:нет|без)\s+(?:моего\s+|готового\s+)?(?:черновик[а-яa-z0-9_-]*|текст[а-яa-z0-9_-]*)/,
      /только\s+тем[аыуе]/
    ]);
    if (noDraft || matches(text,[
      /(?:есть|дали|утвердили)\s+(?:только\s+)?(?:тем[аыуе]|задани[а-яa-z0-9_-]*)/,
      /с\s+нуля/,
      /пока\s+(?:только\s+)?тем[аыуе]/
    ])) found.push('topic');

    if (!noDraft && matches(text,[
      /есть\s+(?:мой\s+|готовый\s+)?черновик[а-яa-z0-9_-]*/,
      /(?:мой|готов)[а-яa-z0-9_-]*\s+(?:текст|черновик)[а-яa-z0-9_-]*/,
      /черновик[а-яa-z0-9_-]*\s+(?:есть|готов|написан)/,
      /рукопис[а-яa-z0-9_-]*\s+(?:есть|готов)/
    ])) found.push('draft');

    if (matches(text,[
      /замечани[а-яa-z0-9_-]*/,
      /комментар[а-яa-z0-9_-]*\s+(?:руководител[а-яa-z0-9_-]*|научрук[а-яa-z0-9_-]*)/,
      /(?:научрук[а-яa-z0-9_-]*|руководител[а-яa-z0-9_-]*)\s+(?:написал|прислал|дал|оставил)/,
      /правк[а-яa-z0-9_-]*\s+(?:руководител[а-яa-z0-9_-]*|научрук[а-яa-z0-9_-]*)/
    ])) found.push('comments');

    if (matches(text,[
      /скоро\s+(?:сдач[а-яa-z0-9_-]*|защит[а-яa-z0-9_-]*)/,
      /(?:сдач[а-яa-z0-9_-]*|защит[а-яa-z0-9_-]*)\s+(?:завтра|послезавтра|через|на\s+\d)/,
      /(?:завтра|послезавтра|скоро)\s+(?:сдач[а-яa-z0-9_-]*|защит[а-яa-z0-9_-]*)/,
      /перед\s+(?:сдач[а-яa-z0-9_-]*|защит[а-яa-z0-9_-]*)/,
      /готов[а-яa-z0-9_-]*\s+(?:к\s+)?защит[а-яa-z0-9_-]*/,
      /диплом\s+готов/
    ])) found.push('defense');
    return uniq(found);
  }

  function hasAiSource(text) {
    return matches(text,[
      /(?:^|\s)(?:ии|ai|gpt)(?:\s|$)/,
      /chatgpt|чатгпт|чат\s+гпт|джипити/,
      /нейросет[а-яa-z0-9_-]*|нейронк[а-яa-z0-9_-]*/,
      /(?:написан|создан|получен|сгенерирован)[а-яa-z0-9_-]*(?:\s+[а-яa-z0-9_-]+){0,3}\s+(?:ии|ai|нейросет[а-яa-z0-9_-]*)/
    ]);
  }

  function hasAiEditingIntent(text) {
    return matches(text,[
      /(?:редактур|редактир|отредакт)[а-яa-z0-9_-]*/,
      /редакторск[а-яa-z0-9_-]*\s+(?:правк|обработк)[а-яa-z0-9_-]*/,
      /вычит[а-яa-z0-9_-]*/,
      /доработ[а-яa-z0-9_-]*(?:\s+[а-яa-z0-9_-]+){0,3}\s+(?:текст|черновик|верси)[а-яa-z0-9_-]*/,
      /исправ[а-яa-z0-9_-]*(?:\s+[а-яa-z0-9_-]+){0,3}\s+(?:текст|черновик|ошибк|факт)[а-яa-z0-9_-]*/,
      /провер[а-яa-z0-9_-]*(?:\s+[а-яa-z0-9_-]+){0,3}\s+(?:факт|ссылк|источник|логик)[а-яa-z0-9_-]*/
    ]);
  }

  function hasTutoringIntent(text) {
    return matches(text,[
      /(?:^|\s)репетитор[а-яa-z0-9_-]*(?:\s|$)/,
      /(?:консультац[а-яa-z0-9_-]*|заняти[а-яa-z0-9_-]*)\s+с\s+(?:редактор[а-яa-z0-9_-]*|методолог[а-яa-z0-9_-]*|эксперт[а-яa-z0-9_-]*|репетитор[а-яa-z0-9_-]*)/,
      /(?:нужн[а-яa-z0-9_-]*|хочу|ищу)(?:\s+[а-яa-z0-9_-]+){0,3}\s+(?:консультац[а-яa-z0-9_-]*|заняти[а-яa-z0-9_-]*)\s+по\s+(?:методолог[а-яa-z0-9_-]*|структур[а-яa-z0-9_-]*|исследован[а-яa-z0-9_-]*|оформлен[а-яa-z0-9_-]*|защит[а-яa-z0-9_-]*|публикац[а-яa-z0-9_-]*)/
    ]);
  }

  function findResults(text) {
    var found = [];
    var aiEditing = hasAiSource(text) && hasAiEditingIntent(text);

    if (matches(text,[
      /диагност[а-яa-z0-9_-]*/,
      /аудит[а-яa-z0-9_-]*/,
      /разобрат[а-яa-z0-9_-]*\s+(?:ошиб|замеч|что)/
    ])) found.push('diagnostic');

    if (aiEditing) {
      found.push('ai_editing');
    } else if (matches(text,[
      /(?:редактур|редактир|отредакт)[а-яa-z0-9_-]*/,
      /редакторск[а-яa-z0-9_-]*\s+(?:правк|обработк)[а-яa-z0-9_-]*/,
      /вычит[а-яa-z0-9_-]*/,
      /исправ[а-яa-z0-9_-]*\s+(?:мой|черновик|текст)/
    ])) {
      found.push('editing');
    }

    if (matches(text,[
      /нормоконтрол[а-яa-z0-9_-]*/,
      /оформ[а-яa-z0-9_-]*/,
      /по\s+гост[а-яa-z0-9_-]*/,
      /методичк[а-яa-z0-9_-]*\s+(?:провер|свер|оформ)/
    ])) found.push('formatting');

    if (matches(text,[
      /подготов[а-яa-z0-9_-]*\s+к\s+защит[а-яa-z0-9_-]*/,
      /реч[а-яa-z0-9_-]*\s+к\s+защит[а-яa-z0-9_-]*/,
      /презентац[а-яa-z0-9_-]*/,
      /репетиц[а-яa-z0-9_-]*/
    ])) found.push('defense');

    if (matches(text,[/с\s+нуля/,/собрат[а-яa-z0-9_-]*\s+(?:проект|работ)/])) {
      found.push('support');
    }
    if (hasTutoringIntent(text)) found.push('tutoring');
    return uniq(found);
  }

  function isSafeVisualization(text) {
    var visual = matches(text,[
      /диаграмм[а-яa-z0-9_-]*/,
      /график[а-яa-z0-9_-]*/,
      /визуализац[а-яa-z0-9_-]*/,
      /визуализир[а-яa-z0-9_-]*/,
      /схем[а-яa-z0-9_-]*/,
      /таблиц[а-яa-z0-9_-]*/
    ]);
    var clientData = matches(text,[
      /по\s+(?:моим|нашим|собранным|готовым|реальным|предоставленным)(?:\s+[а-яa-z0-9_-]+){0,2}\s+(?:данн|результат|ответ)[а-яa-z0-9_-]*/,
      /на\s+основе\s+(?:моих|наших|собранных|готовых|реальных|предоставленных)(?:\s+[а-яa-z0-9_-]+){0,2}\s+(?:данн|результат|ответ)[а-яa-z0-9_-]*/,
      /из\s+(?:моего|нашего|готового|предоставленного)(?:\s+[а-яa-z0-9_-]+){0,2}\s+(?:файл|таблиц|датасет)[а-яa-z0-9_-]*/,
      /(?:данн|результат|ответ)[а-яa-z0-9_-]*\s+(?:уже\s+)?(?:собраны|получены|предоставлены|есть)/
    ]);
    return visual && clientData;
  }

  function isFabricationRequest(text) {
    var target = '(?:данн[а-яa-z0-9_-]*|результат[а-яa-z0-9_-]*|ответ[а-яa-z0-9_-]*|респондент[а-яa-z0-9_-]*|выборк[а-яa-z0-9_-]*|наблюдени[а-яa-z0-9_-]*|измерени[а-яa-z0-9_-]*|статистик[а-яa-z0-9_-]*)';
    var coreAction = '(?:придум[а-яa-z0-9_-]*|сочин[а-яa-z0-9_-]*|выдум[а-яa-z0-9_-]*|сфабрик[а-яa-z0-9_-]*|поддел[а-яa-z0-9_-]*|имитир[а-яa-z0-9_-]*)';
    var ambiguousAction = '(?:сгенерир[а-яa-z0-9_-]*|нарис[а-яa-z0-9_-]*|состав[а-яa-z0-9_-]*|созда[а-яa-z0-9_-]*|смоделир[а-яa-z0-9_-]*)';
    var gap = '(?:\\s+[а-яa-z0-9_-]+){0,8}\\s+';
    var coreNearTarget = new RegExp('(?:' + coreAction + gap + target + '|' + target + gap + coreAction + ')');
    var ambiguousNearTarget = new RegExp('(?:' + ambiguousAction + gap + target + '|' + target + gap + ambiguousAction + ')');
    var negatedForward = new RegExp('(?:не|без)\\s+(?:' + coreAction + '|' + ambiguousAction + ')' + gap + target,'g');
    var negatedReverse = new RegExp(target + '\\s+(?:не|без)\\s+(?:' + coreAction + '|' + ambiguousAction + ')','g');
    var actionableText = text.replace(negatedForward,'').replace(negatedReverse,'');
    var instrumentDesign = matches(text,[
      /(?:анкет[а-яa-z0-9_-]*|опросник[а-яa-z0-9_-]*|вопрос[а-яa-z0-9_-]*\s+для\s+опрос[а-яa-z0-9_-]*)/
    ]) && matches(text,[
      /(?:для|чтобы)(?:\s+[а-яa-z0-9_-]+){0,5}\s+(?:сбор[а-яa-z0-9_-]*|собра[а-яa-z0-9_-]*|получ[а-яa-z0-9_-]*)(?:\s+[а-яa-z0-9_-]+){0,3}\s+данн[а-яa-z0-9_-]*/
    ]) && !matches(text,[
      /результат[а-яa-z0-9_-]*|ответ[а-яa-z0-9_-]*|респондент[а-яa-z0-9_-]*|выборк[а-яa-z0-9_-]*|статистик[а-яa-z0-9_-]*/
    ]);
    var tuning = matches(text,[/подгон[а-яa-z0-9_-]*/]) &&
      matches(text,[new RegExp(target)]) &&
      matches(text,[/(?:под|к)\s+(?:гипотез[а-яa-z0-9_-]*|вывод[а-яa-z0-9_-]*|ожидани[а-яa-z0-9_-]*|нужн[а-яa-z0-9_-]*|желаем[а-яa-z0-9_-]*)/]);

    if (tuning) return true;
    if (instrumentDesign) return false;
    if (coreNearTarget.test(actionableText)) return true;
    return ambiguousNearTarget.test(actionableText) && !isSafeVisualization(text);
  }

  function isDetectorEvasion(text) {
    var detector = '(?:детектор[а-яa-z0-9_-]*(?:\\s+(?:ии|ai))?|проверк[а-яa-z0-9_-]*\\s+(?:на\\s+)?(?:ии|ai)|антиплагиат[а-яa-z0-9_-]*|gptzero|copyleaks|originality\\s+ai)';
    var evasion = '(?:обо[йи][а-яa-z0-9_-]*|обман[а-яa-z0-9_-]*|скр[ыо][а-яa-z0-9_-]*|замаскиров[а-яa-z0-9_-]*|очеловеч[а-яa-z0-9_-]*|неотличим[а-яa-z0-9_-]*|пройт[а-яa-z0-9_-]*|прохожд[а-яa-z0-9_-]*)';
    var gap = '(?:\\s+[а-яa-z0-9_-]+){0,12}\\s+';
    return new RegExp('(?:' + evasion + gap + detector + '|' + detector + gap + evasion + ')').test(text) ||
      /перепиш[а-яa-z0-9_-]*(?:\s+[а-яa-z0-9_-]+){0,6}\s+чтобы(?:\s+[а-яa-z0-9_-]+){0,4}\s+(?:антиплагиат[а-яa-z0-9_-]*|детектор[а-яa-z0-9_-]*|проверк[а-яa-z0-9_-]*)(?:\s+[а-яa-z0-9_-]+){0,4}\s+не\s+(?:наш[а-яa-z0-9_-]*|обнаруж[а-яa-z0-9_-]*|распозна[а-яa-z0-9_-]*|определ[а-яa-z0-9_-]*)/.test(text) ||
      /чтобы(?:\s+[а-яa-z0-9_-]+){0,6}\s+(?:детектор[а-яa-z0-9_-]*(?:\s+(?:ии|ai))?|проверк[а-яa-z0-9_-]*\s+(?:на\s+)?(?:ии|ai))(?:\s+[а-яa-z0-9_-]+){0,5}\s+не\s+(?:распозна[а-яa-z0-9_-]*|определ[а-яa-z0-9_-]*|наш[а-яa-z0-9_-]*|увид[а-яa-z0-9_-]*|показа[а-яa-z0-9_-]*)/.test(text) ||
      /чтобы(?:\s+[а-яa-z0-9_-]+){0,7}\s+не\s+(?:распозна[а-яa-z0-9_-]*|определ[а-яa-z0-9_-]*)(?:\s+[а-яa-z0-9_-]+){0,3}\s+(?:как\s+)?(?:ии|ai|нейросет[а-яa-z0-9_-]*)/.test(text) ||
      /(?:сниз[а-яa-z0-9_-]*|убрат[а-яa-z0-9_-]*|скр[ыо][а-яa-z0-9_-]*|обнул[а-яa-z0-9_-]*)(?:\s+[а-яa-z0-9_-]+){0,3}\s+(?:процент|след[а-яa-z0-9_-]*|признак[а-яa-z0-9_-]*)\s+(?:ии|ai|нейросет[а-яa-z0-9_-]*)/.test(text) ||
      /(?:сдела[а-яa-z0-9_-]*|довест[а-яa-z0-9_-]*)(?:\s+[а-яa-z0-9_-]+){0,3}\s+процент\s+(?:ии|ai)(?:\s+[а-яa-z0-9_-]+){0,3}\s+(?:нул[а-яa-z0-9_-]*|0)/.test(text);
  }

  function isDisallowed(text) {
    return isFabricationRequest(text) || isDetectorEvasion(text) || matches(text,[
      /(?:сда[а-я-]*|защит[а-я-]*|напиш[а-я-]*|написа[а-я-]*|сдела[а-я-]*)(?:\s+[а-я0-9-]+){0,6}\s+за\s+меня/,
      /за\s+меня(?:\s+[а-я0-9-]+){0,4}\s+(?:диплом[а-я-]*|вкр|курсов[а-я-]*|диссертац[а-я-]*)/,
      /(?:напиш[а-я-]*|написа[а-я-]*|сдела[а-я-]*)(?:\s+[а-я0-9-]+){0,5}\s+(?:диплом[а-я-]*|вкр|курсов[а-я-]*|диссертац[а-я-]*)(?:\s+[а-я0-9-]+){0,3}\s+(?:полностью|целиком)/,
      /без\s+моего\s+участи[а-я-]*/,
      /(?:диплом[а-я-]*|вкр|курсов[а-я-]*|диссертац[а-я-]*)\s+(?:полностью\s+)?под\s+ключ/,
      /(?:готов[а-я-]*\s+)?(?:диплом[а-я-]*|вкр|курсов[а-я-]*)\s+для\s+сдач[а-я-]*/,
      /обо[йи][а-я-]*\s+(?:провер[а-я-]*|антиплагиат[а-я-]*|детектор[а-я-]*)/,
      /сдать\s+(?:экзамен|зачет)\s+за\s+меня/
    ]);
  }

  function quote(work,result,situation) {
    if (result === 'formatting') return 'от 5 000 ₽ · после проверки методички';
    if (result === 'defense') return 'от 6 000 ₽ · срок после проверки версии';
    if (result === 'tutoring') return 'от 3 000 ₽ · формат после уточнения вопроса';
    if (result === 'ai_editing') return 'от 2 500 ₽ · после просмотра текста и источников';
    if (result === 'diagnostic' && situation === 'topic') {
      return work === 'master' || work === 'kandidat'
        ? '5 000 ₽ · письменный разбор темы и плана'
        : '3 000 ₽ · письменный разбор темы и плана';
    }
    if (result === 'diagnostic' && work === 'kandidat' && window.SalonCalc) {
      try {
        var candidate = SalonCalc.quote(work,'hum','free','base');
        return 'от ' + candidate.lowFmt + ' ₽ · диапазон после материалов';
      } catch (e) {}
    }
    if (result === 'diagnostic') return 'от 2 500 ₽ · после просмотра материала';
    if (!work || !window.SalonCalc) {
      if (result === 'support') return 'от 2 500 ₽ · точнее после выбора работы';
      return 'от 2 500 ₽ · точнее после выбора работы';
    }
    var tier = result === 'support' ? 'vip' : result === 'editing' ? 'turn' : 'base';
    try {
      var value = SalonCalc.quote(work,'hum','free',tier);
      return 'от ' + value.lowFmt + ' ₽ · диапазон после материалов';
    } catch (e) {
      return 'после выбора работы и просмотра материалов';
    }
  }

  function routeUrl(work,situation,result) {
    var params = new URLSearchParams();
    if (work) params.set('work',work);
    if (situation) params.set('situation',situation);
    if (result) params.set('result',result);
    var service = result === 'formatting' ? 'nm'
      : result === 'defense' ? 'df'
      : result === 'tutoring' ? 'tu'
      : result === 'ai_editing' ? 'ai'
      : result === 'diagnostic' && situation === 'topic' ? 'pl'
      : result === 'diagnostic' && work === 'kandidat' ? ''
      : result === 'diagnostic' ? 'rv' : '';
    if (service) params.set('service',service);
    params.set('route','case1');
    return '/configurator.html?' + params.toString();
  }

  function setLink(node,href,label,freeCode) {
    if (!node) return;
    node.href = href;
    activeFreeCode = /^(?:topic|draft|comments|defense|formatting|ai_editing|tutoring|knowledge|integrity_help)$/.test(freeCode || '')
      ? freeCode : 'knowledge';
    var strong = node.querySelector('strong');
    if (strong) strong.textContent = label;
    else {
      node.firstChild.textContent = label + ' ';
    }
  }

  function setConfirm(items) {
    if (!slots.confirm) return;
    slots.confirm.textContent = '';
    if (!items || !items.length) {
      slots.confirm.hidden = true;
      return;
    }
    items.forEach(function (item) {
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.label;
      button.addEventListener('click',function () {
        if (typeof item.select === 'function') item.select();
        else applyRoute(item.situation,item.work || '',item.result || '',item.reason || '');
        track('case_route_confirm',item.result || item.situation || item.work || 'manual');
      });
      slots.confirm.appendChild(button);
    });
    slots.confirm.hidden = false;
  }

  function setStatus(text,tone) {
    slots.confidence.textContent = text;
    slots.confidence.classList.toggle('is-uncertain',tone === 'uncertain');
    slots.confidence.classList.toggle('is-blocked',tone === 'blocked');
  }

  function openLabel(text) {
    if (!slots.open) return;
    slots.open.innerHTML = '';
    slots.open.appendChild(document.createTextNode(text + ' '));
    var arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden','true');
    arrow.textContent = '→';
    slots.open.appendChild(arrow);
  }

  function applyRoute(situation,work,explicitResult,reason) {
    var result = explicitResult || (situation === 'topic' ? 'diagnostic'
      : situation === 'defense' ? 'defense' : 'diagnostic');
    var current = stateLabels[situation] || 'Точка старта требует уточнения';
    var workName = workLabels[work] || '';

    slots.state.textContent = workName ? current + ' · ' + workName : current;
    slots.result.textContent = situation === 'topic' && result === 'diagnostic'
      ? 'Письменная карта темы и плана'
      : resultLabels[result] || 'Первый полезный результат';

    if (result === 'support') {
      slots.why.textContent = reason || 'Вы начинаете с темы: сначала фиксируем план, источники и решения, затем собираем рабочую версию.';
      slots.need.textContent = 'Тема или задание; методичка пригодится, но начать можно без неё';
      slots.change.textContent = 'Готовый черновик или замечания руководителя';
    } else if (result === 'tutoring') {
      slots.why.textContent = reason || 'Вы запросили консультацию: сначала разбираем один конкретный вопрос и фиксируем следующий самостоятельный шаг.';
      slots.need.textContent = 'Вопрос, тема или фрагмент, на котором вы остановились';
      slots.change.textContent = 'Если понадобится письменная проверка материала, откроем её отдельным этапом';
    } else if (result === 'ai_editing') {
      slots.why.textContent = reason || 'Вы указали текст после ИИ: проверяем факты, источники, логику и ваш авторский смысл, а не маскируем происхождение текста.';
      slots.need.textContent = 'Черновик, исходный запрос к ИИ и использованные источники, если они есть';
      slots.change.textContent = 'Если содержание стабильно, следующим отдельным этапом будет оформление';
    } else if (result === 'editing') {
      slots.why.textContent = reason || 'У вас уже есть текст, поэтому сначала сохраняем сильное и определяем объём содержательных правок.';
      slots.need.textContent = 'Черновик, задание и замечания, если они есть';
      slots.change.textContent = 'Если задача только в оформлении, нужен нормоконтроль';
    } else if (result === 'formatting') {
      slots.why.textContent = reason || 'Вы упомянули оформление: этот этап уместен после стабилизации содержания и по актуальной методичке.';
      slots.need.textContent = 'Стабильная версия и методичка кафедры';
      slots.change.textContent = 'Новые содержательные замечания вернут дело к проверке';
    } else if (result === 'defense') {
      slots.why.textContent = reason || 'Вы упомянули близкую защиту: сначала проверяем выполнимость и риски готовой версии.';
      slots.need.textContent = 'Текущая версия, дата защиты и регламент выступления';
      slots.change.textContent = 'Критические замечания к содержанию';
    } else {
      slots.why.textContent = reason || (situation === 'topic'
        ? 'На старте сначала проверяем масштаб темы и логику плана — полный проект пока предлагать рано.'
        : situation === 'comments'
          ? 'Вы упомянули замечания: сначала переводим их в приоритетную карту, а не продаём правки вслепую.'
          : 'Черновик уже есть: диагностика покажет, какой объём помощи действительно нужен.');
      slots.need.textContent = situation === 'topic'
        ? 'Тема или задание; методичка пригодится, но начать можно без неё'
        : situation === 'comments'
          ? 'Текст, замечания руководителя и методичка'
          : 'Черновик, задание и требования';
      slots.change.textContent = situation === 'topic'
        ? 'Готовый черновик или уже согласованный план'
        : 'Если проблема только техническая, перейдём к оформлению';
    }

    slots.price.textContent = quote(work,result,situation);
    slots.open.href = routeUrl(work,situation,result);
    openLabel('Открыть предварительный маршрут');
    var free = freeRoutes[result] || freeRoutes[situation] || freeRoutes.draft;
    setLink(slots.free,free[0],free[1],free[2]);
    setStatus('Предварительно подходит','clear');
    setConfirm([]);
    track('case_route_ready',[situation,work || 'no_work',result].join('_'));
  }

  function showUncertain(message,question,items,variant) {
    slots.state.textContent = message;
    slots.result.textContent = question;
    slots.why.textContent = 'Одной фразы пока недостаточно для честной рекомендации. Мы не будем угадывать услугу или цену.';
    slots.need.textContent = 'Один ответ ниже — без контакта и без передачи исходной фразы';
    slots.price.textContent = 'появится после подтверждения точки старта';
    slots.change.textContent = 'Ваш выбор текущего состояния';
    slots.open.href = '/configurator.html';
    openLabel('Уточнить за два шага');
    setLink(slots.free,'/knowledge.html','Выбрать материал самостоятельно','knowledge');
    setStatus('Нужно уточнить','uncertain');
    setConfirm(items);
    track('case_route_uncertain',variant || 'unknown');
  }

  function showResultConflict(works,situations,results,deadlineOnly) {
    var work = works[0] || '';
    var state = situations.length === 1 ? stateLabels[situations[0]] : 'В запросе несколько результатов';
    slots.state.textContent = work ? state + ' · ' + workLabels[work] : state;
    slots.result.textContent = 'Что важнее первым?';
    slots.why.textContent = 'Это разные результаты, этапы и цены. Выберите первый приоритет — так маршрут не скроет одну задачу за другой.';
    slots.need.textContent = 'Один выбор ниже — исходная фраза останется только в этом поле';
    slots.price.textContent = 'появится после выбора первого результата';
    slots.change.textContent = 'Оставшуюся задачу можно открыть следующим отдельным этапом';
    slots.open.href = '/configurator.html';
    openLabel('Уточнить за два шага');
    setLink(slots.free,'/knowledge.html','Сначала свериться с материалами','knowledge');
    setStatus('Нужно выбрать приоритет','uncertain');
    setConfirm(results.map(function (result) {
      return {
        label:resultChoiceLabels[result] || resultLabels[result],
        result:result,
        select:function () {
          resolveRoute(works,situations,result,deadlineOnly);
        }
      };
    }));
    track('case_route_uncertain','multiple_results');
  }

  function showBlocked() {
    slots.state.textContent = 'Запрос выходит за границы помощи';
    slots.result.textContent = 'Можно разобрать, отредактировать или подготовить ваш материал';
    slots.why.textContent = 'Мы не подменяем автора, не выдумываем данные и не помогаем обходить проверку.';
    slots.need.textContent = 'Ваш собственный материал или вопрос, который нужно разобрать';
    slots.price.textContent = 'сначала уточним допустимый формат';
    slots.change.textContent = 'Совместная работа с вашим содержательным участием';
    slots.open.href = '/academic-integrity.html';
    openLabel('Посмотреть границы помощи');
    setLink(slots.free,'/priyomnaya.html','Обсудить допустимую альтернативу','integrity_help');
    setStatus('Такой запрос не принимается','blocked');
    setConfirm([]);
    track('case_route_blocked','integrity');
  }

  function resolveRoute(works,situations,explicitResult,deadlineOnly) {
    if (situations.length > 1) {
      showUncertain('Вижу несколько точек старта','Что важнее проверить первым?',
        situations.map(function (situation) {
          return { label:stateLabels[situation], situation:situation, work:works[0] || '', result:explicitResult };
        }),'multiple_states');
      return;
    }
    if (!situations.length || deadlineOnly) {
      var prefix = works.length ? 'Определена работа: ' + workLabels[works[0]] : 'Ситуация пока не определена';
      showUncertain(prefix,'Что уже есть сейчас?',[
        { label:'Только тема', situation:'topic', work:works[0] || '', result:explicitResult },
        { label:'Есть черновик', situation:'draft', work:works[0] || '', result:explicitResult },
        { label:'Есть замечания', situation:'comments', work:works[0] || '', result:explicitResult },
        { label:'Скоро защита', situation:'defense', work:works[0] || '', result:explicitResult }
      ],works.length ? 'work_only' : 'no_state');
      return;
    }

    if (situations[0] === 'topic' &&
        ['editing','ai_editing','formatting','defense'].indexOf(explicitResult) >= 0) {
      showUncertain('Для этого результата нужен готовый материал','Есть ли уже рабочая версия текста?',[
        { label:'Нет, пока тема', situation:'topic', work:works[0] || '', result:'diagnostic' },
        {
          label:'Да, версия есть',
          situation:explicitResult === 'defense' ? 'defense' : 'draft',
          work:works[0] || '',
          result:explicitResult
        }
      ],explicitResult + '_without_draft');
      return;
    }

    applyRoute(situations[0],works[0] || '',explicitResult,'');
  }

  function classify(raw) {
    var text = normalize(raw);
    if (!text || text.length < 9 || /^(?:помогите|нужна помощь|все плохо|срочно)$/u.test(text)) {
      showUncertain('Пока нет точки старта','Что у вас уже есть?',[
        { label:'Только тема', situation:'topic' },
        { label:'Есть черновик', situation:'draft' },
        { label:'Есть замечания', situation:'comments' },
        { label:'Скоро защита', situation:'defense' }
      ],'too_short');
      return;
    }
    if (isDisallowed(text)) {
      showBlocked();
      return;
    }

    var works = findWorks(text);
    var situations = findSituations(text);
    var results = findResults(text);
    var deadlineOnly = situations.length === 0 && matches(text,[/(?:завтра|послезавтра|через\s+\d+|срочно|дедлайн)/]);

    if (works.length > 1) {
      showUncertain('Упомянуто несколько работ','С какой открыть отдельное дело?',[], 'multiple_works');
      return;
    }
    if (results.length > 1) {
      showResultConflict(works,situations,results,deadlineOnly);
      return;
    }
    resolveRoute(works,situations,results[0] || '',deadlineOnly);
  }

  function revealRoute() {
    if (!routeCard || !window.matchMedia('(max-width:920px)').matches) return;
    routeCard.setAttribute('tabindex','-1');
    try {
      routeCard.focus({ preventScroll:true });
    } catch (e) {
      routeCard.focus();
    }
    try {
      routeCard.scrollIntoView({
        behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block:'start'
      });
    } catch (e) {
      routeCard.scrollIntoView();
    }
  }

  input.addEventListener('focus',function () {
    if (prompted) return;
    prompted = true;
    track('case_prompt_start','focus');
  });

  form.addEventListener('submit',function (event) {
    event.preventDefault();
    classify(input.value);
    revealRoute();
  });

  document.querySelectorAll('[data-case-preset]').forEach(function (button) {
    button.addEventListener('click',function () {
      document.querySelectorAll('[data-case-preset]').forEach(function (item) {
        item.setAttribute('aria-pressed',String(item === button));
      });
      input.value = button.getAttribute('data-case-preset') || '';
      classify(input.value);
      revealRoute();
    });
  });

  if (slots.open) {
    slots.open.addEventListener('click',function () {
      track('case_route_open',new URL(slots.open.href,location.href).searchParams.get('result') || 'clarify');
    });
  }
  if (slots.free) {
    slots.free.addEventListener('click',function () {
      track('case_free_route_open',activeFreeCode);
    });
  }

  var stageButtons = [].slice.call(document.querySelectorAll('[data-case-stage]'));
  var stagePanels = [].slice.call(document.querySelectorAll('[data-stage-panel]'));
  function activateStage(index,focus) {
    index = Math.max(0,Math.min(stageButtons.length - 1,index));
    stageButtons.forEach(function (button,buttonIndex) {
      var selected = buttonIndex === index;
      button.setAttribute('aria-selected',String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    stagePanels.forEach(function (panel,panelIndex) {
      var selected = panelIndex === index;
      panel.classList.toggle('is-active',selected);
      panel.setAttribute('aria-hidden',String(!selected));
    });
    if (focus) stageButtons[index].focus({ preventScroll:true });
    if (focus) {
      try {
        stageButtons[index].scrollIntoView({
          behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          block:'nearest',
          inline:'center'
        });
      } catch (e) {}
    }
    track('case_ecosystem_stage',String(index + 1));
  }
  stageButtons.forEach(function (button,index) {
    button.addEventListener('click',function () { activateStage(index,false); });
    button.addEventListener('keydown',function (event) {
      var next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % stageButtons.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + stageButtons.length) % stageButtons.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = stageButtons.length - 1;
      else return;
      event.preventDefault();
      activateStage(next,true);
    });
  });
  if (stageButtons.length) activateStage(0,false);
}());
