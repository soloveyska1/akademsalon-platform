/* «Выгоды» v4: вкладки по адресу (#subscriptions, #bonuses, #deposit, #more), бонусный счёт на первом экране,
   калькуляторы абонемента, бонусов и депозита. Все суммы считает window.SalonBenefitMath (salon-benefits.js —
   опубликованные правила); здесь только ввод, вывод и приветственные 300 бонусов через бота, как в туре Листика. */
(function () {
  'use strict';
  var M = window.SalonBenefitMath;
  var root = document.querySelector('[data-benefits-v4]');
  if (!root || !M) return;

  var $ = function (s) { return root.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(root.querySelectorAll(s)); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var NAMES = { 2500: 'Реферат', 14000: 'Курсовая', 30000: 'Глава', 40000: 'ВКР', 60000: 'Магистерская' };

  function num(n) { return Math.round(n).toLocaleString('ru-RU'); }
  function money(n) { return num(n) + ' ₽'; }
  function minus(n) { return n ? '−' + money(n) : money(0); }
  function plural(n, one, few, many) {
    var a = n % 10, b = n % 100;
    return a === 1 && b !== 11 ? one : a > 1 && a < 5 && (b < 12 || b > 14) ? few : many;
  }
  function works(n) { return n + ' ' + plural(n, 'работе', 'работах', 'работах'); }
  function even(k) { return (k === 2 ? 'со ' : 'с ') + k + '-й работы'; }
  function goal(name) {
    try {
      if (window.Salon && Salon.metrika && typeof Salon.metrika.goal === 'function') Salon.metrika.goal(name);
    } catch (e) { /* аналитика не должна ломать клик */ }
  }

  // Суммы «докручиваются» до нового значения — ответ на действие человека
  function roll(el, to, fmt) {
    if (!el) return;
    var from = Number(el.dataset.value);
    el.dataset.value = to;
    if (reduce || !isFinite(from) || from === to) { el.textContent = fmt(to); return; }
    cancelAnimationFrame(el._raf);
    var t0 = 0;
    function step(t) {
      if (!t0) t0 = t;
      var k = Math.min(1, (t - t0) / 420), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (k < 1) el._raf = requestAnimationFrame(step);
    }
    el._raf = requestAnimationFrame(step);
  }
  function set(sel, text) { var el = $(sel); if (el) el.textContent = text; }
  function press(list, test) { list.forEach(function (b) { b.setAttribute('aria-pressed', String(test(b))); }); }
  function radio(name) { var r = root.querySelector('input[name="' + name + '"]:checked'); return r ? r.value : ''; }
  function fill(range) {
    range.style.setProperty('--fill', ((range.value - range.min) / (range.max - range.min) * 100) + '%');
  }

  document.addEventListener('click', function (e) {
    var tg = e.target.closest && e.target.closest('[data-tg-cta]');
    if (tg) goal('tg_click_' + tg.getAttribute('data-tg-cta'));
  });

  /* ---------- Вкладки: адрес #id, старые ссылки #compare ведут на абонементы */
  var tabs = $$('.bn-tabs a'), panels = $$('.bn-panel'), ALIASES = { compare: 'subscriptions' }, current = 'subscriptions';
  function show(id) {
    id = ALIASES[id] || id;
    if (!panels.some(function (p) { return p.id === id; })) return false;
    current = id;
    panels.forEach(function (p) { p.hidden = p.id !== id; });
    tabs.forEach(function (a) {
      if (a.hash === '#' + id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
    return true;
  }
  tabs.forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var id = a.hash.slice(1);
      if (id === current) return;
      show(id);
      history.pushState(null, '', '#' + id);
      // Если уже листали ниже начала вкладок — вернуть к ним, иначе новая вкладка откроется с середины
      var bar = $('.bn-tabs'), panel = document.getElementById(id);
      var limit = panel.getBoundingClientRect().top + window.pageYOffset - bar.offsetHeight - parseFloat(getComputedStyle(bar).top || 0) - 24;
      if (window.pageYOffset > limit) window.scrollTo({ top: limit, behavior: reduce ? 'auto' : 'smooth' });
    });
  });
  function fromHash() { show(location.hash.slice(1)); }
  window.addEventListener('hashchange', fromHash);
  window.addEventListener('popstate', fromHash);
  if (!show(location.hash.slice(1))) show('subscriptions');

  /* ---------- Первый экран: сколько вернётся бонусами */
  var hero = { price: 14000, plan: 'none' };
  function drawHero(first) {
    var d = M.orderProjection(hero.price, 0, hero.plan, false, 0);
    var numEl = $('[data-hero-cashback]');
    if (first && !reduce) numEl.dataset.value = 0;
    roll(numEl, d.cashback, function (v) { return '+' + num(v); });
    set('[data-hero-note]', NAMES[hero.price] + ' за ' + money(hero.price));
    var save = $('[data-hero-save]');
    save.hidden = !d.discount;
    if (d.discount) save.textContent = 'и сразу −' + money(d.discount) + ' к цене';
  }
  var heroChips = $$('[data-hero-price]');
  heroChips.forEach(function (b) {
    b.addEventListener('click', function () {
      hero.price = Number(b.dataset.heroPrice);
      press(heroChips, function (x) { return x === b; });
      drawHero();
    });
  });
  $$('input[name="bn-hero-plan"]').forEach(function (r) {
    r.addEventListener('change', function () { hero.plan = radio('bn-hero-plan'); drawHero(); });
  });
  drawHero(true);

  // Карта слегка поворачивается за курсором
  var card = $('[data-tilt]');
  if (card && !reduce && window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    card.addEventListener('pointermove', function (e) {
      var r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      card.style.setProperty('--rx', (-y * 9).toFixed(2) + 'deg');
      card.style.setProperty('--ry', (x * 11).toFixed(2) + 'deg');
      card.style.setProperty('--gx', ((x + 0.5) * 100).toFixed(1) + '%');
      card.style.setProperty('--gy', ((y + 0.5) * 100).toFixed(1) + '%');
    });
    card.addEventListener('pointerleave', function () {
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    });
  }

  /* ---------- Приветственные 300 бонусов: одноразовая ссылка в бота, как в туре Листика */
  $$('[data-welcome]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var api = window.Salon && Salon.api;
      if (!api || typeof api.post !== 'function') return;
      e.preventDefault();
      if (a.getAttribute('aria-busy') === 'true') return;
      // Вкладку открываем сразу, пока длится нажатие, — иначе браузер телефона её заблокирует
      var w = window.open('', '_blank');
      if (w) { try { w.opener = null; } catch (x) { /* не критично */ } }
      var label = a.querySelector('[data-welcome-label]'), text = label ? label.textContent : '';
      a.setAttribute('aria-busy', 'true');
      if (label) label.textContent = 'Готовим подарок…';
      var done = false;
      function go(link) {
        if (done) return;
        done = true;
        a.removeAttribute('aria-busy');
        if (label) label.textContent = text;
        if (w && !w.closed) w.location.href = link; else location.href = link;
      }
      setTimeout(function () { go(a.href); }, 4000);
      api.post('/welcome/token').then(function (r) { go(r && r.ok && r.link ? r.link : a.href); },
        function () { go(a.href); });
    });
  });

  /* ---------- Салон+: окупится ли абонемент */
  var plan = { price: 14000, count: 3 };
  var planChips = $$('[data-plan-price]'), planOwn = $('#bn-plan-price');
  function validPrice(input) {
    var v = Number(input.value);
    return input.value.trim() !== '' && input.validity.valid && Number.isInteger(v) && v >= 1000 && v <= 500000;
  }
  function drawPlans() {
    var period = radio('bn-period') || 'sem', days = period === 'sem' ? 150 : 30;
    var v = M.planComparison(plan.price, plan.count, period), n = v.count;
    set('#bn-plan-count', String(n));
    $$('[data-count-step]').forEach(function (b) {
      var next = n + Number(b.dataset.countStep);
      b.disabled = next < 1 || next > 20;
    });
    ['plus', 'pro', 'session'].forEach(function (code) {
      var per = M.orderProjection(v.price, 0, code, false, 0).discount;
      var fee = code === 'session' ? 2990 : v[code].cost;
      roll($('[data-per="' + code + '"]'), per, minus);
      set('[data-even="' + code + '"]', per > 0 ? even(Math.ceil(fee / per)) : '—');
      if (code === 'session') return;
      set('[data-fee="' + code + '"]', money(fee));
      set('[data-days="' + code + '"]', days + ' дней');
      var net = v[code].net, netEl = $('[data-net="' + code + '"]');
      set('[data-net-label="' + code + '"]', (net >= 0 ? 'Экономия на ' : 'Не окупится на ') + works(n));
      netEl.classList.toggle('is-loss', net < 0);
      roll(netEl, net, function (x) { return x >= 0 ? money(x) : '+' + money(-x); });
    });
    var best = v.pro.net > Math.max(0, v.plus.net) ? 'pro' : v.plus.net > 0 ? 'plus' : 'none';
    $$('[data-pass]').forEach(function (p) { p.classList.toggle('is-best', p.dataset.pass === best); });
    var box = $('[data-verdict-box]');
    box.classList.toggle('is-none', best === 'none');
    if (best === 'none') {
      set('[data-verdict]', 'На ' + works(n) + ' по такой цене абонемент скидками не окупится. Бонусы 5% всё равно вернутся с каждой оплаты.');
      set('[data-verdict-num]', 'Без абонемента');
    } else {
      var name = best === 'pro' ? 'Салон+ Про' : 'Салон+';
      set('[data-verdict]', 'На ' + works(n) + ' за ' + days + ' дней выгоднее ' + name + ': экономия ' + money(v[best].net) + ' с учётом цены абонемента.');
      set('[data-verdict-num]', '−' + money(v[best].net));
    }
  }
  planChips.forEach(function (b) {
    b.addEventListener('click', function () {
      plan.price = Number(b.dataset.planPrice);
      planOwn.value = plan.price;
      planOwn.removeAttribute('aria-invalid');
      $('[data-plan-error]').hidden = true;
      press(planChips, function (x) { return x === b; });
      drawPlans();
    });
  });
  planOwn.addEventListener('input', function () {
    var ok = validPrice(planOwn);
    planOwn.setAttribute('aria-invalid', String(!ok));
    $('[data-plan-error]').hidden = ok;
    if (!ok) return;
    plan.price = Number(planOwn.value);
    press(planChips, function (x) { return Number(x.dataset.planPrice) === plan.price; });
    drawPlans();
  });
  $$('[data-count-step]').forEach(function (b) {
    b.addEventListener('click', function () {
      plan.count = Math.max(1, Math.min(20, plan.count + Number(b.dataset.countStep)));
      drawPlans();
    });
  });
  $$('input[name="bn-period"]').forEach(function (r) { r.addEventListener('change', drawPlans); });
  drawPlans();
  // На телефоне абонементы листаются вбок: сразу показываем выгодный по расчёту
  var rail = $('.bn-passes'), bestPass = $('.bn-pass.is-best');
  if (rail && bestPass && rail.scrollWidth > rail.clientWidth + 4) {
    rail.scrollLeft = bestPass.offsetLeft - (rail.clientWidth - bestPass.offsetWidth) / 2;
  }

  /* ---------- Бонусы: пример счёта */
  var order = { price: 14000 };
  var orderChips = $$('[data-order-price]'), orderOwn = $('#bn-order-price'), points = $('#bn-points'), gift = $('#bn-gift');
  var promo = $('#bn-promo'), promoRow = $('[data-promo-row]');
  function drawBonus() {
    var campaign = M.welcomeActive();
    promoRow.hidden = !campaign;
    if (!campaign) promo.checked = false;
    var pts = Number(points.value), member = radio('bn-member') || 'none';
    var g = Math.max(0, Math.min(50000, Math.floor(Number(gift.value) || 0)));
    var d = M.orderProjection(order.price, pts, member, promo.checked, g);
    set('[data-points-out]', num(pts));
    fill(points);
    roll($('[data-r="price"]'), d.price, money);
    roll($('[data-r="discount"]'), d.discount, minus);
    roll($('[data-r="spent"]'), d.spent, minus);
    roll($('[data-r="gift"]'), d.giftUsed, minus);
    roll($('[data-r="payable"]'), d.payable, money);
    roll($('[data-r="cashback"]'), d.cashback, function (v) { return '+' + num(v); });
    set('[data-r="cashback-word"]', plural(d.cashback, 'бонус', 'бонуса', 'бонусов'));
    set('[data-r="discount-label"]', d.discountSource === 'promo' ? 'Промокод' : 'Скидка абонемента');
    $('[data-r="discount"]').parentNode.classList.toggle('is-zero', !d.discount);
    $('[data-r="spent"]').parentNode.classList.toggle('is-zero', !d.spent);
    $('[data-r="gift-row"]').hidden = !d.giftUsed;
    var limit = '', cap20 = Math.floor(d.price * 0.2), cap25 = Math.max(0, Math.floor(d.price * 0.25) - d.discount);
    if (pts > 0 && d.price < 1000) limit = 'Бонусы списываются с заказов от 1 000 ₽.';
    else if (pts > d.spent) {
      limit = (cap25 < cap20 && d.spent === cap25
        ? 'Скидка и бонусы вместе — не больше 25% цены. '
        : 'Бонусами можно оплатить до 20% заказа. ')
        + 'Спишется ' + num(d.spent) + ', ещё ' + num(d.pointsLeft) + ' останется на счёте.';
    }
    var lim = $('[data-r="limit"]');
    lim.hidden = !limit;
    lim.textContent = limit;
  }
  orderChips.forEach(function (b) {
    b.addEventListener('click', function () {
      order.price = Number(b.dataset.orderPrice);
      orderOwn.value = order.price;
      orderOwn.removeAttribute('aria-invalid');
      press(orderChips, function (x) { return x === b; });
      drawBonus();
    });
  });
  orderOwn.addEventListener('input', function () {
    var ok = validPrice(orderOwn);
    orderOwn.setAttribute('aria-invalid', String(!ok));
    if (!ok) return;
    order.price = Number(orderOwn.value);
    press(orderChips, function (x) { return Number(x.dataset.orderPrice) === order.price; });
    drawBonus();
  });
  [points, gift, promo].forEach(function (el) { el.addEventListener('input', drawBonus); });
  $$('input[name="bn-member"]').forEach(function (r) { r.addEventListener('change', drawBonus); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) drawBonus(); });
  drawBonus();

  /* ---------- Депозит: деньги и бонусы за использование */
  var topup = $('#bn-topup'), used = $('#bn-used'), depPro = $('#bn-dep-pro'), tiers = $$('[data-topup]');
  function drawDeposit() {
    used.max = topup.value;
    if (Number(used.value) > Number(topup.value)) used.value = topup.value;
    var d = M.depositProjection(topup.value, used.value);
    var cb = Math.floor(d.used * (depPro.checked ? 0.1 : 0.05)), extra = Math.max(0, d.earned - cb);
    set('[data-topup-out]', money(d.contribution));
    set('[data-used-out]', money(d.used));
    roll($('[data-d="balance"]'), d.balance, money);
    set('[data-d="used"]', money(d.used));
    set('[data-d="contribution"]', money(d.contribution));
    roll($('[data-d="cashback"]'), cb, function (v) { return '+' + num(v); });
    roll($('[data-d="extra"]'), extra, function (v) { return '+' + num(v); });
    set('[data-d="reserve"]', 'Резерв пополнения — до ' + num(d.reserve) + ' ' + plural(d.reserve, 'бонуса', 'бонусов', 'бонусов')
      + '. Это не баланс для оплаты: бонусы открываются по мере использования, кешбэк в них уже учтён.');
    $('[data-d="meter"]').style.width = (d.used / d.contribution * 100) + '%';
    press(tiers, function (b) { return Number(b.dataset.topup) === d.contribution; });
    fill(topup);
    fill(used);
  }
  tiers.forEach(function (b) {
    b.addEventListener('click', function () { topup.value = b.dataset.topup; drawDeposit(); });
  });
  [topup, used, depPro].forEach(function (el) { el.addEventListener('input', drawDeposit); });
  drawDeposit();
})();
