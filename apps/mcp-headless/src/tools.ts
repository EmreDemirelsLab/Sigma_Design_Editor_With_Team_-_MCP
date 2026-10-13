// MCP araçları. Yanıtlar kompakt JSON: ajan için gereken kadar, fazlası istenince.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { penpot, PenpotError, ROOT_FRAME, type Json } from "./penpot.js";
import { addObj, addPage, baseShape, delObj, delPage, fill, flexAttrs, geometry, geometryOps, modObj, modPage, movObjects, normHex, richTextContent, stroke, textContent, uuid, type FlexLayout } from "./shapes.js";
import { colorNames, describe, designCode, metadataXml, textOf, textParas, variableDefs } from "./context.js";
import { bounds, contentToD, normalizePath, pathBox, round, segsToString, translateD } from "./geom.js";
import { buildPath, buildText, executeOps, gradient, shadowOf } from "./ops.js";
import { layoutChanges, textFixChanges } from "./layout.js";
import { lintDesign } from "./lint.js";
import { booleanD, dotArt, primitiveD, searchIcons, shapeToD, type BoolOp } from "./vector.js";
import { layoutSync, preload, textToPaths } from "./fonts.js";
import { recreateSubtree } from "./edit.js";
import { palette, themeColors, typeScale, type Brand } from "./brand.js";
import { appComponent, deviceFrame, DEVICES, webSection } from "./templates.js";

const id = z.string().uuid();
const hex = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "#RRGGBB");
const ok = (v: unknown) => ({ content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v) }] });
const fail = (e: unknown) => {
  const explain = e instanceof PenpotError && typeof (e.details as Json)?.explain === "string" ? String((e.details as Json).explain).split("\n\nValue:")[0].replace(/\s+/g, " ").slice(0, 700) : undefined;
  const m = e instanceof PenpotError ? { error: e.code, hint: e.hint, status: e.status, ...(explain ? { explain } : {}) } : { error: "internal", hint: (e as Error)?.message ?? String(e) };
  return { isError: true, content: [{ type: "text" as const, text: JSON.stringify(m) }] };
};
const wrap = <A,>(fn: (a: A) => Promise<unknown>) => async (a: A) => { try { return ok(await fn(a)); } catch (e) { return fail(e); } };

