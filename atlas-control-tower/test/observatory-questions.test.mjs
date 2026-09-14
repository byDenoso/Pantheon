import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildObservatoryQuestion, sortObservatoryQuestions } from '../src/api/observatory-questions.ts';

// Real repro (the reported defect): the Observatório/Resumo do Universo "10
// question cards" were a hardcoded Portuguese label array matched against a
// `sections` field no producer (static snapshot or live backend) ever populates,
// so every card always showed the same fallback text and an INCONCLUSIVE badge --
// regardless of what the real snapshot actually publishes. These tests lock the
// real read model built from data the graph API already serves (system:SCIENCE's
// DOMAIN children + each domain's CAMPAIGN children), so the cards reflect the
// same canonical domain/question/status the map itself uses.

test('buildObservatoryQuestion carries the real question text, code and status through unchanged', () => {
  const domain = { id: 'domain:D1', type: 'DOMAIN', domain: 'D1', label: 'H0 / acoustic ruler', status: 'CONSTRAINED', summary: 'Qual parte da separação high-z/local é ruler, anchor ou microphysics?' };
  const campaigns = [
    { id: 'CAMP-H0-RULER-ANCHOR', type: 'CAMPAIGN', domain: 'D1', label: 'D1 · H0 / acoustic ruler · core campaign', status: 'CHECKPOINTED', metadata: { testCount: 127 } }
  ];
  const question = buildObservatoryQuestion(domain, campaigns);
  assert.equal(question.id, 'domain:D1');
  assert.equal(question.code, 'D1');
  assert.equal(question.label, 'H0 / acoustic ruler');
  assert.equal(question.question, 'Qual parte da separação high-z/local é ruler, anchor ou microphysics?');
  assert.equal(question.rawStatus, 'CONSTRAINED');
  assert.equal(question.status, 'SUPPORTED');
  assert.equal(question.testCount, 127);
  assert.equal(question.campaigns.length, 1);
  assert.equal(question.campaigns[0].id, 'CAMP-H0-RULER-ANCHOR');
});

test('buildObservatoryQuestion sums testCount across multiple real campaigns instead of picking one', () => {
  const domain = { id: 'domain:D9', type: 'DOMAIN', domain: 'D9', label: 'Particle DM / hidden sectors', status: 'MIXED', summary: 'q' };
  const campaigns = [
    { id: 'CAMP-A', type: 'CAMPAIGN', metadata: { testCount: 10 } },
    { id: 'CAMP-B', type: 'CAMPAIGN', metadata: { testCount: 5 } }
  ];
  const question = buildObservatoryQuestion(domain, campaigns);
  assert.equal(question.testCount, 15);
  assert.equal(question.status, 'TENSION');
});

test('buildObservatoryQuestion never fabricates a synthesis and always states why one is missing', () => {
  const domain = { id: 'domain:D2', type: 'DOMAIN', domain: 'D2', label: 'Growth / LSS / clusters', status: 'INCONCLUSIVE', summary: 'Existe suppression cosmológica independente de selection/scatter?' };
  const question = buildObservatoryQuestion(domain, []);
  assert.equal(question.synthesis, null);
  assert.ok(question.unavailableReason && question.unavailableReason.length > 0);
  assert.equal(question.testCount, 0);
  assert.deepEqual(question.campaigns, []);
});

test('buildObservatoryQuestion ignores non-CAMPAIGN siblings that may appear in the same graph focus response', () => {
  const domain = { id: 'domain:D1', type: 'DOMAIN', domain: 'D1', label: 'H0', status: 'CONSTRAINED', summary: 'q' };
  const nodes = [domain, { id: 'domain:D1', type: 'DOMAIN' }, { id: 'CAMP-X', type: 'CAMPAIGN', metadata: { testCount: 3 } }];
  const question = buildObservatoryQuestion(domain, nodes);
  assert.equal(question.campaigns.length, 1);
  assert.equal(question.testCount, 3);
});

test('sortObservatoryQuestions orders by numeric domain code (D2 before D10), not publish/string order', () => {
  const make = code => ({ id: `domain:${code}`, code, label: code, question: '', status: 'UNKNOWN', rawStatus: '', campaigns: [], testCount: 0, synthesis: null, unavailableReason: null });
  const sorted = sortObservatoryQuestions([make('D10'), make('D2'), make('D1')]);
  assert.deepEqual(sorted.map(q => q.code), ['D1', 'D2', 'D10']);
});

test('UniversePage no longer renders the hardcoded, disconnected question-label array (regression)', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/pages/atlas-pages.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /UNIVERSE_QUESTIONS/, 'the fake hardcoded question list must not come back');
  assert.doesNotMatch(source, /sectionFor/, 'the always-failing label-matching lookup must not come back');
  assert.match(source, /useObservatoryQuestions/, 'the real per-domain read model must be wired in');
});

test('real domain status vocabulary (CONSTRAINED/SURVIVES/MIXED/KILLED_PARENT) maps to an existing ScientificStatus, not UNKNOWN', () => {
  const statusFor = raw => buildObservatoryQuestion({ id: 'domain:X', domain: 'X', status: raw, summary: '' }, []).status;
  assert.equal(statusFor('CONSTRAINED'), 'SUPPORTED');
  assert.equal(statusFor('SURVIVES'), 'CANDIDATE');
  assert.equal(statusFor('SURVIVES_CLASS_ONLY'), 'CANDIDATE');
  assert.equal(statusFor('MIXED'), 'TENSION');
  assert.equal(statusFor('KILLED_PARENT'), 'CONTRADICTED');
  assert.equal(statusFor('INCONCLUSIVE'), 'INCONCLUSIVE');
});
