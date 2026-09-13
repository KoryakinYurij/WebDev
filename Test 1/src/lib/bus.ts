/**
 * Минимальная шина событий.
 *
 * Нужна, чтобы пульт управления дёргал симуляцию в другой секции без общего React-состояния:
 * связывать их через контекст = лишние ре-рендеры больших поддеревьев.
 */
export type EventMap = {
  shockwave: { x: number; y: number }
  mode: { value: string }
  /** Подвал открывает настройки, а кнопка живёт в шапке — тоже без общего состояния. */
  settings: { open: boolean }
}

type Handler<K extends keyof EventMap> = (payload: EventMap[K]) => void

const handlers = new Map<keyof EventMap, Set<(payload: never) => void>>()

export function on<K extends keyof EventMap>(event: K, handler: Handler<K>) {
  const set = handlers.get(event) ?? new Set()
  set.add(handler as (payload: never) => void)
  handlers.set(event, set)
  return () => {
    set.delete(handler as (payload: never) => void)
  }
}

export function emit<K extends keyof EventMap>(event: K, payload: EventMap[K]) {
  handlers.get(event)?.forEach((handler) => handler(payload as never))
}
