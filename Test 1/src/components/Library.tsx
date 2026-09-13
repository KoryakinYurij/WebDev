import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { gsap, ScrollTrigger } from '../lib/gsap'
import { useMotionPrefs } from '../lib/motion-config'
import { ScrambleText } from './ui/Reveal'
import { getLenis } from '../lib/smooth-scroll'

const TECHNIQUES = [
  {
    index: '01',
    name: 'Якорь',
    minutes: 12,
    load: 2,
    body: 'Один объект — ощущение опоры. Возврат отмечается вслух: повторение, а не провал.',
    colour: 'lime',
  },
  {
    index: '02',
    name: 'Скан',
    minutes: 18,
    load: 3,
    body: 'Внимание идёт по фиксированному маршруту. Никаких оценок — отметка и переход дальше.',
    colour: 'cyan',
  },
  {
    index: '03',
    name: 'Открытое поле',
    minutes: 25,
    load: 4,
    body: 'Объект один — всё, что появляется. Удержание без выбора: предпочтение уже потеря.',
    colour: 'indigo',
  },
  {
    index: '04',
    name: 'Метки',
    minutes: 10,
    load: 2,
    body: 'Каждой мысли — ярлык и отпускание. Скорость ярлыков и есть показатель навыка.',
    colour: 'magenta',
  },
  {
    index: '05',
    name: 'Протокол шума',
    minutes: 30,
    load: 5,
    body: 'Намеренно включаем отвлечения и работаем внутри них. Самая тяжёлая нагрузка.',
    colour: 'lime',
  },
  {
    index: '06',
    name: 'Метта',
    minutes: 20,
    load: 3,
    body: 'Направленное намерение как объект. Та же дисциплина, но без «пустоты».',
    colour: 'cyan',
  },
] as const

type Technique = (typeof TECHNIQUES)[number]

/*
 * Блок, который нельзя прокрутить, — мёртвый блок, и неважно почему.
 *
 * Раньше режим зависел от `(pointer: fine)`: там, где браузер отвечает `pointer: none`
 * или устройство тач-ориентированное, включался нативный горизонтальный скролл —
 * а его колесо мыши не крутит вообще. Со стороны это выглядело как мёртвая секция.
 *
 * Теперь: карточки всегда управляются стрелками и клавиатурой, в нативном режиме
 * ещё и колесом, а пин включается только там, где он уместен (широкий экран без тач-ввода).
 */
const PIN_QUERY = '(min-width: 1024px)'
const PIN_QUERY_MOTION = `${PIN_QUERY} and (prefers-reduced-motion: no-preference)`

const isTouchPreferred = () => window.matchMedia('(hover: none)').matches || ScrollTrigger.isTouch === 1

const BG_ACCENT: Record<Technique['colour'], string> = {
  lime: 'bg-accent-lime',
  cyan: 'bg-accent-cyan',
  indigo: 'bg-accent-indigo',
  magenta: 'bg-accent-magenta',
}

const CSS_ACCENT: Record<Technique['colour'], string> = {
  lime: 'var(--color-accent-lime)',
  cyan: 'var(--color-accent-cyan)',
  indigo: 'var(--color-accent-indigo)',
  magenta: 'var(--color-accent-magenta)',
}

