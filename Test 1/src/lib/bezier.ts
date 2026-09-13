import { duration, ease, numbers } from '../generated/tokens'

/**
 * Мост между сгенерированными токенами и API анимационных библиотек.
 * Motion хочет изменяемый кортеж из 4 чисел, токены дают readonly — приводим один раз здесь,
 * а не раскидываем `as [number,number,number,number]` по компонентам.
 */
export type Bezier = [number, number, number, number]

const toBezier = (values: readonly number[]): Bezier => [values[0], values[1], values[2], values[3]]

export const easeOutExpo = toBezier(ease.outExpo)
export const easeOutQuart = toBezier(ease.outQuart)
export const easeInQuart = toBezier(ease.inQuart)
export const easeInOut = toBezier(ease.inOut)
export const easeSwift = toBezier(ease.swift)

/** Бюджет reveal-on-scroll: < 400 мс на элемент, < 200 мс на шаг stagger. */
export const revealSeconds = numbers.motion.revealDuration / 1000
export const staggerSeconds = numbers.motion.stagger / 1000

export const seconds = (ms: number) => ms / 1000

export const durations = duration
