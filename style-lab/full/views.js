import {
  disciplines,
  findRoute,
  formatMoney,
  getGuide,
  getLegal,
  getService,
  guides,
  legalPages,
  orders,
  reviews,
  routeRegistry,
  services,
  tools
} from "./data.js?v=20260725-polish15";
import { adminExtraView } from "./admin-extra.js?v=20260725-polish15";

const ASSET_ROOT = "../../assets";

export function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function routeLink(slug, label, className = "") {
  return `<a class="${className}" href="#/${slug}" data-route="${slug}">${label}</a>`;
}

function pageHead({ eyebrow, title, lead, side = "", action = "", compact = false }) {
  return `
    <header class="page-head ${compact ? "page-head--compact" : ""}">
      <div class="page-head__copy">
        <p class="eyebrow">${eyebrow}</p>
        <h1>${title}</h1>
        ${lead ? `<p class="page-head__lead">${lead}</p>` : ""}
        ${action ? `<div class="page-head__action">${action}</div>` : ""}
      </div>
      ${side ? `<div class="page-head__side">${side}</div>` : ""}
    </header>
  `;
}

function sectionHead(kicker, title, note = "", action = "") {
  return `
    <header class="section-head">
      <div>
        <p class="eyebrow">${kicker}</p>
        <h2>${title}</h2>
      </div>
      ${note ? `<p>${note}</p>` : ""}
      ${action}
    </header>
  `;
}

function serviceCard(service, index, headingLevel = 3) {
  const headingTag = headingLevel === 2 ? "h2" : "h3";
  return `
    <article class="service-card ${service.popular ? "service-card--featured" : ""}" data-search="${escapeHTML(`${service.title} ${service.short} ${service.eyebrow} ${service.format}`)}">
      <a class="service-card__link" href="#/${service.slug}" data-route="${service.slug}" aria-label="Открыть услугу: ${escapeHTML(service.title)}">
        <div class="service-card__top">
          <span class="folio">${String(index + 1).padStart(2, "0")}</span>
          ${service.popular ? `<span class="tag tag--wax">Частый запрос</span>` : `<span class="tag">${service.format}</span>`}
        </div>
        <div class="service-card__body">
          <p class="eyebrow">${service.eyebrow}</p>
          <${headingTag}>${service.title}</${headingTag}>
          <p>${service.short}</p>
        </div>
        <div class="service-card__meta">
          <span><small>Стоимость</small><strong>${service.from ? `от ${formatMoney(service.from)}` : "после обсуждения задачи"}</strong></span>
          <span><small>Срок</small><strong>${service.duration}</strong></span>
        </div>
        <div class="service-card__actions">
          <span class="line-link">Посмотреть состав <span aria-hidden="true">→</span></span>
        </div>
      </a>
    </article>
  `;
}

function compactServiceRow(service) {
  return `
    <a class="service-row" href="#/${service.slug}" data-route="${service.slug}">
      <span class="service-row__mark" aria-hidden="true">${service.title.slice(0, 1)}</span>
      <span class="service-row__copy">
        <strong>${service.title}</strong>
        <small>${service.short}</small>
      </span>
      <span class="service-row__price">${service.from ? `от ${formatMoney(service.from)}` : "по смете"}</span>
      <span class="service-row__arrow" aria-hidden="true">→</span>
    </a>
  `;
}

function articleCard(guide, index) {
  return `
    <article class="article-card">
      <a href="#/${guide.slug}" data-route="${guide.slug}">
        <div class="article-card__number">${String(index + 1).padStart(2, "0")}</div>
        <div class="article-card__body">
          <span class="tag">${guide.category}</span>
          <h3>${guide.title}</h3>
          <p>${guide.summary}</p>
        </div>
        <footer>
          <span>${guide.reading}</span>
          <span>Читать <b aria-hidden="true">→</b></span>
        </footer>
      </a>
    </article>
  `;
}

export function homeView(state) {
  const draft = state.wizard?.started && !state.wizard?.submitted;
  return `
    <div class="home-view">
      <section class="home-hero">
        <div class="home-hero__grid">
          <div class="home-hero__copy">
            <p class="eyebrow">Редакторская мастерская · с 2020 года</p>
            <h1>Аудит, редактура<br>и консультации по академическим текстам.</h1>
            <p class="home-hero__lead">
              Работаем с вашим материалом. Показываем, что требует внимания, объясняем правки
              и заранее фиксируем результат услуги.
            </p>
            <div class="home-hero__actions">
              ${routeLink("start", draft ? `Продолжить заявку <span aria-hidden="true">→</span>` : `Описать задачу <span aria-hidden="true">→</span>`, "button button--primary button--large")}
              ${routeLink("tariffs", "Посмотреть цены", "button button--text")}
            </div>
            <dl class="home-hero__facts">
              <div><dt>До оплаты</dt><dd>состав, срок и цена</dd></div>
              <div><dt>В документе</dt><dd>видны все правки</dd></div>
              <div><dt>В кабинете</dt><dd>этапы и файлы</dd></div>
            </dl>
          </div>

          <aside class="editorial-case" aria-label="Пример редакторского разбора">
            <div class="editorial-case__chrome">
              <span>Редакторский лист</span>
              <span>AS · 02417</span>
            </div>
            <div class="editorial-case__paper">
              <header>
                <span>Фрагмент введения</span>
                <span class="status-dot"><i></i> проверено</span>
              </header>
              <p class="document-line">
                Цель исследования — изучить <del>различные аспекты</del>
                <ins>связь учебной мотивации и академической тревожности</ins>
                у студентов первого курса.
              </p>
              <div class="editor-note">
                <span>01</span>
                <p><strong>Цель уточнена.</strong> В ней названы переменные, которые можно измерить выбранными методиками.</p>
              </div>
              <div class="editorial-case__checks">
                <span><i>✓</i> цель связана с темой</span>
                <span><i>✓</i> задачи ведут к результату</span>
                <span><i>2</i> источника нужно заменить</span>
              </div>
            </div>
            <footer class="editorial-case__footer">
              <span><small>Первый результат</small><strong>Письменный разбор</strong></span>
              <span><small>Обычно</small><strong>1–2 дня</strong></span>
              <span><small>Ориентир</small><strong>от 2 500 ₽</strong></span>
            </footer>
          </aside>
        </div>
        <div class="home-hero__ticker" aria-label="Направления работы">
          <span>Курсовые</span><i></i><span>ВКР</span><i></i><span>Магистерские</span><i></i>
          <span>Научные статьи</span><i></i><span>Отчёты по практике</span><i></i><span>Защита</span>
        </div>
      </section>

      ${draft ? `
        <section class="resume-card section-shell section-shell--tight">
          <div class="resume-card__seal">АС</div>
          <div>
            <p class="eyebrow">Черновик сохранён</p>
            <h2>Вы остановились на шаге ${state.wizard.step + 1}</h2>
            <p>${escapeHTML(state.wizard.workType || "Тип работы ещё не выбран")} · данные хранятся только в этом браузере.</p>
          </div>
          ${routeLink("start", `Продолжить <span aria-hidden="true">→</span>`, "button button--primary")}
        </section>
      ` : ""}

      <section class="situation-section section-shell">
        ${sectionHead("С чего начать", "Что у вас сейчас?", "Выберите ситуацию, и откроется подходящий первый шаг. Регистрация не требуется.")}
        <div class="situation-grid">
          <button class="situation-card" type="button" data-start-situation="topic">
            <span class="situation-card__number">01</span>
            <div>
              <h3>Есть тема или задание</h3>
              <p>Проверим формулировку, требования и соберём рабочий план.</p>
            </div>
            <span class="situation-card__result"><small>Начать с</small>разбора темы</span>
            <span class="situation-card__arrow" aria-hidden="true">→</span>
          </button>
          <button class="situation-card" type="button" data-start-situation="draft">
            <span class="situation-card__number">02</span>
            <div>
              <h3>Есть черновик</h3>
              <p>Найдём слабые места и расставим задачи по важности.</p>
            </div>
            <span class="situation-card__result"><small>Начать с</small>редакторского аудита</span>
            <span class="situation-card__arrow" aria-hidden="true">→</span>
          </button>
          <button class="situation-card" type="button" data-start-situation="comments">
            <span class="situation-card__number">03</span>
            <div>
              <h3>Получены замечания</h3>
              <p>Комментарии переводим в понятный список правок.</p>
            </div>
            <span class="situation-card__result"><small>Начать с</small>карты правок</span>
            <span class="situation-card__arrow" aria-hidden="true">→</span>
          </button>
          <button class="situation-card" type="button" data-start-situation="defense">
            <span class="situation-card__number">04</span>
            <div>
              <h3>Скоро сдача или защита</h3>
              <p>Проверим готовность и выделим то, что ещё можно исправить.</p>
            </div>
            <span class="situation-card__result"><small>Начать с</small>проверки готовности</span>
            <span class="situation-card__arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </section>

      <section class="evidence-section">
        <div class="section-shell evidence-section__grid">
          <div class="evidence-section__copy">
            <p class="eyebrow">Как выглядит работа редактора</p>
            <h2>Вы видите причину каждой правки.</h2>
            <p>
              Правки и комментарии остаются в документе. В заявке сохраняются задачи,
              сроки и согласованные решения.
            </p>
            <ul class="plain-checks">
              <li><span>01</span>Сначала отмечаем существенные несоответствия</li>
              <li><span>02</span>Отделяем редакторские задачи от авторских</li>
              <li><span>03</span>Показываем, что изменилось между версиями</li>
            </ul>
            ${routeLink("specifikaciya", `Посмотреть пример спецификации <span aria-hidden="true">→</span>`, "line-link")}
          </div>
          <div class="document-stack">
            <article class="document-sheet document-sheet--back" aria-hidden="true"></article>
            <article class="document-sheet">
              <header><span>Карта редакторской проверки</span><b>АС / 24-17</b></header>
              <div class="document-sheet__title">
                <span class="severity severity--high">Важно</span>
                <h3>Выводы второй главы не отвечают задачам исследования</h3>
              </div>
              <div class="document-sheet__table">
                <div><span>Где</span><strong>стр. 42–48</strong></div>
                <div><span>Что сделать</span><strong>связать показатели с задачами 3 и 4</strong></div>
                <div><span>Кто выполняет</span><strong>автор + редактор</strong></div>
                <div><span>Выполнить до</span><strong>оформления приложений</strong></div>
              </div>
              <footer><span>Комментарий редактора</span><p>Сначала уточните два вывода по выборке. После этого мы сократим повторения и проверим переход к рекомендациям.</p></footer>
            </article>
          </div>
        </div>
      </section>

      <section class="services-preview section-shell">
        ${sectionHead("Основные форматы", "Услуги по текущей ситуации", "Цены — ориентировочные. Редактор уточнит сумму после просмотра файла, требований и срока.", routeLink("services", `Все услуги <span aria-hidden="true">→</span>`, "line-link section-head__action"))}
        <div class="service-card-grid">
          ${services.filter((item) => item.popular).slice(0, 4).map(serviceCard).join("")}
        </div>
      </section>

      <section class="process-section">
        <div class="section-shell">
          ${sectionHead("Порядок работы", "Как проходит работа", "В деле всегда указано, что делает редактор и что требуется от вас.")}
          <ol class="process-grid">
            <li><span>01</span><h3>Материалы</h3><p>Вы присылаете тему, файл и требования. Если чего-то не хватает, редактор скажет сразу.</p></li>
            <li><span>02</span><h3>Смета</h3><p>Получаете список задач, срок и стоимость. До вашего согласия работа не начинается.</p></li>
            <li><span>03</span><h3>Редактура</h3><p>Изменения остаются в документе. Вопросы и решения фиксируются в деле.</p></li>
            <li><span>04</span><h3>Приёмка</h3><p>Сверяете результат со спецификацией. Замечания по ней исправляются в согласованный срок.</p></li>
          </ol>
        </div>
      </section>

      <section class="home-library section-shell">
        <div class="home-library__intro">
          <p class="eyebrow">Можно начать самостоятельно</p>
          <h2>Редакционная библиотека</h2>
          <p>В библиотеке есть материалы о теме исследования, структуре, оформлении и подготовке к защите.</p>
          ${routeLink("knowledge", `Открыть библиотеку <span aria-hidden="true">→</span>`, "button button--secondary")}
        </div>
        <div class="home-library__articles">
          ${guides.slice(0, 3).map((guide, index) => `
            <a href="#/${guide.slug}" data-route="${guide.slug}">
              <span>${String(index + 1).padStart(2, "0")}</span>
              <div><small>${guide.category} · ${guide.reading}</small><strong>${guide.title}</strong></div>
              <b aria-hidden="true">→</b>
            </a>
          `).join("")}
        </div>
      </section>

      <section class="testimonial-section">
        <div class="section-shell testimonial-section__grid">
          <div class="testimonial-section__quote">
            <p class="eyebrow">Исходные сообщения</p>
            <h2>Отзывы в исходном виде.</h2>
            <p>Текст не пересказываем; личные сведения публикуем только по отдельному согласию.</p>
          </div>
          <div class="testimonial-section__result">
            <span class="eyebrow">Книга благодарностей</span>
            <strong>48 опубликованных сообщений</strong>
            <img src="../../assets/img/reviews/review-04.webp" alt="Фрагмент опубликованного сообщения клиента" loading="lazy" data-review-home="04">
            ${routeLink("reviews", `Открыть все сообщения <span aria-hidden="true">→</span>`, "line-link")}
          </div>
        </div>
      </section>

      <section class="calm-cta section-shell">
        <div>
          <p class="eyebrow">Если хотите начать</p>
          <h2>Покажите материалы редактору.</h2>
          <p>Первичная оценка нужна, чтобы определить объём, срок и подходящий формат. Она не обязывает оформлять заказ.</p>
        </div>
        <div>
          ${routeLink("start", `Описать задачу <span aria-hidden="true">→</span>`, "button button--primary button--large")}
          <button class="button button--text" type="button" data-open-support>Сначала задать вопрос</button>
        </div>
      </section>
    </div>
  `;
}

export function servicesView() {
  return `
    <div class="standard-page">
      <div class="page-shell">
        ${pageHead({
          eyebrow: "Услуги",
          title: "Выберите, что нужно проверить или доработать.",
          lead: "Начните с вида работы или с того, что происходит сейчас. На каждой странице указаны результат, порядок и ценовой ориентир.",
          side: `
            <div class="page-head__note">
              <span class="eyebrow">Не уверены в выборе?</span>
              <p>Ответьте на несколько вопросов. Система соберёт ответы в черновик заявки.</p>
              ${routeLink("start", `Описать задачу <span aria-hidden="true">→</span>`, "line-link")}
            </div>
          `
        })}

        <div class="catalog-toolbar">
          <div class="filter-tabs" role="group" aria-label="Фильтр услуг">
            <button class="is-active" type="button" data-service-filter="all">Все</button>
            <button type="button" data-service-filter="start">Начало работы</button>
            <button type="button" data-service-filter="draft">Есть текст</button>
            <button type="button" data-service-filter="finish">Перед сдачей</button>
          </div>
          <label class="catalog-search">
            <span class="sr-only">Поиск по услугам</span>
            <input type="search" data-service-search placeholder="Найти услугу">
            <i aria-hidden="true">⌕</i>
          </label>
        </div>

        <h2 class="sr-only" id="serviceCatalogTitle">Услуги по типу работы</h2>
        <div class="service-card-grid service-card-grid--catalog" data-service-grid aria-labelledby="serviceCatalogTitle">
          ${services.map((service, index) => serviceCard(service, index, 2)).join("")}
        </div>
        <button class="catalog-more button button--secondary" type="button" data-catalog-more="services" hidden>Показать остальные</button>
        <div class="catalog-empty" data-service-empty role="status" hidden><strong>Ничего не найдено</strong><p>Попробуйте одно ключевое слово или опишите задачу редактору.</p><button class="button button--secondary" type="button" data-open-support>Спросить редактора</button></div>

        <section class="discipline-section">
          ${sectionHead("По направлениям", "Что меняется в зависимости от дисциплины", "Для разных дисциплин различаются требования к источникам, данным и аргументации.")}
          <div class="discipline-grid">
            ${disciplines.map((item) => `
              <a href="#/${item.slug}" data-route="${item.slug}">
                <span class="discipline-grid__code">${item.slug.includes("diplomnaya") ? "ВКР" : "КР"}</span>
                <h3>${item.title.replace(/^Курсовая по |^ВКР по /, "")}</h3>
                <p>${item.note}</p>
                <footer><strong>от ${formatMoney(item.from)}</strong><span aria-hidden="true">→</span></footer>
              </a>
            `).join("")}
          </div>
        </section>

        <aside class="choice-help">
          <div>
            <span class="choice-help__seal">АС</span>
            <div><p class="eyebrow">Можно без каталога</p><h2>Опишите задачу обычными словами.</h2></div>
          </div>
          <p>Редактор определит, что действительно нужно сейчас, и не включит в смету лишние этапы.</p>
          <button class="button button--primary" type="button" data-open-support>Написать в приёмную</button>
        </aside>
      </div>
    </div>
  `;
}

