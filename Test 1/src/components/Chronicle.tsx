import { useCallback, useEffect, useRef, useState } from 'react'
import { useScroll } from 'motion/react'
import { ScrambleText } from './ui/Reveal'
import { useMotionPrefs } from '../lib/motion-config'
import { useRafLoop } from '../lib/use-raf-loop'
import { paletteColor, paletteRgba } from '../lib/paint'
import { smooth } from '../lib/telemetry'

type Kind = 'start' | 'drift' | 'hold' | 'end'

type Entry = {
  time: string
  label: string
  note: string
  kind: Kind
  /** Сколько секунд длилось удержание до этой отметки */
  held?: number
}

const LOG: readonly Entry[] = [
  {
    time: '00:00',
    label: 'вход',
    note: 'Один объект — ощущение опоры в груди. Отмечаю вслух: «начал».',
    kind: 'start',
  },
  {
    time: '01:12',
    label: 'уход',
    note: 'Всплыл разговор на завтра. Замечен на втором предложении, а не на десятом.',
    kind: 'drift',
    held: 72,
  },
  {
    time: '03:40',
    label: 'удержание',
    note: 'Объект держится без усилия. Это не результат — это середина первого отрезка.',
    kind: 'hold',
  },
  {
    time: '07:05',
    label: 'уход',
    note: 'Тело: затекло плечо. Внимание ушло в ощущение, но вернулось без борьбы.',
    kind: 'drift',
    held: 205,
  },
  {
    time: '11:48',
    label: 'плато',
    note: 'Самый неудобный участок: ничего не происходит, и хочется прекратить.',
    kind: 'hold',
  },
  {
    time: '16:20',
    label: 'уход',
    note: 'Не мысль, а сонливость. Зафиксирован как шум, а не как ошибка.',
    kind: 'drift',
    held: 272,
  },
  {
    time: '22:04',
    label: 'расширение',
    note: 'Шум возвращён в поле целиком. Линия не потеряна — это рабочий результат.',
    kind: 'hold',
  },
  {
    time: '31:30',
    label: 'уход',
    note: 'Проверка времени. Единственный раз за сессию, когда я посмотрел на часы.',
    kind: 'drift',
    held: 566,
  },
  {
    time: '40:00',
    label: 'выход',
    note: 'Сессия закрыта по плану, а не по желанию. Следующая — не раньше завтрашнего утра.',
    kind: 'end',
  },
] as const

const KIND_LABEL: Record<Kind, string> = {
  start: 'вход',
  drift: 'возврат',
  hold: 'удержание',
  end: 'выход',
}

const KIND_COLOR: Record<Kind, string> = {
  start: 'text-fg-faint',
  drift: 'text-accent-magenta',
  hold: 'text-accent-lime',
  end: 'text-accent-cyan',
}

const SESSION_SECONDS = 40 * 60
const DPR_CAP = 2

const toSeconds = (time: string) => {
  const [minutes, seconds] = time.split(':').map(Number)
  return (minutes ?? 0) * 60 + (seconds ?? 0)
}

const EVENTS = LOG.map((entry) => ({ ...entry, seconds: toSeconds(entry.time) }))
const RETURNS = EVENTS.map((event, index) => (event.kind === 'drift' ? index : -1)).filter((index) => index >= 0)

/**
 * Сигнал удержания: одно значение на каждую секунду сессии, 0..1.
 *
 * Считается один раз на модуль и детерминированно (никакого `Math.random()`
 * и никакого состояния кадра): линия обязана быть одинаковой при каждом входе
 * в секцию и между перезагрузками, иначе «провал» перестаёт быть событием,
 * которое можно обсудить, и становится шумом.
 *
 * Форма провала задана намеренно: спад начинается ЗА 9 секунд до отметки,
 * а сама отметка — это момент, когда внимание уже вернулось. Возврат —
 * не провал, а край ямы; так это и выглядит в реальной практике.
 */
