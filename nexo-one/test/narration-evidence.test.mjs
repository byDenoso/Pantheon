import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLab } from '../src/features/lab/model.ts';
import { narrationEvidence } from '../src/features/lab/narration-evidence.ts';
import { createNarrationDeck, createPersistentNarrationDeck } from '../src/features/lab/narration-deck.ts';

test('missing fields never become a fabricated or dangling narration tail', () => {
  const deck = createNarrationDeck('factual');
  for (let i = 0; i < 120; i++) {
    const line = deck.say('TEST_RESULT_RECORDED', 'empty-' + i);
    assert.doesNotMatch(line, /;|\{|undefined|null/);
  }
  for (let i = 0; i < 1200; i++) {
    const line = deck.say('TEST_RESULT_RECORDED', 'one-' + i, { result: 'REJECTED', blocker: '', n: NaN });
    assert.match(line, /REJECTED\.$/);
    assert.doesNotMatch(line, /Travou|bloqueio|Quantidade|\{|undefined|null/);
  }
  assert.equal(deck.say('SELF_FOCUS', 'missing-title', { n: 3 }), null);
});

test('a published-field subset retains a unique cycle through reloads without persisting it', () => {
  let saved;
  const local = { getItem: () => saved ?? null, setItem: (_key, value) => { saved = value; } };
  const seen = new Set();
  for (let reload = 0; reload < 10; reload++) {
    const deck = createPersistentNarrationDeck(local, () => 'subset');
    for (let i = 0; i < 120; i++) {
      const line = deck.say('TEST_RESULT_RECORDED', String(i), { result: 'private scientific value' });
      assert.ok(!seen.has(line)); seen.add(line);
    }
  }
  assert.equal(seen.size, 1200);
  assert.doesNotMatch(saved, /private scientific value|result.*private/);
});

test('received fields preserve raw execution vs review and do not revive an old blocker', () => {
  const lab = buildLab({ graph: { nodes: [], edges: [] }, science_projection_v1: { tests: [{ id: 'A', method: 'Published method' }] }, read_model: { tests: {
    A: { status: 'DONE', verdict: 'REJECTED', blocker: 'obsolete blocker', review_state: 'CONFIRMED', method: 'Published method', claim_boundary: 'Published limit' },
    B: { status: 'BLOCKED_INPUT', blocker: 'Dataset binding missing' },
    C: {},
  } } });
  const a = narrationEvidence(lab.tests.get('A'));
  assert.equal(a.result, 'REJECTED');
  assert.equal(a.review, 'CONFIRMED');
  assert.equal(a.blocker, undefined);
  assert.equal(a.method, 'Published method');
  assert.equal(a.limit, 'Published limit');
  assert.equal(narrationEvidence(lab.tests.get('B')).blocker, 'Dataset binding missing');
  assert.deepEqual(narrationEvidence(lab.tests.get('C')), {});
  assert.deepEqual(narrationEvidence(undefined, { by: '', request: undefined }), {});
});

test('group narration states the received count once and does not pad it with a second count', () => {
  const deck = createNarrationDeck('compact-group');
  for (let i = 0; i < 120; i++) {
    const line = deck.say('GROUP_TEST_RESULT_RECORDED', String(i), { n: 17 });
    assert.equal(line.match(/\b17\b/g)?.length, 1);
    assert.doesNotMatch(line, /;|Lote recebido|a contagem é/i);
  }
});

test('generated narration normalizes its own ending without changing the supplied text', () => {
  const source = 'A execução preserva o valor 0.5 e termina aqui.';
  const deck = createNarrationDeck('punctuation');
  for (let i = 0; i < 120; i++) {
    const line = deck.say('TEST_RESULT_RECORDED', String(i), { meaning: source });
    assert.doesNotMatch(line, /\.\.$/);
    assert.match(line, /valor 0\.5/);
  }
  assert.equal(source, 'A execução preserva o valor 0.5 e termina aqui.');
});