export function serviceView(slug) {
  const service = getService(slug) || services[0];
  return `
    <div class="service-page">
      <div class="page-shell">
        <nav class="breadcrumbs" aria-label="Хлебные крошки">
          ${routeLink("home", "Главная")}<span>·</span>${routeLink("services", "Услуги")}<span>·</span><span>${service.title}</span>
        </nav>

        <section class="service-hero">
          <div class="service-hero__copy">
            <p class="eyebrow">${service.eyebrow}</p>
            <h1>${service.title}</h1>
            <p>${service.short}</p>
            <div class="service-hero__actions">
              <button class="button button--primary button--large" type="button" data-start-service="${service.slug}">
                Запросить смету <span aria-hidden="true">→</span>
              </button>
              <button class="button button--text" type="button" data-open-support>Задать вопрос</button>
            </div>
          </div>
          <aside class="service-facts">
            <div><span>Ориентир</span><strong>${service.from ? `от ${formatMoney(service.from)}` : "после обсуждения задачи"}</strong></div>
            <div><span>Срок</span><strong>${service.duration}</strong></div>
            <div><span>Формат</span><strong>${service.format}</strong></div>
            <p>${service.note}</p>
          </aside>
        </section>

        <nav class="anchor-nav" aria-label="На этой странице">
          <a href="#service-result">Результат</a>
          <a href="#service-process">Порядок</a>
          <a href="#service-price">Стоимость</a>
          <a href="#service-faq">Вопросы</a>
        </nav>

        <section class="service-result content-section" id="service-result">
          ${sectionHead("Что вы получите", "Результат фиксируем до оплаты", "Состав ниже — базовый. После просмотра материалов редактор уточнит пункты, срок и формат передачи.")}
          <div class="deliverable-grid">
            ${service.deliverables.map((item, index) => `
              <article>
                <span>${String(index + 1).padStart(2, "0")}</span>
                <h3>${item}</h3>
                <p>${[
                  "Результат будет указан в спецификации и останется доступен в кабинете.",
                  "Изменения можно проверить и обсудить с редактором.",
                  "К каждому спорному месту добавляется короткое пояснение.",
                  "Финальная проверка проводится по согласованным требованиям."
                ][index]}</p>
              </article>
            `).join("")}
          </div>
        </section>

        <section class="service-example content-section">
          <div class="service-example__copy">
            <p class="eyebrow">Фрагмент результата</p>
            <h2>Замечание превращается в конкретную задачу.</h2>
            <p>Вместо общей формулировки «слабая практическая часть» редактор показывает место, причину и последовательность исправлений.</p>
          </div>
          <div class="comment-example">
            <header><span>Комментарий № 7</span><span class="severity severity--high">Высокий приоритет</span></header>
            <blockquote>Результаты приведены, но не объяснено, как они отвечают второй задаче исследования.</blockquote>
            <div>
              <span>Предлагаемый порядок</span>
              <ol>
                <li>Добавить сравнение двух групп по выбранному показателю.</li>
                <li>Указать ограничение выборки.</li>
                <li>Переписать вывод к параграфу после расчёта.</li>
              </ol>
            </div>
          </div>
        </section>

        <section class="service-process content-section" id="service-process">
          ${sectionHead("Как проходит работа", "Порядок согласования")}
          <ol class="vertical-process">
            ${service.stages.map((item, index) => `
              <li>
                <span>${String(index + 1).padStart(2, "0")}</span>
                <div><h3>${item}</h3><p>${[
                  `Вы передаёте материалы. Для начала достаточно: ${service.needed}`,
                  "Редактор формулирует задачи, указывает результат каждого пункта и рассчитывает стоимость.",
                  "Работа идёт в согласованной последовательности. Вопросы и новые решения остаются в истории дела.",
                  "Вы сверяете результат со спецификацией и направляете замечания одним списком."
                ][index]}</p></div>
              </li>
            `).join("")}
          </ol>
        </section>

        <section class="service-price content-section" id="service-price">
          ${sectionHead("Стоимость", "Платите за согласованные задачи", "Объём текста сам по себе не определяет цену: важны состояние материала, требования, данные и срок.")}
          <div class="price-composition">
            <div class="price-composition__main">
              <span class="eyebrow">Базовый ориентир</span>
              <strong>${service.from ? `от ${formatMoney(service.from)}` : "индивидуальная смета"}</strong>
              <p>${service.note}</p>
              <button class="button button--primary" type="button" data-start-service="${service.slug}">Запросить смету</button>
            </div>
            <div class="price-composition__factors">
              <h3>На расчёт влияют</h3>
              <ul>
                <li><span>01</span>готовность текста и данных</li>
                <li><span>02</span>требования кафедры или издания</li>
                <li><span>03</span>число редакторских задач</li>
                <li><span>04</span>срок и порядок согласований</li>
              </ul>
            </div>
          </div>
        </section>

        <section class="faq-section content-section" id="service-faq">
          ${sectionHead("Вопросы", "До начала работы")}
          <div class="accordion-list">
            ${[
              ["Можно сначала заказать только диагностику?", "Да. Письменный разбор — самостоятельный результат. После него можно продолжить работу своими силами."],
              ["Вы работаете без методички?", "Можем начать с общей проверки, но для оформления и финальной сверки понадобятся требования вашего вуза."],
              ["Как передаются правки?", "Обычно в Word с включённым режимом исправлений и комментариями. Дополнительные файлы перечисляются в спецификации."],
              ["Что происходит, если срок меняется?", "Редактор сообщает об этом в деле. Новый срок действует только после вашего подтверждения."]
            ].map(([question, answer], index) => `
              <details ${index === 0 ? "open" : ""}>
                <summary>${question}<span aria-hidden="true">+</span></summary>
                <p>${answer}</p>
              </details>
            `).join("")}
          </div>
        </section>

        <aside class="service-final">
          <div><p class="eyebrow">Первый шаг</p><h2>Редактор посмотрит материалы и подготовит смету.</h2></div>
          <p>Можно остановиться после оценки. Отправка файлов сама по себе не создаёт заказ и не требует оплаты.</p>
          <button class="button button--primary button--large" type="button" data-start-service="${service.slug}">Описать задачу <span aria-hidden="true">→</span></button>
        </aside>
      </div>
    </div>
  `;
}

export function tariffsView() {
  return `
    <div class="standard-page">
      <div class="page-shell">
        ${pageHead({
          eyebrow: "Цены",
          title: "Состав и стоимость видны до начала.",
          lead: "Ниже — ориентиры для типовых задач. Точная смета учитывает состояние материала, требования и срок.",
          action: routeLink("start", `Запросить смету <span aria-hidden="true">→</span>`, "button button--primary"),
          side: `<div class="price-principle"><span>Правило расчёта</span><strong>Каждая строка сметы описывает отдельный результат</strong><p>Каждую позицию можно принять отдельно.</p></div>`
        })}

        <section class="price-table-section">
          <div class="price-table-head">
            <div>
              <p class="eyebrow">Редакторские задачи</p>
              <h2>Можно начать с одного этапа</h2>
            </div>
            <label class="catalog-search">
              <span class="sr-only">Фильтр цен</span>
              <input type="search" data-price-search placeholder="Найти в таблице">
              <i aria-hidden="true">⌕</i>
            </label>
          </div>
          <div class="price-table" data-price-table>
            ${[
              ["Диагностика", "Разбор темы и плана", "Письменные рекомендации", 3000, "1–2 дня"],
              ["Диагностика", "Разбор замечаний руководителя", "Карта правок с приоритетами", 2500, "после просмотра"],
              ["Редактура", "Курсовая работа", "Правки и комментарии в Word", 9000, "после просмотра"],
              ["Редактура", "ВКР или дипломная", "Поэтапная редактура рукописи", 24000, "после просмотра"],
              ["Оформление", "Нормоконтроль", "Проверка по методичке", 5000, "после просмотра"],
              ["Защита", "Проверка речи и презентации", "Правки и репетиция", 6000, "после просмотра"],
              ["Публикация", "Научная статья РИНЦ", "Редактура и требования издания", 7000, "после просмотра"],
              ["Консультация", "Методическая сессия", "60 минут и письменное резюме", 3000, "по записи"]
            ].map(([group, title, result, price, term]) => `
              <div class="price-row" data-price-row data-search="${group} ${title} ${result}">
                <span class="tag">${group}</span>
                <div><strong>${title}</strong><small>${result}</small></div>
                <span><small>от</small><strong>${formatMoney(price)}</strong></span>
                <span>${term}</span>
                <button type="button" data-start-priced="${title}" aria-label="Уточнить стоимость: ${title}">Уточнить</button>
              </div>
            `).join("")}
          </div>
        </section>

        <section class="estimate-example">
          <div class="estimate-example__copy">
            <p class="eyebrow">Пример сметы</p>
            <h2>Что можно исключить из сметы.</h2>
            <p>Если часть задачи можно выполнить самостоятельно, редактор обозначит это в комментарии и не включит работу в расчёт.</p>
          </div>
          <div class="estimate-paper">
            <header><span>Предварительная смета</span><b>№ 24-071</b></header>
            <div class="estimate-paper__line"><span><b>01</b>Разбор замечаний</span><strong>2 500 ₽</strong></div>
            <div class="estimate-paper__line"><span><b>02</b>Редактура выводов второй главы</span><strong>4 500 ₽</strong></div>
            <div class="estimate-paper__line estimate-paper__line--muted"><span><b>—</b>Оформление таблиц</span><em>можно исправить самостоятельно</em></div>
            <footer><span>Итого</span><strong>7 000 ₽</strong></footer>
          </div>
        </section>

        <section class="payment-terms">
          ${sectionHead("Оплата", "Как устроена оплата")}
          <div class="term-grid">
            <article><span>01</span><h3>По этапам</h3><p>Большую работу делим на части. Следующий платёж — после принятия предыдущего результата.</p></article>
            <article><span>02</span><h3>С чеком</h3><p>После платежа чек и статус доступны в личном кабинете.</p></article>
            <article><span>03</span><h3>С правом отказаться</h3><p>До начала работы платёж возвращается полностью. После начала — за вычетом выполненной части.</p></article>
          </div>
          ${routeLink("oplata", `Подробно об оплате и возврате <span aria-hidden="true">→</span>`, "line-link")}
        </section>

        <aside class="calm-cta calm-cta--inside">
          <div><p class="eyebrow">Точный расчёт</p><h2>Пришлите материалы и срок.</h2><p>Редактор подготовит список задач и стоимость. До подтверждения ничего не запускается.</p></div>
          <div>${routeLink("start", `Запросить смету <span aria-hidden="true">→</span>`, "button button--primary")}</div>
        </aside>
      </div>
    </div>
  `;
}

export function formatsView() {
  const formats = [
    {
      code: "A",
      title: "Диагностика",
      note: "Когда нужно понять состояние работы и выбрать порядок действий.",
      result: "письменный разбор, приоритеты, оценка срока",
      price: "от 2 500 ₽"
    },
    {
      code: "B",
      title: "Редакторский этап",
      note: "Когда задача определена и нужен конкретный результат в документе.",
      result: "правки, комментарии, контрольная проверка",
      price: "по объёму задачи"
    },
    {
      code: "C",
      title: "Сопровождение",
      note: "Когда работа идёт несколько недель и решения зависят друг от друга.",
      result: "план этапов, редактура, сессии, кабинет",
      price: "поэтапная смета"
    }
  ];
  return `
    <div class="standard-page">
      <div class="page-shell">
        ${pageHead({
          eyebrow: "Форматы работы",
          title: "Выберите объём участия редактора.",
          lead: "Формат определяет объём работы и порядок общения. После диагностики его можно изменить.",
          action: `<a class="button button--secondary" href="#formats-list">Сравнить форматы <span aria-hidden="true">↓</span></a>`
        })}
        <div class="format-cards" id="formats-list" tabindex="-1">
          ${formats.map((format, index) => `
            <article>
              <span class="format-cards__code">${format.code}</span>
              <p class="eyebrow">Формат ${format.code}</p>
              <h2>${format.title}</h2>
              <p>${format.note}</p>
              <dl><div><dt>Результат</dt><dd>${format.result}</dd></div><div><dt>Стоимость</dt><dd>${format.price}</dd></div></dl>
              <button class="line-link" type="button" data-start-format="${format.title}">${["Выбрать диагностику", "Выбрать редакторский этап", "Выбрать сопровождение"][index]} <span aria-hidden="true">→</span></button>
            </article>
          `).join("")}
        </div>
        <section class="format-comparison">
          ${sectionHead("Сравнение", "Что меняется между форматами")}
          <div class="comparison-table">
            <div class="comparison-table__row comparison-table__head"><span>Параметр</span><span>Диагностика</span><span>Этап</span><span>Сопровождение</span></div>
            <div class="comparison-table__row"><strong>Письменный результат</strong><span>Да</span><span>Да</span><span>Да</span></div>
            <div class="comparison-table__row"><strong>Правки в документе</strong><span>Нет</span><span>Да</span><span>Да</span></div>
            <div class="comparison-table__row"><strong>Редакторские сессии</strong><span>По запросу</span><span>По запросу</span><span>Включены</span></div>
            <div class="comparison-table__row"><strong>Поэтапная оплата</strong><span>Не требуется</span><span>Возможна</span><span>Да</span></div>
          </div>
        </section>
      </div>
    </div>
  `;
}

const wizardSteps = [
  {
    key: "situation",
    kicker: "Шаг 1",
    title: "Что происходит с работой сейчас?",
    lead: "Выберите ближайшую ситуацию. Это поможет не показывать лишние вопросы.",
    options: [
      ["topic", "Есть тема или задание", "Нужно проверить направление и собрать план."],
      ["draft", "Есть черновик", "Нужна оценка текста и список задач."],
      ["comments", "Получены замечания", "Нужно понять, что именно исправить."],
      ["defense", "Скоро сдача или защита", "Нужна проверка готовности и приоритетов."]
    ]
  },
  {
    key: "workType",
    kicker: "Шаг 2",
    title: "Какая это работа?",
    lead: "Если подходящего варианта нет, выберите «Другое» и уточните в комментарии.",
    options: [
      ["Курсовая работа", "Курсовая работа", "Ваш черновик целиком или отдельная глава."],
      ["ВКР или дипломная", "ВКР или дипломная", "Бакалавриат или специалитет."],
      ["Магистерская", "Магистерская", "Исследование, данные и апробация."],
      ["Научная статья", "Научная статья", "РИНЦ, ВАК или сборник."],
      ["Отчёт по практике", "Отчёт по практике", "Отчёт, дневник и приложения."],
      ["Другое", "Другое", "Опишите задачу на последнем шаге."]
    ]
  },
  {
    key: "result",
    kicker: "Шаг 3",
    title: "Какой результат нужен в первую очередь?",
    lead: "Можно выбрать один вариант. Остальные задачи редактор предложит только после просмотра материалов.",
    options: [
      ["Диагностика", "Понять, что исправлять", "Письменный разбор и порядок действий."],
      ["Редактура", "Доработать текст", "Правки и комментарии в документе."],
      ["Оформление", "Пройти нормоконтроль", "Сверка с методичкой и исправления."],
      ["Защита", "Подготовиться к защите", "Проверить речь и слайды, провести репетицию."],
      ["Нужна рекомендация", "Редактор поможет выбрать формат", "Решение после первичной оценки."]
    ]
  },
  {
    key: "deadline",
    kicker: "Шаг 4",
    title: "Когда нужен первый результат?",
    lead: "Укажите реальный срок. Если редакция не сможет его соблюсти, вы узнаете об этом до оплаты.",
    options: [
      ["1–2 дня", "В течение двух дней", "Подходит только для отдельных задач."],
      ["3–5 дней", "В течение рабочей недели", "Обычно достаточно для диагностики и небольшого этапа."],
      ["1–2 недели", "В течение двух недель", "Подходит для редакторской работы по главам."],
      ["Срок обсуждается", "Срок можно согласовать", "Редактор предложит реалистичный график."]
    ]
  },
  {
    key: "contact",
    kicker: "Шаг 5",
    title: "Куда отправить предварительную оценку задачи?",
    lead: "Контакт нужен только для ответа по этой заявке. Рассылки включаются отдельным согласием.",
    options: []
  }
];

