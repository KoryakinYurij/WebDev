import { useRef } from 'react'
import { telemetry } from '../lib/telemetry'
import { useRafLoop } from '../lib/use-raf-loop'
import { useMotionPrefs } from '../lib/motion-config'

type Props = {
  items: string[]
  /** 1 — вправо, -1 — влево */
  direction?: 1 | -1
  /** Базовая скорость в px/s: маркиза живёт, даже когда страница стоит */
  baseSpeed?: number
  className?: string
  tone?: 'solid' | 'outline'
  separator?: string
}

/**
 * Бесконечная лента, скорость и наклон которой зависят от скорости скролла.
 *
 * Двигаем только `translate3d` + `skewY` — предкомпонентный safe-набор.
 * Полоса дублируется ровно дважды, поэтому сдвиг зацикливается по половине scrollWidth,
 * без клонирования в бесконечность и без пересчёта на каждый кадр.
 *
 * `will-change: transform` здесь постоянный — в отличие от разовых reveal,
 * этот элемент анимируется непрерывно, и промоушен слоя оправдан.
 */
export function VelocityBand({
  items,
  direction = 1,
  baseSpeed = 42,
  className = '',
  tone = 'outline',
  separator = '/',
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const offset = useRef(0)
  const { read, reduced } = useMotionPrefs()

  useRafLoop(
    (delta) => {
      const track = trackRef.current
      const intensity = read()
      if (!track || intensity === 0) return

      /*
       * Импульс от скролла — деликатный.
       * Первая версия давала до +650 px/s к базовым 42 px/s (пятнадцатикратный разгон):
       * лента выглядела не «отзывчивой», а слетевшей с катушек.
       *
       * Нормировка идёт по замеренному пику Lenis (~12 при быстром колесе):
       * отсюда делитель 12 — разгон выходит максимум двойным.
       */
      const boost = (Math.min(Math.abs(telemetry.velocity), 12) / 12) * 40 * intensity
      const speed = (baseSpeed + boost) * direction
      offset.current -= (speed * delta) / 1000

      const half = track.scrollWidth / 2
      if (half <= 0) return
      if (offset.current <= -half) offset.current += half
      if (offset.current > 0) offset.current -= half

      /*
       * Наклон — не больше 1.1°, и под него оставлен вертикальный запас в контейнере.
       * При 7° полоса шириной 1440 px уезжает по вертикали на ±88 px, а контейнер
       * обрезан по overflow-clip: в углах открывались треугольные дыры до фона.
       *
       * Коэффициент 0.09 подобран так, чтобы обычное колесо давало 0.3—0.6°,
       * а не упиралось в потолок на первом же рывке: наклон обязан читаться
       * как отклик на скорость, а не как постоянный наклон полосы.
       */
      const skew = Math.max(-1.1, Math.min(1.1, -telemetry.velocity * 0.09 * intensity))
      track.style.transform = `translate3d(${offset.current.toFixed(2)}px,0,0) skewY(${skew.toFixed(2)}deg)`
    },
    { target: rootRef, enabled: !reduced },
  )

  const solid = tone === 'solid'

  return (
    /* py-4 — запас по вертикали под наклон: при 1.1° полоса шириной 1440 px уходит
       на ±14 px, и без запаса overflow-clip срезал бы её углы. */
    <div
      ref={rootRef}
      className={`edge-fade relative overflow-clip border-y border-line/60 py-4 ${solid ? 'bg-accent-lime text-ink' : 'text-fg'} ${className}`}
      aria-hidden="true"
    >
      <div
        ref={trackRef}
        className="flex w-max items-center gap-6 py-1 whitespace-nowrap will-change-transform"
      >
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center gap-6">
            {items.map((item, index) => (
              <span key={`${copy}-${item}-${index}`} className="flex items-center gap-6">
                <span className="font-mono text-[clamp(1.1rem,2.6vw,2.4rem)] tracking-[0.06em] uppercase">
                  {item}
                </span>
                <span className={`font-mono text-sm ${solid ? 'text-ink/50' : 'text-accent-lime'}`}>{separator}</span>
              </span>
            ))}
          </div>
        ))}
      </div>

      {/* Лента декоративна, поэтому текст-эквивалент отдаём скринридеру отдельно. */}
      <span className="sr-only">{items.join(', ')}</span>
    </div>
  )
}
