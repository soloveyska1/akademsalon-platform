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


  /* Оплата: раскладка платежей, живые шаги и шкала возврата.
     Всё считается на клиенте и ничего не отправляет: это прикидка,
     точные суммы приходят в спецификации. */
  function paymentPage() {
    var split = one('[data-pay-split]');
    if (split) paymentSplit(split);
    var flow = one('[data-pay-flow]');
    if (flow) paymentSteps(flow);
    var refund = one('[data-pay-refund]');
    if (refund) refundScale(refund);
  }

  function rub(value) {
    return Math.round(value).toLocaleString('ru-RU').replace(/\u00A0/g, ' ') + ' \u20BD';
  }

  function paymentSplit(root) {
    var range = one('[data-pay-sum]', root);
    var out = one('[data-pay-sum-out]', root);
    var ladder = one('[data-pay-ladder]', root);
    var total = one('[data-pay-total]', root);
    var presets = all('[data-pay-preset]', root);
    var stageButtons = all('[data-pay-stages]', root);
    if (!range || !ladder) return;
    var stages = 3;

    /* Доли не равные: первый этап меньше — так и работает мастерская,
       чтобы начать можно было с небольшой суммы. */
    var SHARES = {
      2: [0.4, 0.6],
      3: [0.3, 0.4, 0.3],
      4: [0.25, 0.3, 0.25, 0.2]
    };
    var NAMES = ['План и структура', 'Основная часть', 'Сборка и оформление', 'Финальная проверка'];
    var WHEN = ['сразу после согласования', 'когда принят первый этап',
      'когда принят предыдущий этап', 'перед передачей результата'];

    function draw() {
      var sum = parseInt(range.value, 10) || 0;
      if (out) out.textContent = rub(sum);
      var shares = SHARES[stages] || SHARES[3];
      var parts = shares.map(function (share) { return Math.round(sum * share / 100) * 100; });
      var drift = sum - parts.reduce(function (a, b) { return a + b; }, 0);
      parts[parts.length - 1] += drift;
      ladder.textContent = '';
      parts.forEach(function (amount, index) {
        var li = document.createElement('li');
        if (index === 0) li.setAttribute('data-now', 'true');
        var name = document.createElement('b');
        name.textContent = 'Этап ' + (index + 1) + ' · ' + (NAMES[index] || 'Этап работы');
        var money = document.createElement('span');
        money.className = 'pay-ladder__sum';
        money.textContent = rub(amount);
        var when = document.createElement('em');
        when.textContent = index === 0 ? 'платите сейчас — ' + WHEN[0] : WHEN[index] || WHEN[2];
        var bar = document.createElement('span');
        bar.className = 'pay-ladder__bar';
        bar.style.width = Math.max(8, Math.round(amount / sum * 100)) + '%';
        li.appendChild(name);
        li.appendChild(money);
        li.appendChild(when);
        li.appendChild(bar);
        ladder.appendChild(li);
      });
      if (total) {
        total.innerHTML = 'Сейчас с вас спишется <b>' + rub(parts[0]) +
          '</b> — это ' + Math.round(parts[0] / sum * 100) + '% работы. ' +
          'Остальные ' + rub(sum - parts[0]) + ' — по мере того, как вы принимаете этапы.';
      }
      presets.forEach(function (button) {
        button.setAttribute('aria-pressed',
          String(parseInt(button.getAttribute('data-pay-preset'), 10) === sum));
      });
    }

    range.addEventListener('input', draw);
    presets.forEach(function (button) {
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', function () {
        range.value = button.getAttribute('data-pay-preset');
        draw();
      });
    });
    stageButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        stages = parseInt(button.getAttribute('data-pay-stages'), 10) || 3;
        stageButtons.forEach(function (item) {
          item.setAttribute('aria-pressed', String(item === button));
        });
        draw();
      });
    });
    draw();
  }

  function paymentSteps(root) {
    var steps = all('[data-pay-step]', root);
    var state = one('[data-demo-state]', root);
    var what = one('[data-demo-what]', root);
    var badge = one('[data-demo-badge]', root);
    if (!steps.length) return;
    var SCENE = {
      1: { state: 'Шаг 01 · согласование', badge: 'ожидает согласования', tone: '',
        what: 'Счёта пока нет: сначала вы читаете спецификацию и говорите, что поправить.' },
      2: { state: 'Шаг 02 · счёт выставлен', badge: 'ждёт оплаты', tone: 'live',
        what: 'В деле появилась ссылка на оплату — ровно на этот этап и на сумму из спецификации.' },
      3: { state: 'Шаг 03 · оплачено', badge: 'оплачено · чек в деле', tone: 'paid',
        what: 'Статус сменился сам, чек сохранён в деле. Ничего пересылать и подтверждать не нужно.' },
      4: { state: 'Шаг 04 · этап идёт', badge: 'в работе до 28 июля', tone: 'paid',
        what: 'В истории дела зафиксированы дата старта и ближайший результат.' }
    };
    steps.forEach(function (button) {
      button.addEventListener('click', function () {
        var scene = SCENE[button.getAttribute('data-pay-step')] || SCENE[1];
        steps.forEach(function (item) {
          item.setAttribute('aria-selected', String(item === button));
        });
        if (state) state.textContent = scene.state;
        if (what) what.textContent = scene.what;
        if (badge) {
          badge.textContent = scene.badge;
          if (scene.tone) badge.setAttribute('data-tone', scene.tone);
          else badge.removeAttribute('data-tone');
        }
      });
    });
  }

  function refundScale(root) {
    var buttons = all('[data-refund]', root);
    var headline = one('[data-refund-headline]', root);
    var note = one('[data-refund-note]', root);
    if (!buttons.length) return;
    /* Формулировки — из оферты. Никаких процентов: там их нет. */
    var CASE = {
      before: {
        head: 'Возвращается весь платёж за этот этап.',
        note: 'Пока этап не начат, работы по нему нет — возвращать нечего, кроме ваших денег. Остальные этапы вы и так не оплачивали.'
      },
      during: {
        head: 'Возвращается неоказанная часть.',
        note: 'Считается по фактически сделанной и переданной работе и документально подтверждённым расходам именно по этой позиции. Расчёт присылаем письменно, а не «на глаз».'
      },
      done: {
        head: 'Принятый этап возврату не подлежит.',
        note: 'Но если результат разошёлся с критериями из спецификации, это исправляется без доплаты. На первичную проверку у вас 7 календарных дней, и права по закону этот срок не ограничивает.'
      }
    };
    function pick(button) {
      var data = CASE[button.getAttribute('data-refund')] || CASE.before;
      buttons.forEach(function (item) {
        item.setAttribute('aria-pressed', String(item === button));
      });
      if (headline) headline.textContent = data.head;
      if (note) note.textContent = data.note;
    }
    buttons.forEach(function (button) {
      button.addEventListener('click', function () { pick(button); });
    });
    pick(buttons[0]);
  }

  textCheck();
  topicAudit();
  sourceChecker();
  genericTool();
  formats();
  paymentDialog();
  paymentPage();
  systemRetry();
  applicationDraft();
})();