export function wizardView(state) {
  const wizard = state.wizard;
  const stepIndex = Math.max(0, Math.min(wizard.step, wizardSteps.length - 1));
  const step = wizardSteps[stepIndex];
  const selected = wizard[step.key] || "";
  return `
    <div class="wizard-page">
      <div class="wizard-shell">
        <aside class="wizard-sidebar">
          <a class="wizard-sidebar__brand" href="#/home" data-route="home">
            <img src="../../bimi/logo.svg" alt="">
            <span><strong>Академический Салон</strong><small>Новая заявка</small></span>
          </a>
          <div class="wizard-progress" role="progressbar" aria-label="Прогресс заявки" aria-valuemin="1" aria-valuemax="${wizardSteps.length}" aria-valuenow="${stepIndex + 1}">
            <div class="wizard-progress__track"><i style="width:${((stepIndex + 1) / wizardSteps.length) * 100}%"></i></div>
            <span>Шаг ${stepIndex + 1} из ${wizardSteps.length}</span>
          </div>
          <ol class="wizard-steps">
            ${wizardSteps.map((item, index) => `
              <li class="${index === stepIndex ? "is-current" : ""} ${index < stepIndex ? "is-done" : ""}">
                <button type="button" data-wizard-jump="${index}" ${index === stepIndex ? 'aria-current="step"' : ""} ${index > stepIndex ? "disabled" : ""}>
                  <span>${index < stepIndex ? "✓" : String(index + 1).padStart(2, "0")}</span>
                  <strong>${["Ситуация", "Тип работы", "Результат", "Срок", "Контакты"][index]}</strong>
                </button>
              </li>
            `).join("")}
          </ol>
          <div class="wizard-sidebar__help">
            <span class="eyebrow">Нужна помощь?</span>
            <p>Можно описать задачу редактору и не заполнять форму.</p>
            <button type="button" class="line-link" data-open-support>Открыть приёмную</button>
          </div>
        </aside>

        <main class="wizard-main">
          <header class="wizard-main__head">
            <div>
              <p class="eyebrow">${step.kicker}</p>
              <h1>${step.title}</h1>
              <p>${step.lead}</p>
            </div>
            <div class="wizard-main__actions">
              <button class="icon-button wizard-theme" type="button" data-toggle-theme aria-label="Включить тёмную тему"><span data-theme-glyph aria-hidden="true">◐</span><span class="sr-only" data-theme-action>Включить тёмную тему</span></button>
              <button class="icon-button icon-button--close wizard-close" type="button" data-route="home" aria-label="Закрыть заявку">×</button>
            </div>
          </header>

          ${stepIndex < 4 ? `
            <div class="decision-grid ${step.options.length > 4 ? "decision-grid--compact" : ""}" data-wizard-options>
              ${step.options.map(([value, title, note]) => `
                <button class="decision-card ${selected === value ? "is-selected" : ""}" type="button"
                        data-wizard-choice="${escapeHTML(value)}" data-wizard-key="${step.key}"
                        aria-pressed="${selected === value ? "true" : "false"}">
                  <span class="decision-card__radio" aria-hidden="true"><i></i></span>
                  <span><strong>${title}</strong><small>${note}</small></span>
                </button>
              `).join("")}
            </div>
          ` : `
            <div class="contact-step">
              <div class="contact-step__form">
                <label class="field">
                  <span>Имя</span>
                  <input type="text" data-wizard-field="name" value="${escapeHTML(wizard.name || "")}" placeholder="Как к вам обращаться">
                </label>
                <label class="field">
                  <span>Telegram, телефон или почта</span>
                  <input type="text" data-wizard-field="contact" value="${escapeHTML(wizard.contact || "")}" placeholder="Имя пользователя, +7… или name@example.ru">
                </label>
                <label class="field field--wide">
                  <span>Что важно учесть</span>
                  <textarea rows="5" data-wizard-field="comment" placeholder="Можно перечислить замечания, требования или вопросы">${escapeHTML(wizard.comment || "")}</textarea>
                </label>
                <label class="file-drop">
                  <input type="file" multiple data-wizard-files>
                  <span class="file-drop__icon" aria-hidden="true">+</span>
                  <span><strong>Добавить материалы</strong><small>Word, PDF, изображения · в этой вкладке показаны только имена; после перезагрузки выберите файлы снова</small></span>
                </label>
                <div class="file-list" data-file-list>
                  ${(wizard.files || []).map((file) => `<span><i aria-hidden="true">DOC</i>${escapeHTML(file)}<button type="button" data-remove-file="${escapeHTML(file)}" aria-label="Удалить ${escapeHTML(file)}">×</button></span>`).join("")}
                </div>
                <label class="consent-check">
                  <input type="checkbox" data-wizard-consent ${wizard.consent ? "checked" : ""}>
                  <span><strong>Уведомление прочитано.</strong> Я ознакомился с обработкой данных и файлов, необходимых для оценки заявки. Аналитика, рассылки и программа лояльности подключаются отдельным выбором. ${routeLink("consent-request", "Как обрабатываются данные")}</span>
                </label>
              </div>
              <aside class="wizard-summary">
                <p class="eyebrow">Предварительно</p>
                <h2>${escapeHTML(wizard.workType || "Задача не выбрана")}</h2>
                <dl>
                  <div><dt>Ситуация</dt><dd>${escapeHTML({
                    topic: "Есть тема или задание",
                    draft: "Есть черновик",
                    comments: "Получены замечания",
                    defense: "Скоро сдача"
                  }[wizard.situation] || "—")}</dd></div>
                  <div><dt>Первый результат</dt><dd>${escapeHTML(wizard.result || "—")}</dd></div>
                  <div><dt>Срок</dt><dd>${escapeHTML(wizard.deadline || "—")}</dd></div>
                  <div><dt>Стоимость</dt><dd>после просмотра материалов</dd></div>
                </dl>
                <p>Точную стоимость редактор назовёт после просмотра материалов.</p>
              </aside>
            </div>
          `}

          <footer class="wizard-main__footer">
            <div class="wizard-save">
              <i aria-hidden="true"></i>
              <span><strong>Выбранный шаг сохраняется</strong><small>Контакты и текст не сохраняются при перезагрузке или закрытии вкладки</small></span>
            </div>
            <div>
              ${stepIndex > 0 ? `<button class="button button--secondary" type="button" data-wizard-back>Назад</button>` : ""}
              <button class="button button--primary" type="button" data-wizard-next ${stepIndex < 4 && !selected ? "disabled" : ""}>
                ${stepIndex === 4 ? "Подготовить заявку" : "Продолжить"} <span aria-hidden="true">→</span>
              </button>
            </div>
          </footer>
        </main>
      </div>
    </div>
  `;
}

export function applicationView(state) {
  const wizard = state.wizard;
  const ready = Boolean(
    wizard?.name?.trim() &&
    wizard?.contact?.trim() &&
    wizard?.workType &&
    wizard?.result &&
    wizard?.deadline &&
    wizard?.consent
  );
  if (!ready) {
    return `
      <main class="standard-page">
        <div class="narrow-shell">
          ${pageHead({
            eyebrow: "Заявка не заполнена",
            title: "Сначала ответьте на пять коротких вопросов.",
            lead: "Так редактор получит вид работы, желаемый результат, срок и контакт для ответа.",
            compact: true
          })}
          <section class="empty-state-card">
            <span aria-hidden="true">01—05</span>
            <div><h2>Данных для проверки пока нет</h2><p>Вернитесь к форме. Выбранный этап сохраняется в этом браузере, а контакт и текст заявки не записываются в хранилище.</p></div>
            ${routeLink("start", `Заполнить заявку <span aria-hidden="true">→</span>`, "button button--primary")}
          </section>
        </div>
      </main>
    `;
  }
  return `
    <div class="standard-page">
      <div class="narrow-shell">
        ${pageHead({
          eyebrow: "Заявка готова к проверке",
          title: "Проверьте данные перед отправкой.",
          lead: "В рабочей версии редактор получит вид работы, желаемый результат, срок и контакт для ответа. Сейчас данные сохранятся только в этом браузере.",
          compact: true
        })}
        <div class="application-layout">
          <section class="application-paper">
            <header><span>Новая заявка</span><b>Черновик</b></header>
            <dl>
              <div><dt>Имя</dt><dd>${escapeHTML(wizard.name || "Не указано")}</dd></div>
              <div><dt>Контакт</dt><dd>${escapeHTML(wizard.contact || "Не указан")}</dd></div>
              <div><dt>Работа</dt><dd>${escapeHTML(wizard.workType || "Не выбрано")}</dd></div>
              <div><dt>Первый результат</dt><dd>${escapeHTML(wizard.result || "Не выбрано")}</dd></div>
              <div><dt>Срок</dt><dd>${escapeHTML(wizard.deadline || "Не указан")}</dd></div>
              <div><dt>Выбранные файлы</dt><dd>${(wizard.files || []).length ? wizard.files.map(escapeHTML).join(", ") : "Не выбраны"}<small>Содержимое файлов в концепте не загружается</small></dd></div>
            </dl>
            ${wizard.comment ? `<div class="application-paper__comment"><span>Комментарий</span><p>${escapeHTML(wizard.comment)}</p></div>` : ""}
            <footer>
              <span><small>Стоимость</small><strong>после просмотра материалов</strong></span>
              <p>До начала редактор пришлёт состав работ, срок и точную сумму.</p>
            </footer>
          </section>
          <aside class="application-actions">
            <h2>Что произойдёт дальше</h2>
            <p class="eyebrow">В рабочей версии</p>
            <ol>
              <li><span>01</span><p>Редактор проверит файлы и требования.</p></li>
              <li><span>02</span><p>Вы получите состав работ, срок и точную стоимость.</p></li>
              <li><span>03</span><p>Работа начнётся только после вашего подтверждения.</p></li>
            </ol>
            <button class="button button--primary button--large" type="button" data-submit-demo-order>
              Сохранить пример заявки <span aria-hidden="true">→</span>
            </button>
            <button class="button button--text" type="button" data-route="start">Вернуться к форме</button>
          </aside>
        </div>
      </div>
    </div>
  `;
}

export function specificationView() {
  return `
    <div class="standard-page">
      <div class="page-shell">
        ${pageHead({
          eyebrow: "Спецификация",
          title: "Что именно вы получите.",
          lead: "До оплаты фиксируем задачи, результат, срок, стоимость и порядок приёмки. Документ доступен в личном кабинете.",
          action: `<a class="button button--secondary" href="../../assets/docs/specifikaciya-obrazec.pdf" target="_blank" rel="noopener">Открыть пример спецификации <span aria-hidden="true">↗</span></a>`,
          side: `<div class="document-badge"><span>Образец</span><strong>AS-SPEC / 02</strong><small>Редакция от 24.07.2026</small></div>`
        })}
        <div class="spec-layout">
          <article class="spec-paper">
            <header>
              <img src="../../bimi/logo.svg" alt="">
              <div><span>Академический Салон</span><strong>Спецификация к делу DEMO-2417</strong></div>
              <b>24.07.2026</b>
            </header>
            <section>
              <h2>1. Редакторский аудит второй главы</h2>
              <dl>
                <div><dt>Исходный материал</dt><dd>Глава 2, 38 страниц; таблица исходных данных; методичка кафедры.</dd></div>
                <div><dt>Работа редактора</dt><dd>Проверка связи методов, результатов и выводов; редактура формулировок; комментарии к недостающим данным.</dd></div>
                <div><dt>Результат</dt><dd>Файл Word в режиме исправлений и карта задач в PDF.</dd></div>
                <div><dt>Срок</dt><dd>До 28 июля, 18:00 по Москве.</dd></div>
                <div><dt>Стоимость</dt><dd><strong>9 000 ₽</strong></dd></div>
              </dl>
            </section>
            <section>
              <h2>2. Порядок приёмки</h2>
              <p>Заказчик проверяет результат по пунктам спецификации и направляет замечания одним списком в течение трёх календарных дней.</p>
            </section>
            <footer><span>Версия 1.0</span><span>Страница 1 из 1</span></footer>
          </article>
          <aside class="spec-notes">
            <h2>Пять обязательных пунктов</h2>
            <ul>
              <li><span>01</span><div><strong>Исходные материалы</strong><p>Перечень файлов и версий.</p></div></li>
              <li><span>02</span><div><strong>Действия редактора</strong><p>Что именно будет сделано.</p></div></li>
              <li><span>03</span><div><strong>Проверяемый результат</strong><p>Формат и состав передачи.</p></div></li>
              <li><span>04</span><div><strong>Срок</strong><p>Дата и время по Москве.</p></div></li>
              <li><span>05</span><div><strong>Стоимость и приёмка</strong><p>Платёж и порядок замечаний.</p></div></li>
            </ul>
            <a class="button button--secondary" href="../../assets/docs/specifikaciya-obrazec.pdf" target="_blank" rel="noopener">Открыть образец PDF</a>
          </aside>
        </div>
      </div>
    </div>
  `;
}

export function paymentView() {
  return `
    <div class="standard-page">
      <div class="page-shell">
        ${pageHead({
          eyebrow: "Оплата",
          title: "Оплачивайте согласованные этапы.",
          lead: "Сумма и назначение платежа совпадают со спецификацией. Чек появляется в кабинете после подтверждения операции.",
          action: `<button class="button button--secondary" type="button" data-open-payment>Открыть пример оплаты</button>`
        })}
        <div class="payment-flow">
          <article><span>01</span><div><h2>Согласование</h2><p>Редактор присылает спецификацию. Вы проверяете состав, срок и стоимость.</p></div></article>
          <article><span>02</span><div><h2>Ссылка на оплату</h2><p>В кабинете появляется платёж только за согласованный этап.</p></div></article>
          <article><span>03</span><div><h2>Подтверждение</h2><p>После успешной операции статус меняется автоматически, чек сохраняется в деле.</p></div></article>
          <article><span>04</span><div><h2>Начало этапа</h2><p>В истории фиксируется дата старта и ближайший результат.</p></div></article>
        </div>
        <section class="payment-demo">
          <div>
            <p class="eyebrow">Пример платежа</p>
            <h2>Этап 2 · Редактура главы</h2>
            <p>Дело DEMO-2417 · срок результата 28 июля</p>
          </div>
          <strong>14 500 ₽</strong>
          <button class="button button--primary" type="button" data-open-payment>Открыть оплату</button>
        </section>
        <section class="payment-safety">
          ${sectionHead("Важные условия", "До и после платежа")}
          <div>
            <article><h3>Чек</h3><p>Отправляется по правилам применимой системы расчётов и хранится в кабинете.</p></article>
            <article><h3>Возврат</h3><p>До начала этапа — полностью. После начала учитывается фактически выполненная часть.</p></article>
            <article><h3>Новый объём</h3><p>Дополнительные задачи оформляются новой версией спецификации и не запускаются автоматически.</p></article>
          </div>
        </section>
      </div>
    </div>
  `;
}

export function paymentStatusView(state) {
  const paid = state.paymentComplete;
  return `
    <div class="system-page system-page--payment">
      <div class="system-card">
        <div class="system-card__mark ${paid ? "is-success" : "is-loading"}">
          <img src="../../bimi/logo.svg" alt="">
          <i aria-hidden="true"></i>
        </div>
        <p class="eyebrow">Демонстрация оплаты</p>
        <h1>${paid ? "Показано подтверждение оплаты." : "Показан процесс проверки платежа."}</h1>
        <p>${paid ? "В рабочей версии после подтверждения здесь появятся чек и обновлённый статус." : "В рабочей версии здесь обновляется статус операции; в концепте запрос в банк не выполняется."}</p>
        <div class="system-card__facts">
          <span><small>Дело</small><strong>DEMO-2417</strong></span>
          <span><small>Сумма</small><strong>14 500 ₽</strong></span>
          <span><small>Назначение</small><strong>Этап 2</strong></span>
        </div>
        <div class="system-card__actions">
          ${paid ? routeLink("order", `Открыть дело <span aria-hidden="true">→</span>`, "button button--primary") : `<button class="button button--primary" type="button" data-refresh-payment>Показать подтверждённое состояние</button>`}
          ${routeLink("priyomnaya", "Сообщить о проблеме", "button button--text")}
        </div>
      </div>
    </div>
  `;
}

export function dashboardView(state) {
  const draft = state.demoOrder;
  return `
    <div class="account-page">
      <div class="account-shell">
        <aside class="account-nav">
          <div class="account-nav__person">
            <span>ЕК</span>
            <div><strong>Екатерина</strong><small>Клиент с 2025 года</small></div>
          </div>
          <nav aria-label="Личный кабинет">
            <a class="is-current" href="#/dashboard" data-route="dashboard" aria-current="page"><span>Дела</span><b>${orders.length}</b></a>
            <a href="#/order" data-route="order"><span>Сообщения</span><b class="badge-wax">2</b></a>
            <button type="button" data-account-section="documents"><span>Документы</span><b>7</b></button>
            <button type="button" data-account-section="payments"><span>Платежи</span></button>
            <a href="#/referral" data-route="referral"><span>Клуб Салона</span><b>1 250</b></a>
            <a href="#/deposit" data-route="deposit"><span>Депозит</span><b>32 000 ₽</b></a>
          </nav>
          <div class="account-nav__bottom">
            <button type="button" data-open-support>Помощь</button>
            <button type="button" data-profile-settings>Настройки</button>
          </div>
        </aside>
        <main class="account-main">
          <header class="account-main__head">
            <div><p class="eyebrow">Личный кабинет</p><h1>Добрый день, Екатерина.</h1><p>Здесь собраны текущие дела, документы и вопросы редактора.</p></div>
            ${routeLink("start", `Новая заявка <span aria-hidden="true">→</span>`, "button button--primary")}
          </header>

          <section class="account-summary">
            <article><span class="status-dot"><i></i> сейчас</span><strong>1</strong><p>дело в работе</p></article>
            <article><span>Требуется внимание</span><strong>2</strong><p>новых сообщения</p></article>
            <article><span>Бонусный счёт</span><strong>1 250 бонусов</strong><p>условия списания видны в предложении</p></article>
          </section>

          ${draft ? `
            <section class="account-orders account-drafts">
              <header><div><p class="eyebrow">Сохранено в этом браузере</p><h2>Черновики заявок</h2></div></header>
              <div class="order-list">
                <a class="order-card" href="#/start" data-route="start">
                  <div class="order-card__top">
                    <span class="tag tag--status tag--${draft.statusKey}">${draft.status}</span>
                    <span>${draft.id}</span>
                  </div>
                  <h3>${draft.title}</h3>
                  <div class="order-card__stage">
                    <span><small>Состояние</small><strong>${draft.stage}</strong></span>
                    <span><small>Следующий шаг</small><strong>Оценка редактора</strong></span>
                  </div>
                  <footer><span>Продолжить заявку</span><b aria-hidden="true">→</b></footer>
                </a>
              </div>
            </section>
          ` : ""}

          <section class="account-orders">
            <header><h2>Ваши дела</h2><div class="filter-tabs filter-tabs--small"><button class="is-active" type="button" data-order-filter="all">Все</button><button type="button" data-order-filter="active">Активные</button><button type="button" data-order-filter="done">Завершённые</button></div></header>
            <div class="order-list" data-order-list>
              ${orders.map((order, index) => {
                const cardContent = `
                  <div class="order-card__top">
                    <span class="tag tag--status tag--${order.statusKey}">${order.status}</span>
                    <span>${order.id}</span>
                  </div>
                  <h3>${order.title}</h3>
                  <div class="order-card__progress"><i style="width:${order.progress}%"></i></div>
                  <div class="order-card__stage">
                    <span><small>Сейчас</small><strong>${order.stage}</strong></span>
                    <span><small>Ближайший срок</small><strong>${order.deadline}</strong></span>
                  </div>
                  <footer><span>${order.next}</span><b aria-hidden="true">→</b></footer>
                `;
                return index === 0
                  ? `<a class="order-card" href="#/order" data-route="order" data-order-status="${order.statusKey}">${cardContent}</a>`
                  : `<button class="order-card order-card--demo-only" type="button" data-order-status="${order.statusKey}" data-toast="Для этого примера отдельная карточка дела не открывается">${cardContent}</button>`;
              }).join("")}
            </div>
          </section>

          <section class="account-benefits">
            <header><div><p class="eyebrow">Счета и привилегии</p><h2>Разные механизмы — отдельный учёт.</h2></div>${routeLink("loyalty", "Правила программы", "line-link")}</header>
            <div>
              <a class="account-benefit-card account-benefit-card--deposit" href="#/deposit" data-route="deposit">
                <span class="account-benefit-card__mark">₽</span>
                <div><small>Депозит мастерской · пример</small><strong>32 000 ₽</strong><p>денежный остаток для оплаты согласованных этапов</p></div>
                <b aria-hidden="true">→</b>
              </a>
              <a class="account-benefit-card" href="#/referral" data-route="referral">
                <span class="account-benefit-card__mark">Б</span>
                <div><small>Бонусный счёт</small><strong>1 250 бонусов</strong><p>400 бонусов действуют до 31 августа 2026; условия списания видны в предложении</p></div>
                <b aria-hidden="true">→</b>
              </a>
              <a class="account-benefit-card account-benefit-card--plus" href="#/plus" data-route="plus">
                <span class="account-benefit-card__mark">АС+</span>
                <div><small>Абонемент</small><strong>Не активен</strong><p>срок, цена и привилегии доступны до отдельной оплаты</p></div>
                <b aria-hidden="true">→</b>
              </a>
            </div>
          </section>

          <section class="account-quick">
            <button type="button" data-account-section="documents"><span>DOC</span><strong>Все документы</strong><small>Спецификации, акты и чеки</small></button>
            <button type="button" data-open-support><span>?</span><strong>Задать вопрос</strong><small>Укажите номер дела DEMO-2417 в вопросе</small></button>
            <a href="#/referral" data-route="referral"><span>АС</span><strong>Клуб Салона</strong><small>Бонусы и приглашения</small></a>
          </section>
        </main>
      </div>
    </div>
  `;
}

