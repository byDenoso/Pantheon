import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptAtlasV3Snapshot} from '../lib/github-canonical-runtime.mjs';

test('Tower V3 snapshot adapts into compatibility read model without Drive semantics',()=>{
  const fingerprint='sha256:'+'a'.repeat(64);
  const snapshot={
    manifest:{fingerprint,sourceVersion:'TOWER_V06@test',generatedAt:'2026-09-20T19:00:00Z'},
    provenance:{source:'TOWER_V06',sourceVersion:'TOWER_V06@test'},
    entities:{
      'PROG-A':{id:'PROG-A',projectedType:'PROGRAM',label:'Program A',status:'ACTIVE'},
      'CAMP-A':{id:'CAMP-A',projectedType:'CAMPAIGN',label:'Campaign A',status:'ACTIVE',parentId:'PROG-A'},
      'WORK::ENG':{id:'WORK::ENG',projectedType:'WORK',label:'Engineering',status:'READY',domain:'ENGINEERING'},
      'WORK::OLY':{id:'WORK::OLY',projectedType:'WORK',label:'Olympus',status:'READY',domain:'OLYMPUS'}
    },
    learning:{filaments:[{id:'ML-A',status:'SUPPORTED',mapping:'Reuse validated path.'}]},
    operations:{works:[{id:'WORK::ENG',status:'READY'}]}
  };
  const payload=adaptAtlasV3Snapshot(snapshot);
  assert.equal(payload.meta.authority,'TOWER_V06');
  assert.equal(payload.meta.contract,'ATLAS_PROJECTION_V3');
  assert.equal(payload.meta.fingerprint,fingerprint);
  assert.equal(payload.science[0].domain,'PROG-A');
  assert.equal(payload.science[0].title,'Program A');
  assert.equal(payload.engineering.length,1);
  assert.equal(payload.olympus.length,1);
  assert.equal(payload.learning.length,1);
  assert.equal(payload.actions.length,1);
  assert.equal(JSON.stringify(payload).includes('GOOGLE_DRIVE'),false);
});
