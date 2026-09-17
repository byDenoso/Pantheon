import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const read=path=>readFileSync(resolve(here,'..',path),'utf8');

test('Atlas Control Plane semantic gateway exposes canonical reconcile and recover commands',()=>{
  const semantic=read('lib/nexo-semantic-gateway.mjs');
  const endpoint=read('api/private/semantic.mjs');
  assert.match(semantic,/nexo\.reconcile_work/);
  assert.match(semantic,/nexo\.recover_work/);
  assert.match(semantic,/CHECKPOINTED/);
  assert.match(semantic,/WAIT_DEPENDENCY/);
  assert.match(semantic,/closure_ready/);
  assert.match(endpoint,/nexo\.reconcile_work/);
  assert.match(endpoint,/nexo\.recover_work/);
});

test('Atlas Control Plane uses one authenticated private dispatcher route and common action envelope',()=>{
  const route=read('api/private/control.mjs');
  const dispatcher=read('api/private/index.mjs');
  const vercel=read('vercel.json');
  assert.match(route,/withGoogleAuth/);
  for(const action of ['SYNC','RECONCILE','EXECUTE','RECOVER','VALIDATE']) assert.match(route,new RegExp(action));
  for(const field of ['request_id','action','target','requested_at','acceptance','execution_id','state','before_revision','after_revision','evidence','blocker','readback']) assert.match(route,new RegExp(field));
  assert.doesNotMatch(route,/patch_json|write_entity/i);
  assert.match(dispatcher,/control/);
  assert.match(vercel,/\/api\/private\/control/);
  const config=JSON.parse(vercel);
  assert.equal(config.builds.filter(item=>item.use==='@vercel/node').length,12);
});

test('Atlas V1 activity surface invokes the five Control Plane actions and removes free-form work creation',()=>{
  const page=read('src/pages/AtividadePage.tsx');
  assert.match(page,/\/api\/private\/control/);
  for(const action of ['SYNC','RECONCILE','EXECUTE','RECOVER','VALIDATE']) assert.match(page,new RegExp(action));
  assert.match(page,/readback|evidence/);
  assert.doesNotMatch(page,/nexo\.create_work/);
  assert.doesNotMatch(page,/Criar WORK/);
});
