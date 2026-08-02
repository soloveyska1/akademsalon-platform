/* Local-only cabinet fixtures.
   demo=alexey shows a filled account; demo=entry shows a signed-out entry.
   Neither mode writes to the API. */
(function () {
  'use strict';

  var previewHost = location.hostname === 'localhost' || location.hostname === '127.0.0.1' ||
    /\.saymoon\.chatgpt\.site$/.test(location.hostname);
  var demo = false;
  var vkLinkedDemo = false;
  var entryDemo = false;
  try {
    var demoName = new URLSearchParams(location.search).get('demo');
    demo = demoName === 'alexey' || demoName === 'alexey-vk';
    vkLinkedDemo = demoName === 'alexey-vk';
    entryDemo = demoName === 'entry';
  }
  catch (e) {}
  if (!previewHost || (!demo && !entryDemo) || !window.Salon || !window.Salon.api) return;

  var S = window.Salon;
  if (entryDemo) {
    var entryApi = S.api;
    S.api = Object.assign({}, entryApi, {
      token: function () { return null; },
      bearer: function () { return null; },
      cookieSession: function () { return false; },
      guestSession: function () { return false; },
      user: function () { return null; },
      guestTokens: function () { return []; },
      identified: function () { return false; },
      get: function (path) {
        if (String(path || '').split('?')[0] === '/features') {
          return Promise.resolve({ ok: true, email_login: true, vk_login: false, mailru_login: false, max_login: false });
        }
        return Promise.resolve({ ok: true, orders: [] });
      },
      post: function () { return Promise.resolve({ ok: false, error: 'demo_only' }); },
      migration: Promise.resolve(null),
      ready: Promise.resolve({ ok: true, authenticated: false, user: null })
    });
    S.resumeTgLogin = function () { return null; };
    S.tgLogin = function (onDone, onFail, onOpen) {
      if (onOpen) onOpen('https://t.me/academic_saloon_bot', false);
      setTimeout(function () { if (onFail) onFail({ error: 'demo_only' }); }, 1800);
    };
    document.body.classList.add('is-cabinet-entry-demo');
    document.title = 'Превью входа — Академический Салон';
    return;
  }

  var realStore = S.store;
  S.store = Object.assign({}, realStore, {
    get: function (key, fallback) {
      if (key === 'salon_draft' || key === 'salon_hidden_orders' || key === 'salon_watch') return fallback;
      return realStore.get(key, fallback);
    },
    set: function (key, value) {
      if (key === 'salon_draft' || key === 'salon_hidden_orders' || key === 'salon_watch') return value;
      return realStore.set(key, value);
    },
    del: function (key) {
      if (key === 'salon_draft' || key === 'salon_hidden_orders' || key === 'salon_watch') return;
      return realStore.del(key);
    }
  });
  var user = {
    id: 'demo-client-alexey',
    name: 'Алексей Воронов',
    created_at: '2025-09-03T09:00:00Z',
    telegram_connected: true,
    email_masked: 'a•••••@example.invalid'
  };
  var steps = ['Заявка принята', 'Оценка и спецификация', 'Работа мастерской',
    'Проверка результата', 'Дело завершено'];

  function line(label, result, amount, topic) {
    return {
      position_label: label,
      result: result,
      topic: topic,
      input_description: 'Материалы и методические требования клиента',
      inclusions: ['редакторская структура', 'проверка логики', 'оформление ссылок'],
      exclusions: ['подмена автора на защите', 'фиктивные данные и источники'],
      acceptance_criteria: ['соответствие согласованному плану', 'комментарии к существенным правкам'],
      deadline_text: 'по графику дела',
      correction_window_days: 5,
      iterations: 2,
      actual_author: 'клиент',
      price_amount: amount
    };
  }

  var orders = [
    {
      id: 701, no: 'АС-701', status: 'priced', status_label: 'Ждёт решения',
      work_type: 'course_emp', work_label: 'Курсовая с исследованием',
      topic: 'Факторы учебной мотивации студентов первого курса',
      created_at: '2026-07-29T11:20:00Z', updated_at: '2026-08-01T00:35:00Z',
      deadline_date: '2026-08-18', deadline_text: '18 августа',
      step: 2, steps: steps, stage: 1, stages_total: 2, parts_done: 0,
      price: 28000, due_total: 25200, sub_discount: 2800,
      receipt_email: 'alexey.voronov@example.invalid',
      due_now: { amount: 0, label: '' },
      plan: [
        { kind: 'prepay', label: 'Первый этап', amount: 12600 },
        { kind: 'final', label: 'После готовности результата', amount: 12600 }
      ],
      actions: ['accept_price', 'decline', 'pause'], pinned: true, archived: false,
      paused: false, unread: 1, files_new: 1, files_count: 2,
      pay_online: true, claimed: false, payments: [],
      bonus: { balance: 1850 }, bonus_cap: 1850,
      specification_lines: [line('Редакторское сопровождение исследования',
        'Проверенный план, структура исследования и отредактированный текст с комментариями',
        28000, 'Факторы учебной мотивации студентов первого курса')],
      files: [
        { id: 11, name: 'metodichka_kursovaya.pdf', from: 'client', at: '2026-07-29T11:22:00Z', label: 'методичка' },
        { id: 12, name: 'specifikaciya_AS-701.pdf', from: 'master', at: '2026-08-01T00:35:00Z', label: 'предложение', new: true }
      ],
      history: [
        { at: '2026-07-29T11:20:00Z', text: 'Заявка принята мастерской' },
        { at: '2026-08-01T00:35:00Z', text: 'Подготовлены спецификация и точная цена' }
      ],
      messages: [
        { id: 31, from: 'client', text: 'Методичку приложил. Особенно важна практическая часть.', at: '2026-07-29T11:24:00Z', kind: 'text' },
        { id: 32, from: 'master', text: 'Материалы посмотрели. Предложение готово: работа в две части, срок сохраняем.', at: '2026-08-01T00:36:00Z', kind: 'text' }
      ]
    },
    {
      id: 684, no: 'АС-684', status: 'work', status_label: 'В работе',
      work_type: 'diplom', work_label: 'ВКР по экономике',
      topic: 'Управление оборотным капиталом производственного предприятия',
      created_at: '2026-07-12T08:10:00Z', updated_at: '2026-07-31T18:10:00Z',
      deadline_date: '2026-08-27', deadline_text: '27 августа',
      step: 3, steps: steps, stage: 2, stages_total: 4, parts_done: 1,
      price: 46000, due_total: 46000, due_now: { amount: 0, label: '' },
      receipt_email: 'alexey.voronov@example.invalid',
      plan: [
        { kind: 'prepay', label: 'Старт и первая часть', amount: 23000 },
        { kind: 'final', label: 'После готовности второй части', amount: 23000 }
      ],
      actions: ['pause', 'cancel_request'], pinned: false, archived: false,
      paused: false, unread: 0, files_new: 0, files_count: 4,
      pay_online: true, claimed: false,
      payments: [{ id: 9001, kind: 'prepay', status: 'paid', amount: 23000, at: '2026-07-14T13:20:00Z', confirmation_url: true }],
      specification_lines: [line('Редакторский аудит и сопровождение ВКР',
        'Последовательная редактура глав, расчётов и материалов к защите', 46000,
        'Управление оборотным капиталом производственного предприятия')],
      files: [
        { id: 21, name: 'plan_i_struktura.docx', from: 'master', at: '2026-07-15T10:00:00Z', label: 'согласованный план' },
        { id: 22, name: 'glava_1_s_kommentariyami.docx', from: 'master', at: '2026-07-25T16:30:00Z', part: 1, label: 'принятая часть' },
        { id: 23, name: 'raschety_klienta.xlsx', from: 'client', at: '2026-07-27T09:40:00Z', label: 'исходные расчёты' },
        { id: 24, name: 'bibliografiya.docx', from: 'client', at: '2026-07-28T12:05:00Z', label: 'список источников' }
      ],
      history: [
        { at: '2026-07-12T08:10:00Z', text: 'Заявка принята мастерской' },
        { at: '2026-07-14T13:20:00Z', text: 'Первый этап оплачен' },
        { at: '2026-07-26T10:00:00Z', text: 'Первая часть принята, начата работа над второй' }
      ],
      messages: [
        { id: 41, from: 'master', text: 'Первая глава закрыта. Сейчас сверяем расчёты и таблицы второй части.', at: '2026-07-31T18:10:00Z', kind: 'text' },
        { id: 42, from: 'client', text: 'Хорошо, если понадобится пояснение по исходным данным — напишите.', at: '2026-07-31T18:22:00Z', kind: 'text' }
      ]
    },
    {
      id: 659, no: 'АС-659', status: 'check', status_label: 'На вашей проверке',
      work_type: 'vak', work_label: 'Научная статья ВАК',
      topic: 'Цифровые сервисы в адаптации молодых специалистов',
      created_at: '2026-06-30T15:45:00Z', updated_at: '2026-08-01T01:05:00Z',
      deadline_date: '2026-08-06', deadline_text: '6 августа',
      step: 4, steps: steps, stage: 1, stages_total: 1, parts_done: 0,
      price: 18000, due_total: 18000, due_now: { amount: 0, label: '' },
      receipt_email: 'alexey.voronov@example.invalid',
      plan: [{ kind: 'prepay', label: 'Работа целиком', amount: 18000 }],
      actions: ['accept_work', 'pause'], pinned: false, archived: false,
      paused: false, unread: 1, files_new: 1, files_count: 3,
      pay_online: true, claimed: false,
      payments: [{ id: 8801, kind: 'prepay', status: 'paid', amount: 18000, at: '2026-07-02T09:00:00Z', confirmation_url: true }],
      specification_lines: [line('Редактура научной статьи',
        'Отредактированная статья, аннотация, ключевые слова и отчёт формальной проверки', 18000,
        'Цифровые сервисы в адаптации молодых специалистов')],
      files: [
        { id: 51, name: 'statya_final_review.docx', from: 'master', at: '2026-08-01T01:00:00Z', label: 'результат', new: true },
        { id: 52, name: 'otchet_proverki.pdf', from: 'master', at: '2026-08-01T01:02:00Z', label: 'отчёт', new: true },
        { id: 53, name: 'trebovaniya_zhurnala.pdf', from: 'client', at: '2026-06-30T15:48:00Z', label: 'требования журнала' }
      ],
      history: [
        { at: '2026-06-30T15:45:00Z', text: 'Заявка принята мастерской' },
        { at: '2026-08-01T01:05:00Z', text: 'Результат передан на проверку клиента' }
      ],
      messages: [
        { id: 61, from: 'master', text: 'Финальная версия и отчёт приложены. Проверьте, пожалуйста, требования журнала и формулировки выводов.', at: '2026-08-01T01:05:00Z', kind: 'text' }
      ]
    }
  ];

  var me = {
    ok: true,
    user: user,
    features: { email_login: true, vk_login: true, mailru_login: false, max_login: false },
    oauth: vkLinkedDemo ? ['telegram', 'vk'] : ['telegram'],
    bonus: { balance: 1850, expiring: [{ amount: 600, at: '2026-09-01T00:00:00Z' }] },
    deposit: {
      balance: 12000, can_topup: true,
      rates: [{ from: 20000, pct: 3 }, { from: 30000, pct: 5 }, { from: 45000, pct: 7 }, { from: 60000, pct: 10 }]
    },
    sub: {
      id: 77, label: 'Салон+ Семестр', expires_ru: '15 декабря 2026',
      discount_pct: 10, discount_cap: 3000, auto_renew: false,
      features: ['curator', 'priority']
    },
    sub_pending: null,
    milestones: [
      { id: 1, title: 'Предзащита ВКР', due: '2026-08-24' },
      { id: 2, title: 'Сдать статью в редакцию', due: '2026-08-07' }
    ],
    payment_confirmations: [
      {
        id: 9001, scope: 'order', reference: 684,
        label: 'Первый этап · ВКР по экономике', amount: 23000,
        at: '2026-07-14T13:20:00Z',
        url: '/__cabinet_demo__/payment-confirmation-9001.pdf'
      },
      {
        id: 8801, scope: 'order', reference: 659,
        label: 'Работа целиком · статья ВАК', amount: 18000,
        at: '2026-07-02T09:00:00Z',
        url: '/__cabinet_demo__/payment-confirmation-8801.pdf'
      }
    ]
  };

  var plans = {
    ok: true, base_price: 449,
    periods: { month: { k: 1 }, sem: { k: 4.2 } },
    features: [
      { id: 'priority', label: 'Приоритет в графике', price: 250, hint: 'по согласованным срокам' },
      { id: 'curator', label: 'Куратор сессии', price: 350, hint: 'напоминания о сдачах' }
    ],
    discounts: {},
    plans: [
      { id: 'light', label: 'Салон+ Лайт', tagline: 'Для одного активного дела', month_price: 449, sem_price: 1890, features: ['priority'] },
      { id: 'pro', label: 'Салон+ Семестр', tagline: 'Для плотного учебного графика', month_price: 790, sem_price: 2990, features: ['priority', 'curator'] }
    ]
  };

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function responseFor(path) {
    var clean = String(path || '').split('?')[0];
    if (clean === '/features') return { ok: true, email_login: true, vk_login: true, mailru_login: false, pay_online: true };
    if (clean === '/me') return clone(me);
    if (clean === '/orders') return { ok: true, orders: clone(orders) };
    if (clean === '/plans') return clone(plans);
    if (clean === '/bonus') return { ok: true, items: [
      { delta: 1200, note: 'За пополнение депозита', at: '2026-07-14T13:20:00Z' },
      { delta: 650, note: 'Бонус мастерской', at: '2026-07-25T10:00:00Z' }
    ] };
    if (clean === '/deposit') return { ok: true, rows: [
      { delta: 30000, note: 'Пополнение счёта', at: '2026-07-14T13:18:00Z' },
      { delta: -18000, note: 'Оплата этапа', order_id: 659, at: '2026-07-02T09:00:00Z' }
    ] };
    var match = clean.match(/^\/orders\/(\d+)$/);
    if (match) {
      var id = parseInt(match[1], 10);
      var order = orders.filter(function (item) { return item.id === id; })[0];
      return order ? { ok: true, order: clone(order) } : { ok: false, error: 'not_found' };
    }
    return { ok: false, error: 'demo_only' };
  }

  var realApi = S.api;
  S.api = Object.assign({}, realApi, {
    base: '/__cabinet_demo__',
    token: function () { return '__demo_client__'; },
    bearer: function () { return null; },
    cookieSession: function () { return true; },
    guestSession: function () { return false; },
    user: function () { return clone(user); },
    setUser: function () {},
    setToken: function () {},
    guestTokens: function () { return []; },
    addGuestToken: function () {},
    identified: function () { return true; },
    headers: function () { return {}; },
    get: function (path) { return Promise.resolve(responseFor(path)); },
    post: function () { return Promise.resolve({ ok: false, error: 'demo_only' }); },
    logout: function () { return Promise.resolve({ ok: false, error: 'demo_only' }); },
    migration: Promise.resolve(null),
    ready: Promise.resolve({ ok: true, authenticated: true, user: clone(user) })
  });

  var realFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('/__cabinet_demo__/events') >= 0) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          resolve(new Response(JSON.stringify({ ok: true, v: 1 }), {
            status: 200, headers: { 'Content-Type': 'application/json' }
          }));
        }, 24000);
      });
    }
    if (url.indexOf('/__cabinet_demo__/') >= 0) {
      return Promise.resolve(new Response('Демонстрационный файл Академического Салона', {
        status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      }));
    }
    return realFetch.call(window, input, init);
  };

  document.body.classList.add('is-cabinet-demo');
  document.title = 'Демо: кабинет Алексея — Академический Салон';
  var robots = document.createElement('meta');
  robots.name = 'robots'; robots.content = 'noindex,nofollow,noarchive';
  document.head.appendChild(robots);
  var flag = document.createElement('div');
  flag.className = 'account-demo-flag';
  flag.id = 'accountDemoFlag';
  flag.setAttribute('role', 'status');
  flag.setAttribute('aria-atomic', 'true');
  flag.innerHTML = '<strong>Демо-данные</strong><span>Внешние действия отключены</span>';
  var cabinetRoot = document.getElementById('cabRoot');
  if (cabinetRoot && cabinetRoot.parentNode) cabinetRoot.parentNode.insertBefore(flag, cabinetRoot);
  else document.body.appendChild(flag);

  function demoNotice() {
    flag.classList.remove('is-pulse');
    flag.offsetWidth;
    flag.classList.add('is-pulse');
    flag.querySelector('span').textContent = 'Это безопасный просмотр — действие никуда не отправлено';
    setTimeout(function () {
      var note = flag.querySelector('span');
      if (note) note.textContent = 'Внешние действия отключены';
    }, 2400);
  }

  var blocked = [
    '[data-act]', '[data-act-pay]', '[data-act-pay-dep]', '[data-act-pin]',
    '[data-act-pause]', '[data-act-cancelreq]', '[data-act-fix-send]',
    '[data-sub-buy]', '[data-sub-ar]', '[data-sub-paid]', '[data-sub-pay]',
    '[data-sub-cancel]', '[data-dep-topup]', '[data-ms-del]', '#msAdd',
    '#chatSend', '#cabLogout', '#cabTg', '#cabEmailSend', '#cabEmailGo',
    '#cabClaimBtn', '#bspendApply', '#gattApply', '#bonusRefBtn',
    '[data-tip-pay]', '[data-contact]', '[data-oauth]', '[data-oauth-link]', '[data-protected-asset]',
    '[data-access-copy]', '[data-secure-tg-link]', 'label.case-upload'
  ].join(',');
  document.addEventListener('click', function (event) {
    if (!event.target || !event.target.closest || !event.target.closest(blocked)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    demoNotice();
  }, true);
  document.addEventListener('change', function (event) {
    if (!event.target || event.target.type !== 'file') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    demoNotice();
    event.target.value = '';
  }, true);
})();
