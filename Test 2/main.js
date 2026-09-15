/* ==========================================================================
   «Линия сгиба» — прогрессивное улучшение одного документа.

   Скрипт необязателен. Без него страница читается, главное действие работает,
   а схема показывает статическое объяснение. Формат — классический скрипт
   (не module): так готовый HTML открывается и по file:// без сервера.

   Что делает скрипт:
   1) включает управление уменьшением движения (системное ИЛИ ручное);
   2) закрепляет одну сцену «Три состояния листа» на широком экране;
   3) включает кнопку «Показать сгиб / Вернуть плоскость» для отдельной схемы.

   Чистые функции вынесены наверх и доступны в Node: их проверяет scripts/check.mjs.
   ========================================================================== */

(function () {
  'use strict';

  var FLAT_CAPTION = 'Схема: лист лежит плоско, линия сгиба только намечена.';
  var FOLDED_CAPTION = 'Схема: одна сторона листа приподнята, силуэт изменился.';

  /* --- Чистые функции ---------------------------------------------------- */

  // Стадия по позиции фокуса и границам: границы считаются серединами блоков,
  // поэтому выбор одинаков при прокрутке вниз и вверх.
  function pickStage(focus, boundaries) {
    if (!isFinite(focus) || !boundaries || !boundaries.length) return 0;
    for (var i = 0; i < boundaries.length; i++) {
      if (focus < boundaries[i]) return i;
    }
    return boundaries.length;
  }

  function midpoints(centers) {
    var out = [];
    for (var i = 1; i < centers.length; i++) {
      if (isFinite(centers[i]) && isFinite(centers[i - 1])) {
        out.push((centers[i] + centers[i - 1]) / 2);
      }
    }
    return out;
  }

  function captionFor(folded) { return folded ? FOLDED_CAPTION : FLAT_CAPTION; }
  function labelFor(folded) { return folded ? 'Вернуть плоскость' : 'Показать сгиб'; }
  function toggleFold(current) { return current === 'folded' ? 'flat' : 'folded'; }

  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = {
        pickStage: pickStage,
        midpoints: midpoints,
        captionFor: captionFor,
        labelFor: labelFor,
        toggleFold: toggleFold,
        FLAT_CAPTION: FLAT_CAPTION,
        FOLDED_CAPTION: FOLDED_CAPTION
      };
    }
    return;
  }

  /* --- Состояние движения ------------------------------------------------ */

  var STORE_KEY = 'fold-line.motion';
  var root = document.documentElement;
  var manualReduced = readManual();

  // Отсутствие API — тоже состояние: без matchMedia страница просто остаётся
  // статической, а обе кнопки продолжают работать.
  var reduceQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false, addEventListener: null, addListener: null };
  var wideQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(min-width: 62rem)')
    : { matches: false };
  var nextFrame = typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame.bind(window)
    : function (callback) { return window.setTimeout(callback, 16); };

  var toggle = document.getElementById('motion-toggle');
  var note = document.getElementById('motion-note');

  function readManual() {
    try {
      return window.localStorage.getItem(STORE_KEY) === 'reduced';
    } catch (error) {
      return false; // приватный режим или запрет хранилища: работаем без памяти
    }
  }

  function saveManual(value) {
    try {
      window.localStorage.setItem(STORE_KEY, value ? 'reduced' : 'auto');
    } catch (error) {
      // Выбор остаётся в силе до перезагрузки; это допустимо.
    }
  }

  // Эффективное уменьшение движения = системное ИЛИ ручное.
  function reducedNow() { return reduceQuery.matches || manualReduced; }

  function renderMotion() {
    var reduced = reducedNow();

    root.setAttribute('data-motion', reduced ? 'reduced' : 'auto');

    if (toggle) {
      toggle.hidden = false;
      toggle.setAttribute('aria-pressed', reduced ? 'true' : 'false');
      // Системное предпочтение приоритетно: ручной переключатель его не отменяет.
      toggle.disabled = reduceQuery.matches;
    }

    if (note) {
      note.hidden = false;
      note.textContent = reduceQuery.matches
        ? 'Движение уменьшено системной настройкой.'
        : (manualReduced ? 'Движение уменьшено вручную.' : 'Движение включено.');
    }
  }

  /* --- Сцена «Три состояния листа» -------------------------------------- */

  var scene = document.querySelector('[data-scene]');
  var stages = scene ? Array.prototype.slice.call(scene.querySelectorAll('.stage')) : [];
  var stageLayer = null;
  var pinned = false;
  var activeIndex = -1;
  var boundaries = [];
  var frameRequest = 0;

  function sceneFrames() {
    return stageLayer ? Array.prototype.slice.call(stageLayer.querySelectorAll('.frame')) : [];
  }

  function setActive(index) {
    var list = sceneFrames();
    if (!list.length || index === activeIndex) return;
    activeIndex = index;
    for (var i = 0; i < list.length; i++) {
      list[i].classList.toggle('is-active', i === index);
    }
    for (var j = 0; j < stages.length; j++) {
      stages[j].classList.toggle('is-active', j === index);
    }
  }

  // Закрепление разрешено только на широком и достаточно высоком экране
  // и никогда в уменьшенном режиме.
  function pinAllowed() {
    if (!scene || stages.length < 2) return false;
    if (reducedNow()) return false;
    if (!wideQuery.matches) return false;
    if (window.innerHeight < 560) return false;
    return true;
  }

  // Решение о закреплении принимается по фактической высоте сцены, а не по
  // предположению: если кадр не помещается в окно, остаются последовательные кадры.
  function pinFits() {
    if (!stageLayer) return false;
    var stageHeight = stageLayer.getBoundingClientRect().height;
    return stageHeight > 0 && stageHeight <= window.innerHeight - 96;
  }

  function enablePin() {
    if (pinned) return;

    var layer = document.createElement('div');
    layer.className = 'scene__stage';
    layer.setAttribute('aria-hidden', 'true'); // кадры декоративны, текст остаётся в разметке

    for (var i = 0; i < stages.length; i++) {
      var figure = stages[i].querySelector('.stage__figure');
      var frame = figure ? figure.querySelector('.frame') : null;
      if (frame) layer.appendChild(frame.cloneNode(true));
    }

    if (!layer.childNodes.length) return;

    scene.insertBefore(layer, scene.firstChild);
    stageLayer = layer;
    activeIndex = -1;
    scene.classList.add('is-pinned');
    pinned = true;
  }

  function disablePin() {
    if (!pinned) return;
    scene.classList.remove('is-pinned');
    if (stageLayer && stageLayer.parentNode) stageLayer.parentNode.removeChild(stageLayer);
    stageLayer = null;
    pinned = false;
    activeIndex = -1;
    boundaries = [];
    for (var j = 0; j < stages.length; j++) stages[j].classList.remove('is-active');
  }

  function measure() {
    boundaries = [];
    if (!pinned) return;

    var centers = [];
    for (var i = 0; i < stages.length; i++) {
      var rect = stages[i].getBoundingClientRect();
      centers.push(rect.top + window.scrollY + rect.height / 2);
    }
    boundaries = midpoints(centers);
  }

  function update() {
    if (!pinned) return;
    var focus = window.scrollY + window.innerHeight * 0.45;
    setActive(pickStage(focus, boundaries));
  }

  function scheduleUpdate() {
    if (frameRequest) return;
    frameRequest = nextFrame(function () {
      frameRequest = 0;
      update();
    });
  }

  // Единая точка приведения сцены к текущим условиям. Пользователя она не прокручивает.
  function syncScene(remeasure) {
    if (!scene) return;

    if (!pinAllowed()) {
      disablePin();
      return;
    }

    if (!pinned) {
      enablePin();
      if (!pinFits()) {
        disablePin();
        return;
      }
      remeasure = true;
    }
    if (remeasure) measure();
    update();
  }

  /* --- Схема сгиба ------------------------------------------------------- */

  var scheme = document.getElementById('scheme');
  var foldButton = document.getElementById('fold-btn');
  var caption = document.getElementById('scheme-caption');

  if (scheme && foldButton) {
    // Базовая разметка скрывает кнопку: без скрипта она была бы неработающей.
    foldButton.hidden = false;

    foldButton.addEventListener('click', function () {
      var next = toggleFold(scheme.getAttribute('data-fold'));
      var folded = next === 'folded';

      scheme.setAttribute('data-fold', next);
      foldButton.textContent = labelFor(folded);
      if (caption) caption.textContent = captionFor(folded);
    });
  }

  /* --- Запуск ------------------------------------------------------------ */

  if (toggle) {
    toggle.addEventListener('click', function () {
      manualReduced = !manualReduced;
      saveManual(manualReduced);
      renderMotion();
      syncScene(true); // положение чтения сохраняется
    });
  }

  function onSystemMotionChange() {
    renderMotion();
    syncScene(true);
  }

  if (typeof reduceQuery.addEventListener === 'function') {
    reduceQuery.addEventListener('change', onSystemMotionChange);
  } else if (typeof reduceQuery.addListener === 'function') {
    reduceQuery.addListener(onSystemMotionChange);
  }

  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', function () { syncScene(true); }, { passive: true });
  window.addEventListener('load', function () { syncScene(true); });

  renderMotion();
  syncScene(true);
})();
