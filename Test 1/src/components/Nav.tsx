import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { getLenis, scrollToSection } from '../lib/smooth-scroll'
import { useMotionPrefs } from '../lib/motion-config'
import { on } from '../lib/bus'
import { easeOutExpo, revealSeconds } from '../lib/bezier'
import { SettingsModal } from './SettingsModal'

/*
 * Семь пунктов — предел для одной строки: дальше шапка начинает обрезаться
 * молча, потому что на `html` стоит overflow-x: clip и скролл не появится.
 * Что не влезло в навигацию — живёт в быстрых ссылках подвала.
 */
const SECTIONS = [
  { id: 'protocol', label: 'Протокол' },
  { id: 'library', label: 'Техники' },
  { id: 'depth', label: 'Глубина' },
  { id: 'scale', label: 'Шкала' },
  { id: 'chronicle', label: 'Хроника' },
  { id: 'field', label: 'Поле' },
  { id: 'noise', label: 'Шум' },
] as const

export function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [active, setActive] = useState<string>('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { reduced, effective, intensity } = useMotionPrefs()

  /* Подписка на Lenis: сравнение с порогом даёт максимум одно обновление состояния
     за пересечение границы, а не setState на каждый кадр скролла. */
  useEffect(() => {
    const lenis = getLenis()
    if (!lenis) {
      const onScroll = () => setScrolled(window.scrollY > 40)
      window.addEventListener('scroll', onScroll, { passive: true })
      onScroll()
      return () => window.removeEventListener('scroll', onScroll)
    }
    const onScroll = ({ scroll }: { scroll: number }) => {
      setScrolled((prev) => (prev === scroll > 40 ? prev : scroll > 40))
    }
    lenis.on('scroll', onScroll)
    return () => lenis.off('scroll', onScroll)
  }, [])

  /* Подвал просит открыть настройки через шину — состояние модалки остаётся в одном месте. */
  useEffect(() => on('settings', ({ open }) => setSettingsOpen(open)), [])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) setActive(visible.target.id)
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: [0.01, 0.25, 0.6] },
    )
    SECTIONS.forEach(({ id }) => {
      const node = document.getElementById(id)
      if (node) observer.observe(node)
    })
    return () => observer.disconnect()
  }, [])

  const motionLabel = useMemo(() => {
    if (reduced) return 'движение выкл'
    if (effective < 0.5) return `движение ${Math.round(intensity * 100)}%`
    return 'движение 100%'
  }, [reduced, effective, intensity])

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-[60]">
      {/* Прогресс чтения на нативном CSS-timeline: считается вне main-thread. */}
      <div className="h-[3px] w-full bg-line/40" role="presentation">
        <div className="native-progress h-full w-full origin-left bg-accent-lime" />
      </div>

      <motion.div
        className={`pointer-events-auto flex items-center justify-between gap-4 px-[clamp(1rem,4vw,4.5rem)] transition-[padding,background-color,backdrop-filter] duration-300 ease-out ${
          scrolled ? 'border-b border-line/60 bg-ink/72 py-3 backdrop-blur-xl' : 'py-5'
        }`}
        /* При reduced шапка стоит на месте сразу — как и весь остальной контент. */
        initial={reduced ? false : { y: -32, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: revealSeconds + 0.2, ease: easeOutExpo, delay: 0.1 }}
      >
        <a
          href="#hero"
          onClick={(event) => {
            event.preventDefault()
            scrollToSection('hero')
          }}
          className="group flex items-center gap-2.5"
          data-cursor="наверх"
        >
          <span className="relative grid h-7 w-7 place-items-center">
            <span className="absolute inset-0 rounded-full border border-accent-lime/60" />
            <span className="h-2 w-2 rounded-full bg-accent-lime transition-transform duration-300 group-hover:scale-150" />
          </span>
          <span className="font-mono text-[13px] font-medium tracking-[0.24em] uppercase">Mindfield</span>
        </a>

        {/*
          * Порог lg — по замеру, а не на глаз: семь ссылок занимают 575 px,
          * логотип со статусом и шестернёй — ещё 176 px. На 1024 px остаётся
          * больше 150 px запаса. На `html` стоит overflow-x: clip, поэтому
          * переполнение не дало бы скролл, а молча обрезало правый край с кнопкой.
          */}
        <nav aria-label="Разделы" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {SECTIONS.map(({ id, label }) => {
              const isActive = active === id
              return (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    onClick={(event) => {
                      event.preventDefault()
                      scrollToSection(id)
                    }}
                    aria-current={isActive ? 'true' : undefined}
                    className={`relative block rounded-pill px-3 py-2 font-mono text-[11px] tracking-[0.14em] whitespace-nowrap uppercase transition-colors duration-200 ${
                      isActive ? 'text-ink' : 'text-fg-dim hover:text-fg'
                    }`}
                  >
                    {isActive ? (
                      /* layoutId — общий элемент между состояниями: Motion сам считает FLIP-переход */
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 rounded-pill bg-accent-lime"
                        transition={{ duration: revealSeconds, ease: easeOutExpo }}
                      />
                    ) : null}
                    <span className="relative z-10">{label}</span>
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden font-mono text-[10px] tracking-[0.2em] text-fg-faint uppercase md:inline">
            {motionLabel}
          </span>
          {/* Шестерёнка вместо текстовой кнопки: это инструмент, а не раздел повествования. */}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Настройки движения и качества"
            aria-haspopup="dialog"
            data-cursor="настройки"
            className="group grid h-10 w-10 place-items-center rounded-full border border-line text-fg-dim transition-colors duration-200 hover:border-accent-lime hover:text-accent-lime"
          >
            <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6" />
            </svg>
          </button>
        </div>
      </motion.div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  )
}
