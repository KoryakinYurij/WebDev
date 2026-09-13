import { VelocityBand } from './VelocityBand'
import { Reveal, RevealWords, ScrambleText } from './ui/Reveal'

const SPEC = [
  { key: 'Протоколов', value: '12', note: 'от 8 до 30 минут' },
  { key: 'Уровень', value: '04', note: 'без эзотерики и ритуалов' },
  { key: 'Единица работы', value: 'внимание', note: 'не расслабление' },
  { key: 'Индикатор', value: 'когерентность', note: 'считается в реальном времени' },
]

export function Manifest() {
  return (
    <section id="manifest" aria-labelledby="manifest-title" className="relative">
      <VelocityBand
        items={['Внимание', 'Тишина', 'Ясность', 'Намерение', 'Терпение', 'Наблюдение']}
        direction={1}
        tone="solid"
      />

      <div className="u-container grid gap-xl py-2xl lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] lg:gap-2xl">
        <div>
          <ScrambleText text="001 — Манифест" className="kicker" />

          <h2
            id="manifest-title"
            className="mt-lg max-w-[22ch] text-display leading-[0.94] font-medium tracking-[-0.03em] uppercase"
          >
            <RevealWords text="Медитация — это не покой." />
            <span className="block text-display leading-[0.94] font-normal normal-case italic text-accent-lime">
              <RevealWords text="Это работа." />
            </span>
          </h2>

          <Reveal delay={0.1} className="mt-xl max-w-[54ch] text-body text-fg-dim">
            <p>
              Расслабленность — побочный эффект, а не цель. Мы тренируем способность удерживать один объект, когда
              внимание требует уйти. Нагрузка здесь настоящая: как в зале, только вместо мышцы — фокус.
            </p>
          </Reveal>

          <Reveal delay={0.18} className="mt-lg max-w-[54ch] text-body text-fg-dim">
            <p>
              Никаких таймеров, мантр и обещаний спокойствия. Каждый протокол — это задача с измеримым результатом:
              сколько времени ты продержал линию и что сбило.
            </p>
          </Reveal>
        </div>

        {/* Спецификация вместо анимированных счётчиков: цифры здесь несут смысл и приходят без задержки. */}
        <Reveal delay={0.24} distance={18}>
          <dl className="divide-y divide-line/60 border-y border-line/60">
            {SPEC.map((row) => (
              <div key={row.key} className="flex items-baseline justify-between gap-4 py-4">
                <dt className="font-mono text-[10px] tracking-[0.18em] text-fg-faint uppercase">{row.key}</dt>
                <dd className="text-right">
                  <span className="block text-heading leading-none font-medium">{row.value}</span>
                  <span className="mt-1 block font-mono text-[10px] text-fg-faint">{row.note}</span>
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>

      {/* Вторая лента внизу секции: сверху обе ленты видны только в узком окне скролла. */}
      <VelocityBand
        items={['Mindfield', 'No breathing timer', 'One object', 'Hold the line', 'Do not relax']}
        direction={-1}
        baseSpeed={30}
        tone="outline"
      />
    </section>
  )
}
