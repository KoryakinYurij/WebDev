/* Проверки arm A. Браузер берётся из уже установленного Playwright в Test 1/node_modules:
   ничего не устанавливается и не скачивается. Скрипт пишет checks/report.txt и снимки в evidence/. */

import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const here = import.meta.dirname;
const arm = path.resolve(here, "..");
const workspace = path.resolve(here, "../../..");
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(workspace, "Test 1/node_modules/playwright"));
const { AxeBuilder } = require(path.join(workspace, "Test 1/node_modules/@axe-core/playwright"));

const results = [];
const lines = [];
function check(id, name, ok, detail) {
  results.push({ id, name, status: ok ? "pass" : "fail", detail });
  lines.push(`${ok ? "ok  " : "FAIL"} ${id} ${name} — ${detail}`);
}
function note(text) { lines.push(`     ${text}`); }

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const url = "file://" + path.join(arm, "index.html").replace(/\\/g, "/");
const distUrl = "file://" + path.join(arm, "dist/index.html").replace(/\\/g, "/");

const html = await readFile(path.join(arm, "index.html"), "utf8");
const css = await readFile(path.join(arm, "styles.css"), "utf8");
const js = await readFile(path.join(arm, "main.js"), "utf8");
const dist = await readFile(path.join(arm, "dist/index.html"), "utf8");

/* ---------- статические проверки ---------- */

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
check("S01", "уникальные id", duplicates.length === 0, `id всего ${ids.length}, дубликатов ${duplicates.length}`);

const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
const missingAnchors = anchors.filter((anchor) => !ids.includes(anchor));
check("S02", "внутренние якоря разрешаются", missingAnchors.length === 0,
  `якорей ${anchors.length}, битых ${missingAnchors.length}${missingAnchors.length ? ": " + missingAnchors.join(", ") : ""}`);

const ariaRefs = [...html.matchAll(/aria-(?:labelledby|describedby)="([^"]+)"/g)]
  .flatMap((match) => match[1].split(/\s+/))
  .filter((value) => value && !ids.includes(value));
check("S03", "aria-ссылки разрешаются", ariaRefs.length === 0, `битых ${ariaRefs.length}${ariaRefs.length ? ": " + ariaRefs.join(", ") : ""}`);

const externals = [...dist.matchAll(/(?:src|href)="(?!data:|#)([^"]+)"/g)].map((match) => match[1]);
check("S04", "автономный экспорт без внешних ссылок", externals.length === 0, `внешних ссылок ${externals.length}`);

const delivered = sha256(await readFile(path.join(arm, "dist/index.html")));
execFileSync(process.execPath, [path.join(arm, "build.mjs")], { cwd: arm });
const buildA = sha256(await readFile(path.join(arm, "dist/index.html")));
execFileSync(process.execPath, [path.join(arm, "build.mjs")], { cwd: arm });
const buildB = sha256(await readFile(path.join(arm, "dist/index.html")));
check("S05", "сборка воспроизводима", buildA === buildB, `sha256 ${buildA.slice(0, 16)}… дважды`);
check("S06", "готовый экспорт соответствует сборке", delivered === buildA,
  delivered === buildA ? "совпадает" : "устарел после правки исходников: пересобрать");

