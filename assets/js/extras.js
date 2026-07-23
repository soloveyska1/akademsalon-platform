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
  /* zayavka.html — страница оплаты по ссылке: ни куки-плашки, ни закладки
     «Нужна помощь?», ни уведомлений. Человек читает условия и платит. */
  var QUIET_PAGES = { 'admin.html': 1, '404.html': 1, 'zayavka.html': 1 };

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
      /* Тутор v2 (2026-07-18): подробная экскурсия «после неё вопросов нет».
         Шаги с sel сами пропускаются, если цели на странице нет, — тур
         работает и на главной, и при повторе с любой другой страницы.
         links: пары [href, подпись] — открываются в новой вкладке, тур живёт. */
      return [
        {
          center: true,
          step: 'Знакомство',
          title: 'Добро пожаловать в Академический Салон',
          text: 'Мы — академическая мастерская: дипломы и ВКР, магистерские, курсовые, ' +
                'статьи, презентации и речи к защите. Практика — с 2020 года.<br>' +
                'Проведём короткую экскурсию — <b>около двух минут</b>, и вы будете ' +
                'понимать сайт целиком. В конце — подарок.',
          html: true,
          ok: 'Начать экскурсию'
        },
        {
          sel: '[data-plates="type"], #typeGroup, .nav-cta a.btn-wax',
          step: 'Цена',
          title: 'Стоимость считается открыто',
          text: 'Выбираете тип работы, направление и срок — и сразу видите вилку цены. ' +
                'Формула открыта, никаких «уточните в личке». Точную цену называет мастер ' +
                'после ваших требований — <b>до старта</b>, вместе со спецификацией-PDF, ' +
                'где зафиксировано, что входит в сумму.',
          html: true,
          links: [['tariffs.html', 'Каталог цен'], ['configurator.html', 'Посчитать мою задачу']]
        },
        {
          sel: '.proc-toc, .pay-strip, .paysteps, .stamp-list, #trustWall',
          step: 'Оплата',
          title: 'Платите по частям — и только после показанного результата',
          text: 'Никаких 100% вперёд: обычные заказы идут <b>50/50</b>, большие работы — ' +
                '<b>30/40/30</b>. Каждый следующий платёж — после того, как вы увидели готовую ' +
                'часть. Касса с чеком или перевод с чеком самозанятого — на выбор. ' +
                '<b>Правки — бесплатно</b>: 7 дней окна проверки на каждую часть и сервисное ' +
                'окно до защиты.',
          html: true,
          links: [['oplata.html#zaruchku', 'Дорожка оплаты — за ручку'], ['oplata.html', 'Как устроены деньги']]
        },
        {
          sel: '.nav-cab, .mn-cab',
          step: 'Кабинет',
          title: 'Личный кабинет — пульт вашего дела',
          text: 'Статусы, файлы, переписка с мастером, план оплат, бонусы и памятки живут здесь. ' +
                'Вход — через Telegram или почту; заявка без входа тоже не теряется: даём ' +
                'ссылку доступа к делу. Всё, что происходит в боте, видно в кабинете — и наоборот.',
          html: true
        },
        {
          sel: '.menu-toggle',
          step: 'Навигация',
          title: 'Заблудиться не выйдет: путеводитель',
          text: 'Кнопка «Меню» — это путеводитель: <b>живой поиск по всем страницам</b> ' +
                '(наберите «оплата», «отзывы», «нормоконтроль»…), маршрут новичка из 6 шагов ' +
                'и все разделы по полочкам. А страница «С чего начать» рассказывает весь Салон ' +
                'за 60 секунд.',
          html: true,
          links: [['start.html', 'С чего начать — за 60 секунд']]
        },
        {
          sel: '[data-contact], .tg-pill, .mobile-cta',
          step: 'Связь и доверие',
          title: 'Живые люди — и устав, который можно проверить',
          text: 'Отвечаем обычно за 15–30 минут днём: Telegram, ВКонтакте, почта — или прямо ' +
                'в переписке дела. Стесняетесь спросить — есть <b>анонимная приёмная</b>. ' +
                'А все обещания собраны в устав из VII статей со ссылками на оферту и законы.',
          html: true,
          links: [['guarantees.html', 'Устав гарантий'], ['priyomnaya.html', 'Спросить анонимно']]
        },
        {
          center: true,
          bonus: true,
          step: 'Подарок',
          title: '300 бонусов — за знакомство',
          text: '1 бонус = 1 ₽ скидки. Бонусы начисляются на ваш Telegram-аккаунт ' +
                'один раз и действуют 30 дней — хватит на первый заказ. Вместе с ними бот ' +
                'подарит «Путеводитель заказчика» (PDF) — всё то же самое, но подробно.',
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
          (st.links && st.links.length
            ? '<div class="tour-links">' + st.links.map(function (l) {
                return '<a class="tour-lnk" href="' + l[0] + '" target="_blank" rel="noopener">' + l[1] + ' ↗</a>';
              }).join('') + '</div>'
            : '') +
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
    /* 2026-07-22, главная «Пресс»: автозапуск выключен — первый визит
       встречает тишина сцены. Тур остаётся по кнопке в путеводителе/подвале. */
    return;
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

  /* ---------------- «Нужна помощь?» — закладка мастера ----------------
     Появляется не по одному таймеру, а по СМЫСЛУ момента, и говорит
     о том, что человек делает прямо сейчас:
       · читает FAQ (открыл 2+ вопроса)  → «Остался вопрос?»
       · изучает цены и медлит           → «Сомневаетесь в цене?»
       · застрял в конфигураторе         → «Запутались в шагах?»
       · собрался уходить (курсор вверх) → «Уходите? Возьмите расчёт»
       · просто долго читает             → «Нужна помощь?»
     Один показ за сессию, крестик прячет до конца сессии. */
  (function helpFab() {
    if (QUIET_PAGES[here] || here === 'dashboard.html') return;
    var shown = false, dismissed = false;
    try { dismissed = sessionStorage.getItem('salon_help_off') === '1'; } catch (e) {}
    if (dismissed) return;
    var born = Date.now();

    var PRICE_PAGES = /^(tariffs\.html|kursovaya-|diplomnaya-|magisterskaya-|kandidatskaya-|otchet-po-praktike|nauchnaya-statya|referat\.|guide-skolko-stoit-)/;
    var TEXTS = {
      faq:    { t: 'Остался вопрос?', s: 'мастер ответит лично · бесплатно',
                lead: 'Не нашли ответ в вопросах? Напишите своими словами — мастер ответит лично, это бесплатно и ни к чему не обязывает.' },
      price:  { t: 'Сомневаетесь в цене?', s: 'посчитаем вашу задачу · бесплатно',
                lead: 'Назовите тему и срок — прикинем честную вилку под вашу задачу и подскажем, на чём можно сэкономить.' },
      config: { t: 'Запутались в шагах?', s: 'поможем досчитать смету',
                lead: 'Если что-то в расчёте неясно — напишите, поможем досчитать и оформить. Черновик сметы не потеряется.' },
      exit:   { t: 'Уже уходите?', s: 'возьмите расчёт с собой',
                lead: 'Оставьте задачу в двух словах — пришлём расчёт туда, где удобно читать: ВК, Telegram или на почту.' },
      dwell:  { t: 'Нужна помощь?', s: 'подскажем по цене и срокам',
                lead: 'Расскажите о задаче — подскажем, посчитаем и сориентируем по срокам. Бесплатно, отвечает живой человек.' }
    };

    var el;
    function busy() {
      /* не влезаем поверх тура, сториз, диалогов и открытого листа связи */
      if (tour.active()) return true;
      if (document.documentElement.classList.contains('has-prelude')) return true;
      if (document.querySelector('.contact-sheet, .sdlg.open, .toc.open')) return true;
      return false;
    }
    function show(reason) {
      if (shown || dismissed || busy()) return;
      var tx = TEXTS[reason] || TEXTS.dwell;
      shown = true;
      el = document.createElement('button');
      el.type = 'button';
      el.className = 'helpfab';
      el.setAttribute('aria-label', tx.t + ' Открыть варианты связи');
      el.innerHTML =
        '<span class="hf-seal" aria-hidden="true">✎</span>' +
        '<span class="hf-t"><b>' + tx.t + '</b><small>' + tx.s + '</small></span>' +
        '<span class="hf-x" data-hf-x aria-label="Скрыть">×</span>';
      document.body.appendChild(el);
      /* Закладка рождается ПОЗЖЕ, чем отработал adopt() слоя «Пометки на
         полях» (её триггеры — секунды и минуты), поэтому она оставалась
         самостоятельным position:fixed на том же left, что и левая рельса,
         и налезала на куки-плашку. Просим рельсу усыновить её сразу. */
      if (S.railAdopt) S.railAdopt();
      void el.offsetWidth; /* показ без rAF */
      el.classList.add('in');
      if (S.visit) S.visit.mark('закладка помощи: ' + reason);
      el.addEventListener('click', function (e) {
        if (e.target.closest('[data-hf-x]')) {
          e.stopPropagation();
          dismissed = true;
          try { sessionStorage.setItem('salon_help_off', '1'); } catch (err) {}
          el.classList.remove('in');
          setTimeout(function () { el.remove(); }, 400);
          return;
        }
        if (S.contact) S.contact({ lead: tx.lead });
      });
    }

    /* 1) вдумчивое чтение FAQ: открыл два и больше вопросов */
    var faqOpened = 0;
    document.addEventListener('click', function (e) {
      var sum = e.target.closest && e.target.closest('.faq-item summary');
      if (!sum) return;
      var d = sum.closest('details');
      setTimeout(function () {
        if (d && d.open) { faqOpened++; if (faqOpened >= 2) setTimeout(function () { show('faq'); }, 6000); }
      }, 0);
    });
    /* 2) страница цен: долистал и замер — думает над цифрами */
    if (PRICE_PAGES.test(here) || here === 'index.html') {
      var deep = false, still = null;
      window.addEventListener('scroll', function () {
        var max = (document.documentElement.scrollHeight - window.innerHeight) || 1;
        if (window.scrollY / max > 0.55) deep = true;
        if (deep && Date.now() - born > 20000) {
          clearTimeout(still);
          still = setTimeout(function () { show(PRICE_PAGES.test(here) ? 'price' : 'dwell'); }, 14000);
        }
      }, { passive: true });
    }
    /* 3) конфигуратор: четверть минуты без отправки */
    if (here === 'configurator.html') {
      setTimeout(function () { show('config'); }, 25000);
    }
    /* 4) собрался уходить (десктоп): но не в первые секунды */
    document.addEventListener('mouseout', function (e) {
      if (!e.relatedTarget && e.clientY <= 0 && Date.now() - born > 12000) show('exit');
    });
    /* 5) просто долго читает */
    var dwell = setTimeout(function () { show('dwell'); }, 50000);
    window.addEventListener('pagehide', function () { clearTimeout(dwell); });
  })();

    /* ---------------- Живые уведомления о деле ----------------
       Клиент ходит по сайту, а дело сдвинулось. ВСЁ, что пришло, сначала
       ложится в реестр «Поля» (Salon.note → mark), и только четыре события,
       где мяч у клиента и есть срок, поднимаются до карточки.
       Кабинет — сам себе источник правды, там поллер не нужен. */
    (function liveOrders() {
      if (here === 'dashboard.html') return;
      if (!S.note || !S.lead) return;
      if (!S.api || !S.api.identified || !S.api.identified()) return;

      var TITLE = {
        priced: function (o) { return 'Мастер назвал цену' + (o.price ? ' — ' + o.price.toLocaleString('ru-RU') + ' ₽' : ''); },
        prepay: function () { return 'Ждём первый перевод — реквизиты в деле'; },
        check:  function () { return 'Работа готова — посмотрите и примите'; },
        msg:    function (o, n) {
          return (n > 1)
            ? (n + ' ' + S.plural(n, ['новое сообщение', 'новых сообщения', 'новых сообщений']) + ' от мастера')
            : 'Новое сообщение от мастера';
        },
        file:   function (o, n) { return (n > 1) ? ('Мастер положил в дело ' + n + ' новых файла') : 'Мастер положил новый файл в дело'; },
        work:   function () { return 'Оплата получена — взяли в работу'; },
        fix:    function () { return 'Замечания приняты — вносим правки'; },
        done:   function () { return 'Дело закрыто. Остаёмся на связи до защиты'; },
        cancel: function () { return 'Дело закрыто. Открыть заново можно в кабинете'; },
        paused: function () { return 'Дело на паузе — продолжим по вашему слову'; },
        newo:   function () { return 'Заявка принята — мастер уже смотрит'; }
      };
      /* строка последствия — ТОЛЬКО у громких. Она и есть право на прерывание. */
      var SUB = {
        priced: 'Работа начнётся, как только вы согласитесь.',
        prepay: 'Пока не придёт первая часть, мастер не приступает.',
        check:  'Пока вы не приняли, дело открыто, а правки бесплатны.',
        msg:    'Ответ ждёт в переписке.'
      };
      /* правая часть формулярной строки: отвечает на «зачем меня отвлекли» */
      var STATE = {
        priced: 'ЖДЁМ ВАШЕГО СЛОВА', prepay: 'ЖДЁМ ОПЛАТЫ ЭТАПА',
        check: 'ЖДЁМ ВАС НА ПРИЁМКЕ', msg: 'ЖДЁМ ВАШЕГО ОТВЕТА'
      };
      var TONE = { check: 'verify', prepay: 'wax', priced: 'wax', msg: 'stamp', file: 'stamp',
                   work: 'verify', fix: 'stamp', done: 'verify', cancel: 'stamp',
                   paused: 'stamp', newo: 'stamp' };
      var RANKP = { check: 90, prepay: 85, priced: 80, msg: 60, file: 40, paused: 35,
                    work: 30, fix: 25, done: 20, cancel: 15, newo: 5 };
      var LOUD = { check: 1, prepay: 1, priced: 1 };   /* + msg, но только переход 0 → 1 */
      /* эхо собственного действия клиента: в поля ложится, счётчик не поднимает */
      var READ_ON_ARRIVAL = { newo: 1, work: 1, fix: 1 };
      var SEEN_TTL = 604800000;   /* 7 суток */
      var SYS_GAP = 300000;       /* ОС-уведомление: 1 в 5 минут на дело */
      var SND_GAP = 600000;       /* звук: 1 в 10 минут */

      /* ---------- журнал доставки: ключ пишется ПОСЛЕ доставки ---------- */
      function seenMap() {
        var m = S.store.get('salon_seen', null) || {}, now = Date.now(), out = {}, k;
        for (k in m) if (m.hasOwnProperty(k) && now - m[k] < SEEN_TTL) out[k] = m[k];
        return out;
      }
      var seen = seenMap();
      function seenHas(k) { return !!seen[k]; }
      function seenAdd(k) { seen[k] = Date.now(); S.store.set('salon_seen', seen); }

      /* ---------- звук: ВЫКЛЮЧЕН по умолчанию ----------
         Играет, только если человек сам включил (тумблер в кабинете), только
         когда вкладка в фоне И системные уведомления запрещены — иначе
         звонит операционная система, а мы молчим. */
      function chime(kind) {
        if (kind !== 'check' && kind !== 'prepay') return;
        if (!S.store || S.store.get('salon_sound', 0) !== 1) return;
        if (reduceMotion) return;
        if (!document.hidden) return;
        var h = new Date().getHours();
        if (h >= 23 || h < 9) return;                       /* тихие часы */
        var last = S.store.get('salon_sound_at', 0) || 0;
        if (Date.now() - last < SND_GAP) return;
        S.store.set('salon_sound_at', Date.now());
        try {
          var ac = new (window.AudioContext || window.webkitAudioContext)();
          var t0 = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
          o.type = 'sine'; o.frequency.value = 880;
          g.gain.setValueAtTime(0, t0);
          g.gain.linearRampToValueAtTime(0.05, t0 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
          o.connect(g); g.connect(ac.destination);
          o.start(t0); o.stop(t0 + 0.75);
          /* контекст закрывается, а не висит всю сессию */
          setTimeout(function () { try { ac.close(); } catch (e) {} }, 1500);
        } catch (e) {}
      }

      /* ---------- системное уведомление: только громкое, только в фоне ---------- */
      function sysNote(o, kind, text) {
        if (!('Notification' in window) || Notification.permission !== 'granted') return false;
        var log = S.store.get('salon_sys', null) || {}, now = Date.now();
        if (log[o.id] && now - log[o.id] < SYS_GAP) return false;
        log[o.id] = now;
        S.store.set('salon_sys', log);
        try {
          /* ЕДИНЫЙ тег с кабинетом (cabinet.js): иначе ОС не схлопывает и
             человек получает два уведомления об одном событии */
          var n = new Notification('Дело ' + (o.no || '№' + o.id) + ' — Академический Салон',
            { body: text, icon: 'assets/img/favicon-120.png', tag: 'salon-' + o.id });
          n.onclick = function () {
            try { window.focus(); location.href = 'dashboard.html#o' + o.id; } catch (e) {}
            this.close();
          };
          return true;
        } catch (e) { return false; }
      }

      /* ---------- доставка одного события ---------- */
      function deliver(e, loud) {
        var o = e.o, kind = e.kind;
        var key = o.id + ':' + kind + ':' + o.status + ':' + (o.unread || 0) + ':' + (o.files_new || 0);
        if (seenHas(key)) return;
        var text = TITLE[kind](o, e.n || 0);
        var href = 'dashboard.html#o' + o.id;
        var out = S.note({
          level: loud ? 'call' : 'quiet',
          kind: kind,
          cap: 'Дело ' + (o.no || '№' + o.id),
          state: STATE[kind] || '',
          title: text,
          sub: loud ? (SUB[kind] || '') : '',
          href: href,
          goLabel: kind === 'msg' ? 'В переписку' : 'Открыть дело',
          tone: TONE[kind] || 'stamp',
          rec: { k: key, ts: Date.now(), no: (o.no || '№' + o.id), kind: kind,
                 text: text, href: href, read: !!READ_ON_ARRIVAL[kind] }
        });
        if (!out.delivered) return;      /* не доставили — ключ НЕ пишем, событие вернётся */
        seenAdd(key);
        if (loud && document.hidden) {
          if (!sysNote(o, kind, text)) chime(kind);
        }
      }

      /* ---------- первый заход на устройстве ----------
         Карточек нет, звука нет: история не высыпается. Но дела, где мяч у
         клиента, честно ложатся в поля — до трёх строк, счётчик их считает. */
      var seeded = 0;
      function seedFirst(o) {
        var st = o.paused ? 'paused' : o.status;
        if (seeded >= 3 || !LOUD[st]) return;
        var key = o.id + ':' + st + ':' + o.status + ':' + (o.unread || 0) + ':' + (o.files_new || 0);
        if (seenHas(key)) return;
        seeded++;
        var text = TITLE[st](o, 0), href = 'dashboard.html#o' + o.id;
        S.note({
          level: 'quiet', kind: st, cap: 'Дело ' + (o.no || '№' + o.id),
          title: text, href: href, tone: TONE[st] || 'stamp',
          rec: { k: key, ts: Date.now(), no: (o.no || '№' + o.id), kind: st,
                 text: text, href: href, read: false }
        });
        seenAdd(key);
      }

      function isLoud(e) {
        if (LOUD[e.kind]) return true;
        return e.kind === 'msg' && e.first0 === true;   /* только первое непрочитанное */
      }

      function poll() {
        var noti = ('Notification' in window) && Notification.permission === 'granted';
        if (document.hidden && !noti) return;
        if (!S.lead()) return;                           /* опрашивает только вкладка-лидер */
        var t = S.api.token(), g = S.api.guestTokens();
        if (!t && !g.length) return;
        S.api.get('/orders' + (t ? '' : '?tokens=' + encodeURIComponent(g.join(',')))).then(function (r) {
          if (!r || !r.ok || !r.orders) return;
          var prev = S.store.get('salon_watch', null);
          var first = prev === null;
          prev = prev || {};
          var next = {}, events = [], i, e, used = false, loud;

          r.orders.forEach(function (o) {
            var p = prev[o.id], k;
            next[o.id] = { s: o.status, u: o.unread || 0, f: o.files_new || 0, p: o.paused ? 1 : 0 };
            if (!p) {
              if (first) { seedFirst(o); return; }
              events.push({ o: o, kind: 'newo', n: 0 });
              return;
            }
            if (o.paused && !p.p) { events.push({ o: o, kind: 'paused', n: 0 }); return; }
            if (p.s !== o.status) {
              k = (o.status === 'new') ? 'newo' : o.status;
              /* статуса нет в словаре — событие не создаётся и слот не тратит */
              if (TITLE[k]) events.push({ o: o, kind: k, n: 0 });
              return;
            }
            if ((o.files_new || 0) > (p.f || 0)) {
              events.push({ o: o, kind: 'file', n: (o.files_new || 0) - (p.f || 0) });
              return;
            }
            if ((o.unread || 0) > (p.u || 0)) {
              events.push({ o: o, kind: 'msg', n: (o.unread || 0), first0: (p.u || 0) === 0 });
            }
          });

          S.store.set('salon_watch', next);
          if (first || !events.length) return;

          /* детерминированный приоритет вместо events.slice(0, 2):
             ровно одно событие может стать громким, ВСЕ остальные ложатся
             в поля — ни одно не теряется */
          events.sort(function (a, b) { return (RANKP[b.kind] || 0) - (RANKP[a.kind] || 0); });
          for (i = 0; i < events.length; i++) {
            e = events[i];
            loud = false;
            if (!used && isLoud(e)) { loud = true; used = true; }
            deliver(e, loud);
          }
        });
      }

      setTimeout(poll, 2600);
      setInterval(poll, 90000);
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) setTimeout(poll, 800);
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
    var resumeStep = Math.max(1, Math.min(4, (d.idx || 0) + 1));
    var resumeHref = 'configurator.html?step=' + resumeStep;
    var typeLabel = t.label.split(' (')[0];
    var bar = document.createElement('div');
    bar.className = 'resume-bar';
    bar.setAttribute('role', 'note');
    bar.innerHTML =
      /* z 235, а не 240: ничья с .contact-sheet (240) решалась порядком в DOM */
      '<style>.resume-bar{position:fixed;left:50%;right:auto;bottom:14px;z-index:235;' +
      'width:min(720px,calc(100vw - 28px));transform:translateX(-50%);padding:4px;' +
      'display:grid;grid-template-columns:minmax(0,1fr) 44px;align-items:center;' +
      'background:color-mix(in srgb,var(--sheet) 97%,transparent);border:1px solid var(--hairline-strong);' +
      'border-left:3px solid var(--wax);border-radius:4px;box-shadow:0 12px 36px rgba(35,31,24,.16);' +
      'color:var(--ink);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}' +
      '.resume-bar .rb-main{min-width:0;min-height:54px;padding:6px 7px;display:grid;' +
      'grid-template-columns:32px minmax(0,1fr) 22px;align-items:center;gap:9px;color:inherit;text-decoration:none}' +
      '.resume-bar .rb-mark{width:32px;height:32px;display:grid;place-items:center;border:1px solid var(--wax);' +
      'border-radius:50%;font:18px/1 var(--serif);color:var(--wax);background:var(--wax-soft)}' +
      '.resume-bar .rb-copy{min-width:0;display:grid;gap:2px}' +
      '.resume-bar .rb-copy small{font:10px/1.2 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--ink-faint)}' +
      '.resume-bar .rb-line{min-width:0;display:flex;align-items:baseline;gap:8px}' +
      '.resume-bar .rb-type{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13.5px;font-weight:600}' +
      '.resume-bar .rb-price{flex:none;white-space:nowrap;font:11.5px/1.2 var(--mono);color:var(--wax)}' +
      '.resume-bar .rb-go{font:22px/1 var(--serif);color:var(--wax)}' +
      '.resume-bar .rb-x{border:0;border-left:1px solid var(--hairline);background:none;cursor:pointer;color:var(--ink-faint);' +
      'font-size:18px;line-height:1;width:44px;height:44px;min-width:44px;padding:0;' +
      'display:inline-flex;align-items:center;justify-content:center}' +
      '.resume-bar .rb-main:hover{background:var(--wax-soft)}.resume-bar .rb-x:hover{color:var(--ink);background:var(--mark)}' +
      '@media(max-width:880px){.resume-bar{left:10px;right:10px;width:auto;transform:none;border-radius:3px;' +
      'box-shadow:0 8px 24px rgba(35,31,24,.14);backdrop-filter:none;-webkit-backdrop-filter:none}' +
      '.resume-bar .rb-main{min-height:52px;padding:4px 5px;grid-template-columns:29px minmax(0,1fr) 18px;gap:8px}' +
      '.resume-bar .rb-mark{width:29px;height:29px;font-size:16px}.resume-bar .rb-type{font-size:13px}' +
      '.resume-bar .rb-price{font-size:10.5px}.resume-bar .rb-copy small{font-size:9.5px}.resume-bar .rb-go{font-size:19px}}' +
      '</style>' +
      '<a class="rb-main" href="' + resumeHref + '" aria-label="Продолжить смету: ' + typeLabel + ', от ' + q.lowFmt + ' рублей">' +
        '<span class="rb-mark" aria-hidden="true">¶</span>' +
        '<span class="rb-copy"><small>' + (hasText ? 'Черновик сохранён' : 'Черновик сметы') + '</small>' +
          '<span class="rb-line"><span class="rb-type">' + typeLabel + '</span><span class="rb-price">от ' + q.lowFmt + ' ₽</span></span></span>' +
        '<span class="rb-go" aria-hidden="true">→</span>' +
      '</a>' +
      '<button type="button" class="rb-x" aria-label="Закрыть черновик сметы">×</button>';
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
      if (!bar.isConnected) {
        document.documentElement.style.removeProperty('--resume-clear');
        if (S.floor) S.floor();
        return;
      }
      var nav = document.querySelector('.mobile-cta'), navH = 0;
      if (nav && getComputedStyle(nav).display !== 'none') navH = nav.getBoundingClientRect().height;
      bar.style.bottom = navH ? Math.round(navH + 8) + 'px' : '14px';
      var top = bar.getBoundingClientRect().top;
      document.documentElement.style.setProperty('--resume-clear', Math.max(0, Math.round(window.innerHeight - top)) + 'px');
      /* --floor считает ЗАНЯТУЮ КРОМКУ, а не сумму высот: полоса стоит
         ПОВЕРХ .mobile-cta, поэтому её top уже включает высоту панели */
      if (S.floor) S.floor();
    }
    clearance();
    setTimeout(clearance, 400); /* шрифты и перенос строк могли изменить высоту */
    window.addEventListener('resize', clearance, { passive: true });
    if (S.visit) S.visit.mark('показана закладка возврата сметы');
  })();

  /* ---------------- «Ляссе»: мини-смета на посадочных ----------------
     Гайды и страницы услуг/дисциплин получают компактный расчёт с
     предвыбранным типом: два вопроса (направление, срок) — цена — и в
     конфигуратор с готовым черновиком. Тип определяется именем страницы,
     сами 41 HTML не правятся. */
  (function lasseQuote() {
    if (QUIET_PAGES[here]) return;
    var C = window.SalonCalc;
    if (!C || !document.querySelector('main')) return;
    function pageType() {
      var h = here;
      if (/^kursovaya-po-/.test(h)) return 'course';
      if (h === 'kursovaya-rabota.html') return 'course';
      if (/^diplomnaya-/.test(h)) return 'diplom';
      if (h === 'magisterskaya-dissertaciya.html') return 'master';
      if (h === 'kandidatskaya-dissertaciya.html') return 'kandidat';
      if (h === 'otchet-po-praktike.html') return 'practice';
      if (h === 'nauchnaya-statya.html') return 'vak';
      if (h === 'referat.html') return 'self';
      if (/^guide-/.test(h)) {
        if (/kursovay|kursovoy/.test(h)) return 'course';
        if (/rinc/.test(h)) return 'rinc';
        if (/statya/.test(h)) return 'vak';
        if (/praktik/.test(h)) return 'practice';
        return 'diplom';                     /* ВКР-гайды и остальные */
      }
      return null;
    }
    var type = pageType();
    if (!type) return;
    var t = null;
    for (var i = 0; i < C.types.length; i++) if (C.types[i].id === type) t = C.types[i];
    if (!t) return;
    var state = { disc: 'hum', term: 'free' };
    var box = document.createElement('section');
    box.className = 'lq';
    box.setAttribute('aria-label', 'Быстрая смета');
    box.innerHTML =
      '<span class="lq-ribbon" aria-hidden="true"></span>' +
      '<p class="lq-cap">Ляссе · смета за минуту</p>' +
      '<p class="lq-title">' + t.label + ' — узнайте цену, не уходя со страницы</p>' +
      '<div class="lq-row" data-lq="disc">' +
        C.disciplines.map(function (d, di) {
          return '<button type="button" data-v="' + d.id + '" aria-pressed="' +
            (di === 0) + '">' + d.label.split(' /')[0].split(',')[0] + '</button>';
        }).join('') + '</div>' +
      '<div class="lq-row" data-lq="term">' +
        C.terms.map(function (s, si) {
          return '<button type="button" data-v="' + s.id + '" aria-pressed="' +
            (si === 0) + '">' + s.label.replace('Свободный (от 30 дней)', 'От 30 дней') + '</button>';
        }).join('') + '</div>' +
      '<div class="lq-foot">' +
        '<span class="lq-price" id="lqPrice" aria-live="polite"></span>' +
        '<a class="btn btn-wax" id="lqGo" href="configurator.html?step=4">Оформить заявку <span class="ar">→</span></a>' +
      '</div>' +
      '<p class="lq-note">Это нижняя граница базового уровня; точную цену назовёт мастер после разбора темы — бесплатно.</p>';
    /* ляссе встаёт НА МЕСТО старого статического CTA «Рассчитать стоимость»
       (aside на услугах и гайдах) — иначе на странице две сметы подряд */
    var legacy = null;
    document.querySelectorAll('aside.sheet.stacked').forEach(function (a) {
      if (!legacy && a.querySelector('a[href^="configurator"]')) legacy = a;
    });
    if (legacy && legacy.parentNode) {
      legacy.parentNode.insertBefore(box, legacy);
      legacy.remove();
    } else {
      document.querySelector('main').appendChild(box);
    }
    function render() {
      var q = C.quote(type, state.disc, state.term, 'base');
      var el = document.getElementById('lqPrice');
      if (el) el.innerHTML = 'от <b>' + q.lowFmt + ' ₽</b>';
    }
    box.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button[data-v]');
      if (!b) return;
      var row = b.closest('[data-lq]');
      row.querySelectorAll('button').forEach(function (x) {
        x.setAttribute('aria-pressed', String(x === b));
      });
      state[row.getAttribute('data-lq')] = b.getAttribute('data-v');
      render();
    });
    box.querySelector('#lqGo').addEventListener('click', function () {
      if (!S.store) return;
      var prev = S.store.get('salon_draft', null) || {};
      S.store.set('salon_draft', {
        state: { type: type, disc: state.disc, term: state.term,
                 tier: (prev.state && prev.state.tier) || 'base' },
        idx: typeof prev.idx === 'number' ? prev.idx : 0,
        plan: prev.plan || false,
        fields: prev.fields || undefined,
        savedAt: prev.savedAt || 0
      });
    });
    render();
    if (S.visit) S.visit.mark('видел мини-смету «Ляссе»');
  })();
})();
