/* СГЕНЕРИРОВАНО scripts/build-tokens.mjs — не редактировать руками. */

/** Вложенная палитра в hex: интерфейс, шейдер и canvas рисуют одну и ту же палитру. */
export const color = {
  "ink": "#06060a",
  "void": "#000000",
  "surface": "#0d0d14",
  "surfaceRaised": "#15151f",
  "line": "#2a2a38",
  "fg": "#f2f2f7",
  "fgDim": "#a3a3b8",
  "fgFaint": "#6a6a80",
  "accent": {
    "lime": "#d4ff3f",
    "magenta": "#ff2e88",
    "indigo": "#5b3cff",
    "cyan": "#00e8ff"
  },
  "signal": {
    "ok": "#6dff8a",
    "warn": "#ffb02e"
  }
} as const

/** Плоская карта палитры: обращение по полному имени токена. */
export const colorByToken = {
  "color.ink": "#06060a",
  "color.void": "#000000",
  "color.surface": "#0d0d14",
  "color.surface-raised": "#15151f",
  "color.line": "#2a2a38",
  "color.fg": "#f2f2f7",
  "color.fg-dim": "#a3a3b8",
  "color.fg-faint": "#6a6a80",
  "color.accent.lime": "#d4ff3f",
  "color.accent.magenta": "#ff2e88",
  "color.accent.indigo": "#5b3cff",
  "color.accent.cyan": "#00e8ff",
  "color.signal.ok": "#6dff8a",
  "color.signal.warn": "#ffb02e"
} as const

export type ColorToken = keyof typeof colorByToken

/** Числовые бюджеты движения (мс, доли, счётчики). */
export const numbers = {
  "z": {
    "base": 0,
    "content": 10,
    "overlay": 40,
    "nav": 60,
    "cursor": 90
  },
  "motion": {
    "revealDuration": 380,
    "stagger": 46,
    "parallaxBg": 0.28,
    "parallaxMid": 0.5,
    "parallaxFg": 0.72,
    "particles": 900,
    "particlesLow": 260,
    "heroPoints": 6000,
    "heroPointsLow": 2000
  }
} as const

/** Длительности в мс — для Motion и JS-анимаций. */
export const duration = {
  "instant": 90,
  "fast": 180,
  "base": 300,
  "reveal": 380,
  "slow": 700,
  "cinematic": 1400
} as const

/** Кривые easing как массивы из 4 чисел — Motion принимает их напрямую. */
export const ease = {
  "outExpo": [
    0.16,
    1,
    0.3,
    1
  ],
  "outQuart": [
    0.25,
    1,
    0.5,
    1
  ],
  "inQuart": [
    0.5,
    0,
    0.75,
    0
  ],
  "inOut": [
    0.83,
    0,
    0.17,
    1
  ],
  "swift": [
    0.4,
    0,
    0.2,
    1
  ]
} as const

/** hex → [r, g, b] в диапазоне 0..1 (для THREE.Color и canvas-градиентов). */
export function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = Number.parseInt(full.slice(0, 6), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** hex + alpha → строка rgba() для 2D-canvas. */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = rgb(hex)
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`
}

/** Цвет токена → строка rgba(). */
export function tokenRgba(token: ColorToken, alpha: number): string {
  return rgba(colorByToken[token], alpha)
}

/** cubic-bezier массив → значение для CSS/GSAP. */
export function cubic(values: readonly number[]): string {
  return `cubic-bezier(${values.join(', ')})`
}

export const tokens = { color, colorByToken, numbers, duration, ease } as const
