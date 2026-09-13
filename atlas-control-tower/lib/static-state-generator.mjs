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
const upper=value=>clean(value).toUpperCase();
const arr=value=>Array.isArray(value)?value:[];

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
  if(drive?.meta?.authority!=='GOOGLE_DRIVE')throw new Error('STATIC_STATE_INVALID_DRIVE_SNAPSHOT');
  return {science,shards,drive};
}

function sanitizeTest(test){
  return {
    id:clean(test.id),
    label:clean(test.label)||clean(test.id),
    evidenceClass:clean(test.evidenceClass),
    status:clean(test.status),
    summary:clean(test.summary),
    keyMetrics:clean(test.keyMetrics),
    lastVerified:clean(test.lastVerified),
    primaryCampaign:clean(test.primaryCampaign),
    domains:arr(test.domains).map(clean).filter(Boolean)
  };
}

function scienceIndexArtifact(science){
  return {
    ...publicMeta(science.sourceVersion),
    contract:science.contract,
    sourceRef:'PEER_CONTROL_TOWER_CANONICAL',
    sourceFingerprint:science.fingerprint,
    projectionMode:science.projectionMode,
    domains:arr(science.domains).map(domain=>({id:domain.id,code:domain.code,label:domain.label,question:domain.question,parentHypothesis:domain.parentHypothesis,scientificState:domain.scientificState,operationalState:domain.operationalState})),
    campaigns:arr(science.campaigns).map(campaign=>({id:campaign.id,label:campaign.label,domain:campaign.domain||'',question:campaign.question||'',status:campaign.status||'',testCount:campaign.testCount??null})),
    shards:science.shards||{},
    completeness:science.completeness||{}
  };
}

function scienceShardArtifact(science,name,shard){
  const completeness=science.completeness?.byShard?.[name]||{declared:arr(shard.tests).length,included:arr(shard.tests).length,truncated:false};
  return {
    ...publicMeta(shard.sourceVersion||science.sourceVersion),
    contract:shard.contract,
    domain:shard.domain||name,
    sourceRef:'PEER_CONTROL_TOWER_CANONICAL/Test Registry',
    tests:arr(shard.tests).map(sanitizeTest),
    sourceFingerprint:shard.fingerprint||'',
    completeness
  };
}

const systemNode=(id,label,summary)=>({id:`system:${id}`,type:'SYSTEM',label,status:'ACTIVE',summary,authority:'GITHUB'});
const graph=(sourceVersion,focus,nodes,edges,extra={})=>({...publicMeta(sourceVersion),focus,nodes,edges,total:nodes.length,depth:extra.depth||1,hasMore:Boolean(extra.hasMore),truncated:Boolean(extra.truncated),completeness:extra.completeness||undefined});

function rootGraph(science){
  const root=systemNode('NEXO','NEXO','Interface read-only sobre projeções publicadas do Sovereign Core.');
  const children=[
    systemNode('SCIENCE','Ciência','Pesquisa científica projetada do Drive e autorizada pelo GitHub.'),
    systemNode('ENGINEERING','Engenharia','Programas e campanhas de engenharia publicados na projeção pública.'),
    systemNode('OLYMPUS','Olympus','Estrutura pública sanitizada do domínio Olympus; dados pessoais não são publicados.')
  ];
  return graph(science.sourceVersion,root.id,[root,...children],children.map(node=>({id:`contains:${root.id}:${node.id}`,source:root.id,target:node.id,type:'CONTAINS',declared:true})));
}

function scienceRootGraph(science){
  const root=systemNode('SCIENCE','Ciência','Domínios científicos publicados no snapshot soberano.');
  const domains=arr(science.domains).map(domain=>({id:domain.id,type:'DOMAIN',domain:domain.code,label:domain.label||domain.code,status:domain.scientificState||'',summary:domain.question||'',authority:'GITHUB',metadata:{operationalState:domain.operationalState||'',parentHypothesis:domain.parentHypothesis||''}}));
  return graph(science.sourceVersion,root.id,[root,...domains],domains.map(node=>({id:`contains:${root.id}:${node.id}`,source:root.id,target:node.id,type:'CONTAINS',declared:true})));
}

