/* ============================================================
   АКАДЕМИЧЕСКИЙ САЛОН — общий слой «Оттиск»
   - калькулятор (window.SalonCalc) — единственный источник цен
   - UX-утилиты (Salon: store/toast/copy/mask/valid/countTo/seal)
   - колонтитул: шапка + индикатор раздела + «Оглавление»
   - подвал-колофон, мобильный CTA, reveal, prefetch
   ============================================================ */
(function () {
  'use strict';
  var docEl = document.documentElement;
  docEl.classList.add('has-js');
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Показываем служебную ссылку «К содержанию» только человеку, который
     действительно идёт по странице клавишей Tab. Восстановление фокуса
     браузером после перехода и обычный клик больше не раскрывают её поверх
     логотипа. Этот же признак делает фокус бренда строго клавиатурным. */
  window.addEventListener('keydown', function (event) {
    if (event.key === 'Tab') docEl.setAttribute('data-input-modality', 'keyboard');
  }, true);
  window.addEventListener('pointerdown', function () {
    docEl.removeAttribute('data-input-modality');
    var skip = document.querySelector('.skip-link');
    if (skip && document.activeElement === skip) skip.blur();
  }, true);

  /* Финальный мобильный слой грузится после всех страничных <style>.
     Так одна геометрия телефона побеждает поздние локальные правила
     главной, каталога, кабинета и конфигуратора. */
  (function mobileEdition() {
    if (document.querySelector('link[data-mobile-edition]')) return;
    var link = document.createElement('link');
    var source = document.currentScript && document.currentScript.src;
    link.rel = 'stylesheet';
    link.media = 'screen and (max-width:920px)';
    link.setAttribute('data-mobile-edition', '1');
    try {
      link.href = source ? new URL('../css/mobile.css?v=20260803out003shell1', source).href
        : 'assets/css/mobile.css?v=20260803out003shell1';
    } catch (e) {
      link.href = 'assets/css/mobile.css?v=20260803out003shell1';
    }
    document.head.appendChild(link);
  })();

  /* ---------------- Калькулятор (единая логика) ----------------
     Цена задаётся за конкретный результат: диагностику, редакторский
     этап или исследовательский проект с нуля. Уровни
     хранят явные суммы — диагностика больше не считается искусственным
     коэффициентом от полной программы сопровождения. */
  var SalonCalc = {
    types: [
      { id: 'diplom',     label: 'ВКР / диплом',                     base: 40000,  prices: { diagnostic: 3000, editing: 24000, support: 40000 } },
      { id: 'master',     label: 'Магистерское исследование',        base: 60000,  prices: { diagnostic: 5000, editing: 36000, support: 60000 } },
      { id: 'chapter',    label: 'Глава вашего исследования',        base: 30000,  prices: { diagnostic: 3000, editing: 9000,  support: 30000 } },
      { id: 'kandidat',   label: 'Диссертационное исследование',     base: 200000, prices: { diagnostic: 7500, editing: 60000, support: 200000 } },
      { id: 'course',     label: 'Курсовая работа',                  base: 14000,  prices: { diagnostic: 2500, editing: 9000,  support: 14000 } },
      { id: 'course_emp', label: 'Курсовая с исследованием',         base: 20000,  prices: { diagnostic: 3000, editing: 14000, support: 20000 } },
      { id: 'practice',   label: 'Отчёт по практике',                base: 14000,  prices: { diagnostic: 2500, editing: 8000,  support: 14000 } },
      { id: 'vak',        label: 'Научная статья ВАК',               base: 18000,  prices: { diagnostic: 3000, editing: 12000, support: 18000 } },
      { id: 'scopus',     label: 'Статья Scopus / Web of Science',   base: 35000,  prices: { diagnostic: 5000, editing: 22000, support: 35000 } },
      { id: 'rinc',       label: 'Научная статья РИНЦ',              base: 9000,   prices: { diagnostic: 2500, editing: 7000,  support: 9000 } },
      { id: 'self',       label: 'Реферат или эссе',                 base: 2500,   prices: { diagnostic: 2500, editing: 2500,  support: 2500 } }
    ],
    disciplines: [
      { id: 'hum',  label: 'Гуманитарные / экономика',                 k: 1.0 },
      { id: 'law',  label: 'Право / педагогика / психология',          k: 1.15 },
      { id: 'jurisprudence', label: 'Юриспруденция',                    k: 1.0 },
      { id: 'pedagogy',      label: 'Педагогика',                       k: 1.0 },
      { id: 'psychology',    label: 'Психология',                       k: 1.21 },
      { id: 'tech', label: 'Технические / IT / программирование',      k: 1.3 },
      { id: 'med',  label: 'Медицина / финансы с расчётами',           k: 1.4 }
    ],
    terms: [
      { id: 'free',   label: 'Свободный (от 30 дней)', k: 1.0 },
      { id: 'mid',    label: '14–30 дней',             k: 1.15 },
      { id: 'urgent', label: 'Срочно (до 14 дней)',    k: 1.45 }
    ],
    tiers: [
      { id: 'base', label: 'Письменный разбор',     priceKey: 'diagnostic', note: 'Изучение материала и понятный порядок действий' },
      { id: 'turn', label: 'Редакторский аудит',   priceKey: 'editing',    note: 'Правки в вашем тексте и комментарии' },
      { id: 'vip',  label: 'Сопровождение по этапам', priceKey: 'support',  note: 'От темы до защиты — с решениями и содержательным участием автора' }
    ],
    transportDiscipline: function (value) {
      return { jurisprudence:'law', pedagogy:'law', psychology:'law' }[value] || value;
    },
    round500: function (n) { return Math.round(n / 500) * 500; },
    fmt: function (n) { return n.toLocaleString('ru-RU'); },
    quote: function (baseId, discId, termId, tierId) {
      var t = this.types.find(function (x) { return x.id === baseId; }) || this.types[0];
      var d = this.disciplines.find(function (x) { return x.id === discId; }) || this.disciplines[0];
      var s = this.terms.find(function (x) { return x.id === termId; }) || this.terms[0];
      var v = this.tiers.find(function (x) { return x.id === tierId; }) || this.tiers[1];
      var selectedBase = t.prices && t.prices[v.priceKey] ? t.prices[v.priceKey] : t.base;
      var low = this.round500(selectedBase * d.k * s.k);
      var high = this.round500(low * 1.4);
      return {
        base: selectedBase,
        low: low,
        high: high,
        lowFmt: this.fmt(low),
        highFmt: this.fmt(high),
        range: this.fmt(low) + ' – ' + this.fmt(high) + ' ₽'
      };
    }
  };
  window.SalonCalc = SalonCalc;

  /* Набор месяца — честный дефицит: квоту объявляет владелец (правило
     качества, задаётся в админке), занятые места сервер считает САМ по
     реальным заявкам месяца. Рисованных цифр нет: фальшивый дефицит
     убивает доверие быстрее любой цены. Сервер молчит — строка скрыта. */
  window.SalonSlots = { enabled: false, label: '', short: '', free: 0, quota: 0 };
  setTimeout(function slots() {
    /* Salon.api объявляется ниже по файлу — ждём конца синхронного прохода */
    var here_ = (location.pathname.split('/').pop() || 'index.html');
    if (here_ !== 'index.html' && here_ !== 'tariffs.html') return;
    if (!Salon.api) return;
    if (!document.getElementById('slotSeal') &&
        !document.getElementById('qSlots') &&
        !document.getElementById('coverSlots') &&
        !document.getElementById('nextSlots')) return;
    Salon.api.get('/slots').then(function (r) {
      if (!r || !r.ok || !r.on || !r.quota) return;
      var free = Math.max(0, r.quota - r.taken);
      var line = free > 0
        ? 'Набор на ' + r.month + ': свободно ' + free + ' из ' + r.quota + ' мест — место закрепляется после согласования плана'
        : 'Набор на ' + r.month + ' закрыт — идёт запись на ' + r.next;
      /* короткая форма — для обложки и финального CTA: тон мастерской,
         которая берёт столько, сколько ведёт лично, а не конвейера */
      var short_ = free > 0
        ? 'Набор на ' + r.month + ': свободно ' + free + ' из ' + r.quota + ' мест'
        : 'Набор на ' + r.month + ' закрыт · запись на ' + r.next;
      window.SalonSlots = { enabled: true, label: line, short: short_, free: free, quota: r.quota };
      /* печать квоты в прейскуранте: месяц + строка мест */
      var seal = document.getElementById('slotSeal');
      if (seal) {
        seal.querySelector('b').textContent = r.month;
        seal.querySelector('i').textContent = free > 0
          ? 'свободно ' + free + ' из ' + r.quota : 'мест нет · пишем на ' + r.next;
        seal.hidden = false;
      }
      var q = document.getElementById('qSlots');
      if (q) { q.textContent = line; q.hidden = false; }
      /* запись из журнала набора — на обложке и в финале главной:
         «НАБОР · ИЮЛЬ …отточие… свободно 2 из 15 мест», цифры сургучом */
      ['coverSlots', 'nextSlots'].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = '<span class="sl-k"></span>' +
          '<span class="sl-dots" aria-hidden="true"></span><span class="sl-v"></span>';
        el.querySelector('.sl-k').textContent = 'Набор · ' + r.month;
        el.querySelector('.sl-v').innerHTML = free > 0
          ? 'свободно <b>' + free + ' из ' + r.quota + '</b> мест'
          : 'мест нет — запись на <b>' + r.next + '</b>';
        el.hidden = false;
      });
    }).catch(function () {});
  }, 0);

  /* ---------------- Контакты (единственный источник ссылок) ----------------
     Главная площадка — сам сайт: конфигуратор и кабинет. Мессенджеры —
     по желанию клиента; порядок каналов: ВК → MAX → Telegram. */
  var LINKS = window.SalonLinks = {
    bot:   'https://t.me/academic_saloon_bot',   // бот: заявки, расчёт, статусы
    human: 'https://t.me/academicsaloon',        // личка: отвечает человек
    tgc:   'https://t.me/akademsalon',           // канал в Telegram: гайды и мастерская
    vk:    'https://vk.com/academicsaloon',      // сообщество ВКонтакте
    vkm:   'https://vk.me/academicsaloon',       // диалог с сообществом ВК
    max:   'https://max.ru/join/dP7MynBoq0tumYpQIc5e5UYtt_F9ZGElLsRetoIHZPs' // канал в MAX
  };
  /* монограмма мессенджера MAX — рисуем сами в тоне сайта (без чужих ассетов) */
  function maxLogoSVG(size) {
    size = size || 18;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<rect x="1.5" y="1.5" width="21" height="21" rx="6.5" stroke="currentColor" stroke-width="1.6"/>' +
      '<path d="M6.7 16.4V8.2l5.3 5.6 5.3-5.6v8.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
  }
  window.SalonMaxLogo = maxLogoSVG;

  /* ---------------- значки пульта шапки ----------------
     Собственные векторные знаки не зависят от системного набора emoji:
     на любой платформе оптика, толщина штриха и цвет остаются фирменными. */
  function icoSearch() {
    return '<span class="ha-ico ha-ico--search" aria-hidden="true"><i></i></span>';
  }
  function icoTheme() {
    return '<span class="ha-ico ha-ico--theme" data-theme-glyph data-theme-icon="dark" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="none" focusable="false">' +
        '<g class="ha-theme-night">' +
          '<circle cx="12" cy="12" r="7.25" stroke="currentColor" stroke-width="1.5"/>' +
          '<path d="M12 4.75a7.25 7.25 0 0 0 0 14.5z" fill="currentColor"/>' +
        '</g>' +
        '<g class="ha-theme-sun">' +
          '<circle cx="12" cy="12" r="3.45" fill="currentColor"/>' +
          '<path d="M12 2.75v2.1M12 19.15v2.1M2.75 12h2.1M19.15 12h2.1M5.46 5.46l1.49 1.49M17.05 17.05l1.49 1.49M18.54 5.46l-1.49 1.49M6.95 17.05l-1.49 1.49" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>' +
        '</g>' +
      '</svg></span>';
  }
  window.SalonIco = { search: icoSearch, theme: icoTheme };
  /* короткие коды типов для deep-link в бота (?start=web_dp_h_u_t) */
  var TYPE_CODE = {
    diplom:'dp', master:'ms', chapter:'ch', kandidat:'kd', course:'cr',
    course_emp:'ce', practice:'pr', vak:'vk', scopus:'sc', rinc:'rc', self:'sf'
  };
  var DISC_CODE = {
    hum:'h', law:'l', jurisprudence:'l', pedagogy:'l', psychology:'l', tech:'t', med:'m'
  };
  var TERM_CODE = { free:'f', mid:'m', urgent:'u' };
  var TIER_CODE = { base:'b', turn:'t', vip:'v' };
  /* Собирает ссылку на бота с предзаполненной сметой (без личных данных). */
  window.SalonBotLink = function (st) {
    st = st || {};
    var parts = ['web', TYPE_CODE[st.type] || '', DISC_CODE[st.disc] || 'h',
                 TERM_CODE[st.term] || 'f', TIER_CODE[st.tier] || 'b'];
    var p = parts.join('_').replace(/[^A-Za-z0-9_]/g, '').slice(0, 60);
    return LINKS.bot + '?start=' + p;
  };

  /* ---------------- Отдельные услуги (плоские цены «от», вне формулы) ----------------
     У каждой услуги СВОЯ анкета (ask): конфигуратор в сервисном режиме
     рендерит эти вопросы вместо общей сметы — мастер сразу получает
     нужные детали. Поля вопроса: id, label, short (метка в сводке для
     мастера), type: chips|text|textarea, opts, ph (placeholder), req. */
  window.SalonServices = [
    { id:'plan', label:'Разбор задачи и плана', from:3000, unit:'', code:'pl', fixed:true,
      desc:'Разберём требования, предложим логику глав и план самостоятельной работы. Если продолжите сопровождение, стоимость разбора зачтём полностью.',
      priceFor:function(a){ return (a.work === 'master' || a.work === 'candidate') ? 5000 : 3000; },
      ask:[
        { id:'work', label:'Для какой работы нужен план?', short:'Работа', type:'chips', req:true,
          opts:[
            { value:'course', label:'Курсовая' },
            { value:'diplom', label:'Диплом / ВКР' },
            { value:'master', label:'Магистерская' },
            { value:'candidate', label:'Кандидатская' },
            { value:'practice', label:'Отчёт по практике' },
            { value:'other', label:'Другое' }
          ] },
        { id:'disc', label:'Направление', short:'Направление', type:'chips',
          opts:['Гуманитарные / экономика','Юриспруденция / педагогика','Технические / IT','Медицина / финансы'] },
        { id:'req', label:'Требования кафедры', short:'Требования', type:'textarea',
          ph:'Объём, число глав, пожелания научного руководителя — всё, что уже известно.' }
      ] },
    { id:'ai',    label:'Проверка и редактура текста после ИИ', from:2500, unit:'',       code:'ai',
      desc:'Проверим логику, фактические утверждения и связь с доступными источниками, затем внесём видимые редакторские правки. Для оценки нужны исходный текст, исходный запрос к ИИ и сведения об источниках; без обещаний обойти детекторы.',
      ask:[
        { id:'vol', label:'Объём текста', short:'Объём', type:'chips', req:true,
          opts:['До 20 страниц','20–60 страниц','Больше 60'] },
        { id:'prompt', label:'Какой исходный запрос был дан ИИ?', short:'Исходный prompt', type:'textarea', req:true,
          ph:'Вставьте исходный запрос без персональных данных. Он нужен, чтобы увидеть, где ответ мог уйти от задачи.' },
        { id:'sources', label:'Какие источники использованы или заявлены в тексте?', short:'Источники', type:'textarea', req:true,
          ph:'Ссылки, список литературы или честно: «источники не указаны / неизвестны».' }
      ] },
    { id:'review',label:'Полный разбор черновика',  from:2500, unit:'',       code:'rv',
      desc:'Проверим структуру и доказательность вашего черновика, объясним каждое замечание и расставим исправления по приоритету.',
      ask:[
        { id:'work', label:'Что за работа?', short:'Работа', type:'chips',
          opts:['Курсовая','Диплом / ВКР','Магистерская','Другое'] },
        { id:'when', label:'Когда защита или сдача?', short:'Защита', type:'text', ph:'Например, «20 июля»' }
      ] },
    { id:'tutor', label:'Репетиторство и консультации',      from:3000, unit:' / час', code:'tu',
      desc:'Индивидуальные занятия и разбор темы: методология, оформление, подготовка к сдаче — по вашему запросу.',
      ask:[
        { id:'fmt', label:'Формат', short:'Формат', type:'chips',
          opts:['Разовая консультация','Серия занятий','Пока не решил(а)'] },
        { id:'what', label:'Что разбираем?', short:'Запрос', type:'textarea',
          ph:'Предмет, тема, что вызывает сложность' }
      ] },
    { id:'norm',  label:'Оформление по методичке · нормоконтроль', from:5000, unit:'', code:'nm',
      desc:'Приведём ваш материал к требованиям методички и ГОСТ, составим лист технических несоответствий.',
      ask:[
        { id:'guide', label:'Методичка на руках?', short:'Методичка', type:'chips',
          opts:['Да, приложу файлом','Нет — оформляем по ГОСТ'] },
        { id:'vol', label:'Объём работы', short:'Объём', type:'text', ph:'Примерно, в страницах' }
      ] },
    { id:'defense', label:'Подготовка к выступлению и защите', from:6000, unit:'', code:'df',
      desc:'На основе вашего готового текста поможем собрать слайды и тезисы выступления, проведём репетицию вопросов.',
      ask:[
        { id:'when', label:'Когда защита?', short:'Защита', type:'text', req:true, ph:'Дата или «через 2 недели»' },
        { id:'len', label:'Регламент доклада', short:'Регламент', type:'chips',
          opts:['5 минут','7 минут','10 минут','Не знаю'] }
      ] },
    { id:'commission0', label:'Комиссия №0', from:9900, unit:'', code:'k0', fixed:true,
      desc:'Репетиция защиты с независимым редактором: Оппонент проводит живую сессию, а мастерская выдаёт Протокол №0 и повторно проверяет согласованные критические исправления.',
      priceFor:function(a){
        return a.work === 'master' ? 29900 : a.work === 'diplom' ? 19900 : 9900;
      },
      ask:[
        { id:'work', label:'Что проходит Комиссию №0?', short:'Работа', type:'chips', req:true,
          opts:[
            { value:'course', label:'Курсовая · 9 900 ₽' },
            { value:'diplom', label:'ВКР / диплом · 19 900 ₽' },
            { value:'master', label:'Магистерская · 29 900 ₽' }
          ] },
        { id:'source', label:'Что уже есть?', short:'Точка старта', type:'chips', req:true,
          opts:[
            { value:'draft', label:'Мой черновик' },
            { value:'ai', label:'Черновик после ИИ' },
            { value:'comments', label:'Версия с замечаниями' }
          ] },
        { id:'when', label:'Когда официальная сдача или защита?', short:'Дата защиты', type:'text', req:true,
          ph:'Например: «20 июня» или «через три недели»' },
        { id:'focus', label:'Что вызывает наибольшее сомнение?', short:'Фокус проверки', type:'textarea',
          ph:'Источники, данные, метод, выводы, ответы на вопросы — можно написать своими словами.' }
      ] },
    { id:'defensepack', label:'Пакет «К защите»: оформление + выступление', from:9500, unit:'', code:'dp',
      desc:'Нормоконтроль вашего текста, помощь со слайдами и тезисами, затем репетиция защиты. По отдельности — 11 000 ₽.',
      ask:[
        { id:'when', label:'Когда защита?', short:'Защита', type:'text', req:true, ph:'Дата или «через 2 недели»' }
      ] }
    ,
    { id:'author', label:'Авторский текст вне аттестации', from:12000, unit:'', code:'au',
      desc:'Создание статьи, аналитического отчёта, речи, сценария или делового материала по техническому заданию с отдельно согласованной целью и режимом прав.',
      ask:[
        { id:'kind', label:'Какой материал нужен?', short:'Формат', type:'chips', req:true,
          opts:['Статья для медиа / блога','Аналитический отчёт','Речь / выступление','Сценарий / интервью','Деловой материал','Другое'] },
        { id:'purpose', label:'Где и как материал будет использоваться?', short:'Цель', type:'textarea', req:true,
          ph:'Например: статья в корпоративный блог, доклад на отраслевой конференции. Не для учебной или научной аттестации.' },
        { id:'author_model', label:'Кто должен создать материал?', short:'Автор', type:'chips', req:true,
          opts:['Лично Исполнитель (Б1)','Иной согласованный автор (Б2)','Нужна рекомендация'] },
        { id:'author_name', label:'Фактический автор, если уже известен', short:'Фактический автор', type:'text',
          ph:'ФИО или «будет указан в спецификации до оплаты»' },
        { id:'rights', label:'Какой режим прав нужен?', short:'Права', type:'chips', req:true,
          opts:['Нужна рекомендация','Лицензия на использование','Отчуждение исключительного права'] },
        { id:'volume', label:'Объём и формат', short:'Объём', type:'text',
          ph:'Например: 12 000 знаков, Google Docs; презентация на 15 слайдов' }
      ] }
  ];

  /* ---------------- Профили компетенций по направлениям ---------------- */
  window.SalonExperts = {
    hum:  { name: 'Профиль: гуманитарные науки и экономика', desc: 'Социология, история, филология, менеджмент, маркетинг, экономическая теория.' },
    law:  { name: 'Профиль: право, педагогика, психология', desc: 'Гражданское и уголовное право, методика, возрастная и клиническая психология.' },
    tech: { name: 'Профиль: технические науки и IT',          desc: 'Программирование, инженерия, расчётные и проектные работы, анализ данных.' },
    med:  { name: 'Профиль: медицина и финансы',              desc: 'Клинические темы, доказательная база, финансовый анализ, эконометрика.' }
  };

  /* ---------------- UX-слой (Salon) ---------------- */
  var Salon = window.Salon = window.Salon || {};
  Salon.reduceMotion = reduceMotion;
  Salon.store = {
    get: function (k, fb) { try { var v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch (e) { return fb; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  /* Секреты доступа не должны переживать закрытие вкладки. Настройки,
     корзина и несекретные черновики остаются в Salon.store (localStorage),
     а bearer/capability-токены и незавершённый вход — только здесь. */
  Salon.secretStore = {
    get: function (k, fb) { try { var v = sessionStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch (e) { return fb; } },
    set: function (k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { sessionStorage.removeItem(k); } catch (e) {} }
  };
  function secretValue(key, fallback) {
    var value = Salon.secretStore.get(key, null);
    if (value == null) {
      /* Однократная миграция прежней версии: переносим секрет из
         localStorage в текущую вкладку и сразу удаляем постоянную копию. */
      value = Salon.store.get(key, null);
      if (value != null) Salon.secretStore.set(key, value);
    }
    Salon.store.del(key);
    return value == null ? fallback : value;
  }
  /* Посадочные уже знают тип, направление и формат помощи. Передаём этот
     контекст единому конфигуратору по фактическим data-* атрибутам ссылки,
     чтобы человек не повторял выбор, а видимый фасад и legacy-калькулятор
     начинали с одного и того же черновика. Обработчик document выполняется
     после старых inline-handler'ов ссылок и исправляет их прежние hardcode. */
  document.addEventListener('click', function (event) {
    var link = event.target && event.target.closest
      ? event.target.closest('a[href*="configurator"][data-type]')
      : null;
    if (!link) return;
    var type = link.getAttribute('data-type') || '';
    var allowedTypes = ['diplom','master','chapter','kandidat','course','course_emp','practice','vak','scopus','rinc','self'];
    if (allowedTypes.indexOf(type) < 0) return;
    var disc = link.getAttribute('data-disc') || 'hum';
    if (['hum','law','jurisprudence','pedagogy','psychology','tech','med'].indexOf(disc) < 0) disc = 'hum';
    var term = link.getAttribute('data-term') || 'free';
    if (['free','mid','urgent'].indexOf(term) < 0) term = 'free';
    var tier = link.getAttribute('data-tier') || 'base';
    if (['base','turn','vip'].indexOf(tier) < 0) tier = 'base';
    var situation = '';
    try {
      situation = new URL(link.href, location.href).searchParams.get('situation') || '';
    } catch (e) {}
    if (['topic','draft','comments','defense'].indexOf(situation) < 0) situation = '';
    var result = { base:'diagnostic', turn:'editing', vip:'support' }[tier];
    var draftId = '';
    try { draftId = crypto.randomUUID(); }
    catch (e) { draftId = 'draft_' + Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
    var draft = Salon.store.get('salon_draft', {}) || {};
    draft.state = { type:type, disc:disc, term:term, tier:tier };
    draft.idx = 0;
    draft.plan = false;
    draft.savedAt = Date.now();
    draft.concept = {
      version:2,
      step:situation ? 2 : 1,
      draftId:draftId,
      workType:type,
      situation:situation,
      result:result,
      deadlineDate:'',
      deadlineFlexible:false,
      entryPrefilled:true
    };
    Salon.store.set('salon_draft', draft);
  });
  /* Один fail-closed путь для внутренних и внешних analytics page labels.
     Список намеренно exact: синтаксически красивый, но неизвестный Nginx 404
     pathname всё равно может содержать имя или токен и обязан стать /other. */
  var ANALYTICS_PAGE_LIST = '404.html 50x.html about.html academic-integrity.html admin-covers.html admin.html audit-temy-vkr.html avtorskiy-zakaz.html check.html configurator.html consent-analytics.html consent-marketing.html consent-publication.html consent-request.html consent.html dashboard.html deposit.html diplomnaya-po-ekonomike.html diplomnaya-po-psihologii.html diplomnaya-po-yurisprudencii.html diplomnaya-rabota.html dorabotka-otcheta-po-praktike.html dosie-nauchruka.html expertise.html gift.html guarantees.html guide-antiplagiat-ai.html guide-apellyaciya.html guide-dnevnik-praktiki.html guide-harakteristika-s-praktiki.html guide-kursovaya-za-nedelyu.html guide-normocontrol.html guide-obekt-predmet-cel-zadachi.html guide-otchet-po-praktike.html guide-otzyv-rukovoditelya-vkr.html guide-prakticheskaya-chast-kursovoy.html guide-prezentaciya-k-zashchite.html guide-prilozheniya-po-gost.html guide-recenziya-na-vkr.html guide-rech-na-zashchitu.html guide-rinc-statya.html guide-skolko-stoit-diplomnaya.html guide-skolko-stoit-kursovaya.html guide-spisok-literatury.html guide-temy-vkr.html guide-titulnyj-list.html guide-vkr-struktura.html guide-vvedenie-kursovoy.html guide-zaklyuchenie-kursovoy.html guide-zaklyuchenie-vkr.html guide-zashchita-diploma.html index.html kandidatskaya-dissertaciya.html knowledge.html komissiya-0.html kursovaya-po-ekonomike.html kursovaya-po-informatike.html kursovaya-po-menedzhmentu.html kursovaya-po-pedagogike.html kursovaya-po-psihologii.html kursovaya-po-yurisprudencii.html kursovaya-rabota.html loyalty.html magisterskaya-dissertaciya.html maintenance.html nauchnaya-statya.html normokontrol-vkr.html oferta.html oplaceno.html oplata.html otchet-po-praktike.html plan.html plus.html privacy.html priyomnaya.html prolog.html proverka-istochnikov-vkr.html razbor-zamechaniy-nauchruka.html redaktura-posle-ii.html referat.html referral.html refunds.html requisites.html reviews.html services.html specifikaciya.html start.html tariffs.html terms.html tools.html vedenie.html zayavka.html';
  var ANALYTICS_PAGE_MAP = {};
  ANALYTICS_PAGE_LIST.split(' ').forEach(function (name) { ANALYTICS_PAGE_MAP[name] = true; });
  function analyticsPage(value) {
    var path = String(value || '/');
    if (path !== path.toLowerCase()) return '/other';
    if (path === '/') return path;
    var name = path.charAt(0) === '/' ? path.slice(1) : '';
    return ANALYTICS_PAGE_MAP[name] === true ? path : '/other';
  }

  function analyticsPreview() {
    try {
      return new URLSearchParams(location.search).get('desktop-preview') === '1';
    } catch (e) { return false; }
  }

  function analyticsMark(value) {
    var step = String(value || '').toLowerCase();
    if (step === 'cta: спросить мастера') return 'cta_contact';
    if (step === 'cta: конфигуратор') return 'cta_configurator';
    if (step.indexOf('услуга: ') === 0) return 'service_selected';
    var configStep = /^шаг ([1-4]) из 4$/.exec(step);
    if (configStep) return 'config_step_' + configStep[1];
    if (step === 'запросил смету на почту') return 'quote_email_requested';
    if (step === 'заявка: форма заполнена') return 'order_form_ready';
    if (step === 'отправка не прошла — запасной ход') return 'order_fallback_shown';
    if (step.indexOf('подсказка помощи: ') === 0) return 'help_hint_shown';
    if (step.indexOf('закладка помощи: ') === 0) return 'help_bookmark_shown';
    if (step === 'вопрос с гайда') return 'guide_question_opened';
    if (step === 'показана закладка возврата сметы') return 'quote_return_shown';
    if (step === 'видел мини-смету «ляссе»') return 'mini_quote_seen';
    if (step === 'инструмент: проверка doi завершена') return 'doi_check_complete';
    if (step.indexOf('js: ') === 0) return 'js_error';
    return '';
  }

  var ANALYTICS_EVENT_MAP = {};
  ('cta_click tg_open config_open step_view submit_attempt submit_fail first_input ' +
    'case_bridge_open case_route_inferred case_step_view case_recommend_view ' +
    'case_route_confirm case_route_change case_submit_ready case_route_ready ' +
    'case_route_uncertain case_route_blocked case_prompt_start ' +
    'case_result_situation_changed case_route_open case_free_route_open ' +
    'case_ecosystem_stage home_desk_situation home_desk_artifact home_desk_continue')
    .split(' ').forEach(function (name) { ANALYTICS_EVENT_MAP[name] = true; });
  var ANALYTICS_VARIANT_TOKEN_MAP = {};
  ('r1 na visible summary shown contact case1 page service route 1 2 3 4 s0 s1 s2 s3 s4 ' +
    'topic draft comments defense situation work result course emp diplom master chapter ' +
    'vak scopus rinc practice kandidat self no diagnostic editing ai formatting support ' +
    'tutoring recommendation multiple states results works only state too short without ' +
    'material manual unknown focus integrity clarify knowledge help open close free ' +
    'configurator text details live quote inferred changed c1 pg sv rt sh vs sd lq ct ' +
    'st rs wk cr ce dp ms ch vk sc rc pr kd sf nw w t d c f s dg ed fm df sp tu r rcm').split(' ')
    .forEach(function (token) { ANALYTICS_VARIANT_TOKEN_MAP[token] = true; });
  function analyticsExact(value, expression, max) {
    var raw = String(value == null ? '' : value).trim().toLowerCase();
    if (!raw || raw.length > max || !expression.test(raw)) return '';
    return raw;
  }
  function analyticsCta(name, value) {
    var raw = String(value == null ? '' : value).trim().toLowerCase();
    if (name === 'tg_open') return analyticsExact(raw, /^telegram_(?:bot|human|channel)$/, 32);
    if (name === 'cta_click') {
      return analyticsExact(raw, /^(?:contact_sheet|configurator(?::(?:pl|ai|rv|tu|nm|df|k0|dp|au))?)$/, 32);
    }
    if (name === 'config_open' || name === 'submit_attempt' || name === 'first_input') {
      return analyticsExact(raw, /^(?:calculator|service:(?:pl|ai|rv|tu|nm|df|k0|dp|au))$/, 32);
    }
    if (name === 'step_view') return analyticsExact(raw, /^step_[1-4]$/, 16);
    if (name === 'submit_fail') {
      return analyticsExact(raw, /^(?:server_rejected|request_conflict|network_fallback)$/, 24);
    }
    if (name === 'case_bridge_open') return analyticsExact(raw, /^page_context$/, 16);
    if (name.indexOf('home_desk_') === 0) return analyticsExact(raw, /^home_editorial_desk$/, 24);
    if (name === 'case_route_ready' || name === 'case_route_uncertain' ||
        name === 'case_route_blocked' || name === 'case_prompt_start' ||
        name === 'case_result_situation_changed' || name === 'case_route_open' ||
        name === 'case_free_route_open' || name === 'case_ecosystem_stage') {
      return analyticsExact(raw, /^research_case$/, 20);
    }
    return analyticsExact(raw,
      /^(?:svc_(?:plan|ai|review|tutor|norm|defense|defense_pack|author_order)|commission_zero|work_(?:turn|vip|base))$/,
      32);
  }
  function analyticsVariant(name, value) {
    var raw = String(value == null ? '' : value).trim().toLowerCase();
    if (!raw) return '';
    if (name === 'case_bridge_open') {
      return analyticsExact(raw, /^(?:self|route)_stage_[1-4]$/, 24);
    }
    if (name === 'home_desk_situation') return analyticsExact(raw, /^(?:text|comments|defense)$/, 16);
    if (name === 'home_desk_artifact') return analyticsExact(raw, /^(?:open|close)$/, 8);
    if (name === 'home_desk_continue') return analyticsExact(raw, /^(?:free|configurator)$/, 16);
    if (name === 'case_result_situation_changed') {
      if (raw.indexOf('r1_вкр, пока есть только тема') === 0) raw = 'r1_topic';
      else if (raw.indexOf('r1_вкр, получены замечания') === 0) raw = 'r1_comments';
      else if (raw.indexOf('r1_диплом готов, скоро защита') === 0) raw = 'r1_defense';
      else if (raw.indexOf('r1_курсовая, уже есть мой') === 0) raw = 'r1_draft';
    }
    if (name === 'case_route_ready') {
      var situations = { topic:'t', draft:'d', comments:'c', defense:'f' };
      var works = {
        course:'cr', course_emp:'ce', diplom:'dp', master:'ms', chapter:'ch',
        vak:'vk', scopus:'sc', rinc:'rc', practice:'pr', kandidat:'kd', self:'sf', no_work:'nw'
      };
      var results = {
        diagnostic:'dg', editing:'ed', ai_editing:'ai', formatting:'fm',
        defense:'df', support:'sp', tutoring:'tu'
      };
      Object.keys(situations).some(function (situation) {
        return Object.keys(works).some(function (work) {
          return Object.keys(results).some(function (result) {
            var legacy = ('r1_' + situation + '_' + work + '_' + result).slice(0, 32);
            if (legacy !== raw) return false;
            raw = 'r1_' + situations[situation] + '_' + works[work] + '_' + results[result];
            return true;
          });
        });
      });
    }
    raw = analyticsExact(raw, /^r1_[a-z0-9_-]{1,29}$/, 32);
    if (!raw) return '';
    var tokens = raw.split('_');
    for (var i = 0; i < tokens.length; i++) {
      if (!ANALYTICS_VARIANT_TOKEN_MAP[tokens[i]]) return '';
    }
    return raw;
  }
  function analyticsEvent(value, detail) {
    var name = String(value || '').trim().toLowerCase();
    if (ANALYTICS_EVENT_MAP[name] !== true) return null;
    detail = detail || {};
    var cta = analyticsCta(name, detail.cta);
    if (!cta) return null;
    var expectsVariant = name.indexOf('case_') === 0 || name.indexOf('home_desk_') === 0;
    var variant = analyticsVariant(name, detail.variant);
    if (expectsVariant && !variant) return null;
    if (!expectsVariant && detail.variant != null) return null;
    return { name: name, cta: cta, variant: variant };
  }

  function forgetAnalyticsVendorState() {
    try {
      Object.keys(localStorage).forEach(function (key) {
        if (/^_ym/i.test(key)) localStorage.removeItem(key);
      });
      document.cookie.split(';').forEach(function (part) {
        var name = part.split('=')[0].trim();
        if (/^_ym/i.test(name)) {
          document.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax';
          document.cookie = name + '=; Max-Age=0; path=/; domain=.' + location.hostname + '; SameSite=Lax';
        }
      });
    } catch (e) {}
  }

  function purgeAnalyticsBrowserState() {
    Salon.store.del('salon_vid');
    Salon.store.del('salon_attr_v2');
    forgetAnalyticsVendorState();
    if (Salon.metrika && typeof Salon.metrika.stop === 'function') Salon.metrika.stop();
  }
  Salon.analyticsPrivacy = { page: analyticsPage, mark: analyticsMark, event: analyticsEvent };

  /* Отдельное согласие на необязательную аналитику. Старый v1 намеренно
     не мигрируем: его кнопка «Хорошо» не фиксировала предметный выбор.
     Через 12 месяцев и при новой версии текст согласия показывается заново. */
  Salon.consent = (function () {
    var KEY = 'salon_consent';
    var VERSION = 3;
    var TTL = 365 * 24 * 60 * 60 * 1000;
    function read() {
      var c = Salon.store.get(KEY, null);
      var exp = c && c.expiresAt ? Date.parse(c.expiresAt) : NaN;
      if (!c || c.v !== VERSION || typeof c.analytics !== 'boolean' ||
          !c.at || !isFinite(exp) || exp <= Date.now()) {
        if (c) Salon.store.del(KEY);
        if (c || Salon.store.get('salon_vid', null) || Salon.store.get('salon_attr_v2', null)) {
          purgeAnalyticsBrowserState();
        }
        return null;
      }
      return c;
    }
    function emit(c) {
      try {
        document.dispatchEvent(new CustomEvent('salon:consent', { detail: c }));
      } catch (e) {
        var ev = document.createEvent('CustomEvent');
        ev.initCustomEvent('salon:consent', false, false, c);
        document.dispatchEvent(ev);
      }
    }
    function save(analytics, source) {
      var now = new Date();
      var c = {
        v: VERSION,
        document: 'analytics-consent-2.2',
        necessary: true,
        analytics: analytics === true,
        action: analytics === true ? 'allow' : 'reject',
        source: source || 'banner',
        at: now.toISOString(),
        expiresAt: new Date(now.getTime() + TTL).toISOString()
      };
      Salon.store.set(KEY, c);
      if (!c.analytics) purgeAnalyticsBrowserState();
      emit(c);
      return c;
    }
    function allowed() {
      var c = read();
      return !!(c && c.analytics === true);
    }
    window.addEventListener('storage', function (e) {
      if (e.key !== KEY) return;
      emit(read() || { v: VERSION, necessary: true, analytics: false, action: 'reject' });
    });
    return { key: KEY, version: VERSION, ttl: TTL, read: read, save: save, allowed: allowed };
  })();

  /* ---------------- Фирменный motion-язык ----------------
     Один реактивный источник вместо разрозненных проверок.
     full — полная типографская хореография; lite — те же жесты,
     но без ambient-циклов; off — статичный итог без движения. */
  Salon.motion = (function () {
    var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var current = '';
    function lowPower() {
      var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      return !!((c && c.saveData) ||
        (navigator.deviceMemory && navigator.deviceMemory <= 2) ||
        (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2));
    }
    function read() {
      if (docEl.hasAttribute('data-calm') || (mq && mq.matches)) return 'off';
      return lowPower() ? 'lite' : 'full';
    }
    function refresh() {
      var next = read(), changed = next !== current;
      current = next;
      docEl.setAttribute('data-motion', next);
      reduceMotion = next === 'off';
      Salon.reduceMotion = reduceMotion;
      if (changed) {
        try { window.dispatchEvent(new CustomEvent('salon:motionchange', { detail: { mode: next } })); } catch (e) {}
      }
      return next;
    }
    function can(ambient) { return current !== 'off' && (!ambient || current === 'full'); }
    function replay(el, cls, hold) {
      if (!el) return;
      el.classList.remove(cls);
      if (current === 'off') return;
      void el.offsetWidth;
      el.classList.add(cls);
      setTimeout(function () { if (el) el.classList.remove(cls); }, hold || 420);
    }
    function field(el, state) {
      if (!el) return;
      if (state === 'error') {
        el.setAttribute('aria-invalid', 'true');
        el.classList.add('motion-field-error');
        replay(el, 'motion-field-kick', 360);
      } else {
        el.removeAttribute('aria-invalid');
        el.classList.remove('motion-field-error', 'motion-field-kick');
        if (state === 'success') replay(el, 'motion-field-ok', 520);
      }
    }
    refresh();
    if (mq) {
      if (mq.addEventListener) mq.addEventListener('change', refresh);
      else if (mq.addListener) mq.addListener(refresh);
    }
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn && conn.addEventListener) conn.addEventListener('change', refresh);
    document.addEventListener('invalid', function (e) { field(e.target, 'error'); }, true);
    document.addEventListener('input', function (e) {
      if (e.target && e.target.classList && e.target.classList.contains('motion-field-error')) field(e.target, 'clear');
    }, true);
    document.addEventListener('pointerdown', function (e) {
      if (!can(false) || e.button > 0) return;
      var b = e.target.closest && e.target.closest('.btn-wax, .mn-calc, [data-motion-press]');
      if (!b || b.disabled || b.querySelector('.motion-ink-drop')) return;
      var r = b.getBoundingClientRect(), d = document.createElement('span');
      d.className = 'motion-ink-drop'; d.setAttribute('aria-hidden', 'true');
      d.style.left = (e.clientX - r.left) + 'px'; d.style.top = (e.clientY - r.top) + 'px';
      b.appendChild(d);
      setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 520);
    }, { passive: true });
    return { mode: function () { return current; }, can: can, refresh: refresh, replay: replay, field: field };
  })();

  Salon.plural = function (n, forms) {
    var a = Math.abs(n) % 100, b = a % 10;
    return forms[(a > 10 && a < 20) ? 2 : (b > 1 && b < 5) ? 1 : (b === 1) ? 0 : 2];
  };

  /* ---------------- Тема оформления (светлая «Оттиск» / «Оттиск ночью») ----------------
     Первичная тема выставляется инлайн-скриптом в <head> (без мигания).
     Переключение — «чернильной заливкой»: view transition раскрывает
     новую тему кругом от точки клика. Фолбэк — мягкий кросс-фейд. */
  var ttUid = 0;
  Salon.themeToggleHTML = function () {
    ttUid++;
    var m = 'ttm' + ttUid;
    return '<button class="theme-toggle" type="button" aria-label="Сменить тему оформления" title="Светлая / тёмная тема">' +
      '<svg class="tt-svg" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<mask id="' + m + '"><rect width="24" height="24" fill="#fff"/><circle class="tt-hole" cx="26" cy="2" r="0" fill="#000"/></mask>' +
        '<circle class="tt-core" cx="12" cy="12" r="4.6" fill="currentColor" mask="url(#' + m + ')"/>' +
        '<g class="tt-rays" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">' +
          '<line x1="12" y1="2.4" x2="12" y2="4.4"/><line x1="12" y1="19.6" x2="12" y2="21.6"/>' +
          '<line x1="2.4" y1="12" x2="4.4" y2="12"/><line x1="19.6" y1="12" x2="21.6" y2="12"/>' +
          '<line x1="5.2" y1="5.2" x2="6.6" y2="6.6"/><line x1="17.4" y1="17.4" x2="18.8" y2="18.8"/>' +
          '<line x1="18.8" y1="5.2" x2="17.4" y2="6.6"/><line x1="6.6" y1="17.4" x2="5.2" y2="18.8"/>' +
        '</g>' +
        '<g class="tt-stars" fill="currentColor"><circle cx="5.4" cy="6.4" r=".9"/><circle cx="8.1" cy="3.7" r=".6"/><circle cx="4" cy="10.4" r=".55"/></g>' +
      '</svg></button>';
  };
  /* ---------------- Режим без анимаций: движение — по желанию ----------------
     Тумблер в шапке и путеводителе: html[data-calm] глушит анимации всего
     сайта (chrome.css), а контраст слегка поднят. localStorage salon_calm. */
  Salon.calmToggleHTML = function () {
    return '<button class="calm-toggle" type="button" aria-pressed="false" ' +
      'aria-label="Режим без анимаций" title="Режим без анимаций">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.6" stroke-linecap="round" aria-hidden="true">' +
      '<path class="ct-wave" d="M3 12c2.2-3.4 4.3-3.4 6.5 0s4.3 3.4 6.5 0 3.4-2.7 5-1"/>' +
      '<path class="ct-flat" d="M4 12h16" style="display:none"/></svg></button>';
  };
  Salon.calm = (function () {
    function on() { return docEl.hasAttribute('data-calm'); }
    function apply(mode, persist) {
      if (mode) docEl.setAttribute('data-calm', '1');
      else docEl.removeAttribute('data-calm');
      docEl.querySelectorAll('.calm-toggle').forEach(function (b) {
        b.setAttribute('aria-pressed', String(!!mode));
        b.title = mode ? 'Анимации выключены · вернуть движение'
                       : 'Режим без анимаций';
        var w = b.querySelector('.ct-wave'), f = b.querySelector('.ct-flat');
        if (w) w.style.display = mode ? 'none' : '';
        if (f) f.style.display = mode ? '' : 'none';
      });
      docEl.querySelectorAll('[data-calm-label]').forEach(function (l) {
        l.textContent = mode ? 'Анимации выключены' : 'Режим без анимаций';
      });
      if (persist) { try { localStorage.setItem('salon_calm', mode ? '1' : ''); } catch (e) {} }
      if (Salon.motion) Salon.motion.refresh();
      try { window.dispatchEvent(new Event('resize')); } catch (e) {}
    }
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.calm-toggle');
      if (!b) return;
      e.preventDefault();
      var next = !on();
      apply(next, true);
      if (Salon.toast) Salon.toast(next
        ? 'Анимации и мерцание выключены'
        : 'Движение возвращено');
    });
    try { if (localStorage.getItem('salon_calm')) apply(true, false); } catch (e) {}
    return { on: on, apply: apply };
  })();

  Salon.theme = (function () {
    var themePage = (location.pathname.split('/').pop() || 'index.html');
    var THEME_BG = {
      light: '#E9DDCC',
      dark: themePage === 'index.html' ? '#15110E' : '#14120E'
    };
    var vtBusy = false;
    function current() { return docEl.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
    function apply(mode, persist) {
      docEl.setAttribute('data-theme', mode);
      var m = document.querySelector('meta[name="theme-color"]');
      if (m) m.setAttribute('content', THEME_BG[mode]);
      docEl.querySelectorAll('.theme-toggle').forEach(function (b) {
        b.setAttribute('aria-pressed', String(mode === 'dark'));
        b.title = mode === 'dark' ? 'Тёмная тема · включить светлую' : 'Светлая тема · включить тёмную';
      });
      docEl.querySelectorAll('[data-theme-label]').forEach(function (l) {
        l.textContent = mode === 'dark' ? 'Тёмная тема' : 'Светлая тема';
      });
      docEl.querySelectorAll('[data-theme-action]').forEach(function (l) {
        l.textContent = mode === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему';
      });
      docEl.querySelectorAll('[data-theme-glyph]').forEach(function (g) {
        g.setAttribute('data-theme-icon', mode === 'dark' ? 'light' : 'dark');
      });
      if (persist) { try { localStorage.setItem('salon_theme', mode); } catch (e) {} }
      try {
        window.dispatchEvent(new CustomEvent('salon:theme-change', { detail: { theme: mode } }));
      } catch (e) {}
    }
    /* чернильная заливка от точки (x, y) */
    function switchFrom(mode, x, y) {
      var canVT = typeof document.startViewTransition === 'function' &&
        (!Salon.motion || Salon.motion.mode() === 'full') && !document.hidden && !vtBusy;
      if (!canVT) { apply(mode, true); return; }
      vtBusy = true;
      docEl.classList.add('vt-theme');
      var done = function () { vtBusy = false; docEl.classList.remove('vt-theme'); };
      var vt;
      try {
        vt = document.startViewTransition(function () { apply(mode, true); });
      } catch (e) { done(); apply(mode, true); return; }
      vt.ready.then(function () {
        var r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 24;
        docEl.animate(
          { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + r + 'px at ' + x + 'px ' + y + 'px)'] },
          { duration: Salon.motion && Salon.motion.mode() === 'lite' ? 340 : 460,
            easing: 'cubic-bezier(.2,.72,.25,1)', pseudoElement: '::view-transition-new(root)' }
        );
      }).catch(function () {});
      vt.finished.then(done, done);
    }
    function toggle() {
      var b = document.querySelector('.theme-toggle');
      var r = b ? b.getBoundingClientRect() : { left: window.innerWidth / 2, top: 0, width: 0, height: 0 };
      switchFrom(current() === 'dark' ? 'light' : 'dark', r.left + r.width / 2, r.top + r.height / 2);
    }
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.theme-toggle');
      if (!b) return;
      e.preventDefault();
      var rc = b.getBoundingClientRect();
      var x = e.clientX || rc.left + rc.width / 2;
      var y = e.clientY || rc.top + rc.height / 2;
      switchFrom(current() === 'dark' ? 'light' : 'dark', x, y);
    });
    /* если пользователь не выбирал тему вручную — следуем за системной */
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onSys = function () { var saved; try { saved = localStorage.getItem('salon_theme'); } catch (e) {}
        if (!saved) apply(mq.matches ? 'dark' : 'light', false); };
      if (mq.addEventListener) mq.addEventListener('change', onSys);
      else if (mq.addListener) mq.addListener(onSys);
    }
    return { toggle: toggle, apply: apply, current: current };
  })();

  /* ============================================================
     «ПОМЕТКИ НА ПОЛЯХ» — единый слой уведомлений «Оттиска».
     Заменяет Salon.toast (тёмный тост) и .onote (лист в углу).
     Три уровня: 'call'  — полоса набора, требует решения клиента;
                 'echo'  — оттиск его собственного действия;
                 'quiet' — только строка в реестре «Поля» и счётчик.
     ES5: var, конкатенация, без стрелок и шаблонных литералов.
     Показ БЕЗ rAF (void offsetWidth / setTimeout): в панели
     предпросмотра проекта кадр не наступает — обход снимать нельзя.
     ============================================================ */
  (function marginalia() {
    'use strict';
    var S = window.Salon || (window.Salon = {});
    var docEl = document.documentElement;
    var here = (location.pathname.split('/').pop() || 'index.html');
    function rmNow() {
      return S.motion ? S.motion.mode() === 'off' :
        !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches);
    }

    /* страницы решения: карточка не выходит ни при каких событиях */
    var HUSH_ALL = {
      'admin.html': 1, 'admin-mock.html': 1, '404.html': 1, 'dashboard.html': 1,
      'oferta.html': 1, 'privacy.html': 1, 'ustav.html': 1, 'priyomnaya.html': 1,
      'configurator.html': 1
    };
    /* денежные страницы: молчим обо всём, кроме денег по делу */
    var HUSH_SOFT = { 'oplata.html': 1, 'specifikaciya.html': 1 };
    var SOFT_PASS = { prepay: 1, priced: 1 };
    /* заголовок страницы ведут сами (кабинет) — не спорим */
    var TITLE_OFF = { 'dashboard.html': 1, 'admin.html': 1, 'admin-mock.html': 1 };

    var RANK = { check: 90, prepay: 85, priced: 80, msg: 60, file: 40, paused: 35,
                 work: 30, fix: 25, done: 20, cancel: 15, newo: 5 };

    var GAP_MS = 90000;       /* громкая — не чаще раза в полторы минуты   */
    var PER_HOUR = 3;         /* и не больше трёх в скользящий час          */
    var COLD_MS = 8000;       /* тишина первые 8 секунд ВИЗИТА             */
    var HOP_MS = 3000;        /* и первые 3 секунды после перехода         */
    var HOLD_MS = 180000;     /* потолок паузы под курсором                */
    var ECHO_MAX = 2;
    var MARKS_MAX = 30;
    var MARKS_TTL = 1209600000;   /* 14 суток */

    var rail = null, lrail = null, liveP = null, liveA = null, ledger = null;
    var current = null, echoes = [], queue = [], drainTimer = null;
    var hopT0 = Date.now(), baseTitle = null;

    /* ---------------- хранилище ---------------- */
    function get(k, fb) { return (S.store && S.store.get) ? S.store.get(k, fb) : fb; }
    function set(k, v) { if (S.store && S.store.set) S.store.set(k, v); }
    function sget(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
    function sset(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} return v; }

    /* начало ВИЗИТА, а не страницы: иначе холодные 8 секунд обнуляются на
       каждой из 71 страницы и громкий канал не заговорит никогда */
    var visitT0 = parseInt(sget('salon_t0') || '0', 10);
    if (!visitT0) { visitT0 = Date.now(); sset('salon_t0', String(visitT0)); }

    /* ---------------- единый нижний якорь --floor ----------------
       ОДНА переменная для всех жильцов нижней кромки: «Связаться»,
       «Нужна помощь?», куки-плашка и сменяющая её карточка прогресса.
       Считается как ЗАНЯТАЯ КРОМКА; одновременно левый rail показывает
       только один системный слой. */
    function measure() {
      var f = 0, r, cs, nav, hdr, hh, narrow, lh, vv, keyboard;
      vv = window.visualViewport;
      keyboard = !!(vv && window.innerHeight - vv.height > 140);
      nav = document.querySelector('.mobile-cta');
      if (nav && !keyboard) {
        cs = getComputedStyle(nav);
        if (cs.display !== 'none') f = Math.round(nav.getBoundingClientRect().height);
      }
      hdr = document.querySelector('.site-header');
      hh = hdr ? Math.round(hdr.getBoundingClientRect().height) : 64;
      /* на телефоне рельсы делят одну кромку: правый встаёт НАД левым */
      narrow = !!(window.matchMedia && window.matchMedia('(max-width:920px)').matches);
      lh = 0;
      if (narrow && lrail && lrail.children.length) {
        r = lrail.getBoundingClientRect();
        if (r.height > 0) lh = Math.round(r.height) + 10;
      }
      /* Все чтения геометрии идут до записей: иначе каждая переменная
         принуждала браузер заново пересчитывать layout первого экрана. */
      docEl.classList.toggle('keyboard-open', keyboard);
      docEl.style.setProperty('--floor', (f > 0 ? f : 0) + 'px');
      docEl.style.setProperty('--hdr-h', hh + 'px');
      docEl.style.setProperty('--lrail-h', lh + 'px');
    }
    var measureFrame = 0;
    function scheduleMeasure() {
      if (measureFrame) return;
      measureFrame = (window.requestAnimationFrame || function (callback) {
        return setTimeout(callback, 16);
      })(function () {
        measureFrame = 0;
        measure();
      });
    }
    S.floor = scheduleMeasure;
    window.addEventListener('resize', scheduleMeasure, { passive: true });
    window.addEventListener('orientationchange', function () { setTimeout(scheduleMeasure, 250); });
    if (window.visualViewport && window.visualViewport.addEventListener) {
      window.visualViewport.addEventListener('resize', scheduleMeasure);
      window.visualViewport.addEventListener('scroll', scheduleMeasure);
    }
    if ('ResizeObserver' in window) {
      var floorRO = new ResizeObserver(scheduleMeasure);
      setTimeout(function () {
        var n = document.querySelector('.mobile-cta'), h = document.querySelector('.site-header');
        if (n) floorRO.observe(n); if (h) floorRO.observe(h);
      }, 0);
    }

    /* ---------------- рельсы ---------------- */
    function ensure() {
      if (rail) return rail;
      rail = document.createElement('div');
      rail.className = 'mrail'; rail.id = 'mrail';
      lrail = document.createElement('div');
      lrail.className = 'lrail'; lrail.id = 'lrail';

      /* живые регионы создаются ПУСТЫМИ и заранее: регион, вставленный
         сразу с текстом, большинство скринридеров не озвучивает */
      liveP = document.createElement('div');
      liveP.className = 'mrail-live';
      liveP.setAttribute('role', 'status');
      liveP.setAttribute('aria-live', 'polite');
      liveP.setAttribute('aria-atomic', 'false');
      liveA = liveP.cloneNode(false);
      liveA.setAttribute('aria-live', 'assertive');
      rail.appendChild(liveP);
      rail.appendChild(liveA);

      place();
      adopt();
      if (window.MutationObserver) {
        var mo = new MutationObserver(scheduleMeasure);
        mo.observe(rail, { childList: true });
        mo.observe(lrail, { childList: true });
      }
      scheduleMeasure();
      setTimeout(scheduleMeasure, 400);   /* шрифты доехали — высоты поменялись */
      return rail;
    }

    /* рельсы стоят ПОСЛЕ main и ПЕРЕД подвалом: карточка достижима с
       клавиатуры сразу после содержимого, а постоянная пилюля «Связаться»
       не влезает в начало таб-порядка каждой страницы */
    function place() {
      var anchor = document.querySelector('.site-footer');
      if (anchor && anchor.parentNode === document.body) {
        document.body.insertBefore(lrail, anchor);
        document.body.insertBefore(rail, anchor);
      } else {
        document.body.appendChild(lrail);
        document.body.appendChild(rail);
      }
    }

    /* пилюля «Связаться», куки-плашка и закладка помощи перестают быть
       самостоятельными position:fixed и становятся детьми рельсов */
    function adopt() {
      if (!rail) return;
      var pill = document.querySelector('.tg-pill');
      if (pill && pill.parentNode !== rail) rail.appendChild(pill);
      var cb = document.querySelector('.cookiebar');
      if (cb && cb.parentNode !== lrail) lrail.appendChild(cb);
      var hf = document.querySelector('.helpfab');
      if (hf && hf.parentNode !== lrail) {
        if (cb && cb.parentNode === lrail) lrail.insertBefore(hf, cb);
        else lrail.appendChild(hf);
      }
      scheduleMeasure();
    }
    /* Внешние виджеты (в первую очередь consent) могут появиться раньше
       DOMContentLoaded. Создаём рельсы синхронно до первой отрисовки,
       чтобы элемент сразу получил финальную геометрию и не создавал CLS. */
    S.railAdopt = function () {
      ensure();
      adopt();
    };

    /* ---------------- реестр «Поля» ---------------- */
    function marks() {
      var a = get('salon_marks', null), out = [], i, cut = Date.now() - MARKS_TTL;
      if (!a || !a.length) return out;
      for (i = 0; i < a.length; i++) if (a[i] && a[i].ts > cut) out.push(a[i]);
      return out;
    }
    function unreadN() {
      var a = marks(), n = 0, i;
      for (i = 0; i < a.length; i++) if (!a[i].read) n++;
      return n;
    }
    function mark(rec) {
      if (!rec || !rec.k) return false;
      var a = marks(), i;
      for (i = 0; i < a.length; i++) if (a[i].k === rec.k) return false;
      a.unshift(rec);
      set('salon_marks', a.slice(0, MARKS_MAX));
      badge(true);
      if (ledger && !ledger.hidden) drawLedger();
      return true;
    }
    function readOne(k) {
      var a = marks(), i, ch = false;
      for (i = 0; i < a.length; i++) if (a[i].k === k && !a[i].read) { a[i].read = true; ch = true; }
      if (ch) { set('salon_marks', a); badge(false); }
    }
    function readAll() {
      var a = marks(), i;
      for (i = 0; i < a.length; i++) a[i].read = true;
      set('salon_marks', a);
      badge(false);
      drawLedger();
    }
    S.marks = { list: marks, add: mark, unread: unreadN, readAll: readAll, open: function () { openLedger(); } };

    function badge(printed) {
      var n = unreadN(), total = marks().length, btn, el;
      /* заголовок правится ПЕРВЫМ — раньше любых ранних выходов */
      if (!TITLE_OFF[here]) {
        if (baseTitle === null) baseTitle = document.title.replace(/^\(\d+\)\s*/, '');
        document.title = n ? '(' + n + ') ' + baseTitle : baseTitle;
      }
      btn = document.querySelector('.nav-marks');
      if (!btn) return;
      btn.hidden = !total;
      el = btn.querySelector('.nm-n');
      if (!el) return;
      if (n) { el.textContent = n > 9 ? '9+' : String(n); el.hidden = false; }
      else { el.hidden = true; }
      if (printed && n && !rmNow()) { el.classList.remove('ink'); void el.offsetWidth; el.classList.add('ink'); }
    }

    /* Кнопки «Пометки на полях» в шапке больше нет: события приходят
       уведомлением, а история открывается из меню «Все разделы».
       Функция оставлена пустой, чтобы не трогать порядок инициализации
       и десяток мест, где на неё ссылались. */
    function mountMarks() { return; }

    /* Непрочитанное показываем уведомлением при заходе — иначе без бейджа
       человек его не увидит. Берём одно, самое свежее и самое важное:
       остальное лежит в истории. Частотные колпаки canLoud() и тишина
       первых секунд визита работают как раньше, спама не будет. */
    function replayUnread() {
      var a = marks(), i, top = null, rest = 0, rank;
      for (i = 0; i < a.length; i++) {
        if (a[i].read) continue;
        rest++;
        rank = RANK[a[i].kind] || 0;
        if (!top || rank > (RANK[top.kind] || 0)) top = a[i];
      }
      if (!top || !top.text) return;
      /* Поля «громкой» карточки: cap → номер дела, title → само событие,
         state → когда, goLabel → подпись действия. Не text/hrefLabel:
         те читает только тихое эхо. */
      queue.push({
        level: 'call',
        kind: top.kind || 'msg',
        cap: top.no ? String(top.no) : '',
        title: top.text,
        state: when(top.ts),
        sub: rest > 1 ? 'Ещё ' + (rest - 1) + ' в истории событий' : '',
        href: top.href || 'dashboard.html',
        goLabel: 'Открыть дело'
      });
      /* Помечаем показанное прочитанным: уведомление не должно всплывать
         заново на каждой странице. Остальное ждёт в истории. */
      readOne(top.k);
      kick();
    }

    function when(ts) {
      var d = new Date(ts), n = new Date();
      function p(x) { return (x < 10 ? '0' : '') + x; }
      var same = d.getDate() === n.getDate() && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
      return (same ? 'сегодня' : p(d.getDate()) + '.' + p(d.getMonth() + 1)) + ', ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    function buildLedger() {
      if (ledger) return ledger;
      ledger = document.createElement('div');
      ledger.className = 'mledger';
      ledger.id = 'mledger';
      ledger.setAttribute('role', 'dialog');
      ledger.setAttribute('aria-modal', 'false');
      ledger.setAttribute('aria-labelledby', 'mlH');
      ledger.hidden = true;
      ledger.innerHTML =
        '<div class="ml-head">' +
          '<div><span class="ml-kicker">Пометки на полях</span><h3 id="mlH">По вашим делам</h3></div>' +
          '<button type="button" class="ml-x" data-ml-x aria-label="Закрыть"><span aria-hidden="true">×</span></button>' +
        '</div>' +
        '<ol class="ml-list"></ol>' +
        '<div class="ml-empty" hidden><span aria-hidden="true">✓</span><b>Здесь пока тихо</b><small>Новые сообщения и статусы появятся здесь.</small></div>' +
        '<div class="ml-foot">' +
          '<button type="button" class="ml-clear" data-ml-clear>Прочитать всё</button>' +
          '<a class="ml-all" href="dashboard.html">Открыть кабинет <span class="ar" aria-hidden="true">→</span></a>' +
        '</div>';
      document.body.appendChild(ledger);
      ledger.addEventListener('click', function (e) {
        var t = e.target;
        if (t.closest('[data-ml-x]')) { closeLedger(); return; }
        if (t.closest('[data-ml-clear]')) { readAll(); return; }
        var a = t.closest('a.ml-go');
        if (a) readOne(a.getAttribute('data-k'));
      });
      return ledger;
    }

    function drawLedger() {
      var box = buildLedger(), list = box.querySelector('.ml-list'), a = marks(), i, li, go, sp, main, meta;
      while (list.firstChild) list.removeChild(list.firstChild);
      for (i = 0; i < a.length; i++) {
        li = document.createElement('li');
        li.className = 'ml-row' + (a[i].read ? '' : ' is-new');
        go = document.createElement('a');
        go.className = 'ml-go';
        go.setAttribute('href', a[i].href || 'dashboard.html');
        go.setAttribute('data-k', a[i].k);

        sp = document.createElement('span'); sp.className = 'ml-pin';
        sp.setAttribute('aria-hidden', 'true'); go.appendChild(sp);

        main = document.createElement('span'); main.className = 'ml-main';
        sp = document.createElement('span'); sp.className = 'ml-what';
        sp.textContent = a[i].text || ''; main.appendChild(sp);
        meta = document.createElement('span'); meta.className = 'ml-meta';
        if (a[i].no) {
          sp = document.createElement('span'); sp.className = 'ml-no';
          sp.textContent = String(a[i].no); meta.appendChild(sp);
        }
        sp = document.createElement('span'); sp.className = 'ml-when';
        sp.textContent = when(a[i].ts); meta.appendChild(sp);
        main.appendChild(meta); go.appendChild(main);

        sp = document.createElement('span'); sp.className = 'ml-arrow';
        sp.setAttribute('aria-hidden', 'true'); sp.textContent = '→'; go.appendChild(sp);

        li.appendChild(go);
        list.appendChild(li);
      }
      box.querySelector('.ml-empty').hidden = a.length > 0;
      box.querySelector('.ml-foot').hidden = a.length === 0;
      box.querySelector('.ml-clear').hidden = unreadN() === 0;
    }

    function outside(e) {
      if (!ledger || ledger.hidden) return;
      if (ledger.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.nav-marks')) return;
      closeLedger();
    }
    function openLedger() {
      buildLedger();
      drawLedger();
      ledger.hidden = false;
      void ledger.offsetWidth;
      ledger.classList.add('open');
      var b = document.querySelector('.nav-marks'), f;
      if (b) b.setAttribute('aria-expanded', 'true');
      f = ledger.querySelector('.ml-x');
      if (f) { try { f.focus(); } catch (e) {} }
      document.addEventListener('click', outside, true);
    }
    function closeLedger() {
      if (!ledger || ledger.hidden) return;
      ledger.classList.remove('open');
      var b = document.querySelector('.nav-marks');
      if (b) { b.setAttribute('aria-expanded', 'false'); try { b.focus(); } catch (e) {} }
      setTimeout(function () { if (ledger) ledger.hidden = true; }, rmNow() ? 0 : 200);
      document.removeEventListener('click', outside, true);
      kick();   /* реестр закрылся — занятость снята, очередь может пойти */
    }

    /* ---------------- занятость и очередь ---------------- */
    function busy() {
      if (document.hidden) return true;
      if (S.tour && S.tour.active && S.tour.active()) return true;
      if (docEl.classList.contains('has-prelude')) return true;
      if (ledger && !ledger.hidden) return true;
      return !!document.querySelector('.contact-sheet, .sdlg.open, .toc.open, .tour-veil, .page-veil.act');
    }
    /* очередь разбирается не только по закрытию карточки, но и по СНЯТИЮ
       занятости: закрыли Путеводитель, лист связи, диалог, вернулись во
       вкладку. Самозаводящийся тик дешевле наблюдателей и не течёт. */
    function kick() {
      if (!queue.length) return;
      if (!drainTimer) {
        drainTimer = setInterval(function () {
          if (!queue.length) { clearInterval(drainTimer); drainTimer = null; return; }
          drain();
        }, 700);
      }
      drain();
    }
    function drain() {
      if (!queue.length || current || busy()) return;
      if (Date.now() - visitT0 < COLD_MS) return;
      if (Date.now() - hopT0 < HOP_MS) return;
      if (!canLoud()) { queue.length = 0; return; }   /* колпак: всё уже в полях */
      queue.sort(function (a, b) { return (RANK[b.kind] || 0) - (RANK[a.kind] || 0); });
      var top = queue.shift();
      queue.length = 0;                                /* остальное — в полях, не копим */
      render(top);
    }

    /* ---------------- частотные колпаки ---------------- */
    function loudLog() {
      var c = get('salon_caps', null) || {}, a = c.loud || [], now = Date.now(), keep = [], i;
      for (i = 0; i < a.length; i++) if (now - a[i] < 3600000) keep.push(a[i]);
      return keep;
    }
    function canLoud() {
      var keep = loudLog(), now = Date.now();
      if (keep.length >= PER_HOUR) return false;
      if (keep.length && now - keep[keep.length - 1] < GAP_MS) return false;
      return true;
    }
    function tookLoud() {
      var c = get('salon_caps', null) || {}, keep = loudLog();
      keep.push(Date.now());
      c.loud = keep;
      set('salon_caps', c);
    }

    /* ---------------- эмодзи → тон линейки ----------------
       Смысл переезжает из значка в цвет линейки: скринридер больше не
       читает «галочка», а «Оттиск» не держит в наборе эмодзи. */
    var OK_RE = /[✅✔✓⭐]|🎉|\uD83D[\uDCC5\uDCE6\uDD12\uDD14\uDCDD\uDCE3\uDD04]/;
    var BAD_RE = /[⛔❌❗⚠]|🚫/;
    var OK_WORD_RE = /(готов|принят|оплачен|скопирован|сохранён|сохранен|вошли|в буфере|подтверждён|подтвержден)/i;
    var BAD_WORD_RE = /(ошиб|не получилось|не отправил|не принял|не похож|оставьте|отметьте|слишком|нужно от|доступ ограничен|сеть шалит|подождите)/i;
    function sniff(raw) {
      if (BAD_RE.test(raw) || BAD_WORD_RE.test(raw)) return 'wax';
      if (OK_RE.test(raw) || OK_WORD_RE.test(raw)) return 'verify';
      return 'stamp';
    }
    function clean(s) {
      return String(s)
        .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
        .replace(/[\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u200D\u20E3]/g, '')
        .replace(/\s+([,.:;!?])/g, '$1')
        .replace(/\s{2,}/g, ' ')
        .replace(/^\s+|\s+$/g, '');
    }

    /* ---------------- сборка ---------------- */
    function build(o) {
      var el = document.createElement('article'), loud = (o.level === 'call'), go, sub, act, lead;
      el.className = 'mnote mnote--' + (loud ? 'call' : 'echo') + ' is-' + (o.tone || 'stamp');
      el._spec = o;
      if (loud) {
        el.setAttribute('tabindex', '-1');
        el.setAttribute('role', 'group');
        el.innerHTML =
          '<span class="mn-seal" aria-hidden="true">¶</span>' +
          '<div class="mn-body">' +
            '<span class="mn-cap"><span class="mc-no"></span>' +
              '<span class="mc-dots" aria-hidden="true"></span>' +
              '<span class="mc-st"></span></span>' +
            '<b class="mn-t"></b>' +
            '<p class="mn-sub"></p>' +
            '<div class="mn-act">' +
              '<a class="mn-go btn btn-line"></a>' +
              '<button type="button" class="mn-later">Позже</button>' +
            '</div>' +
          '</div>' +
          '<button type="button" class="mn-x" aria-label="Убрать в поля">×</button>';
        el.querySelector('.mc-no').textContent = o.cap || '';
        el.querySelector('.mc-st').textContent = o.state || '';
        el.querySelector('.mn-t').textContent = o.title || '';
        sub = el.querySelector('.mn-sub');
        if (o.sub) sub.textContent = o.sub;
        else sub.parentNode.removeChild(sub);
        go = el.querySelector('.mn-go');
        go.setAttribute('href', o.href || 'dashboard.html');
        go.textContent = (o.goLabel || 'Открыть дело') + ' ';
        go.insertAdjacentHTML('beforeend', '<span class="ar" aria-hidden="true">→</span>');
        el.querySelector('.mn-later').addEventListener('click', function () { close(el, true); });
      } else {
        el.innerHTML =
          '<span class="mn-ic" aria-hidden="true">✓</span>' +
          '<span class="mn-msg"></span>' +
          '<span class="mn-lead" aria-hidden="true"><i></i></span>' +
          '<button type="button" class="mn-x" aria-label="Закрыть">×</button>';
        el.querySelector('.mn-msg').textContent = o.text || '';
        if (o.action && o.action.label) {
          act = document.createElement('button');
          act.type = 'button';
          act.className = 'mn-do';
          act.textContent = o.action.label;
          act.addEventListener('click', function () {
            try { if (o.action.onClick) o.action.onClick(); } catch (e) {}
            close(el, false);
          });
        } else if (o.href) {
          act = document.createElement('a');
          act.className = 'mn-do';
          act.setAttribute('href', o.href);
          act.textContent = o.hrefLabel || 'Открыть';
        }
        if (act) {
          lead = el.querySelector('.mn-lead');
          el.replaceChild(act, lead);   /* отточие уступает место действию */
          el.classList.add('has-do');
        }
      }
      el.querySelector('.mn-x').addEventListener('click', function () { close(el, o.level === 'call'); });
      return el;
    }

    function announce(o) {
      if (!liveP) return;
      var box = (o.level === 'call') ? liveA : liveP;
      var txt = (o.level === 'call')
        ? ((o.cap ? o.cap + '. ' : '') + (o.state ? o.state + '. ' : '') + (o.title || '') + (o.sub ? ' ' + o.sub : ''))
        : (o.text || '');
      box.textContent = '';
      setTimeout(function () { box.textContent = txt; }, 60);
    }

    function render(o) {
      var r = ensure(), el = build(o), pill = r.querySelector('.tg-pill'), life, lead, old;
      if (pill) r.insertBefore(el, pill); else r.appendChild(el);
      void el.offsetWidth;                 /* показ без rAF: кадр может не наступить */
      el.classList.add('in');

      if (o.level === 'call') {
        current = el;
        tookLoud();
        /* у громкой карточки ТАЙМЕРА НЕТ. Она про деньги и срок; исчезающий
           отсчёт рядом с ценой читается как «предложение истекает». Уходит
           только по «Позже», крестику, свайпу или Escape. */
      } else {
        echoes.push(el);
        while (echoes.length > ECHO_MAX) { old = echoes.shift(); close(old, false); }
        life = o.duration ? o.duration : Math.min(9000, 5500 + String(o.text || '').length * 60);
        if (o.href || o.action) life = Math.min(12000, Math.round(life * 1.6));
        lead = el.querySelector('.mn-lead i');
        if (rmNow() || !lead) {
          el._timer = setTimeout(function () { close(el, false); }, life);
        } else {
          /* фирменный приём: отточие само себя стирает справа налево.
             Пауза при hover/focus — animation-play-state, значит пауза
             анимации и пауза таймера физически одно и то же. */
          lead.style.animationDuration = life + 'ms';
          lead.addEventListener('animationend', function () { close(el, false); });
          /* потолок паузы: забытая под курсором строка не висит вечно */
          el._hold = setTimeout(function () { close(el, false); }, life + HOLD_MS);
        }
      }
      announce(o);
      swipe(el);
      scheduleMeasure();
      return el;
    }

    function close(el, toMargin) {
      if (!el || el._dead) return;
      el._dead = true;
      if (el._timer) { clearTimeout(el._timer); el._timer = null; }
      if (el._hold) { clearTimeout(el._hold); el._hold = null; }
      var i = echoes.indexOf(el);
      if (i > -1) echoes.splice(i, 1);          /* СИНХРОННО: иначе while зациклится */
      if (current === el) current = null;
      if (toMargin && el._spec && el._spec.rec) mark(el._spec.rec);
      /* max-height ставится ТОЛЬКО на выход: в покое none, иначе на 200%
         зуме карточка обрезается по нижней кромке */
      el.style.maxHeight = el.scrollHeight + 'px';
      void el.offsetWidth;
      el.classList.remove('in');
      el.classList.add('out');
      el.style.maxHeight = '0px';
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
        scheduleMeasure();
        kick();
      }, rmNow() ? 200 : 340);
    }

    /* ---------------- свайп вправо (телефон) ---------------- */
    function swipe(el) {
      var x0 = 0, y0 = 0, dx = 0, on = false, lock = 0;
      el.addEventListener('touchstart', function (e) {
        if (e.touches.length !== 1) return;
        x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
        dx = 0; lock = 0; on = true;
        el.classList.add('swiping');
      }, { passive: true });
      el.addEventListener('touchmove', function (e) {
        if (!on) return;
        var x = e.touches[0].clientX, y = e.touches[0].clientY;
        if (!lock) lock = (Math.abs(x - x0) > Math.abs(y - y0) + 4) ? 1 : -1;
        if (lock < 0) return;                    /* вертикаль — это скролл страницы */
        dx = Math.max(0, x - x0);
        el.style.transform = 'translateX(' + dx + 'px)';
        el.style.opacity = String(Math.max(0, 1 - dx / 220));
      }, { passive: true });
      function up() {
        if (!on) return;
        on = false;
        el.classList.remove('swiping');
        if (dx > 64) { el.style.transform = 'translateX(110%)'; close(el, true); }
        else { el.style.transform = ''; el.style.opacity = ''; }
      }
      el.addEventListener('touchend', up);
      el.addEventListener('touchcancel', up);
    }

    /* ---------------- квитанция вызова ----------------
       Функция (старый контракт Salon.toast → dismiss) + поля статуса,
       чтобы поллер писал ключ ПОСЛЕ доставки, а не после вызова. */
    function receipt() {
      var f = function () { if (f.dismiss) f.dismiss(); };
      f.delivered = false;
      f.channel = 'none';
      f.dismiss = null;
      return f;
    }

    /* ---------------- ЕДИНАЯ ТОЧКА ПОКАЗА ---------------- */
    S.note = function (spec) {
      var o = spec || {}, out = receipt(), el, landed, raw;
      o.level = o.level || 'echo';
      o.kind = o.kind || o.level;

      /* ЭХО — ответ на действие клиента в этой вкладке. Работает везде,
         включая тихие страницы и админку: человек нажал и ждёт ответа. */
      if (o.level === 'echo') {
        raw = o.text == null ? '' : String(o.text);
        o.text = clean(raw);
        if (!o.text) return out;
        if (!o.tone) o.tone = sniff(raw);
        el = render(o);
        out.delivered = true;
        out.channel = 'echo';
        out.dismiss = function () { close(el, false); };
        return out;
      }

      /* СЕРВЕРНОЕ СОБЫТИЕ сначала ложится в поля и только потом, если
         позволено, поднимается до карточки. Терять нечего в принципе. */
      landed = o.rec ? mark(o.rec) : false;
      out.delivered = !!(landed || !o.rec);
      out.channel = 'ledger';
      if (o.rec && !landed) { out.delivered = true; out.channel = 'dup'; return out; }

      if (o.level !== 'call') return out;
      if (HUSH_ALL[here]) return out;
      if (HUSH_SOFT[here] && !SOFT_PASS[o.kind]) return out;
      if (!canLoud()) return out;

      if (current) {
        if ((RANK[o.kind] || 0) <= (RANK[(current._spec || {}).kind] || 0)) return out;
        close(current, true);                    /* приоритетнее — вытесняет */
        queue.push(o); kick();
        out.channel = 'queued';
        return out;
      }
      if (busy() || Date.now() - visitT0 < COLD_MS || Date.now() - hopT0 < HOP_MS) {
        queue.push(o); kick();
        out.channel = 'queued';
        return out;
      }
      el = render(o);
      out.channel = 'call';
      out.dismiss = function () { close(el, true); };
      return out;
    };

    /* ---------------- совместимость: старая сигнатура ----------------
       Salon.toast(msg, {type,action,href,hrefLabel,duration}) — все 131
       существующий вызов продолжают работать, возвращается dismiss. */
    var TYPE_TONE = { success: 'verify', error: 'wax', info: 'stamp' };
    S.toast = function (msg, opts) {
      opts = opts || {};
      return S.note({
        level: 'echo',
        text: msg,
        tone: TYPE_TONE[opts.type] || null,
        action: opts.action || null,
        href: opts.href || null,
        hrefLabel: opts.hrefLabel || null,
        duration: opts.duration || 0
      });
    };

    /* ---------------- вкладка-лидер ----------------
       Опрашивает /orders и показывает только одна вкладка: чинит гонку
       setInterval(90000) × visibilitychange(800ms), дававшую дубль. */
    S.lead = function () {
      var id = sget('salon_tab'), l, now = Date.now();
      if (!id) { id = 't' + now + Math.random().toString(36).slice(2, 7); sset('salon_tab', id); }
      l = get('salon_lead', null);
      if (!l || !l.id || l.id === id || now - l.ts > 5000) {
        set('salon_lead', { id: id, ts: now });
        return true;
      }
      return false;
    };

    /* ---------------- клавиатура и фон ---------------- */
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' && e.keyCode !== 27) return;
      if (ledger && !ledger.hidden) { closeLedger(); return; }
      /* Escape отдаётся модальным слоям, если они открыты */
      if (document.querySelector('.sdlg.open, .toc.open, .contact-sheet')) return;
      if (current) { close(current, true); return; }
      if (echoes.length) close(echoes[echoes.length - 1], false);
    });
    document.addEventListener('visibilitychange', function () {
      if (rail) { if (document.hidden) rail.classList.add('held'); else rail.classList.remove('held'); }
      if (!document.hidden) kick();
    });
    window.addEventListener('storage', function (e) {
      if (!e.key || e.key.indexOf('salon_marks') < 0) return;
      badge(false);
      if (ledger && !ledger.hidden) drawLedger();
    });

    /* ---------------- запуск ---------------- */
    function init() {
      ensure();
      if (rail && document.querySelector('.site-footer')) place();  /* подвал появился позже */
      mountMarks();
      badge(false);
      replayUnread();
      adopt();
      setTimeout(adopt, 1200);   /* куки-плашка и закладка помощи приходят позже */
      scheduleMeasure();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else setTimeout(init, 0);
  })();

  Salon.copy = function (text) {
    return new Promise(function (res) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { res(true); }, fb);
      } else fb();
      function fb() {
        try {
          var ta = document.createElement('textarea'); ta.value = text;
          ta.style.cssText = 'position:fixed;top:-9999px'; document.body.appendChild(ta);
          ta.select(); document.execCommand('copy'); ta.remove(); res(true);
        } catch (e) { res(false); }
      }
    });
  };

  Salon.mask = {
    phone: function (v) {
      var d = v.replace(/\D/g, '').replace(/^8/, '7').replace(/^([^7])/, '7$1').slice(0, 11);
      if (!d) return '';
      var r = '+7'; if (d.length > 1) r += ' (' + d.slice(1, 4);
      if (d.length >= 4) r += ') ' + d.slice(4, 7);
      if (d.length >= 7) r += '-' + d.slice(7, 9);
      if (d.length >= 9) r += '-' + d.slice(9, 11);
      return r;
    },
    telegram: function (v) { var s = v.trim().replace(/^@?/, '@').replace(/[^@\w]/g, ''); return s === '@' ? '' : s; }
  };
  Salon.valid = {
    email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); },
    phone: function (v) { return v.replace(/\D/g, '').length === 11; },
    telegram: function (v) { return /^@\w{4,}$/.test(v) || /^(https?:\/\/)?t\.me\/\w{4,}$/i.test(v.trim()); },
    vk: function (v) { return /^(https?:\/\/)?(m\.)?(vk\.com|vk\.me)\/[A-Za-z0-9_.]{2,}$/i.test(v.trim()); },
    contact: function (v) { return Salon.valid.phone(v) || Salon.valid.telegram(v) || Salon.valid.email(v) || Salon.valid.vk(v); }
  };
  Salon.btnLoading = function (btn, on, txt) {
    if (!btn) return;
    if (on) {
      if (!btn.classList.contains('is-loading')) btn.dataset._t = btn.innerHTML;
      btn.disabled = true;
      btn.classList.add('is-loading');
      btn.setAttribute('aria-busy', 'true');
      btn.innerHTML = '<span class="motion-loader" aria-hidden="true"><i></i><i></i><i></i></span>' +
        '<span class="motion-loading-text"></span>';
      btn.querySelector('.motion-loading-text').textContent = txt || 'Отправляем…';
    } else {
      btn.disabled = false;
      btn.classList.remove('is-loading');
      btn.removeAttribute('aria-busy');
      if (btn.dataset._t) btn.innerHTML = btn.dataset._t;
    }
  };

  /* Одометр: цифры «допечатываются» до значения. countTo(el, 79500, {suffix:' ₽'}) */
  Salon.countTo = function (el, target, opts) {
    opts = opts || {};
    var suffix = opts.suffix != null ? opts.suffix : '';
    var prefix = opts.prefix != null ? opts.prefix : '';
    function put(n) { el.textContent = prefix + Math.round(n).toLocaleString('ru-RU') + suffix; }
    if (reduceMotion || opts.instant) { el.dataset.cur = String(target); put(target); return; }
    var from = parseFloat(el.dataset.cur || '0') || 0;
    el.dataset.cur = String(target);
    var dur = opts.duration || 420, t0 = null;
    /* страховка от мёртвого rAF: финальное число встанет по таймеру,
       даже если анимация не сыграет ни одного кадра */
    var guard = setTimeout(function () {
      if (el.dataset.cur === String(target)) put(target);
    }, dur + 150);
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min((ts - t0) / dur, 1);
      var e = 1 - Math.pow(1 - p, 4);
      put(from + (target - from) * e);
      if (p < 1 && el.dataset.cur === String(target)) requestAnimationFrame(step);
      else clearTimeout(guard);
    }
    requestAnimationFrame(step);
  };

  /* Круглая печать-штемпель: SVG с текстом по окружности (наследует currentColor) */
  Salon.sealSVG = function (opts) {
    opts = opts || {};
    var ring = (opts.ring || 'ОТЧЁТ О ПРОВЕРКАХ · ДО ОПЛАТЫ · ').toUpperCase();
    var center = opts.center || '¶';
    var size = opts.size || 116;
    var id = 'sealp' + Math.abs((ring + center).split('').reduce(function (a, c) { return (a * 31 + c.charCodeAt(0)) | 0; }, 7));
    var label = ring.replace(/"/g, '').replace(/\s*·\s*$/, '').replace(/\s*·\s*/g, ', ');
    return '<svg class="seal press ' + (opts.cls || 'seal--verify') + '" width="' + size + '" height="' + size + '" viewBox="0 0 120 120" role="img" aria-label="Печать: ' + label + '">' +
      '<defs><path id="' + id + '" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0"/></defs>' +
      '<circle cx="60" cy="60" r="56" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
      '<circle cx="60" cy="60" r="33" fill="none" stroke="currentColor" stroke-width="1"/>' +
      '<text style="font:600 10.5px \'Golos Text\',sans-serif;letter-spacing:.22em" fill="currentColor"><textPath href="#' + id + '">' + ring + '</textPath></text>' +
      '<text x="60" y="61" text-anchor="middle" dominant-baseline="central" style="font:500 26px \'Literata\',serif" fill="currentColor">' + center + '</text>' +
      '</svg>';
  };

  /* ---------------- Скип-линк + #main ---------------- */
  (function () {
    var main = document.querySelector('main') || document.querySelector('section');
    if (main && !main.id) main.id = 'main';
    var skip = document.querySelector('.skip-link, .workspace-skip-link');
    if (main && !skip) {
      skip = document.createElement('a');
      skip.className = 'skip-link'; skip.href = '#' + main.id; skip.textContent = 'К содержанию';
      document.body.insertBefore(skip, document.body.firstChild);
    }
    if (skip && skip.parentNode === document.body && document.body.firstChild !== skip) {
      document.body.insertBefore(skip, document.body.firstChild);
    }
  })();
  function insertChromeAfterSkip(node) {
    var skip = document.querySelector('.skip-link, .workspace-skip-link');
    if (skip && skip.parentNode === document.body) {
      if (document.body.firstChild !== skip) document.body.insertBefore(skip, document.body.firstChild);
      document.body.insertBefore(node, skip.nextSibling);
      return;
    }
    document.body.insertBefore(node, document.body.firstChild);
  }

  /* ---------------- Колонтитул (шапка) ----------------
     ОДНА шапка на всех страницах, включая главную: те же ссылки,
     тот же порядок — читатель никогда не теряется. */
  var here = (location.pathname.split('/').pop() || 'index.html') || 'index.html';
  document.body.classList.add('concept-shell');
  /* Верхний уровень отвечает только на четыре вопроса первого обращения.
     Лояльность и способы расчёта остаются в меню и кабинете после ценности. */
  var NAV = [
    { href: 'services.html',  label: 'Услуги' },
    { href: 'tariffs.html',   label: 'Цены' },
    { href: 'knowledge.html', label: 'Библиотека' },
    { href: 'prolog.html',     label: 'Как работаем' }
  ];
  /* Один и тот же объект проходит от ориентации к живому делу. */
  var ROUTE = [
    { href: '/#caseHeroTitle',    label: 'Показать ситуацию', note: 'без контакта' },
    { href: 'configurator.html',  label: 'Получить рекомендацию', note: 'с основанием' },
    { href: 'dashboard.html',     label: 'Продолжить дело', note: 'версии и следующий шаг' }
  ];
  var QUICK = [
    { href: '/#caseHeroTitle', no: '01', label: 'Открыть дело исследования', note: 'Один следующий шаг · без телефона', main: true },
    { href: 'tools.html', no: '02', label: 'Проверить самостоятельно', note: 'Тема, текст, источники и требования' },
    { href: 'knowledge.html', no: '03', label: 'Найти инструкцию к этапу', note: 'От темы до защиты' },
    { href: 'dashboard.html', no: '04', label: 'Продолжить своё дело', note: 'Статус, версии и переписка' }
  ];
  /* Путеводитель: разделы сгруппированы по смыслу, у каждого — подсказка */
  var GROUPS = [
    { t: 'Заказ', items: [
      ['configurator.html', 'Подобрать помощь', 'состав и ориентир за минуту'],
      ['komissiya-0.html', 'Комиссия №0', 'репетиция защиты · независимый Оппонент'],
      ['tariffs.html', 'Цены и каталог услуг', 'результаты и ориентиры'],
      ['vedenie.html', 'Форматы сопровождения', 'Письменный разбор · Редактура · Сопровождение'],
      ['oplata.html', 'Как проходит оплата', '50/50 · 30/40/30 · чеки'],
      ['plan.html', 'Разбор плана', '3 000 ₽, зачтётся в оплату'],
      ['razbor-zamechaniy-nauchruka.html', 'Разбор замечаний научрука', 'порядок исправлений · от 2 500 ₽'],
      ['normokontrol-vkr.html', 'Нормоконтроль по методичке', 'оформление · от 5 000 ₽'],
      ['gift.html', 'Подарочный сертификат', 'помощь в подарок']
    ]},
    { t: 'Доверие', items: [
      ['about.html', 'О мастерской и редакции', 'кто отвечает · авторство · источники'],
      ['guarantees.html', 'Гарантии · устав', '7 статей с опорой на закон'],
      ['reviews.html', 'Отзывы · живые истории', 'скрины и живые истории'],
      ['priyomnaya.html', 'Открытая приёмная', 'спросить анонимно'],
      ['check.html', 'Проверка текста', 'бесплатный сервис'],
      ['requisites.html', 'Реквизиты', 'ИНН открыт — проверяйте']
    ]},
    { t: 'Бесплатные инструменты', items: [
      ['proverka-istochnikov-vkr.html', 'Проверить DOI и источники', 'Crossref · до 20 DOI'],
      ['audit-temy-vkr.html', 'Проверить тему ВКР', 'цель · объект · данные · задачи'],
      ['check.html', 'Проверить стиль текста', 'канцелярит · ритм · ясность']
    ]},
    { t: 'Клуб и материалы', items: [
      ['referral.html', 'Клуб и бонусы', 'кэшбэк и рефералка'],
      ['dashboard.html#plus', 'Подписка «Салон+»', 'скидки · приоритет · полка'],
      ['knowledge.html', 'Полезные материалы', 'гайды по учёбе и защите']
    ]},
    { t: 'Кабинет', items: [
      ['dashboard.html', 'Личный кабинет', 'дела, статусы, переписка']
    ]}
  ];
  /* Живой поиск путеводителя: любая страница сайта — в две буквы.
     [href, подпись, теги-синонимы] — теги в нижнем регистре. */
  var SEARCH = [
    ['about.html', 'О мастерской, редакции и авторах', 'кто отвечает автор редактор издатель семенов редакционная политика'],
    ['prolog.html', 'Как устроена мастерская', 'процесс этапы приёмная спецификация редактура приёмка'],
    ['start.html', 'С чего начать — короткий маршрут', 'новичок карта маршрут впервые гид путеводитель цена срок'],
    ['services.html', 'Все услуги', 'каталог задачи редактура консультация сопровождение'],
    ['komissiya-0.html', 'Комиссия №0', 'частная предзащита оппонент протокол вопрос защита ии черновик'],
    ['tools.html', 'Бесплатные инструменты', 'проверка текст тема источники самостоятельная работа'],
    ['deposit.html', 'Депозит мастерской', 'аванс пополнение баланс бонус возврат'],
    ['configurator.html', 'Подобрать помощь', 'смета цена калькулятор заявка заказать'],
    ['tariffs.html', 'Цены и каталог услуг', 'прайс стоимость сколько стоит картотека формуляр'],
    ['vedenie.html', 'Форматы сопровождения', 'диагностика редактура сопровождение тариф'],
    ['oplata.html', 'Как проходит оплата', 'деньги оплатить рассрочка предоплата этапы чек касса возврат'],
    ['oplata.html#zaruchku', 'Первый платёж — за ручку, по шагам', 'оплата как платить кнопка что нажать инструкция пошагово'],
    ['specifikaciya.html', 'Спецификация заказа — что это + образец', 'спецификация договор документ условия pdf образец'],
    ['https://akademsalon.ru/api/pamyatka/welcome', 'Памятка новичка — путеводитель (PDF)', 'памятка новичок путеводитель pdf правила'],
    ['plan.html', 'Разбор плана', 'план структура старт'],
    ['razbor-zamechaniy-nauchruka.html', 'Разбор замечаний научного руководителя', 'научрук замечания комментарии правки черновик разбор'],
    ['normokontrol-vkr.html', 'Нормоконтроль ВКР и курсовой', 'нормоконтроль гост методичка оформление поля таблицы ссылки'],
    ['proverka-istochnikov-vkr.html', 'Бесплатная проверка DOI и источников', 'doi crossref источник литература ссылка выдуманная нейросеть проверить'],
    ['audit-temy-vkr.html', 'Бесплатная проверка темы ВКР', 'тема цель объект предмет задачи данные паспорт исследование аудит'],
    ['redaktura-posle-ii.html', 'Редактура текста после ИИ', 'chatgpt чатгпт нейросеть факты источники логика редактура проверить'],
    ['dorabotka-otcheta-po-praktike.html', 'Доработка отчёта по практике', 'практика исправить замечания дневник отчет повторная сдача'],
    ['gift.html', 'Подарочный сертификат', 'подарок подарить код'],
    ['guarantees.html', 'Гарантии · устав мастерской', 'гарантия закон возврат договор правки антиплагиат скептик'],
    ['reviews.html', 'Отзывы', 'отзыв истории скрины переписки'],
    ['priyomnaya.html', 'Открытая приёмная', 'вопрос анонимно спросить faq'],
    ['check.html', 'Проверка текста', 'антиплагиат ии нейросеть канцелярит проверить'],
    ['referral.html', 'Клуб и бонусы', 'реферал бонус кэшбэк скидка друг'],
    ['knowledge.html', 'Полезные материалы — все гайды', 'база знаний статьи гайды'],
    ['dashboard.html', 'Личный кабинет', 'вход дело статус заказы кабинет'],
    ['/', 'Главная', 'главная начало'],
    ['avtorskiy-zakaz.html', 'Авторский текст вне аттестации', 'статья речь сценарий отчет бизнес авторский заказ права'],
    ['kursovaya-rabota.html', 'Курсовая работа — услуга', 'курсовая курсач'],
    ['diplomnaya-rabota.html', 'Дипломная / ВКР — услуга', 'диплом вкр выпускная'],
    ['magisterskaya-dissertaciya.html', 'Магистерская диссертация — услуга', 'магистратура магистерская'],
    ['kandidatskaya-dissertaciya.html', 'Кандидатская — услуга', 'аспирантура кандидатская диссертация'],
    ['otchet-po-praktike.html', 'Отчёт по практике — услуга', 'практика дневник характеристика'],
    ['nauchnaya-statya.html', 'Научная статья — услуга', 'ринц вак scopus скопус публикация статья'],
    ['referat.html', 'Реферат, эссе, контрольная — услуга', 'реферат эссе контрольная доклад'],
    ['kursovaya-po-ekonomike.html', 'Курсовая по экономике', 'экономика'],
    ['kursovaya-po-informatike.html', 'Курсовая по информатике', 'информатика программирование код it'],
    ['kursovaya-po-menedzhmentu.html', 'Курсовая по менеджменту', 'менеджмент управление'],
    ['kursovaya-po-pedagogike.html', 'Курсовая по педагогике', 'педагогика фгос'],
    ['kursovaya-po-psihologii.html', 'Курсовая по психологии', 'психология'],
    ['kursovaya-po-yurisprudencii.html', 'Курсовая по юриспруденции', 'юриспруденция право'],
    ['diplomnaya-po-ekonomike.html', 'Диплом по экономике', 'экономика вкр'],
    ['diplomnaya-po-psihologii.html', 'Диплом по психологии', 'психология вкр'],
    ['diplomnaya-po-yurisprudencii.html', 'Диплом по юриспруденции', 'право юрфак вкр'],
    ['guide-zashchita-diploma.html', 'Гайд · защита диплома', 'защита комиссия доклад'],
    ['guide-rech-na-zashchitu.html', 'Гайд · речь на защиту', 'речь доклад выступление'],
    ['guide-prezentaciya-k-zashchite.html', 'Гайд · презентация к защите', 'презентация слайды'],
    ['guide-normocontrol.html', 'Гайд · нормоконтроль', 'нормоконтроль гост оформление'],
    ['guide-antiplagiat-ai.html', 'Гайд · антиплагиат и ИИ', 'антиплагиат оригинальность ии детектор'],
    ['guide-spisok-literatury.html', 'Гайд · список литературы', 'литература список источники гост'],
    ['guide-titulnyj-list.html', 'Гайд · титульный лист', 'титульник титульный'],
    ['guide-vvedenie-kursovoy.html', 'Гайд · введение курсовой', 'введение актуальность'],
    ['guide-obekt-predmet-cel-zadachi.html', 'Гайд · объект, предмет, цель и задачи', 'объект предмет цель задачи методология введение'],
    ['guide-zaklyuchenie-kursovoy.html', 'Гайд · заключение курсовой', 'заключение курсовой выводы'],
    ['guide-prakticheskaya-chast-kursovoy.html', 'Гайд · практическая часть курсовой', 'практическая часть анализ данные эмпирика исследование'],
    ['guide-otzyv-rukovoditelya-vkr.html', 'Гайд · отзыв научного руководителя', 'отзыв руководителя научрук образец'],
    ['dosie-nauchruka.html', 'Досье научного руководителя — как мы его читаем', 'досье научрук руководитель подход защита вопросы'],
    ['guide-prilozheniya-po-gost.html', 'Гайд · приложения по ГОСТ', 'приложения оформление буквы нумерация'],
    ['guide-vkr-struktura.html', 'Гайд · введение и структура ВКР', 'структура введение вкр'],
    ['guide-zaklyuchenie-vkr.html', 'Гайд · заключение работы', 'заключение выводы'],
    ['guide-temy-vkr.html', 'Гайд · темы ВКР, 50 примеров', 'тема темы выбрать'],
    ['guide-kursovaya-za-nedelyu.html', 'Гайд · курсовая за неделю', 'срочно неделя быстро'],
    ['guide-skolko-stoit-diplomnaya.html', 'Гайд · сколько стоит диплом', 'цена диплом стоимость'],
    ['guide-skolko-stoit-kursovaya.html', 'Гайд · сколько стоит курсовая', 'цена курсовая стоимость'],
    ['guide-otchet-po-praktike.html', 'Гайд · отчёт по практике', 'практика отчёт'],
    ['guide-dnevnik-praktiki.html', 'Гайд · дневник практики', 'дневник практика'],
    ['guide-harakteristika-s-praktiki.html', 'Гайд · характеристика с практики', 'характеристика'],
    ['guide-recenziya-na-vkr.html', 'Гайд · рецензия на ВКР', 'рецензия'],
    ['guide-rinc-statya.html', 'Гайд · статья РИНЦ', 'ринц публикация журнал'],
    ['guide-apellyaciya.html', 'Гайд · апелляция на оценку', 'апелляция пересдача оценка'],
    ['oferta.html', 'Публичная оферта', 'договор оферта условия'],
    ['privacy.html', 'Политика персональных данных', 'политика данные приватность'],
    ['refunds.html', 'Отказ и возврат', 'возврат отказаться деньги претензия'],
    ['academic-integrity.html', 'Границы услуг', 'академическая добросовестность запрет'],
    ['consent-analytics.html', 'Согласие на аналитику', 'аналитика метрика согласие'],
    ['consent-marketing.html', 'Согласие на рекламу', 'реклама рассылка согласие'],
    ['consent-publication.html', 'Согласие на публикацию', 'отзыв публикация распространение'],
    ['consent-request.html', 'Согласие для заявки', 'согласие заявка данные'],
    ['consent.html', 'Согласие для программы лояльности', 'согласие бонусы лояльность'],
    ['loyalty.html', 'Правила лояльности', 'бонусы правила подписка'],
    ['terms.html', 'Пользовательское соглашение', 'соглашение'],
    ['requisites.html', 'Реквизиты исполнителя', 'инн самозанятый реквизиты']
  ];
  var DOCS = [
    ['oferta.html', 'Публичная оферта'],
    ['privacy.html', 'Политика ПДн'],
    ['consent-request.html', 'Согласие для заявки'],
    ['consent.html', 'Согласие для программы лояльности'],
    ['loyalty.html', 'Правила лояльности'],
    ['terms.html', 'Пользовательское соглашение'],
    ['requisites.html', 'Реквизиты']
  ];

  /* Данные навигации наружу: их использует polish15-chrome.js, который
     строит диалоги «Навигация» и «Поиск» вместо старого оглавления.
     Единственный источник правды остаётся здесь — дублировать списки нельзя. */
  Salon.navData = {
    NAV: NAV, ROUTE: ROUTE, QUICK: QUICK,
    GROUPS: GROUPS, DOCS: DOCS, SEARCH: SEARCH
  };
  /* Знак мастерской встроенным SVG: только так он читает токены темы
     (--wax-cta для диска, --paper для букв) и меняется вместе с ней.
     Файл assets/img/logo-mark.svg остаётся для og/иконок. */
  function brandMarkSVG() {
    return '<svg class="brand__mark" width="44" height="44" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny-ps" viewBox="0 0 512 512"> <circle cx="256" cy="256" r="208" fill="var(--wax-deep)"/> <circle cx="256" cy="256" r="196" fill="var(--wax-cta,var(--wax))"/> <circle cx="256" cy="256" r="172" fill="none" stroke="var(--wax-bright,var(--wax))" stroke-width="3"/> <path d="M257.5969423210563 311.22168172341907H197.43293954134816V305.1507991660876Q201.63585823488535 304.8394718554552 207.31758165392634 303.63307852675473Q212.99930507296733 302.4266851980542 212.99930507296733 300.636553161918Q212.99930507296733 300.01389854065326 212.8825573314802 299.23558026407227Q212.76580958999307 298.45726198749134 212.2209867963864 297.13412091730373L202.80333564975678 274.25156358582353H164.66574009728978Q163.34259902710215 277.44266851980547 161.7470465601112 281.72341904100074Q160.15149409312022 286.004169562196 158.9840166782488 289.3509381514941Q157.50521195274496 293.7095205003475 157.23280055594162 295.6553161917999Q156.9603891591383 297.60111188325226 156.9603891591383 298.37943015983325Q156.9603891591383 300.87004864489234 160.73523280055593 302.6212647671995Q164.51007644197358 304.3724808895066 173.30507296733845 305.1507991660876V311.22168172341907H128.00694927032663V305.1507991660876Q130.57539958304378 304.9951355107714 133.80542043085478 304.3335649756776Q137.03544127866576 303.6719944405838 138.90340514246006 302.50451702571235Q142.09451007644196 300.636553161918 144.3127171646977 297.91243919388467Q146.53092425295344 295.1883252258513 148.00972897845728 291.4523974982627Q157.03822098679638 269.58165392633776 166.10562890896455 247.63307852675473Q175.17303683113272 225.68450312717167 186.14732453092427 199.22168172341907H201.71369006254344Q216.96872828353025 236.73662265462127 225.6080611535789 258.52953439888813Q234.24739402362752 280.322446143155 240.318276580959 294.64350243224465Q241.33009034051426 296.9784572619875 242.88672689367615 298.8853370396108Q244.44336344683808 300.7922168172342 247.32314107018766 302.50451702571235Q249.50243224461434 303.74982626824186 252.38220986796387 304.3724808895066Q255.26198749131342 304.9951355107714 257.5969423210563 305.1507991660876ZM199.61223071577484 266.546212647672 183.5788742182071 226.54065323141072 167.77901320361363 266.546212647672Z" fill="var(--paper)"/> <path d="M335.3481584433635 314.17929117442674Q323.2063933287005 314.17929117442674 312.6212647671995 310.24878387769286Q302.0361362056984 306.31827658095904 294.1751216122307 298.84642112578183Q286.46977067407926 291.5302293259208 282.03335649756775 280.75052119527453Q277.5969423210563 269.97081306462826 277.5969423210563 257.0507296733843Q277.5969423210563 244.20847810979848 282.07227241139685 233.273106323836Q286.54760250173734 222.33773453787353 294.6421125781793 214.32105628908965Q302.5809589993051 206.46004169562198 313.7109103544128 202.14037526059764Q324.84086170952054 197.82070882557332 337.5274496177902 197.82070882557332Q346.7116052814455 197.82070882557332 354.2612925642808 200.03891591382904Q361.8109798471161 202.2571230020848 367.0257123002085 205.05906879777626L371.85128561501045 200.778318276581H378.6226546212648L379.32314107018766 241.09520500347466H372.4739402362752Q366.6365531619181 222.64906184850594 358.46421125781796 214.0097289784573Q350.2918693537179 205.37039610840864 338.53926337734543 205.37039610840864Q323.9068797776234 205.37039610840864 316.27936066713 218.25156358582353Q308.6518415566366 231.1327310632384 308.6518415566366 254.40444753300906Q308.6518415566366 267.55802640722726 311.2592077831828 276.85892981236975Q313.866574009729 286.1598332175122 318.0694927032662 291.8415566365532Q322.58373870743577 297.7567755385685 328.7324530924253 300.5198054204309Q334.8811674774149 303.2828353022933 342.3530229325921 303.2828353022933Q353.2494788047255 303.2828353022933 361.77206393328703 297.367616400278Q370.29464906184853 291.4523974982627 377.2995135510772 279.4662960389159L383.9930507296734 283.5135510771369Q380.6462821403753 290.3627519110494 376.36553161918005 295.77206393328703Q372.0847810979848 301.1813759555247 366.48088950660184 305.07296733842946Q360.3321751216123 309.35371785962474 352.89923558026413 311.76650451702574Q345.46629603891597 314.17929117442674 335.3481584433635 314.17929117442674Z" fill="var(--paper)"/> </svg>';
  }



  function brandHTML() {
    return '<a class="brand brand--wordmark" href="/" aria-label="Академический Салон — редакторская мастерская. На главную">' +
      brandMarkSVG() +
      '<span class="b-lockup brand__name"><strong class="b-full">Академический Салон</strong>' +
      '<strong class="b-short">Академсалон</strong>' +
      '<small class="brand__motto"><span class="brand__motto-default">Редакторская мастерская</span></small></span>' +
      '<span class="visually-hidden"> — на главную</span></a>';
  }

  function mobileMeta() {
    if (here === 'index.html') {
      return { title: 'Академический Салон', kicker: 'Редакторская мастерская' };
    }
    var fixed = {
      'services.html': ['Услуги', 'Основное'],
      'tariffs.html': ['Цены', 'Основное'],
      'komissiya-0.html': ['Комиссия №0', 'Репетиция защиты'],
      'knowledge.html': ['Библиотека', 'Материалы'],
      'tools.html': ['Инструменты', 'Материалы'],
      'dashboard.html': ['Личный кабинет', 'Кабинет'],
      'start.html': ['Новая заявка', 'Заказ'],
      'configurator.html': ['Подбор помощи', 'Мастерская'],
      'zayavka.html': ['Заявка', 'Заказ'],
      'specifikaciya.html': ['Спецификация', 'Заказ'],
      'oplata.html': ['Как проходит оплата', 'Заказ'],
      'oplaceno.html': ['Проверка оплаты', 'Заказ'],
      'vedenie.html': ['Форматы помощи', 'Основное'],
      'about.html': ['О мастерской', 'Доверие'],
      'guarantees.html': ['Гарантии', 'Доверие'],
      'reviews.html': ['Отзывы', 'Доверие'],
      'priyomnaya.html': ['Приёмная', 'Доверие'],
      'prolog.html': ['Как устроена мастерская', 'Доверие'],
      'referral.html': ['Клуб Салона', 'Выгоды'],
      'plus.html': ['Абонемент «Салон+»', 'Выгоды'],
      'deposit.html': ['Депозит мастерской', 'Выгоды'],
      'gift.html': ['Подарочный сертификат', 'Выгоды'],
      '404.html': ['Страница не найдена', 'Системные'],
      '50x.html': ['Сервис недоступен', 'Системные'],
      'maintenance.html': ['Технические работы', 'Системные'],
      'expertise.html': ['Раздел перенесён', 'Системные']
    };
    if (fixed[here]) return { title: fixed[here][0], kicker: fixed[here][1] };
    var slug = here.replace(/\.html$/, '');
    var legal = ['privacy', 'terms', 'oferta', 'academic-integrity', 'refunds', 'requisites',
      'consent-request', 'consent-analytics', 'consent-marketing', 'consent-publication',
      'consent', 'loyalty'];
    var toolsPages = ['check', 'audit-temy-vkr', 'proverka-istochnikov-vkr', 'dosie-nauchruka'];
    var disciplines = ['kursovaya-po-ekonomike', 'kursovaya-po-informatike',
      'kursovaya-po-menedzhmentu', 'kursovaya-po-pedagogike', 'kursovaya-po-psihologii',
      'kursovaya-po-yurisprudencii', 'diplomnaya-po-ekonomike', 'diplomnaya-po-psihologii',
      'diplomnaya-po-yurisprudencii'];
    var services = ['avtorskiy-zakaz', 'diplomnaya-rabota', 'dorabotka-otcheta-po-praktike',
      'kandidatskaya-dissertaciya', 'kursovaya-rabota', 'magisterskaya-dissertaciya',
      'nauchnaya-statya', 'normokontrol-vkr', 'otchet-po-praktike', 'plan',
      'razbor-zamechaniy-nauchruka', 'redaktura-posle-ii', 'referat'];
    var heading = document.querySelector('main h1, body > h1, h1');
    var title = heading ? heading.textContent.replace(/\s+/g, ' ').trim()
      : document.title.split(/\s+[—|]\s+/)[0].trim();
    var kicker = 'Академический Салон';
    if (/^guide-/.test(slug)) kicker = 'Статьи';
    else if (legal.indexOf(slug) !== -1) kicker = 'Документы';
    else if (toolsPages.indexOf(slug) !== -1) kicker = 'Инструменты';
    else if (disciplines.indexOf(slug) !== -1) kicker = 'Услуги по направлениям';
    else if (services.indexOf(slug) !== -1) kicker = 'Услуги';
    return { title: title, kicker: kicker };
  }

  function headerNavigationHTML() {
    return '<nav class="primary-nav header-navigation" aria-label="Основная навигация">' +
      '<div class="header-nav-group">' +
        '<button class="header-nav-trigger" type="button" aria-expanded="false" aria-controls="headerHelpMenu" data-header-menu-trigger>' +
          '<span>С чем помочь</span><i aria-hidden="true"></i></button>' +
        '<div class="header-nav-popover header-nav-popover--help" id="headerHelpMenu" data-header-menu aria-hidden="true">' +
          '<div class="header-nav-popover__intro"><span>С чего начнём</span><strong>Где остановилась работа?</strong><small>Не нужен идеальный запрос — выберите ближайшую ситуацию.</small></div>' +
          '<div class="header-nav-popover__grid">' +
            '<a href="/configurator.html?situation=topic&amp;route=header"><span>01</span><strong>Пока есть только тема</strong><small>Проверить масштаб темы и собрать логику глав</small></a>' +
            '<a href="/configurator.html?situation=draft&amp;route=header"><span>02</span><strong>Черновик уже есть</strong><small>Найти провалы в логике и объяснить правки</small></a>' +
            '<a href="/configurator.html?situation=comments&amp;route=header"><span>03</span><strong>Пришли замечания</strong><small>Понять, что критично и с чего начать</small></a>' +
            '<a href="/configurator.html?situation=defense&amp;route=header"><span>04</span><strong>До защиты мало времени</strong><small>Сверить речь, презентацию и вопросы комиссии</small></a>' +
          '</div>' +
          '<div class="header-nav-popover__aside" aria-label="Дополнительные разделы">' +
            '<a href="/services.html">Все форматы помощи <span aria-hidden="true">→</span></a>' +
            '<a href="/tariffs.html">Цены и условия <span aria-hidden="true">→</span></a>' +
            '<a href="/prolog.html">Как проходит работа <span aria-hidden="true">→</span></a>' +
            '<a href="/guarantees.html">Границы помощи <span aria-hidden="true">→</span></a>' +
          '</div>' +
          '<a class="header-nav-popover__foot" href="/tools.html"><span>Хотите сначала разобраться сами?</span><strong>Бесплатные гайды и инструменты</strong><i aria-hidden="true">↗</i></a>' +
        '</div>' +
      '</div>' +
      '<a class="header-nav-direct" href="/tariffs.html">Цены</a>' +
      '<a class="header-nav-direct header-nav-direct--reviews" href="/reviews.html">Отзывы</a>' +
      '<div class="header-nav-group">' +
        '<button class="header-nav-trigger" type="button" aria-expanded="false" aria-controls="headerUsefulMenu" data-header-menu-trigger>' +
          '<span>Полезное</span><i aria-hidden="true"></i></button>' +
        '<div class="header-nav-popover header-nav-popover--useful" id="headerUsefulMenu" data-header-menu aria-hidden="true">' +
          '<div class="header-nav-popover__intro"><span>Гайды и инструменты</span><strong>Проверить самостоятельно</strong><small>Тема, текст, источники и подготовка к защите.</small></div>' +
          '<div class="header-nav-popover__grid">' +
            '<a href="/audit-temy-vkr.html"><span>01</span><strong>Проверить тему</strong><small>Формулировка, цель, объект и задачи</small></a>' +
            '<a href="/check.html"><span>02</span><strong>Проверить текст</strong><small>Ясность, стиль и сложные фрагменты</small></a>' +
            '<a href="/proverka-istochnikov-vkr.html"><span>03</span><strong>Проверить источники</strong><small>DOI, ссылки и происхождение материалов</small></a>' +
            '<a href="/guide-rech-na-zashchitu.html"><span>04</span><strong>Подготовиться к защите</strong><small>Речь, презентация и вопросы комиссии</small></a>' +
          '</div>' +
          '<div class="header-nav-popover__aside">' +
            '<a href="/tools.html">Все инструменты <span aria-hidden="true">→</span></a>' +
            '<a href="/knowledge.html">Все статьи <span aria-hidden="true">→</span></a>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</nav>';
  }

  /* Контекст страницы становится частью одного «Дела исследования».
     В URL уходят только коды маршрута — без текста, контактов и файлов. */
  function caseRoute(work, situation, result) {
    var allowedWork = ['diplom','master','chapter','kandidat','course','course_emp',
      'practice','vak','scopus','rinc','self'];
    var allowedSituation = ['topic','draft','comments','defense'];
    var allowedResult = ['diagnostic','editing','formatting','defense','support',
      'recommendation','tutoring','ai_editing'];
    work = allowedWork.indexOf(work) >= 0 ? work : '';
    situation = allowedSituation.indexOf(situation) >= 0 ? situation : '';
    result = allowedResult.indexOf(result) >= 0 ? result : '';
    var params = new URLSearchParams();
    if (work) params.set('work', work);
    if (situation) params.set('situation', situation);
    if (result) params.set('result', result);
    var service = result === 'tutoring' ? 'tu'
      : result === 'ai_editing' ? 'ai'
      : result === 'formatting' ? 'nm'
      : result === 'defense' ? 'df'
      : result === 'diagnostic' && situation === 'topic' ? 'pl'
      : result === 'diagnostic' && work === 'kandidat' ? ''
      : result === 'diagnostic' ? 'rv' : '';
    if (service) params.set('service', service);
    params.set('route', 'page');
    return 'configurator.html?' + params.toString();
  }
  function guideWorkType(slug) {
    if (/scopus|web-of-science/.test(slug)) return 'scopus';
    if (/(?:^|-)vak(?:-|$)/.test(slug)) return 'vak';
    if (/(?:^|-)rinc(?:-|$)/.test(slug)) return 'rinc';
    /* «Практическая часть курсовой» содержит praktik, поэтому курс проверяем первым. */
    if (/kursov/.test(slug)) return 'course';
    if (/praktik/.test(slug)) return 'practice';
    if (/(?:^|-)statya(?:-|$)/.test(slug)) return 'rinc';
    return 'diplom';
  }
  function guideRouteProfile(slug) {
    var defense = /(zashchit|rech|prezent|vopros|doklad)/.test(slug);
    var formatting = /(normocontrol|gost|oform|spisok-literatury|titulnyj-list|prilozheniya)/.test(slug);
    var review = /(istochnik|ssylk|antiplagiat|proverk|plagiat)/.test(slug);
    return {
      work:guideWorkType(slug),
      defense:defense,
      formatting:formatting,
      review:review,
      stage:defense ? 4 : formatting || review ? 3 : 1,
      situation:defense ? 'defense' : formatting || review ? 'draft' : 'topic',
      result:defense ? 'defense' : formatting ? 'formatting' : 'diagnostic'
    };
  }
  function selfRouteFor(work, situation, result) {
    if (result === 'formatting') return 'guide-normocontrol.html';
    if (result === 'defense') return 'guide-rech-na-zashchitu.html';
    if (work === 'practice') return 'guide-otchet-po-praktike.html';
    if (work === 'rinc' || work === 'vak' || work === 'scopus') return 'guide-rinc-statya.html';
    if (work === 'course' || work === 'course_emp') return 'guide-vvedenie-kursovoy.html';
    if (work === 'self') return 'knowledge.html';
    if (situation === 'comments') return 'dosie-nauchruka.html';
    if (situation === 'draft') return 'check.html';
    return 'guide-obekt-predmet-cel-zadachi.html';
  }
  function pageCaseContext() {
    var slug = here.replace(/\.html$/, '');
    var dedicatedServiceRoutes = {
      'redaktura-posle-ii':['ai',3,'Проверить факты, логику и источники','check.html','Сначала проверить текст самостоятельно'],
      'avtorskiy-zakaz':['au',2,'Уточнить цель и режим прав','knowledge.html','Сначала уточнить формат самостоятельно']
    };
    var dedicated = dedicatedServiceRoutes[slug];
    if (dedicated) {
      return {
        stage:dedicated[1],
        title:dedicated[2],
        copy:'Страница уже уточнила специальный формат. В анкете услуги останутся только состав, исходные материалы и обязательные условия до контакта.',
        self:dedicated[3],
        selfLabel:dedicated[4],
        action:'configurator.html?service=' + dedicated[0],
        actionLabel:'Открыть этот маршрут'
      };
    }
    var serviceRoutes = {
      'kursovaya-rabota':['course','topic','support',2,'Курсовая как рабочий проект'],
      'diplomnaya-rabota':['diplom','topic','support',2,'ВКР как рабочий проект'],
      'magisterskaya-dissertaciya':['master','topic','support',2,'Магистерская как рабочий проект'],
      'nauchnaya-statya':['','draft','editing',3,'Рукопись к редакторской проверке'],
      'otchet-po-praktike':['practice','draft','editing',3,'Редактура отчёта на реальных материалах практики'],
      'dorabotka-otcheta-po-praktike':['practice','comments','diagnostic',3,'Письменный разбор замечаний к отчёту'],
      'kandidatskaya-dissertaciya':['kandidat','draft','diagnostic',3,'Письменный разбор диссертационного исследования'],
      'referat':['self','draft','editing',3,'Редактура реферата, эссе или контрольной'],
      'plan':['','topic','diagnostic',1,'Разобрать тему и план'],
      'razbor-zamechaniy-nauchruka':['','comments','diagnostic',3,'Разобрать замечания и определить порядок исправлений'],
      'normokontrol-vkr':['diplom','draft','formatting',3,'Сверить стабильную версию с методичкой']
    };
    var service = serviceRoutes[slug];
    if (service) {
      return {
        stage:service[3],
        title:service[4],
        copy:'Страница уже уточнила формат. Подтвердите точку старта — маршрут сохранит её и покажет состав, цену и основание рекомендации до контакта.',
        self:selfRouteFor(service[0],service[1],service[2]),
        selfLabel:'Сначала проверить самостоятельно',
        action:caseRoute(service[0],service[1],service[2]),
        actionLabel:'Открыть этот маршрут'
      };
    }
    if (slug === 'komissiya-0') {
      return {
        stage:4,
        title:'Проверить готовую версию до настоящей комиссии',
        copy:'Комиссия №0 уместна только для версии, которую уже можно оппонировать. Если содержание ещё меняется, маршрут сначала покажет более ранний шаг.',
        self:'guide-rech-na-zashchitu.html',
        selfLabel:'Сверить речь по чек-листу',
        action:'configurator.html?service=k0',
        actionLabel:'Открыть Комиссию №0'
      };
    }
    if (slug === 'check' || slug === 'proverka-istochnikov-vkr' ||
        slug === 'dosie-nauchruka' || slug === 'audit-temy-vkr') {
      var toolStage = slug === 'audit-temy-vkr' ? 1 : 3;
      var toolSituation = slug === 'audit-temy-vkr' ? 'topic'
        : slug === 'dosie-nauchruka' ? 'comments' : 'draft';
      return {
        stage:toolStage,
        title:'Перенести результат проверки в следующий шаг',
        copy:'Инструмент остаётся самостоятельным. Если нужна помощь редактора, в маршрут уйдёт только категория задачи — не введённый текст и не названия файлов.',
        self:'tools.html',
        selfLabel:'Другие бесплатные проверки',
        action:caseRoute('',toolSituation,'diagnostic'),
        actionLabel:'Показать следующий шаг'
      };
    }
    if (/^guide-/.test(slug)) {
      var guide = guideRouteProfile(slug);
      var guideSelf = guide.review ? 'tools.html'
        : selfRouteFor(guide.work,guide.situation,guide.result);
      var guideSelfLoop = guideSelf.replace(/\.html$/, '') === slug;
      if (guideSelfLoop) {
        guideSelf = guide.work === 'course' ? 'guide-obekt-predmet-cel-zadachi.html'
          : guide.defense ? 'guide-prezentaciya-k-zashchite.html'
          : 'tools.html';
      }
      return {
        stage:guide.stage,
        title:guide.defense ? 'Превратить подготовку в проверяемую репетицию'
          : guide.formatting ? 'Сверить оформление с требованиями'
          : guide.review ? 'Проверить материал по этому критерию'
          : 'Закрепить вывод и выбрать первый результат',
        copy:'Материал отвечает на один вопрос. Маршрут связывает этот вывод с подходящим инструментом или редакторским этапом — без повторного поиска по сайту.',
        self:guideSelf,
        selfLabel:guideSelfLoop ? 'Открыть следующий бесплатный инструмент'
          : guide.defense ? 'Открыть чек-лист защиты'
          : guide.formatting ? 'Сверить оформление самостоятельно'
          : guide.review ? 'Проверить самостоятельно' : 'Открыть самостоятельный протокол',
        action:caseRoute(guide.work,guide.situation,guide.result),
        actionLabel:'Показать следующий шаг'
      };
    }
    if (here === 'services.html' || here === 'tariffs.html') {
      return {
        stage:1,
        title:'Не выбирать услугу вслепую',
        copy:'Каталог нужен для проверки состава и цены. Основной вход — ваша ситуация: система предложит один первый результат и объяснит, почему он подходит.',
        self:'tools.html',
        selfLabel:'Начать самостоятельно',
        action:'configurator.html',
        actionLabel:'Подобрать помощь'
      };
    }
    if (here === 'knowledge.html' || here === 'tools.html') {
      return {
        stage:1,
        title:'Найти материал для текущего шага',
        copy:'Можно продолжить самостоятельно. Если понадобится редактор, общий маршрут отдельно уточнит точку старта и предложит следующий шаг.',
        self:here === 'knowledge.html' ? 'tools.html' : 'knowledge.html',
        selfLabel:here === 'knowledge.html' ? 'Открыть инструменты' : 'Открыть библиотеку',
        action:'configurator.html',
        actionLabel:'Уточнить следующий шаг'
      };
    }
    return null;
  }
  var currentCaseContext = pageCaseContext();

  /* Путеводитель строится от намерения, а не от структуры сайта:
     четыре быстрых входа, поиск, три шага новичка и тихий полный индекс. */
  function mountTOC() {
    if (document.querySelector('.toc')) return;
    var toc = document.createElement('div');
    toc.className = 'toc'; toc.id = 'toc';
    toc.setAttribute('role', 'dialog'); toc.setAttribute('aria-modal', 'true');
    toc.setAttribute('aria-labelledby', 'tocTitle'); toc.setAttribute('aria-hidden', 'true');
    var routeRow = ROUTE.map(function (r, i) {
      return '<a class="tr-step" href="' + r.href + '"><i>' + (i + 1) + '</i>' +
        '<span><b>' + r.label + '</b><small>' + r.note + '</small></span></a>';
    }).join('<span class="tr-arr" aria-hidden="true">→</span>');
    var quickRows = QUICK.map(function (q) {
      return '<a class="toc-choice' + (q.main ? ' is-main' : '') + '" href="' + q.href + '">' +
        '<span class="tch-no">' + q.no + '</span><span class="tch-copy"><b>' + q.label +
        '</b><small>' + q.note + '</small></span><span class="tch-go" aria-hidden="true">→</span></a>';
    }).join('');
    var rows = GROUPS.map(function (g) {
      return '<div class="toc-grp"><span class="toc-grp-t">' + g.t + '</span>' +
        g.items.map(function (it) {
          var cur = it[0] === here ? ' aria-current="page"' : '';
          return '<a class="dotrow" href="' + it[0] + '"' + cur + '><span>' + it[1] +
            '</span><span class="dots"></span><span class="dr-val">' + it[2] + '</span></a>';
        }).join('') + '</div>';
    }).join('');
    var docRows = DOCS.map(function (d) {
      return '<a href="' + d[0] + '">' + d[1] + '</a>';
    }).join('');
    toc.innerHTML = '<div class="toc-inner">' +
      '<div class="toc-head"><div><span class="toc-kicker">Академический Салон · меню</span>' +
        '<h2 class="toc-title" id="tocTitle">Куда вам сейчас?</h2><p>Выберите задачу или найдите нужное своими словами.</p></div>' +
        '<button class="toc-close" type="button" aria-label="Закрыть меню"><span aria-hidden="true">×</span></button></div>' +
      '<div class="toc-search"><span class="tcs-mark" aria-hidden="true">' + icoSearch() + '</span><input type="search" id="tocQ" autocomplete="off" ' +
        'placeholder="Например: курсовая, оплата, речь…" aria-label="Поиск по сайту" />' +
        '<kbd>⌘ K</kbd><div class="toc-sr" id="tocSR" hidden></div></div>' +
      '<div class="toc-appearance" data-toc-home role="group" aria-label="Оформление сайта">' +
        '<div class="toc-theme-row"><span class="ttr-lbl" data-theme-label>Светлая тема</span>' + Salon.themeToggleHTML() + '</div>' +
        '<div class="toc-theme-row"><span class="ttr-lbl" data-calm-label>Режим без анимаций</span>' + Salon.calmToggleHTML() + '</div>' +
      '</div>' +
      '<nav class="toc-choices" aria-label="Быстрый выбор" data-toc-home>' + quickRows + '</nav>' +
      '<section class="toc-route" id="tocRoute" data-toc-home><div class="tr-head"><span class="toc-grp-t">Впервые здесь</span>' +
        '<a href="start.html">Все шаги →</a></div><nav class="tr-steps" aria-label="Маршрут новичка">' + routeRow + '</nav></section>' +
      '<details class="toc-directory" data-toc-home><summary><span><b>Весь Салон</b><small>Услуги, гарантии, материалы и документы</small></span><i aria-hidden="true">+</i></summary>' +
        '<div class="toc-grid"><nav class="toc-primary" aria-label="Разделы сайта">' + rows + '</nav>' +
          '<div class="toc-side"><div><span class="toc-grp-t">Документы</span><nav class="toc-docs" aria-label="Правовые документы">' + docRows + '</nav></div>' +
          '</div></div></details>' +
      '<div class="toc-footbar" data-toc-home><button type="button" data-contact="1"><span>Нужен человек?</span><b>Связаться с мастером →</b></button>' +
        '<span>Без звонка и обязательств</span></div></div>';
    document.body.appendChild(toc);
    if (Salon.theme) Salon.theme.apply(Salon.theme.current(), false); /* синк подписи темы */

    function tocSiblings() {
      /* .tg-pill теперь ребёнок .mrail — прячем сами рельсы, иначе
         под открытым Путеводителем осталась бы висеть карточка */
      return ['.site-header', 'main', '.site-footer', '.mobile-cta', '.lasse',
              '.mrail', '.lrail', '.mledger', '.skip-link']
        .map(function (s) { return document.querySelector(s); }).filter(Boolean);
    }
    var tocScrollY = 0;
    var tocTrigger = null;
    var tocFocusTimer = 0;
    function setToc(open, trigger) {
      if (open === toc.classList.contains('open')) return;
      if (open) {
        tocScrollY = window.scrollY || window.pageYOffset || 0;
        tocTrigger = trigger || (document.activeElement && document.activeElement.closest
          ? document.activeElement.closest('.menu-toggle')
          : null);
        document.body.style.top = '-' + tocScrollY + 'px';
      }
      toc.classList.toggle('open', open);
      document.body.classList.toggle('toc-lock', open);
      document.body.classList.toggle('menu-lock', open);
      document.documentElement.classList.toggle('menu-lock', open);
      toc.setAttribute('aria-hidden', String(!open));
      if (open) {
        toc.scrollTop = 0;
        var initialFocus = toc.querySelector('.toc-close');
        if (initialFocus) initialFocus.focus();
      }
      tocSiblings().forEach(function (el) { if (open) el.setAttribute('inert', ''); else el.removeAttribute('inert'); });
      document.querySelectorAll('.menu-toggle').forEach(function (t) {
        t.setAttribute('aria-expanded', String(open));
        t.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
      });
      window.clearTimeout(tocFocusTimer);
      if (open) {
        tocFocusTimer = window.setTimeout(function () {
          var f = toc.querySelector('.toc-close');
          if (f) f.focus();
        }, 32);
      } else {
        document.body.style.top = '';
        window.scrollTo(0, tocScrollY);
        var returnFocus = tocTrigger || document.querySelector('.menu-toggle');
        if (returnFocus) returnFocus.focus();
        tocFocusTimer = window.setTimeout(function () {
          if (returnFocus) returnFocus.focus();
        }, 32);
      }
    }
    Salon.toc = { open: function (trigger) { setToc(true, trigger); }, close: function () { setToc(false); }, isOpen: function () { return toc.classList.contains('open'); } };
    /* страховочная петля Tab для браузеров без inert */
    toc.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var items = toc.querySelectorAll('button, a[href], input');
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    toc.querySelector('.toc-close').addEventListener('click', function () { setToc(false); });
    /* закрываем по переходу — но НЕ по клику на переключатель темы; ссылки
       поиска появляются позже — ловим кликом-делегатом */
    toc.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a[href]')) setToc(false);
      else if (e.target.closest && e.target.closest('[data-contact]')) setToc(false);
      else if (e.target === toc) setToc(false);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && toc.classList.contains('open')) setToc(false); });

    /* --- живой поиск: label+теги, топ-9, Enter открывает первый --- */
    (function () {
      var q = toc.querySelector('#tocQ'), sr = toc.querySelector('#tocSR');
      var home = toc.querySelectorAll('[data-toc-home]');
      if (!q || !sr) return;
      function showHome(show) {
        for (var h = 0; h < home.length; h++) home[h].hidden = !show;
      }
      function draw() {
        var v = (q.value || '').trim().toLowerCase();
        if (v.length < 2) {
          sr.hidden = true; sr.innerHTML = '';
          showHome(true);
          return;
        }
        var hits = [];
        for (var i = 0; i < SEARCH.length && hits.length < 9; i++) {
          var s = SEARCH[i];
          if ((s[1] + ' ' + s[2]).toLowerCase().indexOf(v) >= 0) hits.push(s);
        }
        sr.innerHTML = hits.length
          ? hits.map(function (s) {
              return '<a class="dotrow" href="' + s[0] + '"><span>' + s[1] +
                '</span><span class="dots"></span><span class="dr-val">→</span></a>';
            }).join('')
          : '<p class="toc-sr-none">Ничего не нашлось. Напишите нам — найдём вместе: ' +
            '<a class="link" href="' + LINKS.human + '" target="_blank" rel="noopener">@academicsaloon</a> · ' +
            '<a class="link" href="priyomnaya.html">анонимно в приёмную</a></p>';
        sr.hidden = false; showHome(false);
      }
      q.addEventListener('input', draw);
      q.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          var a = sr.querySelector('a.dotrow');
          if (a) { setToc(false); location.href = a.getAttribute('href'); }
        } else if (e.key === 'Escape' && q.value) {
          e.stopPropagation(); q.value = ''; draw();
        }
      });
      document.addEventListener('keydown', function (e) {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          if (document.querySelector('.cart-shell.open,.contact-sheet.open,.sdlg.open,.tour-veil')) return;
          if (!toc.classList.contains('open')) setToc(true);
          q.focus();
        }
      });
    })();

    /* бейдж заказов на пункте «Личный кабинет» — из общей с ботом базы */
    (function () {
      var kab = toc.querySelector('a[href="dashboard.html"] span');
      if (!kab || !Salon.api || !Salon.api.identified()) return;
      var g = Salon.api.guestTokens();
      Salon.api.get('/orders', g.length ? { 'X-Order-Tokens': g.join(',') } : {}).then(function (r) {
        if (!r.ok || !r.orders || !r.orders.length) return;
        var un = r.orders.reduce(function (s, o) { return s + (o.unread || 0); }, 0);
        kab.textContent = 'Личный кабинет · ' + r.orders.length + (un ? ' · ' + un + ' нов.' : '');
      });
    })();
  }

  /* Единая шапка для ВСЕХ страниц (и главной тоже):
     бренд · Цены · Гарантии · Отзывы · Клуб · Полезные материалы · тема · «Рассчитать» · «Меню».
     На главной «Рассчитать» ведёт к смете на странице, дальше — в конфигуратор. */
  /* админка — рабочий стол мастера: маркетинговый каркас сайта там ни к чему */
  var CHROME_OFF = here === 'admin.html' || here === 'admin-mock.html';
  if (!CHROME_OFF && !document.querySelector('.site-header')) {
    var header = document.createElement('header');
    var accountChrome = document.body.classList.contains('is-account-route');
    header.className = 'site-header' + (accountChrome ? ' site-header--account' : '');
    var calcHref = currentCaseContext ? currentCaseContext.action : 'configurator.html';
    var calcLabel = 'Подобрать помощь';
    var homeStartCTA = false;
    var savedConcept = null;
    try {
      var savedDraft = JSON.parse(localStorage.getItem('salon_draft') || '{}');
      savedConcept = savedDraft && savedDraft.concept;
    } catch (e) {}
    var hasSavedConcept = !!(savedConcept &&
      (savedConcept.situation || savedConcept.workType || savedConcept.result ||
       savedConcept.deadlineDate || savedConcept.topic || savedConcept.comment));
    if (hasSavedConcept) {
      calcHref = 'configurator.html';
      calcLabel = 'Продолжить подбор';
    } else if (here === 'index.html' && !currentCaseContext) {
      calcHref = '#deskStart';
      calcLabel = 'Подобрать помощь';
      homeStartCTA = true;
    }
    header.innerHTML = '<div class="site-header__inner">' + brandHTML() +
      (accountChrome
        ? '<a class="header-account-exit" href="/">\u041d\u0430 \u0441\u0430\u0439\u0442 <span aria-hidden="true">\u2197</span></a>'
        : headerNavigationHTML()) +
      '<div class="site-header__actions nav-cta">' +
        /* aria-label обязателен: ниже 1240 подпись «Найти» и клавиша «/»
           прячутся, остаётся только значок, помеченный aria-hidden —
           без имени кнопка осталась бы безымянной для скринридера.
           Имя начинается со слова «Найти», поэтому WCAG 2.5.3
           (label in name) соблюдён. title — для мыши: под лупой без
           подписи всё равно должно быть видно, что это поиск. */
        /* title ставит Salon.theme.apply — там же, где aria-pressed,
           по которому CSS выбирает солнце или месяц. */
        '<button class="header-action header-action--search" type="button" data-open-search' +
          ' aria-label="Найти по сайту" title="Найти по сайту">' +
          icoSearch() + '<span class="visually-hidden">Найти</span></button>' +
        /* «Кабинет» — всегда со словом: по значку человек не поймёт, что
           это личный кабинет (решение владельца от 25.07.2026). Число
           событий само по себе тоже ничего не говорит, поэтому что оно
           значит, пишет Salon.cabBadge в aria-label и title. Точка
           статуса осталась хуком для сторонних правил, но роли
           «индикатор одним цветом» у неё больше нет (§3). */
        (accountChrome ? '' :
          '<a class="header-action nav-cab" href="dashboard.html"' + (here === 'dashboard.html' ? ' aria-current="page"' : '') +
            ' aria-label="Войти в личный кабинет" title="Войти в личный кабинет">' +
            '<span class="header-cabinet-icon" aria-hidden="true"><i></i></span><span class="nc-txt">Войти</span>' +
            '<span class="nc-badge" aria-hidden="true" hidden></span></a>') +
        Salon.themeToggleHTML() +
        (accountChrome ? '' : '<a class="button button--primary button--compact btn btn-wax" href="' + calcHref + '"' + (homeStartCTA ? ' data-home-start' : '') + '>' + calcLabel + ' <span aria-hidden="true">→</span></a>') +
        '<button class="icon-button header-menu-button menu-toggle" type="button" aria-expanded="false" aria-controls="p15MenuDialog" aria-label="Открыть меню"><i aria-hidden="true"></i></button>' +
      '</div></div>';
    var headerTheme = header.querySelector('.theme-toggle');
    if (headerTheme) headerTheme.classList.add('header-theme-toggle');
    Array.prototype.forEach.call(header.querySelectorAll('.header-nav-direct[href]'), function (link) {
      var target = (link.getAttribute('href') || '').replace(/^\//, '');
      if (target === here) link.setAttribute('aria-current', 'page');
    });
    var helpPages = {
      'services.html':1, 'configurator.html':1, 'start.html':1, 'vedenie.html':1,
      'komissiya-0.html':1, 'plan.html':1, 'razbor-zamechaniy-nauchruka.html':1,
      'normokontrol-vkr.html':1, 'redaktura-posle-ii.html':1, 'avtorskiy-zakaz.html':1,
      'diplomnaya-rabota.html':1, 'dorabotka-otcheta-po-praktike.html':1,
      'kandidatskaya-dissertaciya.html':1, 'kursovaya-rabota.html':1,
      'magisterskaya-dissertaciya.html':1, 'nauchnaya-statya.html':1,
      'otchet-po-praktike.html':1, 'referat.html':1
    };
    var usefulPage = here === 'knowledge.html' || here === 'tools.html' ||
      here === 'check.html' || here === 'audit-temy-vkr.html' ||
      here === 'proverka-istochnikov-vkr.html' || here === 'dosie-nauchruka.html' ||
      /^guide-/.test(here);
    var currentMenu = helpPages[here] || /^(kursovaya|diplomnaya)-po-/.test(here)
      ? 'headerHelpMenu' : (usefulPage ? 'headerUsefulMenu' : '');
    if (currentMenu) {
      var currentTrigger = header.querySelector('[data-header-menu-trigger][aria-controls="' + currentMenu + '"]');
      if (currentTrigger) currentTrigger.setAttribute('aria-current', 'true');
    }
    insertChromeAfterSkip(header);

    var mobileHeader = document.createElement('header');
    mobileHeader.className = 'mobile-appbar';
    var mobileHeaderMeta = mobileMeta();
    mobileHeader.innerHTML =
      '<button class="mobile-appbar__back" type="button" data-go-back aria-label="Вернуться назад"><span aria-hidden="true">←</span></button>' +
      '<a class="mobile-appbar__brand" href="/" title="На главную">' +
        brandMarkSVG() + '<span><strong></strong><small></small></span></a>' +
      '<button class="mobile-appbar__help" type="button" data-open-search aria-label="Найти раздел или материал">' + icoSearch() + '</button>' +
      '<button class="mobile-appbar__menu menu-toggle" type="button" aria-expanded="false" aria-controls="p15MenuDialog" aria-label="Открыть меню"><span>Меню</span><i aria-hidden="true"></i></button>';
    mobileHeader.querySelector('.mobile-appbar__brand strong').textContent = mobileHeaderMeta.title;
    mobileHeader.querySelector('.mobile-appbar__brand small').textContent = mobileHeaderMeta.kicker;
    header.insertAdjacentElement('afterend', mobileHeader);
    if (here !== 'index.html') mobileHeader.querySelector('.mobile-appbar__back').classList.add('is-visible');
    else mobileHeader.classList.add('mobile-appbar--root');
    if (Salon.theme) Salon.theme.apply(Salon.theme.current(), false); /* синк состояния кнопки темы */
  }

  /* бейдж кабинета (шапка + нижняя панель): активные дела и непрочитанное.
     Само число ничего не объясняет — «4» рядом со словом «Кабинет» можно
     прочитать и как счётчик дел, и как непрочитанное. Поэтому вместе с
     цифрой всегда переписываем доступное имя и title владельца бейджа:
     цифра остаётся для глаза, смысл — словами. */
  function plural(n, one, few, many) {
    var d10 = n % 10, d100 = n % 100;
    if (d10 === 1 && d100 !== 11) return one;
    if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return few;
    return many;
  }
  Salon.updateAccountEntry = function (session) {
    var authenticated = !!(session && session.authenticated === true);
    var guest = !authenticated && !!(session && session.guest_session === true);
    if (!guest && !authenticated && Salon.api && Salon.api.guestTokens) {
      guest = Salon.api.guestTokens().length > 0;
    }
    var visible = authenticated ? 'Кабинет' : (guest ? 'Моё дело' : 'Войти');
    var accessible = authenticated ? 'Личный кабинет' : (guest ? 'Открыть моё дело' : 'Войти в личный кабинет');
    Array.prototype.forEach.call(document.querySelectorAll('.nav-cab'), function (entry) {
      var label = entry.querySelector('.nc-txt');
      var badge = entry.querySelector('.nc-badge');
      if (label) label.textContent = visible;
      if (badge && !authenticated && !guest) { badge.hidden = true; badge.textContent = ''; }
      entry.setAttribute('aria-label', accessible);
      entry.setAttribute('title', accessible);
      entry.setAttribute('data-account-label', accessible);
      entry.setAttribute('data-auth-state', authenticated ? 'authenticated' : (guest ? 'guest' : 'anonymous'));
    });
  };
  Salon.cabBadge = function () {
    var slots = [].slice.call(document.querySelectorAll('.nav-cab .nc-badge, .mn-cab .mn-badge'));
    if (!slots.length || !Salon.api || !Salon.api.identified || !Salon.api.identified()) return;
    var g = Salon.api.guestTokens();
    Salon.api.get('/orders', g.length ? { 'X-Order-Tokens': g.join(',') } : {}).then(function (r) {
      if (!r.ok || !r.orders || !r.orders.length) return;
      var un = r.orders.reduce(function (s, o) { return s + (o.unread || 0); }, 0);
      var act = r.orders.filter(function (o) { return 'done cancel'.indexOf(o.status) < 0 && !o.archived; }).length;
      /* Что именно показывает бейдж — одной фразой, без цветовых намёков. */
      var say = un > 0
        ? un + ' ' + plural(un, 'новое сообщение', 'новых сообщения', 'новых сообщений')
        : (act > 0 ? act + ' ' + plural(act, 'дело в работе', 'дела в работе', 'дел в работе') : '');
      slots.forEach(function (slot) {
        if (un > 0) { slot.textContent = un > 9 ? '9+' : un; slot.hidden = false; slot.classList.remove('calm'); }
        else if (act > 0) { slot.textContent = act; slot.hidden = false; slot.classList.add('calm'); }
        /* Носитель имени — сама ссылка, а не бейдж: иначе скринридер
           прочитает «Кабинет» и «4» двумя ничем не связанными узлами.
           Видимое слово «Кабинет» входит в имя — WCAG 2.5.3 соблюдён. */
        var host = slot.closest ? slot.closest('.nav-cab, .mn-cab') : null;
        if (!host || !say) return;
        var base = host.getAttribute('data-account-label') || 'Личный кабинет';
        host.setAttribute('aria-label', base + ', ' + say);
        host.setAttribute('title', base + ' · ' + say);
      });
    });
  };

  /* Меню — на любой странице, где есть кнопка «Меню» (в т.ч. на главной) */
  if (document.querySelector('.menu-toggle')) {
    mountTOC();
    document.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('.menu-toggle');
      if (!t || !Salon.toc) return;
      e.preventDefault();
      Salon.toc.isOpen() ? Salon.toc.close() : Salon.toc.open(t);
    });
    document.addEventListener('click', function (e) {
      var search = e.target.closest && e.target.closest('[data-open-search]');
      if (!search || !Salon.toc) return;
      e.preventDefault();
      Salon.toc.open(search);
      window.setTimeout(function () {
        var field = document.getElementById('tocQ');
        if (field) field.focus();
      }, 80);
    });
    document.addEventListener('click', function (e) {
      var back = e.target.closest && e.target.closest('[data-go-back]');
      if (!back) return;
      e.preventDefault();
      if (history.length > 1) history.back();
      else location.href = '/';
    });
  }

  /* ---------------- Возврат к начатому заказу ----------------
     Подпись кнопки не меняем (шапка всегда одинаковая) — черновик
     тихо продолжается: ссылка ведёт на нужный шаг конфигуратора. */
  (function continueOrder() {
    var draft = Salon.store.get('salon_draft', null);
    var hasDraft = !!(draft && (draft.state || draft.concept));
    if (!hasDraft || here === 'configurator.html' || here === 'index.html') return;
    var main = document.querySelector('.nav-cta a.btn-wax');
    if (main) {
      main.href = 'configurator.html';
      main.innerHTML = 'Продолжить подбор <span aria-hidden="true">→</span>';
    }
  })();

  /* ---------------- Индикатор раздела в колонтитуле ---------------- */
  (function () {
    var slot = document.querySelector('.head-section');
    if (!slot) return;
    var title = (document.title.split('—')[0] || '').trim();
    slot.textContent = title;
    var chapters = document.querySelectorAll('[data-chapter]');
    if (!chapters.length || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) slot.textContent = en.target.getAttribute('data-chapter');
      });
    }, { rootMargin: '-15% 0px -70% 0px' });
    chapters.forEach(function (c) { io.observe(c); });
  })();

  /* ---------------- Колофон v7 «Пульт мастерской» ----------------
     Компактный финал вместо пятиколоночного каталога: ясный тезис, живой статус,
     три канала связи, быстрый маршрут и складной юридический слой. */

  /* Часы приёмной по МСК. Один источник правды для колонтитула и листа связи:
     статус доступности считается из одного isDay, без обещания точного SLA. */
  function mskNow() {
    var d = new Date();
    var h = (d.getUTCHours() + 3) % 24;
    return { h: h, m: d.getUTCMinutes(), day: h >= 9 && h < 23 };
  }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  /* Подписи у часов — человеческим языком, без типографского жаргона:
     владелец 2026-07-21 не понял слова «колофон», и это верный сигнал. */
  var CLOCK_STATE = ['Ночь в мастерской', 'Мы на связи'];
  /* строка ниже говорит ТОЛЬКО про срок ответа: слово «ночь» уже стоит
     в статусе у часов — повторять его здесь было бы эхом (правка 2026-07-22) */
  var CLOCK_ETA = ['Ответим в рабочее время',
                   'Ответим по текущей загрузке'];

  Salon.footerHTML = function () {
    return '<div class="site-footer__main">' +
      '<div class="site-footer__brand">' +
        brandMarkSVG() +
        '<div><strong>Академический Салон</strong><p>От темы до защиты — один проверяемый шаг за раз.</p>' +
          '<div class="site-footer__brand-actions">' +
            '<a href="configurator.html">Открыть дело <span aria-hidden="true">→</span></a>' +
            '<a href="dashboard.html">Войти в кабинет</a>' +
          '</div></div>' +
      '</div>' +
      '<details class="site-footer__group" open data-footer-group>' +
        '<summary><span>Начать</span><i aria-hidden="true"></i></summary>' +
        '<nav class="site-footer__links" aria-label="Начать работу">' +
          '<a href="services.html">Все услуги</a>' +
          '<a href="tariffs.html">Цены и условия</a>' +
          '<a href="komissiya-0.html">Комиссия №0</a>' +
          '<a href="configurator.html">Собрать заявку</a>' +
        '</nav>' +
      '</details>' +
      '<details class="site-footer__group" open data-footer-group>' +
        '<summary><span>Самостоятельно</span><i aria-hidden="true"></i></summary>' +
        '<nav class="site-footer__links" aria-label="Полезные материалы">' +
          '<a href="knowledge.html">Статьи и разборы</a>' +
          '<a href="tools.html">Инструменты</a>' +
          '<a href="plus.html">Абонемент «Салон+»</a>' +
          '<a href="deposit.html">Депозит мастерской</a>' +
        '</nav>' +
      '</details>' +
      '<details class="site-footer__group" open data-footer-group>' +
        '<summary><span>О мастерской</span><i aria-hidden="true"></i></summary>' +
        '<nav class="site-footer__links" aria-label="О мастерской">' +
          '<a href="about.html">О мастерской</a>' +
          '<a href="prolog.html">Как проходит работа</a>' +
          '<a href="guarantees.html">Гарантии</a>' +
          '<a href="academic-integrity.html">Границы помощи</a>' +
          '<a href="reviews.html">Отзывы</a>' +
          '<a href="priyomnaya.html">Приёмная</a>' +
        '</nav>' +
      '</details>' +
    '</div>' +
    '<div class="site-footer__bottom">' +
      '<span class="site-footer__copyright">© 2020–2026 Академический Салон</span>' +
      '<span class="site-footer__promise">Состав, срок и стоимость фиксируются до оплаты</span>' +
      '<nav class="site-footer__legal" aria-label="Документы">' +
        '<a href="privacy.html">Конфиденциальность</a>' +
        '<a href="privacy.html#cookies" data-cookie-settings>Настройки данных</a>' +
        '<a href="terms.html">Документы</a>' +
        '<a href="oferta.html">Оферта</a>' +
      '</nav>' +
      Salon.themeToggleHTML() +
    '</div>';
  };
  /* «Наверх» в колофоне: мягкий скролл вместо прыжка по якорю */
  document.addEventListener('click', function (e) {
    var top = e.target.closest && e.target.closest('.fc-top');
    if (!top) return;
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  });
  /* Мостик к Путеводителю: с JS — оверлей, без JS — честный переход на start.html */
  document.addEventListener('click', function (e) {
    var g = e.target.closest && e.target.closest('[data-toc-open]');
    if (!g || !Salon.toc) return;
    e.preventDefault();
    Salon.toc.open(g);
  });

  /* Сквозной мост связывает материал или услугу с одной стадией дела.
     Он не появляется на юридических, системных и рабочих экранах. */
  if (!CHROME_OFF && currentCaseContext && !document.querySelector('.case-bridge')) {
    var stageNames = ['Разобрать','Подготовить','Проверить','Представить'];
    var stageRow = stageNames.map(function (label,index) {
      var active = index + 1 === currentCaseContext.stage;
      return '<span class="' + (active ? 'is-current' : '') + '"' +
        (active ? ' aria-current="step"' : '') + '><i>' + (index + 1) +
        '</i><b>' + label + '</b></span>';
    }).join('');
    var caseBridge = document.createElement('section');
    caseBridge.className = 'case-bridge';
    caseBridge.setAttribute('aria-labelledby','caseBridgeTitle');
    caseBridge.innerHTML =
      '<div class="case-bridge__inner">' +
        '<nav class="case-bridge__stages" aria-label="Стадии дела">' + stageRow + '</nav>' +
        '<div class="case-bridge__copy">' +
          '<p>Дело исследования · стадия ' + currentCaseContext.stage + ' из 4</p>' +
          '<h2 id="caseBridgeTitle">' + currentCaseContext.title + '</h2>' +
          '<span>' + currentCaseContext.copy + '</span>' +
        '</div>' +
        '<div class="case-bridge__actions">' +
          '<a class="case-bridge__self" href="' + currentCaseContext.self +
            '" data-case-bridge-action="self">' + currentCaseContext.selfLabel + ' <span aria-hidden="true">↗</span></a>' +
          '<a class="button button--primary" href="' + currentCaseContext.action +
            '" data-case-bridge-action="route">' + currentCaseContext.actionLabel + ' <span aria-hidden="true">→</span></a>' +
          '<small>Предварительный контекст можно изменить в маршруте.</small>' +
        '</div>' +
      '</div>';
    var bridgeMain = document.querySelector('main');
    if (bridgeMain && bridgeMain.parentNode) bridgeMain.insertAdjacentElement('afterend',caseBridge);
    caseBridge.addEventListener('click',function (event) {
      var action = event.target.closest && event.target.closest('[data-case-bridge-action]');
      if (!action || !Salon.visit || typeof Salon.visit.event !== 'function') return;
      Salon.visit.event('case_bridge_open', {
        cta:'page_context',
        variant:(action.getAttribute('data-case-bridge-action') || 'route') + '_stage_' + currentCaseContext.stage
      });
    });
  }

  if (!CHROME_OFF && !document.querySelector('.site-footer')) {
    var footer = document.createElement('footer');
    footer.className = 'site-footer';
    footer.setAttribute('aria-label', 'Приёмная и документы');
    footer.innerHTML = Salon.footerHTML();
    document.body.appendChild(footer);
    /* На широком экране все ссылки видны сразу. На телефоне те же группы
       становятся компактным аккордеоном; без JS атрибут open оставляет
       навигацию доступной, поэтому футер остаётся fail-open. */
    (function () {
      var groups = Array.prototype.slice.call(footer.querySelectorAll('[data-footer-group]'));
      if (!groups.length || !window.matchMedia) return;
      var compact = window.matchMedia('(max-width: 920px)');
      function syncGroups(event) {
        groups.forEach(function (group) {
          if (event.matches) group.removeAttribute('open');
          else group.setAttribute('open', '');
        });
      }
      syncGroups(compact);
      groups.forEach(function (group) {
        group.addEventListener('toggle', function () {
          if (!compact.matches || !group.open) return;
          groups.forEach(function (other) {
            if (other !== group) other.removeAttribute('open');
          });
        });
      });
      if (compact.addEventListener) compact.addEventListener('change', syncGroups);
      else if (compact.addListener) compact.addListener(syncGroups);
    })();
    /* мостик открывает диалог — сообщаем это вспомогательным технологиям
       только когда путеводитель реально смонтирован */
    var bridge = footer.querySelector('[data-toc-open]');
    if (bridge && Salon.toc) bridge.setAttribute('aria-haspopup', 'dialog');
    /* Часы приёмной идут: setInterval, а не rAF — rAF в панели предпросмотра мёртв.
       Раз в 20 с пересчитываем и время, и день/ночь, чтобы страница, открытая
       с вечера, к ночи честно поменяла и лампу, и обещание по срокам. */
    (function () {
      var box = footer.querySelector('[data-foot-clock]');
      if (!box) return;
      var hh = box.querySelector('.cf-hh'), mm = box.querySelector('.cf-mm'),
          st = box.querySelector('.cf-cl-s'), lamp = box.querySelector('.cf-lamp'),
          eta = footer.querySelector('[data-foot-eta] .cf-live-t'),
          dot = footer.querySelector('[data-foot-eta] .fcl-dot');
      setInterval(function () {
        var n = mskNow(), i = n.day ? 1 : 0;
        hh.textContent = pad2(n.h); mm.textContent = pad2(n.m);
        if (st.textContent !== CLOCK_STATE[i]) st.textContent = CLOCK_STATE[i];
        lamp.className = 'cf-lamp' + (n.day ? '' : ' night');
        if (dot) dot.className = 'fcl-dot' + (n.day ? '' : ' night');
        if (eta && eta.textContent !== CLOCK_ETA[i]) eta.textContent = CLOCK_ETA[i];
      }, 20000);
    })();
  }
  /* ---------------- Плавающая пилюля связи (десктоп) ----------------
     Открывает лист каналов: сайт → ВК → MAX → Telegram. */
  if (!document.body.classList.contains('concept-shell') && !CHROME_OFF && !document.querySelector('.tg-pill') && here !== 'configurator.html' && here !== '404.html') {
    var pill = document.createElement('a');
    pill.className = 'tg-pill';
    pill.href = '#';
    pill.setAttribute('role', 'button');
    pill.innerHTML = '<span class="tp-dot" aria-hidden="true"></span>Спросить мастера';
    pill.addEventListener('click', function (e) {
      e.preventDefault();
      if (Salon.contact) Salon.contact();
    });
    document.body.appendChild(pill);
  }

  /* ---------------- Мобильная навигация: нижняя панель на всех страницах ----
     Кабинет всегда на виду (с бейджем), «Рассчитать» — сургучная кнопка. */
  var MCTA_OFF = CHROME_OFF || here === 'configurator.html' || here === '404.html';
  if (!MCTA_OFF && !document.querySelector('.mobile-cta')) {
    var mnav = document.createElement('nav');
    mnav.className = 'mobile-cta mnav mobile-dock';
    mnav.setAttribute('aria-label', 'Быстрая навигация');
    function mnItem(href, label, iconClass, cls) {
      var active = href === here || (href === '/' && here === 'index.html');
      var cur = active ? ' aria-current="page"' : '';
      return '<a class="mn-i' + (cls || '') + (active ? ' is-current' : '') + '" href="' + href + '"' + cur + '>' +
        '<span class="mn-ic ' + iconClass + '" aria-hidden="true">' + (iconClass === 'mobile-dock__seal' ? 'АС' : '') + '</span>' +
        '<small class="mn-l">' + label + '</small>' +
        (cls === ' mn-cab' ? '<span class="mn-badge" hidden></span>' : '') + '</a>';
    }
    var mobileRouteHref = currentCaseContext ? currentCaseContext.action : 'configurator.html';
    var mobileRouteLabel = hasSavedConcept
      ? 'Черновик'
      : 'Рассчитать';
    if (here === 'index.html') {
      mnav.classList.add('mobile-dock--home');
      mnav.innerHTML =
        mnItem('/', 'Главная', 'dock-icon dock-icon--home') +
        mnItem(mobileRouteHref, mobileRouteLabel, 'mobile-dock__seal', ' mn-calc mobile-dock__primary') +
        mnItem('dashboard.html', 'Кабинет', 'dock-icon dock-icon--profile', ' mn-cab');
    } else {
      mnav.innerHTML =
        mnItem('/', 'Главная', 'dock-icon dock-icon--home') +
        mnItem('services.html', 'Услуги', 'dock-icon dock-icon--services') +
        mnItem(mobileRouteHref, mobileRouteLabel, 'mobile-dock__seal', ' mn-calc mobile-dock__primary') +
        mnItem('knowledge.html', 'Библиотека', 'dock-icon dock-icon--library') +
        mnItem('dashboard.html', 'Кабинет', 'dock-icon dock-icon--profile', ' mn-cab');
    }
    document.body.appendChild(mnav);
    if (hasSavedConcept) {
      var savedDockLink = mnav.querySelector('.mn-calc');
      if (savedDockLink) savedDockLink.setAttribute('data-resume-draft','true');
    }
  }
  /* Внизу колофона зарезервированы 96px под нижнюю панель. Панель бывает
     двух видов: смонтированная выше и своя, прописанная прямо в разметке
     страницы (configurator.html — .conf-mcta). Отступ снимаем, только если
     панели нет НИ ОДНОЙ, иначе она накроет концевую полосу с печатью. */
  if (!CHROME_OFF && !document.querySelector('.mobile-cta')) document.body.classList.add('no-mcta');
  /* бейдж кабинета зовём ниже, когда Salon.api уже определён —
     здесь он молча выходил на проверке !Salon.api и не рисовался никогда */

  /* ---------------- Яндекс.Метрика ----------------
     Включается только после отдельного analytics:true (consent v2).
     Вебвизор и ecommerce выключены; URL передаётся без query/hash. */
  (function metrika() {
    var ID = 110565162;
    /* zayavka.html — страница оплаты по ссылке мастера: там человек принимает
       денежное решение, аналитике на ней делать нечего */
    if (location.protocol !== 'https:' || location.hostname !== 'akademsalon.ru' || analyticsPreview()
        || here === 'admin.html' || here === 'dashboard.html' || here === '404.html'
        || here === 'zayavka.html') return;
    function boot() {
      if (boot.done || !Salon.consent.allowed()) return;
      boot.done = true;
      (function (m, e, t, r, i, k, a) {
        m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
        m[i].l = 1 * new Date();
        for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) { return; } }
        k = e.createElement(t); a = e.getElementsByTagName(t)[0];
        k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
      })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=' + ID, 'ym');
      window.ym(ID, 'init', {
        ssr: true, webvisor: false, clickmap: true,
        referrer: safeReferrer(), url: location.origin + analyticsPage(location.pathname),
        accurateTrackBounce: true, trackLinks: true
      });
    }
    function safeReferrer() {
      try {
        if (!document.referrer) return '';
        var u = new URL(document.referrer);
        return u.origin;
      } catch (e) { return ''; }
    }
    function stop() {
      if (boot.done && window.ym) {
        try { window.ym(ID, 'destruct'); } catch (e) {}
      }
      boot.done = false;
      forgetAnalyticsVendorState();
    }
    Salon.metrika = {
      id: ID,
      boot: boot,
      stop: stop,
      goal: function (name) {
        if (boot.done && Salon.consent.allowed() && window.ym) window.ym(ID, 'reachGoal', name);
      }
    };
    if (Salon.consent.allowed()) boot();
    document.addEventListener('salon:consent', function (e) {
      if (e.detail && e.detail.analytics === true) boot();
      else stop();
    });
    /* цели: уходы в каналы — ВК, MAX, Telegram */
    document.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[href]') : null;
      var contact = e.target.closest ? e.target.closest('[data-contact]') : null;
      if (contact) {
        Salon.metrika.goal('contact_open');
        if (Salon.visit) Salon.visit.mark('cta: спросить мастера');
      }
      if (!a) return;
      var h = a.getAttribute('href') || '';
      if (h.indexOf('t.me/') > -1) Salon.metrika.goal('tg_click');
      else if (h.indexOf('vk.com/') > -1 || h.indexOf('vk.me/') > -1) Salon.metrika.goal('vk_click');
      else if (h.indexOf('max.ru/') > -1) Salon.metrika.goal('max_click');
      if (h.indexOf('configurator.html') > -1) {
        Salon.metrika.goal(h.indexOf('service=') > -1 ? 'service_cta' : 'configurator_click');
        if (Salon.visit) Salon.visit.mark('cta: конфигуратор');
      }
    }, true);
  })();

  /* ---------------- Приёмная мастера -----------------------------------------
     Два ясных начала: личный ответ или заявка на сайте. Остальные каналы
     остаются рядом, но не спорят с главным выбором. */
  (function () {
    var sheet, lastFocus, inerted = [];
    function build(opts) {
      opts = opts || {};
      var el = document.createElement('div');
      el.className = 'contact-sheet contact-v2';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-labelledby', 'csTitle');
      var order = opts.orderLink || LINKS.bot;
      var mskH = (new Date().getUTCHours() + 3) % 24;
      var day = mskH >= 9 && mskH < 23;
      el.innerHTML =
        '<div class="cs-backdrop" data-cs-close></div>' +
        /* Лист языка «Оттиск-15»: плоская бумага с волосяной рамкой,
           надзаголовок набором, сургуч — ровно на одном действии.
           Стиль переехал в chrome.css: вставлять <style> на каждое
           открытие — примета прошлого поколения этого листа. */
        '<div class="cs-card sheet">' +
          '<div class="cs-head">' +
            '<div><span class="cs-kicker">Приёмная · без обязательств</span>' +
              '<h2 class="cs-title" id="csTitle">Спросить мастера</h2></div>' +
            '<button class="cs-x" type="button" aria-label="Закрыть приёмную" data-cs-close>' +
              '<span aria-hidden="true">×</span></button></div>' +
          '<div class="cs-body">' +
            '<p class="cs-lead">' + (opts.lead ||
              'Напишите тему и срок. Скажем, возьмёмся ли, сколько это стоит и что понадобится от вас.') + '</p>' +
            /* Состояние — словами, а не цветом: §3 запрещает цвет как
               единственный носитель смысла. Набором стоит сама метка
               («НА СВЯЗИ» / «НОЧЬ»), цвет только поддерживает. */
            /* Тире внутри второй строки, а не пробел между элементами:
               флексбокс выбрасывает пробельные узлы между детьми, и
               role="status" прочитался бы как «На связиСрок ответа…». */
            '<p class="cs-live' + (day ? '' : ' night') + '" role="status">' +
              '<b class="cs-live-tag">' + (day ? 'На связи' : 'Ночь') + '</b>' +
              '<span>' + (day ? '— срок ответа зависит от загрузки мастерской'
                              : '— ответим в рабочее время, с 9 до 23 по Москве') + '</span></p>' +
            /* Список действий по мерке .sheet-action-list эталона:
               строки разделены волосяной линией, без карточек-коробок. */
            '<div class="cs-routes">' +
              '<a class="cs-route cs-route--main" href="' + LINKS.human + '" target="_blank" rel="noopener">' +
                '<span class="cs-num" aria-hidden="true">01</span>' +
                '<span class="cs-route-copy"><b>Написать мастеру</b>' +
                '<small>Личный диалог в Telegram</small></span>' +
                '<span class="cs-arrow" aria-hidden="true">→</span></a>' +
              '<a class="cs-route" href="configurator.html">' +
                '<span class="cs-num" aria-hidden="true">02</span>' +
                '<span class="cs-route-copy"><b>Оставить заявку на сайте</b>' +
                '<small>Смета, файлы и статус в одном месте</small></span>' +
                '<span class="cs-arrow" aria-hidden="true">→</span></a>' +
            '</div>' +
            '<div class="cs-alt"><span class="cs-alt-label">Другой путь</span>' +
              '<div class="cs-alt-grid">' +
                '<a href="' + LINKS.vkm + '" target="_blank" rel="noopener">ВКонтакте</a>' +
                '<a href="' + order + '" target="_blank" rel="noopener">Бот 24/7</a>' +
                '<a href="priyomnaya.html">Анонимно</a>' +
              '</div></div>' +
            '<p class="cs-foot"><b>Без оплаты:</b> сначала ответ и понятная цена.</p>' +
          '</div>' +
        '</div>';
      return el;
    }
    function close() {
      if (!sheet) return;
      sheet.classList.remove('open');
      document.body.classList.remove('toc-lock');
      inerted.forEach(function (el) { el.removeAttribute('inert'); }); inerted = [];
      var s = sheet; setTimeout(function () { if (s && s.parentNode) s.parentNode.removeChild(s); }, 240);
      sheet = null;
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    Salon.contact = function (opts) {
      lastFocus = document.activeElement;
      sheet = build(opts || {});
      document.body.appendChild(sheet);
      document.body.classList.add('toc-lock');
      inerted = ['.site-header', 'main', '.site-footer', '.mobile-cta', '.toc', '.mrail', '.lrail']
        .map(function (s) { return document.querySelector(s); }).filter(function (el) {
          return el && !sheet.contains(el);
        });
      inerted.forEach(function (el) { el.setAttribute('inert', ''); });
      void sheet.offsetWidth; /* показ без rAF — иначе шит невидим при спящем рендере */
      sheet.classList.add('open');
      /* второй пересчёт — уже ПОСЛЕ класса: до него visibility ещё
         hidden, а focus() по невидимому узлу ничего не делает. */
      void sheet.offsetWidth;
      var f = sheet.querySelector('.cs-x');
      if (f) {
        f.focus({ preventScroll: true });
        setTimeout(function () {
          if (sheet && !sheet.contains(document.activeElement)) f.focus({ preventScroll: true });
        }, 0);
      }
      sheet.addEventListener('click', function (e) { if (e.target.closest('[data-cs-close]')) { e.preventDefault(); close(); } });
      sheet.addEventListener('keydown', function (e) {
        if (e.key !== 'Tab') return;
        var focusable = Array.prototype.filter.call(
          sheet.querySelectorAll('a[href],button,summary'),
          function (el) { return el.getClientRects().length && !el.hasAttribute('disabled'); }
        );
        if (!focusable.length) return;
        var first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
    };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sheet) close(); });
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-msg], [data-contact]');
      if (!t) return;
      e.preventDefault();
      var st = Salon.store.get('salon_draft', null);
      var link = (t.getAttribute('data-contact') === 'bot' || (st && st.state))
        ? window.SalonBotLink(st && st.state) : LINKS.bot;
      Salon.contact({ orderLink: link, lead: t.getAttribute('data-msg-lead') || undefined });
    });
  })();

  /* ---------------- Печати по разметке: <span data-seal="ТЕКСТ · ПО · КРУГУ · "> ---------------- */
  document.querySelectorAll('[data-seal]').forEach(function (el) {
    el.innerHTML = Salon.sealSVG({
      ring: el.getAttribute('data-seal') || undefined,
      center: el.getAttribute('data-seal-center') || undefined,
      cls: el.getAttribute('data-seal-cls') || undefined,
      size: parseInt(el.getAttribute('data-seal-size'), 10) || undefined
    });
  });

  /* ---------------- Reveal: секции, линейки, печати, шкалы ---------------- */
  var OBSERVED = '.reveal, .rule.draw, .seal.press, .paysteps';
  function markAll() { document.querySelectorAll(OBSERVED).forEach(function (n) { n.classList.add('in'); }); }
  /* страховка помечает только то, что уже около вьюпорта, — скролл-хореография ниже сохраняется */
  function markNearViewport() {
    var limit = window.innerHeight * 1.2;
    document.querySelectorAll(OBSERVED).forEach(function (n) {
      if (!n.classList.contains('in') && n.getBoundingClientRect().top < limit) n.classList.add('in');
    });
  }
  if (reduceMotion || !('IntersectionObserver' in window)) {
    markAll();
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    document.querySelectorAll(OBSERVED).forEach(function (n) { if (!n.classList.contains('in')) io.observe(n); });
    window.addEventListener('load', function () { setTimeout(markNearViewport, 1800); });
  }
  /* наблюдатель для динамически добавленных узлов (кабинет, результаты) */
  Salon.observeReveal = function (root) {
    (root || document).querySelectorAll(OBSERVED).forEach(function (n) { n.classList.add('in'); });
  };

  /* ---------------- Постоянная шапка и прогресс чтения ----------------
     Шапка остаётся доступной при любой прокрутке. Планирование через
     setTimeout, не rAF: энергосберегающие режимы браузеров душат rAF,
     а чернильный прогресс должен жить везде. */
  var scheduled = false;
  function onScrollFrame() {
    scheduled = false;
    var y = window.scrollY;
    var hdr = document.querySelector('.site-header');
    if (hdr) {
      /* Снимаем устаревшее состояние после bfcache/частичной навигации. */
      hdr.classList.remove('hide');
      document.body.classList.remove('header-hidden');
      hdr.classList.toggle('scrolled', y > 12);
      var ink = hdr.querySelector('.hdr-ink');
      if (ink) {
        var max = (document.documentElement.scrollHeight - window.innerHeight) || 1;
        ink.style.width = Math.min(100, Math.max(0, (y / max) * 100)).toFixed(2) + '%';
      }
    }
  }
  window.addEventListener('scroll', function () { if (!scheduled) { scheduled = true; setTimeout(onScrollFrame, 16); } }, { passive: true });
  setTimeout(onScrollFrame, 50);

  /* ---------------- Мгновенная навигация: prefetch / prerender ---------------- */
  (function () {
    try {
      var mobile = window.matchMedia && window.matchMedia('(max-width:920px), (pointer:coarse)').matches;
      var save = navigator.connection && navigator.connection.saveData;
      if (!mobile && !save && HTMLScriptElement.supports && HTMLScriptElement.supports('speculationrules')) {
        var sr = document.createElement('script'); sr.type = 'speculationrules';
        sr.textContent = JSON.stringify({ prerender: [{ source: 'document', where: {
          selector_matches: 'a[href="configurator.html"],a[href="dashboard.html"]'
        }, eagerness: 'moderate' }] });
        document.head.appendChild(sr);
      } else if (!mobile && !save) {
        var seen = {};
        document.addEventListener('mouseover', function (e) {
          var a = e.target.closest && e.target.closest('a[href$=".html"]');
          if (!a) return; var h = a.getAttribute('href');
          if (!h || seen[h] || h.charAt(0) === '#') return; seen[h] = 1;
          var l = document.createElement('link'); l.rel = 'prefetch'; l.href = h; document.head.appendChild(l);
        }, { passive: true });
      }
    } catch (e) {}
  })();

  /* order-contract:start */
  function createOrderContract(env) {
    var flights = {};
    var producers = {
      configurator: {
        endpoint: '/orders',
        storageKey: 'salon_pending_request_v2',
        legacyStorageKey: 'salon_pending_request_v1',
        access: 'case_unverified',
        intentScope: 'payload_sha256'
      },
      guide_microlead: {
        endpoint: '/orders',
        storageKey: 'salon_pending_guide_request_v2',
        legacyStorageKey: 'salon_pending_guide_request_v1',
        access: 'unresolved',
        intentScope: 'page+payload_sha256'
      }
    };

    if (Object.freeze) {
      Object.keys(producers).forEach(function (id) { Object.freeze(producers[id]); });
      Object.freeze(producers);
    }

    function producer(id) {
      return Object.prototype.hasOwnProperty.call(producers, id) ? producers[id] : null;
    }

    function scopeFor(spec, intentScope) {
      if (spec.intentScope !== 'page+payload_sha256') return 'configurator';
      var scope = String(intentScope || '');
      return /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(scope) ? scope : '';
    }

    function storageKey(spec, scope) {
      return spec.intentScope === 'page+payload_sha256'
        ? spec.storageKey + ':' + scope
        : spec.storageKey;
    }

    function legacyKeys(spec, scope) {
      var keys = [spec.legacyStorageKey, spec.legacyStorageKey + ':intent_sha256'];
      if (spec.intentScope === 'page+payload_sha256') {
        keys.push(spec.legacyStorageKey + ':' + scope);
        keys.push(spec.legacyStorageKey + ':' + scope + ':intent_sha256');
      }
      return keys;
    }

    function validRequestId(value) {
      return typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value);
    }

    function validFingerprint(value) {
      return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
    }

    function read(key) {
      try {
        if (!env.storage) return { error: 'storage_unavailable' };
        return { value: env.storage.getItem(key) };
      } catch (e) {
        return { error: 'storage_unavailable' };
      }
    }

    function validState(state, producerId, scope) {
      if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
      var keys = Object.keys(state).sort().join(',');
      return keys === 'id,intent_sha256,producer,scope,v' &&
        state.v === 2 && state.producer === producerId && state.scope === scope &&
        validRequestId(state.id) && validFingerprint(state.intent_sha256);
    }

    function loadState(producerId, spec, scope) {
      var key = storageKey(spec, scope);
      var current = read(key);
      if (current.error) return current;
      if (current.value !== null) {
        var parsed;
        try { parsed = JSON.parse(current.value); }
        catch (e) { return { error: 'request_state_corrupt' }; }
        return validState(parsed, producerId, scope)
          ? { state: parsed, key: key }
          : { error: 'request_state_corrupt' };
      }
      var oldKeys = legacyKeys(spec, scope);
      for (var i = 0; i < oldKeys.length; i++) {
        var legacy = read(oldKeys[i]);
        if (legacy.error) return legacy;
        if (legacy.value !== null) return { error: 'legacy_request_pending' };
      }
      return { state: null, key: key };
    }

    function saveState(key, state) {
      var encoded = JSON.stringify(state);
      try {
        if (!env.storage) return false;
        env.storage.setItem(key, encoded);
        return env.storage.getItem(key) === encoded;
      } catch (e) {
        return false;
      }
    }

    function validOrderId(id) {
      return (typeof id === 'number' && Number.isSafeInteger(id) && id > 0) ||
        (typeof id === 'string' && /^[1-9][0-9]*$/.test(id) &&
          Number.isSafeInteger(Number(id)) && String(Number(id)) === id);
    }

    function isConfirmed(attempt) {
      return !!(attempt && attempt.st >= 200 && attempt.st < 300 && attempt.r &&
        attempt.r.ok === true && validOrderId(attempt.r.id));
    }

    function classify(attempt) {
      if (attempt && attempt.contractError === 'intent_changed') return 'conflict';
      if (attempt && attempt.contractError) return 'local_blocked';
      if (isConfirmed(attempt)) return 'confirmed';
      if (attempt && attempt.st === 409) return 'conflict';
      if (attempt && attempt.st >= 200 && attempt.st < 300 && attempt.r &&
          attempt.r.ok === false) return 'definitive_rejection';
      if (attempt && attempt.st >= 400 && attempt.st < 500 &&
          attempt.st !== 408 && attempt.st !== 425 && attempt.st !== 429) return 'definitive_rejection';
      return 'ambiguous';
    }

    function canonical(value) {
      if (value === null || typeof value !== 'object') return JSON.stringify(value);
      if (Array.isArray(value)) {
        return '[' + value.map(canonical).join(',') + ']';
      }
      return '{' + Object.keys(value).sort().map(function (key) {
        return JSON.stringify(key) + ':' + canonical(value[key]);
      }).join(',') + '}';
    }

    function preparePayload(payload) {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return { error: 'payload_unserializable' };
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'client_request_id')) {
        return { error: 'producer_request_id_forbidden' };
      }
      var encoded;
      var body;
      try {
        encoded = JSON.stringify(payload);
        body = JSON.parse(encoded);
      } catch (e) {
        return { error: 'payload_unserializable' };
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { error: 'payload_unserializable' };
      }
      return { body: body, material: canonical(body) };
    }

    function localResult(producerId, error, id) {
      return {
        st: 0, r: null, producer: producerId,
        clientRequestId: id || '', contractError: error
      };
    }

    function resolveState(producerId, spec, scope, body) {
      if (typeof env.fingerprint !== 'function') {
        return Promise.resolve({ error: 'intent_fingerprint_unavailable' });
      }
      var calculated;
      try { calculated = env.fingerprint(body); }
      catch (e) { return Promise.resolve({ error: 'intent_fingerprint_unavailable' }); }
      return Promise.resolve(calculated).then(function (fingerprint) {
        fingerprint = String(fingerprint || '').toLowerCase();
        if (!validFingerprint(fingerprint)) {
          return { error: 'intent_fingerprint_unavailable' };
        }
        var loaded = loadState(producerId, spec, scope);
        if (loaded.error) return loaded;
        if (loaded.state) {
          return loaded.state.intent_sha256 === fingerprint
            ? { state: loaded.state, key: loaded.key }
            : { error: 'intent_changed', state: loaded.state };
        }
        var id = '';
        try { id = String(env.makeId ? env.makeId() : ''); } catch (e) {}
        if (!validRequestId(id)) return { error: 'request_id_unavailable' };
        var state = {
          v: 2,
          producer: producerId,
          scope: scope,
          id: id,
          intent_sha256: fingerprint
        };
        if (!saveState(loaded.key, state)) return { error: 'storage_unavailable' };
        return { state: state, key: loaded.key };
      }, function () {
        return { error: 'intent_fingerprint_unavailable' };
      });
    }

    function requestId(producerId, intentScope) {
      var spec = producer(producerId);
      if (!spec) return '';
      var scope = scopeFor(spec, intentScope);
      if (!scope) return '';
      var loaded = loadState(producerId, spec, scope);
      return loaded.state ? loaded.state.id : '';
    }

    function clear(producerId, intentScope, expectedId) {
      var spec = producer(producerId);
      if (!spec) return false;
      var scope = scopeFor(spec, intentScope);
      if (!scope) return false;
      var loaded = loadState(producerId, spec, scope);
      if (!loaded.state || !expectedId || loaded.state.id !== expectedId) return false;
      try {
        env.storage.removeItem(loaded.key);
        return env.storage.getItem(loaded.key) === null;
      } catch (e) {
        return false;
      }
    }

    function transport(producerId, spec, state, body) {
      var headers = {};
      var suppliedHeaders;
      try { suppliedHeaders = env.headers ? env.headers('POST') : {}; }
      catch (e) { return Promise.resolve(localResult(producerId, 'headers_unavailable', state.id)); }
      Object.keys(suppliedHeaders || {}).forEach(function (key) { headers[key] = suppliedHeaders[key]; });
      headers['Content-Type'] = 'application/json';
      var statusContext = null;
      try {
        if (typeof env.statusContext === 'function') statusContext = env.statusContext();
      } catch (e) {
        return Promise.resolve(localResult(producerId, 'auth_context_unavailable', state.id));
      }
      var wireBody = {};
      Object.keys(body).forEach(function (key) { wireBody[key] = body[key]; });
      wireBody.client_request_id = state.id;
      var request;
      try {
        if (typeof env.fetch !== 'function') throw new Error('fetch unavailable');
        request = env.fetch(env.base + spec.endpoint, {
          method: 'POST',
          headers: headers,
          credentials: 'include',
          body: JSON.stringify(wireBody)
        });
      } catch (e) {
        return Promise.resolve({
          st: 0, r: null, producer: producerId, clientRequestId: state.id,
          networkError: true
        });
      }
      return Promise.resolve(request).then(function (response) {
        try {
          if (typeof env.onStatus === 'function') {
            env.onStatus(response.status, spec.endpoint, producerId, statusContext);
          }
        } catch (e) {}
        var json;
        try { json = response.json(); }
        catch (e) {
          return { st: response.status, r: null, badJson: true };
        }
        return Promise.resolve(json).then(function (data) {
          return { st: response.status, r: data };
        }, function () {
          return { st: response.status, r: null, badJson: true };
        });
      }, function () {
        return { st: 0, r: null, networkError: true };
      }).then(function (result) {
        result.producer = producerId;
        result.clientRequestId = state.id;
        return result;
      });
    }

    function softTimeout(promise, timeoutMs, flight, producerId) {
      if (!(timeoutMs > 0) || typeof env.setTimeout !== 'function') return promise;
      return new Promise(function (resolve) {
        var settled = false;
        var timer = env.setTimeout(function () {
          if (settled) return;
          settled = true;
          resolve({
            st: 0, r: null, producer: producerId,
            clientRequestId: flight.clientRequestId || '', timedOut: true
          });
        }, timeoutMs);
        promise.then(function (result) {
          if (settled) return;
          settled = true;
          if (timer && env.clearTimeout) env.clearTimeout(timer);
          resolve(result);
        });
      });
    }

    /* POST не abort-им: soft timeout возвращает управление UI, но сервер мог
       уже принять запись. Пока исходный POST жив, повтор присоединяется к нему
       и физически не создаёт второй сетевой запрос. */
    function submit(producerId, payload, timeoutMs, intentScope) {
      var spec = producer(producerId);
      if (!spec) return Promise.resolve(localResult(producerId, 'unknown_producer'));
      var scope = scopeFor(spec, intentScope);
      if (!scope) return Promise.resolve(localResult(producerId, 'invalid_scope'));
      var prepared = preparePayload(payload);
      if (prepared.error) return Promise.resolve(localResult(producerId, prepared.error));
      var key = storageKey(spec, scope);
      var active = flights[key];
      if (active) {
        if (active.material !== prepared.material) {
          return Promise.resolve(localResult(producerId, 'intent_changed', active.clientRequestId));
        }
        return softTimeout(active.promise, timeoutMs, active, producerId);
      }
      var flight = { material: prepared.material, clientRequestId: '', promise: null };
      flights[key] = flight;
      var operation = resolveState(producerId, spec, scope, prepared.body).then(function (resolved) {
        if (resolved.error) {
          return localResult(producerId, resolved.error, resolved.state && resolved.state.id);
        }
        flight.clientRequestId = resolved.state.id;
        return transport(producerId, spec, resolved.state, prepared.body);
      });
      flight.promise = operation.then(function (result) {
        if (flights[key] === flight) delete flights[key];
        return result;
      }, function () {
        if (flights[key] === flight) delete flights[key];
        return localResult(producerId, 'contract_internal_error', flight.clientRequestId);
      });
      return softTimeout(flight.promise, timeoutMs, flight, producerId);
    }

    return {
      producers: producers,
      requestId: requestId,
      clear: clear,
      validOrderId: validOrderId,
      isConfirmed: isConfirmed,
      classify: classify,
      submit: submit
    };
  }
  /* order-contract:end */

  /* ---------------- Кабинет: клиент API (общая база с ботом) ----------------
     Сайт и Telegram-бот работают с одним сервером: заказы, статусы и переписка
     синхронны. Обычная сессия и гостевой доступ живут в HttpOnly cookies;
     sessionStorage остаётся только для короткой миграции старых ссылок и
     изолированного режима «посмотреть глазами клиента». */
  var API_BASE = (location.hostname === 'akademsalon.ru')
    ? '/api' : 'https://akademsalon.ru/api';
  var CABINET_DEMO_PREVIEW = false;
  try {
    var demoName = new URLSearchParams(location.search).get('demo');
    CABINET_DEMO_PREVIEW = (location.pathname.split('/').pop() === 'dashboard.html') &&
      (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ||
       /\.saymoon\.chatgpt\.site$/.test(location.hostname)) &&
      (demoName === 'alexey' || demoName === 'alexey-vk' || demoName === 'entry');
  } catch (e) {}
  /* «Тихий» вход мастера в кабинет клиента: токен живёт ТОЛЬКО в этой вкладке
     (sessionStorage), чтобы не выбить основную сессию мастера в админке. */
  function impToken() {
    try { return sessionStorage.getItem('salon_imp_token') || null; } catch (e) { return null; }
  }
  function cookieValue(name) {
    try {
      var prefix = encodeURIComponent(name) + '=';
      var parts = String(document.cookie || '').split(';');
      for (var i = 0; i < parts.length; i++) {
        var item = parts[i].trim();
        if (item.indexOf(prefix) === 0) return decodeURIComponent(item.slice(prefix.length));
      }
    } catch (e) {}
    return '';
  }
  function sessionHint() {
    return Salon.secretStore.get('salon_cookie_session', false) === true;
  }
  function guestHint() {
    return Salon.secretStore.get('salon_guest_session', false) === true;
  }
  var authGeneration = 0;
  function setSessionHint(value) {
    var previous = sessionHint();
    if (previous !== !!value) authGeneration += 1;
    value ? Salon.secretStore.set('salon_cookie_session', true)
      : Salon.secretStore.del('salon_cookie_session');
    if (Salon.updateAccountEntry) {
      Salon.updateAccountEntry({ authenticated:!!value, guest_session:guestHint() });
    }
  }
  function setGuestHint(value) {
    value ? Salon.secretStore.set('salon_guest_session', true)
      : Salon.secretStore.del('salon_guest_session');
    if (Salon.updateAccountEntry) {
      Salon.updateAccountEntry({ authenticated:sessionHint(), guest_session:!!value });
    }
  }
  function captureAuthContext() {
    return {
      generation: authGeneration,
      logicalToken: Salon.api && Salon.api.token ? Salon.api.token() : null,
      impersonationToken: impToken() || null,
      csrfToken: cookieValue('__Host-salon_csrf') || null
    };
  }
  /* auth-status-contract:start */
  function sameAuthContext(requestAuthContext, currentAuthContext) {
    return !!(requestAuthContext && currentAuthContext &&
      requestAuthContext.generation === currentAuthContext.generation &&
      requestAuthContext.logicalToken === currentAuthContext.logicalToken &&
      requestAuthContext.impersonationToken === currentAuthContext.impersonationToken &&
      requestAuthContext.csrfToken === currentAuthContext.csrfToken);
  }
  /* auth-status-contract:end */
  function handleApiResponseStatus(status, path, requestAuthContext) {
    if (status !== 401) return;
    var currentAuthContext = captureAuthContext();
    if (requestAuthContext && !sameAuthContext(requestAuthContext, currentAuthContext)) return;
    var hadLogicalToken = !!((requestAuthContext || currentAuthContext).logicalToken);
    var wasImpersonated = !!currentAuthContext.impersonationToken;
    if (wasImpersonated) {
      /* протухла «тихая» сессия мастера — чистим только её */
      try { sessionStorage.removeItem('salon_imp_token'); sessionStorage.removeItem('salon_imp'); } catch (e) {}
    } else {
      Salon.api.setToken(null);
      Salon.api.setUser(null);
      setSessionHint(false);
    }
    /* Любой transport, включая non-aborting order submit, обязан одинаково
       возвращать UI из протухшего auth hint к честному состоянию входа. */
    if (hadLogicalToken) {
      try {
        document.dispatchEvent(new CustomEvent('salon:auth-lost', {
          detail: { path: path, impersonated: wasImpersonated }
        }));
      } catch (e) {
        var authLost = document.createEvent('CustomEvent');
        authLost.initCustomEvent('salon:auth-lost', false, false, {
          path:path, impersonated:wasImpersonated
        });
        document.dispatchEvent(authLost);
      }
    }
  }
  Salon.api = {
    base: API_BASE,
    demoPreview: CABINET_DEMO_PREVIEW,
    /* token() остаётся логическим признаком входа для старых UI-веток.
       Реальный cookie session никогда не доступен JavaScript. */
    token: function () {
      return impToken() || secretValue('salon_session', null)
        || (sessionHint() ? '__cookie__' : null);
    },
    bearer: function () { return impToken() || secretValue('salon_session', null); },
    cookieSession: sessionHint,
    guestSession: guestHint,
    setSessionHint: setSessionHint,
    setGuestHint: setGuestHint,
    handleStatus: handleApiResponseStatus,
    authSnapshot: captureAuthContext,
    setToken: function (t) {
      var previous = secretValue('salon_session', null);
      if ((previous || null) !== (t || null)) authGeneration += 1;
      Salon.store.del('salon_session');
      t ? Salon.secretStore.set('salon_session', t) : Salon.secretStore.del('salon_session');
    },
    user: function () { return secretValue('salon_user', null); },
    setUser: function (u) {
      Salon.store.del('salon_user');
      u ? Salon.secretStore.set('salon_user', u) : Salon.secretStore.del('salon_user');
    },
    guestTokens: function () {
      var v = secretValue('salon_tokens', []);
      return Array.isArray(v) ? v.filter(function (token) {
        return typeof token === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(token);
      }).slice(-30) : [];
    },
    addGuestToken: function (t) {
      var v = Salon.api.guestTokens();
      if (t && /^[A-Za-z0-9_-]{16,128}$/.test(t) && v.indexOf(t) < 0) {
        v.push(t);
        Salon.secretStore.set('salon_tokens', v.slice(-30));
        Salon.store.del('salon_tokens');
      }
    },
    identified: function () {
      return !!(Salon.api.token() || guestHint() || Salon.api.guestTokens().length);
    },
    outsideScopeMessage: function (response) {
      if (!response || response.error !== 'request_outside_scope') return '';
      var intro = response.message ||
        'Такую задачу нельзя оформить как коммерческий заказ. Выберите разрешённый формат помощи.';
      var routes = Array.isArray(response.allowed_routes)
        ? response.allowed_routes.filter(Boolean).slice(0, 3)
        : [];
      return intro + (routes.length ? ' Подойдут: ' + routes.join('; ') + '.' : '');
    },
    headers: function (method, extraHeaders) {
      var h = { 'X-Session-Mode': 'cookie' };
      var t = Salon.api.bearer();
      if (t) h.Authorization = 'Bearer ' + t;
      if (!t && /^(POST|PUT|PATCH|DELETE)$/i.test(method || 'GET')) {
        var csrf = cookieValue('__Host-salon_csrf');
        if (csrf) h['X-CSRF-Token'] = csrf;
      }
      Object.keys(extraHeaders || {}).forEach(function (key) {
        if (extraHeaders[key] != null && extraHeaders[key] !== '') h[key] = extraHeaders[key];
      });
      return h;
    },
    req: function (method, path, body, _retried, extraHeaders) {
      var h = Salon.api.headers(method, extraHeaders);
      if (body !== undefined) h['Content-Type'] = 'application/json';
      var requestAuthContext = Salon.api.authSnapshot();
      /* GET безопасно повторить один раз: короткое окно рестарта сервера
         (деплой) отдаёт 502/обрыв на пару секунд — не теряем посетителя */
      function again() {
        return new Promise(function (res) {
          setTimeout(function () { res(Salon.api.req(method, path, body, true, extraHeaders)); }, 1800);
        });
      }
      /* Ограничиваем только безопасные чтения: зависший GET можно повторить,
         а отправку заявки нельзя прерывать в неясном состоянии. */
      var fetchController = method === 'GET' && typeof AbortController === 'function'
        ? new AbortController()
        : null;
      var fetchTimer = fetchController ? setTimeout(function () { fetchController.abort(); }, 10000) : 0;
      function clearFetchTimer() {
        if (!fetchTimer) return;
        clearTimeout(fetchTimer);
        fetchTimer = 0;
      }
      return fetch(API_BASE + path, {
        method: method,
        headers: h,
        credentials: 'include',
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: fetchController ? fetchController.signal : undefined
      })
        .then(function (r) {
          Salon.api.handleStatus(r.status, path, requestAuthContext);
          if (method === 'GET' && !_retried && (r.status === 502 || r.status === 503 || r.status === 504)) {
            clearFetchTimer();
            return again();
          }
          return r.json().catch(function (error) {
            /* Abort после получения заголовков прерывает и зависшее тело.
               Пробрасываем его во внешний catch, чтобы безопасный GET повторился. */
            if (fetchController && fetchController.signal.aborted) throw error;
            return { ok: false, error: 'bad_json' };
          })
            .then(function (data) {
              clearFetchTimer();
              if (data && (data.session === true || data.authenticated === true)) {
                setSessionHint(true);
              }
              if (data && data.authenticated === false && !Salon.api.bearer()) {
                setSessionHint(false);
              }
              if (data && data.guest_session === true) setGuestHint(true);
              return data;
            });
        })
        .catch(function () {
          clearFetchTimer();
          if (method === 'GET' && !_retried) return again();
          return { ok: false, error: 'network' };
        });
    },
    get: function (p, h) { return Salon.api.req('GET', p, undefined, false, h); },
    post: function (p, b, h) { return Salon.api.req('POST', p, b || {}, false, h); },
    logout: function () {
      var finish = function () {
        Salon.api.setToken(null);
        Salon.api.setUser(null);
        setSessionHint(false);
      };
      return Salon.api.post('/auth/logout', {}).then(finish, finish);
    }
  };

  function canonicalOrderIntent(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
      return '[' + value.map(canonicalOrderIntent).join(',') + ']';
    }
    return '{' + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ':' + canonicalOrderIntent(value[key]);
    }).join(',') + '}';
  }

  function orderIntentFingerprint(payload) {
    if (!window.crypto || !window.crypto.subtle || !window.TextEncoder) {
      return Promise.reject(new Error('secure fingerprint unavailable'));
    }
    var bytes = new window.TextEncoder().encode(canonicalOrderIntent(payload));
    return window.crypto.subtle.digest('SHA-256', bytes).then(function (digest) {
      return Array.prototype.map.call(new Uint8Array(digest), function (byte) {
        return byte.toString(16).padStart(2, '0');
      }).join('');
    });
  }

  Salon.orderContract = createOrderContract({
    storage: (function () { try { return window.sessionStorage; } catch (e) { return null; } })(),
    makeId: function () {
      try {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
          return window.crypto.randomUUID();
        }
        if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
          var bytes = new Uint8Array(16);
          window.crypto.getRandomValues(bytes);
          return 'web_' + Array.prototype.map.call(bytes, function (byte) {
            return byte.toString(16).padStart(2, '0');
          }).join('');
        }
      } catch (e) {}
      return '';
    },
    fetch: function (url, options) { return window.fetch(url, options); },
    base: Salon.api.base,
    headers: function (method) { return Salon.api.headers(method); },
    fingerprint: orderIntentFingerprint,
    statusContext: function () { return Salon.api.authSnapshot(); },
    onStatus: function (status, path, producer, requestAuthContext) {
      Salon.api.handleStatus(status, path, requestAuthContext);
    },
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window)
  });

  /* Старые вкладки получают мягкий one-time upgrade: JS-readable Bearer
     обменивается на HttpOnly cookie и сразу отзывается на сервере. */
  Salon.api.migration = CABINET_DEMO_PREVIEW ? Promise.resolve(null) : (function migrateLegacySession() {
    var legacy = Salon.api.bearer();
    if (!legacy || impToken()) return Promise.resolve(null);
    return Salon.api.post('/auth/migrate', {}).then(function (r) {
      if (!r || !r.ok || !r.session) return;
      Salon.api.setToken(null);
      setSessionHint(true);
      return r;
    });
  })();

  /* Свежая вкладка видит HttpOnly cookie только через безопасный status API. */
  Salon.api.ready = CABINET_DEMO_PREVIEW ? Promise.resolve({
    ok: true, authenticated: false, guest_session: false, demo: true
  }) : Salon.api.migration.then(function () {
    return Salon.api.get('/auth/session');
  }).then(function (r) {
    if (r && r.ok) {
      setSessionHint(r.authenticated === true);
      setGuestHint(r.guest_session === true);
      if (r.user) Salon.api.setUser(r.user);
    }
    if (Salon.updateAccountEntry) Salon.updateAccountEntry(r || {});
    try {
      document.dispatchEvent(new CustomEvent('salon:session-ready', { detail: r || {} }));
    } catch (e) {}
    if (Salon.cabBadge) Salon.cabBadge();
    return r;
  });

  /* Ссылка доступа к делу: переносит гостевой доступ на другое устройство.
     Фрагмент не попадает в HTTP-запрос, Referer и обычный access-log.
     Последующая привязка дела к аккаунту — одноразовая операция: сервер
     отзывает предъявленный ключ и выдаёт уже связанный доступ. */
  Salon.claimLink = function (token) {
    return 'https://akademsalon.ru/dashboard.html#claim=' + encodeURIComponent(token || '');
  };

  /* бейдж «есть живое дело» на кнопке кабинета — теперь, когда api готов */
  if (Salon.cabBadge) Salon.cabBadge();

  /* ---------------- Атрибуция без персональных параметров ----------------
     Сохраняется только после analytics:true. Берём ограниченный белый список
     рекламных меток и путь входа; произвольный query, контакты и содержимое
     формы сюда никогда не попадают. */
  Salon.attribution = (function () {
    var KEY = 'salon_attr_v2';
    var OLD_KEY = 'salon_attr_v1';
    var PARAMS = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
    var here = (location.pathname.split('/').pop() || 'index.html');
    var imp = false;
    try { imp = sessionStorage.getItem('salon_imp') === '1'; } catch (e) {}
    var silentContour = here.indexOf('admin') === 0 || here === 'dashboard.html'
      || here === 'zayavka.html' || imp || analyticsPreview();
    var blockedUntilNavigation = !(Salon.consent && Salon.consent.allowed());
    function allowed() { return Salon.consent && Salon.consent.allowed(); }
    function code(v) {
      var raw = String(v == null ? '' : v).trim();
      if (!raw || raw.length > 32) return '';
      /* Не «очищаем» контакт до похожего на код: любое подозрительное
         значение отбрасывается целиком, чтобы его части не стали PII-меткой. */
      if (/[@/\\:?#%]|(?:^|\.)www\.|[\u0000-\u001f\u007f\s]/i.test(raw)) return '';
      if ((raw.match(/\d/g) || []).length >= 7) return '';
      if (/^[a-f0-9]{16,}$/i.test(raw) ||
          (/^[A-Za-z0-9_-]{20,}$/.test(raw) && /[A-Za-z]/.test(raw) && /\d/.test(raw))) return '';
      raw = raw.toLowerCase();
      return /^[a-z][a-z0-9_-]{0,31}$/.test(raw) ? raw : '';
    }
    function campaign() {
      try {
        var src = new URLSearchParams(location.search), out = {};
        PARAMS.forEach(function (key) {
          var value = code(src.get(key));
          if (value) out[key] = value;
        });
        return out;
      } catch (e) { return {}; }
    }
    function referrerCode() {
      try {
        if (!document.referrer) return '';
        var u = new URL(document.referrer);
        if (u.origin === location.origin) return '';
        var host = u.hostname.toLowerCase().replace(/^www\./, '');
        if (/(^|\.)yandex\./.test(host)) return 'yandex';
        if (/(^|\.)google\./.test(host)) return 'google';
        if (/(^|\.)bing\.com$/.test(host)) return 'bing';
        if (/(^|\.)vk\.(?:com|ru)$/.test(host)) return 'vk';
        if (/(^|\.)t\.me$|(^|\.)telegram\./.test(host)) return 'telegram';
        if (/(^|\.)mail\.ru$/.test(host)) return 'mailru';
        return 'external';
      } catch (e) { return ''; }
    }
    function entryPath() { return analyticsPage(location.pathname); }
    function hasCampaign(c) { return Object.keys(c || {}).length > 0; }
    function compact(c, ref) {
      var parts = [];
      PARAMS.forEach(function (key) {
        if (c && c[key]) parts.push(key + '=' + c[key]);
      });
      if (!parts.length && ref) parts.push('ref=' + ref);
      return parts.join('&');
    }
    function capture() {
      if (silentContour || blockedUntilNavigation || !allowed()) return null;
      var c = campaign(), ref = referrerCode();
      var source = hasCampaign(c) ? { kind:'utm', values:c } :
        (ref ? { kind:'referrer', code:ref } : null);
      var saved = Salon.store.get(KEY, null) || {};
      if (saved.entry) saved.entry = analyticsPage(saved.entry);
      if (saved.lastEntry) saved.lastEntry = analyticsPage(saved.lastEntry);
      if (!saved.first && source) {
        saved.first = source;
        saved.entry = entryPath();
        saved.firstAt = Date.now();
      }
      if (source) {
        saved.last = source;
        saved.lastEntry = entryPath();
        saved.lastAt = Date.now();
      }
      if (source || saved.first) Salon.store.set(KEY, saved);
      return saved;
    }
    function ref() {
      if (silentContour || blockedUntilNavigation || !allowed()) return '';
      var c = campaign();
      capture();
      return compact(c, hasCampaign(c) ? '' : referrerCode());
    }
    function decoratePage(base) {
      base = String(base || '');
      if (!/^[a-z0-9./?=_-]{1,120}$/i.test(base) || /(?:token|claim|session|oauth|imp)=/i.test(base)) {
        base = 'site';
      }
      if (silentContour || blockedUntilNavigation || !allowed()) return base;
      var saved = capture() || {};
      var bits = [];
      if (saved.entry) bits.push('entry=' + saved.entry);
      var first = saved.first && saved.first.kind === 'utm' ? saved.first.values : {};
      ['utm_source','utm_medium','utm_campaign'].forEach(function (key) {
        var value = code(first && first[key]);
        if (value) bits.push(key + '=' + value);
      });
      if (!bits.length && saved.first && saved.first.kind === 'referrer') {
        var ref = code(saved.first.code);
        if (ref) bits.push('ref=' + ref);
      }
      return (base + (bits.length ? ' | ' + bits.join('&') : '')).slice(0, 200);
    }
    Salon.store.del(OLD_KEY);
    if (!blockedUntilNavigation && allowed()) capture();
    document.addEventListener('salon:consent', function (e) {
      if (e.detail && e.detail.analytics === true) {
        if (!blockedUntilNavigation) capture();
      } else {
        blockedUntilNavigation = true;
        Salon.store.del(KEY);
      }
    });
    return { ref: ref, capture: capture, decoratePage: decoratePage, code: code };
  })();

  /* ---------------- Собственная аналитика визитов ----------------
     Работает только после analytics:true. Не получает секретные параметры
     URL, токен кабинета и идентификатор заказа. */
  Salon.visit = (function () {
    var here = (location.pathname.split('/').pop() || 'index.html');
    /* молчим в админке, на локальных превью и в «тихом» кабинете мастера —
       это не посетители (сервер дублирует этот гейт по флагу сессии) */
    var imp = false;
    try { imp = sessionStorage.getItem('salon_imp') === '1'; } catch (e) {}
    if (here.indexOf('admin') === 0 || here === 'dashboard.html' || here === 'zayavka.html' || imp
        || analyticsPreview()
        || location.protocol !== 'https:' || location.hostname !== 'akademsalon.ru') {
      return { mark: function () {}, order: function () {}, event: function () {} };
    }
    function vid() {
      var v = Salon.store.get('salon_vid', null);
      if (v && /^[a-z0-9-]{8,40}$/.test(v)) return v;
      var a = new Uint8Array(9);
      if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
      else for (var i = 0; i < 9; i++) a[i] = Math.floor(Math.random() * 256);
      v = 'v' + Array.prototype.map.call(a, function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
      Salon.store.set('salon_vid', v);
      return v;
    }
    function allowed() { return Salon.consent && Salon.consent.allowed(); }
    function consentStamp() {
      var c = Salon.consent && Salon.consent.read ? Salon.consent.read() : null;
      return c && c.analytics === true ? String(c.at || '') : '';
    }
    function page() { return analyticsPage(location.pathname); }
    function deliver(serialized, stamp) {
      if (!allowed() || consentStamp() !== stamp) return;
      try {
        var h = { 'Content-Type': 'text/plain' };
        /* Best-effort by design: без server idempotency contract повтор мог бы
           создать дубль или пережить отзыв согласия. */
        fetch(API_BASE + '/visit', {
          method: 'POST', headers: h, credentials: 'omit', keepalive: true,
          body: serialized
        }).catch(function () {});
      } catch (e) {}
    }
    function send(extra) {
      var stamp = consentStamp();
      if (!stamp) return;
      try {
        var body = { vid: vid(), page: page() };
        for (var k in extra) body[k] = extra[k];
        deliver(JSON.stringify(body), stamp);
      } catch (e) {}
    }
    function view() {
      var ref = Salon.attribution ? Salon.attribution.ref() : '';
      send({ kind: 'view', ref: ref.slice(0, 380) || undefined });
    }
    function start() {
      if (!allowed() || start.done) return;
      start.done = true;
      if (document.prerendering) document.addEventListener('prerenderingchange', view, { once: true });
      else view();
    }
    if (allowed()) start();
    document.addEventListener('salon:consent', function (e) {
      if (e.detail && e.detail.analytics === true) start();
      else start.done = false;
    });
    return {
      /* Конверсию считаем без номера дела и без токена доступа. */
      mark: function (step) {
        var code = analyticsMark(step);
        if (code) send({ kind: 'mark', step: code });
      },
      order: function () { send({ kind: 'order', step: 'заявка отправлена' }); },
      event: function (name, detail) {
        var item = analyticsEvent(name, detail);
        if (!item) return;
        send({
          kind: 'event',
          event: item.name,
          cta_id: item.cta,
          variant: item.variant || undefined
        });
      }
    };
  })();

  /* Privacy-safe CTA attribution: only a small semantic id is sent, never
     link query strings, form values, order numbers or access tokens. */
  document.addEventListener('click', function (e) {
    if (!Salon.visit || !Salon.visit.event || !e.target.closest) return;
    var target = e.target.closest('a,button');
    if (!target) return;
    var href = target.getAttribute('href') || '';
    var cta = target.getAttribute('data-cta') || '';
    var event = 'cta_click';
    if (!cta && target.hasAttribute('data-contact')) cta = 'contact_sheet';
    if (!cta && /configurator\.html/.test(href)) {
      cta = 'configurator';
      try {
        var service = new URL(href, location.href).searchParams.get('service');
        if (service && /^[a-z0-9_-]{1,12}$/i.test(service)) cta += ':' + service.toLowerCase();
      } catch (err) {}
    }
    if (/t\.me\/academic_saloon_bot/i.test(href)) {
      cta = 'telegram_bot'; event = 'tg_open';
    } else if (/t\.me\/academicsaloon/i.test(href)) {
      cta = 'telegram_human'; event = 'tg_open';
    } else if (/t\.me\/akademsalon/i.test(href)) {
      cta = 'telegram_channel'; event = 'tg_open';
    }
    if (cta) Salon.visit.event(event, { cta: cta });
  }, true);

  /* ---------------- Чёрный ящик: JS-ошибки посетителей ----------------
     Скрипт упал у клиента — метка «js: …» уходит маячком в «Визиты»
     (мастер видит в админке), сервер дублирует её в журнал, а «Салон-дозор»
     будит владельца в Telegram. Не больше трёх меток за сессию, без повторов. */
  (function blackBox() {
    var sent = {}, n = 0;
    function errorCode(msg) {
      msg = String(msg || '').toLowerCase();
      if (/typeerror/.test(msg)) return 'type_error';
      if (/referenceerror/.test(msg)) return 'reference_error';
      if (/syntaxerror/.test(msg)) return 'syntax_error';
      if (/securityerror/.test(msg)) return 'security_error';
      if (/network|failed to fetch|load failed/.test(msg)) return 'network_error';
      return 'runtime_error';
    }
    function report(msg, src) {
      if (n >= 3) return;
      msg = errorCode(msg);
      src = String(src || '').split('?')[0].replace(/[^a-z0-9_.:-]/gi, '').slice(0, 48);
      if (!msg || sent[msg]) return;
      sent[msg] = 1; n++;
      try { Salon.visit.mark('js: ' + msg + (src ? ' @ ' + src : '')); } catch (e) {}
    }
    window.addEventListener('error', function (e) {
      /* ошибки загрузки картинок/скриптов приходят без message — не наш случай */
      if (e && e.message) {
        report(e.message, (String(e.filename || '').split('/').pop() || '') + ':' + (e.lineno || 0));
      }
    });
    window.addEventListener('unhandledrejection', function (e) {
      var r = e && e.reason;
      report((r && (r.message || String(r))) || 'обещание без объяснений', 'promise');
    });
  })();

  /* Реферальная метка сайта (?ref=<код>): помним 30 дней, конфигуратор
     передаёт её с заявкой — пригласившему идёт бонус по правилам клуба. */
  (function () {
    try {
      var ref = new URLSearchParams(location.search).get('ref');
      if (ref && /^-?\d{1,12}$/.test(ref)) {
        Salon.store.set('salon_ref', { code: parseInt(ref, 10), ts: Date.now() });
      }
    } catch (e) {}
  })();
  Salon.refCode = function () {
    var r = Salon.store.get('salon_ref', null);
    if (!r || !r.code) return null;
    if (Date.now() - (r.ts || 0) > 30 * 24 * 3600 * 1000) {
      Salon.store.del('salon_ref');
      return null;
    }
    return r.code;
  };

  /* Вход через Telegram: код → t.me/бот?start=auth_<код> → поллинг → сессия.
     Код живёт в sessionStorage: страница может перезагрузиться или уйти в Telegram
     (мобильные!) — при возврате поллинг продолжится сам (Salon.resumeTgLogin).
     onOpen(link, opened) — сразу после window.open; onDone(user) — после входа. */
  Salon.tgLogin = function (onDone, onFail, onOpen) {
    Salon.api.post('/auth/start').then(function (r) {
      if (!r.ok || !r.link) { if (onFail) onFail(r); return; }
      Salon.secretStore.set('salon_auth_pending', {
        code: r.code,
        pollState: r.poll_state || '',
        link: r.link,
        ts: Date.now()
      });
      var win = window.open(r.link, '_blank', 'noopener');
      if (onOpen) onOpen(r.link, !!win);
      Salon.resumeTgLogin(onDone, onFail);
    });
  };

  /* Возобновить ожидание входа (по коду из sessionStorage). Возвращает pending-объект
     или null, если ожидания нет/протухло. Идемпотентно: вторая петля не запустится. */
  Salon.resumeTgLogin = function (onDone, onFail) {
    var TTL = 14 * 60 * 1000;
    var p = Salon.secretStore.get('salon_auth_pending', null);
    if (!p || !p.code || (Date.now() - (p.ts || 0)) > TTL) {
      if (p) Salon.secretStore.del('salon_auth_pending');
      return null;
    }
    if (Salon.__authLoop) return p;
    Salon.__authLoop = true;
    var iv = setInterval(tick, 2000);
    function stop() { clearInterval(iv); Salon.__authLoop = false; }
    function tick() {
      var cur = Salon.secretStore.get('salon_auth_pending', null);
      if (!cur || (Date.now() - (cur.ts || 0)) > TTL) {
        stop(); Salon.secretStore.del('salon_auth_pending');
        if (onFail) onFail({ error: 'timeout' });
        return;
      }
      var poll = cur.pollState
        ? Salon.api.post('/auth/poll', {}, { 'X-Auth-Poll': cur.pollState })
        : Salon.api.get('/auth/poll?code=' + encodeURIComponent(cur.code));
      poll.then(function (pr) {
        if (pr.ok && pr.pending === false && (pr.session || pr.token)) {
          stop();
          Salon.secretStore.del('salon_auth_pending');
          if (pr.token) Salon.api.setToken(pr.token);
          if (pr.session) setSessionHint(true);
          Salon.api.setUser(pr.user || null);
          var gt = Salon.api.guestTokens();
          var fin = function () { if (onDone) onDone(pr.user); };
          if (gt.length) Salon.api.post('/orders/claim', { tokens: gt }).then(fin, fin);
          else fin();
        }
      });
    }
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && Salon.__authLoop) tick();
    });
    tick();
    return p;
  };

  /* ---------------- Count-up для [data-count] ---------------- */
  if (!reduceMotion && 'IntersectionObserver' in window) {
    var cio = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (en.isIntersecting) {
          var n = en.target;
          Salon.countTo(n, parseFloat(n.getAttribute('data-count')) || 0, {
            suffix: n.getAttribute('data-suffix') || '', prefix: n.getAttribute('data-prefix') || '', duration: 900
          });
          cio.unobserve(n);
        }
      });
    }, { threshold: 0.6 });
    document.querySelectorAll('[data-count]').forEach(function (n) { cio.observe(n); });
  }
})();
