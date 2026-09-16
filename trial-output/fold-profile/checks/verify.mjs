/* Проверки arm B. Каркас тот же, что у arm A (один инструмент на оба плеча), список проверок
   свой: у профиля свои требования — закрепление только при подходящем месте, границы стадий
   в обе стороны, возврат места чтения, состояния без скриптов и при уменьшенном движении.
   Браузер берётся из Test 1/node_modules: ничего не устанавливается. */

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

const delivered = sha256(await readFile(path.join(arm, "dist/index.html")));
const distText = await readFile(path.join(arm, "dist/index.html"), "utf8");
const externals = [...distText.matchAll(/(?:src|href)="(?!data:|#)([^"]+)"/g)].map((match) => match[1]);
check("S04", "автономный экспорт без внешних ссылок", externals.length === 0, `внешних ссылок ${externals.length}`);

execFileSync(process.execPath, [path.join(arm, "build.mjs")], { cwd: arm });
const buildA = sha256(await readFile(path.join(arm, "dist/index.html")));
execFileSync(process.execPath, [path.join(arm, "build.mjs")], { cwd: arm });
const buildB = sha256(await readFile(path.join(arm, "dist/index.html")));
check("S05", "сборка воспроизводима", buildA === buildB, `sha256 ${buildA.slice(0, 16)}… дважды`);
check("S06", "готовый экспорт соответствует сборке", delivered === buildA,
  delivered === buildA ? "совпадает" : "устарел после правки исходников: пересобрать");

