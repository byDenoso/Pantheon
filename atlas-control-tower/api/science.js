import atlasHandler from './atlas.js';
import {readGithubAuthority} from '../lib/github-authority.mjs';
import {loadGithubCanonical} from '../lib/github-canonical-runtime.mjs';
import {projectGithubCanonical} from '../lib/github-canonical-projection.mjs';

function urlOf(req){return new URL(req.url||'/','https://atlas.local')}
function routeOf(req){const u=urlOf(req);return u.searchParams.get('route')||u.pathname.split('/').filter(Boolean).pop()||'graph'}
function queryOf(req){const u=urlOf(req),q=Object.fromEntries(u.searchParams);delete q.route;return q}
function sendJson(res,value,status=200){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Atlas-Authority','GITHUB');return res.end(JSON.stringify(value))}

export function assertScienceProjectionAuthorized(authority){
 const projection=authority?.scienceProjection;
 if(authority?.authority!=='GITHUB'||projection?.schema!=='science_v1'||projection?.role!=='PROJECTION_ONLY')throw new Error('SCIENCE_PROJECTION_NOT_AUTHORIZED');
 return projection;
}

function capture(){
 const headers=new Map();let body='';
 return {statusCode:200,setHeader:(k,v)=>headers.set(String(k).toLowerCase(),v),getHeader:k=>headers.get(String(k).toLowerCase()),end:chunk=>{if(chunk!=null)body+=String(chunk);return body},read:()=>({statusCode:this?.statusCode||200,body,headers})};
}

async function runAtlas(req){
 let statusCode=200,body='';const headers=new Map();
 const res={setHeader:(k,v)=>headers.set(String(k).toLowerCase(),v),getHeader:k=>headers.get(String(k).toLowerCase()),get statusCode(){return statusCode},set statusCode(v){statusCode=v},end:chunk=>{if(chunk!=null)body+=String(chunk);return body}};
 await atlasHandler(req,res);
 let value=null;try{value=body?JSON.parse(body):null}catch{throw new Error('SCIENCE_V1_INVALID_JSON')}
 if(statusCode>=400)throw new Error(`SCIENCE_V1_HTTP_${statusCode}:${value?.detail||value?.error||'UNKNOWN'}`);
 return value;
}

function decorate(authority,value){
 return {...value,source:'science-v1',freshness:'LIVE',authority:'GITHUB',controlAuthority:'GITHUB',projectionAuthority:'SCIENCE_V1',projectionOnly:true,scienceSchema:'science_v1',scienceProjection:authority.scienceProjection};
}

async function fallback(route,query,error){
 const state=await loadGithubCanonical();
 const value=projectGithubCanonical(state,route,query);
 const issue={level:'WARN',type:'SCIENCE_V1_UNAVAILABLE',state:'SOURCE_UNAVAILABLE',detail:String(error?.message||error).slice(0,180)};
 return {...value,freshness:'STALE',scienceFreshness:'UNAVAILABLE',usedFallback:true,lastValidPreserved:true,degraded:[issue],issues:[...(Array.isArray(value?.issues)?value.issues:[]),issue]};
}

export default async function handler(req,res){
 const method=String(req.method||'GET').toUpperCase(),route=routeOf(req),query=queryOf(req);
 if(method==='OPTIONS'){res.statusCode=204;return res.end()}
 if(method!=='GET'||!['graph','state','entity'].includes(route))return sendJson(res,{ok:false,error:'METHOD_OR_ROUTE_NOT_ALLOWED',authority:'GITHUB'},405);
 try{
  const authority=await readGithubAuthority({signal:req.signal});
  assertScienceProjectionAuthorized(authority);
  const value=await runAtlas(req);
  return sendJson(res,decorate(authority,value));
 }catch(error){
  console.warn('[atlas:science-v1]',route,String(error?.message||error));
  try{return sendJson(res,await fallback(route,query,error))}
  catch(fallbackError){return sendJson(res,{ok:false,error:'SCIENCE_V1_UNAVAILABLE',detail:String(fallbackError?.message||fallbackError).slice(0,180),authority:'GITHUB',lastValidPreserved:true},500)}
 }
}