export function orderView(state) {
  const messages = state.messages || [];
  return `
    <div class="account-page">
      <div class="case-shell">
        <header class="case-head">
          <div class="case-head__title">
            ${routeLink("dashboard", `<span aria-hidden="true">←</span> Все дела`, "back-link")}
            <p class="eyebrow">Дело DEMO-2417</p>
            <h1>Редактура ВКР по психологии</h1>
          </div>
          <div class="case-head__status">
            <span class="tag tag--status tag--work">В работе</span>
            <button class="quiet-button" type="button" data-case-menu aria-label="Действия с делом">•••</button>
          </div>
        </header>

        <div class="case-layout">
          <main class="case-main">
            <section class="case-overview">
              <header><div><span class="eyebrow">Текущий этап</span><h2>Редактура второй главы</h2></div><strong><small>Этапы</small>2 из 4</strong></header>
              <div class="case-progress-meta"><span>Готовность текущего этапа</span><strong>62 %</strong></div>
              <div class="case-progress"><i style="width:62%"></i></div>
              <div class="case-overview__facts">
                <span><small>Результат</small><strong>28 июля, до 18:00</strong></span>
                <span><small>Редактор</small><strong>Анна М.</strong></span>
                <span><small>Следующее действие</small><strong>Файл загрузит редактор</strong></span>
              </div>
            </section>

            <section class="case-timeline">
              <header><h2>Ход работы</h2><button type="button" data-toast="История уже отсортирована по новым событиям">Сначала новые</button></header>
              <ol>
                <li class="is-current"><span class="case-timeline__mark">24</span><div><small>24 июля · 12:40</small><h3>Редактор начал работу со второй главой</h3><p>Проверяется связь методов, результатов и выводов. Вопросов к исходным данным пока нет.</p></div></li>
                <li><span class="case-timeline__mark">23</span><div><small>23 июля · 18:15</small><h3>Оплата этапа подтверждена</h3><p>Чек сохранён в разделе документов.</p><button type="button" data-toast="Загрузка недоступна в концепте">Чек · PDF</button></div></li>
                <li><span class="case-timeline__mark">22</span><div><small>22 июля · 14:10</small><h3>Согласована спецификация, версия 2</h3><p>Добавлена проверка двух таблиц и исключена редактура приложений.</p><button type="button" data-toast="Загрузка недоступна в концепте">Спецификация · PDF</button></div></li>
              </ol>
            </section>

            <section class="case-chat">
              <header><div><h2>Диалог по делу</h2><span>Редактор ответит в этом диалоге</span></div><label class="case-file-picker"><input class="sr-only" type="file" multiple data-case-files><span data-case-file-label>Добавить файл</span></label></header>
              <div class="message-list">
                <article class="message message--editor"><span>АМ</span><div><strong>Анна, редактор</strong><p>Екатерина, начала проверку. Подскажите, значения в таблице 7 уже окончательные?</p><small>24 июля, 12:42</small></div></article>
                <article class="message message--client"><div><p>Да, это финальная выгрузка. Дополнительных наблюдений не будет.</p><small>24 июля, 12:51</small></div></article>
                ${messages.map((message) => `<article class="message message--client"><div><p>${escapeHTML(message)}</p><small>только что</small></div></article>`).join("")}
              </div>
              <form class="message-form" data-message-form>
                <label><span class="sr-only">Сообщение редактору</span><textarea rows="2" data-message-input placeholder="Напишите сообщение по этому делу"></textarea></label>
                <button class="button button--primary" type="submit">Сохранить в демо-диалоге</button>
              </form>
            </section>
          </main>

          <aside class="case-aside">
            <section>
              <header><h2>Документы</h2><span>4 файла</span></header>
              <button class="file-row" type="button" data-toast="Загрузка недоступна в концепте"><i>DOC</i><span><strong>ВКР_глава_2.docx</strong><small>1,8 МБ · исходный</small></span><b aria-hidden="true">—</b></button>
              <button class="file-row" type="button" data-toast="Загрузка недоступна в концепте"><i>PDF</i><span><strong>Требования_кафедры.pdf</strong><small>312 КБ · действует для дела</small></span><b aria-hidden="true">—</b></button>
              <button class="file-row" type="button" data-toast="Загрузка недоступна в концепте"><i>PDF</i><span><strong>Спецификация_v2.pdf</strong><small>224 КБ · согласовано</small></span><b aria-hidden="true">—</b></button>
              <button class="file-row" type="button" data-toast="Загрузка недоступна в концепте"><i>PDF</i><span><strong>Чек_14500.pdf</strong><small>96 КБ · оплачено</small></span><b aria-hidden="true">—</b></button>
              <button class="line-link" type="button" data-account-section="documents">Все документы <span aria-hidden="true">→</span></button>
            </section>
            <section class="case-payment">
              <header><h2>Оплата</h2><span>50%</span></header>
              <strong>Оплачено 14 500 ₽ из 29 000 ₽</strong>
              <div><i style="width:50%"></i></div>
              <p>Следующий платёж появится после приёмки текущего этапа.</p>
              <button class="button button--secondary" type="button" data-account-section="payments">История платежей</button>
            </section>
            <section class="case-support">
              <span class="case-support__mark">?</span>
              <h2>Нужна помощь?</h2>
              <p>Чтобы редактор видел контекст, укажите номер дела DEMO-2417.</p>
              <button type="button" class="line-link" data-open-support>Связаться с мастерской</button>
            </section>
          </aside>
        </div>
      </div>
    </div>
  `;
}

export function knowledgeView() {
  const categories = ["Все", ...new Set(guides.map((guide) => guide.category))];
  return `
    <div class="library-page">
      <div class="page-shell">
        ${pageHead({
          eyebrow: "Редакционная библиотека",
          title: "Библиотека для самостоятельной работы.",
          lead: "Статьи отвечают на конкретные вопросы и опираются на действующие требования. Там, где правила зависят от вуза, это указано прямо.",
          side: `<div class="library-count"><strong>${guides.length}</strong><span>разборов и инструкций</span></div>`
        })}

        <div class="library-toolbar library-toolbar--primary">
          <div class="filter-tabs" role="group" aria-label="Темы материалов">
            ${categories.slice(0, 7).map((category, index) => `<button class="${index === 0 ? "is-active" : ""}" type="button" data-guide-filter="${category}">${category}</button>`).join("")}
          </div>
          <label class="catalog-search"><span class="sr-only">Поиск по библиотеке</span><input type="search" data-guide-search placeholder="Найти материал"><i aria-hidden="true">⌕</i></label>
        </div>

        <section class="featured-guide">
          <div>
            <span class="tag tag--wax">Выбор редакции</span>
            <p class="eyebrow">ВКР · методология · 9 минут</p>
            <h2>Введение, которое держит всю работу</h2>
            <p>Как связать актуальность, объект, предмет, цель и задачи так, чтобы главы не жили отдельно от введения.</p>
            ${routeLink("guide-vkr-struktura", `Читать материал <span aria-hidden="true">→</span>`, "button button--primary")}
          </div>
          <div class="featured-guide__visual">
            <span class="featured-guide__folio">01</span>
            <article>
              <span>Актуальность</span><i></i><span>Объект</span><i></i><span>Предмет</span><i></i><span>Цель</span><i></i><span>Задачи</span>
            </article>
          </div>
        </section>

        <div class="article-grid" data-guide-grid>
          ${guides.map(articleCard).join("")}
        </div>
        <button class="catalog-more button button--secondary" type="button" data-catalog-more="guides" hidden>Показать остальные</button>
        <div class="catalog-empty" data-guide-empty role="status" hidden><strong>Материал не найден</strong><p>Сократите запрос или выберите другую тему.</p><button class="button button--secondary" type="button" data-clear-guide-search>Сбросить поиск</button></div>

        <aside class="library-tools">
          <div><p class="eyebrow">Проверить свой материал</p><h2>Бесплатные инструменты</h2><p>Можно начать с автоматической проверки и решить, нужен ли редактор.</p></div>
          <div>
            ${tools.slice(0, 3).map((tool) => `<a href="#/${tool.slug}" data-route="${tool.slug}"><span>${tool.title}</span><b aria-hidden="true">→</b></a>`).join("")}
          </div>
        </aside>
      </div>
    </div>
  `;
}

export function articleView(slug) {
  const guide = getGuide(slug) || guides[0];
  const articleAction = /rinc/i.test(slug)
    ? `<button class="button button--primary" type="button" data-start-service="nauchnaya-statya">Показать рукопись редактору</button>`
    : /normocontrol|titulnyj|prilozheniya/i.test(slug)
      ? `<button class="button button--primary" type="button" data-start-service="normokontrol-vkr">Проверить оформление</button>`
      : /otchet-po-praktike|dnevnik-praktiki|harakteristika/i.test(slug)
        ? `<button class="button button--primary" type="button" data-start-service="otchet-po-praktike">Показать комплект документов</button>`
        : /apellyaciya/i.test(slug)
          ? `<button class="button button--secondary" type="button" data-open-support>Задать вопрос о порядке действий</button>`
          : /prakticheskaya-chast-kursovoy/i.test(slug)
            ? `<button class="button button--primary" type="button" data-start-service="kursovaya-rabota">Показать практическую главу</button>`
            : /istochnik|spisok-literatury|doi/i.test(slug)
    ? routeLink("proverka-istochnikov-vkr", "Проверить список источников", "button button--primary")
    : /temy|vvedenie|obekt|prakticheskaya|zaklyuchenie/i.test(slug)
      ? routeLink("audit-temy-vkr", "Проверить формулировки", "button button--primary")
      : /zashchit|rech|prezentaciya|recenziya|otzyv-rukovoditelya/i.test(slug)
        ? `<button class="button button--primary" type="button" data-start-service="razbor-zamechaniy-nauchruka">Разобрать материалы к защите</button>`
        : `<button class="button button--primary" type="button" data-start-service="razbor-zamechaniy-nauchruka">Проверить свой материал</button>`;
  const categoryRoot = guide.category.split("·")[0].trim();
  const specialRelated = {
    "guide-rinc-statya": ["guide-spisok-literatury", "guide-antiplagiat-ai", "guide-recenziya-na-vkr"],
    "guide-apellyaciya": ["guide-normocontrol", "guide-zashchita-diploma", "guide-otzyv-rukovoditelya-vkr"]
  }[guide.slug] || [];
  const related = [
    ...specialRelated.map((item) => getGuide(item)).filter(Boolean),
    ...guides.filter((item) => item.slug !== guide.slug && item.category.startsWith(categoryRoot))
  ].filter((item, index, list) => list.findIndex((candidate) => candidate.slug === item.slug) === index).slice(0, 3);
  if (related.length < 3) {
    guides.filter((item) => item.slug !== guide.slug && !related.some((candidate) => candidate.slug === item.slug))
      .slice(0, 3 - related.length)
      .forEach((item) => related.push(item));
  }
  return `
    <div class="article-page">
      <div class="reading-progress" data-reading-progress aria-hidden="true"><i></i></div>
      <div class="article-shell">
        <nav class="breadcrumbs" aria-label="Хлебные крошки">${routeLink("home", "Главная")}<span>·</span>${routeLink("knowledge", "Библиотека")}<span>·</span><span>${guide.category}</span></nav>
        <header class="article-hero">
          <div class="article-hero__meta"><span class="tag">${guide.category}</span><span>${guide.reading}</span><span data-source-meta>Проверяем сведения об издании</span></div>
          <h1>${guide.title}</h1>
          <p>${guide.summary}</p>
          <div class="article-hero__byline">
            <span class="article-hero__avatar">АС</span>
            <div><strong>Редакция Академического Салона</strong><small>Ответственный издатель — Семёнов Семён Юрьевич</small></div>
            <button type="button" data-share-current>Поделиться</button>
          </div>
        </header>
        <div class="article-layout">
          <aside class="article-toc" data-source-toc>
            <strong>В материале</strong>
            <span>Содержание загружается…</span>
            <span>Материал № ${String(guides.findIndex((item) => item.slug === guide.slug) + 1).padStart(2, "0")}</span>
          </aside>
          <article class="article-content source-document" data-source-document data-source-kind="article" data-source-slug="${guide.slug}" aria-busy="true">
            <div class="source-loading"><i></i><p>Загружаем опубликованный материал без сокращений.</p></div>
          </article>
          <aside class="article-aside">
            <div><p class="eyebrow">Нужна проверка вашего материала?</p><h3>Редактор отметит приоритеты и объяснит существенные замечания.</h3>${articleAction}</div>
            <div><strong>Материал полезен?</strong><span><button type="button" data-article-rate="yes">Да</button><button type="button" data-article-rate="no">Нет</button></span></div>
          </aside>
        </div>
        <section class="related-articles">
          ${sectionHead("Читайте дальше", "По этой теме")}
          <div class="article-grid">${related.map(articleCard).join("")}</div>
        </section>
      </div>
    </div>
  `;
}

export function toolsView() {
  return `
    <div class="tools-page">
      <div class="page-shell">
        ${pageHead({
          eyebrow: "Инструменты",
          title: "Проверьте материал самостоятельно.",
          lead: "Здесь можно найти перегруженные фразы, проверить формулировку темы и подготовить источники к ручной сверке. Введённый текст не отправляется на сервер.",
          action: `<a class="button button--secondary" href="#tool-list">Выбрать проверку <span aria-hidden="true">↓</span></a>`
        })}
        <div class="tool-grid" id="tool-list" tabindex="-1">
          ${tools.map((tool, index) => `
            <article class="tool-card">
              <div class="tool-card__number">${String(index + 1).padStart(2, "0")}</div>
              <span class="tag ${index < 2 ? "tag--green" : ""}">${tool.status}</span>
              <h2>${tool.title}</h2>
              <p>${tool.short}</p>
              ${routeLink(tool.slug, `${tool.action} <span aria-hidden="true">→</span>`, "line-link")}
            </article>
          `).join("")}
        </div>
        <section class="tools-privacy">
          <span class="tools-privacy__seal">АС</span>
          <div><p class="eyebrow">Работа с данными</p><h2>Проверка должна быть безопасной.</h2></div>
          <p>Перед вставкой удалите фамилии, контакты и неопубликованные данные. Подробнее — в политике обработки данных.</p>
          ${routeLink("privacy", "Как обрабатываются данные", "line-link")}
        </section>
      </div>
    </div>
  `;
}

export function toolView(slug, state) {
  if (slug === "check") return textCheckView(state);
  if (slug === "audit-temy-vkr") return topicAuditView(state);
  if (slug === "proverka-istochnikov-vkr") return sourceCheckView(state);
  return genericToolView(slug);
}

function textCheckView(state) {
  const result = state.textCheck;
  const formalCount = result
    ? (result.formalCount ?? result.findings.filter((item) => item.label !== "✓").reduce((total, item) => total + (Number(item.label) || 0), 0))
    : 0;
  return `
    <div class="tool-workspace">
      <div class="tool-workspace__head">
        ${pageHead({
          eyebrow: "Бесплатный инструмент",
          title: "Проверка академического текста",
          lead: "Вставьте фрагмент до 8 000 знаков. Анализ показывает длину предложений, повторы и слова, которые часто утяжеляют изложение.",
          compact: true
        })}
      </div>
      <div class="checker-layout">
        <section class="checker-input">
          <header><span>Исходный текст</span><span data-char-count>${(state.checkText || "").length.toLocaleString("ru-RU")} / 8 000</span></header>
          <textarea maxlength="8000" data-check-text aria-label="Текст для проверки" placeholder="Вставьте один или несколько абзацев">${escapeHTML(state.checkText || "")}</textarea>
          <footer><button class="button button--primary" type="button" data-run-text-check>Проверить текст</button><button class="button button--text" type="button" data-fill-text-example>Вставить пример</button></footer>
        </section>
        <section class="checker-result ${result ? "has-result" : ""}">
          ${result ? `
            <header><div><p class="eyebrow">Результат</p><h2>${formalCount ? `Формальные признаки: ${formalCount}` : "Формальных признаков не найдено"}</h2></div></header>
            <div class="checker-metrics">
              <div><span>Слов</span><strong>${result.words}</strong></div>
              <div><span>Предложений</span><strong>${result.sentences}</strong></div>
              <div><span>Средняя длина</span><strong>${result.average} слов</strong></div>
            </div>
            <div class="checker-findings">
              ${result.findings.map((item) => `<article class="finding finding--${item.level}"><span>${item.label}</span><div><strong>${item.title}</strong><p>${item.note}</p></div></article>`).join("")}
            </div>
            <p class="checker-disclaimer">Автоматическая проверка видит только формальные признаки. Она не оценивает содержание, фактическую точность или качество исследования.</p>
            <button class="line-link" type="button" data-start-service="redaktura-posle-ii">Нужна ручная проверка <span aria-hidden="true">→</span></button>
          ` : `
            <div class="checker-empty"><span>Аа</span><h2>Здесь появится разбор.</h2><p>Текст обрабатывается только в браузере и не сохраняется в заявке.</p></div>
          `}
        </section>
      </div>
    </div>
  `;
}

