/**
 * Телеметрия кадра.
 *
 * Осознанно НЕ React-state: обновление раз в кадр через setState = ре-рендер 60 раз в секунду.
 * Вместо этого — мутируемый объект, который читают rAF-циклы и пишут в DOM через ref.
 */
export type Telemetry = {
  fps: number
  /** Сглаженная скорость скролла: её и показываем, и по ней же ускоряем ленты */
  velocity: number
  /**
   * Сырое значение из Lenis. Отдельно и без сглаживания — потому что сглаживание
   * живёт в всегда работающем цикле HUD, иначе после остановки скролла значение замирает
   * на последнем числе (HUD залипал на «350.40 px/ms» после программного прыжка).
   */
  velocityRaw: number
  /** Момент последнего события скролла — по нему скорость честно затухает до нуля. */
  velocityAt: number
  /** 0..1 — прогресс документа */
  progress: number
  /** 0..1 — текущая интенсивность движения */
  intensity: number
  /** Активный режим интерактивной сцены */
  mode: string
  /** 0..100 — производная метрика сцены внимания */
  coherence: number
  /** Сколько объектов в симуляции — честная цифра, а не декоративный счётчик */
  entities: number
}

export const telemetry: Telemetry = {
  fps: 0,
  velocity: 0,
  velocityRaw: 0,
  velocityAt: 0,
  progress: 0,
  intensity: 1,
  mode: 'SCATTER',
  coherence: 0,
  entities: 0,
}

/**
 * Экспоненциальное сглаживание: сырые значения дёргаются и читаются как баг.
 *
 * Коэффициент зажат в [0, 1]: при отрицательной дельте `1 - exp(-dt)` меняет знак,
 * и величина уезжает в противоположную сторону от цели вместо приближения к ней.
 */
export const smooth = (current: number, target: number, dt: number, halfLife = 0.25): number => {
  const k = Math.min(1, Math.max(0, 1 - Math.exp((-dt / 1000) * (Math.LN2 / halfLife))))
  return current + (target - current) * k
}
