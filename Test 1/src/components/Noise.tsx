import { useCallback, useEffect, useRef, useState } from 'react'
import { useScroll } from 'motion/react'
import { ScrambleText } from './ui/Reveal'
import { useMotionPrefs } from '../lib/motion-config'
import { useRafLoop } from '../lib/use-raf-loop'
import { hash01 } from '../lib/hash'
import { paletteColor, paletteRgba } from '../lib/paint'

type Segment = { text: string; serif?: boolean; accent?: boolean }
type Phrase = { lines: Segment[][]; caption: string }

/**
 * 008 — Шум.
 *
 * Буквы летают как шум, пока скролл не соберёт из них фразу; курсор разгоняет
 * буквы вокруг себя, и поток сходится обратно сам. Метафора ровно та же, что
 * у практики: материал не «тишина», а шум, из которого собирается смысл.
 *
 * Почему canvas, а не DOM-буквы: у каждой буквы своя пружина, скорость, крен
 * и отталкивание от курсора. Шестьдесят отдельных DOM-узлов с индивидуальной
 * физикой — это шестьдесят ре-рендеров в кадре; canvas даёт то же за один
 * проход и не трогает React.
 */
const PHRASES: readonly Phrase[] = [
  {
    lines: [[{ text: 'СОБРАТЬ' }], [{ text: 'себя', serif: true, accent: true }], [{ text: 'ИЗ ШУМА' }]],
    caption: 'фраза не берётся из тишины — она собирается из того, что шумит рядом',
  },
  {
    lines: [[{ text: 'ВОЗВРАТ —' }], [{ text: 'это событие', serif: true, accent: true }]],
    caption: 'возврат считается, а не переживается как провал',
  },
  {
    lines: [[{ text: 'РАБОТА ИДЁТ' }], [{ text: 'даже в шуме', serif: true, accent: true }]],
    caption: 'навык растёт в промежутке между уходом и возвратом',
  },
]

const SANS = '"Space Grotesk", ui-sans-serif, system-ui, sans-serif'
const SERIF = '"Instrument Serif", Georgia, serif'
const LINE_HEIGHT = 0.98
const DPR_CAP = 2
/** Кегль, выше которого фраза начинает выглядеть плакатом, а не типографикой. */
const MAX_SIZE = 132

