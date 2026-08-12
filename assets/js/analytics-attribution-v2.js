/* Академический Салон · строгая граница рекламной атрибуции.
   Загружается после общего runtime и до analytics-v2. Принимает только
   опубликованные категории; произвольный query никогда не становится данными. */
(function strictAnalyticsAttribution() {
  'use strict';

  if (!window.Salon || !Salon.store || !Salon.consent) return;

  var KEY = 'salon_attr_v2';
  var PARAMS = ['utm_source', 'utm_medium', 'utm_campaign'];
  var ALLOWED = {
    utm_source: { yandex:1, google:1, bing:1, telegram:1, vk:1, mailru:1 },
    utm_medium: { cpc:1, organic:1, social:1, referral:1, email:1, banner:1 },
    utm_campaign: { brand:1, services:1, catalog:1, guides:1, remarketing:1 }
  };
  var REFERRERS = {
    yandex:1, google:1, bing:1, telegram:1, vk:1, mailru:1, external:1
  };
  var here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var impersonation = false;
  try { impersonation = sessionStorage.getItem('salon_imp') === '1'; } catch (ignore) {}
  var silent = here.indexOf('admin') === 0 || here === 'dashboard.html' ||
    here === 'zayavka.html' || here === 'oplaceno.html' || here === 'offline.html' ||
    impersonation || location.protocol !== 'https:' || location.hostname !== 'akademsalon.ru';
  var blockedUntilNavigation = !(Salon.consent && Salon.consent.allowed());

  function allowed() {
    try { return Salon.consent.allowed() === true; } catch (error) { return false; }
  }
  function exact(key, value) {
    value = String(value == null ? '' : value).trim().toLowerCase();
    return ALLOWED[key] && ALLOWED[key][value] ? value : '';
  }
  function campaign(values) {
    var result = {};
    PARAMS.forEach(function (key) {
      var value = exact(key, values && values[key]);
      if (value) result[key] = value;
    });
    return result;
  }
  function queryCampaign() {
    try {
      var query = new URLSearchParams(location.search), values = {};
      PARAMS.forEach(function (key) { values[key] = query.get(key); });
      return campaign(values);
    } catch (error) { return {}; }
  }
  function referrerCode() {
    try {
      if (!document.referrer) return '';
      var url = new URL(document.referrer);
      if (url.origin === location.origin) return '';
      var host = url.hostname.toLowerCase().replace(/^www\./, '');
      if (/(^|\.)yandex\./.test(host)) return 'yandex';
      if (/(^|\.)google\./.test(host)) return 'google';
      if (/(^|\.)bing\.com$/.test(host)) return 'bing';
      if (/(^|\.)vk\.(?:com|ru)$/.test(host)) return 'vk';
      if (/(^|\.)t\.me$|(^|\.)telegram\./.test(host)) return 'telegram';
      if (/(^|\.)mail\.ru$/.test(host)) return 'mailru';
      return 'external';
    } catch (error) { return ''; }
  }
  function canonicalPage(value) {
    try {
      return Salon.analyticsPrivacy && Salon.analyticsPrivacy.page
        ? Salon.analyticsPrivacy.page(value) : '/other';
    } catch (error) { return '/other'; }
  }
  function hasCampaign(value) { return Object.keys(value || {}).length > 0; }
  function safeSaved() {
    var saved;
    try { saved = Salon.store.get(KEY, null) || {}; } catch (error) { saved = {}; }
    ['first', 'last'].forEach(function (slot) {
      var item = saved[slot];
      if (!item) return;
      if (item.kind === 'utm') {
        var values = campaign(item.values);
        if (hasCampaign(values)) item.values = values;
        else delete saved[slot];
      } else if (item.kind === 'referrer' && REFERRERS[String(item.code || '')]) {
        item.code = String(item.code);
      } else {
        delete saved[slot];
      }
    });
    if (saved.entry) saved.entry = canonicalPage(saved.entry);
    if (saved.lastEntry) saved.lastEntry = canonicalPage(saved.lastEntry);
    return saved;
  }
  function capture() {
    if (silent || blockedUntilNavigation || !allowed()) return null;
    var current = queryCampaign(), ref = referrerCode();
    var source = hasCampaign(current) ? { kind:'utm', values:current } :
      (ref ? { kind:'referrer', code:ref } : null);
    var saved = safeSaved();
    if (!saved.first && source) {
      saved.first = source;
      saved.entry = canonicalPage(location.pathname);
      saved.firstAt = Date.now();
    }
    if (source) {
      saved.last = source;
      saved.lastEntry = canonicalPage(location.pathname);
      saved.lastAt = Date.now();
    }
    if (source || saved.first) Salon.store.set(KEY, saved);
    else Salon.store.del(KEY);
    return saved;
  }
  function ref() {
    if (silent || blockedUntilNavigation || !allowed()) return '';
    var current = queryCampaign();
    capture();
    var parts = [];
    PARAMS.forEach(function (key) {
      if (current[key]) parts.push(key + '=' + current[key]);
    });
    if (!parts.length) {
      var referrer = referrerCode();
      if (REFERRERS[referrer]) parts.push('ref=' + referrer);
    }
    return parts.join('&');
  }
  function decoratePage(base) {
    base = String(base || '');
    if (!/^[a-z0-9./?=_-]{1,120}$/i.test(base) ||
        /(?:token|claim|session|oauth|imp)=/i.test(base)) base = 'site';
    if (silent || blockedUntilNavigation || !allowed()) return base;
    var saved = capture() || {}, bits = [];
    if (saved.entry) bits.push('entry=' + saved.entry);
    var first = saved.first && saved.first.kind === 'utm' ? saved.first.values : {};
    PARAMS.forEach(function (key) {
      var value = exact(key, first && first[key]);
      if (value) bits.push(key + '=' + value);
    });
    if (!bits.length && saved.first && saved.first.kind === 'referrer' &&
        REFERRERS[saved.first.code]) bits.push('ref=' + saved.first.code);
    return (base + (bits.length ? ' | ' + bits.join('&') : '')).slice(0, 200);
  }

  /* v2 — единственный измерительный контур после своего подключения. Legacy
     мог успеть отправить initial pageview из общего runtime; backend release
     одновременно выключает его endpoint. Все дальнейшие вызовы переводим в
     v2, чтобы не смешивать серии и не дублировать события. */
  Salon.attribution = { ref:ref, capture:capture, decoratePage:decoratePage };
  Salon.visit = { mark:function () {}, order:function () {}, event:function () {} };
  if (!blockedUntilNavigation && allowed()) capture();
  document.addEventListener('salon:consent', function (event) {
    if (event.detail && event.detail.analytics === true) {
      if (!blockedUntilNavigation) capture();
    } else {
      blockedUntilNavigation = true;
      Salon.store.del(KEY);
    }
  });
})();
