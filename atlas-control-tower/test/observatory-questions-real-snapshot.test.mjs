import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseObservatoryQuestions } from '../src/api/observatory-questions.ts';

// End-to-end against the real generated public surface. Science is canonically
// PROGRAM -> CAMPAIGN now; D1..D10 are an explicit derived Observatory index based
// on each campaign's declared domain, not fake DOMAIN children injected back into
// the structural map.
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'public/data/current/manifest.json'), 'utf8'));
const publicManifest = JSON.parse(readFileSync(path.join(root, 'public/data/current/public-manifest-v2.json'), 'utf8'));
const snapshotDir = path.join(root, 'public/data', manifest.snapshotPath);

function realObservatoryQuestions() {
  const descriptor = publicManifest.surfaces?.observatory;
  assert.equal(descriptor?.state, 'READY');
  assert.ok(descriptor?.path, 'observatory surface path must be published');
  const payload = JSON.parse(readFileSync(path.join(snapshotDir, descriptor.path), 'utf8'));
  return parseObservatoryQuestions({
    contract: 'NEXO_ATLAS_OBSERVATORY_QUESTIONS_V1',
    status: 'OK',
    freshness: 'SNAPSHOT',
    data: { items: payload.questions || [] }
  }).questions;
}

test('the real read model returns one derived row per declared D1..D10 campaign domain, in order', () => {
  const questions = realObservatoryQuestions();
  assert.ok(questions.length >= 10, `expected at least 10 real domains, got ${questions.length}`);
  assert.deepEqual(questions.slice(0, 10).map(q => q.code), ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10']);
  for (const question of questions) {
    assert.ok(question.question.length > 0, `expected a real question string for ${question.code}`);
    assert.notEqual(question.status, undefined);
    assert.equal(question.synthesis, null, 'no producer publishes a synthesis today -- must stay null, not fabricated');
    assert.ok(question.unavailableReason, `expected an honest reason for ${question.code}`);
  }
});

test('D1 carries its real campaign and non-zero test count from the canonical snapshot', () => {
  const questions = realObservatoryQuestions();
  const d1 = questions.find(q => q.code === 'D1');
  assert.ok(d1);
  assert.match(d1.label, /H0|acoustic ruler/i);
  assert.ok(d1.campaigns.some(campaign => campaign.id === 'CAMP-H0-RULER-ANCHOR'));
  assert.ok(d1.testCountKnown);
  assert.ok(d1.testCount > 0, 'D1 must carry the real published campaign test count');
});
