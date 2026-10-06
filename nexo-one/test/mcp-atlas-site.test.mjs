import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const text=path=>readFile(new URL(path,root),'utf8');

test('MCP Atlas retains its routed shell while unauthenticated topology publication is disabled',async()=>{
  const [vite,workflow,site,builder]=await Promise.all([
    text('vite.config.ts'),
    text('../.github/workflows/nexo-one-pages.yml'),
    text('src/mcp/McpAtlasApp.tsx'),
    text('scripts/build-mcp-topology.mjs'),
  ]);
  assert.match(vite,/mcp\/index\.html/);
  assert.doesNotMatch(workflow,/manifests\/capabilities\.json|mcp_server\.py|build-mcp-topology\.mjs|projection-manifest\.json/);
  assert.match(workflow,/mcp\/topology\.json/);
  assert.match(workflow,/Verify former data URLs are unavailable/);
  assert.match(workflow,/403\|404\|410\)/);
  assert.match(builder,/assertPublicDataPublicationAllowed\(\)/);
  assert.ok(builder.indexOf('assertPublicDataPublicationAllowed();')<builder.indexOf('const sourceRoot='));
  assert.match(vite,/sealStaticPublication/);
  assert.match(site,/NexoGraph/);
  assert.doesNotMatch(site,/mcp-neural-2d/);
  assert.match(site,/type GraphView=NexoGraphView/);
  assert.match(site,/SYSTEM_TABS/);
  assert.match(site,/system-table/);
  assert.match(site,/THEME_STORAGE_KEY/);
  assert.match(site,/data-mcp-theme/);
  assert.match(site,/data-mcp-graph-view/);
  assert.match(site,/loadPublishedContext<Topology>/);
  assert.doesNotMatch(workflow,/VITE_PRIVATE_COCKPIT_URL:\s*https:\/\/nexo-one-two\.vercel\.app/);
  assert.doesNotMatch(site,/react-force-graph-3d|ForceGraph3D/);
  assert.match(site,/routeParams\(\)/);
  const bridge=await text('mcp/index.html');
  assert.match(bridge,/destination\.hash\s*=\s*'\/privado'/);
  assert.match(builder,/NEXO_MCP_TOPOLOGY_V1/);
  assert.match(builder,/TOWER_V06/);

  assert.match(site,/systemGraphModel/);
  assert.doesNotMatch(site,/system-graph-views/);
  assert.match(site,/\['roles','Equipes de automação'\]/);
  assert.match(builder, /tower_file_id/);
  assert.match(builder, /tower_revision/);
  assert.match(builder,/projection_fingerprint/);
  assert.doesNotMatch(site,/Abrir NEXO ONE/);
  assert.doesNotMatch(site,/dispatchProjectionSync|waitForProjectionSync/);
  const main=await text('src/mcp/main.tsx');
  const foundation=await text('src/styles/product-foundation.css');
  assert.match(main,/product-foundation\.css/);
  assert.match(foundation,/--nexo-shell-height:68px/);
  assert.match(foundation,/--font-ui:Inter/);
  const rootApp=await text('src/app/App.tsx');
  assert.match(rootApp,/lazy\(\(\) => import\('\.\.\/mcp\/EmbeddedMcp\.tsx'\)\)/);
});
