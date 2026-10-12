// HTTP katmanı: /health ve /mcp (Streamable HTTP, durumsuz). Kendi bearer anahtarımızla korunur; yalnız Tailscale'e yayınlanır.
import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { cfg } from "./config.js";
import { log } from "./log.js";
import { penpot } from "./penpot.js";
import { registerTools } from "./tools.js";

const VERSION = "0.2.0";
let penpotOk = false, lastPing = 0;
async function ping() { if (Date.now() - lastPing < 10000) return penpotOk; lastPing = Date.now(); try { await penpot.rpc("get-profile", {}, { quiet: true }); penpotOk = true; } catch { penpotOk = false; } return penpotOk; }

const INSTRUCTIONS = [
  "Sigma Headless Penpot MCP — reads and edits Penpot design files through the backend API. No browser tab is needed; any file is reachable by id.",
  "READ (Dev Mode style): penpot_list_projects → penpot_list_files → penpot_file_overview. For large pages call penpot_get_metadata (sparse XML outline) to locate node ids.",
  "Then penpot_get_design_context(nodeId) returns React+Tailwind (or HTML+CSS) code with data-node-id attributes, the colors/fonts used (mapped to library names) and a PNG screenshot. Treat the screenshot as visual ground truth and the code as an exact reference for sizes, colors and text; adapt it to the target codebase's own components instead of pasting it verbatim.",
  "penpot_get_variable_defs lists the color, typography, spacing, radius and stroke values in use plus library colors/typographies/tokens. penpot_search_design_system finds existing components/colors before you create new ones.",
  "WRITE: penpot_batch_create builds many shapes (board/rect/ellipse/text/path) in one revision; text accepts `runs` for mixed colors/weights in one layer; penpot_create_path takes any SVG path 'd'; penpot_create_component turns a shape into a library component and penpot_instantiate_component places copies; penpot_batch_update changes many shapes at once (style-only text edits keep mixed runs).",
  "Coordinates are absolute page pixels (children are NOT relative to their parent). After writing, check the result with penpot_get_screenshot. Take penpot_snapshot before large destructive edits.",
].join("\n");

function buildServer() {
  const server = new McpServer({ name: "sigma-penpot-headless", version: VERSION }, { instructions: INSTRUCTIONS });
  registerTools(server); return server;
}

const readBody = (req: http.IncomingMessage) => new Promise<unknown>((res, rej) => { const c: Buffer[] = []; req.on("data", d => c.push(d)); req.on("end", () => { try { res(c.length ? JSON.parse(Buffer.concat(c).toString()) : undefined); } catch (e) { rej(e); } }); req.on("error", rej); });

const srv = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/health") { const okp = await ping(); res.writeHead(okp ? 200 : 503, { "content-type": "application/json" }); return res.end(JSON.stringify({ ok: okp, penpot: okp, version: VERSION })); }
  if (url.pathname !== "/mcp") { res.writeHead(404); return res.end(); }
  const auth = Buffer.from(req.headers.authorization ?? ""), want = Buffer.from(`Bearer ${cfg.mcpKey}`);
  if (auth.length !== want.length || !timingSafeEqual(auth, want)) { res.writeHead(401, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: "unauthorized" })); }
  const server = buildServer();
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    const body = req.method === "POST" ? await readBody(req) : undefined;
    await transport.handleRequest(req, res, body);
    res.on("close", () => { transport.close(); server.close(); });
  } catch (e) { log("error", "mcp", { err: (e as Error).message }); if (!res.headersSent) { res.writeHead(500, { "content-type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "internal" }, id: null })); } }
});
srv.keepAliveTimeout = 65000;
srv.listen(cfg.port, "0.0.0.0", () => log("info", "sigma-mcp-headless dinliyor", { port: cfg.port, penpot: cfg.penpotUrl }));
for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => { log("info", "kapanıyor", { sig }); srv.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); });
