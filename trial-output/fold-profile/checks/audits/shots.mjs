// Снимки любой страницы в нескольких положениях прокрутки.
// Использование: node checks/audits/shots.mjs <файл.html> <префикс> [доли через запятую]
import { chromium } from "../../../../Test 1/node_modules/playwright/index.mjs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const [target, prefix, fractions = "0,0.35,0.7,1"] = process.argv.slice(2);
if (!target || !prefix) {
  console.error("нужен путь к HTML и префикс имени снимков");
  process.exit(2);
}

const out = path.resolve(prefix, "..");
fs.mkdirSync(out, { recursive: true });
const url = pathToFileURL(path.resolve(target)).href;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url);
await page.waitForTimeout(1200);

const height = await page.evaluate(() => document.documentElement.scrollHeight);
const travel = Math.max(1, height - 900);
console.log(`страница ${height}px, ход ${travel}px`);

for (const fraction of fractions.split(",")) {
  const value = Number(fraction);
  await page.evaluate(async (pixels) => {
    window.scrollTo(0, pixels);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, Math.round(travel * value));
  await page.waitForTimeout(700);
  const file = `${prefix}-${fraction.replace(".", "")}.png`;
  await page.screenshot({ path: file });
  console.log(file);
}

await browser.close();
