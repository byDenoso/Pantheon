import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow = readFileSync(new URL('../../.github/workflows/atlas-deploy.yml', import.meta.url), 'utf8');

test('hosted MCP production deploy stays manually callable and auto-runs only for MCP surface changes on main', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /push:/);
  assert.match(workflow, /branches:\s*\n\s*- main/);
  for (const path of [
    'atlas-control-tower/api/mcp.js',
    'atlas-control-tower/lib/scientific-mcp.mjs',
    'atlas-control-tower/lib/scientific-mcp-http.mjs',
    'atlas-control-tower/lib/tower-github-gateway.mjs',
  ]) assert.ok(workflow.includes(path), `missing MCP deploy trigger path: ${path}`);
  assert.doesNotMatch(workflow, /atlas-control-tower\/\*\*/);
});
