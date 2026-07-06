const THREE_LOCAL_URL = '../vendor/three.module.js';
const THREE_CDN_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

let threePromise;

export function loadThree() {
  if (window.THREE) return Promise.resolve(window.THREE);
  if (!threePromise) {
    threePromise = import(THREE_LOCAL_URL).catch(() => import(THREE_CDN_URL));
  }
  return threePromise;
}

function getCanvas(root, id) {
  return root.getElementById ? root.getElementById(id) : root.querySelector(`#${id}`);
}

function makeUniforms() {
  return {
    uTime: { value: 0 },
    uPointer: { value: { x: 0, y: 0 } },
    uPointerUv: { value: { x: 0.5, y: 0.5 } },
    uPointerActive: { value: 0 },
    uPlaybackSelected: { value: 0 },
    uResolution: { value: { x: 1, y: 1 } },
    uIntensity: { value: 1 },
    uSmokeBias: { value: 0 },
    uCyanDamping: { value: 0.5 },
    uFlowStrength: { value: 0.72 },
    uSpotlightRadius: { value: 0.085 },
    uSideDamping: { value: 0.35 },
    uRibbonContrast: { value: 1 },
    uDarkMatter: { value: 0.42 },
    uRingSharpness: { value: 1 },
    uInkOcclusion: { value: 0.62 },
    uLowerSmokeWeight: { value: 1 },
    uHoverRingGain: { value: 1 },
    uPlumeWarp: { value: 0.24 },
    uBottomFlameGain: { value: 1 },
    uInkCutoutGain: { value: 1 },
    uHorizontalBreakup: { value: 1 },
  };
}

class WebGLStage {
  constructor(THREE, canvas, options = {}) {
    this.THREE = THREE;
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(options.fov || 45, 1, 0.1, 100);
    this.camera.position.z = options.cameraZ || 6;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    if (THREE.SRGBColorSpace) this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.clock = new THREE.Clock();
    this.pointer = new THREE.Vector2(0, 0);
    this.pointerUv = new THREE.Vector2(0.5, 0.5);
    this.pointerActive = 0;
    this.pointerInside = false;
    this.playbackSelected = 0;
    this.playbackSelectedTarget = 0;
    this.frameCallbacks = [];
    this.resizeCallbacks = [];
    this.visible = true;
    this.raf = 0;

    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onResize = this.onResize.bind(this);
    this.tick = this.tick.bind(this);

    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    window.addEventListener('pointerup', this.onPointerUp, { passive: true });
    window.addEventListener('pointercancel', this.onPointerUp, { passive: true });
    window.addEventListener('resize', this.onResize, { passive: true });

    this.observer = new IntersectionObserver((entries) => {
      this.visible = entries.some((entry) => entry.isIntersecting);
    }, { threshold: 0.02 });
    this.observer.observe(canvas);

    this.onResize();
  }

  onPointerMove(event) {
    this.updatePointerFromEvent(event);
  }

  updatePointerFromEvent(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(rect.width, 1);
    const y = (event.clientY - rect.top) / Math.max(rect.height, 1);
    this.pointerInside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
    this.pointerActive = this.pointerInside ? 1 : 0;

    const clampedX = Math.min(1, Math.max(0, x));
    const clampedY = Math.min(1, Math.max(0, y));
    this.pointerUv.set(clampedX, 1 - clampedY);
    this.pointer.set(this.pointerUv.x * 2 - 1, this.pointerUv.y * 2 - 1);
  }

  onPointerDown(event) {
    this.updatePointerFromEvent(event);
    if (this.pointerInside) {
      this.playbackSelectedTarget = this.playbackSelectedTarget > 0 ? 0 : 1;
    }
  }

  onPointerUp(event) {
    this.updatePointerFromEvent(event);
  }

  onResize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.aspect = this.width / this.height;
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
    this.resizeCallbacks.forEach((callback) => callback(this));
  }

  onFrame(callback) {
    this.frameCallbacks.push(callback);
  }

  onStageResize(callback) {
    this.resizeCallbacks.push(callback);
    callback(this);
  }

  start() {
    this.raf = window.requestAnimationFrame(this.tick);
    return this;
  }

  tick() {
    const time = this.clock.getElapsedTime();
    if (this.visible && !document.hidden) {
      this.playbackSelected += (this.playbackSelectedTarget - this.playbackSelected) * 0.22;
      if (this.playbackSelected < 0.001 && this.playbackSelectedTarget === 0) this.playbackSelected = 0;
      this.frameCallbacks.forEach((callback) => callback(time, this));
      this.renderer.render(this.scene, this.camera);
    }
    this.raf = window.requestAnimationFrame(this.tick);
  }

  dispose() {
    window.cancelAnimationFrame(this.raf);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('resize', this.onResize);
    this.observer.disconnect();
    this.scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    this.renderer.dispose();
  }
}

