/* ============================================================
   КОРЗИНА «КАРТОТЕКА»
   Локальный черновик комплексного заказа. Реальный заказ создаётся
   одним POST /orders; серверная цена и выгоды подтверждаются мастером.
   ============================================================ */
(function () {
  'use strict';
  var KEY = 'salon_cart_v1';
  var VERSION = 1;
  var api = null, S = null, box = null, tab = null, dock = null, body = null, foot = null;
  var data = { version: VERSION, items: [], checkout: { useBonus: false, bonusAmount: 0 }, updatedAt: 0 };
  var member = null, removed = null, undoTimer = null, lastFocus = null, pendingAddon = null;
  var visible = true, focusRestore = null;
  var benefitMessage = { promo:'', gift:'' };

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
    data.items.forEach(syncNeeds);
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
  function serviceById(id) {
    var found = null;
    (window.SalonServices || []).some(function (x) {
      if (x.id === id) { found = x; return true; }
      return false;
    });
    return found;
  }
  function requiredQuestions(serviceId) {
    var svc = serviceById(serviceId);
    return svc && Array.isArray(svc.ask) ? svc.ask.filter(function (q) { return !!q.req; }) : [];
  }
  function answerFor(item, q) {
    return String(item && item.answers && item.answers[q.id] || '').trim();
  }
  function syncNeeds(item) {
    if (!item || item.kind !== 'service') return item;
    item.needs = requiredQuestions(item.serviceId).reduce(function (n, q) {
      return n + (answerFor(item, q) ? 0 : 1);
    }, 0);
    return item;
  }
  function workById(id) {
    var found = null;
    data.items.some(function (x) {
      if (x.kind === 'work' && x.id === id) { found = x; return true; }
      return false;
    });
    return found;
  }
  function addonExists(serviceId, parentId, ignoreId) {
    return data.items.some(function (x) {
      return x.kind === 'service' && x.serviceId === serviceId &&
        String(x.parentId || '') === String(parentId || '') && x.id !== ignoreId;
    });
  }
  function count() {
    return data.items.reduce(function (n, x) { return n + Math.max(1, parseInt(x.qty, 10) || 1); }, 0);
  }
  function lineCount() { return data.items.length; }
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
    var promoHigh = d.promoCode && d.promoDeal ? dealAmount(q.high, d.promoDeal) : 0;
    var subSaveHigh = sub && sub.discount_pct
      ? Math.min(Math.round(q.high * sub.discount_pct / 100), sub.discount_cap || Infinity) : 0;
    var discountHigh = Math.max(promoHigh, subSaveHigh);
    var afterDiscountHigh = Math.max(0, q.high - discountHigh - bonus);
    var giftHigh = d.giftCode ? Math.min(d.giftBal || 0, afterDiscountHigh) : 0;
    return {
      quote:q, deal:d, sub:sub, promo:promo, subSave:subSave, discount:discount,
      discountKind:discountKind, bonusBalance:bonusBalance, bonusCap:bonusCap,
      bonus:bonus, gift:gift, due:Math.max(0, afterDiscount - gift),
      dueHigh:Math.max(0, afterDiscountHigh - giftHigh)
    };
  }
  function meta(x) {
    if (x.kind === 'service') {
      return [x.serviceMeta || 'услуга мастерской'].concat(
        x.needs ? ['детали можно уточнить позже'] : []
      ).concat(
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
  function equivalent(a, b) {
    if (!a || !b || a.kind !== b.kind || a.type !== b.type) return false;
    if (a.kind === 'service') {
      return JSON.stringify(a.answers || {}) === JSON.stringify(b.answers || {}) &&
        String(a.parentId || '') === String(b.parentId || '') &&
        String(a.topic || '') === String(b.topic || '') &&
        String(a.deadline || '') === String(b.deadline || '') &&
        String(a.requirements || '') === String(b.requirements || '');
    }
    return a.disc === b.disc && a.term === b.term && a.tier === b.tier &&
      String(a.topic || '') === String(b.topic || '') &&
      String(a.deadline || '') === String(b.deadline || '') &&
      String(a.requirements || '') === String(b.requirements || '');
  }
  function contains(item) {
    return data.items.some(function (x) { return equivalent(x, item); });
  }
  function add(item, opts) {
    if (!item || !item.type) return false;
    opts = opts || {};
    var existing = null;
    if (item.allowQty) {
      data.items.forEach(function (x) { if (!existing && x.allowQty && equivalent(x, item)) existing = x; });
    }
    if (existing) existing.qty = Math.min(10, (existing.qty || 1) + 1);
    else {
      if (data.items.length >= 30) {
        if (S && S.toast) S.toast('В одной смете может быть до 30 позиций', { type:'error' });
        return false;
      }
      item.id = uid(); item.qty = 1; item.note = item.note || ''; item.addedAt = Date.now();
      data.items.push(item);
    }
    write();
    if (tab) {
      tab.classList.remove('bump'); void tab.offsetWidth; tab.classList.add('bump');
    }
    if (!opts.silent && S && S.toast) {
      S.toast(existing ? 'Количество обновлено · ваша смета' : 'Добавлено в смету ✓');
    }
    if (!opts.silent) setTimeout(open, 90);
    return true;
  }
  function ensure(item) {
    if (!item || contains(item)) return false;
    return add(item, { silent:true });
  }
  function addCurrent() {
    if (!api || !api.getCurrent) return;
    var current = api.getCurrent();
    if (contains(current)) { open(); return true; }
    if (api.validateCurrent && api.validateCurrent() === false) return false;
    return add(current);
  }
  function remove(id) {
    var at = -1;
    data.items.forEach(function (x, i) { if (x.id === id) at = i; });
    if (at < 0) return;
    if (data.items[at].kind === 'work' && data.items.some(function (x) { return x.parentId === id; })) {
      if (S && S.toast) S.toast('Сначала уберите или перенесите дополнения этой работы');
      return;
    }
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
    focusRestore = { id:id, qty:d };
    write();
  }
  function setNote(id, value) {
    data.items.forEach(function (x) { if (x.id === id) x.note = String(value || '').slice(0, 240); });
    if (S && S.store) { data.updatedAt = Date.now(); S.store.set(KEY, data); }
  }
  function clear() {
    data.items = []; data.checkout = { useBonus:false, bonusAmount:0 }; removed = null;
    pendingAddon = null;
    write();
  }
  function serviceType(id) {
    return {
      plan:'svc_plan', ai:'svc_ai', review:'svc_review', tutor:'svc_tutor',
      norm:'svc_norm', defense:'svc_defense', defensepack:'svc_defense_pack'
    }[id] || 'custom';
  }
  function addonItem(svc, parentId, answers, existing) {
    answers = answers || {};
    var answerLines = [];
    (svc.ask || []).forEach(function (q) {
      var answer = String(answers[q.id] || '').trim();
      if (answer) answerLines.push((q.short || q.label) + ': ' + answer);
    });
    var item = existing || {};
    item.kind = 'service'; item.type = serviceType(svc.id); item.serviceId = svc.id;
    item.serviceCode = svc.code; item.label = svc.label;
    item.serviceMeta = 'дополнение к работе';
    item.low = svc.from; item.high = svc.fixed ? svc.from : (svc.to || svc.from);
    item.fixed = !!svc.fixed; item.allowQty = false; item.answers = answers;
    item.answerLines = answerLines; item.topic = item.topic || ''; item.deadline = item.deadline || '';
    item.requirements = item.requirements || ''; item.note = item.note || '';
    item.parentId = parentId || ''; item.isAddon = true;
    return syncNeeds(item);
  }
  function beginAddon(id, editId) {
    var svc = serviceById(id);
    if (!svc) return;
    var editing = null;
    if (editId) data.items.some(function (x) {
      if (x.id === editId) { editing = x; return true; }
      return false;
    });
    if (editing && !editing.isAddon && !editing.parentId) {
      pendingAddon = {
        serviceId:svc.id, parentId:'', answers:Object.assign({}, editing.answers || {}),
        editId:editing.id, standalone:true
      };
      render();
      setTimeout(function () {
        var field = box && box.querySelector('[data-cart-addon-answer]');
        if (field && field.focus) field.focus();
      }, 20);
      return;
    }
    var works = data.items.filter(function (x) { return x.kind === 'work'; });
    var available = works.filter(function (x) {
      return !addonExists(svc.id, x.id, editing && editing.id);
    });
    if (!available.length) {
      if (S && S.toast) S.toast('Эта услуга уже добавлена к каждой работе');
      return;
    }
    var parentId = editing && workById(editing.parentId) ? editing.parentId : available[0].id;
    var required = requiredQuestions(svc.id);
    if (works.length === 1 && !required.length && !editing) {
      add(addonItem(svc, parentId, {}));
      return;
    }
    pendingAddon = {
      serviceId:svc.id, parentId:parentId, answers:Object.assign({}, editing && editing.answers || {}),
      editId:editing ? editing.id : ''
    };
    render();
    setTimeout(function () {
      var target = box && box.querySelector('[data-cart-addon-answer], [data-cart-addon-parent], [data-cart-addon-confirm]');
      if (target && target.focus) target.focus();
    }, 20);
  }
  function savePendingAddon() {
    if (!pendingAddon) return false;
    var svc = serviceById(pendingAddon.serviceId);
    var parent = workById(pendingAddon.parentId);
    if (!svc || (!pendingAddon.standalone && !parent)) {
      if (S && S.toast) S.toast('Выберите работу для дополнения', { type:'error' });
      return false;
    }
    var missing = requiredQuestions(svc.id).filter(function (q) {
      return !String(pendingAddon.answers[q.id] || '').trim();
    })[0];
    if (missing) {
      if (S && S.toast) S.toast('Ответьте: ' + missing.label.toLowerCase(), { type:'error' });
      var field = box && box.querySelector('[data-cart-addon-answer="' + missing.id + '"]');
      if (field && field.focus) field.focus();
      return false;
    }
    if (!pendingAddon.standalone && addonExists(svc.id, parent.id, pendingAddon.editId)) {
      if (S && S.toast) S.toast('Эта услуга уже есть у выбранной работы');
      return false;
    }
    if (pendingAddon.editId) {
      var editing = null;
      data.items.some(function (x) {
        if (x.id === pendingAddon.editId) { editing = x; return true; }
        return false;
      });
      if (!editing) return false;
      if (pendingAddon.standalone) {
        editing.answers = pendingAddon.answers;
        editing.answerLines = [];
        (svc.ask || []).forEach(function (q) {
          var answer = String(pendingAddon.answers[q.id] || '').trim();
          if (answer) editing.answerLines.push((q.short || q.label) + ': ' + answer);
        });
        syncNeeds(editing);
      } else {
        addonItem(svc, parent.id, pendingAddon.answers, editing);
      }
      pendingAddon = null;
      write();
      return true;
    }
    var item = addonItem(svc, parent.id, pendingAddon.answers);
    pendingAddon = null;
    return add(item);
  }
  function validate() {
    var invalid = null;
    data.items.some(function (x) {
      syncNeeds(x);
      if (x.kind === 'service' && x.needs) { invalid = x; return true; }
      return false;
    });
    if (!invalid) return true;
    open();
    beginAddon(invalid.serviceId, invalid.id);
    if (S && S.toast) S.toast('Дополните обязательные сведения для «' + invalid.label + '»', { type:'error' });
    return false;
  }
  function lineItem(x, i) {
    var q = itemQuote(x), m = meta(x);
    var parent = x.parentId ? workById(x.parentId) : null;
    if (parent) m.unshift('Для: ' + parent.label);
    syncNeeds(x);
    var titleId = 'cartItem_' + esc(x.id);
    return '<article class="cart-item ' + (x.kind === 'service' ? 'is-service' : 'is-work') +
      (x.isAddon || x.parentId ? ' is-addon' : '') + '" data-cart-id="' + esc(x.id) +
      '" aria-labelledby="' + titleId + '">' +
      '<div class="cart-item-top"><div><h3 id="' + titleId + '">' + esc(x.label) + '</h3>' +
      '<div class="cart-item-meta">' + m.map(function (v) { return '<span>' + esc(v) + '</span>'; }).join('') + '</div></div>' +
      '<div class="cart-price"><b>' + (x.fixed ? '' : 'от ') + money(q.low) + ' ₽</b>' +
      '<small>' + (q.high > q.low ? 'до ' + money(q.high) + ' ₽' : (x.fixed ? 'фиксированная ставка' : 'точнее после проверки')) + '</small></div></div>' +
      '<details class="cart-item-extra"' + (x.note ? ' open' : '') + '><summary>Уточнение к позиции</summary>' +
      '<label class="sr-only" for="cartNote_' + esc(x.id) + '">Тема или уточнение для «' + esc(x.label) + '»</label>' +
      '<input id="cartNote_' + esc(x.id) + '" class="cart-note" data-cart-note="' + esc(x.id) +
      '" maxlength="240" value="' + esc(x.note || '') + '" placeholder="Например: две главы или особое требование"></details>' +
      '<div class="cart-item-foot">' +
      (x.allowQty ? '<div class="cart-qty" role="group" aria-label="Количество для «' + esc(x.label) + '»">' +
        '<button type="button" data-cart-qty="-1" aria-label="Уменьшить количество «' + esc(x.label) + '»"' +
        ((x.qty || 1) <= 1 ? ' disabled' : '') + '>−</button>' +
        '<b aria-live="polite">' + (x.qty || 1) + '</b>' +
        '<button type="button" data-cart-qty="1" aria-label="Увеличить количество «' + esc(x.label) + '»"' +
        ((x.qty || 1) >= 10 ? ' disabled' : '') + '>+</button></div>' :
        '<span class="cart-one">1 ' + (x.kind === 'service' ? 'услуга' : 'работа') + '</span>') +
      (x.kind === 'service' && x.isAddon
        ? '<button type="button" class="cart-complete' + (x.needs ? ' needs' : '') +
          '" data-cart-edit-addon="' + esc(x.id) + '">' +
          (x.needs ? 'Дополнить сведения' : 'Изменить работу') + '</button>' : '') +
      '<button type="button" class="cart-remove" data-cart-remove="' + esc(x.id) +
      '" aria-label="Убрать «' + esc(x.label) + '» из состава">Убрать</button></div></article>';
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
    }
    if (b.deal.giftCode) {
      out += '<div class="cart-benefit"><span class="cart-benefit-ico">С</span><span><b>Сертификат ' +
        esc(b.deal.giftCode) + '</b><small>Баланс ' + money(b.deal.giftBal || 0) +
        ' ₽; применяется после скидок и бонусов</small></span><span class="cart-benefit-val">−' +
        money(b.gift) + ' ₽</span></div>';
    }
    return out;
  }
  function benefitToolsHtml(b) {
    var promoOn = !!b.deal.promoCode;
    var giftOn = !!b.deal.giftCode;
    var out = '<section class="cart-tools" id="cartBenefits" aria-labelledby="cartToolsTitle">' +
      '<div class="cart-section-head"><span class="cart-section-no">02</span><div><h3 id="cartToolsTitle">Выгода</h3>' +
      '<p>Промокод, сертификат и бонусы применяются здесь</p></div></div>';
    out += '<div class="cart-tool' + (promoOn ? ' applied' : '') + '"><div class="cart-tool-copy">' +
      '<b>Промокод</b><small>' + (promoOn ? esc(b.deal.promoCode) + ' · ' +
        esc(b.deal.promoLabel || 'применён') : 'Скидка на предварительный ориентир') + '</small></div>' +
      (promoOn
        ? '<span class="cart-tool-value">' + (b.promo ? '−' + money(b.promo) + ' ₽' : 'ждёт порога') + '</span>' +
          '<button type="button" class="cart-tool-remove" data-cart-promo-remove aria-label="Убрать промокод">×</button>'
        : '<div class="cart-code"><label class="sr-only" for="cartPromoInput">Промокод</label>' +
          '<input id="cartPromoInput" maxlength="24" autocomplete="off" placeholder="Промокод">' +
          '<button type="button" data-cart-promo-apply>Применить</button></div>') +
      (benefitMessage.promo ? '<p class="cart-tool-msg" role="status">' + esc(benefitMessage.promo) + '</p>' : '') + '</div>';
    out += '<div class="cart-tool' + (giftOn ? ' applied' : '') + '"><div class="cart-tool-copy">' +
      '<b>Сертификат</b><small>' + (giftOn ? esc(b.deal.giftCode) + ' · баланс ' +
        money(b.deal.giftBal || 0) + ' ₽' : 'Оплата кодом, остаток не сгорает') + '</small></div>' +
      (giftOn
        ? '<span class="cart-tool-value">−' + money(b.gift) + ' ₽</span>' +
          '<button type="button" class="cart-tool-remove" data-cart-gift-remove aria-label="Убрать сертификат">×</button>'
        : '<div class="cart-code"><label class="sr-only" for="cartGiftInput">Код сертификата</label>' +
          '<input id="cartGiftInput" maxlength="24" autocomplete="off" placeholder="AS-XXXX-XXXX-XXXX">' +
          '<button type="button" data-cart-gift-apply>Применить</button></div>') +
      (benefitMessage.gift ? '<p class="cart-tool-msg" role="status">' + esc(benefitMessage.gift) + '</p>' : '') + '</div>';
    if (member && member.bonus) {
      out += '<div class="cart-tool cart-tool-bonus"><div class="cart-tool-copy">' +
        '<label class="cart-bonus-toggle"><input type="checkbox" id="cartBonus"' +
        (data.checkout.useBonus ? ' checked' : '') + (b.bonusCap ? '' : ' disabled') +
        '><b>Списать бонусы</b></label><small>Баланс ' + money(b.bonusBalance) +
        ' · доступно до ' + money(b.bonusCap) + ' ₽</small></div><span class="cart-tool-value">' +
        (data.checkout.useBonus ? '−' + money(b.bonus) + ' ₽' : 'не выбрано') + '</span>' +
        (data.checkout.useBonus && b.bonusCap
          ? '<div class="cart-bonus-quick"><button type="button" data-cart-bonus="500">500</button>' +
            '<button type="button" data-cart-bonus="1000">1 000</button>' +
            '<button type="button" data-cart-bonus="max">Максимум</button></div>' : '') + '</div>';
    } else {
      out += '<a class="cart-tool cart-tool-login" href="dashboard.html"><div class="cart-tool-copy"><b>Бонусы</b>' +
        '<small>Войдите — покажем баланс и доступное списание</small></div><span>Войти →</span></a>';
    }
    if (b.sub) {
      out += '<div class="cart-tool applied"><div class="cart-tool-copy"><b>' +
        esc(b.sub.label || 'Салон+') + '</b><small>Применяется автоматически, если это выгоднее промокода</small></div>' +
        '<span class="cart-tool-value">−' + money(b.subSave) + ' ₽</span></div>';
    }
    return out + '</section>';
  }
  function addonsHtml() {
    var works = data.items.filter(function (x) { return x.kind === 'work'; });
    if (!works.length) return '';
    var ids = ['norm', 'defense', 'ai', 'review'];
    var rows = [];
    ids.forEach(function (id) {
      var svc = serviceById(id);
      if (!svc) return;
      var available = works.some(function (x) { return !addonExists(id, x.id); });
      rows.push('<button type="button" data-cart-addon="' + id + '"' + (available ? '' : ' disabled') + '>' +
        '<span>' + (available ? '+' : '✓') + ' ' + esc(svc.label) + '</span><b>' +
        (available ? 'от ' + money(svc.from) + ' ₽' : 'добавлено') + '</b></button>');
    });
    return '<section class="cart-addons"><div class="cart-section-head compact"><span class="cart-section-no">+</span>' +
      '<div><h3>Дополнить работу</h3><p>Добавляется к той же заявке одним нажатием</p></div></div>' +
      '<div class="cart-addon-list">' + rows.join('') + '</div></section>';
  }
  function addonComposerHtml() {
    if (!pendingAddon) return '';
    var svc = serviceById(pendingAddon.serviceId);
    if (!svc) return '';
    var works = data.items.filter(function (x) {
      return x.kind === 'work' && !addonExists(svc.id, x.id, pendingAddon.editId);
    });
    var options = works.map(function (x) {
      return '<option value="' + esc(x.id) + '"' +
        (x.id === pendingAddon.parentId ? ' selected' : '') + '>' + esc(x.label) + '</option>';
    }).join('');
    var questions = requiredQuestions(svc.id).map(function (q) {
      var value = String(pendingAddon.answers[q.id] || '');
      return '<label class="cart-addon-field"><span>' + esc(q.label) + ' <b>обязательно</b></span>' +
        '<input type="text" maxlength="160" data-cart-addon-answer="' + esc(q.id) +
        '" value="' + esc(value) + '" placeholder="' + esc(q.ph || 'Уточните для мастера') + '"></label>';
    }).join('');
    return '<section class="cart-addon-compose" id="cartAddonCompose" aria-labelledby="cartAddonTitle">' +
      '<div class="cart-section-head compact"><span class="cart-section-no">+</span><div><h3 id="cartAddonTitle">' +
      (pendingAddon.editId ? 'Дополнить сведения' : 'Куда добавить услугу?') + '</h3><p>' +
      esc(svc.label) + '</p></div></div>' +
      (pendingAddon.standalone ? '' :
        '<label class="cart-addon-field"><span>Работа</span><select data-cart-addon-parent>' + options + '</select></label>') +
      questions + '<div class="cart-addon-compose-actions"><button type="button" class="btn btn-line" data-cart-addon-cancel>Отмена</button>' +
      '<button type="button" class="btn btn-wax" data-cart-addon-confirm>' +
      (pendingAddon.editId ? 'Сохранить' : 'Добавить к работе') + '</button></div></section>';
  }
  function totalsHtml(b) {
    var discountLabel = b.discountKind === 'promo' ? 'Промокод' : (b.discountKind === 'sub' ? 'Салон+' : 'Скидки');
    var hasBenefit = !!(b.discount || b.bonus || b.gift);
    return '<div class="cart-totals">' +
      '<div class="cart-total-main' + (hasBenefit ? ' has-benefit' : '') + '"><span>Предварительная стоимость</span><b>' +
      (hasBenefit ? '<s>' : '') + money(b.quote.low) +
      (b.quote.high > b.quote.low ? '–' + money(b.quote.high) : '') + ' ₽' + (hasBenefit ? '</s>' : '') + '</b></div>' +
      (b.discount ? '<div class="cart-total-row minus"><span>' + discountLabel + '</span><b>−' + money(b.discount) + ' ₽</b></div>' : '') +
      (b.promo && b.subSave ? '<div class="cart-total-row"><span>Промокод и подписка</span><b>учтём выгоднейший</b></div>' : '') +
      (b.bonus ? '<div class="cart-total-row minus"><span>Планируем списать бонусами</span><b>−' + money(b.bonus) + ' ₽</b></div>' : '') +
      (b.gift ? '<div class="cart-total-row minus"><span>Сертификат</span><b>−' + money(b.gift) + ' ₽</b></div>' : '') +
      (hasBenefit ? '<div class="cart-total-after"><span>Предварительно деньгами, от</span><b>' +
        money(b.due) + (b.dueHigh > b.due ? '–' + money(b.dueHigh) : '') + ' ₽</b></div>' : '') +
      '<p class="cart-total-note">Это предварительный расчёт. Мастер проверит материалы и зафиксирует точную сумму до оплаты.</p></div>';
  }
  function entryHtml(n, compact) {
    var q = quote();
    return '<span class="cart-entry-icon" aria-hidden="true">¶</span>' +
      '<span class="cart-entry-copy"><b>Ваша смета</b>' +
      '<small>' + (n ? positionLabel(n) + ' · от ' + money(q.low) + ' ₽' :
        (compact ? 'можно объединить' : 'работы + услуги в одной заявке')) + '</small>' +
      '</span><span class="cart-tab-count" role="status" aria-live="polite">' + n + '</span>';
  }
  function syncEntry(el, n, compact) {
    if (!el) return;
    el.classList.toggle('is-empty', !n);
    el.hidden = !visible;
    el.innerHTML = entryHtml(n, compact);
    el.setAttribute('aria-label', n ? 'Открыть смету, ' + positionLabel(n) :
      'Открыть пустую смету и узнать, как объединить работы и услуги');
    el.setAttribute('aria-expanded', box && box.classList.contains('open') ? 'true' : 'false');
  }
  function render() {
    if (!box || !body || !foot) return;
    var n = lineCount(), b = benefits();
    syncEntry(tab, n, true);
    syncEntry(dock, n, false);
    var current = api && api.getCurrent ? api.getCurrent() : null;
    var currentSaved = current && contains(current);
    document.querySelectorAll('[data-cart-add]').forEach(function (el) {
      el.classList.toggle('saved', !!currentSaved);
      el.textContent = currentSaved
        ? 'В смете · открыть'
        : 'Добавить ' + (current && current.kind === 'service' ? 'услугу' : 'работу') + ' в смету';
    });
    document.querySelectorAll('[data-cart-submit]').forEach(function (el) {
      el.textContent = el.getAttribute('data-cart-submit-label') || 'Отправить заявку мастеру';
    });
    var guide = '<nav class="cart-guide" aria-label="Этапы оформления">' +
      '<button type="button" class="done" data-cart-jump="cartItems"><b>01</b> Состав</button><i></i><button type="button" class="' +
      ((b.discount || b.bonus || b.gift) ? 'done' : '') + '" data-cart-jump="cartBenefits"><b>02</b> Выгода</button><i></i>' +
      '<button type="button" data-cart-checkout' + (n ? '' : ' disabled') + '><b>03</b> Отправка</button></nav>';
    if (!n) {
      body.innerHTML = guide + '<div class="cart-empty" id="cartItems"><div class="cart-empty-mark">¶</div>' +
        '<h3>Работы и услуги можно объединять</h3>' +
        '<p>Соберите одну понятную смету: основная работа, дополнения и выгоды — мастер проверит всё вместе.</p>' +
        '<div class="cart-empty-actions"><button type="button" class="btn btn-wax" data-cart-another="work">Выбрать работу</button>' +
        '<button type="button" class="btn btn-line" data-cart-another="service">Выбрать услугу</button></div></div>' +
        benefitToolsHtml(b) +
        (removed ? '<div class="cart-undo"><span>Позиция убрана</span><button type="button" data-cart-undo>Вернуть</button></div>' : '');
      foot.innerHTML = '<p class="cart-empty-foot">Добавьте первую позицию — ориентир появится сразу. Сейчас платить ничего не нужно.</p>';
      return;
    }
    var works = data.items.filter(function (x) { return x.kind !== 'service'; });
    var services = data.items.filter(function (x) { return x.kind === 'service'; });
    var unattached = services.filter(function (x) { return !workById(x.parentId); });
    var groups = '<section class="cart-group" id="cartItems"><div class="cart-section-head"><span class="cart-section-no">01</span>' +
      '<div><h3>Позиции сметы</h3><p>' + positionLabel(n) + ' · можно изменить до отправки</p></div></div>';
    if (works.length) groups += '<h4>Работы и дополнения</h4><div class="cart-work-groups">' +
      works.map(function (work) {
        var children = services.filter(function (x) { return x.parentId === work.id; });
        return '<div class="cart-work-group">' + lineItem(work, data.items.indexOf(work)) +
          (children.length ? '<div class="cart-child-list" aria-label="Дополнения к «' + esc(work.label) + '»">' +
            children.map(function (x) { return lineItem(x, data.items.indexOf(x)); }).join('') + '</div>' : '') + '</div>';
      }).join('') + '</div>';
    if (unattached.length) groups += '<h4>Самостоятельные услуги</h4><div class="cart-list service-list">' +
      unattached.map(function (x) { return lineItem(x, data.items.indexOf(x)); }).join('') + '</div>';
    groups += '</section>';
    body.innerHTML = guide + groups + addonComposerHtml() + addonsHtml() +
      (removed ? '<div class="cart-undo"><span>Позиция убрана</span><button type="button" data-cart-undo>Вернуть</button></div>' : '') +
      benefitToolsHtml(b) +
      '<button type="button" class="cart-clear" data-cart-clear>Очистить состав</button>' +
      '<p class="cart-legal">До отправки состав хранится только на этом устройстве.</p>';
    foot.innerHTML = totalsHtml(b) +
      '<div class="cart-actions"><div class="cart-add-more"><button type="button" data-cart-another="work">+ Работа</button>' +
      '<button type="button" data-cart-another="service">+ Услуга</button></div>' +
      '<button type="button" class="btn btn-wax" data-cart-checkout>Продолжить · контакты →</button></div>';
    if (focusRestore) {
      var fr = focusRestore; focusRestore = null;
      requestAnimationFrame(function () {
        var row = Array.prototype.find.call(box.querySelectorAll('[data-cart-id]'), function (x) {
          return x.getAttribute('data-cart-id') === fr.id;
        });
        var el = row && row.querySelector('[data-cart-qty="' + fr.qty + '"]');
        if (el) el.focus();
      });
    }
  }
  function build() {
    tab = document.createElement('button');
    tab.type = 'button'; tab.className = 'cart-tab is-empty'; tab.setAttribute('data-cart-open', '1');
    tab.setAttribute('aria-controls', 'cartDrawer'); tab.setAttribute('aria-expanded', 'false');
    var mqBar = document.querySelector('.mq-bar');
    var mqNext = document.getElementById('mNext');
    if (mqBar) mqBar.insertBefore(tab, mqNext || null);
    else document.body.appendChild(tab);
    var docHead = document.querySelector('.lq-dochead');
    if (docHead) {
      dock = document.createElement('button');
      dock.type = 'button'; dock.className = 'cart-dock is-empty'; dock.setAttribute('data-cart-open', '1');
      dock.setAttribute('aria-controls', 'cartDrawer'); dock.setAttribute('aria-expanded', 'false');
      docHead.appendChild(dock);
    }
    box = document.createElement('div');
    box.className = 'cart-shell'; box.id = 'cartDrawer'; box.setAttribute('aria-hidden', 'true');
    box.innerHTML = '<button type="button" class="cart-back" data-cart-close tabindex="-1" aria-label="Закрыть смету"></button>' +
      '<aside class="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cartTitle" aria-describedby="cartIntro">' +
      '<span class="cart-handle" aria-hidden="true"></span>' +
      '<header class="cart-head"><div><span class="cart-folio">Конструктор сметы</span><h2 id="cartTitle">Ваша смета</h2>' +
      '<p id="cartIntro">Работы, дополнения и выгоды — в одном месте</p></div>' +
      '<button type="button" class="cart-close" data-cart-close aria-label="Закрыть">×</button></header>' +
      '<div class="cart-body"></div><footer class="cart-foot"></footer></aside>';
    document.body.appendChild(box);
    body = box.querySelector('.cart-body');
    foot = box.querySelector('.cart-foot');
    var aside = document.querySelector('.conf-aside .sheet');
    if (aside) {
      var a = document.createElement('button'); a.type = 'button'; a.className = 'cart-add';
      a.setAttribute('data-cart-add', '1'); a.textContent = 'Добавить работу в смету';
      aside.appendChild(a);
    }
    var submit = document.getElementById('btnSubmit');
    if (submit) {
      submit.setAttribute('data-cart-submit', '1');
    }
    document.querySelectorAll('[data-cart-open]').forEach(function (el) { el.addEventListener('click', open); });
    box.addEventListener('click', click);
    box.addEventListener('input', input);
    box.addEventListener('change', change);
    box.addEventListener('keydown', trap);
  }
  function open() {
    if (!box || !visible) return;
    lastFocus = document.activeElement;
    render(); box.classList.add('open'); box.setAttribute('aria-hidden', 'false');
    document.querySelectorAll('[data-cart-open]').forEach(function (el) { el.setAttribute('aria-expanded', 'true'); });
    document.documentElement.style.overflow = 'hidden';
    setTimeout(function () { var x = box.querySelector('.cart-close'); if (x) x.focus(); }, 30);
  }
  function close() {
    if (!box) return;
    box.classList.remove('open'); box.setAttribute('aria-hidden', 'true');
    document.querySelectorAll('[data-cart-open]').forEach(function (el) { el.setAttribute('aria-expanded', 'false'); });
    document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function click(e) {
    var t = e.target, item = t.closest('.cart-item'), id = item && item.getAttribute('data-cart-id');
    if (t.closest('[data-cart-close]')) { close(); return; }
    if (t.closest('[data-cart-remove]')) { remove(t.closest('[data-cart-remove]').getAttribute('data-cart-remove')); return; }
    if (t.closest('[data-cart-undo]')) { undo(); return; }
    if (t.closest('[data-cart-qty]') && id) { setQty(id, parseInt(t.closest('[data-cart-qty]').getAttribute('data-cart-qty'), 10)); return; }
    if (t.closest('[data-cart-addon]')) { beginAddon(t.closest('[data-cart-addon]').getAttribute('data-cart-addon')); return; }
    if (t.closest('[data-cart-edit-addon]')) {
      var editId = t.closest('[data-cart-edit-addon]').getAttribute('data-cart-edit-addon');
      var editItem = null;
      data.items.some(function (x) { if (x.id === editId) { editItem = x; return true; } return false; });
      if (editItem) beginAddon(editItem.serviceId, editItem.id);
      return;
    }
    if (t.closest('[data-cart-addon-cancel]')) { pendingAddon = null; render(); return; }
    if (t.closest('[data-cart-addon-confirm]')) { savePendingAddon(); return; }
    if (t.closest('[data-cart-another]')) {
      var kind = t.closest('[data-cart-another]').getAttribute('data-cart-another') || 'work';
      close(); if (api && api.another) api.another(kind); return;
    }
    if (t.closest('[data-cart-checkout]')) {
      if (!validate()) return;
      close(); if (api && api.checkout) api.checkout(); return;
    }
    if (t.closest('[data-cart-jump]')) {
      var jump = box.querySelector('#' + t.closest('[data-cart-jump]').getAttribute('data-cart-jump'));
      if (jump && jump.scrollIntoView) jump.scrollIntoView({
        block:'start',
        behavior:S && S.reduceMotion ? 'auto' : 'smooth'
      });
      return;
    }
    if (t.closest('[data-cart-promo-apply]')) {
      var promoInput = box.querySelector('#cartPromoInput');
      var promoValue = promoInput ? promoInput.value.trim() : '';
      benefitMessage.promo = '';
      if (!promoValue) { benefitMessage.promo = 'Введите промокод'; render(); return; }
      t.closest('[data-cart-promo-apply]').disabled = true;
      if (api && api.applyPromo) api.applyPromo(promoValue, function (r) {
        benefitMessage.promo = r && r.ok ? '' : ((r && r.message) || 'Не получилось проверить код');
        render();
      });
      return;
    }
    if (t.closest('[data-cart-gift-apply]')) {
      var giftInput = box.querySelector('#cartGiftInput');
      var giftValue = giftInput ? giftInput.value.trim() : '';
      benefitMessage.gift = '';
      if (!giftValue) { benefitMessage.gift = 'Введите код сертификата'; render(); return; }
      t.closest('[data-cart-gift-apply]').disabled = true;
      if (api && api.applyGift) api.applyGift(giftValue, function (r) {
        benefitMessage.gift = r && r.ok ? '' : ((r && r.message) || 'Не получилось проверить сертификат');
        render();
      });
      return;
    }
    if (t.closest('[data-cart-promo-remove]')) {
      benefitMessage.promo = ''; if (api && api.removePromo) api.removePromo(); return;
    }
    if (t.closest('[data-cart-gift-remove]')) {
      benefitMessage.gift = ''; if (api && api.removeGift) api.removeGift(); return;
    }
    if (t.closest('[data-cart-bonus]')) {
      var raw = t.closest('[data-cart-bonus]').getAttribute('data-cart-bonus');
      var cap = benefits().bonusCap;
      data.checkout.useBonus = true;
      data.checkout.bonusAmount = raw === 'max' ? cap : Math.min(parseInt(raw, 10) || 0, cap);
      write(); return;
    }
    if (t.closest('[data-cart-clear]')) {
      var go = function () { clear(); };
      if (S && S.confirm) S.confirm({ title:'Очистить состав?', text:'Все позиции исчезнут с этого устройства.', okLabel:'Очистить', noLabel:'Оставить', danger:true })
        .then(function (r) { if (r && r.ok) go(); });
      else if (window.confirm('Очистить состав?')) go();
    }
  }
  function input(e) {
    var t = e.target;
    if (pendingAddon && t.hasAttribute('data-cart-addon-answer')) {
      pendingAddon.answers[t.getAttribute('data-cart-addon-answer')] = t.value;
      return;
    }
    if (t.hasAttribute('data-cart-note')) { setNote(t.getAttribute('data-cart-note'), t.value); return; }
    if (t.id === 'cartBonus') {
      data.checkout.useBonus = !!t.checked;
      var b = benefits(); data.checkout.bonusAmount = b.bonusCap; write(); return;
    }
    if (t.id === 'cartBonusRange') {
      data.checkout.bonusAmount = parseInt(t.value, 10) || 0;
      var row = t.closest('.cart-benefit');
      var val = row && row.querySelector('.cart-benefit-val');
      if (val) val.textContent = '−' + money(data.checkout.bonusAmount) + ' ₽';
    }
  }
  function change(e) {
    if (pendingAddon && e.target && e.target.hasAttribute('data-cart-addon-parent')) {
      pendingAddon.parentId = e.target.value;
      return;
    }
    if (e.target && e.target.id === 'cartBonusRange') {
      data.updatedAt = Date.now();
      if (S && S.store) S.store.set(KEY, data);
      render();
    }
  }
  function trap(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Enter' && e.target && e.target.id === 'cartPromoInput') {
      e.preventDefault(); var pb = box.querySelector('[data-cart-promo-apply]'); if (pb) pb.click(); return;
    }
    if (e.key === 'Enter' && e.target && e.target.id === 'cartGiftInput') {
      e.preventDefault(); var gb = box.querySelector('[data-cart-gift-apply]'); if (gb) gb.click(); return;
    }
    if (e.key !== 'Tab') return;
    var f = Array.prototype.slice.call(box.querySelectorAll(
      'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled])'
    ))
      .filter(function (x) { return x.offsetParent !== null; });
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length-1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length-1]) { e.preventDefault(); f[0].focus(); }
  }
  function summary() {
    var q = quote();
    var rows = ['СОСТАВ ЗАЯВКИ · ' + positionLabel(count()).toUpperCase()];
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
    rows.push('', 'Предварительный ориентир заявки: от ' + money(q.low) +
      (q.high > q.low ? ' до ' + money(q.high) : '') + ' ₽.');
    if (data.checkout.useBonus) rows.push('Пожелание клиента: списать до ' + money(benefits().bonus) + ' бонусов после согласования точной цены.');
    rows.push('Промокод, подписка, бонусы и сертификат применяются сервером к точной цене мастера.');
    return rows.filter(function (x) { return x !== ''; }).join('\n');
  }
  function payload() {
    var q = quote();
    return {
      version: VERSION,
      schema_version: '2.0-request',
      legal_status: 'request_only_not_contract_price',
      currency: 'RUB',
      items: data.items.map(function (x, i) {
        var clientId = String(x.id || '');
        var qPreview = itemQuote(x);
        var legalType = x.kind === 'service' ? 'consultation' : 'methodological_material';
        if (/edit|red|corr/i.test(String(x.type || '') + ' ' + String(x.serviceId || ''))) legalType = 'editing';
        if (/format|norm|gost/i.test(String(x.type || '') + ' ' + String(x.serviceId || ''))) legalType = 'formatting';
        if (/tutor|consult|razbor/i.test(String(x.type || '') + ' ' + String(x.serviceId || ''))) legalType = 'consultation';
        return {
          client_id: clientId,
          requested_line_id: clientId,
          position: i + 1,
          selected_by_customer: true,
          kind: x.kind === 'service' ? 'service' : 'work',
          legal_service_type: legalType,
          type: String(x.type || ''),
          service_id: String(x.serviceId || ''),
          label: String(x.label || '').slice(0, 160),
          qty: Math.max(1, Math.min(10, parseInt(x.qty, 10) || 1)),
          unit: (parseInt(x.qty, 10) || 1) > 1 ? 'идентичная единица услуги' : 'позиция',
          unit_definition_pending: true,
          disc: String(x.disc || ''),
          term: String(x.term || ''),
          tier: String(x.tier || ''),
          topic: String(x.topic || '').slice(0, 400),
          deadline: String(x.deadline || '').slice(0, 120),
          schedule: {
            customer_requested_deadline: String(x.deadline || '').slice(0, 120),
            contractor_due_at_pending: true,
            start_conditions_pending: true
          },
          requirements: String(x.requirements || '').slice(0, 1500),
          note: String(x.note || '').slice(0, 240),
          parent_client_id: String(x.parentId || ''),
          parent_requested_line_id: String(x.parentId || ''),
          separability_pending: true,
          scope: {
            topic: String(x.topic || '').slice(0, 400),
            customer_requirements: String(x.requirements || '').slice(0, 1500),
            included_pending: true,
            excluded_pending: true
          },
          deliverables_pending: true,
          acceptance_criteria_pending: true,
          corrections_pending: true,
          price_status: 'estimate_only',
          answers: x.answers && typeof x.answers === 'object' ? x.answers : {},
          quote_preview: qPreview
        };
      }),
      specification_required_before_payment: true,
      required_contract_fields: [
        'server_line_id', 'unit_definition', 'included', 'excluded', 'customer_inputs',
        'deliverables', 'contractor_due_at', 'dependencies', 'acceptance_criteria',
        'unit_price_minor', 'line_price_minor', 'discount_allocations',
        'payment_stage_allocations', 'cancellation_effect'
      ],
      benefits_intent: { use_bonus:!!data.checkout.useBonus, bonus_amount:benefits().bonus || 0 },
      quote_preview: { low:q.low, high:q.high }
    };
  }
  function snapshot() {
    var q = quote();
    return {
      count:lineCount(), units:count(), low:q.low, high:q.high,
      items:data.items.map(function (x) {
        var z = itemQuote(x);
        return { label:x.label, qty:x.qty || 1, low:z.low, high:z.high, fixed:!!x.fixed };
      })
    };
  }
  function setVisible(next) {
    visible = next !== false;
    if (!visible) close();
    render();
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
    summary:summary, payload:payload, snapshot:snapshot, contains:contains, ensure:ensure,
    setVisible:setVisible, refresh:notify, positionLabel:positionLabel, validate:validate,
    bonusIntent:function(){ return data.checkout.useBonus ? benefits().bonus : 0; }
  };
  /* Изолированный Node-harness включает этот адаптер флагом до загрузки файла.
     В обычном браузере дополнительного публичного API нет. */
  if (window.__SALON_CART_TEST__) {
    window.__SalonCartTest = {
      reset:function(next, opts) {
        opts = opts || {};
        data = next || { version:VERSION, items:[], checkout:{ useBonus:false, bonusAmount:0 }, updatedAt:0 };
        data.checkout = data.checkout || { useBonus:false, bonusAmount:0 };
        S = opts.S || S;
        api = opts.api || {};
        box = tab = dock = body = foot = null;
        pendingAddon = null;
        data.items.forEach(syncNeeds);
      },
      state:function() { return JSON.parse(JSON.stringify(data)); },
      read:read, write:write, payload:payload, validate:validate,
      addCurrent:addCurrent, equivalent:equivalent, addonItem:addonItem,
      beginAddon:beginAddon, savePendingAddon:savePendingAddon,
      pending:function() { return pendingAddon ? JSON.parse(JSON.stringify(pendingAddon)) : null; },
      setPendingParent:function(id) { if (pendingAddon) pendingAddon.parentId = id; },
      setPendingAnswer:function(id, value) { if (pendingAddon) pendingAddon.answers[id] = value; }
    };
  }
})();
