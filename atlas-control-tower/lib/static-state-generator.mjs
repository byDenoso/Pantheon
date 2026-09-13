import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR=path.resolve(HERE,'../data');
const CONTRACT='nexo-static-runtime-v1';
const CONTRACT_VERSION='1';
const SCHEMA_VERSION='nexo-static-state-v1';
const PROJECTION_VERSION='drive-github-v1';

const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const sha256=value=>createHash('sha256').update(value).digest('hex');
const ensure=dir=>fs.mkdirSync(dir,{recursive:true});
const json=value=>JSON.stringify(value,null,2)+'\n';
const write=(file,value)=>{ensure(path.dirname(file));const body=json(value);fs.writeFileSync(file,body);return {sha256:sha256(body),bytes:Buffer.byteLength(body)}};
const clean=value=>value==null?'':String(value).trim();

function publicMeta(sourceVersion){
  return {contractVersion:CONTRACT_VERSION,schemaVersion:SCHEMA_VERSION,projectionVersion:PROJECTION_VERSION,source:'GOOGLE_DRIVE',authority:'GITHUB',projectionAuthority:'GOOGLE_DRIVE',projectionOnly:true,sourceVersion};
}

function loadSources(dataDir){
  const science=readJson(path.join(dataDir,'science-drive-projection.json'));
  if(science?.contract!=='nexo-science-drive-github-v1'||science?.source!=='GOOGLE_DRIVE')throw new Error('STATIC_STATE_INVALID_SCIENCE_INDEX');
  const shards={};
  for(const [name,rel] of Object.entries(science.shards||{})){
    const file=path.join(dataDir,rel);
    if(!fs.existsSync(file))throw new Error(`STATIC_STATE_MISSING_SHARD:${name}`);
    const shard=readJson(file);
    if(shard?.source!=='GOOGLE_DRIVE')throw new Error(`STATIC_STATE_INVALID_SHARD:${name}`);
    shards[name]=shard;
  }
  const drive=readJson(path.join(dataDir,'nexo-drive-projection.json'));
  return {science,shards,drive};
}

function scienceIndexArtifact(science){
  return {
    ...publicMeta(science.sourceVersion),
    contract:science.contract,
    fingerprint:science.fingerprint,
    projectionMode:science.projectionMode,
    domains:science.domains||[],
    campaigns:science.campaigns||[],
    shards:science.shards||{},
    completeness:science.completeness||{}
  };
}

function scienceShardArtifact(science,name,shard){
  const completeness=science.completeness?.byShard?.[name]||{declared:(shard.tests||[]).length,included:(shard.tests||[]).length,truncated:false};
  return {
    ...publicMeta(shard.sourceVersion||science.sourceVersion),
    contract:shard.contract,
    domain:shard.domain||name,
    sourceRef:shard.sourceRef||'',
    tests:Array.isArray(shard.tests)?shard.tests:[],
    sourceFingerprint:shard.fingerprint||'',
    completeness
  };
}

function buildEntityIndex(science,shards){
  const entities={};
  for(const domain of science.domains||[]){
    entities[domain.id]={type:'DOMAIN',domain:domain.code,artifact:'science/index.json',label:domain.label||domain.code};
  }
  for(const campaign of science.campaigns||[]){
    entities[campaign.id]={type:'CAMPAIGN',domain:campaign.domain||'',artifact:campaign.domain?`science/${campaign.domain}.json`:'science/index.json',label:campaign.label||campaign.id};
  }
  for(const [name,shard] of Object.entries(shards)){
    for(const test of shard.tests||[]){
      const domain=clean(test.domain||(test.domains||[])[0]||name);
      const artifact=`science/${name}.json`;
      entities[test.id]={type:'TEST',domain,artifact,label:test.label||test.id};
      entities[`result:${test.id}`]={type:'RESULT',domain,artifact,label:`Resultado · ${test.label||test.id}`};
    }
  }
  return {...publicMeta(science.sourceVersion),entities};
}

function buildSearchIndex(entityIndex){
  const items=Object.entries(entityIndex.entities).map(([id,entity])=>({id,label:entity.label||id,type:entity.type,domain:entity.domain||'',artifact:entity.artifact}));
  items.sort((a,b)=>a.id.localeCompare(b.id));
  return {...publicMeta(entityIndex.sourceVersion),items};
}

function buildState(science,shards,drive){
  const tests=Object.values(shards).reduce((sum,shard)=>sum+(shard.tests||[]).length,0);
  return {
    ...publicMeta(science.sourceVersion),
    counts:{DOMAIN:(science.domains||[]).length,CAMPAIGN:(science.campaigns||[]).length,TEST:tests,RESULT:tests,ENGINEERING:(drive.engineering||[]).length,OLYMPUS:(drive.olympus||[]).length},
    science:{testsDeclared:science.completeness?.tests?.declared??null,testsIncluded:tests,truncated:Boolean(science.completeness?.tests?.truncated),domains:(science.domains||[]).length,campaigns:(science.campaigns||[]).length}
  };
}

