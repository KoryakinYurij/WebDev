import * as THREE from 'three'
import { color as c, rgb } from '../generated/tokens'

/**
 * Hero-сцена: два draw call на кадр.
 *   1. полноэкранный quad  — процедурный фон (fbm + интерференционные кольца от курсора);
 *   2. облако точек        — вся анимация в вершинном шейдере, CPU не трогает ни одну вершину.
 *
 * Вся палитра приходит из design tokens, поэтому графика физически не может
 * разъехаться с палитрой интерфейса.
 */

// Управление цветом выключаем намеренно: значения из токенов — уже sRGB,
// и должны попасть на экран без повторного преобразования linear→sRGB.
THREE.ColorManagement.enabled = false

/**
 * Точность шейдера.
 *
 * Критично: uniform, объявленный в обеих стадиях, обязан иметь ОДИНАКОВУЮ точность,
 * иначе линковка падает с «Precisions of uniform differ between VERTEX and FRAGMENT shaders».
 * Поэтому строка задаётся один раз и подставляется и в вершинный, и во фрагментный шейдер.
 * three сам добавляет `precision highp float;` в префикс, но позднее объявление
 * переопределяет его для обоих стадий согласованно.
 */
export type Precision = 'highp' | 'mediump'

const BACKGROUND_VERT = /* glsl */ `
  void main() {
    // PlaneGeometry(2,2) уже покрывает NDC целиком — матрицы не нужны.
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const BACKGROUND_FRAG = /* glsl */ `
  uniform vec2  uResolution;
  uniform float uTime;
  uniform vec2  uPointer;
  uniform float uScroll;
  uniform float uIntensity;

  uniform vec3 uInk;
  uniform vec3 uIndigo;
  uniform vec3 uMagenta;
  uniform vec3 uLime;
  uniform vec3 uCyan;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      value += amp * noise(p);
      p = p * 2.03 + vec2(1.7, -1.3);
      amp *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 resolution = max(uResolution, vec2(1.0));
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 pointer = uPointer;

    // Domain warping: два прохода fbm смещают вход третьего — отсюда «жидкая» структура.
    vec2 q = p * 1.7 + vec2(uTime * 0.035, -uTime * 0.022 + uScroll * 1.15);
    vec2 warp = vec2(fbm(q), fbm(q + vec2(5.2, 1.3)));
    float field = fbm(q + 1.9 * warp + pointer * 0.4);

    // Ядро: тёмная база, индиго в тенях, магента на средних, лайм — редкие пики.
    vec3 col = uInk;
    col = mix(col, uIndigo, smoothstep(0.14, 0.6, field));
    col = mix(col, uMagenta * 0.85, smoothstep(0.48, 0.9, field) * 0.85);
    col = mix(col, uLime, pow(smoothstep(0.62, 1.0, field), 4.0) * 0.6);

    // Интерференционные кольца от курсора: мгновенный отклик на движение мыши.
    float d = length(p - pointer);
    float rings = sin(d * 26.0 - uTime * 1.6) * 0.5 + 0.5;
    rings *= smoothstep(0.62, 0.0, d) * 0.34;
    col += uCyan * rings;

    // Тонкая измерительная сетка, искривлённая тем же шумом.
    vec2 grid = fract((p + vec2(field) * 0.14) * 9.0);
    float lines = smoothstep(0.985, 1.0, grid.x) + smoothstep(0.985, 1.0, grid.y);
    col += uCyan * lines * 0.05;

    float vignette = smoothstep(1.45, 0.2, length(p * vec2(1.0, 1.25)));
    col *= mix(0.6, 1.0, vignette);

    // Интенсивность 0 — статичный, но всё ещё осмысленный градиент, а не чёрный экран.
    col = mix(col * 0.55, col, clamp(uIntensity, 0.0, 1.0));
    col += uIndigo * 0.06 * (1.0 - clamp(uIntensity, 0.0, 1.0));

    gl_FragColor = vec4(col, 1.0);
  }
