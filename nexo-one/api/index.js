import handler from '../server/handler.mjs';
import {LIVE_CANARY_BRANCH,runLiveVercelFallbackCanary} from '../server/executor/live-canary.mjs';

export default async function canaryAwareHandler(req,res){
  const url=new URL(req.url,'http://local');
  const route=url.searchParams.get('route')||url.pathname.replace(/\/+$/,'').split('/').pop();
  if(route!=='failover-canary')return handler(req,res);
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.statusCode=405;return res.end(JSON.stringify({error:'METHOD_NOT_ALLOWED'}));}
  if(process.env.VERCEL_GIT_COMMIT_REF!==LIVE_CANARY_BRANCH){res.statusCode=404;return res.end(JSON.stringify({error:'NOT_FOUND'}));}
  try{
    const result=await runLiveVercelFallbackCanary({env:process.env});
    res.statusCode=200;
    return res.end(JSON.stringify(result));
  }catch(error){
    console.error('[nexo-failover-canary]',String(error?.message||error));
    res.statusCode=500;
    return res.end(JSON.stringify({error:String(error?.message||'CANARY_FAILED')}));
  }
}
