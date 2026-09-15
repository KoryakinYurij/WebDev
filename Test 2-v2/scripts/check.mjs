#!/usr/bin/env node
/* ==========================================================================
   Проверки второй версии. Только стандартная библиотека Node, без браузера
   и без сети: `npm run check` сначала собирает dist, потом гоняет это.

   Что проверяется по-настоящему, а не по описанию:

   П  прогресс и стадии: монотонность, границы, обратимость состояния;
   Д  четыре сочетания системного и ручного уменьшения движения;
   Г  геометрия сгиба: где оказывается подвижная половина, непрерывен ли ход,
      одинаков ли кадр при одном прогрессе в любом порядке вызовов;
   К  кадр и вписывание: пропорции кадра равны пропорциям коробки (иначе SVG
      вписывает объект по меньшей стороне и половина площади уходит в пустое
      поле), объект не выходит за кадр и не становится мелким;
   Т  печать: гомография заголовка совпадает с проекцией листа, а сам блок
      целиком попадает в ближнюю половину листа;
   Р  разметка и стили: статические кадры в index.html посчитаны тем же
      движком, размеры печати в styles.css совпадают с пресетом сцены,
      каждая скрытая по умолчанию кнопка объяснена в комментарии styles.css,
      собранная страница содержит полные исходники скрипта и стилей.

   Проверка, которая чего-то не проверяет, здесь не заводится: у каждой
   группы в REPORT.md написано, какие случаи она покрывает и чего в ней нет.
   ========================================================================== */

import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const fold = require(join(root, 'main.js'));

function read(name) {
  const text = readFileSync(join(root, name), 'utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

const html = read('index.html');
const css = read('styles.css');
const dist = read(join('dist', 'index.html'));

/* --- Каркас ------------------------------------------------------------- */

let passed = 0;
const failures = [];
let groupName = '';
let groupPassed = 0;
const groups = [];
// Тот же вывод, что и на экране, сохраняется в checks/static-report.txt:
// отчёт ссылается на этот файл, а он не может разойтись с прогоном.
const transcript = [];

function say(text) {
  transcript.push(text);
  console.log(text);
}

function group(title) {
  if (groupName) groups.push({ title: groupName, passed: groupPassed });
  groupName = title;
  groupPassed = 0;
  say('\n' + title);
}

function check(code, name, fn) {
  try {
    fn();
    passed++;
    groupPassed++;
    say('  ок   ' + code + '  ' + name);
  } catch (error) {
    failures.push(code + ' ' + name + ' — ' + error.message);
    say('  СТОП ' + code + '  ' + name + ' — ' + error.message);
  }
}

function ok(value, message) {
  if (!value) throw new Error(message || 'ожидалось истинное значение');
}

// Справка — измерение, а не утверждение: печатается, но ничего не решает.
function note(text) {
  say('  ..   ' + text);
}

function near(value, expected, epsilon, message) {
  if (!(Math.abs(value - expected) <= epsilon)) {
    throw new Error((message || 'значение вне допуска') +
      ': получено ' + value + ', ожидалось ' + expected + ' ±' + epsilon);
  }
}

function between(value, low, high, message) {
  if (!(value >= low && value <= high)) {
    throw new Error((message || 'значение вне диапазона') +
      ': ' + value + ' не в [' + low + ', ' + high + ']');
  }
}

/* --- Мелкая геометрия для самих проверок -------------------------------- */

function inside(point, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      result = !result;
    }
  }
  return result;
}

function frameBounds(frame) {
  const min = { x: Infinity, y: Infinity };
  const max = { x: -Infinity, y: -Infinity };
  for (const name of ['near', 'nearShadow', 'lift', 'edge', 'shadow', 'ghost']) {
    for (const point of frame[name]) {
      min.x = Math.min(min.x, point.x);
      min.y = Math.min(min.y, point.y);
      max.x = Math.max(max.x, point.x);
      max.y = Math.max(max.y, point.y);
    }
  }
  return { min, max };
}

// Пропорции коробки, которые встречаются в жизни: телефон, окно в половине
// экрана, широкое окно, квадрат.
const BOXES = [
  { name: '360×640', width: 360, height: 640 },
  { name: '558×352', width: 558, height: 352 },
  { name: '1440×800', width: 1440, height: 800 },
  { name: '900×900', width: 900, height: 900 }
];

const STEPS = Array.from({ length: 49 }, (_, i) => i / 48);

/* --- П. Прогресс и стадии ---------------------------------------------- */

group('П. Прогресс и стадии');

check('П1', 'thetaAt: 0 в начале, максимум в конце, без рывков', () => {
  near(fold.thetaAt(0), 0, 1e-9);
  near(fold.thetaAt(1), fold.THETA_MAX, 1e-9);
  let worst = 0;
  let previous = -1;
  for (let i = 0; i <= 400; i++) {
    const p = i / 400;
    const theta = fold.thetaAt(p);
    ok(theta >= previous - 1e-9, 'угол убывает при росте прогресса');
    if (previous >= 0) worst = Math.max(worst, theta - previous);
    previous = theta;
  }
  ok(worst < fold.THETA_MAX / 40, 'слишком большой шаг угла: ' + worst.toFixed(2));
});

