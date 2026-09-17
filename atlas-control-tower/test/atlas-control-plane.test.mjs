import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

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
  assert.match(page,/readback|evidence/);
  assert.doesNotMatch(page,/nexo\.create_work/);
  assert.doesNotMatch(page,/Criar WORK/);
});
