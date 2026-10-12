// Şekil üreticileri: Penpot'un JSON API'sinin (camelCase) beklediği alanları editörün kendi ürettiği biçimde kurar.
import { ROOT_FRAME, type Json } from "./penpot.js";

export const uuid = () => crypto.randomUUID();
const I = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

export function geometry(x: number, y: number, w: number, h: number) {
  return {
    x, y, width: w, height: h, rotation: 0,
    selrect: { x, y, width: w, height: h, x1: x, y1: y, x2: x + w, y2: y + h },
    points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }],
    transform: I(), transformInverse: I(),
  };
}
export const fill = (color: string, opacity = 1) => ({ fillColor: normHex(color), fillOpacity: opacity });
export const stroke = (color: string, width = 1, opacity = 1, style = "solid", alignment = "center") =>
  ({ strokeColor: normHex(color), strokeWidth: width, strokeOpacity: opacity, strokeStyle: style, strokeAlignment: alignment });
export function normHex(c: string): string {
  const s = c.trim(); if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) return ("#" + [...s.slice(1)].map(ch => ch + ch).join("")).toLowerCase();
  throw new Error(`Geçersiz renk: "${c}" (#RRGGBB bekleniyor)`);
}

export interface BaseOpts {
  name: string; x: number; y: number; width: number; height: number;
  frameId?: string; parentId?: string; fill?: string | null; fillOpacity?: number;
  stroke?: string | null; strokeWidth?: number; opacity?: number; radius?: number; hidden?: boolean;
}
export function baseShape(type: "rect" | "circle" | "frame" | "text", o: BaseOpts): Json {
  const frameId = o.frameId ?? ROOT_FRAME; const parentId = o.parentId ?? frameId;
  const s: Json = {
    id: uuid(), type, name: o.name, frameId, parentId, ...geometry(o.x, o.y, o.width, o.height),
    constraintsH: "left", constraintsV: "top", flipX: null, flipY: null, proportion: o.height ? o.width / o.height : 1, proportionLock: false,
    fills: [], strokes: [],
  };
  if (o.fill) s.fills = [fill(o.fill, o.fillOpacity ?? 1)];
  if (o.stroke) s.strokes = [stroke(o.stroke, o.strokeWidth ?? 1)];
  if (o.opacity !== undefined && o.opacity !== 1) s.opacity = o.opacity;
  if (o.hidden) s.hidden = true;
  if (type === "rect" || type === "frame") { const r = o.radius ?? 0; Object.assign(s, { r1: r, r2: r, r3: r, r4: r }); }
  if (type === "frame") Object.assign(s, { shapes: [], hideFillOnExport: false, hideInViewer: false, showContent: true });
  return s;
}

export interface FlexLayout { direction?: "row" | "column" | "row-reverse" | "column-reverse"; gap?: number; rowGap?: number; columnGap?: number;
  padding?: number | [number, number, number, number]; align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "space-between" | "space-around" | "space-evenly"; wrap?: boolean;
  sizingH?: "fix" | "auto"; sizingV?: "fix" | "auto"; }
export function flexAttrs(l: FlexLayout): Json {
  const pad = l.padding === undefined ? [0, 0, 0, 0] : typeof l.padding === "number" ? [l.padding, l.padding, l.padding, l.padding] : l.padding;
  return {
    layout: "flex", layoutFlexDir: l.direction ?? "row",
    layoutGap: { rowGap: l.rowGap ?? l.gap ?? 0, columnGap: l.columnGap ?? l.gap ?? 0 }, layoutGapType: "multiple",
    layoutPadding: { p1: pad[0], p2: pad[1], p3: pad[2], p4: pad[3] }, layoutPaddingType: "multiple",
    layoutAlignItems: l.align ?? "start", layoutJustifyContent: l.justify ?? "start", layoutAlignContent: "stretch",
    layoutWrapType: l.wrap ? "wrap" : "nowrap", layoutItemHSizing: l.sizingH ?? "fix", layoutItemVSizing: l.sizingV ?? "fix",
  };
}

export interface TextStyle { fontFamily?: string; fontSize?: number; fontWeight?: string; fontStyle?: "normal" | "italic";
  color?: string; align?: "left" | "center" | "right" | "justify"; lineHeight?: number; letterSpacing?: number; }
