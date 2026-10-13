// Vektör araçları: boolean işlemler (paper.js), logo kurgu şekilleri ve Lucide ikonları.
import { createRequire } from "node:module";
import type { Json } from "./penpot.js";
import { bounds, contentToD, normalizePath, round, segsToString } from "./geom.js";

const require = createRequire(import.meta.url);
// paper-core: tarayıcı/canvas gerektirmeyen çekirdek; boolean işlemler için yeterli
const paper = require("paper/dist/paper-core.js");
paper.setup(new paper.Size(1, 1));

// ---------- şekil → SVG yolu ----------
const f = (n: number) => round(n, 3);
export function rectD(x: number, y: number, w: number, h: number, r: number[] = [0, 0, 0, 0]): string {
  const [a, b, c, d] = r.map(v => Math.max(0, Math.min(v ?? 0, w / 2, h / 2))); const k = 0.5523;
  return `M${f(x + a)},${f(y)}L${f(x + w - b)},${f(y)}${b ? `C${f(x + w - b + b * k)},${f(y)},${f(x + w)},${f(y + b - b * k)},${f(x + w)},${f(y + b)}` : ""}L${f(x + w)},${f(y + h - c)}${c ? `C${f(x + w)},${f(y + h - c + c * k)},${f(x + w - c + c * k)},${f(y + h)},${f(x + w - c)},${f(y + h)}` : ""}L${f(x + d)},${f(y + h)}${d ? `C${f(x + d - d * k)},${f(y + h)},${f(x)},${f(y + h - d + d * k)},${f(x)},${f(y + h - d)}` : ""}L${f(x)},${f(y + a)}${a ? `C${f(x)},${f(y + a - a * k)},${f(x + a - a * k)},${f(y)},${f(x + a)},${f(y)}` : ""}Z`;
}
export const ellipseD = (cx: number, cy: number, rx: number, ry: number) =>
  `M${f(cx - rx)},${f(cy)}A${f(rx)},${f(ry)} 0 1 0 ${f(cx + rx)},${f(cy)}A${f(rx)},${f(ry)} 0 1 0 ${f(cx - rx)},${f(cy)}Z`;

/** Penpot şeklini kapalı SVG yoluna çevirir (rect/circle/path/bool/frame). Metinler için önce text-to-path gerekir. */
export function shapeToD(o: Json): string {
  const b = bounds(o);
  if (o.type === "rect" || o.type === "frame") return rectD(b.x, b.y, b.w, b.h, [o.r1, o.r2, o.r3, o.r4]);
  if (o.type === "circle") return ellipseD(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2);
  if (o.type === "path" || o.type === "bool") return contentToD(o.content);
  throw new Error(`Boolean işlemi için desteklenmeyen şekil türü: ${o.type} (${o.name}). Metni önce penpot_text_to_path ile vektöre çevirin.`);
}

export type BoolOp = "union" | "subtract" | "intersect" | "exclude";
/** Sıra önemlidir: subtract'ta ilk şekilden sonrakiler çıkarılır. */
export function booleanD(ds: string[], op: BoolOp): string {
  // paper yay (A) ayrıştırmasında kırılgan: önce yaysız M/L/C/Z biçimine çevir
  const items = ds.map(d => paper.PathItem.create(segsToString(normalizePath(d))));
  let acc = items[0];
  for (const it of items.slice(1)) acc = op === "union" ? acc.unite(it) : op === "subtract" ? acc.subtract(it) : op === "intersect" ? acc.intersect(it) : acc.exclude(it);
  const d = acc.pathData as string; items.forEach(i => i.remove()); acc.remove();
  if (!d) throw new Error("Boolean sonucu boş (şekiller kesişmiyor olabilir)");
  return d;
}

// ---------- logo kurgu şekilleri ----------
const P = (cx: number, cy: number, r: number, deg: number) => [cx + r * Math.cos(deg * Math.PI / 180), cy + r * Math.sin(deg * Math.PI / 180)];
export interface PrimitiveSpec { kind: "polygon" | "star" | "ring" | "sector" | "arc" | "squircle" | "line"; cx: number; cy: number; radius: number;
  sides?: number; innerRadius?: number; startAngle?: number; endAngle?: number; rotation?: number; width?: number; height?: number; smoothness?: number; x2?: number; y2?: number }
