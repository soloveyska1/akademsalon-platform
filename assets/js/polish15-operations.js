(function () {
  'use strict';

  function one(selector, root) {
    return (root || document).querySelector(selector);
  }

  function all(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[char];
    });
  }

  function notify(message) {
    if (window.Salon && window.Salon.toast) {
      window.Salon.toast(message);
      return;
    }
    var region = one('[data-p15-notice]');
    if (region) {
      region.hidden = false;
      region.textContent = message;
    }
  }

  function safeStore(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch (error) {}
  }

  function textCheck() {
    var textarea = one('[data-check-text]');
    var run = one('[data-run-text-check]');
    var sample = one('[data-fill-text-example]');
    var counter = one('[data-char-count]');
    var result = one('[data-check-result]');
    if (!textarea || !run || !result) return;

    var example = 'В рамках настоящего исследования представляется необходимым отметить, что полученные результаты, в свою очередь, позволяют сделать вывод о наличии устойчивой связи между учебной мотивацией и регулярностью самостоятельной работы студентов. Следует отметить, что данный вывод требует дополнительной проверки на более широкой выборке.';
    var heavy = [
      'в рамках', 'представляется необходимым', 'следует отметить', 'необходимо отметить',
      'в свою очередь', 'данный', 'настоящего исследования', 'позволяет сделать вывод',
      'осуществляется', 'является', 'имеет место', 'в целях'
    ];

    function updateCounter() {
      counter.textContent = textarea.value.length.toLocaleString('ru-RU') + ' / 8 000';
    }

    function sentenceList(text) {
      return text.replace(/\s+/g, ' ').trim().split(/[.!?]+(?:\s|$)/).map(function (item) {
        return item.trim();
      }).filter(Boolean);
    }

    function finding(level, label, title, note) {
      return '<article class="finding finding--' + level + '"><span>' + escapeHTML(label) +
        '</span><div><strong>' + escapeHTML(title) + '</strong><p>' + escapeHTML(note) +
        '</p></div></article>';
    }

    function analyze() {
      var text = textarea.value.replace(/\s+/g, ' ').trim();
      if (text.length < 40) {
        notify('Добавьте хотя бы одно полное предложение — примерно 40 знаков.');
        textarea.focus();
        return;
      }
      var words = text.match(/[A-Za-zА-Яа-яЁё0-9-]+/g) || [];
      var sentences = sentenceList(text);
      var average = sentences.length ? Math.round(words.length / sentences.length) : words.length;
      var lower = text.toLowerCase();
      var heavyHits = heavy.reduce(function (sum, phrase) {
        return sum + (lower.split(phrase).length - 1);
      }, 0);
      var longSentences = sentences.filter(function (sentence) {
        return (sentence.match(/[A-Za-zА-Яа-яЁё0-9-]+/g) || []).length > 26;
      }).length;
      var normalized = words.map(function (word) { return word.toLowerCase(); })
        .filter(function (word) { return word.length > 4; });
      var counts = {};
      normalized.forEach(function (word) { counts[word] = (counts[word] || 0) + 1; });
      var repeats = Object.keys(counts).filter(function (word) {
        return counts[word] >= 3;
      }).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 5);
      var formalCount = heavyHits + longSentences + repeats.length;
      var findings = [];

      if (longSentences) {
        findings.push(finding('warning', String(longSentences), 'Длинные предложения',
          'Разделите фразы длиннее 26 слов и проверьте, не смешаны ли в них разные мысли.'));
      } else {
        findings.push(finding('good', '✓', 'Длина предложений', 'Явно перегруженных фраз не найдено.'));
      }
      if (heavyHits) {
        findings.push(finding('warning', String(heavyHits), 'Тяжёлые обороты',
          'Проверьте вводные конструкции и отглагольные формулировки: часть можно заменить прямым глаголом.'));
      } else {
        findings.push(finding('good', '✓', 'Служебные обороты', 'Частые канцелярские формулы не обнаружены.'));
      }
      if (repeats.length) {
        findings.push(finding('warning', String(repeats.length), 'Повторы',
          'Чаще других встречаются: ' + repeats.join(', ') + '. Сверьте, везде ли повтор нужен по смыслу.'));
      } else {
        findings.push(finding('good', '✓', 'Лексические повторы', 'Навязчивых повторов не найдено.'));
      }

      result.classList.add('has-result');
      result.innerHTML =
        '<header><div><p class="eyebrow">Результат</p><h2>' +
          (formalCount ? 'Формальные признаки: ' + formalCount : 'Формальных признаков не найдено') +
        '</h2></div></header>' +
        '<div class="checker-metrics"><div><span>Слов</span><strong>' + words.length +
        '</strong></div><div><span>Предложений</span><strong>' + sentences.length +
        '</strong></div><div><span>Средняя длина</span><strong>' + average +
        ' слов</strong></div></div><div class="checker-findings">' + findings.join('') +
        '</div><p class="checker-disclaimer">Автоматическая проверка видит только формальные признаки. ' +
        'Она не оценивает содержание, фактическую точность или качество исследования.</p>' +
        '<a class="line-link" href="redaktura-posle-ii.html">Нужна ручная проверка <span aria-hidden="true">→</span></a>';
      result.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
    }

    textarea.addEventListener('input', updateCounter);
    run.addEventListener('click', analyze);
    if (sample) {
      sample.addEventListener('click', function () {
        textarea.value = example;
        updateCounter();
        textarea.focus();
      });
    }
    updateCounter();
  }

  function topicAudit() {
    var title = one('[data-topic-title]');
    var discipline = one('[data-topic-discipline]');
    var run = one('[data-run-topic-audit]');
    var result = one('[data-topic-result]');
    if (!title || !discipline || !run || !result) return;

    function normalizeTopic(value) {
      return value.replace(/\s+/g, ' ').trim();
    }

    function draw() {
      var topic = normalizeTopic(title.value);
      if (topic.length < 18) {
        notify('Уточните тему: добавьте объект, связь или границы исследования.');
        title.focus();
        return;
      }
      var disciplineName = discipline.value;
      var hasContext = /(на примере|в условиях|у студент|организац|регион|период|гг\.|росси|предприят|20\d{2})/i.test(topic);
      var hasRelation = /(связ|влиян|оцен|анализ|развит|формирован|совершенств|эффектив|особенност)/i.test(topic);
      var focus = hasRelation
        ? 'В формулировке есть исследовательское действие или проверяемая связь.'
        : 'Добавьте действие: что именно вы сравниваете, оцениваете или проверяете.';
      var question = hasContext
        ? 'Сверьте, доступны ли данные для указанной группы, организации или периода.'
        : 'Укажите границы: группу, организацию, отрасль, территорию либо период.';
      var area = disciplineName + ': ' + topic.split(/[,:;]/)[0].slice(0, 120);
      var editor = hasContext && hasRelation
        ? 'Какие данные подтвердят заявленную связь и каким методом вы их проверите?'
        : 'Какой наблюдаемый результат позволит ответить на исследовательский вопрос?';

      result.innerHTML =
        '<header><span class="tag tag--green">Черновик паспорта</span><h2>' + escapeHTML(topic) +
        '</h2></header><dl><div><dt>Предметная область</dt><dd>' + escapeHTML(area) +
        '</dd></div><div><dt>Фокус исследования</dt><dd>' + escapeHTML(focus) +
        '</dd></div><div><dt>Что нужно уточнить</dt><dd>' + escapeHTML(question) +
        '</dd></div></dl><div class="article-callout"><span>Редакторский вопрос</span><p>' +
        escapeHTML(editor) + '</p></div><a class="line-link" href="plan.html">Обсудить тему с редактором ' +
        '<span aria-hidden="true">→</span></a>';
      safeStore('salon_topic_passport', { topic: topic, discipline: disciplineName });
    }

    run.addEventListener('click', draw);
  }

  function sourceChecker() {
    var input = one('[data-source-text]');
    var run = one('[data-run-source-check]');
    var sample = one('[data-fill-source-example]');
    var result = one('[data-source-result]');
    if (!input || !run || !result) return;

    var example = [
      'Иванов И. И. Методы исследования. — Москва : Наука, 2022. — 240 с.',
      'Петрова А. С. Пример журнальной статьи // Вопросы образования. — 2023. — № 2. — С. 44–61. DOI: 10.1038/s41586-020-2649-2',
      'Министерство науки и высшего образования Российской Федерации. Официальный сайт. URL: https://minobrnauki.gov.ru/',
      'Статья без автора и года https://example.org/material'
    ].join('\n');

    function extractDOI(value) {
      var matches = value.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/ig) || [];
      return matches.map(function (doi) {
        return doi.replace(/[.,;)\]]+$/, '');
      });
    }

    function localIssue(line) {
      var issues = [];
      if (!/\b(19|20)\d{2}\b/.test(line)) issues.push('не найден год');
      if (!/[А-ЯЁA-Z][а-яёa-z-]+\s+[А-ЯЁA-Z]\./.test(line) && !/^(Федерал|Министер|ГОСТ|Постанов|Закон)/i.test(line)) {
        issues.push('проверьте автора или организацию');
      }
      if (/https?:\/\//i.test(line) && !/(дата обращения|обращения:)/i.test(line)) {
        issues.push('для интернет-источника нужна дата обращения');
      }
      return issues.join('; ');
    }

    function render(items, crossref) {
      var issueCount = items.filter(function (item) { return item.issue; }).length;
      result.innerHTML =
        '<header><div><p class="eyebrow">Результат</p><h2>' + items.length +
        ' записей</h2></div><span class="tag ' + (issueCount ? 'tag--amber' : 'tag--green') + '">' +
        issueCount + ' требуют внимания</span></header><div class="source-list">' +
        items.map(function (item, index) {
          var doiNote = item.doi && crossref[item.doi]
            ? (crossref[item.doi].ok
              ? 'Crossref: ' + crossref[item.doi].title
              : 'Crossref: запись не подтверждена')
            : '';
          var note = [item.issue || 'Основные поля найдены', doiNote].filter(Boolean).join(' · ');
          var issue = Boolean(item.issue || (item.doi && crossref[item.doi] && !crossref[item.doi].ok));
          return '<article class="' + (issue ? 'has-issue' : '') + '"><span>' +
            String(index + 1).padStart(2, '0') + '</span><div><p>' + escapeHTML(item.text) +
            '</p><small>' + escapeHTML(note) + '</small></div></article>';
        }).join('') + '</div>';
    }

    function lookupDOI(doi) {
      return fetch('https://api.crossref.org/works/' + encodeURIComponent(doi), {
        method: 'GET',
        headers: { Accept: 'application/json' }
      }).then(function (response) {
        if (!response.ok) return { ok: false };
        return response.json().then(function (payload) {
          var message = payload && payload.message || {};
          var title = Array.isArray(message.title) ? message.title[0] : message.title;
          return { ok: true, title: title || doi };
        });
      }).catch(function () {
        return { ok: false, offline: true };
      });
    }

    function analyze() {
      var lines = input.value.split(/\n+/).map(function (line) {
        return line.trim();
      }).filter(Boolean);
      if (!lines.length) {
        notify('Вставьте хотя бы одну библиографическую запись.');
        input.focus();
        return;
      }
      var items = lines.map(function (line) {
        var dois = extractDOI(line);
        return { text: line, issue: localIssue(line), doi: dois[0] || '' };
      });
      var dois = items.map(function (item) { return item.doi; }).filter(Boolean)
        .filter(function (value, index, array) { return array.indexOf(value) === index; }).slice(0, 8);
      var crossref = {};
      render(items, crossref);
      if (!dois.length) return;

      Promise.all(dois.map(function (doi) {
        return lookupDOI(doi).then(function (data) {
          crossref[doi] = data;
        });
      })).then(function () {
        render(items, crossref);
      });
    }

    run.addEventListener('click', analyze);
    if (sample) {
      sample.addEventListener('click', function () {
        input.value = example;
        input.focus();
      });
    }
  }

  function genericTool() {
    var field = one('[data-generic-tool-text]');
    var submit = one('[data-generic-tool-submit]');
    if (!field || !submit) return;
    submit.addEventListener('click', function () {
      var value = field.value.trim();
      if (value.length < 20) {
        notify('Опишите хотя бы одно требование или замечание.');
        field.focus();
        return;
      }
      safeStore('salon_editor_brief', { message: value, source: location.pathname });
      try {
        localStorage.setItem('salon_prefill_comment', value);
      } catch (error) {}
      location.href = 'configurator.html?service=rv';
    });
  }

  function formats() {
    all('[data-start-format]').forEach(function (button) {
      button.addEventListener('click', function () {
        var value = button.getAttribute('data-start-format') || '';
        var tier = value === 'Письменный разбор' || value === 'Диагностика' ? 'base' : value === 'Сопровождение' ? 'vip' : 'turn';
        try {
          localStorage.setItem('salon_preferred_format', value);
        } catch (error) {}
        location.href = 'configurator.html?tier=' + encodeURIComponent(tier);
      });
    });
  }

  function paymentDialog() {
    var dialog = one('[data-payment-dialog]');
    var triggers = all('[data-open-payment]');
    if (!dialog || !triggers.length) return;

    triggers.forEach(function (trigger) {
      trigger.addEventListener('click', function () {
        if (dialog.showModal) dialog.showModal();
        else dialog.setAttribute('open', '');
      });
    });
    all('[data-close-payment]', dialog).forEach(function (button) {
      button.addEventListener('click', function () { dialog.close(); });
    });
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) dialog.close();
    });
  }

  function systemRetry() {
    var button = one('[data-system-retry]');
    if (!button) return;
    button.addEventListener('click', function () {
      button.disabled = true;
      var original = button.innerHTML;
      button.textContent = 'Проверяем соединение…';
      fetch('/', { method: 'HEAD', cache: 'no-store' }).then(function (response) {
        if (!response.ok) throw new Error('offline');
        location.href = '/';
      }).catch(function () {
        button.disabled = false;
        button.innerHTML = original;
        notify('Соединение пока не восстановлено. Ответы и черновики не удалены.');
      });
    });
  }

  function applicationDraft() {
    var card = one('[data-application-draft]');
    if (!card) return;
    var raw = null;
    try {
      raw = JSON.parse(sessionStorage.getItem('salon_application_preview') || 'null');
    } catch (error) {}
    if (!raw || !raw.name || !raw.contact) return;

    one('[data-application-empty]').hidden = true;
    card.hidden = false;
    all('[data-application-value]', card).forEach(function (node) {
      var key = node.getAttribute('data-application-value');
      node.textContent = raw[key] || 'Не указано';
    });
    var comment = one('[data-application-comment]', card);
    if (comment && raw.comment) {
      comment.hidden = false;
      one('p', comment).textContent = raw.comment;
    }
  }

  textCheck();
  topicAudit();
  sourceChecker();
  genericTool();
  formats();
  paymentDialog();
  systemRetry();
  applicationDraft();
})();
