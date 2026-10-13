// Toplu oluşturma yürütücüsü: op listesini Penpot şekillerine çevirir, tek revizyonda ekler, ardından flex yerleşimi sunucuda hesaplar.
import { penpot, PenpotError, ROOT_FRAME, type Json } from "./penpot.js";
import { addObj, baseShape, fill, flexAttrs, geometry, modObj, normHex, richTextContent, stroke, uuid, type FlexLayout } from "./shapes.js";
import { bounds, normalizePath, pathBox, segsToString } from "./geom.js";
import { layoutSync, positionData, preload } from "./fonts.js";
import { layoutChanges } from "./layout.js";
import { dotArt, iconD } from "./vector.js";

type PI = { frameId: string; parentId: string };

/** CSS açısından (0=yukarı, 90=sağ) Penpot degradesi. */
export function gradient(g: Json): Json {
  const stops = (g.stops ?? []).map((s: Json, i: number, a: Json[]) => ({ color: normHex(s.color), offset: s.offset ?? (a.length > 1 ? i / (a.length - 1) : 0), opacity: s.opacity ?? 1 }));
  if (g.type === "radial") return { type: "radial", startX: 0.5, startY: 0.5, endX: 0.5, endY: 1, width: 1, stops };
  const a = ((g.angle ?? 180) * Math.PI) / 180, vx = Math.sin(a), vy = -Math.cos(a);
  return { type: "linear", startX: 0.5 - vx / 2, startY: 0.5 - vy / 2, endX: 0.5 + vx / 2, endY: 0.5 + vy / 2, width: 1, stops };
}
export const shadowOf = (s: Json): Json => ({ id: uuid(), style: s.inner ? "inner-shadow" : "drop-shadow", offsetX: s.x ?? 0, offsetY: s.y ?? 4, blur: s.blur ?? 12, spread: s.spread ?? 0, hidden: false, color: { color: normHex(s.color ?? "#000000"), opacity: s.opacity ?? 0.15 } });

/** Ortak ek öznitelikler: boyutlandırma davranışı, kenar boşluğu, gölge, bulanıklık, degrade, ham attrs. */
export function applyExtras(s: Json, op: Json) {
  if (op.hSizing) s.layoutItemHSizing = op.hSizing; if (op.vSizing) s.layoutItemVSizing = op.vSizing;
  if (op.margin !== undefined) { const m = typeof op.margin === "number" ? [op.margin, op.margin, op.margin, op.margin] : op.margin; s.layoutItemMargin = { m1: m[0], m2: m[1], m3: m[2], m4: m[3] }; s.layoutItemMarginType = "multiple"; }
  if (op.absolute) s.layoutItemAbsolute = true;
  if (op.shadow) s.shadow = (Array.isArray(op.shadow) ? op.shadow : [op.shadow]).map(shadowOf);
  if (op.blur) s.blur = { id: uuid(), type: "layer-blur", value: op.blur, hidden: false };
  if (op.fillGradient && s.type !== "text") s.fills = [{ fillOpacity: 1, fillColorGradient: gradient(op.fillGradient) }];
  if (op.attrs) Object.assign(s, op.attrs);
}

export async function buildText(o: Json, pi: PI): Promise<Json> {
  const runs = o.runs ?? [{ text: o.text ?? "" }]; const full = runs.map((r: Json) => r.text).join("");
  if (!full.trim()) throw new PenpotError(400, "empty-text", "text ya da runs gerekli");
  const content = richTextContent(runs, { fontFamily: o.fontFamily, fontSize: o.fontSize ?? 16, fontWeight: o.fontWeight, fontStyle: o.fontStyle, color: o.color ?? o.fill ?? "#000000", align: o.align, lineHeight: o.lineHeight, letterSpacing: o.letterSpacing });
  const fonts = await preload([content]);
  const fixedW = o.width !== undefined || o.hSizing === "fill";
  const l = layoutSync(content, fonts, fixedW ? (o.width ?? 100) : undefined);
  const w = fixedW ? (o.width ?? 100) : Math.ceil(l.width * 100) / 100, h = o.height ?? Math.ceil(l.height * 100) / 100;
  const s = baseShape("text", { name: o.name ?? full.replace(/\n/g, " ").slice(0, 40), x: o.x ?? 0, y: o.y ?? 0, width: Math.max(w, 1), height: Math.max(h, 1), ...pi, fill: null, opacity: o.opacity, hidden: o.hidden });
  delete s.fills; delete s.strokes; delete s.proportion; delete s.proportionLock;
  s.growType = fixedW ? (o.height ? "fixed" : "auto-height") : "auto-width";
  s.content = content; s.positionData = positionData(l, { x: o.x ?? 0, y: o.y ?? 0, w });
  applyExtras(s, o); return s;
}

