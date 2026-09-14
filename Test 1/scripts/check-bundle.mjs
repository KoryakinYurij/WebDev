import { readdirSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Бюджет бандла.
 *
 * Лимиты — не украшение и не «среднее по рынку»: это потолок, после которого
 * чанк перестаёт быть оправданным и его надо резать. Три чанка держим раздельно,
 * чтобы деградация одного не пряталась за общим весом.
 *
 * CSS тоже под бюджетом: стили растут молча (утилиты Tailwind генерируются), и без
 * проверки первый же разросшийся набор классов никто не заметит.
 */
const BUDGETS = [
  { match: (name) => name.startsWith('three-'), limit: 140, what: 'three' },
  { match: (name) => name.startsWith('scroll-'), limit: 65, what: 'gsap + lenis' },
  { match: (name) => name.startsWith('index-'), limit: 160, what: 'остальное приложение' },
]

const TOTAL_JS = 350
const TOTAL_CSS = 30

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const assets = resolve(root, 'dist/assets')
const entries = readdirSync(assets)
const gzipKb = (name) => gzipSync(readFileSync(resolve(assets, name))).length / 1024

const scripts = entries.filter((name) => name.endsWith('.js')).map((name) => ({ name, kb: gzipKb(name) }))
const styles = entries.filter((name) => name.endsWith('.css')).map((name) => ({ name, kb: gzipKb(name) }))

let failed = false
const report = (label, kb, max) => {
  const over = kb > max
  if (over) failed = true
  console.log(`${label}: ${kb.toFixed(1)} KB gzip / ${max} KB${over ? '  ← превышен' : ''}`)
}

for (const script of scripts) {
  const budget = BUDGETS.find((entry) => entry.match(script.name))
  report(script.name, script.kb, budget ? budget.limit : 80)
}

report('total JS', scripts.reduce((sum, script) => sum + script.kb, 0), TOTAL_JS)
report('total CSS', styles.reduce((sum, style) => sum + style.kb, 0), TOTAL_CSS)

if (failed) {
  console.error('Bundle budget exceeded')
  process.exit(1)
}
