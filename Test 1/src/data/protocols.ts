/**
 * Двенадцать протоколов программы — единственный источник правды.
 *
 * `featured` отмечает шесть из них с подробным описанием: их показывает блок «Техники».
 * Остальные попадают только на шкалу нагрузки. Так список не дублируется по компонентам
 * и «12 протоколов» из заголовка героя не расходится с тем, что видно на странице.
 */
export type ProtocolColour = 'lime' | 'cyan' | 'indigo' | 'magenta'

export type Protocol = {
  id: string
  index: string
  name: string
  /** Длительность сессии в минутах */
  minutes: number
  /** Нагрузка на удержание, 1–5 */
  load: number
  body: string
  colour: ProtocolColour
  featured?: boolean
}

export const PROTOCOLS: readonly Protocol[] = [
  {
    id: 'anchor',
    index: '01',
    name: 'Якорь',
    minutes: 12,
    load: 2,
    body: 'Один объект — ощущение опоры. Возврат отмечается вслух: повторение, а не провал.',
    colour: 'lime',
    featured: true,
  },
  {
    id: 'scan',
    index: '02',
    name: 'Скан',
    minutes: 18,
    load: 3,
    body: 'Внимание идёт по фиксированному маршруту. Никаких оценок — отметка и переход дальше.',
    colour: 'cyan',
    featured: true,
  },
  {
    id: 'open-field',
    index: '03',
    name: 'Открытое поле',
    minutes: 25,
    load: 4,
    body: 'Объект один — всё, что появляется. Удержание без выбора: предпочтение уже потеря.',
    colour: 'indigo',
    featured: true,
  },
  {
    id: 'labels',
    index: '04',
    name: 'Метки',
    minutes: 10,
    load: 2,
    body: 'Каждой мысли — ярлык и отпускание. Скорость ярлыков и есть показатель навыка.',
    colour: 'magenta',
    featured: true,
  },
  {
    id: 'noise',
    index: '05',
    name: 'Протокол шума',
    minutes: 30,
    load: 5,
    body: 'Намеренно включаем отвлечения и работаем внутри них. Самая тяжёлая нагрузка.',
    colour: 'lime',
    featured: true,
  },
  {
    id: 'metta',
    index: '06',
    name: 'Метта',
    minutes: 20,
    load: 3,
    body: 'Направленное намерение как объект. Та же дисциплина, но без «пустоты».',
    colour: 'cyan',
    featured: true,
  },
  {
    id: 'supports',
    index: '07',
    name: 'Опоры',
    minutes: 15,
    load: 3,
    body: 'Несколько объектов вместо одного. Проверка: держится ли линия, когда точек внимания больше.',
    colour: 'indigo',
  },
  {
    id: 'interval',
    index: '08',
    name: 'Интервал',
    minutes: 22,
    load: 4,
    body: 'Работа короткими отрезками с паузами. Считаем не время, а число чистых отрезков.',
    colour: 'lime',
  },
  {
    id: 'silence',
    index: '09',
    name: 'Тишина',
    minutes: 28,
    load: 4,
    body: 'Убираем объект и оставляем только факт присутствия. Самая скучная и самая честная фаза.',
    colour: 'cyan',
  },
  {
    id: 'return',
    index: '10',
    name: 'Возврат',
    minutes: 9,
    load: 2,
    body: 'Короткая техника ровно на один навык: заметить уход и вернуться без оценки.',
    colour: 'magenta',
  },
  {
    id: 'body',
    index: '11',
    name: 'Тело',
    minutes: 24,
    load: 3,
    body: 'Тело как объект удержания. Ощущения меняются быстрее мыслей — тренирует скорость возврата.',
    colour: 'indigo',
  },
  {
    id: 'full',
    index: '12',
    name: 'Полная сессия',
    minutes: 40,
    load: 5,
    body: 'Все три фазы подряд, без остановок между ними. Итоговая проверка на выносливость.',
    colour: 'lime',
  },
]

export const FEATURED = PROTOCOLS.filter((protocol) => protocol.featured)

/** Суммарная длительность всей программы — считается, а не пишется руками. */
export const TOTAL_MINUTES = PROTOCOLS.reduce((sum, protocol) => sum + protocol.minutes, 0)

/** Верхняя граница шкалы длительности: самая долгая техника, а не «круглое» число. */
export const MAX_MINUTES = Math.max(...PROTOCOLS.map((protocol) => protocol.minutes))

export const ACCENT_BG: Record<ProtocolColour, string> = {
  lime: 'bg-accent-lime',
  cyan: 'bg-accent-cyan',
  indigo: 'bg-accent-indigo',
  magenta: 'bg-accent-magenta',
}

export const ACCENT_TEXT: Record<ProtocolColour, string> = {
  lime: 'text-accent-lime',
  cyan: 'text-accent-cyan',
  indigo: 'text-accent-indigo',
  magenta: 'text-accent-magenta',
}

export const ACCENT_CSS: Record<ProtocolColour, string> = {
  lime: 'var(--color-accent-lime)',
  cyan: 'var(--color-accent-cyan)',
  indigo: 'var(--color-accent-indigo)',
  magenta: 'var(--color-accent-magenta)',
}
