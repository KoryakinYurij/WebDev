import { MotionProvider } from './lib/motion-config'
import { SmoothScroll } from './lib/smooth-scroll'
import { Nav } from './components/Nav'
import { Cursor } from './components/ui/MagneticButton'
import { Hud } from './components/Hud'
import { Hero } from './components/Hero'
import { Manifest } from './components/Manifest'
import { Protocol } from './components/Protocol'
import { Library } from './components/Library'
import { Depth } from './components/Depth'
import { Scale } from './components/Scale'
import { Chronicle } from './components/Chronicle'
import { Field } from './components/Field'
import { Hold } from './components/Hold'
import { Objections } from './components/Objections'
import { Footer } from './components/Footer'

/**
 * Порядок секций = порядок сторителлинга, и он же порядок создания ScrollTrigger.
 * Всё, что пинит (Протокол, Техники), стоит до тяжёлых canvas-секций: пин-спейсеры
 * не должны сдвигать замеры уже созданных триггеров.
 *
 * «Пульт» здесь отсутствует намеренно: управление движением — утилита, а не глава,
 * и живёт в модальном окне под шестерёнкой.
 */
export function App() {
  return (
    <MotionProvider>
      <SmoothScroll>
        <a
          href="#manifest"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-pill focus:bg-accent-lime focus:px-5 focus:py-3 focus:font-mono focus:text-[11px] focus:tracking-[0.16em] focus:text-ink focus:uppercase"
        >
          Перейти к содержанию
        </a>

        <Cursor />
        <Nav />

        <main>
          <Hero />
          <Manifest />
          <Protocol />
          <Library />
          <Depth />
          <Scale />
          <Chronicle />
          <Field />
          <Hold />
          <Objections />
        </main>

        <Footer />
        <Hud />
      </SmoothScroll>
    </MotionProvider>
  )
}
