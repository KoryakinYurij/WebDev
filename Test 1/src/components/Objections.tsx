import { useRef, useState } from 'react'
import { motion, useScroll, useSpring } from 'motion/react'
import { useMotionPrefs } from '../lib/motion-config'
import { easeOutExpo } from '../lib/bezier'
import { Reveal, ScrambleText } from './ui/Reveal'

const ITEMS = [
  {
    q: 'Это же просто расслабление?',
    verdict: 'побочный эффект, а не цель',
    a: 'Расслабление здесь побочный эффект. Задача — удержать один объект, когда внимание требует уйти. Нагрузка растёт от фазы к фазе, и это чувствуется как усталость, а не как покой.',
  },
  {
    q: 'Я не умею останавливать мысли',
    verdict: 'их и не нужно останавливать',
    a: 'Не нужно. Мысли — это шум, который фиксируется и отпускается. Навык измеряется не отсутствием мыслей, а временем между уходом и возвратом.',
  },
  {
    q: 'У меня нет сорока минут',
    verdict: 'полная сессия — не первая ступень',
    a: 'Полная сессия — последний протокол в программе, а не первый. Есть техники на девять и двенадцать минут; они тренируют тот же навык на меньшей дистанции.',
  },
  {
    q: 'Чем это отличается от таймера в приложении',
    verdict: 'таймер считает время, здесь считается качество',
    a: 'Таймер отсчитывает время и ничего не говорит о качестве. Здесь есть метрика: доля времени, когда линия держалась. Двенадцать минут с четырьмя возвратами — лучше, чем сорок минут, из которых тридцать прошли во сне.',
  },
  {
    q: 'Если не получается неделю',
    verdict: 'нагрузка выбрана неверно',
    a: 'Значит нагрузка выбрана неверно. Спускайся на одну ступень по шкале — с пятёрки на третью, с тридцати минут на пятнадцать. Программа рассчитана на месяцы, а не на один вечер.',
  },
]

type Item = (typeof ITEMS)[number]

/**
 * 009 — Возражения.
 *
 * Прежний формат был списком с раскрытием: пять строк, которые можно и не открыть,
 * то есть текст без субстрата. Теперь это табло вердиктов, и движение здесь трёхслойное:
 * подчёркивание дорисовывается самим скроллом (строка «снимается», когда поднимается
 * в зону чтения), штамп «снято» появляется от действия читателя, а счётчик слева считает,
 * сколько возражений снято. Возражение, которое снял сам, весит больше того,
 * которое закрыли за тебя.
 *
 * Раскрытие осталось прежним — `grid-template-rows: 0fr → 1fr`: высота не измеряется
 * руками, поэтому ответ любой длины не ломает переход.
 */
