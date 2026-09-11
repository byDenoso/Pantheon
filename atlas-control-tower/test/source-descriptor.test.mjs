import test from 'node:test';
import assert from 'node:assert/strict';
import {describeSource} from '../src/data/source-descriptor.ts';
import {FRESHNESS,SOURCES,provenanceLabel} from '../lib/graph-contract.mjs';

test('v1 is presented as a contract projection, never as a vendor',()=>{
  const source=describeSource({contract:'v1',source:'v1',freshness:'LIVE',sourceVersion:'rev-42'});
  assert.deepEqual(source,{contract:'v1',label:'Projeção canônica',freshness:'LIVE',version:'rev-42'});
  assert.doesNotMatch(source.label,/neon/i);
  assert.equal(provenanceLabel({source:SOURCES.V1,freshness:FRESHNESS.LIVE}),'LIVE · PROJEÇÃO CANÔNICA');
});

test('fallback and stale states remain explicit without inventing a provider',()=>{
  assert.equal(provenanceLabel({source:SOURCES.LEGACY,freshness:FRESHNESS.FALLBACK}),'FALLBACK · SNAPSHOT LEGADO');
  assert.equal(provenanceLabel({source:SOURCES.LEGACY,freshness:FRESHNESS.STALE}),'STALE · SNAPSHOT LEGADO');
});

test('unknown freshness degrades to snapshot instead of pretending to be live',()=>{
  const source=describeSource({contract:'v1',source:'v1',freshness:'mystery'});
  assert.equal(source.freshness,'SNAPSHOT');
});