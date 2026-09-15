#!/usr/bin/env node
/* ==========================================================================
   Кинолента сцены символами и готовые значения для разметки.

   Считает геометрию тем же кодом, что и страница (main.js), и печатает:
   1) силуэт листа в нескольких положениях прокрутки — это единственный способ
      посмотреть на форму без браузера;
   2) атрибуты points/d для статических кадров и схемы сгиба — их вставляют
      в index.html, а scripts/check.mjs сверяет вставленное с движком.

   Запуск: node scripts/frames.mjs [preset] [ширина]
   ========================================================================== */

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const fold = require(join(project, 'main.js'));

// ghost — контур без заливки, как в разметке; остальные слои — заливки.
const LAYERS = [
  ['shadow', '.'],
  ['nearShadow', ':'],
  ['near', '#'],
  ['lift', '*'],
  ['edge', '=']
];

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

function drawSegment(grid, cell, from, to, char) {
  const steps = Math.max(2, Math.round(Math.hypot(to.x - from.x, to.y - from.y) * 2));
  for (let step = 0; step <= steps; step++) {
    const point = {
      x: from.x + ((to.x - from.x) * step) / steps,
      y: from.y + ((to.y - from.y) * step) / steps
    };
    const spot = cell(point);
    if (spot) grid[spot.row][spot.column] = char;
  }
}

function render(frame, preset, width) {
  const box = fold.SCENES[preset].vb;
  const aspect = box[2] / box[3];
  const height = Math.max(10, Math.round(width / aspect / 2.05));
  const grid = Array.from({ length: height }, () => new Array(width).fill(' '));
  const cell = (point) => {
    const column = Math.floor((point.x / box[2]) * width);
    const row = Math.floor((point.y / box[3]) * height);
    if (column < 0 || row < 0 || column >= width || row >= height) return null;
    return { column, row };
  };

  for (const [name, char] of LAYERS) {
    const points = frame[name];
    if (!points || points.length < 3) continue;
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        const probe = {
          x: ((column + 0.5) / width) * box[2],
          y: ((row + 0.5) / height) * box[3]
        };
        if (inside(probe, points)) grid[row][column] = char;
      }
    }
  }

  if (1 - Math.min(1, frame.theta / 26) > 0.05) {
    for (let i = 0; i < 4; i++) {
      drawSegment(grid, cell, frame.ghost[i], frame.ghost[(i + 1) % 4], '+');
    }
  }
  if (1 - Math.min(1, frame.theta / 30) > 0.05) {
    drawSegment(grid, cell, frame.hint[0], frame.hint[1], 'c');
  }
  drawSegment(grid, cell, frame.crease[0], frame.crease[1], 'C');
  return grid.map((row) => '|' + row.join('') + '|').join('\n');
}

// Границы нарисованного кадра в единицах кадра: по ним видно, какую долю
// кадра занимает объект. Это и есть проверка «лист не мелкий» — глазами и
// числом, без браузера.
function frameBounds(frame) {
  const min = { x: Infinity, y: Infinity };
  const max = { x: -Infinity, y: -Infinity };
  for (const name of ['near', 'nearShadow', 'lift', 'shadow', 'edge']) {
    for (const point of frame[name] || []) {
      min.x = Math.min(min.x, point.x);
      min.y = Math.min(min.y, point.y);
      max.x = Math.max(max.x, point.x);
      max.y = Math.max(max.y, point.y);
    }
  }
  return { min, max };
}

function occupancy(frame, vb) {
  const box = frameBounds(frame);
  return {
    width: (box.max.x - box.min.x) / vb[2],
    height: (box.max.y - box.min.y) / vb[3]
  };
}

