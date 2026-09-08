import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync(new URL('../../.github/workflows/atlas-deploy.yml', import.meta.url), 'utf8');

test('production deploy readback verifies the Black Box route', () => {
  assert.match(workflow, /\/api\/ops/,
    'Atlas Deploy must read back /api/ops so a partial Vercel bundle cannot be marked healthy');
});
