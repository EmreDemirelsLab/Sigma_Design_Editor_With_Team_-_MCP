import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${dir}/${e.name}`):[`${dir}/${e.name}`]);}
for(const file of [...walk('apps'),...walk('shared'),...walk('scripts'),...walk('tests')].filter(f=>/\.(mjs|js)$/.test(f))){
  const r=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(r.status)process.exit(r.status);
}
console.log('JavaScript syntax checks passed');
