// Свет по ходу сгиба: снимки на пяти углах плюс рамки и переменные сцены.
import { chromium } from "../../../../Test 1/node_modules/playwright/index.mjs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(path.join(here, "..", "..", "index.html")).href;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url);
await page.waitForTimeout(500);

for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
  const state = await page.evaluate(async (value) => {
    const bench = document.getElementById("bench");
    const box = bench.getBoundingClientRect();
    const travel = box.height - innerHeight;
    scrollTo(0, scrollY + box.top + travel * value);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 200));
    const sheet = document.getElementById("sheet");
    const style = getComputedStyle(sheet);
    const rect = sheet.getBoundingClientRect();
    const near = document.querySelector(".sheet__near").getBoundingClientRect();
    return {
      progress: value,
      theta: style.getPropertyValue("--theta").trim(),
      light: style.getPropertyValue("--light").trim(),
      shade: style.getPropertyValue("--shade").trim(),
      glow: style.getPropertyValue("--glow").trim(),
      spread: style.getPropertyValue("--spread").trim(),
      sheet: [rect.left, rect.top, rect.width, rect.height].map(Math.round),
      near: [near.left, near.top, near.width, near.height].map(Math.round),
    };
  }, progress);
  await page.screenshot({ path: path.join(here, "..", "..", "evidence", `light-${String(progress).replace(".", "")}.png`) });
  console.log(JSON.stringify(state));
}

await browser.close();
