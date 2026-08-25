(function (root, factory) {
  'use strict';
  var campaign = factory();
  if (typeof module === 'object' && module.exports) module.exports = campaign;
  if (root && root.document) {
    root.SalonPromoCampaign = campaign;
    campaign.boot(root);
  }
}(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var CAMPAIGNS = {
    welcome: {
      id:'welcome-v1', code:'ПЕРВЫЙЛИСТ', pct:12, floor:0,
      cap:5000, minPrice:2500, expiresAt:'2026-09-21'
    },
    retention: {
      id:'retention-v1', pct:10, floor:0,
      cap:2500, minPrice:5000, durationHours:72,
      issueEndsAt:'2026-09-18T20:59:59Z'
    }
  };
  var RESCUE_DECISIONS = {
    price:{
      id:'price', label:'Цена выше ожиданий', kind:'discount', requestRetention:true,
      title:'Проверим скидку 10%',
      description:'Код действует 72 часа и уменьшит согласованную цену максимум на 2 500 ₽. Если уже есть более выгодное предложение, оно сохранится.',
      action:'Применить 10% и продолжить'
    },
    materials:{
      id:'materials', label:'Не хватает материалов', kind:'local', requestRetention:false,
      title:'Файлы можно приложить позже',
      description:'Сейчас достаточно описать, что уже готово и чего не хватает, — минимум 40 знаков. Точную смету редактор подтвердит после просмотра материала.',
      action:'Описать вместо файла'
    },
    unclear:{
      id:'unclear', label:'Не понимаю состав', kind:'local', requestRetention:false,
      title:'Итог уже готов',
      description:'В нём уже видны первый результат, срок и ориентир цены. Отправка заявки бесплатна, а условия вы подтвердите до оплаты.',
      action:'Вернуться к итогу'
    },
    deadline:{
      id:'deadline', label:'Нужно согласовать срок', kind:'local', requestRetention:false,
      title:'Срок можно оставить гибким',
      description:'Редактор уточнит реальную дату после просмотра материалов. До согласования работа и оплата не начнутся.',
      action:'Уточнить срок'
    }
  };
  var WELCOME_SEEN = 'salon_promo_welcome_v1_seen';
  var RETENTION_LEFT = 'salon_promo_retention_v1_left';
  var RETENTION_DISMISSED = 'salon_promo_retention_v1_dismissed';
  var IMAGE_WEBP_PATH = 'assets/img/promo-salon-welcome.webp?v=20260825promo3';
  var IMAGE_FALLBACK_PATH = 'assets/img/promo-salon-welcome.png';
  var startedAt = 0;
  var visibleStartedAt = 0;
  var visibleElapsedMs = 0;
  var resolvedEligibility = null;
  var resolvedFootprint = null;
  var openLayer = null;
  var dialogSequence = 0;

  function rescueDecision(reason) {
    var decision = RESCUE_DECISIONS[String(reason || '')];
    if (!decision) return null;
    return {
      id:decision.id,
      label:decision.label,
      kind:decision.kind,
      requestRetention:decision.requestRetention,
      title:decision.title,
      description:decision.description,
      action:decision.action
    };
  }

  function discount(schedule, rawPrice) {
    var price = Math.max(0, Math.floor(Number(rawPrice) || 0));
    if (!schedule || price < schedule.minPrice) return 0;
    var amount = Math.round(price * schedule.pct / 100);
    amount = Math.max(schedule.floor || 0, amount);
    amount = Math.min(schedule.cap || amount, amount, price);
    return Math.max(0, amount);
  }

  function storageRead(storage, key) {
    try { return storage.getItem(key); } catch (error) { return null; }
  }

  function storageWrite(storage, key, value) {
    try { storage.setItem(key, value); return true; } catch (error) { return false; }
  }

  function storageDrop(storage, key) {
    try { storage.removeItem(key); } catch (error) {}
  }

  function canPresent(server, footprint) {
    if (!server || !footprint || footprint.storageReady === false) return false;
    if (footprint.returning) return false;
    if (server.state === 'eligible') return true;
    return server.state === 'provisional';
  }

  function presentationMode(server) {
    if (server && server.state === 'owner_preview') {
      return { show:true, previewOnly:true };
    }
    return { show:false, previewOnly:false };
  }

  function retentionIssuable(server, now) {
    var raw = server && server.retention_issue_end || CAMPAIGNS.retention.issueEndsAt;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(raw)) raw += 'Z';
    var cutoff = Date.parse(raw);
    return Number.isFinite(cutoff) && Number(now || Date.now()) <= cutoff;
  }

  function activeBucket(seconds) {
    seconds = Math.max(0, Number(seconds) || 0);
    if (seconds >= 120) return '120_plus';
    if (seconds >= 60) return '60_119';
    return 'under_60';
  }

  function itemBucket(count) {
    count = Math.max(0, Math.floor(Number(count) || 0));
    if (count >= 4) return '4_plus';
    if (count >= 2) return '2_3';
    return count === 1 ? '1' : '0';
  }

  function quoteBucket(price) {
    price = Math.max(0, Math.floor(Number(price) || 0));
    if (price >= 100000) return '100k_plus';
    if (price >= 60000) return '60_100k';
    if (price >= 40000) return '40_60k';
    if (price >= 20000) return '20_40k';
    if (price >= 10000) return '10_20k';
    if (price >= 5000) return '5_10k';
    return 'under_5k';
  }

  function retentionPayload(checkpoint) {
    checkpoint = checkpoint || {};
    return {
      campaign_id:CAMPAIGNS.retention.id,
      stage:checkpoint.stage === 'contact' ? 'contact' : 'review',
      active_seconds_bucket:activeBucket(checkpoint.activeSeconds),
      item_count_bucket:itemBucket(checkpoint.itemCount),
      quote_band:quoteBucket(checkpoint.quoteLow)
    };
  }

  function safeJson(raw) {
    try {
      var value = JSON.parse(raw || 'null');
      return value && typeof value === 'object' ? value : null;
    } catch (error) { return null; }
  }

  function query(win, key) {
    try { return new URLSearchParams(win.location.search).get(key) || ''; }
    catch (error) { return ''; }
  }

  function pageKind(win) {
    return /configurator\.html$/i.test(win.location.pathname || '') ? 'configurator' : 'home';
  }

  function dialogHistoryState(rawState, token) {
    var baseState = rawState && typeof rawState === 'object' ? rawState : {};
    var sentinel = {};
    Object.keys(baseState).forEach(function (key) {
      if (key !== 'salonPromoDialog') sentinel[key] = baseState[key];
    });
    sentinel.salonPromoDialog = String(token || 'promo');
    return sentinel;
  }

  function bootFootprint(win) {
    if (win.__salonPromoFootprint) return win.__salonPromoFootprint;
    var storage = win.localStorage;
    var keys = [
      'salon_home_intro_v6', 'salon_draft', 'salon_concept_request_v1',
      'salon_cart_v1', 'salon_home_situation', WELCOME_SEEN
    ];
    try {
      return {
        storageReady:true,
        returning:keys.some(function (key) { return !!storage.getItem(key); })
      };
    } catch (error) {
      return { storageReady:false, returning:true };
    }
  }

  function endpoint(win, suffix) {
    if (win.Salon && win.Salon.api && win.Salon.api.base) {
      return String(win.Salon.api.base).replace(/\/$/, '') + suffix;
    }
    return '/api' + suffix;
  }

  function fetchEligibility(win) {
    var controller = typeof win.AbortController === 'function' ? new win.AbortController() : null;
    var timer = win.setTimeout(function () { if (controller) controller.abort(); }, 4500);
    var url = endpoint(win, '/promo/eligibility') +
      '?surface=salon&campaign=' + encodeURIComponent(CAMPAIGNS.welcome.id) +
      '&page=' + encodeURIComponent(pageKind(win));
    return win.fetch(url, {
      method:'GET', credentials:'include',
      headers:{ Accept:'application/json' },
      signal:controller ? controller.signal : undefined,
      cache:'no-store'
    }).then(function (response) {
      if (!response.ok) throw new Error('eligibility_' + response.status);
      return response.json();
    }).then(function (body) {
      if (!body || body.ok !== true || !body.state) return null;
      return body;
    }).catch(function () { return null; }).then(function (body) {
      win.clearTimeout(timer);
      return body;
    });
  }

  function waitForPage(win) {
    if (win.document.readyState === 'loading') {
      return new Promise(function (resolve) {
        win.document.addEventListener('DOMContentLoaded', resolve, { once:true });
      });
    }
    return Promise.resolve();
  }

  function waitForSession(win) {
    var ready = win.Salon && win.Salon.api && win.Salon.api.ready;
    if (!ready) return Promise.resolve();
    try {
      return Promise.resolve(typeof ready === 'function' ? ready() : ready).catch(function () {});
    }
    catch (error) { return Promise.resolve(); }
  }

  function busyDialog(doc) {
    return Array.prototype.some.call(doc.querySelectorAll(
      '.cookieprefs.open,.sdlg.open,[data-upload-dialog][open],[aria-modal="true"]:not(.promo-campaign)'
    ), function (node) {
      if (node.hidden || node.inert || node.getAttribute('aria-hidden') === 'true') return false;
      var style = doc.defaultView && doc.defaultView.getComputedStyle(node);
      return !style || (style.display !== 'none' && style.visibility !== 'hidden');
    });
  }

  function withDialogSlot(win, callback, attempt) {
    attempt = attempt || 0;
    if (!busyDialog(win.document)) { callback(); return; }
    if (attempt >= 12) return;
    win.setTimeout(function () { withDialogSlot(win, callback, attempt + 1); }, 350);
  }

  function setPageInert(doc, layer, inert) {
    var state = layer.__inertState || [];
    if (inert) {
      state = [];
      Array.prototype.forEach.call(doc.body.children, function (node) {
        if (node === layer || node.tagName === 'SCRIPT') return;
        state.push({ node:node, inert:!!node.inert });
        node.inert = true;
      });
      layer.__inertState = state;
      return;
    }
    state.forEach(function (entry) { entry.node.inert = entry.inert; });
    layer.__inertState = [];
  }

  function focusables(layer) {
    return Array.prototype.slice.call(layer.querySelectorAll(
      'button:not([disabled]),a[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])'
    )).filter(function (node) { return !node.hidden && !node.closest('[hidden]'); });
  }

  function clearDialogHistory(win, layer) {
    if (layer.__historyFallback) win.clearTimeout(layer.__historyFallback);
    layer.__historyFallback = 0;
    if (layer.__popHandler) win.removeEventListener('popstate', layer.__popHandler, true);
    layer.__popHandler = null;
    layer.__historyArmed = false;
  }

  function finishDialogClose(win, layer, options) {
    if (!layer || layer !== openLayer) return;
    options = options || {};
    clearDialogHistory(win, layer);
    openLayer = null;
    setPageInert(win.document, layer, false);
    win.document.body.style.overflow = layer.__bodyOverflow || '';
    win.document.removeEventListener('keydown', layer.__keyHandler, true);
    layer.classList.remove('is-open');
    win.setTimeout(function () { if (layer.parentNode) layer.parentNode.removeChild(layer); }, 180);
    if (options.restore !== false && layer.__returnFocus && layer.__returnFocus.focus &&
        win.document.contains(layer.__returnFocus)) {
      try { layer.__returnFocus.focus({ preventScroll:true }); } catch (error) {}
    }
    if (typeof options.after === 'function') options.after();
  }

  function closeDialog(win, layer, options) {
    if (!layer || layer !== openLayer) return;
    options = options || {};
    if (layer.__historyArmed) {
      if (layer.__pendingClose) return;
      layer.__pendingClose = options;
      layer.setAttribute('data-promo-closing', '');
      try { win.history.back(); } catch (error) {}
      layer.__historyFallback = win.setTimeout(function () {
        if (!layer.__pendingClose || layer !== openLayer) return;
        var pending = layer.__pendingClose;
        layer.__pendingClose = null;
        try {
          var current = win.history.state;
          if (current && current.salonPromoDialog === layer.__historyToken) {
            win.history.replaceState(layer.__historyBaseState, '', win.location.href);
          }
        } catch (error) {}
        finishDialogClose(win, layer, pending);
      }, 700);
      return;
    }
    finishDialogClose(win, layer, options);
  }

  function armDialogHistory(win, layer, onDismiss) {
    if (pageKind(win) !== 'configurator') return;
    var baseState = win.history.state;
    if (!baseState || typeof baseState !== 'object') baseState = {};
    var token = 'promo_' + (++dialogSequence);
    var sentinel = dialogHistoryState(baseState, token);
    try { win.history.pushState(sentinel, '', win.location.href); }
    catch (error) { return; }
    layer.__historyToken = token;
    layer.__historyBaseState = baseState;
    layer.__historyArmed = true;
    layer.__popHandler = function (event) {
      if (!layer.__historyArmed) return;
      event.stopImmediatePropagation();
      layer.__historyArmed = false;
      var pending = layer.__pendingClose;
      layer.__pendingClose = null;
      clearDialogHistory(win, layer);
      if (pending) {
        finishDialogClose(win, layer, pending);
        return;
      }
      onDismiss('history');
    };
    win.addEventListener('popstate', layer.__popHandler, true);
  }

  function wireDialog(win, layer, onDismiss) {
    layer.__returnFocus = win.document.activeElement;
    layer.__keyHandler = function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onDismiss('escape');
        return;
      }
      if (event.key !== 'Tab') return;
      var list = focusables(layer);
      if (!list.length) { event.preventDefault(); return; }
      var first = list[0], last = list[list.length - 1];
      if (!layer.contains(win.document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && win.document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && win.document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    win.document.addEventListener('keydown', layer.__keyHandler, true);
    layer.addEventListener('click', function (event) {
      if (event.target === layer || event.target.hasAttribute('data-promo-dismiss')) {
        onDismiss(event.target === layer ? 'backdrop' : 'button');
      }
    });
    win.document.body.appendChild(layer);
    layer.__bodyOverflow = win.document.body.style.overflow;
    win.document.body.style.overflow = 'hidden';
    setPageInert(win.document, layer, true);
    openLayer = layer;
    armDialogHistory(win, layer, onDismiss);
    layer.offsetWidth;
    layer.classList.add('is-open');
    win.requestAnimationFrame(function () {
      var initial = layer.querySelector('[data-promo-initial]');
      if (initial) initial.focus({ preventScroll:true });
    });
  }

  function campaignImage(doc) {
    var img = doc.createElement('img');
    img.src = IMAGE_WEBP_PATH;
    img.alt = '';
    img.width = 960;
    img.height = 720;
    img.decoding = 'async';
    img.setAttribute('fetchpriority', 'high');
    img.addEventListener('error', function () {
      if (img.getAttribute('data-promo-fallback') !== '1') {
        img.setAttribute('data-promo-fallback', '1');
        img.src = IMAGE_FALLBACK_PATH;
        return;
      }
      if (img.parentNode) img.parentNode.classList.add('promo-campaign__art--failed');
      img.remove();
    });
    return img;
  }

  function codeMarkup() {
    return '<div class="promo-campaign__code" aria-label="Промокод ПЕРВЫЙЛИСТ: 12%, максимум 5 000 рублей, один первый заказ">' +
      '<span>ПЕРВЫЙЛИСТ</span><small>12% · до 5 000 ₽ · один первый заказ</small></div>';
  }

  function welcomeDialog(win, server, previewOnly) {
    if (openLayer) return;
    if (typeof win.__salonIntroFinish === 'function') win.__salonIntroFinish(true);
    var doc = win.document;
    var layer = doc.createElement('div');
    layer.className = 'promo-campaign promo-campaign--welcome';
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-labelledby', 'promoWelcomeTitle');
    layer.setAttribute('aria-describedby', 'promoWelcomeDescription promoWelcomeTerms');
    layer.innerHTML = '<section class="promo-campaign__sheet">' +
      '<button class="promo-campaign__close" type="button" data-promo-dismiss data-promo-initial aria-label="Закрыть приветственное предложение">×</button>' +
      (previewOnly ? '<p class="promo-campaign__preview" role="status">Предпросмотр владельца · код не выдан · скидка не активирована</p>' : '') +
      '<div class="promo-campaign__art" aria-hidden="true"></div>' +
      '<div class="promo-campaign__body">' +
        '<p class="promo-campaign__kicker">Приветственный лист · один первый заказ</p>' +
        '<h2 id="promoWelcomeTitle">До 5 000 ₽ на первый заказ</h2>' +
        '<p id="promoWelcomeDescription">Промокод даёт скидку 12% от согласованной цены. Чем больше объём, тем больше выгода — максимум 5 000 ₽. Состав, срок и итог зафиксируем до оплаты.</p>' +
        codeMarkup() +
        '<ol class="promo-campaign__scale" aria-label="Примеры скидки">' +
          '<li><span>2 500 ₽</span><b>−300 ₽</b></li>' +
          '<li><span>5 000 ₽</span><b>−600 ₽</b></li>' +
          '<li><span>10 000 ₽</span><b>−1 200 ₽</b></li>' +
          '<li><span>20 000 ₽</span><b>−2 400 ₽</b></li>' +
          '<li><span>42 000 ₽ и выше</span><b>до −5 000 ₽</b></li>' +
        '</ol>' +
        '<div class="promo-campaign__actions">' +
          '<button class="promo-campaign__primary" type="button" data-promo-primary>' +
            (previewOnly ? 'Закрыть предпросмотр' : 'Подобрать первый этап со скидкой') + '</button>' +
          '<button class="promo-campaign__secondary" type="button" data-promo-dismiss>Сначала посмотреть мастерскую</button>' +
        '</div>' +
        '<p class="promo-campaign__terms" id="promoWelcomeTerms">12% согласованной цены, но не более 5 000 ₽, для одного первого заказа от 2 500 ₽. Действует по 21 сентября 2026 года. Не распространяется на сертификаты, депозит и абонементы. С другими скидками не складывается — сервер применит одну, более выгодную.</p>' +
      '</div></section>';
    layer.querySelector('.promo-campaign__art').appendChild(campaignImage(doc));
    var dismiss = function () {
      if (!previewOnly) storageWrite(win.localStorage, WELCOME_SEEN, CAMPAIGNS.welcome.id);
      closeDialog(win, layer);
    };
    wireDialog(win, layer, dismiss);
    layer.querySelector('[data-promo-primary]').addEventListener('click', function () {
      if (previewOnly) { closeDialog(win, layer); return; }
      storageWrite(win.localStorage, WELCOME_SEEN, CAMPAIGNS.welcome.id);
      if (pageKind(win) === 'configurator') {
        applyPromo(win, (server && server.code) || CAMPAIGNS.welcome.code).then(function () {
          closeDialog(win, layer);
        });
        return;
      }
      var target = 'configurator.html?promo=' + encodeURIComponent(
        (server && server.code) || CAMPAIGNS.welcome.code
      ) + '&utm_source=akademsalon&utm_medium=onsite&utm_campaign=welcome_v1';
      win.location.assign(target);
    });
  }

  function applyPromo(win, code) {
    var bridge = win.SalonPromoCampaignBridge;
    if (bridge && typeof bridge.applyPromo === 'function') {
      return new Promise(function (resolve) {
        bridge.applyPromo(code, function (result) { resolve(!!(result && result.ok)); });
      });
    }
    var url = new URL(win.location.href);
    url.searchParams.set('promo', code);
    win.location.assign(url.href);
    return Promise.resolve(false);
  }

  function retentionRecord(win, checkpoint) {
    if (!retentionIssuable(resolvedEligibility)) return false;
    var payload = retentionPayload(checkpoint);
    payload.v = 1;
    payload.reason = 'unanswered';
    payload.left_at = Date.now();
    return storageWrite(win.localStorage, RETENTION_LEFT, JSON.stringify(payload));
  }

  function onPageHide(win) {
    if (!resolvedEligibility) return;
    var mode = presentationMode(resolvedEligibility);
    if (mode.previewOnly || !canPresent(resolvedEligibility, resolvedFootprint)) return;
    var bridge = win.SalonPromoCampaignBridge;
    if (!bridge || typeof bridge.checkpoint !== 'function') return;
    var checkpoint = bridge.checkpoint();
    var submission = typeof bridge.submission === 'function' ? bridge.submission() : {};
    var dismissed = Number(storageRead(win.localStorage, RETENTION_DISMISSED) || 0);
    if (dismissed && Date.now() - dismissed < 30 * 24 * 60 * 60 * 1000) return;
    checkpoint.activeSeconds = activeSeconds(win);
    if (!checkpoint.qualified || checkpoint.activeSeconds < 60 || checkpoint.hasPromo ||
        submission.submitting || submission.accepted || submission.uploading) return;
    retentionRecord(win, checkpoint);
  }

  function postRetention(win, payload) {
    if (win.Salon && win.Salon.api && typeof win.Salon.api.post === 'function') {
      return Promise.resolve(win.Salon.api.post('/promo/retention', payload));
    }
    return win.fetch(endpoint(win, '/promo/retention'), {
      method:'POST', credentials:'include',
      headers:{ 'Content-Type':'application/json', Accept:'application/json' },
      body:JSON.stringify(payload), cache:'no-store'
    }).then(function (response) { return response.json(); });
  }

  function claimRetention(win, payload, statusNode, button) {
    button.disabled = true;
    button.textContent = 'Проверяем…';
    return postRetention(win, payload).then(function (response) {
      if (!response || !response.ok || !response.code) throw new Error('ineligible');
      return applyPromo(win, response.code).then(function (applied) {
        if (!applied) throw new Error('not_applied');
        storageDrop(win.localStorage, RETENTION_LEFT);
        storageDrop(win.localStorage, RETENTION_DISMISSED);
        return true;
      });
    }).catch(function () {
      button.disabled = false;
      button.textContent = 'Применить 10% и продолжить';
      if (statusNode) statusNode.textContent = 'Код сейчас недоступен. Черновик сохранён — можно продолжить без скидки.';
      return false;
    });
  }

  function retentionDialog(win, href, checkpoint, previewOnly, options) {
    if (openLayer) return;
    options = options || {};
    var doc = win.document;
    var layer = doc.createElement('div');
    layer.className = 'promo-campaign promo-campaign--retention' +
      (previewOnly ? ' promo-campaign--owner-preview' : '');
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-labelledby', 'promoRetentionTitle');
    layer.setAttribute('aria-describedby', 'promoRetentionDescription');
    layer.innerHTML = '<section class="promo-campaign__sheet promo-campaign__sheet--retention">' +
      '<button class="promo-campaign__close" type="button" data-promo-dismiss aria-label="' +
        (previewOnly ? 'Закрыть предпросмотр' : 'Закрыть и остаться в заявке') + '">×</button>' +
      (previewOnly ? '<p class="promo-campaign__preview" role="status">Предпросмотр владельца · код не выдан · скидка не активирована</p>' : '') +
      '<div class="promo-campaign__body">' +
        '<div data-promo-rescue-prompt>' +
          '<p class="promo-campaign__kicker">Черновик сохранён</p>' +
          '<h2 id="promoRetentionTitle" tabindex="-1" data-promo-initial>Что мешает закончить заявку?</h2>' +
          '<p id="promoRetentionDescription">Выберите причину — покажем один подходящий следующий шаг. Текст заявки, контакт и файлы не попадут в запрос промокода.</p>' +
          '<fieldset class="promo-campaign__reasons"><legend>Причина выхода</legend>' +
            '<label><input type="radio" name="promo-rescue-reason" value="price"><span><b>Цена выше ожиданий</b><small>Проверить доступную выгоду</small></span></label>' +
            '<label><input type="radio" name="promo-rescue-reason" value="materials"><span><b>Не хватает материалов</b><small>Продолжить без файла</small></span></label>' +
            '<label><input type="radio" name="promo-rescue-reason" value="unclear"><span><b>Не понимаю состав</b><small>Вернуться к понятному итогу</small></span></label>' +
            '<label><input type="radio" name="promo-rescue-reason" value="deadline"><span><b>Нужно согласовать срок</b><small>Оставить дату гибкой</small></span></label>' +
          '</fieldset>' +
          '<div class="promo-campaign__actions">' +
            '<button class="promo-campaign__primary" type="button" data-promo-rescue-next disabled>Выберите причину</button>' +
            '<button class="promo-campaign__secondary" type="button" data-promo-retention-exit>' +
              (previewOnly ? 'Закрыть предпросмотр' : 'Сохранить и выйти') + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="promo-campaign__rescue-outcome" data-promo-rescue-outcome hidden></div>' +
        '<p class="promo-campaign__status" role="status" aria-live="polite"></p>' +
      '</div></section>';
    var prompt = layer.querySelector('[data-promo-rescue-prompt]');
    var outcome = layer.querySelector('[data-promo-rescue-outcome]');
    var status = layer.querySelector('.promo-campaign__status');
    var next = layer.querySelector('[data-promo-rescue-next]');
    var sheet = layer.querySelector('.promo-campaign__sheet--retention');
    var selected = '';
    var stay = function () { closeDialog(win, layer); };
    var leave = function () {
      if (!previewOnly) {
        storageWrite(win.localStorage, RETENTION_DISMISSED, String(Date.now()));
        storageDrop(win.localStorage, RETENTION_LEFT);
      }
      closeDialog(win, layer, {
        restore:false,
        after:function () {
          if (typeof options.onResolve === 'function') options.onResolve('exit');
          if (!previewOnly && href) win.location.assign(href);
        }
      });
    };
    function showReasons() {
      outcome.hidden = true;
      outcome.innerHTML = '';
      prompt.hidden = false;
      if (sheet) sheet.scrollTop = 0;
      layer.setAttribute('aria-labelledby', 'promoRetentionTitle');
      layer.setAttribute('aria-describedby', 'promoRetentionDescription');
      status.textContent = '';
      var title = layer.querySelector('#promoRetentionTitle');
      if (title) title.focus({ preventScroll:true });
    }
    function showOutcome(reason) {
      var decision = rescueDecision(reason);
      if (!decision) return;
      prompt.hidden = true;
      outcome.hidden = false;
      layer.setAttribute('aria-labelledby', 'promoRetentionOutcomeTitle');
      layer.setAttribute('aria-describedby', 'promoRetentionOutcomeDescription');
      status.textContent = '';
      outcome.innerHTML = '<p class="promo-campaign__kicker">Подходящий следующий шаг</p>' +
        '<h2 id="promoRetentionOutcomeTitle" tabindex="-1" data-promo-outcome-title>' + decision.title + '</h2>' +
        '<p id="promoRetentionOutcomeDescription">' + decision.description + '</p>' +
        (decision.requestRetention
          ? '<div class="promo-campaign__retention-mark" aria-hidden="true"><b>10%</b><span>до 2 500 ₽</span></div>'
          : '') +
        '<div class="promo-campaign__actions">' +
          '<button class="promo-campaign__primary" type="button" data-promo-rescue-act>' +
            decision.action + '</button>' +
          (previewOnly ? '' : '<button class="promo-campaign__secondary" type="button" data-promo-rescue-back>Выбрать другую причину</button>') +
          '<button class="promo-campaign__secondary" type="button" data-promo-retention-exit>' +
            (previewOnly ? 'Закрыть предпросмотр' : 'Сохранить и выйти') + '</button>' +
        '</div>' +
        (decision.requestRetention
          ? '<p class="promo-campaign__terms">Один первый заказ от 5 000 ₽. Код действует 72 часа, не складывается с приветственной или другой скидкой — сервер выберет более выгодную.</p>'
          : '<p class="promo-campaign__terms">Состав, реальный срок и точную цену редактор подтвердит до оплаты.</p>');
      if (sheet) sheet.scrollTop = 0;
      var back = outcome.querySelector('[data-promo-rescue-back]');
      var action = outcome.querySelector('[data-promo-rescue-act]');
      if (back) back.addEventListener('click', showReasons);
      outcome.querySelector('[data-promo-retention-exit]').addEventListener('click', leave);
      action.addEventListener('click', function () {
        if (previewOnly) { showReasons(); return; }
        if (decision.requestRetention) {
          var payload = retentionPayload(checkpoint);
          claimRetention(win, payload, status, action).then(function (applied) {
            if (!applied) return;
            closeDialog(win, layer, {
              after:function () {
                if (typeof options.onResolve === 'function') options.onResolve(decision.id);
              }
            });
          });
          return;
        }
        storageDrop(win.localStorage, RETENTION_LEFT);
        closeDialog(win, layer, {
          after:function () {
            if (typeof options.onResolve === 'function') options.onResolve(decision.id);
            var bridge = win.SalonPromoCampaignBridge;
            if (bridge && typeof bridge.rescue === 'function') bridge.rescue(decision.id);
          }
        });
      });
      var title = outcome.querySelector('[data-promo-outcome-title]');
      if (title) title.focus({ preventScroll:true });
    }
    wireDialog(win, layer, stay);
    layer.querySelector('[data-promo-retention-exit]').addEventListener('click', leave);
    Array.prototype.forEach.call(layer.querySelectorAll('input[name="promo-rescue-reason"]'), function (radio) {
      radio.addEventListener('change', function () {
        selected = radio.value;
        next.disabled = !rescueDecision(selected);
        next.textContent = next.disabled ? 'Выберите причину' : 'Показать следующий шаг';
      });
    });
    next.addEventListener('click', function () { showOutcome(selected); });
  }

  function onExplicitExit(win, event) {
    var trigger = event.target && event.target.closest && event.target.closest(
      '.tx-close, .tx-mobile-back, .wizard-close'
    );
    if (!trigger || pageKind(win) !== 'configurator' || event.defaultPrevented) return;
    var bridge = win.SalonPromoCampaignBridge;
    if (!bridge || typeof bridge.checkpoint !== 'function' || !resolvedEligibility) return;
    var dismissed = Number(storageRead(win.localStorage, RETENTION_DISMISSED) || 0);
    if (dismissed && Date.now() - dismissed < 30 * 24 * 60 * 60 * 1000) return;
    var mode = presentationMode(resolvedEligibility);
    var footprint = resolvedFootprint || bootFootprint(win);
    if (!mode.previewOnly && !canPresent(resolvedEligibility, footprint)) return;
    if (!mode.previewOnly && !retentionIssuable(resolvedEligibility)) return;
    var checkpoint = bridge.checkpoint();
    var submission = typeof bridge.submission === 'function' ? bridge.submission() : {};
    checkpoint.activeSeconds = activeSeconds(win);
    if (!mode.previewOnly && (!checkpoint.qualified || checkpoint.activeSeconds < 60 ||
        checkpoint.hasPromo || submission.submitting || submission.accepted || submission.uploading)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    retentionDialog(win, trigger.href, checkpoint, mode.previewOnly);
  }

  function checkpointFromRecord(record) {
    if (!record || record.v !== 1 || record.reason !== 'unanswered' ||
        record.campaign_id !== CAMPAIGNS.retention.id || record.stage !== 'contact') return null;
    var active = { under_60:0, '60_119':60, '120_plus':120 }[record.active_seconds_bucket];
    var items = { '0':0, '1':1, '2_3':2, '4_plus':4 }[record.item_count_bucket];
    var quote = {
      under_5k:0, '5_10k':5000, '10_20k':10000, '20_40k':20000,
      '40_60k':40000, '60_100k':60000, '100k_plus':100000
    }[record.quote_band];
    if (!Number.isFinite(active) || !Number.isFinite(items) || !Number.isFinite(quote) ||
        active < 60 || items < 1 || quote < CAMPAIGNS.retention.minPrice) return null;
    return {
      stage:'contact', activeSeconds:active, itemCount:items, quoteLow:quote,
      qualified:true, hasPromo:false
    };
  }

  function returnBanner(win, checkpoint) {
    var doc = win.document;
    if (doc.querySelector('[data-promo-return]')) return;
    var host = doc.querySelector('.tx-body,.configurator-task,main');
    if (!host) return;
    var bar = doc.createElement('section');
    bar.className = 'promo-return';
    bar.setAttribute('data-promo-return', '');
    bar.setAttribute('aria-labelledby', 'promoReturnTitle');
    bar.innerHTML = '<div><p class="promo-campaign__kicker">Черновик на месте</p>' +
      '<h2 id="promoReturnTitle">Поможем закончить без лишних шагов.</h2>' +
      '<p>Выберите, что остановило: цена, материалы, состав или срок.</p></div>' +
      '<div class="promo-return__actions"><button type="button" data-promo-return-open>Разобраться и продолжить</button>' +
      '<button type="button" data-promo-return-dismiss>Не сейчас</button></div>' +
      '<p class="promo-campaign__status" role="status" aria-live="polite"></p>';
    host.insertBefore(bar, host.firstChild);
    bar.querySelector('[data-promo-return-open]').addEventListener('click', function () {
      retentionDialog(win, '', checkpoint, false, {
        onResolve:function (reason) { if (reason !== 'exit' && bar.parentNode) bar.remove(); }
      });
    });
    bar.querySelector('[data-promo-return-dismiss]').addEventListener('click', function () {
      storageWrite(win.localStorage, RETENTION_DISMISSED, String(Date.now()));
      storageDrop(win.localStorage, RETENTION_LEFT);
      bar.remove();
    });
  }

  function maybeReturnOffer(win, server, footprint) {
    if (pageKind(win) !== 'configurator' || query(win, 'promo')) return;
    if (!retentionIssuable(server)) {
      storageDrop(win.localStorage, RETENTION_LEFT);
      return;
    }
    var dismissed = Number(storageRead(win.localStorage, RETENTION_DISMISSED) || 0);
    if (dismissed && Date.now() - dismissed < 30 * 24 * 60 * 60 * 1000) return;
    var record = safeJson(storageRead(win.localStorage, RETENTION_LEFT));
    if (!record || !record.left_at) return;
    /* На повторном входе сохранённый черновик сам по себе делает footprint
       «возвратным». Локальный retention-record создаётся только после уже
       разрешённой сервером сессии; окончательное право всё равно проверяется
       сервером при выдаче кода и при создании заказа. */
    if (!server || (server.state !== 'eligible' && server.state !== 'provisional')) return;
    var age = Date.now() - Number(record.left_at);
    if (age < 40000 || age > CAMPAIGNS.retention.durationHours * 60 * 60 * 1000) {
      if (age > CAMPAIGNS.retention.durationHours * 60 * 60 * 1000) {
        storageDrop(win.localStorage, RETENTION_LEFT);
      }
      return;
    }
    var checkpoint = checkpointFromRecord(record);
    if (!checkpoint) {
      storageDrop(win.localStorage, RETENTION_LEFT);
      return;
    }
    returnBanner(win, checkpoint);
  }

  function boot(win) {
    startedAt = win.performance && typeof win.performance.now === 'function' ? win.performance.now() : 0;
    visibleStartedAt = win.document.visibilityState === 'hidden' ? 0 : startedAt;
    visibleElapsedMs = 0;
    win.document.addEventListener('visibilitychange', function () {
      var now = win.performance && typeof win.performance.now === 'function' ? win.performance.now() : 0;
      if (win.document.visibilityState === 'hidden') {
        if (visibleStartedAt) visibleElapsedMs += Math.max(0, now - visibleStartedAt);
        visibleStartedAt = 0;
      } else if (!visibleStartedAt) {
        visibleStartedAt = now;
      }
    });
    var footprint = bootFootprint(win);
    resolvedFootprint = footprint;
    waitForPage(win).then(function () { return waitForSession(win); }).then(function () {
      return fetchEligibility(win);
    }).then(function (server) {
      resolvedEligibility = server;
      if (!server) return;
      var mode = presentationMode(server);
      var preview = query(win, 'offer_preview');
      if (mode.previewOnly && preview === 'retention' && pageKind(win) === 'configurator') {
        withDialogSlot(win, function () {
          retentionDialog(win, '', {
            stage:'contact', activeSeconds:120, itemCount:1, quoteLow:20000, qualified:true
          }, true);
        });
        return;
      }
      maybeReturnOffer(win, server, footprint);
      var hasInboundCode = query(win, 'promo').toUpperCase() === CAMPAIGNS.welcome.code;
      var alreadySeen = !!storageRead(win.localStorage, WELCOME_SEEN);
      if (!mode.previewOnly && (hasInboundCode || alreadySeen || !canPresent(server, footprint))) return;
      if (!mode.show && !canPresent(server, footprint)) return;
      if (typeof win.__salonIntroFinish === 'function') win.__salonIntroFinish(true);
      withDialogSlot(win, function () { welcomeDialog(win, server, mode.previewOnly); });
    });

    if (pageKind(win) === 'configurator') {
      win.addEventListener('pagehide', function () { onPageHide(win); });
      win.document.addEventListener('click', function (event) { onExplicitExit(win, event); }, true);
      win.document.addEventListener('salon:promo-submit-success', function () {
        storageDrop(win.localStorage, RETENTION_LEFT);
      });
    }
    win.addEventListener('storage', function (event) {
      if (event.key === WELCOME_SEEN && event.newValue && openLayer &&
          openLayer.classList.contains('promo-campaign--welcome')) {
        closeDialog(win, openLayer);
      }
    });
  }

  return {
    CAMPAIGNS:CAMPAIGNS,
    discount:discount,
    canPresent:canPresent,
    presentationMode:presentationMode,
    retentionIssuable:retentionIssuable,
    retentionPayload:retentionPayload,
    rescueDecision:rescueDecision,
    checkpointFromRecord:checkpointFromRecord,
    dialogHistoryState:dialogHistoryState,
    boot:boot
  };

  function activeSeconds(win) {
    var now = win.performance && typeof win.performance.now === 'function' ? win.performance.now() : startedAt;
    var elapsed = visibleElapsedMs;
    if (visibleStartedAt) elapsed += Math.max(0, now - visibleStartedAt);
    return Math.floor(elapsed / 1000);
  }
}));