const tokens = Object.fromEntries([...css.matchAll(/--(paper|ink|ink-soft|accent):\s*(#[0-9a-f]{6})/gi)]
  .map((match) => [match[1].toLowerCase(), match[2]]));
function luminance(hex) {
  const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
function ratio(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
const contrast = {
  "текст на бумаге": ratio(tokens.ink, tokens.paper),
  "второстепенный текст": ratio(tokens["ink-soft"], tokens.paper),
  "акцент на бумаге": ratio(tokens.accent, tokens.paper),
  "подпись кнопки": ratio(tokens.paper, tokens.ink)
};
const worst = Math.min(...Object.values(contrast));
check("S07", "контраст по формулам WCAG", worst >= 4.5,
  Object.entries(contrast).map(([name, value]) => `${name} ${value.toFixed(2)}:1`).join(", "));

/* ---------- браузерные проверки ---------- */

await mkdir(path.join(arm, "evidence"), { recursive: true });
const browser = await chromium.launch();
const browserVersion = browser.version();
const shots = [];
async function shot(page, name) {
  const file = path.join(arm, "evidence", `${name}.png`);
  await page.screenshot({ path: file });
  shots.push(`${name}.png`);
}

const consoleErrors = [];
const requests = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => consoleErrors.push(String(error)));
page.on("request", (request) => requests.push(request.url()));
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(400);

check("B01", "консоль без ошибок", consoleErrors.length === 0, `сообщений об ошибке ${consoleErrors.length}`);
const externalRequests = requests.filter((request) => !request.startsWith("file:"));
check("B02", "нет сетевых запросов", externalRequests.length === 0,
  `запросов всего ${requests.length}, внешних ${externalRequests.length}`);

const viewports = [[320, 800], [390, 844], [768, 1024], [1440, 900], [1440, 600]];
for (const [width, height] of viewports) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(150);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`B03 ${width}×${height}`, "нет горизонтальной прокрутки", overflow <= 1, `переполнение ${overflow}px`);
}
await page.setViewportSize({ width: 1440, height: 600 });
const actionInView = await page.evaluate(() => {
  const link = document.querySelector(".action").getBoundingClientRect();
  return link.top >= 0 && link.bottom <= window.innerHeight;
});
check("B04", "на 1440×600 главное действие видно без прокрутки", actionInView, `ссылка в первом экране: ${actionInView}`);

await page.setViewportSize({ width: 1440, height: 900 });
await page.evaluate(() => window.scrollTo(0, 0));
await shot(page, "01-hero-1440");

const lineLength = await page.evaluate(() => Math.max(...[...document.querySelectorAll("p, li, dd")]
  .map((element) => element.getBoundingClientRect().width)));
check("B05", "длина строки ограничена", lineLength <= 760, `самый широкий текстовый блок ${Math.round(lineLength)}px`);

const focus = {};
for (const selector of [".action", "#motion-toggle", "#fold-toggle"]) {
  focus[selector] = await page.evaluate((sel) => {
    const element = document.querySelector(sel);
    element.focus();
    const style = getComputedStyle(element);
    return { width: parseFloat(style.outlineWidth), style: style.outlineStyle };
  }, selector);
}
const focusVisible = Object.values(focus).every((value) => value.width >= 2 && value.style !== "none");
check("B06", "видимый фокус у действия и переключателей", focusVisible,
  Object.entries(focus).map(([selector, value]) => `${selector} ${value.width}px ${value.style}`).join(", "));

const targets = await page.evaluate(() => [...document.querySelectorAll("a.action, button, .masthead__nav a")]
  .map((element) => { const box = element.getBoundingClientRect(); return { name: element.textContent.trim().slice(0, 24), w: box.width, h: box.height }; }));
const tooSmall = targets.filter((target) => target.w < 24 || target.h < 24);
check("B07", "размер интерактивных целей", tooSmall.length === 0,
  `проверено ${targets.length}, меньше 24×24 ${tooSmall.length}${tooSmall.length ? ": " + tooSmall.map((t) => t.name).join(", ") : ""}`);

/* клавиатура: Tab до кнопки схемы, активация Enter и Space */
await page.keyboard.press("Tab");
const tabOrder = [];
for (let index = 0; index < 9; index += 1) {
  tabOrder.push(await page.evaluate(() => document.activeElement.textContent.replace(/\s+/g, " ").trim().slice(0, 28)));
  await page.keyboard.press("Tab");
}
check("B08", "клавиатурный обход доходит до переключателей", tabOrder.some((item) => /Показать сгиб/.test(item)),
  `порядок: ${tabOrder.filter(Boolean).join(" → ")}`);

await page.focus("#fold-toggle");
await page.keyboard.press("Enter");
const foldedByKeyboard = await page.evaluate(() => document.querySelector(".scheme").classList.contains("is-folded"));
await shot(page, "02-scheme-folded");
await page.keyboard.press("Space");
const flatAgain = await page.evaluate(() => !document.querySelector(".scheme").classList.contains("is-folded"));
check("B09", "кнопка схемы работает Enter и Space", foldedByKeyboard && flatAgain,
  `Enter сложил: ${foldedByKeyboard}, Space вернул: ${flatAgain}`);

/* прокрутка не меняет ручной выбор схемы */
await page.focus("#fold-toggle");
await page.keyboard.press("Enter");
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.evaluate(() => window.scrollTo(0, 0));
const stillFolded = await page.evaluate(() => document.querySelector(".scheme").classList.contains("is-folded"));
check("B10", "прокрутка не меняет ручной выбор", stillFolded, `после прокрутки схема сложена: ${stillFolded}`);
await page.focus("#fold-toggle");
await page.keyboard.press("Enter");

/* сцена на широком экране: три кадра равнозначны, текущего нет */
const wideScene = await page.evaluate(() => {
  const scene = document.getElementById("scene");
  const stages = [...scene.querySelectorAll(".stage")];
  return {
    enhanced: scene.dataset.enhanced,
    current: stages.filter((stage) => stage.classList.contains("is-current")).length,
    opacities: stages.map((stage) => Number(getComputedStyle(stage.querySelector("svg")).opacity).toFixed(2)),
    columns: new Set(stages.map((stage) => Math.round(stage.getBoundingClientRect().top))).size
  };
});
check("B11", "на широком экране кадры показаны равнозначно", wideScene.enhanced === "false"
  && wideScene.current === 0 && wideScene.opacities.every((value) => value === "1.00"),
  `enhanced=${wideScene.enhanced}, подчёркнуто ${wideScene.current}, прозрачности ${wideScene.opacities.join("/")}, различных вертикальных позиций ${wideScene.columns}`);
await shot(page, "03-scene-1440");

/* уменьшенное движение */
await page.emulateMedia({ reducedMotion: "reduce" });
await page.waitForTimeout(300);
const reduced = await page.evaluate(() => {
  const stages = [...document.querySelectorAll(".stage")];
  return {
    motion: document.documentElement.dataset.motion,
    opacities: stages.map((stage) => Number(getComputedStyle(stage.querySelector("svg")).opacity).toFixed(2)),
    transitions: stages.map((stage) => getComputedStyle(stage.querySelector("svg")).transitionDuration),
    toggleDisabled: document.getElementById("motion-toggle").disabled,
    note: document.getElementById("motion-note").textContent.trim()
  };
});
check("B12", "системное уменьшение движения действует", reduced.motion === "reduced"
  && reduced.opacities.every((value) => value === "1.00")
  && reduced.transitions.every((value) => value === "0s" || value.startsWith("0s"))
  && reduced.toggleDisabled,
  `data-motion=${reduced.motion}, прозрачности ${reduced.opacities.join("/")}, переходы ${reduced.transitions.join("/")}, переключатель disabled=${reduced.toggleDisabled}`);
note(`заметка в этом режиме: ${reduced.note}`);
await shot(page, "04-reduced-motion");
await page.emulateMedia({ reducedMotion: "no-preference" });

/* мобильный кадр */
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(200);
await shot(page, "05-hero-390");

/* увеличение текста 200% и интервалы */
await page.setViewportSize({ width: 1440, height: 900 });
await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
await page.waitForTimeout(200);
const zoomOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("B13", "текст 200% без потери содержания", zoomOverflow <= 1, `переполнение ${zoomOverflow}px`);
await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
await page.addStyleTag({ content: `* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p, li, dd { margin-bottom: 2em !important; }` });
await page.waitForTimeout(200);
const spacing = await page.evaluate(() => {
  const clipped = [...document.querySelectorAll("p, li, dd, dt, h1, h2, h3")]
    .filter((element) => element.scrollHeight > element.clientHeight + 2 || element.scrollWidth > element.clientWidth + 2);
  return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, clipped: clipped.length };
});
check("B14", "настройки интервалов не обрезают текст", spacing.overflow <= 1 && spacing.clipped === 0,
  `переполнение ${spacing.overflow}px, обрезанных блоков ${spacing.clipped}`);
await shot(page, "06-text-spacing");

/* главное действие и имена фокусируемых элементов */
await page.setViewportSize({ width: 1440, height: 900 });
await page.evaluate(() => window.scrollTo(0, 0));
await page.click(".action");
await page.waitForTimeout(250);
const actionTarget = await page.evaluate(() => {
  const box = document.querySelector("#first-fold").getBoundingClientRect();
  return { hash: location.hash, top: Math.round(box.top), height: Math.round(box.height) };
});
check("B18", "главное действие ведёт к разделу с шагами", actionTarget.hash === "#first-fold"
  && actionTarget.top < 900 && actionTarget.height > 200,
  `hash=${actionTarget.hash}, раздел начинается на ${actionTarget.top}px при окне 900px`);

const unnamed = await page.evaluate(() => [...document.querySelectorAll("a[href], button")]
  .filter((element) => !(element.textContent.replace(/\s+/g, " ").trim() || element.getAttribute("aria-label")))
  .map((element) => element.tagName + (element.id ? "#" + element.id : "")));
check("B19", "у всех ссылок и кнопок есть доступное имя", unnamed.length === 0,
  `без имени ${unnamed.length}${unnamed.length ? ": " + unnamed.join(", ") : ""}`);

/* сцена на узком экране: кадры идут подряд, текущий следует за прокруткой в обе стороны */
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);
const backwards = await page.evaluate(async () => {
  const stages = [...document.querySelectorAll(".stage")];
  const current = () => stages.findIndex((stage) => stage.classList.contains("is-current"));
  const scene = document.getElementById("scene");
  document.querySelector('[data-stage="2"]').scrollIntoView({ block: "center" });
  await new Promise((resolve) => setTimeout(resolve, 450));
  const last = current();
  const enhancedNarrow = scene.dataset.enhanced;
  document.querySelector('[data-stage="0"]').scrollIntoView({ block: "center" });
  await new Promise((resolve) => setTimeout(resolve, 450));
  return { last, first: current(), enhancedNarrow };
});
await page.setViewportSize({ width: 375, height: 812 });
await page.waitForTimeout(300);
const stillOne = await page.evaluate(() => document.querySelectorAll(".stage.is-current").length);
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(300);
const wideAfterResize = await page.evaluate(() => ({
  enhanced: document.getElementById("scene").dataset.enhanced,
  current: document.querySelectorAll(".stage.is-current").length
}));
check("B20", "сцена работает назад и переключается на resize", backwards.enhancedNarrow === "true"
  && backwards.last === 2 && backwards.first === 0 && stillOne === 1
  && wideAfterResize.enhanced === "false" && wideAfterResize.current === 0,
  `узко: вниз → ${backwards.last}, назад → ${backwards.first}, при 375px подчёркнуто ${stillOne}; широко: enhanced=${wideAfterResize.enhanced}, подчёркнуто ${wideAfterResize.current}`);