export function primitiveD(s: PrimitiveSpec): { d: string; stroked: boolean } {
  const rot = s.rotation ?? -90; const n = Math.max(3, Math.round(s.sides ?? 6));
  switch (s.kind) {
    case "polygon": { const pts = Array.from({ length: n }, (_, i) => P(s.cx, s.cy, s.radius, rot + i * 360 / n)); return { d: `M${pts.map(p => p.map(f).join(",")).join("L")}Z`, stroked: false }; }
    case "star": { const ir = s.innerRadius ?? s.radius * 0.5; const pts = Array.from({ length: n * 2 }, (_, i) => P(s.cx, s.cy, i % 2 ? ir : s.radius, rot + i * 180 / n));
      return { d: `M${pts.map(p => p.map(f).join(",")).join("L")}Z`, stroked: false }; }
    case "ring": { const ir = s.innerRadius ?? s.radius * 0.7; return { d: booleanD([ellipseD(s.cx, s.cy, s.radius, s.radius), ellipseD(s.cx, s.cy, ir, ir)], "subtract"), stroked: false }; }
    case "sector": { const a0 = s.startAngle ?? 0, a1 = s.endAngle ?? 90, ir = s.innerRadius ?? 0, large = Math.abs(a1 - a0) % 360 > 180 ? 1 : 0;
      const [ox0, oy0] = P(s.cx, s.cy, s.radius, a0), [ox1, oy1] = P(s.cx, s.cy, s.radius, a1);
      if (!ir) return { d: `M${f(s.cx)},${f(s.cy)}L${f(ox0)},${f(oy0)}A${f(s.radius)},${f(s.radius)} 0 ${large} 1 ${f(ox1)},${f(oy1)}Z`, stroked: false };
      const [ix1, iy1] = P(s.cx, s.cy, ir, a1), [ix0, iy0] = P(s.cx, s.cy, ir, a0);
      return { d: `M${f(ox0)},${f(oy0)}A${f(s.radius)},${f(s.radius)} 0 ${large} 1 ${f(ox1)},${f(oy1)}L${f(ix1)},${f(iy1)}A${f(ir)},${f(ir)} 0 ${large} 0 ${f(ix0)},${f(iy0)}Z`, stroked: false }; }
    case "arc": { const a0 = s.startAngle ?? 0, a1 = s.endAngle ?? 270, large = Math.abs(a1 - a0) % 360 > 180 ? 1 : 0;
      const [x0, y0] = P(s.cx, s.cy, s.radius, a0), [x1, y1] = P(s.cx, s.cy, s.radius, a1);
      return { d: `M${f(x0)},${f(y0)}A${f(s.radius)},${f(s.radius)} 0 ${large} 1 ${f(x1)},${f(y1)}`, stroked: true }; }
    case "squircle": { // süperelips |x/a|^n + |y/b|^n = 1 — iOS uygulama simgesi biçimi (n≈5)
      const a = (s.width ?? s.radius * 2) / 2, b = (s.height ?? s.radius * 2) / 2, e = s.smoothness ?? 5, pts: string[] = [];
      for (let i = 0; i < 96; i++) { const t = i / 96 * 2 * Math.PI, c = Math.cos(t), si = Math.sin(t);
        pts.push(`${f(s.cx + a * Math.sign(c) * Math.abs(c) ** (2 / e))},${f(s.cy + b * Math.sign(si) * Math.abs(si) ** (2 / e))}`); }
      return { d: `M${pts.join("L")}Z`, stroked: false }; }
    case "line": return { d: `M${f(s.cx)},${f(s.cy)}L${f(s.x2 ?? s.cx + s.radius)},${f(s.y2 ?? s.cy)}`, stroked: true };
  }
}

// ---------- Lucide ikonları ----------
let iconNodes: Record<string, [string, Json][]> | null = null, iconTags: Record<string, string[]> | null = null;
const loadIcons = () => { if (!iconNodes) { iconNodes = require("lucide-static/icon-nodes.json"); iconTags = require("lucide-static/tags.json"); } return { nodes: iconNodes!, tags: iconTags! }; };