const tokens = Object.fromEntries([...css.matchAll(/--(table|paper|ink|muted|accent):\s*(#[0-9a-f]{6})/gi)]
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
  "текст на столе": ratio(tokens.ink, tokens.table),
  "второстепенный текст на столе": ratio(tokens.muted, tokens.table),
  "акцент на столе": ratio(tokens.accent, tokens.table),
  "подпись кнопки": ratio(tokens.paper, tokens.accent),
  "текст на листе": ratio(tokens.ink, tokens.paper)
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
  await page.screenshot({ path: path.join(arm, "evidence", `${name}.png`) });
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
check("B02", "нет сетевых запросов", requests.filter((request) => !request.startsWith("file:")).length === 0,
  `запросов всего ${requests.length}, внешних ${requests.filter((request) => !request.startsWith("file:")).length}`);

/* помощники для сцены */
const scene = async (progress) => page.evaluate(async (value) => {
  const bench = document.getElementById("bench");
  const box = bench.getBoundingClientRect();
  const travel = box.height - window.innerHeight;
  const top = window.scrollY + box.top;
  window.scrollTo({ top: value === null ? top + travel : top + travel * value, behavior: "auto" });
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const sheet = document.getElementById("sheet");
  return {
    theta: Number(getComputedStyle(sheet).getPropertyValue("--theta")),
    angle: document.getElementById("angle").textContent,
    stage: document.documentElement.dataset.stage,
    live: document.documentElement.classList.contains("is-live"),
    current: [...document.querySelectorAll(".stage.is-current")].map((stage) => stage.dataset.stage).join(",")
  };
}, progress);

/* Щелчок по координатам, а не page.click: липкая строка стоит в потоке в начале
   документа, и Playwright, прокручивая её «в поле зрения», берёт позицию в потоке
   и уводит страницу к началу — то есть меняет именно то место чтения, которое
   проверяет B18. Прокрутку делаем сами и только если элемента не видно:
   в липкой раскладке виден всегда, в статической — значит читатель до неё дошёл. */
const bringIntoView = async (selector) => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const box = await page.locator(selector).boundingBox();
    if (!box) throw new Error(`нет видимого элемента ${selector}`);
    const viewport = page.viewportSize().height;
    if (box.y >= 8 && box.y + box.height <= viewport - 8) return box;
    const delta = box.y < 8 ? box.y - 80 : box.y + box.height - viewport + 80;
    await page.evaluate((value) => window.scrollBy(0, value), delta);
    await page.waitForTimeout(120);
  }
  throw new Error(`не удалось показать ${selector}`);
};

const clickInPlace = async (selector) => {
  const box = await bringIntoView(selector);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};

const start = await scene(0);
const middle = await scene(0.5);
const end = await scene(1);
await shot(page, "01-scene-end");
const beyond = await page.evaluate(async () => {
  window.scrollTo({ top: document.body.scrollHeight, behavior: "auto" });
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return Number(getComputedStyle(document.getElementById("sheet")).getPropertyValue("--theta"));
});
const clamped = [start, middle, end].every((state) => Number.isFinite(state.theta) && state.theta >= 0 && state.theta <= 172);
check("B12", "угол идёт от плоскости к вертикали и к сложенному листу", clamped
  && start.theta < 1 && Math.abs(middle.theta - 86) < 6 && Math.abs(end.theta - 172) < 1 && Math.abs(beyond - 172) < 1,
  `начало ${start.theta}°, середина ${middle.theta}° (${middle.angle}), конец ${end.theta}°, за пределами ${beyond}°`);

const backToMiddle = await scene(0.5);
const backToStart = await scene(0);
check("B13", "ход обратим", Math.abs(backToMiddle.theta - middle.theta) < 0.01 && backToStart.theta < 1,
  `середина повторно ${backToMiddle.theta}° (было ${middle.theta}°), назад к началу ${backToStart.theta}°`);

const fast = await page.evaluate(async () => {
  window.scrollTo({ top: document.body.scrollHeight / 2, behavior: "auto" });
  window.scrollTo({ top: 0, behavior: "auto" });
  window.scrollTo({ top: document.body.scrollHeight, behavior: "auto" });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const value = Number(getComputedStyle(document.getElementById("sheet")).getPropertyValue("--theta"));
  return { value, stage: document.documentElement.dataset.stage };
});
check("B14", "быстрая прокрутка не ломает сцену", Number.isFinite(fast.value) && Math.abs(fast.value - 172) < 1 && fast.stage === "2",
  `после трёх перескоков ${fast.value}°, стадия ${fast.stage}`);

const walk = [];
for (const progress of [0, 0.2, 0.4, 0.8, 0.4, 0.2, 0]) {
  walk.push((await scene(progress)).stage);
}
check("B15", "границы стадий в обе стороны", walk.join("") === "0012100",
  `прогресс 0 / 0,2 / 0,4 / 0,8 / 0,4 / 0,2 / 0 даёт стадии ${walk.join("→")}`);

const resizeScene = await page.evaluate(async () => {
  const bench = document.getElementById("bench");
  const box = bench.getBoundingClientRect();
  const travel = box.height - window.innerHeight;
  window.scrollTo({ top: window.scrollY + box.top + travel * 0.5, behavior: "auto" });
  await new Promise((resolve) => requestAnimationFrame(resolve));
  return true;
});
await page.setViewportSize({ width: 1440, height: 400 });
await page.waitForTimeout(350);
const shortScreen = await page.evaluate(() => ({
  live: document.documentElement.classList.contains("is-live"),
  frames: getComputedStyle(document.getElementById("frames")).display,
  theta: getComputedStyle(document.getElementById("sheet")).getPropertyValue("--theta")
}));
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(400);
const backWide = await page.evaluate(() => ({
  live: document.documentElement.classList.contains("is-live"),
  stage: document.documentElement.dataset.stage,
  theta: Number(getComputedStyle(document.getElementById("sheet")).getPropertyValue("--theta"))
}));
check("B16", "resize посреди сцены и короткий экран", resizeScene && shortScreen.live === false
  && shortScreen.frames !== "none" && Number.isFinite(backWide.theta) && backWide.live === true,
  `на 1440×400: живая сцена ${shortScreen.live}, кадры ${shortScreen.frames}; обратно: живая ${backWide.live}, стадия ${backWide.stage}, угол ${backWide.theta.toFixed(1)}°`);
await shot(page, "02-short-screen");

/* закрепление только при подходящем месте */
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(300);
const pinned = await page.evaluate(() => ({
  position: getComputedStyle(document.querySelector(".bench__view")).position,
  frames: getComputedStyle(document.getElementById("frames")).display,
  benchHeight: Math.round(document.getElementById("bench").getBoundingClientRect().height)
}));
await page.setViewportSize({ width: 900, height: 800 });
await page.waitForTimeout(350);
const narrow = await page.evaluate(() => ({
  position: getComputedStyle(document.querySelector(".bench__view")).position,
  frames: getComputedStyle(document.getElementById("frames")).display,
  live: document.documentElement.classList.contains("is-live")
}));
check("B11", "закрепление только когда сцена помещается", pinned.position === "sticky" && pinned.frames === "none"
  && narrow.live === false && narrow.position !== "sticky" && narrow.frames !== "none",
  `узко-широко: sticky=${pinned.position} при высоте секции ${pinned.benchHeight}px и кадрах ${pinned.frames}; на 900px живая ${narrow.live}, положение ${narrow.position}, кадры ${narrow.frames}`);

/* место чтения при смене режима */
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(350);
await scene(0.84);
const beforeToggle = await page.evaluate(() => document.documentElement.dataset.stage);
await clickInPlace("#motion-toggle");
await page.waitForTimeout(500);
const afterReduced = await page.evaluate(() => {
  const items = [...document.querySelectorAll(".frames__list li")];
  const line = window.innerHeight * 0.55;
  const distances = items.map((item) => {
    const box = item.getBoundingClientRect();
    return Math.round(Math.abs(box.top + box.height / 2 - line));
  });
  /* Кадры стоят в ряд, поэтому вертикальное расстояние одинаково у всех трёх:
     место чтения берём по отметке, а расстояние проверяем как геометрию. */
  const marked = items.findIndex((item) => item.getAttribute("data-current") === "true");
  return {
    distances,
    marked,
    ariaCurrent: marked >= 0 ? items[marked].getAttribute("aria-current") : null,
    visible: items.filter((item) => item.getBoundingClientRect().height > 0).length,
    live: document.documentElement.classList.contains("is-live"),
  };
});
await shot(page, "03-reduced-frames");
await clickInPlace("#motion-toggle");
await page.waitForTimeout(500);
const afterBack = await page.evaluate(() => ({
  stage: document.documentElement.dataset.stage,
  live: document.documentElement.classList.contains("is-live"),
  motion: document.documentElement.dataset.motion,
  pressed: document.getElementById("motion-toggle").getAttribute("aria-pressed"),
  storage: localStorage.getItem("fold-profile.motion"),
  current: [...document.querySelectorAll(".stage.is-current")].map((stage) => stage.dataset.stage).join(",")
}));
check("B18", "место чтения сохраняется при смене режима",
  beforeToggle === "2" && afterReduced.live === false && afterReduced.marked === 2
  && afterReduced.ariaCurrent === "true" && afterReduced.distances[2] <= 2
  && afterBack.live === true && afterBack.stage === "2",
  `до переключения стадия ${beforeToggle}; отмечен кадр ${afterReduced.marked} `
  + `(aria-current=${afterReduced.ariaCurrent}, расстояние до линии чтения ${afterReduced.distances[2]}px, видимых кадров ${afterReduced.visible}, живая ${afterReduced.live}); `
  + `после возврата стадия ${afterBack.stage}, живая ${afterBack.live}, data-motion=${afterBack.motion}, `
  + `aria-pressed=${afterBack.pressed}, запись ${afterBack.storage}`);

/* системное уменьшение движения */
await page.emulateMedia({ reducedMotion: "reduce" });
await page.waitForTimeout(400);
const reduced = await page.evaluate(() => ({
  motion: document.documentElement.dataset.motion,
  live: document.documentElement.classList.contains("is-live"),
  frames: getComputedStyle(document.getElementById("frames")).display,
  disabled: document.getElementById("motion-toggle").disabled,
  pressed: document.getElementById("motion-toggle").getAttribute("aria-pressed"),
  note: document.getElementById("motion-note").textContent.trim(),
  transition: getComputedStyle(document.querySelector(".sheet__far")).transitionDuration
}));
check("B17", "системное уменьшение движения: статические кадры вместо сцены", reduced.motion === "reduced"
  && reduced.live === false && reduced.frames !== "none" && reduced.disabled === true
  && reduced.transition.split(",").every((value) => value.trim() === "0s"),
  `data-motion=${reduced.motion}, живая сцена ${reduced.live}, кадры ${reduced.frames}, переключатель disabled=${reduced.disabled}, aria-pressed=${reduced.pressed}, переход ${reduced.transition}`);
note(`заметка в этом режиме: ${reduced.note}`);
await shot(page, "04-reduced-system");
await page.emulateMedia({ reducedMotion: "no-preference" });
await page.waitForTimeout(300);

/* прогресс не объявляется голосом, декоративный лист скрыт от дерева доступности */
const semantics = await page.evaluate(() => ({
  live: document.querySelectorAll('#states [aria-live], #states [role="status"]').length,
  sheetHidden: document.getElementById("sheet").getAttribute("aria-hidden"),
  schemeTitle: document.getElementById("scheme-title").textContent.trim(),
  schemeState: document.getElementById("scheme-state").textContent.trim().length
}));
const sheetSnapshot = (await page.locator("#sheet").ariaSnapshot()).trim();
check("B19", "прогресс прокрутки не объявляется и лист скрыт от дерева доступности",
  semantics.live === 0 && semantics.sheetHidden === "true" && sheetSnapshot.length === 0 && semantics.schemeState > 0,
  `aria-live внутри сцены ${semantics.live}, aria-hidden листа ${semantics.sheetHidden}, снапшот листа «${sheetSnapshot.slice(0, 12)}», описание схемы ${semantics.schemeState} символов`);

/* рассказ о сцене виден и не перекрыт сценой — то, что не ловит ни одна проверка
   разметки: технически всё на месте, а читатель видит только лист */
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(350);
const storySight = [];
for (const value of [0, 0.3, 0.62, 0.85, 1]) {
  await scene(value);
  storySight.push(await page.evaluate(() => {
    const current = document.querySelector("#stages .stage.is-current");
    const sheetBox = document.getElementById("sheet").getBoundingClientRect();
    const box = current.getBoundingClientRect();
    const title = document.querySelector(".bench__story h2").getBoundingClientRect();
    return {
      inside: box.top >= 0 && box.bottom <= innerHeight,
      separated: box.left >= sheetBox.right - 1,
      showsText: current.textContent.trim().length > 20,
      titleInside: title.top >= 0 && title.bottom <= innerHeight,
      overlap: Math.round(Math.max(0, Math.min(box.bottom, sheetBox.bottom) - Math.max(box.top, sheetBox.top))
        * Math.max(0, Math.min(box.right, sheetBox.right) - Math.max(box.left, sheetBox.left))),
    };
  }));
}
check("B22", "текущая стадия рассказа видна рядом со сценой на всём ходу",
  storySight.every((item) => item.inside && item.separated && item.showsText && item.overlap === 0),
  storySight.map((item, index) => `${[0, 0.3, 0.62, 0.85, 1][index]}: ${item.inside ? "в экране" : "вне экрана"}`
    + `, ${item.separated ? "рядом" : "под листом"}, перекрытие ${item.overlap}px²`).join("; "));
check("B23", "заголовок рассказа виден в кадре сцены",
  storySight.every((item) => item.titleInside),
  storySight.map((item) => (item.titleInside ? "виден" : "вне экрана")).join("/"));
await shot(page, "09-story-beside-scene");

/* переключатель движения доступен из середины сцены без прокрутки к началу */
await scene(0.5);
const toggleReach = await page.evaluate(() => {
  const box = document.getElementById("motion-toggle").getBoundingClientRect();
  const barBox = document.querySelector(".bar").getBoundingClientRect();
  return {
    top: Math.round(box.top),
    bottom: Math.round(box.bottom),
    viewport: window.innerHeight,
    live: document.documentElement.classList.contains("is-live"),
    motion: document.documentElement.dataset.motion,
    barTop: Math.round(barBox.top),
    scrollY: Math.round(scrollY),
  };
});
check("B21", "переключатель движения доступен из середины сцены", toggleReach.top >= 0 && toggleReach.bottom <= toggleReach.viewport,
  `кнопка на ${toggleReach.top}–${toggleReach.bottom}px при окне ${toggleReach.viewport}px`
  + ` (живая ${toggleReach.live}, data-motion=${toggleReach.motion}, строка на ${toggleReach.barTop}px, прокрутка ${toggleReach.scrollY}px)`);

/* клавиатура и цели */
await page.keyboard.press("Tab");
const focus = {};
for (const selector of [".action", "#motion-toggle", "#fold-toggle"]) {
  focus[selector] = await page.evaluate((sel) => {
    const element = document.querySelector(sel);
    element.focus();
    const style = getComputedStyle(element);
    return { width: parseFloat(style.outlineWidth), style: style.outlineStyle };
  }, selector);
}
check("B06", "видимый фокус у действия и переключателей",
  Object.values(focus).every((value) => value.width >= 2 && value.style !== "none"),
  Object.entries(focus).map(([selector, value]) => `${selector} ${value.width}px ${value.style}`).join(", "));

const targets = await page.evaluate(() => [...document.querySelectorAll("a.action, button, .bar__nav a")]
  .map((element) => { const box = element.getBoundingClientRect(); return { name: element.textContent.replace(/\s+/g, " ").trim().slice(0, 22), w: box.width, h: box.height }; }));
const tooSmall = targets.filter((target) => target.w < 24 || target.h < 24);
check("B07", "размер интерактивных целей", tooSmall.length === 0,
  `проверено ${targets.length}, меньше 24×24 ${tooSmall.length}${tooSmall.length ? ": " + tooSmall.map((target) => target.name).join(", ") : ""}`);

await page.evaluate(() => window.scrollTo(0, 0));
await page.keyboard.press("Tab");
const tabOrder = [];
for (let index = 0; index < 9; index += 1) {
  tabOrder.push(await page.evaluate(() => document.activeElement.textContent.replace(/\s+/g, " ").trim().slice(0, 26)));
  await page.keyboard.press("Tab");
}
check("B08", "клавиатурный обход доходит до переключателей",
  tabOrder.some((item) => /Показать сгиб/.test(item)) && tabOrder.some((item) => /Уменьшить движение/.test(item)),
  `порядок: ${tabOrder.filter(Boolean).join(" → ")}`);

await page.focus("#fold-toggle");
await page.keyboard.press("Enter");
const folded = await page.evaluate(() => document.getElementById("scheme").classList.contains("is-folded"));
await page.keyboard.press("Space");
const flat = await page.evaluate(() => !document.getElementById("scheme").classList.contains("is-folded"));
check("B09", "кнопка схемы работает Enter и Space", folded && flat, `Enter сложил: ${folded}, Space вернул: ${flat}`);

await page.focus("#fold-toggle");
await page.keyboard.press("Enter");
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.evaluate(() => window.scrollTo(0, 0));
const stillFolded = await page.evaluate(() => document.getElementById("scheme").classList.contains("is-folded"));
check("B10", "прокрутка не меняет ручной выбор схемы", stillFolded, `после прокрутки схема сложена: ${stillFolded}`);
await page.focus("#fold-toggle");
await page.keyboard.press("Enter");

/* главное действие и имена */
await page.evaluate(() => window.scrollTo(0, 0));
await page.click(".action");
await page.waitForTimeout(250);
const actionTarget = await page.evaluate(() => {
  const box = document.querySelector("#first-fold").getBoundingClientRect();
  return { hash: location.hash, top: Math.round(box.top), height: Math.round(box.height) };
});
check("B18b", "главное действие ведёт к разделу с шагами", actionTarget.hash === "#first-fold"
  && actionTarget.top < 900 && actionTarget.height > 200,
  `hash=${actionTarget.hash}, раздел начинается на ${actionTarget.top}px при окне 900px`);

const unnamed = await page.evaluate(() => [...document.querySelectorAll("a[href], button")]
  .filter((element) => !(element.textContent.replace(/\s+/g, " ").trim() || element.getAttribute("aria-label")))
  .map((element) => element.tagName + (element.id ? "#" + element.id : "")));
check("B19b", "у всех ссылок и кнопок есть доступное имя", unnamed.length === 0,
  `без имени ${unnamed.length}${unnamed.length ? ": " + unnamed.join(", ") : ""}`);

/* размеры экранов, длина строки, увеличение текста, интервалы */
for (const [width, height] of [[320, 800], [390, 844], [768, 1024], [1440, 900], [1440, 600]]) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(250);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`B03 ${width}×${height}`, "нет горизонтальной прокрутки", overflow <= 1, `переполнение ${overflow}px`);
}
await page.setViewportSize({ width: 1440, height: 600 });
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(200);
const actionInView = await page.evaluate(() => {
  const box = document.querySelector(".action").getBoundingClientRect();
  return box.top >= 0 && box.bottom <= window.innerHeight;
});
check("B04", "на 1440×600 главное действие видно без прокрутки", actionInView, `ссылка в первом экране: ${actionInView}`);

