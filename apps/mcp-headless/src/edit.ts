// Şekil düzenleme yardımcıları: taşıma/boyutlandırma özniteliklerini Penpot'un beklediği biçimde (selrect, points, yol içeriği) üretir.
import type { Json } from "./penpot.js";
import { bounds, contentToD, translateD } from "./geom.js";
import { geometry } from "./shapes.js";

/** (dx,dy) kadar taşıma için değişecek öznitelikler (döndürülmüş şekillerde points de kayar). */
export function shiftAttrs(o: Json, dx: number, dy: number): Record<string, Json> {
  const a: Record<string, Json> = {};
  if (!dx && !dy) return a;
  if (typeof o.x === "number") a.x = o.x + dx;
  if (typeof o.y === "number") a.y = o.y + dy;
  if (o.selrect) a.selrect = { ...o.selrect, x: o.selrect.x + dx, y: o.selrect.y + dy, x1: o.selrect.x1 + dx, y1: o.selrect.y1 + dy, x2: o.selrect.x2 + dx, y2: o.selrect.y2 + dy };
  if (Array.isArray(o.points)) a.points = o.points.map((p: Json) => ({ x: p.x + dx, y: p.y + dy }));
  if ((o.type === "path" || o.type === "bool") && o.content) { try { a.content = translateD(contentToD(o.content), dx, dy); } catch { /* bilinmeyen içerik olduğu gibi kalır */ } }
  if (Array.isArray(o.positionData)) a.positionData = o.positionData.map((p: Json) => ({ ...p, x: p.x + dx, y: p.y + dy }));
  return a;
}

/** Dönmemiş dikdörtgen tabanlı şekli (frame/rect/circle/text/group) verilen kutuya yerleştirir. */
export function boxAttrs(o: Json, x: number, y: number, w: number, h: number): Record<string, Json> {
  const b = bounds(o);
  if (o.type === "path" || o.type === "bool" || o.rotation) return shiftAttrs(o, x - b.x, y - b.y); // vektör/dönmüş: yalnız taşı
  const g = geometry(x, y, w, h); const a: Record<string, Json> = { x, y, width: w, height: h, selrect: g.selrect, points: g.points };
  if (Array.isArray(o.positionData) && (x !== b.x || y !== b.y)) a.positionData = o.positionData.map((p: Json) => ({ ...p, x: p.x + x - b.x, y: p.y + y - b.y }));
  return a;
}

/** Bir şekli ve tüm alt ağacını kaydıran mod-obj değişiklikleri. */
export function shiftSubtree(objs: Json, id: string, dx: number, dy: number, pageId: string, mod: (pageId: string, id: string, a: Record<string, Json>) => Json, skip?: Set<string>): Json[] {
  const out: Json[] = [];
  const walk = (sid: string) => { const o = objs[sid]; if (!o) return;
    if (!skip?.has(sid)) { const a = shiftAttrs(o, dx, dy); if (Object.keys(a).length) out.push(mod(pageId, sid, a)); }
    (o.shapes ?? []).forEach(walk); };
  walk(id); return out;
}

/** Bir alt ağacı aynı kimliklerle silip yeniden ekleyen değişiklikler (mod-obj'un UUID yazamadığı öznitelikler için: bileşen, etkileşim, gölge). */
export function recreateSubtree(objs: Json, pageId: string, id: string, headPatch: Json, addObj: (pageId: string, obj: Json, index?: number) => Json, delObj: (pageId: string, id: string) => Json): Json[] {
  const head = objs[id]; const parent = objs[head.parentId]; const index = (parent?.shapes ?? []).indexOf(id);
  const order: string[] = []; const walk = (sid: string) => { order.push(sid); (objs[sid]?.shapes ?? []).forEach(walk); }; walk(id);
  return [delObj(pageId, id), addObj(pageId, { ...head, ...headPatch, shapes: [] }, index >= 0 ? index : undefined), ...order.slice(1).map(sid => addObj(pageId, { ...objs[sid], shapes: [] }))];
}
