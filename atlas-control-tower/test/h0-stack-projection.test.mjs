import test from 'node:test';
import assert from 'node:assert/strict';
import {extractH0StackMeasurement,buildH0StackProjection} from '../lib/h0-stack-projection.mjs';

test('structured H0 wins and keeps published uncertainty semantics only',()=>{
  const value=extractH0StackMeasurement({id:'T1',primaryCampaign:'C1',label:'Stack A',domain:'D1',h0:71.2,uncertaintyLow:.8,uncertaintyHigh:.8,uncertaintyLevel:'68%',datasets:['DESI','CMB']});
  assert.equal(value.h0,71.2);
  assert.equal(value.uncertaintyLow,.8);
  assert.equal(value.uncertaintyHigh,.8);
  assert.equal(value.uncertaintyLevel,'68%');
  assert.deepEqual(value.datasets,['DESI','CMB']);
});

test('legacy H0 token is parsed only when unambiguous',()=>{
  const value=extractH0StackMeasurement({id:'T2',primaryCampaign:'C1',label:'Published configuration',domain:'D1',keyMetrics:'authority f=.1, H0=71.5884, Δχ²=-25'});
  assert.equal(value.h0,71.5884);
  assert.equal(value.uncertaintyLevel,undefined);
});

test('ambiguous legacy H0 is rejected instead of averaged or guessed',()=>{
  assert.deepEqual(extractH0StackMeasurement({id:'T3',keyMetrics:'H0=70 or H0=72 depending branch'}),{unparsedReason:'AMBIGUOUS_H0'});
});

test('bare plus-minus never invents 1 sigma semantics',()=>{
  const value=extractH0StackMeasurement({id:'T4',label:'Stack',keyMetrics:'H0=70.2 ± 1.1'});
  assert.equal(value.h0,70.2);
  assert.equal(value.uncertaintyLow,undefined);
  assert.equal(value.uncertaintyHigh,undefined);
  assert.equal(value.uncertaintyLevel,undefined);
});

test('projection keeps only parsed measurements and reports rejected count',()=>{
  const result=buildH0StackProjection([
    {id:'A',label:'A',domain:'D1',keyMetrics:'H0=69.9'},
    {id:'B',label:'B',domain:'D1',keyMetrics:'H0=70 or H0=72'},
    {id:'C',label:'C',domain:'D2',summary:'no Hubble value'}
  ]);
  assert.equal(result.measurements.length,1);
  assert.equal(result.measurements[0].id,'A');
  assert.equal(result.rejected,2);
});
