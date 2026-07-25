(function () {
  "use strict";

  var routeData = {
    topic: {
      index: "01",
      state: "Только тема или задание",
      timeline: "1–2 дня",
      title: "Разбор задачи и рабочий план",
      summary: "Переведём требования кафедры на понятный язык, проверим логику темы и соберём реалистичную структуру работы.",
      bulletOne: "логика глав и разделов",
      bulletTwo: "карта методов и источников",
      bulletThree: "порядок самостоятельной работы",
      price: "от 3 000 ₽",
      format: "План + консультация",
      href: "../configurator.html?service=pl"
    },
    draft: {
      index: "02",
      state: "Есть черновик",
      timeline: "1–2 дня",
      title: "Редакторский аудит и карта правок",
      summary: "Проверим структуру, аргументацию и оформление. Вы получите документ с приоритетами и понятной логикой доработки.",
      bulletOne: "карта слабых мест",
      bulletTwo: "комментарии к логике и структуре",
      bulletThree: "следующий шаг без лишних услуг",
      price: "от 2 500 ₽",
      format: "Документ + созвон",
      href: "../razbor-zamechaniy-nauchruka.html"
    },
    defense: {
      index: "03",
      state: "Скоро сдача или защита",
      timeline: "от 1 дня",
      title: "Чек-лист готовности к защите",
      summary: "Сверим работу с методичкой, найдём критичные риски и соберём приоритеты по оформлению, слайдам и выступлению.",
      bulletOne: "нормоконтроль по методичке",
      bulletTwo: "структура слайдов и речи",
      bulletThree: "вероятные вопросы комиссии",
      price: "от 3 000 ₽",
      format: "Проверка + репетиция",
      href: "../configurator.html?service=dp"
    }
  };

  var currentRoute = "draft";
  var lastDialogTrigger = null;
  var plannerDialog = document.getElementById("plannerDialog");
  var menuDialog = document.getElementById("menuDialog");
  var topbar = document.querySelector("[data-topbar]");

  function setRoute(routeName) {
    var route = routeData[routeName];
    if (!route) return;
    currentRoute = routeName;

    document.querySelectorAll("[data-bind]").forEach(function (node) {
      var key = node.getAttribute("data-bind");
      if (Object.prototype.hasOwnProperty.call(route, key)) {
        node.textContent = route[key];
      }
    });

    document.querySelectorAll("[data-route]").forEach(function (button) {
      var selected = button.getAttribute("data-route") === routeName;
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });

    document.querySelectorAll(".route-row[data-route]").forEach(function (row) {
      row.classList.toggle("is-active", row.getAttribute("data-route") === routeName);
    });

    document.querySelectorAll("[data-route-href]").forEach(function (link) {
      link.setAttribute("href", route.href);
    });
  }

  function openDialog(dialog, trigger) {
    if (!dialog || typeof dialog.showModal !== "function") return;
    if (dialog.open) return;
    lastDialogTrigger = trigger || document.activeElement;
    dialog.showModal();
    document.body.classList.add("dialog-open");
  }

  function closeDialog(dialog) {
    if (!dialog || !dialog.open) return;
    dialog.close();
  }

  document.addEventListener("click", function (event) {
    var routeButton = event.target.closest("[data-route]");
    if (routeButton) {
      setRoute(routeButton.getAttribute("data-route"));
    }

    var plannerTrigger = event.target.closest("[data-open-planner]");
    if (plannerTrigger) {
      event.preventDefault();
      openDialog(plannerDialog, plannerTrigger);
      return;
    }

    var menuTrigger = event.target.closest("[data-open-menu]");
    if (menuTrigger) {
      event.preventDefault();
      openDialog(menuDialog, menuTrigger);
      return;
    }

    var closeTrigger = event.target.closest("[data-close-dialog]");
    if (closeTrigger) {
      closeDialog(closeTrigger.closest("dialog"));
      return;
    }

    var chip = event.target.closest(".choice-chips button");
    if (chip) {
      var group = chip.closest(".choice-chips");
      group.querySelectorAll("button").forEach(function (button) {
        var selected = button === chip;
        button.classList.toggle("is-active", selected);
        button.setAttribute("aria-pressed", selected ? "true" : "false");
      });
    }
  });

  [plannerDialog, menuDialog].forEach(function (dialog) {
    if (!dialog) return;

    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) closeDialog(dialog);
    });

    dialog.addEventListener("close", function () {
      document.body.classList.remove("dialog-open");
      if (lastDialogTrigger && typeof lastDialogTrigger.focus === "function") {
        lastDialogTrigger.focus({ preventScroll: true });
      }
      lastDialogTrigger = null;
    });
  });

  if (menuDialog) {
    menuDialog.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        closeDialog(menuDialog);
      });
    });
  }

  function updateTopbar() {
    if (!topbar) return;
    topbar.classList.toggle("is-scrolled", window.scrollY > 18);
  }

  updateTopbar();
  window.addEventListener("scroll", updateTopbar, { passive: true });

  var revealNodes = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var revealObserver = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, {
      rootMargin: "0px 0px -8% 0px",
      threshold: 0.08
    });

    revealNodes.forEach(function (node) {
      revealObserver.observe(node);
    });
  } else {
    revealNodes.forEach(function (node) {
      node.classList.add("is-visible");
    });
  }

  var homeDockLink = document.querySelector('.app-dock a[href="#home"]');
  var routeDockLink = document.querySelector('.app-dock a[href="#routes"]');
  var routeSection = document.getElementById("routes");

  function updateDock() {
    if (!routeSection || !homeDockLink || !routeDockLink) return;
    var routesReached = routeSection.getBoundingClientRect().top < window.innerHeight * 0.48;
    homeDockLink.classList.toggle("is-current", !routesReached);
    routeDockLink.classList.toggle("is-current", routesReached);
  }

  updateDock();
  window.addEventListener("scroll", updateDock, { passive: true });

  setRoute(currentRoute);
}());