export function searchIcons(query: string, limit = 40): { name: string; tags: string[] }[] {
  const { nodes, tags } = loadIcons(); const q = query.toLowerCase().trim(); const words = q.split(/\s+/);
  const scored: { name: string; tags: string[]; s: number }[] = [];
  for (const name of Object.keys(nodes)) { const t = tags[name] ?? []; let s = 0;
    if (name === q.replace(/\s+/g, "-")) s += 100; if (name.includes(q.replace(/\s+/g, "-"))) s += 20;
    for (const w of words) { if (name.split("-").includes(w)) s += 10; else if (name.includes(w)) s += 4; if (t.some(x => x === w)) s += 6; else if (t.some(x => x.includes(w))) s += 2; }
    if (s) scored.push({ name, tags: t.slice(0, 6), s }); }
  return scored.sort((a, b) => b.s - a.s || a.name.length - b.name.length).slice(0, limit).map(({ name, tags }) => ({ name, tags }));
}

/** Lucide ikonunu (24×24, 2px kontur) tek SVG yoluna çevirir; size ve konuma ölçekler. */
export function iconD(name: string, x: number, y: number, size: number): string {
  const { nodes } = loadIcons(); const els = nodes[name];
  if (!els) { const alt = searchIcons(name, 5).map(i => i.name).join(", "); throw new Error(`İkon yok: "${name}". Yakın sonuçlar: ${alt || "—"}. penpot_search_icons ile arayın.`); }
  const k = size / 24, X = (v: number) => f(x + v * k), Y = (v: number) => f(y + v * k), N = (v: Json) => Number(v ?? 0);
  const parts: string[] = [];
  for (const [tag, a] of els) {
    if (tag === "path") parts.push(scaleD(a.d, x, y, k));
    else if (tag === "circle") parts.push(ellipseD(x + N(a.cx) * k, y + N(a.cy) * k, N(a.r) * k, N(a.r) * k));
    else if (tag === "ellipse") parts.push(ellipseD(x + N(a.cx) * k, y + N(a.cy) * k, N(a.rx) * k, N(a.ry) * k));
    else if (tag === "rect") { const rx = N(a.rx ?? a.ry) * k; parts.push(rectD(x + N(a.x) * k, y + N(a.y) * k, N(a.width) * k, N(a.height) * k, [rx, rx, rx, rx])); }
    else if (tag === "line") parts.push(`M${X(N(a.x1))},${Y(N(a.y1))}L${X(N(a.x2))},${Y(N(a.y2))}`);
    else if (tag === "polyline" || tag === "polygon") { const nums = String(a.points).trim().split(/[\s,]+/).map(Number); const pts: string[] = [];
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push(`${X(nums[i])},${Y(nums[i + 1])}`); parts.push(`M${pts.join("L")}${tag === "polygon" ? "Z" : ""}`); }
  }
  return parts.join("");
}
/** Göreli/mutlak her SVG yolunu (x,y) + ölçek k ile dönüştürür (kendi ayrıştırıcımız: yaylar kübiğe çevrilir). */
function scaleD(d: string, x: number, y: number, k: number): string {
  return normalizePath(d).map(s => s.c === "Z" ? "Z" : s.c + s.p.map((v, i) => f(i % 2 === 0 ? x + v * k : y + v * k)).join(",")).join("");
}

// ---------- nokta sanatı (parçacık çizimi) ----------
export type DotSource = { icon: string } | { d: string; mode?: "stroke" | "fill" } | { preset: "globe" | "enso" | "galaxy" | "sphere" | "wave" | "ring" };
export interface DotArtSpec { source: DotSource; x: number; y: number; size: number; dots: number; strokeWidth?: number; layers?: number; seed?: number }

