#!/usr/bin/env node
/* ==========================================================================
   Кинолента сгиба — запись прокрутки как отдельный файл.

   Зачем: сцену надо посмотреть целиком, а не по одному кадру за раз, и
   посмотреть её должен мочь любой, у кого нет ни сервера, ни сборки. Скрипт
   считает кадры тем же движком, что и страница (main.js), и складывает их в
   один автономный checks/film.html: полоса кадров по трём пропорциям коробки
   и проигрыватель с ползунком.

   Это не вторая реализация сцены: здесь нет ни камеры, ни проекции — только
   готовые полигоны из движка. Если движок меняется, кинолента пересобирается
   и расходиться с страницей не может.

   Запуск: node scripts/film.mjs
   ========================================================================== */

import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const fold = require(join(root, 'main.js'));
const css = readFileSync(join(root, 'styles.css'), 'utf8');

const STEPS = 24;                       // кадров в проигрывателе
const SHEET_STEP = 2;                   // в полосе — каждый второй
// region — та же доля кадра, что отдаёт листу раскладка страницы: в закреплённой
// раскладке слева остаётся колонка под текст, в подпёртой лист занимает всё.
const ASPECTS = [
  { name: 'закреплённая', width: 1440, height: 800, region: [0.4, 0, 1, 1], note: 'широкое окно, текст слева' },
  { name: 'подпёртая', width: 558, height: 352, region: [0, 0, 1, 1], note: 'узкий экран, текст под листом' },
  { name: 'телефон', width: 390, height: 500, region: [0, 0, 1, 1], note: 'вертикальный экран' }
];

function slice(text, from, to) {
  const start = text.indexOf(from);
  const end = to === null ? text.length : text.indexOf(to, start);
  if (start < 0 || end < 0) throw new Error('не найдено: ' + from);
  return text.slice(start, end).trim();
}

// Токены и правила фигур берутся из styles.css: цвета на киноленте те же,
// что на странице, и берутся из одного места.
const tokens = slice(css, ':root {', '/* Кнопки и подписи');
const figures = slice(css, '/* --- Разметка фигуры листа', '/* --- Проба');

function frameSvg(frame, scene, label) {
  const box = scene.vb;
  const polygons = [
    ['f-shadow', frame.shadow, 0.22], ['f-nearShadow', frame.nearShadow, 0.5],
    ['f-ghost', frame.ghost, 1 - Math.min(1, frame.theta / 26)],
    ['f-near', frame.near, null], ['f-lift', frame.lift, null],
    ['f-liftShade', frame.lift, frame.shade * fold.VEIL], ['f-edge', frame.edge, null]
  ].filter((item) => item[1] && item[1].length > 2)
    .map(([name, points, opacity]) =>
      '<polygon class="' + name + '"' + (opacity === null ? '' : ' opacity="' + (Math.round(opacity * 1000) / 1000) + '"') +
      ' points="' + fold.pointsAttr(points) + '"/>')
    .join('');
  return '<figure class="frame-box" data-angle="' + frame.theta.toFixed(0) + '">' +
    '<svg viewBox="' + box.join(' ') + '" role="img" aria-label="' + label + '">' +
    polygons +
    '<path class="f-crease" d="' + fold.pathAttr(frame.crease) + '"/>' +
    (frame.theta < 30 ? '<path class="f-hint" d="' + fold.pathAttr(frame.hint) + '"/>' : '') +
    '</svg>' +
    '<figcaption>p=' + frame.progress.toFixed(2) + ' · ' + frame.theta.toFixed(0) + '°</figcaption>' +
    '</figure>';
}

function framesFor(aspect, steps) {
  const scene = fold.framedScene(fold.SCENES.stage, aspect);
  const fit = fold.fitFor(scene, aspect.region);
  const list = [];
  for (let i = 0; i <= steps; i++) {
    const p = i / steps;
    const frame = fold.drawFor(scene, fit, fold.thetaAt(p), p, null);
    frame.progress = p;
    list.push(frame);
  }
  return { scene: scene, list: list };
}

const player = framesFor(ASPECTS[1], STEPS);

const playFrames = player.list.map((frame, index) =>
  '<div class="play-frame' + (index === 0 ? ' is-on' : '') + '" data-angle="' + frame.theta.toFixed(1) + '" data-p="' + frame.progress.toFixed(2) + '">' +
  frameSvg(frame, player.scene, 'Кадр сгиба ' + index).replace('<figure class="frame-box" data-angle="' + frame.theta.toFixed(0) + '">', '<figure class="frame-box">') +
  '</div>').join('\n');

