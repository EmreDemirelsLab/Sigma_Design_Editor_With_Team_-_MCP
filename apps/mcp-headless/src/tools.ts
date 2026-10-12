// MCP araçları. Yanıtlar kompakt JSON: ajan için gereken kadar, fazlası istenince.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { penpot, PenpotError, ROOT_FRAME, type Json } from "./penpot.js";
import { addObj, addPage, baseShape, delObj, delPage, fill, flexAttrs, geometry, geometryOps, modObj, modPage, movObjects, normHex, richTextContent, stroke, textContent, uuid, type FlexLayout } from "./shapes.js";
import { colorNames, describe, designCode, metadataXml, textOf, textParas, variableDefs } from "./context.js";
import { bounds, contentToD, normalizePath, pathBox, round, segsToString, translateD } from "./geom.js";

const id = z.string().uuid();
const hex = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "#RRGGBB");
const ok = (v: unknown) => ({ content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v) }] });
const fail = (e: unknown) => {
  const m = e instanceof PenpotError ? { error: e.code, hint: e.hint, status: e.status } : { error: "internal", hint: (e as Error)?.message ?? String(e) };
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
  /** Metin şeklini kurar (tek stil ya da karışık parçalar). Genişlik verilmezse auto-width; yükseklik satır sayısından tahmin edilir. */
  const buildText = (o: Json, pi: { frameId: string; parentId: string }): Json => {
    const runs = o.runs ?? [{ text: o.text ?? "" }]; const full = runs.map((r: Json) => r.text).join("");
    if (!full.trim()) throw new PenpotError(400, "empty-text", "text ya da runs gerekli");
    const fs = o.fontSize ?? 16, lines = full.split("\n"), maxFs = Math.max(fs, ...runs.map((r: Json) => r.fontSize ?? 0));
    const w = o.width ?? Math.max(10, Math.round(Math.max(...lines.map((l: string) => l.length)) * maxFs * 0.62 + maxFs));
    const h = o.height ?? Math.round(maxFs * (o.lineHeight ?? 1.2) * lines.length);
    const s = baseShape("text", { name: o.name ?? full.replace(/\n/g, " ").slice(0, 40), x: o.x, y: o.y, width: w, height: h, ...pi, fill: null, opacity: o.opacity, hidden: o.hidden });
    delete s.fills; delete s.strokes; delete s.proportion; delete s.proportionLock;
    s.growType = o.width ? (o.height ? "fixed" : "auto-height") : "auto-width";
    s.content = richTextContent(runs, { fontFamily: o.fontFamily, fontSize: fs, fontWeight: o.fontWeight, fontStyle: o.fontStyle, color: o.color ?? o.fill ?? "#000000", align: o.align, lineHeight: o.lineHeight, letterSpacing: o.letterSpacing });
    return s;
  };
  server.registerTool("penpot_create_text", { description: "Create a text layer — single style via `text`, or mixed styles via `runs` (per-run color/weight/font/size). Width/height optional (auto-width when omitted). '\\n' makes paragraphs. Returns id.",
    inputSchema: { ...common, text: z.string().min(1).optional(), ...runsField, width: z.number().positive().optional(), height: z.number().positive().optional(), ...textStyle } },
    wrap(async (a) => { const pi = await parentInfo(a.fileId, a.pageId, a.parentId); const s = buildText(a, pi);
      const res = await penpot.applyChanges(a.fileId, [addObj(a.pageId, s)]); return { id: s.id, type: "text", revn: res.revn }; }));

  // ---------- VEKTÖR ----------
  const pathFields = { d: z.string().min(2).describe("SVG path data in page coordinates, any commands (M L H V C S Q T A Z, absolute or relative). Use x/y to place it instead: the path is then translated so its bounding box starts at (x,y)."),
    strokeCap: z.enum(["round", "square", "butt"]).optional(), strokeAlignment: z.enum(["center", "inner", "outer"]).optional() };
  /** SVG d → Penpot path nesnesi (normalleştirilmiş içerik + gerçek sınır kutusu). */
  const buildPath = (p: Json, pi: { frameId: string; parentId: string }): Json => {
    let segs = normalizePath(p.d); let b = pathBox(segs);
    if (p.x !== undefined || p.y !== undefined) { const dx = (p.x ?? b.x) - b.x, dy = (p.y ?? b.y) - b.y; segs = normalizePath(segsToString(segs, dx, dy)); b = pathBox(segs); }
    const s: Json = { id: uuid(), type: "path", name: p.name ?? "Vector", frameId: pi.frameId, parentId: pi.parentId, ...geometry(b.x, b.y, Math.max(b.w, 0.01), Math.max(b.h, 0.01)),
      constraintsH: "left", constraintsV: "top", flipX: null, flipY: null, proportion: b.h ? b.w / b.h : 1, proportionLock: false,
      content: segsToString(segs), fills: p.fill ? [fill(p.fill, p.fillOpacity ?? 1)] : [], strokes: [] };
    if (p.stroke) { const st: Json = stroke(p.stroke, p.strokeWidth ?? 1, 1, "solid", p.strokeAlignment ?? "center"); if (p.strokeCap && p.strokeCap !== "butt") { st.strokeCapStart = p.strokeCap; st.strokeCapEnd = p.strokeCap; } s.strokes = [st]; }
    if (p.opacity !== undefined && p.opacity !== 1) s.opacity = p.opacity; if (p.hidden) s.hidden = true;
    delete s.x; delete s.y; delete s.width; delete s.height; // yollar konumu selrect/points'ten alır
    return s;
  };
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
    layout: flexSchema.nullable().optional().describe("Boards only; null removes auto-layout"), attrs: z.record(z.string(), z.any()).optional() };

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
    if (a.attrs) Object.assign(set, a.attrs);
    return set;
  };

  server.registerTool("penpot_update_shape", { description: "Update attributes of a shape: position/size (geometry recomputed; vectors are moved/scaled), name, fill, stroke, opacity, radius, hidden/blocked, text content or style (style-only changes keep mixed-style runs), flex layout on boards, or raw attrs (advanced, camelCase Penpot attribute names). Always computed against a fresh copy of the file.",
    inputSchema: { fileId: id, pageId: id, shapeId: id, ...updateFields } },
    wrap(async (a) => {
      const rec = await penpot.fresh(a.fileId); const o = penpot.page(rec, a.pageId).objects[a.shapeId]; if (!o) throw new PenpotError(404, "shape-not-found", a.shapeId);
      const set = computeUpdate(o, a); if (!Object.keys(set).length) return { unchanged: true };
      const res = await penpot.applyChanges(a.fileId, [modObj(a.pageId, a.shapeId, set)]); return { id: a.shapeId, updated: Object.keys(set), revn: res.revn }; }));

  server.registerTool("penpot_batch_update", { description: "Update many shapes in ONE revision (same fields as penpot_update_shape per item). Use for restyling a whole screen, applying a palette, renaming layers, etc.",
    inputSchema: { fileId: id, pageId: id, updates: z.array(z.object({ shapeId: id, ...updateFields })).min(1).max(500) } },
    wrap(async ({ fileId, pageId, updates }) => {
      const rec = await penpot.fresh(fileId); const objs = penpot.page(rec, pageId).objects; const changes: Json[] = []; const report: Json[] = [];
      for (const u of updates) { const o = objs[u.shapeId]; if (!o) throw new PenpotError(404, "shape-not-found", u.shapeId);
        const set = computeUpdate(o, u); if (Object.keys(set).length) { changes.push(modObj(pageId, u.shapeId, set)); report.push({ id: u.shapeId, updated: Object.keys(set) }); } }
      if (!changes.length) return { unchanged: true };
      const res = await penpot.applyChanges(fileId, changes); return { updated: report, revn: res.revn }; }));

  server.registerTool("penpot_move_shapes", { description: "Reparent and/or reorder shapes: move into a board/group (parentId; omit for page root) at an optional z-index (0 = bottom).", inputSchema: { fileId: id, pageId: id, shapeIds: z.array(id).min(1), parentId: id.optional(), index: z.number().int().min(0).optional() } },
    wrap(async ({ fileId, pageId, shapeIds, parentId, index }) => penpot.applyChanges(fileId, [movObjects(pageId, parentId ?? ROOT_FRAME, shapeIds, index)])));

  server.registerTool("penpot_delete_shapes", { description: "Delete shapes by id.", inputSchema: { fileId: id, pageId: id, shapeIds: z.array(id).min(1) } },
    wrap(async ({ fileId, pageId, shapeIds }) => { const res = await penpot.applyChanges(fileId, shapeIds.map(s => delObj(pageId, s))); return { deleted: shapeIds.length, revn: res.revn }; }));

  // ---------- TOPLU ----------
  const opSchema = z.discriminatedUnion("op", [
    z.object({ op: z.literal("board"), ref: z.string().optional(), name: z.string().optional(), x: z.number().default(0), y: z.number().default(0), width: z.number().positive().default(360), height: z.number().positive().default(640), parent: z.string().optional(), fill: hex.nullable().optional(), stroke: hex.nullable().optional(), strokeWidth: z.number().optional(), radius: z.number().optional(), opacity: z.number().optional(), layout: flexSchema.optional() }),
    z.object({ op: z.literal("rect"), ref: z.string().optional(), name: z.string().optional(), x: z.number().default(0), y: z.number().default(0), width: z.number().positive().default(100), height: z.number().positive().default(100), parent: z.string().optional(), fill: hex.nullable().optional(), stroke: hex.nullable().optional(), strokeWidth: z.number().optional(), radius: z.number().optional(), opacity: z.number().optional() }),
    z.object({ op: z.literal("ellipse"), ref: z.string().optional(), name: z.string().optional(), x: z.number().default(0), y: z.number().default(0), width: z.number().positive().default(100), height: z.number().positive().default(100), parent: z.string().optional(), fill: hex.nullable().optional(), stroke: hex.nullable().optional(), strokeWidth: z.number().optional(), opacity: z.number().optional() }),
    z.object({ op: z.literal("text"), ref: z.string().optional(), name: z.string().optional(), text: z.string().min(1).optional(), ...runsField, x: z.number().default(0), y: z.number().default(0), width: z.number().positive().optional(), height: z.number().positive().optional(), parent: z.string().optional(), opacity: z.number().optional(), ...textStyle }),
    z.object({ op: z.literal("path"), ref: z.string().optional(), name: z.string().optional(), x: z.number().optional(), y: z.number().optional(), parent: z.string().optional(), fill: hex.nullable().optional(), stroke: hex.nullable().optional(), strokeWidth: z.number().optional(), opacity: z.number().optional(), ...pathFields }),
  ]);
  server.registerTool("penpot_batch_create", { description: "Create many shapes in ONE file revision (fast, atomic): board, rect, ellipse, text, path (SVG d). Each op may set `ref` (a label) and `parent` (a ref of an earlier op in this batch OR an existing shape id). Returns a ref→id map. Ideal for building a whole screen or a logo.",
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
        if (op.op === "path") s = buildPath({ ...op, fill: op.fill === undefined && !op.stroke ? "#000000" : op.fill }, pi);
        else if (op.op === "text") s = buildText(op, pi);
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
}
