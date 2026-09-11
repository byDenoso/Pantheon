const DEFAULT_CANONICAL_API_ORIGIN='https://nexo-atlas-control-tower.vercel.app';

export function shouldProxyPreview(req){
  const oidc=req.headers?.['x-vercel-oidc-token']||process.env.VERCEL_OIDC_TOKEN||'';
  return process.env.VERCEL==='1'&&process.env.VERCEL_ENV!=='production'&&!oidc;
}

export async function proxyCanonicalPreview(req,res,route,query={}){
  const CANONICAL_API_ORIGIN=process.env.ATLAS_CANONICAL_API_ORIGIN||DEFAULT_CANONICAL_API_ORIGIN;
  const params=new URLSearchParams(Object.entries(query).filter(([,value])=>value!==undefined&&value!==null&&value!=='').map(([key,value])=>[key,String(value)]));
  const target=`${CANONICAL_API_ORIGIN}/api/${encodeURIComponent(route)}${params.size?`?${params}`:''}`;
  const upstream=await fetch(target,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
  const body=await upstream.text();
  res.statusCode=upstream.status;
  res.setHeader('Content-Type',upstream.headers.get('content-type')||'application/json; charset=utf-8');
  res.setHeader('Cache-Control','private, max-age=30');
  res.setHeader('X-Atlas-Preview-Source','canonical-ssot');
  return res.end(body);
}
