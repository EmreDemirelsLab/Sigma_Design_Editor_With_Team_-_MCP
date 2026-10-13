// Sunucu tarafı flex yerleşim (Yoga). Penpot flex kurallarını Yoga'ya çevirir; editör açılmadan doğru konum/boyut üretir.
import Yoga, { Align, Direction, Edge, FlexDirection, Gutter, Justify, MeasureMode, Wrap, type Node as YNode } from "yoga-layout";
import type { Json } from "./penpot.js";
import { bounds } from "./geom.js";
import { boxAttrs, shiftAttrs } from "./edit.js";
import { layoutSync, positionData, preload } from "./fonts.js";

type Mod = (pageId: string, id: string, a: Record<string, Json>) => Json;
const isFlex = (o: Json) => o?.type === "frame" && o.layout === "flex";
// Yoga varsayılan olarak tam piksele yuvarlar; kapsayıcı ve çocuk farklı yönlere yuvarlanınca 1-2px taşma oluşur. Kesirli hesap + kendi yuvarlamamız.
const yogaConfig = Yoga.Config.create(); yogaConfig.setPointScaleFactor(0);

const DIR: Record<string, FlexDirection> = { row: FlexDirection.Row, column: FlexDirection.Column, "row-reverse": FlexDirection.RowReverse, "column-reverse": FlexDirection.ColumnReverse };
const ALIGN: Record<string, Align> = { start: Align.FlexStart, center: Align.Center, end: Align.FlexEnd, stretch: Align.Stretch, baseline: Align.Baseline };
const JUST: Record<string, Justify> = { start: Justify.FlexStart, center: Justify.Center, end: Justify.FlexEnd, "space-between": Justify.SpaceBetween, "space-around": Justify.SpaceAround, "space-evenly": Justify.SpaceEvenly, stretch: Justify.FlexStart };

/** Penpot'ta flex görsel sırası shapes dizisinin tersidir (editör davranışı). */
const flowChildren = (objs: Json, o: Json) => [...(o.shapes ?? [])].reverse().map((id: string) => objs[id]).filter((c: Json) => c && !c.hidden && !c.layoutItemAbsolute);

