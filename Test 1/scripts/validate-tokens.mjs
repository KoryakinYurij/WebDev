import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = JSON.parse(readFileSync(resolve(root, 'tokens/design.tokens.json'), 'utf8'))
const CSS_EXTENSION = 'com.mindfield.css'
const tokens = new Map()
const errors = []
const walk = (node, path = [], inheritedType) => {
  const groupType = node?.$type ?? inheritedType
  for (const [key, child] of Object.entries(node ?? {})) {
    if (key.startsWith('$') || !child || typeof child !== 'object') continue
    const next = [...path, key]
    if ('$value' in child) {
      tokens.set(next.join('.'), {
        type: child.$type ?? groupType,
        value: child.$value,
        extensions: child.$extensions,
      })
    } else walk(child, next, child.$type ?? groupType)
  }
}
walk(source)
