import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {generateStaticState as generateLegacyStaticState} from './static-state-generator.mjs';
import {buildPublicManifest} from './public-surface-manifest.mjs';

const CONTRACT='nexo-static-runtime-v1';
const clean=value=>value==null?'':String(value).trim();
const upper=value=>clean(value).toUpperCase();
const arr=value=>Array.isArray(value)?value:[];
const sha256=value=>createHash('sha256').update(value).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,json(value))};
const fileMeta=file=>{const body=fs.readFileSync(file);return {sha256:sha256(body),bytes:body.length}};
const programMode=index=>arr(index.programs).length>0;
const publicCompleteness=index=>({programs:{included:arr(index.programs).length,truncated:false},campaigns:{included:arr(index.campaigns).length,truncated:false},domains:{included:arr(index.domains).length,truncated:false}});
const campaignTestCount=item=>{
 const direct=Number(item?.testCount);
 if(Number.isFinite(direct))return direct;
 const match=clean(item?.summary||item?.question).match(/\b(\d+)\s+test_ids?\b/i);
 return match?Number(match[1]):null;
};
const campaignNode=item=>({id:item.id,type:'CAMPAIGN',domain:item.domain||'',label:item.label||item.title||item.id,status:item.status||'',summary:item.question||item.summary||'',authority:'GITHUB',metadata:{testCount:campaignTestCount(item),childCount:0,primaryProgram:item.primaryProgram||null}});
const programNode=(item,index)=>({id:item.id,type:'PROGRAM',domain:item.domain||'',label:item.label||item.title||item.id,status:item.status||'',summary:item.summary||'',authority:'GITHUB',metadata:{childCount:arr(index.campaigns).filter(campaign=>campaign.primaryProgram===item.id).length}});

function domainArtifact(index,code){
 const campaigns=arr(index.campaigns).filter(item=>upper(item.domain)===code).map(item=>({...item,label:item.label||item.title||item.id,testCount:campaignTestCount(item)}));
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
  derived:true,
  derivationRule:'campaign.domain',
  sourceRef:'DENER · SSOT CANONICAL / Science',
  campaigns,
  completeness:{campaigns:{included:campaigns.length,truncated:false}}
 };
}

function compatibilityDomainGraph(index,code){
 const campaigns=arr(index.campaigns).filter(item=>upper(item.domain)===code).map(campaignNode);
 const root={id:`domain:${code}`,type:'DOMAIN',domain:code,label:code,status:'ACTIVE',summary:`Vista derivada de campanhas que declaram domínio ${code}.`,authority:'GITHUB',metadata:{derived:true,derivationRule:'campaign.domain',childCount:campaigns.length}};
 return {
  contractVersion:index.contractVersion,
  schemaVersion:index.schemaVersion,
  projectionVersion:index.projectionVersion,
  source:index.source,
  authority:index.authority,
  projectionAuthority:index.projectionAuthority,
  projectionOnly:true,
  sourceVersion:index.sourceVersion,
  focus:root.id,
  nodes:[root,...campaigns],
  edges:campaigns.map(node=>({id:`contains:${root.id}:${node.id}`,source:root.id,target:node.id,type:'CONTAINS',declared:true,derived:true})),
  total:campaigns.length+1,
  depth:2,
  hasMore:false,
  truncated:false,
  completeness:{...publicCompleteness(index),view:{included:campaigns.length,truncated:false}}
 };
}

function sanitizeDomainGraph(file,index,code){
 const body=read(file);
 const allowed=new Set([`domain:${code}`,...arr(index.campaigns).filter(item=>upper(item.domain)===code).map(item=>item.id)]);
 body.nodes=arr(body.nodes).filter(node=>allowed.has(node.id)&&(node.type==='DOMAIN'||node.type==='CAMPAIGN')).map(node=>node.type==='CAMPAIGN'?campaignNode(arr(index.campaigns).find(item=>item.id===node.id)||node):node);
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
 const root=body.nodes.find(node=>node.id==='system:SCIENCE')||{id:'system:SCIENCE',type:'SYSTEM',label:'Ciência',status:'ACTIVE',summary:'Estrutura científica publicada.',authority:'GITHUB'};
 if(programMode(index)){
  const programs=arr(index.programs).map(item=>programNode(item,index));
  root.metadata={...(root.metadata||{}),childCount:programs.length};
  body.nodes=[root,...programs];
  body.edges=programs.map(node=>({id:`contains:${root.id}:${node.id}`,source:root.id,target:node.id,type:'CONTAINS',declared:true}));
 }else{
  const domains=arr(body.nodes).filter(node=>node.type==='DOMAIN');
  const cross=arr(index.campaigns).filter(item=>!clean(item.domain)).map(campaignNode);
  root.metadata={...(root.metadata||{}),childCount:domains.length+cross.length};
  body.nodes=[root,...domains,...cross];
  body.edges=[...domains,...cross].map(node=>({id:`contains:${root.id}:${node.id}`,source:root.id,target:node.id,type:'CONTAINS',declared:true}));
 }
 body.total=body.nodes.length;
 body.hasMore=false;
 body.truncated=false;
 write(file,body);
}

