import {driveRoute,DRIVE_SSOT_META} from '../lib/drive-ssot.mjs';
import {loadLiveSsot,projectLiveRoute,syncLiveSsot} from '../lib/live-drive-ssot.mjs';
import {enhanceCockpitRoute} from '../lib/cockpit-projection.mjs';

const PUBLIC_SSOT_URL=process.env.NEXO_ATLAS_PUBLIC_SSOT_URL||'https://nexo-one-two.vercel.app/api/atlas-public-ssot';
function urlOf(req){return new URL(req.url||'/','https://atlas.local')}
function routeOf(req){const u=urlOf(req);return u.searchParams.get('route')||u.pathname.split('/').filter(Boolean).pop()||'health'}
function queryOf(req){const u=urlOf(req),q=Object.fromEntries(u.searchParams);delete q.route;return q}
function sendJson(res,value,status=200,{noStore=false}={}){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control',noStore?'private, no-store':'public, max-age=30, stale-while-revalidate=120');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Atlas-Authority','GOOGLE_DRIVE');return res.end(JSON.stringify(value))}
function validatePublicSnapshot(snapshot){if(snapshot?.contract!=='NEXO_ATLAS_SSOT_V1'||snapshot?.authority!=='GOOGLE_DRIVE'||snapshot?.projectionOnly!==true||snapshot?.access!=='PUBLIC_SANITIZED')throw new Error('INVALID_PUBLIC_ATLAS_SNAPSHOT');return snapshot}
async function publicLiveSnapshot(signal){const response=await fetch(PUBLIC_SSOT_URL,{headers:{Accept:'application/json'},signal});if(!response.ok)throw new Error(`PUBLIC_ATLAS_SSOT_HTTP_${response.status}`);return validatePublicSnapshot(await response.json())}

async function staticFallback(route,query,error){
 const fallback=await driveRoute(route,query,{method:'GET'});
 const issue={level:'WARN',type:'LIVE_SSOT_UNAVAILABLE',state:'SOURCE_UNAVAILABLE',detail:String(error?.message||error).slice(0,180)};
 if(Array.isArray(fallback?.issues))return {...fallback,degraded:[issue],issues:[...fallback.issues,issue],usedFallback:true};
 return {...fallback,degraded:[issue],usedFallback:true};
}

export default async function handler(req,res){
 const route=routeOf(req),query=queryOf(req),method=String(req.method||'GET').toUpperCase();
 if(method==='POST'&&route==='sync'){
  try{
   const {snapshot,diff}=await syncLiveSsot({req,signal:req.signal});
   const {changedSections,changedProjections}=diff;
   return sendJson(res,{ok:true,authority:'GOOGLE_DRIVE',projectionOnly:true,sourceFileId:snapshot.sourceFileId,sourceModifiedAt:snapshot.sourceModifiedAt,sourceFingerprint:snapshot.fingerprint,validation:'PASS',...diff,changedSections,changedProjections},200,{noStore:true});
  }catch(error){
   return sendJson(res,{ok:false,error:'LIVE_SSOT_UNAVAILABLE',detail:String(error?.message||error).slice(0,180),authority:'GOOGLE_DRIVE',projectionOnly:true,lastValidPreserved:true},503,{noStore:true});
  }
 }
 if(method!=='GET')return sendJson(res,{ok:false,error:'METHOD_NOT_ALLOWED',authority:'GOOGLE_DRIVE',sourceFileId:DRIVE_SSOT_META.sourceFileId},405,{noStore:true});
 if(route==='sync')return sendJson(res,{ok:false,error:'METHOD_NOT_ALLOWED',allowed:['POST'],authority:'GOOGLE_DRIVE'},405,{noStore:true});
 try{
  const live=await loadLiveSsot({req,force:query.refresh==='1',signal:req.signal});
  return sendJson(res,enhanceCockpitRoute(live,route,query,projectLiveRoute(live,route,query)));
 }catch(privateError){
  console.warn('[atlas:private-live-ssot]',route,String(privateError?.message||privateError));
  try{
   const live=await publicLiveSnapshot(req.signal);
   return sendJson(res,enhanceCockpitRoute(live,route,query,projectLiveRoute(live,route,query)));
  }catch(publicError){
   console.warn('[atlas:public-live-ssot]',route,String(publicError?.message||publicError));
   try{return sendJson(res,await staticFallback(route,query,publicError))}
   catch(fallbackError){
    const message=String(fallbackError?.message||fallbackError);
    const status=message.startsWith('DRIVE_ROUTE_UNSUPPORTED')?404:500;
    return sendJson(res,{ok:false,error:message,authority:'GOOGLE_DRIVE',projectionOnly:true},status);
   }
  }
 }
}
