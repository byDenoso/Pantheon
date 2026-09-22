import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const text=path=>readFile(new URL(path,root),'utf8');

test('MCP Atlas is a Pages multipage surface built from canonical MCP sources',async()=>{
  const [vite,workflow,site,builder]=await Promise.all([
    text('vite.config.ts'),
    text('../.github/workflows/nexo-one-pages.yml'),
    text('src/mcp/McpAtlasApp.tsx'),
    text('scripts/build-mcp-topology.mjs'),
  ]);
  assert.match(vite,/mcp\/index\.html/);
  assert.match(workflow,/manifests\/capabilities\.json/);
  assert.match(workflow,/mcp_server\.py/);
  assert.match(workflow,/build-mcp-topology\.mjs/);
  assert.match(site,/CanvasGraph25D/);
  assert.doesNotMatch(site,/react-force-graph-3d|ForceGraph3D/);
  assert.match(site,/\.\/topology\.json/);
  assert.match(builder,/NEXO_MCP_TOPOLOGY_V1/);
  assert.match(builder,/TOWER_V06/);

  assert.match(workflow,/projection-manifest\.json/);
  assert.match(workflow,/WORK_COUNT_DRIFT/);
  assert.match(workflow,/WORK_STATUS_DRIFT/);
  assert.match(workflow,/MCP_TOPOLOGY_FRESHNESS_FINGERPRINT_MISMATCH/);
  assert.match(site,/Sem alterações/);
  assert.match(site,/focusNode/);
  assert.match(site,/relationContext/);
  assert.match(site,/Filtrar grafo/);
  assert.match(site,/\['roles','Roles'\]/);
  assert.match(builder,/source_snapshot_id/);
  assert.match(builder,/projection_fingerprint/);
});