/* опись композиции: числа вместо впечатления (оценка вкуса — не здесь) */
const layout = await page.evaluate(() => {
  const sections = [...document.querySelectorAll(".masthead, .hero, .states, .practice, .questions, .foot")].map((section) => {
    const box = section.getBoundingClientRect();
    const text = [...section.querySelectorAll("p, li, dd, dt, h1, h2, h3, figcaption")]
      .reduce((sum, element) => sum + element.getBoundingClientRect().height, 0);
    return {
      name: section.className.split(" ")[0] || section.tagName.toLowerCase(),
      top: Math.round(box.top + window.scrollY),
      height: Math.round(box.height),
      textShare: Math.round((text / box.height) * 100)
    };
  });
  return { pageHeight: document.documentElement.scrollHeight, sections };
});
note(`высота страницы на 1440×900: ${layout.pageHeight}px`);
for (const section of layout.sections) {
  note(`  ${section.name}: высота ${section.height}px, текст занимает ${section.textShare}% высоты, начало ${section.top}px`);
}
const thin = layout.sections.filter((section) => section.height > 520 && section.textShare < 35);
note(thin.length
  ? `разреженные секции (больше 520px и меньше 35% текста): ${thin.map((section) => section.name).join(", ")}`
  : "секций, состоящих из пустого места, не найдено по этому измерению");

