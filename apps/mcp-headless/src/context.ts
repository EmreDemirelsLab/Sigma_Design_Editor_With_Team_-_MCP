// Tasarım bağlamı: Penpot ağacını LLM'in doğrudan anlayıp uygulayabileceği biçimlere çevirir.
//  - describe(): katman ağacı için zengin ama kısa düğüm özeti (gerçek sınır kutusu, dolgu, kontur, metin stili, yerleşim)
//  - metadataXml(): büyük sayfalar için seyrek XML taslak (Figma get_metadata karşılığı)
//  - designCode(): React+Tailwind ya da HTML+CSS kodu (Figma get_design_context karşılığı)
//  - variableDefs(): kullanılan renk/font/ölçü değerleri ve kütüphane adları (Figma get_variable_defs karşılığı)
import type { Json } from "./penpot.js";
import { bounds, contentToD, round, translateD, type Box } from "./geom.js";

const ROOT = "00000000-0000-0000-0000-000000000000";
const px = (n: number) => `${round(n)}px`;

// ---------- metin ----------
export interface Leaf { text: string; fontFamily?: string; fontSize?: string; fontWeight?: string; fontStyle?: string; lineHeight?: string; letterSpacing?: string;
  fills?: Json[]; textDecoration?: string; textTransform?: string }
export interface Para { align: string; leaves: Leaf[] }
export function textParas(o: Json): Para[] {
  const paras: Para[] = [];
  const walk = (n: Json) => { if (!n) return;
    if (n.type === "paragraph") { paras.push({ align: n.textAlign ?? "left", leaves: (n.children ?? []).filter((l: Json) => typeof l.text === "string") }); return; }
    (n.children ?? []).forEach(walk); };
  walk(o?.content); return paras;
}
export const textOf = (o: Json): string | undefined => o?.type !== "text" ? undefined : textParas(o).map(p => p.leaves.map(l => l.text).join("")).join("\n");

