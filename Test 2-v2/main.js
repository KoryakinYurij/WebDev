/* ==========================================================================
   «Линия сгиба» — вторая версия. Прогрессивное улучшение одного документа.

   Скрипт необязателен: без него читается весь рассказ, работает навигация и
   главное действие, а три состояния листа показаны тремя статическими кадрами.
   Формат — классический скрипт (не module): готовый HTML открывается и по file://.

   Что делает скрипт:
   1) считает геометрию сгиба и ведёт её по прогрессу прокрутки;
   2) печатает заголовок в плоскости листа (та же камера и та же проекция);
   3) переключает уменьшение движения (системное ИЛИ ручное);
   4) включает кнопку «Показать сгиб / Вернуть плоскость» у отдельной схемы.

   Чистые функции вынесены наверх и доступны в Node: их проверяет scripts/check.mjs.
   ========================================================================== */

(function () {
  'use strict';

  /* ===== 1. Модель листа =================================================
     Лист A4 лежит на плоскости стола y = 0. Ось x — вдоль ширины листа,
     z — вдоль глубины (к камере), y — высота над столом. Линия сгиба совпадает
     с осью x и проходит через центр: неподвижная половина уходит в +z, подвижная
     — в -z; она поднимается, наклоняется к камере и ложится поверх неподвижной.

     Камера настоящая, с перспективой: положение задаётся расстоянием, наклоном
     phi и поворотом psi, проекция — деление на глубину. Перспектива нужна не
     ради «3D»: без неё поднимающаяся половина листа почти не меняет силуэт,
     потому что при ортогональной проекции стена и лежащая плоскость выглядят
     одинаково. Глубину считает один и тот же код для SVG и для напечатанного
     заголовка, поэтому текст лежит ровно в плоскости листа.
     ====================================================================== */

  var PAPER = { w: 210, d: 297 };
  var HW = PAPER.w / 2;          // 105 мм от середины ширины до края
  var HD = PAPER.d / 2;          // 148,5 мм от сгиба до дальнего края
  var THICK = 0.55;              // толщина листа, мм
  var K = 4.5;                   // локальных px на мм в напечатанном блоке
  var THETA_MAX = 172;           // максимальный угол сгиба, градусы
  // Предел тона наложения на поднятую половину. Тон принципиально небольшой:
  // светлое на странице — это бумага, и если заливать поднятую половину
  // сильнее, она читается как другая поверхность, серое пятно. Объём несут
  // силуэт, линия сгиба, кромка и тень на столе, а не заливка.
  var VEIL = 0.3;
  var STAGE_P = 0.42;            // положение сцены без прокрутки (reduced motion)

  // Направление на источник света (нормируется ниже): высоко сверху, слева и
  // немного спереди. Высокий свет нужен по делу: поднимающаяся половина листа
  // уходит из-под лампы и темнеет — по этому тону и читается объём.
  var LIGHT = unit({ x: -0.36, y: 0.87, z: 0.34 });

  // Пресеты сцены. vb — система координат SVG, region — доля кадра, в которую
  // обязан поместиться объект за весь ход (слева остаётся колонка для текста),
  // margin — запас, phi/psi/distance — дуга камеры по прогрессу (distance может
  // сокращаться: это наезд камеры, он меняет и размер, и ракурс).
  //
  // Живая сцена помечена adaptive: её кадр повторяет пропорции коробки листа.
  // Без этого пропорции кадра и коробки не совпадают, SVG вписывает систему
  // координат по меньшей стороне (meet) и половина площади уходит в пустое поле —
  // лист выглядит мелким островком. vb здесь — только запасное значение на
  // первый кадр, до замера коробки.
  var SCENES = {
    stage: {
      vb: [0, 0, 1000, 620], margin: 20, region: [0.40, 0, 1, 1], adaptive: true,
      phi: [64, 21], psi: [-14, 23], distance: [1500, 1180],
      print: { x: -92, z: 26 }, printWidth: 46
    },
    frame: {
      vb: [0, 0, 420, 300], margin: 16, region: [0, 0, 1, 1],
      phi: [56, 0], psi: [-17, 0], distance: [1500, 1500],
      print: null, printWidth: 0
    },
    scheme: {
      vb: [0, 0, 560, 380], margin: 18, region: [0, 0, 1, 1],
      phi: [54, 0], psi: [-15, 0], distance: [1500, 1500],
      print: null, printWidth: 0
    }
  };

  // Углы статического рассказа и схемы сгиба.
  var FRAME_ANGLES = [0, 42, 118];
  var SCHEME_FLAT = 0;
  var SCHEME_FOLDED = 104;
  var NOTE_EDGES = [0.32, 0.62];

  var FLAT_CAPTION = 'Схема: лист лежит плоско, линия сгиба только намечена.';
  var FOLDED_CAPTION = 'Схема: одна сторона листа приподнята, силуэт изменился.';

  /* --- 1.1 Мелкая арифметика -------------------------------------------- */

  function unit(vector) {
    var length = Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z) || 1;
    return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
  }

  function clamp01(value) {
    if (!isFinite(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }

  // Плавные концы: объект трогается и останавливается мягко, середина быстрее.
  function ease(p) {
    var t = clamp01(p);
    return t * t * (3 - 2 * t);
  }

  function thetaAt(p) {
    return THETA_MAX * ease(p);
  }

  function radians(degrees) {
    return (degrees * Math.PI) / 180;
  }

  function mix(pair, t) {
    return pair[0] + (pair[1] - pair[0]) * t;
  }

  // Камера по прогрессу: наклон уходит к «уровню стола» и возвращается к концу,
  // поворот медленно доворачивает лист к смотрящему, наезд сокращает расстояние.
  function cameraAt(scene, p) {
    var e = ease(p);
    return {
      phi: scene.phi[0] - scene.phi[1] * Math.sin(Math.PI * e),
      psi: scene.psi[0] + scene.psi[1] * e,
      distance: mix(scene.distance, e)
    };
  }

  // Ортонормированный базис камеры и её положение: смотрящий стоит на сфере
  // радиуса distance вокруг центра листа.
  function viewVectors(camera) {
    var ph = radians(camera.phi);
    var ps = radians(camera.psi);
    var dir = {
      x: Math.sin(ps) * Math.cos(ph),
      y: Math.sin(ph),
      z: Math.cos(ps) * Math.cos(ph)
    };
    var distance = camera.distance;
    return {
      eye: { x: distance * dir.x, y: distance * dir.y, z: distance * dir.z },
      forward: { x: -dir.x, y: -dir.y, z: -dir.z },
      right: { x: Math.cos(ps), y: 0, z: -Math.sin(ps) },
      up: {
        x: -Math.sin(ps) * Math.sin(ph),
        y: Math.cos(ph),
        z: -Math.cos(ps) * Math.sin(ph)
      }
    };
  }

  function dot(first, second) {
    return first.x * second.x + first.y * second.y + first.z * second.z;
  }

  function relative(point, origin) {
    return { x: point.x - origin.x, y: point.y - origin.y, z: point.z - origin.z };
  }

  // Проекция точки: деление на глубину. focal — размер кадра в пикселях
  // (подбирается подгонкой), cx/cy — положение центра кадра.
  function project(point, camera) {
    var view = camera.view || viewVectors(camera);
    var d = relative(point, view.eye);
    var depth = dot(d, view.forward);
    if (!(depth > 1)) depth = 1;   // защита: точка за камерой не должна ломать кадр
    return {
      x: camera.cx + camera.focal * (dot(d, view.right) / depth),
      y: camera.cy - camera.focal * (dot(d, view.up) / depth)
    };
  }

  /* --- 1.2 Форма листа -------------------------------------------------- */

  // Точка подвижной половины: t — расстояние от сгиба (0…HD), theta — градусы.
  function liftPoint(x, t, theta) {
    var a = radians(theta);
    return { x: x, y: t * Math.sin(a), z: -t * Math.cos(a) };
  }

  function normalAt(theta) {
    var a = radians(theta);
    return { x: 0, y: Math.cos(a), z: Math.sin(a) };
  }

  // Нормаль той стороны, которую видит камера. До 90° видна верхняя сторона
  // листа, после — обратная. Бумага рассеивает свет одинаково с обеих сторон,
  // поэтому тон берётся по видимой стороне: без этого сложенная к концу листа
  // половина чернела бы, как стена, хотя лежит к лампе той же стороной.
  function faceNormal(theta) {
    var n = normalAt(theta);
    if (theta <= 90) return n;
    return { x: -n.x, y: -n.y, z: -n.z };
  }

  // Тень точки на стол: сдвиг вдоль направления света, пока точка над столом.
  function groundPoint(point) {
    var t = point.y / LIGHT.y;
    return { x: point.x - t * LIGHT.x, y: 0, z: point.z - t * LIGHT.z };
  }

  var NEAR_FLAT = [
    { x: -HW, y: 0, z: 0 }, { x: HW, y: 0, z: 0 },
    { x: HW, y: 0, z: HD }, { x: -HW, y: 0, z: HD }
  ];
  var FAR_FLAT = [
    { x: -HW, y: 0, z: 0 }, { x: HW, y: 0, z: 0 },
    { x: HW, y: 0, z: -HD }, { x: -HW, y: 0, z: -HD }
  ];

  // Все контуры листа при угле theta. Порядок точек одинаков у всех контуров,
  // чтобы наложение слоёв не зависело от угла.
  function shapeAt(theta) {
    var n = faceNormal(theta);
    var lift = [
      { x: -HW, y: 0, z: 0 }, { x: HW, y: 0, z: 0 },
      liftPoint(HW, HD, theta), liftPoint(-HW, HD, theta)
    ];
    var farRight = lift[2];
    var farLeft = lift[3];
    var edge = [
      farLeft, farRight,
      { x: farRight.x - THICK * n.x, y: farRight.y - THICK * n.y, z: farRight.z - THICK * n.z },
      { x: farLeft.x - THICK * n.x, y: farLeft.y - THICK * n.y, z: farLeft.z - THICK * n.z }
    ];
    var shadow = [
      { x: -HW, y: 0, z: 0 }, { x: HW, y: 0, z: 0 },
      groundPoint(farRight), groundPoint(farLeft)
    ];
    // Тень неподвижной половины: она плоская, поэтому тень почти совпадает с ней
    // и работает как мягкая кромка у края листа.
    var nearShadow = NEAR_FLAT.map(function (point) {
      return { x: point.x + 2.2, y: 0, z: point.z - 2.2 };
    });
    return { near: NEAR_FLAT, nearShadow: nearShadow, lift: lift, edge: edge, shadow: shadow, ghost: FAR_FLAT };
  }

  // Затемнение поднятой половины: доля тона наложения на неё.
  // Бумага рассеивает свет с обеих сторон одинаково, поэтому тон зависит от
  // модуля косинуса между нормалью и светом: поднятая половина уходит из-под
  // лампы, темнеет, а на середине хода (лист на ребре) темнее всего и снова
  // светлеет к концу. Модуль нужен и по делу: без него на вертикали был бы
  // виден скачок тона — видимая сторона листа меняется быстрее, чем тон.
  function shadeAt(theta) {
    var lit = Math.abs(dot(normalAt(theta), LIGHT));
    return clamp01((0.92 - lit) / 0.95);
  }

  /* --- 1.3 Подгонка кадра ---------------------------------------------- */

  function shapeLists(shape) {
    return [shape.near, shape.nearShadow, shape.lift, shape.edge, shape.shadow, shape.ghost];
  }

  // Прямоугольник кадра, отведённый объекту: доли viewBox превращаются в пиксели.
  // В раскладке с полосой слева объекту остаётся правая часть кадра.
  function regionOf(scene, region) {
    var area = region || scene.region || [0, 0, 1, 1];
    return {
      x: area[0] * scene.vb[2],
      y: area[1] * scene.vb[3],
      width: (area[2] - area[0]) * scene.vb[2],
      height: (area[3] - area[1]) * scene.vb[3]
    };
  }

  // Границы объекта за весь ход сгиба при единичном размере кадра: по ним
  // выбирается фокус так, чтобы ни одна точка ни на одном кадре не вышла за
  // отведённый прямоугольник.
  function boundsFor(scene) {
    var min = { x: Infinity, y: Infinity };
    var max = { x: -Infinity, y: -Infinity };
    for (var step = 0; step <= 48; step++) {
      var p = step / 48;
      var cam = cameraAt(scene, p);
      var probe = { phi: cam.phi, psi: cam.psi, distance: cam.distance, focal: 1, cx: 0, cy: 0 };
      probe.view = viewVectors(cam);
      var lists = shapeLists(shapeAt(thetaAt(p)));
      for (var s = 0; s < lists.length; s++) {
        for (var i = 0; i < lists[s].length; i++) {
          var point = project(lists[s][i], probe);
          if (point.x < min.x) min.x = point.x;
          if (point.y < min.y) min.y = point.y;
          if (point.x > max.x) max.x = point.x;
          if (point.y > max.y) max.y = point.y;
        }
      }
    }
    return { min: min, max: max };
  }

  function fitFor(scene, region) {
    var bounds = boundsFor(scene);
    var width = bounds.max.x - bounds.min.x;
    var height = bounds.max.y - bounds.min.y;
    var margin = scene.margin;
    var area = regionOf(scene, region);
    var focal = Math.min(
      (area.width - 2 * margin) / width,
      (area.height - 2 * margin) / height
    );
    return {
      focal: focal,
      cx: area.x + area.width / 2 - ((bounds.min.x + bounds.max.x) / 2) * focal,
      cy: area.y + area.height / 2 - ((bounds.min.y + bounds.max.y) / 2) * focal,
      bounds: bounds,
      area: area
    };
  }

  function cameraFor(scene, fit, p, map) {
    var cam = cameraAt(scene, p);
    var scale = map ? map.scale : 1;
    return {
      phi: cam.phi,
      psi: cam.psi,
      distance: cam.distance,
      focal: fit.focal * scale,
      cx: (map ? map.dx : 0) + scale * fit.cx,
      cy: (map ? map.dy : 0) + scale * fit.cy,
      view: viewVectors(cam)
    };
  }

  function projectList(points, camera) {
    var out = [];
    for (var i = 0; i < points.length; i++) out.push(project(points[i], camera));
    return out;
  }

  function drawFor(scene, fit, theta, p, map) {
    var camera = cameraFor(scene, fit, p === undefined ? 0 : p, map);
    var shape = shapeAt(theta);
    var out = {};
    for (var name in shape) {
      if (Object.prototype.hasOwnProperty.call(shape, name)) {
        out[name] = projectList(shape[name], camera);
      }
    }
    out.crease = projectList([{ x: -HW, y: 0, z: 0 }, { x: HW, y: 0, z: 0 }], camera);
    out.hint = projectList([{ x: -HW, y: 0.4, z: 0 }, { x: HW, y: 0.4, z: 0 }], camera);
    out.theta = theta;
    out.shade = shadeAt(theta);
    out.camera = cameraAt(scene, p === undefined ? 0 : p);
    return out;
  }

  // Полный кадр сцены по прогрессу: камера, масштаб, контуры и служебные числа.
  // Четвёртый довод — готовый пресет (например, с адаптивным кадром): так один
  // и тот же кадр можно посчитать и для другой коробки, не меняя глобального
  // состояния.
  function sceneFrame(preset, p, map, sceneOverride) {
    var scene = sceneOverride || SCENES[preset];
    var fit = fitFor(scene);
    var frame = drawFor(scene, fit, thetaAt(p), p, map);
    frame.fit = fit;
    return frame;
  }

  function round1(value) {
    return Math.round(value * 10) / 10;
  }

  function pointsAttr(points) {
    var out = [];
    for (var i = 0; i < points.length; i++) {
      out.push(round1(points[i].x) + ',' + round1(points[i].y));
    }
    return out.join(' ');
  }

  function pathAttr(points) {
    var out = [];
    for (var i = 0; i < points.length; i++) {
      out.push((i ? 'L' : 'M') + round1(points[i].x) + ' ' + round1(points[i].y));
    }
    return out.join(' ');
  }

  /* --- 1.4 Печать заголовка в плоскости листа --------------------------- */

  // Плоскость листа переходит в кадр гомографией: локальные пиксели блока
  // (1 мм = K локальных px, начало — левый верхний угол блока) переводятся в
  // пиксели страницы. Три строки матрицы — числители координат и знаменатель,
  // то есть ровно та же перспективная проекция, что и у точек SVG.
  function paperMatrix(camera, fit, map, layout, k) {
    var unitPx = k || K;
    var scale = map ? map.scale : 1;
    var focal = fit.focal * scale;
    var offsetX = (map ? map.dx : 0) + scale * fit.cx;
    var offsetY = (map ? map.dy : 0) + scale * fit.cy;
    var view = viewVectors(camera);

    // Базис плоскости: локальный пиксель по x и по y в миллиметрах пространства.
    var ex = { x: 1 / unitPx, y: 0, z: 0 };
    var ez = { x: 0, y: 0, z: 1 / unitPx };
    var base = relative({ x: layout.x, y: 0, z: layout.z }, view.eye);

    function depthRow() {
      return [dot(ex, view.forward), dot(ez, view.forward), dot(base, view.forward)];
    }
    var w = depthRow();
    var rowX = [
      focal * dot(ex, view.right) + offsetX * w[0],
      focal * dot(ez, view.right) + offsetX * w[1],
      focal * dot(base, view.right) + offsetX * w[2]
    ];
    var rowY = [
      -focal * dot(ex, view.up) + offsetY * w[0],
      -focal * dot(ez, view.up) + offsetY * w[1],
      -focal * dot(base, view.up) + offsetY * w[2]
    ];

    var divisor = w[2] || 1;
    return {
      h11: rowX[0] / divisor, h12: rowX[1] / divisor, h13: rowX[2] / divisor,
      h21: rowY[0] / divisor, h22: rowY[1] / divisor, h23: rowY[2] / divisor,
      h31: w[0] / divisor, h32: w[1] / divisor, h33: 1
    };
  }

  // Применение гомографии к локальной точке: проверяется в Node и в браузере.
  function matrixApply(h, point) {
    var w = h.h31 * point.x + h.h32 * point.y + h.h33;
    if (!w) w = 1;
    return {
      x: (h.h11 * point.x + h.h12 * point.y + h.h13) / w,
      y: (h.h21 * point.x + h.h22 * point.y + h.h23) / w
    };
  }

  // Плоская гомография как CSS matrix3d: четвёртая строка — перспективные члены.
  // Округление до двенадцатого знака, а не до пятого: перспективные члены порядка
  // 1e-5, и грубое округление смещало бы дальние углы печатного блока на миллиметры.
  function matrixCss(h) {
    var values = [
      h.h11, h.h21, 0, h.h31,
      h.h12, h.h22, 0, h.h32,
      0, 0, 1, 0,
      h.h13, h.h23, 0, h.h33
    ].map(function (value) {
      return Math.round(value * 1e12) / 1e12;
    });
    return 'matrix3d(' + values.join(', ') + ')';
  }

  // Вписывание системы координат SVG в прямоугольник страницы: то же правило,
  // что у preserveAspectRatio="xMidYMid meet".
  function viewMap(box, vb) {
    var scale = Math.min(box.width / vb[2], box.height / vb[3]);
    return {
      scale: scale,
      dx: (box.width - vb[2] * scale) / 2,
      dy: (box.height - vb[3] * scale) / 2
    };
  }

  /* --- 1.4a Кадр по коробке --------------------------------------------- */

  // Сторона кадра в единицах системы координат. Пропорции берутся у коробки,
  // единицы произвольны: вписывание всё равно нормирует фокусное расстояние.
  var FRAME_BASE = 1000;

  function frameVb(scene, box) {
    if (!scene.adaptive) return scene.vb;
    var width = box ? box.width : 0;
    var height = box ? box.height : 0;
    if (!(width > 0) || !(height > 0)) return scene.vb;
    return [0, 0, FRAME_BASE, Math.round((FRAME_BASE * height) / width * 10) / 10];
  }

  // Тот же пресет, но с кадром под коробку: region, margin и дуга камеры
  // переезжают без изменений, меняется только система координат.
  function framedScene(scene, box) {
    var out = {};
    for (var key in scene) {
      if (Object.prototype.hasOwnProperty.call(scene, key)) out[key] = scene[key];
    }
    out.vb = frameVb(scene, box);
    return out;
  }

  /* --- 1.5 Прогресс и стадии ------------------------------------------- */

  function progressAt(scrollY, top, height, viewport) {
    var span = height - viewport;
    if (!(span > 0)) return 0;
    return clamp01((scrollY - top) / span);
  }

  function noteAt(p, edges) {
    var list = edges || NOTE_EDGES;
    if (!isFinite(p)) return 0;
    for (var i = 0; i < list.length; i++) {
      if (p < list[i]) return i;
    }
    return list.length;
  }

  // Середина отрезка прогресса, на котором видна стадия index. Нужна при
  // возвращении из статичного рассказа в закреплённую ленту прокрутки: встать
  // надо в середину, а не на границу, иначе соседняя стадия перекроет выбор.
  function progressForStage(index) {
    var list = NOTE_EDGES;
    var at = Math.round(index);
    if (!isFinite(at)) at = 0;
    if (at < 0) at = 0;
    if (at > list.length) at = list.length;
    var from = at <= 0 ? 0 : list[at - 1];
    var to = at >= list.length ? 1 : list[at];
    return clamp01((from + to) / 2);
  }

  function effectiveReduced(systemMatches, manual) {
    return systemMatches === true || manual === true;
  }

  function motionNote(systemMatches, manual) {
    if (systemMatches === true) return 'Движение уменьшено системной настройкой.';
    return manual === true ? 'Движение уменьшено вручную.' : 'Движение включено.';
  }

  function captionFor(folded) { return folded ? FOLDED_CAPTION : FLAT_CAPTION; }
  function labelFor(folded) { return folded ? 'Вернуть плоскость' : 'Показать сгиб'; }
  function toggleFold(current) { return current === 'folded' ? 'flat' : 'folded'; }
  function schemeAngle(state) { return state === 'folded' ? SCHEME_FOLDED : SCHEME_FLAT; }

  var API = {
    PAPER: PAPER,
    SCENES: SCENES,
    THETA_MAX: THETA_MAX,
    VEIL: VEIL,
    STAGE_P: STAGE_P,
    K: K,
    LIGHT: LIGHT,
    FRAME_ANGLES: FRAME_ANGLES,
    SCHEME_FLAT: SCHEME_FLAT,
    SCHEME_FOLDED: SCHEME_FOLDED,
    NOTE_EDGES: NOTE_EDGES,
    FLAT_CAPTION: FLAT_CAPTION,
    FOLDED_CAPTION: FOLDED_CAPTION,
    NEAR_FLAT: NEAR_FLAT,
    FAR_FLAT: FAR_FLAT,
    clamp01: clamp01,
    ease: ease,
    thetaAt: thetaAt,
    mix: mix,
    cameraAt: cameraAt,
    viewVectors: viewVectors,
    normalAt: normalAt,
    faceNormal: faceNormal,
    project: project,
    dot: dot,
    liftPoint: liftPoint,
    groundPoint: groundPoint,
    shapeAt: shapeAt,
    shadeAt: shadeAt,
    regionOf: regionOf,
    boundsFor: boundsFor,
    fitFor: fitFor,
    cameraFor: cameraFor,
    projectList: projectList,
    drawFor: drawFor,
    sceneFrame: sceneFrame,
    pointsAttr: pointsAttr,
    pathAttr: pathAttr,
    paperMatrix: paperMatrix,
    matrixApply: matrixApply,
    matrixCss: matrixCss,
    viewMap: viewMap,
    FRAME_BASE: FRAME_BASE,
    frameVb: frameVb,
    framedScene: framedScene,
    progressAt: progressAt,
    noteAt: noteAt,
    progressForStage: progressForStage,
    effectiveReduced: effectiveReduced,
    motionNote: motionNote,
    captionFor: captionFor,
    labelFor: labelFor,
    toggleFold: toggleFold,
    schemeAngle: schemeAngle
  };

  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    return;
  }

  /* ===== 2. Страница ==================================================== */

  var STORE_KEY = 'fold-line.motion.v2';
  var root = document.documentElement;
  var fold = document.querySelector('.fold');
  var stage = document.querySelector('[data-stage]');
  var sheet = document.querySelector('[data-sheet]');
  var header = document.querySelector('.top');
  var print = document.querySelector('[data-print]');
  var readout = document.querySelector('[data-readout]');
  var rule = document.querySelector('[data-rule]');
  var notes = Array.prototype.slice.call(document.querySelectorAll('[data-note]'));
  var sceneSvgs = Array.prototype.slice.call(document.querySelectorAll('[data-scene]'));
  // Слой печати и схема — разные элементы: выборки ограничены своей сценой,
  // иначе кадр сцены и схема перезаписывали бы контуры друг друга.
  var shapeNodes = stage ? Array.prototype.slice.call(stage.querySelectorAll('[data-shape]')) : [];
  var hintNodes = stage ? Array.prototype.slice.call(stage.querySelectorAll('[data-path="hint"]')) : [];
  var creaseNodes = stage ? Array.prototype.slice.call(stage.querySelectorAll('[data-path="crease"]')) : [];
  var motionToggle = document.getElementById('motion-toggle');
  var motionNoteEl = document.getElementById('motion-note');

  var manualReduced = readManual();
  var reduceQuery = mediaQuery('(prefers-reduced-motion: reduce)');
  var narrowQuery = mediaQuery('(max-width: 47.99rem)');

  var nextFrame = typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame.bind(window)
    : function (callback) { return window.setTimeout(callback, 16); };
  var nowMs = typeof window.performance !== 'undefined' && window.performance.now
    ? function () { return window.performance.now(); }
    : function () { return Date.now(); };

  var scene = {
    preset: 'stage', vb: SCENES.stage.vb, fit: null, theta: null, shade: null, map: null,
    live: false, lastP: null, frame: 0, metrics: null, note: -1,
    box: null, headerHeight: 0, printMatrix: null, region: null, stacked: null
  };

  function mediaQuery(text) {
    if (typeof window.matchMedia !== 'function') return { matches: false, addEventListener: null, addListener: null };
    return window.matchMedia(text);
  }

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

  function reducedNow() {
    return effectiveReduced(reduceQuery.matches, manualReduced);
  }

  /* --- 2.1 Режим движения ---------------------------------------------- */

  // Прокрутка без плавности: возврат места чтения не должен выглядеть
  // как движение самой сцены.
  function instantScroll(action) {
    var previous = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';
    action();
    document.documentElement.style.scrollBehavior = previous;
  }

  // Стадия, которую читают в статичном рассказе: ближайшая к линии внимания.
  // Линия взята ниже середины, потому что в закреплённой раскладке рассказ
  // стоит в нижней половине экрана — туда же попадает текст при переходе в
  // статичный рассказ. Линия удержания из switchMotion(), наоборот, выше
  // середины: разница линий и делает переход туда и обратно устойчивым.
  function readingStage() {
    var line = window.innerHeight * 0.62;
    var best = 0;
    var bestDistance = Infinity;
    for (var i = 0; i < notes.length; i++) {
      var rect = notes[i].getBoundingClientRect();
      var distance = Math.abs(rect.top - line);
      if (distance < bestDistance) { bestDistance = distance; best = i; }
    }
    return best;
  }

  // Смена режима перестраивает раскладку: в закреплённом виде лист занимает
  // несколько экранов, в статичном — это обычный блок, и рассказ съезжает.
  //
  // Из закреплённого в статичный место удерживается прямо: текст текущей
  // стадии остаётся на том же месте экрана. Обратно так нельзя — в ленте
  // прокрутки рассказа нет, и прокрутка ставится на середину отрезка той
  // стадии, которую читали, а не в начало и не в конец.
  function switchMotion() {
    var wasLive = scene.live;
    var anchor = wasLive && scene.note >= 0 ? notes[scene.note] : null;
    var anchorTop = anchor ? anchor.getBoundingClientRect().top : 0;
    var stageIndex = wasLive ? scene.note : readingStage();

    renderMotion();
    syncLiveMode(wasLive);
    syncScene();
    drawScheme(schemeTheta);

    if (wasLive) {
      if (!anchor || !anchor.isConnected) return;
      var delta = anchor.getBoundingClientRect().top - anchorTop;
      if (isFinite(delta) && Math.abs(delta) > 1) {
        instantScroll(function () { window.scrollBy(0, delta); });
      }
      return;
    }

    var metrics = scene.metrics || measure();
    if (!metrics || !(metrics.span > 0)) return;
    var target = metrics.top + progressForStage(stageIndex) * metrics.span;
    instantScroll(function () { window.scrollTo(0, target); });
  }

  function renderMotion() {
    var reduced = reducedNow();

    root.setAttribute('data-motion', reduced ? 'reduced' : 'auto');
    root.classList.add('js');

    if (motionToggle) {
      motionToggle.hidden = false;
      motionToggle.setAttribute('aria-pressed', reduced ? 'true' : 'false');
      // Системное предпочтение приоритетно: ручной переключатель его не отменяет.
      motionToggle.disabled = reduceQuery.matches;
    }

    if (motionNoteEl) {
      motionNoteEl.hidden = false;
      motionNoteEl.textContent = motionNote(reduceQuery.matches, manualReduced);
    }

    if (fold) {
      fold.classList.toggle('is-live', !reduced);
      fold.classList.toggle('is-static', reduced);
    }

    // В статичном рассказе стадии нет: все три состояния показаны подряд,
    // и «текущая» заметка была бы просто неправдой. Подсветка живёт только
    // в закреплённой ленте, где стадия выбирается по прогрессу.

  }

  /* --- 2.2 Сцена -------------------------------------------------------- */

  function measure() {
    if (!stage || !fold || !sheet) return null;
    // Шапка переносится на узком экране: высоту для липкого листа берём
    // из фактической геометрии, а не из предположения.
    if (header) {
      var headerHeight = Math.round(header.getBoundingClientRect().height);
      if (headerHeight > 0 && headerHeight !== scene.headerHeight) {
        scene.headerHeight = headerHeight;
        root.style.setProperty('--header-h', headerHeight + 'px');
      }
    }
    var rect = fold.getBoundingClientRect();
    var stageRect = stage.getBoundingClientRect();
    var sheetRect = sheet.getBoundingClientRect();
    scene.box = { width: sheetRect.width, height: sheetRect.height };
    scene.metrics = {
      top: rect.top + window.scrollY,
      span: Math.max(0, rect.height - stageRect.height)
    };
    return scene.metrics;
  }

  function currentProgress() {
    var metrics = scene.metrics || measure();
    if (!metrics || !scene.box) return 0;
    return progressAt(window.scrollY, metrics.top, metrics.span + scene.box.height, scene.box.height);
  }

  function setPoints(name, points) {
    var text = pointsAttr(points);
    for (var i = 0; i < shapeNodes.length; i++) {
      if (shapeNodes[i].getAttribute('data-shape') === name) shapeNodes[i].setAttribute('points', text);
    }
  }

  function setPath(list, points) {
    var text = pathAttr(points);
    for (var i = 0; i < list.length; i++) list[i].setAttribute('d', text);
  }

  function setOpacity(name, value) {
    var text = String(Math.round(clamp01(value) * 1000) / 1000);
    for (var i = 0; i < shapeNodes.length; i++) {
      if (shapeNodes[i].getAttribute('data-shape') === name) shapeNodes[i].setAttribute('opacity', text);
    }
  }

  function setPathOpacity(list, value) {
    var text = String(Math.round(clamp01(value) * 1000) / 1000);
    for (var i = 0; i < list.length; i++) list[i].setAttribute('opacity', text);
  }

  // Раскладка полосы рассказа. На узком экране и на всяком, где объект подходит
  // слишком близко, полоса встаёт под лист: текст никогда не ложится на бумагу.
  // Пресет у живой сцены один: разницу между закреплённой и подпёртой раскладкой
  // задаёт region, а не отдельная система координат.
  function resolveLayout() {
    var framed = framedScene(SCENES.stage, scene.box);
    var region = [0, 0, 1, 1];
    var barWidth = null;
    // В статичной раскладке полоса рассказа и так стоит под листом, а в закреплённой
    // на узком экране места слева заведомо нет: там лист идёт сверху во всю ширину.
    var stacked = narrowQuery.matches || !scene.live;

    if (!stacked && scene.box && scene.box.height > 0) {
      var map = viewMap(scene.box, framed.vb);
      var overlayFit = fitFor(framed, [0.4, 0, 1, 1]);
      var leftEdge = overlayFit.cx + overlayFit.focal * overlayFit.bounds.min.x;
      var sheetLeft = map.dx + map.scale * leftEdge;
      var pad = readLength('--pad', 20);
      var fontSize = readLength('font-size', 16, root);
      var free = sheetLeft - 2 * pad;
      if (free < 16 * fontSize) {
        stacked = true;
      } else {
        region = [0.4, 0, 1, 1];
        barWidth = Math.min(free, 34 * fontSize);
      }
    }
    return { preset: 'stage', stacked: stacked, region: region, barWidth: barWidth };
  }

  function readLength(name, fallback, node) {
    var value = parseFloat(getComputedStyle(node || root).getPropertyValue(name));
    return isFinite(value) ? value : fallback;
  }

  function applyLayout() {
    var layout = resolveLayout();
    if (scene.stacked !== layout.stacked) {
      scene.stacked = layout.stacked;
      // Смена раскладки меняет саму коробку листа: она будет измерена заново.
      scene.map = null;
      scene.box = null;
      scene.lastP = null;
    }
    scene.preset = layout.preset;
    scene.region = layout.region;

    if (fold) fold.classList.toggle('is-stacked', layout.stacked);
    if (stage) {
      if (layout.barWidth) stage.style.setProperty('--bar-w', Math.round(layout.barWidth) + 'px');
      else stage.style.removeProperty('--bar-w');
    }
  }

  // Кадр, вписывание и карта считаются вместе: все три зависят от коробки.
  // Вызывается после каждого изменения коробки и раскладки.
  function refit() {
    scene.vb = frameVb(SCENES[scene.preset], scene.box);
    for (var i = 0; i < sceneSvgs.length; i++) {
      sceneSvgs[i].setAttribute('viewBox', scene.vb.join(' '));
    }
    scene.fit = fitFor(framedScene(SCENES[scene.preset], scene.box), scene.region);
    scene.map = viewMap(scene.box || { width: 0, height: 0 }, scene.vb);
  }

  function drawStage(p) {
    var sceneData = SCENES[scene.preset];
    // Кадр рисуется в координатах viewBox: вписывание в коробку делает сам SVG
    // (preserveAspectRatio). Карта нужна только печатному блоку, это HTML.
    var camera = cameraFor(sceneData, scene.fit, p, null);
    var theta = thetaAt(p);
    var shape = shapeAt(theta);

    setPoints('near', projectList(shape.near, camera));
    setPoints('nearShadow', projectList(shape.nearShadow, camera));
    setPoints('lift', projectList(shape.lift, camera));
    setPoints('liftShade', projectList(shape.lift, camera));
    setPoints('edge', projectList(shape.edge, camera));
    setPoints('shadow', projectList(shape.shadow, camera));
    setPoints('ghost', projectList(shape.ghost, camera));
    setPath(creaseNodes, projectList([{ x: -HW, y: 0, z: 0 }, { x: HW, y: 0, z: 0 }], camera));
    setPath(hintNodes, projectList([{ x: -HW, y: 0.4, z: 0 }, { x: HW, y: 0.4, z: 0 }], camera));

    setOpacity('liftShade', shadeAt(theta) * VEIL);
    setOpacity('ghost', 1 - clamp01(theta / 26));
    setOpacity('shadow', 0.22);
    setOpacity('nearShadow', 0.5);
    setPathOpacity(hintNodes, 1 - clamp01(theta / 30));

    scene.theta = theta;
    scene.shade = shadeAt(theta);
  }

  function drawPrint(p) {
    if (!print) return;
    var sceneData = SCENES[scene.preset];
    if (!sceneData.print) return;
    var camera = cameraAt(sceneData, p);
    var matrix = paperMatrix(camera, scene.fit, scene.map, sceneData.print, K);
    print.style.transform = matrixCss(matrix);
    scene.printMatrix = matrix;
  }

  function drawChrome(p, theta) {
    if (stage) stage.style.setProperty('--p', String(Math.round(p * 1000) / 1000));
    if (readout) readout.textContent = Math.round(theta) + '°';
    if (rule) rule.style.transform = 'scaleX(' + Math.round(p * 1000) / 1000 + ')';
    // Стадия существует только в закреплённой ленте: в статичном рассказе все
    // три состояния показаны подряд, и «текущей» заметки нет — иначе средняя
    // заметка помечалась бы текущей просто по положению кадра в покое.
    var index = scene.live ? noteAt(p) : -1;
    if (index !== scene.note) {
      scene.note = index;
      for (var i = 0; i < notes.length; i++) {
        var active = i === index;
        notes[i].classList.toggle('is-current', active);
        if (active) notes[i].setAttribute('aria-current', 'true');
        else notes[i].removeAttribute('aria-current');
      }
    }
  }

  // Коробка листа — общая система координат для SVG и печатного блока. Её размер
  // мог измениться не только от resize: например, от перестройки раскладки или от
  // переноса шапки. Проверяем перед каждым кадром, иначе карта устареет и печать
  // съедет с листа на несколько пикселей.
  function refreshBox() {
    if (!sheet) return;
    var width = sheet.clientWidth;
    var height = sheet.clientHeight;
    if (width <= 0 || height <= 0 || !scene.fit) {
      // Коробка может быть ещё не измерена (скрыта, нулевая, до первой
      // расстановки). Кадр и вписывание нужны всегда, иначе первый же
      // кадр обратится к пустому вписыванию.
      refit();
      if (width <= 0 || height <= 0) return;
    }
    if (scene.box && scene.box.width === width && scene.box.height === height) return;
    scene.box = { width: width, height: height };
    refit();
  }

  function render(p) {
    if (!scene.map) {
      scene.map = viewMap(scene.box || { width: 0, height: 0 }, scene.vb);
    }
    drawStage(p);
    drawPrint(p);
    drawChrome(p, thetaAt(p));
    if (stage) stage.dataset.debug = 'map=' + scene.map.scale + ' box=' + JSON.stringify(scene.box) + ' fit=' + scene.fit.focal;
  }

  function schedule() {
    if (scene.frame) return;
    scene.frame = nextFrame(function () {
      scene.frame = 0;
      if (!scene.live) return;
      refreshBox();
      render(currentProgress());
    });
  }

  function onScroll() {
    if (!scene.live) return;
    var p = currentProgress();
    if (scene.lastP !== null && Math.abs(p - scene.lastP) < 0.0004) return;
    scene.lastP = p;
    schedule();
  }

  function syncScene() {
    measure();
    scene.map = null;
    // applyLayout может изменить раскладку (класс is-stacked, ширина полосы),
    // поэтому замер повторяется, а карта сбрасывается уже после этого.
    applyLayout();
    scene.box = null;
    refreshBox();
    if (scene.live) {
      render(currentProgress());
    } else {
      scene.lastP = null;
      render(STAGE_P);
    }
  }

  /* --- 2.3 Схема сгиба -------------------------------------------------- */

  var scheme = document.getElementById('scheme');
  var foldButton = document.getElementById('fold-btn');
  var schemeCaption = document.getElementById('scheme-caption');
  var schemeData = SCENES.scheme;
  var schemeFit = fitFor(schemeData);
  var schemeState = 'flat';
  var schemeTheta = SCHEME_FLAT;
  var schemeFrame = 0;

  function drawScheme(theta) {
    if (!scheme) return;
    var camera = cameraFor(schemeData, schemeFit, 0, null);
    var shape = shapeAt(theta);
    var nodes = scheme.querySelectorAll('[data-shape]');
    for (var i = 0; i < nodes.length; i++) {
      var name = nodes[i].getAttribute('data-shape');
      if (shape[name]) nodes[i].setAttribute('points', pointsAttr(projectList(shape[name], camera)));
    }
    var creases = scheme.querySelectorAll('[data-path="crease"]');
    var line = projectList([{ x: -HW, y: 0, z: 0 }, { x: HW, y: 0, z: 0 }], camera);
    for (var j = 0; j < creases.length; j++) creases[j].setAttribute('d', pathAttr(line));

    var hints = scheme.querySelectorAll('[data-path="hint"]');
    var hintValue = 1 - clamp01(theta / 30);
    for (var k = 0; k < hints.length; k++) hints[k].setAttribute('opacity', String(Math.round(hintValue * 1000) / 1000));

    var shade = scheme.querySelector('[data-shape="liftShade"]');
    if (shade) shade.setAttribute('opacity', String(Math.round(shadeAt(theta) * VEIL * 1000) / 1000));
    var ghost = scheme.querySelector('[data-shape="ghost"]');
    if (ghost) ghost.setAttribute('opacity', String(Math.round((1 - clamp01(theta / 26)) * 1000) / 1000));
  }

  function tweenScheme(target) {
    if (schemeFrame) {
      if (window.cancelAnimationFrame) window.cancelAnimationFrame(schemeFrame);
      else window.clearTimeout(schemeFrame);
      schemeFrame = 0;
    }
    var from = schemeTheta;
    // В уменьшенном режиме состояния схемы меняются мгновенно.
    if (reducedNow() || typeof window.requestAnimationFrame !== 'function' || from === target) {
      schemeTheta = target;
      drawScheme(target);
      return;
    }
    var started = nowMs();
    var duration = 520;
    var step = function () {
      var t = clamp01((nowMs() - started) / duration);
      schemeTheta = from + (target - from) * ease(t);
      drawScheme(schemeTheta);
      if (t < 1) { schemeFrame = nextFrame(step); return; }
      schemeFrame = 0;
      schemeTheta = target;
    };
    schemeFrame = nextFrame(step);
  }

  if (scheme && foldButton) {
    // Базовая разметка скрывает кнопку: без скрипта она была бы неработающей.
    foldButton.hidden = false;
    foldButton.addEventListener('click', function () {
      schemeState = toggleFold(schemeState);
      var folded = schemeState === 'folded';
      scheme.setAttribute('data-fold', schemeState);
      foldButton.textContent = labelFor(folded);
      if (schemeCaption) schemeCaption.textContent = captionFor(folded);
      tweenScheme(schemeAngle(schemeState));
    });
  }

  /* --- 2.4 Запуск ------------------------------------------------------- */

  function syncLiveMode(wasLive) {
    var live = !reducedNow();
    if (wasLive !== live) {
      scene.live = live;
      scene.lastP = null;
      scene.map = null;
    }
  }

  scene.live = !reducedNow();

  if (motionToggle) {
    motionToggle.addEventListener('click', function () {
      manualReduced = !manualReduced;
      saveManual(manualReduced);
      switchMotion();
    });
  }

  function onSystemMotionChange() {
    switchMotion();
  }

  if (typeof reduceQuery.addEventListener === 'function') {
    reduceQuery.addEventListener('change', onSystemMotionChange);
  } else if (typeof reduceQuery.addListener === 'function') {
    reduceQuery.addListener(onSystemMotionChange);
  }

  var resizeTimer = 0;
  function onResize() {
    if (resizeTimer) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      resizeTimer = 0;
      syncScene();
    }, 120);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('load', syncScene);

  renderMotion();
  drawScheme(schemeTheta);
  syncScene();
})();