export interface TextRun extends TextStyle { text: string; textDecoration?: "none" | "underline" | "line-through"; textTransform?: "none" | "uppercase" | "lowercase" | "capitalize" }

function leafOf(text: string, st: TextRun | TextStyle): Json {
  const family = st.fontFamily ?? "sourcesanspro";
  const fontId = family === "sourcesanspro" ? "sourcesanspro" : `gfont-${family.toLowerCase().replace(/\s+/g, "-")}`;
  const weight = st.fontWeight ?? "400"; const style = st.fontStyle ?? "normal";
  const variant = `${weight === "400" ? (style === "italic" ? "italic" : "regular") : weight + (style === "italic" ? "italic" : "")}`;
  return { text, fontId, fontFamily: family, fontVariantId: variant, fontSize: String(st.fontSize ?? 16), fontWeight: weight, fontStyle: style,
    lineHeight: String(st.lineHeight ?? 1.2), letterSpacing: String(st.letterSpacing ?? 0), textAlign: st.align ?? "left",
    textDecoration: (st as TextRun).textDecoration ?? "none", textTransform: (st as TextRun).textTransform ?? "none", textDirection: "ltr",
    fills: [fill(st.color ?? "#000000")], typographyRefId: null, typographyRefFile: null };
}

/** Karışık stilli metin: her parça kendi rengi/ağırlığı/fontuyla; "\n" yeni paragraf açar. Parçalar temel stili devralır. */
export function richTextContent(runs: TextRun[], base: TextStyle = {}): Json {
  const paras: Json[][] = [[]];
  for (const r of runs) {
    const st = { ...base, ...Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined)) } as TextRun;
    r.text.split("\n").forEach((part, i) => { if (i > 0) paras.push([]); if (part.length) paras[paras.length - 1].push(leafOf(part, st)); });
  }
  const children = paras.map(leaves => {
    const first = leaves[0] ?? leafOf("", base); const para = { type: "paragraph", ...first, children: leaves.length ? leaves : [leafOf("", base)] } as Json; delete para.text; return para;
  });
  return { type: "root", children: [{ type: "paragraph-set", children }] };
}

/** Penpot metin içeriği. Varsayılan font: Penpot'un gömülü Source Sans Pro (fontId "sourcesanspro"). Google fontları: fontId "gfont-<slug>". "\n" paragraf ayırır. */
export function textContent(text: string, st: TextStyle = {}): Json { return richTextContent([{ text }], st); }

// ---- değişiklik (change) kurucuları ----
export const addObj = (pageId: string, obj: Json, index?: number) => ({ type: "add-obj", pageId, id: obj.id, frameId: obj.frameId, parentId: obj.parentId, obj, ...(index !== undefined ? { index } : {}) });
export const modObj = (pageId: string, id: string, attrs: Record<string, Json>) => ({ type: "mod-obj", pageId, id, operations: Object.entries(attrs).map(([attr, val]) => ({ type: "set", attr: kebab(attr), val })) });
export const delObj = (pageId: string, id: string) => ({ type: "del-obj", pageId, id });
export const movObjects = (pageId: string, parentId: string, shapes: string[], index?: number) => ({ type: "mov-objects", pageId, parentId, shapes, ...(index !== undefined ? { index } : {}) });
export const addPage = (id: string, name: string) => ({ type: "add-page", id, name });
export const modPage = (id: string, name: string) => ({ type: "mod-page", id, name });
export const delPage = (id: string) => ({ type: "del-page", id });
/** mod-obj "attr" alanı Penpot iç adlarıyla (kebab-case) gider; obje alanları camelCase. */
export const kebab = (s: string) => s.replace(/[A-Z]/g, m => "-" + m.toLowerCase());

/** x/y/genişlik/yükseklik değişince selrect+points yeniden kurulur (dönmemiş şekiller için). */
export function geometryOps(cur: Json, patch: { x?: number; y?: number; width?: number; height?: number }): Record<string, Json> {
  const x = patch.x ?? cur.x, y = patch.y ?? cur.y, w = patch.width ?? cur.width, h = patch.height ?? cur.height;
  const g = geometry(x, y, w, h);
  return { x, y, width: w, height: h, selrect: g.selrect, points: g.points };
}
