import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {generateStaticState} from '../lib/campaign-static-state-generator.mjs';
import {buildPublicManifest} from '../lib/public-surface-manifest.mjs';
import {buildPublicSurfaces} from '../lib/public-surface-projections.mjs';
import {loadScienceShardCatalog} from '../lib/science-shard-catalog.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const outDir=path.resolve(root,process.argv[2]||'public/data');
const dataDir=path.join(root,'data');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n')};
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');

fs.rmSync(outDir,{recursive:true,force:true});
const result=await generateStaticState({outDir});
const science=read(path.join(dataDir,'science-drive-projection.json'));
const {catalog:shardCatalog,shards}=loadScienceShardCatalog({scienceIndex:science,dataDir});
const drive=read(path.join(dataDir,'nexo-drive-projection.json'));
const surfaces=buildPublicSurfaces({sourceVersion:science.sourceVersion||drive?.meta?.sourceModifiedAt||'',scienceIndex:science,scienceShards:shards,drive});
const descriptors={};
for(const [name,surface] of Object.entries(surfaces)){
 const rel=`surfaces/${name}/index.json`,file=path.join(result.snapshotDir,rel);
 write(file,surface.payload);
 descriptors[name]={...surface.descriptor,path:rel,sha256:digest(file)};
}
const graphMeta=result.manifest.artifacts['graph/root.json'];
const publicManifest=buildPublicManifest({authority:'GOOGLE_DRIVE',sourceVersion:science.sourceVersion||result.manifest.sourceVersion||'',sourceModifiedAt:drive?.meta?.sourceModifiedAt||science.sourceVersion||'',generatedAt:result.manifest.generatedAt||'',surfaces:{graph:{state:'READY',contract:'atlas-structural-graph-v1',path:'graph/root.json',sha256:graphMeta.sha256},...descriptors}});
write(path.join(result.snapshotDir,'public-manifest-v2.json'),publicManifest);
write(path.join(outDir,'current','public-manifest-v2.json'),publicManifest);
write(path.join(result.snapshotDir,'science-shards.json'),{contract:'NEXO_SCIENCE_SHARD_CATALOG_V1',sourceVersion:science.sourceVersion||'',items:shardCatalog});
console.log(`NEXO_STATIC_STATE_OK fingerprint=${result.fingerprint} public=${publicManifest.fingerprint} shards=${shardCatalog.length} out=${path.relative(root,outDir)}`);
