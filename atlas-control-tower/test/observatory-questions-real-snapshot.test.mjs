import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildObservatoryQuestion, sortObservatoryQuestions } from '../src/api/observatory-questions.ts';

// End-to-end against the real static snapshot files (no hand-built fixture, no
// network): proves the real read model genuinely produces 10 real question rows
// from the actual published snapshot's system:SCIENCE domains and their real
// campaign children -- the same two graph reads adapters.ts::getObservatoryQuestions
// performs (composed directly here rather than through createAtlasAdapter, which
// pulls in this repo's full bare-specifier ESM import graph -- untested for direct
// Node execution outside Vite's bundler resolution -- as a separate, pre-existing
// concern this test isn't scoped to fix).

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'public/data/current/manifest.json'), 'utf8'));
const snapshotDir = path.join(root, 'public/data', manifest.snapshotPath);

function readGraphFile(relativePath) {
  return JSON.parse(readFileSync(path.join(snapshotDir, relativePath), 'utf8'));
}

async function realObservatoryQuestions() {
  const scienceGraph = readGraphFile('graph/science.json');
  const domains = scienceGraph.nodes.filter(node => String(node.type || '').toUpperCase() === 'DOMAIN');
  const perDomain = domains.map(domain => {
    const code = String(domain.domain || domain.id.replace(/^domain:/i, '')).toUpperCase();
    const domainGraph = readGraphFile(`graph/science/${code}.json`);
    return buildObservatoryQuestion(domain, domainGraph.nodes);
  });
  return sortObservatoryQuestions(perDomain);
}

test('the real read model returns one row per real published domain, D1..D10, in order', async () => {
  const questions = await realObservatoryQuestions();
  assert.ok(questions.length >= 10, `expected at least 10 real domains, got ${questions.length}`);
  assert.deepEqual(questions.slice(0, 10).map(q => q.code), ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10']);
  for (const question of questions) {
    assert.ok(question.question.length > 0, `expected a real question string for ${question.code}`);
    assert.notEqual(question.status, undefined);
    assert.equal(question.synthesis, null, 'no producer publishes a synthesis today -- must stay null, not fabricated');
    assert.ok(question.unavailableReason, `expected an honest reason for ${question.code}`);
  }
});

test('D1 carries its real, non-zero campaign test count from the published snapshot', async () => {
  const questions = await realObservatoryQuestions();
  const d1 = questions.find(q => q.code === 'D1');
  assert.ok(d1);
  assert.equal(d1.label, 'H0 / acoustic ruler');
  assert.ok(d1.campaigns.length >= 1);
  assert.ok(d1.testCount > 0, 'D1 has a real published campaign testCount and must not read as 0');
});
