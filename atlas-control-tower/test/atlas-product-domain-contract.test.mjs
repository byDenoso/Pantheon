import test from 'node:test';
import assert from 'node:assert/strict';
import {PRIMARY_DOMAINS, semanticDomainForNode, graphForSemanticContext} from '../src/atlas-v3/semantic-v4.mjs';

test('product root exposes Science, Engineering and Olympus beneath NEXO, not Operations/Health pseudo-domains',()=>{
  assert.deepEqual(PRIMARY_DOMAINS,['NEXO','SCIENCE','ENGINEERING','OLYMPUS']);
});

test('domain classification never falls back to Science',()=>{
  assert.equal(semanticDomainForNode({id:'eng',type:'PROJECT',domain:'ENGINEERING'}),'ENGINEERING');
  assert.equal(semanticDomainForNode({id:'oly',type:'PROJECT',domain:'OLYMPUS'}),'OLYMPUS');
  assert.equal(semanticDomainForNode({id:'unknown',type:'WORK'}),'UNCLASSIFIED');
});

test('domain projections are isolated',()=>{
  const scene={graph:{nodes:[
    {id:'s',type:'PROJECT',domain:'SCIENCE'},
    {id:'e',type:'PROJECT',domain:'ENGINEERING'},
    {id:'o',type:'PROJECT',domain:'OLYMPUS'},
    {id:'u',type:'WORK',domain:''}
  ],edges:[]}};
  assert.deepEqual(graphForSemanticContext(scene,'SCIENCE').nodes.map(n=>n.id),['s']);
  assert.deepEqual(graphForSemanticContext(scene,'ENGINEERING').nodes.map(n=>n.id),['e']);
  assert.deepEqual(graphForSemanticContext(scene,'OLYMPUS').nodes.map(n=>n.id),['o']);
  assert.deepEqual(graphForSemanticContext(scene,'NEXO').nodes.map(n=>n.id),['u']);
});
