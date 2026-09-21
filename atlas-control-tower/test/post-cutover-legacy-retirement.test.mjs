import test from 'node:test';
import assert from 'node:assert/strict';

import mcpHandler from '../api/mcp.js';
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

test('legacy Vercel MCP fails closed after Drive-primary cutover',async()=>{
  const res=responseRecorder();
  await mcpHandler({method:'GET',headers:{}},res);
  const body=parsed(res);
  assert.equal(res.statusCode,200);
  assert.equal(body.status,'NONCANONICAL_DEPRECATED');
  assert.equal(body.authority,'TOWER_V06@GOOGLE_DRIVE_PRIVATE');
  assert.equal(body.canonical.storage,'GOOGLE_DRIVE_PRIVATE');
  assert.equal(body.canonical.git_state_fallback,false);
  assert.deepEqual(body.tools,[]);
  assert.equal(body.mutation_policy,'FORBIDDEN_ON_LEGACY_GITHUB_SURFACE');

  const post=responseRecorder();
  await mcpHandler({method:'POST',headers:{},body:{}},post);
  const postBody=parsed(post);
  assert.equal(post.statusCode,410);
  assert.equal(postBody.error,'LEGACY_MCP_RETIRED');
  assert.equal(postBody.canonical.git_state_fallback,false);
});

test('unconfigured Vercel Drive health is explicitly noncanonical, not authority failure',async()=>{
  const res=responseRecorder();
  await driveRuntimeHandler({method:'GET',url:'/api/drive-health?route=health'},res);
  const body=parsed(res);
  assert.equal(res.statusCode,410);
  assert.equal(body.status,'NONCANONICAL_DEPRECATED');
  assert.equal(body.error,'LEGACY_RUNTIME_RETIRED');
  assert.equal(body.authority,'TOWER_V06@GOOGLE_DRIVE_PRIVATE');
  assert.equal(body.canonical_current.pointer,'CURRENT.json');
  assert.equal(body.git_state_fallback,false);
});
