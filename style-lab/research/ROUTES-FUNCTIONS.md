# ROUTES & FUNCTIONS — read-only inventory

Снимок: 2026-07-24.  
Область: текущий production-каркас в корне репозитория, его HTML, CSS, JavaScript, изображения, `robots.txt` и `sitemap.xml`.  
Назначение: контракт для полного pre-production прототипа в `style-lab`; не спецификация нового визуального решения.

В ходе инвентаризации production-код и существующие core-файлы `style-lab` не изменялись. Прототип обязан работать на синтетических данных и не должен обращаться к production API, аналитике, платёжным системам или внешним интеграциям.

## 1. Сводка

- В корне найдено **89 HTML-файлов**: 88 отслеживаемых Git и 1 локальный игнорируемый стенд `zk-test.html`.
- В `sitemap.xml` опубликовано **73 URL**.
- Вне sitemap остаются 16 служебных, транзакционных или legacy-маршрутов: `404.html`, `50x.html`, `admin-covers.html`, `admin.html`, `consent-analytics.html`, `consent-marketing.html`, `consent-publication.html`, `consent-request.html`, `consent.html`, `dashboard.html`, `expertise.html`, `maintenance.html`, `oplaceno.html`, `prolog.html`, `zayavka.html`, `zk-test.html`.
- Архитектура — статические HTML/CSS и vanilla JavaScript без package manager, bundler и frontend-framework.
- Основной общий runtime: `assets/js/app.js`; поверх него подключаются `extras.js`, `cart.js`, `knowledge.js`, `press.js`, `pereplet.js`, `cabinet.js`, `admin.js`, `topic-audit.js`, `doi-checker.js`.
- Основные стилевые слои: `assets/css/styles.css`, `chrome.css`, `mobile.css`, `extras.css`, `service-v2.css`, `knowledge.css`, `cart.css`, `legal-showcase.css`, `tools.css`, `pereplet.css`, `press.css`, `rescue-v1.css`.
- `robots.txt` разрешает публичный сайт, запрещает `/api/` и указывает `https://akademsalon.ru/sitemap.xml`.
- Знак «АС» существует в точных файловых версиях. Общий header/runtime при этом использует другой знак — `¶`; это одна из явных причин визуальной неконсистентности.

## 2. Легенда поведения прототипа

| Код | Поведение в `style-lab` |
|---|---|
| `L` | Локальная навигация между экранами/состояниями прототипа. |
| `S` | Полностью безопасная симуляция в памяти на frozen fixtures. |
| `D` | Демонстрационный control: показывает modal/toast/result, но не выполняет реальное действие. |
| `X` | Жёстко запрещённое действие: control визуально представлен, но сетевой вызов, редирект и побочный эффект исключены. |

Любое действие, которое в production создаёт, меняет, оплачивает, публикует, отправляет, удаляет или раскрывает данные, в прототипе получает только `D`/`X`.

## 3. Матрица page family → routes → actions → contracts → prototype

| Page family | Routes | Ключевые действия | Сохраняемые контракты | Поведение прототипа |
|---|---|---|---|---|
| Главная | `index.html` | Hero CTA, press-калькулятор, открыть/закрыть «переплёт», пролог, переходы к услугам/приёмной, контакт | Главный бренд-вход; смета остаётся предварительной; переход в конфигуратор; hash `#smeta`; пролог может быть закрыт | `L` по разделам, `S` для калькулятора/переплёта, `D` для контакта |
| Вход, цена, конфигурация | `start.html`<br>`tariffs.html`<br>`configurator.html`<br>`vedenie.html`<br>`plan.html` | Выбор сценария, фильтр услуг, сравнение тарифов, 4-step wizard, корзина, промо/сертификат, вложения, заявка, fixed-price plan | Тип работы, дисциплина, срок, tier/контур, service questions, предварительная цена, согласие, claim/success; query/hash-контракты не теряются | `L`, `S` для расчёта/валидации/корзины; файл — только имя и размер; submit/payment/auth — `D/X` |
| Основные service landing | `avtorskiy-zakaz.html`<br>`diplomnaya-po-ekonomike.html`<br>`diplomnaya-po-psihologii.html`<br>`diplomnaya-po-yurisprudencii.html`<br>`diplomnaya-rabota.html`<br>`kandidatskaya-dissertaciya.html`<br>`kursovaya-po-ekonomike.html`<br>`kursovaya-po-informatike.html`<br>`kursovaya-po-menedzhmentu.html`<br>`kursovaya-po-pedagogike.html`<br>`kursovaya-po-psihologii.html`<br>`kursovaya-po-yurisprudencii.html`<br>`kursovaya-rabota.html`<br>`magisterskaya-dissertaciya.html`<br>`nauchnaya-statya.html`<br>`otchet-po-praktike.html`<br>`referat.html` | Изучить состав услуги, цену/сроки, FAQ/доказательства, добавить позицию, начать заказ | Service id, тип работы/дисциплина, scope, тарифная логика, академическая добросовестность, CTA в configurator/cart | Одна консистентная service-template; `L` к wizard, `S` add-to-cart; никакой заявки в сеть |
| Точечные экспертные услуги | `razbor-zamechaniy-nauchruka.html`<br>`normokontrol-vkr.html`<br>`redaktura-posle-ii.html`<br>`dorabotka-otcheta-po-praktike.html`<br>`dosie-nauchruka.html` | Выбор пакета/кейса, dossier tabs, CTA заказа | Чёткое разграничение диагностики, редактуры и доработки; контуры A / B1 / B2; отсутствие обещаний оценки/процента | `L`, `S` для tabs/package selector, `D` для заказа |
| Knowledge hub | `knowledge.html` | Поиск, topic filter, сохранение карточки, чтение, share/copy, browser history | Query `q`, `topic`; состояние выдачи; saved shelf; корректный back/forward | `S` с fixtures и lab-only state; URL можно менять только внутри lab; share/copy — user-initiated `D/S` |
| Guides | `guide-antiplagiat-ai.html`<br>`guide-apellyaciya.html`<br>`guide-dnevnik-praktiki.html`<br>`guide-harakteristika-s-praktiki.html`<br>`guide-kursovaya-za-nedelyu.html`<br>`guide-normocontrol.html`<br>`guide-obekt-predmet-cel-zadachi.html`<br>`guide-otchet-po-praktike.html`<br>`guide-otzyv-rukovoditelya-vkr.html`<br>`guide-prakticheskaya-chast-kursovoy.html`<br>`guide-prezentaciya-k-zashchite.html`<br>`guide-prilozheniya-po-gost.html`<br>`guide-recenziya-na-vkr.html`<br>`guide-rech-na-zashchitu.html`<br>`guide-rinc-statya.html`<br>`guide-skolko-stoit-diplomnaya.html`<br>`guide-skolko-stoit-kursovaya.html`<br>`guide-spisok-literatury.html`<br>`guide-temy-vkr.html`<br>`guide-titulnyj-list.html`<br>`guide-vkr-struktura.html`<br>`guide-vvedenie-kursovoy.html`<br>`guide-zaklyuchenie-kursovoy.html`<br>`guide-zaklyuchenie-vkr.html`<br>`guide-zashchita-diploma.html` | TOC, progress, next/prev, save, copy/share, related CTA | Структура статьи, якоря, reading progress, saved state, корректные related links и оговорки | Общий editorial-template; `L/S`; clipboard/share только по явному нажатию либо demo toast |
| Инструменты | `check.html`<br>`audit-temy-vkr.html`<br>`proverka-istochnikov-vkr.html` | Проверить текст, 8-field audit темы, вставить sample, copy/share, проверить DOI | `check` и topic audit локальны; DOI принимает пачку до 20, показывает найденное/сомнительное и metadata | `S` на fixtures; DOI — только fixture resolver, **без Crossref** |
| Бренд и сообщество | `about.html`<br>`reviews.html`<br>`priyomnaya.html` | История/принципы, фильтры/пагинация/lightbox отзывов, поиск/теги QA, задать вопрос, «у меня тот же вопрос» | Живая/статическая выдача, псевдоним, quiet answer и email, consent, anti-spam honeypot, hash вопроса | Frozen reviews/QA; `L/S`; submit/vote/email — `D/X` |
| Коммерция, доверие, клуб | `gift.html`<br>`referral.html`<br>`plus.html`<br>`loyalty.html`<br>`oplata.html`<br>`guarantees.html`<br>`specifikaciya.html` | Купить/проверить сертификат, пригласить, выбрать подписку, sliders, изучить оплату/гарантии/спецификацию | Номинал/получатель/доставка, referral token, plan terms, бонусы/депозит, этапная оплата, статьи гарантий, состав спецификации | Selectors/sliders `S`; выпуск, invite, subscribe, PDF, online/manual payment — `D/X` |
| Legal | `oferta.html`<br>`privacy.html`<br>`terms.html`<br>`academic-integrity.html`<br>`refunds.html`<br>`requisites.html`<br>`consent.html`<br>`consent-analytics.html`<br>`consent-marketing.html`<br>`consent-publication.html`<br>`consent-request.html` | Чтение, TOC, печать/копирование, переходы между документами | Текст, версии, определения, реквизиты, ссылки согласий, withdrawal/request semantics нельзя сокращать или переосмысливать визуально | `L`; текст read-only; печать/copy только явно; request/withdraw — `D/X` |
| Транзакционные и закрытые | `zayavka.html`<br>`oplaceno.html`<br>`dashboard.html`<br>`admin.html`<br>`admin-covers.html` | Offer/оплата/claim, payment return, кабинет, админка, генератор обложек | Полные state machines, URL contracts, auth gates, роли, защищённые файлы, история и подтверждения | Полностью синтетические state galleries. Canvas export допустим только из local fixture; auth/payment/API/admin mutation — `X` |
| Системные, legacy, harness | `404.html`<br>`50x.html`<br>`maintenance.html`<br>`expertise.html`<br>`prolog.html`<br>`zk-test.html` | Вернуться/повторить, health polling, meta redirect, пролог, fixture controls | Верные HTTP/SEO-смыслы, retry/maintenance copy, redirect intent, тестовые offer states | `S` для смены состояния; polling/fetch/redirect выключены; `zk-test` не публиковать |

