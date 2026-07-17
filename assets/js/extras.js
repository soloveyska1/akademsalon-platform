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
      /* .open — БЕЗ requestAnimationFrame: в браузерах с придушенным rAF
         (энергосбережение/Турбо) кадр не наступает, диалог оставался
         невидимым и его подложка «замораживала» админку. Reflow фиксирует
         стартовые стили — транзишен играет там, где рендер живой. */
      void el.offsetWidth;
      el.classList.add('open');
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

  /* ---------------- «Пригласительное письмо» ----------------
     Salon.invite({site, tg}) — красивый механизм «пригласить друга»:
     готовый текст письма (не голая ссылка), отправка в Telegram/ВК/WhatsApp,
     копирование письма целиком. Работает без анимаций и без rAF. */
  S.invite = function (links) {
    links = links || {};
    var site = links.site || 'https://akademsalon.ru/';
    var letter = 'Привет! Советую «Академический Салон» — мастерская, которая помогает ' +
      'студентам: курсовые, дипломы и ВКР, доводка до антиплагиата, нормоконтроль.\n\n' +
      'По моей ссылке тебе начислят 200 бонусов на первую работу (1 бонус = 1 ₽):\n' + site;
    var shareText = 'Дарю 200 бонусов на первую студенческую работу в «Академическом Салоне» — ' +
      'курсовые, дипломы, ВКР, антиплагиат.';
    var enc = encodeURIComponent;
    var shares = [
      { cls: 'tg', label: 'Telegram', href: 'https://t.me/share/url?url=' + enc(site) + '&text=' + enc(shareText) },
      { cls: 'vk', label: 'ВКонтакте', href: 'https://vk.com/share.php?url=' + enc(site) + '&comment=' + enc(shareText) },
      { cls: 'wa', label: 'WhatsApp', href: 'https://api.whatsapp.com/send?text=' + enc(letter) }
    ];
    var el = document.createElement('div');
    el.className = 'sdlg inv';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Пригласительное письмо');
    el.innerHTML =
      '<div class="sdlg-back" data-x></div>' +
      '<div class="sdlg-card inv-card">' +
        '<button type="button" class="inv-x" data-x aria-label="Закрыть">✕</button>' +
        '<p class="inv-caps">Клуб Салона · приглашение</p>' +
        '<h3 class="inv-h">Пригласительное письмо</h3>' +
        '<div class="inv-sheet">' +
          '<span class="inv-para">¶</span>' +
          '<p class="inv-text"></p>' +
          '<span class="inv-seal" aria-hidden="true">АС</span>' +
        '</div>' +
        '<div class="inv-gain">' +
          '<span class="ig-chip">Другу — <b>200 бонусов</b> на первую работу</span>' +
          '<span class="ig-chip">Вам — <b>5%</b> с каждой его оплаты</span>' +
        '</div>' +
        '<div class="inv-row">' +
          shares.map(function (s) {
            return '<a class="btn btn-line inv-share ' + s.cls + '" target="_blank" rel="noopener" href="' + s.href + '">' + s.label + '</a>';
          }).join('') +
        '</div>' +
        '<div class="inv-row">' +
          '<button type="button" class="btn btn-wax" data-inv-copy>⧉ Скопировать письмо</button>' +
          (navigator.share ? '<button type="button" class="btn btn-line" data-inv-native>Поделиться…</button>' : '') +
        '</div>' +
        '<p class="sdlg-note">Ссылка личная — бонусы придут именно вам. Начисления видны в кабинете, в журнале бонусов. <a class="link" href="loyalty.html">Правила клуба</a></p>' +
      '</div>';
    el.querySelector('.inv-text').textContent = letter;
    document.body.appendChild(el);
    setTimeout(function () { el.classList.add('open'); }, 10);
    function close() {
      el.classList.remove('open');
      setTimeout(function () { el.remove(); }, 240);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-x]')) { close(); return; }
      if (e.target.closest('[data-inv-copy]')) {
        (S.copy ? S.copy(letter) : Promise.resolve(false)).then(function (ok) {
          var b = el.querySelector('[data-inv-copy]');
          if (b) b.textContent = ok ? 'Письмо в буфере ✓ — вставьте в чат' : 'Выделите текст письма вручную';
          if (S.toast && ok) S.toast('Письмо скопировано — отправьте другу');
        });
        return;
      }
      if (e.target.closest('[data-inv-native]')) {
        try { navigator.share({ text: letter }); } catch (err) {}
      }
    });
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
      '<p><b>Пара слов о данных.</b> Сайт хранит служебные записи: тему оформления, ' +
      'черновик расчёта и доступ к вашим заказам. После «Хорошо» включится ' +
      'обезличенная статистика Яндекс.Метрики — рекламных трекеров нет.</p>' +
      '<div class="cb-row">' +
        '<button type="button" class="btn btn-ink" data-cb-ok>Хорошо</button>' +
        '<a class="cb-more" href="privacy.html#cookies">Подробнее</a>' +
      '</div>';
    document.body.appendChild(el);
    setTimeout(function () { el.classList.add('in'); }, 900);
    el.querySelector('[data-cb-ok]').addEventListener('click', function () {
      S.store.set('salon_consent', { v: 1, at: new Date().toISOString(), necessary: true });
      document.dispatchEvent(new CustomEvent('salon:consent'));
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
          text: 'Мы — академическая мастерская: консультации, разборы и авторские материалы ' +
                'по дипломам, курсовым и статьям. За полминуты покажем, как здесь всё устроено, — а в конце вас ждёт подарок.',
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
                'цены, гарантии, отзывы и полезные материалы.'
        },
        {
          sel: '.tg-pill, .mobile-cta',
          step: 'Шаг 4 · Связь',
          title: 'Всё — на сайте, мессенджеры по желанию',
          text: 'Заявка, файлы, переписка с мастером и статусы живут в личном кабинете на сайте. ' +
                'Удобнее в мессенджере? Мы есть во ВКонтакте, MAX и Telegram — отвечаем обычно за 15–30 минут в рабочее время.'
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

  /* автозапуск тура: только главная, только новые гости, один раз.
     Первому гостю сначала показывается пролог-фильм (оверлей поверх всего) —
     тур ждёт его закрытия, иначе раскладывается невидимо под iframe. */
  (function autoTour() {
    if (here !== 'index.html' || QUIET_PAGES[here]) return;
    if (S.store.get('salon_tour_done', null)) return;
    if (S.api && S.api.identified && S.api.identified()) return; /* уже свой человек */
    function later() {
      setTimeout(function () {
        if (!document.hidden && !tour.active() &&
            !document.documentElement.classList.contains('has-prelude')) tour.start();
      }, 1800);
    }
    if (document.documentElement.classList.contains('has-prelude')) {
      document.addEventListener('salon:prelude-closed', later, { once: true });
    } else {
      later();
    }
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
      void el.offsetWidth; /* показ без rAF */
      el.classList.add('in');
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

  /* ---------------- Живые уведомления о заказе ----------------
     Клиент ходит по сайту, а дело сдвинулось (цена, статус, сообщение) —
     показываем аккуратный «лист» в углу с мягким колокольчиком и ссылкой
     в кабинет. Кабинет сам себе источник правды — там поллер не нужен. */
  (function liveOrders() {
    if (QUIET_PAGES[here] || here === 'dashboard.html') return;
    if (!S.api || !S.api.identified || !S.api.identified()) return;

    var EVENT_TEXT = {
      priced: function (o) {
        return 'Мастер назвал цену' + (o.price ? ' — ' + o.price.toLocaleString('ru-RU') + ' ₽' : '') + '. Решение за вами.';
      },
      prepay: function () { return 'Ожидаем предоплату — реквизиты в кабинете.'; },
      work:   function () { return 'Оплата получена — работа взята в производство.'; },
      check:  function () { return 'Работа готова! Посмотрите и примите её.'; },
      fix:    function () { return 'Ваши замечания приняты — вносим правки.'; },
      done:   function () { return 'Заказ завершён. Мы на связи до защиты!'; },
      cancel: function () { return 'Заявка закрыта — возобновить можно в кабинете.'; },
      msg:    function () { return 'Новое сообщение мастера — ответ ждёт в переписке.'; },
      file:   function () { return 'Мастерская положила новый файл в дело — посмотрите.'; },
      newo:   function () { return 'Заявка принята — мастер уже изучает её.'; }
    };

    /* мягкий двухнотный колокольчик; звук возможен только после жеста */
    var canSound = false, actx = null;
    ['pointerdown', 'keydown'].forEach(function (ev) {
      document.addEventListener(ev, function () { canSound = true; }, { once: true, passive: true });
    });
    function chime() {
      if (!canSound) return;
      try {
        actx = actx || new (window.AudioContext || window.webkitAudioContext)();
        if (actx.state === 'suspended') actx.resume();
        var t0 = actx.currentTime;
        [[880, 0, 0.9], [1318.5, 0.11, 1.1]].forEach(function (n) {
          var o = actx.createOscillator(), g = actx.createGain();
          o.type = 'sine';
          o.frequency.value = n[0];
          g.gain.setValueAtTime(0, t0 + n[1]);
          g.gain.linearRampToValueAtTime(0.08, t0 + n[1] + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + n[1] + n[2]);
          o.connect(g); g.connect(actx.destination);
          o.start(t0 + n[1]); o.stop(t0 + n[1] + n[2] + 0.05);
        });
      } catch (e) {}
    }

    var shownNow = 0;
    function showNote(o, kind) {
      var make = EVENT_TEXT[kind];
      if (!make || shownNow >= 2) return;
      shownNow++;
      var el = document.createElement('a');
      el.className = 'onote';
      el.href = 'dashboard.html';
      el.setAttribute('role', 'status');
      el.innerHTML =
        '<span class="on-seal" aria-hidden="true">¶</span>' +
        '<span class="on-body"><span class="on-cap">Дело ' + (o.no || '№' + o.id) + ' · Академический Салон</span>' +
        '<b>' + make(o) + '</b>' +
        '<span class="on-go">Открыть кабинет <span class="ar">→</span></span></span>' +
        '<button type="button" class="on-x" aria-label="Закрыть">×</button>';
      document.body.appendChild(el);
      setTimeout(function () { el.classList.add('in'); }, 30); /* rAF замирает в фоне */
      chime();
      function gone() {
        el.classList.remove('in');
        setTimeout(function () { el.remove(); shownNow--; }, 350);
      }
      el.querySelector('.on-x').addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation(); gone();
      });
      setTimeout(gone, 12000);
    }

    function sysNote(o, kind) {
      /* вкладка в фоне: если разрешены уведомления устройства — будим ими */
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      var TXT = {
        newo: 'Заявка принята — мастер уже смотрит',
        priced: 'Мастер назвал цену — решение за вами',
        prepay: 'Ожидается оплата этапа',
        work: 'Оплата получена — работа пошла',
        check: 'Готово! Посмотрите работу',
        fix: 'Приняли в правки',
        done: 'Дело завершено — спасибо!',
        cancel: 'Заявка закрыта',
        file: 'Новый файл от мастерской',
        msg: 'Новое сообщение мастера'
      };
      try {
        var n = new Notification('Дело ' + (o.no || '№' + o.id) + ' — Академический Салон',
          { body: TXT[kind] || 'Движение по делу', icon: 'assets/img/favicon-120.png', tag: 'salon-' + o.id });
        n.onclick = function () { try { window.focus(); location.href = 'dashboard.html'; } catch (e) {} this.close(); };
      } catch (e) {}
    }

    function poll(silent) {
      var noti = ('Notification' in window) && Notification.permission === 'granted';
      if (document.hidden && !noti) return;
      var t = S.api.token(), g = S.api.guestTokens();
      if (!t && !g.length) return;
      S.api.get('/orders' + (t ? '' : '?tokens=' + encodeURIComponent(g.join(',')))).then(function (r) {
        if (!r || !r.ok || !r.orders) return;
        var prev = S.store.get('salon_watch', null);
        var first = prev === null;
        prev = prev || {};
        var next = {}, events = [];
        r.orders.forEach(function (o) {
          next[o.id] = { s: o.status, u: o.unread || 0, f: o.files_new || 0 };
          var p = prev[o.id];
          if (!p) {
            if (!first) events.push([o, 'newo']);
            return;
          }
          if (p.s !== o.status) events.push([o, o.status === 'new' ? 'newo' : o.status]);
          else if ((o.files_new || 0) > (p.f || 0)) events.push([o, 'file']);
          else if ((o.unread || 0) > (p.u || 0)) events.push([o, 'msg']);
        });
        S.store.set('salon_watch', next);
        if (!silent && !first) {
          events.slice(0, 2).forEach(function (ev) {
            if (document.hidden) sysNote(ev[0], ev[1]);
            else showNote(ev[0], ev[1]);
          });
        }
      });
    }

    setTimeout(function () { poll(false); }, 2200);   /* при заходе на страницу */
    setInterval(function () { poll(false); }, 90000); /* и раз в полторы минуты */
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) setTimeout(function () { poll(false); }, 800);
    });
  })();

  /* ---------------- Нудж «Сохраните доступ к делу» (гостевые заявки) ----------------
     Salon.orderNudge(container, token) — ссылка доступа к делу (главное,
     работает при любых блокировках) + необязательная привязка Telegram. */
  S.orderNudge = function (container, token) {
    if (!container || container.querySelector('.nudge') || !token) return;
    var el = document.createElement('div');
    el.className = 'nudge';
    var siteLink = S.claimLink ? S.claimLink(token) : '';
    var tgLink = 'https://t.me/academic_saloon_bot?start=claim_' + encodeURIComponent(token);
    el.innerHTML =
      '<h4>Сохраните доступ к делу</h4>' +
      '<p>Заказ привязан к этому браузеру. Скопируйте секретную ссылку доступа — по ней дело ' +
      'откроется на любом устройстве, мессенджеры не нужны. А если привяжете Telegram, статусы ' +
      'придут и в бота, новым гостям там — 300 бонусов. И то и другое необязательно: заказ уже принят.</p>' +
      '<div class="n-row">' +
        '<button type="button" class="btn btn-wax" data-n-copy>Скопировать ссылку доступа</button>' +
        '<a class="btn btn-line" target="_blank" rel="noopener" href="' + tgLink + '">Привязать Telegram</a>' +
        '<button type="button" class="n-later">Позже</button>' +
      '</div>';
    el.querySelector('[data-n-copy]').addEventListener('click', function () {
      if (S.copy) S.copy(siteLink).then(function (ok) {
        if (S.toast) S.toast(ok ? 'Ссылка доступа скопирована — сохраните её себе' : 'Ссылка: ' + siteLink);
      });
    });
    el.querySelector('.n-later').addEventListener('click', function () {
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 300);
    });
    container.appendChild(el);
  };

  /* ---------------- «Спросите мастера» — микролид на гайдах ----------------
     Гайды ловят информационный трафик, но «рассчитать стоимость» — слишком
     большой шаг для читателя статьи. Вопрос в одно поле — мостик к мастеру:
     уходит обычной заявкой в общую картотеку (тип «консультация»). */
  (function guideLead() {
    if (!/^guide-/.test(here) && here !== 'knowledge.html') return;
    if (!S.api) return;
    var host = document.querySelector('aside.sheet');
    if (!host) return;
    var authed = function () { return !!S.api.token(); };
    var box = document.createElement('div');
    box.style.cssText = 'margin-top:18px;padding-top:16px;border-top:1px solid var(--hairline)';
    box.innerHTML =
      '<p class="caps" style="margin-bottom:8px">Или спросите мастера прямо здесь</p>' +
      '<textarea id="glQ" rows="3" maxlength="600" placeholder="Что осталось непонятным? Спросите своими словами — ответим по-человечески" ' +
        'style="width:100%;font:inherit;font-size:15px;padding:11px 12px;color:inherit;border:1px solid var(--hairline-strong);border-radius:var(--r);background:transparent;resize:vertical"></textarea>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">' +
        '<input type="text" id="glC" placeholder="Telegram, ВК или почта — куда ответить" ' +
          'style="flex:2;min-width:200px;font:inherit;font-size:15px;padding:11px 12px;color:inherit;border:1px solid var(--hairline-strong);border-radius:var(--r);background:transparent">' +
        '<button type="button" class="btn btn-wax" id="glGo" style="flex:1;min-width:150px">Отправить вопрос</button>' +
      '</div>' +
      '<label class="petit" id="glOkRow" style="display:flex;gap:8px;align-items:flex-start;margin-top:10px;cursor:pointer">' +
        '<input type="checkbox" id="glOk" style="margin-top:3px">' +
        '<span>Согласен(на) на обработку данных для ответа на вопрос — <a class="link" href="privacy.html" target="_blank">политика</a></span></label>' +
      '<p class="petit" style="margin-top:8px;color:var(--ink-faint)">Вопрос бесплатный и ни к чему не обязывает — попадёт мастеру вместе с названием статьи.</p>';
    host.appendChild(box);
    if (authed()) { var r0 = box.querySelector('#glOkRow'); if (r0) r0.hidden = true; }
    box.querySelector('#glGo').addEventListener('click', function () {
      var q = box.querySelector('#glQ').value.trim();
      var c = box.querySelector('#glC').value.trim();
      if (q.length < 5) { S.toast('Напишите вопрос — хотя бы пару слов'); return; }
      if (!authed()) {
        if (!c) { S.toast('Оставьте контакт — куда прислать ответ'); return; }
        if (S.valid && S.valid.contact && !S.valid.contact(c)) { S.toast('Контакт не похож на телефон, ВК, Telegram или почту'); return; }
        if (!box.querySelector('#glOk').checked) { S.toast('Отметьте согласие на обработку данных'); return; }
      }
      var btn = box.querySelector('#glGo');
      S.btnLoading(btn, true, 'Отправляем…');
      var h1 = document.querySelector('h1');
      S.api.post('/orders', {
        type: 'svc_tutor', disc: 'hum', term: 'free', tier: 'base',
        topic: 'Вопрос с гайда: ' + (h1 ? h1.textContent.trim().slice(0, 120) : here),
        details: q, name: '', contact: c, website: '', deadline: '',
        consent: true,
        consent_doc: 'consent 1.2 · privacy 1.6 · oferta 1.4 · вопрос с гайда',
        page: here
      }).then(function (r) {
        S.btnLoading(btn, false);
        if (r && r.ok) {
          box.innerHTML = '<p class="caps" style="margin-bottom:8px">Вопрос у мастера ✓</p>' +
            '<p class="lead" style="margin:0">Ответим' + (c ? ' — ' + c.replace(/</g, '&lt;') : '') +
            '. Обычно это 15–30 минут днём; ночью — чуть дольше, но тоже отвечаем.</p>';
          if (S.metrika) S.metrika.goal('guide_lead');
          if (S.visit) S.visit.mark('вопрос с гайда');
        } else {
          S.toast('Не отправилось — сеть шалит. Продублируйте вопрос боту: t.me/academic_saloon_bot');
        }
      });
    });
  })();

  /* ---------------- «Ваша смета ждёт» — закладка для вернувшихся ----------------
     Гость считал в конфигураторе (savedAt > 0 — квик-калк главной пишет 0),
     ушёл, вернулся на витрину — напоминаем одной строкой-«ляссе». Возврат
     брошенной заявки без email и промокодов: просто дверь туда, где остановился. */
  (function resumeBar() {
    if (here !== 'index.html' && here !== 'tariffs.html') return;
    var d = S.store.get('salon_draft', null);
    if (!d || !d.savedAt || !d.state || !window.SalonCalc) return;
    if (Date.now() - d.savedAt > 14 * 24 * 3600 * 1000) return; /* двухнедельная память */
    try { if (sessionStorage.getItem('salon_resume_hidden')) return; } catch (e) {}
    var C = window.SalonCalc;
    var t = C.types.filter(function (x) { return x.id === d.state.type; })[0];
    if (!t) return;
    var q = C.quote(d.state.type, d.state.disc, d.state.term, d.state.tier || 'base');
    var hasText = d.fields && (d.fields.topic || d.fields.details);
    var bar = document.createElement('div');
    bar.className = 'resume-bar';
    bar.setAttribute('role', 'note');
    bar.innerHTML =
      '<style>.resume-bar{position:fixed;left:0;right:0;bottom:0;z-index:240;background:var(--mark);' +
      'border-top:1px solid var(--hairline-strong);padding:10px 16px calc(10px + env(safe-area-inset-bottom));' +
      'display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;font-size:13.5px;color:var(--ink)}' +
      '.resume-bar b{font-weight:600}.resume-bar a{white-space:nowrap}' +
      '.resume-bar .rb-x{border:none;background:none;cursor:pointer;color:var(--ink-faint);font-size:16px;line-height:1;padding:4px}' +
      '</style>' +
      '<span>✒ Ваша смета ждёт: <b>' + t.label.split(' (')[0] + ' · от ' + q.lowFmt + ' ₽</b>' +
      (hasText ? ' — тема и требования сохранены' : '') + '</span>' +
      '<a class="link" href="configurator.html">Продолжить оформление →</a>' +
      '<button type="button" class="rb-x" aria-label="Скрыть">×</button>';
    bar.querySelector('.rb-x').addEventListener('click', function () {
      try { sessionStorage.setItem('salon_resume_hidden', '1'); } catch (e) {}
      bar.remove();
      clearance();
    });
    document.body.appendChild(bar);
    /* плашка встаёт над мобильной навигацией (высота той плавает с safe-area)
       и сообщает, сколько занято у нижней кромки, — пилюли
       «Связаться»/«Нужна помощь?» поднимаются над ней через max() в CSS */
    function clearance() {
      if (!bar.isConnected) { document.documentElement.style.removeProperty('--resume-clear'); return; }
      var nav = document.querySelector('.mobile-cta'), navH = 0;
      if (nav && getComputedStyle(nav).display !== 'none') navH = nav.getBoundingClientRect().height;
      bar.style.bottom = navH ? Math.round(navH) + 'px' : '0px';
      var top = bar.getBoundingClientRect().top;
      document.documentElement.style.setProperty('--resume-clear', Math.max(0, Math.round(window.innerHeight - top)) + 'px');
    }
    clearance();
    setTimeout(clearance, 400); /* шрифты и перенос строк могли изменить высоту */
    window.addEventListener('resize', clearance, { passive: true });
    if (S.visit) S.visit.mark('показана закладка возврата сметы');
  })();
})();