function report(preset, width, steps, only, aspect) {
  // Живая сцена adaptive: её кадр задаётся пропорциями коробки, поэтому
  // киноленту надо смотреть в той же пропорции, что и на странице.
  const scene = fold.framedScene(fold.SCENES[preset], { width: 1000, height: 1000 / aspect });
  const fit = fold.fitFor(scene);
  const bounds = fit.bounds;
  console.log('\n### ' + preset + '  коробка ' + aspect.toFixed(2) + ':1' +
    '  viewBox ' + scene.vb.join(' ') +
    '  фокус ' + fit.focal.toFixed(3) +
    '  начало листа (' + fit.cx.toFixed(0) + ', ' + fit.cy.toFixed(0) + ')');
  console.log('    пределы объекта при единичном масштабе: x ' +
    bounds.min.x.toFixed(3) + '…' + bounds.max.x.toFixed(3) +
    ', y ' + bounds.min.y.toFixed(3) + '…' + bounds.max.y.toFixed(3));
  console.log('    легенда: # неподвижная половина, * поднятая, = кромка, . тень, ' +
    ': тень у края, + прежний контур, c наметка, C сгиб');

  const list = only || Array.from({ length: steps + 1 }, (_, i) => i / steps);
  for (const p of list) {
    const frame = fold.sceneFrame(preset, p, null, scene);
    const cam = frame.camera;
    const mark = fold.noteAt(p) + 1;
    const cover = occupancy(frame, scene.vb);
    console.log('\n-- p=' + p.toFixed(2) + '  угол ' + frame.theta.toFixed(0) + '°' +
      '  камера phi ' + cam.phi.toFixed(1) + '° psi ' + cam.psi.toFixed(1) + '°' +
      '  тень поднятой ' + (frame.shade * fold.VEIL).toFixed(2) +
      '  доля кадра ' + Math.round(cover.width * 100) + '%×' + Math.round(cover.height * 100) + '%' +
      '  стадия 0' + mark);
    console.log(render(frame, preset, width));
  }
}

function emit(preset, angles) {
  for (const theta of angles) {
    const scene = fold.SCENES[preset];
    const fit = fold.fitFor(scene);
    const cam = fold.cameraAt(scene, 0);
    const frame = fold.drawFor(scene, fit, theta);
    console.log('\n<!-- ' + preset + ' theta=' + theta + ' -->');
    for (const name of ['shadow', 'nearShadow', 'ghost', 'near', 'lift', 'liftShade', 'edge']) {
      // liftShade — та же геометрия, что и lift: второй контур только для тона.
      const points = name === 'liftShade' ? frame.lift : frame[name];
      console.log('<polygon class="f-' + name + '" points="' + fold.pointsAttr(points) + '"/>');
    }
    console.log('<path class="f-crease" data-fpath="crease" d="' + fold.pathAttr(frame.crease) + '"/>');
    console.log('<path class="f-hint" data-fpath="hint" d="' + fold.pathAttr(frame.hint) + '"/>');
    if (scene.print) {
      const map = { scale: 1, dx: 0, dy: 0 };
      const matrix = fold.paperMatrix(cam, fit, map, scene.print, fold.K);
      console.log('<!-- CSS: ' + fold.matrixCss(matrix) + ' -->');
    }
  }
}

const preset = process.argv[2] || 'stage';
const width = Number(process.argv[3] || 96);
// Пропорции коробки листа: ширина / высота. На странице она разная (телефон,
// окно в половине экрана) — киноленту смотрят в нескольких.
const aspect = Number(process.argv[5] || 1.6);

const shown = process.argv[4]
  ? process.argv[4].split(',').map(Number)
  : (preset === 'frame' || preset === 'scheme' ? [0] : [0, 0.2, 0.42, 0.62, 0.8, 1].map((value) => Math.round(value * 100) / 100));
report(preset, width, shown.length ? 12 : 0, shown, aspect);

if (preset === 'frame') emit('frame', fold.FRAME_ANGLES);
if (preset === 'scheme') emit('scheme', [fold.SCHEME_FLAT, fold.SCHEME_FOLDED]);
