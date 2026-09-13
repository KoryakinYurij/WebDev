import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react'
import { useMotionPrefs } from '../../lib/motion-config'
import { easeOutExpo, seconds, durations } from '../../lib/bezier'
import { paletteRgba } from '../../lib/paint'
import { scrollToSection } from '../../lib/smooth-scroll'

type MagneticProps = {
  children: ReactNode
  href?: string
  onClick?: () => void
  variant?: 'primary' | 'outline' | 'bare'
  className?: string
  /** Насколько сильно кнопка тянется к курсору. Больше 0.4 уже выглядит как баг вёрстки. */
  strength?: number
  ariaLabel?: string
}

/**
 * Магнитная кнопка (паттерн motion-primitives: указатель тянет элемент через spring).
 * Внешний контур смещается на strength, внутренняя подпись — на strength * 1.6:
 * разница смещений и даёт ощущение объёма.
 */
export function MagneticButton({
  children,
  href,
  onClick,
  variant = 'primary',
  className = '',
  strength = 0.32,
  ariaLabel,
}: MagneticProps) {
  const { reduced } = useMotionPrefs()
  const ref = useRef<HTMLElement>(null)

  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const spring = { stiffness: 220, damping: 20, mass: 0.5 }
  const sx = useSpring(x, spring)
  const sy = useSpring(y, spring)
  const labelX = useTransform(sx, (v) => v * 0.6)
  const labelY = useTransform(sy, (v) => v * 0.6)

  const variants: Record<string, string> = {
    primary: 'bg-accent-lime text-ink border-accent-lime hover:bg-fg',
    outline: 'border-line text-fg hover:border-accent-lime hover:text-accent-lime',
    bare: 'border-transparent text-fg-dim hover:text-accent-lime',
  }

  const handleMove = (event: React.PointerEvent) => {
    if (reduced || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    x.set((event.clientX - (rect.left + rect.width / 2)) * strength)
    y.set((event.clientY - (rect.top + rect.height / 2)) * strength)
  }

  const reset = () => {
    x.set(0)
    y.set(0)
  }

  const shared = {
    ref: ref as never,
    className: [
      'group relative inline-flex items-center justify-center gap-2 overflow-hidden',
      'rounded-pill border px-6 py-3 font-mono text-label uppercase tracking-[0.2em]',
      'transition-colors duration-200 ease-out will-change-transform',
      variants[variant],
      className,
    ].join(' '),
    style: reduced ? undefined : { x: sx, y: sy },
    onPointerMove: handleMove,
    onPointerLeave: reset,
    onBlur: reset,
    whileTap: reduced ? undefined : { scale: 0.96 },
    'data-cursor': 'magnetic',
    'aria-label': ariaLabel,
  }

  const inner = (
    <>
      <motion.span style={reduced ? undefined : { x: labelX, y: labelY }} className="relative z-10 flex items-center gap-2">
        {children}
      </motion.span>
      {/* Единственная анимация здесь — transform: полоса не трогает layout и paint. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 origin-left scale-x-0 bg-current opacity-15 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-x-100"
      />
    </>
  )

  /*
   * Якорь внутри страницы обязан идти через Lenis.
   * С `href="#deck"` без перехвата браузер делает резкий нативный прыжок, который
   * игнорирует и инерцию, и текущую позицию — единственное место, где скролл вёл себя не так,
   * как весь остальной сайт.
   */
  const handleAnchor = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!href?.startsWith('#')) return
    event.preventDefault()
    scrollToSection(href.slice(1))
  }

  if (href) {
    return (
      <motion.a href={href} onClick={handleAnchor} {...shared}>
        {inner}
      </motion.a>
    )
  }

  return (
    <motion.button type="button" onClick={onClick} {...shared}>
      {inner}
    </motion.button>
  )
}

/**
 * Кастомный курсор.
 *
 * Отключается на тач-устройствах и при reduced-motion; системный курсор при этом остаётся
 * полностью рабочим — кастомный только добавляет слой поверх, никогда не подменяет его.
 */
export function Cursor() {
  const { reduced, quality } = useMotionPrefs()
  const [enabled, setEnabled] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [label, setLabel] = useState('')

  const x = useMotionValue(-100)
  const y = useMotionValue(-100)
  const ringX = useSpring(x, { stiffness: 260, damping: 26, mass: 0.5 })
  const ringY = useSpring(y, { stiffness: 260, damping: 26, mass: 0.5 })
  const dotX = useSpring(x, { stiffness: 1400, damping: 60, mass: 0.2 })
  const dotY = useSpring(y, { stiffness: 1400, damping: 60, mass: 0.2 })

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches
    setEnabled(fine && !reduced)
  }, [reduced])

  useEffect(() => {
    if (!enabled) return

    const onMove = (event: PointerEvent) => {
      x.set(event.clientX)
      y.set(event.clientY)
      const target = (event.target as Element | null)?.closest('[data-cursor]')
      setHovering(Boolean(target))
      setLabel(target?.getAttribute('data-cursor') === 'magnetic' ? '' : (target?.getAttribute('data-cursor') ?? ''))
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [enabled, x, y])

  if (!enabled) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[90] hidden lg:block" aria-hidden="true">
      <motion.div
        className="absolute top-0 left-0 flex items-center justify-center rounded-full border border-fg/70 mix-blend-difference"
        style={{ x: ringX, y: ringY, translateX: '-50%', translateY: '-50%' }}
        animate={{
          width: hovering ? 84 : 34,
          height: hovering ? 84 : 34,
          opacity: 0.9,
        }}
        transition={{ duration: seconds(durations.fast), ease: easeOutExpo }}
      >
        {label ? (
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-fg">{label}</span>
        ) : null}
      </motion.div>
      {quality === 'high' ? (
        <motion.div
          className="absolute top-0 left-0 h-1.5 w-1.5 rounded-full"
          style={{ x: dotX, y: dotY, translateX: '-50%', translateY: '-50%', background: paletteRgba('color.accent.lime', 1) }}
        />
      ) : null}
    </div>
  )
}
