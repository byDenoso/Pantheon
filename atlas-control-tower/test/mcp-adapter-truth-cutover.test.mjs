import test from 'node:test';
import assert from 'node:assert/strict';
import {createScientificMcpHttpHandler} from '../lib/scientific-mcp-http.mjs';

function responseCapture(){
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(name,value){this.headers[name]=value;},
    end(value=''){this.body=value;return value;},
  };
}

test('hosted Pantheon MCP declares itself a Tower-owned legacy transport adapter', async()=>{
  const gateway={configured:{towerWrite:false}};
  const service={async getBootstrap(){return {canonical:{truth_owner:'byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06'}};}};
  const handler=createScientificMcpHttpHandler({gateway,service});
  const res=responseCapture();

  await handler({method:'GET',headers:{}},res);
  const payload=JSON.parse(res.body);

  assert.deepEqual(payload.adapter,{
    role:'LEGACY_TRANSPORT_ADAPTER',
    truth_owner:'byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06',
    contract_authority:'FORBIDDEN',
    state_persistence:'FORBIDDEN',
    retired_operational_backends:['NEON_POSTGRESQL'],
  });
  assert.equal(payload.authority,'TOWER_V06');
});
