// Parçacık motoru: tek bir Points nesnesi, CPU'da yumuşak hedef takibi (morph), imleç şok dalgası, uyku/uyanma.
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, Euler, PerspectiveCamera, Points, Scene, ShaderMaterial, Vector2, Vector3, WebGLRenderer } from "three";
import { buildShape, type ShapeSpec } from "./shapes";

export interface EngineOptions { canvas: HTMLCanvasElement; reducedMotion: boolean }
export interface SceneVisual { shape: ShapeSpec; color: [number, number, number]; rotation?: [number, number, number]; scale?: number }

const VERT = /* glsl */ `
attribute float aScale;
uniform float uSize; uniform float uPixelRatio; uniform float uTime;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * aScale * uPixelRatio * (12.0 / -mv.z);
  vAlpha = 0.55 + 0.45 * sin(uTime * 0.6 + aScale * 40.0); // hafif pırıltı
}`;
const FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uOpacity;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d); a = pow(a, 1.8);   // yumuşak ışıyan disk
  gl_FragColor = vec4(uColor, a * uOpacity * vAlpha);
}`;

export class ParticleEngine {
  private renderer: WebGLRenderer; private scene = new Scene(); private camera: PerspectiveCamera;
  private points: Points; private geo = new BufferGeometry(); private mat: ShaderMaterial;
  private pos: Float32Array; private target: Float32Array; private phase: Float32Array; private cache = new Map<string, Float32Array>();
  readonly count: number; private reduced: boolean;
  private raf = 0; private running = false; private idleTimer = 0; private last = 0; private t = 0;
  private mouse = new Vector2(); private cursorWorld = new Vector3(); private shock = 0;
  private rot = new Euler(); private targetRot = new Euler(); private targetScale = 1; private offsetX = 0; private offsetY = 0; private layout: "side" | "center" = "center"; private baseScale = 1; private targetColor = new Color();

  constructor(private opts: EngineOptions) {
    this.reduced = opts.reducedMotion;
    const mobile = window.innerWidth < 720, weak = (navigator.hardwareConcurrency ?? 8) <= 4;
    this.count = this.reduced ? 18000 : mobile || weak ? 22000 : 60000;
    this.renderer = new WebGLRenderer({ canvas: opts.canvas, antialias: false, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.camera = new PerspectiveCamera(50, 1, 0.1, 100); this.camera.position.z = 12;
    this.pos = new Float32Array(this.count * 3); this.target = new Float32Array(this.count * 3); this.phase = new Float32Array(this.count);
    const scale = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) { this.phase[i] = Math.random() * Math.PI * 2; scale[i] = 0.55 + Math.random() * 0.9;
      // başlangıç: geniş bir bulut
      this.pos[i * 3] = (Math.random() - 0.5) * 18; this.pos[i * 3 + 1] = (Math.random() - 0.5) * 12; this.pos[i * 3 + 2] = (Math.random() - 0.5) * 8; }
    this.geo.setAttribute("position", new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage));
    this.geo.setAttribute("aScale", new BufferAttribute(scale, 1));
    this.mat = new ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending,
      uniforms: { uSize: { value: mobile ? 2.4 : 2.0 }, uPixelRatio: { value: this.renderer.getPixelRatio() }, uTime: { value: 0 }, uColor: { value: new Color(0.6, 0.8, 1) }, uOpacity: { value: 0.85 } } });
    this.points = new Points(this.geo, this.mat); this.points.frustumCulled = false; this.scene.add(this.points);
    this.resize();
    window.addEventListener("resize", this.resize);
    window.addEventListener("pointermove", this.onPointer, { passive: true });
    document.addEventListener("visibilitychange", this.onVisibility);
    for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"]) window.addEventListener(ev, this.wake, { passive: true });
  }

  /** Sahne değişimi: hedef şekil, renk, açı ve ölçek. Şekiller önbelleğe alınır. */
  show(v: SceneVisual, layout: "side" | "center") {
    const key = JSON.stringify(v.shape);
    let t = this.cache.get(key); if (!t) { t = buildShape(v.shape, this.count); this.cache.set(key, t); }
    this.target = t; this.targetColor.setRGB(...v.color);
    const r = v.rotation ?? [0.2, -0.62, 0.05]; this.targetRot.set(r[0], r[1], r[2]); this.layout = layout; this.baseScale = v.scale ?? 1; this.fit();
    this.shock = Math.max(this.shock, 0.6);
    if (this.reduced) { this.pos.set(this.target); this.mat.uniforms.uColor.value.copy(this.targetColor); this.applyTransform(1); this.geo.attributes.position.needsUpdate = true; this.render(); }
    else this.wake();
  }
  /** Önceden şekilleri hazırla (ilk geçişte takılma olmasın). */
  prewarm(specs: ShapeSpec[]) { const run = (i: number) => { if (i >= specs.length) return; const k = JSON.stringify(specs[i]); if (!this.cache.has(k)) this.cache.set(k, buildShape(specs[i], this.count)); (window.requestIdleCallback ?? setTimeout)(() => run(i + 1)); }; run(0); }

  /** Görünür alana göre ölçek ve konum: masaüstünde sağ yarı, dar ekranda metnin üstündeki alan. */
  private fit() {
    const h = Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.position.z, w = h * this.camera.aspect, narrow = window.innerWidth < 900;
    const fitW = narrow ? Math.min(1, (w * 0.92) / 3.8) : 1;
    this.targetScale = this.baseScale * fitW * (narrow && this.layout === "side" ? 0.82 : 1);
    this.offsetX = this.layout === "side" && !narrow ? this.sideOffset() : 0;
    this.offsetY = this.layout === "side" && narrow ? h * 0.36 : 0;
  }
  private sideOffset() { const h = Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.position.z, w = h * this.camera.aspect; return w * 0.42; }
  private resize = () => { const w = window.innerWidth, h = window.innerHeight; this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h, false);
    this.mat.uniforms.uPixelRatio.value = this.renderer.getPixelRatio(); this.fit(); if (this.reduced) { this.applyTransform(1); this.render(); } };
  private onPointer = (e: PointerEvent) => { this.mouse.set(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5);
    const h = Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.position.z, w = h * this.camera.aspect;
    this.cursorWorld.set(this.mouse.x * 2 * w, -this.mouse.y * 2 * h, 0); this.shock = 1; this.wake(); };
  private onVisibility = () => (document.hidden ? this.sleep() : this.wake());

  wake = () => { if (this.reduced) return; window.clearTimeout(this.idleTimer); this.idleTimer = window.setTimeout(this.sleep, 90000);
    if (!this.running) { this.running = true; this.last = 0; this.raf = requestAnimationFrame(this.frame); } };
  sleep = () => { this.running = false; cancelAnimationFrame(this.raf); };

  private applyTransform(k: number) {
    this.rot.x += (this.targetRot.x - this.rot.x) * k; this.rot.y += (this.targetRot.y - this.rot.y) * k; this.rot.z += (this.targetRot.z - this.rot.z) * k;
    const sway = this.reduced ? 0 : Math.sin(this.t * 0.25) * 0.12;
    this.points.rotation.set(this.rot.x + this.mouse.y * 0.12, this.rot.y + sway + this.mouse.x * 0.25, this.rot.z);
    const s = this.points.scale.x + (this.targetScale - this.points.scale.x) * k; this.points.scale.setScalar(s);
    this.points.position.x += (this.offsetX - this.points.position.x) * k; this.points.position.y += (this.offsetY - this.points.position.y) * k;
  }

  private frame = (now: number) => {
    if (!this.running) return; this.raf = requestAnimationFrame(this.frame);
    const dt = this.last ? Math.min((now - this.last) / (1000 / 60), 4) : 1; this.last = now; this.t += dt / 60;
    const ease = 1 - Math.pow(1 - 0.075, dt), p = this.pos, tg = this.target, ph = this.phase, n = this.count, T = this.t;
    // imleç: dünya → nesnenin yerel uzayı
    let cx = 0, cy = 0, cz = 0; const shock = (this.shock *= Math.pow(0.94, dt));
    if (shock > 0.02) { this.points.updateMatrixWorld(); const l = this.points.worldToLocal(this.cursorWorld.clone()); cx = l.x; cy = l.y; cz = l.z; }
    const R2 = 1.6 * 1.6, push = 0.22 * shock * dt, amp = 0.035;
    for (let i = 0, j = 0; i < n; i++, j += 3) {
      const f = ph[i];
      const tx = tg[j] + Math.sin(T * 0.9 + f) * amp, ty = tg[j + 1] + Math.cos(T * 0.8 + f * 1.3) * amp, tz = tg[j + 2] + Math.sin(T * 0.7 + f * 0.7) * amp;
      let x = p[j] + (tx - p[j]) * ease, y = p[j + 1] + (ty - p[j + 1]) * ease, z = p[j + 2] + (tz - p[j + 2]) * ease;
      if (shock > 0.02) { const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy; if (d2 < R2) { const d = Math.sqrt(d2) + 1e-4, k = (1 - d / 1.6) * push; x += (dx / d) * k; y += (dy / d) * k; z += (z - cz) * 0.02 * k; } }
      p[j] = x; p[j + 1] = y; p[j + 2] = z;
    }
    this.geo.attributes.position.needsUpdate = true;
    (this.mat.uniforms.uColor.value as Color).lerp(this.targetColor, ease * 0.6);
    this.mat.uniforms.uTime.value = T; this.applyTransform(ease * 0.8); this.render();
  };
  private render() { this.renderer.render(this.scene, this.camera); }
  dispose() { this.sleep(); window.removeEventListener("resize", this.resize); window.removeEventListener("pointermove", this.onPointer); document.removeEventListener("visibilitychange", this.onVisibility);
    for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"]) window.removeEventListener(ev, this.wake); this.geo.dispose(); this.mat.dispose(); this.renderer.dispose(); }
}