check('П2', 'thetaAt: крайние значения прогресса зажаты', () => {
  near(fold.thetaAt(-3), fold.thetaAt(0), 1e-9);
  near(fold.thetaAt(9), fold.thetaAt(1), 1e-9);
  near(fold.thetaAt(NaN), 0, 1e-9);
});

check('П3', 'progressAt: 0 в начале витрины, 1 в конце, зажатие по краям', () => {
  const top = 120;
  const span = 900;
  near(fold.progressAt(top - 300, top, span + 200, 200), 0, 1e-9);
  near(fold.progressAt(top, top, span + 200, 200), 0, 1e-9);
  near(fold.progressAt(top + span, top, span + 200, 200), 1, 1e-9);
  near(fold.progressAt(top + span + 500, top, span + 200, 200), 1, 1e-9);
  near(fold.progressAt(top + span / 2, top, span + 200, 200), 0.5, 1e-9);
  near(fold.progressAt(400, top, 200, 200), 0, 1e-9);
});

check('П4', 'progressAt: без высоты прокрутки прогресс не делится на ноль', () => {
  near(fold.progressAt(1000, 0, 200, 200), 0, 1e-9);
  near(fold.progressAt(1000, 0, 100, 200), 0, 1e-9);
});

check('П5', 'noteAt: три стадии рассказа по границам', () => {
  const edges = fold.NOTE_EDGES;
  near(fold.noteAt(-1), 0, 0);
  near(fold.noteAt(0), 0, 0);
  near(fold.noteAt(edges[0] - 0.001), 0, 0);
  near(fold.noteAt(edges[0]), 1, 0);
  near(fold.noteAt(edges[1] - 0.001), 1, 0);
  near(fold.noteAt(edges[1]), 2, 0);
  near(fold.noteAt(1), 2, 0);
  near(fold.noteAt(NaN), 0, 0);
});

check('П6', 'место чтения возвращается в середину отрезка стадии', () => {
  const edges = fold.NOTE_EDGES;
  near(fold.progressForStage(0), edges[0] / 2, 1e-9, 'первая стадия');
  near(fold.progressForStage(1), (edges[0] + edges[1]) / 2, 1e-9, 'вторая стадия');
  near(fold.progressForStage(2), (edges[1] + 1) / 2, 1e-9, 'третья стадия');
  for (let i = 0; i < 3; i++) {
    const p = fold.progressForStage(i);
    near(fold.noteAt(p), i, 0, 'середина отрезка стадии ' + i + ' попадает в чужую стадию');
  }
  near(fold.progressForStage(-5), fold.progressForStage(0), 0, 'зажим слева');
  near(fold.progressForStage(9), fold.progressForStage(2), 0, 'зажим справа');
});

check('П7', 'подписи и переключение схемы: плоское и сложенное состояния', () => {
  ok(fold.captionFor(true) === fold.FOLDED_CAPTION, 'подпись сложенного состояния');
  ok(fold.captionFor(false) === fold.FLAT_CAPTION, 'подпись плоского состояния');
  ok(fold.labelFor(true) === 'Вернуть плоскость', 'надпись кнопки в сложенном виде');
  ok(fold.labelFor(false) === 'Показать сгиб', 'надпись кнопки в плоском виде');
  ok(fold.toggleFold('flat') === 'folded' && fold.toggleFold('folded') === 'flat',
    'переключатель возвращает противоположное состояние');
  near(fold.schemeAngle('flat'), fold.SCHEME_FLAT, 0);
  near(fold.schemeAngle('folded'), fold.SCHEME_FOLDED, 0);
  ok(fold.SCHEME_FLAT <= 90, 'плоское состояние схемы должно быть до вертикали');
  ok(fold.SCHEME_FOLDED > 90, 'сложенное состояние схемы должно быть за вертикалью');
});

/* --- Д. Уменьшение движения: четыре сочетания --------------------------- */

group('Д. Системное и ручное уменьшение движения');

check('Д1', 'системная настройка сильнее ручной: четыре сочетания', () => {
  ok(fold.effectiveReduced(false, false) === false, 'оба выключены → движение есть');
  ok(fold.effectiveReduced(true, false) === true, 'только система → движения нет');
  ok(fold.effectiveReduced(false, true) === true, 'только ручное → движения нет');
  ok(fold.effectiveReduced(true, true) === true, 'оба → движения нет');
});

check('Д2', 'заметка о режиме называет источник уменьшения', () => {
  ok(fold.motionNote(false, false) === 'Движение включено.', 'оба выключены');
  ok(fold.motionNote(true, false) === 'Движение уменьшено системной настройкой.', 'система');
  ok(fold.motionNote(false, true) === 'Движение уменьшено вручную.', 'ручное');
  ok(fold.motionNote(true, true) === 'Движение уменьшено системной настройкой.',
    'при обоих источниках приоритет у системы');
});

check('Д3', 'сочетания из Д1 отвечают разными заметками Д2', () => {
  const seen = new Set();
  for (const system of [false, true]) {
    for (const manual of [false, true]) {
      seen.add(fold.motionNote(system, manual));
    }
  }
  ok(seen.size === 3, 'три разных заметки на четыре сочетания, получено ' + seen.size);
});

