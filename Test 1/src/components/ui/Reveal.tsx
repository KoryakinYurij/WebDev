import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useInView } from 'motion/react'
import { useMotionPrefs } from '../../lib/motion-config'
import { easeOutExpo, revealSeconds } from '../../lib/bezier'

type RevealProps = {
  children: ReactNode
  className?: string
  /** Задержка от базового шага stagger — сюда передаём индекс * staggerSeconds */
  delay?: number
  /** Смещение по Y при входе. Держим < 40px: длинные проезды читаются как медлительность. */
  distance?: number
  amount?: number
}

/**
 * Reveal-on-scroll: только для секций и ключевых элементов, не для абзацев тела текста.
 * При reduced-motion разметка рендерится сразу в финальном состоянии — это требование
 * доступности, а не оптимизация: контент не имеет права застрять в opacity: 0.
 */
export function Reveal({ children, className, delay = 0, distance = 26, amount = 0.3 }: RevealProps) {
  const { reduced } = useMotionPrefs()

  if (reduced) return <div className={className}>{children}</div>

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount }}
      transition={{ duration: revealSeconds, delay, ease: easeOutExpo }}
    >
      {children}
    </motion.div>
  )
}

/**
 * Разбивает строку на слова и отдаёт их Motion со stagger.
 * Слова, а не буквы: по буквам заголовок читается как набор, а не как фраза.
 */
export function RevealWords({
  text,
  className,
  wordClassName,
  delay = 0,
}: {
  text: string
  className?: string
  wordClassName?: string
  delay?: number
}) {
  const { reduced } = useMotionPrefs()
  const ref = useRef<HTMLSpanElement>(null)
  /*
   * Наблюдаем ОБЁРТКУ, а не слово внутри `overflow: hidden`.
   * Слово, сдвинутое на 110 %, полностью обрезано контейнером — его пересечение с вьюпортом
   * равно нулю, IntersectionObserver никогда не сработает и текст навсегда останется невидимым.
   * Классическая ловушка reveal-анимаций по словам.
   */
  const inView = useInView(ref, { once: true, amount: 0.3 })
  const words = text.split(' ')

  if (reduced) return <span className={className}>{text}</span>

  return (
    <span ref={ref} className={className}>
      {words.map((word, index) => (
        /* pb/-mb компенсируют выносные элементы, которые иначе срезает маска строки */
        <span key={`${word}-${index}`} className="inline-block overflow-hidden align-bottom pb-[0.12em] -mb-[0.12em]">
          <motion.span
            className={wordClassName}
            style={{ display: 'inline-block', willChange: inView ? undefined : 'transform' }}
            initial={{ y: '110%' }}
            animate={inView ? { y: '0%' } : { y: '110%' }}
            transition={{ duration: 0.62, delay: delay + index * 0.045, ease: easeOutExpo }}
          >
            {word}
            {index < words.length - 1 ? '\u00a0' : ''}
          </motion.span>
        </span>
      ))}
    </span>
  )
}

const GLYPHS = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ0123456789<>/\\*#%@+='

/**
 * Текстовый эффект «расшифровка сигнала» (идея из awesome-web-animation: Blotter / shuffle-text).
 * Пишем в textContent напрямую: в кадре меняются символы, React здесь только мешает.
 */
export function ScrambleText({
  text,
  className,
  durationMs = 900,
}: {
  text: string
  className?: string
  durationMs?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const { reduced } = useMotionPrefs()
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (reduced) {
      node.textContent = text
      return
    }
    // Скрембл запускается только когда строка реально видна — иначе эффект «сгорает» до первого взгляда.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.disconnect()
          setArmed(true)
        }
      },
      { threshold: 0.4 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [text, reduced])

  useEffect(() => {
    const node = ref.current
    if (!node || !armed || reduced) return

    let frame = 0
    const start = performance.now()

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs)
      const revealed = Math.floor(progress * text.length * 1.25)
      let output = ''
      for (let i = 0; i < text.length; i += 1) {
        if (i < revealed || text[i] === ' ') output += text[i]
        else output += GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
      }
      node.textContent = output
      if (progress < 1) frame = requestAnimationFrame(tick)
      else node.textContent = text
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [armed, reduced, text, durationMs])

  // Скрытый дубль: скринридер обязан прочитать фразу, а не набор случайных глифов.
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span ref={ref} aria-hidden="true">
        {reduced ? text : '\u00a0'}
      </span>
    </span>
  )
}
