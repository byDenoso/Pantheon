import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('GitHub Pages build uses repository base and configurable SystemState endpoint', async () => {
  const vite = await text('vite.config.ts');
  const remote = await text('src/data/adapters/remote.ts');

  assert.match(vite, /GITHUB_PAGES/);
  assert.match(vite, /Pantheon/);
  assert.match(remote, /VITE_SYSTEM_ENDPOINT/);
  assert.match(remote, /BASE_URL/);
  assert.match(remote, /resolveSystemEndpoint/);
  assert.match(remote, /configuredEndpoint\.replace/);
  assert.match(remote, /\/api\/system/);
  assert.match(remote, /staticProjection \? \(force \? 'reload' : 'no-cache'\) : 'no-store'/);
  assert.match(remote, /endsWith\('\.json'\)/);
});

test('GitHub Pages consumes only the sanctioned TOWER_V06 public projection', async () => {
  const workflow = await text('../.github/workflows/nexo-one-pages.yml');
  const builder = await text('scripts/build-pages-system.mjs');

  assert.match(workflow, /NEXO_VAULT_READ_TOKEN/);
  assert.match(workflow, /byDenoso\/NEXO-Obsidian-Vault/);
  assert.match(workflow, /TOWER_V06\/projections\/public\/projection\.json/);
  assert.match(workflow, /TOWER_V06\/projections\/public\/manifest\.json/);
  assert.match(workflow, /verify_projection/);
  assert.match(workflow, /authority.*TOWER_V06/);
  assert.match(workflow, /projection_only/);
  assert.match(workflow, /writeback/);
  assert.match(workflow, /tower_commit/);
  assert.match(workflow, /event_cursor/);
  assert.match(workflow, /projection_fingerprint/);
  assert.doesNotMatch(workflow, /cp atlas-control-tower\/data\/nexo-drive-projection\.json/);
  assert.doesNotMatch(workflow, /truthgraph\.snapshot\.json/);

  assert.match(builder, /NEXO_PUBLIC_PROJECTION_V1/);
  assert.match(builder, /validateSanctionedProjection/);
  assert.match(builder, /Pantheon performs presentation shaping only/);
  assert.doesNotMatch(builder, /readProvider/);
  assert.doesNotMatch(builder, /public-system-input/);
  assert.doesNotMatch(builder, /nexo-drive-projection/);
  assert.doesNotMatch(builder, /truthgraph\.snapshot/);
});

test('sanctioned TOWER interdomain entities become visible learning filaments', async () => {
  const { buildPagesProjection } = await import('../scripts/build-pages-system.mjs');
  const manifest = {
    authority: 'TOWER_V06',
    projection_only: true,
    writeback: 'FORBIDDEN',
    tower_commit: 'a'.repeat(40),
    event_cursor: '20260918T162451768632Z-47dfe529',
    projection_fingerprint: `sha256:${'b'.repeat(64)}`,
  };
  const projection = {
    contract: 'NEXO_PUBLIC_PROJECTION_V1',
    manifest,
    event_cursor: manifest.event_cursor,
    work: [],
    tests: [],
    capabilities: {},
    counts: { active_work: 0, tests: 0, capabilities: 0 },
  };
  const { system } = buildPagesProjection({
    projection,
    manifestFile: manifest,
    interdomain: [{
      id: 'META::INTERDOMAIN::TEST',
      relation_type: 'METHOD_TRANSFER',
      source_domains: ['Cosmologia'],
      target_domains: ['Bodybuilding'],
      status: 'TESTING',
    }],
  });
  assert.equal(system.filaments.length, 1);
  assert.ok(system.graph.edges.some(edge => edge.is_learning && edge.learning_scope === 'INTER_DOMAIN'));
  assert.ok(system.graph.edges.some(edge => edge.from === 'domain:SCIENCE' && edge.to === 'domain:OLYMPUS'));
});

test('explicit Tower human gates become Needs Dener inbox items', async () => {
  const { buildPagesProjection } = await import('../scripts/build-pages-system.mjs');
  const manifest = {
    authority: 'TOWER_V06',
    projection_only: true,
    writeback: 'FORBIDDEN',
    tower_commit: 'c'.repeat(40),
    event_cursor: '20260919T230000000000Z-human',
    projection_fingerprint: 'sha256:' + 'd'.repeat(64),
    generated_at: '2026-09-20T00:00:00Z',
  };
  const projection = {
    contract: 'NEXO_PUBLIC_PROJECTION_V1',
    manifest,
    event_cursor: manifest.event_cursor,
    work: [{
      id: 'WORK-HUMAN-1',
      title: 'Provider authorization',
      status: 'WAIT_DEPENDENCY',
      priority: 'P0',
      domain: 'ENGINEERING',
      dependency_class: 'HUMAN_AUTH_REQUIRED',
    }],
    tests: [],
    capabilities: {},
    human_gates: { work_ids: ['WORK-HUMAN-1'], count: 1 },
    counts: { active_work: 1, tests: 0, capabilities: 0, needs_dener: 1 },
  };
  const { system } = buildPagesProjection({ projection, manifestFile: manifest });
  assert.equal(system.inbox.length, 1);
  assert.equal(system.inbox[0].id, 'needs-dener:WORK-HUMAN-1');
  assert.equal(system.inbox[0].kind, 'FORNECER_DADO');
  assert.equal(system.inbox[0].domain, 'ENGINEERING');
  assert.match(system.inbox[0].why, /Needs Dener/);
  const workNode = system.graph.nodes.find(node => node.id === 'work:WORK-HUMAN-1');
  assert.ok(workNode);
  assert.equal(workNode.operational_status, 'WAIT_DEPENDENCY');
  assert.equal(workNode.priority, 'P0');
  assert.equal(workNode.dependency_class, 'HUMAN_AUTH_REQUIRED');
  assert.equal(workNode.human_gate, true);
  assert.equal(system.actions.length, 0, 'WORK projection must not impersonate an executable ActionRecord');
});

