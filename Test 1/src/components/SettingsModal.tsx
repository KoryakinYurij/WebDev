import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useMotionPrefs } from '../lib/motion-config'
import { getLenis } from '../lib/smooth-scroll'
import { useRafLoop } from '../lib/use-raf-loop'
import { telemetry } from '../lib/telemetry'
import { emit } from '../lib/bus'
import { easeOutExpo, seconds, durations } from '../lib/bezier'

const PRESETS = [
  { value: 0, label: 'статика' },
  { value: 0.45, label: 'сдержанно' },
  { value: 1, label: 'полная' },
]

/**
 * Настройки движения — модальное окно, а не секция.
 *
 * Это утилита, а не часть повествования: раньше она стояла в потоке страницы
 * и заставляла каждого читателя проходить мимо технического блока.
 *
 * Диагностика (fps, скорость, прогресс, объекты) переехала сюда же: на самой странице
 * остаётся только то, что относится к практике, а числа о производительности —
 * там, где их ищут.
 */
export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { intensity, setIntensity, reduceOverride, setReduceOverride, reduced, quality, setQuality } =
    useMotionPrefs()
  const sliderId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const [runId, setRunId] = useState(0)

  /* Escape закрывает; фокус держится внутри панели, пока она открыта. */
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panel.current) return

      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    /*
     * aria-modal="true" — это обещание, что фон инертен. Обещание надо выполнять:
     * без остановки Lenis колесо над диалогом прокручивало страницу за ним
     * (проверено: 1141 px пока окно было открыто).
     *
     * `overflow: hidden` на самом html, а не на body: у body есть `overflow-x: clip`,
     * а по спецификации тогда overflow корня НЕ наследуется от body и скролл остаётся.
     * Гуттер под скроллбар зарезервирован в CSS (scrollbar-gutter: stable),
     * поэтому открытие окна не сдвигает страницу на ширину полосы.
     */
    const lenis = getLenis()
    lenis?.stop()
    const html = document.documentElement
    const previousHtmlOverflow = html.style.overflow
    html.style.overflow = 'hidden'

    // Фокус уходит в панель, но не на первый элемент — иначе скролл прыгает к слайдеру.
    const timer = window.setTimeout(() => panel.current?.focus(), 40)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      html.style.overflow = previousHtmlOverflow
      // Свежий запрос к реестру: за время открытия Lenis мог быть пересоздан тумблером движения.
      getLenis()?.start()
      window.clearTimeout(timer)
      previouslyFocused?.focus?.()
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open ? (
        /*
         * data-lenis-prevent обязателен именно потому, что Lenis остановлен:
         * на остановке он делает preventDefault на любое колесо (проверено по исходнику),
         * и без этого атрибута окно нельзя было бы прокрутить колесом вообще.
         */
        <motion.div
          data-lenis-prevent
          className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto p-4 sm:items-center"
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: seconds(durations.base), ease: easeOutExpo }}
        >
          <button
            type="button"
            aria-label="Закрыть настройки"
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-ink/80 backdrop-blur-md"
          />

          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${sliderId}-title`}
            tabIndex={-1}
            /*
             * Ширина задана числом, а не `max-w-xl`, и это не стилистическая прихоть.
             * Наш `@theme` переопределяет пространство `--spacing-*` собственными именами,
             * а Tailwind резолвит `max-w-xl` именно через `--spacing-xl` — то есть
             * через `clamp(3rem, 6vw, 6rem)`. Модалка выходила полосой в 48—86 px:
             * Slider влезал, а тумблеры уезжали за край. Проверено замером:
             * `getComputedStyle(panel).maxWidth` возвращал 48 px при вьюпорте 734 px.
             * То же правило касается любых `max-w-sm|md|lg|2xl` — их в проекте быть не должно.
             */
            className="relative w-full max-w-[36rem] border border-line bg-surface/95 p-lg outline-none"
            initial={reduced ? false : { opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.99 }}
            transition={{ duration: seconds(durations.reveal), ease: easeOutExpo }}
          >
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="kicker">Настройки</p>
                <h2 id={`${sliderId}-title`} className="mt-2 text-heading leading-tight font-medium">
                  Движение и качество
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть"
                data-cursor="закрыть"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-fg-dim transition-colors duration-200 hover:border-accent-lime hover:text-accent-lime"
              >
                <span aria-hidden="true" className="text-[15px] leading-none">
                  ×
                </span>
              </button>
            </div>

            <div className="mt-lg flex flex-wrap items-end justify-between gap-4">
              <label htmlFor={sliderId} className="font-mono text-[10px] tracking-[0.18em] text-fg-dim uppercase">
                интенсивность движения
              </label>
              <span className="font-mono text-[clamp(1.6rem,4vw,2.6rem)] leading-none font-medium tabular-nums text-accent-lime">
                {Math.round(intensity * 100)}
                <span className="text-fg-faint">%</span>
              </span>
            </div>

            <input
              id={sliderId}
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(intensity * 100)}
              disabled={reduced}
              onChange={(event) => setIntensity(Number(event.target.value) / 100)}
              className="mt-md h-1.5 w-full cursor-pointer appearance-none rounded-pill bg-line accent-accent-lime disabled:cursor-not-allowed disabled:opacity-40"
            />

            <div className="mt-md flex flex-wrap gap-2">
              {PRESETS.map((preset) => {
                const isActive = Math.abs(intensity - preset.value) < 0.01
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setIntensity(preset.value)}
                    disabled={reduced}
                    aria-pressed={isActive}
                    className={`relative rounded-pill border px-4 py-2 font-mono text-[10px] tracking-[0.16em] uppercase transition-colors duration-200 disabled:opacity-40 ${
                      isActive ? 'border-accent-lime text-ink' : 'border-line text-fg-dim hover:text-fg'
                    }`}
                  >
                    {isActive ? (
                      <motion.span
                        layoutId="preset-pill"
                        className="absolute inset-0 rounded-pill bg-accent-lime"
                        transition={{ duration: seconds(durations.base), ease: easeOutExpo }}
                      />
                    ) : null}
                    <span className="relative z-10">{preset.label}</span>
                  </button>
                )
              })}
            </div>

            <div className="mt-lg grid gap-3 border-t border-line/60 pt-lg sm:grid-cols-2">
              <Toggle
                label="уменьшить движение"
                detail={reduceOverride ? 'включено вручную' : 'по системной настройке'}
                checked={reduceOverride}
                onChange={setReduceOverride}
              />
              <Toggle
                label="высокое качество"
                detail={quality === 'high' ? 'полная сцена' : 'облегчённая сцена'}
                checked={quality === 'high'}
                onChange={(value) => setQuality(value ? 'high' : 'low')}
              />
            </div>

            <div className="mt-lg flex flex-wrap items-center gap-3 border-t border-line/60 pt-lg">
              <button
                type="button"
                onClick={() => {
                  emit('shockwave', { x: -1, y: -1 })
                  setRunId((prev) => prev + 1)
                }}
                className="rounded-pill border border-accent-magenta/60 px-5 py-2.5 font-mono text-[11px] tracking-[0.16em] text-accent-magenta uppercase transition-colors duration-200 hover:bg-accent-magenta hover:text-ink"
              >
                Импульс в поле
              </button>
              <span className="font-mono text-[10px] tracking-[0.14em] text-fg-faint uppercase">
                {runId > 0 ? `отправлено раз: ${runId}` : 'работает в секции «Поле»'}
              </span>
            </div>

            <Diagnostics />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

/** Диагностика кадра. Живёт только пока окно открыто. */
function Diagnostics() {
  const [visible, setVisible] = useState(true)
  const fps = useRef<HTMLSpanElement>(null)
  const frames = useRef<HTMLSpanElement>(null)
  const vel = useRef<HTMLSpanElement>(null)
  const progress = useRef<HTMLSpanElement>(null)
  const entities = useRef<HTMLSpanElement>(null)
  const sincePaint = useRef(0)
  const frameCount = useRef(0)

  useRafLoop(
    (delta) => {
      frameCount.current += 1
      sincePaint.current += delta
      if (sincePaint.current < 200) return
      sincePaint.current = 0
      if (fps.current) fps.current.textContent = String(Math.round(telemetry.fps)).padStart(3, '0')
      if (frames.current) frames.current.textContent = String(frameCount.current)
      if (vel.current) vel.current.textContent = telemetry.velocity.toFixed(2)
      if (progress.current) progress.current.textContent = `${Math.round(telemetry.progress * 100)}%`
      if (entities.current) entities.current.textContent = String(telemetry.entities)
    },
    { enabled: visible },
  )

  const rows = [
    { label: 'fps', ref: fps, value: '000' },
    { label: 'кадров за сессию', ref: frames, value: '0' },
    { label: 'скорость скролла', ref: vel, value: '0.00' },
    { label: 'прогресс', ref: progress, value: '0%' },
    { label: 'объектов в поле', ref: entities, value: '0' },
  ]

  return (
    <div className="mt-lg border-t border-line/60 pt-lg">
      <button
        type="button"
        onClick={() => setVisible((prev) => !prev)}
        aria-expanded={visible}
        className="flex w-full items-center justify-between gap-4 font-mono text-[10px] tracking-[0.18em] text-fg-dim uppercase transition-colors duration-200 hover:text-fg"
      >
        <span>Диагностика кадра</span>
        <span aria-hidden="true">{visible ? '−' : '+'}</span>
      </button>

      {visible ? (
        <dl className="mt-md grid gap-2 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-3 border-b border-line/40 pb-1.5">
              <dt className="font-mono text-[9px] tracking-[0.14em] text-fg-faint uppercase">{row.label}</dt>
              <dd className="font-mono text-[11px] text-fg tabular-nums">
                <span ref={row.ref}>{row.value}</span>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  )
}

function Toggle({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string
  detail: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-4 border border-line/60 px-4 py-3 text-left transition-colors duration-200 hover:border-fg-faint"
    >
      <span>
        <span className="block font-mono text-[11px] tracking-[0.14em] text-fg uppercase">{label}</span>
        <span className="mt-1 block font-mono text-[10px] text-fg-faint">{detail}</span>
      </span>
      <span
        aria-hidden="true"
        className={`relative h-5 w-10 shrink-0 rounded-pill transition-colors duration-300 ${
          checked ? 'bg-accent-lime' : 'bg-line'
        }`}
      >
        <motion.span
          className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-ink"
          animate={{ x: checked ? 20 : 0 }}
          transition={{ duration: seconds(durations.fast), ease: easeOutExpo }}
        />
      </span>
    </button>
  )
}