/** Alt ağaçtaki tüm flex board'ları hesaplar ve gerekli mod-obj değişikliklerini döndürür. */
export async function layoutChanges(objs: Json, pageId: string, rootIds: string[], mod: Mod): Promise<{ changes: Json[]; boards: number; moved: number }> {
  // 1) en dıştaki flex board'lar (üstü flex olmayan)
  const roots: string[] = []; const texts: Json[] = [];
  const scan = (id: string) => { const o = objs[id]; if (!o) return; if (o.type === "text") texts.push(o.content);
    if (isFlex(o) && !isFlex(objs[o.parentId])) roots.push(id); (o.shapes ?? []).forEach(scan); };
  rootIds.forEach(id => { let top = id; while (isFlex(objs[objs[top]?.parentId])) top = objs[top].parentId; scan(top); });
  const fonts = await preload(texts);
  const boxes = new Map<string, { x: number; y: number; w: number; h: number; text?: Json }>(); let boards = 0;

  for (const rid of [...new Set(roots)]) {
    const nodes = new Map<string, YNode>();
    const build = (o: Json, parentFlex: Json | null): YNode => {
      const n = Yoga.Node.create(yogaConfig); nodes.set(o.id, n); const b = bounds(o);
      const row = parentFlex ? (parentFlex.layoutFlexDir ?? "row").startsWith("row") : true;
      const hs = parentFlex || isFlex(o) ? o.layoutItemHSizing ?? "fix" : "fix", vs = parentFlex || isFlex(o) ? o.layoutItemVSizing ?? "fix" : "fix";
      // genişlik
      if (hs === "fill" && parentFlex) { if (row) { n.setFlexGrow(1); n.setFlexShrink(1); n.setFlexBasis(0); } else n.setAlignSelf(Align.Stretch); }
      else if (hs === "auto" && (isFlex(o) || o.type === "text")) { /* içerik */ }
      else n.setWidth(b.w);
      // yükseklik
      if (vs === "fill" && parentFlex) { if (!row) { n.setFlexGrow(1); n.setFlexShrink(1); n.setFlexBasis(0); } else n.setAlignSelf(Align.Stretch); }
      else if (vs === "auto" && (isFlex(o) || o.type === "text")) { /* içerik */ }
      else n.setHeight(b.h);
      if (o.type === "text" && (o.growType === "auto-width" || o.growType === "auto-height" || hs === "auto" || vs === "auto")) {
        if (o.growType === "auto-height" && hs === "fix") n.setWidth(b.w);
        n.setMeasureFunc((width, wm) => { const max = o.growType === "auto-width" && hs !== "fill" ? undefined : (wm === MeasureMode.Undefined ? undefined : width);
          const l = layoutSync(o.content, fonts, max); return { width: max !== undefined && o.growType !== "auto-width" ? max : l.width, height: l.height }; });
      }
      const mg = o.layoutItemMargin; if (parentFlex && mg) { n.setMargin(Edge.Top, mg.m1 ?? 0); n.setMargin(Edge.Right, mg.m2 ?? 0); n.setMargin(Edge.Bottom, mg.m3 ?? 0); n.setMargin(Edge.Left, mg.m4 ?? 0); }
      if (o.layoutItemMinW) n.setMinWidth(o.layoutItemMinW); if (o.layoutItemMaxW) n.setMaxWidth(o.layoutItemMaxW);
      if (o.layoutItemMinH) n.setMinHeight(o.layoutItemMinH); if (o.layoutItemMaxH) n.setMaxHeight(o.layoutItemMaxH);
      if (isFlex(o)) { boards++;
        n.setFlexDirection(DIR[o.layoutFlexDir ?? "row"] ?? FlexDirection.Row);
        n.setFlexWrap(o.layoutWrapType === "wrap" ? Wrap.Wrap : Wrap.NoWrap);
        const p = o.layoutPadding ?? {}; n.setPadding(Edge.Top, p.p1 ?? 0); n.setPadding(Edge.Right, p.p2 ?? 0); n.setPadding(Edge.Bottom, p.p3 ?? 0); n.setPadding(Edge.Left, p.p4 ?? 0);
        const g = o.layoutGap ?? {}; n.setGap(Gutter.Row, g.rowGap ?? 0); n.setGap(Gutter.Column, g.columnGap ?? 0);
        n.setAlignItems(ALIGN[o.layoutAlignItems ?? "start"] ?? Align.FlexStart);
        n.setJustifyContent(JUST[o.layoutJustifyContent ?? "start"] ?? Justify.FlexStart);
        n.setAlignContent(ALIGN[o.layoutAlignContent ?? "start"] ?? Align.FlexStart);
        flowChildren(objs, o).forEach((c: Json, i: number) => n.insertChild(build(c, o), i));
      }
      return n;
    };
    const root = objs[rid]; const rn = build(root, null);
    rn.calculateLayout(undefined, undefined, Direction.LTR);
    const rb = bounds(root);
    const place = (o: Json, n: YNode, ax: number, ay: number) => {
      boxes.set(o.id, { x: ax, y: ay, w: n.getComputedWidth(), h: n.getComputedHeight() });
      if (isFlex(o)) flowChildren(objs, o).forEach((c: Json) => { const cn = nodes.get(c.id)!; place(c, cn, ax + cn.getComputedLeft(), ay + cn.getComputedTop()); });
    };
    place(root, rn, rb.x, rb.y);
    rn.freeRecursive();
  }

  // 2) değişiklikler: yerleşimi hesaplanan şekiller + onlara bağlı (akış dışı) alt ağaçlar
  const changes: Json[] = []; let moved = 0;
  const managed = new Set(boxes.keys());
  const apply = (id: string, dx: number, dy: number) => { // id'nin akış dışı torunlarını kaydır
    const o = objs[id]; for (const c of o?.shapes ?? []) { if (managed.has(c)) continue;
      const a = shiftAttrs(objs[c], dx, dy); if (Object.keys(a).length) changes.push(mod(pageId, c, a)); apply(c, dx, dy); } };
  for (const [id, nb] of boxes) {
    const o = objs[id]; const b = bounds(o); const r = (v: number) => Math.round(v * 100) / 100;
    const nx = r(nb.x), ny = r(nb.y), nw = r(nb.w), nh = r(nb.h);
    const changedPos = Math.abs(nx - b.x) > 0.01 || Math.abs(ny - b.y) > 0.01, changedSize = Math.abs(nw - b.w) > 0.01 || Math.abs(nh - b.h) > 0.01;
    const a: Record<string, Json> = changedPos || changedSize ? boxAttrs(o, nx, ny, nw, nh) : {};
    if (o.type === "text" && (changedPos || changedSize || !o.positionData)) {
      const l = layoutSync(o.content, await preload([o.content]), o.growType === "auto-width" ? undefined : nw);
      a.positionData = positionData(l, { x: nx, y: ny, w: nw });
    }
    if (Object.keys(a).length) { changes.push(mod(pageId, id, a)); moved++; }
    if (changedPos) apply(id, nx - b.x, ny - b.y);
  }
  return { changes, boards, moved };
}

/** Flex dışındaki otomatik boyutlu metinlerin gerçek boyutunu ve positionData'sını hesaplar. */
export async function textFixChanges(objs: Json, pageId: string, ids: string[], mod: Mod): Promise<Json[]> {
  const out: Json[] = []; const list = ids.map(id => objs[id]).filter((o: Json) => o?.type === "text");
  const fonts = await preload(list.map(o => o.content));
  for (const o of list) {
    const b = bounds(o); const l = layoutSync(o.content, fonts, o.growType === "auto-width" ? undefined : b.w);
    const w = o.growType === "auto-width" ? l.width : b.w, h = o.growType === "fixed" ? b.h : l.height;
    const a: Record<string, Json> = Math.abs(w - b.w) > 0.01 || Math.abs(h - b.h) > 0.01 ? boxAttrs(o, b.x, b.y, Math.round(w * 100) / 100, Math.round(h * 100) / 100) : {};
    a.positionData = positionData(l, { x: b.x, y: b.y, w });
    out.push(mod(pageId, o.id, a));
  }
  return out;
}