function buildHealth(science){
  return {ok:true,contract:CONTRACT,runtime:'STATIC_LOCAL',...publicMeta(science.sourceVersion),freshness:'SNAPSHOT',usedFallback:false,sourceFingerprint:science.fingerprint};
}

function semanticFingerprint(sourceVersion,artifacts){
  const lines=Object.entries(artifacts).sort(([a],[b])=>a.localeCompare(b)).map(([name,meta])=>`${name}:${meta.sha256}:${meta.bytes}`);
  return `sha256:${sha256([CONTRACT,sourceVersion,...lines].join('\n'))}`;
}

export async function generateStaticState({outDir,dataDir=DEFAULT_DATA_DIR,generatedAt=new Date().toISOString()}={}){
  if(!outDir)throw new Error('STATIC_STATE_OUT_DIR_REQUIRED');
  const {science,shards,drive}=loadSources(dataDir);
  ensure(outDir);
  let previousFingerprint=null;
  const currentFile=path.join(outDir,'current','manifest.json');
  if(fs.existsSync(currentFile)){
    try{previousFingerprint=readJson(currentFile).fingerprint||null}catch{previousFingerprint=null}
  }

  const staged=fs.mkdtempSync(path.join(outDir,'.stage-'));
  const artifacts={};
  const emit=(rel,value)=>{artifacts[rel]=write(path.join(staged,rel),value)};

  const index=scienceIndexArtifact(science);
  emit('science/index.json',index);
  for(const [name,shard] of Object.entries(shards))emit(`science/${name}.json`,scienceShardArtifact(science,name,shard));
  const entities=buildEntityIndex(science,shards);
  emit('entities/index.json',entities);
  emit('search/index.json',buildSearchIndex(entities));
  emit('state.json',buildState(science,shards,drive));
  emit('health.json',buildHealth(science));

  const fingerprint=semanticFingerprint(science.sourceVersion,artifacts);
  const hex=fingerprint.slice(7);
  const manifest={
    contract:CONTRACT,
    contractVersion:CONTRACT_VERSION,
    schemaVersion:SCHEMA_VERSION,
    projectionVersion:PROJECTION_VERSION,
    architectureVersion:'1.0',
    source:'GOOGLE_DRIVE',
    codeAuthority:'GITHUB',
    projectionAuthority:'GOOGLE_DRIVE',
    projectionOnly:true,
    freshness:'SNAPSHOT',
    sourceVersion:science.sourceVersion,
    sourceFingerprint:science.fingerprint,
    fingerprint,
    previousFingerprint:previousFingerprint&&previousFingerprint!==fingerprint?previousFingerprint:null,
    generatedAt,
    snapshotPath:`snapshots/${hex}`,
    completeness:science.completeness||{},
    artifacts
  };

  write(path.join(staged,'manifest.json'),manifest);
  const snapshotDir=path.join(outDir,'snapshots',hex);
  if(!fs.existsSync(snapshotDir)){
    ensure(path.dirname(snapshotDir));
    fs.renameSync(staged,snapshotDir);
  }else{
    fs.rmSync(staged,{recursive:true,force:true});
  }
  ensure(path.dirname(currentFile));
  const tempCurrent=`${currentFile}.tmp`;
  fs.writeFileSync(tempCurrent,json(manifest));
  fs.renameSync(tempCurrent,currentFile);

  const validation=validateStaticState(outDir);
  if(!validation.ok)throw new Error(`STATIC_STATE_VALIDATION_FAILED:${validation.issues.map(issue=>issue.type).join(',')}`);
  return {fingerprint,manifest,snapshotDir};
}

export function validateStaticState(outDir){
  const issues=[];
  let manifest;
  try{manifest=readJson(path.join(outDir,'current','manifest.json'))}catch(error){return {ok:false,issues:[{type:'MANIFEST_UNREADABLE',detail:String(error.message||error)}]}}
  if(manifest.contract!==CONTRACT)issues.push({type:'CONTRACT_MISMATCH'});
  const hex=clean(manifest.fingerprint).replace(/^sha256:/,'');
  const root=path.join(outDir,'snapshots',hex);
  for(const [artifact,expected] of Object.entries(manifest.artifacts||{})){
    const file=path.join(root,artifact);
    if(!fs.existsSync(file)){issues.push({type:'ARTIFACT_MISSING',artifact});continue}
    const body=fs.readFileSync(file);
    const actual=sha256(body);
    if(actual!==expected.sha256)issues.push({type:'HASH_MISMATCH',artifact,expected:expected.sha256,actual});
  }
  const required=['science/index.json','science/D7.json','entities/index.json','search/index.json','state.json','health.json'];
  for(const artifact of required)if(!manifest.artifacts?.[artifact])issues.push({type:'REQUIRED_ARTIFACT_UNDECLARED',artifact});
  return {ok:issues.length===0,issues,fingerprint:manifest.fingerprint};
}