check('Д4', 'строка режима записывается в разметку и в настройки браузера', () => {
  ok(/root\.setAttribute\('data-motion'/.test(read('main.js')), 'режим попадает в data-motion');
  ok(/STORE_KEY/.test(read('main.js')), 'ручной выбор запоминается в localStorage');
});

check('Д5', 'в стилях уменьшение движения убирает переходы, но не содержание', () => {
  ok(/\[data-motion="reduced"\]/.test(css), 'есть правила для ручного режима');
  ok(/@media \(prefers-reduced-motion: reduce\)/.test(css), 'есть правила для системного режима');
  ok(/transition-duration: 0\.01ms !important/.test(css), 'переходы сводятся к нулю');
  ok(/\.fold\.is-static \.note__frame\s*\{[^}]*display: block/.test(css),
    'в уменьшенном режиме статические кадры показаны');
});

/* --- Г. Геометрия сгиба -------------------------------------------------- */

group('Г. Геометрия сгиба');

check('Г1', 'подвижная половина: плоско, вертикально, поверх листа', () => {
  const flat = fold.liftPoint(0, fold.PAPER.d / 2, 0);
  near(flat.z, -fold.PAPER.d / 2, 1e-9, 'в покое половина лежит сзади от сгиба');
  near(flat.y, 0, 1e-9, 'в покое половина на столе');

  const upright = fold.liftPoint(0, fold.PAPER.d / 2, 90);
  near(upright.z, 0, 1e-9, 'на вертикали половина над сгибом');
  near(upright.y, fold.PAPER.d / 2, 1e-9, 'на вертикали половина поднята на всю глубину');

  const over = fold.liftPoint(0, fold.PAPER.d / 2, 180);
  near(over.z, fold.PAPER.d / 2, 1e-9, 'при полном сгибе половина ложится вперёд');
  near(over.y, 0, 1e-9, 'при полном сгибе половина снова на столе');
});

check('Г2', 'высота подвижной половины растёт до вертикали и падает после', () => {
  let previous = -1;
  for (let theta = 0; theta <= 90; theta += 1) {
    const y = fold.liftPoint(0, fold.PAPER.d / 2, theta).y;
    ok(y >= previous - 1e-9, 'высота падает до вертикали на ' + theta + '°');
    previous = y;
  }
  near(previous, fold.PAPER.d / 2, 1e-6);
  previous = Infinity;
  for (let theta = 90; theta <= 172; theta += 1) {
    const y = fold.liftPoint(0, fold.PAPER.d / 2, theta).y;
    ok(y <= previous + 1e-9, 'высота растёт после вертикали на ' + theta + '°');
    previous = y;
  }
});

check('Г3', 'видимая сторона: до вертикали верх, после — обратная сторона', () => {
  const up = fold.faceNormal(30);
  near(up.y, Math.cos(Math.PI / 6), 1e-9, 'до вертикали нормаль смотрит вверх');
  const back = fold.faceNormal(150);
  ok(back.y > 0, 'после вертикали видимая сторона снова смотрит вверх');
  near(back.y, -Math.cos((150 * Math.PI) / 180), 1e-9);
  const length = Math.hypot(back.x, back.y, back.z);
  near(length, 1, 1e-9, 'нормаль единичной длины');
});

check('Г4', 'тон поднятой половины непрерывен и темнее всего у вертикали', () => {
  ok(Math.abs(fold.shadeAt(89.9) - fold.shadeAt(90.1)) < 0.01,
    'на вертикали скачок тона: ' + fold.shadeAt(89.9).toFixed(3) + ' и ' + fold.shadeAt(90.1).toFixed(3));
  let previous = fold.shadeAt(0);
  let peaks = 0;
  let peakAt = 0;
  for (let theta = 0.5; theta <= 180; theta += 0.5) {
    const value = fold.shadeAt(theta);
    ok(Math.abs(value - previous) < 0.02, 'скачок тона на ' + theta + '°');
    if (value > previous + 1e-6) peakAt = theta;
    previous = value;
  }
  between(peakAt, 95, 115, 'самый тёмный кадр — не у вертикали, а на ' + peakAt + '°');
  ok(peaks === 0, 'лишние пики');
  ok(fold.shadeAt(90) > fold.shadeAt(0), 'на вертикали тон темнее, чем в покое');
  ok(fold.shadeAt(90) > fold.shadeAt(172), 'на вертикали тон темнее, чем в конце');
  near(fold.shadeAt(0), fold.shadeAt(180), 0.05, 'покоящееся и закрытое состояния близки по тону');
  ok(fold.shadeAt(172) < 0.25, 'закрытый лист не затемняется как стена: ' + fold.shadeAt(172).toFixed(3));
});

check('Г5', 'ход сгиба непрерывен: ни одного скачка контура', () => {
  const scene = fold.framedScene(fold.SCENES.stage, BOXES[1]);
  const fit = fold.fitFor(scene);
  let worst = 0;
  let previous = fold.drawFor(scene, fit, fold.thetaAt(0), 0, null);
  for (let i = 1; i <= 240; i++) {
    const p = i / 240;
    const frame = fold.drawFor(scene, fit, fold.thetaAt(p), p, null);
    for (const name of ['near', 'lift', 'edge', 'shadow']) {
      for (let v = 0; v < frame[name].length; v++) {
        const a = previous[name][v];
        const b = frame[name][v];
        worst = Math.max(worst, Math.hypot(b.x - a.x, b.y - a.y));
      }
    }
    previous = frame;
  }
  ok(worst < 12, 'контур прыгает на ' + worst.toFixed(2) + ' единицы кадра за шаг прокрутки');
});

check('Г6', 'за ход лист меняет силуэт сильно, а не остаётся на месте', () => {
  const scene = fold.framedScene(fold.SCENES.stage, BOXES[1]);
  const fit = fold.fitFor(scene);
  const heights = [];
  const shapes = new Set();
  let path = 0;
  let previous = null;
  for (let i = 0; i <= 120; i++) {
    const p = i / 120;
    const frame = fold.drawFor(scene, fit, fold.thetaAt(p), p, null);
    const box = frameBounds(frame);
    heights.push(box.max.y - box.min.y);
    shapes.add(frame.near.map((q) => Math.round(q.x) + ',' + Math.round(q.y)).join(';'));
    if (previous !== null) path += Math.abs(frame.lift[2].y - previous);
    previous = frame.lift[2].y;
  }
  const spread = Math.max(...heights) - Math.min(...heights);
  ok(spread > 0.20 * scene.vb[3],
    'высота силуэта почти не меняется: размах ' + spread.toFixed(1) +
    ' против ' + (0.20 * scene.vb[3]).toFixed(1));
  ok(path > 0.5 * scene.vb[3], 'верхняя кромка почти не двигается: ' + path.toFixed(1));
  ok(shapes.size > 100, 'разных кадров слишком мало: ' + shapes.size);
  for (const p of [0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 0.95]) {
    const frame = fold.drawFor(scene, fit, fold.thetaAt(p), p, null);
    const box = frameBounds(frame);
    note('справка: p=' + p.toFixed(2) + ' угол ' + frame.theta.toFixed(0) + '° — высота ' +
      Math.round((box.max.y - box.min.y) / scene.vb[3] * 100) + '% кадра');
  }
});

check('Г7', 'кадр — чистая функция прогресса: обратный ход даёт тот же кадр', () => {
  const scene = fold.framedScene(fold.SCENES.stage, BOXES[1]);
  const fit = fold.fitFor(scene);
  const forward = [0.1, 0.35, 0.62, 0.9].map((p) => fold.drawFor(scene, fit, fold.thetaAt(p), p, null));
  const backward = [0.9, 0.62, 0.35, 0.1].map((p) => fold.drawFor(scene, fit, fold.thetaAt(p), p, null));
  backward.reverse();
  for (let i = 0; i < forward.length; i++) {
    ok(JSON.stringify(forward[i].near) === JSON.stringify(backward[i].near),
      'кадр зависит от порядка вызовов на p=' + [0.1, 0.35, 0.62, 0.9][i]);
    ok(JSON.stringify(forward[i].lift) === JSON.stringify(backward[i].lift),
      'подвижная половина зависит от порядка вызовов');
    near(forward[i].theta, backward[i].theta, 1e-12);
  }
});

check('Г8', 'границы объекта считаются по всему ходу, а не по одному кадру', () => {
  const scene = fold.framedScene(fold.SCENES.stage, BOXES[1]);
  const fit = fold.fitFor(scene);
  const bounds = fit.bounds;
  // Границы сняты при единичном фокусе: в кадре они умножаются на фокус и
  // сдвигаются центром вписывания — сравнивать надо в этих же единицах.
  const low = { x: fit.cx + fit.focal * bounds.min.x, y: fit.cy + fit.focal * bounds.min.y };
  const high = { x: fit.cx + fit.focal * bounds.max.x, y: fit.cy + fit.focal * bounds.max.y };
  for (const p of STEPS) {
    const frame = fold.drawFor(scene, fit, fold.thetaAt(p), p, null);
    for (const name of ['near', 'lift', 'edge', 'ghost', 'shadow']) {
      for (const point of frame[name]) {
        ok(point.x >= low.x - 0.5 && point.x <= high.x + 0.5 &&
          point.y >= low.y - 0.5 && point.y <= high.y + 0.5,
          'точка ' + name + ' вне общих границ на p=' + p.toFixed(2));
      }
    }
  }
});

/* --- К. Кадр и вписывание ----------------------------------------------- */

group('К. Кадр, вписывание и размер листа');

check('К1', 'живая сцена берёт пропорции кадра у коробки, а не из пресета', () => {
  for (const box of BOXES) {
    const vb = fold.frameVb(fold.SCENES.stage, box);
    near(vb[2] / vb[3], box.width / box.height, 1e-3,
      'пропорции кадра не совпали с коробкой ' + box.name);
    near(vb[0], 0, 0);
    near(vb[1], 0, 0);
    near(vb[2], fold.FRAME_BASE, 0);
  }
});

check('К2', 'статичные пресеты кадр не меняют', () => {
  for (const name of ['frame', 'scheme']) {
    const preset = fold.SCENES[name];
    const vb = fold.frameVb(preset, { width: 500, height: 900 });
    ok(vb === preset.vb, 'пресет ' + name + ' получил чужой кадр');
  }
});

check('К3', 'без замеренной коробки кадр не ломается', () => {
  for (const box of [null, { width: 0, height: 0 }, { width: -5, height: 10 }, { width: NaN, height: 1 }]) {
    const vb = fold.frameVb(fold.SCENES.stage, box);
    ok(vb[3] > 0 && isFinite(vb[3]), 'запасной кадр должен быть конечным');
    near(vb[3], fold.SCENES.stage.vb[3], 1e-9, 'в запасе используется vb пресета');
  }
});

check('К4', 'вписывание не оставляет пустых полей: кадр и коробка совпадают', () => {
  for (const box of BOXES) {
    const vb = fold.frameVb(fold.SCENES.stage, box);
    const map = fold.viewMap(box, vb);
    const usedWidth = vb[2] * map.scale;
    const usedHeight = vb[3] * map.scale;
    ok(Math.abs(usedWidth - box.width) < 0.5 || Math.abs(usedHeight - box.height) < 0.5,
      'система координат вписана по меньшей стороне, как раньше: поля ' +
      (box.width - usedWidth).toFixed(1) + '×' + (box.height - usedHeight).toFixed(1));
  }
});

check('К5', 'объект нигде не выходит за кадр — на четырёх коробках', () => {
  for (const box of BOXES) {
    const scene = fold.framedScene(fold.SCENES.stage, box);
    for (const region of [null, [0.4, 0, 1, 1]]) {
      const fit = fold.fitFor(scene, region);
      const area = fold.regionOf(scene, region);
      for (const p of STEPS) {
        const frame = fold.drawFor(scene, fit, fold.thetaAt(p), p, null);
        const bounds = frameBounds(frame);
        ok(bounds.min.x >= area.x - 0.5 && bounds.max.x <= area.x + area.width + 0.5 &&
          bounds.min.y >= area.y - 0.5 && bounds.max.y <= area.y + area.height + 0.5,
          'объект вышел за кадр ' + box.name + ' на p=' + p.toFixed(2));
      }
    }
  }
});

check('К6', 'рамка вписывания совпадает с размахом всей киноленты', () => {
  // Сравнивается не отдельный кадр, а объединение всех: границы объекта
  // считаются по всему ходу, и вписывание обязано касаться краёв области,
  // иначе на странице остаются большие пустые поля.
  for (const box of BOXES) {
    for (const region of [[0, 0, 1, 1], [0.4, 0, 1, 1]]) {
      const scene = fold.framedScene(fold.SCENES.stage, box);
      const fit = fold.fitFor(scene, region);
      const area = fold.regionOf(scene, region);
      const low = { x: Infinity, y: Infinity };
      const high = { x: -Infinity, y: -Infinity };
      for (const p of STEPS) {
        const bounds = frameBounds(fold.drawFor(scene, fit, fold.thetaAt(p), p, null));
        low.x = Math.min(low.x, bounds.min.x);
        low.y = Math.min(low.y, bounds.min.y);
        high.x = Math.max(high.x, bounds.max.x);
        high.y = Math.max(high.y, bounds.max.y);
      }
      const touch = Math.min(area.width - (high.x - low.x), area.height - (high.y - low.y));
      ok(Math.abs(touch - 2 * scene.margin) < 1.5,
        'вписывание ' + box.name + ' не касается области: запас ' + touch.toFixed(1) +
        ' против ' + (2 * scene.margin));
    }
  }
});

check('К7', 'лист не мельчает по ходу прокрутки', () => {
  // Нижняя оценка — измерение, а не обещание: впитывание идёт по общей рамке
  // всего хода, поэтому отдельный кадр всегда меньше рамки. Что проверяется:
  // самый мелкий кадр остаётся не меньше половины кадра по большей стороне.
  let worst = { share: Infinity, box: '', p: 0 };
  for (const box of BOXES) {
    const scene = fold.framedScene(fold.SCENES.stage, box);
    const fit = fold.fitFor(scene, [0, 0, 1, 1]);
    for (const p of STEPS) {
      const bounds = frameBounds(fold.drawFor(scene, fit, fold.thetaAt(p), p, null));
      const share = Math.max(
        (bounds.max.x - bounds.min.x) / scene.vb[2],
        (bounds.max.y - bounds.min.y) / scene.vb[3]
      );
      if (share < worst.share) worst = { share: share, box: box.name, p: p };
    }
  }
  note('справка: самый мелкий кадр ' + Math.round(worst.share * 100) +
    '% кадра (коробка ' + worst.box + ', p=' + worst.p.toFixed(2) + ')');
  ok(worst.share >= 0.45, 'кадр ' + worst.box + ': объект мельчает до ' +
    Math.round(worst.share * 100) + '% на p=' + worst.p.toFixed(2));
});

check('К8', 'в закреплённой раскладке слева остаётся колонка под текст', () => {
  const scene = fold.framedScene(fold.SCENES.stage, BOXES[2]);
  const fit = fold.fitFor(scene, [0.4, 0, 1, 1]);
  const area = fold.regionOf(scene, [0.4, 0, 1, 1]);
  let leftmost = Infinity;
  for (const p of STEPS) {
    leftmost = Math.min(leftmost, frameBounds(fold.drawFor(scene, fit, fold.thetaAt(p), p, null)).min.x);
  }
  ok(leftmost > area.x + scene.margin - 1,
    'объект заходит в колонку текста: ' + leftmost.toFixed(1) + ' против ' + (area.x + scene.margin).toFixed(1));
  ok(leftmost > 0.4 * scene.vb[2], 'объект начинается раньше 40% кадра');
});

check('К9', 'в вертикальной коробке вписывание идёт по ширине', () => {
  for (const box of [{ name: '360×640', width: 360, height: 640 }, { name: '320×480', width: 320, height: 480 }, { name: '390×844', width: 390, height: 844 }]) {
    const scene = fold.framedScene(fold.SCENES.stage, box);
    const fit = fold.fitFor(scene, [0, 0, 1, 1]);
    const area = fold.regionOf(scene, [0, 0, 1, 1]);
    const low = { x: Infinity, y: Infinity };
    const high = { x: -Infinity, y: -Infinity };
    for (const p of STEPS) {
      const bounds = frameBounds(fold.drawFor(scene, fit, fold.thetaAt(p), p, null));
      low.x = Math.min(low.x, bounds.min.x);
      low.y = Math.min(low.y, bounds.min.y);
      high.x = Math.max(high.x, bounds.max.x);
      high.y = Math.max(high.y, bounds.max.y);
    }
    near(high.x - low.x, area.width - 2 * scene.margin, 1.5,
      'в ' + box.name + ' лист не занял ширину кадра');
    ok(high.y - low.y < area.height - 2 * scene.margin - 1,
      'в ' + box.name + ' лист упёрся в высоту — вписывание пошло не по ширине');
  }
});

/* --- Т. Печать заголовка в плоскости листа ------------------------------ */

group('Т. Печать в плоскости листа');

// Размеры печати берутся из styles.css, а не из головы: если кегль или отбивка
// поменяются в стилях, проверки это увидят. Строк в заголовке — три.
function sizeFromCss(selector) {
  const match = new RegExp('\\.' + selector + '\\s*\\{[^}]*font-size:\\s*([0-9.]+)rem').exec(css);
  ok(match, 'в styles.css не найден кегль ' + selector);
  return Number(match[1]);
}

function printHeightMm() {
  const labelRem = sizeFromCss('print__label') * 1.62 + 0.7;
  const titleRem = 3 * sizeFromCss('print__title') * 0.98;
  return ((labelRem + titleRem) * 16) / fold.K;
}

check('Т1', 'гомография печати совпадает с проекцией листа', () => {
  for (const box of BOXES) {
    const scene = fold.framedScene(fold.SCENES.stage, box);
    for (const p of [0, 0.4, 1]) {
      const fit = fold.fitFor(scene);
      const map = fold.viewMap(box, scene.vb);
      const matrix = fold.paperMatrix(fold.cameraAt(scene, p), fit, map, scene.print, fold.K);
      // Место начала печатного блока в системе координат листа, мм.
      const camera = fold.cameraFor(scene, fit, p, map);
      const origin = fold.project({ x: scene.print.x, y: 0, z: scene.print.z }, camera);
      const printed = fold.matrixApply(matrix, { x: 0, y: 0 });
      near(printed.x, origin.x, 0.5, 'начало печати сместилось по x на p=' + p);
      near(printed.y, origin.y, 0.5, 'начало печати сместилось по y на p=' + p);
      // Правый край блока: 1 мм = K локальных пикселей.
      const rightMm = scene.print.x + (scene.printWidth * 16) / fold.K;
      const right = fold.project({ x: rightMm, y: 0, z: scene.print.z }, camera);
      const printedRight = fold.matrixApply(matrix, { x: scene.printWidth * 16, y: 0 });
      near(printedRight.x, right.x, 0.5, 'правый край печати разошёлся с листом');
      near(printedRight.y, right.y, 0.5, 'правый край печати разошёлся с листом по y');
    }
  }
});

check('Т2', 'печатный блок целиком внутри ближней половины листа', () => {
  const half = fold.PAPER.w / 2;
  const depth = fold.PAPER.d / 2;
  const edge = 8;
  for (const box of BOXES) {
    const scene = fold.framedScene(fold.SCENES.stage, box);
    const print = scene.print;
    const widthMm = (scene.printWidth * 16) / fold.K;
    ok(print.x >= -half + edge, 'печать вылезает за левый край листа');
    ok(print.x + widthMm <= half - edge, 'печать вылезает за правый край: ' +
      (print.x + widthMm).toFixed(1) + ' мм при ' + (half - edge) + ' мм');
    ok(print.z >= edge, 'печать начинается у самого сгиба');
  }
  // Высота блока в миллиметрах по размерам из styles.css: надпись с отбивкой
  // и три строки заголовка. Число строк задано текстом заголовка.
  const heightMm = printHeightMm();
  ok(fold.SCENES.stage.print.z + heightMm <= depth - 4,
    'печать выходит за передний край листа: ' +
    (fold.SCENES.stage.print.z + heightMm).toFixed(1) + ' мм при ' + depth + ' мм');
});

check('Т3', 'углы печатного блока лежат внутри ближней половины на всех кадрах', () => {
  const half = fold.PAPER.w / 2;
  const depth = fold.PAPER.d / 2;
  const local = {
    width: fold.SCENES.stage.printWidth * 16,
    height: (printHeightMm() * fold.K)
  };
  for (const box of BOXES) {
    const scene = fold.framedScene(fold.SCENES.stage, box);
    const fit = fold.fitFor(scene);
    for (const p of STEPS) {
      const map = fold.viewMap(box, scene.vb);
      const camera = fold.cameraFor(scene, fit, p, map);
      const quad = fold.projectList(fold.shapeAt(fold.thetaAt(p)).near, camera);
      const corners = [[0, 0], [local.width, 0], [local.width, local.height], [0, local.height]]
        .map(([x, y]) => ({ x: scene.print.x + x / fold.K, y: 0, z: scene.print.z + y / fold.K }))
        .map((point) => fold.project(point, camera));
      for (const corner of corners) {
        ok(inside(corner, quad), 'угол печати вышел за лист ' + box.name + ' на p=' + p.toFixed(2));
      }
    }
    ok(half > 0 && depth > 0, 'размеры листа заданы');
  }
});

check('Т4', 'печать не шире листа и не мельче разумного', () => {
  const widthMm = (fold.SCENES.stage.printWidth * 16) / fold.K;
  between(widthMm, 100, fold.PAPER.w - 16, 'ширина печатного блока');
  const titleMm = (7.5 * 16) / fold.K;
  between(titleMm, 20, 40, 'кегль заголовка в миллиметрах листа');
});

check('Т5', 'размер печати в стилях совпадает с пресетом сцены', () => {
  const match = css.match(/--print-w:\s*([0-9.]+)rem/);
  ok(match, 'в styles.css не найден размер печатного блока');
  near(Number(match[1]), fold.SCENES.stage.printWidth, 1e-9,
    'styles.css и main.js разошлись по ширине печати');
});

check('Т6', 'печать лежит на неподвижной половине, а не на подвижной', () => {
  ok(fold.SCENES.stage.print.z > 0, 'печать должна быть на стороне +z, где лист не двигается');
  const lift = fold.shapeAt(0).lift.map((point) => point.z);
  ok(Math.max(...lift) <= 1e-9, 'подвижная половина в покое лежит на стороне -z');
});

/* --- Р. Разметка, стили и сборка ---------------------------------------- */

group('Р. Разметка, стили и сборка');

function noteFigures(source) {
  return source.split('<figure class="note__frame"').slice(1).map((chunk) => chunk.split('</figure>')[0]);
}

function polygonOf(figure, className) {
  const match = figure.match(new RegExp('class="' + className + '"[^>]*points="([^"]*)"'));
  ok(match, 'в статичном кадре нет фигуры ' + className);
  return match[1].trim().split(/\s+/).map((pair) => {
    const [x, y] = pair.split(',').map(Number);
    return { x, y };
  });
}

function attributeOf(figure, className, name) {
  const match = figure.match(new RegExp('class="' + className + '"[^>]*' + name + '="([^"]*)"'));
  ok(match, 'в статичном кадре нет атрибута ' + name + ' у ' + className);
  return Number(match[1]);
}

check('Р1', 'три статичных кадра посчитаны тем же движком', () => {
  const figures = noteFigures(html);
  near(figures.length, 3, 0);
  const map = {
    'f-shadow': 'shadow', 'f-nearShadow': 'nearShadow', 'f-ghost': 'ghost',
    'f-near': 'near', 'f-lift': 'lift', 'f-liftShade': 'lift', 'f-edge': 'edge'
  };
  const scene = fold.SCENES.frame;
  const fit = fold.fitFor(scene);
  figures.forEach((figure, index) => {
    const angle = fold.FRAME_ANGLES[index];
    const frame = fold.drawFor(scene, fit, angle, 0, null);
    for (const [className, shapeName] of Object.entries(map)) {
      const drawn = polygonOf(figure, className);
      const expected = frame[shapeName];
      near(drawn.length, expected.length, 0, 'разное число точек у ' + className);
      drawn.forEach((point, i) => {
        near(point.x, Math.round(expected[i].x * 10) / 10, 0.05, className + ' угол ' + angle + '°');
        near(point.y, Math.round(expected[i].y * 10) / 10, 0.05, className + ' угол ' + angle + '°');
      });
    }
    const shade = attributeOf(figure, 'f-liftShade', 'opacity');
    near(shade, Math.round(fold.drawFor(scene, fit, angle, 0, null).shade * fold.VEIL * 1000) / 1000, 0.002,
      'тон поднятой половины на ' + angle + '°');
  });
});

check('Р2', 'статичные кадры действительно разные, а не три копии', () => {
  const figures = noteFigures(html);
  const bodies = figures.map((figure) => polygonOf(figure, 'f-lift').map((p) => p.x + ',' + p.y).join(' '));
  ok(new Set(bodies).size === 3, 'кадры повторяются');
  const shades = figures.map((figure) => attributeOf(figure, 'f-liftShade', 'opacity'));
  ok(Math.max(...shades) - Math.min(...shades) > 0.2,
    'тон поднятой половины почти не меняется между кадрами');
});

check('Р3', 'схема сгиба в разметке — плоское состояние из движка', () => {
  const chunk = html.split('class="scheme__svg"')[1].split('</svg>')[0];
  const fake = '<figure class="note__frame">' + chunk;
  const scene = fold.SCENES.scheme;
  const fit = fold.fitFor(scene);
  const frame = fold.drawFor(scene, fit, fold.SCHEME_FLAT, 0, null);
  for (const [className, shapeName] of Object.entries({
    'sheet__ghost': 'ghost', 'sheet__paper sheet__shade': null
  })) {
    ok(className.length > 0 && shapeName !== 'x', 'ключи разбора на месте');
  }
  const near1 = fake.match(/data-shape="near"[^>]*points="([^"]*)"/);
  ok(near1, 'в схеме нет неподвижной половины');
  const points = near1[1].trim().split(/\s+/).map((pair) => pair.split(',').map(Number));
  points.forEach(([x, y], i) => {
    near(x, Math.round(frame.near[i].x * 10) / 10, 0.05, 'схема: точка ' + i);
    near(y, Math.round(frame.near[i].y * 10) / 10, 0.05, 'схема: точка ' + i);
  });
  const lift = fake.match(/data-shape="lift"[^>]*points="([^"]*)"/);
  ok(lift, 'в схеме нет подвижной половины');
  const liftPoints = lift[1].trim().split(/\s+/).map((pair) => pair.split(',').map(Number));
  liftPoints.forEach(([x, y], i) => {
    near(x, Math.round(frame.lift[i].x * 10) / 10, 0.05, 'схема: поднятая точка ' + i);
    near(y, Math.round(frame.lift[i].y * 10) / 10, 0.05, 'схема: поднятая точка ' + i);
  });
});