// ---------- renkler ----------
export type ColorNames = Map<string, string>; // "#rrggbb" → kütüphane adı
export function colorNames(data: Json): ColorNames {
  const m: ColorNames = new Map();
  for (const c of Object.values<Json>(data?.colors ?? {})) if (c?.color) m.set(String(c.color).toLowerCase(), [c.path, c.name].filter(Boolean).join("/"));
  return m;
}
const rgba = (hex: string, a = 1) => { if (a >= 1) return hex.toLowerCase(); const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${round(a, 3)})`; };
function gradientCss(g: Json, opacity = 1): string {
  const stops = (g.stops ?? []).map((s: Json) => `${rgba(s.color, (s.opacity ?? 1) * opacity)} ${round((s.offset ?? 0) * 100)}%`).join(", ");
  if (g.type === "radial") return `radial-gradient(circle at ${round((g.startX ?? 0.5) * 100)}% ${round((g.startY ?? 0.5) * 100)}%, ${stops})`;
  const ang = round(90 + Math.atan2((g.endY ?? 1) - (g.startY ?? 0), (g.endX ?? 0) - (g.startX ?? 0)) * 180 / Math.PI, 1);
  return `linear-gradient(${ang}deg, ${stops})`;
}
/** Bir dolgu/kontur girişini CSS değerine çevirir. */
function paint(p: Json, kind: "fill" | "stroke"): { css: string; solid?: string; image?: string } | null {
  const color = p[`${kind}Color`], op = p[`${kind}Opacity`] ?? 1, grad = p[`${kind}ColorGradient`], img = p.fillImage;
  if (grad) return { css: gradientCss(grad, op) };
  if (img) return { css: "", image: img.id };
  if (color) return { css: rgba(color, op), solid: color.toLowerCase() };
  return null;
}

// ---------- düğüm özeti (katman ağacı) ----------
export function describe(o: Json, names?: ColorNames): Json {
  const b = bounds(o); const out: Json = { id: o.id, type: o.type, name: o.name, x: round(b.x), y: round(b.y), w: round(b.w), h: round(b.h) };
  if (o.rotation) out.rotation = round(o.rotation);
  if (o.hidden) out.hidden = true;
  if (o.opacity !== undefined && o.opacity !== 1) out.opacity = o.opacity;
  const fills = (o.fills ?? []).map((f: Json) => paint(f, "fill")).filter(Boolean) as Json[];
  if (fills.length) out.fill = fills.map(f => f.image ? `image:${f.image}` : (f.solid && names?.get(f.solid) ? `${f.css} (${names.get(f.solid)})` : f.css)).join(" | ");
  const st = (o.strokes ?? [])[0];
  if (st && (st.strokeWidth ?? 0) > 0) { const p = paint(st, "stroke"); if (p) out.stroke = `${round(st.strokeWidth)}px ${p.css} ${st.strokeAlignment ?? "center"}${st.strokeStyle && st.strokeStyle !== "solid" ? " " + st.strokeStyle : ""}`; }
  const rad = radius(o); if (rad) out.radius = rad;
  if (o.type === "text") { const paras = textParas(o); out.text = (textOf(o) ?? "").slice(0, 160);
    const l = paras[0]?.leaves[0]; if (l) out.font = `${l.fontFamily ?? ""} ${l.fontWeight ?? ""} ${l.fontSize ?? ""}px`.replace(/\s+/g, " ").trim();
    const styles = new Set(paras.flatMap(p => p.leaves.map(x => JSON.stringify([x.fontFamily, x.fontWeight, x.fontSize, x.fills?.[0]?.fillColor])))); if (styles.size > 1) out.mixedStyles = styles.size; }
  if (o.layout) out.layout = layoutSummary(o);
  if (o.layoutItemAbsolute) out.absoluteInLayout = true;
  if (o.layoutItemHSizing && o.layoutItemHSizing !== "fix") out.hSizing = o.layoutItemHSizing;
  if (o.layoutItemVSizing && o.layoutItemVSizing !== "fix") out.vSizing = o.layoutItemVSizing;
  if (o.shadow?.some((s: Json) => !s.hidden)) out.shadow = o.shadow.filter((s: Json) => !s.hidden).length;
  if (o.blur && !o.blur.hidden) out.blur = o.blur.value;
  if (o.shapes?.length) out.children = o.shapes.length;
  if (o.componentId) out.component = { id: o.componentId, main: !!o.mainInstance, root: !!o.componentRoot, file: o.componentFile };
  else if (o.shapeRef) out.componentChild = true;
  return out;
}
function radius(o: Json): string | undefined {
  const r = [o.r1, o.r2, o.r3, o.r4].map(v => v ?? 0); if (r.some(v => v)) return r.every(v => v === r[0]) ? `${round(r[0])}` : r.map(v => round(v)).join(" ");
  if (o.rx) return `${round(o.rx)}`; return undefined;
}
function layoutSummary(o: Json): string {
  if (o.layout === "grid") return `grid ${(o.layoutGridColumns ?? []).length}x${(o.layoutGridRows ?? []).length}`;
  const g = o.layoutGap ?? {}, p = o.layoutPadding ?? {};
  return `flex ${o.layoutFlexDir ?? "row"} gap ${g.rowGap ?? 0}/${g.columnGap ?? 0} pad ${[p.p1, p.p2, p.p3, p.p4].map(v => v ?? 0).join(",")} align ${o.layoutAlignItems ?? "start"} justify ${o.layoutJustifyContent ?? "start"}${o.layoutWrapType === "wrap" ? " wrap" : ""}`;
}

// ---------- seyrek XML taslak ----------
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function metadataXml(objs: Json, rootIds: string[], opts: { maxNodes: number; includeHidden: boolean }): { xml: string; nodes: number; truncated: boolean } {
  let n = 0, truncated = false; const lines: string[] = [];
  const tag = (t: string) => ({ frame: "frame", rect: "rectangle", circle: "ellipse", text: "text", path: "vector", bool: "boolean", group: "group", image: "image", "svg-raw": "svg" } as Json)[t] ?? t;
  const walk = (id: string, depth: number) => {
    const o = objs[id]; if (!o || (!opts.includeHidden && o.hidden)) return;
    if (n >= opts.maxNodes) { truncated = true; return; } n++;
    const b = bounds(o); const pad = "  ".repeat(depth);
    let attrs = `id="${o.id}" name="${esc(o.name)}" x="${round(b.x)}" y="${round(b.y)}" width="${round(b.w)}" height="${round(b.h)}"`;
    if (o.hidden) attrs += ` hidden="true"`;
    if (o.type === "text") attrs += ` text="${esc((textOf(o) ?? "").slice(0, 80))}"`;
    if (o.componentId) attrs += ` component="${o.componentId}"${o.mainInstance ? ` main="true"` : ""}`;
    const kids = (o.shapes ?? []) as string[];
    if (!kids.length) { lines.push(`${pad}<${tag(o.type)} ${attrs}/>`); return; }
    lines.push(`${pad}<${tag(o.type)} ${attrs}>`); kids.forEach(k => walk(k, depth + 1)); lines.push(`${pad}</${tag(o.type)}>`);
  };
  rootIds.forEach(id => walk(id, 0));
  return { xml: lines.join("\n"), nodes: n, truncated };
}

// ---------- kod üretimi ----------
type Decl = [string, string];
export interface CodeOpts { format: "react-tailwind" | "html-css"; maxNodes: number; includeHidden: boolean; names: ColorNames }
export interface CodeResult { code: string; nodes: number; truncated: boolean; colors: Map<string, number>; fonts: Map<string, number>; images: string[] }

const TW_EXACT: Record<string, Record<string, string>> = {
  position: { absolute: "absolute", relative: "relative" }, display: { flex: "flex", grid: "grid", block: "block" },
  "flex-direction": { row: "flex-row", column: "flex-col", "row-reverse": "flex-row-reverse", "column-reverse": "flex-col-reverse" },
  "flex-wrap": { wrap: "flex-wrap", nowrap: "flex-nowrap" }, overflow: { hidden: "overflow-hidden", visible: "overflow-visible" },
  "align-items": { "flex-start": "items-start", center: "items-center", "flex-end": "items-end", stretch: "items-stretch", baseline: "items-baseline" },
  "justify-content": { "flex-start": "justify-start", center: "justify-center", "flex-end": "justify-end", "space-between": "justify-between", "space-around": "justify-around", "space-evenly": "justify-evenly" },
  "text-align": { left: "text-left", center: "text-center", right: "text-right", justify: "text-justify" },
  "font-style": { italic: "italic", normal: "not-italic" }, "white-space": { pre: "whitespace-pre", "pre-wrap": "whitespace-pre-wrap", nowrap: "whitespace-nowrap" },
  "text-decoration": { underline: "underline", "line-through": "line-through" }, "text-transform": { uppercase: "uppercase", lowercase: "lowercase", capitalize: "capitalize" },
  "box-sizing": { "border-box": "box-border" }, "flex-grow": { "1": "grow" }, "flex-shrink": { "0": "shrink-0" }, "align-self": { stretch: "self-stretch" },
};
const TW_PREFIX: Record<string, string> = { left: "left", top: "top", width: "w", height: "h", "background-color": "bg", "border-radius": "rounded", opacity: "opacity",
  gap: "gap", "row-gap": "gap-y", "column-gap": "gap-x", "padding-top": "pt", "padding-right": "pr", "padding-bottom": "pb", "padding-left": "pl",
  "font-size": "text", "font-weight": "font", "line-height": "leading", "letter-spacing": "tracking", color: "text", "z-index": "z" };
const twVal = (v: string) => v.replace(/\s+/g, "_");
function toTailwind(decls: Decl[]): string {
  return decls.map(([p, v]) => {
    const ex = TW_EXACT[p]?.[v]; if (ex) return ex;
    if (p === "font-family") return `font-['${twVal(v.replace(/['"]/g, ""))}']`;
    if (p === "background-color" && v.startsWith("#")) return `bg-[${v}]`;
    if (p === "color" && v.startsWith("#")) return `text-[${v}]`;
    const pre = TW_PREFIX[p]; if (pre && !(p === "color" || p === "background-color")) return `${pre}-[${twVal(v)}]`;
    if (pre) return `${pre}-[${twVal(v)}]`;
    return `[${p}:${twVal(v)}]`;
  }).join(" ");
}
const cssText = (decls: Decl[]) => decls.map(([p, v]) => `${p}: ${v}`).join("; ");

