import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OBSERVATORY_QUESTIONS_CONTRACT, OBSERVATORY_SURFACES, observatoryQuestionsPayload } from '../lib/observatory-contract.mjs';

test('Observatory backend contract keeps questions/campaigns semantic and tests out of the spatial graph', () => {
  const payload = observatoryQuestionsPayload({
    nodes: [
      { id: 'system:SCIENCE', type: 'SYSTEM' },
      { id: 'domain:D1', type: 'DOMAIN', domain: 'D1', label: 'H0', status: 'CONSTRAINED', summary: 'Qual parte da separação é ruler?' },
      { id: 'CAMP-H0', type: 'CAMPAIGN', domain: 'D1', label: 'H0 campaign', status: 'CHECKPOINTED', metadata: { testCount: 127 } },
      { id: 'TEST-001', type: 'TEST', domain: 'D1' }
    ],
    edges: [
      { id: 'd1-camp', source: 'domain:D1', target: 'CAMP-H0', type: 'CONTAINS' },
      { id: 'camp-test', source: 'CAMP-H0', target: 'TEST-001', type: 'TESTS' }
    ]
  }, { freshness: 'SNAPSHOT', source: 'GOOGLE_DRIVE', sourceVersion: '2026-09-11' });

  assert.equal(payload.contract, OBSERVATORY_QUESTIONS_CONTRACT);
  assert.equal(payload.status, 'OK');
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].question, 'Qual parte da separação é ruler?');
  assert.equal(payload.items[0].campaigns[0].id, 'CAMP-H0');
  assert.equal(payload.items[0].counts.tests, 127);
  assert.equal(payload.items[0].synthesis, null);
  assert.equal(payload.items[0].availability, 'QUESTION_PUBLISHED');
  assert.equal(payload.surfaces.find(surface => surface.id === 'tests').count, 1);
  assert.deepEqual(payload.surfaces.map(surface => surface.id), OBSERVATORY_SURFACES.map(surface => surface.id));
});

test('Observatory backend marks a missing semantic question as unavailable instead of inconclusive', () => {
  const payload = observatoryQuestionsPayload({ nodes: [{ id: 'domain:D9', type: 'DOMAIN', domain: 'D9', label: 'D9', status: 'MIXED', summary: '' }], edges: [] });
  const item = payload.items[0];
  assert.equal(item.status, 'TENSION');
  assert.equal(item.availability, 'DATA_UNAVAILABLE');
  assert.equal(item.synthesis, null);
  assert.match(item.unavailableReason, /pergunta semântica/i);
});
