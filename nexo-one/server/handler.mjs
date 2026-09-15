import {toNodeHandler} from '@modelcontextprotocol/node';
import {PROVIDERS} from '../src/contracts/validate.mjs';
import {compile} from './compiler/world-state.mjs';
import {buildProjectionBus} from './compiler/projection-bus.mjs';
import {buildSystemState} from './compiler/system-state.mjs';
import {readProvider,pending} from './adapters/registry.mjs';
import {readAtlasSsot} from './adapters/atlas-ssot.mjs';
import {buildPublicAtlasSsot} from './compiler/atlas-public-ssot.mjs';
import {buildAtlasResearchView,RESEARCH_ROUTES} from './compiler/atlas-research-api.mjs';
import {verifyProjectionService} from './auth/vercel-oidc.mjs';
import {sameOrigin} from './auth/session.mjs';
import {sessionAccess,sessionRoute} from './auth/session-route.mjs';
import {buildPersonalSnapshot,executePersonalAction} from './personal/service.mjs';
import {createNexoMcpWebHandler} from './mcp/server.mjs';
import {summarizeConnectionHealth} from './health/connection-state.mjs';
const ATLAS_ORIGINS=new Set(['https://bydenoso.github.io','https://nexo-atlas-control-tower.vercel.app','https://nexo-atlas-cockpit.vercel.app']);
const PUBLIC_SYSTEM_PROVIDERS=['github','nexo'];
const isCorsRoute=route=>route==='mcp'||route==='atlas-public-ssot'||route==='world'||RESEARCH_ROUTES.has(route);
const mcpWebHandler=createNexoMcpWebHandler({readSnapshot:()=>readAtlasSsot({env:process.env,now:Date.now()})});
const mcpNodeHandler=toNodeHandler(mcpWebHandler);
async function requestBody(req){
  if(req.body&&typeof req.body==='object'&&!Buffer.isBuffer(req.body))return req.body;
  if(typeof req.body==='string'){try{return JSON.parse(req.body);}catch{return {};}}
  if(!req||typeof req[Symbol.asyncIterator]!=='function')return {};
  let raw='';for await(const chunk of req){raw+=Buffer.from(chunk).toString('utf8');if(raw.length>65536)throw new Error('REQUEST_BODY_TOO_LARGE');}
  if(!raw.trim())return {};try{return JSON.parse(raw);}catch{throw new Error('INVALID_JSON');}
}
function personalError(error){
  const code=String(error?.message||error||'REQUEST_FAILED');
  if(code==='PERSONAL_ACTION_DENIED')return [code,403];
  if(['APPROVAL_MISMATCH','STALE_PROPOSAL','EFFECT_RESERVATION_CONFLICT','CAPABILITY_PASS_ROUTE_NOT_FOUND'].some(value=>code.includes(value)))return [code,409];
  if(['PERSONAL_ACTION_INPUT_REQUIRED','PERSONAL_ACTION_NOT_EXECUTABLE','INVALID_JSON','REQUEST_BODY_TOO_LARGE'].includes(code))return [code,400];
  if(code.includes('AUTH_REQUIRED'))return ['AUTH_REQUIRED',401];
  return ['REQUEST_FAILED',500];
}
export default async function handler(req,res) {
  const env=process.env,now=Date.now();
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Vary','Authorization, Origin, Cookie');
  const send=(value,status=200)=>{res.statusCode=status;res.end(JSON.stringify(value));};
  const url=new URL(req.url,'http://local'),path=url.pathname.replace(/\/+$/,''),route=url.searchParams.get('route')||(path.endsWith('/personal/action')?'personal-action':path.split('/').pop());
  const privateAccess=sessionAccess(req,env,now),access=privateAccess?'PRIVATE':'PUBLIC';
  const origin=String(req.headers.origin||'');
  if(ATLAS_ORIGINS.has(origin)&&isCorsRoute(route)){
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
    if(route==='mcp')res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Accept,Content-Type,Mcp-Protocol-Version');
  }
  if(req.method==='OPTIONS'&&ATLAS_ORIGINS.has(origin)&&isCorsRoute(route)){res.statusCode=204;return res.end();}
  try{
    if(route==='mcp'){
      if(origin&&!ATLAS_ORIGINS.has(origin))return send({error:'ORIGIN_NOT_ALLOWED'},403);
      return mcpNodeHandler(req,res);
    }
    if(route==='session'){
      const decision=sessionRoute(req,env,now,await requestBody(req));
      if(decision.setCookie)res.setHeader('Set-Cookie',decision.setCookie);
      return send(decision.body,decision.status);
    }
    if(route==='personal'){
      if(req.method!=='GET')return send({error:'METHOD_NOT_ALLOWED'},405);
      if(!privateAccess)return send({error:'AUTH_REQUIRED'},401);
      return send(await buildPersonalSnapshot({env,now,reader:readProvider}));
    }
    if(route==='personal-action'){
      if(req.method!=='POST')return send({error:'METHOD_NOT_ALLOWED'},405);
      if(!privateAccess)return send({error:'AUTH_REQUIRED'},401);
      if(!sameOrigin(req))return send({error:'ORIGIN_NOT_ALLOWED'},403);
      try{const body=await requestBody(req);return send(await executePersonalAction({env,now:new Date(now).toISOString(),signal:req.signal,proposal:body.proposal,approval:body.approval}));}
      catch(error){const [code,status]=personalError(error);return send({error:code},status);}
    }
    if(req.method!=='GET')return send({error:'WRITES_DISABLED'},405);
    if(route==='atlas-public-ssot')return send(buildPublicAtlasSsot(await readAtlasSsot({env,now,signal:req.signal})));
    if(RESEARCH_ROUTES.has(route)){
      let snapshot=null;
      try{snapshot=await readAtlasSsot({env,now,signal:req.signal});}
      catch(error){
        const code=String(error?.code||error?.name||error?.message||'');
        if(!['AUTH_REQUIRED','RATE_LIMITED','UNAVAILABLE','TIMEOUT','AbortError','ABORT_ERR'].includes(code))throw error;
      }
      return send(buildAtlasResearchView(snapshot,route));
    }
    if(route==='atlas-ssot'){
      const serviceAccess=await verifyProjectionService(req,{now});
      if(!serviceAccess)return send({error:'ATLAS_SERVICE_REQUIRED'},403);
      return send(await readAtlasSsot({env,now,signal:req.signal}));
    }
    if(!['world','health','now','loops','day','context','recall','projections','system'].includes(route))return send({error:'NOT_FOUND'},404);
    const force=url.searchParams.get('refresh')==='1';
    if(route==='projections'){
      const serviceAccess=await verifyProjectionService(req,{now});
      const projectionAccess=serviceAccess?'PRIVATE':'PUBLIC';
      return send(await buildProjectionBus({env,now,access:projectionAccess,force}));
    }
    if(route==='system'){
      const options={now,access:'PUBLIC',env,force};
      const results=await Promise.all(PUBLIC_SYSTEM_PROVIDERS.map(id=>readProvider(id,options)));
      const compiled=compile(results,{now,access:'PUBLIC'}),byId=new Map(results.map(result=>[result.provider.id,result]));
      const truthGraphInput=byId.get('nexo')?.truthGraphInput;
      const systemInput={actions:[],executionRuns:[],sideQuests:[],capabilities:truthGraphInput?.capabilityRows||[],semanticMemory:[],proceduralMemory:[],learningFilaments:[],automationHealth:[]};
      const bus=await buildProjectionBus({env,now,access:'PUBLIC',force,reader:async id=>byId.get(id)||readProvider(id,options)});
      return send(buildSystemState({world:compiled,bus,systemInput,now:new Date(now).toISOString()}));
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
    if(route==='health'){
      const connectionHealth=summarizeConnectionHealth({env,providers:world.providers,access});
      return send({status:requiredProviders.every(p=>p.status==='AVAILABLE'&&!p.partial)?'HEALTHY':'DEGRADED',version:'0.1.0',contractVersion:'1',access,privateConfigured:connectionHealth.session.configured,sessionConfigured:connectionHealth.session.configured,connections:connectionHealth.connections,providers:world.providers,generatedAt:world.generatedAt});
    }
    if(route==='now')return send({...world,items:world.items.filter(x=>['ACT','ESCALATE'].includes(x.attention)).slice(0,3)});
    if(route==='loops')return send({...world,items:world.items.filter(x=>x.status)});
    if(route==='day')return send({...world,items:world.items.filter(x=>x.kind==='EVENT'||x.status==='NEEDS_ME')});
    if(route==='context')return send({...world,items:world.items.filter(x=>x.contextId===url.searchParams.get('id'))});
    if(route==='recall')return send({...world,query:q,items:world.items.filter(x=>`${x.title} ${x.summary||''} ${x.contextId||''}`.toLocaleLowerCase().includes(q.toLocaleLowerCase())||['drive','gmail','github'].includes(x.source))});
    return send(world);
  }catch(error){console.error('[nexo-one]',route,String(error?.message||error));return send({error:'REQUEST_FAILED'},500);}
}
