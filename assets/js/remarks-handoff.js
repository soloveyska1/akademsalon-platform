(function () {
  'use strict';

  var KEY = 'salon_remarks_handoff_v1';
  var TTL_MS = 10 * 60 * 1000;
  var MAX_LENGTH = 800;
  var MIN_LENGTH = 40;
  var LEGACY_SESSION_KEY = 'salon_editor_brief';
  var LEGACY_LOCAL_KEY = 'salon_prefill_comment';

  function dropWindowStorage(name, key) {
    try {
      var storage = window[name];
      if (storage) storage.removeItem(key);
    } catch (error) {}
  }

  /* До release119 этот экран мог оставлять замечания в постоянном storage.
     Новый handoff живёт только в текущей вкладке, поэтому старые приватные
     остатки удаляем при первом же открытии обновлённого экрана. */
  dropWindowStorage('sessionStorage', LEGACY_SESSION_KEY);
  dropWindowStorage('localStorage', LEGACY_LOCAL_KEY);

  function build(value, now) {
    var text = String(value == null ? '' : value).replace(/\r\n?/g, '\n').trim()
      .slice(0, MAX_LENGTH);
    if (text.length < MIN_LENGTH) return null;
    return { v:1, kind:'remarks', text:text, created_at:Number(now) || Date.now() };
  }

  /* Публичен только чистый локальный контракт для воспроизводимых проверок.
     Он не читает storage, не отправляет сеть и не добавляет поля личности. */
  window.SalonRemarksHandoffContract = {
    KEY:KEY,
    TTL_MS:TTL_MS,
    MAX_LENGTH:MAX_LENGTH,
    LEGACY_SESSION_KEY:LEGACY_SESSION_KEY,
    LEGACY_LOCAL_KEY:LEGACY_LOCAL_KEY,
    build:build
  };

  var field = document.querySelector('[data-remarks-handoff-text]');
  var submit = document.querySelector('[data-remarks-handoff-submit]');
  if (!field || !submit) return;

  function notify(message) {
    if (window.Salon && window.Salon.toast) {
      window.Salon.toast(message);
      return;
    }
    var region = document.querySelector('[data-p15-notice]');
    if (!region) return;
    region.hidden = false;
    region.textContent = message;
  }

  function syncIndependentRouteCopy() {
    var copy = document.querySelector('.case-bridge__copy > span');
    var route = document.querySelector('[data-case-bridge-action="route"]');
    if (copy) {
      copy.textContent = 'Кнопка «Перейти к смете» выше переносит введённые замечания один раз в пределах этой вкладки. Нижняя ссылка открывает маршрут отдельно, без текста.';
    }
    if (route) {
      route.innerHTML = 'Открыть маршрут без текста <span aria-hidden="true">→</span>';
    }
  }

  syncIndependentRouteCopy();
  submit.addEventListener('click', function () {
    var record = build(field.value, Date.now());
    if (!record) {
      notify('Добавьте хотя бы одно содержательное замечание — минимум 40 знаков.');
      field.focus();
      return;
    }
    try {
      sessionStorage.setItem(KEY, JSON.stringify(record));
    } catch (error) {
      notify('Браузер не дал перенести текст. Скопируйте замечания и вставьте их в заявке вручную.');
      field.focus();
      return;
    }
    location.href = 'configurator.html?situation=comments&result=diagnostic&route=page&handoff=remarks';
  });
})();
