import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const sourcePath='nexo-atlas/worker/public-cosmology.json';
const hex40=/^[a-f0-9]{40}$/,hex64=/^[a-f0-9]{64}$/;
export const publicRowKey=row=>createHash('sha256').update(JSON.stringify(Object.fromEntries(['question','answers','method','result'].map(field=>[field,{'pt-BR':row[field]['pt-BR'],en:row[field].en}])))).digest('hex');

export function publicSourceContext(spec,bytes) {
  if(!hex40.test(spec.commit)||spec.path!==sourcePath||!hex64.test(spec.sha256))throw new Error('Origem histórica fora do contrato público permitido.');
  if(createHash('sha256').update(bytes).digest('hex')!==spec.sha256)throw new Error('Bytes históricos divergem do SHA-256 declarado.');
  const document=JSON.parse(bytes.toString('utf8'));
  if(!document.records||typeof document.records!=='object'||Array.isArray(document.records))throw new Error('Registros históricos inválidos.');
  const records=new Map();
  for(const [sourceKey,row] of Object.entries(document.records)) {
    const key=publicRowKey(row),entries=records.get(key)??[];
    entries.push({pointer:`/records/${sourceKey.replaceAll('~','~0').replaceAll('/','~1')}`,row});records.set(key,entries);
  }
  return {...spec,records};
}

export function readPublicSourceContexts(catalog,{cwd,baseCommit}) {
  if(catalog.contract!=='NEXO_PUBLIC_RESEARCH_SOURCES_V1'||!Array.isArray(catalog.sources)||catalog.sources.length>100||!hex40.test(baseCommit??''))throw new Error('Catálogo ou base pública histórica inválida.');
  const seen=new Set();
  return catalog.sources.map(spec=>{
    if(!hex40.test(spec.commit)||spec.path!==sourcePath||!hex64.test(spec.sha256))throw new Error('Origem histórica fora do contrato público permitido.');
    const identity=`${spec.commit}:${spec.path}`;
    if(seen.has(identity))throw new Error('Origem histórica duplicada.');seen.add(identity);
    try {execFileSync('git',['merge-base','--is-ancestor',spec.commit,baseCommit],{cwd,stdio:'pipe'});}
    catch {throw new Error('Origem histórica não pertence à base pública revisada.');}
    const bytes=execFileSync('git',['show',identity],{cwd,maxBuffer:5*1024*1024});
    return publicSourceContext(spec,bytes);
  });
}
