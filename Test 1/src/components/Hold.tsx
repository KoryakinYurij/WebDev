import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Reveal, ScrambleText } from './ui/Reveal'
import { useRafLoop } from '../lib/use-raf-loop'
import { useMotionPrefs } from '../lib/motion-config'
import { easeOutExpo, seconds, durations } from '../lib/bezier'

/** Полоса допуска: доля высоты сцены и жёсткий минимум для низких экранов. */
const TOL_RATIO = 0.13
const MIN_TOL = 18

type Verdict = { score: number; held: number; returns: number; longest: number }

/**
 * 008 — Точка удержания.
 *
 * Единственное место на странице, где посетитель не смотрит, а делает.
 * Механика — метафора практики: держишь — счёт растёт, уехал — возврат,
 * и он не наказывается, а просто засчитывается.
 *
 * Числа пишутся в DOM через ref, а не через setState: за 30 секунд удержания
 * это 1800 кадров, и ре-рендер на каждом был бы ровно тем, от чего мы ушли в HUD.
 */
export function Hold() {
  const root = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const marker = useRef<HTMLDivElement>(null)
  const clock = useRef<HTMLSpanElement>(null)
  const score = useRef<HTMLSpanElement>(null)
  const fill = useRef<HTMLDivElement>(null)

  const [holding, setHolding] = useState(false)
  const [returns, setReturns] = useState(0)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const { reduced } = useMotionPrefs()

  const active = useRef(false)
  const pointerY = useRef(0)
  const elapsed = useRef(0)
  const inBand = useRef(0)
  const stretch = useRef(0)
  const longest = useRef(0)
  const wasIn = useRef(true)
  const count = useRef(0)

  const paint = useCallback(() => {
    const node = stage.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const centre = rect.top + rect.height / 2
    const tolerance = Math.max(MIN_TOL, rect.height * TOL_RATIO)
    const offset = pointerY.current - centre
    const inside = Math.abs(offset) <= tolerance

    if (marker.current) {
      const clamped = Math.max(-rect.height / 2, Math.min(rect.height / 2, offset))
      marker.current.style.transform = `translate3d(0, ${clamped.toFixed(1)}px, 0)`
      marker.current.dataset.state = inside ? 'in' : 'out'
    }
    if (clock.current) clock.current.textContent = (elapsed.current / 1000).toFixed(1)
    if (score.current) {
      const value = elapsed.current > 0 ? (inBand.current / elapsed.current) * 100 : 0
      score.current.textContent = String(Math.round(value)).padStart(2, '0')
    }
    if (fill.current) fill.current.style.transform = `scaleX(${Math.min(1, inBand.current / 30000)})`
  }, [])

  useRafLoop(
    (delta) => {
      if (!active.current) return
      const node = stage.current
      if (!node) return

      const rect = node.getBoundingClientRect()
      const tolerance = Math.max(MIN_TOL, rect.height * TOL_RATIO)
      const inside = Math.abs(pointerY.current - (rect.top + rect.height / 2)) <= tolerance

      elapsed.current += delta
      stretch.current += delta
      if (inside) inBand.current += delta

      /* Возврат фиксируется один раз на переход, а не на каждом кадре вне полосы. */
      if (!inside && wasIn.current) {
        count.current += 1
        longest.current = Math.max(longest.current, stretch.current)
        stretch.current = 0
        setReturns(count.current)
      }
      wasIn.current = inside
      paint()
    },
    { enabled: holding, target: stage },
  )

  const start = useCallback(
    (clientY: number) => {
      pointerY.current = clientY
      active.current = true
      elapsed.current = 0
      inBand.current = 0
      stretch.current = 0
      longest.current = 0
      count.current = 0
      wasIn.current = true
      setReturns(0)
      setVerdict(null)
      setHolding(true)
      paint()
    },
    [paint],
  )

  const stop = useCallback(() => {
    if (!active.current) return
    active.current = false
    longest.current = Math.max(longest.current, stretch.current)
    setHolding(false)
    if (elapsed.current > 250) {
      setVerdict({
        score: elapsed.current > 0 ? (inBand.current / elapsed.current) * 100 : 0,
        held: elapsed.current,
        returns: count.current,
        longest: longest.current,
      })
    }
  }, [])

  /*
   * Слушатели на окне, а не на сцене: уход за пределы полосы не должен требовать
   * держать курсор внутри элемента — иначе самый смысл упражнения теряется.
   * Вешаются только на время удержания и снимаются вместе с ним.
   */
  useEffect(() => {
    if (!holding) return

    const onMove = (event: PointerEvent) => {
      pointerY.current = event.clientY
    }
    const onUp = () => stop()

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [holding, stop])

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    start(event.clientY)
  }

  /*
   * Клавиатура: пробел или Enter удерживают «в центре». Здесь удержание
   * честное только по времени — зато блок остаётся работоспособным без указателя.
   */
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== ' ' && event.key !== 'Enter') return
    event.preventDefault()
    if (event.repeat || active.current) return
    const rect = stage.current?.getBoundingClientRect()
    start(rect ? rect.top + rect.height / 2 : 0)
  }

  const onKeyUp = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== ' ' && event.key !== 'Enter') return
    event.preventDefault()
    stop()
  }

  return (
    <section ref={root} id="hold" aria-labelledby="hold-title" className="relative border-t border-line/60">
      <div className="u-container py-2xl">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <ScrambleText text="008 — Точка удержания" className="kicker" />
            <h2 id="hold-title" className="mt-md max-w-[20ch] text-title leading-[1.02] font-medium tracking-[-0.02em]">
              Держи линию — и ничего не делай.
            </h2>
          </div>
          <p className="max-w-[38ch] font-mono text-[10px] leading-relaxed tracking-[0.14em] text-fg-faint uppercase">
            нажми и удерживай · курсор обязан остаться в полосе · {reduced ? 'анимация не влияет на счёт' : 'счёт идёт в реальном времени'}
          </p>
        </div>

        <Reveal delay={0.08} distance={16} className="mt-xl">
          <div
            ref={stage}
            onPointerDown={onPointerDown}
            onKeyDown={onKeyDown}
            onKeyUp={onKeyUp}
            role="button"
            tabIndex={0}
            aria-label="Удержание: нажми и удерживай, чтобы держать линию"
            data-cursor={holding ? 'не двигай' : 'удерживай'}
            className="relative h-[38vh] min-h-[240px] cursor-crosshair touch-pan-y overflow-hidden border border-line/60 bg-surface/30 select-none"
          >
            <div className="grid-lines pointer-events-none absolute inset-0 opacity-25" aria-hidden="true" />

            {/* Полоса допуска — та же геометрия, что и в расчёте: 26% высоты по центру. */}
            <div
              className="pointer-events-none absolute inset-x-0 top-1/2 h-[26%] -translate-y-1/2 border-y border-accent-lime/30 bg-accent-lime/[0.06]"
              aria-hidden="true"
            />
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-accent-lime/50" aria-hidden="true" />

            {/* Маркер — единственный элемент, который двигается вместе с курсором. */}
            <div
              ref={marker}
              data-state="in"
              className="group pointer-events-none absolute inset-x-0 top-1/2 will-change-transform"
              aria-hidden="true"
            >
              <div className="h-px w-full bg-accent-lime transition-colors duration-200 group-data-[state=out]:bg-accent-magenta" />
              <div className="absolute right-4 -top-3.5 font-mono text-[9px] tracking-[0.18em] text-fg-faint uppercase">
                ты
              </div>
            </div>

            {/* Числа: слева — время, справа — удержание. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-6 p-5">
              <div>
                <p className="font-mono text-[9px] tracking-[0.2em] text-fg-faint uppercase">в поле</p>
                <p className="mt-1 font-mono text-[clamp(1.6rem,4vw,2.6rem)] leading-none font-medium tabular-nums text-fg">
                  <span ref={clock}>0.0</span>
                  <span className="text-fg-faint">с</span>
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-[9px] tracking-[0.2em] text-fg-faint uppercase">удержание</p>
                <p className="mt-1 font-mono text-[clamp(1.6rem,4vw,2.6rem)] leading-none font-medium tabular-nums text-accent-lime">
                  <span ref={score}>00</span>
                  <span className="text-fg-faint">%</span>
                </p>
              </div>
            </div>

            <div className="absolute inset-x-0 top-0 h-[3px] bg-line/40" aria-hidden="true">
              <div ref={fill} className="h-full origin-left scale-x-0 bg-accent-lime/70" />
            </div>

            <p className="pointer-events-none absolute top-5 left-5 font-mono text-[10px] tracking-[0.16em] text-fg-dim uppercase">
              {holding ? `возвратов: ${returns}` : verdict ? 'сессия закрыта' : 'удерживай, чтобы начать'}
            </p>
          </div>

          <div className="mt-md flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-[52ch] font-mono text-[10px] leading-relaxed tracking-[0.14em] text-fg-faint uppercase">
              удержание — доля времени в полосе допуска · возврат засчитывается, но не наказывается
            </p>

            {verdict ? (
              <motion.dl
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: seconds(durations.base), ease: easeOutExpo }}
                className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border border-line/60 px-4 py-3"
              >
                <Verdict label="итог" value={`${Math.round(verdict.score)}%`} accent />
                <Verdict label="в поле" value={`${(verdict.held / 1000).toFixed(1)} с`} />
                <Verdict label="возвратов" value={String(verdict.returns)} />
                <Verdict label="длиннейшее" value={`${(verdict.longest / 1000).toFixed(1)} с`} />
              </motion.dl>
            ) : (
              <p className="font-mono text-[10px] tracking-[0.14em] text-fg-faint uppercase">
                {holding ? 'отпусти, чтобы увидеть итог' : 'пробел тоже работает'}
              </p>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function Verdict({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">{label}</dt>
      <dd className={`font-mono text-[13px] tabular-nums ${accent ? 'text-accent-lime' : 'text-fg'}`}>{value}</dd>
    </div>
  )
}
