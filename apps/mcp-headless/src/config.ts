// Ortam yapılandırması — tüm sırlar env'den gelir, koda yazılmaz.
const env = (k: string, d?: string): string => {
  const v = process.env[k];
  if (v === undefined || v === "") { if (d !== undefined) return d; throw new Error(`Eksik ortam değişkeni: ${k}`); }
  return v;
};
export const cfg = {
  penpotUrl: env("PENPOT_INTERNAL_URL", "http://penpot-frontend:8080").replace(/\/$/, ""),
  penpotPublicUrl: env("PENPOT_PUBLIC_URI", "").replace(/\/$/, ""),
  token: env("SIGMA_AGENT_TOKEN"),
  email: env("SIGMA_AGENT_EMAIL", ""),
  password: env("SIGMA_AGENT_PASSWORD", ""),
  mcpKey: env("SIGMA_MCP_KEY"),
  port: Number(env("MCP_PORT", "4410")),
  cacheTtlMs: Number(env("FILE_CACHE_TTL_MS", "4000")),
  rpcTimeoutMs: Number(env("RPC_TIMEOUT_MS", "30000")),
};