function topicAuditView(state) {
  const audit = state.topicAudit;
  return `
    <div class="tool-workspace">
      <div class="page-shell">
        ${pageHead({
          eyebrow: "Бесплатный инструмент",
          title: "Паспорт темы ВКР",
          lead: "Введите формулировку темы и направление. Инструмент поможет проверить масштаб, объект и предполагаемый результат.",
          compact: true
        })}
        <div class="topic-audit">
          <section class="topic-audit__form">
            <label class="field"><span>Тема работы</span><textarea rows="4" data-topic-title placeholder="Например: Связь учебной мотивации и академической тревожности у студентов первого курса">${escapeHTML(state.topicTitle || "")}</textarea></label>
            <label class="field"><span>Направление</span><select data-topic-discipline><option>Психология</option><option>Экономика</option><option>Юриспруденция</option><option>Педагогика</option><option>Менеджмент</option><option>Информатика</option></select></label>
            <button class="button button--primary" type="button" data-run-topic-audit>Собрать паспорт</button>
          </section>
          <section class="topic-audit__result">
            ${audit ? `
              <header><span class="tag tag--green">Черновик паспорта</span><h2>${escapeHTML(state.topicTitle)}</h2></header>
              <dl>
                <div><dt>Предметная область</dt><dd>${audit.area || audit.object}</dd></div>
                <div><dt>Фокус исследования</dt><dd>${audit.focus}</dd></div>
                <div><dt>Что нужно уточнить</dt><dd>${audit.question}</dd></div>
              </dl>
              <div class="article-callout"><span>Редакторский вопрос</span><p>${audit.editor}</p></div>
              <button class="line-link" type="button" data-start-service="plan">Обсудить тему с редактором <span aria-hidden="true">→</span></button>
            ` : `<div class="checker-empty"><span>Т</span><h2>Паспорт появится здесь.</h2><p>Это рабочая подсказка, а не автоматическое согласование темы.</p></div>`}
          </section>
        </div>
      </div>
    </div>
  `;
}

function sourceCheckView(state) {
  const sources = state.sourceResult;
  return `
    <div class="tool-workspace">
      <div class="page-shell">
        ${pageHead({
          eyebrow: "Проверка списка",
          title: "Проверка оформления источников",
          lead: "Вставьте библиографический список построчно. Инструмент отметит записи, в которых не хватает года, автора либо даты обращения для интернет-источника.",
          compact: true
        })}
        <div class="source-checker">
          <section>
            <label class="field"><span>Список источников</span><textarea rows="13" data-source-text placeholder="Одна запись на строку">${escapeHTML(state.sourceText || "")}</textarea></label>
            <button class="button button--primary" type="button" data-run-source-check>Проверить список</button>
            <button class="button button--text" type="button" data-fill-source-example>Вставить пример</button>
          </section>
          <section>
            ${sources ? `
              <header><div><p class="eyebrow">Результат</p><h2>${sources.length} записей</h2></div><span class="tag tag--amber">${sources.filter((item) => item.issue).length} требуют внимания</span></header>
              <div class="source-list">${sources.map((item, index) => `<article class="${item.issue ? "has-issue" : ""}"><span>${String(index + 1).padStart(2, "0")}</span><div><p>${escapeHTML(item.text)}</p><small>${item.issue || "Основные поля найдены"}</small></div></article>`).join("")}</div>
            ` : `<div class="checker-empty"><span>ГОСТ</span><h2>Результаты появятся здесь.</h2><p>Инструмент проверяет заполнение основных полей. Сетевой поиск DOI здесь не выполняется.</p></div>`}
          </section>
        </div>
      </div>
    </div>
  `;
}

function genericToolView(slug) {
  const tool = tools.find((item) => item.slug === slug) || tools[0];
  return `
    <div class="tool-workspace">
      <div class="narrow-shell">
        ${pageHead({ eyebrow: "Инструмент", title: tool.title, lead: tool.short, compact: true })}
        <div class="generic-tool-card">
          <span class="generic-tool-card__mark">АС</span>
          <h2>Соберите требования в одном сообщении.</h2>
          <p>Укажите замечания, повторяющиеся требования и доступные материалы. Редактор проверит исходные данные перед ответом.</p>
          <label class="field"><span>Что нужно проверить</span><textarea rows="6" data-generic-tool-text placeholder="Опишите задачу и доступные материалы"></textarea></label>
          <button class="button button--primary" type="button" data-generic-tool-submit>Подготовить запрос</button>
        </div>
      </div>
    </div>
  `;
}

export function aboutView() {
  return `
    <div class="about-page">
      <div class="page-shell">
        ${pageHead({
          eyebrow: "О мастерской",
          title: "Кто отвечает за работу и материалы.",
          lead: "Мы работаем с материалом автора: проверяем структуру и оформление, разбираем замечания, редактируем текст и помогаем подготовиться к защите."
        })}
        <section class="about-manifesto">
          <div class="about-manifesto__mark"><img src="../../bimi/logo.svg" alt=""><span>АС</span></div>
          <div>
            <p class="eyebrow">Наш подход</p>
            <h2>Автор принимает содержательные решения. Редактор отвечает за согласованные правки и комментарии.</h2>
            <p>Мы разделяем методическую консультацию, редактуру и авторскую работу. Для учебных и аттестационных материалов принимаем только задачи, при которых автор понимает и принимает итоговый текст.</p>
          </div>
        </section>
        <section class="about-principles">
          ${sectionHead("Принципы", "Как принимаются решения")}
          <div>
            <article><span>01</span><h3>Сначала требования</h3><p>Методичка, задание и комментарии руководителя важнее общего шаблона.</p></article>
            <article><span>02</span><h3>Правки видны в документе</h3><p>Существенные решения дополнительно остаются в истории дела.</p></article>
            <article><span>03</span><h3>Разделяем работу автора и редактора</h3><p>Редактор отмечает, что может сделать сам, а где нужны данные или решение автора.</p></article>
            <article><span>04</span><h3>Смета составляется по задачам</h3><p>В расчёт входят только согласованные результаты.</p></article>
          </div>
        </section>
        <section class="team-section">
          ${sectionHead("Ответственность", "Издатель и исполнитель", "Реквизиты исполнителя опубликованы на сайте. Если в задаче участвует предметный специалист, его роль и результат указываются в спецификации.")}
          <div class="team-grid">
            <article><span class="team-avatar">СС</span><div><p class="eyebrow">Ответственный издатель</p><h3>Семёнов Семён Юрьевич</h3><p>Отвечает за условия сервиса, публикацию материалов, исправления и работу с обращениями.</p></div></article>
            <article><span class="team-avatar">НПД</span><div><p class="eyebrow">Статус исполнителя</p><h3>Плательщик налога на профессиональный доход</h3><p>ИНН 212885750445 · Казань. Статус можно проверить через официальный сервис ФНС.</p></div></article>
            <article><span class="team-avatar">АС</span><div><p class="eyebrow">Порядок работы</p><h3>Роли фиксируются в спецификации</h3><p>Если к работе привлекается другой специалист, его роль и результат указываются в спецификации.</p></div></article>
          </div>
        </section>
        <section class="about-history">
          <div><p class="eyebrow">Редакционный стандарт</p><h2>Как создаются и проверяются материалы.</h2></div>
          <ol>
            <li><span>01</span><p>Определяем практический вопрос, на который должен ответить материал.</p></li>
            <li><span>02</span><p>Отделяем общее правило от требований конкретного вуза или издания.</p></li>
            <li><span>03</span><p>Значимые факты сверяем по первичным источникам.</p></li>
            <li><span>04</span><p>При фактической ошибке обновляем материал и дату проверки.</p></li>
          </ol>
        </section>
      </div>
    </div>
  `;
}

export function guaranteesView() {
  return `
    <div class="standard-page">
      <div class="page-shell">
        ${pageHead({
          eyebrow: "Гарантии",
          title: "Как мы фиксируем условия работы.",
          lead: "До оплаты мы фиксируем задачу, формат результата и порядок замечаний."
        })}
        <section class="guarantee-ledger">
          ${[
            ["01", "Состав до оплаты", "Спецификация перечисляет исходные материалы, действия редактора и результат."],
            ["02", "Фиксированная цена этапа", "После согласования она не меняется без новой задачи и вашего подтверждения."],
            ["03", "Видимые изменения", "Правки передаются в согласованном формате; прежняя версия не теряется."],
            ["04", "Исправление по спецификации", "Если пункт выполнен не полностью, редакция исправляет его без дополнительной оплаты."],
            ["05", "Право остановиться", "Следующий этап не запускается автоматически. От него можно отказаться до начала работы."],
            ["06", "Конфиденциальность", "Доступ к материалам получают только участники конкретного дела."]
          ].map(([number, title, text]) => `<article><span>${number}</span><h2>${title}</h2><p>${text}</p></article>`).join("")}
        </section>
        <section class="guarantee-example">
          <div><p class="eyebrow">Как это применяется</p><h2>Замечание сверяем с пунктом спецификации.</h2></div>
          <div class="guarantee-example__flow">
            <span><b>1</b>Вы указываете пункт спецификации</span><i>→</i>
            <span><b>2</b>Редактор проверяет исходную и итоговую версии</span><i>→</i>
            <span><b>3</b>Исправляет несоответствие или объясняет решение</span>
          </div>
        </section>
        <section class="faq-section content-section">
          ${sectionHead("Порядок", "Если что-то пошло не так")}
          <div class="accordion-list">
            <details open><summary>Как направить замечания?<span>+</span></summary><p>Откройте дело в кабинете, выберите результат и отправьте замечания одним списком. Так редактор видит полный объём проверки.</p></details>
            <details><summary>Сколько времени занимает ответ?<span>+</span></summary><p>Срок ответа зависит от объёма, но подтверждение обращения появляется сразу. Конкретная дата указывается в деле.</p></details>
            <details><summary>Когда возможен возврат?<span>+</span></summary><p>До начала этапа — полностью. После начала учитывается фактически выполненная часть. Подробности закреплены в оферте.</p></details>
          </div>
          ${routeLink("refunds", `Открыть правила возврата <span aria-hidden="true">→</span>`, "line-link")}
        </section>
      </div>
    </div>
  `;
}

export function reviewsView() {
  return `
    <div class="reviews-page">
      <div class="page-shell">
        ${pageHead({
          eyebrow: "Книга благодарностей",
          title: "Отзывы в исходном виде.",
          lead: "Текст не пересказываем; личные сведения публикуем только по отдельному согласию.",
          side: `<div class="review-rating"><strong>${reviews.length}</strong><span>сообщений в архиве</span><small>проверено по исходным изображениям</small></div>`
        })}
        <div class="review-proof-grid" data-review-grid>
          ${reviews.map((review) => `
            <figure class="review-shot-card">
              <button type="button" data-review-proof="${review.id}" aria-label="Открыть ${review.label.toLocaleLowerCase("ru")}">
                <img src="../../assets/${review.asset}" alt="" loading="lazy">
                <span aria-hidden="true">↗</span>
              </button>
              <figcaption><span>АС · ${review.id}</span><strong>${review.label}</strong></figcaption>
            </figure>
          `).join("")}
        </div>
        <aside class="review-policy">
          <div><p class="eyebrow">Как читать отзывы</p><h2>Личный опыт не равен обещанию результата</h2></div>
          <ul><li>Сообщения отражают опыт конкретных клиентов</li><li>Оценку, допуск и решение принимает учебное заведение</li><li>Состав услуги фиксируется отдельно для каждой заявки</li></ul>
          ${routeLink("consent-publication", "Условия публикации отзыва", "line-link")}
        </aside>
      </div>
    </div>
  `;
}

export function supportView(state) {
  return `
    <div class="support-page">
      <div class="page-shell">
        ${pageHead({
          eyebrow: "Открытая приёмная",
          title: "Спросите до оформления заявки.",
          lead: "Подскажем, какой материал нужен для оценки, можно ли уложиться в срок и с какого этапа разумно начать.",
          action: `<a class="button button--primary" href="#support-form">Перейти к форме <span aria-hidden="true">↓</span></a>`
        })}
        <div class="support-layout">
          <section class="support-form-card" id="support-form" tabindex="-1">
            <h2>Новый вопрос</h2>
            <p>Опишите вопрос и оставьте контакт. Сейчас вопрос сохранится в этой вкладке и не будет отправлен.</p>
            <label class="field"><span>Ваш вопрос</span><textarea rows="6" data-page-support-message placeholder="Опишите ситуацию и желаемый результат">${escapeHTML(state.supportDraft || "")}</textarea></label>
            <label class="field"><span>Контакт для ответа</span><input type="text" data-page-support-contact placeholder="Telegram, телефон или почта"></label>
            <label class="file-drop file-drop--small"><input type="file" multiple data-page-support-files><span class="file-drop__icon">+</span><span><strong>Добавить файл</strong><small data-page-support-file-name aria-live="polite">Имя файла показывается только в этой вкладке</small></span></label>
            <label class="consent-check"><input type="checkbox" data-page-support-consent><span>Я соглашаюсь на обработку данных для ответа на вопрос.</span></label>
            <button class="button button--primary button--large" type="button" data-page-support-send>Сохранить вопрос</button>
          </section>
          <aside class="support-info">
            <section><p class="eyebrow">Чтобы ответить точнее</p><h2>Укажите три вещи</h2><ol><li><span>01</span>тип и текущую готовность работы</li><li><span>02</span>что нужно получить</li><li><span>03</span>точный срок</li></ol></section>
            <section><p class="eyebrow">Частые вопросы</p>
              <details><summary>Можно без регистрации?<span>+</span></summary><p>Да. Для первичной оценки достаточно контакта для ответа.</p></details>
              <details><summary>Файлы обязательны?<span>+</span></summary><p>Нет, но без них редактор сможет дать только общий ориентир.</p></details>
              <details><summary>Можно задать вопрос по текущему делу?<span>+</span></summary><p>Лучше написать внутри дела: там редактор увидит историю и документы.</p></details>
            </section>
          </aside>
        </div>
      </div>
    </div>
  `;
}

// УСТАРЕЛО 2026-08-04: боевой prolog.html переверстан в светлую экскурсию
// с вкладками (assets/css/prolog-process.css, assets/js/prolog-process.js).
// Этот демонстрационный вид показывает прежнюю тёмную плиту и эталоном
// маршрута «Как работаем» больше не является.
export function storyView() {
  return `
    <div class="story-page">
      <div class="story-shell">
        <header><img src="../../bimi/logo.svg" alt=""><p class="eyebrow">Короткая экскурсия</p><h1>Как рукопись проходит через мастерскую.</h1><p>Показываем работу от первичной оценки до передачи результата.</p></header>
        <ol class="story-steps">
          <li><span>01</span><div><p class="eyebrow">Приёмная</p><h2>Сначала проверяем материалы.</h2><p>Редактор смотрит файлы, требования и срок. Если для оценки не хватает данных, задаёт конкретный вопрос.</p></div><aside><b>Входящие</b><strong>Тема · методичка · черновик</strong></aside></li>
          <li><span>02</span><div><p class="eyebrow">Спецификация</p><h2>До оплаты описываем каждую позицию.</h2><p>Каждая позиция содержит исходный материал, действие редактора и формат результата.</p></div><aside><b>До оплаты</b><strong>Состав · срок · цена</strong></aside></li>
          <li><span>03</span><div><p class="eyebrow">Редакторский стол</p><h2>Сначала логика, затем язык.</h2><p>Проверка идёт от исследовательской задачи к структуре, доказательствам и оформлению.</p></div><aside><b>В документе</b><strong>Правки · комментарии · версии</strong></aside></li>
          <li><span>04</span><div><p class="eyebrow">Дело</p><h2>Вопросы и решения сохраняются в деле.</h2><p>Файлы, платежи и сроки собраны там же.</p></div><aside><b>В кабинете</b><strong>Этап · ответственный · история</strong></aside></li>
          <li><span>05</span><div><p class="eyebrow">Приёмка</p><h2>Результат сверяют со спецификацией.</h2><p>Клиент принимает этап или направляет один список замечаний по согласованным пунктам.</p></div><aside><b>На выходе</b><strong>Файл · чек-лист · следующий шаг</strong></aside></li>
        </ol>
        <footer>${routeLink("start", `Описать задачу <span aria-hidden="true">→</span>`, "button button--primary button--large")}${routeLink("about", "О мастерской", "button button--text")}</footer>
      </div>
    </div>
  `;
}

function benefitNav(active) {
  const items = [
    ["referral", "Бонусы и приглашения"],
    ["plus", "Абонемент «Салон+»"],
    ["deposit", "Депозит мастерской"],
    ["gift", "Сертификаты"],
    ["loyalty", "Правила программы"]
  ];
  return `
    <nav class="benefit-nav" aria-label="Бонусы, абонемент и депозит">
      ${items.map(([slug, label]) => `<a class="${active === slug ? "is-current" : ""}" href="#/${slug}" data-route="${slug}" ${active === slug ? 'aria-current="page"' : ""}>${label}</a>`).join("")}
    </nav>
  `;
}

