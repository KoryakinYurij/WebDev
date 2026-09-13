import { useMemo, useRef, useState } from 'react'
import { motion, useScroll } from 'motion/react'
import { Reveal, ScrambleText } from './ui/Reveal'
import { useMotionPrefs } from '../lib/motion-config'
import { easeOutExpo, seconds, durations } from '../lib/bezier'

type Kind = 'start' | 'drift' | 'hold' | 'end'

type Entry = {
  time: string
  label: string
  note: string
  kind: Kind
  /** Сколько секунд длилось удержание до этой отметки */
  held?: number
}

const LOG: readonly Entry[] = [
  {
    time: '00:00',
    label: 'вход',
    note: 'Один объект — ощущение опоры в груди. Отмечаю вслух: «начал».',
    kind: 'start',
  },
  {
    time: '01:12',
    label: 'уход',
    note: 'Всплыл разговор на завтра. Замечен на втором предложении, а не на десятом.',
    kind: 'drift',
    held: 72,
  },
  {
    time: '03:40',
    label: 'удержание',
    note: 'Объект держится без усилия. Это не результат — это середина первого отрезка.',
    kind: 'hold',
  },
  {
    time: '07:05',
    label: 'уход',
    note: 'Тело: затекло плечо. Внимание ушло в ощущение, но вернулось без борьбы.',
    kind: 'drift',
    held: 205,
  },
  {
    time: '11:48',
    label: 'плато',
    note: 'Самый неудобный участок: ничего не происходит, и хочется прекратить.',
    kind: 'hold',
  },
  {
    time: '16:20',
    label: 'уход',
    note: 'Не мысль, а сонливость. Зафиксирован как шум, а не как ошибка.',
    kind: 'drift',
    held: 272,
  },
  {
    time: '22:04',
    label: 'расширение',
    note: 'Шум возвращён в поле целиком. Линия не потеряна — это рабочий результат.',
    kind: 'hold',
  },
  {
    time: '31:30',
    label: 'уход',
    note: 'Проверка времени. Единственный раз за сессию, когда я посмотрел на часы.',
    kind: 'drift',
    held: 566,
  },
  {
    time: '40:00',
    label: 'выход',
    note: 'Сессия закрыта по плану, а не по желанию. Следующая — не раньше завтрашнего утра.',
    kind: 'end',
  },
] as const

const KIND_LABEL: Record<Kind, string> = {
  start: 'вход',
  drift: 'возврат',
  hold: 'удержание',
  end: 'выход',
}

const KIND_COLOR: Record<Kind, string> = {
  start: 'text-fg-faint',
  drift: 'text-accent-magenta',
  hold: 'text-accent-lime',
  end: 'text-accent-cyan',
}

const formatHold = (value: number) => `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`

/**
 * 006 — Хроника.
 *
 * Одна честная сессия на 40 минут, разложенная по событиям. Смысл блока —
 * показать, что «возврат» это нормальная единица работы, а не провал.
 *
 * Прогресс рельса считается через `useScroll` (только transform, никакого main-thread
 * на каждый кадр), поэтому здесь нет ни одного GSAP-триггера — и не должно быть.
 */