export function designCode(objs: Json, rootId: string, opts: CodeOpts): CodeResult {
  const res: CodeResult = { code: "", nodes: 0, truncated: false, colors: new Map(), fonts: new Map(), images: [] };
  const react = opts.format === "react-tailwind";
  const noteColor = (hex?: string) => { if (hex) res.colors.set(hex, (res.colors.get(hex) ?? 0) + 1); };
  const attrs = (decls: Decl[], o: Json) => {
    const id = `data-node-id="${o.id}"`, nm = o.name ? ` data-name="${esc(o.name)}"` : "";
    if (!decls.length) return `${id}${nm}`;
    return react ? `${id}${nm} className="${toTailwind(decls)}"` : `${id}${nm} style="${esc(cssText(decls))}"`;
  };

  const boxDecls = (o: Json, parent: Json | null, pb: Box | null, inFlow: boolean): Decl[] => {
    const b = bounds(o), d: Decl[] = [];
    if (!parent) d.push(["position", "relative"]);
    else if (!inFlow) d.push(["position", "absolute"], ["left", px(b.x - pb!.x)], ["top", px(b.y - pb!.y)]);
    const hs = o.layoutItemHSizing, vs = o.layoutItemVSizing;
    const autoW = o.type === "text" && o.growType === "auto-width", autoH = o.type === "text" && (o.growType === "auto-width" || o.growType === "auto-height");
    if (inFlow && hs === "fill") d.push(["flex-grow", "1"], ["align-self", "stretch"]); else if (!(hs === "auto" || autoW)) d.push(["width", px(b.w)]);
    if (inFlow && vs === "fill") d.push(["align-self", "stretch"]); else if (!(vs === "auto" || autoH)) d.push(["height", px(b.h)]);
    if (inFlow) d.push(["flex-shrink", "0"]);
    if (o.rotation) d.push(["transform", `rotate(${round(o.rotation)}deg)`]);
    if (o.opacity !== undefined && o.opacity !== 1) d.push(["opacity", String(round(o.opacity, 3))]);
    if (o.blendMode && o.blendMode !== "normal") d.push(["mix-blend-mode", o.blendMode]);
    if (o.blur && !o.blur.hidden && o.blur.value) d.push(["filter", `blur(${px(o.blur.value)})`]);
    return d;
  };
  const surfaceDecls = (o: Json): Decl[] => {
    const d: Decl[] = []; const bg: string[] = []; let solid: string | undefined;
    for (const f of [...(o.fills ?? [])].reverse()) { const p = paint(f, "fill"); if (!p) continue;
      if (p.image) { res.images.push(p.image); bg.push(`url(asset:${p.image})`); continue; }
      if (p.solid && (f.fillOpacity ?? 1) >= 1 && !bg.length && !solid) { solid = p.css; noteColor(p.solid); continue; }
      noteColor(p.solid); bg.push(p.solid ? `linear-gradient(${p.css}, ${p.css})` : p.css); }
    if (solid) d.push(["background-color", solid]);
    if (bg.length) d.push(["background-image", bg.reverse().join(", ")]);
    const r = [o.r1, o.r2, o.r3, o.r4].map(v => v ?? 0);
    if (o.type === "circle") d.push(["border-radius", "9999px"]);
    else if (r.some(v => v)) d.push(["border-radius", r.every(v => v === r[0]) ? px(r[0]) : r.map(px).join(" ")]);
    const st = (o.strokes ?? []).find((s: Json) => (s.strokeWidth ?? 0) > 0);
    if (st) { const p = paint(st, "stroke"); if (p) { noteColor(p.solid); const w = st.strokeWidth, style = st.strokeStyle === "dashed" ? "dashed" : st.strokeStyle === "dotted" ? "dotted" : "solid";
      const off = st.strokeAlignment === "inner" ? -w : st.strokeAlignment === "outer" ? 0 : -w / 2;
      d.push(["outline", `${px(w)} ${style} ${p.solid ?? p.css}`], ["outline-offset", px(off)]); } }
    const sh = (o.shadow ?? []).filter((s: Json) => !s.hidden);
    if (sh.length) d.push(["box-shadow", sh.map((s: Json) => `${s.style === "inner-shadow" ? "inset " : ""}${px(s.offsetX ?? 0)} ${px(s.offsetY ?? 0)} ${px(s.blur ?? 0)} ${px(s.spread ?? 0)} ${rgba(s.color?.color ?? "#000000", s.color?.opacity ?? 1)}`).join(", ")]);
    if (o.type === "frame" && !o.showContent) d.push(["overflow", "hidden"]);
    return d;
  };
  const layoutDecls = (o: Json): Decl[] => {
    if (o.layout === "flex") { const g = o.layoutGap ?? {}, p = o.layoutPadding ?? {}, dir = o.layoutFlexDir ?? "row", d: Decl[] = [["display", "flex"], ["flex-direction", dir]];
      const main = dir.startsWith("row") ? g.columnGap : g.rowGap, cross = dir.startsWith("row") ? g.rowGap : g.columnGap;
      if (main) d.push([dir.startsWith("row") ? "column-gap" : "row-gap", px(main)]);
      if (o.layoutWrapType === "wrap") { d.push(["flex-wrap", "wrap"]); if (cross) d.push([dir.startsWith("row") ? "row-gap" : "column-gap", px(cross)]); }
      ([["padding-top", p.p1], ["padding-right", p.p2], ["padding-bottom", p.p3], ["padding-left", p.p4]] as [string, number][]).forEach(([k, v]) => { if (v) d.push([k, px(v)]); });
      const al: Json = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch", baseline: "baseline" };
      const ju: Json = { start: "flex-start", center: "center", end: "flex-end", "space-between": "space-between", "space-around": "space-around", "space-evenly": "space-evenly", stretch: "flex-start" };
      if (o.layoutAlignItems && o.layoutAlignItems !== "start") d.push(["align-items", al[o.layoutAlignItems] ?? o.layoutAlignItems]);
      if (o.layoutJustifyContent && o.layoutJustifyContent !== "start") d.push(["justify-content", ju[o.layoutJustifyContent] ?? o.layoutJustifyContent]);
      d.push(["box-sizing", "border-box"]); return d; }
    if (o.layout === "grid") { const track = (t: Json) => t.type === "fixed" ? px(t.value) : t.type === "percent" ? `${t.value}%` : t.type === "flex" ? `${t.value ?? 1}fr` : "auto";
      const g = o.layoutGap ?? {}, p = o.layoutPadding ?? {}, d: Decl[] = [["display", "grid"], ["grid-template-columns", (o.layoutGridColumns ?? []).map(track).join(" ") || "auto"], ["grid-template-rows", (o.layoutGridRows ?? []).map(track).join(" ") || "auto"]];
      if (g.rowGap) d.push(["row-gap", px(g.rowGap)]); if (g.columnGap) d.push(["column-gap", px(g.columnGap)]);
      ([["padding-top", p.p1], ["padding-right", p.p2], ["padding-bottom", p.p3], ["padding-left", p.p4]] as [string, number][]).forEach(([k, v]) => { if (v) d.push([k, px(v)]); });
      d.push(["box-sizing", "border-box"]); return d; }
    return [];
  };
  const leafDecls = (l: Leaf, base?: Leaf): Decl[] => {
    const d: Decl[] = []; const same = (k: keyof Leaf) => base && base[k] === l[k];
    if (l.fontFamily && !same("fontFamily")) d.push(["font-family", `'${l.fontFamily === "sourcesanspro" ? "Source Sans Pro" : l.fontFamily}'`]);
    if (l.fontSize && !same("fontSize")) d.push(["font-size", px(Number(l.fontSize))]);
    if (l.fontWeight && !same("fontWeight")) d.push(["font-weight", String(l.fontWeight)]);
    if (l.fontStyle === "italic" && !same("fontStyle")) d.push(["font-style", "italic"]);
    if (l.lineHeight && !same("lineHeight")) d.push(["line-height", String(round(Number(l.lineHeight), 3))]);
    if (l.letterSpacing && Number(l.letterSpacing) && !same("letterSpacing")) d.push(["letter-spacing", px(Number(l.letterSpacing))]);
    if (l.textDecoration && l.textDecoration !== "none" && !same("textDecoration")) d.push(["text-decoration", l.textDecoration]);
    if (l.textTransform && l.textTransform !== "none" && !same("textTransform")) d.push(["text-transform", l.textTransform]);
    const f = l.fills?.[0]; const fb = base?.fills?.[0];
    if (f && !(fb && JSON.stringify(f) === JSON.stringify(fb))) { const p = paint(f, "fill"); if (p) { noteColor(p.solid);
      if (p.solid) d.push(["color", p.css]); else d.push(["background-image", p.css], ["-webkit-background-clip", "text"], ["color", "transparent"]); } }
    return d;
  };

  const lines: string[] = [];
  const emit = (depth: number, s: string) => lines.push("  ".repeat(depth) + s);
  const walk = (id: string, parent: Json | null, depth: number) => {
    const o = objs[id]; if (!o || (!opts.includeHidden && o.hidden)) return;
    if (res.nodes >= opts.maxNodes) { res.truncated = true; return; } res.nodes++;
    const pb = parent ? bounds(parent) : null;
    const inFlow = !!parent && (parent.layout === "flex" || parent.layout === "grid") && !o.layoutItemAbsolute;
    const box = boxDecls(o, parent, pb, inFlow);
    // Kök düğümün bileşen notu fonksiyon başlığına yazılır (return içinde kökten önce yorum geçersiz JSX olur).
    if (o.componentId && parent) emit(depth, react ? `{/* component: ${o.name}${o.mainInstance ? " (main)" : ""} */}` : `<!-- component: ${esc(o.name)} -->`);

    if (o.type === "text") {
      const paras = textParas(o); const base = paras[0]?.leaves[0];
      for (const p of paras) for (const l of p.leaves) { const k = `${l.fontFamily === "sourcesanspro" ? "Source Sans Pro" : l.fontFamily} ${l.fontWeight} ${l.fontSize}px`; res.fonts.set(k, (res.fonts.get(k) ?? 0) + 1); }
      const d = [...box, ...(base ? leafDecls(base) : []), ["white-space", o.growType === "auto-width" ? "pre" : "pre-wrap"] as Decl];
      if (paras[0]?.align && paras[0].align !== "left") d.push(["text-align", paras[0].align]);
      const body = paras.map(p => p.leaves.map(l => { const ld = leafDecls(l, base); const t = esc(l.text).replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");
        return ld.length ? `<span ${react ? `className="${toTailwind(ld)}"` : `style="${esc(cssText(ld))}"`}>${t}</span>` : t; }).join("")).join(react ? "<br />" : "<br>");
      emit(depth, `<p ${attrs(d, o)}>${body}</p>`); return;
    }
    if (o.type === "path" || o.type === "bool") {
      const b = bounds(o); let dStr = ""; try { dStr = translateD(contentToD(o.content), -b.x, -b.y); } catch { dStr = ""; }
      const f = (o.fills ?? []).map((x: Json) => paint(x, "fill")).find(Boolean) as Json; const st = (o.strokes ?? []).find((s: Json) => (s.strokeWidth ?? 0) > 0);
      const sp = st ? paint(st, "stroke") : null; noteColor(f?.solid); noteColor(sp?.solid ?? undefined);
      const cap = st?.strokeCapEnd === "round" || st?.strokeCapStart === "round" ? "round" : st?.strokeCapEnd === "square" ? "square" : "butt";
      const sAttrs = sp ? (react ? ` stroke="${sp.solid ?? "currentColor"}" strokeWidth="${round(st.strokeWidth)}" strokeLinecap="${cap}" strokeLinejoin="round"` : ` stroke="${sp.solid ?? "currentColor"}" stroke-width="${round(st.strokeWidth)}" stroke-linecap="${cap}" stroke-linejoin="round"`) : "";
      const d = [...box, ["overflow", "visible"] as Decl];
      emit(depth, `<svg ${attrs(d, o)} viewBox="0 0 ${round(b.w)} ${round(b.h)}" fill="none">`);
      emit(depth + 1, `<path d="${dStr}" fill="${f?.solid ?? (f ? "currentColor" : "none")}"${f && !f.solid ? ` /* gradient: ${esc(f.css)} */` : ""}${sAttrs} />`);
      emit(depth, `</svg>`); return;
    }
    if (o.type === "image") { const m = o.metadata ?? {}; res.images.push(m.id);
      emit(depth, `<img ${attrs([...box, ["object-fit", "cover"]], o)} src="asset:${m.id ?? ""}" alt="${esc(o.name)}" />`); return; }
    if (o.type === "svg-raw") { emit(depth, `<div ${attrs(box, o)}>{/* imported SVG — penpot_export ile SVG olarak alın */}</div>`); return; }

    // frame / rect / circle / group
    const d = [...box, ...(o.type === "group" ? [] : surfaceDecls(o)), ...(o.type === "frame" ? layoutDecls(o) : [])];
    const kids = (o.shapes ?? []) as string[];
    // Penpot z-sırası: shapes dizisi alttan üste; HTML'de sonraki öğe üstte → aynı sıra. Flex'te görsel sıra ters (editör davranışı).
    const order = o.layout === "flex" ? [...kids].reverse() : kids;
    if (!kids.length) { emit(depth, `<div ${attrs(d, o)} />`); return; }
    emit(depth, `<div ${attrs(d, o)}>`); order.forEach(k => walk(k, o, depth + 1)); emit(depth, `</div>`);
  };
  walk(rootId, null, 2);
  const o = objs[rootId]; const compName = String(o?.name ?? "Design").replace(/[^A-Za-z0-9]+(.)?/g, (_m, c) => c ? c.toUpperCase() : "").replace(/^[^A-Za-z]+/, "") || "Design";
  const body = lines.join("\n");
  const rootNote = o?.componentId ? `component: ${o.name}${o.mainInstance ? " (main)" : " (instance)"}` : "";
  res.code = react ? `${rootNote ? `// ${rootNote}\n` : ""}export default function ${compName[0].toUpperCase() + compName.slice(1)}() {\n  return (\n${body}\n  );\n}` : `${rootNote ? `<!-- ${esc(rootNote)} -->\n` : ""}${body}`;
  return res;
}

