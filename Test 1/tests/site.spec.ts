import { test, expect, type Locator, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * Гейты страницы.
 *
 * Правило: тест проверяет инвариант, а не «выглядит нормально». Поэтому здесь нет
 * ожиданий по времени: `toBeVisible`/`toBeHidden` сами ждут окончания перехода,
 * а из проверок убрано всё, что зависит от скорости машины, — иначе гейт флейкует
 * (axe, снятый в момент фейда героя, однажды выдал 58 наложений на color-contrast).
 */

/** Открывает страницу и собирает ошибки консоли. Слушатели — ДО навигации. */
const open = async (page: Page, url = '/') => {
  const errors: string[] = []
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto(url)
  // До применения шрифтов метрики текста и позиции триггеров неверны.
  await page.evaluate(() => document.fonts.ready)
  return errors
}

/** Горизонтального скролла быть не должно ни на одной ширине: на html стоит overflow-x: clip. */
const hasNoHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

/**
 * Кадр канваса, дождавшись его покоя: интервал здесь — частота опроса,
 * а не «должно успеть за N миллисекунд».
 */
const settledShot = async (page: Page, target: Locator, attempts = 25) => {
  let previous = await target.screenshot()
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await page.waitForTimeout(120)
    const next = await target.screenshot()
    if (Buffer.compare(previous, next) === 0) return next
    previous = next
  }
  return null
}

/** Кадр, отличающийся от исходного, — или null, если он так и не изменился. */
const changedShot = async (page: Page, target: Locator, from: Buffer, attempts = 25) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await page.waitForTimeout(120)
    const next = await target.screenshot()
    if (Buffer.compare(from, next) !== 0) return next
  }
  return null
}

/**
 * Идущие анимации прозрачности и трансформаций.
 * CSS-анимации самого медиазапроса reduced-motion (border-width, tab-size и прочее
 * с duration 0.01ms) сюда не попадают — они не про движение.
 */
const runningMotionAnimations = (page: Page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((animation) => animation.playState === 'running')
      .map((animation) => {
        const timing = animation as Animation & { transitionProperty?: string; animationName?: string }
        const properties = timing.transitionProperty
          ? [timing.transitionProperty]
          : (animation.effect?.getKeyframes?.() ?? []).flatMap((keyframe) => Object.keys(keyframe))
        return { name: timing.animationName ?? timing.transitionProperty ?? 'waapi', properties }
      })
      .filter((animation) =>
        animation.properties.some((property) =>
          ['opacity', 'transform', 'translate', 'scale', 'rotate'].some((moving) => property.includes(moving)),
        ),
      ),
  )

const VIEWPORTS = [
  { name: 'desktop 1440×900', width: 1440, height: 900 },
  { name: 'мобильный 430×932', width: 430, height: 932 },
  { name: 'мобильный 390×844', width: 390, height: 844 },
  { name: 'узкий 360×640', width: 360, height: 640 },
]

for (const viewport of VIEWPORTS) {
  test(`${viewport.name}: заголовок, отсутствие переполнения, чистая консоль`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    const errors = await open(page)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await hasNoHorizontalScroll(page)).toBeTruthy()
    expect(errors).toEqual([])
  })
}

test('reduced motion: Three не грузится, контент стоит на месте сразу', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  await page.goto('/')

  // Вводный абзац и кнопки — в финальном состоянии без ожидания фейда.
  const heroOpacity = await page.evaluate(() => {
    const cta = document.querySelector('.hero-copy a[href="#deck"]')?.parentElement
    return cta ? getComputedStyle(cta).opacity : null
  })
  expect(heroOpacity).toBe('1')
  expect(await runningMotionAnimations(page)).toEqual([])

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(requests.some((url) => url.includes('/src/three/hero-field'))).toBeFalsy()
  // Фазы «Протокола» при reduced-motion стоят в потоке — поля объектов быть не должно.
  await expect(page.locator('#protocol canvas')).toHaveCount(0)
})

/**
 * Регрессия: `max-w-xl` в проекте разворачивается в `--spacing-xl` (наш же токен),
 * то есть в `clamp(3rem, 6vw, 6rem)`. Модалка вырождалась в полосу шириной 48—86 px,
 * а тумблеры уезжали за её край. Тест держит именно это: ширину панели и то,
 * что содержимое внутри неё, — а не конкретное число пикселей.
 */
test('модалка настроек не схлопывается в полосу', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)
  await page.getByRole('button', { name: 'Настройки движения и качества' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  const geometry = await dialog.evaluate((panel) => {
    const box = panel.getBoundingClientRect()
    const switches = [...panel.querySelectorAll('[role="switch"]')].map((node) => node.getBoundingClientRect())
    const slider = panel.querySelector('input[type="range"]')?.getBoundingClientRect()
    return {
      width: Math.round(box.width),
      switchesOutside: switches.filter((rect) => rect.right > box.right || rect.left < box.left).length,
      sliderWidth: slider ? Math.round(slider.width) : 0,
    }
  })

  expect(geometry.width).toBeGreaterThanOrEqual(480)
  expect(geometry.switchesOutside).toBe(0)
  expect(geometry.sliderWidth).toBeGreaterThan(200)
})