Проверка полноты матрицы: 1 + 5 + 17 + 5 + 1 + 25 + 3 + 3 + 7 + 11 + 5 + 6 = **89 маршрутов**, каждый корневой HTML указан ровно в одном семействе.

## 4. Общий shell и сквозные действия

### 4.1 Header, footer, mobile chrome

Наблюдаемые действия:

- логотип/brand link на главную;
- desktop navigation, выпадающие группы, mobile drawer;
- page rail/TOC, home/back control;
- глобальный поиск/поиск по knowledge;
- mobile dock;
- открыть корзину, изменить количество, удалить, undo, очистить;
- открыть кабинет и показать badge;
- theme toggle, calm/reduced-motion toggle;
- consent bar и «настройки данных»;
- contact sheet;
- help/resume/exit-promo bars;
- marginalia/уведомления, отметить прочитанным;
- tours, prelude, invitation modal;
- copy/share/print controls;
- ссылки Telegram, VK, MAX и email.

Контракты для прототипа:

- shell должен одинаково работать на всех публичных templates;
- desktop и mobile имеют один набор смыслов, но mobile проектируется как самостоятельная app-shell, а не сжатый desktop;
- backdrop, focus trap, Escape, focus return и scroll lock обязательны для drawer/dialog/sheet/cart;
- никакой production badge, live-order polling или unread state не загружается;
- social/contact controls показывают demo-sheet; внешние deep links не открываются автоматически;
- consent UI можно демонстрировать, но он не ставит cookies и не пишет production key.

### 4.2 Две буквальные HTML-формы

В корневых HTML найдены только две literal `<form>`; основные формы кабинета, администратора, подарка и конфигуратора собираются/обрабатываются JavaScript.

| Форма | Поля и controls | Production action | Prototype |
|---|---|---|---|
| `tariffs.html#nfForm` | `nfTask`, `nfContact`, honeypot `nfSite`, `nfConsent`, submit; рядом category/service tabs, dossier filters | `POST /orders` | Local validation + synthetic success; submit перехвачен |
| `priyomnaya.html#prForm` | `prQ`, pseudonym, email, `prQuiet`, consent, honeypot; search/tag filters и vote buttons | `POST /qa`; `POST /qa/:id/same` | Local validation + demo receipt; vote только меняет fixture |

### 4.3 Wizard/configurator

Сохраняемый порядок и данные:

1. Выбор типа работы/услуги и поиск по каталогу.
2. Дисциплина, срочность, tier/контур, обязательные service questions.
3. Тема, срок, детали, состав, add-ons и вложения.
4. Канал связи, имя/контакт, согласие, promo/gift, итоговая предварительная смета.

Controls и состояния:

- next/back/stepper, route resume, edit section;
- filters, work/service cards, tier selector, quantity;
- add/remove cart item, change quantity, note and add-on;
- promo and gift validation;
- quote-to-email;
- drag/drop/file picker/remove attachment;
- consent and honeypot validation;
- submit, loading, error, retry, success, claim.

Cart/request payload — отдельный сохраняемый контракт:

- cart schema `version: 1`;
- request `schema_version: "2.0-request"`;
- `legal_status: "request_only_not_contract_price"`;
- `currency: "RUB"`;
- `specification_required_before_payment: true`;
- у каждой позиции `price_status: "estimate_only"`;
- обычная помощь получает `contract_contour: "A"` и обязательный
  `academic_submode: "A1" | "A2"`; A2 используется только для совместной
  исследовательской разработки с нуля и требует зафиксированного участия Заказчика;
- авторский заказ получает `contract_contour: "B1" | "B2"` либо промежуточный
  `B_PENDING` до выбора варианта; промежуточная строка не может стать оплачиваемой спецификацией;
- `kind`, `legal_service_type`, `service_id`, `type`, `label`, `qty`, `unit`, `disc`, `term`, `tier`, `topic`, `deadline`, `requirements`, `note`, `answers`, `scope`, `schedule`, `customer_inputs`, `deliverables`, acceptance/corrections, IP/actual-author/third-party-performer profiles и quote preview не должны теряться при redesign;
- до оплаты сервер должен заполнить/подтвердить `server_line_id`, unit definition, included/excluded scope, customer inputs, deliverables, contractor due date, dependencies, acceptance criteria, unit/line prices, discount and payment-stage allocations, cancellation effect, contract contour, permitted purpose, IP and actual-author profile.

Prototype:

- использует frozen копию калькуляторных значений, а итог маркирует «демо-оценка»;
- хранит wizard/cart только в памяти текущей вкладки;
- file input не читает содержимое и не отправляет bytes; в UI остаются только безопасные `name`, `size`, synthetic progress;
- promo/gift/auth/claim/submission отрисовываются fixtures;
- synthetic ids должны иметь вид `DEMO-…`, чтобы их нельзя было принять за production-заказ.

### 4.4 Gift flow

Controls:

- preset denomination, custom amount;
- buyer name/email, recipient name/email;
- message, delivery method/date;
- consent, honeypot;
- buy, online pay, mark manual payment, undo/cancel;
- holder lookup by code, state refresh, PDF.

States:

- blank/config loading;
- validation error;
- created/unpaid;
- awaiting/manual marked;
- paid/active;
- spent/empty;
- expired, blocked, cancelled;
- holder not found.

Все эти состояния — fixtures. Генерация реального сертификата, email, PDF, платёж и изменение статуса запрещены.

### 4.5 Reviews and reception

- `reviews.html`: статические/загружаемые отзывы, filters, pagination, media lightbox.
- `priyomnaya.html`: query search, tags, anchor `#q<ID>`, same-question vote, public/quiet question.
- Quiet question требует корректной email-логики; honeypot и rate-limit errors должны иметь макеты.
- В прототипе используются только вымышленные авторы, тексты и media placeholders.

### 4.6 Local tools

| Route | Current behavior | Prototype contract |
|---|---|---|
| `check.html` | Локальный анализ текста; минимальная длина 200 символов; sample; результат без API | Можно воспроизводить полностью локально |
| `audit-temy-vkr.html` | Восемь полей, local scoring до 100, sample, copy | Можно воспроизводить полностью локально |
| `proverka-istochnikov-vkr.html` | До 20 DOI, concurrency 3, timeout 10s, Crossref metadata | Только заранее заданные DOI fixtures; любой другой DOI получает безопасное demo-state |
| `admin-covers.html` | Inputs + canvas; PNG 1200×675 / 2400×1350 | Разрешён локальный canvas export только synthetic cover |

## 5. URL, query и hash contracts

