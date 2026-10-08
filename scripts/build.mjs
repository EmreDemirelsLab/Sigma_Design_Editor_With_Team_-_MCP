import {readFile,writeFile} from 'node:fs/promises';
const schema=(await readFile('shared/design-plan.mjs','utf8')).replaceAll('export ','');
const renderer=(await readFile('shared/render-plan.mjs','utf8')).replace(/^import .*;\n/,'').replaceAll('export ','');
const plugin=await readFile('apps/assistant/src/plugin.js','utf8');
await writeFile('apps/assistant/public/plugin/plugin.js',`(()=>{\n${schema}\n${renderer}\n${plugin}\n})();\n`);
console.log('Plugin built');
