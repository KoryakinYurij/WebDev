#!/usr/bin/env node
/* ==========================================================================
   Сборка автономного файла dist/index.html.

   Только стандартная библиотека Node: без сети, зависимостей и сервера.
   Запуск: node build.mjs
   Вход:   index.html, styles.css, main.js
   Выход:  dist/index.html — один файл без внешних ссылок.
   ========================================================================== */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const cssLink = '<link rel="stylesheet" href="styles.css">';
const jsScript = '<script src="main.js" defer></script>';

function fail(message) {
  console.error('Сборка остановлена: ' + message);
  process.exit(1);
}

function readText(name) {
  const text = readFileSync(join(root, name), 'utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

const html = readText('index.html');
const css = readText('styles.css');
const js = readText('main.js');

if (!html.includes(cssLink)) fail('в index.html не найдена ссылка на styles.css');
if (!html.includes(jsScript)) fail('в index.html не найден тег скрипта main.js');

// Встроенный скрипт не должен содержать закрывающий тег script: он разорвал бы документ.
const inlineJs = js.replace(/<\/script/gi, '<\\/script');

const output = html
  .replace(cssLink, '<style>\n' + css.trimEnd() + '\n</style>')
  .replace(jsScript, '<script>\n' + inlineJs.trimEnd() + '\n</script>');

const problems = [];

if (/<link[^>]*rel=["']?stylesheet/i.test(output)) problems.push('осталась внешняя таблица стилей');
if (/<script[^>]*\ssrc=/i.test(output)) problems.push('остался внешний скрипт');
for (const match of output.matchAll(/\ssrc="([^"]*)"/g)) {
  if (!match[1].startsWith('data:')) problems.push('внешний ресурс src="' + match[1] + '"');
}
for (const match of output.matchAll(/\shref="([^"]*)"/g)) {
  const value = match[1];
  if (!value.startsWith('#') && !value.startsWith('data:')) {
    problems.push('внешняя ссылка href="' + value + '"');
  }
}
for (const match of output.matchAll(/url\(([^)]*)\)/g)) {
  const value = match[1].trim().replace(/^['"]|['"]$/g, '');
  if (!value.startsWith('data:')) problems.push('внешний url(' + value + ')');
}
if (!output.includes(css.trimEnd())) problems.push('разметка не содержит полный styles.css');
if (!output.includes(inlineJs.trimEnd())) problems.push('разметка не содержит полный main.js');
if (!/lang="ru"/.test(output)) problems.push('потерян язык документа');

if (problems.length) fail(problems.join('; '));

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'index.html'), output, 'utf8');

const hash = createHash('sha256').update(output, 'utf8').digest('hex');
const bytes = Buffer.byteLength(output, 'utf8');

console.log('dist/index.html собран');
console.log('  байт:    ' + bytes);
console.log('  sha256:  ' + hash);
console.log('  css:     ' + Buffer.byteLength(css, 'utf8') + ' Б');
console.log('  js:      ' + Buffer.byteLength(js, 'utf8') + ' Б');
console.log('  внешних ссылок: 0');
