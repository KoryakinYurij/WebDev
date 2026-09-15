#!/usr/bin/env node
/* ==========================================================================
   Статические проверки проекта «Линия сгиба» там, где браузер недоступен.

   Ничего не устанавливает, не ходит в сеть и не меняет исходники.
   Запуск: node scripts/check.mjs   (код возврата 1, если проверка провалена)

   Что проверяется: чистая логика main.js, структура разметки, разрешение якорей и
   aria-ссылок, отсутствие внешних ресурсов, контраст по формулам WCAG, соответствие
   dist/index.html исходникам, устойчивость текста к настройкам интервалов, размеры.

   Что здесь не проверяется: реальный вид, клавиатура, reduced-motion в браузере.
   Эти пункты остаются not_run и честно отмечены в REPORT.md.
   ========================================================================== */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const project = join(here, '..');
const require = createRequire(import.meta.url);

const results = [];
const lines = [];
function say(text) {
  lines.push(text);
  console.log(text);
}
function check(id, title, ok, detail) {
  results.push({ id, title, ok, detail });
  const mark = ok === true ? 'pass' : ok === false ? 'FAIL' : 'not_run';
  say(mark.padEnd(9) + id.padEnd(7) + title + (detail ? ' — ' + detail : ''));
}
function section(name) { say('\n== ' + name); }
function readFile(path) { return readFileSync(path, 'utf8'); }

const mainPath = join(project, 'main.js');
const html = readFile(join(project, 'index.html'));
const css = readFile(join(project, 'styles.css'));
const js = readFile(mainPath);
const distPath = join(project, 'dist', 'index.html');

/* --- 1. Чистая логика -------------------------------------------------- */

section('Логика main.js в Node');

const logic = require(mainPath);

const captionMatch = html.match(/id="scheme-caption"[^>]*>([^<]*)</);
const buttonMatch = html.match(/id="fold-btn"[^>]*>([^<]*)</);
const baseCaption = captionMatch ? captionMatch[1].trim() : null;
const baseButtonLabel = buttonMatch ? buttonMatch[1].trim() : null;

const logicCases = [
  ['фокус выше первой границы', logic.pickStage(10, [100, 200]) === 0],
  ['фокус ровно на границе уходит в следующую стадию', logic.pickStage(100, [100, 200]) === 1],
  ['фокус перед последней границей', logic.pickStage(199.9, [100, 200]) === 1],
  ['фокус на последней границе', logic.pickStage(200, [100, 200]) === 2],
  ['фокус далеко за концом не выходит за пределы', logic.pickStage(1e9, [100, 200]) === 2],
  ['фокус выше начала', logic.pickStage(-500, [100, 200]) === 0],
  ['нет границ — первая стадия', logic.pickStage(50, []) === 0],
  ['неизвестная позиция не бросает', logic.pickStage(NaN, [100, 200]) === 0],
  ['середины блоков считаются', JSON.stringify(logic.midpoints([0, 100, 300])) === JSON.stringify([50, 200])],
  ['неизвестные размеры отбрасываются', JSON.stringify(logic.midpoints([0, 100, NaN, 400])) === JSON.stringify([50])],
  ['подпись «плоскость» совпадает с разметкой', baseCaption === logic.captionFor(false)],
  ['подпись «сгиб» отличается от плоской', logic.captionFor(true) !== logic.captionFor(false)],
  ['надпись кнопки совпадает с разметкой', baseButtonLabel === logic.labelFor(false)],
  ['надпись меняется на обратное действие', logic.labelFor(true) === 'Вернуть плоскость'],
  ['переключение работает в обе стороны', logic.toggleFold('flat') === 'folded' && logic.toggleFold('folded') === 'flat'],
  ['неизвестное состояние даёт сгиб', logic.toggleFold(null) === 'folded']
];

const logicFailed = logicCases.filter(function (item) { return !item[1]; });