`

const POINTS_VERT = /* glsl */ `
  attribute float aSeed;
  attribute float aScale;

  uniform float uTime;
  uniform float uIntensity;
  uniform float uScroll;
  uniform float uPixelRatio;
  uniform float uSize;

  varying float vSeed;
  varying float vFade;

  void main() {
    vec3 p = position;

    // Вращение поля: угол зависит от радиуса, поэтому облако «закручивается», а не крутится целиком.
    float radius = length(p.xz);
    float angle = uTime * 0.22 + radius * 0.42 + aSeed * 0.6;
    float ca = cos(angle);
    float sa = sin(angle);
    p.xz = mat2(ca, -sa, sa, ca) * p.xz;

    // «Напряжение» поля: сумма синусов вместо шума — на GPU это почти бесплатно.
    p.y += sin(uTime * 0.9 + aSeed * 6.2831 + p.x * 0.7) * 0.2 * uIntensity;
    p.x += cos(uTime * 0.7 + aSeed * 4.1 + p.z * 0.6) * 0.14 * uIntensity;
    p.y += uScroll * 3.2;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    // Дальние точки гаснут: без этого облако превращается в плоское «снежное» поле.
    float depth = -mv.z;
    float distanceFade = clamp((17.0 - depth) / 13.0, 0.06, 1.0);
    gl_PointSize = uSize * aScale * uPixelRatio * (15.0 / depth);

    vSeed = aSeed;
    vFade = distanceFade;
  }
`

const POINTS_FRAG = /* glsl */ `
  uniform vec3 uIndigo;
  uniform vec3 uMagenta;
  uniform vec3 uLime;
  uniform vec3 uCyan;
  uniform float uIntensity;

  varying float vSeed;
  varying float vFade;

  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float dist = length(d);
    if (dist > 0.5) discard;

    // Круглая точка с мягким краем — без текстуры, без сэмплера.
    float alpha = smoothstep(0.5, 0.08, dist);

    vec3 col = mix(uIndigo, uCyan, smoothstep(0.0, 0.4, vSeed));
    col = mix(col, uLime, smoothstep(0.55, 0.95, vSeed));
    col = mix(col, uMagenta, smoothstep(0.9, 1.0, vSeed) * 0.85);

    // Плотность держим низкой: при аддитивном сложении перекрытия уходят в белый и текст теряет контраст.
    gl_FragColor = vec4(col, alpha * vFade * (0.14 + 0.52 * uIntensity));
  }
