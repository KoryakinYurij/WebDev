import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = JSON.parse(readFileSync(resolve(root, 'tokens/design.tokens.json'), 'utf8'))
const CSS_EXTENSION = 'com.mindfield.css'

/** @type {Map<string, {type: string, value: unknown, extensions?: Record<string, unknown>}>} */
const flat = new Map()

const walk = (node, path = [], inheritedType) => {
  const groupType = node?.$type ?? inheritedType
  for (const [key, child] of Object.entries(node ?? {})) {
    if (key.startsWith('$')) continue
    if (!child || typeof child !== 'object') continue
    const next = [...path, key]
    if ('$value' in child) {
      flat.set(next.join('.'), {
        type: child.$type ?? groupType ?? 'unknown',
        value: child.$value,
        extensions: child.$extensions,
      })
    } else walk(child, next, child.$type ?? groupType)
  }
}
walk(source)

const resolveAlias = (value, seen = new Set()) => {
  if (typeof value !== 'string') return value
  const match = /^\{(.+)\}$/.exec(value)
  if (!match) return value
  const target = match[1]
  if (seen.has(target)) throw new Error(`Циклический алиас токена: ${target}`)
  const ref = flat.get(target)
  if (!ref) throw new Error(`Алиас ссылается на несуществующий токен: ${target}`)
  return resolveAlias(ref.value, new Set([...seen, target]))
}

const KEBAB = (s) => s.replace(/[^a-z0-9-]/gi, '-').toLowerCase()
const CAMEL = (s) => s.replace(/-([a-z0-9])/g, (_, ch) => ch.toUpperCase())

const colorHex = (value) => {
  if (!value || typeof value !== 'object' || value.colorSpace !== 'srgb') throw new Error('Ожидался DTCG sRGB color')
  if (typeof value.hex === 'string') return value.hex
  const channels = value.components
  if (!Array.isArray(channels) || channels.length !== 3) throw new Error('sRGB color ожидает 3 components')
  return `#${channels.map((x) => Math.round(Number(x) * 255).toString(16).padStart(2, '0')).join('')}`
}

const asCss = (token) => {
  const override = token.extensions?.[CSS_EXTENSION]?.value
  if (typeof override === 'string') return override
  const value = resolveAlias(token.value)
  if (token.type === 'color') return colorHex(value)
  if (token.type === 'cubicBezier') return `cubic-bezier(${value.join(', ')})`
  if (token.type === 'fontFamily') {
    return (Array.isArray(value) ? value : [value])
      .map((font) => (/[^a-zA-Z0-9-]/.test(font) ? `"${font}"` : font))
      .join(', ')
  }
  if (token.type === 'dimension' || token.type === 'duration') return `${value.value}${value.unit}`
  if (token.type === 'number') return String(value)
  throw new Error(`Неизвестный тип токена: ${token.type}`)
}
const THEME_NAMESPACES = [
  ['color-', 'color'],
  ['font-', 'font'],
  ['text-', 'size'],
  ['spacing-', 'space'],
  ['radius-', 'radius'],
  ['ease-', 'ease'],
]

const themeLines = []
const rootLines = []
for (const [path, token] of flat) {
  const css = asCss(token)
  const [group, ...rest] = path.split('.')
  const slug = rest.map(KEBAB).join('-')
  const namespace = THEME_NAMESPACES.find(([, name]) => name === group)?.[0]
  if (namespace) themeLines.push(`  --${namespace}${slug}: ${css};`)
  else if (group === 'duration') rootLines.push(`  --dur-${slug}: ${css};`)
  else if (group === 'z') rootLines.push(`  --z-${slug}: ${css};`)
  else if (group === 'motion') rootLines.push(`  --m-${slug}: ${css};`)
  else if (group === 'border') rootLines.push(`  --border-${slug}: ${css};`)
}

const nest = (entries) => {
  const out = {}
  for (const [path, value] of entries) {
    const keys = path.split('.').map(CAMEL)
    let node = out
    keys.forEach((key, index) => {
      if (index === keys.length - 1) node[key] = value
      else node = node[key] ??= {}
    })
  }
  return out
}
const pick = (type, convert, stripGroup = false) =>
  nest(
    [...flat]
      .filter(([, token]) => token.type === type)
      .map(([path, token]) => [stripGroup ? path.split('.').slice(1).join('.') : path, convert(token, asCss(token))]),
  )

const color = pick('color', (_token, css) => css, true)
const colorByToken = Object.fromEntries(
  [...flat].filter(([, token]) => token.type === 'color').map(([path, token]) => [path, asCss(token)]),
)
const numbers = pick('number', (_token, css) => Number(css))
const ease = pick('cubicBezier', (token) => resolveAlias(token.value), true)
const duration = pick('duration', (token) => {
  const value = resolveAlias(token.value)
  return value.unit === 's' ? value.value * 1000 : value.value
}, true)
const css = [
  '/* СГЕНЕРИРОВАНО scripts/build-tokens.mjs — не редактировать руками. */',
  '/* Источник: tokens/design.tokens.json (DTCG + namespaced CSS extension). */',
  '',
  '@theme {',
  themeLines.join('\n'),
  '}',
  '',
  ':root {',
  rootLines.join('\n'),
  '}',
  '',
].join('\n')
const ts = `/* СГЕНЕРИРОВАНО scripts/build-tokens.mjs — не редактировать руками. */

export const color = ${JSON.stringify(color, null, 2)} as const
export const colorByToken = ${JSON.stringify(colorByToken, null, 2)} as const
export type ColorToken = keyof typeof colorByToken
export const numbers = ${JSON.stringify(numbers, null, 2)} as const
export const duration = ${JSON.stringify(duration, null, 2)} as const
export const ease = ${JSON.stringify(ease, null, 2)} as const

export function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [0, 2, 4].map((start) => Number.parseInt(full.slice(start, start + 2), 16) / 255) as [number, number, number]
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = rgb(hex)
  return \`rgba(\${Math.round(r * 255)}, \${Math.round(g * 255)}, \${Math.round(b * 255)}, \${alpha})\`
}

export function tokenRgba(token: ColorToken, alpha: number): string {
  return rgba(colorByToken[token], alpha)
}

export function cubic(values: readonly number[]): string {
  return \`cubic-bezier(\${values.join(', ')})\`
}

export const tokens = { color, colorByToken, numbers, duration, ease } as const
`

mkdirSync(resolve(root, 'src/styles'), { recursive: true })
mkdirSync(resolve(root, 'src/generated'), { recursive: true })
writeFileSync(resolve(root, 'src/styles/tokens.css'), css)
writeFileSync(resolve(root, 'src/generated/tokens.ts'), ts)
console.log(`✓ tokens: ${flat.size} токенов → CSS + TS`)