check(
  'L01',
  'Чистые функции сцены и схемы (' + logicCases.length + ' случаев)',
  logicFailed.length === 0,
  logicFailed.length ? logicFailed.map(function (i) { return i[0]; }).join('; ') : 'все случаи пройдены'
);

/* --- 2. Разметка ------------------------------------------------------- */

section('Структура разметки');

const ids = Array.from(html.matchAll(/\sid="([^"]+)"/g), function (m) { return m[1]; });
const duplicateIds = ids.filter(function (value, index) { return ids.indexOf(value) !== index; });
check('T02a', 'Уникальность id', duplicateIds.length === 0, duplicateIds.length ? duplicateIds.join(', ') : ids.length + ' id');

const idSet = new Set(ids);
const anchors = Array.from(html.matchAll(/href="#([^"]*)"/g), function (m) { return m[1]; }).filter(Boolean);
const brokenAnchors = anchors.filter(function (value) { return !idSet.has(value); });
check('T02b', 'Внутренние якоря ведут к существующим целям', brokenAnchors.length === 0, brokenAnchors.length ? brokenAnchors.join(', ') : anchors.length + ' якорь(ов)');

const ariaRefs = [];
for (const match of html.matchAll(/aria-(?:labelledby|describedby)="([^"]+)"/g)) {
  for (const ref of match[1].split(/\s+/)) ariaRefs.push(ref);
}
const brokenRefs = ariaRefs.filter(function (value) { return !idSet.has(value); });
check('T02c', 'aria-labelledby и aria-describedby разрешаются', brokenRefs.length === 0, brokenRefs.length ? brokenRefs.join(', ') : ariaRefs.length + ' ссылк.');

const svgTags = Array.from(html.matchAll(/<svg\b[^>]*>/g), function (m) { return m[0]; });
const namelessSvg = svgTags.filter(function (tag) {
  return !(/aria-hidden="true"/.test(tag) || (/role="img"/.test(tag) && /aria-label="/.test(tag)));
});
check('T02d', 'Каждый SVG скрыт от дерева доступности или назван', namelessSvg.length === 0, svgTags.length + ' SVG');

const links = Array.from(html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g));
const namelessLinks = links.filter(function (item) {
  return !item[2].replace(/<[^>]+>/g, '').trim() && !/aria-label="/.test(item[1]);
});
check('T04a', 'У каждой ссылки есть доступное имя', namelessLinks.length === 0, links.length + ' ссылок');

const buttons = Array.from(html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g));
const badButtons = buttons.filter(function (item) {
  const text = item[2].replace(/<[^>]+>/g, '').trim();
  return !text || /type="submit"/.test(item[1]);
});
check('T04b', 'У каждой кнопки есть имя и нейтральный тип', badButtons.length === 0, buttons.length + ' кнопок');

check('T04c', 'Нет положительного tabindex', !/tabindex="(?!-1")/.test(html), 'проверено по разметке');

const metaMissing = ['lang="ru"', '<title>', 'name="description"', 'name="viewport"', 'charset="utf-8"']
  .filter(function (needle) { return !html.includes(needle); });
check('T02e', 'Язык, заголовок, описание и viewport заданы', metaMissing.length === 0, metaMissing.join(', '));

// Парность и порядок закрытия тегов: разметка написана руками, включая пять SVG.
const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
function nestingErrors(source) {
  const masked = source
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '<script></script>')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '<style></style>');
  const errors = [];
  const stack = [];
  for (const token of masked.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g)) {
    const name = token[2].toLowerCase();
    if (VOID_ELEMENTS.has(name) || token[4] === '/') continue;
    if (token[1] !== '/') { stack.push(name); continue; }
    const opened = stack.pop();
    if (opened !== name) errors.push('закрыт </' + name + '>, открыт <' + opened + '>');
  }
  if (stack.length) errors.push('не закрыто: ' + stack.join(', '));
  return errors;
}
const nesting = nestingErrors(html);
check('T02f', 'Теги закрыты парно и в правильном порядке', nesting.length === 0, nesting.join('; ') || 'проверено по исходной разметке');

