# DESIGN-CODEX.md — рабочий свод правил проекта «MINDFIELD»

Дистилляция референс-репозиториев в **только те правила, которые реально влияют на код**.
Источники → что взяли → как применено здесь.

| Источник | Что взяли | Где в проекте |
|---|---|---|
| `Eneryleen/ai-web-design-codex` | Правила scroll-driven опыта, стек-дерево решений, бюджеты motion, reduced-motion, перф-дисциплина | Архитектура всего сайта, `src/lib/*` |
| `design-tokens/community-group` (DTCG) | Формат `$type` / `$value` / алиасы `{group.token}` | `tokens/design.tokens.json` |
| `alexpate/awesome-design-systems` | Паттерн «токены → примитивы → секции», единый API у всех motion-хуков | `src/components/ui/*` |
| `ibelick/motion-primitives` | Микро-интерактив: layout-анимации, magnetic-кнопки, AnimatePresence c stable key | `MagneticButton`, `MethodSwitch`, `Nav` |
| `sergey-pimenov/awesome-web-animation` | Карта инструментов + идеи текстовых эффектов (Blotter / shuffle-text) | `ScrambleText`, `VelocityBand` |
| `sergey-pimenov` / `mrdoob/three.js` | Three.js только для одного signature-момента | `src/three/heroField.ts` |
| `thedaviddias/Front-End-Performance-Checklist` + `madebymustafa/inclusive-design-checklist` | Перф- и a11y-гейты ниже | Раздел «Гейты» |

## 1. Стек-решение (из animation-libraries-stack)

Порядок эскалации **CSS → WAAPI → библиотека**:

| Задача | Инструмент | Обоснование |
|---|---|---|
| Hover/focus/reveal, простые входы | CSS `@keyframes` + `transition` | 0 KB, компоновщик |
| Прогресс чтения, простой parallax | Нативный CSS `animation-timeline: scroll()/view()` | уходит с main-thread |
| Микро-интерактив, жесты, layout-анимации, exit | **Motion** (`motion/react`) | MIT, декларативность, `useReducedMotion` |
| Pin + scrub, горизонтальный скролл, timelane | **GSAP + ScrollTrigger** | единственный вменяемый вариант для pinning |
| Инерционный скролл | **Lenis** (~3 KB) | сохраняет `position: sticky` и a11y |
| Полноэкранный шейдер + облако точек | **Three.js** | один signature-момент, больше нигде |

Отвергнуто сознательно: Lottie (1400+ DOM-узлов на анимацию), anime.js (нет React-жизненного цикла), mojs (императивные частицы без cleanup), ScrollMagic/Locomotive (legacy).

## 2. Правила, которые нельзя нарушать (scroll-driven)

- Анимируем **только `transform` и `opacity`**. `width/height/top/left/margin/box-shadow/background-color` → layout/paint каждый кадр.
- **Pin — контейнер, анимируем только детей.** Анимация самого pinned-элемента ломает замеры ScrollTrigger.
- Триггеры создаём **сверху вниз в DOM-порядке** (pin-spacer иначе сдвигает расчёты ниже).
- `overflow: clip`, **не** `hidden` — `hidden` ломает CSS scroll-seeking.
- Параллакс-глубина: фон 20–40 % скорости скролла, мид 50 %, передний план 60–80 %, фиксированный HUD 100 %. Слоёв 3–4, не больше.
- Reveal-бюджет: **< 400 мс**, stagger **< 200 мс** на элемент. Быстрый скроллер не должен ждать контент.
- `scroll-behavior` + Lenis: `lenis.on('scroll', ScrollTrigger.update)`, `raf` из GSAP-тикера, `gsap.ticker.lagSmoothing(0)`. Никогда не «двойной тик».
- `ScrollTrigger.refresh()` после шрифтов/картинок/лейаута.
- Любой спавн/тик живёт в `gsap.context()` и умирает в `revert()` на unmount.

## 3. Бюджеты (webgl-3d-shaders + performance checklist)

- `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))` — 3× DPR это 9× пикселей ради почти нулевого выигрыша.
- ≤ 100 draw calls/кадр desktop, ≤ 50 mobile. Здесь: 2 draw call (фон-плейн + облако точек).
- **Никакого `useState` в кадре.** В `useFrame` мутируем `ref.current`, аллокации — один раз через `useMemo`.
- Шейдер: вся работа, которую можно интерполировать, — в вершинный шейдер. `precision mediump` по умолчанию.
- Постпроцессинга нет (дорого на мобильных). Свечение — фейковый bloom в самом шейдере.
- Рендер только когда canvas во вьюпорте (IntersectionObserver) и вкладка видима.
- `will-change` — только перед анимацией, снимать после.
- Шрифты: `display=swap`, preconnect, системный фолбэк. Никакого CLS-скачка LCP.

## 4. Доступность (не «галочка»)

- `prefers-reduced-motion` — медицинская необходимость (вестибулярные расстройства), а не нюанс. Базовая вёрстка **читается полностью без анимации**.
- Все scroll-эффекты обёрнуты в `@media (prefers-reduced-motion: no-preference)`; базовое состояние — финальное, а не `opacity: 0`.
- JS-гейт через reactive-хук, а не одноразовый `matchMedia().matches`: пользователь может переключить ОС в середине сессии.
- Пользовательский контроль: слайдер интенсивности движения + явный тумблер «уменьшить движение» (WCAG 2.2 SC 2.3.3 AAA).
- Клавиатура: skip-link, видимый focus-ring, `:focus-visible` не отключён, все секции достижимы, scroll-jacking не ловит фокус.
- Курсор-кастом отключается на touch и при reduced-motion; системный курсор остаётся рабочим.
- Контраст текста ≥ 4.5:1 (проверено на фоне шейдера — под текстом лежит затемняющий слой).
- Декоративные canvas: `aria-hidden="true"` + текстовый эквивалент рядом.

## 5. Анти-паттерны, которые здесь запрещены

- Анимированные счётчики «0 → 150 243» на входе — ноль информации, трата внимания.
- Reveal каждого абзаца тела текста.
- Горизонтальный скролл без индикации (пользователь считает, что секция кончилась) → даём прогресс-точки и счётчик `03 / 06`.
- Lenis/smooth-scroll на формах и чекаутах (здесь это промо-страница, поэтому допустимо).
- Бессмысленные «плавающие блобы» 3D. 3D стоит кадров только как один запоминающийся момент.
- `markers: true,` в продакшене.
- `content-visibility: auto` на предках/соседях pinned-элементов.

## 6. Токены (DTCG)

`tokens/design.tokens.json` — единственный источник правды. `scripts/build-tokens.mjs` генерирует:
- `src/styles/tokens.css` → блок `@theme` для Tailwind v4 (утилиты `bg-*`, `text-*`, `font-*`, `ease-*` появляются автоматически);
- `src/generated/tokens.ts` → типизированный объект для JS (цвета уходят в шейдер и в canvas-частицы, чтобы графика физически не могла разъехаться с палитрой интерфейса).

Алиасы (`{color.accent.lime}`) резолвятся на этапе сборки — в рантайм попадают только конечные значения.