test('GitHub Pages deploys official artifact and exposes projection readback', async () => {
  const workflow = await text('../.github/workflows/nexo-one-pages.yml');

  assert.match(workflow, /actions\/configure-pages@v5/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /id:\s*pages/);
  assert.match(workflow, /VITE_SYSTEM_ENDPOINT:\s*\$\{\{ steps\.pages\.outputs\.base_path \}\}\/system\.json/);
  assert.match(workflow, /test -s dist\/atlas3d\/index\.html/);
  assert.match(workflow, /GitHub Pages bundle does not contain the repository-root SystemState endpoint/);
  assert.match(workflow, /VITE_WORLD_ENDPOINT:\s*\.\/world-public\.ndjson/);
  assert.match(workflow, /tower-projection\/manifest\.json/);
  assert.match(workflow, /\$\{base\}\/atlas3d\//);
  assert.match(workflow, /<title>NEXO Atlas 3D<\/title>/);
  assert.match(workflow, /data-atlas-renderer="metro-cluster"/);
  assert.match(workflow, /data-atlas-ready="true"/);
  assert.match(workflow, /data-atlas-root-count="3"/);
  assert.match(workflow, /PAGES_ATLAS3D_VISUAL_READBACK_OK/);
  assert.match(workflow, /PAGES_ATLAS2D_PEER51_READBACK_OK/);
  assert.match(workflow, /expand=peer-detection/);
  assert.match(workflow, /Consistência cosmológica · Peer Detection/);
  assert.match(workflow, /data-g6-label-collisions="0"/);
  assert.match(workflow, /data-g6-label-dom-collisions/);
  assert.match(workflow, /viewport-adaptive-v2/);
  assert.match(workflow, /Peer Detection QA must exercise exactly 51 children/);
  assert.match(workflow, /atlas3d-readback-peer-detection-51\.png/);
  assert.match(workflow, /PAGES_ATLAS3D_3D_READBACK_OK visual=neural-synapse/);
  assert.match(workflow, /data-three-visual="neural-synapse"/);
  assert.match(workflow, /three_synapse_count/);
  assert.match(workflow, /three_learning/);
  assert.match(workflow, /data-g6-learning-edges/);
  assert.match(workflow, /atlas3d-production-readback/);
  assert.match(workflow, /PAGES_TOWER_PROJECTION_READBACK_OK/);
  assert.match(workflow, /pages:\s*write/);
  assert.match(workflow, /id-token:\s*write/);
});

test('NEXO ONE is the only workflow allowed to publish the Pages root', async () => {
  const workflowsDir = new URL('../../.github/workflows/', import.meta.url);
  const files = (await readdir(workflowsDir)).filter(name => /\.ya?ml$/.test(name));
  const publishers = [];
  for (const file of files) {
    const body = await readFile(new URL(file, workflowsDir), 'utf8');
    if (/actions\/deploy-pages@v4/.test(body) || /pages:\s*write/.test(body)) publishers.push(file);
  }
  assert.deepEqual(publishers, ['nexo-one-pages.yml']);
});

test('GitHub Pages personal plane reads the locally compiled public WorldState', async () => {
  const hook = await text('src/app/useWorld.ts');
  const workflow = await text('../.github/workflows/nexo-one-pages.yml');
  const builder = await text('scripts/build-pages-system.mjs');

  assert.match(hook, /VITE_WORLD_ENDPOINT/);
  assert.match(hook, /staticProjection\?\(reset\?'reload':'no-cache'\):'no-store'/);
  assert.match(hook, /endsWith\('\.ndjson'\)/);
  assert.doesNotMatch(hook, /fetch\('\/api\/world\?stream=1&refresh=1'/);
  assert.match(workflow, /VITE_WORLD_ENDPOINT:\s*\.\/world-public\.ndjson/);
  assert.match(workflow, /test -s dist\/world-public\.ndjson/);
  assert.match(builder, /world-public\.ndjson/);
  assert.match(builder, /buildPagesProjection/);
  assert.doesNotMatch(workflow, /VITE_WORLD_ENDPOINT:\s*https:\/\/nexo-one-two\.vercel\.app\/api\/world/);
});


test('Pages runtime avoids redundant scheduled deploys and hydrates history concurrently', async () => {
  const workflow = await text('../.github/workflows/nexo-one-pages.yml');
  assert.match(workflow, /cancel-in-progress:\s*true/);
  assert.match(workflow, /id:\s*deploy_needed/);
  assert.match(workflow, /PAGES_NO_OP projection and Pantheon commit already published/);
  assert.match(workflow, /build-meta\.json/);
  assert.match(workflow, /NEXO_ONE_BUILD_META_V1/);
  assert.match(workflow, /xargs -r -P 8/);
  assert.match(workflow, /if: needs\.build\.outputs\.deploy_needed == 'true'/);
  assert.match(workflow, /PAGES_BUILD_META_READBACK_OK/);
});
