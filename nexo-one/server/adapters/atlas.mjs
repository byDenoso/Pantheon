import {json,requireEnv,item,ProviderError} from './http.mjs';
export function normalizeAtlas(data,{url,now}) {
  if(!Array.isArray(data.nodes)||!Array.isArray(data.edges)||!data.freshness||!data.source||!data.fingerprint)throw new ProviderError('UNAVAILABLE');
  const sourceTime=Number.isFinite(Date.parse(data.sourceVersion))?data.sourceVersion:null;
  return {revision:data.fingerprint,partial:!!(data.hasMore||data.truncated),items:data.nodes.map(n=>{
    const ref=new URL(url);ref.pathname=ref.pathname.replace(/\/api\/graph$/,'/');ref.search='';ref.searchParams.set('focus',n.id);
    const result=item('atlas',n.id,n.canonicalTitle||n.label||n.id,ref.href,now,{kind:'ENTITY',contextId:n.domain==='OLYMPUS'?'OLYMPUS':'COSMOLOGY',authority:'DERIVED',summary:n.summary||`${n.type||'Entidade'} · ${n.status||'Sem estado declarado'}`,sourceRevision:data.fingerprint});
    result.freshness.state=data.freshness==='LIVE'?'LIVE':data.freshness==='STALE'||data.freshness==='FALLBACK'?'STALE':'SNAPSHOT';
    if(sourceTime&&data.freshness!=='LIVE'){result.freshness.observedAt=sourceTime;result.observedAt=sourceTime;}
    return result;
  })};
}
export async function atlas({env,signal,now}) {
  requireEnv(env,'ATLAS_GRAPH_URL');
  return normalizeAtlas(await json(env.ATLAS_GRAPH_URL,{token:env.ATLAS_SOURCE_TOKEN,signal}),{url:env.ATLAS_GRAPH_URL,now});
}
