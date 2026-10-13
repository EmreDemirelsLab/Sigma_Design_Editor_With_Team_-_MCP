// Geometri yardımcıları: gerçek sınır kutusu (selrect/points) ve SVG yol verisinin normalleştirilmesi.
import type { Json } from "./penpot.js";

export interface Box { x: number; y: number; w: number; h: number }

/** Bir şeklin sayfadaki sınır kutusu. Yol/bool şekillerinde x/y/width boş gelir; selrect ya da points kullanılır. */
export function bounds(o: Json): Box {
  const s = o?.selrect;
  if (s && Number.isFinite(s.x) && Number.isFinite(s.width)) return { x: s.x, y: s.y, w: s.width, h: s.height };
  if (Array.isArray(o?.points) && o.points.length) {
    const xs = o.points.map((p: Json) => p.x), ys = o.points.map((p: Json) => p.y);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  return { x: o?.x ?? 0, y: o?.y ?? 0, w: o?.width ?? 0, h: o?.height ?? 0 };
}

export const round = (n: number, p = 2) => { const k = 10 ** p; return Math.round((n ?? 0) * k) / k; };

// ---------- SVG yol verisi ----------
type Seg = { c: "M" | "L" | "C" | "Z"; p: number[] };

/** Herhangi bir SVG "d" metnini (göreli komutlar, H/V/S/Q/T/A dahil) mutlak M/L/C/Z dizisine çevirir. */
export function normalizePath(d: string): Seg[] {
  // Tarayıcı: sayılar ayraçsız bitişebilir ("1-2", ".5.5") ve yay bayrakları tek hanedir ("a41 41 0 000 18").
  let pos = 0; const len = d.length;
  const skip = () => { while (pos < len && /[\s,]/.test(d[pos])) pos++; };
  const bad = () => new Error(`Geçersiz yol verisi: "${d.slice(Math.max(0, pos - 20), pos + 40)}"`);
  const numRe = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;
  const num = () => { skip(); numRe.lastIndex = pos; const m = numRe.exec(d); if (!m) throw bad(); pos += m[0].length; return Number(m[0]); };
  const flag = () => { skip(); const c = d[pos]; if (c !== "0" && c !== "1") throw bad(); pos++; return Number(c); };
  const isNum = () => { skip(); return pos < len && /[-+.\d]/.test(d[pos]); };
  const out: Seg[] = []; let cmd = "", cx = 0, cy = 0, sx = 0, sy = 0, lcx = 0, lcy = 0, lqx = 0, lqy = 0, prev = "";
  while (true) {
    skip(); if (pos >= len) break;
    if (/[a-zA-Z]/.test(d[pos])) cmd = d[pos++]; else if (!cmd) throw new Error("Yol verisi bir komutla başlamalı (M)");
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const ax = (v: number) => rel ? cx + v : v, ay = (v: number) => rel ? cy + v : v;
    switch (C) {
      case "M": { const x = ax(num()), y = ay(num()); out.push({ c: "M", p: [x, y] }); cx = sx = x; cy = sy = y; cmd = rel ? "l" : "L"; prev = "M"; break; }
      case "L": { const x = ax(num()), y = ay(num()); out.push({ c: "L", p: [x, y] }); cx = x; cy = y; prev = "L"; break; }
      case "H": { const x = rel ? cx + num() : num(); out.push({ c: "L", p: [x, cy] }); cx = x; prev = "L"; break; }
      case "V": { const y = rel ? cy + num() : num(); out.push({ c: "L", p: [cx, y] }); cy = y; prev = "L"; break; }
      case "C": { const p = [ax(num()), ay(num()), ax(num()), ay(num()), ax(num()), ay(num())]; out.push({ c: "C", p }); lcx = p[2]; lcy = p[3]; cx = p[4]; cy = p[5]; prev = "C"; break; }
      case "S": { const r1x = prev === "C" ? 2 * cx - lcx : cx, r1y = prev === "C" ? 2 * cy - lcy : cy;
        const p = [r1x, r1y, ax(num()), ay(num()), ax(num()), ay(num())]; out.push({ c: "C", p }); lcx = p[2]; lcy = p[3]; cx = p[4]; cy = p[5]; prev = "C"; break; }
      case "Q": { const qx = ax(num()), qy = ay(num()), x = ax(num()), y = ay(num()); out.push({ c: "C", p: quadToCubic(cx, cy, qx, qy, x, y) }); lqx = qx; lqy = qy; cx = x; cy = y; prev = "Q"; break; }
      case "T": { const qx = prev === "Q" ? 2 * cx - lqx : cx, qy = prev === "Q" ? 2 * cy - lqy : cy, x = ax(num()), y = ay(num());
        out.push({ c: "C", p: quadToCubic(cx, cy, qx, qy, x, y) }); lqx = qx; lqy = qy; cx = x; cy = y; prev = "Q"; break; }
      case "A": { const rx = num(), ry = num(), rot = num(), large = flag(), sweep = flag(), x = ax(num()), y = ay(num());
        for (const p of arcToCubics(cx, cy, rx, ry, rot, !!large, !!sweep, x, y)) out.push({ c: "C", p });
        cx = x; cy = y; prev = "A"; break; }
      case "Z": out.push({ c: "Z", p: [] }); cx = sx; cy = sy; prev = "Z"; break;
      default: throw new Error(`Desteklenmeyen yol komutu: ${cmd}`);
    }
    if (C === "Z" && isNum()) throw new Error("Z komutundan sonra sayı gelemez");
  }
  if (!out.length || out[0].c !== "M") throw new Error("Yol verisi M ile başlamalı");
  return out;
}

const quadToCubic = (x0: number, y0: number, qx: number, qy: number, x: number, y: number) =>
  [x0 + 2 / 3 * (qx - x0), y0 + 2 / 3 * (qy - y0), x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y), x, y];

