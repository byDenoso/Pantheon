import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticCapabilityFingerprint,classifyCapabilityCandidate,reconcileCapabilityCandidate,classifyCapabilityDrift} from '../lib/capability-reconciler.mjs';

const base={capability_id:'probe',version:'1.0.0',input_schema:['x'],effect_schema:['y'],side_effect_class:'READ',acceptance_criteria:['non_empty'],provider:'provider-a'};

test('fingerprint ignores provider and transport-like implementation details',()=>{
  assert.equal(semanticCapabilityFingerprint(base),semanticCapabilityFingerprint({...base,provider:'provider-b',implementation_ref:'other.js'}));
});

test('classifies new and duplicate semantics',()=>{
  assert.equal(classifyCapabilityCandidate(base,{capabilities:{}}).classification,'NEW');
  const existing={...base,capability_id:'existing'};
  assert.equal(classifyCapabilityCandidate(base,{capabilities:{existing}}).classification,'DUPLICATE');
});

test('same id and semantics is unchanged',()=>{
  assert.equal(classifyCapabilityCandidate(base,{capabilities:{probe:base}}).classification,'UNCHANGED');
});

test('same id changed semantics without version bump conflicts',()=>{
  const changed={...base,effect_schema:['z']};
  assert.equal(classifyCapabilityCandidate(changed,{capabilities:{probe:base}}).classification,'CONFLICT');
});

test('version bump with changed semantics is update candidate',()=>{
  const changed={...base,version:'2.0.0',effect_schema:['z']};
  assert.equal(classifyCapabilityCandidate(changed,{capabilities:{probe:base}}).classification,'UPDATE');
});

test('reconciliation never auto-trusts discovery',()=>{
  const result=reconcileCapabilityCandidate(base,{capabilities:{}});
  assert.equal(result.classification,'NEW');
  assert.equal(result.trusted,false);
  assert.equal(result.executable,false);
  assert.equal(result.canonical_write_required,true);
});

test('drift marks canonical capability missing from observed implementation stale',()=>{
  const drift=classifyCapabilityDrift([],{capabilities:{probe:base}});
  assert.equal(drift[0].state,'STALE');
});
