import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {createAtlasControlPlane} from '../lib/atlas-control-plane.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const read=path=>readFileSync(resolve(here,'..',path),'utf8');

test('Atlas Control Plane reuses canonical semantic mutations for reconcile and recover',()=>{
  const plane=read('lib/atlas-control-plane.mjs');
  assert.match(plane,/createAtlasControlPlane/);
  assert.match(plane,/semantic\.getWork/);
  assert.match(plane,/semantic\.transitionWork\(['"]start['"]/);
  assert.match(plane,/semantic\.transitionWork\(['"]complete['"]/);
  assert.match(plane,/semantic\.mutateWork/);
  assert.match(plane,/CHECKPOINTED/);
  assert.match(plane,/WAIT_DEPENDENCY/);
  assert.match(plane,/closure_ready/);
  assert.match(plane,/RECOVER_BEFORE_RECREATE/);
  assert.doesNotMatch(plane,/patch_json|write_entity/i);
});

test('Atlas Control Plane uses one authenticated private dispatcher route and common action envelope',()=>{
  const route=read('api/private/control.mjs');
  const plane=read('lib/atlas-control-plane.mjs');
  const dispatcher=read('api/private/index.mjs');
  const vercel=read('vercel.json');
  assert.match(route,/withGoogleAuth/);
  assert.match(route,/performSync/);
  for(const action of ['SYNC','RECONCILE','EXECUTE','RECOVER','VALIDATE']) assert.match(plane,new RegExp(action));
  for(const field of ['request_id','action','target','requested_at','acceptance','execution_id','state','before_revision','after_revision','evidence','blocker','readback']) assert.match(plane,new RegExp(field));
  assert.match(dispatcher,/control/);
  assert.match(vercel,/\/api\/private\/control/);
  const config=JSON.parse(vercel);
  assert.equal(config.builds.filter(item=>item.use==='@vercel/node').length,12);
});

test('Atlas V1 activity surface invokes the five Control Plane actions and removes free-form work creation',()=>{
  const page=read('src/pages/AtividadePage.tsx');
  const session=read('src/core/google-session.ts');
  assert.match(session,/\/api\/private\/control/);
  for(const action of ['SYNC','RECONCILE','EXECUTE','RECOVER','VALIDATE']) assert.match(page,new RegExp(action));
  assert.match(page,/terminalStates/);
  assert.match(page,/readback|evidence/);
  assert.doesNotMatch(page,/nexo\.create_work/);
  assert.doesNotMatch(page,/Criar WORK/);
});

test('SYNC reuses the native independent-read sync receipt instead of treating a read as refresh',async()=>{
  let calls=0;
  const sync=async()=>{calls+=1;return {requestId:'sync-1',outcome:'UPDATED',beforeFingerprint:'old',afterFingerprint:'new',readbackVerified:true,sources:[{id:'github-state',state:'READY',observedAt:'sha-new'}],errors:[]};};
  const result=await createAtlasControlPlane({semantic:{},sync}).execute({action:'SYNC'});
  assert.equal(calls,1);
  assert.equal(result.state,'UPDATED');
  assert.equal(result.before_revision,'old');
  assert.equal(result.after_revision,'new');
  assert.equal(result.readback.readbackVerified,true);
});

test('EXECUTE stays non-terminal until a separate readback exists',async()=>{
  const semantic={runWork:async()=>({status:'ACCEPTED',run_id:'RUN-1',launch_commit:'abc'})};
  const result=await createAtlasControlPlane({semantic}).execute({action:'EXECUTE',target:'WORK-1'});
  assert.equal(result.acceptance,'accepted');
  assert.equal(result.state,'ACCEPTED');
  assert.equal(result.execution_id,'RUN-1');
  assert.equal(result.readback,null);
});

test('RECOVER fails closed outside CHECKPOINTED and resumes CHECKPOINTED through start transition',async()=>{
  let transition=null;
  const semantic={
    getWork:async()=>({id:'WORK-1',status:'CHECKPOINTED',owner_role:'EXECUTOR',entity_version:4}),
    transitionWork:async(command,args)=>{transition={command,args};return {request_id:'REQ-1',receipt:{status:'COMPLETE'},readback:{id:'WORK-1',status:'RUNNING',entity_version:5}};},
  };
  const result=await createAtlasControlPlane({semantic}).execute({action:'RECOVER',target:'WORK-1'});
  assert.equal(transition.command,'start');
  assert.equal(transition.args.expected_version,4);
  assert.equal(result.state,'COMPLETE');
  assert.equal(result.before_revision,'work:WORK-1@v4');
  assert.equal(result.after_revision,'work:WORK-1@v5');
  assert.equal(result.readback.status,'RUNNING');

  const rejected=await createAtlasControlPlane({semantic:{getWork:async()=>({id:'WORK-2',status:'READY',entity_version:1})}}).execute({action:'RECOVER',target:'WORK-2'});
  assert.equal(rejected.acceptance,'rejected');
  assert.equal(rejected.blocker.reason,'INVALID_RECOVERY_STATE');
});

test('RECONCILE closes only explicit closure-ready checkpoints',async()=>{
  let command=null;
  const semantic={
    getWork:async()=>({id:'WORK-3',status:'CHECKPOINTED',closure_ready:true,entity_version:2}),
    transitionWork:async(name)=>{command=name;return {request_id:'REQ-2',receipt:{status:'COMPLETE'},readback:{id:'WORK-3',status:'DONE',entity_version:3}};},
  };
  const result=await createAtlasControlPlane({semantic}).execute({action:'RECONCILE',target:'WORK-3'});
  assert.equal(command,'complete');
  assert.equal(result.state,'COMPLETE');
  assert.equal(result.readback.status,'DONE');
  assert.equal(result.evidence[0].reason,'EXPLICIT_CLOSURE_READY');
});

test('VALIDATE never invents success while runtime readback is absent',async()=>{
  const pending=await createAtlasControlPlane({semantic:{readback:async()=>null}}).execute({action:'VALIDATE',target:'RUN-9'});
  assert.equal(pending.state,'PENDING');
  assert.equal(pending.readback,null);
  assert.equal(pending.blocker.reason,'READBACK_PENDING');
});
