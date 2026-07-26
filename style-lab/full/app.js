import { findRoute, formatMoney, guides, routeRegistry, services } from "./data.js?v=20260725-polish15";
import {
  escapeHTML,
  getMobileMeta,
  getSearchItems,
  renderRoute,
  wizardStepCount
} from "./views.js?v=20260725-polish15";

const STORAGE_KEY = "as_stylelab_full_v2";
const THEME_KEY = "as_stylelab_full_theme";
const view = document.getElementById("routeView");
const menuDialog = document.getElementById("menuDialog");
const searchDialog = document.getElementById("searchDialog");
const supportDialog = document.getElementById("supportDialog");
const actionDialog = document.getElementById("actionDialog");
const searchInput = document.getElementById("siteSearch");
const searchResults = document.querySelector("[data-search-results]");
const toastRegion = document.querySelector("[data-toast-region]");
const liveRegion = document.querySelector("[data-live-region]");
const taskBar = document.querySelector("[data-task-bar]");
const searchItems = getSearchItems();
const skipLink = document.querySelector(".skip-link");

/* Keep the accessibility shortcut keyboard-only. Some browsers restore focus
   to the first link after a hash-route update; without modality tracking that
   makes the hidden shortcut cover the brand after an ordinary pointer click. */
window.addEventListener("keydown", (event) => {
  if (event.key === "Tab") document.documentElement.dataset.inputModality = "keyboard";
}, { capture: true });

window.addEventListener("pointerdown", () => {
  delete document.documentElement.dataset.inputModality;
  if (document.activeElement === skipLink) skipLink.blur();
}, { capture: true });

const defaultState = {
  wizard: {
    started: false,
    submitted: false,
    step: 0,
    situation: "",
    workType: "",
    result: "",
    deadline: "",
    name: "",
    contact: "",
    comment: "",
    files: [],
    consent: false
  },
  messages: [],
  demoOrder: null,
  demoCounter: 0,
  paymentComplete: false,
  supportDraft: "",
  checkText: "",
  textCheck: null,
  topicTitle: "",
  topicAudit: null,
  sourceText: "",
  sourceResult: null,
  giftAmount: 5000,
  giftName: "",
  giftMessage: "",
  coverZoom: 72,
  contentDrafts: {}
};

const demoClientProfiles = {
  "Екатерина К.": {
    avatar: "ЕК",
    since: "Клиент с сентября 2025",
    telegram: "скрыт в демо",
    phone: "+7 ••• •••-42-18",
    reply: "24 июля, 12:51",
    status: "В работе",
    statusKey: "work",
    case: "DEMO-2417 · Редактура ВКР по психологии",
    deadline: "Следующий результат 28 июля",
    note: "Предпочитает письменные пояснения к каждому существенному изменению."
  },
  "Илья П.": {
    avatar: "ИП",
    since: "Клиент с июля 2026",
    telegram: "скрыт в демо",
    phone: "+7 ••• •••-11-03",
    reply: "сегодня, 11:44",
    status: "Нужна смета",
    statusKey: "attention",
    case: "DEMO-2421 · Редактура курсовой по экономике",
    deadline: "Ответ редактора сегодня до 17:00",
    note: "Ждёт отдельную смету по структуре и оформлению."
  },
  "Никита С.": {
    avatar: "НС",
    since: "Клиент с марта 2026",
    telegram: "скрыт в демо",
    phone: "+7 ••• •••-08-76",
    reply: "сегодня, 11:08",
    status: "Встреча",
    statusKey: "meeting",
    case: "DEMO-2399 · Методическая сессия",
    deadline: "Встреча сегодня в 16:30",
    note: "Перед встречей проверить список вопросов и приложенные замечания."
  },
  "Алина В.": {
    avatar: "АВ",
    since: "Клиент с января 2026",
    telegram: "скрыт в демо",
    phone: "+7 ••• •••-64-20",
    reply: "вчера, 18:20",
    status: "Завершён",
    statusKey: "done",
    case: "DEMO-2384 · Нормоконтроль",
    deadline: "Завершено 23 июля",
    note: "Рабочий пример завершённого дела без персональных сведений."
  },
  "Мария Р.": {
    avatar: "МР",
    since: "Клиент с ноября 2024",
    telegram: "скрыт в демо",
    phone: "+7 ••• •••-05-91",
    reply: "22 июля, 16:05",
    status: "В работе",
    statusKey: "work",
    case: "DEMO-2377 · Редактура научной статьи",
    deadline: "Следующая вычитка 30 июля",
    note: "Использует демонстрационный абонемент; условия показаны без реального договора."
  }
};

let state = loadState();
let currentSlug = "";
const dialogTriggers = new WeakMap();
const dialogDismissTimers = new WeakMap();
const dialogDismissHandlers = new WeakMap();
let searchSelection = -1;
let searchMatches = [];
let catalogMobile = matchMedia("(max-width: 620px)").matches;
let pendingSourceSection = "";
let pendingHistoryScroll = null;
let historyScrollTimer = 0;
let deferredSourceScroll = null;
let suppressHistoryScroll = false;
let pendingRenderFocus = null;
let announcementTimer = 0;
let pendingDialogNavigation = "";
let restoringHistoryEntry = false;
let publishedGuideMetadata = null;
let publishedReviewMetadata = null;

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(defaultState));
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!stored || typeof stored !== "object") return cloneDefaultState();
    return {
      ...cloneDefaultState(),
      ...stored,
      wizard: {
        ...cloneDefaultState().wizard,
        ...(stored.wizard || {})
      }
    };
  } catch {
    return cloneDefaultState();
  }
}

function saveState() {
  const safeState = {
    ...state,
    wizard: {
      ...state.wizard,
      name: "",
      contact: "",
      comment: "",
      files: []
    },
    messages: [],
    supportDraft: "",
    checkText: "",
    textCheck: null,
    topicTitle: "",
    topicAudit: null,
    sourceText: "",
    sourceResult: null,
    giftName: "",
    giftMessage: ""
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safeState));
  updateStartLabels();
  updateTaskButtonState();
}

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, "").split("?")[0].trim();
  return raw || "home";
}

function persistHistoryScroll(immediate = false) {
  if (suppressHistoryScroll) return;
  if (historyScrollTimer) window.clearTimeout(historyScrollTimer);
  const write = () => {
    historyScrollTimer = 0;
    const currentState = history.state && typeof history.state === "object" ? history.state : {};
    try {
      history.replaceState({ ...currentState, salonScrollY: Math.round(window.scrollY) }, "", location.href);
    } catch {
      // WebKit ограничивает частоту replaceState; следующий явный переход повторит запись.
    }
  };
  if (immediate) write();
  else historyScrollTimer = window.setTimeout(write, 180);
}

function navigate(slug) {
  const safeSlug = findRoute(slug) ? slug : "home";
  if (history.state?.salonDialog) {
    pendingDialogNavigation = safeSlug;
    closeAllDialogs({ preserveHistory: true });
    history.back();
    return;
  }
  if (parseRoute() === safeSlug) {
    render(true);
    return;
  }
  persistHistoryScroll(true);
  pendingHistoryScroll = null;
  location.hash = `#/${safeSlug}`;
}

function routeFamily(slug) {
  return findRoute(slug)?.family || "home";
}

function routeHydratesLongSource(slug) {
  return ["article", "legal"].includes(routeFamily(slug));
}

function restoreDeferredSourceScroll(slug) {
  if (deferredSourceScroll === null || parseRoute() !== slug) return;
  const targetY = deferredSourceScroll;
  requestAnimationFrame(() => {
    document.documentElement.scrollTo({ top: targetY, left: 0, behavior: "instant" });
    requestAnimationFrame(() => {
      if (parseRoute() !== slug) return;
      deferredSourceScroll = null;
      suppressHistoryScroll = false;
      persistHistoryScroll(true);
    });
  });
}

function isTaskRoute(slug) {
  return ["start", "configurator"].includes(slug);
}

function isAdminRoute(slug) {
  return routeFamily(slug).startsWith("admin");
}

function isAccountRoute(slug) {
  return ["dashboard", "order"].includes(slug);
}

function alignAdminNavigation() {
  if (!window.matchMedia("(max-width: 920px)").matches) return;
  const activeAdminItem = view.querySelector(".admin-sidebar nav a.is-current");
  const adminNavigation = activeAdminItem?.closest("nav");
  if (!activeAdminItem || !adminNavigation) return;
  const centeredPosition =
    activeAdminItem.offsetLeft -
    (adminNavigation.clientWidth - activeAdminItem.offsetWidth) / 2;
  adminNavigation.scrollLeft = Math.max(0, centeredPosition);
}

function updateChrome(slug) {
  const meta = getMobileMeta(slug);
  const title = document.querySelector("[data-mobile-title]");
  const kicker = document.querySelector("[data-mobile-kicker]");
  const back = document.querySelector("[data-go-back]");
  if (title) title.textContent = meta.title;
  if (kicker) kicker.textContent = meta.kicker;
  if (back) {
    back.classList.toggle("is-visible", meta.back);
    back.disabled = !meta.back;
    back.tabIndex = meta.back ? 0 : -1;
    back.setAttribute("aria-hidden", String(!meta.back));
  }

  document.body.dataset.currentRoute = slug;
  document.body.dataset.family = routeFamily(slug);
  document.body.classList.toggle("is-task-route", isTaskRoute(slug));
  document.body.classList.toggle("is-admin-route", isAdminRoute(slug));
  document.body.classList.toggle("is-account-route", isAccountRoute(slug));
  document.body.classList.toggle("is-system-route", routeFamily(slug) === "system" || routeFamily(slug) === "payment-status");

  const needsDemoDataLabel = isAdminRoute(slug) || isAccountRoute(slug) || routeFamily(slug) === "payment-status";
  if (needsDemoDataLabel && !view.querySelector(".admin-extra__demo-bar, .demo-data-banner")) {
    const host = view.querySelector(".admin-main, .account-main, .case-main, .system-card");
    host?.insertAdjacentHTML("afterbegin", `<div class="demo-data-banner" role="status"><strong>Пример данных</strong><span>Показан заполненный сценарий; внешние действия отключены.</span></div>`);
  }

  document.querySelectorAll("[data-dock-route]").forEach((item) => {
    const dockRoute = item.getAttribute("data-dock-route");
    const current =
      dockRoute === slug ||
      (dockRoute === "services" && ["service", "discipline", "tariffs", "formats"].includes(routeFamily(slug))) ||
      (dockRoute === "knowledge" && ["article", "tools", "tool"].includes(routeFamily(slug))) ||
      (dockRoute === "dashboard" && isAccountRoute(slug)) ||
      (dockRoute === "start" && isTaskRoute(slug));
    item.classList.toggle("is-current", current);
    if (current) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });

  document.querySelectorAll(".primary-nav a").forEach((item) => {
    const route = item.getAttribute("data-route");
    const current =
      route === slug ||
      (route === "services" && ["service", "discipline", "formats"].includes(routeFamily(slug))) ||
      (route === "tariffs" && routeFamily(slug) === "tariffs") ||
      (route === "knowledge" && ["article", "tools", "tool"].includes(routeFamily(slug))) ||
      (route === "referral" && ["referral", "plus", "deposit", "gift"].includes(routeFamily(slug))) ||
      (route === "referral" && slug === "loyalty");
    item.classList.toggle("is-current", current);
    if (current) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });

  if (taskBar) {
    taskBar.hidden = !isTaskRoute(slug);
    const metaNode = taskBar.querySelector("[data-task-meta]");
    const summaryNode = taskBar.querySelector("[data-task-summary]");
    const button = taskBar.querySelector("[data-task-next]");
    const backButton = taskBar.querySelector("[data-task-back]");
    if (metaNode) metaNode.textContent = `Шаг ${state.wizard.step + 1} из ${wizardStepCount}`;
    if (summaryNode) summaryNode.textContent = ["Ситуация", "Тип работы", "Результат", "Срок", "Контакты"][state.wizard.step] || "Заявка";
    if (button) {
      button.innerHTML = state.wizard.step === wizardStepCount - 1
        ? `Подготовить <span aria-hidden="true">→</span>`
        : `Продолжить <span aria-hidden="true">→</span>`;
    }
    if (backButton) {
      const canGoBack = state.wizard.step > 0;
      backButton.disabled = !canGoBack;
      backButton.setAttribute("aria-disabled", String(!canGoBack));
      backButton.style.visibility = canGoBack ? "visible" : "hidden";
    }
    updateTaskButtonState();
  }
}

function updateTaskButtonState() {
  const button = taskBar?.querySelector("[data-task-next]");
  if (!button) return;
  const wizard = state.wizard;
  const requiredKeys = ["situation", "workType", "result", "deadline"];
  const canContinue = wizard.step < requiredKeys.length
    ? Boolean(wizard[requiredKeys[wizard.step]])
    : Boolean(wizard.name.trim() && wizard.contact.trim() && wizard.consent);
  button.disabled = !canContinue;
  button.setAttribute("aria-disabled", String(!canContinue));
}

function queueRenderFocus(target, options = {}) {
  pendingRenderFocus = { target, ...options };
}

function applyQueuedRenderFocus() {
  const intent = pendingRenderFocus;
  pendingRenderFocus = null;
  if (!intent) return false;
  const target = typeof intent.target === "function"
    ? intent.target(view)
    : view.querySelector(intent.target);
  if (!(target instanceof HTMLElement)) return false;

  const hadTabIndex = target.hasAttribute("tabindex");
  const naturallyFocusable = target.matches("a[href], button, input, select, textarea, [contenteditable='true']");
  if (!hadTabIndex && !naturallyFocusable) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
  if (intent.select && typeof target.select === "function") target.select();
  if (intent.reveal) {
    target.scrollIntoView({
      behavior: preferredScrollBehavior(),
      block: intent.reveal === true ? "nearest" : intent.reveal
    });
  }
  if (!hadTabIndex && !naturallyFocusable) {
    target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
  }
  return true;
}

function announce(message, delay = 120) {
  if (!liveRegion) return;
  window.clearTimeout(announcementTimer);
  announcementTimer = window.setTimeout(() => {
    liveRegion.textContent = "";
    requestAnimationFrame(() => {
      liveRegion.textContent = message;
    });
  }, delay);
}

function announceResultCount(count) {
  announce(count ? `Найдено: ${count}` : "Ничего не найдено");
}

function render(force = false) {
  const slug = parseRoute();
  const resolvedSlug = findRoute(slug) ? slug : "404";
  if (!force && slug === currentSlug) return;
  const previousSlug = currentSlug;
  const routeChanged = slug !== previousSlug;
  const nextScrollY = routeChanged ? (pendingHistoryScroll ?? 0) : window.scrollY;
  const shouldMoveFocus = Boolean(previousSlug) && routeChanged && !(restoringHistoryEntry && nextScrollY > 0);
  restoringHistoryEntry = false;
  const shouldDeferSourceScroll = routeChanged && nextScrollY > 0 && routeHydratesLongSource(resolvedSlug);
  if (shouldDeferSourceScroll) {
    deferredSourceScroll = nextScrollY;
    suppressHistoryScroll = true;
  } else if (routeChanged) {
    deferredSourceScroll = null;
    suppressHistoryScroll = false;
  }
  pendingHistoryScroll = null;
  currentSlug = slug;

  view.classList.remove("is-entering");
  view.innerHTML = renderRoute(slug, state);
  updateChrome(resolvedSlug);
  syncThemeControls(document.documentElement.dataset.theme);
  syncInteractiveStates();
  updateStartLabels();
  polishTypography(view);
  document.title = `${findRoute(resolvedSlug)?.title || "Страница не найдена"} · Академический Салон`;
  if (resolvedSlug === "services") applyServiceFilters();
  if (resolvedSlug === "knowledge") applyGuideFilters();
  if (resolvedSlug === "plus") updatePlusPeriod("semester");
  if (resolvedSlug === "deposit") updateDepositCalculator(30000);
  void hydrateSourceDocuments(slug);
  if (slug === "home" || slug === "knowledge") void hydratePublishedGuideMetadata(slug);
  if (slug === "home" || slug === "reviews") void hydratePublishedReviewMetadata(slug);

  requestAnimationFrame(() => {
    document.documentElement.scrollTo({ top: nextScrollY, left: 0, behavior: "instant" });
    alignAdminNavigation();
    if (routeChanged) {
      void view.offsetWidth;
      view.classList.add("is-entering");
    }
    fitCoverTitle();
    const restoredLocalFocus = applyQueuedRenderFocus();
    if (!restoredLocalFocus && shouldMoveFocus) {
      const heading = view.querySelector("h1");
      if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
        heading.addEventListener("blur", () => heading.removeAttribute("tabindex"), { once: true });
      } else {
        view.focus({ preventScroll: true });
      }
    }
    persistHistoryScroll();
    centerCurrentRails();
  });
}

function refineTypography(value) {
  return String(value)
    .replace(/(\d) (?=\d{3}(?:\D|$))/g, "$1 ")
    .replace(/(\d(?:[.,]\d+)?)\s*%/g, "$1 %")
    .replace(/(\d(?:[.,]\d+)?) (?=₽)/g, "$1 ")
    .replace(/(\d(?:[.,]\d+)?) (?=стр\.)/giu, "$1 ")
    .replace(/(\d(?:[.,]\d+)?) (?=(?:дн(?:ей|я|ь)|мин(?:ут|уты|ута)?|секунд(?:а|ы)?|месяц(?:а|ев)?|ч(?:ас(?:а|ов)?)?|слайд(?:а|ов)?|страниц(?:а|ы)?|стр\.|визит(?:а|ов)?|бонус(?:а|ов)?|файл(?:а|ов)?|вопрос(?:а|ов)?|раздел(?:а|ов)?|этап(?:а|ов)?|МБ|КБ)\b)/giu, "$1 ")
    .replace(/([А-ЯЁ][а-яё-]+) ([А-ЯЁ])\.\s?([А-ЯЁ])\./gu, "$1 $2. $3.");
}

function polishTypography(root) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    if (node.parentElement?.closest("script, style, textarea, option, code, pre, kbd")) return;
    const refined = refineTypography(node.nodeValue || "");
    if (refined !== node.nodeValue) node.nodeValue = refined;
  });
}

