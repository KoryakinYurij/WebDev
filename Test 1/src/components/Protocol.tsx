import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { gsap, ScrollTrigger } from '../lib/gsap'
import { useMotionPrefs } from '../lib/motion-config'
import { useRafLoop } from '../lib/use-raf-loop'
import { getLenis } from '../lib/smooth-scroll'
import { Reveal, ScrambleText } from './ui/Reveal'

const PHASES = [
  {
    index: '01',
    name: 'Сбор',
    duration: '0 — 8 мин',
    body: 'Сужаем поле до одного объекта. Всё остальное объявляется шумом и не заслуживает реакции.',
    metric: 'объектов удержания',
    metricValue: '1',
  },
  {
    index: '02',
    name: 'Давление',
    duration: '8 — 22 мин',
    body: 'Держим, пока не станет неуютно. Именно в этом интервале тренируется возврат внимания, а не в комфорте.',
    metric: 'возвратов за минуту',
    metricValue: '9—14',
  },
  {
    index: '03',
    name: 'Расширение',
    duration: '22 — 40 мин',
    body: 'Возвращаем весь шум обратно — но уже без потери фокуса. Это и есть рабочий результат практики.',
    metric: 'потеря фокуса',
    metricValue: 'низкая',
  },
]

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
            onUpdate: ({ progress }) => setActive(Math.round(progress * (PHASES.length - 1))),
          },
        })

        // Анимируем только детей pinned-контейнера — сам .pin остаётся неподвижным.
        tl.fromTo(rail, { scaleY: 0 }, { scaleY: 1, ease: 'none', duration: step * PHASES.length }, 0)

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
  }, [])

  useRafLoop(
    () => {
      const node = stage.current
      if (!node) return
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
        className="pin relative flex min-h-[100svh] flex-col justify-center overflow-clip py-xl"
        onPointerMove={reduced || !stacked ? undefined : onPointerMove}
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

        <div className="u-container relative">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <ScrambleText text="002 — Протокол" className="kicker" />
            <p className="font-mono text-[10px] tracking-[0.18em] text-fg-faint uppercase">
              одна сессия · три фазы · 40 минут
            </p>
          </div>

          <h2
            id="protocol-title"
            className="phase-intro mt-md max-w-[26ch] text-title leading-[1.02] font-medium tracking-[-0.02em]"
          >
            Три фазы одной сессии. Каждая забирает больше, чем предыдущая.
          </h2>

          <p className="phase-intro mt-md max-w-[54ch] text-body text-fg-dim">
            Фаза — не этап дыхания и не отрезок таймера. Это участок, на котором меняется условие задачи:
            сначала сужаем поле, потом держим под нагрузкой, потом возвращаем шум обратно.
          </p>

          <div className="mt-xl grid gap-lg md:grid-cols-[minmax(0,3fr)_minmax(0,7fr)] md:gap-xl">
            {/* Вертикальный рельс: прогресс всей сессии. На desktop чипы ещё и навигация по фазам. */}
            {stacked ? (
              <div className="relative hidden md:block">
                <div className="absolute top-0 left-0 h-full w-px bg-line/70" aria-hidden="true" />
                <div className="rail-fill absolute top-0 left-0 h-full w-px origin-top bg-accent-lime" aria-hidden="true" />
                <ol className="flex h-full flex-col justify-between py-1 pl-6">
                  {PHASES.map((phase, index) => (
                    <li key={phase.index} className="phase-chip flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => goToPhase(index)}
                        aria-current={active === index ? 'true' : undefined}
                        className="flex flex-col items-start gap-1 text-left"
                      >
                        <span className={`font-mono text-[11px] ${active === index ? 'text-accent-lime' : 'text-fg-faint'}`}>
                          {phase.index}
                        </span>
                        <span className="font-mono text-[10px] tracking-[0.18em] text-fg-dim uppercase">
                          {phase.name}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <div aria-hidden="true" className="hidden md:block" />
            )}

            {/* Стек фаз. Наложение — только в режиме пина; иначе обычный вертикальный поток. */}
            <div className={stacked ? 'relative md:h-[48vh] md:min-h-[23rem]' : 'relative flex flex-col gap-xl'}>
              {PHASES.map((phase) => (
                <article
                  key={phase.index}
                  className={
                    stacked
                      ? 'phase absolute inset-0'
                      : 'phase relative border-t border-line/60 pt-md'
                  }
                >
                  <div className="phase-line flex items-baseline gap-4" data-depth="9">
                    <span className="font-mono text-[clamp(2rem,6vw,4.5rem)] leading-none font-medium text-fg-faint tabular-nums">
                      {phase.index}
                    </span>
                    <div>
                      <h3 className="text-heading leading-none font-medium uppercase">{phase.name}</h3>
                      <p className="mt-1 font-mono text-[10px] tracking-[0.18em] text-fg-faint uppercase">
                        {phase.duration}
                      </p>
                    </div>
                  </div>

                  <p className="phase-line mt-md max-w-[52ch] text-body text-fg-dim" data-depth="3">
                    {phase.body}
                  </p>

                  <dl
                    className="phase-line mt-lg inline-flex flex-wrap items-baseline gap-x-6 gap-y-2 border border-line/60 px-4 py-3"
                    data-depth="6"
                  >
                    <dt className="font-mono text-[10px] tracking-[0.18em] text-fg-faint uppercase">{phase.metric}</dt>
                    <dd className="font-mono text-[13px] text-accent-lime">{phase.metricValue}</dd>
                  </dl>
                </article>
              ))}
            </div>
          </div>

          {stacked ? (
            <Reveal delay={0.2} distance={14} className="mt-lg hidden md:block">
              <p className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">
                выбери фазу на рельсе, чтобы перейти к ней
              </p>
            </Reveal>
          ) : null}
        </div>
      </div>
    </section>
  )
}
