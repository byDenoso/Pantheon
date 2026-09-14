import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('dedicated Observatory endpoint composes the existing graph route and exposes the semantic contract', () => {
  const source = readFileSync(new URL('../api/observatory-questions.js', import.meta.url), 'utf8');
  assert.match(source, /from '\.\/atlas\.js'/);
  assert.match(source, /system:SCIENCE/);
  assert.match(source, /campaignGraphs/);
  assert.match(source, /campaign\.metadata/);
  assert.match(source, /testCount/);
  assert.match(source, /observatoryQuestionsPayload/);
  assert.match(source, /NEXO_ATLAS_OBSERVATORY_QUESTIONS_V1/);
  assert.doesNotMatch(source, /neon\.tech|Accept-Profile|Authorization/);
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.ok(vercel.builds.some(build => build.src === 'api/observatory-questions.js'));
  assert.ok(vercel.routes.some(route => route.src === '/api/observatory-questions' && route.dest === '/api/observatory-questions.js'));
});
