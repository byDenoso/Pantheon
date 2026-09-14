import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {generateStaticState as generateLegacyStaticState} from './static-state-generator.mjs';
import {buildPublicManifest} from './public-surface-manifest.mjs';

const CONTRACT='nexo-static-runtime-v1';
const clean=value=>value==null?'':String(value).trim();
const arr=value=>Array.isArray(value)?value:[];
const sha256=value=>createHash('sha256').update(value).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const write=(file,value)=>fs.writeFileSync(file,json(value));
const fileMeta=file=>{const body=fs.readFileSync(file);return {sha256:sha256(body),bytes:body.length}};
const publicCompleteness=index=>({campaigns:{included:arr(index.campaigns).length,truncated:false},domains:{included:arr(index.domains).length,truncated:false}});
const campaignNode=item=>({id:item.id,type:'CAMPAIGN',domain:item.domain||'',label:item.label||item.id,status:item.status||'',summary:item.question||'',authority:'GITHUB',metadata:{testCount:item.testCount??null}});

function domainArtifact(index,code){
 const campaigns=arr(index.campaigns).filter(item=>item.domain===code);
 return {
  contractVersion:index.contractVersion,
  schemaVersion:index.schemaVersion,
  projectionVersion:index.projectionVersion,
  source:index.source,
  authority:index.authority,
  projectionAuthority:index.projectionAuthority,
  projectionOnly:true,
  sourceVersion:index.sourceVersion,
  contract:index.contract,
  domain:code,
  sourceRef:'PEER_CONTROL_TOWER_CANONICAL/SCIENTIFIC_CAMPAIGNS',
  campaigns,
  completeness:{campaigns:{included:campaigns.length,truncated:false}}
 };
}

function sanitizeDomainGraph(file,index,code){
 const body=read(file);
 const allowed=new Set([`domain:${code}`,...arr(index.campaigns).filter(item=>item.domain===code).map(item=>item.id)]);
 body.nodes=arr(body.nodes).filter(node=>allowed.has(node.id)&&(node.type==='DOMAIN'||node.type==='CAMPAIGN'));
 body.edges=arr(body.edges).filter(edge=>allowed.has(edge.source)&&allowed.has(edge.target));
 body.total=body.nodes.length;
 body.hasMore=false;
 body.truncated=false;
 body.depth=2;
 body.completeness={...publicCompleteness(index),view:{included:body.nodes.filter(node=>node.type==='CAMPAIGN').length,truncated:false}};
 write(file,body);
}

function sanitizeScienceRoot(file,index){
 const body=read(file);
 const root=body.nodes.find(node=>node.id==='system:SCIENCE')||{id:'system:SCIENCE',type:'SYSTEM',label:'Ciência',status:'ACTIVE',summary:'Campanhas científicas publicadas.',authority:'GITHUB'};
 const domains=arr(body.nodes).filter(node=>node.type==='DOMAIN');
 const cross=arr(index.campaigns).filter(item=>!clean(item.domain)).map(campaignNode);
 body.nodes=[root,...domains,...cross];
 body.edges=[...domains,...cross].map(node=>({id:`contains:${root.id}:${node.id}`,source:root.id,target:node.id,type:'CONTAINS',declared:true}));
 body.total=body.nodes.length;
 body.hasMore=false;
 body.truncated=false;
 write(file,body);
}

function sanitizeEntities(file){
 const body=read(file);
 for(const [id,entity] of Object.entries(body.entities||{}))if(entity?.type==='TEST'||entity?.type==='RESULT')delete body.entities[id];
 write(file,body);
}

function sanitizeSearch(file){
 const body=read(file);
 body.items=arr(body.items).filter(item=>item.type!=='TEST'&&item.type!=='RESULT');
 write(file,body);
}

function sanitizeState(file,index){
 const body=read(file);
 body.counts={...(body.counts||{}),DOMAIN:arr(index.domains).length,CAMPAIGN:arr(index.campaigns).length};
 delete body.counts.TEST;
 delete body.counts.RESULT;
 body.science={domains:arr(index.domains).length,campaigns:arr(index.campaigns).length,truncated:false};
 write(file,body);
}