export function referralView(state) {
  return `
    <div class="club-page">
      <div class="page-shell">
        ${benefitNav("referral")}
        <section class="club-hero">
          <div><p class="eyebrow">Клуб Салона</p><h1>Бонусы за личную рекомендацию.</h1><p>Пригласившему начисляют 5 % бонусами от суммы, которую новый клиент оплатил деньгами. Часть, закрытая бонусами или сертификатом, в расчёт не входит. Приглашённый получает 200 бонусов после первого оплаченного заказа. Оба начисления действуют 90 дней.</p><div>${routeLink("loyalty", "Прочитать полные правила", "button button--primary")}${routeLink("start", "Описать новую задачу", "button button--text")}</div></div>
          <aside><span class="club-seal">АС</span><div><small>Пригласившему</small><strong>5 %</strong></div><div><small>Новому клиенту</small><strong>200 бонусов</strong></div></aside>
        </section>
        <section class="club-grid">
          <article class="club-card club-card--invite">
            <p class="eyebrow">Личная ссылка</p><h2>Ссылка создаётся в Telegram-боте.</h2><p>Она появляется после входа в бот. В концепте показан нерабочий образец. Регистрация по ссылке сама по себе не даёт бонусов: начисление появляется только после фактической оплаты.</p>
            <label><span>Демонстрационный образец</span><div><input readonly value="demo.akademsalon.invalid/i/DEMO-7Q4M" aria-label="Нерабочий образец личной ссылки"><button type="button" data-copy-invite>Как получить</button></div></label>
          </article>
          <article class="club-card">
            <p class="eyebrow">Как это работает</p><h2>Как начисляются бонусы</h2>
            <div class="bonus-list"><span><b>01</b><small>Новый клиент впервые открывает бота по вашей ссылке</small></span><span><b>02</b><small>Оформляет и оплачивает заказ</small></span><span><b>03</b><small>Бонусы начисляются после подтверждения оплаты</small></span></div>
          </article>
          <article class="club-card club-card--plus">
            <p class="eyebrow">Абонемент</p><h2>Салон+</h2><p>Для тех, у кого несколько редакторских задач в течение семестра.</p>
            ${routeLink("plus", `Посмотреть условия <span aria-hidden="true">→</span>`, "line-link")}
          </article>
          <article class="club-card club-card--deposit">
            <p class="eyebrow">Авансовый счёт</p><h2>Депозит мастерской</h2><p>Для оплаты нескольких этапов из заранее внесённой суммы. Бонусы начисляются отдельно от денежного остатка.</p>
            ${routeLink("deposit", `Разобраться в условиях <span aria-hidden="true">→</span>`, "line-link")}
          </article>
        </section>
      </div>
    </div>
  `;
}

export function plusView() {
  return `
    <div class="plus-page">
      <div class="page-shell">
        ${benefitNav("plus")}
        <section class="commerce-hero plus-hero">
          <div class="commerce-hero__copy">
            <p class="eyebrow">Абонемент «Салон+»</p>
            <h1>Привилегии для нескольких задач в течение семестра.</h1>
            <p>Абонемент даёт скидку на подходящие услуги и доступ к указанным функциям на выбранный срок. Он оплачивается отдельно и не продлевается автоматически.</p>
            <div class="commerce-facts" aria-label="Основные условия">
              <span><b>30 или 150 дней</b><small>у двух основных планов</small></span>
              <span><b>Один платёж</b><small>без автоматического списания</small></span>
              <span><b>До 24 часов</b><small>на активацию после оплаты</small></span>
            </div>
            <a class="button button--primary" href="#plus-plans">Сравнить планы <span aria-hidden="true">↓</span></a>
          </div>
          <aside class="membership-pass" aria-label="Образец абонемента Салон+">
            <header><img src="../../bimi/logo.svg" alt=""><span>Академический Салон</span><small>Серия С+ · 2026</small></header>
            <div class="membership-pass__seal">АС+</div>
            <div><p>Абонемент мастерской</p><h2>Салон+</h2><span>Срок и состав фиксируются до оплаты</span></div>
            <dl><div><dt>Продление</dt><dd>только вручную</dd></div><div><dt>Скидка</dt><dd>применяется к подходящему заказу</dd></div><div><dt>Бонусы</dt><dd>учитываются отдельно</dd></div></dl>
            <footer><span>Демонстрационный образец</span><b>АС / PLUS</b></footer>
          </aside>
        </section>

        <section class="plus-plans" id="plus-plans" tabindex="-1">
          <header class="commerce-section-head">
            <div><p class="eyebrow">Три готовых плана</p><h2>Состав и ограничения видны сразу.</h2></div>
            <div class="period-switch" role="group" aria-label="Срок абонемента">
              <button type="button" data-plus-period="month" aria-pressed="false">30 дней</button>
              <button class="is-current" type="button" data-plus-period="semester" aria-pressed="true">150 дней</button>
            </div>
          </header>
          <div class="plus-plan-grid">
            <article class="plus-plan-card">
              <header><span>01</span><p>Базовый план</p></header>
              <h3>Салон+</h3>
              <div class="plus-plan-card__price"><strong data-plus-price-display data-plus-price-month="449 ₽" data-plus-price-semester="999 ₽">999 ₽</strong><small data-plus-period-display data-plus-period-month="30 дней" data-plus-period-semester="150 дней">150 дней</small></div>
              <p>Для регулярных редакторских задач и планирования сдач.</p>
              <ul><li><b>5 %</b><span>скидка, но не более 1 000 ₽ на один заказ</span></li><li><b>01</b><span>приоритет в согласованном графике</span></li><li><b>02</b><span>куратор сессии: график и напоминания</span></li><li><b>03</b><span>доступ к методическим материалам</span></li></ul>
              <button class="button button--secondary" type="button" data-plus-select data-activate-plus data-plus-plan-base="Салон+" data-plus-plan="Салон+ · семестр" data-plus-price="999 ₽" data-plus-days="150 дней">Посмотреть оформление</button>
            </article>
            <article class="plus-plan-card plus-plan-card--featured">
              <header><span>02</span><p>Расширенный план</p><em>Выбор мастерской</em></header>
              <h3>Салон+ Про</h3>
              <div class="plus-plan-card__price"><strong data-plus-price-display data-plus-price-month="1 190 ₽" data-plus-price-semester="2 690 ₽">2 690 ₽</strong><small data-plus-period-display data-plus-period-month="30 дней" data-plus-period-semester="150 дней">150 дней</small></div>
              <p>Когда кроме скидки нужны подготовка к защите и короткая консультация.</p>
              <ul><li><b>10 %</b><span>скидка, но не более 3 000 ₽ на один заказ</span></li><li><b>АС+</b><span>приоритет, куратор и методические материалы базового плана</span></li><li><b>×2</b><span>кэшбэк 10 % бонусами после полной оплаты</span></li><li><b>01</b><span>тренажёр защиты по материалу клиента</span></li><li><b>15′</b><span>одна экспресс-консультация за каждые 30 дней</span></li></ul>
              <button class="button button--primary" type="button" data-plus-select data-activate-plus data-plus-plan-base="Салон+ Про" data-plus-plan="Салон+ Про · семестр" data-plus-price="2 690 ₽" data-plus-days="150 дней">Посмотреть оформление</button>
            </article>
            <article class="plus-plan-card">
              <header><span>03</span><p>Разовый формат</p></header>
              <h3>Сессия с куратором</h3>
              <div class="plus-plan-card__price"><strong>2 990 ₽</strong><small>60 дней</small></div>
              <p>Фиксированный срок для плотного графика сдач без последующего продления.</p>
              <ul><li><b>7 %</b><span>скидка, но не более 2 000 ₽ на один заказ</span></li><li><b>01</b><span>бронь слотов и приоритетная очередь</span></li><li><b>60</b><span>фиксация согласованных цен на срок плана</span></li><li><b>01</b><span>куратор сессии и тренажёр защиты</span></li><li><b>SOS</b><span>один срочный вопрос с ответом в течение часа в рабочее время</span></li></ul>
              <button class="button button--secondary" type="button" data-activate-plus data-plus-plan="Сессия с куратором" data-plus-price="2 990 ₽" data-plus-days="60 дней">Посмотреть оформление</button>
            </article>
          </div>
          <p class="commerce-caption">Абонемент активируется не позднее 24 часов после подтверждения оплаты. Скидка абонемента и бонусы учитываются раздельно; их общий размер не может превышать 25 % стоимости заказа.</p>
        </section>

        <section class="plus-clarity">
          <div><p class="eyebrow">Перед оформлением</p><h2>Что важно не перепутать.</h2></div>
          <dl>
            <div><dt>Абонемент</dt><dd>Отдельная платная услуга на установленный срок. Даёт только те привилегии, которые указаны в выбранном плане.</dd></div>
            <div><dt>Бонусы</dt><dd>Условные единицы скидки. Они не являются деньгами и не используются для оплаты самого абонемента.</dd></div>
            <div><dt>Депозит</dt><dd>Аванс в счёт будущих услуг. Денежный остаток и начисленные за пополнение бонусы учитываются раздельно.</dd></div>
            <div><dt>Термин в правилах</dt><dd>Юридические документы используют название «подписка „Салон+“». На сайте для краткости — «абонемент»; это одна услуга.</dd></div>
          </dl>
        </section>

        <aside class="deposit-bridge">
          <div><p class="eyebrow">Другой сценарий</p><h2>Депозит не заменяет абонемент.</h2><p>Он подходит, если нужно заранее внести сумму на несколько будущих этапов. Скидок по плану депозит сам по себе не даёт.</p>${routeLink("deposit", `Открыть условия депозита <span aria-hidden="true">→</span>`, "button button--secondary")}</div>
          <div><span>Пополнение</span><strong>20 000–60 000 ₽</strong><small>денежный аванс и бонусное начисление показываются отдельно</small></div>
        </aside>

        <section class="commerce-faq accordion-list">
          ${sectionHead("Перед оформлением", "Короткие ответы")}
          <details><summary>Продление происходит автоматически?<span>+</span></summary><p>Нет. Планы оплачиваются разовым платежом и заканчиваются по истечении срока. Новое оформление требуется подтвердить отдельно.</p></details>
          <details><summary>Можно оплатить абонемент бонусами?<span>+</span></summary><p>Нет. Бонусы применяются к подходящим заказам в пределах правил, но не к стоимости абонемента.</p></details>
          <details><summary>Если услугами не воспользовались, что происходит?<span>+</span></summary><p>Непрерывные привилегии действуют весь оплаченный срок. Расчёт по количественным услугам и возможному отказу выполняется по редакции правил, показанной до оплаты.</p></details>
          <details><summary>Где посмотреть юридические условия?<span>+</span></summary><p>В Правилах программы лояльности и Публичной оферте. Ссылки на обе редакции показываются до перехода к оплате.</p></details>
        </section>
      </div>
    </div>
  `;
}

export function depositView() {
  return `
    <div class="deposit-page">
      <div class="page-shell">
        ${benefitNav("deposit")}
        <section class="commerce-hero deposit-hero">
          <div class="commerce-hero__copy">
            <p class="eyebrow">Депозит мастерской</p>
            <h1>Авансовый счёт для нескольких этапов.</h1>
            <p>Вы заранее вносите сумму в счёт будущих услуг и затем оплачиваете из неё согласованные этапы. Это не банковский вклад: проценты на остаток не начисляются.</p>
            <div class="commerce-facts" aria-label="Основные условия">
              <span><b>20 000–60 000 ₽</b><small>одно пополнение</small></span>
              <span><b>До 120 000 ₽</b><small>денежный остаток на счёте</small></span>
              <span><b>8–15 %</b><small>бонусами, не деньгами</small></span>
            </div>
            <a class="button button--primary" href="#deposit-calc">Рассчитать пополнение <span aria-hidden="true">↓</span></a>
          </div>
          <aside class="deposit-ledger-card" aria-label="Как учитывается депозит">
            <header><span>Счёт мастерской</span><small>Демонстрационный пример</small></header>
            <div><small>Денежный остаток</small><strong>30 000 ₽</strong><p>аванс в счёт будущих услуг</p></div>
            <div><small>Бонусный счёт</small><strong>+3 000 бонусов</strong><p>отдельное начисление со сроком действия</p></div>
            <footer><span>Два баланса</span><b>не складываются в одну денежную сумму</b></footer>
          </aside>
        </section>

        <section class="deposit-calculator" id="deposit-calc" tabindex="-1">
          <div class="deposit-calculator__controls">
            <p class="eyebrow">Предварительный расчёт</p>
            <h2>Выберите сумму пополнения.</h2>
            <p>Шкала показывает действующие ступени бонусного начисления. Итог перед оплатой нужно сверить с правилами и платёжной формой.</p>
            <label for="depositRange">Сумма аванса <strong data-deposit-amount>30 000 ₽</strong></label>
            <input id="depositRange" type="range" min="20000" max="60000" step="1000" value="30000" data-deposit-range>
            <div class="deposit-ticks" aria-hidden="true"><span>20 000</span><span>30 000</span><span>45 000</span><span>60 000</span></div>
            <div class="deposit-tiers" aria-label="Ступени бонусного начисления">
              <span data-deposit-tier="20000">от 20 000 <b>8 %</b></span>
              <span class="is-current" data-deposit-tier="30000">от 30 000 <b>10 %</b></span>
              <span data-deposit-tier="45000">от 45 000 <b>12 %</b></span>
              <span data-deposit-tier="60000">60 000 <b>15 %</b></span>
            </div>
          </div>
          <aside class="deposit-receipt">
            <header><span>Расчёт пополнения</span><small>АС · DEP / 01</small></header>
            <dl>
              <div><dt>Вносится деньгами</dt><dd data-deposit-money>30 000 ₽</dd></div>
              <div><dt>Ставка начисления</dt><dd data-deposit-rate>10 %</dd></div>
              <div><dt>Начисляется отдельно</dt><dd data-deposit-bonus>3 000 бонусов</dd></div>
            </dl>
            <div class="deposit-receipt__note"><strong>Важно</strong><p>На оплату этапов направляется денежный остаток. Бонусы уменьшают цену будущего заказа только в пределах правил программы.</p></div>
            <button class="button button--primary" type="button" data-deposit-preview>Посмотреть пополнение</button>
            <small>Реальная оплата отключена в дизайн-концепте.</small>
          </aside>
        </section>

        <section class="deposit-principles">
          <header><p class="eyebrow">Как это работает</p><h2>Деньги и бонусы учитываются раздельно.</h2></header>
          <div>
            <article><span>01</span><h3>Пополнение</h3><p>Вы выбираете сумму от 20 000 до 60 000 ₽ с шагом 1 000 ₽ и проверяете платёжные сведения.</p></article>
            <article><span>02</span><h3>Оплата этапа</h3><p>Из денежного остатка списывается полная стоимость ближайшего согласованного этапа.</p></article>
            <article><span>03</span><h3>Бонусы</h3><p>За пополнение начисляются отдельные бонусы. Их срок действия — 180 дней.</p></article>
            <article><span>04</span><h3>Возврат</h3><p>Неиспользованный денежный остаток можно вернуть. Начисленные бонусы пересчитываются по правилам программы.</p></article>
          </div>
        </section>

        <section class="deposit-terms">
          <div><p class="eyebrow">Границы механизма</p><h2>Что нужно проверить до платежа.</h2></div>
          <dl>
            <div><dt>Статус суммы</dt><dd>Это аванс в счёт будущих услуг, а не вклад и не электронный кошелёк общего назначения.</dd></div>
            <div><dt>Лимит счёта</dt><dd>После пополнения денежный остаток не должен превышать 120 000 ₽.</dd></div>
            <div><dt>Оплата заказа</dt><dd>Этап оплачивается целиком. Если остатка недостаточно, сначала потребуется пополнение или другой способ оплаты.</dd></div>
            <div><dt>Документы</dt><dd>Способ расчёта и применимый платёжный документ показываются перед внесением денег.</dd></div>
          </dl>
          <div class="deposit-terms__actions">${routeLink("loyalty", "Открыть правила программы", "button button--secondary")}${routeLink("oplata", "Как проходит оплата", "button button--text")}</div>
        </section>
      </div>
    </div>
  `;
}

