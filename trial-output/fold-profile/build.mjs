/* Сборка автономного экспорта arm B: один HTML без внешних ссылок.
   Только стандартная библиотека Node. */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const here = import.meta.dirname;
const dist = path.join(here, "dist");

const html = await readFile(path.join(here, "index.html"), "utf8");
const css = await readFile(path.join(here, "styles.css"), "utf8");
const js = await readFile(path.join(here, "main.js"), "utf8");

const packed = html
  .replace('<link rel="stylesheet" href="styles.css">', `<style>\n${css.trim()}\n</style>`)
  .replace('<script src="main.js"></script>', `<script>\n${js.trim()}\n</script>`);

const leftovers = [...packed.matchAll(/(?:src|href)="(?!data:|#)([^"]+)"/g)].map((match) => match[1]);
if (leftovers.length) {
  throw new Error(`Автономный экспорт содержит внешние ссылки: ${leftovers.join(", ")}`);
}
for (const marker of ["styles.css", "main.js"]) {
  if (packed.includes(`"${marker}"`)) {
    throw new Error(`В сборку не встроен ${marker}`);
  }
}

await mkdir(dist, { recursive: true });
await writeFile(path.join(dist, "index.html"), packed, "utf8");
console.log(`dist/index.html: ${Buffer.byteLength(packed)} байт`);