// ---------- değişkenler / ölçüler ----------
export function variableDefs(objs: Json, rootIds: string[], data: Json, names: ColorNames): Json {
  const colors = new Map<string, number>(), fonts = new Map<string, number>(), radii = new Map<string, number>(), spacing = new Map<string, number>(), strokes = new Map<string, number>();
  const inc = (m: Map<string, number>, k: string | undefined) => { if (k) m.set(k, (m.get(k) ?? 0) + 1); };
  const visit = (id: string) => { const o = objs[id]; if (!o) return;
    for (const f of o.fills ?? []) { inc(colors, f.fillColor?.toLowerCase()); for (const s of f.fillColorGradient?.stops ?? []) inc(colors, s.color?.toLowerCase()); }
    for (const s of o.strokes ?? []) { inc(colors, s.strokeColor?.toLowerCase()); if (s.strokeWidth) inc(strokes, `${round(s.strokeWidth)}px`); }
    for (const p of textParas(o)) for (const l of p.leaves) { inc(colors, l.fills?.[0]?.fillColor?.toLowerCase()); inc(fonts, `${l.fontFamily} / ${l.fontWeight} / ${l.fontSize}px / lh ${l.lineHeight} / ls ${l.letterSpacing}`); }
    const r = radius(o); if (r && o.type !== "circle") inc(radii, r);
    if (o.layout) { const g = o.layoutGap ?? {}, p = o.layoutPadding ?? {}; [g.rowGap, g.columnGap, p.p1, p.p2, p.p3, p.p4].forEach(v => v && inc(spacing, `${round(v)}px`)); }
    (o.shapes ?? []).forEach(visit); };
  rootIds.forEach(visit);
  const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  const tokens: Json[] = [];
  const tl = data?.tokensLib; const sets = tl?.sets ?? tl?.tokenSets;
  if (sets) for (const s of Object.values<Json>(sets)) for (const t of Object.values<Json>(s.tokens ?? {})) tokens.push({ set: s.name, name: t.name, type: t.type, value: t.value });
  return {
    colors: sorted(colors).map(([hex, uses]) => ({ value: hex, uses, ...(names.get(hex) ? { libraryName: names.get(hex), cssVar: `--${names.get(hex)!.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` } : {}) })),
    typography: sorted(fonts).map(([spec, uses]) => ({ spec, uses })),
    radii: sorted(radii).map(([value, uses]) => ({ value, uses })),
    spacing: sorted(spacing).map(([value, uses]) => ({ value, uses })),
    strokeWidths: sorted(strokes).map(([value, uses]) => ({ value, uses })),
    library: {
      colors: Object.values<Json>(data?.colors ?? {}).map(c => ({ name: [c.path, c.name].filter(Boolean).join("/"), value: c.color, opacity: c.opacity })),
      typographies: Object.values<Json>(data?.typographies ?? {}).map(t => ({ name: [t.path, t.name].filter(Boolean).join("/"), fontFamily: t.fontFamily, fontSize: t.fontSize, fontWeight: t.fontWeight, lineHeight: t.lineHeight, letterSpacing: t.letterSpacing })),
      tokens,
    },
  };
}

export const isRoot = (id: string) => id === ROOT;