/* доступность: axe */
await page.goto(url, { waitUntil: "load" });
const axe = await new AxeBuilder({ page }).analyze();
const serious = axe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
check("B15", "axe: ни одной ошибки serious/critical", serious.length === 0,
  `нарушений всего ${axe.violations.length}, serious/critical ${serious.length}${serious.length ? ": " + serious.map((violation) => violation.id + " [" + violation.nodes.map((node) => node.target.join(" ")).join("; ") + "]").join(", ") : ""}`);
for (const violation of axe.violations) {
  note(`${violation.impact}: ${violation.id} — ${violation.help}`);
  for (const node of violation.nodes) note(`  ${node.target.join(" ")}: ${node.failureSummary.replace(/\s+/g, " ")}`);
}

/* без скриптов */
const noJsContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
const noJsPage = await noJsContext.newPage();
await noJsPage.goto(url, { waitUntil: "load" });
const noJs = await noJsPage.evaluate(() => ({
  steps: document.querySelectorAll(".steps li").length,
  faq: document.querySelectorAll(".faq dd").length,
  stages: document.querySelectorAll(".stage").length,
  buttonsVisible: [...document.querySelectorAll("#motion-toggle, #fold-toggle")].filter((button) => !button.hidden).length,
  fallback: Boolean(document.querySelector(".scheme__fallback").textContent.trim()),
  actionVisible: getComputedStyle(document.querySelector(".action")).display !== "none"
}));
check("B16", "без скриптов рассказ и главное действие читаются", noJs.steps === 3 && noJs.faq === 3 && noJs.stages === 3
  && noJs.actionVisible && noJs.fallback && noJs.buttonsVisible === 0,
  `шагов ${noJs.steps}, вопросов ${noJs.faq}, состояний ${noJs.stages}, видимых кнопок ${noJs.buttonsVisible}, текст-замена ${noJs.fallback}`);
