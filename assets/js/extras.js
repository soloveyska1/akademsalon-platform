/* ============================================================
   АКАДЕМИЧЕСКИЙ САЛОН — слой гостеприимства «Оттиск»
   - тур для новичков (Salon.tour) с подарком 300 бонусов
   - куки-плашка (согласие фиксируется, ничего лишнего)
   - «Нужна помощь?» — появляется по поведению, не по таймеру-спаму
   - диалоги Salon.confirm / Salon.prompt (вместо window.confirm)
   - переходы между страницами «перелистнули лист»
   - печать-вспышка Salon.stamp('Оплачено')
   Подключается ПОСЛЕ app.js на каждой странице.
   ============================================================ */
(function () {
  'use strict';
  var S = window.Salon;
  if (!S) return;
  var reduceMotion = S.reduceMotion;
  var here = (location.pathname.split('/').pop() || 'index.html') || 'index.html';
  var QUIET_PAGES = { 'admin.html': 1, '404.html': 1 };

  /* ---------------- Диалоги ---------------- */
  function buildDlg(opts) {
    var el = document.createElement('div');
    el.className = 'sdlg';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML =
      '<div class="sdlg-back" data-x></div>' +
      '<div class="sdlg-card">' +
        (opts.title ? '<h3></h3>' : '') +
        (opts.text ? '<p></p>' : '') +
        (opts.input === 'textarea'
          ? '<textarea rows="3" maxlength="' + (opts.maxlength || 500) + '"></textarea>'
          : opts.input ? '<input type="' + opts.input + '">' : '') +
        '<div class="sdlg-row">' +
          '<button type="button" class="btn ' + (opts.danger ? 'btn-line' : 'btn-wax') + '" data-ok></button>' +
          '<button type="button" class="btn ' + (opts.danger ? 'btn-wax' : 'btn-line') + '" data-no></button>' +
        '</div>' +
        (opts.note ? '<p class="sdlg-note"></p>' : '') +
      '</div>';
    if (opts.title) el.querySelector('h3').textContent = opts.title;
    if (opts.text) el.querySelector('.sdlg-card > p').textContent = opts.text;
    if (opts.note) el.querySelector('.sdlg-note').textContent = opts.note;
    var field = el.querySelector('textarea, input');
    if (field && opts.placeholder) field.placeholder = opts.placeholder;
    el.querySelector('[data-ok]').textContent = opts.okLabel || 'Подтвердить';
    el.querySelector('[data-no]').textContent = opts.noLabel || 'Отмена';
    return el;
  }
  /* Salon.confirm({title,text,okLabel,noLabel,input,placeholder,note,danger})
     → Promise<{ok:boolean, value:string}> */
  S.confirm = function (opts) {
    return new Promise(function (res) {
      var el = buildDlg(opts || {});
      document.body.appendChild(el);
      requestAnimationFrame(function () { el.classList.add('open'); });
      var field = el.querySelector('textarea, input');
      var okBtn = el.querySelector('[data-ok]');
      (field || okBtn).focus();
      function close(ok) {
        el.classList.remove('open');
        setTimeout(function () { el.remove(); }, 240);
        document.removeEventListener('keydown', onKey);
        res({ ok: ok, value: field ? field.value.trim() : '' });
      }
      function onKey(e) {
        if (e.key === 'Escape') close(false);
        if (e.key === 'Enter' && (!field || field.tagName !== 'TEXTAREA')) close(true);
      }
      document.addEventListener('keydown', onKey);
      okBtn.addEventListener('click', function () { close(true); });
      el.querySelector('[data-no]').addEventListener('click', function () { close(false); });
      el.querySelector('[data-x]').addEventListener('click', function () { close(false); });
    });
  };

  /* ---------------- Печать-вспышка ---------------- */
  S.stamp = function (text, opts) {
    opts = opts || {};
    var el = document.createElement('div');
    el.className = 'stamp-burst' + (opts.tone === 'wax' ? ' wax' : '');
    el.innerHTML = '<span class="sb-seal"></span>';
    el.querySelector('.sb-seal').textContent = text || 'Готово';
    document.body.appendChild(el);
    setTimeout(function () { el.classList.add('fade'); }, opts.hold || 1500);
    setTimeout(function () { el.remove(); }, (opts.hold || 1500) + 600);
  };

  /* ---------------- Куки-плашка ---------------- */
  (function cookieBar() {
    if (QUIET_PAGES[here]) return;
    var saved = S.store.get('salon_consent', null);
    if (saved && saved.v >= 1) return;
    var el = document.createElement('div');
    el.className = 'cookiebar';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Сообщение о cookie');
    el.innerHTML =
      '<p><b>Пара слов о данных.</b> Сайт хранит в вашем браузере только служебные ' +
      'записи: тему оформления, черновик расчёта и доступ к вашим заказам. ' +
      'Рекламных трекеров нет.</p>' +
      '<div class="cb-row">' +
        '<button type="button" class="btn btn-ink" data-cb-ok>Хорошо</button>' +
        '<a class="cb-more" href="privacy.html#cookies">Подробнее</a>' +
      '</div>';
    document.body.appendChild(el);
    setTimeout(function () { el.classList.add('in'); }, 900);
    el.querySelector('[data-cb-ok]').addEventListener('click', function () {
      S.store.set('salon_consent', { v: 1, at: new Date().toISOString(), necessary: true });
      el.classList.remove('in');
      setTimeout(function () { el.remove(); }, 400);
    });
  })();

  /* ---------------- Переходы между страницами ---------------- */
  (function pageTurn() {
    if (reduceMotion) return;
    var veil = document.createElement('div');
    veil.className = 'page-veil';
    veil.setAttribute('aria-hidden', 'true');
    veil.innerHTML = '<span class="pv-line"></span><span class="pv-para">¶</span>';
    document.body.appendChild(veil);
    /* выход: если пришли переходом — мягко проявляем страницу */
    try {
      if (sessionStorage.getItem('salon_turn') === '1') {
        sessionStorage.removeItem('salon_turn');
        veil.classList.add('out');
        setTimeout(function () { veil.classList.remove('out'); }, 480);
      }
    } catch (e) {}
    window.addEventListener('pageshow', function (e) {
      if (e.persisted) veil.classList.remove('act', 'out');
    });
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      var href = a.getAttribute('href') || '';
      if (!/\.html(\?|#|$)/.test(href) || href.charAt(0) === '#') return;
      if (a.origin && a.origin !== location.origin) return;
      /* переход на ту же страницу с якорем — не перехватываем */
      if (a.pathname === location.pathname && a.hash) return;
      e.preventDefault();
      try { sessionStorage.setItem('salon_turn', '1'); } catch (err) {}
      veil.classList.remove('out');
      veil.classList.add('act');
      setTimeout(function () { location.href = a.href; }, 250);
    });
  })();

  /* ---------------- Тур «Как всё устроено» ---------------- */
  var tour = (function () {
    var veil, hole, card, idx = 0, steps = [], active = false;

    function allSteps() {
      return [
        {
          center: true,
          step: 'Знакомство',
          title: 'Добро пожаловать в Академический Салон',
          text: 'Мы — мастерская академических работ: дипломы, курсовые, статьи. ' +
                'За полминуты покажем, как здесь всё устроено, — а в конце вас ждёт подарок.',
          ok: 'Показать'
        },
        {
          sel: '[data-plates="type"], #typeGroup, .nav-cta a.btn-wax',
          step: 'Шаг 1 · Цена',
          title: 'Стоимость считается открыто',
          text: 'Выбираете тип работы, направление и срок — и сразу видите цену. ' +
                'Формула открыта, никаких «уточните в личных сообщениях».'
        },
        {
          sel: '.proc-toc, .pay-strip, .paysteps',
          step: 'Шаг 2 · Оплата',
          title: 'Платите по этапам, после результата',
          text: 'Сначала план и смета, затем черновики глав — каждый платёж только ' +
                'после того, как вы увидели результат. <b>Правки — бесплатно до приёмки.</b>',
          html: true
        },
        {
          sel: '.menu-toggle',
          step: 'Шаг 3 · Навигация',
          title: 'Всё — в одном меню',
          text: 'Кнопка «Меню» открывает оглавление: личный кабинет с вашими заказами, ' +
                'цены, гарантии, отзывы и базу знаний.'
        },
        {
          sel: '.tg-pill, .mobile-cta',
          step: 'Шаг 4 · Связь',
          title: 'Мы на связи в Telegram',
          text: 'Вопросы, файлы и статусы заказа живут в одном чате с мастером. ' +
                'Отвечаем быстро: обычно в течение 15–30 минут в рабочее время.'
        },
        {
          center: true,
          bonus: true,
          step: 'Подарок',
          title: '300 бонусов — за знакомство',
          text: '1 бонус = 1 ₽ скидки. Бонусы начисляются на ваш Telegram-аккаунт ' +
                'один раз и действуют 30 дней — хватит на первый заказ.',
          ok: 'Забрать 300 бонусов',
          no: 'Позже'
        }
      ];
    }

    function targetOf(st) {
      if (st.center || !st.sel) return null;
      var list = st.sel.split(',');
      for (var i = 0; i < list.length; i++) {
        var el = document.querySelector(list[i].trim());
        if (el && el.offsetParent !== null) return el;
      }
      return null;
    }

    function build() {
      veil = document.createElement('div');
      veil.className = 'tour-veil';
      veil.innerHTML = '<div class="tour-hole"></div><div class="tour-card" role="dialog" aria-modal="true"></div>';
      document.body.appendChild(veil);
      hole = veil.querySelector('.tour-hole');
      card = veil.querySelector('.tour-card');
      document.addEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape' && active) finish(false); }

    function draw() {
      var st = steps[idx];
      var t = targetOf(st);
      var pad = 8;
      if (t) {
        t.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
      }
      setTimeout(function () {
        var r = t ? t.getBoundingClientRect() : null;
        if (r) {
          hole.classList.remove('center');
          hole.style.left = (r.left - pad) + 'px';
          hole.style.top = (r.top - pad) + 'px';
          hole.style.width = (r.width + pad * 2) + 'px';
          hole.style.height = (r.height + pad * 2) + 'px';
        } else {
          hole.classList.add('center');
          hole.style.left = '50%'; hole.style.top = '46%';
          hole.style.width = '0'; hole.style.height = '0';
        }
        var dots = steps.map(function (_, i) {
          return '<i class="' + (i <= idx ? 'on' : '') + '"></i>';
        }).join('');
        var body = st.html ? st.text : null;
        card.innerHTML =
          '<span class="tc-step">' + st.step + ' · ' + (idx + 1) + ' из ' + steps.length + '</span>' +
          '<h3></h3>' +
          (st.bonus
            ? '<div class="tour-bonus"><span class="tb-num">300</span>' +
              '<small>бонусов · 1 бонус = 1 ₽ скидки<br>действуют 30 дней · один раз на аккаунт</small></div>'
            : '') +
          '<p></p>' +
          '<div class="tour-dots">' + dots + '</div>' +
          '<div class="tour-nav">' +
            (idx > 0 ? '<button type="button" class="btn btn-line" data-t-prev>Назад</button>' : '') +
            '<button type="button" class="btn btn-wax" data-t-next></button>' +
            (st.bonus && st.no ? '<button type="button" class="btn btn-line" data-t-later></button>' : '') +
            (!st.bonus ? '<button type="button" class="tour-skip" data-t-skip>Пропустить</button>' : '') +
          '</div>' +
          (st.bonus ? '<p class="sdlg-note">Начислим в нашем Telegram-боте после подтверждения ' +
            'знакомства с правилами — честно и без мелкого шрифта.</p>' : '');
        card.querySelector('h3').textContent = st.title;
        if (body) card.querySelector('p').innerHTML = body;
        else card.querySelector('p').textContent = st.text;
        card.querySelector('[data-t-next]').textContent =
          st.ok || (idx === steps.length - 1 ? 'Готово' : 'Дальше');
        if (st.bonus && st.no) card.querySelector('[data-t-later]').textContent = st.no;

        /* позиция карточки: под целью; если не влезает — над; по центру — в центр */
        var cw = Math.min(window.innerWidth * 0.92, 430);
        var isMobile = window.innerWidth <= 640;
        if (!isMobile) {
          var ch = card.offsetHeight || 260;
          var left, top;
          if (r) {
            left = Math.max(12, Math.min(r.left, window.innerWidth - cw - 12));
            top = (r.bottom + 14 + ch < window.innerHeight)
              ? r.bottom + 14
              : Math.max(12, r.top - ch - 14);
          } else {
            left = (window.innerWidth - cw) / 2;
            top = Math.max(40, (window.innerHeight - ch) / 2 - 30);
          }
          card.style.left = left + 'px';
          card.style.top = top + 'px';
        }
        var nx = card.querySelector('[data-t-next]');
        if (nx) nx.focus({ preventScroll: true });
      }, t ? 380 : 60);
    }

    function next() {
      var st = steps[idx];
      if (st.bonus) { claimBonus(); return; }
      if (idx >= steps.length - 1) { finish(true); return; }
      idx++; draw();
    }
    function claimBonus() {
      var btn = card.querySelector('[data-t-next]');
      if (btn) { btn.disabled = true; btn.textContent = 'Готовим подарок…'; }
      var fallback = 'https://t.me/academic_saloon_bot?start=welcome_site';
      var open = function (link) {
        finish(true);
        var w = window.open(link, '_blank', 'noopener');
        if (!w) location.href = link;
      };
      if (S.api && S.api.post) {
        S.api.post('/welcome/token').then(function (r) {
          open(r && r.ok && r.link ? r.link : fallback);
        });
      } else open(fallback);
    }
    function finish(done) {
      active = false;
      document.removeEventListener('keydown', onKey);
      if (veil) { veil.remove(); veil = null; }
      S.store.set('salon_tour_done', { at: Date.now(), finished: !!done });
    }

    veilClick();
    function veilClick() { /* клики мимо карточки не закрывают тур — чтобы случайно не потерять */ }

    return {
      start: function () {
        if (active) return;
        steps = allSteps().filter(function (st) { return st.center || targetOf(st); });
        if (steps.length < 2) return;
        idx = 0; active = true;
        build();
        veil.addEventListener('click', function (e) {
          if (e.target.closest('[data-t-next]')) { next(); return; }
          if (e.target.closest('[data-t-prev]')) { if (idx > 0) { idx--; draw(); } return; }
          if (e.target.closest('[data-t-skip]') || e.target.closest('[data-t-later]')) { finish(false); return; }
        });
        window.addEventListener('resize', function () { if (active) draw(); });
        draw();
      },
      active: function () { return active; }
    };
  })();
  S.tour = tour;

  /* автозапуск тура: только главная, только новые гости, один раз */
  (function autoTour() {
    if (here !== 'index.html' || QUIET_PAGES[here]) return;
    if (S.store.get('salon_tour_done', null)) return;
    if (S.api && S.api.identified && S.api.identified()) return; /* уже свой человек */
    setTimeout(function () {
      if (!document.hidden && !tour.active()) tour.start();
    }, 1800);
  })();

  /* пункт «Как всё устроено?» в меню и подвале — тур можно пересмотреть */
  (function tourEntry() {
    if (QUIET_PAGES[here]) return;
    var toc = document.querySelector('.toc-primary');
    if (toc && !toc.querySelector('[data-tour-row]')) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'dotrow';
      b.setAttribute('data-tour-row', '1');
      b.innerHTML = '<span>Как всё устроено</span><span class="dots"></span><span class="dr-val">тур&nbsp;¶</span>';
      b.addEventListener('click', function () {
        if (window.Salon.toc) window.Salon.toc.close();
        setTimeout(tour.start, 250);
      });
      toc.appendChild(b);
    }
    var foot = document.querySelector('.site-footer .foot-links');
    if (foot && !foot.querySelector('[data-tour-link]')) {
      var a = document.createElement('a');
      a.href = '#';
      a.setAttribute('data-tour-link', '1');
      a.textContent = 'Как всё устроено — тур';
      a.addEventListener('click', function (e) { e.preventDefault(); tour.start(); });
      foot.appendChild(a);
    }
  })();

  /* ---------------- «Нужна помощь?» ---------------- */
  (function helpFab() {
    if (QUIET_PAGES[here]) return;
    var shown = false, dismissed = false;
    try { dismissed = sessionStorage.getItem('salon_help_off') === '1'; } catch (e) {}
    if (dismissed) return;
    var el;
    function show(reason) {
      if (shown || dismissed || tour.active()) return;
      shown = true;
      el = document.createElement('button');
      el.type = 'button';
      el.className = 'helpfab';
      el.setAttribute('aria-label', 'Нужна помощь? Открыть варианты связи');
      el.innerHTML = '<span class="hf-ic">✎</span><span>Нужна помощь?</span><span class="hf-x" data-hf-x aria-label="Скрыть">×</span>';
      document.body.appendChild(el);
      requestAnimationFrame(function () { el.classList.add('in'); });
      el.addEventListener('click', function (e) {
        if (e.target.closest('[data-hf-x]')) {
          e.stopPropagation();
          dismissed = true;
          try { sessionStorage.setItem('salon_help_off', '1'); } catch (err) {}
          el.classList.remove('in');
          setTimeout(function () { el.remove(); }, 400);
          return;
        }
        if (S.contact) S.contact({
          lead: 'Расскажите о задаче — подскажем, посчитаем и сориентируем по срокам. ' +
                'Бесплатно, отвечает живой человек.'
        });
      });
    }
    /* триггеры: пауза чтения, попытка уйти, долгий выбор в конфигураторе */
    var dwell = setTimeout(function () { show('dwell'); }, 45000);
    document.addEventListener('mouseout', function (e) {
      if (!e.relatedTarget && e.clientY <= 0) show('exit');
    });
    if (here === 'configurator.html') {
      setTimeout(function () { show('config'); }, 25000);
    }
    window.addEventListener('pagehide', function () { clearTimeout(dwell); });
  })();

  /* ---------------- Нудж регистрации (для гостевых заявок) ---------------- */
  /* Salon.tgNudge(container, claimLink) — мягкое предложение привязать Telegram */
  S.tgNudge = function (container, claimLink) {
    if (!container || container.querySelector('.nudge')) return;
    var el = document.createElement('div');
    el.className = 'nudge';
    el.innerHTML =
      '<h4>Удобнее с Telegram — и 300 бонусов в подарок</h4>' +
      '<p>Привяжите заказ к Telegram: статусы и файлы будут приходить прямо в чат, ' +
      'заказ не потеряется при смене устройства, а новым гостям мы начисляем ' +
      '300 бонусов на первый заказ. Это необязательно — заказ уже принят и без этого.</p>' +
      '<div class="n-row">' +
        '<a class="btn btn-wax" target="_blank" rel="noopener">Привязать Telegram</a>' +
        '<button type="button" class="n-later">Продолжить как гость</button>' +
      '</div>';
    el.querySelector('a').href = claimLink || 'https://t.me/academic_saloon_bot';
    el.querySelector('.n-later').addEventListener('click', function () {
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 300);
    });
    container.appendChild(el);
  };
})();
