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
  var WELCOME_SEEN = 'salon_promo_welcome_v1_seen';
  var RETENTION_LEFT = 'salon_promo_retention_v1_left';
  var RETENTION_DISMISSED = 'salon_promo_retention_v1_dismissed';
  var IMAGE_PATH = 'assets/img/promo-salon-welcome.png';
  var startedAt = 0;
  var visibleStartedAt = 0;
  var visibleElapsedMs = 0;
  var resolvedEligibility = null;
  var openLayer = null;

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
    if (server.state === 'eligible') return true;
    return server.state === 'provisional' && !footprint.returning;
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
    )).filter(function (node) { return !node.hidden; });
  }

  function closeDialog(win, layer, options) {
    if (!layer || layer !== openLayer) return;
    options = options || {};
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
    layer.offsetWidth;
    layer.classList.add('is-open');
    win.requestAnimationFrame(function () {
      var initial = layer.querySelector('[data-promo-initial]');
      if (initial) initial.focus({ preventScroll:true });
    });
  }

  function campaignImage(doc) {
    var img = doc.createElement('img');
    img.src = IMAGE_PATH;
    img.alt = '';
    img.width = 960;
    img.height = 720;
    img.decoding = 'async';
    img.setAttribute('fetchpriority', 'high');
    img.addEventListener('error', function () {
      if (img.parentNode) img.parentNode.classList.add('promo-campaign__art--failed');
      img.remove();
    }, { once:true });
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
    payload.left_at = Date.now();
    return storageWrite(win.localStorage, RETENTION_LEFT, JSON.stringify(payload));
  }

  function onPageHide(win) {
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

  function retentionDialog(win, href, checkpoint, previewOnly) {
    if (openLayer) return;
    var doc = win.document;
    var layer = doc.createElement('div');
    layer.className = 'promo-campaign promo-campaign--retention';
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-labelledby', 'promoRetentionTitle');
    layer.setAttribute('aria-describedby', 'promoRetentionDescription');
    layer.innerHTML = '<section class="promo-campaign__sheet promo-campaign__sheet--retention">' +
      '<button class="promo-campaign__close" type="button" data-promo-retention-exit data-promo-initial aria-label="' +
        (previewOnly ? 'Закрыть предпросмотр' : 'Сохранить и выйти') + '">×</button>' +
      (previewOnly ? '<p class="promo-campaign__preview" role="status">Предпросмотр владельца · код не выдан · скидка не активирована</p>' : '') +
      '<div class="promo-campaign__body">' +
        '<p class="promo-campaign__kicker">Черновик сохранён</p>' +
        '<h2 id="promoRetentionTitle">Для этой заявки доступно 10%</h2>' +
        '<p id="promoRetentionDescription">Примените скидку сейчас — код будет действовать 72 часа. Можно отказаться и выйти: черновик останется. Если уже действует более выгодное предложение, оно сохранится.</p>' +
        '<div class="promo-campaign__retention-mark" aria-hidden="true"><b>10%</b><span>до 2 500 ₽</span></div>' +
        '<div class="promo-campaign__actions">' +
          '<button class="promo-campaign__primary" type="button" data-promo-retention-apply>' +
            (previewOnly ? 'Закрыть предпросмотр' : 'Применить 10% и продолжить') + '</button>' +
          '<button class="promo-campaign__secondary" type="button" data-promo-retention-exit>Сохранить и выйти</button>' +
        '</div>' +
        '<p class="promo-campaign__status" role="status" aria-live="polite"></p>' +
        '<p class="promo-campaign__terms">Один первый заказ от 5 000 ₽. Код действует 72 часа, не складывается с приветственной или другой скидкой — сервер выберет более выгодную.</p>' +
      '</div></section>';
    var leave = function () {
      if (!previewOnly) {
        storageWrite(win.localStorage, RETENTION_DISMISSED, String(Date.now()));
        storageDrop(win.localStorage, RETENTION_LEFT);
      }
      closeDialog(win, layer, { restore:false });
      if (!previewOnly && href) win.location.assign(href);
    };
    wireDialog(win, layer, leave);
    Array.prototype.forEach.call(layer.querySelectorAll('[data-promo-retention-exit]'), function (button) {
      button.addEventListener('click', leave);
    });
    var primary = layer.querySelector('[data-promo-retention-apply]');
    primary.addEventListener('click', function () {
      if (previewOnly) { closeDialog(win, layer); return; }
      var payload = retentionPayload(checkpoint);
      claimRetention(win, payload, layer.querySelector('.promo-campaign__status'), primary)
        .then(function (applied) { if (applied) closeDialog(win, layer); });
    });
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
    var footprint = bootFootprint(win);
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

  function returnBanner(win, record) {
    var doc = win.document;
    if (doc.querySelector('[data-promo-return]')) return;
    var host = doc.querySelector('.tx-body,.configurator-task,main');
    if (!host) return;
    var bar = doc.createElement('section');
    bar.className = 'promo-return';
    bar.setAttribute('data-promo-return', '');
    bar.setAttribute('aria-labelledby', 'promoReturnTitle');
    bar.innerHTML = '<div><p class="promo-campaign__kicker">Черновик на месте</p>' +
      '<h2 id="promoReturnTitle">Для сохранённой заявки доступны 10% — до 2 500 ₽.</h2>' +
      '<p>Код проверит сервер; текст и контакт черновика в запрос не попадут.</p></div>' +
      '<div class="promo-return__actions"><button type="button" data-promo-return-apply>Применить и продолжить</button>' +
      '<button type="button" data-promo-return-dismiss>Не сейчас</button></div>' +
      '<p class="promo-campaign__status" role="status" aria-live="polite"></p>';
    host.insertBefore(bar, host.firstChild);
    var apply = bar.querySelector('[data-promo-return-apply]');
    apply.addEventListener('click', function () {
      claimRetention(win, {
        campaign_id:CAMPAIGNS.retention.id,
        stage:record.stage,
        active_seconds_bucket:record.active_seconds_bucket,
        item_count_bucket:record.item_count_bucket,
        quote_band:record.quote_band
      }, bar.querySelector('.promo-campaign__status'), apply).then(function (ok) {
        if (ok) bar.remove();
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
    returnBanner(win, record);
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
    boot:boot
  };

  function activeSeconds(win) {
    var now = win.performance && typeof win.performance.now === 'function' ? win.performance.now() : startedAt;
    var elapsed = visibleElapsedMs;
    if (visibleStartedAt) elapsed += Math.max(0, now - visibleStartedAt);
    return Math.floor(elapsed / 1000);
  }
}));
