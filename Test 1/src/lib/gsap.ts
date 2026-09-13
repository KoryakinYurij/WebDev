import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

/* Регистрация плагинов — ровно один раз на модуль, до создания любых триггеров. */
gsap.registerPlugin(ScrollTrigger)

/* Разовый глобальный конфиг вместо магических чисел в каждом компоненте. */
gsap.defaults({ ease: 'power3.out', duration: 0.6 })

/* ignoreMobileResize: на iOS показ/скрытие адресной строки меняет vh и без этого
   флага все пины пересчитываются и «прыгают» при каждом движении пальца. */
ScrollTrigger.config({ ignoreMobileResize: true })

export { gsap, ScrollTrigger }
