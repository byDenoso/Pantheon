import test from 'node:test';
import assert from 'node:assert/strict';
import {dependencyFingerprint,selectInvalidatedSyntheses} from '../lib/synthesis-dependencies.mjs';

test('dependency fingerprint is deterministic over dependency order',()=>{
  const lookup={A:'sha256:a',B:'sha256:b'};
  assert.equal(dependencyFingerprint(['B','A'],lookup),dependencyFingerprint(['A','B'],lookup));
});

test('only syntheses whose dependency fingerprint changed are invalidated',()=>{
  const lookup={O1:'sha256:o1-new',O2:'sha256:o2',C1:'sha256:c1',E1:'sha256:e1'};
  const stableFingerprint=dependencyFingerprint(['O2'],lookup);
  const syntheses=[
    {id:'S1',observationIds:['O1'],comparisonIds:['C1'],evidenceIds:['E1'],dependencyFingerprint:'sha256:old'},
    {id:'S2',observationIds:['O2'],comparisonIds:[],evidenceIds:[],dependencyFingerprint:stableFingerprint}
  ];
  const result=selectInvalidatedSyntheses({syntheses,hashLookup:lookup});
  assert.deepEqual(result.invalidated.map(x=>x.id),['S1']);
  assert.deepEqual(result.stable.map(x=>x.id),['S2']);
  assert.equal(result.invalidated[0].nextDependencyFingerprint,dependencyFingerprint(['O1','C1','E1'],lookup));
});

test('missing dependency hash keeps synthesis invalid instead of fabricating stability',()=>{
  const result=selectInvalidatedSyntheses({
    syntheses:[{id:'S1',observationIds:['MISSING'],comparisonIds:[],evidenceIds:[],dependencyFingerprint:'sha256:any'}],
    hashLookup:{}
  });
  assert.equal(result.invalidated[0].dependencyState,'DATA_UNAVAILABLE');
  assert.equal(result.invalidated[0].nextDependencyFingerprint,undefined);
});
