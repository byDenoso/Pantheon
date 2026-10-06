import test from 'node:test';
import assert from 'node:assert/strict';

import {createHash} from 'node:crypto';
import driveRuntimeHandler from '../api/runtime-drive.js';

function responseRecorder(){
  return {
    statusCode:200,
    headers:{},
    body:'',
    setHeader(k,v){this.headers[k]=v;},
    status(code){this.statusCode=code;return this;},
    json(value){this.body=value;return this;},
    end(value=''){this.body=value;return this;}
  };
}

function parsed(res){
  if(res.body && typeof res.body==='object') return res.body;
  return JSON.parse(String(res.body||'{}'));
}

test('non-Drive MCP preserves retirement for authenticated machines and hides metadata from anonymous callers',async t=>{
  const oldMode=process.env.NEXO_STORAGE_MODE, oldHash=process.env.NEXO_MCP_ACCESS_KEY_SHA256;
  process.env.NEXO_STORAGE_MODE='GITHUB';
  process.env.NEXO_MCP_ACCESS_KEY_SHA256=createHash('sha256').update('retired-fixture-key').digest('hex');
  t.after(()=>{
    if(oldMode===undefined)delete process.env.NEXO_STORAGE_MODE;else process.env.NEXO_STORAGE_MODE=oldMode;
    if(oldHash===undefined)delete process.env.NEXO_MCP_ACCESS_KEY_SHA256;else process.env.NEXO_MCP_ACCESS_KEY_SHA256=oldHash;
  });
  const {default:mcpHandler}=await import('../api/mcp.js?retired-fixture');
  const anonymous=responseRecorder();
  await mcpHandler({method:'GET',headers:{}},anonymous);
  assert.equal(anonymous.statusCode,401);assert.deepEqual(parsed(anonymous),{error:'UNAUTHORIZED'});
  const headers={authorization:'Bearer retired-fixture-key'};
  const res=responseRecorder();
  await mcpHandler({method:'GET',headers},res);
  const body=parsed(res);
  assert.equal(res.statusCode,200);
  assert.equal(body.status,'NONCANONICAL_DEPRECATED');
  assert.equal(body.authority,'TOWER_V06@GOOGLE_DRIVE_PRIVATE');
  assert.equal(body.canonical.storage,'GOOGLE_DRIVE_PRIVATE');
  assert.equal(body.canonical.git_state_fallback,false);
  assert.deepEqual(body.tools,[]);
  assert.equal(body.mutation_policy,'FORBIDDEN_ON_LEGACY_GITHUB_SURFACE');

  const post=responseRecorder();
  await mcpHandler({method:'POST',headers,body:{}},post);
  const postBody=parsed(post);
  assert.equal(post.statusCode,410);
  assert.equal(postBody.error,'LEGACY_MCP_RETIRED');
  assert.equal(postBody.canonical.git_state_fallback,false);
});

test('legacy Drive health exposes no private pointers and gains no machine-key grant',async t=>{
  const before=globalThis.fetch;let reads=0;
  globalThis.fetch=async()=>{reads++;throw new Error('Unexpected private read');};
  t.after(()=>{globalThis.fetch=before;});
  for(const headers of [{},{authorization:'Bearer retired-fixture-key'},{'x-vercel-oidc-token':'unverified'}]){
    const res=responseRecorder();
    await driveRuntimeHandler({method:'GET',url:'/api/drive-health?route=health',headers},res);
    assert.equal(res.statusCode,410);
    assert.deepEqual(parsed(res),{error:'LEGACY_ATLAS_DATA_API_RETIRED'});
  }
  assert.equal(reads,0);
});
