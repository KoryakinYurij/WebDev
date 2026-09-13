/**
 * DTCG (Design Tokens Community Group) → CSS + TS build step.
 *
 * Единственный источник правды: tokens/design.tokens.json
 * Выход:
 *   - src/styles/tokens.css  → блок @theme для Tailwind v4 + :root с рантайм-переменными
 *   - src/generated/tokens.ts → типизированные значения для JS (палитра шейдера, canvas-частицы)
 *
 * Никаких зависимостей: 60 строк вместо token-transformer/style-dictionary.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = JSON.parse(readFileSync(resolve(root, 'tokens/design.tokens.json'), 'utf8'))

/** @type {Map<string, {type: string, value: unknown, description?: string}>} */
const flat = new Map()

const walk = (node, path) => {
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('$')) continue
    const next = [...path, key]
    if (child && typeof child === 'object' && '$value' in child) {
      flat.set(next.join('.'), {
        type: child.$type ?? 'unknown',
        value: child.$value,
        description: child.$description,
      })
    } else if (child && typeof child === 'object') {
      walk(child, next)
    }
  }
}
walk(source, [])

/** Резолв алиасов вида `{color.accent.lime}` — на этапе сборки, в рантайм конечные значения. */
const resolveAlias = (value, seen = new Set()) => {
  if (typeof value !== 'string') return value
  const match = /^\{(.+)\}$/.exec(value)
  if (!match) return value
  const target = match[1]
  if (seen.has(target)) throw new Error(`Циклический алиас токена: ${target}`)
  seen.add(target)
  const ref = flat.get(target)
  if (!ref) throw new Error(`Алиас ссылается на несуществующий токен: ${target}`)
  return resolveAlias(ref.value, seen)
}

const KEBAB = (s) => s.replace(/[^a-z0-9-]/gi, '-').toLowerCase()

const asCss = (token) => {
  const v = resolveAlias(token.value)
  if (token.type === 'cubicBezier') {
    if (!Array.isArray(v) || v.length !== 4) throw new Error('cubicBezier ожидает массив из 4 чисел')
    return `cubic-bezier(${v.join(', ')})`
  }
  if (token.type === 'fontFamily') {
    return (Array.isArray(v) ? v : [v])
      .map((f) => (/[^a-zA-Z0-9-]/.test(f) ? `"${f}"` : f))
      .join(', ')
  }
  if (token.type === 'color') {
    if (typeof v !== 'string' || !/^#[0-9a-f]{3,8}$/i.test(v)) throw new Error(`Некорректный цвет: ${String(v)}`)
    return v
  }
  if (token.type === 'dimension' || token.type === 'duration' || token.type === 'number') {
    return String(v)
  }
  throw new Error(`Неизвестный тип токена: ${token.type}`)
}

/** Пространства имён Tailwind v4: имя префикса → первая часть пути токена. */
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
const runtime = {}

for (const [path, token] of flat) {
  const css = asCss(token)
  const [group, ...rest] = path.split('.')
  const slug = rest.map(KEBAB).join('-')
  const namespace = THEME_NAMESPACES.find(([, g]) => g === group)?.[0]

  if (namespace) {
    themeLines.push(`  --${namespace}${slug}: ${css};`)
  } else if (group === 'duration') {
    rootLines.push(`  --dur-${slug}: ${css};`)
  } else if (group === 'z') {
    rootLines.push(`  --z-${slug}: ${css};`)
  } else if (group === 'motion') {
    rootLines.push(`  --m-${slug}: ${css};`)
  } else if (group === 'border') {
    rootLines.push(`  --border-${slug}: ${css};`)
  }

  runtime[path] = token.type === 'cubicBezier' ? resolveAlias(token.value) : css
}

/** `color.accent.lime` → { color: { accent: { lime: '#d4ff3f' } } } — читаемый доступ из TS. */
const CAMEL = (s) => s.replace(/-([a-z0-9])/g, (_, ch) => ch.toUpperCase())

const nest = (entries) => {
  const out = {}
  for (const [path, value] of entries) {
    const keys = path.split('.').map(CAMEL)
    let node = out
    keys.forEach((key, i) => {
      if (i === keys.length - 1) node[key] = value
      else node = node[key] ??= {}
    })
  }
  return out
}

const pick = (type, convert, stripGroup = false) =>
  nest(
    [...flat]
      .filter(([, t]) => t.type === type)
      .map(([p, t]) => [stripGroup ? p.split('.').slice(1).join('.') : p, convert(t, asCss(t))]),
  )

const color = pick('color', (_t, css) => css, true)
/** Плоская карта «полное имя токена → hex»: нужна там, где цвет выбирается динамически. */
const colorByToken = Object.fromEntries([...flat].filter(([, t]) => t.type === 'color').map(([p, t]) => [p, asCss(t)]))
const numbers = pick('number', (_t, css) => Number(css))
// Для Motion нужен именно массив чисел, а не готовая CSS-строка.
const ease = pick('cubicBezier', (t) => resolveAlias(t.value), true)
const duration = pick('duration', (_t, css) => Number.parseInt(css, 10), true)

const css = `/* СГЕНЕРИРОВАНО scripts/build-tokens.mjs — не редактировать руками. */
/* Источник: tokens/design.tokens.json (формат DTCG) */

@theme {
${themeLines.join('\n')}
}

:root {
${rootLines.join('\n')}
}
`

const ts = `/* СГЕНЕРИРОВАНО scripts/build-tokens.mjs — не редактировать руками. */

/** Вложенная палитра в hex: интерфейс, шейдер и canvas рисуют одну и ту же палитру. */
export const color = ${JSON.stringify(color, null, 2)} as const

/** Плоская карта палитры: обращение по полному имени токена. */
export const colorByToken = ${JSON.stringify(colorByToken, null, 2)} as const

export type ColorToken = keyof typeof colorByToken

/** Числовые бюджеты движения (мс, доли, счётчики). */
export const numbers = ${JSON.stringify(numbers, null, 2)} as const

/** Длительности в мс — для Motion и JS-анимаций. */
export const duration = ${JSON.stringify(duration, null, 2)} as const

/** Кривые easing как массивы из 4 чисел — Motion принимает их напрямую. */
export const ease = ${JSON.stringify(ease, null, 2)} as const

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
  return \`rgba(\${Math.round(r * 255)}, \${Math.round(g * 255)}, \${Math.round(b * 255)}, \${alpha})\`
}

/** Цвет токена → строка rgba(). */
export function tokenRgba(token: ColorToken, alpha: number): string {
  return rgba(colorByToken[token], alpha)
}

/** cubic-bezier массив → значение для CSS/GSAP. */
export function cubic(values: readonly number[]): string {
  return \`cubic-bezier(\${values.join(', ')})\`
}

export const tokens = { color, colorByToken, numbers, duration, ease } as const
`

mkdirSync(resolve(root, 'src/styles'), { recursive: true })
mkdirSync(resolve(root, 'src/generated'), { recursive: true })
writeFileSync(resolve(root, 'src/styles/tokens.css'), css)
writeFileSync(resolve(root, 'src/generated/tokens.ts'), ts)

console.log(`✓ tokens: ${flat.size} токенов → src/styles/tokens.css + src/generated/tokens.ts`)