| Scope/route | Параметры | Смысл |
|---|---|---|
| Common attribution | `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `yclid`, `gclid` | First/last campaign capture только при согласии |
| Common referral | `ref` | Referral code → `salon_ref` |
| Common referrer | external origin/path | Consent-gated attribution |
| `configurator.html` | `service`, `plan=1`, `step`, `compose`, `order`, `work`, `promo`, `gift`, `resume` | Prefill, resume, plan/service/cart composition |
| `knowledge.html` | `q`, `topic` | Search/filter; `pushState`/`replaceState`/`popstate` |
| `gift.html` | `code`, `buy`, `t` | Holder view, purchase restore/token |
| `plan.html` | `promo` | Promo-prefilled plan |
| `dashboard.html` | `#home`, `#orders`, `#wallet`, `#club`, `#help`, `#plus` | Cabinet tabs/deep link |
| `dashboard.html` | `#claim=` или `?claim=` | Claim guest order |
| `dashboard.html` | `#oauth=`, `#oauth_err=` | OAuth return |
| `dashboard.html` | `#imp=` | Admin impersonation entry |
| `dashboard.html` | `?paid=`, `?thanks=` | Payment return/thanks |
| `admin.html` | `#alk=<key>`, `#o=<id>` | Login key and direct order card; may coexist |
| `zayavka.html` | `#k=<code>` | Preferred offer lookup |
| `zayavka.html` | legacy `?k=` | Immediately rewritten to fragment |
| `zayavka.html` | `preview=1` in query/hash | Preview mode |
| `oplaceno.html` | `Shp_k`, `Shp_gift`, `Shp_kind`, `Shp_order` | Robokassa return routing |
| `oplaceno.html` | `kind=tip`, `kind=sub` | Tip/subscription payment return |
| `priyomnaya.html` | `#q<ID>` | Specific question |
| `vedenie.html` | `#base`, `#turn`, `#vip` | Package tab |
| `tariffs.html` | `#formula`, `#tiers`, `#plan`, `#services`, `#pay` | Main panels |
| `tariffs.html` | `#compare`, `#catalog`, `#dossiers`, `#d-<id>` | Special panel/dossier deep links |
| `guarantees.html` | `#article-1` … `#article-9` | Guarantee articles |
| `index.html` | `#smeta` | Open estimator; hash is then cleared |

В прототипе допустимы только собственные lab-route/query/hash. Production claim/auth/payment/order values нельзя переносить, логировать или декорировать.

## 6. Browser storage, events and permissions

### 6.1 LocalStorage / `Salon.store`

| Key | Current meaning | Prototype rule |
|---|---|---|
| `salon_consent` | Consent v2, 365-day expiry, analytics boolean | Не читать/не писать |
| `salon_attr_v1` | First/last campaign + entry | Не читать/не писать |
| `salon_vid` | Anonymous visit id; удаляется при отказе от analytics; также QA identity | Не читать/не писать |
| `salon_theme` | Raw `dark`/`light` | Не читать/не писать; lab state in memory |
| `salon_calm` | Animation/calm mode | Не читать/не писать; lab state in memory |
| `salon_cart_v1` | Cart schema | Не читать/не писать |
| `salon_draft` | General calculator draft | Не читать/не писать |
| `salon_service_draft_v1` | Service questionnaire draft | Не читать/не писать |
| `salon_exit_grant` | Exit promo | Не читать/не писать |
| `salon_gift_buy` | Gift purchase `{id,t}` | Секретоподобное; никогда не читать |
| `salon_zayavka` | Offer `{c,n}` | Секретоподобное; никогда не читать |
| `salon_session` | Bearer session | Секрет; никогда не читать |
| `salon_user` | Cached user | Персональные данные; никогда не читать |
| `salon_tokens` | Guest order tokens | Секрет; никогда не читать |
| `salon_auth_pending` | Telegram auth poll state/code | Не читать |
| `salon_ref` | Referral code | Не читать/не писать |
| `salon_marks` | Marginalia ledger | Не читать/не писать |
| `salon_caps` | Loud notification caps | Не читать/не писать |
| `salon_lead` | Cross-tab lead election | Не читать/не писать |
| `salon_seen` | Seen live-order notifications | Не читать/не писать |
| `salon_sound` | Notification sound preference | Не читать/не писать |
| `salon_sound_at` | Last sound timestamp | Не читать/не писать |
| `salon_sys` | System notification state | Не читать/не писать |
| `salon_watch` | Watch/check state | Не читать/не писать |
| `salon_tour_done` | Product tour completion | Не читать/не писать |
| `salon_prelude_seen` | Prelude completion | Не читать/не писать |
| `salon_reading_shelf` | Knowledge bookmarks | Не читать/не писать |
| `salon_qa_voted` | До 100 QA vote ids | Не читать/не писать |
| `salon_hidden_orders` | Legacy/local removed orders | Не читать |
| `salon_grst_<orderId>` | Hide gift remainder prompt | Dynamic key; не читать/не писать |
| `salon_ph_<promoCode>` | Hide promo hint | Dynamic key; не читать/не писать |
| `ag_tab` | Last admin tab | Не читать/не писать |

### 6.2 SessionStorage

| Key | Current meaning | Prototype rule |
|---|---|---|
| `salon_t0`, `salon_tab` | Visit start and tab id | Не читать/не писать |
| `salon_turn` | Prelude roundtrip | Не читать/не писать |
| `salon_help_off` | Dismiss help FAB for tab | Не читать/не писать |
| `salon_resume_hidden` | Dismiss resume bar | Не читать/не писать |
| `salon_imp`, `salon_imp_token`, `salon_imp_name` | Tab-scoped impersonation | Секрет/роль; никогда не читать |
| `salon_nudged` | One-time auth nudge | Не читать/не писать |
| `fx` | Только `zk-test.html` fixture state | Не переносить |

Собственный lab state предпочтительно держать в памяти. Если persistence понадобится для UX-теста, допустим только явно namespaced `style_lab_*`, без реальных контактов, ids и tokens.

### 6.3 Events and browser capabilities

Custom events:

- `salon:consent`;
- `salon:motionchange`;
- `salon:cart`;
- `salon:prelude-closed`.

Также используются `storage`, `hashchange`, `popstate`, visibility/scroll/resize и browser notification lifecycle.

Prototype:

- может иметь эквивалентные lab-only events, но не dispatch production event names;
- не запрашивает `Notification` permission;
- не включает sound/chime;
- не пишет clipboard и не открывает Web Share без явного user action;
- не ставит cookies. В production код напрямую cookies не создаёт; cookies/storage может использовать только подключаемая после consent Яндекс Метрика.

## 7. JavaScript contracts

### 7.0 Bundle-to-route map

| Bundle | Root pages | Notes |
|---|---:|---|
| `assets/js/app.js` + `assets/js/extras.js` | 82 | Общий public shell. Не подключены только в `50x.html`, `admin-covers.html`, `expertise.html`, `maintenance.html`, `oplaceno.html`, `prolog.html`, `zk-test.html` |
| `assets/js/knowledge.js` | 26 | `knowledge.html` + все 25 `guide-*` routes |
| `assets/js/cart.js` | 1 | `configurator.html` |
| `assets/js/press.js` + `assets/js/pereplet.js` | 1 | `index.html` |
| `assets/js/cabinet.js` | 1 | `dashboard.html` |
| `assets/js/admin.js` | 1 | `admin.html` |
| `assets/js/topic-audit.js` | 1 | `audit-temy-vkr.html` |
| `assets/js/doi-checker.js` | 1 | `proverka-istochnikov-vkr.html` |

`check.html`, `gift.html`, `priyomnaya.html`, `reviews.html`, `referral.html`, `tariffs.html`, `zayavka.html` и часть остальных routes имеют page-specific inline handlers поверх общего runtime. Системные страницы используют полностью inline/self-contained logic.

### 7.1 Глобальные объекты и entry points

| Contract | Source | Role |
|---|---|---|
| `window.SalonCalc` | `assets/js/app.js` | Types, disciplines, terms, tiers, quote rules |
| `window.SalonSlots` | `assets/js/app.js` | Slot state, обновляется через `/slots` |
| `window.SalonLinks` | `assets/js/app.js` | Telegram/VK/MAX/email |
| `window.SalonMaxLogo` | `assets/js/app.js` | MAX logo markup |
| `window.SalonBotLink` | `assets/js/app.js` | Telegram bot deep link |
| `window.SalonServices` | `assets/js/app.js` | Service catalogue |
| `window.SalonExperts` | `assets/js/app.js` | Expert catalogue |
| `window.Salon` | `assets/js/app.js` | Общий public runtime |
| `window.SalonCart` | `assets/js/cart.js` | Cart public API |
| `window.SalonPressGo`, `window.SalonPressClose` | `assets/js/press.js` | Homepage press controls |
| `window.SalonPreludeOpen` | inline `index.html` | Prelude opener |
| `window.PRELUDE` | inline/site runtime | Prelude data/state |
| `initCabinet` | `assets/js/cabinet.js` | Cabinet entry |
| `initGodEye` | `assets/js/admin.js` | Admin entry |
| `window.__SALON_CART_TEST__`, `window.__SalonCartTest` | cart test hooks | Не production UX contract; не переносить |

### 7.2 Public `Salon` surface

Существующие namespaces/utilities:

`store`, `consent`, `motion`, `plural`, `themeToggleHTML`, `calmToggleHTML`, `calm`, `theme`, `floor`, `railAdopt`, `marks`, `note`, `toast`, `lead`, `copy`, `mask`, `valid`, `btnLoading`, `countTo`, `sealSVG`, `toc`, `cabBadge`, `footerHTML`, `metrika`, `contact`, `observeReveal`, `api`, `claimLink`, `attribution`, `visit`, `refCode`, `tgLogin`, `resumeTgLogin`.

`assets/js/extras.js` расширяет surface:

`confirm`, `stamp`, `invite`, `cookieSettings`, `tour`, `orderNudge`.

