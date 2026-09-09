import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const lab=path.resolve(here,'../graph-lab');

test('SSOT adapter exposes lean NEXO live state and scoped mini-claims without changing science hierarchy',async()=>{
 const ssot=await import(pathToFileURL(path.join(lab,'data/ssot.mjs')));
 assert.equal(typeof ssot.extractNexoLiveState,'function');
 const rows={
  Science:[{record_type:'program',record_id:'PROG-DE',status:'ACTIVE',title:'Dark Energy',domain:'DARK_ENERGY'}],
  Relations:[],Olympus:[],
  NEXO:[
   {record_type:'state',record_id:'NEXO Recursive Loop',status:'ACTIVE',payload_json:JSON.stringify({CURRENT_STATE:'DE_ACTIVE',NEXT_ACTION:'Run discriminant',LAST_EFFECT:'Result 035 persisted'})},
   {record_type:'mini_claim',record_id:'MC-DE-001',status:'SUPPORTED',title:'Late attractor survives tested scope',detail:'bounded scope',payload_json:JSON.stringify({scope:'tested effective model',evidence_refs:['T-034','T-035'],falsifier:'instability'})},
   {record_type:'engineering_effect',record_id:'ENG-EFF-1',status:'DONE',title:'CAMB cache repair',detail:'runtime restored'}
  ]
 };
 const live=ssot.extractNexoLiveState(rows);
 assert.deepEqual(live.loop,{currentState:'DE_ACTIVE',nextAction:'Run discriminant',lastEffect:'Result 035 persisted'});
 assert.equal(live.miniClaims.length,1);
 assert.equal(live.miniClaims[0].recordId,'MC-DE-001');
 assert.equal(live.miniClaims[0].scope,'tested effective model');
 assert.deepEqual(live.miniClaims[0].evidenceRefs,['T-034','T-035']);
 assert.equal(live.engineeringEffects[0].recordId,'ENG-EFF-1');
 const graph=ssot.rowsToGraph(rows);
 assert.ok(graph.nodes.some(n=>n.recordId==='MC-DE-001'));
 assert.equal(graph.nodes.filter(n=>n.hierarchyLevel==='program').length,1);
 assert.equal(graph.nodes.some(n=>n.recordId==='MC-DE-001'&&n.hierarchyLevel),false);
});

test('Graph Lab shell reserves a read-only NEXO LIVE surface',()=>{
 const html=fs.readFileSync(path.join(lab,'index.html'),'utf8');
 assert.match(html,/id="nexo-live"/);
 assert.match(html,/id="nexo-current-state"/);
 assert.match(html,/id="nexo-next-action"/);
 assert.match(html,/id="nexo-last-effect"/);
 assert.match(html,/id="nexo-mini-claims"/);
 assert.match(html,/id="nexo-engineering-effects"/);
});