export function giftView(state) {
  const amount = state.giftAmount || 5000;
  const recipient = state.giftName || "";
  const message = state.giftMessage || "";
  return `
    <div class="gift-page">
      <div class="page-shell">
        ${benefitNav("gift")}
        ${pageHead({
          eyebrow: "Подарочный сертификат",
          title: "Подарите время редактора.",
          lead: "Сертификат можно использовать для консультации, диагностики или части редакторской работы. Получатель сам выбирает задачу.",
          action: `<a class="button button--primary" href="#gift-builder">Перейти к оформлению <span aria-hidden="true">↓</span></a>`
        })}
        <div class="gift-builder" id="gift-builder" tabindex="-1">
          <section class="gift-builder__controls">
            <p class="eyebrow">Номинал</p>
            <div class="gift-amounts">${[2000, 5000, 10000, 15000].map((value) => `<button class="${amount === value ? "is-selected" : ""}" type="button" data-gift-amount="${value}">${formatMoney(value)}</button>`).join("")}</div>
            <label class="field"><span>Имя получателя</span><input type="text" data-gift-name value="${escapeHTML(recipient)}" placeholder="Можно оставить пустым"></label>
            <label class="field"><span>Короткое пожелание</span><textarea rows="4" data-gift-message placeholder="До 160 знаков" maxlength="160">${escapeHTML(message)}</textarea></label>
            <button class="button button--primary button--large" type="button" data-prepare-gift>Подготовить макет сертификата</button>
          </section>
          <section class="gift-preview">
            <div class="gift-certificate">
              <header><img src="../../bimi/logo.svg" alt=""><span>Академический Салон</span></header>
              <div><p>Подарочный сертификат</p><strong>${formatMoney(amount)}</strong><span data-gift-preview-name>${recipient ? `Получатель: ${escapeHTML(recipient)}` : "Для редакторской консультации или работы"}</span><em data-gift-preview-message ${message ? "" : "hidden"}>${escapeHTML(message)}</em></div>
              <footer><span>Рекомендуемый срок предъявления — 12 месяцев</span><b>AS · GIFT</b></footer>
            </div>
            <p>Неиспользованный остаток сохраняется. В рабочей версии PDF и код появятся после оплаты; здесь доступен только макет.</p>
          </section>
        </div>
        <section class="deposit-terms gift-terms">
          <div><p class="eyebrow">До оформления</p><h2>Основные условия сертификата.</h2></div>
          <dl>
            <div><dt>Срок предъявления</dt><dd>Рекомендуемый срок — 12 месяцев. Его окончание не означает безвозмездного списания неиспользованного аванса.</dd></div>
            <div><dt>Остаток</dt><dd>Сохраняется на коде для следующих заказов. Законный держатель может запросить возврат после проверки кода и отсутствия двойного использования.</dd></div>
            <div><dt>Ограничения</dt><dd>Сертификатом нельзя оплатить абонемент «Салон+» или другой сертификат.</dd></div>
            <div><dt>Бонусы</dt><dd>При покупке сертификата бонусы не начисляются и к его оплате не применяются.</dd></div>
          </dl>
          <div class="deposit-terms__actions">${routeLink("oferta", "Условия в публичной оферте", "button button--secondary")}${routeLink("priyomnaya", "Задать вопрос", "button button--text")}</div>
        </section>
      </div>
    </div>
  `;
}

export function legalView(slug) {
  const page = getLegal(slug) || legalPages[0];
  return `
    <div class="legal-page">
      <div class="reading-progress" data-reading-progress aria-hidden="true"><i></i></div>
      <div class="legal-shell">
        <aside class="legal-nav">
          <strong>Документы</strong>
          ${legalPages.map((item) => `<a class="${item.slug === page.slug ? "is-current" : ""}" href="#/${item.slug}" data-route="${item.slug}" ${item.slug === page.slug ? 'aria-current="page"' : ""}>${item.title}</a>`).join("")}
        </aside>
        <main class="legal-content">
          <nav class="breadcrumbs">${routeLink("home", "Главная")}<span>·</span><span>Документы</span></nav>
          <header><p class="eyebrow">Правовая информация</p><h1>${page.title}</h1><p data-source-lead>${page.short}</p><div><span data-source-meta>Редакция от ${page.updated}</span><button type="button" data-print-page>Версия для печати</button></div></header>
          <nav class="legal-toc" data-source-toc data-source-toc-label="В документе" aria-label="Содержание документа">
            <strong>В документе</strong>
            <span>Содержание загружается…</span>
          </nav>
          <div class="legal-source source-document" data-source-document data-source-kind="legal" data-source-slug="${page.slug}" aria-busy="true">
            <div class="source-loading"><i></i><p>Загружаем опубликованную редакцию документа.</p></div>
          </div>
        </main>
      </div>
    </div>
  `;
}

export function adminView(state) {
  const formattedDate = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Moscow"
  }).format(new Date());
  const todayLabel = formattedDate.charAt(0).toLocaleUpperCase("ru") + formattedDate.slice(1);
  return `
    <div class="admin-page">
      <div class="admin-shell">
        ${adminSidebar("admin")}
        <main class="admin-main">
          <header class="admin-head"><div><p class="eyebrow">Редакционный кабинет</p><h1>Рабочий стол</h1><p>${todayLabel} · Москва</p></div><div><button class="header-action" type="button" data-admin-quick>Создать</button><span class="admin-profile">СМ</span></div></header>
          <section class="admin-alert"><span>3</span><div><strong>Дела требуют решения сегодня</strong><p>Два срока под риском, в одном деле клиент ждёт новую спецификацию.</p></div><a href="#/admin-orders" data-route="admin-orders">Открыть очередь <span>→</span></a></section>
          <section class="admin-metrics">
            <article><span>Активные дела</span><strong>27</strong><small><i class="up">+4</i> за неделю</small></article>
            <article><span>На согласовании</span><strong>8</strong><small>3 дела ждут ответа больше суток</small></article>
            <article><span>Срок сегодня</span><strong>5</strong><small><i class="warn">2 срока под риском</i></small></article>
            <article><span>Поступления за месяц</span><strong>684 500 ₽</strong><small><i class="up">+12%</i> к июню</small></article>
          </section>
          <div class="admin-dashboard-grid">
            <section class="admin-panel admin-queue">
              <header><div><h2>Сегодня</h2><span>По ближайшему сроку</span></div>${routeLink("admin-orders", "Вся очередь", "line-link")}</header>
              <div>
                ${[
                  ["11:00", "DEMO-2421", "Согласовать смету", "Курсовая · экономика", "attention"],
                  ["14:00", "DEMO-2417", "Загрузить правки", "ВКР · психология", "work"],
                  ["16:30", "DEMO-2399", "Провести консультацию", "Научная статья", "meeting"],
                  ["18:00", "DEMO-2430", "Ответить на вопрос", "Отчёт по практике", "new"]
                ].map(([time, id, action, work, status]) => `<button type="button" data-admin-order="${id}"><span>${time}</span><i class="admin-status admin-status--${status}"></i><div><strong>${action}</strong><small>${id} · ${work}</small></div><b>→</b></button>`).join("")}
              </div>
            </section>
            <section class="admin-panel admin-load">
              <header><div><h2>Загрузка редакторов</h2><span>Следующие 7 дней</span></div><button type="button" data-admin-panel="team">Команда</button></header>
              <div class="load-chart">
                ${[68, 84, 72, 92, 58, 32, 18].map((value, index) => `<span><i style="height:${value}%"></i><small>${["Пн","Вт","Ср","Чт","Пт","Сб","Вс"][index]}</small><b>${value}%</b></span>`).join("")}
              </div>
              <footer><span><i class="admin-status admin-status--work"></i>Работа</span><span><i class="admin-status admin-status--meeting"></i>Сессии</span></footer>
            </section>
            <section class="admin-panel admin-quality">
              <header><div><h2>Качество</h2><span>Последние 30 дней</span></div></header>
              <div><strong>94%</strong><span>этапов приняты с первого раза</span></div>
              <dl><div><dt>Средний ответ</dt><dd>34 мин</dd></div><div><dt>Возвращено на доработку</dt><dd>6%</dd></div><div><dt>Оценка</dt><dd>4,9</dd></div></dl>
            </section>
            <section class="admin-panel admin-inbox">
              <header><div><h2>Новые обращения</h2><span>7 непрочитанных</span></div><button type="button" data-toast="Действие недоступно в концепте">Прочитать все</button></header>
              <div><button type="button" data-open-support><span>ЕК</span><div><strong>Екатерина</strong><small>«Можно ли добавить проверку таблиц…»</small></div><time>12:51</time></button><button type="button" data-open-support><span>НС</span><div><strong>Никита</strong><small>«Получил новые замечания руководителя»</small></div><time>11:08</time></button></div>
            </section>
          </div>
        </main>
      </div>
    </div>
  `;
}

function adminSidebar(current) {
  const items = [
    ["admin", "Рабочий стол", "⌂"],
    ["admin-visits", "Посещения", "V"],
    ["admin-orders", "Дела", "Д"],
    ["admin-clients", "Клиенты", "К"],
    ["admin-reviews", "Отзывы", "О"],
    ["admin-qa", "Приёмная", "?"],
    ["admin-gifts", "Сертификаты", "П"],
    ["admin-leads", "Обращения", "Л"],
    ["admin-broadcast", "Рассылки", "Р"],
    ["admin-settings", "Настройки", "⚙"],
    ["admin-content", "Материалы", "М"],
    ["admin-covers", "Обложки", "И"]
  ];
  return `
    <aside class="admin-sidebar">
      <a class="admin-sidebar__brand" href="#/admin" data-route="admin"><img src="../../bimi/logo.svg" alt=""><span><strong>Академический Салон</strong><small>Редакционный кабинет</small></span></a>
      <nav aria-label="Разделы администрирования">
        ${items.map(([slug, title, icon]) => `<a class="${current === slug ? "is-current" : ""}" href="#/${slug}" data-route="${slug}" ${current === slug ? 'aria-current="page"' : ""}><i>${icon}</i><span>${title}</span>${slug === "admin-orders" ? "<b>8</b>" : ""}</a>`).join("")}
      </nav>
      <div class="admin-sidebar__section"><span>Сервис</span><a href="#/admin-visits" data-route="admin-visits"><i>↗</i>Отчёты</a></div>
      <footer><a href="#/home" data-route="home">Открыть сайт <span>↗</span></a><button class="admin-sidebar__theme" type="button" data-toggle-theme><i data-theme-glyph aria-hidden="true">◐</i><span data-theme-action>Сменить тему</span></button><span>Рабочая среда</span></footer>
    </aside>
  `;
}

export function adminOrdersView() {
  const rows = [
    ["DEMO-2431", "Мария К.", "Разбор замечаний", "Новая", "new", "Сегодня, 15:00", "2 500 ₽"],
    ["DEMO-2421", "Илья П.", "Курсовая · экономика", "Нужна смета", "attention", "Сегодня, 17:00", "9 000 ₽"],
    ["DEMO-2417", "Екатерина К.", "ВКР · психология", "В работе", "work", "28 июля", "29 000 ₽"],
    ["DEMO-2408", "Алексей М.", "Статья РИНЦ", "На согласовании", "meeting", "29 июля", "7 000 ₽"],
    ["DEMO-2399", "Никита С.", "Методическая сессия", "Встреча", "meeting", "Сегодня, 16:30", "3 000 ₽"],
    ["DEMO-2384", "Алина В.", "Нормоконтроль", "Завершён", "done", "23 июля", "5 000 ₽"]
  ];
  return `
    <div class="admin-page">
      <div class="admin-shell">
        ${adminSidebar("admin-orders")}
        <main class="admin-main">
          <header class="admin-head"><div><p class="eyebrow">Операционная работа</p><h1>Дела</h1><p>27 активных · 8 требуют решения</p></div><div><button class="button button--primary" type="button" data-admin-new-order>Создать дело</button><span class="admin-profile">СМ</span></div></header>
          <div class="admin-toolbar">
            <label><span class="sr-only">Поиск дел</span><input type="search" data-admin-order-search placeholder="Номер, клиент или услуга"><i>⌕</i></label>
            <div class="filter-tabs filter-tabs--small"><button class="is-active" type="button" data-admin-order-filter="all">Все</button><button type="button" data-admin-order-filter="new">Новые</button><button type="button" data-admin-order-filter="attention">Требуется решение</button><button type="button" data-admin-order-filter="work">В работе</button><button type="button" data-admin-order-filter="done">Завершённые</button></div>
            <button class="quiet-button" type="button" data-admin-panel="order-filters">Фильтры</button>
          </div>
          <section class="admin-table-wrap">
            <table class="admin-table">
              <thead><tr><th><label class="table-check"><input type="checkbox"><span class="sr-only">Выбрать все дела</span></label></th><th>Дело</th><th>Клиент</th><th>Задача</th><th>Статус</th><th>Ближайший срок</th><th>Сумма</th><th></th></tr></thead>
              <tbody data-admin-order-rows>
                ${rows.map(([id, client, task, status, key, deadline, amount]) => `<tr data-admin-status="${key}" data-admin-search="${id} ${client} ${task}"><td><label class="table-check"><input type="checkbox"><span class="sr-only">Выбрать дело ${id}</span></label></td><td><strong>${id}</strong></td><td>${client}</td><td><span>${task}</span></td><td><span class="tag tag--status tag--${key}">${status}</span></td><td>${deadline}</td><td><strong>${amount}</strong></td><td><button type="button" data-admin-order="${id}" aria-label="Открыть дело ${id}">→</button></td></tr>`).join("")}
              </tbody>
            </table>
          </section>
          <footer class="admin-pagination"><span>6 демонстрационных записей</span><div><button type="button" data-admin-panel="order-columns">Настроить столбцы</button></div></footer>
        </main>
      </div>
    </div>
  `;
}

export function adminClientsView() {
  return `
    <div class="admin-page"><div class="admin-shell">${adminSidebar("admin-clients")}<main class="admin-main">
      <header class="admin-head"><div><p class="eyebrow">Отношения с клиентами</p><h1>Клиенты</h1><p>История дел, согласия и обращения</p></div><div><button class="button button--secondary" type="button" data-toast="Экспорт недоступен в концепте">Экспорт</button><span class="admin-profile">СМ</span></div></header>
      <section class="client-directory">
        <div class="client-directory__list">
          <label><input type="search" data-client-search placeholder="Поиск по клиентам"><i>⌕</i></label>
          ${[
            ["ЕК", "Екатерина К.", "3 дела · последнее сегодня", "is-current"],
            ["ИП", "Илья П.", "1 новое обращение", ""],
            ["НС", "Никита С.", "2 дела · консультация сегодня", ""],
            ["АВ", "Алина В.", "1 завершённое дело", ""],
            ["МР", "Мария Р.", "4 дела · Салон+", ""]
          ].map(([avatar, name, note, className]) => `<button class="${className}" type="button" data-client="${name}" aria-pressed="${className ? "true" : "false"}"><span>${avatar}</span><div><strong>${name}</strong><small>${note}</small></div><b>→</b></button>`).join("")}
        </div>
        <div class="client-profile">
          <header><span class="client-profile__avatar" data-client-profile-avatar>ЕК</span><div><p class="eyebrow">Карточка клиента</p><h2 data-client-profile-name>Екатерина К.</h2><span data-client-profile-since>Клиент с сентября 2025</span></div><button class="quiet-button" type="button" data-admin-panel="client-actions" aria-label="Действия с клиентом">•••</button></header>
          <div class="client-profile__contacts"><span><small>Telegram</small><strong data-client-profile-telegram>@ekaterina</strong></span><span><small>Телефон</small><strong data-client-profile-phone>+7 ••• •••-42-18</strong></span><span><small>Последний ответ</small><strong data-client-profile-reply>24 июля, 12:51</strong></span></div>
          <section><header><h3>Активное дело</h3><a href="#/order" data-route="order">Открыть дело</a></header><div class="client-case"><span class="tag tag--work" data-client-profile-status>В работе</span><strong data-client-profile-case>DEMO-2417 · Редактура ВКР по психологии</strong><small data-client-profile-deadline>Следующий результат 28 июля</small></div></section>
          <section><header><h3>Согласия</h3><button type="button" data-admin-panel="client-consents">История</button></header><div class="consent-status"><span><i class="ok">✓</i>Заявка и договор</span><span><i class="ok">✓</i>Программа лояльности</span><span><i>—</i>Маркетинговые сообщения</span></div></section>
          <section><header><h3>Заметка команды</h3></header><textarea rows="4" data-client-profile-note aria-label="Внутренняя заметка команды" placeholder="Внутренняя заметка, не видна клиенту">Предпочитает письменные пояснения к каждому существенному изменению.</textarea><button class="button button--secondary" type="button" data-toast="Сохранение недоступно в концепте">Сохранить заметку</button></section>
        </div>
      </section>
    </main></div></div>
  `;
}

export function adminContentView(state = {}) {
  const content = guides.slice(0, 8);
  const statuses = ["published", "draft", "review", "published", "published", "draft", "published", "review"];
  const statusLabels = {
    published: ["Опубликовано", "24 июля 2026", "tag--green"],
    draft: ["Черновик", "Нужна редактура", ""],
    review: ["На проверке", "Источник изменён", "tag--amber"]
  };
  return `
    <div class="admin-page"><div class="admin-shell">${adminSidebar("admin-content")}<main class="admin-main">
      <header class="admin-head"><div><p class="eyebrow">Редакционная система</p><h1>Публикации сайта</h1><p>${guides.length} публикаций · 3 требуют обновления</p></div><div><button class="button button--primary" type="button" data-admin-new-article>Новая публикация</button><span class="admin-profile">СМ</span></div></header>
      <section class="content-overview">
        <article><span>Опубликовано</span><strong>${guides.length}</strong><small>+4 за месяц</small></article><article><span>Черновики</span><strong>6</strong><small>2 готовы к проверке</small></article><article><span>Требуют обновления</span><strong>3</strong><small>изменились источники</small></article><article><span>Просмотры за месяц</span><strong>48 320</strong><small>+18%</small></article>
      </section>
      <div class="admin-toolbar"><label><span class="sr-only">Поиск публикаций</span><input type="search" data-content-search placeholder="Название или тема"><i>⌕</i></label><div class="filter-tabs filter-tabs--small"><button class="is-active" type="button" data-content-filter="all">Все</button><button type="button" data-content-filter="published">Опубликовано</button><button type="button" data-content-filter="draft">Черновики</button><button type="button" data-content-filter="review">На проверке</button></div></div>
      <section class="content-list">
        ${content.map((guide, index) => {
          const [label, note, className] = statusLabels[statuses[index]];
          const draft = state.contentDrafts?.[guide.slug];
          const title = draft?.title || guide.title;
          const summary = draft?.summary || guide.summary;
          const draftLabel = draft ? "Локальный черновик" : label;
          const draftNote = draft ? "не опубликован" : note;
          const draftClass = draft ? "" : className;
          return `<article data-content-status="${draft ? "draft" : statuses[index]}" data-content-slug="${guide.slug}"><span class="content-list__index">${String(index + 1).padStart(2, "0")}</span><div><span class="tag">${guide.category}</span><h2>${escapeHTML(title)}</h2><p>${escapeHTML(summary)}</p></div><div><span class="tag ${draftClass}">${draftLabel}</span><small>${draftNote}</small></div><div><button type="button" data-content-preview="${guide.slug}" aria-label="Открыть предпросмотр: ${escapeHTML(title)}">↗</button><button type="button" data-content-edit="${guide.slug}">Редактировать</button></div></article>`;
        }).join("")}
      </section>
    </main></div></div>
  `;
}