await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(250);
/* Меряем только связный текст: широкая строка мешает читать прозу,
   а приборная выноска (угол листа) — не строка для чтения. */
const textBlocks = await page.evaluate(() => [...document.querySelectorAll("p, li, dd")]
  .filter((element) => (element.textContent || "").trim().length >= 60)
  .map((element) => ({
    width: Math.round(element.getBoundingClientRect().width),
    where: `${element.tagName.toLowerCase()}.${(element.className || "—").split(" ")[0]}`
      + (element.closest("#frames") ? " в кадрах" : element.closest(".bar") ? " в строке" : "")
  }))
  .sort((first, second) => second.width - first.width)
  .slice(0, 4));
const lineLength = textBlocks[0].width;
check("B05", "длина строки ограничена", lineLength <= 780,
  `самые широкие текстовые блоки: ${textBlocks.map((item) => `${item.where} ${item.width}px`).join(", ")}`);

await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
await page.waitForTimeout(250);
const zoomOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("B13b", "текст 200% без потери содержания", zoomOverflow <= 1, `переполнение ${zoomOverflow}px`);
await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
await page.addStyleTag({ content: `* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p, li, dd { margin-bottom: 2em !important; }` });
await page.waitForTimeout(250);
const spacing = await page.evaluate(() => {
  const clipped = [...document.querySelectorAll("p, li, dd, dt, h1, h2, h3, figcaption")]
    .filter((element) => element.scrollHeight > element.clientHeight + 2 || element.scrollWidth > element.clientWidth + 2);
  return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, clipped: clipped.length };
});
check("B14b", "настройки интервалов не обрезают текст", spacing.overflow <= 1 && spacing.clipped === 0,
  `переполнение ${spacing.overflow}px, обрезанных блоков ${spacing.clipped}`);

