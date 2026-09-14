import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { gsap, ScrollTrigger } from '../lib/gsap'
import { useMotionPrefs } from '../lib/motion-config'
import { useRafLoop } from '../lib/use-raf-loop'
import { getLenis } from '../lib/smooth-scroll'
import { hash01 } from '../lib/hash'
import { paletteRgba } from '../lib/paint'
import { ScrambleText } from './ui/Reveal'

const PHASES = [
  {
    index: '01',
    name: 'Сбор',
    duration: '0 — 8 мин',
    body: 'Сужаем поле до одного объекта. Всё остальное объявляется шумом и не заслуживает реакции.',
    metric: 'объектов удержания',
    metricValue: '1',
    field: 'шум сходится в один объект',
  },
  {
    index: '02',
    name: 'Давление',
    duration: '8 — 22 мин',
    body: 'Держим, пока не станет неуютно. Именно в этом интервале тренируется возврат внимания, а не в комфорте.',
    metric: 'возвратов за минуту',
    metricValue: '9—14',
    field: 'объект держится под нагрузкой',
  },
  {
    index: '03',
    name: 'Расширение',
    duration: '22 — 40 мин',
    body: 'Возвращаем весь шум обратно — но уже без потери фокуса. Это и есть рабочий результат практики.',
    metric: 'потеря фокуса',
    metricValue: 'низкая',
    field: 'шум вернулся · объект на месте',
  },
]

/*
 * Поле объектов: та же сессия, но показанная, а не описанная.
 *
 * Секция держалась на трёх абзацах и параллаксе в 2—9 px — субстрата у фаз не было.
 * Здесь он есть, и совпадает с копией: шум сходится в один объект, объект под
 * нагрузкой выбивает (каждый выброс — зафиксированный возврат), потом шум
 * возвращается целиком, а объект остаётся на месте.
 *
 * Частиц 420: это канвас, а не 420 DOM-узлов, — один проход на кадр и ни одного
 * ре-рендера React. Положения детерминированы, поэтому фаза выглядит одинаково
 * при каждом входе и в каждой перезагрузке.
 */
const TAU = Math.PI * 2
const FIELD_COUNT = 420
/** Доля частиц, которые остаются «объектом удержания»: их не отпускает ни одна фаза. */
const OBJECT_SHARE = 0.12

type FieldPoint = {
  /** Положение в шумном поле */
  hx: number
  hy: number
  /** Точка сбора — «один объект» */
  gx: number
  gy: number
  /** Поле, в которое шум возвращается в третьей фазе */
  sx: number
  sy: number
  /** Направление выброса возврата */
  ax: number
  ay: number
  /** Личная фаза волны: без неё выбросы шли бы строем */
  phase: number
  object: boolean
}

const makeField = (): FieldPoint[] => {
  const points: FieldPoint[] = []
  for (let i = 0; i < FIELD_COUNT; i += 1) {
    const angle = hash01(i * 1.37) * TAU
    // Квадрат радиуса — чтобы плотность сгустка была ровной, а не бубликом.
    const radius = hash01(i * 2.11 + 4.2) ** 2 * 0.085
    points.push({
      hx: 0.06 + hash01(i * 3.1) * 0.88,
      hy: 0.06 + hash01(i * 3.1 + 1.7) * 0.88,
      gx: 0.5 + Math.cos(angle) * radius,
      gy: 0.5 + Math.sin(angle) * radius,
      sx: 0.06 + hash01(i * 4.7 + 8.1) * 0.88,
      sy: 0.06 + hash01(i * 4.7 + 9.4) * 0.88,
      ax: Math.cos(angle + 2.1),
      ay: Math.sin(angle + 2.1),
      phase: hash01(i * 7.3 + 0.6),
      object: hash01(i * 5.9 + 1.3) < OBJECT_SHARE,
    })
  }
  return points
}

const FIELD = makeField()

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value)

type FieldSurface = {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
}

type FieldPointer = { x: number; y: number; active: boolean }