export function buildPath(p: Json, pi: PI): Json {
  let segs = normalizePath(p.d); let b = pathBox(segs);
  if (p.x !== undefined || p.y !== undefined) { const dx = (p.x ?? b.x) - b.x, dy = (p.y ?? b.y) - b.y; segs = normalizePath(segsToString(segs, dx, dy)); b = pathBox(segs); }
  const s: Json = { id: uuid(), type: "path", name: p.name ?? "Vector", frameId: pi.frameId, parentId: pi.parentId, ...geometry(b.x, b.y, Math.max(b.w, 0.01), Math.max(b.h, 0.01)),
    constraintsH: "left", constraintsV: "top", flipX: null, flipY: null, proportion: b.h ? b.w / b.h : 1, proportionLock: false,
    content: segsToString(segs), fills: p.fill ? [fill(p.fill, p.fillOpacity ?? 1)] : [], strokes: [] };
  if (p.stroke) { const st: Json = stroke(p.stroke, p.strokeWidth ?? 1, 1, "solid", p.strokeAlignment ?? "center"); if (p.strokeCap && p.strokeCap !== "butt") { st.strokeCapStart = p.strokeCap; st.strokeCapEnd = p.strokeCap; } s.strokes = [st]; }
  if (p.opacity !== undefined && p.opacity !== 1) s.opacity = p.opacity; if (p.hidden) s.hidden = true;
  delete s.x; delete s.y; delete s.width; delete s.height;
  applyExtras(s, p); return s;
}

/** İkon: size×size saydam kutu + içinde Lucide kontur yolu (flex hizası ve dokunma alanı tutarlı kalsın diye). */
export function buildIcon(o: Json, pi: PI): Json[] {
  const size = o.size ?? 24, x = o.x ?? 0, y = o.y ?? 0;
  const box = baseShape("frame", { name: o.name ?? `icon/${o.icon}`, x, y, width: size, height: size, ...pi, fill: null });
  box.showContent = true; applyExtras(box, { ...o, shadow: undefined });
  const d = iconD(o.icon, x, y, size);
  const path = buildPath({ d, name: o.icon, stroke: o.color ?? "#111827", strokeWidth: (o.strokeWidth ?? 2) * size / 24, strokeCap: "round", fill: null }, { frameId: box.id, parentId: box.id });
  return [box, path];
}

export function buildBox(op: Json, pi: PI): Json {
  const type = op.op === "board" ? "frame" : op.op === "rect" ? "rect" : "circle";
  const defFill = type === "frame" ? "#ffffff" : "#b1b2b5";
  const s = baseShape(type, { name: op.name ?? (type === "frame" ? "Board" : type === "rect" ? "Rectangle" : "Ellipse"), x: op.x ?? 0, y: op.y ?? 0, width: op.width ?? 100, height: op.height ?? 100, ...pi,
    fill: op.fill === undefined ? defFill : op.fill, fillOpacity: op.fillOpacity, stroke: op.stroke ?? null, strokeWidth: op.strokeWidth, opacity: op.opacity, radius: op.radius, hidden: op.hidden });
  if (op.strokeAlignment && s.strokes?.[0]) s.strokes[0].strokeAlignment = op.strokeAlignment;
  if (type === "frame") { s.showContent = !(op.clip ?? false); if (op.layout) Object.assign(s, flexAttrs(op.layout as FlexLayout)); }
  applyExtras(s, op); return s;
}