`SalonCart` public methods:

`init`, `open`, `add`, `clear`, `count`, `lineCount`, `hasItems`, `items`, `first`, `quote`, `benefits`, `summary`, `payload`, `snapshot`, `contains`, `ensure`, `setVisible`, `refresh`, `positionLabel`, `validate`, `bonusIntent`.

Prototype не должен подключать production `app.js`, `extras.js`, `cart.js`, `cabinet.js` или `admin.js`: эти файлы выполняют boot/mount, читают storage, запускают API/analytics и могут декорировать реальные ссылки. Нужен отдельный inert lab runtime.

### 7.3 Named function inventory in static JS

Ниже — статически найденные именованные `function` declarations, включая вложенные функции и повторяющиеся имена в разных scope. Это implementation inventory, а не требование сохранить каждый symbol в новом дизайне. Поведение, которое видит пользователь, сохраняется по разделам 3–10.

#### `assets/js/admin.js` — 202 declarations

`initGodEye`, `evLabel`, `evData`, `flag`, `bulkApply`, `esc`, `money`, `dt`, `toast`, `copyText`, `stMeta`, `stamp`, `confirmDlg`, `starRow`, `mediaPath`, `filePath`, `releaseAdminObjectUrls`, `adminProtectedFetch`, `hydrateAdminMedia`, `tplLogin`, `gate`, `watchEvents`, `loadSubs`, `refreshSilent`, `doRefresh`, `listQuery`, `loadTab`, `tabLoading`, `tabFail`, `goTab`, `loadQA`, `snapshotQaDrafts`, `loadVisits`, `devLabel`, `refLabel`, `pageName`, `minsAgo`, `anPl`, `anCut`, `cityOf`, `sourceOf`, `deviceOf`, `anTop`, `visitStats`, `anArc`, `pt`, `anDonut`, `anBars`, `tplAnalytics`, `visitRow`, `visitDetails`, `tplVisits`, `drawVisits`, `tile`, `loadCard`, `loadClient`, `render`, `renderShell`, `drawLive`, `navBadges`, `drawNav`, `drawBody`, `loadGifts`, `tplGifts`, `drawGiftCard`, `giftAction`, `openGiftCard`, `tplBroadcast`, `bcastRefresh`, `bcastStatus`, `loadDesk`, `dlLeft`, `silentDays`, `orderSum`, `deskRows`, `deskBlock`, `calBlock`, `tplSummary`, `tile`, `tplSubs`, `miniVisits`, `dmLabel`, `weeksChart`, `drawFilters`, `bulkBar`, `sortedOrders`, `drawList`, `pendingCancelReq`, `kindStage`, `debtForPart`, `debtLine`, `invoiceAgeDays`, `nextHint`, `clientLine`, `offerBlock`, `jl2t`, `t2ledger`, `t2incl`, `railToText`, `t2rail`, `specList`, `specInputValue`, `specificationSeed`, `specificationDefaultsFromForm`, `buildSpecificationLines`, `offCatalogItem`, `offChip`, `offChipAdd`, `offWord`, `offRowsRender`, `offRowsSync`, `offCatalogState`, `offCatalogFilter`, `offSumRender`, `specificationContour`, `specificationAllocation`, `specificationLinesForPrice`, `planBlock`, `partsBlock`, `feedBlock`, `filesBlock`, `manageBlock`, `intelBlock`, `orderItemsBlock`, `values`, `fact`, `itemPrice`, `row`, `quickRow`, `moneyBlock`, `drawCard`, `drawClientList`, `drawClientCard`, `tplReviews`, `rvCard`, `qaTagSelect`, `qaCard`, `tplQA`, `leadContact`, `tplLeads`, `maintSec`, `row`, `slotsApply`, `slotsSec`, `drawSettings`, `api`, `afterOrder`, `uploadAdminFile`, `unpaidDialog`, `sendAdminFiles`, `tryLinkLogin`, `wzMoney`, `wzR500`, `wzPy`, `wzPick`, `wzQuote`, `wzPrice`, `wzDaysBase`, `wzFloor`, `wzDays`, `wzBand`, `wzToday`, `wzPlus`, `wzDiff`, `wzParse`, `wzISO`, `wzRu`, `wzWork`, `wzFinal`, `wzLedger`, `wzIncl`, `wzRail`, `wzPlan`, `wzPayNote`, `wzPlural`, `wzDaysWord`, `wzReqApplies`, `wzReqShort`, `wzReqFull`, `wzSpecificationLines`, `wzCut`, `wzIntro`, `wzChips`, `wzShelfHtml`, `wzOwnHtml`, `wzRangeText`, `wzWarnHtml`, `wzPreviewHtml`, `wzReviewHtml`, `wzDoneHtml`, `wzTxt`, `wzHtm`, `wzMark`, `wzSync`, `wzSay`, `wzDraw`, `wzOpen`, `wzClose`, `wzTake`, `wzCopy`, `wzFire`, `wzMount`.

#### `assets/js/app.js` — 96 declarations

`maxLogoSVG`, `read`, `emit`, `save`, `allowed`, `lowPower`, `read`, `refresh`, `can`, `replay`, `field`, `on`, `apply`, `current`, `apply`, `switchFrom`, `toggle`, `rmNow`, `get`, `set`, `sget`, `sset`, `measure`, `ensure`, `place`, `adopt`, `marks`, `unreadN`, `mark`, `readOne`, `readAll`, `badge`, `mountMarks`, `when`, `p`, `buildLedger`, `drawLedger`, `outside`, `openLedger`, `closeLedger`, `busy`, `kick`, `drain`, `loudLog`, `canLoud`, `tookLoud`, `sniff`, `clean`, `build`, `announce`, `render`, `close`, `swipe`, `up`, `receipt`, `init`, `fb`, `put`, `step`, `brandHTML`, `mountTOC`, `tocSiblings`, `setToc`, `showHome`, `draw`, `mskNow`, `pad2`, `mnItem`, `boot`, `safeReferrer`, `forgetBrowserData`, `stop`, `build`, `close`, `markAll`, `markNearViewport`, `onScrollFrame`, `impToken`, `again`, `allowed`, `clean`, `campaign`, `externalRef`, `capture`, `ref`, `decoratePage`, `vid`, `allowed`, `page`, `send`, `again`, `view`, `start`, `report`, `stop`, `tick`.

#### `assets/js/cabinet.js` — 145 declarations

`initCabinet`, `notiSupported`, `notiOn`, `notiAsk`, `titleBadge`, `systemNote`, `esc`, `money`, `dt`, `plural`, `daysLeft`, `deadlineChip`, `tokenFor`, `orderHeaders`, `ordersHeaders`, `apiPath`, `rememberObjectUrl`, `releaseObjectUrls`, `protectedFetch`, `protectedFilename`, `hydrateProtectedMedia`, `render`, `giftRestStrip`, `giftRestFill`, `show`, `promoHintStrip`, `toast`, `tplLogin`, `emailSendCode`, `emailVerify`, `emailAgain`, `claimByCode`, `tplEmpty`, `fold`, `subPendingBand`, `tplError`, `notiRow`, `linksRow`, `impMode`, `nowCard`, `clubBlock`, `bonusCard`, `depCard`, `subPendingCard`, `subCard`, `planCardHtml`, `ctorHtml`, `bestCtorDisc`, `ctorTotal`, `curatorHtml`, `plusSection`, `rerenderHome`, `loadPlans`, `doSubscribe`, `scrollToEl`, `subAction`, `subPayOnline`, `meSnapshot`, `refreshMe`, `isArch`, `hiddenIds`, `isRemoved`, `visibleOrders`, `removedOrders`, `activeOrders`, `archOrders`, `pickDefaultId`, `needsAction`, `tabBtn`, `tplSwitch`, `shortWork`, `shortStatus`, `stageFold`, `stageRows`, `partsRows`, `specLink`, `pamyatkaLink`, `priceBlock`, `itemQuote`, `orderItemsBlock`, `values`, `fact`, `row`, `giftFold`, `planTable`, `bonusSpendFold`, `bonusSpendBlock`, `subUpsell`, `payHistory`, `reqRows`, `paySlip`, `payBlock`, `actionsBlock`, `finalBand`, `partBand`, `dueBand`, `pauseBand`, `manageBlock`, `defenseBlock`, `reviewBlock`, `reviewFormInner`, `thanksBlock`, `filesBlock`, `mediaHtml`, `chatBlock`, `accessBlock`, `jumpChips`, `tabBadges`, `tabRow`, `navSide`, `dockTabs`, `impBanner`, `profileCard`, `sideMini`, `sideFoot`, `tabHead`, `setTab`, `ovCard`, `homeTab`, `loginNudge`, `paymentDocumentsCard`, `walletTab`, `clubTab`, `helpTab`, `ordersTab`, `renderTab`, `tplDetail`, `ensureFeatures`, `loadList`, `watchSync`, `renderCurrent`, `scheduleFilesSeen`, `loadDetail`, `refreshListSilent`, `watchEvents`, `startPolling`, `waitChecksOnce`, `doAction`, `payOnline`, `tipOnline`, `depTopup`, `payDeposit`, `sendMessage`, `uploadFile`, `doTgLogin`.

