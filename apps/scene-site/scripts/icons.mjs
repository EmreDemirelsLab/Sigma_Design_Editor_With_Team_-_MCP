// Derleme öncesi: scenes.ts içinde kullanılan Lucide ikonlarını küçük bir JSON'a çıkarır (paket 400 KB yerine birkaç KB).
import fs from "node:fs"; import { createRequire } from "node:module";
const require = createRequire(import.meta.url); const all = require("lucide-static/icon-nodes.json");
const src = fs.readFileSync(new URL("../src/scenes.ts", import.meta.url), "utf8");
const names = [...new Set([...src.matchAll(/icon:\s*"([a-z0-9-]+)"/g)].map(m => m[1]).concat("sparkles"))];
const missing = names.filter(n => !all[n]); if (missing.length) { console.error("Bilinmeyen Lucide ikonları:", missing.join(", ")); process.exit(1); }
fs.writeFileSync(new URL("../src/particles/icon-subset.json", import.meta.url), JSON.stringify(Object.fromEntries(names.map(n => [n, all[n]]))));
console.log(`icon-subset.json: ${names.length} ikon (${names.join(", ")})`);