test('низкое качество: модалка сообщает об облегчённой сцене', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('mindfield.motion', JSON.stringify({ intensity: 1, reduceOverride: false, quality: 'low' })),
  )
  await open(page)
  await page.getByRole('button', { name: 'Настройки движения и качества' }).click()
  await expect(page.getByRole('dialog')).toContainText('облегчённая сцена')
})

/**
 * Регрессия: прибор удержания жил в левом нижнем углу постоянно и наезжал на герой
 * (7574 px² наложения на абзац при 1280×800). Теперь он относится только к «Полю» —
 * именно там считаются все три его величины.
 */
test('прибор удержания не накрывает контент', async ({ page }) => {
  // reduced-motion здесь не про доступность, а про детерминированный скролл: Lenis выключен.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)

  const hud = page.locator('aside[aria-label="Удержание внимания"]')
  await expect(hud).toBeHidden()

  await page.evaluate(() => document.getElementById('field')?.scrollIntoView())
  await expect(hud).toBeVisible()

  const overlap = await page.evaluate(() => {
    const hud = document.querySelector('aside[aria-label="Удержание внимания"]')
    if (!hud) return Number.POSITIVE_INFINITY
    const box = hud.getBoundingClientRect()
    const targets = document.querySelectorAll('#field h2, #field p, #field button, #field [role="group"]')
    let area = 0
    for (const element of targets) {
      const rect = element.getBoundingClientRect()
      const width = Math.min(box.right, rect.right) - Math.max(box.left, rect.left)
      const height = Math.min(box.bottom, rect.bottom) - Math.max(box.top, rect.top)
      area += Math.max(0, width) * Math.max(0, height)
    }
    return Math.round(area)
  })

  expect(overlap).toBe(0)
})

/**
 * Хроника: график не декорация, с ним работают. Проверяем оба пути ввода, которые
 * заменили прежний список событий: наведение раскрывает момент, перетаскивание мотает сессию.
 */
test('хроника: наведение раскрывает момент, драг перематывает сессию', async ({ page }) => {
  // reduced-motion отключает Lenis, и прокрутка становится детерминированной;
  // сама работа с графиком от настройки движения не зависит.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)

  const section = page.locator('#chronicle')
  await section.scrollIntoViewIfNeeded()
  const box = await section.locator('canvas').boundingBox()
  if (!box) throw new Error('график хроники не найден')

  // Текстовая версия графика остаётся в разметке: содержимое не зависит от canvas.
  expect(await section.locator('ol li').count()).toBe(9)

  const caption = section.locator('figcaption')
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2)
  await expect(caption).toContainText('31:30')

  await page.mouse.move(box.x + box.width * 0.42, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.44, box.y + box.height / 2)
  await page.mouse.up()
  await expect(caption).toContainText('16:20')
})

/**
 * Шум: буквы собираются по скроллу и разгоняются курсором.
 * Проверяем и то, что сцена живая (скролл меняет фразу), и то, что курсор
 * вообще доходит до канваса, и что картинка от него меняется.
 */
test('шум: скролл меняет фразу, курсор разгоняет буквы', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)

  const section = page.locator('#noise')
  const stage = section.locator('[data-phrase]')
  // Начало тоже ставим точно: scrollIntoViewIfNeeded() зависит от геометрии соседних секций.
  await page.evaluate(() => {
    const wrapper = document.querySelector('#noise > div')
    if (!wrapper) throw new Error('нет обёртки секции шума')
    const start = wrapper.getBoundingClientRect().top + window.scrollY
    window.scrollTo(0, start)
  })
  await expect(stage).toHaveAttribute('data-phrase', '0')

  // Скролл ставим точно, а не колесом: у Lenis есть инерция, и `mouse.wheel`
  // проскакивает середину блока. Прогресс секции считается от её липкой части,
  // поэтому середина второй фразы — ровно половина пути «верх блока → низ блока».
  await page.evaluate(() => {
    const wrapper = document.querySelector('#noise > div')
    if (!wrapper) throw new Error('нет обёртки секции шума')
    const rect = wrapper.getBoundingClientRect()
    const start = rect.top + window.scrollY
    window.scrollTo(0, start + 0.5 * (rect.height - window.innerHeight))
  })
  await expect(stage).toHaveAttribute('data-phrase', '1')

  const box = await stage.boundingBox()
  if (!box) throw new Error('сцена шума не найдена')

  const canvas = stage.locator('canvas')

  // Без курсора буквы обязаны досходиться и замереть.
  const still = await settledShot(page, canvas)
  expect(still).not.toBeNull()
  if (!still) throw new Error('буквы не остановились')

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await expect(stage).toHaveAttribute('data-pointer', 'active')

  // А от курсора кадр обязан измениться — и это уже другой инвариант.
  expect(await changedShot(page, canvas, still)).not.toBeNull()
  expect(await section.locator('ul li').count()).toBe(3)
})