export function Library() {
  const root = useRef<HTMLElement>(null)
  const track = useRef<HTMLUListElement>(null)
  const pinnedTrigger = useRef<ScrollTrigger | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const { reduced } = useMotionPrefs()

  /* Синхронная инициализация: разметка `.h-wrap` должна существовать до useLayoutEffect,
     иначе ScrollTrigger не находит триггер и пин молча не создаётся. */
  const [pinned, setPinned] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(PIN_QUERY).matches && !isTouchPreferred(),
  )

  const refresh = useCallback(() => {
    requestAnimationFrame(() => ScrollTrigger.refresh())
  }, [])

  useEffect(() => {
    const query = window.matchMedia(PIN_QUERY)
    const sync = () => {
      setPinned((prev) => {
        const next = query.matches && !isTouchPreferred() && !reduced
        if (prev !== next) refresh()
        return next
      })
    }
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [reduced, refresh])

  useLayoutEffect(() => {
    if (reduced) return

    const media = gsap.matchMedia()

    media.add(PIN_QUERY_MOTION, () => {
      if (isTouchPreferred()) return

      const ctx = gsap.context(() => {
        const el = track.current
        if (!el) return

        // Дистанцию считаем функцией: invalidateOnRefresh перезамерит её на ресайзе.
        const distance = () => Math.max(0, el.scrollWidth - window.innerWidth + 64)

        /* GSAP не описывает `scrollTrigger` в типе Tween, хотя в рантайме ссылка есть.
           Приводим явно — в отличие от поиска по ScrollTrigger.getAll(), это не может
           случайно взять чужой триггер. */
        const tween = gsap.to(el, {
          x: () => -distance(),
          ease: 'none',
          scrollTrigger: {
            trigger: '.h-wrap',
            start: 'top top',
            end: () => `+=${distance()}`,
            pin: true,
            scrub: 1,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: ({ progress }) => {
              const index = Math.round(progress * (TECHNIQUES.length - 1))
              setActiveIndex((prev) => (prev === index ? prev : index))
            },
          },
        })

        pinnedTrigger.current = (tween as gsap.core.Tween & { scrollTrigger?: ScrollTrigger }).scrollTrigger ?? null
      }, root)

      return () => {
        pinnedTrigger.current = null
        ctx.revert()
      }
    })

    return () => media.revert()
  }, [reduced])

  /* Нативный режим: активную карточку определяет сам scroll-snap. */
  useEffect(() => {
    if (pinned) return
    const el = track.current
    if (!el) return

    const onScroll = () => {
      const card = el.querySelector('.tech-card') as HTMLElement | null
      const width = card ? card.offsetWidth + 24 : 1
      const index = Math.min(TECHNIQUES.length - 1, Math.max(0, Math.round(el.scrollLeft / width)))
      setActiveIndex((prev) => (prev === index ? prev : index))
    }

    /* Колесо мыши по умолчанию не крутит горизонтальный контейнер: без этого
       перевода блок снова становится неуправляемым для мыши. */
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      el.scrollLeft += event.deltaY
      event.preventDefault()
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('wheel', onWheel)
    }
  }, [pinned])

  /** Переход к карточке — работает в обоих режимах и для любых источников ввода. */
  const goTo = useCallback(
    (index: number) => {
      const next = Math.min(TECHNIQUES.length - 1, Math.max(0, index))
      setActiveIndex(next)

      const el = track.current
      if (!el) return

      const trigger = pinnedTrigger.current
      if (pinned && trigger) {
        const target = trigger.start + (next / (TECHNIQUES.length - 1)) * (trigger.end - trigger.start)
        const lenis = getLenis()
        if (lenis) lenis.scrollTo(target, { duration: 0.8 })
        else window.scrollTo({ top: target, behavior: 'smooth' })
        return
      }

      const card = el.querySelectorAll('.tech-card')[next] as HTMLElement | undefined
      if (card) el.scrollTo({ left: card.offsetLeft - el.offsetLeft, behavior: 'smooth' })
      else {
        const cardWidth = (el.querySelector('.tech-card') as HTMLElement | null)?.offsetWidth ?? 300
        el.scrollTo({ left: next * (cardWidth + 24), behavior: 'smooth' })
      }
    },
    [pinned],
  )

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      goTo(activeIndex + 1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      goTo(activeIndex - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      goTo(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      goTo(TECHNIQUES.length - 1)
    }
  }

  const progress = activeIndex / (TECHNIQUES.length - 1)

  return (
    <section ref={root} id="library" aria-labelledby="library-title" className="relative border-t border-line/60">
      <div className={pinned ? 'h-wrap flex min-h-[100svh] flex-col justify-center overflow-clip pt-28 pb-xl' : ''}>
        <div className="u-container">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <ScrambleText text="003 — Техники" className="kicker" />
              <h2
                id="library-title"
                className="mt-md max-w-[24ch] text-title leading-[1.02] font-medium tracking-[-0.02em]"
              >
                Шесть протоколов с разной нагрузкой на удержание.
              </h2>
            </div>

            {/* Стрелки — и навигация, и подсказка, что блок продолжается вбок. */}
            <div className="flex items-center gap-2">
              <ArrowButton label="Предыдущая техника" disabled={activeIndex === 0} onClick={() => goTo(activeIndex - 1)} direction="left" />
              <ArrowButton
                label="Следующая техника"
                disabled={activeIndex === TECHNIQUES.length - 1}
                onClick={() => goTo(activeIndex + 1)}
                direction="right"
              />
            </div>
          </div>

          <div className="mt-lg flex items-center gap-4">
            <span className="font-mono text-[11px] text-fg tabular-nums" aria-hidden="true">
              {String(activeIndex + 1).padStart(2, '0')}
              <span className="text-fg-faint"> / {String(TECHNIQUES.length).padStart(2, '0')}</span>
            </span>
            <span className="relative h-px flex-1 bg-line/70" aria-hidden="true">
              <span
                className="absolute inset-y-0 left-0 w-full origin-left bg-accent-lime transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{ transform: `scaleX(${Math.max(0.06, progress)})` }}
              />
            </span>
          </div>

          <p className="sr-only" aria-live="polite">
            {TECHNIQUES[activeIndex]?.name}, техника {activeIndex + 1} из {TECHNIQUES.length}
          </p>
        </div>

        <ul
          ref={track}
          onKeyDown={onKeyDown}
          tabIndex={0}
          className={`h-track mt-lg flex gap-md ${
            pinned ? 'w-max flex-nowrap will-change-transform' : 'snap-x-track u-container pb-2'
          }`}
          aria-label="Протоколы практики. Управление стрелками влево и вправо."
        >
          {TECHNIQUES.map((item, index) => (
            <TechCard key={item.index} item={item} active={index === activeIndex} pinned={pinned} />
          ))}
        </ul>
      </div>
    </section>
  )
}