function ObjectionRow({
  item,
  index,
  open,
  onToggle,
  reduced,
}: {
  item: Item
  index: number
  open: boolean
  onToggle: () => void
  reduced: boolean
}) {
  const row = useRef<HTMLLIElement>(null)

  /*
   * Подчёркивание привязано к позиции строки, а не к факту входа во вьюпорт:
   * прогресс 0 — строка только показалась снизу, 1 — встала в зону чтения.
   * Так линия движется вместе со скроллом и в обратную сторону тоже.
   */
  const { scrollYProgress } = useScroll({ target: row, offset: ['start end', 'start 0.55'] })
  const smoothed = useSpring(scrollYProgress, { stiffness: 140, damping: 26, mass: 0.4 })
  const strike = reduced ? 1 : smoothed

  return (
    <li ref={row} data-open={open ? 'true' : 'false'} className="group/row relative border-b border-line/60">
      {/* Реакция на курсор — линия по левому краю, а не раскрытие по наведению:
          при скролле строка сама проезжает под неподвижным курсором, и авто-раскрытие
          превращается в неуправляемое мигание. */}
      <span
        aria-hidden="true"
        className={`absolute top-0 left-0 h-full w-px origin-center bg-accent-lime transition-transform duration-500 ease-out group-hover/row:scale-y-100 ${
          open ? 'scale-y-100' : 'scale-y-0'
        }`}
      />

      <Reveal distance={14} amount={0.5} delay={index * 0.04}>
        <h3>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`objection-${index}`}
            onClick={onToggle}
            className="group flex w-full items-start gap-4 pt-5 pb-5 pl-5 text-left"
          >
            <span
              className={`mt-1 font-mono text-[10px] tabular-nums transition-colors duration-300 ${
                open ? 'text-accent-lime' : 'text-fg-faint'
              }`}
            >
              {String(index + 1).padStart(2, '0')}
            </span>

            <span className="flex-1">
              <span
                className={`block text-heading leading-tight font-medium transition-colors duration-300 ${
                  open ? 'text-fg' : 'text-fg-dim'
                }`}
              >
                {item.q}
              </span>

              {/* Вердикт-подчёркивание: дорисовывается скроллом, поэтому читается
                  как «возражение закрывается», а не как декоративная линия. */}
              <span aria-hidden="true" className="relative mt-3 block h-px w-full overflow-hidden bg-line/50">
                <motion.span
                  data-strike=""
                  className="absolute inset-0 block origin-left bg-accent-lime"
                  style={{ scaleX: strike }}
                />
              </span>

              <span className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <span className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">{item.verdict}</span>
                {/* Штамп занимает место и в закрытом состоянии: раскрытие не сдвигает текст. */}
                <motion.span
                  aria-hidden="true"
                  initial={false}
                  animate={{ opacity: open ? 1 : 0, scale: open ? 1 : 0.86, rotate: open ? -4 : 0 }}
                  transition={{ duration: 0.32, ease: easeOutExpo }}
                  className="border border-accent-lime/70 px-2 py-1 font-mono text-[9px] tracking-[0.2em] text-accent-lime uppercase"
                >
                  снято
                </motion.span>
              </span>
            </span>

            {/* Знак состояния: линия поворачивается, ничего не перерисовывая. */}
            <span aria-hidden="true" className="relative mt-2 h-3 w-3 shrink-0">
              <span className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-current text-fg-dim" />
              <span
                className={`absolute top-0 left-1/2 h-full w-px -translate-x-1/2 bg-current transition-transform duration-300 ease-out ${
                  open ? 'scale-y-0 text-accent-lime' : 'text-fg-dim'
                }`}
              />
            </span>
          </button>
        </h3>

        {/*
         * Регион обязан иметь имя, и оно обязано быть уникальным: без label axe
         * ругается на landmark-unique, а скринридер в списке ориентиров видит
         * пять безымянных «region». Имя = сам вопрос.
         */}
        <div
          id={`objection-${index}`}
          role="region"
          aria-label={item.q}
          className={`grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          }`}
        >
          <div className="overflow-hidden">
            <p
              className={`max-w-[64ch] pb-6 pl-12 text-body text-fg-dim transition-opacity duration-300 ${
                open ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {item.a}
            </p>
          </div>
        </div>
      </Reveal>
    </li>
  )
}

export function Objections() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)
  /* Снятое считается один раз: вернуться к ответу можно, но счётчик не накручивается. */
  const [dismissed, setDismissed] = useState<number[]>([0])
  const { reduced } = useMotionPrefs()

  const toggle = (index: number) => {
    setOpenIndex((previous) => (previous === index ? null : index))
    setDismissed((previous) => (previous.includes(index) ? previous : [...previous, index]))
  }

  return (
    <section id="objections" aria-labelledby="objections-title" className="relative border-t border-line/60">
      <div className="u-container grid gap-xl py-2xl lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)] lg:gap-2xl">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <ScrambleText text="009 — Возражения" className="kicker" />
          <h2 id="objections-title" className="mt-md text-title leading-[1.02] font-medium tracking-[-0.02em]">
            Пять причин не начинать — и что с каждой делать.
          </h2>
          <p className="mt-md max-w-[34ch] font-mono text-[10px] leading-relaxed tracking-[0.14em] text-fg-faint uppercase">
            нажми на строку — возражение снимается · клавиатура и курсор работают одинаково
          </p>

          {/* Счётчик снятых: единственная метрика блока и та же логика, что у всей программы, —
              важно не время чтения, а сколько возражений действительно закрыто. */}
          <div className="mt-lg max-w-[16rem]" data-objections-seen={dismissed.length}>
            <div className="flex items-baseline justify-between font-mono text-[10px] tracking-[0.18em] uppercase">
              <span className="text-fg-faint">снято</span>
              <span className="text-accent-lime tabular-nums">
                {dismissed.length} / {ITEMS.length}
              </span>
            </div>
            <div className="mt-2 h-px w-full bg-line/70" aria-hidden="true">
              <div
                className="h-px w-full origin-left bg-accent-lime transition-transform duration-500 ease-out"
                style={{ transform: `scaleX(${dismissed.length / ITEMS.length})` }}
              />
            </div>
          </div>
        </div>

        <ul className="border-t border-line/60">
          {ITEMS.map((item, index) => (
            <ObjectionRow
              key={item.q}
              item={item}
              index={index}
              open={openIndex === index}
              onToggle={() => toggle(index)}
              reduced={reduced}
            />
          ))}
        </ul>
      </div>
    </section>
  )
}