/** Op listesini yürütür. autoLayout: flex board'ları sunucuda hesaplayıp ikinci bir revizyonda yerleştirir. */
export async function executeOps(fileId: string, pageId: string, ops: Json[], opts: { autoLayout?: boolean } = {}): Promise<{ ids: Record<string, string>; created: number; revn: number; layout?: Json }> {
  const rec = await penpot.fresh(fileId); const objs = penpot.page(rec, pageId).objects;
  const refs = new Map<string, Json>(); const changes: Json[] = []; const ids: Record<string, string> = {}; const roots: string[] = [];
  const resolve = (p?: string): PI => { if (!p) return { frameId: ROOT_FRAME, parentId: ROOT_FRAME };
    const made = refs.get(p); if (made) return { frameId: made.type === "frame" ? made.id : made.frameId, parentId: made.id };
    const ex = objs[p]; if (!ex) throw new PenpotError(404, "parent-not-found", `Üst öğe ne bu toplu işte ne de sayfada: ${p}`);
    return { frameId: ex.type === "frame" ? ex.id : ex.frameId, parentId: ex.id }; };
  const parentObj = (p?: string) => (p ? refs.get(p) ?? objs[p] : null);
  const push = (s: Json, parentRef?: string) => {
    const par = parentObj(parentRef);
    // flex üst öğede görsel sıra shapes'in tersi: başa ekleyince op sırası = görsel sıra
    changes.push(addObj(pageId, s, par?.layout ? 0 : undefined));
    if (!parentRef || !refs.has(parentRef)) roots.push(s.id);
  };
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op.op === "patch") { const s = refs.get(op.ref); if (!s) throw new PenpotError(400, "patch-unknown-ref", op.ref); applyExtras(s, op); continue; }
    const pi = resolve(op.parent); const ref = op.ref ?? `#${i}`;
    if (op.op === "icon") { const [box, path] = buildIcon(op, pi); refs.set(ref, box); ids[ref] = box.id; push(box, op.parent); changes.push(addObj(pageId, path)); continue; }
    if (op.op === "dots") { // parçacık çizimi: saydam kutu + parlaklık katmanları (+ isteğe bağlı parıltı)
      const size = op.size ?? 400, x = op.x ?? 0, y = op.y ?? 0; const src = op.icon ? { icon: op.icon } : op.d ? { d: op.d, mode: op.mode } : { preset: op.preset ?? "globe" };
      const layers = dotArt({ source: src as Json, x, y, size, dots: op.dots ?? 2200, strokeWidth: op.strokeWidth, seed: op.seed });
      const box = buildBox({ op: "board", name: op.name ?? `Dot art · ${op.icon ?? op.preset ?? "path"}`, x, y, width: size, height: size, fill: null, hSizing: op.hSizing, vSizing: op.vSizing, margin: op.margin, absolute: op.absolute }, pi);
      refs.set(ref, box); ids[ref] = box.id; push(box, op.parent); const inner = { frameId: box.id, parentId: box.id }; const color = op.color ?? "#9ec5ff";
      if (op.glow !== false) changes.push(addObj(pageId, buildPath({ d: layers[layers.length - 1].d, name: "Glow", fill: color, opacity: 0.55, blur: Math.max(2, size / 140) }, inner)));
      const alpha = [0.32, 0.62, 0.95, 1];
      layers.forEach((l, k) => changes.push(addObj(pageId, buildPath({ d: l.d, name: `Dots ${k + 1}`, fill: color, opacity: alpha[k + (4 - layers.length)] ?? 1 }, inner))));
      continue; }
    const s = op.op === "text" ? await buildText(op, pi) : op.op === "path" ? buildPath({ ...op, fill: op.fill === undefined && !op.stroke ? "#000000" : op.fill }, pi) : buildBox(op, pi);
    refs.set(ref, s); ids[ref] = s.id; push(s, op.parent);
  }
  let layout: Json; const later: Json[] = [];
  const hasFlex = [...refs.values()].some(s => s.layout === "flex") || ops.some(op => { const p = op.parent && !refs.has(op.parent) ? objs[op.parent] : null; return p?.layout === "flex"; });
  if (opts.autoLayout !== false && hasFlex) {
    // yerel kopya: sayfa nesneleri + yeni şekiller (üst öğelerin shapes listeleri add-obj sırasına göre güncellenir)
    const local: Json = { ...objs }; const newIds = new Set<string>(); const cloned = new Set<string>();
    for (const ch of changes) { local[ch.id] = { ...ch.obj, shapes: [] }; newIds.add(ch.id); }
    for (const ch of changes) { let p = local[ch.parentId]; if (!p) continue;
      if (!newIds.has(ch.parentId) && !cloned.has(ch.parentId)) { p = local[ch.parentId] = { ...p, shapes: [...(p.shapes ?? [])] }; cloned.add(ch.parentId); }
      if (ch.index === 0) p.shapes.unshift(ch.id); else p.shapes.push(ch.id); }
    const r = await layoutChanges(local, pageId, [...new Set(roots)], modObj);
    // yeni şekillere ait sonuçlar aynı revizyonda add-obj'a katılır; mevcut şekiller ikinci revizyona kalır
    for (const c of r.changes) (newIds.has(c.id) ? changes : later).push(c);
    layout = { boards: r.boards, adjusted: r.moved };
  }
  let res = await penpot.applyChanges(fileId, changes);
  if (later.length) res = await penpot.applyChanges(fileId, later);
  return { ids, created: refs.size, revn: res.revn, ...(layout ? { layout } : {}) };
}
