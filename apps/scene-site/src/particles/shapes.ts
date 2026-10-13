// Şekil üreteçleri: her biri `count` parçacık için hedef konum dizisi (x,y,z) döndürür.
// Kaynaklar: Lucide ikonları (1.900+), metin ve parametrik geometriler. Hepsi yaklaşık [-4, 4] dünya biriminde.
import iconNodes from "./icon-subset.json"; // yalnız scenes.ts'te kullanılan ikonlar (scripts/icons.mjs üretir)

export type ShapeSpec =
  | { icon: string; depth?: number; thickness?: number }
  | { text: string; font?: string; weight?: number; depth?: number }
  | { preset: "globe" | "enso" | "galaxy" | "helix" | "wave" | "cube" | "torus" | "sphere" | "constellation" };

type Gen = (n: number) => Float32Array;
const rand = (a = -1, b = 1) => a + Math.random() * (b - a);
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/** Bir çizim fonksiyonunu tuvalde çalıştırır, opak pikselleri parçacık konumlarına örnekler (z = kalınlık). */
function sampleCanvas(n: number, draw: (ctx: CanvasRenderingContext2D, S: number) => void, depth: number, scale = 7.4): Float32Array {
  const S = 512, c = document.createElement("canvas"); c.width = c.height = S;
  const ctx = c.getContext("2d", { willReadFrequently: true })!; ctx.clearRect(0, 0, S, S); draw(ctx, S);
  const data = ctx.getImageData(0, 0, S, S).data; const pts: number[] = []; const w: number[] = [];
  for (let y = 0; y < S; y += 1) for (let x = 0; x < S; x += 1) { const a = data[(y * S + x) * 4 + 3]; if (a > 24) { pts.push(x, y); w.push(a); } }
  const out = new Float32Array(n * 3);
  if (!pts.length) return out;
  const m = pts.length / 2; const dust = Math.floor(n * 0.05);
  for (let i = 0; i < n - dust; i++) {
    const k = Math.floor(Math.random() * m); const px = pts[k * 2] + Math.random(), py = pts[k * 2 + 1] + Math.random();
    // ön/arka yüzeylerde yoğunlaşan derinlik → hacimli görünüm
    const face = Math.random() < 0.7 ? Math.sign(rand()) * (0.65 + Math.random() * 0.35) : rand();
    out[i * 3] = (px / S - 0.5) * scale; out[i * 3 + 1] = -(py / S - 0.5) * scale; out[i * 3 + 2] = face * depth * 0.5;
  }
  for (let i = n - dust; i < n; i++) { out[i * 3] = gauss() * 2.6; out[i * 3 + 1] = gauss() * 2.2; out[i * 3 + 2] = gauss() * 1.5; } // ortam tozu
  return out;
}

const nodes = iconNodes as unknown as Record<string, [string, Record<string, string | number>][]>;
export const iconNames = () => Object.keys(nodes);

/** Lucide ikonunu (24×24, kontur) tuvale çizip örnekler. */
function iconShape(name: string, depth = 1.5, thickness = 1.8): Gen {
  const els = nodes[name] ?? nodes["sparkles"];
  return n => sampleCanvas(n, (ctx, S) => {
    const k = S / 24 * 0.86, o = S * 0.07; ctx.setTransform(k, 0, 0, k, o, o);
    ctx.strokeStyle = "#fff"; ctx.fillStyle = "#fff"; ctx.lineWidth = thickness; ctx.lineCap = "round"; ctx.lineJoin = "round";
    const N = (v: unknown) => Number(v ?? 0);
    for (const [tag, a] of els) {
      ctx.beginPath();
      if (tag === "path") { ctx.stroke(new Path2D(String(a.d))); continue; }
      if (tag === "circle") ctx.arc(N(a.cx), N(a.cy), N(a.r), 0, Math.PI * 2);
      else if (tag === "ellipse") ctx.ellipse(N(a.cx), N(a.cy), N(a.rx), N(a.ry), 0, 0, Math.PI * 2);
      else if (tag === "rect") ctx.roundRect(N(a.x), N(a.y), N(a.width), N(a.height), N(a.rx ?? 0));
      else if (tag === "line") { ctx.moveTo(N(a.x1), N(a.y1)); ctx.lineTo(N(a.x2), N(a.y2)); }
      else if (tag === "polyline" || tag === "polygon") { const p = String(a.points).trim().split(/[\s,]+/).map(Number); ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]); if (tag === "polygon") ctx.closePath(); }
      ctx.stroke();
    }
  }, depth);
}

function textShape(text: string, font = "Hanken Grotesk", weight = 700, depth = 1.3): Gen {
  return n => sampleCanvas(n, (ctx, S) => {
    let size = S * 0.42; ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    do { ctx.font = `${weight} ${size}px "${font}", sans-serif`; size *= 0.92; } while (ctx.measureText(text).width > S * 0.9 && size > 12);
    ctx.fillText(text, S / 2, S / 2);
  }, depth);
}