function shaderPlane(THREE, stage, fragmentShader, options = {}) {
  const uniforms = makeUniforms();
  uniforms.uIntensity.value = options.intensity || 1;
  uniforms.uSmokeBias.value = options.smokeBias || 0;
  uniforms.uCyanDamping.value = options.cyanDamping ?? 0.5;
  uniforms.uFlowStrength.value = options.flowStrength ?? 0.72;
  uniforms.uSpotlightRadius.value = options.spotlightRadius ?? 0.085;
  uniforms.uSideDamping.value = options.sideDamping ?? 0.35;
  uniforms.uRibbonContrast.value = options.ribbonContrast ?? 1;
  uniforms.uDarkMatter.value = options.darkMatter ?? 0.42;
  uniforms.uRingSharpness.value = options.ringSharpness ?? 1;
  uniforms.uInkOcclusion.value = options.inkOcclusion ?? 0.62;
  uniforms.uLowerSmokeWeight.value = options.lowerSmokeWeight ?? 1;
  uniforms.uHoverRingGain.value = options.hoverRingGain ?? 1;
  uniforms.uPlumeWarp.value = options.plumeWarp ?? 0.24;
  uniforms.uBottomFlameGain.value = options.bottomFlameGain ?? 1;
  uniforms.uInkCutoutGain.value = options.inkCutoutGain ?? 1;
  uniforms.uHorizontalBreakup.value = options.horizontalBreakup ?? 1;

  const geometry = new THREE.PlaneGeometry(2, 2, 1, 1);
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: options.blending ?? THREE.AdditiveBlending,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  stage.scene.add(mesh);

  stage.onFrame((time) => {
    uniforms.uTime.value = time;
    uniforms.uPointer.value.x = stage.pointer.x;
    uniforms.uPointer.value.y = stage.pointer.y;
    uniforms.uPointerUv.value.x = stage.pointerUv.x;
    uniforms.uPointerUv.value.y = stage.pointerUv.y;
    uniforms.uPointerActive.value = stage.pointerActive;
    uniforms.uPlaybackSelected.value = stage.playbackSelected;
    uniforms.uResolution.value.x = stage.width;
    uniforms.uResolution.value.y = stage.height;
  });

  return { mesh, uniforms };
}

const SHADER_COMMON = `
  precision mediump float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform vec2 uPointerUv;
  uniform float uPointerActive;
  uniform float uPlaybackSelected;
  uniform vec2 uResolution;
  uniform float uIntensity;
  uniform float uSmokeBias;
  uniform float uCyanDamping;
  uniform float uFlowStrength;
  uniform float uSpotlightRadius;
  uniform float uSideDamping;
  uniform float uRibbonContrast;
  uniform float uDarkMatter;
  uniform float uRingSharpness;
  uniform float uInkOcclusion;
  uniform float uLowerSmokeWeight;
  uniform float uHoverRingGain;
  uniform float uPlumeWarp;
  uniform float uBottomFlameGain;
  uniform float uInkCutoutGain;
  uniform float uHorizontalBreakup;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    mat2 rotate = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p);
      p = rotate * p * 2.0 + 12.3;
      amplitude *= 0.5;
    }
    return value;
  }

  float sourceHeroFlowField(vec2 p, float density, float t) {
    vec2 q = vec2(
      fbm(p * density + vec2(0.0, t)),
      fbm(p * density + vec2(5.2, 1.3 - t * 0.7))
    );
    vec2 r = vec2(
      fbm(p * density + q * 1.6 + vec2(1.7, 9.2) + t * 0.4),
      fbm(p * density + q * 1.6 + vec2(8.3, 2.8) - t * 0.3)
    );
    return fbm(p * density + r * 2.0);
  }

  float fbmCta(vec2 p) {
    float value = 0.0;
    float amplitude = 0.55;
    mat2 rotate = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 6; i++) {
      value += amplitude * noise(p);
      p = rotate * p * 2.0 + 7.1;
      amplitude *= 0.5;
    }
    return value;
  }

  float sourceCtaNebula(vec2 p, float t) {
    vec2 q = vec2(
      fbmCta(p * 2.4 + vec2(0.0, t)),
      fbmCta(p * 2.4 + vec2(3.3, -t))
    );
    return fbmCta(p * 2.8 + q * 1.8 + t * 0.5);
  }
`;

