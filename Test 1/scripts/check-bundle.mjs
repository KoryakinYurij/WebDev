import { readdirSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const dir=resolve(root,'dist/assets')
const rows=readdirSync(dir).filter(n=>n.endsWith('.js')).map(name=>({name,kb:gzipSync(readFileSync(resolve(dir,name))).length/1024}))
const limit=name=>name.startsWith('three-')?140:name.startsWith('scroll-')?65:name.startsWith('index-')?160:80
let failed=false
for(const row of rows){const max=limit(row.name); console.log(`${row.name}: ${row.kb.toFixed(1)} KB gzip / ${max} KB`); if(row.kb>max) failed=true}
const total=rows.reduce((n,r)=>n+r.kb,0); console.log(`total JS: ${total.toFixed(1)} KB gzip / 350 KB`); if(total>350) failed=true
if(failed){console.error('Bundle budget exceeded'); process.exit(1)}
