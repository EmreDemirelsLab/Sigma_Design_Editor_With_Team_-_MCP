// MCP araçları. Yanıtlar kompakt JSON: ajan için gereken kadar, fazlası istenince.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { penpot, PenpotError, ROOT_FRAME, type Json } from "./penpot.js";
import { addObj, addPage, baseShape, delObj, delPage, fill, flexAttrs, geometryOps, modObj, modPage, movObjects, normHex, stroke, textContent, uuid, type FlexLayout } from "./shapes.js";

const id = z.string().uuid();
const hex = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "#RRGGBB");
const ok = (v: unknown) => ({ content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v) }] });
const fail = (e: unknown) => {
  const m = e instanceof PenpotError ? { error: e.code, hint: e.hint, status: e.status } : { error: "internal", hint: (e as Error)?.message ?? String(e) };
  return { isError: true, content: [{ type: "text" as const, text: JSON.stringify(m) }] };
};
const wrap = <A,>(fn: (a: A) => Promise<unknown>) => async (a: A) => { try { return ok(await fn(a)); } catch (e) { return fail(e); } };

const textOf = (o: Json): string | undefined => {
  if (o?.type !== "text") return undefined;
  const out: string[] = []; const walk = (n: Json) => { if (!n) return; if (typeof n.text === "string") out.push(n.text); (n.children ?? []).forEach(walk); };
  walk(o.content); return out.join("");
};
const summary = (o: Json, objs: Json): Json => ({
  id: o.id, type: o.type, name: o.name, x: r(o.x), y: r(o.y), w: r(o.width), h: r(o.height),
  ...(o.hidden ? { hidden: true } : {}), ...(o.layout ? { layout: o.layout, dir: o.layoutFlexDir } : {}),
  ...(o.type === "text" ? { text: textOf(o)?.slice(0, 120) } : {}),
  ...(o.fills?.[0]?.fillColor ? { fill: o.fills[0].fillColor } : {}),
  ...(o.shapes?.length ? { children: o.shapes.length } : {}),
  ...(o.componentId ? { component: o.componentId, main: !!o.mainInstance } : {}),
});
const r = (n: number) => Math.round((n ?? 0) * 100) / 100;