#### `assets/js/cart.js` — 61 declarations

`esc`, `money`, `positionLabel`, `uid`, `read`, `write`, `notify`, `serviceById`, `requiredQuestions`, `answerFor`, `syncNeeds`, `workById`, `addonExists`, `count`, `lineCount`, `itemQuote`, `quote`, `dealAmount`, `benefits`, `meta`, `label`, `contourLabel`, `positionDetails`, `push`, `equivalent`, `contains`, `add`, `ensure`, `addCurrent`, `remove`, `undo`, `setQty`, `setNote`, `clear`, `serviceType`, `addonItem`, `beginAddon`, `savePendingAddon`, `validate`, `lineItem`, `benefitHtml`, `benefitToolsHtml`, `addonsHtml`, `addonComposerHtml`, `totalsHtml`, `entryHtml`, `syncEntry`, `render`, `build`, `open`, `close`, `click`, `input`, `change`, `trap`, `summary`, `payload`, `snapshot`, `setVisible`, `first`, `init`.

#### `assets/js/doi-checker.js` — 11 declarations

`cleanDoi`, `extractDois`, `setStatus`, `el`, `metadataLine`, `renderFound`, `renderReview`, `lookup`, `pool`, `runner`, `check`.

#### `assets/js/extras.js` — 37 declarations

`buildDlg`, `close`, `onKey`, `close`, `onKey`, `closeBar`, `choose`, `showBar`, `prefsHTML`, `openPrefs`, `closePrefs`, `onPrefsKey`, `allSteps`, `targetOf`, `build`, `onKey`, `draw`, `next`, `claimBonus`, `finish`, `veilClick`, `later`, `busy`, `useExistingContact`, `show`, `seenMap`, `seenHas`, `seenAdd`, `chime`, `sysNote`, `deliver`, `seedFirst`, `isLoud`, `poll`, `clearance`, `pageType`, `render`.

#### `assets/js/knowledge.js` — 28 declarations

`ready`, `normalise`, `copyText`, `toast`, `sharePage`, `initKnowledgeHub`, `labelForCount`, `updateUrl`, `render`, `restoreFromUrl`, `slugify`, `initGuidePage`, `renderSaved`, `updateProgress`, `initJournal`, `escapeHtml`, `compactText`, `shorten`, `postCopy`, `cardHtml`, `cards`, `cardLeft`, `updateControls`, `nearestCard`, `syncAfterScroll`, `goTo`, `showFallback`, `fixResponsiveBrandNames`.

#### `assets/js/pereplet.js` — 12 declarations

`enhanced`, `syncEnhanced`, `onScroll`, `saveDraft`, `render`, `selectPlate`, `spyStatic`, `applyStep`, `paint`, `flip`, `openBox`, `closeBox`.

#### `assets/js/press.js` — 16 declarations

`reduced`, `flat`, `syncBookState`, `initEstimatorFlow`, `priceText`, `show`, `setProgress`, `animateBook`, `frame`, `focusFormSoon`, `openBook`, `closeBook`, `applyMode`, `goPriyomnaya`, `tick`, `syncDust`.

#### `assets/js/topic-audit.js` — 6 declarations

`field`, `value`, `words`, `overlap`, `addCheck`, `analyze`.

Всего в десяти static JS bundles найдено **614 именованных declarations**. Анонимные callbacks, arrow functions и inline page helpers намеренно считаются implementation detail; все вызываемые ими пользовательские действия и побочные эффекты перечислены в action/API/state sections.

## 8. Network and API inventory

### 8.1 Base URL and request behavior

`assets/js/app.js` выбирает same-origin API только на `hostname === "akademsalon.ru"`; во всех остальных окружениях production fallback — `https://akademsalon.ru/api`.

`Salon.api.req`:

- добавляет Bearer или guest-token headers;
- умеет повторять один 5xx request;
- используется общим shell, cabinet и page flows.

Это делает прямое подключение production scripts в `style-lab` недопустимым даже на localhost: fallback всё равно уходит в production.

### 8.2 Public/auth/order endpoints

| Method | Endpoint | Purpose | Lab |
|---|---|---|---|
| GET | `/slots` | Availability | Fixture only |
| POST | `/visit` | Consent-gated visit analytics | `X` |
| POST | `/auth/start` | Telegram auth start | `X` |
| GET | `/auth/poll?code=…` | Telegram auth polling | `X` |
| POST | `/auth/email/start` | Send email code | `X` |
| POST | `/auth/email/verify` | Verify email code | `X` |
| GET redirect | `/auth/:provider/start` | VK/Mail.ru/MAX OAuth | `X` |
| POST | `/auth/:provider/link-start` | Link provider | `X` |
| POST | `/orders` | Create order | `X` |
| GET | `/orders` | User/guest orders | Fixture only |
| POST | `/orders/claim` | Claim guest order | `X` |
| GET | `/orders/:id` | Order detail | Fixture only |
| POST | `/orders/:id/action` | State-changing order action | `X` |
| POST | `/orders/:id/message` | Send message | `X` |
| POST | `/orders/:id/upload?kind=…&note=…` | Upload attachment | `X` |
| GET | `/orders/:id/contract` | Protected contract | `X` |
| GET | `/orders/:id/pamyatka` | Protected memo | `X` |
| GET | `/orders/:id/file/:fid` | Protected file | `X` |
| GET | `/orders/:id/msgmedia/:mid` | Protected chat media | `X` |
| GET | `/orders/:id/payments/:pid/confirmation.pdf` | Payment confirmation | `X` |
| GET | `/pamyatka/welcome` | Admin-linked newcomer memo PDF | `X` |
| POST | `/orders/:id/pay` | Online payment | `X` |
| POST | `/orders/:id/tip` | Create tip | `X` |
| POST | `/orders/:id/tip/:tipId/claim` | Claim tip | `X` |
| POST | `/orders/:id/pay-deposit` | Deposit payment | `X` |
| GET | `/events?since=…` | Long-poll order events | `X` |

Observed `/orders/:id/action` values:

`accept_price`, `paid`, `paid_undo`, `accept_work`, `request_fixes`, `decline`, `resume`, `pause`, `unpause`, `bonus_apply`, `bonus_cancel`, `gift_apply`, `gift_remove`, `archive`, `unarchive`, `pin`, `unpin`, `cancel_request`, `review`, `files_seen`, `wait_checks`.

### 8.3 Profile, wallet, club

| Method | Endpoint | Purpose | Lab |
|---|---|---|---|
| GET | `/me` | Profile/current user | Fixture only |
| GET | `/features` | Feature flags | Frozen fixture |
| GET | `/plans` | Subscription plans | Frozen fixture |
| GET | `/bonus` | Bonus account/ledger | Fixture only |
| GET | `/deposit` | Deposit account/ledger | Fixture only |
| POST | `/deposit/topup` | Top up deposit | `X` |
| POST | `/subscribe` | Create subscription | `X` |
| POST | `/subs/:id/paid` | Mark paid | `X` |
| POST | `/subs/:id/unpaid` | Undo mark | `X` |
| POST | `/subs/:id/cancel` | Cancel subscription | `X` |
| POST | `/subs/:id/pay` | Pay subscription | `X` |
| POST | `/subs/:id/autorenew` | Toggle auto-renew | `X` |
| POST | `/milestones` | Add milestone | `X` |
| POST | `/milestones/:id/delete` | Delete milestone | `X` |
| POST | `/imp_login` | Enter impersonated session | `X` |

### 8.4 Quote, promo, gift, content

| Method | Endpoint | Purpose | Lab |
|---|---|---|---|
| POST | `/promo/check` | Validate promo | Fixture resolver |
| POST | `/promo/exit` | Issue exit promo | `X` |
| POST | `/quote/email` | Email quote | `X` |
| GET | `/quote/:token` | Restore quote | Fixture only |
| GET | `/gift/check?code=…` | Validate gift for order | Fixture resolver |
| GET | `/gift/config` | Gift settings | Frozen fixture |
| POST | `/gift` | Create gift | `X` |
| GET | `/gift/view?code=…` | Holder view | Fixture only |
| GET | `/gift/state?id=…&t=…` | Buyer state | Fixture only |
| POST | `/gift/:id/pay?t=…` | Pay gift | `X` |
| POST | `/gift/:id/paid?t=…` | Mark gift paid | `X` |
| POST | `/gift/:id/unpaid?t=…` | Undo mark | `X` |
| POST | `/gift/:id/cancel?t=…` | Cancel gift | `X` |
| GET | `/gift/pdf?code=…` | Gift PDF | `X` |
| GET | `/reviews` | Reviews | Frozen fixtures |
| GET | `/qa` | Questions | Frozen fixtures |
| POST | `/qa` | Ask question | `X` |
| POST | `/qa/:id/same` | Same-question vote | `X`; local visual increment allowed |
| GET | `/api/channel` (same-origin attempt), затем `/channel` | Channel content | Frozen fixtures |
| POST | `/welcome/token` | Referral welcome token | `X` |
| GET | `/offer/:code` | Offer | Fixture only |
| GET | `/offer/:code/state?n=…` | Offer live state | Fixture only |
| POST | `/offer/:code/pay` | Offer payment | `X` |

