// Tek dosya üretici: şablondaki __ICONS__ yerine yalnız kullanılan Lucide ikonlarını gömer → zengo.html
import fs from "node:fs"; import { createRequire } from "node:module";
const require = createRequire(import.meta.url); const all = require("lucide-static/icon-nodes.json");
const tpl = fs.readFileSync(new URL("./zengo.template.html", import.meta.url), "utf8");
const names = [...new Set([...tpl.matchAll(/icon:\s*"([a-z0-9-]+)"/g)].map(m => m[1]).concat("sparkles"))];
const missing = names.filter(n => !all[n]); if (missing.length) { console.error("Bilinmeyen ikon:", missing); process.exit(1); }
const html = tpl.replace("__ICONS__", JSON.stringify(Object.fromEntries(names.map(n => [n, all[n]]))));
fs.writeFileSync(new URL("./zengo.html", import.meta.url), html); console.log("zengo.html", (html.length / 1024).toFixed(1), "KB,", names.length, "ikon");
