// HTTP katmanı: /health ve /mcp (Streamable HTTP, durumsuz). Kendi bearer anahtarımızla korunur; yalnız Tailscale'e yayınlanır.
import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { cfg } from "./config.js";
import { log } from "./log.js";
import { penpot } from "./penpot.js";
import { registerTools } from "./tools.js";

const VERSION = "0.1.0";
let penpotOk = false, lastPing = 0;
async function ping() { if (Date.now() - lastPing < 10000) return penpotOk; lastPing = Date.now(); try { await penpot.rpc("get-profile"); penpotOk = true; } catch { penpotOk = false; } return penpotOk; }

function buildServer() {
  const server = new McpServer({ name: "sigma-penpot-headless", version: VERSION }, { instructions:
    "Sigma Headless Penpot MCP: edits Penpot design files directly through the backend API; no browser tab needed, works on any file. Workflow: penpot_list_projects → penpot_list_files → penpot_file_overview → penpot_page_tree → create/update tools. Use penpot_batch_create to build whole screens in one revision. Coordinates are absolute page pixels (children are NOT relative to parent). Take penpot_snapshot before large destructive edits." });
  registerTools(server); return server;
}

const readBody = (req: http.IncomingMessage) => new Promise<unknown>((res, rej) => { const c: Buffer[] = []; req.on("data", d => c.push(d)); req.on("end", () => { try { res(c.length ? JSON.parse(Buffer.concat(c).toString()) : undefined); } catch (e) { rej(e); } }); req.on("error", rej); });

const srv = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/health") { const okp = await ping(); res.writeHead(okp ? 200 : 503, { "content-type": "application/json" }); return res.end(JSON.stringify({ ok: okp, penpot: okp, version: VERSION })); }
  if (url.pathname !== "/mcp") { res.writeHead(404); return res.end(); }
  const auth = req.headers.authorization ?? ""; if (auth !== `Bearer ${cfg.mcpKey}`) { res.writeHead(401, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: "unauthorized" })); }
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