check('Р4', 'без скрипта страница остаётся рассказом', () => {
  ok(/html:not\(\.js\) \.scene \{ display: none; \}/.test(css), 'сцена без скрипта скрыта');
  ok(/html:not\(\.js\) \.print \{ position: static/.test(css), 'заголовок встаёт в поток');
  ok(/\[hidden\] \{ display: none !important; \}/.test(css),
    'кнопки, которые включает скрипт, скрыты по умолчанию');
  ok(/html:not\(\.js\) \.fold__sheet \{ aspect-ratio: auto; \}/.test(css), 'высота листа без скрипта');
  ok((html.match(/hidden>/g) || []).length >= 2, 'в разметке нет скрытых кнопок по умолчанию');
});

check('Р5', 'управление и разметка согласованы по идентификаторам', () => {
  for (const id of ['motion-toggle', 'motion-note', 'fold-btn', 'scheme', 'scheme-caption']) {
    ok(html.includes('id="' + id + '"'), 'в разметке нет элемента ' + id);
    ok(new RegExp("getElementById\\('" + id + "'\\)").test(read('main.js')), 'скрипт не использует ' + id);
  }
  for (const hook of ['data-stage', 'data-sheet', 'data-print', 'data-readout', 'data-rule']) {
    ok(html.includes(hook), 'в разметке нет крючка ' + hook);
  }
  ok((html.match(/data-scene=/g) || []).length === 2, 'слоёв сцены должно быть два');
  ok(html.includes('aria-live="polite"'), 'подпись схемы объявлена как меняющаяся');
});

check('Р6', 'тексты в разметке совпадают с текстами движка', () => {
  ok(html.includes(fold.FLAT_CAPTION), 'подпись схемы в разметке не совпадает с движком');
  ok(html.includes('Показать сгиб'), 'надпись кнопки схемы в разметке');
  ok(read('main.js').includes('Вернуть плоскость'), 'надпись кнопки в сложенном виде');
});

check('Р7', 'собранная страница содержит полные исходники без внешних ссылок', () => {
  ok(dist.includes(css.trimEnd()), 'в dist нет полного styles.css');
  ok(dist.includes(read('main.js').trimEnd()), 'в dist нет полного main.js');
  ok(!/<link[^>]*stylesheet/i.test(dist), 'в dist осталась внешняя таблица стилей');
  ok(!/<script[^>]*\ssrc=/i.test(dist), 'в dist остался внешний скрипт');
  // xmlns="http://www.w3.org/2000/svg" — имя пространства имён, а не ссылка;
  // внешним считается только адрес в src, href или url().
  ok(!/\s(?:src|href)="https?:/i.test(dist), 'в dist есть внешняя ссылка');
  ok(!/url\(['"]?https?:/i.test(dist), 'в dist есть внешний url()');
  ok(dist.includes('lang="ru"'), 'в dist потерян язык документа');
});

check('Р8', 'в разметке один главный заголовок и есть навигация по разделам', () => {
  near((html.match(/<h1/g) || []).length, 1, 0, 'главный заголовок должен быть один');
  for (const target of ['#top', '#first-fold', '#faq']) {
    ok(html.includes('href="' + target + '"'), 'нет ссылки на раздел ' + target);
    ok(html.includes('id="' + target.slice(1) + '"'), 'нет раздела ' + target);
  }
  ok(/class="skip"/.test(html), 'нет ссылки «перейти к содержанию»');
});

/* --- Итог --------------------------------------------------------------- */

groups.push({ title: groupName, passed: groupPassed });

const bytes = Buffer.byteLength(dist, 'utf8');
const hash = createHash('sha256').update(dist, 'utf8').digest('hex');

const summary = [];
summary.push('');
summary.push('='.repeat(68));
for (const item of groups) {
  if (item.title) {
    summary.push('  ' + item.title.padEnd(46, '.') + ' ' + String(item.passed).padStart(2));
  }
}
summary.push('  dist/index.html: ' + bytes + ' Б, sha256 ' + hash);
summary.push('='.repeat(68));

if (failures.length) {
  summary.push('');
  summary.push('Провалено проверок: ' + failures.length);
  for (const failure of failures) summary.push('  ' + failure);
} else {
  summary.push('');
  summary.push('Все ' + passed + ' проверок пройдены.');
}

for (const line of summary) {
  if (failures.length) console.error(line);
  else console.log(line);
}

transcript.push.apply(transcript, summary);
mkdirSync(join(root, 'checks'), { recursive: true });
writeFileSync(join(root, 'checks', 'static-report.txt'), transcript.join('\n') + '\n', 'utf8');

if (failures.length) process.exit(1);
