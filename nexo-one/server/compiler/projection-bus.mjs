import {hash} from './world-state.mjs';
import {readProvider} from '../adapters/registry.mjs';

export const PROJECTION_CONTRACT='ProjectionEnvelope/v1';
export const BUS_ID='Pantheon/UniversalProjectionBus';
const SOURCES=[
  {id:'NEXO_SSOT',provider:'nexo',match:x=>x.kind!=='ACTION',rule:'nexo-ssot:item->projection'},
  {id:'ACTION_REGISTER',provider:'nexo',match:x=>x.kind==='ACTION',rule:'action-register:item->projection'},
  {id:'GITHUB',provider:'github',match:()=>true,rule:'github:item->projection'},
  {id:'VERCEL',provider:'vercel',match:()=>true,rule:'vercel:item->projection'}
];

function iso(ms){return new Date(ms).toISOString();}
function domainOf(item){return item.contextId||'SYSTEM';}
function freshnessOf(item,now){
  const observed=item?.freshness?.observedAt||item.observedAt||null;
  const expires=item?.freshness?.expiresAt||null;
  const age=observed&&Number.isFinite(Date.parse(observed))?Math.max(0,now-Date.parse(observed)):null;
  const state=item?.freshness?.state||'UNKNOWN';
  return {state,observed_at:observed,expires_at:expires,age_ms:age};
}
function stateOf(item,provider,now){
  if(provider.status!=='AVAILABLE')return 'DEGRADED';
  if(item?.status==='BLOCKED')return 'BLOCKED';
  const expires=Date.parse(item?.freshness?.expiresAt||'');
  if(item?.freshness?.state==='STALE'||(Number.isFinite(expires)&&expires<now))return 'STALE';
  return item?.freshness?.state==='SNAPSHOT'?'SNAPSHOT':'LIVE';
}
function revisionOf(item,provider){return String(item?.sourceRevision||provider.revision||'UNREVISIONED');}
function semanticPayload(item){
  const {freshness,observedAt,attention,attentionReason,...rest}=item;
  return rest;
}
function envelopeFor(source,item,provider,now){
  const sourceRevision=revisionOf(item,provider);
  const payload=semanticPayload(item);
  const fingerprint='PRJ-'+hash({source:source.id,entity:item.id,sourceRevision,payload});
  return {
    entity_id:item.id,
    domain:domainOf(item),
    authority_class:item.authority||'DERIVED',
    source_ref:item.sourceRef||source.id,
    source_revision:sourceRevision,
    fingerprint,
    freshness:freshnessOf(item,now),
    derivation_rule:source.rule,
    state:stateOf(item,provider,now),
    source:source.id,
    checked_at:provider.checkedAt||iso(now),
    projection_role:'NON_AUTHORITATIVE',
    payload
  };
}
function degradedEnvelope(source,provider,now){
  const sourceRevision=String(provider.revision||'UNAVAILABLE');
  const code=provider.status||'UNAVAILABLE';
  const body={source:source.id,provider:source.provider,code,sourceRevision,checkedAt:provider.checkedAt||iso(now)};
  return {
    entity_id:`source:${source.id.toLowerCase()}`,
    domain:'SYSTEM',
    authority_class:'DERIVED',
    source_ref:source.provider,
    source_revision:sourceRevision,
    fingerprint:'PRJ-'+hash(body),
    freshness:{state:'UNKNOWN',observed_at:provider.lastSuccessAt||null,expires_at:null,age_ms:provider.lastSuccessAt?Math.max(0,now-Date.parse(provider.lastSuccessAt)):null},
    derivation_rule:`${source.rule}:source-health`,
    state:'DEGRADED',
    source:source.id,
    checked_at:provider.checkedAt||iso(now),
    projection_role:'NON_AUTHORITATIVE',
    error:{code,message:provider.message||'Fonte indisponível; sem fallback silencioso.'}
  };
}
function aggregateState(envelopes){
  if(envelopes.some(x=>x.state==='DEGRADED'))return 'DEGRADED';
  if(envelopes.some(x=>x.state==='BLOCKED'))return 'BLOCKED';
  if(envelopes.some(x=>x.state==='STALE'))return 'STALE';
  if(envelopes.some(x=>x.state==='SNAPSHOT'))return 'SNAPSHOT';
  return 'LIVE';
}

export async function buildProjectionBus({env=process.env,now=Date.now(),access='PRIVATE',force=false,reader=readProvider}={}){
  const providerIds=[...new Set(SOURCES.map(x=>x.provider))];
  const results=await Promise.all(providerIds.map(id=>reader(id,{env,now,access,force})));
  const byId=new Map(results.map(r=>[r.provider.id,r]));
  const envelopes=[],sources=[];
  for(const source of SOURCES){
    const result=byId.get(source.provider);
    const provider=result?.provider||{id:source.provider,status:'UNAVAILABLE',checkedAt:iso(now),lastSuccessAt:null,revision:null,message:'Fonte não retornou estado.'};
    const matched=(result?.items||[]).filter(source.match);
    if(provider.status!=='AVAILABLE') envelopes.push(...(matched.length?matched.map(item=>envelopeFor(source,item,provider,now)):[degradedEnvelope(source,provider,now)]));
    else envelopes.push(...matched.map(item=>envelopeFor(source,item,provider,now)));
    sources.push({id:source.id,state:provider.status==='AVAILABLE'?(matched.some(x=>stateOf(x,provider,now)==='STALE')?'STALE':'LIVE'):'DEGRADED',revision:String(provider.revision||'UNREVISIONED'),count:matched.length});
  }
  envelopes.sort((a,b)=>a.source.localeCompare(b.source)||a.entity_id.localeCompare(b.entity_id));
  const fingerprint='BUS-'+hash(envelopes.map(x=>({entity_id:x.entity_id,source:x.source,source_revision:x.source_revision,fingerprint:x.fingerprint,state:x.state})));
  return {contract:PROJECTION_CONTRACT,bus:BUS_ID,fingerprint,generated_at:iso(now),state:aggregateState(envelopes),sources,envelopes};
}
