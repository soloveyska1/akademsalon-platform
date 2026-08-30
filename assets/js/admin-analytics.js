(function adminAnalytics() {
  'use strict';

  try {
    var theme = localStorage.getItem('salon_theme');
    if (!theme && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) theme = 'dark';
    if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  } catch (ignoreTheme) {}

  var S = window.Salon;
  var state = {
    hours: 168,
    source: '',
    device: '',
    page: '',
    bots: false,
    overview: null,
    sessions: [],
    cursor: null,
    appliedQuery: null,
    lastSuccess: '',
    accessDenied: false,
    generation: 0,
    controller: null,
    moreController: null,
    detailController: null,
    choices: { sources: {}, devices: {}, pages: {} }
  };
  var nf = new Intl.NumberFormat('ru-RU');
  var dtf = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  var tf = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  var SOURCE_LABELS = {
    yandex: 'Поиск · Яндекс', google: 'Поиск · Google', bing: 'Поиск · Bing',
    telegram: 'Социальная сеть · Telegram', vk: 'Социальная сеть · ВКонтакте',
    mailru: 'Переход · Mail.ru', external: 'Другой сайт', direct: 'Прямой переход',
    unknown: 'Источник неизвестен'
  };
  var DEVICE_LABELS = {
    desktop: 'Компьютер', phone: 'Телефон', tablet: 'Планшет', robot: 'Робот', unknown: 'Не определено'
  };
  var BROWSER_LABELS = {
    yandex: 'Яндекс.Браузер', chrome: 'Chrome', safari: 'Safari', firefox: 'Firefox',
    edge: 'Edge', opera: 'Opera', other: 'Другой браузер'
  };
  var OS_LABELS = {
    ios: 'iOS / iPadOS', android: 'Android', windows: 'Windows', macos: 'macOS',
    linux: 'Linux', other: 'Другая система'
  };
  var ERROR_LABELS = {
    type_error: 'Ошибка типа', reference_error: 'Неизвестная ссылка в коде',
    syntax_error: 'Синтаксическая ошибка', security_error: 'Ограничение безопасности',
    network_error: 'Сетевая ошибка', runtime_error: 'Другая ошибка выполнения'
  };
  var SERVICE_LABELS = {
    pl: 'План работы', ai: 'Редактура после ИИ', rv: 'Разбор замечаний',
    tu: 'Индивидуальное сопровождение', nm: 'Нормоконтроль', df: 'Подготовка к защите',
    k0: 'Комиссия 0%', dp: 'Пакет для защиты', au: 'Авторский заказ'
  };
  var CTA_LABELS = {
    telegram_bot: 'Telegram-бот', telegram_human: 'Связь с мастером в Telegram',
    telegram_channel: 'Telegram-канал', contact_sheet: 'Карточка контакта',
    configurator: 'Конфигуратор', calculator: 'Калькулятор',
    step_1: 'Шаг 1', step_2: 'Шаг 2', step_3: 'Шаг 3', step_4: 'Шаг 4',
    server_rejected: 'Сервер отклонил отправку', request_conflict: 'Конфликт повторной отправки',
    network_fallback: 'Запасной путь при сбое сети', page_context: 'Контекст страницы',
    home_editorial_desk: 'Редакторская на главной', research_case: 'Разбор ситуации',
    commission_zero: 'Комиссия 0%', work_turn: 'Работа по очереди',
    work_vip: 'Приоритетная работа', work_base: 'Базовый вариант'
  };
  var VARIANT_LABELS = {
    text: 'Текст', comments: 'Комментарии', defense: 'Защита', open: 'Открытие',
    close: 'Закрытие', free: 'Бесплатный маршрут', configurator: 'Конфигуратор'
  };

  function byId(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }
  function number(value) { return nf.format(Number(value || 0)); }
  function percent(value) { return nf.format(Number(value || 0)) + '%'; }
  function plural(value, forms) {
    var n = Math.abs(Math.round(Number(value || 0))) % 100;
    var tail = n % 10;
    var form = n > 10 && n < 20 ? forms[2] : tail === 1 ? forms[0] : tail > 1 && tail < 5 ? forms[1] : forms[2];
    return number(value) + ' ' + form;
  }
  function dateTime(value) {
    if (!value) return '—';
    var date = new Date(value);
    return isNaN(date.getTime()) ? '—' : dtf.format(date) + ' МСК';
  }
  function timeOnly(value) {
    if (!value) return '—';
    var date = new Date(value);
    return isNaN(date.getTime()) ? '—' : tf.format(date) + ' МСК';
  }
  function duration(seconds) {
    seconds = Math.max(0, Number(seconds || 0));
    if (seconds < 60) return Math.round(seconds) + ' сек';
    if (seconds < 3600) return Math.round(seconds / 60) + ' мин';
    return (seconds / 3600).toFixed(seconds < 7200 ? 1 : 0).replace('.', ',') + ' ч';
  }
  function pageLabel(page) {
    var labels = state.overview && state.overview.labels && state.overview.labels.pages;
    return (labels && labels[page]) || 'Неизвестная страница';
  }
  function eventLabel(event) {
    var labels = state.overview && state.overview.labels && state.overview.labels.events;
    return (labels && labels[event]) || 'Неизвестное событие';
  }
  function ctaLabel(cta) {
    if (CTA_LABELS[cta]) return CTA_LABELS[cta];
    var service = String(cta || '').match(/^(?:configurator:|service:|svc_)([a-z0-9]+)$/);
    if (service && SERVICE_LABELS[service[1]]) return SERVICE_LABELS[service[1]];
    return 'Другая кнопка';
  }
  function variantLabel(variant) {
    if (VARIANT_LABELS[variant]) return VARIANT_LABELS[variant];
    var experiment = String(variant || '').match(/^r1_([a-z0-9_-]+)$/);
    return experiment ? 'Эксперимент · ' + experiment[1].replace(/[_-]+/g, ' ') : 'Другой вариант';
  }
  function sourceLabel(source) {
    source = source || {};
    if (source.kind === 'campaign') {
      var readable = function (value) { return String(value || '').replace(/[_-]+/g, ' '); };
      var parts = ['Кампания · источник: ' + readable(source.name || 'не указан')];
      if (source.medium) parts.push('канал: ' + readable(source.medium));
      if (source.campaign) parts.push('название: ' + readable(source.campaign));
      return parts.join(' · ');
    }
    return SOURCE_LABELS[source.name] || 'Источник неизвестен';
  }
  function geoLabel(geo) {
    geo = geo || {};
    return [geo.city, geo.region, geo.country].filter(Boolean).join(' · ') || 'Регион не определён';
  }
  function emptyRow(columns, text) {
    return '<tr><td colspan="' + columns + '"><p class="aa-empty">' + esc(text) + '</p></td></tr>';
  }
  function setMessage(text, tone) {
    var box = byId('message');
    if (!text) { box.hidden = true; box.textContent = ''; box.removeAttribute('data-tone'); return; }
    box.hidden = false;
    box.textContent = text;
    if (tone) box.setAttribute('data-tone', tone); else box.removeAttribute('data-tone');
  }
  function requestState() {
    return {
      hours: state.hours, source: state.source, device: state.device,
      page: state.page, bots: state.bots
    };
  }
  function cloneQuery(values) {
    values = values || {};
    return Object.freeze({
      hours: Number(values.hours) || 168,
      source: String(values.source || ''),
      device: String(values.device || ''),
      page: String(values.page || ''),
      bots: !!values.bots
    });
  }
  function query(extra, values) {
    values = values || state;
    var params = new URLSearchParams();
    params.set('hours', String(values.hours));
    if (values.source) params.set('source', values.source);
    if (values.device) params.set('device', values.device);
    if (values.page) params.set('page', values.page);
    if (values.bots) params.set('bots', '1');
    Object.keys(extra || {}).forEach(function (key) {
      if (extra[key] != null && extra[key] !== '') params.set(key, String(extra[key]));
    });
    return params.toString();
  }
  function periodName(hours) {
    hours = Number(hours || state.hours);
    return { 24: '24 часа', 168: '7 дней', 720: '30 дней', 2160: '90 дней' }[hours] || hours + ' ч';
  }

  function renderMetrics(data) {
    var metrics = data.metrics || {};
    var cards = [
      ['Анонимные посетители', number(metrics.visitors), 'Случайные браузерные идентификаторы'],
      ['Сессии', number(metrics.sessions), 'Пауза более 30 минут создаёт новую'],
      ['Просмотры страниц', number(metrics.pageviews), 'Только канонические адреса без параметров'],
      ['Успешные заявки', number(metrics.converted_sessions), 'Факт успеха без номера и контакта'],
      ['Конверсия сессий', percent(metrics.session_conversion_pct), 'Не может превышать 100%'],
      ['Осмысленно продолжили', number(metrics.engaged_sessions),
        percent(metrics.engaged_from_config_pct) + ' от открывших конфигуратор · выбор или ввод'],
      ['Дошли до контакта', number(metrics.contact_step_sessions),
        percent(metrics.contact_from_config_pct) + ' от открывших конфигуратор · диагностический этап'],
      ['Средняя глубина', number(metrics.avg_pageviews), 'Просмотров на одну сессию']
    ];
    byId('metricCards').innerHTML = cards.map(function (card) {
      return '<article class="aa-metric"><span class="aa-metric__label">' + esc(card[0]) +
        '</span><strong class="aa-metric__value">' + esc(card[1]) +
        '</strong><span class="aa-metric__note">' + esc(card[2]) + '</span></article>';
    }).join('');
  }

  function bucketLabel(value) {
    value = String(value || '');
    var day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (day) return day[3] + '.' + day[2];
    var hour = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):00$/.exec(value);
    if (hour) return hour[3] + '.' + hour[2] + ' · ' + hour[4] + ':00';
    return value;
  }
  function renderTrend(data) {
    var rows = data.trend || [];
    byId('trendRows').innerHTML = rows.length ? rows.map(function (row) {
      return '<tr><td>' + esc(bucketLabel(row.bucket)) + '</td><td>' + number(row.visitors) +
        '</td><td>' + number(row.sessions) + '</td><td>' + number(row.pageviews) +
        '</td><td>' + number(row.conversions) + '</td></tr>';
    }).join('') : emptyRow(5, 'В новой серии пока нет событий за этот период.');
    var chart = byId('trendChart');
    if (!rows.length) { chart.innerHTML = '<p class="aa-empty">График появится после первого принятого события.</p>'; return; }
    var width = 720, height = 220, left = 36, right = 12, top = 20, bottom = 34;
    var max = Math.max(1, ...rows.map(function (row) { return Math.max(row.sessions || 0, row.conversions || 0); }));
    var x = function (index) { return left + (rows.length === 1 ? (width - left - right) / 2 : index * (width - left - right) / (rows.length - 1)); };
    var y = function (value) { return top + (max - value) * (height - top - bottom) / max; };
    function line(key) {
      return rows.map(function (row, index) { return (index ? 'L' : 'M') + x(index).toFixed(1) + ' ' + y(row[key] || 0).toFixed(1); }).join(' ');
    }
    var grid = [0, .25, .5, .75, 1].map(function (part) {
      var py = top + part * (height - top - bottom);
      var label = Math.round(max * (1 - part));
      return '<line class="aa-chart-grid" x1="' + left + '" x2="' + (width - right) + '" y1="' + py + '" y2="' + py + '"></line>' +
        '<text class="aa-chart-label" x="2" y="' + (py + 4) + '">' + label + '</text>';
    }).join('');
    var labelStep = Math.max(1, Math.ceil(rows.length / 6));
    var labels = rows.map(function (row, index) {
      if (index % labelStep && index !== rows.length - 1) return '';
      return '<text class="aa-chart-label" text-anchor="middle" x="' + x(index) + '" y="' + (height - 7) + '">' + esc(bucketLabel(row.bucket)) + '</text>';
    }).join('');
    var dots = rows.map(function (row, index) {
      return '<circle class="aa-chart-dot" cx="' + x(index) + '" cy="' + y(row.sessions || 0) + '" r="3"></circle>' +
        '<circle class="aa-chart-dot aa-chart-dot--conversion" cx="' + x(index) + '" cy="' + y(row.conversions || 0) + '" r="3"></circle>';
    }).join('');
    chart.innerHTML = '<div class="aa-chart-legend"><span>Сессии</span><span>Успешные заявки</span></div>' +
      '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Динамика сессий и успешных заявок за ' + esc(periodName()) + '">' +
      '<title>Динамика сессий и успешных заявок</title>' + grid +
      '<path class="aa-chart-line" d="' + line('sessions') + '"></path>' +
      '<path class="aa-chart-conversion" d="' + line('conversions') + '"></path>' + dots + labels + '</svg>';
  }

  function renderSources(data) {
    var rows = data.sources || [];
    byId('sourceRows').innerHTML = rows.length ? rows.map(function (row) {
      var label = sourceLabel({ kind: row.kind, name: row.name, medium: row.medium, campaign: row.campaign });
      return '<tr><td><span class="aa-row-main">' + esc(label) + '</span></td><td>' + number(row.sessions) +
        '</td><td>' + number(row.visitors) + '</td><td>' + number(row.conversions) + '</td></tr>';
    }).join('') : emptyRow(4, 'Источники пока не определены.');
    var geo = data.geo || [];
    byId('geoRows').innerHTML = geo.length ? geo.map(function (row) {
      return '<tr><td>' + esc(geoLabel(row)) + '</td><td>' + number(row.sessions) +
        '</td><td>' + number(row.visitors) + '</td></tr>';
    }).join('') : emptyRow(3, 'Приблизительный регион пока не определён. Остальные отчёты продолжают работать.');
  }
  function renderBars(id, rows, labels) {
    rows = rows || [];
    var total = rows.reduce(function (sum, row) { return sum + Number(row.sessions || 0); }, 0);
    var target = byId(id);
    target.innerHTML = rows.length ? rows.map(function (row) {
      var share = total ? row.sessions * 100 / total : 0;
      return '<div class="aa-bar"><div class="aa-bar__head"><span>' + esc(labels[row.name] || 'Не определено') +
        '</span><strong>' + number(row.sessions) + ' · ' + percent(share.toFixed(1)) +
        '</strong></div><div class="aa-bar__track" role="img" aria-label="' + esc(labels[row.name] || 'Не определено') + ': ' +
        esc(percent(share.toFixed(1))) + '"><progress class="aa-bar__fill" max="100" value="' +
        Math.max(0, Math.min(100, share)) + '"></progress></div></div>';
    }).join('') : '<p class="aa-empty">Данных пока нет.</p>';
  }

  function renderPages(data) {
    var pages = data.pages || [];
    byId('pageRows').innerHTML = pages.length ? pages.map(function (row) {
      return '<tr><td><span class="aa-row-main">' + esc(pageLabel(row.page)) + '</span><span class="aa-row-sub">' +
        esc(row.page) + '</span></td><td>' + number(row.views) + '</td><td>' + number(row.entries) +
        '</td><td>' + number(row.exits) + '</td><td>' + number(row.conversions) + '</td></tr>';
    }).join('') : emptyRow(5, 'Просмотров страниц пока нет.');
    var transitions = data.transitions || [];
    byId('transitionRows').innerHTML = transitions.length ? transitions.map(function (row) {
      return '<tr><td>' + esc(pageLabel(row.from_page)) + '</td><td>' + esc(pageLabel(row.to_page)) +
        '</td><td>' + number(row.transitions) + '</td></tr>';
    }).join('') : emptyRow(3, 'Для перехода нужны хотя бы два просмотра в одной сессии.');
  }

  function renderFunnel(data) {
    var steps = data.funnel || [];
    byId('funnelSteps').innerHTML = steps.length ? steps.map(function (step, index) {
      var note = index ? percent(step.from_previous_pct) + ' от прошлого этапа' : 'Начало измеренного пути';
      return '<article class="aa-funnel__step"><span class="aa-funnel__index">Шаг ' + (index + 1) +
        '</span><strong class="aa-funnel__value">' + number(step.sessions) +
        '</strong><span class="aa-funnel__label">' + esc(step.label) +
        '</span><span class="aa-funnel__drop">' + esc(note) + '</span></article>';
    }).join('') : '<p class="aa-empty">Воронка появится после первого просмотра.</p>';
    var events = data.events || [];
    byId('eventRows').innerHTML = events.length ? events.map(function (row) {
      return '<tr><td>' + esc(eventLabel(row.event)) + '</td><td>' + number(row.events) +
        '</td><td>' + number(row.sessions) + '</td></tr>';
    }).join('') : emptyRow(3, 'Событий пока нет.');
    var errors = data.errors || [];
    byId('errorRows').innerHTML = errors.length ? errors.map(function (row) {
      return '<tr><td>' + esc(ERROR_LABELS[row.error_type] || 'Другая ошибка') +
        '<span class="aa-row-sub">' + esc(BROWSER_LABELS[row.browser] || 'Другой браузер') + ' · ' + esc(row.release) +
        '</span></td><td>' + esc(pageLabel(row.page)) + '</td><td>' + number(row.errors) +
        '</td><td>' + esc(dateTime(row.last_at)) + '</td></tr>';
    }).join('') : emptyRow(4, 'Технических ошибок в новой серии не зафиксировано.');
  }

  function renderQuality(data) {
    var health = data.health || {};
    var quality = data.quality || {};
    var cards = [
      ['Версия схемы', 'v' + number(data.schema_version), 'Одинакова у сайта, сервера и панели'],
      ['Принято', number(health.accepted), 'Новые записанные события'],
      ['Повторы', number(health.duplicate), 'Не увеличили показатели'],
      ['Отклонено', number(health.invalid), 'Не прошло строгий контракт'],
      ['Ограничено', number(health.rate_limited), 'Остановлено лимитом нагрузки'],
      ['Регион определён', percent(quality.geo_defined_pct), 'Пустое значение честно остаётся неизвестным']
    ];
    byId('qualityCards').innerHTML = cards.map(function (card) {
      return '<article class="aa-quality-card"><span class="aa-quality-card__label">' + esc(card[0]) +
        '</span><strong class="aa-quality-card__value">' + esc(card[1]) +
        '</strong><span class="aa-quality-card__note">' + esc(card[2]) + '</span></article>';
    }).join('');
    var fresh = byId('freshnessState');
    if (!quality.latest_event_at) {
      fresh.textContent = 'Новая серия пока пуста · полнота неизвестна';
    } else if (quality.data_delay_seconds <= 180) {
      fresh.textContent = 'Свежие данные · задержка ' + duration(quality.data_delay_seconds);
    } else {
      fresh.textContent = 'Последнее событие ' + dateTime(quality.latest_event_at);
    }
    setFreshnessTone(quality.latest_event_at && quality.data_delay_seconds > 180 ? 'stale' : '');
  }

  function renderSessions(items, append) {
    if (!append) state.sessions = [];
    state.sessions = state.sessions.concat(items || []);
    var rows = state.sessions;
    byId('sessionRows').innerHTML = rows.length ? rows.map(function (row) {
      var route = pageLabel(row.entry_page) + ' → ' + pageLabel(row.exit_page);
      var device = DEVICE_LABELS[row.device] || 'Не определено';
      var result = row.converted
        ? '<span class="aa-result aa-result--yes">✓ Заявка</span>'
        : '<span class="aa-result aa-result--no">Без заявки</span>';
      return '<tr><td><span class="aa-row-main">' + esc(dateTime(row.last_at)) +
        '</span><span class="aa-row-sub">' + esc(row.session_label) + ' · ' + esc(duration(row.duration_s)) +
        (row.active ? ' · сейчас активен' : '') + '</span></td><td>' + esc(row.visitor_label) +
        '</td><td>' + esc(sourceLabel(row.source)) + '</td><td><span class="aa-row-main">' + esc(route) +
        '</span><span class="aa-row-sub">' + plural(row.pageviews, ['просмотр', 'просмотра', 'просмотров']) + ' · ' +
        plural(row.event_count, ['событие', 'события', 'событий']) +
        '</span></td><td>' + esc(device + ' · ' + (BROWSER_LABELS[row.browser] || 'Другой браузер')) +
        '<span class="aa-row-sub">' + esc(geoLabel(row.geo)) + '</span></td><td>' + result +
        '</td><td><button type="button" class="aa-session-button" data-session="' + esc(row.session_id) +
        '" aria-label="Открыть путь ' + esc(row.session_label) + '">Путь</button></td></tr>';
    }).join('') : emptyRow(7, 'В новой серии пока нет сессий за этот период.');
    var online = rows.filter(function (row) { return row.active; });
    var onlineTotal = Number((state.overview.metrics || {}).online || 0);
    byId('onlineCount').textContent = number(onlineTotal);
    var navOnline = byId('navOnlineCount');
    if (navOnline) {
      navOnline.textContent = number(onlineTotal);
      navOnline.hidden = onlineTotal < 1;
    }
    byId('onlineList').innerHTML = online.length
      ? '<div class="aa-online-cards">' + online.map(function (row) {
        return '<article class="aa-online-card"><strong>' + esc(row.visitor_label) + ' · ' + esc(row.session_label) +
          '</strong><span class="aa-row-sub">' + esc(pageLabel(row.exit_page)) + ' · ' + esc(sourceLabel(row.source)) +
          '</span><span class="aa-row-sub">Последнее событие ' + esc(timeOnly(row.last_at)) + '</span></article>';
      }).join('') + '</div>'
      : '<p class="aa-empty">Сейчас активных сессий не видно.</p>';
  }

  function rememberChoices(data) {
    (data.sources || []).forEach(function (row) {
      state.choices.sources[row.name] = sourceLabel({ kind: row.kind, name: row.name, medium: row.medium, campaign: row.campaign });
    });
    (data.devices || []).forEach(function (row) { state.choices.devices[row.name] = DEVICE_LABELS[row.name] || row.name; });
    Object.keys((data.labels || {}).pages || {}).forEach(function (page) { state.choices.pages[page] = data.labels.pages[page]; });
  }
  function fillSelect(id, first, values, selected) {
    var select = byId(id);
    select.innerHTML = '<option value="">' + esc(first) + '</option>' + Object.keys(values).sort(function (a, b) {
      return values[a].localeCompare(values[b], 'ru');
    }).map(function (value) {
      return '<option value="' + esc(value) + '"' + (value === selected ? ' selected' : '') + '>' + esc(values[value]) + '</option>';
    }).join('');
  }
  function responseHours(data) {
    return Number(data && data.period && data.period.hours);
  }
  function periodMatches(data, hours) {
    return responseHours(data) === Number(hours);
  }
  function setFreshnessTone(tone) {
    var box = byId('freshnessState');
    var wrap = box && box.parentElement;
    if (!wrap) return;
    wrap.classList.toggle('is-stale', tone === 'stale');
    wrap.classList.toggle('is-error', tone === 'error');
  }
  function setBusy(busy) {
    var body = byId('agBody');
    if (body) body.setAttribute('aria-busy', String(!!busy));
  }
  function showWorkspace() {
    state.accessDenied = false;
    byId('loadingState').hidden = true;
    byId('accessDenied').hidden = true;
    byId('analyticsWorkspace').hidden = false;
  }
  function clearRenderedData() {
    [
      'metricCards', 'trendChart', 'trendRows', 'sourceRows', 'geoRows',
      'deviceBars', 'browserBars', 'osBars', 'pageRows', 'transitionRows',
      'funnelSteps', 'eventRows', 'errorRows', 'sessionRows', 'qualityCards',
      'onlineList', 'sessionDetail'
    ].forEach(function (id) {
      var node = byId(id);
      if (node) node.innerHTML = '';
    });
    state.overview = null;
    state.sessions = [];
    state.cursor = null;
    state.appliedQuery = null;
    state.lastSuccess = '';
    var navOnline = byId('navOnlineCount');
    if (navOnline) {
      navOnline.textContent = '0';
      navOnline.hidden = true;
    }
  }
  function showAccessDenied() {
    state.generation += 1;
    [state.controller, state.moreController, state.detailController].forEach(function (controller) {
      if (controller && controller.abort) controller.abort();
    });
    state.controller = null;
    state.moreController = null;
    state.detailController = null;
    state.accessDenied = true;
    clearRenderedData();
    setMobileMenu(false, false);
    var dialog = byId('sessionDialog');
    if (dialog.open && dialog.close) dialog.close();
    byId('loadingState').hidden = true;
    byId('analyticsWorkspace').hidden = true;
    byId('analyticsContent').hidden = true;
    byId('accessDenied').hidden = false;
    byId('refreshButton').disabled = true;
    byId('updatedAt').textContent = 'Доступ закрыт';
    byId('freshnessState').textContent = 'Нужен вход мастера';
    setFreshnessTone('error');
    setBusy(false);
    var accessAction = byId('accessDenied').querySelector('a[href]');
    if (accessAction && accessAction.focus) accessAction.focus({ preventScroll: true });
  }
  function applyQueryToControls(values) {
    if (!values) return;
    state.hours = values.hours;
    state.source = values.source;
    state.device = values.device;
    state.page = values.page;
    state.bots = values.bots;
    fillSelect('sourceFilter', 'Все источники', state.choices.sources, values.source);
    fillSelect('deviceFilter', 'Все устройства', state.choices.devices, values.device);
    fillSelect('pageFilter', 'Все страницы', state.choices.pages, values.page);
    byId('botsFilter').checked = values.bots;
    document.querySelectorAll('[data-hours]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(Number(button.getAttribute('data-hours')) === values.hours));
    });
  }
  function restoreAppliedControls() {
    if (state.appliedQuery) applyQueryToControls(state.appliedQuery);
  }
  function markPending() {
    byId('freshnessState').textContent = state.lastSuccess
      ? 'Обновляем… пока показаны данные от ' + dateTime(state.lastSuccess)
      : 'Обновляем данные…';
    byId('updatedAt').textContent = 'Обновляем…';
    setFreshnessTone('');
  }
  function markStale(label) {
    byId('freshnessState').textContent = state.lastSuccess
      ? 'Показаны старые данные · обновление не удалось'
      : (label || 'Данные не загружены');
    byId('updatedAt').textContent = state.lastSuccess
      ? 'Последнее обновление ' + dateTime(state.lastSuccess)
      : 'Не обновлено';
    setFreshnessTone(state.lastSuccess ? 'stale' : 'error');
  }
  function renderAll(data, sessionData, requested) {
    var serverHours = responseHours(data);
    var applied = cloneQuery({
      hours: serverHours,
      source: requested.source,
      device: requested.device,
      page: requested.page,
      bots: requested.bots
    });
    state.overview = data;
    state.appliedQuery = applied;
    state.cursor = sessionData.next_cursor || null;
    rememberChoices(data);
    renderMetrics(data);
    renderTrend(data);
    renderSources(data);
    renderBars('deviceBars', data.devices, DEVICE_LABELS);
    renderBars('browserBars', data.browsers, BROWSER_LABELS);
    renderBars('osBars', data.operating_systems, OS_LABELS);
    renderPages(data);
    renderFunnel(data);
    renderQuality(data);
    renderSessions(sessionData.items || [], false);
    applyQueryToControls(applied);
    byId('periodCaption').textContent = 'За ' + periodName(serverHours) + ' · МСК';
    byId('loadMore').hidden = !state.cursor;
    byId('loadMore').disabled = false;
    byId('analyticsContent').hidden = false;
    state.lastSuccess = data.generated_at;
    byId('updatedAt').textContent = 'Обновлено ' + dateTime(data.generated_at);
    showWorkspace();
    setMessage('Данные рассчитаны сервером целиком за ' + periodName(serverHours) +
      '. Охват неизвестен: учитывается только согласившаяся выборка.');
  }

  function loadAll() {
    if (!S || !S.api) { setMessage('Не удалось запустить защищённый доступ к аналитике.', 'error'); return; }
    var requested = cloneQuery(requestState());
    var generation = ++state.generation;
    if (state.controller) state.controller.abort();
    if (state.moreController) state.moreController.abort();
    if (state.detailController) state.detailController.abort();
    state.controller = typeof AbortController === 'function' ? new AbortController() : null;
    state.moreController = null;
    state.detailController = null;
    state.cursor = null;
    var signal = state.controller ? state.controller.signal : undefined;
    var dialog = byId('sessionDialog');
    if (dialog.open && dialog.close) dialog.close();
    setMessage('Загружаем полные серверные агрегаты…');
    markPending();
    setBusy(true);
    byId('refreshButton').disabled = true;
    byId('loadMore').disabled = true;
    byId('loadMore').hidden = true;
    Promise.all([
      S.api.get('/admin/analytics/overview?' + query({}, requested), { signal: signal }),
      S.api.get('/admin/analytics/sessions?' + query({ limit: 100 }, requested), { signal: signal })
    ]).then(function (responses) {
      if (generation !== state.generation) return;
      var overview = responses[0], sessions = responses[1];
      if ((overview && overview.error === 'forbidden') || (sessions && sessions.error === 'forbidden')) {
        showAccessDenied();
        return;
      }
      if (!overview || !overview.ok || !sessions || !sessions.ok) {
        showWorkspace();
        restoreAppliedControls();
        var stale = state.lastSuccess ? ' Последние успешно загруженные данные: ' + dateTime(state.lastSuccess) + '.' : '';
        setMessage('Сервер аналитики сейчас не ответил.' + stale + ' Нули не подставлены — попробуйте ещё раз.', 'error');
        markStale();
        return;
      }
      if (!periodMatches(overview, requested.hours) || !periodMatches(sessions, requested.hours)) {
        showWorkspace();
        restoreAppliedControls();
        setMessage('Сервер вернул данные за другой период. Экран не обновлён, чтобы не смешивать цифры.', 'error');
        markStale('Период ответа не совпал');
        return;
      }
      renderAll(overview, sessions, requested);
    }).catch(function () {
      if (generation !== state.generation) return;
      showWorkspace();
      restoreAppliedControls();
      var stale = state.lastSuccess ? ' Последние успешно загруженные данные: ' + dateTime(state.lastSuccess) + '.' : '';
      setMessage('Нет связи с аналитикой.' + stale + ' Показанные ранее цифры не обновлялись.', 'error');
      markStale();
    }).finally(function () {
      if (generation !== state.generation) return;
      state.controller = null;
      setBusy(false);
      byId('refreshButton').disabled = state.accessDenied;
      byId('loadMore').disabled = !state.cursor || state.accessDenied;
      byId('loadMore').hidden = !state.cursor || state.accessDenied;
    });
  }

  function loadMore() {
    if (!state.cursor || !state.appliedQuery || state.accessDenied) return;
    var generation = state.generation;
    var requested = state.appliedQuery;
    var cursor = state.cursor;
    if (state.moreController) state.moreController.abort();
    state.moreController = typeof AbortController === 'function' ? new AbortController() : null;
    var controller = state.moreController;
    byId('loadMore').disabled = true;
    S.api.get('/admin/analytics/sessions?' + query({ limit: 100, cursor: cursor }, requested), {
      signal: controller ? controller.signal : undefined
    }).then(function (result) {
      if (generation !== state.generation || cursor !== state.cursor) return;
      if (result && result.error === 'forbidden') {
        showAccessDenied();
        return;
      }
      if (!result || !result.ok) { setMessage('Следующую страницу сессий загрузить не удалось.', 'error'); return; }
      if (!periodMatches(result, requested.hours)) {
        setMessage('Следующая страница относится к другому периоду и не была добавлена.', 'error');
        return;
      }
      state.cursor = result.next_cursor || null;
      renderSessions(result.items || [], true);
      byId('loadMore').hidden = !state.cursor;
    }).finally(function () {
      if (generation !== state.generation || state.moreController !== controller) return;
      state.moreController = null;
      byId('loadMore').disabled = state.accessDenied || !state.cursor;
      byId('loadMore').hidden = state.accessDenied || !state.cursor;
    });
  }

  function openSession(sessionId) {
    if (!state.appliedQuery || state.accessDenied) return;
    var generation = state.generation;
    var requested = state.appliedQuery;
    if (state.detailController) state.detailController.abort();
    state.detailController = typeof AbortController === 'function' ? new AbortController() : null;
    var controller = state.detailController;
    var dialog = byId('sessionDialog');
    byId('sessionDetail').innerHTML = '<p class="aa-empty">Загружаем безопасную временную шкалу…</p>';
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
    S.api.get('/admin/analytics/session/' + encodeURIComponent(sessionId) + '?hours=' +
      encodeURIComponent(requested.hours), { signal: controller ? controller.signal : undefined }).then(function (detail) {
      if (generation !== state.generation || state.detailController !== controller) return;
      if (detail && detail.error === 'forbidden') {
        showAccessDenied();
        return;
      }
      if (!detail || !detail.ok) {
        byId('sessionDetail').innerHTML = '<p class="aa-empty">Путь сессии сейчас недоступен.</p>';
        return;
      }
      if (!periodMatches(detail, requested.hours)) {
        byId('sessionDetail').innerHTML = '<p class="aa-empty">Период сессии не совпал с отчётом. Обновите экран.</p>';
        return;
      }
      byId('sessionDialogTitle').textContent = 'Путь ' + detail.session_label;
      var summary = [
        ['Посетитель', detail.visitor_label],
        ['Начало', dateTime(detail.started_at)],
        ['Длительность', duration(detail.duration_s)],
        ['Источник', sourceLabel(detail.source)],
        ['Устройство', (DEVICE_LABELS[detail.device] || 'Не определено') + ' · ' + (BROWSER_LABELS[detail.browser] || 'Другой браузер')],
        ['Регион', geoLabel(detail.geo)]
      ];
      var events = detail.events || [];
      byId('sessionDetail').innerHTML = '<div class="aa-detail-summary">' + summary.map(function (item) {
        return '<div class="aa-detail-item"><span>' + esc(item[0]) + '</span><strong>' + esc(item[1]) + '</strong></div>';
      }).join('') + '</div><h3>Временная шкала</h3><ol class="aa-timeline">' + (events.length ? events.map(function (event) {
        var details = [];
        if (event.cta_id) details.push('Кнопка: ' + ctaLabel(event.cta_id));
        if (event.variant) details.push('Вариант: ' + variantLabel(event.variant));
        if (event.error_type) details.push('Ошибка: ' + (ERROR_LABELS[event.error_type] || 'Другая ошибка'));
        return '<li><strong>' + esc(eventLabel(event.event)) + '</strong><span class="aa-row-sub">' +
          esc(pageLabel(event.page)) + (details.length ? ' · ' + esc(details.join(' · ')) : '') +
          '</span><time datetime="' + esc(event.occurred_at) + '">' + esc(dateTime(event.occurred_at)) + '</time></li>';
      }).join('') : '<li><span class="aa-row-sub">Событий нет.</span></li>') + '</ol>';
    }).finally(function () {
      if (state.detailController === controller) state.detailController = null;
    });
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
  function syncThemeControls() {
    var action = currentTheme() === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему';
    document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
      button.setAttribute('aria-label', action);
    });
    document.querySelectorAll('[data-theme-action], [data-theme-copy]').forEach(function (node) {
      node.textContent = action;
    });
  }
  function toggleTheme() {
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    if (next === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('salon_theme', next); } catch (ignoreStore) {}
    syncThemeControls();
  }

  function syncMasterIdentity(session) {
    var user = session && session.user || {};
    var name = String(user.name || 'мастер').trim() || 'мастер';
    var initials = name.split(/\s+/).slice(0, 2).map(function (part) { return part.charAt(0); }).join('').toUpperCase() || 'М';
    var profile = byId('adminProfile');
    var back = byId('adminReturn');
    if (profile) {
      profile.textContent = initials;
      profile.title = 'Мастер · ' + name;
    }
    if (back) back.textContent = 'Вернуться · ' + name;
  }

  function openCabinetSearch() {
    try {
      localStorage.setItem('ag_tab', JSON.stringify('orders'));
      sessionStorage.setItem('ag_focus_search', '1');
    } catch (ignoreStore) {}
    window.location.assign('admin.html#orders');
  }

  var mobileMenuTrigger = byId('analyticsNav') && document.querySelector('[data-admin-mobile-menu]');
  var mobileMenuReturn = null;
  function setMobileMenu(open, restoreFocus) {
    open = !!open;
    document.body.classList.toggle('admin-nav-expanded', open);
    if (mobileMenuTrigger) {
      mobileMenuTrigger.setAttribute('aria-expanded', String(open));
      mobileMenuTrigger.setAttribute('aria-label', open ? 'Закрыть разделы' : 'Открыть разделы');
    }
    var main = byId('analyticsMain');
    if (main) main.inert = open;
    if (open) {
      mobileMenuReturn = mobileMenuTrigger || document.activeElement;
      var current = document.querySelector('#analyticsNav [aria-current="page"]');
      if (current) current.focus({ preventScroll: true });
    } else if (restoreFocus && mobileMenuReturn && mobileMenuReturn.focus) {
      mobileMenuReturn.focus({ preventScroll: true });
    }
  }

  var filterExpanded = false;
  function filtersAreMobile() {
    return !!(window.matchMedia && window.matchMedia('(max-width: 720px)').matches);
  }
  function syncAdvancedFilters() {
    var panel = byId('advancedFilters');
    var toggle = byId('filterToggle');
    if (!panel || !toggle) return;
    panel.hidden = filtersAreMobile() && !filterExpanded;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    toggle.textContent = panel.hidden ? 'Фильтры' : 'Скрыть';
  }

  document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
    button.addEventListener('click', toggleTheme);
  });
  syncThemeControls();
  if (mobileMenuTrigger) {
    mobileMenuTrigger.addEventListener('click', function () {
      setMobileMenu(mobileMenuTrigger.getAttribute('aria-expanded') !== 'true', false);
    });
  }
  document.querySelectorAll('[data-admin-nav-link]').forEach(function (link) {
    link.addEventListener('click', function () {
      var href = link.getAttribute('href') || '';
      var match = href.match(/^admin\.html#([a-z]+)$/);
      if (match) {
        try { localStorage.setItem('ag_tab', JSON.stringify(match[1])); } catch (ignoreStore) {}
      }
      setMobileMenu(false, false);
    });
  });
  document.querySelectorAll('[data-admin-search]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      openCabinetSearch();
    });
  });
  byId('filterToggle').addEventListener('click', function () {
    filterExpanded = !filterExpanded;
    syncAdvancedFilters();
    if (filterExpanded) {
      var first = byId('advancedFilters').querySelector('select, input, button');
      if (first) first.focus({ preventScroll: true });
    }
  });
  window.addEventListener('resize', function () {
    if (window.innerWidth > 920) setMobileMenu(false, false);
    syncAdvancedFilters();
  }, { passive: true });
  document.addEventListener('keydown', function (event) {
    if ((event.metaKey || event.ctrlKey) && String(event.key).toLowerCase() === 'k') {
      event.preventDefault();
      openCabinetSearch();
      return;
    }
    if (event.key === 'Escape' && document.body.classList.contains('admin-nav-expanded')) {
      event.preventDefault();
      setMobileMenu(false, true);
    }
  });
  syncAdvancedFilters();
  var currentNav = document.querySelector('#analyticsNav [aria-current="page"]');
  if (currentNav && currentNav.scrollIntoView) {
    currentNav.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  byId('refreshButton').addEventListener('click', loadAll);
  byId('applyFilters').addEventListener('click', function () {
    state.source = byId('sourceFilter').value;
    state.device = byId('deviceFilter').value;
    state.page = byId('pageFilter').value;
    state.bots = byId('botsFilter').checked;
    filterExpanded = false;
    syncAdvancedFilters();
    loadAll();
  });
  document.querySelectorAll('[data-hours]').forEach(function (button) {
    button.addEventListener('click', function () {
      state.hours = Number(button.getAttribute('data-hours')) || 168;
      loadAll();
    });
  });
  byId('loadMore').addEventListener('click', loadMore);
  byId('sessionRows').addEventListener('click', function (event) {
    var button = event.target.closest('[data-session]');
    if (button) openSession(button.getAttribute('data-session'));
  });
  byId('closeDialog').addEventListener('click', function () { byId('sessionDialog').close(); });
  byId('sessionDialog').addEventListener('click', function (event) {
    if (event.target === byId('sessionDialog')) byId('sessionDialog').close();
  });

  var sortedHeader = document.querySelector('[aria-sort]');
  if (sortedHeader) sortedHeader.setAttribute('aria-label', 'Последняя активность, по убыванию');
  byId('refreshButton').disabled = true;
  setBusy(true);
  if (S && S.api && S.api.ready && typeof S.api.ready.then === 'function') {
    S.api.ready.then(function (session) {
      if (session && session.error === 'forbidden') {
        showAccessDenied();
        return;
      }
      syncMasterIdentity(session);
      loadAll();
    });
  } else {
    showWorkspace();
    setMessage('Не удалось запустить защищённый доступ к аналитике.', 'error');
    markStale('Данные не загружены');
    setBusy(false);
  }
})();
