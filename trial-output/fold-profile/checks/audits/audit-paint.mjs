// Temporary audit: what is actually painted where, sampled as a coarse element map.
import { chromium } from "../../../Test 1/node_modules/playwright/index.mjs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const page_url = pathToFileURL(path.join(here, "..", "..", "index.html")).href;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(page_url);
await page.waitForTimeout(500);

const paintMap = () =>
  page.evaluate(() => {
    const grid = [];
    for (let row = 0; row < 18; row += 1) {
      let line = "";
      for (let column = 0; column < 40; column += 1) {
        const x = 240 + column * 11;
        const y = 40 + row * 48;
        const element = document.elementFromPoint(x, y);
        if (!element) { line += "?"; continue; }
        const name = element.className && typeof element.className === "string"
          ? element.className.split(" ")[0]
          : element.tagName.toLowerCase();
        line += { "sheet__near": "N", "sheet__far": "F", "sheet__shade": "S", "sheet__crease": "C", "sheet__shadow": "H", sheet: "s", readout: "r", "bench__story": "T", stage: "t", bar: "b", body: "." }[name] || "#";
      }
      grid.push(line);
    }
    const parts = ["sheet__near", "sheet__far", "sheet__shade", "sheet__crease", "sheet__shadow"].map((name) => {
      const element = document.querySelector("." + name);
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return `${name}=[${[box.left, box.top, box.width, box.height].map(Math.round).join(",")}] opacity=${style.opacity} bg=${style.backgroundColor} tr=${style.transform.slice(0, 40)}`;
    });
    return { grid, parts, theta: getComputedStyle(document.getElementById("sheet")).getPropertyValue("--theta").trim() };
  });

for (const progress of [0, 0.5, 1]) {
  await page.evaluate(async (value) => {
    const bench = document.getElementById("bench");
    const rect = bench.getBoundingClientRect();
    const travel = rect.height - innerHeight;
    scrollTo(0, scrollY + rect.top + travel * value);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, progress);
  await page.waitForTimeout(200);
  const data = await paintMap();
  console.log(`\n=== p=${progress}, угол ${data.theta} ===`);
  console.log("N near, F far, S shade, C crease, H shadow, . фоновое, # прочее");
  data.grid.forEach((line) => console.log("  " + line));
  data.parts.forEach((part) => console.log("  " + part));
}

await browser.close();
