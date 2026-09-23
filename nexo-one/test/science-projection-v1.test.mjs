import test from 'node:test';
import assert from 'node:assert/strict';

const manifest = {
  authority: 'TOWER_V06',
  projection_only: true,
  writeback: 'FORBIDDEN',
  tower_repository: 'byDenoso/NEXO-Obsidian-Vault',
  tower_commit: 'a'.repeat(40),
  event_cursor: '20260922T120000000000Z-science',
  projection_fingerprint: 'sha256:' + 'b'.repeat(64),
};

test('science projection v1 keeps published Tower fields and marks missing fields with reasons', async () => {
  const { buildScienceProjectionV1, validateScienceProjectionV1 } = await import('../scripts/science-projection-v1.mjs');
  const output = buildScienceProjectionV1({
    projection: {
      campaigns: [{ campaign_id: 'CAMP-1', scientific_question: 'Does model X fit?', status: 'ACTIVE', test_ids: ['T-1'] }],
      hypotheses: [{ hypothesis_id: 'HYP-1', proposition: 'Model X fits', kill_criteria: ['criterion'], model_boundary: 'X vs Y' }],
      tests: [{ id: 'T-1', campaign_id: 'CAMP-1', hypothesis_ref: 'HYP-1', status: 'VERIFIED', verdict: 'SUPPORTS', scientific_result: { parameter: 'H0', value: 71.2, err_lo: 1.1, err_hi: 1.3, unit: 'km/s/Mpc', statistics: { p_value: 0.03 } }, artifacts: [{ ref: 'TOWER_V06/runtime/artifacts/result.json', sha256: 'c'.repeat(64) }] }],
    },
    manifest,
  });

  validateScienceProjectionV1(output);
  const [campaign] = output.campaigns;
  const [hypothesis] = output.hypotheses;
  const [scienceTest] = output.tests;
  assert.equal(campaign.question.value, 'Does model X fit?');
  assert.equal(campaign.started_at.value, null);
  assert.match(campaign.started_at.unavailable_reason, /not published/i);
  assert.equal(hypothesis.statement.value, 'Model X fits');
  assert.equal(scienceTest.result.value.value, 71.2);
  assert.equal(scienceTest.statistics.p_value.value, 0.03);
  assert.equal(scienceTest.statistics.delta_bic.value, null);
  assert.match(scienceTest.statistics.delta_bic.unavailable_reason, /not published/i);
  assert.equal(scienceTest.verdict.value, 'SUPPORTS');
  for (const field of [campaign.question, scienceTest.result.value, scienceTest.statistics.p_value]) {
    assert.match(field.source_ref, /^tower:\/\//);
    assert.match(field.fingerprint, /^sha256:[0-9a-f]{64}$/);
  }
});

test('science projection does not treat governance PASS as a scientific verdict', async () => {
  const { buildScienceProjectionV1 } = await import('../scripts/science-projection-v1.mjs');
  const output = buildScienceProjectionV1({
    projection: { campaigns: [], hypotheses: [], tests: [{ id: 'GATE-1', verdict: 'PASS' }] },
    manifest,
  });
  assert.equal(output.tests[0].verdict.value, null);
  assert.match(output.tests[0].verdict.unavailable_reason, /not an approved scientific verdict/i);
});

test('science projection rejects records without source identity or a matching fingerprint', async () => {
  const { validateScienceProjectionV1 } = await import('../scripts/science-projection-v1.mjs');
  assert.throws(() => validateScienceProjectionV1({
    contract: 'NEXO_SCIENCE_PROJECTION_V1', version: 1, source: {}, campaigns: [], hypotheses: [], tests: [], fingerprint: 'sha256:' + '0'.repeat(64),
  }), /source identity invalid/i);
});
