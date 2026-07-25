export const adminExtraRoutes = Object.freeze([
  {
    slug: "admin-visits",
    title: "Посещения",
    section: "Управление",
    family: "admin-extra",
    description: "Источники трафика, страницы входа, устройства и качество визитов."
  },
  {
    slug: "admin-reviews",
    title: "Модерация отзывов",
    section: "Управление",
    family: "admin-extra",
    description: "Очередь проверки, согласия на публикацию и история решений."
  },
  {
    slug: "admin-qa",
    title: "Вопросы приёмной",
    section: "Управление",
    family: "admin-extra",
    description: "Публичные и закрытые вопросы, ответы редакции и статусы публикации."
  },
  {
    slug: "admin-gifts",
    title: "Сертификаты",
    section: "Управление",
    family: "admin-extra",
    description: "Выпуск, оплата, активация и история подарочных сертификатов."
  },
  {
    slug: "admin-leads",
    title: "Обращения",
    section: "Управление",
    family: "admin-extra",
    description: "Новые обращения, квалификация задачи и следующий ответ клиенту."
  },
  {
    slug: "admin-broadcast",
    title: "Рассылки",
    section: "Управление",
    family: "admin-extra",
    description: "Сегменты, редакционная проверка, расписание и результаты отправок."
  },
  {
    slug: "admin-settings",
    title: "Настройки",
    section: "Управление",
    family: "admin-extra",
    description: "Режимы сервиса, рабочие интервалы, интеграции и доступ сотрудников."
  }
]);

const ADMIN_NAV = [
  ["admin", "Рабочий стол", "⌂"],
  ["admin-visits", "Посещения", "V"],
  ["admin-orders", "Дела", "Д"],
  ["admin-clients", "Клиенты", "К"],
  ["admin-reviews", "Отзывы", "О"],
  ["admin-qa", "Приёмная", "?"],
  ["admin-gifts", "Сертификаты", "П"],
  ["admin-leads", "Обращения", "Л"],
  ["admin-broadcast", "Рассылки", "Р"],
  ["admin-settings", "Настройки", "⚙"]
];

function adminExtraSidebar(current) {
  return `
    <aside class="admin-sidebar admin-extra__sidebar">
      <a class="admin-sidebar__brand" href="#/admin" data-route="admin">
        <img src="../../bimi/logo.svg" alt="">
        <span><strong>Академический Салон</strong><small>Редакционный кабинет</small></span>
      </a>
      <nav aria-label="Разделы администрирования">
        ${ADMIN_NAV.map(([slug, title, icon]) => `
          <a class="${current === slug ? "is-current" : ""}" href="#/${slug}" data-route="${slug}" ${current === slug ? 'aria-current="page"' : ""}>
            <i aria-hidden="true">${icon}</i>
            <span>${title}</span>
            ${slug === "admin-reviews" ? "<b>7</b>" : ""}
            ${slug === "admin-qa" ? "<b>5</b>" : ""}
            ${slug === "admin-leads" ? "<b>12</b>" : ""}
          </a>
        `).join("")}
      </nav>
      <div class="admin-sidebar__section">
        <span>Редакция</span>
        <a href="#/admin-content" data-route="admin-content"><i aria-hidden="true">М</i>Материалы</a>
        <a href="#/admin-covers" data-route="admin-covers"><i aria-hidden="true">О</i>Обложки</a>
      </div>
      <footer>
        <a href="#/home" data-route="home">Открыть сайт <span aria-hidden="true">↗</span></a>
        <button class="admin-sidebar__theme" type="button" data-toggle-theme><i data-theme-glyph aria-hidden="true">◐</i><span data-theme-action>Сменить тему</span></button>
        <span>Рабочая среда</span>
      </footer>
    </aside>
  `;
}

function demoBar(note) {
  return `
    <div class="admin-extra__demo-bar" role="status">
      <strong>Демонстрационные данные</strong>
      <span>${note}</span>
    </div>
  `;
}

function metrics(items) {
  return `
    <section class="admin-metrics admin-extra__metrics" aria-label="Ключевые показатели">
      ${items.map(([label, value, note, tone = ""]) => `
        <article>
          <span>${label}</span>
          <strong>${value}</strong>
          <small>${tone ? `<i class="${tone}">${note}</i>` : note}</small>
        </article>
      `).join("")}
    </section>
  `;
}

function adminExtraShell({ slug, eyebrow, title, lead, actions = "", summary = "", content }) {
  return `
    <div class="admin-page admin-extra" data-admin-extra-page="${slug}">
      <div class="admin-shell">
        ${adminExtraSidebar(slug)}
        <main class="admin-main">
          ${demoBar("Экран работает на фиксированном наборе примеров и ничего не отправляет.")}
          <header class="admin-head admin-extra__head">
            <div>
              <p class="eyebrow">${eyebrow}</p>
              <h1>${title}</h1>
              <p>${lead}</p>
            </div>
            <div>
              ${actions}
              <span class="admin-profile" aria-label="Демонстрационный профиль">ДМ</span>
            </div>
          </header>
          ${summary}
          ${content}
        </main>
      </div>
    </div>
  `;
}

