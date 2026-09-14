import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

/**
 * Ассеты соцпревью: карточка 1200×630 и apple-touch-icon 180×180.
 *
 * Почему генератор, а не нарисованные руками файлы: палитра и гарнитуры берутся
 * из тех же источников, что у сайта (`src/styles/tokens.css` + те же три шрифта),
 * поэтому превью физически не может разъехаться с брендом. `public/og.jpg` и
 * `public/apple-touch-icon.png` — сгенерированные: руками не правятся, пересобираются
 * `npm run og`.
 *
 * Карточка в JPEG, а не в PNG: тёмный градиент в PNG весит 338 KB (проверено),
 * в JPEG q82 — в разы меньше при неразличимой на глаз разнице. Для og:image оба формата
 * допустимы, а лимиты мессенджеров на вес никто не отменял.
 *
 * Нужен доступ к Google Fonts на момент сборки: без сети гарнитуры упадут в системные,
 * и скрипт об этом скажет, а не отдаст молча подделку.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WIDTH = 1200
const HEIGHT = 630
const ICON = 180

const tokensCss = readFileSync(resolve(root, 'src/styles/tokens.css'), 'utf8')
const token = (name) => new RegExp(`--color-${name}:\\s*(#[0-9a-f]{3,8})`, 'i').exec(tokensCss)?.[1]

const palette = {
  ink: token('ink'),
  fg: token('fg'),
  lime: token('accent-lime'),
  cyan: token('accent-cyan'),
  indigo: token('accent-indigo'),
  magenta: token('accent-magenta'),
}
const missing = Object.entries(palette).filter(([, value]) => !value).map(([name]) => name)
if (missing.length) throw new Error(`В tokens.css не найдены токены: ${missing.join(', ')}`)

const FONTS =
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Instrument+Serif:ital@1&family=JetBrains+Mono:wght@400&display=swap'

const head = (width, height) => `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="${FONTS}" />
    <style>
      * { margin: 0; box-sizing: border-box; }
      html, body { width: ${width}px; height: ${height}px; overflow: hidden; }
      body {
        position: relative;
        background: ${palette.ink};
        color: ${palette.fg};
        font-family: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif;
      }
      .glow {
        position: absolute;
        inset: 0;
        background:
          radial-gradient(70% 90% at 82% 12%, color-mix(in srgb, ${palette.indigo} 55%, transparent), transparent 62%),
          radial-gradient(60% 70% at 12% 88%, color-mix(in srgb, ${palette.magenta} 34%, transparent), transparent 66%),
          radial-gradient(45% 45% at 62% 62%, color-mix(in srgb, ${palette.cyan} 18%, transparent), transparent 70%);
      }
      .grid {
        position: absolute;
        inset: 0;
        background-image:
          linear-gradient(to right, rgba(255, 255, 255, 0.05) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
        background-size: 72px 72px;
      }
    </style>
  </head>
  <body>`

const card = `${head(WIDTH, HEIGHT)}
    <div class="glow"></div>
    <div class="grid"></div>
    <div style="position:absolute;inset:0;padding:56px 64px;display:flex;flex-direction:column;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:12px;font-size:15px;letter-spacing:0.26em;text-transform:uppercase;font-weight:500">
        <span style="position:relative;width:28px;height:28px;display:grid;place-items:center">
          <i style="position:absolute;inset:0;border:1px solid color-mix(in srgb, ${palette.lime} 65%, transparent);border-radius:50%"></i>
          <b style="width:9px;height:9px;border-radius:50%;background:${palette.lime}"></b>
        </span>
        Mindfield
      </div>

      <h1 style="font-size:116px;line-height:0.86;letter-spacing:-0.045em;text-transform:uppercase;font-weight:500">
        Тишина<em style="display:block;font-family:'Instrument Serif',Georgia,serif;font-style:italic;text-transform:none;color:${palette.lime};font-weight:400;letter-spacing:-0.02em">не бывает</em>бесплатной
      </h1>

      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:24px;border-top:1px solid rgba(255,255,255,0.14);padding-top:20px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:15px;letter-spacing:0.16em;text-transform:uppercase;color:color-mix(in srgb, ${palette.fg} 62%, transparent)">
        <p>12 протоколов · 40 минут · <b style="color:${palette.lime};font-weight:400">без таймеров</b></p>
        <p>практика внимания</p>
      </div>
    </div>
  </body>
</html>`

/** Иконка: только знак, без типографики — на 180 px текст превращается в грязь. */
const icon = `${head(ICON, ICON)}
    <div class="glow" style="opacity:0.7"></div>
    <div style="position:absolute;inset:0;display:grid;place-items:center">
      <span style="position:relative;width:96px;height:96px;display:grid;place-items:center">
        <i style="position:absolute;inset:0;border:2px solid color-mix(in srgb, ${palette.lime} 62%, transparent);border-radius:50%"></i>
        <b style="width:34px;height:34px;border-radius:50%;background:${palette.lime}"></b>
      </span>
    </div>
  </body>
</html>`

const browser = await chromium.launch()
mkdirSync(resolve(root, 'public'), { recursive: true })

const render = async (html, width, height, file, screenshot) => {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  await page.setContent(html, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  const loaded = await page.evaluate(() =>
    [...document.fonts].filter((font) => font.status === 'loaded').map((font) => font.family),
  )
  if (width > ICON && !loaded.some((family) => family.includes('Space Grotesk'))) {
    throw new Error('Гарнитуры с Google Fonts не загрузились — карточке нельзя доверять, проверьте сеть')
  }
  const path = resolve(root, 'public', file)
  await page.screenshot({ path, clip: { x: 0, y: 0, width, height }, ...screenshot })
  await page.close()
  return readFileSync(path).length / 1024
}

const cardKb = await render(card, WIDTH, HEIGHT, 'og.jpg', { type: 'jpeg', quality: 82 })
const iconKb = await render(icon, ICON, ICON, 'apple-touch-icon.png', { type: 'png' })
await browser.close()

console.log(`✓ public/og.jpg ${WIDTH}×${HEIGHT} — ${cardKb.toFixed(1)} KB`)
console.log(`✓ public/apple-touch-icon.png ${ICON}×${ICON} — ${iconKb.toFixed(1)} KB`)
