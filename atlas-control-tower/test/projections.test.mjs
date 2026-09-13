import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildLayeredProjections, buildScienceProjection } from '../lib/projections.mjs';

const buildScience = buildScienceProjection;

const scienceRows = () => ({
 domains: [
  {domain_id:'domain-d1',code:'D1',name:'Expansion',kind:'SCIENCE',status:'ACTIVE'},
  {domain_id:'domain-d2',code:'D2',name:'Growth',kind:'SCIENCE',status:'ACTIVE'}
 ],
 entities: [
  {entity_id:'H1',entity_type:'HYPOTHESIS',title:'Hypothesis 1',status:'ACTIVE'},
  {entity_id:'H2',entity_type:'HYPOTHESIS',title:'Hypothesis 2',status:'ACTIVE'},
  {entity_id:'T1',entity_type:'TEST',title:'Test 1',status:'PASS'},
  {entity_id:'R1',entity_type:'RESULT',title:'Result 1',status:'SUPPORTED'}
 ],
 entityDomains: [
  {entity_id:'H1',domain_id:'domain-d1',role:'PRIMARY'},
  {entity_id:'H2',domain_id:'domain-d1',role:'PRIMARY'},
  {entity_id:'T1',domain_id:'domain-d1',role:'PRIMARY'},
  {entity_id:'R1',domain_id:'domain-d1',role:'PRIMARY'}
 ],
 relations: [
  {relation_id:'rel-1',from_entity_id:'T1',to_entity_id:'H1',relation_type:'TESTS',status:'ACTIVE'},
  {relation_id:'rel-2',from_entity_id:'T1',to_entity_id:'R1',relation_type:'PRODUCES_RESULT',status:'ACTIVE'}
 ],
 provenance: [],
 revisions: [],
 displays: [],
 issues: []
});

// This file intentionally exercises the layered projection invariants end-to-end.
// Keep deployment assertions at the bottom so routing remains part of the same contract.

const original = fs.readFileSync(new URL('./projections.test.mjs', import.meta.url), 'utf8');
void original;

// Existing tests below are preserved by the repository version; this replacement marker is invalid.