const HERO_FLOW_FRAGMENT = `
  ${SHADER_COMMON}

  void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 p = uv;
    p.x *= aspect;

    float t = uTime * mix(0.18, 0.38, uFlowStrength);
    float density = mix(2.2, 4.2, uRibbonContrast);
    float flow = sourceHeroFlowField(p, density, t);
    float flowB = sourceHeroFlowField(p * 1.08 + vec2(2.2, -1.1), density * 0.82, t * 0.72);

    float sourceFlowRibbons = smoothstep(0.35 + uSmokeBias, 0.75, flow);
    float sourceFlowFilaments = pow(abs(sin(flow * 9.0 + t * 2.0)), 6.0);
    float flowRibbon = sourceFlowRibbons * 0.55 + sourceFlowFilaments * 0.90;
    float heroFlowVfall = smoothstep(1.05, 0.0, uv.y);

    vec3 deepPurple = vec3(0.015, 0.020, 0.040);
    vec3 cyan = vec3(0.13, 0.83, 0.93);
    vec3 blue = vec3(0.23, 0.51, 0.96);
    vec3 violet = vec3(0.55, 0.36, 0.96);
    vec3 col = mix(blue, cyan, sourceFlowRibbons);
    col = mix(col, violet, smoothstep(0.40, 0.90, flowB + flow));
    col *= flowRibbon;
    col *= heroFlowVfall;

    vec2 pointerDelta = uv - uPointerUv;
    pointerDelta.x *= aspect;
    float pointerDistance = length(pointerDelta);
    float hoverSpotlightHalo = uPointerActive * exp(-pointerDistance * 4.5) * 0.9;
    float cursorHotspotLens = hoverSpotlightHalo;
    float cursorGlow = cursorHotspotLens;
    float cursorHalo = cursorHotspotLens;
    col += mix(cyan, violet, 0.4) * cursorHotspotLens * (0.58 + 0.42 * sin(t * 3.0)) * uHoverRingGain;

    float hoverSpotlightRing = uPlaybackSelected * (1.0 - smoothstep(0.006, 0.020 / max(uRingSharpness, 0.1), abs(pointerDistance - uSpotlightRadius * 1.04)));
    float cursorRing = hoverSpotlightRing;
    float cursorCoreRing = uPlaybackSelected * (1.0 - smoothstep(0.002, 0.011 / max(uRingSharpness, 0.1), abs(pointerDistance - uSpotlightRadius * 0.58)));
    float selectedPlaybackHalo = uPlaybackSelected * (1.0 - smoothstep(0.006, 0.032 / max(uRingSharpness, 0.1), abs(pointerDistance - uSpotlightRadius * 1.48))) * uHoverRingGain;
    float playbackSelectionHalo = selectedPlaybackHalo;
    float cursorPlaybackRing = selectedPlaybackHalo;
    float cursorSelectionBloom = cursorCoreRing * uHoverRingGain;
    col += vec3(0.92, 0.99, 1.0) * cursorRing * 0.54;
    col += vec3(0.92, 0.99, 1.0) * cursorPlaybackRing * 1.16;
    col += vec3(0.46, 0.96, 1.0) * playbackSelectionHalo * 0.74;
    col += vec3(0.62, 0.34, 1.0) * cursorSelectionBloom * 1.06;

    float scan = 0.04 * sin(uv.y * uResolution.y * 1.6 + uTime * 6.0);
    col += scan * cyan * sourceFlowRibbons;
    col += deepPurple * (1.0 - uv.y);

    float inkMask = smoothstep(1.25, 0.35, distance(uv, vec2(0.5)));
    col *= 0.55 + 0.45 * inkMask;
    col = clamp(col, 0.0, 1.35);

    float heroFlowAlpha = clamp(uIntensity, 0.0, 1.0);

    gl_FragColor = vec4(col, heroFlowAlpha);
  }
`;

