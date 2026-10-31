(function () {
  'use strict';
  // kladovaya-pay:20261031-v1 — оплата услуги Кладовой по подписанной ссылке из бота.
  // Подпись, срок и цену проверяет только сервер; здесь — показ и переход в Robokassa.
  var BOT = 'https://t.me/kladovoygipsrbot';
  var ORDER = /^k[a-z0-9]{10}$/;
  var FIELDS = ['o', 'p', 'a', 'e', 's'];
  var AGAIN = 'Пришлите работу боту ещё раз (/check) — он проверит её и даст новую ссылку.';
  var OURS = 'Это ошибка на нашей стороне — напишите на support@akademsalon.ru, разберёмся.';
  var LATER = 'Попробуйте через несколько минут. Не заработает — напишите на support@akademsalon.ru.';
  var MESSAGES = {
    link_invalid: ['Ссылка повреждена или неполная', 'Откройте её ещё раз из сообщения бота. Не поможет — ' +
      'пришлите работу боту заново (/check), он даст новую ссылку.'],
    link_expired: ['Ссылка устарела', 'Ссылка на оплату действует сутки. ' + AGAIN],
    price_mismatch: ['Цена в ссылке не совпадает с текущей', OURS],
    order_mismatch: ['Ссылка не подходит к заказу', OURS],
    already_paid: ['Уже оплачено', 'Этот заказ оплачен. Файл пришлёт бот — вернитесь в него.'],
    too_many_attempts: ['Слишком много попыток оплаты', 'По этому заказу создано слишком много счетов. ' + AGAIN],
    checkout_closed: ['Оплата временно недоступна', LATER],
    not_configured: ['Оплата временно недоступна', LATER]
  };
  var FALLBACK = ['Сервер не ответил', 'Попробуйте ещё раз через минуту. Не получится — вернитесь в бота ' +
    'или напишите на support@akademsalon.ru.'];
  // повтор тут не поможет: нужна новая ссылка или разбор на нашей стороне
  var FINAL = ['link_invalid', 'link_expired', 'price_mismatch', 'order_mismatch', 'already_paid', 'too_many_attempts'];
  var $ = function (selector) { return document.querySelector(selector); };
  var title = $('[data-kp-title]');
  var lead = $('[data-kp-lead]');
  var facts = $('[data-kp-facts]');
  var form = $('[data-kp-form]');
  var pay = $('[data-kp-pay]');
  var error = $('[data-kp-error]');
  var email = $('#kpEmail');
  var accept = $('[data-kp-accept]');
  var actions = $('[data-kp-actions]');
  var botLink = $('[data-kp-bot]');
  var retry = $('[data-kp-retry]');
  var params = new URLSearchParams(location.search);
  var link = {};
  FIELDS.forEach(function (key) { link[key] = params.get(key) || ''; });
  var payLabel = 'Оплатить';

  function rub(value) { return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽'; }

  function until(unix) {
    try {
      return new Date(unix * 1000).toLocaleString('ru-RU', {
        timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
      }) + ' МСК';
    } catch (e) { return ''; }
  }

  function state(heading, text, options) {
    options = options || {};
    title.textContent = heading;
    lead.textContent = text;
    form.hidden = !options.form;
    facts.hidden = !options.form;
    actions.hidden = !!options.form || !!options.busy;
    retry.hidden = !options.retry;
    if (options.bot) botLink.href = options.bot;
    if (options.focus) title.focus();
  }

  function fail(code, focus) {
    var message = MESSAGES[code] || FALLBACK;
    var bot = code === 'already_paid' && ORDER.test(link.o) ? BOT + '?start=paid_' + link.o : BOT;
    state(message[0], message[1], { bot: bot, retry: FINAL.indexOf(code) < 0, focus: focus });
  }

  function request(url, init) {
    init = init || {};
    init.credentials = 'omit'; // сессия Салона здесь не нужна, а с ней сработала бы CSRF-защита
    init.cache = 'no-store';
    init.headers = Object.assign({ Accept: 'application/json' }, init.headers || {});
    return fetch(url, init).then(function (response) {
      var broken = { ok: false, error: 'http_' + response.status };
      return response.json().then(function (data) {
        return data && typeof data === 'object' ? data : broken;
      }, function () { return broken; });
    }, function () { return { ok: false, error: 'network' }; });
  }

  function load() {
    state('Оплата исправления оформления', 'Проверяем ссылку из бота…', { busy: true });
    request('/api/kladovaya/pay/quote?' + new URLSearchParams(link).toString()).then(function (data) {
      if (!data.ok) { fail(data.error); return; }
      if (data.state === 'paid') {
        state('Уже оплачено', 'Заказ ' + data.order + ' оплачен. Файл пришлёт бот — вернитесь в него.', { bot: data.bot });
        return;
      }
      $('[data-kp-variant]').textContent = data.variant;
      $('[data-kp-order]').textContent = data.order;
      $('[data-kp-until]').textContent = until(data.expires_at);
      payLabel = 'Оплатить ' + rub(data.amount);
      pay.textContent = payLabel;
      pay.disabled = false;
      state('Исправление оформления — ' + rub(data.amount),
        'Поправим поля, шрифт, интервалы, отступы, заголовки, подписи и номера страниц в вашем .docx — бот ' +
        'Кладовой пришлёт исправленный файл и список правок, как только касса подтвердит оплату.',
        { form: true });
    });
  }

  function showError(text, field) {
    error.textContent = text;
    email.setAttribute('aria-invalid', field === email ? 'true' : 'false');
    (field || pay).focus();
  }

  function clearError() {
    error.textContent = '';
    email.setAttribute('aria-invalid', 'false');
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (pay.disabled) return;
    clearError();
    var address = email.value.trim();
    if (!address) { showError('Укажите почту — на неё придёт чек.', email); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address)) {
      showError('Проверьте почту — похоже, в адресе опечатка.', email);
      return;
    }
    if (!accept.checked) { showError('Отметьте, что принимаете условия.', accept); return; }
    pay.disabled = true;
    pay.textContent = 'Переходим в Robokassa…';
    var body = Object.assign({}, link, { email: address, accept: true });
    request('/api/kladovaya/pay/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(function (data) {
      if (data.ok && /^https:\/\/auth\.robokassa\.ru\//.test(data.url)) { location.assign(data.url); return; }
      pay.disabled = false;
      pay.textContent = payLabel;
      if (data.error === 'email_invalid') { showError('Проверьте почту — похоже, в адресе опечатка.', email); return; }
      if (data.error === 'accept_required') { showError('Отметьте, что принимаете условия.', accept); return; }
      if (FINAL.indexOf(data.error) >= 0 || data.error === 'checkout_closed' || data.error === 'not_configured') {
        fail(data.error, true);
        return;
      }
      // касса или сервер не ответили: форма с почтой остаётся, нажать ещё раз безопасно
      var again = ' Нажмите «Оплатить» ещё раз через минуту — двойной оплаты не будет.';
      if (data.error === 'network') {
        showError('Нет связи с сервером. Проверьте интернет и нажмите «Оплатить» ещё раз — двойной оплаты не будет.');
      } else {
        showError((data.error === 'provider_unavailable' ? 'Касса не ответила.' : 'Сервер не ответил.') + again);
      }
    });
  });

  retry.addEventListener('click', load);
  // вернулись из Robokassa кнопкой «Назад»: страница из кэша — сверить заказ заново, почта остаётся
  window.addEventListener('pageshow', function (event) {
    if (event.persisted && link.o) { pay.disabled = false; pay.textContent = payLabel; load(); }
  });

  if (!link.o) {
    state('Исправление оформления',
      'Ссылку на оплату присылает бот Кладовой ГИПСР, когда проверит вашу работу. Откройте бота и ' +
      'отправьте .docx на проверку (/check).',
      { bot: BOT });
    return;
  }
  load();
})();