function ArrowButton({
  label,
  disabled,
  onClick,
  direction,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  direction: 'left' | 'right'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      data-cursor={direction === 'left' ? 'назад' : 'вперёд'}
      className="grid h-10 w-10 place-items-center rounded-full border border-line text-fg-dim transition-colors duration-200 hover:border-accent-lime hover:text-accent-lime disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-line disabled:hover:text-fg-dim"
    >
      <span aria-hidden="true" className="text-[15px] leading-none">
        {direction === 'left' ? '←' : '→'}
      </span>
    </button>
  )
}

function TechCard({ item, active, pinned }: { item: Technique; active: boolean; pinned: boolean }) {
  const ref = useRef<HTMLLIElement>(null)

  const handleMove = (event: React.PointerEvent<HTMLLIElement>) => {
    const node = ref.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    // Прожектор под курсором: две CSS-переменные и ни одного ре-рендера.
    node.style.setProperty('--mx', `${((event.clientX - rect.left) / rect.width) * 100}%`)
    node.style.setProperty('--my', `${((event.clientY - rect.top) / rect.height) * 100}%`)
  }

  const accent = BG_ACCENT[item.colour]

  return (
    <li
      ref={ref}
      onPointerMove={handleMove}
      data-cursor={`${item.name} · ${item.minutes} мин`}
      className={`tech-card group relative flex shrink-0 flex-col justify-between overflow-hidden border bg-surface/50 p-lg transition-colors duration-300 ${
        pinned ? 'h-[52vh] w-[min(80vw,28rem)]' : 'snap-x-item min-h-[19rem]'
      } ${active ? 'border-accent-lime/60' : 'border-line/60'}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(220px circle at var(--mx, 50%) var(--my, 50%), color-mix(in srgb, ${CSS_ACCENT[item.colour]} 20%, transparent), transparent 70%)`,
        }}
      />

      <div className="relative flex items-start justify-between gap-4">
        <span className="font-mono text-[clamp(2rem,4vw,3.2rem)] leading-none font-medium text-fg-faint tabular-nums">
          {item.index}
        </span>
        <span className="flex flex-col items-end gap-1">
          <span className="font-mono text-[10px] tracking-[0.18em] text-fg-faint uppercase">минут</span>
          <span className="font-mono text-[15px] text-fg tabular-nums">{item.minutes}</span>
        </span>
      </div>

      <div className="relative mt-lg">
        <h3 className="text-heading leading-none font-medium uppercase">{item.name}</h3>
        <p className="mt-sm max-w-[36ch] text-body text-fg-dim">{item.body}</p>
      </div>

      <div className="relative mt-lg">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-[0.18em] text-fg-faint uppercase">нагрузка</span>
          <span className="font-mono text-[10px] text-fg-dim tabular-nums">{item.load} / 5</span>
        </div>
        <div className="flex gap-1.5" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((level) => (
            <span
              key={level}
              className={`h-[3px] flex-1 transition-transform duration-300 ${
                level <= item.load ? accent : 'bg-line'
              } ${level <= item.load && active ? 'scale-y-[2]' : ''}`}
            />
          ))}
        </div>
        <span className="sr-only">Уровень нагрузки {item.load} из 5</span>
      </div>

      <span className={`absolute inset-x-0 bottom-0 h-px ${active || !pinned ? accent : 'bg-line/60'}`} aria-hidden="true" />
    </li>
  )
}
