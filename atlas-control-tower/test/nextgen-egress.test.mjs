import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import handler, {healthCheck} from '../api/ng.js';

function installDataApiStub(){
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async url => {
    calls += 1;
    const table = new URL(url).pathname.split('/').at(-1);
    return {
      ok: true,
      json: async () => table === 'entities'
        ? [{entity_id:'T-EGRESS', entity_type:'TEST', title:'Egress probe', status:'ACTIVE'}]
        : []
    };
  };
  return {restore(){globalThis.fetch=originalFetch}, calls:()=>calls};
}

function responseCapture(){
  const headers = {};
  return {
    headers,
    statusCode:null,
    body:null,
    setHeader(name,value){headers[name]=value},
    status(code){this.statusCode=code;return this},
    json(body){this.body=body;return body}
  };
}

test('NextGen health probe does not hydrate the full canonical graph', async () => {
  const stub = installDataApiStub();
  try {
    const out = await healthCheck({headers:{'x-vercel-oidc-token':'test-oidc'}});
    assert.equal(out.ok, true);
    assert.equal(stub.calls(), 1, 'health must issue only the lightweight liveness query');
  } finally {
    stub.restore();
  }
});

test('ordinary NextGen graph reads are cacheable at the Vercel edge', async () => {
  const stub = installDataApiStub();
  const res = responseCapture();
  const req = {
    method:'GET',
    url:'/api/ng?route=graph&view=macro&focus=system:NEXO',
    query:{route:'graph',view:'macro',focus:'system:NEXO'},
    headers:{'x-vercel-oidc-token':'test-oidc'}
  };
  try {
    await handler(req,res);
    assert.equal(res.statusCode,200);
    assert.match(String(res.headers['CDN-Cache-Control']||''),/max-age=60/);
    assert.match(String(res.headers['CDN-Cache-Control']||''),/stale-while-revalidate=300/);
  } finally {
    stub.restore();
  }
});

test('forced graph read bypasses every cache after sync', async () => {
  const stub = installDataApiStub();
  const res = responseCapture();
  const req = {
    method:'GET',
    url:'/api/ng?route=graph&view=macro&focus=system:NEXO&force=1',
    query:{route:'graph',view:'macro',focus:'system:NEXO',force:'1'},
    headers:{'x-vercel-oidc-token':'test-oidc'}
  };
  try {
    await handler(req,res);
    assert.equal(res.statusCode,200);
    assert.match(String(res.headers['Cache-Control']||''),/no-store/);
    assert.match(String(res.headers['CDN-Cache-Control']||''),/no-store/);
    assert.equal(stub.calls(),7,'forced read must reload the seven canonical datasets');
  } finally {
    stub.restore();
  }
});

test('frontend requests a forced readback immediately after sync', async () => {
  const source = await readFile(new URL('../nextgen/app.mjs',import.meta.url),'utf8');
  assert.match(source,/async function loadGraph\(\{view=state\.view,focus=state\.focus,force=false\}=\{\}\)/);
  assert.match(source,/if\(force\)q\.set\('force','1'\)/);
  assert.match(source,/await loadGraph\(\{force:true\}\)/);
});