### 8.5 External network surfaces

- `https://api.crossref.org/works/:doi?mailto=support@akademsalon.ru`;
- `https://doi.org/...`;
- Yandex Metrika / `window.ym`;
- Telegram bot, user and channel deep links;
- VK and MAX deep links;
- OAuth redirects for VK, Mail.ru and MAX;
- payment URLs/Robokassa returns;
- email links;
- health checks by `50x.html` and `maintenance.html` against `/`.

В прототипе все перечисленные поверхности inert. Никаких automatic redirects, polling, beacon, prefetch, iframe, image pixel или external font request.

## 9. Cabinet state machine

Source: `dashboard.html` + `assets/js/cabinet.js`.

### 9.1 Entry/access modes

- guest access from `salon_tokens`;
- claim through `#claim=`/`?claim=`;
- Telegram login start + polling;
- email code send/verify/resend;
- OAuth VK/Mail.ru/MAX;
- OAuth success/error fragments;
- admin impersonation via `#imp=`;
- merging/claiming guest orders after authentication.

Required demo states:

- anonymous landing;
- Telegram pending;
- email address, code entry, wrong/expired code, resend wait, provider unavailable;
- OAuth success/error;
- guest with one order;
- authenticated user;
- impersonation banner;
- forbidden/unauthorized;
- server unavailable + retry.

### 9.2 Navigation

Exact tabs:

- `home`;
- `orders`;
- `wallet`;
- `club`;
- `help`.

Deep-link aliases/states include `#plus`. Desktop side navigation and mobile dock must preserve active tab, counts and focus semantics.

### 9.3 Order lifecycle

Exact primary statuses:

`new` → `priced` → `prepay` → `work` → `check` → `fix` → `done`; terminal/alternate `cancel`.

Orthogonal states:

- active/archive;
- pinned/unpinned;
- removed/locally hidden;
- paused;
- cancel requested;
- deadline normal/due/late;
- unread/live event;
- current order selection;
- protected media loading/unavailable.

### 9.4 Cabinet surfaces and actions

Home:

- current order card;
- action-needed summary;
- club/plus block;
- bonus and deposit cards;
- subscription status;
- milestones/curator;
- auth nudge and payment-return thanks.

Orders:

- active/archive/removed lists;
- list/detail switching;
- stage timeline, parts and specification;
- contract and memo;
- price, items, payment plan/history;
- requisites, receipt/confirmation;
- accept price, decline, resume;
- pause/unpause and cancellation request;
- paid/unpaid mark where offered;
- accept work/request fixes;
- chat, messages, media, file uploads;
- apply/remove bonus or gift;
- final/part-ready bands;
- defense upsell;
- review, publication consent and screenshot;
- tip;
- archive/unarchive, pin/unpin;
- access link.

Wallet:

- bonus balance and ledger;
- deposit balance and ledger;
- top-up;
- payment documents.

Club:

- plans and custom constructor;
- pending/active subscription;
- online/manual payment and cancellation;
- auto-renew;
- curator and milestones;
- referral.

Help/profile:

- support channels;
- access links;
- account/profile;
- linked providers.

Every mutation, message, upload, protected download, payment and login is `X`. Prototype actions may transition between synthetic fixtures only and must show a permanent “Демо-данные” indicator.

## 10. Admin state machine

Source: `admin.html` + `assets/js/admin.js`.

### 10.1 Exact tabs

`summary`, `visits`, `orders`, `clients`, `reviews`, `qa`, `gifts`, `leads`, `broadcast`, `settings`.

### 10.2 Access/gate states

- no token;
- pending Telegram link;
- bad key;
- forbidden;
- server unavailable;
- loading/retry;
- deep-linked order;
- impersonation handoff.

### 10.3 Tab inventory

| Tab | Read surfaces | Mutating controls — all `X` in lab |
|---|---|---|
| `summary` | Today desk, calendar, subscriptions, overview, mini visits | Quick order actions |
| `visits` | Hours/self/bots/city filters, sources/devices/pages, visit detail | None required |
| `orders` | Search/filter/sort/limit, list/card, statuses, specs, pricing, payments, files, feed | Bulk flags, manual order, offer, upload, handoff publish, price/payment/status, message/note/plan, delivery, cancel, archive, pause |
| `clients` | Search/sort, client card, orders/finance/profile | Bonus adjustment, ban/unban, impersonate |
| `reviews` | Moderation queue and detail | Moderate/publish/reject |
| `qa` | Draft/published/rejected, tags, detail | Publish, quiet answer, save, reject, unpublish, pin, delete, ban |
| `gifts` | Filters, gift card, payment/status/history | Issue, confirm/cancel, extend, adjust, resend, block |
| `leads` | Lead list/detail/contact | Read/handling state if present |
| `broadcast` | Segment, preview, status/progress | Test send and real broadcast |
| `settings` | Requisites, slots, maintenance, auth/payment info | Save requisites/slots; toggle site/bot maintenance |

Order management also includes:

- attention/active/archived/trash filters;
- bulk select;
- pin, color, hide, trash, restore, purge;
- manual order wizard;
- link/offer wizard;
- contours, scope/specification, allocation and payment plan;
- protected files/media;
- final/part delivery;
- live refresh/event feed.

Prototype uses synthetic names, contacts, orders, payments and analytics. Реальные keys/tokens/contacts нельзя вставлять даже вручную в fixtures. `purge`, broadcast, impersonation and maintenance controls должны быть отчётливо demo-only и не иметь request code path.

## 11. Admin API

### 11.1 Reads — replace with fixtures

- `GET /admin/overview`;
- `GET /admin/subs`;
- `GET /admin/orders?<filter/search/sort>`;
- `GET /admin/orders/:id`;
- `GET /admin/clients`;
- `GET /admin/clients/:id`;
- `GET /admin/reviews`;
- `GET /admin/leads`;
- `GET /admin/qa`;
- `GET /admin/visits?<hours/self/bots/city>`;
- `GET /admin/gifts`;
- `GET /admin/gifts/:id`;
- `GET /admin/broadcast?segment=…`;
- `GET /admin/broadcast/status`;
- `GET /admin/orders?status=active`.

### 11.2 Writes — hard forbidden

- `POST /admin/login`;
- `POST /admin/orders/flag`;
- `POST /admin/orders`;
- `POST /admin/orders/:id/upload?...`;
- `POST /admin/orders/:id/handoff/:artifactId/publish`;
- `POST /admin/orders/:id/pause`;
- `POST /admin/orders/:id/sync_tg`;
- `POST /admin/orders/:id/price`;
- `POST /admin/orders/:id/confirm_payment`;
- `POST /admin/orders/:id/status`;
- `POST /admin/orders/:id/fix_ack`;
- `POST /admin/orders/:id/final_ready`;
- `POST /admin/orders/:id/part_ready`;
- `POST /admin/orders/:id/deliver`;
- `POST /admin/orders/:id/remind_pay`;
- `POST /admin/orders/:id/cancel`;
- `POST /admin/orders/:id/resume`;
- `POST /admin/orders/:id/archive`;
- `POST /admin/orders/:id/message`;
- `POST /admin/orders/:id/note`;
- `POST /admin/orders/:id/plan`;
- `POST /admin/offers`;
- `POST /admin/offers/:id/mail_on`;
- `POST /admin/offers/:id/cancel`;
- `POST /admin/gifts`;
- `POST /admin/gifts/:id/confirm`;
- `POST /admin/gifts/:id/cancel`;
- `POST /admin/gifts/:id/extend`;
- `POST /admin/gifts/:id/adjust`;
- `POST /admin/gifts/:id/resend`;
- `POST /admin/gifts/:id/block`;
- `POST /admin/gifts/:id/unblock`;
- `POST /admin/subs/:id/confirm`;
- `POST /admin/subs/:id/cancel`;
- `POST /admin/clients/:id/impersonate`;
- `POST /admin/clients/:id/bonus`;
- `POST /admin/clients/:id/ban`;
- `POST /admin/broadcast`;
- `POST /admin/requisites`;
- `POST /admin/slots`;
- `POST /admin/maintenance`;
- `POST /admin/qa/:id` with `publish`, `answer_quiet`, `save`, `reject`, `unpublish`, `pin`, `unpin`, `delete`, `ban`;
- `POST /admin/reviews/:id/moderate`.

## 12. Transactional and system routes

### `zayavka.html`

Offer states:

