import {PROVIDERS} from '../src/contracts/validate.mjs';
import {compile} from './compiler/world-state.mjs';
import {buildProjectionBus} from './compiler/projection-bus.mjs';
import {readProvider,pending,clearProviderCache} from './adapters/registry.mjs';
import {configured,authenticated,verifyPassword,makeSession,cookie,sameOrigin} from './auth/session.mjs';
import {verifyProjectionService} from './auth/vercel-oidc.mjs';
const attempts=new Map();
async function body(req) {let text='';for await(const chunk of req){text+=chunk;if(text.length>4096)throw new Error('BODY_TOO_LARGE');}return JSON.parse(text||'{}');}
export default async function handler(req,res) {
  const env=process.env,now=Date.now();
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Vary','Cookie, Authorization');
  const send=(value,status=200)=>{res.statusCode=status;res.end(JSON.stringify(value));};
  const url=new URL(req.url,'http://local'),route=url.searchParams.get('route')||url.pathname.split('/').pop(),privateAccess=authenticated(req,env),access=privateAccess?'PRIVATE':'PUBLIC';
  try{
    if(route==='session'){
      if(req.method==='GET')return send({authenticated:privateAccess,configured:configured(env),access});
      if(!sameOrigin(req))return send({error:'ORIGIN_REJECTED'},403);
      if(req.method==='DELETE'){res.setHeader('Set-Cookie',cookie('',req,true));clearProviderCache();return send({authenticated:false});}
      if(req.method!=='POST')return send({error:'METHOD_NOT_ALLOWED'},405);
      if(!configured(env))return send({error:'AUTH_NOT_CONFIGURED'},503);
      const key='single-user';const window=attempts.get(key);if(window&&window.until>now&&window.count>=5)return send({error:'RATE_LIMITED'},429);
      const record=window&&window.until>now?window:{count:0,until:now+900000};record.count++;attempts.set(key,record);
      const input=await body(req);if(typeof input.password!=='string'||input.password.length>256||!verifyPassword(input.password,env.NEXO_PASSWORD_HASH))return send({error:'INVALID_CREDENTIALS'},401);
      attempts.delete(key);res.setHeader('Set-Cookie',cookie(makeSession(env),req));return send({authenticated:true,configured:true,access:'PRIVATE'});
    }
    if(req.method!=='GET')return send({error:'WRITES_DISABLED'},405);
    if(!['world','health','now','loops','day','context','recall','projections'].includes(route))return send({error:'NOT_FOUND'},404);
    const force=url.searchParams.get('refresh')==='1';
    if(route==='projections'){
      const serviceAccess=!privateAccess&&await verifyProjectionService(req,{now});
      const projectionAccess=privateAccess||serviceAccess?'PRIVATE':'PUBLIC';
      return send(await buildProjectionBus({env,now,access:projectionAccess,force}));
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
    if(route==='health')return send({status:world.providers.every(p=>p.status==='AVAILABLE'&&!p.partial)?'HEALTHY':'DEGRADED',version:'0.1.0',contractVersion:'1',access,privateConfigured:configured(env),providers:world.providers,generatedAt:world.generatedAt});
    if(route==='now')return send({...world,items:world.items.filter(x=>['ACT','ESCALATE'].includes(x.attention)).slice(0,3)});
    if(route==='loops')return send({...world,items:world.items.filter(x=>x.status)});
    if(route==='day')return send({...world,items:world.items.filter(x=>x.kind==='EVENT'||x.status==='NEEDS_ME')});
    if(route==='context')return send({...world,items:world.items.filter(x=>x.contextId===url.searchParams.get('id'))});
    if(route==='recall')return send({...world,query:q,items:world.items.filter(x=>`${x.title} ${x.summary||''} ${x.contextId||''}`.toLocaleLowerCase().includes(q.toLocaleLowerCase())||['drive','gmail','github'].includes(x.source))});
    return send(world);
  }catch {return send({error:'REQUEST_FAILED'},500);}
}