const CTA_NEBULA_FRAGMENT = `
  ${SHADER_COMMON}

  void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 p = uv;
    p.x *= aspect;

    float t = uTime * 0.18;
    float n = sourceCtaNebula(p, t);
    float folds = sourceCtaNebula(p * 1.15 + vec2(1.7, -2.4), t * 0.74);
    float cloud = smoothstep(0.55 + uSmokeBias, 0.95, n);
    float filaments = pow(abs(sin(n * 7.0 + t * 3.0)), 10.0);
    filaments += pow(abs(sin(folds * 10.0 - t * 2.1)), 14.0) * 0.22;
    float ctaTealVaporMix = smoothstep(0.0, 1.0, 1.0 - uCyanDamping);

    vec3 deepPurple = vec3(0.055, 0.025, 0.160);
    vec3 blue = vec3(0.090, 0.230, 0.480);
    vec3 violet = vec3(0.360, 0.160, 0.620);
    vec3 cyan = vec3(0.130, 0.830, 0.930);
    vec3 col = mix(blue, violet, smoothstep(0.30, 0.85, n));
    col = mix(deepPurple, col, cloud * 0.55 + filaments * 0.10);
    col *= cloud * 0.50;
    col += cyan * filaments * mix(0.25, 0.40, ctaTealVaporMix);

    float sparks = 0.0;
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      vec2 sp = vec2(hash21(vec2(fi, 3.0)), hash21(vec2(fi, 9.0)));
      sp.x = fract(sp.x + t * (0.1 + fi * 0.03));
      sp.y = fract(sp.y + sin(t + fi) * 0.05 + 0.5);
      sp.x *= aspect;
      sparks += exp(-distance(p, sp) * 40.0) * (0.6 + 0.4 * sin(uTime * 4.0 + fi * 2.0));
    }
    col += cyan * sparks * 0.80;

    vec2 pointerDelta = uv - uPointerUv;
    pointerDelta.x *= aspect;
    float pointerDistance = length(pointerDelta);
    float hoverSpotlightHalo = uPointerActive * exp(-pointerDistance * 3.5) * 0.35;
    float cursorHotspotLens = hoverSpotlightHalo;
    float cursorGlow = cursorHotspotLens;
    float cursorHalo = cursorHotspotLens;
    col += mix(cyan, violet, 0.5) * cursorHotspotLens * uHoverRingGain;

    float hoverSpotlightRing = uPlaybackSelected * (1.0 - smoothstep(0.006, 0.020 / max(uRingSharpness, 0.1), abs(pointerDistance - uSpotlightRadius * 1.04)));
    float cursorRing = hoverSpotlightRing;
    float cursorCoreRing = uPlaybackSelected * (1.0 - smoothstep(0.002, 0.011 / max(uRingSharpness, 0.1), abs(pointerDistance - uSpotlightRadius * 0.58)));
    float selectedPlaybackHalo = uPlaybackSelected * (1.0 - smoothstep(0.006, 0.032 / max(uRingSharpness, 0.1), abs(pointerDistance - uSpotlightRadius * 1.48))) * uHoverRingGain;
    float playbackSelectionHalo = selectedPlaybackHalo;
    float cursorPlaybackRing = selectedPlaybackHalo;
    float cursorSelectionBloom = cursorCoreRing * uHoverRingGain;
    col += vec3(0.92, 0.99, 1.0) * cursorRing * 0.46;
    col += vec3(0.92, 0.99, 1.0) * cursorPlaybackRing * 0.96;
    col += vec3(0.46, 0.96, 1.0) * playbackSelectionHalo * 0.58;
    col += vec3(0.62, 0.34, 1.0) * cursorSelectionBloom * 0.72;

    float inkMask = smoothstep(1.25, 0.15, distance(uv, vec2(0.5, 0.45)));
    col *= inkMask;
    col *= 0.70;
    col = clamp(col, 0.0, 1.25);

    float ctaNebulaAlpha = clamp(uIntensity, 0.0, 1.0);

    gl_FragColor = vec4(col, ctaNebulaAlpha);
  }
`;

