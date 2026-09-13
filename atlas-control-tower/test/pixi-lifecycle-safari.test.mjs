import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const graphExplorer = fs.readFileSync(new URL('../src/graph-engine/GraphExplorer.tsx', import.meta.url), 'utf8');

test('Pixi graph teardown keeps shared global renderer resources alive', () => {
  assert.doesNotMatch(
    graphExplorer,
    /app\.destroy\(true\)/,
    'app.destroy(true) releases Pixi global resource pools and can corrupt another renderer during remount/navigation',
  );
  assert.match(graphExplorer, /removeView\s*:\s*true/);
  assert.match(graphExplorer, /releaseGlobalResources\s*:\s*false/);
});
