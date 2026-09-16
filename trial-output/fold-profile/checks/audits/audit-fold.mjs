// Temporary audit: снимок конца сцены с подсказкой объёма и без неё.
import { chromium } from "../../../Test 1/node_modules/playwright/index.mjs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const page_url = pathToFileURL(path.join(here, "..", "..", "index.html")).href;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(page_url);
await page.waitForTimeout(500);

await page.evaluate(async () => {
  const bench = document.getElementById("bench");
  const rect = bench.getBoundingClientRect();
  scrollTo(0, scrollY + rect.top + (rect.height - innerHeight));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
});
await page.waitForTimeout(250);

const rect = await page.evaluate(() => {
  const box = document.querySelector(".sheet__far").getBoundingClientRect();
  return [Math.round(box.left), Math.round(box.top), Math.round(box.width), Math.round(box.height)];
});
console.log("область поднятой половины:", rect.join(","));

await page.screenshot({ path: path.join(here, "..", "..", "evidence", "fold-after.png") });

// Прежнее поведение: подсветка только по синусу, края нет.
await page.evaluate(() => {
  const sheet = document.getElementById("sheet");
  sheet.style.setProperty("--lift", "0");
  sheet.style.setProperty("--shade", "0.058");
});
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(here, "..", "..", "evidence", "fold-before.png") });

await browser.close();
