import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useReducedMotion } from 'motion/react'
import { telemetry } from './telemetry'

export type Quality = 'high' | 'low'

export type MotionPrefs = {
  /** ОС (или пользователь вручную) просит меньше движения */
  reduced: boolean
  /** Пользовательский тумблер: принудительно уменьшить движение */
  reduceOverride: boolean
  /** 0..1 — выбранная интенсивность */
  intensity: number
  /** 0..1 — итоговый множитель: 0 = вся моторика выключена */
  effective: number
  quality: Quality
  setIntensity: (value: number) => void
  setReduceOverride: (value: boolean) => void
  setQuality: (value: Quality) => void
  /**
   * Чтение интенсивности без ре-рендера.
   * Нужно rAF-циклам и GSAP-твинам: подписка на контекст в кадре = гарантированный jank.
   */
  read: () => number
}

const MotionContext = createContext<MotionPrefs | null>(null)

const STORAGE_KEY = 'mindfield.motion'

type Stored = { intensity: number; reduceOverride: boolean; quality: Quality | null }

const readStored = (): Stored => {
  const fallback: Stored = { intensity: 1, reduceOverride: false, quality: null }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<Stored>
    return {
      intensity: typeof parsed.intensity === 'number' ? Math.min(1, Math.max(0, parsed.intensity)) : 1,
      reduceOverride: parsed.reduceOverride === true,
      quality: parsed.quality === 'high' || parsed.quality === 'low' ? parsed.quality : null,
    }
  } catch {
    return fallback
  }
}

/** Дешёвая эвристика: слабое устройство или тач-таргет не должны получать 900 частиц и полный шейдер. */
const detectQuality = (): Quality => {
  if (typeof navigator === 'undefined') return 'high'
  const cores = navigator.hardwareConcurrency ?? 4
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
  const coarse = window.matchMedia('(pointer: coarse)').matches
  return cores <= 4 || memory <= 4 || coarse ? 'low' : 'high'
}

export function MotionProvider({ children }: { children: ReactNode }) {
  const systemReduced = useReducedMotion() ?? false
  const stored = useMemo(readStored, [])

  const [intensity, setIntensityState] = useState(stored.intensity)
  const [reduceOverride, setReduceOverrideState] = useState(stored.reduceOverride)
  const [quality, setQualityState] = useState<Quality>(() => stored.quality ?? detectQuality())

  const reduced = systemReduced || reduceOverride
  const effective = reduced ? 0 : intensity

  /* Зеркало в ref: rAF-циклы читают синхронно, без подписки на React. */
  const effectiveRef = useRef(effective)
  effectiveRef.current = effective

  const read = useCallback(() => effectiveRef.current, [])

  /*
   * Побочный эффект — в effect, а не в теле рендера.
   * Запись в внешний мутируемый объект во время рендера нарушает чистоту
   * (в StrictMode рендер вызывается дважды), а задержка в один кадр для HUD незначима.
   */
  useEffect(() => {
    telemetry.intensity = effective
  }, [effective])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ intensity, reduceOverride, quality }))
    } catch {
      /* приватный режим — просто не сохраняем */
    }
  }, [intensity, reduceOverride, quality])

  const value = useMemo<MotionPrefs>(
    () => ({
      reduced,
      reduceOverride,
      intensity,
      effective,
      quality,
      setIntensity: (v: number) => setIntensityState(Math.min(1, Math.max(0, v))),
      setReduceOverride: setReduceOverrideState,
      setQuality: setQualityState,
      read,
    }),
    [reduced, reduceOverride, intensity, effective, quality, read],
  )

  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>
}

export function useMotionPrefs() {
  const ctx = useContext(MotionContext)
  if (!ctx) throw new Error('useMotionPrefs требует <MotionProvider> выше по дереву')
  return ctx
}