/**
 * Протокол: у трёх фаз должен быть субстрат, а не только три абзаца.
 * Тест держит три вещи, которые ломались или могли сломаться молча:
 * пин обязан помещаться в экран целиком (иначе `overflow-clip` срезает низ),
 * поле обязано показывать ту же фазу, что рельс, и оно не рисуется там,
 * где фазы стоят в потоке, — на мобильном и при reduced-motion.
 */
test('протокол: поле объектов идёт за фазами, пин помещается в экран', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)

  const section = page.locator('#protocol')
  const stage = section.locator('.pin')
  const field = section.locator('[data-field]')
  await expect(field).toBeVisible()

  expect(await stage.evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true)

  await section.scrollIntoViewIfNeeded()
  const canvas = field.locator('canvas')
  const atPhase = async (fraction: number) => {
    await page.evaluate((value) => {
      const node = document.querySelector('#protocol')
      if (!node) throw new Error('нет секции протокола')
      // Пин стартует, когда секция встаёт на верх экрана, и длится 280 % вьюпорта.
      const top = node.getBoundingClientRect().top + window.scrollY
      window.scrollTo(0, top + value * 2.8 * window.innerHeight)
    }, fraction)
    return settledShot(page, canvas)
  }

  const first = await atPhase(0.02)
  expect(await field.getAttribute('data-field-phase')).toBe('0')

  const last = await atPhase(0.96)
  expect(await field.getAttribute('data-field-phase')).toBe('2')
  // Рельс, подпись поля и картинка — одна фаза, а не три разных мнения.
  await expect(section.locator('[aria-current="true"]')).toContainText('03')

  expect(first).not.toBeNull()
  expect(last).not.toBeNull()
  if (!first || !last) throw new Error('поле не отрисовалось')
  expect(Buffer.compare(first, last)).not.toBe(0)
})

test('протокол: поле объектов не рисуется, когда фазы стоят в потоке', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page)
  await expect(page.locator('#protocol canvas')).toHaveCount(0)
})

/**
 * Возражения: табло вердиктов, а не список текста.
 * Инварианты: счётчик снятых растёт только от действий читателя и не накручивается
 * при повторном открытии, ответ раскрывается по одному, клавиатура делает то же,
 * что курсор, а подчёркивание живёт на скролле (при reduced-motion — сразу целиком).
 */
test('возражения: счётчик считает снятые, раскрытие остаётся по одному', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)

  const section = page.locator('#objections')
  const rows = section.locator('li')
  await expect(rows).toHaveCount(5)

  const meter = section.locator('[data-objections-seen]')
  await expect(meter).toHaveAttribute('data-objections-seen', '1')

  const third = rows.nth(2).getByRole('button')
  await third.click()
  await expect(third).toHaveAttribute('aria-expanded', 'true')
  await expect(rows.nth(2).locator('[role="region"]')).toBeVisible()
  expect((await rows.nth(2).locator('[role="region"]').boundingBox())?.height ?? 0).toBeGreaterThan(20)
  // Раскрытие по одному: предыдущая строка закрылась сама.
  await expect(rows.nth(0).getByRole('button')).toHaveAttribute('aria-expanded', 'false')
  await expect(meter).toHaveAttribute('data-objections-seen', '2')

  // Клавиатура идентична курсору, а закрытое возражение остаётся снятым.
  await third.press('Enter')
  await expect(third).toHaveAttribute('aria-expanded', 'false')
  await expect(meter).toHaveAttribute('data-objections-seen', '2')
})

test('возражения: подчёркивание рисуется скроллом, а не появляется целиком', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)

  const section = page.locator('#objections')
  const last = section.locator('li').last().locator('[data-strike]')
  const drawn = () =>
    last.evaluate((node) => {
      const transform = getComputedStyle(node).transform
      return transform === 'none' ? 1 : Number(transform.split('(')[1]?.split(',')[0] ?? 0)
    })

  await section.scrollIntoViewIfNeeded()
  const partial = await drawn()
  expect(partial).toBeGreaterThan(0)
  expect(partial).toBeLessThan(1)

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await expect.poll(drawn, { timeout: 5000 }).toBe(1)
})

test('axe: ни одной ошибки уровня serious или critical', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page)
  const results = await new AxeBuilder({ page }).analyze()
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  )
  expect(blocking.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`)).toEqual([])
})
