(function () {
  'use strict';

  var GUIDE_DATA = [
    ['guide-temy-vkr','Темы ВКР: критерии выбора и примеры формулировок','ВКР · старт','10 минут','Критерии проверки темы: исследовательский вопрос, доступные данные, объём и срок.'],
    ['guide-obekt-predmet-cel-zadachi','Объект, предмет, цель и задачи исследования','Методология','7 минут','Как связать объект, предмет, цель и задачи с будущей структурой работы.'],
    ['guide-vkr-struktura','Введение к ВКР: структура и связь с главами','ВКР · введение','9 минут','Состав введения и проверка связи между задачами, главами и выводами.'],
    ['guide-vvedenie-kursovoy','Введение курсовой работы: структура и пример','Курсовая · введение','7 минут','Актуальность, объект, предмет, цель, задачи и методы — в рабочей последовательности.'],
    ['guide-kursovaya-za-nedelyu','Как спланировать курсовую на семь дней','Курсовая · маршрут','9 минут','План на семь дней для ситуации, когда тема определена, а источники и данные доступны.'],
    ['guide-prakticheskaya-chast-kursovoy','Практическая часть курсовой: данные и анализ','Курсовая · исследование','8 минут','Как выбрать данные и метод, показать результаты и сформулировать выводы.'],
    ['guide-zaklyuchenie-kursovoy','Заключение курсовой работы: структура и пример','Курсовая · выводы','6 минут','Четыре смысловых блока и связь между задачами, результатами и выводами.'],
    ['guide-zaklyuchenie-vkr','Заключение курсовой и ВКР: структура и связь с задачами','ВКР · выводы','6 минут','Как собрать заключение из результатов готовых глав и не добавлять новые данные.'],
    ['guide-spisok-literatury','Список литературы по ГОСТ: порядок и примеры','Источники · ГОСТ','8 минут','Порядок списка и примеры описания книг, статей, электронных ресурсов и нормативных актов.'],
    ['guide-normocontrol','Нормоконтроль: что проверить перед сдачей','Оформление · проверка','8 минут','Параметры страницы, нумерация, таблицы, рисунки, ссылки и список источников.'],
    ['guide-titulnyj-list','Титульный лист курсовой и ВКР','Оформление · начало','6 минут','Порядок блоков и реквизиты, которые нужно сверить с образцом кафедры.'],
    ['guide-prilozheniya-po-gost','Приложения в курсовой и ВКР: оформление и ссылки','Оформление · приложения','6 минут','Обозначения, ссылки из текста и оформление таблиц, анкет и документов.'],
    ['guide-antiplagiat-ai','Антиплагиат и детекторы ИИ: что именно они проверяют','Проверки · текст','10 минут','Разница между поиском заимствований и детекторами ИИ, ограничения отчётов и содержательная переработка текста.'],
    ['guide-otchet-po-praktike','Отчёт по практике: структура и документы','Практика · отчёт','9 минут','Как согласовать отчёт, дневник, характеристику и приложения по датам и задачам.'],
    ['guide-dnevnik-praktiki','Дневник практики: структура и примеры записей','Практика · дневник','7 минут','Как фиксировать реальные задачи по дням и сверять записи с отчётом.'],
    ['guide-harakteristika-s-praktiki','Характеристика с места практики: структура документа','Практика · документ','6 минут','Какие факты подготовить для руководителя от организации и как устроен документ.'],
    ['guide-zashchita-diploma','Подготовка к защите ВКР','Защита · маршрут','12 минут','Доклад, презентация, раздаточный материал, репетиция и ответы на вопросы.'],
    ['guide-prezentaciya-k-zashchite','Презентация к защите ВКР','Защита · слайды','6 минут','Структура слайдов и правила читаемости, которые поддерживают доклад.'],
    ['guide-rech-na-zashchitu','Речь на защите: структура доклада','Защита · доклад','7 минут','Распределение времени, смысловые блоки доклада и переходы между слайдами.'],
    ['guide-otzyv-rukovoditelya-vkr','Отзыв руководителя на ВКР','Защита · документы','6 минут','Какие сведения подготовить руководителю и чем отзыв отличается от рецензии.'],
    ['guide-recenziya-na-vkr','Рецензия на ВКР: структура документа','Защита · документы','7 минут','Кто может быть рецензентом, какие сведения нужны и как подготовить ответы на замечания.'],
    ['guide-apellyaciya','Апелляция на оценку в вузе: основания и порядок подачи','Права · процедура','8 минут','Как найти локальное положение, проверить основания, сроки и порядок подачи.'],
    ['guide-rinc-statya','Статья для журнала РИНЦ: подготовка и подача','Наука · публикации','9 минут','Выбор издания, подготовка рукописи, подача и проверка публикации в eLibrary.'],
    ['guide-skolko-stoit-kursovaya','Из чего складывается стоимость редактуры курсовой','Курсовая · стоимость','8 минут','Какие редакторские задачи входят в смету и что меняет срок и стоимость.'],
    ['guide-skolko-stoit-diplomnaya','Из чего складывается стоимость редактуры ВКР','ВКР · стоимость','8 минут','Как разбить работу на этапы, сравнить предложения и согласовать дополнительные расходы.']
  ].map(function (item) {
    return { slug:item[0], title:item[1], category:item[2], reading:item[3], summary:item[4] };
  });

  var LEGAL_DATA = [
    ['privacy','Политика обработки персональных данных','Какие данные получает сервис, для чего они нужны и как воспользоваться своими правами.'],
    ['terms','Пользовательское соглашение','Правила использования сайта, материалов, калькулятора и личного кабинета.'],
    ['oferta','Публичная оферта','Условия заключения договора, выполнения работ, приёмки, оплаты и прекращения услуг.'],
    ['academic-integrity','Границы помощи и академическая добросовестность','Какие задачи редакция принимает и что остаётся ответственностью автора учебной работы.'],
    ['refunds','Отказ от услуг и возврат','Порядок отмены до начала и после начала работ, сроки ответа и состав расчёта.'],
    ['requisites','Реквизиты и правовая информация','Сведения об исполнителе, способы связи и документы сервиса.'],
    ['consent-request','Уведомление об обработке данных для заявки','Какие контактные данные и файлы нужны для оценки задачи и на каком основании они обрабатываются.'],
    ['consent-analytics','Согласие на аналитику сайта','Необязательная аналитика использования сайта и способ изменить выбор.'],
    ['consent-marketing','Согласие на получение рекламных сообщений','Отдельное согласие на редкие информационные и рекламные сообщения.'],
    ['consent-publication','Согласие на распространение персональных данных','Какие сведения можно разместить в книге благодарностей и как отозвать согласие.'],
    ['consent','Согласие на обработку данных для программы лояльности','Данные, необходимые для начисления бонусов и приглашений.'],
    ['loyalty','Правила программы лояльности','Начисление и использование бонусов, приглашения и условия абонемента.']
  ].map(function (item) {
    return { slug:item[0], title:item[1], short:item[2] };
  });

  function pageSlug() {
    return (location.pathname.split('/').pop() || '').replace(/\.html$/i, '');
  }

  function text(node) {
    return node ? node.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function slugify(value, fallback) {
    var map = {
      а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',
      к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',
      х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'
    };
    var result = String(value || '').toLocaleLowerCase('ru-RU').split('').map(function (char) {
      return Object.prototype.hasOwnProperty.call(map, char) ? map[char] : char;
    }).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return result || fallback;
  }

  function uniqueHeadingIds(container, prefix, articleMode) {
    var used = {};
    return Array.prototype.map.call(container.querySelectorAll('h2'), function (heading, index) {
      var base = heading.id || slugify(text(heading), prefix + '-' + (index + 1));
      var id = base;
      var suffix = 2;
      while (used[id]) id = base + '-' + suffix++;
      used[id] = true;
      heading.id = id;
      if (articleMode) heading.dataset.sectionIndex = String(index + 1).padStart(2, '0');
      return heading;
    });
  }

  function cloneSafe(source) {
    if (source.nodeType === Node.TEXT_NODE) return document.createTextNode(source.textContent || '');
    if (source.nodeType !== Node.ELEMENT_NODE) return null;

    // Врезка по ходу текста, помеченная явно, — часть материала, а не дубль
    // боковой панели: та появляется лишь на ~76% глубины, куда доскроллены единицы.
    var inlineCta = source.nodeType === Node.ELEMENT_NODE &&
      source.hasAttribute && source.hasAttribute('data-inline-cta');

    if (!inlineCta) {
      if (source.tagName === 'ASIDE' && source.querySelector('a[href*="configurator.html"],[data-contact]')) {
        return null;
      }
      if (source.tagName === 'P' && source.querySelector('a[href*="configurator.html"]')) return null;
    }

    var allowed = [
      'H2','H3','H4','P','UL','OL','LI','DL','DT','DD','TABLE','THEAD','TBODY',
      'TR','TH','TD','BLOCKQUOTE','PRE','DIV','SPAN','A','STRONG','B','EM','I',
      'BR','DETAILS','SUMMARY'
    ];
    if (allowed.indexOf(source.tagName) === -1) {
      var fragment = document.createDocumentFragment();
      Array.prototype.forEach.call(source.childNodes, function (child) {
        var safeChild = cloneSafe(child);
        if (safeChild) fragment.appendChild(safeChild);
      });
      return fragment;
    }

    var element = document.createElement(source.tagName.toLocaleLowerCase('ru-RU'));
    if (source.id) element.id = source.id;
    ['colspan','rowspan','scope'].forEach(function (name) {
      if (source.hasAttribute(name)) element.setAttribute(name, source.getAttribute(name));
    });
    ['doc-note','link','num','read-cta'].forEach(function (name) {
      if (source.classList.contains(name)) element.classList.add(name);
    });

    if (source.tagName === 'A') {
      var href = source.getAttribute('href') || '';
      if (/^(https?:\/\/|mailto:|tel:|#)/i.test(href) || /\.pdf(?:#|$)/i.test(href) || /\.html(?:#|$)/i.test(href)) {
        element.setAttribute('href', href);
      }
      if (/^https?:\/\//i.test(href) || /\.pdf(?:#|$)/i.test(href)) {
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noopener noreferrer');
      }
    }

    Array.prototype.forEach.call(source.childNodes, function (child) {
      var safeChild = cloneSafe(child);
      if (safeChild) element.appendChild(safeChild);
    });
    if (source.tagName === 'A' && !element.hasAttribute('href')) {
      var span = document.createElement('span');
      while (element.firstChild) span.appendChild(element.firstChild);
      return span;
    }
    return element;
  }

  function sourceFragment(article, excluded) {
    var fragment = document.createDocumentFragment();
    Array.prototype.forEach.call(article.children, function (child) {
      if (excluded.indexOf(child) !== -1) return;
      if (child.classList.contains('doc-back')) return;
      var safe = cloneSafe(child);
      if (safe) fragment.appendChild(safe);
    });
    return fragment;
  }

  function wrapTables(container, prefix) {
    Array.prototype.forEach.call(container.querySelectorAll('table'), function (table, index) {
      if (table.closest('.source-table-wrap')) return;
      var wrapper = document.createElement('div');
      var hint = document.createElement('div');
      var hintId = 'source-table-hint-' + prefix + '-' + (index + 1);
      wrapper.className = 'source-table-wrap';
      hint.className = 'source-table-hint';
      hint.id = hintId;
      hint.textContent = 'Проведите влево, чтобы увидеть все столбцы';
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
      wrapper.appendChild(hint);
      table.tabIndex = 0;
      table.setAttribute('aria-describedby', hintId);
    });
  }

  function makeToc(headings, label, articleMode) {
    var nav = document.createElement('aside');
    nav.className = articleMode ? 'article-toc' : 'legal-toc';
    nav.dataset.sourceToc = '';
    nav.setAttribute('aria-label', articleMode ? 'Содержание материала' : 'Содержание документа');
    if (articleMode) {
      var strong = document.createElement('strong');
      strong.textContent = label;
      nav.appendChild(strong);
    }
    headings.forEach(function (heading, index) {
      var button = document.createElement('button');
      var marker = document.createElement('span');
      button.type = 'button';
      button.dataset.sourceScroll = heading.id;
      marker.textContent = articleMode ? String(index + 1).padStart(2, '0') : '§';
      button.appendChild(marker);
      button.appendChild(document.createTextNode(text(heading)));
      nav.appendChild(button);
    });
    if (articleMode) {
      var count = document.createElement('span');
      var number = headings.length;
      count.textContent = number + (number === 1 ? ' раздел' : number > 1 && number < 5 ? ' раздела' : ' разделов');
      nav.appendChild(count);
    }
    return nav;
  }

  function articleAction(slug) {
    var href = 'configurator.html';
    var label = 'Проверить свой материал';
    var secondary = false;
    if (/rinc/i.test(slug)) {
      href = 'nauchnaya-statya.html';
      label = 'Показать рукопись редактору';
    } else if (/normocontrol|titulnyj|prilozheniya/i.test(slug)) {
      href = 'normokontrol-vkr.html';
      label = 'Проверить оформление';
    } else if (/otchet-po-praktike|dnevnik-praktiki|harakteristika/i.test(slug)) {
      href = 'otchet-po-praktike.html';
      label = 'Показать комплект документов';
    } else if (/apellyaciya/i.test(slug)) {
      href = 'priyomnaya.html';
      label = 'Задать вопрос о порядке действий';
      secondary = true;
    } else if (/prakticheskaya-chast-kursovoy/i.test(slug)) {
      href = 'kursovaya-rabota.html';
      label = 'Показать практическую главу';
    } else if (/istochnik|spisok-literatury|doi/i.test(slug)) {
      href = 'proverka-istochnikov-vkr.html';
      label = 'Проверить список источников';
    } else if (/temy|vvedenie|obekt|prakticheskaya|zaklyuchenie/i.test(slug)) {
      href = 'audit-temy-vkr.html';
      label = 'Проверить формулировки';
    } else if (/zashchit|rech|prezentaciya|recenziya|otzyv-rukovoditelya/i.test(slug)) {
      href = 'razbor-zamechaniy-nauchruka.html';
      label = 'Разобрать материалы к защите';
    }
    return { href:href, label:label, secondary:secondary };
  }

  function relatedGuides(guide) {
    var special = {
      'guide-rinc-statya':['guide-spisok-literatury','guide-antiplagiat-ai','guide-recenziya-na-vkr'],
      'guide-apellyaciya':['guide-normocontrol','guide-zashchita-diploma','guide-otzyv-rukovoditelya-vkr']
    }[guide.slug] || [];
    var root = guide.category.split('·')[0].trim();
    var result = [];
    special.forEach(function (slug) {
      var match = GUIDE_DATA.find(function (item) { return item.slug === slug; });
      if (match && result.indexOf(match) === -1) result.push(match);
    });
    GUIDE_DATA.forEach(function (item) {
      if (result.length >= 3 || item.slug === guide.slug || item.category.indexOf(root) !== 0) return;
      if (result.indexOf(item) === -1) result.push(item);
    });
    GUIDE_DATA.forEach(function (item) {
      if (result.length >= 3 || item.slug === guide.slug || result.indexOf(item) !== -1) return;
      result.push(item);
    });
    return result.slice(0, 3);
  }

  function articleCard(guide, index) {
    var card = document.createElement('article');
    card.className = 'article-card';
    var link = document.createElement('a');
    link.href = guide.slug + '.html';
    link.innerHTML =
      '<div class="article-card__number">' + String(index + 1).padStart(2, '0') + '</div>' +
      '<div class="article-card__body"><span class="reading-tag"></span><h3></h3><p></p></div>' +
      '<footer><span></span><span>Читать <b aria-hidden="true">→</b></span></footer>';
    link.querySelector('.reading-tag').textContent = guide.category;
    link.querySelector('h3').textContent = guide.title;
    link.querySelector('p').textContent = guide.summary;
    link.querySelector('footer span').textContent = guide.reading;
    card.appendChild(link);
    return card;
  }

  function progressNode() {
    var progress = document.createElement('div');
    progress.className = 'reading-progress';
    progress.dataset.readingProgress = '';
    progress.setAttribute('aria-hidden', 'true');
    progress.innerHTML = '<i></i>';
    return progress;
  }

  function tuneMobileAppbar(title, section) {
    var brand = document.querySelector('.mobile-appbar__brand');
    if (!brand) return;
    var strong = brand.querySelector('strong');
    var small = brand.querySelector('small');
    if (strong) strong.textContent = title;
    if (small) small.textContent = section;
  }

  function initArticle(slug) {
    var oldMain = document.querySelector('main.doc-wrap');
    var sourceArticle = oldMain && oldMain.querySelector(':scope > article.doc');
    var guide = GUIDE_DATA.find(function (item) { return item.slug === slug; });
    if (!oldMain || !sourceArticle || !guide) return false;

    document.body.classList.remove('guide-enhanced','kb-page','document-page');
    document.body.classList.add('reading-page','reading-article');

    var sourceTitle = sourceArticle.querySelector(':scope > h1');
    var sourceSubtitle = sourceArticle.querySelector(':scope > .doc-subtitle');
    var sourceMeta = sourceArticle.querySelector(':scope > .doc-meta');
    if (!sourceTitle || !sourceSubtitle) return false;

    var main = document.createElement('main');
    main.className = 'article-page';
    main.id = oldMain.id || 'main';
    var shell = document.createElement('div');
    shell.className = 'article-shell';

    var crumbs = document.createElement('nav');
    crumbs.className = 'breadcrumbs';
    crumbs.setAttribute('aria-label', 'Хлебные крошки');
    crumbs.innerHTML = '<a href="/">Главная</a><span>·</span><a href="knowledge.html">Библиотека</a><span>·</span><span></span>';
    crumbs.lastElementChild.textContent = guide.category;

    var hero = document.createElement('header');
    hero.className = 'article-hero';
    hero.innerHTML =
      '<div class="article-hero__meta"><span class="reading-tag"></span><span></span><span></span></div>' +
      '<h1></h1><p></p>' +
      '<div class="article-hero__byline"><span class="article-hero__avatar">АС</span>' +
      '<div><strong>Редакция Академического Салона</strong><small>Ответственный издатель — Семёнов Семён Юрьевич</small></div>' +
      '<button type="button" data-share-current>Поделиться</button></div>';
    hero.querySelector('.reading-tag').textContent = guide.category;
    hero.querySelector('.article-hero__meta span:nth-child(2)').textContent = guide.reading;
    hero.querySelector('.article-hero__meta span:nth-child(3)').textContent = text(sourceMeta) || 'Опубликованный материал';
    hero.querySelector('h1').textContent = text(sourceTitle);
    hero.querySelector(':scope > p').textContent = text(sourceSubtitle);

    var content = document.createElement('article');
    content.className = 'article-content source-document';
    content.appendChild(sourceFragment(sourceArticle, [sourceTitle,sourceSubtitle,sourceMeta].filter(Boolean)));
    var opening = content.querySelector(':scope > p');
    if (opening) opening.classList.add('article-opening');
    wrapTables(content, slug);
    var headings = uniqueHeadingIds(content, 'source-' + slug, true);

    var toc = makeToc(headings, 'В материале', true);
    var aside = document.createElement('aside');
    aside.className = 'article-aside';
    var action = articleAction(slug);
    aside.innerHTML =
      '<div><p class="reading-eyebrow">Нужна проверка вашего материала?</p>' +
      '<h3>Редактор отметит приоритеты и объяснит существенные замечания.</h3>' +
      '<a class="reading-button ' + (action.secondary ? '' : 'reading-button--primary') + '" href="' + action.href + '"></a></div>' +
      '<div><strong>Материал полезен?</strong><span><button type="button" data-article-rate="yes">Да</button>' +
      '<button type="button" data-article-rate="no">Нет</button></span></div>';
    aside.querySelector('a').textContent = action.label;

    var layout = document.createElement('div');
    layout.className = 'article-layout';
    layout.appendChild(toc);
    layout.appendChild(content);
    layout.appendChild(aside);

    var related = document.createElement('section');
    related.className = 'related-articles';
    related.innerHTML =
      '<div class="reading-section-head"><div><p>Читайте дальше</p><h2>По этой теме</h2></div></div>' +
      '<div class="article-card-grid"></div>';
    var relatedGrid = related.querySelector('.article-card-grid');
    relatedGuides(guide).forEach(function (item, index) {
      relatedGrid.appendChild(articleCard(item, index));
    });

    shell.appendChild(crumbs);
    shell.appendChild(hero);
    shell.appendChild(layout);
    shell.appendChild(related);
    main.appendChild(progressNode());
    main.appendChild(shell);
    oldMain.replaceWith(main);
    tuneMobileAppbar(text(sourceTitle), 'Статья');
    document.body.classList.add('is-reading-ready');
    return true;
  }

  function initLegal(slug) {
    var oldMain = document.querySelector('main.doc-wrap');
    var sourceArticle = oldMain && oldMain.querySelector(':scope > article.doc');
    var legal = LEGAL_DATA.find(function (item) { return item.slug === slug; });
    if (!oldMain || !sourceArticle || !legal) return false;

    document.body.classList.remove('document-page');
    document.body.classList.add('reading-page','reading-legal');

    var sourceTitle = sourceArticle.querySelector(':scope > h1');
    var sourceSubtitle = sourceArticle.querySelector(':scope > .doc-subtitle');
    var sourceMeta = sourceArticle.querySelector(':scope > .doc-meta');
    if (!sourceMeta) {
      sourceMeta = Array.prototype.slice.call(sourceArticle.children,0,5).find(function (child) {
        return child.tagName === 'P' && /редакци[яи]|вступает в силу|обновлено/i.test(text(child));
      }) || null;
    }
    if (!sourceTitle) return false;

    var main = document.createElement('main');
    main.className = 'legal-page';
    main.id = oldMain.id || 'main';
    var shell = document.createElement('div');
    shell.className = 'legal-shell';

    var nav = document.createElement('aside');
    nav.className = 'legal-nav';
    nav.innerHTML = '<strong>Документы</strong>';
    LEGAL_DATA.forEach(function (item) {
      var link = document.createElement('a');
      link.href = item.slug + '.html';
      link.textContent = item.title;
      if (item.slug === slug) {
        link.className = 'is-current';
        link.setAttribute('aria-current','page');
      }
      nav.appendChild(link);
    });

    var content = document.createElement('div');
    content.className = 'legal-content';
    var crumbs = document.createElement('nav');
    crumbs.className = 'breadcrumbs';
    crumbs.setAttribute('aria-label','Хлебные крошки');
    crumbs.innerHTML = '<a href="/">Главная</a><span>·</span><span>Документы</span>';

    var hero = document.createElement('header');
    hero.innerHTML =
      '<p class="reading-eyebrow">Правовая информация</p><h1></h1><p></p>' +
      '<div><span></span><button type="button" data-print-page>Версия для печати</button></div>';
    hero.querySelector('h1').textContent = text(sourceTitle);
    hero.querySelector(':scope > p:nth-of-type(2)').textContent = legal.short;
    hero.querySelector('div span').textContent = text(sourceMeta) || 'Редакция от 24 июля 2026 г.';

    var source = document.createElement('div');
    source.className = 'legal-source source-document';
    source.appendChild(sourceFragment(sourceArticle, [sourceTitle,sourceSubtitle,sourceMeta].filter(Boolean)));
    wrapTables(source, slug);
    var headings = uniqueHeadingIds(source, 'source-' + slug, false);
    var toc = makeToc(headings, 'В документе', false);
    toc.className = 'legal-toc';

    content.appendChild(crumbs);
    content.appendChild(hero);
    content.appendChild(toc);
    content.appendChild(source);
    shell.appendChild(nav);
    shell.appendChild(content);
    main.appendChild(progressNode());
    main.appendChild(shell);
    oldMain.replaceWith(main);
    tuneMobileAppbar(text(sourceTitle), 'Документы');
    document.body.classList.add('is-reading-ready');
    return true;
  }

  var toastTimer;
  function announce(message) {
    var toast = document.querySelector('.reading-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'reading-toast';
      toast.setAttribute('role','status');
      toast.setAttribute('aria-live','polite');
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.hidden = true; }, 2400);
  }

  function copy(value) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(value);
    var area = document.createElement('textarea');
    area.value = value;
    area.readOnly = true;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); } catch (error) {}
    area.remove();
    return Promise.resolve();
  }

  function centerRailItem(rail, item) {
    if (!rail || !item || rail.scrollWidth <= rail.clientWidth + 8) return;
    var railRect = rail.getBoundingClientRect();
    var itemRect = item.getBoundingClientRect();
    var left = rail.scrollLeft + itemRect.left - railRect.left - (rail.clientWidth - itemRect.width) / 2;
    rail.scrollTo({ left:Math.max(0,Math.min(rail.scrollWidth - rail.clientWidth,left)), behavior:'smooth' });
  }

  function initInteractions(slug) {
    var root = document.querySelector('.article-page,.legal-page');
    var source = root && root.querySelector('.source-document');
    var progress = root && root.querySelector('[data-reading-progress]');
    if (!root || !source || !progress) return;

    root.addEventListener('click', function (event) {
      var sectionButton = event.target.closest('[data-source-scroll]');
      if (sectionButton) {
        var destination = source.querySelector('#' + CSS.escape(sectionButton.dataset.sourceScroll));
        if (destination) {
          destination.scrollIntoView({ behavior:matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth', block:'start' });
          destination.setAttribute('tabindex','-1');
          destination.focus({ preventScroll:true });
        }
        return;
      }
      if (event.target.closest('[data-print-page]')) {
        window.print();
        return;
      }
      if (event.target.closest('[data-share-current]')) {
        var canonical = document.querySelector('link[rel="canonical"]');
        var url = canonical ? canonical.href : location.href.split('#')[0];
        var payload = { title:document.title, text:text(document.querySelector('.article-hero>p')), url:url };
        if (navigator.share) {
          navigator.share(payload).catch(function (error) {
            if (error && error.name === 'AbortError') return;
            copy(url).then(function () { announce('Ссылка скопирована'); });
          });
        } else {
          copy(url).then(function () { announce('Ссылка скопирована'); });
        }
        return;
      }
      var rate = event.target.closest('[data-article-rate]');
      if (rate) {
        var value = rate.dataset.articleRate;
        root.querySelectorAll('[data-article-rate]').forEach(function (button) {
          button.setAttribute('aria-pressed', String(button.dataset.articleRate === value));
        });
        try { localStorage.setItem('salon_article_rate_' + slug,value); } catch (error) {}
        announce('Спасибо. Ответ сохранён на этом устройстве.');
      }
    });

    var storedRate = '';
    try { storedRate = localStorage.getItem('salon_article_rate_' + slug) || ''; } catch (error) {}
    root.querySelectorAll('[data-article-rate]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.articleRate === storedRate));
    });

    function update() {
      var sourceTop = source.getBoundingClientRect().top + window.scrollY;
      var start = sourceTop - (matchMedia('(max-width:920px)').matches ? 92 : 118);
      var finish = Math.max(start + 1,sourceTop + source.scrollHeight - Math.max(window.innerHeight * .58,320));
      var ratio = Math.min(1,Math.max(0,(window.scrollY - start) / (finish - start)));
      progress.style.setProperty('--reading-progress',ratio.toFixed(4));

      var headings = Array.prototype.slice.call(source.querySelectorAll('h2[id]'));
      if (!headings.length) return;
      var threshold = matchMedia('(max-width:920px)').matches ? 132 : 112;
      var current = headings[0];
      headings.forEach(function (heading) {
        if (heading.getBoundingClientRect().top <= threshold) current = heading;
      });
      var toc = root.querySelector('[data-source-toc]');
      if (!toc) return;
      toc.querySelectorAll('[data-source-scroll]').forEach(function (button) {
        var active = button.dataset.sourceScroll === current.id;
        button.classList.toggle('is-current',active);
        if (active) button.setAttribute('aria-current','location');
        else button.removeAttribute('aria-current');
      });
      if (matchMedia('(max-width:920px)').matches) {
        centerRailItem(toc,toc.querySelector('[aria-current="location"]'));
      }
    }

    var ticking = false;
    function requestUpdate() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        update();
        ticking = false;
      });
    }
    addEventListener('scroll',requestUpdate,{ passive:true });
    addEventListener('resize',requestUpdate,{ passive:true });
    update();

    if (matchMedia('(max-width:920px)').matches) {
      centerRailItem(root.querySelector('.legal-nav'),root.querySelector('.legal-nav .is-current'));
    }
  }

  function init() {
    var slug = pageSlug();
    var success = /^guide-/.test(slug) ? initArticle(slug) : initLegal(slug);
    if (success) initInteractions(slug);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init);
  else init();
})();