/**
 * Кадр поля. Прогресс приходит из того же пина, что двигает фазы, поэтому картинка
 * и текст не могут разъехаться.
 */
const paintField = (surface: FieldSurface, progress: number, pointer: FieldPointer) => {
  const { ctx, width, height } = surface
  ctx.clearRect(0, 0, width, height)

  const scene = clamp01(progress) * PHASES.length
  const size = Math.min(width, height)
  /* Сбор заканчивается к концу первой трети, расширение — к концу третьей. */
  const gathered = easeInOut(clamp01(scene / 0.82))
  const returned = easeInOut(clamp01((scene - 2) / 0.85))
  /* Нагрузка живёт только во второй фазе: за её пределами выбросов нет. */
  const load = clamp01(1 - Math.abs(scene - 1.5) / 0.72)

  const pushRadius = Math.max(70, size * 0.22)
  const maxPush = Math.min(26, size * 0.06)
  /* Кисти — две на кадр, а не строка на каждую из 420 частиц. */
  const noiseBrush = paletteRgba('color.fg', 0.28 + 0.34 * (1 - gathered) + 0.28 * returned)
  const returnBrush = paletteRgba('color.accent.magenta', 0.72 * load)
  const objectBrush = paletteRgba('color.accent.lime', 0.9)
  const anchorBrush = paletteRgba('color.accent.lime', 0.12 + 0.42 * clamp01(scene))

  for (let i = 0; i < FIELD.length; i += 1) {
    const point = FIELD[i]
    let nx: number
    let ny: number
    let returnSpike = false

    if (point.object) {
      // Объект удержания сходится в центр и больше оттуда не уходит.
      nx = point.hx + (point.gx - point.hx) * gathered
      ny = point.hy + (point.gy - point.hy) * gathered
    } else {
      const fromX = point.hx + (point.gx - point.hx) * gathered
      const fromY = point.hy + (point.gy - point.hy) * gathered
      nx = fromX + (point.sx - fromX) * returned
      ny = fromY + (point.sy - fromY) * returned
    }

    if (load > 0.01 && !point.object) {
      /* Волна идёт по полю со своей фазой у каждой частицы: выброс — это возврат. */
      const wave = Math.sin(scene * 9 + point.phase * TAU)
      if (wave > 0) {
        returnSpike = wave > 0.55
        const spike = wave ** 3 * load * 0.13 * (1 - returned)
        nx += point.ax * spike
        ny += point.ay * spike
      }
    }

    let x = nx * width
    let y = ny * height

    /*
     * Курсор раздвигает шум позицией, а не импульсом: у толчка есть потолок,
     * поэтому частица гарантированно возвращается, как только курсор ушёл.
     */
    if (pointer.active) {
      const dx = x - pointer.x
      const dy = y - pointer.y
      const distance = Math.hypot(dx, dy) || 1
      if (distance < pushRadius) {
        const push = (1 - distance / pushRadius) ** 2 * maxPush
        x += (dx / distance) * push
        y += (dy / distance) * push
      }
    }

    ctx.fillStyle = point.object ? objectBrush : returnSpike ? returnBrush : noiseBrush
    const dot = point.object ? 2.4 : returnSpike ? 2 : 1.5
    ctx.fillRect(x - dot / 2, y - dot / 2, dot, dot)
  }

  // Кольцо объекта: остаётся видимым и в третьей фазе — «без потери фокуса».
  ctx.beginPath()
  ctx.arc(width / 2, height / 2, size * 0.1, 0, TAU)
  ctx.strokeStyle = anchorBrush
  ctx.lineWidth = 1
  ctx.stroke()
}

/*
 * Пин только там, где он уместен: широкий экран и точный указатель.
 * Порог обязан совпадать с `md:` в разметке — фазы накладываются absolute лишь в этом режиме.
 */
const PIN_QUERY = '(min-width: 768px)'
const PIN_MOTION = `${PIN_QUERY} and (prefers-reduced-motion: no-preference)`

