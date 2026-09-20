import {loadGithubCanonical,syncGithubCanonical} from '../lib/github-canonical-runtime.mjs';
import {projectGithubCanonical} from '../lib/github-canonical-projection.mjs';
import liveActivity from './live/activity.mjs';

const TRUTH_OWNER='byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06';
function urlOf(req){return new URL(req.url||'/','https://atlas.local')}
function routeOf(req){const u=urlOf(req);return u.searchParams.get('route')||u.pathname.split('/').filter(Boolean).pop()||'health'}
function queryOf(req){const u=urlOf(req),q=Object.fromEntries(u.searchParams);delete q.route;return q}
function towerize(value){
 if(Array.isArray(value))return value.map(towerize);
 if(!value||typeof value!=='object')return value;
 const out={};
 for(const [key,item] of Object.entries(value)){
  if(key==='authority')out[key]='TOWER_V06';
  else if(key==='source'&&item==='github')out[key]='tower';
  else out[key]=towerize(item);
 }
 if(!('truthOwner' in out))out.truthOwner=TRUTH_OWNER;
 if(!('projectionOnly' in out))out.projectionOnly=true;
 return out;
}
function sendJson(res,value,status=200,{noStore=false}={}){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control',noStore?'private, no-store':'public, max-age=30, stale-while-revalidate=120');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Atlas-Authority','TOWER_V06');res.setHeader('X-Atlas-Truth-Owner',TRUTH_OWNER);return res.end(JSON.stringify(towerize(value)))}
export default async function handler(req,res){
 const route=routeOf(req),query=queryOf(req),method=String(req.method||'GET').toUpperCase();
 if(route==='live-activity')return liveActivity(req,res);
 if(method==='POST'&&route==='sync'){
  try{const {state,diff}=await syncGithubCanonical({signal:req.signal}),canonical=state.authority;return sendJson(res,{ok:true,authority:'TOWER_V06',truthOwner:canonical.truthOwner||TRUTH_OWNER,projectionAuthority:'TOWER_V06',canonicalContract:canonical.contract,canonicalRef:canonical.ref,canonicalRepository:canonical.repository,canonicalControlPath:canonical.controlPath,sourceFingerprint:state.fingerprint,validation:'PASS',changedSections:[],...diff},200,{noStore:true})}
  catch(error){return sendJson(res,{ok:false,error:'TOWER_PROJECTION_UNAVAILABLE',detail:String(error?.message||error).slice(0,180),authority:'TOWER_V06',truthOwner:TRUTH_OWNER,lastValidPreserved:true},503,{noStore:true})}
 }
 if(method!=='GET')return sendJson(res,{ok:false,error:'METHOD_NOT_ALLOWED',authority:'TOWER_V06'},405,{noStore:true});
 if(route==='sync')return sendJson(res,{ok:false,error:'METHOD_NOT_ALLOWED',allowed:['POST'],authority:'TOWER_V06'},405,{noStore:true});
 try{const state=await loadGithubCanonical({force:query.refresh==='1',signal:req.signal});return sendJson(res,projectGithubCanonical(state,route,query))}
 catch(error){console.warn('[atlas:tower-projection]',route,String(error?.message||error));return sendJson(res,{ok:false,error:'TOWER_PROJECTION_UNAVAILABLE',detail:String(error?.message||error).slice(0,180),authority:'TOWER_V06',truthOwner:TRUTH_OWNER,projectionOnly:true,lastValidPreserved:true},503,{noStore:true})}
}