function semanticFingerprint(sourceVersion,artifacts){
 const lines=Object.entries(artifacts).sort(([a],[b])=>a.localeCompare(b)).map(([name,meta])=>`${name}:${meta.sha256}:${meta.bytes}`);
 return `sha256:${sha256([CONTRACT,sourceVersion,...lines].join('\n'))}`;
}

function initialPublicManifest(oldManifest,artifacts,generatedAt){
 const graphMeta=artifacts['graph/root.json'];
 if(!graphMeta?.sha256)throw new Error('PUBLIC_MANIFEST_GRAPH_ARTIFACT_MISSING');
 const unavailable={state:'DATA_UNAVAILABLE'};
 return buildPublicManifest({
  authority:'GOOGLE_DRIVE',
  sourceVersion:oldManifest.sourceVersion||'',
  sourceModifiedAt:oldManifest.sourceModifiedAt||oldManifest.sourceVersion||'',
  generatedAt:generatedAt||oldManifest.generatedAt||'',
  surfaces:{
   graph:{state:'READY',contract:'atlas-structural-graph-v1',path:'graph/root.json',sha256:graphMeta.sha256},
   observatory:unavailable,
   laboratory:unavailable,
   learning:unavailable,
   operations:unavailable,
   activity:unavailable,
   audit:unavailable,
   search:unavailable
  }
 });
}

export async function generateStaticState(options={}){
 const result=await generateLegacyStaticState(options);
 const outDir=options.outDir;
 const oldManifest=read(path.join(outDir,'current','manifest.json'));
 const oldRoot=path.join(outDir,oldManifest.snapshotPath);
 const indexFile=path.join(oldRoot,'science/index.json');
 const index=read(indexFile);
 index.projectionMode='CAMPAIGN_INDEX';
 index.completeness=publicCompleteness(index);
 delete index.shards;
 write(indexFile,index);

 for(const domain of arr(index.domains)){
  const code=domain.code;
  write(path.join(oldRoot,`science/${code}.json`),domainArtifact(index,code));
  sanitizeDomainGraph(path.join(oldRoot,`graph/science/${code}.json`),index,code);
 }
 write(path.join(oldRoot,'science/CROSS.json'),{...domainArtifact(index,'CROSS'),campaigns:arr(index.campaigns).filter(item=>!clean(item.domain)),completeness:{campaigns:{included:arr(index.campaigns).filter(item=>!clean(item.domain)).length,truncated:false}}});
 sanitizeScienceRoot(path.join(oldRoot,'graph/science.json'),index);
 sanitizeEntities(path.join(oldRoot,'entities/index.json'));
 sanitizeSearch(path.join(oldRoot,'search/index.json'));
 sanitizeState(path.join(oldRoot,'state.json'),index);

 const artifacts={};
 for(const artifact of Object.keys(oldManifest.artifacts||{}))artifacts[artifact]=fileMeta(path.join(oldRoot,artifact));
 const fingerprint=semanticFingerprint(oldManifest.sourceVersion,artifacts);
 const hex=fingerprint.slice(7);
 const newRoot=path.join(outDir,'snapshots',hex);
 const manifest={...oldManifest,fingerprint,snapshotPath:`snapshots/${hex}`,completeness:publicCompleteness(index),artifacts};
 if(oldRoot!==newRoot){
  if(fs.existsSync(newRoot))fs.rmSync(newRoot,{recursive:true,force:true});
  fs.renameSync(oldRoot,newRoot);
 }
 write(path.join(newRoot,'manifest.json'),manifest);
 write(path.join(outDir,'current','manifest.json'),manifest);

 const publicManifest=initialPublicManifest(oldManifest,artifacts,options.generatedAt);
 write(path.join(newRoot,'public-manifest-v2.json'),publicManifest);
 write(path.join(outDir,'current','public-manifest-v2.json'),publicManifest);
 return {fingerprint,manifest,publicManifest,snapshotDir:newRoot};
}
