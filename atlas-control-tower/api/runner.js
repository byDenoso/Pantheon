import {createRunnerBridge} from '../lib/durable-runner.mjs';

const bridge=createRunnerBridge();
const value=(url,name,max=2000)=>String(url.searchParams.get(name)||'').slice(0,max);
const send=(res,status,payload)=>{
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Pragma','no-cache');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Content-Type-Options','nosniff');
  return res.end(JSON.stringify(payload));
};
const codeFor=message=>/UNAUTHORIZED/.test(message)?401:/REQUIRED|NOT_ALLOWED|INVALID|SURFACE/.test(message)?400:/OIDC/.test(message)?503:502;

export default async function handler(req,res){
  if(req.method!=='GET')return send(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});
  const url=new URL(req.url||'/api/runner','https://atlas.local');
  const accessKey=value(url,'k',256);
  const operation=value(url,'op',32)||'health';
  const oidc=req.headers?.['x-vercel-oidc-token']||process.env.VERCEL_OIDC_TOKEN||'';
  bridge.setToken(oidc);
  try{
    if(operation==='health'){
      const probe=await bridge.readTruth({accessKey,surface:'actions_open'});
      return send(res,200,{ok:true,bridge:'DURABLE_RUNNER_V1',neon:'READ_OK',authority:'NEON_TRUTH_OWNER',openActions:probe.rows.length});
    }
    if(operation==='read'){
      const result=await bridge.readTruth({accessKey,surface:value(url,'surface',80),key:value(url,'key',600)});
      return send(res,200,{ok:true,...result});
    }
    if(operation==='receipt'){
      const result=await bridge.receipt({
        accessKey,effectKey:value(url,'effect_key',500),loop:value(url,'loop',180),lane:value(url,'lane',40),
        status:value(url,'status',40)||'SUCCESS',actionId:value(url,'action_id',80)||null,summary:value(url,'summary',2000),
        checkpoint:value(url,'checkpoint',160),resumePointer:value(url,'resume_pointer',500),
        expectedOutcome:value(url,'expected',800),observedOutcome:value(url,'observed',800),
      });
      return send(res,200,{ok:true,id:result.id,effectKey:result.effectKey,readbackVerified:result.readbackVerified,authority:result.authority});
    }
    if(operation==='checkpoint'){
      const result=await bridge.checkpoint({
        accessKey,effectKey:value(url,'effect_key',500),loop:value(url,'loop',180),lane:value(url,'lane',40),
        step:value(url,'step',160),checkpoint:value(url,'checkpoint',160),resumePointer:value(url,'resume_pointer',500),
        status:value(url,'status',120)||'CHECKPOINTED',summary:value(url,'summary',2000),
      });
      return send(res,200,{ok:true,eventId:result.eventId,effectKey:result.effectKey,readbackVerified:result.readbackVerified,authority:result.authority});
    }
    return send(res,400,{ok:false,error:'OPERATION_NOT_ALLOWED'});
  }catch(error){
    const message=String(error?.message||error);
    console.warn('[atlas:durable-runner]',message.split(':')[0]);
    return send(res,codeFor(message),{ok:false,error:message.split(':')[0]});
  }
}