function sanitizeEntities(file,index){
 const body=read(file);
 for(const [id,entity] of Object.entries(body.entities||{}))if(entity?.type==='TEST'||entity?.type==='RESULT')delete body.entities[id];
 for(const campaign of arr(index.campaigns)){
  const entity=body.entities?.[campaign.id];
  if(!entity)continue;
  entity.testCount=campaignTestCount(campaign);
  entity.primaryProgram=campaign.primaryProgram||null;
  if(/^D\d+$/i.test(clean(campaign.domain)))entity.artifact=`science/${upper(campaign.domain)}.json`;
 }
 write(file,body);
}

function sanitizeSearch(file,index){
 const body=read(file);
 body.items=arr(body.items).filter(item=>item.type!=='TEST'&&item.type!=='RESULT');
 for(const item of body.items){
  const campaign=arr(index.campaigns).find(row=>row.id===item.id);
  const program=arr(index.programs).find(row=>row.id===item.id);
  if(campaign)item.label=campaign.label||campaign.title||campaign.id;
  if(program)item.label=program.label||program.title||program.id;
 }
 write(file,body);
}

function sanitizeState(file,index){
 const body=read(file);
 body.counts={...(body.counts||{}),PROGRAM:arr(index.programs).length,DOMAIN:arr(index.domains).length,CAMPAIGN:arr(index.campaigns).length};
 delete body.counts.TEST;
 delete body.counts.RESULT;
 body.science={programs:arr(index.programs).length,domains:arr(index.domains).length,campaigns:arr(index.campaigns).length,truncated:false};
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
 index.projectionMode=programMode(index)?'CANONICAL_PROGRAM_CAMPAIGN_INDEX':'CAMPAIGN_INDEX';
 index.completeness=publicCompleteness(index);
 delete index.shards;
 write(indexFile,index);

 const domainCodes=[...new Set(arr(index.campaigns).map(item=>upper(item.domain)).filter(code=>/^D\d+$/.test(code)))];
 for(const code of domainCodes){
  const graphFile=path.join(oldRoot,`graph/science/${code}.json`);
  write(path.join(oldRoot,`science/${code}.json`),domainArtifact(index,code));
  if(fs.existsSync(graphFile))sanitizeDomainGraph(graphFile,index,code);else write(graphFile,compatibilityDomainGraph(index,code));
 }
 const crossCampaigns=arr(index.campaigns).filter(item=>!clean(item.domain)||upper(item.domain)==='CROSS');
 if(crossCampaigns.length)write(path.join(oldRoot,'science/CROSS.json'),{...domainArtifact(index,'CROSS'),campaigns:crossCampaigns.map(item=>({...item,label:item.label||item.title||item.id,testCount:campaignTestCount(item)})),completeness:{campaigns:{included:crossCampaigns.length,truncated:false}}});

 sanitizeScienceRoot(path.join(oldRoot,'graph/science.json'),index);
 sanitizeEntities(path.join(oldRoot,'entities/index.json'),index);
 sanitizeSearch(path.join(oldRoot,'search/index.json'),index);
 sanitizeState(path.join(oldRoot,'state.json'),index);

 const artifacts={};
 const walk=(dir,prefix='')=>{
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
   if(entry.name==='manifest.json'||entry.name==='public-manifest-v2.json')continue;
   const rel=prefix?`${prefix}/${entry.name}`:entry.name;
   const file=path.join(dir,entry.name);
   if(entry.isDirectory())walk(file,rel);else artifacts[rel]=fileMeta(file);
  }
 };
 walk(oldRoot);
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

 const publicManifest=initialPublicManifest(manifest,artifacts,options.generatedAt);
 write(path.join(newRoot,'public-manifest-v2.json'),publicManifest);
 write(path.join(outDir,'current','public-manifest-v2.json'),publicManifest);
 return {fingerprint,manifest,publicManifest,snapshotDir:newRoot};
}