function replaceEditorialTerms(value) {
  const stem = ["кон", "тур"].join("");
  const editorialPairs = [
    ["Согласие на обработку данных для заявки", "Уведомление об обработке данных для заявки"],
    ["в внутренний реестр", "во внутренний реестр"],
    ["Как написать курсовую за неделю и не завалить: реалистичный план на 7 дней", "Как спланировать курсовую на семь дней"],
    ["Как написать курсовую за неделю и не завалить: план на 7 дней", "Как спланировать курсовую на семь дней"],
    ["Введение курсовой работы: структура, шаблонные фразы и полный пример", "Введение курсовой работы: структура и пример"],
    ["Заключение курсовой работы: структура, готовые фразы и полный пример", "Заключение курсовой работы: структура и пример"],
    ["Заключение курсовой и ВКР: как написать, шаблонные фразы и полный пример", "Заключение курсовой и ВКР: структура и связь с задачами"],
    ["Антиплагиат и детекторы ИИ в 2026: как это работает и как честно поднять оригинальность", "Антиплагиат и детекторы ИИ: что именно они проверяют"],
    ["Антиплагиат и детекторы ИИ: как честно поднять оригинальность", "Антиплагиат и детекторы ИИ: что именно они проверяют"],
    ["Статья РИНЦ: как написать и опубликовать — пошаговая инструкция", "Статья для журнала РИНЦ: подготовка и подача"],
    ["Объект и предмет исследования, цель и задачи: как сформулировать — с примерами", "Объект, предмет, цель и задачи исследования"],
    ["Чем объект отличается от предмета — на пальцах", "Чем объект отличается от предмета"],
    ["Практическая часть курсовой: как написать, где взять данные, примеры анализа", "Практическая часть курсовой: данные и анализ"],
    ["Список литературы по ГОСТ: как оформить в 2026 году — правила и готовые примеры", "Список литературы по ГОСТ: порядок и примеры"],
    ["Титульный лист курсовой и диплома по ГОСТ: как оформить в 2026 году", "Титульный лист курсовой и ВКР"],
    ["Отчёт по практике: структура, дневник и характеристика — как написать без переделок", "Отчёт по практике: структура и документы"],
    ["Как подготовиться к защите диплома: доклад, презентация и ответы комиссии", "Подготовка к защите ВКР"],
    ["Презентация к защите диплома: 12 слайдов, оформление и типовые ошибки", "Презентация к защите ВКР"],
    ["Речь на защиту диплома: структура на 7 минут и полный пример текста", "Речь на защите: структура доклада"],
    ["Отзыв научного руководителя на ВКР: структура, что в нём пишут и готовый образец", "Отзыв руководителя на ВКР"],
    ["Рецензия на ВКР: кто пишет, структура и материалы для рецензента", "Рецензия на ВКР: структура документа"],
    ["Семь дней — это мало, но достаточно, если не тратить их на панику и бесконечный сбор «ещё пары источников». Ниже — рабочий график по дням, без магии и без обещаний, что будет легко.", "Семь дней — короткий срок. Если тема определена, а источники доступны, рабочий черновик можно собрать по понятному графику."],
    ["Главный враг тут не объём, а расфокус", "Основная трудность — потеря последовательности"],
    ["детекторы заимствований относятся к таким фрагментам безжалостно", "системы проверки заимствований обычно отмечают такие фрагменты"],
    ["Разберём ключевые из них.", "Ниже перечислены основные ошибки."],
    ["Идеальна, когда нужен полный текст прямо сейчас.", "Подходит, когда нужен открытый полный текст."],
    ["Важно понимать эту границу, чтобы не делать вывод по одному числу.", "Поэтому вывод об авторстве нельзя делать по одному числу."],
    ["Отчёт по практике — работа с самым большим разрывом между «казалось» и «оказалось». Кажется: пара страниц о том, чем занимался. Оказывается: комплект из пяти документов с перекрёстными датами, подписями и печатями, который проверяют не менее формально, чем курсовую. Разберём комплект по частям — так, чтобы собрать его за один заход.", "Отчёт по практике обычно состоит из нескольких связанных документов. Даты, задачи, подписи и приложения должны совпадать во всём комплекте. Ниже — состав каждого документа и порядок итоговой сверки."],
    ["Да. Разберём требования, логику разделов и календарь самостоятельной работы. Это отдельный результат, который не обязывает покупать сопровождение.", "Да. В консультацию входят разбор требований, логики разделов и календаря самостоятельной работы. Это самостоятельная услуга без обязательного продолжения."],
    ["Используйте бесплатные гайды. Речь на защиту и презентация разобраны пошагово.", "Используйте материалы библиотеки: речь и презентация к защите разобраны по этапам."],
    ["Комиссия не перечитывает вашу работу — она слушает семь минут доклада. Разберём, из каких блоков состоит сильная защитная речь, дадим полный пример текста и фразы-связки, которыми удобно вести слайды.", "Доклад должен за несколько минут передать задачу, метод, основные результаты и выводы работы. Ниже — структура речи и переходы между слайдами."],
    ["Преподаватель открывает введение и сразу заключение — по этой паре решает, состоялась ли работа. При этом оно собирается из готовых глав за вечер. Ниже — четыре блока, фразы и полный пример.", "Заключение сопоставляют с целью и задачами из введения. Ниже — четыре смысловых блока и пример связи выводов с результатами работы."],
    ["Претензия «выводы не соответствуют задачам» лечится просто", "Несоответствие выводов задачам исправляют последовательно"],
    ["30–50 ответов для курсовой достаточно — набираются за выходные через студенческие чаты.", "Размер и способ формирования выборки определяют по исследовательскому вопросу, методике и требованиям кафедры. Укажите ограничения доступной выборки."],
    ["На главу достаточно 3–6 таблиц и рисунков. Железное правило:", "Количество таблиц определяется результатами анализа."],
    ["каждая таблица прокомментирована абзацем", "Каждую таблицу нужно ввести в текст и прокомментировать."],
    [" — перед ней предложение, зачем она, после — что из неё видно.", " Перед таблицей объясните её назначение, после — сформулируйте наблюдение по данным."],
    ["Нет. Академический стиль — безличные конструкции: «в работе рассмотрено», «целью является», «было проведено». «Я изучил» и «мне кажется» в тексте курсовой не используются.", "Форму изложения определяют методичка и нормы дисциплины. Если требований нет, выдерживайте выбранную форму последовательно."],
    ["Оптимально 4–6. Меньше трёх — работа выглядит поверхностной, больше семи — теряется логика. Главное правило: количество задач соответствует количеству параграфов, а решение всех задач видно в заключении.", "Количество задач определяют по цели и требованиям кафедры. Каждая задача должна быть раскрыта в структуре и отражена в выводах; соответствие один к одному требуется только тогда, когда его прямо задаёт методичка."],
    ["Объект всегда шире, предмет лежит внутри него. Если их можно поменять местами без потери смысла — неверны оба.", "В большинстве учебных методик объект задаёт более широкую область, а предмет — исследуемый аспект. Точную модель сверяйте с методичкой."],
    ["Каждый семестр повторяется одна и та же сцена: студент загружает готовую работу в проверку, видит красный процент и панику. Дальше начинается лихорадочный поиск «способов обойти антиплагиат» — и обычно именно на этом этапе всё портится. Разберёмся спокойно: что на самом деле измеряют две разные системы — антиплагиат и детектор ИИ, почему они ошибаются в обе стороны, и что честно поднимает оригинальность, а что тратит время и создаёт риски.", "После проверки важно определить, какие фрагменты система считает заимствованными или машинно сгенерированными. Антиплагиат и детектор ИИ решают разные задачи, поэтому их результаты нужно интерпретировать отдельно."],
    ["Хорошая новость: приёмы, которые реально работают, совпадают с тем, что делает работу качественной. Это не трюки против системы — это нормальная научная работа.", "Содержательная переработка текста одновременно повышает его самостоятельность и качество."],
    ["Отдельно перечислим «народные методы», которые в 2026 году не работают и вредят.", "Ниже перечислены распространённые способы обхода, которые снижают качество текста и создают дополнительные риски."],
    ["Часто ломает смысл и термины, а детекторы обновляются быстрее сервисов-обходчиков. Ставка на гонку, которую вы не выиграете.", "Результат нестабилен, а риск смысловых и терминологических ошибок остаётся высоким."],
    ["Хорошая новость: введение курсовой пишется по жёсткому канону, и это упрощает жизнь. Никакого «творчества» тут не ждут — ждут восемь элементов в правильном порядке и согласованных между собой. Объём — 1,5–2 страницы (для курсовой 25–35 страниц). Главный секрет: введение пишут дважды — черновик до основной части, чистовик после, когда уже понятно, что реально получилось.", "У введения есть устойчивая структура: восемь элементов в заданном порядке, согласованных между собой. Для курсовой объёмом 25–35 страниц введение обычно занимает 1,5–2 страницы, если методичка не устанавливает иное. Первый вариант составляют до основной части, окончательный — после завершения исследования."],
    ["Список литературы — последний раздел работы и первый кандидат на замечания. Нормоконтролёры любят его за формальность: здесь всё либо по стандарту, либо нет. Хорошая новость — форматов описания конечное число, и когда под рукой есть образец на каждый тип источника, список собирается механически. Эта страница и есть такой набор образцов.", "Список литературы часто проверяют особенно внимательно: для каждого типа источника действует своя схема библиографического описания. Ниже собраны образцы, по которым можно последовательно оформить книги, статьи, электронные ресурсы и нормативные документы."],
    ["Титульный лист — первое, что видит нормоконтролёр, и единственная страница, которую он проверяет по образцу построчно. Разберём, откуда берутся требования, как расположить блоки и на чём чаще всего заворачивают.", "Титульный лист обычно сверяют с образцом учебного заведения построчно. Разберём, откуда берутся требования, как расположить обязательные блоки и какие расхождения встречаются чаще всего."],
    ["Разбираем поля, шрифт, интервалы, нумерацию, таблицы, рисунки, ссылки и список литературы. Плюс топ ошибок, из-за которых заворачивают, и чек-лист, который можно пройти за 20 минут перед сдачей.", "Разбираем поля, шрифт, интервалы, нумерацию, таблицы, рисунки, ссылки и список литературы. В конце — перечень частых замечаний и последовательная проверка перед сдачей."],
    ["Нормоконтроль — это не про содержание работы, а про то, соответствует ли её оформление стандарту. Именно на этом этапе чаще всего заворачивают готовый диплом или курсовую: текст сильный, а поля не те, ссылки оформлены как попало, список литературы «поехал». Хорошая новость в том, что нормоконтроль — самый предсказуемый барьер на пути к защите. Правила конечны, они записаны, и их можно закрыть за один аккуратный проход.", "Нормоконтроль оценивает не содержание, а соответствие оформления установленным требованиям. Замечания могут относиться к полям, ссылкам, нумерации или библиографическому списку даже при сильном содержании работы. Большинство таких расхождений можно выявить последовательной проверкой по методичке."],
    ["Топ ошибок, из-за которых заворачивают", "Частые замечания при нормоконтроле"],
    ["Кафедра обычно предлагает список тем, и в нём есть ловушка: «свободные» темы из списка чаще всего либо заезжены до дыр (по ним нечего сказать нового), либо брошены не просто так — по ним нет данных. Выбирать стоит не «что красиво звучит», а «что реально защищается»: где есть литература, доступные данные и понятный практический выход.", "Кафедра обычно предлагает список тем, но свободная формулировка не всегда означает удобный выбор: по одной теме может быть мало новых исследовательских вопросов, по другой — недостаточно доступных данных. Оценивайте тему по трём критериям: качество литературы, доступность материалов и понятный практический результат."],
    ["До приказа о закреплении тем — легко. После — только через заведующего кафедрой и обычно со скрипом; уточнение формулировки (без смены предмета) проходит проще, чем полная замена.", "До приказа о закреплении тему обычно изменить проще. После утверждения порядок зависит от кафедры и может потребовать согласования с заведующим; уточнение формулировки без смены предмета исследования, как правило, согласовать легче, чем полную замену темы."],
    ["Диплом написан, отзыв и рецензия на руках. Осталось самое заметное — 10–15 минут перед комиссией, которые в памяти останутся ярче, чем полгода работы над текстом. Разбираем по частям: доклад, слайды, раздатка, каверзные вопросы и волнение — плюс чек-лист за неделю.", "После завершения текста, отзыва и рецензии остаётся подготовить выступление перед комиссией. Разберём доклад, слайды, раздаточные материалы, вероятные вопросы и план подготовки на последнюю неделю."],
    ["Каверзные вопросы комиссии: как отвечать", "Вопросы комиссии: как подготовить ответы"],
    ["Вопросы — не экзамен на засыпку, а проверка, что работа ваша. Большинство из них предсказуемы. Заранее выпишите 15–20 вероятных вопросов и проговорите ответы. Типичные:", "Вопросы помогают комиссии проверить понимание темы, метода и полученных результатов. Заранее составьте список из 15–20 вероятных вопросов и кратко проговорите ответы. Чаще всего спрашивают следующее:"],
    ["Формально да, запрета нет. Но комиссия ценит контакт глазами. Идеальный вариант — знать текст настолько, чтобы бумага была подстраховкой, а не сценарием. Читать монотонно, уткнувшись в лист, — минус к впечатлению.", "Если регламент не запрещает, доклад можно держать перед собой. Подготовьтесь так, чтобы обращаться к тексту только для сверки: зрительный контакт и спокойная подача помогают комиссии следить за логикой выступления."],
    ["Ловушка: задач больше, чем параграфов, или задача «висит» без параграфа. На защите первым делом сверяют задачи с оглавлением и выводами — это делается за 30 секунд, а вопрос «где решена третья задача?» звучит неприятно.", "Проверьте соответствие задач структуре: каждая задача должна быть раскрыта в основной части и отражена в выводах. Это соответствие легко проверить по оглавлению и заключению."],
    ["Красивая формулировка, по которой в стране три статьи, — это ловушка.", "Не выбирайте формулировку, для которой недостаточно качественных источников и доступных данных."],
    ["Уверенная защита вытягивает даже среднюю работу.", "Подготовленное выступление помогает ясно представить сильные стороны и ограничения выполненной работы."],
    ["Отдельный модуль подозрительных документов подсвечивает такие «фокусы» — и это отдельный красный флаг для проверяющего.", "Модуль подозрительных документов отмечает такие манипуляции и сообщает о них проверяющему."],
    ["Не применял технических «фокусов» — документ чистый.", "Не применял технических манипуляций с документом."],
    ["Нет. Теории — не больше 30 секунд, одна мысль. Комиссия хочет услышать ваш анализ и ваши предложения; пересказ учебника из первой главы — самая частая причина скучающих лиц и каверзных вопросов «а что здесь ваше?».", "Нет. Теоретическую часть достаточно обозначить одной мыслью, если регламент не требует иного. Основное время отведите собственному анализу, результатам и предложениям: именно по ним комиссия оценивает вклад автора."],
    ["Надёжнее опрос на 30–50 человек, чем «статистика с сайта» без источника.", "Используйте проверяемые открытые данные или соберите выборку по требованиям методики; опишите способ отбора и ограничения."],
    ["Глава 2 заметно короче теории — признак пересказа вместо исследования.", "Объём практической главы определяет методичка и фактический объём анализа; оценивайте полноту метода, результатов и выводов."],
    ["Дата обращения обязательна — её отсутствие возвращают чаще всего.", "Для удалённых электронных ресурсов указывают дату обращения в формате ДД.ММ.ГГГГ. Требование о помете вида содержания сверяйте с методичкой."],
    ["список литературы оформлен по ГОСТ Р 7.0.5–2008", "правила оформления сверены с методичкой: для библиографического описания обычно используют ГОСТ Р 7.0.100-2018, для библиографических ссылок — ГОСТ Р 7.0.5-2008"],
    ["← Все материалы полезных материалов", "← В библиотеку"]
  ];
  const pairs = [
    [`двух${stem}ной Офертой`, "Офертой с двумя режимами"],
    [`двух${stem}ной`, "с двумя режимами"],
    [`двух${stem}ная`, "с двумя режимами"],
    [`двух${stem}ному`, "с двумя режимами"],
    [`${stem}ами`, "режимами"],
    [`${stem}ах`, "режимах"],
    [`${stem}ов`, "режимов"],
    [`${stem}ом`, "режимом"],
    [`${stem}е`, "режиме"],
    [`${stem}у`, "режиму"],
    [`${stem}а`, "режима"],
    [`${stem}ы`, "режимы"],
    [stem, "режим"]
  ];
  const editedValue = editorialPairs.reduce((textValue, [source, replacement]) => {
    return textValue.replaceAll(source, replacement);
  }, value);
  const editedTerms = pairs.reduce((textValue, [source, replacement]) => {
    return textValue.replace(new RegExp(source, "giu"), (match) => {
      return match[0] === match[0].toLocaleUpperCase("ru")
        ? replacement[0].toLocaleUpperCase("ru") + replacement.slice(1)
        : replacement;
    });
  }, editedValue);
  return refineTypography(editedTerms);
}