export function adminCoversView(state) {
  const zoom = Math.min(88, Math.max(56, Number(state.coverZoom) || 72));
  return `
    <div class="admin-page"><div class="admin-shell">${adminSidebar("admin-covers")}<main class="admin-main">
      <header class="admin-head"><div><p class="eyebrow">Мастерская обложек</p><h1>Обложки для публикаций</h1><p>Единая система для сайта и социальных площадок</p></div><div><button class="button button--secondary" type="button" data-toast="Архив недоступен в концепте">Архив</button><span class="admin-profile">СМ</span></div></header>
      <div class="cover-studio">
        <section class="cover-controls">
          <h2>Новая обложка</h2>
          <label class="field"><span>Заголовок</span><textarea rows="3" data-cover-title>Как проверить структуру ВКР</textarea></label>
          <label class="field"><span>Рубрика</span><select data-cover-category><option>Методология</option><option>Оформление</option><option>Защита</option><option>Публикации</option></select></label>
          <fieldset><legend>Композиция</legend><div class="cover-layout-options"><button class="is-selected" type="button" data-cover-layout="editorial">Редакционная</button><button type="button" data-cover-layout="index">Индекс</button><button type="button" data-cover-layout="quote">Цитата</button></div></fieldset>
          <fieldset><legend>Формат</legend><div class="cover-layout-options"><button class="is-selected" type="button" data-cover-format="1200×630">Сайт</button><button type="button" data-cover-format="1080×1350">Лента</button><button type="button" data-cover-format="1080×1920">История</button></div></fieldset>
          <button class="button button--primary" type="button" data-generate-cover>Обновить предпросмотр</button>
        </section>
        <section class="cover-canvas-wrap">
          <header><span>Предпросмотр · 1200 × 630</span><div><button type="button" data-cover-zoom="-8" aria-label="Уменьшить масштаб">−</button><span data-cover-zoom-value>${zoom}%</span><button type="button" data-cover-zoom="8" aria-label="Увеличить масштаб">+</button></div></header>
          <div class="cover-canvas-viewport">
            <div class="cover-canvas" data-cover-canvas style="--cover-zoom:${zoom / 72}">
              <div class="cover-canvas__brand"><img src="../../bimi/logo.svg" alt=""><span>Академический Салон</span></div>
              <div class="cover-canvas__index">01 / МЕТОДОЛОГИЯ</div>
              <h2 data-cover-preview-title>Как проверить<br>структуру ВКР</h2>
              <div class="cover-canvas__lines"><i></i><i></i><i></i></div>
              <footer><span>Редакционная библиотека</span><b>akademsalon.ru</b></footer>
            </div>
          </div>
          <footer><button class="button button--secondary" type="button" data-toast="Экспорт PNG недоступен в концепте">Экспорт PNG</button><button class="button button--text" type="button" data-toast="Сохранение недоступно в концепте">Сохранить вариант</button></footer>
        </section>
      </div>
    </main></div></div>
  `;
}

export function systemView(slug) {
  const config = {
    "404": {
      code: "404",
      kicker: "Страница не найдена",
      title: "Похоже, адрес изменился.",
      note: "Проверьте ссылку или перейдите в нужный раздел. Черновики заявок и данные кабинета не затронуты.",
      action: "На главную",
      route: "home"
    },
    "50x": {
      code: "503",
      kicker: "Сервис временно недоступен",
      title: "Соединение временно недоступно.",
      note: "Не повторяйте оплату, пока статус операции не проверен. Если вы заполняли заявку, выбранные ответы останутся в этом браузере.",
      action: "Проверить соединение",
      route: "50x"
    },
    maintenance: {
      code: "АС",
      kicker: "Технические работы",
      title: "Кабинет временно недоступен.",
      note: "Срок восстановления появится здесь после подтверждения. Срочный вопрос можно оставить в приёмной.",
      action: "Открыть приёмную",
      route: "priyomnaya"
    }
  }[slug] || {};
  const primaryAction = slug === "50x"
    ? `<button class="button button--primary" type="button" data-system-retry>${config.action} <span aria-hidden="true">→</span></button>`
    : routeLink(config.route, `${config.action} <span aria-hidden="true">→</span>`, "button button--primary");
  const secondaryAction = slug === "maintenance"
    ? routeLink("home", "На главную", "button button--text")
    : slug === "50x"
      ? routeLink("home", "На главную", "button button--text")
      : routeLink("services", "Посмотреть услуги", "button button--text");
  return `
    <div class="system-page">
      <div class="system-card">
        <div class="system-card__code">${config.code}</div>
        <p class="eyebrow">${config.kicker}</p>
        <h1>${config.title}</h1>
        <p>${config.note}</p>
        <div class="system-card__actions">${primaryAction}${secondaryAction}</div>
        <footer><img src="../../bimi/logo.svg" alt=""><span>Академический Салон</span></footer>
      </div>
    </div>
  `;
}

export function stateGalleryView() {
  const states = [
    {
      group: "Ожидание и отсутствие данных",
      items: [
        {
          tone: "loading",
          code: "LOAD",
          title: "Загружаем дело",
          text: "Проверяем этапы, файлы и последние сообщения. Обычно это занимает несколько секунд.",
          body: `<div class="state-preview__skeleton" aria-label="Пример индикатора загрузки"><i></i><i></i><i></i></div>`,
          action: ""
        },
        {
          tone: "empty",
          code: "EMPTY",
          title: "Дел пока нет",
          text: "После отправки заявки здесь появятся этапы, документы и сообщения редактора.",
          body: `<div class="state-preview__mark" aria-hidden="true">＋</div>`,
          action: routeLink("start", "Описать задачу", "button button--primary")
        },
        {
          tone: "offline",
          code: "OFFLINE",
          title: "Нет соединения",
          text: "Черновик сохранён в браузере. Продолжить отправку можно после восстановления связи.",
          body: `<div class="state-preview__signal" aria-hidden="true"><i></i><i></i><i></i></div>`,
          action: `<button class="button button--secondary" type="button" data-toast="Соединение проверено: это демонстрация">Проверить соединение</button>`
        }
      ]
    },
    {
      group: "Доступ и проверка данных",
      items: [
        {
          tone: "auth",
          code: "401",
          title: "Нужно войти заново",
          text: "Сеанс завершён. Несохранённый текст останется в этой вкладке до повторного входа.",
          body: `<div class="state-preview__mark" aria-hidden="true">АС</div>`,
          action: `<button class="button button--primary" type="button" data-toast="Авторизация в демонстрационной версии отключена">Войти</button>`
        },
        {
          tone: "permission",
          code: "403",
          title: "Раздел недоступен",
          text: "У текущей роли нет права видеть содержимое. Можно вернуться к доступным разделам или запросить доступ.",
          body: `<dl class="state-preview__facts"><div><dt>Роль</dt><dd>Редактор</dd></div><div><dt>Нужное право</dt><dd>Финансы</dd></div></dl>`,
          action: `<button class="button button--secondary" type="button" data-toast="Демо-запрос доступа подготовлен">Запросить доступ</button>`
        },
        {
          tone: "validation",
          code: "422",
          title: "Проверьте два поля",
          text: "Срок указан не полностью, а контакт для ответа пока пуст. Остальные ответы сохранены.",
          body: `<ul class="state-preview__issues"><li><span>Срок</span><b>Укажите дату</b></li><li><span>Контакт</span><b>Нужен способ связи</b></li></ul>`,
          action: `<button class="button button--primary" type="button" data-state-validation>Исправить поля</button>`
        }
      ]
    },
    {
      group: "Сбой и восстановление",
      items: [
        {
          tone: "conflict",
          code: "409",
          title: "Данные изменились",
          text: "Другой сотрудник сохранил новую версию. Сравните изменения, прежде чем заменять её своим вариантом.",
          body: `<dl class="state-preview__facts"><div><dt>Ваша версия</dt><dd>14:24</dd></div><div><dt>Новая версия</dt><dd>14:31</dd></div></dl>`,
          action: `<button class="button button--secondary" type="button" data-state-compare>Сравнить версии</button>`
        },
        {
          tone: "limit",
          code: "429",
          title: "Слишком много попыток",
          text: "Повторная проверка станет доступна через 42 секунды. Вводить данные заново не нужно.",
          body: `<div class="state-preview__timer"><strong>00:42</strong><span>до следующей попытки</span></div>`,
          action: `<button class="button button--secondary" type="button" disabled aria-disabled="true">Повторить позже</button>`
        },
        {
          tone: "error",
          code: "503",
          title: "Сервис не ответил",
          text: "Не запускайте платёж повторно. Сначала проверьте его статус, чтобы избежать двойной операции.",
          body: `<div class="state-preview__receipt"><span>Операция</span><strong>DEMO-PAY-2417</strong><small>Статус не получен</small></div>`,
          action: `<button class="button button--primary" type="button" data-toast="Статус проверен: операция демонстрационная">Проверить статус</button>`
        },
        {
          tone: "success",
          code: "OK",
          title: "Соединение восстановлено",
          text: "Соединение вернулось. Черновик и выбранный раздел сохранены, можно продолжать.",
          body: `<div class="state-preview__mark" aria-hidden="true">✓</div>`,
          action: routeLink("dashboard", "Вернуться к делу", "button button--primary")
        }
      ]
    }
  ];

  return `
    <main class="state-gallery-page">
      <div class="page-shell">
        ${pageHead({
          eyebrow: "Системные состояния",
          title: "Что увидит пользователь при ошибке.",
          lead: "Каждое сообщение объясняет, что произошло, что уже сохранено и какое действие безопасно. Здесь собраны состояния публичного сайта, кабинета и админки.",
          side: `<div class="library-count"><strong>10</strong><span>состояний проверено</span></div>`
        })}
        <aside class="state-principles" aria-label="Принципы системных сообщений">
          <div><span>01</span><strong>Без обвинений</strong><p>Не перекладываем техническую проблему на человека.</p></div>
          <div><span>02</span><strong>Без неопределённости</strong><p>Показываем статус данных и ожидаемый следующий шаг.</p></div>
          <div><span>03</span><strong>Без опасного повтора</strong><p>Перед новой оплатой или отправкой сначала проверяем результат.</p></div>
        </aside>
        <div class="state-gallery">
          ${states.map((section) => `
            <section class="state-gallery__group">
              <header><h2>${section.group}</h2><span>${section.items.length}</span></header>
              <div class="state-gallery__grid">
                ${section.items.map((item) => `
                  <article class="state-preview state-preview--${item.tone}">
                    <header><span>${item.code}</span><i aria-hidden="true"></i></header>
                    <div class="state-preview__body">
                      ${item.body}
                      <h3>${item.title}</h3>
                      <p>${item.text}</p>
                    </div>
                    <footer>${item.action}</footer>
                  </article>
                `).join("")}
              </div>
            </section>
          `).join("")}
        </div>
        <section class="state-handoff">
          <div><p class="eyebrow">Отдельные экраны</p><h2>Проверьте состояния в реальном масштабе.</h2><p>Страницы 404, технических работ и недоступности сервиса используют те же правила текста, цвета и действий.</p></div>
          <nav aria-label="Полноэкранные состояния">
            ${routeLink("404", "<span>404</span><strong>Неверная ссылка</strong><b>→</b>")}
            ${routeLink("50x", "<span>503</span><strong>Сервис недоступен</strong><b>→</b>")}
            ${routeLink("maintenance", "<span>АС</span><strong>Технические работы</strong><b>→</b>")}
          </nav>
        </section>
      </div>
    </main>
  `;
}

export function redirectView() {
  return `
    <div class="system-page">
      <div class="system-card">
        <div class="system-card__code">→</div>
        <p class="eyebrow">Раздел обновлён</p>
        <h1>Разбор замечаний теперь открыт на отдельной странице.</h1>
        <p>Там описаны результат, порядок работы и данные, которые понадобятся редактору.</p>
        <div class="system-card__actions">${routeLink("razbor-zamechaniy-nauchruka", `Открыть актуальную страницу <span aria-hidden="true">→</span>`, "button button--primary")}${routeLink("services", "Все услуги", "button button--text")}</div>
      </div>
    </div>
  `;
}

export function siteMapView() {
  const sections = [...new Set(routeRegistry.map((route) => route.section))];
  const familyLabels = {
    home: "Главная",
    services: "Каталог",
    service: "Услуга",
    discipline: "Направление",
    "service-alias": "Услуга",
    tariffs: "Цены",
    formats: "Форматы",
    wizard: "Форма",
    application: "Заявка",
    specification: "Документ",
    payment: "Оплата",
    "payment-status": "Статус",
    dashboard: "Кабинет",
    order: "Дело",
    knowledge: "Библиотека",
    article: "Статья",
    tools: "Инструменты",
    tool: "Проверка",
    about: "Мастерская",
    guarantees: "Условия",
    reviews: "Отзывы",
    support: "Приёмная",
    story: "История",
    referral: "Бонусы",
    plus: "Абонемент",
    deposit: "Депозит",
    gift: "Сертификат",
    legal: "Документ",
    admin: "Управление",
    "admin-orders": "Управление",
    "admin-clients": "Управление",
    "admin-content": "Управление",
    "admin-covers": "Управление",
    "admin-extra": "Управление",
    system: "Состояние",
    "state-gallery": "Состояния",
    redirect: "Переход",
    "site-map": "Навигация"
  };
  return `
    <div class="site-map-page">
      <div class="page-shell">
        ${pageHead({
          eyebrow: "Карта полного концепта",
          title: "Все разделы и маршруты.",
          lead: `${routeRegistry.length} экранов собраны на общих шаблонах. Откройте любой маршрут, чтобы проверить его на компьютере и телефоне.`,
          side: `<div class="library-count"><strong>${routeRegistry.length}</strong><span>маршрутов в концепте</span></div>`
        })}
        <label class="site-map-search"><span>Поиск по карте</span><input type="search" data-route-map-search placeholder="Название страницы или функция"><i>⌕</i></label>
        <div class="site-map-groups" data-route-map>
          ${sections.map((section) => {
            const routes = routeRegistry.filter((route) => route.section === section);
            return `<section data-route-section><header><h2>${section}</h2><span>${routes.length}</span></header><div>${routes.map((route) => `<a href="#/${route.slug}" data-route="${route.slug}" data-route-map-item data-search="${route.title} ${route.description} ${route.family}"><span class="tag">${familyLabels[route.family] || route.section}</span><strong>${route.title}</strong><p>${route.description}</p><b aria-hidden="true">→</b></a>`).join("")}</div></section>`;
          }).join("")}
        </div>
      </div>
    </div>
  `;
}

export function renderRoute(slug, state) {
  const route = findRoute(slug);
  const family = route?.family;
  if (!route) return systemView("404");
  if (slug === "home") return homeView(state);
  if (family === "services") return servicesView();
  if (family === "service" || family === "discipline" || family === "service-alias") return serviceView(slug === "dorabotka-otcheta-po-praktike" ? "otchet-po-praktike" : slug);
  if (family === "tariffs") return tariffsView();
  if (family === "formats") return formatsView();
  if (family === "wizard") return wizardView(state);
  if (family === "application") return applicationView(state);
  if (family === "specification") return specificationView();
  if (family === "payment") return paymentView();
  if (family === "payment-status") return paymentStatusView(state);
  if (family === "dashboard") return dashboardView(state);
  if (family === "order") return orderView(state);
  if (family === "knowledge") return knowledgeView();
  if (family === "article") return articleView(slug);
  if (family === "tools") return toolsView();
  if (family === "tool") return toolView(slug, state);
  if (family === "about") return aboutView();
  if (family === "guarantees") return guaranteesView();
  if (family === "reviews") return reviewsView();
  if (family === "support") return supportView(state);
  if (family === "story") return storyView();
  if (family === "referral") return referralView(state);
  if (family === "plus") return plusView();
  if (family === "deposit") return depositView();
  if (family === "gift") return giftView(state);
  if (family === "legal") return legalView(slug);
  if (family === "admin") return adminView(state);
  if (family === "admin-orders") return adminOrdersView();
  if (family === "admin-clients") return adminClientsView();
  if (family === "admin-content") return adminContentView(state);
  if (family === "admin-covers") return adminCoversView(state);
  if (family === "admin-extra") return adminExtraView(slug);
  if (family === "system") return systemView(slug);
  if (family === "state-gallery") return stateGalleryView();
  if (family === "redirect") return redirectView();
  if (family === "site-map") return siteMapView();
  return homeView(state);
}

export function getMobileMeta(slug) {
  const route = findRoute(slug);
  if (!route || slug === "home") return { title: "Академический Салон", kicker: "Редакторская мастерская", back: false };
  const map = {
    services: "Услуги",
    tariffs: "Цены",
    knowledge: "Библиотека",
    tools: "Инструменты",
    dashboard: "Личный кабинет",
    order: "Дело DEMO-2417",
    start: "Новая заявка",
    configurator: "Новая заявка",
    admin: "Редакционный кабинет",
    "admin-orders": "Дела",
    "admin-clients": "Клиенты",
    "admin-content": "Материалы",
    "admin-covers": "Обложки"
  };
  return {
    title: map[slug] || route.title,
    kicker: route.section,
    back: true
  };
}

export function getSearchItems() {
  return routeRegistry
    .filter((route) => !["Управление", "Системные"].includes(route.section) && !["dashboard", "order"].includes(route.family))
    .map((route) => ({
    slug: route.slug,
    title: route.title,
    description: route.description,
    section: route.section,
    search: `${route.title} ${route.description} ${route.section} ${route.family}`.toLocaleLowerCase("ru")
    }));
}

export const wizardStepCount = wizardSteps.length;