function scienceDomainGraph(science,name,shard){
  const domain=arr(science.domains).find(item=>item.code===name);
  const root={id:domain?.id||`domain:${name}`,type:'DOMAIN',domain:name,label:domain?.label||name,status:domain?.scientificState||'',summary:domain?.question||'',authority:'GITHUB'};
  const campaigns=arr(science.campaigns).filter(item=>item.domain===name).map(item=>({id:item.id,type:'CAMPAIGN',domain:name,label:item.label||item.id,status:item.status||'',summary:item.question||'',authority:'GITHUB',metadata:{testCount:item.testCount??null}}));
  const tests=arr(shard.tests).map(sanitizeTest).map(test=>({id:test.id,type:'TEST',domain:name,label:test.label,status:test.status,summary:test.summary,authority:'GITHUB',evidenceClass:test.evidenceClass,updatedAt:test.lastVerified,metadata:{primaryCampaign:test.primaryCampaign,keyMetrics:test.keyMetrics}}));
  const results=arr(shard.tests).map(sanitizeTest).map(test=>({id:`result:${test.id}`,type:'RESULT',domain:name,label:`Resultado · ${test.label}`,status:test.status,summary:test.summary,authority:'GITHUB',evidenceClass:test.evidenceClass,updatedAt:test.lastVerified,metadata:{testId:test.id,keyMetrics:test.keyMetrics}}));
  const edges=[];
  for(const campaign of campaigns)edges.push({id:`contains:${root.id}:${campaign.id}`,source:root.id,target:campaign.id,type:'CONTAINS',declared:true});
  for(const test of tests){
    const parent=campaigns.find(item=>item.id===test.metadata?.primaryCampaign);
    edges.push({id:`tests:${parent?.id||root.id}:${test.id}`,source:parent?.id||root.id,target:test.id,type:'TESTS',declared:true});
    edges.push({id:`produces:${test.id}:result:${test.id}`,source:test.id,target:`result:${test.id}`,type:'PRODUCES',declared:true});
  }
  const completeness=science.completeness?.byShard?.[name]||{declared:tests.length,included:tests.length,truncated:false};
  return graph(science.sourceVersion,root.id,[root,...campaigns,...tests,...results],edges,{depth:3,hasMore:Boolean(completeness.truncated),truncated:Boolean(completeness.truncated),completeness});
}

function hierarchyGraph(sourceVersion,system,rows,rootId,{publicOlympus=false}={}){
  const systemId=`system:${system}`;
  const label=system==='ENGINEERING'?'Engenharia':'Olympus';
  const allowed=arr(rows).filter(row=>{
    if(publicOlympus&&upper(row.type)==='CAMPAIGN')return false;
    return upper(row.type)==='PROGRAM'&&clean(row.parentId)===rootId;
  });
  const root=systemNode(system,label,publicOlympus?'Estrutura pública sanitizada; registros pessoais permanecem privados.':`Hierarquia ${label} publicada no snapshot.`);
  const nodes=allowed.map(row=>({id:row.id,type:'PROGRAM',label:row.title||row.id,status:row.status||'',summary:row.summary||'',authority:'GITHUB'}));
  return graph(sourceVersion,systemId,[root,...nodes],nodes.map(node=>({id:`contains:${systemId}:${node.id}`,source:systemId,target:node.id,type:'CONTAINS',declared:true})));
}

function safeLearning(drive,sourceVersion){
  const safe=row=>!upper(row.domains).includes('OLYMPUS');
  const map=(row,stage)=>({id:row.id,stage,label:row.title||row.id,status:row.status||'',domains:clean(row.domains).split('|').map(clean).filter(Boolean),summary:row.summary||'',support:row.support??null,contradict:row.contradict??null,confidence:row.confidence??null,scope:row.scope||''});
  const structural=arr(drive.learning).filter(safe).map(row=>map(row,'structural'));
  const cross=arr(drive.crossDomain).filter(safe).map(row=>map(row,'cross-domain'));
  return {...publicMeta(sourceVersion),privacyGate:'PUBLIC_ALLOWLIST',total:structural.length+cross.length,ladder:[{id:'structural',items:structural},{id:'cross-domain',items:cross}],emergent:[]};
}

function safeOps(drive,sourceVersion){
  const actions=arr(drive.actions).map(row=>({id:row.id,label:row.title||row.id,status:row.status||'',updatedAt:row.updatedAt||''}));
  return {...publicMeta(sourceVersion),privacyGate:'PUBLIC_ALLOWLIST',counts:{blocked:actions.filter(row=>upper(row.status)==='BLOCKED').length,actions:actions.length},actions,runs:[],events:[]};
}

function safeAudit(drive,sourceVersion){
  const issues=arr(drive.integrity).map(row=>({id:row.id,scope:row.scope||'',type:row.type||'',status:row.status||'',severity:row.severity||''}));
  return {...publicMeta(sourceVersion),privacyGate:'PUBLIC_ALLOWLIST',total:issues.length,issues};
}

