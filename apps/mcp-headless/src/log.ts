export const log = (level: "info" | "warn" | "error", msg: string, extra: Record<string, unknown> = {}) =>
  process.stdout.write(JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra }) + "\n");
