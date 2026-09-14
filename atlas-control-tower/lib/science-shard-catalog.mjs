import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const text=value=>String(value??'').trim();
const arr=value=>Array.isArray(value)?value:[];
const sha256=body=>`sha256:${createHash('sha256').update(body).digest('hex')}`;
const shardRank=id=>id==='CROSS'?Number.MAX_SAFE_INTEGER:Number(text(id).replace(/^D/i,''))||Number.MAX_SAFE_INTEGER-1;

function campaignDeclaredCount(scienceIndex,id){
  return arr(scienceIndex?.campaigns)
    .filter(row=>text(row?.domain).toUpperCase()===id.toUpperCase())
    .reduce((sum,row)=>sum+(Number.isFinite(Number(row?.testCount))?Number(row.testCount):0),0);
}

function explicitEntries(scienceIndex){
  return Object.entries(scienceIndex?.shards||{}).map(([id,rel])=>({id,path:text(rel)})).filter(x=>x.id&&x.path);
}

function discoveredEntries(dataDir){
  const dir=path.join(dataDir,'science-drive-projection');
  if(!fs.existsSync(dir))return [];
  return fs.readdirSync(dir,{withFileTypes:true})
    .filter(entry=>entry.isFile()&&/^(D\d+|CROSS)\.json$/i.test(entry.name))
    .map(entry=>({id:entry.name.replace(/\.json$/i,''),path:`science-drive-projection/${entry.name}`}));
}

export function discoverScienceShards({scienceIndex={},dataDir}={}){
  if(!dataDir)throw new Error('SCIENCE_SHARD_DATA_DIR_REQUIRED');
  const explicit=explicitEntries(scienceIndex);
  const candidates=explicit.length?explicit:discoveredEntries(dataDir);
  const byId=new Map(candidates.map(item=>[item.id.toUpperCase(),item]));
  for(const campaign of arr(scienceIndex?.campaigns)){
    const id=text(campaign?.domain).toUpperCase();
    if(/^(D\d+|CROSS)$/.test(id)&&!byId.has(id))byId.set(id,{id,path:`science-drive-projection/${id}.json`});
  }
  return [...byId.values()].map(item=>{
    const id=item.id.toUpperCase();
    const file=path.join(dataDir,item.path);
    const completeness=scienceIndex?.completeness?.byShard?.[id]||{};
    const declaredFromCampaigns=campaignDeclaredCount(scienceIndex,id);
    if(!fs.existsSync(file))return {
      id,path:item.path,sha256:'',sourceVersion:undefined,declaredCount:Number.isFinite(Number(completeness.declared))?Number(completeness.declared):declaredFromCampaigns||undefined,
      includedCount:0,truncated:Boolean(completeness.truncated),state:'DATA_UNAVAILABLE'
    };
    const body=fs.readFileSync(file,'utf8');
    let parsed={};
    try{parsed=JSON.parse(body)}catch{return {id,path:item.path,sha256:sha256(body),includedCount:0,truncated:false,state:'ERROR'};}
    const actual=arr(parsed.tests).length;
    const declared=Number.isFinite(Number(completeness.declared))?Number(completeness.declared):(declaredFromCampaigns||actual);
    const included=Number.isFinite(Number(completeness.included))?Number(completeness.included):actual;
    const truncated=Boolean(completeness.truncated)||included<declared;
    return {
      id,path:item.path,sha256:sha256(body),sourceVersion:text(parsed.sourceVersion)||undefined,
      declaredCount:declared,includedCount:included,truncated,state:truncated?'PARTIAL':'READY'
    };
  }).sort((a,b)=>shardRank(a.id)-shardRank(b.id)||a.id.localeCompare(b.id,undefined,{numeric:true}));
}

export function loadScienceShardCatalog({scienceIndex={},dataDir}={}){
  const catalog=discoverScienceShards({scienceIndex,dataDir});
  const shards={};
  for(const descriptor of catalog){
    if(!['READY','PARTIAL'].includes(descriptor.state))continue;
    const file=path.join(dataDir,descriptor.path);
    shards[descriptor.id]=JSON.parse(fs.readFileSync(file,'utf8'));
  }
  return {catalog,shards};
}
