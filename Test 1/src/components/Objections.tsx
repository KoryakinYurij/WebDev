import { useState } from 'react'
import { Reveal, ScrambleText } from './ui/Reveal'

const ITEMS = [
  {
    q: 'Это же просто расслабление?',
    a: 'Расслабление здесь побочный эффект. Задача — удержать один объект, когда внимание требует уйти. Нагрузка растёт от фазы к фазе, и это чувствуется как усталость, а не как покой.',
  },
  {
    q: 'Я не умею останавливать мысли',
    a: 'Не нужно. Мысли — это шум, который фиксируется и отпускается. Навык измеряется не отсутствием мыслей, а временем между уходом и возвратом.',
  },
  {
    q: 'У меня нет сорока минут',
    a: 'Полная сессия — последний протокол в программе, а не первый. Есть техники на девять и двенадцать минут; они тренируют тот же навык на меньшей дистанции.',
  },
  {
    q: 'Чем это отличается от таймера в приложении',
    a: 'Таймер отсчитывает время и ничего не говорит о качестве. Здесь есть метрика: доля времени, когда линия держалась. Двенадцать минут с четырьмя возвратами — лучше, чем сорок минут, из которых тридцать прошли во сне.',
  },
  {
    q: 'Если не получается неделю',
    a: 'Значит нагрузка выбрана неверно. Спускайся на одну ступень по шкале — с пятёрки на третью, с тридцати минут на пятнадцать. Программа рассчитана на месяцы, а не на один вечер.',
  },
]

/**
 * 009 — Возражения.
 *
 * Последний блок перед подвалом отвечает на то, что читатель уже подумал про себя.
 * Раскрытие — через `grid-template-rows: 0fr → 1fr`: высота не анимируется руками
 * и не требует замера scrollHeight, поэтому текст любой длины не ломает переход.
 */
export function Objections() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section id="objections" aria-labelledby="objections-title" className="relative border-t border-line/60">
      <div className="u-container grid gap-xl py-2xl lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)] lg:gap-2xl">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <ScrambleText text="009 — Возражения" className="kicker" />
          <h2 id="objections-title" className="mt-md text-title leading-[1.02] font-medium tracking-[-0.02em]">
            Пять причин не начинать — и что с каждой делать.
          </h2>
          <p className="mt-md max-w-[34ch] font-mono text-[10px] leading-relaxed tracking-[0.14em] text-fg-faint uppercase">
            открывается по одному · клавиатура и курсор работают одинаково
          </p>
        </div>

        <ul className="border-t border-line/60">
          {ITEMS.map((item, index) => {
            const open = openIndex === index
            return (
              <li key={item.q} className="group/row relative border-b border-line/60">
                {/* Реакция на курсор — тонкая линия по левому краю, а не раскрытие по наведению:
                    при скролле пункт сам проезжает под неподвижным курсором, и авто-раскрытие
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
                    onClick={() => setOpenIndex(open ? null : index)}
                    className="group flex w-full items-baseline gap-4 py-5 pl-5 text-left"
                  >
                    <span
                      className={`font-mono text-[10px] tabular-nums transition-colors duration-300 ${
                        open ? 'text-accent-lime' : 'text-fg-faint'
                      }`}
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>

                    <span
                      className={`flex-1 text-heading leading-tight font-medium transition-transform duration-300 ease-out group-hover:translate-x-1 ${
                        open ? 'text-fg' : 'text-fg-dim'
                      }`}
                    >
                      {item.q}
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

                <div
                  id={`objection-${index}`}
                  role="region"
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
          })}
        </ul>
      </div>
    </section>
  )
}
