import { useLayoutEffect, useRef } from 'react'
import { gsap } from '../lib/gsap'
import { useMotionPrefs } from '../lib/motion-config'
import { numbers } from '../generated/tokens'
import { ScrambleText, Reveal } from './ui/Reveal'

/**
 * Глубина — это разница скоростей, а не 3D.
 *
 * Слои двигаются с разной долей скорости скролла (значения — токены `motion.parallax-*`):
 * фон 28 %, середина 50 %, передний план 72 %. Амплитуда одинаковая для всех,
 * поэтому разница читается именно как глубина, а не как разная длина проезда.
 */
const AMPLITUDE = 34

const LAYERS = [
  { selector: '.depth-bg', ratio: numbers.motion.parallaxBg, name: 'фон' },
  { selector: '.depth-mid', ratio: numbers.motion.parallaxMid, name: 'середина' },
  { selector: '.depth-fg', ratio: numbers.motion.parallaxFg, name: 'передний план' },
]

export function Depth() {
  const root = useRef<HTMLElement>(null)
  const { reduced } = useMotionPrefs()

  useLayoutEffect(() => {
    if (reduced) return

    const ctx = gsap.context((self) => {
      const stage = self.selector!('.depth-stage')[0]
      if (!stage) return

      // Триггеры создаются сверху вниз в DOM-порядке.
      LAYERS.forEach(({ selector, ratio }) => {
        gsap.fromTo(
          selector,
          { yPercent: -ratio * AMPLITUDE },
          {
            yPercent: ratio * AMPLITUDE,
            ease: 'none',
            scrollTrigger: { trigger: stage, start: 'top bottom', end: 'bottom top', scrub: 0.8 },
          },
        )
      })

      // Ирис: единственный элемент с вращением — служит точкой внимания в середине секции.
      gsap.fromTo(
        '.depth-iris',
        { rotate: -24, scale: 0.78 },
        {
          rotate: 24,
          scale: 1.06,
          ease: 'none',
          scrollTrigger: { trigger: stage, start: 'top bottom', end: 'bottom top', scrub: 1.1 },
        },
      )
    }, root)

    return () => ctx.revert()
  }, [reduced])

  return (
    <section ref={root} id="depth" aria-labelledby="depth-title" className="relative border-t border-line/60">
      <div className="depth-stage relative min-h-[150svh] overflow-clip">
        {/* Слой 1 — фон */}
        <div className="depth-bg absolute inset-[-12%] grid-lines opacity-40" aria-hidden="true" />

        {/* Слой 2 — середина: ирис. Уводим вправо, чтобы он не спорил с заголовком слева. */}
        <div className="depth-mid absolute inset-0 flex items-center justify-end pr-[4vw]" aria-hidden="true">
          <svg viewBox="0 0 400 400" className="depth-iris h-[54vmin] w-[54vmin] opacity-90 will-change-transform">
            <defs>
              <linearGradient id="iris-stroke" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="var(--color-accent-cyan)" stopOpacity="0.9" />
                <stop offset="55%" stopColor="var(--color-accent-indigo)" stopOpacity="0.55" />
                <stop offset="100%" stopColor="var(--color-accent-magenta)" stopOpacity="0.85" />
              </linearGradient>
            </defs>
            <circle cx="200" cy="200" r="186" fill="none" stroke="url(#iris-stroke)" strokeWidth="1" />
            <circle cx="200" cy="200" r="140" fill="none" stroke="var(--color-line)" strokeWidth="1" />
            <circle cx="200" cy="200" r="94" fill="none" stroke="var(--color-line)" strokeWidth="1" />
            <circle cx="200" cy="200" r="52" fill="none" stroke="var(--color-accent-lime)" strokeWidth="1.5" />
            {Array.from({ length: 36 }).map((_, index) => {
              const angle = (index / 36) * Math.PI * 2
              const inner = 146
              const outer = index % 3 === 0 ? 178 : 160
              return (
                <line
                  key={index}
                  x1={200 + Math.cos(angle) * inner}
                  y1={200 + Math.sin(angle) * inner}
                  x2={200 + Math.cos(angle) * outer}
                  y2={200 + Math.sin(angle) * outer}
                  stroke={index % 3 === 0 ? 'var(--color-accent-lime)' : 'var(--color-line)'}
                  strokeWidth="1"
                />
              )
            })}
            <circle cx="200" cy="200" r="14" fill="var(--color-accent-lime)" opacity="0.85" />
          </svg>
        </div>

        {/* Слой 4 — фиксированный оверлей (100 % скорости скролла) + слой 3 на переднем плане.
            Оверлей sticky, а не absolute: иначе он уезжает за экран на середине сцены
            и легенда слоёв видна только на входе в секцию. */}
        <div className="relative flex min-h-[150svh] flex-col">
          <div
            className="pointer-events-none sticky top-[3.75rem] z-20 border-b border-line/50 bg-ink/85 backdrop-blur-md"
            aria-hidden="true"
          >
            <div className="u-container flex flex-wrap items-baseline justify-between gap-4 py-3">
              <ul className="flex flex-wrap gap-x-6 gap-y-2">
                {LAYERS.map((layer) => (
                  <li key={layer.name} className="flex items-baseline gap-2">
                    <span className="font-mono text-[10px] tracking-[0.18em] text-fg-dim uppercase">{layer.name}</span>
                    <span className="font-mono text-[11px] text-accent-lime tabular-nums">
                      {Math.round(layer.ratio * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
              <span className="font-mono text-[10px] tracking-[0.18em] text-fg-faint uppercase">
                чем ближе слой, тем быстрее он идёт
              </span>
            </div>
          </div>

          {/* py уводит контент от липкой легенды: без него заголовок заезжает под планку. */}
          <div className="depth-fg flex flex-1 items-center py-[14vh] will-change-transform">
            <div className="u-container">
              <ScrambleText text="004 — Глубина" className="kicker" />
              <h2
                id="depth-title"
                className="mt-md max-w-[16ch] text-display leading-[0.92] font-medium tracking-[-0.035em] uppercase"
              >
                Глубина — это разница скоростей
              </h2>
              <Reveal delay={0.12} className="mt-lg max-w-[42ch] text-body text-fg-dim">
                <p>
                  Слоёв ровно три: шум на дальнем плане, задача в середине, объект удержания — вблизи. Разница
                  скоростей и есть глубина внимания: дальнее почти не двигается, близкое требует реакции.
                </p>
              </Reveal>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
