import {createHash} from 'node:crypto';

const text=value=>String(value??'').trim();
const arr=value=>Array.isArray(value)?value:[];
const HASH_FIELDS=['id','primaryCampaign','domains','status','summary','keyMetrics','evidenceClass','sourceRef','lastVerified'];
const SET_FIELDS=new Set(['domains']);

function canonicalize(value){
  if(Array.isArray(value))return value.map(canonicalize);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonicalize(value[key])]));
  return value;
}

function hashProjection(record={}){
  const picked={};
  for(const key of HASH_FIELDS){
    const value=record[key];
    if(value===undefined||value===null||value==='')continue;
    picked[key]=SET_FIELDS.has(key)?arr(value).map(text).filter(Boolean).sort():value;
  }
  return canonicalize(picked);
}

export function canonicalRecordHash(record={}){
  const body=JSON.stringify(hashProjection(record));
  return `sha256:${createHash('sha256').update(body).digest('hex')}`;
}

const membershipOf=record=>({
  campaignId:text(record?.primaryCampaign)||undefined,
  domains:arr(record?.domains).map(text).filter(Boolean).sort()
});
const sameMembership=(a,b)=>text(a?.campaignId)===text(b?.campaignId)&&JSON.stringify(arr(a?.domains).map(text).filter(Boolean).sort())===JSON.stringify(arr(b?.domains).map(text).filter(Boolean).sort());

function delta(eventType,entry,observedAt,{previousHash,currentHash}={}){
  return {
    eventType,
    entityId:entry.entityId,
    entityType:entry.entityType,
    observedAt,
    ...(previousHash?{previousHash}:{}),
    ...(currentHash?{currentHash}:{}),
    revision:entry.revision,
    ...(entry.campaignId?{campaignId:entry.campaignId}:{}),
    domains:[...entry.domains]
  };
}

export function diffProjection({previousLedger=[],currentRecords=[],observedAt}={}){
  if(!text(observedAt))throw new Error('PROJECTION_OBSERVED_AT_REQUIRED');
  const previous=new Map(arr(previousLedger).filter(x=>text(x?.entityId)).map(x=>[text(x.entityId),x]));
  const seen=new Set();
  const ledger=[];
  const deltas=[];

  for(const record of arr(currentRecords)){
    const entityId=text(record?.id);
    if(!entityId)continue;
    seen.add(entityId);
    const entityType=text(record?.type||record?.entityType||'TEST').toUpperCase()||'TEST';
    const currentHash=canonicalRecordHash(record);
    const membership=membershipOf(record);
    const prev=previous.get(entityId);
    const wasPublished=prev&&prev.state!=='UNPUBLISHED';
    const changed=!wasPublished||prev.currentHash!==currentHash;
    const relinked=Boolean(wasPublished&&!sameMembership(prev,membership));
    const revision=wasPublished?(changed?Number(prev.revision||0)+1:Number(prev.revision||1)):Number(prev?.revision||0)+1;
    const entry={
      entityId,entityType,
      firstSeenAt:prev?.firstSeenAt||observedAt,
      lastSeenAt:observedAt,
      ...(text(prev?.sourceCreatedAt||record?.sourceCreatedAt)?{sourceCreatedAt:text(prev?.sourceCreatedAt||record?.sourceCreatedAt)}:{}),
      ...(text(record?.sourceUpdatedAt||record?.lastVerified||prev?.sourceUpdatedAt)?{sourceUpdatedAt:text(record?.sourceUpdatedAt||record?.lastVerified||prev?.sourceUpdatedAt)}:{}),
      firstHash:prev?.firstHash||currentHash,
      currentHash,
      ...(changed&&prev?.currentHash?{previousHash:prev.currentHash}:prev?.previousHash?{previousHash:prev.previousHash}:{}),
      revision,
      ...(membership.campaignId?{campaignId:membership.campaignId}:{}),
      domains:membership.domains,
      state:'PUBLISHED'
    };
    ledger.push(entry);
    if(!wasPublished)deltas.push(delta('ADDED',entry,observedAt,{currentHash}));
    else if(changed){
      deltas.push(delta('UPDATED',entry,observedAt,{previousHash:prev.currentHash,currentHash}));
      if(relinked)deltas.push(delta('RELINKED',entry,observedAt,{previousHash:prev.currentHash,currentHash}));
    }
  }

  for(const prev of previous.values()){
    if(seen.has(text(prev.entityId))||prev.state==='UNPUBLISHED')continue;
    const entry={...prev,lastSeenAt:observedAt,previousHash:prev.currentHash,revision:Number(prev.revision||0)+1,state:'UNPUBLISHED'};
    ledger.push(entry);
    deltas.push(delta('UNPUBLISHED',entry,observedAt,{previousHash:prev.currentHash}));
  }

  ledger.sort((a,b)=>a.entityId.localeCompare(b.entityId));
  deltas.sort((a,b)=>a.entityId.localeCompare(b.entityId)||['ADDED','UPDATED','RELINKED','UNPUBLISHED'].indexOf(a.eventType)-['ADDED','UPDATED','RELINKED','UNPUBLISHED'].indexOf(b.eventType));
  return {ledger,deltas};
}
