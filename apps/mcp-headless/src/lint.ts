// Tasarım denetçisi: kıdemli bir tasarımcının ilk bakışta yakalayacağı sorunları otomatik bulur.
import type { Json } from "./penpot.js";
import { bounds, round, type Box } from "./geom.js";
import { layoutSync, preload } from "./fonts.js";
import { textOf, textParas } from "./context.js";

export interface Issue { severity: "error" | "warning" | "info"; rule: string; nodeId: string; name: string; message: string; fix?: string }
export interface LintOptions { grid: number; platform: "auto" | "web" | "mobile" | "logo"; maxIssues: number }

// ---------- renk ----------
const hexRgb = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lum = (h: string) => { const [r, g, b] = hexRgb(h).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const solidFill = (o: Json): string | null => { for (const f of [...(o?.fills ?? [])].reverse()) if (f.fillColor && (f.fillOpacity ?? 1) >= 0.95 && !f.fillColorGradient && !f.fillImage) return f.fillColor.toLowerCase(); return null; };
const contains = (a: Box, b: Box) => b.x >= a.x - 0.5 && b.y >= a.y - 0.5 && b.x + b.w <= a.x + a.w + 0.5 && b.y + b.h <= a.y + a.h + 0.5;
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;

/** Metnin arkasındaki görünür düz rengi bulur: alttaki kardeşler (z-sırası), sonra üst öğeler. */
function backdrop(objs: Json, o: Json): string | null {
  const ob = bounds(o); let cur = o;
  while (cur && cur.parentId && cur.id !== cur.parentId) {
    const parent = objs[cur.parentId]; if (!parent) break;
    const sibs: string[] = parent.shapes ?? []; const idx = sibs.indexOf(cur.id);
    for (let i = idx - 1; i >= 0; i--) { const s = objs[sibs[i]]; if (!s || s.hidden) continue; const sf = solidFill(s); if (sf && contains(bounds(s), ob)) return sf; }
    const pf = solidFill(parent); if (pf && parent.type !== "group") return pf;
    cur = parent;
  }
  return "#ffffff"; // sayfa zemini
}

export async function lintDesign(objs: Json, rootId: string, opts: LintOptions): Promise<{ score: number; summary: Json; issues: Issue[] }> {
  const root = objs[rootId]; const rb = bounds(root); const issues: Issue[] = [];
  const platform = opts.platform !== "auto" ? opts.platform : rb.w <= 500 ? "mobile" : rb.w <= 1100 && rb.h <= 1100 && Math.abs(rb.w - rb.h) < 200 ? "logo" : "web";
  const add = (severity: Issue["severity"], rule: string, o: Json, message: string, fix?: string) => issues.push({ severity, rule, nodeId: o.id, name: o.name, message, ...(fix ? { fix } : {}) });
  const all: Json[] = []; const walk = (id: string, depth: number) => { const o = objs[id]; if (!o || o.hidden) return; all.push(o); (o.shapes ?? []).forEach((c: string) => walk(c, depth + 1)); }; walk(rootId, 0);
  const texts = all.filter(o => o.type === "text"); const fonts = await preload(texts.map(t => t.content));

  // 1) metin: kontrast, küçük punto, taşma
  const sizes = new Map<number, number>(), families = new Set<string>(), colors = new Set<string>();
  for (const t of texts) {
    const paras = textParas(t); const leaf = paras[0]?.leaves[0]; if (!leaf) continue;
    for (const p of paras) for (const l of p.leaves) { sizes.set(Number(l.fontSize), (sizes.get(Number(l.fontSize)) ?? 0) + 1); families.add(String(l.fontFamily)); const c = l.fills?.[0]?.fillColor; if (c) colors.add(c.toLowerCase()); }
    const color = leaf.fills?.[0]?.fillColor?.toLowerCase(); const fs = Number(leaf.fontSize ?? 14), fw = Number(leaf.fontWeight ?? 400);
    if (color && (leaf.fills?.[0]?.fillOpacity ?? 1) > 0.5) { const bg = backdrop(objs, t); if (bg) { const cr = contrast(color, bg); const large = fs >= 24 || (fs >= 18.66 && fw >= 700); const need = large ? 3 : 4.5;
      if (cr < need) add(cr < need - 1 ? "error" : "warning", "contrast", t, `Kontrast ${round(cr, 2)}:1 (${color} / ${bg}); WCAG AA için en az ${need}:1 gerekir.`, `Metni koyulaştır/açıklaştır ya da zemini değiştir; ${need}:1 hedefle.`); } }
    const minText = platform === "mobile" ? 11 : platform === "logo" ? 6 : 12; // iOS HIG alt sınırı 11pt (sekme etiketleri)
    if (fs < minText) add("warning", "small-text", t, `${fs}px metin ${platform === "mobile" ? "mobilde" : "ekranda"} okunması zor.`, `En az ${minText}px kullan (gövde metni için 14-16px).`);
    const b = bounds(t); const l = layoutSync(t.content, fonts, t.growType === "auto-width" ? undefined : b.w);
    if (t.growType === "fixed" && l.height > b.h + 1) add("error", "text-overflow", t, `Metin kutusuna sığmıyor (gereken ${round(l.height)}px, kutu ${round(b.h)}px).`, "Kutuyu büyüt, growType'ı auto-height yap ya da metni kısalt.");
    if (t.growType === "auto-width" && Math.abs(l.width - b.w) > 2) add("info", "stale-text-size", t, `Kayıtlı genişlik ${round(b.w)}px, gerçek ${round(l.width)}px.`, "penpot_apply_layout ile metin boyutlarını yeniden hesapla.");
    const parent = objs[t.parentId]; if (parent && parent.type === "frame" && parent.id !== "00000000-0000-0000-0000-000000000000") { const pb = bounds(parent);
      const real: Box = { x: b.x, y: b.y, w: t.growType === "auto-width" ? l.width : b.w, h: Math.max(b.h, l.height) };
      if (!contains(pb, real)) add("warning", "out-of-bounds", t, `Metin üst board'un (${parent.name}) dışına taşıyor.`, "Konumu/boyutu board içine al."); }
  }
  // metin çakışmaları (aynı üst öğedeki metin kutuları)
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) { const a = texts[i], b = texts[j];
    if (a.parentId === b.parentId && overlaps(bounds(a), bounds(b))) add("error", "text-overlap", a, `"${(textOf(a) ?? "").slice(0, 24)}" ile "${(textOf(b) ?? "").slice(0, 24)}" üst üste biniyor.`, "Aralarına boşluk bırak ya da flex yerleşim kullan."); }

  // 2) ızgara hizası ve neredeyse-hiza
  const g = opts.grid; let off = 0; const offEx: string[] = [];
  for (const o of all) { if (o.id === rootId || o.type === "path" || o.type === "bool" || o.rotation) continue; const p = objs[o.parentId]; if (!p) continue;
    if (p.layout === "flex" && !o.layoutItemAbsolute) continue; const b = bounds(o), pb = bounds(p);
    const vals = [b.x - pb.x, b.y - pb.y, o.type === "text" ? 0 : b.w, o.type === "text" ? 0 : b.h];
    if (vals.some(v => Math.abs(v - Math.round(v / g) * g) > 0.5)) { off++; if (offEx.length < 6) offEx.push(o.name); } }
  if (off) issues.push({ severity: "info", rule: "off-grid", nodeId: rootId, name: root.name, message: `${off} katman ${g}px ızgaraya oturmuyor (örn. ${offEx.join(", ")}).`, fix: `Konum ve boyutları ${g}'in katlarına yuvarla; flex yerleşim kullanmak bunu otomatik çözer.` });
  const lefts = new Map<string, number[]>();
  for (const o of all) { if (o.id === rootId) continue; const k = o.parentId; const arr = lefts.get(k) ?? []; arr.push(bounds(o).x); lefts.set(k, arr); }
  for (const [pid, xs] of lefts) { const near: string[] = []; const u = [...new Set(xs.map(x => round(x, 1)))].sort((a, b) => a - b);
    for (let i = 1; i < u.length; i++) if (u[i] - u[i - 1] > 0.4 && u[i] - u[i - 1] < 3) near.push(`${u[i - 1]}/${u[i]}`);
    if (near.length) issues.push({ severity: "warning", rule: "near-aligned", nodeId: pid, name: objs[pid]?.name ?? "", message: `Sol kenarlar neredeyse hizalı ama değil: ${near.slice(0, 4).join(", ")}.`, fix: "Aynı hizaya çek; göz bu 1-2px farkı hata olarak algılar." }); }

  // 3) dikey ritim: flex olmayan board'larda üst üste dizili kardeşler arasındaki boşluklar
  const scale = [0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64, 72, 80, 96, 112, 128, 160];
  for (const o of all) { if (o.type !== "frame" || o.layout === "flex" || !(o.shapes?.length > 2)) continue;
    const kids = (o.shapes as string[]).map(id => objs[id]).filter((c: Json) => c && !c.hidden).map((c: Json) => ({ c, b: bounds(c) })).sort((a, b) => a.b.y - b.b.y);
    const gaps: number[] = []; for (let i = 1; i < kids.length; i++) { const gp = round(kids[i].b.y - (kids[i - 1].b.y + kids[i - 1].b.h)); if (gp > 0) gaps.push(gp); }
    const odd = [...new Set(gaps.filter(v => !scale.includes(Math.round(v))))];
    if (odd.length >= 2) add("info", "spacing-scale", o, `Dikey boşluklar ölçek dışı: ${odd.slice(0, 5).join(", ")}px.`, "8px tabanlı ölçek kullan (8, 12, 16, 24, 32, 48, 64) ya da board'a flex yerleşim ver."); }

  // 4) sistem dağınıklığı
  if (sizes.size > 6) issues.push({ severity: "warning", rule: "type-scale", nodeId: rootId, name: root.name, message: `${sizes.size} farklı font boyutu (${[...sizes.keys()].sort((a, b) => a - b).join(", ")}).`, fix: "Tipografi ölçeğini 4-6 boyuta indir (örn. 12/14/16/20/28/40)." });
  if (families.size > 2) issues.push({ severity: "warning", rule: "font-families", nodeId: rootId, name: root.name, message: `${families.size} font ailesi: ${[...families].join(", ")}.`, fix: "En fazla 2 aile: biri başlık, biri gövde." });
  const fillColors = new Set<string>(); for (const o of all) { const c = solidFill(o); if (c) fillColors.add(c); } colors.forEach(c => fillColors.add(c));
  if (fillColors.size > 10) issues.push({ severity: "info", rule: "palette", nodeId: rootId, name: root.name, message: `${fillColors.size} farklı düz renk kullanılmış.`, fix: "Paleti marka renkleri + nötr rampa + 1-2 durum rengiyle sınırla; penpot_create_brand_kit ile kütüphane oluştur." });

  // 5) mobil dokunma alanları
  if (platform === "mobile") for (const o of all) { if (o.id === rootId) continue; const b = bounds(o);
    const interactive = /button|btn|tab|icon-button|toggle|checkbox|switch|link|chip|fab/i.test(o.name ?? "") || (o.interactions?.length ?? 0) > 0;
    if (interactive && (b.h < 44 || b.w < 44)) add("warning", "touch-target", o, `Dokunma alanı ${round(b.w)}×${round(b.h)}px; en az 44×44 olmalı (iOS HIG / Material 48dp).`, "Yüksekliği 44-48px yap ya da görünmez bir dokunma alanı ekle."); }

  // 6) logo: ince detay ve renk sayısı
  if (platform === "logo") { for (const o of all) for (const s of o.strokes ?? []) if (s.strokeWidth && s.strokeWidth < Math.max(rb.w, rb.h) * 0.02)
      add("warning", "thin-stroke", o, `${round(s.strokeWidth, 2)}px kontur küçük boyutta (16-32px favicon) kaybolur.`, "Konturu kalınlaştır ya da küçük boyut için sadeleştirilmiş varyant yap.");
    if (fillColors.size > 3) issues.push({ severity: "info", rule: "logo-colors", nodeId: rootId, name: root.name, message: `Logo ${fillColors.size} renk içeriyor.`, fix: "Güçlü logolar 1-2 renkle çalışır ve tek renkte de okunur; tek renk varyantını test et." }); }

  const weight = { error: 12, warning: 5, info: 1 } as const;
  const score = Math.max(0, 100 - issues.reduce((a, i) => a + weight[i.severity], 0));
  const order = { error: 0, warning: 1, info: 2 } as const; issues.sort((a, b) => order[a.severity] - order[b.severity]);
  return { score, summary: { platform, layers: all.length, texts: texts.length, errors: issues.filter(i => i.severity === "error").length, warnings: issues.filter(i => i.severity === "warning").length, infos: issues.filter(i => i.severity === "info").length,
    fontSizes: [...sizes.keys()].sort((a, b) => a - b), fontFamilies: [...families], colors: fillColors.size }, issues: issues.slice(0, opts.maxIssues) };
}
