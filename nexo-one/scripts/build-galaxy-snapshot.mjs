import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {validateSanctionedProjection} from './build-pages-system.mjs';
import {compileGalaxySnapshot} from '../server/compiler/galaxy-v1.mjs';

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

const projection=await readJson(projectionPath);
const manifestFile=await readJson(manifestPath);
validateSanctionedProjection(projection,manifestFile);
const interdomain=await readOptional(interdomainPath)||[];
const previousSnapshot=await readOptional(previousPath);
const snapshot=compileGalaxySnapshot({projection,manifestFile,interdomain,previousSnapshot});

const versionDir=resolve(outDir,'snapshots');
await mkdir(versionDir,{recursive:true});
const body=JSON.stringify(snapshot,null,2)+'\n';
await Promise.all([
  writeFile(resolve(outDir,'latest.json'),body,'utf8'),
  writeFile(resolve(versionDir,`${snapshot.snapshot_id}.json`),body,'utf8'),
]);

console.log(`NEXO_ONE_GALAXY_V1 snapshot=${snapshot.snapshot_id} entities=${snapshot.stats.entities} subdomains=${snapshot.stats.subdomains} relations=${snapshot.stats.relations} needs_you=${snapshot.stats.needs_you} fingerprint=${snapshot.fingerprint}`);