const GRID_FRAGMENT = `
  precision mediump float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform vec2 uPointerUv;
  uniform float uPointerActive;
  uniform vec2 uResolution;
  uniform float uSpotlightRadius;
  uniform float uRingSharpness;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(41.2, 289.7))) * 18758.5453);
  }

  float gridLine(vec2 uv, float cells, float width) {
    vec2 g = abs(fract(uv * cells) - 0.5);
    vec2 line = 1.0 - smoothstep(vec2(width), vec2(width + 0.004), g);
    return max(line.x, line.y);
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = uv - 0.5;
    float grid = gridLine(uv, 18.0, 0.012) * 0.28 + gridLine(uv, 9.0, 0.008) * 0.16;
    vec2 cell = floor(uv * vec2(28.0, 16.0));
    vec2 local = fract(uv * vec2(28.0, 16.0)) - 0.5;
    float starMask = step(0.73, hash(cell));
    float starCore = smoothstep(0.072, 0.0, length(local));
    float gridSparkCross = (
      smoothstep(0.026, 0.0, abs(local.x)) * smoothstep(0.21, 0.0, abs(local.y)) +
      smoothstep(0.026, 0.0, abs(local.y)) * smoothstep(0.21, 0.0, abs(local.x))
    ) * 0.62;
    float star = starMask * max(starCore, gridSparkCross);
    float pulse = 0.72 + 0.28 * sin(uTime * 2.2 + hash(cell + 7.0) * 6.283);
    float cursor = smoothstep(0.42, 0.0, length(p - uPointer * vec2(0.35, 0.25)));
    float cursorGlow = uPointerActive * smoothstep(uSpotlightRadius * 3.2, 0.0, length((uv - uPointerUv) * vec2(uResolution.x / max(uResolution.y, 1.0), 1.0)));
    float cursorRing = uPointerActive * (1.0 - smoothstep(0.004, 0.020 / max(uRingSharpness, 0.1), abs(length((uv - uPointerUv) * vec2(uResolution.x / max(uResolution.y, 1.0), 1.0)) - uSpotlightRadius)));
    vec3 cyan = vec3(0.04, 0.88, 1.0);
    vec3 violet = vec3(0.55, 0.32, 1.0);
    vec3 color = mix(cyan, violet, hash(cell + 1.0));
    color += cyan * cursorGlow * 0.65 + violet * cursorRing * 0.42;
    float alpha = grid + star * pulse * 0.95 + cursor * 0.12 + cursorGlow * 0.18 + cursorRing * 0.16;
    gl_FragColor = vec4(color, alpha);
  }
`;

const RADAR_FRAGMENT = `
  precision mediump float;
  varying vec2 vUv;
  uniform float uTime;

  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p);
    float a = atan(p.y, p.x);
    float rings = 0.0;
    rings += 1.0 - smoothstep(0.003, 0.010, abs(r - 0.16));
    rings += 1.0 - smoothstep(0.003, 0.010, abs(r - 0.28));
    rings += 1.0 - smoothstep(0.003, 0.010, abs(r - 0.42));
    float spokes = pow(abs(sin(a * 8.0)), 34.0) * smoothstep(0.60, 0.05, r);
    float sweepAngle = mod(uTime * 0.9, 6.28318) - 3.14159;
    float delta = abs(atan(sin(a - sweepAngle), cos(a - sweepAngle)));
    float sweep = smoothstep(0.34, 0.0, delta) * smoothstep(0.46, 0.08, r);
    float horizontalScan = smoothstep(0.055, 0.0, abs(p.y)) * smoothstep(0.54, 0.04, abs(p.x));
    float coreGlow = smoothstep(0.22, 0.0, r);
    vec3 cyan = vec3(0.04, 0.86, 1.0);
    vec3 violet = vec3(0.45, 0.30, 1.0);
    vec3 col = vec3(0.0);
    col += violet * rings * 0.16;
    col += cyan * rings * 0.12;
    col += violet * spokes * 0.16;
    col += cyan * spokes * 0.10;
    col += cyan * sweep * 0.42;
    col += cyan * horizontalScan * 0.48;
    col += vec3(0.30, 0.95, 1.0) * coreGlow * 0.10;
    float alpha = rings * 0.10 + spokes * 0.07 + sweep * 0.12 + horizontalScan * 0.14 + coreGlow * 0.05;
    gl_FragColor = vec4(col, alpha);
  }
`;