/** SVG eliptik yay → kübik Bézier parçaları (W3C SVG uygulama notları F.6). */
function arcToCubics(x1: number, y1: number, rx: number, ry: number, phiDeg: number, large: boolean, sweep: boolean, x2: number, y2: number): number[][] {
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return [[x1, y1, x2, y2, x2, y2]];
  rx = Math.abs(rx); ry = Math.abs(ry); const phi = phiDeg * Math.PI / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy;
  const lam = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry); if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
  const sign = large === sweep ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p, den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = sign * Math.sqrt(Math.max(0, num / den)), cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry); let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI; else if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.ceil(Math.abs(dt) / (Math.PI / 2)), step = dt / n, k = 4 / 3 * Math.tan(step / 4), segs: number[][] = [];
  const pt = (t: number) => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const dv = (t: number) => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  for (let j = 0; j < n; j++) { const a = t1 + j * step, b = a + step, [ax, ay] = pt(a), [bx, by] = pt(b), [dax, day] = dv(a), [dbx, dby] = dv(b);
    segs.push([ax + k * dax, ay + k * day, bx - k * dbx, by - k * dby, bx, by]); }
  return segs;
}

/** Normalleştirilmiş yolun tam sınır kutusu (kübik eğrilerin uç noktaları türevden bulunur). */
export function pathBox(segs: Seg[]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, cx = 0, cy = 0;
  const add = (x: number, y: number) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  for (const s of segs) {
    if (s.c === "M" || s.c === "L") { add(s.p[0], s.p[1]); cx = s.p[0]; cy = s.p[1]; }
    else if (s.c === "C") { const [a, b, c, d, e, f] = s.p; add(e, f);
      for (const t of [...extrema(cx, a, c, e)]) add(bez(cx, a, c, e, t), bez(cy, b, d, f, t));
      for (const t of [...extrema(cy, b, d, f)]) add(bez(cx, a, c, e, t), bez(cy, b, d, f, t));
      cx = e; cy = f; }
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
const bez = (p0: number, p1: number, p2: number, p3: number, t: number) => { const u = 1 - t; return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3; };
function extrema(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3, b = 2 * (p0 - 2 * p1 + p2), c = p1 - p0, out: number[] = [];
  if (Math.abs(a) < 1e-12) { if (Math.abs(b) > 1e-12) out.push(-c / b); }
  else { const disc = b * b - 4 * a * c; if (disc >= 0) { const s = Math.sqrt(disc); out.push((-b + s) / (2 * a), (-b - s) / (2 * a)); } }
  return out.filter(t => t > 0 && t < 1);
}

export const segsToString = (segs: Seg[], dx = 0, dy = 0) => segs.map(s => {
  if (s.c === "Z") return "Z";
  const p = s.p.map((v, i) => round(v + (i % 2 === 0 ? dx : dy), 3));
  return s.c + p.join(",");
}).join("");

/** Penpot'un döndürdüğü yol içeriğini (metin ya da komut dizisi) metne çevirir. */
export function contentToD(content: Json): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c: Json) => {
    const p = c.params ?? {};
    switch (c.command) {
      case "move-to": return `M${p.x},${p.y}`; case "line-to": return `L${p.x},${p.y}`;
      case "curve-to": return `C${p.c1x},${p.c1y},${p.c2x},${p.c2y},${p.x},${p.y}`; case "close-path": return "Z";
      default: return "";
    }
  }).join("");
  return "";
}

/** Yolu (dx,dy) kadar kaydırır — bileşen kopyalarında ve SVG'ye yerelleştirmede kullanılır. */
export const translateD = (d: string, dx: number, dy: number) => segsToString(normalizePath(d), dx, dy);