/* Контракт без JavaScript */
const jsOnlyControls = Array.from(html.matchAll(/<(button)\b([^>]*\bhidden\b[^>]*)>/g));
check(
  'T06a',
  'Кнопки, которые включает скрипт, скрыты в базовой разметке',
  jsOnlyControls.length === 2,
  jsOnlyControls.length + ' из 2'
);
check(
  'T06b',
  'Правило [hidden] побеждает display из классов',
  /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/.test(css),
  'styles.css'
);
check(
  'T06c',
  'Системное уменьшение движения описано в CSS',
  /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css),
  'styles.css'
);
check(
  'T12a',
  'Прокрутка не перехватывается',
  !/(wheel|touchmove|preventDefault|scroll-snap)/.test(js),
  'в main.js нет перехвата колеса и обязательного snap'
);
check(
  'T07a',
  'Скрипт не ходит в сеть во время работы',
  !/(fetch\(|XMLHttpRequest|navigator\.sendBeacon|import\()/.test(js),
  'в main.js нет сетевых вызовов'
);

/* --- 3. Геометрия фигур ----------------------------------------------- */

section('Геометрия фигур SVG');

function numbersOf(text) {
  return Array.from(text.matchAll(/-?\d+(?:\.\d+)?/g), function (m) { return Number(m[0]); });
}
function pairsOf(text) {
  const numbers = numbersOf(text);
  const out = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) out.push({ x: numbers[i], y: numbers[i + 1] });
  return out;
}
// Разбор абсолютных команд M/L/H/V: нужны честные точки, а не пары чисел подряд,
// иначе угловые метки вроде «M26 14 V38 M14 26 H38» дают несуществующие координаты.
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
function parseFigures(source) {
  const figures = [];
  for (const svg of source.matchAll(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/g)) {
    const viewBox = (svg[1].match(/viewBox="([^"]+)"/) || [])[1];
    if (!viewBox) continue;
    const polygons = [];
    for (const poly of svg[2].matchAll(/<polygon\b([^>]*)>/g)) {
      const points = (poly[1].match(/points="([^"]*)"/) || [])[1];
      if (!points) continue;
      polygons.push({
        cls: (poly[1].match(/class="([^"]*)"/) || [])[1] || '',
        points: pairsOf(points)
      });
    }
    const paths = [];
    for (const path of svg[2].matchAll(/<path\b([^>]*)>/g)) {
      const d = (path[1].match(/d="([^"]*)"/) || [])[1] || '';
      paths.push({
        cls: (path[1].match(/class="([^"]*)"/) || [])[1] || '',
        d: d,
        points: pathPoints(d)
      });
    }
    figures.push({ name: (svg[1].match(/class="([^"]*)"/) || [])[1] || 'svg', box: viewBox.split(/[\s,]+/).map(Number), polygons: polygons, paths: paths });
  }
  return figures;
}
function creaseEnds(figure) {
  return figure.paths
    .filter(function (item) { return item.cls.includes('sheet__crease') && item.points.length >= 2; })
    .map(function (item) {
      return { a: item.points[0], b: item.points[item.points.length - 1] };
    });
}
function distanceToSegment(point, first, second) {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const lengthSquared = dx * dx + dy * dy;
  let t = lengthSquared ? ((point.x - first.x) * dx + (point.y - first.y) * dy) / lengthSquared : 0;
  t = Math.max(0, Math.min(1, t));
  const nearX = first.x + t * dx;
  const nearY = first.y + t * dy;
  return Math.hypot(point.x - nearX, point.y - nearY);
}
function onBoundary(point, polygon, tolerance) {
  for (let i = 0; i < polygon.length; i++) {
    if (distanceToSegment(point, polygon[i], polygon[(i + 1) % polygon.length]) <= tolerance) return true;
  }
  return false;
}
function samePoint(first, second, tolerance) {
  return Math.abs(first.x - second.x) <= tolerance && Math.abs(first.y - second.y) <= tolerance;
}
function area(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}
function vertexCount(points, target) {
  return points.filter(function (point) { return samePoint(point, target, 0.6); }).length;
}
function lineYAt(first, second, x) {
  return first.y + ((second.y - first.y) * (x - first.x)) / (second.x - first.x);
}

const figures = parseFigures(html);
check('G01', 'Фигуры разобраны', figures.length === 5, figures.length + ' SVG с viewBox');

const outsideBox = [];
for (const figure of figures) {
  const all = figure.polygons.map(function (p) { return p.points; }).concat(figure.paths.map(function (p) { return p.points; }));
  for (const points of all) {
    for (const point of points) {
      if (point.x < 0 || point.y < 0 || point.x > figure.box[2] || point.y > figure.box[3]) {
        outsideBox.push(figure.name + ' ' + point.x + ',' + point.y);
      }
    }
  }
}
check('G02', 'Все точки внутри viewBox', outsideBox.length === 0, outsideBox.join('; ') || figures.length + ' фигур');

const degenerated = [];
for (const figure of figures) {
  for (const polygon of figure.polygons) {
    if (polygon.points.length < 3) degenerated.push(figure.name + ': меньше трёх вершин');
    if (area(polygon.points) < 25) degenerated.push(figure.name + ' ' + polygon.cls + ': площадь ' + Math.round(area(polygon.points)));
  }
}
check('G03', 'У всех многоугольников есть площадь (нет вырожденных фигур)', degenerated.length === 0, degenerated.join('; ') || 'проверено');

// Там, где лист сложен, линия сгиба должна быть общим ребром двух плоскостей:
// иначе на рисунке будет щель или наложение.
const brokenCrease = [];
let foldedFigures = 0;
for (const figure of figures) {
  const back = figure.polygons.filter(function (polygon) { return polygon.cls.includes('sheet__face--back'); })[0];
  const lift = figure.polygons.filter(function (polygon) { return polygon.cls.includes('sheet__face--lift'); })[0];
  if (!back || !lift) continue;
  foldedFigures += 1;
  for (const crease of creaseEnds(figure)) {
    for (const end of [crease.a, crease.b]) {
      if (vertexCount(back.points, end) !== 1 || vertexCount(lift.points, end) !== 1) {
        brokenCrease.push(figure.name + ' ' + end.x + ',' + end.y + ': сгиб не общее ребро плоскостей');
      }
    }
  }
}
check('G04', 'Линия сгиба — общее ребро двух плоскостей листа', brokenCrease.length === 0 && foldedFigures >= 3, brokenCrease.join('; ') || foldedFigures + ' сложенных фигур');

// В плоском кадре «Линия» сгиб должен идти по середине листа, а не рядом с краем.
const flatCrease = figures.filter(function (figure) {
  return figure.polygons.some(function (polygon) { return polygon.cls.includes('sheet__face--front'); });
})[0];
const flatCreaseOnEdge = (function () {
  if (!flatCrease) return false;
  const base = flatCrease.polygons.filter(function (polygon) { return polygon.cls.trim() === 'sheet__face'; })[0];
  return creaseEnds(flatCrease).every(function (crease) {
    return onBoundary(crease.a, base.points, 0.6) && onBoundary(crease.b, base.points, 0.6);
  });
})();
check('G05', 'Плоский кадр: сгиб идёт от края до края листа', flatCreaseOnEdge, 'концы сгиба лежат на контуре листа');

// Кадр «Линия»: сгиб должен идти по середине листа, а не рядом с краем.
const creaseFrame = figures.filter(function (figure) {
  return figure.polygons.some(function (polygon) { return polygon.cls.includes('sheet__face--front'); });
})[0];
const creaseFrameMidline = (function () {
  if (!creaseFrame) return false;
  const base = creaseFrame.polygons.filter(function (polygon) { return polygon.cls.trim() === 'sheet__face'; })[0];
  const crease = creaseEnds(creaseFrame)[0];
  const mid = function (first, second) { return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }; };
  const left = mid(base.points[3], base.points[0]);
  const right = mid(base.points[1], base.points[2]);
  return samePoint(crease.a, left, 1.5) && samePoint(crease.b, right, 1.5);
})();
check('G06', 'Кадр «Линия»: сгиб делит лист пополам', creaseFrameMidline, 'по геометрии кадра');

// Частичный подъём: дальний край поднятой половины должен быть выше линии сгиба.
// Кадр-шатёр (там подняты обе половины) проверяется отдельно через G08.
const lifted = [];
let partialFolds = 0;
for (const figure of figures) {
  const liftPanel = figure.polygons.filter(function (polygon) { return polygon.cls.includes('sheet__face--lift'); })[0];
  const crease = creaseEnds(figure)[0];
  const hasTent = figure.polygons.some(function (polygon) { return polygon.cls.includes('sheet__ghost'); });
  if (!liftPanel || !crease || hasTent) continue;
  partialFolds += 1;
  const far = liftPanel.points.filter(function (point) { return !samePoint(point, crease.a, 0.6) && !samePoint(point, crease.b, 0.6); });
  for (const point of far) {
    if (point.y > lineYAt(crease.a, crease.b, point.x) - 5) {
      lifted.push(figure.name + ': поднятая часть не выше линии сгиба');
    }
  }
}
check('G07', 'Поднятая часть листа выше линии сгиба', lifted.length === 0 && partialFolds >= 2, lifted.join('; ') || partialFolds + ' фигур с частичным подъёмом');

// Кадр «Объём»: гребень (линия сгиба) должен быть заметно выше того места,
// где сгиб лежал бы на плоскости. Плоское положение берётся из пунктирного
// контура: это середина левого и правого края исходного листа.
const tent = figures.filter(function (figure) {
  return figure.polygons.some(function (polygon) { return polygon.cls.includes('sheet__ghost'); });
})[0];
const tentRaised = (function () {
  if (!tent) return false;
  const ghost = tent.polygons.filter(function (polygon) { return polygon.cls.includes('sheet__ghost'); })[0];
  const flat = [
    { x: (ghost.points[3].x + ghost.points[0].x) / 2, y: (ghost.points[3].y + ghost.points[0].y) / 2 },
    { x: (ghost.points[1].x + ghost.points[2].x) / 2, y: (ghost.points[1].y + ghost.points[2].y) / 2 }
  ];
  return creaseEnds(tent).every(function (crease) {
    return [crease.a, crease.b].every(function (end) {
      const nearest = flat.reduce(function (best, point) {
        return Math.abs(point.x - end.x) < Math.abs(best.x - end.x) ? point : best;
      });
      return end.y <= nearest.y - 20;
    });
  });
})();
check('G08', 'Кадр «Объём»: гребень поднят над плоским положением сгиба', tentRaised, 'сравнение с пунктирным контуром листа');

/* --- 4. Внешние ресурсы ------------------------------------------------ */

section('Автономность источников');

const namespaced = function (text) {
  return text.replace(/xmlns(:[a-z]+)?=["']http:\/\/www\.w3\.org\/[^"']*["']/g, '');
};
const external = [];
for (const [name, text] of [['index.html', html], ['styles.css', css], ['main.js', js]]) {
  const clean = namespaced(text);
  for (const match of clean.matchAll(/https?:\/\/[^\s"'<>)]+|@import|url\((?!#)[^)]*\)/g)) {
    external.push(name + ': ' + match[0].slice(0, 48));
  }
}
check('T07b', 'В исходниках нет внешних адресов, импортов и url()', external.length === 0, external.length ? external.join('; ') : 'проверены 3 файла');

/* --- 5. Контраст ------------------------------------------------------- */

section('Контраст по формулам WCAG 2.2');

const tokens = {};
for (const match of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) tokens[match[1]] = match[2];

function rgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function luminance(hex) {
  const parts = rgb(hex).map(function (value) {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
}
function ratio(a, b) {
  const first = luminance(a);
  const second = luminance(b);
  const high = Math.max(first, second);
  const low = Math.min(first, second);
  return (high + 0.05) / (low + 0.05);
}

const pairs = [
  ['основной текст на бумаге', 'ink', 'paper', 4.5],
  ['основной текст на глубокой бумаге', 'ink', 'paper-deep', 4.5],
  ['второстепенный текст', 'ink-soft', 'paper', 4.5],
  ['второстепенный текст на глубокой бумаге', 'ink-soft', 'paper-deep', 4.5],
  ['текст кнопки на акцентном фоне', 'paper', 'crease', 4.5],
  ['текст кнопки при наведении', 'paper', 'crease-deep', 4.5],
  ['акцентный текст и линия сгиба', 'crease', 'paper', 4.5],
  ['акцентный текст на глубокой бумаге', 'crease', 'paper-deep', 4.5],
  ['граница интерактивных элементов', 'edge', 'paper', 3],
  ['фокусная рамка', 'ink', 'paper', 3],
  ['декоративные волосяные линии (ориентир)', 'ink-faint', 'paper', 0]
];

const contrastFailures = [];
for (const [title, left, right, minimum] of pairs) {
  if (!tokens[left] || !tokens[right]) {
    contrastFailures.push(title + ' (нет токена)');
    continue;
  }
  const value = ratio(tokens[left], tokens[right]);
  const rounded = Math.round(value * 100) / 100;
  if (value < minimum) contrastFailures.push(title + ' ' + rounded + ':1 < ' + minimum + ':1');
  say('           ' + (minimum ? minimum + ':1' : 'норма') + '\t' + rounded + ':1\t' + title + ' (' + tokens[left] + ' / ' + tokens[right] + ')');
}
check('T09a', 'Контраст смысловых пар не ниже порога', contrastFailures.length === 0, contrastFailures.length ? contrastFailures.join('; ') : pairs.filter(function (p) { return p[3] > 0; }).length + ' пар');

/* --- 6. Устойчивость текста к настройкам ------------------------------ */

section('Устойчивость текста');

const clipping = [];
if (/overflow:\s*hidden/.test(css)) clipping.push('overflow: hidden');
if (/text-overflow/.test(css)) clipping.push('text-overflow');
if (/white-space:\s*nowrap/.test(css)) clipping.push('white-space: nowrap');
if (/line-clamp/.test(css)) clipping.push('line-clamp');
check('T11a', 'Нет обрезки текста и запрета переноса', clipping.length === 0, clipping.length ? clipping.join(', ') : 'styles.css');

const clampSizes = Array.from(css.matchAll(/font-size:\s*clamp\(([^)]+)\)/g), function (m) { return m[1].split(',')[0].trim(); });
check('T11b', 'Размеры текста заданы в rem, а не в px', clampSizes.length > 0 && !/font-size:\s*\d+px/.test(css), clampSizes.length + ' clamp()');

/* --- 7. Артефакт сборки ------------------------------------------------ */

section('Собранный файл');

const hasDist = existsSync(distPath);
if (!hasDist) {
  check('T01a', 'dist/index.html существует', false, 'запустите node build.mjs');
} else {
  const dist = readFile(distPath);
  const bytes = statSync(distPath).size;
  const hash = createHash('sha256').update(dist, 'utf8').digest('hex');
  const missing = [css.trimEnd(), js.trimEnd().replace(/<\/script/gi, '<\\/script')].filter(function (chunk) {
    return !dist.includes(chunk);
  });
  check('T01a', 'Сборка содержит styles.css и main.js целиком', missing.length === 0, bytes + ' Б, sha256 ' + hash.slice(0, 16) + '…');

  const required = [
    'Из плоскости — в форму',
    'Три состояния листа',
    'Сначала попробуйте',
    'Частые вопросы',
    'Плоскость', 'Линия', 'Объём',
    'Перед вами чистый лист.', 'Сгиб задаёт направление.', 'Приподнятая часть меняет силуэт.',
    'Подготовьте обычный лист бумаги и свободное место на столе.',
    'Сложите лист пополам и раскройте. Найдите получившуюся линию.',
    'Приподнимите одну сторону и посмотрите, как меняется силуэт.',
    'Это исследование формы, не экзамен на точность.',
    'Нужна ли специальная бумага?', 'Нужны ли ножницы и клей?', 'Что делать дальше?',
    'Нет, для первой пробы подойдёт обычный лист.', 'В этой пробе — нет.',
    'Повторите опыт с другим направлением сгиба и сравните силуэты.',
    'Попробовать первый сгиб', 'Показать сгиб', 'Уменьшить движение'
  ];
  const lost = required.filter(function (line) { return !dist.includes(line); });
  check('T01b', 'Обязательная фактура брифа дошла до сборки', lost.length === 0, (required.length - lost.length) + '/' + required.length + ' строк' + (lost.length ? ', нет: ' + lost.join(' | ') : ''));

  const leftovers = [];
  if (/<link[^>]*rel=["']?stylesheet/i.test(dist)) leftovers.push('внешний CSS');
  if (/<script[^>]*\ssrc=/i.test(dist)) leftovers.push('внешний скрипт');
  for (const match of dist.matchAll(/\shref="([^"]*)"/g)) {
    if (!match[1].startsWith('#') && !match[1].startsWith('data:')) leftovers.push('href=' + match[1]);
  }
  for (const match of dist.matchAll(/\ssrc="([^"]*)"/g)) {
    if (!match[1].startsWith('data:')) leftovers.push('src=' + match[1]);
  }
  check('T07c', 'Готовая страница не запрашивает внешние ресурсы', leftovers.length === 0, leftovers.length ? leftovers.join(', ') : 'ссылок вне документа нет');

  const frameCount = (dist.match(/<svg\b/g) || []).length;
  check('T01c', 'Пять фигур SVG на месте', frameCount === 5, frameCount + ' SVG (герой, три кадра, схема)');

  const distFigures = parseFigures(dist);
  const geometryKept = distFigures.length === figures.length && distFigures.every(function (figure, index) {
    return figure.box.join(',') === figures[index].box.join(',') &&
      JSON.stringify(figure.polygons) === JSON.stringify(figures[index].polygons);
  });
  check('T01e', 'Сборка не изменила геометрию фигур', geometryKept, distFigures.length + ' фигур');

  const markers = (dist.match(/\b(TODO|FIXME|TBD|XXX|PLACEHOLDER|lorem ipsum)\b/gi) || []);
  check('T01d', 'Нет нераскрытых маркеров-заглушек', markers.length === 0, markers.length ? markers.join(', ') : 'проверено');

  say('           размер dist/index.html: ' + bytes + ' Б');
  say('           sha256: ' + hash);
}

/* --- 8. Итог ---------------------------------------------------------- */

const failed = results.filter(function (item) { return item.ok !== true; });
section('Итог');
say('Проверок: ' + results.length + ', пройдено: ' + (results.length - failed.length) + ', провалено: ' + failed.length);
if (failed.length) say('Провалено: ' + failed.map(function (item) { return item.id; }).join(', '));

// Отчёт сохраняет сам скрипт: свидетельство лежит рядом с исходниками и воспроизводимо.
mkdirSync(join(project, 'checks'), { recursive: true });
writeFileSync(join(project, 'checks', 'static-report.txt'), lines.join('\n') + '\n', 'utf8');
say('Полный отчёт: checks/static-report.txt');

if (failed.length) process.exit(1);