function buildEntityIndex(science,shards,drive){
  const entities={};
  for(const domain of arr(science.domains))entities[domain.id]={type:'DOMAIN',domain:domain.code,artifact:'science/index.json',label:domain.label||domain.code,status:domain.scientificState||'',summary:domain.question||''};
  for(const campaign of arr(science.campaigns))entities[campaign.id]={type:'CAMPAIGN',domain:campaign.domain||'',artifact:campaign.domain?`science/${campaign.domain}.json`:'science/index.json',label:campaign.label||campaign.id,status:campaign.status||'',summary:campaign.question||''};
  for(const [name,shard] of Object.entries(shards)){
    for(const raw of arr(shard.tests)){
      const test=sanitizeTest(raw),domain=clean(test.domains[0]||name),artifact=`science/${name}.json`;
      entities[test.id]={type:'TEST',domain,artifact,label:test.label,status:test.status,summary:test.summary};
      entities[`result:${test.id}`]={type:'RESULT',domain,artifact,label:`Resultado · ${test.label}`,status:test.status,summary:test.summary};
    }
  }
  const generic=[...arr(drive.engineering),...arr(drive.olympus).filter(row=>upper(row.type)!=='CAMPAIGN')];
  for(const row of generic){
    entities[row.id]={type:upper(row.type)||'ENTITY',domain:'',artifact:'entities/index.json',label:row.title||row.id,status:row.status||'',summary:row.summary||'',parentId:row.parentId||null};
  }
  return {...publicMeta(science.sourceVersion),privacyGate:'PUBLIC_ALLOWLIST',entities};
}

function buildSearchIndex(entityIndex){
  const items=Object.entries(entityIndex.entities).map(([id,entity])=>({id,label:entity.label||id,type:entity.type,domain:entity.domain||'',status:entity.status||'',artifact:entity.artifact}));
  items.sort((a,b)=>a.id.localeCompare(b.id));
  return {...publicMeta(entityIndex.sourceVersion),privacyGate:'PUBLIC_ALLOWLIST',items};
}

function buildState(science,shards,drive){
  const tests=Object.values(shards).reduce((sum,shard)=>sum+arr(shard.tests).length,0);
  return {
    ...publicMeta(science.sourceVersion),
    freshness:'SNAPSHOT',
    counts:{DOMAIN:arr(science.domains).length,CAMPAIGN:arr(science.campaigns).length,TEST:tests,RESULT:tests,ENGINEERING:arr(drive.engineering).length,OLYMPUS_PUBLIC:arr(drive.olympus).filter(row=>upper(row.type)!=='CAMPAIGN').length},
    science:{testsDeclared:science.completeness?.tests?.declared??null,testsIncluded:tests,truncated:Boolean(science.completeness?.tests?.truncated),domains:arr(science.domains).length,campaigns:arr(science.campaigns).length}
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
  emit('graph/root.json',rootGraph(science));
  emit('graph/science.json',scienceRootGraph(science));
  for(const [name,shard] of Object.entries(shards))if(/^D\d+$/i.test(name))emit(`graph/science/${name}.json`,scienceDomainGraph(science,name,shard));
  emit('graph/engineering.json',hierarchyGraph(science.sourceVersion,'ENGINEERING',drive.engineering,'ENG-DOM-ENGINEERING'));
  emit('graph/olympus.json',hierarchyGraph(science.sourceVersion,'OLYMPUS',drive.olympus,'OLY-DOM-OLYMPUS',{publicOlympus:true}));
  const entities=buildEntityIndex(science,shards,drive);
  emit('entities/index.json',entities);
  emit('search/index.json',buildSearchIndex(entities));
  emit('state.json',buildState(science,shards,drive));
  emit('health.json',buildHealth(science));
  emit('learning/current.json',safeLearning(drive,science.sourceVersion));
  emit('operations/current.json',safeOps(drive,science.sourceVersion));
  emit('audit/current.json',safeAudit(drive,science.sourceVersion));

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
    privacyGate:'PUBLIC_ALLOWLIST',
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
  }else fs.rmSync(staged,{recursive:true,force:true});
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
  if(manifest.privacyGate!=='PUBLIC_ALLOWLIST')issues.push({type:'PRIVACY_GATE_MISSING'});
  const hex=clean(manifest.fingerprint).replace(/^sha256:/,'');
  const root=path.join(outDir,'snapshots',hex);
  for(const [artifact,expected] of Object.entries(manifest.artifacts||{})){
    const file=path.join(root,artifact);
    if(!fs.existsSync(file)){issues.push({type:'ARTIFACT_MISSING',artifact});continue}
    const body=fs.readFileSync(file);
    const actual=sha256(body);
    if(actual!==expected.sha256)issues.push({type:'HASH_MISMATCH',artifact,expected:expected.sha256,actual});
  }
  const required=['science/index.json','science/D7.json','graph/root.json','graph/science.json','graph/science/D7.json','entities/index.json','search/index.json','state.json','health.json','learning/current.json','operations/current.json','audit/current.json'];
  for(const artifact of required)if(!manifest.artifacts?.[artifact])issues.push({type:'REQUIRED_ARTIFACT_UNDECLARED',artifact});
  return {ok:issues.length===0,issues,fingerprint:manifest.fingerprint};
}
