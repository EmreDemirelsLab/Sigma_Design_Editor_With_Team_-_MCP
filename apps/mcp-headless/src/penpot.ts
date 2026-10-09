// Penpot RPC istemcisi: erişim anahtarı ile kimlik, keep-alive, dosya önbelleği, revn çakışmasında yeniden deneme.
import { cfg } from "./config.js";
import { log } from "./log.js";

export class PenpotError extends Error {
  constructor(public status: number, public code: string, public hint: string, public details?: unknown) {
    super(`${code}: ${hint}`);
  }
}
export type Json = any;
export interface FileRecord { id: string; name: string; revn: number; vern: number; features: string[]; data: Json; fetchedAt: number; projectId: string; teamId: string; }

const ROOT = "00000000-0000-0000-0000-000000000000";
export const ROOT_FRAME = ROOT;

class Penpot {
  private files = new Map<string, FileRecord>();
  private authCookie: string | null = null;
  private inflight = new Map<string, Promise<FileRecord>>();

  async rpc<T = Json>(cmd: string, params: Record<string, unknown> = {}, opts: { cookie?: boolean } = {}): Promise<T> {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), cfg.rpcTimeoutMs);
    const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
    if (opts.cookie && this.authCookie) headers.cookie = this.authCookie; else headers.authorization = `Token ${cfg.token}`;
    const t0 = performance.now();
    try {
      const r = await fetch(`${cfg.penpotUrl}/api/rpc/command/${cmd}`, { method: "POST", headers, body: JSON.stringify(params), signal: ctl.signal });
      const text = await r.text();
      let body: Json = null; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
      if (!r.ok) throw new PenpotError(r.status, body?.code ?? `http-${r.status}`, body?.hint ?? String(text).slice(0, 200), body);
      log("info", "rpc", { cmd, ms: Math.round(performance.now() - t0) });
      return body as T;
    } finally { clearTimeout(timer); }
  }

  /** Dışa aktarma gibi çerez isteyen uçlar için parola ile oturum açar (yalnız gerekince). */
  private async loginForCookie(): Promise<string> {
    if (!cfg.email || !cfg.password) throw new PenpotError(401, "no-credentials", "SIGMA_AGENT_EMAIL/PASSWORD tanımlı değil; dışa aktarma için gerekli");
    const r = await fetch(`${cfg.penpotUrl}/api/rpc/command/login-with-password`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ email: cfg.email, password: cfg.password }) });
    if (!r.ok) throw new PenpotError(r.status, "login-failed", await r.text());
    const set = r.headers.getSetCookie?.() ?? [];
    const c = set.map(s => s.split(";")[0]).find(s => s.startsWith("auth-token="));
    if (!c) throw new PenpotError(500, "no-cookie", "auth-token çerezi alınamadı");
    this.authCookie = c; return c;
  }

  // ---- dosya önbelleği ----
  invalidate(fileId: string) { this.files.delete(fileId); }

  async getFile(fileId: string, fresh = false): Promise<FileRecord> {
    const c = this.files.get(fileId);
    if (c && !fresh && Date.now() - c.fetchedAt < cfg.cacheTtlMs) return c;
    const running = this.inflight.get(fileId); if (running) return running;
    const p = (async () => {
      const f = await this.rpc("get-file", { id: fileId });
      const rec: FileRecord = { id: f.id, name: f.name, revn: f.revn, vern: f.vern ?? 0, features: f.features ?? [], data: f.data, fetchedAt: Date.now(), projectId: f.projectId, teamId: f.teamId };
      this.files.set(fileId, rec); return rec;
    })();
    this.inflight.set(fileId, p);
    try { return await p; } finally { this.inflight.delete(fileId); }
  }

  page(rec: FileRecord, pageId: string): Json {
    const p = rec.data?.pagesIndex?.[pageId];
    if (!p) throw new PenpotError(404, "page-not-found", `Sayfa yok: ${pageId}. Sayfalar: ${(rec.data?.pages ?? []).join(", ")}`);
    return p;
  }

  /** Değişiklikleri uygular; revn çakışırsa dosyayı tazeleyip bir kez daha dener. */
  async applyChanges(fileId: string, changes: Json[], attempt = 0): Promise<{ revn: number }> {
    if (!changes.length) return { revn: (await this.getFile(fileId)).revn };
    const rec = await this.getFile(fileId, attempt > 0);
    try {
      const r = await this.rpc("update-file", { id: fileId, sessionId: crypto.randomUUID(), revn: rec.revn, vern: rec.vern, changes, features: rec.features });
      this.invalidate(fileId);
      return { revn: r?.revn ?? rec.revn + 1 };
    } catch (e) {
      if (e instanceof PenpotError && attempt === 0 && /conflict|revn|outdated|validation/i.test(e.code + " " + e.hint)) {
        log("warn", "update-file yeniden deneniyor", { fileId, code: e.code });
        this.invalidate(fileId); return this.applyChanges(fileId, changes, 1);
      }
      throw e;
    }
  }

  /** Penpot exporter ile PNG/SVG/PDF üretir (transit gövde + çerez). */
  async exportShape(fileId: string, pageId: string, objectId: string, type: "png" | "svg" | "pdf", scale: number, wasm = false): Promise<{ bytes: Buffer; mime: string }> {
    const profile = await this.rpc("get-profile");
    const body = JSON.stringify({ "~:cmd": "~:export-shapes", "~:profile-id": `~u${profile.id}`, "~:wait": true,
      "~:exports": [{ "~:page-id": `~u${pageId}`, "~:file-id": `~u${fileId}`, "~:object-id": `~u${objectId}`, "~:type": `~:${type}`, "~:suffix": "", "~:scale": scale, "~:name": "export", "~:is-wasm": wasm }] });
    const attempt = async (cookie: string | null) => {
      const h: Record<string, string> = { "content-type": "application/transit+json", authorization: `Token ${cfg.token}` };
      if (cookie) h.cookie = cookie;
      return fetch(`${cfg.penpotUrl}/api/export`, { method: "POST", headers: h, body });
    };
    // Exporter, isteğin auth-token çerezini "token" parametresi olarak ister; erişim anahtarı başlığı yetmez → önce çerez.
    let r = await attempt(this.authCookie ?? await this.loginForCookie());
    if (r.status === 401 || r.status === 403 || r.status === 400) r = await attempt(await this.loginForCookie());
    if (!r.ok) throw new PenpotError(r.status, "export-failed", (await r.text()).slice(0, 300));
    const ct = r.headers.get("content-type") ?? "";
    if (ct.includes("transit")) {
      const t = await r.text(); const m = t.match(/https?:\/\/[^"\\]+/);
      if (!m) throw new PenpotError(500, "export-no-uri", t.slice(0, 200));
      let uri = m[0]; if (cfg.penpotPublicUrl && uri.startsWith(cfg.penpotPublicUrl)) uri = cfg.penpotUrl + uri.slice(cfg.penpotPublicUrl.length);
      const f = await fetch(uri, { headers: this.authCookie ? { cookie: this.authCookie } : {} });
      if (!f.ok) throw new PenpotError(f.status, "export-download-failed", uri);
      return { bytes: Buffer.from(await f.arrayBuffer()), mime: f.headers.get("content-type") ?? mimeOf(type) };
    }
    return { bytes: Buffer.from(await r.arrayBuffer()), mime: ct || mimeOf(type) };
  }
}
const mimeOf = (t: string) => t === "png" ? "image/png" : t === "svg" ? "image/svg+xml" : "application/pdf";
export const penpot = new Penpot();
