import {mkdir, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
const base='https://bydenoso.github.io/Pantheon/';
const assets=['system.json','galaxy/latest.json','mcp/topology.json','tower-projection/publication.json','vendor/g6.min.js'];
const sourceFor=asset=>asset==='vendor/g6.min.js'?'https://cdn.jsdelivr.net/npm/@antv/g6@5.1.1/dist/g6.min.js':new URL(asset,base).href;
const manifest={visualRevision:'4e27af44f01281ae0d780503936cc2a29cb4c023',readAt:new Date().toISOString(),assets:[]};
for(const asset of assets){
 const response=await fetch(sourceFor(asset),{signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error(`PUBLIC_READBACK_FAILED ${asset} ${response.status}`);
 const bytes=Buffer.from(await response.arrayBuffer());
 if(asset.endsWith('.json'))JSON.parse(bytes.toString('utf8'));
 const target=`public/${asset}`;
 await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);
 manifest.assets.push({url:sourceFor(asset),sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});
}
await mkdir('output/galaxy-performance',{recursive:true});
await writeFile('output/galaxy-performance/public-readback.json',JSON.stringify(manifest,null,2));
process.env.PORT=process.env.PORT||'4185';
process.env.VITE_SYSTEM_SOURCE='remote';
process.env.VITE_SYSTEM_ENDPOINT='/system.json';
process.env.VITE_GALAXY_ENDPOINT='/galaxy/latest.json';
await import('./dev.mjs');
