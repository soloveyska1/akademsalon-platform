/* Главная «Дело исследования»: локальный объяснимый маршрут и последовательность стадий. */
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
    diagnostic:'Полный разбор материала',
    editing:'Редактура вашего текста',
    ai_editing:'Редактура текста после ИИ',
    formatting:'Оформление по методичке',
    defense:'Подготовка к защите',
    support:'Помощь от темы до рабочей версии',
    tutoring:'Разбор вопроса с редактором'
  };
  var resultChoiceLabels = {
    diagnostic:'Сначала разобрать материал',
    editing:'Сначала отредактировать текст',
    ai_editing:'Сначала проверить текст после ИИ',
    formatting:'Сначала привести к требованиям',
    defense:'Сначала подготовиться к защите',
    support:'Сначала начать работу над текстом',
    tutoring:'Сначала разобрать вопрос'
  };
  var freeRoutes = {
    topic:['/audit-temy-vkr.html','Проверить тему','topic'],
    draft:['/check.html','Проверить текст','draft'],
    comments:['/dosie-nauchruka.html','Разобрать замечания','comments'],
    defense:['/guide-rech-na-zashchitu.html','Проверить речь по чек-листу','defense'],
    formatting:['/guide-normocontrol.html','Сверить оформление','formatting'],
    ai_editing:['/guide-antiplagiat-ai.html','Проверить текст после ИИ','ai_editing'],
    tutoring:['/knowledge.html','Выбрать материал для разбора','tutoring']
  };
  var prompted = false;
  var routeCard = document.querySelector('.case-route');
  var heroLayout = document.querySelector('.case-hero__inner');
  var scopeDeck = document.querySelector('[data-case-scope-deck]');
  var scopeDrawer = document.querySelector('[data-case-scope-drawer]');
  var scopeOpen = document.querySelector('[data-case-scope-open]');
  var scopeAlternative = document.querySelector('[data-case-scope-alternative]');
  var scopeReopen = document.querySelector('[data-case-scope-reopen]');
  var resultEdit = document.querySelector('[data-case-result-edit]');
  var scopeClose = document.querySelector('[data-case-scope-close]');
  var scopeBackdrop = document.querySelector('[data-case-scope-backdrop]');
  var scopeReturnTarget = scopeOpen;
  var resultEditScrollY = 0;
  var promptToggle = document.querySelector('[data-case-prompt-toggle]');
  var promptBody = document.querySelector('[data-case-prompt-body]');
  var homeStart = document.querySelector('[data-home-start]');
  var scopeFrame = document.querySelector('[data-case-scope-frame]');
  var scopeTitle = document.querySelector('[data-case-scope-title]');
  var scopeCopy = document.querySelector('[data-case-scope-copy]');
  var scopeNumber = document.querySelector('[data-case-scope-number]');
  var scopeProgress = [].slice.call(document.querySelectorAll('.case-scope-trigger__progress i'));
  var scopeSlides = [].slice.call(document.querySelectorAll('[data-case-drawer-choice="true"]')).map(function (button) {
    return {
      number:(button.querySelector(':scope > span') || {}).textContent || '',
      title:(button.querySelector('strong') || {}).textContent || '',
      copy:(button.querySelector('small') || {}).textContent || ''
    };
  });
  var scopeSlideIndex = 0;
  var scopeTimer = 0;
  var scopeTouchTimer = 0;
  var scopePaused = false;
  var scopeInView = true;
  var routeWritingTimer = 0;
  var routeWritingFlip = false;
  var activeFreeCode = 'knowledge';

  if (routeCard) routeCard.setAttribute('aria-hidden','true');

  function setPromptExpanded(expanded,focusField) {
    if (!promptToggle || !promptBody) return;
    form.setAttribute('data-prompt-expanded',String(expanded));
    document.documentElement.classList.toggle('home-prompt-open',expanded);
    promptToggle.setAttribute('aria-expanded',String(expanded));
    promptBody.setAttribute('aria-hidden',String(!expanded));
    if (expanded) {
      promptBody.removeAttribute('inert');
      if (focusField) input.focus({ preventScroll:true });
    } else {
      promptBody.setAttribute('inert','');
    }
  }

  if (promptToggle && promptBody) {
    setPromptExpanded(false,false);
    promptToggle.addEventListener('click',function () {
      var expanded = promptToggle.getAttribute('aria-expanded') === 'true';
      setPromptExpanded(!expanded,!expanded);
    });
    form.addEventListener('keydown',function (event) {
      if (event.key === 'Escape' && promptToggle.getAttribute('aria-expanded') === 'true' && !input.value.trim()) {
        event.preventDefault();
        setPromptExpanded(false,false);
        promptToggle.focus({ preventScroll:true });
      }
    });
  }

  function scopeMotionAllowed() {
    return !(document.hidden ||
      document.documentElement.hasAttribute('data-calm') ||
      document.documentElement.getAttribute('data-motion') === 'off' ||
      (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches));
  }

  function paintScopeSlide(index,animate) {
    if (!scopeSlides.length || !scopeTitle || !scopeCopy || !scopeNumber) return;
    scopeSlideIndex = (index + scopeSlides.length) % scopeSlides.length;
    var slide = scopeSlides[scopeSlideIndex];
    var commit = function () {
      if (slide.number === '04') {
        scopeTitle.setAttribute('aria-label','До защиты мало времени');
        scopeTitle.innerHTML =
          '<span class="case-scope-trigger__easter" aria-hidden="true">' +
          '<s>Зима</s><em>Защита</em></span>' +
          '<span aria-hidden="true">уже<br>близко</span>';
      } else {
        scopeTitle.removeAttribute('aria-label');
        scopeTitle.textContent = slide.title;
      }
      scopeCopy.textContent = slide.copy;
      scopeNumber.textContent = slide.number;
      scopeProgress.forEach(function (item,itemIndex) {
        item.classList.toggle('is-active',itemIndex === scopeSlideIndex);
      });
      if (scopeFrame) scopeFrame.classList.remove('is-changing');
    };
    if (animate && scopeFrame) {
      scopeFrame.classList.add('is-changing');
      window.setTimeout(commit,170);
    } else {
      commit();
    }
  }

  function stopScopeRotation() {
    if (scopeTimer) window.clearTimeout(scopeTimer);
    scopeTimer = 0;
  }

  function scheduleScopeRotation() {
    stopScopeRotation();
    if (!scopeOpen || !scopeOpen.hasAttribute('data-case-scope-rotate') || scopePaused || !scopeInView || !scopeMotionAllowed() || scopeSlides.length < 2) return;
    scopeTimer = window.setTimeout(function () {
      paintScopeSlide(scopeSlideIndex + 1,true);
      scheduleScopeRotation();
    },4800);
  }

  if (scopeOpen && scopeOpen.hasAttribute('data-case-scope-rotate') && scopeSlides.length) {
    paintScopeSlide(0,false);
    scopeOpen.addEventListener('pointerenter',function () {
      scopePaused = true;
      stopScopeRotation();
    });
    scopeOpen.addEventListener('pointerleave',function () {
      scopePaused = false;
      scheduleScopeRotation();
    });
    scopeOpen.addEventListener('focus',function () {
      scopePaused = true;
      stopScopeRotation();
    });
    scopeOpen.addEventListener('blur',function () {
      scopePaused = false;
      scheduleScopeRotation();
    });
    scopeOpen.addEventListener('pointerdown',function () {
      scopePaused = true;
      stopScopeRotation();
      if (scopeTouchTimer) window.clearTimeout(scopeTouchTimer);
      scopeTouchTimer = window.setTimeout(function () {
        scopePaused = false;
        scheduleScopeRotation();
      },9000);
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        scopeInView = Boolean(entries[0] && entries[0].intersectionRatio >= .6);
        scheduleScopeRotation();
      },{ threshold:[0,.6,1] }).observe(scopeOpen);
    }
    document.addEventListener('visibilitychange',scheduleScopeRotation);
    scheduleScopeRotation();
  }

  function setScopeDrawer(open,restoreFocus) {
    if (!scopeDrawer || !scopeOpen || !scopeBackdrop) return;
    document.documentElement.classList.toggle('case-scope-drawer-open',open);
    scopeOpen.setAttribute('aria-expanded',String(open));
    if (scopeAlternative) scopeAlternative.setAttribute('aria-expanded',String(open));
    if (scopeReopen) scopeReopen.setAttribute('aria-expanded',String(open));
    if (resultEdit) resultEdit.setAttribute('aria-expanded',String(open));
    scopeDrawer.setAttribute('aria-hidden',String(!open));
    scopeBackdrop.setAttribute('aria-hidden',String(!open));
    if (open) {
      stopScopeRotation();
      scopeDrawer.removeAttribute('inert');
      if (scopeClose) scopeClose.focus({ preventScroll:true });
    } else {
      scopeDrawer.setAttribute('inert','');
      if (restoreFocus && scopeReturnTarget) scopeReturnTarget.focus({ preventScroll:true });
      scheduleScopeRotation();
    }
  }

  function closeScopeDrawer(restoreFocus) {
    setScopeDrawer(false,restoreFocus !== false);
  }

  if (scopeDrawer && scopeOpen && scopeClose && scopeBackdrop) {
    scopeOpen.addEventListener('click',function () {
      scopeReturnTarget = scopeOpen;
      setScopeDrawer(true,false);
    });
    if (scopeAlternative) {
      scopeAlternative.addEventListener('click',function () {
        scopeReturnTarget = scopeAlternative;
        setScopeDrawer(true,false);
      });
    }
    if (scopeReopen) {
      scopeReopen.addEventListener('click',function () {
        scopeReturnTarget = scopeReopen;
        setScopeDrawer(true,false);
      });
    }
    if (resultEdit) {
      resultEdit.addEventListener('click',function () {
        scopeReturnTarget = resultEdit;
        resultEditScrollY = window.scrollY || window.pageYOffset || 0;
        setScopeDrawer(true,false);
      });
    }
    scopeClose.addEventListener('click',function () {
      closeScopeDrawer(true);
    });
    scopeBackdrop.addEventListener('click',function () {
      closeScopeDrawer(true);
    });
    document.addEventListener('keydown',function (event) {
      if (event.key === 'Escape' && document.documentElement.classList.contains('case-scope-drawer-open')) {
        event.preventDefault();
        closeScopeDrawer(true);
      }
    });
    scopeDrawer.addEventListener('keydown',function (event) {
      if (event.key !== 'Tab') return;
      var focusable = scopeDrawer.querySelectorAll('button:not([disabled]),a[href]');
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  if (homeStart) {
    homeStart.addEventListener('click',function (event) {
      /* Новая главная ведёт к видимому живому досье обычным якорем. Старый
         обработчик нужен только прежнему текстовому сценарию. */
      if (homeStart.getAttribute('href') === '#deskStart') return;
      event.preventDefault();
      setPromptExpanded(true,false);
      try {
        form.scrollIntoView({
          behavior:scopeMotionAllowed() ? 'smooth' : 'auto',
          block:'center'
        });
      } catch (e) {
        form.scrollIntoView();
      }
      window.setTimeout(function () {
        input.focus({ preventScroll:true });
      },scopeMotionAllowed() ? 420 : 0);
    });
  }

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
    var visible = tone === 'uncertain' || tone === 'blocked';
    slots.confidence.hidden = !visible;
    slots.confidence.textContent = visible ? text : '';
    slots.confidence.classList.toggle('is-uncertain',tone === 'uncertain');
    slots.confidence.classList.toggle('is-blocked',tone === 'blocked');
  }

  function animateRouteCard() {
    if (!routeCard || !routeCard.classList ||
        typeof routeCard.classList.add !== 'function' ||
        typeof routeCard.classList.remove !== 'function' ||
        typeof window.setTimeout !== 'function') return;
    if ((window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ||
        document.documentElement.hasAttribute('data-calm')) return;
    routeCard.classList.remove('is-writing-a','is-writing-b');
    routeWritingFlip = !routeWritingFlip;
    routeCard.classList.add(routeWritingFlip ? 'is-writing-a' : 'is-writing-b');
    if (routeWritingTimer && typeof window.clearTimeout === 'function') {
      window.clearTimeout(routeWritingTimer);
    }
    routeWritingTimer = window.setTimeout(function () {
      routeCard.classList.remove('is-writing-a','is-writing-b');
      routeWritingTimer = 0;
    },1450);
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
    slots.result.textContent = result === 'diagnostic'
      ? situation === 'topic'
        ? 'Полный разбор темы и плана'
        : situation === 'comments'
          ? 'Полный разбор замечаний'
          : 'Полный разбор черновика'
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
      slots.why.textContent = reason || 'Сначала сверим готовый текст с актуальной методичкой и покажем все несоответствия.';
      slots.need.textContent = 'Стабильная версия и методичка кафедры';
      slots.change.textContent = 'Новые содержательные замечания вернут дело к проверке';
    } else if (result === 'defense') {
      slots.why.textContent = reason || 'Сначала проверим готовность текста, сроки и риски перед защитой.';
      slots.need.textContent = 'Текущая версия, дата защиты и регламент выступления';
      slots.change.textContent = 'Критические замечания к содержанию';
    } else {
      slots.why.textContent = reason || (situation === 'topic'
        ? 'Проверим масштаб темы и логику плана. После этого будет понятно, какой объём помощи действительно нужен.'
        : situation === 'comments'
          ? 'Разберём каждое замечание, определим, что исправить в первую очередь, и покажем объём работы.'
          : 'Разберём черновик: что уже работает, что требует исправления и в каком порядке это лучше делать.');
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
    openLabel('Узнать состав помощи и стоимость');
    var free = freeRoutes[result] || freeRoutes[situation] || freeRoutes.draft;
    setLink(slots.free,free[0],free[1],free[2]);
    setStatus('','clear');
    setConfirm([]);
    track('case_route_ready',[situation,work || 'no_work',result].join('_'));
    animateRouteCard();
  }

  function showUncertain(message,question,items,variant) {
    slots.state.textContent = message;
    slots.result.textContent = question;
    slots.why.textContent = 'По этой фразе пока нельзя точно выбрать первый шаг и назвать цену. Уточним только главное.';
    slots.need.textContent = 'Один ответ ниже — контакт пока не нужен';
    slots.price.textContent = 'появится после одного уточнения';
    slots.change.textContent = 'Ваш выбор текущего состояния';
    slots.open.href = '/configurator.html';
    openLabel('Уточнить за два шага');
    setLink(slots.free,'/knowledge.html','Выбрать подходящий материал','knowledge');
    setStatus('Нужно уточнить','uncertain');
    setConfirm(items);
    track('case_route_uncertain',variant || 'unknown');
    animateRouteCard();
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
    animateRouteCard();
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
    animateRouteCard();
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
        { label:'Пока есть только тема', situation:'topic', work:works[0] || '', result:explicitResult },
        { label:'Черновик уже есть', situation:'draft', work:works[0] || '', result:explicitResult },
        { label:'Пришли замечания', situation:'comments', work:works[0] || '', result:explicitResult },
        { label:'До защиты мало времени', situation:'defense', work:works[0] || '', result:explicitResult }
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
        { label:'Пока есть только тема', situation:'topic' },
        { label:'Черновик уже есть', situation:'draft' },
        { label:'Пришли замечания', situation:'comments' },
        { label:'До защиты мало времени', situation:'defense' }
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
    if (situations.length === 1) syncResultStage(situations[0]);
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
    if (!routeCard) return;
    routeCard.setAttribute('data-route-visible','true');
    routeCard.setAttribute('aria-hidden','false');
    if (heroLayout) heroLayout.setAttribute('data-route-visible','true');
    if (window.matchMedia('(max-width:920px)').matches) {
      routeCard.setAttribute('tabindex','-1');
      try {
        routeCard.focus({ preventScroll:true });
      } catch (e) {
        routeCard.focus();
      }
    }
    try {
      routeCard.scrollIntoView({
        behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block:window.matchMedia('(max-width:920px)').matches ? 'start' : 'center'
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
      var presetValue = button.getAttribute('data-case-preset') || '';
      var fromDrawer = button.getAttribute('data-case-drawer-choice') === 'true';
      var updateResultInPlace = fromDrawer && scopeReturnTarget === resultEdit;
      document.querySelectorAll('[data-case-preset]').forEach(function (item) {
        item.setAttribute('aria-pressed',String(item.getAttribute('data-case-preset') === presetValue));
      });
      document.querySelectorAll('[data-case-hero-choice]').forEach(function (item) {
        var selected = item === button || item.getAttribute('data-case-preset') === presetValue;
        if (selected) item.setAttribute('aria-current','step');
        else item.removeAttribute('aria-current');
      });
      if (scopeDeck) scopeDeck.setAttribute('data-scope-index',button.getAttribute('data-scope-index') || '01');
      input.value = presetValue;
      if (!updateResultInPlace) setPromptExpanded(true,false);
      classify(input.value);
      closeScopeDrawer(false);
      if (updateResultInPlace) {
        window.requestAnimationFrame(function () {
          window.scrollTo(0,resultEditScrollY);
          var activeTitle = document.querySelector('.case-stage-panel.is-active h3');
          if (activeTitle) {
            activeTitle.setAttribute('tabindex','-1');
            activeTitle.focus({ preventScroll:true });
          }
        });
        track('case_result_situation_changed',presetValue);
        return;
      }
      revealRoute();
      if (fromDrawer && routeCard && !window.matchMedia('(max-width:920px)').matches) {
        routeCard.setAttribute('tabindex','-1');
        routeCard.focus({ preventScroll:true });
      }
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
  var resultState = document.querySelector('[data-case-result-state]');
  var resultNumber = document.querySelector('[data-case-result-number]');
  var resultStates = [
    'Пока есть только тема или задание',
    'Черновик уже есть',
    'Пришли замечания руководителя',
    'До защиты мало времени'
  ];
  function syncResultStage(situation) {
    var stageBySituation = { topic:0, draft:1, comments:2, defense:3 };
    if (!Object.prototype.hasOwnProperty.call(stageBySituation,situation)) return;
    activateStage(stageBySituation[situation],false);
  }
  function activateStage(index,focus) {
    index = Math.max(0,Math.min(stagePanels.length - 1,index));
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
    if (resultState) resultState.textContent = resultStates[index] || resultStates[0];
    if (resultNumber) resultNumber.textContent = index < 9 ? '0' + (index + 1) : String(index + 1);
    if (focus && stageButtons[index]) stageButtons[index].focus({ preventScroll:true });
    if (focus && stageButtons[index]) {
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
  if (stagePanels.length) activateStage(0,false);

  var processSteps = [].slice.call(document.querySelectorAll('[data-case-process-step]'));
  var fileSteps = [].slice.call(document.querySelectorAll('[data-case-file-step]'));
  var fileKicker = document.querySelector('[data-case-file-kicker]');
  var fileTitle = document.querySelector('[data-case-file-title]');
  var fileCopy = document.querySelector('[data-case-file-copy]');
  var fileCurrent = document.querySelector('.case-file__current');
  var mobileProcessNote = document.querySelector('[data-case-process-mobile-note]');
  var mobileProcessKicker = document.querySelector('[data-case-process-mobile-kicker]');
  var mobileProcessTitle = document.querySelector('[data-case-process-mobile-title]');
  var mobileProcessCopy = document.querySelector('[data-case-process-mobile-copy]');
  var committedProcessStep = '1';
  var noteSwapTimer = 0;
  var processNotes = {
    '1':['01 · Материалы','Тема, методичка и замечания руководителя','Запишем, с какой версией текста и какими требованиями работаем.'],
    '2':['02 · Результат','Разбор замечаний и порядок правок','Укажем, какой файл или встреча будут готовы по итогу.'],
    '3':['03 · Во время работы','Правки — в отдельной версии с комментариями','Сохраним ваш исходный текст и объясним важные изменения.'],
    '4':['04 · Проверка','Сверим готовую работу по согласованному списку','Если не выполнен согласованный пункт, исправим его до завершения. Продолжение оформляется отдельно.']
  };
  function linkProcessStep(step) {
    processSteps.forEach(function (button) {
      var selected = button.getAttribute('data-case-process-step') === step;
      button.classList.toggle('is-linked',selected);
      button.setAttribute('aria-selected',String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    fileSteps.forEach(function (row) {
      row.classList.toggle('is-current',row.getAttribute('data-case-file-step') === step);
    });
    var note = processNotes[step] || processNotes['1'];
    var writeNote = function () {
      if (fileKicker) fileKicker.textContent = note[0];
      if (fileTitle) fileTitle.textContent = note[1];
      if (fileCopy) fileCopy.textContent = note[2];
      if (mobileProcessKicker) mobileProcessKicker.textContent = note[0];
      if (mobileProcessTitle) mobileProcessTitle.textContent = note[1];
      if (mobileProcessCopy) mobileProcessCopy.textContent = note[2];
    };
    var selectedButton = processSteps.filter(function (button) {
      return button.getAttribute('data-case-process-step') === step;
    })[0];
    if (fileCurrent && selectedButton) {
      fileCurrent.setAttribute('aria-labelledby',selectedButton.id);
    }
    if (mobileProcessNote && selectedButton && selectedButton.parentNode) {
      selectedButton.parentNode.appendChild(mobileProcessNote);
    }
    var reduceMotion = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.clearTimeout(noteSwapTimer);
    if (!fileCurrent || reduceMotion || !fileTitle || fileTitle.textContent === note[1]) {
      writeNote();
      return;
    }
    fileCurrent.classList.add('is-changing');
    noteSwapTimer = window.setTimeout(function () {
      writeNote();
      fileCurrent.classList.remove('is-changing');
    },90);
  }
  processSteps.forEach(function (button,index) {
    var step = button.getAttribute('data-case-process-step') || '1';
    button.addEventListener('click',function () {
      committedProcessStep = step;
      linkProcessStep(step);
    });
    button.addEventListener('keydown',function (event) {
      var next = index;
      if (event.key === 'ArrowDown') next = (index + 1) % processSteps.length;
      else if (event.key === 'ArrowUp') next = (index - 1 + processSteps.length) % processSteps.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = processSteps.length - 1;
      else return;
      event.preventDefault();
      committedProcessStep = processSteps[next].getAttribute('data-case-process-step') || '1';
      linkProcessStep(committedProcessStep);
      processSteps[next].focus({ preventScroll:true });
    });
  });
  if (processSteps.length) linkProcessStep('1');

  function keepOneOpen(selector) {
    var items = [].slice.call(document.querySelectorAll(selector));
    items.forEach(function (item) {
      item.addEventListener('toggle',function () {
        if (!item.open) return;
        items.forEach(function (other) {
          if (other !== item) other.open = false;
        });
      });
    });
  }
  keepOneOpen('.case-faq .faq-item');
  keepOneOpen('.case-file__notes .case-terms__note');

  var storyReveals = [].slice.call(document.querySelectorAll('[data-story-reveal]'));
  if ('IntersectionObserver' in window &&
      !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    var storyObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        storyObserver.unobserve(entry.target);
      });
    },{ threshold:0.18 });
    storyReveals.forEach(function (node) { storyObserver.observe(node); });
  } else {
    storyReveals.forEach(function (node) { node.classList.add('is-in'); });
  }
}());
