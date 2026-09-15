#!/usr/bin/env node
/* ==========================================================================
   Текстовое превью фигур SVG: единственный обзор геометрии без браузера.

   Не заменяет просмотр страницы в браузере и не проверяет вёрстку.
   Показывает только порядок наложения контуров внутри одной фигуры.
   Запуск: node scripts/preview-figures.mjs
   ========================================================================== */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(project, 'index.html'), 'utf8');

const WIDTH = 78;
const HEIGHT = 30;
const CHARS = {
  'sheet__shadow': '.',
  'sheet__cast': ',',
  'sheet__ghost': '+',
  'sheet__guide': 'c',
  'sheet__shaft': 'c',
  'sheet__marks': 'm',
  'sheet__arrow': 'A',
  'sheet__edge': 'E',
  'sheet__face--front': '%',
  'sheet__face--back': '=',
  'sheet__face--lift': '*',
  'sheet__face': '#',
  'sheet__crease': 'C'
};

function numbersOf(text) {
  return Array.from(text.matchAll(/-?\d+(?:\.\d+)?/g), function (m) { return Number(m[0]); });
}

function pathPoints(d) {
  const points = [];
  let current = { x: 0, y: 0 };
  for (const command of d.match(/[MLHVZmlhvz][^MLHVZmlhvz]*/g) || []) {
    const type = command[0];
    const values = numbersOf(command.slice(1));
    if (type === 'M' || type === 'L') {
      for (let i = 0; i + 1 < values.length; i += 2) {
        current = { x: values[i], y: values[i + 1] };
        points.push(current);
      }
    } else if (type === 'H') {
      for (const value of values) { current = { x: value, y: current.y }; points.push(current); }
    } else if (type === 'V') {
      for (const value of values) { current = { x: current.x, y: value }; points.push(current); }
    }
  }
  return points;
}

function shapePoints(text) {
  const numbers = numbersOf(text);
  const points = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) points.push({ x: numbers[i], y: numbers[i + 1] });
  return points;
}

function className(tag) {
  return (tag.match(/class="([^"]*)"/) || [])[1] || '';
}

function inside(point, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const first = polygon[i];
    const second = polygon[j];
    if ((first.y > point.y) !== (second.y > point.y) &&
      point.x < ((second.x - first.x) * (point.y - first.y)) / (second.y - first.y) + first.x) {
      result = !result;
    }
  }
  return result;
}

function characterFor(cls) {
  const keys = Object.keys(CHARS).sort(function (a, b) { return b.length - a.length; });
  for (const key of keys) {
    if (cls.split(/\s+/).indexOf(key) !== -1) return CHARS[key];
  }
  return '?';
}

const STROKE_CLASSES = ['sheet__crease', 'sheet__shaft', 'sheet__guide', 'sheet__ghost', 'sheet__marks'];

const figures = [];
for (const svg of html.matchAll(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/g)) {
  const box = (svg[1].match(/viewBox="([^"]+)"/) || [])[1];
  if (!box) continue;
  const layers = [];
  let groupClass = '';
  for (const element of svg[2].matchAll(/<(\/?)g\b([^>]*)>|<(polygon|path|ellipse)\b([^>]*)>/g)) {
    if (element[2] !== undefined) {
      groupClass = element[1] === '/' ? '' : className(element[2]);
      continue;
    }
    const name = element[3];
    const tag = element[4];
    const cls = className(tag) || groupClass;
    const stroke = STROKE_CLASSES.some(function (item) { return cls.includes(item); });
    if (name === 'polygon') layers.push({ cls: cls, points: shapePoints((tag.match(/points="([^"]*)"/) || [])[1] || '') });
    if (name === 'path') {
      const points = pathPoints((tag.match(/d="([^"]*)"/) || [])[1] || '');
      layers.push({ cls: cls, points: points, stroke: stroke || points.length < 3 });
    }
    if (name === 'ellipse') layers.push({ cls: cls, ellipse: numbersOf(tag.slice(tag.indexOf('cx='))) });
  }
  figures.push({ name: (svg[1].match(/class="([^"]*)"/) || [])[1] || 'svg', box: box.split(/[\s,]+/).map(Number), layers: layers });
}

for (const figure of figures) {
  const width = figure.box[2];
  const height = figure.box[3];
  const grid = Array.from({ length: HEIGHT }, function () { return new Array(WIDTH).fill(' '); });

  const cell = function (point) {
    const column = Math.max(0, Math.min(WIDTH - 1, Math.floor((point.x / width) * WIDTH)));
    const row = Math.max(0, Math.min(HEIGHT - 1, Math.floor((point.y / height) * HEIGHT)));
    return { column: column, row: row };
  };

  for (const layer of figure.layers) {
    const char = characterFor(layer.cls);

    if (layer.stroke) {
      for (let i = 1; i < layer.points.length; i++) {
        const from = layer.points[i - 1];
        const to = layer.points[i];
        const steps = Math.max(2, Math.round(Math.hypot(to.x - from.x, to.y - from.y)));
        for (let step = 0; step <= steps; step++) {
          const spot = cell({ x: from.x + ((to.x - from.x) * step) / steps, y: from.y + ((to.y - from.y) * step) / steps });
          grid[spot.row][spot.column] = char;
        }
      }
      continue;
    }

    for (let row = 0; row < HEIGHT; row++) {
      for (let column = 0; column < WIDTH; column++) {
        const point = { x: ((column + 0.5) / WIDTH) * width, y: ((row + 0.5) / HEIGHT) * height };
        if (layer.ellipse) {
          const [cx, cy, rx, ry] = layer.ellipse;
          const distance = ((point.x - cx) / rx) ** 2 + ((point.y - cy) / ry) ** 2;
          if (distance <= 1) grid[row][column] = char;
          continue;
        }
        if (layer.points.length >= 3 && inside(point, layer.points)) grid[row][column] = char;
      }
    }
  }

  console.log('\n' + figure.name + '  viewBox ' + figure.box.join(' ') + '  слоёв: ' + figure.layers.length);
  console.log('легенда: # лист, = задняя плоскость, * поднятая, % передняя, E край, C сгиб,' +
    ' c наметка, + прежний контур, A стрелка, . тень, , полутень, m метки');
  for (const row of grid) console.log('|' + row.join('') + '|');
}
