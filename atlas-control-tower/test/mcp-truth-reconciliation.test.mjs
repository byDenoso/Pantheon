import test from 'node:test';
import assert from 'node:assert/strict';
import {toolDescriptors} from '../lib/scientific-mcp.mjs';
import {createNexoSemanticGateway} from '../lib/nexo-semantic-gateway.mjs';

const toolNames=()=>new Set(toolDescriptors({authenticated:true}).map(item=>item.name));

test('authenticated hosted MCP exposes declared hypothesis/objective ingress',()=>{
  const names=toolNames();
  assert.ok(names.has('nexo.ingest_hypothesis'));
  assert.ok(names.has('nexo.ingest_objective'));
});

test('semantic dispatcher implements declared ingress commands',async()=>{
  const calls=[];
  const entities=new Map();
  const towerGateway={
    async readControl(){return {mode:'ACTIVE'};},
    async listJsonDirectory(){return [];},
    async submitTowerMutation(request){calls.push(request);entities.set(`${request.entity_kind}:${request.entity_name}`,{...request.changes,entity_version:1});return {status:'COMPLETE',receipt:{request_id:request.request_id}};},
    async readEntity(kind,id){return entities.get(`${kind}:${id}`)||null;},
  };
  const gateway=createNexoSemanticGateway({towerGateway});
  const hypothesis=await gateway.call('nexo.ingest_hypothesis',{proposition:'A falsifiable proposition'});
  assert.match(hypothesis.hypothesis_id,/^HYP-USER-/);
  assert.equal(calls.at(-1).entity_kind,'hypothesis');

  const objective=await gateway.call('nexo.ingest_objective',{goal:'Restore hosted MCP parity',domain:'ENGINEERING'});
  assert.match(objective.work_id,/^WORK-PLUGIN-/);
  assert.equal(calls.at(-1).entity_kind,'work');
});