/* опись композиции */
const layout = await page.evaluate(() => ({
  pageHeight: document.documentElement.scrollHeight,
  sections: [...document.querySelectorAll(".bar, .hero, .bench, .practice, .questions, .foot")].map((section) => {
    const box = section.getBoundingClientRect();
    const text = [...section.querySelectorAll("p, li, dd, dt, h1, h2, h3, figcaption")]
      .reduce((sum, element) => sum + element.getBoundingClientRect().height, 0);
    return {
      name: section.className.split(" ")[0] || section.tagName.toLowerCase(),
      top: Math.round(box.top + window.scrollY),
      height: Math.round(box.height),
      textShare: Math.round((text / box.height) * 100)
    };
  })
}));
note(`высота страницы на 1440×900: ${layout.pageHeight}px`);
for (const section of layout.sections) {
  note(`  ${section.name}: высота ${section.height}px, текст занимает ${section.textShare}% высоты, начало ${section.top}px`);
}

/* доступность */
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(300);
const axe = await new AxeBuilder({ page }).analyze();
const serious = axe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
check("B15", "axe: ни одной ошибки serious/critical", serious.length === 0,
  `нарушений всего ${axe.violations.length}, serious/critical ${serious.length}${serious.length ? ": " + serious.map((violation) => violation.id).join(", ") : ""}`);
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
  frames: document.querySelectorAll(".frames__list li").length,
  framesVisible: getComputedStyle(document.getElementById("frames")).display !== "none",
  buttonsVisible: [...document.querySelectorAll("#motion-toggle, #fold-toggle")].filter((button) => !button.hidden).length,
  actionVisible: getComputedStyle(document.querySelector(".action")).display !== "none"
}));
check("B16b", "без скриптов рассказ, кадры и главное действие читаются",
  noJs.steps === 3 && noJs.faq === 3 && noJs.stages === 3 && noJs.frames === 3 && noJs.framesVisible
  && noJs.actionVisible && noJs.buttonsVisible === 0,
  `шагов ${noJs.steps}, вопросов ${noJs.faq}, стадий ${noJs.stages}, кадров ${noJs.frames} (${noJs.framesVisible}), видимых кнопок ${noJs.buttonsVisible}`);