`

export type HeroField = {
  setPointer: (x: number, y: number) => void
  setScroll: (progress: number) => void
  setIntensity: (value: number) => void
  render: (deltaMs: number, elapsedMs: number) => void
  resize: (width: number, height: number) => void
  dispose: () => void
  /** Честное число объектов в сцене — для HUD */
  readonly count: number
}

export type HeroFieldOptions = {
  /** mediump заметно дешевле на мобильных GPU, но снижает точность позиций вершин */
  precision?: Precision
}

export function createHeroField(canvas: HTMLCanvasElement, count: number, options: HeroFieldOptions = {}): HeroField {
  const precision = options.precision ?? 'highp'
  const withPrecision = (source: string) => `precision ${precision} float;\n${source}`

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
  })
  // 3× DPR — это 9× пикселей ради почти нулевой разницы. Жёсткий потолок 2.
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace
  renderer.setClearColor(new THREE.Color(...rgb(c.ink)), 1)

  // Ошибка компиляции шейдера должна быть видимой, а не «чёрным экраном без причины».
  renderer.debug.checkShaderErrors = true
  renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => {
    console.error(
      `[hero-field] шейдер не слинковался | program: ${gl.getProgramInfoLog(program)} | vertex: ${gl.getShaderInfoLog(
        vertexShader,
      )} | fragment: ${gl.getShaderInfoLog(fragmentShader)}`,
    )
  }

  const uniforms = {
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uPointer: { value: new THREE.Vector2(0, 0) },
    uScroll: { value: 0 },
    uIntensity: { value: 1 },
    uInk: { value: new THREE.Vector3(...rgb(c.ink)) },
    uIndigo: { value: new THREE.Vector3(...rgb(c.accent.indigo)) },
    uMagenta: { value: new THREE.Vector3(...rgb(c.accent.magenta)) },
    uLime: { value: new THREE.Vector3(...rgb(c.accent.lime)) },
    uCyan: { value: new THREE.Vector3(...rgb(c.accent.cyan)) },
  }

  // --- проход 1: фон на ортокамере, quad во весь экран -------------------
  const quadScene = new THREE.Scene()
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  quadScene.add(
    new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        vertexShader: withPrecision(BACKGROUND_VERT),
        fragmentShader: withPrecision(BACKGROUND_FRAG),
        uniforms,
        depthTest: false,
        depthWrite: false,
      }),
    ),
  )

  // --- проход 2: облако точек на перспективной камере -------------------
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 60)
  camera.position.set(0, 0, 7.4)

  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  const scales = new Float32Array(count)

  for (let i = 0; i < count; i += 1) {
    // Распределение в сферической оболочке: ровная плотность, без кома в центре.
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const radius = 2.3 + Math.random() * 2.6
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
    // Y поджимаем: поле должно читаться как диск, а не как шар.
    positions[i * 3 + 1] = radius * Math.cos(phi) * 0.62
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta)
    seeds[i] = Math.random()
    scales[i] = 0.35 + Math.random() * 0.9
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
  geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1))

  const pointUniforms = {
    uTime: { value: 0 },
    uIntensity: { value: 1 },
    uScroll: { value: 0 },
    uPixelRatio: { value: 1 },
    uSize: { value: 2.6 },
    uIndigo: { value: uniforms.uIndigo.value },
    uMagenta: { value: uniforms.uMagenta.value },
    uLime: { value: uniforms.uLime.value },
    uCyan: { value: uniforms.uCyan.value },
  }

  const points = new THREE.Points(
    geometry,
    new THREE.ShaderMaterial({
      vertexShader: withPrecision(POINTS_VERT),
      fragmentShader: withPrecision(POINTS_FRAG),
      uniforms: pointUniforms,
      transparent: true,
      depthWrite: false,
      // Аддитивное сложение даёт «свечение» без постпроцессинга и его полных проходов.
      blending: THREE.AdditiveBlending,
    }),
  )

  const fieldScene = new THREE.Scene()
  fieldScene.add(points)

  const pointerTarget = new THREE.Vector2(0, 0)
  const pointerCurrent = new THREE.Vector2(0, 0)
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let time = 0

  return {
    count,

    setPointer(x, y) {
      pointerTarget.set(x, y)
    },

    setScroll(progress) {
      uniforms.uScroll.value = progress
      pointUniforms.uScroll.value = progress
    },

    setIntensity(value) {
      uniforms.uIntensity.value = value
      pointUniforms.uIntensity.value = value
    },

    render(deltaMs, elapsedMs) {
      if (reduceMotion) return
      const dt = deltaMs / 1000
      time = elapsedMs / 1000

      // Критическое демпфирование указателя: без него поле дёргается за мышью.
      pointerCurrent.lerp(pointerTarget, 1 - Math.exp(-dt * 4.5))

      uniforms.uTime.value = time
      uniforms.uPointer.value.copy(pointerCurrent)
      pointUniforms.uTime.value = time

      // Параллакс камеры вместо свободного OrbitControls: путь камеры курируем мы.
      camera.position.x = pointerCurrent.x * 0.55
      camera.position.y = pointerCurrent.y * 0.35
      camera.lookAt(0, 0, 0)

      renderer.autoClear = false
      renderer.clear()
      renderer.render(quadScene, quadCamera)
      renderer.render(fieldScene, camera)
    },

    resize(width, height) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      renderer.setPixelRatio(dpr)
      renderer.setSize(width, height, false)
      camera.aspect = width / Math.max(height, 1)
      camera.updateProjectionMatrix()
      uniforms.uResolution.value.set(width * dpr, height * dpr)
      pointUniforms.uPixelRatio.value = dpr
    },

    dispose() {
      geometry.dispose()
      points.material.dispose()
      for (const child of quadScene.children) {
        const mesh = child as THREE.Mesh
        mesh.geometry.dispose()
        ;(mesh.material as THREE.Material).dispose()
      }
      renderer.dispose()
    },
  }
}
