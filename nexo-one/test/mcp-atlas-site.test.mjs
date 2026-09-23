import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const text=path=>readFile(new URL(path,root),'utf8');

test('MCP Atlas is a routed surface in the unified SPA with canonical Tower sources',async()=>{
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
  assert.match(site,/mcp-neural-2d/);
  assert.match(site,/type GraphView='2d'\|'3d'/);
  assert.match(site,/Metro 2D/);
  assert.match(site,/3D Explorar/);
  assert.match(site,/THEME_STORAGE_KEY/);
  assert.match(site,/data-mcp-theme/);
  assert.match(site,/data-mcp-graph-view/);
  assert.match(site,/COCKPIT_ROUTE='#\/cockpit\/comando'/);
  assert.match(site,/loadPublishedContext<Topology>/);
  assert.match(workflow,/VITE_PUBLIC_NEXO_BASE:\s*https:\/\/bydenoso\.github\.io\/Pantheon\//);
  assert.doesNotMatch(workflow,/VITE_PRIVATE_COCKPIT_URL:\s*https:\/\/nexo-one-two\.vercel\.app/);
  assert.match(workflow,/PAGES_MCP_NEURAL_DARK_2D_OK/);
  assert.match(workflow,/PAGES_MCP_NEURAL_LIGHT_2D_OK/);
  assert.match(workflow,/PAGES_MCP_NEURAL_DARK_3D_OK/);
  assert.match(workflow,/PAGES_MCP_NEURAL_LIGHT_3D_OK/);
  assert.match(workflow,/PAGES_MCP_NEURAL_MOBILE_LIGHT_2D_OK/);
  assert.match(workflow,/PAGES_MCP_NEURAL_MOBILE_DARK_3D_OK/);
  assert.doesNotMatch(site,/react-force-graph-3d|ForceGraph3D/);
  assert.match(site,/routeParams\(\)/);
  const bridge=await text('mcp/index.html');
  assert.match(bridge,/destination\.hash\s*=\s*'\/sistema'/);
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
  assert.match(site,/dispatchProjectionSync/);
  assert.match(site,/waitForProjectionSync/);
  assert.match(site,/synchronizeTopology/);
  assert.match(site,/PUBLIC_PROJECTION_REFRESHED/);
  assert.match(site,/source-newer/);
  assert.match(site,/origem pública confirmada/);
  const main=await text('src/mcp/main.tsx');
  const foundation=await text('src/styles/product-foundation.css');
  assert.match(main,/product-foundation\.css/);
  assert.match(foundation,/--nexo-shell-height:68px/);
  assert.match(foundation,/--font-ui:Inter/);
  const rootApp=await text('src/app/App.tsx');
  assert.match(rootApp,/lazy\(\(\) => import\('\.\.\/mcp\/EmbeddedMcp\.tsx'\)\)/);
});