export function registerTools(server: McpServer) {
  // ---------- KEŞİF ----------
  server.registerTool("penpot_list_teams", { description: "List Penpot teams the agent can access (id, name).", inputSchema: {} },
    wrap(async () => (await penpot.rpc("get-teams")).map((t: Json) => ({ id: t.id, name: t.name, default: t.isDefault }))));

  server.registerTool("penpot_list_projects", { description: "List projects in a team. Omit teamId to list projects across all teams.", inputSchema: { teamId: id.optional() } },
    wrap(async ({ teamId }) => {
      const teams = teamId ? [{ id: teamId }] : await penpot.rpc("get-teams");
      const out: Json[] = [];
      for (const t of teams) for (const p of await penpot.rpc("get-projects", { teamId: t.id })) out.push({ id: p.id, name: p.name, teamId: p.teamId, teamName: p.teamName, default: p.isDefault, files: p.count });
      return out;
    }));

  server.registerTool("penpot_list_files", { description: "List design files in a project (id, name, revision, modifiedAt).", inputSchema: { projectId: id } },
    wrap(async ({ projectId }) => (await penpot.rpc("get-project-files", { projectId })).map((f: Json) => ({ id: f.id, name: f.name, revn: f.revn, modifiedAt: f.modifiedAt, shared: f.isShared }))));

  server.registerTool("penpot_create_file", { description: "Create a new design file in a project. Returns file id and first page id.", inputSchema: { projectId: id, name: z.string().min(1) } },
    wrap(async ({ projectId, name }) => { const f = await penpot.rpc("create-file", { projectId, name }); const rec = await penpot.getFile(f.id, true); return { id: f.id, name: f.name, pages: rec.data.pages }; }));

  server.registerTool("penpot_file_overview", { description: "Fast overview of a file: pages with their top-level boards/shapes, counts of components and colors. Start here before editing.", inputSchema: { fileId: id } },
    wrap(async ({ fileId }) => {
      const rec = await penpot.getFile(fileId);
      const pages = rec.data.pages.map((pid: string) => { const p = rec.data.pagesIndex[pid]; const objs = p.objects; const root = objs[ROOT_FRAME];
        return { id: pid, name: p.name, objects: Object.keys(objs).length - 1, topLevel: (root?.shapes ?? []).map((sid: string) => summary(objs[sid], objs)).filter(Boolean) }; });
      return { id: rec.id, name: rec.name, revn: rec.revn, projectId: rec.projectId, teamId: rec.teamId, pages, components: Object.keys(rec.data.components ?? {}).length, colors: Object.keys(rec.data.colors ?? {}).length, typographies: Object.keys(rec.data.typographies ?? {}).length };
    }));

  server.registerTool("penpot_page_tree", { description: "Layer tree of a page (or of one shape subtree via rootId). depth limits nesting (default 2). Compact: id,type,name,x,y,w,h,text,fill,children.", inputSchema: { fileId: id, pageId: id, rootId: id.optional(), depth: z.number().int().min(1).max(10).default(2), includeHidden: z.boolean().default(true) } },
    wrap(async ({ fileId, pageId, rootId, depth, includeHidden }) => {
      const rec = await penpot.getFile(fileId); const objs = penpot.page(rec, pageId).objects;
      const build = (sid: string, d: number): Json => { const o = objs[sid]; if (!o || (!includeHidden && o.hidden)) return null;
        const node = summary(o, objs); if (d < depth && o.shapes?.length) node.items = o.shapes.map((c: string) => build(c, d + 1)).filter(Boolean); return node; };
      const start = rootId ?? ROOT_FRAME; const root = objs[start]; if (!root) throw new PenpotError(404, "shape-not-found", start);
      return rootId ? build(start, 0) : { pageId, name: penpot.page(rec, pageId).name, items: (root.shapes ?? []).map((c: string) => build(c, 1)).filter(Boolean) };
    }));

  server.registerTool("penpot_get_shape", { description: "Full raw JSON of one shape (all Penpot attributes). Use for precise inspection.", inputSchema: { fileId: id, pageId: id, shapeId: id } },
    wrap(async ({ fileId, pageId, shapeId }) => { const rec = await penpot.getFile(fileId); const o = penpot.page(rec, pageId).objects[shapeId]; if (!o) throw new PenpotError(404, "shape-not-found", shapeId); return o; }));

  server.registerTool("penpot_find_shapes", { description: "Search shapes in a page by name (case-insensitive substring or /regex/) and/or type (frame,rect,circle,text,path,group,bool,image,svg-raw).", inputSchema: { fileId: id, pageId: id, name: z.string().optional(), type: z.string().optional(), limit: z.number().int().min(1).max(500).default(100) } },
    wrap(async ({ fileId, pageId, name, type, limit }) => {
      const rec = await penpot.getFile(fileId); const objs = penpot.page(rec, pageId).objects;
      const re = name ? (name.startsWith("/") && name.endsWith("/") ? new RegExp(name.slice(1, -1), "i") : new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")) : null;
      const out: Json[] = [];
      for (const o of Object.values<Json>(objs)) { if (o.id === ROOT_FRAME) continue; if (type && o.type !== type) continue; if (re && !re.test(o.name ?? "") && !re.test(textOf(o) ?? "")) continue; out.push({ ...summary(o, objs), parentId: o.parentId }); if (out.length >= limit) break; }
      return out;
    }));

  server.registerTool("penpot_file_assets", { description: "Library assets of a file: colors, typographies, components (id, name).", inputSchema: { fileId: id } },
    wrap(async ({ fileId }) => { const d = (await penpot.getFile(fileId)).data; return {
      colors: Object.values<Json>(d.colors ?? {}).map(c => ({ id: c.id, name: c.name, color: c.color, opacity: c.opacity, path: c.path })),
      typographies: Object.values<Json>(d.typographies ?? {}).map(t => ({ id: t.id, name: t.name, fontFamily: t.fontFamily, fontSize: t.fontSize, fontWeight: t.fontWeight })),
      components: Object.values<Json>(d.components ?? {}).map(c => ({ id: c.id, name: c.name, path: c.path, mainInstanceId: c.mainInstanceId, mainInstancePage: c.mainInstancePage })) }; }));

  // ---------- SAYFALAR ----------
  server.registerTool("penpot_create_page", { description: "Add a page to a file.", inputSchema: { fileId: id, name: z.string().min(1) } },
    wrap(async ({ fileId, name }) => { const pid = uuid(); const rres = await penpot.applyChanges(fileId, [addPage(pid, name)]); return { pageId: pid, revn: rres.revn }; }));
  server.registerTool("penpot_rename_page", { description: "Rename a page.", inputSchema: { fileId: id, pageId: id, name: z.string().min(1) } },
    wrap(async ({ fileId, pageId, name }) => penpot.applyChanges(fileId, [modPage(pageId, name)])));
  server.registerTool("penpot_delete_page", { description: "Delete a page (irreversible; take a snapshot first for safety).", inputSchema: { fileId: id, pageId: id } },
    wrap(async ({ fileId, pageId }) => penpot.applyChanges(fileId, [delPage(pageId)])));

  // ---------- OLUŞTURMA ----------
  const common = { fileId: id, pageId: id, name: z.string().optional(), x: z.number().default(0), y: z.number().default(0),
    parentId: id.optional().describe("Parent board/group id. Omit for page root."), fill: hex.nullable().optional(), fillOpacity: z.number().min(0).max(1).optional(),
    stroke: hex.nullable().optional(), strokeWidth: z.number().min(0).optional(), opacity: z.number().min(0).max(1).optional(), hidden: z.boolean().optional() };
  const flexSchema = z.object({ direction: z.enum(["row", "column", "row-reverse", "column-reverse"]).optional(), gap: z.number().optional(), rowGap: z.number().optional(), columnGap: z.number().optional(),
    padding: z.union([z.number(), z.tuple([z.number(), z.number(), z.number(), z.number()])]).optional(), align: z.enum(["start", "center", "end", "stretch"]).optional(),
    justify: z.enum(["start", "center", "end", "space-between", "space-around", "space-evenly"]).optional(), wrap: z.boolean().optional(), sizingH: z.enum(["fix", "auto"]).optional(), sizingV: z.enum(["fix", "auto"]).optional() });

  async function parentInfo(fileId: string, pageId: string, parentId?: string) {
    if (!parentId) return { frameId: ROOT_FRAME, parentId: ROOT_FRAME };
    const rec = await penpot.getFile(fileId); const p = penpot.page(rec, pageId).objects[parentId];
    if (!p) throw new PenpotError(404, "parent-not-found", parentId);
    return { frameId: p.type === "frame" ? p.id : p.frameId, parentId: p.id };
  }

  server.registerTool("penpot_create_board", { description: "Create a board (frame/artboard). Optional flex auto-layout via `layout` (the Penpot editor applies the flow when the file is opened; children are re-positioned then, so give sensible absolute coordinates anyway). Returns id.", inputSchema: { ...common, width: z.number().positive().default(360), height: z.number().positive().default(640), radius: z.number().min(0).optional(), clip: z.boolean().default(true), layout: flexSchema.optional() } },
    wrap(async (a) => { const pi = await parentInfo(a.fileId, a.pageId, a.parentId);
      const s = baseShape("frame", { name: a.name ?? "Board", x: a.x, y: a.y, width: a.width, height: a.height, ...pi, fill: a.fill === undefined ? "#ffffff" : a.fill, fillOpacity: a.fillOpacity, stroke: a.stroke ?? null, strokeWidth: a.strokeWidth, opacity: a.opacity, radius: a.radius, hidden: a.hidden });
      if (a.clip) s.clipContent = true; if (a.layout) Object.assign(s, flexAttrs(a.layout as FlexLayout));
      const res = await penpot.applyChanges(a.fileId, [addObj(a.pageId, s)]); return { id: s.id, type: "frame", revn: res.revn }; }));

  server.registerTool("penpot_create_rectangle", { description: "Create a rectangle. Returns id.", inputSchema: { ...common, width: z.number().positive().default(100), height: z.number().positive().default(100), radius: z.number().min(0).optional() } },
    wrap(async (a) => { const pi = await parentInfo(a.fileId, a.pageId, a.parentId);
      const s = baseShape("rect", { name: a.name ?? "Rectangle", x: a.x, y: a.y, width: a.width, height: a.height, ...pi, fill: a.fill === undefined ? "#b1b2b5" : a.fill, fillOpacity: a.fillOpacity, stroke: a.stroke ?? null, strokeWidth: a.strokeWidth, opacity: a.opacity, radius: a.radius, hidden: a.hidden });
      const res = await penpot.applyChanges(a.fileId, [addObj(a.pageId, s)]); return { id: s.id, type: "rect", revn: res.revn }; }));

  server.registerTool("penpot_create_ellipse", { description: "Create an ellipse (circle when width==height). Returns id.", inputSchema: { ...common, width: z.number().positive().default(100), height: z.number().positive().default(100) } },
    wrap(async (a) => { const pi = await parentInfo(a.fileId, a.pageId, a.parentId);
      const s = baseShape("circle", { name: a.name ?? "Ellipse", x: a.x, y: a.y, width: a.width, height: a.height, ...pi, fill: a.fill === undefined ? "#b1b2b5" : a.fill, fillOpacity: a.fillOpacity, stroke: a.stroke ?? null, strokeWidth: a.strokeWidth, opacity: a.opacity, hidden: a.hidden });
      const res = await penpot.applyChanges(a.fileId, [addObj(a.pageId, s)]); return { id: s.id, type: "circle", revn: res.revn }; }));

  const textStyle = { fontFamily: z.string().optional().describe("Default 'sourcesanspro' (built-in). Google fonts by family name, e.g. 'Manrope', 'Inter'."), fontSize: z.number().positive().optional(), fontWeight: z.string().optional().describe("'400','500','600','700'…"), fontStyle: z.enum(["normal", "italic"]).optional(), color: hex.optional(), align: z.enum(["left", "center", "right", "justify"]).optional(), lineHeight: z.number().optional(), letterSpacing: z.number().optional() };
  server.registerTool("penpot_create_text", { description: "Create a text layer. Width/height optional (auto-width when omitted). Returns id.", inputSchema: { ...common, text: z.string().min(1), width: z.number().positive().optional(), height: z.number().positive().optional(), ...textStyle } },
    wrap(async (a) => { const pi = await parentInfo(a.fileId, a.pageId, a.parentId);
      const fs = a.fontSize ?? 16; const w = a.width ?? Math.max(10, Math.round(a.text.length * fs * 0.62 + fs)); const h = a.height ?? Math.round(fs * (a.lineHeight ?? 1.2));
      const s = baseShape("text", { name: a.name ?? a.text.slice(0, 40), x: a.x, y: a.y, width: w, height: h, ...pi, fill: null, opacity: a.opacity, hidden: a.hidden });
      delete s.fills; delete s.strokes; delete s.proportion; delete s.proportionLock;
      s.growType = a.width ? (a.height ? "fixed" : "auto-height") : "auto-width";
      s.content = textContent(a.text, { fontFamily: a.fontFamily, fontSize: fs, fontWeight: a.fontWeight, fontStyle: a.fontStyle, color: a.color ?? a.fill ?? "#000000", align: a.align, lineHeight: a.lineHeight, letterSpacing: a.letterSpacing });
      const res = await penpot.applyChanges(a.fileId, [addObj(a.pageId, s)]); return { id: s.id, type: "text", revn: res.revn }; }));

  // ---------- DÜZENLEME ----------
  server.registerTool("penpot_update_shape", { description: "Update attributes of a shape: position/size (geometry recomputed), name, fill, stroke, opacity, radius, hidden/blocked, text content/style, flex layout on boards, or raw attrs (advanced, camelCase Penpot attribute names).",
    inputSchema: { fileId: id, pageId: id, shapeId: id, name: z.string().optional(), x: z.number().optional(), y: z.number().optional(), width: z.number().positive().optional(), height: z.number().positive().optional(),
      fill: hex.nullable().optional().describe("null removes fills"), fillOpacity: z.number().min(0).max(1).optional(), stroke: hex.nullable().optional(), strokeWidth: z.number().min(0).optional(), opacity: z.number().min(0).max(1).optional(), radius: z.number().min(0).optional(),
      hidden: z.boolean().optional(), blocked: z.boolean().optional(), text: z.string().optional(), ...textStyle, layout: flexSchema.nullable().optional().describe("Boards only; null removes auto-layout"), attrs: z.record(z.string(), z.any()).optional() } },
    wrap(async (a) => {
      const rec = await penpot.getFile(a.fileId); const o = penpot.page(rec, a.pageId).objects[a.shapeId]; if (!o) throw new PenpotError(404, "shape-not-found", a.shapeId);
      const set: Record<string, Json> = {};
      if (a.x !== undefined || a.y !== undefined || a.width !== undefined || a.height !== undefined) {
        if (o.rotation) throw new PenpotError(400, "rotated-shape", "Döndürülmüş şekillerde geometri güncellemesi desteklenmiyor; attrs ile ham değer ver.");
        Object.assign(set, geometryOps(o, a));
      }
      if (a.name !== undefined) set.name = a.name;
      if (a.fill !== undefined) set.fills = a.fill === null ? [] : [fill(a.fill, a.fillOpacity ?? o.fills?.[0]?.fillOpacity ?? 1)];
      else if (a.fillOpacity !== undefined && o.fills?.[0]) set.fills = [{ ...o.fills[0], fillOpacity: a.fillOpacity }];
      if (a.stroke !== undefined) set.strokes = a.stroke === null ? [] : [stroke(a.stroke, a.strokeWidth ?? o.strokes?.[0]?.strokeWidth ?? 1)];
      else if (a.strokeWidth !== undefined && o.strokes?.[0]) set.strokes = [{ ...o.strokes[0], strokeWidth: a.strokeWidth }];
      if (a.opacity !== undefined) set.opacity = a.opacity;
      if (a.radius !== undefined) Object.assign(set, { r1: a.radius, r2: a.radius, r3: a.radius, r4: a.radius });
      if (a.hidden !== undefined) set.hidden = a.hidden; if (a.blocked !== undefined) set.blocked = a.blocked;
      if (o.type === "text" && (a.text !== undefined || a.fontFamily || a.fontSize || a.fontWeight || a.fontStyle || a.color || a.align || a.lineHeight !== undefined || a.letterSpacing !== undefined)) {
        const leaf = o.content?.children?.[0]?.children?.[0]?.children?.[0] ?? {};
        set.content = textContent(a.text ?? textOf(o) ?? "", { fontFamily: a.fontFamily ?? (leaf.fontFamily === "sourcesanspro" ? undefined : leaf.fontFamily), fontSize: a.fontSize ?? Number(leaf.fontSize ?? 16), fontWeight: a.fontWeight ?? leaf.fontWeight, fontStyle: a.fontStyle ?? leaf.fontStyle,
          color: a.color ?? leaf.fills?.[0]?.fillColor, align: a.align ?? leaf.textAlign, lineHeight: a.lineHeight ?? Number(leaf.lineHeight ?? 1.2), letterSpacing: a.letterSpacing ?? Number(leaf.letterSpacing ?? 0) });
        set.positionData = null;
      }
      if (a.layout !== undefined) { if (o.type !== "frame") throw new PenpotError(400, "not-a-board", "layout yalnız board'lara uygulanır");
        if (a.layout === null) Object.assign(set, { layout: null }); else Object.assign(set, flexAttrs(a.layout as FlexLayout)); }
      if (a.attrs) Object.assign(set, a.attrs);
      if (!Object.keys(set).length) return { unchanged: true };
      const res = await penpot.applyChanges(a.fileId, [modObj(a.pageId, a.shapeId, set)]); return { id: a.shapeId, updated: Object.keys(set), revn: res.revn }; }));

  server.registerTool("penpot_move_shapes", { description: "Reparent and/or reorder shapes: move into a board/group (parentId; omit for page root) at an optional z-index (0 = bottom).", inputSchema: { fileId: id, pageId: id, shapeIds: z.array(id).min(1), parentId: id.optional(), index: z.number().int().min(0).optional() } },
    wrap(async ({ fileId, pageId, shapeIds, parentId, index }) => penpot.applyChanges(fileId, [movObjects(pageId, parentId ?? ROOT_FRAME, shapeIds, index)])));

  server.registerTool("penpot_delete_shapes", { description: "Delete shapes by id.", inputSchema: { fileId: id, pageId: id, shapeIds: z.array(id).min(1) } },
    wrap(async ({ fileId, pageId, shapeIds }) => { const res = await penpot.applyChanges(fileId, shapeIds.map(s => delObj(pageId, s))); return { deleted: shapeIds.length, revn: res.revn }; }));

  // ---------- TOPLU ----------
  const opSchema = z.discriminatedUnion("op", [
    z.object({ op: z.literal("board"), ref: z.string().optional(), name: z.string().optional(), x: z.number().default(0), y: z.number().default(0), width: z.number().positive().default(360), height: z.number().positive().default(640), parent: z.string().optional(), fill: hex.nullable().optional(), stroke: hex.nullable().optional(), strokeWidth: z.number().optional(), radius: z.number().optional(), opacity: z.number().optional(), layout: flexSchema.optional() }),
    z.object({ op: z.literal("rect"), ref: z.string().optional(), name: z.string().optional(), x: z.number().default(0), y: z.number().default(0), width: z.number().positive().default(100), height: z.number().positive().default(100), parent: z.string().optional(), fill: hex.nullable().optional(), stroke: hex.nullable().optional(), strokeWidth: z.number().optional(), radius: z.number().optional(), opacity: z.number().optional() }),
    z.object({ op: z.literal("ellipse"), ref: z.string().optional(), name: z.string().optional(), x: z.number().default(0), y: z.number().default(0), width: z.number().positive().default(100), height: z.number().positive().default(100), parent: z.string().optional(), fill: hex.nullable().optional(), stroke: hex.nullable().optional(), strokeWidth: z.number().optional(), opacity: z.number().optional() }),
    z.object({ op: z.literal("text"), ref: z.string().optional(), name: z.string().optional(), text: z.string().min(1), x: z.number().default(0), y: z.number().default(0), width: z.number().positive().optional(), height: z.number().positive().optional(), parent: z.string().optional(), ...textStyle }),
  ]);
  server.registerTool("penpot_batch_create", { description: "Create many shapes in ONE file revision (fast, atomic). Each op may set `ref` (a label) and `parent` (a ref of an earlier op in this batch OR an existing shape id). Returns a ref→id map. Ideal for building a whole screen.",
    inputSchema: { fileId: id, pageId: id, ops: z.array(opSchema).min(1).max(500) } },
    wrap(async ({ fileId, pageId, ops }) => {
      const rec = await penpot.getFile(fileId); const objs = penpot.page(rec, pageId).objects;
      const refs = new Map<string, Json>(); const changes: Json[] = []; const result: Record<string, string> = {};
      const resolveParent = (p?: string) => { if (!p) return { frameId: ROOT_FRAME, parentId: ROOT_FRAME };
        const made = refs.get(p); if (made) return { frameId: made.type === "frame" ? made.id : made.frameId, parentId: made.id };
        const ex = objs[p]; if (!ex) throw new PenpotError(404, "parent-not-found", `Üst öğe ne bu toplu işte ne de sayfada: ${p}`);
        return { frameId: ex.type === "frame" ? ex.id : ex.frameId, parentId: ex.id }; };
      ops.forEach((op: Json, i: number) => {
        const pi = resolveParent(op.parent); let s: Json;
        if (op.op === "text") { const fs = op.fontSize ?? 16; const w = op.width ?? Math.max(10, Math.round(op.text.length * fs * 0.62 + fs)); const h = op.height ?? Math.round(fs * (op.lineHeight ?? 1.2));
          s = baseShape("text", { name: op.name ?? op.text.slice(0, 40), x: op.x, y: op.y, width: w, height: h, ...pi, fill: null }); delete s.fills; delete s.strokes; delete s.proportion; delete s.proportionLock;
          s.growType = op.width ? (op.height ? "fixed" : "auto-height") : "auto-width"; s.content = textContent(op.text, { fontFamily: op.fontFamily, fontSize: fs, fontWeight: op.fontWeight, fontStyle: op.fontStyle, color: op.color, align: op.align, lineHeight: op.lineHeight, letterSpacing: op.letterSpacing }); }
        else { const type = op.op === "board" ? "frame" : op.op === "rect" ? "rect" : "circle"; const defFill = type === "frame" ? "#ffffff" : "#b1b2b5";
          s = baseShape(type, { name: op.name ?? (type === "frame" ? "Board" : type === "rect" ? "Rectangle" : "Ellipse"), x: op.x, y: op.y, width: op.width, height: op.height, ...pi, fill: op.fill === undefined ? defFill : op.fill, stroke: op.stroke ?? null, strokeWidth: op.strokeWidth, opacity: op.opacity, radius: op.radius });
          if (type === "frame") { s.clipContent = true; if (op.layout) Object.assign(s, flexAttrs(op.layout)); } }
        const ref = op.ref ?? `#${i}`; refs.set(ref, s); result[ref] = s.id;
        // Flex layout'lu üst öğede Penpot yerleşim sırası z-sırasının tersidir; her çocuğu başa (index 0) ekleyince op sırası = görsel sıra.
        const parentObj = op.parent ? (refs.get(op.parent) ?? objs[op.parent]) : null;
        changes.push(addObj(pageId, s, parentObj?.layout ? 0 : undefined));
      });
      const res = await penpot.applyChanges(fileId, changes); return { created: changes.length, ids: result, revn: res.revn }; }));

  // ---------- GÜVENLİK / ÇIKTI ----------
  server.registerTool("penpot_snapshot", { description: "Create a named version snapshot of the file (restore point) before risky bulk edits.", inputSchema: { fileId: id, label: z.string().min(1) } },
    wrap(async ({ fileId, label }) => { const s = await penpot.rpc("create-file-snapshot", { fileId, label }); return { id: s.id, label: s.label, revn: s.revn }; }));

  server.registerTool("penpot_export", { description: "Render a board/shape to PNG (returned as image) or SVG (returned as text) via Penpot's exporter. scale 1-4.", inputSchema: { fileId: id, pageId: id, shapeId: id, type: z.enum(["png", "svg"]).default("png"), scale: z.number().min(0.5).max(4).default(1), wasm: z.boolean().default(false).describe("Use the new WASM renderer path in the exporter") } },
    async ({ fileId, pageId, shapeId, type, scale, wasm }) => { try {
      const { bytes, mime } = await penpot.exportShape(fileId, pageId, shapeId, type, scale, wasm);
      if (type === "svg") return { content: [{ type: "text" as const, text: bytes.toString("utf8") }] };
      return { content: [{ type: "image" as const, data: bytes.toString("base64"), mimeType: mime.startsWith("image/") ? mime : "image/png" }] };
    } catch (e) { return fail(e); } });

  server.registerTool("penpot_file_url", { description: "Browser URL of a file/page (for a human to open in the Penpot editor).", inputSchema: { fileId: id, pageId: id.optional() } },
    wrap(async ({ fileId, pageId }) => { const rec = await penpot.getFile(fileId); const base = process.env.PENPOT_PUBLIC_URI?.replace(/\/$/, "") ?? "";
      return { url: `${base}/#/workspace?team-id=${rec.teamId}&file-id=${fileId}${pageId ? `&page-id=${pageId}` : ""}` }; }));
}