const buildSignal = () => {
  const values = new Float32Array(SESSION_SECONDS + 1)
  const wobble = (t: number) =>
    Math.sin(t * 0.031) * 0.045 + Math.sin(t * 0.0073 + 1.7) * 0.07 + Math.sin(t * 0.19 + 0.4) * 0.022

  for (let t = 0; t <= SESSION_SECONDS; t += 1) {
    let value = 0.74 + wobble(t)

    // Вход: первые 40 секунд поле собирается, а не начинается собранным.
    if (t < 40) value *= 0.45 + 0.55 * (t / 40)
    // Выход: последнюю минуту закрываем по плану, а не по усталости.
    if (t > SESSION_SECONDS - 60) value = value * 0.88 + 0.1 * ((t - (SESSION_SECONDS - 60)) / 60)

    for (const event of EVENTS) {
      if (event.kind === 'drift') {
        /*
         * Форма провала: спуск ЗА 22 секунды до отметки и подъём к ней самой.
         * σ = 18 с здесь не косметика: при узком провале (σ ≈ 5) на графике шириной
         * 600 px выходила игла, и «яма» перестаёт читаться как участок, где внимание
         * уехало. Отметка — момент, когда оно вернулось; яма — то, что было до неё.
         */
        const dip = Math.exp(-(((t - (event.seconds - 22)) / 18) ** 2))
        value *= 1 - 0.93 * dip
      } else if (event.kind === 'hold') {
        value += 0.1 * Math.exp(-(((t - event.seconds) / 70) ** 2))
      }
    }

    values[t] = Math.min(1, Math.max(0.04, value))
  }

  return values
}

const SIGNAL = buildSignal()

type DrawState = {
  revealed: number
  playhead: number
  hover: number | null
  scrubbing: boolean
}

/**
 * Отступы графика — одной функцией на всех.
 * Отрисовка и попадание курсора обязаны считать одну и ту же геометрию: пока
 * `eventAt` брал свою копию зажатого отступа (28 против 30), подсветка события
 * срабатывала на соседнем от него пикселе, и это выглядело как случайная дрожь.
 */
const plotPadX = (width: number) => Math.max(30, width * 0.045)

const format = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
const formatHold = (value: number) => `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`

/**
 * Отрисовка сцены. Всё в одной функции: разложенная на слои она читается хуже,
 * а порядок слоёв здесь и есть смысл.
 */
function drawScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: DrawState,
) {
  const padX = plotPadX(width)
  const padTop = height * 0.11
  // Две строки подписей под осью: время шкалы и время возвратов.
  const padBottom = height * 0.24
  const plotWidth = width - padX * 2
  const plotHeight = height - padTop - padBottom
  const baseline = padTop + plotHeight

  const x = (seconds: number) => padX + (seconds / SESSION_SECONDS) * plotWidth
  const y = (value: number) => padTop + (1 - value) * plotHeight

  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = paletteColor('color.ink')
  ctx.fillRect(0, 0, width, height)

  /* --- сетка и подписи времени -------------------------------------- */
  ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace'
  ctx.textBaseline = 'top'

  for (let minute = 0; minute <= 40; minute += 10) {
    const tickX = x(minute * 60)
    ctx.strokeStyle = paletteRgba('color.line', minute === 0 ? 0.9 : 0.55)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(tickX, padTop - 8)
    ctx.lineTo(tickX, baseline)
    ctx.stroke()

    ctx.fillStyle = paletteRgba('color.fg', 0.42)
    // Крайние подписи прижаты к краям: иначе они вылезают за график и обрезаются.
    ctx.textAlign = minute === 0 ? 'left' : minute === 40 ? 'right' : 'center'
    ctx.fillText(format(minute * 60), tickX, baseline + 10)
  }

  // Горизонтальные уровни: дают линии масштаб, без них «провал» — просто зигзаг.
  for (const level of [0.33, 0.66]) {
    ctx.strokeStyle = paletteRgba('color.line', 0.35)
    ctx.beginPath()
    ctx.moveTo(padX, y(level))
    ctx.lineTo(padX + plotWidth, y(level))
    ctx.stroke()
  }

  ctx.textAlign = 'left'

  const path = (from: number, to: number) => {
    ctx.beginPath()
    for (let t = Math.max(0, Math.floor(from)); t <= Math.min(SESSION_SECONDS, to); t += 1) {
      const px = x(t)
      const py = y(SIGNAL[t] ?? 0)
      if (t <= Math.floor(from)) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
  }

  /* --- будущее: призрак всей сессии --------------------------------- */
  ctx.save()
  ctx.globalAlpha = 0.16
  ctx.strokeStyle = paletteColor('color.fg')
  ctx.lineWidth = 1
  path(0, SESSION_SECONDS)
  ctx.stroke()
  ctx.restore()

  /* --- прожитая часть: заливка + свечение --------------------------- */
  const revealed = Math.max(0, Math.min(SESSION_SECONDS, state.revealed))

  if (revealed > 1) {
    const gradient = ctx.createLinearGradient(0, padTop, 0, baseline)
    gradient.addColorStop(0, paletteRgba('color.accent.lime', 0.16))
    gradient.addColorStop(1, paletteRgba('color.accent.lime', 0))
    path(0, revealed)
    ctx.lineTo(x(revealed), baseline)
    ctx.lineTo(x(0), baseline)
    ctx.closePath()
    ctx.fillStyle = gradient
    ctx.fill()

    ctx.save()
    // Свечение тремя проходами: постпроцессинг за это платить не должен.
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = paletteRgba('color.accent.lime', 0.1)
    ctx.lineWidth = 9
    path(0, revealed)
    ctx.stroke()
    ctx.strokeStyle = paletteRgba('color.accent.lime', 0.22)
    ctx.lineWidth = 4
    path(0, revealed)
    ctx.stroke()
    ctx.strokeStyle = paletteRgba('color.accent.lime', 0.95)
    ctx.lineWidth = 1.6
    path(0, revealed)
    ctx.stroke()
    ctx.restore()
  }

  /* --- отметки событий --------------------------------------------- */
  ctx.textAlign = 'center'

  /*
   * Время возвратов идёт отдельной строкой под осью и с защитой от наложения:
   * 01:12 и 00:00 на узком экране оказываются в двадцати пикселях друг от друга,
   * и подписи сливались в нечитаемую кашу. Кто не влез — остаётся без подписи,
   * но маркер, яма и читалка справа никуда не деваются. Подпись под курсором
   * рисуется всегда: её выбрал человек.
   */
  const MIN_LABEL_GAP = 46
  let lastLabelX = -Infinity

  EVENTS.forEach((event, index) => {
    const isReturn = event.kind === 'drift'
    const visible = event.seconds <= revealed + 0.5
    const active = state.hover === index
    const eventX = x(event.seconds)
    const eventY = y(SIGNAL[Math.round(event.seconds)] ?? 0)

    if (visible) {
      ctx.setLineDash(isReturn ? [3, 4] : [1, 4])
      ctx.strokeStyle = isReturn
        ? paletteRgba('color.accent.magenta', active ? 0.95 : 0.5)
        : paletteRgba('color.accent.lime', active ? 0.9 : 0.32)
      ctx.lineWidth = active ? 1.5 : 1
      ctx.beginPath()
      ctx.moveTo(eventX, eventY)
      ctx.lineTo(eventX, baseline)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Отметка-точка: без неё возврат читается как случайный изгиб линии.
    ctx.beginPath()
    ctx.arc(eventX, eventY, active ? 5 : 3, 0, Math.PI * 2)
    ctx.fillStyle = isReturn
      ? paletteRgba('color.accent.magenta', visible ? 1 : 0.35)
      : paletteRgba('color.accent.lime', visible ? 0.95 : 0.35)
    ctx.fill()

    if (isReturn && visible && (active || eventX - lastLabelX >= MIN_LABEL_GAP)) {
      lastLabelX = eventX
      ctx.font = active ? '500 12px "JetBrains Mono", ui-monospace, monospace' : '500 10px "JetBrains Mono", ui-monospace, monospace'
      ctx.fillStyle = paletteRgba('color.accent.magenta', active ? 1 : 0.78)
      ctx.fillText(format(event.seconds), eventX, baseline + 27)
    }
  })
  ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace'

  /* --- плейхед ------------------------------------------------------ */
  const headX = x(Math.max(0, Math.min(SESSION_SECONDS, state.playhead)))
  const headY = y(SIGNAL[Math.round(state.playhead)] ?? 0)

  ctx.strokeStyle = paletteRgba('color.fg', state.scrubbing ? 0.75 : 0.42)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(headX, padTop * 0.55)
  ctx.lineTo(headX, baseline)
  ctx.stroke()

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.beginPath()
  ctx.arc(headX, headY, 9, 0, Math.PI * 2)
  ctx.fillStyle = paletteRgba('color.accent.cyan', 0.18)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(headX, headY, 3.4, 0, Math.PI * 2)
  ctx.fillStyle = paletteColor('color.accent.cyan')
  ctx.fill()
  ctx.restore()
}

export function Chronicle() {
  const root = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const clock = useRef<HTMLSpanElement>(null)

  const [current, setCurrent] = useState(RETURNS[RETURNS.length - 1] ?? 0)
  const [hover, setHover] = useState<number | null>(null)
  const [scrubbing, setScrubbing] = useState(false)
  const { reduced } = useMotionPrefs()

  /* Прогресс привязан к самой сцене: сессия «проигрывается» ровно пока график на экране. */
  const { scrollYProgress } = useScroll({ target: stage, offset: ['start 0.92', 'end 0.55'] })

  const state = useRef({
    scroll: 0,
    scrub: 0,
    active: false,
    hover: null as number | null,
    /** Сколько секунд сессии уже прожито — дальше этой точки линия нарисована ярко */
    revealed: 0,
    /** Где стоит точка «сейчас»: по умолчанию голова линии, после перемотки — сама перемотка */
    playhead: 0,
    /** Индекс события, ближайшего к плейхеду */
    nearest: 0,
    width: 0,
    height: 0,
    lastPaint: 0,
  })

  const paint = useCallback(() => {
    const node = canvas.current
    const ctx = node?.getContext('2d')
    if (!node || !ctx) return

    const { width, height, revealed, playhead, hover, active, nearest } = state.current
    // Во время перемотки подсветка идёт за плейхедом, а не за забытым наведением.
    drawScene(ctx, width, height, {
      revealed,
      playhead,
      hover: hover ?? (active ? nearest : null),
      scrubbing: active,
    })
  }, [])

  /* Размер канваса — по боксу секции, с потолком DPR 2 (как в «Поле»). */
  useEffect(() => {
    const node = canvas.current
    const box = stage.current
    if (!node || !box) return

    const resize = () => {
      const rect = box.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP)
      state.current.width = rect.width
      state.current.height = rect.height
      node.width = Math.round(rect.width * dpr)
      node.height = Math.round(rect.height * dpr)
      const ctx = node.getContext('2d')
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
      paint()
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(box)
    return () => observer.disconnect()
  }, [paint])

  useRafLoop(
    (delta) => {
      const node = canvas.current
      if (!node) return

      if (!reduced) {
        state.current.scroll = smooth(state.current.scroll, scrollYProgress.get() * SESSION_SECONDS, delta, 0.09)
        /*
         * Пин перемотки отпускается сам, когда скролл его догнал: иначе «сейчас»
         * навсегда остаётся там, куда его перетащили мышью, и расходится с головой линии.
         * При reduced-motion пин не отпускаем — там скролл вообще не источник времени.
         */
        if (!state.current.active && state.current.scrub > 0 && state.current.scroll > state.current.scrub) {
          state.current.scrub = 0
        }
      }

      const scrollSeconds = reduced ? SESSION_SECONDS : state.current.scroll
      state.current.revealed = Math.max(scrollSeconds, state.current.scrub)
      state.current.playhead =
        state.current.active || state.current.scrub > 0 ? state.current.scrub : scrollSeconds

      const nearest = EVENTS.reduce((best, event, index) =>
        Math.abs(event.seconds - state.current.playhead) < Math.abs(EVENTS[best]!.seconds - state.current.playhead) ? index : best,
        state.current.hover ?? current,
      )
      state.current.nearest = nearest
      if (nearest !== current) setCurrent(nearest)

      paint()

      // Числа пишем ~8 раз в секунду: их читает человек, а не график.
      state.current.lastPaint += delta
      if (state.current.lastPaint >= 120) {
        state.current.lastPaint = 0
        if (clock.current) clock.current.textContent = format(state.current.playhead)
      }
    },
    { target: stage },
  )

  /** Координата курсора → индекс ближайшего события. Только чтение, без ре-рендеров в кадре. */
  const eventAt = useCallback((clientX: number) => {
    const box = stage.current
    if (!box) return null
    const rect = box.getBoundingClientRect()
    const padX = plotPadX(rect.width)
    const seconds = ((clientX - rect.left - padX) / (rect.width - padX * 2)) * SESSION_SECONDS
    let best: number | null = null
    EVENTS.forEach((event, index) => {
      const distance = Math.abs(event.seconds - seconds)
      if (distance < 55 && (best === null || distance < Math.abs(EVENTS[best]!.seconds - seconds))) best = index
    })
    return best
  }, [])

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = stage.current
    if (!box) return
    const rect = box.getBoundingClientRect()
    const ratio = (event.clientX - rect.left) / rect.width
    const seconds = Math.max(0, Math.min(SESSION_SECONDS, ratio * SESSION_SECONDS))

    if (state.current.active) {
      state.current.scrub = seconds
      /* Перетаскивание отменяет наведение: читалка обязана идти за рукой, а не за старой точкой. */
      if (state.current.hover !== null) {
        state.current.hover = null
        setHover(null)
      }
      return
    }

    const index = eventAt(event.clientX)
    if (index !== state.current.hover) {
      state.current.hover = index
      setHover(index)
    }
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = stage.current
    if (!box) return
    const rect = box.getBoundingClientRect()
    const ratio = (event.clientX - rect.left) / rect.width
    state.current.active = true
    state.current.scrub = Math.max(0, Math.min(SESSION_SECONDS, ratio * SESSION_SECONDS))
    setScrubbing(true)
  }

  useEffect(() => {
    if (!scrubbing) return
    /* Слушатели на окне: тянуть «скраббер» можно, даже когда курсор ушёл за пределы графика. */
    const stop = () => {
      state.current.active = false
      setScrubbing(false)
    }
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [scrubbing])

  /**
   * Переход к событию: перематываем к нему, поднимаем его в читалке и держим
   * линию раскрытой до этого момента. Один путь для списка возвратов и для стрелок,
   * чтобы клавиатура и мышь не расходились в поведении.
   */
  const select = useCallback((index: number) => {
    const event = EVENTS[index]
    if (!event) return
    state.current.scrub = Math.max(state.current.scrub, event.seconds)
    state.current.hover = index
    setHover(index)
    setCurrent(index)
  }, [])

  const stepReturn = useCallback(
    (direction: 1 | -1) => {
      const position = RETURNS.indexOf(hover ?? current)
      const base = position >= 0 ? position : direction === 1 ? -1 : RETURNS.length
      select(RETURNS[Math.min(RETURNS.length - 1, Math.max(0, base + direction))] ?? RETURNS[0]!)
    },
    [current, hover, select],
  )

  const shown = EVENTS[hover ?? current] ?? EVENTS[0]!
  const holds = LOG.flatMap((entry) => (entry.held ? [entry.held] : []))
  const longest = Math.max(...holds)
  const average = Math.round(holds.reduce((sum, value) => sum + value, 0) / holds.length)

  return (
    <section ref={root} id="chronicle" aria-labelledby="chronicle-title" className="relative border-t border-line/60">
      <div className="u-container py-2xl">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <ScrambleText text="006 — Хроника" className="kicker" />
            <h2
              id="chronicle-title"
              className="mt-md max-w-[26ch] text-title leading-[1.02] font-medium tracking-[-0.02em]"
            >
              Сорок минут одной линией. Каждый провал на ней — возврат, который заметили.
            </h2>
          </div>

          <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <div>
              <dt className="font-mono text-[10px] tracking-[0.18em] text-fg-faint uppercase">возвратов</dt>
              <dd className="mt-1 font-mono text-[15px] text-fg tabular-nums">{holds.length}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] tracking-[0.18em] text-fg-faint uppercase">длиннейшее</dt>
              <dd className="mt-1 font-mono text-[15px] text-accent-lime tabular-nums">{formatHold(longest)}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] tracking-[0.18em] text-fg-faint uppercase">среднее</dt>
              <dd className="mt-1 font-mono text-[15px] text-fg tabular-nums">{formatHold(average)}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-xl grid gap-lg lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] lg:gap-2xl">
          {/* Сама осциллограмма: скролл проживает сессию, курсор подглядывает момент, драг перематывает. */}
          <div className="border border-line/60 bg-surface/30">
            <div className="flex">
              {/* Подпись оси живёт в DOM, а не в canvas: на графике она налезала
                  на подписи времени и на спады линии. */}
              <div
                aria-hidden="true"
                className="hidden w-7 shrink-0 items-center justify-center border-r border-line/40 sm:flex"
              >
                <span className="rotate-180 font-mono text-[9px] tracking-[0.14em] text-fg-faint uppercase [writing-mode:vertical-rl]">
                  уровень удержания
                </span>
              </div>

              <div
                ref={stage}
                onPointerMove={onPointerMove}
                onPointerDown={onPointerDown}
                onPointerLeave={() => {
                  state.current.hover = null
                  setHover(null)
                }}
                data-scrubbing={scrubbing ? 'true' : 'false'}
                className={`relative h-[clamp(19rem,46vh,31rem)] flex-1 touch-pan-y select-none ${
                  scrubbing ? 'cursor-ew-resize' : 'cursor-crosshair'
                }`}
              >
                <div className="grid-lines pointer-events-none absolute inset-0 opacity-25" aria-hidden="true" />
                <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-hidden="true" />

              </div>
            </div>

            {/* Подпись и счётчик — отдельной строкой под графиком: вплотную к осям
                они налезали на подписи времени возвратов. */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/40 px-4 py-3">
              <p className="max-w-[56ch] font-mono text-[10px] leading-relaxed tracking-[0.14em] text-fg-faint uppercase">
                линия — удержание · провал — возврат · тяни мышью, чтобы перемотать
              </p>
              <p className="font-mono text-[11px] tracking-[0.16em] text-fg uppercase tabular-nums">
                <span ref={clock}>00:00</span>
                <span className="text-fg-faint"> / 40:00</span>
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-lg">
            {/* Читалка: живёт вне канваса, поэтому текст не наезжает на линию ни на какой ширине. */}
            <figure
              className={`border-l-2 bg-surface/40 px-4 py-4 transition-colors duration-300 ${
                shown.kind === 'drift' ? 'border-accent-magenta' : 'border-accent-lime'
              }`}
            >
              <figcaption className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="font-mono text-[11px] text-fg tabular-nums">{shown.time}</span>
                <span className={`font-mono text-[10px] tracking-[0.18em] uppercase ${KIND_COLOR[shown.kind]}`}>
                  {KIND_LABEL[shown.kind]}
                </span>
                {shown.held ? (
                  <span className="font-mono text-[10px] text-fg-faint tabular-nums">держал {formatHold(shown.held)}</span>
                ) : null}
              </figcaption>
              <p className="mt-2 max-w-[42ch] text-body text-fg-dim">{shown.note}</p>
            </figure>

            {/*
             * Список возвратов: и навигация, и заполнение колонки — на десктопе
             * без него правая часть читалась как пустая. Кнопки, а не ссылки:
             * никакого перехода, только перемотка графика.
             */}
            <ul className="border-y border-line/40">
              {RETURNS.map((index) => {
                const event = EVENTS[index]!
                const active = (hover ?? current) === index
                return (
                  <li key={event.time} className="border-b border-line/40 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => select(index)}
                      aria-pressed={active}
                      className={`relative flex w-full items-baseline justify-between gap-3 py-2.5 pl-3 text-left transition-colors duration-200 ${
                        active ? 'text-accent-magenta' : 'text-fg-dim hover:text-fg'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`absolute top-1 bottom-1 left-0 w-px origin-center bg-accent-magenta transition-transform duration-300 ${
                          active ? 'scale-y-100' : 'scale-y-0'
                        }`}
                      />
                      <span className="font-mono text-[11px] tabular-nums">{event.time}</span>
                      <span className="font-mono text-[10px] text-fg-faint tabular-nums">
                        держал {formatHold(event.held ?? 0)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>

            <div className="flex items-center justify-between gap-4">
              <span className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">шаг по возвратам</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => stepReturn(-1)}
                  className="grid h-9 w-9 place-items-center rounded-full border border-line text-fg-dim transition-colors duration-200 hover:border-accent-magenta hover:text-accent-magenta"
                  aria-label="Предыдущий возврат"
                >
                  <span aria-hidden="true" className="text-[14px] leading-none">
                    ←
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => stepReturn(1)}
                  className="grid h-9 w-9 place-items-center rounded-full border border-line text-fg-dim transition-colors duration-200 hover:border-accent-magenta hover:text-accent-magenta"
                  aria-label="Следующий возврат"
                >
                  <span aria-hidden="true" className="text-[14px] leading-none">
                    →
                  </span>
                </button>
              </div>
            </div>

            <div role="status" aria-live="polite" className="sr-only">
              {shown.time}, {KIND_LABEL[shown.kind]}: {shown.note}
            </div>

            {/* Текстовая версия графика: содержимое не должно зависеть от canvas. */}
            <ol className="sr-only">
              {LOG.map((entry) => (
                <li key={entry.time}>
                  {entry.time} — {KIND_LABEL[entry.kind]}
                  {entry.held ? `, держал ${formatHold(entry.held)}` : ''}: {entry.note}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  )
}
