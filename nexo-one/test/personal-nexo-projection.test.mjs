import test from 'node:test';
import assert from 'node:assert/strict';
import {nexo} from '../server/adapters/nexo.mjs';

const now=Date.parse('2026-09-15T16:45:00Z');
const env={GOOGLE_CONNECTOR:'google/nexo-google',VERCEL_OIDC_TOKEN:'oidc-fixture',NEXO_SHEET_ID:'ssot-fixture'};

test('canonical task and commitment rows project into PERSONAL context with LoopStatus and due dates',async()=>{
  const original=globalThis.fetch;
  const values=[
    ['record_type','record_id','status','title','detail','payload_json','source','updated_at'],
    ['task','t1','NEEDS_ME','Entregar relatório','Prazo amanhã',JSON.stringify({kind:'Task',id:'t1',due_at:'2026-09-16T18:00:00Z',correlation_id:'PCR-1'}),'NEXO · SSOT CANONICAL','2026-09-15T16:40:00Z'],
    ['commitment','c1','WAITING_OTHER','Aguardar retorno','Resposta do fornecedor',JSON.stringify({kind:'Commitment',id:'c1',due_at:'2026-09-18T12:00:00Z',correlation_id:'PCR-2'}),'NEXO · SSOT CANONICAL','2026-09-15T16:41:00Z'],
    ['execution_run','r1','SUCCESS','Execution r1','internal',JSON.stringify({run_id:'r1'}),'NEXO · SSOT CANONICAL','2026-09-15T16:42:00Z']
  ];
  globalThis.fetch=async(url,options={})=>{
    if(String(url).includes('/v1/connect/token/'))return new Response(JSON.stringify({token:'read-token'}),{status:200,headers:{'Content-Type':'application/json'}});
    if(String(url).includes('NEXO!A1%3AH1000'))return new Response(JSON.stringify({values}),{status:200,headers:{'Content-Type':'application/json'}});
    if(String(url).includes('AUTHORITY_MATRIX')||String(url).includes('CAPABILITY_MATRIX'))return new Response(JSON.stringify({values:[['x']]}),{status:200,headers:{'Content-Type':'application/json'}});
    assert.fail(`Unexpected request ${url}`);
  };
  try{
    const result=await nexo({env,now});
    const task=result.items.find(x=>x.id==='nexo:task:t1'),commitment=result.items.find(x=>x.id==='nexo:commitment:c1');
    assert.equal(task.contextId,'PERSONAL');assert.equal(task.personalType,'Task');assert.equal(task.status,'NEEDS_ME');assert.equal(task.dueAt,'2026-09-16T18:00:00Z');
    assert.equal(commitment.contextId,'PERSONAL');assert.equal(commitment.personalType,'Commitment');assert.equal(commitment.status,'WAITING_OTHER');
    const run=result.items.find(x=>x.id==='nexo:execution_run:r1');assert.equal(run.contextId,'NEXO');assert.equal(run.status,undefined);
  }finally{globalThis.fetch=original;}
});
