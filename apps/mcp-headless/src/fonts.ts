// Font motoru: gerçek font dosyalarıyla metin ölçümü, satır kırma, Penpot positionData üretimi ve metni vektöre çevirme.
// Fontlar Penpot'un kendi Google Fonts vekilinden (/internal/gfonts) alınır; dışarıya doğrudan bağlantı gerekmez.
import * as fontkit from "fontkit";
import { cfg } from "./config.js";
import { log } from "./log.js";
import type { Json } from "./penpot.js";

type Font = fontkit.Font;
export interface RunStyle { fontFamily: string; fontWeight: string; fontStyle: string; fontSize: number; letterSpacing: number; lineHeight: number; textTransform?: string }
export interface Run { text: string; style: RunStyle; leaf: Json }
export interface LineSeg { text: string; x: number; width: number; style: RunStyle; leaf: Json }
export interface Line { segs: LineSeg[]; width: number; height: number; ascent: number; descent: number; align: string }
export interface TextLayout { lines: Line[]; width: number; height: number; exact: boolean }

const SUBSETS = ["latin", "latin-ext"];
const cache = new Map<string, Promise<Font[] | null>>();

const familyName = (f: string) => (f === "sourcesanspro" || /^source sans pro$/i.test(f) ? "Source Sans 3" : f);