/** Kaynağı noktalara örnekler ve katman başına bir bileşik yol döndürür (katmanlar: arka plan tozu → ana çizgi → parlak çekirdek). */
export function dotArt(spec: DotArtSpec): { layer: number; d: string; dots: number }[] {
  let s = spec.seed ?? 7; const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const gauss = () => { const u = rnd() || 1e-9, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const pts: [number, number, number][] = []; // x, y (0..1 kutu), yoğunluk 0..1
  const S = spec.size, N = spec.dots;
  const src = spec.source;
  if ("preset" in src) {
    for (let i = 0; i < N; i++) { let x = 0, y = 0, b = 0.6 + rnd() * 0.4;
      if (src.preset === "globe" || src.preset === "sphere") { const lat = src.preset === "globe" && rnd() < 0.8 ? (rnd() < 0.5 ? Math.round((rnd() * 2 - 1) * 4) / 4.5 * Math.PI / 2 : Math.asin(rnd() * 2 - 1)) : Math.asin(rnd() * 2 - 1);
        const lon = src.preset === "globe" && rnd() < 0.45 ? Math.round(rnd() * 12) / 12 * Math.PI * 2 : rnd() * Math.PI * 2; const cx = Math.cos(lat) * Math.cos(lon + 0.6), cz = Math.cos(lat) * Math.sin(lon + 0.6);
        x = 0.5 + 0.45 * cx; y = 0.5 - 0.45 * (Math.sin(lat) * 0.96 + cz * 0.12); b *= 0.45 + 0.55 * (cz + 1) / 2; }
      else if (src.preset === "enso") { const t = rnd(), a = (124 + t * 300) * Math.PI / 180, w = 0.035 + 0.06 * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (t > 0.88 ? (1 - t) / 0.12 : 1); const r = 0.4 + (rnd() - 0.5) * w * 2; x = 0.5 + r * Math.cos(a); y = 0.5 - r * Math.sin(a); }
      else if (src.preset === "galaxy") { const arm = i % 3, d = Math.pow(rnd(), 0.7) * 0.46, a = d * 11 + arm * Math.PI * 2 / 3; x = 0.5 + Math.cos(a) * d + gauss() * 0.02; y = 0.5 + Math.sin(a) * d * 0.55 + gauss() * 0.015; b *= 1 - d; }
      else if (src.preset === "wave") { const u = rnd(), v = rnd(); x = u; y = 0.5 + Math.sin(u * 7) * 0.08 + (v - 0.5) * 0.5 * 0.4 + Math.cos(v * 9) * 0.04; b *= 0.4 + v * 0.6; }
      else { const a = rnd() * Math.PI * 2, r = 0.36 + gauss() * 0.025; x = 0.5 + r * Math.cos(a); y = 0.5 + r * Math.sin(a); }
      pts.push([x, y, b]); }
  } else {
    // yol: ikon (kontur) ya da verilen d (kontur/dolgu)
    const d = "icon" in src ? iconD(src.icon, 0, 0, 24) : src.d; const mode = "icon" in src ? "stroke" : src.mode ?? "fill";
    const item = paper.PathItem.create(segsToString(normalizePath(d))); const bb = item.bounds; const k = 1 / Math.max(bb.width, bb.height);
    const ox = (1 - bb.width * k) / 2, oy = (1 - bb.height * k) / 2; const norm = (px: number, py: number): [number, number] => [ox + (px - bb.x) * k, oy + (py - bb.y) * k];
    if (mode === "stroke") { const sw = (spec.strokeWidth ?? 1.8) / 24 * Math.max(bb.width, bb.height); const paths: Json[] = item.children ?? [item]; const total = paths.reduce((a: number, p: Json) => a + p.length, 0);
      for (const p of paths) { const n = Math.round(N * 0.9 * p.length / total); for (let i = 0; i < n; i++) { const off = rnd() * p.length, pt = p.getPointAt(off), nr = p.getNormalAt(off); if (!pt) continue;
        const j = (rnd() - 0.5) * sw; const [x, y] = norm(pt.x + (nr?.x ?? 0) * j, pt.y + (nr?.y ?? 0) * j); pts.push([x, y, 0.55 + rnd() * 0.45]); } } }
    else { let tries = 0; while (pts.length < N * 0.9 && tries++ < N * 40) { const px = bb.x + rnd() * bb.width, py = bb.y + rnd() * bb.height; if (item.contains(new paper.Point(px, py))) { const [x, y] = norm(px, py); pts.push([x, y, 0.55 + rnd() * 0.45]); } } }
    item.remove();
    for (let i = pts.length; i < N; i++) pts.push([0.5 + gauss() * 0.28, 0.5 + gauss() * 0.24, 0.15 + rnd() * 0.25]); // ortam tozu
  }
  const L = Math.max(1, Math.min(4, spec.layers ?? 3)); const layers: string[][] = Array.from({ length: L }, () => []); const counts = new Array(L).fill(0);
  for (const [x, y, b] of pts) { const li = Math.min(L - 1, Math.floor(b * L)); const r = (0.35 + b * 0.75) * S / 520; const cx = spec.x + x * S, cy = spec.y + y * S;
    // 1-3px boyutta kare nokta gözle daireden ayırt edilmez; yol verisi 4 kat küçük kalır
    const q = round(r * 2, 2); layers[li].push(`M${round(cx - r, 2)},${round(cy - r, 2)}h${q}v${q}h${-q}Z`); counts[li]++; }
  return layers.map((l, i) => ({ layer: i, d: l.join(""), dots: counts[i] })).filter(l => l.dots);
}
