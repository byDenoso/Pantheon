import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflowUrl=name=>new URL(`../../.github/workflows/${name}`,import.meta.url);

test('retired one-shot Project Atlas migration workflow is absent',()=>{
  assert.equal(fs.existsSync(workflowUrl('apply-project-atlas-v3.yml')),false);
});

test('Atlas Quality remains the active Atlas verification workflow',()=>{
  const text=fs.readFileSync(workflowUrl('atlas-quality.yml'),'utf8');
  assert.match(text,/name:\s*Atlas Quality/);
  assert.match(text,/pull_request:/);
  assert.match(text,/node-version:\s*'24'/);
  assert.match(text,/Run unit and contract tests/);
});