function addParticles(THREE, stage, options = {}) {
  const count = options.count || 900;
  const spreadX = options.spreadX || 11;
  const spreadY = options.spreadY || 6;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const index = i * 3;
    positions[index] = (Math.random() - 0.5) * spreadX;
    positions[index + 1] = (Math.random() - 0.5) * spreadY;
    positions[index + 2] = (Math.random() - 0.5) * 2.4;
    sizes[i] = 0.9 + Math.random() * 1.8;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.PointsMaterial({
    color: options.color || 0x22d3ee,
    size: options.size || 0.025,
    sizeAttenuation: true,
    transparent: true,
    opacity: options.opacity || 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const particles = new THREE.Points(geometry, material);
  particles.position.z = options.z || 0.6;
  stage.scene.add(particles);

  stage.onFrame((time) => {
    particles.rotation.z = Math.sin(time * 0.08) * 0.045;
    particles.rotation.y = time * 0.018;
    particles.position.x = stage.pointer.x * 0.16;
    particles.position.y = stage.pointer.y * 0.10;
    material.opacity = (options.opacity || 0.75) * (0.84 + Math.sin(time * 0.9) * 0.12);
  });
}

function createHeroNebula(THREE, canvas) {
  if (!canvas) return null;
  const stage = new WebGLStage(THREE, canvas, { cameraZ: 6.5, fov: 48 });
  shaderPlane(THREE, stage, HERO_FLOW_FRAGMENT, {
    intensity: 1,
    smokeBias: 0,
    cyanDamping: 0.82,
    flowStrength: 0.5,
    spotlightRadius: 0.064,
    sideDamping: 0.72,
    ribbonContrast: 0.5,
    darkMatter: 0.56,
    ringSharpness: 1.85,
    inkOcclusion: 0.76,
    lowerSmokeWeight: 1.18,
    hoverRingGain: 1.38,
    plumeWarp: 0.34,
    bottomFlameGain: 1.36,
    inkCutoutGain: 1.08,
    horizontalBreakup: 0.92,
    blending: THREE.NormalBlending,
  });
  addParticles(THREE, stage, { count: 720, spreadX: 12.5, spreadY: 6.8, size: 0.016, opacity: 0.38 });
  return stage.start();
}

function createInteractiveGrid(THREE, canvas) {
  if (!canvas) return null;
  const stage = new WebGLStage(THREE, canvas, { cameraZ: 5.8, fov: 46 });
  shaderPlane(THREE, stage, GRID_FRAGMENT, { intensity: 1.0, spotlightRadius: 0.072, ringSharpness: 1.35 });
  addParticles(THREE, stage, { count: 230, spreadX: 11, spreadY: 4.8, size: 0.018, opacity: 0.52, color: 0x8b5cf6 });
  return stage.start();
}

function createHudRadar(THREE, canvas) {
  if (!canvas) return null;
  const stage = new WebGLStage(THREE, canvas, { cameraZ: 5.5, fov: 44 });
  shaderPlane(THREE, stage, RADAR_FRAGMENT, { intensity: 1.0 });
  addParticles(THREE, stage, { count: 90, spreadX: 4.8, spreadY: 3.2, size: 0.018, opacity: 0.44 });
  return stage.start();
}

function createCtaNebula(THREE, canvas) {
  if (!canvas) return null;
  const stage = new WebGLStage(THREE, canvas, { cameraZ: 6.2, fov: 48 });
  shaderPlane(THREE, stage, CTA_NEBULA_FRAGMENT, {
    intensity: 1,
    smokeBias: 0,
    cyanDamping: 0.20,
    flowStrength: 0.52,
    spotlightRadius: 0.066,
    sideDamping: 0.54,
    ribbonContrast: 1.08,
    darkMatter: 0.68,
    ringSharpness: 1.75,
    inkOcclusion: 0.84,
    lowerSmokeWeight: 0.82,
    hoverRingGain: 1.45,
    plumeWarp: 0.27,
    bottomFlameGain: 0.76,
    inkCutoutGain: 1.18,
    horizontalBreakup: 0.84,
    blending: THREE.NormalBlending,
  });
  addParticles(THREE, stage, { count: 380, spreadX: 8.5, spreadY: 4.5, size: 0.017, opacity: 0.42, color: 0x22d3ee });
  return stage.start();
}

export async function initHomeWebGL({ root = document } = {}) {
  if (window.matchMedia(REDUCED_MOTION).matches) return [];

  const THREE = await loadThree();
  const stages = [
    createHeroNebula(THREE, getCanvas(root, 'hero-canvas')),
    createInteractiveGrid(THREE, getCanvas(root, 'grid-canvas')),
    createHudRadar(THREE, getCanvas(root, 'hud-canvas')),
    createCtaNebula(THREE, getCanvas(root, 'cta-canvas')),
  ].filter(Boolean);

  return stages.map((stage) => () => stage.dispose());
}
