(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function normalise(value) {
    return String(value || '')
      .toLocaleLowerCase('ru-RU')
      .replace(/ё/g, 'е')
      .replace(/[«»„“”"'.,:;!?()[\]{}—–\-+/\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(value);
    }
    return new Promise(function (resolve, reject) {
      var area = document.createElement('textarea');
      area.value = value;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand('copy');
        resolve();
      } catch (error) {
        reject(error);
      }
      area.remove();
    });
  }

  var toastTimer;
  function toast(message) {
    var node = document.getElementById('guideToast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'guideToast';
      node.className = 'guide-toast';
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      node.hidden = true;
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { node.hidden = true; }, 2400);
  }

  function sharePage(data) {
    if (navigator.share) {
      return navigator.share(data).catch(function (error) {
        if (error && error.name === 'AbortError') return;
        return copyText(data.url).then(function () { toast('Ссылка скопирована'); });
      });
    }
    return copyText(data.url).then(function () { toast('Ссылка скопирована'); });
  }

  function initKnowledgeHub() {
    var root = document.querySelector('[data-knowledge-hub]');
    if (!root) return;

    document.body.classList.add('kb-page');

    var input = root.querySelector('[data-kb-search]');
    var clears = Array.prototype.slice.call(root.querySelectorAll('[data-kb-clear]'));
    var clear = clears[0];
    var buttons = Array.prototype.slice.call(root.querySelectorAll('[data-kb-topic]'));
    var entries = Array.prototype.slice.call(root.querySelectorAll('[data-guide]'));
    var status = root.querySelector('[data-kb-status]');
    var empty = root.querySelector('[data-kb-empty]');
    var share = root.querySelector('[data-kb-share]');
    var currentTopic = 'all';
    var query = '';

    entries.forEach(function (entry) {
      entry._kbHaystack = normalise([
        entry.dataset.title,
        entry.dataset.summary,
        entry.dataset.aliases,
        entry.dataset.topic,
        entry.textContent
      ].join(' '));
    });

    function labelForCount(number) {
      var d10 = number % 10;
      var d100 = number % 100;
      if (d10 === 1 && d100 !== 11) return 'материал';
      if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return 'материала';
      return 'материалов';
    }

    function updateUrl(mode) {
      var url = new URL(window.location.href);
      if (query) url.searchParams.set('q', query);
      else url.searchParams.delete('q');
      if (currentTopic !== 'all') url.searchParams.set('topic', currentTopic);
      else url.searchParams.delete('topic');
      if (mode === 'push') history.pushState({ q: query, topic: currentTopic }, '', url);
      else history.replaceState({ q: query, topic: currentTopic }, '', url);
    }

    function render(mode) {
      var needle = normalise(query);
      var found = 0;
      entries.forEach(function (entry) {
        var topics = String(entry.dataset.topic || '').split(/\s+/);
        var topicMatch = currentTopic === 'all' || topics.indexOf(currentTopic) !== -1;
        var textMatch = !needle || needle.split(' ').every(function (token) {
          return entry._kbHaystack.indexOf(token) !== -1;
        });
        entry.hidden = !(topicMatch && textMatch);
        if (!entry.hidden) found += 1;
      });

      buttons.forEach(function (button) {
        button.setAttribute('aria-pressed', String(button.dataset.kbTopic === currentTopic));
      });

      if (status) {
        status.textContent = found === entries.length && !query && currentTopic === 'all'
          ? 'В каталоге — ' + found + ' ' + labelForCount(found)
          : 'Найдено — ' + found + ' ' + labelForCount(found);
      }
      if (empty) empty.hidden = found !== 0;
      if (clear) clear.hidden = !query && currentTopic === 'all';
      updateUrl(mode || 'replace');
    }

    function restoreFromUrl() {
      var params = new URLSearchParams(window.location.search);
      query = (params.get('q') || '').trim();
      currentTopic = params.get('topic') || 'all';
      if (!buttons.some(function (button) { return button.dataset.kbTopic === currentTopic; })) {
        currentTopic = 'all';
      }
      if (input) input.value = query;
      render('replace');
    }

    if (input) {
      input.addEventListener('input', function () {
        query = input.value.trim();
        render('replace');
      });
      input.addEventListener('search', function () {
        query = input.value.trim();
        render('replace');
      });
    }

    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        currentTopic = button.dataset.kbTopic || 'all';
        render('push');
      });
    });

    root.querySelectorAll('[data-route-topic]').forEach(function (link) {
      link.addEventListener('click', function () {
        currentTopic = link.dataset.routeTopic || 'all';
        query = '';
        if (input) input.value = '';
        render('push');
        var catalog = document.getElementById('catalog');
        if (catalog) catalog.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    clears.forEach(function (clearButton) {
      clearButton.addEventListener('click', function () {
        query = '';
        currentTopic = 'all';
        if (input) {
          input.value = '';
          input.focus();
        }
        render('push');
      });
    });

    if (share) {
      share.addEventListener('click', function () {
        sharePage({
          title: 'Полезные материалы — Академический Салон',
          text: 'Подборка понятных гайдов по учебной работе, оформлению и защите.',
          url: window.location.href
        });
      });
    }

    document.addEventListener('keydown', function (event) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      var target = event.target;
      if (target && /input|textarea|select/i.test(target.tagName)) return;
      event.preventDefault();
      if (input) input.focus();
    });

    window.addEventListener('popstate', restoreFromUrl);
    restoreFromUrl();
  }

  function slugify(value, used) {
    var map = {
      а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh',
      з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
      п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c',
      ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
    };
    var base = normalise(value).split('').map(function (char) {
      return map[char] !== undefined ? map[char] : char;
    }).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
    var slug = base;
    var index = 2;
    while (used[slug]) slug = base + '-' + index++;
    used[slug] = true;
    return slug;
  }

  function initGuidePage() {
    var article = document.querySelector('.doc-wrap > article.doc');
    if (!article || !/^guide-/.test(location.pathname.split('/').pop() || '')) return;

    document.body.classList.add('guide-enhanced', 'kb-page');
    var h1 = article.querySelector(':scope > h1');
    var subtitle = article.querySelector(':scope > .doc-subtitle');
    var meta = article.querySelector(':scope > .doc-meta');
    if (!h1 || !subtitle || !meta) return;

    var hero = document.createElement('header');
    hero.className = 'guide-hero';
    var kicker = document.createElement('p');
    kicker.className = 'guide-kicker';
    kicker.textContent = 'Практический разбор · читальный зал';
    hero.appendChild(kicker);
    hero.appendChild(h1);
    hero.appendChild(subtitle);
    hero.appendChild(meta);

    var words = article.textContent.trim().split(/\s+/).length;
    var minutes = Math.max(4, Math.round(words / 180));
    meta.textContent = meta.textContent.trim() + ' · ' + minutes + ' мин чтения';

    var actions = document.createElement('div');
    actions.className = 'guide-actions';
    actions.setAttribute('aria-label', 'Действия со статьёй');
    actions.innerHTML =
      '<button type="button" class="guide-action" data-guide-share>↗ Поделиться</button>' +
      '<button type="button" class="guide-action" data-guide-save aria-pressed="false">♡ Сохранить</button>' +
      '<button type="button" class="guide-action" data-guide-print>⌁ Печатать</button>';
    hero.appendChild(actions);
    article.insertBefore(hero, article.firstChild);

    var body = document.createElement('div');
    body.className = 'guide-body';
    Array.prototype.slice.call(article.children).forEach(function (child) {
      if (child !== hero) body.appendChild(child);
    });

    var firstParagraph = body.querySelector(':scope > p');
    if (firstParagraph) {
      var brief = document.createElement('div');
      brief.className = 'guide-brief';
      var briefLabel = document.createElement('span');
      briefLabel.className = 'guide-brief-label';
      briefLabel.textContent = 'Главное за минуту';
      brief.appendChild(briefLabel);
      brief.appendChild(firstParagraph);
      body.insertBefore(brief, body.firstChild);
    }

    var used = {};
    var headings = Array.prototype.slice.call(body.querySelectorAll('h2, h3'));
    headings.forEach(function (heading) {
      if (!heading.id) heading.id = slugify(heading.textContent, used);
      else used[heading.id] = true;
      var anchor = document.createElement('a');
      anchor.className = 'guide-anchor';
      anchor.href = '#' + heading.id;
      anchor.textContent = '#';
      anchor.setAttribute('aria-label', 'Ссылка на раздел «' + heading.textContent.trim() + '»');
      anchor.addEventListener('click', function () {
        window.setTimeout(function () {
          copyText(window.location.href).then(function () { toast('Ссылка на раздел скопирована'); });
        }, 0);
      });
      heading.appendChild(anchor);
    });

    body.querySelectorAll('blockquote').forEach(function (quote) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'guide-copy-quote';
      button.textContent = '⧉';
      button.setAttribute('aria-label', 'Скопировать пример');
      button.addEventListener('click', function () {
        var text = quote.textContent.trim();
        copyText(text + '\n\nИсточник: ' + window.location.href).then(function () {
          toast('Пример скопирован');
        });
      });
      quote.appendChild(button);
    });

    body.querySelectorAll('table').forEach(function (table) {
      var previous = table.previousElementSibling;
      while (previous && !/^H[23]$/.test(previous.tagName)) previous = previous.previousElementSibling;
      var context = previous ? previous.textContent.replace('#', '').trim() : h1.textContent.trim();

      if (!table.querySelector('caption')) {
        var caption = document.createElement('caption');
        caption.textContent = 'Таблица к разделу «' + context + '»';
        caption.style.position = 'absolute';
        caption.style.width = '1px';
        caption.style.height = '1px';
        caption.style.padding = '0';
        caption.style.margin = '-1px';
        caption.style.overflow = 'hidden';
        caption.style.clip = 'rect(0,0,0,0)';
        caption.style.whiteSpace = 'nowrap';
        caption.style.border = '0';
        table.insertBefore(caption, table.firstChild);
      }

      var firstRow = table.rows && table.rows[0];
      if (firstRow && firstRow.querySelector('th') && !table.tHead) {
        var thead = document.createElement('thead');
        table.insertBefore(thead, table.tBodies[0] || table.firstChild);
        thead.appendChild(firstRow);
      }
      table.querySelectorAll('th').forEach(function (cell) {
        if (!cell.hasAttribute('scope')) cell.setAttribute('scope', 'col');
      });

      var shell = document.createElement('div');
      shell.className = 'guide-table-shell';
      shell.setAttribute('role', 'region');
      shell.setAttribute('aria-label', 'Таблица: ' + context);
      shell.setAttribute('tabindex', '0');
      var hint = document.createElement('div');
      hint.className = 'guide-table-hint';
      hint.textContent = 'Листайте таблицу по горизонтали →';
      table.parentNode.insertBefore(shell, table);
      shell.appendChild(hint);
      shell.appendChild(table);
    });

    var toc = document.createElement('details');
    toc.className = 'guide-toc';
    toc.open = window.matchMedia('(min-width: 961px)').matches;
    var tocSummary = document.createElement('summary');
    tocSummary.textContent = 'Содержание статьи';
    toc.appendChild(tocSummary);
    var progress = document.createElement('div');
    progress.className = 'guide-progress';
    progress.setAttribute('aria-hidden', 'true');
    progress.innerHTML = '<span></span>';
    toc.appendChild(progress);
    var list = document.createElement('ol');
    headings.filter(function (heading) { return heading.tagName === 'H2'; }).forEach(function (heading) {
      var item = document.createElement('li');
      var link = document.createElement('a');
      link.href = '#' + heading.id;
      link.textContent = heading.childNodes[0] ? heading.childNodes[0].textContent.trim() : heading.textContent.trim();
      item.appendChild(link);
      list.appendChild(item);
    });
    toc.appendChild(list);

    var reading = document.createElement('div');
    reading.className = 'guide-reading';
    reading.appendChild(body);
    reading.appendChild(toc);
    article.appendChild(reading);

    var canonical = document.querySelector('link[rel="canonical"]');
    var shareUrl = canonical ? canonical.href : window.location.href.split('#')[0];
    actions.querySelector('[data-guide-share]').addEventListener('click', function () {
      sharePage({ title: h1.textContent.trim(), text: subtitle.textContent.trim(), url: shareUrl });
    });
    actions.querySelector('[data-guide-print]').addEventListener('click', function () { window.print(); });

    var saveButton = actions.querySelector('[data-guide-save]');
    var shelfKey = 'salon_reading_shelf';
    var saved = [];
    try { saved = JSON.parse(localStorage.getItem(shelfKey) || '[]'); } catch (error) { saved = []; }
    function renderSaved() {
      var isSaved = saved.indexOf(shareUrl) !== -1;
      saveButton.setAttribute('aria-pressed', String(isSaved));
      saveButton.textContent = isSaved ? '♥ Сохранено' : '♡ Сохранить';
    }
    saveButton.addEventListener('click', function () {
      var index = saved.indexOf(shareUrl);
      if (index === -1) {
        saved.push(shareUrl);
        toast('Материал сохранён на этом устройстве');
      } else {
        saved.splice(index, 1);
        toast('Материал удалён из сохранённых');
      }
      try { localStorage.setItem(shelfKey, JSON.stringify(saved)); } catch (error) {}
      renderSaved();
    });
    renderSaved();

    var tocLinks = Array.prototype.slice.call(toc.querySelectorAll('a'));
    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (items) {
        var visible = items.filter(function (item) { return item.isIntersecting; }).sort(function (a, b) {
          return a.boundingClientRect.top - b.boundingClientRect.top;
        })[0];
        if (!visible) return;
        tocLinks.forEach(function (link) {
          if (link.getAttribute('href') === '#' + visible.target.id) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      }, { rootMargin: '-18% 0px -68% 0px', threshold: 0 });
      headings.filter(function (heading) { return heading.tagName === 'H2'; }).forEach(function (heading) {
        observer.observe(heading);
      });
    }

    var ticking = false;
    function updateProgress() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        var rect = body.getBoundingClientRect();
        var viewport = window.innerHeight || document.documentElement.clientHeight;
        var total = Math.max(1, rect.height - viewport * .55);
        var passed = Math.min(total, Math.max(0, -rect.top + viewport * .22));
        toc.style.setProperty('--guide-progress', String(passed / total));
        ticking = false;
      });
    }
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);
    updateProgress();
  }

  function initJournal() {
    var stage = document.querySelector('[data-kb-journal-stage]');
    if (!stage) return;
    var rail = stage.querySelector('[data-kb-journal]');
    var viewport = stage.querySelector('[data-kb-journal-viewport]');
    var previous = stage.querySelector('[data-kb-journal-prev]');
    var next = stage.querySelector('[data-kb-journal-next]');
    var current = stage.querySelector('[data-kb-journal-index]');
    var total = stage.querySelector('[data-kb-journal-total]');
    var status = stage.querySelector('[data-kb-journal-status]');
    if (!rail || !viewport) return;

    function escapeHtml(value) {
      return String(value == null ? '' : value).replace(/[&<>"]/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char];
      });
    }

    function compactText(value) {
      return String(value || '')
        .replace(/\r/g, '')
        .replace(/https?:\/\/\S+/gi, '')
        .replace(/(^|\s)#[^\s#]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    function shorten(value, limit) {
      var text = String(value || '').replace(/\s+/g, ' ').trim();
      if (text.length <= limit) return text;
      var cut = text.slice(0, limit + 1);
      var space = cut.lastIndexOf(' ');
      if (space > limit * .64) cut = cut.slice(0, space);
      return cut.replace(/[.,:;!?—–-]+$/, '') + '…';
    }

    function postCopy(post) {
      var text = compactText(post.text);
      var lines = text.split('\n').map(function (line) { return line.trim(); }).filter(Boolean);
      var title = (lines.shift() || '').replace(/^[^0-9A-Za-zА-Яа-яЁё]+/, '').trim();
      if (!title) title = 'Лист журнала мастерской';
      var summary = lines.join(' ');
      if (!summary) {
        summary = post.img
          ? 'Наглядный выпуск из канала. Откройте карточку, чтобы рассмотреть материал целиком.'
          : 'Короткая рабочая заметка из мастерской — без пересказа и сокращений.';
      }
      return {
        title: shorten(title, 74),
        summary: shorten(summary, 220)
      };
    }

    function cardHtml(post, index) {
      var copy = postCopy(post);
      var number = post.id ? '№ ' + escapeHtml(post.id) : 'Лист ' + (index + 1);
      var image = post.img
        ? '<img src="' + escapeHtml(post.img) + '" alt="' + escapeHtml(copy.title) +
          '" loading="lazy" decoding="async" />'
        : '<i aria-hidden="true">¶</i>';
      return '<a class="kb-journal-post" href="' +
        escapeHtml(post.url || 'https://t.me/akademsalon') +
        '" target="_blank" rel="noopener" data-goal="tg_channel" data-kb-journal-card>' +
          '<span class="kb-journal-media">' + image +
            '<span class="kb-journal-folio">' + number + '</span></span>' +
          '<span class="kb-journal-copy">' +
            '<span class="kb-journal-meta"><time>' +
              escapeHtml(post.date || 'Новый выпуск') + '</time><em>Telegram</em></span>' +
            '<strong>' + escapeHtml(copy.title) + '</strong>' +
            '<span>' + escapeHtml(copy.summary) + '</span>' +
            '<span class="kb-journal-open">Читать выпуск <i>↗</i></span>' +
          '</span>' +
        '</a>';
    }

    var activeIndex = 0;
    var frame = 0;

    function cards() {
      return Array.prototype.slice.call(rail.querySelectorAll('[data-kb-journal-card]'));
    }

    function cardLeft(card) {
      return card.getBoundingClientRect().left - rail.getBoundingClientRect().left;
    }

    function updateControls(index) {
      var items = cards();
      if (!items.length) return;
      activeIndex = Math.max(0, Math.min(index, items.length - 1));
      items.forEach(function (card, cardIndex) {
        card.classList.toggle('is-current', cardIndex === activeIndex);
      });
      if (current) current.textContent = String(activeIndex + 1).padStart(2, '0');
      if (total) total.textContent = String(items.length).padStart(2, '0');
      if (previous) previous.disabled = activeIndex === 0;
      if (next) next.disabled = activeIndex === items.length - 1;
    }

    function nearestCard() {
      var items = cards();
      if (!items.length) return 0;
      var left = viewport.scrollLeft;
      var nearest = 0;
      var distance = Infinity;
      items.forEach(function (card, index) {
        var delta = Math.abs(cardLeft(card) - left);
        if (delta < distance) {
          distance = delta;
          nearest = index;
        }
      });
      return nearest;
    }

    function syncAfterScroll() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(function () {
        updateControls(nearestCard());
      });
    }

    function goTo(index) {
      var items = cards();
      if (!items.length) return;
      var target = Math.max(0, Math.min(index, items.length - 1));
      viewport.scrollTo({
        left: cardLeft(items[target]),
        behavior: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth'
      });
      updateControls(target);
    }

    if (previous) previous.addEventListener('click', function () { goTo(activeIndex - 1); });
    if (next) next.addEventListener('click', function () { goTo(activeIndex + 1); });
    viewport.addEventListener('scroll', syncAfterScroll, { passive: true });
    viewport.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      goTo(activeIndex + (event.key === 'ArrowRight' ? 1 : -1));
    });
    window.addEventListener('resize', syncAfterScroll, { passive: true });

    function showFallback() {
      viewport.setAttribute('aria-busy', 'false');
      if (status) status.textContent = 'Свежие выпуски — в канале';
      if (current) current.textContent = '01';
      if (total) total.textContent = '01';
    }

    var request;
    if (window.Salon && Salon.api) {
      request = Salon.api.get('/channel');
    } else if (window.fetch) {
      request = window.fetch('/api/channel', { credentials: 'same-origin' }).then(function (response) {
        if (!response.ok) throw new Error('Journal request failed');
        return response.json();
      });
    }
    if (!request) {
      showFallback();
      return;
    }

    request.then(function (response) {
      if (!(response && response.ok && response.posts && response.posts.length)) {
        showFallback();
        return;
      }
      var posts = response.posts.filter(function (post) {
        return post && (String(post.text || '').trim() || post.img);
      }).slice(0, 8);
      if (!posts.length) {
        showFallback();
        return;
      }
      rail.innerHTML = posts.map(cardHtml).join('');
      viewport.setAttribute('aria-busy', 'false');
      if (status) status.textContent = 'Обновлено из Telegram';
      rail.querySelectorAll('img').forEach(function (image) {
        image.addEventListener('error', function () {
          image.closest('.kb-journal-media').classList.add('is-image-missing');
          image.remove();
        });
      });
      updateControls(0);
    }).catch(showFallback);
  }

  function fixResponsiveBrandNames() {
    document.querySelectorAll('a.brand[aria-label]').forEach(function (brand) {
      brand.removeAttribute('aria-label');
      var shortName = brand.querySelector('.b-short[aria-hidden="true"]');
      if (shortName) shortName.removeAttribute('aria-hidden');
    });
  }

  ready(function () {
    fixResponsiveBrandNames();
    initKnowledgeHub();
    initGuidePage();
    initJournal();
  });
})();