/** Bir font ailesi/ağırlık/stil için alt küme dosyalarını yükler (önbellekli). Bulunamazsa null. */
export function loadFont(family: string, weight: string, style: string): Promise<Font[] | null> {
  const fam = familyName(family || "sourcesanspro"), w = String(weight || "400"), italic = style === "italic";
  const key = `${fam}|${w}|${italic}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      try {
        const q = `${encodeURIComponent(fam)}:${w}${italic ? "italic" : ""}`;
        const css = await (await fetch(`${cfg.penpotUrl}/internal/gfonts/css?family=${q}&display=block`)).text();
        const faces = [...css.matchAll(/\/\* ([a-z-]+) \*\/[\s\S]*?url\(([^)]+)\)/g)].filter(m => SUBSETS.includes(m[1]));
        const fonts: Font[] = [];
        // latin önce: temel harfler oradan, Türkçe/Avrupa harfleri latin-ext'ten gelir
        for (const sub of SUBSETS) for (const [, s, url] of faces) if (s === sub) {
          const r = await fetch(url.replace("https://fonts.gstatic.com/s/", `${cfg.penpotUrl}/internal/gfonts/font/`));
          if (r.ok) fonts.push(fontkit.create(Buffer.from(await r.arrayBuffer())) as Font);
        }
        if (!fonts.length) { log("warn", "font bulunamadı", { family: fam, weight: w }); return null; }
        return fonts;
      } catch (e) { log("warn", "font yüklenemedi", { family: fam, err: (e as Error).message }); return null; }
    })();
    cache.set(key, p);
  }
  return p;
}

const pick = (fonts: Font[], cp: number) => fonts.find(f => f.hasGlyphForCodePoint(cp)) ?? fonts[0];
const transform = (t: string, tt?: string) => tt === "uppercase" ? t.toLocaleUpperCase("tr") : tt === "lowercase" ? t.toLocaleLowerCase("tr") : tt === "capitalize" ? t.replace(/(^|\s)(\S)/g, (_m, a, b) => a + b.toLocaleUpperCase("tr")) : t;

/** Senkron ölçüm (fontlar önceden yüklenmiş olmalı). Font yoksa tahmini genişlik. */
export function measureSync(text: string, st: RunStyle, fonts: Font[] | null): number {
  const t = transform(text, st.textTransform); if (!t) return 0;
  if (!fonts) return t.length * st.fontSize * 0.56 + t.length * st.letterSpacing;
  // aynı fontu kullanan ardışık karakterleri birlikte yerleştir (kerning korunur)
  let width = 0, buf = "", cur: Font | null = null;
  const flush = () => { if (buf && cur) width += cur.layout(buf).advanceWidth / cur.unitsPerEm * st.fontSize; buf = ""; };
  for (const ch of t) { const f = pick(fonts, ch.codePointAt(0)!); if (f !== cur) { flush(); cur = f; } buf += ch; }
  flush();
  return width + [...t].length * st.letterSpacing;
}
export function vMetrics(st: RunStyle, fonts: Font[] | null) {
  const f = fonts?.[0]; const asc = f ? f.ascent / f.unitsPerEm : 0.95, desc = f ? -f.descent / f.unitsPerEm : 0.25;
  return { ascent: asc * st.fontSize, descent: desc * st.fontSize, content: (asc + desc) * st.fontSize, lineBox: st.lineHeight * st.fontSize };
}

const styleOf = (l: Json, p: Json): RunStyle => ({
  fontFamily: l.fontFamily ?? p?.fontFamily ?? "sourcesanspro", fontWeight: String(l.fontWeight ?? p?.fontWeight ?? "400"), fontStyle: l.fontStyle ?? p?.fontStyle ?? "normal",
  fontSize: Number(l.fontSize ?? p?.fontSize ?? 14), letterSpacing: Number(l.letterSpacing ?? p?.letterSpacing ?? 0), lineHeight: Number(l.lineHeight ?? p?.lineHeight ?? 1.2),
  textTransform: l.textTransform ?? p?.textTransform });

/** Penpot metin içeriğindeki paragrafları (parça stilleriyle) çıkarır. */
export function paragraphs(content: Json): { align: string; runs: Run[] }[] {
  const out: { align: string; runs: Run[] }[] = [];
  const walk = (n: Json) => { if (!n) return;
    if (n.type === "paragraph") { out.push({ align: n.textAlign ?? "left", runs: (n.children ?? []).filter((l: Json) => typeof l.text === "string").map((l: Json) => ({ text: l.text, style: styleOf(l, n), leaf: l })) }); return; }
    (n.children ?? []).forEach(walk); };
  walk(content); return out;
}

/** Metnin kullandığı tüm fontları yükler ve anahtar→font eşlemesi döndürür. */
export async function preload(contents: Json[]): Promise<Map<string, Font[] | null>> {
  const m = new Map<string, Font[] | null>();
  const keys = new Set<string>();
  for (const c of contents) for (const p of paragraphs(c)) for (const r of p.runs) keys.add(fkey(r.style));
  await Promise.all([...keys].map(async k => { const [fam, w, s] = k.split("|"); m.set(k, await loadFont(fam, w, s)); }));
  return m;
}
export const fkey = (s: RunStyle) => `${s.fontFamily}|${s.fontWeight}|${s.fontStyle}`;

/** Satır kırma ve yerleşim. maxWidth verilmezse kırılmaz (auto-width). */
export function layoutSync(content: Json, fonts: Map<string, Font[] | null>, maxWidth?: number): TextLayout {
  const lines: Line[] = []; let exact = true;
  for (const para of paragraphs(content)) {
    let segs: LineSeg[] = [], x = 0;
    const lineMetrics = (ss: LineSeg[], fallback: RunStyle) => {
      let asc = 0, desc = 0, h = 0;
      for (const s of (ss.length ? ss.map(q => q.style) : [fallback])) { const f = fonts.get(fkey(s)) ?? null; if (!f) exact = false; const v = vMetrics(s, f); asc = Math.max(asc, v.ascent); desc = Math.max(desc, v.descent); h = Math.max(h, v.lineBox); }
      return { asc, desc, h };
    };
    const push = () => { const fb = para.runs[0]?.style ?? styleOf({}, {}); const m = lineMetrics(segs, fb);
      lines.push({ segs, width: x, height: m.h, ascent: m.asc, descent: m.desc, align: para.align }); segs = []; x = 0; };
    for (const run of para.runs) {
      const f = fonts.get(fkey(run.style)) ?? null;
      // kelime + boşluk parçaları; çok uzun kelime tek başına satıra taşar
      const tokens = maxWidth === undefined ? [run.text] : run.text.match(/\S+\s*|\s+/g) ?? [];
      for (const tok of tokens) {
        const w = measureSync(tok, run.style, f);
        if (maxWidth !== undefined && x > 0 && x + measureSync(tok.trimEnd(), run.style, f) > maxWidth + 0.5) push();
        const last = segs[segs.length - 1];
        if (last && last.leaf === run.leaf) { last.text += tok; last.width += w; } else segs.push({ text: tok, x, width: w, style: run.style, leaf: run.leaf });
        x += w;
      }
    }
    push();
  }
  // satır sonu boşlukları genişliğe katılmaz
  for (const l of lines) { const last = l.segs[l.segs.length - 1]; if (last && /\s+$/.test(last.text)) { const st = last.style, f = fonts.get(fkey(st)) ?? null;
    const trimmed = measureSync(last.text.trimEnd(), st, f), old = last.width; last.width = trimmed; l.width -= old - trimmed; } }
  return { lines, width: Math.max(0, ...lines.map(l => l.width)), height: lines.reduce((a, l) => a + l.height, 0), exact };
}

/** Penpot'un editörde ürettiği positionData'nın eşdeğeri: SVG dışa aktarma ve doğru metin yerleşimi için. */
export function positionData(layout: TextLayout, box: { x: number; y: number; w: number }): Json[] {
  const out: Json[] = []; let top = box.y;
  for (const l of layout.lines) {
    const off = l.align === "center" ? (box.w - l.width) / 2 : l.align === "right" ? box.w - l.width : 0;
    for (const s of l.segs) {
      if (!s.text) continue;
      const content = l.ascent + l.descent, y1 = (l.height - content) / 2, y2 = y1 + content;
      out.push({ x: box.x + off + s.x, y: top + y2, width: s.width, height: content, x1: 0, y1, x2: s.width, y2,
        fontStyle: s.style.fontStyle, textTransform: s.style.textTransform ?? "none", fontSize: `${s.style.fontSize}px`, fontWeight: s.style.fontWeight,
        textDecoration: s.leaf.textDecoration ?? "none", letterSpacing: `${s.style.letterSpacing}px`, fills: s.leaf.fills ?? [], direction: "ltr",
        fontFamily: s.style.fontFamily, text: s.text });
    }
    top += l.height;
  }
  return out;
}

/** Metin şeklini vektöre çevirir: her parça kendi dolgusuyla bir SVG yolu (sayfa koordinatlarında). */
export function textToPaths(layout: TextLayout, fonts: Map<string, Font[] | null>, box: { x: number; y: number; w: number }): { d: string; fills: Json[] }[] {
  const out: { d: string; fills: Json[] }[] = []; let top = box.y;
  for (const l of layout.lines) {
    const off = l.align === "center" ? (box.w - l.width) / 2 : l.align === "right" ? box.w - l.width : 0;
    const baseline = top + (l.height - (l.ascent + l.descent)) / 2 + l.ascent;
    for (const s of l.segs) {
      const fs = fonts.get(fkey(s.style)); if (!fs) throw new Error(`Font yüklenemedi: ${s.style.fontFamily} ${s.style.fontWeight}`);
      const scale = s.style.fontSize; let pen = box.x + off + s.x; const parts: string[] = [];
      let buf = "", cur: Font | null = null;
      const flush = () => { if (!buf || !cur) return; const run = cur.layout(buf); const k = scale / cur.unitsPerEm;
        run.glyphs.forEach((g, i) => { const pos = run.positions[i];
          // font birimleri → sayfa pikseli; y ekseni ters (font yukarı, sayfa aşağı)
          const d = g.path.transform(k, 0, 0, -k, pen + pos.xOffset * k, baseline - pos.yOffset * k).toSVG();
          if (d) parts.push(d); pen += pos.xAdvance * k + s.style.letterSpacing; });
        buf = ""; };
      for (const ch of transform(s.text, s.style.textTransform)) { const f = pick(fs, ch.codePointAt(0)!); if (f !== cur) { flush(); cur = f; } buf += ch; }
      flush();
      if (parts.length) out.push({ d: parts.join(" "), fills: s.leaf.fills ?? [] });
    }
    top += l.height;
  }
  return out;
}
