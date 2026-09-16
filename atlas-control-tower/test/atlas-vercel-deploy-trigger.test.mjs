import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const workflow=readFileSync(resolve(here,'../../.github/workflows/atlas-deploy.yml'),'utf8');

test('Vercel compatibility runtime deploys from main when Atlas/MCP production code changes',()=>{
  assert.match(workflow,/push:\s*\n\s*branches:\s*\[?main\]?/m,'atlas-deploy.yml must react to pushes on main');
  assert.match(workflow,/paths:\s*\n(?:\s*-\s*['"]?atlas-control-tower\/\*\*['"]?\s*\n?)+/m,'main deploy must be scoped to atlas-control-tower/**');
  assert.match(workflow,/workflow_dispatch:/,'manual recovery trigger must remain available');
});