function safeSourceNode(sourceNode, sourceSlug) {
  if (sourceNode.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(replaceEditorialTerms(sourceNode.textContent || ""));
  }
  if (sourceNode.nodeType !== Node.ELEMENT_NODE) return null;

  if (
    sourceNode.tagName === "ASIDE"
    && sourceNode.querySelector('a[href*="configurator.html"], [data-contact]')
  ) {
    return null;
  }

  if (sourceNode.tagName === "P" && sourceNode.querySelector('a[href*="configurator.html"]')) {
    const neutralParagraphs = {
      "guide-apellyaciya": "До подачи апелляции сопоставьте факты с локальным положением вуза: основанием служит проверяемое нарушение процедуры или аргументированное несогласие с результатом, а не оценка личности преподавателя. Если возможна пересдача в обычном порядке, отдельно сравните сроки и последствия обоих вариантов.",
      "guide-spisok-literatury": "До оформления убедитесь, что идентификаторы ведут именно на заявленные публикации. Проверяйте DOI, выходные данные, тип источника и дату обращения до финальной сортировки списка."
    };
    const replacement = neutralParagraphs[sourceSlug];
    if (replacement) {
      const paragraph = document.createElement("p");
      paragraph.textContent = replacement;
      return paragraph;
    }
    return null;
  }

  const allowed = new Set([
    "H2", "H3", "P", "UL", "OL", "LI", "DL", "DT", "DD", "TABLE", "THEAD",
    "TBODY", "TR", "TH", "TD", "BLOCKQUOTE", "PRE", "DIV", "SPAN", "A",
    "STRONG", "B", "EM", "I", "BR", "DETAILS", "SUMMARY"
  ]);
  if (!allowed.has(sourceNode.tagName)) {
    const fragment = document.createDocumentFragment();
    [...sourceNode.childNodes].forEach((child) => {
      const safeChild = safeSourceNode(child, sourceSlug);
      if (safeChild) fragment.append(safeChild);
    });
    return fragment;
  }

  const element = document.createElement(sourceNode.tagName.toLocaleLowerCase("ru"));
  if (sourceNode.id) element.id = sourceNode.id;
  ["colspan", "rowspan"].forEach((name) => {
    if (sourceNode.hasAttribute(name)) element.setAttribute(name, sourceNode.getAttribute(name));
  });
  const allowedClasses = ["doc-subtitle", "doc-meta", "doc-note", "link", "num"];
  const classes = [...sourceNode.classList].filter((name) => allowedClasses.includes(name));
  if (classes.length) element.className = classes.join(" ");

  if (sourceNode.tagName === "A") {
    const href = sourceNode.getAttribute("href") || "";
    if (href.startsWith("#")) {
      element.href = "#";
      element.dataset.sourceScroll = href.slice(1);
    } else if (/^https?:\/\//i.test(href)) {
      element.href = href;
      element.target = "_blank";
      element.rel = "noopener noreferrer";
    } else if (/^(mailto:|tel:)/i.test(href)) {
      element.href = href;
    } else {
      const [file, section = ""] = href.split("#");
      const targetSlug = file.replace(/^.*\//, "").replace(/\.html$/i, "");
      if (findRoute(targetSlug)) {
        element.href = `#/${targetSlug}`;
        element.dataset.route = targetSlug;
        if (section) element.dataset.routeSection = section;
      }
    }
  }

  [...sourceNode.childNodes].forEach((child) => {
    const safeChild = safeSourceNode(child, sourceSlug);
    if (safeChild) element.append(safeChild);
  });
  if (sourceNode.tagName === "A" && !element.hasAttribute("href")) {
    const text = document.createElement("span");
    text.append(...element.childNodes);
    return text;
  }
  return element;
}

function buildSourceToc(container, sourceSlug) {
  const toc = view.querySelector("[data-source-toc]");
  if (!toc) return;
  const headings = [...container.querySelectorAll("h2")];
  headings.forEach((heading, index) => {
    if (!heading.id) heading.id = `source-${sourceSlug}-${index + 1}`;
    if (container.classList.contains("article-content")) {
      heading.dataset.sectionIndex = String(index + 1).padStart(2, "0");
    }
  });
  const label = toc.getAttribute("data-source-toc-label") || "В материале";
  const limit = Number(toc.getAttribute("data-source-toc-limit")) || headings.length;
  toc.innerHTML = `
    <strong>${escapeHTML(label)}</strong>
    ${headings.slice(0, limit).map((heading, index) => {
      const title = heading.textContent.trim();
      const indexLabel = /^\d+[а-я]?\./iu.test(title) ? "§" : String(index + 1).padStart(2, "0");
      return `<button type="button" data-source-scroll="${heading.id}"><span>${indexLabel}</span>${escapeHTML(title)}</button>`;
    }).join("")}
    <span>${headings.length} ${headings.length === 1 ? "раздел" : headings.length < 5 ? "раздела" : "разделов"}</span>
  `;
}

function applySourceEditorialCorrections(sourceArticle, sourceSlug) {
  const corrections = {
    "guide-antiplagiat-ai": [
      [
        "Антиплагиат (проверка на заимствования)",
        "Система проверки заимствований сопоставляет текст с доступными источниками и показывает совпавшие фрагменты. Результат включает процент оригинальности и карту источников; он описывает происхождение текста, но не оценивает качество анализа."
      ],
      [
        "Детектор ИИ ничего не сравнивает с базой",
        "Детектор ИИ анализирует статистические признаки текста и выдаёт вероятностную оценку. Он не устанавливает авторство и не заменяет проверку источников, фактов и истории подготовки документа."
      ],
      [
        "Вывод, который экономит нервы",
        "Высокая оригинальность и низкая оценка вероятности машинной генерации отвечают на разные вопросы. Ни один из этих показателей сам по себе не подтверждает авторство."
      ]
    ],
    "guide-kursovaya-za-nedelyu": [
      [
        "Сразу договоримся о честном",
        "За семь дней можно подготовить рабочий черновик, если тема утверждена, а источники и данные доступны. Сначала сверьте методичку: она задаёт объём, структуру и оформление. План ниже распределяет работу по дням и фиксирует результат каждого этапа. Оценку и приёмку определяет вуз."
      ],
      [
        "отдельный круг ада",
        "Соберите источники по ключевым словам темы и сначала изучите аннотации. Сразу отмечайте, для какого раздела подходит материал, и сохраняйте полное библиографическое описание. Это избавит от восстановления выходных данных перед сдачей."
      ],
      [
        "живой авторский текст детекторы триггерят реже",
        "Если вуз использует детектор ИИ, сначала найдите локальные правила. Не редактируйте текст ради заданного процента: результат такой системы не доказывает авторство. Проверьте факты, источники и однотипные конструкции; сохраните черновики и историю версий."
      ]
    ],
    "guide-prakticheskaya-chast-kursovoy": [
      [
        "На главу достаточно 3–6 таблиц",
        "Количество таблиц определяется объёмом анализа. Перед каждой таблицей объясните её назначение. После таблицы сформулируйте наблюдение по данным."
      ],
      [
        "Главный миф — «данные негде взять»",
        "Данные для практической главы можно получить из открытой отчётности, официальной статистики, собственной выборки или проверяемых материалов организации. Источник, период и ограничения нужно указать в тексте."
      ]
    ],
    "guide-otchet-po-praktike": [
      [
        "Дневник заполняется по дням",
        "Дневник заполняют по дням или неделям — в зависимости от формы вуза. Если задачи повторялись, восстановите по календарю реальные этапы работы и опишите их отдельно. Примеры ниже подходят только для фактически выполненных действий."
      ],
      [
        "Отчёт без цифр",
        "Если в разделе нет показателей, выводы трудно проверить. Добавьте данные, назовите источник и объясните, что показывает каждый показатель."
      ],
      [
        "Копипаст с сайта организации",
        "Дословное копирование сайта организации создаёт заимствования и не подтверждает выполненную работу. Излагайте только проверенные сведения своими словами со ссылкой на источник."
      ],
      [
        "Выводы ни о чём",
        "В выводах назовите освоенные навыки, выполненные задачи и материалы, подготовленные для дальнейшей работы."
      ]
    ],
    "guide-dnevnik-praktiki": [
      [
        "По регламенту — руководитель от организации",
        "Порядок подписания задаёт форма вуза. Уточните у руководителя, нужна ли подпись за каждый день или достаточно заверить весь период. Не восстанавливайте подписи самостоятельно."
      ]
    ],
    "guide-zaklyuchenie-vkr": [
      [
        "Копипаста выводов по главам",
        "Не повторяйте выводы из глав дословно. В заключении их нужно сократить, связать с задачами и представить как единый итог исследования."
      ]
    ],
    "guide-zashchita-diploma": [
      [
        "Защита выпускной квалификационной работы — это короткий разговор",
        "Порядок защиты устанавливает вуз. Обычно студент представляет доклад, после чего комиссия знакомится с отзывом и рецензией и задаёт вопросы по теме, методу, результатам и ограничениям работы. На одного выступающего часто отводят 15–20 минут, но точный регламент нужно уточнить заранее."
      ],
      [
        "Оценка складывается не только из качества работы",
        "На итоговое впечатление влияют содержание работы, ясность доклада, качество слайдов и ответы на вопросы. Подготовьте эти части как единый сценарий и заранее сверьте его с регламентом кафедры."
      ],
      [
        "Комиссия проверяет, держите ли вы удар",
        "Резкая формулировка вопроса не меняет его содержания. Уточните, к какому выводу или ограничению относится замечание, согласитесь с корректной частью и спокойно объясните спорную."
      ],
      [
        "по ним прилетит вопрос",
        "Заранее разберите замечания из отзыва и рецензии. Для каждого подготовьте короткий ответ: что учтено в работе, какое ограничение остаётся и почему выбранный подход допустим."
      ],
      [
        "выглядит куда достойнее",
        "Если вопрос выходит за границы исследования, прямо обозначьте это и назовите возможное направление дальнейшей работы. Не дополняйте ответ неподтверждёнными сведениями."
      ]
    ],
    "consent-request": [
      [
        "Это отдельное согласие для ответа на ваше обращение",
        "Это уведомление описывает обработку данных, необходимых для ответа на обращение, оценки задачи и подготовки предложения. Аналитика, реклама, программа лояльности и публикация сведений требуют отдельного выбора."
      ],
      [
        "Устанавливая пустой по умолчанию флажок",
        "1.2. Перед отправкой формы пользователь подтверждает, что прочитал это уведомление. Отметка фиксирует ознакомление с редакцией документа и не подключает необязательные цели обработки."
      ],
      [
        "Согласие даёт достигшее 18 лет дееспособное лицо",
        "1.3. Заявку может направить дееспособное лицо, достигшее 18 лет. Не прикладывайте специальные категории данных, сведения о здоровье, копии паспортов и избыточные данные третьих лиц."
      ]
    ],
    "terms": [
      [
        "Платёжные модули на Сайте отсутствуют",
        "2.2. После согласования спецификации оплата открывается из дела заказа через подключённый платёжный сервис либо по реквизитам, указанным исполнителем. До подтверждения показываются сумма, назначение, получатель, способ оплаты и применимый платёжный документ."
      ]
    ],
    "oferta": [
      [
        "Подписка «Салон+» оформляется на условиях Правил программы лояльности",
        "12.3. Абонемент «Салон+» оформляется на условиях Правил программы лояльности. Состав, срок и цена показываются до отдельной оплаты. Абонемент активируется после подтверждения платежа и автоматически не продлевается."
      ],
      [
        "непосредственно связанные именно с отказанной Позиции",
        "10.2. До начала исполнения соответствующей Позиции её денежная оплата возвращается полностью. После начала возвращается оплата за фактически неоказанную часть. Учитываются стоимость реально оказанной и переданной самостоятельной услуги или отдельно оценённого этапа, а также документально подтверждённые фактические расходы, непосредственно связанные с отказом от этой Позиции и не учтённые повторно в стоимости оказанной части."
      ]
    ],
    "consent-analytics": [
      [
        "Получатель/обработчик данных Метрики",
        "При использовании Яндекс.Метрики ООО «ЯНДЕКС» обрабатывает перечисленные данные в пределах условий сервиса. Сырые события хранятся до отзыва согласия, но не более 12 месяцев; агрегированная обезличенная статистика может храниться дольше."
      ]
    ]
  };
  (corrections[sourceSlug] || []).forEach(([needle, replacement]) => {
    const block = [...sourceArticle.querySelectorAll("p, li")].find((item) => item.textContent.includes(needle));
    if (block) block.textContent = replacement;
  });

  const headingCorrections = {
    "guide-prakticheskaya-chast-kursovoy": {
      "Что от вас ждут на самом деле": "Что оценивают в практической главе",
      "Пять источников данных, которые реально доступны студенту": "Пять доступных источников данных"
    },
    "guide-zashchita-diploma": {
      "Что вообще происходит на защите": "Как обычно проходит защита"
    }
  };
  Object.entries(headingCorrections[sourceSlug] || {}).forEach(([before, after]) => {
    const heading = [...sourceArticle.querySelectorAll("h2, h3")].find((item) => item.textContent.trim() === before);
    if (heading) heading.textContent = after;
  });

  const faqHeadings = {
    "guide-temy-vkr": "Перед согласованием темы",
    "guide-obekt-predmet-cel-zadachi": "Проверка формулировок",
    "guide-vkr-struktura": "Сверка перед сдачей",
    "guide-vvedenie-kursovoy": "Что проверить во введении",
    "guide-kursovaya-za-nedelyu": "Если срок уже короткий",
    "guide-prakticheskaya-chast-kursovoy": "Вопросы о данных и методах",
    "guide-zaklyuchenie-kursovoy": "Проверка заключения",
    "guide-zaklyuchenie-vkr": "Связь выводов с задачами",
    "guide-spisok-literatury": "Спорные случаи оформления",
    "guide-normocontrol": "Что уточнить у кафедры",
    "guide-titulnyj-list": "Перед печатью титульного листа",
    "guide-prilozheniya-po-gost": "Перед сборкой приложений",
    "guide-antiplagiat-ai": "Как интерпретировать отчёт",
    "guide-otchet-po-praktike": "Комплект перед сдачей",
    "guide-dnevnik-praktiki": "Подписи и форма дневника",
    "guide-harakteristika-s-praktiki": "Передача документа руководителю",
    "guide-zashchita-diploma": "Вопросы перед защитой",
    "guide-prezentaciya-k-zashchite": "Перед показом слайдов",
    "guide-rech-na-zashchitu": "Репетиция доклада",
    "guide-otzyv-rukovoditelya-vkr": "Что подготовить руководителю",
    "guide-recenziya-na-vkr": "Что передать рецензенту",
    "guide-apellyaciya": "Перед подачей заявления",
    "guide-rinc-statya": "До отправки в журнал",
    "guide-skolko-stoit-kursovaya": "Как выбрать объём работы",
    "guide-skolko-stoit-diplomnaya": "Как выбрать объём работы"
  };
  const faqHeading = [...sourceArticle.querySelectorAll("h2")].find((item) => item.textContent.trim() === "Частые вопросы");
  if (faqHeading && faqHeadings[sourceSlug]) faqHeading.textContent = faqHeadings[sourceSlug];

  if (sourceSlug === "loyalty") {
    const constructorRow = [...sourceArticle.querySelectorAll("tr")].find((row) => row.textContent.includes("Конструктор («своя сборка»)"));
    constructorRow?.remove();
    const plansHeading = [...sourceArticle.querySelectorAll("h2")].find((heading) => heading.textContent.includes("планы и конструктор"));
    if (plansHeading) plansHeading.textContent = plansHeading.textContent.replace("планы и конструктор", "готовые планы");
    const plansIntro = [...sourceArticle.querySelectorAll("p")].find((paragraph) => paragraph.textContent.includes("Действуют готовые планы и конструктор"));
    if (plansIntro) plansIntro.textContent = "5.1. Абонемент — оплачиваемый пакет привилегий на определённый срок. Доступны три готовых плана:";
  }
}

function centerRailItem(rail, item, behavior = "auto") {
  if (!(rail instanceof HTMLElement) || !(item instanceof HTMLElement)) return;
  if (rail.scrollWidth <= rail.clientWidth + 8) return;
  const railRect = rail.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  const target = rail.scrollLeft
    + (itemRect.left - railRect.left)
    - (rail.clientWidth - itemRect.width) / 2;
  rail.scrollTo({
    left: Math.max(0, Math.min(rail.scrollWidth - rail.clientWidth, target)),
    behavior
  });
}

function updateReadingUI() {
  const progress = view.querySelector("[data-reading-progress]");
  const source = view.querySelector("[data-source-document][aria-busy='false']");
  if (!progress || !source) return;

  const sourceTop = source.getBoundingClientRect().top + window.scrollY;
  const start = sourceTop - (matchMedia("(max-width: 920px)").matches ? 92 : 118);
  const finish = Math.max(start + 1, sourceTop + source.scrollHeight - Math.max(window.innerHeight * .58, 320));
  const ratio = Math.min(1, Math.max(0, (window.scrollY - start) / (finish - start)));
  progress.style.setProperty("--reading-progress", ratio.toFixed(4));
  progress.classList.toggle("is-reading", ratio > 0 && ratio < 1);

  const headings = [...source.querySelectorAll("h2[id]")];
  if (!headings.length) return;
  const rootScrollPadding = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  const headingScrollMargin = Number.parseFloat(getComputedStyle(headings[0]).scrollMarginTop) || 0;
  const threshold = rootScrollPadding + headingScrollMargin + 8;
  let current = headings[0];
  for (const heading of headings) {
    if (heading.getBoundingClientRect().top <= threshold) current = heading;
    else break;
  }
  view.querySelectorAll("[data-source-toc] [data-source-scroll]").forEach((button) => {
    const isCurrent = button.getAttribute("data-source-scroll") === current.id;
    button.classList.toggle("is-current", isCurrent);
    if (isCurrent) button.setAttribute("aria-current", "location");
    else button.removeAttribute("aria-current");
  });
  const toc = view.querySelector("[data-source-toc]");
  const activeButton = toc?.querySelector(`[data-source-scroll="${CSS.escape(current.id)}"]`);
  if (toc && activeButton && toc.dataset.activeSection !== current.id) {
    toc.dataset.activeSection = current.id;
    centerRailItem(toc, activeButton, preferredScrollBehavior());
  }
}

function centerCurrentRails() {
  if (!matchMedia("(max-width: 920px)").matches) return;
  [".legal-nav", ".benefit-nav", ".account-nav nav"].forEach((selector) => {
    const rail = view.querySelector(selector);
    const current = rail?.querySelector(".is-current, [aria-current='page']");
    centerRailItem(rail, current);
  });
}

async function hydrateSourceDocuments(slug, { announceFailure = false } = {}) {
  const targets = [...view.querySelectorAll("[data-source-document]")];
  if (!targets.length) return;
  await Promise.all(targets.map(async (target) => {
    const sourceSlug = target.getAttribute("data-source-slug");
    const kind = target.getAttribute("data-source-kind");
    try {
      const response = await fetch(`../../${encodeURIComponent(sourceSlug)}.html`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const sourceHTML = await response.text();
      if (parseRoute() !== slug || !target.isConnected) return;
      const sourceDocument = new DOMParser().parseFromString(sourceHTML, "text/html");
      const sourceArticle = sourceDocument.querySelector("main.doc-wrap > article.doc, main article.doc");
      if (!sourceArticle) throw new Error("Документ не найден");
      applySourceEditorialCorrections(sourceArticle, sourceSlug);

      const sourceTitle = sourceArticle.querySelector(":scope > h1")?.textContent?.trim();
      const sourceSubtitle = sourceArticle.querySelector(":scope > .doc-subtitle")?.textContent?.trim();
      const sourceMetaNode = sourceArticle.querySelector(":scope > .doc-meta")
        || [...sourceArticle.children].slice(0, 4).find((child) => child.tagName === "P" && /редакци[яи]|вступает в силу|обновлено/i.test(child.textContent || ""));
      const sourceMeta = sourceMetaNode?.textContent?.trim();
      const canonicalGuide = kind === "article" ? guides.find((item) => item.slug === sourceSlug) : null;
      const resolvedTitle = canonicalGuide?.title || (sourceTitle ? replaceEditorialTerms(sourceTitle) : "");
      const resolvedSubtitle = canonicalGuide?.summary || (sourceSubtitle ? replaceEditorialTerms(sourceSubtitle) : "");
      if (resolvedTitle) {
        const heroTitle = kind === "article"
          ? view.querySelector(".article-hero h1")
          : view.querySelector(".legal-content > header h1");
        if (heroTitle) heroTitle.textContent = resolvedTitle;
        document.title = `${resolvedTitle} · Академический Салон`;
      }
      if (resolvedSubtitle) {
        const heroLead = kind === "article"
          ? view.querySelector(".article-hero > p")
          : view.querySelector("[data-source-lead]");
        if (heroLead) heroLead.textContent = resolvedSubtitle;
      }
      const metaNode = view.querySelector("[data-source-meta]");
      if (metaNode) metaNode.textContent = sourceMeta ? replaceEditorialTerms(sourceMeta) : "Опубликованный материал";

      const fragment = document.createDocumentFragment();
      [...sourceArticle.children].forEach((child) => {
        if (child.tagName === "H1" || child.classList.contains("doc-back")) return;
        if (child === sourceMetaNode) return;
        if (child.classList.contains("doc-subtitle") || child.classList.contains("doc-meta")) return;
        const safeNode = safeSourceNode(child, sourceSlug);
        if (safeNode) fragment.append(safeNode);
      });
      target.replaceChildren(fragment);
      target.querySelectorAll("table").forEach((table, index) => {
        if (table.closest(".source-table-wrap")) return;
        const wrapper = document.createElement("div");
        const hint = document.createElement("div");
        const hintId = `source-table-hint-${sourceSlug}-${index + 1}`;
        wrapper.className = "source-table-wrap";
        hint.className = "source-table-hint";
        hint.id = hintId;
        hint.textContent = "Проведите влево, чтобы увидеть все столбцы";
        table.before(wrapper);
        wrapper.append(table, hint);
        table.tabIndex = 0;
        table.setAttribute("aria-describedby", hintId);
      });
      polishTypography(target);
      target.setAttribute("aria-busy", "false");
      if (kind === "article") {
        target.querySelector(":scope > p")?.classList.add("article-opening");
      }
      buildSourceToc(target, sourceSlug);
      requestAnimationFrame(updateReadingUI);

      const requestedSection = pendingSourceSection || new URLSearchParams(location.hash.split("?")[1] || "").get("section");
      if (requestedSection && deferredSourceScroll === null) {
        requestAnimationFrame(() => {
          const destination = target.querySelector(`#${CSS.escape(requestedSection)}`);
          if (destination) focusLocalSection(destination, requestedSection, { updateUrl: true, behavior: "auto" });
        });
      }
      pendingSourceSection = "";
      restoreDeferredSourceScroll(slug);
    } catch {
      if (!target.isConnected) return;
      target.innerHTML = `<div class="source-error" role="status" aria-live="polite" tabindex="-1"><strong>Не удалось открыть опубликованный текст</strong><p>Проверьте локальный сервер и повторите загрузку.</p><button class="button button--secondary" type="button" data-retry-source>Повторить</button></div>`;
      target.setAttribute("aria-busy", "false");
      if (announceFailure) target.querySelector(".source-error")?.focus({ preventScroll: true });
      restoreDeferredSourceScroll(slug);
    }
  }));
}

async function hydratePublishedGuideMetadata(slug) {
  try {
    if (!publishedGuideMetadata) {
      const response = await fetch("../../knowledge.html", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const sourceDocument = new DOMParser().parseFromString(await response.text(), "text/html");
      publishedGuideMetadata = [...sourceDocument.querySelectorAll(".kb-entry[data-guide]")].map((entry) => ({
        slug: (entry.getAttribute("href") || "").replace(/^.*\//, "").replace(/\.html$/i, ""),
        title: entry.getAttribute("data-title") || entry.querySelector("h3")?.textContent?.trim() || "",
        summary: entry.querySelector(":scope > span:nth-child(2) > p")?.textContent?.trim() || entry.getAttribute("data-summary") || "",
        tag: entry.querySelector(".kb-entry-tag")?.textContent?.trim() || "",
        reading: entry.querySelector("time")?.textContent?.trim() || ""
      }));
    }
    if (parseRoute() !== slug) return;
    publishedGuideMetadata.forEach((item) => {
      const canonicalGuide = guides.find((guide) => guide.slug === item.slug);
      view.querySelectorAll(`.article-card a[data-route="${item.slug}"]`).forEach((card) => {
        const tag = card.querySelector(".tag");
        const title = card.querySelector("h3");
        const summary = card.querySelector("p");
        const reading = card.querySelector("footer > span:first-child");
        if (tag) tag.textContent = canonicalGuide?.category || item.tag;
        if (title) title.textContent = canonicalGuide?.title || replaceEditorialTerms(item.title);
        if (summary) summary.textContent = canonicalGuide?.summary || replaceEditorialTerms(item.summary);
        if (reading) reading.textContent = canonicalGuide?.reading || item.reading;
      });
      view.querySelectorAll(`.home-library__articles a[data-route="${item.slug}"]`).forEach((card) => {
        const title = card.querySelector("strong");
        const meta = card.querySelector("small");
        if (title) title.textContent = canonicalGuide?.title || replaceEditorialTerms(item.title);
        if (meta) meta.textContent = `${canonicalGuide?.category || item.tag} · ${canonicalGuide?.reading || item.reading}`;
      });
    });
    polishTypography(view);
  } catch {
    // Исходный каталог остаётся доступен отдельным маршрутом.
  }
}

async function hydratePublishedReviewMetadata(slug) {
  try {
    if (!publishedReviewMetadata) {
      const response = await fetch("../../reviews.html", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const sourceDocument = new DOMParser().parseFromString(await response.text(), "text/html");
      publishedReviewMetadata = [...sourceDocument.querySelectorAll(".rv-item .rv-shot[data-full]")].map((button) => {
        const asset = button.getAttribute("data-full") || "";
        return {
          id: asset.match(/review-(\d+)\.webp/i)?.[1] || "",
          alt: button.querySelector("img")?.getAttribute("alt") || button.getAttribute("aria-label") || "",
          label: button.closest(".rv-item")?.querySelector("figcaption")?.textContent?.trim() || ""
        };
      });
    }
    if (parseRoute() !== slug) return;
    publishedReviewMetadata.forEach((item) => {
      const trigger = view.querySelector(`[data-review-proof="${item.id}"]`);
      if (trigger) {
        trigger.setAttribute("aria-label", `Открыть крупнее: ${item.label}`);
        const image = trigger.querySelector("img");
        if (image) image.alt = item.alt;
        const caption = trigger.closest("figure")?.querySelector("figcaption strong");
        if (caption) caption.textContent = item.label;
      }
      const homeImage = view.querySelector(`[data-review-home="${item.id}"]`);
      if (homeImage) homeImage.alt = item.alt;
    });
  } catch {
    // В интерфейсе остаются обезличенные подписи без вымышленных деталей.
  }
}

function updateStartLabels() {
  const hasDraft = state.wizard.started && !state.wizard.submitted;
  document.querySelectorAll("[data-start-label]").forEach((item) => {
    item.textContent = hasDraft ? "Продолжить" : "Описать";
  });
}

function showToast(message, action = "") {
  const activeDialog = [supportDialog, actionDialog, searchDialog, menuDialog].find((dialog) => dialog?.open);
  let activeRegion = toastRegion;
  if (activeDialog) {
    activeRegion = activeDialog.querySelector("[data-dialog-toast-region]");
    if (!activeRegion) {
      activeRegion = document.createElement("div");
      activeRegion.className = "toast-region toast-region--dialog";
      activeRegion.dataset.dialogToastRegion = "";
      activeRegion.setAttribute("aria-live", "polite");
      activeRegion.setAttribute("aria-atomic", "true");
      activeDialog.append(activeRegion);
    }
  }
  if (!activeRegion) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<span class="toast__mark">✓</span><p>${escapeHTML(message)}</p>${action ? `<button type="button">${escapeHTML(action)}</button>` : ""}`;
  activeRegion.append(toast);
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  const remove = () => {
    toast.classList.remove("is-visible");
    setTimeout(() => toast.remove(), 220);
  };
  toast.addEventListener("click", remove, { once: true });
  setTimeout(remove, 4200);
}

function clearDialogDismiss(dialog) {
  const timer = dialogDismissTimers.get(dialog);
  if (timer) window.clearTimeout(timer);
  dialogDismissTimers.delete(dialog);
  const registration = dialogDismissHandlers.get(dialog);
  if (registration) registration.panel?.removeEventListener("animationend", registration.handler);
  dialogDismissHandlers.delete(dialog);
}

function openDialog(dialog, trigger) {
  if (!dialog || typeof dialog.showModal !== "function") return;
  if (dialog.open) return;
  clearDialogDismiss(dialog);
  dialog.classList.remove("is-closing");
  dialogTriggers.set(dialog, trigger || document.activeElement);
  persistHistoryScroll(true);
  const currentState = history.state && typeof history.state === "object" ? history.state : {};
  const dialogState = { ...currentState, salonDialog: dialog.id };
  if (currentState.salonDialog) history.replaceState(dialogState, "", location.href);
  else history.pushState(dialogState, "", location.href);
  dialog.showModal();
  document.body.classList.add("has-dialog");
}

function closeDialog(dialog, { preserveHistory = false } = {}) {
  if (!dialog?.open) return;
  clearDialogDismiss(dialog);
  if (preserveHistory) dialog.dataset.preserveDialogHistory = "true";
  dialog.close();
}

function dismissDialog(dialog) {
  if (!dialog?.open || dialog.classList.contains("is-closing")) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    closeDialog(dialog);
    return;
  }
  dialog.classList.add("is-closing");
  const panel = dialog.querySelector(".overlay__panel");
  const finish = () => {
    clearDialogDismiss(dialog);
    if (dialog.open) dialog.close();
  };
  const handleAnimationEnd = (event) => {
    if (event.target !== panel) return;
    finish();
  };
  panel?.addEventListener("animationend", handleAnimationEnd);
  dialogDismissHandlers.set(dialog, { panel, handler: handleAnimationEnd });
  dialogDismissTimers.set(dialog, window.setTimeout(finish, 260));
}

function closeAllDialogs(options = {}) {
  [menuDialog, searchDialog, supportDialog, actionDialog].forEach((dialog) => closeDialog(dialog, options));
}

function initDialog(dialog) {
  if (!dialog) return;
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dismissDialog(dialog);
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    dismissDialog(dialog);
  });
  dialog.addEventListener("close", () => {
    const preserveHistory = dialog.dataset.preserveDialogHistory === "true";
    delete dialog.dataset.preserveDialogHistory;
    clearDialogDismiss(dialog);
    dialog.classList.remove("is-closing");
    if (dialog === searchDialog) {
      searchInput?.setAttribute("aria-expanded", "false");
      searchInput?.removeAttribute("aria-activedescendant");
    }
    if (![menuDialog, searchDialog, supportDialog, actionDialog].some((item) => item?.open)) {
      document.body.classList.remove("has-dialog");
    }
    const trigger = dialogTriggers.get(dialog);
    const triggerIsVisible = trigger?.isConnected && trigger.getClientRects().length > 0 && !trigger.closest("[hidden]");
    if (triggerIsVisible && typeof trigger.focus === "function") {
      trigger.focus({ preventScroll: true });
    } else {
      const heading = view.querySelector("h1");
      if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
        heading.addEventListener("blur", () => heading.removeAttribute("tabindex"), { once: true });
      }
    }
    dialogTriggers.delete(dialog);
    if (!preserveHistory && history.state?.salonDialog === dialog.id) {
      history.back();
    }
  });
}

[menuDialog, searchDialog, supportDialog, actionDialog].forEach(initDialog);

function syncThemeControls(theme) {
  const value = theme === "dark" ? "dark" : "light";
  const nextTheme = value === "dark" ? "светлую" : "тёмную";
  document.querySelectorAll("[data-toggle-theme]").forEach((control) => {
    control.setAttribute("aria-label", `Включить ${nextTheme} тему`);
    control.setAttribute("title", `Включить ${nextTheme} тему`);
  });
  document.querySelectorAll("[data-theme-action]").forEach((label) => {
    label.textContent = `Включить ${nextTheme} тему`;
  });
  document.querySelectorAll("[data-theme-glyph]").forEach((glyph) => {
    glyph.textContent = value === "dark" ? "☀" : "◐";
  });
  document.querySelectorAll("[data-set-theme]").forEach((control) => {
    const isCurrent = control.getAttribute("data-set-theme") === value;
    control.classList.toggle("is-current", isCurrent);
    control.setAttribute("aria-pressed", String(isCurrent));
  });
}

function setTheme(theme, { persist = true } = {}) {
  const value = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = value;
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, value);
    } catch {
      // Режим всё равно применяется в текущей вкладке.
    }
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", value === "dark" ? "#171714" : "#f3eee4");
  syncThemeControls(value);
}

function toggleTheme() {
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  showToast(document.documentElement.dataset.theme === "dark" ? "Включена тёмная тема" : "Включена светлая тема");
}

function initialTheme() {
  let saved = "";
  try {
    saved = localStorage.getItem(THEME_KEY) || "";
  } catch {
    saved = "";
  }
  if (saved === "light" || saved === "dark") return saved;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function hasSavedTheme() {
  try {
    return ["light", "dark"].includes(localStorage.getItem(THEME_KEY));
  } catch {
    return false;
  }
}

function openSearch(trigger) {
  openDialog(searchDialog, trigger);
  searchInput?.setAttribute("aria-expanded", "true");
  requestAnimationFrame(() => {
    if (searchInput) {
      searchInput.value = "";
      searchInput.focus();
      renderSearch("");
    }
  });
}

function renderSearch(query) {
  if (!searchResults) return;
  const normalized = query.trim().toLocaleLowerCase("ru");
  searchMatches = (normalized
    ? searchItems.filter((item) => item.search.includes(normalized))
    : searchItems.filter((item) => ["home", "services", "tariffs", "start", "knowledge", "plus", "deposit"].includes(item.slug))
  ).slice(0, 9);
  searchSelection = searchMatches.length ? 0 : -1;
  searchResults.innerHTML = searchMatches.length
    ? searchMatches.map((item, index) => `
        <button class="${index === searchSelection ? "is-selected" : ""}" id="site-search-option-${index}" type="button" role="option" aria-selected="${index === searchSelection}" data-search-open="${item.slug}" data-search-index="${index}">
          <span class="tag">${item.section}</span>
          <span><strong>${item.title}</strong><small>${item.description}</small></span>
          <b aria-hidden="true">→</b>
        </button>
      `).join("")
    : `<div class="search-empty"><strong>Ничего не найдено</strong><p>Попробуйте сократить запрос или откройте карту всех разделов.</p><button type="button" data-search-open="site-map">Все страницы</button></div>`;
  if (searchSelection >= 0) {
    searchInput?.setAttribute("aria-activedescendant", `site-search-option-${searchSelection}`);
  } else {
    searchInput?.removeAttribute("aria-activedescendant");
  }
}

function updateSearchSelection() {
  searchResults?.querySelectorAll("[data-search-index]").forEach((item) => {
    const isSelected = Number(item.getAttribute("data-search-index")) === searchSelection;
    item.classList.toggle("is-selected", isSelected);
    item.setAttribute("aria-selected", String(isSelected));
  });
  if (searchSelection >= 0) {
    searchInput?.setAttribute("aria-activedescendant", `site-search-option-${searchSelection}`);
  } else {
    searchInput?.removeAttribute("aria-activedescendant");
  }
  searchResults?.querySelector(".is-selected")?.scrollIntoView({ block: "nearest" });
}

function startWizard(patch = {}) {
  state.wizard = {
    ...state.wizard,
    ...patch,
    started: true,
    submitted: false,
    step: patch.step ?? state.wizard.step ?? 0
  };
  saveState();
  queueRenderFocus(".wizard-main h1", { reveal: "start" });
  navigate("start");
}

function wizardChoice(key, value) {
  state.wizard[key] = value;
  state.wizard.started = true;
  saveState();
  queueRenderFocus((root) => [...root.querySelectorAll("[data-wizard-choice]")].find((button) =>
    button.getAttribute("data-wizard-key") === key &&
    button.getAttribute("data-wizard-choice") === value
  ));
  render(true);
}

function wizardNext() {
  const wizard = state.wizard;
  const requiredKeys = ["situation", "workType", "result", "deadline"];
  if (wizard.step < requiredKeys.length && !wizard[requiredKeys[wizard.step]]) {
    showToast("Выберите один вариант, чтобы продолжить");
    return;
  }
  if (wizard.step === wizardStepCount - 1) {
    if (!wizard.name.trim() || !wizard.contact.trim()) {
      showToast("Укажите имя и контакт для ответа");
      view.querySelector('[data-wizard-field="name"]')?.focus();
      return;
    }
    if (!wizard.consent) {
      showToast("Подтвердите, что прочитали уведомление об обработке данных");
      return;
    }
    navigate("zayavka");
    return;
  }
  wizard.step += 1;
  wizard.started = true;
  saveState();
  queueRenderFocus(".wizard-main h1", { reveal: "start" });
  render(true);
}

function wizardBack() {
  state.wizard.step = Math.max(0, state.wizard.step - 1);
  saveState();
  queueRenderFocus(".wizard-main h1", { reveal: "start" });
  render(true);
}

function submitDemoOrder() {
  const wizard = state.wizard;
  if (!wizard.name.trim() || !wizard.contact.trim() || !wizard.workType || !wizard.result || !wizard.deadline || !wizard.consent) {
    showToast("Сначала заполните и проверьте заявку");
    navigate("start");
    return;
  }
  state.demoCounter = (state.demoCounter || 0) + 1;
  state.demoOrder = {
    id: `DEMO-${String(state.demoCounter).padStart(3, "0")}`,
    title: `${state.wizard.result || "Редакторская оценка"} · ${state.wizard.workType || "Новая задача"}`,
    status: "Черновик заявки",
    statusKey: "attention",
    progress: 10,
    deadline: "Оценка редактора",
    amount: 0,
    paid: 0,
    stage: "Заявка сохранена только в этом браузере",
    next: "В рабочей версии после отправки здесь появится оценка",
    updated: "только что"
  };
  state.wizard.submitted = true;
  saveState();
  showToast("Пример заявки сохранён в этом браузере");
  navigate("dashboard");
}

function actionDialogContent(html, trigger = document.activeElement) {
  const container = actionDialog?.querySelector("[data-action-dialog-content]");
  if (!container) return;
  container.innerHTML = html;
  container.querySelectorAll("[data-close-dialog]:not([aria-label])").forEach((button) => {
    button.setAttribute("aria-label", "Закрыть");
  });
  polishTypography(container);
  openDialog(actionDialog, trigger);
}

function openPaymentDialog(trigger) {
  actionDialogContent(`
    <header class="overlay__header">
      <div><span class="eyebrow">Демонстрация оплаты</span><h2 id="actionDialogTitle">14 500 ₽</h2></div>
      <button class="icon-button icon-button--close" type="button" data-close-dialog aria-label="Закрыть">×</button>
    </header>
    <div class="payment-sheet">
      <div class="payment-sheet__summary">
        <span><small>Дело</small><strong>DEMO-2417</strong></span>
        <span><small>Этап</small><strong>Редактура второй главы</strong></span>
        <span><small>Результат</small><strong>28 июля</strong></span>
      </div>
      <fieldset>
        <legend>Способ оплаты</legend>
        <label><input type="radio" name="pay-method" value="card" checked><span><strong>Банковская карта</strong><small>МИР, Visa или Mastercard</small></span></label>
        <label><input type="radio" name="pay-method" value="sbp"><span><strong>СБП</strong><small>Через приложение банка</small></span></label>
      </fieldset>
      <label class="consent-check"><input type="checkbox" checked data-payment-agree><span>Сумма и назначение совпадают со спецификацией v2.</span></label>
      <button class="button button--primary button--large" type="button" data-demo-pay>Показать результат оплаты</button>
      <p>Платёжные данные не запрашиваются: открыт безопасный пример операции.</p>
    </div>
  `, trigger);
}

function openAccountSection(section, trigger) {
  const config = {
    documents: {
      title: "Документы",
      intro: "Спецификации, чеки и результаты по всем делам.",
      items: [
        ["PDF", "Спецификация_v2.pdf", "DEMO-2417 · 224 КБ"],
        ["PDF", "Чек_14500.pdf", "DEMO-2417 · 96 КБ"],
        ["DOC", "Карта_правок.docx", "DEMO-2368 · 438 КБ"],
        ["PDF", "Акт_приёмки.pdf", "DEMO-2368 · 112 КБ"]
      ]
    },
    payments: {
      title: "Платежи",
      intro: "Суммы связаны с конкретными этапами и документами.",
      items: [
        ["₽", "14 500 ₽ · Оплачено", "DEMO-2417 · 23 июля"],
        ["₽", "2 500 ₽ · Оплачено", "DEMO-2368 · 12 июля"],
        ["₽", "2 500 ₽ · Оплачено", "DEMO-2304 · 1 июля"]
      ]
    }
  }[section] || {
    title: "Раздел кабинета",
    intro: "Полный экран будет использовать ту же структуру.",
    items: []
  };
  actionDialogContent(`
    <header class="overlay__header">
      <div><span class="eyebrow">Личный кабинет</span><h2 id="actionDialogTitle">${config.title}</h2></div>
      <button class="icon-button icon-button--close" type="button" data-close-dialog aria-label="Закрыть">×</button>
    </header>
    <div class="account-sheet">
      <p>${config.intro}</p>
      <div>${config.items.map(([icon, title, note]) => `<button class="file-row" type="button" data-toast="Загрузка недоступна в концепте"><i>${icon}</i><span><strong>${title}</strong><small>${note}</small></span><b aria-hidden="true">—</b></button>`).join("")}</div>
    </div>
  `, trigger);
}

function openAdminOrder(id, trigger) {
  actionDialogContent(`
    <header class="overlay__header">
      <div><span class="eyebrow">Дело ${escapeHTML(id)}</span><h2 id="actionDialogTitle">Карточка решения</h2></div>
      <button class="icon-button icon-button--close" type="button" data-close-dialog aria-label="Закрыть">×</button>
    </header>
    <div class="admin-order-sheet">
      <div class="admin-order-sheet__status"><span class="tag tag--attention">Требуется решение</span><span>Срок сегодня, 17:00</span></div>
      <h3>Разбор замечаний и смета редакторского этапа</h3>
      <dl><div><dt>Клиент</dt><dd>Илья П.</dd></div><div><dt>Материалы</dt><dd>3 файла</dd></div><div><dt>Ответственный</dt><dd>Не назначен</dd></div><div><dt>Ориентир</dt><dd>9 000 ₽</dd></div></dl>
      <label class="field"><span>Следующее действие</span><select><option>Подготовить смету</option><option>Запросить материалы</option><option>Назначить редактора</option><option>Отказать с пояснением</option></select></label>
      <label class="field"><span>Комментарий клиенту</span><textarea rows="4" placeholder="Коротко объясните решение"></textarea></label>
      <div><button class="button button--primary" type="button" data-admin-save-action>Сохранить решение</button><button class="button button--text" type="button" data-toast="Полная карточка недоступна в концепте">Открыть дело</button></div>
    </div>
  `, trigger);
}

function runTextCheck() {
  const text = (view.querySelector("[data-check-text]")?.value || "").trim();
  if (text.length < 40) {
    showToast("Добавьте хотя бы два предложения");
    return;
  }
  const words = text.split(/\s+/).filter(Boolean);
  const sentences = text.split(/[.!?]+/).map((item) => item.trim()).filter(Boolean);
  const average = Math.max(1, Math.round(words.length / Math.max(1, sentences.length)));
  const weakWords = (text.match(/(?<![\p{L}\p{N}_])(?:данный|является|осуществляется|следует отметить|необходимо отметить|в рамках)(?![\p{L}\p{N}_])/giu) || []).length;
  const longSentences = sentences.filter((sentence) => sentence.split(/\s+/).length > 24).length;
  const repeated = findRepeatedWords(words);
  const formalCount = longSentences + weakWords + repeated.length;
  const findings = [];
  findings.push({
    level: longSentences ? "warning" : "good",
    label: longSentences ? String(longSentences) : "✓",
    title: longSentences ? "Длинные предложения" : "Длина предложений",
    note: longSentences ? "Разделите места, где в одном предложении соединены несколько выводов." : "Средняя длина не мешает чтению."
  });
  findings.push({
    level: weakWords ? "warning" : "good",
    label: weakWords ? String(weakWords) : "✓",
    title: weakWords ? "Тяжёлые обороты" : "Канцелярские обороты",
    note: weakWords ? "Проверьте «данный», «является», «осуществляется» и вводные фразы." : "Частые канцелярские маркеры не найдены."
  });
  findings.push({
    level: repeated.length ? "neutral" : "good",
    label: repeated.length ? String(repeated.length) : "✓",
    title: repeated.length ? "Повторяющиеся слова" : "Заметные повторы",
    note: repeated.length ? `Чаще других встречаются: ${repeated.slice(0, 4).join(", ")}.` : "Повторов с высокой частотой не найдено."
  });
  state.checkText = text;
  state.textCheck = {
    words: words.length,
    sentences: sentences.length,
    average,
    formalCount,
    findings
  };
  saveState();
  queueRenderFocus(".checker-result h2", { reveal: "center" });
  render(true);
}

function findRepeatedWords(words) {
  const stop = new Set(["это", "как", "для", "или", "при", "что", "также", "были", "была", "быть", "его", "она", "они", "под", "над", "между", "после", "перед", "который", "которая", "данные"]);
  const map = new Map();
  words
    .map((word) => word.toLocaleLowerCase("ru").replace(/[^\p{L}\p{N}-]/gu, ""))
    .filter((word) => word.length > 4 && !stop.has(word))
    .forEach((word) => map.set(word, (map.get(word) || 0) + 1));
  return [...map.entries()].filter(([, count]) => count >= 3).sort((a, b) => b[1] - a[1]).map(([word]) => word);
}

function runTopicAudit() {
  const title = (view.querySelector("[data-topic-title]")?.value || "").trim();
  if (title.length < 15) {
    showToast("Введите полную формулировку темы");
    return;
  }
  const discipline = view.querySelector("[data-topic-discipline]")?.value || "выбранного направления";
  state.topicTitle = title;
  state.topicAudit = {
    area: `«${discipline}». Уточните конкретный процесс, группу или организацию.`,
    focus: title.includes(" и ") ? "Связь двух названных явлений и условия, при которых она проявляется." : "Конкретный предмет, период и группа, указанные в формулировке.",
    question: "Указать доступную базу исследования, период и данные, по которым можно проверить результат.",
    editor: "Какой материал позволит ответить на вопрос темы: документы, наблюдения, показатели, тексты или результаты методики?"
  };
  saveState();
  queueRenderFocus(".topic-audit__result h2", { reveal: "center" });
  render(true);
}

function runSourceCheck() {
  const text = (view.querySelector("[data-source-text]")?.value || "").trim();
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) {
    showToast("Добавьте хотя бы одну библиографическую запись");
    return;
  }
  state.sourceText = text;
  state.sourceResult = lines.map((line) => {
    let issue = "";
    if (!/\b(19|20)\d{2}\b/.test(line)) issue = "Не найден год публикации";
    else if (!/[А-ЯA-Z][а-яa-z-]+\s+[А-ЯA-Z]\./.test(line) && !/ГОСТ|Федеральн|Министерств|Организац/i.test(line)) issue = "Проверьте автора или организацию";
    else if (/https?:\/\//.test(line) && !/дата обращения|accessed/i.test(line)) issue = "Для интернет-источника нужна дата обращения";
    return { text: line, issue };
  });
  saveState();
  queueRenderFocus(".source-checker > section:last-child h2", { reveal: "center" });
  render(true);
}

function matchesSearch(source, query) {
  const normalizedSource = String(source).toLocaleLowerCase("ru").replaceAll("ё", "е");
  const queryTokens = String(query).trim().toLocaleLowerCase("ru").replaceAll("ё", "е").match(/[\p{L}\p{N}-]+/gu) || [];
  return queryTokens.every((token) => {
    const stem = token.length >= 6 ? token.slice(0, -2) : token;
    return normalizedSource.includes(stem);
  });
}

function filterCards(selector, query, attribute = "data-search") {
  let visible = 0;
  document.querySelectorAll(selector).forEach((item) => {
    const source = item.getAttribute(attribute) || item.textContent;
    item.hidden = !matchesSearch(source, query);
    if (!item.hidden) visible += 1;
  });
  return visible;
}

function setPressedGroup(selector, trigger, activeClass = "is-active") {
  document.querySelectorAll(selector).forEach((button) => {
    const isCurrent = button === trigger;
    button.classList.toggle(activeClass, isCurrent);
    button.setAttribute("aria-pressed", String(isCurrent));
  });
}

function syncInteractiveStates() {
  document.querySelectorAll(
    ".filter-tabs button, [data-gift-amount], [data-cover-layout], [data-cover-format], [data-client]"
  ).forEach((button) => {
    button.setAttribute("aria-pressed", String(
      button.classList.contains("is-active")
      || button.classList.contains("is-selected")
      || button.classList.contains("is-current")
    ));
  });
}

function serviceFilterMatches(value, item) {
  const matches = {
    all: () => true,
    start: (service) => ["plan", "kandidatskaya-dissertaciya"].includes(service.slug),
    draft: (service) => ["kursovaya-rabota", "diplomnaya-rabota", "magisterskaya-dissertaciya", "nauchnaya-statya", "redaktura-posle-ii", "razbor-zamechaniy-nauchruka"].includes(service.slug),
    finish: (service) => ["normokontrol-vkr", "otchet-po-praktike"].includes(service.slug)
  }[value] || (() => true);
  return matches(item);
}

function catalogLimit(kind) {
  const mobile = window.matchMedia("(max-width: 620px)").matches;
  if (kind === "services") return mobile ? 5 : 8;
  return mobile ? 8 : 12;
}

function updateCatalogMore(button, matchCount, limit, isDefaultView, label) {
  if (!button) return;
  const remaining = Math.max(0, matchCount - limit);
  const expanded = button.dataset.expanded === "true";
  button.hidden = !isDefaultView || expanded || remaining === 0;
  button.textContent = `Показать остальные — ${remaining}`;
  button.setAttribute("aria-label", `Показать остальные ${label}: ${remaining}`);
}

function preferredScrollBehavior() {
  return matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

function fitCoverTitle() {
  const canvas = view.querySelector("[data-cover-canvas]");
  const title = canvas?.querySelector("[data-cover-preview-title]");
  const index = canvas?.querySelector(".cover-canvas__index");
  const footer = canvas?.querySelector("footer");
  if (!canvas || !title || !index || !footer || !canvas.clientWidth) return;

  const minSize = 8;
  let low = minSize;
  let high = Math.min(58, canvas.clientWidth * (canvas.dataset.layout === "index" ? .07 : .065));
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const size = (low + high) / 2;
    title.style.fontSize = `${size}px`;
    const titleRect = title.getBoundingClientRect();
    const indexRect = index.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    const fits = titleRect.top >= indexRect.bottom + 6 && titleRect.bottom <= footerRect.top - 8;
    if (fits) low = size;
    else high = size;
  }
  title.style.fontSize = `${Math.max(minSize, Math.floor(low * 10) / 10)}px`;
}

function focusLocalSection(destination, id, { updateUrl = true, behavior = preferredScrollBehavior() } = {}) {
  if (!(destination instanceof HTMLElement)) return;
  if (updateUrl) {
    const nextUrl = `${location.pathname}${location.search}#/${parseRoute()}?section=${encodeURIComponent(id)}`;
    const currentState = history.state && typeof history.state === "object" ? history.state : {};
    history.replaceState({ ...currentState, salonScrollY: Math.round(window.scrollY) }, "", nextUrl);
  }
  destination.scrollIntoView({ behavior, block: "start" });
  const focusTarget = destination.matches("h1, h2, h3, h4")
    ? destination
    : destination.querySelector("h1, h2, h3, h4") || destination;
  const hadTabIndex = focusTarget.hasAttribute("tabindex");
  if (!hadTabIndex) focusTarget.setAttribute("tabindex", "-1");
  focusTarget.focus({ preventScroll: true });
  if (!hadTabIndex) {
    focusTarget.addEventListener("blur", () => focusTarget.removeAttribute("tabindex"), { once: true });
  }
}

function revealCatalogCards(cards) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  cards.forEach((card, index) => {
    if (index === 0) return;
    card.style.setProperty("--reveal-index", String(Math.min(index - 1, 5)));
    card.classList.remove("is-catalog-revealing");
    void card.offsetWidth;
    card.classList.add("is-catalog-revealing");
    card.addEventListener("animationend", () => {
      card.classList.remove("is-catalog-revealing");
      card.style.removeProperty("--reveal-index");
    }, { once: true });
  });
}

function applyServiceFilters(announceResults = false) {
  const value = view.querySelector("[data-service-filter].is-active")?.getAttribute("data-service-filter") || "all";
  const query = view.querySelector("[data-service-search]")?.value || "";
  const matches = [];
  view.querySelectorAll("[data-service-grid] .service-card").forEach((card, index) => {
    const matchesQuery = matchesSearch(card.getAttribute("data-search") || card.textContent, query);
    const isMatch = matchesQuery && serviceFilterMatches(value, services[index]);
    card.hidden = !isMatch;
    if (isMatch) matches.push(card);
  });
  const more = view.querySelector('[data-catalog-more="services"]');
  const isDefaultView = value === "all" && !query.trim();
  const limit = catalogLimit("services");
  if (isDefaultView && more?.dataset.expanded !== "true") {
    matches.slice(limit).forEach((card) => { card.hidden = true; });
  }
  updateCatalogMore(more, matches.length, limit, isDefaultView, "услуги");
  const empty = view.querySelector("[data-service-empty]");
  if (empty) empty.hidden = matches.length > 0;
  if (announceResults) announceResultCount(matches.length);
}

function handleServiceFilter(value, trigger) {
  setPressedGroup("[data-service-filter]", trigger);
  const more = view.querySelector('[data-catalog-more="services"]');
  if (more) delete more.dataset.expanded;
  applyServiceFilters(true);
}

function applyGuideFilters(announceResults = false) {
  const value = view.querySelector("[data-guide-filter].is-active")?.getAttribute("data-guide-filter") || "Все";
  const query = view.querySelector("[data-guide-search]")?.value || "";
  const matches = [];
  view.querySelectorAll("[data-guide-grid] .article-card").forEach((card) => {
    const matchesCategory = value === "Все" || card.textContent.includes(value);
    const matchesQuery = matchesSearch(card.textContent, query);
    const isMatch = matchesCategory && matchesQuery;
    card.hidden = !isMatch;
    if (isMatch) matches.push(card);
  });
  const more = view.querySelector('[data-catalog-more="guides"]');
  const isDefaultView = value === "Все" && !query.trim();
  const limit = catalogLimit("guides");
  if (isDefaultView && more?.dataset.expanded !== "true") {
    matches.slice(limit).forEach((card) => { card.hidden = true; });
  }
  updateCatalogMore(more, matches.length, limit, isDefaultView, "материалы");
  const empty = view.querySelector("[data-guide-empty]");
  if (empty) empty.hidden = matches.length > 0;
  if (announceResults) announceResultCount(matches.length);
}

function handleGuideFilter(value, trigger) {
  setPressedGroup("[data-guide-filter]", trigger);
  const more = view.querySelector('[data-catalog-more="guides"]');
  if (more) delete more.dataset.expanded;
  applyGuideFilters(true);
}

function handleOrderFilter(value, trigger) {
  setPressedGroup("[data-order-filter]", trigger);
  let visible = 0;
  document.querySelectorAll("[data-order-status]").forEach((card) => {
    const status = card.getAttribute("data-order-status");
    card.hidden = value === "done" ? status !== "done" : value === "active" ? status === "done" : false;
    if (!card.hidden) visible += 1;
  });
  announceResultCount(visible);
}

function applyAdminOrderFilters(announceResults = false) {
  const value = view.querySelector("[data-admin-order-filter].is-active")?.getAttribute("data-admin-order-filter") || "all";
  const query = view.querySelector("[data-admin-order-search]")?.value || "";
  let visible = 0;
  view.querySelectorAll("[data-admin-status]").forEach((row) => {
    const matchesStatus = value === "all" || row.getAttribute("data-admin-status") === value;
    const matchesQuery = matchesSearch(row.getAttribute("data-admin-search") || row.textContent, query);
    row.hidden = !matchesStatus || !matchesQuery;
    if (!row.hidden) visible += 1;
  });
  if (announceResults) announceResultCount(visible);
}

function handleAdminOrderFilter(value, trigger) {
  setPressedGroup("[data-admin-order-filter]", trigger);
  applyAdminOrderFilters(true);
}

function applyContentFilters(announceResults = false) {
  const value = view.querySelector("[data-content-filter].is-active")?.getAttribute("data-content-filter") || "all";
  const query = view.querySelector("[data-content-search]")?.value || "";
  let visible = 0;
  view.querySelectorAll("[data-content-status]").forEach((item) => {
    const matchesStatus = value === "all" || item.getAttribute("data-content-status") === value;
    const matchesQuery = matchesSearch(item.textContent, query);
    item.hidden = !matchesStatus || !matchesQuery;
    if (!item.hidden) visible += 1;
  });
  if (announceResults) announceResultCount(visible);
}

function handleReviewFilter(value, trigger) {
  setPressedGroup("[data-review-filter]", trigger);
  let visible = 0;
  document.querySelectorAll("[data-review-work]").forEach((card) => {
    card.hidden = value !== "all" && !card.getAttribute("data-review-work").toLocaleLowerCase("ru").includes(value.toLocaleLowerCase("ru"));
    if (!card.hidden) visible += 1;
  });
  announceResultCount(visible);
}

function animateAccordion(details) {
  const summary = details.querySelector(":scope > summary");
  if (!summary) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    details.open = !details.open;
    return;
  }

  details._salonAccordionAnimation?.finish();
  const opening = !details.open;
  const startHeight = details.getBoundingClientRect().height;
  if (opening) details.open = true;
  const endHeight = opening
    ? details.scrollHeight
    : summary.getBoundingClientRect().height + 1;

  details.style.height = `${startHeight}px`;
  details.style.overflow = "clip";
  const animation = details.animate(
    [{ height: `${startHeight}px` }, { height: `${endHeight}px` }],
    { duration: 260, easing: "cubic-bezier(.22,.8,.22,1)" }
  );
  details._salonAccordionAnimation = animation;
  animation.onfinish = () => {
    if (!opening) details.open = false;
    details.style.removeProperty("height");
    details.style.removeProperty("overflow");
    details._salonAccordionAnimation = null;
  };
  animation.oncancel = () => {
    details.style.removeProperty("height");
    details.style.removeProperty("overflow");
    details._salonAccordionAnimation = null;
  };
}

function updatePlusPeriod(period) {
  const value = period === "month" ? "month" : "semester";
  const days = value === "month" ? "30 дней" : "150 дней";
  const periodName = value === "month" ? "30 дней" : "семестр";
  view.querySelectorAll("[data-plus-period]").forEach((button) => {
    const isCurrent = button.getAttribute("data-plus-period") === value;
    button.classList.toggle("is-current", isCurrent);
    button.setAttribute("aria-pressed", String(isCurrent));
  });
  view.querySelectorAll("[data-plus-price-display]").forEach((item) => {
    item.textContent = item.getAttribute(`data-plus-price-${value}`) || item.textContent;
  });
  view.querySelectorAll("[data-plus-period-display]").forEach((item) => {
    item.textContent = item.getAttribute(`data-plus-period-${value}`) || days;
  });
  view.querySelectorAll("[data-plus-select]").forEach((button) => {
    const card = button.closest(".plus-plan-card");
    const price = card?.querySelector("[data-plus-price-display]")?.textContent.trim() || "";
    const base = button.getAttribute("data-plus-plan-base") || "Салон+";
    button.setAttribute("data-plus-plan", `${base} · ${periodName}`);
    button.setAttribute("data-plus-price", price);
    button.setAttribute("data-plus-days", days);
  });
}

function depositRateFor(amount) {
  if (amount >= 60000) return 15;
  if (amount >= 45000) return 12;
  if (amount >= 30000) return 10;
  return 8;
}

function updateDepositCalculator(rawAmount) {
  const amount = Math.min(60000, Math.max(20000, Number(rawAmount) || 30000));
  const rate = depositRateFor(amount);
  const bonus = Math.floor(amount * rate / 100);
  const range = view.querySelector("[data-deposit-range]");
  if (range) {
    range.value = String(amount);
    range.setAttribute("aria-valuetext", `${formatMoney(amount)}, начисление ${rate} процентов бонусами`);
    range.style.setProperty("--deposit-position", `${((amount - 20000) / 40000) * 100}%`);
  }
  const amountLabel = view.querySelector("[data-deposit-amount]");
  const moneyLabel = view.querySelector("[data-deposit-money]");
  const rateLabel = view.querySelector("[data-deposit-rate]");
  const bonusLabel = view.querySelector("[data-deposit-bonus]");
  if (amountLabel) amountLabel.textContent = formatMoney(amount);
  if (moneyLabel) moneyLabel.textContent = formatMoney(amount);
  if (rateLabel) rateLabel.textContent = `${rate} %`;
  if (bonusLabel) bonusLabel.textContent = `${bonus.toLocaleString("ru-RU")} бонусов`;
  view.querySelectorAll("[data-deposit-tier]").forEach((tier) => {
    const floor = Number(tier.getAttribute("data-deposit-tier"));
    const nextFloor = floor === 20000 ? 30000 : floor === 30000 ? 45000 : floor === 45000 ? 60000 : Infinity;
    tier.classList.toggle("is-current", amount >= floor && amount < nextFloor);
  });
}

function collectTableRecord(trigger) {
  const row = trigger.closest("tr");
  const table = row?.closest("table");
  if (!row || !table) return [];
  const headers = [...table.querySelectorAll("thead th")].map((cell) => cell.textContent.trim());
  return [...row.children].flatMap((cell, index) => {
    const value = cell.textContent.trim();
    const label = headers[index] || "";
    return value && label ? [[label, value]] : [];
  });
}

function openAdminRecord(id, trigger) {
  const facts = collectTableRecord(trigger);
  actionDialogContent(`
    <header class="overlay__header">
      <div><span class="eyebrow">Демонстрационная запись</span><h2 id="actionDialogTitle">${escapeHTML(id)}</h2></div>
      <button class="icon-button icon-button--close" type="button" data-close-dialog aria-label="Закрыть">×</button>
    </header>
    <div class="admin-order-sheet">
      <p>Карточка собрана из выбранной строки. Внешние данные и отправка действий в концепте отключены.</p>
      <dl>${facts.map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join("")}</dl>
      <div><button class="button button--secondary" type="button" data-close-dialog>Вернуться к списку</button></div>
    </div>
  `, trigger);
}

function openAdminPanel(panel, trigger) {
  const clientName = view.querySelector("[data-client-profile-name]")?.textContent.trim() || "Клиент";
  const panels = {
    team: {
      eyebrow: "Загрузка редакторов",
      title: "Команда на неделю",
      body: `<div class="sheet-action-list">
        <label><input type="checkbox" checked><span>Редакторы · 4 человека</span></label>
        <label><input type="checkbox" checked><span>Методисты · 2 человека</span></label>
        <label><input type="checkbox" checked><span>Консультации · 1 специалист</span></label>
      </div><p>Выбор меняет состав просмотра только в этой демонстрационной сессии.</p>`
    },
    "order-filters": {
      eyebrow: "Дела",
      title: "Дополнительные фильтры",
      body: `<div class="admin-order-sheet">
        <label class="field"><span>Ответственный</span><select><option>Все редакторы</option><option>Не назначен</option><option>Дежурный редактор</option></select></label>
        <label class="field"><span>Ближайший срок</span><select><option>Любой</option><option>Сегодня</option><option>Следующие три дня</option></select></label>
        <button class="button button--secondary" type="button" data-close-dialog>Готово</button>
      </div>`
    },
    "order-columns": {
      eyebrow: "Таблица дел",
      title: "Видимые столбцы",
      body: `<div class="sheet-action-list">
        <label><input type="checkbox" checked data-admin-column="2"><span>Клиент</span></label>
        <label><input type="checkbox" checked data-admin-column="3"><span>Задача</span></label>
        <label><input type="checkbox" checked data-admin-column="5"><span>Ближайший срок</span></label>
        <label><input type="checkbox" checked data-admin-column="6"><span>Сумма</span></label>
      </div><p>Состав таблицы меняется сразу; обязательные столбцы остаются на месте.</p>`
    },
    "client-actions": {
      eyebrow: "Клиент",
      title: clientName,
      body: `<div class="sheet-action-list">
        <a href="#/order" data-route="order">Открыть активное дело</a>
        <button type="button" data-open-support>Задать вопрос приёмной</button>
        <button type="button" data-close-dialog>Закрыть меню</button>
      </div>`
    },
    "client-consents": {
      eyebrow: "История согласий",
      title: clientName,
      body: `<ol class="admin-extra__timeline">
        <li><i></i><div><strong>Заявка и договор</strong><p>Подтверждено перед созданием демонстрационного дела.</p><small>12 июля 2026 · версия 2.1</small></div></li>
        <li><i></i><div><strong>Программа лояльности</strong><p>Подтверждено отдельно от заявки.</p><small>12 июля 2026 · версия 1.3</small></div></li>
        <li><i></i><div><strong>Маркетинговые сообщения</strong><p>Согласие не выдавалось.</p><small>Внешняя отправка отключена</small></div></li>
      </ol>`
    },
    "review-rules": {
      eyebrow: "Модерация",
      title: "Правила публикации отзыва",
      body: `<ol class="number-list"><li><span>01</span><p>Убрать персональные сведения и данные учебного заведения.</p></li><li><span>02</span><p>Отделить проверяемый результат от личного впечатления.</p></li><li><span>03</span><p>Получить самостоятельное согласие на публикацию.</p></li><li><span>04</span><p>Сохранить основание решения в журнале.</p></li></ol>`
    },
    "qa-filters": {
      eyebrow: "Приёмная",
      title: "Фильтры очереди",
      body: `<div class="admin-order-sheet"><label class="field"><span>Тип ответа</span><select><option>Все вопросы</option><option>Публичные</option><option>Закрытые</option></select></label><label class="field"><span>Статус</span><select><option>Любой</option><option>Без ответа</option><option>Готов к публикации</option></select></label><button class="button button--secondary" type="button" data-close-dialog>Готово</button></div>`
    },
    "notification-channels": {
      eyebrow: "Служебные уведомления",
      title: "Каналы связи",
      body: `<div class="admin-extra__settings-list"><div><span><strong>Электронная почта</strong><small>Провайдер не подключён</small></span><span class="tag">Отключена</span></div><div><span><strong>Telegram</strong><small>Бот не подключён</small></span><span class="tag">Отключён</span></div><div><span><strong>Сообщения в кабинете</strong><small>Доступны только внутри демонстрации</small></span><span class="tag tag--green">Локально</span></div></div>`
    }
  };
  const config = panels[panel];
  if (!config) return;
  actionDialogContent(`
    <header class="overlay__header">
      <div><span class="eyebrow">${config.eyebrow}</span><h2 id="actionDialogTitle">${config.title}</h2></div>
      <button class="icon-button icon-button--close" type="button" data-close-dialog aria-label="Закрыть">×</button>
    </header>
    ${config.body}
  `, trigger);
}

function applyAdminDemoFilter(trigger) {
  const [scope, value] = (trigger.getAttribute("data-admin-demo-filter") || "").split("-");
  if (!scope || !value) return;
  setPressedGroup(`[data-admin-demo-filter^="${scope}-"]`, trigger);
  let visible = 0;
  view.querySelectorAll(`[data-admin-demo-row="${scope}"]`).forEach((row) => {
    const tags = (row.getAttribute("data-admin-demo-tags") || "").split(/\s+/);
    row.hidden = value !== "all" && !tags.includes(value);
    if (!row.hidden) visible += 1;
  });
  announceResultCount(visible);
}

function selectAdminQuestion(trigger) {
  const id = trigger.getAttribute("data-admin-question") || "";
  const title = trigger.querySelector("strong")?.textContent.trim() || "Вопрос";
  const meta = trigger.querySelector("small")?.textContent.trim() || "";
  const tag = trigger.querySelector(".tag");
  setPressedGroup(".admin-extra__queue-list [data-admin-question]", trigger, "is-current");
  const card = view.querySelector(".admin-extra__qa-card");
  if (!card) return;
  const write = (selector, value) => {
    const node = card.querySelector(selector);
    if (node) node.textContent = value;
  };
  const questions = {
    "DEMO-Q-184": "Можно ли сначала заказать письменный разбор замечаний, а дальнейшую редактуру согласовать после него?",
    "DEMO-Q-183": "Какие сведения об электронном источнике нужны, чтобы проверить библиографическую запись?",
    "DEMO-Q-182": "Как передать повторную версию после исправлений по нормоконтролю?",
    "DEMO-Q-181": "В каком виде редактор возвращает список замечаний и приоритетов?"
  };
  write("header h2", title);
  write("header div span", `${id} · ${meta.split("·")[0].trim().toLocaleLowerCase("ru")}`);
  write(".admin-extra__question p", questions[id] || "Содержание выбрано из демонстрационной очереди.");
  const cardTag = card.querySelector("header > .tag");
  if (cardTag && tag) {
    cardTag.textContent = tag.textContent;
    cardTag.className = tag.className;
  }
  announce(`Открыт вопрос ${id}`);
}

function openContentEditor(slug, trigger) {
  const article = trigger.closest("[data-content-slug]");
  const title = article?.querySelector("h2")?.textContent.trim() || "Новая публикация";
  const summary = article?.querySelector("p")?.textContent.trim() || "";
  actionDialogContent(`
    <header class="overlay__header">
      <div><span class="eyebrow">Редактор публикации</span><h2 id="actionDialogTitle">${escapeHTML(title)}</h2></div>
      <button class="icon-button icon-button--close" type="button" data-close-dialog aria-label="Закрыть">×</button>
    </header>
    <div class="admin-order-sheet">
      <label class="field"><span>Заголовок</span><input type="text" data-content-draft-title value="${escapeHTML(title)}"></label>
      <label class="field"><span>Краткое описание</span><textarea rows="5" data-content-draft-summary>${escapeHTML(summary)}</textarea></label>
      <p>Изменения сохраняются только в локальном черновике концепта и не публикуются.</p>
      <div><button class="button button--primary" type="button" data-content-save="${escapeHTML(slug)}">Сохранить локальный черновик</button><button class="button button--text" type="button" data-close-dialog>Отмена</button></div>
    </div>
  `, trigger);
}

function openValidationExample(trigger) {
  actionDialogContent(`
    <header class="overlay__header"><div><span class="eyebrow">Проверка полей</span><h2 id="actionDialogTitle">Исправьте два значения</h2></div><button class="icon-button icon-button--close" type="button" data-close-dialog aria-label="Закрыть">×</button></header>
    <div class="admin-order-sheet">
      <label class="field"><span>Срок</span><input type="date" aria-invalid="true" data-validation-first></label>
      <label class="field"><span>Контакт для ответа</span><input type="text" aria-invalid="true" placeholder="@username или почта"></label>
      <p>Фокус установлен на первом поле с ошибкой; остальные ответы не изменены.</p>
    </div>
  `, trigger);
  requestAnimationFrame(() => actionDialog?.querySelector("[data-validation-first]")?.focus());
}

function openVersionComparison(trigger) {
  actionDialogContent(`
    <header class="overlay__header"><div><span class="eyebrow">Сравнение версий</span><h2 id="actionDialogTitle">Изменения в сроке</h2></div><button class="icon-button icon-button--close" type="button" data-close-dialog aria-label="Закрыть">×</button></header>
    <div class="comparison-table">
      <div class="comparison-table__row comparison-table__head"><span>Поле</span><span>Ваша версия · 14:24</span><span>Новая версия · 14:31</span></div>
      <div class="comparison-table__row"><strong>Срок первого результата</strong><span>29 июля</span><span>30 июля</span></div>
      <div class="comparison-table__row"><strong>Комментарий</strong><span>После просмотра файлов</span><span>Нужна методичка кафедры</span></div>
    </div>
    <p>Концепт показывает различия, но не заменяет данные автоматически.</p>
  `, trigger);
}

function openProfileSettings(trigger) {
  actionDialogContent(`
    <header class="overlay__header"><div><span class="eyebrow">Личный кабинет</span><h2 id="actionDialogTitle">Настройки профиля</h2></div><button class="icon-button icon-button--close" type="button" data-close-dialog aria-label="Закрыть">×</button></header>
    <div class="admin-order-sheet">
      <fieldset><legend>Оформление</legend><div class="theme-choice" role="group" aria-label="Выбор темы"><button type="button" data-set-theme="light">Светлая</button><button type="button" data-set-theme="dark">Тёмная</button></div></fieldset>
      <label class="consent-check"><input type="checkbox" checked><span>Показывать напоминания внутри кабинета</span></label>
      <p>Внешние уведомления в концепте не подключены.</p>
    </div>
  `, trigger);
}

function openBroadcastPreview(trigger) {
  const panel = trigger.closest(".admin-panel");
  const segment = panel?.querySelector("select")?.value || "Выбранный сегмент";
  const subject = panel?.querySelector('input[type="text"], input:not([type])')?.value.trim() || "Без темы";
  const message = panel?.querySelector("textarea")?.value.trim() || "Текст пока не добавлен.";
  actionDialogContent(`
    <header class="overlay__header"><div><span class="eyebrow">Предпросмотр без отправки</span><h2 id="actionDialogTitle">${escapeHTML(subject)}</h2></div><button class="icon-button icon-button--close" type="button" data-close-dialog aria-label="Закрыть">×</button></header>
    <article class="message-preview">
      <span class="tag">${escapeHTML(segment)}</span>
      <p>${escapeHTML(message)}</p>
      <footer><span>Академический Салон</span><small>Системная ссылка на настройки подписки будет добавлена при подключении отправки.</small></footer>
    </article>
  `, trigger);
}

document.addEventListener("click", async (event) => {
  const target = event.target;
  const accordionSummary = target.closest(".accordion-list details > summary");
  if (accordionSummary) {
    event.preventDefault();
    animateAccordion(accordionSummary.parentElement);
    return;
  }

  const localAnchor = target.closest('a[href^="#"]:not([href^="#/"])');
  if (localAnchor) {
    const id = localAnchor.getAttribute("href")?.slice(1);
    const destination = id ? document.getElementById(id) : null;
    if (destination) {
      event.preventDefault();
      focusLocalSection(destination, id);
    }
    return;
  }

  const sourceScroll = target.closest("[data-source-scroll]");
  if (sourceScroll) {
    const id = sourceScroll.getAttribute("data-source-scroll");
    const destination = view.querySelector(`#${CSS.escape(id)}`);
    if (destination) focusLocalSection(destination, id);
    return;
  }

  const routeTrigger = target.closest("[data-route]");
  if (routeTrigger && (routeTrigger.tagName !== "A" || routeTrigger.getAttribute("href")?.startsWith("#/"))) {
    event.preventDefault();
    const slug = routeTrigger.getAttribute("data-route");
    pendingSourceSection = routeTrigger.getAttribute("data-route-section") || "";
    closeAllDialogs({ preserveHistory: true });
    navigate(slug);
    return;
  }

  if (target.closest("[data-go-back]")) {
    history.length > 1 ? history.back() : navigate("home");
    return;
  }

  if (target.closest("[data-open-menu]")) {
    openDialog(menuDialog, target.closest("[data-open-menu]"));
    return;
  }

  if (target.closest("[data-open-search]")) {
    openSearch(target.closest("[data-open-search]"));
    return;
  }

  if (target.closest("[data-open-support]")) {
    const supportTrigger = actionDialog?.open
      ? dialogTriggers.get(actionDialog)
      : target.closest("[data-open-support]");
    if (actionDialog?.open) {
      dialogTriggers.delete(actionDialog);
      closeDialog(actionDialog, { preserveHistory: true });
    }
    openDialog(supportDialog, supportTrigger);
    requestAnimationFrame(() => supportDialog?.querySelector("textarea")?.focus());
    return;
  }

  if (target.closest("[data-close-dialog]")) {
    dismissDialog(target.closest("dialog"));
    return;
  }

  const dialogRoute = target.closest("[data-dialog-route]");
  if (dialogRoute) {
    closeAllDialogs({ preserveHistory: true });
    navigate(dialogRoute.getAttribute("data-dialog-route"));
    return;
  }

  if (target.closest("[data-toggle-theme]")) {
    toggleTheme();
    return;
  }

  const selectedTheme = target.closest("[data-set-theme]");
  if (selectedTheme) {
    const value = selectedTheme.getAttribute("data-set-theme");
    setTheme(value);
    showToast(value === "dark" ? "Включена тёмная тема" : "Включена светлая тема");
    return;
  }

  if (target.closest("[data-retry-source]")) {
    void hydrateSourceDocuments(parseRoute(), { announceFailure: true });
    return;
  }

  const profileSettings = target.closest("[data-profile-settings]");
  if (profileSettings) {
    openProfileSettings(profileSettings);
    return;
  }

  const adminPanel = target.closest("[data-admin-panel]");
  if (adminPanel) {
    openAdminPanel(adminPanel.getAttribute("data-admin-panel"), adminPanel);
    return;
  }

  const adminDemoFilter = target.closest("[data-admin-demo-filter]");
  if (adminDemoFilter) {
    applyAdminDemoFilter(adminDemoFilter);
    return;
  }

  const adminRecord = target.closest("[data-admin-record]");
  if (adminRecord) {
    openAdminRecord(adminRecord.getAttribute("data-admin-record"), adminRecord);
    return;
  }

  const adminQuestion = target.closest("[data-admin-question]");
  if (adminQuestion) {
    selectAdminQuestion(adminQuestion);
    return;
  }

  const contentPreview = target.closest("[data-content-preview]");
  if (contentPreview) {
    navigate(contentPreview.getAttribute("data-content-preview"));
    return;
  }

  const contentEdit = target.closest("[data-content-edit]");
  if (contentEdit) {
    openContentEditor(contentEdit.getAttribute("data-content-edit"), contentEdit);
    return;
  }

  const contentSave = target.closest("[data-content-save]");
  if (contentSave) {
    const slug = contentSave.getAttribute("data-content-save");
    const title = actionDialog?.querySelector("[data-content-draft-title]")?.value.trim();
    const summary = actionDialog?.querySelector("[data-content-draft-summary]")?.value.trim();
    if (!title || !summary) {
      const missing = !title
        ? actionDialog?.querySelector("[data-content-draft-title]")
        : actionDialog?.querySelector("[data-content-draft-summary]");
      missing?.setAttribute("aria-invalid", "true");
      missing?.focus();
      showToast("Заполните заголовок и краткое описание");
      return;
    }
    state.contentDrafts = { ...(state.contentDrafts || {}), [slug]: { title, summary } };
    saveState();
    closeDialog(actionDialog);
    queueRenderFocus((root) => root.querySelector(`[data-content-edit="${CSS.escape(slug)}"]`));
    render(true);
    showToast("Локальный черновик сохранён");
    return;
  }

  const coverZoom = target.closest("[data-cover-zoom]");
  if (coverZoom) {
    const delta = Number(coverZoom.getAttribute("data-cover-zoom")) || 0;
    state.coverZoom = Math.min(88, Math.max(56, (Number(state.coverZoom) || 72) + delta));
    saveState();
    const canvas = view.querySelector("[data-cover-canvas]");
    const value = view.querySelector("[data-cover-zoom-value]");
    if (canvas) canvas.style.setProperty("--cover-zoom", String(state.coverZoom / 72));
    if (value) value.textContent = `${state.coverZoom} %`;
    announce(`Масштаб предпросмотра: ${state.coverZoom} процентов`, 0);
    return;
  }

  const stateValidation = target.closest("[data-state-validation]");
  if (stateValidation) {
    openValidationExample(stateValidation);
    return;
  }

  const stateCompare = target.closest("[data-state-compare]");
  if (stateCompare) {
    openVersionComparison(stateCompare);
    return;
  }

  const broadcastPreview = target.closest("[data-broadcast-preview]");
  if (broadcastPreview) {
    openBroadcastPreview(broadcastPreview);
    return;
  }

  const copyCaseLink = target.closest("[data-copy-case-link]");
  if (copyCaseLink) {
    const caseUrl = `${location.origin}${location.pathname}${location.search}#/order`;
    try {
      await navigator.clipboard.writeText(caseUrl);
      showToast("Ссылка на дело скопирована");
    } catch {
      showToast(`Ссылка на дело: ${caseUrl}`);
    }
    return;
  }

  const toastTrigger = target.closest("[data-toast]");
  if (toastTrigger) {
    if (toastTrigger.matches(".filter-tabs button")) {
      setPressedGroup(".filter-tabs button", toastTrigger);
    }
    showToast(toastTrigger.getAttribute("data-toast"));
    return;
  }

  const searchQuery = target.closest("[data-search-query]");
  if (searchQuery && searchInput) {
    searchInput.value = searchQuery.getAttribute("data-search-query");
    renderSearch(searchInput.value);
    searchInput.focus();
    return;
  }

  const searchOpen = target.closest("[data-search-open]");
  if (searchOpen) {
    closeDialog(searchDialog, { preserveHistory: true });
    navigate(searchOpen.getAttribute("data-search-open"));
    return;
  }

  const situation = target.closest("[data-start-situation]");
  if (situation) {
    startWizard({ situation: situation.getAttribute("data-start-situation"), step: 1 });
    return;
  }

  const service = target.closest("[data-start-service]");
  if (service) {
    const item = services.find((candidate) => candidate.slug === service.getAttribute("data-start-service"));
    startWizard({ workType: item?.title || "", step: item ? 2 : 1 });
    return;
  }

  const addService = target.closest("[data-add-service]");
  if (addService) {
    const item = services.find((candidate) => candidate.slug === addService.getAttribute("data-add-service"));
    startWizard({ workType: item?.title || "", step: 2 });
    return;
  }

  const format = target.closest("[data-start-format]");
  if (format) {
    startWizard({ result: format.getAttribute("data-start-format"), step: 0 });
    return;
  }

  const priced = target.closest("[data-start-priced]");
  if (priced) {
    startWizard({ result: priced.getAttribute("data-start-priced"), step: 0 });
    return;
  }

  const choice = target.closest("[data-wizard-choice]");
  if (choice) {
    wizardChoice(choice.getAttribute("data-wizard-key"), choice.getAttribute("data-wizard-choice"));
    return;
  }

  if (target.closest("[data-wizard-next]") || target.closest("[data-task-next]")) {
    wizardNext();
    return;
  }

  if (target.closest("[data-wizard-back], [data-task-back]")) {
    wizardBack();
    return;
  }

  const jump = target.closest("[data-wizard-jump]");
  if (jump && !jump.disabled) {
    state.wizard.step = Number(jump.getAttribute("data-wizard-jump"));
    saveState();
    queueRenderFocus(".wizard-main h1", { reveal: "start" });
    render(true);
    return;
  }

  const removeFile = target.closest("[data-remove-file]");
  if (removeFile) {
    const name = removeFile.getAttribute("data-remove-file");
    state.wizard.files = state.wizard.files.filter((file) => file !== name);
    saveState();
    queueRenderFocus("[data-wizard-files]");
    render(true);
    return;
  }

  if (target.closest("[data-submit-demo-order]")) {
    submitDemoOrder();
    return;
  }

  const paymentTrigger = target.closest("[data-open-payment]");
  if (paymentTrigger) {
    openPaymentDialog(paymentTrigger);
    return;
  }

  if (target.closest("[data-demo-pay]")) {
    const agreement = actionDialog?.querySelector("[data-payment-agree]");
    if (!agreement?.checked) {
      agreement?.focus();
      showToast("Подтвердите сумму и назначение платежа");
      return;
    }
    closeDialog(actionDialog, { preserveHistory: true });
    navigate("oplaceno");
    return;
  }

  const paymentRefresh = target.closest("[data-refresh-payment]");
  if (paymentRefresh) {
    if (paymentRefresh.getAttribute("aria-busy") === "true") return;
    paymentRefresh.setAttribute("aria-busy", "true");
    paymentRefresh.setAttribute("aria-disabled", "true");
    paymentRefresh.textContent = "Проверяем статус…";
    announce("Проверяем демонстрационный статус платежа", 0);
    setTimeout(() => {
      state.paymentComplete = true;
      saveState();
      if (parseRoute() !== "oplaceno") return;
      queueRenderFocus(".system-card h1", { reveal: "center" });
      render(true);
      showToast("Показано состояние подтверждённого платежа");
    }, 650);
    return;
  }

  const systemRetry = target.closest("[data-system-retry]");
  if (systemRetry) {
    if (systemRetry.getAttribute("aria-busy") === "true") return;
    systemRetry.setAttribute("aria-busy", "true");
    systemRetry.setAttribute("aria-disabled", "true");
    systemRetry.textContent = "Проверяем соединение…";
    announce("Показана демонстрация проверки соединения", 0);
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    if (parseRoute() !== "50x" || !systemRetry.isConnected) return;
    systemRetry.removeAttribute("aria-busy");
    systemRetry.removeAttribute("aria-disabled");
    systemRetry.textContent = "Проверить соединение";
    showToast("В концепте запрос к серверу не выполняется");
    return;
  }

  const accountSection = target.closest("[data-account-section]");
  if (accountSection) {
    openAccountSection(accountSection.getAttribute("data-account-section"), accountSection);
    return;
  }

  const catalogMore = target.closest("[data-catalog-more]");
  if (catalogMore) {
    const kind = catalogMore.getAttribute("data-catalog-more");
    const grid = view.querySelector(kind === "services" ? "[data-service-grid]" : "[data-guide-grid]");
    const hiddenCards = [...(grid?.children || [])].filter((card) => card.hidden);
    const nextAction = hiddenCards[0]?.querySelector("a, button");
    catalogMore.dataset.expanded = "true";
    if (kind === "services") applyServiceFilters();
    else applyGuideFilters();
    requestAnimationFrame(() => {
      const revealedCards = hiddenCards.filter((card) => !card.hidden);
      revealCatalogCards(revealedCards);
      nextAction?.focus({ preventScroll: true });
      announce(`Показано дополнительно: ${revealedCards.length}`, 0);
    });
    return;
  }

  const serviceFilter = target.closest("[data-service-filter]");
  if (serviceFilter) {
    handleServiceFilter(serviceFilter.getAttribute("data-service-filter"), serviceFilter);
    return;
  }

  const guideFilter = target.closest("[data-guide-filter]");
  if (guideFilter) {
    handleGuideFilter(guideFilter.getAttribute("data-guide-filter"), guideFilter);
    return;
  }

  if (target.closest("[data-clear-guide-search]")) {
    const input = view.querySelector("[data-guide-search]");
    const allFilter = view.querySelector("[data-guide-filter]");
    const more = view.querySelector('[data-catalog-more="guides"]');
    if (input) input.value = "";
    if (allFilter) setPressedGroup("[data-guide-filter]", allFilter);
    if (more) delete more.dataset.expanded;
    applyGuideFilters(true);
    input?.focus();
    return;
  }

  const orderFilter = target.closest("[data-order-filter]");
  if (orderFilter) {
    handleOrderFilter(orderFilter.getAttribute("data-order-filter"), orderFilter);
    return;
  }

  const adminOrderFilter = target.closest("[data-admin-order-filter]");
  if (adminOrderFilter) {
    handleAdminOrderFilter(adminOrderFilter.getAttribute("data-admin-order-filter"), adminOrderFilter);
    return;
  }

  const clientTrigger = target.closest("[data-client]");
  if (clientTrigger) {
    const name = clientTrigger.getAttribute("data-client");
    const profile = demoClientProfiles[name];
    if (!profile) return;
    setPressedGroup("[data-client]", clientTrigger, "is-current");
    const write = (selector, value) => {
      const node = view.querySelector(selector);
      if (node) node.textContent = value;
    };
    write("[data-client-profile-avatar]", profile.avatar);
    write("[data-client-profile-name]", name);
    write("[data-client-profile-since]", profile.since);
    write("[data-client-profile-telegram]", profile.telegram);
    write("[data-client-profile-phone]", profile.phone);
    write("[data-client-profile-reply]", profile.reply);
    write("[data-client-profile-case]", profile.case);
    write("[data-client-profile-deadline]", profile.deadline);
    const status = view.querySelector("[data-client-profile-status]");
    if (status) {
      status.textContent = profile.status;
      status.className = `tag tag--${profile.statusKey}`;
    }
    const note = view.querySelector("[data-client-profile-note]");
    if (note) note.value = profile.note;
    showToast(`Карточка «${name}» открыта`);
    return;
  }

  const contentFilter = target.closest("[data-content-filter]");
  if (contentFilter) {
    setPressedGroup("[data-content-filter]", contentFilter);
    applyContentFilters(true);
    return;
  }

  const reviewFilter = target.closest("[data-review-filter]");
  if (reviewFilter) {
    handleReviewFilter(reviewFilter.getAttribute("data-review-filter"), reviewFilter);
    return;
  }

  const reviewProof = target.closest("[data-review-proof]");
  if (reviewProof) {
    const id = reviewProof.getAttribute("data-review-proof");
    const description = reviewProof.querySelector("img")?.alt || "Опубликованное сообщение клиента";
    actionDialogContent(`
      <header class="overlay__header"><div><span class="eyebrow">Подтверждение отзыва</span><h2 id="actionDialogTitle">Фрагмент переписки</h2></div><button class="icon-button icon-button--close" type="button" data-close-dialog aria-label="Закрыть">×</button></header>
      <div class="review-proof"><img src="${ASSET_URL(`img/reviews/review-${id}.webp`)}" alt="${escapeHTML(description)}"><p>Изображение показано полностью, без редакционного пересказа. Личный опыт клиента не обещает такой же результат другому человеку.</p></div>
    `, reviewProof);
    return;
  }

  if (target.closest("[data-run-text-check]")) {
    runTextCheck();
    return;
  }

  if (target.closest("[data-fill-text-example]")) {
    state.checkText = "В рамках данного исследования осуществляется рассмотрение особенностей учебной мотивации студентов. Следует отметить, что учебная мотивация является важным фактором, который оказывает существенное влияние на академические результаты студентов, а также на их отношение к образовательному процессу.";
    state.textCheck = null;
    saveState();
    queueRenderFocus("[data-check-text]", { reveal: true });
    render(true);
    return;
  }

  if (target.closest("[data-run-topic-audit]")) {
    runTopicAudit();
    return;
  }

  if (target.closest("[data-run-source-check]")) {
    runSourceCheck();
    return;
  }

  if (target.closest("[data-fill-source-example]")) {
    state.sourceText = "Иванов И. И. Академическая мотивация студентов // Вопросы психологии. 2022. № 4. С. 18–29.\nСидорова А. П. Методы учебного исследования. Москва: Наука.\nhttps://example.org/research/student-motivation";
    state.sourceResult = null;
    saveState();
    queueRenderFocus("[data-source-text]", { reveal: true });
    render(true);
    return;
  }

  if (target.closest("[data-generic-tool-submit]")) {
    const text = view.querySelector("[data-generic-tool-text]")?.value.trim();
    if (!text) {
      showToast("Опишите задачу");
    } else {
      showToast("Описание перенесено в заявку");
      startWizard({ comment: text, step: 0 });
    }
    return;
  }

  if (target.closest("[data-send-support]")) {
    const messageField = supportDialog?.querySelector("[data-support-message]");
    const contactField = supportDialog?.querySelector("[data-support-contact]");
    const message = messageField?.value.trim();
    const contact = contactField?.value.trim();
    if (!message || !contact) {
      messageField?.setAttribute("aria-invalid", String(!message));
      contactField?.setAttribute("aria-invalid", String(!contact));
      (!message ? messageField : contactField)?.focus();
      showToast("Заполните вопрос и контакт для ответа");
    } else {
      messageField?.removeAttribute("aria-invalid");
      contactField?.removeAttribute("aria-invalid");
      state.supportDraft = message;
      saveState();
      closeDialog(supportDialog);
      showToast("Вопрос сохранён в этой вкладке");
    }
    return;
  }

  if (target.closest("[data-page-support-send]")) {
    const messageField = view.querySelector("[data-page-support-message]");
    const contactField = view.querySelector("[data-page-support-contact]");
    const consentField = view.querySelector("[data-page-support-consent]");
    const message = messageField?.value.trim();
    const contact = contactField?.value.trim();
    const consent = consentField?.checked;
    if (!message || !contact || !consent) {
      messageField?.setAttribute("aria-invalid", String(!message));
      contactField?.setAttribute("aria-invalid", String(!contact));
      consentField?.setAttribute("aria-invalid", String(!consent));
      (!message ? messageField : !contact ? contactField : consentField)?.focus();
      showToast("Заполните вопрос, контакт и подтвердите согласие");
    } else {
      messageField?.removeAttribute("aria-invalid");
      contactField?.removeAttribute("aria-invalid");
      consentField?.removeAttribute("aria-invalid");
      state.supportDraft = message;
      saveState();
      showToast("Вопрос сохранён в этой вкладке");
    }
    return;
  }

  const giftAmount = target.closest("[data-gift-amount]");
  if (giftAmount) {
    const value = Number(giftAmount.getAttribute("data-gift-amount"));
    state.giftAmount = value;
    saveState();
    queueRenderFocus((root) => root.querySelector(`[data-gift-amount="${value}"]`));
    render(true);
    return;
  }

  if (target.closest("[data-prepare-gift]")) {
    showToast(`Макет сертификата на ${formatMoney(state.giftAmount)} обновлён`);
    return;
  }

  if (target.closest("[data-copy-invite]")) {
    showToast("Персональная ссылка появится в Telegram-боте после входа");
    return;
  }

  const plusPeriod = target.closest("[data-plus-period]");
  if (plusPeriod) {
    updatePlusPeriod(plusPeriod.getAttribute("data-plus-period"));
    return;
  }

  const depositPreview = target.closest("[data-deposit-preview]");
  if (depositPreview) {
    const amount = Number(view.querySelector("[data-deposit-range]")?.value || 30000);
    const rate = depositRateFor(amount);
    const bonus = Math.floor(amount * rate / 100);
    actionDialogContent(`
      <header class="overlay__header"><div><span class="eyebrow">Депозит мастерской</span><h2 id="actionDialogTitle">Проверка пополнения</h2></div><button class="icon-button icon-button--close" type="button" data-close-dialog aria-label="Закрыть">×</button></header>
      <div class="payment-sheet">
        <div class="payment-sheet__summary"><span><small>Аванс</small><strong>${formatMoney(amount)}</strong></span><span><small>Начисление</small><strong>${rate} %</strong></span><span><small>Отдельно</small><strong>${bonus.toLocaleString("ru-RU")} бонусов</strong></span></div>
        <p>Перед реальным платежом будут показаны получатель, назначение аванса, способ оплаты, платёжный документ и действующая редакция правил.</p>
        <div class="payment-sheet__note"><strong>Два разных баланса</strong><span>Денежный остаток оплачивает этапы. Бонусы дают скидку на будущий заказ в пределах правил.</span></div>
        <a class="button button--secondary" href="#/loyalty" data-route="loyalty">Открыть правила</a>
        <button class="button button--primary" type="button" data-toast="Пополнение отключено в дизайн-концепте">Предпросмотр платежа</button>
      </div>
    `, depositPreview);
    return;
  }

  const plusTrigger = target.closest("[data-activate-plus]");
  if (plusTrigger) {
    const plan = plusTrigger.getAttribute("data-plus-plan") || "Салон+ · семестр";
    const price = plusTrigger.getAttribute("data-plus-price") || "999 ₽";
    const days = plusTrigger.getAttribute("data-plus-days") || "150 дней";
    actionDialogContent(`
      <header class="overlay__header"><div><span class="eyebrow">Салон+</span><h2 id="actionDialogTitle">${escapeHTML(plan)}</h2></div><button class="icon-button icon-button--close" type="button" data-close-dialog aria-label="Закрыть">×</button></header>
      <div class="payment-sheet"><div class="payment-sheet__summary"><span><small>Срок</small><strong>${escapeHTML(days)}</strong></span><span><small>Стоимость</small><strong>${escapeHTML(price)}</strong></span><span><small>Продление</small><strong>только вручную</strong></span></div><p>До оплаты клиент увидит состав привилегий, срок, цену и действующую редакцию правил.</p><a class="button button--secondary" href="#/loyalty" data-route="loyalty">Открыть правила</a><button class="button button--primary" type="button" data-toast="Оплата не подключена в концепте">Предпросмотр оплаты</button></div>
    `, plusTrigger);
    return;
  }

  const adminOrder = target.closest("[data-admin-order]");
  if (adminOrder) {
    openAdminOrder(adminOrder.getAttribute("data-admin-order"), adminOrder);
    return;
  }

  if (target.closest("[data-admin-save-action]")) {
    closeDialog(actionDialog);
    showToast("Решение сохранено в демонстрационном режиме");
    return;
  }

  const adminNewOrder = target.closest("[data-admin-new-order]");
  if (adminNewOrder) {
    openAdminOrder("НОВОЕ", adminNewOrder);
    return;
  }

  const adminQuick = target.closest("[data-admin-quick]");
  if (adminQuick) {
    actionDialogContent(`
      <header class="overlay__header"><div><span class="eyebrow">Создать</span><h2 id="actionDialogTitle">Что нужно сделать?</h2></div><button class="icon-button icon-button--close" type="button" data-close-dialog>×</button></header>
      <div class="quick-action-grid"><button type="button" data-admin-new-order><span>+</span><strong>Создать дело</strong><small>Клиент, задача и срок</small></button><button type="button" data-toast="Форма платежа недоступна в концепте"><span>₽</span><strong>Добавить платёж</strong><small>По согласованной позиции</small></button><button type="button" data-admin-new-article><span>Аа</span><strong>Новая публикация</strong><small>Черновик публикации</small></button></div>
    `, adminQuick);
    return;
  }

  const adminNewArticle = target.closest("[data-admin-new-article]");
  if (adminNewArticle) {
    actionDialogContent(`
      <header class="overlay__header"><div><span class="eyebrow">Новая публикация</span><h2 id="actionDialogTitle">Карточка публикации</h2></div><button class="icon-button icon-button--close" type="button" data-close-dialog>×</button></header>
      <div class="admin-order-sheet"><label class="field"><span>Рабочий заголовок</span><input type="text" placeholder="О чём публикация"></label><label class="field"><span>Рубрика</span><select><option>Методология</option><option>Оформление</option><option>Защита</option></select></label><label class="field"><span>Задача читателя</span><textarea rows="4" placeholder="Какой вопрос должна решить публикация"></textarea></label><button class="button button--primary" type="button" data-toast="Сохранение недоступно в концепте">Сохранить черновик</button></div>
    `, adminNewArticle);
    return;
  }

  if (target.closest("[data-generate-cover]")) {
    const title = view.querySelector("[data-cover-title]")?.value.trim() || "Новая публикация";
    const preview = view.querySelector("[data-cover-preview-title]");
    if (preview) preview.innerHTML = escapeHTML(title).replace(/\s+/, "<br>");
    requestAnimationFrame(fitCoverTitle);
    showToast("Предпросмотр обновлён");
    return;
  }

  const coverChoice = target.closest("[data-cover-layout], [data-cover-format]");
  if (coverChoice) {
    const choiceSelector = coverChoice.hasAttribute("data-cover-layout") ? "[data-cover-layout]" : "[data-cover-format]";
    setPressedGroup(choiceSelector, coverChoice, "is-selected");
    const canvas = view.querySelector("[data-cover-canvas]");
    const layout = coverChoice.getAttribute("data-cover-layout");
    const format = coverChoice.getAttribute("data-cover-format");
    if (canvas && layout) canvas.dataset.layout = layout;
    if (format) {
      const meta = view.querySelector(".cover-canvas-wrap > header > span");
      if (meta) meta.textContent = `Предпросмотр · ${format.replace("×", " × ")}`;
      if (canvas) canvas.dataset.format = format;
    }
    requestAnimationFrame(fitCoverTitle);
    return;
  }

  if (target.closest("[data-share-current]")) {
    const url = location.href;
    try {
      if (navigator.share) await navigator.share({ title: document.title, url });
      else await navigator.clipboard.writeText(url);
      showToast("Ссылка на материал готова");
    } catch {
      // Пользователь мог закрыть системное меню.
    }
    return;
  }

  if (target.closest("[data-article-rate]")) {
    showToast("Оценка не отправляется в концепте");
    return;
  }

  if (target.closest("[data-print-page]")) {
    window.print();
    return;
  }

  const caseMenu = target.closest("[data-case-menu]");
  if (caseMenu) {
    actionDialogContent(`
      <header class="overlay__header"><div><span class="eyebrow">Дело DEMO-2417</span><h2 id="actionDialogTitle">Действия</h2></div><button class="icon-button icon-button--close" type="button" data-close-dialog>×</button></header>
      <div class="sheet-action-list"><button type="button" data-copy-case-link>Скопировать ссылку</button><button type="button" data-open-support>Задать вопрос приёмной</button><button type="button" data-toast="Загрузка архива недоступна в концепте">Архив дела</button><button type="button" data-toast="Запрос сохранён только в демонстрации">Запросить приостановку</button></div>
    `, caseMenu);
    return;
  }
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (target.matches("[aria-invalid='true']")) target.removeAttribute("aria-invalid");
  if (target.matches("[data-deposit-range]")) {
    updateDepositCalculator(target.value);
    return;
  }
  if (target.matches("[data-wizard-field]")) {
    state.wizard[target.getAttribute("data-wizard-field")] = target.value;
    state.wizard.started = true;
    saveState();
    return;
  }

  if (target.matches("[data-service-search]")) {
    applyServiceFilters(true);
    return;
  }

  if (target.matches("[data-price-search]")) {
    announceResultCount(filterCards("[data-price-row]", target.value));
    return;
  }

  if (target.matches("[data-guide-search]")) {
    applyGuideFilters(true);
    return;
  }

  if (target.matches("[data-route-map-search]")) {
    const visible = filterCards("[data-route-map-item]", target.value);
    document.querySelectorAll("[data-route-section]").forEach((section) => {
      section.hidden = ![...section.querySelectorAll("[data-route-map-item]")].some((item) => !item.hidden);
    });
    announceResultCount(visible);
    return;
  }

  if (target.matches("[data-admin-order-search]")) {
    applyAdminOrderFilters(true);
    return;
  }

  if (target.matches("[data-content-search]")) {
    applyContentFilters(true);
    return;
  }

  if (target.matches("[data-client-search]")) {
    const query = target.value.trim().toLocaleLowerCase("ru");
    let visible = 0;
    view.querySelectorAll(".client-directory__list [data-client]").forEach((button) => {
      button.hidden = query && !button.textContent.toLocaleLowerCase("ru").includes(query);
      if (!button.hidden) visible += 1;
    });
    announceResultCount(visible);
    return;
  }

  if (target.matches("[data-check-text]")) {
    state.checkText = target.value;
    const count = view.querySelector("[data-char-count]");
    if (count) count.textContent = `${target.value.length.toLocaleString("ru-RU")} / 8 000`;
    saveState();
    return;
  }

  if (target.matches("[data-topic-title]")) {
    state.topicTitle = target.value;
    saveState();
    return;
  }

  if (target.matches("[data-source-text]")) {
    state.sourceText = target.value;
    saveState();
    return;
  }

  if (target.matches("[data-gift-name]")) {
    state.giftName = target.value;
    const preview = view.querySelector("[data-gift-preview-name]");
    if (preview) preview.textContent = target.value.trim() ? `Получатель: ${target.value.trim()}` : "Для редакторской консультации или работы";
    return;
  }

  if (target.matches("[data-gift-message]")) {
    state.giftMessage = target.value;
    const preview = view.querySelector("[data-gift-preview-message]");
    if (preview) {
      preview.textContent = target.value.trim();
      preview.hidden = !target.value.trim();
    }
    return;
  }

  if (target === searchInput) {
    renderSearch(target.value);
  }
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (target.matches("[aria-invalid='true']")) target.removeAttribute("aria-invalid");
  if (target.matches("[data-admin-column]")) {
    const index = Number(target.getAttribute("data-admin-column"));
    view.querySelectorAll(".admin-table tr").forEach((row) => {
      const cell = row.children[index];
      if (cell) cell.hidden = !target.checked;
    });
    announce(`${target.closest("label")?.textContent.trim() || "Столбец"}: ${target.checked ? "показан" : "скрыт"}`, 0);
    return;
  }
  if (target.matches("[data-payment-agree]")) {
    const button = actionDialog?.querySelector("[data-demo-pay]");
    if (button) {
      button.disabled = !target.checked;
      button.setAttribute("aria-disabled", String(!target.checked));
    }
    return;
  }

  if (target.matches("[data-cover-category]")) {
    const category = target.value.trim() || "Методология";
    const preview = view.querySelector(".cover-canvas__index");
    if (preview) preview.textContent = `01 / ${category.toLocaleUpperCase("ru")}`;
    showToast("Рубрика обновлена");
    return;
  }
  if (target.matches("[data-wizard-consent]")) {
    state.wizard.consent = target.checked;
    saveState();
    return;
  }

  if (target.matches("[data-wizard-files]")) {
    const names = [...target.files].map((file) => file.name);
    state.wizard.files = [...new Set([...(state.wizard.files || []), ...names])];
    state.wizard.started = true;
    saveState();
    queueRenderFocus("[data-wizard-files]");
    render(true);
    return;
  }

  if (target.matches("[data-case-files]")) {
    const count = target.files.length;
    const label = target.closest(".case-file-picker")?.querySelector("[data-case-file-label]");
    if (label) label.textContent = count ? `Выбрано: ${count}` : "Добавить файл";
    showToast(count ? `${count === 1 ? "Файл выбран" : `Выбрано файлов: ${count}`}; отправка отключена в концепте` : "Файл не выбран");
    return;
  }

  if (target.matches("[data-page-support-files]")) {
    const names = [...target.files].map((file) => file.name);
    const note = target.closest(".file-drop")?.querySelector("[data-page-support-file-name]");
    if (note) {
      note.textContent = names.length
        ? `${names.length === 1 ? "Файл" : "Файлы"}: ${names.join(", ")}`
        : "Имя файла показывается только в этой вкладке";
    }
  }
});

document.addEventListener("submit", (event) => {
  if (event.target.matches("[data-message-form]")) {
    event.preventDefault();
    const input = event.target.querySelector("[data-message-input]");
    const value = input?.value.trim();
    if (!value) return;
    state.messages = [...(state.messages || []), value];
    saveState();
    queueRenderFocus("[data-message-input]", { reveal: true });
    render(true);
    announce("Сообщение сохранено в демонстрационном диалоге", 0);
  }
});

document.addEventListener("keydown", (event) => {
  const editable = event.target.matches("input, textarea, select, [contenteditable='true']");
  if (event.key === "/" && !editable && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    openSearch(document.querySelector("[data-open-search]"));
    return;
  }

  if (!searchDialog?.open) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    searchSelection = Math.min(searchMatches.length - 1, searchSelection + 1);
    updateSearchSelection();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    searchSelection = Math.max(0, searchSelection - 1);
    updateSearchSelection();
  } else if (event.key === "Enter" && event.target === searchInput && searchMatches[searchSelection]) {
    event.preventDefault();
    closeDialog(searchDialog, { preserveHistory: true });
    navigate(searchMatches[searchSelection].slug);
  }
});

function ASSET_URL(path) {
  return `../../assets/${path}`;
}

window.addEventListener("popstate", (event) => {
  closeAllDialogs();
  restoringHistoryEntry = parseRoute() !== currentSlug;
  const storedScroll = Number(event.state?.salonScrollY);
  pendingHistoryScroll = Number.isFinite(storedScroll) ? Math.max(0, storedScroll) : 0;
  if (pendingDialogNavigation) {
    const nextSlug = pendingDialogNavigation;
    pendingDialogNavigation = "";
    requestAnimationFrame(() => navigate(nextSlug));
  }
});
window.addEventListener("hashchange", () => render());
window.addEventListener("resize", () => requestAnimationFrame(() => {
  alignAdminNavigation();
  fitCoverTitle();
  updateReadingUI();
  centerCurrentRails();
  const nextCatalogMobile = matchMedia("(max-width: 620px)").matches;
  if (nextCatalogMobile === catalogMobile) return;
  catalogMobile = nextCatalogMobile;
  const slug = parseRoute();
  if (slug === "services") {
    const focusedCard = document.activeElement?.closest("[data-service-grid] .service-card");
    if (focusedCard) {
      const more = view.querySelector('[data-catalog-more="services"]');
      if (more) more.dataset.expanded = "true";
    }
    applyServiceFilters();
  }
  if (slug === "knowledge") {
    const focusedCard = document.activeElement?.closest("[data-guide-grid] .article-card");
    if (focusedCard) {
      const more = view.querySelector('[data-catalog-more="guides"]');
      if (more) more.dataset.expanded = "true";
    }
    applyGuideFilters();
  }
}), { passive: true });

window.addEventListener("scroll", () => {
  document.querySelector("[data-site-header]")?.classList.toggle("is-scrolled", scrollY > 16);
  updateReadingUI();
  persistHistoryScroll();
}, { passive: true });
window.addEventListener("pagehide", () => persistHistoryScroll(true));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") persistHistoryScroll(true);
});

const systemThemeQuery = matchMedia("(prefers-color-scheme: dark)");
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
setTheme(initialTheme(), { persist: false });
systemThemeQuery.addEventListener?.("change", (event) => {
  if (!hasSavedTheme()) setTheme(event.matches ? "dark" : "light", { persist: false });
});
if (!location.hash.startsWith("#/")) history.replaceState({ salonScrollY: 0 }, "", `${location.pathname}#/home`);
render(true);
renderSearch("");