function visitsView() {
  const sourceRows = [
    ["Поиск", "1 684", "43,8%", "8,1%", "Курсовая работа"],
    ["Прямые заходы", "912", "23,7%", "9,4%", "Главная"],
    ["Рекомендации", "548", "14,3%", "12,2%", "Разбор замечаний"],
    ["Редакционная библиотека", "426", "11,1%", "5,6%", "Структура ВКР"],
    ["Остальные источники", "272", "7,1%", "3,2%", "Цены"]
  ];
  const visitRows = [
    ["DEMO-VISIT-1048", "Поиск", "ВКР по психологии", "3 страницы", "Заявка начата", "сейчас", "human application"],
    ["DEMO-VISIT-1047", "Прямой", "Главная", "6 страниц", "Открыты цены", "4 мин назад", "human"],
    ["DEMO-VISIT-1046", "Рекомендация", "Разбор замечаний", "4 страницы", "Вопрос в приёмной", "11 мин назад", "human"],
    ["DEMO-VISIT-1045", "Библиотека", "Структура ВКР", "2 страницы", "Материал прочитан", "18 мин назад", "human library"],
    ["DEMO-BOT-1044", "Автоматический", "Главная", "1 страница", "Исключён из аналитики", "21 мин назад", "bot"]
  ];

  return adminExtraShell({
    slug: "admin-visits",
    eyebrow: "Аналитика",
    title: "Посещения",
    lead: "Источники, страницы входа и действия, которые помогают оценить понятность сайта.",
    actions: `
      <button class="button button--secondary" type="button" data-toast="Демо-отчёт подготовлен">Экспорт отчёта</button>
      <button class="button button--primary" type="button" data-toast="Период изменён только в демонстрации">Последние 30 дней</button>
    `,
    summary: metrics([
      ["Визиты", "3 842", "+12% к прошлому периоду", "up"],
      ["Новые посетители", "81%", "3 112 визитов"],
      ["Начали заявку", "284", "7,4% визитов", "up"],
      ["Без целевого действия", "28%", "−3 п. п.", "up"]
    ]),
    content: `
      <div class="admin-toolbar admin-extra__toolbar">
        <div class="filter-tabs filter-tabs--small" role="group" aria-label="Сегмент посещений">
          <button class="is-active" type="button" data-admin-demo-filter="visits-all">Все</button>
          <button type="button" data-admin-demo-filter="visits-human">Без ботов</button>
          <button type="button" data-admin-demo-filter="visits-application">С заявкой</button>
          <button type="button" data-admin-demo-filter="visits-library">Из библиотеки</button>
        </div>
        <button class="quiet-button" type="button" data-toast="Параметры атрибуции открыты в демо-режиме">Атрибуция</button>
      </div>

      <div class="admin-dashboard-grid admin-extra__grid">
        <section class="admin-panel admin-extra__panel">
          <header><div><h2>Источники</h2><span>Без персональных идентификаторов</span></div></header>
          <div class="admin-table-wrap">
            <table class="admin-table">
              <thead><tr><th>Источник</th><th>Визиты</th><th>Доля</th><th>Конверсия в заявку</th><th>Популярная страница входа</th></tr></thead>
              <tbody>
                ${sourceRows.map((row) => `<tr>${row.map((cell, index) => `<td>${index === 0 ? `<strong>${cell}</strong>` : cell}</td>`).join("")}</tr>`).join("")}
              </tbody>
            </table>
          </div>
        </section>

        <section class="admin-panel admin-extra__panel admin-extra__device-panel">
          <header><div><h2>Устройства</h2><span>Доля визитов</span></div></header>
          <div class="admin-extra__bars" aria-label="Распределение по устройствам">
            <div><span><strong>Мобильные</strong><small>2 420 визитов</small></span><i><b style="width:63%"></b></i><em>63%</em></div>
            <div><span><strong>Компьютеры</strong><small>1 268 визитов</small></span><i><b style="width:33%"></b></i><em>33%</em></div>
            <div><span><strong>Планшеты</strong><small>154 визита</small></span><i><b style="width:4%"></b></i><em>4%</em></div>
          </div>
          <div class="admin-extra__state-note">
            <span class="tag tag--green">Сбор работает</span>
            <p>Необязательная аналитика учитывается только после выбора пользователя.</p>
          </div>
        </section>
      </div>

      <section class="admin-table-wrap admin-extra__wide-table">
        <header class="admin-extra__table-head"><div><h2>Последние визиты</h2><p>Идентификаторы полностью синтетические.</p></div><span class="tag">Обновлено 14:32</span></header>
        <table class="admin-table">
          <thead><tr><th>Визит</th><th>Источник</th><th>Страница входа</th><th>Глубина</th><th>Итог</th><th>Время</th></tr></thead>
          <tbody>
            ${visitRows.map((row) => `<tr data-admin-demo-row="visits" data-admin-demo-tags="${row[6]}">${row.slice(0, 6).map((cell, index) => `<td>${index === 0 ? `<strong>${cell}</strong>` : cell}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </section>
    `
  });
}

function reviewsView() {
  const rows = [
    ["DEMO-R-051", "Редактура ВКР", "Согласия нет", "Скриншот проверен", "Публикация закрыта", "24 июля"],
    ["DEMO-R-050", "Научная статья", "Согласие получено", "Текстовая запись", "Опубликован", "23 июля"],
    ["DEMO-R-049", "Курсовая работа", "Нужно уточнить", "Скриншот проверен", "На уточнении", "22 июля"],
    ["DEMO-R-048", "Нормоконтроль", "Согласие отозвано", "Текстовая запись", "Снят с публикации", "20 июля"]
  ];

  return adminExtraShell({
    slug: "admin-reviews",
    eyebrow: "Публикация отзывов",
    title: "Модерация отзывов",
    lead: "Публикация доступна только после проверки текста, подтверждения результата и отдельного согласия.",
    actions: `<button class="button button--secondary" type="button" data-toast="Архив решений открыт в демонстрационном режиме">Журнал решений</button>`,
    summary: metrics([
      ["Ждут решения", "7", "2 новых сегодня"],
      ["Опубликовано", "48", "архив исходного сайта", "up"],
      ["Нужно согласие", "3", "публикация закрыта"],
      ["Подход", "Без рейтинга", "показываем исходные сообщения"]
    ]),
    content: `
      <div class="admin-toolbar admin-extra__toolbar">
        <div class="filter-tabs filter-tabs--small" role="group" aria-label="Статус отзывов">
          <button class="is-active" type="button" data-admin-demo-filter="reviews-all">Очередь</button>
          <button type="button" data-admin-demo-filter="reviews-published">Опубликованы</button>
          <button type="button" data-admin-demo-filter="reviews-clarify">На уточнении</button>
          <button type="button" data-admin-demo-filter="reviews-archive">Архив</button>
        </div>
        <button class="quiet-button" type="button" data-admin-panel="review-rules">Правила</button>
      </div>

      <section class="admin-table-wrap admin-extra__wide-table">
        <table class="admin-table">
          <thead><tr><th>Отзыв</th><th>Предмет работы</th><th>Согласие на публикацию</th><th>Материал</th><th>Статус</th><th>Обновлён</th><th></th></tr></thead>
          <tbody>
            ${rows.map((row, index) => `
              <tr data-admin-demo-row="reviews" data-admin-demo-tags="${index === 1 ? "published" : index === 2 ? "clarify" : "archive"}">
                ${row.map((cell, cellIndex) => `<td>${cellIndex === 0 ? `<strong>${cell}</strong>` : cellIndex === 4 ? `<span class="tag ${index === 1 ? "tag--green" : index === 2 ? "tag--amber" : ""}">${cell}</span>` : cell}</td>`).join("")}
                <td><button type="button" data-admin-record="${row[0]}" aria-label="Открыть карточку ${row[0]}">→</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>

      <div class="admin-dashboard-grid admin-extra__grid">
        <section class="admin-panel admin-extra__panel admin-extra__review-card">
          <header><div><h2>DEMO-R-051</h2><span>Редактура ВКР · без сведений об авторе</span></div><span class="tag tag--amber">Ожидает решения</span></header>
          <blockquote>Текст скрыт: это синтетическая карточка для проверки сценария модерации, а не опубликованный отзыв.</blockquote>
          <dl class="admin-extra__definition-list">
            <div><dt>Подтверждённый результат</dt><dd>Не указан в демонстрационных данных</dd></div>
            <div><dt>Основание</dt><dd>Синтетическая запись без вложения</dd></div>
            <div><dt>Согласие</dt><dd>Не выдавалось; публикация заблокирована</dd></div>
          </dl>
          <div class="admin-extra__actions">
            <button class="button button--primary" type="button" disabled aria-disabled="true">Публикация недоступна</button>
            <button class="button button--secondary" type="button" data-toast="Демо-запрос на уточнение подготовлен">Запросить уточнение</button>
            <button class="button button--text" type="button" data-toast="Демо-отказ добавлен в журнал">Отклонить</button>
          </div>
        </section>

        <section class="admin-panel admin-extra__panel">
          <header><div><h2>Проверка перед публикацией</h2><span>Все пункты обязательны</span></div></header>
          <ul class="admin-extra__checklist">
            <li><i>✓</i><span><strong>Личные сведения скрыты</strong><small>Фамилия, контакты и учебное заведение не указаны</small></span></li>
            <li><i>✓</i><span><strong>Результат сформулирован проверяемо</strong><small>Без обещаний оценки или решения комиссии</small></span></li>
            <li><i>—</i><span><strong>Согласие не получено</strong><small>Публикация недоступна</small></span></li>
            <li><i>—</i><span><strong>Редакторское примечание</strong><small>Можно добавить контекст о составе выполненной работы</small></span></li>
          </ul>
        </section>
      </div>
    `
  });
}

function qaView() {
  const rows = [
    ["DEMO-Q-184", "Срок редакторского разбора", "Публичный", "Новый", "сегодня, 13:20"],
    ["DEMO-Q-183", "Требования к источникам", "Закрытый ответ", "Готов ответ", "сегодня, 11:45"],
    ["DEMO-Q-182", "Повторный нормоконтроль", "Публичный", "Опубликован", "вчера, 18:10"],
    ["DEMO-Q-181", "Формат замечаний", "Публичный", "На уточнении", "вчера, 15:30"]
  ];

  return adminExtraShell({
    slug: "admin-qa",
    eyebrow: "Открытая приёмная",
    title: "Вопросы и ответы",
    lead: "Редакция отвечает по существу и отдельно решает, можно ли публиковать вопрос в общей базе.",
    actions: `<button class="button button--secondary" type="button" data-toast="Теги приёмной открыты в демонстрационном режиме">Управление тегами</button>`,
    summary: metrics([
      ["Новые вопросы", "5", "2 требуют ответа сегодня"],
      ["Готовы к публикации", "3", "после проверки"],
      ["Закрытые ответы", "8", "за последние 30 дней"],
      ["Среднее время ответа", "2 ч 14 мин", "−18 минут", "up"]
    ]),
    content: `
      <div class="admin-extra__split">
        <section class="admin-panel admin-extra__panel admin-extra__queue">
          <header><div><h2>Очередь</h2><span>Сначала вопросы без ответа</span></div><button type="button" data-admin-panel="qa-filters">Фильтры</button></header>
          <div class="admin-extra__queue-list">
            ${rows.map((row, index) => `
              <button class="${index === 0 ? "is-current" : ""}" type="button" data-admin-question="${row[0]}">
                <span class="admin-extra__queue-id">${row[0]}</span>
                <strong>${row[1]}</strong>
                <small>${row[2]} · ${row[4]}</small>
                <span class="tag ${index === 0 ? "tag--amber" : index === 2 ? "tag--green" : ""}">${row[3]}</span>
              </button>
            `).join("")}
          </div>
        </section>

        <section class="admin-panel admin-extra__panel admin-extra__qa-card">
          <header><div><h2>Срок редакторского разбора</h2><span>DEMO-Q-184 · публичный вопрос</span></div><span class="tag tag--amber">Новый</span></header>
          <div class="admin-extra__question">
            <span>Вопрос</span>
            <p>Можно ли сначала заказать письменный разбор замечаний, а решение о дальнейшей редактуре принять после него?</p>
          </div>
          <dl class="admin-extra__definition-list">
            <div><dt>Тема</dt><dd>Порядок работы</dd></div>
            <div><dt>Контакт для ответа</dt><dd>Подтверждён, значение скрыто</dd></div>
            <div><dt>Публикация</dt><dd>Разрешена после анонимизации</dd></div>
          </dl>
          <label class="field admin-extra__field">
            <span>Ответ редакции</span>
            <textarea rows="6">Да. Письменный разбор — отдельный результат. После него можно исправить замечания самостоятельно или согласовать только нужные редакторские задачи.</textarea>
          </label>
          <div class="admin-extra__actions">
            <button class="button button--primary" type="button" data-toast="Публикация ответа смоделирована">Смоделировать публикацию</button>
            <button class="button button--secondary" type="button" data-toast="Демо-ответ сохранён без публикации">Ответить закрыто</button>
            <button class="button button--text" type="button" data-toast="Демо-черновик сохранён">Сохранить черновик</button>
          </div>
        </section>
      </div>

      <section class="admin-panel admin-extra__panel admin-extra__states">
        <header><div><h2>Состояния формы</h2><span>Примеры сообщений для восстановления</span></div></header>
        <div>
          <article><span class="tag tag--amber">Нужен контакт</span><p>Для закрытого ответа укажите адрес, на который его можно отправить.</p></article>
          <article><span class="tag">Не хватает данных</span><p>Добавьте детали задачи: вид работы, желаемый результат и срок.</p></article>
          <article><span class="tag">Лимит обращений</span><p>Новый вопрос можно оставить через 12 минут. Текущий текст сохранён.</p></article>
          <article><span class="tag tag--green">Восстановлено</span><p>Соединение вернулось. Черновик ответа не потерян.</p></article>
        </div>
      </section>
    `
  });
}

function giftsView() {
  const rows = [
    ["DEMO-GIFT-104", "10 000 ₽", "Активен", "7 500 ₽", "18 июля 2027", "24 июля"],
    ["DEMO-GIFT-103", "5 000 ₽", "Ожидает оплаты", "5 000 ₽", "—", "23 июля"],
    ["DEMO-GIFT-102", "3 000 ₽", "Использован", "0 ₽", "11 июня 2027", "11 июня"],
    ["DEMO-GIFT-101", "7 500 ₽", "Заблокирован", "7 500 ₽", "2 мая 2027", "2 мая"]
  ];

  return adminExtraShell({
    slug: "admin-gifts",
    eyebrow: "Подарочные сертификаты",
    title: "Сертификаты",
    lead: "Статус, номинал, остаток и история операций собраны в одной карточке.",
    actions: `<button class="button button--primary" type="button" data-toast="Форма демо-сертификата открыта">Выпустить в демо</button>`,
    summary: metrics([
      ["Активны", "18", "общий остаток 132 500 ₽"],
      ["Ожидают оплаты", "4", "38 000 ₽"],
      ["Использованы", "27", "за всё время"],
      ["Требуют проверки", "2", "блокировка или операция"]
    ]),
    content: `
      <div class="admin-toolbar admin-extra__toolbar">
        <div class="filter-tabs filter-tabs--small" role="group" aria-label="Статус сертификатов">
          <button class="is-active" type="button" data-admin-demo-filter="gifts-all">Все</button>
          <button type="button" data-admin-demo-filter="gifts-active">Активные</button>
          <button type="button" data-admin-demo-filter="gifts-unpaid">Без оплаты</button>
          <button type="button" data-admin-demo-filter="gifts-archive">Архив</button>
        </div>
        <button class="quiet-button" type="button" data-toast="Поиск по демо-коду открыт">Найти код</button>
      </div>

      <section class="admin-table-wrap admin-extra__wide-table">
        <table class="admin-table">
          <thead><tr><th>Код</th><th>Номинал</th><th>Статус</th><th>Остаток</th><th>Рекомендуемый срок предъявления</th><th>Обновлён</th><th></th></tr></thead>
          <tbody>
            ${rows.map((row, index) => `
              <tr data-admin-demo-row="gifts" data-admin-demo-tags="${index === 0 ? "active" : index === 1 ? "unpaid" : "archive"}">
                ${row.map((cell, cellIndex) => `<td>${cellIndex === 0 ? `<strong>${cell}</strong>` : cellIndex === 2 ? `<span class="tag ${index === 0 ? "tag--green" : index === 1 ? "tag--amber" : ""}">${cell}</span>` : cell}</td>`).join("")}
                <td><button type="button" data-admin-record="${row[0]}" aria-label="Открыть карточку ${row[0]}">→</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>

      <div class="admin-dashboard-grid admin-extra__grid">
        <section class="admin-panel admin-extra__panel">
          <header><div><h2>DEMO-GIFT-104</h2><span>Активен · данные получателя скрыты</span></div><span class="tag tag--green">7 500 ₽ осталось</span></header>
          <ol class="admin-extra__timeline">
            <li><i></i><div><strong>Частично использован</strong><p>2 500 ₽ применены к редакторской консультации.</p><small>24 июля, 12:20</small></div></li>
            <li><i></i><div><strong>Сертификат активирован</strong><p>Код подтверждён владельцем.</p><small>21 июля, 09:45</small></div></li>
            <li><i></i><div><strong>Оплата подтверждена</strong><p>Номинал доступен для выбранных услуг.</p><small>18 июля, 16:10</small></div></li>
          </ol>
        </section>

        <section class="admin-panel admin-extra__panel">
          <header><div><h2>Действия</h2><span>Каждое действие только демонстрируется</span></div></header>
          <div class="admin-extra__action-list">
            <button type="button" data-toast="Рекомендуемый демо-срок изменён на 30 дней"><span><strong>Изменить рекомендуемый срок</strong><small>С пояснением в истории</small></span><b>→</b></button>
            <button type="button" data-toast="Демо-сертификат временно заблокирован"><span><strong>Приостановить</strong><small>Остаток сохраняется</small></span><b>→</b></button>
            <button type="button" data-toast="Демо-письмо подготовлено без отправки"><span><strong>Подготовить повторное письмо</strong><small>Адрес в концепте не используется</small></span><b>→</b></button>
            <button type="button" data-toast="Журнал демо-операций открыт"><span><strong>Открыть журнал</strong><small>Все изменения и основания</small></span><b>→</b></button>
          </div>
        </section>
      </div>
    `
  });
}

function leadsView() {
  const rows = [
    ["DEMO-L-312", "Поиск", "Разбор замечаний", "Новая", "Запросить файл", "12 мин"],
    ["DEMO-L-311", "Приёмная", "Научная статья", "Задача уточнена", "Подготовить смету", "38 мин"],
    ["DEMO-L-310", "Рекомендация", "Нормоконтроль", "Ждём материалы", "Напомнить завтра", "2 ч"],
    ["DEMO-L-309", "Библиотека", "План ВКР", "Закрыта", "Причина зафиксирована", "вчера"]
  ];

  return adminExtraShell({
    slug: "admin-leads",
    eyebrow: "До оформления заказа",
    title: "Новые обращения",
    lead: "В очереди видно, какие материалы запросить и когда ответить клиенту.",
    actions: `<button class="button button--primary" type="button" data-toast="Демо-обращение создано">Добавить обращение</button>`,
    summary: metrics([
      ["Новые", "12", "4 без ответственного"],
      ["Нужны материалы", "6", "следующее напоминание сегодня"],
      ["Смета готовится", "5", "срок ответа до 17:00"],
      ["Приняты в работу", "31%", "+4 п. п. за месяц", "up"]
    ]),
    content: `
      <section class="admin-extra__pipeline" aria-label="Этапы работы с обращениями">
        <article><span>Новые</span><strong>12</strong><small>Первичный ответ</small></article>
        <i aria-hidden="true">→</i>
        <article><span>Задача уточнена</span><strong>9</strong><small>Понятны задача и срок</small></article>
        <i aria-hidden="true">→</i>
        <article><span>Ждут материалов</span><strong>6</strong><small>Есть конкретный запрос</small></article>
        <i aria-hidden="true">→</i>
        <article><span>Смета</span><strong>5</strong><small>Рассчитываются состав и стоимость</small></article>
      </section>

      <section class="admin-table-wrap admin-extra__wide-table">
        <table class="admin-table">
          <thead><tr><th>Обращение</th><th>Источник</th><th>Задача</th><th>Этап</th><th>Следующий шаг</th><th>С момента обращения</th><th></th></tr></thead>
          <tbody>
            ${rows.map((row, index) => `
              <tr>
                ${row.map((cell, cellIndex) => `<td>${cellIndex === 0 ? `<strong>${cell}</strong>` : cellIndex === 3 ? `<span class="tag ${index === 0 ? "tag--amber" : index === 1 ? "tag--green" : ""}">${cell}</span>` : cell}</td>`).join("")}
                <td><button type="button" data-admin-record="${row[0]}" aria-label="Открыть карточку ${row[0]}">→</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>

      <div class="admin-dashboard-grid admin-extra__grid">
        <section class="admin-panel admin-extra__panel">
          <header><div><h2>DEMO-L-312</h2><span>Разбор замечаний · новый запрос</span></div><span class="tag tag--amber">Нужен ответ</span></header>
          <dl class="admin-extra__definition-list">
            <div><dt>Что уже есть</dt><dd>Файл с комментариями руководителя</dd></div>
            <div><dt>Что требуется</dt><dd>Разделить замечания на авторские и редакторские задачи</dd></div>
            <div><dt>Желаемый срок</dt><dd>Первый результат в течение трёх дней</dd></div>
            <div><dt>Чего не хватает</dt><dd>Актуальной версии основной работы</dd></div>
          </dl>
          <div class="admin-extra__actions">
            <button class="button button--primary" type="button" data-toast="Демо-запрос материалов подготовлен">Запросить файл</button>
            <button class="button button--secondary" type="button" data-toast="Демо-ответ сохранён">Сохранить ответ</button>
          </div>
        </section>

        <section class="admin-panel admin-extra__panel">
          <header><div><h2>Проверка обращения</h2><span>Четыре условия для расчёта</span></div></header>
          <ul class="admin-extra__checklist">
            <li><i>✓</i><span><strong>Предмет задачи понятен</strong><small>Разобрать конкретный список замечаний</small></span></li>
            <li><i>✓</i><span><strong>Желаемый результат назван</strong><small>Карта правок с приоритетами</small></span></li>
            <li><i>—</i><span><strong>Материалы собраны не полностью</strong><small>Нужен основной файл работы</small></span></li>
            <li><i>✓</i><span><strong>Срок можно оценить</strong><small>После получения недостающего файла</small></span></li>
          </ul>
        </section>
      </div>
    `
  });
}

function broadcastView() {
  const rows = [
    ["DEMO-B-028", "Новые материалы июля", "Читатели библиотеки", "Черновик", "—", "—"],
    ["DEMO-B-027", "Напоминание об абонементе", "Участники Клуба Салона", "Запланирована", "27 июля, 11:00", "842"],
    ["DEMO-B-026", "Обновление правил оплаты", "Клиенты с активными делами", "Завершена", "20 июля, 10:00", "96,8% доставлено"],
    ["DEMO-B-025", "Пауза технических работ", "Пользователи кабинета", "Приостановлена", "18 июля, 08:30", "Решение редактора"]
  ];

  return adminExtraShell({
    slug: "admin-broadcast",
    eyebrow: "Редакционные сообщения",
    title: "Рассылки",
    lead: "Сегмент, основание отправки и финальный текст проверяются до постановки в расписание.",
    actions: `<button class="button button--primary" type="button" data-toast="Новая демо-рассылка создана">Новая рассылка</button>`,
    summary: metrics([
      ["Черновики", "4", "2 готовы к проверке"],
      ["Запланированы", "2", "ближайшая 27 июля"],
      ["Доставлено", "96,8%", "последняя отправка"],
      ["Отписки", "0,4%", "за последнюю отправку"]
    ]),
    content: `
      <section class="admin-table-wrap admin-extra__wide-table">
        <header class="admin-extra__table-head"><div><h2>Кампании</h2><p>Адреса и внешние идентификаторы не используются.</p></div><button class="quiet-button" type="button" data-toast="Архив демо-рассылок открыт">Архив</button></header>
        <table class="admin-table">
          <thead><tr><th>Кампания</th><th>Тема</th><th>Сегмент</th><th>Статус</th><th>Время</th><th>Результат</th><th></th></tr></thead>
          <tbody>
            ${rows.map((row, index) => `
              <tr>
                ${row.map((cell, cellIndex) => `<td>${cellIndex === 0 ? `<strong>${cell}</strong>` : cellIndex === 3 ? `<span class="tag ${index === 1 ? "tag--amber" : index === 2 ? "tag--green" : ""}">${cell}</span>` : cell}</td>`).join("")}
                <td><button type="button" data-admin-record="${row[0]}" aria-label="Открыть карточку ${row[0]}">→</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>

      <div class="admin-extra__split admin-extra__broadcast-layout">
        <section class="admin-panel admin-extra__panel">
          <header><div><h2>Новые материалы июля</h2><span>DEMO-B-028 · черновик</span></div><span class="tag">Не отправляется</span></header>
          <label class="field admin-extra__field"><span>Сегмент</span><select><option>Читатели редакционной библиотеки</option></select></label>
          <label class="field admin-extra__field"><span>Тема письма</span><input value="Три новых материала редакционной библиотеки"></label>
          <label class="field admin-extra__field"><span>Сообщение</span><textarea rows="7">В библиотеке появились разборы о структуре ВКР, проверке источников и подготовке речи. В письме будут только ссылки на выбранные материалы и настройки подписки.</textarea></label>
          <div class="admin-extra__actions">
            <button class="button button--primary" type="button" data-toast="Демо-рассылка передана на редакционную проверку">Передать на проверку</button>
            <button class="button button--secondary" type="button" data-broadcast-preview>Предпросмотр</button>
            <button class="button button--text" type="button" data-toast="Демо-черновик сохранён">Сохранить черновик</button>
          </div>
        </section>

        <section class="admin-panel admin-extra__panel">
          <header><div><h2>Проверка перед отправкой</h2><span>Отправка в концепте отключена</span></div></header>
          <ul class="admin-extra__checklist">
            <li><i>✓</i><span><strong>Есть основание для сообщения</strong><small>У получателей есть отдельное согласие</small></span></li>
            <li><i>✓</i><span><strong>Сегмент ограничен</strong><small>842 синтетические записи в предпросмотре</small></span></li>
            <li><i>✓</i><span><strong>Ссылка на настройки видна</strong><small>Отказ доступен в один шаг</small></span></li>
            <li><i>—</i><span><strong>Нужна редакционная проверка</strong><small>Текст ещё не утверждён ответственным</small></span></li>
          </ul>
          <div class="admin-extra__state-note">
            <span class="tag tag--amber">Блокировка включена</span>
            <p>Кнопка реальной отправки отсутствует в исходном коде концепта.</p>
          </div>
        </section>
      </div>
    `
  });
}

function settingsView() {
  const slots = [
    ["Понедельник", "10:00–19:00", "6 консультаций", "Открыт"],
    ["Вторник", "10:00–19:00", "4 консультации", "Открыт"],
    ["Среда", "12:00–20:00", "5 консультаций", "Открыт"],
    ["Четверг", "10:00–19:00", "6 консультаций", "Открыт"],
    ["Пятница", "10:00–17:00", "3 консультации", "Открыт"],
    ["Суббота", "По записи", "2 консультации", "Ограничен"],
    ["Воскресенье", "—", "0 консультаций", "Закрыт"]
  ];

  return adminExtraShell({
    slug: "admin-settings",
    eyebrow: "Настройки сервиса",
    title: "Настройки",
    lead: "Здесь настраиваются доступность сервиса, расписание и роли сотрудников.",
    actions: `<button class="button button--secondary" type="button" data-toast="Журнал демо-настроек открыт">Журнал изменений</button>`,
    summary: metrics([
      ["Сайт", "Работает", "последняя проверка 14:31", "up"],
      ["Кабинет", "Работает", "ошибок не обнаружено", "up"],
      ["Оплата", "Демо-режим", "операции отключены"],
      ["Уведомления", "Отключены", "внешние каналы не вызываются"]
    ]),
    content: `
      <div class="admin-dashboard-grid admin-extra__grid">
        <section class="admin-panel admin-extra__panel">
          <header><div><h2>Режимы сервиса</h2><span>Изменения требуют подтверждения</span></div></header>
          <div class="admin-extra__settings-list">
            <div><span><strong>Публичный сайт</strong><small>Страницы и формы доступны</small></span><span class="tag tag--green">Работает</span><button type="button" data-toast="Демо-настройка сайта открыта">Настроить сайт</button></div>
            <div><span><strong>Личный кабинет</strong><small>Дела, документы и сообщения доступны</small></span><span class="tag tag--green">Работает</span><button type="button" data-toast="Демо-настройка кабинета открыта">Настроить кабинет</button></div>
            <div><span><strong>Платёжный шлюз</strong><small>В концепте не подключён</small></span><span class="tag">Отключён</span><button type="button" data-toast="Подключение платежей недоступно в концепте">Проверить подключение</button></div>
            <div><span><strong>Служебные уведомления</strong><small>Внешняя отправка заблокирована</small></span><span class="tag">Отключены</span><button type="button" data-admin-panel="notification-channels">Каналы</button></div>
          </div>
        </section>

        <section class="admin-panel admin-extra__panel">
          <header><div><h2>Доступ сотрудников</h2><span>Роли без персональных сведений</span></div><button type="button" data-toast="Форма демо-роли открыта">Добавить роль</button></header>
          <div class="admin-extra__role-list">
            <article><span>ВЛ</span><div><strong>Владелец</strong><small>Все разделы · 1 сотрудник</small></div><span class="tag tag--green">Защищена</span></article>
            <article><span>РД</span><div><strong>Редактор</strong><small>Дела, файлы, сообщения · 4 сотрудника</small></div><span class="tag">Ограничена</span></article>
            <article><span>МТ</span><div><strong>Методист</strong><small>Дела и консультации · 2 сотрудника</small></div><span class="tag">Ограничена</span></article>
            <article><span>КН</span><div><strong>Контент-редактор</strong><small>Материалы и обложки · 1 сотрудник</small></div><span class="tag">Ограничена</span></article>
          </div>
        </section>
      </div>

      <section class="admin-table-wrap admin-extra__wide-table">
        <header class="admin-extra__table-head"><div><h2>Рабочие интервалы</h2><p>Время указано по Москве.</p></div><button class="button button--secondary" type="button" data-toast="Демо-расписание сохранено">Изменить расписание</button></header>
        <table class="admin-table">
          <thead><tr><th>День</th><th>Рабочее время</th><th>Лимит записи</th><th>Статус</th></tr></thead>
          <tbody>
            ${slots.map((row) => `<tr>${row.map((cell, index) => `<td>${index === 0 ? `<strong>${cell}</strong>` : index === 3 ? `<span class="tag ${cell === "Открыт" ? "tag--green" : cell === "Ограничен" ? "tag--amber" : ""}">${cell}</span>` : cell}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </section>

      <div class="admin-dashboard-grid admin-extra__grid">
        <section class="admin-panel admin-extra__panel">
          <header><div><h2>Правовая информация</h2><span>Значения скрыты в демонстрации</span></div></header>
          <dl class="admin-extra__definition-list">
            <div><dt>Исполнитель</dt><dd>Берётся из защищённой конфигурации</dd></div>
            <div><dt>Налоговые реквизиты</dt><dd>Не загружаются в демонстрационную версию</dd></div>
            <div><dt>Версия оферты</dt><dd>Редакция от 24 июля 2026</dd></div>
            <div><dt>Версии согласий</dt><dd>Проверены · 5 самостоятельных документов</dd></div>
          </dl>
          <button class="button button--secondary" type="button" data-toast="Демо-проверка документов завершена">Проверить связанные документы</button>
        </section>

        <section class="admin-panel admin-extra__panel">
          <header><div><h2>Восстановление</h2><span>Без автоматического переключения</span></div></header>
          <div class="admin-extra__recovery-list">
            <article><span class="tag tag--amber">503</span><div><strong>Сервис временно недоступен</strong><p>Сохранить черновики и показать безопасный повтор.</p></div></article>
            <article><span class="tag">403</span><div><strong>Недостаточно прав</strong><p>Не раскрывать содержимое закрытого раздела.</p></div></article>
            <article><span class="tag">409</span><div><strong>Версия изменилась</strong><p>Сравнить данные перед повторным сохранением.</p></div></article>
            <article><span class="tag tag--green">OK</span><div><strong>Соединение восстановлено</strong><p>Подтвердить, что черновик и выбранный раздел сохранены.</p></div></article>
          </div>
          <a class="button button--text" href="#/state-gallery" data-route="state-gallery">Открыть все состояния</a>
        </section>
      </div>
    `
  });
}

const VIEW_RENDERERS = {
  "admin-visits": visitsView,
  "admin-reviews": reviewsView,
  "admin-qa": qaView,
  "admin-gifts": giftsView,
  "admin-leads": leadsView,
  "admin-broadcast": broadcastView,
  "admin-settings": settingsView
};

export function adminExtraView(slug) {
  const render = VIEW_RENDERERS[slug];
  if (render) return render();

  return adminExtraShell({
    slug: "admin-settings",
    eyebrow: "Редакционный кабинет",
    title: "Раздел не найден",
    lead: "Проверьте адрес или вернитесь на рабочий стол.",
    actions: `<a class="button button--primary" href="#/admin" data-route="admin">На рабочий стол</a>`,
    content: `
      <section class="admin-panel admin-extra__panel">
        <header><div><h2>Доступные разделы</h2><span>${adminExtraRoutes.length} экранов</span></div></header>
        <div class="admin-extra__route-list">
          ${adminExtraRoutes.map((route) => `<a href="#/${route.slug}" data-route="${route.slug}"><strong>${route.title}</strong><span>${route.description}</span><b aria-hidden="true">→</b></a>`).join("")}
        </div>
      </section>
    `
  });
}
