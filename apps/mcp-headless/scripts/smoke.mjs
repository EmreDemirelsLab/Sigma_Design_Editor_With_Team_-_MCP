// Uçtan uca duman testi: listele → dosya oluştur → toplu ekran → düzenle → ara → dışa aktar → sil.  Kullanım: MCP_URL=... MCP_KEY=... node scripts/smoke.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const url = process.env.MCP_URL, key = process.env.MCP_KEY; if (!url || !key) throw new Error("MCP_URL / MCP_KEY gerekli");
const c = new Client({ name: "smoke", version: "0" });
await c.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { authorization: `Bearer ${key}` } } }));
const call = async (name, args = {}) => { const t0 = performance.now(); const r = await c.callTool({ name, arguments: args }); const ms = Math.round(performance.now() - t0);
  const txt = r.content.find(x => x.type === "text")?.text; const img = r.content.find(x => x.type === "image");
  if (r.isError) throw new Error(`${name}: ${txt}`); console.log(`✔ ${name} ${ms}ms`, img ? `[image ${img.mimeType} ${Math.round(img.data.length * 0.75 / 1024)} KB]` : (txt ?? "").slice(0, 160)); return txt ? JSON.parse(txt) : r; };
const tools = (await c.listTools()).tools; console.log("araçlar:", tools.length, tools.map(t => t.name).join(" "));
const projects = await call("penpot_list_projects"); const proj = projects.find(p => !p.default) ?? projects[0];
const f = await call("penpot_create_file", { projectId: proj.id, name: `smoke-${Date.now()}` }); const fileId = f.id, pageId = f.pages[0];
const b = await call("penpot_batch_create", { fileId, pageId, ops: [
  { op: "board", ref: "screen", name: "Login", x: 0, y: 0, width: 390, height: 844, fill: "#0f172a", layout: { direction: "column", gap: 16, padding: 24, align: "stretch" } },
  { op: "text", ref: "title", parent: "screen", text: "Hoş geldin", x: 24, y: 80, fontSize: 32, fontWeight: "700", color: "#ffffff" },
  { op: "rect", ref: "input", parent: "screen", name: "E-posta", x: 24, y: 160, width: 342, height: 48, fill: "#1e293b", radius: 12 },
  { op: "rect", ref: "btn", parent: "screen", name: "Giriş butonu", x: 24, y: 232, width: 342, height: 52, fill: "#22d3ee", radius: 14 },
  { op: "text", ref: "btnText", parent: "screen", text: "Giriş yap", x: 150, y: 248, fontSize: 18, fontWeight: "600", color: "#0f172a" },
  { op: "ellipse", ref: "dot", parent: "screen", x: 180, y: 320, width: 24, height: 24, fill: "#f472b6" } ] });
await call("penpot_file_overview", { fileId });
await call("penpot_page_tree", { fileId, pageId, depth: 3 });
await call("penpot_update_shape", { fileId, pageId, shapeId: b.ids.btn, fill: "#a78bfa", radius: 26, name: "Giriş butonu (mor)" });
await call("penpot_update_shape", { fileId, pageId, shapeId: b.ids.title, text: "Tekrar hoş geldin", fontSize: 28 });
await call("penpot_find_shapes", { fileId, pageId, name: "giriş" });
await call("penpot_get_shape", { fileId, pageId, shapeId: b.ids.btn });
await call("penpot_snapshot", { fileId, label: "smoke" });
try { await call("penpot_export", { fileId, pageId, shapeId: b.ids.screen, type: "png", scale: 1 }); } catch (e) { console.log("✘ export:", e.message.slice(0, 200)); }
await call("penpot_delete_shapes", { fileId, pageId, shapeIds: [b.ids.dot] });
await call("penpot_file_url", { fileId, pageId });
console.log("DOSYA:", fileId, "(temizlik için elle sil veya Penpot'ta aç)");
await c.close();