const sheet = ASPECTS.map((aspect) => {
  const data = framesFor(aspect, STEPS);
  const cells = data.list
    .map((frame, index) => (index % SHEET_STEP === 0 ? frameSvg(frame, data.scene, aspect.name + ' ' + index) : ''))
    .filter(Boolean)
    .join('\n');
  return '<section class="row">\n<h2>' + aspect.name + ' <span>коробка ' + aspect.width + '×' + aspect.height +
    ', ' + (aspect.width / aspect.height).toFixed(2) + ':1 — ' + aspect.note + '</span></h2>\n<div class="sheet">\n' +
    cells + '\n</div>\n</section>';
}).join('\n');

const total = ASPECTS.reduce((sum, aspect) => sum + framesFor(aspect, STEPS).list.length, 0);

const page = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Кинолента сгиба — запись прокрутки</title>
<style>
/* Токены и правила фигур — копия из styles.css, чтобы кинолента не разошлась
   со страницей по цветам. */
${tokens}

*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  padding: clamp(1.2rem, 4vw, 3rem);
  background: var(--field);
  color: var(--chalk);
  font-family: var(--font-text);
  line-height: 1.5;
}
h1 { font-family: var(--font-display); font-size: clamp(1.6rem, 4vw, 2.4rem); margin: 0 0 0.6rem; }
h2 { font-family: var(--font-display); font-size: 1.15rem; margin: 2.2rem 0 0.8rem; }
h2 span { font-family: var(--font-text); font-size: 0.85rem; font-weight: 400; color: var(--chalk-soft); letter-spacing: 0; }
.lede { max-width: 60ch; color: var(--chalk-soft); }
.lede b { color: var(--chalk); font-weight: 600; }

${figures}

.player { margin-top: 1.6rem; padding: 1rem; border: 1px solid var(--hair); }
.player input { width: 100%; accent-color: var(--crease-light); }
.player__line { display: flex; justify-content: space-between; gap: 1rem; font-family: var(--font-mono); font-size: 0.78rem; color: var(--chalk-soft); }
.player .frame-box svg { max-height: 46svh; margin-inline: auto; }
.play-frame { display: none; }
.play-frame.is-on { display: block; }
.frame-box figcaption {
  margin-top: 0.35rem;
  font-family: var(--font-mono);
  font-size: 0.66rem;
  letter-spacing: 0.06em;
  color: var(--chalk-soft);
}
.frame-box svg { display: block; width: 100%; height: auto; }
.sheet { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.9rem; }
.sheet .frame-box { background: var(--field-soft); padding: 0.3rem; }
</style>
</head>
<body>
<h1>Кинолента сгиба</h1>
<p class="lede">Запись прокрутки главной сцены: <b>${total} кадров</b> посчитаны тем же движком, что и страница
(main.js), в трёх пропорциях коробки листа. Здесь нет ни камеры, ни проекции — только готовые контуры,
поэтому кинолента не может разойтись со страницей. Прямоугольник пунктиром — исходное положение листа,
тон наложения — доля тени на поднятой половине.</p>

<div class="player">
  <input type="range" min="0" max="${STEPS}" step="1" value="0" id="scrub" aria-label="Прогресс прокрутки">
  <p class="player__line"><span id="scrub-p">p=0.00</span><span id="scrub-angle">0°</span><span>коробка 558×352</span></p>
${playFrames}
</div>

${sheet}

<script>
const range = document.getElementById('scrub');
const frames = Array.prototype.slice.call(document.querySelectorAll('.play-frame'));
const outP = document.getElementById('scrub-p');
const outAngle = document.getElementById('scrub-angle');
function show(index) {
  for (let i = 0; i < frames.length; i++) frames[i].classList.toggle('is-on', i === index);
  outP.textContent = 'p=' + frames[index].dataset.p;
  outAngle.textContent = frames[index].dataset.angle + '°';
}
range.addEventListener('input', function () { show(Number(range.value)); });
show(0);
</script>
</body>
</html>
`;

mkdirSync(join(root, 'checks'), { recursive: true });
writeFileSync(join(root, 'checks', 'film.html'), page, 'utf8');

const kb = Math.round(Buffer.byteLength(page, 'utf8') / 1024);
console.log('checks/film.html собран');
console.log('  кадров:  ' + total + ' (' + ASPECTS.length + ' пропорции коробки, шаг 1/' + STEPS + ')');
console.log('  размер:  ' + kb + ' КБ, внешних ссылок и скриптов нет');
