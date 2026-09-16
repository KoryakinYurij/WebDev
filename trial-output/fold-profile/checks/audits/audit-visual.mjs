// Temporary audit: what is actually on screen at 1440×900 across the scene.
import { chromium } from "../../../Test 1/node_modules/playwright/index.mjs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const page_url = pathToFileURL(path.join(here, "..", "..", "index.html")).href;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(page_url);
await page.waitForTimeout(500);

const audit = () =>
  page.evaluate(() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return "нет элемента";
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        rect: [Math.round(rect.left), Math.round(rect.top), Math.round(rect.width), Math.round(rect.height)],
        opacity: style.opacity,
        visibility: style.visibility,
        display: style.display,
        text: (element.textContent || "").trim().slice(0, 40),
      };
    };
    return {
      scrollY: Math.round(scrollY),
      stage: document.documentElement.dataset.stage,
      theta: getComputedStyle(document.getElementById("sheet")).getPropertyValue("--theta").trim(),
      bar: box(".bar"),
      view: box(".bench__view"),
      scene: box("#scene"),
      sheet: box("#sheet"),
      stageText: box("#stages .stage.is-current"),
      frames: box("#frames"),
    };
  });

for (const progress of [0, 0.3, 0.62, 0.85, 1]) {
  await page.evaluate(async (value) => {
    const bench = document.getElementById("bench");
    const rect = bench.getBoundingClientRect();
    const travel = rect.height - innerHeight;
    scrollTo(0, scrollY + rect.top + travel * value);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, progress);
  await page.waitForTimeout(150);
  const data = await audit();
  const brief = (item) => (typeof item === "string" ? item : `${item.rect.join(",")} ${item.display}`);
  console.log(
    `p=${progress} scrollY=${data.scrollY} stage=${data.stage} theta=${data.theta}\n`
    + `  bar       ${brief(data.bar)}\n`
    + `  view      ${brief(data.view)}\n`
    + `  sheet     ${brief(data.sheet)}\n`
    + `  stageText ${brief(data.stageText)} «${typeof data.stageText === "string" ? "" : data.stageText.text.replace(/\s+/g, " ")}»\n`
    + `  frames    ${brief(data.frames)}`
  );
}

await browser.close();
