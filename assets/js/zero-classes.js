(function () {
  'use strict';

  var endpoint = '/api/campaigns/zero-classes-2026-09-01/status';
  var campaign = 'zero-classes-2026-09-01';
  var labels = {
    upcoming: 'Ещё не началась',
    live: 'Раздача открыта',
    sold_out: '10 из 10 уже забрали',
    ended: 'Раздача закончилась',
    closed: 'Выдача приостановлена'
  };
  var timer = 0;

  function render(body) {
    var status = document.getElementById('zeroConnection');
    if (!status || !body || body.ok !== true || body.campaign_id !== campaign || !Array.isArray(body.drops)) return false;
    if (body.state === 'preparing' && body.drops.length === 0) {
      status.textContent = 'Готовим раздачу. Выдача пока не открыта.';
      return true;
    }
    if (body.state !== 'active' && body.state !== 'closed') return false;
    var ids = body.drops.map(function (drop) { return String(drop.id); }).sort().join(',');
    if (body.drops.length !== 3 || ids !== '0901,1301,1801') return false;
    if (!body.drops.every(function (drop) {
      return Number.isInteger(drop.remaining) && drop.remaining >= 0 && drop.remaining <= 10;
    })) return false;
    body.drops.forEach(function (drop) {
      var card = document.querySelector('[data-drop="' + String(drop.id) + '"]');
      if (!card) return;
      var state = body.state === 'closed'
        ? 'closed'
        : (Object.prototype.hasOwnProperty.call(labels, drop.state) ? drop.state : 'closed');
      card.dataset.state = state;
      var line = card.querySelector('b');
      if (line) {
        line.textContent = state === 'live'
          ? String(drop.remaining) + ' из 10 ещё здесь'
          : (state === 'ended' && drop.remaining > 0
            ? 'Закончилась. ' + String(drop.remaining) + ' не забрали'
            : labels[state]);
      }
    });
    status.textContent = body.state === 'closed'
      ? 'Новые коды пока не выдаём. Уже полученные сохраняются.'
      : 'Остаток обновлён по серверу. Во время раздачи окончательное место закрепляет бот.';
    return true;
  }

  async function refresh() {
    try {
      var response = await fetch(endpoint, { credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok || !render(await response.json())) throw new Error('status_unavailable');
    } catch (error) {
      var status = document.getElementById('zeroConnection');
      if (status) status.textContent = 'Счётчик переподключается. Актуальное место всё равно проверит бот Кладовой.';
    } finally {
      timer = window.setTimeout(refresh, 5000);
    }
  }

  window.addEventListener('pagehide', function () { window.clearTimeout(timer); }, { once: true });
  refresh();
}());
