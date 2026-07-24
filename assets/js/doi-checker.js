(function () {
  'use strict';

  var input = document.querySelector('[data-doi-input]');
  var run = document.querySelector('[data-doi-run]');
  var sample = document.querySelector('[data-doi-sample]');
  var status = document.querySelector('[data-doi-status]');
  var results = document.querySelector('[data-doi-results]');
  var share = document.querySelector('[data-doi-share]');
  if (!input || !run || !status || !results) return;

  var MAX_DOIS = 20;
  var CONCURRENCY = 3;
  var DOI_RE = /10\.\d{4,9}\/[-._;()/:a-z0-9]+/gi;

  function cleanDoi(value) {
    return String(value || '')
      .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
      .replace(/[)\]}>.,;:]+$/g, '')
      .trim()
      .toLowerCase();
  }

  function extractDois(value) {
    var matches = String(value || '').match(DOI_RE) || [];
    var seen = Object.create(null);
    return matches.map(cleanDoi).filter(function (doi) {
      if (!doi || seen[doi]) return false;
      seen[doi] = true;
      return true;
    });
  }

  function setStatus(text, state) {
    status.textContent = text;
    status.dataset.state = state || '';
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function metadataLine(item) {
    var bits = [];
    var authors = Array.isArray(item.author) ? item.author.slice(0, 3).map(function (author) {
      return [author.family, author.given].filter(Boolean).join(' ');
    }).filter(Boolean) : [];
    if (authors.length) bits.push(authors.join(', ') + (item.author.length > 3 ? ' и др.' : ''));
    var date = item.published || item.issued || item.created;
    if (date && date['date-parts'] && date['date-parts'][0] && date['date-parts'][0][0]) {
      bits.push(String(date['date-parts'][0][0]));
    }
    if (item.publisher) bits.push(item.publisher);
    if (item.type) bits.push(item.type);
    return bits.join(' · ');
  }

  function renderFound(doi, item) {
    var card = el('article', 'tool-result');
    var head = el('div', 'tool-result__head');
    var main = el('div');
    main.appendChild(el('div', 'tool-doi', doi));
    var title = Array.isArray(item.title) ? item.title[0] : item.title;
    main.appendChild(el('h3', '', title || 'Запись найдена в Crossref'));
    var meta = metadataLine(item);
    if (meta) main.appendChild(el('p', '', meta));
    head.appendChild(main);
    head.appendChild(el('span', 'tool-result__state tool-result__state--found', 'найдено'));
    card.appendChild(head);
    var link = el('a', 'link tool-source-link', 'Открыть DOI ↗');
    link.href = 'https://doi.org/' + doi;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    card.appendChild(link);
    return card;
  }

  function renderReview(doi, reason) {
    var card = el('article', 'tool-result');
    var head = el('div', 'tool-result__head');
    var main = el('div');
    main.appendChild(el('div', 'tool-doi', doi));
    main.appendChild(el('h3', '', 'Нужна ручная проверка'));
    main.appendChild(el('p', '', reason));
    head.appendChild(main);
    head.appendChild(el('span', 'tool-result__state tool-result__state--review', 'проверить'));
    card.appendChild(head);
    return card;
  }

  function lookup(doi) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 10000) : null;
    var url = 'https://api.crossref.org/works/' + encodeURIComponent(doi) +
      '?mailto=support%40akademsalon.ru';
    return fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      if (response.status === 404) {
        return { doi: doi, found: false, reason: 'Crossref не вернул запись. Это не доказывает, что источник вымышлен: проверьте сайт издателя, каталог библиотеки и сам документ.' };
      }
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json().then(function (payload) {
        return { doi: doi, found: true, item: payload && payload.message ? payload.message : {} };
      });
    }).catch(function (error) {
      var timeout = error && error.name === 'AbortError';
      return {
        doi: doi,
        found: false,
        reason: timeout
          ? 'Crossref не ответил за 10 секунд. Повторите проверку или откройте DOI вручную.'
          : 'Сервис Crossref сейчас недоступен из браузера. Это техническая ошибка, а не вывод об источнике.'
      };
    }).finally(function () {
      if (timer) clearTimeout(timer);
    });
  }

  function pool(items, worker, limit) {
    var next = 0;
    var output = new Array(items.length);
    function runner() {
      var index = next++;
      if (index >= items.length) return Promise.resolve();
      return worker(items[index]).then(function (value) {
        output[index] = value;
        return runner();
      });
    }
    var workers = [];
    for (var i = 0; i < Math.min(limit, items.length); i++) workers.push(runner());
    return Promise.all(workers).then(function () { return output; });
  }

  function check() {
    var dois = extractDois(input.value);
    results.replaceChildren();
    if (!dois.length) {
      setStatus('Не нашли DOI. Вставьте DOI вида 10.1234/example или библиографический список, где он встречается.', 'error');
      input.focus();
      return;
    }
    if (dois.length > MAX_DOIS) {
      setStatus('Найдено ' + dois.length + ' DOI. За один запуск проверяем первые ' + MAX_DOIS + '.', 'error');
      dois = dois.slice(0, MAX_DOIS);
    } else {
      setStatus('Проверяем ' + dois.length + ' DOI в реестре Crossref…');
    }
    run.disabled = true;
    if (share) share.hidden = true;
    pool(dois, lookup, CONCURRENCY).then(function (rows) {
      var found = 0;
      rows.forEach(function (row) {
        if (row.found) {
          found++;
          results.appendChild(renderFound(row.doi, row.item));
        } else {
          results.appendChild(renderReview(row.doi, row.reason));
        }
      });
      setStatus('Готово: записей в Crossref — ' + found + ' из ' + rows.length +
        '. Остальные требуют ручной проверки.', found === rows.length ? 'ok' : '');
      if (share) share.hidden = false;
      if (window.Salon && Salon.visit) Salon.visit.mark('инструмент: проверка doi завершена');
    }).finally(function () {
      run.disabled = false;
    });
  }

  run.addEventListener('click', check);
  input.addEventListener('keydown', function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') check();
  });
  if (sample) sample.addEventListener('click', function () {
    input.value = '10.1016/j.patter.2023.100779\n10.1038/s41586-021-03819-2';
    setStatus('Подставили два примера. Нажмите «Проверить DOI».');
  });
  if (share) share.addEventListener('click', function () {
    var data = {
      title: 'Проверка DOI и источников',
      text: 'Бесплатная проверка DOI по реестру Crossref — без загрузки работы на сайт.',
      url: 'https://akademsalon.ru/proverka-istochnikov-vkr.html'
    };
    if (navigator.share) {
      navigator.share(data).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(data.text + ' ' + data.url).then(function () {
        setStatus('Ссылка на инструмент скопирована.', 'ok');
      });
    }
  });
})();
