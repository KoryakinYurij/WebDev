import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { gsap } from '../lib/gsap'
import { useMotionPrefs } from '../lib/motion-config'
import { useRafLoop } from '../lib/use-raf-loop'
import type { HeroField } from '../three/hero-field'
import { numbers } from '../generated/tokens'
import { easeOutExpo, seconds, durations } from '../lib/bezier'
import { MagneticButton } from './ui/MagneticButton'
import { RevealWords, ScrambleText } from './ui/Reveal'
import { scrollToSection } from '../lib/smooth-scroll'

const META = [
  { label: 'протоколов', value: '12' },
  { label: 'сессия', value: '40 мин' },
  { label: 'уровень', value: '04' },
]

export function Hero() {
  const sectionRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fieldRef = useRef<HeroField | null>(null)
  const [failed, setFailed] = useState(false)
  const { reduced, quality, read } = useMotionPrefs()

  /* --- WebGL-сцена: создаём один раз на качество, живёт вне React-рендера --- */
  useEffect(() => {
    if (reduced) {
      fieldRef.current?.dispose()
      fieldRef.current = null
      return
    }

    let cancelled = false
    let observer: ResizeObserver | undefined

    const onPointer = (event: PointerEvent) => {
      fieldRef.current?.setPointer(
        (event.clientX / window.innerWidth) * 2 - 1,
        -((event.clientY / window.innerHeight) * 2 - 1),
      )
    }

    const init = async () => {
      const canvas = canvasRef.current
      const section = sectionRef.current
      if (!canvas || !section) return

      /* Three.js (~130 КБ gzip) грузится динамически и стартует уже после первой отрисовки:
         шейдер не должен стоять на пути у LCP. */
      const { createHeroField } = await import('../three/hero-field')
      if (cancelled) return

      let field: HeroField
      try {
        field = createHeroField(
          canvas,
          quality === 'high' ? numbers.motion.heroPoints : numbers.motion.heroPointsLow,
          // На облегчённом профиле (мобильные, слабые GPU) снижаем точность шейдера и число точек.
          { precision: quality === 'high' ? 'highp' : 'mediump' },
        )
      } catch {
        // Нет WebGL или контекст не создался: уходим на градиентный фолбэк,
        // страница обязана остаться читаемой.
        setFailed(true)
        return
      }

      fieldRef.current = field

      const resize = () => {
        const rect = section.getBoundingClientRect()
        field.resize(rect.width, rect.height)
      }
      resize()

      observer = new ResizeObserver(resize)
      observer.observe(section)
      window.addEventListener('pointermove', onPointer, { passive: true })
    }

    void init()

    return () => {
      cancelled = true
      observer?.disconnect()
      window.removeEventListener('pointermove', onPointer)
      fieldRef.current?.dispose()
      fieldRef.current = null
    }
  }, [quality, reduced])

  /* Интенсивность читаем в кадре: слайдер в пульте меняет картинку без пересборки сцены. */
  useRafLoop(
    (delta, elapsed) => {
      const field = fieldRef.current
      if (!field) return
      field.setIntensity(read())
      field.render(delta, elapsed)
    },
    { target: sectionRef, enabled: !reduced && !failed },
  )

  /* --- Скролл-выход героя: scrub по копирайту + прогресс в шейдер --- */
  useLayoutEffect(() => {
    if (reduced) return
    const ctx = gsap.context((self) => {
      const copy = self.selector!('.hero-copy') as HTMLElement[]
      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top top',
          end: 'bottom top',
          scrub: 0.5,
          onUpdate: ({ progress }) => fieldRef.current?.setScroll(progress),
        },
      })
      // Уводим только копирайт: канвас живёт фоном и не «улетает» вместе с текстом.
      timeline.to(copy, { yPercent: -14, autoAlpha: 0, duration: 1, ease: 'none' }, 0)
    }, sectionRef)
    return () => ctx.revert()
  }, [reduced])

  return (
    <section
      ref={sectionRef}
      id="hero"
      aria-labelledby="hero-title"
      className="relative isolate min-h-[100svh] overflow-clip"
    >
      {reduced || failed ? (
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 90% at 20% 0%, color-mix(in srgb, var(--color-accent-indigo) 42%, transparent), transparent 60%), radial-gradient(90% 70% at 85% 30%, color-mix(in srgb, var(--color-accent-magenta) 32%, transparent), transparent 65%), var(--color-ink)',
          }}
        />
      ) : (
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      )}

      {/*
       * Два слоя скрима: вертикальный винье́т и боковой градиент под текстовый блок.
       * Процедурный фон непредсказуем по яркости, поэтому контраст текста обязан
       * обеспечиваться вёрсткой, а не везением — требование WCAG 1.4.3.
       */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--color-ink) 62%, transparent) 0%, transparent 30%, color-mix(in srgb, var(--color-ink) 72%, transparent) 100%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(96deg, color-mix(in srgb, var(--color-ink) 94%, transparent) 0%, color-mix(in srgb, var(--color-ink) 66%, transparent) 36%, transparent 70%)',
        }}
      />

      <div className="hero-copy relative u-container flex min-h-[100svh] flex-col justify-between pt-32 pb-lg">
        <div className="flex flex-wrap items-start justify-between gap-md">
          <ScrambleText text="Mindfield — практика внимания" className="kicker" />
          <dl className="flex gap-lg">
            {META.map((item) => (
              <div key={item.label}>
                <dt className="font-mono text-[10px] tracking-[0.18em] text-fg-faint uppercase">{item.label}</dt>
                <dd className="font-mono text-[13px] text-fg">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <h1
          id="hero-title"
          className="text-mega leading-[0.86] font-medium tracking-[-0.045em] uppercase"
        >
          <RevealWords text="Тишина" />
          <span className="block text-display normal-case italic text-accent-lime">
            <RevealWords text="не бывает" />
          </span>
          <RevealWords text="бесплатной" />
        </h1>

        <div className="flex flex-wrap items-end justify-between gap-lg">
          <motion.p
            className="max-w-[46ch] text-body text-fg-dim"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: seconds(durations.slow), delay: 0.5, ease: easeOutExpo }}
          >
            Интенсивная программа из 12 протоколов. Без таймеров, без обещаний покоя — только удержание внимания под
            нагрузкой и цифра, которая показывает, как это получается.
          </motion.p>

          <motion.div
            className="flex flex-wrap items-center gap-3"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: seconds(durations.slow), delay: 0.62, ease: easeOutExpo }}
          >
            <MagneticButton href="#deck" strength={0.36}>
              Включить пульт
            </MagneticButton>
            <MagneticButton variant="outline" onClick={() => scrollToSection('protocol')} strength={0.28}>
              Смотреть протокол
            </MagneticButton>
          </motion.div>
        </div>

        <div className="flex items-center justify-between gap-md border-t border-line/50 pt-md">
          <span className="font-mono text-[10px] tracking-[0.2em] text-fg-faint uppercase">
            scroll · курсор двигает поле · «Импульс» в секции 005
          </span>
          <span className="relative block h-10 w-px overflow-hidden bg-line/60" aria-hidden="true">
            <motion.span
              className="absolute inset-x-0 top-0 block h-4 bg-accent-lime"
              animate={reduced ? undefined : { y: [-16, 40] }}
              transition={{ duration: 1.9, repeat: Infinity, ease: [0.4, 0, 0.2, 1] }}
            />
          </span>
        </div>
      </div>
    </section>
  )
}