- loading;
- live;
- awaiting payment;
- paid;
- expired;
- replaced;
- cancelled;
- not found;
- server error.

Actions:

- receipt email;
- online payment;
- manual paid mark/undo;
- share;
- claim into cabinet;
- live state refresh.

All actions except local state switch are forbidden in lab.

### `oplaceno.html`

Production reads Robokassa params and redirects to `zayavka.html`, `gift.html` or `dashboard.html`. In lab it must be a visual return-state gallery with no redirect, no query forwarding and no server verification.

### `50x.html`

Self-contained inline page. Production checks `/` after 5 seconds and then every 15 seconds, redirecting after recovery. Lab shows countdown/recovery fixtures but performs no fetch or redirect.

### `maintenance.html`

Self-contained inline page. Production checks `/` after 4 seconds and then every 12 seconds, redirecting after recovery. Lab shows only simulated retry/recovered state.

### `expertise.html`

Legacy zero-delay meta refresh to `/`, canonical `/`, `noindex`. Lab must not contain `meta refresh`; show the archived/redirect intent as a state.

### `prolog.html`

Prelude/story route; writes `salon_prelude_seen`. Lab may animate it under reduced-motion rules, but uses only in-memory completion.

### `zk-test.html`

Ignored local fixture harness duplicating offer behavior and using `sessionStorage.fx`. Не включать в sitemap/deployment; useful only as a checklist of offer states.

## 13. Errors and recovery states

Состояния сгруппированы по observed backend codes; прототип должен иметь state picker и человекочитаемое recovery действие.

### Config/promo/gift

`already_used`, `blocked`, `empty`, `expired`, `inactive`, `min_price`, `not_found`, `not_paid`, `rate_limited`, `spent`, `used_up`.

### Offer/payment

`admin_session`, `already_claimed`, `already_paid`, `canceled`, `expired`, `not_found`, `nothing_due`, `order_has_owner`, `pay_failed`, `pay_stage`, `rate_limit`, `replaced`.

### Cabinet/auth/subscription/actions

`already_claimed`, `bad_email`, `code_expired`, `email_off`, `milestone_limit`, `not_found`, `nothing_claimed`, `over_limit`, `provider_off`, `rate_limit`, `resend_wait`, `send_failed`, `stale_version`, `sub_active`, `sub_state`, `tip_stage`, `too_many_attempts`, `unauthorized`, `wrong_code`, `bonus_need_login`, `bonus_not_for_subs`, `bonus_after_payment`, `bonus_order_small`, `bonus_cap`, `bonus_once`, `bonus_empty`, `gift_not_for_subs`, `gift_after_payment`, `gift_stage`, `gift_nothing`, `not_paid`, `blocked`, `expired`, `spent`, `empty`, `paused_by_master`, `pause_state`, `nothing_due`, `only_finished`.

### Admin

`already`, `already_paid`, `bad_key`, `bad_price`, `bad_recip_email`, `bonus_empty`, `busy`, `claimed_pending`, `forbidden`, `no_contact`, `order_has_owner`, `plan_locked`, `stage_unpaid`, `telegram_not_linked`.

### QA

`rate_limited`, `too_short`, `email_required`, `bad_email`.

### Gift creation

`bad_amount`, `bad_email`, `bad_recip_email`, `bad_date`, `contact_required`, `consent_required`, `rate_limit`.

Обязательные transport states поверх code-specific errors: slow loading, empty, offline, timeout, 401, 403, 404, 409/stale, 422/validation, 429, 500, 502, 503 and retry success.

## 14. Legal and SEO contracts

### Legal

Не менять смысл и не прятать в декоративные microcopy:

- цена до согласования спецификации является оценкой;
- scope, этапы, план оплаты и критерии приёмки связаны со спецификацией;
- контуры A / B1 / B2 и границы допустимой помощи должны быть ясны;
- сайт не обещает конкретную оценку, защиту, процент оригинальности или обход проверки;
- `academic-integrity.html` остаётся отдельным видимым документом;
- оферта, privacy, terms, refunds и requisites сохраняют отдельные маршруты;
- каждое согласие (`consent.html`, analytics, marketing, publication, request) остаётся самостоятельным текстом с версией и purpose;
- withdrawal/request не заменять фальшивой отправкой — в lab только explanatory demo-state;
- чекбоксы согласий не должны быть prechecked.

### SEO/indexing

Exact `noindex` inventory:

| Robots content | Routes |
|---|---|
| `noindex` | `404.html`, `dashboard.html`, `expertise.html`, `prolog.html` |
| `noindex,nofollow` | `50x.html`, `maintenance.html`, `oplaceno.html`, `zayavka.html`, `zk-test.html` |
| `noindex,nofollow,noarchive` | `admin.html`, `admin-covers.html` |
| `noindex,follow` | `consent.html`, `consent-analytics.html`, `consent-marketing.html`, `consent-publication.html`, `consent-request.html` |

Canonical inventory:

- 81/89 root HTML files имеют canonical;
- `index.html` канонизирован на `https://akademsalon.ru/`;
- 79 остальных страниц, включая часть `noindex`, канонизированы на собственный `https://akademsalon.ru/<filename>.html`;
- `expertise.html` намеренно разделяет canonical главной с `index.html` и делает zero-delay redirect;
- без canonical: `50x.html`, `admin-covers.html`, `admin.html`, `maintenance.html`, `oplaceno.html`, `prolog.html`, `zayavka.html`, `zk-test.html`;
- duplicate `<title>` среди 89 root pages не найден; единственный duplicate canonical — ожидаемая пара `index.html`/`expertise.html`.

Prototype requirements:

- весь `style-lab` — `noindex,nofollow,noarchive`;
- не добавлять lab pages в production sitemap;
- не ставить production canonical;
- не публиковать JSON-LD, будто lab — реальная услуга/цена/review;
- не подключать analytics;
- не выполнять meta refresh;
- не копировать production Open Graph URLs без явной маркировки prototype.

## 15. Точный логотип «АС»

### 15.1 Канонические reusable sources

| File | Format / dimensions | Notes |
|---|---|---|
| `assets/img/favicon.svg` | SVG Tiny PS, `viewBox="0 0 512 512"` | Канонический круглый восковой знак «АС»; glyphs переведены в paths |
| `bimi/logo.svg` | SVG Tiny PS, `viewBox="0 0 512 512"` | Byte-identical copy of `favicon.svg`; BIMI |
| `favicon.ico` | ICO: 16×16 + 32×32 PNG frames | Browser favicon |
| `assets/img/favicon-32.png` | PNG RGBA, 32×32 | Small raster |
| `assets/img/favicon-120.png` | PNG RGBA, 120×120 | Medium raster |
| `assets/img/apple-touch-icon.png` | PNG RGBA, 180×180 | Apple touch |
| `assets/img/mail-avatar-180.png` | PNG RGBA, 180×180 | Mail/avatar |
| `assets/img/mail-avatar-512.png` | PNG RGBA, 512×512 | Large mail/schema.org logo; referenced in Organization metadata |
| `assets/img/vk/ava-1024.png` | PNG RGB, 1024×1024 | «АС» seal + full wordmark composition |

`assets/img/favicon.svg` и `bimi/logo.svg` имеют одинаковый SHA-256:

`522481d98755371ef5d6b908214a652f662b0cfee06a6d76c4917db2aab62f76` — полный SHA-256 обоих файлов; pair проверен как byte-identical. Для любых новых размеров брать canonical vector, а не реконструировать буквы шрифтом.

### 15.2 Telegram variants derived from canonical paths

| Files | Dimensions | Variant |
|---|---|---|
| `assets/brand/telegram/avatar-kanal-512.png` | 512×512 | Wax «АС», ring «АКАДЕМИЧЕСКИЙ САЛОН», label «КАНАЛ» |
| `assets/brand/telegram/avatar-kanal-800.png` | 800×800 | То же, large |
| `assets/brand/telegram/avatar-kanal.mp4` | MP4, 800×800, 8 s | Animated channel variant |
| `assets/brand/telegram/avatar-bot-512.png` | 512×512 | Navy «АС», ring, label «БОТ» |
| `assets/brand/telegram/avatar-bot-800.png` | 800×800 | То же, large |
| `assets/brand/telegram/avatar-bot.mp4` | MP4, 800×800, 8 s | Animated bot variant |

Generator/reference:

- `assets/brand/telegram/generate.py` читает `assets/img/favicon.svg`;
- `assets/brand/telegram/preview.html` — local preview.

### 15.3 Composite media with embedded «АС»

Это не источники логотипа; внутри них уже растрирован маленький знак.

OG, 1200×675:

- `assets/img/og/og-antiplagiat.png`;
- `assets/img/og/og-guarantees.png`;
- `assets/img/og/og-knowledge.png`;
- `assets/img/og/og-mag.png`;
- `assets/img/og/og-normokontrol.png`;
- `assets/img/og/og-rech.png`;
- `assets/img/og/og-spisok.png`;
- `assets/img/og/og-vvedenie.png`.

