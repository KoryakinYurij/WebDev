import { useEffect, useRef, useState } from 'react'
import { telemetry } from '../lib/telemetry'
import { useRafLoop } from '../lib/use-raf-loop'

/**
 * Прибор удержания.
 *
 * Раньше это была консоль разработчика: fps, скорость, прогресс чтения. Теперь на странице
 * остались только три величины, которые относятся к практике, — удержание, число объектов
 * и ритм скролла. Диагностика кадра переехала в настройки.
 *
 * Значения пишутся в DOM через ref: setState раз в кадр превратил бы прибор в источник jank.
 *
 * Прибор показывается только пока секция «Поле» на экране.
 *
 * Раньше он висел постоянно, и это было ошибкой по двум причинам:
 *   1. все три величины считаются в «Поле», вне него прибор показывает нули — то есть врёт;
 *   2. будучи `position: fixed` в левом нижнем углу, он наезжал на контент героя:
 *      замерено 7574 px² наложения на вводный абзац при 1280×800 и 3623 px² при 1440×900
 *      (плюс перекрытая строка подсказки скролла). Смещать копирайт героя под прибор —
 *      лечить симптом: прибор и так относится ровно к одной секции.
 */
export function Hud() {
  const [inField, setInField] = useState(false)
  const coherence = useRef<HTMLSpanElement>(null)
  const entities = useRef<HTMLSpanElement>(null)
  const rhythm = useRef<HTMLSpanElement>(null)
  const coherenceBar = useRef<HTMLSpanElement>(null)
  const rhythmBar = useRef<HTMLSpanElement>(null)
  const sincePaint = useRef(0)

  /*
   * Наблюдаем саму секцию, а не её видимость на глаз: 8 % запаса сверху и снизу,
   * чтобы прибор появлялся чуть раньше входа и гас уже после выхода.
   */
  useEffect(() => {
    const field = document.getElementById('field')
    if (!field) return
    const observer = new IntersectionObserver(([entry]) => setInField(entry.isIntersecting), {
      rootMargin: '8% 0px',
    })
    observer.observe(field)
    return () => observer.disconnect()
  }, [])

  useRafLoop((delta) => {
    // Пишем ~8 раз в секунду: это цифры, которые человек читает, а не поток данных.
    sincePaint.current += delta
    if (sincePaint.current < 120) return
    sincePaint.current = 0

    if (coherence.current) coherence.current.textContent = String(Math.round(telemetry.coherence)).padStart(3, '0')
    if (entities.current) entities.current.textContent = String(telemetry.entities)
    if (rhythm.current) rhythm.current.textContent = Math.abs(telemetry.velocity).toFixed(2)
    if (coherenceBar.current)
      coherenceBar.current.style.transform = `scaleX(${Math.min(1, telemetry.coherence / 100)})`
    if (rhythmBar.current)
      rhythmBar.current.style.transform = `scaleX(${Math.min(1, Math.abs(telemetry.velocity) / 12)})`
    // Цикл не крутится вне «Поля»: enabled ниже — чтобы не считать нули 60 раз в секунду.
  }, { enabled: inField })

  return (
    <aside
      aria-label="Удержание внимания"
      data-state={inField ? 'active' : 'idle'}
      className={`pointer-events-none fixed bottom-5 left-[clamp(1rem,4vw,4.5rem)] z-[55] hidden w-56 border border-line/60 bg-ink/70 p-3 backdrop-blur-md transition-[opacity,transform,visibility] duration-300 ease-out lg:block ${
        inField ? 'translate-y-0 opacity-100' : 'invisible translate-y-2 opacity-0'
      }`}
    >
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <span className="font-mono text-[9px] tracking-[0.2em] text-fg-faint uppercase">удержание</span>
        <span className="font-mono text-[15px] leading-none text-accent-lime tabular-nums">
          <span ref={coherence}>000</span>
          <span className="text-[10px] text-fg-faint">%</span>
        </span>
      </div>

      <span className="block h-[3px] w-full bg-line/60" aria-hidden="true">
        <span ref={coherenceBar} className="block h-full origin-left scale-x-0 bg-accent-lime" />
      </span>

      <dl className="mt-3 space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="font-mono text-[9px] tracking-[0.16em] text-fg-faint uppercase">объектов в поле</dt>
          <dd className="font-mono text-[11px] text-fg tabular-nums">
            <span ref={entities}>0</span>
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="font-mono text-[9px] tracking-[0.16em] text-fg-faint uppercase">ритм скролла</dt>
          <dd className="font-mono text-[11px] text-fg tabular-nums">
            <span ref={rhythm}>0.00</span>
          </dd>
        </div>
      </dl>

      <span className="mt-2 block h-[3px] w-full bg-line/60" aria-hidden="true">
        <span ref={rhythmBar} className="block h-full origin-left scale-x-0 bg-accent-cyan" />
      </span>

      <p className="mt-2.5 font-mono text-[9px] leading-relaxed text-fg-faint uppercase">
        значения считаются в секции «Поле»
      </p>
    </aside>
  )
}
