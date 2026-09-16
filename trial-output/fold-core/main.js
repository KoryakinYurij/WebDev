/* Линия сгиба — arm A (core).
   Прогрессивное улучшение: без скрипта страница читается целиком, схема стоит плоско,
   оба переключателя скрыты. Скрипт добавляет только подчёркивание состояний, появление
   секций и управление схемой. Ни одной зависимости, ни одного сетевого запроса. */

(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.add("js");

  var MANUAL_KEY = "fold-core.motion";
  var state = { manual: false, system: false };

  function effectiveReduced() {
    return state.system || state.manual;
  }

  function readManual() {
    try {
      return window.localStorage.getItem(MANUAL_KEY) === "reduced";
    } catch (error) {
      return false;
    }
  }

  function writeManual(value) {
    try {
      window.localStorage.setItem(MANUAL_KEY, value ? "reduced" : "full");
    } catch (error) {
      /* Запрет хранилища не влияет на работу: настройка просто не запоминается. */
    }
  }

  var systemQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

  /* ---------- режим движения ---------- */

  var motionButton = document.getElementById("motion-toggle");
  var motionNote = document.getElementById("motion-note");

  function renderMotion() {
    var reduced = effectiveReduced();
    root.setAttribute("data-motion", reduced ? "reduced" : "full");

    if (motionButton) {
      motionButton.hidden = false;
      motionButton.disabled = state.system;
      motionButton.setAttribute("aria-pressed", state.manual ? "true" : "false");
      motionButton.textContent = "Уменьшить движение";
    }
    if (motionNote) {
      if (state.system && state.manual) {
        motionNote.textContent = "Движение уменьшено: системная настройка и ручной переключатель. Системную настройку переключатель не отменяет.";
      } else if (state.system) {
        motionNote.textContent = "Движение уменьшено системной настройкой — переключатель не действует.";
      } else if (state.manual) {
        motionNote.textContent = "Движение уменьшено вручную.";
      } else {
        motionNote.textContent = "Движение включено.";
      }
    }
    if (motionButton) {
      motionButton.setAttribute("aria-describedby", "motion-note");
    }
    applyMotionToScene();
  }

  if (motionButton) {
    motionButton.addEventListener("click", function () {
      state.manual = !state.manual;
      writeManual(state.manual);
      renderMotion();
    });
  }

  if (systemQuery) {
    state.system = systemQuery.matches;
    var onSystemChange = function (event) {
      state.system = event.matches;
      renderMotion();
    };
    if (systemQuery.addEventListener) {
      systemQuery.addEventListener("change", onSystemChange);
    } else if (systemQuery.addListener) {
      systemQuery.addListener(onSystemChange);
    }
  }

  state.manual = readManual();

  /* ---------- сцена трёх состояний ---------- */

  var scene = document.getElementById("scene");
  var stages = scene ? Array.prototype.slice.call(scene.querySelectorAll(".stage")) : [];
  var stageObserver = null;

  /* Подчёркивать текущий кадр имеет смысл только когда кадры идут друг под другом.
     На широком экране они стоят в один ряд, и «текущим» оказывался бы всегда первый:
     поэтому там все три показаны равнозначно. */
  var wideQuery = window.matchMedia ? window.matchMedia("(min-width: 52rem)") : null;

  function stacked() {
    return wideQuery ? !wideQuery.matches : true;
  }

  function applyMotionToScene() {
    if (!scene) return;
    var enhance = !effectiveReduced() && stacked() && stageObserver;
    scene.setAttribute("data-enhanced", enhance ? "true" : "false");
    if (!enhance) {
      stages.forEach(function (stage) { stage.classList.remove("is-current"); });
    } else {
      markCurrentStage();
    }
  }

  if (wideQuery) {
    var onWidthChange = function () { applyMotionToScene(); };
    if (wideQuery.addEventListener) {
      wideQuery.addEventListener("change", onWidthChange);
    } else if (wideQuery.addListener) {
      wideQuery.addListener(onWidthChange);
    }
  }

  function stageLine(stage) {
    var box = stage.getBoundingClientRect();
    return box.top + box.height / 2;
  }

  function markCurrentStage() {
    if (!stages.length) return;
    var middle = window.innerHeight * 0.55;
    var best = stages[0];
    var bestDistance = Infinity;
    stages.forEach(function (stage) {
      var distance = Math.abs(stageLine(stage) - middle);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = stage;
      }
    });
    stages.forEach(function (stage) { stage.classList.toggle("is-current", stage === best); });
  }

  if (scene && stages.length && "IntersectionObserver" in window) {
    stageObserver = new IntersectionObserver(function () { applyMotionToScene(); }, {
      rootMargin: "-35% 0px -35% 0px",
      threshold: [0, 0.25, 0.5, 0.75, 1]
    });
    stages.forEach(function (stage) { stageObserver.observe(stage); });
    window.addEventListener("resize", applyMotionToScene, { passive: true });
  }

  /* ---------- схема сгиба ---------- */

  var scheme = document.querySelector(".scheme");
  var foldButton = document.getElementById("fold-toggle");
  var foldStatus = document.getElementById("fold-status");
  var folded = false;

  function renderFold() {
    if (scheme) scheme.classList.toggle("is-folded", folded);
    if (foldButton) foldButton.textContent = folded ? "Вернуть плоскость" : "Показать сгиб";
    var schemeState = document.getElementById("scheme-state");
    if (schemeState) {
      schemeState.textContent = folded
        ? "Лист показан сложенным: поднятая половина меняет силуэт."
        : "Лист показан плоским: обе половины в одной плоскости.";
    }
    if (foldStatus) {
      foldStatus.textContent = folded ? "Сгиб показан." : "Лист возвращён в плоскость.";
    }
  }

  if (foldButton) {
    foldButton.hidden = false;
    foldButton.setAttribute("aria-describedby", "fold-status");
    foldButton.addEventListener("click", function () {
      folded = !folded;
      renderFold();
    });
    renderFold();
  }

  /* Появления секций здесь нет намеренно. Первый прогон проверок дал нестабильный
     результат контраста: секции ниже первого экрана получали opacity 0 до пересечения,
     и автоматическая проверка видела невидимый текст. Появление целой секции ничего не
     сообщает о содержании, поэтому в arm A движение осталось только там, где оно
     объясняет состояние: подчёркивание текущего кадра и положение схемы. */

  renderMotion();
})();