export function Chronicle() {
  const root = useRef<HTMLElement>(null)
  const rail = useRef<HTMLDivElement>(null)
  const [onlyDrift, setOnlyDrift] = useState(false)
  const { reduced } = useMotionPrefs()

  const { scrollYProgress } = useScroll({ target: rail, offset: ['start 0.85', 'end 0.45'] })

  const visible = useMemo(() => (onlyDrift ? LOG.filter((entry) => entry.kind === 'drift') : LOG), [onlyDrift])
  const holds = LOG.flatMap((entry) => (entry.held ? [entry.held] : []))
  const returns = holds.length
  const longest = Math.max(...holds)
  const average = Math.round(holds.reduce((sum, value) => sum + value, 0) / holds.length)

  return (
    <section ref={root} id="chronicle" aria-labelledby="chronicle-title" className="relative border-t border-line/60">
      <div className="u-container py-2xl">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <ScrambleText text="006 — Хроника" className="kicker" />
            <h2
              id="chronicle-title"
              className="mt-md max-w-[24ch] text-title leading-[1.02] font-medium tracking-[-0.02em]"
            >
              Одна сессия целиком. Четыре возврата — это хороший результат.
            </h2>
          </div>

          {/* Фильтр — не украшение: он и есть главный тезис блока. */}
          <div
            role="group"
            aria-label="Фильтр событий"
            className="flex items-center gap-px border border-line/60 p-1"
          >
            {[
              { key: false, label: 'всё' },
              { key: true, label: 'только возвраты' },
            ].map((option) => {
              const isActive = option.key === onlyDrift
              return (
                <button
                  key={String(option.key)}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setOnlyDrift(option.key)}
                  className={`relative rounded-pill px-3.5 py-2 font-mono text-[10px] tracking-[0.16em] uppercase transition-colors duration-200 ${
                    isActive ? 'text-ink' : 'text-fg-dim hover:text-fg'
                  }`}
                >
                  {isActive ? (
                    <motion.span
                      layoutId="chronicle-filter"
                      className="absolute inset-0 rounded-pill bg-accent-lime"
                      transition={{ duration: seconds(durations.fast), ease: easeOutExpo }}
                    />
                  ) : null}
                  <span className="relative z-10">{option.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-xl grid gap-lg lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] lg:gap-2xl">
          <div ref={rail} className="relative pl-8 sm:pl-12">
            {/* Рельс: серый след на всю высоту и поверх него заливка по скроллу. */}
            <div className="absolute top-1 bottom-1 left-[3px] w-px bg-line/60 sm:left-[7px]" aria-hidden="true">
              <motion.div
                className="h-full w-px origin-top bg-accent-lime"
                style={{ scaleY: reduced ? 1 : scrollYProgress }}
              />
            </div>

            <ol className="flex flex-col">
              {visible.map((entry) => (
                <li key={entry.time}>
                  <Reveal distance={14} amount={0.4}>
                    <div className="group relative border-b border-line/40 py-4">
                      <span
                        aria-hidden="true"
                        className={`absolute top-[1.55rem] -left-8 h-1.5 w-1.5 rounded-full sm:-left-12 ${
                          entry.kind === 'drift'
                            ? 'bg-accent-magenta'
                            : entry.kind === 'hold'
                              ? 'bg-accent-lime'
                              : 'bg-line'
                        }`}
                      />

                      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                        <span className="font-mono text-[11px] text-fg tabular-nums">{entry.time}</span>
                        <span
                          className={`font-mono text-[10px] tracking-[0.18em] uppercase ${KIND_COLOR[entry.kind]}`}
                        >
                          {KIND_LABEL[entry.kind]}
                        </span>
                        {entry.held ? (
                          <span className="font-mono text-[10px] text-fg-faint tabular-nums">
                            держал {formatHold(entry.held)}
                          </span>
                        ) : null}
                      </div>

                      {/* Сдвиг по наведению — transform: строка не меняет высоту и не толкает список. */}
                      <p className="mt-1.5 max-w-[62ch] text-body text-fg-dim transition-transform duration-300 ease-out group-hover:translate-x-1.5 group-focus-within:translate-x-1.5">
                        {entry.note}
                      </p>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ol>

            <p className="sr-only" aria-live="polite">
              Показано событий: {visible.length} из {LOG.length}
            </p>
          </div>

          <aside className="lg:sticky lg:top-28 lg:self-start">
            <dl className="divide-y divide-line/50 border-y border-line/50">
              <Stat label="возвратов" value={String(returns)} />
              <Stat label="длиннейшее удержание" value={formatHold(longest)} />
              <Stat label="среднее удержание" value={formatHold(average)} />
              <Stat label="время сессии" value="40:00" />
            </dl>
            <p className="mt-md max-w-[34ch] text-body text-fg-dim">
              Возврат засчитывается как событие, а не как ошибка. Сессия, где возвратов ноль, обычно означает,
              что внимание просто не проверялось.
            </p>
            <p className="mt-md font-mono text-[10px] leading-relaxed tracking-[0.14em] text-fg-faint uppercase">
              четыре отметки на сорок минут — рабочий темп
            </p>
          </aside>
        </div>
      </div>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">{label}</dt>
      <dd className="font-mono text-[13px] text-fg tabular-nums">{value}</dd>
    </div>
  )
}