/** Katman ağacı düğümü: gerçek sınır kutusu, dolgu, kontur, köşe, metin/font, yerleşim ve bileşen bilgisi. */
const summary = (o: Json, _objs: Json, names?: Map<string, string>): Json => describe(o, names);

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

  server.registerTool("penpot_page_tree", { description: "Layer tree of a page (or of one subtree via rootId). depth limits nesting (default 2). Each node: id,type,name,x,y,w,h (true bounds, also for vectors), fill (with library color names), stroke (width color alignment), radius, font, text, layout, sizing, component. For code-ready output use penpot_get_design_context.", inputSchema: { fileId: id, pageId: id, rootId: id.optional(), depth: z.number().int().min(1).max(10).default(2), includeHidden: z.boolean().default(true) } },
    wrap(async ({ fileId, pageId, rootId, depth, includeHidden }) => {
      const rec = await penpot.getFile(fileId); const objs = penpot.page(rec, pageId).objects; const names = colorNames(rec.data);
      const build = (sid: string, d: number): Json => { const o = objs[sid]; if (!o || (!includeHidden && o.hidden)) return null;
        const node = summary(o, objs, names); if (d < depth && o.shapes?.length) node.items = o.shapes.map((c: string) => build(c, d + 1)).filter(Boolean); return node; };
      const start = rootId ?? ROOT_FRAME; const root = objs[start]; if (!root) throw new PenpotError(404, "shape-not-found", start);
      return rootId ? build(start, 0) : { pageId, name: penpot.page(rec, pageId).name, items: (root.shapes ?? []).map((c: string) => build(c, 1)).filter(Boolean) };
    }));

  server.registerTool("penpot_get_shape", { description: "Full raw JSON of one shape (all Penpot attributes). Use for precise inspection.", inputSchema: { fileId: id, pageId: id, shapeId: id } },
    wrap(async ({ fileId, pageId, shapeId }) => { const rec = await penpot.getFile(fileId); const o = penpot.page(rec, pageId).objects[shapeId]; if (!o) throw new PenpotError(404, "shape-not-found", shapeId); return o; }));

  server.registerTool("penpot_find_shapes", { description: "Search shapes in a page by name (case-insensitive substring or /regex/) and/or type (frame,rect,circle,text,path,group,bool,image,svg-raw).", inputSchema: { fileId: id, pageId: id, name: z.string().optional(), type: z.string().optional(), limit: z.number().int().min(1).max(500).default(100) } },
    wrap(async ({ fileId, pageId, name, type, limit }) => {
      const rec = await penpot.getFile(fileId); const objs = penpot.page(rec, pageId).objects; const names = colorNames(rec.data);
      const re = name ? (name.startsWith("/") && name.endsWith("/") ? new RegExp(name.slice(1, -1), "i") : new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")) : null;
      const out: Json[] = [];
      for (const o of Object.values<Json>(objs)) { if (o.id === ROOT_FRAME) continue; if (type && o.type !== type) continue; if (re && !re.test(o.name ?? "") && !re.test(textOf(o) ?? "")) continue; out.push({ ...summary(o, objs, names), parentId: o.parentId }); if (out.length >= limit) break; }
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
  const runSchema = z.object({ text: z.string(), ...textStyle, textDecoration: z.enum(["none", "underline", "line-through"]).optional(), textTransform: z.enum(["none", "uppercase", "lowercase", "capitalize"]).optional() });
  const runsField = { runs: z.array(runSchema).min(1).optional().describe("Mixed-style text: each run has its own color/weight/font/size and inherits the base style; e.g. [{text:'ZenGo'},{text:'Ai',color:'#f26b1d'}]. '\\n' starts a new paragraph.") };
  server.registerTool("penpot_create_text", { description: "Create a text layer — single style via `text`, or mixed styles via `runs` (per-run color/weight/font/size). Size is measured with the real font (exact width/height, line wrapping when width is given). '\\n' makes paragraphs. Returns id and bounds.",
    inputSchema: { ...common, text: z.string().min(1).optional(), ...runsField, width: z.number().positive().optional(), height: z.number().positive().optional(), ...textStyle } },
    wrap(async (a) => { const pi = await parentInfo(a.fileId, a.pageId, a.parentId); const s = await buildText(a, pi);
      const res = await penpot.applyChanges(a.fileId, [addObj(a.pageId, s)]); const b = bounds(s);
      return { id: s.id, type: "text", bounds: { x: round(b.x), y: round(b.y), w: round(b.w), h: round(b.h) }, revn: res.revn }; }));

  // ---------- VEKTÖR ----------
  const pathFields = { d: z.string().min(2).describe("SVG path data in page coordinates, any commands (M L H V C S Q T A Z, absolute or relative). Use x/y to place it instead: the path is then translated so its bounding box starts at (x,y)."),
    strokeCap: z.enum(["round", "square", "butt"]).optional(), strokeAlignment: z.enum(["center", "inner", "outer"]).optional() };
  server.registerTool("penpot_create_path", { description: "Create a vector (path) from SVG path data — icons, logos, curves, arcs. Fill and/or stroke (with round caps for line art). Returns id and true bounds.",
    inputSchema: { fileId: id, pageId: id, name: z.string().optional(), x: z.number().optional(), y: z.number().optional(), parentId: id.optional(), fill: hex.nullable().optional(), fillOpacity: z.number().min(0).max(1).optional(),
      stroke: hex.nullable().optional(), strokeWidth: z.number().min(0).optional(), opacity: z.number().min(0).max(1).optional(), hidden: z.boolean().optional(), ...pathFields } },
    wrap(async (a) => { const pi = await parentInfo(a.fileId, a.pageId, a.parentId);
      const s = buildPath({ ...a, fill: a.fill === undefined && !a.stroke ? "#000000" : a.fill }, pi);
      const res = await penpot.applyChanges(a.fileId, [addObj(a.pageId, s)]); const b = bounds(s);
      return { id: s.id, type: "path", bounds: { x: round(b.x), y: round(b.y), w: round(b.w), h: round(b.h) }, revn: res.revn }; }));

  // ---------- BİLEŞENLER ----------
  server.registerTool("penpot_create_component", { description: "Turn an existing board/group/shape into a main component of this file's library (in place, keeping its position and layer order). Returns componentId; place copies with penpot_instantiate_component.",
    inputSchema: { fileId: id, pageId: id, shapeId: id, name: z.string().optional(), path: z.string().optional().describe("Library folder, e.g. 'Logo/Primary'") } },
    wrap(async ({ fileId, pageId, shapeId, name, path }) => {
      const rec = await penpot.fresh(fileId); const objs = penpot.page(rec, pageId).objects; const head = objs[shapeId];
      if (!head) throw new PenpotError(404, "shape-not-found", shapeId);
      if (head.componentId || head.shapeRef) throw new PenpotError(400, "already-component", "Şekil zaten bir bileşen ya da bileşen kopyasının parçası");
      const parent = objs[head.parentId]; const index = (parent?.shapes ?? []).indexOf(shapeId); const cid = uuid();
      const order: string[] = []; const walk = (sid: string) => { order.push(sid); (objs[sid]?.shapes ?? []).forEach(walk); }; walk(shapeId);
      // Penpot, var olan şekle mod-obj ile UUID alanı yazdırmıyor; bu yüzden alt ağaç aynı kimliklerle, bileşen bilgisiyle tek revizyonda yeniden eklenir.
      const readd = (o: Json, extra: Json = {}, idx?: number) => addObj(pageId, { ...o, ...extra, shapes: [] }, idx);
      const changes: Json[] = [delObj(pageId, shapeId),
        { type: "add-component", id: cid, name: name ?? head.name, path: path ?? "", mainInstanceId: shapeId, mainInstancePage: pageId },
        readd(head, { componentId: cid, componentFile: fileId, componentRoot: true, mainInstance: true, ...(name ? { name } : {}) }, index >= 0 ? index : undefined),
        ...order.slice(1).map(sid => readd(objs[sid]))];
      const res = await penpot.applyChanges(fileId, changes); return { componentId: cid, mainInstanceId: shapeId, shapes: order.length, revn: res.revn };
    }));
  server.registerTool("penpot_instantiate_component", { description: "Place a copy (instance) of a component at (x,y). The component may live in this file or in a connected library (libraryFileId). Find components with penpot_search_design_system or penpot_file_assets.",
    inputSchema: { fileId: id, pageId: id, componentId: id, libraryFileId: id.optional().describe("File that owns the component; omit when it is in this file"), x: z.number(), y: z.number(), parentId: id.optional(), name: z.string().optional() } },
    wrap(async (a) => {
      const srcFileId = a.libraryFileId ?? a.fileId;
      const src = srcFileId === a.fileId ? await penpot.fresh(a.fileId) : await penpot.getFile(srcFileId);
      const comp = src.data.components?.[a.componentId]; if (!comp) throw new PenpotError(404, "component-not-found", `${a.componentId} (dosya ${srcFileId})`);
      if (comp.deleted) throw new PenpotError(400, "component-deleted", comp.name);
      const sobjs = penpot.page(src, comp.mainInstancePage).objects; const main = sobjs[comp.mainInstanceId]; if (!main) throw new PenpotError(404, "main-instance-missing", comp.mainInstanceId);
      const pi = await parentInfo(a.fileId, a.pageId, a.parentId); const mb = bounds(main), dx = a.x - mb.x, dy = a.y - mb.y;
      const idMap = new Map<string, string>(); const collect = (sid: string) => { idMap.set(sid, uuid()); (sobjs[sid]?.shapes ?? []).forEach(collect); }; collect(main.id);
      const shift = (o: Json): Json => { const c = structuredClone(o);
        if (typeof c.x === "number") c.x += dx; if (typeof c.y === "number") c.y += dy;
        if (c.selrect) c.selrect = { ...c.selrect, x: c.selrect.x + dx, y: c.selrect.y + dy, x1: c.selrect.x1 + dx, y1: c.selrect.y1 + dy, x2: c.selrect.x2 + dx, y2: c.selrect.y2 + dy };
        if (Array.isArray(c.points)) c.points = c.points.map((p: Json) => ({ x: p.x + dx, y: p.y + dy }));
        if ((c.type === "path" || c.type === "bool") && c.content) c.content = translateD(contentToD(c.content), dx, dy);
        if (Array.isArray(c.positionData)) c.positionData = c.positionData.map((p: Json) => ({ ...p, x: p.x + dx, y: p.y + dy }));
        return c; };
      const changes: Json[] = [];
      const copy = (sid: string, parentId: string, frameId: string, head: boolean) => {
        const o = sobjs[sid]; if (!o) return; const c = shift(o); const nid = idMap.get(sid)!;
        c.id = nid; c.parentId = parentId; c.frameId = frameId; c.shapeRef = sid;
        delete c.mainInstance; delete c.touched;
        if (head) { c.componentRoot = true; c.componentId = a.componentId; c.componentFile = srcFileId; if (a.name) c.name = a.name; }
        else if (!o.componentId) { delete c.componentRoot; delete c.componentId; delete c.componentFile; }
        if (Array.isArray(c.shapes)) c.shapes = c.shapes.map((k: string) => idMap.get(k)).filter(Boolean);
        changes.push(addObj(a.pageId, c));
        const childFrame = c.type === "frame" ? nid : frameId;
        (o.shapes ?? []).forEach((k: string) => copy(k, nid, childFrame, false));
      };
      copy(main.id, pi.parentId, pi.frameId, true);
      // add-obj üst öğeye eklerken shapes listesini kendisi kurar; kopyadaki shapes alanını boşaltıp sırayla ekleyelim
      for (const ch of changes) if (Array.isArray(ch.obj.shapes)) ch.obj.shapes = [];
      const res = await penpot.applyChanges(a.fileId, changes);
      return { id: idMap.get(main.id), component: comp.name, shapes: changes.length, revn: res.revn };
    }));

  // ---------- DÜZENLEME ----------
  const updateFields = { name: z.string().optional(), x: z.number().optional(), y: z.number().optional(), width: z.number().positive().optional(), height: z.number().positive().optional(),
    fill: hex.nullable().optional().describe("null removes fills"), fillOpacity: z.number().min(0).max(1).optional(), stroke: hex.nullable().optional(), strokeWidth: z.number().min(0).optional(), opacity: z.number().min(0).max(1).optional(), radius: z.number().min(0).optional(),
    hidden: z.boolean().optional(), blocked: z.boolean().optional(), text: z.string().optional().describe("Replaces the whole text (single style). Omit to restyle while keeping mixed-style runs."), ...textStyle,
    layout: flexSchema.nullable().optional().describe("Boards only; null removes auto-layout"),
    fillGradient: z.object({ type: z.enum(["linear", "radial"]).default("linear"), angle: z.number().optional(), stops: z.array(z.object({ color: hex, offset: z.number().min(0).max(1).optional(), opacity: z.number().min(0).max(1).optional() })).min(2) }).optional(),
    shadow: z.union([z.array(z.object({ x: z.number().optional(), y: z.number().optional(), blur: z.number().optional(), spread: z.number().optional(), color: hex.optional(), opacity: z.number().min(0).max(1).optional(), inner: z.boolean().optional() })), z.null()]).optional().describe("Replaces all shadows; null removes"),
    blur: z.number().min(0).nullable().optional().describe("Layer blur px; null removes"), strokeAlignment: z.enum(["center", "inner", "outer"]).optional(), strokeStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
    hSizing: z.enum(["fix", "fill", "auto"]).optional(), vSizing: z.enum(["fix", "fill", "auto"]).optional(), margin: z.union([z.number(), z.tuple([z.number(), z.number(), z.number(), z.number()])]).optional(),
    absolute: z.boolean().optional(), clip: z.boolean().optional().describe("Boards: clip content"), growType: z.enum(["auto-width", "auto-height", "fixed"]).optional(),
    attrs: z.record(z.string(), z.any()).optional() };

  /** Bir şekil için mod-obj alanlarını hesaplar; yalnız istenen alanlar gönderilir. */
  const computeUpdate = (o: Json, a: Json): Record<string, Json> => {
    const set: Record<string, Json> = {};
    if (a.x !== undefined || a.y !== undefined || a.width !== undefined || a.height !== undefined) {
      if (o.rotation) throw new PenpotError(400, "rotated-shape", "Döndürülmüş şekillerde geometri güncellemesi desteklenmiyor; attrs ile ham değer ver.");
      if (o.type === "path" || o.type === "bool") { // yolu kaydır/ölçekle: içerik + sınır kutusu birlikte
        const b = bounds(o), nx = a.x ?? b.x, ny = a.y ?? b.y, sx = a.width !== undefined && b.w ? a.width / b.w : 1, sy = a.height !== undefined && b.h ? a.height / b.h : 1;
        const segs = normalizePath(contentToD(o.content)).map(s => ({ c: s.c, p: s.p.map((v, i) => i % 2 === 0 ? nx + (v - b.x) * sx : ny + (v - b.y) * sy) }));
        const nb = pathBox(segs); const g = geometry(nb.x, nb.y, nb.w, nb.h);
        Object.assign(set, { content: segsToString(segs), selrect: g.selrect, points: g.points });
      } else Object.assign(set, geometryOps({ x: bounds(o).x, y: bounds(o).y, width: bounds(o).w, height: bounds(o).h }, a));
    }
    if (a.name !== undefined) set.name = a.name;
    if (a.fill !== undefined) set.fills = a.fill === null ? [] : [fill(a.fill, a.fillOpacity ?? o.fills?.[0]?.fillOpacity ?? 1)];
    else if (a.fillOpacity !== undefined && o.fills?.[0]) set.fills = [{ ...o.fills[0], fillOpacity: a.fillOpacity }];
    if (a.stroke !== undefined) set.strokes = a.stroke === null ? [] : [{ ...(o.strokes?.[0] ?? {}), ...stroke(a.stroke, a.strokeWidth ?? o.strokes?.[0]?.strokeWidth ?? 1, o.strokes?.[0]?.strokeOpacity ?? 1, o.strokes?.[0]?.strokeStyle ?? "solid", o.strokes?.[0]?.strokeAlignment ?? "center") }];
    else if (a.strokeWidth !== undefined && o.strokes?.[0]) set.strokes = [{ ...o.strokes[0], strokeWidth: a.strokeWidth }];
    if (a.opacity !== undefined) set.opacity = a.opacity;
    if (a.radius !== undefined) Object.assign(set, { r1: a.radius, r2: a.radius, r3: a.radius, r4: a.radius });
    if (a.hidden !== undefined) set.hidden = a.hidden; if (a.blocked !== undefined) set.blocked = a.blocked;
    const styleAsked = a.fontFamily || a.fontSize || a.fontWeight || a.fontStyle || a.color || a.align || a.lineHeight !== undefined || a.letterSpacing !== undefined;
    if (o.type === "text" && a.text !== undefined) {
      const leaf = textParas(o)[0]?.leaves[0] ?? ({} as Json), para = textParas(o)[0];
      set.content = textContent(a.text, { fontFamily: a.fontFamily ?? (leaf.fontFamily === "sourcesanspro" ? undefined : leaf.fontFamily), fontSize: a.fontSize ?? Number(leaf.fontSize ?? 16), fontWeight: a.fontWeight ?? leaf.fontWeight, fontStyle: a.fontStyle ?? leaf.fontStyle,
        color: a.color ?? leaf.fills?.[0]?.fillColor, align: a.align ?? para?.align, lineHeight: a.lineHeight ?? Number(leaf.lineHeight ?? 1.2), letterSpacing: a.letterSpacing ?? Number(leaf.letterSpacing ?? 0) });
      set.positionData = null;
    } else if (o.type === "text" && styleAsked) { // yapıyı koru: her paragraf/parçaya yalnız istenen stil alanlarını uygula
      const patch: Json = {};
      if (a.fontFamily) { patch.fontFamily = a.fontFamily; patch.fontId = a.fontFamily === "sourcesanspro" ? "sourcesanspro" : `gfont-${a.fontFamily.toLowerCase().replace(/\s+/g, "-")}`; }
      if (a.fontSize) patch.fontSize = String(a.fontSize); if (a.fontWeight) patch.fontWeight = a.fontWeight; if (a.fontStyle) patch.fontStyle = a.fontStyle;
      if (a.fontWeight || a.fontStyle) patch.fontVariantId = (a.fontWeight ?? "400") === "400" ? (a.fontStyle === "italic" ? "italic" : "regular") : `${a.fontWeight}${a.fontStyle === "italic" ? "italic" : ""}`;
      if (a.color) patch.fills = [fill(a.color)]; if (a.lineHeight !== undefined) patch.lineHeight = String(a.lineHeight); if (a.letterSpacing !== undefined) patch.letterSpacing = String(a.letterSpacing);
      const walk = (n: Json): Json => { if (!n || typeof n !== "object") return n; const c = { ...n };
        if (c.type === "paragraph" || typeof c.text === "string") Object.assign(c, patch);
        if (c.type === "paragraph" && a.align) c.textAlign = a.align;
        if (Array.isArray(c.children)) c.children = c.children.map(walk); return c; };
      set.content = walk(o.content); set.positionData = null;
    }
    if (a.layout !== undefined) { if (o.type !== "frame") throw new PenpotError(400, "not-a-board", "layout yalnız board'lara uygulanır");
      if (a.layout === null) Object.assign(set, { layout: null }); else Object.assign(set, flexAttrs(a.layout as FlexLayout)); }
    if (a.fillGradient) set.fills = [{ fillOpacity: 1, fillColorGradient: gradient(a.fillGradient) }];
    if (a.shadow !== undefined) set.shadow = a.shadow === null ? [] : a.shadow.map(shadowOf);
    if (a.blur !== undefined) set.blur = a.blur === null ? null : { id: uuid(), type: "layer-blur", value: a.blur, hidden: false };
    if ((a.strokeAlignment || a.strokeStyle) && (set.strokes ?? o.strokes)?.[0]) set.strokes = (set.strokes ?? o.strokes).map((st: Json, i: number) => i ? st : { ...st, ...(a.strokeAlignment ? { strokeAlignment: a.strokeAlignment } : {}), ...(a.strokeStyle ? { strokeStyle: a.strokeStyle } : {}) });
    if (a.hSizing) set.layoutItemHSizing = a.hSizing; if (a.vSizing) set.layoutItemVSizing = a.vSizing; if (a.absolute !== undefined) set.layoutItemAbsolute = a.absolute;
    if (a.margin !== undefined) { const m = typeof a.margin === "number" ? [a.margin, a.margin, a.margin, a.margin] : a.margin; set.layoutItemMargin = { m1: m[0], m2: m[1], m3: m[2], m4: m[3] }; set.layoutItemMarginType = "multiple"; }
    if (a.clip !== undefined && o.type === "frame") set.showContent = !a.clip;
    if (a.growType && o.type === "text") set.growType = a.growType;
    if (a.attrs) Object.assign(set, a.attrs);
    return set;
  };

  /** Güncellenen şekillerin içinde bulunduğu (ya da sahip olduğu) flex düzenlerini yeniden hesaplar. */
  const relayout = async (fileId: string, pageId: string, ids: string[]) => {
    const rec = await penpot.fresh(fileId); const objs = penpot.page(rec, pageId).objects;
    const touched = ids.filter(sid => objs[sid] && (objs[sid].layout === "flex" || objs[objs[sid].parentId]?.layout === "flex"));
    if (!touched.length) return null;
    const r = await layoutChanges(objs, pageId, touched, modObj); if (!r.changes.length) return null;
    const res = await penpot.applyChanges(fileId, r.changes); return { boards: r.boards, adjusted: r.moved, revn: res.revn };
  };

  server.registerTool("penpot_update_shape", { description: "Update attributes of a shape: position/size (geometry recomputed; vectors are moved/scaled), name, fill or gradient, stroke (color, width, style, alignment), opacity, radius, shadow, blur, hidden/blocked, text content or style (style-only changes keep mixed-style runs), flex layout and flex-child sizing/margin, clip, or raw attrs (advanced, camelCase Penpot attribute names). Always computed against a fresh copy of the file.",
    inputSchema: { fileId: id, pageId: id, shapeId: id, ...updateFields } },
    wrap(async (a) => {
      const rec = await penpot.fresh(a.fileId); const o = penpot.page(rec, a.pageId).objects[a.shapeId]; if (!o) throw new PenpotError(404, "shape-not-found", a.shapeId);
      const set = computeUpdate(o, a); if (!Object.keys(set).length) return { unchanged: true };
      const res = await penpot.applyChanges(a.fileId, [modObj(a.pageId, a.shapeId, set)]); const lay = await relayout(a.fileId, a.pageId, [a.shapeId]);
      return { id: a.shapeId, updated: Object.keys(set), revn: lay?.revn ?? res.revn, ...(lay ? { relayout: { boards: lay.boards, adjusted: lay.adjusted } } : {}) }; }));

  server.registerTool("penpot_batch_update", { description: "Update many shapes in ONE revision (same fields as penpot_update_shape per item). Use for restyling a whole screen, applying a palette, renaming layers, etc.",
    inputSchema: { fileId: id, pageId: id, updates: z.array(z.object({ shapeId: id, ...updateFields })).min(1).max(500) } },
    wrap(async ({ fileId, pageId, updates }) => {
      const rec = await penpot.fresh(fileId); const objs = penpot.page(rec, pageId).objects; const changes: Json[] = []; const report: Json[] = [];
      for (const u of updates) { const o = objs[u.shapeId]; if (!o) throw new PenpotError(404, "shape-not-found", u.shapeId);
        const set = computeUpdate(o, u); if (Object.keys(set).length) { changes.push(modObj(pageId, u.shapeId, set)); report.push({ id: u.shapeId, updated: Object.keys(set) }); } }
      if (!changes.length) return { unchanged: true };
      const res = await penpot.applyChanges(fileId, changes); const lay = await relayout(fileId, pageId, report.map(r => r.id));
      return { updated: report, revn: lay?.revn ?? res.revn, ...(lay ? { relayout: { boards: lay.boards, adjusted: lay.adjusted } } : {}) }; }));

  server.registerTool("penpot_move_shapes", { description: "Reparent and/or reorder shapes: move into a board/group (parentId; omit for page root) at an optional z-index (0 = bottom).", inputSchema: { fileId: id, pageId: id, shapeIds: z.array(id).min(1), parentId: id.optional(), index: z.number().int().min(0).optional() } },
    wrap(async ({ fileId, pageId, shapeIds, parentId, index }) => penpot.applyChanges(fileId, [movObjects(pageId, parentId ?? ROOT_FRAME, shapeIds, index)])));

  server.registerTool("penpot_delete_shapes", { description: "Delete shapes by id.", inputSchema: { fileId: id, pageId: id, shapeIds: z.array(id).min(1) } },
    wrap(async ({ fileId, pageId, shapeIds }) => { const res = await penpot.applyChanges(fileId, shapeIds.map(s => delObj(pageId, s))); return { deleted: shapeIds.length, revn: res.revn }; }));

  // ---------- TOPLU ----------
  const sizing = z.enum(["fix", "fill", "auto"]);
  const gradientSchema = z.object({ type: z.enum(["linear", "radial"]).default("linear"), angle: z.number().optional().describe("CSS angle: 0=to top, 90=to right, 180=to bottom (default)"),
    stops: z.array(z.object({ color: hex, offset: z.number().min(0).max(1).optional(), opacity: z.number().min(0).max(1).optional() })).min(2) });
  const shadowSchema = z.object({ x: z.number().optional(), y: z.number().optional(), blur: z.number().optional(), spread: z.number().optional(), color: hex.optional(), opacity: z.number().min(0).max(1).optional(), inner: z.boolean().optional() });
  const extras = { ref: z.string().optional(), parent: z.string().optional().describe("ref of an earlier op OR an existing shape id"), name: z.string().optional(),
    hSizing: sizing.optional().describe("Inside a flex parent: fix | fill (stretch) | auto (hug content). On a flex board itself: auto = hug children."), vSizing: sizing.optional(),
    margin: z.union([z.number(), z.tuple([z.number(), z.number(), z.number(), z.number()])]).optional(), absolute: z.boolean().optional().describe("Ignore the parent's flex flow"),
    shadow: z.union([shadowSchema, z.array(shadowSchema)]).optional(), blur: z.number().optional(), opacity: z.number().min(0).max(1).optional(), attrs: z.record(z.string(), z.any()).optional() };
  const box = { x: z.number().default(0), y: z.number().default(0), fill: hex.nullable().optional(), fillGradient: gradientSchema.optional(), stroke: hex.nullable().optional(), strokeWidth: z.number().optional(), strokeAlignment: z.enum(["center", "inner", "outer"]).optional() };
  const opSchema = z.discriminatedUnion("op", [
    z.object({ op: z.literal("board"), ...extras, ...box, width: z.number().positive().default(360), height: z.number().positive().default(640), radius: z.number().optional(), clip: z.boolean().optional(), layout: flexSchema.optional() }),
    z.object({ op: z.literal("rect"), ...extras, ...box, width: z.number().positive().default(100), height: z.number().positive().default(100), radius: z.number().optional() }),
    z.object({ op: z.literal("ellipse"), ...extras, ...box, width: z.number().positive().default(100), height: z.number().positive().default(100) }),
    z.object({ op: z.literal("text"), ...extras, text: z.string().min(1).optional(), ...runsField, x: z.number().default(0), y: z.number().default(0), width: z.number().positive().optional(), height: z.number().positive().optional(), ...textStyle }),
    z.object({ op: z.literal("path"), ...extras, x: z.number().optional(), y: z.number().optional(), fill: hex.nullable().optional(), stroke: hex.nullable().optional(), strokeWidth: z.number().optional(), ...pathFields }),
    z.object({ op: z.literal("icon"), ...extras, icon: z.string().describe("Lucide icon name, e.g. 'arrow-right' (find with penpot_search_icons)"), x: z.number().default(0), y: z.number().default(0), size: z.number().positive().default(24), color: hex.optional(), strokeWidth: z.number().positive().optional() }),
    z.object({ op: z.literal("patch"), ref: z.string(), hSizing: sizing.optional(), vSizing: sizing.optional(), margin: extras.margin, absolute: z.boolean().optional(), shadow: extras.shadow, attrs: extras.attrs }),
  ]);
  server.registerTool("penpot_batch_create", { description: "Create many shapes in ONE revision: board (optional flex layout), rect, ellipse, text (exact font measurement, mixed `runs`), path (SVG d), icon (Lucide). Each op may set `ref` and `parent` (ref or existing id), sizing inside flex (hSizing/vSizing fix|fill|auto), margin, shadow, gradient, blur. Flex boards are laid out on the server right after creation, so the result is correct without opening the editor. Returns ref→id map.",
    inputSchema: { fileId: id, pageId: id, ops: z.array(opSchema).min(1).max(800), autoLayout: z.boolean().default(true) } },
    wrap(async ({ fileId, pageId, ops, autoLayout }) => executeOps(fileId, pageId, ops as Json[], { autoLayout })));

  // ---------- GÜVENLİK / ÇIKTI ----------
  server.registerTool("penpot_snapshot", { description: "Create a named version snapshot of the file (restore point) before risky bulk edits.", inputSchema: { fileId: id, label: z.string().min(1) } },
    wrap(async ({ fileId, label }) => { const s = await penpot.rpc("create-file-snapshot", { fileId, label }); return { id: s.id, label: s.label, revn: s.revn }; }));

  /** Dışa aktarma: dosya render-wasm ise önce WASM yolu, olmazsa klasik yol. */
  const exportAuto = async (fileId: string, pageId: string, shapeId: string, type: "png" | "svg", scale: number, wasm?: boolean) => {
    if (wasm !== undefined) return penpot.exportShape(fileId, pageId, shapeId, type, scale, wasm);
    const rec = await penpot.getFile(fileId); const prefer = rec.features.includes("render-wasm/v1");
    try { return await penpot.exportShape(fileId, pageId, shapeId, type, scale, prefer); }
    catch (e) {
      const msg = e instanceof PenpotError ? e.hint : String(e);
      // Metin katmanı editörde hiç açılmadıysa (positionData yok) exporter SVG'de foreignObject bekler ve zaman aşımına düşer; ikinci deneme de aynı sonucu verir.
      if (type === "svg" && /foreignObject|Timeout/i.test(msg))
        throw new PenpotError(504, "svg-export-text-layout", "SVG export needs text layout that Penpot computes only when the file is opened in the editor. Use type 'png' (works headless), export the vector layers individually, or open the file once in the editor and retry.");
      return penpot.exportShape(fileId, pageId, shapeId, type, scale, !prefer);
    }
  };
  const autoScale = (o: Json) => { const b = bounds(o); const longest = Math.max(b.w, b.h, 1); return Math.max(0.5, Math.min(2, round(1600 / longest, 2))); };

  server.registerTool("penpot_export", { description: "Render a board/shape to PNG (returned as image) or SVG (returned as text) via Penpot's exporter. scale 0.5-4.", inputSchema: { fileId: id, pageId: id, shapeId: id, type: z.enum(["png", "svg"]).default("png"), scale: z.number().min(0.5).max(4).default(1), wasm: z.boolean().optional().describe("Force renderer; omit for automatic (WASM first for render-wasm files, classic as fallback)") } },
    async ({ fileId, pageId, shapeId, type, scale, wasm }) => { try {
      const { bytes, mime } = await exportAuto(fileId, pageId, shapeId, type, scale, wasm);
      if (type === "svg") return { content: [{ type: "text" as const, text: bytes.toString("utf8") }] };
      return { content: [{ type: "image" as const, data: bytes.toString("base64"), mimeType: mime.startsWith("image/") ? mime : "image/png" }] };
    } catch (e) { return fail(e); } });

  // ---------- TASARIM BAĞLAMI (Figma Dev Mode düzeyi) ----------
  server.registerTool("penpot_get_screenshot", { description: "Screenshot (PNG) of a node, auto-scaled so the long side is ~1600px. Use it to visually verify a design or your edits.",
    inputSchema: { fileId: id, pageId: id, nodeId: id, scale: z.number().min(0.25).max(4).optional() } },
    async ({ fileId, pageId, nodeId, scale }) => { try {
      const rec = await penpot.getFile(fileId); const o = penpot.page(rec, pageId).objects[nodeId]; if (!o) throw new PenpotError(404, "shape-not-found", nodeId);
      const { bytes } = await exportAuto(fileId, pageId, nodeId, "png", scale ?? autoScale(o));
      return { content: [{ type: "image" as const, data: bytes.toString("base64"), mimeType: "image/png" }] };
    } catch (e) { return fail(e); } });

  server.registerTool("penpot_get_metadata", { description: "Sparse XML outline of a page or node: every layer's id, name, type, x, y, width, height (plus text snippet, component marks). Cheap even for huge pages — use it to find node ids, then call penpot_get_design_context on the parts you need.",
    inputSchema: { fileId: id, pageId: id, nodeId: id.optional().describe("Omit for the whole page"), maxNodes: z.number().int().min(10).max(5000).default(1500), includeHidden: z.boolean().default(false) } },
    wrap(async ({ fileId, pageId, nodeId, maxNodes, includeHidden }) => {
      const rec = await penpot.getFile(fileId); const page = penpot.page(rec, pageId); const objs = page.objects;
      const roots = nodeId ? [nodeId] : (objs[ROOT_FRAME]?.shapes ?? []); if (nodeId && !objs[nodeId]) throw new PenpotError(404, "shape-not-found", nodeId);
      const m = metadataXml(objs, roots, { maxNodes, includeHidden });
      return `<!-- file "${rec.name}" · page "${page.name}" · ${m.nodes} nodes${m.truncated ? ` · TRUNCATED at ${maxNodes}, pass nodeId to zoom in` : ""} -->\n${m.xml}`;
    }));

  server.registerTool("penpot_get_design_context", { description: "PRIMARY tool for understanding or implementing a design. For one node (usually a board/screen/component) returns: (1) code — React+Tailwind (default) or HTML+CSS — with exact sizes, positions, colors, fonts, flex/grid layout, strokes, shadows and data-node-id attributes; (2) the colors (with library names) and fonts used; (3) a PNG screenshot. Treat the screenshot as ground truth; adapt the code to the target project's components. If the node is too large, you get a metadata outline instead — pick a smaller node.",
    inputSchema: { fileId: id, pageId: id, nodeId: id, format: z.enum(["react-tailwind", "html-css"]).default("react-tailwind"), includeScreenshot: z.boolean().default(true), maxNodes: z.number().int().min(10).max(1500).default(400), includeHidden: z.boolean().default(false) } },
    async ({ fileId, pageId, nodeId, format, includeScreenshot, maxNodes, includeHidden }) => { try {
      const rec = await penpot.getFile(fileId); const page = penpot.page(rec, pageId); const objs = page.objects; const o = objs[nodeId];
      if (!o) throw new PenpotError(404, "shape-not-found", nodeId);
      const names = colorNames(rec.data);
      const r = designCode(objs, nodeId, { format, maxNodes, includeHidden, names });
      const content: Json[] = [];
      if (r.truncated) {
        const m = metadataXml(objs, [nodeId], { maxNodes: 1500, includeHidden });
        content.push({ type: "text", text: `Node "${o.name}" has more than ${maxNodes} layers — too large for one design context. Outline below; call penpot_get_design_context again on a child node (or raise maxNodes).\n\n${m.xml}` });
      } else {
        const b = bounds(o);
        const colors = [...r.colors.entries()].sort((x, y) => y[1] - x[1]).map(([hex, n]) => `${hex}${names.get(hex) ? ` = ${names.get(hex)}` : ""} (${n}×)`);
        const fonts = [...r.fonts.entries()].map(([f, n]) => `${f} (${n}×)`);
        const header = [`Design context · file "${rec.name}" · node "${o.name}" (${o.type}) · ${round(b.w)}×${round(b.h)} · ${r.nodes} layers`,
          `Colors: ${colors.join(", ") || "—"}`, `Fonts: ${fonts.join(", ") || "—"}`,
          r.images.length ? `Images: ${r.images.length} asset(s) referenced as asset:<id>; export them with penpot_export on their layer.` : "",
          `Notes: positions are px relative to the parent; strokes are rendered as outline with the Penpot alignment (center/inner/outer); vectors are inline SVG; data-node-id maps every element back to the Penpot layer.`].filter(Boolean).join("\n");
        content.push({ type: "text", text: `${header}\n\n\`\`\`${format === "react-tailwind" ? "tsx" : "html"}\n${r.code}\n\`\`\`` });
      }
      if (includeScreenshot) { try { const { bytes } = await exportAuto(fileId, pageId, nodeId, "png", autoScale(o)); content.push({ type: "image", data: bytes.toString("base64"), mimeType: "image/png" }); }
        catch (e) { content.push({ type: "text", text: `(screenshot unavailable: ${(e as Error).message.slice(0, 160)})` }); } }
      return { content };
    } catch (e) { return fail(e); } });

  server.registerTool("penpot_get_variable_defs", { description: "Design values in use under a node (or the whole page): colors with usage counts and library names / CSS variable suggestions, typography specs, spacing (gaps/paddings), radii, stroke widths — plus the file's library colors, typographies and design tokens.",
    inputSchema: { fileId: id, pageId: id, nodeId: id.optional() } },
    wrap(async ({ fileId, pageId, nodeId }) => {
      const rec = await penpot.getFile(fileId); const objs = penpot.page(rec, pageId).objects;
      if (nodeId && !objs[nodeId]) throw new PenpotError(404, "shape-not-found", nodeId);
      return variableDefs(objs, nodeId ? [nodeId] : (objs[ROOT_FRAME]?.shapes ?? []), rec.data, colorNames(rec.data));
    }));

  server.registerTool("penpot_search_design_system", { description: "Search components, colors and typographies by name (substring, case-insensitive) in this file's library AND its connected shared libraries. Use before creating new elements so you reuse the design system.",
    inputSchema: { fileId: id, query: z.string().min(1), kinds: z.array(z.enum(["component", "color", "typography"])).optional() } },
    wrap(async ({ fileId, query, kinds }) => {
      const want = new Set(kinds ?? ["component", "color", "typography"]); const q = query.toLowerCase();
      const rec = await penpot.getFile(fileId); const libs = await penpot.libraries(fileId);
      const sources: { fileId: string; fileName: string; data: Json }[] = [{ fileId, fileName: rec.name, data: rec.data }];
      for (const l of libs) { try { const lf = await penpot.getFile(l.id); sources.push({ fileId: l.id, fileName: lf.name, data: lf.data }); } catch { /* erişilemeyen kütüphane atlanır */ } }
      const hit = (s: string | undefined) => (s ?? "").toLowerCase().includes(q); const out: Json[] = [];
      for (const s of sources) {
        if (want.has("component")) for (const c of Object.values<Json>(s.data.components ?? {})) if (!c.deleted && (hit(c.name) || hit(c.path)))
          out.push({ kind: "component", id: c.id, name: [c.path, c.name].filter(Boolean).join("/"), fileId: s.fileId, file: s.fileName, mainInstanceId: c.mainInstanceId, mainInstancePage: c.mainInstancePage });
        if (want.has("color")) for (const c of Object.values<Json>(s.data.colors ?? {})) if (hit(c.name) || hit(c.path) || hit(c.color))
          out.push({ kind: "color", id: c.id, name: [c.path, c.name].filter(Boolean).join("/"), value: c.color, fileId: s.fileId, file: s.fileName });
        if (want.has("typography")) for (const t of Object.values<Json>(s.data.typographies ?? {})) if (hit(t.name) || hit(t.path) || hit(t.fontFamily))
          out.push({ kind: "typography", id: t.id, name: [t.path, t.name].filter(Boolean).join("/"), font: `${t.fontFamily} ${t.fontWeight} ${t.fontSize}px`, fileId: s.fileId, file: s.fileName });
      }
      return { query, libraries: sources.length - 1, results: out.slice(0, 200) };
    }));

  server.registerTool("penpot_file_url", { description: "Browser URL of a file/page (for a human to open in the Penpot editor).", inputSchema: { fileId: id, pageId: id.optional() } },
    wrap(async ({ fileId, pageId }) => { const rec = await penpot.getFile(fileId); const base = process.env.PENPOT_PUBLIC_URI?.replace(/\/$/, "") ?? "";
      return { url: `${base}/#/workspace?team-id=${rec.teamId}&file-id=${fileId}${pageId ? `&page-id=${pageId}` : ""}` }; }));

  // ================= TASARIM KALİTESİ =================
  const brandSchema = z.object({ primary: hex.default("#2f5bea"), accent: hex.optional(), headingFont: z.string().default("Inter"), bodyFont: z.string().default("Inter"), radius: z.number().min(0).default(10) })
    .describe("Brand variables used by templates: primary/accent colors, heading/body Google font families, corner radius");
  const brandOf = (b?: Json): Brand => ({ primary: normHex(b?.primary ?? "#2f5bea"), accent: b?.accent ? normHex(b.accent) : undefined, headingFont: b?.headingFont ?? "Inter", bodyFont: b?.bodyFont ?? "Inter", radius: b?.radius ?? 10 });

  server.registerTool("penpot_apply_layout", { description: "Compute flex auto-layout on the server (Yoga engine) for a board subtree or the whole page and write the resulting positions/sizes, plus exact text sizes and text layout data. Run after structural edits so the design is correct without opening the editor.",
    inputSchema: { fileId: id, pageId: id, nodeId: id.optional() } },
    wrap(async ({ fileId, pageId, nodeId }) => {
      const rec = await penpot.fresh(fileId); const objs = penpot.page(rec, pageId).objects;
      const roots = nodeId ? [nodeId] : (objs[ROOT_FRAME]?.shapes ?? []);
      const r = await layoutChanges(objs, pageId, roots, modObj);
      const inFlex = new Set<string>(); for (const c of r.changes) inFlex.add(c.id);
      const texts: string[] = []; const walk = (sid: string) => { const o = objs[sid]; if (!o) return; if (o.type === "text" && !inFlex.has(sid) && objs[o.parentId]?.layout !== "flex") texts.push(sid); (o.shapes ?? []).forEach(walk); }; roots.forEach(walk);
      const tc = await textFixChanges(objs, pageId, texts, modObj);
      const all = [...r.changes, ...tc]; if (!all.length) return { unchanged: true };
      const res = await penpot.applyChanges(fileId, all); return { flexBoards: r.boards, adjusted: r.moved, texts: tc.length, revn: res.revn };
    }));

  server.registerTool("penpot_lint_design", { description: "Senior-designer review of a board: WCAG contrast, text overflow/overlap, out-of-bounds layers, 4/8px grid, near-misaligned edges, spacing off the scale, too many font sizes/families/colors, small text, mobile touch targets (<44px), thin logo strokes. Returns a 0-100 score and issues with node ids and concrete fixes. Run it after every design pass and fix errors/warnings before presenting.",
    inputSchema: { fileId: id, pageId: id, nodeId: id, platform: z.enum(["auto", "web", "mobile", "logo"]).default("auto"), grid: z.number().int().min(1).max(16).default(4), maxIssues: z.number().int().min(5).max(200).default(60) } },
    wrap(async ({ fileId, pageId, nodeId, platform, grid, maxIssues }) => {
      const rec = await penpot.fresh(fileId); const objs = penpot.page(rec, pageId).objects; if (!objs[nodeId]) throw new PenpotError(404, "shape-not-found", nodeId);
      return lintDesign(objs, nodeId, { platform, grid, maxIssues });
    }));

  server.registerTool("penpot_boolean", { description: "Boolean operation on shapes (rect, ellipse, path, board outline): union, subtract (first minus the rest), intersect, exclude. Produces ONE precise vector path — the basis of negative-space logos, monograms and custom icons. Originals are hidden (default), kept, or deleted.",
    inputSchema: { fileId: id, pageId: id, shapeIds: z.array(id).min(2), op: z.enum(["union", "subtract", "intersect", "exclude"]), name: z.string().optional(), fill: hex.optional().describe("Default: fill of the first shape"), originals: z.enum(["hide", "keep", "delete"]).default("hide") } },
    wrap(async ({ fileId, pageId, shapeIds, op, name, fill: fillHex, originals }) => {
      const rec = await penpot.fresh(fileId); const objs = penpot.page(rec, pageId).objects; const shapes = shapeIds.map(sid => { const o = objs[sid]; if (!o) throw new PenpotError(404, "shape-not-found", sid); return o; });
      const d = booleanD(shapes.map(shapeToD), op as BoolOp); const first = shapes[0];
      const color = fillHex ?? first.fills?.find((f: Json) => f.fillColor)?.fillColor ?? first.strokes?.[0]?.strokeColor ?? "#000000";
      const s = buildPath({ d, name: name ?? `${op} result`, fill: color }, { frameId: first.frameId, parentId: first.parentId });
      if (first.fills?.[0]?.fillColorGradient) s.fills = [first.fills[0]];
      const changes: Json[] = [addObj(pageId, s)];
      if (originals === "hide") shapes.forEach(o => changes.push(modObj(pageId, o.id, { hidden: true })));
      if (originals === "delete") shapes.forEach(o => changes.push(delObj(pageId, o.id)));
      const res = await penpot.applyChanges(fileId, changes); const b = bounds(s);
      return { id: s.id, bounds: { x: round(b.x), y: round(b.y), w: round(b.w), h: round(b.h) }, originals, revn: res.revn };
    }));

  server.registerTool("penpot_text_to_path", { description: "Convert a text layer to vector outlines using the real font (kerning, mixed runs, Turkish characters). One path per colored run. Use for wordmarks: then tweak letters with penpot_boolean/penpot_update_shape. Original text is hidden unless keepOriginal=false deletes it.",
    inputSchema: { fileId: id, pageId: id, shapeId: id, keepOriginal: z.boolean().default(true) } },
    wrap(async ({ fileId, pageId, shapeId, keepOriginal }) => {
      const rec = await penpot.fresh(fileId); const objs = penpot.page(rec, pageId).objects; const o = objs[shapeId];
      if (!o || o.type !== "text") throw new PenpotError(400, "not-text", "Bir metin katmanı verin");
      const fonts = await preload([o.content]); const b = bounds(o);
      const l = layoutSync(o.content, fonts, o.growType === "auto-width" ? undefined : b.w);
      const parts = textToPaths(l, fonts, { x: b.x, y: b.y, w: o.growType === "auto-width" ? l.width : b.w });
      const changes: Json[] = []; const ids: string[] = [];
      parts.forEach((p, i) => { const s = buildPath({ d: p.d, name: `${o.name} · outline${parts.length > 1 ? " " + (i + 1) : ""}`, fill: p.fills[0]?.fillColor ?? "#000000" }, { frameId: o.frameId, parentId: o.parentId });
        if (p.fills[0]) s.fills = [p.fills[0]]; changes.push(addObj(pageId, s)); ids.push(s.id); });
      changes.push(keepOriginal ? modObj(pageId, shapeId, { hidden: true }) : delObj(pageId, shapeId));
      const res = await penpot.applyChanges(fileId, changes); return { paths: ids, original: keepOriginal ? "hidden" : "deleted", revn: res.revn };
    }));

  server.registerTool("penpot_create_primitive", { description: "Precise geometric construction shapes for logos and icons: polygon, star, ring (donut), sector (pie/ring slice), arc (stroked), squircle (iOS-style superellipse), line. Center (cx,cy) and radius in page px; angles in degrees (0 = right, clockwise).",
    inputSchema: { fileId: id, pageId: id, kind: z.enum(["polygon", "star", "ring", "sector", "arc", "squircle", "line"]), cx: z.number(), cy: z.number(), radius: z.number().positive(),
      sides: z.number().int().min(3).max(64).optional(), innerRadius: z.number().min(0).optional(), startAngle: z.number().optional(), endAngle: z.number().optional(), rotation: z.number().optional(),
      width: z.number().positive().optional(), height: z.number().positive().optional(), smoothness: z.number().min(2).max(12).optional(), x2: z.number().optional(), y2: z.number().optional(),
      fill: hex.optional(), stroke: hex.optional(), strokeWidth: z.number().positive().optional(), strokeCap: z.enum(["round", "square", "butt"]).optional(), name: z.string().optional(), parentId: id.optional() } },
    wrap(async (a) => {
      const pi = await parentInfo(a.fileId, a.pageId, a.parentId); const { d, stroked } = primitiveD(a as Json);
      const s = buildPath({ d, name: a.name ?? a.kind, fill: stroked ? null : (a.fill ?? "#000000"), stroke: stroked ? (a.stroke ?? a.fill ?? "#000000") : a.stroke, strokeWidth: a.strokeWidth ?? (stroked ? 4 : undefined), strokeCap: a.strokeCap ?? (stroked ? "round" : undefined) }, pi);
      const res = await penpot.applyChanges(a.fileId, [addObj(a.pageId, s)]); const b = bounds(s);
      return { id: s.id, bounds: { x: round(b.x), y: round(b.y), w: round(b.w), h: round(b.h) }, revn: res.revn };
    }));

  server.registerTool("penpot_search_icons", { description: "Search 1,900+ Lucide icons (ISC licence) by name or meaning, e.g. 'shopping cart', 'settings', 'arrow right'. Returns icon names for penpot_insert_icon or the `icon` op of penpot_batch_create.",
    inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(100).default(30) } },
    wrap(async ({ query, limit }) => searchIcons(query, limit)));

  server.registerTool("penpot_insert_icon", { description: "Insert a Lucide icon as an editable vector inside a size×size box (consistent alignment in layouts). Default 24px, 2px stroke scaled with size, round caps.",
    inputSchema: { fileId: id, pageId: id, icon: z.string(), x: z.number().default(0), y: z.number().default(0), size: z.number().positive().default(24), color: hex.optional(), strokeWidth: z.number().positive().optional(), parentId: id.optional(), name: z.string().optional() } },
    wrap(async (a) => executeOps(a.fileId, a.pageId, [{ op: "icon", ref: "icon", icon: a.icon, x: a.x, y: a.y, size: a.size, color: a.color, strokeWidth: a.strokeWidth, parent: a.parentId, name: a.name }])));

  server.registerTool("penpot_insert_image", { description: "Insert a bitmap from a URL (photo, illustration, avatar) as a rectangle with an image fill (cover). Size defaults to the image ratio at max 480px wide.",
    inputSchema: { fileId: id, pageId: id, url: z.string().url(), x: z.number().default(0), y: z.number().default(0), width: z.number().positive().optional(), height: z.number().positive().optional(), radius: z.number().min(0).optional(), name: z.string().optional(), parentId: id.optional() } },
    wrap(async (a) => {
      const m = await penpot.rpc("create-file-media-object-from-url", { fileId: a.fileId, url: a.url, isLocal: true, name: a.name ?? "image" });
      const w = a.width ?? Math.min(480, m.width), h = a.height ?? Math.round(w * m.height / m.width);
      const r = await executeOps(a.fileId, a.pageId, [{ op: "rect", ref: "img", name: a.name ?? "Image", x: a.x, y: a.y, width: w, height: h, radius: a.radius, parent: a.parentId, fill: null,
        attrs: { fills: [{ fillOpacity: 1, fillImage: { id: m.id, width: m.width, height: m.height, mtype: m.mtype, keepAspectRatio: true, name: a.name ?? "image" } }] } }]);
      return { ...r, media: { id: m.id, width: m.width, height: m.height } };
    }));

  server.registerTool("penpot_create_device_frame", { description: `Create a device/screen board with correct size, column grid and (for phones) status bar + home indicator. Devices: ${Object.keys(DEVICES).join(", ")}.`,
    inputSchema: { fileId: id, pageId: id, device: z.enum(Object.keys(DEVICES) as [string, ...string[]]), x: z.number().default(0), y: z.number().default(0), name: z.string().optional(), brand: brandSchema.optional() } },
    wrap(async (a) => executeOps(a.fileId, a.pageId, deviceFrame(brandOf(a.brand), a.device, { x: a.x, y: a.y, texts: a.name ? { name: a.name } : undefined }))));

  server.registerTool("penpot_insert_web_section", { description: "Insert a polished, fully editable website section built with flex auto-layout, the brand's colors/fonts and a modular type scale: navbar, hero, logo-cloud, features, pricing, testimonial, cta, footer — plus dark particle 'scene-hero' / 'scene' (premium AI-site style: aurora glow, thin giant headline, glass pill, dot illustration; texts: icon|preset, particle color, glowA/glowB, label, step). Stack sections vertically (each returns its height) to compose a landing page; override copy via `texts`.",
    inputSchema: { fileId: id, pageId: id, kind: z.enum(["navbar", "hero", "logo-cloud", "features", "pricing", "testimonial", "cta", "footer", "scene-hero", "scene"]), x: z.number().default(0), y: z.number().default(0), width: z.number().int().min(360).max(2560).default(1440),
      parentId: id.optional(), brand: brandSchema.optional(), items: z.number().int().min(1).max(6).optional(), texts: z.record(z.string(), z.any()).optional().describe("Copy overrides, e.g. {title, subtitle, eyebrow, cta, cta2, logo, links:'A,B,C', items:'X,Y,Z', descs:'a|b|c', icons:'zap,users', quote, name, role, tagline, noImage:true, icon, preset, particle, glowA, glowB, ctaPrimary:true}") } },
    wrap(async (a) => { const r = await executeOps(a.fileId, a.pageId, webSection(brandOf(a.brand), a.kind, { x: a.x, y: a.y, width: a.width, parent: a.parentId, texts: a.texts, items: a.items }));
      const rec = await penpot.getFile(a.fileId, true); const o = penpot.page(rec, a.pageId).objects[r.ids.root]; const b = o ? bounds(o) : null;
      return { ...r, root: r.ids.root, bounds: b ? { x: round(b.x), y: round(b.y), w: round(b.w), h: round(b.h) } : undefined, nextY: b ? round(b.y + b.h) : undefined }; }));

  server.registerTool("penpot_insert_app_component", { description: "Insert a mobile UI component following iOS/Material metrics, brand colors and fonts: app-bar, tab-bar, button (variant primary|secondary|ghost), text-field, list-item, card, search-bar. Width defaults to 393 (iPhone) — pass the screen content width.",
    inputSchema: { fileId: id, pageId: id, kind: z.enum(["app-bar", "tab-bar", "button", "text-field", "list-item", "card", "search-bar"]), x: z.number().default(0), y: z.number().default(0), width: z.number().positive().optional(),
      parentId: id.optional(), brand: brandSchema.optional(), variant: z.string().optional(), texts: z.record(z.string(), z.any()).optional().describe("Copy overrides, e.g. {title, label, placeholder, helper, icon, subtitle, tag, text, tabs:'Home:house,Search:search'}") } },
    wrap(async (a) => { const r = await executeOps(a.fileId, a.pageId, appComponent(brandOf(a.brand), a.kind, { x: a.x, y: a.y, width: a.width, parent: a.parentId, texts: a.texts, variant: a.variant }));
      const rec = await penpot.getFile(a.fileId, true); const o = penpot.page(rec, a.pageId).objects[r.ids.root]; const b = o ? bounds(o) : null;
      return { ...r, root: r.ids.root, bounds: b ? { x: round(b.x), y: round(b.y), w: round(b.w), h: round(b.h) } : undefined }; }));

  server.registerTool("penpot_create_brand_kit", { description: "Create a design system foundation in the file library from one brand color: perceptually even OKLCH ramps (50-950) for primary/accent, a tinted neutral ramp, semantic colors, and a modular type scale (Display→Overline) as library typographies. Optionally renders a style-sheet board. Use it first, then build with the same values.",
    inputSchema: { fileId: id, pageId: id, brand: brandSchema, baseSize: z.number().default(16), ratio: z.number().min(1.067).max(1.618).default(1.25), render: z.boolean().default(true), x: z.number().default(0), y: z.number().default(0), prefix: z.string().default("Brand") } },
    wrap(async (a) => {
      const brand = brandOf(a.brand); const pal = palette(brand); const scale = typeScale(a.baseSize, a.ratio, brand.headingFont, brand.bodyFont);
      const changes: Json[] = [];
      const addColor = (path: string, name: string, color: string) => changes.push({ type: "add-color", color: { id: uuid(), name, path, color, opacity: 1 } });
      pal.primary.forEach(c => addColor(`${a.prefix}/Primary`, String(c.step), c.hex)); pal.accent?.forEach(c => addColor(`${a.prefix}/Accent`, String(c.step), c.hex));
      pal.neutral.forEach(c => addColor(`${a.prefix}/Neutral`, String(c.step), c.hex)); Object.entries(pal.semantic).forEach(([k, v]) => addColor(`${a.prefix}/Semantic`, k, v));
      for (const t of scale) changes.push({ type: "add-typography", typography: { id: uuid(), name: t.name, path: a.prefix, fontId: `gfont-${t.family.toLowerCase().replace(/\s+/g, "-")}`, fontFamily: t.family, fontVariantId: t.weight === "400" ? "regular" : t.weight,
        fontSize: String(t.size), fontWeight: t.weight, fontStyle: "normal", lineHeight: String(t.lineHeight), letterSpacing: String(t.letterSpacing), textTransform: t.name === "Overline" ? "uppercase" : "none" } });
      const res = await penpot.applyChanges(a.fileId, changes); let sheet: Json;
      if (a.render) { const c = themeColors(brand); const ops: Json[] = [{ op: "board", ref: "root", name: `${a.prefix} · Style Sheet`, x: a.x, y: a.y, width: 1280, height: 800, fill: "#ffffff", layout: { direction: "column", gap: 40, padding: 64 }, vSizing: "auto" },
          { op: "text", parent: "root", text: `${a.prefix} Foundations`, fontFamily: brand.headingFont, fontSize: 40, fontWeight: "700", letterSpacing: -1, color: c.text }];
        const rows: [string, { step: number; hex: string }[]][] = [["Primary", pal.primary], ...(pal.accent ? [["Accent", pal.accent] as [string, { step: number; hex: string }[]]] : []), ["Neutral", pal.neutral]];
        rows.forEach(([label, list], ri) => { ops.push({ op: "board", ref: `row${ri}`, parent: "root", name: label, width: 1152, height: 120, fill: null, layout: { direction: "column", gap: 12 }, hSizing: "fill", vSizing: "auto" },
          { op: "text", parent: `row${ri}`, text: label, fontFamily: brand.bodyFont, fontSize: 14, fontWeight: "600", color: c.textMuted },
          { op: "board", ref: `sw${ri}`, parent: `row${ri}`, name: "Swatches", width: 1152, height: 96, fill: null, layout: { direction: "row", gap: 8 }, hSizing: "fill", vSizing: "auto" });
          list.forEach((s, i) => ops.push({ op: "board", ref: `s${ri}_${i}`, parent: `sw${ri}`, name: `${label} ${s.step}`, width: 96, height: 96, fill: s.hex, radius: 10, layout: { direction: "column", justify: "end", padding: 8 }, hSizing: "fill" },
            { op: "text", parent: `s${ri}_${i}`, runs: [{ text: `${s.step}\n`, fontWeight: "600" }, { text: s.hex }], fontFamily: brand.bodyFont, fontSize: 11, lineHeight: 1.3, color: s.step >= 500 ? "#ffffff" : "#0b1220" })); });
        ops.push({ op: "board", ref: "type", parent: "root", name: "Type Scale", width: 1152, height: 400, fill: null, layout: { direction: "column", gap: 14 }, hSizing: "fill", vSizing: "auto" });
        scale.forEach(t => ops.push({ op: "text", parent: "type", name: t.name, text: `${t.name} · ${t.size}/${Math.round(t.size * t.lineHeight)} · ${t.family} ${t.weight}`, fontFamily: t.family, fontSize: t.size, fontWeight: t.weight, lineHeight: t.lineHeight, letterSpacing: t.letterSpacing, color: c.text }));
        sheet = await executeOps(a.fileId, a.pageId, ops); }
      return { colors: changes.filter(c => c.type === "add-color").length, typographies: scale.length, palette: pal, typeScale: scale, revn: sheet?.revn ?? res.revn, ...(sheet ? { styleSheet: sheet.ids.root } : {}) };
    }));

  server.registerTool("penpot_link_screens", { description: "Prototype: make a shape navigate to another board on click/hover/after a delay, with a transition. Build app flows (onboarding → sign-in → home) that play in Penpot's viewer.",
    inputSchema: { fileId: id, pageId: id, fromShapeId: id, toBoardId: id, trigger: z.enum(["click", "mouse-enter", "after-delay"]).default("click"), delayMs: z.number().int().min(0).optional(),
      animation: z.enum(["none", "dissolve", "slide-left", "slide-right", "slide-up", "slide-down", "push-left", "push-right"]).default("dissolve"), durationMs: z.number().int().min(0).max(5000).default(300) } },
    wrap(async (a) => {
      const rec = await penpot.fresh(a.fileId); const objs = penpot.page(rec, a.pageId).objects; const from = objs[a.fromShapeId], to = objs[a.toBoardId];
      if (!from) throw new PenpotError(404, "shape-not-found", a.fromShapeId); if (!to || to.type !== "frame") throw new PenpotError(400, "not-a-board", a.toBoardId);
      const anim = a.animation === "none" ? undefined : a.animation.startsWith("slide") ? { animationType: "slide", way: "in", direction: a.animation.split("-")[1], duration: a.durationMs, easing: "ease-in-out", offsetEffect: false }
        : a.animation.startsWith("push") ? { animationType: "push", direction: a.animation.split("-")[1], duration: a.durationMs, easing: "ease-in-out" } : { animationType: "dissolve", duration: a.durationMs, easing: "ease" };
      const inter = { eventType: a.trigger, actionType: "navigate", destination: a.toBoardId, preserveScrollPosition: false, ...(a.trigger === "after-delay" ? { delay: a.delayMs ?? 600 } : {}), ...(anim ? { animation: anim } : {}) };
      // etkileşim UUID içerir; mod-obj UUID yazamadığı için şekil aynı kimlikle yeniden eklenir
      const changes = recreateSubtree(objs, a.pageId, a.fromShapeId, { interactions: [...(from.interactions ?? []).filter((i: Json) => i.eventType !== a.trigger), inter] }, addObj, delObj);
      const res = await penpot.applyChanges(a.fileId, changes); return { from: a.fromShapeId, to: a.toBoardId, trigger: a.trigger, animation: a.animation, revn: res.revn };
    }));

  server.registerTool("penpot_export_logo_pack", { description: "Export a logo/icon node at standard sizes in one call (favicon 16/32/48, app icons 180/192/512/1024, social 400…) to check legibility at every size. Returns labelled PNGs.",
    inputSchema: { fileId: id, pageId: id, nodeId: id, sizes: z.array(z.number().int().min(8).max(2048)).default([16, 32, 48, 180, 512]) } },
    async ({ fileId, pageId, nodeId, sizes }) => { try {
      const rec = await penpot.getFile(fileId); const o = penpot.page(rec, pageId).objects[nodeId]; if (!o) throw new PenpotError(404, "shape-not-found", nodeId);
      const b = bounds(o); const longest = Math.max(b.w, b.h); const content: Json[] = [];
      for (const size of sizes) { const scale = size / longest;
        try { const { bytes } = await exportAuto(fileId, pageId, nodeId, "png", scale); content.push({ type: "text", text: `${size}px (scale ${round(scale, 3)})` }, { type: "image", data: bytes.toString("base64"), mimeType: "image/png" }); }
        catch (e) { content.push({ type: "text", text: `${size}px: ${(e as Error).message.slice(0, 120)}` }); } }
      return { content };
    } catch (e) { return fail(e); } });

  server.registerTool("penpot_create_dot_art", { description: "Particle-style illustration (as on premium AI/fintech sites): turns a Lucide icon, any SVG path or a preset (globe, enso, galaxy, sphere, wave, ring) into thousands of tiny glowing dots, layered by brightness with an optional soft glow. Ideal on dark backgrounds next to big thin headlines.",
    inputSchema: { fileId: id, pageId: id, x: z.number().default(0), y: z.number().default(0), size: z.number().positive().default(480),
      icon: z.string().optional(), d: z.string().optional().describe("SVG path data (any coordinates; it is normalised into the box)"), mode: z.enum(["stroke", "fill"]).optional(), preset: z.enum(["globe", "enso", "galaxy", "sphere", "wave", "ring"]).optional(),
      dots: z.number().int().min(200).max(6000).default(2200), color: hex.default("#9ec5ff"), glow: z.boolean().default(true), strokeWidth: z.number().optional(), parentId: id.optional(), name: z.string().optional(), seed: z.number().int().optional() } },
    wrap(async (a) => {
      const source = a.icon ? { icon: a.icon } : a.d ? { d: a.d, mode: a.mode } : { preset: a.preset ?? "globe" };
      const layers = dotArt({ source: source as Json, x: a.x, y: a.y, size: a.size, dots: a.dots, strokeWidth: a.strokeWidth, seed: a.seed });
      const ops: Json[] = [{ op: "board", ref: "art", parent: a.parentId, name: a.name ?? `Dot art · ${a.icon ?? a.preset ?? "path"}`, x: a.x, y: a.y, width: a.size, height: a.size, fill: null }];
      const op = [0.32, 0.62, 0.95, 1];
      if (a.glow) { const top = layers[layers.length - 1]; ops.push({ op: "path", parent: "art", name: "Glow", d: top.d, fill: a.color, opacity: 0.55, blur: Math.max(2, a.size / 140) }); }
      layers.forEach((l, i) => ops.push({ op: "path", parent: "art", name: `Dots ${i + 1} (${l.dots})`, d: l.d, fill: a.color, opacity: op[i + (4 - layers.length)] ?? 1 }));
      const r = await executeOps(a.fileId, a.pageId, ops, { autoLayout: false });
      return { id: r.ids.art, layers: layers.map(l => l.dots), revn: r.revn };
    }));
}
