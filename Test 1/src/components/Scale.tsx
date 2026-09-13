import { useRef, useState } from 'react'
import { motion, useInView } from 'motion/react'
import {
  ACCENT_CSS,
  MAX_MINUTES,
  PROTOCOLS,
  TOTAL_MINUTES,
  type Protocol,
} from '../data/protocols'
import { Reveal, ScrambleText } from './ui/Reveal'
import { useMotionPrefs } from '../lib/motion-config'
import { easeOutExpo, revealSeconds, seconds, durations } from '../lib/bezier'

/*
 * Одна общая сетка на все строки и на ось.
 * Ось обязана совпадать с дорожками до пикселя, поэтому это не «похожая» разметка,
 * а буквально тот же набор колонок — иначе подписи 10/20/30 минут врут.
 */
const ROW =
  'grid grid-cols-[1.75rem_minmax(0,6.5rem)_minmax(0,1fr)_2.25rem] items-center gap-3 sm:grid-cols-[2.25rem_minmax(0,10rem)_minmax(0,1fr)_3rem]'

/**
 * 005 — Шкала.
 *
 * Блок отвечает на вопрос «что вообще входит в программу»: двенадцать протоколов
 * на одной оси длительности. Раньше это заявление жило в тексте («12 протоколов»),
 * а подтверждать его было нечем.
 *
 * Тон намеренно тот же, что у 004: линейка, моно-подписи, никаких карточек и теней.
 */
export function Scale() {
  const [selectedId, setSelectedId] = useState(PROTOCOLS[0].id)
  const listRef = useRef<HTMLDivElement>(null)
  const inView = useInView(listRef, { once: true, amount: 0.12 })
  const { reduced } = useMotionPrefs()

  const selected: Protocol = PROTOCOLS.find((protocol) => protocol.id === selectedId) ?? PROTOCOLS[0]
  const ticks = [0, 10, 20, 30, MAX_MINUTES]

  return (
    <section id="scale" aria-labelledby="scale-title" className="relative border-t border-line/60">
      <div className="u-container py-2xl">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <ScrambleText text="005 — Шкала" className="kicker" />
            <h2
              id="scale-title"
              className="mt-md max-w-[22ch] text-title leading-[1.02] font-medium tracking-[-0.02em]"
            >
              Двенадцать протоколов на одной оси. Выбирать есть из чего.
            </h2>
          </div>
          <dl className="flex items-baseline gap-6">
            <div>
              <dt className="font-mono text-[10px] tracking-[0.18em] text-fg-faint uppercase">суммарно</dt>
              <dd className="mt-1 font-mono text-[15px] text-accent-lime tabular-nums">{TOTAL_MINUTES} мин</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] tracking-[0.18em] text-fg-faint uppercase">в программе</dt>
              <dd className="mt-1 font-mono text-[15px] text-fg tabular-nums">{PROTOCOLS.length}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-xl grid gap-xl lg:grid-cols-[minmax(0,4fr)_minmax(0,6fr)] lg:gap-2xl">
          {/* Читалка: обновляется по курсору и по фокусу — состояние одно, источников ввода много. */}
          <div className="lg:sticky lg:top-28 lg:self-start">
            <motion.div
              key={selected.id}
              initial={reduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: seconds(durations.base), ease: easeOutExpo }}
            >
              <p className="font-mono text-[10px] tracking-[0.2em] text-fg-faint uppercase">
                {selected.index} / {String(PROTOCOLS.length).padStart(2, '0')}
              </p>

              <h3 className="mt-sm text-display leading-[0.95] font-medium tracking-[-0.03em] uppercase">
                {selected.name}
              </h3>

              <p className="mt-md max-w-[42ch] text-body text-fg-dim">{selected.body}</p>

              <dl className="mt-lg divide-y divide-line/50 border-y border-line/50">
                <Row label="длительность" value={`${selected.minutes} мин`} />
                <Row label="нагрузка" value={`${selected.load} / 5`} />
                <Row
                  label="в разборе"
                  value={selected.featured ? 'подробно' : 'в шкале'}
                />
              </dl>

              <div className="mt-md flex gap-1.5" aria-hidden="true">
                {[1, 2, 3, 4, 5].map((level) => (
                  <span
                    key={level}
                    className="h-[3px] flex-1 transition-colors duration-300"
                    style={{
                      backgroundColor: level <= selected.load ? ACCENT_CSS[selected.colour] : 'var(--color-line)',
                    }}
                  />
                ))}
              </div>
            </motion.div>
          </div>

          {/* Сама шкала */}
          <Reveal delay={0.08} distance={16}>
            <div ref={listRef}>
              <div className={`${ROW} border-b border-line/60 pb-2`}>
                <span />
                <span className="text-right font-mono text-[9px] tracking-[0.18em] text-fg-faint uppercase">минут</span>
                <span className="relative block h-3" aria-hidden="true">
                  {ticks.map((tick) => (
                    <span
                      key={tick}
                      className="absolute top-0 -translate-x-1/2 font-mono text-[9px] text-fg-faint tabular-nums"
                      style={{ left: `${(tick / MAX_MINUTES) * 100}%` }}
                    >
                      {tick}
                    </span>
                  ))}
                </span>
                <span />
              </div>

              <ul className="relative" aria-label="Протоколы программы">
                {PROTOCOLS.map((protocol, index) => {
                  const isSelected = protocol.id === selected.id
                  return (
                    <li key={protocol.id} className="relative">
                      {/* Общий элемент между строками: Motion сам считает переезд, без ручных delay. */}
                      {isSelected ? (
                        <motion.span
                          layoutId="scale-marker"
                          className="absolute inset-y-0 left-0 w-px bg-accent-lime"
                          transition={{ duration: seconds(durations.fast), ease: easeOutExpo }}
                          aria-hidden="true"
                        />
                      ) : null}

                      <button
                        type="button"
                        onPointerEnter={() => setSelectedId(protocol.id)}
                        onFocus={() => setSelectedId(protocol.id)}
                        onClick={() => setSelectedId(protocol.id)}
                        aria-pressed={isSelected}
                        data-cursor={protocol.name}
                        className={`${ROW} w-full border-b border-line/40 py-2.5 text-left transition-colors duration-300 ${
                          isSelected ? 'text-fg' : 'text-fg-dim hover:text-fg'
                        }`}
                      >
                        <span className="font-mono text-[10px] text-fg-faint tabular-nums">{protocol.index}</span>
                        <span className="truncate font-mono text-[11px] tracking-[0.1em] uppercase">
                          {protocol.name}
                        </span>

                        <span className="relative block h-[2px] w-full bg-line/50" aria-hidden="true">
                          <motion.span
                            className="absolute inset-y-0 left-0 block w-full origin-left"
                            style={{ backgroundColor: ACCENT_CSS[protocol.colour] }}
                            initial={false}
                            animate={{
                              scaleX: reduced || inView ? protocol.minutes / MAX_MINUTES : 0,
                              opacity: isSelected ? 1 : 0.55,
                            }}
                            transition={{
                              duration: revealSeconds,
                              delay: 0.06 + index * 0.035,
                              ease: easeOutExpo,
                            }}
                          />
                        </span>

                        <span className="text-right font-mono text-[10px] text-fg-faint tabular-nums">
                          {protocol.minutes}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>

              <p className="mt-md font-mono text-[10px] leading-relaxed tracking-[0.14em] text-fg-faint uppercase">
                длина полосы — время сессии · цвет — группа нагрузки
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">{label}</dt>
      <dd className="font-mono text-[11px] text-fg tabular-nums">{value}</dd>
    </div>
  )
}
