import { motion } from 'motion/react'
import { VelocityBand } from './VelocityBand'
import { MagneticButton } from './ui/MagneticButton'
import { Reveal, RevealWords } from './ui/Reveal'
import { scrollToSection } from '../lib/smooth-scroll'
import { useMotionPrefs } from '../lib/motion-config'
import { emit } from '../lib/bus'
import { easeOutExpo, seconds, durations } from '../lib/bezier'

const LINKS = [
  { id: 'scale', label: 'Шкала протоколов' },
  { id: 'chronicle', label: 'Хроника сессии' },
  { id: 'field', label: 'Поле внимания' },
  { id: 'hold', label: 'Точка удержания' },
  { id: 'objections', label: 'Возражения' },
]

const STEPS = [
  { index: '01', text: 'Выбрать протокол по шкале — по времени, а не по обещаниям.' },
  { index: '02', text: 'Отработать его целиком, даже если на середине захочется встать.' },
  { index: '03', text: 'Записать возвраты. Следующая сессия сравнивается с этой, а не с чужой.' },
]

export function Footer() {
  const { reduced } = useMotionPrefs()

  return (
    <footer className="relative border-t border-line/60">
      <VelocityBand
        items={['Начать практику', 'Один объект', 'Держать линию', 'Считать возвраты']}
        direction={1}
        tone="solid"
        baseSpeed={54}
      />

      <div className="u-container grid gap-xl py-2xl lg:grid-cols-[minmax(0,6fr)_minmax(0,4fr)]">
        <div>
          <h2 className="text-display leading-[0.9] font-medium tracking-[-0.035em] uppercase">
            <RevealWords text="Следующая" />
            <span className="block text-display normal-case italic text-accent-lime">
              <RevealWords text="сессия" delay={0.08} />
            </span>
            <RevealWords text="через 0 минут" />
          </h2>

          <Reveal delay={0.16} className="mt-lg">
            <div className="flex flex-wrap items-center gap-3">
              <MagneticButton href="#hero" strength={0.38}>
                К началу программы
              </MagneticButton>
              <MagneticButton variant="outline" onClick={() => scrollToSection('scale')} strength={0.26}>
                Выбрать протокол
              </MagneticButton>
            </div>
          </Reveal>

          <Reveal delay={0.22} className="mt-xl">
            <p className="max-w-[52ch] text-body text-fg-dim">
              Здесь нет таймера дыхания, мантр и обещаний спокойствия. Есть поле внимания, которое можно измерить,
              и настройки движения — они открываются шестерёнкой в правом верхнем углу.
            </p>
          </Reveal>

          <Reveal delay={0.26} className="mt-lg">
            <button
              type="button"
              onClick={() => emit('settings', { open: true })}
              className="font-mono text-[10px] tracking-[0.18em] text-fg-dim uppercase underline decoration-line underline-offset-4 transition-colors duration-200 hover:text-accent-lime"
            >
              открыть настройки движения
            </button>
          </Reveal>
        </div>

        <div className="grid content-start gap-lg">
          <nav aria-label="Быстрые ссылки">
            <ul className="flex flex-col divide-y divide-line/60 border-y border-line/60">
              {LINKS.map((link) => (
                <li key={link.id}>
                  <a
                    href={`#${link.id}`}
                    onClick={(event) => {
                      event.preventDefault()
                      scrollToSection(link.id)
                    }}
                    className="group flex items-center justify-between py-3.5 transition-colors duration-200 hover:text-accent-lime"
                  >
                    <span className="font-mono text-[11px] tracking-[0.16em] uppercase">{link.label}</span>
                    <span
                      aria-hidden="true"
                      className="inline-block transition-transform duration-300 ease-out group-hover:translate-x-1"
                    >
                      →
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Порядок действий вместо списка репозиториев: подвал закрывает страницу делом, а не отчётностью. */}
          <Reveal delay={0.12} distance={16}>
            <div>
              <p className="kicker">как начать</p>
              <ol className="mt-sm space-y-3">
                {STEPS.map((step) => (
                  <li key={step.index} className="flex gap-3">
                    <span className="font-mono text-[10px] text-accent-lime tabular-nums">{step.index}</span>
                    <span className="font-mono text-[10px] leading-relaxed text-fg-faint">{step.text}</span>
                  </li>
                ))}
              </ol>
            </div>
          </Reveal>
        </div>
      </div>

      <div className="u-container flex flex-wrap items-center justify-between gap-4 border-t border-line/60 py-lg">
        <span className="font-mono text-[10px] tracking-[0.18em] text-fg-faint uppercase">
          mindfield · {new Date().getFullYear()} · практика внимания без таймеров
        </span>
        <motion.button
          type="button"
          onClick={() => scrollToSection('hero')}
          className="font-mono text-[10px] tracking-[0.18em] text-fg-dim uppercase transition-colors duration-200 hover:text-accent-lime"
          whileHover={reduced ? undefined : { y: -2 }}
          transition={{ duration: seconds(durations.fast), ease: easeOutExpo }}
        >
          наверх ↑
        </motion.button>
      </div>
    </footer>
  )
}
