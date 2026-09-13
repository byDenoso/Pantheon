import {driveRoute} from '../lib/drive-ssot.mjs';
import {loadGithubCanonical,syncGithubCanonical} from '../lib/github-canonical-runtime.mjs';
import {projectGithubCanonical} from '../lib/github-canonical-projection.mjs';

function urlOf(req){return new URL(req.url||'/','https://atlas.local')}
function routeOf(req){const u=urlOf(req);return u.searchParams.get('route')||u.pathname.split('/').filter(Boolean).pop()||'health'}
function queryOf(req){const u=urlOf(req),q=Object.fromEntries(u.searchParams);delete q.route;return q}
function sendJson(res,value,status=200,{noStore=false}={}){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control',noStore?'private, no-store':'public, max-age=30, stale-while-revalidate=120');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Atlas-Authority','GITHUB');return res.end(JSON.stringify(value))}
async function fallback(route,query,error){const value=await driveRoute(route,query,{method:'GET'}),issue={level:'WARN',type:'GITHUB_CANONICAL_UNAVAILABLE',state:'STALE',detail:String(error?.message||error).slice(0,180)};return {...value,authority:'GITHUB',source:'github',projectionAuthority:value.authority||'GOOGLE_DRIVE',freshness:'STALE',degraded:[issue],issues:[...(Array.isArray(value?.issues)?value.issues:[]),issue],usedFallback:true,lastValidPreserved:true}}

export default async function handler(req,res){
 const route=routeOf(req),query=queryOf(req),method=String(req.method||'GET').toUpperCase();
 if(method==='POST'&&route==='sync'){
  try{const {state,diff}=await syncGithubCanonical({signal:req.signal}),canonical=state.authority;return sendJson(res,{ok:true,authority:'GITHUB',projectionAuthority:state.payload?.meta?.authority||'PROJECTION',canonicalContract:canonical.contract,canonicalRef:canonical.ref,canonicalRepository:canonical.repository,sourceFingerprint:state.fingerprint,validation:'PASS',changedSections:[],...diff},200,{noStore:true})}
  catch(error){return sendJson(res,{ok:false,error:'GITHUB_CANONICAL_UNAVAILABLE',detail:String(error?.message||error).slice(0,180),authority:'GITHUB',lastValidPreserved:true},503,{noStore:true})}
 }
 if(method!=='GET')return sendJson(res,{ok:false,error:'METHOD_NOT_ALLOWED',authority:'GITHUB'},405,{noStore:true});
 if(route==='sync')return sendJson(res,{ok:false,error:'METHOD_NOT_ALLOWED',allowed:['POST'],authority:'GITHUB'},405,{noStore:true});
 try{const state=await loadGithubCanonical({force:query.refresh==='1',signal:req.signal});return sendJson(res,projectGithubCanonical(state,route,query))}
 catch(error){console.warn('[atlas:github-canonical]',route,String(error?.message||error));try{return sendJson(res,await fallback(route,query,error))}catch(fallbackError){const message=String(fallbackError?.message||fallbackError);return sendJson(res,{ok:false,error:message,authority:'GITHUB',lastValidPreserved:true},/UNSUPPORTED/.test(message)?404:500)}}
}
