import {readCanonicalDriveTowerBytes} from './drive-source-google.mjs';
import {validateCanonicalTowerIdentity,TOWER_ID} from '../server/mcp/operational-state.mjs';
import {compilePrivateTowerRuntime} from '../server/atlas/private-tower.mjs';
import {compilePrivateWorkspaceRuntime,privateWorkspaceTest} from '../server/atlas/private-workspace.mjs';
import {startGoogleLogin,finishGoogleLogin,readGoogleIdentity,revokeGoogleIdentity} from './google-oauth.mjs';
import {readOwner,readOwnerSession,ownerSessionRoute} from './redis-owner-session.mjs';

const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',Vary:'Cookie, Origin'};
const json=(body,status=200,extra={})=>Response.json(body,{status,headers:{...headers,...extra}});
const sameOrigin=(request,env)=>new URL(request.url).origin===env.NEXO_ATLAS_ORIGIN&&request.headers.get('origin')===env.NEXO_ATLAS_ORIGIN&&(!request.headers.get('sec-fetch-site')||request.headers.get('sec-fetch-site')==='same-origin');
async function body(request,limit=1024) {
  if ((request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='application/json') throw Error('INVALID_BODY');
  if (Number(request.headers.get('content-length'))>limit) throw Error('INVALID_BODY');
  const reader=request.body?.getReader(); if (!reader) throw Error('INVALID_BODY');
  let text='',length=0;const decoder=new TextDecoder();
  try {for (;;) {const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();throw Error('INVALID_BODY');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();} finally {reader.releaseLock();}
  const value=JSON.parse(text);if (!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_BODY');return value;
}
export function createVercelPrivate({store,fetcher=fetch,readBytes=readCanonicalDriveTowerBytes,asset}={}) {
  if (typeof store!=='function'||typeof asset!=='function') throw Error('PRIVATE_BACKEND_DEPENDENCY_MISSING');
  return async (request,env)=>{
    const path=new URL(request.url).pathname;
    try {
      if (path==='/api/auth/google') return await startGoogleLogin(request,env,store);
      if (path==='/api/auth/google/callback') return await finishGoogleLogin(request,env,store,fetcher);
      const identity=await readGoogleIdentity(request,env,store);
      if (path==='/api/atlas-access'&&request.method==='GET') {
        if(!identity)return json({signedIn:false,owner:false,setupRequired:false});
        const owner=await readOwner(identity,store);return json({signedIn:true,owner:true,setupRequired:owner.setupRequired});
      }
      if(!identity)return json({error:'AUTH_REQUIRED'},403);
      if(path==='/api/atlas-session'||path==='/api/atlas-pin/setup') {
        let payload={};if(request.method==='POST')try{payload=await body(request);}catch{return json({error:'INVALID_JSON'},400);}
        const result=await ownerSessionRoute(request,env,identity,store,payload,Date.now(),path==='/api/atlas-pin/setup');
        return json(result.body,result.status,result.setCookie?{'Set-Cookie':result.setCookie}:{});
      }
      if(path==='/api/auth/logout') {
        if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
        if(!sameOrigin(request,env))return json({error:'ORIGIN_NOT_ALLOWED'},403);
        return json({authenticated:false},200,{'Set-Cookie':await revokeGoogleIdentity(request,store)});
      }
      if(!await readOwnerSession(request,identity,store))return json({error:'AUTH_REQUIRED'},403);
      if(path==='/api/atlas-private/test') {
        if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
        if(!sameOrigin(request,env))return json({error:'ORIGIN_NOT_ALLOWED'},403);
        let args;try{args=await body(request,2048);}catch{return json({error:'PRIVATE_TEST_REQUEST_INVALID'},400);}
        if(Object.keys(args).some(key=>!['id','expected_revision'].includes(key))||typeof args.id!=='string'||!args.id.trim()||args.id.length>512||typeof args.expected_revision!=='string'||!/^sha256:[a-f0-9]{64}$/.test(args.expected_revision))return json({error:'PRIVATE_TEST_REQUEST_INVALID'},400);
        const {raw}=await readBytes(env,fetcher), tower=JSON.parse(raw.toString('utf8'));
        validateCanonicalTowerIdentity(tower,{file_id:TOWER_ID,body_verified:true});
        const result=privateWorkspaceTest(tower,args),current=await readGoogleIdentity(request,env,store);
        if(!current||!await readOwnerSession(request,current,store))return json({error:'AUTH_REQUIRED'},403);
        return json(result.body,result.status);
      }
      if(path==='/api/atlas-private') {
        if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
        if(!sameOrigin(request,env))return json({error:'ORIGIN_NOT_ALLOWED'},403);
        let args;try{args=await body(request);}catch{return json({error:'PRIVATE_REQUEST_INVALID'},400);}
        if(Object.keys(args).some(key=>key!=='profile')||args.profile!==undefined&&args.profile!=='workspace-v1')return json({error:'PRIVATE_REQUEST_INVALID'},400);
        const {raw,transport}=await readBytes(env,fetcher), tower=JSON.parse(raw.toString('utf8'));
        validateCanonicalTowerIdentity(tower,{file_id:TOWER_ID,body_verified:true});
        const value=args.profile==='workspace-v1'?compilePrivateWorkspaceRuntime(tower):compilePrivateTowerRuntime(tower);
        value.data.transport=transport;
        const current=await readGoogleIdentity(request,env,store);
        if(!current||!await readOwnerSession(request,current,store))return json({error:'AUTH_REQUIRED'},403);
        return json(value);
      }
      if(path==='/api/atlas-private-ui'||path.startsWith('/api/atlas-private-assets/')) {
        if(!['GET','HEAD'].includes(request.method))return json({error:'METHOD_NOT_ALLOWED'},405);
        const name=path==='/api/atlas-private-ui'?'index.html':path.slice('/api/atlas-private-assets/'.length);
        if(!/^[A-Za-z0-9_.\/-]+$/.test(name)||name.split('/').some(x=>x==='..'||x==='.'||!x))return json({error:'NOT_FOUND'},404);
        const file=await asset(name);if(!file)return json({error:'NOT_FOUND'},404);
        const current=await readGoogleIdentity(request,env,store);if(!current||!await readOwnerSession(request,current,store))return json({error:'AUTH_REQUIRED'},403);
        return new Response(request.method==='HEAD'?null:file.bytes,{headers:{...headers,'Content-Type':file.type,'X-Frame-Options':'SAMEORIGIN','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'"}});
      }
      return json({error:'NOT_FOUND'},404);
    } catch {return json({error:path.startsWith('/api/atlas-private')?'PRIVATE_SOURCE_UNAVAILABLE':'AUTH_UNAVAILABLE'},503);}
  };
}
