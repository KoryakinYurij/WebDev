/* Линия сгиба — arm B (profile).
   Прогрессивное улучшение. Без скриптов, на узком или коротком экране и в уменьшенном режиме
   показываются три статические кадра. Когда места хватает и движение обычное, вместо них
   работает один лист: прокрутка поднимает половину до вертикали и укладывает её поверх.
   Сам лист декоративен — то же самое сказано текстом стадий. */

(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.add("js");

  var MANUAL_KEY = "fold-profile.motion";
  var TOTAL_ANGLE = 172;
  var STAGE_EDGES = [0.32, 0.62];
  var READING_LINE = 0.55;

  var state = { manual: false, system: false };
  var query = function (value) {
    return window.matchMedia ? window.matchMedia(value) : null;
  };
  var wideQuery = query("(min-width: 62rem) and (min-height: 34rem)");
  var systemQuery = query("(prefers-reduced-motion: reduce)");

  function reduced() {
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
      /* Запрет хранилища: настройка не запоминается, поведение сохраняется. */
    }
  }

  /* ---------- элементы ---------- */

  var bar = document.querySelector(".bar");
  var bench = document.getElementById("bench");
  var sheet = document.getElementById("sheet");
  var angle = document.getElementById("angle");
  var stages = Array.prototype.slice.call(document.querySelectorAll("#stages .stage"));
  var frames = document.getElementById("frames");
  var frameItems = frames ? Array.prototype.slice.call(frames.querySelectorAll(".frames__list li")) : [];
  var motionButton = document.getElementById("motion-toggle");
  var motionNote = document.getElementById("motion-note");

  /* ---------- геометрия сцены ---------- */

  function smoothstep(value) {
    return value * value * (3 - 2 * value);
  }

  function stageIndex(progress) {
    if (progress < STAGE_EDGES[0]) return 0;
    if (progress < STAGE_EDGES[1]) return 1;
    return 2;
  }

  /* Середина отрезка стадии: нужна при возврате места чтения. */
  function progressForStage(index) {
    if (index <= 0) return STAGE_EDGES[0] / 2;
    if (index === 1) return (STAGE_EDGES[0] + STAGE_EDGES[1]) / 2;
    return (STAGE_EDGES[1] + 1) / 2;
  }

  function benchProgress() {
    var box = bench.getBoundingClientRect();
    var travel = box.height - window.innerHeight;
    if (!isFinite(travel) || travel <= 0) return 0;
    return Math.max(0, Math.min(1, -box.top / travel));
  }

  var pending = false;

  function onScroll() {
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(function () {
      pending = false;
      updateScene();
    });
  }

  function onResize() {
    measureBar();
    onScroll();
  }

  function updateScene() {
    if (!bench || !sheet) return;

    /* Сначала только измерения. */
    var progress = benchProgress();
    var theta = TOTAL_ANGLE * smoothstep(progress);
    var radians = theta * Math.PI / 180;
    /* lift — насколько половина ушла за вертикаль и легла поверх нижней.
       Без него сложенный лист читался плоско: подсветка по синусу у самого
       конца почти гасла, и в кадре оставался белый прямоугольник.
       Объём даёт тень от края, а не затемнение бумаги: проба с прибавкой 0,04
       дала средний цвет листа 0,90 при 0,86 у стола — лист растворялся в фоне.
       Бумага остаётся светлой, меняется силуэт и тень под ним. */
    var lift = smoothstep(Math.max(0, Math.min(1, (theta - 96) / 76)));
    var shade = 0.42 * Math.abs(Math.sin(radians)) + 0.015 * lift;
    var shadow = 0.55 - 0.3 * Math.abs(Math.sin(radians));
    var index = stageIndex(progress);

    /* Затем запись: пользовательские свойства, число угла и класс стадии. */
    sheet.style.setProperty("--theta", theta.toFixed(2));
    sheet.style.setProperty("--shade", shade.toFixed(3));
    sheet.style.setProperty("--shadow", shadow.toFixed(3));
    sheet.style.setProperty("--lift", lift.toFixed(3));
    if (angle) angle.textContent = Math.round(theta) + "°";
    for (var position = 0; position < stages.length; position += 1) {
      stages[position].classList.toggle("is-current", position === index);
    }
    root.setAttribute("data-stage", String(index));
    markFrame(index);
  }

  /* Высота липкой строки: измеряем, а не загадываем — она зависит от переносов на узком экране. */
  function measureBar() {
    if (!bar) return;
    root.style.setProperty("--bar-h", bar.offsetHeight + "px");
  }

  /* ---------- раскладка: закреплённая сцена или статические кадры ---------- */

  var live = false;

  function canLive() {
    return Boolean(wideQuery && wideQuery.matches) && !reduced();
  }

  function applyLayout() {
    var shouldLive = canLive();
    if (shouldLive === live) {
      if (live) updateScene();
      return;
    }
    live = shouldLive;
    root.classList.toggle("is-live", live);
    if (live) {
      measureBar();
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onResize, { passive: true });
      updateScene();
    } else {
      window.removeEventListener("scroll", onScroll, { passive: true });
      window.removeEventListener("resize", onResize, { passive: true });
      stages.forEach(function (stage) { stage.classList.remove("is-current"); });
    }
  }

  /* ---------- место чтения при смене раскладки ---------- */

  function nearestFrameIndex() {
    var line = window.innerHeight * READING_LINE;
    var best = 0;
    var bestDistance = Infinity;
    frameItems.forEach(function (item, index) {
      var box = item.getBoundingClientRect();
      var distance = Math.abs(box.top + box.height / 2 - line);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  }

  /* Отметка кадра — источник истины о месте чтения в статической раскладке.
     На широком экране три кадра стоят в один ряд, и по вертикальному
     расстоянию до линии чтения все они равны: спросить геометрию значит
     получить первый кадр вместо нужного. */
  function markFrame(index) {
    if (!frameItems[index]) return;
    frameItems.forEach(function (item, position) {
      if (position === index) {
        item.setAttribute("data-current", "true");
        item.setAttribute("aria-current", "true");
      } else {
        item.removeAttribute("data-current");
        item.removeAttribute("aria-current");
      }
    });
  }

  /* Кадры стоят столбиком (узкий экран) — тогда отметку можно вести за прокруткой.
     В ряд они видны все сразу, и отметка остаётся там, откуда читатель пришёл. */
  function framesStacked() {
    if (frameItems.length < 2) return false;
    var first = frameItems[0].getBoundingClientRect();
    var second = frameItems[1].getBoundingClientRect();
    return second.top - first.top > 1;
  }

  function readingIndex() {
    if (live) return stageIndex(benchProgress());
    var marked = frameItems.findIndex(function (item) { return item.hasAttribute("data-current"); });
    if (marked >= 0 && !framesStacked()) return marked;
    return nearestFrameIndex();
  }

  function onFramesScroll() {
    if (!framesStacked()) return;
    markFrame(nearestFrameIndex());
  }

  function scrollToProgress(progress) {
    var box = bench.getBoundingClientRect();
    var travel = box.height - window.innerHeight;
    if (travel <= 0) return;
    window.scrollTo({ top: window.scrollY + box.top + progress * travel, behavior: "auto" });
  }

  function scrollToFrame(index) {
    var item = frameItems[index];
    if (!item) return;
    markFrame(index);
    var box = item.getBoundingClientRect();
    var line = window.innerHeight * READING_LINE;
    window.scrollTo({ top: window.scrollY + box.top + box.height / 2 - line, behavior: "auto" });
  }

  /* Смена раскладки возвращает читателя к той же стадии. Возврат мгновенный:
     плавная прокрутка сама читалась бы как движение. */
  function switchLayout(action) {
    var index = readingIndex();
    var wasLive = live;
    action();
    if (live === wasLive) return;
    if (live) {
      scrollToProgress(progressForStage(index));
      updateScene();
    } else {
      scrollToFrame(index);
    }
  }

  if (wideQuery) {
    var onLayoutQuery = function () { switchLayout(applyLayout); };
    if (wideQuery.addEventListener) {
      wideQuery.addEventListener("change", onLayoutQuery);
    } else if (wideQuery.addListener) {
      wideQuery.addListener(onLayoutQuery);
    }
  }

  /* ---------- режим движения ---------- */

  function renderMotion() {
    root.setAttribute("data-motion", reduced() ? "reduced" : "full");

    if (motionButton) {
      motionButton.hidden = false;
      motionButton.disabled = state.system;
      motionButton.setAttribute("aria-pressed", state.manual ? "true" : "false");
      motionButton.setAttribute("aria-describedby", "motion-note");
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
    applyLayout();
  }

  if (motionButton) {
    motionButton.addEventListener("click", function () {
      switchLayout(function () {
        state.manual = !state.manual;
        writeManual(state.manual);
        renderMotion();
      });
    });
  }

  if (frames && frameItems.length) {
    /* Статическая раскладка начинается с первого кадра: отметка должна быть
       определена сразу, иначе возврат к сцене не знает, куда возвращаться. */
    markFrame(0);
    window.addEventListener("scroll", onFramesScroll, { passive: true });
    window.addEventListener("resize", function () { markFrame(readingIndex()); }, { passive: true });
  }

  if (systemQuery) {
    state.system = systemQuery.matches;
    var onSystemChange = function (event) {
      state.system = event.matches;
      switchLayout(renderMotion);
    };
    if (systemQuery.addEventListener) {
      systemQuery.addEventListener("change", onSystemChange);
    } else if (systemQuery.addListener) {
      systemQuery.addListener(onSystemChange);
    }
  }

  state.manual = readManual();

  /* ---------- схема сгиба ---------- */

  var scheme = document.getElementById("scheme");
  var foldButton = document.getElementById("fold-toggle");
  var foldStatus = document.getElementById("fold-status");
  var schemeState = document.getElementById("scheme-state");
  var folded = false;

  function renderFold() {
    if (scheme) scheme.classList.toggle("is-folded", folded);
    if (foldButton) foldButton.textContent = folded ? "Вернуть плоскость" : "Показать сгиб";
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

  renderMotion();
  window.addEventListener("load", function () { if (live) updateScene(); }, { once: true });
})();