await noJsPage.screenshot({ path: path.join(arm, "evidence", "05-no-js.png") });
shots.push("05-no-js.png");

/* экспорт */
const distContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const distPage = await distContext.newPage();
const distRequests = [];
distPage.on("request", (request) => distRequests.push(request.url()));
await distPage.goto(distUrl, { waitUntil: "load" });
await distPage.waitForTimeout(400);
const distOk = await distPage.evaluate(() => ({
  title: document.querySelector("h1").textContent.trim(),
  frames: document.querySelectorAll(".frames__list li").length,
  live: document.documentElement.classList.contains("is-live"),
  button: !document.getElementById("fold-toggle").hidden,
  theta: getComputedStyle(document.getElementById("sheet")).getPropertyValue("--theta")
}));
check("B17b", "экспорт открывается файлом и работает", distOk.frames === 3 && distOk.button
  && distRequests.every((request) => request.startsWith("file:")),
  `заголовок «${distOk.title}», кадров ${distOk.frames}, живая сцена ${distOk.live}, угол ${distOk.theta.trim()}°, запросов ${distRequests.length}`);
await distPage.screenshot({ path: path.join(arm, "evidence", "06-export-1440.png") });
shots.push("06-export-1440.png");

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(400);
await shot(page, "07-frames-390");
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(400);
await shot(page, "08-scene-start");

await browser.close();

/* ---------- отчёт ---------- */

const failed = results.filter((result) => result.status === "fail");
const header = [
  "Проверки arm B (fold-profile)",
  `Дата: ${new Date().toISOString().slice(0, 10)}. Браузер: Chromium ${browserVersion} (Playwright из Test 1/node_modules, ничего не устанавливалось).`,
  `Пройдено ${results.length - failed.length} из ${results.length}. Снимки: ${shots.join(", ")}.`,
  "",
  "Каркас проверок тот же, что в arm A; список расширен требованиями профиля: закрепление,",
  "границы стадий, обратимость, возврат места чтения, состояния без скриптов и уменьшенного движения.",
  ""
].join("\n");
await writeFile(path.join(arm, "checks/report.txt"), header + lines.join("\n") + "\n", "utf8");
console.log(header + lines.join("\n"));
console.log(`\n${failed.length ? "ПРОВАЛЕНО: " + failed.length : "Все проверки пройдены"}`);
process.exit(failed.length ? 1 : 0);
