import {PROVIDERS} from '../src/contracts/validate.mjs';
import {compile} from './compiler/world-state.mjs';
import {buildProjectionBus} from './compiler/projection-bus.mjs';
import {buildSystemState} from './compiler/system-state.mjs';
import {readProvider,pending} from './adapters/registry.mjs';
import {readAtlasSsot} from './adapters/atlas-ssot.mjs';
import {buildPublicAtlasSsot} from './compiler/atlas-public-ssot.mjs';
import {verifyProjectionService} from './auth/vercel-oidc.mjs';
const ATLAS_ORIGIN='https://nexo-atlas-control-tower.vercel.app';
const PUBLIC_SYSTEM_PROVIDERS=['github','nexo'];
export default async function handler(req,res) {
  const env=process.env,now=Date.now();
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Vary','Authorization, Origin');
  const send=(value,status=200)=>{res.statusCode=status;res.end(JSON.stringify(value));};
  const url=new URL(req.url,'http://local'),route=url.searchParams.get('route')||url.pathname.split('/').pop(),access='PUBLIC';
  const origin=String(req.headers.origin||'');
  if(req.method==='GET'&&route==='world'&&origin===ATLAS_ORIGIN)res.setHeader('Access-Control-Allow-Origin',ATLAS_ORIGIN);
  try{
    if(req.method!=='GET')return send({error:'WRITES_DISABLED'},405);
    if(route==='session')return send({authenticated:false,configured:false,access:'PUBLIC',mode:'PUBLIC_READ_ONLY'});
    if(route==='atlas-public-ssot')return send(buildPublicAtlasSsot(await readAtlasSsot({env,now,signal:req.signal})));
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
    if(route==='health')return send({status:requiredProviders.every(p=>p.status==='AVAILABLE'&&!p.partial)?'HEALTHY':'DEGRADED',version:'0.1.0',contractVersion:'1',access,privateConfigured:false,providers:world.providers,generatedAt:world.generatedAt});
    if(route==='now')return send({...world,items:world.items.filter(x=>['ACT','ESCALATE'].includes(x.attention)).slice(0,3)});
    if(route==='loops')return send({...world,items:world.items.filter(x=>x.status)});
    if(route==='day')return send({...world,items:world.items.filter(x=>x.kind==='EVENT'||x.status==='NEEDS_ME')});
    if(route==='context')return send({...world,items:world.items.filter(x=>x.contextId===url.searchParams.get('id'))});
    if(route==='recall')return send({...world,query:q,items:world.items.filter(x=>`${x.title} ${x.summary||''} ${x.contextId||''}`.toLocaleLowerCase().includes(q.toLocaleLowerCase())||['drive','gmail','github'].includes(x.source))});
    return send(world);
  }catch(error){console.error('[nexo-one]',route,String(error?.message||error));return send({error:'REQUEST_FAILED'},500);}
}
