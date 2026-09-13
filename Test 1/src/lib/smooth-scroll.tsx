import { useEffect, type ReactNode } from 'react'
import Lenis from 'lenis'
import { gsap, ScrollTrigger } from './gsap'
import { smooth, telemetry } from './telemetry'

/**
 * Потолок скорости в px/кадр.
 * Всё, что выше, — это не скролл пользователя, а программный прыжок `scrollTo(immediate)`,
 * который у Lenis даёт всплеск в сотни единиц.
 */
const MAX_VELOCITY = 120
import { useMotionPrefs } from './motion-config'

let instance: Lenis | null = null

/** Доступ к Lenis вне React (якорные ссылки, панель управления). */
export const getLenis = () => instance

export function scrollToSection(id: string, offset = 0) {
  const target = document.getElementById(id)
  if (!target) return
  if (instance) instance.scrollTo(target, { offset, duration: 1.1 })
  else target.scrollIntoView({ block: 'start' })
}

/**
 * Инерционный скролл + синхронизация с ScrollTrigger.
 *
 * Три правила, без которых эта связка разваливается:
 *   1. autoRaf: false — иначе Lenis и GSAP тикают одновременно (двойная скорость);
 *   2. raf вызывается из тикера GSAP, а не из своего requestAnimationFrame — иначе маркеры расходятся с позицией;
 *   3. gsap.ticker.lagSmoothing(0) — без этого GSAP вносит искусственную задержку и появляется дрожание в 1–2 кадра.
 *
 * Сглаживание полностью отключается при reduced-motion: это scroll-hijacking,
 * а людям с вестибулярными расстройствами он вреден.
 *
 * Гейт идёт от `reduced` из MotionProvider, а не от голого медиазапроса:
 * `reduced` учитывает и системную настройку (реактивно), и ручной тумблер в пушке.
 * С `gsap.matchMedia('(prefers-reduced-motion: no-preference)')` пользовательский
 * тумблер не влиял бы на Lenis вообще — системный медиазапрос от него не меняется.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const { reduced } = useMotionPrefs()

  useEffect(() => {
    if (reduced) return

    const lenis = new Lenis({
      lerp: 0.1,
      duration: 1.5,
      smoothWheel: true,
      // Нативный momentum на тач-устройствах лучше, чем синтетический.
      syncTouch: false,
      autoRaf: false,
    })
    instance = lenis

    lenis.on('scroll', ({ scroll, limit, velocity }) => {
      ScrollTrigger.update()
      telemetry.velocityRaw = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, velocity))
      telemetry.velocityAt = performance.now()
      telemetry.progress = limit > 0 ? scroll / limit : 0
    })

    const tick = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)

    /*
     * Сглаживание скорости — здесь, а не в колбэке скролла.
     *
     * Колбэк перестаёт вызываться ровно тогда, когда скролл остановился, и значение
     * замирает на последнем числе (в HUD висело «350.40» после остановки). Поэтому:
     * Lenis только пишет сырое значение и время события, а затухание считает тикер GSAP,
     * который работает всегда. Половина жизни 70 мс — лента успевает отреагировать
     * и так же быстро успокаивается, когда скролл кончился.
     */
    let lastFrame = 0
    const decay = () => {
      const now = performance.now()
      if (!lastFrame) lastFrame = now
      const dt = Math.min(Math.max(now - lastFrame, 0), 34)
      lastFrame = now
      const idle = now - telemetry.velocityAt > 120
      telemetry.velocity = smooth(telemetry.velocity, idle ? 0 : telemetry.velocityRaw, dt, 0.07)
    }
    gsap.ticker.add(decay)

    // Позиции триггеров, посчитанные до загрузки шрифтов, всегда неверны.
    document.fonts?.ready.then(() => ScrollTrigger.refresh())

    return () => {
      gsap.ticker.remove(tick)
      gsap.ticker.remove(decay)
      lenis.destroy()
      instance = null
      telemetry.velocity = 0
      telemetry.velocityRaw = 0
    }
  }, [reduced])

  return children
}
