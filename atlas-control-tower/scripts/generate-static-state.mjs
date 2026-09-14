import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {generateStaticState} from '../lib/campaign-static-state-generator.mjs';
import {buildPublicManifest} from '../lib/public-surface-manifest.mjs';
import {buildPublicManifestV3} from '../lib/public-manifest-v3.mjs';
import {buildPublicSurfaces} from '../lib/public-surface-projections.mjs';
import {loadScienceShardCatalog} from '../lib/science-shard-catalog.mjs';
import {diffProjection} from '../lib/projection-diff.mjs';
import {buildActivityEvents} from '../lib/activity-ledger.mjs';
import {buildScienceReadModelV2} from '../lib/science-read-model-v2.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const outDir=path.resolve(root,process.argv[2]||'public/data');
const dataDir=path.join(root,'data');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n')};
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const text=value=>String(value??'').trim();
const arr=value=>Array.isArray(value)?value:[];

function projectionRecords(shards){
 const records=[];
 for(const [domain,shard] of Object.entries(shards||{}))for(const raw of arr(shard?.tests)){
  if(!text(raw?.id))continue;
  records.push({
   id:text(raw.id),type:'TEST',primaryCampaign:text(raw.primaryCampaign||raw.primary_campaign)||undefined,
   domains:[...new Set([...arr(raw.domains).map(text),text(domain)].filter(Boolean))],status:text(raw.status)||undefined,
   summary:text(raw.summary)||undefined,keyMetrics:text(raw.keyMetrics||raw.key_metrics)||undefined,
   evidenceClass:text(raw.evidenceClass||raw.evidence_class)||undefined,
   sourceRef:text(raw.sourceRef||raw.source_ref)||'PEER_CONTROL_TOWER_CANONICAL/Test Registry',
   lastVerified:text(raw.lastVerified||raw.last_verified)||undefined,
   sourceUpdatedAt:text(raw.lastVerified||raw.last_verified)||undefined
  });
 }
 return records.sort((a,b)=>a.id.localeCompare(b.id));
}
function previousLedger(){
 const file=path.join(dataDir,'projection-ledger.json');
 if(!fs.existsSync(file))return [];
 const value=read(file);
 return arr(value?.items||value?.ledger||value);
}
function artifact(snapshotDir,rel,contract,payload){
 const file=path.join(snapshotDir,rel);write(file,payload);return {state:'READY',contract,path:rel,sha256:digest(file)};
}

fs.rmSync(outDir,{recursive:true,force:true});
const result=await generateStaticState({outDir});
const science=read(path.join(dataDir,'science-drive-projection.json'));
const {catalog:shardCatalog,shards}=loadScienceShardCatalog({scienceIndex:science,dataDir});
const drive=read(path.join(dataDir,'nexo-drive-projection.json'));
const sourceVersion=text(science.sourceVersion||science.sourceModifiedAt||science.generatedAt||drive?.meta?.sourceModifiedAt||result.manifest.sourceVersion);
const observedAt=text(science.generatedAt||drive?.meta?.generatedAt||result.manifest.generatedAt||sourceVersion);

const surfaces=buildPublicSurfaces({sourceVersion,scienceIndex:science,scienceShards:shards,drive});
const descriptors={};
for(const [name,surface] of Object.entries(surfaces)){
 const rel=`surfaces/${name}/index.json`,file=path.join(result.snapshotDir,rel);
 write(file,surface.payload);
 descriptors[name]={...surface.descriptor,path:rel,sha256:digest(file)};
}
const graphMeta=result.manifest.artifacts['graph/root.json'];
const compatibilitySurfaces={graph:{state:'READY',contract:'atlas-structural-graph-v1',path:'graph/root.json',sha256:graphMeta.sha256},...descriptors};
const publicManifest=buildPublicManifest({authority:'GOOGLE_DRIVE',sourceVersion,sourceModifiedAt:drive?.meta?.sourceModifiedAt||science.sourceModifiedAt||sourceVersion,generatedAt:result.manifest.generatedAt||'',surfaces:compatibilitySurfaces});
write(path.join(result.snapshotDir,'public-manifest-v2.json'),publicManifest);
write(path.join(outDir,'current','public-manifest-v2.json'),publicManifest);

const diff=diffProjection({previousLedger:previousLedger(),currentRecords:projectionRecords(shards),observedAt});
const activity=buildActivityEvents(diff.deltas,{sourceVersion,sourceRef:'DENER · SSOT CANONICAL / Science'});
const srm=buildScienceReadModelV2({scienceIndex:science,scienceShards:shards,shardCatalog,projectionLedger:diff.ledger,activity,generatedAt:result.manifest.generatedAt||observedAt});
const v3Artifacts={
 srm:artifact(result.snapshotDir,'srm-v2/index.json','NEXO_SCIENCE_READ_MODEL_V2',srm),
 projectionLedger:artifact(result.snapshotDir,'projection-ledger/index.json','NEXO_PROJECTION_LEDGER_V1',{contract:'NEXO_PROJECTION_LEDGER_V1',sourceVersion,observedAt,items:diff.ledger}),
 activityLedger:artifact(result.snapshotDir,'activity-ledger/index.json','NEXO_ACTIVITY_LEDGER_V1',{contract:'NEXO_ACTIVITY_LEDGER_V1',sourceVersion,observedAt,items:activity}),
 shards:artifact(result.snapshotDir,'shards/index.json','NEXO_SCIENCE_SHARD_CATALOG_V1',{contract:'NEXO_SCIENCE_SHARD_CATALOG_V1',sourceVersion,items:shardCatalog})
};
const publicManifestV3=buildPublicManifestV3({
 authority:'GOOGLE_DRIVE',sourceVersion,sourceModifiedAt:drive?.meta?.sourceModifiedAt||science.sourceModifiedAt||sourceVersion,
 generatedAt:result.manifest.generatedAt||'',artifacts:v3Artifacts,surfaces:compatibilitySurfaces,
 completeness:{shards:shardCatalog.length,readyShards:shardCatalog.filter(x=>x.state==='READY').length,partialShards:shardCatalog.filter(x=>x.state==='PARTIAL').length,testsObserved:srm.investigation.tests.length,rejectedObservations:srm.diagnostics.rejectedObservations}
});
write(path.join(result.snapshotDir,'public-manifest-v3.json'),publicManifestV3);
write(path.join(outDir,'current','public-manifest-v3.json'),publicManifestV3);

console.log(`NEXO_STATIC_STATE_OK fingerprint=${result.fingerprint} public=${publicManifest.fingerprint} srm=${srm.fingerprint} v3=${publicManifestV3.fingerprint} shards=${shardCatalog.length} out=${path.relative(root,outDir)}`);