const PRESETS: Record<string, Gen> = {
  sphere: n => { const o = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const u = rand(), t = Math.random() * Math.PI * 2, r = 2.7 + gauss() * 0.03, s = Math.sqrt(1 - u * u);
    o[i * 3] = r * s * Math.cos(t); o[i * 3 + 1] = r * u; o[i * 3 + 2] = r * s * Math.sin(t); } return o; },
  globe: n => { const o = new Float32Array(n * 3), R = 2.8; for (let i = 0; i < n; i++) { const kind = Math.random(); let lat: number, lon: number;
      if (kind < 0.45) { lat = (Math.round(rand(-4, 4)) / 4.5) * (Math.PI / 2); lon = Math.random() * Math.PI * 2; }        // enlemler
      else if (kind < 0.85) { lon = Math.round(rand(0, 12)) / 12 * Math.PI * 2; lat = rand(-1, 1) * Math.PI / 2; }        // boylamlar
      else { lat = Math.asin(rand()); lon = Math.random() * Math.PI * 2; }                                                    // yüzey tozu
      const r = R + gauss() * 0.02; o[i * 3] = r * Math.cos(lat) * Math.cos(lon); o[i * 3 + 1] = r * Math.sin(lat); o[i * 3 + 2] = r * Math.cos(lat) * Math.sin(lon); } return o; },
  enso: n => { const o = new Float32Array(n * 3); for (let i = 0; i < n; i++) { // fırça darbesi: açıklık sağ üstte, kalınlık profilli
      const t = Math.random(), a = (124 + t * 300) * Math.PI / 180, w = 0.18 + 0.32 * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (t < 0.08 ? 1.6 : 1) * (t > 0.88 ? (1 - t) / 0.12 : 1);
      const r = 2.6 + (Math.random() - 0.5) * w * 2; o[i * 3] = r * Math.cos(a); o[i * 3 + 1] = -r * Math.sin(a); o[i * 3 + 2] = gauss() * 0.12; } return o; },
  galaxy: n => { const o = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const arm = i % 3, d = Math.pow(Math.random(), 0.7) * 3.6, a = d * 1.5 + arm * Math.PI * 2 / 3;
      o[i * 3] = Math.cos(a) * d + gauss() * 0.18 * (1 + d * 0.2); o[i * 3 + 1] = gauss() * 0.12 * (3.6 - d) * 0.4; o[i * 3 + 2] = Math.sin(a) * d + gauss() * 0.18; } return o; },
  helix: n => { const o = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const t = rand(-1, 1) * 3.2, s = i % 5 === 0 ? 2 : i % 2, a = t * 2.2 + (s === 1 ? Math.PI : 0);
      if (s === 2) { const f = Math.random(), a0 = t * 2.2; o[i * 3] = Math.cos(a0) * 1.2 * (2 * f - 1); o[i * 3 + 1] = Math.round(t * 3) / 3; o[i * 3 + 2] = Math.sin(a0) * 1.2 * (2 * f - 1); }
      else { o[i * 3] = Math.cos(a) * 1.2 + gauss() * 0.05; o[i * 3 + 1] = t; o[i * 3 + 2] = Math.sin(a) * 1.2 + gauss() * 0.05; } } return o; },
  wave: n => { const o = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const x = rand(-4, 4), z = rand(-3, 3);
      o[i * 3] = x; o[i * 3 + 1] = Math.sin(x * 1.1) * 0.5 + Math.cos(z * 1.3) * 0.4; o[i * 3 + 2] = z; } return o; },
  cube: n => { const o = new Float32Array(n * 3), h = 1.9; for (let i = 0; i < n; i++) { const e = Math.floor(Math.random() * 12), t = rand(-h, h), ax = Math.floor(e / 4), s1 = e % 2 ? h : -h, s2 = (e >> 1) % 2 ? h : -h;
      const p = ax === 0 ? [t, s1, s2] : ax === 1 ? [s1, t, s2] : [s1, s2, t]; o[i * 3] = p[0] + gauss() * 0.03; o[i * 3 + 1] = p[1] + gauss() * 0.03; o[i * 3 + 2] = p[2] + gauss() * 0.03; } return o; },
  torus: n => { const o = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const u = Math.random() * Math.PI * 2, v = Math.random() * Math.PI * 2, R = 2.2, r = 0.7;
      o[i * 3] = (R + r * Math.cos(v)) * Math.cos(u); o[i * 3 + 1] = r * Math.sin(v); o[i * 3 + 2] = (R + r * Math.cos(v)) * Math.sin(u); } return o; },
  constellation: n => { const o = new Float32Array(n * 3); const hubs = Array.from({ length: 14 }, () => [gauss() * 2.2, gauss() * 1.6, gauss() * 1.2]);
    for (let i = 0; i < n; i++) { const a = hubs[i % hubs.length], b = hubs[(i * 7 + 3) % hubs.length]; if (Math.random() < 0.35) { o[i * 3] = a[0] + gauss() * 0.12; o[i * 3 + 1] = a[1] + gauss() * 0.12; o[i * 3 + 2] = a[2] + gauss() * 0.12; }
      else { const t = Math.random(); o[i * 3] = a[0] + (b[0] - a[0]) * t; o[i * 3 + 1] = a[1] + (b[1] - a[1]) * t; o[i * 3 + 2] = a[2] + (b[2] - a[2]) * t; } } return o; },
};

/** Şekli üretir; parçacık sırası karıştırılır ki geçişler çizgisel değil bulut gibi aksın. */
export function buildShape(spec: ShapeSpec, n: number): Float32Array {
  const gen: Gen = "icon" in spec ? iconShape(spec.icon, spec.depth, spec.thickness) : "text" in spec ? textShape(spec.text, spec.font, spec.weight, spec.depth) : PRESETS[spec.preset] ?? PRESETS.sphere;
  const a = gen(n);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); for (let k = 0; k < 3; k++) { const t = a[i * 3 + k]; a[i * 3 + k] = a[j * 3 + k]; a[j * 3 + k] = t; } }
  return a;
}
