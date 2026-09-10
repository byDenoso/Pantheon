import {PROVIDERS} from '../src/contracts/validate.mjs';
import {compile} from './compiler/world-state.mjs';
import {buildProjectionBus} from './compiler/projection-bus.mjs';
import {buildSystemState} from './compiler/system-state.mjs';
import {projectAutomationHealthProviders} from './compiler/automation-health.mjs';
import {readProvider,pending,clearProviderCache} from './adapters/registry.mjs';
import {readSystemInput} from './adapters/system-input.mjs';
import {configured,authenticated,verifyPassword,makeSession,cookie,sameOrigin} from './auth/session.mjs';
import {verifyProjectionService} from './auth/vercel-oidc.mjs';
import {actionBroker} from './execution/broker.mjs';
import {safeActionError} from './execution/contracts.mjs';

const attempts=new Map();
const ATLAS_ORIGIN='https://nexo-atlas-control-tower.vercel.app';
const ACTION_ROUTES=new Set(['actions-plan','actions-execute','actions-readback']);
const ACTION_GET_ROUTES=new Set(['actions-recent','actions-capabilities']);

async function body(req,maxBytes=4096){
  let text='';
  for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text,'utf8')>maxBytes){const error=new Error('BODY_TOO_LARGE');error.code='BODY_TOO_LARGE';throw error;}}
  try{return JSON.parse(text||'{}');}catch{const error=new Error('INVALID_INTENT');error.code='INVALID_INTENT';throw error;}
}
function actionStatus(code){
  if(code==='AUTH_REQUIRED')return 401;
  if(code==='SCOPE_REQUIRED')return 403;
  if(code==='RATE_LIMITED')return 429;
  if(code==='BODY_TOO_LARGE')return 413;
  if(code==='INVALID_INTENT'||code==='TARGET_AMBIGUOUS')return 400;
  if(['CONFIRMATION_REQUIRED','CAPABILITY_BLOCKED','AUTHORITY_CONFLICT','IDEMPOTENCY_CONFLICT','READBACK_MISMATCH'].includes(code))return 409;
  if(code==='READBACK_TIMEOUT')return 504;
  if(code==='PROVIDER_REJECTED')return 502;
  return 503;
}

