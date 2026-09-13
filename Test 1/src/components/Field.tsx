import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { useMotionPrefs } from '../lib/motion-config'
import { useRafLoop } from '../lib/use-raf-loop'
import { on } from '../lib/bus'
import { telemetry, smooth } from '../lib/telemetry'
import { paletteColor, paletteRgba, type ColorToken } from '../lib/paint'
import { numbers } from '../generated/tokens'
import { easeOutExpo, seconds, durations } from '../lib/bezier'
import { ScrambleText } from './ui/Reveal'

type Mode = 'scatter' | 'orbit' | 'collapse'

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'scatter', label: 'Россыпь', hint: 'без объекта: внимание рассеяно по всему полю' },
  { id: 'orbit', label: 'Орбита', hint: 'один объект: частицы держат концентрические круги' },
  { id: 'collapse', label: 'Точка', hint: 'предельное удержание: всё сходится в одну точку' },
]

/** Цвета частиц берём из токенов: canvas и интерфейс рисуют одну палитру. */
const PARTICLE_COLOURS: readonly ColorToken[] = [
  'color.accent.cyan',
  'color.accent.lime',
  'color.accent.indigo',
  'color.accent.magenta',
]

/** Сила дрейфа россыпи на кадр: определяет, насколько далеко частица уходит от своего якоря. */
const DRIFT = 0.05

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  ax: number
  ay: number
  sx: number
  sy: number
  colour: ColorToken
  size: number
  stiffness: number
  /** Готовая строка rgba: собирается при смене режима, а не 900 раз за кадр. */
  fill: string
}

type Ripple = { x: number; y: number; age: number }

/**
 * Профиль режима: плотность скопления, жёсткость пружины и параметры отрисовки.
 *
 * Плотность скопления и альфа частицы ЖЁСТКО связаны: при аддитивном смешении
 * перекрывающиеся частицы суммируются, и в режиме «Точка» ~700 объектов в круге
 * 35 px уходили в чистый белый — это читалось как артефакт рендера, а не как дизайн.
 * Затухание шлейфа работает туда же: без него кадры накапливаются и пересвет усиливается
 * примерно втрое (1 / trailFade).
 */
const MODE_PROFILE: Record<Mode, { stiffness: number; alpha: number; trailFade: number }> = {
  scatter: { stiffness: 0.9, alpha: 0.5, trailFade: 0.34 },
  orbit: { stiffness: 3.4, alpha: 0.34, trailFade: 0.5 },
  collapse: { stiffness: 6.2, alpha: 0.075, trailFade: 0.78 },
}

