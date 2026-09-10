import {createHash} from 'node:crypto';

const CONTRACT='ProjectionEnvelope/v1';
const BUS='Pantheon/UniversalProjectionBus';
const DEFAULT_URL='https://nexo-one-two.vercel.app/api/projections';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,16).toUpperCase();

export async function fetchProjection({url=process.env.NEXO_ONE_PROJECTION_URL||DEFAULT_URL,fetcher=fetch,signal}={}){
  const checkedAt=new Date().toISOString();
  try{
    const response=await fetcher(url,{method:'GET',headers:{Accept:'application/json'},signal});
    if(!response.ok)throw new Error(`HTTP_${response.status}`);
    const body=await response.json();
    if(body?.contract!==CONTRACT||body?.bus!==BUS||typeof body?.fingerprint!=='string'||!Array.isArray(body?.envelopes))throw new Error('INVALID_PROJECTION_CONTRACT');
    return {...body,consumer:'ATLAS',projection_role:'NON_AUTHORITATIVE',upstream:{source_ref:url,checked_at:checkedAt,state:'LIVE'}};
  }catch(error){
    const code=String(error?.message||error||'SOURCE_UNAVAILABLE').slice(0,120);
    const envelope={
      entity_id:'source:universal-projection-bus',domain:'SYSTEM',authority_class:'DERIVED',source_ref:url,
      source_revision:'UNAVAILABLE',fingerprint:'PRJ-'+digest({url,code}),freshness:{state:'UNKNOWN',observed_at:null,expires_at:null,age_ms:null},
      derivation_rule:'atlas:upstream-projection-read',state:'DEGRADED',source:'NEXO_SSOT',checked_at:checkedAt,projection_role:'NON_AUTHORITATIVE',
      error:{code:'SOURCE_UNAVAILABLE',message:code}
    };
    return {contract:CONTRACT,bus:BUS,fingerprint:'BUS-'+digest([envelope.fingerprint]),generated_at:checkedAt,state:'DEGRADED',sources:[],envelopes:[envelope],consumer:'ATLAS',projection_role:'NON_AUTHORITATIVE',upstream:{source_ref:url,checked_at:checkedAt,state:'DEGRADED'}};
  }
}

export default async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','private, max-age=30, stale-while-revalidate=60');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.statusCode=405;return res.end(JSON.stringify({error:'METHOD_NOT_ALLOWED'}));}
  const result=await fetchProjection();
  res.statusCode=200;
  return res.end(JSON.stringify(result));
}
