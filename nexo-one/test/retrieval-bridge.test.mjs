import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {executeRetrieval} from '../server/mcp/retrieval-tools.mjs';

const token='secret-token';
const expected=createHash('sha256').update('nexo-remote-mcp:'+token).digest('hex');
const principal={authenticated:true,id:'principal-1',roles:['LEARNER']};
const env={
  NEXO_RETRIEVAL_ENDPOINT:'https://retrieval.example/mcp',
  NEXO_RETRIEVAL_TOKEN_BINDINGS_JSON:JSON.stringify({'principal-1':{token}}),
};

function rpcResult(result,status=200){
  return new Response(status===202?'':JSON.stringify({jsonrpc:'2.0',id:1,result}),{
    status,headers:{'content-type':'application/json'}
  });
}
function fakeFetchFactory(capRoles=['LEARNER']){
  const calls=[];
  const fetchImpl=async (_url,init)=>{
    const body=JSON.parse(init.body);calls.push({method:body.method,headers:init.headers});
    if(body.method==='initialize')return rpcResult({protocolVersion:'2025-11-25',capabilities:{},serverInfo:{name:'nexo',version:'1.3.0'}});
    if(body.method==='notifications/initialized')return rpcResult({},202);
    if(body.method==='tools/call'&&body.params.name==='nexo_retrieval_capabilities')
      return rpcResult({structuredContent:{authenticated_subject:expected,roles:capRoles,source_mode:'DRIVE_LIVE_VERIFIED'}});
    if(body.method==='tools/call'&&body.params.name==='nexo_search')
      return rpcResult({structuredContent:{answer_status:'EVIDENCE_FOUND',hits:[{id:'TEST::X'}]}});
    throw new Error('unexpected '+body.method);
  };
  return {fetchImpl,calls};
}

test('private retrieval bridge supports stateless MCP and preserves evidence result',async()=>{
  const {fetchImpl,calls}=fakeFetchFactory();
  const result=await executeRetrieval({principal,env,fetchImpl},'nexo_search',{query:'TEST-X',role:'LEARNER'});
  assert.equal(result.answer_status,'EVIDENCE_FOUND');
  assert.equal(result.hits[0].id,'TEST::X');
  assert.equal(calls.some(x=>Object.keys(x.headers).some(k=>k.toLowerCase()==='mcp-session-id')),false);
});

test('private retrieval bridge rejects role escalation before upstream call',async()=>{
  const {fetchImpl,calls}=fakeFetchFactory();
  await assert.rejects(
    executeRetrieval({principal,env,fetchImpl},'nexo_search',{query:'x',role:'GUARDIAO'}),
    /ROLE_FORBIDDEN/
  );
  assert.equal(calls.length,0);
});

test('private retrieval bridge rejects an upstream credential broader than principal roles',async()=>{
  const {fetchImpl}=fakeFetchFactory(['LEARNER','GUARDIAO']);
  await assert.rejects(
    executeRetrieval({principal,env,fetchImpl},'nexo_search',{query:'x',role:'LEARNER'}),
    /UPSTREAM_SCOPE_TOO_BROAD/
  );
});
