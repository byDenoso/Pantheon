import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { verifySceneSourcePin } from './scene-source-pin.mjs';

function fixture(run) {
  const parent = realpathSync(tmpdir());
  const root = mkdtempSync(join(parent, 'nexo-scene-pin-'));
  const hooks = join(root, 'empty-hooks');
  mkdirSync(hooks);
  const git = (...args) => execFileSync('git', ['-c', 'user.name=NEXO fixture',
    '-c', 'user.email=nexo-fixture@example.invalid', '-c', 'commit.gpgsign=false',
    '-c', 'core.hooksPath=' + hooks, '-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = (file, value) => { writeFileSync(join(root, file), value); git('add', file); git('commit', '-m', 'isolated fixture'); return git('rev-parse', 'HEAD'); };
  try {
    git('init');
    const base = commit('base.txt', 'base');
    git('checkout', '-b', 'candidate');
    const candidate = commit('candidate.txt', 'candidate source');
    git('checkout', '-b', 'integration', base);
    commit('integration.txt', 'main-only source');
    git('merge', '--no-ff', 'candidate', '-m', 'synthetic CI merge');
    const merge = git('rev-parse', 'HEAD');
    run({ root, git, candidate, merge });
  } finally {
    assert.ok(resolve(root).startsWith(parent + sep + 'nexo-scene-pin-'));
    rmSync(root, { recursive: true, force: true });
  }
}

test('candidate declaration cannot authenticate a different CI merge checkout', () => fixture(({ root, candidate, merge }) => {
  assert.notEqual(candidate, merge);
  assert.throws(() => verifySceneSourcePin(root, candidate), /SCENE_SOURCE_PIN_MISMATCH:candidate/);
  assert.equal(verifySceneSourcePin(root, merge, 'ci-merge').actualSha, merge);
}));

test('exact detached candidate is accepted and dirty source is rejected', () => fixture(({ root, git, candidate }) => {
  git('checkout', '--detach', candidate);
  assert.deepEqual(verifySceneSourcePin(root, candidate), { declaredSha: candidate, actualSha: candidate, cleanTrackedSources: true });
  writeFileSync(join(root, 'candidate.txt'), 'uncommitted change');
  assert.throws(() => verifySceneSourcePin(root, candidate), /SCENE_SOURCE_DIRTY:candidate/);
}));