await noJsPage.screenshot({ path: path.join(arm, "evidence", "07-no-js.png") });
shots.push("07-no-js.png");

/* автономный экспорт */
const distContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const distPage = await distContext.newPage();
const distRequests = [];
distPage.on("request", (request) => distRequests.push(request.url()));
await distPage.goto(distUrl, { waitUntil: "load" });
await distPage.waitForTimeout(300);
const distOk = await distPage.evaluate(() => ({
  title: document.querySelector("h1").textContent.trim(),
  stages: document.querySelectorAll(".stage").length,
  button: !document.getElementById("fold-toggle").hidden
}));
check("B17", "экспорт открывается файлом и работает", distOk.stages === 3 && distOk.button
  && distRequests.every((request) => request.startsWith("file:")),
  `заголовок «${distOk.title}», состояний ${distOk.stages}, запросов ${distRequests.length}`);
await distPage.screenshot({ path: path.join(arm, "evidence", "08-export-1440.png") });
shots.push("08-export-1440.png");

await browser.close();

/* ---------- отчёт ---------- */

const failed = results.filter((result) => result.status === "fail");
const header = [
  "Проверки arm A (fold-core)",
  `Дата: ${new Date().toISOString().slice(0, 10)}. Браузер: Chromium ${browserVersion} (Playwright из Test 1/node_modules, ничего не устанавливалось).`,
  `Пройдено ${results.length - failed.length} из ${results.length}. Снимки: ${shots.join(", ")}.`,
  "",
  "Статические проверки выполнил скрипт; браузерные — реальный Chromium по file:// без сервера.",
  ""
].join("\n");
await writeFile(path.join(arm, "checks/report.txt"), header + lines.join("\n") + "\n", "utf8");
console.log(header + lines.join("\n"));
console.log(`\n${failed.length ? "ПРОВАЛЕНО: " + failed.length : "Все проверки пройдены"}`);
process.exit(failed.length ? 1 : 0);
