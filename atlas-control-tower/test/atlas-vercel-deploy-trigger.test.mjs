import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const workflow=readFileSync(resolve(here,'../../.github/workflows/atlas-deploy.yml'),'utf8');

test('legacy Vercel action stays manual fallback while Vercel Git integration owns automatic production',()=>{
  assert.match(workflow,/workflow_dispatch:/,'manual recovery trigger must remain available');
  assert.doesNotMatch(workflow,/push:\s*\n\s*branches:\s*\[?main\]?/m,'legacy fallback must not duplicate Vercel Git production deployment');
  assert.match(workflow,/group:\s*atlas-vercel-compatibility/);
  assert.match(workflow,/VERCEL_TOKEN/);
});
