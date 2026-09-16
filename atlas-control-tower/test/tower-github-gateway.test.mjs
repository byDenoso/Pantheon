import test from 'node:test';
import assert from 'node:assert/strict';

import {createTowerGithubGateway,selectGitHubToken,resolveFrozenCapability,buildDispatchPayload} from '../lib/tower-github-gateway.mjs';

test('GitHub writer credentials come only from server environment aliases',()=>{
  assert.equal(selectGitHubToken({NEXO_TOWER_GITHUB_TOKEN:'tower'}),'tower');
  assert.equal(selectGitHubToken({NEXO_GITHUB_TOKEN:'nexo'}),'nexo');
  assert.equal(selectGitHubToken({GITHUB_TOKEN:'gh'}),'gh');
  assert.equal(selectGitHubToken({}),null);
});

test('capability resolution is frozen and allow-listed, never arbitrary shell',()=>{
  const capability=resolveFrozenCapability({execution_capability:'cosmology_benchmark_v1'},{});
  assert.equal(capability.task_id,'cosmology_benchmark');
  assert.equal(capability.repository,'byDenoso/TCC');
  assert.match(capability.source_revision,/^[0-9a-f]{40}$/);
  assert.deepEqual(capability.required_outputs,['benchmark_result.json']);
  assert.equal(resolveFrozenCapability({execution_capability:'bash -c evil'},{}),null);
  assert.equal(resolveFrozenCapability({},{}),null);
});

test('dispatch payload preserves one allow-listed execution contract per TEST',()=>{
  const capability=resolveFrozenCapability({execution_capability:'cosmology_benchmark_v1'},{});
  const payload=buildDispatchPayload({testId:'T-CHAT-ABC123',correlationId:'CORR-ABC123',spec:{question:'canary'},capability});
  assert.equal(payload.work_id,'T-CHAT-ABC123');assert.equal(payload.domain,'SCIENCE');assert.equal(payload.adapter,'execution');assert.equal(payload.args.execute,true);assert.equal(payload.args.task_id,'cosmology_benchmark');assert.equal(payload.args.test_id,'T-CHAT-ABC123');
});

test('gateway lists canonical JSON directory entries without inventing an index',async()=>{
  const seen=[];
  const payloads={
    'TOWER_V06/entities/hypothesis/HYP-A.json':{id:'HYP-A',proposition:'A'},
    'TOWER_V06/entities/hypothesis/HYP-B.json':{id:'HYP-B',proposition:'B'},
  };
  const fetchImpl=async url=>{
    const parsed=new URL(url);const encodedPath=parsed.pathname.split('/contents/')[1]||'';const path=encodedPath.split('/').map(decodeURIComponent).join('/');seen.push(path);
    if(path==='TOWER_V06/entities/hypothesis')return new Response(JSON.stringify([
      {type:'file',name:'HYP-B.json',path:'TOWER_V06/entities/hypothesis/HYP-B.json'},
      {type:'dir',name:'nested',path:'TOWER_V06/entities/hypothesis/nested'},
      {type:'file',name:'README.md',path:'TOWER_V06/entities/hypothesis/README.md'},
      {type:'file',name:'HYP-A.json',path:'TOWER_V06/entities/hypothesis/HYP-A.json'},
    ]),{status:200,headers:{'content-type':'application/json'}});
    const value=payloads[path];if(!value)return new Response(JSON.stringify({message:'Not Found'}),{status:404,headers:{'content-type':'application/json'}});
    return new Response(JSON.stringify({sha:'sha1',content:Buffer.from(JSON.stringify(value)).toString('base64'),encoding:'base64'}),{status:200,headers:{'content-type':'application/json'}});
  };
  const gateway=createTowerGithubGateway({env:{},fetchImpl});
  const items=await gateway.listJsonDirectory('entities/hypothesis');
  assert.deepEqual(items.map(item=>item.id),['HYP-A','HYP-B']);
  assert.deepEqual(seen,[
    'TOWER_V06/entities/hypothesis',
    'TOWER_V06/entities/hypothesis/HYP-A.json',
    'TOWER_V06/entities/hypothesis/HYP-B.json',
  ]);
});

test('gateway fails closed on writes when no server GitHub credential exists',async()=>{
  const gateway=createTowerGithubGateway({env:{},fetchImpl:async()=>{throw new Error('network should not run')}});
  await assert.rejects(()=>gateway.persistTest({request_id:'REQ-1',entity_name:'T-1'}),/GITHUB_WRITE_NOT_CONFIGURED/);
});

test('gateway writes mutation inbox, waits for receipt, then reads canonical TEST',async()=>{
  const calls=[];const store=new Map();const key=(repo,path,ref)=>`${repo}@${ref}:${path}`;
  const fetchImpl=async(url,init={})=>{
    const parsed=new URL(url);const match=parsed.pathname.match(/^\/repos\/([^/]+\/[^/]+)\/contents\/(.+)$/);assert.ok(match,`unexpected url ${url}`);
    const repo=match[1],path=match[2].split('/').map(decodeURIComponent).join('/'),ref=parsed.searchParams.get('ref')||JSON.parse(init.body||'{}').branch||'main';
    calls.push(`${init.method||'GET'} ${repo}@${ref}:${path}`);
    if((init.method||'GET')==='PUT'){
      const body=JSON.parse(init.body),text=Buffer.from(body.content,'base64').toString('utf8');store.set(key(repo,path,body.branch||'main'),text);
      if(path.includes('/mutations/inbox/')){const request=JSON.parse(text);store.set(key(repo,`TOWER_V06/mutations/receipts/${request.request_id}.json`,'main'),JSON.stringify({accepted:true,request_id:request.request_id}));store.set(key(repo,`TOWER_V06/entities/test/${request.entity_name}.json`,'main'),JSON.stringify({id:request.entity_name,status:'READY',scientific_fingerprint:request.changes.scientific_fingerprint,entity_version:1}));}
      return new Response(JSON.stringify({content:{sha:'newsha'},commit:{sha:'commitsha'}}),{status:201,headers:{'content-type':'application/json'}});
    }
    const value=store.get(key(repo,path,ref));if(value===undefined)return new Response(JSON.stringify({message:'Not Found'}),{status:404,headers:{'content-type':'application/json'}});
    return new Response(JSON.stringify({sha:'sha1',content:Buffer.from(value).toString('base64'),encoding:'base64'}),{status:200,headers:{'content-type':'application/json'}});
  };
  const gateway=createTowerGithubGateway({env:{NEXO_TOWER_GITHUB_TOKEN:'secret'},fetchImpl,sleep:async()=>{},receiptAttempts:2});
  const request={request_id:'REQ-MCP-T-1',entity_name:'T-1',changes:{scientific_fingerprint:'sha256:abc'}};
  const receipt=await gateway.persistTest(request);assert.equal(receipt.accepted,true);
  const entity=await gateway.readbackTest('T-1');assert.equal(entity.id,'T-1');
  assert.ok(calls.some(item=>item.startsWith('PUT byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06/mutations/inbox/REQ-MCP-T-1.json')));assert.equal(calls.some(item=>item.includes('secret')),false);
});