export function createHandler({broker=actionBroker,envProvider=()=>process.env,nowProvider=()=>Date.now()}={}){
  return async function handler(req,res){
    const env=envProvider(),now=nowProvider();
    res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Vary','Cookie, Authorization, Origin');
    const send=(value,status=200)=>{res.statusCode=status;res.end(JSON.stringify(value));};
    const url=new URL(req.url,'http://local'),route=url.searchParams.get('route')||url.pathname.split('/').pop(),privateAccess=authenticated(req,env,now),access=privateAccess?'PRIVATE':'PUBLIC';
    const origin=String(req.headers.origin||'');
    if(req.method==='GET'&&route==='world'&&origin===ATLAS_ORIGIN)res.setHeader('Access-Control-Allow-Origin',ATLAS_ORIGIN);
    try{
      if(route==='session'){
        if(req.method==='GET')return send({authenticated:privateAccess,configured:configured(env),access});
        if(!sameOrigin(req))return send({error:'ORIGIN_REJECTED'},403);
        if(req.method==='DELETE'){res.setHeader('Set-Cookie',cookie('',req,true));clearProviderCache();broker.clear?.();return send({authenticated:false});}
        if(req.method!=='POST')return send({error:'METHOD_NOT_ALLOWED'},405);
        if(!configured(env))return send({error:'AUTH_NOT_CONFIGURED'},503);
        const key='single-user';const window=attempts.get(key);if(window&&window.until>now&&window.count>=5)return send({error:'RATE_LIMITED'},429);
        const record=window&&window.until>now?window:{count:0,until:now+900000};record.count++;attempts.set(key,record);
        const input=await body(req,4096);if(typeof input.password!=='string'||input.password.length>256||!verifyPassword(input.password,env.NEXO_PASSWORD_HASH))return send({error:'INVALID_CREDENTIALS'},401);
        attempts.delete(key);res.setHeader('Set-Cookie',cookie(makeSession(env,now),req));return send({authenticated:true,configured:true,access:'PRIVATE'});
      }

      if(ACTION_ROUTES.has(route)){
        if(req.method!=='POST')return send({error:'METHOD_NOT_ALLOWED'},405);
        if(!privateAccess)return send({error:'AUTH_REQUIRED'},401);
        if(!sameOrigin(req))return send({error:'ORIGIN_REJECTED'},403);
        const input=await body(req,65536);
        if(route==='actions-plan')return send(await broker.planAction(input,{env}));
        if(route==='actions-execute'){
          if(!input.intent||typeof input.intent!=='object')return send({error:'INVALID_INTENT'},400);
          return send(await broker.executeAction(input.intent,{env,confirmed:input.confirmation||false}));
        }
        if(typeof input.receipt_id!=='string'||!input.receipt_id.trim())return send({error:'INVALID_INTENT'},400);
        return send(await broker.readbackAction(input.receipt_id.trim(),{env}));
      }

      if(ACTION_GET_ROUTES.has(route)){
        if(req.method!=='GET')return send({error:'METHOD_NOT_ALLOWED'},405);
        if(!privateAccess)return send({error:'AUTH_REQUIRED'},401);
        if(route==='actions-recent')return send({actions:broker.recentActions(50),access:'PRIVATE'});
        const result=await readProvider('nexo',{env,now,access:'PRIVATE',force:true,timeout:8000});
        if(result.provider.status!=='AVAILABLE'||!result.truthGraphInput)return send({error:result.provider.status==='AUTH_REQUIRED'?'AUTH_REQUIRED':'PROVIDER_UNAVAILABLE'},result.provider.status==='AUTH_REQUIRED'?401:503);
        const rows=result.truthGraphInput.capabilityRows||[];
        return send({capabilities:rows.map(row=>({capability_id:row.capability_id,domain:row.domain,runtime:row.runtime,operation:row.operation,status:row.status,last_tested_at:row.last_tested_at,evidence_pointer:row.evidence_pointer,readback:row.readback,risk_level:row.risk_level,fingerprint:row.fingerprint})),authority:result.truthGraphInput.authorityRows||[],source_ref:result.truthGraphInput.refs?.capability||null,access:'PRIVATE'});
      }

      if(req.method!=='GET')return send({error:'WRITES_DISABLED'},405);
      if(!['world','health','now','loops','day','context','recall','projections','system'].includes(route))return send({error:'NOT_FOUND'},404);
      const force=url.searchParams.get('refresh')==='1';
      if(route==='projections'){
        const serviceAccess=!privateAccess&&await verifyProjectionService(req,{now});
        const projectionAccess=privateAccess||serviceAccess?'PRIVATE':'PUBLIC';
        return send(await buildProjectionBus({env,now,access:projectionAccess,force}));
      }
      if(route==='system'){
        if(!privateAccess)return send({error:'AUTH_REQUIRED'},401);
        const options={now,access:'PRIVATE',env,force};
        const [results,systemInput]=await Promise.all([Promise.all(PROVIDERS.map(id=>readProvider(id,options))),readSystemInput({env})]);
        const compiled=compile(results,{now,access:'PRIVATE'}),byId=new Map(results.map(result=>[result.provider.id,result]));
        const world={...compiled,providers:[...compiled.providers,...projectAutomationHealthProviders(systemInput.automationHealth)]};
        const bus=await buildProjectionBus({env,now,access:'PRIVATE',force,reader:async id=>byId.get(id)||readProvider(id,options)});
        return send(buildSystemState({world,bus,systemInput,actions:broker.recentActions(50),now:new Date(now).toISOString()}));
      }
      const q=(url.searchParams.get('q')||'').trim().slice(0,200);
      if(route==='recall'&&!q)return send({error:'QUERY_REQUIRED'},400);
      const options={now,access,env,force};
      const selected=route==='recall'?['drive','gmail','github','nexo','atlas']:PROVIDERS;
      if(route==='world'&&url.searchParams.get('stream')==='1'){
        res.setHeader('Content-Type','application/x-ndjson; charset=utf-8');
        const results=new Map(PROVIDERS.map(id=>[id,pending(id,now)]));
        const emit=()=>{if(!res.destroyed)res.write(JSON.stringify(compile([...results.values()],{now,access}))+'\n');};
        emit();await Promise.all(selected.map(async id=>{results.set(id,await readProvider(id,options));emit();}));res.end();return;
      }
      const results=await Promise.all(selected.map(id=>readProvider(id,{...options,query:route==='recall'?q:''})));
      const world=compile(results,{now,access});
      const requiredProviders=world.providers.filter(p=>p.id!=='vercel');
      if(route==='health')return send({status:requiredProviders.every(p=>p.status==='AVAILABLE'&&!p.partial)?'HEALTHY':'DEGRADED',version:'0.1.0',contractVersion:'1',access,privateConfigured:configured(env),providers:world.providers,configuration:{session:configured(env),google:!!(env.GOOGLE_CONNECTOR||(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET&&env.GOOGLE_REFRESH_TOKEN)),nexo_sheet:!!env.NEXO_SHEET_ID,github_write:!!env.GITHUB_TOKEN,vercel_read:!!env.VERCEL_READ_TOKEN,vercel_write:!!env.VERCEL_WRITE_TOKEN,atlas:!!env.ATLAS_GRAPH_URL},generatedAt:world.generatedAt});
      if(route==='now')return send({...world,items:world.items.filter(x=>['ACT','ESCALATE'].includes(x.attention)).slice(0,3)});
      if(route==='loops')return send({...world,items:world.items.filter(x=>x.status)});
      if(route==='day')return send({...world,items:world.items.filter(x=>x.kind==='EVENT'||x.status==='NEEDS_ME')});
      if(route==='context')return send({...world,items:world.items.filter(x=>x.contextId===url.searchParams.get('id'))});
      if(route==='recall')return send({...world,query:q,items:world.items.filter(x=>`${x.title} ${x.summary||''} ${x.contextId||''}`.toLocaleLowerCase().includes(q.toLocaleLowerCase())||['drive','gmail','github'].includes(x.source))});
      return send(world);
    }catch(error){
      const code=error?.code||error?.message;
      if(code==='BODY_TOO_LARGE')return send({error:'BODY_TOO_LARGE'},413);
      if(code==='INVALID_INTENT')return send({error:'INVALID_INTENT'},400);
      if(code&&['AUTH_REQUIRED','SCOPE_REQUIRED','CAPABILITY_BLOCKED','AUTHORITY_CONFLICT','TARGET_AMBIGUOUS','RATE_LIMITED','PROVIDER_UNAVAILABLE','PROVIDER_REJECTED','READBACK_MISMATCH','READBACK_TIMEOUT','IDEMPOTENCY_CONFLICT','CONFIRMATION_REQUIRED'].includes(code))return send(safeActionError(error),actionStatus(code));
      return send({error:'REQUEST_FAILED'},500);
    }
  };
}

export default createHandler();
