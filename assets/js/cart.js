/* ============================================================
   КОРЗИНА «КАРТОТЕКА»
   Локальный черновик комплексного заказа. Реальный заказ создаётся
   одним POST /orders; серверная цена и выгоды подтверждаются мастером.
   ============================================================ */
(function () {
  'use strict';
  var KEY = 'salon_cart_v1';
  var VERSION = 1;
  var api = null, S = null, box = null, tab = null, body = null;
  var data = { version: VERSION, items: [], checkout: { useBonus: false, bonusAmount: 0 }, updatedAt: 0 };
  var member = null, removed = null, undoTimer = null, lastFocus = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function money(n) { return Math.max(0, Math.round(n || 0)).toLocaleString('ru-RU'); }
  function positionLabel(n) {
    n = Math.max(0, parseInt(n, 10) || 0);
    var n10 = n % 10, n100 = n % 100;
    var word = n10 === 1 && n100 !== 11 ? 'позиция'
      : (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14) ? 'позиции' : 'позиций');
    return n + ' ' + word;
  }
  function uid() {
    try { return crypto.randomUUID(); }
    catch (e) { return 'ci_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  }
  function read() {
    var raw = S && S.store ? S.store.get(KEY, null) : null;
    if (!raw || raw.version !== VERSION || !Array.isArray(raw.items)) return;
    data = raw;
    data.checkout = data.checkout || { useBonus:false, bonusAmount:0 };
    data.items = data.items.filter(function (x) { return x && x.label && x.type; }).slice(0, 30);
  }
  function write() {
    data.updatedAt = Date.now();
    if (S && S.store) S.store.set(KEY, data);
    notify();
  }
  function notify() {
    render();
    if (api && api.onChange) api.onChange();
    try { document.dispatchEvent(new CustomEvent('salon:cart', { detail:{ count:count(), quote:quote() } })); } catch (e) {}
  }
  function count() {
    return data.items.reduce(function (n, x) { return n + Math.max(1, parseInt(x.qty, 10) || 1); }, 0);
  }
  function itemQuote(x) {
    var q = Math.max(1, parseInt(x.qty, 10) || 1);
    if (x.kind === 'work' && window.SalonCalc) {
      var z = window.SalonCalc.quote(x.type, x.disc, x.term, x.tier);
      return { low:z.low * q, high:z.high * q };
    }
    return { low:(x.low || 0) * q, high:(x.high || x.low || 0) * q };
  }
  function quote() {
    return data.items.reduce(function (a, x) {
      var q = itemQuote(x); a.low += q.low; a.high += q.high; return a;
    }, { low:0, high:0 });
  }
  function dealAmount(base, deal) {
    if (!deal || !base) return 0;
    var d = deal.amount ? deal.amount : Math.round(base * (deal.pct || 0) / 100);
    if (!deal.amount && deal.cap) d = Math.min(d, deal.cap);
    if (deal.min_price && base < deal.min_price) return 0;
    return Math.max(0, Math.min(d, base));
  }
  function benefits() {
    var q = quote(), d = api && api.getDeals ? api.getDeals() : {};
    var sub = member && member.sub;
    var promo = d.promoCode && d.promoDeal ? dealAmount(q.low, d.promoDeal) : 0;
    var subSave = sub && sub.discount_pct
      ? Math.min(Math.round(q.low * sub.discount_pct / 100), sub.discount_cap || Infinity) : 0;
    /* промокод и подписка не складываются без явного серверного правила:
       в прогнозе показываем более выгодное основание, сервер подтвердит. */
    var discount = Math.max(promo, subSave);
    var discountKind = promo >= subSave && promo ? 'promo' : (subSave ? 'sub' : '');
    var bonusBalance = member && member.bonus ? (member.bonus.balance || 0) : 0;
    var bonusCap = Math.max(0, Math.min(
      bonusBalance,
      Math.floor(q.low * .20 / 50) * 50,
      Math.floor((q.low * .25 - discount) / 50) * 50
    ));
    var bonus = data.checkout.useBonus ? Math.min(data.checkout.bonusAmount || bonusCap, bonusCap) : 0;
    var afterDiscount = Math.max(0, q.low - discount - bonus);
    var gift = d.giftCode ? Math.min(d.giftBal || 0, afterDiscount) : 0;
    return {
      quote:q, deal:d, sub:sub, promo:promo, subSave:subSave, discount:discount,
      discountKind:discountKind, bonusBalance:bonusBalance, bonusCap:bonusCap,
      bonus:bonus, gift:gift, due:Math.max(0, afterDiscount - gift)
    };
  }
  function meta(x) {
    if (x.kind === 'service') {
      return [x.serviceMeta || 'услуга мастерской'].concat(
        Array.isArray(x.answerLines) ? x.answerLines.slice(0, 3) : []
      );
    }
    var C = window.SalonCalc;
    function label(list, id) {
      if (!C) return id;
      for (var i=0;i<list.length;i++) if (list[i].id === id) return list[i].label;
      return id;
    }
    return [
      label(C.disciplines, x.disc).replace(' / ', ' · '),
      label(C.terms, x.term),
      label(C.tiers, x.tier)
    ];
  }
  function same(a, b) {
    if (!a || !b || a.kind !== b.kind || a.type !== b.type) return false;
    if (a.kind === 'service') {
      return JSON.stringify(a.answers || {}) === JSON.stringify(b.answers || {});
    }
    return a.disc === b.disc && a.term === b.term && a.tier === b.tier &&
      String(a.topic || '') === String(b.topic || '') &&
      String(a.deadline || '') === String(b.deadline || '') &&
      String(a.requirements || '') === String(b.requirements || '');
  }
  function add(item) {
    if (!item || !item.type) return false;
    var existing = null;
    data.items.forEach(function (x) { if (!existing && same(x, item)) existing = x; });
    if (existing) existing.qty = Math.min(10, (existing.qty || 1) + 1);
    else {
      item.id = uid(); item.qty = 1; item.note = item.note || ''; item.addedAt = Date.now();
      data.items.push(item);
    }
    write();
    if (tab) {
      tab.classList.remove('bump'); void tab.offsetWidth; tab.classList.add('bump');
    }
    if (S && S.toast) S.toast(existing ? 'Добавили ещё одну такую позицию' : 'Позиция в корзине ✓');
    return true;
  }
  function addCurrent() {
    if (!api || !api.getCurrent) return;
    if (add(api.getCurrent())) open();
  }
  function remove(id) {
    var at = -1;
    data.items.forEach(function (x, i) { if (x.id === id) at = i; });
    if (at < 0) return;
    removed = { item:data.items[at], at:at };
    data.items.splice(at, 1);
    write();
    if (undoTimer) clearTimeout(undoTimer);
    undoTimer = setTimeout(function () { removed = null; render(); }, 6000);
  }
  function undo() {
    if (!removed) return;
    data.items.splice(Math.min(removed.at, data.items.length), 0, removed.item);
    removed = null; if (undoTimer) clearTimeout(undoTimer); write();
  }
  function setQty(id, d) {
    data.items.forEach(function (x) {
      if (x.id === id) x.qty = Math.max(1, Math.min(10, (x.qty || 1) + d));
    });
    write();
  }
  function setNote(id, value) {
    data.items.forEach(function (x) { if (x.id === id) x.note = String(value || '').slice(0, 240); });
    if (S && S.store) { data.updatedAt = Date.now(); S.store.set(KEY, data); }
  }
  function clear() {
    data.items = []; data.checkout = { useBonus:false, bonusAmount:0 }; removed = null;
    write();
  }
  function lineItem(x, i) {
    var q = itemQuote(x), m = meta(x);
    return '<article class="cart-item" data-cart-id="' + esc(x.id) + '">' +
      '<div class="cart-item-top"><div><h3>' + esc(x.label) + '</h3>' +
      '<div class="cart-item-meta">' + m.map(function (v) { return '<span>' + esc(v) + '</span>'; }).join('') + '</div></div>' +
      '<div class="cart-price"><b>' + (x.fixed ? '' : 'от ') + money(q.low) + ' ₽</b>' +
      '<small>' + (q.high > q.low ? 'до ' + money(q.high) + ' ₽' : 'фиксированная ставка') + '</small></div></div>' +
      '<input class="cart-note" data-cart-note="' + esc(x.id) + '" maxlength="240" value="' + esc(x.note || '') +
      '" placeholder="Тема или уточнение к этой позиции">' +
      '<div class="cart-item-foot"><div class="cart-qty" aria-label="Количество">' +
      '<button type="button" data-cart-qty="-1" aria-label="Уменьшить количество">−</button>' +
      '<b aria-live="polite">' + (x.qty || 1) + '</b>' +
      '<button type="button" data-cart-qty="1" aria-label="Увеличить количество">+</button></div>' +
      '<button type="button" class="cart-remove" data-cart-remove="' + esc(x.id) + '">Убрать</button></div></article>';
  }
  function benefitHtml(b) {
    var out = '';
    if (b.deal.promoCode) {
      out += '<div class="cart-benefit"><span class="cart-benefit-ico">%</span><span><b>Промокод ' +
        esc(b.deal.promoCode) + '</b><small>' + esc(b.deal.promoLabel || 'Скидка будет проверена по итоговой цене') +
        '</small></span><span class="cart-benefit-val">' + (b.promo ? '−' + money(b.promo) + ' ₽' : 'ждёт порога') + '</span></div>';
    }
    if (b.sub) {
      out += '<div class="cart-benefit"><span class="cart-benefit-ico">+</span><span><b>' +
        esc(b.sub.label || 'Салон+') + '</b><small>−' + (b.sub.discount_pct || 0) +
        '% автоматически, до ' + money(b.sub.discount_cap || 0) + ' ₽</small></span>' +
        '<span class="cart-benefit-val">−' + money(b.subSave) + ' ₽</span></div>';
    } else {
      out += '<div class="cart-benefit off"><span class="cart-benefit-ico">+</span><span><b>Салон+</b>' +
        '<small>Подписка применится автоматически после согласования цены</small></span>' +
        '<a class="cart-benefit-login" href="plus.html">посмотреть</a></div>';
    }
    if (member && member.bonus) {
      out += '<div class="cart-benefit' + (b.bonusCap ? '' : ' off') + '"><span class="cart-benefit-ico">Б</span><span>' +
        '<label class="cart-bonus-toggle"><input type="checkbox" id="cartBonus"' +
        (data.checkout.useBonus ? ' checked' : '') + (b.bonusCap ? '' : ' disabled') +
        '><b>Списать бонусы после точной сметы</b></label><small>На счёте ' + money(b.bonusBalance) +
        '; предварительный лимит — ' + money(b.bonusCap) + ' ₽</small></span><span class="cart-benefit-val">' +
        (data.checkout.useBonus ? '−' + money(b.bonus) + ' ₽' : 'не списывать') + '</span>' +
        (data.checkout.useBonus && b.bonusCap ? '<input class="cart-bonus-range" id="cartBonusRange" type="range" min="0" max="' +
          b.bonusCap + '" step="50" value="' + b.bonus + '" aria-label="Сколько бонусов планируется списать">' : '') + '</div>';
    } else {
      out += '<div class="cart-benefit off"><span class="cart-benefit-ico">Б</span><span><b>Бонусы</b>' +
        '<small>Войдите, чтобы увидеть баланс. Фактическое списание доступно после цены мастера.</small></span>' +
        '<a class="cart-benefit-login" href="dashboard.html">войти</a></div>';
    }
    if (b.deal.giftCode) {
      out += '<div class="cart-benefit"><span class="cart-benefit-ico">С</span><span><b>Сертификат ' +
        esc(b.deal.giftCode) + '</b><small>Баланс ' + money(b.deal.giftBal || 0) +
        ' ₽; применяется после скидок и бонусов</small></span><span class="cart-benefit-val">−' +
        money(b.gift) + ' ₽</span></div>';
    }
    return out;
  }
  function totalsHtml(b) {
    var discountLabel = b.discountKind === 'promo' ? 'Промокод' : (b.discountKind === 'sub' ? 'Салон+' : 'Скидки');
    return '<div class="cart-totals">' +
      '<div class="cart-total-row"><span>Предварительная стоимость</span><b>' + money(b.quote.low) +
      (b.quote.high > b.quote.low ? '–' + money(b.quote.high) : '') + ' ₽</b></div>' +
      (b.discount ? '<div class="cart-total-row minus"><span>' + discountLabel + '</span><b>−' + money(b.discount) + ' ₽</b></div>' : '') +
      (b.promo && b.subSave ? '<div class="cart-total-row"><span>Промокод и подписка</span><b>учтём выгоднейший</b></div>' : '') +
      (b.bonus ? '<div class="cart-total-row minus"><span>Планируем списать бонусами</span><b>−' + money(b.bonus) + ' ₽</b></div>' : '') +
      (b.gift ? '<div class="cart-total-row minus"><span>Сертификат</span><b>−' + money(b.gift) + ' ₽</b></div>' : '') +
      '<div class="cart-total-main"><span>Деньгами, ориентир от</span><b>' + money(b.due) + ' ₽</b></div>' +
      '<p class="cart-total-note">Это предварительный расчёт. Мастер проверит требования и зафиксирует одну точную смету. ' +
      'Бонусы фактически списываются только после её подтверждения и до первой оплаты.</p></div>';
  }
  function render() {
    if (!box || !body || !tab) return;
    var n = count(), b = benefits();
    tab.classList.toggle('is-empty', !n);
    var cn = tab.querySelector('.cart-tab-count'); if (cn) cn.textContent = n;
    tab.setAttribute('aria-label', 'Корзина, ' + positionLabel(n));
    document.querySelectorAll('[data-cart-submit]').forEach(function (el) {
      el.textContent = n ? 'Оформить корзину · ' + n : 'Отправить заявку мастеру';
    });
    if (!n) {
      body.innerHTML = '<div class="cart-empty"><div class="cart-empty-mark">¶</div><h3>Корзина пока пуста</h3>' +
        '<p>Настройте работу в калькуляторе и добавьте её сюда. Можно собрать несколько разных работ и оформить одной заявкой.</p>' +
        '<button type="button" class="btn btn-wax" data-cart-close>Вернуться к расчёту</button></div>' +
        (removed ? '<div class="cart-undo"><span>Позиция убрана</span><button type="button" data-cart-undo>Вернуть</button></div>' : '');
      return;
    }
    body.innerHTML = '<div class="cart-list">' + data.items.map(lineItem).join('') + '</div>' +
      (removed ? '<div class="cart-undo"><span>Позиция убрана</span><button type="button" data-cart-undo>Вернуть</button></div>' : '') +
      '<section class="cart-benefits"><div class="cart-benefits-head"><b>Выгода и способы зачёта</b></div>' +
      benefitHtml(b) + '</section>' + totalsHtml(b) +
      '<div class="cart-actions"><button type="button" class="btn btn-line" data-cart-another>+ Добавить ещё</button>' +
      '<button type="button" class="btn btn-wax" data-cart-checkout>Оформить вместе →</button></div>' +
      '<button type="button" class="cart-clear" data-cart-clear>Очистить корзину</button>' +
      '<p class="cart-legal">Корзина — локальный черновик на этом устройстве. Промокод, подписка, бонусы и сертификат ' +
      'окончательно применяются к согласованной цене по правилам программы лояльности.</p>';
  }
  function build() {
    tab = document.createElement('button');
    tab.type = 'button'; tab.className = 'cart-tab is-empty';
    tab.innerHTML = '<span class="cart-tab-mark">Картотека</span><b>Корзина</b><span class="cart-tab-count">0</span>';
    document.body.appendChild(tab);
    box = document.createElement('div');
    box.className = 'cart-shell'; box.setAttribute('aria-hidden', 'true');
    box.innerHTML = '<button type="button" class="cart-back" data-cart-close tabindex="-1" aria-label="Закрыть корзину"></button>' +
      '<aside class="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cartTitle">' +
      '<header class="cart-head"><div><span class="cart-folio">Сводный лист заказа</span><h2 id="cartTitle">Корзина работ</h2>' +
      '<p>Одна заявка · отдельная строка на каждую работу</p></div>' +
      '<button type="button" class="cart-close" data-cart-close aria-label="Закрыть">×</button></header>' +
      '<div class="cart-body"></div></aside>';
    document.body.appendChild(box);
    body = box.querySelector('.cart-body');
    var aside = document.querySelector('.conf-aside .sheet');
    if (aside) {
      var a = document.createElement('button'); a.type = 'button'; a.className = 'cart-add';
      a.setAttribute('data-cart-add', '1'); a.textContent = 'Добавить этот расчёт в корзину';
      aside.appendChild(a);
    }
    var submit = document.getElementById('btnSubmit');
    if (submit) {
      submit.setAttribute('data-cart-submit', '1');
      var a2 = document.createElement('button'); a2.type = 'button'; a2.className = 'cart-add';
      a2.setAttribute('data-cart-add', '1'); a2.textContent = 'Добавить эту позицию и выбрать ещё';
      submit.insertAdjacentElement('afterend', a2);
    }
    tab.addEventListener('click', open);
    box.addEventListener('click', click);
    box.addEventListener('input', input);
    box.addEventListener('keydown', trap);
  }
  function open() {
    if (!box) return;
    lastFocus = document.activeElement;
    render(); box.classList.add('open'); box.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
    setTimeout(function () { var x = box.querySelector('.cart-close'); if (x) x.focus(); }, 30);
  }
  function close() {
    if (!box) return;
    box.classList.remove('open'); box.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function click(e) {
    var t = e.target, item = t.closest('.cart-item'), id = item && item.getAttribute('data-cart-id');
    if (t.closest('[data-cart-close]')) { close(); return; }
    if (t.closest('[data-cart-remove]')) { remove(t.closest('[data-cart-remove]').getAttribute('data-cart-remove')); return; }
    if (t.closest('[data-cart-undo]')) { undo(); return; }
    if (t.closest('[data-cart-qty]') && id) { setQty(id, parseInt(t.closest('[data-cart-qty]').getAttribute('data-cart-qty'), 10)); return; }
    if (t.closest('[data-cart-another]')) { close(); if (api && api.another) api.another(); return; }
    if (t.closest('[data-cart-checkout]')) { close(); if (api && api.checkout) api.checkout(); return; }
    if (t.closest('[data-cart-clear]')) {
      var go = function () { clear(); };
      if (S && S.confirm) S.confirm({ title:'Очистить корзину?', text:'Все позиции исчезнут с этого устройства.', okLabel:'Очистить', noLabel:'Оставить', danger:true })
        .then(function (r) { if (r && r.ok) go(); });
      else if (window.confirm('Очистить корзину?')) go();
    }
  }
  function input(e) {
    var t = e.target;
    if (t.hasAttribute('data-cart-note')) { setNote(t.getAttribute('data-cart-note'), t.value); return; }
    if (t.id === 'cartBonus') {
      data.checkout.useBonus = !!t.checked;
      var b = benefits(); data.checkout.bonusAmount = b.bonusCap; write(); return;
    }
    if (t.id === 'cartBonusRange') {
      data.checkout.bonusAmount = parseInt(t.value, 10) || 0;
      if (S && S.store) S.store.set(KEY, data);
      render();
    }
  }
  function trap(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    var f = Array.prototype.slice.call(box.querySelectorAll('button:not([disabled]),a[href],input:not([disabled])'))
      .filter(function (x) { return x.offsetParent !== null; });
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length-1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length-1]) { e.preventDefault(); f[0].focus(); }
  }
  function summary() {
    var q = quote();
    var rows = ['СОСТАВ КОРЗИНЫ · ' + positionLabel(count()).toUpperCase()];
    data.items.forEach(function (x, i) {
      var z = itemQuote(x), m = meta(x);
      rows.push('', (i + 1) + '. ' + x.label + ((x.qty || 1) > 1 ? ' × ' + x.qty : ''),
        m.join(' · '),
        x.topic ? 'Тема: ' + x.topic : '',
        x.deadline ? 'Срок клиента: ' + x.deadline : '',
        x.requirements ? 'Требования: ' + x.requirements : '',
        x.note && x.note !== x.topic ? 'Уточнение: ' + x.note : '',
        Array.isArray(x.answerLines) && x.answerLines.length ? 'Анкета услуги:\n' + x.answerLines.join('\n') : '',
        'Ориентир: ' + (x.fixed ? '' : 'от ') + money(z.low) + (z.high > z.low ? ' до ' + money(z.high) : '') + ' ₽');
    });
    rows.push('', 'Предварительный ориентир корзины: от ' + money(q.low) +
      (q.high > q.low ? ' до ' + money(q.high) : '') + ' ₽.');
    if (data.checkout.useBonus) rows.push('Пожелание клиента: списать до ' + money(benefits().bonus) + ' бонусов после согласования точной цены.');
    rows.push('Промокод, подписка, бонусы и сертификат применяются сервером к точной цене мастера.');
    return rows.filter(function (x) { return x !== ''; }).join('\n');
  }
  function first() { return data.items[0] || null; }
  function init(opts) {
    api = opts || {}; S = window.Salon;
    if (!S) return;
    read(); build(); render();
    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-cart-add]')) addCurrent();
    });
    window.addEventListener('storage', function (e) { if (e.key === KEY) { read(); notify(); } });
    if (S.api && S.api.token()) {
      S.api.get('/me').then(function (r) { if (r && r.ok) { member = r; render(); if (api.onChange) api.onChange(); } });
    }
  }
  window.SalonCart = {
    init:init, open:open, add:add, clear:clear, count:count, hasItems:function(){ return !!data.items.length; },
    items:function(){ return data.items.slice(); }, first:first, quote:quote, benefits:benefits,
    summary:summary, refresh:notify, positionLabel:positionLabel,
    bonusIntent:function(){ return data.checkout.useBonus ? benefits().bonus : 0; }
  };
})();
