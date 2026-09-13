import { useEffect, useRef, type RefObject } from 'react'

type RafCallback = (deltaMs: number, elapsedMs: number) => void

type Options = {
  /** Выключить цикл, не размонтируя компонент */
  enabled?: boolean
  /** Пауза, когда элемент вне вьюпорта: батарея и троттлинг важнее, чем «пусть крутится» */
  target?: RefObject<HTMLElement | null>
  /** Учитывать состояние document.hidden */
  pauseWhenHidden?: boolean
}

/**
 * rAF-цикл с горячей заменой колбэка и ленивым запуском.
 *
 * Колбэк хранится в ref — цикл не перезапускается при каждом ре-рендере,
 * иначе теряются кадры на старте анимаций.
 */
export function useRafLoop(callback: RafCallback, options: Options = {}) {
  const { enabled = true, target, pauseWhenHidden = true } = options
  const saved = useRef(callback)
  saved.current = callback

  useEffect(() => {
    if (!enabled) return

    let frame = 0
    let last = performance.now()
    const started = last
    let visible = true
    let running = false

    const tick = (now: number) => {
      /*
       * Дельта зажимается с двух сторон.
       * Сверху — иначе после возврата из фоновой вкладки прыжок в секунды ломает симуляцию.
       * Снизу — потому что таймстемп кадра rAF может быть МЕНЬШЕ `performance.now()`,
       * снятого в конце предыдущего кадра: дельта становится отрицательной,
       * и сглаживание вида `current + (target - current) * (1 - exp(-dt))` уезжает
       * в обратную сторону (в HUD это выглядело как когерентность «−12 %»).
       */
      const delta = Math.min(Math.max(now - last, 0), 34)
      last = now
      try {
        saved.current(delta, now - started)
      } catch (error) {
        /*
         * Исключение в кадре не имеет права убивать цикл молча — это худший вид бага,
         * когда вся анимация просто замирает без единого сообщения.
         * Поэтому падаем громко и останавливаемся осознанно.
         */
        console.error('[useRafLoop] кадр завершился с ошибкой, цикл остановлен', error)
        running = false
        return
      }
      frame = requestAnimationFrame(tick)
    }

    const start = () => {
      if (running) return
      running = true
      last = performance.now()
      frame = requestAnimationFrame(tick)
    }

    const stop = () => {
      running = false
      cancelAnimationFrame(frame)
    }

    const sync = () => {
      const shouldRun = visible && !(pauseWhenHidden && document.hidden)
      if (shouldRun) start()
      else stop()
    }

    const onVisibility = () => sync()
    let observer: IntersectionObserver | undefined

    if (target?.current) {
      observer = new IntersectionObserver(
        ([entry]) => {
          visible = entry.isIntersecting
          sync()
        },
        { rootMargin: '20% 0px' },
      )
      observer.observe(target.current)
    } else {
      sync()
    }

    if (pauseWhenHidden) document.addEventListener('visibilitychange', onVisibility)
    sync()

    return () => {
      stop()
      observer?.disconnect()
      if (pauseWhenHidden) document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled, target, pauseWhenHidden])
}

/** Короткая проверка медиазапроса — только для одноразовых решений (например, включить ли 3D). */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
