import { colorByToken, rgb, tokenRgba, type ColorToken } from '../generated/tokens'

export type { ColorToken }

/** hex токена — для inline-style и SVG-атрибутов. */
export const paletteColor = (token: ColorToken) => colorByToken[token]

/** rgba() токена — для canvas и бэкдропов. */
export const paletteRgba = (token: ColorToken, alpha: number) => tokenRgba(token, alpha)

/** [r, g, b] в 0..1 — для THREE.Color и градиентов. */
export const paletteRgb = (token: ColorToken) => rgb(colorByToken[token])

/** Готовая кисть для CanvasRenderingContext2D: без строковой сборки в каждом кадре. */
export function brush(ctx: CanvasRenderingContext2D, token: ColorToken, alpha: number) {
  return (ctx.fillStyle = paletteRgba(token, alpha))
}