export function Protocol() {
  // Внешний контейнер пина. Внутрь GSAP вставляет pin-spacer, поэтому
  // на предках не должно быть ни transform, ни will-change, ни content-visibility.
  const root = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const trigger = useRef<ScrollTrigger | null>(null)
  const [active, setActive] = useState(0)
  const { reduced } = useMotionPrefs()

  /* Поле объектов: канвас, поверхность и указатель живут в ref — в кадре React не трогаем. */
  const fieldBox = useRef<HTMLDivElement>(null)
  const fieldCanvas = useRef<HTMLCanvasElement>(null)
  const surface = useRef<FieldSurface | null>(null)
  const progress = useRef(0)
  const fieldPointer = useRef<FieldPointer>({ x: -9999, y: -9999, active: false })

  /*
   * Наложение фаз — состояние, а не медиазапрос в разметке.
   * С `md:absolute` в классе все три фазы лежали бы друг на друге и без анимации
   * (reduced-motion, отключённый JS): три абзаца текста в одной точке, поверх друг друга.
   * Безопасное состояние по умолчанию — обычный вертикальный поток.
   */
  const [stacked, setStacked] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(PIN_MOTION).matches,
  )

  useLayoutEffect(() => {
    if (reduced) {
      setStacked(false)
      return
    }

    const media = gsap.matchMedia()

    media.add(PIN_MOTION, () => {
      const ctx = gsap.context((self) => {
        const phases = self.selector!('.phase') as HTMLElement[]
        const chips = self.selector!('.phase-chip') as HTMLElement[]
        const rail = self.selector!('.rail-fill') as HTMLElement[]

        const step = 1

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: '.pin',
            start: 'top top',
            end: '+=280%',
            pin: true,
            // 0.6 — плейхед догоняет скролл за 0.6 с: органично, но без ощущения ваты.
            scrub: 0.6,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: ({ progress: value }) => {
              /*
               * Фазы делят пин поровну — floor, а не round: иначе подпись переключалась бы
               * в середине перехода, когда на экране ещё две фазы сразу.
               */
              progress.current = value
              const next = Math.min(PHASES.length - 1, Math.floor(value * PHASES.length))
              setActive((prev) => (prev === next ? prev : next))
            },
          },
        })

        // Анимируем только детей pinned-контейнера — сам .pin остаётся неподвижным.
        tl.fromTo(rail, { scaleX: 0 }, { scaleX: 1, ease: 'none', duration: step * PHASES.length }, 0)

        phases.forEach((phase, i) => {
          const at = i * step
          if (i > 0) {
            const lines = phase.querySelectorAll('.phase-line')
            tl.fromTo(lines, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, stagger: 0.045, duration: step * 0.4 }, at)
            tl.fromTo(phase, { autoAlpha: 0, yPercent: 9 }, { autoAlpha: 1, yPercent: 0, duration: step * 0.55 }, at)
            tl.to(phases[i - 1], { autoAlpha: 0, yPercent: -9, duration: step * 0.55 }, at)
          }

          const chip = chips[i]
          if (chip) {
            tl.fromTo(
              chip,
              { autoAlpha: i === 0 ? 1 : 0.25, scale: i === 0 ? 1 : 0.82 },
              { autoAlpha: 1, scale: 1, duration: step * 0.4 },
              at,
            )
            if (i > 0) tl.to(chips[i - 1], { autoAlpha: 0.25, scale: 0.82, duration: step * 0.4 }, at)
          }
        })

        trigger.current = tl.scrollTrigger ?? null

        /*
         * Ввод в секцию отдельным скрабом: пин стартует на 'top top', и если бы первая
         * фаза раскрывалась внутри него, при входе висел бы пустой экран высотой в вьюпорт.
         */
        gsap.fromTo(
          '.phase-intro',
          { autoAlpha: 0, y: 18 },
          {
            autoAlpha: 1,
            y: 0,
            stagger: 0.06,
            ease: 'none',
            scrollTrigger: { trigger: '.pin', start: 'top 88%', end: 'top 42%', scrub: 0.6 },
          },
        )
      }, root)

      return () => {
        trigger.current = null
        ctx.revert()
      }
    })

    /* media.revert() снимает все твитны и триггеры внутри добавленного запроса:
       на тач-устройствах не остаётся ни одного осиротевшего ScrollTrigger. */
    return () => media.revert()
  }, [reduced])

  /* Состояние наложения следует за медиазапросом, а не за фактом создания контекста. */
  useLayoutEffect(() => {
    const query = window.matchMedia(PIN_MOTION)
    const sync = () => setStacked(query.matches && !reduced)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [reduced])

  /*
   * Поверхность канваса: размеры зависят только от колонки, поэтому пересобираются
   * на resize, а не каждый кадр. DPR зажат двойкой — 3× это 9× пикселей заливки.
   */
  useEffect(() => {
    const box = fieldBox.current
    const node = fieldCanvas.current
    if (!stacked || !box || !node) {
      surface.current = null
      return
    }

    const resize = () => {
      const rect = box.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      node.width = Math.round(rect.width * dpr)
      node.height = Math.round(rect.height * dpr)
      const ctx = node.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      surface.current = { ctx, width: rect.width, height: rect.height }
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(box)
    return () => {
      observer.disconnect()
      surface.current = null
    }
  }, [stacked])

  /*
   * Реакция на курсор: сцена отвечает глубиной, а не подсветкой.
   * Каждый элемент несёт `data-depth` — коэффициент смещения в пикселях.
   * Читаем и пишем через ref и один rAF: указатель не должен трогать React.
   */
  const target = useRef({ x: 0, y: 0 })
  const current = useRef({ x: 0, y: 0 })

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const node = stage.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    target.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    target.current.y = ((event.clientY - rect.top) / rect.height) * 2 - 1
    node.style.setProperty('--px', `${(((event.clientX - rect.left) / rect.width) * 100).toFixed(2)}%`)
    node.style.setProperty('--py', `${(((event.clientY - rect.top) / rect.height) * 100).toFixed(2)}%`)

    const canvasNode = fieldCanvas.current
    if (canvasNode) {
      const box = canvasNode.getBoundingClientRect()
      fieldPointer.current = { x: event.clientX - box.left, y: event.clientY - box.top, active: true }
    }
  }, [])

  /* Курсор ушёл — шум возвращается на места сразу, без досдачи по инерции. */
  const onPointerLeave = useCallback(() => {
    fieldPointer.current = { x: -9999, y: -9999, active: false }
    target.current.x = 0
    target.current.y = 0
  }, [])

  /*
   * Один rAF на всю секцию: глубина от курсора и поле объектов — это один кадр,
   * два цикла здесь были бы двумя местами, где может поехать синхронизация.
   */
  useRafLoop(
    () => {
      const node = stage.current
      if (node) {
        // Экспоненциальное сглаживание: движение отстаёт от курсора на ~0.12 с и перестаёт дёргаться.
        const t = 0.12
        current.current.x += (target.current.x - current.current.x) * t
        current.current.y += (target.current.y - current.current.y) * t

        node.querySelectorAll<HTMLElement>('[data-depth]').forEach((el) => {
          const depth = Number(el.dataset.depth ?? 0)
          const x = (-current.current.x * depth).toFixed(2)
          const y = (-current.current.y * depth).toFixed(2)
          el.style.transform = `translate3d(${x}px, ${y}px, 0)`
        })
      }

      const painted = surface.current
      if (painted) paintField(painted, progress.current, fieldPointer.current)
    },
    { target: root, enabled: !reduced && stacked },
  )

  const goToPhase = useCallback(
    (index: number) => {
      const st = trigger.current
      if (!st) return
      const next = Math.min(PHASES.length - 1, Math.max(0, index))
      const position = st.start + (next / (PHASES.length - 1)) * (st.end - st.start)
      const lenis = getLenis()
      if (lenis) lenis.scrollTo(position, { duration: 0.9 })
      else window.scrollTo({ top: position, behavior: 'smooth' })
    },
    [],
  )

  return (
    <section ref={root} id="protocol" aria-labelledby="protocol-title" className="relative border-t border-line/60">
      <div
        ref={stage}
        /*
         * В режиме пина блок обязан быть ровно во вьюпорт: раньше он вырастал до 998 px
         * при окне 900 и нижняя строка молча срезалась `overflow-clip` на всём пути пина.
         * Свободное место забирает поле объектов, а `min-h` остаётся только как пол
         * для совсем низких окон — там лучше срезать подсказку, чем текст фаз.
         */
        className={`pin relative flex flex-col justify-center overflow-clip py-xl ${
          stacked ? 'h-[100svh] min-h-[34rem]' : 'min-h-[100svh]'
        }`}
        onPointerMove={reduced || !stacked ? undefined : onPointerMove}
        onPointerLeave={reduced || !stacked ? undefined : onPointerLeave}
        style={{ ['--px' as string]: '50%', ['--py' as string]: '50%' }}
      >
        {/* Курсорный градиент: низкая альфа и один слой — реакция читается, но не пересвечивает текст. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden md:block"
          style={{
            background:
              'radial-gradient(620px circle at var(--px) var(--py), color-mix(in srgb, var(--color-accent-lime) 7%, transparent), transparent 68%)',
          }}
        />

        <div className={stacked ? 'u-container relative flex h-full flex-col' : 'u-container relative'}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <ScrambleText text="002 — Протокол" className="kicker" />
            <p className="font-mono text-[10px] tracking-[0.18em] text-fg-faint uppercase">
              одна сессия · три фазы · 40 минут
            </p>
          </div>

          <div className={stacked ? 'phase-intro mt-sm grid gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] lg:items-end lg:gap-xl' : ''}>
            <h2
              id="protocol-title"
              className={stacked ? 'max-w-[24ch] text-[clamp(1.6rem,2.7vw,2.9rem)] leading-[0.98] font-medium tracking-[-0.025em]' : 'phase-intro mt-md max-w-[26ch] text-title leading-[1.02] font-medium tracking-[-0.02em]'}
            >
              Три фазы одной сессии. Каждая забирает больше, чем предыдущая.
            </h2>
            <p className={stacked ? 'max-w-[58ch] text-[clamp(0.78rem,1vw,0.95rem)] leading-relaxed text-fg-dim' : 'phase-intro mt-md max-w-[54ch] text-body text-fg-dim'}>
              Фаза — не этап дыхания и не отрезок таймера. Это участок, на котором меняется условие задачи:
              сначала сужаем поле, потом держим под нагрузкой, потом возвращаем шум обратно.
            </p>
          </div>

          {stacked ? (
            <div className="relative mt-md min-h-0 flex-1 overflow-hidden border border-line/60 bg-surface/20">
              <div
                ref={fieldBox}
                data-field="protocol"
                data-field-phase={active}
                className="absolute inset-0 hidden md:block"
              >
                <div className="grid-lines pointer-events-none absolute inset-0 opacity-25" aria-hidden="true" />
                <canvas ref={fieldCanvas} className="absolute inset-0 h-full w-full" aria-hidden="true" />
              </div>

              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_46%,transparent_0%,transparent_24%,rgba(5,5,9,0.18)_52%,rgba(5,5,9,0.82)_100%)]"
              />

              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-6 p-4">
                <span className="font-mono text-[9px] tracking-[0.2em] text-fg-faint uppercase">камера внимания / live</span>
                <span className="max-w-[28ch] text-right font-mono text-[9px] tracking-[0.15em] text-fg-faint uppercase">
                  {PHASES[active]?.field}
                </span>
              </div>

              <div className="pointer-events-none absolute inset-x-0 top-10 bottom-16 z-10">
                {PHASES.map((phase) => (
                  <article
                    key={phase.index}
                    className="phase absolute inset-y-0 left-0 flex w-[min(31rem,48%)] flex-col justify-center px-lg"
                  >
                    <div className="phase-line flex items-baseline gap-4" data-depth="9">
                      <span className="font-mono text-[clamp(3rem,7vw,6.5rem)] leading-none font-medium text-fg-faint tabular-nums">
                        {phase.index}
                      </span>
                      <div>
                        <h3 className="text-[clamp(1.35rem,2.4vw,2.3rem)] leading-none font-medium uppercase">{phase.name}</h3>
                        <p className="mt-1 font-mono text-[10px] tracking-[0.18em] text-fg-faint uppercase">
                          {phase.duration}
                        </p>
                      </div>
                    </div>

                    <p className="phase-line mt-md max-w-[42ch] text-body text-fg-dim" data-depth="3">
                      {phase.body}
                    </p>

                    <dl
                      className="phase-line mt-lg inline-flex w-fit flex-wrap items-baseline gap-x-6 gap-y-2 border border-line/60 bg-ink/70 px-4 py-3 backdrop-blur-sm"
                      data-depth="6"
                    >
                      <dt className="font-mono text-[10px] tracking-[0.18em] text-fg-faint uppercase">{phase.metric}</dt>
                      <dd className="font-mono text-[13px] text-accent-lime">{phase.metricValue}</dd>
                    </dl>
                  </article>
                ))}
              </div>

              <div className="absolute inset-x-0 bottom-0 z-20 border-t border-line/60 bg-ink/90 backdrop-blur-md">
                <div className="rail-fill absolute top-0 left-0 h-px w-full origin-left bg-accent-lime" aria-hidden="true" />
                <ol className="grid grid-cols-3">
                  {PHASES.map((phase, index) => (
                    <li key={phase.index} className="phase-chip border-r border-line/50 last:border-r-0">
                      <button
                        type="button"
                        onClick={() => goToPhase(index)}
                        aria-current={active === index ? 'true' : undefined}
                        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-200 ${
                          active === index ? 'bg-surface/55 text-fg' : 'text-fg-faint hover:bg-surface/30 hover:text-fg'
                        }`}
                      >
                        <span className={`font-mono text-[11px] ${active === index ? 'text-accent-lime' : 'text-fg-faint'}`}>
                          {phase.index}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-[9px] tracking-[0.16em] uppercase">{phase.name}</span>
                          <span className="mt-0.5 block font-mono text-[9px] text-fg-faint tabular-nums">{phase.duration}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ) : (
            <div className="mt-xl flex flex-col gap-xl">
              {PHASES.map((phase) => (
                <article key={phase.index} className="phase relative border-t border-line/60 pt-md">
                  <div className="phase-line flex items-baseline gap-4">
                    <span className="font-mono text-[clamp(2rem,6vw,4.5rem)] leading-none font-medium text-fg-faint tabular-nums">
                      {phase.index}
                    </span>
                    <div>
                      <h3 className="text-heading leading-none font-medium uppercase">{phase.name}</h3>
                      <p className="mt-1 font-mono text-[10px] tracking-[0.18em] text-fg-faint uppercase">{phase.duration}</p>
                    </div>
                  </div>
                  <p className="phase-line mt-md max-w-[52ch] text-body text-fg-dim">{phase.body}</p>
                  <dl className="phase-line mt-lg inline-flex flex-wrap items-baseline gap-x-6 gap-y-2 border border-line/60 px-4 py-3">
                    <dt className="font-mono text-[10px] tracking-[0.18em] text-fg-faint uppercase">{phase.metric}</dt>
                    <dd className="font-mono text-[13px] text-accent-lime">{phase.metricValue}</dd>
                  </dl>
                </article>
              ))}
            </div>
          )}

          {stacked ? (
            <p className="mt-2 font-mono text-[9px] tracking-[0.16em] text-fg-faint uppercase">
              скролл ведёт сессию · выбери фазу на шкале · курсор возмущает поле
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