VK:

- `assets/img/vk/06-pack.png` — 1200×675;
- `assets/img/vk/07-pay.png` — 1200×675;
- `assets/img/vk/svc-ai.png` — 1000×1000;
- `assets/img/vk/svc-diplom.png` — 1000×1000;
- `assets/img/vk/svc-kursovaya.png` — 1000×1000;
- `assets/img/vk/svc-mag.png` — 1000×1000;
- `assets/img/vk/svc-normo.png` — 1000×1000;
- `assets/img/vk/svc-plan.png` — 1000×1000;
- `assets/img/vk/svc-praktika.png` — 1000×1000;
- `assets/img/vk/svc-prez.png` — 1000×1000;
- `assets/img/vk/svc-referat.png` — 1000×1000;
- `assets/img/vk/svc-statya.png` — 1000×1000;
- `assets/img/vk/svc-tutor.png` — 1000×1000.

### 15.4 Inline «АС», не являющийся asset

- `50x.html`: inline SVG `<text>АС</text>`;
- `maintenance.html`: inline SVG `<text>АС</text>`;
- `admin-covers.html`: canvas `fillText("АС")`;
- `configurator.html`: `.sv-seal`;
- `gift.html`: card/seal;
- `zayavka.html`: paid seal;
- `prolog.html`: CSS/text mark;
- `assets/js/cabinet.js`: login seal;
- `assets/js/extras.js`: invite seal.

### 15.5 Явные не-«АС» assets

- `assets/img/bot-avatar.png` — знак `¶`, не «АС»;
- общий header/mobile chrome, создаваемый `assets/js/app.js`, — `¶`;
- `salon-promo.gif` — `¶`;
- common 404 seal — `¶`;
- `assets/img/og-cover.png` и `assets/img/og-cover-v2.png` — монограмма `A`, не «АС».

Rule для redesign: использовать `assets/img/favicon.svg` как единственный canonical master «АС». Не подменять его `¶`, `A`, CSS-текстом или заново набранными буквами. Проверить знак отдельно на светлом/тёмном фоне и в 16, 24, 32, 48, 120, 180, 512 px.

## 16. Что прототип может симулировать

Безопасно:

- локальный route/page-family switcher;
- header, drawer, bottom dock, tabs, accordion, sheet, dialog, lightbox;
- search, filter, sort, pagination on frozen fixtures;
- theme/calm/reduced-motion in memory;
- calculator and quote on frozen local pricing data, явно как demo estimate;
- wizard, cart, promo/gift validators as deterministic fixtures;
- client-side validation and error copy;
- file picker visual using only filename/size;
- synthetic success screens and `DEMO-*` ids;
- knowledge save/progress using memory;
- local `check.html` and topic audit algorithms;
- DOI results from a closed fixture map;
- reviews, QA, cabinet and admin from fictional records;
- complete state switcher for statuses, loading, empty, offline and errors;
- canvas cover export from synthetic content after explicit click;
- copy/share/print only after an explicit user action, preferably with a demo payload.

## 17. Что прототипу запрещено вызывать

- любой `/api` request и любой request к `https://akademsalon.ru/api`;
- Crossref, DOI resolver, Yandex Metrika, `/visit`, pixels and beacons;
- Telegram/VK/MAX/Mail.ru auth, polling, deep-link login and automatic redirects;
- чтение/запись production localStorage/sessionStorage/cookies;
- guest, session, order, offer, gift or impersonation tokens;
- order create/claim/update, state action, chat, media, uploads and protected downloads;
- payment, Robokassa, receipt, confirmation, deposit, tips, gifts, subscription and bonus mutations;
- referral/welcome issuance and real email;
- admin login, write endpoints, moderation, publish, purge, impersonation, broadcast, maintenance, slots and requisites;
- health polling from 50x/maintenance;
- Notification permission, notification sound and background polling;
- automatic clipboard, Web Share, download or print;
- any outbound navigation without an explicit, visibly labelled user choice. Для review-сборки безопаснее сделать все external links inert.

## 18. Acceptance checks

### Coverage and contracts

1. Route manifest содержит все 89 корневых HTML-файлов ровно по одному page family.
2. В прототипе можно открыть representative screen и state gallery каждого семейства; route picker перечисляет все 89 routes.
3. Для каждой primary CTA/button/form action определено одно из `L`, `S`, `D`, `X`; «молчаливых» controls нет.
4. Все mutating controls постоянно маркированы demo-смыслом и меняют только synthetic in-memory state.
5. Сохранены тип работы, дисциплина, срок, tier/контур, scope, add-ons, service questions, этапы, план оплаты и specification semantics.
6. Предварительная цена нигде не выдана за окончательную без согласованной спецификации.
7. Сохранены контуры A / B1 / B2, academic-integrity boundaries и отсутствие гарантий оценки/защиты/процента.
8. Legal routes, versions, consent purposes, unchecked consent controls и withdrawal/request semantics доступны и не сокращены.

### Network and data safety

9. После загрузки локальных assets в DevTools Network — **0 requests** к API, Crossref, DOI, Yandex, Telegram, VK, MAX, Mail.ru, payment/OAuth/email endpoints.
10. В source/build нет production API fallback, analytics loader, beacon, polling или automatic redirect.
11. Ни один production storage key из раздела 6 не читается и не пишется.
12. Нет cookies; persistence отсутствует либо ограничен `style_lab_*` без PII/tokens.
13. Все forms перехватывают submit; `action` не ведёт в production.
14. File demo не читает bytes и не вызывает upload; показывает только synthetic metadata.
15. Synthetic fixtures не содержат реальные имена, телефоны, email, ids, tokens, суммы/историю клиентов.
16. Payment/auth/admin controls не имеют network code path даже при ручном вызове handler.
17. Outbound links, OAuth and payment redirects inert; query/hash secrets не прокидываются.

### Logo and visual consistency

18. В новом shell используется точный `assets/img/favicon.svg` «АС», а не `¶` или `A`.
19. Логотип проверен в 16/24/32/48/120/180/512 px, light/dark/high-contrast; glyphs не перерисованы шрифтом.
20. Один token system управляет цветом, типографикой, spacing, radius, shadow, border, motion и density для public/cabinet/admin.
21. Нет route-specific visual patches, которые ломают общий shell; исключения документированы как component variants.
22. Информационная плотность управляется progressive disclosure; primary action один на viewport/section, secondary actions и metadata визуально тише.

### Responsive/mobile app quality

23. Проверены widths 320, 360, 390, 430, 768, 820, 1024, 1280, 1440 и 1920 px.
24. Нет horizontal overflow, clipped text, наложений fixed elements и скачков layout.
25. Mobile имеет самостоятельный app-shell, safe-area insets, bottom navigation, sheets и thumb-zone actions; это не уменьшенная desktop-сетка.
26. Virtual keyboard не закрывает active field/submit/chat composer; landscape и 200% zoom остаются работоспособны.
27. Touch targets не меньше 44×44 CSS px; destructive и primary actions не стоят вплотную.

### Accessibility and resilience

28. Полная keyboard navigation; видимый focus; корректные focus trap/return и Escape.
29. Tabs, dialogs, drawers, accordion, status, errors and live regions имеют корректную ARIA semantics.
30. Контраст текста/control states проходит WCAG AA; информация не кодируется одним цветом.
31. `prefers-reduced-motion` выключает parallax, book flips, decorative loops и smooth transitions.
32. Loading, empty, success, offline, validation, 401, 403, 404, 409/stale, 422, 429, 500, 502, 503 и recovered states доступны в state picker.
33. Все 8 order statuses, pause/archive/pin/cancel/deadline variations и все 10 admin tabs имеют fixtures.
34. Нет uncaught exceptions, console errors, broken assets и dead focus после смены route/state.

### SEO and delivery boundary

35. Все prototype pages имеют `noindex,nofollow,noarchive`.
36. Prototype отсутствует в production sitemap и не имеет production canonical/JSON-LD/analytics.
37. `zk-test.html`, admin keys, auth/payment returns и реальные tokens не попадают в prototype package.
38. Visual regression snapshots сняты минимум для public landing, service, guide, tool, legal, configurator, cabinet, admin и system state в desktop/mobile/light/dark/reduced-motion.
39. Production/core `style-lab` не меняется до явного утверждения пользователя; concept остаётся отдельной pre-production версией.

## 19. Definition of “safe to show”

Прототип считается безопасным для передачи пользователю, только если одновременно выполнены три условия:

1. Его можно полностью пройти без сети после первоначальной загрузки локальных файлов.
2. Любое внешне «реальное» действие заканчивается synthetic result и не может затронуть production даже через изменённый URL или ручной вызов handler.
3. Пользователь в каждом кабинете, платёжном, offer и admin state видит, что это **демо-данные**, но визуальная/UX-полнота остаётся достаточной для решения «утверждать ли дизайн».
