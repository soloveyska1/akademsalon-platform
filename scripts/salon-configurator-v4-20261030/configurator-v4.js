/* Форма заявки v4. Вуз и требования к оригинальности уходят исполнителю внутри текста задания:
   поля пишут строки «Вуз: …» и «Оригинальность: …» в начало #details, а дальше заявку собирает
   и отправляет прежний salon-order.js. Сервер и контракт заявки не меняются. */
(function () {
  'use strict';
  var details = document.getElementById('details');
  var uni = document.getElementById('cfg4-university');
  var orig = document.getElementById('cfg4-originality');
  if (!details || !uni || !orig) return;

  var KEY = 'salon_order_extra_v4';
  var FIELDS = [['Вуз', uni], ['Оригинальность', orig]];
  var LINE = /^(Вуз|Оригинальность): (.*)$/;

  // Шапка задания — подряд идущие строки «Вуз: …»/«Оригинальность: …» в самом начале и пустая строка после
  function split(text) {
    var lines = String(text || '').split('\n'), i = 0, head = {}, m;
    while (i < lines.length && (m = lines[i].match(LINE))) { head[m[1]] = m[2]; i++; }
    if (i > 0 && lines[i] === '') i++;
    return { head: head, rest: lines.slice(i).join('\n') };
  }

  function sync() {
    var rest = split(details.value).rest;
    var head = FIELDS.map(function (f) {
      var v = f[1].value.replace(/\s+/g, ' ').trim();
      return v ? f[0] + ': ' + v : '';
    }).filter(Boolean);
    var next = head.join('\n') + (head.length && rest ? '\n\n' : '') + rest;
    if (next !== details.value) {
      details.value = next;
      details.dispatchEvent(new Event('input', { bubbles: true }));
    }
    try { sessionStorage.setItem(KEY, JSON.stringify({ u: uni.value, o: orig.value })); } catch (e) {}
  }

  var saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) {}
  var found = split(details.value).head;
  uni.value = (saved && saved.u) || found['Вуз'] || '';
  orig.value = (saved && saved.o) || found['Оригинальность'] || '';
  uni.addEventListener('input', sync);
  orig.addEventListener('input', sync);
  if (uni.value || orig.value) sync();

  // Кнопка «Оригинальность» в помощнике задания повторяет отдельное поле
  function hideChip() {
    Array.prototype.forEach.call(document.querySelectorAll('.ic-brief-chip'), function (b) {
      if (b.textContent.trim() === 'Оригинальность') b.hidden = true;
    });
  }
  hideChip();
  setTimeout(hideChip, 800);
})();
