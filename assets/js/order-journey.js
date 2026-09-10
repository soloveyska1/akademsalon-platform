/* Progressive enhancement. This example never submits or persists an order. */
(function () {
  'use strict';
  var root = document.querySelector('[data-journey]');
  if (!root || root.dataset.ready) return;
  var tabs = Array.from(root.querySelectorAll('[data-step]'));
  var panels = Array.from(root.querySelectorAll('[data-panel]'));
  if (tabs.length !== 5 || panels.length !== tabs.length) return;
  root.dataset.ready = 'true';
  var index = 0;
  var rail = root.querySelector('.journey-tabs');
  rail.setAttribute('role', 'tablist');
  tabs.forEach(function (tab, i) {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panels[i].id);
    panels[i].setAttribute('role', 'tabpanel');
    panels[i].setAttribute('aria-labelledby', tab.id);
    panels[i].tabIndex = 0;
  });
  root.querySelectorAll('.journey-controls').forEach(function (control) { control.hidden = false; });
  function show(next, focus, updateHash) {
    index = Math.max(0, Math.min(next, panels.length - 1));
    tabs.forEach(function (tab, i) {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
      panels[i].querySelector('[data-prev]').disabled = i === 0;
    });
    if (updateHash) history.replaceState(null, '', '#' + panels[index].id);
    if (focus) tabs[index].focus({ preventScroll: true });
  }
  tabs.forEach(function (tab, i) { tab.addEventListener('click', function (e) { e.preventDefault(); show(i, false, true); }); });
  rail.addEventListener('keydown', function (e) {
    var target;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') target = (index + 1) % tabs.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') target = (index + tabs.length - 1) % tabs.length;
    if (e.key === 'Home') target = 0;
    if (e.key === 'End') target = tabs.length - 1;
    if (target === undefined) return;
    e.preventDefault(); show(target, true, true);
  });
  root.querySelectorAll('[data-next]').forEach(function (button) {
    button.addEventListener('click', function () { show((index + 1) % tabs.length, true, true); });
  });
  root.querySelectorAll('[data-prev]').forEach(function (button) {
    button.addEventListener('click', function () { show(index - 1, true, true); });
  });
  var scopes = {
    whole: { title: 'Работа целиком', file: 'Работа.docx', lines: ['Введение', 'Основная часть', 'Заключение и источники'] },
    chapter: { title: 'Отдельная глава', file: 'Глава.docx', lines: ['Нужный раздел', 'Связь с твоей работой', 'Источники по разделу'] },
    revision: { title: 'Доработка', file: 'Работа_с_правками.docx', lines: ['Твой исходный файл', 'Замечания и требования', 'Исправленная версия'] }
  };
  root.querySelectorAll('[data-scope]').forEach(function (button) {
    button.addEventListener('click', function () {
      var value = scopes[button.dataset.scope];
      if (!value) return;
      root.querySelectorAll('[data-scope]').forEach(function (item) { item.setAttribute('aria-pressed', String(item === button)); });
      root.querySelectorAll('[data-scope-title]').forEach(function (title) { title.textContent = value.title; });
      root.querySelector('[data-result-file]').textContent = value.file;
      var outline = root.querySelector('[data-outline]');
      outline.replaceChildren();
      value.lines.forEach(function (line, i) {
        var row = document.createElement('span');
        var number = document.createElement('b');
        number.textContent = '0' + (i + 1);
        row.append(number, document.createTextNode(line));
        outline.append(row);
      });
    });
  });
  root.querySelectorAll('[data-revision]').forEach(function (button) {
    button.addEventListener('click', function () {
      var included = button.dataset.revision === 'included';
      root.querySelectorAll('[data-revision]').forEach(function (item) { item.setAttribute('aria-pressed', String(item === button)); });
      root.querySelector('[data-revision-note]').textContent = included ? 'Исправить оформление по исходной методичке' : 'Добавить ещё одну главу, которой не было в задании';
      root.querySelector('[data-revision-label]').textContent = included ? 'Исправим без доплаты' : 'Сначала согласуем';
      root.querySelector('[data-revision-detail]').textContent = included ? 'Если результат не соответствует согласованным требованиям.' : 'Новый объём, цену и срок. Начнём после твоего согласия.';
    });
  });
  function fromHash() {
    var found = panels.findIndex(function (panel) { return '#' + panel.id === location.hash; });
    if (found !== -1) show(found, false, false);
  }
  show(0, false, false);
  fromHash();
  window.addEventListener('hashchange', fromHash);
  root.classList.add('is-ready');
})();