type Glyph = {
  char: string
  size: number
  serif: boolean
  accent: boolean
  /** Место в готовой фразе */
  x: number
  y: number
  /** Порядок в строке: по нему буквы приходят не хором, а слева направо */
  order: number
  /** Куда буква улетает, пока фраза не собрана */
  scatterX: number
  scatterY: number
  scatterRot: number
  /** Физическое состояние */
  px: number
  py: number
  vx: number
  vy: number
  rot: number
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

type Measurer = {
  /** Ширина строки в пикселях при кегле 100 px — дальше масштабируется линейно. */
  widthAt100: (line: Segment[], size: number) => number
  advanceAt100: (char: string, serif: boolean, size: number) => number
}

const makeMeasurer = (ctx: CanvasRenderingContext2D) => {
  const widthAt100 = (line: Segment[], size: number) => {
    let width = 0
    for (const segment of line) {
      ctx.font = `500 100px ${segment.serif ? SERIF : SANS}`
      width += ctx.measureText(segment.text).width * (size / 100)
    }
    return width
  }
  const advanceAt100 = (char: string, serif: boolean, size: number) => {
    ctx.font = `500 100px ${serif ? SERIF : SANS}`
    return ctx.measureText(char).width * (size / 100)
  }
  return { widthAt100, advanceAt100 }
}

/**
 * Раскладка фразы и разлёт букв.
 *
 * Кегль подбирается двумя ограничениями сразу: фраза обязана влезть и по ширине,
 * и по высоте блока — иначе длинная строка вылезает за канвас на узком экране,
 * а три строки перестают помещаться по вертикали.
 *
 * Буквы измеряются по одной, а не строкой целиком: кернинг теряется, но именно
 * это и делает буквы независимыми частицами. Для заглавного набора разница
 * в пределах пары процентов, зато каждая буква получает свою пружину.
 */
const layoutPhrase = (
  phrase: Phrase,
  width: number,
  height: number,
  measurer: Measurer,
): Glyph[] => {
  const padX = Math.min(width * 0.06, 40)
  const padY = 28
  const maxWidth = Math.max(120, width - padX * 2)
  const maxHeight = Math.max(120, height - padY * 2)
  const lineCount = phrase.lines.length

  const widthLimit = Math.min(
    ...phrase.lines.map((line) => (measurer.widthAt100(line, 100) > 0 ? (maxWidth / measurer.widthAt100(line, 100)) * 100 : MAX_SIZE)),
  )
  const heightLimit = maxHeight / (lineCount * LINE_HEIGHT)
  const size = Math.floor(Math.max(28, Math.min(MAX_SIZE, widthLimit, heightLimit)))

  const blockHeight = lineCount * size * LINE_HEIGHT
  const firstCenterY = height / 2 - blockHeight / 2 + (size * LINE_HEIGHT) / 2

  const glyphs: Glyph[] = []
  let order = 0

  phrase.lines.forEach((line, lineIndex) => {
    const lineWidth = measurer.widthAt100(line, size)
    let cursorX = width / 2 - lineWidth / 2
    const centerY = firstCenterY + lineIndex * size * LINE_HEIGHT

    for (const segment of line) {
      for (const char of segment.text) {
        const advance = measurer.advanceAt100(char, segment.serif === true, size)
        if (char.trim()) {
          const index = order
          const scatterX = (hash01(index * 3.1) * 2 - 1) * width * 0.55
          const scatterY = (hash01(index * 3.1 + 1.7) * 2 - 1) * height * 0.75
          const create = (): Glyph => ({
            char,
            size,
            serif: segment.serif === true,
            accent: segment.accent === true,
            x: cursorX + advance / 2,
            y: centerY,
            order: index,
            scatterX,
            scatterY,
            scatterRot: (hash01(index * 3.1 + 3.3) * 2 - 1) * 1.1,
            px: cursorX + advance / 2 + scatterX,
            py: centerY + scatterY,
            vx: 0,
            vy: 0,
            rot: (hash01(index * 3.1 + 3.3) * 2 - 1) * 1.1,
          })
          glyphs.push(create())
          order += 1
        }
        cursorX += advance
      }
    }
  })

  return glyphs
}

export function Noise() {
  const wrapper = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [phraseIndex, setPhraseIndex] = useState(0)
  /* Сигнал в DOM: по нему видно, что курсор вообще дошёл до сцены (нужно и тестам, и отладке). */
  const [pointerActive, setPointerActive] = useState(false)
  const { reduced } = useMotionPrefs()

  /* Прогресс — ровно по липкой части: три фразы делят её поровну. */
  const { scrollYProgress } = useScroll({ target: wrapper, offset: ['start start', 'end end'] })

  const state = useRef({
    width: 0,
    height: 0,
    scene: 0,
    pointer: { x: -9999, y: -9999, active: false },
    layouts: [] as Glyph[][],
  })

  const paint = useCallback(
    (delta: number) => {
      const node = canvas.current
      const ctx = node?.getContext('2d')
      if (!node || !ctx) return

      const { width, height, layouts, pointer } = state.current
      const dt = Math.min(delta, 34) / 16.666
      const scene = state.current.scene

      ctx.clearRect(0, 0, width, height)

      const repelRadius = Math.max(110, Math.min(width, height) * 0.3)
      const stiffness = 0.055
      const damp = 0.86
      /*
       * Смещение под курсором считаем позицией, а не силой. Сила здесь — плохая
       * идея: равновесие у пружины наступает при смещении `импульс / жёсткость`,
       * то есть буква не толкается, а улетает за пределы радиуса и там болтается.
       * Позиционный толчок так не срывается: у него есть потолок, и с уходом
       * курсора буква гарантированно возвращается в строку.
       */
      const maxPush = Math.min(34, Math.max(width, height) * 0.055)

      layouts.forEach((glyphs, phraseIdx) => {
        const local = scene - phraseIdx
        // Фраза живёт ровно свою треть скролла: раньше неё и позже неё рисовать нечего.
        if (local < -0.05 || local > 1.05) return

        // Сборка занимает первую половину окна, разлёт — конец; в середине фраза стоит целиком.
        const assemble = clamp((local - 0.08) / 0.42, 0, 1)
        const alpha = local < 0.08 ? local / 0.08 : local > 0.86 ? Math.max(0, 1 - (local - 0.86) / 0.19) : 1
        if (alpha <= 0.01) return

        ctx.save()
        ctx.globalAlpha = alpha
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        for (const glyph of glyphs) {
          // Каждая буква приходит чуть позже предыдущей: фраза читается как фраза, а не как вспышка.
          const staggered = clamp((assemble - glyph.order * 0.012) / (1 - glyph.order * 0.012 || 1), 0, 1)
          const settled = easeOutCubic(staggered)
          let targetX = glyph.x + glyph.scatterX * (1 - settled)
          let targetY = glyph.y + glyph.scatterY * (1 - settled)

          if (pointer.active) {
            const dx = glyph.px - pointer.x
            const dy = glyph.py - pointer.y
            const distance = Math.hypot(dx, dy) || 1
            if (distance < repelRadius) {
              const push = (1 - distance / repelRadius) ** 2 * maxPush
              targetX += (dx / distance) * push
              targetY += (dy / distance) * push
            }
          }

          glyph.vx += (targetX - glyph.px) * stiffness
          glyph.vy += (targetY - glyph.py) * stiffness
          glyph.vx *= damp
          glyph.vy *= damp
          glyph.px += glyph.vx * dt
          glyph.py += glyph.vy * dt

          // Крен по скорости: буква наклоняется в сторону движения, как от порыва.
          const wanted = clamp(glyph.vx * 0.012 + glyph.vy * 0.003, -0.2, 0.2)
          glyph.rot += (wanted + glyph.scatterRot * (1 - settled) - glyph.rot) * 0.12

          ctx.save()
          ctx.translate(glyph.px, glyph.py)
          ctx.rotate(glyph.rot)
          ctx.font = `500 ${glyph.size}px ${glyph.serif ? SERIF : SANS}`
          ctx.fillStyle = glyph.accent ? paletteColor('color.accent.lime') : paletteColor('color.fg')
          ctx.fillText(glyph.char, 0, 0)
          ctx.restore()
        }

        ctx.restore()
      })

      // Точка покоя под курсором: подсказывает, что буквы реагируют именно на него.
      if (pointer.active) {
        ctx.beginPath()
        ctx.arc(pointer.x, pointer.y, 2.5, 0, Math.PI * 2)
        ctx.fillStyle = paletteRgba('color.accent.cyan', 0.5)
        ctx.fill()
      }
    },
    [],
  )

  useEffect(() => {
    if (reduced) return
    const node = canvas.current
    const box = stage.current
    if (!node || !box) return

    const resize = () => {
      const rect = box.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP)
      state.current.width = rect.width
      state.current.height = rect.height
      node.width = Math.round(rect.width * dpr)
      node.height = Math.round(rect.height * dpr)
      const ctx = node.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const measurer = makeMeasurer(ctx)
      // Раскладка зависит от размера блока, поэтому пересобирается вместе с ним.
      state.current.layouts = PHRASES.map((phrase) => layoutPhrase(phrase, rect.width, rect.height, measurer))
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(box)
    return () => observer.disconnect()
  }, [reduced])

  useRafLoop(
    (delta) => {
      // При reduced-motion канваса нет: секция отдана обычной типографике.
      if (reduced) return
      const scene = clamp(scrollYProgress.get(), 0, 1) * PHRASES.length
      state.current.scene = scene
      paint(delta)

      const next = clamp(Math.floor(scene), 0, PHRASES.length - 1)
      if (next !== phraseIndex) setPhraseIndex(next)
    },
    { target: stage, enabled: !reduced },
  )

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const node = canvas.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    state.current.pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top, active: true }
    setPointerActive((prev) => (prev ? prev : true))
  }

  const clearPointer = () => {
    state.current.pointer.active = false
    setPointerActive(false)
  }

  return (
    <section id="noise" aria-labelledby="noise-title" className="relative border-t border-line/60">
      <div
        ref={wrapper}
        className={reduced ? 'u-container py-2xl' : 'h-[280svh]'}
      >
        <div
          className={
            reduced
              ? ''
              : 'sticky top-0 flex h-[100svh] items-center'
          }
        >
          <div className="u-container w-full">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <ScrambleText text="008 — Шум" className="kicker" />
              <p className="font-mono text-[10px] tracking-[0.18em] text-fg-faint uppercase">
                скролл собирает фразу · курсор разгоняет буквы
              </p>
            </div>

            <h2
              id="noise-title"
              className="mt-md max-w-[24ch] text-title leading-[1.02] font-medium tracking-[-0.02em]"
            >
              Шум — это материал. Другого у внимания нет.
            </h2>

            {reduced ? (
              /* reduced-motion: никакого канваса и физики — те же три фразы обычным текстом. */
              <div className="mt-xl flex flex-col gap-xl">
                {PHRASES.map((phrase) => (
                  <figure key={phrase.caption}>
                    <p className="text-display leading-[0.98] font-medium tracking-[-0.03em] uppercase">
                      {phrase.lines.map((line, lineIndex) => (
                        <span key={lineIndex} className="block">
                          {line.map((segment) =>
                            segment.serif ? (
                              <span key={segment.text} className="text-display normal-case italic text-accent-lime">
                                {segment.text}
                              </span>
                            ) : (
                              <span key={segment.text}>{segment.text}</span>
                            ),
                          )}
                        </span>
                      ))}
                    </p>
                    <figcaption className="mt-md max-w-[46ch] font-mono text-[10px] leading-relaxed tracking-[0.14em] text-fg-faint uppercase">
                      {phrase.caption}
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <div
                ref={stage}
                onPointerMove={onPointerMove}
                onPointerLeave={clearPointer}
                data-cursor="поток"
                data-phrase={phraseIndex}
                data-pointer={pointerActive ? 'active' : 'idle'}
                className="relative mt-xl h-[clamp(20rem,48vh,32rem)] cursor-crosshair touch-pan-y overflow-hidden border border-line/60 bg-surface/30"
              >
                <div className="grid-lines pointer-events-none absolute inset-0 opacity-25" aria-hidden="true" />
                <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-hidden="true" />
                <p
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-line/40 px-4 py-3 font-mono text-[10px] leading-relaxed tracking-[0.14em] text-fg-faint uppercase"
                >
                  {PHRASES[phraseIndex]?.caption}
                </p>
              </div>
            )}

            {/* Текстовая версия: содержимое секции не должно зависеть от canvas. */}
            <ul className="sr-only">
              {PHRASES.map((phrase) => (
                <li key={phrase.caption}>
                  {phrase.lines.map((line) => line.map((segment) => segment.text).join(' ')).join(' ')} — {phrase.caption}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
