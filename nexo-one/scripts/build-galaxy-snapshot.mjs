import {mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {basename,resolve} from 'node:path';
import {validateSanctionedProjection} from './build-pages-system.mjs';
import {compileGalaxySnapshot,GALAXY_CONTRACT} from '../server/compiler/galaxy-v1.mjs';

const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
async function readOptional(path){
  if(!path)return null;
  try{return await readJson(path);}catch(error){if(error?.code==='ENOENT')return null;throw error;}
}

const projectionPath=resolve(process.env.NEXO_PUBLIC_PROJECTION||'data/tower-public/projection.json');
const manifestPath=resolve(process.env.NEXO_PUBLIC_PROJECTION_MANIFEST||'data/tower-public/manifest.json');
const interdomainPath=resolve(process.env.NEXO_PUBLIC_INTERDOMAIN||'data/tower-public/interdomain.json');
const previousPath=process.env.NEXO_GALAXY_PREVIOUS?resolve(process.env.NEXO_GALAXY_PREVIOUS):null;
const outDir=resolve(process.env.NEXO_GALAXY_OUT||'dist/galaxy');
const versionDir=resolve(outDir,'snapshots');
const retention=Math.max(2,Math.min(720,Number(process.env.NEXO_GALAXY_RETENTION||168)||168));

function validSnapshot(value){
  return Boolean(
    value
    && value.contract===GALAXY_CONTRACT
    && typeof value.snapshot_id==='string'
    && /^galaxy-[0-9a-z-]+$/i.test(value.snapshot_id)
    && typeof value.generated_at==='string'
    && Number.isFinite(Date.parse(value.generated_at))
    && typeof value.tower_revision==='string'
    && /^[0-9a-f]{40}$/i.test(value.tower_revision)
    && typeof value.fingerprint==='string'
    && /^sha256:[0-9a-f]{64}$/i.test(value.fingerprint)
    && value.provenance?.authority==='TOWER_V06'
    && /^sha256:[0-9a-f]{64}$/i.test(String(value.provenance?.source_fingerprint||''))
    && Array.isArray(value.domains)
    && value.domains.length===4
    && Array.isArray(value.entities)
    && Array.isArray(value.relations)
  );
}

async function readValid(path){
  const value=await readOptional(path);
  return validSnapshot(value)?value:null;
}

const projection=await readJson(projectionPath);
const manifestFile=await readJson(manifestPath);
validateSanctionedProjection(projection,manifestFile);
const interdomain=await readOptional(interdomainPath)||[];
const previousSnapshot=await readValid(previousPath);
const snapshot=compileGalaxySnapshot({projection,manifestFile,interdomain,previousSnapshot});

if(!validSnapshot(snapshot))throw new Error('GALAXY_COMPILE_OUTPUT_INVALID');
if(snapshot.provenance.source_fingerprint!==manifestFile.projection_fingerprint){
  throw new Error('GALAXY_PROJECTION_FINGERPRINT_MISMATCH');
}
if(snapshot.tower_revision!==manifestFile.tower_commit){
  throw new Error('GALAXY_TOWER_REVISION_MISMATCH');
}

await mkdir(versionDir,{recursive:true});
if(previousSnapshot&&previousSnapshot.snapshot_id!==snapshot.snapshot_id){
  await writeFile(resolve(versionDir,`${previousSnapshot.snapshot_id}.json`),JSON.stringify(previousSnapshot,null,2)+'\n','utf8');
}
const body=JSON.stringify(snapshot,null,2)+'\n';
await writeFile(resolve(outDir,'latest.json'),body,'utf8');
await writeFile(resolve(versionDir,`${snapshot.snapshot_id}.json`),body,'utf8');

const candidates=[];
for(const name of await readdir(versionDir)){
  if(!/^galaxy-[0-9a-z-]+\.json$/i.test(name))continue;
  const path=resolve(versionDir,name);
  const value=await readValid(path);
  if(!value||basename(name,'.json')!==value.snapshot_id){
    await rm(path,{force:true});
    continue;
  }
  candidates.push(value);
}

const byId=new Map();
for(const candidate of candidates){
  const current=byId.get(candidate.snapshot_id);
  if(!current||Date.parse(candidate.generated_at)>Date.parse(current.generated_at))byId.set(candidate.snapshot_id,candidate);
}
const history=[...byId.values()]
  .sort((a,b)=>Date.parse(b.generated_at)-Date.parse(a.generated_at)||a.snapshot_id.localeCompare(b.snapshot_id))
  .slice(0,retention);

const keep=new Set(history.map(item=>item.snapshot_id));
for(const name of await readdir(versionDir)){
  const id=basename(name,'.json');
  if(/^galaxy-[0-9a-z-]+$/i.test(id)&&!keep.has(id))await rm(resolve(versionDir,name),{force:true});
}

const index={
  contract:'NEXO_ONE_GALAXY_INDEX_V1',
  generated_at:snapshot.generated_at,
  latest_snapshot_id:snapshot.snapshot_id,
  source_projection_fingerprint:snapshot.provenance.source_fingerprint,
  tower_revision:snapshot.tower_revision,
  retention,
  snapshots:history.map(item=>({
    snapshot_id:item.snapshot_id,
    generated_at:item.generated_at,
    tower_revision:item.tower_revision,
    source_projection_fingerprint:item.provenance?.source_fingerprint||null,
    fingerprint:item.fingerprint,
    changes:Array.isArray(item.changes)?item.changes.length:0,
  })),
};
await writeFile(resolve(outDir,'index.json'),JSON.stringify(index,null,2)+'\n','utf8');

console.log(JSON.stringify({
  contract:snapshot.contract,
  snapshot_id:snapshot.snapshot_id,
  tower_revision:snapshot.tower_revision,
  projection_fingerprint:snapshot.provenance.source_fingerprint,
  previous_snapshot_id:previousSnapshot?.snapshot_id||null,
  history_size:history.length,
  changes:snapshot.changes.length,
  stats:snapshot.stats,
}));