export function Field() {
  const sectionRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mode, setMode] = useState<Mode>('scatter')
  const modeRef = useRef<Mode>('scatter')
  const { reduced, quality, read } = useMotionPrefs()

  const count = quality === 'high' ? numbers.motion.particles : numbers.motion.particlesLow

  const state = useRef({
    particles: [] as Particle[],
    width: 0,
    height: 0,
    pointer: { x: -9999, y: -9999, active: false },
    ripples: [] as Ripple[],
    coherence: 0,
    /** Доля цвета, остающаяся от предыдущего кадра: задаёт длину шлейфа. */
    trailFade: MODE_PROFILE.scatter.trailFade,
  })

  /** Раскладка якорей — единственное, что меняется при смене режима. */
  const layout = useCallback((part: Particle, next: Mode, width: number, height: number) => {
    const profile = MODE_PROFILE[next]
    // Ставим до ранних return: иначе для россыпи и орбиты шлейф остаётся от прошлого режима.
    state.current.trailFade = profile.trailFade

    const cx = width / 2
    const cy = height / 2
    const minSide = Math.min(width, height)

    if (next === 'scatter') {
      part.ax = part.sx * width
      part.ay = part.sy * height * 0.9 + height * 0.05
      /*
       * Пружина средняя, но дрейф сильный (см. D R I F T в кадре): частица ходит вокруг якоря
       * на десятки пикселей. Так россыпь и выглядит живой, и метрика удержания честно низкая,
       * а не 90 % там, где удержания нет.
       */
      part.stiffness = profile.stiffness
      part.fill = paletteRgba(part.colour, profile.alpha)
      return
    }

    if (next === 'orbit') {
      const rings = 7
      const ring = Math.floor(part.sx * rings)
      const base = minSide * 0.08
      const step = minSide * 0.055
      const angle = part.sy * Math.PI * 2 + ring * 0.9
      const radius = base + ring * step
      part.ax = cx + Math.cos(angle) * radius
      part.ay = cy + Math.sin(angle) * radius * 0.78
      part.stiffness = profile.stiffness
      part.fill = paletteRgba(part.colour, profile.alpha)
      return
    }

    // collapse: все якоря в одной точке. Разброс радиальный, а не в квадратной коробке —
    // прямоугольное пятно читается как артефакт рендера.
    const spread = Math.sqrt(part.sx) * minSide * 0.028
    const spreadAngle = part.sy * Math.PI * 2
    part.ax = cx + Math.cos(spreadAngle) * spread
    part.ay = cy + Math.sin(spreadAngle) * spread
    part.stiffness = profile.stiffness
    part.fill = paletteRgba(part.colour, profile.alpha)
  }, [])

  const seed = useCallback(
    (width: number, height: number) => {
      // Плотность считаем от площади, но с потолком из токена: 4K-монитор не должен требовать
      // вчетверо больше частиц ради той же картинки.
      const target = Math.max(2, Math.min(count, Math.floor((width * height) / 700)))
      const particles = state.current.particles
      particles.length = Math.min(particles.length, target)

      for (let i = particles.length; i < target; i += 1) {
        const part: Particle = {
          x: Math.random() * width,
          y: Math.random() * height,
          vx: 0,
          vy: 0,
          ax: 0,
          ay: 0,
          sx: Math.random(),
          sy: Math.random(),
          colour: PARTICLE_COLOURS[Math.floor(Math.random() * PARTICLE_COLOURS.length)] ?? 'color.accent.cyan',
          size: 1.6 + Math.random() * 3.4,
          stiffness: 1,
          fill: '',
        }
        layout(part, modeRef.current, width, height)
        // Ставим частицу сразу в её якорь: иначе первый кадр — это столпотворение в углу.
        part.x = part.ax
        part.y = part.ay
        particles.push(part)
      }
    },
    [count, layout],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    const section = sectionRef.current
    if (!canvas || !section) return

    const resize = () => {
      const rect = section.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      state.current.width = rect.width
      state.current.height = rect.height
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.fillStyle = paletteColor('color.ink')
        ctx.fillRect(0, 0, rect.width, rect.height)
      }
      seed(rect.width, rect.height)
      // Пересобираем якоря под новые размеры, не теряя позиции частиц.
      for (const part of state.current.particles) layout(part, modeRef.current, rect.width, rect.height)
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(section)
    return () => observer.disconnect()
  }, [seed, layout])

  useEffect(() => {
    modeRef.current = mode
    const { width, height } = state.current
    for (const part of state.current.particles) layout(part, mode, width, height)
    telemetry.mode = mode.toUpperCase()
  }, [mode, layout])

  const shock = useCallback((x: number, y: number) => {
    const { particles, width, height } = state.current
    const cx = x < 0 ? width / 2 : x
    const cy = y < 0 ? height / 2 : y
    state.current.ripples.push({ x: cx, y: cy, age: 0 })

    const radius = Math.min(width, height) * 0.45
    for (const part of particles) {
      const dx = part.x - cx
      const dy = part.y - cy
      const dist = Math.hypot(dx, dy) || 1
      if (dist > radius) continue
      const force = (1 - dist / radius) * 26
      part.vx += (dx / dist) * force
      part.vy += (dy / dist) * force
    }
  }, [])

  useEffect(() => on('shockwave', ({ x, y }) => shock(x, y)), [shock])

  useRafLoop(
    (delta, elapsed) => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return

      const { particles, width, height, pointer, ripples } = state.current
      if (!particles.length) return

      const intensity = read()
      const dt = Math.min(delta, 32) / 16.666
      const damp = 0.9 - intensity * 0.06

      ctx.globalCompositeOperation = 'source-over'
      // Шлейф вместо полной очистки: траектории читаются без хранения истории.
      ctx.fillStyle = paletteRgba('color.ink', state.current.trailFade)
      ctx.fillRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'lighter'

      const toX = pointer.active ? pointer.x : width / 2
      const toY = pointer.active ? pointer.y : height / 2
      const repelRadius = Math.min(width, height) * 0.16

      let distanceSum = 0

      for (const part of particles) {
        const dx = part.x - toX
        const dy = part.y - toY
        const dist = Math.hypot(dx, dy)

        if (pointer.active && dist < repelRadius) {
          const force = (1 - dist / repelRadius) ** 2 * 9 * intensity
          part.vx += (dx / (dist || 1)) * force
          part.vy += (dy / (dist || 1)) * force
        }

        // Пружина к якорю: единственный источник «порядка», поэтому метрика честная.
        part.vx += (part.ax - part.x) * 0.0016 * part.stiffness * intensity
        part.vy += (part.ay - part.y) * 0.0016 * part.stiffness * intensity

        // Дрейф россыпи: сила зависит и от времени, и от частицы, поэтому поле «дышит» траекториями,
        // а не застывает в статичном смещении.
        if (modeRef.current === 'scatter') {
          const t = elapsed * 0.001
          part.vx += Math.sin(t * 0.5 + part.sy * 14 + part.ax * 0.012) * DRIFT * intensity
          part.vy += Math.cos(t * 0.42 + part.sx * 14 + part.ay * 0.012) * DRIFT * intensity
        }

        part.vx *= damp
        part.vy *= damp
        part.x += part.vx * dt
        part.y += part.vy * dt

        if (part.x < -40) part.x = width + 40
        if (part.x > width + 40) part.x = -40
        if (part.y < -40) part.y = height + 40
        if (part.y > height + 40) part.y = -40

        distanceSum += Math.hypot(part.ax - part.x, part.ay - part.y)

        // Круглые частицы с аддитивным смешением читаются как свечение, квадраты — как мусор.
        ctx.fillStyle = part.fill
        ctx.beginPath()
        ctx.arc(part.x, part.y, part.size * 0.6, 0, Math.PI * 2)
        ctx.fill()
      }

      /*
       * Когерентность = насколько близко поле к своим целям, относительно одной понятной константы:
       * HOLD_REFERENCE — смещение, дальше которого удержание считается потерянным.
       *
       * Проверялись два варианта, оба хуже:
       *  - среднее расстояние без нормировки (число нечитаемо в отрыве от размера экрана);
       *  - доля частиц в жёстком допуске — там порог на распределении даёт либо 95 %, либо 0 %,
       *    и метрика теряет разрешение ровно там, где должна различать режимы.
       */
      const mean = distanceSum / particles.length
      const reference = Math.min(width, height) * 0.09
      const raw = Math.max(0, 1 - mean / reference)
      state.current.coherence = smooth(state.current.coherence, raw * 100, delta, 0.35)
      telemetry.coherence = state.current.coherence
      telemetry.entities = particles.length

      for (let i = ripples.length - 1; i >= 0; i -= 1) {
        const ripple = ripples[i]
        ripple.age += delta / 1000
        if (ripple.age > 1.1) {
          ripples.splice(i, 1)
          continue
        }
        ctx.globalCompositeOperation = 'source-over'
        ctx.strokeStyle = paletteRgba('color.accent.lime', (1 - ripple.age / 1.1) * 0.5)
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(ripple.x, ripple.y, ripple.age * Math.min(width, height) * 0.5, 0, Math.PI * 2)
        ctx.stroke()
        ctx.globalCompositeOperation = 'lighter'
      }

      // Прицел на курсоре: показывает радиус отталкивания — взаимодействие должно быть очевидным.
      if (pointer.active) {
        ctx.globalCompositeOperation = 'source-over'
        ctx.strokeStyle = paletteRgba('color.fg', 0.28)
        ctx.beginPath()
        ctx.arc(toX, toY, repelRadius, 0, Math.PI * 2)
        ctx.stroke()
      }
    },
    { target: sectionRef, enabled: !reduced },
  )

  /* reduced-motion: один статичный кадр, без цикла и без взаимодействия. */
  useEffect(() => {
    if (!reduced) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const { particles, width, height } = state.current
    ctx.fillStyle = paletteColor('color.ink')
    ctx.fillRect(0, 0, width, height)
    ctx.globalCompositeOperation = 'lighter'
    for (const part of particles) {
      part.x = part.ax
      part.y = part.ay
      ctx.fillStyle = part.fill
      ctx.beginPath()
      ctx.arc(part.x, part.y, part.size * 0.6, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
    telemetry.entities = particles.length
    telemetry.coherence = 100
  }, [reduced, mode])

  const handlePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    state.current.pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top, active: true }
  }

  const clearPointer = () => {
    state.current.pointer.active = false
  }

  const hint = MODES.find((item) => item.id === mode)?.hint ?? ''

  return (
    <section
      ref={sectionRef}
      id="field"
      aria-labelledby="field-title"
      className="relative border-t border-line/60"
      onPointerMove={handlePointer}
      onPointerLeave={clearPointer}
    >
      <div
        className="relative min-h-[100svh] overflow-clip"
        onPointerDown={(event) => {
          const canvas = canvasRef.current
          if (!canvas) return
          const rect = canvas.getBoundingClientRect()
          shock(event.clientX - rect.left, event.clientY - rect.top)
        }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />

        {/* Затемняющий слой: контраст текста поверх произвольного шума обязан быть предсказуемым */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            // Верхний скрим шире обычного: частицы летают по всему полю, и заголовок
            // обязан оставаться читаемым в любом режиме, а не только в разреженном.
            background:
              'linear-gradient(180deg, color-mix(in srgb, var(--color-ink) 96%, transparent) 0%, color-mix(in srgb, var(--color-ink) 74%, transparent) 30%, transparent 52%, transparent 76%, color-mix(in srgb, var(--color-ink) 92%, transparent) 100%)',
          }}
        />

        {/* pt гасит наезд на фиксированную навигацию; содержимое прижато к низам секции. */}
        <div className="relative u-container flex min-h-[100svh] flex-col justify-between pt-[clamp(6rem,12vh,9rem)] pb-xl">
          <div className="max-w-[46ch]">
            <ScrambleText text="007 — Поле внимания" className="kicker" />
            <h2
              id="field-title"
              className="mt-md text-title leading-[1.02] font-medium tracking-[-0.02em]"
            >
              Кликни по полю. Потом попробуй удержать его в точке.
            </h2>
            <p className="mt-sm max-w-[42ch] text-body text-fg-dim" aria-live="polite">
              {hint}
            </p>
          </div>

          {/* Управление прижато вправо: левый нижний угол занят фиксированным HUD. */}
          <div className="flex flex-col items-end gap-md">
            <p className="max-w-[52ch] text-right font-mono text-[10px] leading-relaxed tracking-[0.14em] text-fg-faint uppercase">
              до {count} объектов · курсор двигает поле, клик даёт импульс
            </p>
            <div role="group" aria-label="Режим поля" className="flex flex-wrap gap-2">
              {MODES.map((item) => {
                const isActive = item.id === mode
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setMode(item.id)}
                    aria-pressed={isActive}
                    data-cursor={item.label.toLowerCase()}
                    className={`relative rounded-pill border px-4 py-2.5 font-mono text-[11px] tracking-[0.16em] uppercase transition-colors duration-200 ${
                      isActive ? 'border-accent-lime text-ink' : 'border-line text-fg-dim hover:border-fg-faint hover:text-fg'
                    }`}
                  >
                    {isActive ? (
                      <motion.span
                        layoutId="mode-pill"
                        className="absolute inset-0 rounded-pill bg-accent-lime"
                        transition={{ duration: seconds(durations.base), ease: easeOutExpo }}
                      />
                    ) : null}
                    <span className="relative z-10">{item.label}</span>
                  </button>
                )
              })}

              <button
                type="button"
                onClick={() => shock(-1, -1)}
                data-cursor="импульс"
                className="rounded-pill border border-accent-magenta/60 px-4 py-2.5 font-mono text-[11px] tracking-[0.16em] text-accent-magenta uppercase transition-colors duration-200 hover:bg-accent-magenta hover:text-ink"
              >
                Импульс
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
